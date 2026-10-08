/* Fixed tasks and reproducible scoring shared by both games and Node checks. */
(function (root) {
  'use strict';
  const M = root.Mayor || (typeof require === 'function' ? require('./mayor.js') : null);
  const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
  const VERSION = 'city-experiments-20261008-1';
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
  function total({ robot = 0, city = 0 } = {}) {
    return clamp(robot, 0, 50) + clamp(city, 0, 50);
  }
  root.GameScore = { VERSION, cityChoices, cityDefaults, cityPolicy, cityRun, total };
  if (typeof module !== 'undefined') module.exports = root.GameScore;
})(typeof window !== 'undefined' ? window : globalThis);
