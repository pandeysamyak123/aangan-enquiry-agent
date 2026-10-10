// Resend: every email the system sends goes through here and is logged in the `emails` table,
// so the CRM can show what was sent, to whom, and whether it was delivered or opened.
import { db } from './db.ts';

export const emailEnabled = () => !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
export type EmailKind = 'handoff' | 'alert' | 'caller' | 'overdue' | 'digest' | 'test';

export async function sendEmail(p: { to: string | string[]; subject: string; html: string; replyTo?: string; kind: EmailKind; leadId?: string | null; callId?: string | null }) {
  const to = Array.isArray(p.to) ? p.to : [p.to];
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject: p.subject, html: p.html, reply_to: p.replyTo }),
  });
  const text = await res.text();
  const log = { lead_id: p.leadId ?? null, call_id: p.callId ?? null, kind: p.kind, to_addresses: to, subject: p.subject, html: p.html };
  if (!res.ok) {
    await db().from('emails').insert({ ...log, status: 'failed', error: `${res.status}: ${text.slice(0, 300)}` });
    throw new Error(`Resend ${res.status}: ${text.slice(0, 300)}`);
  }
  const id = (JSON.parse(text) as { id: string }).id;
  await db().from('emails').insert({ ...log, resend_id: id, status: 'sent', last_event: 'sent', last_event_at: new Date().toISOString() });
  return id;
}

// Live delivery status from Resend (delivered / opened / clicked / bounced …), cached on the row.
export async function refreshEmailStatus(resendId: string) {
  const res = await fetch(`https://api.resend.com/emails/${resendId}`, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
  if (!res.ok) return null;
  const e = (await res.json()) as { last_event?: string };
  if (e.last_event) await db().from('emails').update({ last_event: e.last_event, last_event_at: new Date().toISOString() }).eq('resend_id', resendId);
  return e.last_event ?? null;
}

// Handoff recipients: active designers with an email in the CRM; falls back to DESIGNERS_EMAIL.
export async function designerRecipients(): Promise<string[]> {
  const { data } = await db().from('designers').select('email').eq('active', true).not('email', 'is', null);
  const fromDb = (data ?? []).map((d) => String(d.email).trim()).filter(Boolean);
  if (fromDb.length) return [...new Set(fromDb)];
  return (process.env.DESIGNERS_EMAIL ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}
