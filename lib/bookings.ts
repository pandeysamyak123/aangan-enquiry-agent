// Applies a Cal.com booking to the matching lead: stage, HubSpot meeting + deal stage, designer email.
// Live bookings made by Meera can arrive before the call is processed; those wait as "unmatched"
// and are claimed by the pipeline when the call lands (see claimPendingBookings).
import { db } from './db.ts';
import * as hubspot from './hubspot.ts';
import { emailEnabled, sendEmail, designerRecipients } from './email.ts';
import { fmtIst } from './hours.ts';
import type { CalBooking } from './calcom.ts';

const last10 = (p?: string | null) => (p ?? '').replace(/\D/g, '').slice(-10);

async function findLead(c: { leadId?: string; phone?: string; email?: string }) {
  if (c.leadId) {
    const { data } = await db().from('leads').select('*').eq('id', c.leadId).maybeSingle();
    if (data) return data;
  }
  const digits = last10(c.phone);
  if (digits.length === 10) {
    const { data } = await db().from('leads').select('*').ilike('phone', `%${digits}`).order('created_at', { ascending: false }).limit(1);
    if (data?.[0]) return data[0];
  }
  if (c.email) {
    const { data } = await db().from('calls').select('lead_id').filter('collected->>caller_email', 'ilike', c.email).order('created_at', { ascending: false }).limit(1);
    if (data?.[0]?.lead_id) {
      const { data: lead } = await db().from('leads').select('*').eq('id', data[0].lead_id).single();
      if (lead) return lead;
    }
  }
  return null;
}

export async function applyBooking(trigger: string, b: CalBooking, c: { name: string; email: string; phone?: string; leadId?: string }) {
  const lead = await findLead(c);
  if (!lead) return `unmatched: ${c.name || c.email || c.phone || b.uid}`;
  const start = new Date(b.startTime);
  const cancelled = trigger === 'BOOKING_CANCELLED';
  const now = new Date().toISOString();

  await db().from('leads').update(cancelled
    ? { status: lead.called_at ? 'called' : lead.claimed_at ? 'claimed' : 'new', consultation_at: null, updated_at: now }
    : { status: ['won', 'consulted'].includes(lead.status) ? lead.status : 'booked', booked_at: lead.booked_at ?? now, consultation_at: start.toISOString(), calendly_event_uri: `calcom:${b.uid}`, updated_at: now },
  ).eq('id', lead.id);
  await db().from('lead_actions').insert({ lead_id: lead.id, actor: 'Cal.com', action: cancelled ? 'booking_cancelled' : trigger === 'BOOKING_RESCHEDULED' ? 'booking_rescheduled' : 'booked', detail: { start: b.startTime, uid: b.uid } });

  if (hubspot.hubspotEnabled() && (lead.hubspot_contact_id || lead.hubspot_deal_id)) {
    try {
      if (!cancelled && lead.hubspot_contact_id) await hubspot.logMeeting({ contactId: lead.hubspot_contact_id, dealId: lead.hubspot_deal_id ?? undefined, title: b.title ?? 'Aangan design consultation', start, end: new Date(b.endTime), body: `Booked via Cal.com${c.email ? ` by ${c.email}` : ''}` });
      if (lead.hubspot_deal_id) await hubspot.setDealStage(lead.hubspot_deal_id, cancelled ? 'CLAIMED' : 'BOOKED');
      await hubspot.addNote({ contactId: lead.hubspot_contact_id, dealId: lead.hubspot_deal_id, body: `<p><b>Consultation ${cancelled ? 'cancelled' : trigger === 'BOOKING_RESCHEDULED' ? 'rescheduled' : 'booked'}</b> · ${fmtIst(start)} (Cal.com)</p>` });
    } catch (e) { console.error('[booking] hubspot', e); }
  }

  if (emailEnabled()) {
    const to = await designerRecipients();
    if (to.length) {
      const verb = cancelled ? 'cancelled' : trigger === 'BOOKING_RESCHEDULED' ? 'moved' : 'booked';
      await sendEmail({
        to, kind: 'alert', leadId: lead.id,
        subject: `📅 Consultation ${verb}: ${lead.name ?? c.name} · ${fmtIst(start)}`,
        html: `<p>The consultation with <b>${lead.name ?? c.name}</b> was <b>${verb}</b> for <b>${fmtIst(start)}</b>.</p><p>Phone: ${lead.phone ?? c.phone ?? '—'} · Email: ${c.email || '—'}</p><p><a href="${process.env.APP_URL}/dashboard/leads/${lead.id}">Open the lead in the CRM</a></p>`,
      });
    }
  }
  return `${cancelled ? 'cancelled' : 'booked'} for lead ${lead.id}`;
}

// Called by the call pipeline once a lead exists: applies any booking that arrived first.
export async function claimPendingBookings(phone?: string) {
  const digits = last10(phone);
  if (digits.length !== 10) return 0;
  const since = new Date(Date.now() - 2 * 864e5).toISOString();
  const { data } = await db().from('webhook_events').select('id, type, payload').eq('source', 'calcom').like('error', 'unmatched%').gte('received_at', since);
  let n = 0;
  for (const ev of data ?? []) {
    const p = (ev.payload as any)?.payload as CalBooking;
    const { bookingContact } = await import('./calcom.ts');
    const c = bookingContact(p);
    if (last10(c.phone) !== digits) continue;
    const out = await applyBooking(ev.type, p, c);
    if (!out.startsWith('unmatched')) { await db().from('webhook_events').update({ error: null, processed_at: new Date().toISOString() }).eq('id', ev.id); n++; }
  }
  return n;
}
