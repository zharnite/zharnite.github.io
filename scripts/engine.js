import * as THREE from 'three';
import { QUAD_VERT } from './shaders/noise.js';

// Every colour in this project is hand-authored to its final on-screen value,
// and every material is a ShaderMaterial that writes gl_FragColor directly.
// Disabling colour management keeps hex in == pixels out, with no hidden
// linear/sRGB conversion fighting the palettes.
THREE.ColorManagement.enabled = false;

const PARALLAX_MAX = 0.016; // radians. Deliberately tiny.
const PARALLAX_EASE = 0.045;

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return false;
  }
}

function isCoarsePointer() {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch (e) {
    return false;
  }
}

function isSmallViewport() {
  return window.innerWidth < 768;
}

function pixelRatio() {
  return Math.min(window.devicePixelRatio || 1, isSmallViewport() ? 1.5 : 2);
}

export function createEngine(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
  } catch (e) {
    return null; // caller falls back to the CSS gradient
  }
  if (!renderer || !renderer.getContext()) return null;

  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    12000
  );

  const reduced = prefersReducedMotion();
  const coarse = isCoarsePointer();

  let world = null;
  let worldGroup = null;

  // --- optional grade pass -------------------------------------------------

  let target = null;
  let quadScene = null;
  let quadCamera = null;
  let quadMat = null;
  let quadGeo = null;

  // A render target with a zero-size attachment is an incomplete framebuffer,
  // which floods the console and renders nothing. The viewport can genuinely
  // report 0 while a pane is opening, so clamp every size that reaches GL.
  function bufferSize() {
    const v = renderer.getDrawingBufferSize(new THREE.Vector2());
    return { x: Math.max(1, v.x | 0), y: Math.max(1, v.y | 0) };
  }

  function buildGrade(grade) {
    const size = bufferSize();
    // A world with hard geometric edges asks for multisampling here rather
    // than on the canvas: the scene is drawn into this target, so the
    // renderer's own antialias flag never touches it.
    target = new THREE.WebGLRenderTarget(size.x, size.y, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      samples: grade.samples || 0,
    });
    quadGeo = new THREE.PlaneGeometry(1, 1);
    quadMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: grade.fragmentShader,
      uniforms: Object.assign(
        {
          tDiffuse: { value: target.texture },
          uResolution: { value: new THREE.Vector2(size.x, size.y) },
          uTime: { value: 0 },
        },
        grade.uniforms || {}
      ),
      depthTest: false,
      depthWrite: false,
    });
    quadScene = new THREE.Scene();
    quadScene.add(new THREE.Mesh(quadGeo, quadMat));
    quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  function teardownGrade() {
    if (target) {
      target.dispose();
      target = null;
    }
    if (quadGeo) {
      quadGeo.dispose();
      quadGeo = null;
    }
    if (quadMat) {
      quadMat.dispose();
      quadMat = null;
    }
    quadScene = null;
    quadCamera = null;
  }

  // --- loop state ---------------------------------------------------------

  let rafId = 0;
  let running = false;
  let lastT = 0;
  let elapsed = 0;
  let firstFrameDone = false;
  let failed = false;

  const pointer = { tx: 0, ty: 0, x: 0, y: 0 };

  function applyCamera() {
    if (!world || !world.camera) return;
    const c = world.camera;
    camera.fov = c.fov;
    camera.position.set(c.position[0], c.position[1], c.position[2]);
    camera.updateProjectionMatrix();
  }

  function renderOnce(dt) {
    if (failed || !world) return;

    if (!reduced) {
      pointer.x += (pointer.tx - pointer.x) * PARALLAX_EASE;
      pointer.y += (pointer.ty - pointer.y) * PARALLAX_EASE;
    }

    const basePitch = (world.camera && world.camera.pitch) || 0;
    camera.rotation.set(basePitch + pointer.y, pointer.x, 0, 'YXZ');

    try {
      world.update(elapsed, dt);
    } catch (e) {
      console.error('[world.update]', e);
    }

    if (quadMat) quadMat.uniforms.uTime.value = elapsed;

    if (target && quadScene) {
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCamera);
    } else {
      renderer.render(scene, camera);
    }

    if (!firstFrameDone) {
      firstFrameDone = true;
      canvas.classList.add('is-ready');
    }
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - lastT) / 1000, 1 / 20);
    lastT = now;
    elapsed += dt;
    renderOnce(dt);
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduced || failed || !world) return;
    running = true;
    lastT = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  // --- listeners (owned here, so world swaps cannot accumulate them) ------

  let resizeTimer = 0;

  function doResize() {
    if (failed) return;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);

    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    if (target) {
      const size = bufferSize();
      target.setSize(size.x, size.y);
      if (quadMat) quadMat.uniforms.uResolution.value.set(size.x, size.y);
    }
    if (world && typeof world.resize === 'function') {
      try {
        world.resize(w, h);
      } catch (e) {
        /* non-fatal */
      }
    }
    if (!running) renderOnce(0); // keep the static frame correct
  }

  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(doResize, 120);
  }

  function onPointer(e) {
    if (reduced || coarse) return;
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    pointer.tx = -nx * PARALLAX_MAX;
    pointer.ty = -ny * PARALLAX_MAX * 0.6;
  }

  function onVisibility() {
    if (document.hidden) {
      stop();
    } else {
      lastT = performance.now();
      start();
    }
  }

  function onContextLost(e) {
    e.preventDefault();
    failed = true;
    stop();
    canvas.classList.remove('is-ready');
    canvas.classList.add('is-failed');
  }

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onContextLost, false);

  // --- world lifecycle ----------------------------------------------------

  function unmount() {
    if (!world) return;
    stop();
    if (worldGroup) scene.remove(worldGroup);
    try {
      world.dispose();
    } catch (e) {
      console.error('[world.dispose]', e);
    }
    teardownGrade();
    worldGroup = null;
    world = null;
    if (scene.children.length !== 0) {
      console.warn('[engine] scene not empty after unmount:', scene.children.length);
      scene.clear();
    }
  }

  function setWorld(mod) {
    unmount();
    world = mod;
    applyCamera();

    const ctx = {
      renderer,
      scene,
      camera,
      reduced,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      quality: isSmallViewport() ? 'low' : 'high',
    };

    worldGroup = world.build(ctx);
    scene.add(worldGroup);

    if (world.grade) buildGrade(world.grade);

    // Reduced motion gets exactly one frame and no loop.
    if (reduced) {
      elapsed = 0;
      renderOnce(0);
    } else {
      start();
    }
  }

  function destroy() {
    unmount();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointer);
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    renderer.dispose();
  }

  return {
    setWorld,
    destroy,
    get reduced() {
      return reduced;
    },
    get scene() {
      return scene;
    },
    stats() {
      const i = renderer.info;
      return {
        geometries: i.memory.geometries,
        textures: i.memory.textures,
        programs: i.programs ? i.programs.length : 0,
        calls: i.render.calls,
        triangles: i.render.triangles,
        sceneChildren: scene.children.length,
      };
    },
  };
}
