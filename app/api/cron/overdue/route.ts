// Every 15 min (Supabase pg_cron): callers past their promised callback with no call logged → one email to Nikhil.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db.ts';
import { cronAuthorized } from '@/lib/cronAuth.ts';
import { emailEnabled, sendEmail } from '@/lib/email.ts';
import { overdueEmail, type OverdueLead } from '@/lib/emails.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data, error } = await db()
    .from('leads')
    .select('id, name, phone, promise_at, route, claimed_by_name, status')
    .in('route', ['QUALIFIED', 'ESCALATE', 'MISSED', 'INCOMPLETE'])
    .in('status', ['new', 'claimed'])
    .lt('promise_at', new Date().toISOString())
    .is('overdue_alerted_at', null)
    .limit(25);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const leads = (data ?? []) as OverdueLead[];
  if (!leads.length) return NextResponse.json({ overdue: 0 });
  const to = (process.env.NIKHIL_EMAIL || process.env.FRONT_DESK_EMAIL || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (emailEnabled() && to.length) await sendEmail({ to, ...overdueEmail(leads), kind: 'overdue' });
  const now = new Date().toISOString();
  await db().from('leads').update({ overdue_alerted_at: now }).in('id', leads.map((l) => l.id));
  await db().from('lead_actions').insert(leads.map((l) => ({ lead_id: l.id, actor: 'system', action: 'overdue_alert' })));
  return NextResponse.json({ overdue: leads.length, emailed: to.length > 0 });
}
