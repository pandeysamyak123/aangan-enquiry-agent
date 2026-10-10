// Vaani AI → us. Authenticate, record once, acknowledge fast, process after.
// Register in Vaani (Developers → Webhooks) as:
//   https://<app>/api/vaani/webhook?token=<VAANI_WEBHOOK_SECRET>
import { NextResponse, after } from 'next/server';
import { verifyVaani, toEnvelope, parseCall, roomOf, type VaaniEnvelope } from '@/lib/vaani.ts';
import { recordEvent, markEvent, db } from '@/lib/db.ts';
import { handleCall } from '@/lib/pipeline.ts';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Events that carry the finished call. call_postprocessing has entities + summary; the rest are terminal failures.
const FINAL = new Set(['call_postprocessing', 'call.completed', 'call_failed', 'call_no_answer', 'call_rejected', 'call.failed']);

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.VAANI_WEBHOOK_SECRET;
  const token = new URL(req.url).searchParams.get('token');
  if (!secret || !verifyVaani(raw, req.headers.get('x-vaanivoice-signature'), secret, token)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Record<string, any>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  // Accept both Vaani AI's flat shape and an { id, type, data } envelope.
  const env: VaaniEnvelope = body.event ? toEnvelope(body) : { id: body.id, type: body.type, created: body.created ?? Math.floor(Date.now() / 1000), data: body.data ?? {} };
  const eventId = `vaani:${env.id}`;

  const fresh = await recordEvent(eventId, 'vaani', env.type, body);
  if (!fresh) return NextResponse.json({ ok: true, duplicate: true });
  if (!FINAL.has(env.type)) {
    await markEvent(eventId);
    return NextResponse.json({ ok: true, stored: env.type });
  }

  after(async () => {
    try {
      // The caller's number arrives on call_started; join it in by room.
      const room = roomOf(env);
      if (room && !env.data.phone_number) {
        const { data: started } = await db()
          .from('webhook_events')
          .select('payload')
          .eq('source', 'vaani')
          .in('type', ['call_started', 'user_picked_up_at'])
          .filter('payload->>room_name', 'eq', room)
          .limit(1);
        const phone = (started?.[0]?.payload as any)?.phone_number;
        if (phone) env.data.phone_number = phone;
      }
      const result = await handleCall(parseCall(env), eventId);
      console.log('[vaani] processed', eventId, result.verdict.route, result.steps);
      await markEvent(eventId);
    } catch (e) {
      console.error('[vaani] failed', eventId, e);
      await markEvent(eventId, e);
    }
  });

  return NextResponse.json({ ok: true });
}
