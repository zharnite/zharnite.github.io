import * as THREE from 'three';
import * as hullShader from '../shaders/hull.js';
import * as smokeShader from '../shaders/smoke.js';

// A steampunk skyship: a gasbag above, and slung beneath it on rigging the
// hull of a wooden sailing ship. Nothing here is trying to be a real
// aircraft, which is the point -- it buys a far more readable outline than
// an accurate zeppelin, whose whole silhouette is one cigar.
//
// What carries the outline, since at this distance outline is all there is:
//   - the envelope: blunt nose, widest 40% back, long taper, small tail fins;
//   - a clear gap of sky between envelope and hull, crossed by rigging;
//   - the hull: curved prow, flat run, a raised sterncastle;
//   - the things that break the ends: a bowsprit and its stay forward, and
//     aft a propeller, a skeg and an exhaust pipe trailing smoke.
//
// The bow points along +X, which is the way it travels. The group's origin
// is near the middle of the whole craft, so whoever places it is placing its
// visual centre.

const ENV_LEN = 96;
const ENV_R = 10.5;
const WIDEST = 0.4; // how far back from the nose the envelope is fattest
const ENV_Y = 7; // envelope axis, above the group origin
const GAP = 6.5; // clear sky between envelope and deck

const DECK_Y = ENV_Y - ENV_R - GAP;
const HULL_LEN = 58;
const HULL_X = 3; // hull sits a little forward of the envelope's middle
const HALF_BEAM = 5.2;
const DRAUGHT = 7.5;

const sm = THREE.MathUtils.smoothstep; // (x, min, max)

// --- envelope ---------------------------------------------------------------

// Radius at t, where t runs 0 at the nose to 1 at the tail.
function profile(t) {
  if (t <= WIDEST) {
    // Quarter ellipse: vertical at the very nose, so it is properly blunt.
    const u = (WIDEST - t) / WIDEST;
    return ENV_R * Math.sqrt(Math.max(0, 1 - u * u));
  }
  const u = (t - WIDEST) / (1 - WIDEST);
  return ENV_R * (1 - Math.pow(u, 1.9));
}

// Radius at a position along the envelope's axis (x = 0 is its middle).
function envRadiusAt(x) {
  return profile(THREE.MathUtils.clamp((ENV_LEN / 2 - x) / ENV_LEN, 0, 1));
}

function envelopeGeometry() {
  // Lathe profiles are revolved around Y and want their points in rising
  // order, so run tail to nose, then lay the result along X.
  const pts = [];
  const N = 56;
  for (let i = 0; i <= N; i++) {
    const t = 1 - i / N;
    pts.push(new THREE.Vector2(profile(t), ENV_LEN / 2 - t * ENV_LEN));
  }
  const geo = new THREE.LatheGeometry(pts, 40);
  geo.rotateZ(-Math.PI / 2);
  return geo;
}

// A swept tail fin reaching `tip` out from the axis. Drawn from the axis
// outward, so the root is buried in the envelope and there is never a gap
// where the taper falls away beneath it.
function finGeometry(tip) {
  const tail = -ENV_LEN / 2;
  const s = new THREE.Shape();
  s.moveTo(tail + 29, 0);
  s.lineTo(tail + 12, tip);
  s.lineTo(tail + 6.5, tip);
  s.lineTo(tail + 1.5, tip * 0.45);
  s.lineTo(tail + 1.5, 0);
  s.closePath();
  const depth = 0.9;
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

// --- hull -------------------------------------------------------------------
//
// Lofted from three curves along its length (t = 0 at the bow, 1 at the
// stern), in the hull's own space where the main deck is y = 0.

function beamAt(t) {
  const fore = t < 0.3 ? Math.pow(Math.sin((Math.PI / 2) * (t / 0.3)), 0.7) : 1;
  return HALF_BEAM * fore * (1 - 0.28 * sm(t, 0.6, 1));
}

// The deck edge: lifts toward the bow, and steps up into a sterncastle.
function sheerAt(t) {
  const bow = Math.max(0, (0.3 - t) / 0.3);
  return 1.8 * bow * bow + 3.2 * sm(t, 0.64, 0.74);
}

// The keel: sweeps up into a curved prow, and rises a little under the stern.
function keelAt(t) {
  const bow = Math.max(0, (0.24 - t) / 0.24);
  return -DRAUGHT * (1 - Math.pow(bow, 2.2)) * (1 - 0.42 * sm(t, 0.68, 1));
}

const hullX = (t) => HULL_LEN / 2 - t * HULL_LEN;

function hullGeometry() {
  const NS = 30; // stations along the length
  const NT = 12; // steps around each half-section, gunwale to gunwale
  const pos = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    const b = beamAt(t);
    const top = sheerAt(t);
    const bottom = keelAt(t);
    for (let j = 0; j <= NT; j++) {
      const th = (j / NT) * Math.PI;
      // The 0.55 power squares the section off: slab sides, a flat floor.
      const down = Math.pow(Math.sin(th), 0.55);
      pos.push(hullX(t), top - (top - bottom) * down, b * Math.cos(th));
    }
  }
  const idx = [];
  const row = NT + 1;
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < NT; j++) {
      const a = i * row + j;
      const b = a + row;
      // Wound so the computed normals point out of the hull.
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// The deck and the transom, which the loft leaves open. Separate from the
// hull so their flat normals do not get smoothed into its sides.
function deckGeometry() {
  const NS = 30;
  const pos = [];
  const nor = [];
  const tri = (a, b, c, n) => {
    pos.push(...a, ...b, ...c);
    nor.push(...n, ...n, ...n);
  };
  for (let i = 0; i < NS; i++) {
    const t0 = i / NS;
    const t1 = (i + 1) / NS;
    const p0 = [hullX(t0), sheerAt(t0), beamAt(t0)];
    const s0 = [hullX(t0), sheerAt(t0), -beamAt(t0)];
    const p1 = [hullX(t1), sheerAt(t1), beamAt(t1)];
    const s1 = [hullX(t1), sheerAt(t1), -beamAt(t1)];
    tri(p0, s0, p1, [0, 1, 0]);
    tri(s0, s1, p1, [0, 1, 0]);
  }
  const NT = 12;
  const b = beamAt(1);
  const top = sheerAt(1);
  const bottom = keelAt(1);
  const x = hullX(1);
  const centre = [x, (top + bottom) / 2, 0];
  const at = (j) => {
    const th = (j / NT) * Math.PI;
    return [x, top - (top - bottom) * Math.pow(Math.sin(th), 0.55), b * Math.cos(th)];
  };
  for (let j = 0; j < NT; j++) tri(centre, at(j + 1), at(j), [-1, 0, 0]);
  tri(centre, at(0), at(NT), [-1, 0, 0]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}

// A fin under the stern, in the hull's space.
function skegGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-10, -7.0);
  s.lineTo(-27.5, -4.2);
  s.lineTo(-28.5, -9.6);
  s.lineTo(-19, -10.2);
  s.closePath();
  const depth = 0.6;
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

// --- assembly ---------------------------------------------------------------

// options:
//   track      registers a geometry or material for disposal, returns it
//   sunVec     shared sun direction (a Vector3 the world keeps up to date)
//   colors     { envelope: {shade, lit, rim}, hull: {shade, lit, rim}, haze, smoke }
//   hazeAmt    how far the whole craft fades into the air (0.1 near, more far)
//   detail     false leaves off the smoke and the fine rigging, for a ship so
//              far away that neither would cover a pixel
//
// Returns the group. group.userData.update(t, halfHeightPx) turns the
// propeller and advances the smoke.
export function buildSkyship({ track, sunVec, colors, hazeAmt = 0.1, detail = true }) {
  const g = new THREE.Group();

  function material(c, panels) {
    return track(
      new THREE.ShaderMaterial({
        vertexShader: hullShader.vertexShader,
        fragmentShader: hullShader.fragmentShader,
        uniforms: {
          uShade: { value: new THREE.Color(c.shade) },
          uLit: { value: new THREE.Color(c.lit) },
          uRim: { value: new THREE.Color(c.rim) },
          uHaze: { value: new THREE.Color(colors.haze) },
          uSunDir: { value: sunVec },
          uRimStrength: { value: 0.4 },
          uHazeAmt: { value: hazeAmt },
          uPanels: { value: panels },
          uRings: { value: 12 },
          uGores: { value: 14 },
          uLength: { value: ENV_LEN },
        },
        // Lathe, loft and extrusion each wind their own way; the normals are
        // what the shading reads, so draw both faces and stop caring.
        side: THREE.DoubleSide,
      })
    );
  }

  const bagMat = material(colors.envelope, 1); // ring frames and gores
  const bagPartMat = material(colors.envelope, 0);
  const woodMat = material(colors.hull, 0);

  // Envelope and its fins share a group, so the seam maths in the shader can
  // keep assuming the envelope's axis is the object's X axis.
  const bag = new THREE.Group();
  bag.position.y = ENV_Y;
  bag.add(new THREE.Mesh(track(envelopeGeometry()), bagMat));

  // The lower fin is cut short to keep it out of the hull's rigging.
  const finTall = track(finGeometry(9.0));
  const finShort = track(finGeometry(6.6));
  [
    [0, finTall],
    [Math.PI / 2, finTall],
    [-Math.PI / 2, finTall],
    [Math.PI, finShort],
  ].forEach(([a, geo]) => {
    const fin = new THREE.Mesh(geo, bagPartMat);
    fin.rotation.x = a;
    bag.add(fin);
  });
  g.add(bag);

  // One unit cylinder, stretched between two points, serves every spar and
  // rope. Scaling along its own axis leaves the side normals true.
  const rodGeo = track(new THREE.CylinderGeometry(1, 1, 1, 6));
  const UP = new THREE.Vector3(0, 1, 0);
  function rod(ax, ay, az, bx, by, bz, r, mat) {
    const a = new THREE.Vector3(ax, ay, az);
    const d = new THREE.Vector3(bx, by, bz).sub(a);
    const len = d.length();
    const m = new THREE.Mesh(rodGeo, mat);
    m.scale.set(r, len, r);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    g.add(m);
    return m;
  }

  // A spike on the nose, for the mooring ring.
  rod(ENV_LEN / 2 - 1, ENV_Y, 0, ENV_LEN / 2 + 4, ENV_Y, 0, 0.35, bagPartMat);

  // Hull, deck and skeg.
  const hull = new THREE.Group();
  hull.position.set(HULL_X, DECK_Y, 0);
  hull.add(new THREE.Mesh(track(hullGeometry()), woodMat));
  hull.add(new THREE.Mesh(track(deckGeometry()), woodMat));
  hull.add(new THREE.Mesh(track(skegGeometry()), woodMat));
  g.add(hull);

  // Points on the gunwale and under the envelope, in the group's space.
  const gunwale = (t, side) => [HULL_X + hullX(t), DECK_Y + sheerAt(t), side * beamAt(t)];
  const SPREAD = THREE.MathUtils.degToRad(42);
  const underBag = (x, side) => {
    const r = envRadiusAt(x);
    return [x, ENV_Y - r * Math.cos(SPREAD), side * r * Math.sin(SPREAD)];
  };

  // Two stout pylons carry the weight.
  [0.3, 0.62].forEach((t) => {
    const x = HULL_X + hullX(t);
    rod(x, DECK_Y + sheerAt(t) - 0.5, 0, x, ENV_Y - envRadiusAt(x) + 0.6, 0, 0.6, woodMat);
  });

  // Rigging: lines fanning out from the gunwales to the envelope's flanks.
  if (detail) {
    const LINES = 7;
    for (let k = 0; k < LINES; k++) {
      const t = 0.12 + (k / (LINES - 1)) * 0.66;
      [-1, 1].forEach((side) => {
        const a = gunwale(t, side);
        const b = underBag(a[0] * 1.22 - 2, side);
        rod(a[0], a[1], a[2], b[0], b[1], b[2], 0.3, woodMat);
      });
    }
  }

  // Bowsprit, and the stay running from its tip up to the envelope.
  const bowX = HULL_X + HULL_LEN / 2;
  const spritTip = [bowX + 12, DECK_Y + 5.2, 0];
  rod(bowX - 1.5, DECK_Y + 1.5, 0, spritTip[0], spritTip[1], spritTip[2], 0.42, woodMat);
  if (detail) {
    const sx = spritTip[0] - 4;
    rod(spritTip[0], spritTip[1], 0, sx, ENV_Y - envRadiusAt(sx), 0, 0.25, woodMat);
  }

  // Exhaust pipe, raked back off the sterncastle.
  const sternX = HULL_X - HULL_LEN / 2;
  const pipeTip = [sternX - 6, DECK_Y + 7.2, 0];
  rod(sternX + 2.5, DECK_Y + 3.4, 0, pipeTip[0], pipeTip[1], pipeTip[2], 0.75, woodMat);

  // Propeller on the stern post. Seen broadside it is edge-on, so the blades
  // are thick fore and aft or they would vanish.
  const prop = new THREE.Group();
  prop.position.set(sternX - 2.2, DECK_Y - 1.2, 0);
  const bladeGeo = track(new THREE.BoxGeometry(1.1, 4.6, 0.9));
  bladeGeo.translate(0, 2.3, 0);
  for (let k = 0; k < 3; k++) {
    const blade = new THREE.Mesh(bladeGeo, woodMat);
    blade.rotation.x = (k / 3) * Math.PI * 2;
    prop.add(blade);
  }
  const hubGeo = track(new THREE.CapsuleGeometry(0.8, 2.2, 4, 8));
  hubGeo.rotateZ(-Math.PI / 2);
  const hub = new THREE.Mesh(hubGeo, woodMat);
  hub.position.x = 1.2;
  prop.add(hub);
  g.add(prop);

  // Smoke.
  let smokeMat = null;
  if (detail) {
    const PUFFS = 22;
    const pos = new Float32Array(PUFFS * 3);
    const seed = new Float32Array(PUFFS);
    for (let i = 0; i < PUFFS; i++) {
      pos[i * 3] = pipeTip[0];
      pos[i * 3 + 1] = pipeTip[1];
      pos[i * 3 + 2] = pipeTip[2];
      seed[i] = (i + 0.37 * ((i * 7) % 5)) / PUFFS;
    }
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    smokeMat = track(
      new THREE.ShaderMaterial({
        vertexShader: smokeShader.vertexShader,
        fragmentShader: smokeShader.fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uLife: { value: 4.2 },
          uDrift: { value: 13 },
          uRise: { value: 5.5 },
          uSize: { value: 2.6 },
          uHalfH: { value: 400 },
          uColor: { value: new THREE.Color(colors.smoke) },
          uOpacity: { value: 0.34 },
        },
        transparent: true,
        depthWrite: false,
      })
    );
    const smoke = new THREE.Points(geo, smokeMat);
    // Every point starts at the pipe; the trail it draws is far outside the
    // bounding sphere that implies.
    smoke.frustumCulled = false;
    smoke.renderOrder = 2;
    g.add(smoke);
  }

  g.userData.update = (t, halfHeightPx) => {
    prop.rotation.x = t * 2.6;
    if (smokeMat) {
      smokeMat.uniforms.uTime.value = t;
      // Point sizes are in the ship's units, so they follow its scale.
      smokeMat.uniforms.uSize.value = 2.6 * g.scale.x;
      smokeMat.uniforms.uHalfH.value = halfHeightPx;
    }
  };

  return g;
}
