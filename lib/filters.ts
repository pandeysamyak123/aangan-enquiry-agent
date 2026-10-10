// Turns ?q=&route=&range= query params into Supabase filters, shared by list pages and CSV export.
export type ListParams = { q?: string; route?: string; status?: string; range?: string; after?: string; flag?: string; kind?: string; view?: string; page?: string };

export const RANGE_DAYS: Record<string, number> = { '7': 7, '30': 30, '90': 90, all: 3650 };
export const sinceFor = (range?: string) => new Date(Date.now() - (RANGE_DAYS[range ?? '30'] ?? 30) * 864e5).toISOString();
// PostgREST `or` syntax breaks on commas/parens; strip them from free text.
export const safeQ = (q?: string) => (q ?? '').replace(/[,()*%\\]/g, ' ').trim().slice(0, 60);

export function qs(base: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}
