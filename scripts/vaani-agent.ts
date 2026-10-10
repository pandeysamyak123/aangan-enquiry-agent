// Creates (first run) or updates the "Aangan Enquiries" agent in Vaani AI from the files in agent/.
// Usage: npm run vaani:agent            → dry run: prints what would be sent
//        npm run vaani:agent -- --apply → creates/updates the agent; prints VAANI_AGENT_ID on first create
// Docs: https://docs.vaanivoice.ai/api-reference/introduction
import { readFileSync } from 'node:fs';

const API = 'https://api.vaanivoice.ai/api';
const KEY = process.env.VAANI_API_KEY;
const AGENT_ID = process.env.VAANI_AGENT_ID;
const APPLY = process.argv.includes('--apply');
if (!KEY) throw new Error('VAANI_API_KEY not set in .env.local');

const read = (p: string) => readFileSync(new URL(`../agent/${p}`, import.meta.url), 'utf8');

// ── System prompt: description.md (minus the paste note) + studio facts from services.md ─────────────
// Booking: Vaani AI books natively only with Cal.com. Until that's connected, Meera promises a booking link.
const BOOKING_LINK_MODE = `## Booking the consultation (QUALIFIED callers only)

Don't offer or book specific times on the call. Instead say: "I'll send you a link right after this call so you can pick a time for your free consultation that suits you, and your designer will also call you." Ask whether they'd like the link on email as well as WhatsApp/SMS; if yes, take the email and spell it back letter by letter. Ask whether they'd prefer the consultation at their site or at the studio, and when is usually best for them. Never name the designer; say "your designer".
`;

// Live booking through Vaani's Cal.com integration (Settings → Integrations → Cal.com).
const BOOKING_CALCOM_MODE = `## Booking the consultation (QUALIFIED callers only)

Book the free consultation on the call using the calendar booking tool.
1. Ask whether they'd like the consultation at their site or at the studio.
2. Ask for their email address for the calendar invite, and spell it back letter by letter before using it. If they don't want to share an email, skip to step 6.
3. Check the calendar for free times and offer two, at least one working day ahead, Monday to Saturday between 10am and 7pm. Respect what they've told you, for example "weekends only".
4. When they choose one, book it with their name, email and phone number, then read it back: day, date, time, and site or studio.
5. Say: "You'll get the calendar invite by email. Your designer will call you before then to introduce themselves."
6. If no time suits them, they won't share an email, or booking fails, don't push. Say you'll send a link so they can pick a time, and that a designer will call.
Only offer times the calendar shows as free; never invent one. Never name the designer; say "your designer".
`;
const BOOKING_SECTION = process.env.BOOKING_MODE === 'link' ? BOOKING_LINK_MODE : BOOKING_CALCOM_MODE;

const description = read('description.md')
  .replace(/^# .*\n+Paste this.*\n+---\n+/s, '')
  .replace(/## Booking the consultation \(QUALIFIED callers only\)[\s\S]*?(?=## Pricing)/, BOOKING_SECTION + '\n');

const services = read('knowledge/services.md').replace(/^# .*\n/, '');
const systemPrompt = `${description}\n\n# Studio facts (answer only from these)\n${services}`;

// ── FAQ: studio-faq.md and the pricing policy, as exact question → answer pairs ───────────────────────
const faq: Record<string, string> = {};
for (const m of read('knowledge/studio-faq.md').matchAll(/\*\*(.+?)\*\*\n([\s\S]+?)(?=\n\*\*|$)/g)) faq[m[1].trim()] = m[2].trim();
faq['How much does it cost? What is your rate per square foot?'] =
  "Pricing depends on the site, the materials you choose, and the scope — your designer will walk you through it in detail at the consultation. I can pass your details to them right now if you'd like.";
faq['Can you give me at least a rough range or ballpark?'] =
  "I genuinely can't — a number without seeing the site would be misleading. Even a premium kitchen versus a standard one can be three times the cost. The consultation is free, and your designer will give you a proper number then.";

// ── Fields extracted after every call (match lib/routing.ts CollectedData) ────────────────────────────
const field = (name: string, prompt: string, values?: string[]) => ({ name, prompt, nullable: true, ...(values ? { values } : {}) });
const dataPoints = [
  field('caller_name', "The caller's name as they gave it."),
  field('callback_number', 'The callback phone number the caller confirmed on the call, digits only with country code if said. Null if not confirmed.'),
  field('caller_email', 'The email address the caller gave and confirmed letter by letter. Null if none.'),
  field('caller_role', 'Is the caller the owner/decision-maker, authorised by the decision-maker, calling on behalf of someone else (proxy), or unclear?', ['owner', 'authorised', 'proxy', 'unclear']),
  field('project_type', 'Residential (home) or commercial (office, clinic, studio, shop, restaurant, gym)?', ['residential', 'commercial']),
  field('property', 'Short description of the property, e.g. "3BHK apartment", "villa G+2", "office bare shell", "restaurant".'),
  field('location_area', 'The locality/area and city of the site exactly as said, e.g. "Kothrud, Pune" or "Andheri, Mumbai".'),
  field('carpet_area_sqft', 'Approximate carpet area in square feet as a number only. Null if not given.'),
  field('scope', "What the caller wants done, in the caller's own words (rooms, full home, fit-out)."),
  field('execution_wanted', 'Does the caller want design AND execution (yes), only advice/ideas/styling (no), or unclear?', ['yes', 'no', 'unclear']),
  field('current_state', 'State of the site: bare/new possession (with possession date if said) or lived-in.'),
  field('timeline', "When the caller needs the project complete, in the caller's words."),
  field('timeline_weeks', 'Estimated number of weeks from the call date until the caller needs the project complete, as a number. Null if no deadline was given.'),
  field('budget_volunteered', 'A budget figure ONLY if the caller volunteered one, as said (e.g. "1 to 1.5 lakh"). Null if not mentioned.'),
  field('referral_source', 'How they heard of Aangan: the referrer\'s name, Instagram, Google, LinkedIn, builder, etc.'),
  field('pricing_asked', 'Did the caller ask about price, rates or a ballpark? true or false.', ['true', 'false']),
  field('preferred_callback_time', 'When the caller said is best for the designer to call back.'),
  field('consult_location', 'Where the caller prefers the consultation.', ['site', 'studio']),
  field('notes_for_designer', 'Anything uncertain or important for the designer: proxy caller details, rented flat, frustration, special needs.'),
  field('escalation_detail', 'Only for an existing client with a problem: their designer\'s name, the site, and what went wrong. Null otherwise.'),
];

const routeDisposition = {
  name: 'route',
  type: 'string',
  prompt: "Using Aangan's five checks as the agent applied them on this call, which route did the call end in?",
  list_of_tags: {
    QUALIFIED: 'New project that passes all five checks; designer will call back',
    NURTURE: 'Real project but timing does not work now (or just exploring); recontact later',
    DECLINED: 'Advice-only, outside Pune/PCMC, clearly misaligned volunteered budget, out-of-scope type, or two+ checks failed',
    ESCALATE: 'Existing client with a complaint or problem',
    OTHER: 'Not a project enquiry (vendor, job seeker, wrong number)',
  },
};

const config = {
  persona: {
    identity: {
      system_prompt: systemPrompt,
      personality: { tone: 'warm, calm, respectful', style: 'short sentences, one question at a time', language_style: 'simple Indian English; switches to Hindi/Marathi to match the caller' },
      greeting_message: { agent_message: 'Hello, Aangan Studio — this is Meera. How can I help you today?', agent_speech_delay: 1, interruptible: true, let_user_speak_first: false },
    },
    senses_capabilities: { language: 'en', auto_detect: true },
  },
  training: {
    knowledge: { use_rag: false },
    know_how: {
      faq,
      guardrails: { level: 'strict', sexual: true, violence: true, threatning: true },
    },
  },
  analysis: {
    evaluations: {
      dispositions: { enabled: true, prompt_based: [routeDisposition] },
      conversation_evaluation: {
        enabled: true,
        prompt: 'Score 1–10: did the agent (a) never state any price, range or rate, (b) never ask about budget, (c) follow the five checks, (d) confirm the callback number, (e) sound warm and natural? List any violation of (a) or (b) explicitly.',
      },
    },
    extraction: { data_collection: { enabled: true, data_points: dataPoints } },
  },
};

async function call(method: string, path: string, body: unknown) {
  const res = await fetch(API + path, { method, headers: { 'X-API-Key': KEY!, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : {};
}

console.log(`System prompt: ${systemPrompt.length} chars · FAQ: ${Object.keys(faq).length} · fields: ${dataPoints.length} · disposition: route`);
if (/₹\s*\d|per sq ?ft.*\d|\d+\s*(lakh|L)\b/i.test(systemPrompt + JSON.stringify(faq)))
  throw new Error('Refusing: a price figure appears in the prompt or FAQ');

if (!APPLY) {
  console.log('\nDry run. Re-run with --apply to send.\n');
  console.log(JSON.stringify({ ...config, persona: { ...config.persona, identity: { ...config.persona.identity, system_prompt: systemPrompt.slice(0, 400) + ' …' } } }, null, 2).slice(0, 3000));
  process.exit(0);
}

let id = AGENT_ID;
if (!id) {
  const created = await call('POST', '/create-agent', { agent_display_name: 'aangan-enquiries-meera', config: {} });
  id = created.agent_id as string;
  console.log(`Created agent ${id}\n→ add to .env.local:  VAANI_AGENT_ID=${id}`);
}
for (const section of ['persona', 'training', 'analysis'] as const) {
  try {
    await call('PATCH', `/agent/${id}/${section}`, config[section]);
    console.log(`  ${section}: updated`);
  } catch (e) {
    console.log(`  ${section}: FAILED — ${(e as Error).message}`);
  }
}
