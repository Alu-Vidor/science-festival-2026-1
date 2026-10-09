const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const Robot=require('./robot-browser-helpers.cjs');
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
    for (const [width,height] of [[1920,1080],[2560,1440]]) {
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
              if((['hidden','auto','scroll','clip'].includes(css.overflowY)||p.matches('.training,.city-decisions,#robotControls')) && (r.top<b.top-1 || r.bottom>b.bottom+1)) issues.push(selector+' (#'+el.id+') clipped by '+p.className+' at '+Math.round(r.bottom)+' / '+Math.round(b.bottom)+'; expedition '+(window.robotExpedition?.current().stage??'city'));
              if(p.scrollTop || p.scrollLeft) issues.push(selector+' panel scroll');
            }
          }
          return issues;
        },selectors);
        if(problems.length) failures.push(width+'×'+height+' '+scope.url()+': '+JSON.stringify([...new Set(problems)]));
      }
      async function readableCity(scope){
        const problems=await scope.evaluate(()=>{
          const result=[],map=document.querySelector('#map').getBoundingClientRect(),groups=[...document.querySelectorAll('#cityBadges>g')],boxes=groups.map(g=>g.querySelector('rect').getBoundingClientRect());
          const buildings=[...document.querySelectorAll('#map .building-sprite')].map(el=>el.getBoundingClientRect());
          if(buildings.length!==15)result.push('The full city must contain all 15 buildings');
          if(Math.min(...buildings.map(b=>b.width))<(innerWidth>=2200?110:75))result.push('City buildings are too small to explore');
          const sceneWidth=Math.max(...buildings.map(b=>b.right))-Math.min(...buildings.map(b=>b.left)),sceneHeight=Math.max(...buildings.map(b=>b.bottom))-Math.min(...buildings.map(b=>b.top));
          if(sceneWidth<map.width*.52||sceneHeight<map.height*.7)result.push('Painted city occupies too little of its map');
          groups.forEach((g,i)=>{
            const box=boxes[i];if(box.left<map.left||box.right>map.right||box.top<map.top||box.bottom>map.bottom)result.push('Label outside map: '+g.getAttribute('aria-label'));
            [...g.querySelectorAll('text')].forEach((t,j)=>{const font=parseFloat(getComputedStyle(t).fontSize)*Math.abs(t.getScreenCTM().a),minimum=innerWidth>=2200?(j?18:20):(j?14:16),r=t.getBoundingClientRect();if(font<minimum-.05)result.push('Unreadable label: '+t.textContent+' '+font);if(r.left<box.left||r.right>box.right||r.top<box.top||r.bottom>box.bottom)result.push('Clipped label: '+t.textContent);});
            for(let j=i+1;j<boxes.length;j++){const b=boxes[j];if(Math.min(box.right,b.right)-Math.max(box.left,b.left)>1&&Math.min(box.bottom,b.bottom)-Math.max(box.top,b.top)>1)result.push('Labels overlap: '+g.getAttribute('aria-label')+' / '+groups[j].getAttribute('aria-label'));}
          });return result;
        });assert.deepEqual(problems,[],'City labels must be readable at their actual screen size');
      }
      await page.goto('http://127.0.0.1:'+server.address().port);
      if(await page.locator('.tour-card').count()) await page.locator('.tour-card').press('Escape');
      const selectors=['#status','#qualitySummary','#routeMap','#terrainLegend','#routeText','#scoreRules','#newParticipant','#missionGoal','#remaining','#wheelPicture','#wheelState','#surfaceEffect','#stars','#roundLabel'];
      async function robotFits(){
        const conditional=[];
        for(const id of ['run','train','nextRound','undo','stop','forecastEnergy','forecastOutcome','forecastConfidence','tripOutcome','lastPrediction','lastActual','learningEffect','campaignResult','cargoSlots','cargoSummary','deliveryProgress','modelInfo'])if(await page.locator('#'+id).isVisible())conditional.push('#'+id);
        await fits(page,[...selectors,...conditional]);
        const clipped=await page.locator('.robot-console').evaluate(panel=>[...panel.children].filter(e=>!e.hidden).filter(e=>e.getBoundingClientRect().bottom>panel.getBoundingClientRect().bottom-5).map(e=>e.id||e.className));
        assert.deepEqual(clipped,[],'Every robot panel action must fit inside its panel');
        const labels=await page.locator('#routeMap').evaluate(map=>{const bounds=map.getBoundingClientRect(),names=[...map.querySelectorAll('.node-name')],boxes=names.map(e=>e.getBoundingClientRect()),issues=[];boxes.forEach((a,i)=>{if(a.left<bounds.left||a.right>bounds.right||a.top<bounds.top||a.bottom>bounds.bottom)issues.push('Outside map: '+names[i].textContent);for(let j=i+1;j<boxes.length;j++){const b=boxes[j];if(Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top))issues.push('Overlapping names: '+names[i].textContent+' / '+names[j].textContent);}});return issues;});assert.deepEqual(labels,[],'All recipient names must remain readable');
        const cards=await page.locator('.order-card:visible').evaluateAll(es=>es.flatMap(e=>{const b=e.getBoundingClientRect();return [...e.children].filter(x=>{const r=x.getBoundingClientRect();return r.left<b.left||r.right>b.right||r.bottom>b.bottom;}).map(x=>x.textContent);}));assert.deepEqual(cards,[],'Order names, cargo sizes and rewards must fit');
      }
      for(const font of ['Arial, sans-serif','DejaVu Sans, sans-serif','Noto Sans, sans-serif']){await page.locator('body').evaluate((el,font)=>el.style.fontFamily=font,font);await robotFits();}await page.locator('body').evaluate(el=>el.style.fontFamily='');
      await robotFits();
      await page.screenshot({path:path.join(root,'test-artifacts',`robot-routes-${width}.png`)});
      await Robot.complete(page,async phase=>{await robotFits();if(phase==='audit')await fits(page,['#robotDialog','#dialogBody']);else await page.screenshot({path:path.join(root,'test-artifacts',`robot-${phase}-${width}.png`)});});
      for(const font of ['Arial, sans-serif','DejaVu Sans, sans-serif','Noto Sans, sans-serif']){await page.locator('body').evaluate((el,font)=>el.style.fontFamily=font,font);await robotFits();}
      await page.locator('body').evaluate(el=>el.style.fontFamily='');
      await page.locator('#robotTutorial').click();await fits(page,['#robotDialog','#dialogBody']);await page.locator('#dialogClose').click();
      const tiny=await page.locator('.road-label text').evaluateAll(els=>els.filter(e=>parseFloat(getComputedStyle(e).fontSize)*e.getScreenCTM().a<14).map(e=>e.textContent));assert.deepEqual(tiny,[],'Road labels must be readable on the actual monitor');
      async function lit(scope, selectors) {
        const problems=await scope.evaluate(selectors=>{
          const card=document.querySelector('.tour-card').getBoundingClientRect();
          const dark=[...document.querySelectorAll('.tour-shade')].map(e=>e.getBoundingClientRect());
          const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
          return selectors.filter(s=>{const r=document.querySelector(s).getBoundingClientRect();return overlaps(r,card)||dark.some(d=>overlaps(r,d));});
        },selectors);
        assert.deepEqual(problems,[],'Lesson must leave the described objects visible');
      }
      await page.locator('#epiTab').click();
      const city = page.frameLocator('#epiView');
      await city.locator('#mayor').waitFor();
      const frame=page.frames().find(f=>f.url().includes('epidemic.html'));
      if(await city.locator('.tour-card').count()) await city.locator('.tour-card').press('Escape');
      await readableCity(frame);
      await fits(frame,['#map','#map .building-sprite','#observeCity','#beginCity','#mayorStatus','#cityLocalScore','#cityRounds','#projectSummary']);
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
        await readableCity(frame);
        await fits(frame,['#map',...(n<12?['.city-choice']:[]),'#tryCity','#pauseCity','#cityGoalGrid','#cityNeeds','#mayorStatus','#roundOutcome','#planExpense','#flowButtons',...(n<12?['#trialCity','#trialSummary','#cityHypothesis','#allocationSummary']:[]),...(n>=4?['#cityExperiment']:[])]);
        if(n%4===0)await page.screenshot({path:path.join(root,'test-artifacts',`city-round-${n/4}-${width}x${height}.png`)});
      });
      await fits(frame,['#map','#restartCity','#cityEffects','#cityNeeds','#mayorStatus']);
      await page.screenshot({path:path.join(root,'test-artifacts',`city-monitor-${width}x${height}.png`)});
      await fits(page,['#epiView','#overallScore','#trainingMission','#deliveryMission','#cityMission','#missionProgress']);
      await city.locator('.inhabitant[data-person="0"]').press('Enter'); await city.locator('.monitor-dialog[open]').waitFor();
      await fits(frame,['.monitor-dialog','#citizenChoice','#citizenPanel']);
      await city.locator('.monitor-dialog > button').click(); await fits(frame,['#map','#cityEffects']);
      await context.close(); console.log('Monitor fits:',width,height);
    }
    assert.deepEqual(failures,[]);
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
