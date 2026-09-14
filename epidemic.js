(function(root){'use strict';
function rng(seed){let s=seed>>>0;return ()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
const places=[
{id:'h0',name:'Северный квартал',x:160,y:88,icon:'🏘',home:true},
{id:'h1',name:'Лесной квартал',x:500,y:88,icon:'🏘',home:true},
{id:'h2',name:'Речной квартал',x:840,y:88,icon:'🏘',home:true},
{id:'school',name:'Школа',x:160,y:310,icon:'🏫'},
{id:'work',name:'Мастерская',x:500,y:310,icon:'🏭'},
{id:'market',name:'Магазин',x:840,y:310,icon:'🏪'},
{id:'park',name:'Парк',x:330,y:505,icon:'🌳'},
{id:'bus',name:'Автобусный узел',x:670,y:505,icon:'🚌'},
{id:'h3',name:'Южный квартал',x:160,y:715,icon:'🏘',home:true},
{id:'h4',name:'Солнечный квартал',x:500,y:715,icon:'🏘',home:true},
{id:'h5',name:'Озёрный квартал',x:840,y:715,icon:'🏘',home:true}];
const phases=['Утро · дорога','День · учёба и дела','Вечер · прогулка','Ночь · дома'];
function destination(i,phase,day,c){const home='h'+Math.floor(i/10),far=i>=30;if(phase===3)return home;if(!c.bus&&far)return home;if(phase===0)return c.bus?'bus':home;if(phase===1){let target=i%3===0?'school':i%3===1?'work':'market';return c[target]===false?home:target;}return c.park&&(i+day)%3!==0?'park':home;}
function simulate(options={}){const c={p:.12,duration:5,seed:1,initial:0,school:true,market:true,park:true,bus:true,...options};const random=rng(c.seed),state=Array(60).fill('S'),age=Array(60).fill(0);state[c.initial]='I';let visits=0,baseline=0;const history=[];
function record(day,phase,loc,events){history.push({day,phase,S:state.filter(x=>x==='S').length,I:state.filter(x=>x==='I').length,R:state.filter(x=>x==='R').length,state:[...state],loc,events,activity:baseline?Math.round(visits/baseline*100):100});}
record(0,3,Array.from({length:60},(_,i)=>'h'+Math.floor(i/10)),[]);
for(let day=1;day<=60&&state.includes('I');day++)for(let phase=0;phase<4;phase++){const loc=state.map((_,i)=>destination(i,phase,day,c)),next=[...state],events=[];for(let i=0;i<60;i++){if(phase===1||phase===2){const normal=destination(i,phase,day,{...c,school:true,market:true,park:true,bus:true});if(!normal.startsWith('h'))baseline++;if(!loc[i].startsWith('h'))visits++;}}
for(let a=0;a<60;a++)for(let b=a+1;b<60;b++){const u=random();if(loc[a]!==loc[b])continue;let source=state[a]==='I'&&state[b]==='S'?a:state[b]==='I'&&state[a]==='S'?b:-1;if(source<0)continue;const target=source===a?b:a;const factor=loc[a].startsWith('h')?.8:loc[a]==='park'?.12:loc[a]==='bus'?.22:.25;if(u<c.p*factor&&next[target]==='S'){next[target]='I';events.push({source,target,place:loc[a]});}}
for(let i=0;i<60;i++){if(phase===3&&state[i]==='I'){age[i]++;if(age[i]>=c.duration)next[i]='R';}state[i]=next[i];}record(day,phase,loc,events);if(!state.includes('I'))break;}
return {history,peak:Math.max(...history.map(h=>h.I)),total:60-history.at(-1).S,activity:history.at(-1).activity,config:c};}
root.Epidemic={rng,places,phases,destination,simulate};if(typeof module!=='undefined')module.exports=root.Epidemic;
})(typeof window!=='undefined'?window:globalThis);
