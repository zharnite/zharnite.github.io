import { NOISE_GLSL, QUAD_VERT } from './noise.js';

export const vertexShader = QUAD_VERT;

// The card itself: a saturated radial glow, brightest behind the title and
// falling away to a dark rim, over a faint flocked-paper tooth. Drawn as a
// fullscreen quad because a title card is a flat graphic, not a place.
export const fragmentShader = /* glsl */ `
uniform vec3  uCenter;
uniform vec3  uMid;
uniform vec3  uEdge;
uniform vec2  uFocus;
uniform float uAspect;
uniform float uTexture;
uniform float uTime;

varying vec2 vUv;

${NOISE_GLSL}

void main(){
  vec2 p = vUv - uFocus;
  p.x *= uAspect;
  float r = length(p) * 1.5;

  vec3 c = mix(uCenter, uMid, smoothstep(0.00, 0.42, r));
  c = mix(c, uEdge, smoothstep(0.38, 1.05, r));

  // Flocked card stock: high frequency, almost no contrast. You should not
  // see it, only miss it if it were gone.
  float tooth = fbm(vUv * vec2(uAspect, 1.0) * 210.0);
  c *= 1.0 + (tooth - 0.5) * uTexture;

  // A very slow breath in the glow, so the card is not perfectly static.
  c *= 1.0 + sin(uTime * 0.22) * 0.012;

  gl_FragColor = vec4(c, 1.0);
}
`;
