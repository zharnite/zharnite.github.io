// The skyship's surfaces: envelope, timber and spars alike. It is backlit by
// a hazy sun, so it stays mostly a silhouette: a dark body, a paler back
// where the sky and sun reach it, and a thin bright edge. The envelope also
// carries seams -- ring frames along its length and the gores of fabric
// between them -- kept faint, because from this distance they are something
// you sense more than see.

export const vertexShader = /* glsl */ `
varying vec3 vObj;
varying vec3 vNw;
varying vec3 vNv;
varying vec3 vPv;

void main(){
  vObj = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPv = mv.xyz;
  vNv = normalize(normalMatrix * normal);
  // Parts are built at their real size and never squashed, so the model
  // matrix is rotation and uniform scale only and can carry the normal.
  vNw = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * mv;
}
`;

export const fragmentShader = /* glsl */ `
uniform vec3  uShade;
uniform vec3  uLit;
uniform vec3  uRim;
uniform vec3  uHaze;
uniform vec3  uSunDir;
uniform float uRimStrength;
uniform float uHazeAmt;
uniform float uPanels;   // 1 on the envelope, 0 on everything else
uniform float uRings;    // ring frames along the hull's length
uniform float uGores;    // fabric gores around it
uniform float uLength;

varying vec3 vObj;
varying vec3 vNw;
varying vec3 vNv;
varying vec3 vPv;

// A seam at every integer of c, antialiased against the pixel grid and faded
// out altogether once the seams get closer together than a few pixels, where
// they would only shimmer.
float seam(float c){
  float w = fwidth(c);
  float d = abs(fract(c) - 0.5);
  float line = smoothstep(0.5 - 1.5 * w, 0.5, d);
  return line * (1.0 - smoothstep(0.22, 0.45, w));
}

void main(){
  vec3 N = normalize(vNw);

  // Half-Lambert from the sun, plus light from the open sky above. Neither
  // alone reads as a round body under haze.
  float sun = dot(N, normalize(uSunDir)) * 0.5 + 0.5;
  float sky = N.y * 0.5 + 0.5;
  float light = clamp(sun * 0.6 + sky * 0.4, 0.0, 1.0);
  vec3 col = mix(uShade, uLit, smoothstep(0.30, 0.92, light));

  if (uPanels > 0.5) {
    float rings = seam(vObj.x / uLength * uRings);
    float gores = seam(atan(vObj.z, vObj.y) / 6.28318530718 * uGores);
    col *= 1.0 - 0.10 * rings - 0.07 * gores;
  }

  // The thin lit edge a backlit shape always has.
  vec3 V = normalize(-vPv);
  float rim = pow(1.0 - clamp(dot(normalize(vNv), V), 0.0, 1.0), 3.0);
  col = mix(col, uRim, rim * uRimStrength);

  // It is 900 units away through the same air as the city.
  col = mix(col, uHaze, uHazeAmt);

  gl_FragColor = vec4(col, 1.0);
}
`;
