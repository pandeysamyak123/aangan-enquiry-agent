// One-tap actions from emails. GET → confirm page (safe for link scanners). POST → record the action.
import { verifyAction, type LeadAction } from '@/lib/links.ts';
import { db } from '@/lib/db.ts';
import { fmtIst } from '@/lib/hours.ts';
import { esc } from '@/lib/emails.ts';
import * as hubspot from '@/lib/hubspot.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LABEL: Record<LeadAction, string> = {
  claim: 'Claim this lead', called: 'Mark as called', booked: 'Mark consultation booked', notfit: 'Mark as not a fit',
  showed: 'Mark showed up', noshow: 'Mark no-show', won: 'Mark won', lost: 'Mark lost', reviewed: 'Mark reviewed',
};

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f7f5f1;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2421">
<main style="max-width:480px;margin:10vh auto;padding:0 16px"><div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b6b6b">Aangan Studio · Enquiries</div>
<h1 style="font-size:22px;margin:6px 0 14px">${esc(title)}</h1><div style="background:#fff;border:1px solid #e7e2da;border-radius:10px;padding:16px">${body}</div></main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
  );

async function loadLead(id: string) {
  const { data } = await db().from('leads').select('*').eq('id', id).single();
  return data as any;
}

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get('t');
  const ok = verifyAction(t);
  if (!ok) return page('Link expired or invalid', '<p>This link is no longer valid. Ask the front desk to resend the lead.</p>', 400);
  const lead = await loadLead(ok.leadId);
  if (!lead) return page('Lead not found', '<p>This enquiry no longer exists.</p>', 404);
  const nameField = ok.action === 'claim'
    ? `<label style="display:block;font-size:14px;margin:10px 0 4px">Your name</label><input name="who" required autocomplete="name" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:6px;font-size:16px">`
    : `<label style="display:block;font-size:14px;margin:10px 0 4px">Your name (optional)</label><input name="who" autocomplete="name" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:6px;font-size:16px">`;
  const valueField = ok.action === 'won'
    ? `<label style="display:block;font-size:14px;margin:10px 0 4px">Project value (₹)</label><input name="value" inputmode="numeric" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:6px;font-size:16px">`
    : '';
  const claimed = lead.claimed_by_name && ok.action === 'claim' ? `<p style="color:#8a3b3b">Already claimed by <b>${esc(lead.claimed_by_name)}</b> ${fmtIst(lead.claimed_at)}.</p>` : '';
  return page(LABEL[ok.action], `
<p style="margin:0 0 6px"><b>${esc(lead.name ?? 'Caller')}</b> · ${esc(lead.phone ?? '')}</p>
<p style="margin:0 0 6px;color:#6b6b6b;font-size:14px">${esc(lead.route)} · status: ${esc(lead.status)}${lead.promise_at ? ` · promised by ${fmtIst(lead.promise_at)}` : ''}</p>
${claimed}
<form method="post">${nameField}${valueField}<input type="hidden" name="t" value="${esc(t)}">
<button style="margin-top:14px;width:100%;padding:12px;border:0;border-radius:6px;background:#2f5d50;color:#fff;font-size:16px;font-weight:600">${esc(LABEL[ok.action])}</button></form>`);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const t = String(form.get('t') ?? '');
  const ok = verifyAction(t);
  if (!ok) return page('Link expired or invalid', '<p>This link is no longer valid.</p>', 400);
  const who = String(form.get('who') ?? '').trim().slice(0, 60) || 'someone';
  const lead = await loadLead(ok.leadId);
  if (!lead) return page('Lead not found', '<p>This enquiry no longer exists.</p>', 404);
  const now = new Date().toISOString();

  if (ok.action === 'claim' && lead.claimed_by_name && lead.claimed_by_name !== who) {
    return page('Already claimed', `<p><b>${esc(lead.claimed_by_name)}</b> claimed this lead ${fmtIst(lead.claimed_at)}.</p>`, 409);
  }

  const update: Record<string, unknown> = { updated_at: now };
  let stage: Parameters<typeof hubspot.setDealStage>[1] | undefined;
  switch (ok.action) {
    case 'claim': Object.assign(update, { status: 'claimed', claimed_by_name: who, claimed_at: now }); stage = 'HUBSPOT_STAGE_CLAIMED'; break;
    case 'called': Object.assign(update, { status: lead.status === 'booked' ? 'booked' : 'called', called_at: now, claimed_by_name: lead.claimed_by_name ?? (who !== 'someone' ? who : null), claimed_at: lead.claimed_at ?? now }); break;
    case 'booked': Object.assign(update, { status: 'booked', booked_at: now }); stage = 'HUBSPOT_STAGE_BOOKED'; break;
    case 'notfit': Object.assign(update, { status: 'not_fit' }); stage = 'HUBSPOT_STAGE_NOT_FIT'; break;
    case 'showed': Object.assign(update, { status: 'consulted', showed_up: true }); break;
    case 'noshow': Object.assign(update, { showed_up: false }); break;
    case 'won': Object.assign(update, { status: 'won', project_value_inr: Number(String(form.get('value') ?? '').replace(/[^\d]/g, '')) || null }); break;
    case 'lost': Object.assign(update, { status: 'lost' }); break;
    case 'reviewed': break;
  }
  const { error } = await db().from('leads').update(update).eq('id', lead.id);
  if (error) return page('Something went wrong', `<p>${esc(error.message)}</p>`, 500);
  await db().from('lead_actions').insert({ lead_id: lead.id, actor: who, action: ok.action });

  if (stage && lead.hubspot_deal_id && hubspot.hubspotEnabled()) {
    try { await hubspot.setDealStage(lead.hubspot_deal_id, stage); } catch (e) { console.error('[lead] hubspot', e); }
  }
  return page('Done ✓', `<p>${esc(LABEL[ok.action])}: recorded for <b>${esc(lead.name ?? 'the caller')}</b>${who !== 'someone' ? ` by ${esc(who)}` : ''}.</p><p style="color:#6b6b6b;font-size:14px">You can close this page.</p>`);
}
