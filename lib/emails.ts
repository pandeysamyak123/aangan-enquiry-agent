// Email templates. Plain, phone-readable HTML; no price figures anywhere (the Cut).
import type { Verdict, CollectedData } from './routing.ts';
import { fmtIst } from './hours.ts';
import { actionUrl, type LeadAction } from './links.ts';

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BTN: Record<LeadAction, [string, string]> = {
  claim: ['🙋 Claim this lead', '#2f5d50'],
  called: ['📞 I called them', '#3a6ea5'],
  booked: ['📅 Consultation booked', '#3a6ea5'],
  notfit: ['✖ Not a fit', '#8a3b3b'],
  showed: ['✓ Showed up', '#2f5d50'],
  noshow: ['✗ No-show', '#8a3b3b'],
  won: ['🏆 Won', '#2f5d50'],
  lost: ['Lost', '#666'],
  reviewed: ['✓ Reviewed', '#2f5d50'],
};

const button = (leadId: string, a: LeadAction) =>
  `<a href="${actionUrl(leadId, a)}" style="display:inline-block;margin:4px 6px 4px 0;padding:10px 14px;border-radius:6px;background:${BTN[a][1]};color:#fff;text-decoration:none;font-weight:600;font-size:14px">${BTN[a][0]}</a>`;

const shell = (title: string, body: string) => `<!doctype html><html><body style="margin:0;background:#f7f5f1;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2421">
<div style="max-width:560px;margin:0 auto;padding:20px 16px">
<div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b6b6b">Aangan Studio · Enquiries</div>
<h1 style="font-size:20px;margin:6px 0 14px">${title}</h1>
<div style="background:#fff;border:1px solid #e7e2da;border-radius:10px;padding:16px">${body}</div>
<p style="font-size:12px;color:#888;margin-top:14px">Sent by the Aangan enquiry agent. Pricing is never discussed on calls; your designer prices at the consultation.</p>
</div></body></html>`;

const row = (k: string, v: unknown) => (v === undefined || v === null || v === '' ? '' : `<tr><td style="padding:4px 10px 4px 0;color:#6b6b6b;font-size:13px;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:4px 0;font-size:14px">${esc(v)}</td></tr>`);

export type CallFacts = { d: CollectedData; v: Verdict; phone?: string; at: Date; afterHours: boolean; promiseAt: Date | null; summary?: string; recordingUrl?: string; bookingLink?: string; leadId: string; durationSec?: number };

export function handoffEmail(f: CallFacts) {
  const { d, v } = f;
  const subject = `New lead: ${d.caller_name ?? 'Caller'} · ${d.property ?? 'project'} · ${d.location_area ?? ''}${f.afterHours ? ' (after hours)' : ''}`;
  const body = `
<p style="margin:0 0 10px;font-size:15px">🟢 <b>Qualified</b> · ${fmtIst(f.at)}${f.afterHours ? ' · after hours' : ''}</p>
<table style="border-collapse:collapse;width:100%">
${row('Caller', d.caller_name ?? 'Name not given')}
${row('Phone', f.phone ?? 'not captured')}
${row('Call back', d.preferred_callback_time)}
${row('Property', [d.property, d.carpet_area_sqft ? `~${d.carpet_area_sqft} sq ft` : ''].filter(Boolean).join(' · '))}
${row('Location', d.location_area)}
${row('Scope', d.scope ? `“${d.scope}”` : '')}
${row('Execution', d.execution_wanted)}
${row('Site', d.current_state)}
${row('Needed by', d.timeline)}
${row('Decision', d.caller_role)}
${row('Budget', d.budget_volunteered || 'not mentioned')}
${row('Source', d.referral_source)}
${row('Consultation', d.consult_location)}
${row('Note', d.notes_for_designer)}
${row('Booking', d.booked_slot ? `Booked on call: ${fmtIst(d.booked_slot)}` : f.bookingLink ? 'Booking link sent to caller' : 'Not booked yet: fix a time when you call')}
</table>
${v.flags.length ? `<p style="margin:12px 0 0;font-size:13px">${v.flags.map((x) => `⚑ ${esc(x)}`).join('<br>')}</p>` : ''}
${f.summary ? `<p style="margin:12px 0 0;font-size:13px;color:#444"><b>Call summary:</b> ${esc(f.summary)}</p>` : ''}
${f.promiseAt ? `<p style="margin:14px 0 6px;font-size:15px">⏱ <b>Promise to caller: call by ${fmtIst(f.promiseAt)}</b></p>` : ''}
<div style="margin-top:8px">${button(f.leadId, 'claim')}${button(f.leadId, 'called')}${button(f.leadId, 'notfit')}</div>
${f.recordingUrl ? `<p style="margin:10px 0 0;font-size:13px"><a href="${esc(f.recordingUrl)}">▶ Call recording</a></p>` : ''}`;
  return { subject, html: shell('New qualified enquiry', body) };
}

export function alertEmail(f: CallFacts) {
  const { d, v } = f;
  const kind = v.route === 'ESCALATE' ? '🔴 Existing client: needs a senior callback' : v.mismatch ? '⚠ Review: agent and rules disagree' : v.route === 'MISSED' ? '⚪ Missed call: call back' : '🟡 Dropped call: call back';
  const subject = `${kind.replace(/^\S+\s/, '')} · ${d.caller_name ?? f.phone ?? 'unknown caller'}`;
  const body = `
<p style="margin:0 0 10px;font-size:15px"><b>${kind}</b> · ${fmtIst(f.at)}</p>
<table style="border-collapse:collapse;width:100%">
${row('Caller', d.caller_name)}
${row('Phone', f.phone ?? 'not captured (see Vaani call log)')}
${row('Issue', d.escalation_detail)}
${row('Agent said', v.agentRoute)}
${row('Rules say', v.mismatch ? `${v.route}${v.declineReason ? ` (${v.declineReason})` : ''}` : '')}
${row('Scope', d.scope)}
${row('Location', d.location_area)}
${row('Budget', d.budget_volunteered)}
</table>
${v.flags.length ? `<p style="margin:12px 0 0;font-size:13px">${v.flags.map((x) => `⚑ ${esc(x)}`).join('<br>')}</p>` : ''}
${f.summary ? `<p style="margin:12px 0 0;font-size:13px;color:#444"><b>Summary:</b> ${esc(f.summary)}</p>` : ''}
${f.promiseAt ? `<p style="margin:14px 0 6px;font-size:15px">⏱ <b>Promise: by ${fmtIst(f.promiseAt)}</b></p>` : ''}
<div style="margin-top:8px">${v.mismatch ? button(f.leadId, 'reviewed') : button(f.leadId, 'called')}</div>
${f.recordingUrl ? `<p style="margin:10px 0 0;font-size:13px"><a href="${esc(f.recordingUrl)}">▶ Call recording</a></p>` : ''}`;
  return { subject, html: shell(kind.replace(/^\S+\s/, ''), body) };
}

export function callerEmail(name: string | undefined, link: string) {
  const body = `<p>Hi ${esc(name ?? 'there')},</p>
<p>Thank you for calling Aangan Studio. As promised, here is your link to pick a time for your free design consultation:</p>
<p><a href="${esc(link)}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#2f5d50;color:#fff;text-decoration:none;font-weight:600">Choose a consultation time</a></p>
<p>Your designer will also call you to introduce themselves. The consultation is free and there's no obligation.</p>`;
  return { subject: 'Your free design consultation with Aangan Studio', html: shell('Your consultation', body) };
}

export type OverdueLead = { id: string; name: string | null; phone: string | null; promise_at: string; route: string; claimed_by_name: string | null; status: string };

export function overdueEmail(leads: OverdueLead[]) {
  const body = `<p style="margin:0 0 10px">These callers were promised a call that hasn't been logged yet:</p>
${leads.map((l) => `<div style="border-top:1px solid #eee;padding:10px 0"><b>${esc(l.name ?? 'Caller')}</b> · ${esc(l.phone ?? '')} · ${esc(l.route)}<br><span style="font-size:13px;color:#8a3b3b">Promised by ${fmtIst(l.promise_at)} · ${l.claimed_by_name ? `claimed by ${esc(l.claimed_by_name)}` : 'not claimed'}</span><br>${l.status === 'new' ? button(l.id, 'claim') : ''}${button(l.id, 'called')}</div>`).join('')}`;
  return { subject: `⏱ ${leads.length} caller${leads.length > 1 ? 's' : ''} waiting past the promised callback`, html: shell('Callbacks overdue', body) };
}

export type DigestCall = { id: string; lead_id: string; route: string; decline_reason: string | null; mismatch: boolean; summary: string | null; collected: CollectedData; created_at: string };

export function digestEmail(day: string, stats: Record<string, number>, declined: DigestCall[], costInr: number) {
  const stat = (k: string, v: number | string) => `<td style="padding:6px 10px;text-align:center"><div style="font-size:20px;font-weight:700">${v}</div><div style="font-size:11px;color:#6b6b6b;text-transform:uppercase">${k}</div></td>`;
  const body = `<table style="width:100%;border-collapse:collapse"><tr>${stat('calls', stats.calls ?? 0)}${stat('qualified', stats.QUALIFIED ?? 0)}${stat('after hours', stats.after_hours ?? 0)}${stat('cost', `₹${costInr.toFixed(0)}`)}</tr></table>
<p style="margin:14px 0 6px"><b>Declined or flagged today (check none were wrongly turned away):</b></p>
${declined.length ? declined.map((c) => `<div style="border-top:1px solid #eee;padding:8px 0;font-size:14px"><b>${esc(c.collected?.caller_name ?? 'Caller')}</b> · ${esc(c.collected?.location_area ?? '')} · <span style="color:#8a3b3b">${esc(c.route)}${c.decline_reason ? ` (${esc(c.decline_reason)})` : ''}${c.mismatch ? ' · agent disagreed' : ''}</span><br><span style="color:#444;font-size:13px">${esc(c.summary ?? c.collected?.scope ?? '')}</span><br>${button(c.lead_id, 'reviewed')}</div>`).join('') : '<p style="color:#6b6b6b">None. 🎉</p>'}`;
  return { subject: `Aangan enquiries · ${day}: ${stats.calls ?? 0} calls, ${stats.QUALIFIED ?? 0} qualified`, html: shell(`Daily summary · ${day}`, body) };
}
