/* Self-paced city campaign; simulation time advances only through a player's action. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id), C = CityCampaign;
  const names = { school: '🎒 Занятия и работа', bus: '🚌 Поездки', shops: '🛒 Продукты' };
  let campaign = C.create(), plan = GameScore.cityDefaults(), started = false, lesson = null;
  let best = 0, completedOnce = false, attempts = [], playing = false, pending = null, timer = null;
  let selectedCitizen = 0, viewedGame, viewedFrame, viewedHistory, viewedIndex;
  const session = new URLSearchParams(location.search).get('session') || 'initial';
  const shell = document.createElement('section'); shell.id = 'mayor';
  shell.innerHTML = `<div class="mayor-title"><div><span class="eyebrow">ЗАДАНИЕ 3 · ЖИВОЙ ГОРОД</span><h1>Помоги городу жить</h1><p id="cityCalendar">Три раунда · 12 игровых дней · около 12 минут</p></div><strong id="cityLocalScore" class="city-local-score">0 / 50</strong></div>
    <nav id="cityRounds" class="city-rounds" aria-label="Раунды города"></nav>
    <p id="cityRoundBrief" class="city-round-brief"></p>
    <div class="city-playground"><div class="city-map-area"><div id="mayorMapSlot"></div><p id="citizenStory">Эмоции появятся над жителями. Нажми на фигурку, чтобы узнать причину.</p>
      <div id="cityComparison" class="city-comparison" hidden><div id="cityEffects"></div></div><p id="mayorStatus" role="status" aria-live="polite"></p></div>
      <div id="cityDecisions" class="city-decisions">
        <div class="city-start" id="cityStart"><p>Учебный день бесплатный. Испытание начнётся с чистого города.</p><button id="observeCity" class="primary">▶ Учебный день</button><button id="beginCity">Начать испытание →</button></div>
        <h2 id="cityGoalTitle">Цели на четыре дня</h2><div id="cityGoalGrid" class="city-goals"></div><p id="cityNeeds" class="city-needs"></p>
        <div id="mayorPolicies"></div><div class="city-time-controls"><button id="tryCity" class="primary" disabled>Прожить день 1</button><button id="pauseCity" disabled>Пауза</button></div>
        <p id="roundOutcome" class="round-outcome"></p><button id="restartCity" hidden>Новое прохождение</button>
      </div></div>
    <details id="cityProjects"><summary id="projectSummary">Улучшения · 200</summary><p>Фонд строительства — 200 монет на всё прохождение. Сейчас у больницы одно место помощи; в третьем раунде обращений станет больше. Доходы города его не пополняют. Улучшения сохраняются; на все три денег не хватит.</p><div id="projectChoices"></div><p id="cityBudget"></p></details>
    <details id="cityPeople"><summary>Жители</summary><label>Житель<select id="citizenChoice"></select></label><div id="citizenPanel"></div></details>
    <details id="cityReports"><summary>Раунды</summary><div id="roundReports"></div><div id="cityAttempts" class="attempt-chips"></div><button id="restartEarly">Начать заново</button></details>
    <details class="city-rules"><summary>Правила</summary><p>Три раунда по четыре дня дают до 10, 15 и 25 баллов. Цели показаны до начала раунда. Еда, занятия, настроение и помощь оцениваются в среднем за четыре дня; заражения и расходы — в сумме. Максимум доступен только при выполнении всех целей раунда.</p><p>Один клик проживает один день. После него город ждёт твоего решения. Можно поставить анимацию на паузу, рассмотреть жителей и продолжить. Изменения плана действуют со следующего дня.</p><p>Ограниченный фонд оплачивает строительство. Городской бюджет отдельно учитывает ежедневные доходы и расходы, включая содержание улучшений. Построенное работает со следующего дня. Запасы, усталость и болезни переходят между раундами.</p><p>В последнем раунде до четырёх жителей возвращаются после поездки, где заразились накануне. Они учитываются отдельно от заражений внутри города. Симптомы в модели появляются через два дня после заражения.</p><p>🙂 удачная поездка, покупка, отдых или помощь; 😠 пропущенная поездка; 😟 очередь, нехватка еды или помощи; 😴 усталость. Цвет одежды отдельно показывает видимые симптомы.</p><p>Попытки не ограничены. Лучший счёт сохраняется. Время и скорость анимации не влияют на баллы. Это учебная модель вымышленного города.</p></details>`;
  document.body.insertBefore(shell, document.body.firstChild);
  $('mayorMapSlot').appendChild(document.querySelector('.city'));
  document.body.classList.add('mayor-mode', 'short-city', 'campaign-city'); window.mayorActive = true;
  function element(tag, text, parent) { const e = document.createElement(tag); e.textContent = text; parent.appendChild(e); return e; }
  function signal(name, detail) { window.GameTour?.signal(name, detail); }
  function publish() {
    $('cityLocalScore').textContent = best + ' / 50';
    if (window !== parent) parent.postMessage({ kind: 'city-score', version: GameScore.VERSION, session, score: best, completed: completedOnce }, location.origin === 'null' ? '*' : location.origin);
  }
  function initialHistory(game) {
    return { day: 0, phase: 4, state: game.people.map((_, i) => i ? 'S' : 'I'), loc: game.people.map(p => p.home), events: [], S: game.people.length - 1, I: 1, R: 0, outside: 0,
      citizens: game.people.map(() => ({ energy: 80, happiness: 80, food: 100, reaction: null })), householdFood: game.households.map(() => 1) };
  }
  function render(c, index = c.game.history.length) {
    viewedGame = c.game; viewedHistory = [initialHistory(c.game), ...c.game.history]; viewedIndex = index; viewedFrame = viewedHistory[index];
    window.renderMayor(c.game, viewedHistory, index);
    const figures = [...$('map').querySelectorAll('[data-person]')];
    const candidates = figures.map(figure => ({ figure, index: +figure.getAttribute('data-person') }))
      .filter(x => viewedFrame.citizens?.[x.index].reaction && !x.figure.getAttribute('transform').includes('-100 -100'));
    candidates.sort((a, b) => viewedFrame.citizens[b.index].reaction.priority - viewedFrame.citizens[a.index].reaction.priority || a.index - b.index);
    const shown = [], seen = new Set();
    for (const item of candidates) {
      const person = c.game.people[item.index], reaction = viewedFrame.citizens[item.index].reaction, key = reaction.kind + ':' + person.district;
      if (seen.has(key)) continue;
      seen.add(key); shown.push(item); if (shown.length === 3) break;
    }
    const positive = candidates.find(x => viewedFrame.citizens[x.index].reaction.emoji === '🙂' && !shown.includes(x));
    if (positive) shown.push(positive);
    for (const { figure, index: i } of shown) {
      const r = viewedFrame.citizens[i].reaction;
      figure.setAttribute('data-reaction', r.kind); figure.setAttribute('aria-label', figure.getAttribute('aria-label') + ' · ' + r.text);
      const bubble = document.createElementNS('http://www.w3.org/2000/svg', 'g'); bubble.setAttribute('class', 'citizen-emotion'); bubble.setAttribute('aria-hidden', 'true');
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); bg.setAttribute('cx', 0); bg.setAttribute('cy', -58); bg.setAttribute('r', 29); bubble.appendChild(bg);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text'); text.setAttribute('x', 0); text.setAttribute('y', -43); text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', 43); text.textContent = r.emoji; bubble.appendChild(text);
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title'); title.textContent = r.text; bubble.appendChild(title); figure.appendChild(bubble);
    }
    const first = shown[0];
    $('citizenStory').textContent = first ? viewedFrame.citizens[first.index].reaction.emoji + ' ' + c.game.people[first.index].name + ': «' + viewedFrame.citizens[first.index].reaction.text + '» Нажми на жителя.' : 'Нажми на жителя: увидишь настроение, запасы и уже пройденный маршрут.';
    $('cityCalendar').textContent = (lesson ? 'Обучение · без баллов' : 'День ' + viewedFrame.day + ' / 12') + (viewedFrame.day ? ' · ' + Epidemic.phases[viewedFrame.phase] : ' · город ждёт решения');
  }
  function state() { return lesson ? lesson.c : campaign; }
  function choices() {
    const activePlan = lesson ? lesson.plan : plan, box = $('mayorPolicies'); box.replaceChildren();
    for (const [key, options] of Object.entries(C.choices)) {
      const group = element('fieldset', '', box); group.id = 'choices-' + key; element('legend', names[key], group);
      for (const [value, title, hint] of options) {
        const button = element('button', title, group); button.id = 'pick-' + key + '-' + value; button.className = 'city-choice'; button.title = hint; button.setAttribute('aria-pressed', activePlan[key] === value);
        button.disabled = !!pending || (lesson ? !lesson.observed || lesson.tested : !started || campaign.completed);
        button.onclick = () => { activePlan[key] = value; choices(); $('mayorStatus').textContent = hint + ' Изменение действует со следующего дня.'; signal('city:choice', { key, value }); };
      }
    }
  }
  const goalFields = [
    ['cases', 'Новые заражения', '≤', ''], ['food', 'Продукты', '≥', '%'], ['activity', 'Занятия', '≥', '%'],
    ['care', 'Помощь', '≥', '%'], ['comfort', 'Настроение', '≥', '%'], ['expense', 'Расходы', '≤', '']
  ];
  function goals() {
    const c = state(), index = Math.min(2, Math.floor(c.game.day / 4)), goal = C.rounds[index], stats = C.measure(c, index);
    $('cityGoalTitle').textContent = lesson ? 'Цели испытания · четыре дня' : 'Цели раунда · ' + (stats?.days || 0) + ' / 4 дня';
    const box = $('cityGoalGrid'); box.replaceChildren();
    goalFields.forEach(([key, name, sign, unit]) => {
      const item = element('div', '', box); item.className = 'city-goal';
      const target = key === 'care' && !goal.care ? null : goal[key];
      element('span', name + (target === null ? '' : ' ' + sign + ' ' + target + unit), item);
      element('strong', stats ? (key === 'food' || key === 'activity' || key === 'comfort' || key === 'care' ? stats[key].toFixed(1) : stats[key]) + unit : '—', item);
      if (stats && target !== null) item.setAttribute('data-met', sign === '≤' ? stats[key] <= target : stats[key] >= target);
    });
    $('cityNeeds').textContent = 'Проценты — средние; заражения и расходы — сумма за раунд.';
  }
  function projects() {
    $('projectSummary').textContent = 'Улучшения · ' + campaign.funds;
    const box = $('projectChoices'); box.replaceChildren();
    for (const id of C.projects) {
      const project = Mayor.upgrades[id], card = element('article', '', box), button = element('button', project.title + ' · ' + project.cost + ' монет', card);
      button.id = 'build-' + id; button.disabled = !!lesson || !started || !!pending || campaign.completed || campaign.projects.includes(id) || campaign.funds < project.cost;
      if (campaign.projects.includes(id)) button.textContent += ' ✓';
      element('p', project.effect + '. Содержание: ' + project.upkeep + ' монет в день.', card);
      button.onclick = () => { campaign = C.invest(campaign, id); update(false); $('mayorStatus').textContent = project.title + ': построено. Работает со следующего дня. Осталось в фонде ' + campaign.funds + '.'; };
    }
    $('cityBudget').textContent = 'Городской бюджет: ' + campaign.game.cash + ' монет. Фонд улучшений: ' + campaign.funds + ' монет.';
  }
  function reports() {
    const box = $('roundReports'); box.replaceChildren();
    C.rounds.forEach((goal, index) => {
      const r = campaign.results[index], card = element('article', '', box);
      element('h3', goal.title + ' · ' + (r ? r.score + ' / ' + goal.max : 'до ' + goal.max), card);
      element('p', goal.brief, card);
      for (const [key, name, sign, unit] of goalFields) {
        const target = key === 'care' && !goal.care ? null : goal[key];
        if (r) element('p', name + ': ' + r[key].toFixed(key === 'cases' || key === 'expense' ? 0 : 1) + unit + (target === null ? '' : ' · цель ' + sign + ' ' + target + unit), card);
        else if(target !== null) element('p', name + ': цель ' + sign + ' ' + target + unit, card);
      }
    });
    const chips = $('cityAttempts'); chips.replaceChildren(); attempts.forEach((score, i) => element('span', 'Город ' + (i + 1) + ': ' + score + '/50', chips));
    $('restartEarly').disabled = !!pending || !started || !!lesson;
  }
  function update(renderNow = true) {
    const c = state(); choices(); goals(); projects(); reports();
    const nav = $('cityRounds'); nav.replaceChildren();
    C.rounds.forEach((r, i) => { const tab = element('span', (i + 1) + '. ' + r.title + ' · ' + (campaign.results[i] ? campaign.results[i].score + '/' + r.max : 'до ' + r.max), nav); tab.title = r.brief; tab.setAttribute('data-current', i === Math.min(2, Math.floor(c.game.day / 4))); });
    $('cityRoundBrief').textContent = lesson ? 'Учебный день: посмотри на поездки и эмоции. Баллы начнутся в отдельном испытании.' : C.current(campaign).brief;
    document.body.classList.toggle('campaign-intro', !started && !lesson?.observed);
    $('cityStart').hidden = started && !lesson || lesson?.observed && !lesson.tested; $('observeCity').hidden = !!lesson?.observed;
    $('beginCity').hidden = !!lesson && !lesson.tested;
    $('observeCity').disabled = !!pending; $('beginCity').disabled = !!pending;
    $('tryCity').disabled = playing || (pending ? false : lesson ? !lesson.observed || lesson.tested : !started || campaign.completed);
    $('tryCity').textContent = pending && !playing ? 'Продолжить день' : lesson ? 'Проверить рейсы' : campaign.completed ? 'Город завершён ✓' : 'Прожить день ' + (campaign.game.day + 1);
    $('pauseCity').disabled = !playing;
    $('restartCity').hidden = !campaign.completed || !!lesson;
    if (renderNow) render(c);
  }
  function dailyFeedback(before, after) {
    const r = after.game.reports.at(-1), previous = before.game.reports.at(-1);
    $('cityComparison').hidden = false;
    const box = $('cityEffects'); box.replaceChildren();
    const delta = (n, p) => previous ? ' (' + (n > p ? '+' : '') + (n - p) + ')' : '';
    element('span', '🚌 Не добрались: ' + r.missed + delta(r.missed, previous?.missed), box);
    element('span', '🛒 Еда: ' + r.food + '%' + delta(r.food, previous?.food), box);
    element('span', '🏥 Помощь: ' + r.treated + '/' + r.care, box);
    element('span', '💰 Доход ' + r.income + ' · расход ' + r.expenses, box);
  }
  function finishDay() {
    const task = pending; pending = null; playing = false;
    if (task.lesson) {
      lesson.c = task.after;
      if (!lesson.observed) lesson.observed = true; else lesson.tested = true;
      dailyFeedback(task.before, task.after); update();
      $('mayorStatus').textContent = lesson.tested ? 'Учебная проверка завершена. Эмоции объясняют события этого дня.' : 'Учебный день окончен. Попробуй добавить рейсы.';
      signal(lesson.tested ? 'city:tested' : 'city:observed');
      return;
    }
    campaign = task.after; dailyFeedback(task.before, campaign);
    const day = campaign.game.day, endRound = day % 4 === 0;
    if (endRound) {
      best = Math.max(best, campaign.score); const result = campaign.results.at(-1);
      $('roundOutcome').textContent = C.rounds[result.index].title + ': ' + result.score + '/' + C.rounds[result.index].max + '. ' + (result.full ? 'Все цели выполнены.' : 'Проверь цели в отчёте.');
    } else $('roundOutcome').textContent = 'День ' + day + ' окончен. Можно изменить план и улучшить город.';
    if (campaign.completed) { completedOnce = true; attempts.push(campaign.score); }
    update(); publish();
    $('mayorStatus').textContent = campaign.completed ? 'Город завершён: ' + campaign.score + '/50. Лучший результат: ' + best + '/50. Можно пройти заново.' : endRound ? 'Раунд окончен. Прочитай следующую ситуацию и подготовь город.' : 'Город на паузе. Посмотри на эмоции и последствия перед следующим днём.';
    signal('city:day', { day }); if (endRound) signal('city:round', { index: day / 4 - 1 });
  }
  function tick() {
    if (!pending || !playing) return;
    if (pending.nextIndex > pending.endIndex) { finishDay(); return; }
    render(pending.after, pending.nextIndex++);
    timer = setTimeout(tick, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 100 : 1600);
  }
  function playDay(isLesson) {
    if (playing) return;
    if (!pending) {
      const before = isLesson ? lesson.c : campaign, activePlan = isLesson ? lesson.plan : plan;
      const after = C.advance(before, activePlan);
      pending = { before, after, lesson: isLesson, nextIndex: before.game.history.length + 1, endIndex: after.game.history.length };
    }
    playing = true; update(false); $('mayorStatus').textContent = 'Смотри на поездки и эмоции. После дня будет остановка.'; signal('city:started'); tick();
  }
  function startCampaign() {
    if (pending) return;
    lesson = null; started = true; update(); $('mayorStatus').textContent = 'Выбери план. Проживи один день и проверь последствия.';
  }
  $('observeCity').onclick = () => {
    if (pending || lesson?.observed) return;
    if (!lesson) lesson = { c: C.create(), plan: GameScore.cityDefaults(), observed: false, tested: false };
    playDay(true);
  };
  $('beginCity').onclick = startCampaign;
  $('tryCity').onclick = () => {
    if (playing || (!pending && (lesson ? !lesson.observed || lesson.tested : !started || campaign.completed))) return;
    playDay(!!lesson);
  };
  function pauseDay() { if (!playing) return; clearTimeout(timer); window.pauseMayorMotion?.(); playing = false; update(false); $('mayorStatus').textContent = 'Анимация на паузе. Можно рассмотреть жителей. Нажми «Продолжить день».'; }
  $('pauseCity').onclick = pauseDay;
  window.addEventListener?.('message', e => { if (e.source === parent && e.data === 'pause') pauseDay(); });
  function restart() {
    if (pending || lesson) return;
    campaign = C.create(); plan = GameScore.cityDefaults(); started = true; selectedCitizen = 0;
    $('roundOutcome').textContent = ''; $('cityComparison').hidden = true; update(); publish(); $('mayorStatus').textContent = 'Новый город. Лучший счёт сохранён; фонд снова 200 монет.';
  }
  $('restartCity').onclick = restart; $('restartEarly').onclick = restart;
  function citizenDetails() {
    const g = viewedGame, h = viewedFrame, p = g.people[selectedCitizen], family = g.households[p.household], snapshot = h.citizens?.[selectedCitizen];
    const box = $('citizenPanel'); box.replaceChildren(); const card = element('article', '', box); card.className = 'citizen-card';
    element('h3', p.name + ' · ' + p.age + ' лет · квартал ' + (p.district + 1), card);
    element('p', 'Семья из ' + family.members.length + ' человек · ' + (g.districts[p.district].far ? 'дальний' : 'ближний') + ' квартал', card);
    element('p', 'День ' + h.day + ' · настроение ' + (snapshot?.happiness ?? 80) + '% · энергия ' + (snapshot?.energy ?? 80) + '%', card);
    const stocks = h.householdFood?.[p.household];
    if (stocks !== undefined) element('p', (h.phase === 4 ? 'Продуктов на ' : 'Запас утром: ') + stocks.toFixed(1) + ' дня', card);
    if (snapshot?.reaction) element('p', snapshot.reaction.emoji + ' «' + snapshot.reaction.text + '»', card);
    const list = element('ol', '', card); list.className = 'citizen-route';
    viewedHistory.slice(1, viewedIndex + 1).filter(frame => frame.day === h.day).forEach(frame => element('li', Epidemic.phases[frame.phase].slice(0, 5) + ' · ' + Epidemic.places.find(place => place.id === frame.loc[selectedCitizen]).name, list));
  }
  function citizens() {
    const select = $('citizenChoice'); select.replaceChildren();
    viewedGame.people.forEach((p, i) => { const option = element('option', p.name + ', ' + p.age + ' лет · квартал ' + (p.district + 1), select); option.value = i; });
    select.value = selectedCitizen; select.onchange = () => { selectedCitizen = +select.value; citizenDetails(); }; citizenDetails();
  }
  window.mayorCitizenSelect = index => {
    if (playing || !viewedGame.people[index]) return;
    selectedCitizen = index; citizens(); $('cityPeople').open = true;
    if (!document.body.classList.contains('monitor-layout')) $('citizenPanel').scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  window.mayorSelect = id => {
    const key = ['school', 'kindergarten', 'work'].includes(id) ? 'school' : ['market', 'mall'].includes(id) ? 'shops' : id === 'bus' ? 'bus' : null;
    if (key) { if (!document.body.classList.contains('monitor-layout')) $('choices-' + key).scrollIntoView({ block: 'center', behavior: 'smooth' }); $('pick-' + key + '-' + (lesson ? lesson.plan : plan)[key]).focus({ preventScroll: true }); }
    else if (id.startsWith('h')) window.mayorCitizenSelect(viewedGame.people.findIndex(p => p.home === id));
    else if (id === 'clinic') { $('cityProjects').open = true; $('build-clinic').focus({ preventScroll: true }); }
  };
  window.cityTourHooks = {
    before() {
      if (pending) return false;
      lesson = { c: C.create(), plan: GameScore.cityDefaults(), observed: false, tested: false };
      $('cityComparison').hidden = true; update(); return true;
    },
    after() { if (pending) { clearTimeout(timer); window.pauseMayorMotion?.(); pending = null; playing = false; } lesson = null; $('cityComparison').hidden = true; update(); $('mayorStatus').textContent = started ? 'Испытание сохранено. Продолжай свой город.' : 'Теперь начни испытание. Учебные дни не расходуют его бюджет.'; }
  };
  window.cityLesson = { observed: () => !!lesson?.observed, attempted: () => !!lesson?.tested };
  window.cityCampaignGame = { current: () => campaign, isPlaying: () => playing, isPending: () => !!pending };
  update(); publish(); $('mayorStatus').textContent = 'Начни с учебного дня или сразу перейди к испытанию.';
})();
