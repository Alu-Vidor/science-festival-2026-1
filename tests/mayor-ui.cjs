// Controller integration check in a lightweight DOM. Not a browser rendering test.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),M=require('../mayor.js'),E=require('../epidemic.js');const ids={},queue=[];
class El{constructor(tag='div'){this.tag=tag;this.children=[];this.attrs={};this.value='';this.textContent='';this.disabled=false;const classes=new Set();this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,force){if(force!==undefined){force?classes.add(x):classes.delete(x);return !!force;}if(classes.has(x)){classes.delete(x);return false;}classes.add(x);return true;}};}set id(v){this.attrs.id=v;ids[v]=this;}get id(){return this.attrs.id;}setAttribute(k,v){this.attrs[k]=v;if(k==='id')this.id=v;}appendChild(e){if(e.parentNode)e.parentNode.children=e.parentNode.children.filter(x=>x!==e);e.parentNode=this;this.children.push(e);return e;}insertBefore(e){this.appendChild(e);}replaceChildren(){this.children=[];}addEventListener(){}focus(){}scrollIntoView(){}closest(tag){let e=this;while(e&&e.tag!==tag)e=e.parentNode;return e;}querySelectorAll(query){const tags=query.split(',');const result=[];function visit(e){for(const c of e.children){if(tags.includes(c.tag))result.push(c);visit(c);}}visit(this);return result;}set innerHTML(source){const stack=[this];for(const part of source.match(/<[^>]*>|[^<]+/g)||[]){if(part.startsWith('</')){stack.pop();continue;}if(!part.startsWith('<')){stack.at(-1).textContent+=part;continue;}const tag=part.match(/^<([\w-]+)/)?.[1];if(!tag)continue;const e=new El(tag);for(const m of part.matchAll(/([\w-]+)="([^"]*)"/g)){e.setAttribute(m[1],m[2]);if(m[1]==='value')e.value=m[2];}stack.at(-1).appendChild(e);if(!['input','br','hr'].includes(tag))stack.push(e);}}}
const body=new El('body'),main=new El('main'),city=new El('section');body.appendChild(main);main.appendChild(city);let renders=0,lastGame;
const window={renderMayor(g,h,i){renders++;lastGame=g;assert(i<h.length);assert(h[i].loc.length===g.people.length);}};
ids.map=new El('svg');
const document={body,createElement:tag=>new El(tag),createElementNS:(ns,tag)=>new El(tag),getElementById:id=>ids[id],querySelector:q=>q==='.city'?city:null};
const ctx={document,window,parent:window,location:{search:''},URLSearchParams,GameScore:require('../game-score.js'),CityCampaign:require('../city-campaign.js'),Mayor:M,Epidemic:E,console,setTimeout:f=>{queue.push(f);return queue.length;},clearTimeout(){queue.length=0;}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../mayor-ui.js'),'utf8'),ctx);
assert(window.mayorActive);assert.equal(city.parentNode,ids.mayorMapSlot);assert(renders>0);assert(ids.tryCity.disabled);assert.equal(ids.citizenChoice.children.length,90,'Residents menu is populated before selecting an avatar');assert.equal(ids.cityGoalGrid.children.length,1);assert.equal(ids.cityConditionGrid.children.length,5);
function flush(){while(queue.length)queue.shift()();}
function day(){ids.tryCity.onclick();flush();}
assert(window.cityTourHooks.before());
ids.observeCity.onclick();flush();assert(window.cityLesson.observed());assert.equal(lastGame.day,1);assert.equal(ids.cityLocalScore.textContent,'0 / 50');
ids['pick-bus-frequent'].onclick();ids.tryCity.onclick();flush();assert(window.cityLesson.attempted());assert.equal(lastGame.day,2);assert.equal(ids.cityLocalScore.textContent,'0 / 50');
window.cityTourHooks.after();assert.equal(window.cityCampaignGame.current().game.day,0,'Learning never consumes campaign days');
ids.beginCity.onclick();ids['pick-school-shifts'].onclick();ids['pick-bus-frequent'].onclick();
ids.tryCity.onclick();assert(window.cityCampaignGame.isPlaying());assert(ids['pick-bus-normal'].disabled);
window.mayorCitizenSelect(2);assert(ids.cityPeople.open);assert(!window.cityCampaignGame.isPlaying());assert(window.cityCampaignGame.isPending());assert.equal(window.cityCampaignGame.current().game.day,0);assert.equal(queue.length,0);
ids.tryCity.onclick();flush();assert.equal(window.cityCampaignGame.current().game.day,1);assert(!window.cityCampaignGame.isPending());
for(let n=1;n<4;n++)day();assert.equal(ids.cityLocalScore.textContent,'10 / 50');assert.equal(window.cityCampaignGame.current().results.length,1);
ids['pick-shops-long'].onclick();for(let n=0;n<4;n++)day();assert.equal(ids.cityLocalScore.textContent,'25 / 50');
assert(ids.roundWhy.textContent.includes('Еда:'));ids.experimentRound.value=0;ids['experiment-school'].value='normal';ids['experiment-bus'].value='normal';ids['experiment-shops'].value='both';const checkpoint=JSON.stringify(window.cityCampaignGame.current());ids.testAlternative.onclick();assert(ids.alternativeResult.children.length>0);assert.equal(JSON.stringify(window.cityCampaignGame.current()),checkpoint);
ids['experiment-bus'].value='frequent';ids['experiment-bus'].onchange();assert.equal(ids.alternativeResult.children.length,0);assert(ids.experimentState.textContent.includes('План изменён'));ids.testAlternative.onclick();assert(ids.experimentState.textContent.includes('Улучшение подтверждено'));assert.equal(ids.cityLocalScore.textContent,'30 / 50');
ids['build-clinic'].onclick();assert.equal(window.cityCampaignGame.current().funds,90);
ids['pick-shops-both'].onclick();day();assert(ids.cityGoalGrid.children[0].children.some(e=>e.textContent==='Пока нет обращений'));for(let n=1;n<4;n++)day();assert.equal(ids.cityLocalScore.textContent,'50 / 50');assert(ids.tryCity.disabled);assert.equal(ids.citizenChoice.children.length,90,'Residents menu is populated before selecting an avatar');assert.equal(ids.cityGoalGrid.children.length,1);assert.equal(ids.cityConditionGrid.children.length,6);
assert.equal(ids.cityAttempts.children.length,1);window.mayorCitizenSelect(0);assert(ids.cityPeople.open);assert.equal(ids.citizenPanel.children[0].children.find(e=>e.tag==='ol').children.length,5);
ids.restartCity.onclick();assert.equal(window.cityCampaignGame.current().funds,200);assert.equal(ids.cityLocalScore.textContent,'0 / 50');assert.equal(ids.cityBestScore.textContent,'50 / 50');
window.mayorSelect('park');assert(ids.cityPlaceInfo.open);assert(ids.cityPlacePanel.children.some(e=>e.textContent.includes('60')));window.mayorSelect('gym');assert(ids.cityPlacePanel.children.some(e=>e.textContent.includes('24')));
ids['pick-school-remote'].onclick();for(let n=0;n<12;n++)day();assert.equal(ids.cityAttempts.children.length,2);assert.equal(ids.cityBestScore.textContent,'50 / 50','A weaker replay preserves the best score');assert.notEqual(ids.cityLocalScore.textContent,'50 / 50','Current score is separate from best');assert(ids.roundOutcome.textContent.includes('Не выполнено:'));assert.equal(ids.cityConditionGrid.children.length,6);
assert(window.cityTourHooks.before());ids.observeCity.onclick();window.cityTourHooks.after();assert.equal(queue.length,0,'Skipping cancels a moving lesson');assert.equal(window.cityCampaignGame.current().game.day,12,'Replaying the tutorial preserves campaign progress');
console.log('City UI: free learning, one-day stops, pause/resume, three persistent rounds, projects, unlimited replays and best score passed');

// A changing real plan is not a one-variable baseline. Both research plans
// must run for the same four days from the same checkpoint.
ids.restartCity.onclick();ids['pick-school-shifts'].onclick();ids['pick-bus-frequent'].onclick();day();
ids['pick-bus-normal'].onclick();for(let n=1;n<4;n++)day();
assert.equal(window.cityCampaignGame.current().results[0].score,5);
ids.experimentRound.value=0;ids['experiment-school'].value='normal';ids['experiment-bus'].value='frequent';ids['experiment-shops'].value='both';ids.testAlternative.onclick();
const comparison=ids.alternativeResult.children.find(e=>e.tag==='table');
assert.equal(comparison.children[1].children[1].textContent,'10','Research uses the constant first-day plan as its baseline');
assert(ids.experimentState.textContent.includes('Улучшение подтверждено'));assert.equal(ids.cityLocalScore.textContent,'10 / 50');
ids.testAlternative.onclick();assert.equal(ids.cityLocalScore.textContent,'10 / 50','Repeated experiments cannot add the bonus twice');
