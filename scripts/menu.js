// The top nav: wallpaper and jukebox pickers laid out in the content
// column, collapsing to a hamburger panel on narrow screens. Built in JS
// rather than written into index.html, so a visitor with JS off sees the
// plain page instead of a row of dead controls.
//
// Each picker is a real radiogroup with arrow-key navigation. These are
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

function buildGroup(label, items, getSelected, onPick) {
  const group = h('div', { className: 'nav-opts', role: 'radiogroup' });
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
    const b = h('button', { type: 'button', className: 'nav-opt', textContent: item.label });
    b.setAttribute('role', 'radio');
    b.dataset.value = item.id;
    b.addEventListener('click', () => {
      onPick(item.id);
      paint();
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

  paint();
  return { el: group, paint };
}

function navSet(label, group) {
  return h('div', { className: 'nav-set' }, [
    h('span', { className: 'nav-label', textContent: label }),
    group.el,
  ]);
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

  const wallpaper = buildGroup('Wallpaper', themes, getTheme, onTheme);
  sets.appendChild(navSet('Wallpaper', wallpaper));

  let jukebox = null;
  if (soundAvailable) {
    jukebox = buildGroup('Jukebox', tracks, getTrack, onTrack);
    const set = navSet('Jukebox', jukebox);
    set.classList.add('nav-set-jukebox');
    sets.appendChild(set);
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
    // A highlighted track with the sound off looks broken. Dim the row so
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

  // --- collapsed state ----------------------------------------------------
  //
  // Whether the hamburger is in play at all is CSS's decision, not this
  // file's: `is-open` only matters inside the narrow media query, so there
  // is no breakpoint duplicated in JS to drift out of step.

  let open = false;

  function setOpen(next, refocus) {
    open = next;
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    toggle.innerHTML = open ? closeIcon() : burgerIcon();
    if (open) {
      document.addEventListener('pointerdown', onOutside, true);
      document.addEventListener('keydown', onKey, true);
    } else {
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('keydown', onKey, true);
      if (refocus) toggle.focus();
    }
  }

  function onOutside(e) {
    if (!nav.contains(e.target)) setOpen(false, false);
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false, true);
    }
  }

  toggle.addEventListener('click', () => setOpen(!open, false));

  return {
    // Called when state changes from outside the menu, so the marks stay true.
    refresh() {
      wallpaper.paint();
      if (jukebox) jukebox.paint();
      paintSound();
    },
  };
}
