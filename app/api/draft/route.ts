import { NextRequest } from 'next/server';
import { draftLetter } from '@/lib/ai';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { question, facts, articles } = await req.json();
  if (!facts?.recipient || !Array.isArray(articles) || articles.length === 0) {
    return Response.json({ error: '缺少必要資料' }, { status: 400 });
  }
  try {
    const letter = await draftLetter({ question: question ?? '', facts, articles: articles.slice(0, 6) });
    return Response.json(letter);
  } catch (e) {
    console.error(e);
    return Response.json({ error: '草稿服務暫時無法使用' }, { status: 500 });
  }
}
