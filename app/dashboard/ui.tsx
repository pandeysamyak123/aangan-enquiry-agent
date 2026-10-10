// Shared CRM building blocks.
import Link from 'next/link';
import { ROUTE_LABEL, STATUS_LABEL } from '@/lib/metrics.ts';

export const inr = (n: number | null | undefined, dp = 0) =>
  n === null || n === undefined ? '—' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: dp, minimumFractionDigits: dp });
export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
export const mins = (m: number | null) => (m === null ? '—' : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} d`);
export const clock = (s: number | null | undefined) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '—');

const ROUTE_COLOR: Record<string, string> = { QUALIFIED: 'var(--s-qualified)', NURTURE: 'var(--s-nurture)', DECLINED: 'var(--s-declined)' };
export function RoutePill({ route }: { route: string }) {
  return <span className="pill"><span className="dot" style={{ background: ROUTE_COLOR[route] ?? 'var(--s-other)' }} />{ROUTE_LABEL[route] ?? route}</span>;
}

// Status always carries an icon + label, never colour alone.
export function StatusBadge({ status, promiseAt }: { status: string; promiseAt?: string | null }) {
  const overdue = ['new', 'claimed'].includes(status) && promiseAt && new Date(promiseAt) < new Date();
  if (overdue) return <span className="status" style={{ color: 'var(--critical)' }}>⚠ Overdue</span>;
  if (status === 'won') return <span className="status" style={{ color: 'var(--good-text)' }}>✓ Won</span>;
  if (['booked', 'consulted'].includes(status)) return <span className="status" style={{ color: 'var(--good-text)' }}>✓ {STATUS_LABEL[status]}</span>;
  if (['not_fit', 'lost', 'closed'].includes(status)) return <span className="status" style={{ color: 'var(--muted)' }}>– {STATUS_LABEL[status]}</span>;
  if (status === 'new') return <span className="status" style={{ color: 'var(--ink-2)' }}>○ New</span>;
  return <span className="status" style={{ color: 'var(--ink-2)' }}>● {STATUS_LABEL[status] ?? status}</span>;
}

export function EmailEvent({ event, status }: { event?: string | null; status?: string }) {
  if (status === 'failed') return <span className="status" style={{ color: 'var(--critical)' }}>✗ Failed</span>;
  const e = event ?? 'sent';
  if (['bounced', 'complained'].includes(e)) return <span className="status" style={{ color: 'var(--critical)' }}>✗ {e}</span>;
  if (['opened', 'clicked'].includes(e)) return <span className="status" style={{ color: 'var(--good-text)' }}>✓ {e}</span>;
  if (e === 'delivered') return <span className="status" style={{ color: 'var(--good-text)' }}>✓ delivered</span>;
  return <span className="status" style={{ color: 'var(--ink-2)' }}>● {e.replace(/_/g, ' ')}</span>;
}

export function PageHead({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1></div>
      {children && <div className="toolbar" style={{ margin: 0 }}>{children}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card muted" style={{ textAlign: 'center', padding: 28 }}>{children}</div>;
}

export const BackLink = ({ href, label }: { href: string; label: string }) => (
  <Link href={href} className="muted" style={{ fontSize: 14, textDecoration: 'none' }}>← {label}</Link>
);

// Vaani transcripts arrive as "[hh:mm:ss] AGENT: …\n\n[hh:mm:ss] USER: …" (or without timestamps).
export function parseTranscript(t: unknown): { who: 'agent' | 'user'; at?: string; text: string }[] {
  if (Array.isArray(t)) return t.map((m: any) => ({ who: /agent|assistant/i.test(m.role ?? m.speaker ?? '') ? 'agent' : 'user', at: m.at ?? m.timestamp, text: String(m.text ?? m.content ?? '') }));
  if (typeof t !== 'string' || !t.trim()) return [];
  const out: { who: 'agent' | 'user'; at?: string; text: string }[] = [];
  for (const line of t.split(/\n+/)) {
    const m = line.match(/^\s*(?:\[([\d:]+)\]\s*)?(AGENT|USER|CALLER|ASSISTANT)\s*:\s*(.*)$/i);
    if (m) out.push({ who: /USER|CALLER/i.test(m[2]) ? 'user' : 'agent', at: m[1], text: m[3] });
    else if (out.length && line.trim()) out[out.length - 1].text += '\n' + line.trim();
  }
  return out;
}

export const FIELD_LABELS: [string, string][] = [
  ['caller_name', 'Name'], ['callback_number', 'Callback number'], ['caller_email', 'Email'], ['caller_role', 'Decision-maker'],
  ['project_type', 'Project type'], ['property', 'Property'], ['location_area', 'Location'], ['carpet_area_sqft', 'Carpet area (sq ft)'],
  ['scope', 'Scope'], ['execution_wanted', 'Wants execution'], ['current_state', 'Site state'], ['timeline', 'Timeline'],
  ['timeline_weeks', 'Weeks until needed'], ['budget_volunteered', 'Budget (volunteered)'], ['referral_source', 'Source'],
  ['pricing_asked', 'Asked about price'], ['preferred_callback_time', 'Best time to call'], ['consult_location', 'Consultation at'],
  ['booked_slot', 'Booked slot'], ['notes_for_designer', 'Notes for designer'], ['escalation_detail', 'Escalation detail'],
];
