/* One glanceable score. No names, forms, ranking service, or final report. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { robot: 0, city: 0, trainingDone: false, deliveryDone: false, cityDone: false };
  let session = 'initial', nextSession = 0;
  function draw() {
    $('overallScore').textContent = GameScore.total(state);
    const done = [state.trainingDone, state.deliveryDone, state.cityDone].filter(Boolean).length;
    $('missionProgress').textContent = `Задания: ${done} / 3`;
    $('missionBar').classList.toggle('all-done', done === 3);
    for (const [id, name, flag] of [['trainingMission', '1. Обучи робота', state.trainingDone], ['deliveryMission', '2. Три экспедиции', state.deliveryDone], ['cityMission', '3. Помоги городу', state.cityDone]]) {
      $(id).textContent = `${flag ? '✓ ' : ''}${name}`; $(id).classList.toggle('done', flag);
    }
  }
  window.SessionScore = {
    robot(score, done, trialComplete) { state.robot = Math.max(state.robot, score); state.trainingDone ||= trialComplete; state.deliveryDone ||= done; draw(); }
  };
  window.addEventListener('message', e => {
    if (e.source !== $('epiView').contentWindow || e.origin !== location.origin || e.data?.kind !== 'city-score' || e.data.version !== GameScore.VERSION || e.data.session !== session) return;
    if (!Number.isInteger(e.data.score) || e.data.score < 0 || e.data.score > 50 || typeof e.data.completed !== 'boolean') return;
    state.city = Math.max(state.city, e.data.score); state.cityDone ||= e.data.completed; draw();
  });
  $('newParticipant').onclick = () => {
    GameTour.finish(false); window.resetRobotMission();
    for (const key of Object.keys(state)) state[key] = typeof state[key] === 'boolean' ? false : 0;
    session = String(++nextSession); $('epiView').src = 'epidemic.html?session=' + session;
    $('robotTab').click(); draw(); GameTour.start('robot');
  };
  draw();
})();
