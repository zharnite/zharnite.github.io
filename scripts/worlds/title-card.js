import * as THREE from 'three';
import * as cardShader from '../shaders/card.js';
import * as gradeCard from '../shaders/grade-card.js';

// A factory rather than a single exported object, so a second card in another
// treatment is one more call with its own closure state. Only the black and
// white card is made at the moment.
//
// There is no 3D subject here on purpose. The page is already composed like a
// title card -- a heading sitting at 35vh over an empty field -- so this world
// supplies the card and the existing layout is the lettering.

function createCard(opts) {
  let disposables = [];
  let group = null;
  let cardMat = null;
  let gradeUniforms = null;

  function track(o) {
    disposables.push(o);
    return o;
  }

  function buildCard(aspect) {
    const geo = track(new THREE.PlaneGeometry(1, 1));
    cardMat = track(
      new THREE.ShaderMaterial({
        vertexShader: cardShader.vertexShader,
        fragmentShader: cardShader.fragmentShader,
        uniforms: {
          uCenter: { value: new THREE.Color(opts.center) },
          uMid: { value: new THREE.Color(opts.mid) },
          uEdge: { value: new THREE.Color(opts.edge) },
          uFocus: { value: new THREE.Vector2(0.4, 0.56) },
          uAspect: { value: aspect },
          uTexture: { value: opts.texture },
          uTime: { value: 0 },
        },
        depthTest: false,
        depthWrite: false,
      })
    );
    const mesh = new THREE.Mesh(geo, cardMat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -10;
    return mesh;
  }

  return {
    id: opts.id,

    // The card is screen space, so the camera does nothing here. It still has
    // to be a valid camera for the engine.
    camera: { fov: 45, position: [0, 0, 0], pitch: 0 },

    grade: null, // set in build(), because it depends on ctx.reduced

    build(ctx) {
      disposables = [];
      group = new THREE.Group();

      const aspect = ctx.viewport.width / Math.max(1, ctx.viewport.height);
      group.add(buildCard(aspect));

      // Weave, flicker and dust are all motion. Freeze them, but keep a
      // little static grain so the stock still reads as film.
      const r = ctx.reduced;
      gradeUniforms = {
        uMono: { value: opts.mono ? 1 : 0 },
        uWeave: { value: r ? 0 : opts.weave },
        uFringe: { value: opts.fringe },
        uHalation: { value: opts.halation },
        uGrain: { value: r ? opts.grain * 0.4 : opts.grain },
        uVignette: { value: opts.vignette },
        uFlicker: { value: r ? 0 : opts.flicker },
        uLift: { value: opts.lift },
        uDust: { value: r ? 0 : opts.dust },
      };
      this.grade = {
        fragmentShader: gradeCard.fragmentShader,
        uniforms: gradeUniforms,
      };

      return group;
    },

    resize(w, h) {
      if (cardMat) cardMat.uniforms.uAspect.value = w / Math.max(1, h);
    },

    update(t) {
      if (cardMat) cardMat.uniforms.uTime.value = t;
    },

    dispose() {
      for (const d of disposables) {
        try {
          d.dispose();
        } catch (e) {
          /* already gone */
        }
      }
      disposables = [];
      cardMat = null;
      gradeUniforms = null;
      group = null;
      this.grade = null;
    },
  };
}

// Black and white: no colour records, so no fringing at all. Grain, weave and
// flicker carry it instead.
export const mono = createCard({
  id: 'old-tv',
  mono: true,
  center: 0x6b6b6b,
  mid: 0x353535,
  edge: 0x101010,
  texture: 0.07,
  weave: 1.4,
  fringe: 0.0,
  halation: 0.35,
  grain: 0.075,
  vignette: 0.58,
  flicker: 0.045,
  lift: 0.09,
  dust: 0.07,
});
