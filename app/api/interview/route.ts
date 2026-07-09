import { NextRequest } from 'next/server';
import { interviewNext } from '@/lib/ai';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { description, history } = await req.json();
  if (!description || typeof description !== 'string' || description.length > 500) {
    return Response.json({ error: '請描述你的情況（500 字內）' }, { status: 400 });
  }
  const h = Array.isArray(history) ? history.slice(0, 6) : [];
  try {
    const r = await interviewNext(description, h);
    if (h.length >= 5 && !r.done) {
      return Response.json({ done: true, summary: `${description}。補充事實：${h.map((x: { q: string; a: string }) => `${x.q}：${x.a}`).join('；')}` });
    }
    return Response.json(r);
  } catch (e) {
    console.error(e);
    return Response.json({ error: '診斷服務暫時無法使用' }, { status: 500 });
  }
}
