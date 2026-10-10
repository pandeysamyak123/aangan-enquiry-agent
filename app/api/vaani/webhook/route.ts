// Vaani AI → us. Authenticate, record once, acknowledge fast, process after.
// Register in Vaani (Developers → Webhooks, agent "aangan-enquiries-meera") as:
//   https://<app>/api/vaani/webhook?token=<VAANI_WEBHOOK_SECRET>
// Events: call_started (caller's number), call_ended (we then fetch details), call_failed,
// and call_postprocessing if offered (carries entities directly).
import { NextResponse, after } from 'next/server';
import { verifyVaani, toEnvelope, roomOf, type VaaniEnvelope } from '@/lib/vaani.ts';
import { recordEvent, markEvent } from '@/lib/db.ts';
import { processCall } from '@/lib/processCall.ts';

export const runtime = 'nodejs';
export const maxDuration = 60;

const FINAL = new Set(['call_postprocessing', 'call_ended', 'call.completed', 'call_failed', 'call_no_answer', 'call_rejected', 'call.failed']);

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.VAANI_WEBHOOK_SECRET;
  const token = new URL(req.url).searchParams.get('token');
  if (!secret || !verifyVaani(raw, req.headers.get('x-vaanivoice-signature'), secret, token)) {
    console.warn('[vaani] rejected delivery; headers:', [...req.headers.keys()].join(','));
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Record<string, any>;
  try {
    body = JSON.parse(raw || '{}');
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  // Connectivity tests may send an empty or unknown body.
  if (!body.event && !body.type) return NextResponse.json({ ok: true, test: true });

  const env: VaaniEnvelope = body.event ? toEnvelope(body) : { id: body.id, type: body.type, created: body.created ?? Math.floor(Date.now() / 1000), data: body.data ?? {} };
  const eventId = `vaani:${env.id}`;
  // Log header names once so we can adopt Vaani's signing scheme if it has one.
  if (env.type === 'call_started') console.log('[vaani] headers:', [...req.headers.keys()].filter((h) => !/cookie|authorization/i.test(h)).join(','));

  const fresh = await recordEvent(eventId, 'vaani', env.type, body);
  if (!fresh) return NextResponse.json({ ok: true, duplicate: true });
  if (!FINAL.has(env.type) || !roomOf(env)) {
    await markEvent(eventId);
    return NextResponse.json({ ok: true, stored: env.type });
  }

  after(async () => {
    try {
      const outcome = await processCall(env, eventId);
      console.log('[vaani]', eventId, outcome);
      await markEvent(eventId, outcome.startsWith('pending') ? outcome : undefined);
    } catch (e) {
      console.error('[vaani] failed', eventId, e);
      await markEvent(eventId, e);
    }
  });

  return NextResponse.json({ ok: true });
}
