const assert=require('assert'),C=require('../contest.js');
const p={school:'shifts',work:'remote',shops:'both',bus:'normal',rest:'park',trigger:'0'};
assert.equal(C.cost(p),5);assert.throws(()=>C.run({...p,bus:'frequent',rest:'both'}));assert.throws(()=>C.cost({...p,school:'unknown'}));
const a=C.run(p,1),b=C.run(p,2);assert(a.valid&&b.valid);assert.deepStrictEqual(a,C.run(p,1));assert.equal(a.history[0].state.indexOf('I'),0);assert.equal(b.people[b.history[0].state.indexOf('I')].district,5);assert.equal(a.activated,1);assert(a.history.length<=451);assert.equal(a.history.at(-1).I,0);
const f=C.final(a,b);assert(f.valid);assert.equal(f.peak,Math.max(a.peak,b.peak));assert.equal(f.total,Math.max(a.total,b.total));assert(!C.final(a,{...b,valid:false}).valid);assert(C.compare({peak:2,total:9},{peak:3,total:3})<0);assert(C.compare({peak:2,total:9},{peak:2,total:8})>0);
const closedStyle=C.run({...p,school:'remote',work:'remote'});assert(!closedStyle.valid);assert(closedStyle.activity<70);
const delayed=C.run({...p,trigger:'10'});assert(delayed.activated===null||delayed.activated>1);assert.equal(delayed.plan.trigger,'10');
console.log('Contest determinism, points, source scenarios, delayed activation, admissibility and ranking passed');
