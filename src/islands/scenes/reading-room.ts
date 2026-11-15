/**
 * The reading room — the three.js scene behind the essay pages (docs/adr/0014-sala-de-leitura.md).
 *
 * A desk of aged wood, a shelf of books, a window in the rain and a candle. The article is not in the
 * scene: it is the DOM sheet in the middle of the page, opaque, and this scene is only ever visible in
 * the gutters beside it. Loaded on demand by <ft-reading-room> (src/islands/elements/ft-reading-room.ts),
 * which decides whether it runs at all; nothing here reads the DOM beyond the canvas it is given.
 *
 * What keeps it cheap:
 *   - no assets: wood grain, plaster, rain and flame are procedural fragment shaders, so the only download
 *     is this chunk (three.js, tree-shaken by named imports);
 *   - no light system, shadow maps or post-processing: one analytic point light (the candle) and one area
 *     term (the window) evaluated in the fragment shader of each material, with shared uniforms;
 *   - seven draw calls: desk, wall, window, candle, holder, one InstancedMesh for every box (books, shelf
 *     boards, sill) and two additive quads for the flame and its halo;
 *   - only the gutters are shaded: the frame is rendered twice under a scissor rectangle, once per gutter,
 *     so the pixels hidden by the sheet cost one clear and nothing else;
 *   - the pixel ratio and the frame rate come from outside (src/core/chrome/room.ts), below the display's.
 *
 * Colour: every colour arrives from the design tokens as sRGB and is converted to linear; lighting is
 * computed in linear light and encoded once by three's own linearToOutputTexel, then dithered by ±½ of an
 * 8-bit step (the dark gradients of the walls band visibly without it).
 */
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  type IUniform,
} from 'three';
import { mulberry32, type PrngState } from '../../core/ontology/prng.ts';

/** An sRGB colour with components in [0, 1]. */
export type Rgb = readonly [r: number, g: number, b: number];

export interface RoomColors {
  readonly wall: Rgb;
  readonly wood: Rgb;
  readonly glass: Rgb;
  readonly flame: Rgb;
  readonly wax: Rgb;
  /** Cover colours of the books; at least one. */
  readonly books: readonly Rgb[];
}

export interface RoomLayout {
  /** Viewport in CSS px. */
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  /** Edges of the opaque sheet in CSS px; the scene is drawn left of the first and right of the second. */
  readonly sheetLeft: number;
  readonly sheetRight: number;
}

export interface RoomLight {
  /** Share of the light given by the candle, 0…1 (src/core/chrome/room.ts, candleStrength). */
  readonly candle: number;
  /** Dark scheme: the window shows the street at night instead of an overcast sky. */
  readonly night: boolean;
}

export interface RoomFrame {
  /** Seconds, for the flame's sway. */
  readonly time: number;
  /** Seconds of rain (advances slower when the room is calm). */
  readonly rainTime: number;
  /** The candle's intensity factor around 1. */
  readonly flicker: number;
  /** Liveliness in [0, 1]: scales the sway of the flame and the brightness of the whole scene. */
  readonly liveliness: number;
}

export interface ReadingRoom {
  resize(layout: RoomLayout): void;
  recolor(colors: RoomColors, light: RoomLight): void;
  render(frame: RoomFrame): void;
  dispose(): void;
}

/**
 * A shift lens, as in architectural photography: the camera looks level, so every vertical of the room
 * stays vertical on screen however far into a gutter it is, and the picture is the lower two thirds of a
 * taller frame (PerspectiveCamera#setViewOffset), which puts the desk in view without tilting down.
 */
const FOV = 48;
const FRAME = 1.5;
const CAMERA = new Vector3(0, 1.5, 5);
const WALL_Z = -1;
const CANDLE_Z = 1;
const STACK_Z = 0.9;
const MAX_BOXES = 96;
const SEED = 0x5a1a;

const COMMON = /* glsl */ `
uniform vec3 uCandlePos;
uniform vec3 uCandleColor;
uniform float uCandle;
uniform vec3 uWindowPos;
uniform vec3 uWindowColor;
uniform float uWindow;
uniform float uAmbient;
uniform float uBrightness;
uniform vec4 uSheet;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
/* Candle: Lambert with inverse-square falloff. Window: a wrapped term, because it is an area, not a point. */
vec3 roomLight(vec3 p, vec3 n) {
  vec3 lc = uCandlePos - p;
  float dc = dot(lc, lc);
  float c = max(dot(n, lc) * inversesqrt(dc), 0.0) / (1.0 + 1.6 * dc);
  vec3 lw = uWindowPos - p;
  float dw = dot(lw, lw);
  float w = (0.35 + 0.65 * max(dot(n, lw) * inversesqrt(dw), 0.0)) / (1.0 + 0.12 * dw);
  return vec3(uAmbient) + uCandleColor * (uCandle * 3.2 * c) + uWindowColor * (uWindow * w);
}
/* The sheet stands above the desk: the room darkens towards its edges (uSheet: left, right, reach, depth; device px). */
float sheetShade() {
  float d = max(uSheet.x - gl_FragCoord.x, gl_FragCoord.x - uSheet.y);
  return mix(1.0 - uSheet.w, 1.0, smoothstep(0.0, uSheet.z, d));
}
vec4 finish(vec3 linear) {
  vec4 o = linearToOutputTexel(vec4(linear * uBrightness * sheetShade(), 1.0));
  o.rgb += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  return o;
}
`;

const VERTEX = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec2 vUv;
#ifdef USE_INSTANCING
attribute vec4 aTint;
varying vec4 vTint;
#endif
void main() {
  vec4 local = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
  local = instanceMatrix * local;
  n = mat3(instanceMatrix) * n;
  vTint = aTint;
  #endif
  vec4 world = modelMatrix * local;
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * n);
  vLocal = position;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/** Planks along x with their own tone, a fine grain across them, dark seams, and the candle's sheen on the varnish. */
const DESK = /* glsl */ `
${COMMON}
uniform vec3 uWood;
void main() {
  vec2 p = vWorld.xz;
  float row = p.y / 0.42;
  float plank = floor(row);
  float f = fract(row);
  float seam = smoothstep(0.0, 0.035, min(f, 1.0 - f));
  float grain = 0.6 * vnoise(vec2(p.x * 1.6 + plank * 17.0, p.y * 38.0)) + 0.4 * vnoise(vec2(p.x * 5.0 + plank * 3.1, p.y * 90.0));
  vec3 albedo = uWood * (0.86 + 0.24 * hash21(vec2(plank, 3.0))) * (0.78 + 0.4 * grain) * mix(0.55, 1.0, seam);
  vec3 n = normalize(vNormal);
  vec3 l = uCandlePos - vWorld;
  float d = dot(l, l);
  vec3 h = normalize(normalize(l) + normalize(cameraPosition - vWorld));
  float sheen = pow(max(dot(n, h), 0.0), 48.0) * 0.5 * uCandle / (1.0 + 1.6 * d);
  gl_FragColor = finish(albedo * roomLight(vWorld, n) + uCandleColor * sheen);
}
`;

/** Plaster above, a wainscot of the desk's wood below, a rail between them. */
const WALL = /* glsl */ `
${COMMON}
uniform vec3 uWall;
uniform vec3 uWood;
void main() {
  vec2 p = vWorld.xy;
  float board = fract(p.x / 0.9);
  float seam = smoothstep(0.0, 0.02, min(board, 1.0 - board));
  vec3 plaster = uWall * (0.94 + 0.1 * vnoise(p * 6.0));
  vec3 wood = uWood * (0.8 + 0.35 * vnoise(p * vec2(3.0, 14.0))) * mix(0.6, 1.0, seam);
  float wainscot = 1.0 - smoothstep(0.68, 0.7, p.y);
  float rail = smoothstep(0.7, 0.705, p.y) * (1.0 - smoothstep(0.755, 0.76, p.y));
  vec3 albedo = mix(plaster, wood * mix(1.0, 1.25, rail), max(wainscot, rail));
  gl_FragColor = finish(albedo * roomLight(vWorld, normalize(vNormal)));
}
`;

/**
 * The window: a frame with one mullion and one transom, and glass that is lit from outside. Rain is two
 * layers of drops sliding down tall cells, each with a head and the trail it leaves above it, plus a still
 * mist of small droplets; at night three out-of-focus street lamps give the drops something to catch.
 */
const WINDOW = /* glsl */ `
${COMMON}
uniform vec3 uGlass;
uniform vec3 uWood;
uniform vec2 uSize;
uniform float uRain;
uniform float uNight;
vec2 rainLayer(vec2 q, float t, float scale, float seed) {
  vec2 st = q * vec2(scale, scale * 0.28);
  float column = floor(st.x);
  st.y += t * (0.35 + 0.5 * hash21(vec2(column, seed))) + 10.0 * hash21(vec2(column, seed + 1.0));
  vec2 id = floor(st);
  vec2 f = fract(st);
  float n = hash21(id + seed);
  float x = 0.5 + (n - 0.5) * 0.5 + 0.06 * sin(st.y * 5.0 + n * 6.2831);
  float dx = (f.x - x) / scale;
  float dy = (f.y - 0.15) / (scale * 0.28);
  float head = smoothstep(0.014, 0.004, length(vec2(dx, dy * 0.55)));
  float trail = smoothstep(0.005, 0.0, abs(dx)) * smoothstep(0.15, 0.2, f.y) * (1.0 - smoothstep(0.2, 0.95, f.y));
  return step(0.5, n) * vec2(head, trail);
}
void main() {
  vec2 q = vUv * uSize;
  float edge = min(min(q.x, uSize.x - q.x), min(q.y, uSize.y - q.y));
  float frame = 1.0 - smoothstep(0.06, 0.066, edge);
  frame = max(frame, 1.0 - smoothstep(0.02, 0.026, abs(q.x - uSize.x * 0.5)));
  frame = max(frame, 1.0 - smoothstep(0.02, 0.026, abs(q.y - uSize.y * 0.58)));
  vec3 sky = uGlass * mix(0.6, 1.15, vUv.y);
  float lamps = 0.0;
  for (int i = 0; i < 3; i++) {
    vec2 c = vec2(hash21(vec2(float(i), 1.0)), 0.25 + 0.5 * hash21(vec2(float(i), 2.0))) * uSize;
    lamps += smoothstep(0.16, 0.02, length(q - c));
  }
  vec2 rain = rainLayer(q, uRain, 9.0, 1.0) + 0.6 * rainLayer(q, uRain * 1.3, 17.0, 5.0);
  float mist = 0.12 * step(0.992, hash21(floor(q * 140.0)));
  vec3 glass = sky * (1.0 + 0.55 * rain.x + 0.3 * rain.y + mist) + uCandleColor * (uNight * 0.55 * lamps * (1.0 + rain.x));
  vec3 wood = uWood * 1.2 * roomLight(vWorld, normalize(vNormal));
  gl_FragColor = finish(mix(glass * uWindow, wood, frame));
}
`;

/**
 * Every box, tinted by its instance. aTint.a says what it is: 0 wood (grain), 1 a standing book (two gilt
 * bands on the spine, page edges on top), 0.5 a book lying flat (the block of pages between its covers).
 */
const BOXES = /* glsl */ `
${COMMON}
uniform vec3 uGilt;
uniform vec3 uPages;
varying vec4 vTint;
void main() {
  vec3 n = normalize(vNormal);
  vec3 albedo = vTint.rgb;
  float book = step(0.25, vTint.a);
  float standing = step(0.75, vTint.a);
  float side = step(0.5, abs(n.x) + abs(n.z));
  float band = step(0.3, abs(vLocal.y)) * step(abs(vLocal.y), 0.36) * side * standing;
  float pages = step(0.5, n.y) * standing + side * (book - standing) * step(abs(vLocal.y), 0.3);
  albedo = mix(albedo, uGilt, 0.5 * band);
  albedo = mix(albedo, uPages, 0.7 * pages);
  albedo *= mix(0.82 + 0.3 * vnoise(vWorld.xy * vec2(4.0, 30.0)), 1.0, book);
  gl_FragColor = finish(albedo * roomLight(vWorld, n));
}
`;

/** Wax and brass: a tint, and wax that lets the flame through near the top (uGlow). */
const SOLID = /* glsl */ `
${COMMON}
uniform vec3 uTint;
uniform float uGlow;
void main() {
  float lit = uGlow * smoothstep(0.1, 0.5, vLocal.y) * uCandle;
  gl_FragColor = finish(uTint * roomLight(vWorld, normalize(vNormal)) + uCandleColor * lit);
}
`;

const BILLBOARD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** A teardrop: wide low, closing to a point; cool at the wick (the window's hue) and washed towards white in the core. */
const FLAME = /* glsl */ `
uniform vec3 uCandleColor;
uniform vec3 uWindowColor;
uniform float uCandle;
uniform float uBrightness;
uniform float uSway;
varying vec2 vUv;
void main() {
  float y = vUv.y;
  float x = vUv.x - 0.5 - uSway * y * y;
  float w = 0.36 * pow(1.0 - y, 0.7) * smoothstep(0.0, 0.14, y);
  float body = smoothstep(w, w * 0.25, abs(x));
  float core = smoothstep(w * 0.6, 0.0, abs(x)) * smoothstep(0.02, 0.35, y) * (1.0 - smoothstep(0.55, 0.95, y));
  vec3 color = mix(uCandleColor * 1.3, mix(uCandleColor, vec3(1.0), 0.8), core);
  color = mix(uWindowColor * 0.5, color, smoothstep(0.02, 0.2, y));
  gl_FragColor = linearToOutputTexel(vec4(color * uBrightness, body * min(1.0, uCandle)));
}
`;

const HALO = /* glsl */ `
uniform vec3 uCandleColor;
uniform float uCandle;
uniform float uBrightness;
varying vec2 vUv;
void main() {
  vec2 d = vUv - 0.5;
  float a = exp(-dot(d, d) * 36.0) * 0.4 * uCandle * uBrightness;
  gl_FragColor = linearToOutputTexel(vec4(uCandleColor, a));
}
`;

const linear = (target: Color, [r, g, b]: Rgb): Color => target.setRGB(r, g, b, SRGBColorSpace);

/** Draws from the seeded generator, threading its state (the core's PRNG is a pure transition). */
const stream = (seed: number): (() => number) => {
  let state: PrngState = seed;
  return () => {
    const [value, next] = mulberry32(state);
    state = next;
    return value;
  };
};

/**
 * Creates the scene on `canvas`, or returns null when no WebGL 2 context can be had. `onLost` is called if
 * the browser takes the context away; the room must then be disposed.
 */
export const createReadingRoom = (canvas: HTMLCanvasElement, onLost: () => void): ReadingRoom | null => {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: 'low-power',
    });
  } catch {
    return null;
  }
  renderer.autoClear = false;
  renderer.outputColorSpace = SRGBColorSpace;
  const lost = (event: Event): void => {
    event.preventDefault();
    onLost();
  };
  canvas.addEventListener('webglcontextlost', lost);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.5, 30);
  camera.position.copy(CAMERA);
  const tanHalf = Math.tan((FOV * Math.PI) / 360);

  // One object per uniform, shared by every material that declares it: an update reaches all of them.
  const shared = {
    uCandlePos: { value: new Vector3() },
    uCandleColor: { value: new Color() },
    uCandle: { value: 1 },
    uWindowPos: { value: new Vector3() },
    uWindowColor: { value: new Color() },
    uWindow: { value: 1 },
    uAmbient: { value: 0.5 },
    uBrightness: { value: 1 },
    uSheet: { value: new Vector4(0, 0, 1, 0) },
    uWood: { value: new Color() },
  } satisfies Record<string, IUniform>;
  const own = {
    uWall: { value: new Color() },
    uGlass: { value: new Color() },
    uSize: { value: new Vector2(1, 1) },
    uRain: { value: 0 },
    uNight: { value: 0 },
    uGilt: { value: new Color() },
    uPages: { value: new Color() },
    uWax: { value: new Color() },
    uBrass: { value: new Color() },
    uSway: { value: 0 },
  } satisfies Record<string, IUniform>;

  const lit = (fragmentShader: string, uniforms: Record<string, IUniform>): ShaderMaterial =>
    new ShaderMaterial({ vertexShader: VERTEX, fragmentShader, uniforms: { ...shared, ...uniforms } });
  const glowing = (fragmentShader: string, uniforms: Record<string, IUniform>): ShaderMaterial =>
    new ShaderMaterial({
      vertexShader: BILLBOARD_VERTEX,
      fragmentShader,
      uniforms: {
        uCandleColor: shared.uCandleColor,
        uWindowColor: shared.uWindowColor,
        uCandle: shared.uCandle,
        uBrightness: shared.uBrightness,
        ...uniforms,
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });

  const materials = {
    desk: lit(DESK, {}),
    wall: lit(WALL, { uWall: own.uWall }),
    window: lit(WINDOW, { uGlass: own.uGlass, uSize: own.uSize, uRain: own.uRain, uNight: own.uNight }),
    boxes: lit(BOXES, { uGilt: own.uGilt, uPages: own.uPages }),
    wax: lit(SOLID, { uTint: own.uWax, uGlow: { value: 0.7 } }),
    brass: lit(SOLID, { uTint: own.uBrass, uGlow: { value: 0 } }),
    flame: glowing(FLAME, { uSway: own.uSway }),
    halo: glowing(HALO, {}),
  };
  // The halo is light, not an object: the desk must not cut it where the quad dips below the surface.
  materials.halo.depthTest = false;

  const plane = new PlaneGeometry(1, 1);
  const box = new BoxGeometry(1, 1, 1);
  const cylinder = new CylinderGeometry(1, 1, 1, 20, 1);
  const tints = new InstancedBufferAttribute(new Float32Array(MAX_BOXES * 4), 4);
  box.setAttribute('aTint', tints);

  const desk = new Mesh(plane, materials.desk);
  desk.rotation.x = -Math.PI / 2;
  desk.scale.set(24, 9, 1);
  desk.position.set(0, 0, WALL_Z + 4.5);
  const wall = new Mesh(plane, materials.wall);
  wall.scale.set(24, 8, 1);
  wall.position.set(0, 4, WALL_Z);
  const glass = new Mesh(plane, materials.window);
  const boxes = new InstancedMesh(box, materials.boxes, MAX_BOXES);
  boxes.frustumCulled = false;
  const wax = new Mesh(cylinder, materials.wax);
  const brass = new Mesh(cylinder, materials.brass);
  const flame = new Mesh(plane, materials.flame);
  const halo = new Mesh(plane, materials.halo);
  halo.renderOrder = 1;
  flame.renderOrder = 2;
  scene.add(desk, wall, glass, boxes, wax, brass, halo, flame);

  let layout: RoomLayout = { width: 1, height: 1, pixelRatio: 1, sheetLeft: 0, sheetRight: 1 };
  /** The candle's share of the light, before the flicker (set by recolor). */
  let strength = 1;
  let covers: readonly Color[] = [new Color()];
  const woodTint = new Color();

  /** World x of the point that projects to `ndc` at depth z (the camera looks straight down −z). */
  const xAt = (ndc: number, z: number): number => ndc * (CAMERA.z - z) * tanHalf * camera.aspect;
  /** World width of `px` CSS pixels at depth z. */
  const spanAt = (px: number, z: number): number => (xAt(1, z) * 2 * px) / Math.max(1, layout.width);

  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const euler = new Euler();
  const position = new Vector3();
  const scale = new Vector3();
  let count = 0;
  const put = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    tint: Color,
    kind: 0 | 0.5 | 1,
    turnY = 0,
    leanZ = 0,
  ): void => {
    if (count >= MAX_BOXES) return;
    quaternion.setFromEuler(euler.set(0, turnY, leanZ));
    matrix.compose(position.set(x, y, z), quaternion, scale.set(sx, sy, sz));
    boxes.setMatrixAt(count, matrix);
    tints.setXYZW(count, tint.r, tint.g, tint.b, kind);
    count += 1;
  };

  /** Places everything for the current gutters. Deterministic: the same layout gives the same room. */
  const arrange = (): void => {
    const { width, sheetLeft, sheetRight } = layout;
    const next = stream(SEED);
    const cover = (): Color => covers[Math.floor(next() * covers.length)] ?? woodTint;
    const leftNdc = sheetLeft / width - 1;
    const rightNdc = sheetRight / width;
    count = 0;

    // Right gutter, on the wall: the window and its sill.
    const windowY = 1.5;
    const w = Math.min(1, Math.max(0.3, spanAt(width - sheetRight, WALL_Z) * 0.7));
    const h = Math.min(1.3, w * 1.4);
    const windowX = xAt(rightNdc, WALL_Z);
    glass.position.set(windowX, windowY, WALL_Z + 0.02);
    glass.scale.set(w, h, 1);
    own.uSize.value.set(w, h);
    shared.uWindowPos.value.set(windowX, windowY, WALL_Z + 0.4);
    put(windowX, windowY - h / 2 - 0.02, WALL_Z + 0.07, w + 0.16, 0.04, 0.14, woodTint, 0);

    // Right gutter, on the desk: the candle in its holder.
    const candleX = xAt(rightNdc, CANDLE_Z);
    brass.position.set(candleX, 0.015, CANDLE_Z);
    brass.scale.set(0.12, 0.03, 0.12);
    wax.position.set(candleX, 0.19, CANDLE_Z);
    wax.scale.set(0.045, 0.32, 0.045);
    flame.position.set(candleX, 0.45, CANDLE_Z);
    flame.scale.set(0.11, 0.2, 1);
    halo.position.set(candleX, 0.44, CANDLE_Z + 0.01);
    halo.scale.set(1.5, 1.5, 1);
    shared.uCandlePos.value.set(candleX, 0.46, CANDLE_Z);

    // Left gutter, on the wall: two shelves of standing books, a few of them leaning.
    const shelfWidth = Math.min(1.6, Math.max(0.3, spanAt(sheetLeft, WALL_Z) * 0.82));
    const shelfX = xAt(leftNdc, WALL_Z);
    for (const shelfY of [0.92, 1.52]) {
      put(shelfX, shelfY, WALL_Z + 0.13, shelfWidth, 0.035, 0.26, woodTint, 0);
      let x = shelfX - shelfWidth / 2 + 0.03;
      const end = shelfX + shelfWidth / 2 - 0.03;
      while (x < end) {
        const thick = 0.04 + 0.05 * next();
        const tall = 0.3 + 0.2 * next();
        const deep = 0.17 + 0.04 * next();
        const lean = next() < 0.12 ? 0.2 : 0;
        const room = thick + (lean > 0 ? tall * 0.21 : 0);
        if (x + room > end) break;
        if (next() < 0.07) {
          x += 0.08;
          continue;
        }
        put(x + room / 2, shelfY + 0.0175 + tall / 2, WALL_Z + 0.13, thick, tall, deep, cover(), 1, 0, -lean);
        x += room + 0.004;
      }
    }

    // Left gutter, on the desk: a stack of three books.
    const stackX = xAt(leftNdc, STACK_Z);
    const stackWidth = Math.min(0.46, Math.max(0.2, spanAt(sheetLeft, STACK_Z) * 0.6));
    let top = 0;
    for (let i = 0; i < 3; i++) {
      const thick = 0.05 + 0.03 * next();
      put(
        stackX,
        top + thick / 2,
        STACK_Z,
        stackWidth * (1 - 0.08 * i),
        thick,
        stackWidth * 0.72,
        cover(),
        0.5,
        (next() - 0.5) * 0.5,
      );
      top += thick;
    }

    boxes.count = count;
    boxes.instanceMatrix.needsUpdate = true;
    tints.needsUpdate = true;
  };

  let disposed = false;
  return {
    resize(next) {
      layout = next;
      renderer.setPixelRatio(next.pixelRatio);
      renderer.setSize(next.width, next.height, false);
      // The camera's own aspect is that of the taller frame; the view is its lower part.
      const frameHeight = next.height * FRAME;
      camera.aspect = next.width / Math.max(1, frameHeight);
      camera.setViewOffset(next.width, frameHeight, 0, frameHeight - next.height, next.width, next.height);
      shared.uSheet.value.set(
        next.sheetLeft * next.pixelRatio,
        next.sheetRight * next.pixelRatio,
        72 * next.pixelRatio,
        0.55,
      );
      arrange();
    },
    recolor(colors, light) {
      linear(own.uWall.value, colors.wall);
      linear(shared.uWood.value, colors.wood);
      linear(own.uGlass.value, colors.glass);
      linear(shared.uCandleColor.value, colors.flame);
      linear(shared.uWindowColor.value, colors.glass);
      linear(own.uWax.value, colors.wax);
      linear(own.uPages.value, colors.wax);
      // Brass and gilt are the flame's hue at lower lightness: one token, three uses.
      linear(own.uBrass.value, colors.flame).multiplyScalar(0.2);
      linear(own.uGilt.value, colors.flame).multiplyScalar(0.6);
      woodTint.copy(shared.uWood.value).multiplyScalar(1.15);
      covers = colors.books.map((c) => linear(new Color(), c));
      own.uNight.value = light.night ? 1 : 0;
      // By day the window carries the room; at night the candle does and the rest falls into shadow.
      shared.uWindow.value = light.night ? 0.5 : 1.1;
      shared.uAmbient.value = light.night ? 0.5 : 0.6;
      shared.uCandle.value = light.candle;
      renderer.setClearColor(own.uWall.value, 1);
      strength = light.candle;
      arrange();
    },
    render(frame) {
      if (disposed) return;
      shared.uCandle.value = strength * frame.flicker;
      shared.uBrightness.value = 0.82 + 0.18 * frame.liveliness;
      own.uRain.value = frame.rainTime;
      own.uSway.value = frame.liveliness * (0.1 * Math.sin(frame.time * 2.1) + 0.05 * Math.sin(frame.time * 5.3 + 1));
      const { width, height, sheetLeft, sheetRight } = layout;
      renderer.setScissorTest(false);
      renderer.clear();
      renderer.setScissorTest(true);
      if (sheetLeft > 0) {
        renderer.setScissor(0, 0, sheetLeft, height);
        renderer.render(scene, camera);
      }
      if (sheetRight < width) {
        renderer.setScissor(sheetRight, 0, width - sheetRight, height);
        renderer.render(scene, camera);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', lost);
      for (const material of Object.values(materials)) material.dispose();
      plane.dispose();
      box.dispose();
      cylinder.dispose();
      boxes.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
};
