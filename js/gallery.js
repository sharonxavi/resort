/* ═══════════════════════════════════════════════════════════════
   NEYTHAL — circular gallery

   Port of the React Bits <CircularGallery />. The rendering code (App,
   Media, Title, both shaders, the bend maths) is the original's; only the
   React wrapper is gone, since ogl is framework-agnostic and none of this
   ever needed React.

   Four deliberate changes from the original, each marked  ✦ CHANGED  below:

     1. Pointer and wheel listeners bind to the container, not window. The
        original spins the gallery whenever you scroll or drag anywhere on
        the page, including while it is off-screen.
     2. The render loop stops when the section leaves the viewport. The
        original runs rAF forever.
     3. Textures are cached per URL and downscaled before upload. The
        original duplicates the item list, so nine 2752px photos became
        eighteen full-size GPU textures — enough to kill mobile Safari.
     4. Font loading is trimmed to the case we use (a family already on the
        page). The stylesheet/font-file fetching branches were dead code here.
   ═══════════════════════════════════════════════════════════════ */

import { Camera, Mesh, Plane, Program, Renderer, Texture, Transform } from './vendor/ogl.js';

/* ── Config ─────────────────────────────────────────────────── */
const ITEMS = [
  { image: 'assets/infinity-pool.jpg',      text: 'The Long Pool' },
  { image: 'assets/spa-terrace-ocean.jpg',  text: 'Spa Terrace' },
  { image: 'assets/villa-private-pool.jpg', text: 'Garden Villa' },
  { image: 'assets/terrace-restaurant.jpg', text: 'Uppu' },
  { image: 'assets/thermal-bath-house.jpg', text: 'Thermal Hall' },
  { image: 'assets/sunset-bar.jpg',         text: 'Alaigal' },
  { image: 'assets/stone-hot-tub.jpg',      text: 'Stone Tubs' },
  { image: 'assets/yoga-pavilion.jpg',      text: 'The Pavilion' },
  { image: 'assets/path-to-beach.jpg',      text: 'To the Sand' }
];

const OPTS = {
  bend: 3,
  textColor: '#2A2A28',   // site ink — the section sits on sand, not on dark
  borderRadius: 0,        // this site has square corners everywhere
  font: '400 26px Jost',  // Jost is already loaded by the page
  scrollSpeed: 2,
  scrollEase: 0.045,
  /* Idle ripple amplitude. The original hardcodes 0.1, which makes the
     photos wobble continuously even when nothing is moving. At 0 they sit
     perfectly still and only ripple while being dragged or scrolled.
     Raise it (try 0.1) to get the original's constant motion back. */
  idleWobble: 0
};

/* Longest edge a texture is uploaded at. The planes render around 700px
   wide, so the 2752px originals are pure waste on the GPU.  ✦ CHANGED */
const MAX_TEXTURE_EDGE = 1280;

/* ── Helpers ────────────────────────────────────────────────── */
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

const lerp = (p1, p2, t) => p1 + (p2 - p1) * t;

function getFontSize(font) {
  const match = font.match(/(\d+)px/);
  return match ? parseInt(match[1], 10) : 30;
}

/* ✦ CHANGED — the original also fetched Google Fonts stylesheets and font
   files to build FontFaces. Our family is already on the page, so all that
   is needed is to wait for it before drawing text into a canvas; otherwise
   the first paint silently falls back to a system font. */
async function resolveFont(font) {
  if (document.fonts && document.fonts.load) {
    try {
      await document.fonts.load(font);
      await document.fonts.ready;
    } catch { /* fall back to whatever the browser gives us */ }
  }
  return font;
}

function createTextTexture(gl, text, font, color) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  context.font = font;
  const textWidth = Math.ceil(context.measureText(text).width);
  const textHeight = Math.ceil(getFontSize(font) * 1.2);

  canvas.width = (textWidth + 20) * dpr;
  canvas.height = (textHeight + 20) * dpr;
  context.scale(dpr, dpr);

  context.font = font;
  context.fillStyle = color;
  context.textBaseline = 'middle';
  context.textAlign = 'center';
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillText(text, (textWidth + 20) / 2, (textHeight + 20) / 2);

  const texture = new Texture(gl, { generateMipmaps: false });
  texture.image = canvas;
  return { texture, width: canvas.width, height: canvas.height };
}

/* ✦ CHANGED — one texture per URL, shared by every plane that uses it, and
   downscaled on the way in. */
const textureCache = new Map();

function getSharedTexture(gl, url) {
  if (textureCache.has(url)) return textureCache.get(url);

  const entry = { texture: new Texture(gl, { generateMipmaps: true }), width: 0, height: 0, ready: false, waiting: [] };
  textureCache.set(url, entry);

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    let source = img;
    if (img.naturalWidth > MAX_TEXTURE_EDGE) {
      const scale = MAX_TEXTURE_EDGE / img.naturalWidth;
      const c = document.createElement('canvas');
      c.width = MAX_TEXTURE_EDGE;
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      source = c;
    }
    entry.texture.image = source;
    entry.width = source.width;
    entry.height = source.height;
    entry.ready = true;
    entry.waiting.forEach(fn => fn(entry));
    entry.waiting.length = 0;
  };
  img.src = url;
  return entry;
}

/* ── Title ──────────────────────────────────────────────────── */
class Title {
  constructor({ gl, plane, text, textColor, font }) {
    Object.assign(this, { gl, plane, text, textColor, font });
    this.createMesh();
  }
  createMesh() {
    const { texture, width, height } = createTextTexture(this.gl, this.text, this.font, this.textColor);
    const geometry = new Plane(this.gl);
    const program = new Program(this.gl, {
      vertex: `
        attribute vec3 position;
        attribute vec2 uv;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragment: `
        precision highp float;
        uniform sampler2D tMap;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(tMap, vUv);
          if (color.a < 0.1) discard;
          gl_FragColor = color;
        }
      `,
      uniforms: { tMap: { value: texture } },
      transparent: true
    });
    this.mesh = new Mesh(this.gl, { geometry, program });
    const aspect = width / height;
    const textHeight = this.plane.scale.y * 0.14;
    const textWidth = textHeight * aspect;
    this.mesh.scale.set(textWidth, textHeight, 1);
    this.mesh.position.y = -this.plane.scale.y * 0.5 - textHeight * 0.5 - 0.06;
    this.mesh.setParent(this.plane);
  }
}

/* ── Media ──────────────────────────────────────────────────── */
class Media {
  constructor({ geometry, gl, image, index, length, scene, screen, text, viewport, bend, textColor, borderRadius, font, idleWobble }) {
    Object.assign(this, { geometry, gl, image, index, length, scene, screen, text, viewport, bend, textColor, borderRadius, font, idleWobble });
    this.extra = 0;
    this.createShader();
    this.createMesh();
    this.createTitle();
    this.onResize();
  }

  createShader() {
    const shared = getSharedTexture(this.gl, this.image);   // ✦ CHANGED

    this.program = new Program(this.gl, {
      depthTest: false,
      depthWrite: false,
      vertex: `
        precision highp float;
        attribute vec3 position;
        attribute vec2 uv;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        uniform float uTime;
        uniform float uSpeed;
        uniform float uIdle;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          // uIdle replaces the original's hardcoded 0.1 — at 0 the plane is
          // flat unless it is actually moving.
          p.z = (sin(p.x * 4.0 + uTime) * 1.5 + cos(p.y * 2.0 + uTime) * 1.5) * (uIdle + uSpeed * 0.5);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragment: `
        precision highp float;
        uniform vec2 uImageSizes;
        uniform vec2 uPlaneSizes;
        uniform sampler2D tMap;
        uniform float uBorderRadius;
        varying vec2 vUv;

        float roundedBoxSDF(vec2 p, vec2 b, float r) {
          vec2 d = abs(p) - b;
          return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0) - r;
        }

        void main() {
          vec2 ratio = vec2(
            min((uPlaneSizes.x / uPlaneSizes.y) / (uImageSizes.x / uImageSizes.y), 1.0),
            min((uPlaneSizes.y / uPlaneSizes.x) / (uImageSizes.y / uImageSizes.x), 1.0)
          );
          vec2 uv = vec2(
            vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
            vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
          );
          vec4 color = texture2D(tMap, uv);

          float d = roundedBoxSDF(vUv - 0.5, vec2(0.5 - uBorderRadius), uBorderRadius);
          float edgeSmooth = 0.002;
          float alpha = 1.0 - smoothstep(-edgeSmooth, edgeSmooth, d);

          gl_FragColor = vec4(color.rgb, alpha);
        }
      `,
      uniforms: {
        tMap: { value: shared.texture },
        uPlaneSizes: { value: [0, 0] },
        uImageSizes: { value: [0, 0] },
        uSpeed: { value: 0 },
        uTime: { value: 100 * Math.random() },
        uIdle: { value: this.idleWobble },
        uBorderRadius: { value: this.borderRadius }
      },
      transparent: true
    });

    const applySizes = e => { this.program.uniforms.uImageSizes.value = [e.width, e.height]; };
    if (shared.ready) applySizes(shared);
    else shared.waiting.push(applySizes);
  }

  createMesh() {
    this.plane = new Mesh(this.gl, { geometry: this.geometry, program: this.program });
    this.plane.setParent(this.scene);
  }

  createTitle() {
    this.title = new Title({
      gl: this.gl, plane: this.plane, text: this.text,
      textColor: this.textColor, font: this.font
    });
  }

  update(scroll, direction) {
    this.plane.position.x = this.x - scroll.current - this.extra;

    const x = this.plane.position.x;
    const H = this.viewport.width / 2;

    if (this.bend === 0) {
      this.plane.position.y = 0;
      this.plane.rotation.z = 0;
    } else {
      const B_abs = Math.abs(this.bend);
      const R = (H * H + B_abs * B_abs) / (2 * B_abs);
      const effectiveX = Math.min(Math.abs(x), H);
      const arc = R - Math.sqrt(R * R - effectiveX * effectiveX);
      if (this.bend > 0) {
        this.plane.position.y = -arc;
        this.plane.rotation.z = -Math.sign(x) * Math.asin(effectiveX / R);
      } else {
        this.plane.position.y = arc;
        this.plane.rotation.z = Math.sign(x) * Math.asin(effectiveX / R);
      }
    }

    /* Snap a settled scroll to exactly zero. lerp only ever approaches its
       target, so without this the plane keeps twitching on float residue. */
    this.speed = scroll.current - scroll.last;
    if (Math.abs(this.speed) < 1e-4) this.speed = 0;
    if (this.speed !== 0) this.program.uniforms.uTime.value += 0.04;
    this.program.uniforms.uSpeed.value = this.speed;

    const planeOffset = this.plane.scale.x / 2;
    const viewportOffset = this.viewport.width / 2;
    this.isBefore = this.plane.position.x + planeOffset < -viewportOffset;
    this.isAfter = this.plane.position.x - planeOffset > viewportOffset;
    if (direction === 'right' && this.isBefore) {
      this.extra -= this.widthTotal;
      this.isBefore = this.isAfter = false;
    }
    if (direction === 'left' && this.isAfter) {
      this.extra += this.widthTotal;
      this.isBefore = this.isAfter = false;
    }
  }

  onResize({ screen, viewport } = {}) {
    if (screen) this.screen = screen;
    if (viewport) this.viewport = viewport;
    this.scale = this.screen.height / 1500;
    this.plane.scale.y = (this.viewport.height * (900 * this.scale)) / this.screen.height;
    this.plane.scale.x = (this.viewport.width * (700 * this.scale)) / this.screen.width;
    this.plane.program.uniforms.uPlaneSizes.value = [this.plane.scale.x, this.plane.scale.y];
    this.padding = 2;
    this.width = this.plane.scale.x + this.padding;
    this.widthTotal = this.width * this.length;
    this.x = this.width * this.index;
  }
}

/* ── App ────────────────────────────────────────────────────── */
class App {
  constructor(container, { items, bend, textColor, borderRadius, font, scrollSpeed, scrollEase, idleWobble = 0 }) {
    this.idleWobble = idleWobble;
    this.container = container;
    this.scrollSpeed = scrollSpeed;
    this.scroll = { ease: scrollEase, current: 0, target: 0, last: 0 };
    this.onCheckDebounce = debounce(this.onCheck.bind(this), 200);
    this.raf = null;

    this.createRenderer();
    this.createCamera();
    this.createScene();
    this.onResize();
    this.createGeometry();
    this.createMedias(items, bend, textColor, borderRadius, font);
    this.addEventListeners();
    this.play();
  }

  createRenderer() {
    this.renderer = new Renderer({
      alpha: true,
      antialias: true,
      dpr: Math.min(window.devicePixelRatio || 1, 2)
    });
    this.gl = this.renderer.gl;
    this.gl.clearColor(0, 0, 0, 0);
    this.container.appendChild(this.gl.canvas);
  }

  createCamera() {
    this.camera = new Camera(this.gl);
    this.camera.fov = 45;
    this.camera.position.z = 20;
  }

  createScene() { this.scene = new Transform(); }

  createGeometry() {
    this.planeGeometry = new Plane(this.gl, { heightSegments: 50, widthSegments: 100 });
  }

  createMedias(items, bend, textColor, borderRadius, font) {
    /* Doubled so the loop has something to wrap into. */
    this.mediasImages = items.concat(items);
    this.medias = this.mediasImages.map((data, index) => new Media({
      geometry: this.planeGeometry,
      gl: this.gl,
      image: data.image,
      index,
      length: this.mediasImages.length,
      scene: this.scene,
      screen: this.screen,
      text: data.text,
      viewport: this.viewport,
      bend, textColor, borderRadius, font,
      idleWobble: this.idleWobble
    }));
  }

  /* ── input ────────────────────────────────────────────────── */
  onTouchDown(e) {
    this.isDown = true;
    this.container.classList.add('is-dragging');
    this.scroll.position = this.scroll.current;
    this.start = e.touches ? e.touches[0].clientX : e.clientX;
  }
  onTouchMove(e) {
    if (!this.isDown) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const distance = (this.start - x) * (this.scrollSpeed * 0.025);
    this.scroll.target = this.scroll.position + distance;
  }
  onTouchUp() {
    if (!this.isDown) return;
    this.isDown = false;
    this.container.classList.remove('is-dragging');
    this.onCheck();
  }
  onWheel(e) {
    const delta = e.deltaY || e.wheelDelta || e.detail;
    this.scroll.target += (delta > 0 ? this.scrollSpeed : -this.scrollSpeed) * 0.2;
    this.onCheckDebounce();
  }
  onKeyDown(e) {
    if (e.key === 'ArrowRight')      { e.preventDefault(); this.scroll.target += this.scrollSpeed * 5; this.onCheckDebounce(); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); this.scroll.target -= this.scrollSpeed * 5; this.onCheckDebounce(); }
    else if (e.key === 'Home')       { e.preventDefault(); this.scroll.target = 0; this.onCheckDebounce(); }
  }

  onCheck() {
    if (!this.medias || !this.medias[0]) return;
    const width = this.medias[0].width;
    const itemIndex = Math.round(Math.abs(this.scroll.target) / width);
    const item = width * itemIndex;
    this.scroll.target = this.scroll.target < 0 ? -item : item;
  }

  onResize() {
    this.screen = { width: this.container.clientWidth, height: this.container.clientHeight };
    this.renderer.setSize(this.screen.width, this.screen.height);
    this.camera.perspective({ aspect: this.screen.width / this.screen.height });
    const fov = (this.camera.fov * Math.PI) / 180;
    const height = 2 * Math.tan(fov / 2) * this.camera.position.z;
    const width = height * this.camera.aspect;
    this.viewport = { width, height };
    if (this.medias) this.medias.forEach(m => m.onResize({ screen: this.screen, viewport: this.viewport }));
  }

  /* ── loop ─────────────────────────────────────────────────── */
  update() {
    this.scroll.current = lerp(this.scroll.current, this.scroll.target, this.scroll.ease);
    const direction = this.scroll.current > this.scroll.last ? 'right' : 'left';
    if (this.medias) this.medias.forEach(m => m.update(this.scroll, direction));
    this.renderer.render({ scene: this.scene, camera: this.camera });
    this.scroll.last = this.scroll.current;
    this.raf = window.requestAnimationFrame(this.boundUpdate);
  }

  /* ✦ CHANGED — the original never stops rendering. */
  play() {
    if (this.raf) return;
    this.boundUpdate = this.boundUpdate || this.update.bind(this);
    this.raf = window.requestAnimationFrame(this.boundUpdate);
  }
  pause() {
    if (!this.raf) return;
    window.cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  /* ✦ CHANGED — scoped to the container. The original binds wheel and all
     pointer events to window, so the gallery reacts to scrolling and
     dragging anywhere on the page. Move/up stay on window so a drag that
     leaves the element still tracks and still releases. */
  addEventListeners() {
    this.boundOnResize    = this.onResize.bind(this);
    this.boundOnWheel     = this.onWheel.bind(this);
    this.boundOnTouchDown = this.onTouchDown.bind(this);
    this.boundOnTouchMove = this.onTouchMove.bind(this);
    this.boundOnTouchUp   = this.onTouchUp.bind(this);
    this.boundOnKeyDown   = this.onKeyDown.bind(this);

    window.addEventListener('resize', this.boundOnResize);

    this.container.addEventListener('wheel', this.boundOnWheel, { passive: true });
    this.container.addEventListener('mousedown', this.boundOnTouchDown);
    this.container.addEventListener('touchstart', this.boundOnTouchDown, { passive: true });
    this.container.addEventListener('keydown', this.boundOnKeyDown);

    window.addEventListener('mousemove', this.boundOnTouchMove);
    window.addEventListener('mouseup', this.boundOnTouchUp);
    window.addEventListener('touchmove', this.boundOnTouchMove, { passive: true });
    window.addEventListener('touchend', this.boundOnTouchUp);
  }

  destroy() {
    this.pause();
    window.removeEventListener('resize', this.boundOnResize);
    window.removeEventListener('mousemove', this.boundOnTouchMove);
    window.removeEventListener('mouseup', this.boundOnTouchUp);
    window.removeEventListener('touchmove', this.boundOnTouchMove);
    window.removeEventListener('touchend', this.boundOnTouchUp);
    this.container.removeEventListener('wheel', this.boundOnWheel);
    this.container.removeEventListener('mousedown', this.boundOnTouchDown);
    this.container.removeEventListener('touchstart', this.boundOnTouchDown);
    this.container.removeEventListener('keydown', this.boundOnKeyDown);
    if (this.renderer?.gl?.canvas?.parentNode) {
      this.renderer.gl.canvas.parentNode.removeChild(this.renderer.gl.canvas);
    }
  }
}

/* ── Boot ───────────────────────────────────────────────────── */
(async () => {
  const container = document.getElementById('circularGallery');
  const grid      = document.getElementById('galleryGrid');
  const altList   = document.getElementById('galleryAltList');
  const hint      = document.querySelector('.gallery__hint');
  if (!container) return;

  /* Bail before touching the DOM if this browser cannot render it, so the
     mosaic (and its lightbox) simply stays as it is. */
  const supportsWebGL = (() => {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch { return false; }
  })();
  if (!supportsWebGL) return;

  container.hidden = false;
  const font = await resolveFont(OPTS.font);

  let app;
  try {
    app = new App(container, { items: ITEMS, ...OPTS, font });
  } catch (err) {
    console.error('Circular gallery failed to start; keeping the mosaic.', err);
    container.hidden = true;
    return;
  }

  /* Only now is it safe to retire the fallback. */
  document.querySelector('.gallery')?.classList.add('gallery--webgl');
  if (altList) altList.hidden = false;
  if (hint) hint.hidden = false;
  if (grid) grid.setAttribute('aria-hidden', 'true');

  /* The original only watches window resize, which misses the container
     changing size on its own (scrollbar appearing, orientation change). */
  if ('ResizeObserver' in window) new ResizeObserver(() => app.onResize()).observe(container);

  /* ✦ CHANGED — render only while the section is on screen. */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      entries => entries.forEach(e => (e.isIntersecting ? app.play() : app.pause())),
      { rootMargin: '200px 0px' }
    ).observe(container);
  }
  document.addEventListener('visibilitychange', () => {
    document.hidden ? app.pause() : app.play();
  });
})();
