/* One controller per mode, so the same map has one owner. */
(function () {
  'use strict';
  const requested = new URLSearchParams(location.search).get('mode');
  const mode = ['mayor', 'contest', 'lab'].includes(requested) ? requested : 'mayor';
  window.cityMode = mode;
  const nav = document.createElement('nav'); nav.className = 'city-mode-nav'; nav.setAttribute('aria-label', 'Режим города');
  for (const [id, title] of (mode === 'mayor' ? [['mayor', '🏙 Живой город']] : [['mayor', '🏙 Живой город'], ['contest', '🏁 Соревнование'], ['lab', '🔬 Лаборатория']])) {
    const link = document.createElement('a'); link.href = 'epidemic.html?mode=' + id; link.textContent = title;
    if (mode === id) link.setAttribute('aria-current', 'page'); nav.appendChild(link);
  }
  const help = document.createElement('button'); help.id = 'cityTutorial'; help.textContent = 'ⓘ Обучение'; nav.appendChild(help);
  document.body.insertBefore(nav, document.body.firstChild);
  function ready() {
    // Controllers insert their shell first; navigation belongs above all modes.
    document.body.insertBefore(nav, document.body.firstChild);
    document.dispatchEvent(new CustomEvent('city-mode-ready', { detail: mode }));
    if (location.protocol === 'file:' && window !== parent) parent.postMessage({
      kind: 'city-ready', version: 1, session: window.FestivalSession?.id || 'initial'
    }, '*');
  }
  if (mode === 'lab') { document.body.classList.add('lab-mode'); ready(); return; }
  const script = document.createElement('script');
  script.src = (mode === 'mayor' ? 'mayor-ui.js?v=review-20261009-2' : 'contest-ui.js?v=20261006-missions');
  script.onload = ready;
  script.onerror = () => { help.disabled = true; help.textContent = 'Не удалось загрузить игру — обнови страницу'; };
  if (window.FestivalSession?.ready) window.FestivalSession.ready.then(() => document.body.appendChild(script));
  else document.body.appendChild(script);
})();
