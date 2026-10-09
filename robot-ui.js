/* Experiments are player-driven; deliveries are driven by the learned robot. */
(function(){
  'use strict';
  const R=RobotEngine,D=RobotDelivery,$=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
  const svg=(tag,attrs={},text)=>{const e=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;};
  const blank=()=>({rules:D.VERSION,round:0,view:'district',route:['S'],selected:[],trips:[]});
  let s=blank(),session=FestivalSession.id,running=false,timer=null,frame=null,live=null,restored=false,planning=null;
  let best=FestivalSession.read('robotBest');if(!best||best.rules!==D.VERSION||!Number.isInteger(best.stars)||best.stars<0||best.stars>D.MAX_STARS||!Number.isInteger(best.reserve)||best.reserve<0||best.reserve>194)best={rules:D.VERSION,stars:0,reserve:0};
  const map=()=>s.view==='lab'?D.laboratory():D.district(s.round),model=()=>D.model(s.trips),last=()=>s.trips.at(-1);
  const routeName=(r,m=map())=>r.map(id=>id==='S'?'База':(m.orders?.find(o=>o.node===id)?.title||m.nodes[id][2])).join(' → ');
  const delivered=()=>s.trips.some(t=>t.round===s.round&&t.kind==='delivery'&&t.ended);
  const experiments=()=>s.trips.filter(t=>t.round===s.round&&t.kind==='experiment').length;
  const pending=()=>s.trips.filter(t=>t.ended&&!t.taught&&t.steps>0);
  const activeRoute=()=>s.view==='lab'?s.route:(running||delivered())&&last()?.kind==='delivery'?last().route:planning?.route||['S'];
  function save(){FestivalSession.save('robot',s,session);FestivalSession.save('robotBest',best,session);}
  function publish(){const v=D.score(s.trips);window.SessionScore?.robot(Math.floor(Math.max(v.stars,best.stars)*50/D.MAX_STARS),s.trips.filter(t=>t.kind==='delivery'&&t.ended).length===3,s.trips.some(t=>t.taught));}
  function say(text){$('status').textContent=text;}
  function restore(){const old=FestivalSession.read('robot');if(!D.validate(old))return;s=old;restored=true;for(const t of s.trips)if(!t.ended){t.ended=true;t.interrupted=true;}const t=last();if(t&&t.round===s.round&&(t.kind==='experiment')===(s.view==='lab'))live=D.actual(t);}
  function wheelEffect(obs){
    const o=obs.at(-1);if(!o)return 'Перед стартом: чистые сухие колёса.';
    if(o.stalled)return 'Мокрые колёса буксуют на подъёме. Робот застрял.';
    if(o.before.dirty&&!o.after.dirty)return o.type==='water'?'Вода смыла грязь, но колёса намокли.':'Камни счистили грязь с колёс.';
    if(!o.before.dirty&&o.after.dirty)return 'Грязь налипла на колёса. Что изменится дальше?';
    if(o.before.wet&&!o.after.wet)return 'Колёса высохли: влажность 0 из 2.';
    if(o.after.wet>o.before.wet)return 'Колёса намокли: влажность '+o.after.wet+' из 2.';
    if(o.before.dirty)return 'Грязные колёса: расход '+o.energy+' вместо базовых '+R.terrains[o.type].base+'.';
    return R.terrains[o.type].name+': '+o.energy+' заряда за шаг. '+(o.after.wet?'Колёса ещё мокрые.':'Колёса сухие.');
  }
  function drawMap(){
    const m=map();$('missionName').textContent=m.title;
    RobotMap.draw(m,{lab:s.view==='lab',round:s.round,terrains:R.terrains,onRoad:surface,onNode:node});
  }
  function position(o){return RobotMap.position(o);}
  function drawRoute(move=true){
    const m=map(),route=activeRoute(),layer=$('routeLines');layer.replaceChildren();
    if(route.length>1)layer.append(svg('path',{class:'route-plan',d:RobotMap.pathFor(m,route)}));
    $('returnLegend').hidden=s.view==='lab';
    if(s.view==='district'&&s.selected.length){const turn=route.findIndex((_,i)=>s.selected.every(id=>route.slice(0,i+1).includes(id)));if(turn>=0&&turn<route.length-1)layer.append(svg('path',{class:'route-return',d:RobotMap.pathFor(m,route.slice(turn))}));}
    const obs=live?.observations||[];if(obs.length)layer.append(svg('polyline',{class:'route-trail',points:RobotMap.trace(obs)}));
    if(move){const p=position(obs.at(-1));$('robotSprite').setAttribute('transform',`translate(${p[0]} ${p[1]})`);}
    for(const g of $('junctions').children){g.dataset.current=s.view==='lab'&&g.dataset.node===s.route.at(-1);g.dataset.selected=s.view==='district'&&s.selected.includes(g.dataset.node);g.dataset.delivered=s.view==='district'&&s.selected.includes(g.dataset.node)&&obs.some(o=>o.to===g.dataset.node&&o.fraction===1&&!o.stalled);g.setAttribute('aria-disabled',String(running||s.view==='district'&&delivered()));if(map().orders?.some(o=>o.node===g.dataset.node))g.setAttribute('aria-pressed',String(s.selected.includes(g.dataset.node)));}
    const spent=live?.spent||0,w=live?.state||R.fresh();$('remaining').textContent=(m.budget-spent)+' / '+m.budget;$('spent').textContent=spent;$('batteryMeter').max=m.budget;$('batteryMeter').value=m.budget-spent;$('batteryMeter').low=m.budget*.2;$('batteryMeter').high=m.budget*.5;$('batteryMeter').optimum=m.budget;
    $('wheelState').textContent=R.stateName(w);for(const id of ['wheelPicture','robotSprite']){$(id).dataset.dirty=String(w.dirty);$(id).dataset.wet=String(w.wet>0);$(id).dataset.stalled=String(!!live?.stalled);}
    const delivery=s.view==='district'&&last()?.kind==='delivery'&&(running||delivered());$('deliveryProgress').hidden=!delivery;
    if(delivery){const arrived=s.selected.filter(id=>obs.some(o=>o.to===id&&o.fraction===1&&!o.stalled)).length,returned=obs.at(-1)?.to==='S'&&obs.at(-1)?.fraction===1&&!obs.at(-1)?.stalled;
      $('deliveryProgress').textContent='Доставки: '+arrived+' / '+s.selected.length+' · '+(returned&&!running?'На базе':arrived===s.selected.length?'Возвращается на базу':'В пути')+(running?' · звёзды после возврата':'');}
    $('surfaceEffect').textContent=wheelEffect(obs);$('robotSprite').classList.toggle('moving',running);
  }
  function frozen(t){return D.forecast(t.kind==='experiment'?D.laboratory():D.district(t.round),t.route,R.train(t.learned.flatMap(i=>D.measured(s.trips[i]))));}
  function mismatch(t,a){
    const p=frozen(t),i=a.observations.findIndex((o,i)=>{const q=p.observations[i];return !q||q.energy!==o.energy||q.stalled!==o.stalled||q.after.dirty!==o.after.dirty||q.after.wet!==o.after.wet;});
    if(i<0)return 'На пройденной части прогноз совпал с измерениями.';
    const o=a.observations[i],q=p.observations[i];
    return R.terrains[o.type].name+': '+(!q?'робот ожидал остановиться раньше.':o.stalled!==q.stalled?`ожидал ${q.stalled?'застрять':'проехать'}, а ${o.stalled?'застрял':'проехал'}.`:o.energy!==q.energy?'ожидал '+q.energy+' заряда за шаг, потратил '+o.energy+'.':'ожидал колёса «'+R.stateName(q.after)+'», получил «'+R.stateName(o.after)+'».');
  }
  function draw(){
    planning=D.plan(D.district(s.round),s.selected,model());const lab=s.view==='lab',done=delivered(),t=last(),review=!!live&&!!t?.ended,score=D.score(s.trips),left=D.EXPERIMENTS-experiments(),allDone=done&&s.round===2;
    if(score.stars>best.stars||score.stars===best.stars&&score.reserve>best.reserve)best={rules:D.VERSION,stars:score.stars,reserve:score.reserve};
    $('roundLabel').textContent='Выезд '+(s.round+1)+' / 3';$('stars').textContent='★ '+score.stars;$('reserve').textContent='Запас: '+score.reserve;$('experimentCount').textContent='Опыты перед выездом: '+experiments()+' / 2';
    for(const [id,isLab]of [['labView',true],['districtView',false]]){$(id).classList.toggle('active',lab===isLab);$(id).setAttribute('aria-pressed',String(lab===isLab));$(id).disabled=running;}
    $('mapInstruction').textContent=lab?'Нажимай на соседние указатели: выбирай путь опыта. До 6 дорог.':'Выбери груз. ИИ строит весь путь: доставки и возвращение на базу.';
    $('pathOwner').textContent=lab?'Твой опыт':'Решение ИИ';$('routeOwner').textContent=lab?'Путь эксперимента':'Маршрут выбрал ИИ';$('routeText').textContent=activeRoute().length>1?routeName(activeRoute()):lab?'База → выбери соседнюю развилку':s.selected.length?'ИИ не нашёл проезда по своему опыту':'Выбери заказы справа';
    $('ordersPanel').hidden=lab||review||running;$('labPanel').hidden=!lab||review||running;
    const district=D.district(s.round),load=D.cargo(district,s.selected);
    $('orderCards').replaceChildren(...district.orders.map(o=>{const chosen=s.selected.includes(o.id),blocked=!chosen&&load+o.size>D.CAPACITY,b=document.createElement('button');b.className='order-card'+(chosen?' selected':'')+(blocked?' capacity-blocked':'');b.dataset.order=o.id;b.setAttribute('aria-pressed',String(chosen));b.setAttribute('aria-label',o.title+', '+o.size+' места, '+o.stars+' звёзд'+(blocked?', не помещается':''));b.disabled=running||done;b.innerHTML='<strong>'+o.code+'. '+o.title+'</strong><span class="order-check">'+(chosen?'✓':'+')+'</span><small>'+o.size+' '+(o.size===1?'место':'места')+(blocked?' · нет места':'')+'</small><b>'+ '★'.repeat(o.stars)+'</b>';b.onclick=()=>order(o.id);return b;}));
    const packages=district.orders.flatMap((o,i)=>s.selected.includes(o.id)?Array.from({length:o.size},()=>({o,i})):[]);
    $('cargoSlots').replaceChildren(...Array.from({length:D.CAPACITY},(_,i)=>{const slot=document.createElement('span'),item=packages[i];slot.className='cargo-slot'+(item?' filled':'');slot.textContent=item?item.o.code:'·';slot.title=item?item.o.title:'Свободное место';slot.setAttribute('aria-label',slot.title);if(item)slot.dataset.package=item.i;return slot;}));
    $('cargoSummary').textContent='Груз: '+load+' / '+D.CAPACITY+' места';
    $('orderValue').textContent='★ '+D.district(s.round).orders.filter(o=>s.selected.includes(o.id)).reduce((v,o)=>v+o.stars,0);
    $('undo').hidden=$('clearRoute').hidden=!lab||running;$('undo').disabled=$('clearRoute').disabled=running||s.route.length<2;
    $('run').hidden=running||!lab&&done;$('run').disabled=running||(lab?(left<=0||s.route.length<2||done):!planning||done);
    $('run').textContent=lab?left?'Провести опыт · осталось '+left:'Опыты закончились':'Доставить и вернуться';
    $('stop').hidden=!running;$('stop').textContent=t?.kind==='delivery'?'Прервать выезд':'Остановить опыт';$('nextRound').hidden=running||!done||lab;$('nextRound').textContent=allDone?'Сыграть ещё раз ↻':'Следующий район →';
    $('batteryRole').textContent=lab?'полигона':'доставки';
    const f=lab?D.forecast(map(),s.route,model()):planning?.prediction;
    $('forecastCard').hidden=review;$('tripResult').hidden=!review;$('forecastEnergy').textContent=f&&(lab?s.route.length>1:true)?'≈ '+f.spent+' заряда':lab?'Выбери путь опыта':'Пока нет маршрута';
    $('forecastOutcome').textContent=f?.stalled?'По опыту робот ожидает застревание.':f&&f.spent>map().budget?'По оценке ИИ батареи не хватит. Можно рискнуть или изменить задание.':lab?'Здесь ты управляешь маршрутом. Ошибка тоже даёт опыт.':planning?'Оценка всего пути, включая возвращение. Путь выбрал ИИ по своим знаниям.':s.selected.length?'Робот считает пути непроходимыми. Новый опыт может изменить решение.':'Выбери один заказ или несколько.';
    $('forecastConfidence').textContent=!f||lab&&s.route.length<2?'Маршрут ещё не выбран — оценивать точность пока рано.':model().length?'Неизученных шагов в прогнозе: '+f.observations.filter(o=>!o.known).length+'. Прогноз может ошибаться.':'Робот ещё не знает скрытых эффектов покрытий.';
    $('qualitySummary').textContent=model().length+' примеров';$('train').disabled=running||!pending().length;$('train').classList.toggle('primary',pending().length>0&&!running);
    $('newExperience').textContent=pending().length?'Не передано измерений: '+pending().reduce((n,t)=>n+t.steps,0)+'.':'Новых измерений пока нет.';
    $('notebookButton').disabled=running||!s.trips.length;$('restartRobot').disabled=running;
    $('campaignResult').hidden=!allDone||lab;
    if(allDone)$('campaignResult').innerHTML='<strong>Партия: ★ '+score.stars+' / '+D.MAX_STARS+'</strong><span>Запас заряда: '+score.reserve+' · Лучшее: ★ '+best.stars+' / запас '+best.reserve+'</span>';
    if(review){
      const a=D.actual(t),p=frozen(t),v=t.kind==='delivery'?D.outcome(D.district(t.round),t.selected,a,t.interrupted):null;
      $('lastPrediction').textContent=p.spent;$('lastActual').textContent=a.spent;$('resultStars').textContent=v?'★ +'+v.stars:'';$('resultTitle').textContent=v?v.success?'Робот вернулся!' :'Выезд завершён':'Опыт получен';
      $('tripResult').dataset.outcome=v?.success?'success':a.stalled||a.exhausted||t.interrupted?'failure':'experiment';
      $('tripOutcome').textContent=(t.interrupted?'Поездка прервана.':a.stalled?'Робот застрял: мокрые колёса скользят на подъёме.':a.exhausted?'До конца пути не хватило заряда.':'Маршрут пройден.')+(v?' Доставлено '+v.delivered.length+' из '+t.selected.length+'. '+(v.success?'Заработано '+v.stars+' ★.':!v.returned?'Робот не вернулся на базу — 0 ★.':'Не все заказы доставлены — 0 ★.'):' Измерения можно передать роботу.');
      $('mistakeExplanation').textContent=mismatch(t,a);
    }
    drawRoute();save();publish();
  }
  function switchView(view){if(running)return;$('mapToast').hidden=true;s.view=view;live=last()&&last().round===s.round&&(last().kind==='experiment')===(view==='lab')?D.actual(last()):null;drawMap();draw();say(view==='lab'?'Здесь ты выбираешь маршрут опыта. На доставке робот поедет сам.':'Выбирай заказы. Зелёный путь строит ИИ по тому, чему ты его научил.');}
  function order(id){if(running||delivered())return;const m=D.district(s.round),o=m.orders.find(o=>o.id===id);if(!o)return;
    if(!s.selected.includes(id)&&D.cargo(m,s.selected)+o.size>D.CAPACITY){say('Заказ «'+o.title+'» занимает '+o.size+' места. Свободно: '+(D.CAPACITY-D.cargo(m,s.selected))+'. Сними другой заказ, чтобы освободить грузовой отсек.');return;}
    $('mapToast').hidden=true;s.selected=s.selected.includes(id)?s.selected.filter(n=>n!==id):[...s.selected,id];live=null;draw();say('Груз выбран. ИИ спланировал доставки и возвращение. Прогноз зависит от его опыта; вес груза не меняет расход.');}
  function node(id){if(running)return;if(s.view==='district'){if(map().orders.some(o=>o.id===id))order(id);else say('На доставке маршрут выбирает робот. Свой путь можно построить на полигоне.');return;}
    if(delivered()){say('Этот выезд завершён. Перейди к следующему району или начни новую партию.');return;}
    if(id===s.route.at(-1))return;if(s.route.length>=7){say('В одном опыте максимум 6 дорог. Можно отменить последний шаг.');return;}
    if(!R.edgeBetween(map(),s.route.at(-1),id)){say('Нужна дорога между пунктами. Выбирай соседние указатели.');return;}s.route.push(id);live=null;$('mapToast').hidden=true;draw();say('Можно проверить короткий путь или добавить ещё дороги. Каждый опыт расходует одну из двух попыток.');
  }
  function finish(interrupted=false){
    clearTimeout(timer);cancelAnimationFrame(frame);running=false;const t=last();if(!t||t.ended)return;t.ended=true;t.interrupted=interrupted;live=D.actual(t);draw();
    const v=t.kind==='delivery'?D.outcome(D.district(t.round),t.selected,live,t.interrupted):null;
    $('mapToast').textContent=v?.success?'На базе! +'+v.stars+' ★':live.stalled?'Робот застрял':live.exhausted?'Заряда не хватило':interrupted?'Поездка остановлена':'Новый опыт!';$('mapToast').hidden=false;$('mapToast').className=v?.success?'celebrate':'';
    if(v?.success)confetti();say($('tripOutcome').textContent+' '+mismatch(t,live));
  }
  function tick(){
    if(!running)return;const t=last(),m=t.kind==='experiment'?D.laboratory():D.district(t.round),full=D.simulate(m,t.route),o=full.observations[t.steps];
    if(!o){finish();return;}
    const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?12:280,begin=performance.now();
    function animate(now){if(!running)return;const f=Math.min(1,(now-begin)/duration),[x,y]=RobotMap.during(m,o,f);$('robotSprite').setAttribute('transform',`translate(${x} ${y})`);if(f<1){frame=requestAnimationFrame(animate);return;}
      t.steps++;live=D.actual(t);drawRoute();save();say(R.terrains[o.type].name+': −'+o.energy+' заряда. '+wheelEffect(live.observations));if(t.steps>=full.observations.length)finish();else timer=setTimeout(tick,matchMedia('(prefers-reduced-motion: reduce)').matches?0:50);
    }frame=requestAnimationFrame(animate);
  }
  function run(){if($('run').disabled)return;const kind=s.view==='lab'?'experiment':'delivery',route=[...activeRoute()];s.trips.push({kind,round:s.round,route,selected:kind==='delivery'?[...s.selected]:[],learned:s.trips.map((t,i)=>t.taught?i:-1).filter(i=>i>=0),steps:0,taught:false,ended:false,interrupted:false});running=true;live=D.actual(last());$('mapToast').hidden=true;draw();say(kind==='delivery'?'Робот выполняет заказы сам. Прерывание расходует этот выезд.':'Собираем измерения. Обучение — только после нажатия «Передать опыт».');tick();}
  function teach(){if($('train').disabled)return;const before=D.plan(D.district(s.round),s.selected,model());for(const t of pending())t.taught=true;const after=D.plan(D.district(s.round),s.selected,model());
    const changed=before&&after&&before.route.join()!==after.route.join();$('learningEffect').textContent=changed?'После обучения ИИ выбрал другой путь к заказам.':before&&after?'Оценка набора: '+before.energy+' → '+after.energy+' заряда. Опыт сохранён.':'Опыт сохранён. Он повлияет на следующие решения робота.';draw();say('Обучение завершено. '+$('learningEffect').textContent);}
  function next(){if(!delivered()||running)return;if(s.round===2){restart();return;}s.round++;s.selected=[];s.route=['S'];s.view='district';live=null;$('mapToast').hidden=true;drawMap();draw();say('Новый район, новые заказы. Знания робота сохранились. Есть ещё два опыта на полигоне.');}
  function restart(){if(running)return;s=blank();live=null;$('mapToast').hidden=true;$('learningEffect').textContent='Новая партия — новый робот. Твой рекорд сохранён.';drawMap();draw();say('Три новых выезда в одинаковых условиях. Сравни звёзды, затем запас заряда.');}
  function dialog(title,html){$('dialogTitle').textContent=title;$('dialogBody').innerHTML=html;$('robotDialog').showModal();}
  const surfaceFacts={road:'Ровная дорога: уклон 0°. Предел робота на сухих колёсах — 28°.',mud:'Глубина грязи 6 см. Клиренс робота — 8 см. Глубина позволяет проехать; последствия для колёс ещё предстоит проверить.',water:'Глубина воды 12 см. Допустимо до 18 см. После брода состояние колёс может измениться.',gravel:'Камни высотой до 3 см. Клиренс — 8 см. Неровности воздействуют на колёса.',sand:'Рыхлый слой 4 см. Клиренс — 8 см. Проверь, что произойдёт с мокрыми колёсами.',hill:'Уклон 24°. Допустимо до 28° на сухих колёсах. При другом состоянии сцепление может измениться.'};
  function surface(type){const rows=model().filter(o=>o.type===type);dialog(R.terrains[type].name,`<div class="surface-preview ${type}"><svg viewBox="0 0 300 65"><rect width="300" height="65" rx="12" fill="url(#texture-${type})"/></svg></div><p>${surfaceFacts[type]}</p><p><b>Базовый расход: ${R.terrains[type].base} заряда за шаг.</b> Это расход на чистых сухих колёсах. Длина дороги × расход даёт оценку, но состояние колёс может измениться в пути.</p><h3>Что знает твой робот</h3>${rows.length?'<table><tr><th>Колёса до</th><th>Расход</th><th>После</th></tr>'+rows.map(o=>'<tr><td>'+R.stateName(o.before)+'</td><td>'+o.energy+'</td><td>'+(o.stalled?'Застрял':R.stateName(o.after))+'</td></tr>').join('')+'</table>':'<p>Измерений этого покрытия в памяти пока нет.</p>'}`);}
  function help(){dialog('Ты обучаешь — робот доставляет',`<ol><li><b>Выбери заказы.</b> В отсеке 3 места; заказы занимают 1 или 2. Груз не влияет на расход. Звёзды получишь только за все выбранные доставки и возвращение на базу. Заряд в пути не пополняется, даже при проезде через базу.</li><li><b>Проверь свою догадку на полигоне.</b> Перед каждым выездом есть 2 опыта, каждый до 6 дорог и с батареей 36. Сам построй путь и посмотри, как меняются колёса и расход.</li><li><b>Передай опыт роботу.</b> Он учится предсказывать расход, состояние колёс и застревание. По этим знаниям самостоятельно строит маршрут доставки.</li><li><b>Отправь и сравни.</b> Результат покажет, где ожидания не совпали с реальностью. Даже неудачную доставку можно использовать для обучения.</li></ol><p>В партии 3 выезда в разные районы. Соревнуйтесь по звёздам (до 17: 5 + 6 + 6 по районам), при равенстве — по запасу заряда успешных выездов. Одинаковые районы и условия для всех. Таймера нет.</p><p>Прерывание или перезагрузка во время поездки расходует попытку. Полученные измерения сохраняются. Смена вкладки останавливает поездку. Новая партия сбрасывает обучение, лучший результат остаётся.</p>`);}
  function knowledge(){const rows=R.explain(model());dialog('Что выучил робот', '<p>Робот ищет правила по переданным измерениям: расход заряда, грязь, влажность и застревание. Затем сравнивает пути к выбранным заказам и обратно на базу.</p><p>Один опыт может подходить к нескольким правилам. Пока они дают разные ответы, робот использует <b>предположение</b>. Прогноз на карте не является гарантией.</p>'+rows.map(r=>'<section class="trip-entry"><h3>'+R.terrains[r.type].name+' · '+r.examples+' примеров</h3><p>'+(r.examples?(r.ambiguous?'Есть неоднозначность. Текущие предположения: ':'Правила согласуются с измерениями: ')+r.effects.join('; '):'Пока знает только базовый расход; предполагает, что колёса не изменятся и проезд возможен.')+'</p></section>').join(''));}
  function notebook(){dialog('Опыт, на котором учится робот',s.trips.map((t,i)=>{const a=D.actual(t),p=frozen(t);return `<section class="trip-entry"><h3>${i+1}. ${t.kind==='delivery'?'Доставка: '+D.district(t.round).title:'Опыт на полигоне'}</h3><p>${routeName(t.route,t.kind==='experiment'?D.laboratory():D.district(t.round))}</p><p>Ожидал на путь: ${p.spent}. Потратил: ${a.spent}. ${t.taught?'Передано в обучение.':'Ещё не в памяти ИИ.'}</p><p>${mismatch(t,a)}</p><details><summary>Измерения: ${a.observations.length}</summary><table><tr><th>Покрытие</th><th>Колёса до</th><th>Расход</th><th>После</th></tr>${a.observations.map(o=>'<tr><td>'+R.terrains[o.type].name+'</td><td>'+R.stateName(o.before)+'</td><td>'+o.energy+'</td><td>'+(o.stalled?'Застрял':R.stateName(o.after))+'</td></tr>').join('')}</table></details></section>`;}).reverse().join(''));}
  function confetti(){const layer=$('mapParticles');layer.replaceChildren();if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;for(let i=0;i<22;i++)layer.append(svg('path',{d:'m0-5 2 3 4 1-3 3v4l-3-2-4 2 1-4-3-3 4-1z',fill:i%2?'#f7d783':'#92e7b3',transform:`translate(${100+i*39} ${40+i%4*35})`,class:'spark',style:'--delay:'+i*.025+'s'}));}
  function tab(city){if(document.body.classList.contains('city-active')===city)return;if(running)finish(true);$('robotDialog').close();document.body.classList.toggle('city-active',city);$('robotView').hidden=city;$('epiView').hidden=!city;$('robotTutorial').hidden=city;for(const [id,on]of [['robotTab',!city],['epiTab',city]]){$(id).classList.toggle('active',on);$(id).setAttribute('aria-pressed',String(on));}history.replaceState(null,'',city?'#epidemic':location.pathname+location.search);$('epiView').contentWindow?.postMessage(city?'city-active':'pause',location.protocol==='file:'?'*':location.origin);}
  $('labView').onclick=()=>switchView('lab');$('districtView').onclick=()=>switchView('district');$('run').onclick=run;$('stop').onclick=()=>finish(true);$('train').onclick=teach;$('nextRound').onclick=next;$('restartRobot').onclick=restart;
  $('undo').onclick=()=>{if(running||s.route.length<2)return;s.route.pop();live=null;$('mapToast').hidden=true;draw();};$('clearRoute').onclick=()=>{if(running)return;s.route=['S'];live=null;$('mapToast').hidden=true;draw();};
  $('robotTutorial').onclick=$('scoreRules').onclick=help;$('notebookButton').onclick=notebook;$('modelInfo').onclick=knowledge;$('dialogClose').onclick=()=>$('robotDialog').close();$('robotTab').onclick=()=>tab(false);$('epiTab').onclick=()=>tab(true);
  window.resetRobotMission=()=>{clearTimeout(timer);cancelAnimationFrame(frame);running=false;session=FestivalSession.id;best={rules:D.VERSION,stars:0,reserve:0};restart();};
  window.robotExpedition={publish,get restored(){return restored;},current:()=>({...structuredClone(s),stage:s.round,running,model:model(),best:{...best},score:D.score(s.trips),planning:structuredClone(planning)})};
  RobotMap.textures();restore();drawMap();draw();if(restored)say('Партия восстановлена. Прерванный выезд учтён, собранные измерения сохранены.');if(location.hash==='#epidemic')tab(true);
})();
