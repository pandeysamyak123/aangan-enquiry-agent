// Streams a call recording from Vaani with our server-side API key (the key never reaches the browser).
export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ callId: string }> }) {
  const { callId } = await params;
  if (!process.env.VAANI_API_KEY) return new Response('Recording unavailable', { status: 503 });
  const upstream = await fetch(`https://api.vaanivoice.ai/api/stream/${encodeURIComponent(callId)}`, {
    headers: { 'X-API-Key': process.env.VAANI_API_KEY, ...(req.headers.get('range') ? { Range: req.headers.get('range')! } : {}) },
  });
  if (!upstream.ok && upstream.status !== 206) return new Response('Recording not found', { status: upstream.status === 404 ? 404 : 502 });
  const headers = new Headers({ 'Content-Type': upstream.headers.get('content-type') ?? 'audio/mpeg', 'Cache-Control': 'private, max-age=3600' });
  for (const h of ['content-length', 'content-range', 'accept-ranges']) { const v = upstream.headers.get(h); if (v) headers.set(h, v); }
  return new Response(upstream.body, { status: upstream.status, headers });
}
