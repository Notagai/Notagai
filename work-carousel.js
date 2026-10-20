/* Projects deck.
   On desktop the project cards orbit a circle whose centre sits just beyond
   the right edge of the viewport, so the visible slice reads as a sideways
   hand of cards fanned off the right side of the page. The page itself does
   not scroll: the wheel turns the wheel, slowly, so cards travel around the
   clipped stage and different ones come into view. The angle step is derived
   from the live card count, so adding a card to work.html adds it to the
   wheel automatically.

   This file also handles the interaction layer: a title tooltip, a hover lift
   that brings a card above the hand, clicking to pull a card square into the
   middle, clicking again to visit its link, and putting the old card back
   when another is chosen. Below 761px the normal stacked grid is kept and the
   page scrolls as usual. */
(() => {
  const deck = document.getElementById('project-deck');
  if (!deck) return;
  const cards = Array.from(deck.querySelectorAll('.deck-card'));
  if (!cards.length) return;
  const deckWrap = deck.parentElement;
  const randomBtn = document.querySelector('.deck-random');

  const desktop = matchMedia('(min-width: 761px)');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const isLink = card => card.tagName === 'A' && card.hasAttribute('href');

  const TAU = Math.PI * 2;
  const LEAN = 5;             // maximum card lean, in degrees
  const WHEEL = 0.0032;       // radians of turn per pixel of wheel travel
  const LINE = 16, PAGE = 400;// wheel deltaMode units (lines, pages)
  const EASE = 0.11;          // how quickly the wheel catches up to the target
  const IDLE_RATE = 0.00009;  // radians per ms when idle (~70s per turn)
  const SAMPLE_COLS = 11;     // coverage grid used to decide if a card is hidden
  const SAMPLE_ROWS = 6;

  let live = false;
  let active = null;
  let hoverLock = false;
  let hoveredCard = null;
  let focusedCard = null;
  let turning = false;
  let braking = false;
  let brakeFrom = 0, brakeDist = 0, brakeT0 = 0, brakeT = 0;
  let dir = 1, prevSpin = 0;
  let geom = null;
  let slot = null;

  let spin = 0;
  let spinTarget = 0;
  let spinRaf = 0;
  let layoutRaf = 0;
  let idleRaf = 0;
  let idleLast = 0;

  /* ---------------- ring layout ---------------- */
  function layout() {
    if (!live) return;
    const stageW = deck.clientWidth;
    const stageH = deck.clientHeight;
    if (!stageW || !stageH) return;

    const cardW = cards[0].offsetWidth;
    const cardH = cards[0].offsetHeight;
    // Fit the ring inside the stage: even a card at the top or bottom of the
    // circle, tilted by the lean, must stay fully inside it. That keeps the
    // hand clear of the header above and the footer below.
    const lean = LEAN * Math.PI / 180;
    const halfH = (cardW / 2) * Math.sin(lean) + (cardH / 2) * Math.cos(lean);
    const radius = clamp(70, stageH / 2 - halfH - 18, 420);

    geom = {
      cardW,
      cardH,
      stageW,
      stageH,
      // Ring centre far enough right that the card at angle 0 is the one flush
      // with the right edge, whatever the card width happens to be.
      cx: stageW - cardW / 2 + radius - 6,
      cy: stageH / 2,
      radius,
      step: TAU / cards.length,            // dynamic: no hard-coded card angles
      ax: (stageW - cardW) / 2,
      ay: (stageH - cardH) / 2   // focused card sits square in the middle
    };

    cards.forEach(card => {
      card.style.setProperty('--ax', geom.ax.toFixed(2) + 'px');
      card.style.setProperty('--ay', geom.ay.toFixed(2) + 'px');
    });
    if (slot) {
      slot.style.width = cardW + 'px';
      slot.style.height = cardH + 'px';
      slot.style.setProperty('--ax', geom.ax.toFixed(2) + 'px');
      slot.style.setProperty('--ay', geom.ay.toFixed(2) + 'px');
    }
    paint();
  }

  function paint() {
    const g = geom;
    if (!g) return;

    // Track the travel direction (for the hand-off fade) and whether the
    // wheel is actually moving right now.
    const moved = spin - prevSpin;
    if (Math.abs(moved) > 0.00001) dir = Math.sign(moved);
    prevSpin = spin;
    const moving = deck.classList.contains('is-spinning');

    const halfW = g.cardW / 2;
    const halfH = g.cardH / 2;
    const ring = [];         // where every card ended up, for the coverage pass

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const angle = spin + i * g.step;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      // Mirrored ring: cards ride the left arc of a circle off the right edge.
      const x = g.cx - g.radius * cos;
      const y = g.cy + g.radius * sin;
      const lean = -sin * LEAN;

      card.style.setProperty('--bx', (x - halfW).toFixed(2) + 'px');
      card.style.setProperty('--by', (y - halfH).toFixed(2) + 'px');
      card.style.setProperty('--br', lean.toFixed(2) + 'deg');
      card.style.setProperty('--bh', (lean * 0.45).toFixed(2) + 'deg');
      // The card at the edge of the hand layers above those curving behind it.
      const z = Math.round(40 + 30 * (cos + 1) / 2);
      card.style.setProperty('--z', String(z));

      // Cards at the front are solid, the ones curving behind slightly
      // translucent. While the wheel turns, the card about to take the front
      // spot fades out around the hand-off, so it melts through the card it
      // passes instead of popping over it at the vertex.
      const depth = 0.82 + 0.18 * (cos + 1) / 2;
      let o = depth;
      if (moving) {
        const d = Math.atan2(sin, cos);          // -π..π, 0 at the vertex
        const swap = -dir * g.step / 2;          // where the hand-off happens
        const dip = clamp(1 - Math.abs(d - swap) / (0.28 * g.step), 0, 1);
        o = depth * (1 - 0.6 * dip);
      }
      card.style.setProperty('--o', o.toFixed(3));

      const rot = lean * Math.PI / 180;
      ring.push({
        card,
        x,
        y,
        // the hovered / pulled-out cards are raised by the stylesheet
        z: card === active ? 1000 : card === hoveredCard ? 900 : z,
        cos: Math.cos(rot),
        sin: Math.sin(rot),
        onStage: x + halfW > 0 && x - halfW < g.stageW &&
                 y + halfH > 0 && y - halfH < g.stageH
      });
    }

    // A card can be on the stage and still have nothing of itself showing: the
    // stage clips it and the cards stacked in front cover the rest. Those used
    // to keep drawing, so their borders and text ghosted through the
    // translucent cards on top of them. Keep only cards with an uncovered
    // patch left; the pulled-out and hovered cards are always shown.
    for (let i = 0; i < ring.length; i++) {
      const card = ring[i].card;
      // Never hide the card that is being pointed at, focused, or pulled out.
      const pinned = card === active || card === hoveredCard || card === focusedCard;
      setCardVisible(card, pinned || (ring[i].onStage && anyPieceVisible(i, ring, g)));
    }
  }

  // Sampling test: a card is still visible as soon as one point across its
  // face survives both the stage clip and every card layered above it.
  function anyPieceVisible(i, ring, g) {
    const r = ring[i];
    const halfW = g.cardW / 2;
    const halfH = g.cardH / 2;
    const rim = 3;                                  // ignore the very rim
    const spanX = halfW * 2 - rim * 2;
    const spanY = halfH * 2 - rim * 2;

    for (let col = 0; col < SAMPLE_COLS; col++) {
      const lx = -halfW + rim + spanX * (col / (SAMPLE_COLS - 1));
      for (let row = 0; row < SAMPLE_ROWS; row++) {
        const ly = -halfH + rim + spanY * (row / (SAMPLE_ROWS - 1));
        const px = r.x + lx * r.cos - ly * r.sin;
        const py = r.y + lx * r.sin + ly * r.cos;
        if (px < 0 || px > g.stageW || py < 0 || py > g.stageH) continue;
        let covered = false;
        for (let j = 0; j < ring.length && !covered; j++) {
          const o = ring[j];
          if (j === i || o.z <= r.z) continue;
          const dx = px - o.x;
          const dy = py - o.y;
          covered = Math.abs(dx * o.cos + dy * o.sin) <= halfW &&
                    Math.abs(-dx * o.sin + dy * o.cos) <= halfH;
        }
        if (!covered) return true;
      }
    }
    return false;
  }

  // Keep hidden cards out of the tab order and the accessibility tree.
  function setCardVisible(card, visible) {
    if (card._deckVisible === visible) return;
    card._deckVisible = visible;
    card.style.visibility = visible ? '' : 'hidden';
    if (visible) {
      card.removeAttribute('aria-hidden');
      if (card._deckTab) {
        card._deckTab = false;
        if (isLink(card)) card.removeAttribute('tabindex');
        else card.setAttribute('tabindex', '0');
      }
    } else {
      card._deckTab = true;
      card.setAttribute('aria-hidden', 'true');
      card.setAttribute('tabindex', '-1');
    }
  }

  function clearRingVars() {
    cards.forEach(card => {
      card.removeAttribute('aria-hidden');
      if (isLink(card)) card.removeAttribute('tabindex');
      card._deckVisible = undefined;
      card._deckTab = false;
      card.style.visibility = '';
      for (const prop of ['--bx', '--by', '--br', '--bh', '--ax', '--ay', '--z', '--o']) {
        card.style.removeProperty(prop);
      }
    });
    geom = null;
  }

  /* ---------------- turning the wheel ---------------- */
  function tickSpin() {
    spinRaf = 0;
    if (!live || active) {
      turning = false;
      braking = false;
      deck.classList.remove('is-spinning');
      return;
    }
    // Ease to a stop on an ease-out curve: a slow idle drift gets a long,
    // gentle glide; a fast flick stops over a short distance.
    if (braking) {
      const p = clamp((performance.now() - brakeT0) / brakeT, 0, 1);
      spin = brakeFrom + brakeDist * (1 - Math.pow(1 - p, 3));
      spinTarget = spin;
      paint();
      if (p < 1) {
        spinRaf = requestAnimationFrame(tickSpin);
        return;
      }
      braking = false;
      deck.classList.remove('is-spinning');
      startIdle();
      paint();
      return;
    }
    const diff = spinTarget - spin;
    if (Math.abs(diff) < 0.0008) {
      spin = spinTarget;
      turning = false;
      deck.classList.remove('is-spinning');
      startIdle();
      paint();
      return;
    }
    spin += diff * EASE;
    paint();
    spinRaf = requestAnimationFrame(tickSpin);
  }

  function runSpin() {
    if (reduce.matches) {
      spin = spinTarget;
      turning = false;
      paint();
      return;
    }
    deck.classList.add('is-spinning');
    if (!spinRaf) spinRaf = requestAnimationFrame(tickSpin);
  }

  function startSpin() {
    if (!live || active || hoveredCard || focusedCard || braking) return;
    if (Math.abs(spinTarget - spin) < 0.0004) {
      deck.classList.remove('is-spinning');
      return;
    }
    runSpin();
  }

  /* Slow drift when the page is left alone, so the hand never looks frozen. */
  function stopIdle() {
    if (idleRaf) cancelAnimationFrame(idleRaf);
    idleRaf = 0;
    idleLast = 0;
    if (!spinRaf) deck.classList.remove('is-spinning');
  }

  function idleStep(t) {
    idleRaf = 0;
    if (!live || active || hoveredCard || focusedCard || turning || spinRaf) {
      if (!spinRaf) deck.classList.remove('is-spinning');
      return;
    }
    const dt = idleLast ? Math.min(64, t - idleLast) : 16;
    idleLast = t;
    spin += IDLE_RATE * dt;
    spinTarget = spin;
    paint();
    idleRaf = requestAnimationFrame(idleStep);
  }

  function startIdle() {
    if (!live || active || hoveredCard || focusedCard || turning || spinRaf) return;
    if (reduce.matches || idleRaf) return;
    idleLast = 0;
    deck.classList.add('is-spinning');
    idleRaf = requestAnimationFrame(idleStep);
  }

  function resumeMotion() {
    if (!live || active) return;
    startSpin();
    if (!spinRaf) startIdle();
  }

  function pauseSpin() {
    stopIdle();
    if (spinRaf) cancelAnimationFrame(spinRaf);
    spinRaf = 0;
    braking = false;
    turning = false;
    deck.classList.remove('is-spinning');
    if (geom) paint();          // ease back out of the travelling opacity
  }

  // Ease the wheel down to rest from whatever speed it currently has.
  function brake() {
    if (!live || reduce.matches) { pauseSpin(); return; }
    const perFrame = spinRaf ? (spinTarget - spin) * EASE : IDLE_RATE * 16;
    if (Math.abs(perFrame) < 0.00005) { pauseSpin(); return; }
    const v = Math.abs(perFrame) / 16.67;        // radians per ms
    let dist = v * 650 / 3;
    let dur = 650;
    if (dist > 0.5) { dist = 0.5; dur = 3 * dist / v; }
    stopIdle();
    turning = false;
    brakeFrom = spin;
    brakeDist = Math.sign(perFrame) * dist;
    brakeT = Math.max(90, dur);
    brakeT0 = performance.now();
    braking = true;
    deck.classList.add('is-spinning');
    if (!spinRaf) spinRaf = requestAnimationFrame(tickSpin);
  }

  // Wheel / keyboard input: explicit user action always moves the hand, even
  // if a card is hovered, so the page can never feel stuck.
  function turn(delta) {
    if (!live || !geom || active || !delta) return;
    hideTip();
    hoveredCard = null;
    pauseSpin();
    turning = true;
    spinTarget += delta;
    runSpin();
  }

  addEventListener('wheel', e => {
    if (!live || active) return;
    const d = e.deltaMode === 1 ? e.deltaY * LINE
            : e.deltaMode === 2 ? e.deltaY * PAGE
            : e.deltaY;
    turn(d * WHEEL);
  }, { passive: true });

  /* ---------------- tooltip ---------------- */
  let tip = null, tipTitle = null, tipHint = null;
  let tipW = 0, tipH = 0;
  let tx = 0, ty = 0, tgtX = 0, tgtY = 0, tipRaf = 0;

  function makeTip() {
    if (tip) return;
    tip = document.createElement('div');
    tip.className = 'deck-tip';
    tip.setAttribute('aria-hidden', 'true');
    tip.innerHTML = '<b></b><small></small>';
    tipTitle = tip.firstElementChild;
    tipHint = tip.lastElementChild;
    document.body.append(tip);
  }

  function destroyTip() {
    if (tipRaf) cancelAnimationFrame(tipRaf);
    tipRaf = 0;
    tip?.remove();
    tip = tipTitle = tipHint = null;
  }

  function titleOf(card) {
    return card.dataset.title || card.querySelector('h2')?.textContent.trim() || 'Project';
  }

  function hintOf(card) {
    if (card === active) return isLink(card) ? 'click again to visit ↗' : 'click again to put it back';
    return 'click to pull it out';
  }

  function moveTip(x, y, immediate) {
    if (!tip) return;
    tgtX = clamp(x + 18, 12, innerWidth - tipW - 12);
    tgtY = clamp(y + 20, 12, innerHeight - tipH - 12);
    if (immediate) {
      tx = tgtX;
      ty = tgtY;
      tip.style.transform = `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0)`;
      return;
    }
    if (!tipRaf) tipRaf = requestAnimationFrame(stepTip);
  }

  function stepTip() {
    tipRaf = 0;
    tx += (tgtX - tx) * 0.3;
    ty += (tgtY - ty) * 0.3;
    if (tip) tip.style.transform = `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0)`;
    if (Math.abs(tgtX - tx) + Math.abs(tgtY - ty) > 0.5) {
      tipRaf = requestAnimationFrame(stepTip);
    }
  }

  function showTip(card, x, y) {
    if (!live) return;
    makeTip();
    const wasOn = tip.classList.contains('on');
    tipTitle.textContent = titleOf(card);
    tipHint.textContent = hintOf(card);
    // measure once per title change instead of on every pointer move
    tipW = tip.offsetWidth;
    tipH = tip.offsetHeight;
    moveTip(x, y, !wasOn);
    tip.classList.add('on');
  }

  function hideTip() {
    tip?.classList.remove('on');
    if (tipRaf) cancelAnimationFrame(tipRaf);
    tipRaf = 0;
  }

  function tipAtCard(card) {
    const r = card.getBoundingClientRect();
    showTip(card, r.left + r.width / 2 - 18, r.top + Math.min(36, r.height / 3));
  }

  /* ---------------- active card ---------------- */
  function setActive(card) {
    if (!live || card === active) return;
    if (card) {
      hoveredCard = null;
      pauseSpin();
    }
    if (active) {
      active.classList.remove('is-active');
      if (!isLink(active)) active.setAttribute('aria-pressed', 'false');
    }
    active = card || null;
    if (active) {
      active.classList.add('is-active');
      if (!isLink(active)) active.setAttribute('aria-pressed', 'true');
    } else {
      hoverLock = false;
      hoveredCard = null;
      deck.classList.remove('hover-lock');
    }
    deck.classList.toggle('has-active', !!active);
    paint();                          // refresh tab order / visibility for the swap
    if (!active) resumeMotion();
  }

  /* ---------------- enable / disable ---------------- */
  function enable() {
    if (live) return;
    live = true;
    // Lock the page so nothing can scroll it away from the hand.
    document.body.classList.add('deck-locked');
    deckWrap?.classList.add('deck-wide');
    deck.classList.add('deck-live');

    // Non-link cards become keyboard-operable buttons while the deck is live.
    for (const card of cards) {
      if (isLink(card)) continue;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-pressed', 'false');
      card.dataset.deckFocus = '1';
    }

    slot = document.createElement('div');
    slot.className = 'deck-slot';
    slot.setAttribute('aria-hidden', 'true');
    deck.append(slot);

    layout();
    makeTip();
    startIdle();
  }

  function disable() {
    if (!live) return;
    live = false;
    pauseSpin();
    active = null;
    hoverLock = false;
    hoveredCard = null;
    focusedCard = null;
    turning = false;
    document.body.classList.remove('deck-locked');
    deck.classList.remove('deck-live', 'hover-lock', 'has-active');
    deckWrap?.classList.remove('deck-wide');
    hideTip();
    destroyTip();
    slot?.remove();
    slot = null;

    for (const card of cards) {
      card.classList.remove('is-active');
      card.removeAttribute('aria-hidden');
      if (isLink(card)) card.removeAttribute('tabindex');
      card._deckVisible = undefined;
      card._deckTab = false;
      if (!card.dataset.deckFocus) continue;
      card.removeAttribute('role');
      card.removeAttribute('tabindex');
      card.removeAttribute('aria-pressed');
      delete card.dataset.deckFocus;
    }
    clearRingVars();
  }

  /* ---------------- events ---------------- */
  for (const card of cards) {
    card.addEventListener('pointerenter', e => {
      if (!live || hoverLock || turning || e.pointerType === 'touch') return;
      hoveredCard = card;
      brake();
      showTip(card, e.clientX, e.clientY);
    });
    card.addEventListener('pointermove', e => {
      if (!live || e.pointerType === 'touch' || !tip?.classList.contains('on')) return;
      moveTip(e.clientX, e.clientY, false);
    });
    card.addEventListener('pointerleave', () => {
      if (hoveredCard === card) hoveredCard = null;
      hideTip();
      if (live && !active) resumeMotion();
    });
    card.addEventListener('focusin', () => {
      if (!live) return;
      focusedCard = card;
      pauseSpin();
      tipAtCard(card);
    });
    card.addEventListener('focusout', () => {
      if (focusedCard === card) focusedCard = null;
      hideTip();
      if (live && !active) resumeMotion();
    });
  }

  deck.addEventListener('click', e => {
    if (!live) return;
    const card = e.target.closest('.deck-card');
    if (!card || !deck.contains(card)) return;

    // Leave modifier-clicks and text selection alone so links still work.
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const selection = getSelection();
    if (selection && selection.toString().trim() && selection.anchorNode && card.contains(selection.anchorNode)) return;

    if (card === active) {
      // Already pulled out: a link follows on this click. A card with no site
      // tucks itself back into the hand instead.
      if (!isLink(card)) setActive(null);
      hideTip();
      return;
    }
    e.preventDefault();
    hoverLock = true;
    deck.classList.add('hover-lock');
    setActive(card);
    hideTip();
  });

  // "Random project": pull an arbitrary card out into the middle.
  randomBtn?.addEventListener('click', () => {
    if (!live || cards.length < 2) return;
    const pool = active ? cards.filter(c => c !== active) : cards;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (!pick) return;
    setActive(pick);
    hideTip();
  });

  // Arrow keys walk the hand one card at a time; Enter / Space pull out a card.
  deck.addEventListener('keydown', e => {
    if (!live) return;
    const card = e.target.closest('.deck-card');
    if (!card) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      turn((e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) * (geom?.step || 0));
      return;
    }
    if (!isLink(card) && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setActive(active === card ? null : card);
      hideTip();
    }
  });

  document.addEventListener('keydown', e => {
    if (!live || e.key !== 'Escape' || !active) return;
    setActive(null);
    hideTip();
  });

  document.addEventListener('pointerdown', e => {
    if (!live || !active) return;
    if (e.target.closest && e.target.closest('.deck-card')) return;
    setActive(null);
    hideTip();
  }, { passive: true });

  addEventListener('pointermove', e => {
    if (hoverLock) {
      hoverLock = false;
      deck.classList.remove('hover-lock');
    }
    // A card that animated out from under the pointer can leave a stale pause.
    if (hoveredCard && !hoveredCard.matches(':hover')) {
      hoveredCard = null;
      if (live && !active) resumeMotion();
    }
    // Cards can drift under a parked pointer while the wheel idles: pick that
    // card up as hovered so the idle drift stops and its title shows.
    if (live && !active && !turning && !hoverLock && e.pointerType !== 'touch') {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const over = el && el.closest ? el.closest('.deck-card') : null;
      if (over && over !== hoveredCard) {
        hoveredCard = over;
        brake();
        showTip(over, e.clientX, e.clientY);
      }
    }
  }, { passive: true });

  addEventListener('resize', () => {
    if (!live || layoutRaf) return;
    layoutRaf = requestAnimationFrame(() => {
      layoutRaf = 0;
      layout();
    });
  });
  addEventListener('load', () => {
    if (live) layout();
  });
  document.fonts?.ready.then(() => {
    if (live) layout();
  });

  desktop.addEventListener('change', e => {
    if (e.matches) enable();
    else disable();
  });

  if (desktop.matches) enable();
})();
