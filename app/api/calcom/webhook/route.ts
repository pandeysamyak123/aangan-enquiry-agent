// Cal.com → us. BOOKING_CREATED / RESCHEDULED / CANCELLED update the lead, HubSpot and the designer.
import { NextResponse, after } from 'next/server';
import { verifyCalcom, bookingContact, type CalBooking } from '@/lib/calcom.ts';
import { recordEvent, markEvent, db } from '@/lib/db.ts';
import { applyBooking } from '@/lib/bookings.ts';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.CALCOM_WEBHOOK_SECRET;
  if (!secret || !verifyCalcom(raw, req.headers.get('x-cal-signature-256'), secret)) return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  const body = JSON.parse(raw || '{}') as { triggerEvent?: string; createdAt?: string; payload?: CalBooking };
  const trigger = body.triggerEvent ?? 'unknown';
  if (trigger === 'PING' || !body.payload?.uid) return NextResponse.json({ ok: true });
  const eventId = `calcom:${trigger}:${body.payload.uid}:${body.payload.startTime}`;
  if (!(await recordEvent(eventId, 'calcom', trigger, body))) return NextResponse.json({ ok: true, duplicate: true });

  after(async () => {
    try {
      const outcome = await applyBooking(trigger, body.payload!, bookingContact(body.payload!));
      console.log('[calcom]', eventId, outcome);
      await markEvent(eventId, outcome.startsWith('unmatched') ? outcome : undefined);
    } catch (e) {
      console.error('[calcom] failed', eventId, e);
      await markEvent(eventId, e);
    }
  });
  return NextResponse.json({ ok: true });
}
