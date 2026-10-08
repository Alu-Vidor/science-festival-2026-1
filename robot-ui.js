/* The child owns the route. A frozen learned model forecasts each trial. */
(function () {
  'use strict';
  const R=RobotEngine,$=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
  let session=FestivalSession.id,stage=0,route=['S'],trips=[],trainedCount=0,running=false,timer=null,live=null,restored=false;
  const svg=(tag,attrs={},text)=>{const e=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;};
  const map=()=>R.create(stage),name=id=>map().nodes[id][2],routeName=r=>r.map(name).join(' → ');
  function measured(t){return R.simulate(R.create(t.stage),t.route).observations.slice(0,t.steps);}
  function modelAt(count){return R.train(trips.slice(0,count).flatMap(measured));}
  const model=()=>modelAt(trainedCount);
  function actual(t){
    const full=R.simulate(R.create(t.stage),t.route),observations=full.observations.slice(0,t.steps),last=observations.at(-1);
    const all=t.steps===full.observations.length;
    return {...full,observations,spent:observations.reduce((s,o)=>s+o.energy,0),state:last?.after||R.fresh(),stalled:!!last?.stalled,exhausted:all&&full.exhausted&&!t.interrupted,finished:all&&full.finished&&!t.interrupted};
  }
  function prediction(t){return R.forecast(R.create(t.stage),t.route,modelAt(t.trainedAtStart));}
  function persist(){FestivalSession.save('robot',{rules:R.VERSION,stage,route,trips,trainedCount},session);}
  function results(){
    const best=[null,null];
    for(const t of trips){if(!t.ended)continue;const m=R.create(t.stage),r=actual(t),score=R.deliveryScore(m,r,t.route);if(score&&(!best[t.stage]||r.spent<best[t.stage].energy))best[t.stage]={score,energy:r.spent};}
    const current=R.assess(model()),versions=[trainedCount,...trips.map(t=>t.trainedAtStart)].filter(Boolean),audits=versions.map(c=>R.assess(modelAt(c)));
    const modelBest=Math.max(0,...audits.map(a=>a.score)),learningDone=audits.some(a=>a.correct>=4);
    return {best,current,modelBest,learningDone,delivery:best.reduce((s,b)=>s+(b?.score||0),0)};
  }
  function publish(){const r=results();window.SessionScore?.robot(r.delivery+r.modelBest,r.best.every(Boolean),r.learningDone);}
  function say(s){$('status').textContent=s;}
  function restore(){
    const s=FestivalSession.read('robot');if(!s||s.rules!==R.VERSION)return;
    try{
      if(![0,1].includes(s.stage)||!Array.isArray(s.trips)||s.trips.length>100||!Number.isInteger(s.trainedCount)||s.trainedCount<0||s.trainedCount>s.trips.length)throw Error();
      R.routeSteps(R.create(s.stage),s.route);
      for(const [i,t]of s.trips.entries()){
        if(![0,1].includes(t.stage)||!Array.isArray(t.route)||t.route.length<2||!Number.isInteger(t.steps)||!Number.isInteger(t.trainedAtStart)||t.trainedAtStart<0||t.trainedAtStart>i||typeof t.ended!=='boolean'||typeof t.interrupted!=='boolean')throw Error();
        const full=R.simulate(R.create(t.stage),t.route);if(t.steps<0||t.steps>full.observations.length)throw Error();
      }
      stage=s.stage;route=s.route;trips=s.trips;trainedCount=s.trainedCount;
      for(const t of trips)if(!t.ended){t.ended=true;t.interrupted=true;}
      if(stage===1&&(!results().best[0]||!trainedCount)){stage=0;route=['S'];}
      restored=true;live=trips.at(-1)?.stage===stage?actual(trips.at(-1)):null;
    }catch{stage=0;route=['S'];trips=[];trainedCount=0;}
  }
  function drawMap(){
    const m=map();$('missionName').textContent=m.title;const roads=$('roads');roads.replaceChildren();$('roadLabels').replaceChildren();
    for(const e of m.edges){
      const a=m.nodes[e.a],b=m.nodes[e.b],d=`M${a[0]},${a[1]} L${b[0]},${b[1]}`;
      const group=svg('g',{'data-edge':e.id});group.append(svg('path',{d,class:'road-border'}),svg('path',{d,class:'road-surface',stroke:`url(#texture-${e.type})`}));
      const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2,label=svg('g',{class:'road-label',transform:`translate(${x} ${y})`});
      const text=R.terrains[e.type].name+' · '+e.length,w=Math.max(82,text.length*8.4);
      label.append(svg('rect',{x:-w/2,y:-13,width:w,height:26,rx:5}),svg('text',{y:5},text));$('roadLabels').append(label);roads.append(group);
    }
    const junctions=$('junctions');junctions.replaceChildren();
    for(const [id,[x,y,title]]of Object.entries(m.nodes)){
      const g=svg('g',{class:'junction',transform:`translate(${x} ${y})`,'data-node':id,tabindex:0,role:'button','aria-label':title+' — добавить развилку в маршрут'});
      g.append(svg('circle',{r:id==='S'||id==='G'?27:23}),svg('text',{},id==='S'?'⌂':id==='G'?'⚑':title));
      if(id==='S'||id==='G')g.append(svg('text',{class:'node-name',y:47},title));
      g.addEventListener('click',()=>addNode(id));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();addNode(id);}});junctions.append(g);
    }
    $('terrainLegend').replaceChildren(...Object.entries(R.terrains).map(([type,t])=>{
      const span=document.createElement('span');span.className='terrain-key';span.dataset.terrain=type;
      const swatch=svg('svg',{viewBox:'0 0 30 24','aria-hidden':true});swatch.append(svg('rect',{width:30,height:24,fill:`url(#texture-${type})`}));span.append(swatch,document.createTextNode(t.name));return span;
    }));
    drawRoute();
  }
  function drawRoute(){
    const m=map(),layer=$('routeLines');layer.replaceChildren();
    if(route.length>1)layer.append(svg('polyline',{class:'route-plan',points:route.map(n=>m.nodes[n].slice(0,2).join(',')).join(' ')}));
    const observations=live?.observations||[];
    let position=m.nodes.S.slice(0,2),points=[position];
    for(const o of observations){const a=m.nodes[o.from],b=m.nodes[o.to];if(!a||!b)continue;position=[a[0]+(b[0]-a[0])*o.fraction,a[1]+(b[1]-a[1])*o.fraction];points.push(position);}
    if(points.length>1)layer.append(svg('polyline',{class:'route-trail',points:points.map(p=>p.join(',')).join(' ')}));
    $('robotSprite').setAttribute('transform',`translate(${position.join(' ')})`);
    for(const g of $('junctions').children){g.dataset.current=g.dataset.node===route.at(-1);g.setAttribute('aria-disabled',String(running));}
    $('remaining').textContent=(m.budget-(live?.spent||0))+' / '+m.budget;
    $('spent').textContent=live?.spent||0;$('wheelState').textContent=R.stateName(live?.state||R.fresh());
  }
  function draw(){
    const m=map(),r=results(),forecast=R.forecast(m,route,model());
    $('routeText').textContent=routeName(route);$('routeLength').textContent=(route.length-1)+' дорог · '+R.routeSteps(m,route).length+' шагов';
    $('forecastEnergy').textContent=route.length>1?'≈ '+forecast.spent+' энергии':'Путь не выбран';
    $('forecastOutcome').textContent=forecast.stalled?'ИИ ожидает застревание. Можно проверить свою гипотезу.':forecast.exhausted?'По оценке ИИ, батареи не хватит.':route.length<2?'Можно испытать часть пути или доехать до лагеря.':route.at(-1)==='G'?'ИИ ожидает доставку груза.':'ИИ ожидает проезд выбранного участка.';
    const unknown=forecast.observations.filter(o=>!o.known).length;
    $('forecastConfidence').textContent=trainedCount?(unknown?`На ${unknown} шагах не хватает похожего опыта. Прогноз может ошибиться.`:'Для всех шагов есть опыт с таким состоянием колёс.'):'Пока есть только стартовая оценка расхода. Эффекты покрытий ещё не изучены.';
    $('run').disabled=running||route.length<2||trips.length>=100;$('run').textContent=route.at(-1)==='G'?'Доставить груз':'Испытать';
    $('stop').disabled=!running;$('undo').disabled=running||route.length<2;$('clearRoute').disabled=running||route.length<2;
    const pending=trips.slice(trainedCount).flatMap(measured).length;
    $('newExperience').textContent=`Новых наблюдений: ${pending} · В модели: ${model().length}`;
    $('train').disabled=running||pending===0;$('auditButton').disabled=!trainedCount;$('notebookButton').disabled=!trips.length||running;
    $('deliveryScore').textContent=r.delivery+' / 25';$('modelScore').textContent=r.modelBest+' / 25';
    $('deliveryBest').textContent=r.best[stage]?`Лучший рейс: ${r.best[stage].energy} энергии · ${r.best[stage].score}/${m.max} баллов. Ориентир экономии: ${R.optimum(m).energy}.`:`На этой карте: до ${m.max} баллов. Ориентир экономии: ${R.optimum(m).energy} энергии.`;
    $('qualitySummary').textContent=trainedCount?`${r.current.correct} / 6 — точный прогноз`:'Модель ещё не обучена';
    $('nextStageHint').textContent=stage===0?(!r.best[0]||!trainedCount?'Для следующей карты доставь груз и обучи модель хотя бы один раз.':'Перевал открыт. Опыт сохраняется, дороги там другие.'):'Можно улучшать оба маршрута. Лучшие результаты сохраняются.';
    for(let i=0;i<2;i++){const b=$('expedition-'+i);b.disabled=running||(i===1&&(!r.best[0]||!trainedCount));b.classList.toggle('active',stage===i);b.classList.toggle('done',!!r.best[i]);b.setAttribute('aria-pressed',String(stage===i));b.textContent=(r.best[i]?'✓ ':'')+(i+1)+'. '+R.create(i).title;}
    const t=trips.at(-1);
    if(t){const a=actual(t),p=prediction(t);$('lastPrediction').textContent=p.spent;$('lastActual').textContent=a.spent;
      $('tripOutcome').textContent=!t.ended?'Поездка идёт. Прогноз зафиксирован до старта.':a.stalled?'Робот застрял. В журнале видно состояние колёс перед подъёмом.':a.exhausted?'Батарея закончилась. Измерения пройденных участков сохранены.':t.interrupted?'Заезд остановлен. Обучить можно по уже пройденным участкам.':t.route.at(-1)==='G'?'Груз доставлен. Сравни расход и попробуй другой путь.':'Исследовательский заезд завершён. Его измерения можно передать ИИ.';
    }else{$('lastPrediction').textContent=$('lastActual').textContent='—';$('tripOutcome').textContent='После испытания сравни здесь прогноз и результат.';}
    drawRoute();persist();publish();
  }
  function addNode(id){
    if(running)return;
    if(route.at(-1)==='G'){say('Путь уже заканчивается в лагере. Убери последний шаг или начни новый путь.');return;}
    if(!R.edgeBetween(map(),route.at(-1),id)){say('Эти развилки не соединены дорогой. Маршрут должен идти по существующим дорогам.');return;}
    if(route.length>=31){say('В одном маршруте не больше 30 дорог. Убери лишние шаги или проведи этот опыт.');return;}
    route.push(id);live=null;draw();say('Маршрут изменён. Синий путь выбираешь ты; числа на дорогах показывают их длину.');
  }
  function finish(interrupted=false){
    clearTimeout(timer);running=false;const t=trips.at(-1);if(!t)return;t.ended=true;t.interrupted=interrupted;
    live=actual(t);draw();say($('tripOutcome').textContent+' Модель сама не изменилась: передай ей опыт кнопкой «Добавить опыт и обучить».');
  }
  function tick(){
    if(!running)return;
    const t=trips.at(-1),full=R.simulate(map(),t.route);
    if(t.steps>=full.observations.length){finish();return;}
    t.steps++;live=actual(t);drawRoute();$('lastActual').textContent=live.spent;persist();
    const o=live.observations.at(-1);say(`${R.terrains[o.type].name}: потрачено ${o.energy}. Колёса: ${R.stateName(o.before)} → ${R.stateName(o.after)}.`);
    if(t.steps>=full.observations.length){finish();return;}
    timer=setTimeout(tick,matchMedia('(prefers-reduced-motion: reduce)').matches?15:360);
  }
  function run(){
    if($('run').disabled)return;
    const t={stage,route:[...route],steps:0,trainedAtStart:trainedCount,ended:false,interrupted:false};trips.push(t);running=true;live=actual(t);draw();tick();
  }
  function teach(){
    if($('train').disabled)return;
    const before=R.assess(model());trainedCount=trips.length;const after=R.assess(model());
    $('learningEffect').textContent=`Опыт добавлен. Контрольные прогнозы: ${before.correct}/6 → ${after.correct}/6. Текущая оценка модели: ${after.score}/25.`;
    $('qualityChange').textContent='Точно: расход ±10% и верный прогноз проезда. Цель — 4 из 6.';
    draw();say('Модель переобучена на твоих поездках. Сравни её новый прогноз с прежним или составь другой маршрут.');
  }
  function changeStage(n){if($('expedition-'+n).disabled||stage===n)return;stage=n;route=['S'];live=null;drawMap();draw();say('Новая карта. Опыт ИИ сохранён, но путь выбираешь заново.');}
  function openDialog(title,html){$('dialogTitle').textContent=title;$('dialogBody').innerHTML=html;$('robotDialog').showModal();}
  function help(){openDialog('Ты исследуешь дороги и обучаешь прогноз ИИ',`<ol><li><b>Построй свой маршрут.</b> Нажимай на соседние развилки. Можно вернуться по той же дороге, провести короткий опыт или доехать до лагеря. «Убрать шаг» отменяет последнее соединение.</li><li><b>Посмотри прогноз и испытай путь.</b> ИИ оценивает расход и застревание. Во время поездки видны заряд и состояние колёс: грязь и влажность (0–2). Свойства покрытия открываются через последствия.</li><li><b>Добавь измерения и обучи.</b> Модель получает пары «покрытие + состояние до шага → расход + состояние после шага + проезд». Она сравнивает новые условия с ближайшим накопленным опытом. Однообразные поездки оставляют пробелы в знаниях.</li><li><b>Проверь другой путь.</b> После обучения сравни прогноз на новом сочетании дорог с реальной поездкой. Собственные наблюдения и контрольные поездки показаны отдельно.</li></ol><p>Победа: две доставки и хотя бы 4 точных контрольных прогноза из 6. Результат робота — до 50 баллов. Эксперименты и ошибки не ограничены таймером.</p>`);}
  function audit(){const a=R.assess(model());openDialog('Проверка обученной модели',`<p>Одинаковые для всех 6 контрольных поездок начинаются с чистых сухих колёс. ИИ предсказывает их по твоему опыту. Эти поездки не добавляются в обучение. Можно возвращаться к проверке после новых экспериментов.</p><table><thead><tr><th>Последовательность покрытий</th><th>Прогноз</th><th>Факт</th><th>Результат</th></tr></thead><tbody>${a.checks.map(c=>`<tr><td>${c.types.map(t=>R.terrains[t].name).join(' → ')}</td><td>${c.predicted} · ${c.predictedStall?'застрянет':'проедет'}</td><td>${c.actual} · ${c.stalled?'застрял':'проехал'}</td><td class="${c.quality>=.9?'good':'bad'}">${c.quality>=.9?'Точно':c.stalled!==c.predictedStall?'Ошибка проезда':'Ошибка расхода: '+c.error}</td></tr>`).join('')}</tbody></table><p><b>Сейчас: ${a.correct}/6 точных прогнозов · ${a.score}/25 баллов.</b> Цель — минимум 4 точных прогноза. Точный означает ошибку расхода не больше 10% и верный прогноз проезда.</p><p class="audit-explanation">Баллы учитывают величину ошибки каждого прогноза. При ошибке проезда проверка даёт 0; иначе её доля — 1 минус ошибка расхода, делённая на фактический расход (не ниже 0). Средняя доля × 25, с округлением вниз. В общий счёт идёт лучшая проверка.</p>`);}
  function notebook(){openDialog('Журнал поездок и измерений',`<p>Прогноз каждой поездки зафиксирован до старта. Измерения попадут в модель только после нажатия «Добавить опыт и обучить».</p>${trips.map((t,i)=>{
      const a=actual(t),p=prediction(t);return `<section class="trip-entry"><h3>${i+1}. ${R.create(t.stage).title}: ${routeName(t.route)}</h3><p>Прогноз: ${p.spent} (${p.stalled?'застрянет':p.exhausted?'батареи не хватит':'проедет'}). Факт: ${a.spent} (${a.stalled?'застрял':a.exhausted?'батарея закончилась':t.interrupted?'остановлен':'проехал'}). ${i<trainedCount?'В обучении.':'Ещё не в обучении.'}</p><details><summary>Измерения: ${a.observations.length} шагов</summary><table><thead><tr><th>Покрытие</th><th>Колёса до</th><th>Расход</th><th>Колёса после / итог</th></tr></thead><tbody>${a.observations.map(o=>`<tr><td>${R.terrains[o.type].name}</td><td>${R.stateName(o.before)}</td><td>${o.energy}</td><td>${o.stalled?'Застрял':R.stateName(o.after)}</td></tr>`).join('')}</tbody></table></details></section>`;
    }).reverse().join('')}`);}
  function rules(){openDialog('Два результата робота — до 50 баллов',`<p><b>Твои маршруты — до 25.</b> Доставка в Долине даёт до 12, на Перевале — до 13. Чем меньше расход, тем больше баллов: максимум карты × минимальный возможный расход / твой расход, с округлением вниз. Частичный или неудачный рейс даёт опыт, но не баллы за доставку. Лучшие доставки сохраняются.</p><p><b>Обученный прогноз — до 25.</b> Модель проверяется на шести одинаковых для всех контрольных поездках. Сравниваются расход и проезд. Контрольные результаты не попадают в обучение. Лучший результат проверки сохраняется.</p><p>Задание обучения завершено при 4 точных прогнозах из 6. Точный прогноз — ошибка расхода до 10% и правильный прогноз проезда. Задание доставки завершено после помощи лагерю на обеих картах.</p><p>Все заезды начинаются с чистых сухих колёс и 60 единиц заряда. Ошибки и остановки дают измерения для следующего обучения. Время и число нажатий не дают баллов.</p>`);}
  function tab(city){
    if(running)finish(true);document.body.classList.toggle('city-active',city);$('robotDialog').close();$('robotView').hidden=city;$('epiView').hidden=!city;$('robotTutorial').hidden=city;
    $('robotTab').classList.toggle('active',!city);$('epiTab').classList.toggle('active',city);$('robotTab').setAttribute('aria-pressed',String(!city));$('epiTab').setAttribute('aria-pressed',String(city));
    history.replaceState(null,'',city?'#epidemic':location.pathname+location.search);$('epiView').contentWindow?.postMessage(city?'city-active':'pause',location.protocol==='file:'?'*':location.origin);
  }
  $('run').onclick=run;$('stop').onclick=()=>finish(true);$('train').onclick=teach;
  $('undo').onclick=()=>{route.pop();live=null;draw();say('Последняя дорога убрана. Можно выбрать другой путь.');};
  $('clearRoute').onclick=()=>{route=['S'];live=null;draw();say('Новый маршрут начинается на базе. Накопленный опыт сохранён.');};
  $('expedition-0').onclick=()=>changeStage(0);$('expedition-1').onclick=()=>changeStage(1);
  $('robotTutorial').onclick=help;$('auditButton').onclick=audit;$('notebookButton').onclick=notebook;$('scoreRules').onclick=rules;$('dialogClose').onclick=()=>$('robotDialog').close();
  $('robotTab').onclick=()=>tab(false);$('epiTab').onclick=()=>tab(true);
  window.resetRobotMission=()=>{clearTimeout(timer);running=false;session=FestivalSession.id;stage=0;route=['S'];trips=[];trainedCount=0;live=null;$('learningEffect').textContent='Поездки дают наблюдения. Модель обновится только после обучения.';$('qualityChange').textContent='6 контрольных поездок проверяют расход и застревание. Их результаты не добавляются в опыт.';drawMap();draw();say('Новый участник. Выбери собственный путь от базы.');};
  window.robotExpedition={publish,get restored(){return restored;},current:()=>({stage,route:[...route],trips:structuredClone(trips),trainedCount,running,model:model(),...results()})};
  restore();drawMap();draw();if(restored){$('learningEffect').textContent=trainedCount?'Опыт и обученная модель восстановлены. Новые измерения можно добавить после следующей поездки.':'Поездки восстановлены. Передай измерения модели, чтобы обучить её.';say('Прогресс восстановлен. Прерванную поездку можно повторить с базы; её измерения сохранены.');}
  if(location.hash==='#epidemic')tab(true);
})();
