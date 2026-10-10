// Vercel Cron and Supabase pg_cron both send "Authorization: Bearer <CRON_SECRET>".
export const cronAuthorized = (req: Request) => !!process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
