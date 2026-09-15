const fs=require('fs'),vm=require('vm'),assert=require('assert');const elem=()=>({style:{},textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){},contains(){return false}},children:[],appendChild(x){this.children.push(x)},replaceChildren(){},setAttribute(){},value:'',disabled:false});const els={energy:{...elem(),value:'60'},strategy:{...elem(),value:'short'}};const ctx={console,window:{addEventListener(){}},location:{hash:""},document:{getElementById(id){return els[id]||=elem()},createElement:elem,createDocumentFragment:elem,body:elem()},setTimeout(){},clearTimeout(){}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],ctx);vm.runInContext(`
if(grid.length!==144)throw Error('map size');
let basic=findPath(start,targets,false); if(!basic.some(i=>danger(features(i))))throw Error('baseline should demonstrate hazard');
model=grid.flatMap((c,i)=>c.type==='wall'?[]:[{f:features(i),y:+danger(features(i))}]);
let pos=start,goals=new Set(targets),total=0;while(goals.size){let p=findPath(pos,goals,true);if(!p)throw Error('unreachable');for(let i of p){if(danger(features(i)))throw Error('trained path unsafe '+i);total+=({road:1,mud:3,hill:4,water:5,sand:2}[grid[i].type]);}pos=p[p.length-1];goals.delete(pos);}console.log('Trained route energy',total);if(total>60)throw Error('energy');
samples=[];selected=0;label(0);label(1);if(samples.length!==1||samples[0].y!==1)throw Error('replace duplicate');
let before=features(0)[0];raining=true;if(features(0)[0]!==before+25)throw Error('weather');

if(features(0).length!==4)throw Error('four model inputs');
if(!danger([0,0,0,30])||danger([0,0,0,31]))throw Error('bearing threshold');
if(rectangle(13,26).join(',')!=='13,14,25,26')throw Error('rectangle selection');
selection=new Set([0,1,2]);samples=[];label(0);if(!samples.length||samples.some(s=>s.f.length!==4))throw Error('bulk training');
$('strength').value='20';$('applyStrength').onclick();if([0,1,2].some(i=>features(i)[3]!==20||!danger(features(i))))throw Error('bulk bearing edit');
tool='sand';$('applySelection').onclick();if([0,1,2].some(i=>grid[i].type!=='sand'))throw Error('bulk terrain edit');
running=true;$('strength').value='99';$('applyStrength').onclick();if(features(1)[3]===99)throw Error('editing during run');running=false;
selection.clear();initial();if(selection.size||grid.length!==144)throw Error('reset');
$('board').getBoundingClientRect=()=>({width:630});robot=13;moveSprite();if(!$('robotSprite').style.transform.includes('52.75'))throw Error('sprite cell alignment');
console.log('Model, fourth factor, bulk edits and selection checks passed');`,ctx);
