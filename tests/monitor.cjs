const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + (req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (e, data) => { if(e) return res.writeHead(404).end(); res.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css'})[path.extname(file)] || 'application/octet-stream'); res.end(data); });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  const failures=[];
  try {
    for (const [width,height] of [[1024,768],[1280,720],[1366,680],[1366,768],[1440,900],[1920,1080]]) {
      const context = await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
      await context.addInitScript(() => localStorage.setItem('festival-tours-v3', JSON.stringify(['robot','city-mayor'])));
      const page = await context.newPage();
      async function fits(scope, selectors) {
        const problems = await scope.evaluate(selectors => {
          const issues = [];
          if(document.documentElement.scrollHeight > innerHeight+1 || document.documentElement.scrollWidth > innerWidth+1 || scrollY || scrollX) issues.push('document scroll');
          for(const selector of selectors) for(const el of document.querySelectorAll(selector)) {
            const r=el.getBoundingClientRect();
            if(!r.width || !r.height || r.left<0 || r.top<0 || r.right>innerWidth+1 || r.bottom>innerHeight+1) issues.push(selector+': '+JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height}));
            for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement) {
              const b=p.getBoundingClientRect(), css=getComputedStyle(p);
              if(['hidden','auto','scroll'].includes(css.overflowY) && (r.top<b.top-1 || r.bottom>b.bottom+1)) issues.push(selector+' clipped by '+p.className);
              if(p.scrollTop || p.scrollLeft) issues.push(selector+' panel scroll');
            }
          }
          return issues;
        },selectors);
        if(problems.length) failures.push(width+'×'+height+' '+scope.url()+': '+JSON.stringify([...new Set(problems)]));
      }
      await page.goto('http://127.0.0.1:'+server.address().port);
      if(await page.locator('.tour-card').count()) await page.locator('.tour-card').press('Escape');
      await fits(page,['#board .cell','#run','#stop','#predict','#safe','#unsafe','#train','#clear','#sensors','#model','.training details','#overallScore']);
      await page.mouse.wheel(0,700); await fits(page,['#boardStage','#model']);
      await page.screenshot({path:path.join(root,'test-artifacts',`robot-monitor-${width}x${height}.png`)});
      await page.locator('#epiTab').click();
      const city = page.frameLocator('#epiView');
      await city.locator('#mayor').waitFor();
      const frame=page.frames().find(f=>f.url().includes('epidemic.html'));
      if(await city.locator('.tour-card').count()) await city.locator('.tour-card').press('Escape');
      await fits(frame,['#map','#observeCity','.city-choice','#tryCity','#mayorStatus','#cityLocalScore']);
      await city.locator('#observeCity').click(); await city.locator('#tryCity').waitFor({state:'visible'});
      await city.locator('#tryCity').evaluate(el => new Promise(resolve => { const timer=setInterval(()=>{if(!el.disabled){clearInterval(timer);resolve();}},20); }));
      await fits(frame,['#map','.city-choice','#tryCity','#mayorStatus','#cityEffects','#cityNeeds']);
      await page.screenshot({path:path.join(root,'test-artifacts',`city-monitor-${width}x${height}.png`)});
      await fits(page,['#epiView','#overallScore']);
      await context.close(); console.log('Monitor fits:',width,height);
    }
    assert.deepEqual(failures,[]);
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
