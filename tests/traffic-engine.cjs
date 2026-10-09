const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const E = require('../traffic-engine.js');
const copy = value => JSON.parse(JSON.stringify(value));
const deepFreeze = value => {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); }
  return value;
};

assert.equal(E.VERSION, 'traffic-school-3');
assert.deepEqual(E.junctionIds, ['A', 'B', 'C', 'D']);
assert.deepEqual(E.scenarios.map(s => s.junctionIds.length), [2, 3, 4]);
assert.deepEqual(E.durations, [4, 8, 12]);
assert.deepEqual(E.directions, [1, -1]);
assert.equal(E.scenarios.length, 3);
assert.equal(E.trainingCases.length, 8);
assert.throws(() => E.create('missing'), /Unknown traffic scenario/);
assert.throws(() => E.observe(E.create(), 'D'), /Unknown junction/);
const busScene = E.observe(E.trainingCases[0].state, 'A');
assert.equal(busScene.EW.cars, 4);
assert.equal(busScene.EW.buses, 0);
assert.equal(busScene.NS.buses, 1);
assert.equal(busScene.NS.people, 6);
const pedestrianScene = E.observe(E.trainingCases[1].state, 'A');
assert.equal(pedestrianScene.EW.pedestrians, 3);
assert.equal(pedestrianScene.EW.pedestrianPeople, 6);

// Pure snapshots can be checkpointed, replayed and used for fair teaching.
const first = deepFreeze(E.create('school'));
const original = copy(first);
const decisions = deepFreeze({ A: { axis: 'EW', duration: 4 }, B: { axis: 'NS', duration: 8 } });
const advanced = E.step(first, decisions);
assert.deepEqual(first, original);
assert.equal(first.tick, 0);
assert.equal(advanced.tick, 1);
assert.deepEqual(E.step(first, decisions), advanced);
assert.equal(advanced.agents.find(a => a.id === 'morning-main-0').status, 'moving');
assert.equal(advanced.agents.find(a => a.id === 'morning-main-0').progress, 1 / E.TRAVEL_TIME);

// Every scored city contains genuine inbound and outbound routes. Opposing
// vehicles have their own route order, deadlines and receiving road slots.
for (const scenario of E.scenarios) {
  const agents = E.create(scenario.id).agents;
  for (const axis of E.axes) for (const dir of E.directions) {
    assert.ok(agents.some(a => a.route.some(leg => leg.axis === axis && leg.dir === dir)), scenario.id + ' contains ' + axis + ' traffic in direction ' + dir);
  }
  for (const agent of agents) {
    assert.equal(agent.dir, agent.route[0].dir);
    for (let leg = 0; leg < agent.route.length; leg++) {
      const current = agent.route[leg];
      assert.ok(E.directions.includes(current.dir));
      if (leg && current.axis === 'EW') {
        const before = agent.route[leg - 1];
        assert.equal(Math.sign(scenario.junctionIds.indexOf(current.junction) - scenario.junctionIds.indexOf(before.junction)), current.dir);
      }
    }
  }
}

// A green axis opens BOTH safe opposing directions at the same time. They do
// not compete for a single FIFO queue or create a fake collision with each
// other, and the incompatible perpendicular traffic stays at red.
let opposing = E.step(copy(E.trainingCases[4].state), { A: { axis: 'EW', duration: 4 } });
const opposingDepartures = opposing.agents.filter(a => a.departedAt === 0);
assert.equal(opposingDepartures.length, 2);
assert.deepEqual(new Set(opposingDepartures.map(a => a.from.dir)), new Set([1, -1]));
assert.ok(opposingDepartures.every(a => a.from.axis === 'EW' && a.progress === .25));
assert.equal(opposing.crashCount, 0);
assert.ok(opposing.agents.filter(a => a.route[0].axis === 'NS').every(a => a.status === 'queued'));
for (let tick = 1; tick < E.TRAVEL_TIME; tick++) opposing = E.step(opposing);
assert.equal(opposing.onTime, 2);
assert.deepEqual(new Set(opposing.agents.filter(a => a.status === 'arrived').map(a => a.to.exit)), new Set(['east', 'west']));
let northSouth = copy(E.trainingCases[4].state);
northSouth.agents = northSouth.agents.filter(a => a.route[0].axis === 'EW');
for (const agent of northSouth.agents) { agent.route[0].axis = 'NS'; agent.to.axis = 'NS'; }
northSouth.totalPeople = 2;
northSouth = E.step(northSouth, { A: { axis: 'NS', duration: 4 } });
assert.equal(northSouth.agents.filter(a => a.status === 'moving').length, 2);
for (let tick = 1; tick < E.TRAVEL_TIME; tick++) northSouth = E.step(northSouth);
assert.deepEqual(new Set(northSouth.agents.map(a => a.to.exit)), new Set(['north', 'south']));

// A large two-sided queue has two independent heads and positions. Each FIFO
// admits its first group rather than draining one side before the other.
let opposingFIFO = copy(E.trainingCases[3].state);
const observedFIFO = E.observe(opposingFIFO, 'A');
assert.equal(observedFIFO.NS.vehicles, 11);
assert.equal(observedFIFO.byDirection.NS['1'].vehicles, 6);
assert.equal(observedFIFO.byDirection.NS['-1'].vehicles, 5);
for (const dir of E.directions) {
  const queue = opposingFIFO.agents.filter(a => a.route[0].axis === 'NS' && a.dir === dir);
  assert.deepEqual(queue.map(a => a.queuePosition), queue.map((_, index) => index));
}
for (let tick = 0; tick < 3; tick++) opposingFIFO = E.step(opposingFIFO, { A: { axis: 'NS', duration: 8 } });
assert.deepEqual(opposingFIFO.agents.filter(a => a.status === 'moving').map(a => a.id), ['long-north-NS-0-0', 'long-north-NS-5-0']);

// A full eastbound receiving road does not block westbound entry or consume
// its capacity. The aggregate only reports a blocked axis when every queued
// direction is blocked; per-direction observations retain the exact state.
let partialBlock = copy(E.trainingCases[6].state);
const reverse = copy(partialBlock.agents.find(a => a.route[0].junction === 'A' && a.route[0].axis === 'EW'));
reverse.id = 'reverse-can-leave'; reverse.route = [{ junction: 'A', axis: 'EW', dir: -1 }];
reverse.dir = -1; reverse.to = { junction: 'A', axis: 'EW', dir: -1 };
reverse.order = partialBlock.agents.length; reverse.queuePosition = 0;
partialBlock.agents.push(reverse); partialBlock.totalPeople++;
const partialObservation = E.observe(partialBlock, 'A');
assert.equal(partialObservation.byDirection.EW['1'].space, 0);
assert.equal(partialObservation.byDirection.EW['-1'].space, E.LINK_CAPACITY);
assert.equal(partialObservation.EW.space, E.LINK_CAPACITY);
partialBlock = E.step(partialBlock, { A: { axis: 'EW', duration: 4 } });
assert.equal(partialBlock.agents.find(a => a.id === reverse.id).status, 'moving');
assert.ok(partialBlock.agents.filter(a => a.route[0].junction === 'A' && a.route[0].axis === 'EW' && a.dir === 1).every(a => a.status === 'queued'));
let oppositeReservoir = copy(E.trainingCases[6].state);
for (const a of oppositeReservoir.agents) if (a.route[0].junction === 'B') { a.route[0].dir = -1; a.dir = -1; a.to.dir = -1; }
assert.equal(E.observe(oppositeReservoir, 'A').EW.space, E.LINK_CAPACITY);
oppositeReservoir = E.step(oppositeReservoir, { A: { axis: 'EW', duration: 4 } });
assert.ok(oppositeReservoir.agents.some(a => a.from?.junction === 'A'), 'opposing traffic does not reserve the wrong receiving lane');

// One green admits one actual group per second, never both crossing streams.
let state = copy(E.trainingCases[0].state);
state = E.step(state, { A: { axis: 'EW', duration: 4 } });
assert.equal(state.agents.filter(a => a.status === 'moving' && a.from.junction === 'A').length, 1);
assert.equal(state.agents.find(a => a.id.includes('-NS-')).status, 'queued');
state = E.step(state, { A: { axis: 'NS', duration: 12 } });
assert.equal(state.signals.A.axis, 'EW', 'an active green cannot be overridden by repeated clicking');
assert.equal(state.agents.find(a => a.id.includes('-NS-')).status, 'queued');
while (state.signals.A.axis) state = E.step(state);
assert.equal(state.tick, 4);
assert.equal(state.arrivals.length, 1, 'travelling groups have not all teleported to their destination');

// Every new phase has the visible two-second safety interval. Renewing the
// same direction has the same cost, so choosing 4 vs 8 vs 12 has real meaning.
let next = E.step(state, { A: { axis: 'NS', duration: 4 } });
assert.equal(next.signals.A.clearance, 1);
assert.equal(next.agents.find(a => a.id.includes('-NS-')).status, 'queued');
next = E.step(next);
assert.equal(next.signals.A.clearance, 0);
assert.equal(next.agents.find(a => a.id.includes('-NS-')).status, 'queued');
next = E.step(next);
assert.equal(next.agents.find(a => a.id.includes('-NS-')).status, 'moving');
let renewal = copy(E.trainingCases[2].state);
for (let tick = 0; tick < 4; tick++) renewal = E.step(renewal, { A: { axis: 'EW', duration: 4 } });
const beforeRenewal = renewal.agents.filter(a => a.status === 'queued' && a.route[a.leg]?.axis === 'EW').length;
renewal = E.step(renewal, { A: { axis: 'EW', duration: 4 } });
assert.equal(renewal.signals.A.clearance, 1);
assert.equal(renewal.agents.filter(a => a.status === 'queued' && a.route[a.leg]?.axis === 'EW').length, beforeRenewal);

for (const invalid of [{ axis: 'EW', duration: 7 }, { axis: 'bad', duration: 4 }, null]) {
  const untouched = E.step(first, { A: invalid });
  assert.equal(untouched.signals.A.axis, null);
  assert.equal(untouched.agents.filter(a => a.from?.junction === 'A').length, 0);
}

// Congestion is a finite receiving road, not a decorative queue. A green
// cannot move the upstream group until the downstream junction frees a slot.
let jam = copy(E.trainingCases[6].state);
assert.equal(E.observe(jam, 'A').EW.space, 0);
for (let tick = 0; tick < 12; tick++) jam = E.step(jam, { A: { axis: 'EW', duration: 12 } });
assert.equal(jam.agents.filter(a => a.from?.junction === 'A').length, 0);
jam = E.step(jam, { B: { axis: 'EW', duration: 4 } });
assert.equal(E.observe(jam, 'A').EW.space, 1);
jam = E.step(jam, { A: { axis: 'EW', duration: 4 } });
jam = E.step(jam);
jam = E.step(jam);
assert.ok(jam.agents.some(a => a.from?.junction === 'A'), 'freeing the next intersection changes upstream traffic');

// Deadlines refer to the actual arrival, including movement after the green.
let urgent = copy(E.trainingCases[4].state);
for (let tick = 0; tick < 8; tick++) urgent = E.step(urgent, { A: { axis: 'EW', duration: 4 } });
assert.equal(urgent.onTime, 2);
assert.equal(urgent.arrivals[0].tick, E.TRAVEL_TIME);
assert.equal(urgent.delay, urgent.agents.reduce((n, a) => n + a.people * a.waited, 0));

// Every resident is accounted for exactly once across the entire run. Recorded
// movement obeys route order and no internal receiving road exceeds capacity.
for (const scenario of E.scenarios) {
  let s = E.create(scenario.id);
  assert.deepEqual(s.junctionIds, scenario.junctionIds);
  assert.deepEqual(Object.keys(s.signals), scenario.junctionIds);
  while (!s.done) {
    const commands = {};
    for (const id of s.junctionIds) if (s.signals[id].axis === null) commands[id] = E.testReference(E.observe(s, id));
    const prev = s;
    s = E.step(s, commands);
    assert.equal(s.totalPeople, s.agents.reduce((n, a) => n + a.people, 0));
    assert.equal(s.onTime, s.arrivals.filter(a => a.onTime).reduce((n, a) => n + a.people, 0));
    assert.equal(new Set(s.arrivals.map(a => a.id)).size, s.arrivals.length);
    for (const id of s.junctionIds) {
      const departures = s.agents.filter(a => a.departedAt === prev.tick && a.from?.junction === id);
      assert.ok(departures.length <= 2);
      assert.equal(new Set(departures.map(a => a.from.dir)).size, departures.length, 'each direction admits at most one group in a second');
      for (const departure of departures) assert.equal(departure.from.axis, commands[id]?.axis || prev.signals[id].axis);
    }
    for (const agent of s.agents) {
      assert.ok(agent.progress >= 0 && agent.progress <= 1);
      assert.ok(agent.leg >= 0 && agent.leg <= agent.route.length);
      if (agent.status === 'arrived') assert.equal(agent.leg, agent.route.length);
    }
  }
  assert.ok(s.tick <= s.duration);
  assert.equal(E.report(s).completed, true);
  assert.deepEqual(E.step(s, { A: { axis: 'EW', duration: 12 } }), s, 'a finished run cannot award a second arrival');
  assert.deepEqual(E.run(scenario.id, E.testReference), s, 'identical traffic is deterministic');
}
assert.equal(E.suiteReport([E.run('school', E.testReference)]).score, 0, 'partial practice never counts as a complete competition');
assert.equal(E.suiteReport([E.run('school', E.testReference), E.run('school', E.testReference), E.run('school', E.testReference)]).score, 0);

// Contradictory greens create an actual incident between the two groups,
// followed by an eight-second closure. Safe greens and an empty crossing do
// not fabricate accidents; collided residents never receive arrival credit.
let accident = E.step(copy(E.trainingCases[0].state), { A: { axis: 'BOTH', duration: 4 } });
assert.equal(accident.accidents.length, 1);
assert.equal(accident.crashCount, 1);
assert.equal(accident.missed, 7);
assert.deepEqual(accident.accidents[0].agents, ['bus-north-EW-0-0', 'bus-north-NS-0-0']);
assert.equal(accident.signals.A.blockedUntil, 8);
const crashed = accident.agents.filter(a => a.status === 'crashed');
assert.equal(crashed.length, 2);
for (let tick = 1; tick < 8; tick++) {
  accident = E.step(accident, { A: { axis: 'EW', duration: 12 } });
  assert.equal(accident.signals.A.axis, null);
  assert.equal(accident.arrivals.length, 0);
}
accident = E.step(accident, { A: { axis: 'EW', duration: 4 } });
assert.equal(accident.signals.A.clearance, 1);
accident = E.step(accident);
accident = E.step(accident);
assert.ok(accident.agents.some(a => a.status === 'moving'));
while (!accident.done) accident = E.step(accident, { A: { axis: 'EW', duration: 4 } });
assert.ok(crashed.every(a => !accident.arrivals.some(arrival => arrival.id === a.id)));
assert.ok(accident.onTime <= accident.totalPeople - accident.missed);
assert.equal(E.step(copy(E.trainingCases[0].state), { A: { axis: 'NS', duration: 4 } }).accidents.length, 0);
let emptyCrossing = copy(E.trainingCases[0].state);
emptyCrossing.agents = emptyCrossing.agents.filter(a => a.route[0].axis === 'EW');
emptyCrossing.totalPeople = emptyCrossing.agents.reduce((n, a) => n + a.people, 0);
emptyCrossing = E.step(emptyCrossing, { A: { axis: 'BOTH', duration: 4 } });
assert.equal(emptyCrossing.accidents.length, 0);
assert.equal(emptyCrossing.agents.filter(a => a.status === 'moving').length, 1);

// A downstream incident closes its real road. The upstream receiving space
// fills, traffic backs up, and the backlog remains until the closure expires.
let cascade = copy(E.trainingCases[6].state);
let removeCount = 0;
cascade.agents = cascade.agents.filter(a => a.route[0].junction !== 'B' || removeCount++ >= 2);
assert.equal(E.observe(cascade, 'A').EW.space, 2, 'the receiving road begins with free space');
const template = copy(cascade.agents.find(a => a.route[0].junction === 'B'));
template.id = 'cascade-cross'; template.route = [{ junction: 'B', axis: 'NS' }];
template.to = { junction: 'B', axis: 'NS' }; template.order = cascade.agents.length;
cascade.agents.push(template); cascade.totalPeople = cascade.agents.reduce((n, a) => n + a.people, 0);
cascade = E.step(cascade, { A: { axis: 'EW', duration: 12 }, B: { axis: 'BOTH', duration: 4 } });
assert.equal(cascade.accidents[0].junction, 'B');
for (let tick = 1; tick < 8; tick++) cascade = E.step(cascade, { A: { axis: 'EW', duration: 12 }, B: { axis: 'EW', duration: 12 } });
assert.equal(E.observe(cascade, 'A').EW.space, 0);
assert.ok(cascade.agents.filter(a => a.status === 'queued' && a.route[a.leg]?.junction === 'A').some(a => a.waited >= 5));
assert.ok(cascade.agents.filter(a => a.status === 'queued' && a.route[a.leg]?.junction === 'B').every(a => a.waited >= 4));

// Reference demonstrations are available to Node verification only. The
// browser game and learner have no public answer oracle to call.
const browser = {};
vm.runInNewContext(fs.readFileSync(require.resolve('../traffic-engine.js'), 'utf8'), browser);
assert.equal(browser.TrafficEngine.referenceActions, undefined);
assert.equal(browser.TrafficEngine.testReference, undefined);
assert.equal(browser.TrafficEngine.trainingCases.length, 8);
console.log('Traffic engine: 2/3/4 maps, real opposing EW/NS routes, independent FIFO/capacity, pure replay, phases, deadlines, collisions, cascading jams and conservation passed.');
