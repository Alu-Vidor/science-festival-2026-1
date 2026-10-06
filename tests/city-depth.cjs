const assert = require('node:assert/strict');
const M = require('../mayor.js');
const E = require('../epidemic.js');
const base = M.create({ contactScale: 0 });
const unchanged = structuredClone(base);
const expanded = M.invest(base, 'bus');
assert.deepEqual(base, unchanged, 'Building must not mutate the previous city');
assert.equal(expanded.cash, base.cash - M.upgrades.bus.cost);
assert.equal(expanded.infrastructure.bus, 1);
assert.throws(() => M.invest(base, 'unknown'));
assert.throws(() => M.invest({ ...base, cash: 0 }, 'bus'));
assert.throws(() => M.invest({ ...base, infrastructure: { ...base.infrastructure, bus: 2 } }, 'bus'));
const ordinary = M.step(base), improved = M.step(expanded);
assert.equal(improved.reports[0].transport[0].capacity, ordinary.reports[0].transport[0].capacity + 20);
assert.equal(improved.reports[0].upkeep, M.upgrades.bus.upkeep);
assert.equal(improved.cash, expanded.cash + improved.reports[0].income - improved.reports[0].expenses);

// Food is a persistent household resource, not a count of visitors to shops.
const noShops = { market: 'closed', mall: 'closed' };
let closed = M.step(base, noShops);
assert.equal(closed.reports[0].food, 100, 'Initial stocks should cover one day');
closed = M.step(closed, noShops);
assert.equal(closed.reports[1].food, 0, 'Stocks should be consumed, not created');
assert(closed.households.every(h => h.unmetDays === 1 && h.food === 0));
assert(closed.reports[1].alerts.some(a => a.id === 'food'));
assert(ordinary.households.some(h => h.food > 0), 'Purchased portions should remain for tomorrow');

// All children have a household; care is provided inside that household.
const remote = M.step(base, { school: 'remote', kindergarten: 'remote' });
assert(remote.reports[0].caregivers > 0);
for (const h of base.households) for (const i of h.members) assert.equal(base.people[i].household, h.id);
assert.equal(new Set(base.households.flatMap(h => h.members)).size, base.people.length);
assert.equal(M.create({ initialDistrict: 99 }).states.filter(x => x === 'I').length, 1);

// School capacity, utilities and rubbish respond to a larger population.
const large = M.create({ districts: Array.from({ length: 6 }, () => ({ adults: 20, children: 20, seniors: 20, far: false })), contactScale: 0 });
const largeDay = M.step(large), largeReport = largeDay.reports[0];
assert(largeReport.services.water < 100 && largeReport.services.power < 100);
assert(largeReport.services.accumulatedWaste > 0 && largeReport.schoolQueue > 0);
assert(M.step(M.invest(large, 'water')).reports[0].services.water > largeReport.services.water);
assert(M.step(large, { school: 'shifts', kindergarten: 'shifts' }).reports[0].education > largeReport.education);

// Reaching a hospital is part of access to help; a bed alone is not a trip.
const distant = M.create({ initialDistrict: 5, contactScale: 0 });
const senior = distant.people.findIndex(p => p.senior && p.district === 5);
distant.states.fill('S'); distant.states[senior] = 'I'; distant.infected[senior] = 0;
const unreachable = M.step(distant, { bus: 'closed' }).reports[0];
assert.equal(unreachable.care, 1); assert.equal(unreachable.treated, 0); assert.equal(unreachable.unservedCare, 1);

// Repeated full runs preserve people, states, locations and exact budget accounting.
let city = base;
for (let day = 1; day <= 14; day++) {
  const before = city;
  city = M.step(city, day > 6 ? { park: 'closed', gym: 'limited' } : {});
  const r = city.reports.at(-1);
  assert.equal(city.cash, before.cash + r.income - r.expenses);
  assert(r.treated <= r.beds && r.treated <= r.care);
  assert(city.households.every(h => h.food >= 0 && h.money >= 0));
  assert(city.people.every(p => p.energy >= 0 && p.energy <= 100 && p.happiness >= 0 && p.happiness <= 100));
  for (const h of city.history.slice(-5)) {
    assert.equal(h.S + h.I + h.R, city.people.length);
    assert(h.loc.every(id => E.places.some(place => place.id === id)));
    for (const exposure of h.exposures) assert.equal(h.loc[exposure.source], h.loc[exposure.target]);
  }
}
assert.deepEqual(city, (() => { let g = base; for (let day = 1; day <= 14; day++) g = M.step(g, day > 6 ? { park: 'closed', gym: 'limited' } : {}); return g; })());
console.log('City depth: households, stocks, care, transport, utilities, investments, capacity, determinism and conservation passed');
