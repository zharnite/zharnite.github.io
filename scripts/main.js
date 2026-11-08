import { THEMES, DEFAULT_THEME, getTheme } from './themes.js';
import { buildMenu } from './menu.js';
import * as audio from './audio.js';

const THEME_KEY = 'zharnite.world';

const canvas = document.getElementById('bg-canvas');
const navContainer = document.querySelector('#topbar .container');

let engine = null;
let enginePromise = null;
let currentId = null;
let token = 0;
let menu = null;
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

// --- engine, on demand ----------------------------------------------------
//
// The default page is plain white, and a plain white page has no business
// downloading Three.js. Both the engine and the library it pulls in are
// fetched the first time someone actually picks a wallpaper.

function getEngine() {
  if (engine) return Promise.resolve(engine);
  if (!enginePromise) {
    enginePromise = import('./engine.js')
      .then((m) => {
        engine = canvas ? m.createEngine(canvas) : null;
        if (!engine && canvas) canvas.classList.add('is-failed');
        return engine;
      })
      .catch((e) => {
        console.error('[engine load]', e);
        if (canvas) canvas.classList.add('is-failed');
        return null;
      });
  }
  return enginePromise;
}

// --- activation -----------------------------------------------------------

async function activate(id) {
  const theme = getTheme(id);
  const my = ++token;

  // Colours flip first, so the page is never showing one world's ink over
  // another world's background.
  document.documentElement.setAttribute('data-theme', theme.id);
  currentId = theme.id;
  writeTheme(theme.id);
  if (menu) menu.refresh();

  // No wallpaper: tear any world down and let the CSS background show.
  if (!theme.load) {
    if (engine) engine.clear();
    if (canvas) canvas.classList.remove('is-ready');
    return;
  }

  const eng = await getEngine();
  if (!eng || my !== token) return; // no WebGL, or a newer pick won

  try {
    let mod = loaded.get(theme.id);
    if (!mod) {
      mod = await theme.load();
      loaded.set(theme.id, mod);
    }
    if (my !== token) return;
    eng.setWorld(mod);
  } catch (e) {
    console.error('[world load]', theme.id, e);
    if (canvas) canvas.classList.remove('is-ready');
  }
}

// --- boot -----------------------------------------------------------------

function boot() {
  if (navContainer) {
    menu = buildMenu({
      navMount: navContainer,
      themes: THEMES.map((t) => ({ id: t.id, label: t.label })),
      tracks: audio.TRACKS.map((t) => ({ id: t.id, label: t.label })),
      getTheme: () => currentId,
      getTrack: () => audio.getTrack(),
      onTheme: (id) => activate(id),
      onTrack: (id) => audio.setTrack(id),
      soundAvailable: audio.available(),
    });
  }

  activate(readTheme());

  // Exposed for the verification pass.
  window.__bg = {
    stats: () => (engine ? engine.stats() : null),
    activate: (id) => activate(id),
    scene: () => (engine ? engine.scene : null),
    engineLoaded: () => !!engine,
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
