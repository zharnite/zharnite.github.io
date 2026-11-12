// The top nav: two dropdowns, Wallpaper and Time, sitting in the content
// column. Below the breakpoint the whole bar collapses behind a hamburger
// and the dropdowns become an accordion inside it.
//
// Built in JS rather than written into index.html, so a visitor with JS off
// sees the plain page instead of a row of dead controls.
//
// Each option list is a real radiogroup with arrow-key navigation. These are
// mutually exclusive choices, and toggle buttons would both misreport that
// to a screen reader and leave the group un-navigable from the keyboard.
//
// Time is the time of day, for the wallpapers that are one place in several
// lights. It is hidden on a wallpaper that has only the one.

function h(tag, props, children) {
  const el = document.createElement(tag);
  Object.assign(el, props || {});
  for (const c of children || []) el.appendChild(c);
  return el;
}

function chevron() {
  return (
    '<svg class="nav-chev" viewBox="0 0 12 12" aria-hidden="true" focusable="false">' +
    '<path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" ' +
    'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  );
}

// The lines start at the very edge of the viewBox (0.85 is half the stroke,
// so the round cap just touches it). They used to start 3 units in, which
// left the visible icon 2px right of the button border and underline that
// its box was correctly aligned with.
function burgerIcon() {
  return (
    '<svg viewBox="0 0 22 22" aria-hidden="true" focusable="false">' +
    '<path d="M0.85 6h16M0.85 11h16M0.85 16h16" fill="none" stroke="currentColor" ' +
    'stroke-width="1.7" stroke-linecap="round"/></svg>'
  );
}

function closeIcon() {
  return (
    '<svg viewBox="0 0 22 22" aria-hidden="true" focusable="false">' +
    '<path d="M2.85 5l12 12M14.85 5l-12 12" fill="none" stroke="currentColor" ' +
    'stroke-width="1.7" stroke-linecap="round"/></svg>'
  );
}

// One labelled dropdown: a trigger and the radiogroup it reveals. The
// trigger does not repeat the current value; the open list already marks
// it, and two places showing the same state is one too many.
function buildSet(label, items, getSelected, onPick, onToggle, preview) {
  const set = h('div', { className: 'nav-set' });

  const trigger = h('button', { type: 'button', className: 'nav-trigger' }, [
    h('span', { className: 'nav-label', textContent: label }),
  ]);
  trigger.insertAdjacentHTML('beforeend', chevron());
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-haspopup', 'true');

  const group = h('div', {
    className: preview ? 'nav-opts nav-opts-preview' : 'nav-opts',
    role: 'radiogroup',
  });
  group.setAttribute('aria-label', label);

  const buttons = [];

  function paint() {
    const sel = getSelected();
    buttons.forEach((b) => {
      const on = b.dataset.value === sel;
      b.setAttribute('aria-checked', String(on));
      // Only the selected option is a tab stop; arrows move within the group.
      b.tabIndex = on ? 0 : -1;
    });
    if (!buttons.some((b) => b.tabIndex === 0) && buttons[0]) buttons[0].tabIndex = 0;
  }

  // Arrows move the selection and leave the list open, as a radiogroup
  // should. This used to go through click(), which also closes the list, so
  // one key press selected, closed, and dropped focus on <body>.
  function move(from, delta) {
    const i = buttons.indexOf(from);
    const next = buttons[(i + delta + buttons.length) % buttons.length];
    onPick(next.dataset.value);
    paint();
    next.focus();
  }

  items.forEach((item) => {
    // In a preview group the row itself is painted with that wallpaper, so
    // it is a strip of the thing rather than a label naming it.
    const b = h('button', { type: 'button', className: 'nav-opt' }, [
      h('span', { className: 'nav-opt-text', textContent: item.label }),
    ]);
    b.setAttribute('role', 'radio');
    b.dataset.value = item.id;
    b.addEventListener('click', () => {
      onPick(item.id);
      paint();
      setOpen(false, true);
    });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        move(b, 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        move(b, -1);
      }
    });
    buttons.push(b);
    group.appendChild(b);
  });

  let open = false;

  // Closing hides whatever option had focus. Unless focus is sent back to
  // the trigger it falls to <body> and a keyboard user loses their place.
  function setOpen(next, refocus) {
    open = next;
    set.classList.toggle('is-open', open);
    trigger.setAttribute('aria-expanded', String(open));
    if (!open && refocus) trigger.focus();
  }

  trigger.addEventListener('click', () => {
    const next = !open;
    onToggle(api); // let the bar close the other one first
    setOpen(next);
    if (next) {
      const sel = buttons.find((b) => b.tabIndex === 0);
      if (sel) sel.focus();
    }
  });

  set.appendChild(trigger);
  set.appendChild(group);
  paint();

  const api = {
    el: set,
    paint,
    trigger,
    isOpen: () => open,
    close: (refocus) => setOpen(false, !!refocus),
  };
  return api;
}

export function buildMenu(opts) {
  const {
    navMount,
    themes,
    getTheme,
    onTheme,
    times,
    getTime,
    onTime,
    hasTime,
  } = opts;

  const nav = h('nav', { id: 'nav' });
  nav.setAttribute('aria-label', 'Site options');

  const toggle = h('button', { type: 'button', id: 'nav-toggle' });
  toggle.innerHTML = burgerIcon();
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'nav-sets');
  toggle.setAttribute('aria-label', 'Open menu');

  const sets = h('div', { id: 'nav-sets' });
  const allSets = [];

  // Only one dropdown at a time.
  function closeOthers(except) {
    allSets.forEach((s) => {
      if (s !== except) s.close();
    });
  }

  const wallpaper = buildSet('Wallpaper', themes, getTheme, onTheme, closeOthers, true);
  allSets.push(wallpaper);
  sets.appendChild(wallpaper.el);

  const time = buildSet('Time', times, getTime, onTime, closeOthers, false);
  allSets.push(time);
  sets.appendChild(time.el);
  time.el.hidden = !hasTime();

  nav.appendChild(sets);
  nav.appendChild(toggle);
  navMount.appendChild(nav);

  // --- collapsed bar ------------------------------------------------------
  //
  // Whether the hamburger is in play at all is CSS's decision, not this
  // file's: `is-open` only matters inside the narrow media query, so there
  // is no breakpoint duplicated in JS to drift out of step.

  let barOpen = false;

  function setBarOpen(next, refocus) {
    barOpen = next;
    nav.classList.toggle('is-open', barOpen);
    toggle.setAttribute('aria-expanded', String(barOpen));
    toggle.setAttribute('aria-label', barOpen ? 'Close menu' : 'Open menu');
    toggle.innerHTML = barOpen ? closeIcon() : burgerIcon();
    if (!barOpen) {
      closeOthers(null);
      if (refocus) toggle.focus();
    }
  }

  function onOutside(e) {
    if (nav.contains(e.target)) return;
    closeOthers(null);
    if (barOpen) setBarOpen(false, false);
  }

  // Escape closes the innermost open thing and is only swallowed when it
  // did: the first press closes a dropdown, the next the drawer, and with
  // nothing open the key is left alone for the rest of the page.
  function onKey(e) {
    if (e.key !== 'Escape') return;
    const openSet = allSets.find((s) => s.isOpen());
    if (openSet) {
      e.preventDefault();
      openSet.close(true);
      return;
    }
    if (barOpen) {
      e.preventDefault();
      setBarOpen(false, true);
    }
  }

  // Registered once rather than per open/close: the handlers are cheap and
  // this avoids the listener bookkeeping drifting out of step with state.
  document.addEventListener('pointerdown', onOutside, true);
  document.addEventListener('keydown', onKey, true);

  toggle.addEventListener('click', () => setBarOpen(!barOpen, false));

  return {
    // Called when state changes from outside the menu, so the marks and the
    // trigger values stay true.
    refresh() {
      wallpaper.paint();
      time.paint();
      const show = hasTime();
      if (!show) time.close();
      time.el.hidden = !show;
    },
  };
}
