(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  function cityStartLearning() {
    if (window.cityFreshLesson) { if (GameTour.start('city-mayor')) window.cityFreshLesson = false; }
    else if (!window.cityRestored) GameTour.maybeStart('city-' + window.cityMode);
  }
  function registerCity() {
    if (window.cityLearningRegistered) return; window.cityLearningRegistered = true;
    const mode = window.cityMode;
    const config = mode === 'mayor' ? { name: 'Город', steps: [
      { target: '#observeCity', context: ['#mayorMapSlot .mapscroll'], title: 'Сначала наблюдай', text: 'Нажми «Учебный день». Он бесплатный.', event: 'city:observed', delay: 350,
        watch: { event: 'city:started', target: '#mayorMapSlot .mapscroll', interactive: ['#map', '#tryCity', '#pauseCity', '#cityPeople', '.monitor-dialog'], context: ['#mayorMapSlot .legend', '#citizenStory', '.city-time-controls'], text: 'Смотри на поездки и эмоции. Нажатие на жителя остановит день и откроет карточку. Затем нажми «Продолжить день».' } },
      { target: '#pick-bus-frequent', context: ['#choices-bus'], title: 'Помоги добраться', text: 'Жители пропускают поездки. Нажми «Больше рейсов».', event: 'city:choice', accept: d => d.key === 'bus' && d.value === 'frequent' },
      { target: '#tryCity', context: ['#mayorMapSlot .mapscroll'], title: 'Проверь своё решение', text: 'Проверь рейсы. После дня город остановится.', event: 'city:tested', delay: 350,
        watch: { event: 'city:started', target: '#mayorMapSlot .mapscroll', interactive: ['#map', '#tryCity', '#pauseCity', '#cityPeople', '.monitor-dialog'], context: ['#mayorMapSlot .legend', '#citizenStory', '.city-time-controls'], text: 'Заметь, кто добрался. Можно нажать на жителя и прочитать его историю. После осмотра закрой карточку и продолжи день.' } },
      { target: '#cityGoalGrid', title: 'Цели каждого раунда', text: 'Победа — три решённые задачи и проверенное улучшение плана. Раунды дают до 45 баллов, сравнение одного решения — ещё 5. Для максимума нужны все «Условия успеха».' },
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
    window.cityFreshLesson = mode === 'mayor' && new URLSearchParams(location.search).has('session') && !window.cityRestored;
    try { if (window === parent || window.frameElement?.getBoundingClientRect().width > 0) cityStartLearning(); } catch {}
  }
  document.addEventListener('city-mode-ready', registerCity);
  if ($('cityTutorial') && (window.cityMode === 'lab' || $('mayor') || $('contest'))) registerCity();
  window.addEventListener('message', e => {
    if (e.source !== parent) return;
    if (e.data === 'pause') GameTour.finish(false);
    if (e.data === 'city-active' && window.cityMode) cityStartLearning();
  });
})();
