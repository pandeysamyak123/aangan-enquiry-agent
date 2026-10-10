// Daily 9pm IST (Vercel Cron): today's numbers + every declined / flagged call for a human to sanity-check (Check 07).
import { NextResponse } from 'next/server';
import { db } from '@/lib/db.ts';
import { cronAuthorized } from '@/lib/cronAuth.ts';
import { emailEnabled, sendEmail } from '@/lib/email.ts';
import { digestEmail, type DigestCall } from '@/lib/emails.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Today in IST
  const ist = new Date(Date.now() + 330 * 60_000);
  const day = ist.toISOString().slice(0, 10);
  const since = new Date(Date.parse(`${day}T00:00:00+05:30`)).toISOString();
  const { data, error } = await db().from('calls').select('id, lead_id, route, decline_reason, mismatch, summary, collected, created_at, after_hours, cost_paise').gte('created_at', since);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const calls = data ?? [];
  const stats: Record<string, number> = { calls: calls.length, after_hours: calls.filter((c) => c.after_hours).length };
  for (const c of calls) stats[c.route] = (stats[c.route] ?? 0) + 1;
  const flagged = calls.filter((c) => ['DECLINED', 'NURTURE'].includes(c.route) || c.mismatch) as DigestCall[];
  const cost = calls.reduce((s, c) => s + (c.cost_paise ?? 0), 0) / 100;
  const to = (process.env.NIKHIL_EMAIL || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (emailEnabled() && to.length && calls.length) await sendEmail({ to, ...digestEmail(day, stats, flagged, cost), kind: 'digest' });
  return NextResponse.json({ day, stats, flagged: flagged.length, cost_inr: cost, emailed: calls.length > 0 && to.length > 0 });
}
