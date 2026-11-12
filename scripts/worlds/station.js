import * as THREE from 'three';
import * as skyShader from '../shaders/sky-twilight.js';
import * as gradeShader from '../shaders/grade.js';
import {
  PAINT,
  EDGE,
  TRACKS,
  PLAT_Y,
  PLAT_BACK,
  PLAT_END,
  Z_BEHIND,
  FENCE_H,
  HEDGE_L,
  HEDGE_R,
  hedgeTop,
  SPAN,
  FIRST_GANTRY,
  GANTRIES,
  MAST_L,
  MAST_R,
  MAST_TOP,
  LAMP,
  SHELTER,
  TRAIN_BOX,
  TREES_L,
  SUN,
  solidVertex,
  solidFragment,
  wireVertex,
  wireFragment,
  glowVertex,
  glowFragment,
} from '../shaders/station.js';

// A station platform at dusk, and every so often a train. The view is from
// the platform looking down the line: the train appears as a pair of lights
// in the haze, comes straight toward the camera and runs past on the right.
// The clouds drift. Nothing else moves.
//
// It comes in three lights: dusk, which is how it was first painted, a clear
// day and night. They are the same geometry with a different palette, sun and
// set of lamps: see TIMES below.
//
// Unlike the city, this is real geometry in metres, because a train coming
// toward you is perspective and nothing else. It is still only three draw
// calls of solid matter: the station, the train, and the sky.

const FOV = 40; // a long lens, the way painted backgrounds are framed
const EYE = 2.75; // standing on the platform, 1.6 m above it
const Z_FAR = -1500;

// Where the platform, the masts, the lamps and the trees stand is laid out
// in shaders/station.js, which needs it too, for their shadows. The first
// gantry is far enough off that its mast does not stand behind the heading.
const FEED_L = [-2.9, -2.2, -1.5];
const FEED_R = [10.1, 11.1];

const CARS = 6;
const CAR_L = 20;
const CAR_GAP = 0.6;
const HALF_W = TRAIN_BOX.halfW;
const BODY_Y0 = 1.0;
const BODY_Y1 = TRAIN_BOX.top;
const TRAIN_LEN = CARS * (CAR_L + CAR_GAP);

// The train: where it appears (lost in the haze), how fast it runs, and how
// often. It needs (END - START) / SPEED seconds to pass, about 39; the rest
// of PERIOD the line is empty.
const SPEED = 20;
const START = -640;
const END = TRAIN_LEN + 12;
const PERIOD = 45;
const FIRST_Z = -170; // where it is when the wallpaper opens
const STILL_Z = -40; // where it stands if motion is switched off

const FOG = 0.0052;

// The ground shakes as the train goes by. The shake comes in as the nose
// reaches the edge of the picture, holds while the train is alongside and
// goes as the tail passes. It is the camera that moves, a couple of pixels
// at most, so the page's lettering stays still. Radians.
const RUMBLE = { pitch: 0.0017, yaw: 0.0012 };

// How fast the wind carries the clouds (to the right and toward the camera)
// and how fast they change shape as they go. Cloud-layer units per second: a
// big heap is about half a unit across, so at this rate it moves its own
// width in about a minute: plainly moving, but not hurrying.
const WIND = [0.009, 0.004];
const BOIL = [0.003, -0.002];

// The palette at dusk. Day and night are written as changes to it.
const DUSK = {
  top: 0x1826b4,
  mid: 0x4450e4,
  low: 0xdc86dc,
  warm: 0xffa672,
  // Lavender, between the blue of the shade and the pink of the low sky, so
  // the distance fades into the sunset and not into a pale blue band.
  haze: 0xb9a4f0,
  // Clouds: coral where the sun is on them, pink through the body, violet
  // behind, and gold kept for the rim that faces the sun. The two darkest
  // are purple, not blue, so a cloud's shadow never reads as a hole in it.
  cloudHot: 0xffd9a0,
  cloudLit: 0xff9a8c,
  cloudMid: 0xee74b6,
  cloudShade: 0xa468dc,
  cloudDeep: 0x7450c8,

  steel: 0x141a4a,
  insulator: 0xcfd6f5,
  platFace: 0x232a6a,
  coping: 0x7780cc,
  fence: 0x1e2660,
  wall: 0x343f8c,
  roof: 0x1c2358,
  bench: 0x5a66b8,
  board: 0xe9ecff,
  pane: 0xe7b266,
  lamp: 0xfff0cc,
  trunk: 0x151a44,

  body: 0xf4f5fd,
  bodyRoof: 0xb9c0ee,
  roofGear: 0x8791d0,
  under: 0x141940,
  bogie: 0x0d1130,

  red: 0xe8334a,
  blue: 0x2aa6f0,
  glass: 0x141a4e,
  window: 0xffc24a,
  lens: 0xfff1dc,

  ballast: 0x4a55ac,
  sleeper: 0x2b3484,
  rail: 0xffd6a0,
  verge: 0x1c4a86,
  plat: 0x3a4298,
  yellow: 0xf2bc3c,
  warmLight: 0xff8a3c,
  glare: 0xffd9a0,
  leafDeep: 0x0f2460,
  leafShade: 0x154c90,
  leafMid: 0x1f8cb0,
  leafLit: 0x62d6cc,
  wire: 0x141a46,
};

// Day is a different picture: nothing in it is lit from inside, so every
// surface has its real colour and the sun and the shade do the rest.
const DAY = {
  top: 0x3f86e4,
  mid: 0x6fb2f2,
  low: 0xc4e4fb,
  warm: 0xe8f5ff,
  haze: 0xd4e8f8,
  cloudHot: 0xffffff,
  cloudLit: 0xf7fbff,
  cloudMid: 0xdfeafb,
  cloudShade: 0xb8cbee,
  cloudDeep: 0x9cb2e2,

  steel: 0x424a5c,
  insulator: 0xe9ecf2,
  platFace: 0x77787f,
  coping: 0xd6d6d2,
  fence: 0x5a6478,
  wall: 0xc9d0d8,
  roof: 0x4d5e7e,
  bench: 0x3f78c0,
  board: 0xffffff,
  pane: 0x9fc0d8, // glass, with the light off behind it
  lamp: 0xf4f1e6,
  trunk: 0x4b3a2a,

  body: 0xfafbfd,
  bodyRoof: 0xc4c8d2,
  roofGear: 0x9299a8,
  under: 0x2c303c,
  bogie: 0x1d2029,
  glass: 0x1f3352,
  window: 0x35507a, // dark glass holding a little sky
  lens: 0xfff6e0,

  ballast: 0x9a9186,
  sleeper: 0x66584c,
  rail: 0xd4d8e0,
  verge: 0x64a455,
  plat: 0xbdbab2,
  yellow: 0xf4c531,
  leafDeep: 0x1e5a38,
  leafShade: 0x2f8048,
  leafMid: 0x55ab50,
  leafLit: 0xa3dc6c,
  wire: 0x2a3040,
};

// Night keeps dusk's colours for everything solid and turns the light down
// on them; only the sky, and the leaves, which are painted and not lit, need
// colours of their own.
const NIGHT = {
  top: 0x050818,
  mid: 0x0d1440,
  low: 0x232a72,
  warm: 0x2e3684,
  haze: 0x1c2358,
  cloudHot: 0xaebcf2, // the rim the moon catches
  cloudLit: 0x5a66b8,
  cloudMid: 0x3a4390,
  cloudShade: 0x283070,
  cloudDeep: 0x1c2258,
  leafDeep: 0x081638,
  leafShade: 0x0d2a52,
  leafMid: 0x144a6a,
  leafLit: 0x24708a,
  wire: 0x0a0e2a,
};

let C = DUSK;

// The moon: a little right of the line and fifteen degrees up, clear of the
// lettering on a wide window and above it on a narrow one.
const MOON = [0.1157, 0.2571, -0.9594];

// What changes with the time of day, besides the palette.
//   sun        toward the sun along the ground, and the tangent of its height
//   sunMul     sunlit ground as a multiple of its own colour (day)
//   sunFlat    sunlit ground as one warm colour laid over it (dusk)
//   groundKey  whether the key light also falls on the ground; by day the key
//              is the sun, and sunlit() already decides where that reaches
//   light      toward the key light, for everything that is not ground
//   skyLight   the direction on the ground the clouds are lit from
const TIMES = {
  dusk: {
    palette: {},
    sun: SUN,
    sunAmt: 1,
    sunMul: [0, 0, 0],
    sunFlat: 1,
    groundKey: 1,
    light: [0.3, 0.22, 0.93],
    // Shade is a saturated blue-violet and the light on top of it is orange:
    // the two opposite colours are what make dusk look vivid.
    key: [0.78, 0.54, 0.36],
    amb: [0.48, 0.52, 0.94],
    skyUp: [0.1, 0.08, 0.16],
    skyLight: [SUN.x, SUN.z],
    stars: 0,
    moon: 0,
    lampAmt: 0,
    lampGlows: true,
    glowGain: 1,
    vibrance: 0.16,
    vignette: 0.3,
  },
  // The sun high, behind the camera's left shoulder: everything faces it, and
  // the shadows are short and fall away down the platform.
  day: {
    palette: DAY,
    sun: { x: -0.75, z: 0.66, tan: 0.8 },
    sunAmt: 1,
    sunMul: [1.24, 1.17, 1.02],
    sunFlat: 0,
    groundKey: 0,
    light: [-0.55, 0.62, 0.56],
    key: [0.66, 0.58, 0.4],
    amb: [0.54, 0.6, 0.76],
    skyUp: [0.06, 0.08, 0.12],
    skyLight: [-0.75, 0.66],
    stars: 0,
    moon: 0,
    lampAmt: 0,
    lampGlows: false,
    glowGain: 0.5,
    vibrance: 0.12,
    vignette: 0.18,
  },
  // No sun: a little cold light from the moon overhead, and the lamps.
  night: {
    palette: NIGHT,
    sun: SUN,
    sunAmt: 0,
    sunMul: [0, 0, 0],
    sunFlat: 0,
    groundKey: 1,
    light: [0.2, 0.75, 0.3],
    key: [0.1, 0.13, 0.24],
    amb: [0.17, 0.2, 0.44],
    skyUp: [0.03, 0.04, 0.1],
    skyLight: [MOON[0], MOON[2]],
    stars: 1,
    moon: 1,
    lampAmt: 1.2,
    headAmt: 1.5, // the train lights the track ahead of it
    lampGlows: true,
    glowGain: 1.45,
    vibrance: 0.12,
    vignette: 0.42,
  },
};

const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const col = (hex) => new THREE.Color(hex);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// --- a small mesh builder -----------------------------------------------------
//
// Everything solid is quads pushed into one buffer: each carries its own
// colour, a paint number and paint coordinates (see shaders/station.js).

function mesher() {
  const pos = [];
  const nor = [];
  const colr = [];
  const paint = [];
  const loc = [];
  const idx = [];

  // p: four corners in order round the face. l: paint coordinates for each
  // (the positions, if not given). out: a direction the face must look in.
  function quad(p, c, pt = PAINT.PLAIN, l = null, out = null) {
    const ax = p[1][0] - p[0][0];
    const ay = p[1][1] - p[0][1];
    const az = p[1][2] - p[0][2];
    const bx = p[3][0] - p[0][0];
    const by = p[3][1] - p[0][1];
    const bz = p[3][2] - p[0][2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    if (out && nx * out[0] + ny * out[1] + nz * out[2] < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const base = pos.length / 3;
    for (let i = 0; i < 4; i++) {
      pos.push(p[i][0], p[i][1], p[i][2]);
      nor.push(nx, ny, nz);
      colr.push(c[0], c[1], c[2]);
      paint.push(pt);
      const q = l ? l[i] : p[i];
      loc.push(q[0], q[1], q[2]);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  function box(x0, x1, y0, y1, z0, z1, c, pt = PAINT.PLAIN) {
    quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], c, pt, null, [1, 0, 0]);
    quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], c, pt, null, [-1, 0, 0]);
    quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], c, pt, null, [0, 1, 0]);
    quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], c, pt, null, [0, -1, 0]);
    quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], c, pt, null, [0, 0, 1]);
    quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], c, pt, null, [0, 0, -1]);
  }

  // A square bar of thickness t from a to b, at any angle.
  function beam(a, b, t, c, pt = PAINT.PLAIN) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const dl = Math.hypot(d[0], d[1], d[2]) || 1;
    d[0] /= dl;
    d[1] /= dl;
    d[2] /= dl;
    const ref = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    const unit = (v) => {
      const l = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / l, v[1] / l, v[2] / l];
    };
    const u = unit(cross(d, ref));
    const v = unit(cross(d, u));
    const h = t / 2;
    const at = (o, su, sv) => [
      o[0] + (u[0] * su + v[0] * sv) * h,
      o[1] + (u[1] * su + v[1] * sv) * h,
      o[2] + (u[2] * su + v[2] * sv) * h,
    ];
    const neg = (w) => [-w[0], -w[1], -w[2]];
    quad([at(a, 1, -1), at(a, 1, 1), at(b, 1, 1), at(b, 1, -1)], c, pt, null, u);
    quad([at(a, -1, -1), at(a, -1, 1), at(b, -1, 1), at(b, -1, -1)], c, pt, null, neg(u));
    quad([at(a, -1, 1), at(a, 1, 1), at(b, 1, 1), at(b, -1, 1)], c, pt, null, v);
    quad([at(a, -1, -1), at(a, 1, -1), at(b, 1, -1), at(b, -1, -1)], c, pt, null, neg(v));
    quad([at(a, -1, -1), at(a, 1, -1), at(a, 1, 1), at(a, -1, 1)], c, pt, null, neg(d));
    quad([at(b, -1, -1), at(b, 1, -1), at(b, 1, 1), at(b, -1, 1)], c, pt, null, d);
  }

  // A rounded, slightly lumpy clump. Its normals point out from its centre,
  // so the shader can shade it as one soft mass rather than as facets.
  function blob(cx, cy, cz, rx, ry, c, rand) {
    const base = pos.length / 3;
    for (const v of ICO.verts) {
      const r = 0.82 + 0.36 * rand();
      pos.push(cx + v[0] * rx * r, cy + v[1] * ry * r, cz + v[2] * rx * r);
      nor.push(v[0], v[1], v[2]);
      colr.push(c[0], c[1], c[2]);
      paint.push(PAINT.LEAVES);
      loc.push(cx + v[0] * rx, cy + v[1] * ry, cz + v[2] * rx);
    }
    for (const i of ICO.faces) idx.push(base + i);
  }

  function geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(colr, 3));
    g.setAttribute('aPaint', new THREE.Float32BufferAttribute(paint, 1));
    g.setAttribute('aLoc', new THREE.Float32BufferAttribute(loc, 3));
    g.setIndex(
      pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1)
    );
    return g;
  }

  return { quad, box, beam, blob, geometry };
}

// An icosahedron with each face split in four: 42 points, round enough for a
// clump of leaves.
const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const unit = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(unit);
  const tris = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const cache = new Map();
  const mid = (a, b) => {
    const key = a < b ? a + '_' + b : b + '_' + a;
    if (!cache.has(key)) {
      verts.push(unit([verts[a][0] + verts[b][0], verts[a][1] + verts[b][1], verts[a][2] + verts[b][2]]));
      cache.set(key, verts.length - 1);
    }
    return cache.get(key);
  };
  const faces = [];
  for (const [a, b, c] of tris) {
    const ab = mid(a, b);
    const bc = mid(b, c);
    const ca = mid(c, a);
    faces.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
  }
  return { verts, faces };
})();

// A small seeded generator, so the trees are the same trees every visit.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One tree: a trunk and a crown of overlapping clumps, a big one in the
// middle, smaller ones round it and one on top.
function tree(m, rand, x, z, height, clumps) {
  const tint = 0.88 + 0.22 * rand();
  const c = [tint * (0.94 + 0.1 * rand()), tint, tint * (0.96 + 0.1 * rand())];
  const R = height * 0.30;
  const cy = height * 0.66;
  m.beam([x, 0, z], [x + (rand() - 0.5) * 0.5, cy, z + (rand() - 0.5) * 0.5], 0.22 + height * 0.022, rgb(C.trunk));
  m.blob(x, cy, z, R * 0.85, R * 0.75, c, rand);
  for (let i = 0; i < clumps; i++) {
    const a = (i / clumps) * Math.PI * 2 + rand() * 1.2;
    const d = R * (0.55 + 0.3 * rand());
    const r = R * (0.5 + 0.25 * rand());
    m.blob(x + Math.cos(a) * d, cy + (rand() - 0.55) * R * 0.8, z + Math.sin(a) * d, r, r * 0.85, c, rand);
  }
  m.blob(x + (rand() - 0.5) * R * 0.4, height - R * 0.45, z + (rand() - 0.5) * R * 0.4, R * 0.55, R * 0.5, c, rand);
}

// The contact wire zigzags from one support to the next, as the real one does
// to wear the pantograph evenly.
const stagger = (k, j) => (Math.abs(k + j) % 2 ? 0.2 : -0.2);

// --- the station ----------------------------------------------------------------

function buildStation(m, wires, glows, low) {
  const steel = rgb(C.steel);
  const insul = rgb(C.insulator);
  const white = [1, 1, 1];

  // Track bed out to the haze, and the platform standing on it.
  m.quad([[-90, 0, Z_BEHIND], [160, 0, Z_BEHIND], [160, 0, Z_FAR], [-90, 0, Z_FAR]], white, PAINT.BED, null, [0, 1, 0]);
  m.quad(
    [[PLAT_BACK, PLAT_Y, Z_BEHIND], [EDGE, PLAT_Y, Z_BEHIND], [EDGE, PLAT_Y, PLAT_END], [PLAT_BACK, PLAT_Y, PLAT_END]],
    white,
    PAINT.PLATFORM,
    null,
    [0, 1, 0]
  );
  // Its face toward the track, set back under a coping stone.
  m.quad(
    [[EDGE - 0.12, 0, PLAT_END], [EDGE - 0.12, 0, Z_BEHIND], [EDGE - 0.12, PLAT_Y - 0.16, Z_BEHIND], [EDGE - 0.12, PLAT_Y - 0.16, PLAT_END]],
    rgb(C.platFace),
    PAINT.PLAIN,
    null,
    [1, 0, 0]
  );
  m.quad(
    [[EDGE, PLAT_Y - 0.16, PLAT_END], [EDGE, PLAT_Y - 0.16, Z_BEHIND], [EDGE, PLAT_Y, Z_BEHIND], [EDGE, PLAT_Y, PLAT_END]],
    rgb(C.coping),
    PAINT.PLAIN,
    null,
    [1, 0, 0]
  );
  m.quad(
    [[PLAT_BACK, 0, PLAT_END], [EDGE, 0, PLAT_END], [EDGE, PLAT_Y, PLAT_END], [PLAT_BACK, PLAT_Y, PLAT_END]],
    rgb(C.platFace),
    PAINT.PLAIN,
    null,
    [0, 0, -1]
  );

  // What shuts the station in: a fence and trees behind the platform, a wall
  // and trees across the tracks.
  m.box(PLAT_BACK - 0.2, PLAT_BACK, PLAT_Y, PLAT_Y + FENCE_H, PLAT_END, Z_BEHIND, rgb(C.fence));
  m.box(11.9, 12.1, 0, 1.5, -900, Z_BEHIND, rgb(C.fence));
  // Behind each fence, a row of bushes: rounded clumps like the trees, darker,
  // and as tall as hedgeTop() says, since that is the outline whose shadow
  // falls across the platform. They get bigger and fewer with distance, and
  // stop where the haze has taken everything anyway.
  const bushes = (row, toward) => {
    const rb = seeded(Math.round(row.seed * 1000));
    for (let z = Z_BEHIND; z > -460; ) {
      const far = clamp(-z / 300, 0, 1);
      const top = hedgeTop(z, row.seed);
      const shade = 0.64 + 0.14 * rb();
      const c = [shade * 0.95, shade, shade * 1.05];
      const rx = 1.3 + 0.6 * rb() + far;
      const x = row.x - toward * 0.9 + (rb() - 0.5) * 0.5;
      m.blob(x, top * 0.52, z, rx, top * 0.5, c, rb);
      // Near the camera, a second lobe in front of each, so the row is not
      // a string of beads.
      if (!low && z > -160) {
        m.blob(x + toward * (0.4 + 0.4 * rb()), top * 0.33, z + (rb() - 0.5) * 1.6, rx * 0.7, top * 0.36, c, rb);
      }
      z -= (1.7 + 0.6 * rb()) * (1 + far * 1.6) * (low ? 1.4 : 1);
    }
  };
  bushes(HEDGE_L, 1);
  bushes(HEDGE_R, -1);

  // Trees: two staggered rows a side, thinning to simpler ones in the haze.
  // On the left they start down the platform and start small, so their
  // crowns stay under the heading; on the right there is nothing to hide.
  const rand = seeded(20261111);
  const step = low ? 1.5 : 1;
  const plant = (x0, spread, zStart, gap, hMin, hMax, rise) => {
    for (let z = zStart; z > -560; z -= gap * step * (0.75 + 0.5 * rand())) {
      const grown = rise ? clamp((-z - 40) / 160, 0, 1) : 1;
      const h = (hMin + (hMax - hMin) * rand()) * (0.72 + 0.28 * grown);
      const near = z > -260;
      tree(m, rand, x0 + (rand() - 0.5) * spread, z, h, low ? (near ? 3 : 2) : near ? 6 : 3);
    }
  };
  for (const r of TREES_L) plant(r.x, r.spread, r.start, r.gap, r.hMin, r.hMax, true);
  plant(16.0, 2.4, 22, 8.0, 6.5, 10.0, false);
  plant(23.0, 4.0, 18, 10.5, 9.5, 14.0, false);

  // Portal frames carrying the overhead line.
  for (let k = 0; k < GANTRIES; k++) {
    const z = FIRST_GANTRY - k * SPAN;
    const baseL = z > PLAT_END ? PLAT_Y : 0;
    m.box(MAST_L - 0.13, MAST_L + 0.13, baseL, MAST_TOP, z - 0.13, z + 0.13, steel);
    m.box(MAST_R - 0.13, MAST_R + 0.13, 0, MAST_TOP, z - 0.13, z + 0.13, steel);

    // A lattice beam between them.
    m.beam([MAST_L, 7.55, z], [MAST_R, 7.55, z], 0.12, steel);
    m.beam([MAST_L, 6.9, z], [MAST_R, 6.9, z], 0.12, steel);
    const N = 8;
    const dx = (MAST_R - MAST_L) / N;
    for (let i = 0; i < N; i++) {
      const x0 = MAST_L + i * dx;
      const x1 = x0 + dx;
      if (i % 2) m.beam([x0, 7.55, z], [x1, 6.9, z], 0.06, steel);
      else m.beam([x0, 6.9, z], [x1, 7.55, z], 0.06, steel);
      if (i > 0) m.beam([x0, 6.9, z], [x0, 7.55, z], 0.06, steel);
    }
    m.beam([MAST_L, 6.1, z], [MAST_L + 0.9, 6.9, z], 0.07, steel);
    m.beam([MAST_R, 6.1, z], [MAST_R - 0.9, 6.9, z], 0.07, steel);

    // Over each track the wires hang straight down from the beam: a short
    // hanger with an insulator to the messenger wire, and a dropper from that
    // to the contact wire. Everything is directly above the wire it holds.
    // (A post set to one side with thin arms across to the wires read as an
    // optical illusion: the arms vanished at any distance, and the foot of
    // the post seemed to land on a wire at some other depth.)
    TRACKS.forEach((cx, j) => {
      m.beam([cx, 6.9, z], [cx, 6.35, z], 0.08, steel);
      m.box(cx - 0.07, cx + 0.07, 6.5, 6.74, z - 0.07, z + 0.07, insul);
      m.beam([cx, 6.35, z], [cx + stagger(k, j), 5.2, z], 0.05, steel);
    });

    // Feeder wires on a cross arm at each mast head.
    m.beam([MAST_L - 0.85, 8.1, z], [MAST_L + 0.85, 8.1, z], 0.1, steel);
    m.beam([MAST_R - 0.65, 8.1, z], [MAST_R + 0.65, 8.1, z], 0.1, steel);
    for (const x of [...FEED_L, ...FEED_R]) m.box(x - 0.05, x + 0.05, 8.15, 8.4, z - 0.05, z + 0.05, insul);
  }

  // The wires themselves, starting one span behind the camera so they come in
  // overhead.
  const wire = (a, b) => wires.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  for (let k = -1; k < GANTRIES - 1; k++) {
    const zA = FIRST_GANTRY - k * SPAN;
    const zB = zA - SPAN;
    TRACKS.forEach((cx, j) => {
      const sA = stagger(k, j);
      const sB = stagger(k + 1, j);
      wire([cx + sA, 5.2, zA], [cx + sB, 5.2, zB]);
      const N = 8;
      let prev = null;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = [cx, 6.35 - 0.75 * 4 * t * (1 - t), zA + (zB - zA) * t];
        if (prev) wire(prev, p);
        if (i > 0 && i < N) wire(p, [cx + sA + (sB - sA) * t, 5.2, p[2]]);
        prev = p;
      }
    });
    for (const x of [...FEED_L, ...FEED_R]) {
      const N = 6;
      let prev = null;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = [x, 8.4 - 0.55 * 4 * t * (1 - t), zA + (zB - zA) * t];
        if (prev) wire(prev, p);
        prev = p;
      }
    }
  }

  // Platform lamps, starting well down the platform: a lit lamp behind the
  // heading would wash the lettering out.
  for (let z = LAMP.z0; z > PLAT_END + 5; z -= LAMP.gap) {
    const x = LAMP.x;
    const top = PLAT_Y + LAMP.height;
    m.beam([x, PLAT_Y, z], [x, top, z], 0.1, steel);
    m.beam([x, top, z], [x + 0.95, top, z], 0.08, steel);
    m.box(x + 0.6, x + 1.0, top - 0.16, top - 0.04, z - 0.14, z + 0.14, rgb(C.lamp), PAINT.GLOW);
    glows.push({ p: [x + 0.8, top - 0.18, z], size: 2.4, c: [0.9, 0.68, 0.42] });
  }

  // A waiting shelter with its light on. Seen from down the platform it is
  // mostly its near end: a glazed wall with the lit room showing through, a
  // roof on posts with a pale trim, and the station's sign on the roof.
  const y0 = PLAT_Y;
  const S = SHELTER;
  const wall = rgb(C.wall);
  const frame = rgb(C.roof);
  const pane = rgb(C.pane);
  const zN = S.z1 - 0.5; // near end wall
  const zF = S.z0 + 0.5; // far end wall
  const xB = S.x0 + 0.3; // back wall
  const xO = xB + 3.2; // the open side

  m.box(xB, xB + 0.2, y0, y0 + 2.6, zF, zN, wall);
  const endWall = (z0, z1) => {
    m.box(xB + 0.2, xO, y0, y0 + 0.85, z0, z1, wall);
    m.box(xB + 0.2, xO, y0 + 2.3, y0 + 2.6, z0, z1, wall);
    const mid = (xB + 0.2 + xO) / 2;
    for (const x of [xB + 0.2, mid - 0.06, xO - 0.12]) m.box(x, x + 0.12, y0 + 0.85, y0 + 2.3, z0, z1, frame);
    m.box(xB + 0.32, mid - 0.06, y0 + 0.85, y0 + 2.3, z0 + 0.05, z1 - 0.05, pane, PAINT.GLOW);
    m.box(mid + 0.06, xO - 0.12, y0 + 0.85, y0 + 2.3, z0 + 0.05, z1 - 0.05, pane, PAINT.GLOW);
    // A rail across the glass at hand height.
    m.box(xB + 0.2, xO, y0 + 1.5, y0 + 1.56, z0 - 0.01, z1 + 0.01, frame);
  };
  endWall(zN - 0.2, zN);
  endWall(zF, zF + 0.2);

  // Roof, its trim, and the posts that hold up the open side.
  m.box(S.x0, S.x1, y0 + S.top - 0.2, y0 + S.top, S.z0, S.z1, rgb(C.roof));
  m.box(S.x0 - 0.04, S.x1 + 0.04, y0 + S.top - 0.08, y0 + S.top + 0.02, S.z0 - 0.04, S.z1 + 0.04, rgb(C.coping));
  for (const z of [zN - 0.1, (zN + zF) / 2, zF + 0.1]) {
    m.beam([S.x1 - 0.3, y0, z], [S.x1 - 0.3, y0 + S.top - 0.2, z], 0.1, steel);
  }

  // Inside: a bench along the back and a strip light under the roof.
  m.box(xB + 0.4, xB + 0.9, y0 + 0.4, y0 + 0.5, zF + 1.5, zN - 1.5, rgb(C.bench));
  m.box(xB + 1.4, xB + 2.2, y0 + 2.5, y0 + 2.56, zF + 2, zN - 2, rgb(C.lamp), PAINT.GLOW);
  glows.push({ p: [xB + 1.8, y0 + 2.4, (zN + zF) / 2], size: 2.4, c: [0.75, 0.6, 0.4] });

  // The sign on the roof, facing down the platform like the name board.
  m.box(xB + 0.7, xB + 2.5, y0 + S.top + 0.14, y0 + S.top + 0.5, S.z1 - 0.2, S.z1 - 0.12, rgb(C.board));
  m.box(xB + 0.7, xB + 2.5, y0 + S.top + 0.02, y0 + S.top + 0.14, S.z1 - 0.2, S.z1 - 0.12, rgb(C.blue));

  // A drinks machine against the near end, facing down the platform: a red
  // cabinet, a lit window with three rows of cans, and the slot they drop to.
  const vx0 = xB + 0.35;
  const vx1 = vx0 + 0.95;
  const vz0 = zN + 0.08;
  const vz1 = vz0 + 0.75;
  m.box(vx0, vx1, y0, y0 + 1.9, vz0, vz1, rgb(C.red));
  m.box(vx0 + 0.05, vx1 - 0.05, y0 + 0.08, y0 + 1.84, vz1, vz1 + 0.02, rgb(C.body));
  m.box(vx0 + 0.1, vx1 - 0.1, y0 + 0.92, y0 + 1.76, vz1 + 0.02, vz1 + 0.04, rgb(0xdff2ff), PAINT.GLOW);
  const cans = [C.red, C.yellow, C.blue, 0x3fd08c, C.warmLight, 0xffffff];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 5; i++) {
      const cx = vx0 + 0.2 + i * 0.138;
      const cy = y0 + 1.0 + row * 0.26;
      m.box(cx - 0.045, cx + 0.045, cy, cy + 0.17, vz1 + 0.04, vz1 + 0.05, rgb(cans[(row * 2 + i) % cans.length]), PAINT.GLOW);
    }
  }
  m.box(vx0 + 0.16, vx1 - 0.16, y0 + 0.2, y0 + 0.44, vz1 + 0.02, vz1 + 0.04, rgb(C.under));
  m.box(vx1 - 0.3, vx1 - 0.14, y0 + 0.56, y0 + 0.82, vz1 + 0.02, vz1 + 0.04, rgb(C.under));
  m.box(vx1 - 0.25, vx1 - 0.19, y0 + 0.72, y0 + 0.77, vz1 + 0.04, vz1 + 0.05, rgb(0xff5a50), PAINT.GLOW);
  glows.push({ p: [(vx0 + vx1) / 2, y0 + 1.35, vz1 + 0.15], size: 1.1, c: [0.4, 0.58, 0.78] });

  // A litter bin beside it, and a bench along the fence a little nearer.
  m.box(vx1 + 0.35, vx1 + 0.8, y0, y0 + 0.78, vz0 + 0.1, vz0 + 0.55, rgb(C.bench));
  m.box(vx1 + 0.32, vx1 + 0.83, y0 + 0.78, y0 + 0.86, vz0 + 0.07, vz0 + 0.58, rgb(C.roof));
  const bz0 = vz1 + 1.6;
  const bz1 = bz0 + 2.4;
  const bx = PLAT_BACK + 0.15;
  m.box(bx + 0.1, bx + 0.6, y0 + 0.42, y0 + 0.5, bz0, bz1, rgb(C.bench));
  m.box(bx, bx + 0.08, y0 + 0.5, y0 + 0.98, bz0, bz1, rgb(C.bench));
  for (const z of [bz0 + 0.2, bz1 - 0.2]) m.box(bx + 0.02, bx + 0.56, y0, y0 + 0.42, z - 0.04, z + 0.04, steel);

  // The station's name board, side on.
  m.beam([-5.0, y0, -78], [-5.0, y0 + 2.3, -78], 0.08, steel);
  m.beam([-5.0, y0, -81], [-5.0, y0 + 2.3, -81], 0.08, steel);
  m.box(-5.04, -4.96, y0 + 1.5, y0 + 2.25, -81.1, -77.9, rgb(C.board));
  m.box(-5.04, -4.96, y0 + 1.35, y0 + 1.5, -81.1, -77.9, rgb(C.blue));

  // One signal at danger, across the tracks.
  m.beam([9.6, 0, -140], [9.6, 5.3, -140], 0.12, steel);
  m.box(9.35, 9.85, 4.2, 5.4, -140.15, -139.85, steel);
  m.box(9.5, 9.7, 4.45, 4.65, -139.85, -139.82, rgb(0xff4a44), PAINT.GLOW);
  glows.push({ p: [9.6, 4.55, -139.8], size: 1.8, c: [1.0, 0.25, 0.2] });
}

// --- the train --------------------------------------------------------------------
//
// Built with its nose at z = 0 and its length running away down -z, so the
// group's z is simply where the nose is.

function buildTrain(m, glows) {
  const cx = TRACKS[0];
  const xl = cx - HALF_W;
  const xr = cx + HALF_W;
  const body = rgb(C.body);
  const dark = rgb(C.under);
  const gear = rgb(C.roofGear);

  for (let i = 0; i < CARS; i++) {
    const z1 = -i * (CAR_L + CAR_GAP);
    const z0 = z1 - CAR_L;

    // The side toward the platform is the painted one.
    m.quad(
      [[xl, BODY_Y0, z0], [xl, BODY_Y0, z1], [xl, BODY_Y1, z1], [xl, BODY_Y1, z0]],
      body,
      PAINT.SIDE,
      [[i, BODY_Y0, CAR_L], [i, BODY_Y0, 0], [i, BODY_Y1, 0], [i, BODY_Y1, CAR_L]],
      [-1, 0, 0]
    );
    m.quad([[xr, BODY_Y0, z1], [xr, BODY_Y0, z0], [xr, BODY_Y1, z0], [xr, BODY_Y1, z1]], body, PAINT.PLAIN, null, [1, 0, 0]);
    m.quad([[xl, BODY_Y1, z1], [xr, BODY_Y1, z1], [xr, BODY_Y1, z0], [xl, BODY_Y1, z0]], rgb(C.bodyRoof), PAINT.PLAIN, null, [0, 1, 0]);
    const front = [[xl, BODY_Y0, z1], [xr, BODY_Y0, z1], [xr, BODY_Y1, z1], [xl, BODY_Y1, z1]];
    if (i === 0) {
      m.quad(
        front,
        body,
        PAINT.FRONT,
        [[-HALF_W, BODY_Y0, 0], [HALF_W, BODY_Y0, 0], [HALF_W, BODY_Y1, 0], [-HALF_W, BODY_Y1, 0]],
        [0, 0, 1]
      );
    } else {
      m.quad(front, dark, PAINT.PLAIN, null, [0, 0, 1]);
    }
    m.quad([[xr, BODY_Y0, z0], [xl, BODY_Y0, z0], [xl, BODY_Y1, z0], [xr, BODY_Y1, z0]], dark, PAINT.PLAIN, null, [0, 0, -1]);

    // Roof: a raised centre section and two air-conditioning pods.
    m.box(cx - 1.15, cx + 1.15, BODY_Y1, BODY_Y1 + 0.16, z0 + 0.3, z1 - 0.3, rgb(C.bodyRoof));
    m.box(cx - 0.85, cx + 0.85, BODY_Y1 + 0.16, BODY_Y1 + 0.52, z1 - 8.2, z1 - 4.4, gear);
    m.box(cx - 0.85, cx + 0.85, BODY_Y1 + 0.16, BODY_Y1 + 0.52, z0 + 4.4, z0 + 8.2, gear);

    // Underframe and bogies.
    m.box(cx - 1.3, cx + 1.3, 0.45, BODY_Y0, z0 + 4.2, z1 - 4.2, dark);
    for (const zc of [z1 - 2.5, z0 + 2.5]) m.box(cx - 1.25, cx + 1.25, 0.1, 0.85, zc - 1.5, zc + 1.5, rgb(C.bogie));

    if (i < CARS - 1) m.box(cx - 0.9, cx + 0.9, 1.1, 3.5, z0 - CAR_GAP, z0, dark);

    // A pantograph on the second and fifth cars. Its head is a bar across
    // the train, pressed up under this track's own contact wire (5.2 m, and
    // never more than 0.2 m off the centre line), with the ends turned down
    // as real ones are. The wires further right belong to the other track.
    if (i === 1 || i === 4) {
      const zc = (z0 + z1) / 2;
      const base = BODY_Y1 + 0.16;
      const head = 5.2 - 0.045; // the bar's top face is the wire's height
      m.box(cx - 0.7, cx + 0.7, base, base + 0.12, zc - 0.9, zc + 0.9, dark);
      m.beam([cx, base + 0.1, zc + 0.8], [cx, 4.62, zc - 0.4], 0.09, dark);
      m.beam([cx, 4.62, zc - 0.4], [cx, head, zc + 0.5], 0.09, dark);
      m.beam([cx - 0.7, head, zc + 0.5], [cx + 0.7, head, zc + 0.5], 0.09, dark);
      m.beam([cx - 0.7, head, zc + 0.5], [cx - 1.0, head - 0.2, zc + 0.5], 0.07, dark);
      m.beam([cx + 0.7, head, zc + 0.5], [cx + 1.0, head - 0.2, zc + 0.5], 0.07, dark);
    }
  }

  // The nose: an apron under the cab, a coupler, and a lamp on the roof.
  m.box(xl + 0.05, xr - 0.05, 0.35, BODY_Y0, -1.4, 0, rgb(C.red));
  m.box(cx - 0.22, cx + 0.22, 0.6, 0.92, 0, 0.5, dark);
  m.box(cx - 0.26, cx + 0.26, BODY_Y1, BODY_Y1 + 0.34, -0.7, 0, body);
  m.box(cx - 0.15, cx + 0.15, BODY_Y1 + 0.06, BODY_Y1 + 0.28, 0, 0.02, rgb(C.lens), PAINT.GLOW);

  glows.push({ p: [cx - 0.98, 1.5, 0.08], size: 3.4, c: [1.0, 0.74, 0.6] });
  glows.push({ p: [cx + 0.98, 1.5, 0.08], size: 3.4, c: [1.0, 0.74, 0.6] });
  glows.push({ p: [cx, BODY_Y1 + 0.17, 0.08], size: 2.8, c: [1.0, 0.45, 0.4] });
}

function glowGeometry(list) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(list.flatMap((l) => l.p), 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(list.map((l) => l.size), 1));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(list.flatMap((l) => l.c), 3));
  return g;
}

// --- world --------------------------------------------------------------------------

let disposables = [];
let group = null;
let yaw = null;
let train = null;
let glowMat = null;
let skyMat = null;
let solidMat = null;
let renderer = null;
let reduced = false;
let current = null; // the world that is built, for layout() to aim
let basePitch = 0.06; // where layout() aimed the view, before any rumble
let baseYaw = 0;
const bufSize = new THREE.Vector2();

function track(o) {
  disposables.push(o);
  return o;
}

// Fit the scene to the page. The horizon goes just under the page's content,
// so the heading and button stand against sky and the station fills what is
// left; the line's vanishing point goes right of centre on a wide window,
// leaving the left to the lettering, and nearer the middle on a narrow one.
function layout(w, h) {
  const aspect = w / Math.max(1, h);
  const tanV = Math.tan((FOV * Math.PI) / 360);

  let horizon = 0.58;
  const row = document.getElementById('content-row');
  if (row && h > 0) {
    const r = row.getBoundingClientRect();
    if (r.height > 0) horizon = r.bottom / h + 0.045;
  }
  horizon = clamp(horizon, 0.54, 0.72);
  basePitch = Math.atan((2 * horizon - 1) * tanV);
  if (current) current.camera.pitch = basePitch;

  const vx = clamp(0.36 + 0.15 * aspect, 0.42, 0.62);
  baseYaw = -Math.atan((2 * vx - 1) * tanV * aspect);
  if (yaw) yaw.rotation.y = baseYaw;

  if (glowMat && renderer) {
    renderer.getDrawingBufferSize(bufSize);
    glowMat.uniforms.uScale.value = Math.max(1, bufSize.y) / (2 * tanV);
    glowMat.uniforms.uMin.value = 3 * renderer.getPixelRatio();
  }
}

function makeWorld(time) {
 const T = TIMES[time];
 return {
  id: 'station',

  // The pitch is set by layout(), which the engine reads every frame.
  camera: { fov: FOV, position: [0, EYE, 0], pitch: 0.06 },

  grade: null, // filled in by build(), because it depends on ctx

  build(ctx) {
    current = this;
    C = { ...DUSK, ...T.palette };
    disposables = [];
    renderer = ctx.renderer;
    reduced = ctx.reduced;
    group = new THREE.Group();

    // Everything hangs off one group that turns about the camera, which is
    // how the view is aimed left or right without touching the engine.
    yaw = new THREE.Group();
    group.add(yaw);

    const haze = col(C.haze);

    // Sky.
    skyMat = track(
        new THREE.ShaderMaterial({
          vertexShader: skyShader.vertexShader,
          fragmentShader: skyShader.fragmentShader,
          uniforms: {
            uTop: { value: col(C.top) },
            uMid: { value: col(C.mid) },
            uLow: { value: col(C.low) },
            uWarm: { value: col(C.warm) },
            uHaze: { value: haze },
            uCloudHot: { value: col(C.cloudHot) },
            uCloudLit: { value: col(C.cloudLit) },
            uCloudMid: { value: col(C.cloudMid) },
            uCloudShade: { value: col(C.cloudShade) },
            uCloudDeep: { value: col(C.cloudDeep) },
            uGlowDir: { value: new THREE.Vector3(T.skyLight[0], 0.0, T.skyLight[1]).normalize() },
            uStars: { value: T.stars },
            uMoon: { value: T.moon },
            uMoonDir: { value: new THREE.Vector3(...MOON).normalize() },
            uMoonCol: { value: col(0xf2f0e2) },
            uSeed: { value: 4.7 },
            uDrift: { value: new THREE.Vector2(0, 0) },
            uBoil: { value: new THREE.Vector2(0, 0) },
          },
          side: THREE.BackSide,
          depthWrite: false,
          depthTest: false,
        })
    );
    const dome = new THREE.Mesh(track(new THREE.SphereGeometry(5000, 48, 24)), skyMat);
    dome.position.set(0, EYE, 0);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    yaw.add(dome);

    // One material for everything solid, the station and the train alike.
    solidMat = track(
      new THREE.ShaderMaterial({
        vertexShader: solidVertex,
        fragmentShader: solidFragment,
        uniforms: {
          uLight: { value: new THREE.Vector3(...T.light).normalize() },
          uKey: { value: new THREE.Vector3(...T.key) },
          uAmb: { value: new THREE.Vector3(...T.amb) },
          uSkyUp: { value: new THREE.Vector3(...T.skyUp) },
          uHaze: { value: haze },
          uFog: { value: FOG },
          uRed: { value: col(C.red) },
          uBlue: { value: col(C.blue) },
          uGlass: { value: col(C.glass) },
          uWin: { value: col(C.window) },
          uLamp: { value: col(C.lens) },
          uBallast: { value: col(C.ballast) },
          uSleeper: { value: col(C.sleeper) },
          uRail: { value: col(C.rail) },
          uVerge: { value: col(C.verge) },
          uPlat: { value: col(C.plat) },
          uYellow: { value: col(C.yellow) },
          uWarm: { value: col(C.warmLight) },
          uGlare: { value: col(C.glare) },
          // The ground is lit by the sun itself: see sunlit() in the shader.
          uSun: { value: new THREE.Vector2(-T.sun.x, -T.sun.z).normalize() },
          uSunTan: { value: T.sun.tan },
          uSunAmt: { value: T.sunAmt },
          uSunMul: { value: new THREE.Vector3(...T.sunMul) },
          uSunFlat: { value: T.sunFlat },
          uGroundKey: { value: T.groundKey },
          uLampAmt: { value: T.lampAmt },
          uHeadAmt: { value: T.headAmt || 0 },
          uLampCol: { value: new THREE.Vector3(1.0, 0.7, 0.4) },
          uTrain: { value: new THREE.Vector2(1e5, 1e5) },
          uLeafLight: { value: new THREE.Vector3(0.25, 0.8, 0.45).normalize() },
          uLeafDeep: { value: col(C.leafDeep) },
          uLeafShade: { value: col(C.leafShade) },
          uLeafMid: { value: col(C.leafMid) },
          uLeafLit: { value: col(C.leafLit) },
        },
        side: THREE.DoubleSide,
      })
    );

    glowMat = track(
      new THREE.ShaderMaterial({
        vertexShader: glowVertex,
        fragmentShader: glowFragment,
        uniforms: {
          uScale: { value: 1000 },
          uMin: { value: 3 },
          uFog: { value: FOG },
          uFar: { value: -START },
          uGain: { value: T.glowGain },
        },
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      })
    );

    // The station.
    const sm = mesher();
    const wires = [];
    const stationGlows = [];
    buildStation(sm, wires, stationGlows, ctx.quality === 'low');
    const station = new THREE.Mesh(track(sm.geometry()), solidMat);
    station.frustumCulled = false;
    yaw.add(station);

    const wireGeo = track(new THREE.BufferGeometry());
    wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    const wireMesh = new THREE.LineSegments(
      wireGeo,
      track(
        new THREE.ShaderMaterial({
          vertexShader: wireVertex,
          fragmentShader: wireFragment,
          uniforms: {
            uColor: { value: col(C.wire) },
            uHaze: { value: haze },
            uFog: { value: FOG },
          },
        })
      )
    );
    wireMesh.frustumCulled = false;
    yaw.add(wireMesh);

    const lamps = new THREE.Points(track(glowGeometry(stationGlows)), glowMat);
    lamps.frustumCulled = false;
    lamps.renderOrder = 10;
    if (T.lampGlows) yaw.add(lamps); // by day the lamps are off

    // The train.
    const tm = mesher();
    const trainGlows = [];
    buildTrain(tm, trainGlows);
    train = new THREE.Group();
    const trainMesh = new THREE.Mesh(track(tm.geometry()), solidMat);
    trainMesh.frustumCulled = false;
    train.add(trainMesh);
    const headlights = new THREE.Points(track(glowGeometry(trainGlows)), glowMat);
    headlights.frustumCulled = false;
    headlights.renderOrder = 11;
    train.add(headlights);
    yaw.add(train);

    layout(ctx.viewport.width, ctx.viewport.height);

    // No toning: the grade is here for its multisampled target, a slight
    // vignette, a lift in colour, and enough grain to keep the sky's
    // gradient from banding.
    this.grade = {
      fragmentShader: gradeShader.fragmentShader,
      uniforms: {
        uSepia: { value: 0 },
        uKeep: { value: 1 },
        uGrain: { value: ctx.reduced ? 0.006 : 0.012 },
        uVignette: { value: T.vignette },
        uFlicker: { value: 0 },
        uLift: { value: 0 },
        uWeave: { value: 0 },
        uDust: { value: 0 },
        uVibrance: { value: T.vibrance },
      },
      samples: ctx.quality === 'low' ? 2 : 4,
    };

    return group;
  },

  resize(w, h) {
    layout(w, h);
  },

  update(t) {
    if (!train) return;
    // With motion off the train simply stands in the station.
    const z = reduced ? STILL_Z : START + SPEED * ((t + (FIRST_Z - START) / SPEED) % PERIOD);
    train.position.z = z;
    train.visible = z < END;
    // Its shadow goes with it.
    const nose = train.visible ? z : 1e5;
    solidMat.uniforms.uTrain.value.set(nose, nose - (train.visible ? TRAIN_LEN : 0));

    // Rumble: two rough frequencies on each axis, so it never settles into
    // a visible wobble.
    const ramp = (a, b, x) => {
      const k = clamp((x - a) / (b - a), 0, 1);
      return k * k * (3 - 2 * k);
    };
    const shake = reduced || !train.visible ? 0 : ramp(-30, -4, z) * (1 - ramp(TRAIN_LEN - 20, TRAIN_LEN + 10, z));
    if (current) {
      current.camera.pitch = basePitch + shake * RUMBLE.pitch * (0.6 * Math.sin(t * 61.0) + 0.4 * Math.sin(t * 97.3 + 1.7));
    }
    yaw.rotation.y = baseYaw + shake * RUMBLE.yaw * (0.6 * Math.sin(t * 53.1 + 0.4) + 0.4 * Math.sin(t * 88.7 + 2.1));

    const tt = reduced ? 0 : t;
    skyMat.uniforms.uDrift.value.set(tt * WIND[0], tt * WIND[1]);
    skyMat.uniforms.uBoil.value.set(tt * BOIL[0], tt * BOIL[1]);
  },

  dispose() {
    for (const d of disposables) {
      try {
        d.dispose();
      } catch (e) {
        /* already gone */
      }
    }
    disposables = [];
    group = null;
    yaw = null;
    train = null;
    glowMat = null;
    skyMat = null;
    solidMat = null;
    renderer = null;
    current = null;
    this.grade = null;
  },
 };
}

// One world for each time of day. They share this file's state, which is
// safe because the engine tears one down before it builds the next.
export const worlds = {
  day: makeWorld('day'),
  dusk: makeWorld('dusk'),
  night: makeWorld('night'),
};

export default worlds.dusk;
