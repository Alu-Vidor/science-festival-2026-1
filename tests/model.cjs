const assert=require('node:assert/strict'),R=require('../robot-engine');
assert.equal(R.physical('road',{dirty:false,wet:0}).energy,2);
assert.equal(R.physical('road',{dirty:true,wet:0}).energy,5);
assert.deepEqual(R.physical('water',{dirty:true,wet:0}).after,{dirty:false,wet:2});
assert(R.physical('hill',{dirty:false,wet:1}).stalled);
assert(!R.physical('hill',{dirty:false,wet:0}).stalled);
const clean=R.physical('gravel',{dirty:true,wet:0});assert.equal(clean.after.dirty,false);assert.equal(R.physical('road',clean.after).energy,2);
assert.equal(R.physical('sand',{dirty:false,wet:2}).after.wet,0);
const steps=types=>types.map(type=>({type}));
const wet=steps(['water','hill']),mud=steps(['mud','road','road','road']);
assert(R.journey(wet,R.physical).stalled);
const partial=R.journey(mud,R.physical,9);assert(partial.exhausted);assert.equal(partial.spent,8);assert.equal(partial.observations.length,2,'Unexecuted steps are not training examples');
const observations=R.journey(mud,R.physical).observations,weak=R.train(observations);
assert(weak.every(o=>Object.keys(o).sort().join(',')==='after,before,energy,stalled,type'),'No route, map, future, or oracle enters the model');
const original=JSON.stringify(weak);observations[0].energy=999;assert.equal(JSON.stringify(weak),original,'Model is a frozen copy');
assert.equal(R.train([...observations,...observations]).length,weak.length,'Repeated inputs do not falsely inflate experience');
assert.equal(R.journey(mud,(t,s)=>R.predictStep([],t,s)).spent,9);
assert.equal(R.journey(mud,(t,s)=>R.predictStep(weak,t,s)).spent,18);
const richer=R.train([...R.journey(steps(['mud','water','road','road','hill']),R.physical).observations,...R.journey(wet,R.physical).observations,...R.journey(steps(['road','road']),R.physical).observations]);
assert(R.journey(wet,(t,s)=>R.predictStep(richer,t,s)).stalled,'Experience teaches wet-uphill failure');
const unseen=steps(['mud','water','road','road','road','hill','road']);
assert.equal(R.journey(unseen,(t,s)=>R.predictStep(richer,t,s)).spent,R.journey(unseen,R.physical).spent,'Learned transitions compose on unseen sequences');
for(const type of Object.keys(R.terrains))for(const dirty of [false,true])for(let wet=0;wet<3;wet++){
 const before={dirty,wet},copy={...before},p=R.physical(type,before);assert.deepEqual(before,copy);assert(p.energy>0);assert(p.after.wet>=0&&p.after.wet<=2);
}
console.log('Robot learning: stateful physics, frozen nearest-neighbour examples, partial observations, transfer and no oracle inputs passed');
