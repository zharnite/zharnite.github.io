import { SKY_RAMP_GLSL } from './noise.js';

// Summed directional waves with analytic normals. No normal map, no texture:
// the softness is the art direction, and it keeps the cost in the vertex stage.
//
// Wavelengths are deliberately long relative to the mesh spacing. A plane this
// size cannot sample a short wave, and an undersampled wave does not look
// choppy, it looks like noise and shimmers as the camera moves.
export const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uAtten;

varying vec3  vWorld;
varying vec3  vNrm;
varying float vDist;

void addWave(vec2 p, vec2 dir, float len, float amp, float spd, float t,
             inout float h, inout float dhx, inout float dhz){
  float k  = 6.28318530718 / len;
  float ph = dot(dir, p) * k + t * spd;
  h += amp * sin(ph);
  float c = amp * k * cos(ph);
  dhx += c * dir.x;
  dhz += c * dir.y;
}

void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 p  = wp.xz;

  float dist = length(p - cameraPosition.xz);

  // Amplitude eases off with distance so the far field cannot alias, but
  // gently: kill it entirely and the horizon becomes a mirror, which turns
  // the sun's reflection into a disc instead of a streak.
  float atten = exp(-dist / uAtten);
  float a = uAmp * atten;

  float h = 0.0, dhx = 0.0, dhz = 0.0;
  addWave(p, normalize(vec2( 1.00,  0.25)), 165.0, a * 1.00, 0.30, uTime, h, dhx, dhz);
  addWave(p, normalize(vec2( 0.70, -0.60)),  92.0, a * 0.55, 0.44, uTime, h, dhx, dhz);
  addWave(p, normalize(vec2(-0.40,  1.00)),  51.0, a * 0.30, 0.63, uTime, h, dhx, dhz);
  addWave(p, normalize(vec2( 0.20,  1.00)),  29.0, a * 0.16, 0.92, uTime, h, dhx, dhz);

  wp.y += h;

  vWorld = wp.xyz;
  vNrm   = normalize(vec3(-dhx, 1.0, -dhz));
  vDist  = dist;

  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const fragmentShader = /* glsl */ `
uniform vec3  uDeep;
uniform vec3  uZenith;
uniform vec3  uUpper;
uniform vec3  uMid;
uniform vec3  uLower;
uniform vec3  uHorizonCol;
uniform vec3  uStreak;
uniform vec3  uSunDir;
uniform float uShininess;
uniform float uSpecGain;
uniform float uFogDist;

varying vec3  vWorld;
varying vec3  vNrm;
varying float vDist;

${SKY_RAMP_GLSL}

void main(){
  vec3 N = normalize(vNrm);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 S = normalize(uSunDir);
  vec3 R = reflect(-V, N);

  // Reflect the actual sky above the reflected ray, not one flat colour.
  // Close to the camera R points steeply up and picks up the dark zenith;
  // near the horizon it grazes and picks up the warm band. That vertical
  // gradient is what makes a flat plane read as water.
  // A real reflection is dimmer than the sky it mirrors; without that factor
  // the water ends up brighter than the thing lighting it.
  vec3 skyRefl = skyRamp(R.y, uZenith, uUpper, uMid, uLower, uHorizonCol) * 0.82;

  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
  vec3 col = mix(uDeep, skyRefl, clamp(fres, 0.0, 1.0));

  // The hero element: a long specular streak, broken up by the wave normals
  // so it glitters instead of reading as a solid bar.
  float spec = pow(max(dot(R, S), 0.0), uShininess);
  col += uStreak * spec * uSpecGain;

  // Dissolve into the sky. No seam, no visible plane edge.
  float f = 1.0 - exp(-vDist / uFogDist);
  col = mix(col, uHorizonCol, clamp(f, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
}
`;
