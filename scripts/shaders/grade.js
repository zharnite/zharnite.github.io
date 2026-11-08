import { NOISE_GLSL, QUAD_VERT } from './noise.js';

export const vertexShader = QUAD_VERT;

// The piece that actually sells the era: desaturate, sepia-tint, lift the
// blacks, vignette, fine grain, and a whisper of gate flicker.
export const fragmentShader = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2  uResolution;
uniform float uTime;
uniform float uSepia;
uniform float uGrain;
uniform float uVignette;
uniform float uFlicker;
uniform float uLift;

varying vec2 vUv;

${NOISE_GLSL}

void main(){
  vec3 src = texture2D(tDiffuse, vUv).rgb;

  // Desaturate, then push the luminance through a warm sepia ramp.
  float l = dot(src, vec3(0.299, 0.587, 0.114));
  vec3 warm = vec3(l) * vec3(1.10, 0.96, 0.78);
  vec3 col = mix(vec3(l), warm, uSepia);

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

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
