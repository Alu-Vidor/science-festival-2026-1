const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),H=require('./robot-browser-helpers.cjs');
const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(f,(e,d)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'})[path.extname(f)]||'application/octet-stream');res.end(d);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const b=await chromium.launch();try{
 const p=await b.newPage({viewport:{width:1920,height:1080},reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:'+server.address().port);
 assert(await p.locator('#run').isDisabled());await H.orders(p,['G']);const naive=await p.evaluate(()=>robotExpedition.current().planning.route);assert.equal(await p.locator('#forecastEnergy').innerText(),'≈ 56 заряда');
 await H.orders(p,['Y']);await p.locator('[data-order=G]').click();assert.deepEqual(await p.evaluate(()=>robotExpedition.current().selected),['Y']);assert((await p.locator('#status').innerText()).includes('Свободно: 1'));
 await p.locator('[data-node=G]').press('Enter');assert.deepEqual(await p.evaluate(()=>robotExpedition.current().selected),['Y']);await p.locator('[data-order=L]').press('Enter');assert.equal(await p.locator('#cargoSummary').innerText(),'Груз: 3 / 3 места');assert.equal(await p.locator('.cargo-slot.filled').count(),3);
 await p.locator('#modelInfo').click();assert((await p.locator('#dialogBody').innerText()).includes('предположение'));assert.equal(await p.locator('#dialogBody .trip-entry').count(),6);await p.locator('#dialogClose').click();
 await p.locator('#labView').click();await p.locator('[data-node=G]').press('Enter');assert.deepEqual(await p.evaluate(()=>robotExpedition.current().route),['S']);
 await p.locator('[data-node=W]').press('Enter');assert.deepEqual(await p.evaluate(()=>robotExpedition.current().route),['S','W']);await p.locator('#undo').click();assert.deepEqual(await p.evaluate(()=>robotExpedition.current().route),['S']);
 await H.draw(p,['S','W','U','W','U','V','T']);await p.locator('[data-node=G]').click();assert.equal(await p.evaluate(()=>robotExpedition.current().route.length),7);
 await p.locator('[data-terrain=water]').click();assert((await p.locator('#dialogBody').innerText()).includes('12 см'));assert((await p.locator('#dialogBody').innerText()).includes('18 см'));await p.locator('#dialogClose').click();
 await H.draw(p,H.schedule[0][0]);await p.emulateMedia({reducedMotion:'no-preference'});
 await p.evaluate(()=>{window.motionSamples=[];window.sampleMotion=true;const take=()=>{if(!window.sampleMotion)return;const e=document.querySelector('#robotSprite'),r=e.getBoundingClientRect(),m=document.querySelector('#routeMap').getBoundingClientRect();motionSamples.push({x:r.x,y:r.y,inside:r.left>=m.left&&r.right<=m.right&&r.top>=m.top&&r.bottom<=m.bottom});requestAnimationFrame(take);};requestAnimationFrame(take);});
 await p.locator('#run').click();assert(await p.locator('#districtView').isDisabled());assert(await p.locator('#train').isDisabled());assert(await p.locator('#undo').isHidden());await p.waitForFunction(()=>robotExpedition.current().trips.at(-1).steps>=2);
 await p.locator('#epiTab').click();assert.equal(await p.evaluate(()=>robotExpedition.current().running),false);assert(await p.evaluate(()=>robotExpedition.current().trips.at(-1).interrupted));
 const frames=await p.evaluate(()=>{sampleMotion=false;return motionSamples;});assert(frames.length>10);assert(new Set(frames.map(v=>v.x.toFixed(1)+':'+v.y.toFixed(1))).size>8,'Robot moves continuously across rendered frames, not by teleporting at road endpoints');assert(frames.every(f=>f.inside),'Animated robot remains inside the map');
 await p.locator('#robotTab').click();const count=await p.evaluate(()=>robotExpedition.current().trips.length);await p.reload();assert.equal(await p.evaluate(()=>robotExpedition.current().trips.length),count);assert.equal(await p.evaluate(()=>robotExpedition.current().model.length),0);
 await p.locator('#restartRobot').click();await p.emulateMedia({reducedMotion:'reduce'});
 for(const route of H.schedule[0]){await H.run(p,route);await H.teach(p);}
 await H.orders(p,H.campaign[0].selected);const learned=await p.evaluate(()=>robotExpedition.current().planning.route);assert.notDeepEqual(learned,naive,'Player experiments change the autonomous route');
 await p.screenshot({path:path.join(root,'test-artifacts','robot-learned-decision.png')});await H.run(p);assert.equal(await p.locator('#resultStars').innerText(),'★ +5');assert.deepEqual(await p.locator('[data-node][data-delivered=true]').evaluateAll(es=>es.map(e=>e.dataset.node).sort()),['L','Y'],'Only selected recipients are marked delivered; transit junctions and unselected orders are not');
 const t=await p.evaluate(()=>robotExpedition.current().trips.at(-1));await p.reload();assert.deepEqual(await p.evaluate(()=>robotExpedition.current().trips.at(-1)),t);assert(await p.locator('#run').isHidden());
 // A whole no-learning campaign makes the trap and the fixed departure count observable in the UI.
 await p.locator('#restartRobot').click();
 for(let round=0;round<3;round++){
  const ids=[['L','M'],['X','M'],['Y','G']][round];await H.orders(p,ids);await H.run(p);assert.equal(await p.evaluate(()=>robotExpedition.current().model.length),0);
  if(round===1||round===2){assert((await p.locator('#tripOutcome').innerText()).includes('0 ★'));if(round===1)assert.equal(await p.locator('#wheelPicture').getAttribute('data-wet'),'true');assert.equal(await p.locator('#resultStars').innerText(),'★ +0');await p.screenshot({path:path.join(root,'test-artifacts','robot-wet-failure-'+round+'.png')});}
  if(round<2)await p.locator('#nextRound').click();
 }
 assert.equal(await p.locator('#stars').innerText(),'★ 4');assert.equal(await p.evaluate(()=>robotExpedition.current().trips.length),3);
 const record=await p.evaluate(()=>robotExpedition.current().best);await p.locator('#nextRound').click();assert.equal(await p.evaluate(()=>robotExpedition.current().trips.length),0);assert.deepEqual(await p.evaluate(()=>robotExpedition.current().best),record);assert.equal(await p.locator('#overallScore').innerText(),'14','Replay keeps the best single campaign rather than accumulating points');
 await p.locator('#newParticipant').click();assert.equal(await p.locator('#overallScore').innerText(),'0');assert.deepEqual(errors,[]);
 console.log('Robot gameplay: keyboard, numeric limits, continuous animation, tab interruption, learned autonomous decisions, wet failures, fixed attempts and no replay farming passed');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
