// Copies every lead/call already in Supabase into HubSpot (contacts, deals, call logs, stages).
// Safe to re-run: leads that already have a HubSpot contact are skipped.
import { db } from './db.ts';
import * as hubspot from './hubspot.ts';
import { callBody } from './pipeline.ts';

const STAGE: Record<string, hubspot.StageKey> = { new: 'NEW', claimed: 'CLAIMED', called: 'CLAIMED', booked: 'BOOKED', consulted: 'CONSULTED', won: 'WON', lost: 'LOST', not_fit: 'NOT_FIT' };

export async function hubspotBackfill(log: (s: string) => void = console.log) {
const { data: leads, error } = await db().from('leads').select('*').is('hubspot_contact_id', null).order('created_at');
if (error) throw error;
log(`${leads?.length ?? 0} lead(s) to sync`);

for (const lead of leads ?? []) {
  const { data: calls } = await db().from('calls').select('*').eq('lead_id', lead.id).order('created_at');
  const first = (calls?.[0]?.collected ?? {}) as Record<string, any>;
  try {
    const contact = await hubspot.upsertContact({ phone: lead.phone ?? undefined, name: lead.name ?? first.caller_name, email: first.caller_email, location: first.location_area, referral: first.referral_source });
    let dealId: string | undefined;
    if (lead.route === 'QUALIFIED') {
      dealId = await hubspot.createDeal({
        name: `${lead.name ?? 'Caller'} — ${first.property ?? 'project'}, ${first.location_area ?? ''}`.trim(),
        contactId: contact.id, leadId: lead.id, scope: first.scope, location: first.location_area, sqft: first.carpet_area_sqft, timeline: first.timeline,
        callerRole: first.caller_role, flags: calls?.[0]?.flags ?? [], afterHours: lead.after_hours, promiseAt: lead.promise_at ? new Date(lead.promise_at) : null, referral: first.referral_source,
      });
      const stage = STAGE[lead.status];
      if (stage && stage !== 'NEW') await hubspot.setDealStage(dealId, stage, { amount: lead.project_value_inr });
    }
    for (const c of calls ?? []) {
      await hubspot.logCall({
        contactId: contact.id, dealId, at: new Date(c.ended_at ?? c.created_at), durationSec: c.duration_sec ?? undefined,
        recordingUrl: c.recording_url ?? undefined, failed: c.status !== 'COMPLETED',
        title: `Voice agent · ${c.route}${c.decline_reason ? ` (${c.decline_reason})` : ''}`,
        body: callBody({ summary: c.summary ?? undefined, transcript: c.transcript, input: { status: c.status, data: c.collected ?? {} } },
          { route: c.route, declineReason: c.decline_reason ?? undefined, mismatch: c.mismatch, agentRoute: c.agent_route ?? undefined, flags: c.flags ?? [] }, lead.id),
      });
    }
    await db().from('leads').update({ hubspot_contact_id: contact.id, hubspot_deal_id: dealId ?? null }).eq('id', lead.id);
    log(`  ✓ ${lead.name ?? lead.phone}: contact ${contact.id}${dealId ? `, deal ${dealId}` : ''}, ${calls?.length ?? 0} call(s)`);
  } catch (e) {
    log(`  ✗ ${lead.name ?? lead.phone}: ${(e as Error).message.slice(0, 200)}`);
  }
}
}
