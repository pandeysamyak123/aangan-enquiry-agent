// CRM overview: the numbers Nikhil used to pull by hand, plus what needs attention right now.
import Link from 'next/link';
import { loadDashboard, GROUPS, DECLINE_LABEL, type RangeDays } from '@/lib/metrics.ts';
import { fmtIst } from '@/lib/hours.ts';
import CallsChart from './CallsChart.tsx';
import { inr, pct, mins, clock, RoutePill, StatusBadge, PageHead } from './ui.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Overview · Aangan CRM' };

function Tile({ label, value, sub, href, tone, i = 0 }: { label: string; value: string; sub?: string; href?: string; tone?: 'critical'; i?: number }) {
  const body = (
    <div className={`card card-hover anim-up d${i + 1}`} style={{ height: '100%' }}>
      <div className="tile-label">{label}</div>
      <div className="tile-value" style={tone === 'critical' ? { color: 'var(--critical)' } : undefined}>{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="row-link">{body}</Link> : body;
}

export default async function Overview({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const days = ([7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30) as RangeDays;
  const m = await loadDashboard(days);
  const t = m.totals;
  const funnelMax = Math.max(1, m.funnel[0].n);

  return (
    <>
      <PageHead obj="home" eyebrow={`Updated ${fmtIst(new Date())}`} title="Overview">
        <div className="seg" role="group" aria-label="Date range">
          {[7, 30, 90].map((d) => <Link key={d} href={`/dashboard?days=${d}`} aria-current={d === days ? 'true' : undefined}>{d} days</Link>)}
        </div>
      </PageHead>

      <section className="grid g-4" aria-label="Key numbers">
        <Tile i={0} label="Calls answered" value={String(t.calls)} sub={`${t.afterHours} after hours (${pct(t.afterHours, t.calls)})`} href="/dashboard/calls" />
        <Tile i={1} label="Qualified leads" value={String(t.qualified)} sub={`${pct(t.qualified, t.calls)} of calls · ${t.nurture} nurture`} href="/dashboard/leads" />
        <Tile i={2} label="Consultations booked" value={String(m.funnel[3].n)} sub={`${pct(m.funnel[3].n, m.funnel[0].n)} of qualified`} href="/dashboard/leads?status=booked" />
        <Tile i={3} label="Median time to claim" value={mins(m.speed.medianClaimMins)} sub={`Callbacks on time: ${pct(m.speed.withinPromise, m.speed.calledWithPromise)}`} />
        <Tile i={4} label="Waiting past promise" value={String(m.speed.overdue.length)} sub={`${m.speed.waiting.length} callers waiting`} href="/dashboard/leads?view=attention" tone={m.speed.overdue.length ? 'critical' : undefined} />
        <Tile i={5} label="Cost of the agent" value={inr(m.cost.inr)} sub={`${m.cost.minutes} min · ${inr(m.cost.perQualified)} / qualified lead`} href="/dashboard/settings" />
      </section>

      <div className="section-title"><h2>Calls per day</h2><span className="muted">by outcome · IST · last {days} days</span></div>
      <div className="card anim-up d3"><CallsChart data={m.daily} groups={GROUPS} /></div>

      <div className="grid g-2" style={{ marginTop: 14 }}>
        <section className="card" aria-label="Lead funnel">
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>From call to project</h2>
          {m.funnel.map((f, i) => (
            <div key={f.label} style={{ marginBottom: 10 }} title={`${f.label}: ${f.n}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span>{f.label}</span><span className="num"><b>{f.n}</b>{i > 0 && <span className="muted"> · {pct(f.n, m.funnel[0].n)}</span>}</span>
              </div>
              <div style={{ height: 10, background: 'var(--surface-2)', borderRadius: 4, marginTop: 4 }}>
                <div style={{ width: `${(f.n / funnelMax) * 100}%`, minWidth: f.n ? 6 : 0, height: '100%', background: 'var(--s-qualified)', borderRadius: '0 4px 4px 0', animationDelay: `${i * 80}ms` }} className="bar-grow" />
              </div>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>Won value <b className="num" style={{ color: 'var(--ink)' }}>{inr(m.cost.wonValue)}</b> · return on agent cost {m.cost.roi ? `${Math.round(m.cost.roi).toLocaleString('en-IN')}×` : '—'}</p>
        </section>

        <section className="card" aria-label="Outcomes">
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Outcomes</h2>
          <table className="data">
            <tbody>
              <tr><td><RoutePill route="QUALIFIED" /></td><td className="num">{t.qualified}</td></tr>
              <tr><td><RoutePill route="NURTURE" /></td><td className="num">{t.nurture}</td></tr>
              <tr><td><RoutePill route="DECLINED" /></td><td className="num">{t.declined}</td></tr>
              <tr><td><RoutePill route="ESCALATE" /></td><td className="num">{t.escalated}</td></tr>
              <tr><td><RoutePill route="INCOMPLETE" /> / missed</td><td className="num">{t.dropped}</td></tr>
            </tbody>
          </table>
          {m.declineReasons.length > 0 && <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>Top decline reason: <b style={{ color: 'var(--ink)' }}>{DECLINE_LABEL[m.declineReasons[0][0]] ?? m.declineReasons[0][0]}</b> ({m.declineReasons[0][1]})</p>}
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>Price never quoted · {t.pricingAsked} caller{t.pricingAsked === 1 ? '' : 's'} asked, all deflected · {t.mismatches} flagged for review</p>
        </section>
      </div>

      <div className="section-title"><h2>Needs attention</h2><Link href="/dashboard/leads?view=attention" className="muted">All waiting →</Link></div>
      <div className="card scroll-x">
        <table className="data">
          <thead><tr><th>Caller</th><th>Route</th><th>Promised by</th><th>Owner</th><th>Status</th></tr></thead>
          <tbody>
            {m.speed.waiting.length === 0 && <tr><td colSpan={5} className="muted">Nobody is waiting. 🎉</td></tr>}
            {m.speed.waiting.slice(0, 8).map((l) => (
              <tr key={l.id} className="clickable">
                <td><Link href={`/dashboard/leads/${l.id}`} className="row-link"><b>{l.name ?? 'Caller'}</b><div className="muted num" style={{ fontSize: 13 }}>{l.phone ?? ''}</div></Link></td>
                <td><RoutePill route={l.route} /></td>
                <td className="num">{fmtIst(l.promise_at)}</td>
                <td>{l.claimed_by_name ?? <span className="muted">Unclaimed</span>}</td>
                <td><StatusBadge status={l.status} promiseAt={l.promise_at} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title"><h2>Latest calls</h2><Link href="/dashboard/calls" className="muted">All calls →</Link></div>
      <div className="card scroll-x">
        <table className="data">
          <thead><tr><th>When</th><th>Caller</th><th>Outcome</th><th className="hide-sm">Summary</th><th className="num">Length</th></tr></thead>
          <tbody>
            {m.recentCalls.length === 0 && <tr><td colSpan={5} className="muted">No calls yet.</td></tr>}
            {m.recentCalls.slice(0, 8).map((c) => (
              <tr key={c.id} className="clickable">
                <td className="num" style={{ whiteSpace: 'nowrap' }}><Link href={`/dashboard/calls/${c.id}`} className="row-link">{fmtIst(c.created_at)}</Link>{c.after_hours && <div className="muted" style={{ fontSize: 12 }}>after hours</div>}</td>
                <td><Link href={`/dashboard/calls/${c.id}`} className="row-link"><b>{c.collected?.caller_name ?? '—'}</b><div className="muted" style={{ fontSize: 13 }}>{[c.collected?.property, c.collected?.location_area].filter(Boolean).join(' · ')}</div></Link></td>
                <td><RoutePill route={c.route} />{c.mismatch && <div className="status" style={{ color: 'var(--critical)', fontSize: 12 }}>⚠ review</div>}</td>
                <td className="hide-sm ink-2" style={{ fontSize: 13, maxWidth: 380 }}>{c.summary ?? '—'}</td>
                <td className="num">{clock(c.duration_sec)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
