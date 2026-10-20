/* Squiggle underlines.
   Every `.squiggle` draws itself in when it scrolls into view, then keeps a
   gentle barber-pole swell travelling along it. They all flatten under the
   pointer and ripple back as it moves away, on every page. */
(() => {
  const spans = Array.from(document.querySelectorAll('.squiggle'))
    .filter(s => s.querySelector('svg path'));
  if (!spans.length) return;

  const FULL = 6;                        // bump amplitude in path units
  const TURN = 0.03;                     // idle phase step per frame (slower = softer)
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;

  const round = v => Math.round(v * 100) / 100;
  const TAU = Math.PI * 2;

  function build(it, amps) {
    let d = 'M' + round(it.x0) + ' ' + round(it.y);
    for (let i = 0; i < it.n; i++) {
      const cx = it.x0 + it.step * (i + 0.5);
      const ex = it.x0 + it.step * (i + 1);
      const dir = i % 2 === 0 ? -1 : 1;
      d += ' Q ' + round(cx) + ' ' + round(it.y + dir * amps[i]) + ' ' + round(ex) + ' ' + round(it.y);
    }
    return d;
  }
  const draw = it => it.path.setAttribute('d', build(it, it.amps));

  const items = spans.map(span => {
    const svg = span.querySelector('svg');
    const path = svg.querySelector('path');
    const vb = (svg.getAttribute('viewBox') || '0 0 200 12').trim().split(/\s+/).map(Number);
    const W = vb[2] || 200;
    const H = vb[3] || 12;
    const n = Math.max(3, Math.round((W - 6) / 30));
    const it = {
      span, path, W,
      y: H - 5,
      n,
      x0: 3,
      step: (W - 6) / n,
      amps: new Array(n).fill(FULL),
      mouse: new Array(n).fill(1),     // 1 = full bump, 0 = flattened under pointer
      visible: true,
    };
    path.setAttribute('pathLength', '100');   // normalise the draw-in dash
    draw(it);
    return it;
  });

  // --- draw-in reveal + viewport tracking ------------------------------
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      for (const en of entries) {
        const it = items.find(x => x.span === en.target);
        if (it) it.visible = en.isIntersecting;
        if (en.isIntersecting) en.target.classList.add('in');
      }
    }, { rootMargin: '120px 0px 120px 0px' });
    items.forEach(it => it.span.classList.add('sq-js'));
    items.forEach(it => io.observe(it.span));
  } else {
    items.forEach(it => it.span.classList.add('sq-js', 'in'));
  }

  // --- cursor adaptation ----------------------------------------------
  if (fine && items.length) {
    addEventListener('pointermove', e => {
      const px = e.clientX, py = e.clientY;
      for (const it of items) {
        const r = it.span.getBoundingClientRect();
        if (!r.width) continue;
        const near = px > r.left - 80 && px < r.right + 80 && py > r.top - 70 && py < r.bottom + 70;
        const cx = ((px - r.left) / r.width) * it.W;
        for (let i = 0; i < it.n; i++) {
          if (!near) { it.mouse[i] = 1; continue; }
          const c = it.x0 + it.step * (i + 0.5);
          it.mouse[i] = Math.min(1, Math.max(0, Math.abs(cx - c) / 90));
        }
      }
    }, { passive: true });
    addEventListener('mouseout', e => { if (!e.relatedTarget) items.forEach(it => it.mouse.fill(1)); });
    addEventListener('blur', () => items.forEach(it => it.mouse.fill(1)));
  }

  // --- idle + interaction animation ------------------------------------
  if (reduce) return;
  let phase = 0;

  function frame() {
    phase += TURN;
    for (const it of items) {
      if (!it.visible) continue;
      for (let i = 0; i < it.n; i++) {
        const swell = 0.82 + 0.18 * Math.sin(TAU * (i / it.n) - phase);
        const goal = FULL * swell * it.mouse[i];
        it.amps[i] += (goal - it.amps[i]) * 0.16;
      }
      draw(it);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
