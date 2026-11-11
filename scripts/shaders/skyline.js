import { NOISE_GLSL } from './noise.js';

export const vertexShader = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// One layer of a receding city. A skyline is mostly rectangles, so this is
// cheaper than the fbm ridges it replaces: blocks from a hash, each given one
// of the roofs of the steam-age city in front of it -- a gable, a mansard, a
// dome with its finial, a spire, or a factory stack.
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
  float top1 = uBase + uAmp * (blockTop(x, c1, 0.0, uSeed) - 0.5);
  float top2 = uBase + uAmp * (blockTop(x, c2, 7.3, uSeed + 19.0) - 0.5) * 0.85;
  float top = max(top1, top2);
  // Where the wall stops and the roof starts. Everything added to top
  // below this line is roof, and roofs have no windows.
  float eaves = top;

  // A roof for each block, chosen by the same throw that sized it.
  float slot = floor(x * c1);
  float crown = hash12(vec2(slot, 91.0));
  float mid = abs(fract(x * c1) - 0.5);
  float w01 = mid * 2.0; // 0 at the block's middle, 1 at its edge
  if (crown < 0.26) {
    // Gable.
    top += uAmp * 0.24 * (1.0 - w01);
  } else if (crown < 0.42) {
    // Mansard.
    top += uAmp * 0.15 * step(w01, 0.86) + uAmp * 0.05 * step(w01, 0.55);
  } else if (crown < 0.54) {
    // Dome and finial.
    float k = w01 / 0.7;
    top += uAmp * 0.32 * sqrt(max(0.0, 1.0 - k * k));
    top += uAmp * 0.20 * step(mid, 0.02);
  } else if (crown < 0.66) {
    // Turret and spire.
    top += uAmp * 0.14 * step(w01, 0.42);
    top += uAmp * 0.75 * max(0.0, 1.0 - w01 / 0.30);
  } else if (crown < 0.78) {
    // Factory stack, off to one side.
    top += uAmp * 0.60 * step(abs(fract(x * c1) - 0.3), 0.045);
  }

  float walk = 0.0;
  if (uClutter > 0.5) {
    // Chimney pots and vent pipes: the roofline of a city that burns coal.
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

  // By day, sun catching a pane here and there; at dusk, lamps.
  if (uWindows > 0.0) {
    // Windows belong to a building, not to the sky behind it: columns are
    // counted across whichever block is showing here, so they sit centred
    // between its two walls, and floors are counted down from its eaves, so
    // the top row is a floor below the roofline and nothing is lit in a
    // gable, a dome or a spire.
    bool wide = top2 > top1;
    float pitch = wide ? c2 : c1;
    float cols = wide ? 11.0 : 7.0;
    float across = wide ? x * c2 + 7.3 : x * c1;
    vec2 g = vec2(fract(across) * cols, (eaves - vUv.y) * c1 - 0.35);
    vec2 f = fract(g);
    // Widths from the smooth quantities; fract() jumps at every wall.
    vec2 w = vec2(fwidth(x) * pitch * cols, fwidth(vUv.y) * c1);
    float pane =
      smoothstep(0.30 - w.x, 0.30 + w.x, f.x) * (1.0 - smoothstep(0.70 - w.x, 0.70 + w.x, f.x)) *
      smoothstep(0.22 - w.y, 0.22 + w.y, f.y) * (1.0 - smoothstep(0.78 - w.y, 0.78 + w.y, f.y));
    vec2 id = floor(g) + vec2(floor(across) * 13.0 + (wide ? 400.0 : 0.0), uSeed);
    float lit = step(0.83, hash12(id));
    col += pane * lit * step(0.0, g.y) * uWindows * uGlint;
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
