// Vaani AI REST API (server-only). Used when a webhook only tells us the call ended:
// we fetch the post-processed details (entities, summary, transcript) ourselves.
// Docs: https://docs.vaanivoice.ai/api-reference/call-details
const API = 'https://api.vaanivoice.ai/api';
const NOT_READY = 'Transcript is not available';

export type CallDetails = { transcription?: string; entity?: Record<string, unknown>; summary?: string; call_eval_tag?: string | null; conversation_eval?: unknown };

export async function fetchCallDetails(callId: string): Promise<CallDetails | null> {
  const key = process.env.VAANI_API_KEY;
  if (!key) throw new Error('VAANI_API_KEY not set');
  const res = await fetch(`${API}/call_details/${encodeURIComponent(callId)}`, { headers: { 'X-API-Key': key } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Vaani call_details ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const d = (await res.json()) as CallDetails;
  if (typeof d.entity === 'string' || String(d.summary ?? '').startsWith(NOT_READY)) return null; // not processed yet
  return d;
}

// Poll until post-processing finishes (it usually takes seconds) or we run out of time.
export async function waitForCallDetails(callId: string, budgetMs = 45_000, everyMs = 7_000): Promise<CallDetails | null> {
  const until = Date.now() + budgetMs;
  for (;;) {
    const d = await fetchCallDetails(callId);
    if (d || Date.now() + everyMs > until) return d;
    await new Promise((r) => setTimeout(r, everyMs));
  }
}
