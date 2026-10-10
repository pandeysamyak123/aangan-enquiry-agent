// One call in → route → Supabase → HubSpot → Calendly link → email (Resend).
// Each outbound integration is optional (skipped until its env vars are set) and failure-isolated:
// a HubSpot outage must never stop the designer getting the handoff email.
import { db } from './db.ts';
import { route, type Verdict } from './routing.ts';
import { isAfterHours, promiseFor, fmtIst } from './hours.ts';
import { estimateCostPaise, normalisePhone, type ParsedCall } from './vaani.ts';
import * as hubspot from './hubspot.ts';
import { emailEnabled, sendEmail, designerRecipients } from './email.ts';
import { handoffEmail, alertEmail, callerEmail, type CallFacts } from './emails.ts';
import { calendlyEnabled, singleUseLink } from './calendly.ts';
import { calcomEnabled, calcomLink } from './calcom.ts';
import { claimPendingBookings } from './bookings.ts';

const OPEN_STATUSES = ['new', 'claimed', 'called', 'booked'];
const REDIAL_WINDOW_MS = 30 * 60_000;

type Lead = { id: string; phone: string | null; name: string | null; route: string; status: string; created_at: string; hubspot_contact_id: string | null; hubspot_deal_id: string | null; handoff_email_id: string | null };

export type PipelineResult = { leadId: string; callId: string; verdict: Verdict; returning: boolean; merged: boolean; steps: Record<string, string> };

const ROUTE_RANK: Record<string, number> = { MISSED: 0, INCOMPLETE: 1, OTHER: 2, DECLINED: 3, NURTURE: 4, QUALIFIED: 5, ESCALATE: 6 };

export async function handleCall(call: ParsedCall, eventId: string): Promise<PipelineResult> {
  const d = call.input.data ?? {};
  const verdict = route(call.input);
  const at = call.endedAt;
  const afterHours = isAfterHours(call.startedAt ?? at);
  const phone = normalisePhone(d.callback_number) ?? normalisePhone(call.fromNumber);
  const steps: Record<string, string> = {};

  // Returning caller / redial: match on the confirmed phone number.
  let existing: Lead | undefined;
  let returning = false;
  if (phone) {
    const { data: prior } = await db().from('leads').select('*').eq('phone', phone).order('created_at', { ascending: false }).limit(5);
    const recent = (prior ?? []) as Lead[];
    returning = recent.length > 0;
    existing = recent.find((l) => OPEN_STATUSES.includes(l.status) && (at.getTime() - new Date(l.created_at).getTime() < REDIAL_WINDOW_MS || ['MISSED', 'INCOMPLETE'].includes(l.route) || l.route === verdict.route));
    if (returning) verdict.flags.push(existing ? 'returning caller — same enquiry' : `returning caller — earlier enquiry ${fmtIst(recent[0].created_at)}`);
  }

  const promiseAt = promiseFor(verdict.route, call.startedAt ?? at);
  let lead: Lead;
  if (existing) {
    const upgrade = (ROUTE_RANK[verdict.route] ?? 0) > (ROUTE_RANK[existing.route] ?? 0);
    const { data, error } = await db()
      .from('leads')
      .update({ route: upgrade ? verdict.route : existing.route, name: d.caller_name ?? existing.name, promise_at: upgrade ? promiseAt?.toISOString() : undefined, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    lead = data as Lead;
  } else {
    const { data, error } = await db()
      .from('leads')
      .insert({ phone, name: d.caller_name, route: verdict.route, after_hours: afterHours, promise_at: promiseAt?.toISOString(), status: ['DECLINED', 'OTHER'].includes(verdict.route) ? 'closed' : 'new', recontact_at: verdict.route === 'NURTURE' ? new Date(at.getTime() + 28 * 864e5).toISOString().slice(0, 10) : null })
      .select('*')
      .single();
    if (error) throw error;
    lead = data as Lead;
  }

  const { data: callRow, error: callErr } = await db()
    .from('calls')
    .upsert(
      {
        vaani_call_id: call.vaaniCallId, event_id: eventId, lead_id: lead.id, status: call.input.status, from_number: call.fromNumber,
        started_at: call.startedAt?.toISOString(), ended_at: at.toISOString(), duration_sec: call.durationSec, after_hours: afterHours,
        language: call.language, summary: call.summary, transcript: call.transcript ?? null, recording_url: call.recordingUrl, collected: d,
        route: verdict.route, agent_route: verdict.agentRoute, decline_reason: verdict.declineReason, mismatch: verdict.mismatch, flags: verdict.flags,
        cost_paise: estimateCostPaise(call.durationSec), cost_estimated: true,
      },
      { onConflict: 'vaani_call_id' },
    )
    .select('id')
    .single();
  if (callErr) throw callErr;

  const run = async (name: string, enabled: boolean, fn: () => Promise<string | void>) => {
    if (!enabled) return void (steps[name] = 'skipped (not configured)');
    try {
      steps[name] = (await fn()) || 'ok';
    } catch (e) {
      steps[name] = 'error: ' + (e instanceof Error ? e.message : String(e));
      console.error(`[pipeline] ${name}`, e);
    }
  };

  // HubSpot: contact always; deal for QUALIFIED; task for call-backs and nurture; call log.
  await run('hubspot', hubspot.hubspotEnabled(), async () => {
    const contact = await hubspot.upsertContact({ phone, name: d.caller_name, email: d.caller_email, location: d.location_area, referral: d.referral_source });
    let dealId = lead.hubspot_deal_id ?? undefined;
    if (verdict.route === 'QUALIFIED' && !dealId) {
      dealId = await hubspot.createDeal({
        name: `${d.caller_name ?? 'Caller'} — ${d.property ?? 'project'}, ${d.location_area ?? ''}`.trim(),
        contactId: contact.id, leadId: lead.id, scope: d.scope, location: d.location_area, sqft: d.carpet_area_sqft, timeline: d.timeline,
        callerRole: d.caller_role, flags: verdict.flags, afterHours, promiseAt, referral: d.referral_source,
      });
    }
    if (['MISSED', 'INCOMPLETE'].includes(verdict.route) || verdict.route === 'NURTURE' || verdict.route === 'ESCALATE') {
      await hubspot.createTask({
        contactId: contact.id,
        subject: verdict.route === 'ESCALATE' ? `URGENT: existing client — ${d.caller_name ?? ''}` : verdict.route === 'NURTURE' ? `Recontact: ${d.caller_name ?? 'caller'}` : `Call back: ${phone ?? 'unknown number'}`,
        body: verdict.flags.join('\n'),
        dueAt: verdict.route === 'NURTURE' ? new Date(at.getTime() + 28 * 864e5) : promiseAt ?? at,
      });
    }
    await hubspot.logCall({
      contactId: contact.id, dealId, at, durationSec: call.durationSec, recordingUrl: call.recordingUrl, failed: call.input.status !== 'COMPLETED',
      title: `Voice agent · ${verdict.route}${verdict.declineReason ? ` (${verdict.declineReason})` : ''}`,
      body: callBody(call, verdict, lead.id),
    });
    await db().from('leads').update({ hubspot_contact_id: contact.id, hubspot_deal_id: dealId ?? null }).eq('id', lead.id);
    return `contact ${contact.id}${contact.existed ? ' (existing)' : ''}${dealId ? `, deal ${dealId}` : ''}`;
  });

  // Booking: Meera books live via Vaani's Cal.com integration (the booking webhook updates the lead).
  // If nothing was booked on the call, the caller gets a Cal.com link (or Calendly as fallback).
  let bookingLink: string | undefined;
  await run('booking', (calcomEnabled() || calendlyEnabled()) && verdict.route === 'QUALIFIED', async () => {
    const claimed = await claimPendingBookings(phone);
    if (claimed || d.booked_slot) return claimed ? 'booked on the call (Cal.com)' : 'booked on the call';
    bookingLink = calcomEnabled() ? calcomLink(lead.id, { name: d.caller_name, email: d.caller_email, phone }) : await singleUseLink(lead.id, { name: d.caller_name, email: d.caller_email, phone });
    await db().from('leads').update({ booking_link: bookingLink }).eq('id', lead.id);
    return calcomEnabled() ? 'Cal.com link created' : 'Calendly link created';
  });

  // Email (Resend): designers get qualified leads with one-tap actions; front desk / Nikhil get
  // escalations, agent-vs-rules mismatches and call-backs; the caller gets their booking link.
  const facts: CallFacts = { d, v: verdict, phone, at, afterHours, promiseAt, summary: call.summary, recordingUrl: call.recordingUrl, bookingLink, leadId: lead.id, durationSec: call.durationSec };
  await run('email', emailEnabled(), async () => {
    const sent: string[] = [];
    const list = (s?: string) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const designers = await designerRecipients();
    if (verdict.route === 'QUALIFIED' && !lead.handoff_email_id && designers.length) {
      const id = await sendEmail({ to: designers, ...handoffEmail(facts), kind: 'handoff', leadId: lead.id, callId: callRow.id });
      await db().from('leads').update({ handoff_email_id: id }).eq('id', lead.id);
      sent.push('designers');
    }
    const alertTo = list(process.env.FRONT_DESK_EMAIL || process.env.NIKHIL_EMAIL);
    if (alertTo.length && (verdict.route === 'ESCALATE' || verdict.mismatch || ['MISSED', 'INCOMPLETE'].includes(verdict.route))) {
      const to = verdict.route === 'ESCALATE' ? [...new Set([...alertTo, ...list(process.env.NIKHIL_EMAIL)])] : alertTo;
      await sendEmail({ to, ...alertEmail(facts), kind: 'alert', leadId: lead.id, callId: callRow.id });
      sent.push('front desk');
    }
    if (verdict.route === 'QUALIFIED' && d.caller_email && bookingLink) {
      await sendEmail({ to: d.caller_email, ...callerEmail(d.caller_name, bookingLink), kind: 'caller', leadId: lead.id, callId: callRow.id });
      sent.push('caller');
    }
    return sent.length ? `sent to ${sent.join(', ')}` : 'nothing to send for this route';
  });

  await db().from('lead_actions').insert({ lead_id: lead.id, actor: 'system', action: `call_${verdict.route.toLowerCase()}`, detail: { call_id: callRow.id, steps } });
  return { leadId: lead.id, callId: callRow.id, verdict, returning, merged: !!existing, steps };
}

// Everything about the call, as the HubSpot call log body (HubSpot renders basic HTML).
const FIELD_ORDER: [keyof NonNullable<ParsedCall['input']['data']>, string][] = [
  ['caller_name', 'Name'], ['callback_number', 'Callback'], ['caller_email', 'Email'], ['caller_role', 'Decision-maker'],
  ['project_type', 'Project type'], ['property', 'Property'], ['location_area', 'Location'], ['carpet_area_sqft', 'Carpet area (sq ft)'],
  ['scope', 'Scope'], ['execution_wanted', 'Wants execution'], ['current_state', 'Site state'], ['timeline', 'Timeline'],
  ['budget_volunteered', 'Budget (volunteered)'], ['referral_source', 'Source'], ['pricing_asked', 'Asked about price'],
  ['preferred_callback_time', 'Best time to call'], ['consult_location', 'Consultation at'], ['booked_slot', 'Booked slot'],
  ['notes_for_designer', 'Notes'], ['escalation_detail', 'Escalation'],
];
const h = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function callBody(call: Pick<ParsedCall, "summary" | "transcript" | "input">, v: Pick<Verdict, "route" | "declineReason" | "mismatch" | "agentRoute" | "flags">, leadId: string) {
  const d = (call.input.data ?? {}) as Record<string, unknown>;
  const fields = FIELD_ORDER.filter(([k]) => d[k] !== undefined && d[k] !== null && d[k] !== '').map(([k, l]) => `<li><b>${l}:</b> ${h(d[k])}</li>`).join('');
  const transcript = typeof call.transcript === 'string' ? call.transcript : Array.isArray(call.transcript) ? call.transcript.map((m: any) => `${m.role ?? ''}: ${m.text ?? ''}`).join('\n') : '';
  return [
    `<p><b>Route:</b> ${v.route}${v.declineReason ? ` (${v.declineReason})` : ''}${v.mismatch ? ` · agent said ${v.agentRoute}, needs review` : ''}</p>`,
    call.summary ? `<p><b>Summary:</b> ${h(call.summary)}</p>` : '',
    fields ? `<ul>${fields}</ul>` : '',
    v.flags.length ? `<p><b>Flags:</b> ${v.flags.map(h).join(' · ')}</p>` : '',
    process.env.APP_URL ? `<p><a href="${process.env.APP_URL}/dashboard/leads/${leadId}">Open in Aangan CRM</a></p>` : '',
    transcript ? `<p><b>Transcript</b></p><pre>${h(transcript).slice(0, 60000)}</pre>` : '',
  ].filter(Boolean).join('');
}

