import { createEngine } from './engine.js';
import { THEMES, DEFAULT_THEME, getTheme } from './themes.js';
import * as audio from './audio.js';

const THEME_KEY = 'zharnite.world';

const canvas = document.getElementById('bg-canvas');
const tagline = document.getElementById('tagline');
const footerContainer = document.querySelector('#main-footer .container');

let engine = null;
let currentId = null;
let token = 0;
const loaded = new Map();

// --- persistence ----------------------------------------------------------

function readTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return THEMES.some((t) => t.id === v) ? v : DEFAULT_THEME;
  } catch (e) {
    return DEFAULT_THEME;
  }
}

function writeTheme(id) {
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch (e) {
    /* blocked storage is not fatal */
  }
}

// --- switcher UI ----------------------------------------------------------

const buttons = new Map();
let soundBtn = null;

// Inline SVG rather than the Font Awesome kit. The kit is a remote script
// whose major version we do not control, and icon names moved between
// FA5 and FA6 (fa-volume-mute became fa-volume-xmark). This draws the same
// mark in both states, inherits the theme colour via currentColor, needs no
// network, and cannot arrive late.
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

function paintSound(on) {
  if (!soundBtn) return;
  soundBtn.innerHTML = soundIcon(on);
  const label = on ? 'Sound on' : 'Sound off';
  soundBtn.setAttribute('aria-label', label);
  soundBtn.setAttribute('title', label);
}

function buildSwitcher() {
  if (!footerContainer) return;

  const wrap = document.createElement('div');
  wrap.id = 'world-switch';

  const group = document.createElement('div');
  group.className = 'switch-group';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Background world');

  THEMES.forEach((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'switch-btn';
    b.dataset.world = t.id;
    b.textContent = t.label;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      activate(t.id, { fromUser: true });
    });
    group.appendChild(b);
    buttons.set(t.id, b);
  });

  wrap.appendChild(group);

  if (audio.available()) {
    soundBtn = document.createElement('button');
    soundBtn.type = 'button';
    soundBtn.className = 'switch-btn switch-sound';
    soundBtn.setAttribute('aria-pressed', String(audio.isEnabled()));
    paintSound(audio.isEnabled());
    soundBtn.addEventListener('click', () => {
      const on = audio.setEnabled(!audio.isEnabled());
      soundBtn.setAttribute('aria-pressed', String(on));
      paintSound(on);
      // The click is the gesture that unlocks audio, so play right away.
      if (on) audio.play(currentId);
    });
    wrap.appendChild(soundBtn);
  }

  footerContainer.appendChild(wrap);
}

function markActive(id) {
  buttons.forEach((b, bid) => {
    b.setAttribute('aria-pressed', String(bid === id));
  });
}

// --- activation -----------------------------------------------------------

async function activate(id, opts) {
  const fromUser = !!(opts && opts.fromUser);
  if (id === currentId && !fromUser) return;

  const theme = getTheme(id);
  const my = ++token;

  // Colours and copy flip immediately, so the page never sits in a state
  // where the ink belongs to one world and the background to another.
  document.documentElement.setAttribute('data-theme', theme.id);
  if (tagline) tagline.textContent = theme.tagline;
  markActive(theme.id);
  currentId = theme.id;
  writeTheme(theme.id);

  audio.setMusic(theme.music);
  if (fromUser) audio.play(theme.id);

  if (!engine) return; // no WebGL: the CSS fallback gradient is the background

  try {
    let mod = loaded.get(theme.id);
    if (!mod) {
      mod = await theme.load();
      loaded.set(theme.id, mod);
    }
    if (my !== token) return; // a newer click won
    engine.setWorld(mod);
  } catch (e) {
    console.error('[world load]', theme.id, e);
    canvas.classList.remove('is-ready');
  }
}

// --- boot -----------------------------------------------------------------

function boot() {
  buildSwitcher();

  if (canvas) {
    engine = createEngine(canvas);
    if (!engine) canvas.classList.add('is-failed');
  }

  activate(readTheme(), { fromUser: false });

  // Exposed for the leak check in the verification pass.
  window.__bg = {
    stats: () => (engine ? engine.stats() : null),
    activate: (id) => activate(id, { fromUser: false }),
    scene: () => (engine ? engine.scene : null),
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
