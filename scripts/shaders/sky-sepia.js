import { NOISE_GLSL, SKY_VERT } from './noise.js';

export const vertexShader = SKY_VERT;

// Hazy sepia sky: broad diffuse sun glow (no hard disc), soft cloud banding.
export const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3  uSunDir;
uniform vec3  uZenith;
uniform vec3  uUpper;
uniform vec3  uHorizon;
uniform vec3  uSunGlow;
uniform float uCloud;

varying vec3 vDir;

${NOISE_GLSL}

void main(){
  vec3 d = normalize(vDir);
  float h = d.y;

  // Vertical ramp: horizon haze -> upper -> zenith.
  vec3 sky = mix(uHorizon, uUpper, smoothstep(-0.02, 0.26, h));
  sky = mix(sky, uZenith, smoothstep(0.20, 0.80, h));

  // Broad, hazy sun. Deliberately no disc: 1930s stock bloomed out.
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  float glow = pow(sd, 22.0) * 0.45 + pow(sd, 5.0) * 0.20 + pow(sd, 1.5) * 0.06;
  sky += uSunGlow * glow;

  // Cloud banding, masked to a band above the horizon, drifting slowly.
  vec2 cp = vec2(atan(d.z, d.x) * 1.7, h * 3.4);
  float c = fbm(cp * 1.35 + vec2(uTime * 0.010, uTime * 0.003));
  c = smoothstep(0.46, 0.92, c);
  float mask = smoothstep(0.01, 0.30, h) * (1.0 - smoothstep(0.45, 0.95, h));
  sky = mix(sky, mix(sky, uSunGlow, 0.60), c * mask * uCloud);

  gl_FragColor = vec4(sky, 1.0);
}
`;
