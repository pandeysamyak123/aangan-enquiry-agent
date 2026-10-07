// One-off: creates the Aangan properties and the "Aangan Enquiries" deal pipeline in HubSpot,
// then prints the env vars to paste into Vercel. Safe to re-run (existing items are skipped).
// Usage: npm run setup:hubspot   (reads HUBSPOT_TOKEN from .env.local)
const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) throw new Error('Set HUBSPOT_TOKEN in .env.local first');

async function hs(method: string, path: string, body?: unknown) {
  const res = await fetch('https://api.hubapi.com' + path, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : undefined };
}

const text = (name: string, label: string) => ({ name, label, type: 'string', fieldType: 'text', groupName: 'aangan' });
const props = {
  contacts: [text('aangan_location', 'Aangan · Location'), text('aangan_referral_source', 'Aangan · Referral source')],
  deals: [
    text('aangan_lead_id', 'Aangan · Lead id'), text('aangan_scope', 'Aangan · Scope (caller’s words)'), text('aangan_location', 'Aangan · Location'),
    text('aangan_carpet_area_sqft', 'Aangan · Carpet area (sq ft)'), text('aangan_timeline', 'Aangan · Timeline'), text('aangan_caller_role', 'Aangan · Decision-maker'),
    text('aangan_flags', 'Aangan · Flags'), text('aangan_after_hours', 'Aangan · After hours'), text('aangan_promise_at', 'Aangan · Callback promise'),
    text('aangan_referral_source', 'Aangan · Referral source'),
  ],
};

for (const [object, list] of Object.entries(props)) {
  const g = await hs('POST', `/crm/v3/properties/${object}/groups`, { name: 'aangan', label: 'Aangan Studio', displayOrder: 1 });
  console.log(`${object} group:`, g.status === 201 ? 'created' : g.status === 409 ? 'exists' : `${g.status} ${JSON.stringify(g.json)}`);
  for (const p of list) {
    const r = await hs('POST', `/crm/v3/properties/${object}`, p);
    console.log(`  ${object}.${p.name}:`, r.status === 201 ? 'created' : r.status === 409 ? 'exists' : `${r.status} ${r.json?.message}`);
  }
}

const stages = [
  ['New lead', 0.1], ['Claimed', 0.2], ['Consultation booked', 0.4], ['Consultation done', 0.6],
  ['Proposal sent', 0.8], ['Won', 1.0], ['Lost', 0.0], ['Not a fit', 0.0],
] as const;

const existing = await hs('GET', '/crm/v3/pipelines/deals');
let pipeline = existing.json?.results?.find((p: any) => p.label === 'Aangan Enquiries');
if (!pipeline) {
  const r = await hs('POST', '/crm/v3/pipelines/deals', {
    label: 'Aangan Enquiries',
    displayOrder: 1,
    stages: stages.map(([label, prob], i) => ({ label, displayOrder: i, metadata: { probability: String(prob), ...(label === 'Won' || label === 'Lost' || label === 'Not a fit' ? { isClosed: 'true' } : {}) } })),
  });
  if (r.status >= 300) throw new Error(`pipeline: ${r.status} ${JSON.stringify(r.json)}`);
  pipeline = r.json;
  console.log('pipeline: created');
} else console.log('pipeline: exists');

const id = (label: string) => pipeline.stages.find((s: any) => s.label === label)?.id;
console.log('\nAdd these to .env.local and Vercel:\n');
console.log(`HUBSPOT_PIPELINE_ID=${pipeline.id}`);
console.log(`HUBSPOT_STAGE_NEW=${id('New lead')}`);
console.log(`HUBSPOT_STAGE_CLAIMED=${id('Claimed')}`);
console.log(`HUBSPOT_STAGE_BOOKED=${id('Consultation booked')}`);
console.log(`HUBSPOT_STAGE_NOT_FIT=${id('Not a fit')}`);

export {};
