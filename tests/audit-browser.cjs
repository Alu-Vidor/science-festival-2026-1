/* Repeated clicks, native dialogs and reloads must preserve attempts and shown history. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const server = http.createServer((request, response) => {
  const pathname = request.url.split('?')[0];
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return response.writeHead(404).end();
    response.setHeader('Content-Type', {
      '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css', '.svg': 'image/svg+xml'
    }[path.extname(file)] || 'application/octet-stream');
    response.end(data);
  });
});

async function waitForCity(scope) {
  await scope.locator('body').evaluate(() => new Promise((resolve, reject) => {
    const deadline = performance.now() + 40000;
    const timer = setInterval(() => {
      if (!cityCampaignGame.isPending()) { clearInterval(timer); resolve(); }
      else if (performance.now() > deadline) { clearInterval(timer); reject(Error('City run did not finish')); }
    }, 20);
  }));
}

async function cityGeometry(city, width) {
  const metrics = await city.locator('#map').evaluate(map => {
    const bounds = map.getBoundingClientRect(), buildings = [...map.querySelectorAll('.building-sprite')].map(sprite => sprite.getBoundingClientRect());
    const union = { left: Math.min(...buildings.map(r => r.left)), right: Math.max(...buildings.map(r => r.right)),
      top: Math.min(...buildings.map(r => r.top)), bottom: Math.max(...buildings.map(r => r.bottom)) };
    const labelFailures = [];
    for (const badge of map.querySelectorAll('#cityBadges > g')) {
      const background = badge.querySelector('rect').getBoundingClientRect();
      for (const text of badge.querySelectorAll('text')) {
        const rect = text.getBoundingClientRect();
        if (rect.left < background.left - 1 || rect.right > background.right + 1 || rect.top < background.top - 1 || rect.bottom > background.bottom + 1)
          labelFailures.push('Text outside its badge: ' + text.textContent);
        if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)
          labelFailures.push('Text outside the map: ' + text.textContent);
      }
    }
    return { count: buildings.length, smallest: Math.min(...buildings.map(r => r.width)),
      widthRatio: (union.right - union.left) / bounds.width, heightRatio: (union.bottom - union.top) / bounds.height,
      outside: buildings.some(r => r.left < bounds.left - 1 || r.right > bounds.right + 1 || r.top < bounds.top - 1 || r.bottom > bounds.bottom + 1), labelFailures };
  });
  assert.equal(metrics.count, 15);
  assert.equal(metrics.outside, false, 'All fifteen city buildings remain visible in the larger map');
  assert.deepEqual(metrics.labelFailures, [], 'Both label lines remain inside their badge and the city map');
  assert(metrics.smallest >= (width >= 2200 ? 110 : 75), 'Individual city buildings are large enough to inspect on the monitor: ' + JSON.stringify(metrics));
  assert(metrics.widthRatio >= .52 && metrics.heightRatio >= .70,
    'The painted city occupies the map area instead of leaving a small island: ' + JSON.stringify(metrics));
}

async function mapGeometry(page, stage, width) {
  const failures = await page.locator('#routeMap').evaluate(map => {
    const bounds = map.getBoundingClientRect(), failures = [];
    for (const element of map.querySelectorAll('.junction.location,.node-name,.junction-letter,.road-label')) {
      const rect = element.getBoundingClientRect();
      if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)
        failures.push('Outside map: ' + (element.closest('[data-node]')?.dataset.node || element.textContent.trim()));
    }
    const labels = [...map.querySelectorAll('.node-name,.junction-letter,.road-label')];
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i].getBoundingClientRect(), b = labels[j].getBoundingClientRect();
      if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1)
        failures.push('Overlapping labels: ' + labels[i].textContent + ' / ' + labels[j].textContent);
    }
    return failures;
  });
  assert.deepEqual(failures, [], stage + ' keeps locations and readable labels inside the map');
  if (stage !== 'lab') {
    const orders = await page.locator('.order-card').evaluateAll(cards => cards.map(card => {
      const [, code, title] = card.querySelector('strong').textContent.match(/^(\d)\.\s(.+)$/);
      return { id: card.dataset.order, code, title };
    }));
    for (const order of orders) {
      const location = page.locator('[data-node="' + order.id + '"]');
      assert.equal(await location.locator('.node-name').textContent(), order.title);
      assert.equal(await location.locator('.delivery-code').textContent(), order.code,
        'Order numbers and names identify the same destination on the map');
    }
  }
  await page.screenshot({ path: path.join(root, 'test-artifacts', `audit-map-${stage}-${width}.png`) });
}

async function robotAudit(page, width) {
  await mapGeometry(page, 'district-0', width);
  await page.locator('#labView').click();
  await page.locator('[data-node="W"]').press('Enter');
  await page.locator('[data-node="X"]').press('Space');
  await page.locator('[data-node="Y"]').click();
  assert.deepEqual(await page.evaluate(() => robotExpedition.current().route), ['S', 'W', 'X', 'Y']);
  await mapGeometry(page, 'lab', width);
  await page.locator('#routeMap').evaluate(map => {
    const road = map.querySelector('[data-edge="0"] .road-surface');
    const overlay = map.querySelector('.route-plan'), length = road.getTotalLength();
    for (const fraction of [.25, .5, .75]) {
      const a = road.getPointAtLength(length * fraction), b = overlay.getPointAtLength(length * fraction);
      if (Math.hypot(a.x - b.x, a.y - b.y) > .1) throw Error('The planned route cuts across a curved road');
    }
    const samples = [], curve = [];
    for (let position = 0; position <= length; position += .5) curve.push(road.getPointAtLength(position));
    curve.push(road.getPointAtLength(length));
    const start = road.getPointAtLength(0), end = road.getPointAtLength(length);
    window.auditRoadMotion = true; window.auditRoadSamples = samples;
    function take() {
      if (!window.auditRoadMotion) return;
      const state = robotExpedition.current();
      if (state.running && state.trips.at(-1).steps < 2) {
        const transform = document.querySelector('#robotSprite').transform.baseVal.consolidate().matrix;
        const x = transform.e, y = transform.f;
        const distance = Math.min(...curve.map(point => Math.hypot(point.x - x, point.y - y)));
        const chord = Math.abs((end.x - start.x) * (start.y - y) - (start.x - x) * (end.y - start.y)) / length;
        samples.push({ x, y, distance, chord });
      }
      requestAnimationFrame(take);
    }
    requestAnimationFrame(take);
  });

  // The second click must not hit a stop control replacing the launch control.
  await page.locator('#run').dblclick();
  let current = await page.evaluate(() => robotExpedition.current());
  assert.equal(current.trips.length, 1);
  assert.equal(current.running, true, 'Double-clicking launch starts one ordinary experiment');
  assert.equal(current.trips[0].interrupted, false);
  await page.locator('#robotTab').click();
  assert.equal(await page.evaluate(() => robotExpedition.current().running), true,
    'Clicking the active robot tab must not interrupt the trip');
  await page.waitForFunction(() => robotExpedition.current().trips.at(-1)?.steps >= 2);
  const motion = await page.evaluate(() => { window.auditRoadMotion = false; return window.auditRoadSamples; });
  assert(new Set(motion.map(sample => sample.x.toFixed(1) + ':' + sample.y.toFixed(1))).size > 2);
  assert(motion.every(sample => sample.distance < .6), 'The animated robot stays on the visible curved road');
  assert(motion.some(sample => sample.chord > 5), 'The robot follows the bend rather than its straight chord');
  await page.locator('#epiTab').click();
  current = await page.evaluate(() => robotExpedition.current());
  assert.equal(current.running, false);
  assert.equal(current.trips[0].interrupted, true, 'An actual tab change consumes the interrupted experiment');
  assert(current.trips[0].steps >= 2);
  const city = page.frameLocator('#epiView');
  await city.locator('#tourSkip').click();
  await page.locator('#robotTab').click();
  const interrupted = await page.evaluate(() => robotExpedition.current().trips[0]);
  await page.reload();
  assert.deepEqual(await page.evaluate(() => robotExpedition.current().trips[0]), interrupted);
  assert.deepEqual(await page.evaluate(() => robotExpedition.current().model), []);
  await page.locator('#train').press('Enter');
  const learned = await page.evaluate(() => robotExpedition.current().model);
  assert(learned.length > 0);
  await page.reload();
  assert.deepEqual(await page.evaluate(() => robotExpedition.current().model), learned);

  await page.locator('#run').dblclick();
  await page.waitForFunction(() => robotExpedition.current().trips.at(-1)?.steps >= 2);
  await page.locator('#stop').click();
  assert.equal(await page.evaluate(() => robotExpedition.current().trips.length), 2);
  assert(await page.locator('#run').isDisabled(), 'Stopping an experiment does not refund its slot');
  await page.reload();
  assert(await page.locator('#run').isDisabled(), 'Reload does not refund either experiment slot');
  assert.deepEqual(await page.evaluate(() => robotExpedition.current().model), learned,
    'New observations are not silently taught on stop or reload');

  await page.locator('#districtView').click();
  await page.locator('[data-order="L"]').press('Enter');
  await page.locator('[data-order="M"]').press('Space');
  await page.locator('[data-order="G"]').click();
  assert.deepEqual(await page.evaluate(() => robotExpedition.current().selected), ['L', 'M']);
  assert((await page.locator('#status').innerText()).includes('Свободно: 1'));
  await page.locator('#run').dblclick();
  assert.equal(await page.evaluate(() => robotExpedition.current().running), true);
  await page.locator('#robotTab').click();
  assert.equal(await page.evaluate(() => robotExpedition.current().running), true);
  await page.waitForFunction(() => robotExpedition.current().trips.at(-1)?.steps >= 2);
  await page.locator('#stop').click();
  assert.equal(await page.evaluate(() => robotExpedition.current().score.stars), 0);
  assert(await page.locator('#nextRound').isVisible());
  await page.locator('#notebookButton').press('Enter');
  assert.equal(await page.locator('.trip-entry').count(), 3);
  await page.locator('.trip-entry summary').first().press('Enter');
  assert(await page.locator('.trip-entry table').first().isVisible());
  await page.locator('#robotDialog').press('Escape');
  assert.equal(await page.locator('#robotDialog').evaluate(dialog => dialog.open), false);
  await page.locator('#labView').click();
  assert(await page.locator('#run').isDisabled(), 'A spent delivery cannot be reopened through the laboratory');
  await page.reload();
  assert.equal(await page.evaluate(() => robotExpedition.current().trips.length), 3);
  assert.equal(await page.evaluate(() => robotExpedition.current().score.stars), 0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#districtView').click();
  for (let round = 1; round < 3; round++) {
    await page.locator('#nextRound').click();
    await mapGeometry(page, 'district-' + round, width);
    await page.locator('.order-card').first().press('Enter');
    await page.locator('#run').click();
    await page.waitForFunction(() => !robotExpedition.current().running);
  }
  await page.locator('#newParticipant').click();
  assert.equal(await page.locator('#overallScore').innerText(), '0');
  assert.equal(await page.evaluate(() => robotExpedition.current().trips.length), 0);
  assert.deepEqual(await page.evaluate(() => robotExpedition.current().model), []);
  console.log('Robot double-clicks, active tab, explicit learning and interruption limits:', width);
}

async function cityAudit(page, width) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#epiTab').click();
  const city = page.frameLocator('#epiView');
  await city.locator('#tourTitle').filter({ hasText: 'Сначала наблюдай' }).waitFor();
  await city.locator('#observeCity').click();
  await city.locator('#tourTitle').filter({ hasText: 'Помоги добраться' }).waitFor();
  await city.locator('#pick-bus-frequent').click();
  await city.locator('#tourTitle').filter({ hasText: 'Проверь своё решение' }).waitFor();
  await city.locator('#tryCity').click();
  await city.locator('#tourTitle').filter({ hasText: 'Цели каждого раунда' }).waitFor();
  await city.locator('#tourBack').click();
  await city.locator('#tourTitle').filter({ hasText: 'Проверь своё решение' }).waitFor();
  assert(await city.locator('#tryCity').isVisible());
  assert(await city.locator('#tryCity').isEnabled(), 'Returning to a tutorial step must restore its required action');
  await city.locator('#tryCity').click();
  await city.locator('#tourTitle').filter({ hasText: 'Цели каждого раунда' }).waitFor();
  assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.current().game.day), 0);
  assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.current().score), 0);
  assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.trials().length), 0);
  await city.locator('#gameTour').press('Escape');
  await city.locator('#beginCity').click();
  await cityGeometry(city, width);
  await page.screenshot({ path: path.join(root, 'test-artifacts', `audit-city-native-${width}.png`) });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const initial = await city.locator('body').evaluate(() => JSON.stringify(cityCampaignGame.current()));
  await city.locator('#trialCity').dblclick();
  assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.trials().length), 1);
  await city.locator('#pauseCity').dblclick();
  assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.isPlaying()), false);
  assert(await city.locator('#cityTutorial').isDisabled(), 'An unavailable tutorial must not look actionable during a pending run');
  await city.locator('#inspect-care').press('Enter');
  assert((await city.locator('#flowPanel').innerText()).includes('ещё не показан'));
  assert.equal(await city.locator('.flow-chain').count(), 0, 'An unshown phase must not reveal computed future results');
  await city.locator('.monitor-dialog').press('Escape');
  await page.locator('#epiTab').click();
  assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.isPlaying()), false);
  await page.locator('#robotTab').click();
  await page.locator('#epiTab').click();
  await page.reload();
  await city.locator('#mayor').waitFor();
  assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.trials().length), 1);
  assert(await city.locator('#trialCity').isDisabled());
  assert(await city.locator('#tryCity').isEnabled());
  assert.equal(await city.locator('body').evaluate(() => JSON.stringify(cityCampaignGame.current())), initial);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await city.locator('#tryCity').dblclick();
  await waitForCity(city);
  assert(await city.locator('#cityTutorial').isEnabled());
  assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.trials().length), 1);
  assert.equal(await city.locator('body').evaluate(() => JSON.stringify(cityCampaignGame.current())), initial);
  await city.locator('#trialCity').dblclick();
  await waitForCity(city);
  const expected = await city.locator('body').evaluate(() => cityCampaignGame.trial().result);
  assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.trials().length), 2);
  assert(await city.locator('#trialCity').isDisabled());
  await page.reload();
  await city.locator('#mayor').waitFor();
  assert(await city.locator('#trialCity').isDisabled(), 'Reload does not refund trial slots');
  await city.locator('#tryCity').dblclick();
  await waitForCity(city);
  assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.current().game.day), 4);
  assert.deepEqual(await city.locator('body').evaluate(() => cityCampaignGame.current().results[0]), expected,
    'A scored run repeats the tested plan and commits exactly one round');

  const calendar = await city.locator('#cityCalendar').innerText();
  await city.locator('#inspect-activity').press('Enter');
  await city.locator('#flowDay').selectOption('1');
  await city.locator('.flow-people button').first().click();
  await city.locator('#cityPeople[open]').waitFor();
  assert(await city.locator('#returnToShown').isVisible());
  await city.locator('#returnToShown').click();
  await city.locator('.monitor-dialog[open]').waitFor({ state: 'hidden' });
  assert.equal(await city.locator('#cityCalendar').innerText(), calendar);
  await city.locator('#inspect-activity').click();
  assert.deepEqual(await city.locator('#flowDay option').evaluateAll(options => options.map(option => option.value)),
    ['1', '2', '3', '4']);
  await city.locator('.monitor-dialog').press('Escape');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await city.locator('#tryCity').dblclick();
  await city.locator('#pauseCity').press('Space');
  const pausedCalendar = await city.locator('#cityCalendar').innerText();
  assert(await city.locator('#pick-bus-normal').isDisabled());
  await page.locator('#robotTab').click();
  await page.reload();
  await page.locator('#epiTab').click();
  await city.locator('#mayor').waitFor();
  assert.equal(await city.locator('#cityCalendar').innerText(), pausedCalendar);
  assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.current().game.day), 4);
  assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.isPending()), true);
  assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.isPlaying()), false);
  await city.locator('#cityPeople>summary').press('Enter');
  await city.locator('#citizenChoice').selectOption('89');
  await page.locator('#newParticipant').click();
  await page.waitForFunction(() => {
    try {
      const game = document.querySelector('#epiView').contentWindow.cityCampaignGame;
      return game?.current().game.day === 0 && !game.isPending() && game.trials().length === 0;
    } catch { return false; }
  });
  assert.equal(await page.locator('#overallScore').innerText(), '0');
  assert.equal(await page.evaluate(() => robotExpedition.current().trips.length), 0);
  await page.locator('#epiTab').click();
  await city.locator('#mayor').waitFor();
  assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.current().funds), 200);
  await page.reload();
  await city.locator('#mayor').waitFor();
  assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.current().game.day), 0);
  assert.equal(await page.locator('#overallScore').innerText(), '0');
  console.log('City double-clicks, copy fairness, shown history, frozen reload and reset:', width);
}

async function fileLoadingAudit(browser) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    // The controller may finish before the tutorial's script on a first local-file load.
    await page.route('**/learning-ui.js*', async route => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.continue();
    });
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href + '#epidemic');
    const city = page.frameLocator('#epiView');
    await city.locator('#tourSkip').waitFor({ state: 'visible' });
    assert.equal(await city.locator('#tourTitle').innerText(), 'Сначала наблюдай');
    assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.current().game.day), 0);
    await city.locator('#tourSkip').click();
    await city.locator('#beginCity').click();
    assert.equal(await city.locator('#trialCity').isEnabled(), true);
    assert.deepEqual(errors, []);
    console.log('Local-file tutorial opens after a delayed script on a direct city link');
  } finally { await context.close(); }
}

async function fileAudit(browser, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await page.locator('#labView').click();
    await page.locator('[data-node="W"]').press('Enter');
    await page.locator('#run').click();
    await page.waitForFunction(() => !robotExpedition.current().running);
    await page.locator('#train').click();
    const learned = await page.evaluate(() => robotExpedition.current().model);
    assert(learned.length > 0);
    await page.locator('#districtView').click();
    await page.locator('[data-order="L"]').click();
    await page.locator('#run').click();
    await page.waitForFunction(() => !robotExpedition.current().running);
    const robot = await page.evaluate(() => robotExpedition.current());
    assert(robot.score.stars > 0);
    const robotPoints = Number(await page.locator('#overallScore').innerText());
    await page.reload();
    assert.deepEqual(await page.evaluate(() => robotExpedition.current().trips), robot.trips);
    assert.deepEqual(await page.evaluate(() => robotExpedition.current().model), learned);
    assert.equal(Number(await page.locator('#overallScore').innerText()), robotPoints);

    await page.locator('#epiTab').click();
    const city = page.frameLocator('#epiView');
    await city.locator('#mayor').waitFor();
    await city.locator('#tourSkip').click();
    await city.locator('#beginCity').click();
    assert.equal(await city.locator('body').evaluate(body => body.classList.contains('monitor-layout')), true,
      'The file iframe uses desktop layout even when its parent window has an opaque origin');
    await cityGeometry(city, width);
    const layoutFailures = await city.locator('body').evaluate(body => {
      const failures = [];
      if (document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1)
        failures.push('The city requires viewport scrolling');
      for (const id of ['map', 'cityGoalGrid', 'mayorPolicies', 'trialCity', 'tryCity', 'flowButtons']) {
        const element = document.getElementById(id), rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.left < -1 || rect.top < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1)
          failures.push(id + ' is hidden or outside the iframe viewport');
      }
      if (!body.classList.contains('monitor-embedded')) failures.push('Missing embedded monitor layout');
      return failures;
    });
    assert.deepEqual(layoutFailures, [], 'The local-file city and its controls fit the festival monitor');
    await page.screenshot({ path: path.join(root, 'test-artifacts', `audit-file-city-${width}.png`) });
    await city.locator('#pick-bus-frequent').click();
    const initial = await city.locator('body').evaluate(() => JSON.stringify(cityCampaignGame.current()));
    await city.locator('#trialCity').click();
    await waitForCity(city);
    assert.equal(await city.locator('body').evaluate(() => JSON.stringify(cityCampaignGame.current())), initial);
    const expected = await city.locator('body').evaluate(() => cityCampaignGame.trial().result);
    await city.locator('#tryCity').click();
    await waitForCity(city);
    assert.deepEqual(await city.locator('body').evaluate(() => cityCampaignGame.current().results[0]), expected);
    const cityPoints = parseInt(await city.locator('#cityLocalScore').innerText(), 10);
    assert(cityPoints > 0);
    await page.waitForFunction(total => Number(document.querySelector('#overallScore').textContent) === total,
      robotPoints + cityPoints);
    await page.reload();
    await city.locator('#mayor').waitFor();
    assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.current().game.day), 4);
    assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.trials().length), 1);
    assert.equal(Number(await page.locator('#overallScore').innerText()), robotPoints + cityPoints);
    assert.deepEqual(await page.evaluate(() => robotExpedition.current().trips), robot.trips);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await city.locator('#trialCity').click();
    await city.locator('#pauseCity').click();
    assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.isPending()), true);
    await page.waitForFunction(() => FestivalSession.read('city')?.pending?.kind === 'trial');
    const frozen = await page.evaluate(() => FestivalSession.read('city').pending);
    const pausedCalendar = await city.locator('#cityCalendar').innerText();
    await page.reload();
    await city.locator('#mayor').waitFor();
    assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.isPending()), true);
    assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.isPlaying()), false);
    assert.deepEqual(await page.evaluate(() => FestivalSession.read('city').pending), frozen);
    assert.equal(await city.locator('#cityCalendar').innerText(), pausedCalendar);
    assert.equal(await city.locator('#cityTutorial').isDisabled(), true);
    await page.locator('#newParticipant').click();
    await page.locator('#epiTab').click();
    await city.locator('#mayor').waitFor();
    await city.locator('body').evaluate(() => new Promise((resolve, reject) => {
      const deadline = performance.now() + 5000;
      const timer = setInterval(() => {
        if (cityCampaignGame.current().game.day === 0 && !cityCampaignGame.isPending()) { clearInterval(timer); resolve(); }
        else if (performance.now() > deadline) { clearInterval(timer); reject(Error('File city did not reset')); }
      }, 20);
    }));
    assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.trials().length), 0);
    assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.current().funds), 200);
    assert.equal(await page.locator('#overallScore').innerText(), '0');
    assert.equal(await page.evaluate(() => robotExpedition.current().trips.length), 0);
    await page.reload();
    await city.locator('#mayor').waitFor();
    assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.current().game.day), 0);
    assert.equal(await page.locator('#overallScore').innerText(), '0');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await city.locator('#tourSkip').click();
    await city.locator('#beginCity').click();
    await city.locator('#pick-bus-frequent').click();
    await city.locator('#tryCity').click();
    await waitForCity(city);
    assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.current().game.day), 4);
    assert.equal(await city.locator('#cityLocalScore').innerText(), '16 / 50');
    await page.waitForFunction(() => document.querySelector('#overallScore').textContent === '16');
    const session = await page.evaluate(() => FestivalSession.id);
    assert.notEqual(session, 'initial');
    assert.equal(await city.locator('body').evaluate(() => new URLSearchParams(location.search).get('session')), session);

    const forged = await page.evaluate(() => ({ kind: 'city-score', version: GameScore.VERSION,
      session: FestivalSession.id, score: 50, completed: true, auditToken: 'unrelated-frame' }));
    const checkpoint = await page.evaluate(() => JSON.stringify(FestivalSession.read('city')));
    await page.evaluate(payload => new Promise((resolve, reject) => {
      const frame = document.createElement('iframe');
      frame.hidden = true; frame.sandbox = 'allow-scripts';
      const timer = setTimeout(() => { cleanup(); reject(Error('Forged iframe message did not arrive')); }, 5000);
      const listener = event => { if (event.data?.auditToken === payload.auditToken) { cleanup(); resolve(); } };
      function cleanup() { clearTimeout(timer); removeEventListener('message', listener); frame.remove(); }
      addEventListener('message', listener);
      frame.srcdoc = '<script>const payload=' + JSON.stringify(payload) + ';' +
        'parent.postMessage({...payload,kind:"festival-session-save",version:1,name:"city",value:{rules:"forged"},auditToken:"forged-checkpoint"},"*");' +
        'parent.postMessage(payload,"*")<\/script>';
      document.body.appendChild(frame);
    }), forged);
    assert.equal(await page.locator('#overallScore').innerText(), '16', 'An unrelated opaque iframe cannot forge city points');
    assert.equal(await page.evaluate(() => JSON.stringify(FestivalSession.read('city'))), checkpoint,
      'An unrelated opaque iframe cannot overwrite the current city checkpoint');
    await page.evaluate(() => {
      window.auditStaleMessage = new Promise(resolve => {
        const listener = event => { if (event.data?.auditToken === 'stale-session') { removeEventListener('message', listener); resolve(); } };
        addEventListener('message', listener);
      });
    });
    await city.locator('body').evaluate((body, payload) => {
      parent.postMessage({ ...payload, kind: 'festival-session-save', version: 1, name: 'city',
        value: { rules: 'forged' }, session: 'initial', auditToken: 'stale-checkpoint' }, '*');
      parent.postMessage({ ...payload, session: 'initial', auditToken: 'stale-session' }, '*');
    }, forged);
    await page.evaluate(() => window.auditStaleMessage);
    assert.equal(await page.locator('#overallScore').innerText(), '16', 'The real city frame cannot publish an old participant score');
    assert.equal(await page.evaluate(() => JSON.stringify(FestivalSession.read('city'))), checkpoint,
      'A stale participant cannot overwrite the current city checkpoint');

    await page.reload();
    await city.locator('#mayor').waitFor();
    assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.current().game.day), 4);
    assert.equal(await city.locator('body').evaluate(() => cityCampaignGame.trials().length), 0);
    assert.equal(await city.locator('#cityLocalScore').innerText(), '16 / 50');
    assert.equal(await page.locator('#overallScore').innerText(), '16');
    assert.equal(await page.evaluate(() => FestivalSession.id), session);
    assert.deepEqual(errors, [], 'Opening local files, switching games and resetting must not raise cross-origin errors');
    console.log('Local-file desktop layout, both saves, guarded score bridge and a new saved participant:', width, height);
  } finally {
    await context.close();
  }
}

(async () => {
  fs.mkdirSync(path.join(root, 'test-artifacts'), { recursive: true });
  const fileOnly = process.argv.includes('--file-only');
  if (!fileOnly) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  try {
    for (const [width, height] of [[1920, 1080], [2560, 1440]]) {
      if (!fileOnly) {
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference' });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('http://127.0.0.1:' + server.address().port);
        await robotAudit(page, width);
        await cityAudit(page, width);
        assert.deepEqual(errors, []);
        await context.close();
      }
      await fileAudit(browser, width, height);
      if (width === 1920) await fileLoadingAudit(browser);
    }
  } finally {
    await browser.close();
    if (server.listening) server.close();
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
