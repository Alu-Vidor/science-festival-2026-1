const assert=require('node:assert/strict'), R=require('../robot-engine.js');
// Independent product-graph Dijkstra: state is (cell, set of delivered parcels).
// This does not use the production goal permutations or segment planner.
function reference(m){
 const goals=m.grid.flatMap((c,i)=>c.object==='parcel'?[i]:[]), bit=new Map(goals.map((g,i)=>[g,1<<i]));
 const full=(1<<goals.length)-1, distances=new Map([[m.start,0]]), queue=[[0,m.start,0]];
 while(queue.length){queue.sort((a,b)=>b[0]-a[0]);const [cost,pos,mask]=queue.pop(), key=mask*144+pos;if(cost!==distances.get(key))continue;if(mask===full)return cost;
  const x=pos%12,y=Math.floor(pos/12);for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(nx<0||nx>=12||ny<0||ny>=12)continue;const v=ny*12+nx,c=m.grid[v];if(c.type==='wall')continue;const f=[...c.f];if(m.rain)f[0]=Math.min(100,f[0]+25);if(f[0]>=70||f[1]>=70||f[0]+f[2]>=110||f[3]<=30)continue;const nextMask=mask|(bit.get(v)||0),nextKey=nextMask*144+v,nextCost=cost+({road:1,sand:2,mud:3,hill:4,water:4,gravel:2,grass:2,clay:3,ice:2}[c.type]);if(nextCost<(distances.get(nextKey)??Infinity)){distances.set(nextKey,nextCost);queue.push([nextCost,v,nextMask]);}}
 }return Infinity;
}
assert(R.danger([0,0,0,30]));assert(!R.danger([0,0,0,31]));
const signatures=new Set();
for(const id of R.ids){
 const m=R.create(id),o=R.optimum(m);assert(o);assert.equal(o.energy,reference(m));assert(o.energy<=m.budget);assert.equal(m.grid.length,144);
 assert.deepEqual(R.create(id),m,'Maps must be deterministic');signatures.add(JSON.stringify(m.grid));
 const goals=m.grid.flatMap((c,i)=>c.object==='parcel'?[i]:[]),model=m.grid.filter(c=>c.type!=='wall').map(c=>({f:R.features(c,m.rain),y:+R.danger(R.features(c,m.rain))}));
 const energies=new Set();let maxReachable=false;
 for(const mode of ['steps','energy'])for(const order of R.permutations(goals)){
  let pos=m.start,energy=0;const remaining=new Set(goals);
  for(const goal of order){if(!remaining.has(goal))continue;const path=R.shortest(m.grid,pos,goal,{rain:m.rain,model,mode});assert(path,'All authored deliveries remain reachable with a correct model');for(const i of path){assert(!R.danger(R.features(m.grid[i],m.rain)));energy+=R.costs[m.grid[i].type];remaining.delete(i);}pos=goal;}
  energies.add(energy);if(energy===o.energy)maxReachable=true;
 }
 if(m.max){assert(energies.size>=3,'Each expedition offers genuinely different energy outcomes');assert(maxReachable,'Maximum is attainable using the same planner as players');assert.equal(R.score({max:m.max,delivered:goals.length,parcels:goals.length,energy:o.energy,optimal:o.energy,complete:true}),m.max);for(let extra=1;extra<100;extra++)assert(R.score({max:m.max,delivered:goals.length,parcels:goals.length,energy:o.energy+extra,optimal:o.energy,complete:true})<m.max);assert(R.score({max:m.max,delivered:goals.length-1,parcels:goals.length,energy:1,optimal:o.energy,complete:false})<m.max);}
 console.log(id+': exact minimum '+o.energy+', alternatives '+[...energies].sort((a,b)=>a-b).join('/'));
}
assert.equal(signatures.size,4);
const wet=R.tile('clay',0,[40,25,45,75]);assert(!R.danger(R.features(wet,false)));assert(R.danger(R.features(wet,true)));
const broad=R.examples(), sparse=broad.filter(s=>['road','mud'].includes(s.type));
for(const id of ['forest','gorge']){
 const m=R.create(id),optimal=R.optimum(m),trained=R.plan(m,broad);
 assert(trained);assert.equal(trained.energy,optimal.energy,'Training examples generalize to unseen sensor readings');
 assert(new Set(optimal.path.map(i=>m.grid[i].type)).size>=7,'The best path needs diverse terrain knowledge');
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
