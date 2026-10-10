// Sends Vaani AI–shaped webhook events built from the Sept transcripts:
// call_started (carries the caller's number) then call_postprocessing (entities, summary, duration in ms).
// Usage: npm run simulate -- T01 T09 T08      (target: APP_URL; override with TARGET=http://localhost:3000)
import { fixtures } from '../lib/fixtures.ts';

const base = (process.env.TARGET ?? process.env.APP_URL ?? 'http://localhost:3000') + '/api/vaani/webhook';
const secret = process.env.VAANI_WEBHOOK_SECRET;
if (!secret) throw new Error('VAANI_WEBHOOK_SECRET not set');
const url = `${base}?token=${encodeURIComponent(secret)}`;

const ids = process.argv.slice(2);
const chosen = ids.length ? fixtures.filter((f) => ids.includes(f.id)) : fixtures.filter((f) => /^T/.test(f.id));
// Redial and returning-caller cases share a number.
const PHONES: Record<string, string> = { T17a: '+919822000017', T17b: '+919822000017' };

const post = async (body: unknown) => {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return `${res.status} ${await res.text()}`;
};

for (const [i, f] of chosen.entries()) {
  const room = `sim-${f.id}-${Date.now()}`;
  const phone = PHONES[f.id] ?? `+9198220${String(10000 + i).slice(-5)}`;
  await post({ event: 'call_started', room_name: room, status: 'active', phone_number: phone });

  const completed = f.call.status === 'COMPLETED';
  const entities = { ...(f.call.data ?? {}) } as Record<string, unknown>;
  const route = entities.route;
  delete entities.route;
  if (completed && Object.keys(entities).length) entities.callback_number = phone;
  const final = completed
    ? {
        event: 'call_postprocessing',
        call_id: room,
        timestamp: new Date().toISOString(),
        data: {
          room_name: room, call_id: room, call_duration: (f.call.durationSec ?? 0) * 1000, end_reason: 'Call ended',
          summary: `[SIMULATED ${f.id}] ${f.note}`, entities, dispositions: route ? { route } : {},
          recording_url: null, transcript: `[SIMULATED] ${f.note}`,
        },
      }
    : { event: 'call_failed', room_name: room, status: 'failed', error: 'NO_ANSWER' };
  console.log(`${f.id.padEnd(5)} expected ${f.expected.padEnd(10)} → ${await post(final)}`);
}
