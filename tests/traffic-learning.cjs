const assert = require('node:assert/strict');
const L = require('../traffic-learning.js');

const queue = (vehicles, people, wait, slack, space = 12) => ({ vehicles, people, wait, slack, space });
const observation = (EW, NS, junction = 'A') => ({ junction, EW, NS });
const example = (id, EW, NS, axis, duration) => ({ id, observation: observation(EW, NS), action: { axis, duration } });
const mirror = value => ({ ...value, EW: { ...value.NS }, NS: { ...value.EW },
  ...(value.byDirection ? { byDirection: { EW: structuredClone(value.byDirection.NS), NS: structuredClone(value.byDirection.EW) } } : {}) });

const samples = [
  example('Школьный автобус', queue(2, 15, 8, 9), queue(5, 5, 3, 35), 'EW', 4),
  example('Большая очередь', queue(9, 9, 5, 36), queue(2, 2, 3, 35), 'EW', 12),
  example('Долго ждут', queue(4, 4, 34, 15), queue(5, 5, 3, 33), 'EW', 8),
  example('Впереди затор', queue(8, 12, 20, 7, 0), queue(4, 4, 11, 16), 'NS', 8)
];
const before = structuredClone(samples);
const model = L.train(samples);
assert.deepEqual(samples, before, 'Training does not rewrite demonstrations');
assert.deepEqual(model.examples, samples, 'Only the child labels are stored');
samples[0].action.axis = 'NS';
samples[0].observation.EW.people = 500;
assert.deepEqual(model.examples, before, 'The model owns an isolated copy');
const restored = JSON.parse(JSON.stringify(model));

for (const saved of before) {
  const answer = L.predict(restored, saved.observation);
  assert.equal(answer.axis, saved.action.axis);
  assert.equal(answer.duration, saved.action.duration);
  assert.equal(answer.exampleId, saved.id);
  assert(answer.trained && answer.confidence > 0.5);
  const turned = L.predict(restored, mirror(saved.observation));
  assert.equal(turned.axis, saved.action.axis === 'EW' ? 'NS' : 'EW', 'Turning a scene turns the learned decision');
  assert.equal(turned.duration, saved.action.duration, 'Turning a scene preserves the learned duration');
  assert.equal(turned.mirrored, true);
}

const nearby = observation(queue(3, 16, 9, 10), queue(6, 6, 4, 37), 'C');
assert.deepEqual(
  (({ axis, duration }) => ({ axis, duration }))(L.predict(model, nearby)),
  { axis: 'EW', duration: 4 },
  'A new nearby scene at a different junction uses the demonstrated preference and duration'
);

const wrong = structuredClone(before[3]);
wrong.action = { axis: 'EW', duration: 12 };
const wrongModel = L.train([wrong]);
assert.equal(L.predict(wrongModel, wrong.observation).axis, 'EW', 'A blocked-road demonstration stays wrong');
assert.equal(L.predict(wrongModel, wrong.observation).duration, 12, 'A wrong duration is never corrected by physics');
assert.deepEqual(wrongModel.examples[0].action, wrong.action);
assert.notDeepEqual(L.predict(wrongModel, wrong.observation), L.predict(L.train([before[3]]), wrong.observation));

const simultaneous = { ...structuredClone(before[0]), id: 'Общее зелёное', action: { axis: 'BOTH', duration: 12 } };
assert(L.validateExample(simultaneous), 'Unsafe child actions can be saved as training examples');
const simultaneousModel = L.train([simultaneous]);
for (const view of [simultaneous.observation, mirror(simultaneous.observation)]) {
  const decision = L.predict(simultaneousModel, view);
  assert.equal(decision.axis, 'BOTH', 'Turning the map must not silently repair an unsafe simultaneous signal');
  assert.equal(decision.duration, 12);
  assert.match(decision.reason, /всем дорогам сразу/);
}
assert.deepEqual(simultaneousModel.examples[0].action, { axis: 'BOTH', duration: 12 });
assert.equal(L.predict(simultaneousModel, { ...simultaneous.observation, junction: 'D' }).axis, 'BOTH', 'A fourth junction uses the same learned queue rules');
const outsideInformation = { ...simultaneous.observation, tick: 999, lastAxis: 'EW',
  futureAgents: [{ start: 1000, people: 50 }], idealAction: { axis: 'NS', duration: 4 } };
assert.deepEqual(L.predict(simultaneousModel, outsideInformation), L.predict(simultaneousModel, simultaneous.observation),
  'Prediction uses visible queues, not timing shortcuts, future groups or a supplied correct answer');

// Equal totals do not imply equal throughput: ten groups in one direction
// need longer green than five from each of the two opposite entries.
const withLanes = (view, EW, NS) => ({ ...structuredClone(view), byDirection: {
  EW: { '1': { vehicles: EW[0] }, '-1': { vehicles: EW[1] } },
  NS: { '1': { vehicles: NS[0] }, '-1': { vehicles: NS[1] } }
} });
const laneScene = observation(queue(10, 10, 0, 30), queue(2, 2, 0, 30));
const oneWay = { id: 'Одна очередь', observation: withLanes(laneScene, [10, 0], [2, 0]), action: { axis: 'EW', duration: 12 } };
const twoWays = { id: 'Две встречные очереди', observation: withLanes(laneScene, [5, 5], [2, 0]), action: { axis: 'EW', duration: 4 } };
const laneModel = L.train([oneWay, twoWays]);
for (const saved of [oneWay, twoWays]) {
  assert(L.validateExample(saved));
  assert.equal(L.predict(laneModel, saved.observation).duration, saved.action.duration, 'The learner distinguishes actual visible entry loads with identical aggregate totals');
  const turned = L.predict(laneModel, mirror(saved.observation));
  assert.equal(turned.axis, 'NS');
  assert.equal(turned.duration, saved.action.duration, 'Entry-load learning transfers when the roads are rotated');
}
const incorrectLaneCount = structuredClone(twoWays);
incorrectLaneCount.observation.byDirection.EW['-1'].vehicles = NaN;
assert(!L.validateExample(incorrectLaneCount));
incorrectLaneCount.observation.byDirection.EW['-1'].vehicles = 8;
assert(!L.validateExample(incorrectLaneCount), 'Stored directional measurements must agree with the total shown to the child');

const contradictory = structuredClone(before[0]);
contradictory.id = 'Противоречие';
contradictory.action = { axis: 'NS', duration: 12 };
const conflictModel = L.train([before[0], contradictory]);
const conflict = L.predict(conflictModel, before[0].observation);
assert.equal(conflict.axis, 'EW', 'A tie keeps the first saved label rather than inventing a correct one');
assert(conflict.confidence <= 0.4, 'Contradictory labels visibly reduce confidence');
assert.deepEqual(conflictModel.examples[1].action, contradictory.action);

const empty = L.predict(L.emptyModel(), nearby);
assert.deepEqual({ axis: empty.axis, duration: empty.duration, confidence: empty.confidence }, { axis: 'EW', duration: 4, confidence: 0 });
assert.equal(empty.trained, false);
assert.equal(empty.exampleId, null);
assert.match(empty.reason, /ещё не обучен/);
assert.deepEqual(L.predict(null, nearby), empty);
const named = { ...before[0], id: 'example-1', title: 'Автобус поперёк' };
assert.match(L.predict(L.train([named]), named.observation).reason, /Автобус поперёк/);
assert.doesNotMatch(L.predict(L.train([named]), named.observation).reason, /example-1/);
const far = L.predict(L.train([before[0]]), observation(queue(50, 100, 60, -40, 0), queue(40, 80, 55, -30, 0)));
assert(far.confidence < L.predict(L.train([before[0]]), before[0].observation).confidence, 'Unfamiliar observations lower similarity');
assert(far.confidence >= 0 && far.confidence <= 1 && Number.isFinite(far.confidence));
assert(!/лучший|правильн|точно|успеют/.test(far.reason), 'The explanation cites an example without promising physical success');

assert(L.validateExample(before[0]));
assert(L.validateExample(example('Опоздали', queue(1, 1, 3, -20), queue(0, 0, 0, 999), 'EW', 4)));
assert(!L.validateExample({ ...before[0], id: '' }));
assert(!L.validateExample({ ...before[0], title: { text: 'Название' } }));
assert(!L.validateExample({ ...before[0], action: { axis: 'up', duration: 8 } }));
assert(!L.validateExample({ ...before[0], action: { axis: 'EW', duration: 5 } }));
for (const field of ['vehicles', 'people', 'wait', 'space']) {
  const malformed = structuredClone(before[0]);
  malformed.observation.EW[field] = -1;
  assert(!L.validateExample(malformed), 'Negative ' + field + ' is not a queue measurement');
}
for (const value of [NaN, Infinity, '5', null]) {
  const malformed = structuredClone(before[0]);
  malformed.observation.NS.people = value;
  assert(!L.validateExample(malformed));
  assert.throws(() => L.train([malformed]), TypeError);
}
assert.throws(() => L.train([]), RangeError);
assert.throws(() => L.train(null), TypeError);
assert.throws(() => L.train([before[0], before[0]]), /Duplicate/);
assert.throws(() => L.predict({ ...model, version: 'obsolete' }, nearby), /Unsupported/);
assert.throws(() => L.predict(model, { EW: queue(1, 1, 1, 1) }), TypeError);

// Use the physical simulation only in tests. The production learner has no
// engine dependency, reference policy, future arrivals or replacement labels.
const E = require('../traffic-engine.js');
assert.equal(L.VERSION, E.VERSION, 'Learning checkpoints use the current physical traffic rules');
const demonstrations = E.trainingCases.map((scene, index) => ({
  id: scene.id, title: scene.title,
  observation: E.observe(scene.state, scene.junction),
  action: { ...E.referenceActions[index] }
}));
const demonstrationSnapshot = structuredClone(demonstrations);
const learned = L.train(demonstrations);
function exam(trained) {
  const states = E.scenarios.map(scene => E.run(scene.id, view => L.predict(trained, view)));
  return { ...E.suiteReport(states), lateDelay: states.reduce((total, state) => total + state.lateDelay, 0) };
}
const trainedResult = exam(learned);
assert.equal(trainedResult.completed, true);
assert.equal(trainedResult.onTime, trainedResult.totalPeople, 'A bounded set of visible demonstrations can teach a policy that gets everyone there on time');
assert.equal(trainedResult.score, 50);
assert.equal(trainedResult.lateDelay, 0, 'The good model has no late arrivals; ordinary queue waiting is still counted for ties');
assert.deepEqual(demonstrations, demonstrationSnapshot, 'Running an exam does not rewrite labels to the physical answer');

const opposite = demonstrations.map(saved => ({ ...structuredClone(saved), action: { ...saved.action, axis: saved.action.axis === 'EW' ? 'NS' : 'EW' } }));
const oppositeResult = exam(L.train(opposite));
const untrainedResult = exam(L.emptyModel());
assert(oppositeResult.score <= trainedResult.score - 15, 'Incorrect relative preferences cause real missed journeys');
assert(untrainedResult.score <= trainedResult.score - 15, 'The empty model does not quietly contain a successful traffic controller');

const strategyResults = {};
for (const duration of L.DURATIONS) {
  const fixedDuration = demonstrations.map(saved => ({ ...structuredClone(saved), action: { ...saved.action, duration } }));
  strategyResults['duration-' + duration] = exam(L.train(fixedDuration));
  assert(strategyResults['duration-' + duration].score < trainedResult.score, 'Always giving ' + duration + ' seconds cannot get the maximum');
}
for (const axis of L.AXES) {
  const fixedDirection = demonstrations.map(saved => ({ ...structuredClone(saved), action: { axis, duration: 8 } }));
  strategyResults['axis-' + axis] = exam(L.train(fixedDirection));
  assert(strategyResults['axis-' + axis].score < trainedResult.score, 'Always labelling one side does not solve the city');
}
for (const field of ['vehicles', 'people', 'wait', 'slack']) {
  const simple = demonstrations.map(saved => {
    const value = saved.observation;
    const useEW = field === 'slack' ? value.EW[field] <= value.NS[field] : value.EW[field] >= value.NS[field];
    return { ...structuredClone(saved), action: { ...saved.action, axis: useEW ? 'EW' : 'NS' } };
  });
  strategyResults['only-' + field] = exam(L.train(simple));
  assert(strategyResults['only-' + field].score < trainedResult.score, 'One numerical queue criterion does not solve every scene: ' + field);
}

let consequentialErrors = 0;
for (let index = 0; index < demonstrations.length; index++) {
  const changed = structuredClone(demonstrations);
  changed[index].action.axis = changed[index].action.axis === 'EW' ? 'NS' : 'EW';
  const changedModel = L.train(changed);
  const exact = L.predict(changedModel, changed[index].observation);
  assert.equal(exact.axis, changed[index].action.axis, 'Even one wrong demonstration stays wrong when the same visible situation returns');
  assert.equal(exact.exampleId, changed[index].id);
  if (exam(changedModel).score < trainedResult.score) consequentialErrors++;
}
assert(consequentialErrors >= 4, 'Errors in several individual examples cause visible consequences in independent traffic streams');

const unsafeDemonstrations = demonstrations.map(saved => ({
  ...structuredClone(saved), action: { axis: 'BOTH', duration: 8 }
}));
const unsafeSnapshot = structuredClone(unsafeDemonstrations);
const unsafeLearned = L.train(unsafeDemonstrations);
const unsafeStates = E.scenarios.map(scene => E.run(scene.id, view => L.predict(unsafeLearned, view)));
const unsafeReport = E.suiteReport(unsafeStates);
assert(unsafeStates.some(state => state.crashCount > 0 && state.accidents.length > 0), 'An unsafe child label can make the learned controller cause a real simulated collision');
assert(unsafeReport.score < trainedResult.score, 'Accidents caused by learning reduce the competitive result');
assert(unsafeReport.delay > trainedResult.delay, 'Unsafe learning also creates real additional passenger waiting in the remaining traffic');
for (const state of unsafeStates) {
  for (const accident of state.accidents) {
    assert(accident.agents.length >= 2, 'Both conflicting streams take part in an accident');
    assert(accident.blockedUntil > accident.tick, 'An accident closes the junction and delays the remaining traffic');
    for (const id of accident.agents) {
      const agent = state.agents.find(candidate => candidate.id === id);
      assert.equal(agent.status, 'crashed');
      assert(!state.arrivals.some(arrival => arrival.id === id), 'A collided group cannot also be counted as successfully arrived');
    }
  }
}
assert.deepEqual(unsafeDemonstrations, unsafeSnapshot, 'Collisions do not repair the examples that caused them');
assert.deepEqual(E.scenarios.map(scene => E.create(scene.id).junctionIds.length), [2, 3, 4], 'The three scored maps progressively test two, three and four junctions');

console.log('Traffic learning: child labels, duration, symmetry, uncertainty, persistence, collisions and progressive maps passed; good=' + trainedResult.score + ', wrong=' + oppositeResult.score + ', empty=' + untrainedResult.score + ', unsafe=' + unsafeReport.score + ', fixed durations=' + L.DURATIONS.map(duration => strategyResults['duration-' + duration].score).join('/'));
