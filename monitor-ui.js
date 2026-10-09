/* A complete game fits one desktop viewport; optional tools stay in dialogs. */
(function () {
  'use strict';
  const monitorQuery = '(min-width: 1000px) and (min-height: 640px)';
  let desktop;
  try { desktop = (window === parent ? window : parent).matchMedia(monitorQuery); }
  catch { desktop = window.matchMedia(monitorQuery); } // Local file frames can have separate opaque origins.
  const wired = new WeakSet(), moves = [], $ = id => document.getElementById(id);
  let active = false, dialog, opened, observer;
  function move(node, parent, first = false) {
    if (!node || !parent) return;
    const marker = document.createComment('monitor position'); node.before(marker);
    moves.push([node, marker]); first ? parent.prepend(node) : parent.append(node);
  }
  function tools(details) {
    if (wired.has(details)) return; wired.add(details);
    details.addEventListener('toggle', () => {
      if (opened === details && !details.open) { dialog.close(); return; }
      if (!active || !details.open || opened === details) return;
      if (opened) dialog.close();
      const marker = document.createComment('dialog position'); details.before(marker);
      opened = details; details._monitorMarker = marker; dialog.append(details); dialog.showModal();
    });
  }
  function sizeBoard() {
    if (!active || !$('boardStage')) return;
    const frame = document.querySelector('.mission-frame');
    const heading = frame.querySelector('.mission-heading'), css = getComputedStyle(frame), label = getComputedStyle(heading);
    const number = value => parseFloat(value) || 0;
    const inset = number(css.paddingTop) + number(css.paddingBottom) + heading.offsetHeight + number(label.marginTop) + number(label.marginBottom) + 4;
    const size = Math.floor(Math.min(frame.clientWidth - number(css.paddingLeft) - number(css.paddingRight) - 4, frame.clientHeight - inset, 860));
    if (size > 0) $('boardStage').style.width = size + 'px';
  }
  function setup() {
    const robot = $('robotView'), city = $('mayor');
    if (!robot && !city) return;
    if (desktop.matches && !active) {
      active = true; document.body.classList.add('monitor-layout');
      if (window !== parent) document.body.classList.add('monitor-embedded');
      if (!dialog) {
        dialog = document.createElement('dialog'); dialog.className = 'monitor-dialog';
        const close = document.createElement('button'); close.textContent = 'Закрыть ✕'; close.onclick = () => dialog.close();
        dialog.append(close); document.body.append(dialog);
        dialog.addEventListener('close', () => {
          if (!opened) return;
          const details = opened; opened = null; details._monitorMarker.replaceWith(details); details.open = false;
        });
      }
      if (robot) {
        $('boardStage').classList.remove('enlarged');
        $('robotZoom').setAttribute('aria-pressed', 'false'); $('robotZoom').textContent = '＋ Крупнее клетки';
        const layout = robot.querySelector('.layout'), scene = layout.querySelector('section.card');
        scene.id = 'robotScene'; move($('weather'), $('taskSteps')); move($('robotTutorial'), document.querySelector('body > nav'));
        const controls = document.createElement('aside'); controls.id = 'robotControls'; controls.className = 'card';
        const title = document.createElement('h2'); title.textContent = 'Спасательный рейс'; controls.append(title); layout.prepend(controls);
        move($('cargoPanel'), controls); move($('campStatus'), controls); move($('run').parentElement, controls); move(scene.querySelector('.stats'), controls);
        move($('deliveryTries'), controls); move($('nextMission'), controls); const caption=document.createElement('p'); caption.className='terrain-caption'; caption.textContent='Покрытия · энергия за шаг'; controls.append(caption); move($('terrainLegend'), controls); move($('robotRules'), document.querySelector('body > nav'));
        tools($('robotRules'));
        for (const detail of document.querySelectorAll('.training > details')) tools(detail);
        observer = new ResizeObserver(sizeBoard); observer.observe(scene.querySelector('.mission-frame')); sizeBoard();
      } else {
        const decisions = $('cityDecisions');
        move($('cityStart'), decisions, true); move($('mayorStatus'), city.querySelector('.city-map-area'));
        move($('cityNeeds'), city.querySelector('.city-map-area'), true); move($('cityGoalGrid'), city.querySelector('.city-map-area'), true); move($('cityGoalTitle'), city.querySelector('.city-map-area'), true);
        move($('cityConditions'), city.querySelector('.mayor-title'));
        move($('cityPeople'), city.querySelector('.mayor-title')); move(city.querySelector('.city-rules'), city.querySelector('.mayor-title'));
        move($('cityTutorial'), city.querySelector('.mayor-title'));
        move($('cityProjects'), city.querySelector('.mayor-title')); move($('cityReports'), city.querySelector('.mayor-title'));
        $('fit').click();
        observer = new ResizeObserver(() => window.fitMayorLabels?.()); observer.observe($('map')); window.fitMayorLabels?.();
        if (!wired.has($('map'))) { wired.add($('map')); $('map').addEventListener('pointerdown', e => { if (active) e.stopImmediatePropagation(); }, true); }
        for (const detail of city.querySelectorAll('details')) tools(detail);
      }
    } else if (!desktop.matches && active) {
      if (dialog.open) dialog.close(); active = false; observer?.disconnect();
      for (const [node, marker] of moves.splice(0).reverse()) marker.replaceWith(node);
      $('robotControls')?.remove(); document.querySelector('.monitor-training-actions')?.remove(); document.querySelector('.monitor-rules')?.remove();
      document.querySelector('.monitor-editor-grid')?.remove();
      if ($('boardStage')) $('boardStage').style.width = '';
      document.body.classList.remove('monitor-layout', 'monitor-embedded');
    }
  }
  desktop.addEventListener('change', setup); document.addEventListener('city-mode-ready', setup); setup();
})();
