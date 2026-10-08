
'use strict';
const $=id=>document.getElementById(id), N=12, types={inspect:['⌕','Изучить'],road:['·','Дорога'],wall:['▧','Стена'],mud:['≋','Грязь'],hill:['▲','Холм'],water:['≈','Вода'],sand:['∴','Песок'],start:['🤖','Старт'],parcel:['📦','Посылка'],charge:['⚡','Зарядка']};
let grid=[],start=60,robot=60,tool='inspect',selected=-1,raining=false,samples=[],model=[],overlay=false,running=false,timer=null,path=[],delivered=0,steps=0,remaining=60,targets=new Set(),visitedCharges=new Set();let selection=new Set(),multi=false,dragStart=null,dragEnd=null,suppressClick=false; let originalGrid=null, stuckCell=-1; let stage=0, mission, benchmark, spent=0, trail=[], best=Array(4).fill(null);
function terrain(type,i){return RobotEngine.tile(type,i);}
function features(i){return RobotEngine.features(grid[i],raining);}
function danger(f){return RobotEngine.danger(f);}
function probability(f){return +RobotEngine.predict(model,f);}
function say(s){$('status').textContent=s;}
function parcelIndices(){return grid.flatMap((c,i)=>c.object==='parcel'?[i]:[]).sort((a,b)=>(grid[a].parcel||'Z').localeCompare(grid[b].parcel||'Z')||a-b);}
function letter(i){return grid[i].parcel||String.fromCharCode(65+parcelIndices().indexOf(i));}
function learned(){return model.some(s=>s.y===0)&&model.some(s=>s.y===1);}
function publish(){window.SessionScore?.robot(best.reduce((s,r)=>s+(r?.score||0),0),best.slice(1).every(r=>r?.complete),learned());}
function expeditionControls(){
 const nav=$('expeditionNav');nav.replaceChildren();
 RobotEngine.ids.forEach((id,i)=>{const button=document.createElement('button');button.textContent=i===0?'Учебный полигон':`${i}. ${RobotEngine.create(id).title}${best[i]?.complete?' ✓':''}`;button.id='expedition-'+id;button.setAttribute('aria-current',stage===i?'step':'false');button.disabled=running||(i===1?!learned():i>1&&!best[i-1]?.complete);button.onclick=()=>loadStage(i);nav.appendChild(button);});
 $('missionName').textContent=mission.title.toUpperCase();$('missionBrief').textContent=mission.brief;
 $('nextMission').hidden=stage===3;
 $('nextMission').textContent=stage===0?'Начать лесную доставку →':'Следующая миссия →';
 $('nextMission').disabled=running||(stage===0?!learned():!best[stage]?.complete);
 $('parcelOrder').disabled=$('routeMode').disabled=running;
 $('routeControls').hidden=stage===0;
 $('deliveryTries').textContent=stage===0?'Учебные запуски бесплатные.':`Энергия: ${spent} · цель: ${benchmark.energy}. Лучший: ${best[stage]?.score||0}/${mission.max}`;
 publish();
}
function orders(){const goals=parcelIndices(), old=$('parcelOrder').value;$('parcelOrder').replaceChildren();RobotEngine.permutations(goals).forEach(order=>{const o=document.createElement('option');o.value=order.join(',');o.textContent=order.map(letter).join(' → ');$('parcelOrder').appendChild(o);});if([...$('parcelOrder').options].some(o=>o.value===old))$('parcelOrder').value=old;}
function initial(){
 stop(false);selection.clear();mission=RobotEngine.create(RobotEngine.ids[stage]);grid=mission.grid;start=robot=mission.start;raining=mission.rain;originalGrid=JSON.stringify(grid);benchmark=RobotEngine.optimum(mission);stuckCell=-1;selected=-1;path=[];trail=[];spent=delivered=steps=0;remaining=mission.budget;targets=new Set(parcelIndices());
 $('energy').value=mission.budget;$('energyValue').textContent=mission.budget;$('rain').textContent=raining?'🌧 Дождь включён':'☀ Сухая погода';$('weather').textContent=raining?'После ливня · влажность +25':'Без осадков';$('boardStage').classList.toggle('rainy',raining);orders();draw();inspect();updateSamples();expeditionControls();say(stage===0?'Запусти робота, изучи остановку и обучи ИИ.':`Доставь все грузы. Минимум энергии: ${benchmark.energy}. Меняй порядок и путь.`);
}
function loadStage(index){if(running||index<0||index>3)return;if(index===1&&!learned()||index>1&&!best[index-1]?.complete)return;stage=index;tool='inspect';multi=false;$('strategy').value=index===0?'short':'ai';$('routeMode').value='steps';initial();if(index===3)$('model').textContent='Дождь изменил датчики. Проверь старый прогноз и добавь новые примеры.';}
function draw(){const frag=document.createDocumentFragment();grid.forEach((c,i)=>{const b=document.createElement('button');b.className='cell '+c.type+(i===stuckCell?' stuck':'')+(c.object?' object-'+c.object:'')+(path.includes(i)||trail.includes(i)?' path':'')+(selected===i?' selected':'')+(selection.has(i)?' multi':'');if(overlay&&model.length&&c.type!=='wall')b.classList.add(probability(features(i))>=.5?'bad':'good');let obj=c.object==='parcel'&&!targets.has(i)&&delivered>0?null:c.object;b.textContent=obj?types[obj][0]:types[c.type][0];b.setAttribute('data-visible-object',obj||'');b.setAttribute('data-index',i);const mark=samples.find(s=>s.f.join(',')===features(i).join(','));if(mark){b.dataset.label=mark.y?'unsafe':'safe';b.title+=' · твоя метка: '+(mark.y?'опасно':'безопасно');}if(c.object==='parcel'){b.dataset.parcel=letter(i);b.title+=' · груз '+letter(i);}b.title=`${Math.floor(i/N)+1}:${i%N+1} — ${types[c.type][1]}${c.object?', '+types[c.object][1]:''}`;if(overlay&&model.length&&c.type!=='wall')b.title+=' · прогноз ИИ: '+(probability(features(i))>=.5?'опасно':'безопасно');b.setAttribute('aria-label',b.title);b.onclick=()=>{if(suppressClick){suppressClick=false;return;}if(multi){if(running)return;selection.has(i)?selection.delete(i):selection.add(i);selected=i;draw();inspect();return;}edit(i);};frag.appendChild(b);});$('board').replaceChildren(frag);$('delivered').textContent=delivered+' / '+grid.filter(c=>c.object==='parcel').length;$('remaining').textContent=remaining;$('steps').textContent=steps;$('selectionCount').textContent='Выделено: '+selection.size;moveSprite();}
function edit(i){if(running)return;selected=i;if(tool==='inspect'){inspect();draw();window.GameTour?.signal('robot:inspected',{index:i});return;}if(tool==='start'){start=i;robot=i;grid[i]=terrain('road',i);}else if(tool==='parcel'||tool==='charge'){if(i===start){say('Перенеси старт, прежде чем ставить здесь объект.');return;}grid[i]=terrain('road',i);grid[i].object=tool;}else {if(i===start&&tool==='wall'){say('На месте старта нельзя поставить стену.');return;}grid[i]=terrain(tool,i);}path=[];delivered=steps=0;robot=start;remaining=+$('energy').value;targets=new Set(grid.flatMap((c,j)=>c.object==='parcel'?[j]:[]));inspect();draw();}
function inspect(){$('sensors').classList.toggle('bulk',selection.size>0);if(selection.size){$('sensorHint').textContent='Метка применится ко всем выделенным клеткам. Сравни показания: разные участки могут иметь разную опасность.';const cells=[...selection].filter(i=>grid[i].type!=='wall');$('safe').disabled=$('unsafe').disabled=!cells.length||running;$('selectedName').textContent='Выделено участков: '+selection.size;for(const [j,id]of ['wet','slope','rough','bearing'].entries()){const values=cells.map(i=>features(i)[j]);$(id).textContent=values.length?Math.min(...values)+'–'+Math.max(...values)+'%':'—';}return;}let valid=selected>=0&&grid[selected].type!=='wall';$('safe').disabled=$('unsafe').disabled=!valid||running;if(!valid){$('sensorHint').textContent='Выбери участок, чтобы сравнить показания.';$('selectedName').textContent='Выбери участок местности';for(let x of ['wet','slope','rough','bearing']){$(x).textContent='—';$(x+'Meter').value=0;$(x+'Meter').classList.remove('danger');}return;}$('selectedName').textContent=`Участок ${Math.floor(selected/N)+1}:${selected%N+1} · ${types[grid[selected].type][1]}`;features(selected).forEach((v,j)=>{const id=['wet','slope','rough','bearing'][j];$(id).textContent=Math.round(v)+'%';$(id+'Meter').value=v;const f=features(selected);$(id+'Meter').classList.toggle('danger',j===0?(v>=70||f[0]+f[2]>=110):j===1?v>=70:j===2?f[0]+f[2]>=110:v<=30);$(id+'Meter').setAttribute('aria-label',$(id).previousElementSibling?.textContent||id);});const f=features(selected),risks=[];if(f[0]>=70)risks.push('слишком влажно');if(f[1]>=70)risks.push('крутой уклон');if(f[0]+f[2]>=110)risks.push('влажность вместе с неровностью');if(f[3]<=30)risks.push('грунт слишком слабый');$('sensorHint').textContent=risks.length?'⚠ '+risks.join(', ')+'. Сможет ли робот проехать?':'✓ Грунт выдержит робота. Сравни с опасным участком.';}
function updateSamples(){
 const seen=new Set();for(const sample of samples){const f=sample.f;if(f[0]>=35)seen.add('влажные участки');if(f[1]>=35)seen.add('склоны');if(f[3]<=60)seen.add('разная прочность');}
 $('samples').textContent=samples.length?`В журнале: ${samples.length} примеров${seen.size?' · '+[...seen].join(', '):' · пока только прочная дорога'}`:'Покажи роботу, где можно проехать, а где он застрянет.';
 $('train').disabled=running||!samples.some(s=>s.y===0)||!samples.some(s=>s.y===1);
}
function label(y){if(running)return;for(const i of selection.size?[...selection]:[selected]){if(i<0||grid[i].type==='wall')continue;const f=features(i),old=samples.findIndex(s=>s.f.join(',')===f.join(','));if(old>=0)samples[old]={f,y};else samples.push({f,y});}updateSamples();draw();$('model').textContent='Примеры изменены. Нажми «Обучить ИИ», чтобы робот их использовал.';window.GameTour?.signal('robot:labeled',{index:selected,label:y});}
function neighbors(i){return RobotEngine.neighbors(i,grid);}
function findPath(from,goals,useAI){
 const order=($('parcelOrder').value||'').split(',').map(Number),goal=order.find(i=>goals.has(i))??[...goals][0];
 return goal===undefined?[]:RobotEngine.shortest(grid,from,goal,{rain:raining,model,mode:useAI?$('routeMode').value:'steps',useAI});
}
function lock(on){$('boardStage').classList.toggle('rolling',on);for(let id of ['run','reset','rain','energy','strategy','clear','present','multi','applySelection','clearSelection','strength','applyStrength'])$(id).disabled=on;$('stop').disabled=!on;for(let b of $('tools').children)b.disabled=on;$('robotTutorial').disabled=on;updateSamples();inspect();if(mission)expeditionControls();}
function stop(message=true){clearTimeout(timer);timer=null;running=false;lock(false);if(message)say('Испытание остановлено. Можно изменить полигон и запустить заново.');}
function run(){
 if(running)return;const useAI=$('strategy').value==='ai',scored=stage>0&&useAI&&isOriginal();
 if(useAI&&!learned()){say('Покажи безопасный и опасный участки, затем обучи ИИ.');return;}
 targets=new Set(parcelIndices());if(!targets.size){say('На карте нет грузов. Поставь посылку в редакторе.');return;}
 robot=start;remaining=+$('energy').value;delivered=steps=spent=0;path=[];trail=[];stuckCell=-1;visitedCharges=new Set();running=true;lock(true);say('Робот выполняет доставку…');
 function finish(message){
  stop(false);draw();const complete=targets.size===0;
  if(scored){const result={score:RobotEngine.score({max:mission.max,delivered,parcels:parcelIndices().length,energy:spent,optimal:benchmark.energy,complete}),complete,energy:spent,order:$('parcelOrder').value,mode:$('routeMode').value};if(!best[stage]||result.score>best[stage].score||result.score===best[stage].score&&result.energy<best[stage].energy)best[stage]=result;
   message+=` Эта попытка: ${result.score}/${mission.max}. `+(complete?(spent===benchmark.energy?'Минимум энергии найден!':`Энергия ${spent}, минимум ${benchmark.energy}. Сравни порядок грузов и выбери «По энергии».`):'Можно повторить попытку.');
  }else message+=stage===0?' Учебный запуск — без баллов.':' Свободный опыт: баллы сохранены.';
  expeditionControls();say(message);window.GameTour?.signal('robot:finished',{delivered,useAI});
 }
 function plan(){path=findPath(robot,targets,useAI);if(!path){
   // A known-safe connection exists on every authored mission; blocked predictions
   // identify a concrete sample to review without replacing the player's model.
   const goal=($('parcelOrder').value||'').split(',').map(Number).find(i=>targets.has(i))??[...targets][0];
   const safe=RobotEngine.shortest(grid,robot,goal,{rain:raining,oracle:true});
   const blocked=safe?.find(i=>probability(features(i))>=.5);
   if(blocked!==undefined){selected=blocked;inspect();finish(`ИИ закрыл участок ${Math.floor(blocked/N)+1}:${blocked%N+1}. Проверь датчики и добавь безопасный пример.`);}
   else finish('Маршрут не найден. Проверь прогноз и карту.');return;
  }tick();}
 function tick(){if(!running)return;if(!path.length){plan();return;}const next=path.shift(),cost=RobotEngine.costs[grid[next].type]||1;
  if(remaining<cost){finish('Энергия закончилась. Сравни порядок доставки и выбери экономный путь.');return;}
  robot=next;remaining-=cost;spent+=cost;steps++;trail.push(next);
  if(danger(features(next))){stuckCell=selected=next;tool='inspect';inspect();finish('Ошибка ИИ: робот застрял. Изучи датчики и обучи снова.');return;}
  if(grid[next].object==='charge'&&!visitedCharges.has(next)){remaining=+$('energy').value;visitedCharges.add(next);}
  if(targets.has(next)){targets.delete(next);delivered++;}draw();expeditionControls();
  if(!targets.size){finish(`Доставлено ${delivered}/${parcelIndices().length}!`);return;}
  timer=setTimeout(path.length?tick:plan,window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?20:90);
 }
 draw();window.GameTour?.signal('robot:started');timer=setTimeout(plan,250);
}
for(let [key,[icon,name]] of Object.entries(types)){const b=document.createElement('button');b.textContent=icon+' '+name;b.className=key===tool?'active':'';b.setAttribute('data-tool',key);b.onclick=()=>{tool=key;for(let c of $('tools').children)c.classList.remove('active');b.classList.add('active');};$('tools').appendChild(b);}
window.addEventListener('message',e=>{if(e.source===$('epiView').contentWindow&&e.data?.kind==='epidemic-height'&&Number.isFinite(e.data.height))$('epiView').style.height=Math.max(600,Math.min(10000,e.data.height))+'px';});$('robotTab').onclick=()=>switchLab(false);$('epiTab').onclick=()=>switchLab(true);function switchLab(epi){stop(false);document.body.classList.toggle('city-active',epi);$('robotView').style.display=epi?'none':'';$('epiView').style.display=epi?'block':'none';$('robotTab').classList.toggle('active',!epi);$('epiTab').classList.toggle('active',epi);$('robotTab').setAttribute('aria-pressed',!epi);$('epiTab').setAttribute('aria-pressed',epi);if(epi)$('epiView').contentWindow.postMessage('city-active','*');else{$('epiView').contentWindow.postMessage('pause','*');window.GameTour?.maybeStart('robot');}location.hash=epi?'epidemic':'robot';}if(location.hash==='#epidemic')setTimeout(()=>switchLab(true),0);$('safe').onclick=()=>label(0);$('unsafe').onclick=()=>label(1);$('train').onclick=()=>{model=samples.map(s=>({f:[...s.f],y:s.y}));overlay=true;$('boardStage').classList.add('scanning');$('strategy').value='ai';draw();$('model').textContent='ИИ обучен. Прогноз: зелёный — можно, красный — опасно. Проверь доставку.';expeditionControls();window.GameTour?.signal('robot:trained');};$('clear').onclick=()=>{samples=[];model=[];overlay=false;$('boardStage').classList.remove('scanning');updateSamples();$('model').textContent='ИИ пока не обучен.';draw();expeditionControls();};$('predict').onclick=()=>{if(!model.length){say('Сначала обучи ИИ на своих примерах.');return;}overlay=!overlay;$('boardStage').classList.toggle('scanning',overlay);draw();};$('rain').onclick=()=>{raining=!raining;$('boardStage').classList.toggle('rainy',raining);$('rain').textContent=raining?'🌧 Дождь включён':'☀ Сухая погода';$('weather').textContent=raining?'Дождь · влажность +25':'Без осадков';inspect();draw();say('Погода изменилась. Проверь показания датчиков: старый прогноз может оказаться неверным.');};$('energy').oninput=()=>{$('energyValue').textContent=$('energy').value;remaining=+$('energy').value;draw();};$('run').onclick=run;$('stop').onclick=()=>stop();$('reset').onclick=initial;$('present').onclick=()=>{document.body.classList.toggle('present');$('present').textContent=document.body.classList.contains('present')?'Обычный вид':'Режим панели';};
function moveSprite(){const board=$('board');if(!board.getBoundingClientRect)return;const w=board.getBoundingClientRect().width,cell=(w-33)/12,sp=$('robotSprite');sp.style.width=sp.style.height=cell+'px';sp.style.transform=`translate(${(robot%N)*(cell+3)}px,${Math.floor(robot/N)*(cell+3)}px)`;}
function rectangle(a,b){const out=[];for(let y=Math.min(a/N|0,b/N|0);y<=Math.max(a/N|0,b/N|0);y++)for(let x=Math.min(a%N,b%N);x<=Math.max(a%N,b%N);x++)out.push(y*N+x);return out;}
$('multi').onclick=()=>{multi=!multi;$('multi').setAttribute('aria-pressed',multi);$('multi').classList.toggle('active',multi);};
$('clearSelection').onclick=()=>{selection.clear();draw();inspect();};
$('applySelection').onclick=()=>{if(running)return;if(!selection.size){say('Сначала выдели клетки.');return;}if(tool==='inspect'||tool==='start'){say('Для области выбери материал, посылки или зарядки. Старт размещается на одной клетке.');return;}for(const i of selection)edit(i);say('Область изменена. Исследуй новые участки и проверь прогноз ИИ.');};
$('strength').oninput=()=>{$('strengthValue').textContent=$('strength').value+'%';};
$('applyStrength').onclick=()=>{if(running)return;const cells=selection.size?[...selection]:selected>=0?[selected]:[];if(!cells.length){say('Выбери клетку или область.');return;}for(const i of cells)if(grid[i].type!=='wall')grid[i].f[3]=+$('strength').value;path=[];inspect();draw();say('Прочность грунта изменена. Сравни показания и испытай робота.');};
$('board').onpointerdown=e=>{if(!multi||running||e.button>0)return;const i=e.target.getAttribute?.('data-index');if(i===null||i===undefined)return;dragStart=dragEnd=+i;};
$('board').onpointermove=e=>{if(dragStart===null)return;const hit=document.elementFromPoint(e.clientX,e.clientY),i=hit?.getAttribute?.('data-index');if(i===null||i===undefined)return;dragEnd=+i;const cells=new Set(rectangle(dragStart,dragEnd));for(let n=0;n<$('board').children.length;n++)$('board').children[n].classList.toggle('multi',cells.has(n)||selection.has(n));};
function endSelection(){if(dragStart===null)return;if(dragStart!==dragEnd){rectangle(dragStart,dragEnd).forEach(i=>selection.add(i));selected=dragEnd;suppressClick=true;setTimeout(()=>{suppressClick=false;},0);draw();inspect();}dragStart=dragEnd=null;}
window.addEventListener('pointerup',endSelection);window.addEventListener('pointercancel',()=>{dragStart=dragEnd=null;draw();});
if(typeof ResizeObserver!=='undefined')new ResizeObserver(moveSprite).observe($('board'));
function isOriginal(){return JSON.stringify(grid)===originalGrid&&start===mission.start&&raining===mission.rain&&+$('energy').value===mission.budget;}
window.resetRobotMission=()=>{stop(false);stage=0;best=Array(4).fill(null);samples=[];model=[];overlay=false;multi=false;selection.clear();tool='inspect';$('strategy').value='short';$('boardStage').classList.remove('scanning');$('model').textContent='ИИ пока не обучен.';initial();};
window.robotLesson={begin(){stop(false);stage=0;$('strategy').value='short';tool='inspect';multi=false;selection.clear();$('robotEditor').open=false;$('boardStage').classList.remove('enlarged');$('robotZoom').setAttribute('aria-pressed','false');$('robotZoom').textContent='＋ Крупнее клетки';initial();return true;}};
$('nextMission').onclick=()=>loadStage(stage+1);
$('parcelOrder').onchange=$('routeMode').onchange=()=>{trail=[];path=[];draw();say('План изменён. Запусти робота и сравни расход энергии.');};
window.robotExpedition={current:()=>({stage,id:mission.id,spent,best:best.map(r=>r&&({...r})),optimal:benchmark.energy}),load:loadStage};
$('robotEditor').ontoggle=()=>{if(!$('robotEditor').open&&!running){tool='inspect';multi=false;selection.clear();draw();inspect();}};

$('robotZoom').onclick=()=>{const on=$('boardStage').classList.toggle('enlarged');$('robotZoom').setAttribute('aria-pressed',on);$('robotZoom').textContent=on?'− Обычные клетки':'＋ Крупнее клетки';moveSprite();};
initial();
