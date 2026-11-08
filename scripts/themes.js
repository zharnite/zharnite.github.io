// World registry. Each world is loaded with a dynamic import, so a visitor
// only downloads the one they are actually looking at. Paths must be truly
// relative and carry the .js extension: there is no resolver here.
//
// load() resolves to the world object itself, not the module, so one file can
// supply more than one world (the two title cards share title-card.js).

export const THEMES = [
  {
    id: 'airship',
    music: 'deco',
    label: 'Airship',
    tagline: 'Passage by air, weather permitting.',
    load: () => import('./worlds/airship.js').then((m) => m.default),
  },
  {
    id: 'sea-sunset',
    music: 'calm',
    label: 'Sea',
    tagline: 'Last light, somewhere off the coast.',
    load: () => import('./worlds/sea-sunset.js').then((m) => m.default),
  },
  {
    id: 'card',
    music: 'deco',
    label: 'Card',
    tagline: 'A short subject, in Technicolor.',
    load: () => import('./worlds/title-card.js').then((m) => m.color),
  },
  {
    id: 'card-mono',
    music: 'deco',
    label: 'Card B&W',
    tagline: 'A short subject, in black and white.',
    load: () => import('./worlds/title-card.js').then((m) => m.mono),
  },
];

export const DEFAULT_THEME = 'airship';

export const THEME_IDS = THEMES.map((t) => t.id);

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}
