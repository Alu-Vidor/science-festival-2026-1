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
  await city.locator('#beginCity').click();await city.locator('#pick-bus-frequent').click();
  // A paused trial survives reload, keeps the real city unchanged and does not refund its slot.
  await page.emulateMedia({reducedMotion:'no-preference'});await city.locator('#trialCity').click();await city.locator('#pauseCity').click();
  await city.locator('#inspect-care').click();await city.locator('.monitor-dialog[open]').waitFor();assert((await city.locator('#flowPanel').innerText()).includes('ещё не показан'));await city.locator('.monitor-dialog>button').click();
  const index=await city.locator('#cityCalendar').innerText();await page.reload();await city.locator('#mayor').waitFor();assert.equal(await city.locator('#cityCalendar').innerText(),index);assert.equal(await city.locator('body').evaluate(()=>cityCampaignGame.current().game.day),0);assert.equal(await city.locator('body').evaluate(()=>cityCampaignGame.trials().length),1);
  assert.equal(await city.locator('body').evaluate(()=>cityCampaignGame.isPlaying()),false);assert.equal(await city.locator('body').evaluate(()=>cityCampaignGame.isPending()),true);assert.equal(await city.locator('#gameTour').count(),0);
  await page.emulateMedia({reducedMotion:'reduce'});await city.locator('#tryCity').click();await city.locator('body').evaluate(()=>new Promise(r=>{const timer=setInterval(()=>{if(!cityCampaignGame.isPending()){clearInterval(timer);r();}},20);}));
  assert.equal(await city.locator('#cityLocalScore').innerText(),'0 / 50');const trial=await city.locator('body').evaluate(()=>cityCampaignGame.trial());assert.equal(trial.result.score,3);
  await city.locator('#pick-bus-normal').click();assert((await city.locator('#trialSummary').innerText()).includes('План изменён'));await page.reload();await city.locator('#mayor').waitFor();assert.deepEqual(await city.locator('body').evaluate(()=>cityCampaignGame.trial()),trial,'Reload cannot silently relabel an old trial with a new plan');
  const second=await City.trial(city);assert.equal(second.score,0);assert(await city.locator('#trialCity').isDisabled());await page.reload();await city.locator('#mayor').waitFor();assert(await city.locator('#trialCity').isDisabled(),'Reload cannot refund trial slots');
  await city.locator('#pick-bus-frequent').click();
  // Score is committed only after the four-day animation, with a frozen plan across reload.
  await page.emulateMedia({reducedMotion:'no-preference'});await city.locator('#tryCity').click();await city.locator('#pauseCity').click();await page.reload();await city.locator('#mayor').waitFor();assert.equal(await city.locator('body').evaluate(()=>cityCampaignGame.isPending()),true);assert(await city.locator('#pick-bus-normal').isDisabled());
  await page.emulateMedia({reducedMotion:'reduce'});await City.round(city);assert.equal(await city.locator('#cityLocalScore').innerText(),'16 / 50');assert.deepEqual(await city.locator('body').evaluate(()=>cityCampaignGame.current().results[0]),trial.result);
  const feedback=await city.locator('#roundOutcome').innerText(),effects=await city.locator('#cityEffects').innerText();await page.reload();await city.locator('#mayor').waitFor();assert.equal(await city.locator('#roundOutcome').innerText(),feedback);assert.equal(await city.locator('#cityEffects').innerText(),effects);
  await City.build(city,'market');await page.reload();await city.locator('#mayor').waitFor();assert.equal(await city.locator('body').evaluate(()=>cityCampaignGame.current().funds),120);await City.trial(city);await City.round(city);assert.equal(await city.locator('#cityLocalScore').innerText(),'33 / 50');
  await City.refund(city,'market');await city.locator('#pick-bus-normal').click();const noClinic=await City.trial(city);assert(noClinic.care<90);
  await city.locator('#inspect-care').click();await city.locator('.monitor-dialog[open]').waitFor();assert((await city.locator('#flowPanel').innerText()).includes('не хватило мест на приёме'));await city.locator('#flowDay').selectOption('9');assert((await city.locator('#flowPanel').innerText()).includes('День 9'));await city.locator('#flowDay').selectOption('12');await page.screenshot({path:path.join(root,'test-artifacts',`city-chain-${width}.png`)});await city.locator('.monitor-dialog>button').click();
  await City.build(city,'clinic');await City.trial(city);await page.reload();await city.locator('#mayor').waitFor();assert.equal(await city.locator('body').evaluate(()=>cityCampaignGame.current().funds),90);assert(await city.locator('#trialCity').isDisabled());await City.round(city);assert.equal(await city.locator('#cityLocalScore').innerText(),'50 / 50');assert.equal(await page.locator('#overallScore').innerText(),'100');
  await city.locator('#cityExperiment>summary').click();await city.locator('.monitor-dialog[open]').waitFor();assert.equal(await city.locator('.trial-entry').count(),5);assert((await city.locator('#trialHistory').innerText()).includes('На копии:'));await city.locator('.monitor-dialog>button').click();
  // An incompatible city save cannot retain old scoring; the robot remains intact.
  await page.evaluate(()=>{const saved=JSON.parse(sessionStorage.getItem('festival-session-v1'));saved.data.city.rules='old';saved.data.score.rules='old';sessionStorage.setItem('festival-session-v1',JSON.stringify(saved));});await page.reload();await city.locator('#mayor').waitFor();assert.equal(await city.locator('body').evaluate(()=>cityCampaignGame.current().game.day),0);assert.equal(await page.locator('#overallScore').innerText(),'50');assert.equal(await page.evaluate(()=>robotExpedition.current().score.stars),17);
  await page.locator('#newParticipant').click();await page.reload();assert.equal(await page.locator('#overallScore').innerText(),'0');assert.equal(await page.evaluate(()=>robotExpedition.current().trips.length),0);await page.locator('#epiTab').click();await city.locator('#mayor').waitFor();assert.equal(await city.locator('body').evaluate(()=>cityCampaignGame.current().funds),200);
  if(await city.locator('#gameTour').count())await city.locator('#tourSkip').click();await city.locator('#beginCity').click();await City.round(city);await page.reload();await city.locator('#mayor').waitFor();assert.equal(await city.locator('body').evaluate(()=>cityCampaignGame.current().game.day),4);assert.equal(await city.locator('#gameTour').count(),0);
  assert.deepEqual(errors,[]);await context.close();console.log('Reload, tutorial inspection, fair plan comparisons and reset:',width,height);
 }
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
