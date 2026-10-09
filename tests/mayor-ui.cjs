// Controller integration check in a lightweight DOM. Not a browser rendering test.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),M=require('../mayor.js'),E=require('../epidemic.js');const ids={},queue=[];
class El{constructor(tag='div'){this.tag=tag;this.children=[];this.attrs={};this.value='';this.textContent='';this.disabled=false;const classes=new Set();this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,force){if(force!==undefined){force?classes.add(x):classes.delete(x);return !!force;}if(classes.has(x)){classes.delete(x);return false;}classes.add(x);return true;}};}set id(v){this.attrs.id=v;ids[v]=this;}get id(){return this.attrs.id;}setAttribute(k,v){this.attrs[k]=v;if(k==='id')this.id=v;}appendChild(e){if(e.parentNode)e.parentNode.children=e.parentNode.children.filter(x=>x!==e);e.parentNode=this;this.children.push(e);return e;}insertBefore(e){this.appendChild(e);}replaceChildren(){this.children=[];}addEventListener(){}focus(){}scrollIntoView(){}closest(tag){let e=this;while(e&&e.tag!==tag)e=e.parentNode;return e;}querySelectorAll(query){const tags=query.split(',');const result=[];function visit(e){for(const c of e.children){if(tags.includes(c.tag))result.push(c);visit(c);}}visit(this);return result;}set innerHTML(source){const stack=[this];for(const part of source.match(/<[^>]*>|[^<]+/g)||[]){if(part.startsWith('</')){stack.pop();continue;}if(!part.startsWith('<')){stack.at(-1).textContent+=part;continue;}const tag=part.match(/^<([\w-]+)/)?.[1];if(!tag)continue;const e=new El(tag);for(const m of part.matchAll(/([\w-]+)="([^"]*)"/g)){e.setAttribute(m[1],m[2]);if(m[1]==='value')e.value=m[2];}stack.at(-1).appendChild(e);if(!['input','br','hr'].includes(tag))stack.push(e);}}}
const body=new El('body'),main=new El('main'),city=new El('section');body.appendChild(main);main.appendChild(city);let renders=0,lastGame;
const window={renderMayor(g,h,i){renders++;lastGame=g;assert(i<h.length);assert(h[i].loc.length===g.people.length);}};
ids.map=new El('svg');
ids.cityTutorial=new El('button');
const document={body,createElement:tag=>new El(tag),createElementNS:(ns,tag)=>new El(tag),getElementById:id=>ids[id],querySelector:q=>q==='.city'?city:null};
const ctx={structuredClone,document,window,parent:window,location:{search:''},URLSearchParams,GameScore:require('../game-score.js'),CityCampaign:require('../city-campaign.js'),Mayor:M,Epidemic:E,console,setTimeout:f=>{queue.push(f);return queue.length;},clearTimeout(){queue.length=0;}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../mayor-ui.js'),'utf8'),ctx);
assert(window.mayorActive);assert.equal(city.parentNode,ids.mayorMapSlot);assert(renders>0);assert(ids.tryCity.disabled);assert.equal(ids.citizenChoice.children.length,90);assert.equal(ids.cityGoalGrid.children.length,3);
function flush(){while(queue.length)queue.shift()();}
function round(){ids.tryCity.onclick();flush();}
ids.cityHypothesis.value='transport';
assert(window.cityTourHooks.before());ids.observeCity.onclick();flush();assert(window.cityLesson.observed());assert.equal(lastGame.day,1);
ids['pick-bus-frequent'].onclick();ids.tryCity.onclick();flush();assert(window.cityLesson.attempted());assert.equal(lastGame.day,1,'Both teaching plans start on the same day');
// Tour Back must reopen free actions, without touching the real campaign or trial slots.
const lessonCheckpoint=JSON.stringify(window.cityCampaignGame.current());
window.cityTourHooks.prepare('test');assert(!window.cityLesson.attempted());assert(!ids.tryCity.disabled);ids.tryCity.onclick();flush();assert(window.cityLesson.attempted());
window.cityTourHooks.prepare('choose');assert(!window.cityLesson.attempted());assert.equal(ids['pick-bus-normal'].attrs['aria-pressed'],true);assert(!ids['pick-bus-frequent'].disabled);
window.cityTourHooks.prepare('observe');assert(!window.cityLesson.observed());assert(!ids.observeCity.hidden);assert(!ids.observeCity.disabled);ids.observeCity.onclick();flush();assert(window.cityLesson.observed());
assert.equal(JSON.stringify(window.cityCampaignGame.current()),lessonCheckpoint);assert.equal(window.cityCampaignGame.trials().length,0);assert.equal(ids.cityLocalScore.textContent,'0 / 50');
window.cityTourHooks.after();assert.equal(window.cityCampaignGame.current().game.day,0);
ids.beginCity.onclick();ids['pick-bus-frequent'].onclick();
let checkpoint=JSON.stringify(window.cityCampaignGame.current());ids.trialCity.onclick();assert(window.cityCampaignGame.isPlaying());assert(ids['pick-bus-normal'].disabled);assert(ids['build-bus'].disabled);
assert(ids.cityTutorial.disabled);window.mayorCitizenSelect(2);assert(!window.cityCampaignGame.isPlaying());assert(window.cityCampaignGame.isPending());assert(ids.cityTutorial.disabled);assert.equal(queue.length,0);ids.tryCity.onclick();flush();assert(!ids.cityTutorial.disabled);
assert.equal(JSON.stringify(window.cityCampaignGame.current()),checkpoint);assert.equal(ids.cityLocalScore.textContent,'0 / 50');assert.equal(window.cityCampaignGame.trial().result.score,3);
ids.trialCity.onclick();flush();assert(ids.trialCity.disabled,'Two trials per round');ids.trialCity.onclick();assert.equal(window.cityCampaignGame.trials().length,2);
const prediction=JSON.stringify(window.cityCampaignGame.trial().result);round();assert.equal(window.cityCampaignGame.current().game.day,4);assert.equal(JSON.stringify(window.cityCampaignGame.current().results[0]),prediction);assert.equal(ids.cityLocalScore.textContent,'16 / 50');
// Replaying a profitable first round in a new party cannot add it to the old one.
ids.restartEarly.onclick();assert.equal(ids.cityLocalScore.textContent,'0 / 50');assert.equal(ids.cityBestScore.textContent,'16 / 50');assert.equal(window.cityCampaignGame.trials().length,0);
ids['pick-bus-frequent'].onclick();round();assert.equal(ids.cityLocalScore.textContent,'16 / 50');assert.equal(ids.cityBestScore.textContent,'16 / 50');
ids['build-market'].onclick();round();assert.equal(ids.cityLocalScore.textContent,'33 / 50');ids['refund-market'].onclick();ids['build-clinic'].onclick();ids['pick-bus-normal'].onclick();round();
assert.equal(ids.cityLocalScore.textContent,'50 / 50');assert.equal(ids.cityStars.textContent,'★ 9 / 9');assert(ids.tryCity.disabled);assert.equal(ids.cityAttempts.children.length,1);
ids['inspect-care'].onclick();assert(ids.cityFlow.open);assert(ids.flowPanel.children.some(e=>e.className==='flow-chain'));
window.mayorCitizenSelect(0);assert.equal(ids.citizenPanel.children[0].children.find(e=>e.tag==='ol').children.length,5);
assert(window.cityTourHooks.before());ids.observeCity.onclick();window.cityTourHooks.after();assert.equal(queue.length,0);assert.equal(window.cityCampaignGame.current().game.day,12);
ids.restartCity.onclick();assert.equal(ids.cityLocalScore.textContent,'0 / 50');assert.equal(ids.cityBestScore.textContent,'50 / 50');ids['pick-school-remote'].onclick();for(let i=0;i<3;i++)round();assert.notEqual(ids.cityLocalScore.textContent,'50 / 50');assert.equal(ids.cityBestScore.textContent,'50 / 50');assert.equal(ids.cityAttempts.children.length,2);
window.mayorSelect('park');assert(ids.cityPlaceInfo.open);window.mayorSelect('gym');assert(ids.cityPlacePanel.children.some(e=>e.textContent.includes('24')));
console.log('City controller: same-checkpoint lessons and trials, two-trial limit, four-day commit, pause/inspection, nine stars, reset and best-party retention passed');
