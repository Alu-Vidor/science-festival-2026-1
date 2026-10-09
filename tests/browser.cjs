/* Real DOM/CSS and end-to-end checks. Playwright is a test dependency only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const Robot=require('./robot-browser-helpers.cjs');
const City=require('./traffic-browser-helpers.cjs');
const base = path.resolve(__dirname, '..'), shots = path.join(base, 'test-artifacts');
const server = http.createServer((req, res) => {
  const file = path.resolve(base, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!file.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp' })[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) errors.push(r.status() + ' ' + r.url()); });
    async function noOverflow() {
      const sizes = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      if(sizes[0]>sizes[1]+1)console.log('Overflow:',page.url(),await page.locator('body *').evaluateAll(els=>els.filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.right>innerWidth+1;}).slice(0,12).map(el=>({tag:el.tagName,id:el.id,classes:el.className,right:el.getBoundingClientRect().right}))));
      assert(sizes[0] <= sizes[1] + 1, 'Page must not scroll sideways: ' + sizes);
    }
    async function visibleControls(scope = page) {
      const short = await scope.locator('button:visible').evaluateAll(buttons => buttons.filter(b => b.id !== 'newParticipant' && !b.classList.contains('cell') && b.getBoundingClientRect().height < 43).map(b => b.id));
      assert.deepEqual(short, [], 'Visible action buttons must have sufficiently large targets');
    }
    await page.goto(url);
    assert.equal(await page.locator('#suggestSample,#safe,#unsafe,#probe').count(),0,'No cell labels or next-cell suggestions');
    await page.locator('#robotTutorial').click();assert(await page.locator('#robotDialog').isVisible());await page.locator('#dialogClose').click();
    await page.locator('[data-node="G"]').press('Enter');assert.deepEqual(await page.evaluate(()=>robotExpedition.current().route),['S'],'Unconnected junctions cannot teleport the robot');
    await Robot.complete(page);
    await page.screenshot({path:path.join(shots,'robot-route-learning.png')});
    await noOverflow();
    await page.locator('#epiTab').click();
    const city = page.frameLocator('#epiView');
    await City.ready(city); await City.closeInfo(city);
    assert.equal(await city.locator('body').evaluate(()=>Object.hasOwn(TrafficEngine,'referenceActions')||Object.hasOwn(TrafficEngine,'testReference')),false,'The product exposes no reference-label oracle for silently correcting the child');
    assert.equal(await city.locator('#mayor,#cityHypothesis,#cityGoalGrid').count(),0,'The replacement presents traffic decisions directly rather than old abstract city settings');
    assert.equal(await city.locator('.traffic-junction').count(),(await City.snapshot(city)).current.view.junctionIds.length,'The map shows the actual connected intersections of this situation');
    await city.locator('#cityTutorial').click();
    assert(await city.locator('#trafficInfo').isVisible());
    assert((await city.locator('#trafficInfo').innerText()).includes('ИИ'),'Rules explain the AI role');
    await city.locator('#trafficInfo').press('Escape');
    assert.equal(await city.locator('#trafficInfo').evaluate(el=>el.open),false,'Native dialog closes by keyboard');
    const firstMaximum=await City.maximum(city);
    await page.waitForFunction(()=>+document.getElementById('overallScore').textContent===100);
    assert((await page.locator('#missionProgress').innerText()).includes('3 / 3'));
    assert.equal((await City.snapshot(city)).current.attempts.length,1);
    await page.screenshot({path:path.join(shots,'traffic-city-complete.png')});

    // Several informative demonstrations can win: teaching all eight cases is not a mandatory click-through.
    await city.locator('#restartCity').click();
    const caseDefinitions=require('../traffic-engine.js').trainingCases;
    const alternativeCases=['bus-north','long-west','urgent-west','blocked-west'].map(id=>{const index=caseDefinitions.findIndex(c=>c.id===id);assert(index>=0,'A complementary teaching scene remains available: '+id);return index;}),reference=City.referenceActions();
    await City.teach(city,alternativeCases.map(i=>reference[i]),alternativeCases);
    const alternative=await City.exam(city);
    assert.equal(alternative.examples.length,4);assert.equal(alternative.current.currentScore,50,'Four complementary examples generalise successfully to all new flows');
    assert.equal(alternative.current.attempts.at(-1).results.length,3);
    assert(alternative.current.bestResult.delay<firstMaximum.current.bestResult.delay,'Equal on-time scores still reward the policy that makes people wait less');

    // A weaker replay keeps its own whole-suite score, rather than accumulating winners from separate flows.
    await city.locator('#restartCity').click();
    assert.equal((await City.snapshot(city)).examples.length,0);
    assert.equal((await City.snapshot(city)).current.best,50);
    await City.teach(city,City.referenceActions().map(()=>({axis:'EW',duration:12})));
    const weak=await City.exam(city);
    assert(weak.current.currentScore<50,'Repeating one direction does not solve all three flows');
    assert.equal(weak.current.best,50,'A weaker complete replay preserves the best whole-suite result');
    assert.equal(await page.locator('#overallScore').innerText(),'100');
    assert.notEqual(parseInt(await city.locator('#cityLocalScore').innerText(),10),50);
    await City.exam(city);
    assert.equal((await City.snapshot(city)).current.attempts.length,2);
    assert(await city.locator('#startExam').isDisabled(),'Only two scored attempts are available per party');
    // Unsafe demonstrations remain unsafe labels. The learned controller can actually collide agents.
    await city.locator('#restartCity').click();
    const unsafe={axis:'BOTH',duration:4};await City.demonstrate(city,unsafe);
    const accident=(await City.snapshot(city)).current.view;
    assert(accident.crashCount>0&&accident.accidents.length>0,'Giving conflicting streams green creates a physical collision');
    assert(accident.agents.filter(a=>a.status==='crashed').length>=2,'The involved agents do not silently resume their trips');
    assert(accident.accidents[0].blockedUntil>accident.accidents[0].tick,'A collision blocks the intersection and delays following traffic');
    await City.train(city,unsafe);
    assert.equal(await city.locator('body').evaluate(()=>TrafficLearning.predict(trafficCityGame.model(),trafficCityGame.examples()[0].observation).axis),'BOTH','The model preserves even the unsafe child decision');
    const badPractice=await City.practice(city);
    assert(badPractice.current.view.crashCount>0,'The autonomous AI repeats an unsafe learned decision and causes actual collisions');
    assert.equal(badPractice.current.best,50,'An unscored unsafe practice cannot rewrite the existing whole-suite result');
    await page.locator('#newParticipant').click();
    assert.equal(await page.locator('#overallScore').innerText(),'0');
    assert((await page.locator('#missionProgress').innerText()).includes('0 / 3'));
    assert.equal(await page.evaluate(()=>robotExpedition.current().trips.length),0);
    assert.equal(await page.evaluate(()=>robotExpedition.current().stage),0);
    await page.locator('#epiTab').click(); await City.ready(city); await City.closeInfo(city);
    const reset=await City.snapshot(city);
    assert.equal(reset.current.best,0);assert.equal(reset.examples.length,0);assert.equal(reset.current.attempts.length,0);
    await page.locator('#robotTab').click();

    // Standalone city uses the same visible learning and autonomous test controls.
    await page.goto(url+'/city.html'); await City.ready(page); await City.closeInfo(page);
    await City.maximum(page);
    await page.locator('#cityTutorial').click();
    assert.equal((await City.snapshot(page)).current.best,50,'Reviewing the rules preserves a completed game');
    await City.closeInfo(page);
    await page.screenshot({path:path.join(shots,'traffic-city-standalone.png')});
    await noOverflow();

    await page.goto(url + '/epidemic.html?mode=contest');
    await page.locator('#contest').waitFor();
    await page.locator('#gameTour').waitFor();
    await page.locator('#tourSkip').click();
    assert.equal(await page.locator('#tryPlan').isEnabled(), true);
    await page.locator('#tab-school').click();
    await page.locator('#pick-school-shifts').click();
    await page.locator('#tab-work').click();
    await page.locator('#pick-work-remote').click();
    await page.locator('#tab-rest').click();
    await page.locator('#pick-rest-park').click();
    await page.locator('#tab-trigger').click();
    await page.locator('#pick-trigger-0').click();
    await page.locator('#tryPlan').click();
    await page.waitForFunction(() => document.getElementById('attemptRows').children.length === 1, null, { timeout: 45000 });
    assert.equal(await page.locator('#lockPlan').isEnabled(), true);
    await page.locator('#cityTutorial').click();
    const timer = await page.locator('#roundClock').innerText();
    await page.locator('#tourNext').click();
    assert.equal(await page.locator('#roundClock').innerText(), timer, 'Learning must pause the competition clock');
    await page.locator('#tourSkip').click();
    await page.locator('#lockPlan').click();
    await page.waitForFunction(() => document.getElementById('finalCard').children.length > 0, null, { timeout: 45000 });
    assert((await page.locator('#finalCard').innerText()).includes('В зачёте'));
    await page.locator('#contestMap').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(shots, 'contest-desktop.png') });

    for (const width of [1920, 2560]) {
      await page.setViewportSize({ width, height: width === 2560 ? 1440 : 1080 });
      for (const route of ['/', '/city.html', '/epidemic.html?mode=contest', '/epidemic.html?mode=lab']) {
        await page.evaluate(()=>sessionStorage.clear());
        await page.goto(url + route);
        await page.locator(route === '/' ? '#robotView' : route === '/city.html' ? '#signalCity' : route.includes('contest') ? '#contest' : '.lab-mode').waitFor();
        if(await page.locator('#gameTour').count())await page.locator('#tourSkip').click();
        if(route === '/') {
          await page.locator('#robotTutorial').click();assert(await page.locator('#robotDialog').isVisible());await page.locator('#dialogClose').click();
          await page.evaluate(()=>window.scrollTo(0,0));
        } else if(route === '/city.html') { await City.ready(page); await City.closeInfo(page); }
        await noOverflow();await visibleControls();
      }
    }
    // Ordinary animation really moves the simulated actors, and opening an actor's card pauses it.
    await page.setViewportSize({width:1920,height:1080});await page.emulateMedia({reducedMotion:'no-preference'});
    await page.goto(url);await Robot.run(page,Robot.routes.wash);
    await page.locator('#epiTab').click();await City.ready(city);await City.closeInfo(city);
    await City.select(city,{axis:'EW',duration:12});
    await city.locator('#demonstrate').click();
    await city.locator('body').evaluate(()=>new Promise(resolve=>{
      const positions=new Set();const started=performance.now();
      function frame(){positions.add([...document.querySelectorAll('.traffic-agent')].map(e=>e.getAttribute('transform')).join('|'));
        if(positions.size>2 || performance.now()-started>3000){window.browserTrafficPositions=positions.size;resolve();}else requestAnimationFrame(frame);}
      frame();
    }));
    assert((await city.locator('body').evaluate(()=>window.browserTrafficPositions))>2,'Traffic animation uses multiple actual engine positions');
    if((await City.snapshot(city)).playing){await city.locator('.traffic-agent').first().press('Enter');assert(await city.locator('#trafficInfo').isVisible());assert.equal((await City.snapshot(city)).playing,false);await City.closeInfo(city);}
    const frozen=await city.locator('.traffic-agent').evaluateAll(els=>els.map(e=>e.getAttribute('transform')));
    await page.waitForTimeout(250);
    assert.deepEqual(await city.locator('.traffic-agent').evaluateAll(els=>els.map(e=>e.getAttribute('transform'))),frozen,'Inspecting an actor pauses all physical movement');
    await page.locator('#robotTab').click();assert.equal(await page.locator('#robotView').isVisible(),true);
    assert.deepEqual(errors,[],'No JS errors or missing game assets');
    console.log('Browser: robot deliveries, full100/100, explicit own-label traffic learning, autonomous suite, weaker replay and FullHD/QHD passed');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
