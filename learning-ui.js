(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  function registerRobot() {
    GameTour.register('robot', { name: 'Как работает робот', before: () => window.robotLesson.begin(), steps: [
      { target: '#board [data-index="0"]', context: ['#sensors'], title: '1. Выбери участок', text: 'Цель — доставить три аптечки. Для этого научим робота выбирать проезд. Нажми на светящуюся дорогу.', event: 'robot:inspected', accept: d => d.index === 0 },
      { target: '#probe', context: ['#sensors', '#sensorHint'], title: '2. Проверь грунт', text: 'Нажми «Проверить»: датчики покажут, выдержит ли грунт робота. ИИ этот ответ ещё не получил.', event: 'robot:probed' },
      { target: '#safe', context: ['#sensorHint'], title: '3. Дай пример роботу', text: 'Проверка разрешила проезд. Нажми «Можно», чтобы добавить учебный пример.', event: 'robot:labeled', accept: d => d.label === 0 },
      { target: '#board [data-index="10"]', context: ['#sensors'], title: '4. Найди опасный пример', text: 'Изучи светящуюся грязь. Один безопасный пример не научит отличать опасность.', event: 'robot:inspected', accept: d => d.index === 10 },
      { target: '#probe', context: ['#sensors', '#sensorHint'], title: '5. Проверь причину', text: 'Нажми «Проверить». Влажность и неровность здесь вместе мешают проехать.', event: 'robot:probed' },
      { target: '#unsafe', context: ['#sensorHint'], title: '6. Добавь запрет', text: 'Нажми «Нельзя». ИИ будет сравнивать новые участки с твоими примерами.', event: 'robot:labeled', accept: d => d.label === 1 },
      { target: '#train', context: ['#samples', '#model'], title: '7. Обучи модель', text: 'Два примера появятся в модели. Посмотри, какие участки она уже узнаёт.', event: 'robot:trained', delay: 1200,
        result: { target: '#boardStage', fit: '#boardStage', context: ['#predictionLegend'], text: 'Зелёный — ИИ разрешает проезд, красный — запрещает. Знак ? означает, что похожих примеров ещё нет.' } },
      { target: '#missionTask', title: '8. Расширяй опыт робота', text: 'Ты учишь проезду, ИИ выбирает путь, робот везёт аптечки. Цель — доставить A, B и C без застревания. Всю карту размечать не нужно.' }
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
    const config = mode === 'mayor' ? { name: 'Город', steps: [
      { target: '#observeCity', context: ['#mayorMapSlot .mapscroll'], title: 'Сначала наблюдай', text: 'Нажми «Учебный день». Он бесплатный.', event: 'city:observed', delay: 350,
        watch: { event: 'city:started', target: '#mayorMapSlot .mapscroll', context: ['#mayorMapSlot .legend', '#citizenStory'], text: 'Смотри на жителей и эмоции. Цвет одежды отдельно показывает симптомы.' } },
      { target: '#pick-bus-frequent', context: ['#choices-bus'], title: 'Помоги добраться', text: 'Жители пропускают поездки. Нажми «Больше рейсов».', event: 'city:choice', accept: d => d.key === 'bus' && d.value === 'frequent' },
      { target: '#tryCity', context: ['#mayorMapSlot .mapscroll'], title: 'Проверь своё решение', text: 'Проверь рейсы. После дня город остановится.', event: 'city:tested', delay: 350,
        watch: { event: 'city:started', target: '#mayorMapSlot .mapscroll', context: ['#mayorMapSlot .legend', '#citizenStory'], text: 'Заметь, кто добрался. Нажатие на жителя объяснит его эмоцию.' } },
      { target: '#cityGoalGrid', title: 'Цели каждого раунда', text: 'В каждой строке: задача, твой результат и цель. Зелёная галочка — цель пока выполнена. Для максимума выполни все цели за четыре дня.' },
      { target: '#projectSummary', title: 'Планируй улучшения', text: 'Распредели 200 монет. Между днями можно вернуть улучшение и вложить монеты в другое. Прошедшие дни не изменятся.' }
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
