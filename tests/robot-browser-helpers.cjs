const assert=require('node:assert/strict');
const routes={direct:['S','W','X','Y','G'],wash:['S','W','U','V','T','G'],bottom:['S','L','M','N','G'],wetHill:['S','W','X','M','X','Y','G'],dryHill:['S','U','V','X','Y','G'],scrub:['S','W','L','M','N','G'],drySand:['S','W','X','M','N','Y','G']};
async function draw(page,route){if(await page.locator('#clearRoute').isEnabled())await page.locator('#clearRoute').click();for(const id of route.slice(1))await page.locator('[data-node="'+id+'"]').click();assert.deepEqual(await page.evaluate(()=>robotExpedition.current().route),route);}
async function run(page,route){if(route)await draw(page,route);await page.locator('#run').click();await page.waitForFunction(()=>!robotExpedition.current().running);return page.evaluate(()=>robotExpedition.current().trips.at(-1));}
async function teach(page){await page.locator('#train').click();}
async function complete(page,check=async()=>{}){
  await draw(page,routes.direct);
  assert.equal(await page.locator('#forecastEnergy').innerText(),'≈ 28 энергии');
  await run(page);assert.equal(await page.locator('#lastActual').innerText(),'55');assert.equal(await page.locator('#lastPrediction').innerText(),'28');
  assert.equal(await page.evaluate(()=>robotExpedition.current().model.length),0,'Trials collect measurements without silently teaching');
  assert(await page.locator('#expedition-1').isDisabled());await check('first');await teach(page);
  assert.equal(await page.locator('#forecastEnergy').innerText(),'≈ 55 энергии');assert.equal(await page.locator('#lastPrediction').innerText(),'28','Historical predictions remain frozen after learning');
  assert.equal(await page.locator('#qualitySummary').innerText(),'2 / 6 — точный прогноз');
  for(const key of ['wash','bottom','wetHill','dryHill','scrub','drySand']){
    await run(page,routes[key]);if(key==='wetHill'){assert((await page.locator('#tripOutcome').innerText()).includes('застрял'));await check('stalled');}
    await teach(page);await check(key);
  }
  assert.equal(await page.locator('#modelScore').innerText(),'25 / 25');assert.equal(await page.locator('#qualitySummary').innerText(),'6 / 6 — точный прогноз');
  await page.locator('#auditButton').click();assert.equal(await page.locator('#dialogBody tbody tr').count(),6);await check('audit');await page.locator('#dialogClose').click();
  await page.locator('#notebookButton').click();assert.equal(await page.locator('.trip-entry').count(),7);await page.locator('.trip-entry summary').first().click();assert(await page.locator('.trip-entry table').first().isVisible());await page.locator('#robotDialog').press('Escape');
  await page.locator('#expedition-1').click();await run(page,routes.bottom);await teach(page);
  assert.equal(await page.locator('#deliveryScore').innerText(),'25 / 25');assert.equal(await page.locator('#overallScore').innerText(),'50');
  assert((await page.locator('#missionProgress').innerText()).includes('2 / 3'));await check('second-map');
}
module.exports={routes,draw,run,teach,complete};
