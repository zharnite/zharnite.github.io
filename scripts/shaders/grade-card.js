import { NOISE_GLSL, QUAD_VERT } from './noise.js';

export const vertexShader = QUAD_VERT;

// A film print, rather than a photograph of one. The two effects that do the
// most work here are the ones people never name: gate weave, because the film
// never sat perfectly still in the projector, and colour fringing, because
// Technicolor printed three separate records that never lined up exactly.
// Grain and vignette are the obvious ones and the least convincing alone.
export const fragmentShader = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2  uResolution;
uniform float uTime;

uniform float uMono;      // 0 Technicolor, 1 black and white
uniform float uWeave;     // gate drift, in pixels
uniform float uFringe;    // registration error at the frame edge, in pixels
uniform float uHalation;  // bloom bleeding out of bright areas
uniform float uGrain;
uniform float uVignette;
uniform float uFlicker;
uniform float uLift;
uniform float uDust;

varying vec2 vUv;

${NOISE_GLSL}

vec3 samp(vec2 uv){
  return texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
}

void main(){
  vec2 px = 1.0 / uResolution;

  // --- gate weave -------------------------------------------------------
  // A slow random walk, not a sine: the drift should never feel periodic.
  vec2 drift = vec2(
    vnoise(vec2(uTime * 0.70, 0.0)) - 0.5,
    vnoise(vec2(0.0, uTime * 0.55 + 11.0)) - 0.5
  );
  vec2 uv = vUv + drift * 2.0 * uWeave * px;

  // --- colour fringing --------------------------------------------------
  // Worst at the edges, nothing in the middle, like a real registration error.
  vec2 dir = uv - 0.5;
  vec2 off = dir * length(dir) * 4.0 * uFringe * px;

  vec3 col;
  col.r = samp(uv + off).r;
  col.g = samp(uv).g;
  col.b = samp(uv - off).b;

  // --- halation ---------------------------------------------------------
  if (uHalation > 0.0) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.0471976;
      acc += samp(uv + vec2(cos(a), sin(a)) * 7.0 * px);
    }
    acc /= 6.0;
    col += max(acc - 0.40, 0.0) * uHalation * vec3(1.15, 0.92, 0.70);
  }

  // --- stock ------------------------------------------------------------
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(l), uMono);

  // Neither true black nor true white ever reached the screen.
  col = col * (1.0 - uLift) + uLift * 0.62;

  vec2 q = vUv - 0.5;
  col *= clamp(1.0 - uVignette * dot(q, q) * 2.1, 0.0, 1.0);

  col *= 1.0 + (hash12(vec2(floor(uTime * 18.0), 7.0)) - 0.5) * uFlicker;

  col += (hash12(vUv * uResolution + vec2(uTime * 41.0, uTime * 19.0)) - 0.5) * uGrain;

  // --- wear -------------------------------------------------------------
  // Specks every frame, and now and then a vertical hair down the print.
  float frame = floor(uTime * 16.0);
  float speck = hash12(floor(vUv * uResolution * 0.5) + frame * 37.0);
  col += step(0.99993, speck) * uDust * 2.4;

  float hairX = hash12(vec2(frame, 3.0));
  float hairOn = step(0.94, hash12(vec2(frame, 9.0)));
  float hair = (1.0 - smoothstep(0.0, 1.4 * px.x, abs(vUv.x - hairX))) * hairOn;
  col += hair * uDust * 1.6;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
