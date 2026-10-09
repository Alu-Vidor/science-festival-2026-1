/* Child demonstrations teach the controller. Only complete autonomous suites score. */
(function () {
  'use strict';
  const E = window.TrafficEngine, L = window.TrafficLearning, $ = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const counted = (number, forms) => number + ' ' + forms[number % 100 >= 11 && number % 100 <= 14 ? 2 : number % 10 === 1 ? 0 : number % 10 >= 2 && number % 10 <= 4 ? 1 : 2];
  const session = new URLSearchParams(location.search).get('session') || window.FestivalSession?.id || 'initial';
  const actionAxes = ['EW', 'NS', 'BOTH'];
  const axisName = axis => axis === 'BOTH' ? 'Все дороги сразу' : axis === 'EW' ? 'Главная дорога ↔' : 'Поперечная дорога ↕';
  let game, renderer, playing = false, timer, hiddenByParent = false, dialogEdit;
  function fresh(best = 0, bestResult = null, completed = false) {
    return { rules: E.VERSION, examples: [], model: L.emptyModel(), best, bestResult, completed,
      attempts: [], caseIndex: 0, mode: 'teach', selectedJunction: E.trainingCases[0].junction,
      selectedAxis: null, selectedDuration: 8, draft: null, pending: null, view: clone(E.trainingCases[0].state), currentScore: 0, nextId: 1 };
  }
  function persist() {
    game.feedback = $('roundResult').innerText; game.statusText = $('cityStatus').textContent;
    window.FestivalSession?.save('city', clone(game), session);
  }
  function publish() {
    persist();
    if (window !== parent) parent.postMessage({ kind: 'city-score', version: GameScore.VERSION,
      rules: E.VERSION, session, score: game.best, completed: game.completed }, location.protocol === 'file:' ? '*' : location.origin);
  }
  function recover() {
    const saved = window.FestivalSession?.read('city');
    if (!saved || saved.rules !== E.VERSION) return fresh();
    try {
      if (!Array.isArray(saved.examples) || saved.examples.length > 32 || saved.examples.some(e => !L.validateExample(e)) ||
        !Array.isArray(saved.attempts) || saved.attempts.length > 2 || !Number.isInteger(saved.best) || saved.best < 0 || saved.best > 50 ||
        !Number.isInteger(saved.caseIndex) || saved.caseIndex < 0 || saved.caseIndex >= E.trainingCases.length ||
        !['teach', 'check'].includes(saved.mode) || !Number.isInteger(saved.nextId) || saved.nextId < 1) return fresh();
      saved.model = saved.examples.length ? L.train(saved.examples) : L.emptyModel();
      if (saved.pending) {
        const p = saved.pending;
        if (!['demo', 'practice', 'exam'].includes(p.kind) || !p.state || !Number.isInteger(p.state.tick) ||
          !(p.state.junctionIds || Object.keys(p.state.signals || {})).every(id => E.junctionIds.includes(id) && p.state.signals?.[id]) || !Array.isArray(p.state.agents) ||
          !Array.isArray(p.results) || p.results.length > E.scenarios.length || !Number.isInteger(p.scenarioIndex) ||
          p.scenarioIndex < 0 || p.scenarioIndex >= E.scenarios.length) return fresh();
        if (p.kind !== 'demo') p.frozenModel = p.frozenExamples.length ? L.train(p.frozenExamples) : L.emptyModel();
        saved.view = clone(p.state);
      }
      return saved;
    } catch { return fresh(); }
  }
  function node(tag, text, parent, attributes = {}) {
    const element = document.createElement(tag); element.textContent = text;
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    parent.appendChild(element); return element;
  }
  function status(text) { $('cityStatus').textContent = text; }
  function observation() { return E.observe(game.view, game.selectedJunction); }
  function queueSummary(obs, box) {
    box.replaceChildren();
    for (const axis of E.axes) {
      const q = obs[axis], row = node('div', '', box, { class: 'queue-row' });
      row.classList.add(axis === 'EW' ? 'queue-horizontal' : 'queue-vertical');
      node('span', axis === 'EW' ? '↔ Главная' : '↕ Поперечная', row, { class: 'queue-label' });
      node('strong', q.people ? counted(q.people, ['человек', 'человека', 'человек']) : 'Никто не ждёт', row);
      const composition = [];
      if (q.cars) composition.push(counted(q.cars, ['машина', 'машины', 'машин']));
      if (q.buses) composition.push(counted(q.buses, ['автобус', 'автобуса', 'автобусов']));
      if (q.pedestrianPeople) composition.push(counted(q.pedestrianPeople, ['пешеход', 'пешехода', 'пешеходов']));
      if (composition.length) node('div', composition.join(' · '), row, { class: 'queue-composition' });
      const directions = obs.byDirection?.[axis];
      if (directions && q.vehicles) {
        const forward = axis === 'EW' ? '→' : '↓', backward = axis === 'EW' ? '←' : '↑';
        node('div', 'Поездки: ' + backward + ' ' + (directions[-1]?.vehicles || 0) + ' · ' + forward + ' ' + (directions[1]?.vehicles || 0), row, { class: 'queue-directions' });
      }
      if (q.vehicles) {
        node('div', 'Ждут до ' + q.wait + ' с', row);
        node('div', q.slack <= 0 ? 'Уже опаздывают' : 'До опоздания: ' + Math.ceil(q.slack) + ' с', row, { class: q.slack < 12 ? 'urgent' : '' });
        if (q.space <= 0) node('div', 'Выезд занят', row, { class: 'urgent', title: 'Дорога впереди заполнена: на неё нельзя въехать даже на зелёный.' });
        else if (directions) {
          const blocked = [-1, 1].filter(dir => directions[dir]?.vehicles && directions[dir].space <= 0);
          if (blocked.length) node('div', 'Выезд ' + blocked.map(dir => axis === 'EW' ? dir === 1 ? '→' : '←' : dir === 1 ? '↓' : '↑').join(', ') + ' занят', row, { class: 'urgent' });
        }
      }
    }
  }
  function predictionReadout() {
    const p = game.pending, obs = observation(), model = p?.frozenModel || game.model;
    const decision = p?.lastDecisions?.[game.selectedJunction] || L.predict(model, obs);
    $('liveDecision').replaceChildren();
    const signal = game.view.signals[game.selectedJunction];
    if (signal.blockedUntil > game.view.tick) node('b', 'Авария: перекрёсток закрыт ещё ' + (signal.blockedUntil - game.view.tick) + ' с', $('liveDecision'));
    node('b', 'Перекрёсток ' + game.selectedJunction + ': ' + axisName(decision.axis) + ' · ' + decision.duration + ' с', $('liveDecision'));
    node('span', decision.reason || 'ИИ сравнивает очередь с твоими примерами.', $('liveDecision'));
    if (signal.axis && signal.blockedUntil <= game.view.tick) node('small', signal.clearance ? 'Жёлтый: ' + signal.clearance + ' с' : 'Зелёный: осталось ' + signal.remaining + ' с', $('liveDecision'), { class: 'signal-state' });
  }
  function update() {
    const p = game.pending, busy = !!p, teaching = game.mode === 'teach', c = E.trainingCases[game.caseIndex];
    document.body.classList.toggle('traffic-playing', playing);
    document.body.classList.toggle('traffic-busy', busy);
    $('teachMode').setAttribute('aria-pressed', teaching); $('checkMode').setAttribute('aria-pressed', !teaching);
    $('teachingControls').hidden = !teaching; $('autonomousControls').hidden = teaching;
    $('teachMode').disabled = $('checkMode').disabled = busy;
    $('caseTitle').textContent = teaching ? c.title : p?.kind === 'exam' ? E.scenarios[p.scenarioIndex].title : E.scenarios.find(s => s.id === game.view.scenarioId)?.title || 'Самостоятельный заезд ИИ';
    $('caseDescription').textContent = c.description;
    $('teachingJunction').textContent = 'ТЫ ОБУЧАЕШЬ СВЕТОФОР ' + c.junction;
    $('cityProgress').textContent = teaching ? 'Ситуация ' + (game.caseIndex + 1) + ' / ' + E.trainingCases.length : p?.kind === 'exam' ? 'Поток ' + (p.scenarioIndex + 1) + ' / ' + E.scenarios.length : 'Новые очереди · ' + game.view.tick + ' с';
    $('cityBestScore').textContent = game.best + ' / 50'; $('cityLocalScore').textContent = game.currentScore + ' / 50';
    $('cityBestWait').hidden = !game.bestResult;
    $('cityBestWait').textContent = game.bestResult ? 'Ожидание: ' + (game.bestResult.delay / game.bestResult.totalPeople).toFixed(1) + ' с' : '';
    $('exampleCount').textContent = counted(game.examples.length, ['пример', 'примера', 'примеров']);
    for (const axis of actionAxes) { $('axis' + axis).setAttribute('aria-pressed', game.selectedAxis === axis); $('axis' + axis).disabled = busy; }
    for (const duration of E.durations) { $('duration' + duration).setAttribute('aria-pressed', game.selectedDuration === duration); $('duration' + duration).disabled = busy; }
    $('demonstrate').hidden = !!game.draft || busy; $('demonstrate').disabled = busy || !game.selectedAxis;
    $('saveExample').hidden = !game.draft; $('saveExample').disabled = busy || !!game.draft?.saved || game.examples.length >= 32;
    $('saveExample').textContent = game.draft?.saved ? '✓ Пример передан ИИ' : 'Передать пример ИИ';
    $('previousCase').disabled = $('nextCase').disabled = busy;
    $('testAI').disabled = $('practiceScenario').disabled = busy || !game.examples.length;
    $('startExam').disabled = busy || !game.examples.length || game.attempts.length >= 2;
    $('attemptsLeft').textContent = 'Осталось заездов в партии: ' + (2 - game.attempts.length);
    $('restartCity').disabled = busy; $('restartCity').hidden = busy;
    $('playbackControls').hidden = !busy;
    $('pauseCity').hidden = !playing; $('resumeCity').hidden = playing;
    $('stopCity').textContent = p?.kind === 'exam' ? 'Прервать заезд · попытка сохранится' : 'Завершить этот просмотр';
    $('aiQueueReadout').hidden = teaching || !busy;
    if (teaching) queueSummary(observation(), $('queueReadout')); else { predictionReadout(); if (busy) queueSummary(observation(), $('aiQueueReadout')); }
    renderer.render(game.view, { selectedJunction: game.selectedJunction, selectedAxis: game.selectedAxis, teaching, interactive: teaching ? !busy : true,
      animate: playing, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, ghost: !busy && !game.draft && teaching && !!game.selectedAxis });
  }
  function setCase(index) {
    if (game.pending) return;
    game.caseIndex = (index + E.trainingCases.length) % E.trainingCases.length;
    const c = E.trainingCases[game.caseIndex]; game.view = clone(c.state); game.selectedJunction = c.junction;
    game.selectedAxis = null; game.draft = null; game.mode = 'teach';
    $('roundResult').textContent = 'Посмотри на очереди, выбери направление и длительность зелёного.';
    status('Ситуации можно выбирать, пропускать и повторять.');
    update(); persist();
  }
  function choose(junction, axis) {
    if (game.mode !== 'teach') { game.selectedJunction = junction; update(); persist(); return; }
    if (game.pending) return;
    if (junction !== E.trainingCases[game.caseIndex].junction) {
      status('В этой ситуации обучаем светофор ' + E.trainingCases[game.caseIndex].junction + '. В заезде ИИ будет управлять всеми перекрёстками.'); return;
    }
    if (game.draft) { game.view = clone(E.trainingCases[game.caseIndex].state); game.draft = null; }
    game.selectedJunction = junction; game.selectedAxis = axis;
    status(axisName(axis) + ' · ' + game.selectedDuration + ' с. Нажми «Показать решение», чтобы увидеть последствия.');
    update(); persist();
  }
  function schedule() {
    clearTimeout(timer);
    if (playing) timer = setTimeout(tick, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 18 : 350);
  }
  function startPlayback() { playing = true; update(); persist(); schedule(); }
  function demo() {
    if (game.pending || !game.selectedAxis || game.draft) return;
    const c = E.trainingCases[game.caseIndex], state = clone(c.state), action = { axis: game.selectedAxis, duration: game.selectedDuration };
    game.pending = { kind: 'demo', state, scenarioIndex: 0, results: [], observation: E.observe(state, game.selectedJunction), action,
      junction: game.selectedJunction, until: state.tick + action.duration + E.CLEARANCE_TIME + E.TRAVEL_TIME + 1, startTick: state.tick, sent: false };
    $('roundResult').textContent = 'Твой светофор: ' + axisName(action.axis) + ', зелёный ' + action.duration + ' с. ИИ пока не обучается.';
    status('Смотри, кто проехал и кто остался ждать.'); startPlayback();
  }
  function autonomous(kind) {
    if (game.pending || !game.examples.length || kind === 'exam' && game.attempts.length >= 2) return;
    game.mode = 'check'; game.draft = null; game.selectedAxis = null; game.selectedJunction = 'A';
    const scenarioIndex = kind === 'exam' ? 0 : E.scenarios.findIndex(s => s.id === $('practiceScenario').value);
    const id = game.attempts.length + 1;
    if (kind === 'exam') game.attempts.push({ id, status: 'running', examplesCount: game.examples.length });
    game.pending = { kind, state: E.create(E.scenarios[scenarioIndex].id), scenarioIndex, results: [],
      frozenExamples: clone(game.examples), frozenModel: clone(game.model), lastDecisions: {}, attemptId: kind === 'exam' ? id : null };
    game.view = clone(game.pending.state);
    $('roundResult').textContent = kind === 'exam' ? 'Заезд начался. Баллы появятся после всех трёх потоков.' : 'Свободная проверка: баллы и зачётные попытки не меняются.';
    status('ИИ сам управляет светофорами по переданным примерам. Во время заезда примеры зафиксированы.'); startPlayback();
  }
  function tick() {
    const p = game.pending; if (!p || !playing) return;
    const decisions = {};
    if (p.kind === 'demo') {
      if (!p.sent) { decisions[p.junction] = p.action; p.sent = true; }
    } else {
      for (const junction of p.state.junctionIds || Object.keys(p.state.signals)) {
        const signal = p.state.signals[junction];
        if (!signal.remaining && !signal.clearance && signal.blockedUntil <= p.state.tick) {
          const obs = E.observe(p.state, junction), decision = L.predict(p.frozenModel, obs);
          decisions[junction] = { axis: decision.axis, duration: decision.duration };
          p.lastDecisions[junction] = decision;
        }
      }
    }
    p.state = E.step(p.state, decisions); game.view = clone(p.state);
    if (p.kind === 'demo' && p.state.accidents?.length) p.until = Math.min(p.until, p.state.accidents[0].tick + 3);
    if (p.kind === 'demo' && p.state.tick >= p.until || p.state.done) { finishSegment(); return; }
    if (p.kind !== 'demo') $('roundResult').textContent = 'Вовремя прибыли ' + p.state.onTime + ' из ' + p.state.totalPeople + ' · аварий ' + (p.state.crashCount || 0) + ' · в городе ' + p.state.tick + ' с';
    update(); persist(); schedule();
  }
  function finishSegment() {
    const p = game.pending, report = E.report(p.state);
    if (p.kind === 'demo') {
      const queues = E.observe(p.state, p.junction), waiting = queues.EW.people + queues.NS.people;
      const departed = p.state.agents.filter(a => a.status !== 'crashed' && Number.isInteger(a.departedAt) && a.from?.junction === p.junction && (p.action.axis === 'BOTH' || a.from?.axis === p.action.axis) && a.departedAt >= p.startTick);
      const crossed = departed.reduce((sum, a) => sum + a.people, 0), other = p.action.axis === 'EW' ? 'NS' : 'EW';
      const otherWait = queues[other].wait, unusedGreen = Math.max(0, p.action.duration - new Set(departed.map(a => a.departedAt)).size);
      game.draft = { id: 'example-' + game.nextId++, caseIndex: game.caseIndex, title: E.trainingCases[game.caseIndex].title,
        observation: clone(p.observation), action: clone(p.action), saved: false, crossed, waiting, otherWait, unusedGreen, report };
      game.pending = null; playing = false;
      $('roundResult').textContent = 'Проехали ' + crossed + ' человек. Другая очередь ждала ' + otherWait + ' с. Зелёный без проезда: ' + unusedGreen + ' с.';
      if (p.state.accidents?.length) $('roundResult').textContent = 'Столкновение: пересекающиеся потоки получили зелёный одновременно. Перекрёсток заблокирован, очереди растут.';
      status('Если передашь пример, ИИ запомнит именно твоё решение — даже если оно оказалось неудачным.');
    } else if (p.kind === 'practice') {
      game.pending = null; playing = false;
      $('roundResult').replaceChildren(); node('strong', 'Вовремя: ' + report.onTime + ' из ' + report.totalPeople, $('roundResult'));
      node('span', 'Свободная проверка. Измени примеры или попробуй другой поток.', $('roundResult'));
      status('Это работа твоего ИИ. Ошибки не исправляются автоматически; можно вернуться к обучению.');
    } else {
      p.results.push(report);
      if (p.scenarioIndex + 1 < E.scenarios.length) {
        p.scenarioIndex++; p.state = E.create(E.scenarios[p.scenarioIndex].id); p.lastDecisions = {}; game.view = clone(p.state);
        $('roundResult').textContent = 'Следующий поток. Обучение и предыдущий результат зафиксированы.';
        update(); persist(); schedule(); return;
      }
      const onTime = p.results.reduce((sum, r) => sum + r.onTime, 0), totalPeople = p.results.reduce((sum, r) => sum + r.totalPeople, 0),
        delay = p.results.reduce((sum, r) => sum + r.delay, 0), accidents = p.results.reduce((sum, r) => sum + (r.accidents || 0), 0), score = Math.floor(50 * onTime / Math.max(1, totalPeople));
      const result = { score, onTime, totalPeople, delay, accidents, results: clone(p.results) };
      const attempt = game.attempts.find(a => a.id === p.attemptId); Object.assign(attempt, result, { status: 'completed' });
      game.currentScore = score; game.completed = true;
      if (!game.bestResult || score > game.best || score === game.best && delay < game.bestResult.delay) { game.best = score; game.bestResult = clone(result); }
      game.pending = null; playing = false;
      $('roundResult').replaceChildren(); node('strong', 'Вовремя: ' + onTime + ' из ' + totalPeople, $('roundResult'));
      node('span', score + ' / 50 · аварий ' + accidents + ' · среднее ожидание ' + (delay / totalPeople).toFixed(1) + ' с', $('roundResult'));
      status(score === 50 ? 'Все жители успели. При равных баллах сравнивайте время ожидания.' : 'Заезд завершён. Посмотри на оставшиеся очереди и попробуй дообучить ИИ.');
      publish();
    }
    update(); persist();
  }
  function pause(message = 'Пауза. Примеры и результат заезда сохраняются.') {
    clearTimeout(timer); playing = false; update(); persist(); if (game.pending) status(message);
  }
  function stop() {
    if (!game.pending) return;
    const p = game.pending;
    if (p.kind === 'exam') { const attempt = game.attempts.find(a => a.id === p.attemptId); attempt.status = 'interrupted'; }
    clearTimeout(timer); playing = false; game.pending = null;
    status(p.kind === 'exam' ? 'Заезд прерван. Попытка использована, баллы не начислены.' : 'Просмотр завершён. Обучение и баллы не изменились.');
    if (p.kind === 'demo') { game.view = clone(E.trainingCases[game.caseIndex].state); game.draft = null; }
    update(); persist();
  }
  function saveExample() {
    const draft = game.draft; if (!draft || draft.saved || game.pending || game.examples.length >= 32) return;
    game.examples.push({ id: draft.id, observation: clone(draft.observation), action: clone(draft.action), title: draft.title, caseIndex: draft.caseIndex });
    game.model = L.train(game.examples); draft.saved = true;
    status('ИИ получил твой пример. Покажи другую ситуацию или перейди в «ИИ управляет».'); update(); publish();
  }
  function openInfo(title) { if (playing) pause('Осмотр остановил движение. Закрой окно и нажми «Продолжить».'); $('infoTitle').textContent = title; $('infoContent').replaceChildren(); if (!$('trafficInfo').open) $('trafficInfo').showModal(); }
  function showExamples() {
    openInfo('Чему ты научил ИИ'); const box = node('div', '', $('infoContent'), { id: 'examplesList' });
    node('p', 'ИИ запоминает твой выбор. Он узнаёт похожие очереди, даже если дороги поменялись местами.', box);
    if (!game.examples.length) { node('p', 'Примеров пока нет. Покажи решение на перекрёстке и нажми «Передать пример ИИ».', box); return; }
    game.examples.forEach((example, i) => {
      const card = node('article', '', box, { class: 'example-card', 'data-example-id': example.id }), text = node('div', '', card);
      node('strong', '№ ' + (i + 1) + ' · ' + axisName(example.action.axis) + ' · ' + example.action.duration + ' с', text);
      node('p', example.title, text);
      node('p', 'Главная: ' + example.observation.EW.people + ' чел. · поперёк: ' + example.observation.NS.people + ' чел.', text);
      const edit = node('button', 'Изменить', card, { id: 'editExample-' + example.id }), remove = node('button', 'Удалить', card, { id: 'removeExample-' + example.id });
      edit.disabled = remove.disabled = !!game.pending;
      edit.onclick = () => editExample(example.id); remove.onclick = () => {
        if (game.pending) return; game.examples = game.examples.filter(e => e.id !== example.id);
        game.model = game.examples.length ? L.train(game.examples) : L.emptyModel();
        if (game.draft?.id === example.id) game.draft.saved = false;
        update(); publish(); showExamples();
      };
    });
  }
  function editExample(id) {
    if (game.pending) return; const example = game.examples.find(e => e.id === id); if (!example) return;
    dialogEdit = clone(example); openInfo('Измени свой пример'); const box = node('div', '', $('infoContent'), { class: 'example-editor' });
    node('p', 'Очереди остаются прежними. Ты меняешь то, какое решение должен повторить ИИ.', box);
    queueSummary(example.observation, node('div', '', box));
    const axisBox = node('div', '', box, { class: 'axis-choices' });
    for (const axis of actionAxes) { const b = node('button', axisName(axis), axisBox, { id: 'editAxis' + axis, 'aria-pressed': example.action.axis === axis }); b.onclick = () => { dialogEdit.action.axis = axis; [...axisBox.children].forEach(button => button.setAttribute('aria-pressed', button === b)); }; }
    const durationBox = node('div', '', box, { class: 'duration-choices' });
    for (const duration of E.durations) { const b = node('button', duration + ' с', durationBox, { id: 'editDuration' + duration, 'aria-pressed': example.action.duration === duration }); b.onclick = () => { dialogEdit.action.duration = duration; [...durationBox.children].forEach(button => button.setAttribute('aria-pressed', button === b)); }; }
    const save = node('button', 'Передать изменённый пример', box, { id: 'exampleEditSave', class: 'primary' });
    save.onclick = () => { if (game.pending) return; game.examples = game.examples.map(e => e.id === id ? clone(dialogEdit) : e); game.model = L.train(game.examples); dialogEdit = null; update(); publish(); showExamples(); };
  }
  function showRules() {
    openInfo('Ты учишь — ИИ управляет');
    const list = node('ol', '', $('infoContent'));
    for (const text of ['Посмотри, сколько людей ждёт и кто скоро опоздает. Выбери направление зелёного и 4, 8 или 12 секунд.',
      'Нажми «Показать решение». Увидишь движение и оставшуюся очередь. Затем «Передать пример ИИ» — он запомнит твой выбор.',
      'Покажи разные ситуации. ИИ выбирает направление и длительность по похожим примерам, включая случаи с поворотом дорог.',
      'Включи «ИИ управляет». Свободная проверка не расходует попытки; заезд на результат проверяет три новых потока.',
      'Считаются люди, прибывшие вовремя. При равенстве баллов выигрывает меньшее среднее ожидание жителей. Неудачные примеры можно изменить или удалить.']) node('li', text, list);
    node('p', 'Дороги двусторонние. Зелёный для главной или поперечной дороги разрешает движение по обеим встречным полосам этой дороги. По каждой полосе проезжает одна машина или группа за игровую секунду. В автобусе могут ехать несколько человек. Между командами — 2 секунды жёлтого. Если выезд занят, транспорт ждёт даже на зелёный.', $('infoContent'));
    node('p', 'Одновременный зелёный в пересекающихся направлениях может вызвать столкновение. Тогда перекрёсток временно заблокирован, а пробка распространяется дальше. В заезде три разных карты: два, три и четыре перекрёстка.', $('infoContent'));
    node('p', 'Это учебная модель обучения по твоим демонстрациям. ИИ видит текущие очереди и сроки, а не будущие события. Маршруты жителей заданы их поездками.', $('infoContent'));
  }
  function inspectAgent(id) {
    const agent = game.view.agents.find(a => a.id === id); if (!agent) return;
    openInfo(agent.kind === 'bus' ? 'Автобус с жителями' : agent.kind === 'pedestrian' ? 'Пешеходы' : 'Поездка жителя');
    const box = node('div', '', $('infoContent'), { class: 'road-detail' });
    node('strong', counted(agent.people, ['человек', 'человека', 'человек']) + ' · ' + (agent.status === 'arrived' ? 'прибыли' : agent.status === 'crashed' ? 'поездка прервана из-за столкновения' : 'в пути'), box);
    const remaining = agent.deadline - game.view.tick;
    node('p', agent.status === 'arrived' ? (agent.arrivedAt <= agent.deadline ? 'Успели вовремя.' : 'Прибыли с опозданием.') : remaining > 0 ? 'До опоздания: ' + remaining + ' с.' : remaining === 0 ? 'Срок наступил.' : 'Срок уже прошёл на ' + Math.abs(remaining) + ' с.', box);
    node('p', 'Маршрут: ' + agent.route.map(leg => leg.junction + ' ' + (leg.axis === 'EW' ? leg.dir === -1 ? '←' : '→' : leg.dir === -1 ? '↑' : '↓')).join(' · '), box);
    node('p', 'Жители двигаются по настоящим очередям этой модели. Цвет таймера показывает близкое опоздание.', box);
  }
  async function init() {
    await window.FestivalSession?.ready; game = recover();
    renderer = TrafficMap.init($('map'), { onSelect: choose, onAgent: inspectAgent });
    E.scenarios.forEach(s => { const option = node('option', s.title, $('practiceScenario')); option.value = s.id; });
    $('teachMode').onclick = () => { if (!game.pending) { game.mode = 'teach'; if (!game.draft) game.view = clone(E.trainingCases[game.caseIndex].state); game.selectedJunction = E.trainingCases[game.caseIndex].junction; update(); persist(); } };
    $('checkMode').onclick = () => { if (!game.pending) { game.mode = 'check'; game.view = E.create($('practiceScenario').value); game.selectedJunction = 'A'; game.selectedAxis = null; game.draft = null; update(); persist(); status(game.examples.length ? 'Можно бесплатно проверить ИИ или начать заезд на результат.' : 'Сначала покажи решение и передай хотя бы один пример ИИ.'); } };
    for (const axis of actionAxes) $('axis' + axis).onclick = () => choose(game.selectedJunction, axis);
    for (const duration of E.durations) $('duration' + duration).onclick = () => { if (game.pending) return; if (game.draft) { game.view = clone(E.trainingCases[game.caseIndex].state); game.draft = null; } game.selectedDuration = duration; update(); persist(); };
    $('demonstrate').onclick = demo; $('saveExample').onclick = saveExample;
    $('nextCase').onclick = () => setCase(game.caseIndex + 1); $('previousCase').onclick = () => setCase(game.caseIndex - 1);
    $('testAI').onclick = () => autonomous('practice'); $('startExam').onclick = () => autonomous('exam');
    $('pauseCity').onclick = event => { if (event.detail > 1) return; pause(); }; $('resumeCity').onclick = event => { if (event.detail > 1) return; if (game.pending && !hiddenByParent) { status('Продолжаем с сохранённого момента.'); startPlayback(); } }; $('stopCity').onclick = stop;
    $('restartCity').onclick = () => { if (game.pending) return; game = fresh(game.best, game.bestResult, game.completed); $('roundResult').textContent = 'Новая партия: обучение и два заезда начинаются заново. Рекорд сохранён.'; update(); publish(); };
    $('openExamples').onclick = showExamples; $('cityTutorial').onclick = showRules; $('closeInfo').onclick = () => $('trafficInfo').close();
    $('practiceScenario').onchange = () => { if (!game.pending) { game.view = E.create($('practiceScenario').value); update(); persist(); } };
    window.addEventListener('message', event => {
      if (event.source !== parent) return;
      if (event.data === 'pause') { hiddenByParent = true; if (playing) pause('Переход к роботу остановил город. Продолжи заезд после возвращения.'); }
      if (event.data === 'city-active') hiddenByParent = false;
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && playing) pause('Вкладка скрыта. Город остановлен до твоего возвращения.'); });
    window.addEventListener('pagehide', () => { if (playing) pause(); });
    window.trafficCityGame = { current: () => clone(game), examples: () => clone(game.examples), model: () => clone(game.model),
      pending: () => clone(game.pending), isPlaying: () => playing, isPending: () => !!game.pending };
    const feedback = game.feedback, statusText = game.statusText;
    update();
    $('roundResult').textContent = game.pending ? 'Прогон восстановлен на паузе. Нажми «Продолжить».' : feedback || 'Покажи своё решение. ИИ будет учиться именно на твоих примерах.';
    status(game.pending ? 'Перезагрузка сохранила момент и использованную попытку.' : statusText || 'Выбери направление на карте или справа, затем длительность зелёного.');
    publish();
    if (window !== parent) parent.postMessage({ kind: 'city-ready', version: 1, session }, location.protocol === 'file:' ? '*' : location.origin);
  }
  init();
})();
