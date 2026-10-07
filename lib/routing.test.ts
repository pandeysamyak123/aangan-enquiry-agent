import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route, parseBudgetLakh, areaStatus } from './routing.ts';
import { fixtures } from './fixtures.ts';

for (const f of fixtures) {
  test(`${f.id} — ${f.note} → ${f.expected}`, () => {
    const v = route(f.call);
    assert.equal(v.route, f.expected, `flags: ${v.flags.join(' | ')}`);
    if (f.expectedReason) assert.equal(v.declineReason, f.expectedReason);
    for (const flag of f.expectFlags ?? []) assert.ok(v.flags.some((x) => x.includes(flag)), `missing flag "${flag}" in ${v.flags.join(' | ')}`);
    if (f.call.data?.route) assert.equal(v.mismatch, f.call.data.route.toUpperCase() !== v.route);
  });
}

test('budget parsing', () => {
  assert.equal(parseBudgetLakh('1 to 1.5 lakh maximum'), 1.5);
  assert.equal(parseBudgetLakh('₹35–40 lakh'), 40);
  assert.equal(parseBudgetLakh('1.2 crore'), 120);
  assert.equal(parseBudgetLakh('reasonable'), undefined);
});

test('service area', () => {
  assert.equal(areaStatus('Pimple Nilakh'), 'in');
  assert.equal(areaStatus('Talegaon Dabhade, near Pune'), 'out'); // "near Pune" must not count as in-area
  assert.equal(areaStatus('Lonavala'), 'out');
  assert.equal(areaStatus(''), 'unclear');
});
