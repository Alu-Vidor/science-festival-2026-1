/* Spotlight lessons: only the highlighted action is available; actions advance the lesson. */
(function () {
  'use strict';
  const tours = new Map(), storageKey = 'festival-tours-v3';
  let active = null, root, card, frame, shades, previousFocus, inertStates, openedDetails, previousScroll, sequence = 0, advanceTimer = null;
  function completed() { try { const value = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
  function remember(id) { try { localStorage.setItem(storageKey, JSON.stringify([...new Set([...completed(), id])])); } catch {} }
  function targetOf(step) { return document.querySelector(typeof step.target === 'function' ? step.target() : step.target); }
  function restoreInert() { inertStates?.forEach((value, el) => { el.inert = value; }); inertStates = new Map(); }
  function limitInteraction(target, interactive) {
    restoreInert();
    function visit(el) {
      if (el === root || interactive && target && (el === target || target.contains(el))) return;
      if (interactive && target && el.contains(target)) [...el.children].forEach(visit);
      else { inertStates.set(el, el.inert); el.inert = true; }
    }
    [...document.body.children].forEach(visit);
  }
  function build() {
    root = document.createElement('div'); root.id = 'gameTour'; root.className = 'game-tour';
    root.innerHTML = `<div class="tour-shade tour-top"></div><div class="tour-shade tour-bottom"></div><div class="tour-shade tour-left"></div><div class="tour-shade tour-right"></div><div class="tour-focus" aria-hidden="true"></div><section class="tour-card" role="dialog" aria-labelledby="tourTitle" aria-describedby="tourText" tabindex="-1"><div class="tour-kicker"><span id="tourCounter"></span><button id="tourSkip" aria-label="Закрыть обучение">Пропустить ×</button></div><div class="tour-progress" aria-hidden="true"></div><h2 id="tourTitle"></h2><p id="tourText"></p><p id="tourTip" class="tour-tip"></p><div class="tour-actions"><button id="tourBack">← Назад</button><button id="tourNext" class="primary">Далее →</button></div><span class="tour-keyboard">Esc — выйти из обучения</span></section>`;
    document.body.appendChild(root); card = root.querySelector('.tour-card'); frame = root.querySelector('.tour-focus'); shades = [...root.querySelectorAll('.tour-shade')];
    root.querySelector('#tourSkip').onclick = () => finish(true);
    root.querySelector('#tourBack').onclick = () => show(active.index - 1);
    root.querySelector('#tourNext').onclick = () => { if (!active.steps[active.index].event) advance(); };
  }
  function visibleRect(target) {
    const r = target?.getBoundingClientRect(), w = innerWidth, h = innerHeight;
    if (!r || !r.width || !r.height) return { left: w / 2, top: h / 2, right: w / 2, bottom: h / 2, width: 0, height: 0 };
    const left = Math.max(8, r.left - 8), top = Math.max(8, r.top - 8), right = Math.min(w - 8, r.right + 8), bottom = Math.min(h - 8, r.bottom + 8);
    return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }
  function place() {
    if (!active) return;
    const r = visibleRect(targetOf(active.steps[active.index])), w = innerWidth, h = innerHeight;
    frame.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`; frame.hidden = !r.width;
    const rectangles = [[0, 0, w, r.top], [0, r.bottom, w, h - r.bottom], [0, r.top, r.left, r.height], [r.right, r.top, w - r.right, r.height]];
    shades.forEach((shade, i) => { const [x, y, width, height] = rectangles[i]; shade.style.cssText = `left:${x}px;top:${y}px;width:${width}px;height:${height}px`; });
    const cw = card.offsetWidth, ch = card.offsetHeight, gap = 16;
    const areas = [
      { x: r.right + gap, y: Math.max(12, r.top), room: w - r.right - gap >= cw },
      { x: r.left - cw - gap, y: Math.max(12, r.top), room: r.left - gap >= cw },
      { x: r.left, y: r.bottom + gap, room: h - r.bottom - gap >= ch },
      { x: r.left, y: r.top - ch - gap, room: r.top - gap >= ch }
    ];
    const chosen = areas.find(a => a.room) || { x: 12, y: r.top > h / 2 ? 12 : h - ch - 12 };
    card.style.left = Math.max(12, Math.min(w - cw - 12, chosen.x)) + 'px'; card.style.top = Math.max(12, Math.min(h - ch - 12, chosen.y)) + 'px';
  }
  function show(index) {
    clearTimeout(advanceTimer); const token = ++sequence; active.index = index;
    const step = active.steps[index]; step.prepare?.(); const target = targetOf(step);
    let ancestor = target;
    while (ancestor) { if (ancestor.tagName === 'DETAILS' && !ancestor.open) { openedDetails.add(ancestor); ancestor.open = true; } ancestor = ancestor.parentElement; }
    limitInteraction(target, !!step.event);
    card.setAttribute('aria-modal', step.event ? 'false' : 'true');
    root.querySelector('#tourCounter').textContent = `${index + 1} / ${active.steps.length} · ${active.name}`;
    root.querySelector('#tourTitle').textContent = step.title; root.querySelector('#tourText').textContent = step.text;
    root.querySelector('#tourTip').textContent = step.tip || ''; root.querySelector('#tourTip').hidden = !step.tip;
    root.querySelector('#tourBack').disabled = index === 0;
    const next = root.querySelector('#tourNext'); next.hidden = !!step.event; next.textContent = index + 1 === active.steps.length ? 'Готово ✓' : 'Далее →';
    root.querySelector('.tour-progress').replaceChildren(...active.steps.map((_, i) => { const dot = document.createElement('span'); dot.className = i <= index ? 'done' : ''; return dot; }));
    target?.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' }); place(); card.focus({ preventScroll: true });
    requestAnimationFrame(() => { if (active && token === sequence) place(); });
  }
  function advance() { if (active.index + 1 < active.steps.length) show(active.index + 1); else finish(true); }
  function signal(name, data) {
    if (!active) return; const step = active.steps[active.index];
    if (step.event !== name || step.accept && !step.accept(data)) return;
    const token = sequence; frame.classList.add('action-done');
    clearTimeout(advanceTimer); advanceTimer = setTimeout(() => { if (active && token === sequence) { frame.classList.remove('action-done'); advance(); } }, 180);
  }
  function start(id) {
    const tour = tours.get(id); if (!tour || active || tour.before?.() === false) return false;
    const steps = typeof tour.steps === 'function' ? tour.steps() : tour.steps; if (!steps.length) return false;
    previousFocus = document.activeElement; previousScroll = { left: scrollX, top: scrollY }; openedDetails = new Set(); inertStates = new Map();
    build(); document.body.classList.add('tour-open'); active = { ...tour, steps, id, index: 0 };
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true); document.addEventListener('keydown', keys, true); show(0); return true;
  }
  function keys(e) {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); finish(true); return; }
    if (e.key !== 'Tab') return;
    const target = targetOf(active.steps[active.index]);
    const allowed = active.steps[active.index].event && target ? [target, ...target.querySelectorAll('button, a, input, select, [tabindex]')] : [];
    const items = [...allowed, ...card.querySelectorAll('button')].filter((el, i, all) => all.indexOf(el) === i && !el.disabled && !el.hidden && el.getBoundingClientRect().width && (el.matches('button, a, input, select, [tabindex]')));
    const current = items.indexOf(document.activeElement); e.preventDefault(); items[(current + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
  }
  function finish(mark = false) {
    if (!active) return; const tour = active; active = null; ++sequence; clearTimeout(advanceTimer);
    window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); document.removeEventListener('keydown', keys, true);
    root.remove(); restoreInert(); openedDetails.forEach(el => { el.open = false; }); document.body.classList.remove('tour-open');
    if (mark) remember(tour.id); tour.after?.(); window.scrollTo({ ...previousScroll, behavior: 'instant' }); previousFocus?.focus({ preventScroll: true });
  }
  window.GameTour = { register(id, config) { tours.set(id, config); }, start, finish, signal, isActive: () => !!active,
    maybeStart(id) { if (!completed().includes(id)) return start(id); return false; } };
})();
