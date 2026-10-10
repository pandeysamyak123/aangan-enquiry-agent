// Vaani AI (app.vaanivoice.ai) webhooks: auth + defensive parsing.
// Docs: https://docs.vaanivoice.ai/guides/webhook-setup
// Events are { event, room_name, ... }; the full call arrives in `call_postprocessing` as
// { event, call_id, timestamp, data: { call_duration (ms), summary, transcript, entities, dispositions, recording_url } }.
// Vaani AI does not sign webhooks, so the registered URL carries a secret token (?token=…) that we check.
import crypto from 'node:crypto';
import type { CallInput, CollectedData } from './routing.ts';

export type VaaniEnvelope = { id: string; type: string; created: number; data: Record<string, unknown> };

// Accepts either our URL token or (if Vaani adds signing later) an HMAC header.
export function verifyVaani(rawBody: string, header: string | null, secret: string, urlToken?: string | null): boolean {
  const same = (x: string, y: string) => {
    const a = Buffer.from(x);
    const b = Buffer.from(y);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  if (urlToken && same(urlToken, secret)) return true;
  if (!header) return false;
  return same(header, 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex'));
}

// Normalise a raw Vaani AI body into our envelope shape.
export function toEnvelope(body: Record<string, any>): VaaniEnvelope {
  const type = String(body.event ?? body.type ?? 'unknown');
  const data = body.data && typeof body.data === 'object' ? { ...body, ...body.data } : { ...body };
  delete (data as any).data;
  const ref = data.call_id ?? data.room_name ?? crypto.randomUUID();
  const created = body.timestamp ? Math.floor(new Date(body.timestamp).getTime() / 1000) : Math.floor(Date.now() / 1000);
  return { id: `${type}:${ref}`, type, created, data };
}

export const roomOf = (env: VaaniEnvelope) => String(env.data.room_name ?? env.data.call_id ?? '');

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const pick = (o: Obj, ...keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
};
const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v));

function toDate(v: unknown): Date | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export type ParsedCall = {
  vaaniCallId: string;
  input: CallInput;
  fromNumber?: string;
  startedAt?: Date;
  endedAt: Date;
  durationSec?: number;
  language?: string;
  summary?: string;
  transcript?: unknown;
  recordingUrl?: string;
};

// Collected fields may arrive under several names depending on how the flow is built.
function collected(d: Obj): CollectedData {
  const raw = pick(d, 'entities', 'collected_data', 'collectedData', 'collected', 'fields', 'extracted', 'extracted_data', 'variables', 'lead');
  const base: Obj = isObj(raw) ? { ...raw } : {};
  // Vaani AI dispositions: we configure one called "route" (QUALIFIED / NURTURE / DECLINED / ESCALATE / OTHER).
  const disp = d.dispositions;
  if (isObj(disp) && !base.route) {
    const r = disp.route ?? disp.Route ?? Object.values(disp)[0];
    if (r) base.route = String(r).toUpperCase().replace(/\s+/g, '_');
  }
  // Booleans and numbers often come back as strings from extraction.
  for (const k of ['carpet_area_sqft', 'timeline_weeks']) if (typeof base[k] === 'string') base[k] = parseFloat(String(base[k]).replace(/[^\d.]/g, '')) || undefined;
  // Some flows return [{ name, value }] pairs.
  if (Array.isArray(raw)) for (const f of raw) if (isObj(f) && f.name) base[String(f.name)] = f.value;
  return base as CollectedData;
}

export function parseCall(env: VaaniEnvelope): ParsedCall {
  const d = isObj(env.data) ? env.data : {};
  const call = isObj(d.call) ? { ...d, ...d.call } : d;
  const failed = ['call.failed', 'call_failed', 'call_no_answer', 'call_rejected'].includes(env.type);
  const status = failed ? 'FAILED' : 'COMPLETED';
  const endedAt = toDate(pick(call, 'ended_at', 'endedAt', 'end_time', 'timestamp')) ?? new Date(env.created * 1000);
  // call_postprocessing reports milliseconds; call_ended reports seconds.
  const ms = env.type === 'call_postprocessing' && call.call_duration !== undefined;
  const durationRaw = ms ? Number(call.call_duration) / 1000 : pick(call, 'call_duration', 'duration_sec', 'durationSec', 'duration_seconds', 'duration');
  return {
    vaaniCallId: str(pick(call, 'call_id', 'callId', 'session_id', 'sessionId', 'id')) ?? env.id,
    fromNumber: str(pick(call, 'from_number', 'fromNumber', 'phone_number', 'caller_number', 'from', 'caller', 'phone')),
    startedAt: toDate(pick(call, 'started_at', 'startedAt', 'start_time')),
    endedAt,
    durationSec: durationRaw !== undefined ? Math.round(Number(durationRaw)) : undefined,
    language: str(pick(call, 'language', 'lang')),
    summary: str(pick(call, 'summary', 'call_summary')),
    transcript: pick(call, 'transcript', 'messages'),
    recordingUrl: str(pick(call, 'recording_url', 'recordingUrl', 'recording')),
    input: {
      status,
      durationSec: durationRaw !== undefined ? Number(durationRaw) : undefined,
      data: collected(call),
    },
  };
}

// Voice is billed in whole minutes (docs/api/billing). Used until usage.charged gives the real debit.
export function estimateCostPaise(durationSec: number | undefined): number {
  const rate = Number(process.env.VAANI_PAISE_PER_MIN ?? 240);
  return durationSec ? Math.ceil(durationSec / 60) * rate : 0;
}

// Indian numbers as said on the call → E.164.
export function normalisePhone(p?: string): string | undefined {
  if (!p) return undefined;
  const digits = p.replace(/[^\d+]/g, '');
  if (/^\+\d{10,15}$/.test(digits)) return digits;
  const d = digits.replace(/^\+/, '');
  if (/^\d{10}$/.test(d)) return '+91' + d;
  if (/^0\d{10}$/.test(d)) return '+91' + d.slice(1);
  if (/^91\d{10}$/.test(d)) return '+' + d;
  return undefined;
}
