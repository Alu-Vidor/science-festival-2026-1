(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TrafficLearning = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const VERSION = 'traffic-school-3';
  const MODEL_VERSION = 'traffic-neighbours-2';
  const AXES = ['EW', 'NS'];
  const ACTION_AXES = ['EW', 'NS', 'BOTH'];
  const DURATIONS = [4, 8, 12];
  const FIELDS = ['vehicles', 'people', 'wait', 'slack', 'space'];
  // Feature weights describe how to compare observations, not which signal is
  // correct. Decisions and durations come exclusively from the child's labels.
  const WEIGHTS = [2, 3, 2, 3, 1, 2, 4, 8, 3, 2];
  const clone = value => JSON.parse(JSON.stringify(value));
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const other = axis => axis === 'BOTH' ? 'BOTH' : axis === 'EW' ? 'NS' : 'EW';

  function observationErrors(observation) {
    if (!observation || typeof observation !== 'object' || Array.isArray(observation)) return ['observation must be an object'];
    const errors = [];
    for (const axis of AXES) {
      const queue = observation[axis];
      if (!queue || typeof queue !== 'object' || Array.isArray(queue)) {
        errors.push('observation.' + axis + ' must describe a queue');
        continue;
      }
      for (const field of FIELDS) {
        const value = queue[field];
        if (typeof value !== 'number' || !Number.isFinite(value)) errors.push('observation.' + axis + '.' + field + ' must be finite');
        else if (field !== 'slack' && value < 0) errors.push('observation.' + axis + '.' + field + ' must be nonnegative');
      }
      if (observation.byDirection !== undefined) {
        const directions = observation.byDirection && observation.byDirection[axis];
        if (!directions || typeof directions !== 'object' || Array.isArray(directions)) {
          errors.push('observation.byDirection.' + axis + ' must describe the visible entry queues');
        } else {
          for (const direction of ['1', '-1']) {
            const lane = directions[direction];
            if (!lane || typeof lane !== 'object' || Array.isArray(lane) ||
                typeof lane.vehicles !== 'number' || !Number.isFinite(lane.vehicles) || lane.vehicles < 0) {
              errors.push('observation.byDirection.' + axis + '.' + direction + '.vehicles must be finite and nonnegative');
            }
          }
          const positive = directions['1']?.vehicles, negative = directions['-1']?.vehicles;
          if (Number.isFinite(positive) && Number.isFinite(negative) && Number.isFinite(queue.vehicles) &&
              Math.abs(positive + negative - queue.vehicles) > 0.000001) {
            errors.push('observation.byDirection.' + axis + ' must add up to the visible aggregate queue');
          }
        }
      }
    }
    return errors;
  }

  function explainValidation(example) {
    if (!example || typeof example !== 'object' || Array.isArray(example)) return ['example must be an object'];
    const errors = observationErrors(example.observation);
    if (typeof example.id !== 'string' || !example.id.trim() || example.id.length > 160) errors.push('id must be a nonempty string of at most 160 characters');
    if (example.title !== undefined && (typeof example.title !== 'string' || example.title.length > 200)) errors.push('title must be a string of at most 200 characters');
    if (!example.action || !ACTION_AXES.includes(example.action.axis)) errors.push('action.axis must be EW, NS or BOTH');
    if (!example.action || !DURATIONS.includes(example.action.duration)) errors.push('action.duration must be 4, 8 or 12');
    return errors;
  }

  function validateExample(example) {
    return explainValidation(example).length === 0;
  }

  function queueFeatures(queue, directions) {
    const occupied = queue.vehicles > 0 || queue.people > 0;
    const lanes = directions ? [directions['1'].vehicles, directions['-1'].vehicles] : [queue.vehicles, 0];
    const longestLane = Math.max(...lanes);
    const laneLoad = queue.vehicles > 0 ? longestLane / queue.vehicles : 0;
    const occupiedDirections = lanes.filter(count => count > 0).length;
    return [
      Math.log1p(queue.vehicles) / Math.log(17),
      Math.log1p(queue.people) / Math.log(49),
      clamp(queue.wait, 0, 60) / 30,
      occupied ? clamp((30 - queue.slack) / 30, 0, 1) : 0,
      occupied ? clamp(-queue.slack / 20, 0, 1) : 0,
      clamp(queue.space, 0, 12) / 12,
      occupied ? 1 : 0,
      occupied && queue.space < 1 ? 1 : 0,
      laneLoad,
      occupiedDirections / 2
    ];
  }

  function features(observation) {
    const errors = observationErrors(observation);
    if (errors.length) throw new TypeError(errors.join('; '));
    return queueFeatures(observation.EW, observation.byDirection?.EW).concat(queueFeatures(observation.NS, observation.byDirection?.NS));
  }

  function distance(a, b) {
    let total = 0, weight = 0;
    for (let index = 0; index < a.length; index++) {
      const w = WEIGHTS[index % WEIGHTS.length];
      total += w * (a[index] - b[index]) ** 2;
      weight += w;
    }
    return Math.sqrt(total / weight);
  }

  function emptyModel() {
    return { version: MODEL_VERSION, rules: VERSION, technique: 'nearest-demonstration', examples: [] };
  }

  function train(examples) {
    if (!Array.isArray(examples)) throw new TypeError('Training examples must be an array');
    if (!examples.length) throw new RangeError('Save at least one demonstration before training');
    if (examples.length > 256) throw new RangeError('Too many demonstrations');
    const ids = new Set();
    const saved = examples.map(example => {
      const errors = explainValidation(example);
      if (errors.length) throw new TypeError(errors.join('; '));
      if (ids.has(example.id)) throw new TypeError('Duplicate example id: ' + example.id);
      ids.add(example.id);
      const saved = { id: example.id, observation: clone(example.observation), action: clone(example.action) };
      if (example.title !== undefined) saved.title = example.title;
      return saved;
    });
    return { ...emptyModel(), examples: saved };
  }

  function predict(model, observation) {
    const query = features(observation);
    if (!model || !Array.isArray(model.examples) || !model.examples.length) {
      return {
        axis: 'EW', duration: 4, confidence: 0, exampleId: null,
        trained: false, mirrored: false, similarity: 0,
        reason: 'ИИ ещё не обучен. Пока повторяет пробное решение: главная дорога, 4 секунды.'
      };
    }
    if (model.version !== MODEL_VERSION || model.rules !== VERSION) throw new TypeError('Unsupported traffic learning model');
    const candidates = [];
    for (const example of model.examples) {
      if (!validateExample(example)) throw new TypeError('Invalid saved demonstration');
      const original = features(example.observation);
      const mirrored = original.slice(WEIGHTS.length).concat(original.slice(0, WEIGHTS.length));
      candidates.push({ distance: distance(query, original), exampleId: example.id, title: example.title, action: example.action, mirrored: false });
      candidates.push({ distance: distance(query, mirrored), exampleId: example.id,
        title: example.title, action: { axis: other(example.action.axis), duration: example.action.duration }, mirrored: true });
    }
    // Stable ties keep the first child's demonstration; conflicting examples
    // lower confidence instead of secretly replacing either label.
    candidates.sort((a, b) => a.distance - b.distance);
    const closest = candidates[0];
    const disagreeing = candidates.find(item => item.action.axis !== closest.action.axis || item.action.duration !== closest.action.duration);
    const similarity = Math.exp(-4 * closest.distance);
    const margin = disagreeing ? clamp((disagreeing.distance - closest.distance) / 0.12, 0, 1) : 1;
    const confidence = Math.min(0.96, similarity * (0.35 + 0.65 * margin));
    const direction = closest.action.axis === 'BOTH' ? 'всем дорогам сразу' :
      closest.action.axis === 'EW' ? 'главной дороге' : 'поперечной дороге';
    return {
      axis: closest.action.axis, duration: closest.action.duration,
      confidence, similarity, exampleId: closest.exampleId,
      trained: true, mirrored: closest.mirrored,
      reason: 'Похоже на твой пример «' + (closest.title || closest.exampleId) + '»' +
        (closest.mirrored ? ' с поворотом дорог' : '') +
        ': зелёный ' + direction + ' на ' + closest.action.duration + ' секунд.'
    };
  }

  return Object.freeze({ VERSION, MODEL_VERSION, AXES: Object.freeze(AXES), ACTION_AXES: Object.freeze(ACTION_AXES), DURATIONS: Object.freeze(DURATIONS),
    train, predict, validateExample, explainValidation, emptyModel, features });
});
