const assert=require('node:assert/strict');
async function lesson(page,check=async()=>{}){
 const hadPassed=await page.evaluate(()=>trainingPassed);
 const actions=[['1. Выбери','[data-index="0"]'],['2. Сделай','#safe'],['3. Испытай','#probe'],['4. Изучи','[data-index="10"]'],['5. Предскажи','#unsafe'],['6. Проверь','#probe'],['7. Обучи','#train'],['8. Выполни','#run']];
 for(const [title,selector]of actions){
  await page.locator('#tourTitle').filter({hasText:title}).waitFor();await check(page);
  assert.equal(await page.locator('.tour-shade').count(),0,'Learning must never dim any part of the game');
  const readable=await page.locator('.tour-card').evaluate(card=>{const r=card.getBoundingClientRect();return ['#tourTitle','#tourText'].every(s=>{const t=card.querySelector(s).getBoundingClientRect();return t.top>=r.top&&t.bottom<=r.bottom-4;});});
  assert(readable,'Lesson text must fit: '+title);
  if(selector==='#run'&&!hadPassed){assert(await page.locator('#nextMission').isDisabled(),'Two examples do not complete training until the robot finishes the trial');assert(!(await page.locator('#trainingMission').innerText()).startsWith('✓'));}
  await page.locator(selector).click();
 }
 await page.locator('#gameTour').waitFor({state:'detached'});
}
async function teachMap(page){
 await page.evaluate(()=>{
  const seen=new Set();grid.forEach((c,i)=>{if(c.type==='wall')return;const f=features(i),key=f.join(',');if(seen.has(key))return;seen.add(key);
   document.querySelector(`[data-index="${i}"]`).click();document.getElementById(danger(f)?'unsafe':'safe').click();document.getElementById('probe').click();
  });document.getElementById('train').click();
 });
}
async function teachTraining(page){
 await page.evaluate(()=>{
  for(const sample of RobotEngine.examples()){
   const i=grid.findIndex(c=>c.type===sample.type&&c.f.join(',')===sample.f.join(','));if(i<0)throw Error('Missing teaching example');
   document.querySelector(`[data-index="${i}"]`).click();document.getElementById(sample.y?'unsafe':'safe').click();document.getElementById('probe').click();
  }document.getElementById('train').click();
 });
}
async function adaptRain(page){
 await page.evaluate(()=>{
  for(const type of Object.keys(RobotEngine.names))for(const y of [0,1]){
   const i=grid.findIndex(c=>c.type===type&&+danger(RobotEngine.features(c,true))===y);if(i<0)continue;
   if(RobotEngine.predict(model,features(i))!==y){document.querySelector(`[data-index="${i}"]`).click();document.getElementById(y?'unsafe':'safe').click();document.getElementById('probe').click();document.getElementById('train').click();}
  }
 });
}
async function deliver(page){await page.locator('#run').click();await page.waitForFunction(()=>!running);return page.locator('#status').innerText();}
async function optimalDelivery(page){const text=await deliver(page);assert(text.includes('Минимум энергии найден!'),text);}
async function adaptGorge(page){
 assert(await page.locator('#run').isDisabled(),'Dry lab examples alone cannot solve the rockfall');
 await page.locator('[data-index="55"]').click();await page.locator('#safe').click();await page.locator('#probe').click();await page.locator('#train').click();
 assert((await page.locator('#model').innerText()).includes('Опыт перенесён'),'Training shows its actual effect');
}
module.exports={lesson,teachMap,teachTraining,adaptGorge,adaptRain,deliver,optimalDelivery};
