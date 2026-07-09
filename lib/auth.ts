// 會員與 session：自訂帳號名 + 密碼（bcrypt），httpOnly cookie session，30 天效期。
// plan 欄位為未來付費分級預留（目前一律 free）。
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { sql } from './db';

export type User = { id: number; username: string; display_name: string; plan: string };

export const COOKIE = 'lc_session';

export function validUsername(u: string) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(u);
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function checkPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomUUID() + crypto.randomUUID();
  await sql()`INSERT INTO sessions (token, user_id, expires_at)
    VALUES (${token}, ${userId}, now() + interval '30 days')`;
  return token;
}

export async function destroySession(token: string) {
  await sql()`DELETE FROM sessions WHERE token = ${token}`;
}

export async function userFromToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const rows = (await sql()`
    SELECT u.id, u.username, u.display_name, u.plan
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ${token} AND s.expires_at > now()`) as User[];
  return rows[0] ?? null;
}

// Server Component / Route Handler 共用
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  return userFromToken(jar.get(COOKIE)?.value);
}

export function sessionCookie(token: string) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${
    process.env.NODE_ENV === 'production' ? '; Secure' : ''
  }`;
}
export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
