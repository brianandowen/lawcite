import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { checkPassword, createSession, sessionCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  const rows = (await sql()`
    SELECT id, display_name, password_hash FROM users WHERE username = ${username ?? ''}`) as
    { id: number; display_name: string; password_hash: string }[];
  if (!rows.length || !(await checkPassword(password ?? '', rows[0].password_hash))) {
    return Response.json({ error: '帳號或密碼不正確' }, { status: 401 });
  }
  const token = await createSession(rows[0].id);
  return new Response(JSON.stringify({ ok: true, username, displayName: rows[0].display_name }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(token) },
  });
}
