import Link from 'next/link';
import { db } from '@/lib/db.ts';
import { fmtIst } from '@/lib/hours.ts';
import { safeQ, sinceFor, type ListParams } from '@/lib/filters.ts';
import { refreshStatuses } from './actions.ts';
import { EmailEvent, PageHead, Empty } from '../ui.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Emails · Aangan CRM' };
const KINDS: Record<string, string> = { handoff: 'Designer handoff', alert: 'Front-desk alert', caller: 'To caller', overdue: 'Overdue reminder', digest: 'Daily digest', test: 'Test' };

export default async function Emails({ searchParams }: { searchParams: Promise<ListParams> }) {
  const sp = await searchParams;
  let q = db().from('emails').select('id, lead_id, kind, to_addresses, subject, status, last_event, created_at, error').gte('created_at', sinceFor(sp.range ?? '30')).order('created_at', { ascending: false }).limit(200);
  if (sp.kind) q = q.eq('kind', sp.kind);
  const term = safeQ(sp.q);
  if (term) q = q.ilike('subject', `%${term}%`);
  const { data, error } = await q;
  const emails = data ?? [];
  const counts = { sent: emails.length, failed: emails.filter((e) => e.status === 'failed').length, opened: emails.filter((e) => ['opened', 'clicked'].includes(e.last_event ?? '')).length };

  return (
    <>
      <PageHead eyebrow="Everything the system emailed" title="Emails">
        <form action={refreshStatuses}><button className="btn">↻ Refresh delivery status</button></form>
      </PageHead>
      <section className="grid g-4" style={{ marginBottom: 14 }}>
        <div className="card"><div className="tile-label">Sent</div><div className="tile-value">{counts.sent}</div></div>
        <div className="card"><div className="tile-label">Opened / clicked</div><div className="tile-value">{counts.opened}</div></div>
        <div className="card"><div className="tile-label">Failed</div><div className="tile-value" style={counts.failed ? { color: 'var(--critical)' } : undefined}>{counts.failed}</div></div>
      </section>
      <form className="toolbar" method="get">
        <input className="input search" name="q" defaultValue={sp.q ?? ''} placeholder="Search subject…" aria-label="Search emails" />
        <select className="input" name="kind" defaultValue={sp.kind ?? ''} aria-label="Type">
          <option value="">All types</option>
          {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input" name="range" defaultValue={sp.range ?? '30'} aria-label="Date range">
          <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option>
        </select>
        <button className="btn btn-primary">Apply</button>
      </form>
      {error && <Empty>Couldn’t load emails: {error.message}</Empty>}
      {!error && emails.length === 0 && <Empty>No emails yet. They appear here as calls come in.</Empty>}
      {emails.length > 0 && (
        <div className="card scroll-x" style={{ padding: 0 }}>
          <table className="data">
            <thead><tr><th>Sent</th><th>Type</th><th>Subject</th><th className="hide-sm">To</th><th>Status</th></tr></thead>
            <tbody>
              {emails.map((e) => (
                <tr key={e.id} className="clickable">
                  <td className="num" style={{ whiteSpace: 'nowrap' }}><Link href={`/dashboard/emails/${e.id}`} className="row-link">{fmtIst(e.created_at)}</Link></td>
                  <td><span className="pill">{KINDS[e.kind] ?? e.kind}</span></td>
                  <td><Link href={`/dashboard/emails/${e.id}`} className="row-link"><b>{e.subject}</b></Link></td>
                  <td className="hide-sm ink-2" style={{ fontSize: 13 }}>{e.to_addresses.join(', ')}</td>
                  <td><EmailEvent event={e.last_event} status={e.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
