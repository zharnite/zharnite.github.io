// Wallpaper registry. Each entry is loaded with a dynamic import, so a
// visitor downloads only the one they pick -- and a visitor who picks none
// never downloads Three.js at all.
//
// load() resolves to the world object itself, not the module, so one file can
// supply more than one world.
// A null load() means no 3D at all: the plain page.
//
// A `timed` wallpaper is one place in three lights. Its load() is handed the
// time of day and resolves to that version; the Time menu only appears on
// wallpapers that have one.

export const THEMES = [
  {
    id: 'none',
    label: 'None',
    load: null,
  },
  {
    id: 'steampunk',
    label: 'Steampunk',
    timed: true,
    load: (time) => import('./worlds/steampunk.js').then((m) => m.worlds[time]),
  },
  {
    id: 'station',
    label: 'Station',
    timed: true,
    load: (time) => import('./worlds/station.js').then((m) => m.worlds[time]),
  },
  {
    id: 'old-tv',
    label: 'Old TV',
    load: () => import('./worlds/title-card.js').then((m) => m.mono),
  },
];

// The plain white page is what the site was, and what it is again by default.
export const DEFAULT_THEME = 'none';

// Times of day, for the wallpapers that have them. Dusk is the light both
// were first painted in, so it is where a visitor starts.
export const TIMES = [
  { id: 'day', label: 'Day' },
  { id: 'dusk', label: 'Dusk' },
  { id: 'night', label: 'Night' },
];
export const DEFAULT_TIME = 'dusk';

export const THEME_IDS = THEMES.map((t) => t.id);

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}
