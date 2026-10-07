// Resend — caller confirmation with booking link, designer email copy, Nikhil's daily digest.
export const emailEnabled = () => !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;

export async function sendEmail(p: { to: string | string[]; subject: string; html: string; replyTo?: string }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: p.to, subject: p.subject, html: p.html, reply_to: p.replyTo }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return ((await res.json()) as { id: string }).id;
}
