// The CRM (dashboard, exports, recordings) is behind a shared-password login page.
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, validSession } from './lib/session.ts';

export const config = { matcher: ['/dashboard/:path*', '/api/export/:path*', '/api/recording/:path*'] };

export async function middleware(req: NextRequest) {
  if (await validSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'login required' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}
