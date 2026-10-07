-- Aangan enquiry agent — event log, calls, leads, designer actions.
-- HubSpot is the record for people and deals; this DB powers idempotency, SLAs and the dashboard.
-- All access is server-side with the service-role key; RLS is on with no policies (deny by default).

create table webhook_events (
  id text primary key,                 -- Vaani evt_… / Calendly / Telegram update id, namespaced
  source text not null,                -- vaani | calendly | telegram
  type text not null,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  processed_at timestamptz,
  error text
);

create table designers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  telegram_user_id bigint unique,
  hubspot_owner_id text,
  active boolean not null default true
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  phone text,                          -- E.164 as confirmed by the caller
  name text,
  route text not null,                 -- QUALIFIED | NURTURE | DECLINED | ESCALATE | OTHER | INCOMPLETE | MISSED
  status text not null default 'new',  -- new | claimed | called | booked | consulted | won | lost | not_fit | closed
  after_hours boolean not null default false,
  promise_at timestamptz,              -- callback promise made on the call
  claimed_by uuid references designers(id),
  claimed_at timestamptz,
  called_at timestamptz,
  booked_at timestamptz,
  consultation_at timestamptz,
  calendly_event_uri text,
  booking_link text,
  project_value_inr bigint,
  recontact_at date,
  hubspot_contact_id text,
  hubspot_deal_id text,
  telegram_message_id bigint,
  overdue_alerted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_phone_idx on leads (phone);
create index leads_route_status_idx on leads (route, status);

create table calls (
  id uuid primary key default gen_random_uuid(),
  vaani_call_id text unique,
  event_id text references webhook_events(id),
  lead_id uuid references leads(id),
  status text not null,                -- COMPLETED | FAILED | …
  from_number text,                    -- masked by Vaani; kept for reference only
  started_at timestamptz,
  ended_at timestamptz,
  duration_sec int,
  after_hours boolean not null default false,
  language text,
  summary text,
  transcript jsonb,
  recording_url text,
  collected jsonb,
  route text not null,
  agent_route text,
  decline_reason text,
  mismatch boolean not null default false,
  flags text[] not null default '{}',
  cost_paise int,                      -- from usage.charged when available, else estimated
  cost_estimated boolean not null default true,
  hubspot_call_id text,
  created_at timestamptz not null default now()
);
create index calls_created_idx on calls (created_at);

create table lead_actions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  actor text not null,                 -- designer name, 'system', 'calendly'
  action text not null,                -- claimed | called | booked | not_fit | overdue_alert | reviewed …
  at timestamptz not null default now(),
  detail jsonb
);

create table usage_charges (
  event_id text primary key references webhook_events(id),
  call_ref text,
  amount_paise int not null,
  charged_at timestamptz not null default now()
);

alter table webhook_events enable row level security;
alter table designers enable row level security;
alter table leads enable row level security;
alter table calls enable row level security;
alter table lead_actions enable row level security;
alter table usage_charges enable row level security;
