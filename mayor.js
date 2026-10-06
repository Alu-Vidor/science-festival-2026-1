(function (root) {
  'use strict';
  const E = root.Epidemic || (typeof require === 'function' ? require('./epidemic.js') : null);
  const clamp = (x, min = 0, max = 100) => Math.max(min, Math.min(max, x));
  const modes = {
    school: ['normal', 'shifts', 'remote'], kindergarten: ['normal', 'shifts', 'remote'],
    work: ['normal', 'shifts', 'limited', 'remote', 'closed'], market: ['normal', 'limited', 'long', 'closed'],
    mall: ['normal', 'limited', 'long', 'closed'], bus: ['normal', 'frequent', 'reduced', 'closed'],
    park: ['normal', 'closed'], gym: ['normal', 'limited', 'closed'], clinic: ['normal', 'appointments', 'closed']
  };
  const upgrades = {
    bus: { title: 'Новые автобусы', cost: 90, upkeep: 5, effect: '+20 мест на каждом этапе поездок' },
    market: { title: 'Расширить магазин', cost: 80, upkeep: 4, effect: '+12 покупателей за день' },
    clinic: { title: 'Новый кабинет помощи', cost: 110, upkeep: 6, effect: '+4 места для помощи в день' },
    park: { title: 'Обустроить парк', cost: 70, upkeep: 3, effect: '+20 мест для отдыха и больше восстановления' },
    water: { title: 'Водоснабжение', cost: 100, upkeep: 4, effect: '+80 жителей с надёжным водоснабжением' },
    power: { title: 'Электросеть', cost: 100, upkeep: 4, effect: '+80 жителей с достаточной энергией' },
    waste: { title: 'Вывоз мусора', cost: 75, upkeep: 3, effect: '+80 жителей, чей мусор город успевает убрать' }
  };
  const policy = () => Object.fromEntries(Object.keys(modes).map(k => [k, 'normal']));
  const events = {
    4: { title: 'Городская ярмарка', text: 'Больше семей выберет ТЦ для покупок и отдыха.', kind: 'fair' },
    7: { title: 'Похолодание', text: 'Три дня жители предпочитают отдыхать в помещении.', kind: 'cold' },
    8: { title: 'Похолодание продолжается', text: 'Жители по-прежнему выбирают помещения.', kind: 'cold' },
    9: { title: 'Последний холодный день', text: 'Завтра парк снова будет привлекательнее.', kind: 'cold' },
    10: { title: 'Поломка автобуса', text: 'Сегодня вместимость транспорта вдвое меньше.', kind: 'bus' },
    12: { title: 'Задержка поставки', text: 'Сегодня магазин обслужит вдвое меньше покупателей.', kind: 'delivery' }
  };
  function event(day) {
    return events[day] || { title: 'Обычный день', text: 'Посмотри на отчёт и выбери, что изменить.', kind: 'normal' };
  }
  function setup(profile = 'mixed') {
    return Array.from({ length: 6 }, (_, i) => ({
      adults: profile === 'older' ? 6 : 8,
      children: profile === 'families' ? 8 : profile === 'older' ? 2 : 4,
      seniors: profile === 'families' ? 1 : profile === 'older' ? 9 : 3,
      far: i === 2 || i === 5
    }));
  }
  function create({ districts = setup(), seed = 1, challenge = 'balance', maxDays = 14,
    initialDistrict = 0, eventful = true, contactScale = 1, healthcareBeds = 8,
    shopSeats = { market: 22, mall: 40 } } = {}) {
    const ds = districts.map(d => ({
      adults: clamp(+d.adults | 0, 0, 20), children: clamp(+d.children | 0, 0, 20),
      seniors: clamp(+d.seniors | 0, 0, 20), far: !!d.far
    }));
    if (ds.length !== 6) throw Error('Нужно шесть кварталов');
    const people = [], households = [];
    const names = ['Саша', 'Миша', 'Женя', 'Даша', 'Аня', 'Лёша', 'Кира', 'Никита'];
    ds.forEach((d, district) => {
      const count = Math.max(Math.ceil(d.adults / 2), Math.ceil(d.children / 2), Math.ceil(d.seniors / 2));
      const families = Array.from({ length: count }, (_, i) => {
        const household = { id: households.length, district, members: [], food: 0, money: 18, unmetDays: 0 };
        households.push(household); return household;
      });
      for (const type of ['adults', 'children', 'seniors']) {
        for (let i = 0; i < d[type]; i++) {
          const child = type === 'children', senior = type === 'seniors', preschool = child && i % 3 === 0;
          const key = district * 100 + i + ({ adults: 0, children: 30, seniors: 60 }[type]);
          const household = families[i % count];
          household.members.push(people.length);
          people.push({ home: 'h' + district, district, key, household: household.id, child, senior, preschool,
            name: names[key % names.length], age: child ? preschool ? 4 + i % 3 : 8 + i % 9 : senior ? 65 + i % 16 : 26 + i % 31,
            remoteCapable: !child && !senior && E.rng(key * 313 + 17)() < .6,
            likesPark: E.rng(key * 97 + 29)() < .65,
            energy: 80, happiness: 80, learning: 80 });
        }
      }
    });
    if (!people.length) throw Error('Добавь жителей хотя бы в один квартал.');
    households.forEach(h => { h.food = h.members.length; h.money += h.members.length * 6; });
    let initial = people.findIndex(x => x.district === initialDistrict);
    if (initial < 0) initial = 0;
    return { version: 2, people, households, districts: ds, seed: +seed || 1, challenge, maxDays, eventful,
      contactScale, healthcareBeds, shopSeats: { market: Math.max(1, +shopSeats.market || 22), mall: Math.max(1, +shopSeats.mall || 40) }, day: 0, cash: 300, trust: 85, waste: 0,
      infrastructure: Object.fromEntries(Object.keys(upgrades).map(k => [k, 0])), investments: [],
      states: people.map((_, i) => i === initial ? 'I' : 'S'),
      infected: people.map((_, i) => i === initial ? 0 : null), exposed: people.map(() => null),
      history: [], reports: [], decisions: [], policy: policy() };
  }
  function invest(game, id) {
    const upgrade = upgrades[id];
    if (!upgrade) throw Error('Неизвестное улучшение.');
    if (game.day >= game.maxDays) throw Error('Опыт завершён.');
    if (game.infrastructure[id] >= 2) throw Error('Это улучшение уже построено дважды.');
    if (game.cash < upgrade.cost) throw Error('Недостаточно монет: нужно ' + upgrade.cost + '.');
    const g = JSON.parse(JSON.stringify(game));
    g.cash -= upgrade.cost;
    g.infrastructure[id]++;
    g.investments.push({ day: g.day, id, cost: upgrade.cost, level: g.infrastructure[id] });
    return g;
  }
  function serviceState(g) {
    const n = g.people.length, capacity = {
      water: 120 + g.infrastructure.water * 80, power: 120 + g.infrastructure.power * 80,
      waste: 110 + g.infrastructure.waste * 80
    };
    return { capacity, water: Math.round(clamp(100 * capacity.water / n)),
      power: Math.round(clamp(100 * capacity.power / n)),
      waste: Math.round(clamp(100 * capacity.waste / n)), accumulatedWaste: Math.round(g.waste) };
  }
  function step(game, choices = {}) {
    if (game.day >= game.maxDays) throw Error('Опыт завершён');
    const g = JSON.parse(JSON.stringify(game)), p = { ...g.policy, ...choices };
    for (const k of Object.keys(modes)) if (!modes[k].includes(p[k])) throw Error('Неизвестный режим: ' + k);
    const day = ++g.day, ev = g.eventful ? event(day) : { title: 'Обычный день', kind: 'normal', text: '' };
    const n = g.people.length, home = i => g.people[i].home;
    const roll = (i, slot) => E.rng(g.seed + g.people[i].key * 1009 + day * 9176 + slot * 65537)();
    const random = E.rng(g.seed + day * 131071), services = serviceState(g);
    const powerFactor = .5 + services.power / 200;
    let newCases = 0;
    for (let i = 0; i < n; i++) {
      if (g.states[i] === 'E' && day - g.exposed[i] >= 2) { g.states[i] = 'I'; g.infected[i] = day; newCases++; }
      if (g.states[i] === 'I' && day - g.infected[i] >= 6) g.states[i] = 'R';
    }
    const infectious = g.states.filter(x => x === 'I').length;
    const care = g.people.map((person, i) => g.states[i] === 'I' && day - g.infected[i] >= 1 &&
      (person.senior || roll(i, 20) < .3) ? i : -1).filter(i => i >= 0)
      .sort((a, b) => Number(g.people[b].senior) - Number(g.people[a].senior) || g.infected[a] - g.infected[b] || a - b);
    const careSet = new Set(care), caregivers = new Set();
    for (const h of g.households) {
      const childrenAtHome = h.members.filter(i => g.people[i].child && p[g.people[i].preschool ? 'kindergarten' : 'school'] === 'remote');
      h.members.filter(i => !g.people[i].child && !g.people[i].senior && !careSet.has(i))
        .slice(0, Math.ceil(childrenAtHome.length / 2)).forEach(i => caregivers.add(i));
    }
    const dayLoc = g.people.map((person, i) => {
      if (careSet.has(i)) return home(i);
      if (person.child) return p[person.preschool ? 'kindergarten' : 'school'] === 'remote' ? home(i) : person.preschool ? 'kindergarten' : 'school';
      if (person.senior || caregivers.has(i) || p.work === 'closed' || p.work === 'remote') return home(i);
      return p.work === 'limited' && roll(i, 1) > .5 ? home(i) : 'work';
    });
    const capacity = p.bus === 'closed' ? 0 : Math.floor(((p.bus === 'reduced' ? 20 : p.bus === 'frequent' ? 60 : 40) +
      g.infrastructure.bus * 20) * (ev.kind === 'bus' ? .5 : 1));
    const missedSet = new Set(), travelMinutes = Array(n).fill(0), travelByPhase = [];
    // Allocate a fresh bus capacity at each public-trip stage. Nearby residents may walk.
    function transport(loc, slot) {
      const candidates = g.people.map((person, i) => loc[i] !== home(i) &&
        (g.districts[person.district].far || roll(i, 2 + slot) < .4) ? i : -1).filter(i => i >= 0)
        .sort((a, b) => roll(a, 50 + slot) - roll(b, 50 + slot));
      const boarded = new Set(candidates.slice(0, capacity));
      for (const i of candidates) {
        if (!boarded.has(i) && g.districts[g.people[i].district].far) { loc[i] = home(i); missedSet.add(i); }
      }
      loc.forEach((id, i) => {
        if (id === home(i)) return;
        const from = E.places.find(x => x.id === home(i)), to = E.places.find(x => x.id === id);
        const distance = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
        travelMinutes[i] += Math.round(boarded.has(i) ? 10 + distance / 75 + candidates.length / Math.max(1, capacity) * 5 : 8 + distance / 50);
      });
      travelByPhase.push({ requested: candidates.length, boarded: boarded.size, capacity, missed: candidates.filter(i => !boarded.has(i) && g.districts[g.people[i].district].far).length });
      return boarded;
    }
    const morningRiders = transport(dayLoc, 0);
    const seats = { school: Math.floor(48 * powerFactor), kindergarten: Math.floor(24 * powerFactor), work: Math.floor(60 * powerFactor) };
    let schoolQueue = 0;
    for (const place of Object.keys(seats)) {
      const visitors = g.people.map((_, i) => dayLoc[i] === place ? i : -1).filter(i => i >= 0)
        .sort((a, b) => roll(a, 16) - roll(b, 16));
      const available = seats[place] * (p[place] === 'shifts' ? 2 : 1);
      for (const i of visitors.slice(available)) { dayLoc[i] = home(i); if (place !== 'work') schoolQueue++; }
    }
    const remoteWorkers = g.people.map((person, i) => !person.child && !person.senior && person.remoteCapable &&
      !caregivers.has(i) && !careSet.has(i) && p.work === 'remote' ? i : -1).filter(i => i >= 0);
    const working = new Set([...g.people.map((_, i) => dayLoc[i] === 'work' ? i : -1).filter(i => i >= 0), ...remoteWorkers]);
    for (const h of g.households) h.money += h.members.reduce((sum, i) => sum + (working.has(i) ? 7 : g.people[i].senior ? 3 : 0), 0);

    const shopLoc = g.people.map((_, i) => home(i)), buyers = [];
    // A family sends one eligible shopper; stocks and money persist into tomorrow.
    for (const h of g.households) {
      if (h.food >= h.members.length * 2) continue;
      const eligible = h.members.filter(i => !g.people[i].child && !careSet.has(i));
      if (!eligible.length) continue;
      const i = eligible.sort((a, b) => roll(a, 3) - roll(b, 3))[0];
      const preferred = roll(i, 4) < (ev.kind === 'fair' ? .8 : .5) ? 'mall' : 'market';
      const other = preferred === 'mall' ? 'market' : 'mall';
      shopLoc[i] = p[preferred] !== 'closed' ? preferred : p[other] !== 'closed' ? other : home(i);
      if (shopLoc[i] !== home(i)) buyers.push(i);
    }
    if (p.clinic !== 'closed') care.forEach(i => { shopLoc[i] = 'clinic'; });
    transport(shopLoc, 1);
    const served = new Set(), shopCapacity = {}, spending = Array(g.households.length).fill(0);
    let queue = 0;
    for (const place of ['market', 'mall']) {
      const cap = p[place] === 'closed' ? 0 : Math.floor(((g.shopSeats?.[place] ?? (place === 'market' ? 22 : 40)) + (place === 'market' ? g.infrastructure.market * 12 : 0)) *
        (p[place] === 'limited' ? .5 : p[place] === 'long' ? 1.5 : 1) *
        (place === 'market' && ev.kind === 'delivery' ? .5 : 1) * powerFactor);
      shopCapacity[place] = cap;
      const visitors = buyers.filter(i => shopLoc[i] === place).sort((a, b) => {
        const ha = g.households[g.people[a].household], hb = g.households[g.people[b].household];
        return ha.food / ha.members.length - hb.food / hb.members.length || roll(a, 8) - roll(b, 8);
      });
      for (const i of visitors.slice(0, cap)) {
        const h = g.households[g.people[i].household], portions = Math.min(h.members.length * 2, Math.floor(h.money / 1.5));
        if (!portions) continue;
        h.food += portions; h.money -= portions * 1.5; spending[h.id] += portions * 1.5; served.add(i);
      }
      queue += Math.max(0, visitors.length - cap);
    }
    const beds = g.healthcareBeds + g.infrastructure.clinic * 4;
    const reachableCare = care.filter(i => shopLoc[i] === 'clinic');
    const careServed = new Set(reachableCare.slice(0, p.clinic === 'closed' ? 0 : beds));
    const treated = careServed.size;

    const restLoc = g.people.map((person, i) => {
      if (careSet.has(i) || roll(i, 5) > (person.energy < 50 ? .9 : .7)) return home(i);
      const preferred = ev.kind === 'cold' ? 'gym' : person.likesPark ? 'park' : 'gym';
      if (p[preferred] !== 'closed') return preferred;
      for (const alt of ['park', 'gym', 'mall']) if (p[alt] !== 'closed' && (ev.kind !== 'cold' || alt !== 'park')) return alt;
      return home(i);
    });
    transport(restLoc, 2);
    const restCapacity = { park: 60 + g.infrastructure.park * 20, gym: p.gym === 'limited' ? 12 : 24, mall: 40 };
    let restQueue = 0;
    for (const place of Object.keys(restCapacity)) {
      const visitors = g.people.map((_, i) => restLoc[i] === place ? i : -1).filter(i => i >= 0)
        .sort((a, b) => g.people[a].energy - g.people[b].energy || roll(a, 9) - roll(b, 9));
      for (const i of visitors.slice(restCapacity[place])) { restLoc[i] = home(i); restQueue++; }
    }
    let informal = 0;
    const visiting = new Map();
    for (let i = 0; i < n; i++) {
      if (!careSet.has(i) && restLoc[i] === home(i) && roll(i, 10) > g.trust / 100 && roll(i, 11) < .5) {
        const host = g.households.find(h => h.district === (g.people[i].district + 1) % 6);
        if (host) { restLoc[i] = 'h' + host.district; visiting.set(i, host.id); informal++; }
      }
    }
    const locations = [g.people.map((_, i) => morningRiders.has(i) ? 'bus' : home(i)), dayLoc, shopLoc, restLoc, g.people.map((_, i) => home(i))];
    const dayFrames = [];
    for (let phase = 0; phase < 5; phase++) {
      const loc = locations[phase], before = [...g.states], changes = [];
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        const u = random();
        if (loc[a] !== loc[b]) continue;
        const source = before[a] === 'I' && before[b] === 'S' ? a : before[b] === 'I' && before[a] === 'S' ? b : -1;
        if (source < 0) continue;
        const target = source === a ? b : a, id = loc[a];
        if (id[0] === 'h') {
          const familyA = phase === 3 ? visiting.get(a) ?? g.people[a].household : g.people[a].household;
          const familyB = phase === 3 ? visiting.get(b) ?? g.people[b].household : g.people[b].household;
          if (familyA !== familyB) continue;
        }
        if (p[id] === 'shifts' && g.people[a].key % 2 !== g.people[b].key % 2) continue;
        let factor = id[0] === 'h' ? .09 : id === 'park' ? .003 : .014;
        if (p[id] === 'limited') factor *= .75;
        if (p[id] === 'long') factor *= .65;
        if (id === 'clinic' && p.clinic === 'appointments') factor *= .5;
        if (id === 'bus') factor *= p.bus === 'reduced' ? 1.4 : p.bus === 'frequent' ? .6 : 1;
        factor *= 1 + (100 - services.water) / 300 + g.waste / Math.max(1, n) * .02;
        if (u < factor * g.contactScale && g.states[target] === 'S') {
          g.states[target] = 'E'; g.exposed[target] = day; changes.push({ source, target, place: id });
        }
      }
      const state = g.states.map(x => x === 'E' ? 'S' : x);
      dayFrames.push({ day, phase, state, loc, events: [], exposures: changes,
        S: state.filter(x => x === 'S').length, I: state.filter(x => x === 'I').length,
        R: state.filter(x => x === 'R').length, outside: loc.filter(x => x[0] !== 'h').length });
    }
    const fed = Array(n).fill(0);
    for (const h of g.households) {
      const ratio = Math.min(1, h.food / h.members.length);
      h.members.forEach(i => { fed[i] = ratio; });
      h.food = Math.max(0, h.food - h.members.length);
      h.unmetDays = ratio < 1 ? h.unmetDays + 1 : 0;
    }
    const learning = i => dayLoc[i] === 'school' || dayLoc[i] === 'kindergarten' ? 1 :
      p[g.people[i].preschool ? 'kindergarten' : 'school'] === 'remote' ? .6 * powerFactor : 0;
    for (let i = 0; i < n; i++) {
      const person = g.people[i], rested = restLoc[i] !== home(i), sick = g.states[i] === 'I';
      person.energy = Math.round(clamp(person.energy + 12 + (rested ? 16 + (restLoc[i] === 'park' ? g.infrastructure.park * 4 : 0) : 0) -
        (working.has(i) || person.child && dayLoc[i] !== home(i) ? 18 : 0) - travelMinutes[i] / 8 - (1 - fed[i]) * 22 - (sick ? 12 : 0) + (careServed.has(i) ? 8 : 0)));
      const comfort = fed[i] * 45 + (rested ? 20 : 8) + services.water / 10 + services.power / 10 + person.energy / 10 -
        (missedSet.has(i) ? 10 : 0) - (sick && !careServed.has(i) ? 8 : 0) - Math.min(15, g.waste / n * 5);
      person.happiness = Math.round(clamp(person.happiness * .6 + comfort * .4));
      if (person.child) person.learning = Math.round(clamp(person.learning * .8 + learning(i) * 100 * .2));
    }
    g.waste = Math.max(0, g.waste + (n - services.capacity.waste) * .2);
    services.accumulatedWaste = Math.round(g.waste);
    const districtReports = g.districts.map((d, k) => {
      const ids = g.people.map((person, i) => person.district === k ? i : -1).filter(i => i >= 0), students = ids.filter(i => g.people[i].child);
      return { district: k, population: ids.length, food: Math.round(ids.reduce((sum, i) => sum + fed[i], 0)),
        rest: ids.filter(i => restLoc[i] !== home(i)).length, education: students.reduce((sum, i) => sum + learning(i), 0), students: students.length,
        missed: ids.filter(i => missedSet.has(i)).length, ill: ids.filter(i => g.states[i] === 'I').length,
        happiness: ids.length ? Math.round(ids.reduce((sum, i) => sum + g.people[i].happiness, 0) / ids.length) : 100 };
    });
    const food = 100 * fed.reduce((a, b) => a + b, 0) / n, rest = 100 * restLoc.filter((id, i) => id !== home(i)).length / n;
    const students = g.people.filter(person => person.child).length;
    const education = students ? 100 * g.people.reduce((sum, person, i) => sum + (person.child ? learning(i) : 0), 0) / students : 100;
    const workers = working.size, upkeep = Object.entries(g.infrastructure).reduce((sum, [k, level]) => sum + level * upgrades[k].upkeep, 0);
    const income = workers * 3 + served.size;
    const expenses = 30 + (p.clinic === 'closed' ? 0 : p.clinic === 'appointments' ? 22 : 18) +
      (p.bus === 'closed' ? 0 : p.bus === 'reduced' ? 6 : p.bus === 'frequent' ? 18 : 12) +
      ['school', 'kindergarten'].reduce((sum, k) => sum + (p[k] === 'remote' ? 3 : p[k] === 'shifts' ? 14 : 8), 0) +
      ['market', 'mall'].filter(k => p[k] === 'long').length * 8 + (p.work === 'shifts' ? 12 : 0) + upkeep;
    g.cash += income - expenses;
    const unservedCare = care.length - treated, trustCauses = {
      food: Math.round((food - 85) / 22), rest: Math.round((rest - 40) / 20), education: Math.round((education - 85) / 35),
      care: -Math.ceil(unservedCare * .6), transport: -Math.ceil(missedSet.size * .15), debt: g.cash < 0 ? -2 : 0,
      services: -Math.ceil((300 - services.water - services.power - services.waste) / 40)
    };
    const oldTrust = g.trust;
    g.trust = clamp(g.trust + Object.values(trustCauses).reduce((a, b) => a + b, 0));
    const happiness = Math.round(g.people.reduce((sum, person) => sum + person.happiness, 0) / n);
    const alerts = [];
    if (food < 85) alerts.push({ id: 'food', title: 'Семьям не хватает продуктов', text: 'Открой второй магазин, продли приём или проверь автобусы. Запасы дома расходуются каждый день.' });
    if (missedSet.size) alerts.push({ id: 'bus', title: 'Жители не добрались', text: 'Добавь рейсы или новый автобус. Дальние кварталы зависят от транспорта.' });
    if (unservedCare) alerts.push({ id: 'clinic', title: 'Помощи не хватило всем', text: 'Проверь доступность больницы и добавь кабинет. Пожилые получают помощь первыми.' });
    if (schoolQueue) alerts.push({ id: 'school', title: 'Не всем хватило места на занятиях', text: 'Две смены увеличивают вместимость. Проверь также электросеть.' });
    if (restQueue) alerts.push({ id: 'park', title: 'На отдыхе тесно', text: 'Открой парк и спортцентр или обустрой парк: усталые жители получают места первыми.' });
    if (services.water < 100 || services.power < 100 || services.waste < 100) alerts.push({ id: 'services', title: 'Город вырос быстрее служб', text: 'Улучши воду, электросеть и вывоз мусора. Нехватка энергии снижает вместимость зданий.' });
    if (g.cash < 0) alerts.push({ id: 'budget', title: 'Расходы выше возможностей города', text: 'Верни доступ к работе и сравни содержание улучшений с доходами.' });
    const report = { day, event: ev, infectious, newCases, care: care.length, treated, beds, unservedCare,
      cash: g.cash, income, expenses, upkeep, trust: g.trust, trustDelta: g.trust - oldTrust, trustCauses,
      food: Math.round(food), rest: Math.round(rest), education: Math.round(education), queue, schoolQueue, restQueue,
      workers, participation: Math.round(100 * (workers + districtReports.reduce((sum, d) => sum + d.education, 0)) / Math.max(1, g.people.filter(person => !person.senior).length)),
      caregivers: caregivers.size, missed: missedSet.size, missedIds: [...missedSet], informal, happiness, services, alerts,
      districts: districtReports, policy: { ...p }, transport: travelByPhase, shopCapacity,
      commute: Math.round(travelMinutes.reduce((a, b) => a + b, 0) / n),
      tired: g.people.filter(person => person.energy < 40).length,
      householdFood: g.households.map(h => Math.round(h.food / h.members.length * 10) / 10),
      counts: Object.fromEntries(Object.keys(modes).map(id => [id, Math.max(...locations.map(ls => ls.filter(x => x === id).length))])) };
    g.history.push(...dayFrames); g.reports.push(report); g.policy = p;
    g.decisions.push({ day, policy: { ...p }, infrastructure: { ...g.infrastructure } });
    return g;
  }
  root.Mayor = { create, step, invest, serviceState, event, setup, policy, modes, upgrades };
  if (typeof module !== 'undefined') module.exports = root.Mayor;
})(typeof window !== 'undefined' ? window : globalThis);
