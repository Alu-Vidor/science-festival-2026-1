const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const Robot=require('./robot-browser-helpers.cjs');
const City=require('./traffic-browser-helpers.cjs');
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
              if((['hidden','auto','scroll','clip'].includes(css.overflowY)||p.matches('.training,.city-decisions,.traffic-console,#robotControls')) && (r.top<b.top-1 || r.bottom>b.bottom+1)) issues.push(selector+' (#'+el.id+') clipped by '+p.className+' at '+Math.round(r.bottom)+' / '+Math.round(b.bottom)+'; expedition '+(window.robotExpedition?.current().stage??'city'));
              if(p.scrollTop || p.scrollLeft) issues.push(selector+' panel scroll');
            }
          }
          return issues;
        },selectors);
        if(problems.length) failures.push(width+'×'+height+' '+scope.url()+': '+JSON.stringify([...new Set(problems)]));
      }
      async function readableCity(scope){
        const problems=await scope.evaluate(()=>{
          const result=[],map=document.querySelector('#map').getBoundingClientRect();
          const within=rect=>rect.left>=map.left-1&&rect.right<=map.right+1&&rect.top>=map.top-1&&rect.bottom<=map.bottom+1;
          const junctions=[...document.querySelectorAll('#map .traffic-junction')];
          const expected=trafficCityGame.current().view.junctionIds;
          if(junctions.length!==expected.length||new Set(junctions.map(j=>j.dataset.junction)).size!==expected.length||junctions.some(j=>!expected.includes(j.dataset.junction)))result.push('Every intersection of the current map must be present');
          for(const junction of junctions)if(!within(junction.getBoundingClientRect()))result.push('Intersection outside map: '+junction.dataset.junction);
          const buildings=[...document.querySelectorAll('#map .traffic-building')].map(el=>el.getBoundingClientRect());
          if(buildings.length<6||Math.min(...buildings.map(b=>b.width))<44)result.push('City buildings must be large enough to recognise');
          const controls=[...document.querySelectorAll('#map .traffic-axis[role="button"]')];
          if(controls.length!==expected.length*2)result.push('Each intersection needs two visible direction controls');
          for(const control of controls){const box=control.getBoundingClientRect();if(box.width<43||box.height<43)result.push('Direction control is too small: '+control.dataset.junction+' '+control.dataset.axis);if(!within(box))result.push('Direction control outside map');}
          const labels=[...document.querySelectorAll('#map .traffic-place-label')],boxes=labels.map(el=>el.getBoundingClientRect());
          boxes.forEach((box,i)=>{
            if(!within(box))result.push('Label outside map: '+labels[i].textContent);
            for(let j=i+1;j<boxes.length;j++){const other=boxes[j];if(Math.min(box.right,other.right)-Math.max(box.left,other.left)>1&&Math.min(box.bottom,other.bottom)-Math.max(box.top,other.top)>1)result.push('Place labels overlap');}
          });
          return result;
        });assert.deepEqual(problems,[],'A large traffic map must show readable intersections, buildings and direction controls');
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
      await page.locator('#epiTab').click();
      const city = page.frameLocator('#epiView');
      await City.ready(city); await City.closeInfo(city);
      const frame=page.frames().find(f=>f.url().includes('city.html'));
      async function cityFits(){
        await readableCity(frame);
        const visible=['#signalCity','#map','#map .traffic-building','#map .traffic-axis','#cityStatus','#cityBestScore','#exampleCount','#cityProgress'];
        for(const id of ['cityLocalScore','teachMode','checkMode','cityTutorial','axisEW','axisNS','axisBOTH','duration4','duration8','duration12','demonstrate','saveExample','nextCase','testAI','startExam','pauseCity','resumeCity','restartCity','roundResult','examplesList'])if(await city.locator('#'+id).isVisible())visible.push('#'+id);
        await fits(frame,visible);
        const small=await frame.evaluate(()=>[...document.querySelectorAll('button')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&r.height<43;}).map(el=>el.id||el.textContent));
        assert.deepEqual(small,[],'Every visible city button must remain easy to click on a monitor');
        const cardClipping=await frame.evaluate(()=>{
          const issues=[],consoleBox=document.querySelector('.traffic-console').getBoundingClientRect(),outside=(r,b)=>r.left<b.left-1||r.right>b.right+1||r.top<b.top-1||r.bottom>b.bottom+1;
          for(const element of document.querySelectorAll('.traffic-console > *,.traffic-console p,.traffic-console h3,.traffic-console label,.traffic-console select,.traffic-console .queue-readout,.traffic-console .queue-row,.traffic-console .queue-row *,.traffic-console .axis-choices span')){
            const rect=element.getBoundingClientRect();if(!rect.width||!rect.height)continue;
            if(outside(rect,consoleBox))issues.push('Console content outside panel: '+(element.id||element.className));
            const row=element.closest('.queue-row');if(row&&row!==element&&outside(rect,row.getBoundingClientRect()))issues.push('Queue item outside card: '+element.textContent);
          }
          for(const row of document.querySelectorAll('.traffic-console .queue-row')){
            const box=row.getBoundingClientRect();if(!box.width||!box.height)continue;
            const walker=document.createTreeWalker(row,NodeFilter.SHOW_TEXT);
            for(let text=walker.nextNode();text;text=walker.nextNode())if(text.textContent.trim()){
              const range=document.createRange();range.selectNodeContents(text);
              for(const rect of range.getClientRects())if(outside(rect,box))issues.push('Queue text outside card: '+text.textContent);
            }
          }return issues;
        });
        assert.deepEqual(cardClipping,[],'Queue cards and every nested line fit inside their cards and the console');
      }
      for(const font of ['Arial, sans-serif','DejaVu Sans, sans-serif','Noto Sans, sans-serif']){await city.locator('body').evaluate((el,font)=>el.style.fontFamily=font,font);await cityFits();}
      await city.locator('body').evaluate(el=>el.style.fontFamily='');
      await city.locator('#cityTutorial').click(); await fits(frame,['#trafficInfo','#closeInfo']);
      await page.screenshot({path:path.join(root,'test-artifacts',`city-lesson-monitor-${width}x${height}.png`)});
      await City.closeInfo(city); await cityFits();
      await City.teach(city);
      await city.locator('#checkMode').click();
      const mapSizes=[];
      for(const scenarioId of await frame.evaluate(()=>TrafficEngine.scenarios.map(scenario=>scenario.id))){
        await city.locator('#practiceScenario').selectOption(scenarioId); await cityFits();
        mapSizes.push(await frame.evaluate(()=>trafficCityGame.current().view.junctionIds.length));
      }
      assert.deepEqual(mapSizes.sort((a,b)=>a-b),[2,3,4],'Each scored flow has its own complete map');
      await City.practice(city); const completedCity=await City.exam(city); await cityFits();
      assert.equal(completedCity.current.best,50,'A model learned from the bounded visible child demonstrations can reach full score');
      await page.screenshot({path:path.join(root,'test-artifacts',`city-monitor-${width}x${height}.png`)});
      await fits(page,['#epiView','#overallScore','#trainingMission','#deliveryMission','#cityMission','#missionProgress']);
      assert.equal(await page.locator('#overallScore').innerText(),'100','Both independent interactive missions can contribute their full score');
      await context.close(); console.log('Monitor fits:',width,height);
    }
    assert.deepEqual(failures,[]);
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
