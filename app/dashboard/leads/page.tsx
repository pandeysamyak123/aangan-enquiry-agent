import Link from 'next/link';
import { db } from '@/lib/db.ts';
import { fmtIst } from '@/lib/hours.ts';
import { ROUTE_LABEL, STATUS_LABEL } from '@/lib/metrics.ts';
import { safeQ, sinceFor, qs, type ListParams } from '@/lib/filters.ts';
import { RoutePill, StatusBadge, PageHead, Empty, inr } from '../ui.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Leads · Aangan CRM' };

const BOARD = [
  { key: 'new', label: 'New' }, { key: 'claimed', label: 'Claimed' }, { key: 'called', label: 'Called back' },
  { key: 'booked', label: 'Booked' }, { key: 'consulted', label: 'Consulted' }, { key: 'won', label: 'Won' },
];

export default async function Leads({ searchParams }: { searchParams: Promise<ListParams> }) {
  const sp = await searchParams;
  const view = sp.view === 'table' || sp.view === 'attention' ? sp.view : 'board';
  let q = db().from('leads').select('*').gte('created_at', sinceFor(sp.range ?? '90')).order('created_at', { ascending: false }).limit(300);
  if (sp.route) q = q.eq('route', sp.route);
  else if (view === 'board') q = q.eq('route', 'QUALIFIED');
  if (sp.status) q = q.eq('status', sp.status);
  if (view === 'attention') q = q.in('route', ['QUALIFIED', 'ESCALATE', 'MISSED', 'INCOMPLETE']).in('status', ['new', 'claimed']);
  const term = safeQ(sp.q);
  if (term) q = q.or(`name.ilike.*${term}*,phone.ilike.*${term}*,claimed_by_name.ilike.*${term}*`);
  const { data, error } = await q;
  const leads = (data ?? []) as any[];
  // Latest call per lead, for property / area context.
  const ids = leads.map((l) => l.id);
  const { data: calls } = ids.length ? await db().from('calls').select('lead_id, collected, created_at').in('lead_id', ids).order('created_at', { ascending: false }) : { data: [] as any[] };
  const ctx = new Map<string, any>();
  for (const c of calls ?? []) if (!ctx.has(c.lead_id)) ctx.set(c.lead_id, c.collected ?? {});
  const base = { q: sp.q, route: sp.route, status: sp.status, range: sp.range };
  const where = (l: any) => [ctx.get(l.id)?.property, ctx.get(l.id)?.location_area].filter(Boolean).join(' · ');
  if (view === 'attention') leads.sort((a, b) => new Date(a.promise_at ?? 0).getTime() - new Date(b.promise_at ?? 0).getTime());

  return (
    <>
      <PageHead obj="lead" eyebrow="Callers and where they are in the pipeline" title="Leads">
        <a className="btn" href={`/api/export/leads${qs(base, {})}`}>⬇ Export CSV</a>
      </PageHead>
      <nav className="tabs" aria-label="Lead views">
        <Link href={`/dashboard/leads${qs(base, { view: undefined })}`} aria-current={view === 'board' ? 'true' : undefined}>Pipeline</Link>
        <Link href={`/dashboard/leads${qs(base, { view: 'table' })}`} aria-current={view === 'table' ? 'true' : undefined}>All leads</Link>
        <Link href={`/dashboard/leads${qs({}, { view: 'attention' })}`} aria-current={view === 'attention' ? 'true' : undefined}>Needs attention</Link>
      </nav>

      <form className="toolbar" method="get">
        {view !== 'board' && <input type="hidden" name="view" value={view} />}
        <input className="input search" name="q" defaultValue={sp.q ?? ''} placeholder="Search name, phone, designer…" aria-label="Search leads" />
        {view !== 'attention' && (
          <select className="input" name="route" defaultValue={sp.route ?? ''} aria-label="Route">
            <option value="">{view === 'board' ? 'Qualified' : 'All routes'}</option>
            {Object.entries(ROUTE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
        {view === 'table' && (
          <select className="input" name="status" defaultValue={sp.status ?? ''} aria-label="Status">
            <option value="">Any status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
        <select className="input" name="range" defaultValue={sp.range ?? '90'} aria-label="Date range">
          <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option>
        </select>
        <button className="btn btn-primary">Apply</button>
      </form>

      {error && <Empty>Couldn’t load leads: {error.message}</Empty>}
      {!error && leads.length === 0 && <Empty>{view === 'attention' ? 'Nobody is waiting for a callback. 🎉' : 'No leads match these filters.'}</Empty>}

      {view === 'board' && leads.length > 0 && (
        <div className="board">
          {BOARD.map((col) => {
            const items = leads.filter((l) => l.status === col.key);
            return (
              <section key={col.key} className="col" aria-label={col.label}>
                <h3><span>{col.label}</span><span className="num">{items.length}</span></h3>
                {items.map((l) => (
                  <Link key={l.id} href={`/dashboard/leads/${l.id}`} className="lead-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><b>{l.name ?? 'Caller'}</b>{l.after_hours && <span title="after hours">🌙</span>}</div>
                    <div className="muted" style={{ fontSize: 13 }}>{where(l) || l.phone}</div>
                    <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <StatusBadge status={l.status} promiseAt={l.promise_at} />
                      <span className="muted" style={{ fontSize: 12 }}>{l.claimed_by_name ?? 'unclaimed'}</span>
                    </div>
                    {l.status === 'won' && l.project_value_inr && <div className="num" style={{ fontSize: 13, marginTop: 4 }}>{inr(l.project_value_inr)}</div>}
                  </Link>
                ))}
              </section>
            );
          })}
        </div>
      )}

      {view !== 'board' && leads.length > 0 && (
        <div className="card scroll-x" style={{ padding: 0 }}>
          <table className="data">
            <thead><tr><th>Caller</th><th>Project</th><th>Route</th><th>Status</th><th>Owner</th><th>{view === 'attention' ? 'Promised by' : 'First call'}</th></tr></thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="clickable">
                  <td><Link href={`/dashboard/leads/${l.id}`} className="row-link"><b>{l.name ?? 'Caller'}</b><div className="muted num" style={{ fontSize: 13 }}>{l.phone ?? ''}</div></Link></td>
                  <td className="ink-2" style={{ fontSize: 13 }}>{where(l) || '—'}</td>
                  <td><RoutePill route={l.route} /></td>
                  <td><StatusBadge status={l.status} promiseAt={l.promise_at} /></td>
                  <td>{l.claimed_by_name ?? <span className="muted">Unclaimed</span>}</td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>{fmtIst(view === 'attention' ? l.promise_at : l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
