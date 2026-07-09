// POST /api/ask — NDJSON 串流：retrieval → sentence(逐句) → step → caveat → verdicts → done
// DEMO_MODE=1 時同題直接回放 qa_logs 快取（含逐句節奏），現場斷網保險。
import { NextRequest } from 'next/server';
import { retrieve } from '@/lib/retrieval';
import { generateStream, verifyCitations, type Sentence, type Step, type Verdict } from '@/lib/ai';
import { sql } from '@/lib/db';
import { userFromToken, COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  const { question, evalMode } = await req.json();
  if (!question || typeof question !== 'string' || question.length > 300) {
    return new Response(JSON.stringify({ error: '請輸入 300 字以內的問題' }), { status: 400 });
  }
  const user = await userFromToken(req.cookies.get(COOKIE)?.value);

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      // 連線關閉（含瀏覽器取消請求）後，所有寫入靜默忽略，避免 ERR_INVALID_STATE
      const send = (obj: unknown) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n')); }
        catch { closed = true; }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch {}
      };
      try {
        // Demo 快取回放
        if (process.env.DEMO_MODE === '1' && !evalMode) {
          const cached = (await sql()`
            SELECT result FROM qa_logs WHERE question = ${question} AND result ? 'sentences'
            ORDER BY created_at DESC LIMIT 1`) as { result: Record<string, unknown> }[];
          if (cached.length) {
            const r = cached[0].result as {
              articles: unknown[]; categories: string[]; sentences: Sentence[];
              steps: Step[]; caveat: string; verdicts: Verdict[]; score: number;
            };
            send({ type: 'retrieval', articles: r.articles, categories: r.categories ?? [], topScore: 1 });
            for (const s of r.sentences) { await wait(350); send({ type: 'sentence', sentence: s }); }
            for (const st of r.steps ?? []) send({ type: 'step', step: st });
            if (r.caveat) send({ type: 'caveat', text: r.caveat });
            send({ type: 'gen_done', engine: 'cache' });
            await wait(500);
            send({ type: 'verdicts', verdicts: r.verdicts, score: r.score });
            send({ type: 'done' });
            close();
            return;
          }
        }

        // ① 檢索
        send({ type: 'trace', text: `讀取問題「${question.slice(0, 40)}${question.length > 40 ? '…' : ''}」` });
        const r = await retrieve(question);
        if (r.condensed) send({ type: 'trace', text: `改寫為法條語言：「${r.condensed}」` });
        if (r.categories.length) send({ type: 'trace', text: `領域路由 → ${r.categories.join('、')}` });
        if (!r.refused) send({ type: 'trace', text: `關鍵詞命中 ${r.kwCount ?? 0} 條 · 向量檢索取回 ${r.articles.length} 條（最高相似度 ${r.topScore.toFixed(2)}）` });
        const articlesPayload = r.articles.map((a) => ({
          law_name: a.law_name, article_no: a.article_no,
          chapter_path: a.chapter_path, content: a.content,
          score: Number(a.score?.toFixed(3)),
        }));
        send({ type: 'retrieval', articles: articlesPayload, categories: r.categories, directHits: r.directHits, topScore: Number(r.topScore.toFixed(3)), condensed: r.condensed });

        if (r.refused) {
          send({ type: 'refuse', message: r.refusedReason === 'criminal'
            ? '這個問題涉及刑事責任。刑責認定涉及構成要件判斷、錯誤風險高，本系統明訂不涵蓋刑事法，建議諮詢專業律師、法律扶助基金會，或撥打法務部法律諮詢專線。'
            : '這看起來不是本系統涵蓋的法律問題。本系統回答民事、程序救濟、勞動與生活家事相關問題——描述你遇到的糾紛或想了解的權利，或試試「案件診斷」。' });
          try {
            await sql()`INSERT INTO qa_logs (question, result, user_id) VALUES (${question}, ${JSON.stringify({ refused: true, categories: r.categories })}::jsonb, ${user?.id ?? null})`;
          } catch {}
          close();
          return;
        }
        if (evalMode) { send({ type: 'done' }); close(); return; }

        // ② 生成：逐句串流轉發
        const sentences: Sentence[] = [];
        const steps: Step[] = [];
        let caveat = '';
        send({ type: 'trace', text: '生成引擎啟動（Gemini），逐句附引用…' });
        const gen = await generateStream(question, r.articles, (ev) => {
          if (ev.t === 's') { sentences.push({ text: ev.text, cite: ev.cite }); send({ type: 'sentence', sentence: { text: ev.text, cite: ev.cite } }); }
          else if (ev.t === 'step') { const st = { name: ev.name, cite: ev.cite, detail: ev.detail, condition: ev.condition }; steps.push(st); send({ type: 'step', step: st }); }
          else if (ev.t === 'caveat') { caveat = ev.text; send({ type: 'caveat', text: ev.text }); }
        }, (thought) => send({ type: 'trace', text: `模型思考：${thought}`, thought: true }));
        send({ type: 'gen_done', engine: gen.engine });
        if (sentences.length > 0) send({ type: 'trace', text: `生成完成（${gen.engine}），交由 GPT-4o-mini 獨立審查 ${sentences.length} 句…` });

        if (sentences.length === 0) {
          send({ type: 'refuse', message: caveat || '檢索到的法條無法回答此問題，建議換個問法或諮詢專業人士。' });
          close();
          return;
        }

        // ③ 驗證（跨模型）
        const findArticle = (cite: string) =>
          r.articles.find((a) => cite === a.law_name + a.article_no) ??
          r.articles.find((a) => cite.includes(a.article_no) && cite.includes(a.law_name));
        const pairs = sentences.map((s, idx) => {
          const art = findArticle(s.cite);
          return { idx, claim: s.text, article: art ? `${art.law_name}${art.article_no}：${art.content}` : '（找不到對應條文）' };
        });
        let verdicts: Verdict[] = [];
        try {
          verdicts = await verifyCitations(pairs);
        } catch (e) {
          console.error('[verify]', e);
          verdicts = pairs.map((p) => ({ idx: p.idx, verdict: 'PARTIAL', reason: '驗證服務暫時無法使用' }));
        }
        for (const p of pairs) {
          if (p.article.startsWith('（找不到')) {
            const v = verdicts.find((v) => v.idx === p.idx);
            if (v) { v.verdict = 'UNSUPPORTED'; v.reason = '引用的條文不在檢索結果中'; v.quote = ''; }
          }
        }
        const score = Math.round(
          (verdicts.reduce((acc, v) => acc + (v.verdict === 'SUPPORTED' ? 1 : v.verdict === 'PARTIAL' ? 0.5 : 0), 0) / sentences.length) * 100,
        );
        const nOk = verdicts.filter((v) => v.verdict === 'SUPPORTED').length;
        const nBad = verdicts.filter((v) => v.verdict === 'UNSUPPORTED').length;
        send({ type: 'trace', text: `審查完成：${nOk} 句完整支撐${nBad ? `、${nBad} 句遭攔截` : ''}，可信度 ${score}/100` });
        send({ type: 'verdicts', verdicts, score });

        try {
          await sql()`INSERT INTO qa_logs (question, result, user_id) VALUES (${question}, ${JSON.stringify({
            articles: articlesPayload, categories: r.categories, sentences, steps, caveat, verdicts, score,
          })}::jsonb, ${user?.id ?? null})`;
        } catch (e) { console.error('[log]', e); }

        send({ type: 'done' });
      } catch (e) {
        console.error(e);
        send({ type: 'error', message: '系統暫時無法處理，請稍後再試。' });
      } finally {
        close();
      }
    },
    cancel() { closed = true; },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
