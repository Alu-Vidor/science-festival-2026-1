const assert=require('node:assert/strict');
const routes={direct:['S','W','X','Y'],wash:['S','W','U','V','T','G'],wetHill:['S','W','L','M','X','Y']};
const schedule=[[["S","U","W","S","L"],["S","W","X","Y"]],[["S","W","U","W"],["S","W","S"]],[["S","W","L","M","X","Y"],["S","W","U","W","X","Y"]]];
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
  const ids=await page.evaluate(()=>RobotDelivery.district(robotExpedition.current().round).orders.map(o=>o.id));await orders(page,ids);
  const predictedRoute=await page.evaluate(()=>robotExpedition.current().planning.route);await check('planned-'+round);
  const trip=await run(page);assert.deepEqual(trip.route,predictedRoute,'Robot actually executes its own plan');assert.equal(await page.locator('#resultStars').innerText(),'★ +6');await check('delivery-'+round);await teach(page);
  assert(await page.evaluate(()=>RobotDelivery.validate(FestivalSession.read('robot'))),'Campaign checkpoint is valid after learning and delivery');
  if(round<2)await page.locator('#nextRound').click();
 }
 assert.equal(await page.locator('#stars').innerText(),'★ 18');assert.equal(await page.locator('#overallScore').innerText(),'50');assert((await page.locator('#missionProgress').innerText()).includes('2 / 3'));
 await page.locator('#notebookButton').click();assert.equal(await page.locator('.trip-entry').count(),9);await page.locator('.trip-entry summary').first().click();assert(await page.locator('.trip-entry table').first().isVisible());await page.locator('#robotDialog').press('Escape');await check('complete');
}
module.exports={routes,schedule,draw,run,teach,orders,complete};
