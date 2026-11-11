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
varying vec2 vUv;

void main(){
  vObj = position;
  vUv = uv;
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
uniform float uRimPower;  // lower is a broader rim
uniform vec3  uUnder;     // light from below, already scaled; black for none
uniform vec3  uKeyDir;    // where the key light comes from (world space)
uniform vec3  uKeyCol;
uniform float uKeyAmt;    // 0 for no key light
uniform float uRimDir;    // 1 keeps the rim to the key's side of the shape
uniform float uHazeAmt;
uniform float uPanels;   // 0 plain, 1 the envelope, 2 the boat hull
uniform vec3  uTrim;     // brass
uniform vec3  uLamp;     // what shows through a porthole
uniform float uRings;    // ring frames along the hull's length
uniform float uGores;    // fabric gores around it
uniform float uLength;

varying vec3 vObj;
varying vec3 vNw;
varying vec3 vNv;
varying vec3 vPv;
varying vec2 vUv;

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

  // A key light from one side. A rim all the way round the outline shades a
  // round body like a pillow; light from one direction gives it a lit flank,
  // a dark one and a turn between them, which is what makes it read as round.
  // A soft band of highlight runs along where the surface faces the light.
  float k = dot(N, normalize(uKeyDir));
  col = mix(col, uKeyCol, smoothstep(0.05, 0.92, k) * uKeyAmt);
  col += uKeyCol * pow(max(k, 0.0), 6.0) * 0.22 * uKeyAmt;

  // Brass takes the light too, or it reads as paint.
  float shadeF = uKeyAmt > 0.001 ? smoothstep(0.05, 0.92, k) : light;
  vec3 trim = uTrim * (0.55 + 0.45 * shadeF);

  if (uPanels > 1.5) {
    // The boat hull. vUv.x runs bow to stern; vUv.y runs gunwale, keel,
    // gunwale, so s is 1 at the rail and 0 along the keel. One smooth loft
    // shaded as one surface is just a tube, so it is dressed as a ship:
    // planked topsides, a brass wale under the rail, copper sheathing below
    // a waterline band, and a row of lit portholes.
    float s = abs(vUv.y * 2.0 - 1.0);
    float along = vUv.x;

    float below = 1.0 - smoothstep(0.38, 0.40, s);
    // Planking above, seams running the length of the ship.
    col *= 1.0 - 0.20 * seam(s * 10.0) * (1.0 - below);
    // Copper below, in plates.
    col = mix(col, mix(col, trim, 0.55), below);
    col *= 1.0 - 0.16 * below * max(seam(along * 26.0), seam(s * 10.0));
    // Waterline band and wale.
    float fs = fwidth(s);
    float line = smoothstep(0.38 - fs, 0.38, s) * (1.0 - smoothstep(0.43, 0.43 + fs, s));
    float wale = smoothstep(0.86 - fs, 0.86, s) * (1.0 - smoothstep(0.94, 0.94 + fs, s));
    col = mix(col, trim, max(line * 0.7, wale * 0.9));

    // Portholes, brass-ringed.
    float n = 11.0;
    vec2 pp = vec2((fract(along * n) - 0.5) * (uLength / n), (s - 0.66) * 9.0);
    float pr = length(pp);
    float pw = fwidth(pr);
    float inRow = step(0.14, along) * step(along, 0.97);
    col = mix(col, trim, (1.0 - smoothstep(0.95, 0.95 + pw, pr)) * inRow);
    col = mix(col, uLamp, (1.0 - smoothstep(0.58, 0.58 + pw, pr)) * inRow);
  } else if (uPanels > 0.5) {
    // The envelope: sewn from gores a shade apart, like a balloon cut from
    // two bolts of cloth, seamed at its frames, and banded in brass at every
    // third frame and on the nose.
    float ring = vObj.x / uLength * uRings;
    float gore = atan(vObj.z, vObj.y) / 6.28318530718 * uGores;
    col *= 0.92 + 0.16 * mod(floor(gore), 2.0);
    col *= 1.0 - 0.10 * seam(ring) - 0.07 * seam(gore);

    float nearFrame = abs(fract(ring + 0.5) - 0.5);
    float third = step(mod(floor(ring + 0.5), 3.0), 0.5);
    float fw = fwidth(ring);
    float bandM = third * (1.0 - smoothstep(0.07, 0.07 + fw, nearFrame));
    float cap = smoothstep(uLength * 0.5 - 5.2, uLength * 0.5 - 4.8, vObj.x);
    col = mix(col, trim, max(bandM, cap) * 0.8);
  }

  // What the city throws up at its belly.
  col += uUnder * pow(max(-N.y, 0.0), 1.5);

  // The thin lit edge a backlit shape always has.
  vec3 V = normalize(-vPv);
  float rim = pow(1.0 - clamp(dot(normalize(vNv), V), 0.0, 1.0), uRimPower);
  rim *= mix(1.0, smoothstep(-0.2, 0.5, k), uRimDir);
  col = mix(col, uRim, rim * uRimStrength);

  // It is 900 units away through the same air as the city.
  col = mix(col, uHaze, uHazeAmt);

  gl_FragColor = vec4(col, 1.0);
}
`;
