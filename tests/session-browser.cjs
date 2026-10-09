/* Reload and exploration checks use real controls, including the embedded city. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),R=require('./robot-browser-helpers.cjs'),City=require('./traffic-browser-helpers.cjs');
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
  await page.locator('#epiTab').click();const city=page.frameLocator('#epiView');await City.ready(city);await City.closeInfo(city);
  // A physics-only demonstration survives reload without being silently taught or refunded.
  await City.select(city,{axis:'NS',duration:12});await page.emulateMedia({reducedMotion:'no-preference'});
  await city.locator('#demonstrate').click();await city.locator('#pauseCity').click();
  const paused=await City.snapshot(city);assert(paused.pending&&paused.pending.kind==='demo');assert.equal(paused.playing,false);
  assert(await city.locator('#teachingControls').isVisible(),'A manual demonstration visibly remains the child’s own teaching action');
  assert.equal(await city.locator('#autonomousControls').isVisible(),false,'A manual example must not be presented as autonomous AI');
  assert.equal(await city.locator('#teachingJunction').innerText(),'ТЫ ОБУЧАЕШЬ СВЕТОФОР '+paused.pending.junction);
  const actors=await city.locator('.traffic-agent').evaluateAll(es=>es.map(e=>e.getAttribute('transform')));
  await page.reload();await City.ready(city);await City.closeInfo(city);
  const reloaded=await City.snapshot(city);assert.deepEqual(reloaded.pending,paused.pending,'Reload restores the actually shown checkpoint');
  assert.equal(reloaded.playing,false);assert.equal(reloaded.examples.length,0);
  await page.waitForTimeout(220);
  assert.deepEqual(await city.locator('.traffic-agent').evaluateAll(es=>es.map(e=>e.getAttribute('transform'))),actors,'Reload cannot continue hidden animation');
  await page.emulateMedia({reducedMotion:'reduce'});await city.locator('#resumeCity').click();await City.waitIdle(city);
  assert.equal((await City.snapshot(city)).examples.length,0,'Resuming a demonstration does not relabel it as an AI example');
  await City.train(city,{axis:'NS',duration:12});
  const ownModel=(await City.snapshot(city)).model;await page.reload();await City.ready(city);await City.closeInfo(city);
  assert.deepEqual((await City.snapshot(city)).model,ownModel);assert.deepEqual((await City.snapshot(city)).examples[0].action,{axis:'NS',duration:12});
  await city.locator('#restartCity').click();await City.teach(city);

  // Real tab changes freeze pending autonomous practice; selecting an already active tab has no side effect.
  await page.emulateMedia({reducedMotion:'no-preference'});await city.locator('#checkMode').click();await city.locator('#testAI').click();
  await city.locator('body').evaluate(()=>new Promise(resolve=>{function check(){if(trafficCityGame.pending()?.state.tick>=1)return resolve();setTimeout(check,20);}check();}));
  assert.equal((await City.snapshot(city)).playing,true);await page.locator('#epiTab').click();assert.equal((await City.snapshot(city)).playing,true);
  assert(await city.locator('#autonomousControls').isVisible(),'Autonomous practice has a distinct visible AI role');
  assert.equal(await city.locator('#teachingControls').isVisible(),false);
  await page.locator('#robotTab').click();const tabFrozen=await City.snapshot(city);assert.equal(tabFrozen.playing,false);
  await page.waitForTimeout(250);assert.deepEqual((await City.snapshot(city)).pending,tabFrozen.pending,'The hidden city cannot advance or improve a score');
  await page.locator('#epiTab').click();assert.equal((await City.snapshot(city)).playing,false,'Returning to the city requires an explicit resume');
  await page.reload();await City.ready(city);await City.closeInfo(city);assert.deepEqual((await City.snapshot(city)).pending,tabFrozen.pending);
  assert.equal((await City.snapshot(city)).current.attempts.length,0,'Practice consumes no competition attempt');
  await page.emulateMedia({reducedMotion:'reduce'});await city.locator('#resumeCity').click();await City.waitIdle(city);
  assert.equal(parseInt(await city.locator('#cityLocalScore').innerText(),10),0);assert.equal(await page.locator('#overallScore').innerText(),'50');

  // An exam locks exactly the chosen model. No partial score is committed, even across reload.
  await page.emulateMedia({reducedMotion:'no-preference'});await city.locator('#startExam').click();await city.locator('#pauseCity').click();
  const examPaused=await City.snapshot(city);assert.equal(examPaused.current.attempts.length,1);assert.equal(examPaused.current.attempts[0].status,'running');
  assert.equal(examPaused.pending.kind,'exam');assert.deepEqual(examPaused.pending.frozenModel,examPaused.model);
  assert(await city.locator('#saveExample').isDisabled());assert(await city.locator('#restartCity').isDisabled());
  assert.equal(await page.locator('#overallScore').innerText(),'50','No competitive score before the entire three-flow suite finishes');
  await page.reload();await City.ready(city);await City.closeInfo(city);
  assert.deepEqual((await City.snapshot(city)).pending,examPaused.pending);assert.equal((await City.snapshot(city)).playing,false);
  assert.equal((await City.snapshot(city)).current.attempts.length,1,'Reload cannot refund a consumed exam');
  await page.emulateMedia({reducedMotion:'reduce'});await city.locator('#resumeCity').click();await City.waitIdle(city);
  const final=await City.snapshot(city);assert.equal(final.current.best,50);assert.equal(final.current.currentScore,50);
  assert.equal(final.current.attempts[0].status,'completed');assert.equal(final.current.attempts[0].results.length,3,'A result contains all three comparable scenarios');
  await page.waitForFunction(()=>document.getElementById('overallScore').textContent==='100');
  const feedback=await city.locator('#roundResult').innerText();await page.reload();await City.ready(city);await City.closeInfo(city);
  assert.equal((await city.locator('#roundResult').innerText()).replace(/\s+/g,' '),feedback.replace(/\s+/g,' '));assert.equal((await City.snapshot(city)).current.best,50);
  await page.screenshot({path:path.join(root,'test-artifacts',`traffic-persistence-${width}.png`)});

  // Incompatible traffic rules clear only the city score and checkpoint, preserving the robot's completed work.
  await page.evaluate(()=>{const saved=JSON.parse(sessionStorage.getItem('festival-session-v1'));saved.data.city.rules='traffic-school-2';saved.data.score.cityRules='traffic-school-2';for(const agent of saved.data.city.view.agents){delete agent.dir;for(const leg of agent.route)delete leg.dir;}sessionStorage.setItem('festival-session-v1',JSON.stringify(saved));});
  await page.reload();await City.ready(city);await City.closeInfo(city);
  assert.equal((await City.snapshot(city)).examples.length,0);assert.equal((await City.snapshot(city)).current.best,0);assert.equal(await page.locator('#overallScore').innerText(),'50');
  assert.equal(await page.evaluate(()=>robotExpedition.current().score.stars),17);
  await page.locator('#newParticipant').click();await page.reload();assert.equal(await page.locator('#overallScore').innerText(),'0');assert.equal(await page.evaluate(()=>robotExpedition.current().trips.length),0);
  await page.locator('#epiTab').click();await City.ready(city);await City.closeInfo(city);
  assert.equal((await City.snapshot(city)).examples.length,0);assert.equal((await City.snapshot(city)).current.attempts.length,0);
  await City.demonstrate(city,{axis:'EW',duration:4});await City.train(city,{axis:'EW',duration:4});await page.reload();await City.ready(city);await City.closeInfo(city);
  assert.equal((await City.snapshot(city)).examples.length,1);assert.equal((await City.snapshot(city)).current.best,0);
  assert.deepEqual(errors,[]);await context.close();console.log('Reload, own labels, frozen three-flow exams, active tabs and reset:',width,height);
 }
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
