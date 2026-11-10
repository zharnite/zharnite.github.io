import { NOISE_GLSL } from './noise.js';

// The near city: a wall of tenement towers close enough to see into.
//
// Everything is drawn in elevation on one quad, in world units, so a floor is
// a floor whatever the screen: towers, their windows and who is home, the air
// conditioners bolted outside, fire stairs, and in the alleys between towers
// the bridges, stair-bridges and washing lines that let the people who live
// here cross the city without ever going down to the street.
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
uniform float uTop;      // tallest a tower may stand
uniform float uGloomY;   // below this the windows stay dark
uniform float uLife;     // 0 leaves out residents, walkers and fans
uniform float uHazeAmt;
uniform float uLitShare; // how many windows have a lamp on
uniform vec3  uWall;
uniform vec3  uMetal;    // stairs, rails, air conditioners
uniform vec3  uGlow;     // a lit window
uniform vec3  uVoid;     // an unlit one, and anything seen against the light
uniform vec3  uHaze;

varying vec2 vW;

${NOISE_GLSL}

const float CELL  = 78.0;  // one tower and its share of alley
const float BAY   = 9.5;   // window spacing
const float FLOOR = 10.5;  // storey height

float hs(float c, float k){ return hash12(vec2(c, k + uSeed)); }

// 1 inside [lo, hi], with edges one pixel soft.
float band(float v, float lo, float hi, float px){
  return smoothstep(lo - 0.5 * px, lo + 0.5 * px, v) *
         (1.0 - smoothstep(hi - 0.5 * px, hi + 0.5 * px, v));
}

float capsule(vec2 p, vec2 a, vec2 b, float r){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

// --- a tower ----------------------------------------------------------------

float gapL(float c){ return 5.0 + 14.0 * hs(c, 2.0); }
float gapR(float c){ return 5.0 + 14.0 * hs(c, 3.0); }
// Whole floors, and a parapet.
float towerH(float c){ return floor(uTop * (0.45 + 0.55 * hs(c, 4.0)) / FLOOR) * FLOOR + 1.4; }
// Where the tower steps in, if it does.
float stepY(float c){ return floor(towerH(c) * 0.7 / FLOOR) * FLOOR; }
float stepsL(float c){ return step(0.45, hs(c, 5.0)); }
float stepsR(float c){ return step(0.70, hs(c, 5.0)); }

// --- who lives here ---------------------------------------------------------
//
// Head and shoulders against the light, in window units. Six kinds, none of
// them quite human: horns, long ears, feelers, a tall one-eyed dome, a wide
// flat head on stalks, a crest of spines.

float resident(vec2 p, float seed, float px, out float eyes){
  float kind = floor(hash12(vec2(seed, 3.3)) * 6.0);
  float t = uTime;
  p.x -= (hash12(vec2(seed, 5.1)) - 0.5) * 1.8 + sin(t * 0.45 + seed * 40.0) * 0.4;
  p.y -= sin(t * 0.8 + seed * 17.0) * 0.07;
  vec2 q = vec2(abs(p.x), p.y);

  float d = (length(vec2(p.x / 1.8, (p.y + 0.3) / 2.0)) - 1.0) * 1.8; // shoulders
  vec2 hc = vec2(0.0, 2.5);
  float eyeR = 0.14;
  vec2 eyeAt = vec2(0.36, 2.6);

  if (kind < 0.5) {            // horns
    d = min(d, length(p - hc) - 0.95);
    d = min(d, capsule(q, vec2(0.55, 3.2), vec2(1.25, 4.4), 0.17));
  } else if (kind < 1.5) {     // long ears
    d = min(d, length(p - hc) - 0.9);
    d = min(d, (length(vec2((q.x - 0.5) / 0.27, (q.y - 4.1) / 1.05)) - 1.0) * 0.27);
  } else if (kind < 2.5) {     // feelers
    d = min(d, length(p - hc) - 0.9);
    d = min(d, capsule(q, vec2(0.3, 3.2), vec2(0.95, 4.5), 0.08));
    d = min(d, length(q - vec2(0.95, 4.5)) - 0.24);
  } else if (kind < 3.5) {     // one eye
    d = min(d, (length(vec2(p.x / 0.85, (p.y - 2.9) / 1.4)) - 1.0) * 0.85);
    eyeR = 0.30;
    eyeAt = vec2(0.0, 3.1);
  } else if (kind < 4.5) {     // wide head, eyes on stalks
    d = min(d, (length(vec2(p.x / 1.45, (p.y - 2.3) / 0.8)) - 1.0) * 0.8);
    d = min(d, capsule(q, vec2(0.8, 2.8), vec2(1.0, 3.7), 0.1));
    d = min(d, length(q - vec2(1.0, 3.8)) - 0.26);
    eyeAt = vec2(1.0, 3.8);
    eyeR = 0.11;
  } else {                     // crest
    d = min(d, length(p - hc) - 0.92);
    d = min(d, capsule(p, vec2(0.0, 3.2), vec2(0.0, 4.5), 0.13));
    d = min(d, capsule(q, vec2(0.4, 3.1), vec2(0.8, 4.1), 0.12));
  }

  // Eyes that catch the light, and now and then close.
  float blink = step(0.93, fract(t * 0.21 + seed * 9.0));
  eyes = (1.0 - smoothstep(eyeR - px, eyeR + px, length(q - eyeAt))) * (1.0 - blink);
  return 1.0 - smoothstep(-0.5 * px, 0.5 * px, d);
}

// Someone crossing a bridge; feet is where they stand.
float walker(vec2 p, vec2 feet, float seed, float px){
  p -= feet;
  p.y -= abs(sin(uTime * 5.0 + seed * 20.0)) * 0.14;
  float d = capsule(p, vec2(0.0, 0.55), vec2(0.0, 2.1), 0.55);
  d = min(d, length(p - vec2(0.0, 3.05)) - 0.5);
  vec2 q = vec2(abs(p.x), p.y);
  if (hash12(vec2(seed, 8.0)) > 0.5) d = min(d, capsule(q, vec2(0.3, 3.4), vec2(0.65, 4.1), 0.1));
  else d = min(d, capsule(q, vec2(0.25, 3.4), vec2(0.3, 4.3), 0.13));
  return 1.0 - smoothstep(-0.5 * px, 0.5 * px, d);
}

void over(inout vec4 acc, vec3 c, float m){
  m = clamp(m, 0.0, 1.0);
  acc.rgb = c * m + acc.rgb * (1.0 - m);
  acc.a = m + acc.a * (1.0 - m);
}

void main(){
  float X = vW.x + uTime * uScroll + uSeed * 37.0;
  float Y = vW.y;
  float px = max(fwidth(vW.y), 1e-4);

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

  float body = band(bx, il, bw - ir, px) * (1.0 - smoothstep(H - 0.5 * px, H + 0.5 * px, Y));

  // Roof clutter: a water tank on legs, and an aerial.
  float span = bw - il - ir;
  float tx = il + span * (0.25 + 0.5 * hs(c, 6.0));
  float tank = step(0.4, hs(c, 7.0)) * max(
    band(bx, tx - 2.6, tx + 2.6, px) * band(Y, H + 1.5, H + 5.6, px),
    band(abs(bx - tx), 1.6, 2.0, px) * band(Y, H - 0.2, H + 1.6, px));
  float ax = il + span * (0.12 + 0.76 * hs(c, 8.0));
  float aTop = H + 4.0 + 6.0 * hs(c, 9.0);
  float aw = max(0.2, 0.7 * px);
  float aerial = max(
    band(bx, ax - aw, ax + aw, px) * band(Y, H - 0.2, aTop, px),
    band(bx, ax - 1.5, ax + 1.5, px) * band(Y, aTop - 2.0 - aw, aTop - 2.0 + aw, px));

  // Wall: each tower its own tone, darker toward the street, streaked.
  vec3 wall = uWall * (0.88 + 0.24 * hs(c, 13.0));
  wall *= mix(0.70, 1.0, smoothstep(0.0, uTop * 0.7, Y));
  wall *= 0.90 + 0.20 * vnoise(vec2(X * 0.45, Y * 0.07));
  // The side toward the sun catches a little of it.
  wall = mix(wall, uMetal, 0.35 * band(bx, bw - ir - 0.7, bw - ir, px));

  vec3 face = wall;

  // Facade grid.
  float nb = floor(bw / BAY);
  float m = (bw - nb * BAY) * 0.5;
  float u = (bx - m) / BAY;
  float bi = floor(u);
  float fu = fract(u);
  float fi = floor(Y / FLOOR);
  float fv = fract(Y / FLOOR);
  float cx = m + (bi + 0.5) * BAY;
  float inGrid = step(0.0, bi) * step(bi, nb - 0.5) *
                 step(il + 1.0, cx) * step(cx, bw - ir - 1.0) *
                 step((fi + 1.0) * FLOOR, H - 1.0);
  float pu = px / BAY;
  float pv = px / FLOOR;

  // Floor slabs.
  face = mix(face, wall * 1.22, band(fv, 0.0, 0.05, pv) * step((fi + 0.5) * FLOOR, H));

  // One bay in most towers is a fire stair instead of windows.
  float stairBay = floor(hs(c, 11.0) * nb);
  float isStair = step(0.3, hs(c, 10.0)) * step(abs(bi - stairBay), 0.5) * inGrid;

  if (isStair > 0.5) {
    face = mix(face, wall * 0.72, band(fu, 0.10, 0.90, pu));
    float along = clamp((fu - 0.16) / 0.68, 0.0, 1.0);
    float target = mod(fi, 2.0) < 0.5 ? along : 1.0 - along;
    float dist = abs(fv - target) * FLOOR * 0.53;
    float flight = (1.0 - smoothstep(0.32, 0.32 + px, dist)) * band(fu, 0.16, 0.84, pu);
    float frame = max(band(fu, 0.10, 0.14, pu), band(fu, 0.86, 0.90, pu));
    float landing = band(fv, 0.0, 0.07, pv) * band(fu, 0.10, 0.90, pu);
    face = mix(face, uMetal, max(flight, max(frame, landing)) * 0.9);
  } else if (inGrid > 0.5) {
    vec2 id = vec2(c * 13.0 + bi, fi + uSeed);
    float r = hash12(id);
    float win = band(fu, 0.22, 0.78, pu) * band(fv, 0.26, 0.80, pv);

    // Unlit: a hole a shade darker than the wall. Lit: lamp colour, warmer
    // toward the sill.
    vec3 pane = uVoid;
    float lit = step(1.0 - uLitShare, r);
    if (lit > 0.5) {
      pane = glow * (0.80 + 0.24 * smoothstep(0.80, 0.26, fv));
      float r2 = hash12(id + 4.4);
      if (r2 < 0.22) {
        // Blinds.
        pane *= 0.62 + 0.38 * step(0.5, fract(fv * FLOOR * 1.6));
      } else if (r2 < 0.40) {
        // Curtains drawn part way.
        pane *= 1.0 - 0.5 * step(0.14, abs(fu - 0.5) - 0.02 * sin(fv * 40.0));
      } else if (r2 < 0.80 && uLife > 0.5) {
        vec2 p = vec2((fu - 0.5) * BAY, (fv - 0.26) * FLOOR);
        float eyes;
        float who = resident(p, r2 + r * 7.0, px, eyes);
        pane = mix(pane, uVoid * 0.85, who);
        pane = mix(pane, glow, eyes * who);
      }
      // Glazing bars.
      float bars = max(band(fu, 0.488, 0.512, pu), band(fv, 0.585, 0.605, pv));
      pane = mix(pane, wall * 0.8, bars);
    }
    face = mix(face, pane, win);
    // Sill.
    face = mix(face, wall * 1.3, band(fu, 0.18, 0.82, pu) * band(fv, 0.215, 0.26, pv));

    // An air conditioner hung under the window, fan turning.
    float r3 = hash12(id + 9.1);
    if (r3 > 0.52) {
      float box = band(fu, 0.46, 0.96, pu) * band(fv, 0.0, 0.24, pv);
      vec3 ac = uMetal * (0.78 + 0.3 * r3);
      vec2 fp = vec2((fu - 0.71) * BAY, (fv - 0.12) * FLOOR);
      float fr = length(fp);
      float disc = 1.0 - smoothstep(1.0 - px, 1.0 + px, fr);
      float spin = uLife > 0.5 ? uTime * (2.0 + 5.0 * r3) : 0.0;
      float blades = smoothstep(-0.2, 0.2, sin(atan(fp.y, fp.x) * 3.0 + spin));
      ac = mix(ac, mix(uVoid, uMetal * 0.7, blades * step(0.22, fr)), disc);
      face = mix(face, ac, box);
    }
  }

  // A pipe up some bay lines.
  float pipe = step(0.62, hs(c * 3.0 + bi, 14.0)) * band(fu, 0.0, 0.045, pu) * step(0.0, bi) * step(bi, nb - 0.5);
  face = mix(face, wall * 0.74, pipe * step(Y, H - 1.0));

  over(acc, wall, max(tank, aerial));
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
    // A sign hung off the left-hand tower.
    if (hs(a, 12.0) > 0.45 && aw2 > 7.0) {
      float sy = FLOOR * (1.0 + floor(hs(a, 15.0) * max(floors - 1.0, 1.0))) + 1.5;
      vec2 sp = vec2(dx - aL, Y - sy);
      float board = band(sp.x, 0.0, 2.6, px) * band(sp.y, 0.0, 9.0, px);
      float glyph = step(0.5, hash12(floor(sp / vec2(0.65, 0.6)) + a)) *
                    band(sp.x, 0.5, 2.1, px) * band(sp.y, 0.6, 8.4, px) *
                    step(0.25, fract(sp.y / 1.8));
      over(acc, mix(glow * 0.92, uVoid, glyph), board * step(sy + 9.0, reachL + FLOOR));
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

    // Bridges. Some are level, some climb a floor as they cross, in steps.
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      if (floors < 1.0) break;
      if (k > 0 && hs(a, 30.0 + fk) < 0.45) continue;
      float yb = FLOOR * (1.0 + floor(hs(a, 20.0 + fk) * floors));
      float climb = 0.0;
      float sl = hs(a, 40.0 + fk);
      if (sl > 0.55 && yb + FLOOR <= reach) climb = sl > 0.78 ? 1.0 : -1.0;
      float y0 = climb < 0.0 ? yb + FLOOR : yb;
      // Deck height here: eight treads to a floor on the climbing ones.
      float deck = y0 + climb * floor(tn * 8.0 + 0.5) / 8.0 * FLOOR;

      float slab = band(Y, deck - 0.75, deck, px);
      float rail = band(Y, deck + 2.25, deck + 2.5, px);
      float posts = step(fract(dx / 2.4), 0.11) * band(Y, deck, deck + 2.4, px);
      float roofed = step(0.6, hs(a, 60.0 + fk)) * (1.0 - abs(climb));
      float roof = roofed * max(
        band(Y, deck + 4.6, deck + 5.1, px),
        step(fract(dx / 4.8), 0.07) * band(Y, deck, deck + 4.8, px));
      over(acc, wall * 0.78, max(slab, roof) * inAlley);
      over(acc, uMetal * 0.8, max(rail, posts) * inAlley * (1.0 - slab));

      // Someone on it, now and then.
      if (uLife > 0.5) {
        float seed = a * 3.7 + fk;
        float speed = 1.3 + 0.8 * hash12(vec2(seed, 1.0));
        float cycle = (aw2 + 3.0) / speed * (1.6 + 2.6 * hash12(vec2(seed, 2.0)));
        float gone = fract(uTime / cycle + hash12(vec2(seed, 3.0))) * cycle * speed - 1.5;
        float wt = gone / aw2;                       // 0..1 across, beyond that indoors
        if (hash12(vec2(seed, 4.0)) > 0.5) wt = 1.0 - wt;
        if (wt > -0.2 && wt < 1.2) {
          float wdeck = y0 + climb * floor(clamp(wt, 0.0, 1.0) * 8.0 + 0.5) / 8.0 * FLOOR;
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
