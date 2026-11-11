import { NOISE_GLSL } from './noise.js';

// The near city: a wall of brick towers close enough to see into.
//
// Everything is drawn in elevation on one quad, in world units, so a floor is
// a floor whatever the screen. It is a steam-age city: mansards, gables,
// copper domes and a clock tower for roofs, chimneys that smoke, arched
// windows and portholes, and bolted to the walls in clusters the plant that
// runs it all -- boilers, standpipes, gears, gauges. Between the towers run
// iron truss bridges, stair-bridges and washing lines, so the people who live
// here can cross the city without ever going down to the street.
//
// It is all hashes of (tower, bay, floor), so nothing is stored and the
// street never repeats.

export const vertexShader = /* glsl */ `
uniform float uBaseY;
varying vec2 vW;
void main(){
  // World x, and height above the street.
  vW = vec2(position.x, position.y + uBaseY);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uScroll;   // world units per second
uniform float uSeed;
uniform float uTop;      // nothing solid may stand taller than this
uniform float uGloomY;   // below this the windows stay dark
uniform float uLife;     // 0 leaves out residents, walkers, smoke and motion
uniform float uHazeAmt;
uniform float uLitShare; // how many windows have a lamp on
uniform vec3  uWall;
uniform vec3  uMetal;    // iron, brass and copper
uniform vec3  uGlow;     // a lit window
uniform vec3  uVoid;     // an unlit one, and anything seen against the light
uniform vec3  uHaze;

varying vec2 vW;

${NOISE_GLSL}

const float CELL  = 78.0;  // one tower and its share of alley
const float BAY   = 9.5;   // window spacing
const float FLOOR = 10.5;  // storey height
const float TAU   = 6.28318530718;

float hs(float c, float k){ return hash12(vec2(c, k + uSeed)); }

// 1 inside [lo, hi], with edges one pixel soft.
float band(float v, float lo, float hi, float px){
  return smoothstep(lo - 0.5 * px, lo + 0.5 * px, v) *
         (1.0 - smoothstep(hi - 0.5 * px, hi + 0.5 * px, v));
}

// 1 inside a shape, from its signed distance.
float fill(float d, float px){ return 1.0 - smoothstep(-0.5 * px, 0.5 * px, d); }

float capsule(vec2 p, vec2 a, vec2 b, float r){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float sdBox(vec2 p, vec2 b){
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

void over(inout vec4 acc, vec3 c, float m){
  m = clamp(m, 0.0, 1.0);
  acc.rgb = c * m + acc.rgb * (1.0 - m);
  acc.a = m + acc.a * (1.0 - m);
}

// --- a tower ----------------------------------------------------------------

float gapL(float c){ return 5.0 + 14.0 * hs(c, 2.0); }
float gapR(float c){ return 5.0 + 14.0 * hs(c, 3.0); }

// 0 mansard, 1 gable, 2 clock tower, 3 dome.
float roofKind(float c){ return floor(hs(c, 16.0) * 4.0); }
// How much height each roof needs above the eaves.
float roofRise(float c){
  float k = roofKind(c);
  return k < 0.5 ? 12.0 : (k < 1.5 ? 13.0 : (k < 2.5 ? 30.0 : 18.0));
}
// Eaves height: whole floors, fitted under uTop with the roof on.
float towerH(float c){
  float room = max(uTop - roofRise(c), FLOOR * 2.0);
  return floor(room * (0.55 + 0.45 * hs(c, 4.0)) / FLOOR) * FLOOR + 1.4;
}
// Where the tower steps in, if it does.
float stepY(float c){ return floor(towerH(c) * 0.7 / FLOOR) * FLOOR; }
float stepsL(float c){ return step(0.45, hs(c, 5.0)); }
float stepsR(float c){ return step(0.70, hs(c, 5.0)); }

// --- who lives here ---------------------------------------------------------
//
// Head and shoulders against the lamp, in window units. Six people of the
// period: a gentleman in a top hat, a clerk in a bowler, a workman in a flat
// cap with his goggles on, a woman with her hair up, a lady in a wide hat
// with a feather, and a child who only just reaches the sill.

float resident(vec2 p, float seed, float px, out float lenses){
  float kind = floor(hash12(vec2(seed, 3.3)) * 6.0);
  float t = uTime * uLife;
  p.x -= (hash12(vec2(seed, 5.1)) - 0.5) * 1.6 + sin(t * 0.45 + seed * 40.0) * 0.35;
  p.y -= sin(t * 0.8 + seed * 17.0) * 0.06;
  lenses = 0.0;

  // Drawn large, then brought down to the size of the people on the bridges,
  // so the same folk are the same height indoors and out. The child is the
  // same figure again, smaller.
  float sc = (kind > 4.5 ? 0.68 : 1.0) * 0.62;
  p /= sc;
  vec2 q = vec2(abs(p.x), p.y);

  // Shoulders, neck, head.
  float broad = (kind > 2.5 && kind < 4.5) ? 1.55 : 1.9;
  float d = (length(vec2(p.x / broad, (p.y + 0.5) / 2.0)) - 1.0) * broad;
  d = min(d, sdBox(p - vec2(0.0, 1.75), vec2(0.3, 0.4)));
  vec2 hc = vec2(0.0, 2.75);
  d = min(d, (length(vec2((p.x - hc.x) / 0.74, (p.y - hc.y) / 0.86)) - 1.0) * 0.74);
  float crownY = hc.y + 0.62; // where a hat's brim sits

  if (kind < 0.5) {            // top hat
    d = min(d, sdBox(p - vec2(0.0, crownY + 0.8), vec2(0.62, 0.8)));
    d = min(d, sdBox(p - vec2(0.0, crownY + 0.05), vec2(1.08, 0.1)));
  } else if (kind < 1.5) {     // bowler
    d = min(d, max(length(p - vec2(0.0, crownY)) - 0.8, crownY - p.y));
    d = min(d, sdBox(p - vec2(0.0, crownY + 0.03), vec2(1.02, 0.09)) - 0.03);
  } else if (kind < 2.5) {     // flat cap, goggles
    d = min(d, (length(vec2((p.x - 0.12) / 0.98, (p.y - crownY - 0.1) / 0.36)) - 1.0) * 0.36);
    lenses = fill(length(q - vec2(0.33, hc.y + 0.12)) - 0.2, px);
  } else if (kind < 3.5) {     // hair up in a bun
    d = min(d, length(p - vec2(0.0, hc.y + 1.0)) - 0.42);
  } else if (kind < 4.5) {     // wide hat and a feather
    d = min(d, (length(vec2(p.x / 1.7, (p.y - crownY) / 0.2)) - 1.0) * 0.2);
    d = min(d, (length(vec2(p.x / 0.72, (p.y - crownY - 0.3) / 0.5)) - 1.0) * 0.5);
    d = min(d, capsule(p, vec2(0.5, crownY + 0.5), vec2(1.35, crownY + 1.5), 0.13));
  }

  return fill(d * sc, px);
}

// Someone crossing a bridge; feet is where they stand.
float walker(vec2 p, vec2 feet, float seed, float px){
  const float SIZE = 1.15; // a person is about 4.4 units: waist-high to a rail
  p = (p - feet) / SIZE;
  p.y -= abs(sin(uTime * 5.0 + seed * 20.0)) * 0.12;
  float h = hash12(vec2(seed, 8.0));
  float d = length(p - vec2(0.0, 3.3)) - 0.46;                            // head
  if (h > 0.6) {
    // A long skirt and a hat with a brim.
    d = min(d, capsule(p, vec2(0.0, 2.0), vec2(0.0, 2.5), 0.45));
    d = min(d, max(abs(p.x) - (0.35 + (2.1 - p.y) * 0.42), max(p.y - 2.1, -p.y)));
    d = min(d, sdBox(p - vec2(0.0, 3.72), vec2(0.72, 0.07)));
  } else {
    // A coat, two legs, and a top hat or a bowler.
    d = min(d, capsule(p, vec2(0.0, 1.5), vec2(0.0, 2.5), 0.5));
    float stride = sin(uTime * 5.0 + seed * 20.0) * 0.38;
    d = min(d, capsule(p, vec2(0.0, 1.4), vec2(stride, 0.1), 0.2));
    d = min(d, capsule(p, vec2(0.0, 1.4), vec2(-stride, 0.1), 0.2));
    float tall = h > 0.3 ? 0.5 : 0.24;
    d = min(d, sdBox(p - vec2(0.0, 3.74 + tall), vec2(0.36, tall)));
    d = min(d, sdBox(p - vec2(0.0, 3.72), vec2(0.6, 0.07)));
  }
  return fill(d * SIZE, px);
}

// --- the plant ----------------------------------------------------------------
//
// A cluster of machinery bolted across two bays and two floors of wall: a
// boiler with its firebox, a standing tank, the pipe that joins them, a pair
// of gears, a gauge and a vent. q runs 0..19 across and 0..21 up.

vec4 plant(vec2 q, float seed, vec3 wall, vec3 glow, float px){
  vec4 acc = vec4(0.0);
  float t = uTime * uLife;
  if (hash12(vec2(seed, 1.0)) > 0.5) q.x = 2.0 * BAY - q.x;

  // An iron plate behind it all.
  over(acc, wall * 0.74, fill(sdBox(q - vec2(9.5, 10.5), vec2(8.9, 9.6)), px));

  vec3 iron = uMetal * 0.62;

  // Pipework first, so the vessels sit over its ends.
  float pipe = capsule(q, vec2(5.0, 8.0), vec2(5.0, 16.6), 0.6);
  pipe = min(pipe, capsule(q, vec2(5.0, 16.6), vec2(15.2, 16.6), 0.6));
  pipe = min(pipe, capsule(q, vec2(15.2, 16.6), vec2(15.2, 14.0), 0.6));
  pipe = min(pipe, capsule(q, vec2(5.0, 16.6), vec2(5.0, 20.6), 0.6));
  pipe = min(pipe, capsule(q, vec2(15.2, 3.0), vec2(15.2, 0.4), 0.6));
  over(acc, uMetal * 0.9, fill(pipe, px));
  // Flanges at the joints.
  float fl = min(sdBox(q - vec2(5.0, 16.6), vec2(0.95)), sdBox(q - vec2(15.2, 16.6), vec2(0.95)));
  fl = min(fl, sdBox(q - vec2(5.0, 12.2), vec2(0.95, 0.3)));
  over(acc, iron, fill(fl, px));
  // A valve wheel on the cross pipe.
  vec2 vp = q - vec2(10.2, 16.6);
  float vr = length(vp);
  float wheel = max(band(vr, 1.0, 1.4, px), fill(min(abs(vp.x), abs(vp.y)) - 0.14, px) * step(vr, 1.2));
  over(acc, iron * 0.8, wheel);

  // Boiler: a drum on its side, strapped, lit from above.
  vec2 bp = q - vec2(7.2, 5.0);
  float boiler = sdBox(bp, vec2(4.4, 1.8)) - 1.6;
  vec3 drum = uMetal * (0.55 + 0.5 * smoothstep(-3.4, 3.4, bp.y));
  drum *= 1.0 - 0.28 * step(0.42, abs(fract((bp.x + 6.0) / 3.0) - 0.5));
  over(acc, drum, fill(boiler, px));
  // Firebox door, with the fire showing.
  float door = sdBox(q - vec2(10.9, 4.2), vec2(0.8, 1.0)) - 0.25;
  over(acc, iron * 0.6, fill(door - 0.3, px));
  over(acc, glow * (0.82 + 0.18 * sin(t * 7.0 + seed * 30.0)), fill(door, px));
  // Feet.
  over(acc, iron, band(abs(bp.x), 2.6, 3.3, px) * band(q.y, 0.9, 1.7, px));

  // Gauge on the drum.
  vec2 gp = q - vec2(3.9, 5.2);
  float gr = length(gp);
  over(acc, iron * 0.7, fill(gr - 1.35, px));
  over(acc, glow * 0.9, fill(gr - 1.05, px));
  float na = 1.5708 + 0.7 * sin(t * 1.1 + seed * 9.0);
  over(acc, uVoid, fill(capsule(gp, vec2(0.0), vec2(cos(na), sin(na)) * 0.85, 0.11), px));

  // Standing tank.
  vec2 tp = q - vec2(15.2, 8.5);
  float tank = sdBox(tp, vec2(0.2, 3.6)) - 2.2;
  vec3 tcol = uMetal * (0.62 + 0.4 * smoothstep(2.4, -2.4, tp.x));
  tcol *= 1.0 - 0.25 * step(0.42, abs(fract(tp.y / 3.4) - 0.5));
  over(acc, tcol, fill(tank, px));

  // Two gears, turning against each other.
  for (int i = 0; i < 2; i++) {
    vec2 gc = i == 0 ? vec2(9.3, 12.3) : vec2(2.5, 13.0);
    float R = i == 0 ? 2.3 : 1.25;
    float n = i == 0 ? 10.0 : 6.0;
    float dir = i == 0 ? 1.0 : -1.84;
    vec2 p = q - gc;
    float r = length(p);
    float a = atan(p.y, p.x) + t * 0.45 * dir + seed * 6.0;
    float tooth = smoothstep(-0.25, 0.25, sin(a * n));
    float rim = R + 0.48 * tooth;
    float cog = fill(r - rim, px) * (1.0 - fill(r - R * 0.34, px));
    // Spokes: cut four windows out of the web.
    float web = step(R * 0.52, r) * step(r, R * 0.80) * step(0.3, abs(sin(a * 2.0)));
    over(acc, uMetal * 0.8, cog * (1.0 - web));
    over(acc, iron * 0.7, fill(r - R * 0.2, px));
  }

  // A wisp of steam off the tank's relief valve.
  float age = fract(t * 0.22 + seed * 3.0);
  vec2 sp = q - vec2(16.6 + sin(age * 5.0 + seed) * 0.5, 15.0 + age * 5.0);
  float puff = (1.0 - smoothstep(0.3, 1.0 + age * 1.6, length(sp))) * (1.0 - age) * 0.5 * uLife;
  over(acc, mix(uHaze, glow, 0.3), puff);

  return acc;
}

void main(){
  float X = vW.x + uTime * uScroll + uSeed * 37.0;
  float Y = vW.y;
  float px = max(fwidth(vW.y), 1e-4);
  float t = uTime * uLife;

  vec4 acc = vec4(0.0);

  // Lamps go out toward the street: the footer text sits down there.
  float gloom = smoothstep(uGloomY - 4.0, uGloomY + 7.0, Y);
  vec3 glow = mix(uVoid, uGlow, gloom);

  // ---- the tower this pixel is in ------------------------------------------
  float c = floor(X / CELL);
  float lx = X - c * CELL;
  float gl = gapL(c);
  float bw = CELL - gl - gapR(c);
  float bx = lx - gl;
  float H = towerH(c);
  float upper = step(stepY(c), Y);
  float il = upper * stepsL(c) * BAY;
  float ir = upper * stepsR(c) * BAY;
  float s0 = il;
  float s1 = bw - ir;
  float mid = 0.5 * (s0 + s1);
  float hw = 0.5 * (s1 - s0);
  float ax = abs(bx - mid);
  float y = Y - H; // height above the eaves

  float body = band(bx, s0, s1, px) * (1.0 - smoothstep(H - 0.5 * px, H + 0.5 * px, Y));

  // Brick: each tower its own tone, darker toward the street, streaked, coursed.
  vec3 wall = uWall * (0.88 + 0.24 * hs(c, 13.0));
  wall *= mix(0.70, 1.0, smoothstep(0.0, uTop * 0.7, Y));
  wall *= 0.90 + 0.20 * vnoise(vec2(X * 0.45, Y * 0.07));
  wall *= 1.0 - 0.08 * band(fract(Y / 1.3), 0.0, 0.16, px / 1.3);
  // The side toward the sun catches a little of it.
  vec3 lit = mix(wall, uMetal, 0.35 * band(bx, s1 - 0.7, s1, px));

  // Facade grid.
  float nb = floor(bw / BAY);
  float m = (bw - nb * BAY) * 0.5;
  float u = (bx - m) / BAY;
  float bi = floor(u);
  float fu = fract(u);
  float fi = floor(Y / FLOOR);
  float fv = fract(Y / FLOOR);
  float cx = m + (bi + 0.5) * BAY;
  float inBay = step(0.0, bi) * step(bi, nb - 0.5) * step(s0 + 1.0, cx) * step(cx, s1 - 1.0);
  float inGrid = inBay * step((fi + 1.0) * FLOOR, H - 1.0);
  float pu = px / BAY;
  float pv = px / FLOOR;

  // ---- roof ------------------------------------------------------------------
  float kind = roofKind(c);
  float roof = 0.0;
  vec3 slate = wall * 0.80;
  slate *= 1.0 - 0.12 * band(fract(y / 1.1), 0.0, 0.22, px / 1.1);
  vec3 roofCol = slate;

  if (y > -0.6) {
    if (kind < 0.5) {
      // Mansard, with a dormer over each bay.
      roof = fill(ax - (hw - max(y, 0.0) * 0.45), px) * band(y, -0.5, 8.0, px);
      float dorm = fill(sdBox(vec2((fu - 0.5) * BAY, y - 3.9), vec2(1.5, 2.0)) - 0.3, px) *
                   inBay * step(ax, hw - 5.0);
      float on = step(0.5, hash12(vec2(c * 5.0 + bi, 77.0 + uSeed)));
      roofCol = mix(roofCol, mix(uVoid, glow, on), dorm);
    } else if (kind < 1.5) {
      // Gable, with an oculus under the ridge.
      float rh = min(13.0, hw * 0.8);
      roof = max(
        fill(ax - hw * (1.0 - y / rh), px) * band(y, -0.5, rh, px),
        fill(ax - (hw + 1.2), px) * band(y, -0.3, 0.7, px));
      float oc = length(vec2(bx - mid, y - rh * 0.36));
      roofCol = mix(roofCol, wall * 1.25, fill(oc - 2.0, px));
      roofCol = mix(roofCol, mix(uVoid, glow, step(0.4, hs(c, 78.0))), fill(oc - 1.5, px));
    } else if (kind < 2.5) {
      // Clock tower: a turret, a cornice, a spire, and battlements either side.
      float turret = fill(ax - 7.0, px) * band(y, -0.5, 17.0, px);
      float cornice = fill(ax - 8.0, px) * band(y, 16.0, 17.0, px);
      float spire = fill(ax - 8.2 * (1.0 - (y - 17.0) / 13.0), px) * band(y, 16.6, 30.0, px);
      float crenel = fill(ax - hw, px) * band(y, -0.5, 1.7, px) * step(0.45, fract(bx / 2.6));
      roof = max(max(turret, spire), max(cornice, crenel));
      roofCol = mix(lit, slate, spire);
      roofCol = mix(roofCol, wall * 1.25, cornice);

      vec2 cp = vec2(bx - mid, y - 9.5);
      float cr = length(cp);
      roofCol = mix(roofCol, uMetal * 0.6, fill(cr - 4.7, px));
      vec3 dial = glow * 0.95;
      float ca = atan(cp.y, cp.x);
      dial = mix(dial, uVoid, step(0.40, abs(fract(ca / TAU * 12.0) - 0.5)) * band(cr, 3.2, 3.8, px));
      float am = 1.5708 - t * 0.05 - hs(c, 79.0) * TAU;
      float ah = 1.5708 - t * 0.05 / 12.0 - hs(c, 80.0) * TAU;
      float hands = min(
        capsule(cp, vec2(0.0), vec2(cos(am), sin(am)) * 3.3, 0.2),
        capsule(cp, vec2(0.0), vec2(cos(ah), sin(ah)) * 2.1, 0.3));
      dial = mix(dial, uVoid, fill(hands, px));
      roofCol = mix(roofCol, dial, fill(cr - 4.1, px));
    } else {
      // Copper dome on a drum, with a finial.
      float rx = min(hw * 0.62, 12.0);
      float drum = fill(ax - (rx + 0.9), px) * band(y, -0.5, 3.0, px);
      float dome = fill((length(vec2(ax / rx, max(y - 3.0, 0.0) / 10.5)) - 1.0) * rx, px) * step(2.5, y);
      float fin = max(
        fill(ax - 0.28, px) * band(y, 13.0, 18.0, px),
        fill(length(vec2(ax, y - 15.4)) - 0.8, px));
      roof = max(drum, max(dome, fin));
      vec3 copper = uMetal * (0.50 + 0.45 * smoothstep(3.0, 13.5, y));
      copper *= 1.0 - 0.16 * step(0.44, abs(fract(ax / rx * 2.5) - 0.5));
      roofCol = mix(lit, copper, max(dome, fin));
    }
  }

  // Chimneys, and what comes out of them.
  float chim = 0.0;
  float smoke = 0.0;
  if (kind < 1.5 || kind > 2.5) {
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      if (hs(c, 22.0 + fk) < 0.3) continue;
      float chx = k == 0 ? s0 + (s1 - s0) * (0.10 + 0.18 * hs(c, 24.0))
                         : s1 - (s1 - s0) * (0.10 + 0.18 * hs(c, 25.0));
      float chH = 7.0 + 4.0 * hs(c, 26.0 + fk);
      chim = max(chim, max(
        band(bx, chx - 1.3, chx + 1.3, px) * band(y, -1.0, chH, px),
        band(bx, chx - 1.8, chx + 1.8, px) * band(y, chH - 0.9, chH, px)));
      float sy = y - chH;
      if (uLife > 0.5 && sy > 0.0 && sy < 26.0) {
        float ctr = chx - sy * 0.3 + 1.4 * sin(sy * 0.28 + t * 0.5 + fk * 3.0 + c);
        float e = (bx - ctr) / (1.1 + sy * 0.2);
        float dens = exp(-e * e) * (1.0 - sy / 26.0) * smoothstep(0.0, 1.5, sy) *
                     (0.35 + 0.65 * vnoise(vec2((bx - ctr) * 0.4 + c, sy * 0.3 - t * 0.8)));
        smoke = max(smoke, dens * 0.55);
      }
    }
  }

  // ---- facade ----------------------------------------------------------------
  vec3 face = lit;

  // String course at every floor.
  face = mix(face, wall * 1.22, band(fv, 0.0, 0.05, pv) * step((fi + 0.5) * FLOOR, H));

  // Standpipes up some bay lines, flanged, and a main along some floors.
  float riser = step(0.5, hs(c * 3.0 + bi, 14.0)) * band(fu, 0.0, 0.06, pu) * inBay;
  vec3 brass = uMetal * (0.85 - 0.25 * step(0.9, fract(Y / 4.2)));
  face = mix(face, brass, riser * step(Y, H - 1.0));
  float mainOn = step(0.72, hs(c * 5.0 + fi, 15.0)) * step((fi + 1.0) * FLOOR, H);
  face = mix(face, uMetal * 0.8, mainOn * band(fv, 0.085, 0.135, pv));

  // One bay in most towers is a fire stair; one block of wall carries the plant.
  float stairBay = floor(hs(c, 11.0) * nb);
  float hasStair = step(0.3, hs(c, 10.0));
  float isStair = hasStair * step(abs(bi - stairBay), 0.5) * inGrid;

  float cb = stairBay < nb * 0.5
    ? nb - 2.0 - floor(hs(c, 18.0) * max(nb * 0.5 - 2.0, 0.0))
    : floor(hs(c, 18.0) * max(nb * 0.5 - 1.0, 1.0));
  float cfMax = stepY(c) / FLOOR - 2.0;
  float cf = 1.0 + floor(hs(c, 19.0) * max(cfMax, 0.0));
  float clash = hasStair * step(cb - 0.5, stairBay) * step(stairBay, cb + 1.5);
  float hasPlant = step(1.0, cfMax) * step(3.0, nb) * step(0.12, hs(c, 20.0)) * (1.0 - clash);
  float inPlant = hasPlant * step(cb - 0.5, bi) * step(bi, cb + 1.5) *
                  step(cf - 0.5, fi) * step(fi, cf + 1.5);

  if (isStair > 0.5) {
    // An iron fire escape, sized to the people who use it: two flights to a
    // floor, switching back, each about as long as a person is tall, with
    // treads, a handrail, and a landing at every turn.
    face = mix(face, wall * 0.74, band(fu, 0.10, 0.90, pu));
    float FL = FLOOR * 0.5;               // one flight's rise
    float sx = fu * BAY;                  // across the bay, in units
    float hf = fv * 2.0;
    float nth = fi * 2.0 + floor(hf);     // which flight, counted from the street
    float sv = fract(hf) * FL;            // height within this flight
    float x0 = 2.6;
    float x1 = 6.9;
    float raw = clamp((sx - x0) / (x1 - x0), 0.0, 1.0);
    float flip = mod(nth, 2.0);
    float along = flip > 0.5 ? 1.0 - raw : raw;
    float inRun = band(sx, x0, x1, px);

    float tread = floor(along * 8.0 + 0.5) / 8.0 * FL;
    float steps = band(sv, tread - 0.42, tread, px) * inRun;
    // Handrail of this flight, and the top of the one below, which runs the
    // other way and pokes up into this half-floor.
    float rail = band(sv, along * FL + 2.0, along * FL + 2.2, px);
    rail = max(rail, band(sv + FL, (1.0 - along) * FL + 2.0, (1.0 - along) * FL + 2.2, px));
    rail *= inRun;
    // The landing this flight starts from, with its guard rail.
    float side = flip > 0.5 ? band(sx, x1 - 0.2, 8.3, px) : band(sx, 1.2, x0 + 0.2, px);
    float landing = side * max(band(sv, 0.0, 0.32, px), band(sv, 2.0, 2.2, px));
    // Uprights at the outer corners.
    float posts = max(band(sx, 1.1, 1.32, px), band(sx, 8.18, 8.4, px));

    face = mix(face, uMetal * 0.9, max(max(steps, landing), max(rail * 0.8, posts * 0.8)));
  } else if (inPlant > 0.5) {
    vec4 mach = plant(vec2(bx - m - cb * BAY, Y - cf * FLOOR), c + 0.5, wall, glow, px);
    face = mach.rgb + face * (1.0 - mach.a);
  } else if (inGrid > 0.5) {
    vec2 id = vec2(c * 13.0 + bi, fi + uSeed);
    float r = hash12(id);

    // Tall and round-headed, or on some towers a porthole.
    float port = step(0.78, hs(c, 17.0));
    vec2 wp = vec2((fu - 0.5) * BAY, (fv - 0.62) * FLOOR);
    float dWin = port > 0.5
      ? length(vec2(wp.x, wp.y + 1.0)) - 2.5
      : (wp.y > 0.0 ? length(wp) - 2.45 : max(abs(wp.x) - 2.45, -(wp.y + 4.0)));
    float win = fill(dWin, px);
    float sillY = port > 0.5 ? 3.0 : 2.5;

    // Unlit: a hole a shade darker than the wall. Lit: lamp colour, warmer
    // toward the sill.
    vec3 pane = uVoid;
    if (r > 1.0 - uLitShare) {
      pane = glow * (0.80 + 0.24 * smoothstep(0.85, 0.24, fv));
      float r2 = hash12(id + 4.4);
      if (r2 < 0.20) {
        // Louvred shutters.
        pane *= 0.62 + 0.38 * step(0.5, fract(fv * FLOOR * 1.6));
      } else if (r2 < 0.38) {
        // Curtains drawn part way.
        pane *= 1.0 - 0.5 * step(0.14, abs(fu - 0.5) - 0.02 * sin(fv * 40.0));
      } else if (r2 < 0.80 && uLife > 0.5) {
        vec2 p = vec2((fu - 0.5) * BAY, fv * FLOOR - sillY);
        float lenses;
        float who = resident(p, r2 + r * 7.0, px, lenses);
        pane = mix(pane, uVoid * 0.85, who);
        pane = mix(pane, glow, lenses * who);
      }
      // Glazing bars.
      float bars = max(band(fu, 0.488, 0.512, pu), band(wp.y, -0.12, 0.12, px) * (1.0 - port));
      pane = mix(pane, wall * 0.8, bars);
    }
    // A course of lighter brick round the opening, then the opening.
    face = mix(face, wall * 1.28, fill(dWin - 0.55, px));
    face = mix(face, pane, win);
    // Sill.
    face = mix(face, wall * 1.4, band(fu, 0.18, 0.82, pu) * band(fv * FLOOR, sillY - 0.75, sillY - 0.3, px) * (1.0 - port));

    // A gas lamp on a bracket beside some windows.
    float r3 = hash12(id + 9.1);
    if (r3 > 0.72) {
      vec2 lp = vec2((fu - 0.91) * BAY, fv * FLOOR - 5.6);
      face = mix(face, uMetal * 0.7, band(lp.y, -1.3, -1.05, px) * band(lp.x, -0.2, 0.85, px));
      face = mix(face, uMetal * 0.7, fill(sdBox(lp - vec2(0.0, 0.75), vec2(0.62, 0.12)), px));
      face = mix(face, glow * (0.9 + 0.1 * sin(t * 9.0 + r3 * 50.0)), fill(sdBox(lp, vec2(0.42, 0.62)), px));
    }
  }

  over(acc, mix(wall, uHaze, 0.35), smoke);
  over(acc, wall * 0.9, chim);
  over(acc, roofCol, roof);
  over(acc, face, body);

  // ---- the alley nearest this pixel ----------------------------------------
  float a = floor(X / CELL + 0.5);
  float dx = X - a * CELL;
  float aL = -gapR(a - 1.0);
  float aR = gapL(a);
  float aw2 = aR - aL;
  float inAlley = band(dx, aL, aR, px);
  float tn = clamp((dx - aL) / aw2, 0.0, 1.0);

  // How high both walls are still there to hang things from.
  float reachL = stepsR(a - 1.0) > 0.5 ? stepY(a - 1.0) : towerH(a - 1.0) - FLOOR;
  float reachR = stepsL(a) > 0.5 ? stepY(a) : towerH(a) - FLOOR;
  float reach = min(reachL, reachR);
  float floors = floor(reach / FLOOR);

  if (inAlley > 0.001) {
    // A shop sign hung off the left-hand tower.
    if (hs(a, 12.0) > 0.45 && aw2 > 7.0) {
      float sy = FLOOR * (1.0 + floor(hs(a, 15.0) * max(floors - 1.0, 1.0))) + 2.0;
      vec2 sp = vec2(dx - aL, Y - sy);
      // A painted board on an iron bracket, with a lamp-lit roundel.
      float board = fill(sdBox(sp - vec2(2.3, 2.6), vec2(1.5, 2.3)) - 0.3, px);
      float bracket = max(
        band(sp.x, 0.0, 3.9, px) * band(sp.y, 5.5, 5.8, px),
        band(sp.x, 2.15, 2.45, px) * band(sp.y, 5.0, 5.6, px));
      float ring = length(sp - vec2(2.3, 2.8));
      vec3 sign = mix(wall * 0.6, uMetal, band(ring, 0.95, 1.25, px));
      sign = mix(sign, glow * 0.9, fill(ring - 0.6, px));
      float fits = step(sy + 7.0, reachL + FLOOR);
      over(acc, uMetal * 0.7, bracket * fits);
      over(acc, sign, board * fits);
    }

    // A washing line.
    if (hs(a, 50.0) > 0.35 && floors >= 2.0) {
      float ly = FLOOR * (1.0 + floor(hs(a, 51.0) * (floors - 1.0))) + 6.5;
      float sag = 0.10 * aw2 * (1.0 - (2.0 * tn - 1.0) * (2.0 * tn - 1.0));
      float lineY = ly - sag;
      float lw = max(0.10, 0.6 * px);
      over(acc, uVoid, band(Y, lineY - lw, lineY + lw, px) * inAlley * 0.8);
      float n = floor(aw2 / 2.6);
      float seg = floor(tn * n);
      float sf = fract(tn * n);
      float ch = hash12(vec2(seg + a * 7.0, 52.0));
      float cloth = step(0.35, ch) * band(sf, 0.18, 0.82, px * n / aw2) *
                    band(Y, lineY - 1.4 - 1.6 * ch, lineY, px);
      over(acc, mix(uMetal, glow, step(0.7, ch)) * 0.95, cloth * inAlley);
    }

    // Bridges. Some are level, some climb a floor as they cross.
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      if (floors < 1.0) break;
      if (k > 0 && hs(a, 30.0 + fk) < 0.45) continue;
      float yb = FLOOR * (1.0 + floor(hs(a, 20.0 + fk) * floors));
      float climb = 0.0;
      float sl = hs(a, 40.0 + fk);
      // A stair-bridge is level at both ends with one flight in the middle:
      // nineteen treads of 0.8 to the floor, which is a stair a person could
      // climb, and needs an alley wide enough to hold it.
      if (sl > 0.55 && yb + FLOOR <= reach && aw2 > 18.5) climb = sl > 0.78 ? 1.0 : -1.0;
      float y0 = climb < 0.0 ? yb + FLOOR : yb;
      float fx0 = (aL + aR) * 0.5 - 7.6;
      float stepN = clamp(floor((dx - fx0) / 0.8) + 1.0, 0.0, 19.0);
      float deck = y0 + climb * stepN / 19.0 * FLOOR;
      float onFlight = abs(climb) * step(0.5, stepN) * step(stepN, 18.5);

      float slab = band(Y, deck - 0.75, deck, px);
      // Iron truss under the deck: a bottom chord and crossed diagonals.
      float ty = (Y - (deck - 3.0)) / 2.25;
      float tx = fract(dx / 2.6);
      float web = step(min(abs(tx - ty), abs(tx - (1.0 - ty))), 0.10) * band(ty, 0.0, 1.0, px / 2.25) * (1.0 - onFlight);
      float chord = band(Y, deck - 3.0, deck - 2.7, px) * (1.0 - onFlight);
      float rail = band(Y, deck + 2.25, deck + 2.5, px);
      float posts = step(fract(dx / 2.4), 0.11) * band(Y, deck, deck + 2.4, px);
      float roofed = step(0.6, hs(a, 60.0 + fk)) * (1.0 - abs(climb));
      float canopy = roofed * max(
        band(Y, deck + 6.0, deck + 6.5, px),
        step(fract(dx / 4.8), 0.07) * band(Y, deck, deck + 6.2, px));
      over(acc, wall * 0.78, max(slab, canopy) * inAlley);
      over(acc, uMetal * 0.8, max(max(rail, posts), max(web, chord)) * inAlley * (1.0 - slab));
      // A lantern under the canopy.
      float lamp = roofed * fill(length(vec2(dx - (aL + aR) * 0.5, Y - (deck + 5.45))) - 0.5, px);
      over(acc, glow, lamp * inAlley);

      // Someone on it, now and then.
      if (uLife > 0.5) {
        float seed = a * 3.7 + fk;
        float speed = 1.3 + 0.8 * hash12(vec2(seed, 1.0));
        float cycle = (aw2 + 3.0) / speed * (1.6 + 2.6 * hash12(vec2(seed, 2.0)));
        float gone = fract(uTime / cycle + hash12(vec2(seed, 3.0))) * cycle * speed - 1.5;
        float wt = gone / aw2;                       // 0..1 across, beyond that indoors
        if (hash12(vec2(seed, 4.0)) > 0.5) wt = 1.0 - wt;
        if (wt > -0.2 && wt < 1.2) {
          float wstep = clamp(floor((aL + wt * aw2 - fx0) / 0.8) + 1.0, 0.0, 19.0);
          float wdeck = y0 + climb * wstep / 19.0 * FLOOR;
          float w = walker(vec2(dx, Y), vec2(aL + wt * aw2, wdeck), seed, px);
          over(acc, uVoid * 0.8, w * inAlley);
        }
      }
    }
  }

  if (acc.a < 0.003) discard;
  vec3 col = acc.rgb / acc.a;
  col = mix(col, uHaze, uHazeAmt);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), acc.a);
}
`;
