// HubSpot CRM — the system of record for callers (contacts), qualified enquiries (deals) and calls.
const BASE = 'https://api.hubapi.com';

export const hubspotEnabled = () => !!process.env.HUBSPOT_TOKEN;

async function hs<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!res.ok) throw new Error(`HubSpot ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]));

export async function upsertContact(c: { phone?: string; name?: string; email?: string; location?: string; referral?: string }) {
  const [firstname, ...rest] = (c.name ?? '').trim().split(/\s+/);
  const props = clean({
    phone: c.phone,
    firstname: firstname || undefined,
    lastname: rest.join(' ') || undefined,
    email: c.email,
    city: 'Pune',
    aangan_location: c.location,
    aangan_referral_source: c.referral,
    lifecyclestage: undefined,
  });
  if (c.phone) {
    const found = await hs<{ results: { id: string }[] }>('POST', '/crm/v3/objects/contacts/search', {
      filterGroups: [{ filters: [{ propertyName: 'phone', operator: 'EQ', value: c.phone }] }],
      limit: 1,
    });
    const id = found.results[0]?.id;
    if (id) {
      await hs('PATCH', `/crm/v3/objects/contacts/${id}`, { properties: props });
      return { id, existed: true };
    }
  }
  const created = await hs<{ id: string }>('POST', '/crm/v3/objects/contacts', { properties: props });
  return { id: created.id, existed: false };
}

export async function associate(fromType: string, fromId: string, toType: string, toId: string) {
  await hs('PUT', `/crm/v4/objects/${fromType}/${fromId}/associations/default/${toType}/${toId}`);
}

export async function createDeal(p: {
  name: string; contactId: string; leadId: string; scope?: string; location?: string; sqft?: number | string;
  timeline?: string; callerRole?: string; flags: string[]; afterHours: boolean; promiseAt?: Date | null; referral?: string;
}) {
  const deal = await hs<{ id: string }>('POST', '/crm/v3/objects/deals', {
    properties: clean({
      dealname: p.name,
      pipeline: process.env.HUBSPOT_PIPELINE_ID,
      dealstage: process.env.HUBSPOT_STAGE_NEW,
      aangan_lead_id: p.leadId,
      aangan_scope: p.scope,
      aangan_location: p.location,
      aangan_carpet_area_sqft: p.sqft,
      aangan_timeline: p.timeline,
      aangan_caller_role: p.callerRole,
      aangan_flags: p.flags.join(' | '),
      aangan_after_hours: p.afterHours ? 'true' : 'false',
      aangan_promise_at: p.promiseAt?.toISOString(),
      aangan_referral_source: p.referral,
    }),
  });
  await associate('deals', deal.id, 'contacts', p.contactId);
  return deal.id;
}

export async function setDealStage(dealId: string, stageEnv: 'HUBSPOT_STAGE_CLAIMED' | 'HUBSPOT_STAGE_BOOKED' | 'HUBSPOT_STAGE_NOT_FIT', ownerId?: string | null) {
  const stage = process.env[stageEnv];
  if (!stage) return;
  await hs('PATCH', `/crm/v3/objects/deals/${dealId}`, { properties: clean({ dealstage: stage, hubspot_owner_id: ownerId ?? undefined }) });
}

export async function logCall(p: {
  contactId: string; dealId?: string; title: string; body: string; durationSec?: number; at: Date; recordingUrl?: string; failed?: boolean;
}) {
  const call = await hs<{ id: string }>('POST', '/crm/v3/objects/calls', {
    properties: clean({
      hs_timestamp: p.at.toISOString(),
      hs_call_title: p.title,
      hs_call_body: p.body,
      hs_call_direction: 'INBOUND',
      hs_call_status: p.failed ? 'NO_ANSWER' : 'COMPLETED',
      hs_call_duration: p.durationSec ? p.durationSec * 1000 : undefined,
      hs_call_recording_url: p.recordingUrl,
    }),
  });
  await associate('calls', call.id, 'contacts', p.contactId);
  if (p.dealId) await associate('calls', call.id, 'deals', p.dealId);
  return call.id;
}

export async function createTask(p: { contactId: string; subject: string; body: string; dueAt: Date }) {
  const task = await hs<{ id: string }>('POST', '/crm/v3/objects/tasks', {
    properties: clean({ hs_timestamp: p.dueAt.toISOString(), hs_task_subject: p.subject, hs_task_body: p.body, hs_task_status: 'NOT_STARTED', hs_task_priority: 'HIGH', hs_task_type: 'CALL' }),
  });
  await associate('tasks', task.id, 'contacts', p.contactId);
  return task.id;
}

export async function logMeeting(p: { contactId: string; dealId?: string; title: string; start: Date; end: Date; body?: string }) {
  const m = await hs<{ id: string }>('POST', '/crm/v3/objects/meetings', {
    properties: clean({ hs_timestamp: p.start.toISOString(), hs_meeting_title: p.title, hs_meeting_start_time: p.start.toISOString(), hs_meeting_end_time: p.end.toISOString(), hs_meeting_body: p.body, hs_meeting_outcome: 'SCHEDULED' }),
  });
  await associate('meetings', m.id, 'contacts', p.contactId);
  if (p.dealId) await associate('meetings', m.id, 'deals', p.dealId);
  return m.id;
}

export { hs as hubspotRequest };
