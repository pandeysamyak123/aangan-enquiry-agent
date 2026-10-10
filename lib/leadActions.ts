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
  let stage: hubspot.StageKey | undefined;
  const named = who && who !== 'someone' ? who : null;
  switch (action) {
    case 'claim': Object.assign(update, { status: 'claimed', claimed_by_name: who, claimed_at: now }); stage = 'CLAIMED'; break;
    case 'called': Object.assign(update, { status: ['booked', 'consulted'].includes(lead.status) ? lead.status : 'called', called_at: now, claimed_by_name: lead.claimed_by_name ?? named, claimed_at: lead.claimed_at ?? now }); break;
    case 'booked': Object.assign(update, { status: 'booked', booked_at: now, called_at: lead.called_at ?? now }); stage = 'BOOKED'; break;
    case 'notfit': Object.assign(update, { status: 'not_fit' }); stage = 'NOT_FIT'; break;
    case 'showed': Object.assign(update, { status: 'consulted', showed_up: true }); stage = 'CONSULTED'; break;
    case 'noshow': Object.assign(update, { showed_up: false }); break;
    case 'won': Object.assign(update, { status: 'won', project_value_inr: opts.value ?? lead.project_value_inr ?? null }); stage = 'WON'; break;
    case 'lost': Object.assign(update, { status: 'lost' }); stage = 'LOST'; break;
    case 'reviewed': break;
  }
  const { error } = await db().from('leads').update(update).eq('id', leadId);
  if (error) return { ok: false as const, message: error.message };
  await db().from('lead_actions').insert({ lead_id: leadId, actor: who || 'someone', action, detail: opts.value ? { value: opts.value } : null });
  if (hubspot.hubspotEnabled() && (lead.hubspot_contact_id || lead.hubspot_deal_id)) {
    try {
      if (stage && lead.hubspot_deal_id) await hubspot.setDealStage(lead.hubspot_deal_id, stage, { amount: action === 'won' ? (opts.value ?? lead.project_value_inr) : undefined });
      await hubspot.addNote({ contactId: lead.hubspot_contact_id, dealId: lead.hubspot_deal_id, body: `<p><b>${ACTION_LABEL[action]}</b> by ${who || 'someone'} (Aangan CRM)${action === 'won' && opts.value ? ` · ₹${opts.value.toLocaleString('en-IN')}` : ''}</p>` });
    } catch (e) { console.error('[lead] hubspot', e); }
  }
  return { ok: true as const, lead: { ...lead, ...update } };
}
