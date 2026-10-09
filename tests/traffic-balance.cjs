const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const E = require('../traffic-engine.js');
const L = require('../traffic-learning.js');
const good = E.trainingCases.map((c, i) => ({ id: c.id, observation: E.observe(c.state, c.junction), action: { ...E.referenceActions[i] } }));
const flip = axis => axis === 'EW' ? 'NS' : 'EW';
const copy = value => JSON.parse(JSON.stringify(value));
function measure(policy) {
  const phases = [];
  const finals = E.scenarios.map(scenario => {
    let state = E.create(scenario.id);
    while (!state.done) {
      const decisions = {};
      for (const id of state.junctionIds) if (state.signals[id].axis === null && state.signals[id].blockedUntil <= state.tick) {
        decisions[id] = policy(E.observe(state, id));
        phases.push([scenario.id, state.tick, id, decisions[id]?.axis, decisions[id]?.duration]);
      }
      state = E.step(state, decisions);
    }
    return state;
  });
  return { ...E.suiteReport(finals), fingerprint: createHash('sha256').update(JSON.stringify(phases)).digest('hex'), phases, finals };
}
const learned = examples => {
  const model = examples.length ? L.train(examples) : L.emptyModel();
  return observation => L.predict(model, observation);
};
const best = measure(learned(good));
assert.equal(best.score, 50, 'bounded child demonstrations must achieve every arrival in the full three-flow exam');
assert.equal(best.onTime, best.totalPeople);
assert.ok(best.delay > 0, 'waiting remains a meaningful tie breaker when everybody arrives on time');
assert.equal(best.totalPeople, E.scenarios.reduce((n, s) => n + s.totalPeople, 0));
assert.equal(L.VERSION, E.VERSION, 'The learner uses the current two-way traffic rules');
assert(good.every(example => L.validateExample(example)), 'Every visible teaching scene has consistent per-entry and aggregate queues');
assert(good.some(example => ['EW', 'NS'].some(axis =>
  example.observation.byDirection[axis]['1'].vehicles > 0 && example.observation.byDirection[axis]['-1'].vehicles > 0)),
  'The teaching scenes include actual opposing queues, not only one-way demonstrations');
for (const final of best.finals) {
  assert(final.agents.some(agent => agent.route.some(leg => leg.dir === 1)));
  assert(final.agents.some(agent => agent.route.some(leg => leg.dir === -1)), 'Every scored map contains real journeys in the opposite direction');
}

const lazy = {
  empty: learned([]),
  'always horizontal': () => ({ axis: 'EW', duration: 12 }),
  'always vertical': () => ({ axis: 'NS', duration: 12 }),
  'both contradictory greens': () => ({ axis: 'BOTH', duration: 8 }),
  'largest vehicle queue': o => ({ axis: o.EW.vehicles >= o.NS.vehicles ? 'EW' : 'NS', duration: 8 }),
  'largest number of people': o => ({ axis: o.EW.people >= o.NS.people ? 'EW' : 'NS', duration: 8 }),
  'longest waiting': o => ({ axis: o.EW.wait >= o.NS.wait ? 'EW' : 'NS', duration: 8 }),
  'alternating': o => ({ axis: o.lastAxis === 'EW' ? 'NS' : 'EW', duration: 8 }),
  'earliest deadline 4s': o => ({ axis: o.EW.slack <= o.NS.slack ? 'EW' : 'NS', duration: 4 }),
  'earliest deadline 8s': o => ({ axis: o.EW.slack <= o.NS.slack ? 'EW' : 'NS', duration: 8 }),
  'earliest deadline 12s': o => ({ axis: o.EW.slack <= o.NS.slack ? 'EW' : 'NS', duration: 12 }),
  'all demonstrations 4s': learned(good.map(x => ({ ...x, action: { ...x.action, duration: 4 } }))),
  'all demonstrations 8s': learned(good.map(x => ({ ...x, action: { ...x.action, duration: 8 } }))),
  'all demonstrations 12s': learned(good.map(x => ({ ...x, action: { ...x.action, duration: 12 } }))),
  'opposite demonstration choices': learned(good.map(x => ({ ...x, action: { ...x.action, axis: flip(x.action.axis) } })))
};
const scores = {};
for (const [name, policy] of Object.entries(lazy)) {
  const outcome = measure(policy);
  scores[name] = outcome.score;
  assert.ok(outcome.score < 50, name + ' must have a concrete failure on the comparable flows');
}
assert.ok(scores.empty <= 35);
assert.ok(scores['opposite demonstration choices'] <= 35, 'incorrect examples are not silently corrected');
assert.ok(scores['all demonstrations 4s'] <= 46, 'repeated short commands must visibly lose throughput');

// This is not an eight-answer puzzle. Enumerate every single alternative label,
// all seven/less-example subsets, and several orderings. Require at least three
// distinct successful autonomous behaviours, not just unused changed labels.
const winners = new Map([[best.fingerprint, { labels: good.map(x => x.action), score: best.score, delay: best.delay }]]);
let alternativeLabels = 0, changedRuns = 0;
for (let index = 0; index < good.length; index++) for (const axis of E.actionAxes) for (const duration of E.durations) {
  if (axis === good[index].action.axis && duration === good[index].action.duration) continue;
  alternativeLabels++;
  const examples = copy(good);
  examples[index].action = { axis, duration };
  const outcome = measure(learned(examples));
  if (outcome.fingerprint !== best.fingerprint) changedRuns++;
  if (outcome.score === 50) winners.set(outcome.fingerprint, { changedCase: index, axis, duration, score: outcome.score, delay: outcome.delay });
}
assert.equal(alternativeLabels, 64);
assert.ok(changedRuns >= 20, 'changing teaching must genuinely change the autonomous phases');
for (let missing = 0; missing < good.length; missing++) {
  const outcome = measure(learned(good.filter((_, index) => index !== missing)));
  if (outcome.score === 50) winners.set(outcome.fingerprint, { omittedCase: missing, score: outcome.score, delay: outcome.delay });
}
for (const order of [good.slice().reverse(), good.slice(3).concat(good.slice(0, 3))]) {
  const outcome = measure(learned(order));
  assert.ok(outcome.score >= 48, 'an innocent ordering of valid demonstrations remains a strong model');
  if (outcome.score === 50) winners.set(outcome.fingerprint, { order: order.map(x => x.id), score: outcome.score, delay: outcome.delay });
}
assert.ok(winners.size >= 3, 'at least three genuinely different taught policies should achieve the top score');
assert.ok(new Set([...winners.values()].map(x => x.delay)).size >= 2, 'waiting distinguishes top-scoring policies');

// One saved click cannot practically solve the full game. Audit all 72 ways
// to choose a single scene, axis and duration, including unsafe greens.
let singleExampleCeiling = 0;
for (const example of good) for (const axis of E.actionAxes) for (const duration of E.durations) {
  const outcome = measure(learned([{ ...example, action: { axis, duration } }]));
  singleExampleCeiling = Math.max(singleExampleCeiling, outcome.score);
}
assert.ok(singleExampleCeiling <= 45, 'a single demonstration lacks enough coverage for the top score');
// Different focused sets can attain full success without collecting all eight
// scenarios or following one prescribed sequence of correct labels.
const focusedWinners = new Map();
let winningFourExampleSets = 0;
for (let a = 0; a < good.length - 3; a++) for (let b = a + 1; b < good.length - 2; b++)
  for (let c = b + 1; c < good.length - 1; c++) for (let d = c + 1; d < good.length; d++) {
    const indices = [a, b, c, d];
    const outcome = measure(learned(indices.map(index => good[index])));
    if (outcome.score === 50) {
      winningFourExampleSets++;
      focusedWinners.set(outcome.fingerprint, { indices, delay: outcome.delay });
    }
  }
assert(winningFourExampleSets >= 3, 'At least three different focused four-example sets can teach a fully successful model');
assert(focusedWinners.size >= 3, 'Those focused sets create at least three different autonomous policies, rather than only unused changed examples');

// The downstream queue stays blocked long enough to be seen in the animation,
// and the successful learned policy responds to this observed state.
let blocked = E.create('blocked'), blockedSeconds = 0;
const policy = learned(good);
while (blocked.tick < 15) {
  if (E.observe(blocked, 'A').EW.space === 0) blockedSeconds++;
  const decisions = {};
  for (const id of blocked.junctionIds) if (blocked.signals[id].axis === null) decisions[id] = policy(E.observe(blocked, id));
  blocked = E.step(blocked, decisions);
}
assert.ok(blockedSeconds >= 8, 'blocking must not vanish within one imperceptible simulation tick');
console.log('Traffic balance: learned ' + best.onTime + '/' + best.totalPeople + ', 50/50; ' + winners.size + ' distinct winning policies, ' + winningFourExampleSets + ' successful four-example sets/' + focusedWinners.size + ' focused policies, single-example ceiling ' + singleExampleCeiling + '; lazy scores ' + JSON.stringify(scores));
