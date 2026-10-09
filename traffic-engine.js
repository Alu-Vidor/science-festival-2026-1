(function (root, factory) {
  const api = factory(typeof module === 'object' && !!module.exports);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TrafficEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (testExports) {
  'use strict';
  const VERSION = 'traffic-school-3';
  const junctionIds = Object.freeze(['A', 'B', 'C', 'D']);
  const axes = Object.freeze(['EW', 'NS']);
  const actionAxes = Object.freeze(['EW', 'NS', 'BOTH']);
  const directions = Object.freeze([1, -1]);
  const durations = Object.freeze([4, 8, 12]);
  const LINK_CAPACITY = 12, TRAVEL_TIME = 4, CLEARANCE_TIME = 2;
  const clone = value => JSON.parse(JSON.stringify(value));
  const definitions = [];

  function group(list, prefix, count, start, deadline, route, kind = 'car', people = 1, spacing = 0) {
    for (let n = 0; n < count; n++) list.push({ id: prefix + '-' + n, kind, people, route: clone(route), start: start + n * spacing, deadline: deadline + n * spacing });
  }
  const direction = leg => leg?.dir === -1 ? -1 : 1;
  const path = (...ids) => ids.map(junction => ({ junction, axis: 'EW', dir: 1 }));
  const reversePath = (...ids) => ids.map(junction => ({ junction, axis: 'EW', dir: -1 }));
  const cross = (junction, dir = 1) => [{ junction, axis: 'NS', dir }];

  // The streams are fixed for every participant. They contain no random traffic
  // or preferred answer: only departure times, routes and arrival deadlines.
  let list = [];
  group(list, 'morning-main', 10, 0, 44, path('A', 'B', 'C'));
  group(list, 'morning-school', 1, 7, 19, cross('A'), 'bus', 6);
  group(list, 'morning-clinic', 2, 0, 15, cross('B'), 'car', 2);
  group(list, 'morning-walk', 3, 0, 27, cross('C'), 'pedestrian', 1);
  group(list, 'morning-second', 7, 24, 61, path('A', 'B', 'C'));
  group(list, 'morning-bus', 1, 28, 42, cross('B'), 'bus', 6);
  group(list, 'morning-side', 5, 29, 51, cross('A'));
  group(list, 'morning-last', 5, 52, 83, path('B', 'C'));
  group(list, 'morning-cross', 5, 54, 79, cross('C'));
  for (const a of list) a.route = a.route.filter(leg => leg.axis !== 'EW' || leg.junction !== 'C').map(leg => ({ ...leg, junction: leg.junction === 'C' ? 'B' : leg.junction }));
  group(list, 'morning-return-west', 6, 10, 48, reversePath('B', 'A'));
  group(list, 'morning-return-bus', 1, 32, 62, reversePath('B', 'A'), 'bus', 6);
  group(list, 'morning-from-south', 3, 0, 24, cross('A', -1));
  group(list, 'morning-south-shop', 2, 22, 45, cross('B', -1));
  definitions.push({ id: 'school', title: 'Утро: два перекрёстка', description: 'Школьные автобусы и длинные очереди. Сроки поездок разные.', duration: 100, junctionIds: ['A', 'B'], agents: list });

  list = [];
  group(list, 'clinic-big', 9, 0, 35, cross('A'));
  group(list, 'clinic-urgent', 1, 0, 10, path('A'), 'bus', 6);
  group(list, 'clinic-chain', 8, 8, 62, path('A', 'B', 'C'));
  group(list, 'clinic-side', 8, 10, 36, cross('B'));
  group(list, 'clinic-drain', 9, 0, 16, path('C'));
  group(list, 'clinic-drain-bus', 3, 0, 16, path('C'), 'bus', 6);
  group(list, 'clinic-car', 1, 15, 28, cross('C'), 'car', 2);
  group(list, 'clinic-bus', 1, 27, 62, path('B', 'C'), 'bus', 6);
  group(list, 'clinic-return', 7, 32, 70, cross('C'));
  group(list, 'clinic-long', 8, 45, 86, path('A', 'B', 'C'));
  group(list, 'clinic-last', 2, 52, 71, cross('B'), 'pedestrian', 2);
  group(list, 'clinic-westbound', 6, 16, 65, reversePath('C', 'B', 'A'));
  group(list, 'clinic-return-bus', 1, 43, 78, reversePath('C', 'B', 'A'), 'bus', 6);
  group(list, 'clinic-south', 3, 0, 25, cross('A', -1));
  group(list, 'clinic-south-walk', 2, 10, 36, cross('B', -1), 'pedestrian', 2);
  group(list, 'clinic-south-clinic', 2, 32, 58, cross('C', -1));
  definitions.push({ id: 'clinic', title: 'Днём: три перекрёстка', description: 'Автобусы, автомобили и пешеходы едут с разными сроками.', duration: 105, junctionIds: ['A', 'B', 'C'], agents: list });

  list = [];
  group(list, 'jam-downstream', 12, 0, 40, path('B', 'C'));
  group(list, 'jam-middle-initial', 8, 0, 16, cross('B'));
  group(list, 'jam-upstream', 10, 0, 57, path('A', 'B', 'C'));
  group(list, 'jam-cross', 4, 0, 12, cross('A'));
  group(list, 'jam-east', 1, 0, 12, cross('C'), 'bus', 6);
  group(list, 'jam-middle', 3, 14, 34, cross('B'));
  group(list, 'jam-next', 7, 30, 72, path('A', 'B', 'C'));
  group(list, 'jam-bus', 1, 34, 50, cross('A'), 'bus', 6);
  group(list, 'jam-walk', 6, 47, 74, cross('C'), 'pedestrian', 1);
  group(list, 'jam-last', 6, 56, 91, path('B', 'C'));
  for (const a of list) if (a.route.some(leg => leg.axis === 'EW' && leg.junction === 'C')) {
    a.route.push({ junction: 'D', axis: 'EW', dir: 1 });
    a.deadline += 12;
  }
  group(list, 'jam-fourth-cars', 9, 0, 16, cross('D'));
  group(list, 'jam-fourth-buses', 3, 0, 16, cross('D'), 'bus', 6);
  group(list, 'jam-fourth-urgent', 1, 20, 30, cross('D'), 'bus', 16);
  group(list, 'jam-westbound', 8, 24, 89, reversePath('D', 'C', 'B', 'A'));
  group(list, 'jam-westbound-bus', 1, 54, 112, reversePath('D', 'C', 'B', 'A'), 'bus', 6);
  group(list, 'jam-south', 3, 0, 25, cross('B', -1));
  group(list, 'jam-south-clinic', 2, 14, 40, cross('C', -1));
  group(list, 'jam-south-school', 3, 47, 72, cross('A', -1));
  group(list, 'jam-south-west', 2, 20, 38, cross('D', -1));
  definitions.push({ id: 'blocked', title: 'Вечер: четыре перекрёстка', description: 'Плотный поток на соседних перекрёстках. На дороге между ними может закончиться место.', duration: 125, junctionIds: ['A', 'B', 'C', 'D'], agents: list });

  const scenarios = Object.freeze(definitions.map(s => Object.freeze({ id: s.id, title: s.title, description: s.description, duration: s.duration, junctionIds: Object.freeze(s.junctionIds.slice()), totalPeople: s.agents.reduce((n, a) => n + a.people, 0) })));

  function prepareAgent(a) {
    const source = clone(a);
    source.route = source.route.map(leg => ({ ...leg, dir: direction(leg) }));
    return Object.assign(source, { dir: direction(source.route[0]), leg: 0, status: 'pending', progress: 0, from: null, to: clone(source.route[0]), queuedAt: null, departedAt: null, arrivedAt: null, queuePosition: -1, waited: 0 });
  }
  function create(scenarioId = scenarios[0].id) {
    const definition = definitions.find(s => s.id === scenarioId);
    if (!definition) throw new RangeError('Unknown traffic scenario: ' + scenarioId);
    return makeState(scenarioId, definition.duration, definition.agents, definition.junctionIds);
  }
  function makeState(scenarioId, duration, agents, activeJunctions = ['A', 'B']) {
    const state = { version: VERSION, tick: 0, duration, scenarioId, junctionIds: activeJunctions.slice(), done: false, signals: {}, agents: agents.map((a, order) => Object.assign(prepareAgent(a), { order })), arrivals: [], accidents: [], crashCount: 0, missed: 0, totalPeople: agents.reduce((n, a) => n + a.people, 0), onTime: 0, delay: 0, lateDelay: 0 };
    for (const id of activeJunctions) state.signals[id] = { axis: null, remaining: 0, clearance: 0, lastAxis: null, blockedUntil: 0 };
    spawn(state);
    positions(state);
    return state;
  }
  function spawn(state) {
    for (const a of state.agents) if (a.status === 'pending' && a.start <= state.tick) {
      a.status = 'queued'; a.queuedAt = state.tick; a.progress = 0;
    }
  }
  function queued(state, junction, axis, dir) {
    return state.agents.filter(a => a.status === 'queued' && a.route[a.leg]?.junction === junction && a.route[a.leg]?.axis === axis && (dir === undefined || direction(a.route[a.leg]) === dir))
      .sort((a, b) => a.queuedAt - b.queuedAt || a.start - b.start || a.order - b.order);
  }
  function occupied(state, junction, axis, dir) {
    return state.agents.filter(a => (a.status === 'queued' || a.status === 'moving') && a.route[a.leg]?.junction === junction && a.route[a.leg]?.axis === axis && direction(a.route[a.leg]) === dir).length;
  }
  function receivingSpace(state, agent) {
    const next = agent.route[agent.leg + 1];
    return next ? Math.max(0, LINK_CAPACITY - occupied(state, next.junction, next.axis, direction(next))) : LINK_CAPACITY;
  }
  function observe(state, junction) {
    if (!state.junctionIds.includes(junction)) throw new RangeError('Unknown junction: ' + junction);
    const result = { junction, tick: state.tick, lastAxis: state.signals[junction].lastAxis, byDirection: {} };
    for (const axis of axes) {
      const queue = queued(state, junction, axis);
      result.byDirection[axis] = {};
      const activeHeads = [];
      for (const dir of directions) {
        const directionalQueue = queued(state, junction, axis, dir);
        const head = directionalQueue[0];
        if (head) activeHeads.push(head);
        result.byDirection[axis][dir] = {
          vehicles: directionalQueue.length,
          people: directionalQueue.reduce((n, a) => n + a.people, 0),
          wait: head ? Math.max(...directionalQueue.map(a => state.tick - a.queuedAt)) : 0,
          slack: head ? Math.min(...directionalQueue.map(a => a.deadline - state.tick)) : 999,
          space: head ? receivingSpace(state, head) : LINK_CAPACITY,
          ...composition(directionalQueue)
        };
      }
      result[axis] = {
        vehicles: queue.length,
        people: queue.reduce((n, a) => n + a.people, 0),
        wait: queue.length ? Math.max(...queue.map(a => state.tick - a.queuedAt)) : 0,
        slack: queue.length ? Math.min(...queue.map(a => a.deadline - state.tick)) : 999,
        space: activeHeads.length ? Math.max(...activeHeads.map(a => receivingSpace(state, a))) : LINK_CAPACITY,
        ...composition(queue)
      };
    }
    return result;
  }
  function composition(queue) {
    return {
      cars: queue.filter(a => a.kind === 'car').length,
      buses: queue.filter(a => a.kind === 'bus').length,
      pedestrians: queue.filter(a => a.kind === 'pedestrian').length,
      pedestrianPeople: queue.filter(a => a.kind === 'pedestrian').reduce((n, a) => n + a.people, 0)
    };
  }
  function positions(state) {
    for (const id of state.junctionIds) for (const axis of axes) for (const dir of directions) queued(state, id, axis, dir).forEach((a, i) => { a.queuePosition = i; a.dir = dir; });
  }
  function validDecision(action) { return action && actionAxes.includes(action.axis) && durations.includes(action.duration); }
  function step(previous, decisions = {}) {
    if (previous.done) return clone(previous);
    const state = clone(previous);
    spawn(state);
    for (const id of state.junctionIds) {
      const signal = state.signals[id], action = decisions[id];
      if (signal.axis === null && signal.blockedUntil <= state.tick && validDecision(action)) {
        signal.axis = action.axis; signal.remaining = action.duration;
        // Fixed-duration commands end their phase. Every following command
        // includes the same visible safety interval, even for the same axis.
        // Without this physical cost, repeating 4-second commands would give
        // the throughput of 12 seconds and free, more frequent replanning.
        signal.clearance = signal.lastAxis ? CLEARANCE_TIME : 0;
      }
    }
    // Every departure reserves its slot before the next junction acts. This
    // prevents two streams from entering the same finite road space at once.
    for (const id of state.junctionIds) {
      const signal = state.signals[id];
      if (signal.axis === null) continue;
      if (signal.clearance > 0) { signal.clearance--; continue; }
      let departing;
      const ready = axis => directions.map(dir => queued(state, id, axis, dir)[0]).filter(a => a && receivingSpace(state, a) > 0);
      if (signal.axis === 'BOTH') {
        const ewReady = ready('EW'), nsReady = ready('NS');
        const ew = ewReady[0], ns = nsReady[0];
        if (ew && ns) {
          // Contradictory greens let incompatible real groups enter together.
          // The vehicles are stopped after a cartoon collision: no depiction
          // of injury, and none of these passengers receives arrival credit.
          for (const agent of [ew, ns]) {
            agent.from = { ...clone(agent.route[agent.leg]), dir: direction(agent.route[agent.leg]) }; agent.to = clone(agent.from);
            agent.status = 'crashed'; agent.progress = .5; agent.queuePosition = -1;
          }
          signal.blockedUntil = state.tick + 8;
          state.accidents.push({ id: 'accident-' + (state.accidents.length + 1), tick: state.tick, junction: id, agents: [ew.id, ns.id], people: ew.people + ns.people, blockedUntil: signal.blockedUntil });
          state.crashCount = state.accidents.length; state.missed += ew.people + ns.people;
          signal.lastAxis = 'BOTH'; signal.axis = null; signal.remaining = 0;
          continue;
        }
        departing = ewReady.length ? ewReady : nsReady;
      } else departing = ready(signal.axis);
      for (const a of departing) {
        const current = { ...clone(a.route[a.leg]), dir: direction(a.route[a.leg]) };
        a.leg++; a.from = current;
        a.to = a.route[a.leg] ? clone(a.route[a.leg]) : { junction: null, axis: current.axis, dir: current.dir, exit: current.axis === 'EW' ? (current.dir === 1 ? 'east' : 'west') : (current.dir === 1 ? 'south' : 'north') };
        a.dir = current.dir; a.fromLane = current.dir; a.status = 'moving'; a.progress = 0; a.departedAt = state.tick; a.queuePosition = -1;
      }
      signal.remaining--;
      if (signal.remaining <= 0) { signal.lastAxis = signal.axis; signal.axis = null; signal.remaining = 0; }
    }
    for (const a of state.agents) {
      if (a.status === 'queued') a.waited++;
      else if (a.status === 'moving') {
        a.progress = Math.min(1, (state.tick + 1 - a.departedAt) / TRAVEL_TIME);
        if (a.progress >= 1) {
          if (a.leg < a.route.length) { a.status = 'queued'; a.queuedAt = state.tick + 1; a.progress = 0; }
          else {
            a.status = 'arrived'; a.arrivedAt = state.tick + 1;
            const onTime = a.arrivedAt <= a.deadline;
            state.arrivals.push({ id: a.id, tick: a.arrivedAt, people: a.people, onTime, delay: Math.max(0, a.arrivedAt - a.deadline) });
            if (onTime) state.onTime += a.people;
          }
        }
      }
    }
    state.tick++;
    spawn(state);
    positions(state);
    state.done = state.tick >= state.duration || state.agents.every(a => a.status === 'arrived' || a.status === 'crashed');
    state.delay = state.agents.reduce((n, a) => n + a.people * a.waited, 0);
    state.lateDelay = state.agents.reduce((n, a) => n + a.people * Math.max(0, (a.arrivedAt === null ? state.tick : a.arrivedAt) - a.deadline), 0);
    return state;
  }
  function run(scenarioId, policy) {
    let state = create(scenarioId);
    while (!state.done) {
      const decisions = {};
      for (const id of state.junctionIds) if (state.signals[id].axis === null && state.signals[id].blockedUntil <= state.tick) decisions[id] = policy(observe(state, id));
      state = step(state, decisions);
    }
    return state;
  }
  function report(state) {
    return { onTime: state.onTime, totalPeople: state.totalPeople, delay: state.delay, lateDelay: state.lateDelay, accidents: state.crashCount, missed: state.missed, score: Math.floor(50 * state.onTime / state.totalPeople), completed: state.done, arrivals: state.arrivals.length };
  }
  function suiteReport(states) {
    const completed = states.length === scenarios.length && new Set(states.map(s => s.scenarioId)).size === scenarios.length && states.every(s => s.done && scenarios.some(scenario => scenario.id === s.scenarioId && scenario.totalPeople === s.totalPeople));
    const onTime = states.reduce((n, s) => n + s.onTime, 0), totalPeople = states.reduce((n, s) => n + s.totalPeople, 0), delay = states.reduce((n, s) => n + s.delay, 0);
    const accidents = states.reduce((n, s) => n + s.crashCount, 0), missed = states.reduce((n, s) => n + s.missed, 0);
    return { onTime, totalPeople, delay, accidents, missed, completed, score: completed ? Math.floor(50 * onTime / totalPeople) : 0 };
  }

  function teachingCase(id, title, description, ew, ns, options = {}) {
    const agents = [];
    function add(axis, spec) {
      for (let n = 0; n < spec.vehicles; n++) {
        const dir = n < (spec.reverseCount || 0) ? -1 : 1;
        const route = axis === 'EW' ? (dir === -1 ? reversePath('A') : path('A', ...(options.blocked ? ['B'] : []))) : cross('A', dir);
        group(agents, id + '-' + axis + '-' + n, 1, 0, spec.slack, route, n === 0 && spec.bus ? 'bus' : (spec.kind || 'car'), n === 0 && spec.bus ? spec.bus : (spec.people || 1));
      }
    }
    add('EW', ew); add('NS', ns);
    if (options.blocked) group(agents, id + '-blocked', LINK_CAPACITY, 0, 50, path('B'));
    const state = makeState('training-' + id, 24, agents);
    state.signals.A.lastAxis = options.lastAxis || null;
    if (options.wait) for (const a of state.agents) if (a.status === 'queued' && a.route[0].axis === options.wait.axis) a.queuedAt = -options.wait.seconds;
    positions(state);
    return { id, title, description, junction: 'A', state };
  }
  const trainingCases = [
    teachingCase('bus-north', 'Автобус и машины', 'На проспекте четыре машины, на северной улице — автобус с шестью пассажирами. У поездок разные сроки.', { vehicles: 4, slack: 28 }, { vehicles: 1, bus: 6, slack: 12 }),
    teachingCase('bus-west', 'Пешеходы уже ждут', 'Три пары пешеходов ждут на проспекте 16 секунд. С севера только что подъехал автобус.', { vehicles: 3, kind: 'pedestrian', people: 2, slack: 12 }, { vehicles: 1, bus: 6, slack: 30 }, { wait: { axis: 'EW', seconds: 16 } }),
    teachingCase('long-west', 'Большая очередь', 'На проспекте десять машин, с севера — две. Ближайшие сроки: 18 и 30 секунд.', { vehicles: 10, slack: 18 }, { vehicles: 2, slack: 30 }),
    teachingCase('long-north', 'Две встречные очереди', 'С севера шесть машин, с юга — пять. На проспекте три машины. Зелёный одной оси пропускает обе встречные очереди.', { vehicles: 3, slack: 30 }, { vehicles: 11, reverseCount: 5, slack: 19 }, { lastAxis: 'EW' }),
    teachingCase('urgent-west', 'Разные сроки', 'Две встречные машины на проспекте скоро опоздают: осталось восемь секунд. У восьми машин на северной улице — 35 секунд.', { vehicles: 2, reverseCount: 1, slack: 8 }, { vehicles: 8, slack: 35 }),
    teachingCase('urgent-north', 'Короткая северная очередь', 'Три машины с севера ждут пять секунд. До их опоздания девять секунд; на проспекте стоит восемь машин.', { vehicles: 8, slack: 35 }, { vehicles: 3, slack: 9 }, { lastAxis: 'EW', wait: { axis: 'NS', seconds: 5 } }),
    teachingCase('blocked-west', 'Впереди нет места', 'Между этим и следующим перекрёстком осталось ноль свободных мест. На северной улице стоят три машины.', { vehicles: 6, slack: 30 }, { vehicles: 3, slack: 18 }, { blocked: true }),
    teachingCase('medium-west', 'Две очереди', 'На проспекте шесть машин, на северной улице — три. Они ждут пять и ноль секунд; ближайшие сроки: 25 и 19 секунд.', { vehicles: 6, slack: 25 }, { vehicles: 3, slack: 19 }, { wait: { axis: 'EW', seconds: 5 } })
  ];
  // Only test tooling imports these demonstrations. Product teaching keeps the
  // child's chosen label, including harmful choices, without consulting this.
  const referenceActions = Object.freeze([
    { axis: 'NS', duration: 4 }, { axis: 'EW', duration: 4 },
    { axis: 'EW', duration: 12 }, { axis: 'NS', duration: 8 },
    { axis: 'EW', duration: 4 }, { axis: 'NS', duration: 4 },
    { axis: 'NS', duration: 4 }, { axis: 'EW', duration: 8 }
  ].map(Object.freeze));
  function testReference(observation) {
    let axis = 'EW';
    const score = (a) => {
      const q = observation[a];
      if (!q.vehicles || !q.space) return -10000;
      return q.people * 1.2 + q.wait * .4 + Math.max(0, 20 - q.slack) * 3;
    };
    if (score('NS') > score('EW')) axis = 'NS';
    const q = observation[axis], other = observation[axis === 'EW' ? 'NS' : 'EW'];
    let duration = q.vehicles <= 4 ? 4 : q.vehicles <= 8 ? 8 : 12;
    if (other.vehicles && other.space && other.slack <= duration + CLEARANCE_TIME + TRAVEL_TIME + other.vehicles) duration = 4;
    return { axis, duration };
  }
  const api = { VERSION, junctionIds, axes, actionAxes, directions, durations, LINK_CAPACITY, TRAVEL_TIME, CLEARANCE_TIME, scenarios, trainingCases, create, step, observe, run, report, suiteReport };
  if (testExports) Object.assign(api, { referenceActions, testReference });
  return api;
});
