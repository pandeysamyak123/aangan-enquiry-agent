'use server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { db } from '@/lib/db.ts';
import { applyLeadAction } from '@/lib/leadActions.ts';
import { LEAD_ACTIONS, type LeadAction } from '@/lib/links.ts';
import { SESSION_COOKIE, validSession } from '@/lib/session.ts';

async function requireSession() {
  if (!(await validSession((await cookies()).get(SESSION_COOKIE)?.value))) throw new Error('Not signed in');
}

export async function leadAction(formData: FormData) {
  await requireSession();
  const leadId = String(formData.get('leadId'));
  const action = String(formData.get('action')) as LeadAction;
  if (!LEAD_ACTIONS.includes(action)) throw new Error('Unknown action');
  const who = String(formData.get('who') ?? '').trim().slice(0, 60) || 'Studio';
  const value = Number(String(formData.get('value') ?? '').replace(/[^\d]/g, '')) || null;
  (await cookies()).set('aangan_who', who, { path: '/', maxAge: 365 * 86400, sameSite: 'lax' });
  await applyLeadAction(leadId, action, who, { value });
  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath('/dashboard/leads');
}

export async function saveNotes(formData: FormData) {
  await requireSession();
  const leadId = String(formData.get('leadId'));
  const notes = String(formData.get('notes') ?? '').slice(0, 5000);
  await db().from('leads').update({ notes, updated_at: new Date().toISOString() }).eq('id', leadId);
  await db().from('lead_actions').insert({ lead_id: leadId, actor: (await cookies()).get('aangan_who')?.value ?? 'Studio', action: 'note', detail: { text: notes.slice(0, 280) } });
  revalidatePath(`/dashboard/leads/${leadId}`);
}
