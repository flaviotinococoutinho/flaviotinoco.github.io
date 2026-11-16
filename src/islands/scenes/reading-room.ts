/**
 * The reading room — the three.js scene behind the essay pages (docs/adr/0014-sala-de-leitura.md).
 *
 * A desk of aged wood, shelves, a window in the rain and a candle. The article is not in the scene: it is
 * the DOM sheet in the middle of the page, opaque, and this scene is only ever visible in the gutters
 * beside it. Loaded on demand by <ft-reading-room> (src/islands/elements/ft-reading-room.ts), which decides
 * whether it runs at all; nothing here reads the DOM beyond the canvas it is given.
 *
 * The room is this site's room, not a stock one (the data come from src/core/chrome/room.ts):
 *   - the shelves hold the corpus: one spine per essay (upper shelf) and one notebook per lab (lower), in
 *     the order they were published, coloured by stratum, as thick as the text is long;
 *   - the work being read is off the shelf — a gap marks its place — and lies on the desk with the works
 *     published before and after it, under a brass simplex of its stratum (point, segment, triangle,
 *     tetrahedron: the glyphs of the site);
 *   - the candle is a reading clock: it burns down as the article is read, and the rain eases at the end.
 *
 * And it is made of irregular matter rather than primitives: wax that sags and runs, a flame shaped by
 * noise and by the draught of the scrolling page, grain that bends round knots, spines that are rounded
 * and worn, plaster that is stained, glass that fogs, dust in the candlelight, objects that darken the
 * surface they rest on.
 *
 * What keeps it cheap:
 *   - no assets: every surface is a procedural fragment shader, so the only download is this chunk;
 *   - no light system, shadow maps or post-processing: one analytic point light (the candle), one area
 *     term (the window) and analytic contact shadows, evaluated per material with shared uniforms;
 *   - about a dozen draw calls; every box of the room is one InstancedMesh;
 *   - only the gutters are shaded: the frame is rendered twice under a scissor rectangle, once per gutter;
 *   - patterns finer than a pixel fade out by their screen-space derivative instead of aliasing;
 *   - the pixel ratio and the frame rate come from outside, below the display's.
 *
 * Colour: every colour arrives from the design tokens as sRGB and is converted to linear; lighting is
 * computed in linear light, encoded once by three's linearToOutputTexel and dithered by ±½ of an 8-bit step.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Quaternion,
  RedFormat,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  type IUniform,
} from 'three';
import { refog, type ShelfBook } from '../../core/chrome/room.ts';
import { STRATA } from '../../core/domain/strata.ts';
import { mulberry32, type PrngState } from '../../core/ontology/prng.ts';

/** An sRGB colour with components in [0, 1]. */
export type Rgb = readonly [r: number, g: number, b: number];

export interface RoomColors {
  readonly wall: Rgb;
  readonly wood: Rgb;
  readonly glass: Rgb;
  readonly flame: Rgb;
  readonly wax: Rgb;
  /** Cloth of the covers, one per stratum in the order of STRATA. */
  readonly covers: readonly Rgb[];
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
  /** Share of the light given by the candle, 0…1 (candleStrength). */
  readonly candle: number;
  /** Dark scheme: the window shows the street at night instead of an overcast sky. */
  readonly night: boolean;
}

/** What the room holds: the corpus, and the simplex of the work being read. */
export interface RoomContents {
  readonly books: readonly ShelfBook[];
  readonly simplex: 0 | 1 | 2 | 3;
}

export interface RoomFrame {
  /** Seconds, for the flame and the dust. */
  readonly time: number;
  /** Seconds of rain (advances slower when the room is calm). */
  readonly rainTime: number;
  /** The candle's intensity factor: flicker × kindle. */
  readonly flicker: number;
  /** Liveliness in [0, 1]: scales the turbulence of the flame and the brightness of the scene. */
  readonly liveliness: number;
  /** Fraction of the candle left (burn). */
  readonly burn: number;
  /** How hard it rains, RAIN_FLOOR…1 (rainfall). */
  readonly rainfall: number;
  /** The draught of the scrolling page and of the reader's hand, −1…1 (gust). */
  readonly gust: number;
  /** Offset of the eye from its place, in metres (eyeFor, smoothed): motion parallax. */
  readonly eye: readonly [x: number, y: number];
  /** The book under the pointer (index in RoomContents.books, −1 for none), and how far it is pulled out, 0…1. */
  readonly pulled: number;
  readonly pull: number;
}

export interface ReadingRoom {
  resize(layout: RoomLayout): void;
  recolor(colors: RoomColors, light: RoomLight): void;
  furnish(contents: RoomContents): void;
  render(frame: RoomFrame): void;
  /**
   * What is under the viewport point (x, y) in CSS px: the index of a book on the shelf, or −1. With `wipe`,
   * a point on the window clears the fog there (it comes back by itself, refog).
   */
  pointAt(x: number, y: number, wipe: boolean): number;
  /** Where the flame is on the screen, in CSS px. */
  flameAt(): readonly [x: number, y: number];
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
const MAX_BOXES = 128;
const MOTES = 72;
const SEED = 0x5a1a;
/** Height of the unburnt candle and the radius of its wax, in metres of the scene. */
const CANDLE_HEIGHT = 0.34;
const CANDLE_RADIUS = 0.046;
/** Texels of the mask that says where the glass has been wiped, and the reach of a fingertip on it (uv). */
const WIPE = 64;
const WIPE_REACH = 0.1;
/** How far a book comes off the shelf towards the reader when it is pointed at, in metres. */
const PULL_OUT = 0.07;

const NOISE = /* glsl */ `
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
`;

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
${NOISE}
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
/* Blinn–Phong highlight of both lights, for varnish and brass. */
vec3 roomShine(vec3 p, vec3 n, float power) {
  vec3 v = normalize(cameraPosition - p);
  vec3 lc = uCandlePos - p;
  float dc = dot(lc, lc);
  float sc = pow(max(dot(n, normalize(normalize(lc) + v)), 0.0), power) * uCandle / (1.0 + 1.6 * dc);
  float sw = pow(max(dot(n, normalize(normalize(uWindowPos - p) + v)), 0.0), power) * uWindow * 0.25;
  return uCandleColor * sc + uWindowColor * sw;
}
/* A stripe pattern that fades to its mean where a period is smaller than a pixel, instead of aliasing. */
float stripes(float x, float frequency) {
  float f = x * frequency;
  return mix(0.5 + 0.5 * sin(f), 0.5, smoothstep(0.6, 2.4, fwidth(f)));
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

/**
 * One vertex shader for everything lit. Instances carry their kind in aTint.a; a standing book (1) gets a
 * rounded spine: its front face bulges as a parabola across the thickness, and the normal follows.
 * mat3(instanceMatrix) = R·S, so a normal n of the unit box becomes R·n as mat3(instanceMatrix)·(n / s).
 */
const VERTEX = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec2 vUv;
${NOISE}
#ifdef USE_INSTANCING
attribute vec4 aTint;
varying vec4 vTint;
varying float vSeed;
#endif
void main() {
  vec4 local = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
  vec3 s = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  if (aTint.a > 0.75 && position.z > 0.0) {
    local.z += 0.11 * (1.0 - 4.0 * position.x * position.x);
    n = normalize(vec3(0.88 * position.x * s.z / s.x, 0.0, 1.0));
  }
  local = instanceMatrix * local;
  n = mat3(instanceMatrix) * (n / s);
  vTint = aTint;
  vSeed = hash21(instanceMatrix[3].xy * 7.31);
  #endif
  vec4 world = modelMatrix * local;
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * n);
  vLocal = position;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * The candle is not a cylinder: the wax is lumpy, a few runs of wax go down from the rim and end in a
 * bead, the rim sags where it melted and the top is a shallow bowl round the wick. All of it is a
 * displacement of the unit cylinder by noise sampled on the circle (so it closes on itself).
 */
const WAX_VERTEX = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec2 vUv;
${NOISE}
void main() {
  vec3 p = position;
  float y = p.y + 0.5;
  float r = length(p.xz);
  vec2 dir = r > 1e-4 ? p.xz / r : vec2(1.0, 0.0);
  float lump = 0.07 * (vnoise(dir * 1.7 + vec2(4.0, y * 3.0)) - 0.5);
  float ridge = smoothstep(0.62, 0.9, vnoise(dir * 2.3 + 7.0));
  float reach = 0.25 + 0.6 * vnoise(dir * 1.1 + 11.0);
  float run = ridge * smoothstep(1.0 - reach, 1.0 - reach + 0.12, y);
  float bead = ridge * exp(-pow((y - (1.0 - reach)) * 14.0, 2.0));
  float rim = step(0.98, r);
  p.xz *= 1.0 + rim * (lump + 0.24 * run + 0.34 * bead);
  p.y -= 0.07 * vnoise(dir * 2.0 + 2.0) * smoothstep(0.9, 1.0, y) + 0.05 * (1.0 - r) * step(0.5, normal.y);
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vLocal = position;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * Planks along x, each with its own tone; growth rings across them that bend round the knots; fibres;
 * dark seams that are not quite straight; wear where hands rest; the candle's sheen on what varnish is
 * left; and the darkening under whatever stands on the desk (uBlob: x, z, radius, depth).
 */
const DESK = /* glsl */ `
${COMMON}
uniform vec3 uWood;
uniform vec4 uBlob[2];
void main() {
  vec2 p = vWorld.xz;
  float row = p.y / 0.42 + 0.035 * vnoise(vec2(p.x * 0.7, 1.0));
  float plank = floor(row);
  float f = fract(row);
  float gx = p.x + plank * 7.3;
  vec2 cell = vec2(floor(gx / 1.7), plank);
  vec2 centre = vec2((cell.x + 0.2 + 0.6 * hash21(cell)) * 1.7, (plank + 0.3 + 0.4 * hash21(cell + 9.0)) * 0.42);
  vec2 dk = vec2(gx - centre.x, (p.y - centre.y) * 2.6);
  float kd = length(dk);
  float knot = step(0.5, hash21(cell + 3.0)) * smoothstep(0.34, 0.0, kd);
  float across = p.y + 0.02 * vnoise(vec2(gx * 0.9, p.y * 3.0)) + knot * 0.05 * sign(p.y - centre.y) * (1.0 - kd / 0.34);
  float rings = stripes(across + 0.02 * vnoise(vec2(gx * 0.6, across * 20.0)), 150.0);
  float fibre = mix(vnoise(vec2(gx * 6.0, across * 110.0)), 0.5, smoothstep(0.3, 1.2, fwidth(across * 110.0)));
  float grain = mix(0.55 * rings + 0.45 * fibre, stripes(kd, 120.0), 0.8 * knot);
  float seam = smoothstep(0.0, 0.03, min(f, 1.0 - f));
  float wear = vnoise(p * 1.3);
  vec3 albedo = uWood * (0.84 + 0.26 * hash21(vec2(plank, 3.0))) * (0.74 + 0.42 * grain) * mix(0.5, 1.0, seam);
  albedo *= (1.0 - 0.45 * knot * smoothstep(0.12, 0.0, kd)) * (0.9 + 0.2 * wear);
  float contact = 1.0;
  for (int i = 0; i < 2; i++) {
    vec2 d = (p - uBlob[i].xy) / uBlob[i].z;
    contact *= 1.0 - uBlob[i].w * exp(-dot(d, d));
  }
  vec3 n = normalize(vNormal);
  gl_FragColor = finish(albedo * roomLight(vWorld, n) * contact + roomShine(vWorld, n, 48.0) * (0.25 + 0.5 * wear) * contact);
}
`;

/**
 * Plaster above — mottled, with a damp stain under the window — and a wainscot of the desk's wood below,
 * boards of uneven tone under a rail. The shelves darken the wall under them and behind their books
 * (uShelfA, uShelfB: centre x, half width, height).
 */
const WALL = /* glsl */ `
${COMMON}
uniform vec3 uWall;
uniform vec3 uWood;
uniform vec3 uShelfA;
uniform vec3 uShelfB;
float shelfShade(vec2 p, vec3 s) {
  float within = smoothstep(s.y + 0.12, s.y - 0.02, abs(p.x - s.x));
  float under = smoothstep(0.3, 0.0, s.z - p.y) * step(p.y, s.z);
  float behind = smoothstep(0.55, 0.0, p.y - s.z) * step(s.z, p.y);
  return 1.0 - within * (0.4 * under + 0.28 * behind);
}
void main() {
  vec2 p = vWorld.xy;
  float mottle = 0.6 * vnoise(p * 1.1) + 0.4 * vnoise(p * 6.1);
  float stain = smoothstep(0.9, 0.0, length((p - vec2(uWindowPos.x, uWindowPos.y - 0.9)) * vec2(1.4, 1.0))) * vnoise(p * 3.0);
  vec3 plaster = uWall * (0.84 + 0.3 * mottle) * (1.0 - 0.2 * stain);
  float bx = p.x / 0.62 + 0.2 * hash21(vec2(floor(p.x / 0.62), 5.0));
  float board = floor(bx);
  float bf = fract(bx);
  float seam = smoothstep(0.0, 0.03, min(bf, 1.0 - bf));
  float grain = stripes(p.x + 0.07 * vnoise(vec2(p.x * 3.0 + board, p.y * 1.2)), 70.0);
  vec3 wood = uWood * (0.8 + 0.3 * hash21(vec2(board, 8.0))) * (0.88 + 0.14 * grain) * mix(0.55, 1.0, seam);
  float wainscot = 1.0 - smoothstep(0.68, 0.7, p.y);
  float rail = smoothstep(0.7, 0.705, p.y) * (1.0 - smoothstep(0.755, 0.76, p.y));
  vec3 albedo = mix(plaster, wood * mix(1.0, 1.25, rail), max(wainscot, rail));
  albedo *= shelfShade(p, uShelfA) * shelfShade(p, uShelfB);
  gl_FragColor = finish(albedo * roomLight(vWorld, normalize(vNormal)));
}
`;

/**
 * The window: a frame with one mullion and one transom, and old glass lit from outside. Rain is two
 * layers of drops sliding down tall cells along paths bent by noise, each with a head and the trail it
 * leaves; uRainfall thins them out. The lower panes fog, and a trail wipes the fog where it ran, as does the
 * reader's pointer (uWipe, a mask that fades as the glass fogs over again). At night
 * three out-of-focus street lamps give the drops something to catch.
 */
const WINDOW = /* glsl */ `
${COMMON}
uniform vec3 uGlass;
uniform vec3 uWood;
uniform vec2 uSize;
uniform float uRain;
uniform float uRainfall;
uniform float uNight;
uniform sampler2D uWipe;
vec2 rainLayer(vec2 q, float t, float scale, float seed) {
  vec2 st = q * vec2(scale, scale * 0.28);
  float column = floor(st.x);
  st.y += t * (0.35 + 0.5 * hash21(vec2(column, seed))) + 10.0 * hash21(vec2(column, seed + 1.0));
  vec2 id = floor(st);
  vec2 f = fract(st);
  float n = hash21(id + seed);
  float x = 0.5 + (n - 0.5) * 0.5 + 0.16 * (vnoise(vec2(st.y * 1.7, n * 9.0)) - 0.5);
  float dx = (f.x - x) / scale;
  float dy = (f.y - 0.15) / (scale * 0.28);
  float size = 0.6 + 0.8 * fract(n * 7.3);
  float head = smoothstep(0.014 * size, 0.004 * size, length(vec2(dx, dy * 0.55)));
  float trail = smoothstep(0.005 * size, 0.0, abs(dx)) * smoothstep(0.15, 0.2, f.y) * (1.0 - smoothstep(0.2, 0.95, f.y));
  return step(1.0 - 0.5 * uRainfall, n) * vec2(head, trail);
}
void main() {
  vec2 q = vUv * uSize;
  float edge = min(min(q.x, uSize.x - q.x), min(q.y, uSize.y - q.y));
  float frame = 1.0 - smoothstep(0.06, 0.066, edge);
  frame = max(frame, 1.0 - smoothstep(0.02, 0.026, abs(q.x - uSize.x * 0.5)));
  frame = max(frame, 1.0 - smoothstep(0.02, 0.026, abs(q.y - uSize.y * 0.58)));
  float clearing = 1.0 + 0.3 * (1.0 - uRainfall);
  vec3 sky = uGlass * mix(0.6, 1.15, vUv.y) * clearing * (0.95 + 0.1 * vnoise(q * 2.3));
  float lamps = 0.0;
  for (int i = 0; i < 3; i++) {
    vec2 c = vec2(hash21(vec2(float(i), 1.0)), 0.25 + 0.5 * hash21(vec2(float(i), 2.0))) * uSize;
    lamps += smoothstep(0.16, 0.02, length(q - c));
  }
  vec2 rain = rainLayer(q, uRain, 9.0, 1.0) + 0.6 * rainLayer(q, uRain * 1.3, 17.0, 5.0);
  float fog = (0.25 + 0.75 * uRainfall) * smoothstep(0.9, 0.0, vUv.y) * (0.45 + 0.55 * vnoise(q * 5.0)) * (1.0 - 0.85 * min(1.0, rain.y + rain.x));
  fog *= 1.0 - texture2D(uWipe, vUv).r;
  float mist = 0.12 * step(0.992, hash21(floor(q * 140.0)));
  float seen = 1.0 - 0.7 * fog;
  vec3 glass = sky * (1.0 + (0.55 * rain.x + 0.3 * rain.y) * seen + mist) + uCandleColor * (uNight * 0.55 * lamps * (1.0 + rain.x) * seen);
  // Condensation scatters what reaches it: the daylight by day, the candle at night.
  vec3 haze = uGlass * mix(1.45, 1.05, uNight) * clearing + uCandleColor * (uNight * 0.22 * uCandle);
  glass = mix(glass, haze, 0.72 * fog);
  vec3 wood = uWood * (1.05 + 0.3 * stripes(q.y + 0.02 * vnoise(q * 4.0), 140.0)) * roomLight(vWorld, normalize(vNormal));
  gl_FragColor = finish(mix(glass * uWindow, wood, frame));
}
`;

/**
 * Every box, tinted by its instance. aTint.a says what it is: 0 wood (grain), 1 a standing book — cloth
 * with a weave, lighter where the head and the tail of the spine are worn, two gilt bands whose height
 * varies from book to book, page edges on top — and 0.5 a book lying flat (the block of pages between its
 * covers).
 */
const BOXES = /* glsl */ `
${COMMON}
uniform vec3 uGilt;
uniform vec3 uPages;
varying vec4 vTint;
varying float vSeed;
void main() {
  vec3 n = normalize(vNormal);
  vec3 albedo = vTint.rgb;
  float book = step(0.25, vTint.a);
  float standing = step(0.75, vTint.a);
  float side = step(0.5, abs(n.x) + abs(n.z));
  float y = abs(vLocal.y);
  float at = 0.24 + 0.12 * vSeed;
  float band = step(at, y) * step(y, at + 0.045) * side * standing;
  float pages = step(0.5, n.y) * standing + side * (book - standing) * step(y, 0.3);
  float weave = 0.93 + 0.14 * vnoise(vWorld.xy * 190.0);
  float worn = smoothstep(0.4, 0.5, y) * standing + 0.5 * smoothstep(0.38, 0.5, abs(vLocal.x)) * (book - standing);
  albedo = mix(albedo * weave, albedo * 1.7 + 0.03, 0.35 * worn * (0.4 + 0.6 * vnoise(vWorld.xy * 40.0)));
  albedo = mix(albedo, uGilt, 0.5 * band);
  albedo = mix(albedo, uPages * (0.9 + 0.1 * stripes(vLocal.y, 260.0)), 0.7 * pages);
  albedo *= mix(0.8 + 0.34 * stripes(vWorld.y + 0.02 * vnoise(vWorld.xy * 5.0), 150.0), 1.0, book);
  gl_FragColor = finish(albedo * roomLight(vWorld, n));
}
`;

/**
 * Wax and brass, shaded with the true normal of the displaced surface (from screen-space derivatives):
 * a tint, wax that lets the flame through near the top (uGlow), brass that shines (uShine).
 */
const SOLID = /* glsl */ `
${COMMON}
uniform vec3 uTint;
uniform float uGlow;
uniform float uShine;
void main() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  float lit = uGlow * smoothstep(0.05, 0.5, vLocal.y) * uCandle;
  gl_FragColor = finish(uTint * roomLight(vWorld, n) + uCandleColor * lit + roomShine(vWorld, n, 36.0) * uShine);
}
`;

const BILLBOARD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * The flame: a teardrop whose edge and tip are moved by two bands of noise rising through it, leaning
 * with uSway (its own sway plus the draught of the page); cool at the wick (the window's hue), dark
 * round it, washed towards white in the core.
 */
const FLAME = /* glsl */ `
uniform vec3 uCandleColor;
uniform vec3 uWindowColor;
uniform float uCandle;
uniform float uBrightness;
uniform float uSway;
uniform float uTime;
uniform float uLive;
varying vec2 vUv;
${NOISE}
void main() {
  float y = vUv.y;
  float slow = vnoise(vec2(y * 3.0 - uTime * 2.2, uTime * 0.7)) - 0.5;
  float fast = vnoise(vec2(y * 7.0 - uTime * 4.0, 3.0 + uTime)) - 0.5;
  float x = vUv.x - 0.5 - (uSway + 0.1 * uLive * slow) * y * y - 0.03 * uLive * fast * y;
  float w = 0.34 * pow(1.0 - y, 0.75) * smoothstep(0.0, 0.16, y) * (1.0 + 0.14 * uLive * slow);
  float body = smoothstep(w, w * 0.25, abs(x));
  float core = smoothstep(w * 0.6, 0.0, abs(x)) * smoothstep(0.02, 0.35, y) * (1.0 - smoothstep(0.55, 0.95, y));
  float wick = smoothstep(0.07, 0.0, abs(x)) * smoothstep(0.24, 0.04, y);
  vec3 color = mix(uCandleColor * 1.3, mix(uCandleColor, vec3(1.0), 0.8), core);
  color = mix(uWindowColor * 0.5, color, smoothstep(0.02, 0.2, y)) * (1.0 - 0.6 * wick);
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

/** Dust in the candlelight: each mote rises slowly, drifts on two sinusoids of its own and wraps round. */
const MOTE_VERTEX = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uPixel;
varying float vLight;
void main() {
  vec3 p = position;
  p.x += 0.12 * sin(uTime * 0.13 + aSeed * 41.0);
  p.z += 0.1 * cos(uTime * 0.11 + aSeed * 23.0);
  p.y = fract(p.y / 1.3 + uTime * 0.008 * (0.5 + aSeed)) * 1.3;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = uPixel * (1.5 + 2.5 * aSeed) * 4.0 / max(1.0, -view.z);
  vLight = 1.0 / (1.0 + 4.0 * dot(p - vec3(0.0, 0.46, 0.0), p - vec3(0.0, 0.46, 0.0)));
}
`;
const MOTE = /* glsl */ `
uniform vec3 uCandleColor;
uniform float uCandle;
uniform float uBrightness;
varying float vLight;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.1, length(d)) * 0.5 * vLight * uCandle * uBrightness;
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

const thickness = (book: ShelfBook): number => (book.form === 'lab' ? 0.028 : 0.04) + 0.006 * book.size;

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
    uRainfall: { value: 1 },
    uNight: { value: 0 },
    uGilt: { value: new Color() },
    uPages: { value: new Color() },
    uWax: { value: new Color() },
    uBrass: { value: new Color() },
    uWick: { value: new Color() },
    uSway: { value: 0 },
    uTime: { value: 0 },
    uLive: { value: 1 },
    uPixel: { value: 1 },
    uBlob: { value: [new Vector4(0, 0, 1, 0), new Vector4(0, 0, 1, 0)] },
    uShelfA: { value: new Vector3(0, 0, 9) },
    uShelfB: { value: new Vector3(0, 0, 9) },
    uWipe: { value: new DataTexture(new Uint8Array(WIPE * WIPE), WIPE, WIPE, RedFormat) },
  } satisfies Record<string, IUniform>;
  const wiped = own.uWipe.value;
  wiped.magFilter = LinearFilter;
  wiped.minFilter = LinearFilter;
  wiped.needsUpdate = true;
  const mask = wiped.image.data as Uint8Array;
  let fogging = false;

  const lit = (fragmentShader: string, uniforms: Record<string, IUniform>, vertexShader = VERTEX): ShaderMaterial =>
    new ShaderMaterial({ vertexShader, fragmentShader, uniforms: { ...shared, ...uniforms } });
  const glowing = (
    fragmentShader: string,
    uniforms: Record<string, IUniform>,
    vertexShader = BILLBOARD_VERTEX,
  ): ShaderMaterial =>
    new ShaderMaterial({
      vertexShader,
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
    desk: lit(DESK, { uBlob: own.uBlob }),
    wall: lit(WALL, { uWall: own.uWall, uShelfA: own.uShelfA, uShelfB: own.uShelfB }),
    window: lit(WINDOW, {
      uGlass: own.uGlass,
      uSize: own.uSize,
      uRain: own.uRain,
      uRainfall: own.uRainfall,
      uNight: own.uNight,
      uWipe: own.uWipe,
    }),
    boxes: lit(BOXES, { uGilt: own.uGilt, uPages: own.uPages }),
    wax: lit(SOLID, { uTint: own.uWax, uGlow: { value: 0.7 }, uShine: { value: 0.05 } }, WAX_VERTEX),
    pool: lit(SOLID, { uTint: own.uWax, uGlow: { value: 0 }, uShine: { value: 0.1 } }),
    brass: lit(SOLID, { uTint: own.uBrass, uGlow: { value: 0 }, uShine: { value: 1 } }),
    wick: lit(SOLID, { uTint: own.uWick, uGlow: { value: 0 }, uShine: { value: 0 } }),
    flame: glowing(FLAME, { uSway: own.uSway, uTime: own.uTime, uLive: own.uLive }),
    halo: glowing(HALO, {}),
    motes: glowing(MOTE, { uTime: own.uTime, uPixel: own.uPixel }, MOTE_VERTEX),
  };
  // The halo is light, not an object: the desk must not cut it where the quad dips below the surface.
  materials.halo.depthTest = false;

  const plane = new PlaneGeometry(1, 1);
  const box = new BoxGeometry(1, 1, 1, 6, 1, 1);
  const cylinder = new CylinderGeometry(1, 1, 1, 28, 10);
  const prism = new CylinderGeometry(1, 1, 1, 3, 1);
  const tetrahedron = new CylinderGeometry(0, 1, 1, 3, 1);
  const sphere = new SphereGeometry(1, 14, 10);
  const dust = new BufferGeometry();
  const tints = new InstancedBufferAttribute(new Float32Array(MAX_BOXES * 4), 4);
  box.setAttribute('aTint', tints);
  {
    const next = stream(SEED + 1);
    const positions = new Float32Array(MOTES * 3);
    const seeds = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) {
      positions[i * 3] = (next() - 0.5) * 1.1;
      positions[i * 3 + 1] = next() * 1.3;
      positions[i * 3 + 2] = (next() - 0.5) * 0.9;
      seeds[i] = next();
    }
    dust.setAttribute('position', new BufferAttribute(positions, 3));
    dust.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  }

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
  const pool = new Mesh(cylinder, materials.pool);
  const holder = new Mesh(cylinder, materials.brass);
  const wick = new Mesh(cylinder, materials.wick);
  const flame = new Mesh(plane, materials.flame);
  const halo = new Mesh(plane, materials.halo);
  const motes = new Points(dust, materials.motes);
  motes.frustumCulled = false;
  // The simplex of the stratum, in brass: a bead; a rod between two beads; a triangular plate; a tetrahedron.
  const point = new Mesh(sphere, materials.brass);
  const rod = new Mesh(cylinder, materials.brass);
  const ends = [new Mesh(sphere, materials.brass), new Mesh(sphere, materials.brass)] as const;
  const plate = new Mesh(prism, materials.brass);
  const solid = new Mesh(tetrahedron, materials.brass);
  const simplexes: readonly (readonly Mesh[])[] = [[point], [rod, ...ends], [plate], [solid]];
  halo.renderOrder = 1;
  motes.renderOrder = 2;
  flame.renderOrder = 3;
  scene.add(desk, wall, glass, boxes, wax, pool, holder, wick, halo, motes, flame, point, rod, ...ends, plate, solid);

  let layout: RoomLayout = { width: 1, height: 1, pixelRatio: 1, sheetLeft: 0, sheetRight: 1 };
  let contents: RoomContents = { books: [], simplex: 0 };
  let covers: readonly Color[] = [new Color()];
  /** The candle's share of the light, before the flicker (set by recolor). */
  let strength = 1;
  let candleX = 0;
  const woodTint = new Color();
  const notebook = new Color();

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

  /** A standing book: which work it is, its instance, and its box (centre, size, lean) for picking and pulling. */
  interface Spine {
    readonly book: number;
    readonly instance: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly sx: number;
    readonly sy: number;
    readonly sz: number;
    readonly lean: number;
    readonly tint: Color;
  }
  const spines = new Map<number, Spine>();
  /** The book pointed at, and how far out it is: one instance's matrix is recomposed when either changes. */
  let pulledNow = -1;
  let pullNow = 0;

  const coverOf = (book: ShelfBook): Color => {
    const cloth = covers[STRATA.indexOf(book.stratum)] ?? woodTint;
    return book.form === 'lab' ? notebook.copy(cloth).lerp(own.uPages.value, 0.35) : cloth;
  };

  /**
   * One shelf: a board as long as its books need (so the shelf fills as the corpus grows), the books in
   * the order given, a gap where the work being read belongs, and its neighbour leaning into the gap.
   * Oldest works are left out if the gutter cannot hold them all. Returns the board for the wall's shadow.
   */
  const shelve = (
    row: readonly (readonly [book: ShelfBook, index: number])[],
    x0: number,
    y: number,
    room: number,
    next: () => number,
  ): Vector3 => {
    let from = 0;
    const need = (): number => row.slice(from).reduce((sum, [b]) => sum + thickness(b) + 0.004, 0);
    while (from < row.length - 1 && need() > room - 0.1) from += 1;
    const width = Math.min(room, Math.max(0.3, need() + 0.2));
    put(x0, y, WALL_Z + 0.13, width, 0.035, 0.26, woodTint, 0);
    let x = x0 - width / 2 + 0.04;
    let lean = false;
    for (const [book, index] of row.slice(from)) {
      const thick = thickness(book);
      if (book.current) {
        x += thick * 0.9;
        lean = true;
        continue;
      }
      const tall = (book.form === 'lab' ? 0.24 : 0.32) + (book.form === 'lab' ? 0.08 : 0.16) * next();
      const deep = 0.17 + 0.04 * next();
      const tilt = lean ? 0.17 : (next() - 0.5) * 0.02;
      const shift = lean ? -tall * 0.085 : 0;
      const spine = {
        book: index,
        instance: count,
        x: x + thick / 2 + shift,
        y: y + 0.0175 + tall / 2,
        z: WALL_Z + 0.13,
        sx: thick,
        sy: tall,
        sz: deep,
        lean: tilt,
        tint: coverOf(book).clone(),
      };
      if (index >= 0 && count < MAX_BOXES) spines.set(index, spine);
      put(spine.x, spine.y, spine.z, thick, tall, deep, spine.tint, 1, 0, tilt);
      lean = false;
      x += thick + 0.004;
    }
    // A bookend of the shelf's wood holds the row.
    put(x + 0.02, y + 0.0175 + 0.07, WALL_Z + 0.13, 0.022, 0.14, 0.12, woodTint, 0);
    return new Vector3(x0, width / 2, y);
  };

  /** Places everything for the current gutters and contents. Deterministic: same input, same room. */
  const arrange = (): void => {
    const { width, sheetLeft, sheetRight } = layout;
    const next = stream(SEED);
    const leftNdc = sheetLeft / width - 1;
    const rightNdc = sheetRight / width;
    count = 0;
    spines.clear();
    pulledNow = -1;

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

    // Right gutter, on the desk: the candle (its height is set every frame, by the reading).
    candleX = xAt(rightNdc, CANDLE_Z);
    holder.position.set(candleX, 0.015, CANDLE_Z);
    holder.scale.set(0.125, 0.03, 0.125);
    halo.scale.set(1.5, 1.5, 1);
    flame.scale.set(0.11, 0.2, 1);
    wick.scale.set(0.004, 0.03, 0.004);
    motes.position.set(candleX, 0, CANDLE_Z);

    // Left gutter, on the wall: the corpus. Essays above, labs below; without data, an anonymous row.
    const room = Math.min(1.6, Math.max(0.3, spanAt(sheetLeft, WALL_Z) * 0.82));
    const shelfX = xAt(leftNdc, WALL_Z);
    const anonymous = (n: number): readonly (readonly [ShelfBook, number])[] =>
      Array.from({ length: n }, () => [
        {
          stratum: STRATA[Math.floor(next() * STRATA.length)] ?? 'value',
          form: 'essay' as const,
          size: Math.floor(next() * 8),
          current: false,
        },
        -1,
      ]);
    const indexed = contents.books.map((b, i) => [b, i] as const);
    const essayRow = indexed.filter(([b]) => b.form === 'essay');
    const labRow = indexed.filter(([b]) => b.form === 'lab');
    own.uShelfA.value.copy(shelve(essayRow.length > 0 ? essayRow : anonymous(9), shelfX, 1.52, room, next));
    own.uShelfB.value.copy(shelve(labRow.length > 0 ? labRow : anonymous(7), shelfX, 0.92, room, next));
    const essays = essayRow.map(([b]) => b);
    const labs = labRow.map(([b]) => b);

    // Left gutter, on the desk: the work being read, on top of the works published before and after it.
    const row = contents.books.some((b) => b.current && b.form === 'lab') ? labs : essays;
    const at = row.findIndex((b) => b.current);
    const below = [row[at + 1], row[at - 1]].flatMap((b) => (b === undefined ? [] : [b]));
    const reading = row[at];
    const pile = reading === undefined ? anonymous(3).map(([b]) => b) : [...below, reading];
    const stackX = xAt(leftNdc, STACK_Z);
    const stackWidth = Math.min(0.46, Math.max(0.2, spanAt(sheetLeft, STACK_Z) * 0.6));
    let top = 0;
    pile.forEach((book, i) => {
      const thick = thickness(book) * 0.9 + 0.02;
      const shrink =
        1 - 0.06 * (pile.length - 1 - i) * (i === pile.length - 1 ? 0 : 1) - (i === pile.length - 1 ? 0.1 : 0);
      put(
        stackX,
        top + thick / 2,
        STACK_Z,
        stackWidth * shrink,
        thick,
        stackWidth * 0.72 * shrink,
        coverOf(book),
        0.5,
        (next() - 0.5) * 0.5,
      );
      top += thick;
    });

    // On the pile: the simplex of the stratum.
    simplexes.forEach((meshes, k) => {
      for (const mesh of meshes) mesh.visible = k === contents.simplex;
    });
    const sx = stackX + stackWidth * 0.08;
    point.position.set(sx, top + 0.032, STACK_Z);
    point.scale.setScalar(0.032);
    rod.position.set(sx, top + 0.014, STACK_Z);
    rod.rotation.set(0, 0.5, Math.PI / 2);
    rod.scale.set(0.006, 0.17, 0.006);
    ends.forEach((end, i) => {
      const side = i === 0 ? -1 : 1;
      end.position.set(sx + side * 0.085 * Math.cos(0.5), top + 0.014, STACK_Z - side * 0.085 * Math.sin(0.5));
      end.scale.setScalar(0.014);
    });
    plate.position.set(sx, top + 0.006, STACK_Z);
    plate.rotation.set(0, 0.3, 0);
    plate.scale.set(0.075, 0.012, 0.075);
    solid.position.set(sx, top + 0.045, STACK_Z);
    solid.rotation.set(0, 0.3, 0);
    solid.scale.set(0.062, 0.09, 0.062);

    // What stands on the desk darkens it: the pile and the candle holder.
    own.uBlob.value[0]?.set(stackX, STACK_Z, stackWidth * 0.75, 0.5);
    own.uBlob.value[1]?.set(candleX, CANDLE_Z, 0.17, 0.5);

    boxes.count = count;
    boxes.instanceMatrix.needsUpdate = true;
    tints.needsUpdate = true;
  };

  /** The candle at what is left of it: wax, the pool it has run into, the wick, the flame and its light. */
  const burnTo = (left: number): void => {
    const height = CANDLE_HEIGHT * left;
    const spent = 1 - left;
    wax.position.set(candleX, 0.03 + height / 2, CANDLE_Z);
    wax.scale.set(CANDLE_RADIUS, height, CANDLE_RADIUS);
    pool.position.set(candleX, 0.034, CANDLE_Z);
    pool.scale.set(0.06 + 0.05 * spent, 0.008 + 0.012 * spent, 0.06 + 0.05 * spent);
    const tip = 0.03 + height;
    wick.position.set(candleX, tip + 0.005, CANDLE_Z);
    flame.position.set(candleX, tip + 0.1, CANDLE_Z + 0.002);
    halo.position.set(candleX, tip + 0.09, CANDLE_Z + 0.01);
    shared.uCandlePos.value.set(candleX, tip + 0.11, CANDLE_Z);
  };

  /** Recomposes one standing book's matrix, `out` of the way off the shelf (0 in place, 1 pulled). */
  const pose = (spine: Spine | undefined, out: number): void => {
    if (spine === undefined) return;
    quaternion.setFromEuler(euler.set(0, 0, spine.lean * (1 - out)));
    matrix.compose(
      position.set(spine.x, spine.y + 0.01 * out, spine.z + PULL_OUT * out),
      quaternion,
      scale.set(spine.sx, spine.sy, spine.sz),
    );
    boxes.setMatrixAt(spine.instance, matrix);
    boxes.instanceMatrix.needsUpdate = true;
  };

  /** The glass fogs over again: every texel of the wipe mask decays (refog) by the time since the last frame. */
  let lastTime = Number.NaN;
  const breathe = (time: number): void => {
    const dt = Number.isFinite(lastTime) ? Math.max(0, Math.min(0.1, time - lastTime)) : 0;
    lastTime = time;
    if (!fogging || dt === 0) return;
    const k = refog(1, dt);
    let any = false;
    for (let i = 0; i < mask.length; i++) {
      const v = Math.floor((mask[i] ?? 0) * k);
      mask[i] = v;
      any ||= v > 0;
    }
    fogging = any;
    wiped.needsUpdate = true;
  };

  /** A fingertip on the glass at (u, v): a soft disc of clear glass, round on the pane whatever its proportions. */
  const wipeAt = (u: number, v: number): void => {
    const aspect = own.uSize.value.x / Math.max(1e-6, own.uSize.value.y);
    const ru = WIPE_REACH;
    const rv = WIPE_REACH * aspect;
    for (let j = Math.max(0, Math.floor((v - rv) * WIPE)); j <= Math.min(WIPE - 1, Math.ceil((v + rv) * WIPE)); j++) {
      for (let i = Math.max(0, Math.floor((u - ru) * WIPE)); i <= Math.min(WIPE - 1, Math.ceil((u + ru) * WIPE)); i++) {
        const du = ((i + 0.5) / WIPE - u) / ru;
        const dv = ((j + 0.5) / WIPE - v) / rv;
        const d = du * du + dv * dv;
        if (d >= 1) continue;
        const k = j * WIPE + i;
        mask[k] = Math.max(mask[k] ?? 0, Math.round(255 * (1 - d) * (1 - d)));
      }
    }
    fogging = true;
    wiped.needsUpdate = true;
  };

  const origin = new Vector3();
  const direction = new Vector3();
  /** The ray from the eye through the viewport point (x, y), CSS px, in world space. */
  const rayAt = (x: number, y: number): void => {
    origin.copy(camera.position);
    direction
      .set((x / Math.max(1, layout.width)) * 2 - 1, 1 - (y / Math.max(1, layout.height)) * 2, 0.5)
      .unproject(camera)
      .sub(origin)
      .normalize();
  };
  /** Distance along the ray to an axis-aligned box (centre, half sizes), or Infinity (the slab method). */
  const hitBox = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): number => {
    let near = 0;
    let far = Number.POSITIVE_INFINITY;
    for (const [o, d, c, h] of [
      [origin.x, direction.x, cx, hx],
      [origin.y, direction.y, cy, hy],
      [origin.z, direction.z, cz, hz],
    ] as const) {
      if (Math.abs(d) < 1e-9) {
        if (Math.abs(o - c) > h) return Number.POSITIVE_INFINITY;
        continue;
      }
      const a = (c - h - o) / d;
      const b = (c + h - o) / d;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
      if (near > far) return Number.POSITIVE_INFINITY;
    }
    return near;
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
      own.uPixel.value = next.pixelRatio;
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
      // Brass, gilt and the charred wick are the flame's and the wood's hues at other lightnesses.
      linear(own.uBrass.value, colors.flame).multiplyScalar(0.22);
      linear(own.uGilt.value, colors.flame).multiplyScalar(0.6);
      linear(own.uWick.value, colors.wood).multiplyScalar(0.12);
      woodTint.copy(shared.uWood.value).multiplyScalar(1.15);
      covers = colors.covers.map((c) => linear(new Color(), c));
      own.uNight.value = light.night ? 1 : 0;
      // By day the window carries the room; at night the candle does and the rest falls into shadow.
      shared.uWindow.value = light.night ? 0.5 : 1.1;
      shared.uAmbient.value = light.night ? 0.58 : 0.6;
      renderer.setClearColor(own.uWall.value, 1);
      strength = light.candle;
      arrange();
    },
    furnish(next) {
      contents = next;
      arrange();
    },
    render(frame) {
      if (disposed) return;
      camera.position.set(CAMERA.x + frame.eye[0], CAMERA.y + frame.eye[1], CAMERA.z);
      if (frame.pulled !== pulledNow || frame.pull !== pullNow) {
        if (frame.pulled !== pulledNow) pose(spines.get(pulledNow), 0);
        pulledNow = frame.pulled;
        pullNow = frame.pull;
        pose(spines.get(pulledNow), pullNow);
      }
      breathe(frame.time);
      burnTo(frame.burn);
      shared.uCandle.value = strength * frame.flicker;
      shared.uBrightness.value = 0.82 + 0.18 * frame.liveliness;
      own.uRain.value = frame.rainTime;
      own.uRainfall.value = frame.rainfall;
      own.uTime.value = frame.time;
      own.uLive.value = frame.liveliness;
      own.uSway.value =
        frame.liveliness * (0.06 * Math.sin(frame.time * 2.1) + 0.03 * Math.sin(frame.time * 5.3 + 1)) +
        0.32 * frame.gust;
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
    pointAt(x, y, wipe) {
      if (disposed) return -1;
      rayAt(x, y);
      let best = -1;
      let nearest = Number.POSITIVE_INFINITY;
      for (const spine of spines.values()) {
        const t = hitBox(spine.x, spine.y, spine.z, spine.sx / 2 + 0.004, spine.sy / 2, spine.sz / 2);
        if (t < nearest) {
          nearest = t;
          best = spine.book;
        }
      }
      if (wipe && best < 0 && Math.abs(direction.z) > 1e-9) {
        const t = (glass.position.z - origin.z) / direction.z;
        const u = (origin.x + t * direction.x - glass.position.x) / glass.scale.x + 0.5;
        const v = (origin.y + t * direction.y - glass.position.y) / glass.scale.y + 0.5;
        if (t > 0 && u >= 0 && u <= 1 && v >= 0 && v <= 1) wipeAt(u, v);
      }
      return best;
    },
    flameAt() {
      origin.copy(flame.position).project(camera);
      return [((origin.x + 1) / 2) * layout.width, ((1 - origin.y) / 2) * layout.height];
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      wiped.dispose();
      canvas.removeEventListener('webglcontextlost', lost);
      for (const material of Object.values(materials)) material.dispose();
      for (const geometry of [plane, box, cylinder, prism, tetrahedron, sphere, dust]) geometry.dispose();
      boxes.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
};
