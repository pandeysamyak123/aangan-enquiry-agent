// Usage: node --env-file=.env.local scripts/hubspot-backfill.ts (needs SUPABASE_SERVICE_ROLE_KEY locally)
import { hubspotBackfill } from '../lib/hubspotBackfill.ts';
await hubspotBackfill();
