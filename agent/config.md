# Vaani Labs agent settings

> ⚠️ Written before we confirmed **Vaani Labs** (not VaaniYantra). The content (greetings, hours, fields, knowledge files) carries over; the exact screen names will be mapped to Vaani Labs' flow builder once the account is open. Booking now goes through **Calendly** (see SPEC §8a), not a Vaani calendar connector.

## Step 2 — Basics
| Field | Value |
|---|---|
| Name | Aangan Enquiries |
| Practice type | Interior design |
| Language | English (en-IN), with Hindi and Marathi enabled; auto-detect on |
| Voice | A warm female Indian-English voice (pick by ear; test with the T02 pricing push) |
| Call direction | Inbound only |

## Step 3 — Greeting & behaviour
- **Greeting (studio hours):** "Hello, Aangan Studio — this is Meera. How can I help you today?"
- **Greeting (after hours):** "Hello, Aangan Studio — this is Meera. The studio is closed right now, but I can take everything down so a designer calls you back first thing. What are you planning?"
- **Business hours:** Mon–Sat, 10:00–19:00 IST
- **Human transfer:** off for v1. The front desk is the first ring during the day; the agent only picks up overflow and after-hours, so there is no one to transfer to. Escalations go out through Telegram instead.
- **End-call behaviour:** end only after the closing line for the route, and after confirming the callback number.

## Step 4 — Booking
- **On.** Connect Google Calendar → calendar **"Aangan Consultations"** (a studio calendar, not a designer's).
- Service: "Design consultation (free)". Duration: 60 min. Booking window: from the next working day up to 21 days ahead, Mon–Sat 10:00–19:00, 30-min buffer between consultations.
- Expert/doctor profiles: leave as one "Aangan design team". The designer is added to the event by our server when they tap **Claim** in Telegram (first to claim).
- Confirmation template (WhatsApp, approved template): "Hi {{name}}, your free design consultation with Aangan Studio is booked for {{time}}. Your designer will call you before then to introduce themselves. Reply here if you need to change it."
- Reminders: 24 h and 1 h before (Vaani default).

## Step 5 — Knowledge
Upload these three files only:
- `knowledge/services.md`
- `knowledge/pricing-policy.md`  ← NOT the internal `pricing.md`
- `knowledge/studio-faq.md`

The internal `pricing.md` (with ₹ figures) must never be uploaded. Retrieval would put real numbers in front of the model mid-call, and one slip creates a number the studio is held to.

## Fields the agent collects (`collectedData` in the call.completed webhook)
| Key | Values |
|---|---|
| `route` | QUALIFIED · NURTURE · DECLINED · ESCALATE · OTHER |
| `decline_reason` | not_full_project · outside_area · timeline · budget_misaligned · out_of_scope_type · multiple · (blank) |
| `caller_name` | free text |
| `callback_number` | E.164, confirmed on call |
| `caller_role` | owner · authorised · proxy · unclear |
| `project_type` | residential · commercial |
| `property` | e.g. "3BHK apartment", "villa G+2", "office shell" |
| `location_area` | locality as said |
| `carpet_area_sqft` | number or blank |
| `scope` | caller's own words |
| `execution_wanted` | yes · no · unclear |
| `current_state` | bare / possession date / lived-in |
| `timeline` | caller's words, e.g. "done by March" |
| `budget_volunteered` | only if caller said it, else blank |
| `referral_source` | person, Instagram, Google, builder, etc. |
| `pricing_asked` | true · false |
| `preferred_callback_time` | free text |
| `notes_for_designer` | uncertainties, e.g. "parents decide, both attend" |
| `escalation_detail` | existing client: designer name, site, issue |
| `timeline_weeks` | agent's estimate of weeks until the caller needs it complete |
| `consult_location` | site · studio |
| `booked_slot` | ISO date-time of the booked consultation, blank if none |
| `caller_email` | only if given and spelled back |
