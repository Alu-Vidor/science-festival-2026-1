const assert=require('node:assert/strict'),R=require('../robot-engine'),D=require('../robot-delivery');
const {schedule,campaign}=require('./robot-browser-helpers.cjs');
const sets=m=>Array.from({length:15},(_,i)=>m.orders.filter((_,j)=>(i+1)>>j&1).map(o=>o.id)).filter(s=>D.validSelection(m,s));
const oracle=R.train(Object.keys(R.terrains).flatMap(type=>[false,true].flatMap(dirty=>[0,1,2].map(wet=>({type,before:{dirty,wet},...R.physical(type,{dirty,wet})})))));
// Independent shortest-path oracle uses actual physics and its own queue/state representation.
function physicalCost(m,selected){
 const q=[[0,'S',false,0,0]],seen=new Set();
 while(q.length){q.sort((a,b)=>a[0]-b[0]);const [cost,node,dirty,wet,mask]=q.shift(),key=[node,dirty,wet,mask].join();if(seen.has(key))continue;seen.add(key);
  if(node==='S'&&mask===(1<<selected.length)-1)return cost;
  for(const e of m.edges){const next=e.a===node?e.b:e.b===node?e.a:null;if(!next)continue;let state={dirty,wet},spent=cost,stalled=false;
   for(let i=0;i<e.length;i++){const v=R.physical(e.type,state);spent+=v.energy;state=v.after;if(v.stalled){stalled=true;break;}}
   if(!stalled)q.push([spent,next,state.dirty,state.wet,mask|(selected.includes(next)?1<<selected.indexOf(next):0)]);
  }
 }return Infinity;
}
const initial=D.plan(D.district(0),['G'],[]),physical=R.physical;
R.physical=()=>{throw Error('Planner accessed ground truth');};assert.deepEqual(D.plan(D.district(0),['G'],[]),initial);R.physical=physical;
assert.equal(initial.route.at(-1),'S');assert(!D.outcome(D.district(0),['G'],D.simulate(D.district(0),initial.route)).success);
let coldTotal=0,maxTotal=0;const fixed=new Map(),tourShapes=[];
for(let round=0;round<3;round++){
 const m=D.district(round),legal=sets(m);assert.equal(legal.length,9);assert(m.orders.every(o=>o.title.length>3));assert.equal(D.plan(m,m.orders.map(o=>o.id),[]),null);
 let cold=0,max=0;const viable=[],costs=[];
 for(const ids of legal){
  const p=D.plan(m,ids,oracle),a=D.simulate(m,p.route),optimal=physicalCost(m,ids);assert.equal(p.energy,optimal);assert.equal(p.route.at(-1),'S');
  const v=D.outcome(m,ids,a);assert.equal(v.success,optimal<=m.budget);if(ids.length===1)assert(v.success,'Every individual order is reachable');
  costs.push(optimal);max=Math.max(max,v.stars);if(v.stars>=5)viable.push(p.route.join());
  const n=D.plan(m,ids,[]),nc=n?D.outcome(m,ids,D.simulate(m,n.route)).stars:0;cold=Math.max(cold,nc);
  const shape=ids.map(id=>m.orders.findIndex(o=>o.id===id)).join();fixed.set(shape,(fixed.get(shape)||0)+nc);
  // Reaching all destinations without coming home never earns stars.
  const lastDelivery=Math.max(...ids.map(id=>p.route.lastIndexOf(id))),oneway=p.route.slice(0,lastDelivery+1);
  assert.equal(D.outcome(m,ids,D.simulate(m,oneway)).stars,0);
  if(v.success){const drained={...m,budget:D.simulate(m,oneway).spent},stopped=D.simulate(drained,p.route),result=D.outcome(drained,ids,stopped);assert(stopped.exhausted);assert.equal(result.delivered.length,ids.length);assert.equal(result.stars,0,'All parcels delivered, but battery empty on return: zero stars');}
 }
 assert.equal(cold,[4,2,2][round]);assert.equal(max,[5,6,6][round]);assert(new Set(costs).size>=4);assert(new Set(viable).size>=2,'At least two high-scoring assignments have different tours');
 const highest=[m.orders[0].id,m.orders[3].id],greedy=D.plan(m,highest,[]);assert.equal(D.outcome(m,highest,D.simulate(m,greedy.route)).stars,0,'Blindly taking the most stars must fail');
 tourShapes.push(D.plan(m,campaign[round].selected,oracle).route.join());coldTotal+=cold;maxTotal+=max;
 console.log(m.title+': 9 legal sets; no-learning ceiling '+cold+'; physical maximum '+max);
}
assert.equal(coldTotal,8);assert.equal(maxTotal,D.MAX_STARS);assert(Math.max(...fixed.values())<=8);assert.equal(new Set(tourShapes).size,3);
let trips=[];
for(let round=0;round<3;round++){
 for(const route of schedule[round]){
  const a=D.simulate(D.laboratory(),route),learned=trips.map((t,i)=>t.taught?i:-1).filter(i=>i>=0);
  trips.push({kind:'experiment',round,route,selected:[],learned,steps:a.observations.length,ended:true,interrupted:false,taught:false});
  const before=D.model(trips);trips.at(-1).taught=true;assert(D.model(trips).length>=before.length);
 }
 const m=D.district(round),selected=campaign[round].selected,p=D.plan(m,selected,D.model(trips)),a=D.simulate(m,p.route);
 assert.equal(p.energy,a.spent);assert.equal(D.outcome(m,selected,a).stars,campaign[round].stars);
 const t={kind:'delivery',round,route:p.route,selected,learned:trips.map((t,i)=>t.taught?i:-1).filter(i=>i>=0),steps:a.observations.length,ended:true,interrupted:false,taught:true};trips.push(t);
 const s={rules:D.VERSION,round,view:'district',route:['S'],selected,trips};assert(D.validate(s));
 for(const mutate of [x=>x.trips.at(-1).route=['S','G'],x=>x.selected=m.orders.map(o=>o.id),x=>x.trips.at(-1).selected=m.orders.map(o=>o.id)]){const corrupt=structuredClone(s);mutate(corrupt);assert(!D.validate(corrupt));}
 assert.equal(D.outcome(m,selected,a,true).stars,0,'Abort cannot retain points');
}
assert.deepEqual(D.score(trips),{stars:17,reserve:16,deliveries:3});assert.equal(trips.length,9);
assert(D.simulate(D.laboratory(),['S','W','S']).state.dirty,'Passing the base does not reset wheels');
const broken={rules:D.VERSION,round:0,view:'lab',selected:[],route:['S'],trips:[...trips.slice(0,2),{...trips[0]}]};assert(!D.validate(broken));assert(!D.validate({...broken,trips:[],route:['S','G']}));
for(const ids of [[],['L','L'],['?'],['Y','G']])assert.equal(D.plan(D.district(0),ids,[]),null);
console.log('Delivery: cargo, mandatory return, independent optimal tours, blind-strategy ceiling, 17 attainable stars, frozen history and attempt limits passed');

// The visible safe-looking upper corridor is a distance tradeoff, not a free win.
const upper=['S','U','V','T','G'],upperTour=[...upper,...upper.slice(0,-1).reverse()];
assert(D.steps(D.district(0),upper).every(s=>s.type==='road'));
assert.equal(D.simulate({...D.district(0),budget:Infinity},upper).spent,38);
for(let round=0;round<3;round++){
 const m=D.district(round),unlimited=D.simulate({...m,budget:Infinity},upperTour),actual=D.simulate(m,upperTour);
 assert.equal(unlimited.spent,[76,114,82][round]);
 assert(unlimited.spent>m.budget,'The upper corridor cannot complete a return trip within the battery');
 assert(!actual.finished,'A long safe-looking route must actually run out of charge');
}
const asphaltModel=R.train(D.simulate(D.laboratory(),upper).observations);
assert.equal(asphaltModel.length,1);assert.equal(asphaltModel[0].type,'road');
const asphaltCeiling=Array.from({length:3},(_,round)=>{
 const m=D.district(round);
 return Math.max(...sets(m).map(ids=>{const p=D.plan(m,ids,asphaltModel);return p?D.outcome(m,ids,D.simulate(m,p.route)).stars:0;}));
}).reduce((a,b)=>a+b,0);
assert.equal(asphaltCeiling,8,'Training only on clean dry asphalt cannot replace exploring wheel effects');

// Give the lazy strategies every advantage: they may choose the best actual
// outcome in each district and explicitly learn from every completed delivery.
// A repeated lab route produces identical observations, so teaching it again
// between districts cannot add data. Cache only physically identical data sets.
const maps=Array.from({length:3},(_,r)=>D.district(r)),choices=maps.map(sets),lab=D.laboratory();
const learnedModels=new Map(),decisions=new Map(),futureScores=new Map();
const learnedKey=m=>m.map(R.key).sort().join('|');
function remember(rows){
 const m=R.train(rows),key=learnedKey(m);if(!learnedModels.has(key))learnedModels.set(key,m);return key;
}
function bestRemainder(round,key){
 if(round===D.ROUNDS)return 0;
 const cacheKey=round+'#'+key;if(futureScores.has(cacheKey))return futureScores.get(cacheKey);
 let best=-Infinity;
 for(const selected of choices[round]){
  const decisionKey=cacheKey+'#'+selected.join(','),map=maps[round];let decision=decisions.get(decisionKey);
  if(!decisions.has(decisionKey)){
   const m=learnedModels.get(key),p=D.plan(map,selected,m);
   if(!p)decision=null;
   else{
    const a=D.simulate(map,p.route),v=D.outcome(map,selected,a);
    decision={stars:v.stars,next:remember([...m,...a.observations])};
   }
   decisions.set(decisionKey,decision);
  }
  if(decision)best=Math.max(best,decision.stars+bestRemainder(round+1,decision.next));
 }
 futureScores.set(cacheKey,best);return best;
}
assert.equal(bestRemainder(0,remember([])),12,'Learning only from deliveries cannot approach 17 by taking the easy first pair');
const repeatedModels=new Map(),prefixModels=new Map();let routeCount=0,prefixCount=0;
function visitLab(route){
 if(route.length>1){
  routeCount++;const observations=D.simulate(lab,route).observations,key=remember(observations);
  if(!repeatedModels.has(key))repeatedModels.set(key,route);
  for(let n=0;n<=observations.length;n++){
   prefixCount++;const prefixKey=remember(observations.slice(0,n));
   if(!prefixModels.has(prefixKey))prefixModels.set(prefixKey,new Set());
   prefixModels.get(prefixKey).add(key);
  }
 }
 if(route.length===7)return;
 for(const e of lab.edges){const next=e.a===route.at(-1)?e.b:e.b===route.at(-1)?e.a:null;if(next)visitLab([...route,next]);}
}
visitLab(['S']);
assert.equal(routeCount,1745);assert.equal(repeatedModels.size,112);
const repeatedCeilings=[...repeatedModels.keys()].map(key=>bestRemainder(0,key));
assert.equal(Math.max(...repeatedCeilings),13,'No single repeated experiment, even with optimal orders and learning from deliveries, can win');
assert.equal(repeatedCeilings.filter(n=>n===13).length,1);
assert.equal(prefixCount,22010);assert.equal(prefixModels.size,143);
assert.equal(Math.max(...[...prefixModels.keys()].map(key=>bestRemainder(0,key))),13,'Stopping the same experiment halfway does not defeat its ceiling');
let firstRoundModels=0;
for(const [key,extensions] of prefixModels){
 const m=learnedModels.get(key);
 for(const selected of choices[0]){
  const p=D.plan(maps[0],selected,m);if(!p)continue;
  const a=D.simulate(maps[0],p.route);if(D.outcome(maps[0],selected,a).stars!==5)continue;
  firstRoundModels++;
  assert.deepEqual([...extensions],[key],'The only data capable of 5 stars already exhaust the repeated route; changing the later stop adds nothing');
  for(const nextModel of [m,R.train([...m,...a.observations])]){
   for(const second of choices[1].filter(ids=>maps[1].orders.filter(o=>ids.includes(o.id)).reduce((n,o)=>n+o.stars,0)===6)){
    const next=D.plan(maps[1],second,nextModel);
    assert(!next||D.outcome(maps[1],second,D.simulate(maps[1],next.route)).stars===0,'Skipping delivery teaching cannot rescue the repeated route at the second district');
   }
  }
 }
}
assert.equal(firstRoundModels,1,'Only one prefix model and one actual 5-star assignment require the teaching-skip check');
const singleCeiling=maps.reduce((total,map,round)=>total+Math.max(...choices[round].filter(ids=>ids.length===1).map(ids=>{
 const p=D.plan(map,ids,oracle);return D.outcome(map,ids,D.simulate(map,p.route)).stars;
})),0);
assert.equal(singleCeiling,12,'Taking only individual orders cannot earn all stars, even with complete knowledge');
const fixedOrderCeiling=Math.max(...sets(maps[0]).map(ids=>{
 const positions=ids.map(id=>maps[0].orders.findIndex(o=>o.id===id));
 return maps.reduce((total,map)=>{const selected=positions.map(i=>map.orders[i].id),p=D.plan(map,selected,oracle);return total+D.outcome(map,selected,D.simulate(map,p.route)).stars;},0);
}));
assert.equal(fixedOrderCeiling,15,'A universal cargo selection cannot win even with complete knowledge');

// Every animation checkpoint is reloadable. Interrupting after any displayed
// step preserves measurements but never rewards an unfinished delivery.
let checkpoints=0;
for(let i=0;i<trips.length;i++){
 const original=trips[i],before=trips.slice(0,i),beforeScore=D.score(before),beforeModel=D.model(before);
 for(let count=0;count<=original.steps;count++){
  const partial={...structuredClone(original),steps:count,ended:false,taught:false,interrupted:false};
  const state={rules:D.VERSION,round:original.round,view:original.kind==='experiment'?'lab':'district',selected:original.selected,route:original.kind==='experiment'?original.route:['S'],trips:[...before,partial]};
  assert(D.validate(state),'Every displayed checkpoint must survive reload');
  assert.equal(D.measured(partial).length,count,'Unshown future steps cannot enter training');
  partial.ended=true;partial.interrupted=true;
  assert(D.validate(state));assert.deepEqual(D.model(state.trips),beforeModel,'Reload cannot silently transfer measurements');
  assert.deepEqual(D.score(state.trips),beforeScore,'Interruptions never add stars or reserve');
  assert.deepEqual(D.actual(partial),D.actual(JSON.parse(JSON.stringify(partial))),'Restoring an interruption preserves the same measured result');
  checkpoints++;
 }
}
const duplicated={rules:D.VERSION,round:0,view:'district',selected:trips[2].selected,route:['S'],trips:[...trips.slice(0,3),trips[2]]};
assert(!D.validate(duplicated),'A repeated scored departure is never a valid saved party');
assert(!D.validate({rules:'cargo-school-2',round:2,view:'district',selected:trips.at(-1).selected,route:['S'],trips}),'The changed roads and battery cannot reinterpret an older party');
const newParty={rules:D.VERSION,round:0,view:'district',selected:[],route:['S'],trips:[]};
assert(D.validate(newParty));assert.deepEqual(D.score(newParty.trips),{stars:0,reserve:0,deliveries:0});assert.deepEqual(D.model(newParty.trips),[]);
console.log(`Robot strategy audit: 1745 routes / 22010 stoppable prefixes, ceilings 8/12/13/12/15 vs attainable 17; ${checkpoints} reload and interruption checkpoints passed`);
