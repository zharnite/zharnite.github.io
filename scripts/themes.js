// Wallpaper registry. Each entry is loaded with a dynamic import, so a
// visitor downloads only the one they pick -- and a visitor who picks none
// never downloads Three.js at all.
//
// load() resolves to the world object itself, not the module, so one file can
// supply more than one world (the two title cards share title-card.js, and
// Steampunk and Vintage are one city in two lights, both in steampunk.js).
// A null load() means no 3D at all: the plain page.

export const THEMES = [
  {
    id: 'none',
    label: 'None',
    load: null,
  },
  {
    id: 'steampunk',
    label: 'Steampunk',
    load: () => import('./worlds/steampunk.js').then((m) => m.default),
  },
  {
    id: 'vintage',
    label: 'Vintage',
    load: () => import('./worlds/steampunk.js').then((m) => m.vintage),
  },
  {
    id: 'sea-sunset',
    label: 'Sea',
    load: () => import('./worlds/sea-sunset.js').then((m) => m.default),
  },
  {
    id: 'card',
    label: 'Card',
    load: () => import('./worlds/title-card.js').then((m) => m.color),
  },
  {
    id: 'card-mono',
    label: 'Card B&W',
    load: () => import('./worlds/title-card.js').then((m) => m.mono),
  },
];

// The plain white page is what the site was, and what it is again by default.
export const DEFAULT_THEME = 'none';

export const THEME_IDS = THEMES.map((t) => t.id);

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}
