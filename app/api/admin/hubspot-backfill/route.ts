// Runs the HubSpot back-fill on the server (where the Supabase key lives). Bearer CRON_SECRET.
import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cronAuth.ts';
import { hubspotBackfill } from '@/lib/hubspotBackfill.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const lines: string[] = [];
  await hubspotBackfill((s) => lines.push(s));
  return NextResponse.json({ log: lines });
}
