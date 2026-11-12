import { NOISE_GLSL } from './noise.js';

// The dome is centred on the camera and turns with the station, so the
// direction is taken in the dome's own space: the clouds stay put over the
// tracks however the scene is turned to fit the page.
export const vertexShader = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// A painted evening sky: ultramarine overhead, magenta and orange toward the
// horizon, and heaped cumulus. The cloud is a density field, and it is lit
// from one side: each point looks toward the light to see whether it is on
// the near face of its heap or behind it, and how much cloud is in the way.
// That is what gives a heap a bright side, a shadowed side and a body
// between, rather than one flat tone. The result is then cut into a few flat
// colours with hard edges between them, the way a background painter blocks
// a cloud in: every edge, the cloud's outline included, is one pixel wide.
//
// The whole layer drifts on the wind (uDrift), and the lobes slide a little
// against the heaps they sit on (uBoil), so a cloud changes shape slowly as
// it crosses rather than sliding past like a cut-out.
export const fragmentShader = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uLow;
uniform vec3 uWarm;
uniform vec3 uHaze;        // must match the fog on the ground, so the two meet
uniform vec3 uCloudHot;    // the edge that faces the light
uniform vec3 uCloudLit;
uniform vec3 uCloudMid;
uniform vec3 uCloudShade;
uniform vec3 uCloudDeep;   // the far side of a thick heap
uniform vec3 uGlowDir;     // where on the horizon the last light is
uniform float uSeed;
uniform vec2 uDrift;       // how far the wind has carried the layer
uniform vec2 uBoil;        // how far the lobes have slid on the heaps
uniform float uStars;      // 1 at night
uniform float uMoon;       // 1 at night
uniform vec3 uMoonDir;
uniform vec3 uMoonCol;

varying vec3 vDir;

${NOISE_GLSL}

// Rounded bumps with creases between them: what makes a heap look heaped.
float billow(vec2 p){ return abs(vnoise(p) * 2.0 - 1.0); }

// Where the cloud is.
float shape(vec2 p){
  return vnoise(p) * 0.56 + vnoise(p * 2.03 + 17.0) * 0.28 + vnoise(p * 4.07 + 31.0) * 0.16;
}

// The lobes on it.
float puffs(vec2 p){
  return billow(p * 2.9 + 5.0) * 0.60 + billow(p * 6.1 + 11.0) * 0.30 + billow(p * 12.9 + 3.0) * 0.10;
}

// A cheaper copy of the density, for looking toward the light.
float densLo(vec2 p, float cover){
  return shape(p) + (billow((p + uBoil) * 2.9 + 5.0) - 0.42) * 0.14 - cover;
}

void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  float hp = max(h, 0.0);
  float az = atan(d.x, -d.z); // 0 down the line, positive to the right

  vec3 sky = mix(uLow, uMid, smoothstep(0.03, 0.26, h));
  sky = mix(sky, uTop, smoothstep(0.22, 0.70, h));

  float da = az - atan(uGlowDir.x, -uGlowDir.z);
  float near = exp(-(da * da) / 1.3);
  sky = mix(sky, uWarm, near * exp(-hp / 0.10) * 0.9);

  // Night: stars, on a grid over the dome so they stay put, and a moon. Both
  // go in before the cloud, so the cloud passes in front of them.
  if (uStars > 0.0) {
    vec2 sp = vec2(az, h) * 80.0;
    vec2 id = floor(sp);
    vec2 at = fract(sp) - 0.5 - (vec2(hash12(id + 7.3), hash12(id + 19.1)) - 0.5) * 0.7;
    float size = 0.05 + 0.09 * hash12(id + 3.7);
    float star = step(0.84, hash12(id)) * (1.0 - smoothstep(size * 0.5, size, length(at)));
    sky += vec3(0.82, 0.88, 1.0) * star * uStars * (0.45 + 0.55 * hash12(id + 1.1)) * smoothstep(0.04, 0.22, h);
  }
  if (uMoon > 0.0) {
    float ang = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
    float edge = fwidth(ang) + 1e-5;
    sky += uMoonCol * exp(-ang * ang / 0.010) * 0.22 * uMoon;
    sky = mix(sky, uMoonCol, (1.0 - smoothstep(0.021 - edge, 0.021 + edge, ang)) * uMoon);
  }

  // Cloud on a layer overhead, which is what makes it bunch up toward the
  // horizon. The layer is bent by a slower copy of itself so no two heaps
  // are alike.
  vec2 cp = d.xz / (hp + 0.30) * 1.45 + vec2(uSeed, uSeed * 0.37) - uDrift;
  vec2 q = cp + (vec2(vnoise(cp * 0.6 + 3.1), vnoise(cp * 0.6 + 7.7)) - 0.5) * 0.9;

  // Thin it where the page's lettering sits, left of the line and a little
  // above the horizon, so light ink has dark sky behind it.
  float clear = smoothstep(-0.85, -0.45, az) * (1.0 - smoothstep(0.02, 0.28, az)) *
                smoothstep(0.02, 0.07, h) * (1.0 - smoothstep(0.20, 0.32, h));
  float cover = 0.535 + 0.09 * clear;

  // How much of the cloud layer one pixel covers. Every edge below is made
  // this wide: sharp, but not jagged, and it stays that way as the layer
  // drifts. (Measured here because it cannot be measured inside a branch.)
  float px = length(fwidth(cp)) + 1e-5;
  float aaD = px * 1.2;   // for an edge in the density
  float aaT = px * 9.0;   // for an edge in the tone, which changes faster

  float pf = puffs(q + uBoil);
  float den = shape(q) + (pf - 0.30) * 0.26 - cover;
  float cov = smoothstep(-aaD, aaD, den);

  if (den > -aaD) {
    vec2 L = normalize(vec2(uGlowDir.x, uGlowDir.z));

    // The big form: is this the side of the heap that faces the light, or
    // the side that faces away? Density falling toward the light means the
    // near side; density rising means there is cloud in front.
    float lo0 = densLo(q, cover);
    float lo1 = densLo(q + L * 0.12, cover);
    float lo2 = densLo(q + L * 0.30, cover);
    float side = clamp((lo0 - lo1) * 5.2, -0.36, 0.40);

    // How deep it is buried behind the rest of the heap.
    float buried = 1.0 - exp(-(max(lo1, 0.0) + max(lo2, 0.0)) * 4.0);

    // Each lobe has its own lit side.
    float lobe = clamp((pf - puffs(q + uBoil + L * 0.05)) * 1.7, -0.20, 0.20);

    // The body of a cloud sits in the middle tone; only what faces the sun
    // climbs out of it, and only what is behind the heap sinks below.
    float tone = 0.50 + side + lobe - buried * 0.24;
    // Cloud toward the glow catches more of it.
    tone += near * (1.0 - smoothstep(0.10, 0.60, h)) * 0.10;
    // High cloud has lost most of the light.
    tone -= smoothstep(0.40, 0.95, h) * 0.12;

    vec3 cc = mix(uCloudDeep, uCloudShade, smoothstep(0.21 - aaT, 0.21 + aaT, tone));
    cc = mix(cc, uCloudMid, smoothstep(0.42 - aaT, 0.42 + aaT, tone));
    cc = mix(cc, uCloudLit, smoothstep(0.66 - aaT, 0.66 + aaT, tone));

    // The brightest colour is kept for one place: a rim along the edge of
    // the cloud that faces the sun.
    float rim = (1.0 - smoothstep(0.030 - aaD, 0.030 + aaD, den)) * smoothstep(0.10 - aaT, 0.10 + aaT, side);
    cc = mix(cc, uCloudHot, rim);

    sky = mix(sky, cc, cov);
  }

  // Everything dissolves into the same haze the ground fades to.
  sky = mix(sky, uHaze, exp(-hp / 0.030));

  gl_FragColor = vec4(sky, 1.0);
}
`;
