// Shared-password session for the CRM: an HMAC-signed expiry in an httpOnly cookie.
// Uses Web Crypto so the same code runs in middleware (edge) and server actions (node).
export const SESSION_COOKIE = 'aangan_session';
export const SESSION_DAYS = 30;

const enc = new TextEncoder();
async function hmac(data: string) {
  const secret = (process.env.LINK_SECRET ?? '') + ':session';
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function makeSession() {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  return `${exp}.${await hmac(String(exp))}`;
}

export async function validSession(value: string | undefined) {
  if (!value || !process.env.LINK_SECRET) return false;
  const [exp, sig] = value.split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const expected = await hmac(exp);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
