const assert=require('node:assert/strict');
async function lesson(page,check=async()=>{}){
 const actions=[['1. Выбери','[data-index="0"]'],['2. Проверь','#probe'],['3. Дай','#safe'],['4. Найди','[data-index="10"]'],['5. Проверь','#probe'],['6. Добавь','#unsafe'],['7. Обучи','#train'],['8. Расширяй','#tourNext']];
 for(const [title,selector]of actions){
  await page.locator('#tourTitle').filter({hasText:title}).waitFor();await check(page);
  assert.equal(await page.locator('.tour-shade').count(),0,'Learning must never dim any part of the game');
  const readable=await page.locator('.tour-card').evaluate(card=>{const r=card.getBoundingClientRect();return ['#tourTitle','#tourText'].every(s=>{const t=card.querySelector(s).getBoundingClientRect();return t.top>=r.top&&t.bottom<=r.bottom-4;});});
  assert(readable,'Lesson text must fit: '+title);await page.locator(selector).click();
 }
 await page.locator('#gameTour').waitFor({state:'detached'});
}
async function teachMap(page){
 await page.evaluate(()=>{
  const seen=new Set();grid.forEach((c,i)=>{if(c.type==='wall')return;const f=features(i),key=f.join(',');if(seen.has(key))return;seen.add(key);
   document.querySelector(`[data-index="${i}"]`).click();document.getElementById('probe').click();document.getElementById(danger(f)?'unsafe':'safe').click();
  });document.getElementById('train').click();
 });
}
async function teachTraining(page){
 await page.evaluate(()=>{
  for(const sample of RobotEngine.examples()){
   const i=grid.findIndex(c=>c.type===sample.type&&c.f.join(',')===sample.f.join(','));if(i<0)throw Error('Missing teaching example');
   document.querySelector(`[data-index="${i}"]`).click();document.getElementById('probe').click();document.getElementById(sample.y?'unsafe':'safe').click();
  }document.getElementById('train').click();
 });
}
async function adaptRain(page){
 await page.evaluate(()=>{
  for(const type of Object.keys(RobotEngine.names))for(const y of [0,1]){
   const i=grid.findIndex(c=>c.type===type&&+danger(RobotEngine.features(c,true))===y);if(i<0)continue;
   document.querySelector(`[data-index="${i}"]`).click();document.getElementById('probe').click();
   if(RobotEngine.predict(model,features(i))!==y){document.getElementById(y?'unsafe':'safe').click();document.getElementById('train').click();}
  }
 });
}
async function deliver(page){await page.locator('#run').click();await page.waitForFunction(()=>!running);return page.locator('#status').innerText();}
async function optimalDelivery(page){const text=await deliver(page);assert(text.includes('Минимум энергии найден!'),text);}
module.exports={lesson,teachMap,teachTraining,adaptRain,deliver,optimalDelivery};
