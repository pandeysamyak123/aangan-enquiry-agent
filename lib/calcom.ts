// Cal.com: live booking happens inside Vaani (Settings → Integrations → Cal.com); this module handles
// the fallback booking link and verifies Cal.com's booking webhooks.
import crypto from 'node:crypto';

export const calcomEnabled = () => !!process.env.CALCOM_BOOKING_URL;

// Public event link with prefill. metadata[leadId] comes back on the BOOKING_CREATED webhook.
export function calcomLink(leadId: string, prefill: { name?: string; email?: string; phone?: string }) {
  const url = new URL(process.env.CALCOM_BOOKING_URL!);
  if (prefill.name) url.searchParams.set('name', prefill.name);
  if (prefill.email) url.searchParams.set('email', prefill.email);
  if (prefill.phone) url.searchParams.set('attendeePhoneNumber', prefill.phone);
  url.searchParams.set('metadata[leadId]', leadId);
  return url.toString();
}

// X-Cal-Signature-256: hex HMAC-SHA256 of the raw body with the webhook secret.
export function verifyCalcom(rawBody: string, header: string | null, secret: string) {
  if (!header) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type CalBooking = {
  uid: string; title?: string; startTime: string; endTime: string; status?: string;
  attendees?: { name?: string; email?: string; phoneNumber?: string; timeZone?: string }[];
  responses?: Record<string, { value?: unknown } | unknown>;
  metadata?: Record<string, unknown>;
  location?: string; organizer?: { name?: string; email?: string };
};

const val = (v: unknown) => (v && typeof v === 'object' && 'value' in (v as any) ? (v as any).value : v);

// Pull the caller's details out of whichever fields Cal.com filled.
export function bookingContact(b: CalBooking) {
  const r = b.responses ?? {};
  const att = b.attendees?.[0] ?? {};
  const phone = String(val(r.attendeePhoneNumber) ?? val(r.phone) ?? att.phoneNumber ?? (typeof b.location === 'string' && /^\+?\d[\d\s-]{8,}$/.test(b.location) ? b.location : '') ?? '');
  return {
    name: String(val(r.name) ?? att.name ?? ''),
    email: String(val(r.email) ?? att.email ?? ''),
    phone: phone || undefined,
    leadId: (b.metadata?.leadId as string | undefined) ?? undefined,
  };
}
