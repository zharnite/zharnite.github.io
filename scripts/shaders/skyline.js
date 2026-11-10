import { NOISE_GLSL } from './noise.js';

export const vertexShader = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// One layer of a receding city. A skyline is rectangles, so this is cheaper
// than the fbm ridges it replaces: flat-topped blocks from a hash, plus the
// two details that date it to the 1930s -- stepped Art Deco setbacks, and the
// occasional mooring mast.
//
// uBase is where the roofline sits as a fraction of the quad's height and
// uAmp is how far it varies. The quad runs well below the frame so the layer
// fills everything beneath its own skyline.
export const fragmentShader = /* glsl */ `
uniform vec3  uColor;
uniform float uTime;
uniform float uSeed;
uniform float uSpeed;
uniform float uBase;
uniform float uAmp;
uniform float uCount;
uniform float uSoft;
uniform float uOpacity;
uniform float uWindows;
uniform vec3  uGlint;     // colour of the window glints: daylight, or lamps
uniform vec3  uHaze;
uniform float uHazeAmt;
uniform float uHazeDepth;
uniform float uClutter;   // 1 adds roof clutter and walkways between towers

varying vec2 vUv;

${NOISE_GLSL}

float blockTop(float x, float count, float off, float seed){
  return hash12(vec2(floor(x * count + off), seed));
}

void main(){
  float x = vUv.x + uSeed + uTime * uSpeed;

  // Two grids at different pitches, maxed together, so building widths vary
  // instead of marching in lockstep.
  float c1 = uCount;
  float c2 = uCount * 0.61;
  float top = max(
    uBase + uAmp * (blockTop(x, c1, 0.0, uSeed) - 0.5),
    uBase + uAmp * (blockTop(x, c2, 7.3, uSeed + 19.0) - 0.5) * 0.85
  );

  // Setbacks on the taller blocks, and a mast on a few of those.
  float slot = floor(x * c1);
  float crown = hash12(vec2(slot, 91.0));
  float mid = abs(fract(x * c1) - 0.5);
  if (crown > 0.58) {
    top += uAmp * 0.30 * step(mid, 0.26);
    top += uAmp * 0.22 * step(mid, 0.13);
  }
  if (crown > 0.88) {
    top += uAmp * 0.45 * step(mid, 0.022);
  }

  float walk = 0.0;
  if (uClutter > 0.5) {
    // Tanks and aerials: the roofline of a city nobody tidies.
    float sub = x * c1 * 5.0;
    float sh = hash12(vec2(floor(sub), 33.0 + uSeed));
    float sm = abs(fract(sub) - 0.5);
    top += uAmp * 0.055 * step(0.62, sh) * step(sm, 0.30);
    top += uAmp * (0.08 + 0.16 * sh) * step(0.80, sh) * step(sm, 0.05);

    // A walkway slung between two towers that stand above the block between
    // them. It hangs from the lower of the two, so both ends land on roof.
    float w = 1.0 / c1;
    float tl = blockTop(x - w, c1, 0.0, uSeed);
    float tr = blockTop(x + w, c1, 0.0, uSeed);
    float yb = uBase + uAmp * (min(tl, tr) - 0.5) - uAmp * 0.10;
    float on = step(0.45, hash12(vec2(slot, 55.0 + uSeed)));
    walk = on * smoothstep(yb + uSoft, yb - uSoft, vUv.y) *
           smoothstep(yb - uAmp * 0.045 - uSoft, yb - uAmp * 0.045 + uSoft, vUv.y);
  }

  float a = max(smoothstep(top + uSoft, top - uSoft, vUv.y), walk);
  if (a <= 0.002) discard;

  vec3 col = uColor;

  // Daylight catching the window bands. This is a hazy afternoon, so they are
  // glints, not lit windows -- texture rather than a night scene.
  if (uWindows > 0.0) {
    vec2 cell = floor(vec2(x * c1 * 7.0, vUv.y * 150.0));
    float lit = step(0.86, hash12(cell + 5.1));
    float inside = step(vUv.y, top - uSoft * 4.0);
    col += lit * inside * uWindows * uGlint;
  }

  // Mist between the rows. A layer used to be one flat colour, so depth came
  // from five hard steps. Here a level fog bank starts at the layer's lowest
  // rooflines and thickens downward, until the next row of buildings cuts
  // across it dark and crisp. The bank is level rather than hung from each
  // roof, so towers stand out of it and low blocks sink into it.
  float fogTop = uBase - uAmp * 0.25;
  float mist = 1.0 - smoothstep(fogTop - uHazeDepth, fogTop, vUv.y);
  // One octave of slow noise, so it drifts and is never a clean gradient.
  mist *= 0.80 + 0.40 * vnoise(vec2(x * uCount * 0.30 + uTime * 0.015, vUv.y * 46.0 + uSeed));
  col = mix(col, uHaze, clamp(mist * uHazeAmt, 0.0, 1.0));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), a * uOpacity);
}
`;
