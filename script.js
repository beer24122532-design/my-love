/* ==========================================================================
   ETERNAL ROSE — script.js
   Three.js (r128) · GSAP 3 · Web Audio API · Vanilla JavaScript
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     0. DOM
     ------------------------------------------------------------------------ */
  const $ = (id) => document.getElementById(id);
  const DOM = {
    loader: $('loader'),
    loaderFill: $('loaderFill'),
    loaderPercent: $('loaderPercent'),
    loaderStatus: $('loaderStatus'),
    loaderError: $('loaderError'),
    loaderErrorText: $('loaderErrorText'),
    retryBtn: $('retryBtn'),
    canvas: $('scene'),
    ui: $('ui'),
    eyebrow: $('eyebrow'),
    story: $('story'),
    hint: $('hint'),
    phase: $('phase'),
    phaseNum: $('phaseNum'),
    phaseName: $('phaseName'),
    phaseSteps: Array.prototype.slice.call(document.querySelectorAll('.phase__track i')),
    soundBtn: $('soundBtn'),
    soundState: $('soundState'),
    fullscreenBtn: $('fullscreenBtn'),
    fsLabel: $('fsLabel'),
    shotBtn: $('shotBtn'),
    macroBtn: $('macroBtn'),
    macroLabel: $('macroLabel'),
    cinemaBtn: $('cinemaBtn'),
    replayBtn: $('replayBtn'),
    toast: $('toast'),
    flash: $('flash'),
    curtain: $('curtain'),
    themes: $('themes')
  };

  /* ------------------------------------------------------------------------
     1. HELPERS
     ------------------------------------------------------------------------ */
  const TAU = Math.PI * 2;
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const rand = (a, b) => a + Math.random() * (b - a);
  const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

  let toastTimer = 0;
  function showToast(msg, ms) {
    DOM.toast.textContent = msg;
    DOM.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => DOM.toast.classList.remove('is-visible'), ms || 2600);
  }

  /* ------------------------------------------------------------------------
     2. LOADER CONTROLLER
     ------------------------------------------------------------------------ */
  const Loader = {
    target: 0,
    shown: 0,
    raf: 0,
    done: false,
    start() {
      const tick = () => {
        this.shown += (this.target - this.shown) * 0.09;
        if (Math.abs(this.target - this.shown) < 0.15) this.shown = this.target;
        DOM.loaderFill.style.transform = 'scaleX(' + (this.shown / 100).toFixed(4) + ')';
        DOM.loaderPercent.textContent = String(Math.round(this.shown)).padStart(3, '0');
        if (!this.done) this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    },
    set(p, status) {
      this.target = Math.max(this.target, p);
      if (status) DOM.loaderStatus.textContent = status;
    },
    waitFull() {
      return new Promise((resolve) => {
        const check = () => (this.shown >= 99.5 ? resolve() : requestAnimationFrame(check));
        check();
      });
    },
    fail(message) {
      this.done = true;
      cancelAnimationFrame(this.raf);
      DOM.loader.classList.add('is-error');
      DOM.loaderStatus.textContent = 'การบานถูกขัดจังหวะ';
      DOM.loaderErrorText.textContent = message;
      DOM.loaderError.hidden = false;
    },
    hide() {
      this.done = true;
      DOM.loader.classList.add('is-leaving');
      setTimeout(() => DOM.loader.classList.add('is-hidden'), 1500);
    }
  };

  /* ------------------------------------------------------------------------
     3. QUALITY / DEVICE PROFILE
     ------------------------------------------------------------------------ */
  const LEVELS = [
    { pixelRatio: 2.0, bloom: true, dof: 1.0, shadows: true, particleFrac: 1.0 },
    { pixelRatio: 1.5, bloom: true, dof: 0.65, shadows: true, particleFrac: 0.85 },
    { pixelRatio: 1.25, bloom: true, dof: 0.0, shadows: false, particleFrac: 0.65 },
    { pixelRatio: 1.0, bloom: false, dof: 0.0, shadows: false, particleFrac: 0.45 }
  ];

  const PROFILES = [
    { birth: 11000, dust: 1000, stars: 2400, floatPetals: 34, explosion: 800, petalU: 12, petalV: 18, leafU: 8, leafV: 12, shadowMap: 2048, startLevel: 0 },
    { birth: 7200, dust: 650, stars: 1600, floatPetals: 24, explosion: 520, petalU: 10, petalV: 15, leafU: 7, leafV: 10, shadowMap: 1024, startLevel: 1 },
    { birth: 4200, dust: 380, stars: 900, floatPetals: 16, explosion: 320, petalU: 8, petalV: 12, leafU: 6, leafV: 9, shadowMap: 512, startLevel: 2 }
  ];

  function detectProfile() {
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const minSide = Math.min(window.innerWidth, window.innerHeight);
    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 4;
    let tier = 0;
    if (coarse || minSide < 700) tier = 1;
    if ((coarse && (minSide < 500 || cores <= 4)) || memory <= 2 || cores <= 2) tier = 2;
    return Object.assign({ tier: tier, coarse: coarse }, PROFILES[tier]);
  }

  /* ------------------------------------------------------------------------
     4. GLOBAL STATE
     ------------------------------------------------------------------------ */
  const PHASES = ['กำเนิดจากอนุภาค', 'กำลังเติบโต', 'กำลังบาน', 'นิรันดร์'];
  const MIN_LOADER_MS = 2800;

  const INITIAL_STATE = {
    birth: 0, birthAlpha: 0, dissolve: 0,
    growth: 0, budScale: 0, leaf0: 0, leaf1: 0, leaf2: 0,
    sepal: 0, bloom: 0, glow: 0, rays: 0, beams: 0,
    floatPetals: 0, dust: 0, eternal: 0, flash: 0
  };
  const INITIAL_CAM = { radius: 13.5, height: -0.6, targetY: -1.6, angle: -0.55 };

  const state = Object.assign({}, INITIAL_STATE);
  const cam = Object.assign({}, INITIAL_CAM);
  const fx = { pulse: 0, hover: 0, mouse: 0 };
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  const pointer = { nx: 0, ny: 0, active: false, type: 'mouse', downX: 0, downY: 0, downT: 0, hoverDirty: false, lastHover: 0, releaseTimer: 0 };
  const app = { started: false, timeline: null, hovering: false, rafId: 0, replaying: false, crashed: false, elapsed: 0 };
  const viewport = { w: window.innerWidth, h: window.innerHeight, camFactor: 1, shiftY: -0.22, sizeFactor: 1 };
  const perf = { level: 0, acc: 0, frames: 0, warm: 4, lowStreak: 0 };

  let profile = null;
  let renderer, scene, camera, clock, raycaster, plane;
  let post = null, useComposer = false, pixelRatio = 1;
  let keyLight, innerLight, lightHemi, lightAmbient, lightRimRed, lightRimGold, lightFill;
  let bg, stars, dust, birth, floating, glow, rays, beams;
  let V = null;      // reusable vectors
  let PAL = null;    // colour palette
  const rim = {};    // rim uniforms per material
  const pointMaterials = [];

  const rose = {
    root: null, head: null, curve: null, stemMesh: null,
    stemSegments: 160, stemIndicesPerSeg: 0,
    petals: [], sepals: [], leaves: [], thorns: [], headTargets: [],
    centerLocal: null, headBaseQuat: null,
    lastGrowth: -1, lastSepal: -1,
    plants: []
  };

  /* ------------------------------------------------------------------------
     5. SHADERS
     ------------------------------------------------------------------------ */
  const SOFT_POINT_FRAG = `
    varying vec3 vColor;
    varying float vAlpha;
    varying float vBlur;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5) discard;
      float soft = 1.0 - smoothstep(0.0, 0.5, d);
      float core = pow(soft, mix(2.6, 1.15, clamp(vBlur * 0.6, 0.0, 1.0)));
      gl_FragColor = vec4(vColor * (0.85 + core * 0.5), core * vAlpha);
    }
  `;

  const STAR_VERT = `
    attribute float aSize;
    attribute float aPhase;
    attribute vec3 aColor;
    uniform float uTime;
    uniform float uPixelRatio;
    uniform float uAlpha;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vBlur;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      float tw = 0.55 + 0.45 * sin(uTime * (0.4 + aPhase * 1.6) + aPhase * 31.0);
      vAlpha = tw * uAlpha;
      vColor = aColor;
      vBlur = 0.0;
      gl_PointSize = aSize * uPixelRatio;
    }
  `;

  const DUST_VERT = `
    attribute vec3 aColor;
    attribute vec4 aRand;
    uniform float uTime;
    uniform float uPixelRatio;
    uniform float uSize;
    uniform float uAlpha;
    uniform float uFocus;
    uniform vec3 uMouse;
    uniform float uMouseStrength;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vBlur;
    void main() {
      vec3 p = position;
      p.y = mod(p.y + uTime * (0.05 + aRand.x * 0.12) + 6.0, 12.0) - 6.0;
      p.x += sin(uTime * 0.3 * (0.5 + aRand.y) + aRand.z * 6.2831) * 0.4;
      p.z += cos(uTime * 0.25 * (0.5 + aRand.x) + aRand.w * 6.2831) * 0.4;

      vec3 diff = p - uMouse;
      float dist = length(diff);
      float push = (1.0 - smoothstep(0.0, 1.8, dist)) * uMouseStrength;
      p += normalize(diff + vec3(0.0001)) * push * 0.9;

      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      float depth = max(-mv.z, 0.1);
      float blur = clamp(abs(depth - uFocus) * 0.22, 0.0, 2.5);
      float size = uSize * (0.5 + aRand.w) * (1.0 + blur * 1.6);
      gl_PointSize = min(size * uPixelRatio * (10.0 / depth), 64.0 * uPixelRatio);

      float edge = smoothstep(-6.0, -4.5, p.y) * (1.0 - smoothstep(4.5, 6.0, p.y));
      vAlpha = uAlpha * edge * (0.35 + 0.65 * aRand.y) / (1.0 + blur * 1.4) * (0.65 + push * 1.6);
      vColor = aColor * (1.0 + push * 1.4);
      vBlur = blur;
    }
  `;

  const BIRTH_VERT = `
    attribute vec3 aStart;
    attribute vec4 aRand;
    attribute vec3 aColor;
    uniform float uProgress;
    uniform float uDissolve;
    uniform float uTime;
    uniform float uPixelRatio;
    uniform float uSize;
    uniform float uAlpha;
    uniform float uFocus;
    uniform vec3 uMouse;
    uniform float uMouseStrength;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vBlur;
    void main() {
      float p = clamp((uProgress - aRand.x * 0.35) / 0.65, 0.0, 1.0);
      float e = 1.0 - pow(1.0 - p, 3.0);
      vec3 s = aStart;
      vec3 t = position;
      float aS = atan(s.z, s.x + 0.00001);
      float aT = atan(t.z, t.x + 0.00001);
      float rS = length(s.xz);
      float rT = length(t.xz);
      float turns = 6.2831853 * (1.0 + aRand.y * 1.5);
      float ang = aT + (1.0 - e) * (aS - aT + turns);
      float r = mix(rS, rT, e) + sin(e * 3.14159) * 0.6 * (aRand.z - 0.3);
      vec3 pos = vec3(cos(ang) * r,
                      mix(s.y, t.y, e) + sin(e * 3.14159) * (aRand.w - 0.5) * 1.5,
                      sin(ang) * r);

      pos += vec3(sin(uTime * 1.3 + aRand.x * 40.0),
                  cos(uTime * 1.1 + aRand.y * 40.0),
                  sin(uTime * 0.9 + aRand.z * 40.0)) * 0.012 * e;

      float d = clamp((uDissolve - aRand.z * 0.55) / 0.45, 0.0, 1.0);
      float de = d * d;
      vec3 outward = normalize(vec3(pos.x, 0.35, pos.z) + vec3(0.0001));
      pos += outward * de * (1.0 + aRand.w * 2.5) + vec3(0.0, de * (0.8 + aRand.x * 1.6), 0.0);

      vec3 diff = pos - uMouse;
      float dist = length(diff);
      pos += normalize(diff + vec3(0.0001)) * (1.0 - smoothstep(0.0, 1.3, dist)) * uMouseStrength * 0.45;

      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mv;
      float depth = max(-mv.z, 0.1);
      float blur = clamp(abs(depth - uFocus) * 0.18, 0.0, 2.0);
      float size = uSize * (0.45 + aRand.w * 0.9) * (1.0 + blur * 1.2) * (1.0 + (1.0 - e) * 0.8);
      gl_PointSize = min(size * uPixelRatio * (10.0 / depth), 48.0 * uPixelRatio);
      vColor = aColor;
      vAlpha = uAlpha * (1.0 - d) * (0.35 + 0.65 * e) / (1.0 + blur);
      vBlur = blur;
    }
  `;

  const BURST_VERT = `
    attribute float aAlpha;
    attribute float aSize;
    attribute vec3 aColor;
    uniform float uPixelRatio;
    uniform float uSize;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vBlur;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      float depth = max(-mv.z, 0.1);
      gl_PointSize = aAlpha > 0.001 ? min(aSize * uSize * uPixelRatio * (10.0 / depth), 56.0 * uPixelRatio) : 0.0;
      vColor = aColor;
      vAlpha = aAlpha;
      vBlur = 0.25;
    }
  `;

  const BILLBOARD_VERT = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const GLOW_FRAG = `
    uniform float uIntensity;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv - 0.5;
      float d = length(p) * 2.0;
      float g = exp(-d * d * 5.0) * 0.75 + exp(-d * 2.8) * 0.25;
      g *= 1.0 - smoothstep(0.85, 1.0, d);
      vec3 col = mix(uColorA, uColorB, exp(-d * d * 14.0));
      gl_FragColor = vec4(col, g * uIntensity);
    }
  `;

  const RAYS_FRAG = `
    uniform float uIntensity;
    uniform float uTime;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      float a = atan(p.y, p.x + 0.00001);
      float r1 = pow(0.5 + 0.5 * sin(a * 9.0 + uTime * 0.12), 8.0);
      float r2 = pow(0.5 + 0.5 * sin(a * 17.0 - uTime * 0.09 + 1.7), 12.0);
      float r3 = pow(0.5 + 0.5 * sin(a * 5.0 + uTime * 0.05 + 0.6), 4.0);
      float rays = r1 * 0.5 + r2 * 0.35 + r3 * 0.3;
      float fall = (1.0 - smoothstep(0.05, 1.0, r)) * smoothstep(0.0, 0.18, r);
      vec3 col = mix(uColorB, uColorA, smoothstep(0.1, 0.8, r));
      gl_FragColor = vec4(col, rays * fall * uIntensity);
    }
  `;

  const BEAM_VERT = `
    varying vec2 vUv;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vUv = uv;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `;

  const BEAM_FRAG = `
    uniform float uIntensity;
    uniform float uTime;
    uniform vec3 uColor;
    varying vec2 vUv;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      float facing = abs(dot(normalize(vN), normalize(vV)));
      float edge = pow(facing, 2.0);
      float fall = smoothstep(0.0, 0.55, vUv.y) * (1.0 - smoothstep(0.88, 1.0, vUv.y));
      float flicker = 0.85 + 0.15 * sin(uTime * 0.6 + vUv.x * 12.566);
      gl_FragColor = vec4(uColor, edge * fall * flicker * uIntensity * 0.22);
    }
  `;

  const RING_FRAG = `
    uniform float uProgress;
    uniform float uOpacity;
    uniform float uThickness;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      float ring = exp(-pow((r - 0.78) / uThickness, 2.0));
      float halo = exp(-pow((r - 0.74) / (uThickness * 4.0), 2.0)) * 0.35;
      float a = atan(p.y, p.x + 0.00001);
      float shimmer = 0.72 + 0.28 * sin(a * 14.0 + uProgress * 12.0);
      vec3 col = mix(uColorA, uColorB, smoothstep(0.55, 0.95, r));
      float alpha = (ring * shimmer + halo) * uOpacity * (1.0 - smoothstep(0.92, 1.0, r));
      gl_FragColor = vec4(col, alpha);
    }
  `;

  const BG_VERT = `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const BG_FRAG = `
    uniform float uTime;
    uniform float uIntensity;
    uniform vec3 uRed;
    uniform vec3 uGold;
    uniform vec3 uFocusDir;
    varying vec3 vDir;
    float hash(vec3 p) {
      p = fract(p * 0.3183099 + 0.1);
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float noise(vec3 x) {
      vec3 i = floor(x);
      vec3 f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
                     mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
                 mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
                     mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
    }
    float fbm(vec3 p) {
      float a = 0.5;
      float s = 0.0;
      for (int i = 0; i < 4; i++) {
        s += a * noise(p);
        p *= 2.03;
        a *= 0.5;
      }
      return s;
    }
    void main() {
      vec3 d = normalize(vDir);
      float n = fbm(d * 2.2 + vec3(0.0, uTime * 0.012, uTime * 0.006));
      float n2 = fbm(d * 5.0 - vec3(uTime * 0.01));
      float neb = smoothstep(0.35, 0.85, n);
      float focus = pow(max(dot(d, uFocusDir), 0.0), 5.0);
      vec3 col = vec3(0.010, 0.012, 0.020);
      col += uRed * neb * 0.07 * uIntensity;
      col += uRed * focus * 0.17 * uIntensity;
      col += uGold * smoothstep(0.6, 0.95, n2) * 0.025 * uIntensity;
      col += uGold * pow(focus, 3.0) * 0.05 * uIntensity;
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const FINAL_SHADER = {
    uniforms: {
      tDiffuse: { value: null },
      uResolution: { value: null },
      uFocus: { value: null },
      uDof: { value: 1.0 },
      uAberration: { value: 0.0011 }
    },
    vertexShader: BILLBOARD_VERT,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 uResolution;
      uniform vec2 uFocus;
      uniform float uDof;
      uniform float uAberration;
      varying vec2 vUv;
      void main() {
        vec2 uv = vUv;
        vec2 dir = uv - uFocus;
        float aspect = uResolution.x / uResolution.y;
        float dist = length(dir * vec2(aspect, 1.0));
        vec2 off = dir * uAberration * (0.4 + dist);
        vec3 col;
        col.r = texture2D(tDiffuse, uv + off).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv - off).b;
        float blur = smoothstep(0.32, 0.95, dist) * uDof;
        if (blur > 0.002) {
          vec3 acc = col;
          float total = 1.0;
          for (int i = 0; i < 8; i++) {
            float a = float(i) * 0.785398 + 0.3;
            vec2 o = vec2(cos(a), sin(a)) * blur * 0.012 * vec2(1.0 / aspect, 1.0);
            acc += texture2D(tDiffuse, uv + o).rgb;
            acc += texture2D(tDiffuse, uv + o * 0.5).rgb;
            total += 2.0;
          }
          col = acc / total;
        }
        col = pow(max(col, vec3(0.0)), vec3(0.96));
        col *= vec3(1.03, 0.99, 0.96);
        float vig = 1.0 - smoothstep(0.35, 1.35, dist);
        col *= mix(0.62, 1.0, vig);
        gl_FragColor = vec4(col, 1.0);
      }
    `
  };

  /* ------------------------------------------------------------------------
     6. MATERIAL UTILS
     ------------------------------------------------------------------------ */
  function addRim(material, colorHex, strength, power) {
    const uniforms = {
      uRimColor: { value: new THREE.Color(colorHex) },
      uRimStrength: { value: strength },
      uRimPower: { value: power }
    };
    material.onBeforeCompile = function (shader) {
      shader.uniforms.uRimColor = uniforms.uRimColor;
      shader.uniforms.uRimStrength = uniforms.uRimStrength;
      shader.uniforms.uRimPower = uniforms.uRimPower;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uRimPower;')
        .replace('#include <emissivemap_fragment>', [
          '#include <emissivemap_fragment>',
          '{',
          '  vec3 rimView = normalize(vViewPosition);',
          '  float rimF = 1.0 - abs(dot(normal, rimView));',
          '  totalEmissiveRadiance += uRimColor * pow(rimF, uRimPower) * uRimStrength;',
          '}'
        ].join('\n'));
    };
    return uniforms;
  }

  function pointsMaterial(vertexShader, uniforms, baseSize) {
    const mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uPixelRatio: { value: pixelRatio } }, uniforms),
      vertexShader: vertexShader,
      fragmentShader: SOFT_POINT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    mat.userData.baseSize = baseSize;
    pointMaterials.push(mat);
    return mat;
  }

  /* ------------------------------------------------------------------------
     7. PROCEDURAL GEOMETRY — grid surfaces for petals & leaves
     ------------------------------------------------------------------------ */
  function makeGridGeometry(nU, nV) {
    const count = (nU + 1) * (nV + 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const uv = new Float32Array(count * 2);
    let k = 0;
    for (let j = 0; j <= nV; j++) {
      for (let i = 0; i <= nU; i++) {
        uv[k++] = i / nU;
        uv[k++] = j / nV;
      }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx = [];
    for (let j = 0; j < nV; j++) {
      for (let i = 0; i < nU; i++) {
        const a = j * (nU + 1) + i;
        const b = a + 1;
        const c = a + nU + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    geo.setIndex(idx);
    geo.userData.nU = nU;
    geo.userData.nV = nV;
    return geo;
  }

  function makePetalDef(t) {
    const jit = () => 1 + (Math.random() - 0.5) * 0.1;
    return {
      t: t,
      L: (0.4 + 0.74 * Math.pow(t, 0.75)) * jit(),
      W: (0.34 + 0.88 * Math.pow(t, 0.85)) * jit(),
      r0: 0.025 + 0.16 * t,
      seed: Math.random() * 10,
      ruffle: 0.012 + 0.03 * t,
      closed: { thetaB: 0.1 + 0.12 * t, bend: -0.35 - 0.25 * t, reflex: 0, roll: 0 },
      open: {
        thetaB: 0.1 + 1.05 * Math.pow(t, 1.3) + (Math.random() - 0.5) * 0.08,
        bend: lerp(-0.6, 0.28, t),
        reflex: lerp(0.05, 1.25, Math.pow(t, 1.6)),
        roll: lerp(0.04, 0.85, Math.pow(t, 1.2)),
        R: lerp(0.14, 1.3, t)
      }
    };
  }

  const SPINE_N = 24;
  const spY = new Float32Array(SPINE_N + 1);
  const spZ = new Float32Array(SPINE_N + 1);
  const spT = new Float32Array(SPINE_N + 1);

  /* The heart of the rose: a petal surface deformed by "open" (0 bud → 1 bloom). */
  function petalWidth(v) {
    const a = Math.pow(Math.sin(Math.PI * 0.5 * Math.min(v / 0.68, 1)), 0.75);
    const tip = v > 0.68 ? Math.sqrt(Math.max(0, 1 - Math.pow((v - 0.68) / 0.32, 2) * 0.86)) : 1;
    return (0.16 + 0.84 * a) * tip;
  }

  function updatePetal(p, openAmt) {
    const d = p.def;
    const geo = p.mesh.geometry;
    const nU = geo.userData.nU;
    const nV = geo.userData.nV;
    const pos = geo.attributes.position.array;
    const e = clamp(openAmt, 0, 1.15);

    const thetaB = lerp(d.closed.thetaB, d.open.thetaB, e);
    const bend = lerp(d.closed.bend, d.open.bend, e);
    const reflex = lerp(d.closed.reflex, d.open.reflex, e) * 0.8;
    const roll = lerp(d.closed.roll, d.open.roll, e);
    const L = d.L * lerp(0.94, 1.0, e);
    const W = d.W * lerp(0.96, 1.04, e);
    const ds = L / SPINE_N;

    // Integrate the petal spine in the (radial Z, height Y) plane
    let y = 0;
    let z = d.r0 * lerp(1.0, 1.4, e);
    for (let k = 0; k <= SPINE_N; k++) {
      const s = k / SPINE_N;
      const r = smooth(0.4, 1.0, s);
      const ang = thetaB + bend * s + reflex * r * r;
      spT[k] = ang;
      spY[k] = y;
      spZ[k] = z;
      y += Math.cos(ang) * ds;
      z = Math.max(0.012, z + Math.sin(ang) * ds);
    }

    let ptr = 0;
    for (let j = 0; j <= nV; j++) {
      const v = j / nV;
      const f = v * SPINE_N;
      const k0 = Math.min(Math.floor(f), SPINE_N - 1);
      const fr = f - k0;
      const Y = lerp(spY[k0], spY[k0 + 1], fr);
      const Z = lerp(spZ[k0], spZ[k0 + 1], fr);
      const A = lerp(spT[k0], spT[k0 + 1], fr);
      const ny = -Math.sin(A);
      const nz = Math.cos(A);
      const half = 0.5 * W * petalWidth(v);
      const minR = half / 2.5;
      // Wrap curvature: hugs the bud when closed, flattens into a cup when open
      const kc = 1 / Math.max(Z * 1.08, minR, 0.02);
      const ko = 1 / Math.max(d.open.R * (0.75 + 0.7 * v), minR, 0.02);
      const R = 1 / lerp(kc, ko, clamp(e, 0, 1));
      const rollV = roll * smooth(0.2, 1.0, v) * half * 0.6;
      const ruf = d.ruffle * v * v * (0.4 + e);

      for (let i = 0; i <= nU; i++) {
        const xn = (i / nU) * 2 - 1;
        const a = (xn * half) / R;
        const lat = R * Math.sin(a);
        let off = -R * (1 - Math.cos(a));
        off += rollV * Math.pow(Math.abs(xn), 2.2);              // rolled-back margins
        off += ruf * Math.sin(xn * 6.5 + d.seed + v * 5.0);       // organic ruffle
        pos[ptr++] = lat;
        pos[ptr++] = Y + ny * off;
        pos[ptr++] = Z + nz * off;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    p.lastOpen = openAmt;
  }

  function paintPetal(geo, t) {
    const nU = geo.userData.nU;
    const nV = geo.userData.nV;
    const col = geo.attributes.color.array;
    const c = new THREE.Color();
    const hueJit = rand(-0.01, 0.01);
    const depth = lerp(0.55, 1.0, Math.pow(t, 0.7));
    let k = 0;
    for (let j = 0; j <= nV; j++) {
      const v = j / nV;
      for (let i = 0; i <= nU; i++) {
        const xr = i / nU;
        const ax = Math.abs(xr * 2 - 1);
        c.copy(PAL.petalBase).lerp(PAL.petalMid, smooth(0.0, 0.45, v));
        c.lerp(PAL.petalTip, smooth(0.45, 1.0, v) * (1 - ax * 0.7) * 0.6);
        c.lerp(PAL.petalEdge, smooth(0.72, 1.0, ax) * 0.45 + smooth(0.92, 1.0, v) * 0.2);
        c.offsetHSL(hueJit, 0, 0);
        const vein = 1 + Math.sin((xr - 0.5) * 38) * 0.025 * v;
        col[k++] = c.r * depth * vein;
        col[k++] = c.g * depth * vein;
        col[k++] = c.b * depth * vein;
      }
    }
    geo.attributes.color.needsUpdate = true;
  }

  function updateSepal(s, e) {
    const geo = s.mesh.geometry;
    const nU = geo.userData.nU;
    const nV = geo.userData.nV;
    const pos = geo.attributes.position.array;
    const a0 = lerp(0.62, 1.7, e);
    const bend = lerp(-0.5, 1.35, e);
    const ds = s.len / nV;
    let y = 0;
    let z = 0;
    let k = 0;
    for (let j = 0; j <= nV; j++) {
      const v = j / nV;
      const ang = a0 + bend * v;
      const ny = -Math.sin(ang);
      const nz = Math.cos(ang);
      const half = s.w * 0.5 * Math.pow(1 - v, 0.85) * (0.55 + 0.45 * smooth(0, 0.18, v));
      for (let i = 0; i <= nU; i++) {
        const xn = (i / nU) * 2 - 1;
        const off = -xn * xn * half * 0.5;
        pos[k++] = xn * half;
        pos[k++] = y + ny * off;
        pos[k++] = z + nz * off;
      }
      y += Math.cos(ang) * ds;
      z += Math.sin(ang) * ds;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }

  function updateLeaflet(geo, L, W, e) {
    const nU = geo.userData.nU;
    const nV = geo.userData.nV;
    const pos = geo.attributes.position.array;
    const fold = lerp(1.4, 0.2, e);
    const wS = lerp(0.32, 1, e);
    const droop = 0.3 * e;
    let k = 0;
    for (let j = 0; j <= nV; j++) {
      const v = j / nV;
      const base = Math.pow(Math.sin(Math.PI * v), 0.8) * (1 - 0.2 * v);
      const serr = v > 0.12 && v < 0.95 ? 1 + 0.08 * (Math.abs(Math.sin(v * Math.PI * 10)) - 0.5) : 1;
      const half = 0.5 * W * base * serr * wS;
      const yy = v * L * lerp(0.85, 1, e);
      for (let i = 0; i <= nU; i++) {
        const xn = (i / nU) * 2 - 1;
        const x = xn * half;
        const zz = Math.abs(x) * fold - droop * v * v * L + Math.sin(xn * 2.5 + v * 9) * 0.008 * e;
        pos[k++] = x;
        pos[k++] = yy;
        pos[k++] = zz;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }

  function paintLeaf(geo) {
    const nU = geo.userData.nU;
    const nV = geo.userData.nV;
    const col = geo.attributes.color.array;
    const c = new THREE.Color();
    let k = 0;
    for (let j = 0; j <= nV; j++) {
      const v = j / nV;
      for (let i = 0; i <= nU; i++) {
        const ax = Math.abs((i / nU) * 2 - 1);
        c.copy(PAL.leafMid).lerp(PAL.leafEdge, smooth(0.45, 1, ax) * 0.8);
        c.lerp(PAL.leafVein, (1 - smooth(0, 0.14, ax)) * 0.6 * (1 - v * 0.5));
        const lat = Math.pow(Math.abs(Math.sin((v * 7 - ax * 1.5) * Math.PI)), 12) * (1 - ax) * 0.3;
        c.lerp(PAL.leafVein, lat);
        c.lerp(PAL.leafBase, (1 - smooth(0, 0.25, v)) * 0.5);
        col[k++] = c.r;
        col[k++] = c.g;
        col[k++] = c.b;
      }
    }
    geo.attributes.color.needsUpdate = true;
  }

  function buildLoosePetalGeometry() {
    const geo = makeGridGeometry(6, 8);
    const pos = geo.attributes.position.array;
    let k = 0;
    for (let j = 0; j <= 8; j++) {
      const v = j / 8;
      const half = 0.5 * 0.34 * petalWidth(v);
      for (let i = 0; i <= 6; i++) {
        const xn = (i / 6) * 2 - 1;
        pos[k++] = xn * half;
        pos[k++] = v * 0.42 - 0.21;
        pos[k++] = -xn * xn * half * 0.6 + Math.sin(v * Math.PI) * 0.03 + v * v * 0.05;
      }
    }
    geo.deleteAttribute('color');
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  /* ------------------------------------------------------------------------
     8. RENDERER / SCENE / LIGHTS
     ------------------------------------------------------------------------ */
  function makeError(msg) {
    const e = new Error(msg);
    e.userMessage = msg;
    return e;
  }

  function webglAvailable() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  function initRenderer() {
    renderer = new THREE.WebGLRenderer({
      canvas: DOM.canvas,
      antialias: profile.tier < 2,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance'
    });
    pixelRatio = Math.min(window.devicePixelRatio || 1, LEVELS[profile.startLevel].pixelRatio);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(0x030407, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  function initScene() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030407, 0.03);
    camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 400);
    clock = new THREE.Clock();
    raycaster = new THREE.Raycaster();
    plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

    V = {
      up: new THREE.Vector3(0, 1, 0),
      tmp: new THREE.Vector3(),
      tmp2: new THREE.Vector3(),
      tmp3: new THREE.Vector3(),
      center: new THREE.Vector3(0, 0.38, 0),
      dir: new THREE.Vector3(),
      look: new THREE.Vector3(),
      mouse: new THREE.Vector3(0, 0, -100),
      proj: new THREE.Vector3(),
      ndc: new THREE.Vector2()
    };

    PAL = {
      petalBase: new THREE.Color(0x2a0106),
      petalMid: new THREE.Color(0x9a0a1e),
      petalTip: new THREE.Color(0xd8213a),
      petalEdge: new THREE.Color(0x3c0209),
      leafBase: new THREE.Color(0x163614),
      leafMid: new THREE.Color(0x2b5a22),
      leafEdge: new THREE.Color(0x0b1f0b),
      leafVein: new THREE.Color(0x5d8a3a),
      ruby: new THREE.Color(1.0, 0.1, 0.18),
      rubyDeep: new THREE.Color(0.62, 0.02, 0.07),
      gold: new THREE.Color(1.0, 0.74, 0.38),
      champagne: new THREE.Color(1.0, 0.88, 0.7)
    };

    // Cinematic lighting rig
    lightHemi = new THREE.HemisphereLight(0x6b2434, 0x050307, 0.45);
    scene.add(lightHemi);
    lightAmbient = new THREE.AmbientLight(0x1a0a10, 0.6);
    scene.add(lightAmbient);

    keyLight = new THREE.DirectionalLight(0xffe0bd, 2.3);
    keyLight.position.set(3.2, 6.5, 4.8);
    keyLight.castShadow = LEVELS[profile.startLevel].shadows;
    keyLight.shadow.mapSize.set(profile.shadowMap, profile.shadowMap);
    keyLight.shadow.camera.left = -2.6;
    keyLight.shadow.camera.right = 2.6;
    keyLight.shadow.camera.top = 2.6;
    keyLight.shadow.camera.bottom = -2.6;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 22;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);
    scene.add(keyLight.target);

    lightRimRed = new THREE.DirectionalLight(0xff1e3c, 2.0);
    lightRimRed.position.set(-4.5, 2.5, -5.5);
    scene.add(lightRimRed);

    lightRimGold = new THREE.DirectionalLight(0xd6b26e, 0.9);
    lightRimGold.position.set(5, 1.2, -4);
    scene.add(lightRimGold);

    lightFill = new THREE.DirectionalLight(0x5566aa, 0.35);
    lightFill.position.set(-5, -1, 3);
    scene.add(lightFill);

    innerLight = new THREE.PointLight(0xff3a50, 0, 4.5, 2);
    scene.add(innerLight);
  }

  /* ------------------------------------------------------------------------
     9. ATMOSPHERE — background, stars, dust, glow, god rays, beams
     ------------------------------------------------------------------------ */
  function buildBackground() {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0.3 },
        uRed: { value: new THREE.Color(0.55, 0.03, 0.08) },
        uGold: { value: new THREE.Color(0.9, 0.65, 0.35) },
        uFocusDir: { value: new THREE.Vector3(0, 0, -1) }
      },
      vertexShader: BG_VERT,
      fragmentShader: BG_FRAG,
      side: THREE.BackSide,
      depthWrite: false
    });
    bg = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 32), mat);
    bg.renderOrder = -10;
    bg.frustumCulled = false;
    scene.add(bg);
  }

  function buildStars() {
    const n = profile.stars;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const phase = new Float32Array(n);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * TAU;
      const s = Math.sqrt(1 - u * u);
      const r = rand(60, 110);
      pos[i * 3] = s * Math.cos(th) * r;
      pos[i * 3 + 1] = u * r;
      pos[i * 3 + 2] = s * Math.sin(th) * r;
      size[i] = Math.random() < 0.04 ? rand(2.4, 3.6) : rand(0.6, 1.8);
      phase[i] = Math.random();
      const pick = Math.random();
      const b = rand(0.5, 1.0);
      if (pick < 0.65) { col[i * 3] = b; col[i * 3 + 1] = 0.95 * b; col[i * 3 + 2] = 0.9 * b; }
      else if (pick < 0.88) { col[i * 3] = b; col[i * 3 + 1] = 0.8 * b; col[i * 3 + 2] = 0.55 * b; }
      else { col[i * 3] = b; col[i * 3 + 1] = 0.45 * b; col[i * 3 + 2] = 0.5 * b; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const mat = pointsMaterial(STAR_VERT, { uTime: { value: 0 }, uAlpha: { value: 0 }, uSize: { value: 1 } }, 1);
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    stars = { points: points, mat: mat, count: n };
  }

  function buildDust() {
    const n = profile.dust;
    const pos = new Float32Array(n * 3);
    const rnd = new Float32Array(n * 4);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(Math.random()) * 7.5 + 0.3;
      const a = Math.random() * TAU;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = rand(-6, 6);
      pos[i * 3 + 2] = Math.sin(a) * r;
      for (let k = 0; k < 4; k++) rnd[i * 4 + k] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const mat = pointsMaterial(DUST_VERT, {
      uTime: { value: 0 },
      uSize: { value: 2.6 },
      uAlpha: { value: 0 },
      uFocus: { value: 8 },
      uMouse: { value: V.mouse },
      uMouseStrength: { value: 0 }
    }, 2.6);
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    dust = { points: points, mat: mat, count: n, col: col };
  }

  function buildLightFX() {
    const quad = new THREE.PlaneGeometry(1, 1);

    const glowMat = new THREE.ShaderMaterial({
      uniforms: {
        uIntensity: { value: 0 },
        uColorA: { value: new THREE.Color(0.75, 0.04, 0.1) },
        uColorB: { value: new THREE.Color(1.0, 0.78, 0.5) }
      },
      vertexShader: BILLBOARD_VERT,
      fragmentShader: GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    glow = new THREE.Mesh(quad, glowMat);
    glow.frustumCulled = false;
    glow.renderOrder = 2;
    scene.add(glow);

    const raysMat = new THREE.ShaderMaterial({
      uniforms: {
        uIntensity: { value: 0 },
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color(0.55, 0.03, 0.08) },
        uColorB: { value: new THREE.Color(1.0, 0.8, 0.55) }
      },
      vertexShader: BILLBOARD_VERT,
      fragmentShader: RAYS_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    rays = new THREE.Mesh(quad, raysMat);
    rays.frustumCulled = false;
    rays.renderOrder = 1;
    scene.add(rays);

    const group = new THREE.Group();
    const mats = [];
    const defs = [
      { r: 2.6, h: 12, x: 0.3, z: -0.2, rz: 0.1, c: new THREE.Color(1.0, 0.82, 0.55) },
      { r: 3.4, h: 13, x: -0.5, z: 0.3, rz: -0.14, c: new THREE.Color(0.9, 0.12, 0.2) },
      { r: 1.8, h: 11, x: 0.1, z: 0.5, rz: 0.05, c: new THREE.Color(1.0, 0.9, 0.75) }
    ];
    defs.forEach((d) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uIntensity: { value: 0 }, uTime: { value: 0 }, uColor: { value: d.c } },
        vertexShader: BEAM_VERT,
        fragmentShader: BEAM_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(d.r, d.h, 48, 1, true), mat);
      mesh.position.set(d.x, -2.6 + d.h / 2, d.z);
      mesh.rotation.z = d.rz;
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      group.add(mesh);
      mats.push(mat);
    });
    scene.add(group);
    beams = { group: group, mats: mats };
  }

  /* ------------------------------------------------------------------------
     10. THE ROSE
     ------------------------------------------------------------------------ */
  const LEAF_DEFS = [
    { u: 0.30, az: 0.7, size: 1.15, tilt: 1.05, key: 'leaf0' },
    { u: 0.50, az: 3.1, size: 1.0, tilt: 0.95, key: 'leaf1' },
    { u: 0.68, az: 5.0, size: 0.85, tilt: 0.9, key: 'leaf2' }
  ];
  const THORN_US = [0.1, 0.17, 0.25, 0.36, 0.44, 0.57, 0.63, 0.76, 0.84];

  function buildRose() {
    const root = new THREE.Group();
    scene.add(root);
    rose.root = root;

    // Shared materials — one of each so luxe patches reach every plant
    const mats = {};
    mats.stem = new THREE.MeshStandardMaterial({ color: 0x1b3a17, roughness: 0.58, metalness: 0.04 });
    rim.stem = addRim(mats.stem, 0xd6b26e, 0.16, 3.0);
    mats.sepal = new THREE.MeshStandardMaterial({ color: 0x1f4219, roughness: 0.66, side: THREE.DoubleSide });
    rim.sepal = addRim(mats.sepal, 0xd6b26e, 0.12, 3.0);
    mats.leaf = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, metalness: 0.0, side: THREE.DoubleSide });
    rim.leaf = addRim(mats.leaf, 0xe8c27a, 0.14, 2.8);
    mats.petal = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.46, metalness: 0.0, side: THREE.DoubleSide,
      emissive: 0x1a0005, emissiveIntensity: 1
    });
    rim.petal = addRim(mats.petal, 0xff3a52, 0.32, 2.4);
    mats.thorn = new THREE.MeshStandardMaterial({ color: 0x4a2e17, roughness: 0.5 });
    mats.rec = new THREE.MeshStandardMaterial({ color: 0x23461c, roughness: 0.55 });
    rose.mats = mats;

    const shadows = profile.tier < 2;

    // Hero rose at the centre, then a ring of companions fanning outward
    makePlant(0, 0, mats, shadows, root);

    const extra = [4, 3, 2][profile.tier];
    const baseA = rand(0, TAU);
    for (let i = 0; i < extra; i++) {
      const a = baseA + (i / extra) * TAU + rand(-0.22, 0.22);
      makePlant(i + 1, a, mats, shadows, root);
    }

    // Aggregate targets across the whole bouquet for hover / click / luxe
    rose.leafMeshes = [];
    rose.headTargets = [];
    rose.clickTargets = [];
    rose.plants.forEach((P) => {
      P.petals.forEach((pt) => rose.petals.push(pt));
      P.leafMeshes.forEach((m) => rose.leafMeshes.push(m));
      P.headTargets.forEach((m) => rose.headTargets.push(m));
      P.clickTargets.forEach((m) => rose.clickTargets.push(m));
    });
  }

  function makePlantCurve(tip) {
    // Stems share a base and fan out toward each bloom
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.0, -4.8, 0.0),
      new THREE.Vector3(tip.x * 0.1 + rand(-0.05, 0.05), -3.7, tip.z * 0.1 + rand(-0.05, 0.05)),
      new THREE.Vector3(tip.x * 0.26 + rand(-0.06, 0.06), -2.55, tip.z * 0.26 + rand(-0.06, 0.06)),
      new THREE.Vector3(tip.x * 0.56, -1.35, tip.z * 0.56),
      new THREE.Vector3(tip.x * 0.86, -0.5, tip.z * 0.86),
      new THREE.Vector3(tip.x, tip.y, tip.z)
    ], false, 'catmullrom', 0.5);
  }

  function makePlant(i, angle, mats, shadows, root) {
    const isHero = i === 0;
    const node = new THREE.Group();
    const P = {
      index: i, hero: isHero, node: node, curve: null, stemMesh: null,
      stemSegments: isHero ? 160 : 90, stemIndicesPerSeg: 0,
      petals: [], sepals: [], leaves: [], thorns: [], leafMeshes: [],
      headTargets: [], clickTargets: [],
      delay: { g: 0.06 + 0.055 * i, b: 0.1 + 0.075 * i },
      seedT: rand(0, TAU), scale: 1,
      lastGrowth: -1, lastSepal: -1
    };
    rose.plants.push(P);

    if (isHero) {
      P.curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.0, -4.8, 0.0),
        new THREE.Vector3(0.14, -3.7, 0.06),
        new THREE.Vector3(-0.1, -2.55, -0.05),
        new THREE.Vector3(0.08, -1.35, 0.05),
        new THREE.Vector3(0.03, -0.5, 0.0),
        new THREE.Vector3(0.0, 0.0, 0.0)
      ], false, 'catmullrom', 0.5);
    } else {
      P.scale = rand(0.55, 0.78);
      node.scale.setScalar(P.scale);
      const rad = rand(0.85, 1.3);
      P.curve = makePlantCurve(new THREE.Vector3(
        Math.cos(angle) * rad, rand(-0.35, 0.15), Math.sin(angle) * rad));
    }

    // Stem — tapered tube revealed by draw range
    const radial = 10;
    const stemGeo = new THREE.TubeGeometry(P.curve, P.stemSegments, 0.055, radial, false);
    const sp = stemGeo.attributes.position;
    const c = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let j = 0; j <= P.stemSegments; j++) {
      const u = j / P.stemSegments;
      P.curve.getPointAt(u, c);
      const taper = lerp(1.25, 0.8, u) * (1 + 0.7 * smooth(0.94, 1, u));
      for (let k = 0; k <= radial; k++) {
        const idx = j * (radial + 1) + k;
        p.fromBufferAttribute(sp, idx).sub(c).multiplyScalar(taper).add(c);
        sp.setXYZ(idx, p.x, p.y, p.z);
      }
    }
    sp.needsUpdate = true;
    stemGeo.computeBoundingSphere();
    P.stemIndicesPerSeg = radial * 6;
    P.stemMesh = new THREE.Mesh(stemGeo, mats.stem);
    P.stemMesh.castShadow = shadows;
    P.stemMesh.receiveShadow = shadows;
    stemGeo.setDrawRange(0, 0);
    node.add(P.stemMesh);

    // Thorns
    const thornGeo = new THREE.ConeGeometry(0.028, 0.14, 6);
    thornGeo.translate(0, 0.07, 0);
    const thornUs = isHero ? THORN_US : THORN_US.slice(2, 7);
    thornUs.forEach((u, n) => {
      const a = n * 2.4 + 0.5 + P.seedT;
      const mesh = new THREE.Mesh(thornGeo, mats.thorn);
      P.curve.getPointAt(u, mesh.position);
      mesh.position.x += Math.cos(a) * 0.045;
      mesh.position.z += Math.sin(a) * 0.045;
      const dir = new THREE.Vector3(Math.cos(a), -0.35, Math.sin(a)).normalize();
      mesh.quaternion.setFromUnitVectors(V.up, dir);
      mesh.scale.setScalar(0.0001);
      node.add(mesh);
      P.thorns.push({ mesh: mesh, u: u });
    });

    // Leaves — compound rose leaves with 5 leaflets each
    const leafDefs = isHero ? LEAF_DEFS : LEAF_DEFS.slice(0, 2);
    leafDefs.forEach((d) => {
      const node2 = new THREE.Group();
      P.curve.getPointAt(d.u, node2.position);
      node2.rotation.y = d.az;
      const pivot = new THREE.Group();
      node2.add(pivot);
      const rachisLen = 0.62;
      const rachis = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, rachisLen, 5), mats.stem);
      rachis.position.y = rachisLen / 2;
      pivot.add(rachis);
      const leaflets = [];
      const addLeaflet = (y, rx, L, W) => {
        const holder = new THREE.Group();
        holder.position.y = y;
        holder.rotation.x = rx;
        pivot.add(holder);
        const geo = makeGridGeometry(profile.leafU, profile.leafV);
        paintLeaf(geo);
        const mesh = new THREE.Mesh(geo, mats.leaf);
        mesh.rotation.y = -Math.PI / 2;
        mesh.castShadow = shadows;
        mesh.receiveShadow = shadows;
        holder.add(mesh);
        leaflets.push({ mesh: mesh, L: L, W: W });
        P.leafMeshes.push(mesh);
        updateLeaflet(geo, L, W, 0);
      };
      addLeaflet(rachisLen - 0.02, 0, 0.62, 0.36);
      addLeaflet(rachisLen * 0.55, 0.95, 0.48, 0.28);
      addLeaflet(rachisLen * 0.55, -0.95, 0.48, 0.28);
      addLeaflet(rachisLen * 0.18, 1.15, 0.34, 0.2);
      addLeaflet(rachisLen * 0.18, -1.15, 0.34, 0.2);
      node2.visible = false;
      node.add(node2);
      P.leaves.push({ node: node2, pivot: pivot, leaflets: leaflets, def: d, last: -1, phase: Math.random() * TAU });
    });

    // Head
    const head = new THREE.Group();
    node.add(head);
    P.head = head;

    const rec = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), mats.rec);
    rec.scale.set(1, 0.72, 1);
    rec.position.y = -0.07;
    rec.castShadow = shadows;
    head.add(rec);
    P.receptacle = rec;

    for (let q = 0; q < 5; q++) {
      const phi = (q / 5) * TAU + 0.3 + P.seedT;
      const geo = makeGridGeometry(4, 10);
      const mesh = new THREE.Mesh(geo, mats.sepal);
      mesh.position.set(Math.sin(phi) * 0.13, -0.06, Math.cos(phi) * 0.13);
      mesh.rotation.y = phi;
      mesh.castShadow = shadows;
      head.add(mesh);
      const s = { mesh: mesh, len: rand(0.56, 0.66), w: rand(0.14, 0.18) };
      updateSepal(s, 0);
      P.sepals.push(s);
    }

    const N = isHero ? [30, 26, 20][profile.tier] : [16, 13, 10][profile.tier];
    const pu = isHero ? profile.petalU : Math.max(6, profile.petalU - 3);
    const pv = isHero ? profile.petalV : Math.max(9, profile.petalV - 5);
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1);
      const def = makePetalDef(t);
      const geo = makeGridGeometry(pu, pv);
      paintPetal(geo, t);
      const mesh = new THREE.Mesh(geo, mats.petal);
      mesh.rotation.y = k * GOLDEN_ANGLE + (isHero ? rand(-0.08, 0.08) : P.seedT + rand(-0.08, 0.08));
      mesh.position.y = -0.03 * t;
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      head.add(mesh);
      const petal = { mesh: mesh, def: def, lastOpen: -1 };
      updatePetal(petal, 0);
      P.petals.push(petal);
    }

    P.centerLocal = new THREE.Vector3(0, 0.38, 0);
    P.headBaseQuat = new THREE.Quaternion();
    P.headTargets = P.petals.map((pt) => pt.mesh).concat([rec]);
    P.clickTargets = P.headTargets
      .concat(P.sepals.map((s) => s.mesh))
      .concat([P.stemMesh])
      .concat(P.leafMeshes);

    if (isHero) {
      rose.head = head;
      rose.curve = P.curve;
      rose.stemMesh = P.stemMesh;
      rose.stemSegments = P.stemSegments;
      rose.stemIndicesPerSeg = P.stemIndicesPerSeg;
      rose.centerLocal = P.centerLocal;
      rose.headBaseQuat = P.headBaseQuat;
      rose.receptacle = rec;
      rose.finalCenter = P.centerLocal.clone();
    }

    root.add(node);
    return P;
  }

  function resetRoseCache() {
    rose.plants.forEach((P) => {
      P.lastGrowth = -1;
      P.lastSepal = -1;
      P.petals.forEach((p) => { p.lastOpen = -1; });
      P.leaves.forEach((l) => { l.last = -1; });
    });
  }

  function updateRose(s, time) {
    rose.plants.forEach((P) => {
      const ps = {};
      if (P.hero) {
        ps.growth = s.growth;
        ps.budScale = s.budScale;
        ps.bloom = s.bloom;
        ps.sepal = s.sepal;
      } else {
        ps.growth = smooth(P.delay.g, 1, s.growth);
        ps.budScale = smooth(P.delay.b, 1, s.budScale);
        ps.bloom = smooth(P.delay.b, 1, s.bloom);
        ps.sepal = smooth(P.delay.b, 1, s.sepal);
      }
      updatePlant(P, ps, s, time);
    });
  }

  function updatePlant(P, ps, s, time) {
    const g = ps.growth;

    if (Math.abs(g - P.lastGrowth) > 0.00005) {
      const segs = Math.floor(g * P.stemSegments);
      P.stemMesh.geometry.setDrawRange(0, segs * P.stemIndicesPerSeg);
      P.stemMesh.visible = segs > 0;
      P.lastGrowth = g;
    }

    // Head rides the growing tip
    const u = clamp(g, 0.0001, 1);
    P.curve.getPointAt(u, V.tmp);
    P.curve.getTangentAt(u, V.tmp2);
    P.head.position.copy(V.tmp);
    P.head.quaternion.setFromUnitVectors(V.up, V.tmp2.normalize());
    P.headBaseQuat.copy(P.head.quaternion);
    if (fx.pulse > 0.001) P.head.rotateZ(Math.sin(time * 22 + P.seedT) * fx.pulse * 0.025);
    if (s.eternal > 0) P.head.rotateX(Math.sin(time * 0.5 + P.seedT) * 0.02 * s.eternal);
    const sc = ps.budScale * (1 + fx.pulse * 0.05 + fx.hover * 0.015);
    P.head.visible = ps.budScale > 0.002;
    P.head.scale.setScalar(Math.max(sc, 0.0001));

    // Sepals peel back
    if (Math.abs(ps.sepal - P.lastSepal) > 0.0005) {
      const e = easeInOutSine(clamp(ps.sepal, 0, 1));
      P.sepals.forEach((sp) => updateSepal(sp, e));
      P.lastSepal = ps.sepal;
    }

    // Petals unfold layer by layer (outer first)
    const breathe = profile.tier === 0 && perf.level <= 1 ? s.eternal : 0;
    for (let k = 0; k < P.petals.length; k++) {
      const p = P.petals[k];
      const st = (1 - p.def.t) * 0.5;
      let o = easeInOutSine(smooth(st, st + 0.5, ps.bloom));
      o += breathe * Math.sin(time * 0.7 + P.seedT + k * 0.9) * 0.012;
      o += fx.pulse * 0.06 * ps.bloom;
      if (Math.abs(o - p.lastOpen) > 0.0008) updatePetal(p, o);
    }

    // Leaves unfold once the stem passes them
    for (let k = 0; k < P.leaves.length; k++) {
      const leaf = P.leaves[k];
      const d = leaf.def;
      const un = Math.min(s[d.key], smooth(d.u - 0.02, d.u + 0.08, g));
      leaf.node.visible = un > 0.001;
      if (!leaf.node.visible) continue;
      const e = easeOutCubic(clamp(un, 0, 1));
      leaf.node.scale.setScalar(Math.max(0.0001, e * d.size));
      leaf.pivot.rotation.z = -lerp(0.12, d.tilt, e) + Math.sin(time * 1.1 + leaf.phase) * 0.035 * e + par.x * 0.03 * e;
      leaf.pivot.rotation.x = Math.sin(time * 0.8 + leaf.phase * 1.7) * 0.05 * e;
      if (Math.abs(un - leaf.last) > 0.001) {
        leaf.leaflets.forEach((l) => updateLeaflet(l.mesh.geometry, l.L, l.W, e));
        leaf.last = un;
      }
    }

    for (let k = 0; k < P.thorns.length; k++) {
      const th = P.thorns[k];
      const ts = smooth(th.u - 0.01, th.u + 0.05, g);
      th.mesh.visible = ts > 0.001;
      th.mesh.scale.setScalar(Math.max(0.0001, ts));
    }
  }

  /* ------------------------------------------------------------------------
     11. PARTICLE BIRTH — particles sampled from the fully bloomed rose
     ------------------------------------------------------------------------ */
  const SA = { a: null, b: null, c: null };

  function sampleMeshes(meshes, weights, n, out, offset) {
    if (!SA.a) { SA.a = new THREE.Vector3(); SA.b = new THREE.Vector3(); SA.c = new THREE.Vector3(); }
    const cum = [];
    let total = 0;
    for (let i = 0; i < weights.length; i++) { total += weights[i]; cum.push(total); }
    for (let k = 0; k < n; k++) {
      const r = Math.random() * total;
      let m = 0;
      while (m < cum.length - 1 && cum[m] < r) m++;
      const mesh = meshes[m];
      const geo = mesh.geometry;
      const posA = geo.attributes.position;
      const idx = geo.index.array;
      const tri = Math.floor(Math.random() * (idx.length / 3)) * 3;
      SA.a.fromBufferAttribute(posA, idx[tri]);
      SA.b.fromBufferAttribute(posA, idx[tri + 1]).sub(SA.a);
      SA.c.fromBufferAttribute(posA, idx[tri + 2]).sub(SA.a);
      let r1 = Math.random();
      let r2 = Math.random();
      if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
      V.tmp.copy(SA.a).addScaledVector(SA.b, r1).addScaledVector(SA.c, r2).applyMatrix4(mesh.matrixWorld);
      const o = (offset + k) * 3;
      out[o] = V.tmp.x;
      out[o + 1] = V.tmp.y;
      out[o + 2] = V.tmp.z;
    }
  }

  function buildBirth() {
    const full = Object.assign({}, INITIAL_STATE, { growth: 1, budScale: 1, leaf0: 1, leaf1: 1, leaf2: 1, sepal: 1, bloom: 1 });
    resetRoseCache();
    updateRose(full, 0);
    rose.root.updateMatrixWorld(true);
    rose.finalCenter = new THREE.Vector3();
    rose.plants.forEach((P) => {
      rose.finalCenter.add(P.head.localToWorld(P.centerLocal.clone()));
    });
    rose.finalCenter.multiplyScalar(1 / rose.plants.length);

    const count = profile.birth;
    const target = new Float32Array(count * 3);
    const start = new Float32Array(count * 3);
    const rnd = new Float32Array(count * 4);
    const col = new Float32Array(count * 3);

    const nP = Math.floor(count * 0.62);
    const nS = Math.floor(count * 0.2);
    const nL = count - nP - nS;
    const petalMeshes = [];
    const petalWeights = [];
    const leafM = [];
    const leafW = [];
    const stemM = [];
    const stemW = [];
    rose.plants.forEach((P) => {
      const w = P.hero ? 1 : P.scale * P.scale;
      P.petals.forEach((p) => {
        petalMeshes.push(p.mesh);
        petalWeights.push(p.def.L * p.def.W * (P.hero ? 2.2 : P.scale * P.scale));
      });
      P.leafMeshes.forEach((m) => { leafM.push(m); leafW.push(w); });
      stemM.push(P.stemMesh);
      stemW.push(w);
    });
    sampleMeshes(petalMeshes, petalWeights, nP, target, 0);
    sampleMeshes(stemM, stemW, nS, target, nP);
    sampleMeshes(leafM, leafW, nL, target, nP + nS);

    // Particle color categories — 0 petal, 1 stem, 2 leaf (painted by paintParticleCols)
    const cat = new Uint8Array(count);
    for (let i = nP; i < count; i++) cat[i] = i < nP + nS ? 1 : 2;

    // Shuffle so draw-range reduction thins every part evenly
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      for (let k = 0; k < 3; k++) {
        let t = target[i * 3 + k]; target[i * 3 + k] = target[j * 3 + k]; target[j * 3 + k] = t;
        t = col[i * 3 + k]; col[i * 3 + k] = col[j * 3 + k]; col[j * 3 + k] = t;
      }
      const c = cat[i]; cat[i] = cat[j]; cat[j] = c;
    }

    for (let i = 0; i < count; i++) {
      const r = rand(7, 16);
      const a = Math.random() * TAU;
      start[i * 3] = Math.cos(a) * r;
      start[i * 3 + 1] = rand(-7, 6) - 1.5;
      start[i * 3 + 2] = Math.sin(a) * r;
      for (let k = 0; k < 4; k++) rnd[i * 4 + k] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(target, 3));
    geo.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const mat = pointsMaterial(BIRTH_VERT, {
      uProgress: { value: 0 },
      uDissolve: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: 2.2 },
      uAlpha: { value: 0 },
      uFocus: { value: 12 },
      uMouse: { value: V.mouse },
      uMouseStrength: { value: 0 }
    }, 2.2);
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    birth = { points: points, mat: mat, count: count, col: col, cat: cat };

    // Restore the rose to its unborn state
    resetRoseCache();
    updateRose(state, 0);
  }

  /* ------------------------------------------------------------------------
     12. FLOATING PETALS
     ------------------------------------------------------------------------ */
  function buildFloating() {
    const n = profile.floatPetals;
    const geo = buildLoosePetalGeometry();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9a0c20, roughness: 0.5, metalness: 0, side: THREE.DoubleSide, emissive: 0x220006
    });
    rim.float = addRim(mat, 0xff4a60, 0.45, 2.2);
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.visible = false;
    const data = [];
    for (let i = 0; i < n; i++) {
      data.push({
        radius: rand(1.6, 4.8), angle: rand(0, TAU), speed: rand(0.06, 0.2),
        y: rand(-2.8, 3.2), rise: rand(0.06, 0.18), bob: rand(0.4, 1.1), phase: rand(0, TAU),
        rx: rand(0.2, 0.9), ry: rand(0.1, 0.6), rz: rand(0.2, 0.8), scale: rand(0.6, 1.25),
        storm: 0, spread: 0, stormR: 0
      });
    }
    scene.add(mesh);
    floating = { mesh: mesh, data: data, dummy: new THREE.Object3D() };
  }

  function updateFloating(dt, time) {
    let storming = false;
    for (let i = 0; i < floating.data.length; i++) {
      if (floating.data[i].storm > 0) { storming = true; break; }
    }
    const k = Math.max(state.floatPetals, storming ? 0.85 : 0);
    floating.mesh.visible = k > 0.001;
    if (!floating.mesh.visible) return;
    const dm = floating.dummy;
    const push = fx.pulse * 1.0;
    for (let i = 0; i < floating.data.length; i++) {
      const d = floating.data[i];
      let r;
      let kk = k;
      if (d.storm > 0) {
        // Storm petals whip around the heart, spiralling outward as they fall
        d.storm -= dt;
        d.angle += d.speed * dt;
        d.y += d.rise * dt;
        d.stormR += d.spread * dt;
        if (d.storm <= 0) {
          d.radius = clamp(d.stormR, 1.6, 4.8);
          d.speed = rand(0.06, 0.2);
          d.rise = rand(0.06, 0.18);
          if (d.y < -2.6) d.y = rand(-2.4, 1.4);
        }
        r = d.stormR + push;
        kk = Math.max(k, 0.85);
      } else {
        d.angle += d.speed * dt;
        d.y += d.rise * dt;
        if (d.y > 3.2) d.y = -2.8;
        r = d.radius + push;
      }
      const fade = smooth(-2.8, -2.0, d.y) * (1 - smooth(2.4, 3.2, d.y));
      dm.position.set(Math.cos(d.angle) * r, d.y + 0.3 + Math.sin(time * d.bob + d.phase) * 0.15, Math.sin(d.angle) * r);
      dm.rotation.set(time * d.rx + d.phase, time * d.ry, time * d.rz);
      dm.scale.setScalar(Math.max(0.0001, d.scale * kk * fade));
      dm.updateMatrix();
      floating.mesh.setMatrixAt(i, dm.matrix);
    }
    floating.mesh.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------------------
     13. EXPLOSION PARTICLES & ENERGY RINGS
     ------------------------------------------------------------------------ */
  let burst = null;
  let ringGeo = null;
  const rings = [];

  function buildExplosion() {
    const cap = profile.explosion * 2;
    const pos = new Float32Array(cap * 3);
    const alpha = new Float32Array(cap);
    const size = new Float32Array(cap);
    const color = new Float32Array(cap * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = pointsMaterial(BURST_VERT, { uSize: { value: 3.2 } }, 3.2);
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = 6;
    scene.add(points);
    burst = {
      points: points, cap: cap, pos: pos, alpha: alpha, size: size, color: color,
      vel: new Float32Array(cap * 3), life: new Float32Array(cap), max: new Float32Array(cap),
      cursor: 0, alive: 0
    };
    ringGeo = new THREE.PlaneGeometry(1, 1);
  }

  function spawnBurst(origin, n, kind, speedMul) {
    if (!burst) return;
    const count = Math.min(burst.cap, Math.floor(n * LEVELS[perf.level].particleFrac));
    const sm = speedMul || 1;
    for (let k = 0; k < count; k++) {
      const i = burst.cursor;
      burst.cursor = (i + 1) % burst.cap;
      const u = Math.random() * 2 - 1;
      const th = Math.random() * TAU;
      const s = Math.sqrt(1 - u * u);
      const sp = rand(1.4, 5.2) * sm * (0.35 + Math.random() * 0.65);
      const dx = s * Math.cos(th);
      const dy = u;
      const dz = s * Math.sin(th);
      const j = Math.random() * 0.15;
      burst.pos[i * 3] = origin.x + dx * j;
      burst.pos[i * 3 + 1] = origin.y + dy * j;
      burst.pos[i * 3 + 2] = origin.z + dz * j;
      burst.vel[i * 3] = dx * sp;
      burst.vel[i * 3 + 1] = dy * sp * 0.8 + 0.4;
      burst.vel[i * 3 + 2] = dz * sp;
      burst.life[i] = burst.max[i] = rand(1.2, 2.6);
      burst.size[i] = rand(0.5, 1.6);
      let c;
      if (kind === 'gold') c = Math.random() < 0.7 ? PAL.gold : PAL.champagne;
      else { const r = Math.random(); c = r < 0.6 ? PAL.ruby : r < 0.85 ? PAL.gold : PAL.champagne; }
      const b = rand(1.1, 1.6);
      burst.color[i * 3] = c.r * b;
      burst.color[i * 3 + 1] = c.g * b;
      burst.color[i * 3 + 2] = c.b * b;
    }
    const g = burst.points.geometry;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    burst.alive = Math.max(burst.alive, count);
  }

  function updateBurst(dt) {
    if (!burst || burst.alive <= 0) return;
    const damp = Math.exp(-dt * 1.6);
    let alive = 0;
    for (let i = 0; i < burst.cap; i++) {
      if (burst.life[i] <= 0) {
        if (burst.alpha[i] !== 0) burst.alpha[i] = 0;
        continue;
      }
      burst.life[i] -= dt;
      if (burst.life[i] <= 0) { burst.alpha[i] = 0; continue; }
      alive++;
      const o = i * 3;
      burst.vel[o] *= damp;
      burst.vel[o + 1] = burst.vel[o + 1] * damp + 0.35 * dt;
      burst.vel[o + 2] *= damp;
      burst.pos[o] += burst.vel[o] * dt;
      burst.pos[o + 1] += burst.vel[o + 1] * dt;
      burst.pos[o + 2] += burst.vel[o + 2] * dt;
      const l = burst.life[i] / burst.max[i];
      burst.alpha[i] = Math.min(1, (1 - l) * 12) * Math.pow(l, 1.3);
    }
    burst.alive = alive;
    const g = burst.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }

  function clearBurst() {
    if (!burst) return;
    burst.life.fill(0);
    burst.alpha.fill(0);
    burst.points.geometry.attributes.aAlpha.needsUpdate = true;
    burst.alive = 0;
  }

  function spawnRing(position, o) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uProgress: { value: 0 },
        uOpacity: { value: 0 },
        uThickness: { value: o.thickness || 0.035 },
        uColorA: { value: new THREE.Color(o.a) },
        uColorB: { value: new THREE.Color(o.b) }
      },
      vertexShader: BILLBOARD_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: o.depthTest !== false,
      blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.position.copy(position);
    mesh.scale.setScalar(o.from);
    mesh.quaternion.copy(camera.quaternion);
    mesh.renderOrder = 7;
    mesh.frustumCulled = false;
    scene.add(mesh);
    rings.push(mesh);
    const st = { s: o.from, p: 0 };
    mesh.userData.tween = gsap.to(st, {
      s: o.to, p: 1, duration: o.duration, delay: o.delay || 0, ease: 'expo.out',
      onUpdate: () => {
        mesh.scale.setScalar(st.s);
        mat.uniforms.uProgress.value = st.p;
        mat.uniforms.uOpacity.value = Math.min(1, st.p * 8) * Math.pow(1 - st.p, 1.3);
      },
      onComplete: () => removeRing(mesh)
    });
  }

  function removeRing(mesh) {
    const i = rings.indexOf(mesh);
    if (i >= 0) rings.splice(i, 1);
    scene.remove(mesh);
    mesh.material.dispose();
  }

  function clearRings() {
    rings.slice().forEach((m) => {
      if (m.userData.tween) m.userData.tween.kill();
      removeRing(m);
    });
  }

  /* ------------------------------------------------------------------------
     14. POST-PROCESSING & QUALITY
     ------------------------------------------------------------------------ */
  function initPost() {
    post = null;
    if (!THREE.EffectComposer || !THREE.RenderPass || !THREE.UnrealBloomPass || !THREE.ShaderPass) return;
    try {
      const composer = new THREE.EffectComposer(renderer);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(window.innerWidth, window.innerHeight);
      composer.addPass(new THREE.RenderPass(scene, camera));
      const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.62, 0.2);
      composer.addPass(bloom);
      const fin = new THREE.ShaderPass(FINAL_SHADER);
      fin.uniforms.uResolution.value = new THREE.Vector2(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio);
      fin.uniforms.uFocus.value = new THREE.Vector2(0.5, 0.55);
      composer.addPass(fin);
      post = { composer: composer, bloom: bloom, final: fin };
    } catch (err) {
      console.warn('[Eternal Rose] Post-processing disabled:', err);
      post = null;
    }
  }

  function applyLevel(lv, silent) {
    perf.level = lv;
    const L = LEVELS[lv];
    pixelRatio = Math.min(window.devicePixelRatio || 1, L.pixelRatio);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(viewport.w, viewport.h, false);
    useComposer = !!(post && L.bloom);
    if (post) {
      post.composer.setPixelRatio(pixelRatio);
      post.composer.setSize(viewport.w, viewport.h);
      post.final.uniforms.uResolution.value.set(viewport.w * pixelRatio, viewport.h * pixelRatio);
    }
    keyLight.castShadow = L.shadows && profile.tier < 2;
    pointMaterials.forEach((m) => { m.uniforms.uPixelRatio.value = pixelRatio; });
    const frac = L.particleFrac;
    if (birth) birth.points.geometry.setDrawRange(0, Math.floor(birth.count * frac));
    if (dust) dust.points.geometry.setDrawRange(0, Math.floor(dust.count * frac));
    if (stars) stars.points.geometry.setDrawRange(0, Math.floor(stars.count * Math.max(frac, 0.6)));
    if (!silent) showToast('ปรับภาพให้เล่นไหลลื่นขึ้น', 2400);
  }

  function monitor(dt) {
    if (perf.warm > 0) { perf.warm -= dt; return; }
    perf.acc += dt;
    perf.frames++;
    if (perf.acc >= 2) {
      const fps = perf.frames / perf.acc;
      perf.acc = 0;
      perf.frames = 0;
      if (fps < 42) {
        perf.lowStreak++;
        if (perf.lowStreak >= 2 && perf.level < LEVELS.length - 1) {
          applyLevel(perf.level + 1, false);
          perf.lowStreak = 0;
          perf.warm = 2;
        }
      } else {
        perf.lowStreak = 0;
      }
    }
  }

  /* ------------------------------------------------------------------------
     15. RESIZE
     ------------------------------------------------------------------------ */
  let resizeRaf = 0;
  function scheduleResize() {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(onResize);
  }

  function onResize() {
    if (!renderer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    viewport.w = w;
    viewport.h = h;
    const aspect = w / h;
    viewport.camFactor = clamp(0.82 / aspect, 1, 1.95);
    viewport.shiftY = aspect < 0.8 ? -0.34 : aspect < 1.2 ? -0.28 : -0.22;
    viewport.sizeFactor = clamp(Math.min(w, h * 1.3) / 900, 0.55, 1.35);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (post) {
      post.composer.setSize(w, h);
      post.final.uniforms.uResolution.value.set(w * pixelRatio, h * pixelRatio);
    }
    pointMaterials.forEach((m) => {
      if (m.uniforms.uSize) m.uniforms.uSize.value = m.userData.baseSize * viewport.sizeFactor;
      m.uniforms.uPixelRatio.value = pixelRatio;
    });
  }

  /* ------------------------------------------------------------------------
     16. SOUND — fully synthesised with Web Audio
     ------------------------------------------------------------------------ */
  const PHASE_CHORDS = [
    [220, 329.63, 440],
    [246.94, 369.99, 493.88],
    [261.63, 392, 523.25, 659.25],
    [220, 329.63, 440, 554.37, 659.25]
  ];

  function safe(p) { if (p && typeof p.catch === 'function') p.catch(() => {}); }

  const Sound = {
    ctx: null, master: null, dry: null, conv: null, noise: null,
    on: false, ready: false, suspendTimer: 0,

    init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        const ctx = new AC();
        this.ctx = ctx;
        const master = ctx.createGain();
        master.gain.value = 0.0001;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.ratio.value = 3;
        master.connect(comp);
        comp.connect(ctx.destination);
        const conv = ctx.createConvolver();
        conv.buffer = this.impulse(ctx, 5, 2.8);
        const wet = ctx.createGain();
        wet.gain.value = 0.75;
        conv.connect(wet);
        wet.connect(master);
        const dry = ctx.createGain();
        dry.gain.value = 0.45;
        dry.connect(master);
        this.master = master;
        this.conv = conv;
        this.dry = dry;
        this.buildPad();
        this.ready = true;
        return true;
      } catch (err) {
        console.warn('[Eternal Rose] Audio unavailable:', err);
        return false;
      }
    },

    impulse(ctx, seconds, decay) {
      const len = Math.floor(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
      return buf;
    },

    buildPad() {
      const ctx = this.ctx;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      filter.Q.value = 0.6;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 350;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();
      const padGain = ctx.createGain();
      padGain.gain.value = 0.22;
      filter.connect(padGain);
      padGain.connect(this.dry);
      padGain.connect(this.conv);
      [55, 110, 164.81, 220, 261.63, 329.63].forEach((f, i) => {
        [-1, 1].forEach((side) => {
          const o = ctx.createOscillator();
          o.type = i < 2 ? 'sine' : 'triangle';
          o.frequency.value = f;
          o.detune.value = side * (4 + i * 1.5);
          const g = ctx.createGain();
          const base = (i < 2 ? 0.18 : 0.07) / (1 + i * 0.2);
          g.gain.value = base;
          const trem = ctx.createOscillator();
          trem.frequency.value = 0.07 + i * 0.031 + (side > 0 ? 0.013 : 0);
          const tg = ctx.createGain();
          tg.gain.value = base * 0.6;
          trem.connect(tg);
          tg.connect(g.gain);
          trem.start();
          o.connect(g);
          g.connect(filter);
          o.start();
        });
      });
    },

    toggle() {
      if (!this.ready && !this.init()) {
        showToast('เบราว์เซอร์นี้ไม่รองรับเสียง');
        return;
      }
      this.on = !this.on;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      clearTimeout(this.suspendTimer);
      const gain = this.master.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(Math.max(gain.value, 0.0001), now);
      if (this.on) {
        safe(ctx.resume());
        gain.linearRampToValueAtTime(0.7, now + 2.5);
        this.chime([440, 659.25, 880], 0.08, 0.07);
      } else {
        gain.linearRampToValueAtTime(0.0001, now + 0.8);
        this.suspendTimer = setTimeout(() => { if (!this.on) safe(ctx.suspend()); }, 1000);
      }
      DOM.soundBtn.classList.toggle('is-on', this.on);
      DOM.soundBtn.setAttribute('aria-pressed', String(this.on));
      DOM.soundState.textContent = this.on ? 'เปิด' : 'ปิด';
    },

    chime(freqs, vol, stagger) {
      if (!this.on || !this.ctx) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      freqs.forEach((f, i) => {
        const t0 = now + i * (stagger || 0);
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const o2 = ctx.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = f * 2.01;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.2);
        const g2 = ctx.createGain();
        g2.gain.value = 0.25;
        o.connect(g);
        o2.connect(g2);
        g2.connect(g);
        g.connect(this.dry);
        g.connect(this.conv);
        o.start(t0);
        o2.start(t0);
        o.stop(t0 + 3.4);
        o2.stop(t0 + 3.4);
        o.onended = () => { g.disconnect(); g2.disconnect(); };
      });
    },

    swell() {
      if (!this.on || !this.ctx) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const dur = 4;
      if (!this.noise) {
        const len = Math.floor(ctx.sampleRate * dur);
        this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 2.5;
      bp.frequency.setValueAtTime(220, now);
      bp.frequency.exponentialRampToValueAtTime(2600, now + dur * 0.8);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.16, now + dur * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.conv);
      g.connect(this.dry);
      src.start(now);
      src.stop(now + dur);
      src.onended = () => { g.disconnect(); bp.disconnect(); };
    }
  };

  /* ------------------------------------------------------------------------
     17. TIMELINE — the four acts
     ------------------------------------------------------------------------ */
  function setPhase(i) {
    DOM.phaseNum.textContent = '0' + (i + 1);
    DOM.phaseName.textContent = PHASES[i];
    DOM.phase.classList.remove('is-swap');
    void DOM.phase.offsetWidth;
    DOM.phase.classList.add('is-swap');
    DOM.phaseSteps.forEach((el, k) => {
      el.classList.toggle('is-active', k < i);
      el.classList.toggle('is-current', k === i);
    });
    Sound.chime(PHASE_CHORDS[i], 0.05, 0.12);
  }

  function onBloomStart() {
    DOM.eyebrow.classList.add('is-visible');
    Sound.swell();
  }

  function showStory() {
    DOM.story.classList.add('is-visible');
    DOM.hint.classList.add('is-visible');
    DOM.themes.classList.add('is-visible');
  }

  function buildTimeline() {
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut' } });

    // ACT I — PARTICLE BIRTH
    tl.call(setPhase, [0], 0);
    tl.to(state, { birthAlpha: 1, duration: 1.6, ease: 'power1.out' }, 0);
    tl.to(state, { birth: 1, duration: 5.2 }, 0.2);
    tl.to(state, { dust: 0.55, duration: 4 }, 0.4);
    tl.to(cam, { radius: 11, angle: -0.25, height: -0.2, targetY: -1.7, duration: 6 }, 0);

    // ACT II — GROWING
    tl.call(setPhase, [1], 4.8);
    tl.to(state, { growth: 1, duration: 4.6 }, 4.6);
    tl.to(state, { dissolve: 1, duration: 3.8, ease: 'power1.in' }, 5.0);
    tl.to(state, { leaf0: 1, duration: 2.6, ease: 'power3.out' }, 5.9);
    tl.to(state, { leaf1: 1, duration: 2.6, ease: 'power3.out' }, 6.6);
    tl.to(state, { leaf2: 1, duration: 2.6, ease: 'power3.out' }, 7.3);
    tl.to(state, { budScale: 1, duration: 2.8, ease: 'power3.out' }, 6.6);
    tl.to(cam, { radius: 9.4, height: 0.4, targetY: -1.0, angle: 0.05, duration: 5.4 }, 5.2);

    // ACT III — BLOOMING
    tl.call(setPhase, [2], 9.8);
    tl.call(onBloomStart, null, 9.8);
    tl.to(state, { sepal: 1, duration: 2.2 }, 9.6);
    tl.to(state, { bloom: 1, duration: 7, ease: 'power1.inOut' }, 10.0);
    tl.to(state, { glow: 1, duration: 4 }, 10.6);
    tl.to(state, { beams: 1, duration: 5 }, 11.0);
    tl.to(state, { rays: 1, duration: 5 }, 11.5);
    tl.to(state, { dust: 1, duration: 4 }, 12.0);
    tl.to(state, { floatPetals: 1, duration: 4 }, 12.5);
    tl.to(state, { flash: 1, duration: 0.8, ease: 'power2.out' }, 13.4);
    tl.to(state, { flash: 0, duration: 2.4 }, 14.2);
    tl.to(cam, { radius: 7.6, height: 1.6, targetY: -0.15, angle: 0.3, duration: 7.5 }, 10.0);

    // ACT IV — ETERNAL
    tl.call(setPhase, [3], 17.0);
    tl.to(state, { eternal: 1, duration: 3.5 }, 17.0);
    tl.call(showStory, null, 17.6);
    runHooks('timeline', tl);

    return tl;
  }

  /* ------------------------------------------------------------------------
     18b. WONDERS — crystal vase, glow butterflies, fireflies, mist
     ------------------------------------------------------------------------ */
  let vase = null;
  let butterflies = null;
  let fireflies = null;
  let mist = null;
  let ground = null;
  let moon = null;
  let moonTex = null;
  let aurora = null;
  let milkyway = null;
  let rain = null;
  let stamens = null;
  let sprigs = null;
  const orbit = { yaw: 0, pitch: 0, zoom: 1, velYaw: 0, dragging: false, moved: 0, lastX: 0, lastY: 0 };
  const idle = { lastInput: 0, blend: 0, yaw: 0 };
  const macro = { on: false, blend: 0 };
  const cinema = { on: false };
  const spinDrop = { t: 0, v: new THREE.Vector3() };
  const touches = new Map();
  const pinch = { on: false, startDist: 0, startZoom: 1, startAng: 0, startYaw: 0 };
  const lastClick = { t: 0, x: 0, y: 0 };

  const FIREFLY_VERT = `
    attribute vec3 aColor;
    attribute vec4 aRand;
    uniform float uTime;
    uniform float uPixelRatio;
    uniform float uSize;
    uniform float uAlpha;
    uniform float uFocus;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vBlur;
    void main() {
      vec3 p = position;
      float t = uTime * (0.12 + aRand.x * 0.2);
      float ph = aRand.w * 6.2831;
      p.x += sin(t * 1.7 + ph) * (0.5 + aRand.y * 0.9);
      p.y += sin(t * 1.1 + ph * 1.7) * (0.35 + aRand.z * 0.7);
      p.z += cos(t * 1.3 + ph * 2.3) * (0.5 + aRand.y * 0.9);
      float blink = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(uTime * (0.6 + aRand.z * 1.8) + ph * 3.1), 2.0);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      float depth = max(-mv.z, 0.1);
      float blur = clamp(abs(depth - uFocus) * 0.22, 0.0, 2.5);
      float size = uSize * (0.55 + aRand.x * 0.8) * (1.0 + blur * 1.2);
      gl_PointSize = min(size * uPixelRatio * (10.0 / depth), 54.0 * uPixelRatio);
      vAlpha = uAlpha * blink * (0.4 + 0.6 * aRand.y) / (1.0 + blur * 1.2);
      vColor = aColor;
      vBlur = blur;
    }
  `;

  const PIP_VERT = `
    attribute vec3 aColor;
    attribute vec4 aRand;
    uniform float uTime;
    uniform float uPixelRatio;
    uniform float uSize;
    uniform float uAlpha;
    uniform float uFocus;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vBlur;
    void main() {
      vec3 p = position;
      p.x += sin(uTime * (0.6 + aRand.x) + aRand.z * 6.2831) * 0.007;
      p.y += sin(uTime * (0.8 + aRand.y * 0.6) + aRand.w * 6.2831) * 0.009;
      float tw = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(uTime * (0.9 + aRand.z * 1.6) + aRand.w * 6.2831), 2.0);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      float depth = max(-mv.z, 0.1);
      float blur = clamp(abs(depth - uFocus) * 0.2, 0.0, 2.2);
      float size = uSize * (0.6 + aRand.y * 0.8) * (1.0 + blur);
      gl_PointSize = min(size * uPixelRatio * (10.0 / depth), 30.0 * uPixelRatio);
      vAlpha = uAlpha * tw / (1.0 + blur);
      vColor = aColor;
      vBlur = blur;
    }
  `;

  function makeGlowTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,244,224,0.85)');
    g.addColorStop(0.35, 'rgba(255,220,180,0.32)');
    g.addColorStop(1, 'rgba(255,200,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  }

  const VASE_PTS = [
    new THREE.Vector2(0.5, 0.0),
    new THREE.Vector2(0.9, 0.28),
    new THREE.Vector2(1.08, 1.0),
    new THREE.Vector2(1.0, 1.85),
    new THREE.Vector2(0.68, 2.75),
    new THREE.Vector2(0.58, 3.5),
    new THREE.Vector2(0.62, 4.0),
    new THREE.Vector2(0.8, 4.65),
    new THREE.Vector2(0.87, 5.0)
  ];

  function buildVase() {
    const group = new THREE.Group();
    group.position.set(0, -7.3, 0);
    rose.root.add(group);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xbfe8e2, roughness: 0.06, metalness: 0.0,
      transparent: true, opacity: 0.16, side: THREE.DoubleSide,
      envMapIntensity: 1.6, clearcoat: 1.0, clearcoatRoughness: 0.08
    });
    rim.vase = addRim(glassMat, 0xd6ffe9, 0.5, 2.2);
    const glass = new THREE.Mesh(new THREE.LatheGeometry(VASE_PTS, 48), glassMat);
    glass.receiveShadow = true;
    group.add(glass);

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x9ad2c8, transparent: true, opacity: 0.12, roughness: 0.12, metalness: 0.0
    });
    const surface = new THREE.Mesh(new THREE.CircleGeometry(0.5, 28), waterMat);
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = 3.7;
    group.add(surface);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.58, 1.3, 28, 1, true), waterMat.clone());
    body.material.opacity = 0.07;
    body.position.y = 3.05;
    group.add(body);

    group.scale.setScalar(0.001);
    group.visible = false;
    vase = { group: group };
  }

  function buildButterflies() {
    const glowTex = makeGlowTexture();
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.16, 0.1, 0.3, 0.16, 0.3, 0.02);
    shape.bezierCurveTo(0.3, -0.14, 0.16, -0.22, 0.02, -0.16);
    shape.lineTo(0, 0);
    const wingRight = new THREE.ShapeGeometry(shape, 6);
    const wingLeft = wingRight.clone();
    const lp = wingLeft.attributes.position;
    for (let i = 0; i < lp.count; i++) lp.setX(i, -lp.getX(i));
    const bodyGeo = new THREE.SphereGeometry(0.03, 6, 5);

    const wingColors = [0xffc873, 0xff5a72, 0xfff1d6, 0xff9a5a];
    const count = [5, 4, 3][profile.tier];
    const list = [];
    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      const wMat = new THREE.MeshBasicMaterial({
        color: wingColors[i % wingColors.length], transparent: true, opacity: 0.72,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
      });
      const wr = new THREE.Mesh(wingRight, wMat);
      const wl = new THREE.Mesh(wingLeft, wMat);
      wr.rotation.z = -0.2;
      wl.rotation.z = 0.2;
      group.add(wr, wl);
      const body = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: 0x2a1216, transparent: true, opacity: 0.9 }));
      body.scale.set(0.8, 0.8, 2.1);
      group.add(body);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: wingColors[i % wingColors.length], transparent: true,
        opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      halo.scale.setScalar(0.5);
      group.add(halo);
      scene.add(group);

      list.push({
        group: group, wl: wl, wr: wr, halo: halo,
        size: rand(0.75, 1.15),
        radius: rand(1.5, 2.8),
        height: rand(-0.9, 0.7),
        angle: rand(0, TAU),
        angSpeed: rand(0.14, 0.38) * (Math.random() < 0.5 ? -1 : 1),
        bobPhase: rand(0, TAU),
        flapSpeed: rand(9, 13),
        flapPhase: rand(0, TAU),
        mode: 'orbit',
        timer: rand(4, 12),
        petal: null,
        targetLocal: new THREE.Vector3(),
        vel: new THREE.Vector3()
      });
    }
    butterflies = { list: list, outer: rose.petals.filter((p) => p.def.t > 0.45), glowTex: glowTex };
  }

  function buildFireflies() {
    const n = [70, 48, 30][profile.tier];
    const pos = new Float32Array(n * 3);
    const rnd = new Float32Array(n * 4);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 1.6 + Math.random() * 3.4;
      const a = Math.random() * TAU;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = rand(-3.2, 1.6);
      pos[i * 3 + 2] = Math.sin(a) * r;
      for (let k = 0; k < 4; k++) rnd[i * 4 + k] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const mat = pointsMaterial(FIREFLY_VERT, {
      uTime: { value: 0 },
      uSize: { value: 3.4 },
      uAlpha: { value: 0 },
      uFocus: { value: 9 }
    }, 3.4);
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    fireflies = { points: points, mat: mat, col: col };
  }

  function buildMist() {
    const tex = makeGlowTexture();
    const count = [6, 5, 4][profile.tier];
    const list = [];
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex, color: 0xcfc4b4, transparent: true, opacity: 0.0,
        depthWrite: false, blending: THREE.AdditiveBlending
      });
      const sp = new THREE.Sprite(mat);
      const a = (i / count) * TAU + rand(0, 1);
      const r = rand(1.6, 3.2);
      sp.position.set(Math.cos(a) * r, rand(-4.4, -2.6), Math.sin(a) * r);
      sp.scale.setScalar(rand(3.4, 5.6));
      sp.userData = { phase: Math.random() * TAU, baseY: sp.position.y, op: rand(0.5, 0.85), spin: rand(0.02, 0.06) * (Math.random() < 0.5 ? -1 : 1) };
      scene.add(sp);
      list.push(sp);
    }
    mist = { list: list };
  }

  function buildGround() {
    const group = new THREE.Group();
    group.position.set(0, -7.34, 0);
    rose.root.add(group);

    const tex = makeGlowTexture();

    // Dark stage disc so the vase stops floating in the void
    const stage = new THREE.Mesh(
      new THREE.CircleGeometry(2.7, 40),
      new THREE.MeshBasicMaterial({ color: 0x04050a, map: tex, transparent: true, opacity: 0.9, depthWrite: false })
    );
    stage.rotation.x = -Math.PI / 2;
    stage.renderOrder = 1;
    group.add(stage);

    // Warm pool of light pooling under the bouquet
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(2.1, 40),
      new THREE.MeshBasicMaterial({
        map: tex, color: 0xc9a06a, transparent: true, opacity: 0.1,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.02;
    pool.renderOrder = 2;
    group.add(pool);

    // Faint mirrored ghost of the vase glass
    const reflMat = new THREE.MeshBasicMaterial({
      color: 0x9ad2c8, transparent: true, opacity: 0.045,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const refl = new THREE.Mesh(new THREE.LatheGeometry(VASE_PTS, 32), reflMat);
    refl.scale.set(1, -1, 1);
    refl.position.y = -0.1;
    group.add(refl);

    ground = { group: group, pool: pool };
  }

  function buildMoon() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const ctx = cv.getContext('2d');
    let g = ctx.createRadialGradient(104, 96, 10, 128, 128, 118);
    g.addColorStop(0, 'rgba(238,244,250,0.96)');
    g.addColorStop(0.72, 'rgba(200,216,230,0.55)');
    g.addColorStop(1, 'rgba(182,200,220,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(128, 128, 108, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-atop';
    [[92, 88, 17], [150, 70, 11], [168, 140, 21], [110, 160, 13], [140, 180, 9], [80, 130, 10]].forEach((c) => {
      const cg = ctx.createRadialGradient(c[0], c[1], 1, c[0], c[1], c[2]);
      cg.addColorStop(0, 'rgba(146,166,186,0.5)');
      cg.addColorStop(1, 'rgba(146,166,186,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(c[0], c[1], c[2], 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';

    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0, depthWrite: false
    }));
    sp.position.set(9.5, 8.5, -26);
    sp.scale.setScalar(13);
    scene.add(sp);
    moon = { sp: sp };
    moonTex = sp.material.map;

    // Moon reflection rippling on the vase water
    if (vase) {
      const refl = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.62),
        new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      refl.rotation.x = -Math.PI / 2;
      refl.position.set(0.09, 3.715, -0.26);
      vase.group.add(refl);
      vase.moonRefl = refl;
    }
  }

  /* --- Sky wonders: aurora, milky way, sparkle rain --- */
  const AURORA_FRAG = `
    varying vec2 vUv;
    uniform float uTime;
    uniform float uIntensity;
    uniform vec3 uColA;
    uniform vec3 uColB;
    void main() {
      float x = vUv.x * 9.0;
      float w = sin(x * 1.1 + uTime * 0.29) * 0.5
              + sin(x * 2.3 - uTime * 0.17) * 0.3
              + sin(x * 4.7 + uTime * 0.23) * 0.2;
      float y = vUv.y;
      float center = 0.42 + w * 0.13;
      float band = exp(-(y - center) * (y - center) * 14.0) * smoothstep(0.0, 0.22, y) * (1.0 - smoothstep(0.75, 1.0, y));
      float rays = 0.55 + 0.45 * sin(x * 7.0 + sin(uTime * 0.19 + x * 0.35) * 2.4);
      float sheen = 0.6 + 0.4 * sin(uTime * 0.4 + y * 5.0);
      vec3 col = mix(uColA, uColB, smoothstep(0.15, 0.85, y + w * 0.1));
      gl_FragColor = vec4(col, band * rays * sheen * uIntensity);
    }
  `;

  function buildAurora() {
    const group = new THREE.Group();
    const mk = (h, y, colA, colB, phase) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: phase }, uIntensity: { value: 0 },
          uColA: { value: new THREE.Color(colA) }, uColB: { value: new THREE.Color(colB) }
        },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: AURORA_FRAG,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const arc = new THREE.Mesh(new THREE.CylinderGeometry(84, 84, h, 48, 1, true, Math.PI - 1.15, 2.3), mat);
      arc.position.y = y;
      arc.renderOrder = -8;
      arc.frustumCulled = false;
      group.add(arc);
      return mat;
    };
    aurora = {
      group: group,
      mats: [
        mk(30, 11, 0x1a7a58, 0x2f9e78, 0),
        mk(24, 16, 0x4a2a86, 0x7a4ec2, 21)
      ]
    };
    scene.add(group);
  }

  function buildMilkyWay() {
    const n = [1100, 750, 460][profile.tier];
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const phase = new Float32Array(n);
    const col = new Float32Array(n * 3);
    const N = new THREE.Vector3(0.42, 1, 0.3).normalize();
    const U1 = new THREE.Vector3(0.9, 0, -0.44).normalize();
    const U2 = new THREE.Vector3().crossVectors(N, U1).normalize();
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = rand(88, 118);
      v.copy(U1).multiplyScalar(Math.cos(a) * r).addScaledVector(U2, Math.sin(a) * r);
      const spread = (Math.random() + Math.random() + Math.random() - 1.5) * 9.0;
      v.addScaledVector(N, spread);
      v.y = Math.abs(v.y) * 0.62 + 4;
      v.setLength(rand(88, 120));
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      size[i] = Math.random() < 0.05 ? rand(1.8, 2.8) : rand(0.5, 1.3);
      phase[i] = Math.random();
      const pick = Math.random();
      const b = rand(0.35, 0.85);
      if (pick < 0.55) { col[i * 3] = b; col[i * 3 + 1] = b * 0.97; col[i * 3 + 2] = b * 0.95; }
      else if (pick < 0.85) { col[i * 3] = b * 0.8; col[i * 3 + 1] = b * 0.86; col[i * 3 + 2] = b; }
      else { col[i * 3] = b; col[i * 3 + 1] = b * 0.85; col[i * 3 + 2] = b * 0.7; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const mat = pointsMaterial(STAR_VERT, { uTime: { value: 0 }, uAlpha: { value: 0 }, uSize: { value: 1 } }, 1);
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    // Faint nebula clouds along the band
    const clouds = [];
    const tex = makeGlowTexture();
    [[-55, 26, -70, 52], [10, 34, -95, 66], [58, 18, -60, 46]].forEach((d, i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: i === 1 ? 0x3a4a8e : 0x6a5a96, transparent: true,
        opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      sp.position.set(d[0], d[1], d[2]);
      sp.scale.setScalar(d[3]);
      sp.frustumCulled = false;
      scene.add(sp);
      clouds.push(sp);
    });
    milkyway = { points: points, mat: mat, clouds: clouds, group: null };
  }

  const RAIN_VERT = `
    attribute vec3 aColor;
    attribute vec4 aRand;
    uniform float uTime;
    uniform float uPixelRatio;
    uniform float uSize;
    uniform float uAlpha;
    uniform float uFocus;
    varying vec3 vColor;
    varying float vAlpha;
    varying float vBlur;
    void main() {
      vec3 p = position;
      p.y = mod(p.y - uTime * (0.5 + aRand.x * 0.85), 16.0) - 2.0;
      p.x += sin(uTime * 0.4 + aRand.z * 6.2831) * 0.25;
      float tw = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(uTime * (1.4 + aRand.z * 2.2) + aRand.w * 6.2831), 3.0);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      float depth = max(-mv.z, 0.1);
      float blur = clamp(abs(depth - uFocus) * 0.2, 0.0, 2.2);
      float size = uSize * (0.5 + aRand.y * 0.9) * (1.0 + blur * 1.1);
      gl_PointSize = min(size * uPixelRatio * (10.0 / depth), 40.0 * uPixelRatio);
      vAlpha = uAlpha * tw * (0.3 + 0.7 * aRand.y) / (1.0 + blur * 1.1);
      vColor = aColor;
      vBlur = blur;
    }
  `;

  function buildRain() {
    const n = [260, 180, 110][profile.tier];
    const pos = new Float32Array(n * 3);
    const rnd = new Float32Array(n * 4);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 1.2 + Math.random() * 8.5;
      const a = Math.random() * TAU;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = rand(-2, 14);
      pos[i * 3 + 2] = Math.sin(a) * r;
      for (let k = 0; k < 4; k++) rnd[i * 4 + k] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const mat = pointsMaterial(RAIN_VERT, {
      uTime: { value: 0 }, uSize: { value: 2.2 }, uAlpha: { value: 0 }, uFocus: { value: 9 }
    }, 2.2);
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    rain = { points: points, mat: mat, col: col, count: n };
  }

  /* --- Stamens inside the flower heads + baby's breath among the stems --- */
  function buildStamens() {
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xd8a862, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const tipMat = pointsMaterial(PIP_VERT, {
      uTime: { value: 0 }, uSize: { value: 1.7 }, uAlpha: { value: 0 }, uFocus: { value: 9 }
    }, 1.7);
    stamens = { lineMat: lineMat, tipMat: tipMat, lineGeo: [], tipGeo: [] };

    rose.plants.forEach((P) => {
      const n = P.hero ? [66, 46, 32][profile.tier] : [32, 24, 16][profile.tier];
      const lp = new Float32Array(n * 6);
      const tp = new Float32Array(n * 3);
      const rnd = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const tilt = rand(0.3, 1.15);
        const dx = Math.cos(a) * Math.sin(tilt);
        const dz = Math.sin(a) * Math.sin(tilt);
        const dy = Math.cos(tilt) * rand(0.75, 1.45);
        const len = rand(0.13, 0.3);
        const bx = rand(-0.04, 0.04), by = 0.28 + rand(0, 0.08), bz = rand(-0.04, 0.04);
        lp[i * 6] = bx; lp[i * 6 + 1] = by; lp[i * 6 + 2] = bz;
        const tx = bx + dx * len, ty = by + dy * len, tz = bz + dz * len;
        lp[i * 6 + 3] = tx; lp[i * 6 + 4] = ty; lp[i * 6 + 5] = tz;
        tp[i * 3] = tx; tp[i * 3 + 1] = ty; tp[i * 3 + 2] = tz;
        for (let k = 0; k < 4; k++) rnd[i * 4 + k] = Math.random();
      }
      const lgeo = new THREE.BufferGeometry();
      lgeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
      const lines = new THREE.LineSegments(lgeo, lineMat);
      lines.frustumCulled = false;
      P.head.add(lines);
      stamens.lineGeo.push(lgeo);

      const tgeo = new THREE.BufferGeometry();
      tgeo.setAttribute('position', new THREE.BufferAttribute(tp, 3));
      tgeo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
      const tcol = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const b = rand(0.7, 1.15);
        tcol[i * 3] = b; tcol[i * 3 + 1] = b * 0.82; tcol[i * 3 + 2] = b * 0.55;
      }
      tgeo.setAttribute('aColor', new THREE.BufferAttribute(tcol, 3));
      const pts = new THREE.Points(tgeo, tipMat);
      pts.frustumCulled = false;
      P.head.add(pts);
      stamens.tipGeo.push(tgeo);
    });
  }

  function buildSprigs() {
    const mat = pointsMaterial(PIP_VERT, {
      uTime: { value: 0 }, uSize: { value: 1.5 }, uAlpha: { value: 0 },
      uFocus: { value: 9 }
    }, 1.5);
    sprigs = { mat: mat, clouds: [] };
    rose.plants.forEach((P) => {
      const n = P.hero ? [80, 56, 38][profile.tier] : [44, 32, 22][profile.tier];
      const pos = new Float32Array(n * 3);
      const rnd = new Float32Array(n * 4);
      const col = new Float32Array(n * 3);
      const c = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        P.curve.getPointAt(rand(0.34, 0.92), c);
        const a = Math.random() * TAU;
        const r = rand(0.05, 0.24);
        pos[i * 3] = c.x + Math.cos(a) * r;
        pos[i * 3 + 1] = c.y + rand(-0.05, 0.12);
        pos[i * 3 + 2] = c.z + Math.sin(a) * r;
        for (let k = 0; k < 4; k++) rnd[i * 4 + k] = Math.random();
        const b = rand(0.55, 1.0);
        col[i * 3] = b; col[i * 3 + 1] = b * 0.98; col[i * 3 + 2] = b * 0.94;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
      geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      P.node.add(pts);
      sprigs.clouds.push(pts);
    });
  }

  function butterflyTargetPetal(b) {
    const pool = butterflies.outer.length ? butterflies.outer : rose.petals;
    const p = pool[Math.floor(Math.random() * pool.length)];
    const attr = p.mesh.geometry.attributes.position;
    const vi = Math.floor(Math.random() * attr.count);
    b.petal = p.mesh;
    b.targetLocal.fromBufferAttribute(attr, vi).multiplyScalar(0.9);
  }

  function updateWonders(dt, time, focusDist) {
    // Crystal vase rises with the very first growth
    if (vase) {
      const vs = easeOutCubic(smooth(0.0, 0.16, state.growth));
      vase.group.visible = vs > 0.002;
      vase.group.scale.setScalar(Math.max(0.001, vs));
      if (vase.moonRefl && moon) {
        const mr = moon.sp.material.opacity * 0.55;
        vase.moonRefl.material.opacity = mr;
        const wob = Math.sin(time * 1.9) * 0.5 + Math.sin(time * 3.3 + 1.7) * 0.5;
        vase.moonRefl.scale.set(0.62 + wob * 0.05, 1, 0.62 - wob * 0.04);
        vase.moonRefl.position.x = 0.09 + Math.sin(time * 1.3) * 0.02;
        vase.moonRefl.position.z = -0.26 + Math.cos(time * 1.1) * 0.02;
      }
    }

    // Ground stage + light pool appear with the vase, pool warms up in eternal
    if (ground) {
      const gs = easeOutCubic(smooth(0.0, 0.16, state.growth));
      ground.group.visible = gs > 0.002;
      ground.group.scale.setScalar(Math.max(0.001, gs));
      ground.pool.material.opacity = 0.07 + 0.18 * state.eternal + fx.pulse * 0.18;
    }

    // Moon keeps watch from the deep background
    if (moon) {
      moon.sp.material.opacity = 0.3 + 0.2 * state.eternal;
    }

    // Aurora curtains breathe across the horizon in the eternal phase
    if (aurora) {
      const aa = smooth(0.62, 1, state.bloom) * (0.25 + 0.75 * state.eternal);
      aurora.mats.forEach((m, i) => {
        m.uniforms.uTime.value = time + i * 21;
        m.uniforms.uIntensity.value = aa * (i === 0 ? 0.34 : 0.22);
      });
    }

    // Milky way slowly wheeling in the deep sky
    if (milkyway) {
      const ma = smooth(0.4, 1, state.bloom) * (0.35 + 0.5 * state.eternal);
      milkyway.mat.uniforms.uTime.value = time;
      milkyway.mat.uniforms.uAlpha.value = ma * 0.5;
      milkyway.points.rotation.y += dt * 0.0022;
      milkyway.clouds.forEach((sp, i) => {
        sp.material.opacity = ma * [0.1, 0.13, 0.09][i];
      });
    }

    // Sparkle rain drifting down through the eternal phase
    if (rain) {
      const ra = smooth(0.55, 1, state.bloom) * (0.3 + 0.7 * state.eternal);
      rain.mat.uniforms.uTime.value = time;
      rain.mat.uniforms.uAlpha.value = ra * 0.3;
      rain.mat.uniforms.uFocus.value = focusDist;
    }

    // Golden stamens unfurl deep inside the blooms
    if (stamens) {
      const sa = smooth(0.78, 1, state.bloom) * (0.4 + 0.6 * state.eternal);
      stamens.lineMat.opacity = sa * 0.42;
      stamens.tipMat.uniforms.uAlpha.value = sa * 0.75;
      stamens.tipMat.uniforms.uTime.value = time;
      stamens.tipMat.uniforms.uFocus.value = focusDist;
    }

    // Baby's breath twinkling among the stems
    if (sprigs) {
      const ga = smooth(0.5, 0.92, state.bloom) * (0.45 + 0.55 * state.eternal);
      sprigs.mat.uniforms.uAlpha.value = ga * 0.55;
      sprigs.mat.uniforms.uTime.value = time;
      sprigs.mat.uniforms.uFocus.value = focusDist;
    }

    // Fireflies drift near the bouquet, strongest in the eternal phase
    if (fireflies) {
      const fa = smooth(0.35, 0.9, state.bloom) * (0.45 + 0.55 * state.eternal);
      const u = fireflies.mat.uniforms;
      u.uAlpha.value = fa * 0.6;
      u.uTime.value = time;
      u.uFocus.value = focusDist;
    }

    // Soft mist hugging the stems
    if (mist) {
      const ma = 0.05 + 0.07 * state.eternal;
      for (let i = 0; i < mist.list.length; i++) {
        const sp = mist.list[i];
        sp.material.opacity = sp.userData.op * ma;
        sp.material.rotation += sp.userData.spin * dt;
        sp.position.y = sp.userData.baseY + Math.sin(time * 0.13 + sp.userData.phase) * 0.3;
      }
    }

    // Glow butterflies — orbit, land on petals, scatter from the cursor
    if (!butterflies) return;
    const act = smooth(0.55, 1, state.bloom) * (0.35 + 0.65 * state.eternal);
    for (let i = 0; i < butterflies.list.length; i++) {
      const b = butterflies.list[i];
      const g = b.group;
      g.visible = act > 0.01;
      if (!g.visible) continue;
      g.scale.setScalar(Math.max(0.001, act * b.size));

      // Flap
      const sit = b.mode === 'sit';
      const flap = Math.sin(time * (sit ? b.flapSpeed * 0.25 : b.flapSpeed) + b.flapPhase);
      b.wl.rotation.z = 0.2 + flap * (sit ? 0.25 : 0.8);
      b.wr.rotation.z = -0.2 - flap * (sit ? 0.25 : 0.8);
      b.halo.material.opacity = 0.22 + 0.16 * Math.abs(flap);

      // Scatter from the cursor
      if (pointer.active && !sit && g.position.distanceToSquared(V.mouse) < 1.2) {
        b.vel.copy(g.position).sub(V.mouse).setLength(3.4);
        b.vel.y += 1.2;
        b.mode = 'flee';
        b.timer = 1.2;
      }

      if (b.mode === 'orbit') {
        b.angle += b.angSpeed * dt;
        const px = Math.cos(b.angle) * b.radius;
        const pz = Math.sin(b.angle) * b.radius;
        const py = b.height + Math.sin(time * 1.3 + b.bobPhase) * 0.4;
        V.tmp2.set(px, py, pz).sub(g.position);
        g.position.addScaledVector(V.tmp2, Math.min(1, dt * 3));
        g.rotation.y = Math.atan2(-Math.sin(b.angle) * b.angSpeed, Math.cos(b.angle) * b.angSpeed);
        g.rotation.z = Math.sin(time * 1.7 + b.bobPhase) * 0.12;
        b.timer -= dt;
        if (b.timer <= 0 && act > 0.6) {
          butterflyTargetPetal(b);
          b.mode = 'approach';
        }
      } else if (b.mode === 'approach' || b.mode === 'flee') {
        if (b.mode === 'approach' && b.petal) b.petal.localToWorld(V.tmp.copy(b.targetLocal));
        else V.tmp.copy(g.position).addScaledVector(b.vel, 0.5);
        V.tmp2.copy(V.tmp).sub(g.position);
        const d = V.tmp2.length();
        b.vel.addScaledVector(V.tmp2.normalize(), Math.min(d * 3, 6) * dt);
        b.vel.multiplyScalar(Math.pow(0.2, dt));
        g.position.addScaledVector(b.vel, dt);
        if (d < 0.07 && b.mode === 'approach') {
          b.mode = 'sit';
          b.timer = rand(2, 5);
        } else if (b.mode === 'flee' && b.timer <= 0) {
          b.mode = 'orbit';
          b.timer = rand(6, 14);
        }
        if (b.mode === 'approach') b.timer -= dt;
        if (b.mode === 'approach' && b.timer <= 0) { b.mode = 'orbit'; b.timer = rand(6, 14); }
        const targetYaw = Math.atan2(b.vel.x, b.vel.z);
        let dyaw = targetYaw - g.rotation.y;
        dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
        g.rotation.y += dyaw * 0.12;
      } else { // sit
        if (b.petal) b.petal.localToWorld(V.tmp.copy(b.targetLocal));
        else V.tmp.copy(g.position);
        g.position.lerp(V.tmp, Math.min(1, dt * 6));
        b.timer -= dt;
        if (b.timer <= 0) {
          b.mode = 'orbit';
          b.timer = rand(6, 14);
          b.vel.set(0, 0.6, 0);
        }
      }
    }
  }

  /* ------------------------------------------------------------------------
     17b. BOUQUET THEMES — recolor petals, particles, glow and lights live
     ------------------------------------------------------------------------ */
  const THEMES = [
    {
      key: 'ruby', label: 'ทับทิมนิรันดร์',
      petalBase: 0x200104, petalMid: 0x7a0817, petalTip: 0xb81b30, petalEdge: 0x2c0207,
      petalEmissive: 0x140004, petalRim: 0xd83048,
      p1: 0xd8182a, p1Deep: 0x7e040e, gold: 0xd89c52, champagne: 0xd8bc96,
      bgRed: 0x6c0810, bgGold: 0xb88648,
      glowA: 0x9a0815, glowB: 0xd0a468, rayA: 0x6e0810, rayB: 0xd0a872,
      beam1: 0xd0aa70, beam2: 0xb81828, beam3: 0xd0bc9a,
      streakA: 0xcc3440, streakB: 0xd0bc9a,
      rimRed: 0xd41832, rimGold: 0xb8965a, inner: 0xd83044,
      floatPetal: 0x7c0a19, floatEmissive: 0x1a0005, floatRim: 0xd83a4e
    },
    {
      key: 'blush', label: 'อรุณชมพู',
      petalBase: 0x220812, petalMid: 0x88405a, petalTip: 0xc47a92, petalEdge: 0x36101c,
      petalEmissive: 0x140508, petalRim: 0xe87a9c,
      p1: 0xc8688a, p1Deep: 0x8e3c5c, gold: 0xc09c74, champagne: 0xc0b0a0,
      bgRed: 0x4c202c, bgGold: 0xa8886a,
      glowA: 0x9e4058, glowB: 0xb09878, rayA: 0x7c3448, rayB: 0xb08c74,
      beam1: 0xb09878, beam2: 0xa85470, beam3: 0xd0b8a8,
      streakA: 0xb06080, streakB: 0xd8c0b0,
      rimRed: 0xa84c6c, rimGold: 0xb08868, inner: 0xac4462,
      floatPetal: 0x9e4a64, floatEmissive: 0x1c060a, floatRim: 0xd088a0
    },
    {
      key: 'ivory', label: 'งาช้างเรืองจันทร์',
      petalBase: 0x3a2f1c, petalMid: 0x907c56, petalTip: 0xc4b286, petalEdge: 0x4a3c26,
      petalEmissive: 0x140e06, petalRim: 0xd8b474,
      p1: 0xc0ac84, p1Deep: 0x90784e, gold: 0xb89c68, champagne: 0xc8bca8,
      bgRed: 0x382c1c, bgGold: 0xa08858,
      glowA: 0x8e7448, glowB: 0xb09c74, rayA: 0x6c5a34, rayB: 0xac9468,
      beam1: 0xb09c74, beam2: 0x988050, beam3: 0xd8c8b0,
      streakA: 0xb09868, streakB: 0xd8c8b0,
      rimRed: 0xb09268, rimGold: 0xb09060, inner: 0xac8448,
      floatPetal: 0xa89268, floatEmissive: 0x1a1408, floatRim: 0xd0b884
    },
    {
      key: 'midnight', label: 'กำมะหยี่เที่ยงคืน',
      petalBase: 0x04061a, petalMid: 0x182860, petalTip: 0x4c64b4, petalEdge: 0x060a2e,
      petalEmissive: 0x030612, petalRim: 0x6a8ae0,
      p1: 0x4c66c0, p1Deep: 0x1e3490, gold: 0x749ac4, champagne: 0xa0b2c4,
      bgRed: 0x080e26, bgGold: 0x54689e,
      glowA: 0x1c2f6e, glowB: 0x7488ba, rayA: 0x141f4c, rayB: 0x687cae,
      beam1: 0x7488ba, beam2: 0x24408e, beam3: 0xb8c8d8,
      streakA: 0x3049b8, streakB: 0xa8bcdd,
      rimRed: 0x243ba4, rimGold: 0x6a80b8, inner: 0x304ac0,
      floatPetal: 0x1c2f6e, floatEmissive: 0x060a1c, floatRim: 0x748ecf
    }
  ];
  let themeIndex = 0;

  // Re-bake every static particle color from the current palette
  function paintParticleCols() {
    const c = new THREE.Color();
    if (birth && birth.col) {
      for (let i = 0; i < birth.count; i++) {
        const b = rand(0.55, 1.0);
        if (birth.cat[i] === 0) {
          if (Math.random() < 0.82) c.copy(PAL.ruby).lerp(PAL.rubyDeep, Math.random() * 0.6);
          else c.copy(PAL.gold);
        } else if (birth.cat[i] === 1) {
          c.copy(Math.random() < 0.55 ? PAL.gold : PAL.ruby);
        } else {
          c.copy(PAL.champagne).multiplyScalar(0.7).lerp(PAL.gold, Math.random());
        }
        birth.col[i * 3] = c.r * b;
        birth.col[i * 3 + 1] = c.g * b;
        birth.col[i * 3 + 2] = c.b * b;
      }
      birth.points.geometry.attributes.aColor.needsUpdate = true;
    }
    if (dust && dust.col) {
      for (let i = 0; i < dust.count; i++) {
        const b = rand(0.42, 0.8);
        c.copy(Math.random() < 0.62 ? PAL.gold : PAL.ruby);
        dust.col[i * 3] = c.r * b;
        dust.col[i * 3 + 1] = c.g * b;
        dust.col[i * 3 + 2] = c.b * b;
      }
      dust.points.geometry.attributes.aColor.needsUpdate = true;
    }
    if (fireflies && fireflies.col) {
      const n = fireflies.points.geometry.attributes.position.count;
      for (let i = 0; i < n; i++) {
        const b = rand(0.55, 1.1);
        c.copy(Math.random() < 0.7 ? PAL.gold : PAL.ruby);
        fireflies.col[i * 3] = c.r * b;
        fireflies.col[i * 3 + 1] = c.g * b;
        fireflies.col[i * 3 + 2] = c.b * b;
      }
      fireflies.points.geometry.attributes.aColor.needsUpdate = true;
    }
    if (rain && rain.col) {
      for (let i = 0; i < rain.count; i++) {
        const b = rand(0.35, 0.75);
        c.copy(Math.random() < 0.6 ? PAL.champagne : PAL.gold);
        rain.col[i * 3] = c.r * b;
        rain.col[i * 3 + 1] = c.g * b;
        rain.col[i * 3 + 2] = c.b * b;
      }
      rain.points.geometry.attributes.aColor.needsUpdate = true;
    }
  }

  function applyTheme(idx, silent) {
    const T = THEMES[idx];
    if (!T) return;
    themeIndex = idx;

    // Petals + particle palette
    PAL.petalBase.set(T.petalBase);
    PAL.petalMid.set(T.petalMid);
    PAL.petalTip.set(T.petalTip);
    PAL.petalEdge.set(T.petalEdge);
    PAL.ruby.set(T.p1);
    PAL.rubyDeep.set(T.p1Deep);
    PAL.gold.set(T.gold);
    PAL.champagne.set(T.champagne);

    if (rose && rose.plants) {
      rose.plants.forEach((P) => P.petals.forEach((p) => paintPetal(p.mesh.geometry, p.def.t)));
      if (rose.mats && rose.mats.petal) rose.mats.petal.emissive.set(T.petalEmissive);
    }
    if (rim.petal) rim.petal.uRimColor.value.set(T.petalRim);

    // Floating petals
    if (floating) {
      floating.mesh.material.color.set(T.floatPetal);
      floating.mesh.material.emissive.set(T.floatEmissive);
      if (rim.float) rim.float.uRimColor.value.set(T.floatRim);
    }

    // Background nebula
    if (bg) {
      bg.material.uniforms.uRed.value.set(T.bgRed);
      bg.material.uniforms.uGold.value.set(T.bgGold);
    }

    // Glow + god rays + light beams behind the bouquet
    if (glow) {
      glow.material.uniforms.uColorA.value.set(T.glowA);
      glow.material.uniforms.uColorB.value.set(T.glowB);
    }
    if (rays) {
      rays.material.uniforms.uColorA.value.set(T.rayA);
      rays.material.uniforms.uColorB.value.set(T.rayB);
    }
    if (beams) {
      const bc = [T.beam1, T.beam2, T.beam3];
      beams.mats.forEach((m, i) => m.uniforms.uColor.value.set(bc[i % bc.length]));
    }

    // Lighting rig
    if (lightRimRed) lightRimRed.color.set(T.rimRed);
    if (lightRimGold) lightRimGold.color.set(T.rimGold);
    if (innerLight) innerLight.color.set(T.inner);

    // Particles
    paintParticleCols();

    // Luxe layers (bokeh, helix, rings, streak, env reflections)
    runHooks('theme', T);

    // UI dots
    const dots = document.querySelectorAll('.themes__dot');
    dots.forEach((d) => d.classList.toggle('is-active', +d.dataset.theme === idx));
    if (!silent) showToast('ช่อดอก · ' + T.label);
  }

  /* ------------------------------------------------------------------------
     18. FRAME UPDATE
     ------------------------------------------------------------------------ */
  let lastFlash = -1;

  function update(dt, time) {
    const kPar = 1 - Math.exp(-dt * 2.4);
    par.x += (par.tx - par.x) * kPar;
    par.y += (par.ty - par.y) * kPar;
    fx.hover += ((app.hovering ? 1 : 0) - fx.hover) * (1 - Math.exp(-dt * 5));
    fx.mouse += ((pointer.active ? 1 : 0) - fx.mouse) * (1 - Math.exp(-dt * 3));

    // Rose
    rose.root.rotation.y += dt * 0.12 * state.eternal;
    rose.root.rotation.z = Math.sin(time * 0.35) * 0.012 * state.eternal;
    updateRose(state, time);
    rose.root.updateMatrixWorld(true);

    // Whip the bouquet into a fast spin and loose petals shake free
    if (orbit.dragging && Math.abs(orbit.velYaw) > 2.0 && state.bloom > 0.4) {
      spinDrop.t -= dt;
      if (spinDrop.t <= 0) {
        spinDrop.t = rand(0.1, 0.2);
        for (let s = 0; s < 3; s++) {
          const SP = rose.plants[(Math.random() * rose.plants.length) | 0];
          if (!SP || !SP.petals.length) continue;
          const pt = SP.petals[(Math.random() * SP.petals.length) | 0];
          spinDrop.v.setFromMatrixPosition(pt.mesh.matrixWorld);
          spawnBurst(spinDrop.v, 6, 'rose', 1.4);
        }
      }
    } else {
      spinDrop.t = 0;
    }

    // Camera — choreographed path + parallax + eternal drift + user orbit
    if (!orbit.dragging) {
      orbit.yaw += orbit.velYaw * dt;
      orbit.velYaw *= Math.pow(0.05, dt);
    }

    // Idle showcase — slow cinematic drift when nobody interacts (or in cinema mode)
    const idleTarget = (app.started && !orbit.dragging && !app.replaying && (performance.now() - idle.lastInput > 6000 || cinema.on)) ? 1 : 0;
    idle.blend += (idleTarget - idle.blend) * (1 - Math.exp(-dt * (idleTarget ? 0.4 : 2.5)));
    idle.yaw += dt * 0.11 * idle.blend * idle.blend;

    // Macro focus — the camera melts into the heart of the hero bloom
    if (macro.on) macro.blend = Math.min(1, macro.blend + dt * 1.5);
    else macro.blend = Math.max(0, macro.blend - dt * 1.9);
    const mb = easeInOutSine(macro.blend);

    const drift = state.eternal;
    const focusY = rose.finalCenter.y;
    let r = cam.radius * viewport.camFactor * (1 - 0.03 * drift * (0.5 + 0.5 * Math.sin(time * 0.09))) * orbit.zoom;
    r = lerp(r, Math.max(2.0, r * 0.34), mb);
    let hgt = cam.height * (0.6 + 0.4 * viewport.camFactor) + par.y * 0.5 + Math.sin(time * 0.17) * 0.2 * drift + orbit.pitch * 2.2;
    hgt = lerp(hgt, focusY + 0.35, mb * 0.88);
    const ang = cam.angle + par.x * 0.22 * (1 - mb) + Math.sin(time * 0.11) * 0.14 * drift + orbit.yaw + idle.yaw;
    camera.position.set(Math.sin(ang) * r, hgt, Math.cos(ang) * r);
    const halfH = Math.tan(camera.fov * Math.PI / 360) * r;
    V.look.set(par.x * 0.06 * (1 - mb), cam.targetY + viewport.shiftY * halfH * 0.5, 0);
    if (mb > 0) V.look.y = lerp(V.look.y, focusY + 0.05, mb * 0.85);
    camera.lookAt(V.look);
    camera.updateMatrixWorld();

    // Focus point
    if (state.budScale > 0.05) rose.head.localToWorld(V.center.copy(rose.centerLocal));
    else V.center.copy(rose.finalCenter);
    V.dir.copy(camera.position).sub(V.center).normalize();
    plane.setFromNormalAndCoplanarPoint(V.dir, V.center);
    const focusDist = camera.position.distanceTo(V.center);

    // Pointer in world space
    if (pointer.active) {
      V.ndc.set(pointer.nx, pointer.ny);
      raycaster.setFromCamera(V.ndc, camera);
      if (raycaster.ray.intersectPlane(plane, V.tmp3)) V.mouse.copy(V.tmp3);
    }
    updateWonders(dt, time, focusDist);

    // Hover detection (mouse only, throttled)
    if (pointer.hoverDirty && pointer.type === 'mouse' && time - pointer.lastHover > 0.07) {
      pointer.hoverDirty = false;
      pointer.lastHover = time;
      let on = false;
      if (app.started && state.budScale > 0.2) {
        V.ndc.set(pointer.nx, pointer.ny);
        raycaster.setFromCamera(V.ndc, camera);
        on = raycaster.intersectObjects(rose.headTargets, false).length > 0;
      }
      setHover(on);
    }

    // Lights — rig stays dim while the bud is closed, blooming with the flower
    const lit = lerp(0.4, 1, easeInOutSine(clamp(state.bloom, 0, 1)));
    keyLight.intensity = 1.8 * lit;
    lightRimRed.intensity = 1.45 * lit;
    lightRimGold.intensity = 0.65 * lit;
    lightFill.intensity = 0.25 * lit;
    lightHemi.intensity = 0.32 * lit;
    lightAmbient.intensity = 0.42 * lit;

    keyLight.target.position.copy(V.center);
    innerLight.position.copy(V.center);
    innerLight.intensity = state.glow * 0.6 + fx.pulse * 3 + fx.hover * 0.22;

    rim.petal.uRimStrength.value = 0.22 * lit + fx.hover * 0.24 + fx.pulse * 1.0 + state.flash * 0.4;
    rim.float.uRimStrength.value = 0.32 + fx.pulse * 0.45;

    // Background & stars
    bg.material.uniforms.uTime.value = time;
    bg.material.uniforms.uIntensity.value = 0.2 + 0.26 * state.birthAlpha + 0.2 * state.glow + 0.2 * fx.pulse;
    bg.material.uniforms.uFocusDir.value.copy(V.dir).negate();
    bg.position.copy(camera.position);

    stars.mat.uniforms.uTime.value = time;
    stars.mat.uniforms.uAlpha.value = 0.26 + 0.5 * Math.max(state.birthAlpha * 0.6, state.eternal);
    stars.points.rotation.y += dt * 0.004;

    // Dust
    dust.mat.uniforms.uTime.value = time;
    dust.mat.uniforms.uAlpha.value = 0.08 + 0.6 * state.dust;
    dust.mat.uniforms.uFocus.value = focusDist;
    dust.mat.uniforms.uMouseStrength.value = fx.mouse;

    // Birth particles
    birth.points.visible = state.birthAlpha > 0.001 && state.dissolve < 0.999;
    if (birth.points.visible) {
      const u = birth.mat.uniforms;
      u.uProgress.value = state.birth;
      u.uDissolve.value = state.dissolve;
      u.uAlpha.value = state.birthAlpha;
      u.uTime.value = time;
      u.uFocus.value = focusDist;
      u.uMouseStrength.value = fx.mouse;
    }

    // Glow + god rays (billboards behind the head)
    glow.position.copy(V.center).addScaledVector(V.dir, -0.9);
    glow.quaternion.copy(camera.quaternion);
    glow.scale.setScalar(7 * (1 + fx.pulse * 0.4));
    const gI = state.glow * 0.18 + state.birthAlpha * (1 - state.dissolve) * 0.13 + fx.pulse * 0.45 + state.flash * 0.38 + fx.hover * 0.04;
    glow.material.uniforms.uIntensity.value = gI;
    glow.visible = gI > 0.002;

    rays.position.copy(V.center).addScaledVector(V.dir, -2.2);
    rays.quaternion.copy(camera.quaternion);
    rays.scale.setScalar(18);
    const rI = state.rays * 0.18 * (0.85 + 0.15 * Math.sin(time * 0.7)) + fx.pulse * 0.22;
    rays.material.uniforms.uIntensity.value = rI;
    rays.material.uniforms.uTime.value = time;
    rays.visible = rI > 0.002;

    beams.group.visible = state.beams > 0.002;
    beams.group.rotation.y += dt * 0.03;
    for (let i = 0; i < beams.mats.length; i++) {
      beams.mats[i].uniforms.uIntensity.value = state.beams * 0.36 * (0.8 + 0.2 * Math.sin(time * 0.4 + i * 2.1));
      beams.mats[i].uniforms.uTime.value = time;
    }

    // Floating petals, explosions, rings
    updateFloating(dt, time);
    updateBurst(dt);
    for (let i = 0; i < rings.length; i++) rings[i].quaternion.copy(camera.quaternion);

    // Screen flash overlay
    const fl = Math.min(1, state.flash * 0.38 + fx.pulse * 0.5);
    if (Math.abs(fl - lastFlash) > 0.003) {
      DOM.flash.style.opacity = fl.toFixed(3);
      lastFlash = fl;
    }

    // Post-processing uniforms
    if (post && useComposer) {
      post.bloom.strength = 0.45 + state.flash * 0.7 + fx.pulse * 0.8 + state.glow * 0.08;
      V.proj.copy(V.center).project(camera);
      post.final.uniforms.uFocus.value.set(V.proj.x * 0.5 + 0.5, V.proj.y * 0.5 + 0.5);
      post.final.uniforms.uDof.value = LEVELS[perf.level].dof * (0.35 + 0.65 * smooth(0, 1, state.growth));
    }
  }

  function render() {
    if (useComposer && post) post.composer.render();
    else renderer.render(scene, camera);
  }

  function loop() {
    app.rafId = requestAnimationFrame(loop);
    try {
      const dt = Math.min(clock.getDelta(), 1 / 20);
      app.elapsed += dt;
      update(dt, app.elapsed);
      render();
      runHooks('frame', dt, app.elapsed);
      monitor(dt);
    } catch (err) {
      cancelAnimationFrame(app.rafId);
      showFatal(err);
    }
  }

  /* ------------------------------------------------------------------------
     19. INTERACTION
     ------------------------------------------------------------------------ */
  function setHover(on) {
    if (on === app.hovering) return;
    app.hovering = on;
    DOM.canvas.classList.toggle('is-hovering', on);
  }

  function isVisibleDeep(obj) {
    let o = obj;
    while (o) {
      if (!o.visible) return false;
      o = o.parent;
    }
    return true;
  }

  function pinchPair() {
    let a = null;
    let b = null;
    touches.forEach((t) => { if (!a) a = t; else if (!b) b = t; });
    return [a, b];
  }

  function resumePinchFallback() {
    const t = pinchPair()[0];
    if (!t) return;
    pointer.downX = t.x;
    pointer.downY = t.y;
    pointer.downT = performance.now();
    orbit.dragging = true;
    orbit.moved = 60;
    orbit.lastX = t.x;
    orbit.lastY = t.y;
    orbit.velYaw = 0;
  }

  function onPointerMove(e) {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.on) {
      if (touches.size >= 2) {
        const pair = pinchPair();
        const dist = Math.max(1, Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y));
        const ang = Math.atan2(pair[1].y - pair[0].y, pair[1].x - pair[0].x);
        orbit.zoom = clamp(pinch.startZoom * pinch.startDist / Math.max(24, dist), 0.55, 1.7);
        orbit.yaw = pinch.startYaw - (ang - pinch.startAng);
        idle.lastInput = performance.now();
      }
      if (e.isPrimary === false) return;
    }
    if (e.isPrimary === false) return;
    pointer.nx = (e.clientX / viewport.w) * 2 - 1;
    pointer.ny = -(e.clientY / viewport.h) * 2 + 1;
    pointer.active = true;
    pointer.type = e.pointerType || 'mouse';
    pointer.hoverDirty = true;
    par.tx = pointer.nx;
    par.ty = pointer.ny;
    idle.lastInput = performance.now();
    if (orbit.dragging) {
      const mdx = e.clientX - orbit.lastX;
      const mdy = e.clientY - orbit.lastY;
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
      orbit.moved += Math.abs(mdx) + Math.abs(mdy);
      orbit.yaw -= mdx * 0.006;
      orbit.pitch = clamp(orbit.pitch + mdy * 0.004, -0.3, 0.6);
      orbit.velYaw = -mdx * 0.32;
    }
    if (pointer.type !== 'mouse') clearTimeout(pointer.releaseTimer);
  }

  function onPointerDown(e) {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if ((e.pointerType || 'mouse') !== 'mouse' && touches.size >= 2) {
      // Second finger lands — begin pinch zoom + two-finger rotate
      const pair = pinchPair();
      pinch.on = true;
      pinch.startZoom = orbit.zoom;
      pinch.startDist = Math.max(1, Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y));
      pinch.startAng = Math.atan2(pair[1].y - pair[0].y, pair[1].x - pair[0].x);
      pinch.startYaw = orbit.yaw;
      orbit.dragging = false;
      orbit.velYaw = 0;
      return;
    }
    if (e.isPrimary === false) return;
    pointer.downX = e.clientX;
    pointer.downY = e.clientY;
    pointer.downT = performance.now();
    idle.lastInput = performance.now();
    orbit.dragging = true;
    orbit.moved = 0;
    orbit.lastX = e.clientX;
    orbit.lastY = e.clientY;
    orbit.velYaw = 0;
    onPointerMove(e);
  }

  function onPointerUp(e) {
    const wasTouch = (e.pointerType || 'mouse') !== 'mouse';
    touches.delete(e.pointerId);
    if (pinch.on) {
      if (touches.size < 2) {
        pinch.on = false;
        if (touches.size === 1 && wasTouch) {
          // One finger remains — fall back to single-finger orbit without a click
          resumePinchFallback();
        }
      }
      return;
    }
    if (e.isPrimary === false) {
      if (wasTouch) { orbit.dragging = false; releaseTouch(); }
      return;
    }
    const dx = e.clientX - pointer.downX;
    const dy = e.clientY - pointer.downY;
    const dtm = performance.now() - pointer.downT;
    if (dx * dx + dy * dy < 144 && dtm < 600) handleClick(e.clientX, e.clientY);
    orbit.dragging = false;
    if (wasTouch) releaseTouch();
  }

  function onWheel(e) {
    e.preventDefault();
    idle.lastInput = performance.now();
    orbit.zoom = clamp(orbit.zoom * Math.exp(e.deltaY * 0.0012), 0.55, 1.7);
  }

  function releaseTouch(e) {
    if (e && e.pointerId !== undefined) touches.delete(e.pointerId);
    if (pinch.on && touches.size < 2) {
      pinch.on = false;
      if (touches.size === 1) {
        // One finger remains — fall back to single-finger orbit without a click
        resumePinchFallback();
        clearTimeout(pointer.releaseTimer);
        return;
      }
    }
    orbit.dragging = false;
    clearTimeout(pointer.releaseTimer);
    pointer.releaseTimer = setTimeout(() => {
      pointer.active = false;
      par.tx = 0;
      par.ty = 0;
    }, 1400);
  }

  function onPointerLeave() {
    touches.clear();
    pinch.on = false;
    pointer.active = false;
    par.tx = 0;
    par.ty = 0;
    setHover(false);
  }

  function handleClick(x, y) {
    if (!app.started || app.crashed || app.replaying) return;
    const now = performance.now();
    if (now - lastClick.t < 350 && Math.abs(x - lastClick.x) + Math.abs(y - lastClick.y) < 30) {
      lastClick.t = 0;
      petalStorm();
      return;
    }
    lastClick.t = now;
    lastClick.x = x;
    lastClick.y = y;
    V.ndc.set((x / viewport.w) * 2 - 1, -(y / viewport.h) * 2 + 1);
    raycaster.setFromCamera(V.ndc, camera);
    let hit = null;
    if (state.budScale > 0.2 || state.growth > 0.3) {
      const hits = raycaster.intersectObjects(rose.clickTargets, false);
      for (let i = 0; i < hits.length; i++) {
        if (isVisibleDeep(hits[i].object)) { hit = hits[i]; break; }
      }
    }
    if (hit) roseBurst(hit.point);
    else energyRing();
  }

  function roseBurst(point) {
    const center = V.center.clone();
    spawnBurst(center, profile.explosion * 0.6, 'rose', 1);
    spawnBurst(point, 90, 'gold', 0.6);
    spawnRing(center, { from: 0.6, to: 10, duration: 2.6, a: PAL.ruby.getHex(), b: PAL.champagne.getHex(), thickness: 0.028, depthTest: false });
    spawnRing(center, { from: 0.3, to: 6.5, duration: 2.2, delay: 0.12, a: PAL.gold.getHex(), b: PAL.champagne.getHex(), thickness: 0.04, depthTest: false });
    gsap.killTweensOf(fx, 'pulse');
    gsap.fromTo(fx, { pulse: 1 }, { pulse: 0, duration: 2.2, ease: 'power3.out' });
    Sound.chime([659.25, 880, 987.77, 1318.51], 0.06, 0.08);
  }

  function petalStorm() {
    const center = V.center.clone();
    const cap = [12, 9, 6][profile.tier];
    let n = 0;
    for (let i = 0; i < floating.data.length && n < cap; i++) {
      const d = floating.data[i];
      d.storm = rand(2.6, 4.2);
      d.spread = rand(0.8, 1.6);
      d.stormR = rand(0.15, 0.45);
      d.y = center.y + rand(-0.4, 0.5);
      d.speed = rand(1.4, 2.8) * (Math.random() < 0.5 ? -1 : 1);
      d.rise = rand(-0.5, -0.2);
      n++;
    }
    spawnBurst(center, profile.explosion * 0.5, 'rose', 1.1);
    spawnRing(center, { from: 0.4, to: 7.5, duration: 2.4, a: PAL.ruby.getHex(), b: PAL.champagne.getHex(), thickness: 0.03, depthTest: false });
    gsap.killTweensOf(fx, 'pulse');
    gsap.fromTo(fx, { pulse: 0.7 }, { pulse: 0, duration: 1.8, ease: 'power3.out' });
    Sound.chime([523.25, 659.25, 783.99, 1046.5], 0.05, 0.07);
  }

  function energyRing() {
    const point = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, point)) raycaster.ray.at(8, point);
    spawnRing(point, { from: 0.2, to: 4.2, duration: 2.0, a: PAL.gold.getHex(), b: PAL.ruby.getHex(), thickness: 0.05 });
    spawnRing(point, { from: 0.1, to: 2.6, duration: 1.8, delay: 0.18, a: PAL.ruby.getHex(), b: PAL.champagne.getHex(), thickness: 0.035 });
    spawnBurst(point, 70, 'gold', 0.45);
    Sound.chime([196, 293.66, 392], 0.045, 0.05);
  }

  function fsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function capturePhoto() {
    if (!app.started || app.crashed) return;
    try {
      render();
      const url = renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'eternal-bouquet-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      Sound.chime([392, 523.25], 0.03, 0.04);
      showToast('บันทึกวินาทีนี้แล้ว');
    } catch (err) {
      console.warn('[Eternal Rose] Photo failed:', err);
      showToast('บันทึกรูปไม่สำเร็จ');
    }
  }

  function toggleFullscreen() {
    const el = document.documentElement;
    try {
      if (!fsElement()) {
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (!req) {
          showToast('อุปกรณ์นี้ไม่รองรับโหมดเต็มจอ');
          return;
        }
        const r = req.call(el);
        if (r && typeof r.catch === 'function') r.catch(() => showToast('เบราว์เซอร์ปิดกั้นโหมดเต็มจอ'));
      } else {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) safe(exit.call(document));
      }
    } catch (err) {
      showToast('ไม่สามารถเปิดโหมดเต็มจอได้');
    }
  }

  function onFsChange() {
    const on = !!fsElement();
    DOM.fsLabel.textContent = on ? 'ออก' : 'เต็มจอ';
    DOM.fullscreenBtn.setAttribute('aria-pressed', String(on));
    scheduleResize();
  }

  function toggleMacro() {
    if (!app.started || app.crashed || app.replaying) return;
    macro.on = !macro.on;
    idle.lastInput = performance.now();
    DOM.macroBtn.setAttribute('aria-pressed', String(macro.on));
    DOM.macroLabel.textContent = macro.on ? 'ชิดใจดอก' : 'มาโคร';
    Sound.chime(macro.on ? [523.25, 659.25, 783.99] : [783.99, 659.25, 523.25], 0.04, 0.05);
    showToast(macro.on ? 'มาโคร · ซุมลึกเข้าใจดอก' : 'มาโคร · ถอยกลับภาพกว้าง', 1800);
  }

  function toggleCinema() {
    if (!app.started || app.crashed) return;
    cinema.on = !cinema.on;
    document.body.classList.toggle('is-cinema', cinema.on);
    DOM.cinemaBtn.setAttribute('aria-pressed', String(cinema.on));
    idle.lastInput = performance.now();
    Sound.chime(cinema.on ? [392, 523.25, 659.25] : [659.25, 523.25, 392], 0.04, 0.05);
    showToast(cinema.on ? 'ภาพยนตร์ · เหลือเพียงภาพ' : 'ภาพยนตร์ · กลับสู่ฉาก', 1600);
  }

  function replay() {
    if (!app.started || app.replaying || app.crashed) return;
    app.replaying = true;
    DOM.story.classList.remove('is-visible');
    DOM.eyebrow.classList.remove('is-visible');
    DOM.hint.classList.remove('is-visible');
    gsap.to(DOM.curtain, {
      opacity: 1, duration: 1.1, ease: 'power2.inOut',
      onComplete: () => {
        if (app.timeline) app.timeline.kill();
        gsap.killTweensOf(state);
        gsap.killTweensOf(cam);
        gsap.killTweensOf(fx);
        Object.assign(state, INITIAL_STATE);
        Object.assign(cam, INITIAL_CAM);
        fx.pulse = 0;
        macro.on = false;
        macro.blend = 0;
        cinema.on = false;
        document.body.classList.remove('is-cinema');
        DOM.macroBtn.setAttribute('aria-pressed', 'false');
        DOM.macroLabel.textContent = 'มาโคร';
        DOM.cinemaBtn.setAttribute('aria-pressed', 'false');
        pinch.on = false;
        lastClick.t = 0;
        rose.root.rotation.set(0, 0, 0);
        clearRings();
        clearBurst();
        resetRoseCache();
        app.timeline = buildTimeline();
        gsap.to(DOM.curtain, {
          opacity: 0, duration: 1.4, delay: 0.25, ease: 'power2.inOut',
          onComplete: () => { app.replaying = false; }
        });
        gsap.delayedCall(0.4, () => app.timeline.play(0));
      }
    });
  }

  function onVisibility() {
    if (!Sound.ctx || !Sound.on) return;
    if (document.hidden) safe(Sound.ctx.suspend());
    else safe(Sound.ctx.resume());
  }

  function onKey(e) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = (e.key || '').toLowerCase();
    if (k === 'r') replay();
    else if (k === 'm') Sound.toggle();
    else if (k === 'f') toggleFullscreen();
    else if (k === 'z') toggleMacro();
    else if (k === 'c') toggleCinema();
  }

  function bindEvents() {
    window.addEventListener('resize', scheduleResize);
    window.addEventListener('orientationchange', () => setTimeout(scheduleResize, 250));
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('blur', onPointerLeave);
    document.documentElement.addEventListener('mouseleave', onPointerLeave);
    DOM.canvas.addEventListener('pointerdown', onPointerDown);
    DOM.canvas.addEventListener('pointerup', onPointerUp);
    DOM.canvas.addEventListener('pointercancel', releaseTouch);
    DOM.canvas.addEventListener('wheel', onWheel, { passive: false });
    DOM.soundBtn.addEventListener('click', () => Sound.toggle());
    DOM.fullscreenBtn.addEventListener('click', toggleFullscreen);
    DOM.shotBtn.addEventListener('click', capturePhoto);
    DOM.macroBtn.addEventListener('click', toggleMacro);
    DOM.cinemaBtn.addEventListener('click', toggleCinema);
    DOM.replayBtn.addEventListener('click', replay);
    const themeDots = document.querySelectorAll('.themes__dot');
    themeDots.forEach((d) => d.addEventListener('click', () => {
      idle.lastInput = performance.now();
      applyTheme(+d.dataset.theme);
    }));
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onKey);
    DOM.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      cancelAnimationFrame(app.rafId);
      showFatal(makeError('บริบทกราฟิกขาดหาย โปรดโหลดหน้าใหม่เพื่อให้กุหลาบบานอีกครั้ง'));
    }, false);
  }

  /* ------------------------------------------------------------------------
     20. BOOT / ERROR HANDLING
     ------------------------------------------------------------------------ */
  function friendly(err) {
    if (err && err.userMessage) return err.userMessage;
    return 'มีบางอย่างขัดจังหวะการบาน โปรดโหลดหน้าใหม่เพื่อลองอีกครั้ง';
  }

  function showFatal(err) {
    if (app.crashed) return;
    app.crashed = true;
    console.warn('[Eternal Rose]', err);
    DOM.ui.classList.remove('is-ready');
    DOM.loader.classList.remove('is-leaving', 'is-hidden');
    Loader.fail(friendly(err));
  }

  function fontsReady(ms) {
    if (!document.fonts || !document.fonts.ready) return Promise.resolve();
    return Promise.race([document.fonts.ready.catch(() => {}), wait(ms)]);
  }

  function startExperience() {
    app.started = true;
    Loader.hide();
    DOM.ui.classList.add('is-ready');
    DOM.phase.classList.add('is-visible');
    app.timeline = buildTimeline();
    gsap.delayedCall(0.9, () => app.timeline.play(0));
  }

  async function boot() {
    const t0 = performance.now();
    Loader.start();
    Loader.set(6, 'กำลังรวบรวมแสง');
    try {
      await wait(120);
      if (typeof window.THREE === 'undefined') {
        throw makeError('โหลดเอนจิ้นสามมิติไม่สำเร็จ โปรดตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่อีกครั้ง');
      }
      if (typeof window.gsap === 'undefined') {
        throw makeError('โหลดเอนจิ้นอนิเมชันไม่สำเร็จ โปรดตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่อีกครั้ง');
      }
      if (!webglAvailable()) {
        throw makeError('เบราว์เซอร์หรืออุปกรณ์ของคุณไม่รองรับ WebGL ซึ่งจำเป็นในการแสดงกุหลาบสามมิติ');
      }

      Loader.set(16, 'กำลังปลุกกราฟิกสามมิติ');
      profile = detectProfile();
      perf.level = profile.startLevel;
      initRenderer();
      initScene();
      await nextFrame();

      Loader.set(32, 'กำลังระบายสีห้วงจักรวาล');
      buildBackground();
      buildStars();
      buildDust();
      buildLightFX();
      await nextFrame();

      Loader.set(50, 'กำลังปั้นกลีบดอก');
      buildRose();
      await nextFrame();

      Loader.set(68, 'กำลังหว่านอนุภาคแสง');
      buildBirth();
      buildFloating();
      buildExplosion();
      buildVase();
      buildButterflies();
      buildFireflies();
      buildMist();
      buildGround();
      buildMoon();
      buildAurora();
      buildMilkyWay();
      buildRain();
      buildStamens();
      buildSprigs();
      applyTheme(0, true);
      await nextFrame();
      runHooks('build');

      Loader.set(82, 'กำลังเรียงแสงให้สมดุล');
      initPost();
      onResize();
      applyLevel(perf.level, true);
      update(0, 0);
      renderer.compile(scene, camera);
      render();

      Loader.set(92, 'กำลังเตรียมการบาน');
      await fontsReady(2500);
      Loader.set(100, 'กุหลาบรอการชมอยู่');
      await Promise.all([
        Loader.waitFull(),
        wait(Math.max(0, MIN_LOADER_MS - (performance.now() - t0)))
      ]);

      bindEvents();
      clock.getDelta();
      loop();
      startExperience();
    } catch (err) {
      console.warn('[Eternal Rose] Boot failed:', err);
      Loader.fail(friendly(err));
    }
  }
  /* ------------------------------------------------------------------------
     21. LUXE HOOKS — exposes the core to the upgrade layer
     ------------------------------------------------------------------------ */
  window.ROSE_CORE = {
    hooks: { build: [], frame: [], timeline: [], theme: [] },
    state, cam, fx, par, app, perf, viewport, rose, Sound, spawnBurst, spawnRing,
    get scene() { return scene; },
    get camera() { return camera; },
    get renderer() { return renderer; },
    get post() { return post; },
    get useComposer() { return useComposer; },
    get profile() { return profile; },
    get V() { return V; },
    get PAL() { return PAL; },
    get macro() { return macro; },
    get cinema() { return cinema; },
    get orbit() { return orbit; },
    get floating() { return floating; }
  };

  function runHooks(name) {
    const args = Array.prototype.slice.call(arguments, 1);
    const list = window.ROSE_CORE.hooks[name];
    list.slice().forEach((fn) => {
      try { fn.apply(null, args); }
      catch (err) {
        console.warn('[Eternal Rose] Luxe hook disabled (' + name + '):', err);
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      }
    });
  }

  DOM.retryBtn.addEventListener('click', () => window.location.reload());
  boot();
})();
/* ==========================================================================
   ETERNAL ROSE — LUXE EDITION (upgrade layer)
   Gilded petals · Golden reflections · Dewdrops · Helix of light
   Celestial rings · Bloom climax · Bokeh · Shooting stars · Luxury cursor
   ========================================================================== */
(function () {
  'use strict';
  const C = window.ROSE_CORE;
  if (!C || typeof THREE === 'undefined') return;

  const sm = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const LX0 = { bokeh: 0.25, helix: 0, dew: 0, gild: 0, halo: 0, streak: 0 };
  const lx = Object.assign({}, LX0);
  const L = {};
  const T = { fwd: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), worldUp: new THREE.Vector3(0, 1, 0) };

  /* ---------- Shaders ---------- */
  const UV_VERT = `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `;

  const SOFT_FRAG = `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5) discard;
      float a = pow(1.0 - d * 2.0, 1.8);
      gl_FragColor = vec4(vColor, a * vAlpha);
    }
  `;

  const HELIX_VERT = `
    attribute float aT;
    attribute float aSide;
    attribute float aJit;
    uniform float uTime;
    uniform float uGrow;
    uniform float uAlpha;
    uniform float uPR;
    uniform float uSize;
    uniform vec3 uColA;
    uniform vec3 uColB;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      float t = fract(aT + uTime * 0.035);
      float ang = t * 6.2831853 * 4.5 + aSide * 3.14159265 + uTime * 0.5 + aJit * 0.5;
      float rad = mix(0.46, 0.16, t) * (1.0 + 0.18 * sin(uTime * 1.3 + aJit * 30.0));
      vec3 p = vec3(cos(ang) * rad, mix(-4.7, 0.25, t) + aJit * 0.05, sin(ang) * rad);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = min(uSize * uPR * (0.6 + aJit) * (10.0 / max(-mv.z, 0.1)), 40.0 * uPR);
      float reveal = 1.0 - smoothstep(uGrow - 0.06, uGrow, t);
      float ends = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.9, 1.0, t));
      vColor = mix(uColA, uColB, aSide) * 1.4;
      vAlpha = uAlpha * reveal * ends * (0.35 + 0.65 * aJit);
    }
  `;

  const BOKEH_VERT = `
    attribute float aSize;
    attribute float aSeed;
    attribute vec3 aColor;
    uniform float uTime;
    uniform float uAlpha;
    uniform float uPR;
    uniform float uScale;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec3 p = position;
      p.y += sin(uTime * 0.15 + aSeed * 6.0) * 0.6;
      p.x += cos(uTime * 0.11 + aSeed * 4.0) * 0.6;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      float persp = clamp(9.0 / max(-mv.z, 0.5), 0.5, 2.6);
      gl_PointSize = min(aSize * uScale * uPR * persp, 120.0 * uPR);
      vColor = aColor;
      vAlpha = uAlpha * (0.6 + 0.4 * sin(uTime * 0.5 + aSeed * 10.0));
    }
  `;

  const BOKEH_FRAG = `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      if (d > 1.0) discard;
      float disc = smoothstep(1.0, 0.86, d);
      float rim = smoothstep(0.7, 0.95, d) * disc;
      gl_FragColor = vec4(vColor, (disc * 0.45 + rim * 0.55) * vAlpha);
    }
  `;

  const STREAK_FRAG = `
    uniform float uI;
    uniform vec3 uColA;
    uniform vec3 uColB;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float h = exp(-abs(p.x) * 3.2) * exp(-p.y * p.y * 60.0);
      vec2 q = p * 6.0;
      float core = exp(-dot(q, q));
      vec3 col = mix(uColA, uColB, exp(-abs(p.x) * 6.0));
      gl_FragColor = vec4(col, (h + core * 0.8) * uI);
    }
  `;

  /* ---------- 1. Golden environment reflections ---------- */
  function buildEnvironment() {
    const env = new THREE.Scene();
    const box = new THREE.BoxGeometry(1, 1, 1);
    const panel = (hex, k, p, s) => {
      const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(p[0], p[1], p[2]);
      m.scale.set(s[0], s[1], s[2]);
      env.add(m);
    };
    panel(0xffe2b8, 4.0, [3, 6, 4], [4, 0.2, 4]);
    panel(0xff1e3c, 3.0, [-6, 1.5, -4], [0.2, 5, 5]);
    panel(0xd6b26e, 2.2, [6, 0.5, -3], [0.2, 4, 3]);
    panel(0x3a0610, 1.0, [0, -6, 0], [14, 0.2, 14]);
    const pm = new THREE.PMREMGenerator(C.renderer);
    L.envRT = pm.fromScene(env, 0.04);
    pm.dispose();
    C.scene.environment = L.envRT.texture;
    L.envPanels = env.children.slice(0, 3);
    L.rebakeEnv = function () {
      const pm2 = new THREE.PMREMGenerator(C.renderer);
      const rt = pm2.fromScene(env, 0.04);
      pm2.dispose();
      if (L.envRT) L.envRT.dispose();
      L.envRT = rt;
      C.scene.environment = rt.texture;
    };
    L.envMats = [];
    C.rose.root.traverse((o) => {
      if (o.material && o.material.isMeshStandardMaterial) {
        o.material.envMapIntensity = 0.45;
        if (L.envMats.indexOf(o.material) < 0) L.envMats.push(o.material);
      }
    });
  }

  /* ---------- 2. Gilded edges + velvet sheen on petals ---------- */
  function upgradePetals() {
    const petals = C.rose.petals;
    if (!petals.length) return;
    petals.forEach((p) => {
      const g = p.mesh.geometry;
      const uv = g.attributes.uv.array;
      const n = uv.length / 2;
      const e = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const ax = Math.abs(uv[k * 2] * 2 - 1);
        const v = uv[k * 2 + 1];
        e[k] = Math.max(sm(0.8, 1, ax) * sm(0.35, 0.95, v), sm(0.88, 1, v)) * (0.4 + 0.6 * p.def.t);
      }
      g.setAttribute('aEdge', new THREE.BufferAttribute(e, 1));
    });

    const mat = petals[0].mesh.material;
    L.gild = { value: 0 };
    const gildColor = { value: new THREE.Color(1.0, 0.68, 0.3) };
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      sh.uniforms.uGild = L.gild;
      sh.uniforms.uGildColor = gildColor;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aEdge;\nvarying float vEdge;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = aEdge;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uGild;\nuniform vec3 uGildColor;\nvarying float vEdge;')
        .replace('#include <emissivemap_fragment>', [
          '#include <emissivemap_fragment>',
          '{',
          '  float vf = 1.0 - abs(dot(normal, normalize(vViewPosition)));',
          '  diffuseColor.rgb *= 0.72 + 0.62 * pow(vf, 1.6);',
          '  totalEmissiveRadiance += uGildColor * vEdge * uGild * (0.6 + 0.8 * pow(vf, 2.0));',
          '}'
        ].join('\n'));
    };
    mat.customProgramCacheKey = () => 'eternal-rose-luxe-petal';
    mat.needsUpdate = true;
  }

  /* ---------- 3. Dewdrops ---------- */
  function buildDew() {
    L.dew = [];
    const count = [16, 9, 0][C.profile.tier];
    if (!count) return;
    const mat = new THREE.MeshStandardMaterial({
      color: 0xfff4ea, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.55,
      envMapIntensity: 3, emissive: 0x2a0a0a
    });
    const geo = new THREE.SphereGeometry(1, 14, 10);
    const outer = C.rose.petals.filter((p) => p.def.t > 0.45);
    if (!outer.length) return;
    for (let i = 0; i < count; i++) {
      const p = outer[Math.floor(Math.random() * outer.length)];
      const g = p.mesh.geometry;
      const nU = g.userData.nU;
      const nV = g.userData.nV;
      const j = Math.round(rnd(0.45, 0.82) * nV);
      const ii = Math.round(rnd(0.3, 0.7) * nU);
      const m = new THREE.Mesh(geo, mat);
      m.userData.idx = j * (nU + 1) + ii;
      m.userData.r = rnd(0.012, 0.026);
      m.visible = false;
      p.mesh.add(m);
      L.dew.push(m);
    }
  }

  /* ---------- 4. Celestial rings ---------- */
  function buildHalo() {
    const group = new THREE.Group();
    L.rings = [];
    [[1.55, 0.35, 0.2, 0.18], [1.95, -0.5, 0.6, -0.12], [2.45, 0.15, -0.4, 0.08]].forEach((d) => {
      const tilt = new THREE.Group();
      tilt.rotation.set(Math.PI / 2 + d[1], d[2], 0);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(d[0], 0.0045, 6, 220),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(1.0, 0.74, 0.4).multiplyScalar(1.6),
          transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
        })
      );
      const comet = new THREE.Mesh(
        new THREE.SphereGeometry(0.028, 10, 8),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(1, 0.85, 0.65).multiplyScalar(5),
          transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
        })
      );
      comet.position.x = d[0];
      ring.add(comet);
      tilt.add(ring);
      group.add(tilt);
      L.rings.push({ ring: ring, comet: comet, speed: d[3] * 2.4 });
    });
    group.visible = false;
    C.scene.add(group);
    L.halo = group;
  }

  /* ---------- 5. Golden helix around the stem ---------- */
  function buildHelix() {
    const n = [1400, 900, 500][C.profile.tier];
    const aT = new Float32Array(n);
    const aSide = new Float32Array(n);
    const aJit = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      aT[i] = i / n;
      aSide[i] = i % 2;
      aJit[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    geo.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
    geo.setAttribute('aJit', new THREE.BufferAttribute(aJit, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uGrow: { value: 0 }, uAlpha: { value: 0 },
        uPR: { value: 1 }, uSize: { value: 2.0 },
        uColA: { value: new THREE.Color(1.0, 0.74, 0.38) }, uColB: { value: new THREE.Color(1.0, 0.12, 0.2) }
      },
      vertexShader: HELIX_VERT,
      fragmentShader: SOFT_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.visible = false;
    C.rose.root.add(pts);
    L.helix = pts;
    L.helixMat = mat;
  }

  /* ---------- 6. Bokeh ---------- */
  function buildBokeh() {
    const n = [70, 48, 28][C.profile.tier];
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const seed = new Float32Array(n);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = rnd(3.5, 13);
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = rnd(-4, 4.5);
      pos[i * 3 + 2] = Math.sin(a) * r;
      size[i] = rnd(18, 70);
      seed[i] = Math.random();
      col.set(Math.random() < 0.55 ? [1.0, 0.7, 0.38] : [1.0, 0.16, 0.24], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uPR: { value: 1 }, uScale: { value: 1 } },
      vertexShader: BOKEH_VERT,
      fragmentShader: BOKEH_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 8;
    C.scene.add(pts);
    L.bokeh = pts;
  }

  /* ---------- 7. Anamorphic lens streak ---------- */
  function buildStreak() {
    L.streakU = { value: 0 };
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uI: L.streakU,
        uColA: { value: new THREE.Color(1.0, 0.25, 0.3) },
        uColB: { value: new THREE.Color(1.0, 0.9, 0.75) }
      },
      vertexShader: UV_VERT,
      fragmentShader: STREAK_FRAG,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    L.streakCols = { a: mat.uniforms.uColA, b: mat.uniforms.uColB };
    const quad = new THREE.PlaneGeometry(1, 1);
    const group = new THREE.Group();
    const h = new THREE.Mesh(quad, mat);
    h.scale.set(18, 1.4, 1);
    const v = new THREE.Mesh(quad, mat);
    v.scale.set(5, 0.9, 1);
    v.rotation.z = Math.PI / 2;
    [h, v].forEach((m) => { m.renderOrder = 9; m.frustumCulled = false; group.add(m); });
    group.visible = false;
    C.scene.add(group);
    L.streak = group;
  }

  /* ---------- 8. Shooting stars ---------- */
  function buildShooting() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 0.9, 0.75, 0, 0, 0]), 3));
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    C.scene.add(line);
    L.shoot = { line: line, cols: geo.attributes.color, t: 0, dur: 0, next: 8, from: new THREE.Vector3(), dir: new THREE.Vector3(), head: new THREE.Vector3() };
  }

  function spawnShootingStar() {
    const s = L.shoot;
    const cam = C.camera;
    cam.getWorldDirection(T.fwd);
    T.right.crossVectors(T.fwd, T.worldUp).normalize();
    T.up.crossVectors(T.right, T.fwd).normalize();
    s.from.copy(cam.position)
      .addScaledVector(T.fwd, 55)
      .addScaledVector(T.right, rnd(-25, 25))
      .addScaledVector(T.up, rnd(8, 22));
    const side = Math.random() < 0.5 ? -1 : 1;
    s.dir.copy(T.right).multiplyScalar(side).addScaledVector(T.up, -0.45).normalize();
    s.t = 0;
    s.dur = rnd(0.9, 1.5);
  }

  function updateShooting(dt, time) {
    const s = L.shoot;
    if (!s) return;
    if (s.dur > 0) {
      s.t += dt;
      const k = s.t / s.dur;
      if (k >= 1) {
        s.dur = 0;
        s.line.material.opacity = 0;
        s.next = time + rnd(4, 9);
        return;
      }
      s.head.copy(s.from).addScaledVector(s.dir, k * 34);
      const p = s.line.geometry.attributes.position;
      p.setXYZ(0, s.head.x, s.head.y, s.head.z);
      p.setXYZ(1, s.head.x - s.dir.x * 7, s.head.y - s.dir.y * 7, s.head.z - s.dir.z * 7);
      p.needsUpdate = true;
      s.line.material.opacity = Math.sin(Math.PI * k) * 0.9;
    } else if (time > s.next && C.state.dust > 0.5) {
      spawnShootingStar();
    }
  }
  /* ---------- 9. Luxury DOM: corners, letterbox, cursor ---------- */
  function buildDOM() {
    const ui = document.getElementById('ui');
    ['tl', 'tr', 'bl', 'br'].forEach((c) => {
      const d = document.createElement('span');
      d.className = 'lux-corner lux-corner--' + c;
      d.setAttribute('aria-hidden', 'true');
      ui.appendChild(d);
    });
    ['top', 'bottom'].forEach((c) => {
      const d = document.createElement('div');
      d.className = 'lux-bar lux-bar--' + c;
      d.setAttribute('aria-hidden', 'true');
      document.body.appendChild(d);
    });

    if (!(window.matchMedia && window.matchMedia('(pointer: fine)').matches)) return;
    const cur = document.createElement('div');
    cur.className = 'lux-cursor';
    cur.setAttribute('aria-hidden', 'true');
    cur.innerHTML = '<span class="lux-cursor__ring"><em>บาน</em></span><span class="lux-cursor__dot"></span>';
    document.body.appendChild(cur);
    document.body.classList.add('has-lux-cursor');
    const c = { el: cur, ring: cur.firstChild, dot: cur.lastChild, x: -200, y: -200, rx: -200, ry: -200, shown: false };
    L.cursor = c;

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      c.x = e.clientX;
      c.y = e.clientY;
      if (!c.shown) {
        c.shown = true;
        c.rx = c.x;
        c.ry = c.y;
        cur.classList.add('is-visible');
      }
      const overUi = !!(e.target && e.target.closest && e.target.closest('button, a'));
      cur.classList.toggle('is-ui', overUi);
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', () => {
      c.shown = false;
      cur.classList.remove('is-visible');
    });
    window.addEventListener('pointerdown', () => cur.classList.add('is-down'));
    window.addEventListener('pointerup', () => cur.classList.remove('is-down'));
  }

  function updateCursor(dt) {
    const c = L.cursor;
    if (!c) return;
    const k = 1 - Math.exp(-dt * 12);
    c.rx += (c.x - c.rx) * k;
    c.ry += (c.y - c.ry) * k;
    c.ring.style.transform = 'translate3d(' + c.rx.toFixed(1) + 'px,' + c.ry.toFixed(1) + 'px,0)';
    c.dot.style.transform = 'translate3d(' + c.x + 'px,' + c.y + 'px,0)';
    c.el.classList.toggle('is-hover', !!C.app.hovering);
  }

  /* ---------- 10. Bloom climax ---------- */
  function climax() {
    const c = C.V.center.clone();
    C.spawnBurst(c, C.profile.explosion, 'rose', 1.3);
    C.spawnRing(c, { from: 0.5, to: 14, duration: 3.2, a: C.PAL.ruby.getHex(), b: C.PAL.champagne.getHex(), thickness: 0.022, depthTest: false });
    C.spawnRing(c, { from: 0.3, to: 9, duration: 2.8, delay: 0.15, a: C.PAL.gold.getHex(), b: C.PAL.champagne.getHex(), thickness: 0.03, depthTest: false });
    C.spawnRing(c, { from: 0.2, to: 5, duration: 2.4, delay: 0.3, a: C.PAL.ruby.getHex(), b: C.PAL.champagne.getHex(), thickness: 0.05, depthTest: false });
    C.Sound.chime([523.25, 659.25, 783.99, 1046.5], 0.07, 0.09);
  }

  /* ---------- Timeline choreography ---------- */
  function onTimeline(tl) {
    Object.assign(lx, LX0);
    document.body.classList.add('is-luxe-frame');
    tl.to(lx, { bokeh: 0.6, duration: 4 }, 0);
    tl.to(lx, { helix: 1, duration: 2.5 }, 4.6);
    tl.to(lx, { dew: 1, duration: 3, ease: 'power2.out' }, 12.5);
    tl.call(climax, null, 14.0);
    tl.to(lx, { streak: 1, duration: 0.35, ease: 'power2.out' }, 14.0);
    tl.to(lx, { streak: 0, duration: 2.6, ease: 'power2.inOut' }, 14.4);
    tl.to(lx, { gild: 1, halo: 1, bokeh: 1, duration: 4 }, 15.5);
    tl.to(lx, { helix: 0.35, duration: 3 }, 16.5);
    tl.call(() => document.body.classList.remove('is-luxe-frame'), null, 17.2);
  }

  /* ---------- Per-frame update ---------- */
  function frame(dt, time) {
    const st = C.state;
    const V = C.V;
    const pr = C.renderer.getPixelRatio();
    const sf = C.viewport.sizeFactor;
    const lvl = C.perf.level;

    // Environment reflections dim with the core rig until the bud opens
    if (L.envMats && L.envMats.length) {
      const lit = 0.4 + 0.6 * sm(0, 1, st.bloom);
      for (let i = 0; i < L.envMats.length; i++) L.envMats[i].envMapIntensity = 0.45 * lit;
    }

    if (L.gild) L.gild.value = lx.gild * (0.75 + 0.25 * Math.sin(time * 1.2)) * 0.5;

    if (L.dew) {
      for (let i = 0; i < L.dew.length; i++) {
        const m = L.dew[i];
        m.visible = lx.dew > 0.01;
        if (!m.visible) continue;
        m.position.fromBufferAttribute(m.parent.geometry.attributes.position, m.userData.idx);
        const r = m.userData.r * lx.dew;
        m.scale.set(r, r * 0.7, r);
      }
    }

    if (L.halo) {
      L.halo.visible = lx.halo > 0.005;
      if (L.halo.visible) {
        L.halo.position.copy(V.center);
        L.halo.scale.setScalar((0.85 + 0.15 * lx.halo) * (1 + C.fx.pulse * 0.15));
        L.halo.rotation.y += dt * 0.08;
        for (let i = 0; i < L.rings.length; i++) {
          const r = L.rings[i];
          r.ring.rotation.z += dt * r.speed;
          r.ring.material.opacity = lx.halo * (0.32 + 0.12 * Math.sin(time * 0.8 + i * 2));
          r.comet.material.opacity = lx.halo;
        }
      }
    }

    if (L.helix) {
      const u = L.helix.material.uniforms;
      L.helix.visible = lx.helix > 0.005 && lvl < 3;
      u.uTime.value = time;
      u.uGrow.value = st.growth;
      u.uAlpha.value = lx.helix;
      u.uPR.value = pr;
      u.uSize.value = 2.0 * sf;
    }

    if (L.bokeh) {
      const u = L.bokeh.material.uniforms;
      L.bokeh.visible = lvl < 2;
      u.uTime.value = time;
      u.uAlpha.value = lx.bokeh * 0.22;
      u.uPR.value = pr;
      u.uScale.value = sf;
    }

    if (L.streak) {
      L.streak.position.copy(V.center).addScaledVector(V.dir, 0.6);
      L.streak.quaternion.copy(C.camera.quaternion);
      const si = lx.streak * 1.1 + C.fx.pulse * 0.45 + lx.gild * 0.05 * (0.5 + 0.5 * Math.sin(time * 0.9));
      L.streakU.value = si;
      L.streak.visible = si > 0.003;
    }

    if (C.post && C.useComposer) {
      C.post.bloom.strength += lx.streak * 0.6 + lx.gild * 0.07;
      C.post.bloom.radius = 0.62 + lx.streak * 0.2;
    }

    updateShooting(dt, time);
    updateCursor(dt);
  }

  /* ---------- Theme sync — recolor Luxe layers when the palette changes ---------- */
  C.hooks.theme.push(function (T) {
    const P = C.PAL;

    // Bokeh discs
    if (L.bokeh) {
      const arr = L.bokeh.geometry.attributes.aColor.array;
      for (let i = 0; i < arr.length / 3; i++) {
        const c = Math.random() < 0.55 ? P.gold : P.ruby;
        arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
      }
      L.bokeh.geometry.attributes.aColor.needsUpdate = true;
    }

    // Golden helix around the stem
    if (L.helixMat) {
      L.helixMat.uniforms.uColA.value.copy(P.gold);
      L.helixMat.uniforms.uColB.value.copy(P.ruby);
    }

    // Celestial rings + comets
    if (L.rings) L.rings.forEach((r) => {
      r.ring.material.color.copy(P.gold).multiplyScalar(1.6);
      r.comet.material.color.copy(P.champagne).multiplyScalar(5);
    });

    // Shooting star head
    if (L.shoot && L.shoot.cols) {
      const a = L.shoot.cols.array;
      a[0] = P.champagne.r; a[1] = P.champagne.g; a[2] = P.champagne.b;
      L.shoot.cols.needsUpdate = true;
    }

    // Anamorphic streak
    if (L.streakCols) {
      L.streakCols.a.value.set(T.streakA);
      L.streakCols.b.value.set(T.streakB);
    }

    // Golden environment reflections — rebake with themed panels
    if (L.envPanels && L.rebakeEnv) {
      L.envPanels[0].material.color.set(T.rimGold).multiplyScalar(4.0);
      L.envPanels[1].material.color.set(T.rimRed).multiplyScalar(3.0);
      L.envPanels[2].material.color.set(T.rimGold).multiplyScalar(2.2);
      L.rebakeEnv();
    }
  });

  /* ---------- Register ---------- */
  C.hooks.build.push(() => {
    [buildEnvironment, upgradePetals, buildDew, buildHalo, buildHelix, buildBokeh, buildStreak, buildShooting, buildDOM]
      .forEach((fn) => {
        try { fn(); }
        catch (err) { console.warn('[Eternal Rose] Luxe feature skipped:', fn.name, err); }
      });
  });
  C.hooks.frame.push(frame);
  C.hooks.timeline.push(onTimeline);
})();