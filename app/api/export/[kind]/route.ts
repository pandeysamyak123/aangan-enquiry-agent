// CSV export of calls or leads, honouring the same filters as the list pages (login required via middleware).
import { db } from '@/lib/db.ts';
import { safeQ, sinceFor } from '@/lib/filters.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const FIELDS = ['caller_name', 'callback_number', 'caller_email', 'caller_role', 'project_type', 'property', 'location_area', 'carpet_area_sqft', 'scope', 'execution_wanted', 'current_state', 'timeline', 'timeline_weeks', 'budget_volunteered', 'referral_source', 'pricing_asked', 'preferred_callback_time', 'consult_location', 'notes_for_designer', 'escalation_detail'];

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  let rows: Record<string, unknown>[] = [];
  let header: string[] = [];
  if (kind === 'calls') {
    let q = db().from('calls').select('*').gte('created_at', sinceFor(sp.range)).order('created_at', { ascending: false }).limit(5000);
    if (sp.route) q = q.eq('route', sp.route);
    if (sp.after === '1') q = q.eq('after_hours', true);
    if (sp.flag === 'review') q = q.eq('mismatch', true);
    const t = safeQ(sp.q);
    if (t) q = q.or(`summary.ilike.*${t}*,collected->>caller_name.ilike.*${t}*,collected->>location_area.ilike.*${t}*`);
    const { data } = await q;
    header = ['created_at', 'route', 'decline_reason', 'mismatch', 'after_hours', 'duration_sec', 'cost_inr', ...FIELDS, 'flags', 'summary'];
    rows = (data ?? []).map((c: any) => ({ ...c, ...(c.collected ?? {}), cost_inr: (c.cost_paise ?? 0) / 100, flags: (c.flags ?? []).join(' | ') }));
  } else if (kind === 'leads') {
    let q = db().from('leads').select('*').gte('created_at', sinceFor(sp.range ?? '90')).order('created_at', { ascending: false }).limit(5000);
    if (sp.route) q = q.eq('route', sp.route);
    if (sp.status) q = q.eq('status', sp.status);
    const { data } = await q;
    header = ['created_at', 'name', 'phone', 'route', 'status', 'after_hours', 'promise_at', 'claimed_by_name', 'claimed_at', 'called_at', 'booked_at', 'showed_up', 'project_value_inr', 'hubspot_deal_id', 'notes'];
    rows = data ?? [];
  } else return new Response('Unknown export', { status: 404 });

  const csv = [header.join(','), ...rows.map((r) => header.map((h) => cell(r[h])).join(','))].join('\n');
  const day = new Date().toISOString().slice(0, 10);
  return new Response('﻿' + csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="aangan-${kind}-${day}.csv"` } });
}
