const assert=require('node:assert/strict'), R=require('../robot-engine.js');
// Independent product-graph Dijkstra: state is (cell, set of delivered parcels).
// This does not use the production goal permutations or segment planner.
function reference(m){
 const goals=m.grid.flatMap((c,i)=>c.object==='parcel'?[i]:[]), bit=new Map(goals.map((g,i)=>[g,1<<i]));
 const full=(1<<goals.length)-1, distances=new Map([[m.start,0]]), queue=[[0,m.start,0]];
 while(queue.length){queue.sort((a,b)=>b[0]-a[0]);const [cost,pos,mask]=queue.pop(), key=mask*144+pos;if(cost!==distances.get(key))continue;if(mask===full)return cost;
  const x=pos%12,y=Math.floor(pos/12);for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(nx<0||nx>=12||ny<0||ny>=12)continue;const v=ny*12+nx,c=m.grid[v];if(c.type==='wall')continue;const f=[...c.f];if(m.rain)f[0]=Math.min(100,f[0]+25);if(f[0]>=70||f[1]>=70||f[0]+f[2]>=110||f[3]<=30)continue;const nextMask=mask|(bit.get(v)||0),nextKey=nextMask*144+v,nextCost=cost+({road:1,sand:2,mud:3,hill:4,water:5}[c.type]);if(nextCost<(distances.get(nextKey)??Infinity)){distances.set(nextKey,nextCost);queue.push([nextCost,v,nextMask]);}}
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
const wet=R.create('rain').grid[3*12+3];assert(!R.danger(R.features(wet,false)));assert(R.danger(R.features(wet,true)),'The rain mission must require adapting to changed sensors');
const bad=[{f:[10,10,10,90],y:1},{f:[11,10,10,90],y:1},{f:[12,10,10,90],y:1}];assert(R.predict(bad,[10,10,10,90]),'Wrong labels must affect the real prediction');
console.log('Robot: independent optimum, diverse solutions, safe attainable maximum, rain and wrong-label behavior passed');
