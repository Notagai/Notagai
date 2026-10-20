/* Stack page: side pull-out tabs.
   The rail on the left is a vertical tablist; picking a tab swaps the panel
   beside it, which slides out from behind the rail. Panels are display:none
   until active, so each one replays its pull-out animation when it appears.
   Without JS the html:not(.stack-js) rule simply lays every panel out. */
(() => {
  const rail = document.querySelector('.stack-rail');
  if (!rail) return;
  const tabs = Array.from(rail.querySelectorAll('[role="tab"]'));
  if (!tabs.length) return;

  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));

  // "3 items" badge, so a folded tab still says how much sits behind it
  tabs.forEach((tab, i) => {
    const badge = tab.querySelector('.stack-tab-count');
    const n = panels[i] ? panels[i].querySelectorAll('li').length : 0;
    if (badge && n) badge.textContent = n + (n === 1 ? ' item' : ' items');
  });

  function select(index, focus) {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (panels[i]) panels[i].classList.toggle('is-active', on);
    });
    if (focus) tabs[index].focus();
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i, false));
    tab.addEventListener('keydown', e => {
      let next = -1;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (i + 1) % tabs.length;
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      else return;
      e.preventDefault();
      select(next, true);
    });
  });

  // the markup already opens the first tab; this keeps the state in sync
  select(0, false);
})();
