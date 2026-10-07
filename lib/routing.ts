// Server-side second opinion on every call.
// Re-applies Nikhil's five checks (qualified.md) to the fields the voice agent collected,
// so a misjudged call is flagged for a human instead of silently routed.
// Internal price floors live here and are NEVER sent to the voice agent.

export type Route = 'QUALIFIED' | 'NURTURE' | 'DECLINED' | 'ESCALATE' | 'OTHER' | 'INCOMPLETE' | 'MISSED';

export type CollectedData = {
  route?: string;
  decline_reason?: string;
  caller_name?: string;
  callback_number?: string;
  caller_role?: 'owner' | 'authorised' | 'proxy' | 'unclear' | string;
  project_type?: 'residential' | 'commercial' | string;
  property?: string;
  location_area?: string;
  carpet_area_sqft?: number | string;
  scope?: string;
  execution_wanted?: 'yes' | 'no' | 'unclear' | string;
  current_state?: string;
  timeline?: string;
  timeline_weeks?: number | string; // agent's estimate of weeks until the caller needs it complete
  budget_volunteered?: string;
  referral_source?: string;
  pricing_asked?: boolean | string;
  preferred_callback_time?: string;
  notes_for_designer?: string;
  escalation_detail?: string;
  consult_location?: string;
  booked_slot?: string;
  caller_email?: string;
};

export type CallInput = {
  status: 'COMPLETED' | 'FAILED' | 'NO_ANSWER' | 'BUSY' | string;
  durationSec?: number;
  data?: CollectedData;
};

export type Verdict = {
  route: Route;
  declineReason?: string;
  flags: string[]; // shown to the designer / reviewer
  agentRoute?: string;
  mismatch: boolean; // server disagrees with the agent → needs human review
};

const IN_AREA = [
  'pune', 'pcmc', 'kothrud', 'baner', 'aundh', 'wakad', 'koregaon park', 'kalyani nagar', 'viman nagar',
  'hadapsar', 'magarpatta', 'nibm', 'kondhwa', 'undri', 'shivane', 'warje', 'erandwane', 'deccan', 'kharadi',
  'nanded city', 'sunderban', 'pimpri', 'chinchwad', 'pimple saudagar', 'pimple nilakh', 'ravet', 'hinjewadi',
  'balewadi', 'bavdhan', 'pashan', 'shivajinagar', 'camp', 'wanowrie', 'yerawada', 'dhanori', 'wagholi',
];
const OUT_OF_AREA = ['talegaon', 'lonavala', 'nashik', 'mumbai', 'thane', 'navi mumbai', 'satara', 'nagpur', 'bangalore', 'bengaluru', 'goa'];
// Project types we never take — matched as whole words so "workshop" ≠ "shop".
const OUT_OF_SCOPE_TYPES = /\b(restaurants?|cafes?|café|hotels?|hospitality|retail|shops?|stores?|showrooms?|gyms?|fitness)\b/;
// Structural work is out of scope, but callers usually mention it to rule it out ("no structural changes"),
// so it is flagged for a human, never auto-declined.
const STRUCTURAL = /\b(structural|architect\w*|move (a |the )?walls?|break(ing)? walls?)\b/;

// Internal floors (pricing.md lowest tiers). Used only to catch obvious budget misalignment.
const MIN_PROJECT_LAKH = 3.5; // smallest single-room redesign
const MIN_RATE_PER_SQFT = { residential: 1800, commercial: 1200 };
const BUDGET_TOLERANCE = 0.5; // flag only when volunteered budget is under half the floor
const MIN_WEEKS = 8;

const lower = (s?: string) => (s ?? '').toLowerCase();
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

export function areaStatus(location?: string): 'in' | 'out' | 'unclear' {
  const l = lower(location);
  if (!l) return 'unclear';
  if (OUT_OF_AREA.some((a) => l.includes(a))) return 'out';
  if (IN_AREA.some((a) => l.includes(a))) return 'in';
  return 'unclear';
}

// "₹1–1.5 lakh", "35-40 lakh", "60 to 80 L", "1.2 crore" → upper bound in lakh
export function parseBudgetLakh(text?: string): number | undefined {
  const t = lower(text).replace(/,/g, '');
  if (!t) return undefined;
  const nums = [...t.matchAll(/\d+(?:\.\d+)?/g)].map((m) => parseFloat(m[0]));
  if (!nums.length) return undefined;
  const max = Math.max(...nums);
  if (/crore|cr\b/.test(t)) return max * 100;
  if (/lakh|lac|\bl\b/.test(t)) return max;
  if (max >= 10000) return max / 100000; // plain rupees
  return undefined;
}

function isFullHome(d: CollectedData) {
  return /full|whole|entire|complete|end-to-end|poora/.test(lower(d.scope));
}

export function budgetMisaligned(d: CollectedData): boolean {
  const budget = parseBudgetLakh(d.budget_volunteered);
  if (budget === undefined) return false; // not mentioned → treat as qualified
  if (budget < MIN_PROJECT_LAKH * BUDGET_TOLERANCE * 2) return true; // below the smallest possible project
  const area = num(d.carpet_area_sqft);
  if (area && isFullHome(d)) {
    const rate = d.project_type === 'commercial' ? MIN_RATE_PER_SQFT.commercial : MIN_RATE_PER_SQFT.residential;
    const floorLakh = (area * rate) / 100000;
    return budget < floorLakh * BUDGET_TOLERANCE;
  }
  return false;
}

export function route(call: CallInput): Verdict {
  const d = call.data ?? {};
  const agentRoute = d.route?.toUpperCase();
  const flags: string[] = [];

  if (call.status !== 'COMPLETED') return { route: 'MISSED', flags: ['call did not connect — call back'], agentRoute, mismatch: false };

  if (agentRoute === 'ESCALATE' || d.escalation_detail) {
    return { route: 'ESCALATE', flags: ['existing client — senior callback'], agentRoute, mismatch: agentRoute !== 'ESCALATE' };
  }
  if (agentRoute === 'OTHER') return { route: 'OTHER', flags, agentRoute, mismatch: false };

  // Too little captured to judge (e.g. dropped line).
  if (!agentRoute && !d.scope && !d.location_area) {
    return { route: 'INCOMPLETE', flags: ['call ended before details were captured — call back'], agentRoute, mismatch: false };
  }

  const fails: string[] = [];

  // Check 1 — real project with execution, in a project type we do
  const text = `${lower(d.scope)} ${lower(d.property)}`;
  if (STRUCTURAL.test(text)) flags.push('mentions structural work — confirm none needed');
  if (OUT_OF_SCOPE_TYPES.test(text)) fails.push('out_of_scope_type');
  else if (lower(d.execution_wanted) === 'no') fails.push('not_full_project');
  else if (lower(d.execution_wanted) !== 'yes') flags.push('execution not confirmed');

  // Check 2 — service area
  const area = areaStatus(d.location_area);
  if (area === 'out') fails.push('outside_area');
  if (area === 'unclear') flags.push(`check location: "${d.location_area ?? 'not given'}"`);

  // Check 3 — timeline
  const weeks = num(d.timeline_weeks);
  let timelineFail = false;
  if (weeks !== undefined && weeks < MIN_WEEKS) { fails.push('timeline'); timelineFail = true; }
  if (weeks === undefined) flags.push('timeline not confirmed');

  // Check 4 — budget, only if volunteered
  if (budgetMisaligned(d)) fails.push('budget_misaligned');

  // Check 5 — decision-maker: never fails alone, only noted
  if (['proxy', 'unclear'].includes(lower(d.caller_role))) flags.push(`decision-maker: ${d.caller_role}${d.notes_for_designer ? '' : ' — confirm at consultation'}`);

  // Size flag (no rule in services.md; designer decides)
  const sqft = num(d.carpet_area_sqft);
  if (d.project_type === 'commercial' && sqft !== undefined && sqft < 500) flags.push(`small commercial space (${sqft} sq ft) — designer to confirm fit`);
  if (d.project_type === 'commercial' && sqft !== undefined && sqft > 3000) flags.push(`large office (${sqft} sq ft) — above ~3,000 sq ft guideline`);

  if (lower(String(d.pricing_asked)) === 'true') flags.push('asked about pricing (deflected)');

  let r: Route;
  let declineReason: string | undefined;
  if (fails.length === 0) r = 'QUALIFIED';
  else if (fails.length === 1 && timelineFail) r = 'NURTURE';
  else {
    r = 'DECLINED';
    declineReason = fails.length > 1 ? 'multiple' : fails[0];
  }

  const mismatch = !!agentRoute && agentRoute !== r;
  if (mismatch) flags.unshift(`agent said ${agentRoute}, rules say ${r} — review`);
  return { route: r, declineReason, flags, agentRoute, mismatch };
}
