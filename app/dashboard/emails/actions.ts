'use server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { db } from '@/lib/db.ts';
import { refreshEmailStatus } from '@/lib/email.ts';

// Pull the latest delivery events from Resend for the most recent emails (or one email).
export async function refreshStatuses(formData: FormData) {
  const one = formData.get('resendId');
  const ids = one ? [String(one)] : ((await db().from('emails').select('resend_id').not('resend_id', 'is', null).order('created_at', { ascending: false }).limit(25)).data ?? []).map((r) => r.resend_id as string);
  await Promise.all(ids.map((id) => refreshEmailStatus(id).catch(() => null)));
  revalidatePath('/dashboard/emails', 'layout');
}
