// Signed one-tap links in emails (Claim / Called / Booked / Not a fit / Showed up / Won).
// GET shows a confirm page; only POST records the action, so mail scanners that prefetch links can't trigger it.
import crypto from 'node:crypto';

export const LEAD_ACTIONS = ['claim', 'called', 'booked', 'notfit', 'showed', 'noshow', 'won', 'lost', 'reviewed'] as const;
export type LeadAction = (typeof LEAD_ACTIONS)[number];

const TTL_DAYS = 60;
const b64 = (s: string) => Buffer.from(s).toString('base64url');
const mac = (payload: string) => crypto.createHmac('sha256', process.env.LINK_SECRET ?? '').update(payload).digest('base64url').slice(0, 32);

export function signAction(leadId: string, action: LeadAction): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_DAYS * 86400;
  const payload = b64(JSON.stringify({ l: leadId, a: action, e: exp }));
  return `${payload}.${mac(payload)}`;
}

export function verifyAction(token: string | null): { leadId: string; action: LeadAction } | null {
  if (!token || !process.env.LINK_SECRET) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = mac(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { l, a, e } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof e !== 'number' || e < Date.now() / 1000 || !LEAD_ACTIONS.includes(a)) return null;
    return { leadId: String(l), action: a };
  } catch {
    return null;
  }
}

export const actionUrl = (leadId: string, action: LeadAction) => `${process.env.APP_URL}/lead?t=${signAction(leadId, action)}`;
