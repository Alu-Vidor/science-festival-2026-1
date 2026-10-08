const assert = require('node:assert/strict'), C = require('../city-campaign.js'), M = require('../mayor.js');
const empty = C.create(), untouched = structuredClone(empty);
const built = C.invest(empty, 'bus');
assert.deepEqual(empty, untouched);
assert.equal(built.funds, 110); assert.equal(built.game.cash, empty.game.cash);
assert.equal(built.game.infrastructure.bus, 1);
assert.throws(() => C.invest(built, 'bus'));
assert.throws(() => C.invest(C.invest(built, 'clinic'), 'market'), /Недостаточно/);
assert.throws(() => C.invest(empty, 'water'));
assert.throws(() => C.report(empty, 0));
function run(strategy) {
  let c = C.create();
  for(let day = 1; day <= 12; day++) {
    if(strategy === 'market' && day === 5) c = C.invest(c, 'market');
    if(strategy === 'bus' && day === 1) c = C.invest(c, 'bus');
    if(strategy !== 'static' && day === 9) c = C.invest(c, 'clinic');
    const before = structuredClone(c);
    c = C.advance(c, { school:'shifts', bus:strategy === 'bus' && day <= 4 ? 'normal':'frequent', shops:strategy !== 'market' && strategy !== 'static' && day >= 5 && day <= 8 ? 'long':'both' });
    assert.equal(c.game.day, day); assert.equal(c.game.history.length, day * 5);
    assert.equal(c.funds, before.funds, 'Daily income never refills the construction grant');
    assert.equal(c.game.cash, before.game.cash + c.game.reports.at(-1).income - c.game.reports.at(-1).expenses);
    assert.equal(c.results.length, Math.floor(day / 4));
    assert.deepEqual(before.game.history, c.game.history.slice(0, -5), 'Past reactions and routes remain immutable');
  }
  return c;
}
const solutions = ['shops','market','bus'].map(run);
for(const c of solutions) {
  assert(c.completed); assert.equal(c.score, 50); assert.deepEqual(c.results.map(r=>r.score), [10,15,25]);
  // Recompute every maximum condition directly from daily observations, independently of scoring.
  c.results.forEach((r, i) => {
    const goal = C.rounds[i], days = c.game.reports.slice(i*4,i*4+4), average = key => days.reduce((s,d)=>s+d[key],0)/4;
    assert(average('food') >= goal.food); assert(average('participation') >= goal.activity); assert(average('happiness') >= goal.comfort);
    assert(days.reduce((s,d)=>s+d.expenses,0) <= goal.expense);
    const local = c.game.history.filter(h=>h.day>i*4&&h.day<=i*4+4).reduce((s,h)=>s+h.exposures.length,0);
    assert(local <= goal.cases);
    if(goal.care) assert(days.reduce((s,d)=>s+d.treated,0) / days.reduce((s,d)=>s+d.care,0) >= goal.care/100);
    assert(r.met.every(Boolean));
  });
  assert.throws(()=>C.advance(c,{school:'normal',bus:'normal',shops:'both'}));
}
assert.equal(new Set(solutions.map(c=>c.funds)).size,3,'Distinct strategies use different project allocations');
assert.equal(new Set(solutions.map(c=>c.results[1].expense)).size,3,'Distinct strategies have genuinely different operating costs');
assert.deepEqual(run('shops'),solutions[0],'Initial conditions and external arrivals are reproducible');
const simple = run('static'); assert(simple.score < 50); assert(simple.results[1].food < 95); assert(simple.results[2].care < 90);
for(const r of simple.results) if(!r.met.every(Boolean)) assert(r.score < C.rounds[r.index].max,'Rounding cannot award maximum with a missed goal');
assert.equal(simple.incoming.length,4);
assert.equal(simple.game.history.find(h=>h.day===9).state[simple.incoming[0]],'S','Latent arrivals have no visible symptoms');
assert.equal(simple.game.history.find(h=>h.day===10).state[simple.incoming[0]],'I','Symptoms occur two days after infection on day eight');
const bad = M.create({contactScale:0,recordCitizens:true});
let hungry = M.step(bad,{market:'closed',mall:'closed'}); const firstDay = structuredClone(hungry.history);
hungry = M.step(hungry,{market:'closed',mall:'closed'});
assert.deepEqual(hungry.history.slice(0,5),firstDay);
assert(hungry.history.at(-1).citizens.some(p=>p.reaction?.kind==='food'));
assert(hungry.history.filter(h=>h.day===1).every(h=>h.citizens.every(p=>p.reaction?.kind!=='food')),'Earlier frames never inherit later hunger');
for(const h of hungry.history) for(const p of h.citizens) {
  if(p.reaction?.kind==='food') assert.equal(p.food,0);
  if(p.reaction?.kind==='tired') assert(p.energy<40);
}
console.log('City campaign: three distinct 50/50 strategies, persistent resources, bounded grant, delayed symptoms, truthful reactions and strict goals passed');

// Reallocation preserves past days and cannot create coins or refund operating costs.
{
 let c=C.create();c=C.invest(c,'bus');c=C.advance(c,{school:'shifts',bus:'normal',shops:'both'});
 const prior=JSON.stringify(c),cash=c.game.cash,history=JSON.stringify(c.game.history),reports=JSON.stringify(c.game.reports);
 const returned=C.refund(c,'bus');assert.equal(returned.funds,200);assert.equal(returned.game.infrastructure.bus,0);assert.equal(returned.game.cash,cash);
 assert.equal(JSON.stringify(returned.game.history),history);assert.equal(JSON.stringify(returned.game.reports),reports);assert.equal(JSON.stringify(c),prior);
 assert.throws(()=>C.refund(returned,'bus'));const clinic=C.invest(returned,'clinic');assert.equal(clinic.funds,90);assert.equal(clinic.game.infrastructure.clinic,1);
 let again=returned;for(let i=0;i<20;i++)again=C.refund(C.invest(again,'market'),'market');assert.equal(again.funds,200);assert.equal(again.game.cash,cash);
 assert.throws(()=>C.refund({...clinic,completed:true},'clinic'));
}

// Alternative plans share a checkpoint and never change the real campaign.
{
 const base=C.create(),before=JSON.stringify(base),a=C.compare(base,{school:'normal',bus:'normal',shops:'both'}),b=C.compare(base,{school:'shifts',bus:'frequent',shops:'both'});
 assert(b.score>a.score);assert.equal(b.score,10);assert.equal(JSON.stringify(base),before);
 const actions=[{kind:'invest',id:'bus'},{kind:'day',plan:{school:'shifts',bus:'normal',shops:'both'}},{kind:'refund',id:'bus'}];
 const replay=C.replay(actions);assert.equal(replay.campaign.game.day,1);assert.equal(replay.campaign.funds,200);assert.equal(replay.starts[0].projects[0],'bus');
 assert.throws(()=>C.replay([{kind:'day',plan:{school:'bogus',bus:'normal',shops:'both'}}]));
 const stable={school:'shifts',bus:'frequent',shops:'both'};
 const changes=[{kind:'day',plan:stable},{kind:'invest',id:'market'},{kind:'day',plan:stable},{kind:'refund',id:'market'},{kind:'day',plan:stable},{kind:'day',plan:stable}];
 const changed=C.replay(changes),unchanged=JSON.stringify(changed.campaign);
 assert.deepEqual(C.compare(changed.starts[0],stable,changes),changed.campaign.results[0],'Comparison repeats investments and refunds on the same days');
 assert.equal(JSON.stringify(changed.campaign),unchanged);
 assert.throws(()=>C.compare(base,stable,changes.slice(0,2)));
 let c=C.create();for(let day=1;day<=9;day++)c=C.advance(c,{school:'shifts',bus:'frequent',shops:'both'});
 assert.equal(C.measure(c,2).careRequests,0);assert(C.insights(c,2).some(s=>s.includes('Обращений за помощью пока не было')));
}
