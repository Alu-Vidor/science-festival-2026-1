/* Reload and exploration checks use real controls, including the embedded city. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),R=require('./robot-browser-helpers.cjs'),City=require('./city-browser-helpers.cjs');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();try{
 for(const [width,height]of [[1920,1080],[2560,1440]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>localStorage.setItem('festival-tours-v6',JSON.stringify(['robot','city-mayor'])));
  await page.goto('http://127.0.0.1:'+server.address().port);assert((await page.locator('#sessionPace').innerText()).includes('12 робот · 12 город'));
  await R.draw(page,R.routes.direct);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#run').click();await page.waitForFunction(()=>robotExpedition.current().trips.at(-1)?.steps>=2);
  // Stop through the real UI before reload so the persisted checkpoint is stable.
  await page.locator('#stop').click();const partial=await page.evaluate(()=>robotExpedition.current().trips.at(-1));
  await page.reload();assert.deepEqual(await page.evaluate(()=>robotExpedition.current().trips.at(-1)),partial);assert(await page.locator('#train').isEnabled());
  assert.equal(await page.evaluate(()=>robotExpedition.current().model.length),0);await page.locator('#train').click();
  const learned=await page.evaluate(()=>robotExpedition.current().model);await page.reload();assert.deepEqual(await page.evaluate(()=>robotExpedition.current().model),learned);
  // Reload an actively moving trip: observed steps survive, playback cannot silently continue.
  await page.locator('#run').click();await page.waitForFunction(()=>robotExpedition.current().trips.at(-1)?.steps>=2);await page.reload();
  assert.equal(await page.evaluate(()=>robotExpedition.current().running),false);assert.equal(await page.evaluate(()=>robotExpedition.current().trips.at(-1).interrupted),true);
  assert.deepEqual(await page.evaluate(()=>robotExpedition.current().model),learned,'New measurements do not silently retrain on reload');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert(await page.locator('#run').isDisabled(),'Reload cannot refund a spent experiment');
  await R.orders(page,['G']);await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#run').click();await page.waitForFunction(()=>robotExpedition.current().trips.at(-1)?.steps>=2);await page.reload();
  assert.equal(await page.evaluate(()=>robotExpedition.current().trips.at(-1).interrupted),true);assert(await page.locator('#nextRound').isVisible());
  assert.equal(await page.evaluate(()=>robotExpedition.current().score.stars),0,'An interrupted delivery consumes a departure without rewarding unfinished orders');
  await page.locator('#newParticipant').click();await page.emulateMedia({reducedMotion:'reduce'});await R.complete(page);await page.reload();assert.equal(await page.locator('#overallScore').innerText(),'50');
  assert.equal(await page.evaluate(()=>robotExpedition.current().stage),2);assert.equal(await page.evaluate(()=>robotExpedition.current().score.stars),17);
  await page.locator('#epiTab').click();const city=page.frameLocator('#epiView');await city.locator('#mayor').waitFor();if(!await city.locator('#gameTour').count())await city.locator('#cityTutorial').click();
  await page.emulateMedia({reducedMotion:'no-preference'});await city.locator('#observeCity').click();await city.locator('.tour-watching').waitFor();
  await city.locator('.inhabitant[data-person="0"]').press('Enter');await city.locator('.monitor-dialog[open]').waitFor();
  assert.equal(await city.locator('body').evaluate(()=>cityCampaignGame.isPlaying()),false);assert.equal(await city.locator('#citizenPanel .citizen-route li').count(),1);
  // Escape closes the native dialog, preserving the lesson and allowing the day to resume.
  await city.locator('#citizenChoice').press('Escape');await city.locator('.monitor-dialog[open]').waitFor({state:'hidden'});assert(await city.locator('#gameTour').count());
  await page.emulateMedia({reducedMotion:'reduce'});await city.locator('#tryCity').click();await city.locator('#tourTitle').filter({hasText:'Помоги добраться'}).waitFor();
  await city.locator('#pick-bus-frequent').click();await city.locator('#tryCity').click();await City.finishLesson(city);
  await city.locator('#beginCity').click();await city.locator('#pick-school-shifts').click();await city.locator('#pick-bus-frequent').click();
  await page.emulateMedia({reducedMotion:'no-preference'});await city.locator('#tryCity').click();await city.locator('#pauseCity').click();
  const index=await city.locator('#cityCalendar').innerText();await page.reload();await city.locator('#mayor').waitFor();
  assert.equal(await page.locator('#overallScore').innerText(),'50');assert.equal(await city.locator('#cityCalendar').innerText(),index);assert.equal(await city.locator('body').evaluate(()=>cityCampaignGame.isPlaying()),false);assert.equal(await city.locator('body').evaluate(()=>cityCampaignGame.isPending()),true);
  assert.equal(await city.locator('#gameTour').count(),0);await page.emulateMedia({reducedMotion:'reduce'});await City.day(city);for(let day=2;day<=4;day++)await City.day(city);
  assert((await city.locator('#roundWhy').innerText()).includes('Не добрались по дням:'));
  const feedback=await city.locator('#roundOutcome').innerText(),effects=await city.locator('#cityEffects').innerText();await page.reload();await city.locator('#mayor').waitFor();
  assert.equal(await city.locator('#roundOutcome').innerText(),feedback);assert.equal(await city.locator('#cityEffects').innerText(),effects);
  const before=await city.locator('body').evaluate(()=>JSON.stringify(cityCampaignGame.current()));
  await city.locator('#cityExperiment>summary').click();await city.locator('.monitor-dialog[open]').waitFor();
  assert.equal(await city.locator('#experiment-school').inputValue(),'shifts');assert.equal(await city.locator('#experiment-bus').inputValue(),'frequent');
  await city.locator('#experiment-school').selectOption('normal');await city.locator('#experiment-bus').selectOption('normal');await city.locator('#experiment-shops').selectOption('both');await city.locator('#testAlternative').click();
  const scores=await city.locator('#alternativeResult tr').nth(1).locator('td').allTextContents();assert.deepEqual(scores,['10','5']);assert.equal(await city.locator('body').evaluate(()=>JSON.stringify(cityCampaignGame.current())),before);
  async function comparisonFits(){assert(await city.locator('.monitor-dialog[open]').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'The full comparison and explanation must fit without scrolling');}
  await comparisonFits();
  await city.locator('#experiment-bus').selectOption('frequent');assert.equal(await city.locator('#alternativeResult tr').count(),0,'Changing choices removes stale results');assert((await city.locator('#experimentState').innerText()).includes('План изменён'));
  await city.locator('#testAlternative').click();assert((await city.locator('#experimentState').innerText()).includes('Улучшение подтверждено'));assert.equal(await city.locator('#cityLocalScore').innerText(),'15 / 50');assert.equal(await city.locator('body').evaluate(()=>JSON.stringify(cityCampaignGame.current())),before);
  await page.screenshot({path:path.join(root,'test-artifacts',`city-comparison-plans-${width}.png`)});await city.locator('.monitor-dialog>button').click();
  await City.build(city,'market');await page.reload();await city.locator('#mayor').waitFor();assert.equal(await city.locator('#cityLocalScore').innerText(),'15 / 50');assert((await city.locator('#cityLearningGoal').innerText()).includes('улучшение подтверждено'));assert.equal(await city.locator('body').evaluate(()=>cityCampaignGame.current().funds),120);await City.day(city);await City.refund(city,'market');await page.reload();await city.locator('#mayor').waitFor();assert.equal(await city.locator('body').evaluate(()=>cityCampaignGame.current().funds),200);
  for(let day=6;day<=9;day++)await City.day(city);assert((await city.locator('#cityGoalGrid').innerText()).includes('Пока нет обращений'));assert(!(await city.locator('#cityGoalGrid').innerText()).includes('100.0%'));
  for(let day=10;day<=12;day++)await City.day(city);
  await city.locator('#cityExperiment>summary').click();await city.locator('.monitor-dialog[open]').waitFor();await city.locator('#experimentRound').selectOption('2');await city.locator('#testAlternative').click();await comparisonFits();await city.locator('.monitor-dialog>button').click();
  // Upgrade only the robot: a completed city and its research points remain valid.
  const oldCityScore=await page.evaluate(()=>FestivalSession.read('score').city);
  const oldCityCheckpoint=await city.locator('body').evaluate(()=>JSON.stringify(FestivalSession.read('city')));
  await page.evaluate(()=>{const saved=JSON.parse(sessionStorage.getItem('festival-session-v1'));saved.data.robot={samples:[],model:[]};delete saved.data.score.robotRules;saved.data.robotBest.rules='old';sessionStorage.setItem('festival-session-v1',JSON.stringify(saved));});
  await page.reload();await city.locator('#mayor').waitFor();assert.equal(await page.locator('#overallScore').innerText(),String(oldCityScore),'An old robot score cannot survive the new mechanics');
  assert.equal(await city.locator('body').evaluate(()=>JSON.stringify(FestivalSession.read('city'))),oldCityCheckpoint,'Robot migration preserves city research and progress');
  const cityActions=await city.locator('body').evaluate(()=>FestivalSession.read('city').actions);
  await page.evaluate(()=>{const saved=JSON.parse(sessionStorage.getItem('festival-session-v1'));saved.data.robot.rules='old';saved.data.robotBest.rules='old';saved.data.city.rules='old';saved.data.score.rules='old';saved.data.score.robot=50;saved.data.score.city=50;saved.data.score.deliveryDone=saved.data.score.cityDone=true;sessionStorage.setItem('festival-session-v1',JSON.stringify(saved));});
  await page.reload();await city.locator('#mayor').waitFor();assert.equal(await page.evaluate(()=>robotExpedition.current().stage),0,'Incompatible old robot experiments restart');assert.equal(await page.evaluate(()=>robotExpedition.current().model.length),0);
  const recalculated=await city.locator('body').evaluate((_,actions)=>CityCampaign.replay(actions).campaign.score,cityActions);assert.equal(await page.locator('#overallScore').innerText(),String(recalculated),'Old scores and completion cannot bypass new goals');assert(!(await page.locator('#cityMission').innerText()).startsWith('✓'));assert(!(await city.locator('#cityLearningGoal').innerText()).includes('улучшение подтверждено'));
  await page.locator('#newParticipant').click();await page.reload();assert.equal(await page.locator('#overallScore').innerText(),'0');assert.equal(await page.evaluate(()=>robotExpedition.current().trips.length),0);
  await page.locator('#epiTab').click();await city.locator('#mayor').waitFor();assert.equal(await city.locator('body').evaluate(()=>cityCampaignGame.current().game.day),0);assert.equal(await city.locator('body').evaluate(()=>cityCampaignGame.current().funds),200);
  if(await city.locator('#gameTour').count())await city.locator('#tourSkip').click();
  await city.locator('#beginCity').click();await City.day(city);await page.reload();await city.locator('#mayor').waitFor();
  assert.equal(await city.locator('body').evaluate(()=>cityCampaignGame.current().game.day),1);assert.equal(await city.locator('#gameTour').count(),0,'A restored participant never gets a forced city lesson');
  assert.deepEqual(errors,[]);await context.close();console.log('Reload, tutorial inspection, fair plan comparisons and reset:',width,height);
 }
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
