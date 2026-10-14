/* Landing intro.
   Scroll draws the squiggle (the brand mark); once the user has scrolled far
   enough - or presses/keys/clicks - the intro fades out and home.html loads.
   With prefers-reduced-motion the drawing is skipped: the mark shows complete
   and any input goes straight through. No-JS visitors still get the Skip link. */
(() => {
  const body = document.body;
  const intro = document.querySelector('.intro');
  const draw = document.querySelector('.intro-squiggle .draw');
  const word = document.querySelector('.intro-word');
  const cue = document.querySelector('.intro-cue');
  const skip = document.querySelector('.intro-skip');
  const HOME = 'home.html';
  const EXIT = 0.72;                 // scroll progress at which we leave
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let leaving = false;
  let target = 0;
  let value = 0;

  if (draw) {
    draw.style.strokeDasharray = '100';
    draw.style.strokeDashoffset = '100';
  }

  function apply(p) {
    if (draw) draw.style.strokeDashoffset = String(100 - p * 100);
    if (word) {
      word.style.transform = `translateY(${-26 * p}px) scale(${1 + p * 0.08})`;
      word.style.opacity = String(1 - p * 0.65);
    }
    if (cue) cue.style.opacity = String(Math.max(0, 1 - p * 2.4));
  }

  function leave() {
    if (leaving) return;
    leaving = true;
    intro?.classList.add('leaving');
    if (reduce) { window.location.href = HOME; return; }
    setTimeout(() => { window.location.href = HOME; }, 620);
  }

  // Skip link is a real link, so it works without JS; intercept to play the exit.
  skip?.addEventListener('click', e => { e.preventDefault(); leave(); });

  if (reduce) {
    body.classList.add('intro-still');
    apply(1);
    if (draw) draw.style.strokeDashoffset = '0';
    return;
  }

  body.classList.add('intro-scroll');

  // Never start the intro mid-scroll after a refresh/back-navigation.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

  const progress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) return 0;
    return Math.min(1, Math.max(0, window.scrollY / max));
  };

  const loop = () => {
    target = progress();
    value += (target - value) * 0.12;
    if (Math.abs(target - value) < 0.0015) value = target;
    apply(value);
    if (!leaving && target >= EXIT) leave();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // Any deliberate input also advances, so no one gets stuck.
  addEventListener('keydown', e => {
    if (['Enter', ' ', 'ArrowDown', 'PageDown', 'End'].includes(e.key)) {
      e.preventDefault();
      leave();
    }
  }, { passive: false });
  addEventListener('click', e => { if (!skip || !skip.contains(e.target)) leave(); }, { passive: true });
})();
