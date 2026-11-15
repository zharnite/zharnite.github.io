// The Wallpaper menu, at the right of the top bar: one button that opens a
// panel holding the wallpapers and, under them, the Time of day.
//
// Built in JS rather than written into index.html, so a visitor with JS off
// sees the plain page rather than a dead control.
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

// One radiogroup inside the panel. The wallpapers come straight under the
// button that names them, so that group has no heading of its own; it is
// still named for a screen reader.
function buildGroup(label, items, getSelected, onPick, preview) {
  const id = 'nav-group-' + label.toLowerCase();
  const el = h('div', { className: 'nav-group' });
  const heading = preview
    ? null
    : h('div', { className: 'nav-group-label', id, textContent: label });

  const group = h('div', {
    className: preview ? 'nav-opts nav-opts-preview' : 'nav-opts',
  });
  group.setAttribute('role', 'radiogroup');
  if (heading) group.setAttribute('aria-labelledby', id);
  else group.setAttribute('aria-label', label);

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

  // Arrows move the selection and keep focus in the group, as a radiogroup
  // should.
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
    // Picking leaves the panel open: the wallpaper and its time of day are
    // chosen together, and the page behind shows the result straight away.
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

  if (heading) el.appendChild(heading);
  el.appendChild(group);
  paint();

  return {
    el,
    paint,
    focusSelected() {
      const sel = buttons.find((b) => b.tabIndex === 0);
      if (sel) sel.focus();
    },
  };
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

  const nav = h('div', { id: 'nav' });

  const trigger = h('button', { type: 'button', className: 'nav-trigger' }, [
    h('span', { className: 'nav-label', textContent: 'Wallpaper' }),
  ]);
  trigger.insertAdjacentHTML('beforeend', chevron());
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'nav-panel');

  const panel = h('div', { id: 'nav-panel', hidden: true });

  const wallpaper = buildGroup('Wallpaper', themes, getTheme, onTheme, true);
  const time = buildGroup('Time', times, getTime, onTime, false);
  time.el.hidden = !hasTime();

  panel.appendChild(wallpaper.el);
  panel.appendChild(time.el);
  nav.appendChild(trigger);
  nav.appendChild(panel);
  navMount.appendChild(nav);

  let open = false;

  // Closing hides whatever option had focus. Unless focus is sent back to
  // the trigger it falls to <body> and a keyboard user loses their place.
  function setOpen(next, refocus) {
    open = next;
    nav.classList.toggle('is-open', open);
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (!open && refocus) trigger.focus();
  }

  trigger.addEventListener('click', () => {
    setOpen(!open, false);
    if (open) wallpaper.focusSelected();
  });

  // Escape is only swallowed when it closed something; with the panel shut
  // the key is left alone for the rest of the page.
  function onKey(e) {
    if (e.key !== 'Escape' || !open) return;
    e.preventDefault();
    setOpen(false, true);
  }

  function onOutside(e) {
    if (open && !nav.contains(e.target)) setOpen(false, false);
  }

  // Tabbing out of the panel closes it, so it is never left open behind
  // wherever focus has gone.
  nav.addEventListener('focusout', (e) => {
    if (open && e.relatedTarget && !nav.contains(e.relatedTarget)) setOpen(false, false);
  });

  // Registered once rather than per open/close: the handlers are cheap and
  // this avoids the listener bookkeeping drifting out of step with state.
  document.addEventListener('pointerdown', onOutside, true);
  document.addEventListener('keydown', onKey, true);

  return {
    // Called when state changes from outside the menu, so the marks stay
    // true and Time shows only for a wallpaper that has one.
    refresh() {
      wallpaper.paint();
      time.paint();
      time.el.hidden = !hasTime();
    },
  };
}
