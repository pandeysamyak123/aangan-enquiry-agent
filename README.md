# Aangan Studio — Phone Enquiry Agent

Every inbound phone enquiry answered live by a Vaani Labs voice agent, checked against Nikhil's five rules,
logged in HubSpot, booked via Calendly, handed to designers on Telegram (+ Resend email), and measured on a dashboard.

- `SPEC.md` — build spec (components map, routes, guardrails, data model)
- `agent/` — voice agent instructions, settings and knowledge files for Vaani Labs
- `lib/routing.ts` — server-side second opinion on every call (`npm test` replays the Sept transcripts)
- `app/api/vaani/webhook` — Vaani Labs `call.completed` / `call.failed` / `usage.charged`
- `supabase/migrations` — database schema

Setup: copy `.env.example` → `.env.local`, fill in keys, `npm run setup:hubspot`, `npm run dev`.
