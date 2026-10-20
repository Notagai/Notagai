/* Mobile menu toggle. Closes on Escape, outside click, or growing past the mobile width. */
(() => {
  const btn = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!btn || !nav) return;

  const set = open => {
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open);
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };

  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('click', e => {
    if (!nav.contains(e.target) && !btn.contains(e.target)) set(false);
  });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && nav.classList.contains('open')) { set(false); btn.focus(); }
  });
  matchMedia('(min-width:761px)').addEventListener('change', e => { if (e.matches) set(false); });

  const topButton = document.createElement('button');
  topButton.className = 'back-to-top';
  topButton.type = 'button';
  topButton.textContent = 'Back to top ↑';
  topButton.setAttribute('aria-label', 'Back to top');
  // visibility is a class so the button can fade/rise in instead of popping
  document.body.appendChild(topButton);

  const header = document.querySelector('.site-header');
  const updateHeader = () => {
    header?.classList.toggle('scrolled', window.scrollY > 0);
  };

  const updateTopButton = () => {
    topButton.classList.toggle('show', window.scrollY >= 400);
  };

  addEventListener('scroll', () => {
    updateHeader();
    updateTopButton();
  }, { passive: true });
  updateHeader();
  updateTopButton();
  topButton.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
})();

/* Wordmark logo: slow continuous rotation while hovered, then an exponential
   ease-in/out return to 0deg once the cursor leaves. */
(() => {
  const logo = document.querySelector('.wordmark img');
  if (!logo || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const mark = logo.closest('.wordmark') || logo;
  const SPEED = 45;          // degrees per second while hovered
  const RETURN = 850;        // ms for the ease-back

  let angle = 0, from = 0, t0 = 0, last = 0, raf = 0, hovering = false;
  const paint = () => { logo.style.transform = 'rotate(' + angle.toFixed(2) + 'deg)'; };
  const easeInOutExpo = x => x <= 0 ? 0 : x >= 1 ? 1
    : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2
    : (2 - Math.pow(2, -20 * x + 10)) / 2;

  function spin(t) {
    if (!hovering) return;
    if (!last) last = t;
    angle += SPEED * Math.min(64, t - last) / 1000;
    last = t;
    paint();
    raf = requestAnimationFrame(spin);
  }

  function settle(t) {
    if (hovering) return;
    const p = Math.min(1, (t - t0) / RETURN);
    angle = from * (1 - easeInOutExpo(p));
    paint();
    if (p < 1) raf = requestAnimationFrame(settle);
    else { angle = 0; paint(); raf = 0; }
  }

  mark.addEventListener('mouseenter', () => {
    cancelAnimationFrame(raf);
    hovering = true;
    last = 0;
    raf = requestAnimationFrame(spin);
  });
  mark.addEventListener('mouseleave', () => {
    if (!hovering) return;
    hovering = false;
    cancelAnimationFrame(raf);
    from = angle % 360;      // only unwind the turn in progress
    t0 = performance.now();
    raf = requestAnimationFrame(settle);
  });
})();

/* Soft glow that trails the pointer (visible through the frosted navbar). */
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!matchMedia('(hover:hover) and (pointer:fine)').matches) return;

  const glow = document.createElement('div');
  glow.className = 'cursor-glow';
  glow.setAttribute('aria-hidden', 'true');
  document.body.append(glow);

  let mx = innerWidth / 2, my = innerHeight / 2;   // pointer target
  let gx = mx, gy = my;                            // eased glow position
  let raf = 0;

  function frame() {
    gx += (mx - gx) * 0.12;
    gy += (my - gy) * 0.12;
    glow.style.transform = 'translate(' + gx.toFixed(1) + 'px,' + gy.toFixed(1) + 'px)';
    const settled = Math.abs(mx - gx) + Math.abs(my - gy) < 0.4;
    raf = settled ? 0 : requestAnimationFrame(frame);
  }
  const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };

  addEventListener('pointermove', e => {
    mx = e.clientX; my = e.clientY;
    glow.classList.add('on');
    wake();
  }, { passive: true });

  addEventListener('mouseout', e => { if (!e.relatedTarget) glow.classList.remove('on'); });
  wake();
})();

/* Water ripple drawn on the page background when clicking anything that is
   not a link or control. Realistic: a few thin, expanding, fading rings. */
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'ripple-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize();
  addEventListener('resize', resize);

  const LIFE = 1200;      // ms per ripple
  const SPREAD = 0.16;    // outward reach as a fraction of the diagonal
  const ripples = [];
  let raf = 0;

  const accent = () =>
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6b4ce6';

  function frame(now) {
    ctx.clearRect(0, 0, W, H);
    const diag = Math.hypot(W, H);
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      const p = (now - rp.t0) / LIFE;
      if (p >= 1) { ripples.splice(i, 1); continue; }
      const fade = (1 - p) * (1 - p);
      ctx.strokeStyle = rp.colour;
      for (let k = 0; k < 3; k++) {
        ctx.globalAlpha = fade * 0.16 * (1 - k * 0.26);
        ctx.lineWidth = 1.4 * (1 - p) + 0.4;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, p * diag * SPREAD * (1 + k * 0.16) + k * 15, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    raf = ripples.length ? requestAnimationFrame(frame) : 0;
    if (!raf) ctx.clearRect(0, 0, W, H);
  }

  document.addEventListener('pointerdown', e => {
    const t = e.target;
    if (t && t.closest && t.closest('a, button, input, textarea, select, label, [role="button"]')) return;
    ripples.push({ x: e.clientX, y: e.clientY, t0: performance.now(), colour: accent() });
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: true });
})();
