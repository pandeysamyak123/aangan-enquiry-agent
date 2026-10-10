-- Email-only handoff (Telegram dropped): designer name on claim, show-up tracking, Resend message id.
alter table leads add column if not exists claimed_by_name text;
alter table leads add column if not exists showed_up boolean;
alter table leads add column if not exists handoff_email_id text;
alter table leads drop column if exists telegram_message_id;
