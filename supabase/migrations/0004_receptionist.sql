-- Web receptionist (homepage voice sessions): rate limiting per visitor and per day.
create table if not exists receptionist_sessions (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  room_name text,
  created_at timestamptz not null default now()
);
create index if not exists receptionist_sessions_ip_idx on receptionist_sessions (ip_hash, created_at desc);
alter table receptionist_sessions enable row level security;
