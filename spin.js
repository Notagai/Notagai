/* The hero sticker is a fidget spinner. Drag the photo and it follows the
   cursor around its centre, then coasts on friction when you let go. The disc
   carries a little weight at the bottom, so once the spin dies down it swings
   back upright like a pendulum instead of resting at whatever angle it stopped.
   Only the picture inside the circular frame turns: the ink border and its hard
   shadow stay put, so the disc never looks warped while it spins. */
(() => {
  const photo = document.querySelector('.sticker .photo');
  const img = photo?.querySelector('img');
  if (!photo || !img) return;

  const DRAG = 1.5;            // how quickly a thrown sticker slows down
  const GRAVITY = 12;          // pull of the weighted bottom, in rad/s²
  const SWING = Math.PI / 2;   // past horizontal the weight still pulls full strength
  const REST_V = 0.08;         // rad/s under which the swing counts as stopped
  const REST_A = 0.02;         // rad from upright before it snaps home (~1°)
  const MAX_V = 22;            // rad/s ceiling, so a flick can't launch it
  const SMOOTH = 0.35;         // pointer velocity smoothing

  let angle = 0;               // radians, positive = clockwise on screen
  let velocity = 0;            // rad/s, positive = clockwise
  let dragging = false;
  let id = null;
  let prev = 0;                // last pointer angle around the centre
  let tPrev = 0;
  let raf = 0;
  let last = 0;

  img.draggable = false;

  // shortest way round, so crossing the atan2 seam never flips the wheel
  const wrap = d => Math.atan2(Math.sin(d), Math.cos(d));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function pointerAngle(e) {
    const r = photo.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  }

  function paint() {
    img.style.transform = `rotate(${angle}rad)`;
  }

  // d uses the css convention: positive turns clockwise
  function turn(d) {
    angle += d;
    paint();
  }

  function coast(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // the heavy side falls back to the bottom. Capping the swing at a quarter
    // turn keeps a perfectly upside-down rest from becoming a dead spot.
    const pull = Math.sin(clamp(wrap(angle), -SWING, SWING));
    velocity += -GRAVITY * pull * dt;
    velocity *= Math.exp(-DRAG * dt);
    turn(velocity * dt);
    if (Math.abs(velocity) < REST_V && Math.abs(wrap(angle)) < REST_A) {
      velocity = 0;
      raf = 0;
      angle = 0;              // same orientation as any full turn, tidier number
      paint();
      photo.classList.remove('spinning');
      return;
    }
    raf = requestAnimationFrame(coast);
  }

  function release(e) {
    if (!dragging || (e && e.pointerId !== id)) return;
    dragging = false;
    id = null;
    photo.classList.remove('spinning');
    // always hand over to the physics: even a slow release lets the weight
    // swing the sticker back upright
    last = performance.now();
    if (!raf) raf = requestAnimationFrame(coast);
  }

  photo.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true;
    id = e.pointerId;
    photo.classList.add('spinning');
    photo.setPointerCapture?.(e.pointerId);
    prev = pointerAngle(e);
    tPrev = performance.now();
    velocity = 0;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    e.preventDefault();
  });

  photo.addEventListener('pointermove', e => {
    if (!dragging || e.pointerId !== id) return;
    const a = pointerAngle(e);
    const d = wrap(a - prev);
    prev = a;
    const now = performance.now();
    const dt = Math.max(8, now - tPrev) / 1000;   // guard against a zero/tiny gap
    tPrev = now;
    turn(d);
    velocity += (Math.max(-MAX_V, Math.min(MAX_V, d / dt)) - velocity) * SMOOTH;
  });

  photo.addEventListener('pointerup', release);
  photo.addEventListener('pointercancel', release);
  photo.addEventListener('lostpointercapture', release);
})();
