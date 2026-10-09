/* The dispatcher has access to learned predictions, never to hidden road physics. */
(function(root){
  'use strict';
  const R=typeof module!=='undefined'?require('./robot-engine.js'):root.RobotEngine;
  const VERSION=R.VERSION,ROUNDS=3,EXPERIMENTS=2,CAPACITY=3,MAX_STARS=17;
  function district(round){
    const m=R.create(round===1?1:0);m.stage=round;m.title=['Лесная долина','Каменный перевал','Озёрный край'][round];
    m.budget=[68,58,58][round];m.capacity=CAPACITY;
    if(round===2)for(const [i,type,length]of [[0,'water',2],[1,'gravel',5],[2,'mud',2],[3,'hill',1],[4,'sand',2],[5,'road',3],[6,'hill',2],[7,'road',3],[8,'water',1],[9,'gravel',2],[10,'sand',2],[11,'water',1],[12,'road',3],[13,'mud',2],[14,'hill',2],[15,'road',4],[16,'hill',2],[17,'road',4]])Object.assign(m.edges[i],{type,length});
    const targets=[['L','M','Y','G'],['X','L','Y','M'],['T','Y','U','G']][round];
    const titles=[['Лесники','Метеостанция','Связисты','Дальний лагерь'],['Геологи','Смотрители','Альпинисты','Спасатели'],['Причал','Биологи','Смотрители','Озёрный лагерь']][round];
    m.orders=targets.map((node,i)=>({id:node,node,code:'1234'[i],title:titles[i],size:[1,1,2,2][i],stars:[2,2,3,4][i],icon:['⌂','⚑','✚','✚'][i]}));return m;
  }
  function cargo(map,selected){return map.orders.filter(o=>selected.includes(o.id)).reduce((n,o)=>n+o.size,0);}
  function validSelection(map,selected){return Array.isArray(selected)&&selected.length>0&&new Set(selected).size===selected.length&&selected.every(id=>map.orders.some(o=>o.id===id))&&cargo(map,selected)<=map.capacity;}
  function laboratory(){return {...R.create(0),title:'Твой полигон',budget:36};}
  function steps(map,route){
    if(!Array.isArray(route)||route[0]!=='S'||route.length>61)throw Error('Некорректный маршрут');
    const result=[];
    for(let i=1;i<route.length;i++){
      const e=R.edgeBetween(map,route[i-1],route[i]);if(!e)throw Error('Нет такой дороги');
      for(let n=0;n<e.length;n++)result.push({type:e.type,edge:e.id,from:route[i-1],to:route[i],fraction:(n+1)/e.length});
    }return result;
  }
  function forecast(map,route,model){return R.journey(steps(map,route),(t,s)=>R.predictStep(model,t,s));}
  function simulate(map,route){return R.journey(steps(map,route),R.physical,map.budget);}
  // Dijkstra searches node × predicted wheel state × delivered orders. It cannot call physical().
  function plan(map,selected,model){
    if(!validSelection(map,selected))return null;
    const targets=map.orders.filter(o=>selected.includes(o.id)),full=(1<<targets.length)-1;
    const transitions=new Map();
    function crossing(e,state){const id=e.id+':'+Number(state.dirty)+':'+state.wet;if(transitions.has(id))return transitions.get(id);let cost=0,stalled=false;for(let n=0;n<e.length;n++){const p=R.predictStep(model,e.type,state);cost+=p.energy;state=p.after;if(p.stalled){stalled=true;break;}}const r={state,cost,stalled};transitions.set(id,r);return r;}
    if(!targets.length)return null;
    const queue=[{node:'S',state:R.fresh(),mask:0,energy:0,route:['S']}],seen=new Set();
    while(queue.length){
      queue.sort((a,b)=>a.energy-b.energy||a.route.join('').localeCompare(b.route.join('')));
      const c=queue.shift(),key=c.node+':'+Number(c.state.dirty)+':'+c.state.wet+':'+c.mask;
      if(seen.has(key))continue;seen.add(key);
      if(c.mask===full&&c.node===map.start)return {...c,prediction:forecast(map,c.route,model),withinBudget:c.energy<=map.budget};
      for(const e of map.edges.filter(e=>e.a===c.node||e.b===c.node)){
        const {state,cost,stalled}=crossing(e,c.state),energy=c.energy+cost;
        if(stalled)continue;
        const node=e.a===c.node?e.b:e.a,mask=c.mask|targets.reduce((v,t,i)=>v|(t.node===node?1<<i:0),0);
        queue.push({node,state,energy,mask,route:[...c.route,node]});
      }
    }return null;
  }
  function outcome(map,selected,result,interrupted=false){
    const arrived=new Set(['S',...result.observations.filter(o=>o.fraction===1&&!o.stalled).map(o=>o.to)]);
    const delivered=map.orders.filter(o=>selected.includes(o.id)&&arrived.has(o.node)).map(o=>o.id);
    const returned=result.observations.at(-1)?.to===map.start&&result.observations.at(-1)?.fraction===1&&!result.observations.at(-1)?.stalled;
    const success=!interrupted&&validSelection(map,selected)&&delivered.length===selected.length&&result.finished&&returned;
    return {success,delivered,returned,stars:success?map.orders.filter(o=>selected.includes(o.id)).reduce((s,o)=>s+o.stars,0):0,reserve:success?map.budget-result.spent:0};
  }
  function measured(t){const m=t.kind==='experiment'?laboratory():district(t.round);return simulate(m,t.route).observations.slice(0,t.steps);}
  function model(trips){return R.train(trips.filter(t=>t.taught).flatMap(measured));}
  function actual(t){
    const m=t.kind==='experiment'?laboratory():district(t.round),full=simulate(m,t.route),observations=full.observations.slice(0,t.steps),all=t.steps===full.observations.length;
    return {...full,observations,spent:observations.reduce((s,o)=>s+o.energy,0),state:observations.at(-1)?.after||R.fresh(),finished:all&&full.finished&&t.ended&&!t.interrupted,stalled:!!observations.at(-1)?.stalled,exhausted:all&&full.exhausted&&t.ended&&!t.interrupted};
  }
  function score(trips){return trips.filter(t=>t.kind==='delivery'&&t.ended).reduce((s,t)=>{const r=outcome(district(t.round),t.selected,actual(t),t.interrupted);return {stars:s.stars+r.stars,reserve:s.reserve+r.reserve,deliveries:s.deliveries+(r.success?1:0)};},{stars:0,reserve:0,deliveries:0});}
  function validate(s){
    if(!s||s.rules!==VERSION||!Number.isInteger(s.round)||s.round<0||s.round>=ROUNDS||!['lab','district'].includes(s.view)||!Array.isArray(s.trips)||s.trips.length>9||!Array.isArray(s.selected)||!s.selected.every(id=>district(s.round).orders.some(o=>o.id===id))||new Set(s.selected).size!==s.selected.length||cargo(district(s.round),s.selected)>CAPACITY)return false;
    try{
      if(s.route.length>7) return false;steps(laboratory(),s.route);
      let round=0,experiments=0,previousCount=0;
      for(const t of s.trips){
        if(t.round!==round||t.round>s.round||!['experiment','delivery'].includes(t.kind)||typeof t.taught!=='boolean'||typeof t.ended!=='boolean'||typeof t.interrupted!=='boolean'||!Number.isInteger(t.steps))return false;
        const m=t.kind==='experiment'?laboratory():district(round);
        if(t.kind==='experiment'){if(++experiments>EXPERIMENTS||t.route.length>7||t.route.length<2)return false;}
        else{
          if(!validSelection(m,t.selected)||t.route.at(-1)!==m.start)return false;
        }
        const full=simulate(m,t.route);if(t.steps<0||t.steps>full.observations.length||(t.ended&&!t.interrupted&&t.steps!==full.observations.length)||(!t.ended&&t!==s.trips.at(-1))||t.taught&&!t.ended)return false;
        // Freeze the training boundary for each trip; later teaching must not rewrite its decision.
        if(!Array.isArray(t.learned)||new Set(t.learned).size!==t.learned.length||t.learned.some(i=>!Number.isInteger(i)||i<0||i>=previousCount||!s.trips[i].taught||!s.trips[i].ended))return false;
        previousCount++;
        if(t.kind==='delivery'){round++;experiments=0;}
        // Next prediction uses its explicit snapshot, checked separately below.
      }
      for(let i=0;i<s.trips.length;i++){
        const t=s.trips[i];if(t.kind!=='delivery')continue;
        const learned=R.train(t.learned.flatMap(j=>measured(s.trips[j]))),p=plan(district(t.round),t.selected,learned);
        if(!p||JSON.stringify(p.route)!==JSON.stringify(t.route))return false;
      }
      const completed=s.trips.filter(t=>t.kind==='delivery').length;
      if(s.round>completed||s.round<Math.max(0,completed-1))return false;
      return true;
    }catch{return false;}
  }
  const api={VERSION,ROUNDS,EXPERIMENTS,CAPACITY,MAX_STARS,cargo,validSelection,district,laboratory,steps,forecast,simulate,plan,outcome,measured,model,actual,score,validate};root.RobotDelivery=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
