'use server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { db } from '@/lib/db.ts';
import { refreshEmailStatus } from '@/lib/email.ts';
import { SESSION_COOKIE, validSession } from '@/lib/session.ts';

// Pull the latest delivery events from Resend for the most recent emails (or one email).
export async function refreshStatuses(formData: FormData) {
  if (!(await validSession((await cookies()).get(SESSION_COOKIE)?.value))) throw new Error('Not signed in');
  const one = formData.get('resendId');
  const ids = one ? [String(one)] : ((await db().from('emails').select('resend_id').not('resend_id', 'is', null).order('created_at', { ascending: false }).limit(25)).data ?? []).map((r) => r.resend_id as string);
  await Promise.all(ids.map((id) => refreshEmailStatus(id).catch(() => null)));
  revalidatePath('/dashboard/emails', 'layout');
}
