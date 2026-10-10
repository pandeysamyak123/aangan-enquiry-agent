// Everything the dashboard shows, computed from Supabase in one pass.
// Nikhil should never have to pull these numbers by hand again, including what the tool itself costs.
import { db } from './db.ts';

export type RangeDays = 7 | 30 | 90;
export const ROUTE_GROUP = (r: string) => (r === 'QUALIFIED' ? 'qualified' : r === 'NURTURE' ? 'nurture' : r === 'DECLINED' ? 'declined' : 'other');
export type Group = 'qualified' | 'nurture' | 'declined' | 'other';
export const GROUPS: { key: Group; label: string; color: string }[] = [
  { key: 'qualified', label: 'Qualified', color: 'var(--s-qualified)' },
  { key: 'nurture', label: 'Nurture', color: 'var(--s-nurture)' },
  { key: 'declined', label: 'Declined', color: 'var(--s-declined)' },
  { key: 'other', label: 'Escalated / dropped / other', color: 'var(--s-other)' },
];

export type CallRow = {
  id: string; lead_id: string; route: string; decline_reason: string | null; mismatch: boolean; after_hours: boolean;
  duration_sec: number | null; cost_paise: number | null; summary: string | null; collected: Record<string, any> | null;
  flags: string[]; created_at: string; recording_url: string | null;
};
export type LeadRow = {
  id: string; name: string | null; phone: string | null; route: string; status: string; after_hours: boolean;
  promise_at: string | null; claimed_by_name: string | null; claimed_at: string | null; called_at: string | null; booked_at: string | null;
  showed_up: boolean | null; project_value_inr: number | null; created_at: string; overdue_alerted_at: string | null;
};

const istDay = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export async function loadDashboard(days: RangeDays) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const [callsRes, leadsRes] = await Promise.all([
    db().from('calls').select('id, lead_id, route, decline_reason, mismatch, after_hours, duration_sec, cost_paise, summary, collected, flags, created_at, recording_url').gte('created_at', since).order('created_at', { ascending: false }),
    db().from('leads').select('id, name, phone, route, status, after_hours, promise_at, claimed_by_name, claimed_at, called_at, booked_at, showed_up, project_value_inr, created_at, overdue_alerted_at').gte('created_at', since).order('created_at', { ascending: false }),
  ]);
  if (callsRes.error) throw callsRes.error;
  if (leadsRes.error) throw leadsRes.error;
  const calls = (callsRes.data ?? []) as CallRow[];
  const leads = (leadsRes.data ?? []) as LeadRow[];
  const now = Date.now();

  // Calls per IST day, stacked by route group (every day in range present, even if zero).
  const byDay = new Map<string, Record<Group, number>>();
  for (let i = days - 1; i >= 0; i--) byDay.set(istDay(new Date(now - i * 864e5).toISOString()), { qualified: 0, nurture: 0, declined: 0, other: 0 });
  for (const c of calls) {
    const row = byDay.get(istDay(c.created_at));
    if (row) row[ROUTE_GROUP(c.route) as Group]++;
  }
  const daily = [...byDay.entries()].map(([day, g]) => ({ day, ...g, total: g.qualified + g.nurture + g.declined + g.other }));

  const count = (f: (c: CallRow) => boolean) => calls.filter(f).length;
  const qualifiedLeads = leads.filter((l) => l.route === 'QUALIFIED');
  const claimed = qualifiedLeads.filter((l) => l.claimed_at);
  const called = qualifiedLeads.filter((l) => l.called_at);
  const booked = qualifiedLeads.filter((l) => l.booked_at || ['booked', 'consulted', 'won'].includes(l.status));
  const showed = qualifiedLeads.filter((l) => l.showed_up);
  const won = qualifiedLeads.filter((l) => l.status === 'won');
  const wonValue = won.reduce((s, l) => s + (l.project_value_inr ?? 0), 0);

  // Speed: minutes from call to designer claim / call; share of callbacks inside the promise.
  const mins = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60_000;
  const claimMins = claimed.map((l) => mins(l.created_at, l.claimed_at!));
  const calledWithPromise = called.filter((l) => l.promise_at);
  const withinPromise = calledWithPromise.filter((l) => new Date(l.called_at!) <= new Date(l.promise_at!)).length;
  const overdue = leads.filter((l) => ['QUALIFIED', 'ESCALATE', 'MISSED', 'INCOMPLETE'].includes(l.route) && ['new', 'claimed'].includes(l.status) && l.promise_at && new Date(l.promise_at).getTime() < now);
  const waiting = leads.filter((l) => ['QUALIFIED', 'ESCALATE', 'MISSED', 'INCOMPLETE'].includes(l.route) && ['new', 'claimed'].includes(l.status));

  // Cost: actual Vaani minutes (paise) → ₹, and per-unit costs.
  const costInr = calls.reduce((s, c) => s + (c.cost_paise ?? 0), 0) / 100;
  const minutes = calls.reduce((s, c) => s + Math.ceil((c.duration_sec ?? 0) / 60), 0);

  const declineReasons = new Map<string, number>();
  for (const c of calls) if (c.route === 'DECLINED') declineReasons.set(c.decline_reason ?? 'other', (declineReasons.get(c.decline_reason ?? 'other') ?? 0) + 1);

  return {
    days,
    totals: {
      calls: calls.length,
      afterHours: count((c) => c.after_hours),
      qualified: count((c) => c.route === 'QUALIFIED'),
      nurture: count((c) => c.route === 'NURTURE'),
      declined: count((c) => c.route === 'DECLINED'),
      escalated: count((c) => c.route === 'ESCALATE'),
      dropped: count((c) => ['MISSED', 'INCOMPLETE'].includes(c.route)),
      pricingAsked: count((c) => String(c.collected?.pricing_asked) === 'true'),
      mismatches: count((c) => c.mismatch),
    },
    funnel: [
      { label: 'Qualified', n: qualifiedLeads.length },
      { label: 'Claimed', n: claimed.length },
      { label: 'Called back', n: called.length },
      { label: 'Consultation booked', n: booked.length },
      { label: 'Showed up', n: showed.length },
      { label: 'Won', n: won.length },
    ],
    speed: { medianClaimMins: median(claimMins), withinPromise, calledWithPromise: calledWithPromise.length, overdue, waiting },
    cost: {
      inr: costInr, minutes,
      perCall: calls.length ? costInr / calls.length : null,
      perQualified: qualifiedLeads.length ? costInr / qualifiedLeads.length : null,
      perBooked: booked.length ? costInr / booked.length : null,
      wonValue,
      roi: costInr > 0 && wonValue > 0 ? wonValue / costInr : null,
    },
    daily,
    declineReasons: [...declineReasons.entries()].sort((a, b) => b[1] - a[1]),
    reviewQueue: calls.filter((c) => c.mismatch || c.route === 'DECLINED').slice(0, 20),
    recentCalls: calls.slice(0, 25),
    leads: leads.filter((l) => !['DECLINED', 'OTHER'].includes(l.route)).slice(0, 40),
  };
}

// Aggregate-only numbers for the public front page (no names, numbers or PII).
export async function loadPublicStats() {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data } = await db().from('calls').select('route, after_hours').gte('created_at', since);
  const calls = data ?? [];
  return { calls: calls.length, afterHours: calls.filter((c) => c.after_hours).length, qualified: calls.filter((c) => c.route === 'QUALIFIED').length };
}

export const DECLINE_LABEL: Record<string, string> = {
  outside_area: 'Outside Pune / PCMC', not_full_project: 'Advice only, no execution', budget_misaligned: 'Volunteered budget too low',
  out_of_scope_type: 'Project type we don’t do', timeline: 'Timeline too short', multiple: 'Failed 2+ checks', other: 'Other',
};
export const ROUTE_LABEL: Record<string, string> = {
  QUALIFIED: 'Qualified', NURTURE: 'Nurture', DECLINED: 'Declined', ESCALATE: 'Escalated', MISSED: 'Missed', INCOMPLETE: 'Dropped', OTHER: 'Other',
};
export const STATUS_LABEL: Record<string, string> = {
  new: 'New', claimed: 'Claimed', called: 'Called back', booked: 'Booked', consulted: 'Consulted', won: 'Won', lost: 'Lost', not_fit: 'Not a fit', closed: 'Closed',
};
