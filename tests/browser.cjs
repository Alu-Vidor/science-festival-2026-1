/* Real DOM/CSS and end-to-end checks. Playwright is a test dependency only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const {lesson,teachMap,teachTraining,adaptGorge,adaptRain,deliver,optimalDelivery}=require('./robot-browser-helpers.cjs');
const City=require('./city-browser-helpers.cjs');
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
    async function tourFits(scope=page) {
      const rect = await scope.locator('.tour-card').boundingBox();
      const size = page.viewportSize();
      assert(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= size.width + 1 && rect.y + rect.height <= size.height + 1, 'Tour card must fit the visible screen, including inside an iframe: '+JSON.stringify(rect));
      // Read card and child geometry atomically: the lesson can change phase
      // between separate protocol calls while the city is animating.
      const clipped=await scope.locator('.tour-card').evaluate(card=>{
        const r=card.getBoundingClientRect();
        return ['#tourTitle','#tourText'].flatMap(selector=>{
          const t=card.querySelector(selector).getBoundingClientRect();
          return t.top<r.top||t.bottom>r.bottom-4?[{selector,card:r.toJSON(),text:t.toJSON()}]:[];
        });
      });
      if(clipped.length)await page.screenshot({path:path.join(shots,'lesson-text-failure.png')});
      assert.deepEqual(clipped,[],'The short lesson text must be readable without scrolling');
    }
    async function lit(selectors, scope=page) {
      const problems=await scope.locator('body').evaluate((_, selectors)=>{
        const card=document.querySelector('.tour-card').getBoundingClientRect(), dark=[...document.querySelectorAll('.tour-shade')].map(el=>el.getBoundingClientRect());
        const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
        return selectors.flatMap(selector=>{
          const r=document.querySelector(selector).getBoundingClientRect();
          const visible=r.width&&r.height&&r.bottom>0&&r.top<innerHeight;
          return !visible?[selector+' is not visible']:dark.some(s=>overlap(r,s))?[selector+' is shaded']:overlap(r,card)?[selector+' is covered by the lesson card']:[];
        });
      },selectors);
      if(problems.length) await page.screenshot({path:path.join(shots,'spotlight-failure.png')});
      assert.deepEqual(problems,[],'Explained objects must stay lit and uncovered');
    }
    async function startWatching(scene, actors, scope=page) {
      await scope.locator('body').evaluate((_, {scene,actors})=>{
        const report=window.lessonWatch={frames:0,positions:new Set(),problems:[],seen:false};
        const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
        function check() {
          const tour=document.getElementById('gameTour');
          if(tour?.classList.contains('tour-watching')) {
            report.seen=true; report.frames++;
            const r=document.querySelector(scene).getBoundingClientRect(), card=tour.querySelector('.tour-card').getBoundingClientRect();
            let top=0,bottom=innerHeight;
            if(window.frameElement) { const host=window.frameElement.getBoundingClientRect();top=-host.top;bottom=parent.innerHeight-host.top;
              const bar=parent.document.getElementById('missionBar')?.getBoundingClientRect();if(bar&&bar.top<=1)top=Math.max(top,bar.bottom-host.top);
            } else { const bar=document.getElementById('missionBar')?.getBoundingClientRect();if(bar&&bar.top<=1)top=bar.bottom; }
            if(r.top<top-1||r.bottom>bottom+1)report.problems.push('Animation scene leaves the visible screen');
            if([...tour.querySelectorAll('.tour-shade')].some(s=>overlap(r,s.getBoundingClientRect())))report.problems.push('Animation scene is shaded');
            if(overlap(r,card))report.problems.push('Animation scene is covered by the card');
            report.positions.add([...document.querySelectorAll(actors)].map(el=>getComputedStyle(el).transform).join('|'));
            report.problems=report.problems.slice(0,5);
          } else if(report.seen) return;
          requestAnimationFrame(check);
        }
        requestAnimationFrame(check);
      },{scene,actors});
    }
    async function watched(scope=page) {
      const result=await scope.locator('body').evaluate(()=>({frames:window.lessonWatch.frames,moved:window.lessonWatch.positions.size,problems:window.lessonWatch.problems}));
      if(result.problems.length)await page.screenshot({path:path.join(shots,'animation-failure.png')});
      assert(result.frames>2&&result.moved>1,'The lesson must show actual movement over multiple rendered frames: '+JSON.stringify(result));
      assert.deepEqual(result.problems,[],'The entire animated scene must stay lit, on screen and clear of the tooltip');
    }
    async function step(title, scope=page) { await scope.locator('#tourTitle').filter({hasText:title}).waitFor(); }
    await page.goto(url);
    await page.locator('#gameTour').waitFor();
    await tourFits();
    assert.equal(await page.locator('#tourNext').isVisible(),false);
    assert.equal(await page.locator('#robotEditor, #leaderTools, #parcelOrder, #routeMode, #moveStart').count(),0,'Editor, leader menu and manual routing are removed');
    await lit(['#board [data-index="0"]','#sensors']);
    await page.screenshot({path:path.join(shots,'robot-glow-tutorial.png')});
    await lesson(page,tourFits);
    assert.equal(await page.locator('#overallScore').innerText(),'0','Learning is free');
    assert.equal(await page.locator('#suggestSample').count(),0,'The concept must not introduce next-cell guidance');
    assert.equal(await page.locator('#missionTask').getAttribute('data-state'),'complete');
    assert((await page.locator('#taskTitle').innerText()).startsWith('Победа!'));
    assert((await page.locator('#taskHint').innerText()).includes('без баллов'));
    assert.equal(await page.locator('#run').innerText(),'↻ Повторить рейс');
    assert.equal(await page.locator('#routePlan').getAttribute('points'),'');
    assert((await page.locator('#autoRoute').innerText()).includes('Пройденный путь — жёлтый'));
    assert(!(await page.locator('#model').innerText()).includes('куда он поедет'));
    assert(await page.locator('.terrain-note').isVisible());
    assert((await page.locator('.terrain-note').innerText()).includes('один пример работает для похожих показаний'));
    assert(await page.locator('.selection-key').isVisible());
    assert(await page.locator('.wall-key').isVisible());
    assert.equal(await page.locator('#board .base-label').innerText(),'База');
    assert.equal(await page.locator('#campStatus [data-served=true]').count(),3);
    assert.equal(await page.locator('#cargo').innerText(),'0');
    assert((await page.locator('#trainingMission').innerText()).startsWith('✓'));
    assert.equal(await page.locator('#board [data-camp]').count(),3);
    assert.equal(await page.locator('#terrainLegend .terrain-key').count(),9);
    const materials=await page.evaluate(async()=>{
      const result=[];
      for(const swatch of document.querySelectorAll('.terrain-swatch')){
        const type=swatch.classList[1],cell=document.querySelector('#board .cell.'+type);
        const style=getComputedStyle(swatch),tile=getComputedStyle(cell);
        const url=style.backgroundImage.match(/url\("?(.*?)"?\)/)[1];
        const loaded=await new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img.naturalWidth>0);img.onerror=()=>resolve(false);img.src=url;});
        result.push({type,loaded,signature:style.backgroundImage+'|'+style.backgroundPosition,matches:style.backgroundImage===tile.backgroundImage&&style.backgroundPosition===tile.backgroundPosition});
      }
      return result;
    });
    assert(materials.every(m=>m.loaded&&m.matches),'All legend textures must load and match the map: '+JSON.stringify(materials));
    assert.equal(new Set(materials.map(m=>m.signature)).size,9,'Every surface needs a distinct texture');
    await page.locator('#predict').click();
    assert(await page.locator('#board [data-prediction=unknown]').count()>0,'Unknown terrain is explicit when displaying the robot opinion');
    await page.locator('#nextMission').click();
    assert(await page.locator('#run').isDisabled(),'Unknown terrain blocks a route rather than announcing readiness');
    assert.equal(await page.locator('#missionTask').getAttribute('data-state'),'preparing');
    assert.equal(await page.locator('#run').innerText(),'▶ Отвезти аптечки');
    assert.equal(await page.locator('#overallScore').innerText(),'0');
    await page.locator('#expedition-training').click();
    await page.locator('[data-index="8"]').click();
    const before=await page.evaluate(()=>samples.length);await page.locator('#unsafe').click();
    assert.equal(await page.evaluate(()=>samples.length),before,'A hypothesis alone is not a teaching example');
    await page.locator('#probe').click();
    assert((await page.locator('#sensorHint').innerText()).includes('Получилось иначе'));
    assert.equal(await page.evaluate(()=>samples.find(s=>s.f.join(',')===features(8).join(',')).y),0,'An incorrect guess is corrected by the physical experiment');
    assert(await page.locator('#run').isDisabled(),'New checked examples must be taught before the next trip');
    await page.locator('[data-index="100"]').click();const safeClay=await page.locator('#sensors').innerText();
    await page.locator('[data-index="102"]').click();const riskyClay=await page.locator('#sensors').innerText();
    assert.notEqual(safeClay,riskyClay,'Safe and risky clay have different readable sensor words');
    assert(riskyClay.includes('Очень влажно'));
    await teachTraining(page);
    assert.equal(await page.evaluate(()=>samples.length),18,'Eighteen examples provide a foundation for the expeditions');
    assert((await page.locator('#routePlan').getAttribute('points')).length>0,'The planned route is a continuous blue line');
    await page.locator('#nextMission').click();
    assert((await page.locator('#missionTask').innerText()).includes('без застревания'));
    const original=await page.evaluate(()=>JSON.stringify(grid)),oldStart=await page.evaluate(()=>start);
    await optimalDelivery(page);assert.equal(await page.locator('#overallScore').innerText(),'10');
    assert.equal(await page.evaluate(()=>start),oldStart,'The rescue base stays fixed');
    assert.equal(await page.evaluate(()=>JSON.stringify(grid)),original,'Delivery updates camp status without changing their ground');
    assert.equal(await page.locator('#campStatus [data-served=true]').count(),3);
    assert.equal(await page.locator('#cargo').innerText(),'0');
    await page.locator('#nextMission').click();await adaptGorge(page);await optimalDelivery(page);assert.equal(await page.locator('#overallScore').innerText(),'25');
    await page.locator('#nextMission').click();assert((await page.locator('#weather').innerText()).includes('дождя'));
    assert(await page.locator('#run').isDisabled(),'Rain leaves gaps in old experience; new experiments are needed');
    await adaptRain(page);await optimalDelivery(page);assert.equal(await page.locator('#overallScore').innerText(),'50');
    for(let i=0;i<2;i++)await optimalDelivery(page);
    if(await page.locator('#predict').getAttribute('aria-pressed')==='true')await page.locator('#predict').click();assert.equal(await page.locator('#predict').getAttribute('aria-pressed'),'false');
    await page.locator('#predict').click();assert.equal(await page.locator('#predictionLegend').isVisible(),true);
    await page.screenshot({path:path.join(shots,'robot-autonomous-delivery.png')});
    await page.locator('#learningNotebook > summary').click();await page.locator('#clear').click();
    if(await page.locator('.monitor-dialog[open]').count())await page.locator('.monitor-dialog > button').click();
    assert(await page.locator('#run').isDisabled());assert.equal(await page.locator('#overallScore').innerText(),'50','Removing examples preserves earned scores');
    const robotScore=50;
    await noOverflow();
    await page.locator('#epiTab').click();
    const cityFrame=page.frameLocator('#epiView');
    await cityFrame.locator('#mayor').waitFor(); await cityFrame.locator('#gameTour').waitFor();
    await tourFits(cityFrame); await startWatching('#map','.inhabitant',cityFrame);
    await cityFrame.locator('#observeCity').click();
    await cityFrame.locator('.tour-watching').waitFor(); await tourFits(cityFrame); await lit(['#map','#citizenStory'],cityFrame);
    await page.screenshot({path:path.join(shots,'city-moving-iframe-tutorial.png')});
    await step('Помоги добраться',cityFrame);
    await watched(cityFrame);
    await cityFrame.locator('#pick-bus-frequent').click();
    await step('Проверь своё',cityFrame); await startWatching('#map','.inhabitant',cityFrame); await cityFrame.locator('#tryCity').click();
    await step('Цели каждого',cityFrame); await watched(cityFrame); await City.finishLesson(cityFrame,tourFits);
    assert.equal(await cityFrame.locator('body').evaluate(()=>cityCampaignGame.current().game.day),0);
    await cityFrame.locator('#cityPeople > summary').click();
    await cityFrame.locator('.monitor-dialog[open]').waitFor();
    assert.equal(await cityFrame.locator('#citizenChoice option').count(),90,'Menu works without selecting an avatar');
    await cityFrame.locator('.monitor-dialog > button').click();
    for(const [place,title]of [['park','Парк'],['gym','Спортцентр']]){
      await cityFrame.locator('#cityBadges [data-place="'+place+'"]').press('Enter');
      await cityFrame.locator('.monitor-dialog[open]').waitFor();
      assert((await cityFrame.locator('#cityPlacePanel').innerText()).includes(title));
      await cityFrame.locator('.monitor-dialog > button').click();
      assert.equal(await cityFrame.locator('#cityPlaceInfo').isVisible(),false);
    }
    assert.equal(await cityFrame.locator('#cityGoalGrid .city-goal').count(),1);
    await cityFrame.locator('#cityConditions > summary').click();await cityFrame.locator('.monitor-dialog[open]').waitFor();
    assert.equal(await cityFrame.locator('#cityConditionGrid .city-goal').count(),5);
    await cityFrame.locator('.monitor-dialog > button').click();
    await City.maximum(cityFrame,async n=>{if(n===4||n===8)assert((await page.locator('#missionProgress').innerText()).includes('2 / 3'),'City completes only after all three rounds');});
    await page.waitForFunction(()=>+document.getElementById('overallScore').textContent===100);
    assert((await page.locator('#missionProgress').innerText()).includes('3 / 3'));
    assert.equal(await cityFrame.locator('#cityAttempts span').count(),1);
    assert.equal(await cityFrame.locator('.citizen-emotion').count(),4,'A few representative reactions keep the map readable');
    await page.screenshot({path:path.join(shots,'city-three-rounds.png')});
    await cityFrame.locator('#restartCity').click();
    await City.build(cityFrame,'bus');await City.build(cityFrame,'market');
    assert.equal(await cityFrame.locator('body').evaluate(()=>cityCampaignGame.current().funds),30);
    await City.refund(cityFrame,'bus');await City.build(cityFrame,'clinic');
    assert.equal(await cityFrame.locator('body').evaluate(()=>cityCampaignGame.current().funds),10);
    await City.refund(cityFrame,'market');await City.refund(cityFrame,'clinic');
    assert.equal(await cityFrame.locator('body').evaluate(()=>cityCampaignGame.current().funds),200);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await cityFrame.locator('#tryCity').click();
    await cityFrame.locator('.inhabitant[data-person="0"]').press('Enter');
    await cityFrame.locator('.monitor-dialog[open]').waitFor();
    assert.equal(await cityFrame.locator('body').evaluate(()=>cityCampaignGame.isPlaying()),false,'Clicking a moving inhabitant pauses the day');
    await cityFrame.locator('.monitor-dialog > button').click();
    assert.equal(await cityFrame.locator('body').evaluate(()=>cityCampaignGame.current().game.day),0);
    assert.equal(await cityFrame.locator('body').evaluate(()=>cityCampaignGame.isPlaying()),false);
    const frozen=await cityFrame.locator('.inhabitant').evaluateAll(els=>els.map(e=>e.getAttribute('transform')));
    await page.waitForTimeout(250);
    assert.deepEqual(await cityFrame.locator('.inhabitant').evaluateAll(els=>els.map(e=>e.getAttribute('transform'))),frozen,'Pause freezes the visible movement');
    await cityFrame.locator('.inhabitant[data-person="0"]').press('Enter');
    assert.equal(await cityFrame.locator('#citizenPanel .citizen-route li').count(),1,'A paused morning does not reveal future trips');
    if(await cityFrame.locator('.monitor-dialog[open]').count())await cityFrame.locator('.monitor-dialog > button').click();
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await cityFrame.locator('body').evaluate(()=>cityCampaignGame.current().game.day),0,'A paused day cannot finish in the background');
    await City.day(cityFrame);
    for(let n=1;n<12;n++)await City.day(cityFrame);
    assert.equal(await cityFrame.locator('#cityBestScore').innerText(),'50 / 50','A weaker replay preserves the best');
    assert.equal(await cityFrame.locator('#cityLocalScore').innerText(),'36 / 50','The current replay shows its own score');
    assert((await cityFrame.locator('#roundOutcome').innerText()).includes('Не выполнено:'));
    assert.equal(await page.locator('#overallScore').innerText(),'100','Overall score keeps the best result');
    assert.equal(await cityFrame.locator('#cityAttempts span').count(),2);
    assert.equal(await cityFrame.locator('#tryCity').isEnabled(),false);
    assert((await cityFrame.locator('body').evaluate(()=>cityCampaignGame.current().score))<50);
    await cityFrame.locator('.inhabitant[data-person="0"]').press('Enter');
    assert.equal(await cityFrame.locator('#citizenPanel .citizen-route li').count(),5);
    if(await cityFrame.locator('.monitor-dialog[open]').count())await cityFrame.locator('.monitor-dialog > button').click();
    await page.locator('#newParticipant').click();
    assert.equal(await page.locator('#overallScore').innerText(),'0');
    assert((await page.locator('#missionProgress').innerText()).includes('0 / 3'));
    assert.equal(await page.evaluate(()=>samples.length),0);
    assert.equal(await page.evaluate(()=>robotExpedition.current().stage),0);
    await page.locator('#tourSkip').click();
    await page.locator('#epiTab').click();
    await cityFrame.locator('#observeCity').waitFor();
    assert.equal(await cityFrame.locator('#cityLocalScore').innerText(),'0 / 50');
    assert.equal(await cityFrame.locator('#cityAttempts span').count(),0);
    if(await cityFrame.locator('#gameTour').count()) await cityFrame.locator('#tourSkip').click();
    await page.locator('#robotTab').click();

    await page.goto(url+'/epidemic.html');
    await page.locator('#mayor').waitFor();
    if(await page.locator('#gameTour').count()) await page.locator('#tourSkip').click();
    assert.equal(await page.locator('.city-mode-nav a').count(),1,'The short city is the normal game');
    await page.locator('#cityTutorial').click(); await tourFits(); await page.screenshot({path:path.join(shots,'city-tutorial.png')}); await page.locator('#tourSkip').click();
    await City.maximum(page);
    await page.screenshot({path:path.join(shots,'city-comparison.png')});
    await page.locator('.inhabitant[data-person="0"]').press('Enter');
    await page.locator('#citizenPanel').scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(shots,'citizen-desktop.png')});
    if(await page.locator('.monitor-dialog[open]').count())await page.locator('.monitor-dialog > button').click();
    await page.locator('#cityTutorial').click(); await page.locator('#observeCity').click();
    await step('Помоги добраться'); await page.locator('#pick-bus-frequent').click();
    await step('Проверь своё'); await page.locator('#tryCity').click();
    await step('Цели каждого');await tourFits();await page.locator('#tourNext').click();
    await step('Планируй улучшения');await tourFits();await page.locator('#tourNext').click();
    assert.equal(await page.locator('body').evaluate(()=>cityCampaignGame.current().game.day),12,'Tutorial replay preserves a completed city');
    assert.equal(await page.locator('#cityLocalScore').innerText(),'50 / 50');
    await page.locator('#mayorMapSlot').scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(shots,'city-desktop.png')}); await noOverflow();

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
      for (const route of ['/', '/epidemic.html', '/epidemic.html?mode=contest', '/epidemic.html?mode=lab']) {
        await page.evaluate(()=>sessionStorage.clear());
        await page.goto(url + route);
        await page.locator(route === '/' ? '#robotView' : route.includes('contest') ? '#contest' : route.includes('lab') ? '.lab-mode' : '#mayor').waitFor();
        if (await page.locator('#gameTour').count()) await page.locator('#tourSkip').click();
        if (route === '/') {
          await page.locator('#robotTutorial').click(); await tourFits();
          await lesson(page,tourFits);
          await page.evaluate(()=>window.scrollTo(0,0));
        } else if (route === '/epidemic.html') {
          await page.locator('#cityTutorial').click(); await tourFits(); await startWatching('#map','.inhabitant'); await page.locator('#observeCity').click();
          await page.locator('.tour-watching').waitFor(); await tourFits(); await page.screenshot({path:path.join(shots,`city-moving-${width}.png`)});
          await step('Помоги добраться'); await watched(); await tourFits(); await page.locator('#pick-bus-frequent').click();
          await step('Проверь своё'); await tourFits(); await startWatching('#map','.inhabitant'); await page.locator('#tryCity').click(); await step('Цели каждого'); await watched(); await City.finishLesson(page,tourFits);
          await page.evaluate(()=>window.scrollTo(0,0));
        }
        await noOverflow();
        const short = await page.locator('button:visible').evaluateAll(buttons => buttons.filter(b => !b.classList.contains('cell') && b.getBoundingClientRect().height < 43).map(b => b.id));
        assert.deepEqual(short, [], 'Visible action buttons must have sufficiently large targets');
      }
    }
    // Also check ordinary animation speed and the city embedded on a Full HD monitor.
    await page.setViewportSize({width:1920,height:1080}); await page.emulateMedia({reducedMotion:'no-preference'});
    await page.goto(url); await page.locator('#robotTutorial').click(); await tourFits();
    await lesson(page,tourFits);
    await page.locator('#epiTab').click();
    if(!await cityFrame.locator('#gameTour').count())await cityFrame.locator('#cityTutorial').click();
    await tourFits(cityFrame); await startWatching('#map','.inhabitant',cityFrame); await cityFrame.locator('#observeCity').click();
    await cityFrame.locator('.tour-watching').waitFor(); await tourFits(cityFrame); await lit(['#map','#citizenStory'],cityFrame);
    await page.screenshot({path:path.join(shots,'city-moving-iframe-1920.png')});
    await step('Помоги добраться',cityFrame); await watched(cityFrame); await cityFrame.locator('#tourSkip').click();
    await page.goto(url);
    await page.locator('#epiTab').click();
    await page.frameLocator('#epiView').locator('#mayor').waitFor();
    await page.locator('#robotTab').click();
    assert.equal(await page.locator('#robotView').isVisible(), true);
    assert.deepEqual(errors, [], 'No JS errors or missing game assets');
    console.log('Browser: glowing tutorials, actual learning quality, camp delivery, fixed base, hypothesis checks, nine surfaces, city reallocation, full 100/100, reset, citizens and Full HD/QHD layouts passed');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
