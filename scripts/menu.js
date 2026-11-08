// The top nav: two dropdowns, Wallpaper and Jukebox, sitting in the content
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
// The mute control is deliberately not in here. It is a persistent state,
// not a choice among options, so it floats in its own corner.

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

function burgerIcon() {
  return (
    '<svg viewBox="0 0 22 22" aria-hidden="true" focusable="false">' +
    '<path d="M3 6h16M3 11h16M3 16h16" fill="none" stroke="currentColor" ' +
    'stroke-width="1.7" stroke-linecap="round"/></svg>'
  );
}

function closeIcon() {
  return (
    '<svg viewBox="0 0 22 22" aria-hidden="true" focusable="false">' +
    '<path d="M5 5l12 12M17 5L5 17" fill="none" stroke="currentColor" ' +
    'stroke-width="1.7" stroke-linecap="round"/></svg>'
  );
}

function soundIcon(on) {
  const speaker = '<path d="M3 9.5v5h3.2L11 18.8V5.2L6.2 9.5H3z" fill="currentColor"/>';
  const waves =
    '<path d="M13.7 8.6a4.4 4.4 0 0 1 0 6.8M16 6.1a7.8 7.8 0 0 1 0 11.8" ' +
    'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
  const cross =
    '<path d="M14.2 9.4l4.6 5.2M18.8 9.4l-4.6 5.2" ' +
    'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
  return (
    '<svg viewBox="0 0 22 24" aria-hidden="true" focusable="false">' +
    speaker +
    (on ? waves : cross) +
    '</svg>'
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

  function move(from, delta) {
    const i = buttons.indexOf(from);
    const next = buttons[(i + delta + buttons.length) % buttons.length];
    next.focus();
    next.click();
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
      setOpen(false);
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

  function setOpen(next) {
    open = next;
    set.classList.toggle('is-open', open);
    trigger.setAttribute('aria-expanded', String(open));
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

  const api = { el: set, paint, close: () => setOpen(false), trigger };
  return api;
}

export function buildMenu(opts) {
  const {
    navMount,
    soundMount,
    themes,
    tracks,
    getTheme,
    getTrack,
    onTheme,
    onTrack,
    soundAvailable,
    isSoundOn,
    onSound,
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

  let jukebox = null;
  if (soundAvailable) {
    jukebox = buildSet('Jukebox', tracks, getTrack, onTrack, closeOthers, false);
    jukebox.el.classList.add('nav-set-jukebox');
    allSets.push(jukebox);
    sets.appendChild(jukebox.el);
  }

  nav.appendChild(sets);
  nav.appendChild(toggle);
  navMount.appendChild(nav);

  // --- mute, in its own corner -------------------------------------------

  let muteBtn = null;
  if (soundAvailable && soundMount) {
    muteBtn = h('button', { type: 'button', id: 'mute' });
    muteBtn.addEventListener('click', () => {
      onSound(!isSoundOn());
      paintSound();
    });
    soundMount.appendChild(muteBtn);
  }

  function paintSound() {
    const on = isSoundOn();
    // A chosen track with the sound off looks broken. Dim the control so
    // the dependency is visible rather than something to work out.
    nav.dataset.muted = String(!on);
    if (!muteBtn) return;
    muteBtn.innerHTML = soundIcon(on);
    const label = on ? 'Sound on' : 'Sound off';
    muteBtn.setAttribute('aria-pressed', String(on));
    muteBtn.setAttribute('aria-label', label);
    muteBtn.setAttribute('title', label);
  }
  paintSound();

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

  function onKey(e) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    const hadDropdown = allSets.some((s) => s.el.classList.contains('is-open'));
    closeOthers(null);
    if (hadDropdown) return; // first Escape closes the dropdown
    if (barOpen) setBarOpen(false, true);
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
      if (jukebox) jukebox.paint();
      paintSound();
    },
  };
}
