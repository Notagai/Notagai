/* Overlay scrollbar: hides the native one (so it never takes layout width)
   and draws a thumb on top of the page. Scrolling itself stays native. */
(() => {
  if (!matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  const root = document.documentElement;
  root.classList.add('custom-scroll');

  const bar = document.createElement('div');
  const thumb = document.createElement('div');
  bar.className = 'scrollbar';
  thumb.className = 'scrollbar-thumb';
  // the thumb is a vertical squiggle; the path runs one wavelength (40 units)
  // past each end so the downward flow animation loops seamlessly
  thumb.innerHTML = '<svg viewBox="0 0 12 200" preserveAspectRatio="none" aria-hidden="true"><path d="M6 -40 Q 10 -30 6 -20 T 6 0 T 6 20 T 6 40 T 6 60 T 6 80 T 6 100 T 6 120 T 6 140 T 6 160 T 6 180 T 6 200 T 6 220 T 6 240"/></svg>';
  bar.setAttribute('aria-hidden', 'true');
  bar.append(thumb);
  document.body.append(bar);

  const MIN = 40;
  let hideTimer, drag = null;

  const metrics = () => {
    const vh = root.clientHeight, sh = root.scrollHeight, track = bar.clientHeight;
    const h = Math.max(MIN, track * vh / sh);
    return { vh, sh, track, h, max: sh - vh };
  };

  function update() {
    const m = metrics();
    if (m.max <= 1) { bar.hidden = true; return; }
    bar.hidden = false;
    thumb.style.height = m.h + 'px';
    thumb.style.transform = `translateY(${(m.track - m.h) * (root.scrollTop / m.max)}px)`;
  }

  function wake() {
    bar.classList.add('on');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!drag) bar.classList.remove('on'); }, 900);
  }

  thumb.addEventListener('pointerdown', e => {
    thumb.setPointerCapture(e.pointerId);
    drag = { y: e.clientY, top: root.scrollTop };
    bar.classList.add('on', 'dragging');
    e.preventDefault();
  });
  thumb.addEventListener('pointermove', e => {
    if (!drag) return;
    const m = metrics();
    root.scrollTop = drag.top + (e.clientY - drag.y) * m.max / (m.track - m.h);
  });
  const end = () => { drag = null; bar.classList.remove('dragging'); wake(); };
  thumb.addEventListener('pointerup', end);
  thumb.addEventListener('pointercancel', end);

  // clicking the empty track pages up or down
  bar.addEventListener('pointerdown', e => {
    if (e.target !== bar) return;
    const above = e.clientY < thumb.getBoundingClientRect().top;
    root.scrollBy({ top: (above ? -1 : 1) * root.clientHeight * 0.9, behavior: 'smooth' });
  });

  addEventListener('scroll', () => { update(); wake(); }, { passive: true });
  addEventListener('resize', update);
  addEventListener('load', update);
  new ResizeObserver(update).observe(document.body);
  update();
  wake();
})();
