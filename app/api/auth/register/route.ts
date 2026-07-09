import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { hashPassword, createSession, sessionCookie, validUsername } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { username, password, displayName } = await req.json();
  if (!validUsername(username ?? '')) {
    return Response.json({ error: '帳號需為 3~20 字的英數或底線' }, { status: 400 });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return Response.json({ error: '密碼至少 8 個字元' }, { status: 400 });
  }
  const exists = (await sql()`SELECT 1 FROM users WHERE username = ${username}`) as unknown[];
  if (exists.length) return Response.json({ error: '這個帳號已被使用' }, { status: 409 });

  const hash = await hashPassword(password);
  const name = (displayName || username).toString().slice(0, 30);
  const rows = (await sql()`
    INSERT INTO users (username, display_name, password_hash)
    VALUES (${username}, ${name}, ${hash}) RETURNING id`) as { id: number }[];
  const token = await createSession(rows[0].id);
  return new Response(JSON.stringify({ ok: true, username, displayName: name }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(token) },
  });
}
