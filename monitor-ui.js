/* A complete game fits one desktop viewport; optional tools stay in dialogs. */
(function () {
  'use strict';
  const desktop = (window === parent ? window : parent).matchMedia('(min-width: 1000px) and (min-height: 640px)');
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
      if (!active || !details.open || opened === details) return;
      if (opened) dialog.close();
      const marker = document.createComment('dialog position'); details.before(marker);
      opened = details; details._monitorMarker = marker; dialog.append(details); dialog.showModal();
    });
  }
  function sizeBoard() {
    if (!active || !$('boardStage')) return;
    const frame = document.querySelector('.mission-frame');
    const size = Math.floor(Math.min(frame.clientWidth - 36, frame.clientHeight - 64, 660));
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
        const layout = robot.querySelector('.layout'), scene = layout.querySelector('section.card');
        scene.id = 'robotScene';
        const controls = document.createElement('aside'); controls.id = 'robotControls'; controls.className = 'card';
        const title = document.createElement('h2'); title.textContent = 'Испытай робота'; controls.append(title); layout.prepend(controls);
        move($('run').parentElement, controls); move(scene.querySelector('.stats'), controls);
        move($('deliveryTries'), controls); move($('status'), controls); move($('robotEditor'), controls);
        const training = layout.querySelector('.training');
        const row = document.createElement('div'); row.className = 'monitor-training-actions'; training.insertBefore(row, $('train'));
        move($('train'), row); move($('clear'), row);
        for (const detail of document.querySelectorAll('#robotEditor, .training details, #leaderTools')) tools(detail);
        observer = new ResizeObserver(sizeBoard); observer.observe(scene.querySelector('.mission-frame')); sizeBoard();
      } else {
        const decisions = $('cityDecisions');
        move($('cityStart'), decisions, true); move($('cityComparison'), city.querySelector('.city-map-area'));
        move($('cityPeople'), city.querySelector('.mayor-title')); move(city.querySelector('.city-rules'), city.querySelector('.mayor-title'));
        move($('cityTutorial'), city.querySelector('.mayor-title'));
        for (const detail of city.querySelectorAll('details')) tools(detail);
      }
    } else if (!desktop.matches && active) {
      if (dialog.open) dialog.close(); active = false; observer?.disconnect();
      for (const [node, marker] of moves.splice(0).reverse()) marker.replaceWith(node);
      $('robotControls')?.remove(); document.querySelector('.monitor-training-actions')?.remove();
      if ($('boardStage')) $('boardStage').style.width = '';
      document.body.classList.remove('monitor-layout', 'monitor-embedded');
    }
  }
  desktop.addEventListener('change', setup); document.addEventListener('city-mode-ready', setup); setup();
})();
