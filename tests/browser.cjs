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
    await page.goto(url);
    await page.locator('#gameTour').waitFor();
    await tourFits();
    assert.equal(await page.locator('#robotView').evaluate(el => el.inert), true);
    await page.screenshot({ path: path.join(shots, 'robot-tutorial.png') });
    await page.locator('#tourNext').click();
    await page.locator('#tourBack').click();
    assert((await page.locator('#tourTitle').innerText()).includes('спасательная'));
    await page.locator('.tour-card').press('Escape');
    assert.equal(await page.locator('#gameTour').count(), 0);
    assert.equal(await page.locator('#robotView').evaluate(el => el.inert), false);
    assert.equal(await page.evaluate(()=>window.scrollY),0,'Leaving auto-learning returns to the start');
    await page.locator('#run').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('застрял'), null, { timeout: 15000 });
    await page.locator('#robotEditor > summary').click();
    await page.locator('[data-tool=inspect]').click();
    for (const i of [0, 1, 2]) { await page.locator(`[data-index="${i}"]`).click(); await page.locator('#safe').click(); }
    for (const i of [86, 87, 98]) { await page.locator(`[data-index="${i}"]`).click(); await page.locator('#unsafe').click(); }
    assert.equal(await page.locator('#train').isEnabled(), true);
    await page.locator('#train').click();
    assert.equal(await page.locator('#strategy').inputValue(), 'ai');
    assert((await page.locator('#samples').innerText()).includes('Примеров: 6'));
    assert(await page.locator('#board .good').count() > 0);
    assert(await page.locator('#board .bad').count() > 0);
    assert.equal(await page.locator('#board .bad').evaluateAll(cells=>cells.every(cell=>getComputedStyle(cell).borderTopColor==='rgb(255, 135, 151)')),true,'Danger borders must remain red above terrain styles');
    assert((await page.locator('#board .bad').first().getAttribute('aria-label')).includes('прогноз ИИ: опасно'));
    await page.locator('#robotEditor > summary').click();
    await page.locator('#boardStage').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(shots, 'robot-desktop.png') });
    await noOverflow();

    await page.goto(url + '/epidemic.html');
    await page.locator('#mayor').waitFor();
    await page.locator('#gameTour').waitFor();
    await tourFits();
    await page.screenshot({ path: path.join(shots, 'city-tutorial.png') });
    await page.locator('#tourSkip').click();
    assert.equal(await page.locator('.city-mode-nav [aria-current=page]').innerText(), '🏙 Я — мэр');
    await page.locator('#cityInvestments > summary').click();
    await page.locator('#invest-bus').click();
    assert((await page.locator('#mayorDashboard').innerText()).includes('210 монет'));
    await page.locator('#mapLiveDay').click();
    assert.equal(await page.locator('#cityTutorial').isEnabled(), false);
    await page.waitForFunction(() => !document.getElementById('newMayor').disabled);
    assert((await page.locator('#dayReport').innerText()).includes('Итоги дня 1'));
    await page.locator('.inhabitant[data-person="0"]').press('Enter');
    assert.equal(await page.locator('#cityPeople').getAttribute('open'), '');
    assert((await page.locator('#citizenPanel').innerText()).includes('семья из'));
    assert.equal(await page.locator('#citizenPanel .citizen-route li').count(), 5);
    await page.locator('#citizenPanel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(shots, 'citizen-desktop.png') });
    await page.locator('#mayorMapSlot').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(shots, 'city-desktop.png') });
    await noOverflow();
    await page.locator('#cityTutorial').click();
    for (let step = 0; step < 9; step++) { await tourFits(); await page.locator('#tourNext').click(); }
    assert.equal(await page.locator('#gameTour').count(), 0);

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
    console.log('Browser: spotlight, keyboard/skip/replay, learning, city/citizens/upgrades, contest/final/timer, iframe and 375/768/1280 layouts passed');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
