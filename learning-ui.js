(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  function registerRobot() {
    GameTour.register('robot', { name: 'Робот', before: () => window.robotLesson.begin(), steps: [
      { target: '#run', context: ['#boardStage'], view: '#boardStage', fit: '#boardStage', title: 'Проверь короткий путь', text: 'Нажми «Запустить».', event: 'robot:finished', delay: 700,
        watch: { event: 'robot:started', target: '#boardStage', context: [], text: 'Смотри на карту. Жёлтая клетка — место остановки.' } },
      { target: '#board [data-index="0"]', context: ['#selectedName', '#sensors'], title: 'Изучи сухой участок', text: 'Нажми на подсвеченную клетку. Датчики покажут её свойства.', event: 'robot:inspected', accept: d => d.index === 0 },
      { target: '#safe', context: ['#selectedName', '#sensors', '#sensorHint'], view: '#sensors', title: 'Безопасный пример', text: 'Грунт выдержит робота. Нажми «Безопасно».', event: 'robot:labeled', accept: d => d.index === 0 && d.label === 0 },
      { target: '#board [data-index="61"]', context: ['#robotSprite', '#selectedName', '#sensors'], title: 'Найди причину остановки', text: 'Нажми на подсвеченную грязь. Влажность и неровность вместе мешают проехать.', event: 'robot:inspected', accept: d => d.index === 61 },
      { target: '#unsafe', context: ['#selectedName', '#sensors', '#sensorHint'], view: '#sensors', title: 'Опасный пример', text: 'Влажность + неровность мешают. Нажми «Опасно».', event: 'robot:labeled', accept: d => d.index === 61 && d.label === 1 },
      { target: '#board [data-index="20"]', context: ['#selectedName', '#sensors'], title: 'Пологий склон', text: 'Изучи подсвеченный холм. Не каждый склон опасен.', event: 'robot:inspected', accept: d => d.index === 20 },
      { target: '#safe', context: ['#sensors', '#sensorHint'], title: 'Можно проехать по склону', text: 'Этот уклон безопасен. Добавь его как безопасный пример.', event: 'robot:labeled', accept: d => d.index === 20 && d.label === 0 },
      { target: '#board [data-index="19"]', context: ['#selectedName', '#sensors'], title: 'Крутой склон', text: 'Изучи соседний холм и сравни уклон.', event: 'robot:inspected', accept: d => d.index === 19 },
      { target: '#unsafe', context: ['#sensors', '#sensorHint'], title: 'Крутой склон опасен', text: 'Здесь робот застрянет. Добавь опасный пример.', event: 'robot:labeled', accept: d => d.index === 19 && d.label === 1 },
      { target: '#board [data-index="15"]', context: ['#selectedName', '#sensors'], title: 'Прочный песок', text: 'Изучи песок. Проверь прочность, а не только цвет клетки.', event: 'robot:inspected', accept: d => d.index === 15 },
      { target: '#safe', context: ['#sensors', '#sensorHint'], title: 'Песок выдержит робота', text: 'Добавь безопасный пример прочного песка.', event: 'robot:labeled', accept: d => d.index === 15 && d.label === 0 },
      { target: '#board [data-index="14"]', context: ['#selectedName', '#sensors'], title: 'Слабый песок', text: 'Изучи соседний песок. Его прочность ниже.', event: 'robot:inspected', accept: d => d.index === 14 },
      { target: '#unsafe', context: ['#sensors', '#sensorHint'], title: 'Слабый грунт опасен', text: 'Добавь опасный пример: сухой участок тоже может быть опасным.', event: 'robot:labeled', accept: d => d.index === 14 && d.label === 1 },
      { target: '#train', context: ['#samples', '#model'], title: 'Обучи ИИ', text: 'Нажми «Обучить ИИ». Посмотри, как изменится прогноз на карте.', event: 'robot:trained', delay: 1400,
        result: { target: '#boardStage', fit: '#boardStage', context: [], text: 'Рамки показывают прогноз ИИ. Начни лесную доставку. После ошибки добавляй примеры и обучай снова.' } }
    ] });
    $('robotTutorial').onclick = () => GameTour.start('robot');
    if (location.hash !== '#epidemic') GameTour.maybeStart('robot');
  }
  function cityStartLearning() {
    if (window.cityFreshLesson) { if (GameTour.start('city-mayor')) window.cityFreshLesson = false; }
    else GameTour.maybeStart('city-' + window.cityMode);
  }
  function registerCity() {
    if (window.cityLearningRegistered) return; window.cityLearningRegistered = true;
    const mode = window.cityMode;
    const config = mode === 'mayor' ? { name: 'Город', steps: () => window.cityLesson.attempted() ? [
      { target: '#mayorPolicies', title: 'Меняй одно решение', text: 'Выбери занятия, рейсы или магазины. Остальные условия опыта остаются одинаковыми.' },
      { target: '#cityComparison', title: 'Сравни последствия', text: 'Стрелки показывают исходный и новый результат. Посмотри, что улучшилось и что ухудшилось.' },
      { target: '#cityLocalScore', title: 'Сохрани лучший результат', text: 'В общий счёт входит лучшая из трёх проверок города. Время не влияет на баллы.' }
    ] : [
      ...(!window.cityLesson.observed() ? [{ target: '#observeCity', context: ['#mayorMapSlot .mapscroll'], title: 'Сначала наблюдай', text: 'Нажми кнопку. Город проживёт две недели без твоих решений.', event: 'city:observed', delay: 350,
        watch: { event: 'city:started', target: '#mayorMapSlot .mapscroll', context: ['#mayorMapSlot .legend'], text: 'Смотри на карту: жители идут учиться, работать и за продуктами. Красные фигурки — заражённые.' } }] : []),
      { target: '#pick-bus-frequent', context: ['#choices-bus'], title: 'Помоги добраться', text: 'Жители пропускают поездки. Нажми «Больше рейсов».', event: 'city:choice', accept: d => d.key === 'bus' && d.value === 'frequent' },
      { target: '#tryCity', context: ['#mayorMapSlot .mapscroll', '#mayorStatus'], title: 'Проверь своё решение', text: 'Нажми «Проверить план». Сравни поездки и число заражений.', event: 'city:tested', delay: 350,
        watch: { event: 'city:started', target: '#mayorMapSlot .mapscroll', context: ['#mayorMapSlot .legend'], text: 'Смотри, как город живёт с твоим планом. После проверки сравни поездки и заражения.' } }
    ] } : mode === 'contest' ? { name: 'Соревнование', steps: [
      { target: '.round-clock', title: 'Семь минут на попытки', text: 'Таймер начнётся после первой проверки. Во время обучения он стоит.' },
      { target: '#contestChoices', title: 'Выбирай карточки', text: 'Открой категорию и нажми вариант. Можно организовать меры на шесть очков.' },
      { target: '#tryPlan', context: ['#contestMap .mapscroll'], title: 'Проверь план', text: 'Снизь пик, сохрани продукты, работу, учёбу и помощь.' },
      { target: '#attemptResult', title: 'Сравни результат', text: 'Посмотри, прошёл ли план условия. Меняй одно решение за попытку.' },
      { target: '#lockPlan', title: 'Заверши соревнование', text: 'Лучший допустимый план проверится в другом квартале. После фиксации его нельзя менять.' }
    ] } : { name: 'Лаборатория', steps: [
      { target: '#population', title: 'Настрой население', text: 'Меняй одно условие. Сохрани исходный результат для сравнения.' },
      { target: '#attendance', title: 'Выбери посещаемость', text: 'Ползунки меняют шанс посещения мест. Здесь работает отдельная простая модель контактов.' },
      { target: '.city .toolbar .row', context: ['.city .mapscroll'], title: 'Проверь эксперимент', text: 'Запусти город или нажми «До итога». Сравни два опыта.' }
    ] };
    config.before = () => window.cityTourHooks?.before?.(); config.after = () => window.cityTourHooks?.after?.();
    GameTour.register('city-' + mode, config); $('cityTutorial').onclick = () => GameTour.start('city-' + mode);
    window.cityFreshLesson = mode === 'mayor' && new URLSearchParams(location.search).has('session');
    try { if (window === parent || window.frameElement?.getBoundingClientRect().width > 0) cityStartLearning(); } catch {}
  }
  if ($('robotView')) registerRobot();
  else {
    document.addEventListener('city-mode-ready', registerCity);
    if ($('cityTutorial') && (window.cityMode === 'lab' || $('mayor') || $('contest'))) registerCity();
  }
  window.addEventListener('message', e => {
    if (e.source !== parent) return;
    if (e.data === 'pause') GameTour.finish(false);
    if (e.data === 'city-active' && window.cityMode) cityStartLearning();
  });
})();
