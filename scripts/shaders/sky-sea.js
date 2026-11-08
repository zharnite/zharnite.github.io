import { NOISE_GLSL, SKY_RAMP_GLSL, SKY_VERT } from './noise.js';

export const vertexShader = SKY_VERT;

// Dusk sky: hard sun disc plus a wide halo, warm horizon band, lit clouds.
export const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3  uSunDir;
uniform vec3  uZenith;
uniform vec3  uUpper;
uniform vec3  uMid;
uniform vec3  uLower;
uniform vec3  uHorizon;
uniform vec3  uSunCore;
uniform vec3  uSunHalo;
uniform float uCloud;

varying vec3 vDir;

${NOISE_GLSL}
${SKY_RAMP_GLSL}

void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 sun = normalize(uSunDir);

  // Vertical ramp through the dusk palette.
  vec3 sky = skyRamp(h, uZenith, uUpper, uMid, uLower, uHorizon);

  float sd = max(dot(d, sun), 0.0);

  // Warm horizon glow, widest around the sun's azimuth.
  vec3 sunFlat = normalize(vec3(sun.x, 0.0, sun.z));
  float azim = max(dot(normalize(vec3(d.x, 0.0, d.z)), sunFlat), 0.0);
  float band = exp(-abs(h) * 11.0) * (0.30 + 0.70 * pow(azim, 2.2));
  sky += uHorizon * band * 0.55;

  // Wide halo, then the disc on top of it.
  sky += uSunHalo * (pow(sd, 180.0) * 0.55 + pow(sd, 12.0) * 0.16);
  float disc = smoothstep(0.99985, 0.99995, sd);
  sky = mix(sky, uSunCore, disc);

  // Cloud bands, tinted by proximity to the sun so they catch the light.
  vec2 cp = vec2(atan(d.z, d.x) * 2.1, h * 4.2);
  float c = fbm(cp * 1.25 + vec2(uTime * 0.008, uTime * 0.002));
  c = smoothstep(0.50, 0.95, c);
  float mask = smoothstep(0.00, 0.26, h) * (1.0 - smoothstep(0.50, 1.0, h));
  vec3 lit = mix(uMid, uSunHalo, 0.35 + 0.55 * pow(azim, 2.0));
  sky = mix(sky, lit, c * mask * uCloud);

  gl_FragColor = vec4(sky, 1.0);
}
`;
