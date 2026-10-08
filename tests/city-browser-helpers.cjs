const assert = require('node:assert/strict');
async function finishLesson(scope, fits = async()=>{}) {
  await scope.locator('#tourTitle').filter({hasText:'Цели каждого'}).waitFor();
  await fits(scope); await scope.locator('#tourNext').click();
  await scope.locator('#tourTitle').filter({hasText:'Планируй улучшения'}).waitFor();
  assert.equal(await scope.locator('#cityProjects').evaluate(el=>el.open),false,'Highlighting a summary must leave its dialog closed');
  await fits(scope); await scope.locator('#tourNext').click();
  await scope.locator('#gameTour').waitFor({state:'detached'});
  assert.equal(await scope.locator('#cityLocalScore').innerText(),'0 / 50');
}
async function round(scope){const before=await scope.locator('body').evaluate(()=>cityCampaignGame.current().game.day);await scope.locator('#tryCity').click();await scope.locator('body').evaluate((_,before)=>new Promise((resolve,reject)=>{const deadline=performance.now()+40000,timer=setInterval(()=>{if(cityCampaignGame.current().game.day===before+4&&!cityCampaignGame.isPending()){clearInterval(timer);resolve();}else if(performance.now()>deadline){clearInterval(timer);reject(Error('Round did not finish'));}},20);}),before);assert.equal(await scope.locator('body').evaluate(()=>cityCampaignGame.isPlaying()),false);}
async function trial(scope){const before=await scope.locator('body').evaluate(()=>JSON.stringify(cityCampaignGame.current()));await scope.locator('#trialCity').click();await scope.locator('body').evaluate(()=>new Promise(resolve=>{const timer=setInterval(()=>{if(!cityCampaignGame.isPending()){clearInterval(timer);resolve();}},20);}));assert.equal(await scope.locator('body').evaluate(()=>JSON.stringify(cityCampaignGame.current())),before,'Experiment never changes the scored city');return scope.locator('body').evaluate(()=>cityCampaignGame.trial().result);}
async function build(scope, project) {
  await scope.locator('#cityProjects > summary').click();
  await scope.locator('#build-'+project).click();
  if(await scope.locator('.monitor-dialog[open]').count()) await scope.locator('.monitor-dialog > button').click();
  else await scope.locator('#cityProjects > summary').click();
}
async function maximum(scope,afterRound=async()=>{}){
 await scope.locator('#beginCity').click();await scope.locator('#pick-bus-frequent').click();
 for(let i=0;i<3;i++){
  if(i===1)await build(scope,'market');
  if(i===2){await refund(scope,'market');await build(scope,'clinic');await scope.locator('#pick-bus-normal').click();}
  const prediction=await trial(scope);assert.equal(prediction.score,3);await round(scope);assert.deepEqual(await scope.locator('body').evaluate((_,i)=>cityCampaignGame.current().results[i],i),prediction,'Scored round repeats the tested outcome');await afterRound((i+1)*4);
 }
 assert.equal(await scope.locator('#cityStars').innerText(),'★ 9 / 9');assert.equal(await scope.locator('#cityLocalScore').innerText(),'50 / 50');
}
async function refund(scope, project) {
 await scope.locator('#cityProjects > summary').click();await scope.locator('#refund-'+project).click();
 if(await scope.locator('.monitor-dialog[open]').count())await scope.locator('.monitor-dialog > button').click();
 else await scope.locator('#cityProjects > summary').click();
}
module.exports={finishLesson,round,trial,build,refund,maximum};
