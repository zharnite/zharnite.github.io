import * as THREE from 'three';
import * as skySea from '../shaders/sky-sea.js';
import * as waterSea from '../shaders/water-sea.js';

// --- palette (authored to final on-screen values) -------------------------

const C = {
  zenith: 0x16233f,
  upper: 0x39406e,
  mid: 0x8a5a86,
  lower: 0xe2785f,
  horizon: 0xffb98a,
  sunCore: 0xfff3d6,
  sunHalo: 0xffcf8f,
  deep: 0x0d1a30,
  reflect: 0xe2785f,
  streak: 0xffe6bf,
};

// Horizon sits at ~62% of viewport height. At fov 50 that is a pitch of
// atan(0.24 * tan(25deg)) ~= 6.4 degrees, looking up.
const PITCH = 0.112;
const EYE_Y = 9.0;

const FOG_DIST = 700;

let disposables = [];
let group = null;
let skyMat = null;
let waterMat = null;

function track(obj) {
  disposables.push(obj);
  return obj;
}

// The sun must land at the same place in the frame on every shape of screen.
// A fixed azimuth does not do that: on a portrait phone the horizontal field
// of view is only ~12 degrees, so a 16.6 degree sun falls off the side of the
// frame and takes the specular streak with it. Derive it from the aspect
// instead, and recompute on resize.
const FOV = 50;
const SUN_X_FRAC = 0.68; // across the viewport
const SUN_ELEV_DEG = 3.0;

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

function buildSky(sun) {
  const geo = track(new THREE.SphereGeometry(5000, 32, 16));
  skyMat = track(
    new THREE.ShaderMaterial({
      vertexShader: skySea.vertexShader,
      fragmentShader: skySea.fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: sun },
        uZenith: { value: new THREE.Color(C.zenith) },
        uUpper: { value: new THREE.Color(C.upper) },
        uMid: { value: new THREE.Color(C.mid) },
        uLower: { value: new THREE.Color(C.lower) },
        uHorizon: { value: new THREE.Color(C.horizon) },
        uSunCore: { value: new THREE.Color(C.sunCore) },
        uSunHalo: { value: new THREE.Color(C.sunHalo) },
        uCloud: { value: 0.50 },
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

function buildWater(sun, quality) {
  // 3000 units across at 320 segments is ~9.4 units per quad, which is what
  // sets the shortest wave the mesh can actually carry. Fog hides the edge
  // well before the geometry runs out.
  const seg = quality === 'low' ? 160 : 320;
  const geo = track(new THREE.PlaneGeometry(3000, 3000, seg, seg));

  waterMat = track(
    new THREE.ShaderMaterial({
      vertexShader: waterSea.vertexShader,
      fragmentShader: waterSea.fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: 1.5 },
        uAtten: { value: 1400.0 },
        uDeep: { value: new THREE.Color(C.deep) },
        uZenith: { value: new THREE.Color(C.zenith) },
        uUpper: { value: new THREE.Color(C.upper) },
        uMid: { value: new THREE.Color(C.mid) },
        uLower: { value: new THREE.Color(C.lower) },
        uHorizonCol: { value: new THREE.Color(C.horizon) },
        uStreak: { value: new THREE.Color(C.streak) },
        uSunDir: { value: sun },
        uShininess: { value: 350.0 },
        uSpecGain: { value: 0.9 },
        uFogDist: { value: FOG_DIST },
      },
    })
  );

  const mesh = new THREE.Mesh(geo, waterMat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.frustumCulled = false;
  return mesh;
}

export default {
  id: 'sea-sunset',

  camera: { fov: FOV, position: [0, EYE_Y, 0], pitch: PITCH },

  // No grade pass: this world proves the engine allocates no render target
  // when one is not asked for.
  grade: null,

  build(ctx) {
    disposables = [];
    group = new THREE.Group();

    // One shared vector: updating it in place updates both materials.
    sunVec = new THREE.Vector3();
    updateSun(ctx.viewport.width / Math.max(1, ctx.viewport.height));

    group.add(buildSky(sunVec));
    group.add(buildWater(sunVec, ctx.quality));

    return group;
  },

  resize(w, h) {
    updateSun(w / Math.max(1, h));
  },

  update(t) {
    if (skyMat) skyMat.uniforms.uTime.value = t;
    if (waterMat) waterMat.uniforms.uTime.value = t;
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
    skyMat = null;
    waterMat = null;
    sunVec = null;
    group = null;
  },
};
