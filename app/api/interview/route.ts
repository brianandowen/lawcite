import { NextRequest } from 'next/server';
import { interviewNext } from '@/lib/ai';

export const maxDuration = 30;

const DEFAULT_Q = '請問依法我可以如何主張權利？';

// 確保 summary 以明確的法律問句結尾，且整體不超過 /api/ask 的 300 字上限
function finalizeSummary(raw: string) {
  let s = (raw ?? '').toString().replace(/\s+/g, ' ').trim();
  let q = DEFAULT_Q;
  const m = s.match(/[^。！!？?；;]*[？?]\s*$/);
  if (m && m[0].trim().length >= 6) { q = m[0].trim(); s = s.slice(0, m.index).trim(); }
  s = s.replace(/[，,、；;]$/, '');
  const room = 290 - q.length;
  if (s.length > room) s = s.slice(0, room - 1) + '…';
  return `${s}${s && !/[。！!]$/.test(s) ? '。' : ''}${q}`;
}

export async function POST(req: NextRequest) {
  const { description, history } = await req.json();
  if (!description || typeof description !== 'string' || description.length > 500) {
    return Response.json({ error: '請描述你的情況（500 字內）' }, { status: 400 });
  }
  const h = Array.isArray(history) ? history.slice(0, 6) : [];
  try {
    const r = await interviewNext(description, h);
    if (h.length >= 5 && !r.done) {
      const facts = h.map((x: { q: string; a: string }) => `${x.q}：${x.a}`).join('；');
      return Response.json({ done: true, summary: finalizeSummary(`${description}。補充事實：${facts}`) });
    }
    if (r.done) return Response.json({ ...r, summary: finalizeSummary(r.summary) });
    return Response.json(r);
  } catch (e) {
    console.error(e);
    return Response.json({ error: '診斷服務暫時無法使用' }, { status: 500 });
  }
}
