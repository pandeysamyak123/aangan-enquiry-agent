// One place that changes a lead's stage, used by email links (/lead) and CRM buttons alike.
import { db } from './db.ts';
import * as hubspot from './hubspot.ts';
import type { LeadAction } from './links.ts';

export const ACTION_LABEL: Record<LeadAction, string> = {
  claim: 'Claim', called: 'Called', booked: 'Consultation booked', notfit: 'Not a fit', showed: 'Showed up',
  noshow: 'No-show', won: 'Won', lost: 'Lost', reviewed: 'Reviewed',
};

// Which actions make sense next, per status.
export const NEXT_ACTIONS: Record<string, LeadAction[]> = {
  new: ['claim', 'called', 'notfit'],
  claimed: ['called', 'booked', 'notfit'],
  called: ['booked', 'notfit', 'lost'],
  booked: ['showed', 'noshow', 'lost'],
  consulted: ['won', 'lost'],
  not_fit: [], won: [], lost: [], closed: ['reviewed'],
};

export async function applyLeadAction(leadId: string, action: LeadAction, who: string, opts: { value?: number | null } = {}) {
  const { data: lead, error: e1 } = await db().from('leads').select('*').eq('id', leadId).single();
  if (e1 || !lead) return { ok: false as const, message: 'Lead not found' };
  if (action === 'claim' && lead.claimed_by_name && lead.claimed_by_name !== who) {
    return { ok: false as const, message: `Already claimed by ${lead.claimed_by_name}` };
  }
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };
  let stage: Parameters<typeof hubspot.setDealStage>[1] | undefined;
  const named = who && who !== 'someone' ? who : null;
  switch (action) {
    case 'claim': Object.assign(update, { status: 'claimed', claimed_by_name: who, claimed_at: now }); stage = 'HUBSPOT_STAGE_CLAIMED'; break;
    case 'called': Object.assign(update, { status: ['booked', 'consulted'].includes(lead.status) ? lead.status : 'called', called_at: now, claimed_by_name: lead.claimed_by_name ?? named, claimed_at: lead.claimed_at ?? now }); break;
    case 'booked': Object.assign(update, { status: 'booked', booked_at: now, called_at: lead.called_at ?? now }); stage = 'HUBSPOT_STAGE_BOOKED'; break;
    case 'notfit': Object.assign(update, { status: 'not_fit' }); stage = 'HUBSPOT_STAGE_NOT_FIT'; break;
    case 'showed': Object.assign(update, { status: 'consulted', showed_up: true }); break;
    case 'noshow': Object.assign(update, { showed_up: false }); break;
    case 'won': Object.assign(update, { status: 'won', project_value_inr: opts.value ?? lead.project_value_inr ?? null }); break;
    case 'lost': Object.assign(update, { status: 'lost' }); break;
    case 'reviewed': break;
  }
  const { error } = await db().from('leads').update(update).eq('id', leadId);
  if (error) return { ok: false as const, message: error.message };
  await db().from('lead_actions').insert({ lead_id: leadId, actor: who || 'someone', action, detail: opts.value ? { value: opts.value } : null });
  if (stage && lead.hubspot_deal_id && hubspot.hubspotEnabled()) {
    try { await hubspot.setDealStage(lead.hubspot_deal_id, stage); } catch (e) { console.error('[lead] hubspot', e); }
  }
  return { ok: true as const, lead: { ...lead, ...update } };
}
