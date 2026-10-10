// Nikhil's dashboard: what the system handled, what it led to, how fast designers acted, and what it cost.
import Link from 'next/link';
import { loadDashboard, GROUPS, DECLINE_LABEL, ROUTE_LABEL, STATUS_LABEL, type RangeDays, type LeadRow } from '@/lib/metrics.ts';
import { fmtIst } from '@/lib/hours.ts';
import { actionUrl, type LeadAction } from '@/lib/links.ts';
import CallsChart from './CallsChart.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard · Aangan Enquiries' };

const inr = (n: number | null | undefined, dp = 0) => (n === null || n === undefined ? '—' : '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: dp, minimumFractionDigits: dp }));
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const dur = (m: number | null) => (m === null ? '—' : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} d`);

const ROUTE_COLOR: Record<string, string> = { QUALIFIED: 'var(--s-qualified)', NURTURE: 'var(--s-nurture)', DECLINED: 'var(--s-declined)' };

function RoutePill({ route }: { route: string }) {
  return <span className="pill"><span className="dot" style={{ background: ROUTE_COLOR[route] ?? 'var(--s-other)' }} />{ROUTE_LABEL[route] ?? route}</span>;
}

// Status always carries icon + label, never colour alone.
function LeadStatus({ l }: { l: LeadRow }) {
  const overdue = ['new', 'claimed'].includes(l.status) && l.promise_at && new Date(l.promise_at) < new Date();
  if (overdue) return <span className="status" style={{ color: 'var(--critical)' }}>⚠ Overdue</span>;
  if (l.status === 'won') return <span className="status" style={{ color: 'var(--good-text)' }}>✓ Won</span>;
  if (['booked', 'consulted'].includes(l.status)) return <span className="status" style={{ color: 'var(--good-text)' }}>✓ {STATUS_LABEL[l.status]}</span>;
  if (l.status === 'new') return <span className="status" style={{ color: 'var(--ink-2)' }}>○ Waiting</span>;
  return <span className="status" style={{ color: 'var(--ink-2)' }}>● {STATUS_LABEL[l.status] ?? l.status}</span>;
}

const NEXT: Record<string, LeadAction[]> = {
  new: ['claim', 'called'], claimed: ['called', 'notfit'], called: ['booked', 'notfit'], booked: ['showed', 'noshow'], consulted: ['won', 'lost'],
};
const ACTION_LABEL: Partial<Record<LeadAction, string>> = { claim: 'Claim', called: 'Called', booked: 'Booked', notfit: 'Not a fit', showed: 'Showed up', noshow: 'No-show', won: 'Won', lost: 'Lost', reviewed: 'Reviewed' };

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'critical' }) {
  return (
    <div className="card">
      <div className="tile-label">{label}</div>
      <div className="tile-value" style={tone === 'critical' ? { color: 'var(--critical)' } : undefined}>{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const days = ([7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30) as RangeDays;
  const m = await loadDashboard(days);
  const t = m.totals;
  const funnelMax = Math.max(1, m.funnel[0].n);
  const declineMax = Math.max(1, ...m.declineReasons.map(([, n]) => n));

  return (
    <div className="wrap">
      <nav className="nav">
        <Link href="/" className="brand"><span className="brand-mark">A</span>Aangan Enquiries</Link>
        <div className="seg" role="group" aria-label="Date range">
          {[7, 30, 90].map((d) => <Link key={d} href={`/dashboard?days=${d}`} aria-current={d === days ? 'true' : undefined}>Last {d} days</Link>)}
        </div>
      </nav>

      <header style={{ margin: '8px 0 18px' }}>
        <div className="eyebrow">Founder’s dashboard</div>
        <h1 style={{ fontSize: 28, margin: '4px 0 4px' }}>Every enquiry, answered.</h1>
        <p className="ink-2" style={{ margin: 0 }}>Phone enquiries handled by Meera, what happened next, and what it cost. Updated live · {fmtIst(new Date())}</p>
      </header>

      <section className="grid g-4" aria-label="Key numbers">
        <Tile label="Calls answered" value={String(t.calls)} sub={`${t.afterHours} after hours (${pct(t.afterHours, t.calls)})`} />
        <Tile label="Qualified leads" value={String(t.qualified)} sub={`${pct(t.qualified, t.calls)} of calls · ${t.nurture} nurture`} />
        <Tile label="Consultations booked" value={String(m.funnel[3].n)} sub={`${pct(m.funnel[3].n, m.funnel[0].n)} of qualified`} />
        <Tile label="Median time to claim" value={dur(m.speed.medianClaimMins)} sub={`Callbacks on time: ${pct(m.speed.withinPromise, m.speed.calledWithPromise)}`} />
        <Tile label="Waiting past promise" value={String(m.speed.overdue.length)} sub={`${m.speed.waiting.length} callers waiting in total`} tone={m.speed.overdue.length ? 'critical' : undefined} />
        <Tile label="Cost of the agent" value={inr(m.cost.inr)} sub={`${m.cost.minutes} min · ${inr(m.cost.perQualified)} per qualified lead`} />
      </section>

      <div className="section-title"><h2>Calls per day</h2><span className="muted">by outcome · IST</span></div>
      <div className="card"><CallsChart data={m.daily} groups={GROUPS} /></div>

      <div className="grid g-2" style={{ marginTop: 14 }}>
        <section className="card" aria-label="Lead funnel">
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>From call to project</h2>
          {m.funnel.map((f, i) => (
            <div key={f.label} style={{ marginBottom: 10 }} title={`${f.label}: ${f.n}${i ? ` (${pct(f.n, m.funnel[0].n)} of qualified)` : ''}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span>{f.label}</span>
                <span className="num"><b>{f.n}</b>{i > 0 && <span className="muted"> · {pct(f.n, m.funnel[0].n)}</span>}</span>
              </div>
              <div style={{ height: 10, background: 'var(--surface-2)', borderRadius: 4, marginTop: 4 }}>
                <div style={{ width: `${(f.n / funnelMax) * 100}%`, minWidth: f.n ? 6 : 0, height: '100%', background: 'var(--s-qualified)', borderRadius: '0 4px 4px 0' }} />
              </div>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>Won value: <b className="num" style={{ color: 'var(--ink)' }}>{inr(m.cost.wonValue)}</b>. Designers update stages from the buttons in each lead email.</p>
        </section>

        <section className="card" aria-label="Cost and return">
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>What the agent costs</h2>
          <table className="data">
            <tbody>
              <tr><td>Voice minutes (Vaani)</td><td className="num">{m.cost.minutes} min</td></tr>
              <tr><td>Total cost, last {days} days</td><td className="num"><b>{inr(m.cost.inr, 2)}</b></td></tr>
              <tr><td>Per call answered</td><td className="num">{inr(m.cost.perCall, 2)}</td></tr>
              <tr><td>Per qualified lead</td><td className="num">{inr(m.cost.perQualified, 2)}</td></tr>
              <tr><td>Per consultation booked</td><td className="num">{inr(m.cost.perBooked, 2)}</td></tr>
              <tr><td>Return (won value ÷ cost)</td><td className="num">{m.cost.roi ? `${Math.round(m.cost.roi).toLocaleString('en-IN')}×` : '—'}</td></tr>
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>
            Price never quoted: <b style={{ color: 'var(--ink)' }}>{t.pricingAsked}</b> caller{t.pricingAsked === 1 ? '' : 's'} asked, all deflected to the designer (the Cut).
          </p>
        </section>
      </div>

      <div className="section-title"><h2>Needs attention</h2><span className="muted">callers promised a callback</span></div>
      <div className="card scroll-x">
        <table className="data">
          <thead><tr><th>Caller</th><th>Route</th><th>Promised by</th><th>Owner</th><th>Status</th><th className="hide-sm">Action</th></tr></thead>
          <tbody>
            {m.speed.waiting.length === 0 && <tr><td colSpan={6} className="muted">Nobody is waiting. 🎉</td></tr>}
            {m.speed.waiting.map((l) => (
              <tr key={l.id}>
                <td><b>{l.name ?? 'Caller'}</b><div className="muted num" style={{ fontSize: 13 }}>{l.phone ?? ''}</div></td>
                <td><RoutePill route={l.route} /></td>
                <td className="num">{fmtIst(l.promise_at)}</td>
                <td>{l.claimed_by_name ?? <span className="muted">Unclaimed</span>}</td>
                <td><LeadStatus l={l} /></td>
                <td className="hide-sm">{(NEXT[l.status] ?? []).map((a) => <a key={a} href={actionUrl(l.id, a)} className="btn" style={{ padding: '4px 9px', fontSize: 12, marginRight: 6 }}>{ACTION_LABEL[a]}</a>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid g-2" style={{ marginTop: 14 }}>
        <section className="card" aria-label="Why calls were declined">
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Why calls were declined</h2>
          {m.declineReasons.length === 0 && <p className="muted" style={{ margin: 0 }}>No declined calls in this range.</p>}
          {m.declineReasons.map(([reason, n]) => (
            <div key={reason} style={{ marginBottom: 10 }} title={`${DECLINE_LABEL[reason] ?? reason}: ${n}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>{DECLINE_LABEL[reason] ?? reason}</span><b className="num">{n}</b></div>
              <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 4, marginTop: 4 }}>
                <div style={{ width: `${(n / declineMax) * 100}%`, height: '100%', background: 'var(--s-declined)', borderRadius: '0 4px 4px 0' }} />
              </div>
            </div>
          ))}
        </section>

        <section className="card" aria-label="Review queue">
          <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>Review queue</h2>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 10px' }}>Declined calls and calls where Meera and the rules disagreed. Make sure nobody good was turned away.</p>
          {m.reviewQueue.length === 0 && <p className="muted" style={{ margin: 0 }}>Nothing to review.</p>}
          {m.reviewQueue.slice(0, 8).map((c) => (
            <div key={c.id} style={{ borderTop: '1px solid var(--grid)', padding: '8px 0', fontSize: 14 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <b>{c.collected?.caller_name ?? 'Caller'}</b><RoutePill route={c.route} />
                {c.mismatch && <span className="status" style={{ color: 'var(--critical)' }}>⚠ Agent disagreed</span>}
                <span className="muted" style={{ fontSize: 13 }}>{fmtIst(c.created_at)}</span>
              </div>
              <div className="ink-2" style={{ fontSize: 13 }}>{DECLINE_LABEL[c.decline_reason ?? ''] ?? ''}{c.collected?.location_area ? ` · ${c.collected.location_area}` : ''}{c.collected?.scope ? ` · ${c.collected.scope}` : ''}</div>
            </div>
          ))}
        </section>
      </div>

      <div className="section-title"><h2>Recent calls</h2><span className="muted">{m.recentCalls.length} shown</span></div>
      <div className="card scroll-x">
        <table className="data">
          <thead><tr><th>When</th><th>Caller</th><th>Route</th><th className="hide-sm">Summary</th><th className="num">Length</th><th className="num">Cost</th></tr></thead>
          <tbody>
            {m.recentCalls.length === 0 && <tr><td colSpan={6} className="muted">No calls yet. Ring Meera to see one appear here.</td></tr>}
            {m.recentCalls.map((c) => (
              <tr key={c.id}>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>{fmtIst(c.created_at)}{c.after_hours && <div className="muted" style={{ fontSize: 12 }}>after hours</div>}</td>
                <td><b>{c.collected?.caller_name ?? '—'}</b><div className="muted" style={{ fontSize: 13 }}>{[c.collected?.property, c.collected?.location_area].filter(Boolean).join(' · ')}</div></td>
                <td><RoutePill route={c.route} />{c.flags?.length > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{c.flags.slice(0, 2).join(' · ')}</div>}</td>
                <td className="hide-sm ink-2" style={{ fontSize: 13, maxWidth: 360 }}>{c.summary ?? '—'}{c.recording_url && <> · <a href={c.recording_url}>recording</a></>}</td>
                <td className="num">{c.duration_sec ? `${Math.floor(c.duration_sec / 60)}:${String(c.duration_sec % 60).padStart(2, '0')}` : '—'}</td>
                <td className="num">{inr((c.cost_paise ?? 0) / 100, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="foot">Aangan Studio · enquiry agent · Data from Supabase, voice by Vaani AI, leads in HubSpot. <Link href="/">About this system</Link></footer>
    </div>
  );
}
