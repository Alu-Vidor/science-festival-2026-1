/* Experiments are player-driven; deliveries are driven by the learned robot. */
(function(){
  'use strict';
  const R=RobotEngine,D=RobotDelivery,$=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
  const svg=(tag,attrs={},text)=>{const e=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;};
  const blank=()=>({rules:D.VERSION,round:0,view:'district',route:['S'],selected:[],trips:[]});
  let s=blank(),session=FestivalSession.id,running=false,timer=null,frame=null,live=null,restored=false,planning=null;
  let best=FestivalSession.read('robotBest');if(!best||best.rules!==D.VERSION||!Number.isInteger(best.stars)||best.stars<0||best.stars>18||!Number.isInteger(best.reserve)||best.reserve<0||best.reserve>170)best={rules:D.VERSION,stars:0,reserve:0};
  const map=()=>s.view==='lab'?D.laboratory():D.district(s.round),model=()=>D.model(s.trips),last=()=>s.trips.at(-1);
  const routeName=r=>r.map(id=>id==='S'?'База':map().nodes[id][2]).join(' → ');
  const delivered=()=>s.trips.some(t=>t.round===s.round&&t.kind==='delivery'&&t.ended);
  const experiments=()=>s.trips.filter(t=>t.round===s.round&&t.kind==='experiment').length;
  const pending=()=>s.trips.filter(t=>t.ended&&!t.taught&&t.steps>0);
  const activeRoute=()=>s.view==='lab'?s.route:(running||delivered())&&last()?.kind==='delivery'?last().route:planning?.route||['S'];
  function save(){FestivalSession.save('robot',s,session);FestivalSession.save('robotBest',best,session);}
  function publish(){const v=D.score(s.trips);window.SessionScore?.robot(Math.floor(Math.max(v.stars,best.stars)*50/18),s.trips.filter(t=>t.kind==='delivery'&&t.ended).length===3,s.trips.some(t=>t.taught));}
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
    const m=map();$('missionName').textContent=m.title;$('roads').replaceChildren();$('roadLabels').replaceChildren();
    for(const e of m.edges){
      const a=m.nodes[e.a],b=m.nodes[e.b],d=`M${a[0]},${a[1]} L${b[0]},${b[1]}`,group=svg('g',{'data-edge':e.id,class:'road-group',tabindex:0,role:'button','aria-label':R.terrains[e.type].name+', длина '+e.length+'. О покрытии'});
      group.append(svg('path',{d,class:'road-border'}),svg('path',{d,class:'road-surface',stroke:`url(#texture-${e.type})`}));
      group.onclick=()=>surface(e.type);group.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();surface(e.type);}};$('roads').append(group);
      const text=R.terrains[e.type].name+' · '+e.length,w=Math.max(82,text.length*8.4),label=svg('g',{class:'road-label',transform:`translate(${(a[0]+b[0])/2} ${(a[1]+b[1])/2})`});label.append(svg('rect',{x:-w/2,y:-13,width:w,height:26,rx:5}),svg('text',{y:5},text));$('roadLabels').append(label);
    }
    const decor=$('mapDecor');decor.replaceChildren();
    for(const [i,[x,y]]of [[370,120],[407,142],[609,115],[650,141],[380,290],[418,310],[594,287],[630,306],[123,94],[135,331],[868,95],[865,334]].entries()){
      const tree=svg('g',{transform:`translate(${x} ${y})`,class:'scenery',style:'--delay:'+i*-.3+'s'});
      tree.append(svg('ellipse',{cx:0,cy:12,rx:19,ry:7,fill:'#142e29',opacity:'.5'}));
      if(s.view==='district'&&s.round===1)tree.append(svg('path',{d:'M-19 10L-6-13 4-8 10-19 24 10Z',fill:'#829283',stroke:'#355444','stroke-width':2}),svg('path',{d:'M-6-13 4-8 10-19 15-4',fill:'none',stroke:'#b9c5ab','stroke-width':3}));
      else tree.append(svg('path',{d:'M0-27L-17-3H-11L-24 13H24L11-3H17Z',fill:'#52794f',stroke:'#274c38','stroke-width':2}),svg('path',{d:'M0-20L-11-4H-5L-15 7',fill:'none',stroke:'#a1ad6c','stroke-width':2}));decor.append(tree);
    }
    const junctions=$('junctions');junctions.replaceChildren();
    for(const [id,[x,y,title]]of Object.entries(m.nodes)){
      const order=m.orders?.find(o=>o.node===id),g=svg('g',{class:'junction'+(order?' order-node':''),transform:`translate(${x} ${y})`,'data-node':id,tabindex:0,role:'button','aria-label':s.view==='lab'?title+' — добавить в опыт':order?order.title+' — '+order.stars+' звёзд, выбрать заказ':title+' — развилка'});
      g.append(svg('circle',{r:id==='S'||order?27:22}),svg('text',{},id==='S'?'⌂':order?order.icon:title));
      if(id==='S'||order)g.append(svg('text',{class:'node-name',y:46,style:id==='G'?'text-anchor:end':''},id==='S'?'База':order.title+' '+ '★'.repeat(order.stars)));
      g.onclick=()=>node(id);g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();node(id);}};junctions.append(g);
    }
    $('terrainLegend').replaceChildren(...Object.entries(R.terrains).map(([type,t])=>{const b=document.createElement('button');b.className='terrain-key';b.dataset.terrain=type;b.setAttribute('aria-label',t.name+' — свойства');const swatch=svg('svg',{viewBox:'0 0 30 24','aria-hidden':true});swatch.append(svg('rect',{width:30,height:24,fill:`url(#texture-${type})`}));b.append(swatch,document.createTextNode(t.name));b.onclick=()=>surface(type);return b;}));
  }
  function position(o){if(!o)return map().nodes.S;const a=map().nodes[o.from],b=map().nodes[o.to];return [a[0]+(b[0]-a[0])*o.fraction,a[1]+(b[1]-a[1])*o.fraction];}
  function drawRoute(move=true){
    const m=map(),route=activeRoute(),layer=$('routeLines');layer.replaceChildren();
    if(route.length>1)layer.append(svg('polyline',{class:'route-plan',points:route.map(n=>m.nodes[n].slice(0,2).join(',')).join(' ')}));
    const obs=live?.observations||[],points=[m.nodes.S,...obs.map(position)];if(points.length>1)layer.append(svg('polyline',{class:'route-trail',points:points.map(p=>p.slice(0,2).join(',')).join(' ')}));
    if(move){const p=position(obs.at(-1));$('robotSprite').setAttribute('transform',`translate(${p[0]} ${p[1]})`);}
    for(const g of $('junctions').children){g.dataset.current=s.view==='lab'&&g.dataset.node===s.route.at(-1);g.dataset.selected=s.view==='district'&&s.selected.includes(g.dataset.node);g.dataset.delivered=s.view==='district'&&s.selected.includes(g.dataset.node)&&obs.some(o=>o.to===g.dataset.node&&o.fraction===1&&!o.stalled);g.setAttribute('aria-disabled',String(running||s.view==='district'&&delivered()));if(map().orders?.some(o=>o.node===g.dataset.node))g.setAttribute('aria-pressed',String(s.selected.includes(g.dataset.node)));}
    const spent=live?.spent||0,w=live?.state||R.fresh();$('remaining').textContent=(m.budget-spent)+' / '+m.budget;$('spent').textContent=spent;$('batteryMeter').max=m.budget;$('batteryMeter').value=m.budget-spent;$('batteryMeter').low=m.budget*.2;$('batteryMeter').high=m.budget*.5;$('batteryMeter').optimum=m.budget;
    $('wheelState').textContent=R.stateName(w);for(const id of ['wheelPicture','robotSprite']){$(id).dataset.dirty=String(w.dirty);$(id).dataset.wet=String(w.wet>0);$(id).dataset.stalled=String(!!live?.stalled);}
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
    $('mapInstruction').textContent=lab?'Нажимай на соседние кружки: выбирай, что проверить. Максимум 6 дорог.':'Выбери заказы справа. Путь на карте — самостоятельное решение твоего ИИ.';
    $('pathOwner').textContent=lab?'Твой опыт':'Решение ИИ';$('routeOwner').textContent=lab?'Путь эксперимента':'Маршрут выбрал ИИ';$('routeText').textContent=activeRoute().length>1?routeName(activeRoute()):lab?'База → выбери соседнюю развилку':s.selected.length?'ИИ не нашёл проезда по своему опыту':'Выбери заказы справа';
    $('ordersPanel').hidden=lab||review||running;$('labPanel').hidden=!lab||review||running;
    $('orderCards').replaceChildren(...D.district(s.round).orders.map(o=>{const b=document.createElement('button');b.className='order-card'+(s.selected.includes(o.id)?' selected':'');b.dataset.order=o.id;b.setAttribute('aria-pressed',String(s.selected.includes(o.id)));b.disabled=running||done;b.innerHTML='<span class="order-icon">'+o.icon+'</span><span><strong>'+o.title+'</strong><small>Доставка аптечки · пункт '+map().nodes[o.node][2]+'</small></span><b>'+ '★'.repeat(o.stars)+'</b><span class="order-check">'+(s.selected.includes(o.id)?'✓':'+')+'</span>';b.onclick=()=>order(o.id);return b;}));
    $('orderValue').textContent='★ '+D.district(s.round).orders.filter(o=>s.selected.includes(o.id)).reduce((v,o)=>v+o.stars,0);
    $('undo').hidden=$('clearRoute').hidden=!lab||running;$('undo').disabled=$('clearRoute').disabled=running||s.route.length<2;
    $('run').hidden=running||!lab&&done;$('run').disabled=running||(lab?(left<=0||s.route.length<2||done):!planning||done);
    $('run').textContent=lab?left?'Провести опыт · осталось '+left:'Опыты закончились':'Отправить на доставку';
    $('stop').hidden=!running;$('stop').textContent=t?.kind==='delivery'?'Прервать выезд':'Остановить опыт';$('nextRound').hidden=running||!done||lab;$('nextRound').textContent=allDone?'Сыграть ещё раз ↻':'Следующий район →';
    $('batteryRole').textContent=lab?'полигона':'доставки';
    const f=lab?D.forecast(map(),s.route,model()):planning?.prediction;
    $('forecastCard').hidden=review;$('tripResult').hidden=!review;$('forecastEnergy').textContent=f&&(lab?s.route.length>1:true)?'≈ '+f.spent+' заряда':lab?'Выбери путь опыта':'Пока нет маршрута';
    $('forecastOutcome').textContent=f?.stalled?'По опыту робот ожидает застревание.':f&&f.spent>map().budget?'По оценке ИИ батареи не хватит. Можно рискнуть или изменить задание.':lab?'Здесь ты управляешь маршрутом. Ошибка тоже даёт опыт.':planning?'Сам выбрал путь по своим знаниям.':s.selected.length?'Робот считает пути непроходимыми. Новый опыт может изменить решение.':'Выбери один заказ или несколько.';
    $('forecastConfidence').textContent=model().length?'Неизученных шагов в прогнозе: '+(f?.observations.filter(o=>!o.known).length||0)+'. Прогноз может ошибаться.':'Робот ещё не знает скрытых эффектов покрытий.';
    $('qualitySummary').textContent=model().length+' примеров';$('train').disabled=running||!pending().length;$('train').classList.toggle('primary',pending().length>0&&!running);
    $('newExperience').textContent=pending().length?'Не передано измерений: '+pending().reduce((n,t)=>n+t.steps,0)+'.':'Новых измерений пока нет.';
    $('notebookButton').disabled=running||!s.trips.length;$('restartRobot').disabled=running;
    $('campaignResult').hidden=!allDone||lab;
    if(allDone)$('campaignResult').innerHTML='<strong>Партия: ★ '+score.stars+' / 18</strong><span>Запас заряда: '+score.reserve+' · Лучшее: ★ '+best.stars+' / запас '+best.reserve+'</span>';
    if(review){
      const a=D.actual(t),p=frozen(t),v=t.kind==='delivery'?D.outcome(D.district(t.round),t.selected,a,t.interrupted):null;
      $('lastPrediction').textContent=p.spent;$('lastActual').textContent=a.spent;$('resultStars').textContent=v?'★ +'+v.stars:'';$('resultTitle').textContent=v?v.success?'Заказы доставлены!':'Выезд завершён':'Опыт получен';
      $('tripResult').dataset.outcome=v?.success?'success':a.stalled||a.exhausted||t.interrupted?'failure':'experiment';
      $('tripOutcome').textContent=(t.interrupted?'Поездка прервана.':a.stalled?'Робот застрял: мокрые колёса скользят на подъёме.':a.exhausted?'До конца пути не хватило заряда.':'Маршрут пройден.')+(v?' Доставлено '+v.delivered.length+' из '+t.selected.length+'. '+(v.success?'Заработано '+v.stars+' ★.':'За незавершённый набор — 0 ★.'):' Измерения можно передать роботу.');
      $('mistakeExplanation').textContent=mismatch(t,a);
    }
    drawRoute();save();publish();
  }
  function switchView(view){if(running)return;$('mapToast').hidden=true;s.view=view;live=last()&&last().round===s.round&&(last().kind==='experiment')===(view==='lab')?D.actual(last()):null;drawMap();draw();say(view==='lab'?'Здесь ты выбираешь маршрут опыта. На доставке робот поедет сам.':'Выбирай заказы. Зелёный путь строит ИИ по тому, чему ты его научил.');}
  function order(id){if(running||delivered())return;$('mapToast').hidden=true;s.selected=s.selected.includes(id)?s.selected.filter(n=>n!==id):[...s.selected,id];live=null;draw();say('Набор выбран тобой. ИИ сам спланировал путь. Измерения с полигона могут изменить его решение.');}
  function node(id){if(running)return;if(s.view==='district'){if(map().orders.some(o=>o.id===id))order(id);else say('На доставке маршрут выбирает робот. Свой путь можно построить на полигоне.');return;}
    if(delivered()){say('Этот выезд завершён. Перейди к следующему району или начни новую партию.');return;}
    if(id===s.route.at(-1))return;if(s.route.length>=7){say('В одном опыте максимум 6 дорог. Можно отменить последний шаг.');return;}
    if(!R.edgeBetween(map(),s.route.at(-1),id)){say('Нужна дорога между развилками. Добавляй соседние кружки.');return;}s.route.push(id);live=null;$('mapToast').hidden=true;draw();say('Можно проверить короткий путь или добавить ещё дороги. Каждый опыт расходует одну из двух попыток.');
  }
  function finish(interrupted=false){
    clearTimeout(timer);cancelAnimationFrame(frame);running=false;const t=last();if(!t||t.ended)return;t.ended=true;t.interrupted=interrupted;live=D.actual(t);draw();
    const v=t.kind==='delivery'?D.outcome(D.district(t.round),t.selected,live,t.interrupted):null;
    $('mapToast').textContent=v?.success?'Доставлено! +'+v.stars+' ★':live.stalled?'Робот застрял':live.exhausted?'Заряда не хватило':interrupted?'Поездка остановлена':'Новый опыт!';$('mapToast').hidden=false;$('mapToast').className=v?.success?'celebrate':'';
    if(v?.success)confetti();say($('tripOutcome').textContent+' '+mismatch(t,live));
  }
  function tick(){
    if(!running)return;const t=last(),m=t.kind==='experiment'?D.laboratory():D.district(t.round),full=D.simulate(m,t.route),o=full.observations[t.steps];
    if(!o){finish();return;}
    const start=position(live?.observations.at(-1)),end=position(o),duration=matchMedia('(prefers-reduced-motion: reduce)').matches?12:280,begin=performance.now();
    function animate(now){if(!running)return;const f=Math.min(1,(now-begin)/duration),x=start[0]+(end[0]-start[0])*f,y=start[1]+(end[1]-start[1])*f;$('robotSprite').setAttribute('transform',`translate(${x} ${y})`);if(f<1){frame=requestAnimationFrame(animate);return;}
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
  function help(){dialog('Ты обучаешь — робот доставляет',`<ol><li><b>Выбери заказы.</b> Один или несколько: больше звёзд, но выше риск. Звёзды за набор начисляются только при выполнении всех выбранных заказов.</li><li><b>Проверь свою догадку на полигоне.</b> Перед каждым выездом есть 2 опыта, каждый до 6 дорог и с батареей 36. Сам построй путь и посмотри, как меняются колёса и расход.</li><li><b>Передай опыт роботу.</b> Он учится предсказывать расход, состояние колёс и застревание. По этим знаниям самостоятельно строит маршрут доставки.</li><li><b>Отправь и сравни.</b> Результат покажет, где ожидания не совпали с реальностью. Даже неудачную доставку можно использовать для обучения.</li></ol><p>В партии 3 выезда в разные районы. Соревнуйтесь по звёздам (до 18), при равенстве — по запасу заряда успешных выездов. Одинаковые районы и условия для всех. Таймера нет.</p><p>Прерывание или перезагрузка во время поездки расходует попытку. Полученные измерения сохраняются. Смена вкладки останавливает поездку. Новая партия сбрасывает обучение, лучший результат остаётся.</p>`);}
  function notebook(){dialog('Опыт, на котором учится робот',s.trips.map((t,i)=>{const a=D.actual(t),p=frozen(t);return `<section class="trip-entry"><h3>${i+1}. ${t.kind==='delivery'?'Доставка: '+D.district(t.round).title:'Опыт на полигоне'}</h3><p>${routeName(t.route)}</p><p>Ожидал на путь: ${p.spent}. Потратил: ${a.spent}. ${t.taught?'Передано в обучение.':'Ещё не в памяти ИИ.'}</p><p>${mismatch(t,a)}</p><details><summary>Измерения: ${a.observations.length}</summary><table><tr><th>Покрытие</th><th>Колёса до</th><th>Расход</th><th>После</th></tr>${a.observations.map(o=>'<tr><td>'+R.terrains[o.type].name+'</td><td>'+R.stateName(o.before)+'</td><td>'+o.energy+'</td><td>'+(o.stalled?'Застрял':R.stateName(o.after))+'</td></tr>').join('')}</table></details></section>`;}).reverse().join(''));}
  function confetti(){const layer=$('mapParticles');layer.replaceChildren();if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;for(let i=0;i<22;i++)layer.append(svg('path',{d:'m0-5 2 3 4 1-3 3v4l-3-2-4 2 1-4-3-3 4-1z',fill:i%2?'#f7d783':'#92e7b3',transform:`translate(${100+i*39} ${40+i%4*35})`,class:'spark',style:'--delay:'+i*.025+'s'}));}
  function tab(city){if(running)finish(true);$('robotDialog').close();document.body.classList.toggle('city-active',city);$('robotView').hidden=city;$('epiView').hidden=!city;$('robotTutorial').hidden=city;for(const [id,on]of [['robotTab',!city],['epiTab',city]]){$(id).classList.toggle('active',on);$(id).setAttribute('aria-pressed',String(on));}history.replaceState(null,'',city?'#epidemic':location.pathname+location.search);$('epiView').contentWindow?.postMessage(city?'city-active':'pause',location.protocol==='file:'?'*':location.origin);}
  $('labView').onclick=()=>switchView('lab');$('districtView').onclick=()=>switchView('district');$('run').onclick=run;$('stop').onclick=()=>finish(true);$('train').onclick=teach;$('nextRound').onclick=next;$('restartRobot').onclick=restart;
  $('undo').onclick=()=>{if(running||s.route.length<2)return;s.route.pop();live=null;$('mapToast').hidden=true;draw();};$('clearRoute').onclick=()=>{if(running)return;s.route=['S'];live=null;$('mapToast').hidden=true;draw();};
  $('robotTutorial').onclick=$('scoreRules').onclick=help;$('notebookButton').onclick=notebook;$('dialogClose').onclick=()=>$('robotDialog').close();$('robotTab').onclick=()=>tab(false);$('epiTab').onclick=()=>tab(true);
  window.resetRobotMission=()=>{clearTimeout(timer);cancelAnimationFrame(frame);running=false;session=FestivalSession.id;best={rules:D.VERSION,stars:0,reserve:0};restart();};
  window.robotExpedition={publish,get restored(){return restored;},current:()=>({...structuredClone(s),stage:s.round,running,model:model(),best:{...best},score:D.score(s.trips),planning:structuredClone(planning)})};
  restore();drawMap();draw();if(restored)say('Партия восстановлена. Прерванный выезд учтён, собранные измерения сохранены.');if(location.hash==='#epidemic')tab(true);
})();
