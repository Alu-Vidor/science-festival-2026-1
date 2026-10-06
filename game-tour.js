/* Shared, dependency-free spotlight tour. Never changes game decisions or training data. */
(function () {
  'use strict';
  const tours = new Map(), storageKey = 'festival-tours-v2';
  let active = null, root, card, frame, shades, previousFocus, inertStates, openedDetails, previousScroll, sequence = 0;
  function completed() { try { const value=JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(value)?value:[]; } catch { return []; } }
  function remember(id) { try { localStorage.setItem(storageKey, JSON.stringify([...new Set([...completed(), id])])); } catch {} }
  function build() {
    root = document.createElement('div'); root.id = 'gameTour'; root.className = 'game-tour';
    root.innerHTML = `<div class="tour-shade tour-top"></div><div class="tour-shade tour-bottom"></div><div class="tour-shade tour-left"></div><div class="tour-shade tour-right"></div><div class="tour-focus" aria-hidden="true"></div><section class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle" aria-describedby="tourText" tabindex="-1"><div class="tour-kicker"><span id="tourCounter"></span><button id="tourSkip" aria-label="Закрыть обучение">Пропустить ×</button></div><div class="tour-progress" aria-hidden="true"></div><h2 id="tourTitle"></h2><p id="tourText"></p><p id="tourTip" class="tour-tip"></p><div class="tour-actions"><button id="tourBack">← Назад</button><button id="tourNext" class="primary">Далее →</button></div><span class="tour-keyboard">Tab — выбрать кнопку · Esc — выйти</span></section>`;
    document.body.appendChild(root);
    card = root.querySelector('.tour-card'); frame = root.querySelector('.tour-focus');
    shades = [...root.querySelectorAll('.tour-shade')];
    root.querySelector('#tourSkip').onclick = () => finish(true);
    root.querySelector('#tourBack').onclick = () => show(active.index - 1);
    root.querySelector('#tourNext').onclick = () => active.index + 1 < active.steps.length ? show(active.index + 1) : finish(true);
  }
  function visibleRect(target) {
    const r = target?.getBoundingClientRect(), w = window.innerWidth, h = window.innerHeight;
    if (!r || !r.width || !r.height) return { left: w / 2, top: h / 2, right: w / 2, bottom: h / 2, width: 0, height: 0 };
    const left = Math.max(8, r.left - 8), top = Math.max(8, r.top - 8), right = Math.min(w - 8, r.right + 8), bottom = Math.min(h - 8, r.bottom + 8);
    return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }
  function place() {
    if (!active) return;
    const r = visibleRect(document.querySelector(active.steps[active.index].target));
    const w = window.innerWidth, h = window.innerHeight;
    frame.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    frame.hidden = !r.width;
    const rectangles = [[0, 0, w, r.top], [0, r.bottom, w, h - r.bottom], [0, r.top, r.left, r.height], [r.right, r.top, w - r.right, r.height]];
    shades.forEach((shade, i) => { const [x, y, width, height] = rectangles[i]; shade.style.cssText = `left:${x}px;top:${y}px;width:${width}px;height:${height}px`; });
    const cw = card.offsetWidth, ch = card.offsetHeight, gap = 18;
    let left, top;
    if (!r.width) { left = (w - cw) / 2; top = (h - ch) / 2; }
    else if (r.right + cw + gap < w - 12) { left = r.right + gap; top = r.top; }
    else if (r.left - cw - gap > 12) { left = r.left - cw - gap; top = r.top; }
    else { left = r.left; top = r.bottom + gap + ch < h - 12 ? r.bottom + gap : r.top - gap - ch > 12 ? r.top - gap - ch : h - ch - 16; }
    card.style.left = Math.max(12, Math.min(w - cw - 12, left)) + 'px';
    card.style.top = Math.max(12, Math.min(h - ch - 12, top)) + 'px';
  }
  function show(index) {
    const token = ++sequence;
    active.index = index;
    const step = active.steps[index];
    if (step.prepare) step.prepare();
    const target = document.querySelector(step.target);
    let ancestor = target;
    while (ancestor) { if (ancestor.tagName === 'DETAILS' && !ancestor.open) { openedDetails.add(ancestor); ancestor.open = true; } ancestor = ancestor.parentElement; }
    root.querySelector('#tourCounter').textContent = `Шаг ${index + 1} из ${active.steps.length} · ${active.name}`;
    root.querySelector('#tourTitle').textContent = step.title;
    root.querySelector('#tourText').textContent = step.text;
    root.querySelector('#tourTip').textContent = step.tip || '';
    root.querySelector('#tourTip').hidden = !step.tip;
    root.querySelector('#tourBack').disabled = index === 0;
    root.querySelector('#tourNext').textContent = index + 1 === active.steps.length ? 'Попробовать самому ✓' : 'Далее →';
    root.querySelector('.tour-progress').replaceChildren(...active.steps.map((_, i) => {
      const dot = document.createElement('span'); dot.className = i <= index ? 'done' : ''; return dot;
    }));
    target?.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
    place(); card.focus({ preventScroll: true });
    requestAnimationFrame(() => { if (active && token === sequence) place(); });
  }
  function start(id) {
    const tour = tours.get(id); if (!tour || active) return false;
    if (tour.before?.() === false) return false;
    previousFocus = document.activeElement; previousScroll = {left:window.scrollX,top:window.scrollY}; openedDetails = new Set();
    build(); inertStates = [...document.body.children].filter(el => el !== root).map(el => [el, el.inert]);
    inertStates.forEach(([el]) => { el.inert = true; });
    document.body.classList.add('tour-open');
    active = { ...tour, id, index: 0 };
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    document.addEventListener('keydown', keys, true);
    show(0); return true;
  }
  function keys(e) {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); finish(true); }
    if (e.key === 'Tab') {
      const buttons = [...card.querySelectorAll('button')].filter(b => !b.disabled), first = buttons[0], last = buttons.at(-1);
      if (e.shiftKey && (document.activeElement === first || document.activeElement === card)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === card)) { e.preventDefault(); first.focus(); }
    }
  }
  function finish(mark = false) {
    if (!active) return;
    const tour = active; active = null; ++sequence;
    window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); document.removeEventListener('keydown', keys, true);
    root.remove(); inertStates.forEach(([el, inert]) => { el.inert = inert; });
    openedDetails.forEach(el => { el.open = false; }); document.body.classList.remove('tour-open');
    if (mark) remember(tour.id);
    tour.after?.(); window.scrollTo({...previousScroll,behavior:'instant'}); previousFocus?.focus({ preventScroll: true });
  }
  window.GameTour = {
    register(id, config) { tours.set(id, config); }, start, finish, isActive: () => !!active,
    maybeStart(id) { if (!completed().includes(id)) return start(id); return false; }
  };
})();
