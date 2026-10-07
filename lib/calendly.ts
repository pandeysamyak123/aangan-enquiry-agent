// Calendly — single-use booking links for qualified callers, and webhook verification.
import crypto from 'node:crypto';

export const calendlyEnabled = () => !!process.env.CALENDLY_TOKEN && !!process.env.CALENDLY_EVENT_TYPE_URI;

// One link per lead, usable once. utm_content carries our lead id back on invitee.created.
export async function singleUseLink(leadId: string, prefill: { name?: string; email?: string; phone?: string }) {
  const res = await fetch('https://api.calendly.com/scheduling_links', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CALENDLY_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_event_count: 1, owner: process.env.CALENDLY_EVENT_TYPE_URI, owner_type: 'EventType' }),
  });
  if (!res.ok) throw new Error(`Calendly ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const { resource } = (await res.json()) as { resource: { booking_url: string } };
  const url = new URL(resource.booking_url);
  if (prefill.name) url.searchParams.set('name', prefill.name);
  if (prefill.email) url.searchParams.set('email', prefill.email);
  if (prefill.phone) url.searchParams.set('a1', prefill.phone); // first custom question on the event type: phone
  url.searchParams.set('utm_source', 'aangan-voice');
  url.searchParams.set('utm_content', leadId);
  return url.toString();
}

// Calendly-Webhook-Signature: "t=<ts>,v1=<hex hmac of `${t}.${body}`>"
export function verifyCalendly(rawBody: string, header: string | null, key: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  if (!parts.t || !parts.v1) return false;
  const expected = crypto.createHmac('sha256', key).update(`${parts.t}.${rawBody}`).digest('hex');
  const a = Buffer.from(parts.v1);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
