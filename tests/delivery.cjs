const assert=require('node:assert/strict'),R=require('../robot-engine'),D=require('../robot-delivery');
const schedule=require('./robot-browser-helpers.cjs').schedule;
// Physics is independent from the planner. Poisoning its public oracle cannot alter a plan.
const initial=D.plan(D.district(0),['G'],[]),physical=R.physical;
R.physical=()=>{throw Error('Planner accessed ground truth');};assert.deepEqual(D.plan(D.district(0),['G'],[]),initial);R.physical=physical;
assert.equal(initial.energy,28);assert(!D.outcome(D.district(0),['G'],D.simulate(D.district(0),initial.route)).success);
const observations=schedule[0].flatMap(route=>D.simulate(D.laboratory(),route).observations);
assert.equal(D.plan(D.district(0),['G'],[]).energy,28);
assert.notDeepEqual(D.plan(D.district(0),['G'],R.train(observations)).route,initial.route,'Learning must change an autonomous decision');
// Exhaustive state data is a test oracle only. It never enters the game.
const oracle=[];for(const type of Object.keys(R.terrains))for(const dirty of [false,true])for(let wet=0;wet<3;wet++){const before={dirty,wet};oracle.push({type,before,...R.physical(type,before)});}
let naive=0,safe=0;const routes=[];
for(let round=0;round<3;round++){
 const m=D.district(round),selected=m.orders.map(o=>o.id),n=D.plan(m,selected,[]),p=D.plan(m,selected,oracle),a=D.simulate(m,p.route);
 assert(p&&p.withinBudget);assert.equal(p.energy,a.spent);assert.equal(D.outcome(m,selected,a).stars,6);routes.push(p.route.join());
 naive+=D.outcome(m,selected,D.simulate(m,n.route)).stars;
 const easy=[m.orders[0].id],ep=D.plan(m,easy,[]);safe+=D.outcome(m,easy,D.simulate(m,ep.route)).stars;
 const costs=[];
 for(let mask=1;mask<8;mask++){const ids=m.orders.filter((_,i)=>mask>>i&1).map(o=>o.id),q=D.plan(m,ids,oracle);assert(q);assert(D.outcome(m,ids,D.simulate(m,q.route)).success);costs.push(q.energy);}
 assert(new Set(costs).size>=5,'Different assignments have materially different energy costs');
 // Independently enumerate simple full-order paths to ensure several viable alternatives.
 const solutions=[];function visit(route){const end=route.at(-1);if(selected.every(n=>route.includes(n))){const actual=D.simulate(m,route);if(actual.finished)solutions.push(actual.spent);return;}for(const e of m.edges){const next=e.a===end?e.b:e.b===end?e.a:null;if(next&&!route.includes(next))visit([...route,next]);}}
 visit(['S']);assert(solutions.length>=3,'Full assignment must have several feasible paths');console.log(m.title+':',solutions.length,'successful full-order routes; best learned route',p.energy);
}
assert.equal(naive,6,'Always selecting all orders without learning cannot win');assert.equal(safe,3,'Repeating the safest choice cannot win');assert.equal(new Set(routes).size,3,'The best full-order path changes between districts');
let trips=[];
for(let round=0;round<3;round++){
 for(const route of schedule[round]){
  const a=D.simulate(D.laboratory(),route),learned=trips.map((t,i)=>t.taught?i:-1).filter(i=>i>=0);
  trips.push({kind:'experiment',round,route,selected:[],learned,steps:a.observations.length,ended:true,interrupted:false,taught:false});
  const before=D.model(trips);trips.at(-1).taught=true;assert(D.model(trips).length>=before.length);
 }
 const m=D.district(round),selected=m.orders.map(o=>o.id),p=D.plan(m,selected,D.model(trips)),a=D.simulate(m,p.route);
 const t={kind:'delivery',round,route:p.route,selected,learned:trips.map((t,i)=>t.taught?i:-1).filter(i=>i>=0),steps:a.observations.length,ended:true,interrupted:false,taught:true};trips.push(t);
 assert.equal(D.outcome(m,selected,a).stars,6);
 const s={rules:D.VERSION,round,view:'district',route:['S'],selected,trips};assert(D.validate(s));
 const corrupt=structuredClone(s);corrupt.trips.at(-1).route=['S','G'];assert(!D.validate(corrupt));
 assert.equal(D.outcome(m,selected,a,true).stars,0,'Abort cannot retain full-order points');
}
assert.equal(D.score(trips).stars,18);assert.equal(D.score(trips).reserve,26);assert(trips.length===9);
const partial={...D.simulate(D.district(0),['S','W','U']),finished:false};assert.equal(D.outcome(D.district(0),['U','G'],partial).stars,0,'Partial sets cannot farm rewards');
assert(D.simulate(D.laboratory(),['S','W','S']).state.dirty,'Returning to base on a route does not reset wheels');
const broken={rules:D.VERSION,round:0,view:'lab',selected:[],route:['S'],trips:[...trips.slice(0,2),{...trips[0]}]};assert(!D.validate(broken),'Third experiment is rejected');
assert(!D.validate({...broken,trips:[],route:['S','G']}));assert.equal(D.plan(D.district(0),[],[]),null);
console.log('Delivery: autonomous learned routing, real errors, 18 attainable stars, risky sets, diverse paths, fixed limits, frozen history and checkpoints passed');
