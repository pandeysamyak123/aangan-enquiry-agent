import Link from 'next/link';
import { Fragment } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db.ts';
import { fmtIst } from '@/lib/hours.ts';
import { ACTION_LABEL, NEXT_ACTIONS } from '@/lib/leadActions.ts';
import { leadAction, saveNotes } from '../actions.ts';
import { RoutePill, StatusBadge, EmailEvent, BackLink, clock, inr, FIELD_LABELS } from '../../ui.tsx';

export const dynamic = 'force-dynamic';

type Ev = { at: string; icon: string; title: React.ReactNode; sub?: React.ReactNode };

export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: lead } = await db().from('leads').select('*').eq('id', id).single();
  if (!lead) notFound();
  const [{ data: calls }, { data: emails }, { data: actions }] = await Promise.all([
    db().from('calls').select('id, created_at, route, duration_sec, summary, collected, mismatch, after_hours').eq('lead_id', id).order('created_at', { ascending: false }),
    db().from('emails').select('id, kind, to_addresses, subject, status, last_event, created_at').eq('lead_id', id).order('created_at', { ascending: false }),
    db().from('lead_actions').select('id, actor, action, at, detail').eq('lead_id', id).order('at', { ascending: false }),
  ]);
  const latest = (calls?.[0]?.collected ?? {}) as Record<string, any>;
  const who = (await cookies()).get('aangan_who')?.value ?? '';
  const next = NEXT_ACTIONS[lead.status] ?? [];
  const hubspotUrl = lead.hubspot_deal_id && process.env.HUBSPOT_PORTAL_ID ? `https://app.hubspot.com/contacts/${process.env.HUBSPOT_PORTAL_ID}/record/0-3/${lead.hubspot_deal_id}` : null;

  const events: Ev[] = [
    ...(calls ?? []).map((c: any) => ({
      at: c.created_at, icon: '☎',
      title: <><Link href={`/dashboard/calls/${c.id}`}>Call</Link> · <RoutePill route={c.route} /> · {clock(c.duration_sec)}{c.after_hours ? ' · 🌙' : ''}</>,
      sub: c.summary,
    })),
    ...(emails ?? []).map((e: any) => ({
      at: e.created_at, icon: '✉',
      title: <><Link href={`/dashboard/emails/${e.id}`}>{e.subject}</Link> <EmailEvent event={e.last_event} status={e.status} /></>,
      sub: `${e.kind} → ${e.to_addresses.join(', ')}`,
    })),
    ...(actions ?? []).filter((a: any) => !a.action.startsWith('call_')).map((a: any) => ({
      at: a.at, icon: a.action === 'note' ? '✎' : a.action === 'overdue_alert' ? '⏱' : '✓',
      title: <><b>{a.actor}</b> · {a.action === 'note' ? 'added a note' : a.action === 'overdue_alert' ? 'overdue reminder sent' : (ACTION_LABEL as any)[a.action] ?? a.action}</>,
      sub: a.detail?.text ?? (a.detail?.value ? inr(a.detail.value) : undefined),
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <>
      <BackLink href="/dashboard/leads" label="All leads" />
      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <div className="eyebrow">Lead since {fmtIst(lead.created_at)}{lead.after_hours ? ' · first called after hours' : ''}</div>
          <h1>{lead.name ?? 'Unknown caller'} <span style={{ verticalAlign: 'middle' }}><RoutePill route={lead.route} /></span></h1>
          <div className="ink-2 num">{lead.phone ?? 'No number'}{latest.caller_email ? ` · ${latest.caller_email}` : ''}</div>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          {lead.phone && <a className="btn" href={`tel:${lead.phone}`}>📞 Call</a>}
          {lead.phone && <a className="btn" href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a>}
          {hubspotUrl && <a className="btn" href={hubspotUrl} target="_blank" rel="noreferrer">HubSpot ↗</a>}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>
        <div className="grid">
          <section className="card">
            <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Status</h2>
            <dl className="kv">
              <dt>Stage</dt><dd><StatusBadge status={lead.status} promiseAt={lead.promise_at} /></dd>
              <dt>Owner</dt><dd>{lead.claimed_by_name ?? <span className="muted">Unclaimed</span>}{lead.claimed_at ? ` · ${fmtIst(lead.claimed_at)}` : ''}</dd>
              {lead.promise_at && <><dt>Promised callback</dt><dd>{fmtIst(lead.promise_at)}</dd></>}
              {lead.called_at && <><dt>Called back</dt><dd>{fmtIst(lead.called_at)}</dd></>}
              {lead.booked_at && <><dt>Booked</dt><dd>{fmtIst(lead.booked_at)}</dd></>}
              {lead.showed_up !== null && <><dt>Showed up</dt><dd>{lead.showed_up ? 'Yes' : 'No'}</dd></>}
              {lead.project_value_inr && <><dt>Project value</dt><dd>{inr(lead.project_value_inr)}</dd></>}
              {lead.recontact_at && <><dt>Recontact</dt><dd>{lead.recontact_at}</dd></>}
              {lead.booking_link && <><dt>Booking link</dt><dd><a href={lead.booking_link} target="_blank" rel="noreferrer">Sent to caller ↗</a></dd></>}
            </dl>
            {next.length > 0 && (
              <form action={leadAction} style={{ marginTop: 14, borderTop: '1px solid var(--grid)', paddingTop: 12 }}>
                <input type="hidden" name="leadId" value={lead.id} />
                <div className="toolbar" style={{ marginBottom: 8 }}>
                  <input className="input" name="who" defaultValue={who} placeholder="Your name" aria-label="Your name" required style={{ flex: '1 1 140px' }} />
                  {next.includes('won') && <input className="input" name="value" inputMode="numeric" placeholder="Project value ₹" aria-label="Project value" style={{ flex: '1 1 140px' }} />}
                </div>
                <div className="toolbar" style={{ margin: 0 }}>
                  {next.map((a, i) => <button key={a} name="action" value={a} className={i === 0 ? 'btn btn-primary' : 'btn'}>{ACTION_LABEL[a]}</button>)}
                </div>
              </form>
            )}
          </section>

          <section className="card">
            <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Project</h2>
            <dl className="kv">
              {FIELD_LABELS.filter(([k]) => !['caller_name', 'callback_number', 'caller_email'].includes(k) && latest[k] !== undefined && latest[k] !== null && latest[k] !== '').map(([k, label]) => (
                <Fragment key={k}><dt>{label}</dt><dd>{k === 'booked_slot' ? fmtIst(latest[k]) : String(latest[k])}</dd></Fragment>
              ))}
            </dl>
          </section>

          <section className="card">
            <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Notes</h2>
            <form action={saveNotes}>
              <input type="hidden" name="leadId" value={lead.id} />
              <textarea className="input" name="notes" rows={4} defaultValue={lead.notes ?? ''} placeholder="Anything the next person should know…" />
              <button className="btn" style={{ marginTop: 8 }}>Save notes</button>
            </form>
          </section>
        </div>

        <section className="card">
          <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>Timeline</h2>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>{(calls ?? []).length} call{(calls ?? []).length === 1 ? '' : 's'} · {(emails ?? []).length} email{(emails ?? []).length === 1 ? '' : 's'} · newest first</p>
          <ol className="timeline">
            {events.map((e, i) => (
              <li key={i}>
                <span aria-hidden style={{ textAlign: 'center' }}>{e.icon}</span>
                <div>
                  <div>{e.title}</div>
                  {e.sub && <div className="ink-2" style={{ fontSize: 13 }}>{e.sub}</div>}
                  <div className="muted" style={{ fontSize: 12 }}>{fmtIst(e.at)}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
