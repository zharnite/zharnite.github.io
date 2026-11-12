import { THEMES, DEFAULT_THEME, TIMES, DEFAULT_TIME, getTheme } from './themes.js';
import { buildMenu } from './menu.js';

const THEME_KEY = 'zharnite.world';
const TIME_KEY = 'zharnite.time';

const canvas = document.getElementById('bg-canvas');
const navContainer = document.querySelector('#topbar .container');

let engine = null;
let enginePromise = null;
let currentId = null;
let currentTime = DEFAULT_TIME;
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

function readTime() {
  try {
    const v = localStorage.getItem(TIME_KEY);
    return TIMES.some((t) => t.id === v) ? v : DEFAULT_TIME;
  } catch (e) {
    return DEFAULT_TIME;
  }
}

function writeTime(id) {
  try {
    localStorage.setItem(TIME_KEY, id);
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

// `remember` is false for the one case where the page picks for the visitor
// (the plain page on a slow connection), so their own choice stays stored.
async function activate(id, remember = true) {
  const theme = getTheme(id);
  const my = ++token;

  // Colours flip first, so the page is never showing one world's ink over
  // another world's background.
  // The time of day is part of that: day wants dark ink where dusk and night
  // want light. A wallpaper with no times carries no data-time at all.
  const root = document.documentElement;
  root.setAttribute('data-theme', theme.id);
  if (theme.timed) root.setAttribute('data-time', currentTime);
  else root.removeAttribute('data-time');
  currentId = theme.id;
  if (remember) writeTheme(theme.id);
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
    const key = theme.timed ? theme.id + ':' + currentTime : theme.id;
    let mod = loaded.get(key);
    if (!mod) {
      mod = await theme.load(currentTime);
      loaded.set(key, mod);
    }
    if (my !== token) return;
    eng.setWorld(mod);
  } catch (e) {
    console.error('[world load]', theme.id, e);
    if (canvas) canvas.classList.remove('is-ready');
  }
}

function setTime(id) {
  if (!TIMES.some((t) => t.id === id)) return null;
  currentTime = id;
  writeTime(id);
  return activate(currentId);
}

// --- boot -----------------------------------------------------------------

function boot() {
  if (navContainer) {
    menu = buildMenu({
      navMount: navContainer,
      themes: THEMES.map((t) => ({ id: t.id, label: t.label })),
      getTheme: () => currentId,
      onTheme: (id) => activate(id),
      times: TIMES,
      getTime: () => currentTime,
      onTime: (id) => setTime(id),
      hasTime: () => !!getTheme(currentId).timed,
    });
  }

  // The site had sound for a while; forget what it stored.
  try {
    localStorage.removeItem('zharnite.sound');
    localStorage.removeItem('zharnite.track');
  } catch (e) {
    /* nothing to forget */
  }

  currentTime = readTime();
  // index.html marks the page `data-lite` when the visitor is saving data or
  // on a very slow connection: start plain, whatever was chosen before.
  const lite = document.documentElement.hasAttribute('data-lite');
  if (lite) activate(DEFAULT_THEME, false);
  else activate(readTheme());

  // Exposed for the verification pass.
  window.__bg = {
    stats: () => (engine ? engine.stats() : null),
    activate: (id) => activate(id),
    setTime: (id) => setTime(id),
    scene: () => (engine ? engine.scene : null),
    engineLoaded: () => !!engine,
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
