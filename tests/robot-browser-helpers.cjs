const assert=require('node:assert/strict');
async function lesson(page){
 for(const [title,selector] of [['Изучи сухой','[data-index="0"]'],['Безопасный пример','#safe'],['Найди причину','[data-index="61"]'],['Опасный пример','#unsafe'],['Пологий склон','[data-index="20"]'],['Можно проехать','#safe'],['Крутой склон','[data-index="19"]'],['Крутой склон опасен','#unsafe'],['Прочный песок','[data-index="15"]'],['Песок выдержит','#safe'],['Слабый песок','[data-index="14"]'],['Слабый грунт опасен','#unsafe'],['Обучи ИИ','#train']]){
  await page.locator('#tourTitle').filter({hasText:title}).waitFor();
  const readable=await page.locator('.tour-card').evaluate(card=>{const r=card.getBoundingClientRect();return ['#tourTitle','#tourText'].every(s=>{const t=card.querySelector(s).getBoundingClientRect();return t.top>=r.top&&t.bottom<=r.bottom-4;});});
  if(!readable)await page.screenshot({path:require('node:path').join(__dirname,'../test-artifacts/robot-lesson-failure.png')});
  assert(readable,'Every robot lesson must show its complete text: '+title);
  await page.locator(selector).click();
 }
 await page.locator('#gameTour').waitFor({state:'detached'});
}
async function teachMap(page){
 // Exercise the actual inspection, labeling and training buttons; the test knows
 // ground truth so it can prove the advertised maximum is reachable in the UI.
 await page.evaluate(()=>{const seen=new Set();grid.forEach((c,i)=>{if(c.type==='wall')return;const f=features(i),key=f.join(',');if(seen.has(key))return;seen.add(key);document.querySelector(`[data-index="${i}"]`).click();document.getElementById(danger(f)?'unsafe':'safe').click();});document.getElementById('train').click();});
}
async function deliver(page){await page.locator('#run').click();await page.waitForFunction(()=>!document.getElementById('run').disabled);return page.locator('#status').innerText();}
async function optimalDelivery(page){
 const order=await page.evaluate(()=>RobotEngine.optimum(mission).order.join(','));await page.locator('#parcelOrder').selectOption(order);await page.locator('#routeMode').selectOption('energy');
 const text=await deliver(page);assert(text.includes('Минимум энергии найден!'),text);
}
module.exports={lesson,teachMap,deliver,optimalDelivery};
