import { NextRequest } from 'next/server';
import { destroySession, clearCookie, COOKIE } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (token) await destroySession(token).catch(() => {});
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearCookie },
  });
}
