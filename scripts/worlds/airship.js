import * as THREE from 'three';
import * as skySepia from '../shaders/sky-sepia.js';
import * as skylineShader from '../shaders/skyline.js';
import * as gradeShader from '../shaders/grade.js';

// --- palette (authored to final on-screen values) -------------------------

const C = {
  zenith: 0x9c8762,
  upper: 0xc4ad86,
  horizon: 0xf6ead1,
  sunGlow: 0xfffaf0,
  hull: 0x3e352a,
  hullRim: 0x8a7a60,
};

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
const QUAD = 0.6;
const LAYERS = [
  { z: -2600, color: 0xcdb896, ang: 0.050, angVar: 0.034, count: 90, speed: 0.00035, soft: 0.0016, opacity: 0.78, windows: 0.0, seed: 1.7 },
  { z: -1800, color: 0xb9a27e, ang: 0.070, angVar: 0.046, count: 70, speed: 0.00060, soft: 0.0014, opacity: 0.86, windows: 0.0, seed: 4.3 },
  { z: -1200, color: 0x9b8763, ang: 0.095, angVar: 0.060, count: 52, speed: 0.00105, soft: 0.0012, opacity: 0.92, windows: 0.0, seed: 8.1 },
  { z: -700, color: 0x6e6046, ang: 0.135, angVar: 0.080, count: 38, speed: 0.00185, soft: 0.0010, opacity: 0.96, windows: 0.020, seed: 12.9 },
  { z: -380, color: 0x473d2d, ang: 0.200, angVar: 0.110, count: 26, speed: 0.00320, soft: 0.0008, opacity: 1.0, windows: 0.028, seed: 19.4 },
];

const SHIP_Z = -900;
const SHIP_PERIOD = 75; // seconds for a full crossing
const SHIP_PHASE = 0.42; // start already in frame, left of centre

// Where the ship sits, as a fraction of viewport height. On a wide screen it
// rides just above the horizon, in the clear band under the text. A narrow
// phone has no such band -- the heading wraps and runs down toward the
// horizon -- but it does have a lot of empty sky above the heading, so the
// ship moves up there instead.
const HORIZON_F = 0.68; // where the horizon lands, as a fraction of height

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

let disposables = [];
let group = null;
let skyMat = null;
let skylineMats = [];
let shipMats = [];
let ship = null;
let gradeUniforms = null;

function track(obj) {
  disposables.push(obj);
  return obj;
}

// Upper right, opposite the left-aligned text. Derived from the aspect for
// the same reason as the sea's: a fixed azimuth walks off the side of a
// portrait frame.
const FOV = 45;
const SUN_X_FRAC = 0.70;
const SUN_ELEV_DEG = 20;

let sunVec = null;

function updateSun(aspect) {
  if (!sunVec) return;
  const tanH = aspect * Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
  const azim = Math.atan((SUN_X_FRAC * 2 - 1) * tanH);
  const elev = THREE.MathUtils.degToRad(SUN_ELEV_DEG);
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
        uZenith: { value: new THREE.Color(C.zenith) },
        uUpper: { value: new THREE.Color(C.upper) },
        uHorizon: { value: new THREE.Color(C.horizon) },
        uSunGlow: { value: new THREE.Color(C.sunGlow) },
        uCloud: { value: 0.55 },
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
    const d = Math.abs(L.z);
    const w = d * 3.2;
    const h = d * QUAD;

    const geo = track(new THREE.PlaneGeometry(w, h));
    const mat = track(
      new THREE.ShaderMaterial({
        vertexShader: skylineShader.vertexShader,
        fragmentShader: skylineShader.fragmentShader,
        uniforms: {
          uColor: { value: new THREE.Color(L.color) },
          uTime: { value: 0 },
          uSeed: { value: L.seed },
          uSpeed: { value: L.speed },
          uBase: { value: 1 - L.ang / QUAD },
          uAmp: { value: L.angVar / QUAD },
          uCount: { value: L.count },
          uSoft: { value: L.soft },
          uOpacity: { value: L.opacity },
          uWindows: { value: L.windows },
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

function shipMaterial(color) {
  const mat = track(
    new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vNv;
        varying vec3 vPv;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vPv = mv.xyz;
          vNv = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3  uColor;
        uniform vec3  uRim;
        uniform float uRimStrength;
        varying vec3 vNv;
        varying vec3 vPv;
        void main(){
          vec3 V = normalize(-vPv);
          float rim = pow(1.0 - clamp(dot(normalize(vNv), V), 0.0, 1.0), 3.0);
          gl_FragColor = vec4(mix(uColor, uRim, rim * uRimStrength), 1.0);
        }
      `,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uRim: { value: new THREE.Color(C.hullRim) },
        uRimStrength: { value: 0.35 },
      },
    })
  );
  shipMats.push(mat);
  return mat;
}

function buildShip() {
  const g = new THREE.Group();
  const mat = shipMaterial(C.hull);

  // Hull: an ellipsoid at a classic ~8:1 rigid-airship ratio.
  const hullGeo = track(new THREE.SphereGeometry(1, 28, 18));
  const hull = new THREE.Mesh(hullGeo, mat);
  hull.scale.set(50, 13, 13);
  g.add(hull);

  // Tail fins: vertical and horizontal.
  const finGeo = track(new THREE.BoxGeometry(16, 20, 1.4));
  const finV = new THREE.Mesh(finGeo, mat);
  finV.position.set(-46, 0, 0);
  g.add(finV);

  const finH = new THREE.Mesh(finGeo, mat);
  finH.position.set(-46, 0, 0);
  finH.rotation.z = Math.PI / 2;
  finH.scale.set(1, 1.35, 1);
  g.add(finH);

  // Gondola, slung forward under the hull.
  const gondolaGeo = track(new THREE.BoxGeometry(16, 5, 7));
  const gondola = new THREE.Mesh(gondolaGeo, mat);
  gondola.position.set(12, -13.5, 0);
  g.add(gondola);

  // Two engine nacelles.
  const nacGeo = track(new THREE.CylinderGeometry(2.4, 2.4, 7, 10));
  [-1, 1].forEach((s) => {
    const n = new THREE.Mesh(nacGeo, mat);
    n.position.set(-10, -9, s * 11);
    n.rotation.z = Math.PI / 2;
    g.add(n);
  });

  g.position.set(0, shipY, SHIP_Z);
  return g;
}

export default {
  id: 'airship',

  camera: { fov: FOV, position: [0, EYE_Y, 0], pitch: PITCH },

  grade: null, // filled in by build(), because it depends on ctx.reduced

  build(ctx) {
    disposables = [];
    shipMats = [];
    group = new THREE.Group();

    const aspect0 = ctx.viewport.width / Math.max(1, ctx.viewport.height);
    sunVec = new THREE.Vector3();
    updateSun(aspect0);
    layoutShip(aspect0);

    group.add(buildSky());
    group.add(buildLayers());

    ship = buildShip();
    group.add(ship);

    // Grain and flicker are motion; freeze both when motion is unwelcome.
    gradeUniforms = {
      uSepia: { value: 0.95 },
      uGrain: { value: ctx.reduced ? 0.022 : 0.065 },
      uVignette: { value: 0.42 },
      uFlicker: { value: ctx.reduced ? 0.0 : 0.035 },
      uLift: { value: 0.09 },
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
  },

  update(t) {
    if (skyMat) skyMat.uniforms.uTime.value = t;
    for (const m of skylineMats) m.uniforms.uTime.value = t;

    if (ship) {
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
    shipMats = [];
    skyMat = null;
    sunVec = null;
    ship = null;
    group = null;
    gradeUniforms = null;
    this.grade = null;
  },
};
