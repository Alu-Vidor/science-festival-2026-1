/* Self-paced city campaign; simulation time advances only through a player's action. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id), C = CityCampaign;
  const names = { school: '🎒 Занятия и работа', bus: '🚌 Поездки', shops: '🛒 Продукты' };
  let campaign = C.create(), plan = GameScore.cityDefaults(), started = false, lesson = null;
  let best = 0, completedOnce = false, attempts = [], playing = false, pending = null, timer = null;
  let actions = [], roundStarts = [], restoring = true, availableExperiments = 0;
  let selectedCitizen = 0, viewedGame, viewedFrame, viewedHistory, viewedIndex;
  const session = new URLSearchParams(location.search).get('session') || window.FestivalSession?.id || 'initial';
  const shell = document.createElement('section'); shell.id = 'mayor';
  shell.innerHTML = `<div class="mayor-title"><div><span class="eyebrow">ЗАДАНИЕ 3 · ЖИВОЙ ГОРОД</span><h1>Помоги городу жить</h1><p id="cityCalendar">Три раунда · 12 игровых дней</p></div><div class="city-scoreboard"><span>Это прохождение<strong id="cityLocalScore" class="city-local-score">0 / 50</strong></span><span>Лучший результат<strong id="cityBestScore">0 / 50</strong></span></div></div>
    <nav id="cityRounds" class="city-rounds" aria-label="Раунды города"></nav>
    <p id="cityRoundBrief" class="city-round-brief"></p>
    <div class="city-playground"><div class="city-map-area"><div id="mayorMapSlot"></div><p id="citizenStory">Эмоции появятся над жителями. Нажми на фигурку, чтобы узнать причину.</p>
      <div id="cityComparison" class="city-comparison" hidden><div id="cityEffects"></div></div><p id="mayorStatus" role="status" aria-live="polite"></p></div>
      <div id="cityDecisions" class="city-decisions">
        <div class="city-start" id="cityStart"><p>Учебный день бесплатный. Испытание начнётся с чистого города.</p><button id="observeCity" class="primary">▶ Учебный день</button><button id="beginCity">Начать испытание →</button></div>
        <h2 id="cityGoalTitle">Цели на четыре дня</h2><div id="cityGoalGrid" class="city-goals"></div><p id="cityNeeds" class="city-needs"></p>
        <div id="mayorPolicies"></div><div class="city-time-controls"><button id="tryCity" class="primary" disabled>Прожить день 1</button><button id="pauseCity" disabled>Пауза</button></div>
        <p id="roundOutcome" class="round-outcome"></p>
        <article id="roundLearning" class="round-learning" hidden><h3 id="roundLearningTitle"></h3><p id="roundWhy"></p><p>Какие последствия связаны с твоим планом? Сравни другое решение на тех же начальных условиях.</p></article>
        <details id="cityExperiment" hidden><summary>Сравнить другой план</summary><p>Выбери завершённый раунд и измени план. Опыт начинается с того же города. Изменения улучшений повторяются как в твоём раунде. Выбранный план действует все четыре дня.</p><label>Раунд<select id="experimentRound"></select></label><div id="experimentChoices"></div><button id="testAlternative" class="primary">Проверить другой план</button><div id="alternativeResult" role="status" aria-live="polite"></div><p>Это отдельный опыт. Основной город и баллы сохраняются.</p></details><button id="restartCity" hidden>Новое прохождение</button>
      </div></div>
    <details id="cityProjects"><summary id="projectSummary">Улучшения · 200</summary><p>Распредели 200 монет между улучшениями. Между днями можно освободить вложенные монеты и выбрать другое улучшение. Оно работает, пока в него вложены монеты. У больницы сначала одно место помощи; в третьем раунде обращений станет больше. Доходы не пополняют эти 200 монет.</p><div id="projectChoices"></div><p id="cityBudget"></p></details>
    <details id="cityConditions"><summary id="cityConditionSummary">Условия успеха</summary><p>Главная задача меняется в каждом раунде. Для максимума выполни все условия за четыре дня.</p><div id="cityConditionGrid" class="city-goals"></div></details>
    <details id="cityPlaceInfo"><summary>Место в городе</summary><div id="cityPlacePanel"></div></details>
    <details id="cityPeople"><summary>Жители</summary><label>Житель<select id="citizenChoice"></select></label><div id="citizenPanel"></div></details>
    <details id="cityReports"><summary>Раунды</summary><div id="roundReports"></div><div id="cityAttempts" class="attempt-chips"></div><button id="restartEarly">Начать заново</button></details>
    <details class="city-rules"><summary>Правила</summary><p>Три раунда по четыре дня дают до 10, 15 и 25 баллов. Цели показаны до начала раунда. Еда, занятия и настроение — средние за четыре дня; помощь — доля обслуженных обращений; заражения и расходы — сумма. Максимум доступен только при выполнении всех целей раунда.</p><p>Один клик проживает один день. После него город ждёт твоего решения. Можно поставить анимацию на паузу, рассмотреть жителей и продолжить. Изменения плана действуют со следующего дня.</p><p>Фонд улучшений — 200 монет. Можно вернуть всю стоимость улучшения и перераспределить её между днями. Полученные раньше результаты и оплаченные расходы не меняются. Новый набор улучшений работает со следующего дня. Запасы, усталость и болезни переходят между раундами.</p><p>В последнем раунде до четырёх жителей возвращаются после поездки, где заразились накануне. Они учитываются отдельно от заражений внутри города. Симптомы в модели появляются через два дня после заражения.</p><p>🙂 удачная поездка, покупка, отдых или помощь; 😠 пропущенная поездка; 😟 очередь, нехватка еды или помощи; 😴 усталость. Цвет одежды отдельно показывает видимые симптомы.</p><p>Попытки не ограничены. Лучший счёт сохраняется. Время и скорость анимации не влияют на баллы. Это учебная модель вымышленного города.</p></details>`;
  document.body.insertBefore(shell, document.body.firstChild);
  $('mayorMapSlot').appendChild(document.querySelector('.city'));
  document.body.classList.add('mayor-mode', 'short-city', 'campaign-city'); window.mayorActive = true;
  function element(tag, text, parent) { const e = document.createElement(tag); e.textContent = text; parent.appendChild(e); return e; }
  function signal(name, detail) { window.GameTour?.signal(name, detail); }
  function persist() {
    if (!restoring) window.FestivalSession?.save('city',{actions,plan,started,best,completedOnce,attempts,
      pending:pending&&!pending.lesson?{plan:pending.plan,index:pending.nextIndex-1}:null},session);
  }
  function publish() {
    persist();
    $('cityLocalScore').textContent = campaign.score + ' / 50';
    $('cityBestScore').textContent = best + ' / 50';
    if (window !== parent) parent.postMessage({ kind: 'city-score', version: GameScore.VERSION, session, score: best, completed: completedOnce }, location.origin === 'null' ? '*' : location.origin);
  }
  function initialHistory(game) {
    return { day: 0, phase: 4, state: game.people.map((_, i) => i ? 'S' : 'I'), loc: game.people.map(p => p.home), events: [], S: game.people.length - 1, I: 1, R: 0, outside: 0,
      citizens: game.people.map(() => ({ energy: 80, happiness: 80, food: 100, reaction: null })), householdFood: game.households.map(() => 1) };
  }
  function render(c, index = c.game.history.length, animate = true) {
    viewedGame = c.game; viewedHistory = [initialHistory(c.game), ...c.game.history]; viewedIndex = index; viewedFrame = viewedHistory[index];
    window.renderMayor(c.game, viewedHistory, index, animate);
    citizens();
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
        button.onclick = () => { activePlan[key] = value; choices(); persist(); $('mayorStatus').textContent = hint + ' Изменение действует со следующего дня.'; signal('city:choice', { key, value }); };
      }
    }
  }
  const goalFields = [
    ['cases', 'Новые заражения', '≤', ''], ['food', 'Еда для жителей', '≥', '%'], ['activity', 'Учёба и работа', '≥', '%'],
    ['care', 'Помощь', '≥', '%'], ['comfort', 'Настроение', '≥', '%'], ['expense', 'Расходы', '≤', '']
  ];
  function goals() {
    const c = state(), index = Math.min(2, Math.floor(c.game.day / 4)), goal = C.rounds[index], stats = C.measure(c, index);
    $('cityGoalTitle').textContent = lesson ? 'Главная задача первого раунда' : goal.task + ' · день ' + (stats?.days || 0) + ' из 4';
    const primary = $('cityGoalGrid'), conditions = $('cityConditionGrid'); primary.replaceChildren(); conditions.replaceChildren();
    let metCount = 0, total = 0;
    function card(box, key, name, sign, unit) {
      const item = element('div', '', box); item.className = 'city-goal';
      const target = goal[key];
      const label = element('span', '', item); element('b', name, label);
      const description = (sign === '≤' ? 'Не больше ' : 'Не меньше ') + target + unit + (key === 'expense' || key === 'cases' ? ' за раунд' : key === 'care' ? ' обращений' : ' в среднем');
      element('small', description, label);
      const waiting = key === 'care' && stats && !stats.careRequests;
      const met = stats && !waiting ? (sign === '≤' ? stats[key] <= target : stats[key] >= target) : null;
      const actual = waiting ? 'Пока нет обращений' : stats ? (['food','activity','comfort','care'].includes(key) ? stats[key].toFixed(1) : stats[key]) + unit : '—';
      if(waiting)item.classList.add('awaiting-care');
      element('strong', actual + (met === null ? '' : met ? ' ✓' : ' !'), item);
      item.setAttribute('aria-label', name + '. ' + description + '. Сейчас: ' + actual + (met === null ? '' : met ? '. Условие пока выполнено.' : '. Нужно улучшить.'));
      if (met !== null) item.setAttribute('data-met', met);
      return met;
    }
    goalFields.forEach(([key, name, sign, unit]) => {
      if (key === 'care' && !goal.care) return;
      total++; if (card(conditions, key, name, sign, unit)) metCount++;
      if (key === goal.focus) card(primary, key, name, sign, unit);
    });
    $('cityConditionSummary').textContent = 'Условия успеха · ' + (stats ? metCount + '/' + total : total);
    $('cityNeeds').textContent = 'До ' + goal.max + ' баллов. Максимум — за все условия после четырёх дней. Открой «Условия успеха», чтобы проверить город.';
  }

  function projects() {
    $('projectSummary').textContent = 'Фонд · ' + campaign.funds;
    const box = $('projectChoices'); box.replaceChildren();
    for (const id of C.projects) {
      const project = Mayor.upgrades[id], active = campaign.projects.includes(id), card = element('article', '', box);
      element('h3', project.title, card);
      element('p', project.effect + '. Содержание: ' + project.upkeep + ' монет в день.', card);
      const button = element('button', active ? 'Освободить ' + project.cost + ' монет ↩' : 'Вложить ' + project.cost + ' монет', card);
      button.id = active ? 'refund-' + id : 'build-' + id;
      button.disabled = !!lesson || !started || !!pending || campaign.completed || !active && campaign.funds < project.cost;
      if (active) card.setAttribute('data-funded', 'true');
      button.onclick = () => {
        campaign = active ? C.refund(campaign, id) : C.invest(campaign, id); actions.push({kind:active?'refund':'invest',id}); update(false);
        $('mayorStatus').textContent = active ? project.title + ': монеты освобождены. Улучшение не работает со следующего дня; прошлые результаты сохранены.' : project.title + ': включено со следующего дня. Свободно ' + campaign.funds + ' монет.';
      };
    }
    $('cityBudget').textContent = 'Фонд улучшений: свободно ' + campaign.funds + ' из 200 монет. Расходы в целях — работа города за четыре дня, включая содержание улучшений. Доход и городская касса (' + campaign.game.cash + ') не пополняют фонд. Содержание за прошедшие дни не возвращается.';
  }
  function reports() {
    const box = $('roundReports'); box.replaceChildren();
    C.rounds.forEach((goal, index) => {
      const r = campaign.results[index], card = element('article', '', box);
      element('h3', goal.title + ' · ' + (r ? r.score + ' / ' + goal.max : 'до ' + goal.max), card);
      element('p', goal.brief, card);
      for (const [key, name, sign, unit] of goalFields) {
        const target = key === 'care' && !goal.care ? null : goal[key];
        if (r) element('p', name + ': ' + (key === 'care' && !r.careRequests ? 'нет обращений' : r[key].toFixed(key === 'cases' || key === 'expense' ? 0 : 1) + unit) + (target === null ? '' : ' · цель ' + sign + ' ' + target + unit), card);
        else if(target !== null) element('p', name + ': цель ' + sign + ' ' + target + unit, card);
      }
    });
    const last = campaign.results.at(-1);
    $('roundLearning').hidden = !last || !!lesson;
    $('cityExperiment').hidden = !last || !!lesson;
    if(last){$('roundLearningTitle').textContent='Что произошло · '+C.rounds[last.index].title;$('roundWhy').textContent=C.insights(campaign,last.index).join(' ');}
    const select=$('experimentRound'),chosen=+select.value;select.replaceChildren();
    campaign.results.forEach((r,i)=>{const option=element('option',C.rounds[i].title,select);option.value=i;});
    select.value=availableExperiments===campaign.results.length&&campaign.results[chosen]?chosen:Math.max(0,campaign.results.length-1);
    if(availableExperiments!==campaign.results.length){availableExperiments=campaign.results.length;experimentPlan();}
    const chips = $('cityAttempts'); chips.replaceChildren(); attempts.forEach((score, i) => element('span', 'Город ' + (i + 1) + ': ' + score + '/50', chips));
    $('restartEarly').disabled = !!pending || !started || !!lesson;
  }
  function update(renderNow = true) {
    const c = state(); choices(); goals(); projects(); reports();
    const nav = $('cityRounds'); nav.replaceChildren();
    C.rounds.forEach((r, i) => { const tab = element('span', (i + 1) + '. ' + r.title + ' · ' + (campaign.results[i] ? campaign.results[i].score + '/' + r.max : 'до ' + r.max), nav); tab.title = r.brief; tab.setAttribute('data-current', i === Math.min(2, Math.floor(c.game.day / 4))); });
    $('cityRoundBrief').textContent = lesson ? 'Учебный день: посмотри на поездки и эмоции. Баллы начнутся в отдельном испытании.' : C.current(campaign).brief;
    document.body.classList.toggle('campaign-intro', !started && !lesson?.observed);
    document.body.classList.toggle('campaign-day-paused', !!pending && !playing);
    document.body.classList.toggle('campaign-completed', campaign.completed && !lesson);
    document.body.classList.toggle('campaign-lesson-finished', !!lesson?.tested);
    $('cityStart').hidden = started && !lesson || lesson?.observed && !lesson.tested; $('observeCity').hidden = !!lesson?.observed;
    $('beginCity').hidden = !!lesson && !lesson.tested;
    $('observeCity').disabled = !!pending; $('beginCity').disabled = !!pending;
    $('tryCity').disabled = playing || (pending ? false : lesson ? !lesson.observed || lesson.tested : !started || campaign.completed);
    $('tryCity').textContent = pending && !playing ? 'Продолжить день' : lesson ? 'Проверить рейсы' : campaign.completed ? 'Город завершён ✓' : 'Прожить день ' + (campaign.game.day + 1);
    $('pauseCity').disabled = !playing;
    $('restartCity').hidden = !campaign.completed || !!lesson;
    if (renderNow) render(c);
    persist();
  }
  function dailyFeedback(before, after) {
    const r = after.game.reports.at(-1), previous = before.game.reports.at(-1);
    $('cityComparison').hidden = false;
    const box = $('cityEffects'); box.replaceChildren();
    const delta = (n, p) => previous ? ' (' + (n > p ? '+' : '') + (n - p) + ')' : '';
    element('span', '🚌 Не добрались: ' + r.missed + delta(r.missed, previous?.missed), box);
    element('span', '🛒 Еда: ' + r.food + '%' + delta(r.food, previous?.food), box);
    element('span', '🏥 Помощь: ' + r.treated + '/' + r.care, box);
    element('span', '💰 За день: доход ' + r.income + ' · расход ' + r.expenses, box);
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
    if(task.before.game.day%4===0)roundStarts[task.before.game.day/4]=task.before;
    actions.push({kind:'day',plan:task.plan});
    campaign = task.after; dailyFeedback(task.before, campaign);
    const day = campaign.game.day, endRound = day % 4 === 0;
    if (endRound) {
      best = Math.max(best, campaign.score); const result = campaign.results.at(-1);
      $('roundOutcome').textContent = C.rounds[result.index].title + ': ' + result.score + '/' + C.rounds[result.index].max + '. ' + (result.full ? 'Все цели выполнены.' : 'Не выполнено: ' + goalFields.filter((field, i) => !result.met[i]).map(field => field[1].toLowerCase()).join(', ') + '. Подробности — в «Раундах».');
    } else $('roundOutcome').textContent = 'День ' + day + ' окончен. Можно изменить план и улучшить город.';
    if (campaign.completed) { completedOnce = true; attempts.push(campaign.score); }
    update(); publish();
    $('mayorStatus').textContent = campaign.completed ? 'Город завершён: ' + campaign.score + '/50. Лучший результат: ' + best + '/50. Можно пройти заново.' : endRound ? 'Раунд окончен. Прочитай следующую ситуацию и подготовь город.' : 'Город на паузе. Посмотри на эмоции и последствия перед следующим днём.';
    signal('city:day', { day }); if (endRound) signal('city:round', { index: day / 4 - 1 });
  }
  function tick() {
    if (!pending || !playing) return;
    if (pending.nextIndex > pending.endIndex) { finishDay(); return; }
    render(pending.after, pending.nextIndex++); persist();
    timer = setTimeout(tick, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 100 : 1600);
  }
  function playDay(isLesson) {
    if (playing) return;
    if (!pending) {
      const before = isLesson ? lesson.c : campaign, activePlan = isLesson ? lesson.plan : plan;
      const after = C.advance(before, activePlan);
      pending = { before, after, plan:{...activePlan}, lesson: isLesson, nextIndex: before.game.history.length + 1, endIndex: after.game.history.length };
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
    campaign = C.create(); actions = []; roundStarts = []; plan = GameScore.cityDefaults(); started = true; selectedCitizen = 0;
    $('roundOutcome').textContent = ''; $('alternativeResult').replaceChildren(); $('cityComparison').hidden = true; update(); publish(); $('mayorStatus').textContent = 'Новый город. Лучший счёт сохранён; фонд снова 200 монет.';
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
    if (!viewedGame.people[index]) return;
    pauseDay();
    selectedCitizen = index; citizens(); $('cityPeople').open = true;
    if (!document.body.classList.contains('monitor-layout')) $('citizenPanel').scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  $('cityPeople').addEventListener('toggle', () => { if ($('cityPeople').open) { pauseDay(); citizens(); } });
  window.mayorPlaceHint = id => ['park', 'gym'].includes(id) ? 'открыть сведения' : id.startsWith('h') ? 'посмотреть жителей' : 'открыть решения';
  window.mayorSelect = id => {
    const key = ['school', 'kindergarten', 'work'].includes(id) ? 'school' : ['market', 'mall'].includes(id) ? 'shops' : id === 'bus' ? 'bus' : null;
    if (key) { if (!document.body.classList.contains('monitor-layout')) $('choices-' + key).scrollIntoView({ block: 'center', behavior: 'smooth' }); $('pick-' + key + '-' + (lesson ? lesson.plan : plan)[key]).focus({ preventScroll: true }); }
    else if (id.startsWith('h')) window.mayorCitizenSelect(viewedGame.people.findIndex(p => p.home === id));
    else if (['park', 'gym'].includes(id)) {
      pauseDay();
      const box = $('cityPlacePanel'); box.replaceChildren();
      element('h3', id === 'park' ? 'Парк · отдых на воздухе' : 'Спортцентр · отдых в помещении', box);
      element('p', 'День ' + viewedFrame.day + ' · ' + Epidemic.phases[viewedFrame.phase] + '. Сейчас здесь ' + viewedFrame.loc.filter(place => place === id).length + ' жителей.', box);
      element('p', id === 'park' ? 'Вечером здесь отдыхают до 60 жителей и восстанавливают энергию. На холоде часть жителей выбирает спортцентр. На воздухе вероятность заражения ниже.' : 'Вечером здесь отдыхают до 24 жителей и восстанавливают энергию. На холоде спрос растёт, поэтому мест может не хватить.', box);
      element('p', 'Отдых влияет на энергию и настроение. Это место работает самостоятельно; отдельного переключателя нет.', box);
      $('cityPlaceInfo').open = true;
    }
    else if (id === 'clinic') { $('cityProjects').open = true; ($('build-clinic') || $('refund-clinic'))?.focus({ preventScroll: true }); }
  };
  for(const [key,options] of Object.entries(C.choices)){
    const label=element('label',names[key],$('experimentChoices')),select=element('select','',label);select.id='experiment-'+key;
    options.forEach(([value,title,hint])=>{const option=element('option',title,select);option.value=value;option.title=hint;});
    select.value=plan[key];
  }
  function experimentPlan(){
    const index=+$('experimentRound').value,original=actions.filter(action=>action.kind==='day')[index*4]?.plan||plan;
    for(const key of Object.keys(C.choices))$('experiment-'+key).value=original[key];
    $('alternativeResult').replaceChildren();
  }
  $('experimentRound').onchange=experimentPlan;
  $('testAlternative').onclick=()=>{
    const index=+$('experimentRound').value,base=roundStarts[index],actual=campaign.results[index];if(!base||!actual)return;
    const alternativePlan=Object.fromEntries(Object.keys(C.choices).map(key=>[key,$('experiment-'+key).value]));
    const alternative=C.compare(base,alternativePlan,actions),box=$('alternativeResult');box.replaceChildren();
    element('h3','Результат опыта · '+C.rounds[index].title,box);
    const table=element('table','',box),header=element('tr','',table);
    for(const title of ['Показатель','Твой раунд','Другой план'])element('th',title,header);
    const rows=[['Баллы','score',''],['Занятия','activity','%'],['Еда','food','%'],['Заражения','cases',''],['Настроение','comfort','%'],['Расходы','expense','']];
    if(C.rounds[index].care)rows.splice(3,0,['Помощь','care','%']);
    rows.forEach(([name,key,unit])=>{const row=element('tr','',table);element('th',name,row);for(const result of [actual,alternative])element('td',key==='care'&&!result.careRequests?'Нет обращений':(unit?result[key].toFixed(1):result[key])+unit,row);});
    element('p',alternative.full?'Другой план выполнил все условия.':'В другом плане ещё есть невыполненные условия.',box);
  };
  function recoverCity(){
    const saved=window.FestivalSession?.read('city');if(!saved)return;
    try{
      if(!Object.entries(C.choices).every(([key,values])=>values.some(([v])=>v===saved.plan?.[key]))||!Number.isInteger(saved.best)||saved.best<0||saved.best>50||!Array.isArray(saved.attempts)||saved.attempts.some(s=>!Number.isInteger(s)||s<0||s>50))return;
      const restored=C.replay(saved.actions);
      let next=null;
      if(saved.pending){
        if(!Object.entries(C.choices).every(([key,values])=>values.some(([v])=>v===saved.pending.plan?.[key])))return;
        const before=restored.campaign,after=C.advance(before,saved.pending.plan),index=saved.pending.index;
        if(!Number.isInteger(index)||index<=before.game.history.length||index>after.game.history.length)return;
        next={before,after,plan:saved.pending.plan,lesson:false,nextIndex:index+1,endIndex:after.game.history.length};
      }
      campaign=restored.campaign;roundStarts=restored.starts;actions=saved.actions;plan=saved.plan;started=!!saved.started;best=Math.max(saved.best,campaign.score);completedOnce=!!saved.completedOnce;attempts=saved.attempts;pending=next;
      window.cityRestored=started||completedOnce;
    }catch{}
  }
  recoverCity();restoring=false;
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
  update();
  if(pending)render(pending.after,pending.nextIndex-1,false);
  publish(); $('mayorStatus').textContent = window.cityRestored ? 'Прогресс восстановлен. '+(pending?'День на паузе — можно продолжить.':'Продолжай город или сравни другой план.') : 'Начни с учебного дня или сразу перейди к испытанию.';
})();
