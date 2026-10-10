'use server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { db } from '@/lib/db.ts';
import { SESSION_COOKIE, validSession } from '@/lib/session.ts';

async function guard() {
  if (!(await validSession((await cookies()).get(SESSION_COOKIE)?.value))) throw new Error('Not signed in');
}

export async function addDesigner(formData: FormData) {
  await guard();
  const name = String(formData.get('name') ?? '').trim().slice(0, 60);
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 120);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
  await db().from('designers').insert({ name, email, active: true });
  revalidatePath('/dashboard/designers');
}

export async function toggleDesigner(formData: FormData) {
  await guard();
  const id = String(formData.get('id'));
  const active = formData.get('active') === 'true';
  await db().from('designers').update({ active: !active }).eq('id', id);
  revalidatePath('/dashboard/designers');
}
