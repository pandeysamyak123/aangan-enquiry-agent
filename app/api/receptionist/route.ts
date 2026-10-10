// Starts an in-browser voice session with Meera (Vaani WebRTC). The API key stays on the server.
// A public "talk" button spends real Vaani minutes, so sessions are capped per visitor and per day.
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PER_VISITOR_PER_DAY = Number(process.env.RECEPTIONIST_PER_VISITOR ?? 5);
const PER_DAY = Number(process.env.RECEPTIONIST_DAILY_CAP ?? 60);
const MAX_SESSION_SECONDS = 240;

export async function POST(req: Request) {
  if (!process.env.VAANI_API_KEY || !process.env.VAANI_AGENT_ID) return NextResponse.json({ error: 'Receptionist is not configured' }, { status: 503 });
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const ipHash = crypto.createHash('sha256').update(ip + (process.env.LINK_SECRET ?? '')).digest('hex').slice(0, 32);
  const since = new Date(Date.now() - 864e5).toISOString();

  const [{ count: mine }, { count: all }] = await Promise.all([
    db().from('receptionist_sessions').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', since),
    db().from('receptionist_sessions').select('id', { count: 'exact', head: true }).gte('created_at', since),
  ]);
  if ((mine ?? 0) >= PER_VISITOR_PER_DAY) return NextResponse.json({ error: 'You’ve reached today’s limit for web calls. Please call the studio instead.' }, { status: 429 });
  if ((all ?? 0) >= PER_DAY) return NextResponse.json({ error: 'Meera has taken a lot of web calls today. Please call the studio instead.' }, { status: 429 });

  const res = await fetch('https://api.vaanivoice.ai/api/trigger-call/', {
    method: 'POST',
    headers: { 'X-API-Key': process.env.VAANI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_id: process.env.VAANI_AGENT_ID,
      medium: 'webrtc',
      voice_gender: 'female',
      primary_language: 'en',
      secondary_language: 'hi',
      welcome_message: 'Hello, Aangan Studio — this is Meera. How can I help you today?',
      welcome_interruptible: true,
    }),
  });
  if (!res.ok) {
    console.error('[receptionist] vaani', res.status, (await res.text()).slice(0, 300));
    return NextResponse.json({ error: 'Meera is unavailable right now. Please try again in a minute.' }, { status: 502 });
  }
  const s = (await res.json()) as { token: string; room_name: string; connection_url: string; live_captions_url?: string };
  await db().from('receptionist_sessions').insert({ ip_hash: ipHash, room_name: s.room_name });
  return NextResponse.json({
    token: s.token,
    url: s.connection_url.replace(/^http/, 'ws'),
    room: s.room_name,
    captionsUrl: s.live_captions_url ?? null,
    maxSeconds: MAX_SESSION_SECONDS,
  });
}
