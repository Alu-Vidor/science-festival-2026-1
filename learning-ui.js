(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  function registerRobot() {
    GameTour.register('robot', { name: 'Робот', before: () => window.robotLesson.begin(), steps: [
      { target: '#run', title: 'Проверь короткий путь', text: 'Нажми «Испытать робота». Посмотри, где он застрянет.', event: 'robot:finished' },
      { target: '#board [data-index="0"]', title: 'Изучи сухой участок', text: 'Нажми на подсвеченную клетку. Датчики покажут её свойства.', event: 'robot:inspected', accept: d => d.index === 0 },
      { target: '#safe', title: 'Покажи хороший пример', text: 'Этот участок выдержит робота. Нажми «Безопасно».', event: 'robot:labeled', accept: d => d.index === 0 && d.label === 0 },
      { target: '#board [data-index="61"]', title: 'Найди причину остановки', text: 'Нажми на подсвеченную грязь. Влажность и неровность вместе мешают проехать.', event: 'robot:inspected', accept: d => d.index === 61 },
      { target: '#unsafe', title: 'Покажи опасный пример', text: 'Нажми «Опасно». ИИ будет учиться на этой отметке.', event: 'robot:labeled', accept: d => d.index === 61 && d.label === 1 },
      { target: '#train', title: 'Обучи ИИ', text: 'Нажми «Обучить ИИ». Затем добавь ещё разные примеры и проверь доставку.', event: 'robot:trained' }
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
      ...(!window.cityLesson.observed() ? [{ target: '#observeCity', title: 'Сначала наблюдай', text: 'Нажми кнопку. Город проживёт две недели без твоих решений.', event: 'city:observed' }] : []),
      { target: '#pick-bus-frequent', title: 'Помоги добраться', text: 'Жители пропускают поездки. Нажми «Больше рейсов».', event: 'city:choice', accept: d => d.key === 'bus' && d.value === 'frequent' },
      { target: '#tryCity', title: 'Проверь своё решение', text: 'Нажми «Проверить план». Сравни поездки и число заражений.', event: 'city:tested' }
    ] } : mode === 'contest' ? { name: 'Соревнование', steps: [
      { target: '.round-clock', title: 'Семь минут на попытки', text: 'Таймер начнётся после первой проверки. Во время обучения он стоит.' },
      { target: '#contestChoices', title: 'Выбирай карточки', text: 'Открой категорию и нажми вариант. Можно организовать меры на шесть очков.' },
      { target: '#tryPlan', title: 'Проверь план', text: 'Снизь пик, сохрани продукты, работу, учёбу и помощь.' },
      { target: '#attemptResult', title: 'Сравни результат', text: 'Посмотри, прошёл ли план условия. Меняй одно решение за попытку.' },
      { target: '#lockPlan', title: 'Заверши соревнование', text: 'Лучший допустимый план проверится в другом квартале. После фиксации его нельзя менять.' }
    ] } : { name: 'Лаборатория', steps: [
      { target: '#population', title: 'Настрой население', text: 'Меняй одно условие. Сохрани исходный результат для сравнения.' },
      { target: '#attendance', title: 'Выбери посещаемость', text: 'Ползунки меняют шанс посещения мест. Здесь работает отдельная простая модель контактов.' },
      { target: '.city .toolbar .row', title: 'Проверь эксперимент', text: 'Запусти город или нажми «До итога». Сравни два опыта.' }
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
