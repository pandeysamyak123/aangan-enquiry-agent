// Public homepage: talk to Meera live, see what she does and how it's built.
import Link from 'next/link';
import { loadPublicStats } from '@/lib/metrics.ts';
import Receptionist from './Receptionist.tsx';
import CountUp from './CountUp.tsx';

export const revalidate = 60;

const FLOW = [
  { k: 'Trigger', t: 'A call comes in', d: 'After 7pm, on weekends, or when nobody picks up within four rings.', ico: '☎', c: 'var(--o-call)' },
  { k: 'Input', t: 'Caller & number', d: 'Voice, number, and whether they’ve called before.', ico: '◉', c: 'var(--o-contact)' },
  { k: 'Context', t: 'What Aangan does', d: 'Services, Nikhil’s five checks, FAQs. Never the price list.', ico: '▤', c: 'var(--o-setup)' },
  { k: 'Processing', t: 'Asks what a designer would', d: 'Scope, area, size, timeline, decision-maker, source.', ico: '✎', c: 'var(--o-lead)' },
  { k: 'AI', t: 'Checks it twice', d: 'Meera routes the call; the server re-checks the rules.', ico: '✦', c: 'var(--o-report)' },
  { k: 'Output', t: 'Hands it over', d: 'Designer email, HubSpot deal, booking link, live CRM.', ico: '➜', c: 'var(--o-opportunity)' },
];

const CHECKS: [string, string][] = [
  ['A real project', 'Design with execution, not just ideas. One room with execution counts.'],
  ['In Pune or PCMC', 'Outside the service area is declined kindly.'],
  ['A realistic timeline', 'Not something that must be ready in a few weeks.'],
  ['Budget, broadly', 'Never asked. An obviously low figure is flagged by the server, not the agent.'],
  ['The decision-maker', 'The caller decides or is authorised. Unclear → forward with a note.'],
];

export default async function Home() {
  let stats: { calls: number; afterHours: number; qualified: number } | null = null;
  try { stats = await loadPublicStats(); } catch { stats = null; }

  return (
    <>
      <header className="site-nav">
        <div className="wrap">
          <Link href="/" className="brand"><span className="brand-mark">A</span>Aangan Studio</Link>
          <nav style={{ display: 'flex', gap: 8 }}>
            <a href="#how" className="btn hide-sm">How it works</a>
            <Link href="/dashboard" className="btn btn-primary">Open CRM →</Link>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="hero-bg" />
        <div className="blob" style={{ width: 340, height: 340, background: '#1b96ff', top: -60, right: '8%' }} />
        <div className="blob" style={{ width: 260, height: 260, background: '#7f56d9', bottom: -40, left: '4%', animationDelay: '-4s' }} />
        <div className="wrap hero-grid">
          <div className="anim-up">
            <span className="chip"><span className="live-dot" /> Answering calls 24 × 7 · Pune</span>
            <h1>Every enquiry answered, <span className="grad-text">day or night.</span></h1>
            <p className="lead-text">
              Meera is Aangan Studio’s AI receptionist. She picks up when the front desk can’t, asks what a designer would ask,
              checks it against Nikhil’s own rules, and hands qualified leads to a designer in seconds. She never quotes a price.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
              <a href="#talk" className="btn btn-primary btn-lg">Talk to Meera now</a>
              <Link href="/dashboard" className="btn btn-lg">See the live CRM</Link>
            </div>
            {stats && (
              <div style={{ display: 'flex', gap: 28, marginTop: 28, flexWrap: 'wrap' }} aria-label="Live, last 30 days">
                <div><div className="big-num" style={{ fontSize: 30 }}><CountUp to={stats.calls} /></div><div className="muted">calls answered · 30 days</div></div>
                <div><div className="big-num" style={{ fontSize: 30 }}><CountUp to={stats.qualified} /></div><div className="muted">leads handed to designers</div></div>
                <div><div className="big-num" style={{ fontSize: 30 }}>0</div><div className="muted">prices quoted</div></div>
              </div>
            )}
          </div>
          <div id="talk" className="anim-up d2"><Receptionist /></div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 8 }}>
        <div className="wrap">
          <div className="stat-band">
            <div className="card card-hover anim-up d1"><div className="big-num" style={{ color: 'var(--critical)' }}><CountUp to={48} suffix="%" /></div><p className="ink-2" style={{ margin: '8px 0 0' }}>of ~200 monthly enquiries used to get no reply within 48 hours</p></div>
            <div className="card card-hover anim-up d2"><div className="big-num" style={{ color: 'var(--brand)' }}><CountUp to={4} suffix="×" /></div><p className="ink-2" style={{ margin: '8px 0 0' }}>higher conversion when answered within an hour instead of the next day</p></div>
            <div className="card card-hover anim-up d3"><div className="big-num" style={{ color: '#7f56d9' }}>1 in 3</div><p className="ink-2" style={{ margin: '8px 0 0' }}>enquiries arrive outside 10am–7pm, when nobody is at the desk</p></div>
            <div className="card card-hover anim-up d4"><div className="big-num" style={{ color: 'var(--good)' }}>₹8–14L</div><p className="ink-2" style={{ margin: '8px 0 0' }}>average project. One saved lead pays for years of the agent</p></div>
          </div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="wrap">
          <div className="eyebrow">How it works</div>
          <h2 className="big">From a ringing phone to a designer’s inbox</h2>
          <p className="ink-2" style={{ margin: '0 0 20px', maxWidth: 640 }}>Trigger → Input → Context → Processing → AI → Output. Every step is logged, so nothing gets lost between people.</p>
          <div className="flow">
            {FLOW.map((s, i) => (
              <div key={s.k} className={`flow-step anim-up d${i + 1}`}>
                <div className="card card-hover" style={{ height: '100%' }}>
                  <span className="obj-icon" style={{ background: s.c }}>{s.ico}</span>
                  <div className="eyebrow" style={{ marginTop: 10 }}>{i + 1} · {s.k}</div>
                  <h3 style={{ fontSize: 15, margin: '4px 0 6px' }}>{s.t}</h3>
                  <p className="ink-2" style={{ margin: 0, fontSize: 13 }}>{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap grid g-2">
          <div className="card anim-up">
            <div className="card-head"><span className="obj-icon" style={{ background: 'var(--o-lead)' }}>✓</span><h2>Nikhil’s five checks</h2></div>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {CHECKS.map(([t, d]) => <li key={t} style={{ marginBottom: 8 }}><b>{t}.</b> <span className="ink-2">{d}</span></li>)}
            </ol>
            <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>Replayed against the September enquiries: 30 of 30 routed correctly.</p>
          </div>
          <div className="card anim-up d2" style={{ background: 'linear-gradient(135deg, var(--navy), #3b1e8a)', color: '#fff', borderColor: 'transparent' }}>
            <div className="eyebrow" style={{ color: 'rgba(255,255,255,.7)' }}>The Cut</div>
            <h2 style={{ fontSize: 22, margin: '6px 0 10px' }}>It never quotes a price.</h2>
            <p style={{ margin: '0 0 10px', opacity: .9 }}>Nikhil asked for per-square-foot quotes on the call. His own pricing guide says no number should ever be quoted: pricing varies by site, and a number said in the studio’s voice becomes the number the studio is held to.</p>
            <p style={{ margin: 0, opacity: .9 }}>So the price list is never loaded into the agent, the upload script refuses any prompt with a rupee figure, and anyone asking is told the designer will walk them through it at the free consultation.</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="card anim-up" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: 24 }}>
            <div>
              <h2 style={{ fontSize: 22, margin: '0 0 4px' }}>Every call, lead and email in one CRM</h2>
              <p className="ink-2" style={{ margin: 0 }}>Pipeline, transcripts, recordings, designer response times and the cost of the agent, live, and synced to HubSpot.</p>
            </div>
            <Link href="/dashboard" className="btn btn-primary btn-lg">Open the CRM →</Link>
          </div>
        </div>
      </section>

      <footer className="foot wrap">Aangan Studio, Pune · AI receptionist by Vaani AI · Built for MESA Case 03</footer>
    </>
  );
}
