/* The hero sticker is a fidget spinner. Drag the photo and it follows the
   cursor around its centre, then coasts on friction when you let go. Two full
   counterclockwise turns send you back to the intro (index.html).
   Only the picture inside the circular frame turns: the ink border and its hard
   shadow stay put, so the disc never looks warped while it spins. */
(() => {
  const photo = document.querySelector('.sticker .photo');
  const img = photo?.querySelector('img');
  if (!photo || !img) return;

  const TURNS = Math.PI * 4;   // two counterclockwise revolutions
  const DRAG = 2.4;            // how quickly a thrown sticker slows down
  const MIN = 0.4;             // rad/s under which it counts as stopped
  const MAX_V = 22;            // rad/s ceiling, so a flick can't launch it
  const SMOOTH = 0.35;         // pointer velocity smoothing

  let angle = 0;               // radians, positive = clockwise on screen
  let ccw = 0;                 // net counterclockwise travel, never negative
  let velocity = 0;            // rad/s, positive = clockwise
  let dragging = false;
  let id = null;
  let prev = 0;                // last pointer angle around the centre
  let tPrev = 0;
  let raf = 0;
  let last = 0;
  let leaving = false;

  img.draggable = false;

  // shortest way round, so crossing the atan2 seam never flips the wheel
  const wrap = d => Math.atan2(Math.sin(d), Math.cos(d));

  function pointerAngle(e) {
    const r = photo.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  }

  function paint() {
    img.style.transform = `rotate(${angle}rad)`;
  }

  // d uses the css convention: positive turns clockwise, so counterclockwise
  // travel is -d. Clockwise dragging can only unwind what was already wound.
  function turn(d) {
    angle += d;
    ccw = Math.max(0, ccw - d);
    paint();
    if (ccw >= TURNS) leave();
  }

  function leave() {
    if (leaving) return;
    leaving = true;
    velocity = 0;
    photo.classList.remove('spinning');
    photo.classList.add('spun');
    setTimeout(() => { location.href = 'index.html'; }, 460);
  }

  function coast(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    turn(velocity * dt);
    velocity *= Math.exp(-DRAG * dt);
    if (Math.abs(velocity) < MIN) {
      velocity = 0;
      raf = 0;
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
    if (leaving || Math.abs(velocity) < MIN) return;
    last = performance.now();
    if (!raf) raf = requestAnimationFrame(coast);
  }

  photo.addEventListener('pointerdown', e => {
    if (leaving) return;
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
