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
})();
