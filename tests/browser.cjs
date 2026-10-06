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
    async function tourFits() {
      const rect = await page.locator('.tour-card').boundingBox();
      const size = page.viewportSize();
      assert(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= size.width + 1 && rect.y + rect.height <= size.height + 1, 'Tour card must fit the viewport');
    }
    async function step(title, scope=page) { await scope.locator('#tourTitle').filter({hasText:title}).waitFor(); }
    await page.goto(url);
    await page.locator('#gameTour').waitFor();
    await tourFits();
    assert.equal(await page.locator('#robotView').evaluate(el=>el.inert),false);
    assert.equal(await page.locator('.training').evaluate(el=>el.inert),true);
    assert.equal(await page.locator('#tourNext').isVisible(),false,'Learning must wait for the actual action');
    await page.screenshot({path:path.join(shots,'robot-tutorial.png')});
    await page.locator('.tour-card').press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'run','Keyboard must reach the highlighted action');
    await page.locator('#run').press('Enter');
    await step('Изучи сухой');
    assert.equal(await page.locator('[data-index="1"]').evaluate(el=>el.inert),true);
    await page.locator('[data-index="0"]').click();
    await step('Покажи хороший'); await page.locator('#safe').click();
    await step('Найди причину'); await page.locator('[data-index="61"]').click();
    await step('Покажи опасный'); await page.locator('#unsafe').click();
    await step('Обучи ИИ'); await page.locator('#train').click();
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
    await cityFrame.locator('#observeCity').click();
    await step('Помоги добраться',cityFrame);
    await cityFrame.locator('#pick-bus-frequent').click();
    await step('Проверь своё',cityFrame); await cityFrame.locator('#tryCity').click();
    await cityFrame.locator('#gameTour').waitFor({state:'detached'});
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
          await page.locator('#run').click(); await step('Изучи сухой'); await tourFits();
          await page.locator('[data-index="0"]').click(); await step('Покажи хороший'); await tourFits(); await page.locator('#safe').click();
          await step('Найди причину'); await page.locator('[data-index="61"]').click(); await step('Покажи опасный'); await tourFits(); await page.locator('#unsafe').click();
          await step('Обучи ИИ'); await tourFits(); await page.locator('#train').click(); await page.locator('#gameTour').waitFor({state:'detached'});
          await page.evaluate(()=>window.scrollTo(0,0));
        } else if (route === '/epidemic.html') {
          await page.locator('#cityTutorial').click(); await tourFits(); await page.locator('#observeCity').click();
          await step('Помоги добраться'); await tourFits(); await page.locator('#pick-bus-frequent').click();
          await step('Проверь своё'); await tourFits(); await page.locator('#tryCity').click(); await page.locator('#gameTour').waitFor({state:'detached'});
          await page.evaluate(()=>window.scrollTo(0,0));
        }
        await noOverflow();
        const short = await page.locator('button:visible').evaluateAll(buttons => buttons.filter(b => !b.classList.contains('cell') && b.getBoundingClientRect().height < 43).map(b => b.id));
        assert.deepEqual(short, [], 'Visible action buttons must have touch-sized targets');
        if (width === 375 && !route.includes('lab')) await page.screenshot({ path: path.join(shots, route === '/' ? 'robot-mobile.png' : route.includes('contest') ? 'contest-mobile.png' : 'city-mobile.png') });
      }
    }
    await page.goto(url);
    await page.locator('#epiTab').click();
    await page.frameLocator('#epiView').locator('#mayor').waitFor();
    await page.locator('#robotTab').click();
    assert.equal(await page.locator('#robotView').isVisible(), true);
    assert.deepEqual(errors, [], 'No JS errors or missing game assets');
    console.log('Browser: action lessons, robot delivery/score/conditions, three city attempts, comparison, parent score/reset, citizens, legacy modes and 375/768/1280 layouts passed');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
