// The Sept 2026 enquiry transcripts, expressed as the fields the voice agent would collect.
// `expected` is the answer key from applying qualified.md + services.md by hand.
import type { CallInput, Route } from './routing.ts';

export type Fixture = { id: string; note: string; call: CallInput; expected: Route; expectedReason?: string; expectFlags?: string[] };

const done = (data: CallInput['data'], durationSec = 300): CallInput => ({ status: 'COMPLETED', durationSec, data });

export const fixtures: Fixture[] = [
  { id: 'T01', note: '3BHK Kothrud, full redesign, March, owner', expected: 'QUALIFIED',
    call: done({ caller_name: 'Priya', caller_role: 'owner', project_type: 'residential', property: '3BHK apartment', location_area: 'Kothrud, Dahanukar Colony', carpet_area_sqft: 1400, scope: 'redo the whole thing — kitchen, living room, both bedrooms', execution_wanted: 'yes', timeline: 'done by March', timeline_weeks: 24, referral_source: 'Shruti Joshi (past client)' }, 252) },
  { id: 'T02', note: '2BHK Wakad, pushes for price twice', expected: 'QUALIFIED', expectFlags: ['asked about pricing'],
    call: done({ caller_role: 'owner', project_type: 'residential', property: '2BHK', location_area: 'Wakad', carpet_area_sqft: 950, scope: 'full redesign — modular kitchen, wardrobes, living room, both bedrooms', execution_wanted: 'yes', timeline: 'move in November, design from October', timeline_weeks: 10, pricing_asked: true, referral_source: 'Instagram' }, 308) },
  { id: 'T03', note: 'Nashik home office', expected: 'DECLINED', expectedReason: 'outside_area',
    call: done({ caller_name: 'Suresh Patil', project_type: 'residential', property: 'home office and study', location_area: 'Nashik', scope: 'redo home office and study', execution_wanted: 'yes', referral_source: 'LinkedIn' }, 160) },
  { id: 'T04', note: 'ideas for living room, not full project', expected: 'DECLINED', expectedReason: 'not_full_project',
    call: done({ project_type: 'residential', property: 'living room', scope: 'suggestions on colours, furniture arrangement', execution_wanted: 'no' }, 202) },
  { id: 'T05', note: '4BHK Koregaon Park, Nikhil’s friend referral', expected: 'QUALIFIED',
    call: done({ caller_name: 'Aarti Mehta', caller_role: 'owner', project_type: 'residential', property: '4BHK', location_area: 'Koregaon Park', carpet_area_sqft: 2400, scope: 'complete redesign — flooring, kitchen, all four bedrooms', execution_wanted: 'yes', timeline: 'move back by February', timeline_weeks: 20, referral_source: 'Vikram Agarwal (friend of Nikhil)' }, 404) },
  { id: 'T06', note: 'startup office Baner 800 sq ft', expected: 'QUALIFIED',
    call: done({ caller_role: 'owner', project_type: 'commercial', property: 'office, bare shell', location_area: 'Baner', carpet_area_sqft: 800, scope: 'full fitout — 20 workstations, cabin, meeting room, break area', execution_wanted: 'yes', timeline: 'operational by December', timeline_weeks: 13 }, 301) },
  { id: 'T07', note: 'before Diwali (3 weeks), open to November start', expected: 'NURTURE', expectedReason: undefined,
    call: done({ project_type: 'residential', property: 'apartment', location_area: 'Pune', scope: 'living room and kitchen redesign', execution_wanted: 'yes', timeline: 'before Diwali', timeline_weeks: 3 }, 195) },
  { id: 'T08', note: '10:47pm missed call, no voicemail', expected: 'MISSED',
    call: { status: 'NO_ANSWER' } },
  { id: 'T09', note: 'existing client, designer not replying', expected: 'ESCALATE',
    call: done({ route: 'ESCALATE', caller_name: 'Sheetal Deshpande', escalation_detail: 'Designer Aryan not replying for 5 days; 2BHK Viman Nagar; wants Nikhil or senior callback' }, 352) },
  { id: 'T10', note: '1BHK Kharadi, kitchen + bedroom, ₹1–1.5 L', expected: 'DECLINED', expectedReason: 'budget_misaligned',
    call: done({ project_type: 'residential', property: '1BHK', location_area: 'Kharadi', carpet_area_sqft: 550, scope: 'kitchen and one bedroom', execution_wanted: 'yes', budget_volunteered: '1 to 1.5 lakh maximum' }, 220) },
  { id: 'T11', note: 'rented 2BHK Baner, landlord ok', expected: 'QUALIFIED',
    call: done({ caller_role: 'owner', project_type: 'residential', property: '2BHK rented', location_area: 'Baner', scope: 'living room, bedroom, kitchen — no structural changes', execution_wanted: 'yes', timeline_weeks: 16, notes_for_designer: 'Rented, 3-yr lease; landlord OK with no wall-breaking' }, 382) },
  { id: 'T12', note: 'villa 5,500 sq ft Kalyani Nagar', expected: 'QUALIFIED',
    call: done({ caller_name: 'Anand Sharma', caller_role: 'owner', project_type: 'residential', property: 'villa G+2, new construction', location_area: 'Kalyani Nagar', carpet_area_sqft: 5500, scope: 'full end-to-end design', execution_wanted: 'yes', timeline: 'move in March', timeline_weeks: 25 }, 450) },
  { id: 'T13', note: '3BHK Aundh, pushes for range', expected: 'QUALIFIED', expectFlags: ['asked about pricing'],
    call: done({ caller_role: 'owner', project_type: 'residential', property: '3BHK', location_area: 'Aundh', carpet_area_sqft: 1100, scope: 'kitchen, wardrobes in both bedrooms, living room', execution_wanted: 'yes', pricing_asked: true }, 368) },
  { id: 'T14', note: 'son calling for parents, Hadapsar', expected: 'QUALIFIED', expectFlags: ['decision-maker: proxy'],
    call: done({ caller_role: 'proxy', project_type: 'residential', property: '3BHK new possession', location_area: 'Hadapsar', scope: 'proper design for the whole flat', execution_wanted: 'yes', notes_for_designer: 'Caller is son; parents own it and both will attend' }, 295) },
  { id: 'T15', note: 'Undri, possession in 6 weeks, start now', expected: 'QUALIFIED',
    call: done({ caller_name: 'Smita', caller_role: 'owner', project_type: 'residential', property: '2BHK', location_area: 'Undri', carpet_area_sqft: 875, scope: 'full home — kitchen, wardrobes, living room', execution_wanted: 'yes', current_state: 'possession in 6 weeks, builder lets us in', timeline_weeks: 20 }, 344) },
  { id: 'T16', note: 'returning caller whose first call was lost', expected: 'QUALIFIED',
    call: done({ caller_name: 'Girish Nair', caller_role: 'owner', project_type: 'residential', property: '3BHK', location_area: 'Viman Nagar', scope: 'full interiors', execution_wanted: 'yes', timeline_weeks: 16, notes_for_designer: 'Called Monday, no follow-up — handle with care' }, 318) },
  { id: 'T17a', note: 'first call dropped at 1:12', expected: 'INCOMPLETE',
    call: done({}, 72) },
  { id: 'T17b', note: 'redial: Pimple Saudagar 3BHK', expected: 'QUALIFIED',
    call: done({ caller_name: 'Ritu Kapoor', caller_role: 'owner', project_type: 'residential', property: '3BHK', location_area: 'Pimple Saudagar', carpet_area_sqft: 1050, scope: 'kitchen, wardrobes, living room', execution_wanted: 'yes', timeline: 'done by March', timeline_weeks: 24 }, 270) },
  { id: 'T18', note: '180 sq ft coworking pod — forward with size flag', expected: 'QUALIFIED', expectFlags: ['small commercial space'],
    call: done({ caller_role: 'owner', project_type: 'commercial', property: 'coworking pod', location_area: 'Pune', carpet_area_sqft: 180, scope: 'lighting, desk, storage for one pod', execution_wanted: 'yes' }, 182) },
  { id: 'T19', note: 'restaurant in Koregaon Park', expected: 'DECLINED', expectedReason: 'out_of_scope_type',
    call: done({ project_type: 'commercial', property: 'restaurant', location_area: 'Koregaon Park', scope: 'restaurant interiors', execution_wanted: 'yes' }, 170) },
  { id: 'T20', note: '2BHK Magarpatta, January start', expected: 'QUALIFIED',
    call: done({ caller_name: 'Pooja', caller_role: 'owner', project_type: 'residential', property: '2BHK', location_area: 'Magarpatta, Cybercity', carpet_area_sqft: 900, scope: 'kitchen, both bedrooms, living room', execution_wanted: 'yes', timeline_weeks: 20 }, 284) },

  // Edge cases from other channels, replayed as if they had phoned
  { id: 'F03', note: 'Talegaon, budget ₹15–20 L', expected: 'DECLINED', expectedReason: 'outside_area',
    call: done({ project_type: 'residential', property: '3BHK independent house', location_area: 'Talegaon Dabhade', carpet_area_sqft: 1400, scope: 'full home from scratch', execution_wanted: 'yes', timeline_weeks: 14, budget_volunteered: '15–20 lakh' }) },
  { id: 'F05', note: 'Hinjewadi office 2,200 sq ft, ₹60–80 L', expected: 'QUALIFIED',
    call: done({ caller_role: 'authorised', project_type: 'commercial', property: 'office shell', location_area: 'Hinjewadi Phase 1', carpet_area_sqft: 2200, scope: 'full fitout — 55 workstations, 4 cabins, boardroom', execution_wanted: 'yes', timeline_weeks: 15, budget_volunteered: '60–80 lakh' }) },
  { id: 'F06', note: 'NIBM 4BHK partial, ₹35–40 L firm', expected: 'QUALIFIED',
    call: done({ caller_role: 'owner', project_type: 'residential', property: '4BHK', location_area: 'NIBM Road', carpet_area_sqft: 1950, scope: 'kitchen replacement, three bedrooms, living room flooring, new study', execution_wanted: 'yes', timeline_weeks: 20, budget_volunteered: '35–40 lakh, not flexible' }) },
  { id: 'F08', note: 'guests in 3 weeks, ₹4–5 L', expected: 'NURTURE',
    call: done({ caller_role: 'owner', project_type: 'residential', property: '2BHK', location_area: 'Wakad', carpet_area_sqft: 875, scope: 'living room and kitchen', execution_wanted: 'yes', timeline_weeks: 3, budget_volunteered: '4–5 lakh' }) },
  { id: 'W07', note: 'gym in Kothrud', expected: 'DECLINED', expectedReason: 'out_of_scope_type',
    call: done({ project_type: 'commercial', property: 'gym, 2,500 sq ft', location_area: 'Kothrud', scope: 'modern high-energy gym interiors', execution_wanted: 'yes' }) },

  // Safety-net cases: the agent got it wrong; the server must flag it
  { id: 'X1', note: 'agent says QUALIFIED for Mumbai flat', expected: 'DECLINED', expectedReason: 'outside_area',
    call: done({ route: 'QUALIFIED', project_type: 'residential', property: '2BHK', location_area: 'Andheri, Mumbai', scope: 'full home', execution_wanted: 'yes', timeline_weeks: 12 }) },
  { id: 'X2', note: 'agent declines a fine lead (unknown locality)', expected: 'QUALIFIED', expectFlags: ['check location'],
    call: done({ route: 'DECLINED', caller_role: 'owner', project_type: 'residential', property: '3BHK', location_area: 'Mohammed Wadi', scope: 'full home', execution_wanted: 'yes', timeline_weeks: 16 }) },
];

// Regression cases for keyword matching
fixtures.push(
  { id: 'X3', note: 'woodworking workshop at home is not a "shop"', expected: 'QUALIFIED',
    call: done({ caller_role: 'owner', project_type: 'residential', property: '3BHK', location_area: 'Bavdhan', scope: 'full home plus a small woodworking workshop corner', execution_wanted: 'yes', timeline_weeks: 16 }) },
  { id: 'X4', note: 'wants walls moved → still qualified, flagged', expected: 'QUALIFIED', expectFlags: ['structural'],
    call: done({ caller_role: 'owner', project_type: 'residential', property: '2BHK', location_area: 'Aundh', scope: 'open up the kitchen, move the wall between kitchen and living', execution_wanted: 'yes', timeline_weeks: 16 }) },
);
