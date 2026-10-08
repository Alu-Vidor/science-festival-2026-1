/* Lessons show the action and its context; only the requested action is interactive. */
(function () {
  'use strict';
  const tours = new Map(), storageKey = 'festival-tours-v4';
  let active = null, root, card, frames, shades, previousFocus, inertStates, fitStates, openedDetails, previousScroll, sequence = 0, advanceTimer = null, observer, resizeObserver, surfaces;
  function completed() { try { const value = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
  function remember(id) { try { localStorage.setItem(storageKey, JSON.stringify([...new Set([...completed(), id])])); } catch {} }
  function targetOf(step) { return document.querySelector(typeof step.target === 'function' ? step.target() : step.target); }
  function currentStep() { const step = active.steps[active.index]; return active.phase ? { ...step, ...step[active.phase], event: null } : step; }
  function highlighted(step) { return [...new Set([targetOf(step), ...(step.context || []).map(selector => document.querySelector(selector))].filter(Boolean))]; }
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
    root.innerHTML = `<div class="tour-shades" aria-hidden="true"></div><div class="tour-frames" aria-hidden="true"></div><section class="tour-card" role="dialog" aria-labelledby="tourTitle" aria-describedby="tourText" tabindex="-1"><div class="tour-kicker"><span id="tourCounter"></span><button id="tourSkip" aria-label="Закрыть обучение">Пропустить ×</button></div><div class="tour-progress" aria-hidden="true"></div><h2 id="tourTitle"></h2><p id="tourText"></p><p id="tourTip" class="tour-tip"></p><div class="tour-actions"><button id="tourBack">← Назад</button><button id="tourNext" class="primary">Далее →</button></div><span class="tour-keyboard">Esc — выйти из обучения</span></section>`;
    document.body.appendChild(root); card = root.querySelector('.tour-card'); frames = root.querySelector('.tour-frames'); shades = root.querySelector('.tour-shades');
    root.querySelector('#tourSkip').onclick = () => finish(true);
    root.querySelector('#tourBack').onclick = () => show(active.index - 1);
    root.querySelector('#tourNext').onclick = () => { if (!active.steps[active.index].event) advance(); };
  }
  function viewport() {
    let left = 0, top = 0, right = innerWidth, bottom = innerHeight, win = window, dx = 0, dy = 0;
    // An embedded city's document is taller than the part visible on the parent's screen.
    try {
      while (win.frameElement) {
        const r = win.frameElement.getBoundingClientRect(); dx += r.left; dy += r.top; win = win.parent;
        left = Math.max(left, -dx); top = Math.max(top, -dy); right = Math.min(right, win.innerWidth - dx); bottom = Math.min(bottom, win.innerHeight - dy);
      }
      const bar = win.document.querySelector('#missionBar')?.getBoundingClientRect();
      if (bar && bar.top <= 1) top = Math.max(top, bar.bottom - dy);
    } catch {}
    return { left: left + 8, top: top + 8, right: right - 8, bottom: bottom - 8 };
  }
  function visibleRect(target, view) {
    const r = target?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return null;
    const left = Math.max(view.left, r.left - 8), top = Math.max(view.top, r.top - 8), right = Math.min(view.right, r.right + 8), bottom = Math.min(view.bottom, r.bottom + 8);
    return right > left && bottom > top ? { left, top, right, bottom, width: right - left, height: bottom - top } : null;
  }
  function reveal(target) {
    if (document.body.classList.contains('monitor-layout')) return;
    const r = target?.getBoundingClientRect(), view = viewport();
    if (!r || r.height > view.bottom - view.top - 24) return;
    const delta = r.top < view.top + 12 ? r.top - view.top - 12 : r.bottom > view.bottom - 12 ? r.bottom - view.bottom + 12 : 0;
    if (delta) surfaces.at(-1).scrollBy({ top: delta, behavior: 'instant' });
  }
  function mergeIntervals(intervals) {
    const merged = [];
    for (const [start, end] of intervals.sort((a, b) => a[0] - b[0])) {
      const last = merged.at(-1);
      if (last && start <= last[1]) last[1] = Math.max(last[1], end); else merged.push([start, end]);
    }
    return merged;
  }
  function boxes(container, rectangles, className) {
    while (container.children.length > rectangles.length) container.lastChild.remove();
    rectangles.forEach((r, i) => {
      const el = container.children[i] || container.appendChild(document.createElement('div')); el.className = className;
      el.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    });
  }
  function shadeOutside(rectangles) {
    const edges = [...new Set([0, innerHeight, ...rectangles.flatMap(r => [r.top, r.bottom])])].sort((a, b) => a - b), dark = [];
    // Cover the complement of all lit rectangles, including overlapping context regions.
    for (let i = 1; i < edges.length; i++) {
      const top = edges[i - 1], bottom = edges[i], y = (top + bottom) / 2;
      const lit = mergeIntervals(rectangles.filter(r => r.top < y && r.bottom > y).map(r => [r.left, r.right]));
      let left = 0;
      for (const [start, end] of [...lit, [innerWidth, innerWidth]]) {
        if (start > left) dark.push({ left, top, width: start - left, height: bottom - top }); left = Math.max(left, end);
      }
    }
    boxes(shades, dark, 'tour-shade');
  }
  function placement(rectangles, view, cw, ch) {
    const gap = 8, r = rectangles[0] || { left: view.left, top: view.top };
    const clampX = x => Math.max(view.left + 4, Math.min(view.right - cw - 4, x));
    const xs = [...new Set([view.left + 4, view.right - cw - 4, ...rectangles.flatMap(r => [r.left - cw - gap, r.right + gap, r.left])].map(clampX))];
    const choices = [];
    for (const x of xs) {
      const occupied = mergeIntervals(rectangles.filter(r => x < r.right + gap && x + cw > r.left - gap).map(r => [Math.max(view.top, r.top - gap), Math.min(view.bottom, r.bottom + gap)]));
      let top = view.top + 4;
      for (const [start, end] of [...occupied, [view.bottom - 4, view.bottom]]) {
        const room = start - top;
        if (room > 0) {
          const size = Math.min(ch, room), y = Math.max(top, Math.min(start - size, r.top));
          choices.push({ x, y, size, cost: (ch - size) * 10000 + Math.abs(x - r.left) + Math.abs(y - r.top) });
        }
        top = Math.max(top, end);
      }
    }
    return choices.sort((a, b) => a.cost - b.cost)[0];
  }
  function restoreFit() { fitStates.forEach((value, el) => { el.style.maxWidth = value; }); fitStates.clear(); }
  function place(adjust = true) {
    if (!active) return;
    if (active.phase) reveal(targetOf(currentStep()));
    const step = currentStep(), view = viewport(), rectangles = highlighted(step).map(el => visibleRect(el, view)).filter(Boolean);
    boxes(frames, rectangles, 'tour-focus');
    if (frames.firstChild && step.event) frames.firstChild.classList.add('tour-action-focus');
    shadeOutside(rectangles);
    const width = view.right - view.left, height = view.bottom - view.top;
    if (width <= 24 || height <= 24) { card.hidden = true; return; } card.hidden = false;
    card.style.width = Math.min(360, width - 8) + 'px'; card.style.maxHeight = (height - 8) + 'px';
    let ch = card.offsetHeight, chosen = placement(rectangles, view, card.offsetWidth, ch);
    // A slightly narrower card can fit beside the city without hiding its text.
    if ((!chosen || chosen.size < ch - 1) && width > 600) {
      const originalWidth = card.style.width;
      for (const candidateWidth of [320, 280]) {
        card.style.width = candidateWidth + 'px';
        const candidateHeight = card.offsetHeight, candidate = placement(rectangles, view, card.offsetWidth, candidateHeight);
        if (candidate && candidate.size >= candidateHeight - 1) { chosen = candidate; ch = candidateHeight; break; }
        card.style.width = originalWidth;
      }
    }
    if (!document.body.classList.contains('monitor-layout') && adjust !== false && chosen && chosen.size < ch - 1 && rectangles.length) {
      const top = Math.min(...rectangles.map(r => r.top)), bottom = Math.max(...rectangles.map(r => r.bottom));
      const fit = step.fit && document.querySelector(step.fit), fitRect = fit?.getBoundingClientRect();
      if (fitRect) {
        const size = Math.max(250, height - ch - Math.max(0, bottom - top - fitRect.height) - 64);
        if (fitRect.width > size + 1) {
          if (!fitStates.has(fit)) fitStates.set(fit, fit.style.maxWidth);
          fit.style.maxWidth = size + 'px';
          (step.view ? document.querySelector(step.view) : targetOf(step))?.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' }); reveal(targetOf(step));
          const nextView = viewport(), nextRects = highlighted(step).map(el => visibleRect(el, nextView)).filter(Boolean);
          surfaces.at(-1).scrollBy({ top: Math.max(...nextRects.map(r => r.bottom)) - nextView.bottom + 12, behavior: 'instant' });
          return place(false);
        }
      }
      // Move a short scene/inspector down to leave a complete card above it.
      if (bottom - top + ch + 40 <= height) {
        const before = targetOf(step)?.getBoundingClientRect().top;
        surfaces.at(-1).scrollBy({ top: bottom - view.bottom + 12, behavior: 'instant' });
        if (Math.abs(targetOf(step)?.getBoundingClientRect().top - before) > 1) return place(false);
      }
    }
    if (chosen) { card.style.left = chosen.x + 'px'; card.style.top = chosen.y + 'px'; card.style.maxHeight = chosen.size + 'px'; }
    else { card.hidden = true; }
  }
  function renderStep(scroll = true) {
    restoreFit();
    const token = sequence, step = currentStep(), target = targetOf(step), index = active.index;
    let ancestor = target;
    while (ancestor) { if (ancestor.tagName === 'DETAILS' && !ancestor.open) { openedDetails.add(ancestor); ancestor.open = true; } ancestor = ancestor.parentElement; }
    limitInteraction(target, !!step.event);
    root.classList.toggle('tour-watching', !!active.phase);
    root.classList.toggle('tour-acting', !!step.event);
    card.setAttribute('aria-modal', step.event ? 'false' : 'true');
    root.querySelector('#tourCounter').textContent = `${index + 1} / ${active.steps.length} · ${active.name}`;
    root.querySelector('#tourTitle').textContent = step.title; root.querySelector('#tourText').textContent = step.text;
    root.querySelector('#tourTip').textContent = step.tip || ''; root.querySelector('#tourTip').hidden = !step.tip;
    root.querySelector('#tourBack').hidden = index === 0 || !!active.phase;
    const next = root.querySelector('#tourNext'); next.hidden = !!step.event; next.textContent = index + 1 === active.steps.length ? 'Готово ✓' : 'Далее →';
    root.querySelector('.tour-progress').replaceChildren(...active.steps.map((_, i) => { const dot = document.createElement('span'); dot.className = i <= index ? 'done' : ''; return dot; }));
    if (scroll && !document.body.classList.contains('monitor-layout')) {
      (step.view ? document.querySelector(step.view) : target)?.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
      reveal(target);
    }
    place(); card.scrollTop = 0; card.focus({ preventScroll: true });
    requestAnimationFrame(() => { if (active && token === sequence) place(); });
  }
  function show(index) {
    clearTimeout(advanceTimer); ++sequence; active.index = index; active.phase = null;
    active.steps[index].prepare?.(); renderStep();
  }
  function advance() { if (active.index + 1 < active.steps.length) show(active.index + 1); else finish(true); }
  function signal(name, data) {
    if (!active) return; const step = active.steps[active.index];
    if (step.watch?.event === name && !active.phase) { active.phase = 'watch'; renderStep(); return; }
    if (step.event !== name || step.accept && !step.accept(data)) return;
    const token = sequence;
    if (step.result) { active.phase = 'result'; renderStep(); } else place();
    clearTimeout(advanceTimer); advanceTimer = setTimeout(() => { if (active && token === sequence) advance(); }, step.delay ?? 180);
  }
  function start(id) {
    const tour = tours.get(id); if (!tour || active || tour.before?.() === false) return false;
    const steps = typeof tour.steps === 'function' ? tour.steps() : tour.steps; if (!steps.length) return false;
    previousFocus = document.activeElement; previousScroll = { left: scrollX, top: scrollY }; openedDetails = new Set(); inertStates = new Map(); fitStates = new Map();
    build(); document.body.classList.add('tour-open'); active = { ...tour, steps, id, index: 0 };
    surfaces = [window]; try { for (let win = window; win !== win.parent; win = win.parent) { void win.parent.document; surfaces.push(win.parent); } } catch {}
    surfaces.forEach(win => { win.addEventListener('resize', place); win.addEventListener('scroll', place, true); });
    observer = new MutationObserver(records => { if (active && records.some(r => !root.contains(r.target))) { limitInteraction(targetOf(currentStep()), !!currentStep().event); place(); } });
    observer.observe(document.body, { childList: true, subtree: true });
    resizeObserver = new ResizeObserver(place); resizeObserver.observe(document.body);
    document.addEventListener('keydown', keys, true); show(0); return true;
  }
  function keys(e) {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); finish(true); return; }
    if (e.key !== 'Tab') return;
    const step = currentStep(), target = targetOf(step);
    const allowed = step.event && target ? [target, ...target.querySelectorAll('button, a, input, select, [tabindex]')] : [];
    const items = [...allowed, ...card.querySelectorAll('button')].filter((el, i, all) => all.indexOf(el) === i && !el.disabled && !el.hidden && el.getClientRects().length && (el.matches('button, a, input, select, [tabindex]')));
    const current = items.indexOf(document.activeElement); e.preventDefault(); items[current < 0 ? (e.shiftKey ? items.length - 1 : 0) : (current + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
  }
  function finish(mark = false) {
    if (!active) return; const tour = active; active = null; ++sequence; clearTimeout(advanceTimer);
    observer.disconnect(); resizeObserver.disconnect(); surfaces.forEach(win => { win.removeEventListener('resize', place); win.removeEventListener('scroll', place, true); }); document.removeEventListener('keydown', keys, true);
    root.remove(); restoreInert(); restoreFit(); openedDetails.forEach(el => { el.open = false; }); document.body.classList.remove('tour-open');
    if (mark) remember(tour.id); tour.after?.(); window.scrollTo({ ...previousScroll, behavior: 'instant' }); previousFocus?.focus({ preventScroll: true });
  }
  window.GameTour = { register(id, config) { tours.set(id, config); }, start, finish, signal, isActive: () => !!active,
    maybeStart(id) { if (!completed().includes(id)) return start(id); return false; } };
})();
