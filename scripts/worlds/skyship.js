import * as THREE from 'three';
import * as hullShader from '../shaders/hull.js';
import * as smokeShader from '../shaders/smoke.js';

// A steampunk skyship: a gasbag above, and slung beneath it on rigging the
// hull of a wooden sailing ship. Nothing here is trying to be a real
// aircraft, which is the point -- it buys a far more readable outline than
// an accurate zeppelin, whose whole silhouette is one cigar.
//
// What carries the outline, since at this distance outline is all there is:
//   - the envelope: blunt nose, widest 40% back, long taper, and at the tail
//     ribbed fan fins like a bat's wing;
//   - a clear gap of sky between envelope and hull, crossed by rigging;
//   - the hull: curved prow, flat run, a raised sterncastle;
//   - the things that break the ends: a bowsprit and its stay forward, and
//     aft a propeller, a fan rudder and a trail of steam.
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
  // A long taper that still ends round. The old curve ran straight down to
  // nothing, which gave the gasbag a point no bag of gas would hold.
  const u = (t - WIDEST) / (1 - WIDEST);
  return ENV_R * Math.pow(Math.max(0, 1 - Math.pow(u, 2.2)), 0.62);
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
    // Cosine spacing: more points where the ends turn in sharply.
    const t = 0.5 + 0.5 * Math.cos((i / N) * Math.PI);
    pts.push(new THREE.Vector2(profile(t), ENV_LEN / 2 - t * ENV_LEN));
  }
  const geo = new THREE.LatheGeometry(pts, 40);
  geo.rotateZ(-Math.PI / 2);
  return geo;
}

// Fins are built like a bat's wing or a junk sail rather than an aircraft's
// tailplane: ribs fanning out from a pivot, canvas stretched between them,
// and the trailing edge scalloped from rib tip to rib tip. A plain swept
// plate is what a zeppelin has; this is what makes it a skyship.
//
// `angles` are in degrees, measured from dead astern and turning upward;
// `lengths` are the ribs. Returns the rib tips relative to the pivot.
function fanTips(angles, lengths, scale = 1) {
  return angles.map((deg, i) => {
    const a = THREE.MathUtils.degToRad(deg);
    return [-Math.cos(a) * lengths[i] * scale, Math.sin(a) * lengths[i] * scale];
  });
}

function fanGeometry(tips) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(tips[0][0], tips[0][1]);
  for (let i = 1; i < tips.length; i++) {
    // Pull the canvas in toward the pivot between each pair of ribs.
    const cx = (tips[i - 1][0] + tips[i][0]) * 0.5 * 0.8;
    const cy = (tips[i - 1][1] + tips[i][1]) * 0.5 * 0.8;
    s.quadraticCurveTo(cx, cy, tips[i][0], tips[i][1]);
  }
  s.closePath();
  const depth = 0.4;
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 8 });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

const TAIL_FAN = { angles: [20, 40, 60, 80, 100], lengths: [13.1, 14.1, 13.7, 12.1, 10.1] };
const TAIL_PIVOT_X = -ENV_LEN / 2 + 10; // on the envelope's axis, buried in it
const RUDDER_FAN = { angles: [5, 30, 55, 80], lengths: [7.0, 8.5, 8.0, 6.5] };
const RUDDER_PIVOT = [-HULL_LEN / 2 + 9, -5.4]; // in the hull's space

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
  const uvs = []; // bow to stern, and gunwale to gunwale by way of the keel
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
      uvs.push(t, j / NT);
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
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
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

// --- assembly ---------------------------------------------------------------

// options:
//   track      registers a geometry or material for disposal, returns it
//   sunVec     shared sun direction (a Vector3 the world keeps up to date)
//   colors     { envelope: {shade, lit, rim}, hull: {shade, lit, rim}, haze, smoke,
//                and optionally rimStrength, rimPower, lamp, brass, and a key light:
//                keyDir, keyAmt, and a `key` colour on envelope and hull }
//   hazeAmt    how far the whole craft fades into the air (0.1 near, more far)
//   detail     false leaves off the smoke and the fine rigging, for a ship so
//              far away that neither would cover a pixel
//
// Returns the group. group.userData.update(t, halfHeightPx) turns the
// propeller and advances the steam.
export function buildSkyship({ track, sunVec, colors, hazeAmt = 0.1, detail = true }) {
  const g = new THREE.Group();

  // Thin parts -- fins, spars, rigging, the propeller, the skeg -- are `flat`:
  // one colour, no rim, no key light. Lit like the hull, their edges are a
  // different colour from their faces, and an edge one pixel wide that keeps
  // changing colour as the ship rolls is exactly a flicker.
  const keyDir = new THREE.Vector3(...(colors.keyDir ?? [0, -1, 0]));
  const lampCol = new THREE.Color(colors.lamp ?? colors.hull.rim);
  const brass = new THREE.Color(colors.brass ?? 0x9a845c);
  function material(c, panels, flat = false, length = ENV_LEN) {
    const shade = new THREE.Color(c.shade);
    const lit = new THREE.Color(c.lit);
    if (flat) {
      // Well toward the lit colour: these are seen against the sky, and a
      // fin in shadow colour simply vanishes into it at dusk.
      shade.lerp(new THREE.Color(c.key ?? c.lit), 0.6);
      lit.copy(shade);
    }
    return track(
      new THREE.ShaderMaterial({
        vertexShader: hullShader.vertexShader,
        fragmentShader: hullShader.fragmentShader,
        uniforms: {
          uShade: { value: shade },
          uLit: { value: lit },
          uRim: { value: new THREE.Color(c.rim) },
          uHaze: { value: new THREE.Color(colors.haze) },
          uSunDir: { value: sunVec },
          uRimStrength: { value: flat ? 0 : colors.rimStrength ?? 0.4 },
          uRimPower: { value: colors.rimPower ?? 3.0 },
          uRimDir: { value: colors.keyAmt ? 1 : 0 },
          uUnder: { value: new THREE.Color(0x000000) },
          uKeyDir: { value: keyDir },
          uKeyCol: { value: new THREE.Color(c.key ?? 0x000000) },
          uKeyAmt: { value: flat ? 0 : colors.keyAmt ?? 0 },
          uHazeAmt: { value: hazeAmt },
          uPanels: { value: panels },
          uRings: { value: 12 },
          uGores: { value: 14 },
          uLength: { value: length },
          uTrim: { value: brass },
          uLamp: { value: lampCol },
        },
        // Lathe, loft and extrusion each wind their own way; the normals are
        // what the shading reads, so draw both faces and stop caring.
        side: THREE.DoubleSide,
      })
    );
  }

  const bagMat = material(colors.envelope, 1); // ring frames and gores
  const bagPartMat = material(colors.envelope, 0, true); // fins, nose spike
  const hullMat = material(colors.hull, 2, false, HULL_LEN); // planks, copper, portholes
  const woodMat = material(colors.hull, 0); // deck, cabin
  const rodMat = material(colors.hull, 0, true); // spars and rigging
  // One flat colour each for brass and for lamplight.
  const flatOf = (col) => material({ shade: col, lit: col, rim: col, key: col }, 0, true);
  const brassMat = flatOf(brass);
  const lampMat = flatOf(lampCol);
  lampMat.uniforms.uHazeAmt.value = 0;

  // Envelope and its fins share a group, so the seam maths in the shader can
  // keep assuming the envelope's axis is the object's X axis.
  const bag = new THREE.Group();
  bag.position.y = ENV_Y;
  bag.add(new THREE.Mesh(track(envelopeGeometry()), bagMat));

  // A fan fin above and a smaller one below, kept out of the hull's rigging.
  // There is none out to the sides: seen broadside those were edge-on, a
  // one-pixel line that caught the light and flickered. Each entry is the
  // way up (+1 or -1) and the fan's rib tips; the ribs are added further
  // down, once there is a rod to make them from.
  const tailFans = [
    [1, fanTips(TAIL_FAN.angles, TAIL_FAN.lengths)],
    [-1, fanTips(TAIL_FAN.angles, TAIL_FAN.lengths, 0.7)],
  ];
  tailFans.forEach(([up, tips]) => {
    const fin = new THREE.Mesh(track(fanGeometry(tips)), bagPartMat);
    fin.position.x = TAIL_PIVOT_X;
    if (up < 0) fin.rotation.x = Math.PI;
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

  // The fins' ribs, standing a little proud of the canvas and running just
  // past its edge, so each scallop ends in a point.
  tailFans.forEach(([up, tips]) => {
    tips.forEach(([tx, ty]) => {
      rod(TAIL_PIVOT_X, ENV_Y, 0, TAIL_PIVOT_X + tx * 1.07, ENV_Y + up * ty * 1.07, 0, 0.3, rodMat);
    });
  });

  // A spike on the nose, for the mooring ring.
  rod(ENV_LEN / 2 - 1, ENV_Y, 0, ENV_LEN / 2 + 4, ENV_Y, 0, 0.35, bagPartMat);

  // Hull, deck and rudder.
  const hull = new THREE.Group();
  hull.position.set(HULL_X, DECK_Y, 0);
  hull.add(new THREE.Mesh(track(hullGeometry()), hullMat));
  hull.add(new THREE.Mesh(track(deckGeometry()), woodMat));
  // A deckhouse amidships, between the pylons, with its lamps lit.
  const cabin = new THREE.Mesh(track(new THREE.BoxGeometry(11, 2.7, 5.4)), woodMat);
  cabin.position.set(2.3, 1.35, 0);
  hull.add(cabin);
  const cabinRoof = new THREE.Mesh(track(new THREE.BoxGeometry(12.4, 0.45, 6.4)), brassMat);
  cabinRoof.position.set(2.3, 2.9, 0);
  hull.add(cabinRoof);
  const paneGeo = track(new THREE.BoxGeometry(1.2, 1.2, 0.2));
  [-1.9, 0.9, 3.7, 6.5].forEach((x) => {
    const pane = new THREE.Mesh(paneGeo, lampMat);
    pane.position.set(x, 1.45, 2.72);
    hull.add(pane);
  });

  // A fan rudder under the stern, the tail fins' smaller cousin.
  const rudderTips = fanTips(RUDDER_FAN.angles, RUDDER_FAN.lengths);
  const rudder = new THREE.Mesh(track(fanGeometry(rudderTips)), bagPartMat);
  rudder.position.set(RUDDER_PIVOT[0], RUDDER_PIVOT[1], 0);
  rudder.rotation.x = Math.PI; // the fan opens downward
  hull.add(rudder);
  g.add(hull);

  rudderTips.forEach(([tx, ty]) => {
    const px = HULL_X + RUDDER_PIVOT[0];
    const py = DECK_Y + RUDDER_PIVOT[1];
    rod(px, py, 0, px + tx * 1.07, py - ty * 1.07, 0, 0.26, rodMat);
  });

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
    rod(x, DECK_Y + sheerAt(t) - 0.5, 0, x, ENV_Y - envRadiusAt(x) + 0.6, 0, 0.6, rodMat);
  });

  // Rigging: lines fanning out from the gunwales to the envelope's flanks.
  if (detail) {
    const LINES = 7;
    for (let k = 0; k < LINES; k++) {
      const t = 0.12 + (k / (LINES - 1)) * 0.66;
      [-1, 1].forEach((side) => {
        const a = gunwale(t, side);
        const b = underBag(a[0] * 1.22 - 2, side);
        rod(a[0], a[1], a[2], b[0], b[1], b[2], 0.3, rodMat);
      });
    }
  }

  // Bowsprit, and the stay running from its tip up to the envelope.
  const bowX = HULL_X + HULL_LEN / 2;
  const spritTip = [bowX + 12, DECK_Y + 5.2, 0];
  rod(bowX - 1.5, DECK_Y + 1.5, 0, spritTip[0], spritTip[1], spritTip[2], 0.42, rodMat);
  if (detail) {
    const sx = spritTip[0] - 4;
    rod(spritTip[0], spritTip[1], 0, sx, ENV_Y - envRadiusAt(sx), 0, 0.25, rodMat);
  }

  // Steam exhaust: a short brass pipe out of the stern, just over the
  // propeller shaft. The engine that turns the screw vents here, and the
  // steam is blown straight back through the blades.
  const sternX = HULL_X - HULL_LEN / 2;
  const pipeTip = [sternX - 2.9, DECK_Y - 0.5, 0];
  rod(sternX + 2.0, DECK_Y - 0.5, 0, pipeTip[0], pipeTip[1], pipeTip[2], 0.6, brassMat);

  // Propeller on the stern post, in brass. Seen broadside its disc is
  // edge-on, so the four blades are broad and steeply pitched: each one
  // shows its width as it comes round instead of vanishing into a line.
  const prop = new THREE.Group();
  prop.position.set(sternX - 3.4, DECK_Y - 2.4, 0);
  const bladeGeo = track(new THREE.BoxGeometry(0.45, 6.0, 2.6));
  bladeGeo.rotateY(0.62);
  bladeGeo.translate(0, 3.5, 0);
  for (let k = 0; k < 4; k++) {
    const blade = new THREE.Mesh(bladeGeo, brassMat);
    blade.rotation.x = (k / 4) * Math.PI * 2;
    prop.add(blade);
  }
  const spinnerGeo = track(new THREE.ConeGeometry(1.25, 2.8, 12));
  spinnerGeo.rotateZ(Math.PI / 2); // point aft
  const spinner = new THREE.Mesh(spinnerGeo, brassMat);
  spinner.position.x = -1.2;
  prop.add(spinner);
  g.add(prop);
  // The shaft housing it turns on does not turn with it.
  const shaftGeo = track(new THREE.CapsuleGeometry(0.9, 3.4, 4, 8));
  shaftGeo.rotateZ(-Math.PI / 2);
  const shaft = new THREE.Mesh(shaftGeo, woodMat);
  shaft.position.set(sternX - 0.9, DECK_Y - 2.4, 0);
  g.add(shaft);

  // Lamps along the hull, where the palette asks for them.
  if (colors.lamp !== undefined && detail) {
    const lampGeo = track(new THREE.SphereGeometry(0.85, 10, 8));
    [
      gunwale(0.08, 0),
      gunwale(0.93, 0),
      [ENV_LEN / 2 - 6, ENV_Y - envRadiusAt(ENV_LEN / 2 - 6) - 0.6, 0],
    ].forEach(([x, y, z]) => {
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(x, y + 1.3, z);
      g.add(lamp);
    });
  }

  // Steam: paler than smoke, quicker to spread and quicker to go.
  let smokeMat = null;
  if (detail) {
    const PUFFS = 32;
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
          uLife: { value: 4.4 },
          uDrift: { value: 13 },
          uRise: { value: 5.0 },
          uSize: { value: 3.5 },
          uHalfH: { value: 400 },
          uColor: { value: new THREE.Color(colors.smoke) },
          uOpacity: { value: colors.smokeOpacity ?? 0.4 },
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
      smokeMat.uniforms.uSize.value = 3.5 * g.scale.x;
      smokeMat.uniforms.uHalfH.value = halfHeightPx;
    }
  };

  return g;
}
