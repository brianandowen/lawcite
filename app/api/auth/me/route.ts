import { NextRequest } from 'next/server';
import { userFromToken, COOKIE } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await userFromToken(req.cookies.get(COOKIE)?.value);
  return Response.json({ user: user ? { username: user.username, displayName: user.display_name, plan: user.plan } : null });
}
