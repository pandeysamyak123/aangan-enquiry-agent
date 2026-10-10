import Link from 'next/link';
import { Fragment } from 'react';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db.ts';
import { fmtIst } from '@/lib/hours.ts';
import { DECLINE_LABEL } from '@/lib/metrics.ts';
import { RoutePill, StatusBadge, EmailEvent, BackLink, clock, inr, parseTranscript, FIELD_LABELS, ObjIcon } from '../../ui.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Call · Aangan CRM' };

export default async function CallDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: c } = await db().from('calls').select('*').eq('id', id).single();
  if (!c) notFound();
  const [{ data: lead }, { data: emails }, { data: others }] = await Promise.all([
    c.lead_id ? db().from('leads').select('*').eq('id', c.lead_id).single() : Promise.resolve({ data: null }),
    db().from('emails').select('id, kind, to_addresses, subject, status, last_event, created_at').eq('call_id', id).order('created_at'),
    c.lead_id ? db().from('calls').select('id, created_at, route').eq('lead_id', c.lead_id).neq('id', id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] as any[] }),
  ]);
  const d = (c.collected ?? {}) as Record<string, any>;
  const lines = parseTranscript(c.transcript);
  const hasRecording = !!c.recording_url && !String(c.vaani_call_id).startsWith('sim-');

  return (
    <>
      <BackLink href="/dashboard/calls" label="All calls" />
      <div className="page-head anim-up" style={{ marginTop: 8 }}>
        <div className="ph-left">
          <ObjIcon obj="call" size="lg" />
          <div>
          <div className="eyebrow">Call · {fmtIst(c.started_at ?? c.created_at)}{c.after_hours ? ' · 🌙 after hours' : ''} · {clock(c.duration_sec)} · {inr((c.cost_paise ?? 0) / 100, 2)}{c.cost_estimated ? ' (est.)' : ''}</div>
          <h1>{d.caller_name ?? 'Unknown caller'} <span style={{ verticalAlign: 'middle' }}><RoutePill route={c.route} /></span></h1>
          <div className="ink-2 num">{d.callback_number ?? c.from_number ?? ''}{d.caller_email ? ` · ${d.caller_email}` : ''}</div>
          </div>
        </div>
        {lead && <Link className="btn btn-primary" href={`/dashboard/leads/${lead.id}`}>Open lead →</Link>}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>
        <div className="grid">
          <section className="card anim-up">
            <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Summary</h2>
            <p style={{ margin: 0 }}>{c.summary ?? <span className="muted">No summary.</span>}</p>
            {hasRecording && (
              <div style={{ marginTop: 12 }}>
                <audio controls preload="none" src={`/api/recording/${encodeURIComponent(c.vaani_call_id)}`} style={{ width: '100%' }} />
              </div>
            )}
          </section>

          <section className="card anim-up">
            <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Transcript</h2>
            {lines.length === 0 && <p className="muted" style={{ margin: 0 }}>{typeof c.transcript === 'string' && c.transcript ? c.transcript : 'No transcript for this call.'}</p>}
            <div>
              {lines.map((l, i) => (
                <div key={i} className={`bubble ${l.who}`}>
                  <span className="who">{l.who === 'agent' ? 'Meera' : d.caller_name ?? 'Caller'}{l.at ? ` · ${l.at}` : ''}</span>{l.text}
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="grid">
          <section className="card anim-up">
            <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Routing</h2>
            <dl className="kv">
              <dt>Outcome</dt><dd><RoutePill route={c.route} />{c.decline_reason ? ` · ${DECLINE_LABEL[c.decline_reason] ?? c.decline_reason}` : ''}</dd>
              <dt>Meera said</dt><dd>{c.agent_route ?? '—'}</dd>
              <dt>Rules check</dt><dd>{c.mismatch ? <span className="status" style={{ color: 'var(--critical)' }}>⚠ Disagreed with Meera, needs review</span> : <span className="status" style={{ color: 'var(--good-text)' }}>✓ Agrees</span>}</dd>
              {c.flags?.length > 0 && <Fragment><dt>Flags</dt><dd>{c.flags.map((f: string) => <div key={f}>⚑ {f}</div>)}</dd></Fragment>}
              {lead && <><dt>Lead status</dt><dd><StatusBadge status={lead.status} promiseAt={lead.promise_at} />{lead.claimed_by_name ? ` · ${lead.claimed_by_name}` : ''}</dd></>}
              {lead?.promise_at && <><dt>Promised callback</dt><dd>{fmtIst(lead.promise_at)}</dd></>}
            </dl>
          </section>

          <section className="card anim-up">
            <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>What Meera captured</h2>
            <dl className="kv">
              {FIELD_LABELS.filter(([k]) => d[k] !== undefined && d[k] !== null && d[k] !== '').map(([k, label]) => (
                <Fragment key={k}><dt>{label}</dt><dd>{k === 'booked_slot' ? fmtIst(d[k]) : String(d[k])}</dd></Fragment>
              ))}
            </dl>
            {FIELD_LABELS.every(([k]) => d[k] === undefined || d[k] === null || d[k] === '') && <p className="muted" style={{ margin: 0 }}>Nothing captured (dropped or failed call).</p>}
          </section>

          <section className="card anim-up">
            <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Emails from this call</h2>
            {(emails ?? []).length === 0 && <p className="muted" style={{ margin: 0 }}>No emails sent for this call.</p>}
            {(emails ?? []).map((e: any) => (
              <Link key={e.id} href={`/dashboard/emails/${e.id}`} className="row-link" style={{ display: 'block', borderTop: '1px solid var(--grid)', padding: '8px 0', fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{e.subject}</b><EmailEvent event={e.last_event} status={e.status} /></div>
                <div className="muted" style={{ fontSize: 13 }}>{e.kind} · to {e.to_addresses.join(', ')} · {fmtIst(e.created_at)}</div>
              </Link>
            ))}
          </section>

          {(others ?? []).length > 0 && (
            <section className="card anim-up">
              <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Other calls from this caller</h2>
              {(others ?? []).map((o: any) => <div key={o.id} style={{ fontSize: 14, padding: '4px 0' }}><Link href={`/dashboard/calls/${o.id}`}>{fmtIst(o.created_at)}</Link> · <RoutePill route={o.route} /></div>)}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
