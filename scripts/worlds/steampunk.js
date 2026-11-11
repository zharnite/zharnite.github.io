import * as THREE from 'three';
import * as skySepia from '../shaders/sky-sepia.js';
import * as skylineShader from '../shaders/skyline.js';
import * as gradeShader from '../shaders/grade.js';
import * as tenementShader from '../shaders/tenements.js';
import { buildSkyship } from './skyship.js';

// --- palette (authored to final on-screen values) -------------------------

const C = {
  haze: 0xf0e3c6,
  zenith: 0x9c8762,
  upper: 0xc4ad86,
  horizon: 0xf6ead1,
  sunGlow: 0xfffaf0,
};

// The ship is 900 units off, between the third and fourth rows of the city,
// so its tones sit between theirs. The old flat hull colour was darker than
// the nearest buildings, which is a large part of why it looked pasted on.
// Canvas above and timber below: the envelope is the paler of the two, so the
// craft reads as two things joined rather than one dark lump.
const SHIP = {
  envelope: { shade: 0x6e6150, lit: 0xb9a888, rim: 0xd6c5a0 },
  hull: { shade: 0x3f3528, lit: 0x6f5e46, rim: 0xa08a66 },
  haze: 0xf0e3c6,
  smoke: 0x8f8268,
  smokeOpacity: 0.4,
};
const SHIP_SCALE = 1.2;

// Horizon sits at ~68% of viewport height. At fov 45 that is a pitch of
// atan(0.36 * tan(22.5deg)) ~= 8.5 degrees, looking up.
const PITCH = 0.148;
const EYE_Y = 60;

// Each quad's top edge sits on the horizon and the quad runs 0.6 * distance
// downward, so it always reaches past the bottom of the frame. `ang` is how
// tall the roofline stands below the horizon in radians, `angVar` how much
// it varies; both convert to quad fractions by dividing by that same 0.6.
//
// `count` is buildings across the whole quad, of which about a third is on
// screen -- more and smaller as the city recedes. `speed` is in uv units, so
// nearer layers drift faster and that difference is the parallax.
//
// `mist` is how far a layer fades into haze below its rooflines: strong in
// the distance, almost nothing on the nearest row, because the footer text
// sits on that one and needs it kept dark.
const QUAD = 0.6;
const FRAME_BOTTOM_ANG = 0.245; // radians below the horizon at the frame's lower edge
const LAYERS = [
  { z: -2600, color: 0xcdb896, ang: 0.050, angVar: 0.034, count: 90, speed: 0.00035, soft: 0.0016, opacity: 0.78, windows: 0.0, seed: 1.7, mist: 0.50 },
  { z: -1800, color: 0xb9a27e, ang: 0.070, angVar: 0.046, count: 70, speed: 0.00060, soft: 0.0014, opacity: 0.86, windows: 0.0, seed: 4.3, mist: 0.52 },
  { z: -1200, color: 0x9b8763, ang: 0.095, angVar: 0.060, count: 52, speed: 0.00105, soft: 0.0012, opacity: 0.92, windows: 0.0, seed: 8.1, mist: 0.48 },
  { z: -700, color: 0x6e6046, ang: 0.135, angVar: 0.080, count: 38, speed: 0.00185, soft: 0.0010, opacity: 0.96, windows: 0.020, seed: 12.9, mist: 0.40 },
  { z: -380, color: 0x473d2d, ang: 0.200, angVar: 0.110, count: 26, speed: 0.00320, soft: 0.0008, opacity: 1.0, windows: 0.028, seed: 19.4, mist: 0.12 },
];

// The near city: one wall of brick towers, close enough to see into. It
// scrolls at the same ground speed as the rows behind it (their uv speeds all
// work out to about four units a second), so the parallax stays honest.
const NEAR = {
  z: -230,
  scroll: 4.0,
  wall: 0x33291d,
  metal: 0x7a6a50,
  glow: 0xf0dcae,
  dark: 0x1f1a13,
  haze: 0.05,
};
const NEAR_BOTTOM = -12; // the quad's lower edge, below the frame
const NEAR_HEIGHT = 140;

const SHIP_Z = -900;
const SHIP_PERIOD = 75; // seconds for a full crossing
const SHIP_PHASE = 0.42; // start already in frame, left of centre

// --- the two times of day ------------------------------------------------------
//
// Everything above is the hazy afternoon. Dusk is the same city, ship and
// camera with the light changed: the sun down on the horizon, the sky gone
// plum, the rows of buildings dark against it, and most of the lamps on.
// `rows` runs far to near and overrides each layer's colour, glints and mist.

const DAY = {
  sky: C,
  cloud: 0.55,
  sunElev: 20,
  rows: null, // the LAYERS table as written
  glint: 0xffffff,
  ship: SHIP,
  near: NEAR,
  litShare: 0.42,
  // Vintage is a 1930s film of the place: toned, flickering, the frame
  // drifting in the gate, dust and the odd hair on the print.
  grade: { sepia: 0.95, keep: 0.0, vignette: 0.42, lift: 0.09, grain: 0.065, flicker: 0.035, weave: 0.7, dust: 0.6 },
};

const DUSK = {
  sky: {
    haze: 0x8a6a5c,
    zenith: 0x1d1a28,
    upper: 0x43343f,
    horizon: 0xd99a66,
    sunGlow: 0x8a4f22,
  },
  cloud: 0.35,
  sunElev: 4,
  rows: [
    { color: 0x8f7466, windows: 0.0, mist: 0.46 },
    { color: 0x6f5a54, windows: 0.0, mist: 0.46 },
    { color: 0x52423f, windows: 0.22, mist: 0.42 },
    { color: 0x372c2c, windows: 0.34, mist: 0.34 },
    { color: 0x231c1d, windows: 0.42, mist: 0.1 },
  ],
  glint: 0xffc878,
  // A dark ship on a dark sky disappears, so this one is lit more than the
  // scene strictly allows, the way a painter would: one warm key light from
  // low on the sunset side, so the belly and the near flank glow and the top
  // stays dark against the sky, a thin rim on that same side only, and lamps
  // along the hull.
  ship: {
    envelope: { shade: 0x2e262b, lit: 0x5e4a46, rim: 0xffd9a0, key: 0xd08a52 },
    hull: { shade: 0x1f191a, lit: 0x45342c, rim: 0xf0a868, key: 0x8e5a34 },
    haze: 0x8a6a5c,
    smoke: 0xe9dac6,
    smokeOpacity: 0.5,
    rimStrength: 0.5,
    rimPower: 3.0,
    keyDir: [0.35, -0.85, 0.4],
    keyAmt: 0.8,
    lamp: 0xffd28a,
    brass: 0xd9a25c,
  },
  near: { ...NEAR, wall: 0x191415, metal: 0x4d3e38, glow: 0xffd28a, dark: 0x0c0a0b, haze: 0.03 },
  litShare: 0.6,
  // Hand-tinted rather than toned: over half of the scene's own colour is let
  // through, so the plum sky and the amber lamps survive the print.
  grade: { sepia: 0.9, keep: 0.62, vignette: 0.6, lift: 0.06, grain: 0.03, flicker: 0, weave: 0, dust: 0 },
};

let P = DAY;

let shipY = 88;
let shipSpan = 700;

// Interpolating the ship's height by aspect ratio walked it straight through
// the text at middling aspects. What actually matters is where the content
// block ends, which depends on whether the heading wraps -- so measure it.
// A world reading the page is a small liberty, but the alternative is
// guessing at type metrics from the aspect ratio, which is what went wrong.
function layoutShip(aspect) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
  const vh = window.innerHeight || 800;

  let contentTop = 0.35;
  const row = document.getElementById('content-row');
  if (row) {
    const r = row.getBoundingClientRect();
    if (r.height > 0) contentTop = r.top / vh;
  }

  // Always above the heading. Placing it in the gap below the text instead
  // worked, but meant the ship jumped from one side of the title to the
  // other as the window widened, which read as a glitch rather than a
  // composition.
  const f = Math.max(0.14, contentTop - 0.13);

  const ang = Math.atan((0.5 - f) * 2 * tanV);
  shipY = EYE_Y + Math.abs(SHIP_Z) * Math.tan(PITCH + ang);

  // Travel just past both edges, so the ship is present for a similar share
  // of the loop whatever the frame shape.
  const halfVisible = Math.abs(SHIP_Z) * aspect * tanV;
  shipSpan = Math.max(250, halfVisible * 1.6);

  if (ship) ship.position.y = shipY;
}

// World height at distance d of the point a fraction f down the viewport.
function worldYAt(f, d) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
  return EYE_Y + d * Math.tan(PITCH + Math.atan((0.5 - f) * 2 * tanV));
}

// The towers may stand as tall as the gap under the page's content allows and
// no taller, so they never climb behind the heading or the button. Their
// lamps go out below the footer line, which keeps that text on dark wall.
function layoutCity() {
  if (!nearMat) return;
  const vh = window.innerHeight || 800;
  const d = Math.abs(NEAR.z);

  let contentBottom = 0.55;
  const row = document.getElementById('content-row');
  if (row) {
    const r = row.getBoundingClientRect();
    if (r.height > 0) contentBottom = r.bottom / vh;
  }
  let footerTop = 0.93;
  const foot = document.getElementById('main-footer');
  if (foot) {
    const r = foot.getBoundingClientRect();
    if (r.height > 0) footerTop = r.top / vh;
  }

  // The shader fits each tower's roof under this, spire and all.
  const top = worldYAt(Math.max(contentBottom + 0.035, 0.5), d);
  nearMat.uniforms.uTop.value = THREE.MathUtils.clamp(top, 36, 110);
  nearMat.uniforms.uGloomY.value = worldYAt(Math.min(footerTop, 0.97) - 0.03, d);
}

function buildNear() {
  const d = Math.abs(NEAR.z);
  const geo = track(new THREE.PlaneGeometry(d * 3.2, NEAR_HEIGHT));
  const baseY = NEAR_BOTTOM + NEAR_HEIGHT / 2;
  nearMat = track(
    new THREE.ShaderMaterial({
      vertexShader: tenementShader.vertexShader,
      fragmentShader: tenementShader.fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uBaseY: { value: baseY },
        uScroll: { value: NEAR.scroll },
        uSeed: { value: 20.2 },
        uTop: { value: 70 },
        uGloomY: { value: 12 },
        uLife: { value: 1 },
        uHazeAmt: { value: P.near.haze },
        uLitShare: { value: P.litShare },
        uWall: { value: new THREE.Color(P.near.wall) },
        uMetal: { value: new THREE.Color(P.near.metal) },
        uGlow: { value: new THREE.Color(P.near.glow) },
        uVoid: { value: new THREE.Color(P.near.dark) },
        uHaze: { value: new THREE.Color(P.sky.haze) },
      },
      transparent: true,
      depthWrite: false,
    })
  );
  const mesh = new THREE.Mesh(geo, nearMat);
  mesh.position.set(0, baseY, NEAR.z);
  mesh.renderOrder = 0;
  return mesh;
}

let disposables = [];
let nearMat = null;
let group = null;
let skyMat = null;
let skylineMats = [];
let ship = null;
let gradeUniforms = null;
let renderer = null;
const bufSize = new THREE.Vector2();

function track(obj) {
  disposables.push(obj);
  return obj;
}

// Upper right, opposite the left-aligned text. Derived from the aspect for
// the same reason as the sea's: a fixed azimuth walks off the side of a
// portrait frame.
const FOV = 45;
const SUN_X_FRAC = 0.70;

let sunVec = null;

function updateSun(aspect) {
  if (!sunVec) return;
  const tanH = aspect * Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
  const azim = Math.atan((SUN_X_FRAC * 2 - 1) * tanH);
  const elev = THREE.MathUtils.degToRad(P.sunElev);
  sunVec
    .set(
      Math.sin(azim) * Math.cos(elev),
      Math.sin(elev),
      -Math.cos(azim) * Math.cos(elev)
    )
    .normalize();
}

function buildSky() {
  const geo = track(new THREE.SphereGeometry(5000, 32, 16));
  skyMat = track(
    new THREE.ShaderMaterial({
      vertexShader: skySepia.vertexShader,
      fragmentShader: skySepia.fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: sunVec },
        uZenith: { value: new THREE.Color(P.sky.zenith) },
        uUpper: { value: new THREE.Color(P.sky.upper) },
        uHorizon: { value: new THREE.Color(P.sky.horizon) },
        uSunGlow: { value: new THREE.Color(P.sky.sunGlow) },
        uCloud: { value: P.cloud },
      },
      side: THREE.BackSide,
      depthWrite: false,
    })
  );
  const mesh = new THREE.Mesh(geo, skyMat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

function buildLayers() {
  const g = new THREE.Group();
  skylineMats = [];

  LAYERS.forEach((L, i) => {
    const R = P.rows ? P.rows[i] : L;
    const d = Math.abs(L.z);
    const w = d * 3.2;
    const h = d * QUAD;

    // A layer is only visible down to where the next row's rooflines start
    // (or the bottom of the frame, for the nearest). The mist should reach
    // full strength over exactly that band, or most of it is spent unseen.
    const nextAng = i + 1 < LAYERS.length ? LAYERS[i + 1].ang : FRAME_BOTTOM_ANG;
    const hazeDepth = ((nextAng - L.ang) / QUAD) * 1.15;

    const geo = track(new THREE.PlaneGeometry(w, h));
    const mat = track(
      new THREE.ShaderMaterial({
        vertexShader: skylineShader.vertexShader,
        fragmentShader: skylineShader.fragmentShader,
        uniforms: {
          uColor: { value: new THREE.Color(R.color) },
          uTime: { value: 0 },
          uSeed: { value: L.seed },
          uSpeed: { value: L.speed },
          uBase: { value: 1 - L.ang / QUAD },
          uAmp: { value: L.angVar / QUAD },
          uCount: { value: L.count },
          uSoft: { value: L.soft },
          uOpacity: { value: L.opacity },
          uWindows: { value: R.windows },
          uGlint: { value: new THREE.Color(P.glint) },
          uHaze: { value: new THREE.Color(P.sky.haze) },
          uHazeAmt: { value: R.mist },
          uHazeDepth: { value: hazeDepth },
          // The farthest two rows are too small for it to be anything but noise.
          uClutter: { value: i >= 2 ? 1 : 0 },
        },
        transparent: true,
        depthWrite: false,
      })
    );
    skylineMats.push(mat);

    const mesh = new THREE.Mesh(geo, mat);
    // Top edge of the quad sits on the horizon, so silhouettes peak at or
    // below it and read as distant ground rather than floating bands.
    mesh.position.set(0, EYE_Y - h / 2, L.z);
    mesh.renderOrder = -5 + i;
    g.add(mesh);
  });

  return g;
}

function makeWorld(id, palette) {
 return {
  id,

  camera: { fov: FOV, position: [0, EYE_Y, 0], pitch: PITCH },

  grade: null, // filled in by build(), because it depends on ctx.reduced

  build(ctx) {
    P = palette;
    disposables = [];
    group = new THREE.Group();

    const aspect0 = ctx.viewport.width / Math.max(1, ctx.viewport.height);
    sunVec = new THREE.Vector3();
    updateSun(aspect0);
    layoutShip(aspect0);

    group.add(buildSky());
    group.add(buildLayers());
    group.add(buildNear());
    layoutCity();

    renderer = ctx.renderer;
    ship = buildSkyship({ track, sunVec, colors: P.ship });
    ship.scale.setScalar(SHIP_SCALE);
    ship.position.set(0, shipY, SHIP_Z);
    group.add(ship);

    // Grain, flicker, weave and dust are all motion; freeze or drop them when
    // motion is unwelcome.
    const G = P.grade;
    gradeUniforms = {
      uSepia: { value: G.sepia },
      uKeep: { value: G.keep },
      uGrain: { value: ctx.reduced ? G.grain * 0.35 : G.grain },
      uVignette: { value: G.vignette },
      uFlicker: { value: ctx.reduced ? 0.0 : G.flicker },
      uLift: { value: G.lift },
      uWeave: { value: ctx.reduced ? 0.0 : G.weave },
      uDust: { value: ctx.reduced ? 0.0 : G.dust },
    };
    // Hard vertical building edges need multisampling, and the scene renders
    // into the grade pass's target, so the canvas's own antialias flag is no
    // help -- the target has to be multisampled itself.
    this.grade = {
      fragmentShader: gradeShader.fragmentShader,
      uniforms: gradeUniforms,
      samples: ctx.quality === 'low' ? 2 : 4,
    };

    return group;
  },

  resize(w, h) {
    const aspect = w / Math.max(1, h);
    updateSun(aspect);
    layoutShip(aspect);
    layoutCity();
  },

  update(t) {
    if (skyMat) skyMat.uniforms.uTime.value = t;
    for (const m of skylineMats) m.uniforms.uTime.value = t;
    if (nearMat) nearMat.uniforms.uTime.value = t;

    // Smoke puffs are sized in pixels, so they need the render height.
    const halfH = renderer ? renderer.getDrawingBufferSize(bufSize).y / 2 : 400;

    if (ship) {
      ship.userData.update(t, halfH);
      // Loop across the frame, with a gentle buoyant bob and a slight roll.
      const phase = ((t / SHIP_PERIOD + SHIP_PHASE) % 1 + 1) % 1;
      ship.position.x = -shipSpan + phase * shipSpan * 2;
      ship.position.y = shipY + Math.sin(t * 0.21) * 3.2;
      ship.rotation.z = Math.sin(t * 0.17) * 0.012;
      ship.rotation.y = Math.sin(t * 0.11) * 0.02;
    }
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
    skylineMats = [];
    skyMat = null;
    nearMat = null;
    sunVec = null;
    ship = null;
    renderer = null;
    group = null;
    gradeUniforms = null;
    this.grade = null;
  },
 };
}

export default makeWorld('steampunk', DUSK);
export const vintage = makeWorld('vintage', DAY);
