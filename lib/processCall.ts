// Turns a terminal Vaani event into one processed call, exactly once per room.
// call_postprocessing carries entities; call_ended doesn't, so we fetch call_details (and retry later if not ready).
import { db, recordEvent } from './db.ts';
import { parseCall, roomOf, type VaaniEnvelope } from './vaani.ts';
import { waitForCallDetails } from './vaaniApi.ts';
import { handleCall } from './pipeline.ts';

export async function processCall(env: VaaniEnvelope, eventId: string, opts: { waitMs?: number } = {}): Promise<string> {
  const room = roomOf(env);

  // Already processed (postprocessing and call_ended both arrive for the same call).
  const { data: done } = await db().from('calls').select('id').eq('vaani_call_id', room).limit(1);
  if (done?.length) return 'skipped: already processed';

  // Caller's number arrives on call_started; join it in by room.
  if (!env.data.phone_number) {
    const { data: started } = await db()
      .from('webhook_events')
      .select('payload')
      .eq('source', 'vaani')
      .in('type', ['call_started', 'user_picked_up_at'])
      .filter('payload->>room_name', 'eq', room)
      .limit(1);
    const phone = (started?.[0]?.payload as any)?.phone_number;
    if (phone) env.data.phone_number = phone;
  }

  if (env.type === 'call_ended' && !env.data.entities) {
    const details = await waitForCallDetails(room, opts.waitMs ?? 45_000);
    if (!details) return 'pending: call_details not ready — sweep will retry';
    env.data.entities = details.entity;
    env.data.summary = details.summary;
    env.data.transcript = details.transcription;
    env.data.recording_url ??= `https://api.vaanivoice.ai/api/stream/${room}`;
  }

  // Claim the room so a concurrent call_ended / call_postprocessing can't double-send.
  const lockId = `vaani:process:${room}`;
  if (!(await recordEvent(lockId, 'vaani', 'process_lock', { room, by: eventId }))) return 'skipped: being processed by another event';
  let r;
  try {
    r = await handleCall(parseCall(env), eventId);
  } catch (e) {
    await db().from('webhook_events').delete().eq('id', lockId); // allow a retry
    throw e;
  }
  await db().from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('id', lockId);
  return `${r.verdict.route}${r.verdict.mismatch ? ' (mismatch)' : ''} · ${JSON.stringify(r.steps)}`;
}
