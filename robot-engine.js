/* Route experiments. Physics and the learned predictor have separate inputs. */
(function (root) {
  'use strict';
  const VERSION = 'cargo-school-3';
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
      for(const [i,type,length] of [[0,'water',1],[1,'road',10],[2,'water',2],[3,'sand',2],[4,'water',1],[5,'hill',2],[6,'gravel',3],[7,'hill',2],[9,'gravel',2],[10,'mud',2],[11,'road',3],[12,'hill',1],[13,'water',1],[14,'sand',2],[15,'hill',2],[16,'road',5],[17,'road',4]]) Object.assign(edges[i],{type,length});
    }
    return {stage,nodes,edges,start:'S'};
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
  // Learn separate effects from consistent hypotheses, not an unrelated wheel-state snapshot.
  // Candidate families are shared by every surface. No physical() calls or surface-specific answers.
  const dirtRules=[['загрязнение сохраняется',s=>s.dirty],['колёса очищаются',()=>false],['колёса загрязняются',()=>true]];
  const wetRules=[['влажность сохраняется',s=>s.wet],['влажность снижается на 1',s=>Math.max(0,s.wet-1)],['колёса высыхают',()=>0],['влажность становится 1',()=>1],['влажность становится 2',()=>2],['влажность растёт на 1',s=>Math.min(2,s.wet+1)]];
  const stallRules=[['проезд возможен',()=>false],['мокрые колёса застревают',s=>s.wet>0],['сильно мокрые колёса застревают',s=>s.wet===2],['грязные колёса застревают',s=>s.dirty],['проезд невозможен',()=>true],['сухие колёса застревают',s=>!s.wet],['чистые колёса застревают',s=>!s.dirty],['грязные мокрые колёса застревают',s=>s.dirty&&s.wet>0]];
  const compiled=new WeakMap();
  function hypotheses(model){
    if(compiled.has(model))return compiled.get(model);
    const result={};
    for(const [type,t]of Object.entries(terrains)){
      const rows=model.filter(o=>o.type===type),moving=rows.filter(o=>!o.stalled),energy=[];
      for(let dirty=0;dirty<=4;dirty++)for(let wet=0;wet<=4;wet++){
        const f=s=>t.base+dirty*Number(s.dirty)+wet*s.wet;
        if(rows.every(o=>f(o.before)===o.energy))energy.push([`расход ${t.base}${dirty?' + '+dirty+' за грязь':''}${wet?' + '+wet+' × влажность':''}`,f]);
      }
      energy.sort((a,b)=>a[1]({dirty:true,wet:1})-b[1]({dirty:true,wet:1}));
      result[type]={rows,energy,dirt:dirtRules.filter(([,f])=>moving.every(o=>f(o.before)===o.after.dirty)),wet:wetRules.filter(([,f])=>moving.every(o=>f(o.before)===o.after.wet)),stall:stallRules.filter(([,f])=>rows.every(o=>f(o.before)===o.stalled))};
    }
    compiled.set(model,result);return result;
  }
  function predictStep(model,type,before){
    const h=hypotheses(model)[type],exact=h.rows.find(o=>stateKey(o.before)===stateKey(before));
    if(exact)return {energy:exact.energy,after:{...exact.after},stalled:exact.stalled,known:true,source:'Измерено при таком состоянии колёс'};
    // Empty data makes only the visible base-cost/unchanged-state assumption.
    if(!h.rows.length)return {energy:terrains[type].base,after:{...before},stalled:false,known:false,source:'Нет измерений этого покрытия; используется стартовое предположение'};
    const fallback={energy:terrains[type].base,dirt:before.dirty,wet:before.wet,stall:false};
    const values=Object.fromEntries(['energy','dirt','wet','stall'].map(k=>[k,[...new Set(h[k].map(([,f])=>f(before)))]]));
    const pick=k=>values[k][0]??fallback[k],stalled=pick('stall'),known=['energy','stall',...(!stalled?['dirt','wet']:[])].every(k=>values[k].length===1);
    return {energy:pick('energy'),after:stalled?{...before}:{dirty:pick('dirt'),wet:pick('wet')},stalled,known,source:known?'Все правила, согласующиеся с опытом, дают этот результат':'Перенос опыта: несколько объяснений ещё возможны'};
  }
  function explain(model){return Object.entries(hypotheses(model)).map(([type,h])=>({type,examples:h.rows.length,effects:[h.energy[0]?.[0],h.dirt[0]?.[0],h.wet[0]?.[0],h.stall[0]?.[0]].filter(Boolean),ambiguous:[h.energy,h.dirt,h.wet,h.stall].some(rows=>rows.length!==1)}));}
  function edgeBetween(map,a,b){return map.edges.find(e=>e.a===a&&e.b===b||e.a===b&&e.b===a);}
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
  const api={VERSION,terrains,create,fresh,key,stateName,physical,train,predictStep,explain,edgeBetween,journey};
  root.RobotEngine=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
