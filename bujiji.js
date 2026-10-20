/* Idle easter egg: after 20 seconds without input the terminal runs
   `apt install bujiji` (then `bujiji`), and once that finishes the first
   bujiji (the profile picture) drops from the roof and bounces down. One more
   follows five seconds later, then the gap shrinks exponentially, and it keeps
   going until the avatars actually cover the viewport. Clicking one pops it out
   of existence. Everything is drawn on a canvas so hundreds stay cheap.
   Skipped for reduced motion. */
(() => {
  const intro = document.getElementById('intro');
  if (!intro) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const SRC = 'favicon.png';
  const FIRST = 20000;      // idle time before the terminal wakes up
  const NEXT = 5000;        // then one every five seconds
  const DECAY = 0.62;       // ...then gap *= DECAY after every drop
  const MIN_GAP = 45;       // flood rate once the ramp bottoms out
  const GRAVITY = 2200;     // px / s²
  const FLOOR = 0.45;       // floor restitution
  const WALL = 0.68;
  const MAX_R = 70;         // keep CELL larger than the widest pair
  const CELL = MAX_R * 2 + 6;
  const DRAW = 1.06;        // faces are drawn a hair over their collider so the
                            // wall has no pinholes between touching circles
  const COVER = 0.94;       // "you can't see the page any more" (of drawn area)
  const STALL = 24;         // ...or this many drops that hide nothing new
  const CAP = 700;          // absolute ceiling on bodies
  const POP_MS = 300;       // how long a clicked bujiji takes to vanish

  const canvas = document.createElement('canvas');
  canvas.className = 'bujiji-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  intro.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const bodies = [];
  const pops = [];
  const probe = document.createElement('canvas');
  probe.width = 160;
  probe.height = 90;
  const pctx = probe.getContext('2d', { willReadFrequently: true });

  let sprite = null;
  let W = innerWidth, H = innerHeight, DPR = 1;
  let cols = 0, rows = 0, buckets = [];
  let gap = NEXT, timer = 0, raf = 0, last = 0;
  let started = false, still = 0;

  const cssVar = name =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#221a33';

  /* ---------- the avatar, pre-rendered once into two sprites ---------- */
  // Split in two on purpose: the disc (hard shadow + solid ink rim) is drawn
  // unrotated, and only the face spins. Baking both into one rotating sprite
  // made the shadow orbit the ball, which is what looked wrong at the edge.
  function buildSprite(image) {
    const S = 320;          // big enough for the largest avatar at 2x
    const R = 138;          // outer radius of the disc
    const RING = 10;        // ink rim width (≈3.5% of the radius)
    const OFF = 6;          // hard shadow offset

    const back = document.createElement('canvas');
    back.width = back.height = S;
    const b = back.getContext('2d');
    b.fillStyle = cssVar('--shadow');
    b.beginPath();
    b.arc(S / 2 + OFF, S / 2 + OFF, R, 0, Math.PI * 2);
    b.fill();
    b.fillStyle = cssVar('--ink');            // the rim shows as the uncovered edge
    b.beginPath();
    b.arc(S / 2, S / 2, R, 0, Math.PI * 2);
    b.fill();

    const face = document.createElement('canvas');
    face.width = face.height = S;
    const f = face.getContext('2d');
    const FR = R - RING;
    f.save();
    f.beginPath();
    f.arc(S / 2, S / 2, FR, 0, Math.PI * 2);
    f.clip();
    f.drawImage(image, S / 2 - FR, S / 2 - FR, FR * 2, FR * 2);
    f.restore();

    sprite = { back, face, size: S, radius: R };
    draw();
    if (bodies.length) wake();
  }

  const image = new Image();
  image.onload = () => buildSprite(image);
  image.src = SRC;

  /* ---------- sizing ---------- */
  function resize() {
    W = innerWidth;
    H = innerHeight;
    // cap total pixels as well as density: a canvas over the browser's limit
    // fails to allocate and the whole layer goes blank
    DPR = Math.min(2, devicePixelRatio || 1, Math.sqrt(12e6 / Math.max(1, W * H)));
    DPR = Math.max(0.75, DPR);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    cols = Math.ceil(W / CELL) + 1;
    rows = Math.ceil(H / CELL) + 1;
    buckets = new Array(cols * rows);
    for (let i = 0; i < buckets.length; i++) buckets[i] = [];
    for (const b of bodies) {
      b.x = Math.min(Math.max(b.r, b.x), Math.max(b.r, W - b.r));
      if (b.y > H - b.r) b.y = H - b.r;
    }
    draw();
    if (bodies.length) wake();
  }

  /* ---------- drawing ---------- */
  function drawBody(x, y, rot, r) {
    const s = (r * DRAW / sprite.radius) * DPR;
    const off = -sprite.size / 2;
    const cs = Math.cos(rot) * s;
    const sn = Math.sin(rot) * s;
    ctx.setTransform(s, 0, 0, s, x * DPR, y * DPR);      // disc: never rotates
    ctx.drawImage(sprite.back, off, off);
    ctx.setTransform(cs, sn, -sn, cs, x * DPR, y * DPR);  // face: spins
    ctx.drawImage(sprite.face, off, off);
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!sprite) return;
    for (const b of bodies) {
      if (b.y + b.r < 0 || b.x + b.r < 0 || b.x - b.r > W) continue;   // offscreen
      drawBody(b.x, b.y, b.rot, b.r);
    }

    const now = performance.now();
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      const k = (now - p.t0) / POP_MS;
      if (k >= 1) { pops.splice(i, 1); continue; }
      const e = 1 - Math.pow(1 - k, 3);
      ctx.globalAlpha = 1 - e;
      drawBody(p.x, p.y, p.rot, p.r * (1 + e * 0.5));
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ---------- physics ---------- */
  function drop() {
    if (bodies.length >= CAP) return;
    const r = 30 + Math.round(Math.random() * 40);
    bodies.push({
      r,
      x: r + Math.random() * Math.max(1, W - r * 2),
      y: -r * 1.2,
      vx: (Math.random() - 0.5) * 180,
      vy: 80 + Math.random() * 260,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 3
    });
    wake();
  }

  function cellX(x) {
    return Math.min(cols - 1, Math.max(0, (x / CELL) | 0));
  }
  function cellY(y) {
    return Math.min(rows - 1, Math.max(0, (y / CELL) | 0));
  }

  function step(dt) {
    for (const b of bodies) {
      b.vy += GRAVITY * dt;
      if (b.vy > 1500) b.vy = 1500;                         // no runaway pressure
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      let grounded = false;

      if (b.y + b.r > H) {                                  // floor
        grounded = true;
        b.y = H - b.r;
        const impact = b.vy;
        if (impact > 70) {
          b.vy = -impact * FLOOR;
          b.vx *= 0.9;
        } else {
          b.vy = 0;
          b.vx *= Math.exp(-6 * dt);                        // rolling friction
          if (Math.abs(b.vx) < 5) b.vx = 0;
        }
      }
      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * WALL; }
      else if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * WALL; }

      // Spin is driven only by rolling along the floor, and only while it is
      // actually travelling: one revolution per 2πr. Anything in the air or
      // resting in a pile loses its spin almost at once, which is what keeps a
      // stack of avatars from turning into a swarm of tops.
      if (grounded && Math.abs(b.vx) > 8) {
        b.vr = b.vx / b.r;
      } else {
        b.vr *= Math.exp(-9 * dt);
        if (Math.abs(b.vr) < 0.35) b.vr = 0;
      }
      if (b.vr > 8) b.vr = 8;
      else if (b.vr < -8) b.vr = -8;
      b.rot = (b.rot + b.vr * dt) % (Math.PI * 2);
    }

    // spatial hash: CELL is wider than any pair of radii, so 3x3 is enough
    for (let i = 0; i < buckets.length; i++) buckets[i].length = 0;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      buckets[cellY(b.y) * cols + cellX(b.x)].push(i);
    }

    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      const gx = cellX(a.x), gy = cellY(a.y);
      for (let oy = -1; oy <= 1; oy++) {
        const ny = gy + oy;
        if (ny < 0 || ny >= rows) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const nx = gx + ox;
          if (nx < 0 || nx >= cols) continue;
          const bucket = buckets[ny * cols + nx];
          for (let k = 0; k < bucket.length; k++) {
            const j = bucket[k];
            if (j <= i) continue;
            const b = bodies[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const min = a.r + b.r;
            const d2 = dx * dx + dy * dy;
            if (d2 >= min * min || d2 === 0) continue;
            const d = Math.sqrt(d2);
            const ux = dx / d, uy = dy / d;
            const push = (min - d) / 2;
            a.x -= ux * push; a.y -= uy * push;
            b.x += ux * push; b.y += uy * push;
            const rel = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy;
            if (rel < 0) {
              const imp = -rel * 0.5;
              a.vx -= ux * imp; a.vy -= uy * imp;
              b.vx += ux * imp; b.vy += uy * imp;
            }
            // resting contact: on a slow touch, whoever is on top stops
            // pressing down, so a tall pile settles instead of churning
            // under its own weight. Fast impacts are left to the impulse.
            if (rel > -120) {
              if (uy > 0.3) { if (a.vy > 0) a.vy = 0; }
              else if (uy < -0.3) { if (b.vy > 0) b.vy = 0; }
            }
          }
        }
      }
    }

    // a push-apart can shove someone into a wall or the floor
    for (const b of bodies) {
      if (b.x < b.r) b.x = b.r;
      else if (b.x > W - b.r) b.x = W - b.r;
      if (b.y > H - b.r) b.y = H - b.r;
      if (b.vx > 900) b.vx = 900;
      else if (b.vx < -900) b.vx = -900;
    }
  }

  /* ---------- how much of the screen is hidden ---------- */
  function coverage() {
    if (!bodies.length || !pctx) return 0;
    const pw = probe.width, ph = probe.height;
    const sx = pw / W, sy = ph / H;
    pctx.clearRect(0, 0, pw, ph);
    pctx.fillStyle = '#000';
    for (const b of bodies) {
      const r = b.r * DRAW;                 // measure what is actually painted
      pctx.beginPath();
      pctx.ellipse(b.x * sx, b.y * sy, r * sx, r * sy, 0, 0, Math.PI * 2);
      pctx.fill();
    }
    const data = pctx.getImageData(0, 0, pw, ph).data;
    let hit = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 8) hit++;
    return hit / (pw * ph);
  }

  let lastCover = 0, flat = 0;

  /* ---------- loop ---------- */
  function frame(now) {
    const dt = last ? Math.min(0.02, (now - last) / 1000) : 0.016;
    last = now;
    step(dt);
    draw();

    let energy = 0;
    for (const b of bodies) energy += Math.abs(b.vx) + Math.abs(b.vy);
    if (pops.length || energy > bodies.length * 8) still = 0;
    else still++;
    if (still > 45) { raf = 0; return; }        // settled: stop burning frames
    raf = requestAnimationFrame(frame);
  }

  function wake() {
    still = 0;
    if (raf) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  // Stop as soon as the screen is hidden — or as soon as dropping more hides
  // nothing new, which is what happens the moment the pile has packed solid
  // (circles cannot tile a plane, so a fixed percentage alone would never be
  // reached and it would rain balls into a finished wall forever).
  function full() {
    if (bodies.length >= CAP) return true;
    const cover = coverage();
    flat = cover - lastCover < 0.002 ? flat + 1 : 0;
    lastCover = cover;
    if (bodies.length > 30 && cover >= COVER) return true;
    // the stall rule only gets a say once most of the screen is already gone,
    // so a slow early pile can never be mistaken for a finished one
    return flat > STALL && cover > 0.55;
  }

  function tick() {
    if (full()) { timer = 0; return; }
    drop();
    gap = Math.max(MIN_GAP, gap * DECAY);
    timer = setTimeout(tick, gap);
  }

  /* ---------- clicking pops a bujiji ---------- */
  function hitTest(x, y) {
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      const r = b.r * DRAW;                 // match what is painted on screen
      const dx = x - b.x, dy = y - b.y;
      if (dx * dx + dy * dy <= r * r) return b;
    }
    return null;
  }

  // The canvas only catches pointers while one is directly over a bujiji, and
  // never over the Skip link — otherwise a pile at the bottom of the stage
  // would swallow the one control that still has to work.
  const skip = document.querySelector('.intro-skip');
  let hot = false;

  function overSkip(x, y) {
    if (!skip) return false;
    const r = skip.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function setHot(on) {
    if (on === hot) return;
    hot = on;
    canvas.style.pointerEvents = on ? 'auto' : 'none';
    canvas.style.cursor = on ? 'pointer' : 'default';
  }

  addEventListener('pointermove', e => {
    if (!started) return;
    setHot(!overSkip(e.clientX, e.clientY) && !!hitTest(e.clientX, e.clientY));
  }, { passive: true });

  canvas.addEventListener('pointerdown', e => {
    const b = hitTest(e.clientX, e.clientY);
    if (!b) return;
    e.preventDefault();
    pops.push({ x: b.x, y: b.y, rot: b.rot, r: b.r, t0: performance.now() });
    bodies.splice(bodies.indexOf(b), 1);
    setHot(false);                              // get out of the way again
    wake();
  });

  /* ---------- the terminal runs the install before the first drop ---------- */
  const term = document.querySelector('.intro-term');
  let log = term ? term.querySelector('.intro-term-log') : null;
  if (term && !log) {
    log = document.createElement('div');
    log.className = 'intro-term-log';
    term.append(log);
  }

  function termLine(cls) {
    const p = document.createElement('p');
    p.className = 'term-line' + (cls ? ' ' + cls : '');
    log.append(p);
    return p;
  }

  // A command typed into the log has to look exactly like the install command
  // already in the card: same 13px ink line, same accent prompt, same caret.
  function typeCommand(text, done) {
    const p = document.createElement('p');
    p.className = 'intro-term-line';
    const prompt = document.createElement('span');
    prompt.className = 'intro-prompt';
    prompt.textContent = '$';
    const typed = document.createElement('span');
    const caret = document.createElement('span');
    caret.className = 'intro-caret';
    p.append(prompt, typed, caret);
    log.append(p);
    let i = 0;
    const step = () => {
      typed.textContent = text.slice(0, ++i);
      if (i < text.length) setTimeout(step, 22 + Math.random() * 28);
      else { caret.remove(); done(); }
    };
    step();
  }

  function printLine(mark, text, cls) {
    const p = termLine(cls);
    if (mark) {
      const span = document.createElement('span');
      span.className = 'tick';
      span.textContent = mark;
      p.append(span);
    }
    p.append(text);
    return p;
  }

  function runInstall(done) {
    if (!log) { done(); return; }
    typeCommand('apt install bujiji', () => {
      setTimeout(() => {
        printLine('✓', '3 packages installed 0.2s');
        setTimeout(() => {
          typeCommand('bujiji', () => {
            setTimeout(() => {
              printLine('', 'Success! Exit code: 0', 'term-out');
              setTimeout(done, 420);
            }, 260);
          });
        }, 420);
      }, 200);
    });
  }

  /* ---------- start ---------- */
  function start() {
    if (started) return;
    if (!sprite) { timer = setTimeout(start, 500); return; }   // wait for the avatar
    started = true;
    resize();
    runInstall(() => {
      drop();
      timer = setTimeout(tick, NEXT);
    });
  }

  // any real input before it begins pushes the start back
  function arm() {
    if (started) return;
    clearTimeout(timer);
    timer = setTimeout(start, FIRST);
  }

  resize();
  addEventListener('resize', resize, { passive: true });
  for (const type of ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart', 'scroll']) {
    addEventListener(type, arm, { passive: true });
  }
  arm();
})();
