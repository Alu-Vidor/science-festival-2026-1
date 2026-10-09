const assert=require('node:assert/strict'),C=require('../city-campaign'),M=require('../mayor');
const builds=[[],['bus'],['market'],['clinic'],['bus','market'],['bus','clinic'],['market','clinic']];
const plans=[];for(const school of ['normal','shifts','remote'])for(const bus of ['normal','frequent','reduced'])for(const shops of ['both','long','one'])plans.push({school,bus,shops});
const initial=C.create(),copy=structuredClone(initial),base={school:'normal',bus:'frequent',shops:'both'};
function equip(c,ids){for(const id of [...c.projects])if(!ids.includes(id))c=C.refund(c,id);for(const id of ids)if(!c.projects.includes(id))c=C.invest(c,id);return c;}
function independentChecks(c){
 c.results.forEach((r,i)=>{const ds=c.game.reports.slice(i*4,i*4+4),avg=k=>ds.reduce((n,d)=>n+d[k],0)/4,requests=ds.reduce((n,d)=>n+d.care,0),treated=ds.reduce((n,d)=>n+d.treated,0);
  const primary=[avg('participation')>=90,avg('food')>=95,requests>0&&treated/requests>=.9][i],support=i===0?avg('food')>=95:i===1?avg('participation')>=90:avg('food')>=95&&avg('participation')>=90;
  const expense=ds.reduce((n,d)=>n+d.expenses,0),affordable=expense<=[324,388,348][i];
  assert.equal(r.score,primary?(support?(affordable?3:2):1):0);assert.equal(r.expense,expense);assert.equal(r.full,r.score===3);
 });
}
let staticMax=0,staticCount=0;
for(const plan of plans)for(const build of builds){let c=equip(C.create(),build);for(let i=0;i<3;i++){const expected=C.dailyExpense(c,plan)*4;c=C.round(c,plan);assert.equal(c.results[i].expense,expected,'Visible cost must match the actual four-day bill');}independentChecks(c);staticMax=Math.max(staticMax,c.score);staticCount++;}
assert.equal(staticCount,189);assert.equal(staticMax,6,'No unchanged plan and initial project bundle can approach nine stars');
console.log('City balance: all 189 static combinations, maximum 6/9');
let c=C.create();const winning=[];
for(let i=0;i<3;i++){
 const options=[];
 for(const build of builds)for(const plan of plans){const start=equip(c,build),a=C.round(start,plan);if(a.results[i].score===3)options.push({build,plan,c:a,cost:a.results[i].expense});}
 assert(options.length>=2);assert(new Set(options.map(o=>o.build.join())).size>=2,'Different full-star solutions must use genuinely different infrastructure');
 options.sort((a,b)=>a.cost-b.cost);console.log('Round '+(i+1)+': '+options.length+' full-star decisions; cheapest cost '+options[0].cost);
 const expected=[{build:[],plan:base},{build:['market'],plan:base},{build:['clinic'],plan:{...base,bus:'normal'}}][i];
 const start=equip(c,expected.build),before=JSON.stringify(start),trial=C.round(start,expected.plan),again=C.round(start,expected.plan);
 assert.equal(JSON.stringify(start),before,'Trials never mutate the real city or its budget');assert.deepEqual(trial,again,'Trial and committed plan reproduce the same four days');
 assert.equal(trial.results[i].score,3);assert.equal(trial.funds,start.funds);assert.deepEqual(trial.game.history.slice(0,start.game.history.length),start.game.history);
 winning.push(expected);c=trial;
}
assert.equal(c.score,9);assert.equal(C.cityScore(c),50);assert(C.succeeded(c));assert.deepEqual(initial,copy);assert.throws(()=>C.round(c,base));independentChecks(c);
assert.deepEqual(c.results.map(r=>r.expense),[304,320,328]);
assert(c.game.reports.slice(0,4).some(r=>r.missed>0),'The first round still contains service or rest trip refusals');
assert(c.game.reports.slice(0,4).every(r=>r.flows.activity.requested.length===r.flows.activity.arrived.length));
assert(C.insights(c,0)[0].includes('На очные занятия и работу не добрались по дням: 0 / 0 / 0 / 0'), 'Morning feedback cannot count missed service or rest trips as missed work and school');
// Every service chain is built from real people and conserves counts.
for(const r of c.game.reports){
 for(const [kind,f]of Object.entries(r.flows)){
  for(const key of ['requested','arrived','served'])assert.equal(new Set(f[key]).size,f[key].length);
  assert(f.arrived.every(id=>f.requested.includes(id)));assert(f.served.every(id=>f.arrived.includes(id)));
  const missed=f.requested.filter(id=>!f.arrived.includes(id)),wait=f.arrived.filter(id=>!f.served.includes(id));
  assert.equal(f.requested.length,missed.length+wait.length+f.served.length);
  if(kind==='food')assert.deepEqual([...f.capacityDenied,...f.moneyDenied].sort((a,b)=>a-b),wait.sort((a,b)=>a-b));
  if(kind==='care'){assert.equal(f.requested.length,r.care);assert.equal(f.served.length,r.treated);}
 }
 for(const t of r.transport){assert(t.boarded<=t.capacity);assert.equal(t.missed,t.missedIds.length);assert(t.boardedIds.every(id=>t.requestedIds.includes(id)));}
}
for(const a of Object.values(C.allocations)){assert.equal(a[0]+a[1],72);assert.equal(a[2],40);}
// A hospital alone cannot fix failed access: same city, different distribution, same money.
let careStart=C.create();careStart=C.round(careStart,base);careStart=equip(careStart,['market']);careStart=C.round(careStart,base);careStart=equip(careStart,['clinic']);
const accessBad=C.round(careStart,base),accessGood=C.round(careStart,{...base,bus:'normal'});
assert(accessBad.results[2].care<90);assert(accessGood.results[2].care>=90);assert.equal(accessBad.results[2].expense,accessGood.results[2].expense);
assert(accessBad.game.reports.slice(8).some(r=>r.flows.care.requested.some(id=>!r.flows.care.arrived.includes(id))));
const noClinic=equip(careStart,[]),capacityBad=C.round(noClinic,{...base,bus:'normal'});assert(capacityBad.game.reports.slice(8).some(r=>r.flows.care.arrived.length>r.flows.care.served.length));
const events=c.game.history,first=c.incoming[0];assert.equal(events.find(h=>h.day===9).state[first],'S');assert.equal(events.find(h=>h.day===10).state[first],'I');
assert(!C.checks({careRequests:0,care:100,food:100,activity:100,expense:0},2)[0].met,'No appeals cannot be presented as delivered care');
// Refunds only change future infrastructure; income and operating expenses are not refundable.
let funded=C.invest(initial,'bus');assert.equal(funded.funds,110);assert.equal(funded.game.cash,initial.game.cash);assert.throws(()=>C.invest(funded,'bus'));assert.throws(()=>C.invest(C.invest(funded,'clinic'),'market'));
let repeated=funded;for(let n=0;n<8;n++)repeated=C.invest(C.refund(repeated,'bus'),'bus');assert.equal(repeated.funds,110);
const oneDay=C.advance(funded,base);assert.throws(()=>C.invest(oneDay,'market'));assert.throws(()=>C.refund(oneDay,'bus'));assert.throws(()=>C.round(oneDay,base));
const actions=[];for(const [i,w]of winning.entries()){const active=C.replay(actions).campaign;for(const id of active.projects)if(!w.build.includes(id))actions.push({kind:'refund',id});for(const id of w.build)if(!active.projects.includes(id))actions.push({kind:'invest',id});for(let d=0;d<4;d++)actions.push({kind:'day',plan:w.plan});}
assert.deepEqual(C.replay(actions).campaign,c);assert.throws(()=>C.replay([{kind:'day',plan:{...base,bus:'wrong'}}]));
const priorHistory=JSON.stringify(careStart.game.history),priorCash=careStart.game.cash;const refund=C.refund(careStart,'clinic');assert.equal(JSON.stringify(refund.game.history),priorHistory);assert.equal(refund.game.cash,priorCash);
// Ordinary project toggling can exceed the former 500-action save limit.
// It must neither mint funds nor invalidate a real scored checkpoint.
const longActions=[];for(let n=0;n<251;n++)longActions.push({kind:'invest',id:'bus'},{kind:'refund',id:'bus'});
for(let n=0;n<4;n++)longActions.push({kind:'day',plan:base});
const longReplay=C.replay(longActions).campaign;
assert.equal(longReplay.game.day,4);assert.equal(longReplay.funds,200);assert.deepEqual(longReplay.projects,[]);
assert.deepEqual(longReplay.results,C.round(C.create(),base).results);assert.equal(C.round(longReplay,base).game.day,8);
console.log('City: 9 attainable stars, alternative solutions, conserved service chains, independent scoring, fair trials, transport/capacity bottlenecks, persistent consequences and replay passed');

// Three whole successful campaigns use different investments and operating decisions.
let economic=C.invest(C.create(),'market');economic=C.round(economic,{...base,shops:'one'});economic=C.round(economic,base);economic=C.invest(economic,'clinic');economic=C.round(economic,{...base,bus:'normal',shops:'one'});
let transport=C.invest(C.create(),'bus');transport=C.round(transport,{...base,bus:'normal'});transport=C.round(transport,{...base,bus:'normal',shops:'long'});transport=C.invest(transport,'clinic');transport=C.round(transport,{...base,bus:'normal'});
for(const alt of [economic,transport]){assert.equal(alt.score,9);independentChecks(alt);}
assert.equal(new Set([c,economic,transport].map(x=>x.funds)).size,3);
assert.equal(new Set([c,economic,transport].map(x=>x.results.reduce((n,r)=>n+r.expense,0))).size,3);
console.log('Three complete 9/9 strategies with different operating costs and remaining project funds passed');

// Adapting the project bundle is a real decision even when the switches stay fixed.
// Do not accidentally require changing every control as an artificial winning rule.
const fixedPlan={school:'normal',bus:'normal',shops:'both'};
let adaptedProjects=C.invest(C.create(),'bus');adaptedProjects=C.round(adaptedProjects,fixedPlan);
adaptedProjects=C.invest(adaptedProjects,'market');adaptedProjects=C.round(adaptedProjects,fixedPlan);
adaptedProjects=C.refund(C.refund(adaptedProjects,'market'),'bus');adaptedProjects=C.invest(adaptedProjects,'clinic');adaptedProjects=C.round(adaptedProjects,fixedPlan);
assert.equal(adaptedProjects.score,9);independentChecks(adaptedProjects);
assert.deepEqual(adaptedProjects.results.map(r=>r.expense),[324,340,328]);
console.log('A constant operating plan can reach 9/9 only after genuine project adaptation; constant plan and constant projects remain capped at 6/9');
