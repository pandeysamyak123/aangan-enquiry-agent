// One call in → route → Supabase → HubSpot → Calendly link → Telegram / email.
// Each outbound integration is optional (skipped until its env vars are set) and failure-isolated:
// a HubSpot outage must never stop the designer getting the Telegram card.
import { db } from './db.ts';
import { route, type Verdict } from './routing.ts';
import { isAfterHours, promiseFor, fmtIst } from './hours.ts';
import { estimateCostPaise, normalisePhone, type ParsedCall } from './vaani.ts';
import * as hubspot from './hubspot.ts';
import * as telegram from './telegram.ts';
import { emailEnabled, sendEmail } from './email.ts';
import { calendlyEnabled, singleUseLink } from './calendly.ts';

const OPEN_STATUSES = ['new', 'claimed', 'called', 'booked'];
const REDIAL_WINDOW_MS = 30 * 60_000;

type Lead = { id: string; phone: string | null; name: string | null; route: string; status: string; created_at: string; hubspot_contact_id: string | null; hubspot_deal_id: string | null; telegram_message_id: number | null };

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
      body: [call.summary, d.scope && `Scope: ${d.scope}`, verdict.flags.length ? `Flags: ${verdict.flags.join(' | ')}` : ''].filter(Boolean).join('\n\n'),
    });
    await db().from('leads').update({ hubspot_contact_id: contact.id, hubspot_deal_id: dealId ?? null }).eq('id', lead.id);
    return `contact ${contact.id}${contact.existed ? ' (existing)' : ''}${dealId ? `, deal ${dealId}` : ''}`;
  });

  // Calendly: single-use link for qualified callers who didn't book on the call.
  let bookingLink: string | undefined;
  await run('calendly', calendlyEnabled() && verdict.route === 'QUALIFIED' && !d.booked_slot, async () => {
    bookingLink = await singleUseLink(lead.id, { name: d.caller_name, email: d.caller_email, phone });
    await db().from('leads').update({ booking_link: bookingLink }).eq('id', lead.id);
    return 'link created';
  });

  // Telegram: designers get qualified leads; Nikhil gets escalations, mismatches and call-backs.
  await run('telegram', telegram.telegramEnabled(), async () => {
    const sent: string[] = [];
    if (verdict.route === 'QUALIFIED' && !lead.telegram_message_id && process.env.TELEGRAM_DESIGNERS_CHAT_ID) {
      const id = await telegram.sendMessage(process.env.TELEGRAM_DESIGNERS_CHAT_ID, leadCard(call, verdict, phone, afterHours, promiseAt, bookingLink), telegram.leadButtons(lead.id, 'new', call.recordingUrl));
      await db().from('leads').update({ telegram_message_id: id }).eq('id', lead.id);
      sent.push('designers');
    }
    const nikhil = process.env.TELEGRAM_NIKHIL_CHAT_ID;
    if (nikhil && (verdict.route === 'ESCALATE' || verdict.mismatch || ['MISSED', 'INCOMPLETE'].includes(verdict.route))) {
      await telegram.sendMessage(nikhil, alertCard(call, verdict, phone, promiseAt));
      sent.push('nikhil');
    }
    return sent.length ? `sent to ${sent.join(', ')}` : 'nothing to send for this route';
  });

  // Email: caller gets their booking link (if they gave an email); designers get a copy of the card.
  await run('email', emailEnabled(), async () => {
    const sent: string[] = [];
    if (verdict.route === 'QUALIFIED' && d.caller_email && bookingLink) {
      await sendEmail({ to: d.caller_email, subject: 'Your free design consultation with Aangan Studio', html: callerEmail(d.caller_name, bookingLink) });
      sent.push('caller');
    }
    if (verdict.route === 'QUALIFIED' && process.env.DESIGNERS_EMAIL) {
      await sendEmail({ to: process.env.DESIGNERS_EMAIL.split(','), subject: `New lead: ${d.caller_name ?? 'caller'} · ${d.property ?? ''} ${d.location_area ?? ''}`, html: `<pre style="font-family:inherit;white-space:pre-wrap">${leadCard(call, verdict, phone, afterHours, promiseAt, bookingLink)}</pre>` });
      sent.push('designers');
    }
    return sent.length ? `sent to ${sent.join(', ')}` : 'nothing to send for this route';
  });

  await db().from('lead_actions').insert({ lead_id: lead.id, actor: 'system', action: `call_${verdict.route.toLowerCase()}`, detail: { call_id: callRow.id, steps } });
  return { leadId: lead.id, callId: callRow.id, verdict, returning, merged: !!existing, steps };
}

const ROUTE_BADGE: Record<string, string> = { QUALIFIED: '🟢 NEW LEAD · Qualified', ESCALATE: '🔴 ESCALATION · Existing client', MISSED: '⚪ MISSED CALL', INCOMPLETE: '🟡 DROPPED CALL', DECLINED: '⚫ Declined', NURTURE: '🔵 Nurture' };

function leadCard(call: ParsedCall, v: Verdict, phone: string | undefined, afterHours: boolean, promiseAt: Date | null, bookingLink?: string) {
  const d = call.input.data ?? {};
  const e = telegram.esc;
  const lines = [
    `<b>${ROUTE_BADGE[v.route] ?? v.route}</b> · ${fmtIst(call.endedAt)}${afterHours ? ' (after hours)' : ''}`,
    `<b>${e(d.caller_name ?? 'Name not given')}</b> · ${e(phone ?? 'number not captured')}${d.preferred_callback_time ? ` · call back: ${e(d.preferred_callback_time)}` : ''}`,
    `${e(d.property ?? '')} · ${e(d.location_area ?? '')}${d.carpet_area_sqft ? ` · ~${e(d.carpet_area_sqft)} sq ft` : ''}`,
    d.scope ? `Scope: “${e(d.scope)}”` : '',
    `Execution: ${e(d.execution_wanted ?? '?')} · State: ${e(d.current_state ?? '—')} · Needed by: ${e(d.timeline ?? '—')}`,
    `Decision: ${e(d.caller_role ?? '—')} · Budget: ${e(d.budget_volunteered || 'not mentioned')}`,
    d.referral_source ? `Source: ${e(d.referral_source)}` : '',
    d.notes_for_designer ? `Note: ${e(d.notes_for_designer)}` : '',
    d.booked_slot ? `📅 Booked on call: ${fmtIst(d.booked_slot)}` : bookingLink ? `📅 Booking link sent to caller` : '',
    ...v.flags.map((f) => `⚑ ${e(f)}`),
    promiseAt ? `⏱ Promise: call by ${fmtIst(promiseAt)}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

function alertCard(call: ParsedCall, v: Verdict, phone: string | undefined, promiseAt: Date | null) {
  const d = call.input.data ?? {};
  const e = telegram.esc;
  return [
    `<b>${ROUTE_BADGE[v.route] ?? v.route}${v.mismatch ? ' · ⚠ REVIEW' : ''}</b> · ${fmtIst(call.endedAt)}`,
    `${e(d.caller_name ?? 'Unknown caller')} · ${e(phone ?? 'number masked — see Vaani call log')}`,
    d.escalation_detail ? `Issue: ${e(d.escalation_detail)}` : '',
    call.summary ? `Summary: ${e(call.summary)}` : '',
    ...v.flags.map((f) => `⚑ ${e(f)}`),
    promiseAt ? `⏱ Promise: by ${fmtIst(promiseAt)}` : '',
  ].filter(Boolean).join('\n');
}

function callerEmail(name: string | undefined, link: string) {
  return `<p>Hi ${telegram.esc(name ?? 'there')},</p>
<p>Thank you for calling Aangan Studio. As promised, here is your link to pick a time for your free design consultation:</p>
<p><a href="${link}" style="background:#2f5d50;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Choose a consultation time</a></p>
<p>Your designer will also call you to introduce themselves. The consultation is free and there's no obligation.</p>
<p>— Aangan Studio, Pune</p>`;
}
