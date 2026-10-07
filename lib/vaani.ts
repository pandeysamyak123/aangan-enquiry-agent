// Vaani Labs webhooks: signature check + defensive parsing.
// Docs: https://www.vaanilabs.in/docs/api/webhooks — "Defensive-parse it — no sub-field is guaranteed."
import crypto from 'node:crypto';
import type { CallInput, CollectedData } from './routing.ts';

export type VaaniEnvelope = { id: string; type: string; created: number; data: Record<string, unknown> };

export function verifyVaani(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

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
  const raw = pick(d, 'collected_data', 'collectedData', 'collected', 'fields', 'extracted', 'extracted_data', 'variables', 'lead');
  const base: Obj = isObj(raw) ? raw : {};
  // Some flows return [{ name, value }] pairs.
  if (Array.isArray(raw)) for (const f of raw) if (isObj(f) && f.name) base[String(f.name)] = f.value;
  return base as CollectedData;
}

export function parseCall(env: VaaniEnvelope): ParsedCall {
  const d = isObj(env.data) ? env.data : {};
  const call = isObj(d.call) ? { ...d, ...d.call } : d;
  const statusRaw = str(pick(call, 'status', 'call_status', 'end_reason'))?.toUpperCase();
  const status = env.type === 'call.failed' ? 'FAILED' : statusRaw && statusRaw !== 'ENDED' ? statusRaw : 'COMPLETED';
  const endedAt = toDate(pick(call, 'ended_at', 'endedAt', 'end_time')) ?? new Date(env.created * 1000);
  const durationRaw = pick(call, 'duration_sec', 'durationSec', 'duration_seconds', 'duration');
  return {
    vaaniCallId: str(pick(call, 'call_id', 'callId', 'session_id', 'sessionId', 'id')) ?? env.id,
    fromNumber: str(pick(call, 'from_number', 'fromNumber', 'from', 'caller', 'phone')),
    startedAt: toDate(pick(call, 'started_at', 'startedAt', 'start_time')),
    endedAt,
    durationSec: durationRaw !== undefined ? Math.round(Number(durationRaw)) : undefined,
    language: str(pick(call, 'language', 'lang')),
    summary: str(pick(call, 'summary', 'call_summary')),
    transcript: pick(call, 'transcript', 'messages'),
    recordingUrl: str(pick(call, 'recording_url', 'recordingUrl', 'recording')),
    input: {
      status: status === 'COMPLETED' || status === 'SUCCESS' ? 'COMPLETED' : status,
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
