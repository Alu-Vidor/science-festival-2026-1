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
async function day(scope) {
  const before = await scope.locator('body').evaluate(()=>cityCampaignGame.current().game.day);
  await scope.locator('#tryCity').click();
  await scope.locator('body').evaluate((_,before)=>new Promise((resolve,reject)=>{
    const deadline=performance.now()+20000;
    const timer=setInterval(()=>{
      if(cityCampaignGame.current().game.day===before+1&&!cityCampaignGame.isPending()){clearInterval(timer);resolve();}
      else if(performance.now()>deadline){clearInterval(timer);reject(new Error('Day did not finish: '+JSON.stringify({before,day:cityCampaignGame.current().game.day,pending:cityCampaignGame.isPending()})));}
    },20);
  }),before);
  assert.equal(await scope.locator('body').evaluate(()=>cityCampaignGame.isPlaying()),false);
}
async function build(scope, project) {
  await scope.locator('#cityProjects > summary').click();
  await scope.locator('#build-'+project).click();
  if(await scope.locator('.monitor-dialog[open]').count()) await scope.locator('.monitor-dialog > button').click();
  else await scope.locator('#cityProjects > summary').click();
}
async function maximum(scope, afterDay = async()=>{}) {
  await scope.locator('#beginCity').click();
  await scope.locator('#pick-school-shifts').click();await scope.locator('#pick-bus-frequent').click();
  for(let n=1;n<=12;n++){
    if(n===5) await scope.locator('#pick-shops-long').click();
    if(n===9){await build(scope,'clinic');await scope.locator('#pick-shops-both').click();}
    await day(scope); await afterDay(n);
  }
  assert.equal(await scope.locator('#cityLocalScore').innerText(),'45 / 50','Rounds alone leave the research task unfinished');
  await scope.locator('#cityExperiment>summary').click();await scope.locator('.monitor-dialog[open]').waitFor();
  await scope.locator('#experimentRound').selectOption('0');await scope.locator('#experiment-school').selectOption('normal');await scope.locator('#testAlternative').click();
  assert((await scope.locator('#experimentState').innerText()).includes('Улучшение подтверждено'));
  await scope.locator('.monitor-dialog>button').click();
  assert.equal(await scope.locator('#cityLocalScore').innerText(),'50 / 50');
}
async function refund(scope, project) {
 await scope.locator('#cityProjects > summary').click();await scope.locator('#refund-'+project).click();
 if(await scope.locator('.monitor-dialog[open]').count())await scope.locator('.monitor-dialog > button').click();
 else await scope.locator('#cityProjects > summary').click();
}
module.exports = {finishLesson,day,build,refund,maximum};
