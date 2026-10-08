/* Route experiments. Physics and the learned predictor have separate inputs. */
(function (root) {
  'use strict';
  const VERSION = 'route-lab-1';
  const terrains = {
    road: {name:'Дорога',base:2,color:'#667986'}, mud:{name:'Грязь',base:3,color:'#89613c'},
    water:{name:'Мелководье',base:4,color:'#288ca8'}, gravel:{name:'Камни',base:3,color:'#a2aaa1'},
    sand:{name:'Песок',base:4,color:'#d9ba75'}, hill:{name:'Подъём',base:5,color:'#7c9876'}
  };
  const nodes = {S:[70,210,'База'],W:[280,210,'А'],X:[500,210,'Б'],Y:[720,210,'В'],G:[930,210,'Лагерь'],U:[280,50,'Г'],V:[500,50,'Д'],T:[720,50,'Е'],L:[280,370,'Ж'],M:[500,370,'З'],N:[720,370,'И']};
  const edgeData = [
    ['S','W','mud',2],['S','U','road',8],['S','L','gravel',4],['W','U','water',1],['W','L','gravel',2],['W','X','road',3],
    ['U','V','road',3],['L','M','road',3],['X','V','sand',2],['X','M','water',1],['V','T','road',3],['M','N','sand',3],
    ['X','Y','hill',2],['Y','T','gravel',2],['Y','N','gravel',2],['T','G','road',5],['N','G','road',5],['Y','G','road',3]
  ];
  function create(stage=0) {
    const edges=edgeData.map(([a,b,type,length],i)=>({id:i,a,b,type,length}));
    if(stage===1){
      for(const [i,type,length] of [[1,'road',10],[2,'road',7],[3,'sand',2],[4,'water',1],[5,'hill',2],[6,'gravel',3],[7,'hill',2],[9,'gravel',2],[10,'mud',2],[11,'road',3],[13,'water',1],[14,'sand',2],[15,'hill',2],[16,'road',5],[17,'road',4]]) Object.assign(edges[i],{type,length});
    }
    return {stage,title:stage?'Перевал':'Долина',max:stage?13:12,budget:60,nodes,edges,start:'S',goal:'G'};
  }
  const fresh=()=>({dirty:false,wet:0});
  const stateKey=s=>`${+s.dirty}:${s.wet}`;
  const key=o=>`${o.type}:${stateKey(o.before)}`;
  function stateName(s){return [s.dirty?'грязные':'чистые',s.wet?`мокрые (${s.wet})`:'сухие'].join(', ');}
  function physical(type,before) {
    const after={...before},base=terrains[type].base;
    const stalled=type==='hill'&&before.wet>0;
    const energy=base+(before.dirty&&type!=='water'?3:0);
    if(!stalled){
      if(type==='mud')after.dirty=true;
      if(type==='water'){after.dirty=false;after.wet=2;}
      else {after.wet=Math.max(0,after.wet-1);if(type==='gravel')after.dirty=false;if(type==='sand')after.wet=0;}
    }
    return {energy,after,stalled};
  }
  function train(observations){
    const rows=new Map();
    // Store only measured input/output pairs; no map, route, or physical function.
    for(const o of observations)rows.set(key(o),{type:o.type,before:{...o.before},energy:o.energy,after:{...o.after},stalled:o.stalled});
    return [...rows.values()];
  }
  function predictStep(model,type,before){
    const near=model.filter(o=>o.type===type).map(o=>({o,d:(o.before.dirty!==before.dirty?3:0)+Math.abs(o.before.wet-before.wet)})).sort((a,b)=>a.d-b.d);
    if(!near.length)return {energy:terrains[type].base,after:{...before},stalled:false,known:false,source:'Стартовая оценка: эффект ещё не изучен'};
    const {o,d}=near[0];
    return {energy:o.energy,after:{...o.after},stalled:o.stalled,known:d===0,source:d===0?'Есть опыт в таком состоянии':'По ближайшему опыту; состояние колёс отличается'};
  }
  function edgeBetween(map,a,b){return map.edges.find(e=>e.a===a&&e.b===b||e.a===b&&e.b===a);}
  function routeSteps(map,route){
    if(!Array.isArray(route)||route[0]!==map.start||route.length>31)throw Error('Маршрут начинается на базе и содержит не более 30 дорог.');
    const steps=[];
    for(let i=1;i<route.length;i++){
      if(route[i-1]===map.goal)throw Error('После лагеря рейс завершён.');
      const e=edgeBetween(map,route[i-1],route[i]);if(!e)throw Error('Соедини соседние развилки дорогой.');
      for(let n=0;n<e.length;n++)steps.push({type:e.type,edge:e.id,from:route[i-1],to:route[i],fraction:(n+1)/e.length});
    }
    return steps;
  }
  function journey(steps,predictor,budget=Infinity){
    let state=fresh(),spent=0,stalled=false,exhausted=false;const observations=[];
    for(const step of steps){
      const result=predictor(step.type,state);
      if(spent+result.energy>budget){exhausted=true;break;}
      const observation={...step,before:{...state},...result,after:{...result.after}};
      observations.push(observation);spent+=result.energy;state={...result.after};
      if(result.stalled){stalled=true;break;}
    }
    return {spent,state,stalled,exhausted,observations,finished:!stalled&&!exhausted&&observations.length===steps.length};
  }
  const simulate=(map,route)=>journey(routeSteps(map,route),physical,map.budget);
  const forecast=(map,route,model)=>journey(routeSteps(map,route),(type,s)=>predictStep(model,type,s),map.budget);
  // Held-out combinations are never added to the learner's observations.
  const controls=[['mud','road','road','road'],['mud','water','road','road','hill'],['water','hill'],['mud','gravel','road','hill'],['water','sand','hill'],['mud','hill','road']];
  function assess(model){
    const checks=controls.map(types=>{
      const steps=types.map(type=>({type})),actual=journey(steps,physical),predicted=journey(steps,(t,s)=>predictStep(model,t,s));
      const error=Math.abs(actual.spent-predicted.spent),outcome=actual.stalled===predicted.stalled;
      const quality=outcome?Math.max(0,1-error/Math.max(1,actual.spent)):0;
      return {types,actual:actual.spent,predicted:predicted.spent,stalled:actual.stalled,predictedStall:predicted.stalled,error,quality};
    });
    return {checks,score:model.length?Math.floor(25*checks.reduce((s,c)=>s+c.quality,0)/checks.length+1e-9):0,correct:checks.filter(c=>c.quality>=.9).length};
  }
  // State-space search is used for a fair energy benchmark, never to draw a route for the player.
  function optimum(map){
    const queue=[{node:map.start,state:fresh(),energy:0,route:[map.start]}],seen=new Map();
    while(queue.length){
      queue.sort((a,b)=>a.energy-b.energy);const c=queue.shift(),id=c.node+':'+stateKey(c.state);
      if(seen.has(id))continue;seen.set(id,c.energy);if(c.node===map.goal)return c;
      for(const e of map.edges.filter(e=>e.a===c.node||e.b===c.node)){
        let state={...c.state},energy=c.energy,stalled=false;
        for(let n=0;n<e.length;n++){const r=physical(e.type,state);energy+=r.energy;state=r.after;if(r.stalled){stalled=true;break;}}
        if(!stalled){const node=e.a===c.node?e.b:e.a;queue.push({node,state,energy,route:[...c.route,node]});}
      }
    }
    return null;
  }
  function deliveryScore(map,result,route){return result.finished&&route.at(-1)===map.goal?Math.max(1,Math.floor(map.max*optimum(map).energy/result.spent+1e-9)):0;}
  const api={VERSION,terrains,create,fresh,key,stateName,physical,train,predictStep,edgeBetween,routeSteps,journey,simulate,forecast,assess,optimum,deliveryScore};
  root.RobotEngine=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
