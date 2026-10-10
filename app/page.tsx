// Public front page: what the system does and how it's built. Live numbers are aggregates only (no caller data).
import Link from 'next/link';
import { loadPublicStats } from '@/lib/metrics.ts';

export const revalidate = 60;

const STAGES = [
  { k: 'Trigger', t: 'A call comes in', d: 'Any time outside 10am–7pm, or when the front desk doesn’t pick up within four rings.', tool: 'Phone number → Vaani AI' },
  { k: 'Input', t: 'Caller & number', d: 'The caller’s voice and number. Returning callers and redials are recognised.', tool: 'Vaani AI · Supabase' },
  { k: 'Context', t: 'What Aangan does', d: 'services.md, Nikhil’s five checks, and FAQs. The internal price list is never loaded.', tool: 'Agent knowledge' },
  { k: 'Processing', t: 'Asks what a designer would', d: 'Scope, area, size, timeline, decision-maker, source. One question at a time, in English or Hindi.', tool: 'Meera (voice agent)' },
  { k: 'AI', t: 'Checks it twice', d: 'Meera tags a route; the server re-checks the five rules and flags any disagreement for a human.', tool: 'Vaani AI · routing rules' },
  { k: 'Output', t: 'Hands it over', d: 'Designer email with one-tap Claim, a HubSpot deal, a booking link for the caller, and this dashboard.', tool: 'Resend · HubSpot · Calendly' },
];

const CHECKS = [
  ['A real project', 'Design with execution, not just advice. One room with execution counts.'],
  ['In Pune or PCMC', 'Outside the service area is declined kindly.'],
  ['A realistic timeline', 'Not something that must be ready in a few weeks.'],
  ['Budget, broadly', 'Never asked. Only an obviously low volunteered figure is flagged, and the server judges it, not the agent.'],
  ['The decision-maker', 'The caller decides or is authorised. Unclear means forward with a note.'],
];

export default async function Home() {
  let stats: { calls: number; afterHours: number; qualified: number } | null = null;
  try { stats = await loadPublicStats(); } catch { stats = null; }

  return (
    <div className="wrap">
      <nav className="nav">
        <Link href="/" className="brand"><span className="brand-mark">A</span>Aangan Enquiries</Link>
        <div className="nav-links">
          <a href="#how" className="btn">How it works</a>
          <Link href="/dashboard" className="btn btn-primary">Open dashboard →</Link>
        </div>
      </nav>

      <section style={{ padding: '40px 0 28px', maxWidth: 760 }}>
        <div className="eyebrow">Aangan Studio · Pune</div>
        <h1 style={{ fontSize: 'clamp(30px, 5vw, 46px)', margin: '8px 0 14px' }}>Every enquiry answered, day or night.</h1>
        <p className="ink-2" style={{ fontSize: 18, margin: 0 }}>
          Meera answers Aangan’s phone whenever the front desk can’t, asks what a designer would ask, checks the enquiry against Nikhil’s own rules,
          and hands qualified leads to a designer with everything already asked. She never quotes a price.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
          <Link href="/dashboard" className="btn btn-primary">See the dashboard</Link>
          <a href="#how" className="btn">How it’s built</a>
        </div>
      </section>

      <section className="grid g-3" aria-label="The problem">
        <div className="card"><div className="tile-value">48%</div><div className="tile-label">of ~200 monthly enquiries got no reply within 48 hours</div></div>
        <div className="card"><div className="tile-value">4×</div><div className="tile-label">conversion when answered within an hour vs the next day</div></div>
        <div className="card"><div className="tile-value">1 in 3</div><div className="tile-label">enquiries arrive outside 10am–7pm, when nobody is at the desk</div></div>
      </section>

      {stats && (
        <section className="card" style={{ marginTop: 14, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }} aria-label="Live, last 30 days">
          <span className="eyebrow">Live · last 30 days</span>
          <span><b className="num" style={{ fontSize: 20 }}>{stats.calls}</b> <span className="ink-2">calls answered</span></span>
          <span><b className="num" style={{ fontSize: 20 }}>{stats.afterHours}</b> <span className="ink-2">after hours</span></span>
          <span><b className="num" style={{ fontSize: 20 }}>{stats.qualified}</b> <span className="ink-2">qualified leads handed over</span></span>
          <span><b className="num" style={{ fontSize: 20 }}>0</b> <span className="ink-2">prices quoted</span></span>
        </section>
      )}

      <div className="section-title" id="how"><h2 style={{ fontSize: 22 }}>How it works</h2><span className="muted">Trigger → Input → Context → Processing → AI → Output</span></div>
      <section className="grid g-3">
        {STAGES.map((s, i) => (
          <div key={s.k} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="eyebrow">{i + 1} · {s.k}</span>
            </div>
            <h3 style={{ fontSize: 17, margin: '6px 0 6px' }}>{s.t}</h3>
            <p className="ink-2" style={{ margin: '0 0 10px', fontSize: 14 }}>{s.d}</p>
            <span className="pill">{s.tool}</span>
          </div>
        ))}
      </section>

      <div className="grid g-2" style={{ marginTop: 14 }}>
        <section className="card">
          <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>Nikhil’s five checks</h2>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {CHECKS.map(([t, d]) => <li key={t} style={{ marginBottom: 8 }}><b>{t}.</b> <span className="ink-2">{d}</span></li>)}
          </ol>
          <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>Replayed against the September enquiries: 30 of 30 routed correctly.</p>
        </section>
        <section className="card" style={{ background: 'var(--brand-soft)' }}>
          <div className="eyebrow">The Cut</div>
          <h2 style={{ fontSize: 18, margin: '6px 0 10px' }}>It never quotes a price.</h2>
          <p className="ink-2" style={{ margin: '0 0 10px' }}>
            Nikhil asked for per-square-foot quotes on the call. His own pricing guide says no number should ever be quoted, because pricing varies by site,
            and a number said in the studio’s voice becomes the number the studio is held to.
          </p>
          <p className="ink-2" style={{ margin: 0 }}>
            So the price list is never loaded into the agent, the upload script refuses any prompt containing a rupee figure, and a caller asking about price is
            told the designer will walk them through it at the free consultation. Asking never disqualifies anyone.
          </p>
        </section>
      </div>

      <section className="card" style={{ marginTop: 14 }}>
        <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>Who does what</h2>
        <div className="grid g-3">
          <div><b>Meera (AI)</b><p className="ink-2" style={{ margin: '4px 0 0', fontSize: 14 }}>Answers, asks, checks, routes, logs. Never prices, never promises dates, never names a designer.</p></div>
          <div><b>Designers</b><p className="ink-2" style={{ margin: '4px 0 0', fontSize: 14 }}>Claim the lead from the email, call within the promise, price at the consultation.</p></div>
          <div><b>Nikhil</b><p className="ink-2" style={{ margin: '4px 0 0', fontSize: 14 }}>Owns the rules and prices. Gets complaints at once, overdue alerts, and a 9pm digest of anyone declined.</p></div>
        </div>
      </section>

      <footer className="foot">
        Built for MESA Case 03 · Vaani AI · Next.js on Vercel · Supabase · HubSpot · Resend · Calendly ·{' '}
        <a href="https://github.com/pandeysamyak123/aangan-enquiry-agent">Source (private)</a>
      </footer>
    </div>
  );
}
