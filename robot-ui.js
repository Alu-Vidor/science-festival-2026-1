/* The learner makes a hypothesis; verified examples teach autonomous rescue delivery. */
'use strict';
const $=id=>document.getElementById(id), R=RobotEngine, N=12;
let grid=[],start=0,robot=0,selected=-1,raining=false,samples=[],model=[],overlay=false,running=false,timer=null;
let path=[],trail=[],targets=new Set(),delivered=0,steps=0,spent=0,remaining=240,stage=0,mission,benchmark,preview=null;
let best=Array(4).fill(null),checks=new Map(),guesses=new Map(),stuckCell=-1,trainingPassed=false,learningEffect='';
let robotSession=window.FestivalSession?.id;let restoring=true,restoredRobot=false;
const features=i=>R.features(grid[i],raining), danger=f=>R.danger(f), key=f=>f.join(',');
const say=text=>$('status').textContent=text;
const learned=()=>model.some(s=>s.y===0)&&model.some(s=>s.y===1);
const campIndices=()=>grid.flatMap((c,i)=>c.object==='camp'?[i]:[]);
const letter=i=>grid[i].camp;
const pendingExamples=()=>samples.filter(s=>!model.some(m=>key(m.f)===key(s.f)&&m.y===s.y)).length;
function persist(){if(!restoring)window.FestivalSession?.save('robot',{stage,samples,model,best,trainingPassed,trip:{trail,selected,checks:[...checks],guesses:[...guesses]}},robotSession);}
function publish(){persist();window.SessionScore?.robot(best.reduce((sum,r)=>sum+(r?.score||0),0),best.slice(1).every(r=>r?.complete),trainingPassed);}
function currentMission(){return {...mission,grid,start,rain:raining};}
function recalculate(){
 benchmark=R.optimum(currentMission());preview=model.length?R.plan(currentMission(),model):null;
 updateRouteInfo();
}
function updateRouteInfo(){
 if(running){$('autoRoute').textContent=`Рейс идёт: помощь получили ${delivered} из ${mission.cargo} лагерей. Жёлтый след — уже пройденный путь.`;return;}
 if(trail.length){$('autoRoute').textContent=`Пройденный путь — жёлтый. Потрачено ${spent} энергии. Повторный рейс начнётся с базы с тремя аптечками.`;return;}
 const order=preview?[...new Set(preview.path.filter(i=>grid[i].object==='camp'))].map(letter).join(' → '):'';
 $('autoRoute').textContent=preview?`Робот выбрал путь: база → ${order}. Расход: ${preview.energy} энергии.`:model.length?'Пути ко всем лагерям пока нет: робот не узнаёт часть грунта. Разные проверенные примеры расширяют его опыт.':'Робот выберет путь после обучения на примерах проезда и опасности.';
}
function updateTask(){
 const complete=delivered===mission.cargo&&!running;
 $('missionTask').dataset.state=complete?'complete':running?'running':'preparing';
 $('taskTitle').textContent=complete?'Победа! Все три лагеря получили помощь':stage===0?'Первый рейс: помоги трём учебным лагерям':'Довези аптечки в три лагеря спасателей';
 $('taskHint').textContent=stage===0?'У робота три аптечки. Научи его отличать проезд от опасности и выполни пробный рейс. Обучение завершено, когда все лагеря получили помощь.':'Робот выезжает с тремя аптечками: по одной для A, B и C. Победа — помощь всем лагерям без застревания. Экономия батареи даёт дополнительные баллы.';
 if(complete)$('taskHint').textContent=stage===0?'Твой робот сам доставил все аптечки. Учебный рейс пройден — он без баллов. Впереди три спасательные экспедиции.':`Твой робот сам доставил все аптечки. За этот рейс: ${R.score({max:mission.max,delivered,camps:mission.cargo,energy:spent,optimal:benchmark.energy,complete:true})} / ${mission.max} баллов. Лучший результат сохраняется.`;
 $('run').textContent=trail.length?'↻ Повторить рейс':stage===0?'▶ Пробный рейс':'▶ Отвезти аптечки';
 $('run').title=pendingExamples()?'Сначала передай новые примеры роботу кнопкой «Обучить робота».':!preview?'Для пути к лагерям нужны проверенные примеры разных покрытий.':trail.length?'Робот начнёт новый рейс с базы с тремя аптечками.':'Робот сам поедет по синей линии.';
}
function terrainLegend(){
 const legend=$('terrainLegend');legend.replaceChildren();
 const present=new Set(grid.map(cell=>cell.type));
 Object.entries(R.names).filter(([type])=>present.has(type)).forEach(([type,name])=>{
  const b=document.createElement('div');b.className='terrain-key';b.dataset.terrain=type;
  b.innerHTML=`<span class="terrain-swatch ${type}" aria-hidden="true"></span><span>${name}<small>${R.costs[type]} / шаг</small></span>`;legend.appendChild(b);
 });
}
function controls(){
 const nav=$('expeditionNav');nav.replaceChildren();
 R.ids.forEach((id,i)=>{const b=document.createElement('button');b.id='expedition-'+id;b.textContent=(i?i+'. ':'')+R.create(id).title+(best[i]?.complete?' ✓':'');b.setAttribute('aria-current',stage===i?'step':'false');b.disabled=running||(i===1?!trainingPassed:i>1&&!best[i-1]?.complete);b.onclick=()=>loadStage(i);nav.appendChild(b);});
 $('missionName').textContent=mission.title.toUpperCase();$('missionBrief').textContent=mission.brief;
 $('nextMission').hidden=stage===3;$('nextMission').disabled=running||(stage===0?!trainingPassed:!best[stage]?.complete);
 $('nextMission').textContent=stage===0?'В лес к спасателям →':'Следующая экспедиция →';
 $('deliveryTries').textContent=stage===0?(trainingPassed?'Пробный рейс выполнен ✓':'Учебный рейс без баллов. Задача — помощь трём лагерям.'):`Лучший результат: ${best[stage]?.score||0} / ${mission.max}. Главная цель — все три лагеря.`;
 $('robotBenchmark').textContent=`Бонус за экономию: безопасный минимум — ${benchmark.energy} энергии. Максимум экспедиции — ${mission.max} баллов.`;
 $('run').disabled=running||!learned()||!preview||pendingExamples()>0;$('stop').disabled=!running;
 for(const id of ['predict','clear','robotTutorial','newParticipant'])$(id).disabled=running;
 $('boardStage').classList.toggle('rolling',running);updateTask();publish();
}
function initial(){
 clearTimeout(timer);running=false;mission=R.create(R.ids[stage]);grid=mission.grid;start=robot=mission.start;raining=mission.rain;
 selected=stuckCell=-1;path=[];trail=[];spent=delivered=steps=0;remaining=mission.budget;targets=new Set(campIndices());checks=new Map();guesses=new Map();learningEffect='';
 $('weather').textContent=raining?'После дождя · грунт мокрее':'Сухая погода';$('boardStage').classList.toggle('rainy',raining);
 recalculate();terrainLegend();draw();inspect();updateLearning();controls();say(mission.brief);
}
function loadStage(index){if(running||index<0||index>3||index===1&&!trainingPassed||index>1&&!best[index-1]?.complete)return;stage=index;initial();}
function moveSprite(){
 const w=$('board').getBoundingClientRect().width;if(w<=33)return;const cell=(w-33)/12,sp=$('robotSprite');sp.style.width=sp.style.height=cell+'px';sp.style.transform=`translate(${robot%N*(cell+3)}px,${(robot/N|0)*(cell+3)}px)`;
 const svg=$('routeLayer');svg.setAttribute('viewBox',`0 0 ${w} ${w}`);
 const points=indices=>indices.map(i=>`${i%N*(cell+3)+cell/2},${(i/N|0)*(cell+3)+cell/2}`).join(' ');
 const planned=running?[robot,...path]:trail.length?[]:preview?[start,...preview.path]:[];
 $('routePlan').setAttribute('points',points(planned));$('routeTravelled').setAttribute('points',points(trail.length?[start,...trail]:[]));
}
function draw(){
 const frag=document.createDocumentFragment();
 grid.forEach((c,i)=>{
  const b=document.createElement('button');b.className='cell '+c.type+(selected===i?' selected':'')+(i===stuckCell?' stuck':'');b.dataset.index=i;
  let title=`Ряд ${(i/N|0)+1}, клетка ${i%N+1}: ${R.names[c.type]||'Преграда'}`;
  if(c.object==='camp'){
   b.dataset.camp=letter(i);b.dataset.served=String(!targets.has(i));
   b.innerHTML=`<img class="camp-art" src="assets/camp.svg" alt=""><span class="camp-letter">${letter(i)}</span>`;
   title+=` · Лагерь ${letter(i)}: `+(targets.has(i)?'ждёт аптечку':'получил аптечку');
   if(!targets.has(i)){const mark=document.createElement('span');mark.className='camp-served';mark.textContent='✓';b.appendChild(mark);}
  }
  if(i===start){b.classList.add('launch-position');title+=' · База: старт робота с аптечками';const base=document.createElement('span');base.className='base-label';base.textContent='База';b.appendChild(base);}
  if(overlay&&c.type!=='wall'){
   const answer=R.predict(model,features(i));b.dataset.prediction=answer===null?'unknown':answer?'unsafe':'safe';
   const mark=document.createElement('span');mark.className='ai-mark '+b.dataset.prediction;mark.textContent=answer===null?'?':answer?'×':'✓';b.appendChild(mark);
   title+=' · Робот думает: '+(answer===null?'не знает':answer?'застрянет':'проедет');
  }
  b.title=title;b.setAttribute('aria-label',title);b.onclick=()=>select(i);frag.appendChild(b);
 });
 $('board').replaceChildren(frag);$('delivered').textContent=delivered+' / '+campIndices().length;$('remaining').textContent=Math.round(remaining/mission.budget*100)+'%';$('remaining').title=remaining+' из '+mission.budget+' энергии';$('steps').textContent=steps;$('cargo').textContent=mission.cargo-delivered;
 $('cargoHold').replaceChildren(...Array.from({length:mission.cargo},(_,i)=>{const img=document.createElement('img');img.src='assets/medkit.svg';img.alt=i<delivered?'Аптечка передана лагерю':'Аптечка на борту';img.classList.toggle('unloaded',i<delivered);return img;}));
 $('campStatus').replaceChildren(...campIndices().map(i=>{const item=document.createElement('li');item.dataset.served=String(!targets.has(i));item.innerHTML=`<b>Лагерь ${letter(i)}</b><span>${targets.has(i)?'Ждёт аптечку':'✓ Помощь доставлена'}</span>`;return item;}));
 $('predict').textContent=overlay?'Скрыть мнение робота':'Что робот думает о грунте?';$('predict').setAttribute('aria-pressed',overlay);$('predictionLegend').hidden=!overlay;moveSprite();updateRouteInfo();
}
function select(i){if(running)return;selected=i;inspect();draw();persist();window.GameTour?.signal('robot:inspected',{index:i});}
const sensorWords=f=>R.sensorWords(f);
function inspect(){
 const valid=selected>=0&&grid[selected].type!=='wall',f=valid?features(selected):null,guess=valid?guesses.get(key(f)):undefined,result=valid?checks.get(key(f)):undefined;
 for(const id of ['safe','unsafe']){$(id).disabled=running||!valid;$(id).setAttribute('aria-pressed',String(guess===(id==='safe'?0:1)));}
 $('probe').disabled=running||!valid||guess===undefined;
 $('selectedName').textContent=valid?`${R.names[grid[selected].type]} · ряд ${(selected/N|0)+1}, клетка ${selected%N+1}`:'Выбери участок на карте';
 if(!valid){$('sensorHint').textContent=selected>=0?'Это преграда: через неё робот не проедет. Гипотезы проверяют на грунте.':'Здесь ты проверяешь свои предположения. Разные примеры учат робота узнавать новый грунт.';if(selected>=0)$('selectedName').textContent='Каменная преграда';}
 else if(result===undefined)$('sensorHint').textContent=guess===undefined?'Как думаешь, робот проедет здесь или застрянет? Сравни состояние грунта.':'Твоё предположение: '+(guess?'застрянет':'проедет')+'. Испытание покажет результат и сохранит проверенный пример.';
 else{
  const reasons=[];if(f[0]>=70)reasons.push('слишком мокро');if(f[1]>=70)reasons.push('слишком крутой склон');if(f[0]+f[2]>=110)reasons.push('влажность и ямы вместе мешают проехать');if(f[3]<=30)reasons.push('грунт проваливается');
  $('sensorHint').textContent=(+result===guess?'Предположение верное. ':'Получилось иначе. ')+(result?'Робот застрянет: '+reasons.join(', ')+'. ':'Робот проедет. ')+'Проверенный пример сохранён.';
 }
 const words=valid?sensorWords(f):['—','—','—','—'];
 for(const [j,id]of ['wet','slope','rough','bearing'].entries()){$(id).textContent=words[j];$(id).title=valid?`Показание датчика: ${f[j]} из 100`:'';$(id+'Meter').value=valid?f[j]:0;}
 explainSelected();
}
function label(y){if(running||selected<0||grid[selected].type==='wall')return;guesses.set(key(features(selected)),y);checks.delete(key(features(selected)));inspect();persist();window.GameTour?.signal('robot:guessed',{index:selected,label:y});}
function probe(){
 if(selected<0||grid[selected].type==='wall'||running||!guesses.has(key(features(selected))))return;
 const f=features(selected),y=+danger(f),sample={f,y,type:grid[selected].type},old=samples.findIndex(s=>key(s.f)===key(f));
 checks.set(key(f),!!y);if(old<0)samples.push(sample);else samples[old]=sample;
 inspect();updateLearning();controls();say('Испытание проверило твою гипотезу. Сохранён результат, который можно передать роботу.');
 window.GameTour?.signal('robot:probed',{index:selected,label:y});
}
function explainSelected(){
 const box=$('predictionReason');box.replaceChildren();const p=document.createElement('p');box.appendChild(p);
 if(selected<0||grid[selected].type==='wall'){p.textContent='Выбери участок: здесь видно, с какими примерами робот сравнивает его датчики.';return;}
 const answer=R.explain(model,features(selected));p.textContent='Робот думает: '+(answer.label===null?'не знает':answer.label?'застрянет':'проедет')+'. '+answer.reason+'.';
 answer.near.forEach(s=>{const e=document.createElement('p');e.textContent=(R.names[s.type]||'Участок')+' · проверка: '+(s.y?'застрянет':'проедет')+' · показания '+s.f.join(' / ');box.appendChild(e);});
}
function updateLearning(){
 const pending=pendingExamples();$('samples').textContent=`Проверенные примеры: ${samples.length}`+(pending?` · новых: ${pending}`:'');
 $('train').disabled=running||!samples.some(s=>s.y===0)||!samples.some(s=>s.y===1);
 const missing=!samples.some(s=>s.y===0)?'проезда':!samples.some(s=>s.y===1)?'опасности':null;
 $('model').textContent=running?'Робот применяет твои примеры и едет сам.':pending?(missing?`Проверенных примеров: ${samples.length}. Для обучения ещё нужен пример ${missing}.`:'Можно проверить несколько участков, затем «Обучить робота» сразу на всех примерах.'):
  !model.length?'Для обучения нужны проверенные примеры проезда и опасности.':trail.length?(delivered===mission.cargo?'Опыт сработал: робот добрался до всех лагерей.':'Рейс остановлен. Память робота сохранена.'):
  learningEffect?learningEffect+(preview?' Путь готов.':' Полного пути пока нет.'):
  preview?'Робот выбрал путь. Синяя линия показывает, куда он поедет.':'Пути пока нет: часть грунта незнакома роботу. Каждый новый пример помогает узнавать похожие участки.';
 const coverage=$('coverage');coverage.replaceChildren();
 const present=new Set(grid.map(cell=>cell.type));
 Object.keys(R.names).filter(type=>present.has(type)).forEach(type=>{
  const known=samples.filter(s=>s.type===type),b=document.createElement('button');b.dataset.coverage=type;
  const unknown=grid.filter(c=>c.type===type&&R.predict(model,R.features(c,raining))===null).length;
  b.innerHTML=`<span class="terrain-swatch ${type}" aria-hidden="true"></span><span>${R.names[type]}<small>${known.length?'Проверенные состояния: '+new Set(known.map(s=>sensorWords(s.f).join(' · '))).size:'Проверенных состояний пока нет'}</small><small>${unknown?'Есть незнакомые показания на этой карте':'Робот узнаёт показания на этой карте'}</small></span>`;
  b.onclick=()=>{const cells=grid.flatMap((c,i)=>c.type===type?[i]:[]),i=cells.find(i=>!samples.some(s=>key(s.f)===key(features(i))))??cells[0];if(i!==undefined){$('learningNotebook').open=false;document.querySelector('.monitor-dialog[open]')?.close();select(i);}};coverage.appendChild(b);
 });
 const journal=$('exampleJournal');journal.replaceChildren();samples.forEach((s,i)=>{const p=document.createElement('p');p.textContent=`${i+1}. ${R.names[s.type]}: ${sensorWords(s.f).join(' · ')} → ${s.y?'застрянет':'проедет'} · ${model.some(m=>key(m.f)===key(s.f)&&m.y===s.y)?'в памяти робота':'ждёт обучения'}`;journal.appendChild(p);});
 $('notebookSummary').textContent='Память робота · '+samples.length+' примеров';explainSelected();updateTask();
}
function resetTrip(){robot=start;remaining=mission.budget;delivered=steps=spent=0;trail=[];path=[];stuckCell=-1;targets=new Set(campIndices());}
function train(){
 if(running||$('train').disabled)return;
 const before=grid.map((c,i)=>c.type==='wall'?null:R.predict(model,features(i)));
 model=samples.map(s=>({...s,f:[...s.f]}));
 const changes=grid.flatMap((c,i)=>c.type!=='wall'&&R.predict(model,features(i))!==null&&before[i]!==R.predict(model,features(i))?[i]:[]);
 const transferred=changes.find(i=>!samples.some(s=>key(s.f)===key(features(i))))??changes.find(i=>i!==selected);
 const changed=transferred??changes[0];
 const opinion=answer=>answer===null?'не знает':answer?'застрянет':'проедет';
 learningEffect=changed!==undefined?`${R.names[grid[changed].type]}: «${opinion(before[changed])}» → «${opinion(R.predict(model,features(changed)))}». `+(transferred!==undefined?'Опыт перенесён на похожий грунт.':'Проверенный ответ теперь в памяти робота.'):'Решения не изменились: эти показания уже знакомы.';
 resetTrip();recalculate();draw();updateLearning();controls();say(learningEffect+' '+(preview?'Робот построил путь к лагерям.':'Для пути к лагерям ещё нужны разные наблюдения.'));window.GameTour?.signal('robot:trained');
}
function stop(message=true){clearTimeout(timer);running=false;path=[];draw();controls();inspect();updateLearning();if(message)say('Рейс остановлен. Уже переданные аптечки остались в лагерях. Повторный рейс начнётся с базы с новым комплектом.');}
function run(){
 if(running||$('run').disabled)return;resetTrip();recalculate();running=true;path=[...preview.path];controls();inspect();updateLearning();
 function finish(message){
  const complete=!targets.size;running=false;clearTimeout(timer);
  const result={score:R.score({max:mission.max,delivered,camps:campIndices().length,energy:spent,optimal:benchmark.energy,complete}),complete,energy:spent,start};
  if(complete&&stage===0)trainingPassed=true;
  if(complete||stage){if(!best[stage]||result.score>best[stage].score||result.score===best[stage].score&&result.energy<best[stage].energy)best[stage]=result;}
  if(stage)message+=` Результат: ${result.score}/${mission.max}. `+(complete&&spent===benchmark.energy?'Минимум энергии найден!':complete?'Помощь доставлена! Можно улучшить экономию батареи.':'Проверяй свои гипотезы и дополняй опыт робота.');
  else message+=complete?' Первый рейс пройден! Теперь робот готов к лесной экспедиции.':' Это учебный рейс: можно повторить без потери баллов.';
  path=[];draw();inspect();controls();updateLearning();say(message);window.GameTour?.signal('robot:finished',{delivered,useAI:true});
 }
 function tick(){
  if(!running)return;
  const next=path.shift();if(next===undefined){finish('Рейс завершён.');return;}
  const cost=R.costs[grid[next].type];if(remaining<cost){finish('Батарея разрядилась раньше окончания рейса.');return;}
  robot=next;remaining-=cost;spent+=cost;steps++;trail.push(next);
  if(danger(features(next))){selected=stuckCell=next;finish('Робот застрял: похожие примеры дали ошибочное решение.');return;}
  if(targets.has(next)){targets.delete(next);delivered++;}draw();persist();
  if(!targets.size){finish('Все три лагеря получили аптечки!');return;}
  timer=setTimeout(tick,window.matchMedia('(prefers-reduced-motion: reduce)').matches?20:180);
 }
 draw();say('Робот выехал с базы с тремя аптечками. В каждом лагере он оставит одну.');window.GameTour?.signal('robot:started');timer=setTimeout(tick,350);
}
$('safe').onclick=()=>label(0);$('unsafe').onclick=()=>label(1);$('probe').onclick=probe;$('train').onclick=train;
$('clear').onclick=()=>{samples=[];model=[];overlay=false;learningEffect='';resetTrip();recalculate();draw();inspect();updateLearning();controls();say('Память робота очищена. Пройденные миссии и баллы сохранены.');};
$('predict').onclick=()=>{overlay=!overlay;draw();say(overlay?'Значки — мнение робота: ✓ проедет, × застрянет, ? не знает. Испытание грунта может показать, что он ошибся.':'Значки скрыты. Робот продолжает выбирать путь по своей памяти.');};
$('run').onclick=run;$('stop').onclick=()=>stop();$('nextMission').onclick=()=>loadStage(stage+1);
$('robotZoom').onclick=()=>{const on=$('boardStage').classList.toggle('enlarged');$('robotZoom').setAttribute('aria-pressed',on);$('robotZoom').textContent=on?'− Обычные клетки':'＋ Крупнее клетки';moveSprite();};
window.resetRobotMission=()=>{robotSession=window.FestivalSession?.id;stop(false);stage=0;best=Array(4).fill(null);samples=[];model=[];overlay=false;trainingPassed=false;initial();};
window.robotLesson={begin(){stop(false);stage=0;initial();return true;}};
window.robotExpedition={get restored(){return restoredRobot;},current:()=>({stage,id:mission.id,start,spent,trainingPassed,onboard:mission.cargo-delivered,delivered,served:campIndices().filter(i=>!targets.has(i)),best:best.map(r=>r&&({...r})),optimal:benchmark.energy}),load:loadStage};
function switchLab(epi){stop(false);document.body.classList.toggle('city-active',epi);$('robotView').style.display=epi?'none':'';$('epiView').style.display=epi?'block':'none';for(const [id,on]of [['robotTab',!epi],['epiTab',epi]]){$(id).classList.toggle('active',on);$(id).setAttribute('aria-pressed',on);}if(epi)$('epiView').contentWindow.postMessage('city-active','*');else{$('epiView').contentWindow.postMessage('pause','*');window.GameTour?.maybeStart('robot');}location.hash=epi?'epidemic':'robot';}
$('robotTab').onclick=()=>switchLab(false);$('epiTab').onclick=()=>switchLab(true);
window.addEventListener('message',e=>{if(e.source===$('epiView').contentWindow&&e.data?.kind==='epidemic-height'&&Number.isFinite(e.data.height))$('epiView').style.height=Math.max(600,Math.min(10000,e.data.height))+'px';});
new ResizeObserver(moveSprite).observe($('board'));
function recoverRobot(){
 const saved=window.FestivalSession?.read('robot');if(!saved)return;
 try{
  const validExamples=xs=>Array.isArray(xs)&&xs.length<=500&&xs.every(s=>R.names[s.type]&&[0,1].includes(s.y)&&Array.isArray(s.f)&&s.f.length===4&&s.f.every(n=>Number.isFinite(n)&&n>=0&&n<=100));
  if(!Number.isInteger(saved.stage)||saved.stage<0||saved.stage>3||!validExamples(saved.samples)||!validExamples(saved.model)||!Array.isArray(saved.best)||saved.best.length!==4||typeof saved.trainingPassed!=='boolean')return;
  if(saved.best.some((r,i)=>r&&(!Number.isInteger(r.score)||r.score<0||r.score>R.create(R.ids[i]).max||typeof r.complete!=='boolean'||!Number.isFinite(r.energy)||r.energy<0)))return;
  if(saved.stage===1&&!saved.trainingPassed||saved.stage>1&&!saved.best[saved.stage-1]?.complete)return;
  stage=saved.stage;samples=saved.samples;model=saved.model;best=saved.best;trainingPassed=saved.trainingPassed;restoredRobot=true;
 }catch{}
}
recoverRobot();initial();
if(restoredRobot){
 const trip=window.FestivalSession.read('robot')?.trip;
 if(trip&&Array.isArray(trip.trail)&&trip.trail.length<=240&&trip.trail.every(i=>Number.isInteger(i)&&grid[i]&&grid[i].type!=='wall')){
  trail=trip.trail;robot=trail.at(-1)??start;spent=trail.reduce((sum,i)=>sum+R.costs[grid[i].type],0);steps=trail.length;remaining=Math.max(0,mission.budget-spent);
  targets=new Set(campIndices().filter(i=>!trail.includes(i)));delivered=mission.cargo-targets.size;stuckCell=trail.length&&danger(features(robot))?robot:-1;
  selected=Number.isInteger(trip.selected)&&trip.selected>=0&&trip.selected<144?trip.selected:-1;
  try{checks=new Map(trip.checks);guesses=new Map(trip.guesses);}catch{checks=new Map();guesses=new Map();}
  draw();inspect();updateLearning();controls();
 }
 say('Прогресс восстановлен. Память и результаты сохранены; прерванный рейс можно повторить с базы.');
}
restoring=false;publish();if(location.hash==='#epidemic')setTimeout(()=>switchLab(true),0);
