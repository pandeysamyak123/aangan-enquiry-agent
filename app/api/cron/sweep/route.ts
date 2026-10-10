// Retries calls whose post-processing wasn't ready when call_ended arrived.
// Scheduled every 5 min from Supabase pg_cron (Vercel Hobby crons are daily only).
import { NextResponse } from 'next/server';
import { db, markEvent } from '@/lib/db.ts';
import { toEnvelope } from '@/lib/vaani.ts';
import { processCall } from '@/lib/processCall.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const { data, error } = await db()
    .from('webhook_events')
    .select('id, payload')
    .eq('source', 'vaani')
    .eq('type', 'call_ended')
    .like('error', 'pending%')
    .lt('received_at', cutoff)
    .limit(10);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const results: Record<string, string> = {};
  for (const row of data ?? []) {
    try {
      const outcome = await processCall(toEnvelope(row.payload as any), row.id, { waitMs: 0 });
      results[row.id] = outcome;
      await markEvent(row.id, outcome.startsWith('pending') ? outcome : undefined);
    } catch (e) {
      results[row.id] = 'error: ' + (e as Error).message;
      await markEvent(row.id, e);
    }
  }
  return NextResponse.json({ checked: data?.length ?? 0, results });
}
