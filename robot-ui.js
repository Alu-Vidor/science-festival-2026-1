/* Examples train the model; the model alone plans the complete delivery. */
'use strict';
const $=id=>document.getElementById(id), R=RobotEngine, N=12;
let grid=[],start=0,robot=0,selected=-1,raining=false,samples=[],model=[],overlay=false,running=false,timer=null;
let path=[],trail=[],targets=new Set(),delivered=0,steps=0,spent=0,remaining=240,stage=0,mission,benchmark,preview=null;
let best=Array(4).fill(null),checks=new Map(),placingStart=false,stuckCell=-1;
const features=i=>R.features(grid[i],raining), danger=f=>R.danger(f), key=f=>f.join(',');
const say=text=>$('status').textContent=text;
const learned=()=>model.some(s=>s.y===0)&&model.some(s=>s.y===1);
const parcelIndices=()=>grid.flatMap((c,i)=>c.object==='parcel'?[i]:[]);
const letter=i=>grid[i].parcel;
function publish(){window.SessionScore?.robot(best.reduce((sum,r)=>sum+(r?.score||0),0),best.slice(1).every(r=>r?.complete),learned());}
function currentMission(){return {...mission,grid,start,rain:raining};}
function recalculate(){
 benchmark=R.optimum(currentMission());preview=model.length?R.plan(currentMission(),model):null;
 const order=preview?[...new Set(preview.path.filter(i=>grid[i].object==='parcel'))].map(letter).join(' → '):'';
 $('autoRoute').textContent=preview?`План доставки: ${order} · ${preview.energy} энергии.`:model.length?'Маршрута пока нет: ИИ не узнаёт часть грунта. Разные примеры помогают открыть проезд.':'ИИ построит маршрут по твоим примерам.';
}
function updateTask(){
 $('taskTitle').textContent=stage===0?'Полигон: подготовь робота к доставке':'Цель — доставить 3 аптечки спасателям';
 $('taskHint').textContent=stage===0?'Примеры проезда и опасности учат робота узнавать новый грунт. В экспедициях он сам доставит аптечки. Не нужно размечать каждую клетку.':'Успех — аптечки A, B и C доставлены без застревания. Меньше энергии — больше баллов. Робот использует твои примеры с полигона.';
 $('run').textContent=stage===0?'▶ Проверить доставку':'▶ Доставить аптечки';
 $('run').title=!learned()?'Для тестовой доставки модели нужны примеры «Можно» и «Нельзя».':'Робот сам выбирает маршрут по обученной модели.';
}
function terrainLegend(){
 const legend=$('terrainLegend');legend.replaceChildren();
 Object.entries(R.names).forEach(([type,name])=>{
  const b=document.createElement('div');b.className='terrain-key';b.dataset.terrain=type;
  b.innerHTML=`<span class="terrain-swatch ${type}" aria-hidden="true"></span><span>${name}<small>${R.costs[type]} эн. / шаг</small></span>`;
  legend.appendChild(b);
 });
}
function controls(){
 const nav=$('expeditionNav');nav.replaceChildren();
 R.ids.forEach((id,i)=>{const b=document.createElement('button');b.id='expedition-'+id;b.textContent=(i?i+'. ':'')+R.create(id).title+(best[i]?.complete?' ✓':'');b.setAttribute('aria-current',stage===i?'step':'false');b.disabled=running||(i===1?!learned():i>1&&!best[i-1]?.complete);b.onclick=()=>loadStage(i);nav.appendChild(b);});
 $('missionName').textContent=mission.title.toUpperCase();$('missionBrief').textContent=mission.brief;
 $('nextMission').hidden=stage===3;$('nextMission').disabled=running||(stage===0?!learned():!best[stage]?.complete);
 $('nextMission').textContent=stage===0?'К спасательной миссии →':'Следующая миссия →';
 $('deliveryTries').textContent=stage===0?'Полигон без баллов · пробная доставка · ошибки бесплатны':`3 аптечки · минимум ${benchmark.energy} энергии. Лучший: ${best[stage]?.score||0}/${mission.max}`;
 $('run').disabled=running||!learned();$('stop').disabled=!running;
 for(const id of ['moveStart','predict','clear','robotTutorial','newParticipant'])$(id).disabled=running;
 $('boardStage').classList.toggle('rolling',running);$('moveStart').setAttribute('aria-pressed',placingStart);
 updateTask();
 publish();
}
function initial(){
 clearTimeout(timer);running=false;mission=R.create(R.ids[stage]);grid=mission.grid;start=robot=mission.start;raining=mission.rain;
 selected=stuckCell=-1;placingStart=false;path=[];trail=[];spent=delivered=steps=0;remaining=mission.budget;targets=new Set(parcelIndices());checks=new Map();
 $('weather').textContent=raining?'После дождя · влажность +25':'Без осадков';$('boardStage').classList.toggle('rainy',raining);
 recalculate();terrainLegend();draw();inspect();updateLearning();controls();say(mission.brief);
}
function loadStage(index){if(running||index<0||index>3||index===1&&!learned()||index>1&&!best[index-1]?.complete)return;stage=index;initial();}
function moveSprite(){const w=$('board').getBoundingClientRect().width,cell=(w-33)/12,sp=$('robotSprite');sp.style.width=sp.style.height=cell+'px';sp.style.transform=`translate(${robot%N*(cell+3)}px,${(robot/N|0)*(cell+3)}px)`;}
function draw(){
 const frag=document.createDocumentFragment();
 grid.forEach((c,i)=>{
  const b=document.createElement('button');b.className='cell '+c.type+(selected===i?' selected':'')+(i===stuckCell?' stuck':'')+(path.includes(i)||trail.includes(i)?' path':'');
  b.dataset.index=i;let text=c.object==='parcel'&&targets.has(i)?'📦':'';
  if(!running&&!trail.length&&preview?.path.includes(i))b.classList.add('planned');
  if(c.object==='parcel'){b.dataset.parcel=letter(i);b.dataset.visibleObject=targets.has(i)?'parcel':'';}
  if(i===start)b.classList.add('launch-position');
  const sample=samples.find(s=>key(s.f)===key(features(i)));if(sample)b.dataset.label=sample.y?'unsafe':'safe';
  let title=`${(i/N|0)+1}:${i%N+1} · ${R.names[c.type]||'Стена'}`;
  if(c.object==='parcel')title+=' · аптечка '+letter(i);
  if(overlay&&c.type!=='wall'){
   const answer=R.predict(model,features(i));b.classList.add(answer===null?'unknown':answer?'bad':'good');
   b.dataset.prediction=answer===null?'unknown':answer?'unsafe':'safe';title+=' · ИИ: '+(answer===null?'не знает':answer?'нельзя':'можно');
  }
  b.textContent=text;b.title=title;b.setAttribute('aria-label',title);b.onclick=()=>select(i);frag.appendChild(b);
 });
 $('board').replaceChildren(frag);$('delivered').textContent=delivered+' / '+parcelIndices().length;$('remaining').textContent=remaining;$('steps').textContent=steps;
 $('predict').textContent=overlay?'Скрыть решения ИИ':'Показать решения ИИ';$('predict').setAttribute('aria-pressed',overlay);
 $('predictionLegend').hidden=!overlay;moveSprite();
}
function select(i){
 if(running)return;
 if(placingStart){
  if(grid[i].type==='wall'||grid[i].object){say('Для старта выбери свободный участок без груза.');return;}
  if(danger(features(i))){selected=i;checks.set(key(features(i)),true);inspect();draw();say('Этот грунт не выдержит робота. Выбери безопасный старт.');return;}
  if(!R.optimum({...currentMission(),start:i})){say('Отсюда нет безопасного пути ко всем грузам.');return;}
  start=robot=i;placingStart=false;spent=steps=delivered=0;remaining=mission.budget;targets=new Set(parcelIndices());trail=[];path=[];stuckCell=-1;
  recalculate();controls();say('Старт перенесён. ИИ пересчитал порядок грузов и путь; минимум энергии тоже обновлён.');
 }
 selected=i;inspect();draw();window.GameTour?.signal('robot:inspected',{index:i});
}
function inspect(){
 const valid=selected>=0&&grid[selected].type!=='wall';
 for(const id of ['probe','safe','unsafe'])$(id).disabled=running||!valid;
 if(!valid){$('selectedName').textContent='Нажми на участок карты';$('sensorHint').textContent='Проверка грунта даст ответ для твоего примера. ИИ его ещё не знает.';}
 else{
  $('selectedName').textContent=`${R.names[grid[selected].type]} · ${(selected/N|0)+1}:${selected%N+1}`;
  const result=checks.get(key(features(selected))), f=features(selected);
  const reasons=[];if(f[0]>=70)reasons.push('слишком влажно');if(f[1]>=70)reasons.push('крутой склон');if(f[0]+f[2]>=110)reasons.push('влажность + неровность');if(f[3]<=30)reasons.push('слабый грунт');
  $('sensorHint').textContent=result===undefined?'Сравни датчики. «Проверить» покажет, выдержит ли грунт робота.':result?'Проверка: нельзя — '+reasons.join(', ')+'.':'Проверка: можно проехать. Добавь метку «Можно».';
 }
 for(const [j,id]of ['wet','slope','rough','bearing'].entries()){$(id).textContent=valid?features(selected)[j]+'%':'—';$(id+'Meter').value=valid?features(selected)[j]:0;}
 explainSelected();
 updateTask();
}
function probe(){if(selected<0||grid[selected].type==='wall'||running)return;checks.set(key(features(selected)),danger(features(selected)));inspect();window.GameTour?.signal('robot:probed',{index:selected});}
function explainSelected(){
 const box=$('predictionReason');box.replaceChildren();const p=document.createElement('p');box.appendChild(p);
 if(selected<0||grid[selected].type==='wall'){p.textContent='Выбери клетку: здесь появится решение ИИ и примеры, на которые он опирается.';return;}
 const answer=R.explain(model,features(selected));p.textContent='ИИ: '+(answer.label===null?'не уверен':answer.label?'проезд запрещён':'проезд разрешён')+'. '+answer.reason+'.';
 answer.near.forEach(s=>{const e=document.createElement('p');e.textContent=(R.names[s.type]||'Участок')+' · твоя метка: '+(s.y?'нельзя':'можно')+' · датчики '+s.f.join(' / ');box.appendChild(e);});
}
function updateLearning(){
 const trained=new Set(model.map(s=>key(s.f)+':'+s.y)), pending=samples.filter(s=>!trained.has(key(s.f)+':'+s.y)).length;
 const wrong=samples.filter(s=>checks.has(key(s.f))&&+checks.get(key(s.f))!==s.y).length;
 $('samples').textContent=`Примеры: ${samples.length}`+(pending?` · новых: ${pending}`:'')+(wrong?` · расхождений с проверкой: ${wrong}`:'');
 $('train').disabled=running||!samples.some(s=>s.y===0)||!samples.some(s=>s.y===1);
 $('model').textContent=!model.length?'Дай роботу пример проезда и пример опасности, затем обучи.':pending?'Новые метки ещё не в модели. Нажми «Обучить».':preview?'ИИ построил доставку. Испытай её: его решения могут быть ошибочными.':'ИИ не узнаёт часть грунта. Доставка пока недоступна.';
 const types=Object.keys(R.names),coverage=$('coverage');coverage.replaceChildren();
 types.forEach(type=>{
  const seen=new Set(samples.filter(s=>s.type===type).map(s=>s.y)),b=document.createElement('button');
  b.dataset.coverage=type;b.textContent=R.icons[type]+' '+R.names[type]+' · '+(seen.has(0)?'✓':'·')+' '+(seen.has(1)?'✕':'·');
  b.title='Найти пример: '+R.names[type];b.onclick=()=>{const cells=grid.flatMap((c,i)=>c.type===type?[i]:[]);const i=cells.find(i=>!samples.some(s=>key(s.f)===key(features(i))));if(i!==undefined){$('learningNotebook').open=false;document.querySelector('.monitor-dialog[open]')?.close();select(i);}else say('Все варианты этого покрытия на карте уже размечены. Можно изменить любую метку.');};coverage.appendChild(b);
 });
 const journal=$('exampleJournal');journal.replaceChildren();samples.forEach((s,i)=>{const p=document.createElement('p');p.textContent=`${i+1}. ${R.names[s.type]}: ${s.y?'нельзя':'можно'} · ${s.f.join(' / ')} · ${trained.has(key(s.f)+':'+s.y)?'в модели':'ждёт обучения'}`;journal.appendChild(p);});
 $('notebookSummary').textContent='Примеры и решения ИИ · '+samples.length;explainSelected();updateTask();
}
function label(y){
 if(running||selected<0||grid[selected].type==='wall')return;
 const sample={f:features(selected),y,type:grid[selected].type},old=samples.findIndex(s=>key(s.f)===key(sample.f));
 if(old<0)samples.push(sample);else samples[old]=sample;
 updateLearning();draw();window.GameTour?.signal('robot:labeled',{index:selected,label:y});
}
function train(){model=samples.map(s=>({...s,f:[...s.f]}));overlay=true;recalculate();draw();updateLearning();controls();say('ИИ обновил решения по твоим примерам. Зелёный — можно, красный — нельзя, ? — не знает.');window.GameTour?.signal('robot:trained');}
function stop(message=true){clearTimeout(timer);running=false;controls();inspect();updateLearning();if(message)say('Робот остановлен. Можно проверить грунт, исправить метки и повторить.');}
function run(){
 if(running||!learned())return;placingStart=false;robot=start;remaining=mission.budget;delivered=steps=spent=0;trail=[];path=[];stuckCell=-1;targets=new Set(parcelIndices());
 recalculate();running=true;controls();inspect();updateLearning();
 const route=preview;path=route?[...route.path]:[];
 function finish(message){
  const complete=!targets.size;running=false;clearTimeout(timer);
  if(stage){const result={score:R.score({max:mission.max,delivered,parcels:parcelIndices().length,energy:spent,optimal:benchmark.energy,complete}),complete,energy:spent,start};if(!best[stage]||result.score>best[stage].score||result.score===best[stage].score&&result.energy<best[stage].energy)best[stage]=result;
   message+=` Результат: ${result.score}/${mission.max}. `+(complete&&spent===benchmark.energy?'Минимум энергии найден!':complete?'ИИ сделал лишний обход. Проверь участки, которые он считает опасными.':'Добавь примеры и попробуй снова.');
  }else message+=' Учебный запуск — без баллов.';
  path=[];draw();inspect();controls();updateLearning();say(message);window.GameTour?.signal('robot:finished',{delivered,useAI:true});
 }
 function tick(){
  if(!running)return;
  if(!route){selected=benchmark.path.find(i=>R.predict(model,features(i))!==0)??start;finish('ИИ не нашёл путь. Выделен участок для проверки и нового примера.');return;}
  const next=path.shift();if(next===undefined){finish('Доставка завершена.');return;}
  const cost=R.costs[grid[next].type];if(remaining<cost){finish('Энергия закончилась. ИИ выбрал слишком длинный обход.');return;}
  robot=next;remaining-=cost;spent+=cost;steps++;trail.push(next);
  if(danger(features(next))){selected=stuckCell=next;checks.set(key(features(next)),true);finish('Робот застрял: ИИ разрешил опасный участок.');return;}
  if(targets.has(next)){targets.delete(next);delivered++;}draw();
  if(!targets.size){finish(`Доставлены все ${delivered} груза.`);return;}
  timer=setTimeout(tick,window.matchMedia('(prefers-reduced-motion: reduce)').matches?20:160);
 }
 draw();say('Робот сам выполняет выбранную ИИ доставку…');window.GameTour?.signal('robot:started');timer=setTimeout(tick,350);
}
$('safe').onclick=()=>label(0);$('unsafe').onclick=()=>label(1);$('probe').onclick=probe;$('train').onclick=train;
$('clear').onclick=()=>{samples=[];model=[];overlay=false;recalculate();draw();updateLearning();controls();};
$('predict').onclick=()=>{overlay=!overlay;draw();say(overlay?'Рамки — решения модели: зелёный можно, красный нельзя, ? нужен похожий пример. Они могут быть ошибочными.':'Решения ИИ скрыты. Робот продолжает использовать обученную модель.');window.GameTour?.signal('robot:prediction');};
$('moveStart').onclick=()=>{placingStart=!placingStart;controls();say(placingStart?'Нажми на свободную безопасную клетку — это будет новый старт робота.':'Перенос старта отменён.');};
$('run').onclick=run;$('stop').onclick=()=>stop();$('nextMission').onclick=()=>loadStage(stage+1);
$('robotZoom').onclick=()=>{const on=$('boardStage').classList.toggle('enlarged');$('robotZoom').setAttribute('aria-pressed',on);$('robotZoom').textContent=on?'− Обычные клетки':'＋ Крупнее клетки';moveSprite();};
window.resetRobotMission=()=>{stop(false);stage=0;best=Array(4).fill(null);samples=[];model=[];overlay=false;initial();};
window.robotLesson={begin(){stop(false);stage=0;initial();return true;}};
window.robotExpedition={current:()=>({stage,id:mission.id,start,spent,best:best.map(r=>r&&({...r})),optimal:benchmark.energy}),load:loadStage};
function switchLab(epi){stop(false);document.body.classList.toggle('city-active',epi);$('robotView').style.display=epi?'none':'';$('epiView').style.display=epi?'block':'none';for(const [id,on]of [['robotTab',!epi],['epiTab',epi]]){$(id).classList.toggle('active',on);$(id).setAttribute('aria-pressed',on);}if(epi)$('epiView').contentWindow.postMessage('city-active','*');else{$('epiView').contentWindow.postMessage('pause','*');window.GameTour?.maybeStart('robot');}location.hash=epi?'epidemic':'robot';}
$('robotTab').onclick=()=>switchLab(false);$('epiTab').onclick=()=>switchLab(true);
window.addEventListener('message',e=>{if(e.source===$('epiView').contentWindow&&e.data?.kind==='epidemic-height'&&Number.isFinite(e.data.height))$('epiView').style.height=Math.max(600,Math.min(10000,e.data.height))+'px';});
new ResizeObserver(moveSprite).observe($('board'));
initial();if(location.hash==='#epidemic')setTimeout(()=>switchLab(true),0);
