# Aangan Studio — Phone Enquiry Agent · Build Spec (v1)

Owner: Samyak Pandey (Founder's Office) · Rules owner: Nikhil Deshpande · Status: building, step 2 of 6

## 1. Goal
Every inbound phone enquiry to Aangan is answered live, day or night. Qualified leads reach a designer on Telegram with everything already asked. Nikhil gets a dashboard of volume, outcomes, designer response and cost, so he never pulls numbers by hand again.

**Success metrics (vs Sept 2026 baseline)**
| Metric | Baseline | v1 target |
|---|---|---|
| Phone enquiries with no response within 48 h | ~48% | 0% (every call answered live) |
| Time to first answer | hours to days | 0 min (live) |
| Qualified leads claimed by a designer within the callback promise | not tracked | ≥ 90% |
| Designer re-asking basic questions | every lead | none (all 5 checks in the note) |
| Price quoted on a call | n/a | 0, ever |

## 2. Scope
**In:** inbound phone calls to the studio number. After hours: every call. Studio hours (Mon–Sat 10–7): only calls not picked up within ~4 rings.
**Out (v1):** WhatsApp, web form, outbound calls, quoting prices.
**In (v1, added):** live consultation booking with a calendar invite; HubSpot as the CRM. WhatsApp and the web form reuse the same server and rules in v2; only the input changes.

## 2a. Stack (fixed)
| Layer | Tool | Role |
|---|---|---|
| Voice agent | **Vaani Labs** (vaanilabs.in) | Answers calls (Twilio/SIP number), flow builder + knowledge base, captures fields, signed webhooks (`call.completed`, `call.failed`, `lead.created`, `usage.charged`). Prepaid wallet, ~4 paise/sec (≈ ₹2.40/min), voice billed in whole minutes. |
| Calendar invite | **Calendly** (on top of Google Calendar) | "Aangan Consultation" event type; Calendly sends the invite to caller + designer and fires `invitee.created` to our server |
| Handoff | **Telegram** (designers) + **Resend** (email) | Telegram: instant handoff with Claim buttons, escalations, overdue alerts. Resend: caller confirmation with booking link, designer email copy, Nikhil's 9pm digest |
| CRM | **HubSpot** (free CRM, private-app token) | Contacts, "Aangan Enquiries" deal pipeline, call logs, meetings, tasks, owners |
| App + hosting | **Next.js on Vercel**, code on **GitHub** | Webhook receivers (Vaani, Calendly, Telegram), cron jobs, dashboard; deploy on push |
| Database | **Supabase** (Postgres) | Event log + idempotency (Vaani `evt_` ids), call metrics and cost for the dashboard, SLA timers. HubSpot stays the record for people and deals |

**Vaani Labs constraints that shape the build**
- Webhook `data` has **phone numbers masked** and "no sub-field is guaranteed", so the agent must capture and read back the callback number as a field; the server never relies on caller ID alone.
- Webhooks retry up to 8 times and reuse the `evt_` id → handler is idempotent on it (Supabase unique key).
- Signature header `X-VaaniVoice-Signature: sha256=<hex>` over the raw body.
- HubSpot sync is "on request" from Vaani, so we do it ourselves in the webhook handler.
- Live mid-call booking depends on Vaani custom functions; see §8a.

## 3. Components map (Trigger → Input → Context → Processing → AI → Output)
Required build components: **Dashboard · HubSpot · Email/Telegram · Calendar invite**

| Stage | What | Component |
|---|---|---|
| **Trigger** | Inbound call to the studio number (after hours always; daytime when unanswered in ~4 rings) | Exotel/Twilio → Vaani |
| **Input** | Caller audio + caller ID; returning caller looked up by phone | Vaani · **HubSpot** contact search |
| **Context** | services.md, pricing-policy.md, studio-faq.md, Nikhil's 5 checks; designer availability | Vaani knowledge · **Google Calendar** (consultations calendar) |
| **Processing** | Slot-filling the 19 fields; routing engine re-checks the five rules | Vaani · `lib/routing.ts` |
| **AI** | Conversation (en/hi/mr), route decision, call summary, handoff note | Vaani (Gemini Live) |
| **Output** | ① Contact + deal + call logged in **HubSpot** ② Consultation **calendar invite** (designer + caller) ③ Handoff note to designer on **Telegram** (email copy with the invite) ④ Escalation alert to Nikhil ⑤ **Dashboard** for Nikhil | HubSpot API · Google Calendar API · Telegram Bot API · Next.js |

## 4. Architecture
```
Caller ──▶ Exotel/Twilio number ──▶ Vaani voice agent "Meera"
                                     │  knowledge: services.md, pricing-policy.md, studio-faq.md
                                     │  Google Calendar: offers a consultation slot, books it live
                                     ▼
                           call.completed / call.failed webhook (HMAC-signed)
                                     ▼
              Next.js app on Vercel  /api/vaani/webhook
                 1. verify signature
                 2. HubSpot: find contact by phone (returning caller / redial) or create
                 3. lib/routing.ts second opinion → route + flags + mismatch
                 4. HubSpot: log call (transcript, recording, cost) + create/update deal in "Aangan Enquiries" pipeline
                 5. Calendar: attach the booked event to the deal; invite the assigned designer (+ caller if email given)
                 6. Telegram: handoff note to designers / alert to Nikhil
                                     ▼
     Telegram buttons (Claim / Called / Not a fit) ──▶ update HubSpot deal stage
                                     ▼
              /dashboard  reads HubSpot (funnel, SLA) + Vaani calls API (minutes → ₹ cost)
```
HubSpot is the system of record for people and deals; Supabase holds the event log, metrics and cost for the dashboard.

## 4a. Components
| # | Component | Tech | File(s) |
|---|---|---|---|
| A | Voice agent | Vaani Labs (~₹2.40/min), en-IN + Hindi + Marathi, Google Calendar connector | `agent/description.md`, `agent/config.md`, `agent/knowledge/*` |
| B | Routing engine | TypeScript, pure functions | `lib/routing.ts`, `lib/routing.test.ts` |
| C | Webhook receiver | Next.js route handler on Vercel | `app/api/vaani/webhook/route.ts` |
| D | CRM / system of record | **HubSpot** (free CRM): contacts, deals pipeline, calls, custom properties | `lib/hubspot.ts` |
| E | Calendar invite | **Google Calendar**: "Aangan Consultations" calendar; event per booking with designer + caller as guests | Vaani connector + `lib/calendar.ts` |
| F | Handoff | **Telegram** bot (primary, push to designers on site) + **email** (the calendar invite itself carries the note) | `lib/telegram.ts`, `app/api/telegram/route.ts` |
| G | Scheduled jobs | Vercel Cron | `app/api/cron/*` (overdue every 15 min; declines digest 9pm) |
| H | **Dashboard** | Next.js page reading HubSpot + Vaani | `app/dashboard/page.tsx` |

### HubSpot setup
- Pipeline **"Aangan Enquiries"**: New lead → Claimed → Consultation booked → Consultation done → Proposal sent → Won / Lost / Not a fit
- Custom contact/deal properties: route, decline_reason, location_area, carpet_area_sqft, scope, timeline, caller_role, referral_source, after_hours, mismatch, flags, promise_at, call_cost_inr
- Declined / Nurture / Missed calls: contact + call logged, **no deal** (keeps the pipeline clean); Nurture gets a HubSpot task with a recontact date

## 5. Call routes
| Route | When | What happens |
|---|---|---|
| QUALIFIED | passes all 5 checks (4 and 5 pass if unclear, with a note) | Handoff note to designers' group, with Claim button |
| NURTURE | fails only on timing, or a real project but "just exploring" | Logged with a recontact date; weekly list to front desk |
| DECLINED | fails check 1, 2 or 4, an out-of-scope project type, or 2+ checks | Logged; **9pm daily digest to Nikhil to review** (check 07) |
| ESCALATE | existing client with a problem | **Immediate** Telegram alert to Nikhil + senior designer |
| INCOMPLETE | line dropped before details | Merged with redial if any; else "call back" task |
| MISSED | call.failed (no connect) | "Call back" task with the number |
| OTHER | vendor, job seeker, etc. | Logged only |

**Mismatch rule:** if the agent's route ≠ the routing engine's route, the call is marked "review" and shown to Nikhil. Neither side silently wins.

## 6. The five checks (from qualified.md)
1. Real project with execution (not advice-only, not restaurant/hotel/retail/gym/architecture)
2. Pune city or PCMC
3. Needed in ≥ 8 weeks (< 8 → NURTURE with a later start)
4. Budget: never asked; flagged only if volunteered and under half the internal floor (₹3.5 L minimum project; full home ≥ carpet area × ₹1,800 residential / ₹1,200 commercial)
5. Decision-maker: never fails alone; proxy or unclear is noted for the designer

## 7. Hard rules (guardrails)
- **No price, range or per-sq-ft figure is ever spoken.** The internal `pricing.md` is not uploaded to Vaani; floors exist only server-side for check 4.
- Budget is never asked or probed.
- No design advice and no promised project dates. The agent offers only free slots from the consultations calendar; it never invents one.
- Small commercial spaces are forwarded with a size flag, not declined (no rule in services.md).

## 8. Promises the agent makes (become SLAs on the dashboard)
| Caller | Promise |
|---|---|
| QUALIFIED, slot booked on call | Calendar invite sent; designer confirms by phone within 1 hour (hours) / by 11am next working day (after hours) |
| QUALIFIED, no slot suits | Designer calls within 1 hour (hours) / by 11am next working day (after hours) to fix a time |
| ESCALATE | Senior callback within 15 min (hours) / by 10:30am (after hours) |

## 9. Telegram handoff note (example)
```
🟢 NEW LEAD · Qualified · 10:47 PM (after hours)
Priya Kulkarni · +91 98xxx xx210 · call back: tomorrow after 11am
3BHK apartment · Kothrud (Dahanukar Colony) · ~1,400 sq ft carpet
Scope: "redo the whole thing — kitchen, living room, both bedrooms"
Execution: yes · State: lived-in 2 yrs · Needed by: March (~24 wks)
Decision: owner (husband agreed) · Budget: not mentioned
Source: referral — Shruti Joshi (past client, Aundh)
⚑ asked about pricing (deflected)
⏱ Promise: call by 11:00 AM
[🙋 Claim] [📞 Called] [📅 Booked] [✖ Not a fit] [▶ Recording]
```
Unclaimed past the promise → alert to Nikhil with the lead.

## 10. Data model (HubSpot)
- **Contact** = caller (phone is the match key; name, area, referral source)
- **Call engagement** = every Vaani call (duration, recording link, transcript, summary, route, flags, cost ₹)
- **Deal** = every QUALIFIED enquiry, in the "Aangan Enquiries" pipeline; amount filled when Won
- **Meeting** = the consultation (mirrors the Google Calendar event)
- **Task** = call-backs (MISSED / INCOMPLETE) and Nurture recontacts
- **Owner** = the designer who claimed it in Telegram (designers are HubSpot users, free seats)

## 11. Dashboard (Nikhil's view)
- **Volume:** calls per day, after-hours share, missed/incomplete
- **Outcomes:** route split; decline reasons; mismatches to review
- **Speed:** time to designer claim and callback (median, % within promise); overdue leads list
- **Funnel:** qualified → claimed → called → booked → won, with ₹ pipeline (project value entered on "won")
- **Cost:** Vaani `usage.charged` events (actual wallet debits) = total ₹; cost per call, per qualified lead, per booking; ROI vs pipeline
- Filters: date range, route, designer

## 12. Build steps (stop and confirm after each)
| # | Step | Status |
|---|---|---|
| 1 | Agent script + knowledge base | ✅ confirmed |
| 2 | Routing engine + replay test on 20 phone transcripts (+5 edge cases) | 🔄 in progress |
| 3 | Webhook server + HubSpot pipeline/properties, tested with simulated call events | ⏳ needs HubSpot private-app token |
| 4 | Calendar invite (Google Calendar) + Telegram bot: handoff, claim buttons, escalation, overdue, digest | ⏳ needs bot token + Google account |
| 5 | Dashboard (HubSpot + Vaani cost) | ⏳ |
| 6 | Deploy to Vercel, register webhook in Vaani, connect number, live test calls | ⏳ needs Vaani account + number |

## 13. Run cost (estimate)
~100 phone enquiries/month × ~5 billable min (4.9 min avg, rounded up per call) × ~₹2.40/min ≈ **₹1,200/month** in voice minutes (Vaani Labs prepaid wallet; enable autopay). Phone number rental (Exotel/Twilio) extra, typically ₹500–1,500/month. Vercel, HubSpot free CRM and Google Calendar cost nothing at this volume. One extra project converted = ₹8–14 lakh.

## 14. Needs from you
- Vaani account (invite code `DZE5NTWL`)
- Telegram bot token (@BotFather) and a group with the designers
- HubSpot account (free CRM) + a private-app access token
- A Google account/calendar for "Aangan Consultations" (connected in Vaani and to our server)
- A phone number connected in Vaani (Exotel for an Indian number)
- Nikhil's sign-off on: callback promises (§8), the 8-week timeline floor, forwarding small commercial spaces

## 15. Open questions for Nikhil
1. Is there a minimum size for commercial projects? (Front desk said 500 sq ft in T18; services.md says nothing.)
2. Timeline floor: qualified.md says 8–10 weeks, services.md says 6 weeks. We use 8.
3. Who receives escalations besides Nikhil?
4. Should leads go to all designers (first to claim) or round-robin?

## 8a. Booking flow (Calendly)
- **Preferred: live on the call.** If Vaani Labs custom functions are available on our plan, Meera calls `GET /api/tools/slots` (our server → Calendly available times) and `POST /api/tools/book` → Calendly books → invite to caller (if email) + designer pool.
- **Fallback (always works):** Meera tells the caller they'll get a booking link. On `call.completed` (QUALIFIED) the server sends a **single-use Calendly link** prefilled with name/phone via Vaani WhatsApp/SMS follow-up and, if an email was captured, via Resend. Calendly `invitee.created` → HubSpot meeting + deal stage "Consultation booked" + Telegram update.
- Either way the designer still calls within the promise (§8) to introduce themselves.
