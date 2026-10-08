/* A persistent twelve-day city: three rounds, restricted projects, visible goals. */
(function (root) {
  'use strict';
  const M = root.Mayor || require('./mayor.js');
  const S = root.GameScore || require('./game-score.js');
  const clone = value => JSON.parse(JSON.stringify(value));
  const rounds = [
    { id: 'travel', title: 'Утренний час пик', brief: 'Дальним кварталам нужны поездки. Сравни расписание, рейсы и расходы.', max: 10,
      cases: 2, food: 95, activity: 90, comfort: 75, expense: 440, weights: [3, 2, 3, 0, 1, 1] },
    { id: 'supply', title: 'Задержка поставок', brief: 'Четыре дня в магазинах меньше продуктов. Домашние запасы переходят из прошлого раунда.', max: 15,
      cases: 2, food: 95, activity: 90, comfort: 75, expense: 510, weights: [4, 4, 3, 0, 1, 3] },
    { id: 'care', title: 'Холод и помощь', brief: 'После поездки вернутся заболевшие. Симптомы появятся позже. Подготовь помощь и следи за поездками.', max: 25,
      cases: 4, food: 95, activity: 90, comfort: 75, care: 90, expense: 470, weights: [6, 4, 4, 6, 2, 3] }
  ];
  const projects = ['bus', 'market', 'clinic'];
  const projectFunds = 200;
  const choices = S.cityChoices;
  function create() {
    const schedule = {};
    for (let day = 5; day <= 8; day++) schedule[day] = { title: 'Задержка поставок', text: 'Меньше товаров в обоих магазинах.', kind: 'delivery' };
    for (let day = 9; day <= 12; day++) schedule[day] = { title: day === 9 ? 'Холод и заболевшие гости' : 'Похолодание', text: 'Жители выбирают отдых в помещении. Больнице нужна готовность.', kind: 'cold' };
    const districts = M.setup().map((d, i) => ({ ...d, far: [1, 2, 4, 5].includes(i) }));
    const game = M.create({ seed: 17, districts, maxDays: 12, contactScale: .35, healthcareBeds: 1,
      shopSeats: { market: 6, mall: 10 }, eventSchedule: schedule, recordCitizens: true });
    return { game, funds: projectFunds, projects: [], results: [], score: 0, completed: false, incoming: [] };
  }
  function current(c) { return rounds[Math.min(2, Math.floor(c.game.day / 4))]; }
  function invest(c, id) {
    if (!projects.includes(id)) throw Error('Это улучшение недоступно в испытании.');
    if (c.completed) throw Error('Город завершён. Начни новое прохождение.');
    if (c.projects.includes(id)) throw Error('Это улучшение уже построено.');
    const cost = M.upgrades[id].cost;
    if (c.funds < cost) throw Error('Недостаточно средств в фонде улучшений.');
    const out = clone(c), cash = out.game.cash;
    // The fixed project grant pays construction; operating income cannot refill it.
    out.game = M.invest({ ...out.game, cash: Math.max(cash, cost) }, id);
    out.game.cash = cash;
    out.funds -= cost; out.projects.push(id);
    return out;
  }
  function measure(c, index) {
    const goal = rounds[index], days = c.game.reports.slice(index * 4, index * 4 + 4);
    if (!days.length) return null;
    const avg = key => days.reduce((sum, r) => sum + r[key], 0) / days.length;
    const care = days.reduce((sum, r) => sum + r.care, 0), treated = days.reduce((sum, r) => sum + r.treated, 0);
    const cases = c.game.history.filter(h => h.day > index * 4 && h.day <= index * 4 + 4).reduce((sum, h) => sum + h.exposures.length, 0);
    const expense = days.reduce((sum, r) => sum + r.expenses, 0);
    return { days: days.length, cases, food: avg('food'), activity: avg('participation'), comfort: avg('happiness'), care: care ? treated / care * 100 : 100, expense };
  }
  function report(c, index) {
    const goal = rounds[index], stats = measure(c, index);
    if (!stats || stats.days !== 4) throw Error('Раунд ещё не завершён.');
    const { cases, expense } = stats;
    const met = [cases <= goal.cases, stats.food >= goal.food, stats.activity >= goal.activity,
      !goal.care || stats.care >= goal.care, stats.comfort >= goal.comfort, expense <= goal.expense];
    const ratios = [cases ? Math.min(1, goal.cases / cases) : 1, Math.min(1, stats.food / goal.food),
      Math.min(1, stats.activity / goal.activity), goal.care ? Math.min(1, stats.care / goal.care) : 1,
      Math.min(1, stats.comfort / goal.comfort), Math.min(1, goal.expense / expense)];
    const full = met.every(Boolean);
    const raw = Math.floor(goal.weights.reduce((sum, weight, i) => sum + weight * ratios[i], 0) + 1e-9);
    return { index, ...stats, score: full ? goal.max : Math.min(goal.max - 1, raw), full, met };
  }
  function advance(c, plan) {
    if (c.completed) throw Error('Город завершён. Начни новое прохождение.');
    const policy = S.cityPolicy(plan), out = clone(c), day = c.game.day + 1;
    // Announced, reproducible external arrivals. They are not counted as local transmissions.
    if (day === 9) {
      for (let district = 0; district < 4; district++) {
        const i = out.game.people.findIndex((p, i) => p.district === district && p.senior && out.game.states[i] === 'S');
        if (i >= 0) { out.game.states[i] = 'E'; out.game.exposed[i] = 8; out.incoming.push(i); }
      }
    }
    out.game.shopSeats = day >= 5 && day <= 8 ? { market: 4.2, mall: 7 } : { market: 6, mall: 10 };
    out.game = M.step(out.game, policy);
    if (day % 4 === 0) out.results.push(report(out, day / 4 - 1));
    out.score = out.results.reduce((sum, r) => sum + r.score, 0);
    out.completed = day === 12;
    return out;
  }
  root.CityCampaign = { rounds, projects, projectFunds, choices, create, invest, advance, current, measure, report };
  if (typeof module !== 'undefined') module.exports = root.CityCampaign;
})(typeof window !== 'undefined' ? window : globalThis);
