import Link from 'next/link';
import { db } from '@/lib/db.ts';
import SideNav from './SideNav.tsx';

export const dynamic = 'force-dynamic';

async function overdueCount() {
  const { count } = await db()
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .in('route', ['QUALIFIED', 'ESCALATE', 'MISSED', 'INCOMPLETE'])
    .in('status', ['new', 'claimed'])
    .lt('promise_at', new Date().toISOString());
  return count ?? 0;
}

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const overdue = await overdueCount().catch(() => 0);
  return (
    <div className="app">
      <header className="gheader">
        <Link href="/dashboard" className="brand"><span className="brand-mark">A</span><span className="hide-sm">Aangan CRM</span></Link>
        <form action="/dashboard/calls" className="search-wrap" role="search">
          <input className="input" name="q" placeholder="Search calls by name, area, number…" aria-label="Search" />
        </form>
        <Link href="/" className="btn hide-sm">Website</Link>
        <span className="avatar" title="Studio account">A</span>
      </header>
      <aside className="side" aria-label="CRM navigation">
        <SideNav overdue={overdue} />
        <div className="side-foot">Meera · Vaani AI<br /><a href="/logout">Sign out</a></div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
