import { db } from '@/lib/db.ts';
import { addDesigner, toggleDesigner } from './actions.ts';
import { PageHead, mins, pct, inr } from '../ui.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Designers · Aangan CRM' };

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export default async function Designers() {
  const [{ data: designers }, { data: leads }] = await Promise.all([
    db().from('designers').select('*').order('created_at'),
    db().from('leads').select('claimed_by_name, claimed_at, called_at, created_at, promise_at, status, project_value_inr').not('claimed_by_name', 'is', null),
  ]);
  // Performance is keyed by the name designers enter when they claim.
  const perf = new Map<string, { claimed: number; called: number; onTime: number; booked: number; won: number; value: number; claimMins: number[] }>();
  for (const l of leads ?? []) {
    const k = String(l.claimed_by_name);
    const p = perf.get(k) ?? { claimed: 0, called: 0, onTime: 0, booked: 0, won: 0, value: 0, claimMins: [] };
    p.claimed++;
    if (l.called_at) { p.called++; if (l.promise_at && new Date(l.called_at) <= new Date(l.promise_at)) p.onTime++; }
    if (['booked', 'consulted', 'won'].includes(l.status)) p.booked++;
    if (l.status === 'won') { p.won++; p.value += l.project_value_inr ?? 0; }
    if (l.claimed_at) p.claimMins.push((new Date(l.claimed_at).getTime() - new Date(l.created_at).getTime()) / 60000);
    perf.set(k, p);
  }
  const active = (designers ?? []).filter((d) => d.active);

  return (
    <>
      <PageHead obj="designer" eyebrow="Who gets the handoff emails, and how they’re doing" title="Designers" />
      <div className="grid g-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>Team</h2>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 10px' }}>
            {active.length ? `New qualified leads are emailed to these ${active.length} active designer${active.length === 1 ? '' : 's'}.` : 'No designers yet: leads go to the DESIGNERS_EMAIL fallback.'}
            {' '}On the Resend test sender, only your own signup email receives mail.
          </p>
          <table className="data">
            <tbody>
              {(designers ?? []).map((d) => (
                <tr key={d.id}>
                  <td><b>{d.name}</b><div className="muted" style={{ fontSize: 13 }}>{d.email}</div></td>
                  <td>{d.active ? <span className="status" style={{ color: 'var(--good-text)' }}>✓ Receives leads</span> : <span className="status muted">– Paused</span>}</td>
                  <td className="num"><form action={toggleDesigner}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="active" value={String(d.active)} /><button className="btn" style={{ padding: '4px 10px', fontSize: 13 }}>{d.active ? 'Pause' : 'Resume'}</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
          <form action={addDesigner} className="toolbar" style={{ marginTop: 12 }}>
            <input className="input" name="name" placeholder="Name" required aria-label="Designer name" style={{ flex: '1 1 140px' }} />
            <input className="input" name="email" type="email" placeholder="Email" required aria-label="Designer email" style={{ flex: '1 1 200px' }} />
            <button className="btn btn-primary">Add designer</button>
          </form>
        </section>

        <section className="card scroll-x">
          <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Performance</h2>
          {perf.size === 0 && <p className="muted" style={{ margin: 0 }}>Appears once designers start claiming leads.</p>}
          {perf.size > 0 && (
            <table className="data">
              <thead><tr><th>Designer</th><th className="num">Claimed</th><th className="num">Time to claim</th><th className="num">On-time callbacks</th><th className="num">Booked</th><th className="num">Won</th></tr></thead>
              <tbody>
                {[...perf.entries()].sort((a, b) => b[1].claimed - a[1].claimed).map(([name, p]) => (
                  <tr key={name}>
                    <td><b>{name}</b></td>
                    <td className="num">{p.claimed}</td>
                    <td className="num">{mins(median(p.claimMins))}</td>
                    <td className="num">{pct(p.onTime, p.called)}</td>
                    <td className="num">{p.booked}</td>
                    <td className="num">{p.won}{p.value ? <div className="muted" style={{ fontSize: 12 }}>{inr(p.value)}</div> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
