/* Real DOM/CSS and end-to-end checks. Playwright is a test dependency only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const base = path.resolve(__dirname, '..'), shots = path.join(base, 'test-artifacts');
const server = http.createServer((req, res) => {
  const file = path.resolve(base, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!file.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.webp': 'image/webp' })[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
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
      for (const selector of ['#tourTitle','#tourText']) {
        const text=await scope.locator(selector).boundingBox();
        if(text.y<rect.y||text.y+text.height>rect.y+rect.height-4) await page.screenshot({path:path.join(shots,'lesson-text-failure.png')});
        assert(text.y>=rect.y&&text.y+text.height<=rect.y+rect.height-4,'The short lesson text must be readable without scrolling: '+selector+' '+JSON.stringify({card:rect,text}));
      }
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
    assert.equal(await page.locator('#robotView').evaluate(el=>el.inert),false);
    assert.equal(await page.locator('.training').evaluate(el=>el.inert),true);
    assert.equal(await page.locator('#tourNext').isVisible(),false,'Learning must wait for the actual action');
    await lit(['#run','#boardStage']);
    assert(await page.locator('#boardStage').evaluate(el=>!!el.closest('[inert]')),'Lighting the map must not allow unrelated actions');
    await page.screenshot({path:path.join(shots,'robot-tutorial.png')});
    await page.locator('.tour-card').press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'run','Keyboard must reach the highlighted action');
    await startWatching('#boardStage','#robotSprite');
    await page.locator('#run').press('Enter');
    await page.locator('.cell.stuck').waitFor(); await tourFits(); await lit(['#boardStage','#robotSprite']);
    await page.screenshot({path:path.join(shots,'robot-moving-tutorial.png')});
    await step('Изучи сухой');
    await watched();
    assert.equal(await page.locator('[data-index="1"]').evaluate(el=>el.inert),true);
    await page.locator('[data-index="0"]').click();
    await step('Покажи хороший'); await lit(['#sensors','#selectedName','#safe']); await page.locator('#safe').click();
    await step('Найди причину'); await page.locator('[data-index="61"]').click();
    await step('Покажи опасный'); await lit(['#sensors','#selectedName','#unsafe']); await page.screenshot({path:path.join(shots,'robot-sensors-tutorial.png')}); await page.locator('#unsafe').click();
    await step('Обучи ИИ'); await page.locator('#train').click();
    await page.locator('.tour-watching').waitFor(); await lit(['#boardStage']);
    assert(await page.locator('#board .bad').count()>0,'Predictions must be visible before the lesson closes');
    await page.screenshot({path:path.join(shots,'robot-predictions-tutorial.png')});
    await page.locator('#gameTour').waitFor({state:'detached'});
    assert.equal(await page.locator('.training').evaluate(el=>el.inert),false);
    assert.equal(await page.locator('#overallScore').innerText(),'0','The two guided examples alone are not the independent task');
    for(const i of [1,2]) { await page.locator(`[data-index="${i}"]`).click(); await page.locator('#safe').click(); }
    for(const i of [67,68]) { await page.locator(`[data-index="${i}"]`).click(); await page.locator('#unsafe').click(); }
    await page.locator('#train').click();
    assert((await page.locator('#samples').innerText()).includes('Безопасных: 3 / 3'));
    assert((await page.locator('#samples').innerText()).includes('опасных: 3 / 3'));
    const training = +(await page.locator('#overallScore').innerText()); assert(training>0 && training<=20);
    assert(await page.locator('#board .bad').count()>0);
    assert.equal(await page.locator('#board .bad').evaluateAll(cells=>cells.every(c=>getComputedStyle(c).borderTopColor==='rgb(255, 135, 151)')),true);
    await page.locator('#run').click();
    await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Доставлено 3'));
    assert.equal(+(await page.locator('#overallScore').innerText()),training+30);
    await page.locator('#robotEditor > summary').click();
    await page.locator('#energy').evaluate(el=>{el.value='80';el.dispatchEvent(new Event('input'));});
    await page.locator('#run').click();
    await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Доставлено 3'));
    assert.equal(+(await page.locator('#overallScore').innerText()),training+30,'Changed conditions must not award delivery points');
    assert((await page.locator('#deliveryTries').innerText()).includes('1 / 3'));
    await page.locator('#energy').evaluate(el=>{el.value='60';el.dispatchEvent(new Event('input'));});
    await page.locator('#robotEditor > summary').click();
    for(let attempt=2;attempt<=3;attempt++){await page.locator('#run').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Доставлено 3'));}
    await page.locator('#run').click(); assert((await page.locator('#status').innerText()).includes('Три доставки'));
    await page.locator('#boardStage').scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(shots,'robot-desktop.png')}); await noOverflow();
    await page.locator('#robotTutorial').click();
    await page.locator('.tour-card').press('Escape');
    assert.equal(await page.locator('#gameTour').count(),0);
    assert.equal(await page.locator('#robotTutorial').evaluate(el=>el.inert),false);

    await page.locator('#epiTab').click();
    const cityFrame=page.frameLocator('#epiView');
    await cityFrame.locator('#mayor').waitFor(); await cityFrame.locator('#gameTour').waitFor();
    await tourFits(cityFrame); await startWatching('#map','.inhabitant',cityFrame);
    await cityFrame.locator('#observeCity').click();
    await cityFrame.locator('.tour-watching').waitFor(); await tourFits(cityFrame);
    await page.screenshot({path:path.join(shots,'city-moving-iframe-tutorial.png')});
    await step('Помоги добраться',cityFrame);
    await watched(cityFrame);
    await cityFrame.locator('#pick-bus-frequent').click();
    await step('Проверь своё',cityFrame); await startWatching('#map','.inhabitant',cityFrame); await cityFrame.locator('#tryCity').click();
    await cityFrame.locator('#gameTour').waitFor({state:'detached'});
    await watched(cityFrame);
    assert.equal(await cityFrame.locator('#cityAttempts span').count(),1);
    const firstCity=parseInt(await cityFrame.locator('#cityLocalScore').innerText());
    await page.waitForFunction(value=>+document.getElementById('overallScore').textContent===value,training+30+firstCity);
    assert((await page.locator('#missionProgress').innerText()).includes('3 / 3'));
    await cityFrame.locator('#pick-school-shifts').click(); await cityFrame.locator('#tryCity').click();
    await cityFrame.locator('#cityAttempts span').nth(1).waitFor();
    const bestCity=parseInt(await cityFrame.locator('#cityLocalScore').innerText()); assert(bestCity>firstCity);
    await cityFrame.locator('#pick-shops-one').click(); await cityFrame.locator('#tryCity').click();
    await cityFrame.locator('#cityAttempts span').nth(2).waitFor();
    assert.equal(parseInt(await cityFrame.locator('#cityLocalScore').innerText()),bestCity);
    assert.equal(await cityFrame.locator('#tryCity').isEnabled(),false);
    assert((await cityFrame.locator('#cityNeeds').innerText()).includes('не хватает еды'));
    await cityFrame.locator('.inhabitant[data-person="0"]').press('Enter');
    assert.equal(await cityFrame.locator('#citizenPanel .citizen-route li').count(),5);
    await page.locator('#leaderTools > summary').click(); await page.locator('#newParticipant').click();
    assert.equal(await page.locator('#overallScore').innerText(),'0');
    assert((await page.locator('#missionProgress').innerText()).includes('0 / 3'));
    assert((await page.locator('#samples').innerText()).includes('Безопасных: 0 / 3'));
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
    await page.locator('#observeCity').click(); await page.waitForFunction(()=>!document.getElementById('tryCity').disabled);
    await page.locator('#pick-school-shifts').click(); await page.locator('#pick-bus-frequent').click(); await page.locator('#tryCity').click();
    await page.locator('#cityAttempts span').waitFor();
    await page.locator('#cityComparison').scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(shots,'city-comparison.png')});
    await page.locator('#cityTutorial').click(); for(let i=0;i<3;i++){await tourFits();await page.locator('#tourNext').click();} assert.equal(await page.locator('#gameTour').count(),0);
    await page.locator('.inhabitant[data-person="0"]').press('Enter'); await page.locator('#citizenPanel').scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(shots,'citizen-desktop.png')});
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

    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
      for (const route of ['/', '/epidemic.html', '/epidemic.html?mode=contest', '/epidemic.html?mode=lab']) {
        await page.goto(url + route);
        await page.locator(route === '/' ? '#robotView' : route.includes('contest') ? '#contest' : route.includes('lab') ? '.lab-mode' : '#mayor').waitFor();
        if (await page.locator('#gameTour').count()) await page.locator('#tourSkip').click();
        if (route === '/') {
          await page.locator('#robotTutorial').click(); await tourFits();
          await startWatching('#boardStage','#robotSprite'); await page.locator('#run').click();
          await page.locator('.cell.stuck').waitFor(); await tourFits();
          await page.screenshot({path:path.join(shots,`robot-moving-${width}.png`)});
          await step('Изучи сухой'); await watched(); await tourFits();
          await page.locator('[data-index="0"]').click(); await step('Покажи хороший'); await tourFits(); await lit(['#sensors','#selectedName','#safe']); await page.locator('#safe').click();
          await step('Найди причину'); await page.locator('[data-index="61"]').click(); await step('Покажи опасный'); await tourFits(); await lit(['#sensors','#selectedName','#unsafe']); await page.screenshot({path:path.join(shots,`robot-sensors-${width}.png`)}); await page.locator('#unsafe').click();
          await step('Обучи ИИ'); await tourFits(); await page.locator('#train').click(); await page.locator('.tour-watching').waitFor(); await lit(['#boardStage']); await page.locator('#gameTour').waitFor({state:'detached'});
          await page.evaluate(()=>window.scrollTo(0,0));
        } else if (route === '/epidemic.html') {
          await page.locator('#cityTutorial').click(); await tourFits(); await startWatching('#map','.inhabitant'); await page.locator('#observeCity').click();
          await page.locator('.tour-watching').waitFor(); await tourFits(); await page.screenshot({path:path.join(shots,`city-moving-${width}.png`)});
          await step('Помоги добраться'); await watched(); await tourFits(); await page.locator('#pick-bus-frequent').click();
          await step('Проверь своё'); await tourFits(); await startWatching('#map','.inhabitant'); await page.locator('#tryCity').click(); await page.locator('#gameTour').waitFor({state:'detached'}); await watched();
          await page.evaluate(()=>window.scrollTo(0,0));
        }
        await noOverflow();
        const short = await page.locator('button:visible').evaluateAll(buttons => buttons.filter(b => !b.classList.contains('cell') && b.getBoundingClientRect().height < 43).map(b => b.id));
        assert.deepEqual(short, [], 'Visible action buttons must have touch-sized targets');
        if (width === 375 && !route.includes('lab')) await page.screenshot({ path: path.join(shots, route === '/' ? 'robot-mobile.png' : route.includes('contest') ? 'contest-mobile.png' : 'city-mobile.png') });
      }
    }
    // Also check ordinary animation speed and the city embedded on a narrow laptop.
    await page.setViewportSize({width:768,height:900}); await page.emulateMedia({reducedMotion:'no-preference'});
    await page.goto(url); await page.locator('#robotTutorial').click(); await tourFits();
    await startWatching('#boardStage','#robotSprite'); await page.locator('#run').click();
    await page.locator('.cell.stuck').waitFor(); await tourFits(); await lit(['#boardStage','#robotSprite']);
    await step('Изучи сухой'); await watched(); await page.locator('#tourSkip').click();
    await page.locator('#epiTab').click();
    if(!await cityFrame.locator('#gameTour').count())await cityFrame.locator('#cityTutorial').click();
    await tourFits(cityFrame); await startWatching('#map','.inhabitant',cityFrame); await cityFrame.locator('#observeCity').click();
    await cityFrame.locator('.tour-watching').waitFor(); await tourFits(cityFrame);
    await page.screenshot({path:path.join(shots,'city-moving-iframe-768.png')});
    await step('Помоги добраться',cityFrame); await watched(cityFrame); await cityFrame.locator('#tourSkip').click();
    await page.goto(url);
    await page.locator('#epiTab').click();
    await page.frameLocator('#epiView').locator('#mayor').waitFor();
    await page.locator('#robotTab').click();
    assert.equal(await page.locator('#robotView').isVisible(), true);
    assert.deepEqual(errors, [], 'No JS errors or missing game assets');
    console.log('Browser: unobscured robot/city animation, sensors and predictions, iframe tooltip placement, action lessons, scores/reset, citizens, legacy modes and 375/768/1280 layouts passed');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
