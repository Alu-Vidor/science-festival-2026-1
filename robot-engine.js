/* Authored expeditions, learner's route planner and an independent exact energy benchmark. */
(function (root) {
  'use strict';
  const N = 12, costs = { road: 1, sand: 2, mud: 3, hill: 4, water: 4, gravel: 2, grass: 2, clay: 3, ice: 2 };
  const names = { road: 'Дорога', sand: 'Песок', mud: 'Грязь', hill: 'Склон', water: 'Брод', gravel: 'Щебень', grass: 'Трава', clay: 'Глина', ice: 'Лёд' };
  const icons = { road: '·', sand: '∴', mud: '≋', hill: '▲', water: '≈', gravel: '◇', grass: '♧', clay: '▰', ice: '❄', wall: '▧' };
  const profiles = {
    road: [[12,8,12,90],[12,8,12,24]], sand: [[18,10,24,60],[18,10,24,24]],
    mud: [[40,15,34,68],[62,15,53,68]], hill: [[15,48,30,85],[15,78,30,85]],
    water: [[55,8,15,80],[80,8,15,80]], gravel: [[12,28,60,88],[52,28,65,80]],
    grass: [[35,8,28,75],[35,8,28,24]], clay: [[40,25,45,75],[69,25,48,75]],
    ice: [[30,15,8,70],[30,76,8,70]]
  };
  const danger = f => f[0] >= 70 || f[1] >= 70 || f[0] + f[2] >= 110 || f[3] <= 30;
  function tile(type, i, f) { return { type, f: [...(f || profiles[type]?.[0] || [0,0,0,100])], object: null }; }
  function features(cell, rain = false) { const f = [...cell.f]; f[0] = Math.min(100, f[0] + (rain ? 25 : 0)); return f; }
  function neighbors(i, grid) { return [i % N ? i - 1 : -1, i % N < N - 1 ? i + 1 : -1, i >= N ? i - N : -1, i < N * (N - 1) ? i + N : -1].filter(j => j >= 0 && grid[j].type !== 'wall'); }
  // The model only receives the child's examples and four sensor readings.
  // No terrain name, physical rule or hidden answer enters this classifier.
  function explain(model, f) {
    const near = model.map(s => ({ ...s, distance: Math.sqrt(s.f.reduce((sum,v,j) => sum + (v-f[j])**2,0)) }))
      .sort((a,b) => a.distance-b.distance).slice(0,3);
    if (!near.length || near[0].distance > 23) return { label: null, near, reason: 'Нет похожих примеров' };
    if (near[0].distance < .01) return { label: near[0].y, near, reason: 'Такие показания уже были в обучении' };
    const weights=near.map(s=>1/(1+s.distance**2)), total=weights.reduce((a,b)=>a+b,0);
    const risk=near.reduce((sum,s,i)=>sum+weights[i]*s.y,0)/total;
    return { label: risk > .35 && risk < .65 ? null : +(risk >= .5), near, reason: risk > .35 && risk < .65 ? 'Похожие примеры противоречат друг другу' : 'Сравнение с тремя ближайшими примерами', risk };
  }
  function predict(model, f) { return explain(model,f).label; }
  function shortest(grid, start, goal, { rain = false, model = [], mode = 'energy', oracle = false, useAI = true } = {}) {
    const dist = Array(144).fill(Infinity), prev = Array(144).fill(-1), done = new Set(); dist[start] = 0;
    for (let k = 0; k < 144; k++) {
      let u = -1; for (let i = 0; i < 144; i++) if (!done.has(i) && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || !Number.isFinite(dist[u])) return null;
      if (u === goal) { const path = []; for (let v = goal; v !== start; v = prev[v]) path.unshift(v); return path; }
      done.add(u);
      for (const v of neighbors(u, grid)) {
        if (oracle ? danger(features(grid[v], rain)) : useAI && predict(model, features(grid[v], rain)) !== 0) continue;
        const next = dist[u] + (mode === 'steps' ? 1 : costs[grid[v].type]);
        if (next < dist[v]) { dist[v] = next; prev[v] = u; }
      }
    }
    return null;
  }
  function permutations(a) { return a.length ? a.flatMap((v, i) => permutations(a.filter((_, j) => i !== j)).map(p => [v, ...p])) : [[]]; }
  // Positive additive energy costs: minimizing over all goal orders and shortest safe
  // segments is exact, including paths which collect another parcel on the way.
  function plan(mission, model, options = {}) {
    const goals = mission.grid.flatMap((c, i) => c.object === 'parcel' ? [i] : []); let best = null;
    for (const order of permutations(goals)) {
      let pos = mission.start, path = [], valid = true; const remaining = new Set(goals);
      for (const goal of order) {
        if (!remaining.has(goal)) continue;
        const segment = shortest(mission.grid, pos, goal, { rain: mission.rain, model, oracle: !!options.oracle, useAI: options.useAI !== false });
        if (!segment) { valid = false; break; }
        path.push(...segment); segment.forEach(i => remaining.delete(i)); pos = goal;
      }
      const energy = path.reduce((sum, i) => sum + costs[mission.grid[i].type], 0);
      if (valid && (!best || energy < best.energy || energy === best.energy && path.length < best.path.length)) best = { energy, path, order };
    }
    return best;
  }
  function optimum(mission) { return plan(mission, [], { oracle: true }); }
  const descriptions = {
    training: { title: 'Школа робота', brief: 'Одно покрытие — разные свойства. Проверь грунт, поставь метку и научи робота узнавать новые участки.', max: 0 },
    forest: { title: 'Лесные развилки', brief: 'Три груза за разными проходами. ИИ сам выбирает порядок и экономный маршрут по твоим примерам.', max: 10 },
    gorge: { title: 'Каменный лабиринт', brief: 'Короткие перемычки обманчивы: одинаковые склоны и щебень могут оказаться опасными.', max: 15 },
    rain: { title: 'Мокрая долина', brief: 'После дождя показания изменились. Проверь, какие решения ИИ нужно исправить.', max: 25 }
  };
  function create(id) {
    if (!descriptions[id]) throw Error('Unknown expedition: '+id);
    const types=Object.keys(profiles), seed={training:1,forest:7,gorge:19,rain:31}[id], rain=id==='rain';
    const grid=Array.from({length:144},(_,i)=>tile('road',i));
    const variation=(i,j)=>((i*13+j*7+seed)%5)-2;
    const set=(i,type,bad=false)=>{
      const f=profiles[type][+bad].map((v,j)=>Math.max(0,Math.min(100,v+variation(i,j))));
      // Some wet ground stays usable after rain; others become traps.
      if(rain&&!bad&&danger(features({f},true)))f[0]=Math.max(0,f[0]-25);
      grid[i]=tile(type,i,f);
    };
    let start=id==='training'?0:id==='gorge'?13:121;
    for(let i=0;i<144;i++){
      const x=i%12,y=i/12|0;
      if(id==='training') { const type=types[(y/4|0)*3+(x/4|0)]; grid[i]=tile(type,i,profiles[type][+(x%4>=2&&y%4!==3)]); continue; }
      const boundary=x===0||x===11||y===0||y===11;
      const wall=id==='forest' ? x===4&&![2,7,9].includes(y)||x===8&&![1,5,9].includes(y)
        :id==='gorge'? y===4&&![2,7,9].includes(x)||y===8&&![1,5,9].includes(x)||x===6&&y>4&&y<8&&y!==6
        : x===5&&![2,6,9].includes(y)||y===5&&![2,7,9].includes(x);
      if(boundary||wall)grid[i]=tile('wall',i);
      else set(i,types[(x*7+y*11+seed)%types.length]);
    }
    const goals=id==='training'?[45,93,141]:id==='forest'?[22,82,130]:id==='gorge'?[21,118,121]:[14,46,130];
    const guaranteed=new Set([start,...goals]);
    // Add traps only while the safe landscape still connects every usable cell.
    // Keep traps sparse enough to preserve useful bypasses, not just a connected tree.
    // Model mistakes can then cause a longer delivery rather than only block it.
    if(id!=='training')for(let i=0;i<144;i++){
      if(grid[i].type==='wall'||guaranteed.has(i)||(i*17+seed)%7>0)continue;
      const before=grid[i];set(i,before.type,true);
      const seen=new Set([start]), queue=[start];
      for(let k=0;k<queue.length;k++)for(const j of neighbors(queue[k],grid))if(!seen.has(j)&&!danger(features(grid[j],rain))){seen.add(j);queue.push(j);}
      if(grid.some((c,j)=>c.type!=='wall'&&!danger(features(c,rain))&&!seen.has(j)))grid[i]=before;
    }
    // Parcels preserve the local material instead of advertising a safe road.
    goals.forEach((i,n)=>{ if(grid[i].type==='wall')set(i,'gravel'); if(danger(features(grid[i],rain)))set(i,grid[i].type); grid[i].object='parcel';grid[i].parcel=String.fromCharCode(65+n); });
    if(grid[start].type==='wall')set(start,'road');
    return { id, grid, start, rain, budget: 240, ...descriptions[id] };
  }
  function examples() { return Object.entries(profiles).flatMap(([type,pair])=>pair.map((f,y)=>({f:[...f],y,type}))); }
  function score({ max, delivered, parcels, energy, optimal, complete }) {
    if (!max || !parcels) return 0;
    const delivery = Math.floor(max * .6 * Math.min(delivered, parcels) / parcels);
    if (!complete || delivered !== parcels || !Number.isFinite(optimal) || energy < optimal) return delivery;
    if (energy === optimal) return max;
    // Every nonoptimal complete path scores strictly below the maximum.
    return Math.min(max - 1, Math.max(delivery, Math.floor(max * (.6 + .4 * optimal / energy))));
  }
  root.RobotEngine = { N, costs, danger, tile, features, predict, explain, shortest, plan, optimum, permutations, create, examples, names, icons, profiles, score, ids: ['training', 'forest', 'gorge', 'rain'] };
  if (typeof module !== 'undefined') module.exports = root.RobotEngine;
})(typeof window !== 'undefined' ? window : globalThis);
