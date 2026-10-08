const assert=require('node:assert/strict'), R=require('../robot-engine.js');
// Independent product-graph Dijkstra: state is (cell, set of delivered camps).
// This does not use the production goal permutations or segment planner.
function reference(m){
 const goals=m.grid.flatMap((c,i)=>c.object==='camp'?[i]:[]), bit=new Map(goals.map((g,i)=>[g,1<<i]));
 const full=(1<<goals.length)-1, distances=new Map([[m.start,0]]), queue=[[0,m.start,0]];
 while(queue.length){queue.sort((a,b)=>b[0]-a[0]);const [cost,pos,mask]=queue.pop(), key=mask*144+pos;if(cost!==distances.get(key))continue;if(mask===full)return cost;
  const x=pos%12,y=Math.floor(pos/12);for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(nx<0||nx>=12||ny<0||ny>=12)continue;const v=ny*12+nx,c=m.grid[v];if(c.type==='wall')continue;const f=[...c.f];if(m.rain)f[0]=Math.min(100,f[0]+25);if(f[0]>=70||f[1]>=70||f[0]+f[2]>=110||f[3]<=30)continue;const nextMask=mask|(bit.get(v)||0),nextKey=nextMask*144+v,nextCost=cost+({road:1,sand:2,mud:3,hill:4,water:4,gravel:2,grass:2,clay:3,ice:2}[c.type]);if(nextCost<(distances.get(nextKey)??Infinity)){distances.set(nextKey,nextCost);queue.push([nextCost,v,nextMask]);}}
 }return Infinity;
}
assert(R.danger([0,0,0,30]));assert(!R.danger([0,0,0,31]));
// The displayed limits and the physical simulator agree at every boundary.
assert.deepEqual(R.limits,{wet:70,slope:70,wetRough:110,bearing:30});
for(const [safe,unsafe] of [
 [[69,0,0,31],[70,0,0,31]],
 [[0,69,0,31],[0,70,0,31]],
 [[60,0,49,31],[60,0,50,31]],
 [[0,0,0,31],[0,0,0,30]]
]){assert(!R.danger(safe));assert(R.danger(unsafe));}
const signatures=new Set();
for(const id of R.ids){
 const m=R.create(id),o=R.optimum(m);assert(o);assert.equal(o.energy,reference(m));assert(o.energy<=m.budget);assert.equal(m.grid.length,144);assert.equal(m.cargo,3);assert.equal(m.grid.filter(c=>c.object==='camp').length,3);
 assert.deepEqual(R.create(id),m,'Maps must be deterministic');signatures.add(JSON.stringify(m.grid));
 const goals=m.grid.flatMap((c,i)=>c.object==='camp'?[i]:[]),model=m.grid.filter(c=>c.type!=='wall').map(c=>({f:R.features(c,m.rain),y:+R.danger(R.features(c,m.rain))}));
 const energies=new Set();let maxReachable=false;
 for(const mode of ['steps','energy'])for(const order of R.permutations(goals)){
  let pos=m.start,energy=0;const remaining=new Set(goals);
  for(const goal of order){if(!remaining.has(goal))continue;const path=R.shortest(m.grid,pos,goal,{rain:m.rain,model,mode});assert(path,'All authored deliveries remain reachable with a correct model');for(const i of path){assert(!R.danger(R.features(m.grid[i],m.rain)));energy+=R.costs[m.grid[i].type];remaining.delete(i);}pos=goal;}
  energies.add(energy);if(energy===o.energy)maxReachable=true;
 }
 if(m.max){assert(energies.size>=3,'Each expedition offers genuinely different energy outcomes');assert(maxReachable,'Maximum is attainable using the same planner as players');assert.equal(R.score({max:m.max,delivered:goals.length,camps:goals.length,energy:o.energy,optimal:o.energy,complete:true}),m.max);for(let extra=1;extra<100;extra++)assert(R.score({max:m.max,delivered:goals.length,camps:goals.length,energy:o.energy+extra,optimal:o.energy,complete:true})<m.max);assert(R.score({max:m.max,delivered:goals.length-1,camps:goals.length,energy:1,optimal:o.energy,complete:false})<m.max);}
 console.log(id+': exact minimum '+o.energy+', alternatives '+[...energies].sort((a,b)=>a-b).join('/'));
}
assert.equal(signatures.size,4);
const firstTrip=R.create('training'),introductory=[R.examples().find(s=>s.type==='road'&&s.y===0),R.examples().find(s=>s.type==='mud'&&s.y===1)];
assert.equal(R.plan(firstTrip,introductory).energy,R.optimum(firstTrip).energy,'The two introductory experiments are enough to actually finish the first trip');
for(const id of ['forest','gorge','rain']){
 const m=R.create(id),optimal=R.optimum(m);
 const examples=[...new Map(m.grid.filter(c=>c.type!=='wall').map(c=>{const f=R.features(c,m.rain);return [f.join(','),{f,y:+R.danger(f),type:c.type}];})).values()];
 let detour=null;
 for(const i of new Set(optimal.path)){
  if(m.grid[i].object)continue;
  const changed=R.features(m.grid[i],m.rain).join(','),model=examples.map(s=>s.f.join(',')===changed?{...s,y:1}:s),route=R.plan(m,model);
  if(route&&route.energy>optimal.energy&&!route.path.some(j=>R.danger(R.features(m.grid[j],m.rain)))){detour=route;break;}
 }
 assert(detour,'Each map must offer a safe but longer automatic route after an overcautious learned decision');
 assert(R.score({max:m.max,delivered:3,camps:3,energy:detour.energy,optimal:optimal.energy,complete:true})<m.max);
}

const wet=R.tile('clay',0,[40,25,45,75]);assert(!R.danger(R.features(wet,false)));assert(R.danger(R.features(wet,true)));
const broad=R.examples(), sparse=broad.filter(s=>['road','mud'].includes(s.type));
{
 const mission=R.create('forest'),mud=mission.grid[100],bad=broad.map(s=>({...s,observed:s.y,y:s.type==='mud'&&s.y===1?0:s.y}));
 assert(R.danger(mud.f));assert.equal(R.predict(bad,mud.f),0,'The physical observation never overrides a child label');
 const wrong=R.plan(mission,bad);assert(wrong.path.includes(100));assert(wrong.energy<R.optimum(mission).energy,'Wrong training tempts the model to take an unsafe shortcut');
 const repaired=bad.map(s=>s.type==='mud'&&s.observed===1?{...s,y:1}:s);
 assert.equal(R.predict(repaired,mud.f),1);assert(!R.plan(mission,repaired).path.includes(100));
 assert.equal(R.plan(mission,repaired).energy,R.optimum(mission).energy);
}
for(const id of ['forest','gorge']){
 const m=R.create(id),optimal=R.optimum(m),trained=R.plan(m,id==='gorge'?[...broad,{f:m.grid[55].f,y:0,type:'gravel'}]:broad);
 assert(trained);assert.equal(trained.energy,optimal.energy,'Training examples generalize to unseen sensor readings');
 assert(new Set(optimal.path.map(i=>m.grid[i].type)).size>=(id==='forest'?5:9),'The best path needs diverse terrain knowledge');
 assert.equal(R.plan(m,[]),null);assert.equal(R.plan(m,sparse),null,'Two familiar surfaces cannot solve the mission');
 const moved={...m,start:optimal.path[2]};const image=JSON.stringify(m.grid);assert.equal(R.optimum(moved).energy,reference(moved));assert.equal(JSON.stringify(m.grid),image,'Moving the start must preserve terrain and cargo');
 const falseLabels=broad.map(s=>({...s,y:1-s.y}));const wrong=R.plan(m,falseLabels);assert(!wrong||wrong.path.some(i=>R.danger(R.features(m.grid[i],m.rain))),'Wrong teaching must cause a blocked or unsafe real route');
}
assert.equal(R.predict([], [0,0,0,0]),null,'Unknown terrain is explicit, never silently safe');
const rainy=R.create('rain');assert.equal(R.plan(rainy,broad),null,'Changed sensors expose gaps in old teaching');
const adapted=[...broad,...broad.map(s=>{const f=R.features({f:s.f},true);return {...s,f,y:+R.danger(f)};})];
assert.equal(R.plan(rainy,adapted).energy,reference(rainy),'New wet examples restore the optimum');
const fieldLearning=[...broad];let additions=0;
for(const type of Object.keys(R.names))for(const y of [0,1]){
 const cell=rainy.grid.find(c=>c.type===type&&+R.danger(R.features(c,true))===y);
 if(cell){const f=R.features(cell,true);if(R.predict(fieldLearning,f)!==y){fieldLearning.push({type,f,y});additions++;}}
}
assert(additions<=9,'Rain can be corrected with a small set of real field examples');
assert.equal(R.plan(rainy,fieldLearning).energy,reference(rainy),'No exhaustive labelling of the rain map is needed');
const bad=[{f:[10,10,10,90],y:1},{f:[11,10,10,90],y:1},{f:[12,10,10,90],y:1}];assert(R.predict(bad,[10,10,10,90]),'Wrong labels must affect the real prediction');
console.log('Robot: independent optimum, diverse solutions, safe attainable maximum, rain and wrong-label behavior passed');

const gorge=R.create('gorge');assert.equal(R.plan(gorge,broad),null,'The rockfall requires a new field observation');
const osyp=[...broad,{type:'gravel',f:gorge.grid[55].f,y:0}];assert.equal(R.plan(gorge,osyp).energy,reference(gorge),'One observed pass transfers to similar passes');
for(const type of Object.keys(R.names)){const pair=broad.filter(s=>s.type===type);assert.notDeepEqual(R.sensorWords(pair[0].f),R.sensorWords(pair[1].f),'Sensor words distinguish safe and dangerous '+type);}

const forest=R.create('forest'),smallForest=[...introductory];let forestAdditions=0;
for(const type of ['road','sand','mud','gravel','grass'])for(const y of [0,1]){const c=forest.grid.find(c=>c.type===type&&+R.danger(c.f)===y);if(c&&R.predict(smallForest,c.f)!==y){smallForest.push({type,y,f:c.f});forestAdditions++;}}
assert(forestAdditions<=6,'The forest can be learned with a few observations after the introduction');assert.equal(R.plan(forest,smallForest).energy,reference(forest));

// A transfer check cannot claim success through an exact copy of the tested readings.
{
 const f=[12,8,12,90],copy={type:'road',f,y:0};
 assert.equal(R.transfer([copy],f).label,null);
 const neighbor={type:'road',f:[13,8,12,90],y:0};
 assert.equal(R.transfer([copy,neighbor],f).label,0);
 assert.equal(R.transfer([{...copy,y:1},neighbor],f).label,0,'The held-out exact answer never leaks into the transfer forecast');
 assert.deepEqual([copy,neighbor],[{type:'road',f,y:0},neighbor]);
}

// The new learning goal remains attainable with a small evolving dataset.
// These are child-observable field samples, not full-map labels or oracle routing.
const modest=[...introductory];
for(const id of ['forest','gorge','rain']){
 const mission=R.create(id),types=id==='forest'?['mud','gravel','sand']:id==='gorge'?['water','gravel','hill']:['mud','hill','gravel'];
 for(const type of types){const cell=mission.grid.find(c=>c.type===type&&!R.danger(R.features(c,mission.rain))&&R.predict(modest,R.features(c,mission.rain))!==0);assert(cell);modest.push({type,f:R.features(cell,mission.rain),y:0});}
 if(id==='rain'){const cell=mission.grid.find(c=>c.type==='grass'&&R.danger(R.features(c,true)));modest.push({type:'grass',f:R.features(cell,true),y:1});}
 assert.equal(R.plan(mission,modest).energy,reference(mission));
 for(const y of [0,1])assert(mission.grid.some(c=>c.type!=='wall'&&+R.danger(R.features(c,mission.rain))===y&&R.transfer(modest,R.features(c,mission.rain)).label===y),'Both transfer checks are possible with few observations in '+id);
}
assert.equal(modest.length,12,'No exhaustive labelling is needed for delivery and transfer');
