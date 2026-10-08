const assert=require('node:assert/strict');
const routes={direct:['S','W','X','Y'],wash:['S','W','U','V','T','G'],wetHill:['S','W','L','M','X','Y']};
const campaign=[{"round": 0, "experiments": [["S", "W", "L", "M", "X", "Y"], ["S", "W", "U", "W", "S", "U"]], "selected": ["L", "Y"], "stars": 5, "predicted": 59, "spent": 59, "route": ["S", "L", "W", "X", "Y", "X", "W", "S"]}, {"round": 1, "experiments": [["S", "W", "U", "W", "X", "M", "N"], ["S", "W", "U", "W", "U", "W", "L"]], "selected": ["L", "M"], "stars": 6, "predicted": 47, "spent": 47, "route": ["S", "L", "M", "L", "W", "S"]}, {"round": 2, "experiments": [["S", "W", "X", "V"], ["S", "W", "X", "Y"]], "selected": ["Y", "G"], "stars": 6, "predicted": 56, "spent": 56, "route": ["S", "W", "X", "Y", "G", "Y", "X", "W", "S"]}];
const schedule=campaign.map(r=>r.experiments);
async function draw(page,route){await page.locator('#labView').click();if(await page.locator('#clearRoute').isEnabled())await page.locator('#clearRoute').click();for(const id of route.slice(1))await page.locator('[data-node="'+id+'"]').click();assert.deepEqual(await page.evaluate(()=>robotExpedition.current().route),route);}
async function run(page,route){if(route)await draw(page,route);await page.locator('#run').click();await page.waitForFunction(()=>!robotExpedition.current().running);return page.evaluate(()=>robotExpedition.current().trips.at(-1));}
async function teach(page){await page.locator('#train').click();}
async function orders(page,ids){await page.locator('#districtView').click();const selected=await page.evaluate(()=>robotExpedition.current().selected);for(const id of selected)await page.locator('[data-order="'+id+'"]').click();for(const id of ids)await page.locator('[data-order="'+id+'"]').click();}
async function complete(page,check=async()=>{}){
 for(let round=0;round<3;round++){
  for(let i=0;i<2;i++){
   await draw(page,schedule[round][i]);const before=await page.evaluate(()=>robotExpedition.current().model);
   await run(page);assert.deepEqual(await page.evaluate(()=>robotExpedition.current().model),before,'Measurements never silently retrain');
   const frozen=await page.locator('#lastPrediction').innerText();assert(await page.locator('#tripResult').isVisible());await check('experiment-'+round+'-'+i);
   await teach(page);assert.equal(await page.locator('#lastPrediction').innerText(),frozen,'Training cannot rewrite a historical prediction');assert(await page.evaluate(()=>RobotDelivery.validate(FestivalSession.read('robot'))));
  }
  assert(await page.locator('#run').isDisabled(),'Only two experiments before each delivery');
  await orders(page,campaign[round].selected);
  const predictedRoute=await page.evaluate(()=>robotExpedition.current().planning.route);await check('planned-'+round);
  const previousStars=await page.locator('#stars').innerText();await page.locator('#run').click();
  await page.waitForFunction(()=>{const s=robotExpedition.current(),t=s.trips.at(-1);return s.running&&t.selected.every(id=>RobotDelivery.actual(t).observations.some(o=>o.to===id&&o.fraction===1&&!o.stalled));});
  assert.equal(await page.locator('#stars').innerText(),previousStars,'No stars before returning to base');assert((await page.locator('#deliveryProgress').innerText()).includes('Возвращается'));
  await page.waitForFunction(()=>!robotExpedition.current().running);const trip=await page.evaluate(()=>robotExpedition.current().trips.at(-1));assert.equal(trip.route.at(-1),'S');assert((await page.locator('#deliveryProgress').innerText()).includes('На базе'));assert.deepEqual(trip.route,predictedRoute,'Robot actually executes its own plan');assert.equal(await page.locator('#resultStars').innerText(),'★ +'+campaign[round].stars);await check('delivery-'+round);await teach(page);
  assert(await page.evaluate(()=>RobotDelivery.validate(FestivalSession.read('robot'))),'Campaign checkpoint is valid after learning and delivery');
  if(round<2)await page.locator('#nextRound').click();
 }
 assert.equal(await page.locator('#stars').innerText(),'★ 17');assert.equal(await page.locator('#overallScore').innerText(),'50');assert((await page.locator('#missionProgress').innerText()).includes('2 / 3'));
 await page.locator('#notebookButton').click();assert.equal(await page.locator('.trip-entry').count(),9);await page.locator('.trip-entry summary').first().click();assert(await page.locator('.trip-entry table').first().isVisible());await page.locator('#robotDialog').press('Escape');await check('complete');
}
module.exports={routes,schedule,campaign,draw,run,teach,orders,complete};
