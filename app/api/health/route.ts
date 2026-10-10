import { NextResponse } from 'next/server';
import { db } from '@/lib/db.ts';

export const dynamic = 'force-dynamic';

// Which integrations are configured, and can we reach the database.
export async function GET() {
  const { count, error } = await db().from('calls').select('id', { count: 'exact', head: true });
  return NextResponse.json({
    db: error ? `error: ${error.message}` : `ok (${count} calls)`,
    vaani: !!process.env.VAANI_WEBHOOK_SECRET,
    hubspot: !!process.env.HUBSPOT_TOKEN && !!process.env.HUBSPOT_PIPELINE_ID,
    email: !!process.env.RESEND_API_KEY && !!process.env.DESIGNERS_EMAIL && !!process.env.LINK_SECRET,
    vaani_api: !!process.env.VAANI_API_KEY,
    calcom: !!process.env.CALCOM_BOOKING_URL && !!process.env.CALCOM_WEBHOOK_SECRET,
    calendly: !!process.env.CALENDLY_TOKEN,
  });
}
