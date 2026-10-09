/* Drive the child's real controls; reference labels are test fixtures only. */
const assert = require('node:assert/strict');

async function snapshot(scope) {
  return scope.locator('body').evaluate(() => ({
    current: trafficCityGame.current(), examples: trafficCityGame.examples(),
    model: trafficCityGame.model(), pending: trafficCityGame.pending(),
    playing: trafficCityGame.isPlaying()
  }));
}
async function ready(scope) {
  await scope.locator('#signalCity').waitFor();
  await scope.locator('body').evaluate(() => new Promise((resolve, reject) => {
    const deadline = performance.now() + 15000;
    function check() {
      if (window.trafficCityGame) return resolve();
      if (performance.now() > deadline) return reject(Error('Traffic city did not initialise'));
      setTimeout(check, 20);
    }
    check();
  }));
}
async function closeInfo(scope) {
  if (await scope.locator('#trafficInfo[open]').count()) await scope.locator('#closeInfo').click();
}
async function waitIdle(scope) {
  await scope.locator('body').evaluate(() => new Promise((resolve, reject) => {
    const deadline = performance.now() + 60000;
    function check() {
      if (!trafficCityGame.pending()) return resolve();
      if (performance.now() > deadline) return reject(Error('Traffic playback did not finish'));
      setTimeout(check, 20);
    }
    check();
  }));
}
async function select(scope, action) {
  await scope.locator('#axis' + action.axis).click();
  await scope.locator('#duration' + action.duration).click();
  const state = (await snapshot(scope)).current;
  assert.equal(state.selectedAxis, action.axis);
  assert.equal(state.selectedDuration, action.duration);
}
async function goToCase(scope, id) {
  const cases=require('../traffic-engine.js').trainingCases,index=cases.findIndex(c=>c.id===id);
  assert(index>=0,'A named physical teaching scene exists: '+id);
  await closeInfo(scope);await scope.locator('#teachMode').click();let advances=0;
  while((await snapshot(scope)).current.caseIndex!==index){
    assert(advances++<cases.length,'A named scene is reachable through visible case controls');
    await scope.locator('#nextCase').click();
  }
}
async function demonstrate(scope, action) {
  await closeInfo(scope);
  if (action) await select(scope, action);
  const before = await snapshot(scope);
  await scope.locator('#demonstrate').click();
  await waitIdle(scope);
  const after = await snapshot(scope);
  assert.deepEqual(after.model, before.model, 'Watching a chosen phase never silently trains AI');
  assert.deepEqual(after.examples, before.examples, 'Demonstration is not an automatically saved training label');
  assert.equal(after.current.best, before.current.best, 'Demonstrations do not earn competition points');
  assert(await scope.locator('#saveExample').isEnabled(), 'A completed child action can be explicitly taught');
  return after;
}
async function train(scope, action) {
  const before = await snapshot(scope);
  await scope.locator('#saveExample').click();
  const after = await snapshot(scope);
  assert.equal(after.examples.length, before.examples.length + 1, 'One explicit action teaches exactly one own example');
  if (action) assert.deepEqual(after.examples.at(-1).action, action, 'The system preserves the child label, including an incorrect decision');
  assert.notDeepEqual(after.model, before.model, 'The explicit learning action updates the actual model');
  assert.equal(after.current.best, before.current.best, 'Training examples carry no competition points');
  return after;
}
function referenceActions() {
  const engine = require('../traffic-engine.js');
  return engine.trainingCases.map(c => {
    const reference = engine.referenceActions;
    const action = Array.isArray(reference) ? reference.find(r => r.id === c.id)?.action || reference[engine.trainingCases.indexOf(c)] : reference[c.id];
    assert(action && ['EW', 'NS'].includes(action.axis) && [4, 8, 12].includes(action.duration), 'Each visible teaching case has a separately exported test fixture');
    return action;
  });
}
async function teach(scope, actions = referenceActions(), caseIndices = null) {
  await ready(scope); await closeInfo(scope); await scope.locator('#teachMode').click();
  for (let i = 0; i < actions.length; i++) {
    if (caseIndices) {
      assert.equal(caseIndices.length, actions.length);
      let advances = 0;
      while ((await snapshot(scope)).current.caseIndex !== caseIndices[i]) {
        assert(advances++ < require('../traffic-engine.js').trainingCases.length, 'The selected teaching scene is reachable through visible case controls');
        await scope.locator('#nextCase').click();
      }
    }
    await demonstrate(scope, actions[i]); await train(scope, actions[i]);
    if (!caseIndices && i < actions.length - 1) await scope.locator('#nextCase').click();
  }
  assert.equal((await snapshot(scope)).examples.length, actions.length, 'The bounded teaching set is fully available through visible controls');
}
async function practice(scope) {
  await closeInfo(scope);
  await scope.locator('#checkMode').click();
  const before = await snapshot(scope);
  await scope.locator('#testAI').click(); await waitIdle(scope);
  const after = await snapshot(scope);
  assert.deepEqual(after.model, before.model, 'Autonomous practice cannot silently fix the child model');
  assert.equal(after.current.best, before.current.best, 'Practice earns no competitive points');
  assert.deepEqual(after.current.attempts, before.current.attempts, 'Practice does not consume a scored attempt');
  return after;
}
async function exam(scope) {
  await closeInfo(scope); await scope.locator('#checkMode').click();
  const before = await snapshot(scope);
  await scope.locator('#startExam').click(); await waitIdle(scope);
  const after = await snapshot(scope);
  assert.deepEqual(after.model, before.model, 'A scored examination cannot silently correct training labels');
  assert.equal(after.current.attempts.length, before.current.attempts.length + 1, 'One launch consumes exactly one whole-suite attempt');
  return after;
}
async function maximum(scope) {
  await teach(scope); await practice(scope); const after = await exam(scope);
  assert.equal(after.current.best, 50, 'A good policy learned only from the bounded visible demonstrations can reach full score');
  assert.equal(parseInt(await scope.locator('#cityLocalScore').innerText(), 10), 50);
  return after;
}
module.exports = { snapshot, ready, closeInfo, waitIdle, select, goToCase, demonstrate, train, teach, practice, exam, maximum, referenceActions };
