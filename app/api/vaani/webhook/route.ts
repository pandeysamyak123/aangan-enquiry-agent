// Vaani Labs → us. Verify, record once, acknowledge fast (10 s timeout on their side), process after.
import { NextResponse, after } from 'next/server';
import { verifyVaani, parseCall, type VaaniEnvelope } from '@/lib/vaani.ts';
import { recordEvent, markEvent, db } from '@/lib/db.ts';
import { handleCall } from '@/lib/pipeline.ts';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.VAANI_WEBHOOK_SECRET;
  if (!secret || !verifyVaani(raw, req.headers.get('x-vaanivoice-signature'), secret)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let env: VaaniEnvelope;
  try {
    env = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const type = env.type ?? req.headers.get('x-vaanivoice-event') ?? 'unknown';
  const eventId = `vaani:${env.id ?? req.headers.get('x-vaanivoice-delivery')}`;

  if (type === 'webhook.ping') return NextResponse.json({ ok: true, pong: true });

  const fresh = await recordEvent(eventId, 'vaani', type, env);
  if (!fresh) return NextResponse.json({ ok: true, duplicate: true });

  after(async () => {
    try {
      if (type === 'call.completed' || type === 'call.failed') {
        const result = await handleCall(parseCall(env), eventId);
        console.log('[vaani] processed', eventId, result.verdict.route, result.steps);
      } else if (type === 'usage.charged') {
        await recordUsage(env, eventId);
      }
      await markEvent(eventId);
    } catch (e) {
      console.error('[vaani] failed', eventId, e);
      await markEvent(eventId, e);
    }
  });

  return NextResponse.json({ ok: true });
}

// Real wallet debits replace our estimate on the matching call.
async function recordUsage(env: VaaniEnvelope, eventId: string) {
  const d = env.data ?? {};
  const amount = Number(d.amount_paise ?? d.cost_paise ?? (d.amount_inr != null ? Number(d.amount_inr) * 100 : d.amount ?? 0));
  const ref = String(d.call_id ?? d.session_id ?? d.reference ?? d.ref ?? '');
  await db().from('usage_charges').insert({ event_id: eventId, call_ref: ref || null, amount_paise: Math.round(amount) });
  if (ref) await db().from('calls').update({ cost_paise: Math.round(amount), cost_estimated: false }).eq('vaani_call_id', ref);
}
