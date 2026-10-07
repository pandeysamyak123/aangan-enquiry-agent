// Sends signed Vaani-style call events to the webhook, built from the Sept transcripts.
// Usage: npm run simulate -- T01 T09 T08      (default target: APP_URL; override with TARGET=http://localhost:3000)
import crypto from 'node:crypto';
import { fixtures } from '../lib/fixtures.ts';

const target = (process.env.TARGET ?? process.env.APP_URL ?? 'http://localhost:3000') + '/api/vaani/webhook';
const secret = process.env.VAANI_WEBHOOK_SECRET;
if (!secret) throw new Error('VAANI_WEBHOOK_SECRET not set');

const ids = process.argv.slice(2);
const chosen = ids.length ? fixtures.filter((f) => ids.includes(f.id)) : fixtures.filter((f) => /^T/.test(f.id));
const PHONES: Record<string, string> = { T17a: '9822000017', T17b: '9822000017', T16: '9822000016' };

for (const [i, f] of chosen.entries()) {
  const now = Math.floor(Date.now() / 1000);
  const data = {
    call_id: `sim_${f.id}_${now}`,
    status: f.call.status,
    duration_sec: f.call.durationSec,
    from_number: '+91 98XXX XX' + String(100 + i).slice(-3),
    started_at: new Date((now - (f.call.durationSec ?? 0)) * 1000).toISOString(),
    ended_at: new Date(now * 1000).toISOString(),
    language: 'en-IN',
    summary: `[SIMULATED ${f.id}] ${f.note}`,
    collected_data: f.call.data && Object.keys(f.call.data).length ? { callback_number: PHONES[f.id] ?? `98220${String(10000 + i).slice(-5)}`, ...f.call.data } : f.call.data,
  };
  const env = { id: `evt_sim_${f.id}_${now}`, type: f.call.status === 'COMPLETED' ? 'call.completed' : 'call.failed', created: now, data };
  const body = JSON.stringify(env);
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  const res = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-VaaniVoice-Event': env.type, 'X-VaaniVoice-Signature': sig }, body });
  console.log(`${f.id.padEnd(5)} expected ${f.expected.padEnd(10)} → HTTP ${res.status} ${await res.text()}`);
}
