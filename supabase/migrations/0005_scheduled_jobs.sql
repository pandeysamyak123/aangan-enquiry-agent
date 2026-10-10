-- Scheduled jobs (Vercel Hobby crons are daily-only, so frequent jobs run from Supabase pg_cron).
-- The bearer secret lives in Supabase Vault as 'aangan_cron_secret' (value = CRON_SECRET in Vercel); not stored here.
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- select vault.create_secret('<CRON_SECRET>', 'aangan_cron_secret', 'Bearer secret for Aangan /api/cron/* endpoints');

create or replace function public.aangan_call_cron(path text) returns bigint
language sql security definer set search_path = public, extensions as $$
  select net.http_get(
    url := 'https://aangan-enquiry-agent-green.vercel.app' || path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'aangan_cron_secret')),
    timeout_milliseconds := 55000
  );
$$;
revoke all on function public.aangan_call_cron(text) from public, anon, authenticated;

select cron.schedule('aangan-sweep', '*/5 * * * *', $$select public.aangan_call_cron('/api/cron/sweep')$$);
select cron.schedule('aangan-overdue', '*/15 * * * *', $$select public.aangan_call_cron('/api/cron/overdue')$$);
select cron.schedule('aangan-calendly', '*/15 * * * *', $$select public.aangan_call_cron('/api/cron/calendly')$$);
