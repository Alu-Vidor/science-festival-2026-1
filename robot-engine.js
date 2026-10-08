/* Authored expeditions, learner's route planner and an independent exact energy benchmark. */
(function (root) {
  'use strict';
  const N = 12, costs = { road: 1, sand: 2, mud: 3, hill: 4, water: 5 };
  const danger = f => f[0] >= 70 || f[1] >= 70 || f[0] + f[2] >= 110 || f[3] <= 30;
  const bases = { road: [15, 10, 15, 90], wall: [0, 0, 0, 100], mud: [58, 12, 49, 55], hill: [18, 45, 35, 80], water: [78, 5, 20, 15], sand: [12, 8, 25, 55] };
  function tile(type, i, f) { const d = (i * 17 % 13) - 6; return { type, f: f ? [...f] : bases[type].map((v, j) => Math.round(Math.max(0, Math.min(100, v + d * (j + 1) / 2)))), object: null }; }
  function features(cell, rain = false) { const f = [...cell.f]; f[0] = Math.min(100, f[0] + (rain ? 25 : 0)); return f; }
  function neighbors(i, grid) { return [i % N ? i - 1 : -1, i % N < N - 1 ? i + 1 : -1, i >= N ? i - N : -1, i < N * (N - 1) ? i + N : -1].filter(j => j >= 0 && grid[j].type !== 'wall'); }
  function predict(model, f) { const near = model.map(s => ({ y: s.y, d: s.f.reduce((sum, v, j) => sum + (v - f[j]) ** 2, 0) })).sort((a, b) => a.d - b.d).slice(0, 3); return near.length ? near.reduce((s, x) => s + x.y, 0) / near.length >= .5 : false; }
  function shortest(grid, start, goal, { rain = false, model = [], mode = 'energy', oracle = false, useAI = true } = {}) {
    const dist = Array(144).fill(Infinity), prev = Array(144).fill(-1), done = new Set(); dist[start] = 0;
    for (let k = 0; k < 144; k++) {
      let u = -1; for (let i = 0; i < 144; i++) if (!done.has(i) && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || !Number.isFinite(dist[u])) return null;
      if (u === goal) { const path = []; for (let v = goal; v !== start; v = prev[v]) path.unshift(v); return path; }
      done.add(u);
      for (const v of neighbors(u, grid)) {
        if (oracle ? danger(features(grid[v], rain)) : useAI && predict(model, features(grid[v], rain))) continue;
        const next = dist[u] + (mode === 'steps' ? 1 : costs[grid[v].type]);
        if (next < dist[v]) { dist[v] = next; prev[v] = u; }
      }
    }
    return null;
  }
  function permutations(a) { return a.length ? a.flatMap((v, i) => permutations(a.filter((_, j) => i !== j)).map(p => [v, ...p])) : [[]]; }
  // Positive additive energy costs: minimizing over all goal orders and shortest safe
  // segments is exact, including paths which collect another parcel on the way.
  function optimum(mission) {
    const goals = mission.grid.flatMap((c, i) => c.object === 'parcel' ? [i] : []); let best = null;
    for (const order of permutations(goals)) {
      let pos = mission.start, path = [], valid = true; const remaining = new Set(goals);
      for (const goal of order) {
        if (!remaining.has(goal)) continue;
        const segment = shortest(mission.grid, pos, goal, { rain: mission.rain, oracle: true });
        if (!segment) { valid = false; break; }
        path.push(...segment); segment.forEach(i => remaining.delete(i)); pos = goal;
      }
      const energy = path.reduce((sum, i) => sum + costs[mission.grid[i].type], 0);
      if (valid && (!best || energy < best.energy || energy === best.energy && path.length < best.path.length)) best = { energy, path, order };
    }
    return best;
  }
  function create(id) {
    const grid = Array.from({ length: 144 }, (_, i) => tile('road', i));
    const set = (x, y, type, f) => { const i = y * N + x; grid[i] = tile(type, i, f); };
    let parcelNumber = 0;
    const parcel = (x, y) => { set(x, y, 'road'); grid[y * N + x].object = 'parcel'; grid[y * N + x].parcel = String.fromCharCode(65 + parcelNumber++); };
    let start = 60, rain = false, budget = 60;
    if (id === 'training') {
      for (let y = 0; y < N; y++) if (y !== 5 && y !== 9) set(5, y, 'wall');
      for (const i of [61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 80, 81, 82, 93, 94]) grid[i] = tile('mud', i);
      for (const i of [19, 20, 31, 32, 43, 44, 105, 106, 117, 118]) grid[i] = tile('hill', i);
      grid[19].f[1] = 78; grid[32].f[1] = 76; grid[44].f[1] = 74;
      for (const i of [14, 15, 16, 26, 27, 28]) grid[i] = tile('sand', i);
      grid[14].f[3] = 27; grid[27].f[3] = 29;
      for (const i of [86, 87, 98, 99, 110]) grid[i] = tile('water', i);
      parcel(11, 1); parcel(11, 5); parcel(11, 10);
    } else {
      for (let x = 0; x < N; x++) { set(x, 0, 'wall'); set(x, 11, 'wall'); }
      for (let y = 1; y < 11; y++) { set(0, y, 'wall'); set(11, y, 'wall'); }
      if (id === 'forest') {
        start = 61; budget = 70;
        for (let y = 1; y < 11; y++) if (y !== 2 && y !== 8) set(5, y, 'wall');
        for (let x = 2; x <= 9; x++) set(x, 5, 'mud', [62, 12, 54, 65]);
        for (let x = 2; x <= 8; x++) set(x, 2, 'sand', [14, 8, 22, 60]);
        for (let x = 2; x <= 8; x++) set(x, 8, 'mud', [38, 12, 35, 70]);
        parcel(10, 2); parcel(9, 9);
      } else if (id === 'gorge') {
        start = 13; budget = 100;
        for (let x = 2; x < 10; x++) if (x !== 3 && x !== 8) set(x, 5, 'wall');
        for (let y = 1; y <= 9; y++) set(6, y, 'hill', [18, 48, 32, 85]);
        for (const [x, y] of [[6, 2], [6, 7], [8, 5]]) set(x, y, 'hill', [18, 78, 32, 85]);
        for (let y = 6; y <= 9; y++) for (let x = 2; x <= 4; x++) set(x, y, 'sand', [12, 8, 24, 55]);
        set(3, 7, 'sand', [12, 8, 24, 25]); set(4, 9, 'sand', [12, 8, 24, 28]);
        parcel(10, 1); parcel(10, 10); parcel(1, 9);
      } else if (id === 'rain') {
        start = 109; rain = true; budget = 90;
        for (let y = 1; y <= 9; y++) if (y !== 3 && y !== 8) set(5, y, 'wall');
        for (let x = 2; x <= 9; x++) set(x, 3, 'mud', [48, 10, 40, 65]);
        for (let x = 2; x <= 9; x++) set(x, 8, 'mud', [58, 10, 48, 65]);
        for (let x = 6; x <= 9; x++) set(x, 6, 'sand', [12, 8, 24, 60]);
        for (const [x, y] of [[2, 6], [3, 6], [8, 4]]) set(x, y, 'water');
        parcel(10, 2); parcel(2, 2); parcel(10, 9);
      } else throw Error('Unknown expedition: ' + id);
    }
    grid[start] = tile('road', start);
    return { id, grid, start, rain, budget, ...descriptions[id] };
  }
  const descriptions = {
    training: { title: 'Учебный полигон', brief: 'Изучи участки, поставь метки и обучи ИИ. Здесь можно ошибаться.', max: 0 },
    forest: { title: 'Лесная доставка', brief: 'Обойди опасную грязь. Сравни порядок A–B и B–A и расход энергии.', max: 10 },
    gorge: { title: 'Каменистое ущелье', brief: 'Проверь склоны и песок. Короткий путь может расходовать больше энергии.', max: 15 },
    rain: { title: 'После ливня', brief: 'Дождь изменил влажность. Обнови примеры и выбери экономный порядок доставки.', max: 25 }
  };
  function score({ max, delivered, parcels, energy, optimal, complete }) {
    if (!max || !parcels) return 0;
    const delivery = Math.floor(max * .6 * Math.min(delivered, parcels) / parcels);
    if (!complete || delivered !== parcels || !Number.isFinite(optimal) || energy < optimal) return delivery;
    if (energy === optimal) return max;
    // Every nonoptimal complete path scores strictly below the maximum.
    return Math.min(max - 1, Math.max(delivery, Math.floor(max * (.6 + .4 * optimal / energy))));
  }
  root.RobotEngine = { N, costs, danger, tile, features, predict, shortest, optimum, permutations, create, score, ids: ['training', 'forest', 'gorge', 'rain'] };
  if (typeof module !== 'undefined') module.exports = root.RobotEngine;
})(typeof window !== 'undefined' ? window : globalThis);
