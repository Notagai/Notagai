/* Landing intro.
   One screen: the wordmark, the squiggle it draws, and a terminal that types
   the install command in, then reports it done. Scrolling (or any key / click)
   draws the rest of the squiggle and then leaves for home.html.
   With prefers-reduced-motion the drawing and the typing are skipped: the mark
   shows complete, the command is already there, and any input goes straight
   through. No-JS visitors still get the command and the Skip link. */
(() => {
  const body = document.body;
  const intro = document.querySelector('.intro');
  const stage = document.querySelector('.intro-stage');
  const draw = stage?.querySelector('.intro-squiggle .draw');
  const word = stage?.querySelector('.intro-word');
  const cue = stage?.querySelector('.intro-cue');
  const skip = stage?.querySelector('.intro-skip');
  const term = stage?.querySelector('.intro-term');
  const cmd = stage?.querySelector('.intro-term-cmd');
  const line = stage?.querySelector('.intro-term-line');
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

  // --- the command types itself in, then the install note fades up ---
  if (cmd && term) {
    // collapse any source formatting (line breaks, indentation) into single
    // spaces, so the typewriter can never replay it as a gap in the command
    const full = cmd.textContent.replace(/\s+/g, ' ').trim();
    if (reduce) {
      term.classList.add('is-done');
    } else {
      cmd.textContent = '';
      let i = 0;
      // Rhythm: brisk, a deliberate beat on the &&, then quicker than before.
      const beat = full.indexOf('&&');
      const pauseAt = at => beat < 0 ? 0
        : at === beat ? 210
        : at === beat + 1 ? 130
        : at === beat + 2 ? 55
        : 0;
      const type = () => {
        if (leaving) { cmd.textContent = full; term.classList.add('is-done'); return; }
        i += 1;
        cmd.textContent = full.slice(0, i);
        if (line) line.scrollLeft = line.scrollWidth;
        if (i >= full.length) { term.classList.add('is-done'); return; }
        const quick = beat >= 0 && i > beat + 2 ? 0.78 : 1;
        setTimeout(type, (13 + Math.random() * 24) * quick + pauseAt(i));
      };
      setTimeout(type, 480);         // after the wordmark letters have landed
    }
  }

  function apply(p) {
    if (draw) draw.style.strokeDashoffset = String(100 - p * 100);
    if (word) {
      word.style.transform = `translateY(${-26 * p}px) scale(${1 + p * 0.08})`;
      word.style.opacity = String(1 - p * 0.65);
    }
    if (cue) cue.style.opacity = String(Math.max(0, 1 - p * 2.4));
  }

  /* ---------- the terminal's closing command ---------- */
  const log = (() => {
    if (!term) return null;
    let el = term.querySelector('.intro-term-log');
    if (!el) {
      el = document.createElement('div');
      el.className = 'intro-term-log';
      term.append(el);
    }
    return el;
  })();

  function termLine(cls) {
    const p = document.createElement('p');
    p.className = 'term-line' + (cls ? ' ' + cls : '');
    log.append(p);
    return p;
  }

  // A command appended to the log has to read exactly like the install command
  // in the card: same 13px ink line, same accent prompt, same blinking caret.
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

  function printLine(text, cls) {
    const p = termLine(cls);
    p.textContent = text;
    return p;
  }

  function go() {
    intro?.classList.add('leaving');
    if (reduce) { window.location.href = HOME; return; }
    setTimeout(() => { window.location.href = HOME; }, 620);
  }

  // Scrolling runs one last command so the page never just cuts away; the
  // Skip link (straight = true) leaves without it.
  function leave(straight) {
    if (leaving) return;
    leaving = true;
    if (straight || reduce || !log) { go(); return; }
    typeCommand('notagai', () => {
      setTimeout(() => {
        printLine('Success! Exit code: 0', 'term-out');
        setTimeout(go, 480);
      }, 260);
    });
  }

  // Skip link is a real link, so it works without JS; intercept to play the exit.
  skip?.addEventListener('click', e => { e.preventDefault(); leave(true); });

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

  // Scrolling, the Skip link and the keys below are the only ways out; a
  // stray click on the intro should do nothing.
  addEventListener('keydown', e => {
    if (['Enter', ' ', 'ArrowDown', 'PageDown', 'End'].includes(e.key)) {
      e.preventDefault();
      leave();
    }
  }, { passive: false });
})();
