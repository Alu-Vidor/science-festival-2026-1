const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const {lesson,teachMap,teachTraining,adaptRain,deliver,optimalDelivery}=require('./robot-browser-helpers.cjs');
const City=require('./city-browser-helpers.cjs');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + (req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (e, data) => { if(e) return res.writeHead(404).end(); res.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream'); res.end(data); });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  const failures=[];
  try {
    for (const [width,height] of [[1024,768],[1280,640],[1280,720],[1366,680],[1366,768],[1440,900],[1920,1080],[2560,1440]]) {
      const context = await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
      await context.addInitScript(() => localStorage.setItem('festival-tours-v6', JSON.stringify(['robot','city-mayor'])));
      const page = await context.newPage();
      page.on('pageerror',e=>console.error('Page error:',e.message));
      async function fits(scope, selectors) {
        const problems = await scope.evaluate(selectors => {
          const issues = [];
          if(document.documentElement.scrollHeight > innerHeight+1 || document.documentElement.scrollWidth > innerWidth+1 || scrollY || scrollX) issues.push('document scroll '+JSON.stringify({height:document.documentElement.scrollHeight,viewport:innerHeight,y:scrollY,width:document.documentElement.scrollWidth,x:scrollX}));
          for(const selector of selectors) for(const el of document.querySelectorAll(selector)) {
            const r=el.getBoundingClientRect();
            if(!r.width || !r.height || r.left<0 || r.top<0 || r.right>innerWidth+1 || r.bottom>innerHeight+1) issues.push(selector+': '+JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height}));
            for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement) {
              const b=p.getBoundingClientRect(), css=getComputedStyle(p);
              if(['hidden','auto','scroll','clip'].includes(css.overflowY) && (r.top<b.top-1 || r.bottom>b.bottom+1)) issues.push(selector+' clipped by '+p.className);
              if(p.scrollTop || p.scrollLeft) issues.push(selector+' panel scroll');
            }
          }
          return issues;
        },selectors);
        if(problems.length) failures.push(width+'×'+height+' '+scope.url()+': '+JSON.stringify([...new Set(problems)]));
      }
      await page.goto('http://127.0.0.1:'+server.address().port);
      if(await page.locator('.tour-card').count()) await page.locator('.tour-card').press('Escape');
      await fits(page,['#board .cell','#run','#predict','#safe','#unsafe','#train','#probe','#sensors','#model','.training > details','#status','#deliveryTries','#moveStart','#newParticipant','#overallScore','#trainingMission','#deliveryMission','#cityMission','#missionProgress','#missionTask','#terrainLegend']);
      await page.mouse.wheel(0,700); await fits(page,['#boardStage','#model']);
      await page.screenshot({path:path.join(root,'test-artifacts',`robot-monitor-${width}x${height}.png`)});
      async function lit(scope, selectors) {
        const problems=await scope.evaluate(selectors=>{
          const card=document.querySelector('.tour-card').getBoundingClientRect();
          const dark=[...document.querySelectorAll('.tour-shade')].map(e=>e.getBoundingClientRect());
          const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
          return selectors.filter(s=>{const r=document.querySelector(s).getBoundingClientRect();return overlaps(r,card)||dark.some(d=>overlaps(r,d));});
        },selectors);
        assert.deepEqual(problems,[],'Lesson must leave the described objects visible');
      }
      await page.locator('#robotTutorial').click();
      await fits(page,['.tour-card','#tourTitle','#tourText','#boardStage']);
      assert.equal(await page.locator('.tour-shade').count(),0);
      await page.screenshot({path:path.join(root,'test-artifacts',`robot-glow-${width}x${height}.png`)});
      await lesson(page,async()=>fits(page,['.tour-card','#tourTitle','#tourText']));
      await teachTraining(page);
      await fits(page,['#model','#train','#status','#nextMission','#expeditionNav']);
      for(let stage=1;stage<=3;stage++){
        await page.locator('#nextMission').click();
        if(stage===3)await adaptRain(page);
        await optimalDelivery(page);
        await fits(page,['#boardStage','#model','#status','#deliveryTries','#autoRoute','#moveStart','#predict','#newParticipant']);
        if(stage<3)await fits(page,['#nextMission']);
        await page.screenshot({path:path.join(root,'test-artifacts',`robot-mission-${stage}-${width}x${height}.png`)});
      }
      await page.locator('#learningNotebook > summary').click();await page.locator('.monitor-dialog[open]').waitFor();
      await fits(page,['.monitor-dialog','#coverage']);
      await page.locator('.monitor-dialog > button').click();
      await page.locator('#epiTab').click();
      const city = page.frameLocator('#epiView');
      await city.locator('#mayor').waitFor();
      const frame=page.frames().find(f=>f.url().includes('epidemic.html'));
      if(await city.locator('.tour-card').count()) await city.locator('.tour-card').press('Escape');
      await fits(frame,['#map','#map .building-sprite','#observeCity','#beginCity','#mayorStatus','#cityLocalScore','#cityRounds','#projectSummary']);
      assert.equal(await city.locator('#map').getAttribute('viewBox'),'0 0 1750 1080','Every building stays in the full city view');
      await city.locator('#cityTutorial').click(); await fits(frame,['.tour-card','#tourTitle','#tourText','#observeCity']);
      await city.locator('#observeCity').click();
      await city.locator('.tour-watching').waitFor(); await lit(frame,['#map','#citizenStory']);
      await page.screenshot({path:path.join(root,'test-artifacts',`city-lesson-monitor-${width}x${height}.png`)});
      await city.locator('#tryCity').waitFor({state:'visible'});
      await city.locator('#tryCity').evaluate(el => new Promise(resolve => { const timer=setInterval(()=>{if(!el.disabled){clearInterval(timer);resolve();}},20); }));
      await city.locator('#tourTitle').filter({hasText:'Помоги добраться'}).waitFor(); await fits(frame,['.tour-card','#tourText']);
      await city.locator('#pick-bus-frequent').click(); await city.locator('#tourTitle').filter({hasText:'Проверь своё'}).waitFor();
      await fits(frame,['.tour-card','#tourText']); await city.locator('#tryCity').click();
      await City.finishLesson(city,async()=>fits(frame,['.tour-card','#tourTitle','#tourText']));
      await City.maximum(city,async n=>{
        await fits(frame,['#map',...(n<12?['.city-choice']:[]),'#tryCity','#pauseCity','#cityGoalGrid','#cityNeeds','#mayorStatus','#roundOutcome']);
        if(width===1280&&height===640&&n===2)await page.screenshot({path:path.join(root,'test-artifacts','city-day-2-compact.png')});
        if(n%4===0)await page.screenshot({path:path.join(root,'test-artifacts',`city-round-${n/4}-${width}x${height}.png`)});
      });
      await fits(frame,['#map','#restartCity','#cityEffects','#cityNeeds','#mayorStatus']);
      await page.screenshot({path:path.join(root,'test-artifacts',`city-monitor-${width}x${height}.png`)});
      await fits(page,['#epiView','#overallScore','#trainingMission','#deliveryMission','#cityMission','#missionProgress']);
      await city.locator('.inhabitant[data-person="0"]').press('Enter'); await city.locator('.monitor-dialog[open]').waitFor();
      await fits(frame,['.monitor-dialog','#citizenChoice','#citizenPanel']);
      if(width===1280&&height===640)await page.screenshot({path:path.join(root,'test-artifacts','city-citizen-compact.png')});
      await city.locator('.monitor-dialog > button').click(); await fits(frame,['#map','#cityEffects']);
      if(width===1366 && height===680) {
        await page.setViewportSize({width:768,height:900}); await page.locator('#robotTab').click();
        await page.waitForFunction(()=>!document.body.classList.contains('monitor-layout'));
        assert.equal(await page.locator('#robotEditor').count(),0);
        assert.equal(await page.locator('#robotIntro #robotTutorial').count(),1);
        await page.locator('#robotZoom').click();
        await page.setViewportSize({width,height}); await page.waitForFunction(()=>document.body.classList.contains('monitor-layout')); await fits(page,['#board .cell','#boardStage','#run','#model','#status']);
        assert.equal(await page.locator('#robotZoom').getAttribute('aria-pressed'),'false');
        await page.locator('#epiTab').click(); await fits(frame,['#map','#cityEffects','#cityNeeds']);
      }
      await context.close(); console.log('Monitor fits:',width,height);
    }
    assert.deepEqual(failures,[]);
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
