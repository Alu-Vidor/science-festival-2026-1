/* Check the objects themselves in an ordinary browser, not only the SVG box. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((request, response) => {
  const pathname = request.url.split('?')[0];
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return response.writeHead(404).end();
    response.setHeader('Content-Type', { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
      '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream');
    response.end(data);
  });
});

async function robotScale(page, displayScale) {
  const measured = await page.evaluate(() => {
    const map = document.querySelector('#routeMap').getBoundingClientRect();
    const roads = document.querySelector('#roads').getBoundingClientRect();
    const fonts = [...document.querySelectorAll('.road-label text,.node-name,.junction-letter')]
      .map(text => parseFloat(getComputedStyle(text).fontSize) * text.getScreenCTM().a);
    return { width: roads.width / map.width, height: map.height / innerHeight, font: Math.min(...fonts) };
  });
  assert(measured.width >= .75, 'The roads occupy at least 75% of the map width: ' + JSON.stringify(measured));
  assert(measured.height >= .42, 'The robot map gets at least 42% of the visible screen height: ' + JSON.stringify(measured));
  assert(measured.font * displayScale >= 14, 'The road and location labels remain readable in display pixels');
  assert.equal(await page.locator('body>header').count(), 0, 'No branding strip takes height above the games');
  const clipped = await page.locator('.robot-console').evaluate(panel => {
    const bounds = panel.getBoundingClientRect();
    return [...panel.children].filter(element => !element.hidden).filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > bounds.bottom - 5 || rect.bottom > innerHeight || rect.left < bounds.left;
    }).map(element => element.id || element.className);
  });
  assert.deepEqual(clipped, [], 'Robot learning and delivery controls fit beside the large map');
}

async function cityScale(city, displayScale) {
  const measured = await city.locator('#map').evaluate(map => {
    const box = map.getBoundingClientRect();
    const buildings = [...map.querySelectorAll('.building-sprite')].map(image => image.getBoundingClientRect());
    const fonts = [...map.querySelectorAll('#cityBadges text')]
      .map(text => parseFloat(getComputedStyle(text).fontSize) * text.getScreenCTM().a);
    return { count: buildings.length, smallest: Math.min(...buildings.map(rect => rect.width)),
      width: (Math.max(...buildings.map(rect => rect.right)) - Math.min(...buildings.map(rect => rect.left))) / box.width,
      height: (Math.max(...buildings.map(rect => rect.bottom)) - Math.min(...buildings.map(rect => rect.top))) / box.height,
      font: Math.min(...fonts) };
  });
  assert.equal(measured.count, 15, 'All districts and public buildings stay in the full city view');
  assert(measured.smallest * displayScale >= 70, 'Buildings are large enough to recognise: ' + JSON.stringify(measured));
  assert(measured.width >= .52 && measured.height >= .7, 'The city itself fills its map area');
  assert(measured.font * displayScale >= 13, 'City names and counts remain readable in display pixels');
}

(async () => {
  fs.mkdirSync(path.join(root, 'test-artifacts'), { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  try {
    // Browser chrome and a taskbar reduce the content area even on a 27-inch screen.
    // 2560×1306 at 75% represents a 1920-pixel display with a 980-pixel content area.
    for (const [width, height, displayScale] of [[1920, 900, 1], [1920, 980, 1], [2560, 1340, 1], [2560, 1306, .75]]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await context.addInitScript(() => localStorage.setItem('festival-tours-v6', JSON.stringify(['robot', 'city-mayor'])));
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto('http://127.0.0.1:' + server.address().port);
        if (width === 1920) {
          for (const font of ['Arial, sans-serif', 'DejaVu Sans, sans-serif', 'Noto Sans, sans-serif']) {
            await page.locator('body').evaluate((body, value) => body.style.fontFamily = value, font);
            await robotScale(page, displayScale);
          }
          await page.locator('body').evaluate(body => body.style.fontFamily = '');
        }
        await robotScale(page, displayScale);
        await page.locator('#labView').click();
        await robotScale(page, displayScale);
        await page.locator('#districtView').click();
        await page.screenshot({ path: path.join(root, 'test-artifacts', `large-robot-${width}x${height}.png`) });
        await page.locator('#epiTab').click();
        const city = page.frameLocator('#epiView');
        await city.locator('#mayor').waitFor();
        await city.locator('body.monitor-layout').waitFor();
        await city.locator('body').evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await cityScale(city, displayScale);
        await city.locator('#beginCity').click();
        await city.locator('body').evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await cityScale(city, displayScale);
        await page.screenshot({ path: path.join(root, 'test-artifacts', `large-city-${width}x${height}.png`) });
        assert.deepEqual(errors, []);
        console.log('Maps fill ordinary browser:', width, height, 'display scale', displayScale);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
