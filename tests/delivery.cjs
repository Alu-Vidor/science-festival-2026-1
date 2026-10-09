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
assert.deepEqual(D.score(trips),{stars:17,reserve:32,deliveries:3});assert.equal(trips.length,9);
assert(D.simulate(D.laboratory(),['S','W','S']).state.dirty,'Passing the base does not reset wheels');
const broken={rules:D.VERSION,round:0,view:'lab',selected:[],route:['S'],trips:[...trips.slice(0,2),{...trips[0]}]};assert(!D.validate(broken));assert(!D.validate({...broken,trips:[],route:['S','G']}));
for(const ids of [[],['L','L'],['?'],['Y','G']])assert.equal(D.plan(D.district(0),ids,[]),null);
console.log('Delivery: cargo, mandatory return, independent optimal tours, blind-strategy ceiling, 17 attainable stars, frozen history and attempt limits passed');
