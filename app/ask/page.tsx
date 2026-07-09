'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { DEADLINES } from '@/lib/deadlines';

type Article = { law_name: string; article_no: string; chapter_path: string; content: string; score?: number };
type Sentence = { text: string; cite: string };
type Step = { name: string; cite: string; detail: string; condition?: string };
type Verdict = { idx: number; verdict: 'SUPPORTED' | 'PARTIAL' | 'UNSUPPORTED'; reason: string; quote?: string };
type PastQA = { q: string; sentences: Sentence[]; verdicts: Verdict[]; score: number | null; refuse: string };

const SAMPLES = [
  '房東不退押金怎麼辦？',
  '加班費怎麼算才合法？',
  '網購後悔可以退貨嗎？',
  '收到交通罰單不服怎麼救濟？',
  '民法第184條在講什麼？',
];

const BADGE: Record<Verdict['verdict'], { cls: string; label: string }> = {
  SUPPORTED: { cls: 'badge-ok', label: '已驗證' },
  PARTIAL: { cls: 'badge-part', label: '部分支撐' },
  UNSUPPORTED: { cls: 'badge-bad', label: '無法支撐' },
};

function useCountUp(target: number | null) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target === null) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 800);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return target === null ? null : v;
}

function markQuote(content: string, quote?: string) {
  if (!quote || !content.includes(quote)) return content;
  const parts = content.split(quote);
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <mark className="quote-mark">{quote}</mark>}
        </span>
      ))}
    </>
  );
}

export default function AskPage() {
  return (
    <Suspense>
      <AskConsole />
    </Suspense>
  );
}

function AskConsole() {
  const [q, setQ] = useState('');
  const [stage, setStage] = useState(0); // 0 待命 1 檢索 2 生成 3 驗證 4 完成
  const [articles, setArticles] = useState<Article[]>([]);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [meta, setMeta] = useState<{ categories: string[]; topScore: number; condensed?: string } | null>(null);
  const [caveat, setCaveat] = useState('');
  const [refuse, setRefuse] = useState('');
  const [error, setError] = useState('');
  const [hl, setHl] = useState('');
  const [traces, setTraces] = useState<{ text: string; thought?: boolean }[]>([]);
  const [thread, setThread] = useState<PastQA[]>([]);
  const [fromDiagnose, setFromDiagnose] = useState(false);
  const [glass, setGlass] = useState(false);
  const [ddOpen, setDdOpen] = useState<string>(''); // 展開時效面板的 cite
  const [ddDate, setDdDate] = useState('');
  const [letterOpen, setLetterOpen] = useState(false);
  const busy = stage > 0 && stage < 4;
  const sourceRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const displayScore = useCountUp(score);

  // 從案件診斷或首頁提問框導入
  const searchParams = useSearchParams();
  useEffect(() => {
    const dq = sessionStorage.getItem('lc_diagnose_q');
    if (dq) { sessionStorage.removeItem('lc_diagnose_q'); setFromDiagnose(true); ask(dq); return; }
    const uq = searchParams.get('q');
    if (uq) ask(uq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    // 把上一題收進歷史串
    if (sentences.length > 0 || refuse) {
      setThread((t) => [{ q, sentences, verdicts, score, refuse }, ...t].slice(0, 10));
    }
    setQ(question); setStage(1); setTraces([]);
    setArticles([]); setSentences([]); setSteps([]); setVerdicts([]); setScore(null);
    setMeta(null); setCaveat(''); setRefuse(''); setError(''); setHl(''); setDdOpen(''); setLetterOpen(false);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      if (!res.ok || !res.body) throw new Error(String(res.status));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === 'trace') setTraces((t) => [...t, { text: ev.text, thought: ev.thought }]);
          else if (ev.type === 'retrieval') { setArticles(ev.articles); setMeta({ categories: ev.categories ?? [], topScore: ev.topScore, condensed: ev.condensed }); setStage(2); }
          else if (ev.type === 'sentence') setSentences((s) => [...s, ev.sentence]);
          else if (ev.type === 'step') setSteps((s) => [...s, ev.step]);
          else if (ev.type === 'caveat') setCaveat(ev.text);
          else if (ev.type === 'gen_done') setStage(3);
          else if (ev.type === 'verdicts') { setVerdicts(ev.verdicts); setScore(ev.score); }
          else if (ev.type === 'refuse') { setRefuse(ev.message); setStage(4); }
          else if (ev.type === 'error') { setError(ev.message); setStage(4); }
          else if (ev.type === 'done') setStage(4);
        }
      }
      setStage(4);
    } catch {
      setError('連線失敗，請確認伺服器狀態後再試一次。');
      setStage(4);
    }
  }

  function hoverCite(cite: string) {
    setHl(cite);
    sourceRefs.current[cite]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  const verdictOf = (i: number) => verdicts.find((v) => v.idx === i);
  const quoteFor = (cite: string) => {
    if (!glass || hl !== cite) return undefined;
    const i = sentences.findIndex((s) => s.cite === cite && s.cite === hl);
    return verdictOf(i)?.quote;
  };

  // 已驗證（綠 + 黃）條文，供存證信函引用
  const verifiedArticles = sentences
    .map((s, i) => ({ s, v: verdictOf(i) }))
    .filter((x) => x.v && x.v.verdict !== 'UNSUPPORTED')
    .map((x) => {
      const a = articles.find((a) => a.law_name + a.article_no === x.s.cite);
      return a ? { cite: x.s.cite, content: a.content } : null;
    })
    .filter((x): x is { cite: string; content: string } => !!x)
    .filter((x, i, arr) => arr.findIndex((y) => y.cite === x.cite) === i);

  return (
    <main className="console">
      <div className="console-head">
        <p className="section-eyebrow">ASK</p>
        <h1 className="section-title">提出你的法律問題</h1>
      </div>

      <form className="ask-form" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input className="ask-input" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="例如：房東不退押金怎麼辦？" maxLength={300} disabled={busy} />
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '處理中' : '提問'}</button>
      </form>
      <div className="chips">
        {SAMPLES.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => ask(s)} disabled={busy}>{s}</button>
        ))}
        <a className="chip chip-link" href="/diagnose">不知道怎麼問？→ 案件診斷</a>
      </div>

      {fromDiagnose && <span className="diag-note">此提問由案件診斷整理而成</span>}
      {stage > 0 && (
        <div className="stages" aria-live="polite">
          {['檢索條文', '生成回答', '逐句驗證'].map((name, i) => {
            const n = i + 1;
            const cls = stage > n || stage === 4 ? 'done' : stage === n ? 'active' : '';
            return <span key={name} className={`stage ${cls}`}><span className="stage-dot" />{name}</span>;
          })}
        </div>
      )}
      {traces.length > 0 && (
        <div className="trace-panel" aria-live="polite">
          {traces.map((t, i) => (
            <span key={i} className={`trace-line ${t.thought ? 'thought' : ''}`}>{t.text}</span>
          ))}
          {busy && <span className="typing-dot">▍</span>}
        </div>
      )}

      {refuse && (
        <div className="refuse-card">
          <h2 className="refuse-title"><span>超出範圍</span>——本系統選擇不回答</h2>
          <p className="refuse-body">{refuse}</p>
          <div className="refuse-actions">
            <Link href="/diagnose" className="btn">改用案件診斷</Link>
            <button type="button" className="chip" onClick={() => ask('房東不退押金怎麼辦？')}>看一個範例提問</button>
          </div>
        </div>
      )}
      {error && (
        <div className="refuse-card">
          <h2 className="refuse-title"><span>發生錯誤</span></h2>
          <p className="refuse-body">{error}</p>
        </div>
      )}

      {(sentences.length > 0 || stage >= 2) && !refuse && !error && (
        <div className="result">
          <div>
            <div className="answer-panel">
              <div className="panel-head">
                <span>ANSWER · 逐句驗證</span>
                <span className="trust">
                  <button className={`glass-toggle ${glass ? 'on' : ''}`} onClick={() => setGlass(!glass)}
                    title="打開玻璃箱：檢視驗證依據">檢驗室</button>
                  {displayScore !== null && <span className="trust-num">{displayScore} / 100</span>}
                  <span className={`trust-seal ${score !== null ? 'stamped' : ''}`}>驗</span>
                </span>
              </div>
              <div className="answer-body">
                {sentences.map((s, i) => {
                  const v = verdictOf(i);
                  const b = v ? BADGE[v.verdict] : null;
                  const dd = DEADLINES[s.cite];
                  return (
                    <span key={i} className={`sentence ${hl === s.cite ? 'hl' : ''}`}
                      onMouseEnter={() => hoverCite(s.cite)} onMouseLeave={() => setHl('')}
                      onClick={() => (hl === s.cite ? setHl('') : hoverCite(s.cite))}>
                      {s.text}
                      <span className={`badge flip ${b ? b.cls : 'badge-wait'}`} key={v ? 'v' + i : 'w' + i}>
                        {s.cite}｛{b ? b.label : '驗證中'}｝
                      </span>
                      {dd && v && (
                        <button className="dd-btn" onClick={() => { setDdOpen(ddOpen === s.cite ? '' : s.cite); setDdDate(''); }}>
                          計算我的期限
                        </button>
                      )}
                      {v && glass && v.reason && <span className="reason">審查理由：{v.reason}</span>}
                      {v && !glass && v.verdict !== 'SUPPORTED' && <span className="reason">{v.reason}</span>}
                      {dd && ddOpen === s.cite && (
                        <DeadlinePanel cite={s.cite} date={ddDate} setDate={setDdDate} />
                      )}
                    </span>
                  );
                })}
                {stage === 2 && <span className="typing-dot">▍</span>}
                {caveat && <p className="caveat">{caveat}</p>}
              </div>
            </div>

            {steps.length > 0 && (
              <div className="steps-panel">
                <p className="steps-title">行動路徑</p>
                <div className="steps-track">
                  {steps.map((st, i) => (
                    <div className="step-node" key={i}>
                      <div className="step-index">{i + 1}</div>
                      <div className="step-body">
                        <p className="step-name">{st.name}</p>
                        {st.condition && <p className="step-cond">{st.condition}</p>}
                        <p className="step-detail">{st.detail}</p>
                        <button className="step-cite" onMouseEnter={() => hoverCite(st.cite)} onMouseLeave={() => setHl('')}>
                          {st.cite}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {score !== null && verifiedArticles.length > 0 && (
              <div className="after-actions">
                <button className="btn" onClick={() => setLetterOpen(true)}>產生存證信函草稿</button>
                <span className="after-hint">僅引用驗證通過的 {verifiedArticles.length} 條法條</span>
              </div>
            )}
          </div>

          <aside className="sources-panel">
            {glass && meta && (
              <div className="glass-meta">
                {meta.condensed && <p>查詢濃縮：{meta.condensed}</p>}
                <p>領域路由：{meta.categories.join('、') || '全庫'}</p>
                <p>最高相似度：{meta.topScore?.toFixed(3)}</p>
                <p>候選條文 {articles.length} 條，依相似度排序</p>
              </div>
            )}
            {articles.map((a) => {
              const cite = a.law_name + a.article_no;
              return (
                <div key={cite + a.content.slice(0, 12)}
                  ref={(el) => { sourceRefs.current[cite] = el; }}
                  className={`source-card ${hl === cite ? 'hl' : ''}`}
                  onClick={() => setHl(hl === cite ? '' : cite)}>
                  <div className="source-head">
                    <span className="source-cite">{a.law_name} {a.article_no}</span>
                    {typeof a.score === 'number' && a.score < 1 && (
                      <span className="source-cat">
                        {glass ? <span className="score-bar"><span style={{ width: `${Math.min(100, a.score * 100)}%` }} /></span> : null}
                        相似度 {a.score.toFixed(2)}
                      </span>
                    )}
                  </div>
                  {a.chapter_path && <p className="source-path">{a.chapter_path}</p>}
                  <p className="source-text">{markQuote(a.content, quoteFor(cite))}</p>
                </div>
              );
            })}
            {stage === 1 && articles.length === 0 && (
              <p style={{ color: 'var(--muted)' }}>正在 3,731 條條文中檢索…</p>
            )}
          </aside>
        </div>
      )}

      {letterOpen && (
        <LetterModal question={q} articles={verifiedArticles} onClose={() => setLetterOpen(false)} />
      )}

      {thread.length > 0 && (
        <div className="thread">
          <p className="thread-title">本次的其他提問</p>
          {thread.map((p, i) => (
            <details key={i}>
              <summary>
                <span>{p.q}</span>
                <span className="thread-score">{p.refuse ? '已拒答' : p.score !== null ? `可信度 ${p.score}/100` : ''}</span>
              </summary>
              <div className="thread-body">
                {p.refuse && <p style={{ color: 'var(--muted)' }}>{p.refuse}</p>}
                {p.sentences.map((s2, j) => {
                  const v = p.verdicts.find((v) => v.idx === j);
                  const b = v ? BADGE[v.verdict] : null;
                  return (
                    <span className="thread-s" key={j}>
                      {s2.text}
                      {b && <span className={`badge ${b.cls}`}>{s2.cite}｛{b.label}｝</span>}
                    </span>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      )}
    </main>
  );
}

// ---------- 時效倒數 ----------
function DeadlinePanel({ cite, date, setDate }: { cite: string; date: string; setDate: (s: string) => void }) {
  const rule = DEADLINES[cite];
  let deadline: Date | null = null, left = 0;
  if (date) {
    deadline = new Date(date);
    if (rule.unit === 'day') deadline.setDate(deadline.getDate() + rule.days);
    else deadline.setFullYear(deadline.getFullYear() + rule.days);
    left = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
  }
  const tone = left <= 3 ? 'var(--bad)' : left <= (rule.unit === 'day' ? rule.days / 2 : 60) ? 'var(--part)' : 'var(--ok)';

  function downloadIcs() {
    if (!deadline) return;
    const d = deadline.toISOString().slice(0, 10).replace(/-/g, '');
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//LawCite//TW\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:${d}\nSUMMARY:法律期限：${cite}\nDESCRIPTION:${rule.note}（律證 LawCite 計算，請自行再確認）\nEND:VEVENT\nEND:VCALENDAR`;
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url; a.download = `deadline-${cite}.ics`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <span className="dd-panel" onMouseEnter={(e) => e.stopPropagation()}>
      <span className="dd-from">{rule.from}：</span>
      <input type="date" className="dd-date" value={date} onChange={(e) => setDate(e.target.value)} />
      {deadline && (
        <span className="dd-result" style={{ color: tone }}>
          截止 {deadline.toLocaleDateString('zh-TW')} · {left >= 0 ? `剩 ${left} 天` : `已逾期 ${-left} 天`}
          <button className="dd-ics" onClick={downloadIcs}>加入行事曆</button>
        </span>
      )}
      <span className="dd-note">{rule.note}</span>
    </span>
  );
}

// ---------- 存證信函 ----------
function LetterModal({ question, articles, onClose }: {
  question: string; articles: { cite: string; content: string }[]; onClose: () => void;
}) {
  const [f, setF] = useState({ sender: '', recipient: '', address: '', amount: '', eventDate: '', extra: '' });
  const [letter, setLetter] = useState<{ title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function gen(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const res = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, facts: f, articles }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || '發生錯誤'); return; }
      setLetter(d);
    } catch { setErr('連線失敗'); } finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {!letter ? (
          <>
            <h2 className="modal-title">存證信函草稿</h2>
            <p className="modal-sub">法律依據將只引用剛才驗證通過的條文：{articles.map((a) => a.cite).join('、')}</p>
            <form onSubmit={gen} className="letter-form">
              <input className="ask-input" placeholder="你的姓名" value={f.sender} onChange={(e) => setF({ ...f, sender: e.target.value })} required />
              <input className="ask-input" placeholder="對方姓名或公司" value={f.recipient} onChange={(e) => setF({ ...f, recipient: e.target.value })} required />
              <input className="ask-input" placeholder="對方地址" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} required />
              <input className="ask-input" placeholder="金額或標的（例如：押金 16,000 元）" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required />
              <input className="ask-input" type="date" value={f.eventDate} onChange={(e) => setF({ ...f, eventDate: e.target.value })} required />
              <textarea className="ask-input" rows={2} placeholder="補充事實（選填）" value={f.extra} onChange={(e) => setF({ ...f, extra: e.target.value })} />
              {err && <p className="account-err">{err}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" disabled={busy} type="submit">{busy ? '撰寫中' : '生成草稿'}</button>
                <button className="btn" type="button" onClick={onClose}>取消</button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div className="letter-paper" id="letter-print">
              <p className="letter-watermark">草稿 · 寄出前請確認內容</p>
              <h3 className="letter-title">{letter.title}</h3>
              {letter.body.split('\n\n').map((p, i) => <p className="letter-p" key={i}>{p}</p>)}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" onClick={() => window.print()}>列印</button>
              <button className="btn" onClick={() => navigator.clipboard.writeText(`${letter.title}\n\n${letter.body}`)}>複製全文</button>
              <button className="btn" onClick={onClose}>關閉</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
