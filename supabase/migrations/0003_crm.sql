-- CRM: log of every email sent (with Resend delivery status), designer timestamps, lead notes.
create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  call_id uuid references calls(id) on delete set null,
  kind text not null,                 -- handoff | alert | caller | overdue | digest
  to_addresses text[] not null,
  subject text not null,
  html text,
  resend_id text unique,
  status text not null default 'sent',-- sent | failed
  error text,
  last_event text,                    -- Resend: delivered | opened | clicked | bounced …
  last_event_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists emails_lead_idx on emails (lead_id);
create index if not exists emails_created_idx on emails (created_at desc);
alter table emails enable row level security;
alter table designers add column if not exists created_at timestamptz not null default now();
alter table leads add column if not exists notes text;
