import Link from 'next/link';
import { db } from '@/lib/db.ts';
import { fmtIst } from '@/lib/hours.ts';
import { ROUTE_LABEL } from '@/lib/metrics.ts';
import { safeQ, sinceFor, qs, type ListParams } from '@/lib/filters.ts';
import { RoutePill, PageHead, clock, inr, Empty } from '../ui.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Calls · Aangan CRM' };
const PAGE = 50;

export default async function Calls({ searchParams }: { searchParams: Promise<ListParams> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  let q = db().from('calls').select('id, lead_id, route, decline_reason, mismatch, after_hours, duration_sec, cost_paise, summary, collected, flags, created_at, recording_url', { count: 'exact' })
    .gte('created_at', sinceFor(sp.range)).order('created_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.route) q = q.eq('route', sp.route);
  if (sp.after === '1') q = q.eq('after_hours', true);
  if (sp.flag === 'review') q = q.eq('mismatch', true);
  const term = safeQ(sp.q);
  if (term) q = q.or(`summary.ilike.*${term}*,collected->>caller_name.ilike.*${term}*,collected->>location_area.ilike.*${term}*,collected->>callback_number.ilike.*${term}*,collected->>scope.ilike.*${term}*`);
  const { data, count, error } = await q;
  const calls = data ?? [];
  const base = { q: sp.q, route: sp.route, range: sp.range, after: sp.after, flag: sp.flag };

  return (
    <>
      <PageHead obj="call" eyebrow="Every call Meera answered" title="Calls">
        <a className="btn" href={`/api/export/calls${qs(base, {})}`}>⬇ Export CSV</a>
      </PageHead>

      <form className="toolbar" method="get">
        <input className="input search" name="q" defaultValue={sp.q ?? ''} placeholder="Search name, area, number, scope, summary…" aria-label="Search calls" />
        <select className="input" name="route" defaultValue={sp.route ?? ''} aria-label="Outcome">
          <option value="">All outcomes</option>
          {Object.entries(ROUTE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input" name="range" defaultValue={sp.range ?? '30'} aria-label="Date range">
          <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option>
        </select>
        <select className="input" name="after" defaultValue={sp.after ?? ''} aria-label="Time of day">
          <option value="">Any time</option><option value="1">After hours only</option>
        </select>
        <select className="input" name="flag" defaultValue={sp.flag ?? ''} aria-label="Flags">
          <option value="">All</option><option value="review">Needs review</option>
        </select>
        <button className="btn btn-primary">Apply</button>
        {(sp.q || sp.route || sp.after || sp.flag || (sp.range && sp.range !== '30')) && <Link href="/dashboard/calls" className="btn">Clear</Link>}
      </form>

      {error && <Empty>Couldn’t load calls: {error.message}</Empty>}
      {!error && calls.length === 0 && <Empty>No calls match these filters.</Empty>}
      {calls.length > 0 && (
        <div className="card scroll-x" style={{ padding: 0 }}>
          <table className="data">
            <thead><tr><th>When</th><th>Caller</th><th>Outcome</th><th className="hide-sm">Summary</th><th className="num">Length</th><th className="num">Cost</th></tr></thead>
            <tbody>
              {calls.map((c: any) => (
                <tr key={c.id} className="clickable">
                  <td className="num" style={{ whiteSpace: 'nowrap' }}><Link href={`/dashboard/calls/${c.id}`} className="row-link">{fmtIst(c.created_at)}</Link>{c.after_hours && <div className="muted" style={{ fontSize: 12 }}>🌙 after hours</div>}</td>
                  <td><Link href={`/dashboard/calls/${c.id}`} className="row-link"><b>{c.collected?.caller_name ?? '—'}</b><div className="muted num" style={{ fontSize: 13 }}>{c.collected?.callback_number ?? ''}</div><div className="muted" style={{ fontSize: 13 }}>{[c.collected?.property, c.collected?.location_area].filter(Boolean).join(' · ')}</div></Link></td>
                  <td><RoutePill route={c.route} />{c.mismatch && <div className="status" style={{ color: 'var(--critical)', fontSize: 12, marginTop: 3 }}>⚠ Needs review</div>}{String(c.collected?.pricing_asked) === 'true' && <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>asked price</div>}</td>
                  <td className="hide-sm ink-2" style={{ fontSize: 13, maxWidth: 420 }}><Link href={`/dashboard/calls/${c.id}`} className="row-link">{c.summary ?? '—'}</Link></td>
                  <td className="num">{clock(c.duration_sec)}</td>
                  <td className="num">{inr((c.cost_paise ?? 0) / 100, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="toolbar" style={{ justifyContent: 'space-between', marginTop: 12 }}>
        <span className="muted">{count ?? 0} call{count === 1 ? '' : 's'}</span>
        <span style={{ display: 'flex', gap: 8 }}>
          {page > 1 && <Link className="btn" href={`/dashboard/calls${qs({ ...base, page: String(page - 1) }, {})}`}>← Newer</Link>}
          {(count ?? 0) > page * PAGE && <Link className="btn" href={`/dashboard/calls${qs({ ...base, page: String(page + 1) }, {})}`}>Older →</Link>}
        </span>
      </div>
    </>
  );
}
