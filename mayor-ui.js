/* The normal city game: observe, make three choices, compare three experiments. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const names = { school: '🎒 Учёба и работа', bus: '🚌 Поездки', shops: '🛒 Продукты' };
  let plan = GameScore.cityDefaults(), baseline = null, latest = null, best = null, attempts = [], playing = false, timer = null, selectedCitizen = 0;
  const session = new URLSearchParams(location.search).get('session') || 'initial';
  const shell = document.createElement('section');
  shell.id = 'mayor';
  shell.innerHTML = `<div class="mayor-title"><div><span class="eyebrow">ЗАДАНИЕ 3 · ЖИВОЙ ГОРОД</span><h1>Помоги городу жить</h1><p>Меньше заражений. Хватает еды. Можно учиться и работать.</p></div><strong id="cityLocalScore" class="city-local-score">0 / 50</strong></div>
    <div class="city-start" id="cityStart"><p>Сначала посмотри, что происходит без твоих решений.</p><button id="observeCity" class="primary">▶ Посмотреть исходный город</button></div>
    <div id="mayorDashboard" class="mayor-dashboard" aria-label="Результаты плана" hidden></div>
    <div class="city-playground"><div class="city-map-area"><div id="mayorMapSlot"></div><p id="citizenStory">Нажми на жителя: узнай, куда он смог добраться.</p><div id="cityMapIssues" class="map-issues"></div></div>
      <div id="cityDecisions" class="city-decisions"><h2>Выбери свой план</h2><p id="cityDecisionHint">Сначала проверь исходный город.</p><div id="mayorPolicies"></div><button id="tryCity" class="primary" disabled>Проверить план · 1 из 3</button><p id="mayorStatus" role="status" aria-live="polite">У тебя будет три попытки. Лучший результат останется в общем счёте.</p></div></div>
    <section id="cityComparison" class="city-comparison" hidden><h2>Что изменилось?</h2><div id="cityEffects" class="city-effects"></div><p id="cityNeeds"></p><p id="cityBudget"></p><div id="cityAttempts" class="attempt-chips" aria-label="Твои попытки"></div></section>
    <details id="cityPeople"><summary>Жители</summary><label>Житель<select id="citizenChoice"></select></label><div id="citizenPanel"></div></details>
    <details class="city-rules"><summary>Правила</summary><p>Одна проверка показывает 14 игровых дней. Население, события и случайные условия одинаковы в каждой попытке. Меняй одно решение — сравнивай последствия.</p><p>До 20 баллов — за меньшее число заражений по сравнению с исходным городом. До 10 — за продукты, до 10 — за учёбу и работу, до 5 — за помощь, до 5 — за бюджет.</p><p>Если продукты доступны менее чем 80% жителей или учёба и работа — менее чем на 70%, за город можно получить не больше 25 баллов. Проценты — средние за все 14 дней.</p><p>Семьи покупают еду и расходуют запасы. Когда дети дома, часть родителей присматривает за ними. Дальним кварталам нужны автобусы. У зданий и поездок есть предел вместимости. Симптомы появляются через два дня после заражения.</p><p>Это условная модель для эксперимента. Её числа не описывают реальный город.</p></details>`;
  document.body.insertBefore(shell, document.body.firstChild);
  const city = document.querySelector('.city');
  $('mayorMapSlot').appendChild(city);
  document.body.classList.add('mayor-mode', 'short-city');
  window.mayorActive = true;
  function element(tag, text, parent) { const e = document.createElement(tag); e.textContent = text; parent.appendChild(e); return e; }
  function signal(name, data) { window.GameTour?.signal(name, data); }
  function publish() {
    $('cityLocalScore').textContent = `${best?.score || 0} / 50`;
    if (window !== parent) parent.postMessage({ kind: 'city-score', version: GameScore.VERSION, session, score: best?.score || 0, completed: attempts.length > 0 }, location.origin === 'null' ? '*' : location.origin);
  }
  function controls() {
    const box = $('mayorPolicies'); box.replaceChildren();
    for (const [key, options] of Object.entries(GameScore.cityChoices)) {
      const group = element('fieldset', '', box); group.id = 'choices-' + key;
      element('legend', names[key], group);
      for (const [value, title, hint] of options) {
        const button = element('button', title, group); button.id = `pick-${key}-${value}`; button.className = 'city-choice'; button.setAttribute('aria-pressed', plan[key] === value);
        button.disabled = !baseline || playing || attempts.length >= 3;
        button.onclick = () => { plan[key] = value; controls(); $('mayorStatus').textContent = hint; signal('city:choice', { key, value }); };
      }
      element('p', options.find(o => o[0] === plan[key])[2], group).className = 'choice-hint';
    }
    $('tryCity').disabled = !baseline || playing || attempts.length >= 3;
    $('tryCity').textContent = attempts.length >= 3 ? 'Три проверки завершены ✓' : `Проверить план · ${attempts.length + 1} из 3`;
    if ($('cityTutorial')) $('cityTutorial').disabled = playing;
  }
  function initialHistory(game) { return { day: 0, phase: 4, state: game.people.map((_, i) => i ? 'S' : 'I'), loc: game.people.map(p => p.home), events: [], S: game.people.length - 1, I: 1, R: 0, outside: 0 }; }
  function render(result, index = result.game.history.length) {
    window.renderMayor(result.game, [initialHistory(result.game), ...result.game.history], index);
    if (index === result.game.history.length) {
      const report = result.game.reports.at(-1);
      const missed = new Set(report.missedIds);
      for (const figure of $('map').querySelectorAll('[data-person]')) {
        if (!missed.has(+figure.getAttribute('data-person'))) continue;
        figure.setAttribute('aria-label', figure.getAttribute('aria-label') + ' · не смог добраться');
        const mark = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        mark.setAttribute('x', 9); mark.setAttribute('y', -18); mark.setAttribute('fill', '#ffe49a'); mark.setAttribute('font-size', 23); mark.setAttribute('font-weight', 'bold'); mark.textContent = '!'; figure.appendChild(mark);
      }
    }
  }
  function animate(result, done) {
    playing = true; controls(); $('observeCity').disabled = true;
    $('mayorStatus').textContent = 'Город проживает две недели…';
    signal('city:started');
    const frames = [0, 1, 2, 3, 4, 5, 21, 46, 47, 48, 49, 50, 66, 67, 68, 69, 70];
    let n = 0;
    function next() {
      render(result, frames[n++]);
      if (n < frames.length) timer = setTimeout(next, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 20 : 240);
      else { playing = false; controls(); done(); }
    }
    next();
  }
  function dashboard(result) {
    const box = $('mayorDashboard'); box.replaceChildren(); box.hidden = false;
    for (const [name, value, note, percent] of [['Заразились', `${result.total} из 90`, 'За две недели · меньше лучше', 100 * (90 - result.total) / 90], ['Есть продукты', `${result.food}%`, 'Нужно не меньше 80%', result.food], ['Учёба и работа', `${result.activity}%`, 'Нужно не меньше 70%', result.activity]]) {
      const item = element('div', '', box); element('span', name, item); element('strong', value, item);
      const bar = element('progress', '', item); bar.max = 100; bar.value = percent; bar.setAttribute('aria-label', name); element('p', note, item);
    }
  }
  function effects(result) {
    $('cityComparison').hidden = false; const box = $('cityEffects'); box.replaceChildren();
    for (const [name, before, after, unit, lower] of [['Заражения', baseline.total, result.total, 'жителей', true], ['Продукты', baseline.food, result.food, '%', false], ['Учёба и работа', baseline.activity, result.activity, '%', false], ['Не смогли добраться', baseline.missed, result.missed, 'в день', true]]) {
      const item = element('div', '', box); element('span', name, item); element('strong', `${before} → ${after} ${unit}`, item);
      const delta = after - before, improved = (delta < 0) === lower; element('small', !delta ? 'Без изменения' : (improved ? 'Лучше' : 'Хуже') + ` · ${delta > 0 ? '+' : ''}${delta}`, item).className = !delta ? '' : improved ? 'improved' : 'worsened';
    }
    const needs = result.food < 80 ? 'Семьям не хватает еды. Попробуй открыть оба магазина.' : result.activity < 70 ? result.plan.school === 'remote' ? 'Не все могут учиться и работать дома. Попробуй смены.' : 'Многие не добираются до учёбы и работы. Проверь число рейсов.' : 'Еды, учёбы и работы хватает. Теперь сравни число заражений.';
    $('cityNeeds').textContent = needs + (result.basicNeedsMet ? '' : ' Баллы за город ограничены до 25.');
    $('cityBudget').textContent = `Бюджет: ${result.cash} монет. Помощь оказана: ${result.treated} из ${result.care} обращений.`;
    const issues = $('cityMapIssues'); issues.replaceChildren();
    element('span', `🚌 Не добрались: ${result.missed} жителей в день`, issues);
    element('span', `🛒 Очередь: ${result.queue} семей в день`, issues);
    element('span', '! у жителя — пропущенная поездка в последний день', issues);
    const chips = $('cityAttempts'); chips.replaceChildren();
    attempts.forEach((r, i) => element('span', `Попытка ${i + 1}: ${r.score} / 50${r === best ? ' ★' : ''}`, chips));
    const r = result.game.reports.at(-1), missed = r.missedIds[0];
    $('citizenStory').textContent = missed !== undefined ? `${result.game.people[missed].name}: «Я не смог добраться. Проверь автобусы».` : result.food < 80 ? 'Жители: «В магазине очередь, а запасы дома заканчиваются».': 'Жители: «Сравни поездки, продукты и занятия — всё связано». ';
    citizens(result);
  }
  function citizens(result) {
    const select = $('citizenChoice'); select.replaceChildren();
    result.game.people.forEach((p, i) => { const opt = element('option', `${p.name}, ${p.age} лет · квартал ${p.district + 1}`, select); opt.value = i; });
    select.value = selectedCitizen; select.onchange = () => { selectedCitizen = +select.value; citizenDetails(result); }; citizenDetails(result);
  }
  function citizenDetails(result) {
    const g = result.game, p = g.people[selectedCitizen], family = g.households[p.household], box = $('citizenPanel'); box.replaceChildren();
    const card = element('article', '', box); card.className = 'citizen-card'; element('h3', `${p.name} · ${p.age} лет`, card);
    element('p', `Семья из ${family.members.length} человек · ${g.districts[p.district].far ? 'дальний' : 'ближний'} квартал`, card);
    element('p', `Продуктов на ${(family.food / family.members.length).toFixed(1)} дня · энергия ${p.energy}%`, card);
    const list = element('ol', '', card); list.className = 'citizen-route';
    g.history.slice(-5).forEach((h, i) => element('li', `${Epidemic.phases[i].slice(0, 5)} · ${Epidemic.places.find(place => place.id === h.loc[selectedCitizen]).name}`, list));
    if (g.reports.at(-1).missedIds.includes(selectedCitizen)) element('p', 'Не хватило места в автобусе хотя бы для одной поездки в последний день.', card);
  }
  $('observeCity').onclick = () => {
    if (playing || baseline) return;
    const result = GameScore.cityRun(GameScore.cityDefaults());
    animate(result, () => { baseline = latest = result; $('cityStart').hidden = true; dashboard(result); effects(result); controls(); $('cityDecisionHint').textContent = 'Меняй одно решение, чтобы заметить его эффект.'; $('mayorStatus').textContent = `В исходном городе ${result.missed} жителей в день не добрались. Начни с автобусов.`; signal('city:observed'); });
  };
  $('tryCity').onclick = () => {
    if (!baseline || playing || attempts.length >= 3) return;
    const result = GameScore.cityRun(plan);
    animate(result, () => { latest = result; attempts.push(result); if (!best || result.score > best.score) best = result; dashboard(result); effects(result); publish(); controls(); $('mayorStatus').textContent = attempts.length === 3 ? `Готово! Лучший результат города — ${best.score} / 50. Покажи общий счёт ведущему.` : `Проверка ${attempts.length} завершена. Измени одно решение и сравни снова.`; signal('city:tested'); });
  };
  window.mayorSelect = id => {
    const key = ['school', 'kindergarten', 'work'].includes(id) ? 'school' : ['market', 'mall'].includes(id) ? 'shops' : id === 'bus' ? 'bus' : null;
    if (key) { $('choices-' + key).scrollIntoView({ block: 'center', behavior: 'smooth' }); $('pick-' + key + '-' + plan[key]).focus({ preventScroll: true }); }
    else if (id.startsWith('h') && latest) window.mayorCitizenSelect(latest.game.people.findIndex(p => p.home === id));
    else $('mayorStatus').textContent = 'Этот объект работает автоматически. В этом задании ты управляешь занятиями, поездками и магазинами.';
  };
  window.mayorCitizenSelect = index => { if (!latest || playing || !latest.game.people[index]) return; selectedCitizen = index; $('citizenChoice').value = index; $('cityPeople').open = true; citizenDetails(latest); $('citizenPanel').scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  window.cityTourHooks = { before: () => !playing, after() {} };
  window.cityLesson = { observed: () => !!baseline, attempted: () => attempts.length > 0 };
  const preview = GameScore.cityRun(GameScore.cityDefaults()); render(preview, 0); controls(); publish();
})();
