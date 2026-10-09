/* Check the objects themselves in an ordinary browser, not only the SVG box. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const City = require('./traffic-browser-helpers.cjs');
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

async function pausePracticeAt(city, minimumTick, opposing = false, startButton = null) {
  await city.locator('body').evaluate((_,{minimumTick,opposing,startButton})=>new Promise((resolve,reject)=>{
    if(startButton)document.querySelector('#'+startButton).click();
    const deadline=performance.now()+30000;
    function check(){
      const pending=trafficCityGame.pending();
      if(!pending)return reject(Error('Practice ended before the requested traffic checkpoint'));
      const dirs=new Set(pending.state.agents.filter(agent=>agent.status==='moving').map(agent=>agent.from?.dir??agent.dir));
      if(pending.state.tick>=minimumTick&&(!opposing||dirs.has(-1)&&dirs.has(1))){document.querySelector('#pauseCity').click();return resolve();}
      if(performance.now()>deadline)return reject(Error('The real traffic checkpoint did not appear'));
      setTimeout(check,5);
    }check();
  }),{minimumTick,opposing,startButton});
}

async function cityScale(city, displayScale, { requireAgents = true, requireOpposing = false } = {}) {
  const measured = await city.locator('#map').evaluate(map => {
    const box = map.getBoundingClientRect();
    const buildings = [...map.querySelectorAll('.traffic-building')].map(image => image.getBoundingClientRect());
    const junctions = [...map.querySelectorAll('.traffic-junction')];
    const junctionBoxes = junctions.map(junction => junction.getBoundingClientRect());
    const controls = [...map.querySelectorAll('.traffic-axis[role="button"]')].map(control => control.getBoundingClientRect());
    const labels = [...map.querySelectorAll('.traffic-place-label')], labelBoxes = labels.map(label => label.getBoundingClientRect());
    const actorElements = [...map.querySelectorAll('.traffic-agent')].filter(agent => { const rect = agent.getBoundingClientRect(); return rect.width && rect.height; });
    const state = trafficCityGame.current().view;
    const physicalQueues={},drawnQueues={},physicalMoving={},drawnMoving={},tailErrors=[];
    const queueKey=leg=>[leg.junction,leg.axis,leg.dir].join('|');
    const addQueue=(queues,key,count,people,ids)=>{const entry=queues[key]||(queues[key]={count:0,people:0,ids:[]});entry.count+=count;entry.people+=people;entry.ids.push(...ids);};
    for(const agent of state.agents){
      if(agent.status==='queued')addQueue(physicalQueues,queueKey(agent.route[agent.leg]),1,agent.people,[agent.id]);
      if(agent.status==='moving')addQueue(physicalMoving,queueKey(agent.from),1,agent.people,[agent.id]);
    }
    for(const actor of actorElements)if(actor.dataset.status==='queued'){
      const agent=state.agents.find(agent=>agent.id===actor.dataset.agentId);
      if(agent)addQueue(drawnQueues,queueKey(agent.route[agent.leg]),1,Number(actor.dataset.people),[agent.id]);
    }
    for(const actor of actorElements)if(actor.dataset.status==='moving'){
      const agent=state.agents.find(agent=>agent.id===actor.dataset.agentId);
      if(agent)addQueue(drawnMoving,queueKey(agent.from),1,Number(actor.dataset.people),[agent.id]);
    }
    for(const tail of map.querySelectorAll('.traffic-queue-tail')){
      const rect=tail.getBoundingClientRect();if(!rect.width||!rect.height)continue;
      const key=[tail.dataset.junction,tail.dataset.axis,tail.dataset.dir].join('|');
      for(const[part,table,isMoving]of[[tail,drawnQueues,false],[tail.querySelector('.traffic-moving-tail'),drawnMoving,true]]){
        if(!part)continue;const count=Number(part.dataset.count),people=Number(part.dataset.people);
        let ids;try{ids=JSON.parse(part.dataset.agentIds);}catch{tailErrors.push('Missing exact tail IDs: '+key);continue;}
        if(!Array.isArray(ids)||ids.length!==count||new Set(ids).size!==ids.length){tailErrors.push('Incorrect tail IDs: '+key);continue;}
        if(!count){if(people!==0)tailErrors.push('A zero tail contains people: '+key);continue;}
        const ownText=isMoving?part.querySelector('text'):tail.querySelector(':scope>text');
        if(!ownText||!ownText.getBoundingClientRect().width||Number(ownText.textContent.match(/\d+/)?.[0])!==count)tailErrors.push('Incorrect visible tail count: '+key);
        if(isMoving&&!/В пути/.test(ownText?.textContent||''))tailErrors.push('Moving groups must have a separate visible label: '+key);
        addQueue(table,key,count,people,ids);
      }
    }
    for(const table of[physicalQueues,drawnQueues,physicalMoving,drawnMoving])for(const entry of Object.values(table))entry.ids.sort();
    const directionErrors = actorElements.flatMap(actor => {
      const agent = state.agents.find(agent => agent.id === actor.dataset.agentId);
      if (!agent) return ['Unknown actor: '+actor.dataset.agentId];
      const leg = agent.status === 'queued' ? agent.route?.[agent.leg] : agent.from;
      const expected = leg?.dir ?? agent.dir;
      const errors=Number(actor.dataset.dir) === expected ? [] : [agent.id+': '+actor.dataset.dir+' / '+expected];
      const matrix=actor.querySelector('.traffic-agent-body').transform.baseVal.consolidate().matrix;
      if(Math.abs(Math.hypot(matrix.a,matrix.b)-1)>.0001||Math.abs(Math.hypot(matrix.c,matrix.d)-1)>.0001)errors.push(agent.id+': vehicle bodies must keep their native size');
      if(agent.status==='queued'&&agent.kind!=='pedestrian'){
        const angle=Math.atan2(matrix.b,matrix.a)*180/Math.PI,expectedAngle=leg.axis==='EW'?(expected===1?0:180):expected*90;
        if(Math.abs((angle-expectedAngle+540)%360-180)>.1)errors.push(agent.id+': wrong vehicle facing '+angle+' / '+expectedAngle);
      }
      return errors;
    });
    const agents = actorElements.map(agent => agent.getBoundingClientRect());
    const bodies = actorElements.map(agent => agent.querySelector('.traffic-agent-body').getBoundingClientRect());
    const actorOverlaps = [];
    bodies.forEach((body, index) => { for (let other = index + 1; other < bodies.length; other++) {
      const next = bodies[other];
      if (Math.min(body.right, next.right) - Math.max(body.left, next.left) > .5 && Math.min(body.bottom, next.bottom) - Math.max(body.top, next.top) > .5) actorOverlaps.push(actorElements[index].dataset.agentId + ' / ' + actorElements[other].dataset.agentId);
    } });
    const fonts = labels.map(text => parseFloat(getComputedStyle(text).fontSize) * Math.abs(text.getScreenCTM().a));
    const outside = rect => rect.left < box.left - 1 || rect.right > box.right + 1 || rect.top < box.top - 1 || rect.bottom > box.bottom + 1;
    return { buildings: buildings.length, smallest: Math.min(...buildings.map(rect => rect.width)),
      expectedJunctions: [...trafficCityGame.current().view.junctionIds].sort(),
      junctions: junctions.map(junction => junction.dataset.junction).sort(),
      width: (Math.max(...junctionBoxes.map(rect => rect.right)) - Math.min(...junctionBoxes.map(rect => rect.left))) / box.width,
      mapHeight: box.height / innerHeight,
      font: Math.min(...fonts), agents: agents.length, actorIds: actorElements.map(agent => agent.dataset.agentId), actorOverlaps, directionErrors,
      movingDirections: [...new Set(actorElements.filter(actor=>actor.dataset.status==='moving').map(actor=>Number(actor.dataset.dir)))].sort(),
      physicalQueues,drawnQueues,physicalMoving,drawnMoving,tailErrors,
      signals: map.querySelectorAll('.traffic-signal').length,
      controls: controls.length, smallestControl: Math.min(...controls.flatMap(rect => [rect.width, rect.height])),
      clipped: [...junctionBoxes, ...controls, ...labelBoxes, ...bodies].filter(outside).length,
      occludedAgents: agents.filter(agent => labelBoxes.some(label => agent.left < label.right - .5 && agent.right > label.left + .5
        && agent.top < label.bottom - .5 && agent.bottom > label.top + .5)).length };
  });
  assert(measured.buildings >= 6, 'The traffic playground retains a recognisable city around its roads');
  assert(measured.smallest * displayScale >= 44, 'Buildings are large enough to recognise: ' + JSON.stringify(measured));
  assert.deepEqual(measured.junctions, measured.expectedJunctions, 'Every intersection of the current map fits in the main view');
  assert.equal(measured.controls, measured.expectedJunctions.length * 2, 'Each visible intersection offers both traffic directions');
  assert.equal(measured.signals, measured.expectedJunctions.length * 4, 'Both opposing lanes of both roads have their own visible signals');
  assert(measured.mapHeight >= .5, 'The traffic map fills a large part of the monitor height: ' + JSON.stringify(measured));
  assert(measured.font * displayScale >= 12 - .05, 'Compact city names remain readable in display pixels');
  if (requireAgents) assert(measured.agents > 0, 'The demonstration shows actual vehicles and people, rather than an empty diagram');
  assert(measured.smallestControl * displayScale >= 43, 'Both directions at each intersection remain easy to select');
  assert.equal(measured.clipped, 0, 'Intersections, direction controls and place names must remain inside the map');
  assert.equal(measured.occludedAgents, 0, 'Compact place labels must not cover the vehicles or pedestrians');
  assert.equal(new Set(measured.actorIds).size, measured.actorIds.length, 'Each visible participant is drawn only once');
  assert.deepEqual(measured.actorOverlaps, [], 'Visible vehicle and pedestrian bodies must not obscure one another');
  assert.deepEqual(measured.directionErrors, [], 'Each actor faces its actual physical direction, rather than a decorative lane');
  assert.deepEqual(measured.tailErrors,[],'Queued and moving aggregates show their own exact counts and participant IDs');
  assert.deepEqual(measured.drawnQueues,measured.physicalQueues,'Visible queue heads and truthful queued tail counts conserve every queued participant, person and ID');
  assert.deepEqual(measured.drawnMoving,measured.physicalMoving,'Visible moving participants and separate moving counters conserve every moving participant, person and ID');
  if(requireOpposing) assert.deepEqual(measured.movingDirections,[-1,1],'Actual participants move in both opposing directions at the same time');
  const clipping = await city.locator('body').evaluate(() => {
    const issues = [];
    if (document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1) issues.push('Document scroll');
    for (const button of document.querySelectorAll('button')) {
      const rect = button.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (rect.left < 0 || rect.top < 0 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1) issues.push('Button outside '+innerWidth+'×'+innerHeight+' viewport: ' + button.id + ' '+JSON.stringify({x:rect.x,y:rect.y,width:rect.width,height:rect.height}));
      if (rect.height < 43) issues.push('Button too small: ' + button.id);
      const panel = button.closest('.traffic-console');
      if (panel) {
        const bounds = panel.getBoundingClientRect();
        if (rect.left < bounds.left + 5 || rect.right > bounds.right - 5 || rect.bottom > bounds.bottom - 5) issues.push('Button outside its control panel: '+button.id);
      }
    }
    const consoleBox=document.querySelector('.traffic-console').getBoundingClientRect();
    const outside=(rect,bounds)=>rect.left<bounds.left-1||rect.right>bounds.right+1||rect.top<bounds.top-1||rect.bottom>bounds.bottom+1;
    for(const element of document.querySelectorAll('.traffic-console > *,.traffic-console p,.traffic-console h3,.traffic-console label,.traffic-console select,.traffic-console .queue-readout,.traffic-console .queue-row,.traffic-console .queue-row *,.traffic-console .axis-choices span')){
      const rect=element.getBoundingClientRect();if(!rect.width||!rect.height)continue;
      if(outside(rect,consoleBox))issues.push('Console content outside its panel: '+(element.id||element.className));
      const row=element.closest('.queue-row');
      if(row&&row!==element&&outside(rect,row.getBoundingClientRect()))issues.push('Queue item outside its card: '+element.textContent);
    }
    for(const row of document.querySelectorAll('.traffic-console .queue-row')){
      const box=row.getBoundingClientRect();if(!box.width||!box.height)continue;
      const walker=document.createTreeWalker(row,NodeFilter.SHOW_TEXT);
      for(let text=walker.nextNode();text;text=walker.nextNode())if(text.textContent.trim()){
        const range=document.createRange();range.selectNodeContents(text);
        for(const rect of range.getClientRects())if(outside(rect,box))issues.push('Queue text outside its card: '+text.textContent);
      }
    }
    return issues;
  });
  assert.deepEqual(clipping, [], 'Teaching and competition controls fit beside the large map');
}

(async () => {
  fs.mkdirSync(path.join(root, 'test-artifacts'), { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  try {
    // Browser chrome and a taskbar reduce the content area even on a 27-inch screen.
    // 2560×1306 at 75% represents a 1920-pixel display with a 980-pixel content area.
    for (const [width, height, displayScale] of [[1920, 900, 1], [1920, 980, 1], [1920, 1080, 1], [2560, 1340, 1], [2560, 1306, .75]]) {
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
        await City.ready(city); await City.closeInfo(city);
        await city.locator('body').evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await cityScale(city, displayScale);
        await page.screenshot({ path: path.join(root, 'test-artifacts', `large-city-${width}x${height}.png`) });
        const teachingCases = await city.locator('body').evaluate(() => TrafficEngine.trainingCases.length);
        for (let teachingCase = 1; teachingCase < teachingCases; teachingCase++) {
          await city.locator('#nextCase').click();
          await cityScale(city, displayScale);
        }
        // The child's explicit example unlocks autonomous maps; watching never does.
        const lastAction = City.referenceActions().at(-1);
        await City.demonstrate(city, lastAction); await City.train(city, lastAction);
        await city.locator('#checkMode').click();
        const scenarios = await city.locator('body').evaluate(() => TrafficEngine.scenarios.map(scenario => scenario.id));
        const mapSizes = [];
        for (const scenarioId of scenarios) {
          await city.locator('#practiceScenario').selectOption(scenarioId);
          await city.locator('body').evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
          await cityScale(city, displayScale, { requireAgents: false });
          const size = await city.locator('body').evaluate(() => trafficCityGame.current().view.junctionIds.length);
          mapSizes.push(size);
          await page.screenshot({ path: path.join(root, 'test-artifacts', `large-city-${size}-junctions-${width}x${height}.png`) });
          await pausePracticeAt(city,12,true,'testAI');
          await page.screenshot({path:path.join(root,'test-artifacts',`opposing-city-${size}-junctions-${width}x${height}.png`)});
          try {
            for(const junction of await city.locator('body').evaluate(()=>trafficCityGame.current().view.junctionIds)){
              await city.locator('.traffic-axis[data-junction="'+junction+'"][data-axis="EW"]').click();
              await cityScale(city,displayScale,{requireOpposing:true});
            }
          }
          catch(error) { await page.screenshot({path:path.join(root,'test-artifacts',`opposing-city-${size}-junctions-${width}x${height}.png`)});fs.writeFileSync(path.join(root,'test-artifacts',`opposing-city-${size}-junctions-${width}x${height}.json`),JSON.stringify(await city.locator('body').evaluate(()=>trafficCityGame.current().view),null,2)); throw error; }
          await city.locator('#stopCity').click();
        }
        assert.deepEqual(mapSizes.sort((a, b) => a - b), [2, 3, 4], 'Practice offers distinct maps with two, three and four intersections');
        if(width===1920&&height===900||displayScale===.75){
          await city.locator('#restartCity').click();
          await City.teach(city,Array.from({length:teachingCases},()=>({axis:'EW',duration:12})));
          const poorReport=await city.locator('body').evaluate(()=>TrafficEngine.report(TrafficEngine.run('blocked',observation=>TrafficLearning.predict(trafficCityGame.model(),observation))));
          assert(poorReport.onTime<poorReport.totalPeople&&poorReport.score<=40,'The visible incorrect training set produces a genuinely weaker learned policy');
          await city.locator('#checkMode').click();await city.locator('#practiceScenario').selectOption('blocked');
          const before=await City.snapshot(city);
          for(const tick of[12,30,60]){
            await pausePracticeAt(city,tick,false,tick===12?'testAI':'resumeCity');
            await page.screenshot({path:path.join(root,'test-artifacts',`poor-policy-city-${width}x${height}-tick${tick}.png`)});
            try{
              for(const junction of await city.locator('body').evaluate(()=>trafficCityGame.current().view.junctionIds)){
                await city.locator('.traffic-axis[data-junction="'+junction+'"][data-axis="EW"]').click();await cityScale(city,displayScale);
              }
            }catch(error){await page.screenshot({path:path.join(root,'test-artifacts',`poor-policy-city-${width}x${height}-tick${tick}.png`)});fs.writeFileSync(path.join(root,'test-artifacts',`poor-policy-city-${width}x${height}-tick${tick}.json`),JSON.stringify(await city.locator('body').evaluate(()=>trafficCityGame.current().view),null,2));throw error;}
            const waiting=await city.locator('body').evaluate(()=>trafficCityGame.current().view.agents.filter(agent=>agent.status==='queued').reduce((n,agent)=>n+agent.people,0));
            assert(waiting>=20,'Incorrect uniform labels leave substantial real queues on the roads');
          }
          await city.locator('#stopCity').click();const after=await City.snapshot(city);
          assert.equal(after.current.best,before.current.best,'Inspecting a poor policy awards no score');assert.deepEqual(after.current.attempts,before.current.attempts,'A poor-policy practice never consumes a scored attempt');
        }
        assert.deepEqual(errors, []);
        console.log('Maps fill ordinary browser:', width, height, 'display scale', displayScale);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
