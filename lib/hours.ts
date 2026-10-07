// Studio hours and callback promises, all in IST (UTC+5:30, no DST).
const IST_OFFSET_MIN = 330;
const OPEN_H = 10;
const CLOSE_H = 19;

type IstParts = { y: number; m: number; d: number; h: number; min: number; dow: number };

function istParts(at: Date): IstParts {
  const t = new Date(at.getTime() + IST_OFFSET_MIN * 60_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), h: t.getUTCHours(), min: t.getUTCMinutes(), dow: t.getUTCDay() };
}

function istDate(y: number, m: number, d: number, h: number, min: number): Date {
  return new Date(Date.UTC(y, m, d, h, min) - IST_OFFSET_MIN * 60_000);
}

const isWorkingDay = (dow: number) => dow !== 0; // Mon–Sat

export function isAfterHours(at: Date): boolean {
  const p = istParts(at);
  return !isWorkingDay(p.dow) || p.h < OPEN_H || p.h >= CLOSE_H;
}

// The next working day at hh:mm IST (today if we're still before opening on a working day).
export function nextWorkingDayAt(at: Date, h: number, min: number): Date {
  const p = istParts(at);
  let candidate = istDate(p.y, p.m, p.d, h, min);
  if (isWorkingDay(p.dow) && p.h < OPEN_H && candidate > at) return candidate;
  do {
    candidate = new Date(candidate.getTime() + 24 * 3600_000);
  } while (!isWorkingDay(istParts(candidate).dow));
  return candidate;
}

// What the agent promised on the call (see agent/description.md and SPEC §8).
export function promiseFor(route: string, at: Date): Date | null {
  const after = isAfterHours(at);
  if (route === 'QUALIFIED') return after ? nextWorkingDayAt(at, 11, 0) : new Date(at.getTime() + 60 * 60_000);
  if (route === 'ESCALATE') return after ? nextWorkingDayAt(at, 10, 30) : new Date(at.getTime() + 15 * 60_000);
  if (route === 'MISSED' || route === 'INCOMPLETE') return after ? nextWorkingDayAt(at, 10, 30) : new Date(at.getTime() + 30 * 60_000);
  return null;
}

export function fmtIst(at: Date | string | null | undefined): string {
  if (!at) return '—';
  return new Date(at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
