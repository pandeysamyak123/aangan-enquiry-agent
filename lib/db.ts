import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

// Server-only client with the service-role key. Never import from a client component.
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

// Records an incoming webhook once. Returns false if we've already seen this id (retry / duplicate).
export async function recordEvent(id: string, source: string, type: string, payload: unknown): Promise<boolean> {
  const { error } = await db().from('webhook_events').insert({ id, source, type, payload });
  if (!error) return true;
  if (error.code === '23505') return false;
  throw error;
}

export async function markEvent(id: string, err?: unknown) {
  await db()
    .from('webhook_events')
    .update({ processed_at: new Date().toISOString(), error: err ? String(err instanceof Error ? err.message : err) : null })
    .eq('id', id);
}
