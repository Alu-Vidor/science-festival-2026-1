/* Observe a bottleneck, test a hypothesis, then commit four days from the same city. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id),C=CityCampaign;
  const names={school:'🎒 Занятия и работа',bus:'🚌 Куда направить рейсы',shops:'🛒 Работа магазинов'};
  const trialCache=new WeakMap();
  const hypotheses={transport:'Не хватает мест в автобусе',capacity:'Не хватает мест в службе',expense:'План слишком дорогой'};
  let campaign=C.create(),plan=GameScore.cityDefaults(),started=false,lesson=null,preview=null;
  let best=0,completedOnce=false,attempts=[],playing=false,pending=null,timer=null,actions=[],trials=[],restoring=true;
  let selectedCitizen=0,viewedGame,viewedFrame,viewedHistory,viewedIndex,inspected='activity';
  const session=new URLSearchParams(location.search).get('session')||window.FestivalSession?.id||'initial';
  const shell=document.createElement('section');shell.id='mayor';
  shell.innerHTML=`<div class="mayor-title"><div><span class="eyebrow">ЗАДАНИЕ 3 · ЖИВОЙ ГОРОД</span><h1>Разберись, где город не справляется</h1><p id="cityCalendar">Три раунда · опыт → корректировка → зачёт</p></div><div class="city-scoreboard"><span>Твоя партия<strong id="cityStars">★ 0 / 9</strong></span><span>Баллы<strong id="cityLocalScore">0 / 50</strong></span><span>Лучшее<strong id="cityBestScore">0 / 50</strong></span></div></div>
  <nav id="cityRounds" class="city-rounds" aria-label="Раунды города"></nav><p id="cityRoundBrief" class="city-round-brief"></p><p id="cityLearningGoal" class="city-learning-goal"></p>
  <div class="city-playground"><div class="city-map-area"><div id="mayorMapSlot"></div><p id="citizenStory"></p>
  <div id="flowButtons" class="flow-buttons" aria-label="Найти причину"><button id="inspect-activity">🎒 Поездки на занятия</button><button id="inspect-food">🛒 Путь за продуктами</button><button id="inspect-care">🏥 Путь за помощью</button></div>
  <div id="cityComparison" class="city-comparison" hidden><div id="cityEffects"></div></div><p id="mayorStatus" role="status" aria-live="polite"></p></div>
  <div id="cityDecisions" class="city-decisions"><div id="cityStart" class="city-start"><p>Посмотри на жителей и проверь одну догадку. Учебный день не меняет зачётный город.</p><button id="observeCity" class="primary">▶ Учебный день</button><button id="beginCity">Начать игру →</button></div>
  <h2 id="cityGoalTitle"></h2><div id="cityGoalGrid" class="city-goals"></div><p id="cityNeeds" class="city-needs"></p>
  <div id="mayorPolicies"></div><p id="allocationSummary" class="allocation-summary"></p><p id="planExpense"></p>
  <div id="trialControls"><label for="cityHypothesis">Моя догадка</label><select id="cityHypothesis"><option value="transport">Не хватает мест в автобусе</option><option value="capacity">Не хватает мест в службе</option><option value="expense">План слишком дорогой</option></select><button id="trialCity">Проверить на копии города</button><p id="trialSummary" role="status"></p></div>
  <div class="city-time-controls"><button id="tryCity" class="primary" disabled>Зачёт · 4 дня</button><button id="pauseCity" disabled>Пауза</button></div><p id="roundOutcome" class="round-outcome"></p>
  <article id="roundLearning" class="round-learning" hidden><h3 id="roundLearningTitle"></h3><p id="roundWhy"></p></article><details id="cityExperiment"><summary>Журнал опытов</summary><div id="trialHistory"></div></details><button id="restartCity" hidden>Новая партия</button></div></div>
  <details id="cityProjects"><summary id="projectSummary">Фонд · 200</summary><p>Всего 200 монет. Улучшения можно перераспределять между раундами. Возврат выключает улучшение и возвращает вложение; содержание уже прожитых дней не возвращается. Доходы не пополняют фонд.</p><div id="projectChoices"></div><p id="cityBudget"></p></details>
  <details id="cityConditions"><summary id="cityConditionSummary">Как получить звёзды</summary><p>Условия проверяются по порядку: ★ за главную задачу; ★★ если справились и остальные указанные службы; ★★★ если выполнено всё и соблюдён бюджет. При провале главной задачи — 0. Еда и занятия усредняются за 4 дня, помощь считается по обращениям, расходы суммируются.</p><div id="cityConditionGrid" class="city-goals"></div></details>
  <details id="cityFlow"><summary>Где возникла проблема</summary><div id="flowPanel"></div></details>
  <details id="cityPlaceInfo"><summary>Место в городе</summary><div id="cityPlacePanel"></div></details><details id="cityPeople"><summary>Жители</summary><label>Житель<select id="citizenChoice"></select></label><div id="citizenPanel"></div></details>
  <details id="cityReports"><summary>Все раунды</summary><div id="roundReports"></div><div id="cityAttempts" class="attempt-chips"></div><button id="restartEarly">Начать заново</button></details>
  <details class="city-rules"><summary>Правила</summary><p>Ты управляешь службами города. Каждый житель — отдельный агент со своим домом, семьёй, запасами и потребностями. Здесь ты исследуешь агентную симуляцию; модель не обучается по твоим нажатиям.</p><p>Перед каждым раундом доступны 2 опыта. Опыт проживает 4 дня на копии текущего города. Он не тратит настоящий бюджет, не добавляет звёзды и не меняет жителей. Затем можно изменить решения. Зачёт начинает те же 4 дня с того же состояния; выбранный план и улучшения фиксируются до конца раунда.</p><p>9 звёзд дают 50 баллов площадки. Нет баллов за догадки, число опытов и скорость. Сохраняется лучшая целая партия. Главную задачу, остальные службы и бюджет видно до старта. Между раундами сохраняются запасы, деньги, усталость и болезни.</p><p>Автобусы общие: 72 места распределяются между утром и поездками к службам, ещё 40 — на отдых. Две смены раздвигают утренний поток и добавляют 25% утренних мест; дробное место округляется вниз. Новые автобусы добавляют 20 мест на каждом этапе. Меняется распределение мест, а не количество жителей.</p><p>В третьем раунде до четырёх жителей возвращаются заражёнными после поездки. Симптомы появятся позже: наблюдай все 4 дня. Цвет одежды показывает симптомы, эмоции — фактические проблемы или удачи жителя. Это вымышленный город.</p><p>Перезагрузка и переход к роботу ставят анимацию на паузу. Зачёт продолжается с показанного этапа; новая попытка не выдаётся. Начать новую партию можно после завершения текущего прогона.</p></details>`;
  document.body.insertBefore(shell,document.body.firstChild);$('mayorMapSlot').appendChild(document.querySelector('.city'));
  $('cityReports').appendChild($('roundLearning'));$('cityConditions').appendChild($('cityLearningGoal'));
  document.body.classList.add('mayor-mode','short-city','campaign-city');window.mayorActive=true;
  function element(tag,text,parent){const e=document.createElement(tag);e.textContent=text;parent.appendChild(e);return e;}
  function signal(name,detail){window.GameTour?.signal(name,detail);}
  const roundIndex=()=>Math.min(2,Math.floor(campaign.game.day/4));
  const currentScore=()=>C.cityScore(campaign);
  function persist(){if(!restoring)window.FestivalSession?.save('city',{rules:C.VERSION,actions,plan,started,best,completedOnce,attempts,trials,hypothesis:$('cityHypothesis').value,
    previewId:preview?.id??null,pending:pending&&pending.kind!=='lesson'?{kind:pending.kind,plan:pending.plan,trialId:pending.trialId,index:pending.nextIndex-1}:null},session);}
  function publish(){persist();$('cityStars').textContent='★ '+campaign.score+' / 9';$('cityLocalScore').textContent=currentScore()+' / 50';$('cityBestScore').textContent=best+' / 50';if(window!==parent)parent.postMessage({kind:'city-score',version:GameScore.VERSION,session,score:best,completed:completedOnce},location.origin==='null'?'*':location.origin);}
  function recordProgress(){best=Math.max(best,currentScore());completedOnce ||=C.succeeded(campaign);}
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
    $('cityCalendar').textContent = (lesson ? 'Обучение · без баллов' : pending?.kind==='trial'||preview ? 'ОПЫТ · день '+viewedFrame.day+' · без баллов' : 'ЗАЧЁТ · день ' + viewedFrame.day + ' / 12') + (viewedFrame.day ? ' · ' + Epidemic.phases[viewedFrame.phase] : ' · город ждёт решения');
  }

  function state(){return lesson?lesson.c:preview?preview.after:campaign;}
  function choices(){
    const active=lesson?lesson.plan:plan,box=$('mayorPolicies');box.replaceChildren();
    for(const [key,options]of Object.entries(C.choices)){const group=element('fieldset','',box);group.id='choices-'+key;element('legend',names[key],group);
      for(const [value,title,hint]of options){const b=element('button',title,group);b.id='pick-'+key+'-'+value;b.className='city-choice';b.title=hint;b.setAttribute('aria-pressed',active[key]===value);b.disabled=!!pending||(lesson?!lesson.observed||lesson.tested:!started||campaign.completed);b.onclick=()=>{if(b.disabled)return;active[key]=value;choices();trialStatus();persist();$('mayorStatus').textContent=hint+' Сравни с результатом своего опыта.';signal('city:choice',{key,value});};}
    }
    const a=C.allocations[active.bus],extra=(lesson?0:campaign.game.infrastructure.bus)*20,am=Math.floor((a[0]+extra)*(active.school==='shifts'?1.25:1));
    const cost=C.dailyExpense(lesson?lesson.c:campaign,active);$('planExpense').textContent='Расход: '+cost+' в день · '+cost*4+' за раунд / лимит '+C.rounds[lesson?0:roundIndex()].expense+'.';
    $('allocationSummary').textContent='Места: утром '+am+' · к службам '+(a[1]+extra)+' · отдых '+(a[2]+extra)+'. Общие рейсы: '+(a[0]+a[1])+' базовых места утром и днём.';
  }
  function goals(){
    const index=preview?preview.index:lesson?0:roundIndex(),goal=C.rounds[index],stats=C.measure(state(),index),rows=C.checks(stats,index);
    $('cityGoalTitle').textContent=(preview?'Опыт: ':'')+goal.task;
    for(const id of ['cityGoalGrid','cityConditionGrid']){const box=$(id);box.replaceChildren();for(const [i,r]of rows.entries()){const card=element('div','',box);card.className='city-goal';const earned=rows.slice(0,i+1).every(x=>x.met),label=element('span','',card);element('b',r.title,label);element('small',r.target,label);element('strong',r.actual+(stats&&!(r.key==='care'&&!stats.careRequests)?earned?' ✓':r.met?' · ждёт ★':' !':''),card);if(stats){card.setAttribute('data-met',earned);card.setAttribute('data-waiting',r.met&&!earned);}}}
    $('cityNeeds').textContent='Звёзды по порядку: задача → остальные службы → бюджет. Главная задача не решена — 0 ★.';
  }
  function projects(){
    $('projectSummary').textContent='Фонд · '+campaign.funds;
    const box=$('projectChoices');box.replaceChildren();
    for(const id of C.projects){const p=Mayor.upgrades[id],active=campaign.projects.includes(id),card=element('article','',box);element('h3',p.title,card);element('p',p.effect+'. Содержание: '+p.upkeep+' монет в день.',card);
      const b=element('button',active?'Освободить '+p.cost+' монет ↩':'Вложить '+p.cost+' монет',card);b.id=(active?'refund-':'build-')+id;b.disabled=!!lesson||!started||!!pending||campaign.completed||!active&&campaign.funds<p.cost;
      b.onclick=()=>{if(b.disabled)return;campaign=active?C.refund(campaign,id):C.invest(campaign,id);actions.push({kind:active?'refund':'invest',id});update(false);$('mayorStatus').textContent=p.title+': '+(active?'вложение возвращено.':'готово к следующему прогону.')+' Результаты прошлого опыта относятся к прежним улучшениям.';};
    }
    $('cityBudget').textContent='Свободно '+campaign.funds+' из 200. Содержание: '+campaign.projects.reduce((s,id)=>s+Mayor.upgrades[id].upkeep,0)+' монет в день. Фонд и расходы за 4 дня учитываются отдельно.';
  }
  function trialStatus(){
    const count=trials.filter(t=>t.index===roundIndex()).length,left=2-count;
    $('trialCity').disabled=!!pending||!started||campaign.completed||!!lesson||!left;
    $('trialCity').textContent=left?'Опыт · 4 дня · осталось '+left:'Опыты раунда использованы';
    $('cityHypothesis').disabled=!!pending||campaign.completed;
    $('trialControls').hidden=!!lesson||!started||campaign.completed;
    const different=preview&&(JSON.stringify(preview.plan)!==JSON.stringify(plan)||JSON.stringify([...preview.before.projects].sort())!==JSON.stringify([...campaign.projects].sort()));
    $('trialSummary').textContent=preview?(different?'План изменён. На карте — результат прежнего опыта. ':'Результат опыта: ')+preview.after.results[preview.index].score+' / 3 ★ на копии. В зачёте пока без изменений.':'Опыт и зачёт стартуют с одного города. Догадка не даёт баллов.';
  }
  function trialResult(t){if(!trialCache.has(t))trialCache.set(t,C.round(C.replay(t.actions).campaign,t.plan).results[t.index]);return trialCache.get(t);}
  function reports(){
    const box=$('roundReports');box.replaceChildren();C.rounds.forEach((goal,i)=>{const card=element('article','',box),r=campaign.results[i];element('h3',goal.title+' · '+(r?'★ '+r.score+' / 3':'до 3 ★'),card);element('p',goal.brief,card);for(const check of C.checks(r,i))element('p',check.title+': '+check.target+(r?' · '+check.actual:''),card);});
    const history=$('trialHistory');history.replaceChildren();if(!trials.length)element('p','Опытов пока нет. Перед каждым раундом доступны две проверки.',history);
    for(const t of trials){const card=element('article','',history);card.className='trial-entry';element('h3','Раунд '+(t.index+1)+' · '+hypotheses[t.hypothesis],card);element('p',planName(t.plan)+' · улучшения: '+(C.replay(t.actions).campaign.projects.map(id=>Mayor.upgrades[id].title).join(', ')||'нет'),card);if(t.complete){const r=trialResult(t);element('p','На копии: ★ '+r.score+'/3 · еда '+r.food.toFixed(1)+'% · занятия '+r.activity.toFixed(1)+'% · помощь '+r.careServed+'/'+r.careRequests+' · расход '+r.expense+' монет.',card);}else element('p','Ещё идёт.',card);}
    const chips=$('cityAttempts');chips.replaceChildren();attempts.forEach((score,i)=>element('span','Партия '+(i+1)+': '+score+'/50',chips));
    const last=campaign.results.at(-1);$('roundLearning').hidden=!last||!!lesson||!!preview;
    if(last){$('roundLearningTitle').textContent='Итог · '+C.rounds[last.index].title;$('roundWhy').textContent=C.insights(campaign,last.index).join(' ');}
    $('cityExperiment').hidden=!!lesson||!started;$('cityLearningGoal').textContent='3 задачи · до 9 ★ · опыты не дают баллов · в зачёте остаются последствия твоих решений';$('cityLearningGoal').hidden=!!lesson;
    $('restartEarly').disabled=!!pending||!!lesson||!started;
  }
  function planName(p){return Object.entries(p).map(([key,value])=>C.choices[key]?.find(([v])=>v===value)?.[1]).filter(Boolean).join(' · ');}
  function update(renderNow=true){
    choices();goals();projects();reports();trialStatus();const nav=$('cityRounds');nav.replaceChildren();C.rounds.forEach((r,i)=>{const span=element('span',(i+1)+'. '+r.title+' · '+(campaign.results[i]?'★ '+campaign.results[i].score+'/3':'до 3 ★'),nav);span.setAttribute('data-current',i===roundIndex());});
    $('cityRoundBrief').textContent=lesson?'Учебный день: сравни два плана из одного исходного города.':C.current(campaign).brief;
    document.body.classList.toggle('campaign-day-paused',!!pending&&!playing);document.body.classList.toggle('campaign-intro',!started&&!lesson?.observed);document.body.classList.toggle('campaign-completed',campaign.completed&&!lesson);document.body.classList.toggle('campaign-lesson-finished',!!lesson?.tested);
    $('cityStart').hidden=started&&!lesson||lesson?.observed&&!lesson.tested;$('observeCity').hidden=!!lesson?.observed;$('beginCity').hidden=!!lesson&&!lesson.tested;$('observeCity').disabled=$('beginCity').disabled=!!pending;
    $('tryCity').disabled=playing||(pending?false:lesson?!lesson.observed||lesson.tested:!started||campaign.completed);
    $('tryCity').textContent=pending&&!playing?'Продолжить '+(pending.kind==='trial'?'опыт':'прогон'):lesson?'Проверить своё решение':campaign.completed?'Партия завершена':'Зачёт · 4 дня';
    $('pauseCity').disabled=!playing;$('restartCity').hidden=!campaign.completed||!!lesson;
    if(renderNow)render(state());publish();
  }
  function dailyFeedback(before,after){const r=after.game.reports.at(-1);if(!r)return;$('cityComparison').hidden=false;const box=$('cityEffects');box.replaceChildren();const kind=C.rounds[Math.floor((r.day-1)/4)].focus,f=r.flows[kind],name={activity:'очные поездки на занятия и работу',food:'покупатели семей',care:'обращения за помощью'}[kind];element('span','День '+r.day+' · '+name,box);element('span',f.requested.length?'Добрались '+f.arrived.length+'/'+f.requested.length+' · обслужены '+f.served.length+'/'+f.requested.length:'Сейчас нет запросов на поездку',box);element('span','Еда '+r.food+'% · расход '+r.expenses+' монет',box);}
  function restoreFeedback(){
    if(preview){dailyFeedback(preview.before,preview.after);$('roundOutcome').textContent='ОПЫТ: '+preview.after.results[preview.index].score+'/3 ★. '+planName(preview.plan)+'.';return;}
    if(!campaign.game.day){$('roundOutcome').textContent='';$('cityComparison').hidden=true;return;}
    dailyFeedback(null,campaign);const r=campaign.results.at(-1);$('roundOutcome').textContent=C.rounds[r.index].title+': ★ '+r.score+'/3. '+(r.full?'Все условия выполнены.':!r.primaryMet?'Главная задача не решена.':'Не выполнено: '+C.checks(r,r.index).filter(x=>!x.met).map(x=>x.title.replace(/★/g,'').trim()).join(', ')+'.');
  }
  function finishDay(){
    const t=pending;pending=null;playing=false;
    if(t.kind==='lesson'){lesson.c=t.after;if(!lesson.observed)lesson.observed=true;else lesson.tested=true;dailyFeedback(null,t.after);update();$('mayorStatus').textContent='Учебный прогон завершён. Проверь, кто добрался и что изменилось.';signal(lesson.tested?'city:tested':'city:observed');return;}
    if(t.kind==='trial'){trials[t.trialId].complete=true;preview={...t,id:t.trialId,index:trials[t.trialId].index};update();restoreFeedback();$('mayorStatus').textContent='Это копия города. Проверь причины, скорректируй план и запусти зачёт. Настоящий город не изменился.';persist();return;}
    for(let i=0;i<4;i++)actions.push({kind:'day',plan:t.plan});campaign=t.after;preview=null;recordProgress();if(campaign.completed)attempts.push(currentScore());update();restoreFeedback();
    $('mayorStatus').textContent=campaign.completed?'Партия завершена: ★ '+campaign.score+'/9. Лучший результат сохранён.':'Зачёт завершён. Следующий раунд начинается с этого города: запасы и состояние жителей сохранились.';signal('city:round',{index:campaign.game.day/4-1});
  }
  function tick(){if(!pending||!playing)return;if(pending.nextIndex>pending.endIndex){finishDay();return;}render(pending.after,pending.nextIndex++);persist();timer=setTimeout(tick,window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?60:pending.kind==='trial'?700:1600);}
  function playDay(kind){
    if(playing)return;
    if(!pending){const before=kind==='lesson'?C.create():campaign,active=kind==='lesson'?lesson.plan:plan,after=kind==='lesson'?C.advance(before,active):C.round(before,active);let trialId=null;
      if(kind==='trial'){if(trials.filter(t=>t.index===roundIndex()).length>=2)return;trialId=trials.length;trials.push({index:roundIndex(),actions:structuredClone(actions),plan:{...active},hypothesis:$('cityHypothesis').value,complete:false});}
      pending={before,after,plan:{...active},kind,trialId,nextIndex:before.game.history.length+1,endIndex:after.game.history.length};preview=null;
    }
    playing=true;update(false);$('mayorStatus').textContent=pending.kind==='trial'?'ОПЫТ: копия города, без звёзд и расходов в зачёте.':'План зафиксирован до конца прогона. Можно поставить на паузу и рассмотреть жителей.';signal('city:started');tick();
  }
  $('observeCity').onclick=()=>{if(pending||lesson?.observed)return;if(!lesson)lesson={c:C.create(),plan:GameScore.cityDefaults(),observed:false,tested:false};playDay('lesson');};
  $('beginCity').onclick=()=>{if(pending)return;lesson=null;started=true;update();$('mayorStatus').textContent='Выбери решения. Можно проверить догадку на копии города, затем изменить план перед зачётом.';};
  $('tryCity').onclick=()=>{if($('tryCity').disabled)return;playDay(lesson?'lesson':'round');};$('trialCity').onclick=()=>{if(!$('trialCity').disabled)playDay('trial');};$('cityHypothesis').onchange=persist;
  function pauseDay(){if(!playing)return;clearTimeout(timer);window.pauseMayorMotion?.();playing=false;update(false);$('mayorStatus').textContent='Пауза. Показаны только уже прожитые этапы; можно осмотреть жителей и продолжить.';}
  $('pauseCity').onclick=pauseDay;window.addEventListener?.('message',e=>{if(e.source===parent&&e.data==='pause')pauseDay();});
  function restart(){if(pending||lesson)return;campaign=C.create();actions=[];trials=[];preview=null;plan=GameScore.cityDefaults();started=true;selectedCitizen=0;update();restoreFeedback();$('mayorStatus').textContent='Новая партия. Лучший счёт сохранён.';}
  $('restartCity').onclick=$('restartEarly').onclick=restart;
  const latestShownIndex=()=>pending?pending.nextIndex-1:viewedHistory.length-1;
  function inspectFlow(kind,day=viewedFrame.day){
    pauseDay();inspected=kind;const shown=viewedHistory[latestShownIndex()],box=$('flowPanel');box.replaceChildren();const phase=kind==='activity'?1:2,r=viewedGame.reports.find(r=>r.day===day),flow=r?.flows?.[kind];
    element('h3',({activity:'Дом → поездка → занятия и работа',food:'Дом → поездка → магазин → покупка',care:'Дом → поездка → больница → помощь'})[kind],box);
    element('p','День '+day+' · '+(preview||pending?.kind==='trial'?'опыт на копии':'показанный город'),box);
    const label=element('label','Показанный день ',box),select=element('select','',label);select.id='flowDay';
    for(const report of viewedGame.reports.filter(r=>r.day<=shown.day&&r.day>Math.floor(Math.max(0,shown.day-1)/4)*4)){const option=element('option','День '+report.day,select);option.value=report.day;}select.value=day;select.onchange=()=>inspectFlow(kind,+select.value);
    if(!flow||day===shown.day&&shown.phase<phase){element('p','Этот этап ещё не показан. Продолжи прогон, чтобы увидеть фактический результат.',box);$('cityFlow').open=true;return;}
    const arrived=new Set(flow.arrived),served=new Set(flow.served),missed=flow.requested.filter(id=>!arrived.has(id)),waiting=flow.arrived.filter(id=>!served.has(id));
    const chain=element('div','',box);chain.className='flow-chain';for(const [label,n]of [['Нужна поездка',flow.requested.length],['Добрались',flow.arrived.length],['Получили услугу',flow.served.length]]){const step=element('div','',chain);element('strong',String(n),step);element('span',label,step);}
    element('p',kind==='activity'?'Показаны очные поездки. При варианте «Дома» часть жителей учится или работает удалённо; это учитывается в итоговой доступности.':kind==='food'?'Покупатель представляет семью. Семьи с запасом на два дня не отправляют покупателя; они не считаются пропустившими поездку.':'Показаны обращения этого дня, а не все заболевшие.',box);
    const allLost=new Set([...missed,...waiting]);for(const e of $('map').querySelectorAll('[data-person]'))e.classList.toggle('flow-affected',allLost.has(+e.getAttribute('data-person')));
    const reasons=[['Не добрались: не хватило мест в автобусе',missed],...(kind==='food'?[['Добрались, но не хватило мест в магазине',flow.capacityDenied],['Не хватило денег на покупку',flow.moneyDenied]]:[[kind==='care'?'Добрались, но не хватило мест на приёме':'Добрались, но не хватило мест на занятиях или работе',waiting]])];
    for(const [label,ids]of reasons){element('h4',label+' · '+ids.length,box);const list=element('div','',box);list.className='flow-people';for(const id of ids){const person=viewedGame.people[id],b=element('button',person.name+' · квартал '+(person.district+1),list);b.onclick=()=>{$('cityFlow').open=false;setTimeout(()=>{const index=viewedHistory.findIndex(h=>h.day===day&&h.phase===(day<shown.day?4:shown.phase));if(index>=0)render({game:viewedGame},index,false);window.mayorCitizenSelect(id);},0);};}if(!ids.length)element('p','На этом участке потерь нет.',box);}
    $('cityFlow').open=true;
  }
  for(const kind of ['activity','food','care'])$('inspect-'+kind).onclick=()=>inspectFlow(kind);
  function citizenDetails() {
    const g = viewedGame, h = viewedFrame, p = g.people[selectedCitizen], family = g.households[p.household], snapshot = h.citizens?.[selectedCitizen];
    const box = $('citizenPanel'); box.replaceChildren(); const card = element('article', '', box); card.className = 'citizen-card';
    element('h3', p.name + ' · ' + p.age + ' лет · квартал ' + (p.district + 1), card);
    element('p', 'Семья из ' + family.members.length + ' человек · ' + (g.districts[p.district].far ? 'дальний' : 'ближний') + ' квартал', card);
    element('p', 'День ' + h.day + ' · настроение ' + (snapshot?.happiness ?? 80) + '% · энергия ' + (snapshot?.energy ?? 80) + '%', card);
    const stocks = h.householdFood?.[p.household];
    if (stocks !== undefined) element('p', (h.phase === 4 ? 'Продуктов на ' : 'Запас утром: ') + stocks.toFixed(1) + ' дня', card);
    if (snapshot?.reaction) element('p', snapshot.reaction.emoji + ' «' + snapshot.reaction.text + '»', card);
    if(viewedIndex<latestShownIndex()){const back=element('button','К последнему показанному этапу',card);back.id='returnToShown';back.onclick=()=>{const index=latestShownIndex();$('cityPeople').open=false;render({game:viewedGame},index,false);};}
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
  window.mayorPlaceHint = id => ['park', 'gym'].includes(id) ? 'открыть сведения' : id.startsWith('h') ? 'посмотреть жителей' : 'посмотреть путь и причины';
  window.mayorSelect = id => {
    if(['clinic','market','mall','bus','school','kindergarten','work'].includes(id)){inspectFlow(id==='bus'?C.rounds[preview?.index??roundIndex()].focus:id==='clinic'?'care':['market','mall'].includes(id)?'food':'activity');return;}
    if (id.startsWith('h')) window.mayorCitizenSelect(viewedGame.people.findIndex(p => p.home === id));
    else if (['park', 'gym'].includes(id)) {
      pauseDay();
      const box = $('cityPlacePanel'); box.replaceChildren();
      element('h3', id === 'park' ? 'Парк · отдых на воздухе' : 'Спортцентр · отдых в помещении', box);
      element('p', 'День ' + viewedFrame.day + ' · ' + Epidemic.phases[viewedFrame.phase] + '. Сейчас здесь ' + viewedFrame.loc.filter(place => place === id).length + ' жителей.', box);
      element('p', id === 'park' ? 'Вечером здесь отдыхают до 60 жителей и восстанавливают энергию. На холоде часть жителей выбирает спортцентр. На воздухе вероятность заражения ниже.' : 'Вечером здесь отдыхают до 24 жителей и восстанавливают энергию. На холоде спрос растёт, поэтому мест может не хватить.', box);
      element('p', 'Отдых влияет на энергию и настроение. Это место работает самостоятельно; отдельного переключателя нет.', box);
      $('cityPlaceInfo').open = true;
    }
  };

  function recoverCity(){const saved=window.FestivalSession?.read('city');if(!saved||saved.rules!==C.VERSION)return;
    try{
      const validPlan=p=>Object.entries(C.choices).every(([key,values])=>values.some(([v])=>v===p?.[key]));
      if(!validPlan(saved.plan)||!Number.isInteger(saved.best)||saved.best<0||saved.best>50||!Array.isArray(saved.attempts)||saved.attempts.some(n=>!Number.isInteger(n)||n<0||n>50)||!Array.isArray(saved.trials)||saved.trials.length>6)return;
      const restored=C.replay(saved.actions).campaign;if(restored.game.day%4)return;
      const counts=[0,0,0];for(const t of saved.trials){if(!Number.isInteger(t.index)||t.index<0||t.index>2||++counts[t.index]>2||!validPlan(t.plan)||!hypotheses[t.hypothesis]||typeof t.complete!=='boolean')return;const start=C.replay(t.actions).campaign;if(start.game.day!==t.index*4||start.game.day>restored.game.day)return;}
      let next=null,review=null;
      if(saved.pending){const p=saved.pending;if(!['trial','round'].includes(p.kind)||!validPlan(p.plan)||restored.completed)return;const before=restored,after=C.round(before,p.plan);if(!Number.isInteger(p.index)||p.index<=before.game.history.length||p.index>after.game.history.length)return;
        if(p.kind==='trial'){const t=saved.trials[p.trialId];if(!t||t.complete||t.index!==before.game.day/4||JSON.stringify(t.actions)!==JSON.stringify(saved.actions)||JSON.stringify(t.plan)!==JSON.stringify(p.plan))return;}
        next={before,after,plan:p.plan,kind:p.kind,trialId:p.trialId,nextIndex:p.index+1,endIndex:after.game.history.length};
      }else if(Number.isInteger(saved.previewId)){const t=saved.trials[saved.previewId];if(t?.complete&&t.index===Math.floor(restored.game.day/4)){const before=C.replay(t.actions).campaign;review={before,after:C.round(before,t.plan),plan:t.plan,id:saved.previewId,index:t.index};}}
      campaign=restored;actions=saved.actions;plan=saved.plan;trials=saved.trials;started=!!saved.started;pending=next;preview=review;best=Math.max(saved.best,currentScore());completedOnce=!!saved.completedOnce;attempts=saved.attempts;
      if(hypotheses[saved.hypothesis])$('cityHypothesis').value=saved.hypothesis;recordProgress();window.cityRestored=started;
    }catch{}
  }
  recoverCity();restoring=false;
  window.cityTourHooks={before(){if(pending)return false;preview=null;lesson={c:C.create(),plan:GameScore.cityDefaults(),observed:false,tested:false};update();return true;},after(){if(pending){clearTimeout(timer);window.pauseMayorMotion?.();pending=null;playing=false;}lesson=null;update();restoreFeedback();}};
  window.cityLesson={observed:()=>!!lesson?.observed,attempted:()=>!!lesson?.tested};
  window.cityCampaignGame={current:()=>campaign,isPlaying:()=>playing,isPending:()=>!!pending,trial:()=>preview?{index:preview.index,plan:preview.plan,result:preview.after.results[preview.index]}:null,trials:()=>structuredClone(trials)};
  update();restoreFeedback();if(pending)render(pending.after,pending.nextIndex-1,false);publish();$('mayorStatus').textContent=window.cityRestored?'Партия восстановлена. '+(pending?'Прогон на паузе.':'Можно продолжать.'):'Найди причину проблемы, проверь догадку на копии и запусти зачёт.';
})();
