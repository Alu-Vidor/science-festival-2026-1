/* Repeated clicks, native dialogs and reloads must preserve attempts and shown history. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const City = require('./traffic-browser-helpers.cjs');

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

async function cityGeometry(city) {
  const metrics=await city.locator('#map').evaluate(map=>{
    const bounds=map.getBoundingClientRect(),junctions=[...map.querySelectorAll('.traffic-junction')];
    return {junctions:junctions.length,expected:trafficCityGame.current().view.junctionIds.length,signals:map.querySelectorAll('.traffic-signal').length,
      outside:junctions.some(e=>{const r=e.getBoundingClientRect();return r.left<bounds.left-1||r.right>bounds.right+1||r.top<bounds.top-1||r.bottom>bounds.bottom+1;}),
      small:[...map.querySelectorAll('.traffic-axis')].some(e=>{const r=e.getBoundingClientRect();return r.width<43||r.height<43;})};
  });
  assert.equal(metrics.junctions,metrics.expected);assert(metrics.signals>=metrics.expected*2);assert.equal(metrics.outside,false);assert.equal(metrics.small,false,'Map directions are actual large keyboard accessible controls');
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
  await City.ready(city);await City.closeInfo(city);
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

async function cityAudit(page,width) {
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#epiTab').click();
  const city=page.frameLocator('#epiView');await City.ready(city);await City.closeInfo(city);await cityGeometry(city);
  await city.locator('.traffic-axis[data-junction="A"][data-axis="NS"]').press('Enter');assert.equal((await City.snapshot(city)).current.selectedAxis,'NS');
  await city.locator('.traffic-axis[data-junction="A"][data-axis="EW"]').press('Space');assert.equal((await City.snapshot(city)).current.selectedAxis,'EW');
  await city.locator('.traffic-axis[data-junction="B"][data-axis="NS"]').press('Enter');assert.equal((await City.snapshot(city)).current.selectedJunction,'A','Teaching a snapshot cannot silently switch to an empty, unrelated intersection');
  await city.locator('#cityTutorial').click();assert(await city.locator('#trafficInfo').isVisible());await city.locator('#trafficInfo').press('Escape');
  const wrong={axis:City.referenceActions()[0].axis==='EW'?'NS':'EW',duration:12};
  await City.select(city,wrong);await page.emulateMedia({reducedMotion:'no-preference'});
  await city.locator('#demonstrate').dblclick();
  assert.equal((await City.snapshot(city)).pending.kind,'demo');assert.equal((await City.snapshot(city)).examples.length,0);
  await city.locator('#pauseCity').dblclick();assert.equal((await City.snapshot(city)).playing,false);
  const paused=await City.snapshot(city);await page.locator('#epiTab').click();assert.equal((await City.snapshot(city)).playing,false,'Repeated active-tab click must not resume a paused phase');
  await page.reload();await City.ready(city);await City.closeInfo(city);assert.deepEqual((await City.snapshot(city)).pending,paused.pending);
  await page.emulateMedia({reducedMotion:'reduce'});await city.locator('#resumeCity').dblclick();await City.waitIdle(city);
  await city.locator('#saveExample').dblclick();
  const taught=await City.snapshot(city);assert.equal(taught.examples.length,1,'Double click teaches one demonstrated example');assert.deepEqual(taught.examples[0].action,wrong,'A bad decision is never replaced by the right label');
  assert.deepEqual(await city.locator('body').evaluate(()=>TrafficLearning.predict(trafficCityGame.model(),trafficCityGame.examples()[0].observation).axis),wrong.axis,'The learned decision actually follows the child label');
  await page.reload();await City.ready(city);await City.closeInfo(city);assert.deepEqual((await City.snapshot(city)).model,taught.model);
  await city.locator('#openExamples').click();
  const corrected=City.referenceActions()[0];await city.locator('#editExample-'+taught.examples[0].id).click();
  await city.locator('#editAxis'+corrected.axis).click();await city.locator('#editDuration'+corrected.duration).click();await city.locator('#exampleEditSave').click();
  const edited=await City.snapshot(city);assert.equal(edited.examples.length,1);assert.deepEqual(edited.examples[0].action,corrected);
  assert.notDeepEqual(edited.model,taught.model,'Explicitly editing a label updates the real trained model');
  assert.equal(await city.locator('body').evaluate(()=>TrafficLearning.predict(trafficCityGame.model(),trafficCityGame.examples()[0].observation).axis),corrected.axis);
  // Examples remain inspectable in a notebook dialog after editing.
  if(await city.locator('#trafficInfo[open]').count()===0)await city.locator('#openExamples').click();
  await city.locator('#removeExample-'+taught.examples[0].id).click();assert.equal((await City.snapshot(city)).examples.length,0);assert.notDeepEqual((await City.snapshot(city)).model,taught.model,'Deleting a training example updates the real policy');
  await City.closeInfo(city);
  // An EW phase opens both real opposing lanes, while the perpendicular stream stays red.
  await City.goToCase(city,'urgent-west');
  const opposingBefore=(await City.snapshot(city)).current.view;
  const opposingIds=opposingBefore.agents.filter(a=>a.route[0].junction==='A'&&a.route[0].axis==='EW').map(a=>a.id);
  assert.deepEqual([...new Set(opposingBefore.agents.filter(a=>opposingIds.includes(a.id)).map(a=>a.route[0].dir))].sort(),[-1,1],'The teaching scene contains actual agents arriving from opposite sides');
  const westbound=opposingBefore.agents.find(a=>opposingIds.includes(a.id)&&a.route[0].dir===-1);
  await city.locator('.traffic-agent[data-agent-id="'+westbound.id+'"]').press('Enter');
  assert((await city.locator('#trafficInfo').innerText()).includes('A ←'),'Inspection describes the actual westbound route, not a cosmetic reversed car');
  await City.closeInfo(city);
  await City.demonstrate(city,{axis:'EW',duration:4});
  const opposingAfter=(await City.snapshot(city)).current.view,passed=opposingAfter.agents.filter(a=>opposingIds.includes(a.id));
  assert(passed.every(a=>a.departedAt!==null&&a.arrivedAt!==null),'Both directions physically pass the intersection on the same axis green');
  assert.equal(new Set(passed.map(a=>a.departedAt)).size,1,'Opposing lanes can move in the same simulation second');
  assert(opposingAfter.agents.filter(a=>a.route[0].axis==='NS').every(a=>a.departedAt===null),'Perpendicular traffic remains stopped');
  // Green cannot push cars into a full next block: the visible jam follows the physical storage limit.
  await City.goToCase(city,'blocked-west');
  await City.demonstrate(city,{axis:'EW',duration:8});
  const jam=await City.snapshot(city);assert.equal(jam.current.draft.crossed,0,'A full downstream block prevents passage even on green');
  assert.equal(await city.locator('.traffic-junction[data-junction="A"] .traffic-storage-blocked').getAttribute('opacity'),'1','The physical bottleneck is visible on the map');
  assert(jam.current.view.agents.some(a=>a.status==='queued'&&a.waited>=8),'Following traffic really waits in the queue');
  await City.goToCase(city,'bus-north');
  await City.select(city,{axis:'BOTH',duration:4});await page.emulateMedia({reducedMotion:'no-preference'});await city.locator('#demonstrate').click();
  await city.locator('body').evaluate(()=>new Promise((resolve,reject)=>{const deadline=performance.now()+8000;function check(){if(trafficCityGame.current().view.crashCount>0)return resolve();if(performance.now()>deadline)return reject(Error('Unsafe simultaneous green did not create an accident'));setTimeout(check,20);}check();}));
  assert.equal(await city.locator('.traffic-crash[data-junction="A"]').getAttribute('opacity'),'1','An actual collision is shown directly at the intersection');
  await city.locator('#pauseCity').click();
  const accidentFrames=await city.locator('.traffic-agent,.traffic-crash-smoke').evaluateAll(els=>els.map(el=>el.getAttribute('transform')));
  await page.waitForTimeout(220);
  assert.deepEqual(await city.locator('.traffic-agent,.traffic-crash-smoke').evaluateAll(els=>els.map(el=>el.getAttribute('transform'))),accidentFrames,'Pause freezes both traffic interpolation and collision effects');
  await page.emulateMedia({reducedMotion:'reduce'});await city.locator('#resumeCity').click();await City.waitIdle(city);
  await city.locator('#restartCity').click();await City.teach(city);
  await city.locator('#checkMode').click();await page.emulateMedia({reducedMotion:'no-preference'});await city.locator('#startExam').dblclick();
  const started=await City.snapshot(city);assert.equal(started.current.attempts.length,1);assert.deepEqual(started.pending.frozenModel,started.model);
  assert(await city.locator('#saveExample').isDisabled());assert(await city.locator('#restartCity').isDisabled());
  await city.locator('#pauseCity').press('Space');const frozen=await City.snapshot(city);
  await city.locator('.traffic-axis[data-junction="B"][data-axis="EW"]').press('Enter');
  const inspected=await City.snapshot(city);assert.equal(inspected.current.selectedJunction,'B');assert.deepEqual(inspected.pending,frozen.pending,'Inspecting another junction cannot alter the frozen simulation or learned policy');
  const queueCounts=await city.locator('body').evaluate(()=>{
    const expected=TrafficEngine.observe(trafficCityGame.current().view,'B');
    return ['EW','NS'].map(axis=>{
      const row=document.querySelector('#aiQueueReadout .queue-'+(axis==='EW'?'horizontal':'vertical')),text=row.querySelector('strong').textContent;
      const directions=row.querySelector('.queue-directions')?.textContent.match(/\d+/g)?.map(Number)||[];
      return {actual:Number(text.match(/\d+/)?.[0]||0),expected:expected[axis].people,directions,expectedDirections:expected[axis].vehicles?[-1,1].map(dir=>expected.byDirection[axis][dir].vehicles):[]};
    });
  });
  assert(queueCounts.every(count=>count.actual===count.expected),'The live AI queue cards show the actual selected junction, including opposing traffic');
  for(const count of queueCounts)assert.deepEqual(count.directions,count.expectedDirections,'Both direction counters come from the physical agents');
  await city.locator('#openExamples').click();
  assert.equal(await city.locator('#examplesList .example-card button:enabled').count(),0,'Pending scored runs cannot change their training labels through the notebook');
  assert.deepEqual((await City.snapshot(city)).pending.frozenModel,frozen.pending.frozenModel);await City.closeInfo(city);
  await page.locator('#robotTab').click();await page.reload();await page.locator('#epiTab').click();await City.ready(city);await City.closeInfo(city);
  assert.deepEqual((await City.snapshot(city)).pending,frozen.pending);assert.equal((await City.snapshot(city)).current.attempts.length,1);
  await page.emulateMedia({reducedMotion:'reduce'});await city.locator('#resumeCity').dblclick();await City.waitIdle(city);
  const complete=await City.snapshot(city);assert.equal(complete.current.attempts.length,1);assert.equal(complete.current.attempts[0].results.length,3);assert.equal(complete.current.best,50);
  await City.exam(city);assert.equal((await City.snapshot(city)).current.attempts.length,2);assert(await city.locator('#startExam').isDisabled());
  await page.reload();await City.ready(city);await City.closeInfo(city);assert(await city.locator('#startExam').isDisabled(),'Reload does not refund consumed exams');
  await page.screenshot({path:path.join(root,'test-artifacts',`audit-traffic-${width}.png`)});
  await page.locator('#newParticipant').click();await page.locator('#epiTab').click();await City.ready(city);await City.closeInfo(city);
  const reset=await City.snapshot(city);assert.equal(reset.examples.length,0);assert.equal(reset.current.best,0);assert.equal(reset.current.attempts.length,0);
  assert.equal(await page.locator('#overallScore').innerText(),'0');assert.equal(await page.evaluate(()=>robotExpedition.current().trips.length),0);
  const checkpoint=await page.evaluate(()=>JSON.stringify(FestivalSession.read('city')));
  const payload=await page.evaluate(()=>({kind:'city-score',version:GameScore.VERSION,rules:FestivalSession.read('city').rules,session:FestivalSession.id,score:50,completed:true,auditToken:'http-unrelated-frame'}));
  await page.evaluate(payload=>new Promise((resolve,reject)=>{
    const frame=document.createElement('iframe');frame.hidden=true;
    const timeout=setTimeout(()=>{cleanup();reject(Error('Forged same-origin message never arrived'));},5000);
    const listener=event=>{if(event.data?.auditToken===payload.auditToken){cleanup();resolve();}};
    function cleanup(){clearTimeout(timeout);removeEventListener('message',listener);frame.remove();}
    addEventListener('message',listener);frame.srcdoc='<script>parent.postMessage('+JSON.stringify(payload)+',"*")<\/script>';document.body.appendChild(frame);
  }),payload);
  assert.equal(await page.locator('#overallScore').innerText(),'0','Even a same-origin frame cannot impersonate the current game frame');
  await page.evaluate(()=>{window.auditStaleHTTP=new Promise(resolve=>{const listener=event=>{if(event.data?.auditToken==='http-stale-session'){removeEventListener('message',listener);resolve();}};addEventListener('message',listener);});});
  await city.locator('body').evaluate((_,payload)=>parent.postMessage({...payload,session:'initial',auditToken:'http-stale-session'},'*'),payload);
  await page.evaluate(()=>window.auditStaleHTTP);
  assert.equal(await page.locator('#overallScore').innerText(),'0','A genuine iframe cannot award points to the next participant using an old session');
  assert.equal(await page.evaluate(()=>JSON.stringify(FestivalSession.read('city'))),checkpoint);
  await City.demonstrate(city,{axis:'EW',duration:4});await City.train(city,{axis:'EW',duration:4});await city.locator('#checkMode').click();
  await page.emulateMedia({reducedMotion:'no-preference'});await city.locator('#startExam').click();await city.locator('#pauseCity').click();await city.locator('#stopCity').click();
  assert.equal((await City.snapshot(city)).current.attempts[0].status,'interrupted');assert.equal((await City.snapshot(city)).current.currentScore,0);
  await page.reload();await City.ready(city);await City.closeInfo(city);assert.equal((await City.snapshot(city)).current.best,0);
  assert.equal((await City.snapshot(city)).current.attempts.length,1,'Explicitly aborting an exam consumes its slot across reload');
  assert.equal((await City.snapshot(city)).current.attempts[0].status,'interrupted');
  await page.emulateMedia({reducedMotion:'reduce'});await City.exam(city);assert(await city.locator('#startExam').isDisabled(),'An aborted attempt and a completed one exhaust the same two-slot budget');
  console.log('Traffic wrong own labels, double clicks, frozen model, two whole-suite attempts and reset:',width);
}

async function fileLoadingAudit(browser) {
  const context=await browser.newContext({viewport:{width:1920,height:1080},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try {
    // Parent may send active-tab state before the city's late controller is ready.
    await page.route('**/traffic-ui.js*',async route=>{await new Promise(resolve=>setTimeout(resolve,500));await route.continue();});
    await page.goto(pathToFileURL(path.join(root,'index.html')).href+'#epidemic');
    const city=page.frameLocator('#epiView');await City.ready(city);await City.closeInfo(city);
    assert.equal((await City.snapshot(city)).examples.length,0);assert(await city.locator('#axisEW').isEnabled());
    await City.demonstrate(city,{axis:'EW',duration:4});assert.equal((await City.snapshot(city)).examples.length,0);assert.deepEqual(errors,[]);
    console.log('Local-file direct city link becomes active after a delayed controller');
  }finally{await context.close();}
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

    await page.locator('#epiTab').click();const city=page.frameLocator('#epiView');await City.ready(city);await City.closeInfo(city);await cityGeometry(city);
    const layoutFailures=await city.locator('body').evaluate(()=>{
      const failures=[];if(document.documentElement.scrollWidth>innerWidth+1||document.documentElement.scrollHeight>innerHeight+1)failures.push('Traffic city requires viewport scrolling');
      for(const id of ['map','teachMode','checkMode','demonstrate','saveExample','cityBestScore']){const element=document.getElementById(id);if(element.closest('[hidden]'))continue;const r=element.getBoundingClientRect();if(!r.width||!r.height||r.left<-1||r.top<-1||r.right>innerWidth+1||r.bottom>innerHeight+1)failures.push(id+' outside iframe');}
      return failures;
    });assert.deepEqual(layoutFailures,[],'The local-file city and its controls fit the festival monitor');
    await City.maximum(city);const cityPoints=50;
    await page.waitForFunction(total=>Number(document.getElementById('overallScore').textContent)===total,robotPoints+cityPoints);
    await page.reload();await City.ready(city);await City.closeInfo(city);
    assert.equal((await City.snapshot(city)).current.best,50);assert.equal((await City.snapshot(city)).examples.length,8);assert.equal((await City.snapshot(city)).current.attempts.length,1);
    assert.equal(Number(await page.locator('#overallScore').innerText()),robotPoints+cityPoints);assert.deepEqual(await page.evaluate(()=>robotExpedition.current().trips),robot.trips);
    await page.emulateMedia({reducedMotion:'no-preference'});await city.locator('#testAI').click();await city.locator('#pauseCity').click();
    const filePaused=await City.snapshot(city);assert.equal(filePaused.pending.kind,'practice');
    await page.waitForFunction(()=>FestivalSession.read('city')?.pending?.kind==='practice');
    const persisted=await page.evaluate(()=>FestivalSession.read('city'));await page.reload();await City.ready(city);await City.closeInfo(city);
    const afterReload=await page.evaluate(()=>FestivalSession.read('city'));
    const checkpointState=({feedback,statusText,...state})=>state;
    assert.deepEqual(checkpointState(afterReload),checkpointState(persisted),'The parent preserves all opaque-iframe simulation, model and attempt data; the reload notice may change');
    assert.deepEqual((await City.snapshot(city)).pending,filePaused.pending);assert.equal((await City.snapshot(city)).playing,false);
    await page.screenshot({path:path.join(root,'test-artifacts',`audit-file-traffic-${width}.png`)});

    // Reset a paused file iframe, then verify guarded bridge messages against a nonwinning score.
    await page.locator('#newParticipant').click();await page.locator('#epiTab').click();await City.ready(city);await City.closeInfo(city);
    await city.locator('body').evaluate(()=>new Promise((resolve,reject)=>{const deadline=performance.now()+5000;function check(){if(!trafficCityGame.pending()&&trafficCityGame.examples().length===0&&trafficCityGame.current().best===0)return resolve();if(performance.now()>deadline)return reject(Error('File traffic city did not reset'));setTimeout(check,20);}check();}));
    assert.equal(await page.locator('#overallScore').innerText(),'0');assert.equal(await page.evaluate(()=>robotExpedition.current().trips.length),0);
    await page.emulateMedia({reducedMotion:'reduce'});await City.demonstrate(city,{axis:'EW',duration:4});await City.train(city,{axis:'EW',duration:4});
    await page.waitForFunction(()=>FestivalSession.read('city')?.examples?.length===1);
    const session=await page.evaluate(()=>FestivalSession.id);assert.notEqual(session,'initial');
    assert.equal(await city.locator('body').evaluate(()=>new URLSearchParams(location.search).get('session')),session);
    const forged=await page.evaluate(()=>({kind:'city-score',version:GameScore.VERSION,rules:FestivalSession.read('city').rules,session:FestivalSession.id,score:50,completed:true,auditToken:'unrelated-frame'}));
    const checkpoint=await page.evaluate(()=>JSON.stringify(FestivalSession.read('city')));
    await page.evaluate(payload=>new Promise((resolve,reject)=>{
      const frame=document.createElement('iframe');frame.hidden=true;frame.sandbox='allow-scripts';
      const timer=setTimeout(()=>{cleanup();reject(Error('Forged iframe message did not arrive'));},5000);
      const listener=event=>{if(event.data?.auditToken===payload.auditToken){cleanup();resolve();}};
      function cleanup(){clearTimeout(timer);removeEventListener('message',listener);frame.remove();}
      addEventListener('message',listener);
      frame.srcdoc='<script>const payload='+JSON.stringify(payload)+';'+
        'parent.postMessage({...payload,kind:"festival-session-save",version:1,name:"city",value:{rules:"forged"},auditToken:"forged-checkpoint"},"*");'+
        'parent.postMessage(payload,"*")<\/script>';document.body.appendChild(frame);
    }),forged);
    assert.equal(await page.locator('#overallScore').innerText(),'0','An unrelated opaque iframe cannot forge city points');
    assert.equal(await page.evaluate(()=>JSON.stringify(FestivalSession.read('city'))),checkpoint,'An unrelated opaque iframe cannot overwrite city checkpoint');
    await page.evaluate(()=>{window.auditStaleMessage=new Promise(resolve=>{const listener=event=>{if(event.data?.auditToken==='stale-session'){removeEventListener('message',listener);resolve();}};addEventListener('message',listener);});});
    await city.locator('body').evaluate((_,payload)=>{
      parent.postMessage({...payload,kind:'festival-session-save',version:1,name:'city',value:{rules:'forged'},session:'initial',auditToken:'stale-checkpoint'},'*');
      parent.postMessage({...payload,session:'initial',auditToken:'stale-session'},'*');
    },forged);await page.evaluate(()=>window.auditStaleMessage);
    assert.equal(await page.locator('#overallScore').innerText(),'0','The genuine city cannot publish a stale participant score');
    assert.equal(await page.evaluate(()=>JSON.stringify(FestivalSession.read('city'))),checkpoint,'Stale participants cannot overwrite the active checkpoint');
    await page.reload();await City.ready(city);await City.closeInfo(city);
    assert.equal((await City.snapshot(city)).examples.length,1);assert.equal((await City.snapshot(city)).current.attempts.length,0);assert.equal((await City.snapshot(city)).current.best,0);
    assert.equal(await page.locator('#overallScore').innerText(),'0');assert.equal(await page.evaluate(()=>FestivalSession.id),session);
    assert.deepEqual(errors,[],'Local files, switching games and resetting raise no cross-origin errors');
    console.log('Local-file desktop layout, saved own labels, whole-suite score and guarded opaque bridge:',width,height);
  }finally{await context.close();}
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
