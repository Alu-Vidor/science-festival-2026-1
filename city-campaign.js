/* A persistent twelve-day city: three rounds, restricted projects, visible goals. */
(function (root) {
  'use strict';
  const M = root.Mayor || require('./mayor.js');
  const S = root.GameScore || require('./game-score.js');
  const clone = value => JSON.parse(JSON.stringify(value));
  const rounds = [
    { id: 'travel', focus: 'activity', task: 'Дети и взрослые должны добраться на занятия и работу', title: 'Утренний час пик', brief: 'Час пик: дальним кварталам нужны автобусы. Впереди задержка поставок, затем обращения за помощью.', max: 3,
      food: 95, activity: 90, expense: 324 },
    { id: 'supply', focus: 'food', task: 'Обеспечь жителей продуктами', title: 'Задержка поставок', brief: 'На 4 дня снижена вместимость магазинов. Запасы из прошлого раунда сохраняются. Скоро понадобится помощь заболевшим.', max: 3,
      food: 95, activity: 90, expense: 388 },
    { id: 'care', focus: 'care', task: 'Организуй помощь заболевшим', title: 'Холод и помощь', brief: 'После поездки вернутся заболевшие. Симптомы появятся позже. Подготовь помощь и следи за поездками.', max: 3,
      food: 95, activity: 90, care: 90, expense: 348 }
  ];
  const projects = ['bus', 'market', 'clinic'];
  const projectFunds = 200, VERSION='city-experiments-1', MAX_STARS=9;
  const choices = {...S.cityChoices,bus:[['frequent','Утро','60 мест утром, 12 к службам; 40 на отдых.'],['normal','Смешанно','50 мест утром, 22 к службам; 40 на отдых.'],['reduced','Службы','40 мест утром, 32 к службам; 40 на отдых.']]};
  choices.school=choices.school.map(([v,t,h])=>[v,t,h+(v==='shifts'?' +24 монеты/день, +25% утренних мест.':v==='remote'?' −10 монет/день; не все могут заниматься дома.':'')]);
  choices.shops=choices.shops.map(([v,t,h])=>[v,t,h+(v==='long'?' +16 монет/день.':v==='one'?' −12 монет/день, торговый центр закрыт.':'')]);
  const allocations={frequent:[60,12,40],normal:[50,22,40],reduced:[40,32,40]};
  function policy(plan){return {...S.cityPolicy(plan),bus:'normal',busAllocation:allocations[plan.bus],shopSaving:plan.shops==='one'?12:0};}
  function dailyExpense(c,plan){return M.dailyCost(c.game.infrastructure,policy(plan));}
  function create() {
    const schedule = {};
    for (let day = 5; day <= 8; day++) schedule[day] = { title: 'Задержка поставок', text: 'Меньше товаров в обоих магазинах.', kind: 'delivery' };
    for (let day = 9; day <= 12; day++) schedule[day] = { title: day === 9 ? 'Холод и заболевшие гости' : 'Похолодание', text: 'Жители выбирают отдых в помещении. Больнице нужна готовность.', kind: 'cold' };
    const districts = M.setup().map((d, i) => ({ ...d, far: [1, 2, 4, 5].includes(i) }));
    const game = M.create({ seed: 17, districts, maxDays: 12, contactScale: .15, healthcareBeds: 1,
      shopSeats: { market: 6, mall: 10 }, eventSchedule: schedule, recordCitizens: true });
    return { game, funds: projectFunds, projects: [], results: [], score: 0, completed: false, incoming: [] };
  }
  function current(c) { return rounds[Math.min(2, Math.floor(c.game.day / 4))]; }
  function invest(c, id) {
    if(c.game.day%4)throw Error('Улучшения меняются между раундами.');
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
  function refund(c, id) {
    if(c.game.day%4)throw Error('Улучшения меняются между раундами.');
    if (c.completed) throw Error('Город завершён. Начни новое прохождение.');
    if (!projects.includes(id) || !c.projects.includes(id)) throw Error('В это улучшение монеты не вложены.');
    const out = clone(c), cost = M.upgrades[id].cost;
    out.projects = out.projects.filter(project => project !== id);
    out.funds += cost; out.game.infrastructure[id]--;
    out.game.investments.push({ day: out.game.day, id, cost: -cost, action: 'refund', level: out.game.infrastructure[id] });
    return out;
  }
  function measure(c, index) {
    const goal = rounds[index], days = c.game.reports.slice(index * 4, index * 4 + 4);
    if (!days.length) return null;
    const avg = key => days.reduce((sum, r) => sum + r[key], 0) / days.length;
    const care = days.reduce((sum, r) => sum + r.care, 0), treated = days.reduce((sum, r) => sum + r.treated, 0);
    const cases = c.game.history.filter(h => h.day > index * 4 && h.day <= index * 4 + 4).reduce((sum, h) => sum + h.exposures.length, 0);
    const expense = days.reduce((sum, r) => sum + r.expenses, 0);
    return { days: days.length, cases, food: avg('food'), activity: avg('participation'), comfort: avg('happiness'), care: care ? treated / care * 100 : 100, careRequests: care, careServed: treated, expense };
  }
  function checks(stats,index){
    const goal=rounds[index],main=stats && (goal.focus!=='care'||stats.careRequests>0) && stats[goal.focus]>=goal[goal.focus];
    const support=stats && (index===0?stats.food>=goal.food:index===1?stats.activity>=goal.activity:stats.food>=goal.food&&stats.activity>=goal.activity);
    const budget=stats && stats.expense<=goal.expense;
    const labels={activity:'Добрались на занятия и работу',food:'Жители обеспечены едой',care:'Обращения за помощью обслужены'};
    const number=(key)=>stats?stats[key].toFixed(1)+'%':'—';
    return [
      {key:goal.focus,title:'★ '+labels[goal.focus],target:'Не меньше '+goal[goal.focus]+'%',actual:goal.focus==='care'&&stats&&!stats.careRequests?'Пока нет обращений':number(goal.focus),met:!!main},
      {key:'support',title:'★★ Остальные службы справились',target:index===0?'Еда ≥95%':index===1?'Занятия и работа ≥90%':'Еда ≥95% · занятия и работа ≥90%',actual:index===0?number('food'):index===1?number('activity'):'Еда '+number('food')+' · занятия '+number('activity'),met:!!support},
      {key:'expense',title:'★★★ Уложились в бюджет',target:'Не больше '+goal.expense+' монет за 4 дня',actual:stats?stats.expense+' монет':'—',met:!!budget}
    ];
  }
  function report(c,index){
    const stats=measure(c,index);if(!stats||stats.days!==4)throw Error('Раунд ещё не завершён.');
    const met=checks(stats,index).map(x=>x.met),score=met[0]?(met[1]?(met[2]?3:2):1):0;
    return {index,...stats,score,full:score===3,primaryMet:met[0],met};
  }
  function round(c,plan){
    if(c.completed||c.game.day%4)throw Error('Нужен город перед началом раунда.');
    let out=c;for(let i=0;i<4;i++)out=advance(out,plan);return out;
  }
  function advance(c, plan) {
    if (c.completed) throw Error('Город завершён. Начни новое прохождение.');
    const p = policy(plan), out = clone(c), day = c.game.day + 1;
    // Announced, reproducible external arrivals. They are not counted as local transmissions.
    if (day === 9) {
      for (let district = 0; district < 4; district++) {
        const i = out.game.people.findIndex((p, i) => p.district === district && p.senior && out.game.states[i] === 'S');
        if (i >= 0) { out.game.states[i] = 'E'; out.game.exposed[i] = 8; out.incoming.push(i); }
      }
    }
    out.game.shopSeats = day >= 5 && day <= 8 ? { market: 4.2, mall: 7 } : { market: 6, mall: 10 };
    out.game = M.step(out.game,p);
    if (day % 4 === 0) out.results.push(report(out, day / 4 - 1));
    out.score = out.results.reduce((sum, r) => sum + r.score, 0);
    out.completed = day === 12;
    return out;
  }
  function replay(actions) {
    if (!Array.isArray(actions) || actions.length > 500) throw Error('Некорректная история города.');
    let campaign = create(); const starts = [];
    for (const action of actions) {
      if (action.kind === 'invest') campaign = invest(campaign, action.id);
      else if (action.kind === 'refund') campaign = refund(campaign, action.id);
      else if (action.kind === 'day') {
        for (const [key, values] of Object.entries(choices)) if (!values.some(([value]) => value === action.plan?.[key])) throw Error('Некорректный план.');
        if (campaign.game.day % 4 === 0) starts[campaign.game.day / 4] = campaign;
        campaign = advance(campaign, action.plan);
      } else throw Error('Неизвестное действие.');
    }
    return { campaign, starts };
  }
  function insights(c, index) {
    const days = c.game.reports.slice(index * 4, index * 4 + 4), stats = measure(c, index);
    if (!stats) return [];
    const sum = key => days.reduce((total, day) => total + day[key], 0);
    const missed = days.map(day => day.missed).join(' / '), queue = sum('queue');
    const travel = 'Не добрались по дням: ' + missed + ' жителей. Учёба и работа: ' + stats.activity.toFixed(1) + '%.';
    const supply = 'Еда: ' + stats.food.toFixed(1) + '%. ' + (queue ? 'Не обслужены в очередях магазинов: ' + queue + ' посещений.' : 'Очередей с отказом в магазинах не было.');
    const care = stats.careRequests ? 'Помощь получили ' + stats.careServed + ' из ' + stats.careRequests + ' обращений.' : 'Обращений за помощью пока не было.';
    const expense = 'Работа города: ' + stats.expense + ' монет за ' + days.length + ' дня; содержание улучшений: ' + sum('upkeep') + '.';
    return index === 0 ? [travel, supply, expense] : index === 1 ? [supply, travel, expense] : [care, 'Заражений внутри города: ' + stats.cases + '.', expense];
  }
  function cityScore(c) { return Math.floor(c.score*50/MAX_STARS); }
  function succeeded(c) { return c.completed && c.score===MAX_STARS; }
  root.CityCampaign = { VERSION,MAX_STARS,allocations,dailyExpense,checks,round,rounds, projects, projectFunds, choices, create, invest, refund, advance, current, measure, report, replay, insights, cityScore, succeeded };
  if (typeof module !== 'undefined') module.exports = root.CityCampaign;
})(typeof window !== 'undefined' ? window : globalThis);
