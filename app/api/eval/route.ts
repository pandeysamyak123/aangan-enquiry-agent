// Dry-run evaluation: no database row, email or CRM write.
// GET  /api/eval?token=…            → table of the Sept transcripts vs expected routes (for class)
// POST /api/eval?token=… {entities}  → route for one set of call fields (what Vaani extracts)
import { NextResponse } from 'next/server';
import { route, type CollectedData } from '@/lib/routing.ts';
import { fixtures } from '@/lib/fixtures.ts';
import { esc } from '@/lib/emails.ts';

export const dynamic = 'force-dynamic';
const authed = (req: Request) => !!process.env.VAANI_WEBHOOK_SECRET && new URL(req.url).searchParams.get('token') === process.env.VAANI_WEBHOOK_SECRET;
// Class guide labels: NURTURE (timing) counts as not_fit (timeline); MISSED/INCOMPLETE as unclear.
const CLASS: Record<string, string> = { QUALIFIED: 'qualified', DECLINED: 'not_fit', NURTURE: 'not_fit (timeline)', ESCALATE: 'complaint', MISSED: 'unclear', INCOMPLETE: 'unclear', OTHER: 'unclear' };

export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const rows = fixtures.map((f) => {
    const v = route(f.call);
    return { id: f.id, note: f.note, expected: f.expected, got: v.route, reason: v.declineReason ?? '', class: CLASS[v.route], pass: v.route === f.expected, flags: v.flags };
  });
  if (new URL(req.url).searchParams.get('format') === 'json') return NextResponse.json({ passed: rows.filter((r) => r.pass).length, total: rows.length, rows });
  const passed = rows.filter((r) => r.pass).length;
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aangan eval</title>
<body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f7f5f1;color:#1f2421;margin:0"><main style="max-width:960px;margin:0 auto;padding:20px 16px">
<h1 style="font-size:22px">Routing eval · ${passed}/${rows.length} correct</h1><p style="color:#6b6b6b">Sept 2026 enquiries replayed through the live routing rules. Dry run: nothing saved, emailed or sent to the CRM.</p>
<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;background:#fff;font-size:14px">
<tr style="text-align:left;background:#efeae2">${['Call', 'Enquiry', 'Expected', 'Result', 'Class label', 'Why / flags', ''].map((h) => `<th style="padding:8px">${h}</th>`).join('')}</tr>
${rows.map((r) => `<tr style="border-top:1px solid #eee"><td style="padding:8px">${r.id}</td><td style="padding:8px">${esc(r.note)}</td><td style="padding:8px">${r.expected}</td><td style="padding:8px"><b>${r.got}</b></td><td style="padding:8px">${r.class}</td><td style="padding:8px;color:#555">${esc([r.reason, ...r.flags].filter(Boolean).join(' · '))}</td><td style="padding:8px">${r.pass ? '✅' : '❌'}</td></tr>`).join('')}
</table></div></main></body>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { entities?: CollectedData; route?: string };
  const v = route({ status: 'COMPLETED', data: { ...(body.entities ?? {}), route: body.route } });
  return NextResponse.json({ route: v.route, class: CLASS[v.route], decline_reason: v.declineReason ?? null, mismatch: v.mismatch, flags: v.flags });
}
