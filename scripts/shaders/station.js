import { NOISE_GLSL } from './noise.js';

// The station is real geometry, but almost all of it is one mesh drawn by one
// shader. Each face carries a paint number saying what to draw on it, and a
// set of coordinates to draw it in. That keeps the detail (windows, stripes,
// sleepers, paving) out of the geometry, where it would shimmer and fight for
// depth at a distance, and puts it where it can be antialiased against the
// pixel grid.

export const PAINT = {
  PLAIN: 0, // lit, in the face's own colour
  GLOW: 1, // unlit: lamps and lit signs
  SIDE: 2, // the side of a carriage. loc = (car index, height, metres from the car's front)
  FRONT: 3, // the cab end. loc = (metres off centre, height, 0)
  BED: 4, // ballast, sleepers and rails. loc = position
  PLATFORM: 5, // paving. loc = position
  LEAVES: 7, // a tree's foliage. loc = position; the normal is the clump's, not the face's
};

// Layout shared with the world that builds the geometry. Metres. The shader
// needs to know where things stand, not only what is painted on them, because
// it works out their shadows.
export const EDGE = 2.0; // platform edge
export const TRACKS = [3.7, 7.7]; // track centres
export const VERGE = 10.3; // where the ballast gives way to grass

export const PLAT_Y = 1.15;
export const PLAT_BACK = -11.5;
export const PLAT_END = -235;
export const Z_BEHIND = 40;
export const FENCE_H = 1.25;
export const HEDGE_L = { x: -13.2, seed: 11.3 };
export const HEDGE_R = { x: 13.4, seed: 47.1 };

// How tall the row of bushes is at each point along it. The world plants the
// bushes to this outline and the shader casts their shadow from it, so it is
// written twice, here and in GLSL below, and the two must stay the same.
export const hedgeTop = (a, seed) =>
  2.7 + 0.55 * Math.sin(a * 0.23 + seed) + 0.4 * Math.sin(a * 0.61 + seed * 2.3) + 0.25 * Math.sin(a * 1.37 + seed * 0.7);

// Overhead line: a portal frame every SPAN metres.
export const SPAN = 50;
export const FIRST_GANTRY = -34;
export const GANTRIES = 17;
export const MAST_L = -2.2;
export const MAST_R = 10.6;
export const MAST_TOP = 8.3;

export const LAMP = { x: -6.0, z0: -45, gap: 30, height: 4.3 };
export const SHELTER = { x0: -11.1, x1: -6.6, z0: -66.5, z1: -53.5, top: 2.8 };
export const TRAIN_BOX = { halfW: 1.45, top: 3.75 };

// The two rows of trees behind the platform.
export const TREES_L = [
  { x: -18.5, spread: 3.0, start: -48, gap: 8.5, hMin: 6.2, hMax: 8.6 },
  { x: -26.0, spread: 4.0, start: -70, gap: 11, hMin: 8.5, hMax: 12.5 },
];

// The sun: which way it lies along the ground, and how high it stands (the
// tangent of its angle: 0.1 is about six degrees). It is just off the left
// edge of the picture, where the sky is warmest. Lower means longer shadows
// and less of the platform in the light.
export const SUN = { x: -0.62, z: -0.78, tan: 0.1 };

const LAMP_LAST = Math.ceil((LAMP.z0 - (PLAT_END + 5)) / LAMP.gap) - 1;

const f = (n) => n.toFixed(4);

export const solidVertex = /* glsl */ `
attribute vec3 aCol;
attribute float aPaint;
attribute vec3 aLoc;

varying vec3 vCol;
varying float vPaint;
varying vec3 vLoc;
varying vec3 vN;
varying float vDist;

void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = length(mv.xyz);
  vCol = aCol;
  vPaint = aPaint;
  vLoc = aLoc;
  vN = normal; // nothing in the scene turns except all of it at once
  gl_Position = projectionMatrix * mv;
}
`;

export const solidFragment = /* glsl */ `
uniform vec3 uLight;   // toward the key light
uniform vec3 uKey;
uniform vec3 uAmb;
uniform vec3 uSkyUp;
uniform vec3 uHaze;
uniform float uFog;

uniform vec3 uRed;
uniform vec3 uBlue;
uniform vec3 uGlass;
uniform vec3 uWin;     // lit carriage windows
uniform vec3 uLamp;    // headlight lens

uniform vec3 uBallast;
uniform vec3 uSleeper;
uniform vec3 uRail;
uniform vec3 uVerge;

uniform vec3 uPlat;
uniform vec3 uYellow;
uniform vec3 uWarm;    // sunlit ground
uniform vec3 uGlare;   // the same, looking into the sun

uniform vec2 uSun;        // the way the sunlight travels along the ground
uniform float uSunTan;    // how steeply it comes down
uniform vec2 uTrain;      // where the train's nose and tail are
uniform float uSunAmt;    // 0 at night, when there is no sun to cast anything
uniform vec3 uSunMul;     // sunlit ground as a multiple of its own colour (day)
uniform float uSunFlat;   // sunlit ground as one warm colour laid over it (dusk)
uniform float uGroundKey; // whether the key light falls on the ground as well
uniform float uLampAmt;   // lamp light lying on the platform (night)
uniform vec3 uLampCol;
uniform float uHeadAmt;   // the train's headlights on the ground ahead of it (night)

uniform vec3 uLeafLight;  // toward the light, for foliage
uniform vec3 uLeafDeep;
uniform vec3 uLeafShade;
uniform vec3 uLeafMid;
uniform vec3 uLeafLit;

varying vec3 vCol;
varying float vPaint;
varying vec3 vLoc;
varying vec3 vN;
varying float vDist;

${NOISE_GLSL}

// Pixel footprint of the paint coordinates. Taken once, at the top of main,
// because derivatives are not defined inside a branch.
vec3 W;

// How much direct sun the ground under this pixel gets. Set by the paints
// that lie on the ground, and used after the scene's own light is applied:
// sunlight is its own colour, not the blue of the shade made brighter.
float gSun = 0.0;
float gLamp = 0.0;    // lamp light on the ground under this pixel
float gGround = 0.0;  // 1 if this pixel is ground at all
float gHead = 0.0;    // headlight on the ground under this pixel

// 1 inside (d < 0), 0 outside, one pixel of ramp between.
float cover(float d, float w){ return clamp(0.5 - d / max(w, 1e-5), 0.0, 1.0); }
float band(float x, float a, float b, float w){ return cover(a - x, w) * cover(x - b, w); }
float rbox(vec2 p, vec2 c, vec2 hs, float r, float w){
  vec2 q = abs(p - c) - hs + r;
  return cover(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r, w);
}
float disc(vec2 p, vec2 c, float r, float w){ return cover(length(p - c) - r, w); }

// --- the low sun ----------------------------------------------------------------
//
// The sun is almost on the horizon. For a point on the ground, look back
// along the light and ask what stands in the way. Everything that could is
// tested: the bushes (by the outline they are planted to), the fence, the
// tree crowns, the masts and lamp posts, the shelter, the platform's own edge
// and the train. So every patch of light is a gap between real things, every
// shadow points away from the sun, and a shadow is as long as the thing that
// casts it is tall.

float hedgeTop(float a, float seed){
  return 2.7 + 0.55 * sin(a * 0.23 + seed) + 0.40 * sin(a * 0.61 + seed * 2.3) + 0.25 * sin(a * 1.37 + seed * 0.7);
}

// A solid box: how far along the ray toward the sun the box is entered, and
// how far along it is left again (through a side, or out of the top).
float boxShadow(vec3 p, vec3 lo, vec3 hi){
  float x0 = (p.x - lo.x) / uSun.x;
  float x1 = (p.x - hi.x) / uSun.x;
  float z0 = (p.z - lo.z) / uSun.y;
  float z1 = (p.z - hi.z) / uSun.y;
  float a = max(max(min(x0, x1), min(z0, z1)), 0.0);
  float b = min(min(max(x0, x1), max(z0, z1)), (hi.y - p.y) / uSunTan);
  return smoothstep(0.0, 0.8, b - a);
}

// A row of thin uprights at x = px, the first at z0 and one every gap after
// it. Each throws a stripe, which fades out where the top of the post is.
float postShadow(vec3 p, float px, float z0, float gap, float last, float top, float hw){
  float s = (p.x - px) / uSun.x;
  if (s <= 0.0) return 0.0;
  float zm = p.z - uSun.y * s;
  float k = clamp(floor((z0 - zm) / gap + 0.5), 0.0, last);
  float perp = abs(zm - (z0 - k * gap)) * uSun.x;
  // Never sharper than a pixel, and fainter once it is thinner than one.
  float soft = max(0.02 + s * 0.005, max(W.x, W.z) * 0.8);
  float stripe = (1.0 - smoothstep(hw - soft, hw + soft, perp)) * min(1.0, 2.0 * hw / soft);
  return stripe * (1.0 - smoothstep(top - 0.2, top + 0.2, p.y + s * uSunTan));
}

// A row of trees, seen from where the sun is: a line of rough discs. They are
// not the very trees that are drawn, but a row of the same size and spacing.
float crownShadow(vec3 p, float rx, float start, float gap, float hMin, float hMax, float seed){
  float t = (p.x - rx) / uSun.x;
  if (t <= 0.0) return 0.0;
  float hr = p.y + t * uSunTan;
  float zh = p.z - uSun.y * t;
  float soft = 0.08 + t * 0.006;
  float wob = (vnoise(vec2(zh * 0.8 + seed, hr * 0.8)) - 0.5) * 1.1;
  float k0 = floor(zh / gap);
  float sh = 0.0;
  for (int j = -1; j <= 1; j++){
    float k = k0 + float(j);
    float zc = (k + 0.5 + (hash12(vec2(k, seed)) - 0.5) * 0.6) * gap;
    float h = mix(hMin, hMax, hash12(vec2(k, seed + 9.0))) * (0.72 + 0.28 * clamp((-zc - 40.0) / 160.0, 0.0, 1.0));
    float d = length(vec2(zh - zc, (hr - h * 0.66) * 1.1)) - h * 0.34 + wob;
    sh = max(sh, (1.0 - smoothstep(-soft, soft, d)) * step(zc, start));
  }
  return sh;
}

// 1 where the sun reaches the ground, 0 in shadow.
float sunlit(vec3 p){
  float sh = 0.0;

  float t = (p.x - ${f(HEDGE_L.x)}) / uSun.x;
  if (t > 0.0) {
    float soft = 0.06 + t * 0.006;
    sh = smoothstep(-soft, soft, hedgeTop(p.z - uSun.y * t, ${f(HEDGE_L.seed)}) - (p.y + t * uSunTan));
  }

  sh = max(sh, crownShadow(p, ${f(TREES_L[0].x)}, ${f(TREES_L[0].start)}, ${f(TREES_L[0].gap)}, ${f(TREES_L[0].hMin)}, ${f(TREES_L[0].hMax)}, 3.0));
  sh = max(sh, crownShadow(p, ${f(TREES_L[1].x)}, ${f(TREES_L[1].start)}, ${f(TREES_L[1].gap)}, ${f(TREES_L[1].hMin)}, ${f(TREES_L[1].hMax)}, 7.0));

  // The fence behind the platform, the platform itself, the shelter, the train.
  sh = max(sh, boxShadow(p, vec3(${f(PLAT_BACK - 0.2)}, 0.0, ${f(PLAT_END)}), vec3(${f(PLAT_BACK)}, ${f(PLAT_Y + FENCE_H)}, ${f(Z_BEHIND)})));
  sh = max(sh, boxShadow(p, vec3(${f(PLAT_BACK)}, 0.0, ${f(PLAT_END)}), vec3(${f(EDGE)}, ${f(PLAT_Y)}, ${f(Z_BEHIND)})));
  sh = max(sh, boxShadow(p, vec3(${f(SHELTER.x0)}, ${f(PLAT_Y)}, ${f(SHELTER.z0)}), vec3(${f(SHELTER.x1)}, ${f(PLAT_Y + SHELTER.top)}, ${f(SHELTER.z1)})));
  sh = max(sh, boxShadow(p, vec3(${f(TRACKS[0] - TRAIN_BOX.halfW)}, 0.0, uTrain.y), vec3(${f(TRACKS[0] + TRAIN_BOX.halfW)}, ${f(TRAIN_BOX.top)}, uTrain.x)));

  // Masts and lamp posts.
  sh = max(sh, postShadow(p, ${f(MAST_L)}, ${f(FIRST_GANTRY)}, ${f(SPAN)}, ${f(GANTRIES - 1)}, ${f(MAST_TOP)}, 0.13));
  sh = max(sh, postShadow(p, ${f(MAST_R)}, ${f(FIRST_GANTRY)}, ${f(SPAN)}, ${f(GANTRIES - 1)}, ${f(MAST_TOP)}, 0.13));
  sh = max(sh, postShadow(p, ${f(LAMP.x)}, ${f(LAMP.z0)}, ${f(LAMP.gap)}, ${f(LAMP_LAST)}, ${f(PLAT_Y + LAMP.height)}, 0.10));

  return 1.0 - sh;
}

// --- lamp light ------------------------------------------------------------------
//
// After dark the platform is lit in pools: one under each lamp, a spill from
// the open side of the shelter, and a band along the edge from the windows of
// a train standing or running alongside.
float lampLight(float x, float z){
  float k = clamp(floor((${f(LAMP.z0)} - z) / ${f(LAMP.gap)} + 0.5), 0.0, ${f(LAMP_LAST)});
  vec2 d = vec2(x - ${f(LAMP.x + 0.8)}, z - (${f(LAMP.z0)} - k * ${f(LAMP.gap)}));
  float pool = exp(-dot(d, d) / 30.0);

  float sx = smoothstep(${f(SHELTER.x0 + 3.2)}, ${f(SHELTER.x0 + 3.9)}, x) * (1.0 - smoothstep(${f(SHELTER.x0 + 4.0)}, ${f(SHELTER.x0 + 8.0)}, x));
  float sz = smoothstep(${f(SHELTER.z0 - 0.5)}, ${f(SHELTER.z0 + 1.5)}, z) * (1.0 - smoothstep(${f(SHELTER.z1 - 1.5)}, ${f(SHELTER.z1 + 0.5)}, z));
  pool = max(pool, sx * sz * 0.8);

  // The windows start a little behind the nose, and the band fades at each
  // end of the train where it used to stop dead.
  float alongside = smoothstep(uTrain.y, uTrain.y + 3.0, z) * (1.0 - smoothstep(uTrain.x - 3.0, uTrain.x - 0.5, z));
  pool = max(pool, alongside * smoothstep(${f(EDGE - 3.4)}, ${f(EDGE)}, x) * 0.5);
  return pool;
}

// The train's headlights. Ahead, a beam down its own track that widens as it
// goes and dies away over a hundred metres or so. Close to, the lamps light
// the ground all round the nose, the platform's edge included, so there is
// no dark gap between the beam and the light from the windows behind it.
float headlight(float x, float z){
  float dz = z - uTrain.x;
  float dx = (x - ${f(TRACKS[0])}) / (1.5 + max(dz, 0.0) * 0.16);
  float beam = smoothstep(-0.5, 4.0, dz) * exp(-dx * dx) / (1.0 + dz * dz / 900.0);
  vec2 n = vec2(x - ${f(TRACKS[0])}, dz - 1.0);
  return max(beam, exp(-dot(n, n) / 22.0) * 0.9);
}

// --- a carriage side ----------------------------------------------------------

vec3 paintSide(vec3 base, out float glow){
  float y = vLoc.y;
  float s = vLoc.z;
  float wy = W.y;
  float ws = W.z;
  float w = max(wy, ws);
  float lead = 1.0 - step(0.5, vLoc.x);

  vec3 c = base;
  c = mix(c, base * 0.55, cover(y - 1.16, wy));
  c = mix(c, uRed, band(y, 1.60, 1.70, wy));
  c = mix(c, uBlue, band(y, 1.76, 2.02, wy));
  c = mix(c, uRed, band(y, 2.08, 2.14, wy));

  glow = 0.0;

  // Three pairs of doors, each leaf with its own window.
  for (int i = 0; i < 3; i++){
    float dx = abs(s - (3.2 + 6.8 * float(i)));
    float line = max(cover(abs(dx - 0.70) - 0.02, ws), cover(dx - 0.012, ws));
    c = mix(c, base * 0.45, line * band(y, 1.16, 3.32, wy) * 0.8);
    float dw = rbox(vec2(dx, y), vec2(0.35, 2.72), vec2(0.21, 0.42), 0.06, w);
    c = mix(c, uWin, dw);
    glow = max(glow, dw);
  }

  // Between the doors, a run of three panes in one dark frame. Some are a
  // little dimmer: a blind half down, someone standing in the way.
  for (int i = 0; i < 2; i++){
    vec2 p = vec2(s - (6.6 + 6.8 * float(i)), y);
    c = mix(c, base * 0.35, rbox(p, vec2(0.0, 2.72), vec2(2.12, 0.50), 0.08, w));
    float k = floor(p.x / 1.36 + 0.5);
    float px = p.x - k * 1.36;
    float pane = rbox(vec2(px, y), vec2(0.0, 2.72), vec2(0.62, 0.42), 0.05, w) *
                 cover(abs(p.x) - 2.04, ws);
    float dim = 0.78 + 0.22 * hash12(vec2(k + float(i) * 7.0 + vLoc.x * 13.0, 3.0));
    c = mix(c, uWin * dim, pane);
    glow = max(glow, pane);
  }

  // One small window at each end; on the leading car the first is the cab's.
  float e0 = rbox(vec2(s, y), vec2(1.05, 2.72), vec2(0.42, 0.42), 0.05, w);
  float e1 = rbox(vec2(s, y), vec2(18.95, 2.72), vec2(0.42, 0.42), 0.05, w);
  c = mix(c, mix(uWin, uGlass, lead), e0);
  c = mix(c, uWin, e1);
  glow = max(glow, max(e0 * (1.0 - lead), e1));

  return c;
}

// --- the cab end --------------------------------------------------------------

vec3 paintFront(vec3 base, out float glow){
  float u = vLoc.x;
  float y = vLoc.y;
  float w = max(W.x, W.y);

  vec3 c = base;

  // The livery comes round from the sides and dips to a point under the
  // windscreen.
  float yy = y - 0.30 * abs(u);
  c = mix(c, uRed, band(yy, 1.50, 1.98, w));
  c = mix(c, uBlue, band(yy, 1.22, 1.38, w));
  c = mix(c, uRed, cover(y - 1.18, W.y));

  // Windscreen: three panes in a dark surround, the sky lying across them.
  c = mix(c, vec3(0.05, 0.06, 0.16), rbox(vec2(u, y), vec2(0.0, 2.74), vec2(1.24, 0.56), 0.14, w));
  float pane = max(
    rbox(vec2(u, y), vec2(0.0, 2.74), vec2(0.38, 0.48), 0.06, w),
    rbox(vec2(abs(u), y), vec2(0.81, 2.74), vec2(0.35, 0.48), 0.08, w)
  );
  vec3 glass = mix(uGlass, uGlass * 2.4 + vec3(0.10, 0.05, 0.14),
                   smoothstep(-0.7, 0.8, (y - 2.74) * 1.3 + u * 0.45));
  glass += vec3(0.20, 0.18, 0.30) * (1.0 - smoothstep(0.0, 0.07, abs(fract((u + y * 0.6) * 0.8) - 0.5) - 0.06)) * 0.35;
  c = mix(c, glass, pane);

  glow = 0.0;

  // Destination blind.
  float board = rbox(vec2(u, y), vec2(0.0, 3.50), vec2(0.52, 0.10), 0.03, w);
  c = mix(c, uWin, board);
  glow = max(glow, board);

  // Headlights low at the corners, marker lights high.
  vec2 hp = vec2(abs(u), y);
  c = mix(c, vec3(0.12, 0.10, 0.20), disc(hp, vec2(0.98, 1.50), 0.21, w));
  float lamp = disc(hp, vec2(0.98, 1.50), 0.16, w);
  c = mix(c, uLamp, lamp);
  glow = max(glow, lamp);
  float mk = disc(hp, vec2(1.12, 3.46), 0.07, w);
  c = mix(c, vec3(1.0, 0.36, 0.32), mk);
  glow = max(glow, mk);

  return c;
}

// --- the track bed ------------------------------------------------------------

vec3 paintBed(){
  float x = vLoc.x;
  float z = vLoc.z;
  float wx = W.x;
  float wz = W.z;

  vec3 c = uBallast;
  float sp = hash12(floor(vec2(x, z) * 7.0));
  c *= 1.0 + (sp - 0.5) * 0.30 / (1.0 + max(wx, wz) * 25.0);

  for (int i = 0; i < 2; i++){
    float dx = abs(x - (i == 0 ? ${f(TRACKS[0])} : ${f(TRACKS[1])}));

    // Sleepers, which melt into an even tone once they are closer together
    // than the pixels are.
    float ph = abs(fract(z / 0.65) - 0.5) * 0.65;
    float sl = cover(ph - 0.13, wz);
    sl = mix(sl, 0.40, smoothstep(0.15, 0.60, wz));
    c = mix(c, uSleeper, sl * cover(dx - 1.25, wx));

    // Rails: never thinner than a pixel, but fainter when they would be.
    float hw = max(0.045, wx * 0.8);
    float rail = cover(abs(dx - 0.72) - hw, wx) * min(1.0, 0.045 / hw * 1.6);
    c = mix(c, uRail, rail);
  }

  c = mix(c, uVerge, smoothstep(${f(VERGE - 0.4)}, ${f(VERGE + 0.4)}, x));
  c = mix(c, uVerge, 1.0 - smoothstep(-0.8, 0.0, x)); // and behind the platform

  gSun = sunlit(vec3(x, 0.0, z));
  gHead = headlight(x, z);
  gGround = 1.0;
  return c;
}

// --- the platform -------------------------------------------------------------

vec3 paintPlatform(){
  float x = vLoc.x;
  float z = vLoc.z;
  float wx = W.x;
  float wz = W.z;

  vec3 c = uPlat;

  // Paving slabs, each a touch different, with joints that fade out with
  // distance rather than turning to noise.
  vec2 g = vec2(x / 1.2, z / 2.4);
  c *= 0.94 + 0.12 * hash12(floor(g));
  vec2 fr = 0.5 - abs(fract(g) - 0.5);
  float joint = max(cover(fr.x * 1.2 - 0.02, wx), cover(fr.y * 2.4 - 0.02, wz));
  c *= 1.0 - 0.30 * joint / (1.0 + max(wx, wz) * 14.0);

  // The last of the sun, coming in over the hedge and between the trees.
  gSun = sunlit(vec3(x, ${f(PLAT_Y)}, z));
  gLamp = lampLight(x, z);
  gHead = headlight(x, z) * 0.7; // what spills up onto the platform's edge
  gGround = 1.0;

  c = mix(c, uYellow, band(x, ${f(EDGE - 0.95)}, ${f(EDGE - 0.60)}, wx));
  c = mix(c, vec3(0.86, 0.88, 1.0), band(x, ${f(EDGE - 0.28)}, ${f(EDGE - 0.10)}, wx) * 0.85);
  return c;
}

// --- trees and bushes ----------------------------------------------------------

// Foliage is drawn as a painter draws it: a few flat tones, dark underneath
// and light on top, with the edge between each pair broken up into leaves.
// The geometry supplies rounded clumps; this supplies everything else.
vec3 paintLeaves(vec3 n){
  vec3 p = vLoc;
  float leaf = vnoise(p.xy * 1.7 + p.z * 0.9) * 0.55 + vnoise(p.zy * 4.1 + p.x * 1.3) * 0.45;
  float k = dot(n, uLeafLight) * 0.5 + 0.5 + (leaf - 0.5) * 0.46;
  vec3 c = mix(uLeafDeep, uLeafShade, smoothstep(0.31, 0.35, k));
  c = mix(c, uLeafMid, smoothstep(0.51, 0.55, k));
  c = mix(c, uLeafLit, smoothstep(0.73, 0.77, k));
  return c * vCol;
}

void main(){
  W = fwidth(vLoc);

  vec3 c = vCol;
  float glow = 0.0;   // lit from inside: ignores the scene's light, resists the haze
  float unlit = 0.0;

  if (vPaint < 0.5) {
    // plain
  } else if (vPaint < 1.5) {
    glow = 1.0;
  } else if (vPaint < 2.5) {
    c = paintSide(vCol, glow);
  } else if (vPaint < 3.5) {
    c = paintFront(vCol, glow);
  } else if (vPaint < 4.5) {
    c = paintBed();
  } else if (vPaint < 5.5) {
    c = paintPlatform();
  } else {
    c = paintLeaves(normalize(vN));
    unlit = 1.0;
  }

  // Two flat tones and a little sky on anything that faces up.
  vec3 n = normalize(vN);
  // By day the key light is the sun, and where the sun reaches the ground
  // is worked out properly below, so the ground does not take it here too.
  float key = smoothstep(0.0, 0.30, dot(n, uLight)) * (1.0 - gGround * (1.0 - uGroundKey));
  vec3 light = uAmb + uSkyUp * max(n.y, 0.0) + uKey * key;
  vec3 col = mix(c * light, c, max(glow, unlit));

  // Where the sun reaches the ground it takes over from the shade. What is
  // painted there still shows, as lighter and darker orange.
  // Looking toward the sun the ground glares; looking away it is deeper.
  // (The camera stands at the origin of the station's own space.)
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float glare = pow(max(dot(normalize(vLoc.xz), -uSun), 0.0), 9.0);
  vec3 sunCol = c * uSunMul + mix(uWarm, uGlare, glare * 0.7) * min(0.40 + 2.0 * lum, 1.25) * uSunFlat;
  col = mix(col, sunCol, gSun * uSunAmt);

  // Lamp light adds to whatever is there.
  col += uLampCol * (0.35 + 1.5 * lum) * gLamp * uLampAmt;
  col += vec3(1.0, 0.84, 0.64) * (0.30 + 1.5 * lum) * gHead * uHeadAmt;

  float fog = 1.0 - exp(-vDist * uFog);
  col = mix(col, uHaze, fog * (1.0 - 0.55 * glow));

  gl_FragColor = vec4(col, 1.0);
}
`;

// --- overhead wires -------------------------------------------------------------

export const wireVertex = /* glsl */ `
varying float vDist;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

export const wireFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHaze;
uniform float uFog;
varying float vDist;
void main(){
  gl_FragColor = vec4(mix(uColor, uHaze, 1.0 - exp(-vDist * uFog)), 1.0);
}
`;

// --- lamp glows -------------------------------------------------------------------

// Soft additive discs for the headlights and the platform lamps. They keep a
// minimum size, so the train is a pair of lights long before it is a train.
export const glowVertex = /* glsl */ `
attribute float aSize;
attribute vec3 aCol;
uniform float uScale;   // pixels per metre at one metre
uniform float uMin;     // smallest disc, in pixels
uniform float uFog;
uniform float uFar;     // lights fade out before this distance
uniform float uGain;    // brighter after dark, fainter by day
varying vec3 vCol;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.5), uMin, 220.0);
  float through = exp(-dist * uFog * 0.45) * (1.0 - smoothstep(uFar * 0.8, uFar, dist));
  vCol = aCol * through * uGain;
}
`;

export const glowFragment = /* glsl */ `
varying vec3 vCol;
void main(){
  float r = length(gl_PointCoord - 0.5) * 2.0;
  // A wide soft halo that reaches zero at the sprite's edge, and a hot core.
  float a = (exp(-r * r * 4.5) - 0.0111) * 0.95 + (1.0 - smoothstep(0.0, 0.16, r)) * 0.8;
  a *= step(r, 1.0);
  gl_FragColor = vec4(vCol * a, 1.0);
}
`;
