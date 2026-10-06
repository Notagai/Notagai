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
  topButton.hidden = true;
  document.body.appendChild(topButton);

  const header = document.querySelector('.site-header');
  const updateHeader = () => {
    header?.classList.toggle('scrolled', window.scrollY > 0);
  };

  const updateTopButton = () => {
    topButton.hidden = window.scrollY < 400;
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
