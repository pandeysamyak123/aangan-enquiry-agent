// Calendly — single-use booking links for qualified callers, and webhook verification.
import crypto from 'node:crypto';

// Single-use links need the API token; without it we fall back to the public event link with prefill.
export const calendlyEnabled = () => (!!process.env.CALENDLY_TOKEN && !!process.env.CALENDLY_EVENT_TYPE_URI) || !!process.env.CALENDLY_SCHEDULING_URL;
const hasApi = () => !!process.env.CALENDLY_TOKEN && !!process.env.CALENDLY_EVENT_TYPE_URI;

function withPrefill(base: string, leadId: string, prefill: { name?: string; email?: string; phone?: string }) {
  const url = new URL(base);
  if (prefill.name) url.searchParams.set('name', prefill.name);
  if (prefill.email) url.searchParams.set('email', prefill.email);
  if (prefill.phone) url.searchParams.set('a1', `Phone: ${prefill.phone}`);
  url.searchParams.set('utm_source', 'aangan-voice');
  url.searchParams.set('utm_content', leadId); // comes back on the invitee as tracking.utm_content
  return url.toString();
}

// One link per lead, usable once. utm_content carries our lead id back on invitee.created.
export async function singleUseLink(leadId: string, prefill: { name?: string; email?: string; phone?: string }) {
  if (!hasApi()) return withPrefill(process.env.CALENDLY_SCHEDULING_URL!, leadId, prefill);
  const res = await fetch('https://api.calendly.com/scheduling_links', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CALENDLY_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_event_count: 1, owner: process.env.CALENDLY_EVENT_TYPE_URI, owner_type: 'EventType' }),
  });
  if (!res.ok) throw new Error(`Calendly ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const { resource } = (await res.json()) as { resource: { booking_url: string } };
  return withPrefill(resource.booking_url, leadId, prefill);
}

async function cal<T>(path: string): Promise<T> {
  const res = await fetch('https://api.calendly.com' + path, { headers: { Authorization: `Bearer ${process.env.CALENDLY_TOKEN}` } });
  if (!res.ok) throw new Error(`Calendly ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export type CalendlyBooking = { uid: string; title: string; startTime: string; endTime: string; cancelled: boolean; name?: string; email?: string; phone?: string; leadId?: string; updatedAt: string };

// Recent Aangan consultations (created or updated in the last `days`), one entry per invitee.
export async function recentBookings(days = 3): Promise<CalendlyBooking[]> {
  if (!process.env.CALENDLY_TOKEN || !process.env.CALENDLY_USER_URI) return [];
  const minStart = new Date(Date.now() - days * 864e5).toISOString();
  const out: CalendlyBooking[] = [];
  for (const status of ['active', 'canceled']) {
    const ev = await cal<{ collection: any[] }>(`/scheduled_events?user=${encodeURIComponent(process.env.CALENDLY_USER_URI)}&status=${status}&min_start_time=${minStart}&count=50&sort=start_time:asc`);
    for (const e of ev.collection) {
      if (process.env.CALENDLY_EVENT_TYPE_URI && e.event_type !== process.env.CALENDLY_EVENT_TYPE_URI) continue;
      const inv = await cal<{ collection: any[] }>(`/scheduled_events/${e.uri.split('/').pop()}/invitees?count=10`);
      for (const i of inv.collection) {
        const qa = (i.questions_and_answers ?? []).map((q: any) => String(q.answer ?? '')).join(' ');
        const phone = i.text_reminder_number ?? (qa.match(/\+?\d[\d\s-]{8,}\d/)?.[0] ?? undefined);
        out.push({
          uid: e.uri.split('/').pop(), title: e.name, startTime: e.start_time, endTime: e.end_time,
          cancelled: status === 'canceled' || i.status === 'canceled', name: i.name, email: i.email, phone,
          leadId: i.tracking?.utm_content ?? undefined, updatedAt: i.updated_at ?? e.updated_at,
        });
      }
    }
  }
  return out;
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
