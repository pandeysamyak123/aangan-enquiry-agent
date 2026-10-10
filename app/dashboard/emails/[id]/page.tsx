import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db.ts';
import { fmtIst } from '@/lib/hours.ts';
import { refreshStatuses } from '../actions.ts';
import { EmailEvent, BackLink } from '../../ui.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Email · Aangan CRM' };

export default async function EmailDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: e } = await db().from('emails').select('*').eq('id', id).single();
  if (!e) notFound();
  return (
    <>
      <BackLink href="/dashboard/emails" label="All emails" />
      <div className="page-head" style={{ marginTop: 8 }}>
        <div><div className="eyebrow">{e.kind} · {fmtIst(e.created_at)}</div><h1 style={{ fontSize: 20 }}>{e.subject}</h1></div>
        {e.resend_id && <form action={refreshStatuses}><input type="hidden" name="resendId" value={e.resend_id} /><button className="btn">↻ Refresh status</button></form>}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
        <section className="card">
          <dl className="kv">
            <dt>To</dt><dd>{e.to_addresses.join(', ')}</dd>
            <dt>Status</dt><dd><EmailEvent event={e.last_event} status={e.status} />{e.last_event_at ? <span className="muted"> · checked {fmtIst(e.last_event_at)}</span> : null}</dd>
            {e.error && <><dt>Error</dt><dd style={{ color: 'var(--critical)' }}>{e.error}</dd></>}
            {e.resend_id && <><dt>Resend id</dt><dd className="num" style={{ fontSize: 12 }}>{e.resend_id}</dd></>}
            {e.lead_id && <><dt>Lead</dt><dd><Link href={`/dashboard/leads/${e.lead_id}`}>Open lead →</Link></dd></>}
            {e.call_id && <><dt>Call</dt><dd><Link href={`/dashboard/calls/${e.call_id}`}>Open call →</Link></dd></>}
          </dl>
        </section>
        <section className="card" style={{ padding: 0, overflow: 'hidden', gridColumn: '1 / -1' }}>
          <div className="eyebrow" style={{ padding: '12px 16px 0' }}>Preview</div>
          {/* Sandboxed: email HTML can't run scripts or reach the CRM. */}
          <iframe title="Email preview" sandbox="" srcDoc={e.html ?? '<p>No preview stored.</p>'} style={{ width: '100%', height: 720, border: 0, background: '#fff' }} />
        </section>
      </div>
    </>
  );
}
