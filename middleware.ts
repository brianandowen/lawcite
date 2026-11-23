// 次要入口關閉時：頁面導回首頁，API 回 404。開關見 lib/flags.ts。
import { NextResponse, type NextRequest } from 'next/server';
import { SHOW_EXTRAS } from '@/lib/flags';

export function middleware(req: NextRequest) {
  if (SHOW_EXTRAS) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.redirect(new URL('/', req.url));
}

export const config = {
  matcher: ['/account/:path*', '/history/:path*', '/pulse/:path*', '/api/auth/:path*', '/api/pulse'],
};
