/* One glanceable score. No names, forms, ranking service, or final report. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { robot: 0, city: 0, trainingDone: false, deliveryDone: false, cityDone: false };
  const cityRules = 'traffic-school-3';
  let session = window.FestivalSession?.id || 'initial';
  const saved = window.FestivalSession?.read('score');
  if (saved?.rules===GameScore.VERSION && ['robot','city'].every(key=>Number.isInteger(saved[key])&&saved[key]>=0&&saved[key]<=50) && ['trainingDone','deliveryDone','cityDone'].every(key=>typeof saved[key]==='boolean')) for(const key of Object.keys(state))state[key]=saved[key];
  if (saved?.robotRules !== RobotEngine.VERSION) { state.robot = 0; state.trainingDone = false; state.deliveryDone = false; }
  if (saved?.cityRules !== cityRules) { state.city = 0; state.cityDone = false; }
  if (session !== 'initial') $('epiView').src = 'city.html?v=traffic-school-3&session=' + encodeURIComponent(session);
  function draw() {
    window.FestivalSession?.save('score',{...state,rules:GameScore.VERSION,robotRules:RobotEngine.VERSION,cityRules},session);
    $('overallScore').textContent = GameScore.total(state);
    const done = [state.trainingDone, state.deliveryDone, state.cityDone].filter(Boolean).length;
    $('missionProgress').textContent = `Задания: ${done} / 3`;
    $('missionBar').classList.toggle('all-done', done === 3);
    for (const [id, name, flag] of [['trainingMission', '1. Обучи робота', state.trainingDone], ['deliveryMission', '2. Три выезда', state.deliveryDone], ['cityMission', '3. Помоги городу', state.cityDone]]) {
      $(id).textContent = `${flag ? '✓ ' : ''}${name}`; $(id).classList.toggle('done', flag);
    }
  }
  window.SessionScore = {
    robot(score, done, trialComplete) { state.robot = Math.max(state.robot, score); state.trainingDone ||= trialComplete; state.deliveryDone ||= done; draw(); }
  };
  function fileCityVisibility() {
    $('epiView').contentWindow?.postMessage(document.body.classList.contains('city-active') ? 'city-active' : 'pause', '*');
  }
  if (location.protocol === 'file:') $('epiView').addEventListener('load', fileCityVisibility);
  window.addEventListener('message', e => {
    const validOrigin = location.protocol === 'file:' ? e.origin === 'null' : e.origin === location.origin;
    if (e.source !== $('epiView').contentWindow || !validOrigin || e.data?.session !== session) return;
    if (location.protocol === 'file:' && e.data.kind === 'city-ready' && e.data.version === 1) {
      fileCityVisibility();
      return;
    }
    if (location.protocol === 'file:' && e.data.version === 1 && e.data.name === 'city') {
      if (e.data.kind === 'festival-session-read') e.source.postMessage({
        kind: 'festival-session-seed', version: 1, session, name: 'city', value: window.FestivalSession?.read('city')
      }, '*');
      else if (e.data.kind === 'festival-session-save' && e.data.value && typeof e.data.value === 'object' && !Array.isArray(e.data.value))
        window.FestivalSession?.save('city', e.data.value, session);
      return;
    }
    if (e.data.kind !== 'city-score' || e.data.version !== GameScore.VERSION || e.data.rules !== cityRules) return;
    if (!Number.isInteger(e.data.score) || e.data.score < 0 || e.data.score > 50 || typeof e.data.completed !== 'boolean') return;
    state.city = Math.max(state.city, e.data.score); state.cityDone ||= e.data.completed; draw();
  });
  $('newParticipant').onclick = () => {
    window.GameTour?.finish(false); session = window.FestivalSession?.reset() || String(Date.now()); window.resetRobotMission();
    for (const key of Object.keys(state)) state[key] = typeof state[key] === 'boolean' ? false : 0;
    $('epiView').src = 'city.html?v=traffic-school-3&session=' + encodeURIComponent(session);
    $('robotTab').click(); draw();
  };
  window.robotExpedition?.publish(); draw();
})();
