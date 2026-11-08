// Shared GLSL used by both skies and the grade pass.
// Plain strings interpolated into shader sources: the zero-build equivalent of #include.

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p){
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++){
    v += amp * vnoise(p);
    p *= 2.02;
    amp *= 0.5;
  }
  return v;
}
`;

// The dusk vertical ramp. Shared so the ocean reflects exactly the sky that
// is actually above it, rather than one flat approximation of it.
export const SKY_RAMP_GLSL = /* glsl */ `
vec3 skyRamp(float h, vec3 zen, vec3 up, vec3 mid, vec3 low, vec3 hor){
  vec3 c = mix(hor, low, smoothstep(-0.03, 0.07, h));
  c = mix(c, mid, smoothstep(0.04, 0.22, h));
  c = mix(c, up,  smoothstep(0.16, 0.44, h));
  c = mix(c, zen, smoothstep(0.38, 0.90, h));
  return c;
}
`;

// Sky domes are inverted spheres; the fragment shader works from the
// world-space view direction, so parallax comes for free.
export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// Fullscreen quad for the grade pass.
export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}
`;
