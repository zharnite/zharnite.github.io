// The trail from the skyship's exhaust pipe: one draw call of soft round
// points. It is stateless -- every puff's age, position and size come from
// uTime and a per-point seed -- so there is nothing to simulate, nothing to
// reset when the tab comes back, and a frozen clock gives a sensible still.
//
// Positions are in the ship's own space. The ship moves forward through
// still air, so from on board the smoke streams straight back at the ship's
// speed; that is uDrift.

export const vertexShader = /* glsl */ `
attribute float aSeed;

uniform float uTime;
uniform float uLife;    // seconds a puff lasts
uniform float uDrift;   // how fast it falls behind, units per second
uniform float uRise;    // how far it climbs over its life
uniform float uSize;    // diameter at birth, in world units
uniform float uHalfH;   // half the render height, in device pixels

varying float vAlpha;

void main(){
  float clock = uTime / uLife + aSeed;
  float age = fract(clock);
  // A different throw of the dice each time the point is reborn.
  float j = fract(sin((floor(clock) + aSeed * 31.0) * 91.7) * 43758.5453);

  float s = age * uLife;
  vec3 p = position;
  p.x -= uDrift * s;
  p.y += uRise * pow(age, 0.7) * (0.6 + 0.8 * j) + sin(s * 1.3 + j * 6.2832) * 0.6 * age;
  p.z += (j - 0.5) * 3.0 * age;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float size = uSize * (0.7 + 3.2 * age) * (0.75 + 0.5 * j);
  gl_PointSize = size * projectionMatrix[1][1] * uHalfH / -mv.z;

  vAlpha = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.30, 1.0, age));
}
`;

export const fragmentShader = /* glsl */ `
uniform vec3  uColor;
uniform float uOpacity;

varying float vAlpha;

void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.30, 1.0, d)) * vAlpha * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}
`;
