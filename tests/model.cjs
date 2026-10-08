const assert=require('node:assert/strict'),R=require('../robot-engine.js');
const m=R.create(),direct=['S','W','X','Y','G'],wash=['S','W','U','V','T','G'],bottom=['S','L','M','N','G'],wetHill=['S','W','X','M','X','Y','G'];
const a=R.simulate(m,direct),b=R.simulate(m,wash),c=R.simulate(m,bottom),failure=R.simulate(m,wetHill);
assert.deepEqual([a.spent,b.spent,c.spent],[55,35,40]);
assert(a.finished&&b.finished&&c.finished);assert(failure.stalled&&!failure.finished);
assert.equal(R.deliveryScore(m,failure,wetHill),0);
assert.equal(R.deliveryScore(m,b,wash),12);assert(R.deliveryScore(m,a,direct)<12);
assert.equal(R.physical('road',{dirty:false,wet:0}).energy,2);
assert.equal(R.physical('road',{dirty:true,wet:0}).energy,5);
assert.deepEqual(R.physical('water',{dirty:true,wet:0}).after,{dirty:false,wet:2});
assert(R.physical('hill',{dirty:false,wet:1}).stalled);
assert(!R.physical('hill',{dirty:false,wet:0}).stalled);
const clean=R.physical('gravel',{dirty:true,wet:0});assert.equal(clean.after.dirty,false);assert.equal(R.physical('road',clean.after).energy,2);
assert.throws(()=>R.routeSteps(m,['S','G']));assert.throws(()=>R.routeSteps(m,['W','X']));assert.throws(()=>R.routeSteps(m,[...wash,'T']));
// Backtracking is a real trip, never an implicit reset/refill.
const back=R.simulate(m,['S','W','S']);assert(back.spent>0&&back.state.dirty);
const exhaustion=R.simulate(m,['S',...Array(14).fill(['W','S']).flat()]);assert(exhaustion.exhausted&&!exhaustion.finished);assert(exhaustion.spent<=60);
const observations=structuredClone(a.observations),cold=R.forecast(m,direct,[]);assert.equal(cold.spent,28);
const weak=R.train(observations);assert.equal(R.forecast(m,direct,weak).spent,55);assert.equal(R.forecast(m,direct,[]).spent,28,'Measurements do not silently update a separate model');
assert(weak.every(o=>Object.keys(o).sort().join(',')==='after,before,energy,stalled,type'),'No route, map, future, or oracle enters the model');
const original=JSON.stringify(weak);observations[0].energy=999;assert.equal(JSON.stringify(weak),original,'Model is a frozen copy');
assert.equal(R.assess([]).score,0);
assert.equal(R.assess(weak).correct,2,'One successful delivery is not broad learning');
const trainingRoutes=[direct,wash,bottom,wetHill,['S','U','V','X','Y','G'],['S','W','L','M','N','G'],['S','W','X','M','N','Y','G']];
const rich=R.train(trainingRoutes.flatMap(route=>R.simulate(m,route).observations));
console.log('Varied experience:',R.assess(rich).score,R.assess(rich).correct);
assert(R.assess(rich).correct>=4);assert(R.assess(rich).score>R.assess(weak).score);
assert.equal(R.forecast(m,wetHill,rich).stalled,true,'Wet wheels must affect future uphill predictions after learning');
const unseen=['S','W','U','V','T','Y','G'];assert(!trainingRoutes.some(r=>JSON.stringify(r)===JSON.stringify(unseen)));
assert.equal(R.forecast(m,unseen,rich).spent,R.simulate(m,unseen).spent,'Learned step transitions compose on an untraveled route');
const before=JSON.stringify(rich);R.assess(rich);assert.equal(JSON.stringify(rich),before,'Control journeys never teach the model');
for(let stage=0;stage<2;stage++){
  const map=R.create(stage),opt=R.optimum(map);assert.equal(R.simulate(map,opt.route).spent,opt.energy);assert.equal(R.deliveryScore(map,R.simulate(map,opt.route),opt.route),map.max);
  // Enumerate simple paths independently to verify genuine alternatives and the optimum.
  const valid=[];function visit(route){const end=route.at(-1);if(end==='G'){const r=R.simulate(map,route);if(r.finished)valid.push(r.spent);return;}for(const e of map.edges){const next=e.a===end?e.b:e.b===end?e.a:null;if(next&&!route.includes(next))visit([...route,next]);}}
  visit(['S']);assert(valid.length>=10);assert(new Set(valid).size>=5);assert.equal(Math.min(...valid),opt.energy);
  console.log(map.title+':',valid.length,'successful routes,',new Set(valid).size,'different energy totals, best',opt.energy);
}
console.log('Robot: route choice, stateful physics, frozen learning, transfer, control checks and independent route benchmarks passed');
