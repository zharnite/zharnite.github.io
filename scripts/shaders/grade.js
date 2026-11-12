import { NOISE_GLSL, QUAD_VERT } from './noise.js';

export const vertexShader = QUAD_VERT;

// The piece that actually sells the era: desaturate, sepia-tint, lift the
// blacks, vignette, fine grain, and a whisper of gate flicker. Plus the two
// things the title cards taught: gate weave, because film never sat still in
// the projector, and the dust and hairs a print picks up.
export const fragmentShader = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2  uResolution;
uniform float uTime;
uniform float uSepia;
uniform float uKeep;    // how much of the scene's own colour survives the toning
uniform float uGrain;
uniform float uVignette;
uniform float uFlicker;
uniform float uLift;
uniform float uWeave;   // gate drift, in pixels
uniform float uDust;
uniform float uVibrance; // 0 leaves the picture alone; above that, richer colour and more contrast

varying vec2 vUv;

${NOISE_GLSL}

void main(){
  vec2 px = 1.0 / uResolution;

  // Gate weave: a slow random walk, never periodic.
  vec2 drift = vec2(
    vnoise(vec2(uTime * 0.70, 0.0)) - 0.5,
    vnoise(vec2(0.0, uTime * 0.55 + 11.0)) - 0.5
  );
  vec3 src = texture2D(tDiffuse, clamp(vUv + drift * 2.0 * uWeave * px, 0.0, 1.0)).rgb;

  // Desaturate, then push the luminance through a warm sepia ramp.
  float l = dot(src, vec3(0.299, 0.587, 0.114));
  vec3 warm = vec3(l) * vec3(1.10, 0.96, 0.78);
  vec3 col = mix(mix(vec3(l), warm, uSepia), src, uKeep);

  // For a scene that should be more vivid than it was drawn, not less.
  col = clamp(mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.0 + uVibrance), 0.0, 1.0);
  col = mix(col, col * col * (3.0 - 2.0 * col), uVibrance * 0.8);

  // Period film never reached true black, and never quite reached white.
  col = col * (1.0 - uLift) + uLift * 0.62;

  // Soft radial vignette.
  vec2 q = vUv - 0.5;
  float vig = 1.0 - uVignette * dot(q, q) * 2.1;
  col *= clamp(vig, 0.0, 1.0);

  // Gate flicker: steps at ~18 Hz rather than varying continuously.
  float fl = 1.0 + (hash12(vec2(floor(uTime * 18.0), 7.0)) - 0.5) * uFlicker;
  col *= fl;

  // Fine grain, keyed to device pixels so it stays the same size everywhere.
  float g = hash12(vUv * uResolution + vec2(uTime * 41.0, uTime * 19.0)) - 0.5;
  col += g * uGrain;

  // Wear: dark specks every frame, and now and then a hair down the print.
  // Dark, not bright, because this is a positive print on a pale sky.
  float frame = floor(uTime * 16.0);
  float speck = hash12(floor(vUv * uResolution * 0.5) + frame * 37.0);
  col -= step(0.99994, speck) * uDust * 0.5;
  float hairX = hash12(vec2(frame, 3.0));
  float hairOn = step(0.95, hash12(vec2(frame, 9.0)));
  float hair = (1.0 - smoothstep(0.0, 1.4 * px.x, abs(vUv.x - hairX))) * hairOn;
  col -= hair * uDust * 0.22;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
