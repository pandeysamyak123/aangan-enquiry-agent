// Nikhil's dashboard sits behind HTTP Basic auth (username "aangan", password DASHBOARD_PASSWORD).
import { NextResponse, type NextRequest } from 'next/server';

export const config = { matcher: ['/dashboard/:path*'] };

export function middleware(req: NextRequest) {
  // Local development only: `next dev` on localhost skips the prompt. Production always requires it.
  if (process.env.NODE_ENV === 'development' && ['localhost', '127.0.0.1'].includes(req.nextUrl.hostname)) return NextResponse.next();
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return new NextResponse('Dashboard password not configured', { status: 503 });
  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    const [user, pass] = atob(header.slice(6)).split(':');
    if (user === 'aangan' && pass === expected) return NextResponse.next();
  }
  return new NextResponse('Authentication required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Aangan dashboard"' } });
}
