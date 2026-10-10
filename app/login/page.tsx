import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import crypto from 'node:crypto';
import { makeSession, SESSION_COOKIE, SESSION_DAYS } from '@/lib/session.ts';

export const metadata = { title: 'Sign in · Aangan CRM' };

async function signIn(formData: FormData) {
  'use server';
  const pass = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/dashboard');
  const expected = process.env.DASHBOARD_PASSWORD ?? '';
  const a = crypto.createHash('sha256').update(pass).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!expected || !crypto.timingSafeEqual(a, b)) redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  (await cookies()).set(SESSION_COOKIE, await makeSession(), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400 });
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form action={signIn} className="card" style={{ width: '100%', maxWidth: 380 }}>
        <Link href="/" className="brand" style={{ marginBottom: 18 }}><span className="brand-mark">A</span>Aangan CRM</Link>
        <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>Sign in</h1>
        <p className="ink-2" style={{ margin: '0 0 16px', fontSize: 14 }}>Enter the studio password to see calls, leads and emails.</p>
        <label htmlFor="password" style={{ fontSize: 13, fontWeight: 600 }}>Password</label>
        <input id="password" name="password" type="password" autoFocus required autoComplete="current-password" className="input" style={{ marginTop: 6 }} />
        <input type="hidden" name="next" value={sp.next ?? '/dashboard'} />
        {sp.error && <p role="alert" style={{ color: 'var(--critical)', fontSize: 14, margin: '10px 0 0' }}>⚠ That password didn’t match.</p>}
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16, padding: 11 }}>Sign in</button>
        <p className="muted" style={{ fontSize: 12, margin: '12px 0 0' }}>You’ll stay signed in on this device for {SESSION_DAYS} days.</p>
      </form>
    </main>
  );
}
