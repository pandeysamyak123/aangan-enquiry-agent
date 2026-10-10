// Every 15 min (Supabase pg_cron): pull new / cancelled Calendly bookings and apply them to leads + HubSpot.
import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cronAuth.ts';
import { syncCalendly } from '@/lib/bookings.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(await syncCalendly());
}
