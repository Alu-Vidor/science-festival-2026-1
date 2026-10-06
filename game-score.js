/* Fixed tasks and reproducible scoring shared by both games and Node checks. */
(function (root) {
  'use strict';
  const M = root.Mayor || (typeof require === 'function' ? require('./mayor.js') : null);
  const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
  const VERSION = 'missions-20261006-1';
  const cityChoices = {
    school: [['normal', 'Все вместе', 'Обычные занятия и работа.'], ['shifts', 'Две смены', 'Группы встречаются отдельно. Организация стоит дороже.'], ['remote', 'Дома', 'Меньше встреч. Не все могут работать и учиться дома.']],
    bus: [['normal', 'Обычные рейсы', '40 мест на каждый этап поездок.'], ['frequent', 'Больше рейсов', '60 мест. Меньше пропущенных поездок, больше расходов.'], ['reduced', 'Меньше рейсов', '20 мест. Дешевле, но дальним кварталам сложнее добраться.']],
    shops: [['both', 'Оба магазина', 'Семьи могут выбрать магазин или торговый центр.'], ['long', 'Дольше открыты', 'Больше мест, меньше скученность. Выше расходы.'], ['one', 'Только магазин', 'Меньше открытых мест. Покупатели собираются в одном магазине.']]
  };
  const cityDefaults = () => ({ school: 'normal', bus: 'normal', shops: 'both' });
  function cityPolicy(plan) {
    for (const [key, values] of Object.entries(cityChoices)) if (!values.some(v => v[0] === plan[key])) throw Error('Выбери решение: ' + key);
    return { ...M.policy(), school: plan.school, kindergarten: plan.school, work: plan.school,
      bus: plan.bus, market: plan.shops === 'long' ? 'long' : 'normal',
      mall: plan.shops === 'one' ? 'closed' : plan.shops === 'long' ? 'long' : 'normal' };
  }
  function citySimulate(plan) {
    const policy = cityPolicy(plan), districts = M.setup().map((d, i) => ({ ...d, far: [1, 2, 4, 5].includes(i) }));
    let game = M.create({ seed: 17, districts, contactScale: .35, shopSeats: { market: 8, mall: 14 } });
    for (let day = 0; day < 14; day++) game = M.step(game, policy);
    const average = key => game.reports.reduce((s, r) => s + r[key], 0) / game.day;
    const total = game.states.filter(x => x !== 'S').length;
    const care = game.reports.reduce((s, r) => s + r.care, 0);
    const treated = game.reports.reduce((s, r) => s + r.treated, 0);
    return { game, average, total, care, treated };
  }
  let baselineTotal;
  function cityRun(plan) {
    const { game, average, total, care, treated } = citySimulate(plan);
    if (baselineTotal === undefined) baselineTotal = citySimulate(cityDefaults()).total;
    const healthPoints = 20 * clamp((baselineTotal - total) / Math.max(1, baselineTotal - 3), 0, 1);
    const foodPoints = 10 * average('food') / 100;
    const activityPoints = 10 * average('participation') / 100;
    const carePoints = 5 * (care ? treated / care : 1);
    const budgetPoints = 5 * clamp(1 + Math.min(0, game.cash) / 300, 0, 1);
    const basicNeedsMet = average('food') >= 80 && average('participation') >= 70;
    return { version: VERSION, game, plan: { ...plan }, basicNeedsMet,
      score: Math.round(clamp(healthPoints + foodPoints + activityPoints + carePoints + budgetPoints, 0, basicNeedsMet ? 50 : 25)),
      total, peak: Math.max(1, ...game.reports.map(r => r.infectious)), food: Math.round(average('food')),
      activity: Math.round(average('participation')), missed: Math.round(average('missed')),
      queue: Math.round(average('queue')), cash: game.cash, care, treated };
  }
  const danger = f => f[0] >= 70 || f[1] >= 70 || f[0] + f[2] >= 110 || f[3] <= 30;
  // These eight feature vectors do not occur on the original training map.
  const robotChecks = [[13, 9, 12, 88], [55, 7, 42, 46], [17, 61, 32, 79], [10, 7, 24, 39],
    [79, 4, 22, 17], [61, 15, 55, 59], [22, 78, 44, 90], [11, 8, 28, 27]];
  function predict(model, f) {
    const nearest = model.map(s => ({ y: s.y, d: s.f.reduce((sum, v, j) => sum + (v - f[j]) ** 2, 0) }))
      .sort((a, b) => a.d - b.d).slice(0, 3);
    return nearest.length ? nearest.reduce((s, v) => s + v.y, 0) / nearest.length >= .5 : false;
  }
  function robotQuality(model) {
    if (!Array.isArray(model) || model.filter(s => s.y === 0).length < 3 || model.filter(s => s.y === 1).length < 3) return { score: 0, correct: 0, ready: false };
    const correct = robotChecks.filter(f => predict(model, f) === danger(f)).length;
    return { score: Math.round(20 * correct / robotChecks.length), correct, ready: true };
  }
  function total({ training = 0, delivery = 0, city = 0 } = {}) {
    return clamp(training, 0, 20) + clamp(delivery, 0, 30) + clamp(city, 0, 50);
  }
  root.GameScore = { VERSION, cityChoices, cityDefaults, cityPolicy, cityRun, robotQuality, robotChecks, danger, predict, total };
  if (typeof module !== 'undefined') module.exports = root.GameScore;
})(typeof window !== 'undefined' ? window : globalThis);
