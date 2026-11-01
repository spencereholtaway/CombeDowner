// Builds the three.js scene from the map: terrain, roads, buildings, walls, trees, water and sky.
// The wider map round it, if there is one, is streamed in around the player by outskirts.ts, which
// borrows the builders here so it looks the same.
import * as THREE from "three";
import { darkable } from "./unlit";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Need, railNeed } from "./railbridge";
import { type BarMat, Building, barrierHeight, barrierLook, barrierTop, gateShape, GameMap, Line, MapData, PATHS, Pond, RIM_HALF, RIM_UP, Road, bridgeSpans, deckSides, deckTop, roofMeshAt, roofSeams, roofsFit, spanFlags } from "./map";
import * as TX from "./textures";
import { LAMP_GLASS, LAMP_GLOW, buildFurniture, buildShops } from "./furniture";
import { sky as skyNow } from "./daylight";
import { buildLandmarks, landmarkLamps } from "./landmarks";
import { Culler, show, traverseAll } from "./cull";
import { buildVegetation } from "./trees";
import { buildGrass, type Grass } from "./grass";
import { buildPitches } from "./pitches";
import { Vehicles } from "./vehicles";
import { REPOSE, aroundPortals, boreRoof, buildTunnels, cuttings, mouths, portalBanks, wingTop } from "./tunnels";
import { buildOutskirts } from "./outskirts";
import { Tiles } from "./tiles";
import { Canal, lockPits, canalBores, lockAt } from "./canal";
import { aqueductSetPieceAt } from "./landmarks/setpieces";
import { Railway } from "./railway";
import { Cableway } from "./cableway";
import { buildBackdrop } from "./backdrop";
import { NIGHT_FAR, SIMPLER_FAR, view } from "./view";
import { shadowSize } from "./safegfx";

const CHUNK = 320;

/** Accumulates non-indexed triangles with normals, UVs and colours, straight into the typed arrays
 *  the graphics card takes (growing as it goes), so a square of Bath builds without stalling. */
export class Geo {
  private n = 0;   // vertices so far
  private P = new Float32Array(3 * 1024); private N = new Int8Array(3 * 1024);
  private U = new Float32Array(2 * 1024); private C = new Uint8ClampedArray(3 * 1024);
  private vert(p: number[], n: number[], uv: number[], col: number[]) {
    if (this.n * 3 + 3 > this.P.length) {
      const grow = <T extends Float32Array | Int8Array | Uint8ClampedArray>(a: T): T => { const b = new (a.constructor as new (n: number) => T)(a.length * 2); b.set(a); return b; };
      this.P = grow(this.P); this.N = grow(this.N); this.U = grow(this.U); this.C = grow(this.C);
    }
    const k = this.n * 3, u = this.n * 2;
    this.P[k] = p[0]; this.P[k + 1] = p[1]; this.P[k + 2] = p[2];
    // which way each face points and its tint need only a byte each: two fifths less to hold
    // on the graphics card, with no difference you can see
    this.N[k] = Math.round(n[0] * 127); this.N[k + 1] = Math.round(n[1] * 127); this.N[k + 2] = Math.round(n[2] * 127);
    this.U[u] = uv[0]; this.U[u + 1] = uv[1];
    this.C[k] = col[0] * 255; this.C[k + 1] = col[1] * 255; this.C[k + 2] = col[2] * 255;
    this.n++;
  }
  tri(a: number[], b: number[], c: number[], n: number[], ua: number[], ub: number[], uc: number[], col: number[]) {
    this.vert(a, n, ua, col); this.vert(b, n, ub, col); this.vert(c, n, uc, col);
  }
  /** Quad a-b-c-d (counter-clockwise seen from the front). */
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], ua: number[], ub: number[], uc: number[], ud: number[], col: number[]) {
    this.tri(a, b, c, n, ua, ub, uc, col);
    this.tri(a, c, d, n, ua, uc, ud, col);
  }
  build(): THREE.BufferGeometry | null {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry(), k = this.n * 3;
    g.setAttribute("position", new THREE.BufferAttribute(this.P.slice(0, k), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(this.N.slice(0, k), 3, true));
    g.setAttribute("uv", new THREE.BufferAttribute(this.U.slice(0, this.n * 2), 2));
    g.setAttribute("color", new THREE.BufferAttribute(this.C.slice(0, k), 3, true));
    g.computeBoundingSphere();
    return freeOnUpload(g);
  }
  /** Walls with windows and plain walls as one model (drawn in one go by litWindows' material),
   *  each vertex marked 1 if its face has windows, 0 if plain. */
  static windowed(win: Geo | undefined, plain: Geo | undefined): THREE.BufferGeometry | null {
    const parts = [win, plain].filter((q): q is Geo => !!q && q.n > 0);
    const n = parts.reduce((a, q) => a + q.n, 0);
    if (!n) return null;
    const P = new Float32Array(3 * n), N = new Int8Array(3 * n), U = new Float32Array(2 * n), C = new Uint8ClampedArray(3 * n), W = new Uint8Array(n);
    let at = 0;
    for (const q of parts) {
      P.set(q.P.subarray(0, 3 * q.n), 3 * at); N.set(q.N.subarray(0, 3 * q.n), 3 * at);
      U.set(q.U.subarray(0, 2 * q.n), 2 * at); C.set(q.C.subarray(0, 3 * q.n), 3 * at);
      if (q === win) W.fill(255, at, at + q.n);
      at += q.n;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(P, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(N, 3, true));
    g.setAttribute("uv", new THREE.BufferAttribute(U, 2));
    g.setAttribute("color", new THREE.BufferAttribute(C, 3, true));
    g.setAttribute("win", new THREE.BufferAttribute(W, 1, true));
    g.computeBoundingSphere();
    return freeOnUpload(g);
  }
}

/**
 * Once a model has gone up to the graphics card, let go of the copy in memory: nothing reads
 * scenery back, and it doubled what the game used. Only for models with one owner that never
 * change (a disposed one can't be drawn again).
 */
export function freeOnUpload<G extends THREE.BufferGeometry>(g: G): G {
  if ((globalThis as { __keepArrays?: boolean }).__keepArrays) return g;     // (tools/bridge_audit.mjs reads what was drawn)
  for (const a of [...Object.values(g.attributes), g.index]) {
    if (a instanceof THREE.BufferAttribute) a.onUpload(() => { (a as { array: unknown }).array = null; });
  }
  return g;
}

function hash(n: number) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Add a quad whose front faces along `out` (so winding never needs thinking about). */
function facing(g: Geo, a: number[], b: number[], c: number[], d: number[], out: number[], ua: number[], ub: number[], uc: number[], ud: number[], col: number[]) {
  // across the diagonals, so a quad with two corners at one point (a wall's triangle up to the
  // roof) still says which way it faces, where a, b and c can lie in a line
  const n = cross(sub(c, a), sub(d, b));
  if (dot(n, out) >= 0) g.quad(a, b, c, d, norm(out), ua, ub, uc, ud, col);
  else g.quad(a, d, c, b, norm(out), ua, ud, uc, ub, col);
}
function facingTri(g: Geo, a: number[], b: number[], c: number[], out: number[], ua: number[], ub: number[], uc: number[], col: number[]) {
  const n = norm(cross(sub(b, a), sub(c, a)));
  if (dot(n, out) >= 0) g.tri(a, b, c, norm(out), ua, ub, uc, col);
  else g.tri(a, c, b, norm(out), ua, uc, ub, col);
}

export interface World {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  /** others: where everyone else is, for the host, which loads the map round them too (tiles.ts). */
  update(px: number, py: number, pz: number, dt?: number, others?: { x: number; z: number }[]): void;
  /** Height of the drawn surface (terrain, road, pavement or path) at scene (x, z), for things laid flat on it,
   *  or of a tunnel's floor for something at height y inside one. */
  surface(x: number, z: number, y?: number): number;
  /** On a street, pavement or path (hard underfoot), rather than grass or earth. */
  paved(x: number, z: number): boolean;
  /** Up on a pavement, off the carriageway. */
  pavement(x: number, z: number): boolean;
  /** Vehicles you can drive, parked up until someone does. */
  vehicles: Vehicles;
  /** Keep the squares of Bath within r of scene (x, z) loaded from now on (where everyone starts),
   *  and say whether they all are yet: their ground and walls, if not yet their scenery. */
  hold(x: number, z: number, r: number): boolean;
  /** The canal, its locks and boats, and the railways and their trains, where the map has them. */
  canal: Canal | null;
  railway: Railway | null;
  /** The cable car and its cabins, where the map has one. */
  cableway: Cableway | null;
  /** 0 out in the open .. 1 inside a tunnel, where the daylight goes (and the headlights come on). */
  readonly tunnel: number;
  /** In a room of a job's own, lit from within (the Art Gallery's, gallery.ts): its light is the
   *  same whatever the hour, so the people in it aren't black shapes against its white walls at night. */
  indoors: boolean;
  /** The force field's shimmer, for the zones' wall to wear too (zones.ts). */
  fieldLook: THREE.Material;
  /** Free the GPU memory behind the scene, when switching to another map. */
  dispose(): void;
}

export function buildWorld(map: GameMap): World {
  return run(worldGen(map, null)) as World;
}

/** A full-detail square round the map (tiles.ts): its scenery in a group of its own. */
export interface TileWorld {
  group: THREE.Group;
  surface(x: number, z: number, y?: number): number;
  paved(x: number, z: number): boolean;
  pavement(x: number, z: number): boolean;
  update(px: number, pz: number, dt: number): void;
  /** Free what it alone uses (the materials and models it shares stay). */
  dispose(): void;
}

/** Materials, textures and models every map's scenery shares: made by the main world, lent to its squares. */
export type Shared = Record<string, any>;

/** Build a square's scenery a slice at a time (each next() does a few milliseconds' work), with
 *  the main world's materials, into the group given (which can already be in the scene). */
export function* tileWorld(map: GameMap, shared: Shared, into: THREE.Group): Generator<void, TileWorld> {
  const since = { geo: new THREE.BufferGeometry().id, attr: new THREE.BufferAttribute(new Float32Array(0), 1).id };
  const w = (yield* worldGen(map, shared, into)) as TileWorld;
  shedArrays(into, shared, since);
  return w;
}

function sharedThings(shared: Shared) {
  const out = new Set<unknown>();
  const collect = (v: unknown) => {
    if (v instanceof THREE.Material || v instanceof THREE.Texture || v instanceof THREE.BufferGeometry) out.add(v);
    else if (v && typeof v === "object") for (const w of Object.values(v)) collect(w);
  };
  collect(shared);
  return out;
}

// Parts of a square whose models may be kept for the next square, so they must keep their own copy.
const KEEPS_MODELS = /^(landmarks|grass|lamps|sky)/;

/** freeOnUpload for the rest of a square, once it's built: the copy the page keeps of each big model
 *  made for this square alone (since: the first model and attribute numbers made for it) goes once
 *  it has been drawn, as most were already up on the graphics card by then. Models that move,
 *  are shared or may be kept for another square stay as they are. A square is thrown away whole
 *  when it's dropped and built afresh when you come back, so nothing needs them sent up again. */
function shedArrays(group: THREE.Group, shared: Shared, since: { geo: number; attr: number }) {
  if ((globalThis as { __keepArrays?: boolean }).__keepArrays) return;
  const keep = sharedThings(shared);
  const part = (o: THREE.Object3D | null): string => (!o || o === group ? "" : o.name || part(o.parent));
  traverseAll(group, (o) => {
    const g = (o as THREE.Mesh).geometry;
    if (!g || (o as THREE.InstancedMesh).isInstancedMesh || g.id < since.geo || keep.has(g) || KEEPS_MODELS.test(part(o))
      || Object.keys(g.morphAttributes).length) return;
    const all = [...Object.values(g.attributes), ...(g.index ? [g.index] : [])] as THREE.BufferAttribute[];
    if (all.some((a) => !a.isBufferAttribute || (a as unknown as THREE.InstancedBufferAttribute).isInstancedBufferAttribute || a.id < since.attr)) return;
    const held = all.filter((a) => a.array);
    if (held.reduce((n, a) => n + a.array.byteLength, 0) < 16384) return;
    if (held.length < all.length && !g.boundingSphere) return;
    g.boundingSphere ?? g.computeBoundingSphere();
    if (held.length === all.length) g.boundingBox ?? g.computeBoundingBox();
    const was = o.onAfterRender;
    o.onAfterRender = function (...args) {
      was.apply(this, args);
      o.onAfterRender = was;
      for (const a of held) (a as { array: unknown }).array = null;
    };
  });
}

/** Free what a square's scenery alone uses (the materials and models it shares with the main
 *  world stay), finished or not, and take it out of the scene. */
export function disposeTileGroup(group: THREE.Group, shared: Shared) {
  const keep = sharedThings(shared);
  traverseAll(group, (o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !keep.has(m.geometry)) m.geometry.dispose();
    if (o instanceof THREE.InstancedMesh) o.dispose();
    for (const mat of m.material ? ([] as THREE.Material[]).concat(m.material) : []) {
      if (keep.has(mat)) continue;
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture && !keep.has(v) && !v.userData.lent) v.dispose();
      mat.dispose();
    }
  });
  group.removeFromParent();
}

/** Scenery that never moves (a square of Bath, once built): work out where everything in it sits
 *  once, and from then on leave it out when three.js works out where every object is before each
 *  frame. Out in Bath that's tens of thousands of trees, walls and lamps, and redoing them all cost
 *  milliseconds a frame at a long draw distance. Anything added to it later (the grass round the
 *  player) is still placed as usual. */
function stayPut(root: THREE.Object3D, parts = [...root.children]) {
  root.updateMatrixWorld(true);
  // (the few things in it that do move, such as cricket stumps knocked flying, are marked userData.moves)
  const movers: THREE.Object3D[] = [];
  root.matrixAutoUpdate = false;
  for (const c of parts) traverseAll(c, (o) => { if (o.userData.moves) movers.push(o); else o.matrixAutoUpdate = false; });
  // everything there now goes into one group that's skipped, but for those few; what's added later goes alongside it
  const still = new THREE.Group();
  still.matrixAutoUpdate = false;
  for (const c of parts) still.add(c);
  root.add(still);
  const all = still.updateMatrixWorld.bind(still);
  still.updateMatrixWorld = (force?: boolean) => {
    if (force) all(force);
    else for (const m of movers) m.updateMatrixWorld();
  };
}

const placeAll = THREE.Object3D.prototype.updateMatrixWorld;
/** Before each frame three.js works out where everything in the scene is. Things put out of sight
 *  (cars, people and effects waiting in their pools, scenery too far off to draw) are left out of that
 *  and marked to be placed afresh when they're shown again, so the thousands of them cost nothing.
 *  Asked to place everything (force from outside), it still does. */
function placeShown(o: THREE.Object3D, force: boolean, all = force) {
  if (o.matrixAutoUpdate) o.updateMatrix();
  if (o.matrixWorldNeedsUpdate || force) {
    if (o.matrixWorldAutoUpdate) { if (o.parent) o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix); else o.matrixWorld.copy(o.matrix); }
    o.matrixWorldNeedsUpdate = false;
    force = true;
  }
  for (const c of o.children) {
    if (!c.visible && !all) c.matrixWorldNeedsUpdate = true;
    else if (c.updateMatrixWorld === placeAll) placeShown(c, force, all);
    else c.updateMatrixWorld(force);
  }
}

/** One chunk's building models by material: each kind of wall, windowed ("sw") and plain ("sp")
 *  together under its letter ("s"), and the roofs. */
function buildingModels(c: Map<string, Geo>): [string, THREE.BufferGeometry][] {
  const out: [string, THREE.BufferGeometry][] = [];
  for (const key of new Set([...c.keys()].map((k) => (k === "roof" ? k : k[0])))) {
    const g = key === "roof" ? c.get(key)!.build() : Geo.windowed(c.get(key + "w"), c.get(key + "p"));
    if (g) out.push([key, g]);
  }
  return out;
}

function run<T>(g: Generator<void, T>): T {
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

/** Walls whose windows light up after dark (world.update turns the glow up at night): some windows and not
 *  others, picked by which window it is on the wall, which storey, and the building's colour. */
const GLOWING: THREE.MeshLambertMaterial[] = [];
function litWindows(mat: THREE.MeshLambertMaterial, kind: "stone" | "brick" | "render") {
  mat.emissiveMap = TX.windowGlow(kind);
  mat.emissive.set("#ffffff");
  mat.emissiveIntensity = 0;
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      vec3 wk = vec3(floor(vMapUv), dot(vColor.rgb, vec3(91.7, 47.3, 13.1)));
      totalEmissiveRadiance *= step(0.58, fract(sin(dot(wk, vec3(12.9898, 78.233, 37.719))) * 43758.5453));`);
  };
  mat.customProgramCacheKey = () => "litWindows";
  GLOWING.push(mat);
  return mat;
}

/** One material for a kind of wall, windowed and plain alike (Geo.windowed marks which faces have
 *  windows), so a square's walls of that kind are drawn in one go instead of two. */
function anyWalls(kind: "stone" | "brick" | "render") {
  const mat = litWindows(new THREE.MeshLambertMaterial({ map: TX.wall(kind, true), vertexColors: true }), kind);
  const plainMap = TX.wall(kind, false), lit = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    lit(sh, r);
    sh.uniforms.plainMap = { value: plainMap };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float win;\nvarying float vWin;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvWin = win;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D plainMap;\nvarying float vWin;")
      .replace("#include <map_fragment>", `float isWin = step(0.5, vWin);
      diffuseColor *= mix(texture2D(plainMap, vMapUv), texture2D(map, vMapUv), isWin);`)
      .replace("totalEmissiveRadiance *= step(", "totalEmissiveRadiance *= isWin * step(");
  };
  mat.customProgramCacheKey = () => "anyWalls";
  return mat;
}

/** The sky, light and fog. */
function makeShell(scene: THREE.Scene) {
  const fogCol = new THREE.Color("#c9d6df");
  scene.background = fogCol.clone();
  scene.fog = new THREE.Fog(fogCol, view.fogNear, view.fogFar);
  // inside a tunnel the daylight goes and the fog turns dark
  const tunnelDark = new THREE.Color("#0c0b0a");
  // ---- light ------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight("#cfe0f0", "#6b6a4a", 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff0d8", 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // ---- sky dome -----------------------------------------------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(500, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color("#6f9fd0") }, bottom: { value: fogCol.clone() },
        sunDir: { value: new THREE.Vector3(0, 1, 0) }, moonDir: { value: new THREE.Vector3(0, 1, 0) }, night: { value: 0 },
      },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      // sky gradient with soft fair-weather clouds (value-noise fbm projected onto a cloud layer)
      // and, by night, stars and the moon; round the sun when it's low, a warm glow
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 moonDir; uniform float night; varying vec3 vP;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 5; k++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
        void main(){
          float h = clamp(vP.y * 2.2, 0.0, 1.0);
          // the frame is graded after this (tone mapped and encoded), so take the top colour
          // deeper to keep a bold blue overhead
          vec3 col = mix(bottom, pow(top, vec3(2.0)), pow(h, 0.7));
          if (vP.y > 0.02) {
            vec2 uv = vP.xz / (vP.y + 0.12) * 1.6;
            float c = smoothstep(0.52, 0.78, fbm(uv + vec2(3.1, 7.7)));
            float fade = smoothstep(0.02, 0.25, vP.y);
            // clouds: white by day, lit warm near a low sun, dark grey-blue at night
            float glow = pow(max(dot(vP, sunDir), 0.0), 6.0) * (1.0 - smoothstep(0.1, 0.4, sunDir.y));
            float low = (1.0 - smoothstep(0.04, 0.3, sunDir.y)) * smoothstep(-0.12, 0.0, sunDir.y);
            vec3 cloud = mix(vec3(1.5, 1.5, 1.52), vec3(0.16, 0.19, 0.27), night) * mix(vec3(1.0), vec3(1.05, 0.72, 0.55), low) + vec3(1.2, 0.55, 0.25) * glow;
            col = mix(col, cloud, c * 0.85 * fade * (1.0 - 0.35 * night));
            // the stars, in the gaps between clouds
            vec3 sp = vP * 220.0, cell = floor(sp);
            float star = hash(cell.xy + cell.z * 17.31);
            float bright = smoothstep(0.9965, 1.0, star) * (1.0 - smoothstep(0.35, 0.6, length(fract(sp) - 0.5)));
            col += vec3(0.9, 0.92, 1.0) * bright * night * (1.0 - c) * smoothstep(0.05, 0.3, vP.y) * 1.6;
          }
          // the sun low down warms the sky round it
          float halo = pow(max(dot(vP, sunDir), 0.0), 12.0) * (1.0 - smoothstep(0.05, 0.35, sunDir.y)) * smoothstep(-0.15, 0.0, sunDir.y);
          col += vec3(1.0, 0.45, 0.15) * halo * 0.9;
          // the moon, with a faint ring of light round it
          float m = dot(vP, moonDir);
          col += vec3(0.95, 0.95, 0.85) * smoothstep(0.99965, 0.9998, m) * night * 1.4;
          col += vec3(0.25, 0.3, 0.42) * pow(max(m, 0.0), 60.0) * night * 0.5;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);
  return { tunnelDark, hemi, sun, sky };
}

/**
 * The scenery of a map, built a slice at a time: everything for the main map (lent null), with
 * the sky, the force field and the vehicles, or just the scenery of one full-detail square (lent:
 * the main world's shared materials), into a group of its own.
 */
// a weir (world.ts draws the map's wf): its crest stands this far over the water above and is twice
// this wide; the water pours off it this far out for each metre it falls (within these), in streaks
// this wide, and its white water reaches this far on past where it lands. The colours are Pulteney
// Weir's (landmarks/pulteney.ts), as vertex colours.
const WEIR_CREST_UP = 0.12, WEIR_CREST_HALF = 0.35, WEIR_RUN = 1.1, WEIR_RUN_LEAST = 0.35, WEIR_RUN_MOST = 3.0;
const WEIR_STREAK = 0.7, WEIR_FROTH = 0.8;
const WEIR_STONE = [0.48, 0.38, 0.22], WEIR_FOAM = [0.9, 0.93, 0.93];
const WEIR_STREAKS = [[0.09, 0.21, 0.28], [0.16, 0.3, 0.37], [0.11, 0.25, 0.32], [0.2, 0.34, 0.4]];

function* worldGen(map: GameMap, lent: Shared | null, into?: THREE.Group): Generator<void, World | TileWorld> {
  const core = !lent, S: Shared = lent ?? {};
  if (core) S.railTracks = map.railData?.tracks.map((t) => t.p) ?? [];
  const D = map.d, T = D.t, Z0 = map.z0;
  const group = into ?? new THREE.Group();
  const scene: THREE.Object3D = core ? new THREE.Scene() : group;
  // the scene itself never moves, so it needn't make everything in it work out its place afresh each frame (stayPut)
  if (core) { scene.matrixAutoUpdate = false; scene.updateMatrixWorld = function (force?: boolean) { placeShown(this, !!force); }; }
  const culler = new Culler();
  const shell = core ? makeShell(scene as THREE.Scene) : null;
  let dark = 0, indoors = false;
  const indoorSun = new THREE.Color("#fff4e2"), indoorSky = new THREE.Color("#fffaf0"), indoorGround = new THREE.Color("#8a7458");
  // (names what each part of the build adds, so the frame-rate probe, tools/fpsprobe.mjs, can count draws by kind)
  let marked = 0;
  const mark = (name: string) => { (globalThis as any).__wphase = name; for (; marked < scene.children.length; marked++) scene.children[marked].name ||= name; };
  mark("sky");

  // ---- terrain --------------------------------------------------------------------
  const GROUND = [
    new THREE.Color("#6e7f4c"), // garden and verge grass
    new THREE.Color("#678a45"), // sports pitch
    new THREE.Color("#5a5638"), // woodland floor
    new THREE.Color("#8e9160"), // farmland and meadow
    new THREE.Color("#687a55"), // cemetery
    new THREE.Color("#8f8b82"), // hard standing
    new THREE.Color("#6a5a3c"), // flowerbeds
    new THREE.Color("#7d7350"), // playgrounds: worn grass, bark and sand
  ];
  const earth = new THREE.Color("#7a6a4c");
  const RW: Record<string, number> = { trunk: 9, primary: 8.5, secondary: 8, tertiary: 7, residential: 6, unclassified: 5.5, living_street: 5, service: 3.5, unknown: 4, pedestrian: 6, footway: 1.6, steps: 1.8, cycleway: 2, path: 1.4, track: 2.8, bridleway: 2 };
  const width = (r: { c: string; w?: number }) => r.w ?? RW[r.c] ?? 4;   // a pedestrianised street has its own (wall to wall)
  const KERBED = new Set(["trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "living_street"]);
  const PAVE = 1.7;   // pavement width each side of a kerbed street
  // each pavement's width [left, right]: narrower, or none, where OpenStreetMap or the lidar says so (tools/roadwidth.py)
  const pvs = (r: { pv?: number[] }) => r.pv ?? [PAVE, PAVE];
  const pv = (r: { pv?: number[] }) => Math.max(...pvs(r));
  // Drawn terrain sits a little lower under streets and paths, so hillsides never poke through
  // them: well down under the carriageway, and only a little under the pavements, so a pavement's
  // outer edge stands a kerb's height above the grass beside it, not a slab's. The player still
  // walks on the true ground height.
  const sink = new Float32Array(T.nx * T.ny);
  // Streets are drawn level across at their middle's height, the drawn ground is pulled down under
  // them (and one triangle round) so it never shows through, and each edge has a face down or up
  // to the drawn ground: a kerb, or where it's tall, a Bath-stone retaining wall (?roads=old draws
  // them draped on the ground as before, to compare)
  let faceGeo: Geo | null = null;    // where the tall faces at streets' edges go: stone
  const LEVEL = typeof location === "undefined" || new URLSearchParams(location.search).get("roads") !== "old";
  // ?roads=strips draws every street as strips along its line, as before the faces, to compare
  const SURFACES = typeof location === "undefined" || new URLSearchParams(location.search).get("roads") !== "strips";
  // A square with its streets' faces lets them decide where the ground is pulled down, what height you
  // walk at and where grass grows: strips along each street's line reach past the faces in places and
  // fall short in others, which showed as grass and hillside through the street
  const faced = !!D.sf && SURFACES;
  const FACE_KINDS = ["road", "service", "pave", "path", "front", "drive", "grass", "dirt", "gravel"] as const, FACE_LIFT = [0.07, 0.07, 0.17, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04];
  const nFaces = faced ? FACE_KINDS.reduce((t, kind) => t + Math.floor((D.sf![kind]?.length ?? 0) / 3), 0) : 0;
  const faceXYZ = new Float64Array(nFaces * 9), faceKind = new Uint8Array(nFaces);
  if (faced) {
    let t = 0;
    FACE_KINDS.forEach((kind, n) => {
      const V = D.sf!.v, I = D.sf![kind] ?? [];
      for (let k = 0; k + 2 < I.length; k += 3, t++) {
        for (let c = 0; c < 3; c++) { const i = I[k + c], o = t * 9 + c * 3; faceXYZ[o] = V[3 * i]; faceXYZ[o + 1] = V[3 * i + 1]; faceXYZ[o + 2] = V[3 * i + 2] - Z0; }
        faceKind[t] = n;
      }
    });
  }
  /** Where (x, y) lies in face triangle t, as weights on its three corners (left in `fw`, to avoid a
   *  fresh array per call); returns the smallest, at least 0 when the point is inside the triangle. */
  const fw = [0, 0, 0];
  const faceWeights = (t: number, x: number, y: number) => {
    const F = faceXYZ, o = t * 9;
    const ax = F[o], ay = F[o + 1], bx = F[o + 3], by = F[o + 4], cx = F[o + 6], cy = F[o + 7];
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy) || 1e-9;
    const wa = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d, wb = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
    fw[0] = wa; fw[1] = wb; fw[2] = 1 - wa - wb;
    return Math.min(wa, wb, fw[2]);
  };
  const faceZ = (t: number) => fw[0] * faceXYZ[t * 9 + 2] + fw[1] * faceXYZ[t * 9 + 5] + fw[2] * faceXYZ[t * 9 + 8];
  // (level streets) the drawn height each grid point is pulled down to: under a carriageway, the
  // lowest carriageway's, below its surface, so a street below never digs a wall across one above;
  // under a pavement or in the triangle round streets, just under the lowest street's surface, so
  // the ground between a street and one above it is a retaining wall at the lower one's back edge
  // with no pit dug below both
  const KERB_RAISE = 0.25;
  const underTo = new Float32Array(T.nx * T.ny).fill(Infinity), roundTo = new Float32Array(T.nx * T.ny).fill(Infinity);
  const covered = new Uint8Array(T.nx * T.ny);     // (a grid point under a carriageway face)
  const sinkUnder = (r: Road, reach: number, depth: number, hard: boolean) => {
    const own = reach;
    if (LEVEL) reach += T.dx * 0.75;
    for (let k = 0; k < r.p.length - 1; k++) {
      const [ax, ay] = r.p[k], [bx, by] = r.p[k + 1], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - T.x0) / T.dx)), i1 = Math.min(T.nx - 1, Math.ceil((Math.max(ax, bx) + reach - T.x0) / T.dx));
      const j0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - T.y0) / T.dy)), j1 = Math.min(T.ny - 1, Math.ceil((Math.max(ay, by) + reach - T.y0) / T.dy));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = T.x0 + i * T.dx, y = T.y0 + j * T.dy;
        const t = Math.min(1, Math.max(0, ((x - ax) * vx + (y - ay) * vy) / l2));
        const d = Math.hypot(x - ax - vx * t, y - ay - vy * t);
        if (d < reach) {
          const v = j * T.nx + i;
          if (LEVEL) {
            const hc = map.trueGround(ax + vx * t, -(ay + vy * t));
            if (hard && d < own) underTo[v] = Math.min(underTo[v], hc - depth);
            else roundTo[v] = Math.min(roundTo[v], hc - (d < own ? depth : 0.05));
          } else sink[v] = Math.max(sink[v], depth);
        }
      }
    }
  };
  for (const r of D.rd) {
    if (PATHS.has(r.c)) continue;      // (paths lie on the ground as it's drawn: see the strips below)
    if (faced && !r.bridge && !r.piece) continue;
    sinkUnder(r, width(r) / 2 + 0.5, 0.3, true);
    if (KERBED.has(r.c) && pv(r) > 0) sinkUnder(r, width(r) / 2 + pv(r) + 0.4, 0.08, false);
  }
  // under a face, as under a strip: well down beneath a carriageway, a little beneath a pavement, and
  // just beneath the face's lowest corner for the grid points round it, so no hillside shows through
  if (LEVEL) for (let t = 0; t < faceKind.length; t++) {
    if (t % 400 === 399) yield;
    if (faceKind[t] > 2) continue;     // (paths and drives lie on the ground as it's drawn)
    const F = faceXYZ, o = t * 9, reach = T.dx * 0.75, pave = faceKind[t] === 2;
    const i0 = Math.max(0, Math.floor((Math.min(F[o], F[o + 3], F[o + 6]) - reach - T.x0) / T.dx)), i1 = Math.min(T.nx - 1, Math.ceil((Math.max(F[o], F[o + 3], F[o + 6]) + reach - T.x0) / T.dx));
    const j0 = Math.max(0, Math.floor((Math.min(F[o + 1], F[o + 4], F[o + 7]) - reach - T.y0) / T.dy)), j1 = Math.min(T.ny - 1, Math.ceil((Math.max(F[o + 1], F[o + 4], F[o + 7]) + reach - T.y0) / T.dy));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = T.x0 + i * T.dx, y = T.y0 + j * T.dy, v = j * T.nx + i;
      if (faceWeights(t, x, y) >= 0) {
        if (pave) roundTo[v] = Math.min(roundTo[v], faceZ(t) - 0.08);
        else underTo[v] = Math.min(underTo[v], faceZ(t) - 0.3);
        covered[v] = 1;
        continue;
      }
      // the face's height at its nearest edge, not its lowest corner: a long face down a hill would
      // otherwise dig the grass beside its top end metres below the street
      let d2 = Infinity, near = 0;
      for (let e = 0; e < 3; e++) {
        const a3 = o + e * 3, b3 = o + (e + 1) % 3 * 3;
        const ax = F[a3], ay = F[a3 + 1], bx = F[b3], by = F[b3 + 1];
        const vx = bx - ax, vy = by - ay, u = Math.min(1, Math.max(0, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
        const ex = x - ax - vx * u, ey = y - ay - vy * u, de2 = ex * ex + ey * ey;
        if (de2 < d2) { d2 = de2; near = F[a3 + 2] + (F[b3 + 2] - F[a3 + 2]) * u; }
      }
      // (the grass comes up to just under the face's top, as a verge or a garden meets it, rather
      // than leaving a dark step down from a pavement's back or a lane's edge)
      if (d2 < reach * reach) roundTo[v] = Math.min(roundTo[v], near + (pave ? 0.14 : 0.04));
    }
  }
  // the grid points just inside a face's edge are let down less, as the ground's triangles from them
  // reach out under the grass beside it: well down, they dragged that grass a hand below the street's
  // edge, and its face showed as a dark step beside a lane or a drive's mouth
  if (LEVEL) for (let v = 0; v < covered.length; v++) {
    if (!covered[v] || underTo[v] === Infinity) continue;
    const i = v % T.nx, j = (v - i) / T.nx;
    if ((i > 0 && !covered[v - 1]) || (i < T.nx - 1 && !covered[v + 1]) || (j > 0 && !covered[v - T.nx]) || (j < T.ny - 1 && !covered[v + T.nx])) underTo[v] += 0.2;
  }
  // (the grass beside a face is brought up a little to meet it, if the true ground falls away there, so
  // a pavement or a carriageway edge stands a kerb high above it, not a wall)
  if (LEVEL) for (let v = 0; v < sink.length; v++) {
    const to = underTo[v] < Infinity ? underTo[v] : roundTo[v];
    if (to < Infinity) sink[v] = Math.max(faced && underTo[v] === Infinity ? -KERB_RAISE : 0, T.h[v] / 10 - to);
  }
  // in front of a tunnel's headwall the cutting is dug to the floor between its wing walls, so you
  // walk on its floor (the slope up the wall that the grid leaves is hidden: tunnels.ts mouths)
  const cuts = cuttings(map);
  // Behind the headwall the hill is made up to just under its top for a grid square or so, where it
  // stands lower and no street lies on it: the grid's triangles from the dug floor in front dipped
  // behind the wall and left the top of the tube standing out of the ground.
  // Behind a wing wall holding a steep bank that stands back from it, the ground is made up to just
  // under its top in the same way, rather than dug to the floor with the cutting, which left a
  // trench along the back of the wall.
  for (const { cx, cy, dx, dy, left, right, reach, floor, top, crown, wings, steep } of cuts) {
    const nx = -dy, ny = dx, to = floor - Z0 - 0.05, fill = top - Z0 - 0.3, pad = T.dx, back = T.dx * 1.5;
    const r = Math.hypot(Math.max(-left, right) + pad, Math.max(reach, back) + pad);
    const i0 = Math.max(0, Math.floor((cx - r - T.x0) / T.dx)), i1 = Math.min(T.nx - 1, Math.ceil((cx + r - T.x0) / T.dx));
    const j0 = Math.max(0, Math.floor((cy - r - T.y0) / T.dy)), j1 = Math.min(T.ny - 1, Math.ceil((cy + r - T.y0) / T.dy));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = T.x0 + i * T.dx - cx, y = T.y0 + j * T.dy - cy, out = -(x * dx + y * dy), s = x * nx + y * ny, v = j * T.nx + i;
      if (out < 0 && out > -back && s > left && s < right && !covered[v]) {
        // (never above a street beside it, but the tunnel's own road, ending at the portal, doesn't count)
        const by = roundTo[v] < to + crown ? Infinity : roundTo[v];
        sink[v] = Math.min(sink[v], T.h[v] / 10 - Math.min(fill, by));
        continue;
      }
      if (out < 0 || out > reach || s < left - pad || s > right + pad) continue;
      const side = s < left ? 0 : 1, held = (s < left || s > right) && steep[side] ? wingTop(wings[side], out) : -Infinity;
      if (held > -Infinity) {
        if (!covered[v] && roundTo[v] === Infinity) sink[v] = Math.min(sink[v], T.h[v] / 10 - (held - Z0 - 0.3));
        continue;
      }
      sink[v] = Math.max(sink[v], T.h[v] / 10 - to);
    }
  }
  // where the wider map meets this one, the edge stays at the true ground, as the wider map's does
  if (map.wide || !core) for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) {
    if (i === 0 || j === 0 || i === T.nx - 1 || j === T.ny - 1) sink[j * T.nx + i] = 0;
  }
  yield;
  const tPos = new Float32Array(T.nx * T.ny * 3), tCol = new Float32Array(T.nx * T.ny * 3), tUv = new Float32Array(T.nx * T.ny * 2);
  const hAt = (i: number, j: number) => T.h[Math.min(T.ny - 1, Math.max(0, j)) * T.nx + Math.min(T.nx - 1, Math.max(0, i))] / 10;
  const c = new THREE.Color();
  for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) {
    const v = j * T.nx + i, x = T.x0 + i * T.dx, z = -(T.y0 + j * T.dy);
    tPos[v * 3] = x; tPos[v * 3 + 1] = hAt(i, j) - sink[v]; tPos[v * 3 + 2] = z;
    tUv[v * 2] = x / 7; tUv[v * 2 + 1] = z / 7;
    const slope = Math.hypot(hAt(i + 1, j) - hAt(i - 1, j), hAt(i, j + 1) - hAt(i, j - 1)) / (2 * T.dx);
    c.copy(GROUND[+T.k[v]] ?? GROUND[0]);
    c.lerp(earth, Math.min(0.75, Math.max(0, (slope - 0.45) * 1.4)));
    const n = 0.9 + hash(v) * 0.16;
    tCol[v * 3] = c.r * n; tCol[v * 3 + 1] = c.g * n; tCol[v * 3 + 2] = c.b * n;
    if (i === T.nx - 1 && j % 16 === 15) yield;
  }
  yield;
  // the height the terrain is drawn at (a little below the true ground under streets)
  // (and inside the canal's banks, where its own ground is drawn instead: works.ts)
  const drawnGround = (x: number, z: number) => {
    const h = map.works?.height(x, -z);
    return h !== undefined && h !== null ? h - map.z0 : Math.min(drawnBare(x, z), cutFloor(x, -z));
  };
  // (a path into a tunnel lies on the cutting's floor up to the tube's, not up the grid's slope onto the hill)
  const cutFloor = (x: number, y: number) => {
    let low = Infinity;
    for (const { cx, cy, dx, dy, left, right, reach, floor } of cuts) {
      const ox = x - cx, oy = y - cy, out = -(ox * dx + oy * dy), s = ox * -dy + oy * dx;
      if (out > -2 && out < reach && s > left && s < right) low = Math.min(low, floor - Z0);
    }
    return low;
  };
  // (round a cutting, where the ground is dug a grid square past its walls, a street or path on the
  // bank above stands on the bank, not on the dug floor: its side face would hang down the wall)
  const cutBank = (x: number, y: number) => {
    for (const { cx, cy, dx, dy, left, right, reach } of cuts) {
      const ox = x - cx, oy = y - cy, out = -(ox * dx + oy * dy), s = ox * -dy + oy * dx;
      if (out > -2 && out < reach + T.dx && s > left - T.dx && s < right + T.dx) return map.trueGround(x, -y);
    }
    return -Infinity;
  };
  const drawnBare =(x: number, z: number) => {
    const fi = (x - T.x0) / T.dx, fj = (-z - T.y0) / T.dy;
    if (map.wide && (fi < 0 || fj < 0 || fi > T.nx - 1 || fj > T.ny - 1)) return map.trueGround(x, z);   // out in the wider map
    const i = Math.min(T.nx - 2, Math.max(0, Math.floor(fi))), j = Math.min(T.ny - 2, Math.max(0, Math.floor(fj)));
    const u = Math.min(1, Math.max(0, fi - i)), v = Math.min(1, Math.max(0, fj - j));
    const h = (k: number) => tPos[k * 3 + 1], n = T.nx, a = j * n + i;
    if (u + v <= 1) return h(a) + (h(a + 1) - h(a)) * u + (h(a + n) - h(a)) * v;
    return h(a + n + 1) + (h(a + n) - h(a + n + 1)) * (1 - u) + (h(a + 1) - h(a + n + 1)) * (1 - v);
  };
  // the triangles of grid cells i0..i1, j0..j1 (on a 2 m grid drawn adaptively, a 4 m cell is
  // two triangles where it's within reach of its 2 m points: map.ts adaptGrid)
  const cellTris = function* (idx: number[], i0: number, j0: number, i1: number, j1: number): Generator<void> {
    const F = map.fine, cw = (T.nx - 1) / 2;
    for (let j = j0; j < j1; j++) { for (let i = i0; i < i1; i++) {
      const a = j * T.nx + i;
      if (F && !F[(j >> 1) * cw + (i >> 1)]) {
        if (i % 2 || j % 2) continue;
        const b = a + 2, cc = a + 2 * T.nx, d = cc + 2;
        idx.push(a, b, cc, b, d, cc);
        continue;
      }
      const b = a + 1, cc = a + T.nx, d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    } if ((j - j0) % 24 === 23) yield; }
  };
  const tIdx: number[] = [];
  yield* cellTris(tIdx, 0, 0, T.nx - 1, T.ny - 1);
  yield;
  const terrGeo = new THREE.BufferGeometry();
  terrGeo.setAttribute("position", new THREE.BufferAttribute(tPos, 3));
  terrGeo.setAttribute("color", new THREE.BufferAttribute(tCol, 3));
  terrGeo.setAttribute("uv", new THREE.BufferAttribute(tUv, 2));
  // how far each point is inside the canal's banks (works.ts): the ground isn't drawn inside them
  const works = map.works;
  if (works) terrGeo.setAttribute("cut", new THREE.BufferAttribute(works.sd.slice(), 1));   // (a copy: the map keeps its own for the ground)
  terrGeo.setIndex(tIdx);
  terrGeo.computeVertexNormals();
  const groundTex: THREE.Texture = S.groundTex ??= TX.groundDetail();
  // and no ground inside a tunnel's mouth, so you can see into it (tunnels.ts), nor in a lock's
  // chamber, down to its floor (canal.ts): a square of Bath with a tunnel or a lock of its own has
  // its own ground material, with its own mouths
  const mouth = mouths(map);
  const pits = lockPits(map.canalData ?? (map.canal instanceof Canal ? map.canal.d : null), map.z0, T.x0, T.y0, T.x0 + (T.nx - 1) * T.dx, T.y0 + (T.ny - 1) * T.dy);
  mouth.a.push(...pits.a); mouth.b.push(...pits.b);
  // and none inside the canal's tunnels, so you see through them from portal to portal
  const bores = canalBores(map.canalData ?? (map.canal instanceof Canal ? map.canal.d : null), map.z0, T.x0, T.y0, T.x0 + (T.nx - 1) * T.dx, T.y0 + (T.ny - 1) * T.dy);
  mouth.a.push(...bores.a); mouth.b.push(...bores.b);
  const ownTerr = !S.terrMat || mouth.a.length > 0 || !!works;
  const terrMat: THREE.MeshLambertMaterial = ownTerr ? new THREE.MeshLambertMaterial({ vertexColors: true, map: groundTex }) : S.terrMat;
  // a soft light-and-dark mottle across tens of metres, so the ground detail doesn't look tiled
  const mottle = S.mottle ??= { value: TX.mottle() };
  // (each count of tunnel mouths is its own shader: three.js would otherwise hand a square with
  // mouths the program compiled for one without, or the other way round, by the code's text alone)
  if (ownTerr && !mouth.a.length && !works) S.terrMat ??= terrMat;
  if (ownTerr) terrMat.onBeforeCompile = (shader) => {
    shader.uniforms.mottle = mottle;
    shader.fragmentShader = "uniform sampler2D mottle;\n" + shader.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
      float mt = texture2D(mottle, vMapUv * 0.061).r * 0.6 + texture2D(mottle, vMapUv * 0.23 + 0.37).r * 0.4;
      diffuseColor.rgb *= 0.78 + 0.44 * mt;`);
    if (works) {
      shader.vertexShader = "attribute float cut;\nvarying float vCut;\n" + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      vCut = cut;`);
      shader.fragmentShader = "varying float vCut;\n" + shader.fragmentShader.replace("void main() {", `void main() {
      if (vCut < 0.0) discard;`);
    }
    if (!mouth.a.length) return;
    const N = mouth.a.length;
    shader.uniforms.mouthA = { value: mouth.a };
    shader.uniforms.mouthB = { value: mouth.b };
    shader.vertexShader = "varying vec3 vTerr;\n" + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      vTerr = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = `varying vec3 vTerr; uniform vec4 mouthA[${N}]; uniform vec4 mouthB[${N}];\n` + shader.fragmentShader.replace("void main() {", `void main() {
      for (int k = 0; k < ${N}; k++) {
        vec2 d = vTerr.xz - mouthA[k].xy;
        float along = dot(d, mouthA[k].zw), across = abs(d.x * mouthA[k].w - d.y * mouthA[k].z), up = vTerr.y - mouthB[k].x;
        if (along > -0.3 && along < mouthB[k].w && across < mouthB[k].z && up > 0.1 && up < mouthB[k].y) discard;
      }`);
  };
  // each square has its own number of tunnel mouths, so its own shader: without this three.js would
  // reuse the first square's (it goes by the code above, the same for all), and a square with
  // fewer mouths would leave gaps in the list and stop the drawing
  if (ownTerr) terrMat.customProgramCacheKey = () => `terrain:${mouth.a.length}:${works ? 1 : 0}`;
  // Draw the ground as tiles that share one set of vertices, so tiles behind the camera or
  // past the far plane are skipped: a square of Bath is three by three of them (each one costs
  // the computer a little to draw however small, and Bath has a lot of squares in sight).
  const TILE = core ? 48 : Math.ceil((T.nx - 1) / 3);   // grid cells per tile side
  const fineTerr: THREE.Mesh[] = [];
  let tfin = 0;
  for (let tj = 0; tj < T.ny - 1; tj += TILE) for (let ti = 0; ti < T.nx - 1; ti += TILE) {
    const idx: number[] = [];
    let lo = Infinity, hi = -Infinity;
    for (let j = tj; j < Math.min(T.ny - 1, tj + TILE); j++) for (let i = ti; i < Math.min(T.nx - 1, ti + TILE); i++) {
      const a = j * T.nx + i;
      lo = Math.min(lo, tPos[a * 3 + 1]); hi = Math.max(hi, tPos[a * 3 + 1]);
    }
    yield* cellTris(idx, ti, tj, Math.min(T.nx - 1, ti + TILE), Math.min(T.ny - 1, tj + TILE));
    const g = new THREE.BufferGeometry();
    for (const name of ["position", "color", "uv", "normal", ...(works ? ["cut"] : [])]) g.setAttribute(name, terrGeo.getAttribute(name));
    g.setIndex(idx);
    freeOnUpload(g);
    const i1 = Math.min(T.nx - 1, ti + TILE), j1 = Math.min(T.ny - 1, tj + TILE);
    const cx = T.x0 + (ti + i1) / 2 * T.dx, cz = -(T.y0 + (tj + j1) / 2 * T.dy);
    const half = Math.hypot((i1 - ti) * T.dx, (j1 - tj) * T.dy, hi - lo) / 2;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, (lo + hi) / 2, cz), half);
    const tile = new THREE.Mesh(g, terrMat);
    tile.receiveShadow = true;
    scene.add(tile);
    fineTerr.push(tile);
    if (++tfin % 4 === 3) yield;
  }
  yield;
  // the canal's banks, where the ground is cut away for them (works.ts), their verges laid on the
  // ground as it's drawn and in its colours there
  if (works) {
    const colour = (x: number, y: number) => {
      const i = Math.min(T.nx - 1, Math.max(0, Math.round((x - T.x0) / T.dx))), j = Math.min(T.ny - 1, Math.max(0, Math.round((y - T.y0) / T.dy))), v = j * T.nx + i;
      return new THREE.Color(tCol[v * 3], tCol[v * 3 + 1], tCol[v * 3 + 2]);
    };
    const g = works.geometry(map.z0, (x, y) => drawnBare(x, -y) + map.z0, colour);
    if (g) {
      const m = new THREE.Mesh(g, S.worksMat ??= new THREE.MeshLambertMaterial({ vertexColors: true, map: groundTex, side: THREE.DoubleSide }));
      m.receiveShadow = true;
      freeOnUpload(g);
      g.computeBoundingSphere();
      scene.add(m);
      fineTerr.push(m);
    }
    yield;
  }
  // A square seen from far off (SIMPLER_FAR: view.ts) swaps its ground for one mesh on a grid about
  // 12 m apart. Each point there is let down a little towards the lowest ground round it, so the
  // coarser ground doesn't cover the streets lying on the finer, and a skirt round the edge hangs
  // down to hide any gap where it meets the square next door.
  let farTerr: THREE.Mesh | null = null;
  if (!core && T.nx > 2) {
    const S = Math.max(2, Math.round(12 / T.dx));
    const cols = (n: number) => { const a: number[] = []; for (let i = 0; i < n - 1; i += S) a.push(i); a.push(n - 1); return a; };
    const ci = cols(T.nx), cj = cols(T.ny), nI = ci.length, nJ = cj.length;
    const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
    const vert = (i: number, j: number, h: number) => {
      const v = j * T.nx + i;
      pos.push(tPos[v * 3], h, tPos[v * 3 + 2]); col.push(tCol[v * 3], tCol[v * 3 + 1], tCol[v * 3 + 2]); uv.push(tUv[v * 2], tUv[v * 2 + 1]);
      return pos.length / 3 - 1;
    };
    for (const j of cj) for (const i of ci) {
      const h = tPos[(j * T.nx + i) * 3 + 1];
      let lo = h;
      // (the edges keep their true height, so two far squares side by side meet exactly)
      if (i > 0 && j > 0 && i < T.nx - 1 && j < T.ny - 1)
        for (let b = Math.max(0, j - S); b <= Math.min(T.ny - 1, j + S); b++) for (let a = Math.max(0, i - S); a <= Math.min(T.nx - 1, i + S); a++) lo = Math.min(lo, tPos[(b * T.nx + a) * 3 + 1]);
      vert(i, j, Math.max(lo, h - 0.5));
    }
    for (let b = 0; b < nJ - 1; b++) for (let a = 0; a < nI - 1; a++) {
      const p = b * nI + a, q = p + 1, r = p + nI, t = r + 1;
      idx.push(p, q, r, q, t, r);
    }
    // the skirt, both ways round, so it covers a gap seen from either side
    const edge = [...ci.map((i) => [i, 0]), ...cj.slice(1).map((j) => [T.nx - 1, j]), ...ci.slice(0, -1).reverse().map((i) => [i, T.ny - 1]), ...cj.slice(0, -1).reverse().map((j) => [0, j])];
    for (let k = 0; k < edge.length - 1; k++) {
      const [ia, ja] = edge[k], [ib, jb] = edge[k + 1];
      const ha = tPos[(ja * T.nx + ia) * 3 + 1], hb = tPos[(jb * T.nx + ib) * 3 + 1];
      const A = vert(ia, ja, ha), B = vert(ib, jb, hb), A2 = vert(ia, ja, ha - 4), B2 = vert(ib, jb, hb - 4);
      idx.push(A, A2, B, B, A2, B2, A, B, A2, B, B2, A2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const nor = g.getAttribute("normal") as THREE.BufferAttribute;
    for (let v = nI * nJ; v < nor.count; v++) nor.setXYZ(v, 0, 1, 0);   // (the skirt's two sides cancel out: light it as the ground)
    g.computeBoundingSphere();
    freeOnUpload(g);
    farTerr = new THREE.Mesh(g, terrMat);
    farTerr.receiveShadow = true;
    farTerr.visible = false;
    scene.add(farTerr);
  }
  yield;

  // ground beyond the map edge, so the world doesn't end in a cliff: a sheet around the map (not
  // under it, or it would cover low ground seen from above), about as high as the land at the edge.
  // (With a wider map round it, that's drawn instead: outskirts.ts.)
  if (core && !map.wide) {
  const edgeH: number[] = [];
  for (let i = 0; i < T.nx; i++) edgeH.push(hAt(i, 0), hAt(i, T.ny - 1));
  for (let j = 0; j < T.ny; j++) edgeH.push(hAt(0, j), hAt(T.nx - 1, j));
  edgeH.sort((p, q) => p - q);
  const x1 = T.x0 + (T.nx - 1) * T.dx, y1 = T.y0 + (T.ny - 1) * T.dy;
  const sheet = new THREE.Shape([[-1500, -1500], [1500, -1500], [1500, 1500], [-1500, 1500]].map(([x, y]) => new THREE.Vector2(x, y)));
  sheet.holes.push(new THREE.Path([[T.x0, T.y0], [T.x0, y1], [x1, y1], [x1, T.y0]].map(([x, y]) => new THREE.Vector2(x, y))));
  const outer = new THREE.Mesh(new THREE.ShapeGeometry(sheet).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#66774a" }));
  outer.position.y = Math.min(60, edgeH[edgeH.length >> 1]);
  scene.add(outer);
  const skirt: number[] = [];
  const edgeLine = (pts: [number, number][]) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [i, j] = pts[k], [i2, j2] = pts[k + 1];
      const ax = T.x0 + i * T.dx, az = -(T.y0 + j * T.dy), bx = T.x0 + i2 * T.dx, bz = -(T.y0 + j2 * T.dy);
      skirt.push(ax, hAt(i, j), az, bx, hAt(i2, j2), bz, bx, 0, bz, ax, hAt(i, j), az, bx, 0, bz, ax, 0, az);
    }
  };
  const rng = (n: number) => [...Array(n).keys()];
  edgeLine(rng(T.nx).map((i) => [i, 0])); edgeLine(rng(T.nx).map((i) => [i, T.ny - 1]));
  edgeLine(rng(T.ny).map((j) => [0, j])); edgeLine(rng(T.ny).map((j) => [T.nx - 1, j]));
  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute("position", new THREE.Float32BufferAttribute(skirt, 3));
  skirtGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(skirtGeo, new THREE.MeshLambertMaterial({ color: "#5d6b3f", side: THREE.DoubleSide })));
  }

  mark("ground");
  // ---- ribbons draped on the terrain -------------------------------------------------
  const ribbon = (lines: { p: number[][] }[], width: (l: any) => number, lift: number) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (const L of lines) {
      const p = L.p, w = width(L) / 2, n = p.length, base = pos.length / 3;
      if (n < 2) continue;
      const seg: number[][] = [];
      for (let i = 0; i < n - 1; i++) {
        const dx = p[i + 1][0] - p[i][0], dy = p[i + 1][1] - p[i][1], l = Math.hypot(dx, dy) || 1;
        seg.push([-dy / l, dx / l, l]);
      }
      let along = 0;
      for (let i = 0; i < n; i++) {
        const a = seg[Math.max(0, i - 1)], b = seg[Math.min(seg.length - 1, i)];
        let nx = a[0] + b[0], ny = a[1] + b[1];
        const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        const s = w / Math.max(0.5, nx * b[0] + ny * b[1]);
        const lx = p[i][0] + nx * s, ly = p[i][1] + ny * s, rx = p[i][0] - nx * s, ry = p[i][1] - ny * s;
        pos.push(lx, map.trueGround(lx, -ly) + lift, -ly, rx, map.trueGround(rx, -ry) + lift, -ry);
        uv.push(0, along / 4, w / 2, along / 4);
        if (i < n - 1) { const k = base + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); along += seg[i][2]; }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return freeOnUpload(g);
  };
  /** Does a way fall from a deck's end to the ground steeper than one in one (a path the data ends
   *  just past its footbridge, down in the cutting under it)? Then the deck ends in the air there. */
  const offTheEnd = (za: number, zb: number, len: number) => Math.abs(za - zb) > Math.max(2, len);
  // Raised strips along lines, with vertical edges down into the ground: roads with kerbs,
  // pavements and paths. bands are [from, to] offsets across the line (left is positive).
  // skip(x, y) leaves gaps, e.g. where a pavement would cross another street. own(l) picks out
  // lines that carry their own heights, as each point's third value (bridges), instead of lying
  // on the ground.
  const strips = (lines: { p: number[][] }[], bands: (l: any) => [number, number][], lift: number,
    skip?: (l: any, x: number, y: number) => boolean, edges = true, own?: (l: any) => boolean, into?: Geo,
    onGround: (x: number, z: number) => number = (x, z) => map.trueGround(x, z)) => {
    const g = into ?? new Geo(), white = [1, 1, 1];
    for (const L of lines) {
      // resample every 2 m so the strip follows the ground closely (a point on a bridge's span
      // keeps the span's mark, so it's drawn at the road's own height)
      const p: number[][] = [], level = own?.(L) ?? false;
      const flags = level ? spanFlags(L as Road, (x, z) => map.trueGround(x, z), Z0) : null;
      for (let i = 0; i < L.p.length - 1; i++) {
        const [ax, ay, az] = L.p[i], [bx, by, bz] = L.p[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
        // on a span, and on the stretch from its last point to the abutment at either end, the
        // road is drawn at the height the bridge is built to (bridgeStructures: the deck's own,
        // ramping to the ground at the abutment), so it meets its parapets with no dip or step
        const on = flags && (flags[i] || flags[i + 1]) ? 1 : 0;
        const za = on && !flags![i] ? map.trueGround(ax, -ay) + Z0 : az, zb = on && !flags![i + 1] ? map.trueGround(bx, -by) + Z0 : bz;
        // (a way going on off a deck's end straight down to the ground below isn't drawn: the deck ends there)
        const drop = on && offTheEnd(za, zb, Math.hypot(bx - ax, by - ay)) ? 1 : 0;
        for (let s = 0; s < n; s++) p.push([ax + (bx - ax) * s / n, ay + (by - ay) * s / n, za + (zb - za) * s / n, on, drop]);
      }
      const last = L.p[L.p.length - 1];
      p.push(flags && flags[L.p.length - 1] ? [...last.slice(0, 3), 1] : [...last.slice(0, 3), 0]);
      if (p.length < 2) continue;
      const nrm: number[][] = [], along: number[] = [0];
      for (let i = 0; i < p.length; i++) {
        const a = Math.max(0, i - 1), b = Math.min(p.length - 1, i + 1);
        const dx = p[b][0] - p[a][0], dy = p[b][1] - p[a][1], l = Math.hypot(dx, dy) || 1;
        nrm.push([-dy / l, dx / l]);
        if (i) along.push(along[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
      }
      for (const [o1, o2] of bands(L)) {
        const flat = LEVEL && onGround !== drawnGround;
        const at = (i: number, o: number) => {
          const x = p[i][0] + nrm[i][0] * o, y = p[i][1] + nrm[i][1] * o, gz = flat && !(level && p[i][3]) ? onGround(p[i][0], -p[i][1]) : onGround(x, -y);
          const top = (level && p[i][3] ? p[i][2] - Z0 : gz) + lift;
          if (!flat || (level && p[i][3])) return { x, y, top, foot: top - lift - 0.35 };   // (a bridge's span has its own sides)
          const dg = drawnGround(x, -y);
          return { x, y, top: Math.max(top, Math.min(dg, top + 0.02)), foot: Math.min(top - lift - 0.1, dg - 0.03), up: dg, off: Math.abs(map.trueGround(x, -y) - (top - lift)) };
        };
        for (let i = 0; i < p.length - 1; i++) {
          if (p[i][4]) continue;
          const a1 = at(i, o1), a2 = at(i, o2), b1 = at(i + 1, o1), b2 = at(i + 1, o2);
          if (skip && (skip(L, (a1.x + a2.x) / 2, (a1.y + a2.y) / 2) || skip(L, (b1.x + b2.x) / 2, (b1.y + b2.y) / 2))) continue;
          const u0 = along[i] / 4, u1 = along[i + 1] / 4;
          facing(g, [a1.x, a1.top, -a1.y], [b1.x, b1.top, -b1.y], [b2.x, b2.top, -b2.y], [a2.x, a2.top, -a2.y], [0, 1, 0],
            [o1 / 4, u0], [o1 / 4, u1], [o2 / 4, u1], [o2 / 4, u0], white);
          // kerb faces on both edges
          if (edges || flat) for (const [e, side] of [[o1, -1], [o2, 1]] as const) {
            const ea = at(i, e), eb = at(i + 1, e), n = nrm[i];
            const out = [n[0] * side, 0, -n[1] * side];
            // a tall face is stone: a retaining wall under the street's edge, or holding the bank back beside it
            const tall = flat && faceGeo && Math.max(ea.top - ea.foot, eb.top - eb.foot) > 0.45;
            const sg = tall ? faceGeo! : g, sc = tall ? STONE : white, k = tall ? 2.5 : 1;
            // (a carriageway's edge only where the true ground beside it is off its height: not across a junction's mouth)
            if (edges || Math.max(ea.off ?? 0, eb.off ?? 0) > 0.25)
              facing(sg, [ea.x, ea.foot, -ea.y], [eb.x, eb.foot, -eb.y], [eb.x, eb.top, -eb.y], [ea.x, ea.top, -ea.y], out,
                tall ? [along[i] / k, ea.foot / k] : [u0, 0], tall ? [along[i + 1] / k, eb.foot / k] : [u1, 0], tall ? [along[i + 1] / k, eb.top / k] : [u1, 0.1], tall ? [along[i] / k, ea.top / k] : [u0, 0.1], sc);
            if (flat && faceGeo && ((ea.up ?? 0) > ea.top + 0.1 || (eb.up ?? 0) > eb.top + 0.1)) {
              const ha = Math.max(ea.top, ea.up!), hb = Math.max(eb.top, eb.up!);
              facing(faceGeo, [ea.x, ea.top - 0.1, -ea.y], [eb.x, eb.top - 0.1, -eb.y], [eb.x, hb, -eb.y], [ea.x, ha, -ea.y], [-out[0], 0, -out[2]],
                [along[i] / 2.5, ea.top / 2.5], [along[i + 1] / 2.5, eb.top / 2.5], [along[i + 1] / 2.5, hb / 2.5], [along[i] / 2.5, ha / 2.5], STONE);
            }
          }
        }
      }
    }
    return into ? null : g.build();
  };
  // a plain colour, with a texture where one is given (a stream has none): three.js warns about a
  // material whose "map" is undefined, so it's left out entirely rather than passed as undefined
  const flatMat = (color: string, off: number, map?: THREE.Texture) =>
    new THREE.MeshLambertMaterial({ color, ...(map ? { map } : {}), polygonOffset: true, polygonOffsetFactor: -off, polygonOffsetUnits: -off * 2 });
  const asphalt: THREE.Texture = S.asphalt ??= TX.asphalt();
  const vehicle = D.rd.filter((r) => !PATHS.has(r.c));
  const addFlat = (g: THREE.BufferGeometry | null, m: THREE.Material, thin = false) => {
    if (!g) return;
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; scene.add(mesh);
    if (thin) mesh.userData.thin = true;
  };
  // street centrelines in a grid, so pavements can stop where they meet another street
  const streetCells = new Map<string, { r: unknown; a: number[]; b: number[]; w: number }[]>();
  const wideRoads = map.wide?.rd ?? [];
  for (const r of [...vehicle, ...wideRoads.filter((r) => !PATHS.has(r.c))]) for (let k = 0; k < r.p.length - 1; k++) {
    const a = r.p[k], b = r.p[k + 1], w = width(r) / 2;
    for (const [x, y] of [a, b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]]) {
      const key = `${Math.floor(x / 10)},${Math.floor(y / 10)}`;
      (streetCells.get(key) ?? streetCells.set(key, []).get(key)!).push({ r, a, b, w });
    }
  }
  const onOtherStreet = (own: unknown, x: number, y: number) => {
    const cx = Math.floor(x / 10), cy = Math.floor(y / 10);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) {
      for (const s of streetCells.get(`${i},${j}`) ?? []) {
        if (s.r === own) continue;
        const vx = s.b[0] - s.a[0], vy = s.b[1] - s.a[1], l2 = vx * vx + vy * vy || 1;
        const t = Math.min(1, Math.max(0, ((x - s.a[0]) * vx + (y - s.a[1]) * vy) / l2));
        if (Math.hypot(x - s.a[0] - vx * t, y - s.a[1] - vy * t) < s.w + 0.4) return true;
      }
    }
    return false;
  };
  const half = (r: { c: string; w?: number }) => width(r) / 2;
  const roadMats: Record<string, THREE.Material> = S.roadMats ??= {
    path: flatMat("#a59577", 1, groundTex), service: flatMat("#55575b", 2, asphalt), road: flatMat("#4f5155", 3, asphalt),
    pave: flatMat("#a29f97", 2, asphalt), stream: flatMat("#4c7b94", 2),
    // paths the map says are worn grass, bare earth or gravel
    grass: flatMat("#b3ad78", 1, groundTex), dirt: flatMat("#86684a", 1, groundTex), gravel: flatMat("#b9b2a2", 1, groundTex),
  };
  // ---- bridges ---------------------------------------------------------------------------
  // A road or path on a bridge is drawn at its own height by strips; this builds what holds it
  // up and keeps you on it, as its kind is built (the map's `bt`; a map without it has stone):
  //  - arch: Bath stone, a solid parapet each side and the spandrels down to arches between its
  //    piers (a short span is one arch, springing from the banks);
  //  - beam: a concrete deck with a flat underside on slim piers, and a steel railing on a low
  //    concrete upstand each side;
  //  - truss: a deck between two steel trusses, which are its sides;
  //  - foot: a thin deck between steel railings, on slim legs where it is long;
  //  - suspension: a foot's deck with no legs, hung from a chain each side between a stone tower at
  //    each end.
  // Each end has an abutment whose foot follows the bank under it, and the parapets run on along
  // the approach while the road stands above the ground beside it, so they meet the bank rather
  // than ending in the air. No pier or abutment stands in what passes under (the map's `uo`: a road,
  // a path or the railway; and any road or path under the deck, its carriageway and pavements, across
  // it or along it) or in the canal, and an arch over a road is flattened until it clears it. A street
  // is one bridge through a junction on its deck, and where a deck runs on into another's in the air
  // there is no abutment. What the bridge crosses keeps its own ground underneath.
  const STONE = [0.8, 0.73, 0.57], COPING = [0.87, 0.81, 0.67], SOFFIT = [0.6, 0.55, 0.46];
  const CONCRETE = [0.7, 0.69, 0.66], UNDERSIDE = [0.5, 0.5, 0.48], STEEL = [0.2, 0.27, 0.29], PLATE = [0.47, 0.5, 0.52], TRUSS = [0.3, 0.37, 0.38];
  const PARAPET = 1.05;       // above the pavement
  const FOOT_CLASSES = new Set(["footway", "path", "cycleway", "steps", "bridleway"]);
  const KINDS: Record<string, { deck: number; gap: number }> = {
    arch: { deck: 0.9, gap: 16 }, beam: { deck: 1.1, gap: 26 }, truss: { deck: 0.9, gap: 45 }, foot: { deck: 0.45, gap: 18 },
    suspension: { deck: 0.45, gap: Infinity },
  };
  /** An upright block on corners [x, y] (data) from low to high. */
  function prism(g: Geo, c: number[][], low: number, high: number, col: number[]) {
    const mx = c.reduce((s, q) => s + q[0], 0) / c.length, my = c.reduce((s, q) => s + q[1], 0) / c.length;
    for (let k = 0; k < c.length; k++) {
      const A = c[k], B = c[(k + 1) % c.length], l = Math.hypot(B[0] - A[0], B[1] - A[1]);
      facing(g, [A[0], low, -A[1]], [B[0], low, -B[1]], [B[0], high, -B[1]], [A[0], high, -A[1]], [(A[0] + B[0]) / 2 - mx, 0, -((A[1] + B[1]) / 2 - my)],
        [0, 0], [l / 2.5, 0], [l / 2.5, (high - low) / 2.5], [0, (high - low) / 2.5], col);
    }
  }
  /** A thin square bar between two scene points: a railing's post or rail, a truss's member. */
  function bar(g: Geo, A: number[], B: number[], t: number, col: number[]) {
    const d = norm(sub(B, A));
    const u = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : norm(cross(d, [0, 1, 0])), v = norm(cross(u, d));
    const c = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([i, j]) => [u[0] * i * t + v[0] * j * t, u[1] * i * t + v[1] * j * t, u[2] * i * t + v[2] * j * t]);
    for (let k = 0; k < 4; k++) {
      const p = c[k], q = c[(k + 1) % 4], o = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
      facing(g, [A[0] + p[0], A[1] + p[1], A[2] + p[2]], [B[0] + p[0], B[1] + p[1], B[2] + p[2]], [B[0] + q[0], B[1] + q[1], B[2] + q[2]], [A[0] + q[0], A[1] + q[1], A[2] + q[2]], o,
        [0, 0], [1, 0], [1, 0.05], [0, 0.05], col);
    }
  }
  type Pt = { x: number; y: number; s: number; top: number; g: number; nx: number; ny: number; k?: number; dl?: number; dr?: number };
  /** A bridge built whole, with each of its points' own deck reach left and right (its piece's). */
  type Joined = Road & { ds?: number[][] };
  /** A bridge's pieces joined end to end, so each bridge is built whole: the data often splits a
   *  footbridge into its steps, its deck and its steps again, and built a piece at a time it
   *  would have an abutment at every joint, standing in the water, with only a slot of an arch
   *  over the middle piece. Two pieces are joined where they meet on the span, and only there
   *  (not where three or more meet). */
  function joinSpans(rd: Road[]): Joined[] {
    const list = rd.filter((r) => r.bridge && !r.held && r.p.length > 1);
    const key = (q: number[]) => `${Math.round(q[0] * 3)},${Math.round(q[1] * 3)}`;
    const ends = new Map<string, number[]>();
    list.forEach((r, i) => { for (const q of [r.p[0], r.p[r.p.length - 1]]) { const k = key(q); const e = ends.get(k); if (e) e.push(i); else ends.set(k, [i]); } });
    // the way along a piece, from its end at q
    const leaving = (r: Road, q: number[]) => {
      const p = r.p, first = key(p[0]) === key(q), A = first ? p[0] : p[p.length - 1], B = first ? p[1] : p[p.length - 2];
      const l = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
      return [(B[0] - A[0]) / l, (B[1] - A[1]) / l];
    };
    const onward = (i: number, q: number[]): number | null => {
      const e = ends.get(key(q));
      if (!e || e.length < 2 || q[3] !== 1) return null;
      if (e.length === 2) { const j = e[0] === i ? e[1] : e[0]; return j === i ? null : j; }
      // at a junction on the deck (a lane joining it there), the street runs on through: the piece
      // of the same street going on most nearly straight. Built as pieces, each had an abutment at
      // the junction, standing in whatever passes under there
      const a = list[i], da = leaving(a, q);
      let best: number | null = null, most = Math.cos(Math.PI / 5);
      for (const j of e) {
        const b = list[j];
        if (j === i || (a.n || b.n ? a.n !== b.n : a.c !== b.c)) continue;
        const db = leaving(b, q), straight = -(da[0] * db[0] + da[1] * db[1]);
        if (straight > most) { most = straight; best = j; }
      }
      return best;
    };
    const next = (i: number, q: number[]): number | null => {
      const j = onward(i, q);
      return j !== null && onward(j, q) === i ? j : null;
    };
    const used = new Set<number>(), out: Joined[] = [];
    const length = (p: number[][]) => p.reduce((t, q, k) => (k ? t + Math.hypot(q[0] - p[k - 1][0], q[1] - p[k - 1][1]) : 0), 0);
    const chain = (start: number) => {
      // from the start's free end (or either end of a loop), along the pieces
      const r0 = list[start], fwd0 = next(start, r0.p[0]) === null;
      let pts = (fwd0 ? r0.p : [...r0.p].reverse()).slice(), i = start;
      const pieces = [{ r: r0, fwd: fwd0, s0: 0, len: length(r0.p) }];
      used.add(start);
      for (;;) {
        const j = next(i, pts[pts.length - 1]);
        if (j === null || used.has(j)) break;
        const q = list[j].p, fwd = key(q[0]) === key(pts[pts.length - 1]);
        pieces.push({ r: list[j], fwd, s0: length(pts), len: length(q) });
        pts = pts.concat((fwd ? q : [...q].reverse()).slice(1));
        used.add(j); i = j;
      }
      // what passes under each piece, measured along the joined line instead
      const uo = pieces.flatMap(({ r, fwd, s0, len }) => (r.uo ?? []).map(([u0, u1]) => (fwd ? [s0 + u0, s0 + u1] : [s0 + len - u1, s0 + len - u0])));
      // the kind and the deck's reach are the longest piece's: the others are mostly the steps or
      // ramps at its ends, mapped as their own pieces
      const main = pieces.reduce((m, q) => (q.len > m.len ? q : m));
      const r = main.r, flip = !main.fwd;
      // but each piece keeps its own reach, so where a wider piece meets a narrower one the
      // parapets taper across the narrower one's first stretch rather than standing off its deck
      // all along (and never cut into the wider one's)
      const ds: number[][] = [];
      for (const { r: q, fwd } of pieces) {
        const [l, rt] = deckSides(q), side = fwd ? [l, rt] : [rt, l];
        q.p.forEach((_, k) => {
          if (k === 0 && ds.length) ds[ds.length - 1] = [Math.max(ds[ds.length - 1][0], side[0]), Math.max(ds[ds.length - 1][1], side[1])];
          else ds.push(side);
        });
      }
      out.push({
        ...r, p: pts, uo: uo.length ? uo : undefined, ds,
        ...(flip && Array.isArray(r.dk) ? { dk: [r.dk[1], r.dk[0]] } : {}),
        ...(flip && r.pv ? { pv: [r.pv[1], r.pv[0]] } : {}),
        ...(flip && r.ow ? { ow: -r.ow } : {}),
      });
    };
    list.forEach((r, i) => { if (!used.has(i) && (next(i, r.p[0]) === null || next(i, r.p[r.p.length - 1]) === null)) chain(i); });
    list.forEach((_, i) => { if (!used.has(i)) chain(i); });
    return out;
  }
  // a map built without the partition gives no bridge its kind
  function plainKind(c: string) {
    return FOOT_CLASSES.has(c) ? "foot" : c === "trunk" || c === "motorway" ? "beam" : "arch";
  }
  /** The stretches of a bridge's span, in metres along its samples, over a road or path passing
   *  under it at grade: its carriageway and pavements, as far along the span as they reach across
   *  it at the angle they cross. */
  function passingUnder(P: Pt[], self: Road, ways: Road[], deck: number, half: number): number[][] {
    const out: number[][] = [];
    const x0 = Math.min(...P.map((q) => q.x)) - 10, x1 = Math.max(...P.map((q) => q.x)) + 10;
    const y0 = Math.min(...P.map((q) => q.y)) - 10, y1 = Math.max(...P.map((q) => q.y)) + 10;
    for (const w of ways) {
      if (w === self || w.held) continue;
      const reach = width(w) / 2 + (KERBED.has(w.c) ? pv(w) : 0.3) + 0.3;
      for (let k = 0; k < w.p.length - 1; k++) {
        const A = w.p[k], B = w.p[k + 1];
        if ((A[3] === 1 && B[3] === 1) || Math.max(A[0], B[0]) < x0 || Math.min(A[0], B[0]) > x1 || Math.max(A[1], B[1]) < y0 || Math.min(A[1], B[1]) > y1) continue;
        const wx = B[0] - A[0], wy = B[1] - A[1], wl = Math.hypot(wx, wy) || 1;
        for (let i = 0; i < P.length - 1; i++) {
          const C = P[i], D = P[i + 1], px = D.x - C.x, py = D.y - C.y, den = px * wy - py * wx;
          if (Math.abs(den) < 1e-9) continue;
          const t = ((A[0] - C.x) * wy - (A[1] - C.y) * wx) / den, u = ((A[0] - C.x) * py - (A[1] - C.y) * px) / den;
          // (the data often gives both a point where they cross)
          if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) continue;
          const z = A[2] + (B[2] - A[2]) * u - Z0, top = C.top + (D.top - C.top) * t;
          if (top - deck - z < 1.0) continue;
          // (on the skew, the deck's sides cross it further along than its middle does)
          const sin = Math.abs(den) / ((Math.hypot(px, py) || 1) * wl), cos = Math.sqrt(Math.max(0, 1 - sin * sin));
          const s = C.s + (D.s - C.s) * t, e = (reach + half * cos) / Math.max(0.25, sin);
          out.push([s - e, s + e]);
        }
        // and one running along under the deck rather than across it, wherever it reaches under
        for (const q of P) {
          if (Math.abs(q.ny * wx - q.nx * wy) / wl < 0.87) continue;
          const t = Math.min(1, Math.max(0, ((q.x - A[0]) * wx + (q.y - A[1]) * wy) / (wl * wl)));
          const d = Math.hypot(q.x - A[0] - wx * t, q.y - A[1] - wy * t);
          if (d < reach + half && q.top - deck - (A[2] + (B[2] - A[2]) * t - Z0) >= 1.0) out.push([q.s - 1.2, q.s + 1.2]);
        }
      }
    }
    return out;
  }
  function bridgeStructures(rd: Road[], g: Geo, steel: Geo, ways: Road[] = []) {
    const ground = (x: number, z: number) => map.trueGround(x, z);
    const spot = (q: number[]) => `${Math.round(q[0] * 3)},${Math.round(q[1] * 3)}`;
    const decked = new Map<string, Road[]>();
    for (const w of ways) for (const q of w.p) if (q[3] === 1) { const k = spot(q), l = decked.get(k); if (l) l.push(w); else decked.set(k, [w]); }
    for (const r of rd) {
      if (!r.bridge || r.held) continue;    // (a set piece's bridge builds its own)
      const kind = r.bt && KINDS[r.bt] ? r.bt : plainKind(r.c), DECK = KINDS[kind].deck, stone = kind === "arch";
      const [hl, hr] = deckSides(r), half = Math.max(hl, hr), ds = (r as Joined).ds, lift = KERBED.has(r.c) ? 0.2 : 0.1, flags = spanFlags(r, ground, Z0);
      const along0: number[] = [0];
      for (let i = 1; i < r.p.length; i++) along0.push(along0[i - 1] + Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]));
      // how much wider than the bridge's own reach its deck is at a point (a joined piece's own)
      const reach = (i: number, j: number, f: number) => (ds ? {
        dl: ds[i][0] + (ds[j][0] - ds[i][0]) * f - hl, dr: ds[i][1] + (ds[j][1] - ds[i][1]) * f - hr,
      } : {});
      const sample = (from: number, to: number, s0: number): Pt[] => {
        // the record's points from index `from` to `to` (either way), every 2 m, at the height they're drawn
        const out: Pt[] = [], dir = to >= from ? 1 : -1;
        let s = s0;
        for (let i = from; i !== to; i += dir) {
          const A = r.p[i], B = r.p[i + dir], len = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.ceil(len / 2));
          const ta = deckTop(A, flags[i], ground, Z0), tb = deckTop(B, flags[i + dir], ground, Z0);
          for (let k = 0; k < n; k++) {
            const f = k / n, x = A[0] + (B[0] - A[0]) * f, y = A[1] + (B[1] - A[1]) * f;
            out.push({ x, y, s: s + len * f, top: ta + (tb - ta) * f + lift, g: ground(x, -y), nx: 0, ny: 0, ...reach(i, i + dir, f) });
          }
          s += len;
        }
        const E = r.p[to];
        out.push({ x: E[0], y: E[1], s, top: deckTop(E, flags[to], ground, Z0) + lift, g: ground(E[0], -E[1]), nx: 0, ny: 0, ...reach(to, to, 0) });
        for (let i = 0; i < out.length; i++) {
          const A = out[Math.max(0, i - 1)], B = out[Math.min(out.length - 1, i + 1)], dx = (B.x - A.x) * dir, dy = (B.y - A.y) * dir, l = Math.hypot(dx, dy) || 1;
          out[i].nx = -dy / l; out[i].ny = dx / l;
        }
        // at a bend, the sides are set out along the line halving the corner and mitred out to their
        // full width, so the deck and parapets of the two stretches meet exactly at the corner
        for (let i = 1; i < out.length - 1; i++) {
          const A = out[i - 1], B = out[i + 1], Q = out[i];
          const sx = (B.x - Q.x) * dir, sy = (B.y - Q.y) * dir, sl = Math.hypot(sx, sy);
          const tx = (Q.x - A.x) * dir, ty = (Q.y - A.y) * dir, tl = Math.hypot(tx, ty);
          if (sl < 1e-6 || tl < 1e-6) continue;
          const bx = -ty / tl - sy / sl, by = tx / tl + sx / sl, bl = Math.hypot(bx, by);
          if (bl < 1e-3) continue;
          Q.nx = bx / bl; Q.ny = by / bl;
          Q.k = 1 / Math.max(0.3, Q.nx * -ty / tl + Q.ny * tx / tl);
        }
        return out;
      };
      const height = (i: number) => deckTop(r.p[i], flags[i], ground, Z0);
      const falls = (i: number, j: number) => flags[j] !== 1 && offTheEnd(height(i), height(j), Math.hypot(r.p[j][0] - r.p[i][0], r.p[j][1] - r.p[i][1]));
      for (const [a0, b0] of bridgeSpans(r, flags, true)) {
        const hangA = a0 + 1 < b0 && falls(a0 + 1, a0), hangB = b0 - 1 > a0 && falls(b0 - 1, b0);
        const a = hangA ? a0 + 1 : a0, b = hangB ? b0 - 1 : b0;
        const P = sample(a, b, 0), s = P[P.length - 1].s;
        if (P.length < 2 || s < 3) continue;
        const W = half + 0.4;    // out to the parapet's outer face, on the wider side
        // (each side its own: a parapet at the edge of its pavement, or at the kerb where there is none)
        const hs = (side: number) => (side > 0 ? hl : hr), Ws = (side: number) => hs(side) + 0.4;
        // (an offset out on a side follows that side's own reach at the point; the road's edge doesn't)
        const wider = (q: Pt, o: number) => (o > 0.01 ? q.dl ?? 0 : o < -0.01 ? -(q.dr ?? 0) : 0);
        const at = (q: Pt, o: number, h: number, fixed = false) => {
          const d = (o + (fixed ? 0 : wider(q, o))) * (q.k ?? 1);
          return [q.x + q.nx * d, h, -(q.y + q.ny * d)];
        };
        const out = (q: Pt, side: number) => [q.nx * side, 0, -q.ny * side];
        const along = (q: Pt) => q.s / 2.5;
        const floor = (q: Pt) => q.top - lift + 0.03;
        // where the road's own surface stops on each side, so the deck's top beside an approach
        // fills only the rest and never covers the road
        const edge = (side: number) => (KERBED.has(r.c) && pv(r) > 0 ? width(r) / 2 + pvs(r)[side > 0 ? 0 : 1] : width(r) / 2) - 0.05;
        // where it leaves the ground at each end, and the piers between: the supports (but not
        // at an end on the edge of this square of Bath, where the bridge only carries on into the next)
        const seam = (q: { x: number; y: number }) => !core && (Math.abs(q.x - T.x0) < 0.5 || Math.abs(q.x - (T.x0 + (T.nx - 1) * T.dx)) < 0.5 || Math.abs(q.y - T.y0) < 0.5 || Math.abs(q.y - (T.y0 + (T.ny - 1) * T.dy)) < 0.5);
        // (nor where it runs on into another bridge's deck, in the air: a joint, not a bank)
        // (a deck can run on into another's partway along it, between its points, as a track off a
        // bridge does)
        const onDeck = (q: number[]) => ways.some((w) => w !== r && w.p.filter((e) => r.p.includes(e)).length < 2 && w.p.some((A, k) => {
          const B = w.p[k + 1];
          if (!B || A[3] !== 1 || B[3] !== 1) return false;
          const dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((q[0] - A[0]) * dx + (q[1] - A[1]) * dy) / l2));
          return Math.hypot(q[0] - A[0] - dx * t, q[1] - A[1] - dy * t) < width(w) / 2 + 0.5;
        }));
        const joint = (i: number) => flags[i] === 1 && ((decked.get(spot(r.p[i])) ?? []).some((w) => !r.p.includes(w.p.find((q) => spot(q) === spot(r.p[i]))!)) || onDeck(r.p[i]));
        const inAir = (q: Pt) => (q === P[0] && (hangA || joint(a))) || (q === P[P.length - 1] && (hangB || joint(b)));
        const supports = [...(seam(P[0]) || inAir(P[0]) ? [] : [0]), ...(seam(P[P.length - 1]) || inAir(P[P.length - 1]) ? [] : [s])];
        // where it crosses the canal: the water and the towpath stay open under it all the way
        // across the deck (a skew bridge's too), with no pier in them and no wall down to the
        // water, and an arch springing from the banks over them
        const openings: { a: number; b: number; bank: number }[] = [];
        const canalData = map.canalData ?? (map.canal instanceof Canal ? map.canal.d : null);
        if (map.works || canalData?.locks.length) {
          let run: { a: number; b: number; bank: number } | null = null;
          for (const q of P) {
            let bank: number | null = null;
            for (let o = -W; o <= W + 0.01; o += W / 2) {
              const h = map.works?.across(q.x + q.nx * o, q.y + q.ny * o) ?? lockAt(canalData, q.x + q.nx * o, q.y + q.ny * o);
              if (h !== null) bank = Math.max(bank ?? -Infinity, h - Z0);
            }
            if (bank === null) run = null;
            else if (run) { run.b = q.s; run.bank = Math.min(run.bank, bank); }
            else openings.push(run = { a: q.s, b: q.s, bank });
          }
          for (const O of openings) { O.a = Math.max(0.6, O.a - 2); O.b = Math.min(s - 0.6, O.b + 2); }
        }
        const opened = (sp: number) => openings.some((O) => sp > O.a - 1.5 && sp < O.b + 1.5);
        // what passes under: no pier stands in it
        const s0 = along0[a], kept = [...(r.uo ?? []).map(([u0, u1]) => [u0 - s0, u1 - s0]), ...passingUnder(P, r, ways, DECK, Math.min(hl, hr))];
        const under = (sp: number) => kept.some(([u0, u1]) => sp > u0 && sp < u1);
        const free = (sp: number) => !opened(sp) && !kept.some(([u0, u1]) => sp > u0 - 1 && sp < u1 + 1);
        const clear = Math.max(...P.map((q) => q.top - DECK - q.g));
        const gap = KINDS[kind].gap, n = Math.ceil(s / gap);
        if (clear > 1.5 && n > 1 && s > gap * 1.4) for (let k = 1; k < n; k++) {
          // a pier where it should be, or as near as it can stand clear of what passes under
          const want = (s * k) / n;
          let sp: number | null = null;
          for (let d = 0; d <= s && sp === null; d += 1) for (const c of [want - d, want + d]) if (sp === null && c > 3 && c < s - 3 && free(c)) sp = c;
          if (sp !== null && !supports.some((u) => Math.abs(u - sp!) < 4)) supports.push(sp);
        }
        supports.sort((p, q) => p - q);
        const lerpAt = (sp: number): Pt => {
          let i = 0;
          while (i < P.length - 2 && P[i + 1].s < sp) i++;
          const A = P[i], B = P[i + 1], f = Math.min(1, Math.max(0, (sp - A.s) / ((B.s - A.s) || 1)));
          return { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f, s: sp, top: A.top + (B.top - A.top) * f, g: Math.min(A.g, B.g), nx: A.nx, ny: A.ny,
            dl: (A.dl ?? 0) + ((B.dl ?? 0) - (A.dl ?? 0)) * f, dr: (A.dr ?? 0) + ((B.dr ?? 0) - (A.dr ?? 0)) * f };
        };
        // arches (stone only): between supports, where the deck stands high enough above the ground for one
        const arches: { a: number; b: number; spring: number; rise: number }[] = [];
        if (stone) {
          for (let k = 0; k < supports.length - 1; k++) {
            const a = supports[k] + 1.4, b = supports[k + 1] - 1.4, span = b - a;
            if (span < 4) continue;
            const mid = lerpAt((a + b) / 2), low = Math.min(...P.filter((q) => q.s >= a && q.s <= b).map((q) => q.g), mid.g);
            const rise = Math.min(span * 0.45, mid.top - DECK - low - 0.6);
            if (rise >= 1 && !openings.some((O) => a < O.b && b > O.a)) arches.push({ a, b, spring: mid.top - DECK - rise, rise });
          }
          // over the canal, the arch springs from the banks (or from the abutment, where the span
          // ends before the bank does) and rises as high as the deck lets it
          for (const O of openings) {
            const mid = lerpAt((O.a + O.b) / 2), spring = Math.min(O.bank, lerpAt(O.a).top - DECK, lerpAt(O.b).top - DECK);
            arches.push({ a: O.a, b: O.b, spring, rise: Math.max(0, Math.min((O.b - O.a) * 0.45, mid.top - DECK - 0.15 - spring)) });
          }
        }
        // an arch over a road or path is flattened until it keeps a walker's headroom over the edge
        // of what passes under it (an elliptical arch: the flatter, the higher at its sides); one
        // that would have to be flatter than a metre's rise is left out, and the deck's flat
        // underside spans it instead
        for (let k = arches.length - 1; k >= 0; k--) {
          const A = arches[k], crown = A.spring + A.rise, mid = (A.a + A.b) / 2, h = (A.b - A.a) / 2;
          for (const [u0, u1] of kept) for (const sp of [u0, u1]) {
            if (sp <= A.a || sp >= A.b) continue;
            const f = 1 - Math.sqrt(Math.max(0, 1 - ((sp - mid) / h) ** 2));
            if (f > 1e-6) A.rise = Math.min(A.rise, (crown - lerpAt(sp).g - 2.4) / f);
          }
          if (A.rise < 1) arches.splice(k, 1);
          else A.spring = crown - A.rise;
        }
        const archAt = (sp: number) => {
          for (const A of arches) if (sp >= A.a && sp <= A.b) return A.spring + A.rise * Math.sqrt(Math.max(0, 1 - ((sp - (A.a + A.b) / 2) / ((A.b - A.a) / 2)) ** 2));
          return null;
        };
        // where another bridge's deck runs alongside at the same height and touching this one (the
        // other carriageway of a dual carriageway, each built as its own bridge), there's no parapet
        // between the two; with a gap between them, each keeps its own, so there's no drop between
        const beside = (q: Pt, side: number) => {
          const o = Ws(side) + 0.2 + side * wider(q, side), x = q.x + q.nx * side * o, y = q.y + q.ny * side * o, h = map.deck(x, -y, q.top + 0.5);
          return h !== null && Math.abs(h - q.top) < 1.2;
        };
        // beside an abutment on the bank (not over what passes under)
        const solid = (sp: number) => stone && !opened(sp) && !under(sp) && supports.some((u) => Math.abs(u - sp) < 1.6);
        // a stretch cut where it leaves the wall beside an abutment, each part with whether it's beside one
        const besideAbutments = (A: Pt, B: Pt): [Pt, Pt, boolean][] => {
          const sa = solid(A.s);
          if (sa === solid(B.s)) return [[A, B, sa]];
          let lo = A.s, hi = B.s;
          for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; if (solid(m) === sa) lo = m; else hi = m; }
          const C = { ...lerpAt((lo + hi) / 2), nx: A.nx, ny: A.ny, k: A.k };
          return [[A, C, sa], [C, B, !sa]];
        };
        const light = kind === "foot" || kind === "suspension";
        const sideCol = stone ? STONE : light ? PLATE : CONCRETE, floorCol = stone ? COPING : sideCol;
        for (let i = 0; i < P.length - 1; i++) {
          const A = P[i], B = P[i + 1], uA = along(A), uB = along(B);
          const underA = A.top - DECK, underB = B.top - DECK;
          // the deck's top, wall to wall and just under the road drawn on it: the path or street is
          // often narrower than the deck, and nothing else covers the rest from above
          facing(g, at(A, -Ws(-1), floor(A)), at(B, -Ws(-1), floor(B)), at(B, Ws(1), floor(B)), at(A, Ws(1), floor(A)), [0, 1, 0],
            [uA, -Ws(-1) / 2.5], [uB, -Ws(-1) / 2.5], [uB, Ws(1) / 2.5], [uA, Ws(1) / 2.5], floorCol);
          for (const side of [1, -1]) {
            const w = side * Ws(side);
            // the deck's side, and the spandrel down to the arch where there is one
            // (a stone bridge's side goes down to the bank beside its abutments, where no arch
            // springs: as a wall with an upright end, not a wedge slanting across to the next point)
            if (A.top - A.g <= 0.3 && B.top - B.g <= 0.3) continue;
            const bank = (q: Pt) => ground(q.x + q.nx * w, -(q.y + q.ny * w)) - 0.3;
            const foot = (q: Pt, wall: boolean) => { const f = archAt(q.s) ?? q.top - DECK; return wall ? Math.min(f, bank(q)) : f; };
            for (const [Q, R, wall] of besideAbutments(A, B)) {
              const fQ = foot(Q, wall), fR = foot(R, wall), uQ = along(Q), uR = along(R);
              facing(g, at(Q, w, fQ), at(R, w, fR), at(R, w, R.top), at(Q, w, Q.top), out(A, side),
                [uQ, (fQ - Q.top) / 2.5], [uR, (fR - R.top) / 2.5], [uR, 0], [uQ, 0], sideCol);
            }
          }
          // the underside: the arch's barrel, or the flat soffit of the deck
          const arA = archAt(A.s), arB = archAt(B.s);
          if (arA !== null && arB !== null)
            facing(g, at(A, -Ws(-1), arA), at(B, -Ws(-1), arB), at(B, Ws(1), arB), at(A, Ws(1), arA), [0, -1, 0], [uA, 0], [uB, 0], [uB, W / 1.25], [uA, W / 1.25], SOFFIT);
          else if (A.top - A.g > 0.6 || B.top - B.g > 0.6)
            facing(g, at(A, -Ws(-1), underA), at(B, -Ws(-1), underB), at(B, Ws(1), underB), at(A, Ws(1), underA), [0, -1, 0], [uA, 0], [uB, 0], [uB, W / 1.25], [uA, W / 1.25], stone ? SOFFIT : UNDERSIDE);
        }
        // the parapets, run on along each approach while the road stands above the ground beside
        // it (an embankment), until it meets the bank or a street joining it
        const approach = (from: number, to: number, side: number, start: Pt) => {
          if (from === to || seam(start)) return [] as Pt[];
          const Q = sample(from, to, 0).slice(1), got: Pt[] = [];
          for (const q of Q) {
            if (q.s > 15) break;
            const o = Ws(side) + 0.4 + side * wider(q, side), x = q.x + q.nx * o * side, y = q.y + q.ny * o * side;
            if (q.top - ground(x, -y) < 0.5 || onOtherStreet(r, x, y)) break;
            got.push(q);
          }
          return got;
        };
        // a side's parapet stops only along the stretch where the other deck touches it
        const walled = (run: Pt[], side: number) => {
          const by = run.map((q) => beside(q, side)), out: Pt[][] = [];
          let cur: Pt[] = [];
          for (let i = 0; i < run.length; i++) {
            if (i && by[i - 1] && by[i]) { if (cur.length > 1) out.push(cur); cur = []; }
            cur.push(run[i]);
          }
          if (cur.length > 1) out.push(cur);
          return out;
        };
        for (const side of [1, -1]) {
          const back = hangA ? [] : approach(a, 0, side, P[0]).reverse(), on = hangB ? [] : approach(b, r.p.length - 1, side, P[P.length - 1]);
          for (const q of back) q.s = -q.s;
          for (const q of on) q.s += s;
          // (a truss stands over the span only: its approaches have a beam bridge's railing)
          if (kind !== "truss") for (const run of walled([...back, ...P, ...on], side)) parapet(run, side, P[0].s, s, kind);
          else {
            for (const run of walled(P, side)) parapet(run, side, P[0].s, s, kind);
            for (const A of [[...back, P[0]], [P[P.length - 1], ...on]]) if (A.length > 1) for (const run of walled(A, side)) parapet(run, side, P[0].s, s, "beam");
          }
        }
        function parapet(run: Pt[], side: number, sa: number, sb: number, kind: string) {
          const stone = kind === "arch";
          const w = side * Ws(side), h = side * hs(side);
          for (let i = 0; i < run.length - 1; i++) {
            const A = run[i], B = run[i + 1], uA = along(A), uB = along(B), onDeck = A.s >= sa && B.s <= sb;
            // the inner face comes down to the deck's top; on the approach, the outer face goes down
            // to the ground beside it, the deck's top fills in beside the road, and the inner face
            // comes down to the bank where that falls away
            let lowA = floor(A), lowB = floor(B);
            if (!onDeck) {
              const gA = ground(...([A.x + A.nx * w, -(A.y + A.ny * w)] as [number, number])) - 0.3, gB = ground(...([B.x + B.nx * w, -(B.y + B.ny * w)] as [number, number])) - 0.3;
              facing(g, at(A, w, gA), at(B, w, gB), at(B, w, B.top), at(A, w, A.top), out(A, side),
                [uA, (gA - A.top) / 2.5], [uB, (gB - B.top) / 2.5], [uB, 0], [uA, 0], stone ? STONE : CONCRETE);
              const e = side * edge(side);
              facing(g, at(A, e, floor(A), true), at(B, e, floor(B), true), at(B, w, floor(B)), at(A, w, floor(A)), [0, 1, 0],
                [uA, e / 2.5], [uB, e / 2.5], [uB, w / 2.5], [uA, w / 2.5], stone ? COPING : CONCRETE);
              const bank = (q: Pt) => Math.min(floor(q), ground(q.x + q.nx * h, -(q.y + q.ny * h)) - 0.1);
              lowA = bank(A); lowB = bank(B);
            }
            if (kind === "arch" || kind === "beam") {
              const up = stone ? PARAPET : 0.35, col = stone ? STONE : CONCRETE;
              facing(g, at(A, w, A.top), at(B, w, B.top), at(B, w, B.top + up), at(A, w, A.top + up), out(A, side), [uA, 0], [uB, 0], [uB, up / 2], [uA, up / 2], col);
              facing(g, at(A, h, lowA), at(B, h, lowB), at(B, h, B.top + up), at(A, h, A.top + up), out(A, -side), [uA, (lowA - A.top) / 2], [uB, (lowB - B.top) / 2], [uB, up / 2], [uA, up / 2], col);
              facing(g, at(A, h, A.top + up), at(B, h, B.top + up), at(B, w, B.top + up), at(A, w, A.top + up), [0, 1, 0], [uA, 0], [uB, 0], [uB, 0.2], [uA, 0.2], stone ? COPING : CONCRETE);
            }
          }
          // a steel railing (on the beam's upstand), or the truss
          if (!stone) {
            const truss = kind === "truss", col = truss ? TRUSS : STEEL;
            const m = side * (Ws(side) - 0.2), base = kind === "beam" ? 0.35 : 0, H = truss ? Math.max(2.4, Math.min(4, (sb - sa) / 12)) : 1.1;
            // (a truss's panels are as long as it is high, so its diagonals lean at 45 degrees, as a Warren girder's do)
            const post = truss ? H : kind === "beam" ? 2 : 1.5;
            const rails = truss ? [base + 0.1, H] : [0.55, 1.1];
            for (let i = 0; i < run.length - 1; i++) {
              const A = run[i], B = run[i + 1];
              for (const y of rails) bar(steel, at(A, m, A.top + y), at(B, m, B.top + y), truss ? 0.09 : 0.03, col);
            }
            const first = Math.ceil(run[0].s / post) * post, k0 = Math.round(first / post);
            for (let u = first, k = k0; u <= run[run.length - 1].s + 1e-6; u += post, k++) {
              let i = 0;
              while (i < run.length - 2 && run[i + 1].s < u) i++;
              const A = run[i], B = run[i + 1], f = Math.min(1, Math.max(0, (u - A.s) / ((B.s - A.s) || 1)));
              const q = { ...A, x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f, top: A.top + (B.top - A.top) * f };
              bar(steel, at(q, m, base ? q.top + base : floor(q)), at(q, m, q.top + (truss ? H : 1.12)), truss ? 0.045 : 0.03, col);
              // a truss's diagonal to the next post, leaning alternately
              if (truss && u + post <= run[run.length - 1].s + 1e-6) {
                let j = i;
                while (j < run.length - 2 && run[j + 1].s < u + post) j++;
                const C = run[j], D = run[j + 1], h2 = Math.min(1, Math.max(0, (u + post - C.s) / ((D.s - C.s) || 1)));
                const q2 = { ...C, x: C.x + (D.x - C.x) * h2, y: C.y + (D.y - C.y) * h2, top: C.top + (D.top - C.top) * h2 };
                if (k % 2) bar(steel, at(q, m, q.top + base + 0.1), at(q2, m, q2.top + H), 0.06, col);
                else bar(steel, at(q, m, q.top + H), at(q2, m, q2.top + base + 0.1), 0.06, col);
              }
            }
          }
          // the ends: where it stops at the bank (or the edge of the square)
          if (stone || kind === "beam") for (const [q, dir] of [[run[0], -1], [run[run.length - 1], 1]] as const) {
            if (seam(q) || (q === P[0] && joint(a)) || (q === P[P.length - 1] && joint(b))) continue;
            const up = stone ? PARAPET : 0.35, fwd = [-q.ny * dir, 0, -q.nx * dir];
            facing(g, at(q, h, floor(q)), at(q, w, floor(q)), at(q, w, q.top + up), at(q, h, q.top + up), fwd, [0, 0], [0.2, 0], [0.2, 0.5], [0, 0.5], stone ? STONE : CONCRETE);
          }
        }
        if (kind === "suspension" && !seam(P[0]) && !seam(P[P.length - 1])) {
          // a stone tower each side at each end, and a chain between their tops sagging to just
          // above the deck halfway, with a rod down to the deck's edge every 2 m
          const TH = Math.max(4, Math.min(8, s / 9)), mid = lerpAt(s / 2);
          for (const side of [1, -1]) {
            const o = side * (Ws(side) + 0.5), tops: number[] = [];
            for (const [sp, dir] of [[0, 1], [s, -1]] as const) {
              const q = lerpAt(sp), fx = -q.ny, fy = q.nx, top = q.top + TH;
              const c = [[-0.6, -0.5], [0.6, -0.5], [0.6, 0.5], [-0.6, 0.5]].map(([u, v]) => [q.x + fx * u + q.nx * (o + v), q.y + fy * u + q.ny * (o + v)]);
              prism(g, c, q.g - 0.5, top, STONE);
              // (the chain runs on over the tower and down to its anchorage in the bank behind)
              const bx = q.x - fx * dir * 6 + q.nx * o, by = q.y - fy * dir * 6 + q.ny * o;
              bar(steel, at(q, o, top), [bx, ground(bx, -by), -by], 0.06, STEEL);
              tops.push(top);
            }
            const sag = (tops[0] + tops[1]) / 2 - (mid.top + 1.0);
            const chain = (q: Pt) => { const f = q.s / s; return tops[0] + (tops[1] - tops[0]) * f - sag * 4 * f * (1 - f); };
            for (let i = 0; i < P.length - 1; i++) bar(steel, at(P[i], o, chain(P[i])), at(P[i + 1], o, chain(P[i + 1])), 0.06, STEEL);
            for (const q of P) if (q.s > 1 && q.s < s - 1) bar(steel, at(q, o, chain(q)), at(q, side * Ws(side), q.top), 0.015, STEEL);
          }
        }
        // the piers: stone across the deck under an arch bridge, slim columns under the others
        for (const sp of supports) {
          if (sp === 0 || sp === s) continue;
          const q = lerpAt(sp), under = q.top - DECK + 0.02;
          const low = Math.min(q.g, lerpAt(Math.max(0, sp - 1)).g, lerpAt(Math.min(s, sp + 1)).g) - 1.0;
          if (under - low < 0.5) continue;
          const fx = -q.ny, fy = q.nx;     // along the road
          const box = (u0: number, u1: number, v0: number, v1: number) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => [q.x + fx * u + q.nx * v, q.y + fy * u + q.ny * v]);
          if (stone) prism(g, box(-1, 1, -Ws(-1), Ws(1)), low, under, STONE);
          else {
            const t = light ? 0.25 : 0.45, cols = light ? [0] : [-hr * 0.6, hl * 0.6];
            for (const v of cols) prism(g, box(-t, t, v - t, v + t), low, under - 0.6, CONCRETE);
            prism(g, box(-t - 0.1, t + 0.1, -Ws(-1) + 0.3, Ws(1) - 0.3), under - 0.6, under, CONCRETE);
          }
        }
        // the abutments: a face across each end from the deck's underside down to the bank, its
        // foot following the ground under it, so it never stands out where the bank falls away
        for (const [sp, dir] of [[0, 1], [s, -1]] as const) {
          if (!supports.includes(sp) || under(sp + dir * 0.5)) continue;
          const q = lerpAt(sp), underside = q.top - DECK + 0.02, fwd = [-q.ny * dir, 0, -q.nx * dir];
          const n = Math.max(2, Math.ceil((Ws(1) + Ws(-1)) / 1.0));
          for (let k = 0; k < n; k++) {
            const o1 = -Ws(-1) + ((Ws(1) + Ws(-1)) * k) / n, o2 = -Ws(-1) + ((Ws(1) + Ws(-1)) * (k + 1)) / n;
            const g1 = ground(q.x + q.nx * o1, -(q.y + q.ny * o1)) - 0.3, g2 = ground(q.x + q.nx * o2, -(q.y + q.ny * o2)) - 0.3;
            if (underside <= Math.min(g1, g2)) continue;
            facing(g, at(q, o1, Math.min(g1, underside)), at(q, o2, Math.min(g2, underside)), at(q, o2, underside), at(q, o1, underside), fwd,
              [o1 / 2.5, Math.min(g1, underside) / 2.5], [o2 / 2.5, Math.min(g2, underside) / 2.5], [o2 / 2.5, underside / 2.5], [o1 / 2.5, underside / 2.5], stone ? STONE : CONCRETE);
          }
        }
      }
    }
  }
  /** One material for several kinds of street surface that share a texture and lie at the same
   *  height over the ground, each kind (the mesh's "kind", in the order given) in its own colour. */
  const kindsLook = (key: string, kinds: THREE.MeshLambertMaterial[]): THREE.Material => {
    const id = `kinds:${key}:${kinds.length}`;
    if (S[id]) return S[id];
    const mat = kinds[0].clone(), cols = kinds.map((m) => m.color.clone());
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.kindCol = { value: cols };
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float kind;\nvarying float vKind;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvKind = kind;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\nuniform vec3 kindCol[${cols.length}];\nvarying float vKind;`)
        .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( kindCol[int(vKind + 0.5)], opacity );");
    };
    mat.customProgramCacheKey = () => id;
    return (S[id] = mat);
  };
  const bridgeMat: THREE.Material = S.bridgeMat ??= new THREE.MeshLambertMaterial({ map: TX.wall("stone", false), vertexColors: true });
  const steelMat: THREE.Material = S.steelMat ??= new THREE.MeshLambertMaterial({ vertexColors: true });

  /** Streets with their pavements, paths and streams, as meshes (the wider map's too: outskirts.ts).
   *  own picks out roads that carry their own heights (bridges). */
  /** The same, a few dozen roads at a time (yields between). */
  function* roadMeshesGen(rd: Road[], wl: Line[], own?: (r: any) => boolean, sf?: MapData["sf"]): Generator<void, THREE.Mesh[]> {
    const geo = { path: new Geo(), service: new Geo(), road: new Geo(), pave: new Geo(), bridge: new Geo(), steel: new Geo(), front: new Geo(), drive: new Geo(), grass: new Geo(), dirt: new Geo(), gravel: new Geo() };
    faceGeo = geo.bridge;
    // a square that has its streets' and paths' faces draws them, and keeps strips only for its bridges
    const faced = !!sf && SURFACES;
    if (faced) yield* surfaceFaces(sf!, geo);
    const spans = own ? joinSpans(rd.filter(own)) : [];
    for (let k = 0; k < rd.length; k += 15) {
      const part = rd.slice(k, k + 15).filter((r) => !faced || own?.(r) || r.piece), veh = part.filter((r) => !PATHS.has(r.c)), kerb = veh.filter((r) => KERBED.has(r.c));
      // footpaths, tracks and steps lie on the ground as it's drawn, a hair above it, so on a slope they
      // follow it instead of standing out as a slab with a tall side
      for (const [su, g] of [[undefined, geo.path], ["g", geo.grass], ["d", geo.dirt], ["v", geo.gravel]] as const)
        strips(part.filter((r) => PATHS.has(r.c) && r.c !== "pedestrian" && r.su === su), (r) => [[-half(r), half(r)]], 0.04, undefined, false, own, g, drawnGround);
      // a pedestrianised street is paved from wall to wall, like a pavement
      strips(part.filter((r) => r.c === "pedestrian"), (r) => [[-half(r), half(r)]], 0.2, undefined, false, own, geo.pave);
      strips(veh.filter((r) => !KERBED.has(r.c)), (r) => [[-half(r), half(r)]], 0.05, undefined, false, own, geo.service);
      // carriageways have no edge faces: they'd show as lines across junctions, and the pavement kerbs cover them
      strips(kerb, (r) => [[-half(r), half(r)]], 0.07, undefined, false, own, geo.road);
      strips(kerb.filter((r) => pv(r) > 0), (r) => ([[half(r), half(r) + pvs(r)[0]], [-half(r) - pvs(r)[1], -half(r)]] as [number, number][]).filter(([a, b]) => b > a), 0.17, onOtherStreet, true, own, geo.pave);
      yield;
    }
    // what holds the bridges up, each built whole (joinSpans)
    for (let k = 0; k < spans.length; k += 15) {
      bridgeStructures(spans.slice(k, k + 15), geo.bridge, geo.steel, rd);
      yield;
    }
    const out: THREE.Mesh[] = [];
    const add = (g: THREE.BufferGeometry | null, m: THREE.Material, shadow = false, thin = false) => {
      if (!g) return;
      const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = shadow; out.push(mesh);
      if (thin) mesh.userData.thin = true;
    };
    // (thin: footpaths and pavements, with their kerbs, which a square seen from far off leaves out)
    // Surfaces with the same texture lying at the same height over the ground are one mesh, each
    // in its own colour (kindsLook): the paths of every kind, and the pavements with the drives.
    const addKinds = (kinds: [Geo, THREE.MeshLambertMaterial][], key: string) => {
      const built = kinds.map(([g, m]) => [g.build(), m] as const).filter((k): k is [THREE.BufferGeometry, THREE.MeshLambertMaterial] => !!k[0]);
      if (built.length < 2) { for (const [g, m] of built) add(g, m, false, true); return; }
      for (const [g, k] of built.map(([g], k) => [g, k] as const)) g.setAttribute("kind", new THREE.BufferAttribute(new Uint8Array(g.attributes.position.count).fill(k), 1));
      const merged = mergeGeometries(built.map(([g]) => g));
      if (!merged) { for (const [g, m] of built) { g.deleteAttribute("kind"); add(g, m, false, true); } return; }
      merged.computeBoundingSphere();
      add(freeOnUpload(merged), kindsLook(key, built.map(([, m]) => m)), false, true);
    };
    addKinds([[geo.path, roadMats.path as THREE.MeshLambertMaterial], [geo.grass, roadMats.grass as THREE.MeshLambertMaterial], [geo.dirt, roadMats.dirt as THREE.MeshLambertMaterial], [geo.gravel, roadMats.gravel as THREE.MeshLambertMaterial]], "paths");
    yield;
    add(geo.service.build(), roadMats.service);
    add(geo.road.build(), roadMats.road);
    yield;
    addKinds([[geo.pave, roadMats.pave as THREE.MeshLambertMaterial], [geo.drive, S.driveMat]], "paved");
    yield;
    add(geo.bridge.build(), bridgeMat, true);
    add(geo.steel.build(), steelMat, true);
    add(geo.front.build(), S.pathMat!, false, true);
    if (wl.length) add(ribbon(wl, () => 1.6, 0.05), roadMats.stream);
    return out;
  }
  const roadMeshes = (rd: Road[], wl: Line[], own?: (r: any) => boolean) => run(roadMeshesGen(rd, wl, own));
  /** A square's street and path faces: carriageways and pavements raised by their kerbs, and round
   *  each piece a face down to the ground beside it, a kerb or, where tall, Bath stone. Paths, front
   *  paths and drives lie on the ground as it's drawn, a hair above it, as their strips did. */
  function* surfaceFaces(sf: NonNullable<MapData["sf"]>, geo: Record<"service" | "road" | "pave" | "path" | "front" | "drive" | "bridge" | "grass" | "dirt" | "gravel", Geo>) {
    const V = sf.v, white = [1, 1, 1], up = [0, 1, 0];
    const LIFT: Record<string, number> = { road: 0.07, service: 0.07, pave: 0.17, path: 0.04, front: 0.04, drive: 0.04, grass: 0.04, dirt: 0.04, gravel: 0.04 };
    const onGround = (k: string) => LIFT[k] === 0.04;
    // (a point is in several triangles and outlines: the drawn ground under it is found once)
    const groundAt = new Float64Array(V.length / 3).fill(NaN);
    const at = (i: number, kind: string) => {
      const x = V[3 * i], z = -V[3 * i + 1];
      if (onGround(kind)) {
        let dg = groundAt[i];
        if (dg !== dg) { const g = drawnGround(x, z); dg = groundAt[i] = Number.isFinite(g) ? g : V[3 * i + 2] - Z0; }
        return [x, dg + LIFT[kind], z];
      }
      return [x, V[3 * i + 2] - Z0 + LIFT[kind], z];
    };
    for (const kind of ["road", "service", "pave", "path", "front", "drive", "grass", "dirt", "gravel"] as const) {
      const T = sf[kind] ?? [], g = geo[kind];
      for (let k = 0; k + 2 < T.length; k += 3) {
        if (k % 1200 === 1197) yield;
        const a = at(T[k], kind), b = at(T[k + 1], kind), c = at(T[k + 2], kind);
        facingTri(g, a, b, c, up, [a[0] / 4, a[2] / 4], [b[0] / 4, b[2] / 4], [c[0] / 4, c[2] / 4], white);
      }
    }
    // streets of different kinds cut from one piece (a pedestrian street in a carriageway's outline)
    // meet along edges no outline marks, so a step between them needs its face drawn here
    const NP = V.length / 3, edgeKey = (a: number, b: number) => a * NP + b;
    const outline = new Set<number>();
    for (const e of sf.e) for (let k = 0; k + 1 < e.i.length; k++) { outline.add(edgeKey(e.i[k], e.i[k + 1])); outline.add(edgeKey(e.i[k + 1], e.i[k])); }
    const inner = new Map<number, { kind: string; third: number }>();
    for (const kind of ["road", "service", "pave"] as const) {
      const T = sf[kind] ?? [];
      for (let k = 0; k + 2 < T.length; k += 3) {
        if (k % 3000 === 2997) yield;
        for (let m = 0; m < 3; m++) inner.set(edgeKey(T[k + m], T[k + (m + 1) % 3]), { kind, third: T[k + (m + 2) % 3] });
      }
    }
    let seen = 0;
    for (const [name, hi] of inner) {
      if (++seen % 3000 === 0) yield;
      const ia = Math.floor(name / NP), ib = name - ia * NP, lo = inner.get(edgeKey(ib, ia));
      if (!lo || lo.kind === hi.kind || LIFT[hi.kind] <= LIFT[lo.kind] || outline.has(name)) continue;
      const a = at(ia, hi.kind), b = at(ib, hi.kind), t3 = at(hi.third, hi.kind), l = Math.hypot(b[0] - a[0], b[2] - a[2]);
      if (l < 1e-3) continue;
      let out = [(b[2] - a[2]) / l, 0, -(b[0] - a[0]) / l];
      if (out[0] * (t3[0] - a[0]) + out[2] * (t3[2] - a[2]) > 0) out = out.map((c) => -c);
      const g = hi.kind === "pave" ? geo.pave : geo.road, fa = at(ia, lo.kind)[1], fb = at(ib, lo.kind)[1];
      facing(g, [a[0], fa, a[2]], [b[0], fb, b[2]], [b[0], b[1], b[2]], [a[0], a[1], a[2]], out, [0, 0], [l, 0], [l, 0.1], [0, 0.1], white);
    }
    // an edge two pieces share is a step between them, not a cliff down to the ground: the higher
    // piece's side face stops at the lower one's surface, and the lower piece draws none
    // (two pieces' points at one spot are told apart by number, so each spot gets one number here)
    const spot = new Int32Array(NP), spots = new Map<string, number>();
    for (let i = 0; i < NP; i++) { const k = `${V[3 * i]},${V[3 * i + 1]}`, s = spots.get(k); if (s === undefined) spots.set(k, spot[i] = i); else spot[i] = s; }
    const key = (a: number, b: number) => spot[a] * NP + spot[b];
    const roof = boreRoof(map);
    const owner = new Map<number, { kind: string; a: number; b: number }>();
    for (const [n, e] of sf.e.entries()) {
      if (n % 400 === 399) yield;
      const kind = e.c in LIFT ? e.c : "road";
      for (let k = 0; k + 1 < e.i.length; k++) owner.set(key(e.i[k], e.i[k + 1]), { kind, a: e.i[k], b: e.i[k + 1] });
    }
    for (const [n, e] of sf.e.entries()) {
      if (n % 100 === 99) yield;
      const kind = e.c in LIFT ? e.c : "road", lift = LIFT[kind];
      let along = 0;
      for (let k = 0; k + 1 < e.i.length; k++) {
        const a = at(e.i[k], kind), b = at(e.i[k + 1], kind);
        const l = Math.hypot(b[0] - a[0], b[2] - a[2]);
        if (l < 1e-3) continue;
        const other = owner.get(key(e.i[k + 1], e.i[k]));
        let stepA = NaN, stepB = NaN;
        if (other) {
          stepA = at(other.b, other.kind)[1]; stepB = at(other.a, other.kind)[1];
          if (Math.max(a[1] - stepA, b[1] - stepB) < 0.02) { along += l; continue; }
        }
        // (just past the square's edge the drawn ground has no height: the kerb's own depth is used there)
        // (over a tunnel's bore, both ends of the face stop above its crown, or it hangs down inside the arch)
        const over = Math.max(roof(a[0], -a[2]), roof(b[0], -b[2])) + 0.13;
        const foot = (q: number[], step: number) => {
          if (Number.isFinite(step)) return Math.min(step, q[1] - 0.02);
          const dg = Math.max(drawnGround(q[0], q[2]), over, cutBank(q[0], -q[2]));
          return Math.min(q[1] - lift - 0.1, Number.isFinite(dg) ? dg - 0.03 : Infinity);
        };
        const fa = foot(a, stepA), fb = foot(b, stepB);
        const tall = Math.max(a[1] - fa, b[1] - fb) > 0.45;
        const g = tall ? geo.bridge : kind === "service" ? geo.road : geo[kind as keyof typeof geo], col = tall ? STONE : white, s = tall ? 2.5 : 1;
        // a square written with the piece on the left of its outline draws each face once, facing out
        for (const side of sf.l ? [-1] : [1, -1]) {
          const out = [(b[2] - a[2]) / l * side, 0, -(b[0] - a[0]) / l * side];
          facing(g, [a[0], fa, a[2]], [b[0], fb, b[2]], [b[0], b[1], b[2]], [a[0], a[1], a[2]], out,
            [along / s, fa / s], [(along + l) / s, fb / s], [(along + l) / s, b[1] / s], [along / s, a[1] / s], col);
        }
        along += l;
      }
    }
  }
  // the canal draws its own water at the right levels (canal.ts): its lines and pieces in the map are left out
  if (core && map.canalData) {
    if (map.canal instanceof Canal) for (const m of map.canal.moored) { const k = map.movers.indexOf(m); if (k >= 0) map.movers.splice(k, 1); }
    const centre = map.d.centre as [number, number] | undefined;
    const canal = new Canal(map.canalData, scene as THREE.Scene, Z0, centre ? (x, y) => aqueductSetPieceAt(centre, x, y) : undefined);
    map.canal = canal;
    map.movers.push(...canal.moored);
  }
  /** The headroom wanted under the railway at data (x, y), by what passes under there: the village's
   *  and the rest of Bath's (the wider map). */
  function underRail(rail: NonNullable<typeof map.railData>): Need {
    return railNeed(rail.tracks.map((t) => t.p), [...map.d.rd, ...(map.wide?.rd ?? [])], [...map.d.wl, ...(map.wide?.wl ?? [])],
      [...map.d.wp, ...(map.wide?.wp ?? [])].map((w) => w.r[0]), map.canalData?.runs ?? []);
  }
  if (core) { map.floors = []; map.pushers = []; }
  if (core && map.canal instanceof Canal) { const c = map.canal; map.floors.push((x, z) => c.floor(x, z)); }
  const railway = core && map.railData ? new Railway(map.railData, scene as THREE.Scene, Z0, underRail(map.railData), S.groundTex ??= TX.groundDetail()) : null;
  if (railway) S.railBank = (x: number, z: number) => railway.bankAt(x, z);
  if (railway) { map.floors.push((x, z, y) => railway.floor(x, z, y)); map.pushers.push((p, y, r) => railway.pushOut(p, y, r)); }
  const cableway = core && map.cable ? new Cableway(map.cable, scene as THREE.Scene) : null;
  const backdrop = core ? buildBackdrop(map, scene as THREE.Scene, GROUND, earth, shell!.sun, shell!.hemi) : null;
  const streams = outsideBores(map.canal ? D.wl.filter((l) => l.c !== "canal") : D.wl, boreRoof(map));
  // garden paths (paving slabs) and driveways (tarmac or gravel)
  S.pathMat ??= flatMat("#b3aa98", 2, TX.wall("stone", false));
  S.driveMat ??= flatMat("#8d8a84", 2, asphalt);
  for (const m of yield* roadMeshesGen(D.rd, streams, (r) => r.bridge, D.sf)) scene.add(m);
  const seg = (s: number[]) => ({ p: [[s[0], s[1], 0], [s[2], s[3], 0]] });
  // (a faced square written before the front paths and drives had faces of their own still has the strips)
  if (!faced || !D.sf!.front) {
    addFlat(strips((D.fp ?? []).map(seg), () => [[-0.55, 0.55]], 0.04, undefined, false, undefined, undefined, drawnGround), S.pathMat, true);
  }
  if (!faced || !D.sf!.drive) {
    addFlat(strips((D.dv ?? []).map(seg), () => [[-1.5, 1.5]], 0.04, undefined, false, undefined, undefined, drawnGround), S.driveMat, true);
  }

  // ponds and the lake
  const waterMat: THREE.Material = S.waterMat ??= new THREE.MeshLambertMaterial({ color: "#46718a", polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const pondMesh = (w: Pond) => {
    const shape = new THREE.Shape(w.r[0].map(([x, y]) => new THREE.Vector2(x, y)));
    for (const hole of w.r.slice(1)) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
    const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, waterMat);
    m.position.y = w.z - Z0;
    return m;
  };
  // (all of them in one mesh: each mesh costs a little to draw, however small)
  const ponds: THREE.BufferGeometry[] = [];
  for (const w of D.wp) {
    if (w.c === "canal" && map.canal) continue;         // the canal draws its own water, at its own levels
    const lv = w.c ? undefined : map.canal?.pondLevel(w);
    if (lv !== null) { const m = pondMesh(lv === undefined ? w : { ...w, z: lv }); ponds.push(m.geometry.translate(0, m.position.y, 0)); }
  }
  if (ponds.length) {
    scene.add(new THREE.Mesh(ponds.length > 1 ? mergeGeometries(ponds) : ponds[0], waterMat));
    if (ponds.length > 1) for (const g of ponds) g.dispose();
  }
  // a tank's, a pool's or a reservoir's concrete walls, wherever its water stands above the ground
  // round it, and each weir's stone crest with the white water falling from it into the water below:
  // one mesh for the square
  {
    const pos: number[] = [], col: number[] = [];
    const g = (x: number, y: number) => map.ground(x, -y);
    const quad = (a: number[], b: number[], c: number[], d: number[], cc: number[]) => {
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      for (let q = 0; q < 6; q++) col.push(...cc);
    };
    const quad4 = (a: number[], b: number[], c: number[], d: number[], ca: number[], cb: number[], cc: number[], cd: number[]) => {
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      col.push(...ca, ...cb, ...cc, ...ca, ...cc, ...cd);
    };
    const P = (x: number, y: number, h: number) => [x, h, -y];
    const CONCRETE = [0.62, 0.61, 0.58];
    for (const w of D.wp) {
      if (w.k !== "t" || !w.r[0]?.length) continue;
      const top = w.z - Z0 + RIM_UP, ring = w.r[0];
      for (let i = 0; i < ring.length; i++) {
        const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
        const ga = g(ax, ay), gb = g(bx, by);
        if (top - Math.min(ga, gb) < 0.1) continue;
        const l = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / l * RIM_HALF, ny = (bx - ax) / l * RIM_HALF;
        for (const s of [1, -1]) quad(P(ax + nx * s, ay + ny * s, ga - 0.3), P(bx + nx * s, by + ny * s, gb - 0.3), P(bx + nx * s, by + ny * s, top), P(ax + nx * s, ay + ny * s, top), CONCRETE);
        quad(P(ax + nx, ay + ny, top), P(bx + nx, by + ny, top), P(bx - nx, by - ny, top), P(ax - nx, ay - ny, top), CONCRETE);
      }
    }
    // A weir as Pulteney's is drawn (landmarks/pulteney.ts): a low stone crest just proud of the
    // water above, the water pouring off it in glassy streaks that break white as they fall to the
    // water below, and a narrow band of white water at its foot. Where the two sides lie hardly
    // apart it's the crest and the foam.
    const mix = (v: number[], t: number) => [0, 1, 2].map((c) => v[c] + (WEIR_FOAM[c] - v[c]) * t);
    for (const f of D.wf ?? []) {
      const foot = f.b - Z0, p = f.p, m = p.length;
      // each point's way across the line, mitred where the line bends so the crest doesn't open there
      const side = p.map((_, i) => {
        let sx = 0, sy = 0;
        for (const [u, v] of [[i - 1, i], [i, i + 1]]) {
          if (u < 0 || v >= m) continue;
          const l = Math.hypot(p[v][0] - p[u][0], p[v][1] - p[u][1]) || 1;
          sx += (p[v][1] - p[u][1]) / l; sy += -(p[v][0] - p[u][0]) / l;
        }
        const l = Math.hypot(sx, sy) || 1, ux = sx / l, uy = sy / l;
        const u = i > 0 ? i - 1 : 0, ls = Math.hypot(p[u + 1][0] - p[u][0], p[u + 1][1] - p[u][1]) || 1;
        const cos = Math.max(0.5, (ux * (p[u + 1][1] - p[u][1]) - uy * (p[u + 1][0] - p[u][0])) / ls);
        return [ux / cos, uy / cos];
      });
      let k = 0;
      for (let i = 0; i + 1 < m; i++) {
        const [ax, ay, az] = p[i], [bx, by, bz] = p[i + 1], l = Math.hypot(bx - ax, by - ay) || 1;
        const n = Math.max(1, Math.round(l / WEIR_STREAK));
        for (let j = 0; j < n; j++, k++) {
          const s0 = j / n, s1 = (j + 1) / n;
          const x0 = ax + (bx - ax) * s0, y0 = ay + (by - ay) * s0, x1 = ax + (bx - ax) * s1, y1 = ay + (by - ay) * s1;
          const r0 = [side[i][0] + (side[i + 1][0] - side[i][0]) * s0, side[i][1] + (side[i + 1][1] - side[i][1]) * s0];
          const r1 = [side[i][0] + (side[i + 1][0] - side[i][0]) * s1, side[i][1] + (side[i + 1][1] - side[i][1]) * s1];
          const top0 = az + (bz - az) * s0 - Z0, top1 = az + (bz - az) * s1 - Z0;
          // (the crest's ends run up on to the banks; nothing pours where the ground is dry below it)
          if (g((x0 + x1) / 2, (y0 + y1) / 2) > Math.max(top0, top1) + WEIR_CREST_UP) continue;
          const A = (o: number, h: number) => P(x0 + r0[0] * o, y0 + r0[1] * o, h), B = (o: number, h: number) => P(x1 + r1[0] * o, y1 + r1[1] * o, h);
          const c0 = top0 + WEIR_CREST_UP, c1 = top1 + WEIR_CREST_UP, H = WEIR_CREST_HALF;
          quad(A(-H, c0), B(-H, c1), B(H, c1), A(H, c0), WEIR_STONE);
          quad(A(-H, top0 - 0.3), B(-H, top1 - 0.3), B(-H, c1), A(-H, c0), WEIR_STONE);
          const wet = g((x0 + x1) / 2 + (r0[0] + r1[0]), (y0 + y1) / 2 + (r0[1] + r1[1])) < foot + 0.3;
          if (!wet) continue;
          const drop = Math.max(top0, top1) - foot, run = Math.min(WEIR_RUN_MOST, Math.max(WEIR_RUN_LEAST, drop * WEIR_RUN));
          const glass = WEIR_STREAKS[k % WEIR_STREAKS.length], broken = mix(glass, 0.3), end = H + run, bend = H + run * 0.4;
          const z0m = c0 - (c0 - foot) * 0.6, z1m = c1 - (c1 - foot) * 0.6;
          // the water going over, steepest just past the crest, then breaking white as it lands
          quad4(A(H, c0), B(H, c1), B(bend, z1m), A(bend, z0m), glass, glass, broken, broken);
          quad4(A(bend, z0m), B(bend, z1m), B(end, foot - 0.05), A(end, foot - 0.05), broken, broken, WEIR_FOAM, WEIR_FOAM);
          quad4(A(end - 0.3, foot + 0.1), B(end - 0.3, foot + 0.1), B(end + WEIR_FROTH, foot + 0.1), A(end + WEIR_FROTH, foot + 0.1),
            WEIR_FOAM, WEIR_FOAM, mix(glass, 0.6), mix(glass, 0.6));
        }
      }
    }
    if (pos.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      geo.computeVertexNormals();
      S.weirMat ??= new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, S.weirMat);
      m.receiveShadow = true;
      scene.add(m);
    }
  }
  yield;

  mark("roads");
  // ---- buildings, merged into chunks -------------------------------------------------
  // Each chunk keeps one geometry per surface: walls by material (with or without windows),
  // and roofs. Vertex colours tint each building.
  type Surf = "s" | "k" | "y" | "r" | "c";
  // (a square of Bath's go in four chunks, two by two: fewer, bigger meshes are quicker to draw, and
  // there are a lot of squares in sight)
  const chunks = new Map<string, Map<string, Geo>>();
  const cw = core ? CHUNK : (T.nx - 1) * T.dx / 2 + 0.01, cx0 = core ? 0 : T.x0, cy0 = core ? 0 : T.y0;
  const geoFor = (x: number, y: number, key: string) => {
    const k = `${Math.floor((x - cx0) / cw)},${Math.floor((y - cy0) / cw)}`;
    let c = chunks.get(k);
    if (!c) chunks.set(k, (c = new Map()));
    let g = c.get(key);
    if (!g) c.set(key, (g = new Geo()));
    return g;
  };
  const WALL_TINTS: Record<Surf, number[][]> = {
    s: [[0.96, 0.86, 0.66], [0.93, 0.82, 0.6], [0.9, 0.84, 0.72], [0.98, 0.9, 0.74], [0.88, 0.8, 0.66]],   // Bath stone
    k: [[0.74, 0.44, 0.33], [0.68, 0.4, 0.31], [0.78, 0.5, 0.38], [0.64, 0.42, 0.34]],                   // red brick
    y: [[0.9, 0.77, 0.55], [0.86, 0.72, 0.5], [0.92, 0.8, 0.6]],                                        // buff brick
    r: [[0.96, 0.95, 0.91], [0.93, 0.91, 0.85], [0.97, 0.93, 0.83], [0.9, 0.9, 0.88]],                  // render
    c: [[0.98, 0.42, 0.62], [0.36, 0.72, 0.98], [0.99, 0.86, 0.22], [0.48, 0.86, 0.46], [0.98, 0.56, 0.2],
        [0.66, 0.46, 0.92], [0.22, 0.84, 0.8], [0.99, 0.3, 0.3]],                                       // painted render, as in the Bo-Kaap
  };
  const ROOF_TINTS: Record<string, number[][]> = {
    s: [[0.34, 0.36, 0.41], [0.3, 0.32, 0.37], [0.38, 0.39, 0.43]],   // slate
    p: [[0.7, 0.4, 0.26], [0.64, 0.36, 0.24], [0.74, 0.46, 0.3]],     // clay pantiles
    c: [[0.48, 0.38, 0.32], [0.42, 0.35, 0.31], [0.52, 0.45, 0.4]],   // concrete tiles
    g: [[0.42, 0.43, 0.46], [0.36, 0.37, 0.4]],                       // modern grey tiles
  };
  const pick = <T,>(a: T[], r: number) => a[Math.floor(r * a.length) % a.length];
  // a building whose wall or roof the data doesn't give takes the commonest in its own square
  const commonest = (vals: (string | undefined)[], known: Record<string, unknown>, none: string) => {
    const n = new Map<string, number>();
    for (const v of vals) if (v && v in known) n.set(v, (n.get(v) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? none;
  };
  // a colour the data gives is met halfway by the material's own tint, so a mapper's pure "#FF0000"
  // brick still reads as brick and the retro grade doesn't make it glare
  const tinted = (base: number[], hex?: string) => {
    const m = hex && /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return base;
    const v = parseInt(m[1], 16), rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => c / 255);
    return base.map((c, k) => c * 0.5 + rgb[k] * 0.5);
  };
  const WALL_USUAL = commonest(D.bl.map((b) => b.m), WALL_TINTS, "r") as Surf, ROOF_USUAL = commonest(D.bl.map((b) => b.rc), ROOF_TINTS, "s");
  const POT = [0.62, 0.34, 0.24];
  /** Box from (x, y) footprint centre, half-sizes along u and across, from y0 to y1. */
  const boxAt = (g: Geo, x: number, y: number, u: number[], hu: number, hv: number, y0: number, y1: number, col: number[]) => {
    const v = [-u[1], u[0]];
    const C = (su: number, sv: number, h: number) => [x + u[0] * su + v[0] * sv, h, -(y + u[1] * su + v[1] * sv)];
    const corners: [number, number][] = [[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]];
    for (let k = 0; k < 4; k++) {
      const [a1, b1] = corners[k], [a2, b2] = corners[(k + 1) % 4];
      const mx = (a1 + a2) / 2, my = (b1 + b2) / 2;
      const out = [u[0] * mx + v[0] * my, 0, -(u[1] * mx + v[1] * my)];
      facing(g, C(a1, b1, y0), C(a2, b2, y0), C(a2, b2, y1), C(a1, b1, y1), out, [0, 0], [1, 0], [1, 1], [0, 1], col);
    }
    facing(g, C(-hu, -hv, y1), C(hu, -hv, y1), C(hu, hv, y1), C(-hu, hv, y1), [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1], col);
  };
  /** Triangle with its true normal, turned to face along `hint`. */
  const triAuto = (g: Geo, a: number[], b: number[], c: number[], hint: number[], ua: number[], ub: number[], uc: number[], col: number[]) => {
    let n = norm(cross(sub(b, a), sub(c, a)));
    if (dot(n, hint) < 0) n = n.map((k) => -k);
    facingTri(g, a, b, c, n, ua, ub, uc, col);
  };

  /** A roof from the lidar (map.ts RoofMesh): its faces, tiled down each slope (flat ones in the
   *  grey of a flat roof), the walls in its steps, seen from both sides, and the chimney stacks
   *  standing on whichever face is under them. */
  const roofFaces = (b: Building, roofs: Geo, plain: Geo, roofCol: number[], wallCol: number[]) => {
    const m = b.rm!, v = m.v, t = m.t, FLAT = [0.42, 0.42, 0.43];
    const at = (i: number) => [v[3 * i], v[3 * i + 2] - Z0, -v[3 * i + 1]];
    for (let i = 0; i < t.length; i += 3) {
      const A = at(t[i]), B = at(t[i + 1]), C = at(t[i + 2]);
      let n = norm(cross(sub(B, A), sub(C, A)));
      if (n[1] < 0) n = n.map((k) => -k);
      const flat = n[1] > 0.985;
      // along the eaves and up the slope, in metres, halved as the pitched roofs' tiles are
      const ua = flat ? [1, 0, 0] : norm([n[2], 0, -n[0]]), va = flat ? [0, 0, -1] : cross(n, ua);
      const uv = (p: number[]) => [dot(p, ua) / 2, dot(p, va) / 2];
      facingTri(roofs, A, B, C, n, uv(A), uv(B), uv(C), flat ? FLAT : roofCol);
    }
    // the steps and slits between faces, closed from the faces themselves (the map's own step
    // walls, m.w, miss most of them): a wall where they stand up, roof where they lie down
    const s = roofSeams(b);
    for (let i = 0; i < s.length; i += 12) {
      const q = [0, 3, 6, 9].map((k) => [s[i + k], s[i + k + 2] - Z0, -s[i + k + 1]]);
      let n = cross(sub(q[2], q[0]), sub(q[3], q[1]));
      if (Math.hypot(n[0], n[1], n[2]) < 1e-6) continue;
      if (n[1] < 0) n = n.map((k) => -k);
      const len = Math.hypot(q[1][0] - q[0][0], q[1][2] - q[0][2]);
      const uvs = [[0, q[0][1] / 3], [len / 3, q[1][1] / 3], [len / 3, q[2][1] / 3], [0, q[3][1] / 3]];
      const lying = norm(n)[1] > 0.7, g = lying ? roofs : plain, col = lying ? roofCol : wallCol;
      facing(g, q[0], q[1], q[2], q[3], n, uvs[0], uvs[1], uvs[2], uvs[3], col);
      if (!lying) facing(g, q[0], q[1], q[2], q[3], n.map((k) => -k), uvs[0], uvs[1], uvs[2], uvs[3], col);
    }
    for (const [x, y] of b.ch ?? []) {
      const z = roofMeshAt(b, x, y);
      if (z === null) continue;
      const foot = z - Z0 - 0.4, top = z - Z0 + 1.1, u = [1, 0];
      boxAt(plain, x, y, u, 0.3, 0.55, foot, top, wallCol);
      for (const off of [-0.22, 0.22]) boxAt(roofs, x, y + off, u, 0.1, 0.1, top, top + 0.38, POT);
    }
  };

  // front doors and shopfronts: the ground-floor window behind one is left out, and a front door
  // says how many window bays its wall has (tools/landscape.py put it in the middle of one)
  type Opening = { x: number; y: number; w: number; n: number };
  const openings = new Map<string, Opening[]>();
  const okey = (i: number, j: number) => `${i},${j}`;
  const addOpening = (o: Opening) => {
    const k = okey(Math.floor(o.x / 20), Math.floor(o.y / 20));
    (openings.get(k) ?? openings.set(k, []).get(k)!).push(o);
  };
  for (const d of D.dr ?? []) addOpening({ x: d[0], y: d[1], w: 1.3, n: d[5] ?? 0 });
  for (const sg of D.sh ?? []) addOpening({ x: +sg[0], y: +sg[1], w: +sg[4], n: 0 });
  /** Openings within 0.3 m of the wall from a to q, as distance t along it. */
  const openingsOn = (a: number[], q: number[], len: number) => {
    const ex = (q[0] - a[0]) / len, ey = (q[1] - a[1]) / len, found: { t: number; w: number; n: number }[] = [];
    for (let i = Math.floor((Math.min(a[0], q[0]) - 1) / 20); i <= Math.floor((Math.max(a[0], q[0]) + 1) / 20); i++)
      for (let j = Math.floor((Math.min(a[1], q[1]) - 1) / 20); j <= Math.floor((Math.max(a[1], q[1]) + 1) / 20); j++)
        for (const o of openings.get(okey(i, j)) ?? []) {
          const t = (o.x - a[0]) * ex + (o.y - a[1]) * ey, off = Math.abs((o.x - a[0]) * ey - (o.y - a[1]) * ex);
          if (t > 0 && t < len && off < 0.3) found.push({ t, w: o.w, n: o.n });
        }
    return found;
  };

  /** One building's walls, roofs and chimneys, into geoFor's geometries by where it stands. */
  const addBuilding = (b: Building, bi: number, geoFor: (x: number, y: number, key: string) => Geo) => {
    const outerRing = b.r[0];
    let cx = 0, cy = 0;
    for (const [x, y] of outerRing) { cx += x; cy += y; }
    cx /= outerRing.length; cy /= outerRing.length;
    const surf = ((b.m as Surf) in WALL_TINTS ? b.m : WALL_USUAL) as Surf;
    const walls = geoFor(cx, cy, surf + (b.w ? "w" : "p"));
    const plain = geoFor(cx, cy, surf + "p");
    const roofs = geoFor(cx, cy, "roof");
    const ground = b.g - Z0, eaveAll = ground + b.h, base = ground - 0.6;
    const wallCol = tinted(pick(WALL_TINTS[surf], hash(bi * 3 + 1)), b.wc);
    // big buildings (schools, Prior Park, flats) have wider-spaced windows and taller storeys than houses
    const big = b.c === "institution" || b.c === "flats", bay = big ? 4.6 : 3.4, floor = big ? 3.5 : 2.9;
    const roofCol = tinted(pick(ROOF_TINTS[b.rc ?? ROOF_USUAL] ?? ROOF_TINTS[ROOF_USUAL], hash(bi * 5 + 2)), b.rk);
    // windows sit at the same height on every storey, the top row just under the eaves. On a
    // slope the walls start from the lowest ground, but storeys are counted from the ground
    // halfway up (b.dz is the fall across the footprint): the downhill side shows a lower
    // floor, as a house built into a hill does, instead of every storey being stretched
    const lift = b.st ? 0 : (b.dz ?? 0) / 2;
    const stories = b.st ?? Math.max(1, Math.round((b.h - lift) / floor)), storey = (b.h - lift) / stories;

    b.r.forEach((ring, ri) => {
      let area = 0;
      for (let i = 0; i < ring.length; i++) { const a = ring[i], q = ring[(i + 1) % ring.length]; area += a[0] * q[1] - q[0] * a[1]; }
      const sign = (area > 0 ? 1 : -1) * (ri === 0 ? 1 : -1);
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], q = ring[(i + 1) % ring.length];
        const ex = q[0] - a[0], ey = q[1] - a[1], len = Math.hypot(ex, ey);
        if (len < 0.05) continue;
        const out = [sign * ey / len, 0, sign * ex / len]; // (x, north) normal (ey, -ex) -> scene (x, -north)
        // windows in equal bays centred on the wall, one in each (window k at u = k + 0.5); the
        // spacing stretches a little to fit, and a wall too short for one has none
        const ops = b.w ? openingsOn(a, q, len) : [];
        const door = ops.find((o) => o.n > 0);
        const n = door ? door.n : Math.round(len / bay);
        const sp = door ? len / n : n > 0 ? Math.min(1.25 * bay, Math.max(0.8 * bay, len / n)) : bay;
        const u0 = n / 2 - len / sp / 2, u1 = n / 2 + len / sp / 2;
        const v0 = (base - ground - lift) / storey;
        const P = (u: number, h: number) => { const t = (u - u0) * sp / len; return [a[0] + ex * t, h, -(a[1] + ey * t)]; };
        const quad = (g: Geo, ua: number, ub: number, ha: number, hb: number, va: number, vb: number) =>
          facing(g, P(ua, ha), P(ub, ha), P(ub, hb), P(ua, hb), out, [ua, va], [ub, va], [ub, vb], [ua, vb], wallCol);
        // ground-floor windows behind a door or shopfront are left out, whole windows at a time
        const blank: number[][] = [];
        for (const o of n > 0 ? ops : []) {
          let ua = u0 + (o.t - o.w / 2) / sp, ub = u0 + (o.t + o.w / 2) / sp;
          for (let k = Math.ceil(ua - 0.72); k <= Math.floor(ub - 0.28); k++) { ua = Math.min(ua, k); ub = Math.max(ub, k + 1); }
          blank.push([Math.max(u0, ua), Math.min(u1, ub)]);
        }
        // under a roof from the lidar the wall rises to the roof over it: windows up to the lower
        // of that and the eaves, plain wall above (a gable, or the higher house in a stepped row)
        const za = b.rm ? b.rm.z[ri]?.[2 * i] : undefined, zb = b.rm ? b.rm.z[ri]?.[2 * i + 1] : undefined;
        const eave = za !== undefined && zb !== undefined ? Math.max(base + 0.5, Math.min(eaveAll, za - Z0, zb - Z0)) : eaveAll;
        const v1 = (eave - ground - lift) / storey;
        if (za !== undefined && zb !== undefined && Math.max(za, zb) - Z0 > eave + 0.02) {
          const vt = (h: number) => (h - ground - lift) / storey;
          facing(plain, P(u0, eave), P(u1, eave), P(u1, zb - Z0), P(u0, za - Z0), out, [u0, v1], [u1, v1], [u1, vt(zb - Z0)], [u0, vt(za - Z0)], wallCol);
        }
        const top = Math.min(eave, ground + lift + storey);
        if (n === 0) quad(plain, u0, u1, base, eave, v0, v1);
        else if (!blank.length || top <= base) quad(walls, u0, u1, base, eave, v0, v1);
        else {
          blank.sort((x, y) => x[0] - y[0]);
          let u = u0;
          for (const [ua, ub] of blank) {
            if (ua > u) quad(walls, u, ua, base, top, v0, 1);
            if (ub > Math.max(u, ua)) quad(plain, Math.max(u, ua), ub, base, top, v0, 1);
            u = Math.max(u, ub);
          }
          if (u < u1) quad(walls, u, u1, base, top, v0, 1);
          if (top < eave) quad(walls, u0, u1, top, eave, 1, v1);
        }
        if (b.pp && ri === 0 && (za === undefined || zb === undefined || Math.abs(za - zb) < 0.3)) {
          // a parapet: the wall carries on past the eaves, seen from both sides
          const top = eave + b.pp, vp = stories + b.pp / storey, back = out.map((k) => -k);
          facing(plain, [a[0], eave, -a[1]], [q[0], eave, -q[1]], [q[0], top, -q[1]], [a[0], top, -a[1]], out, [u0, v1], [u1, v1], [u1, vp], [u0, vp], wallCol);
          facing(plain, [a[0], eave, -a[1]], [q[0], eave, -q[1]], [q[0], top, -q[1]], [a[0], top, -a[1]], back, [u0, v1], [u1, v1], [u1, vp], [u0, vp], wallCol);
        }
      }
    });

    const eave = eaveAll;
    if (b.rm) { roofFaces(b, roofs, plain, roofCol, wallCol); return; }
    const pitched = roofsFit(b);
    for (const roof of pitched) {
      // pitched roof over a rectangle whose first edge (q0 -> q1) runs along the ridge
      const q = roof.q, rp = roof.rp;
      const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], L = Math.hypot(ux, uy) || 1;
      const vx = q[3][0] - q[0][0], vy = q[3][1] - q[0][1], Wd = Math.hypot(vx, vy) || 1;
      const mx = (q[0][0] + q[2][0]) / 2, my = (q[0][1] + q[2][1]) / 2;
      const u = [ux / L, uy / L], v = [vx / Wd, vy / Wd];
      const attached = b.c === "terrace" || b.c === "semi";
      // overhang at the sides and at the ends; behind a parapet the roof stops short of the walls
      const OHs = b.pp ? -0.3 : 0.3, OHe = b.pp ? -0.3 : attached ? 0 : 0.3;
      const [hip0, hip1] = roof.hp;
      const hl0 = L / 2 + (hip0 ? OHs : OHe), hl1 = L / 2 + (hip1 ? OHs : OHe), hw = Wd / 2 + OHs;
      const ridge = eave + rp, drop = (OHs * rp) / (Wd / 2);
      const P = (su: number, sv: number, h: number) => [mx + u[0] * su + v[0] * sv, h, -(my + u[1] * su + v[1] * sv)];
      // a hipped end pulls the ridge in by the half-width, so the hip slopes like the sides
      let ra = -hl0 + (hip0 ? hw : 0), rb = hl1 - (hip1 ? hw : 0);
      if (ra > rb) ra = rb = (ra + rb) / 2;
      const rA = P(ra, 0, ridge), rB = P(rb, 0, ridge);
      const slopeW = Math.hypot(hw, rp);
      for (const side of [-1, 1]) {
        const e0 = P(-hl0, side * hw, eave - drop), e1 = P(hl1, side * hw, eave - drop);
        const n = norm([v[0] * side * rp, hw, -(v[1] * side * rp)]);
        facing(roofs, e0, e1, rB, rA, n, [0, 0], [L / 2, 0], [(rb + hl0) / 2, slopeW / 2], [(ra + hl0) / 2, slopeW / 2], roofCol);
      }
      for (const [end, hip, hl, r] of [[-1, hip0, hl0, rA], [1, hip1, hl1, rB]] as const) {
        const hint = [u[0] * end, 0.5, -u[1] * end];
        if (hip) {
          const c0 = P(end * hl, -hw, eave - drop), c1 = P(end * hl, hw, eave - drop);
          triAuto(roofs, c0, c1, r as number[], hint, [0, 0], [Wd / 2, 0], [Wd / 4, slopeW / 2], roofCol);
        } else {
          // gable end: a wall triangle over the end wall
          const g0 = P(end * L / 2, -Wd / 2, eave), g1 = P(end * L / 2, Wd / 2, eave), top = P(end * L / 2, 0, ridge);
          facingTri(plain, g0, g1, top, [u[0] * end, 0, -u[1] * end], [0, stories], [Wd / bay, stories], [Wd / bay / 2, stories + rp / storey], wallCol);
        }
      }
      // chimney stacks on the ridge, each with two pots
      for (const [x, y] of roof.ch) {
        const s = (x - mx) * u[0] + (y - my) * u[1];
        const top = ridge + 0.95;
        // stacks off the ridge (on a hip) start lower so they still meet the roof
        const along = Math.min(1, Math.max(0, (s < ra ? (s + hl0) / Math.max(0.1, ra + hl0) : s > rb ? (hl1 - s) / Math.max(0.1, hl1 - rb) : 1)));
        boxAt(plain, x, y, u, 0.3, 0.55, eave + rp * along * 0.5, top, wallCol);
        for (const off of [-0.22, 0.22]) boxAt(roofs, x + v[0] * off, y + v[1] * off, u, 0.1, 0.1, top, top + 0.38, POT);
        // a TV aerial lashed to about a third of the stacks
        if (hash(Math.round(x * 17 + y * 29)) < 0.35) {
          const AER = [0.22, 0.23, 0.24];
          boxAt(roofs, x, y, u, 0.025, 0.025, top + 0.38, top + 2.1, AER);
          for (const hh of [1.6, 1.9]) boxAt(roofs, x, y, u, 0.55, 0.02, top + hh, top + hh + 0.04, AER);
        }
      }
    }
    if (!pitched.length || pitched.some((r) => r.wings)) {
      // flat roof with a little parapet colour (under a pitched roof, it caps the wings that stick out)
      const contour = outerRing.map(([x, y]) => new THREE.Vector2(x, y));
      const holes = b.r.slice(1).map((h) => h.map(([x, y]) => new THREE.Vector2(x, y)));
      const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
      const all = [...contour, ...holes.flat()];
      const fc = [0.42, 0.42, 0.43];
      for (const [i, j, k] of tris) {
        const A = all[i], B = all[j], C = all[k];
        facingTri(roofs, [A.x, eave, -A.y], [B.x, eave, -B.y], [C.x, eave, -C.y], [0, 1, 0], [A.x / 2, A.y / 2], [B.x / 2, B.y / 2], [C.x / 2, C.y / 2], fc);
      }
    }
  };
  // (a slice at a time by the clock: eight of a town square's big buildings at once ran past 40 ms)
  let sliceFrom = performance.now();
  for (let bi = 0; bi < D.bl.length; bi++) {
    addBuilding(D.bl[bi], bi, geoFor);
    if (performance.now() - sliceFrom > 6) { yield; sliceFrom = performance.now(); }
  }
  const wallMats: Record<string, THREE.Material> = S.wallMats ??= {};
  if (!wallMats.roof) for (const sfc of ["s", "k", "y", "r", "c"] as Surf[]) {
    const kind = sfc === "s" ? "stone" : sfc === "r" || sfc === "c" ? "render" : "brick";
    wallMats[sfc] = anyWalls(kind);
  }
  wallMats.roof ??= new THREE.MeshLambertMaterial({ map: TX.roofTiles(), vertexColors: true, side: THREE.DoubleSide });  // undersides of the eaves show from the street
  for (const c of chunks.values()) {
    for (const [key, g] of buildingModels(c)) {
      const m = new THREE.Mesh(g, wallMats[key]);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
      yield;
    }
  }
  chunks.clear();   // let the lists the meshes were built from go: the game holds on to this function's other parts
  yield;

  mark("buildings");
  // ---- walls, fences and hedges -------------------------------------------------------------
  // material, thickness and colour of each kind of wall, fence and hedge
  const barGeos = new Map<string, Geo>();
  const barGeo = (x: number, y: number, mat: BarMat) => {
    const k = `${mat}:${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`;
    let g = barGeos.get(k);
    if (!g) barGeos.set(k, (g = new Geo()));
    return g;
  };
  // A crash barrier is a corrugated steel beam on posts, with air under it, not a slab.
  const BEAM_PROFILE = [[0, 0], [0.07, 0.045], [0.155, 0], [0.24, 0.045], [0.31, 0]];
  const crashBarrier = (l: Line, g: Geo, col: number[]) => {
    const p = l.p, top = (i: number) => barrierTop(l, i, Z0);
    let carried = 0;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], q = p[i + 1], ex = q[0] - a[0], ey = q[1] - a[1], len = Math.hypot(ex, ey);
      const ux = ex / len, uy = ey / len, nx = uy, ny = -ux;
      const ta = top(i), tq = top(i + 1);
      const at = (s: number, k: number, side: number) => {
        const f = s / len, [h, d] = BEAM_PROFILE[k], z = ta + (tq - ta) * f - 0.31 + h;
        return [a[0] + ex * f + nx * d * side, z, -(a[1] + ey * f + ny * d * side)];
      };
      for (let k = 0; k < BEAM_PROFILE.length - 1; k++) {
        const shade = col.map((c) => c * (k % 2 ? 0.78 : 1.0)), out = [nx, 0, -ny];
        facing(g, at(0, k, 1), at(len, k, 1), at(len, k + 1, 1), at(0, k + 1, 1), out, [0, 0], [1, 0], [1, 1], [0, 1], shade);
      }
      for (let s = (2 - carried) % 2; s <= len; s += 2) {
        const f = s / len, x = a[0] + ex * f, y = a[1] + ey * f, foot = drawnGround(x, -y);
        const hi = ta + (tq - ta) * f - 0.05;
        if (Number.isFinite(foot) && hi > foot) boxAt(g, x, y, [ux, uy], 0.04, 0.04, foot - 0.1, hi, col.map((c) => c * 0.7));
      }
      carried = (carried + len) % 2;
    }
  };
  const barrierRun = (run: Line) => {
    // a point on top of the one before would leave the run's end open, a hollow shell showing as a flap
    const p: number[][] = [];
    for (const q of run.p) { const o = p[p.length - 1]; if (!o || Math.hypot(q[0] - o[0], q[1] - o[1]) >= 0.05) p.push(q); }
    if (p.length < 2) return;
    const l = { ...run, p };
    const spec = barrierLook(l.c), hh = barrierHeight(l), t = spec.t / 2;
    const g = barGeo(l.p[0][0], l.p[0][1], spec.mat);
    if (spec.mat === "steel") { crashBarrier(l, g, spec.col); return; }
    const tint = hash(Math.round(l.p[0][0] * 7 + l.p[0][1] * 13)) * 0.12 + 0.94;
    const col = spec.col.map((c) => c * tint);
    // each corner of the run is mitred, so the faces of one stretch meet the next's with no gap or seam
    const side: number[][] = l.p.map(() => [0, 0]);
    const unitN = (i: number) => {
      const a = l.p[i], q = l.p[i + 1], ex = q[0] - a[0], ey = q[1] - a[1], len = Math.hypot(ex, ey) || 1;
      return [ey / len, -ex / len];
    };
    for (let i = 0; i < l.p.length; i++) {
      const n0 = i > 0 ? unitN(i - 1) : unitN(0), n1 = i < l.p.length - 1 ? unitN(i) : unitN(l.p.length - 2);
      let mx = n0[0] + n1[0], my = n0[1] + n1[1];
      const ml = Math.hypot(mx, my) || 1;
      mx /= ml; my /= ml;
      const k = t / Math.max(0.5, mx * n1[0] + my * n1[1]);     // (a very sharp corner isn't mitred out to a spike)
      side[i] = [mx * k, my * k];
    }
    let along = 0;
    for (let i = 0; i < l.p.length - 1; i++) {
      const a = l.p[i], q = l.p[i + 1];
      const ex = q[0] - a[0], ey = q[1] - a[1], len = Math.hypot(ex, ey);
      const nx = ey / len * t, ny = -ex / len * t;
      const ga = a[2] - Z0, gq = q[2] - Z0, sa = side[i], sq = side[i + 1];
      const c4 = [[a[0] + sa[0], a[1] + sa[1], ga], [q[0] + sq[0], q[1] + sq[1], gq], [q[0] - sq[0], q[1] - sq[1], gq], [a[0] - sa[0], a[1] - sa[1], ga]];
      // the foot reaches down to the ground as it's drawn, which is pulled down beside a street, so a
      // wall or hedge there doesn't hang above the grass with a gap under it
      const foot = c4.map((c) => { const dg = drawnGround(c[0], -c[1]); return Math.min(c[2] - 0.4, Number.isFinite(dg) ? dg - 0.1 : Infinity); });
      const tops = [barrierTop(l, i, Z0), barrierTop(l, i + 1, Z0)];
      const P = (k: number, top: boolean) => {
        const tp = tops[k === 0 || k === 3 ? 0 : 1];
        return [c4[k][0], top ? tp : foot[k], -c4[k][1]];
      };
      const u0 = along / 2, u1 = (along + len) / 2, vt = (hh + 0.4) / 2;
      facing(g, P(0, false), P(1, false), P(1, true), P(0, true), [nx, 0, -ny], [u0, 0], [u1, 0], [u1, vt], [u0, vt], col);
      facing(g, P(3, false), P(2, false), P(2, true), P(3, true), [-nx, 0, ny], [u0, 0], [u1, 0], [u1, vt], [u0, vt], col);
      if (spec.mat !== "iron") {
        // stone and brick walls get a slightly darker coping along the top
        const top = spec.mat === "stone" || spec.mat === "brick" || spec.mat === "render" ? col.map((c) => c * 0.85) : col;
        facing(g, P(0, true), P(1, true), P(2, true), P(3, true), [0, 1, 0], [u0, 0], [u1, 0], [u1, t], [u0, t], top);
      }
      // the ends of the run are closed, so a wall doesn't show as a hollow shell where it stops
      if (spec.mat !== "iron" && i === 0) facing(g, P(3, false), P(0, false), P(0, true), P(3, true), [-ex, 0, ey], [0, 0], [t, 0], [t, vt], [0, vt], col);
      if (spec.mat !== "iron" && i === l.p.length - 2) facing(g, P(1, false), P(2, false), P(2, true), P(1, true), [ex, 0, -ey], [0, 0], [t, 0], [t, vt], [0, vt], col);
      along += len;
    }
  };
  for (let k = 0; k < D.br.length; k++) {
    barrierRun(D.br[k]);
    if (k % 100 === 99) yield;
  }

  // garden gates: pillars either side, and a gate standing a little open
  for (const gt of D.gt ?? []) {
    const g = gateShape(gt, Z0);
    if (!g) continue;     // a front too short for a wall and gate: just the path starts here
    for (const [px, py] of g.pillars) boxAt(barGeo(px, py, g.look.mat), px, py, g.u, g.pillarHalf, g.pillarHalf, g.pillarFoot, g.pillarTop, g.look.col.map((c) => c * 0.95));
    // the gate itself, hinged at the first post and standing just ajar (so it reads as a gate in
    // the wall, not a gap); iron or wood by where it stands to the nearest few metres, so a gate
    // moved a little by a rebuild keeps its look
    const f = g.leaf, cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2, gl = Math.hypot(f.x1 - f.x0, f.y1 - f.y0);
    const [x0, y0, x1, y1] = gt as number[];
    const iron = g.look.mat === "iron" || g.look.mat === "render" || hash(Math.round((x0 + x1) / 8) * 31 + Math.round((y0 + y1) / 8) * 17) < 0.4;
    boxAt(barGeo(cx, cy, iron ? "iron" : "wood"), cx, cy, f.gu, gl / 2, f.half, f.foot, f.top,
      iron ? [0.16, 0.17, 0.18] : [0.5, 0.38, 0.26]);
  }
  const barMats: Record<BarMat, THREE.Material> = S.barMats ??= {
    stone: new THREE.MeshLambertMaterial({ map: TX.wall("stone", false), vertexColors: true }),
    brick: new THREE.MeshLambertMaterial({ map: TX.wall("brick", false), vertexColors: true }),
    render: new THREE.MeshLambertMaterial({ map: TX.wall("render", false), vertexColors: true }),
    leaf: new THREE.MeshLambertMaterial({ map: TX.leaves(), vertexColors: true }),
    wood: new THREE.MeshLambertMaterial({ map: TX.boards(), vertexColors: true, side: THREE.DoubleSide }),
    iron: new THREE.MeshLambertMaterial({ map: TX.railings(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
    steel: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  };
  for (const [k, geo] of barGeos) {
    const g = geo.build();
    if (!g) continue;
    const m = new THREE.Mesh(g, barMats[k.split(":")[0] as BarMat]);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    culler.add(m, 230);
    yield;
  }
  barGeos.clear();
  yield;

  mark("walls-fences");
  // ---- trees and shrubs ------------------------------------------------------------------
  const vegetation = buildVegetation(scene, D.tr, D.sb ?? [], Z0, S.vegKit);
  S.vegKit ??= vegetation.kit;
  yield;

  mark("trees");
  // ---- the wider map round this one, streamed in around the player ----------------------------
  // (where the full-detail squares are built, they take its place)
  const outskirts = core && map.wide && !map.tileIndex ? buildOutskirts(map, scene as THREE.Scene, {
    terrMat, ground: GROUND, earth, vegetation: vegetation.kit,
    roads: (rd, wl, wp) => [...roadMeshes(rd, wl, (r) => r.bridge), ...wp.map(pondMesh)],
    buildings: () => {
      const geos = new Map<string, Geo>();
      return {
        add: (b, bi) => addBuilding(b, bi, (_x, _y, k) => geos.get(k) ?? geos.set(k, new Geo()).get(k)!),
        finish: () => buildingModels(geos).map(([k, g]) => {
          const m = new THREE.Mesh(g, wallMats[k]);
          m.castShadow = m.receiveShadow = true;
          return m;
        }),
      };
    },
  }) : null;

  mark("outskirts");
  // ---- wood canopy: one leafy surface over the woods, with the trunks below ---------------
  if (D.cn) {
    const C = D.cn, raw = atob(C.h), H = new Uint8Array(raw.length);
    for (let k = 0; k < raw.length; k++) H[k] = raw.charCodeAt(k);
    const portal = aroundPortals(map), banks = portalBanks(map), r = C.step / 2;
    // (laid over a cutting's side the wood came down it in a tilted sheet)
    const steep = (x: number, y: number) => {
      const g = [[-r, -r], [r, -r], [r, r], [-r, r]].map(([u, v]) => map.trueGround(x + u, -(y + v)));
      return Math.max(...g) - Math.min(...g) > REPOSE * C.step;
    };
    for (let j = 0; j < C.ny; j++) for (let i = 0; i < C.nx; i++) {
      const x = C.x0 + i * C.step, y = C.y0 + j * C.step;
      if (!H[j * C.nx + i]) continue;
      if ([[0, 0], [-r, -r], [r, -r], [r, r], [-r, r]].some(([u, v]) => portal(x + u, y + v)) || (banks(x, y) && steep(x, y))) H[j * C.nx + i] = 0;
    }
    const hAtC = (i: number, j: number) => (i < 0 || j < 0 || i >= C.nx || j >= C.ny ? 0 : H[j * C.nx + i]);
    // corner heights: the average of the canopy cells around each corner (edges taper down)
    const corner = (i: number, j: number) => {
      let s = 0, n = 0;
      for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) { const v = hAtC(a, b); if (v) { s += v; n++; } }
      return n ? (s / n) * (0.55 + 0.45 * n / 4) : 0;
    };
    const geos = new Map<string, Geo>();
    const LEAVES = [[0.36, 0.5, 0.24], [0.32, 0.46, 0.22], [0.4, 0.53, 0.26], [0.34, 0.44, 0.2]];
    for (let j = 0; j < C.ny; j++) for (let i = 0; i < C.nx; i++) {
      const h = hAtC(i, j);
      if (!h) continue;
      const x0 = C.x0 + (i - 0.5) * C.step, x1 = x0 + C.step, y0 = C.y0 + (j - 0.5) * C.step, y1 = y0 + C.step;
      const key = core ? `${Math.floor(x0 / 160)},${Math.floor(y0 / 160)}` : `${Math.floor((x0 - cx0) / cw)},${Math.floor((y0 - cy0) / cw)}`;
      let g = geos.get(key);
      if (!g) geos.set(key, (g = new Geo()));
      const col = LEAVES[Math.floor(hash(i * 7919 + j) * LEAVES.length)];
      const lump = (a: number, b: number) => (hash(a * 31337 + b * 17) - 0.5) * 1.6;
      const P = (x: number, y: number, a: number, b: number, under: boolean) => {
        const hc = Math.max(1.5, corner(a, b));
        return [x, map.trueGround(x, -y) + (under ? hc * 0.5 : hc + lump(a, b)), -y];
      };
      const t = [P(x0, y0, i, j, false), P(x1, y0, i + 1, j, false), P(x1, y1, i + 1, j + 1, false), P(x0, y1, i, j + 1, false)];
      const b = [P(x0, y0, i, j, true), P(x1, y0, i + 1, j, true), P(x1, y1, i + 1, j + 1, true), P(x0, y1, i, j + 1, true)];
      const uv = [[x0 / 4, y0 / 4], [x1 / 4, y0 / 4], [x1 / 4, y1 / 4], [x0 / 4, y1 / 4]];
      facing(g, t[0], t[1], t[2], t[3], [0, 1, 0], uv[0], uv[1], uv[2], uv[3], col);
      facing(g, b[0], b[1], b[2], b[3], [0, -1, 0], uv[0], uv[1], uv[2], uv[3], col.map((c) => c * 0.7));
      // sides where the wood ends
      const sides: [number, number, number, number, number[]][] = [[0, 1, i, j - 1, [0, 0, 1]], [1, 2, i + 1, j, [1, 0, 0]], [2, 3, i, j + 1, [0, 0, -1]], [3, 0, i - 1, j, [-1, 0, 0]]];
      for (const [p, q, ni, nj, out] of sides) {
        if (hAtC(ni, nj)) continue;
        facing(g, b[p], b[q], t[q], t[p], out, [0, 0], [1, 0], [1, 1], [0, 1], col.map((c) => c * 0.85));
      }
      if (j % 8 === 7) yield;
    }
    const canopyMat: THREE.Material = S.canopyMat ??= new THREE.MeshLambertMaterial({ map: TX.leaves(), vertexColors: true });
    for (const g of geos.values()) {
      const built = g.build();
      if (!built) continue;
      const m = new THREE.Mesh(built, canopyMat);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      culler.add(m, () => view.sceneryFar);
    }
  }
  yield;

  mark("woods");
  // ---- front doors and bay windows ---------------------------------------------------------
  {
    const DOOR = ["#1f3b2d", "#24324a", "#6b1f24", "#2b2b2b", "#e8e4d8", "#3f6a73", "#5c4a3a", "#7c8a6a"].map((c) => new THREE.Color(c));
    const doors = D.dr ?? [];
    const frameGeo = new THREE.BoxGeometry(1.25, 2.45, 0.06).translate(0, 1.22, 0.03);
    const doorGeo = new THREE.BoxGeometry(0.95, 2.05, 0.08).translate(0, 1.02, 0.05);
    const fanGeo = new THREE.BoxGeometry(0.95, 0.28, 0.07).translate(0, 2.24, 0.05);
    const byChunk = new Map<string, number[][]>();
    for (const d of doors) { const k = `${Math.floor(d[0] / 250)},${Math.floor(d[1] / 250)}`; (byChunk.get(k) ?? byChunk.set(k, []).get(k)!).push(d); }
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pp = new THREE.Vector3();
    // the frame, the door and the fanlight over it as one model, drawn in one go: their colours in
    // its vertex colours, and only the door ("tint") painted each house's colour
    const doorModel = mergeGeometries([[frameGeo, "#ece6d6", 0], [doorGeo, "#ffffff", 1], [fanGeo, "#2a3640", 0]].map(([g, c, t]) => {
      const part = (g as THREE.BufferGeometry).clone(), n = part.attributes.position.count, col = new THREE.Color(c as string);
      part.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => [col.r, col.g, col.b][i % 3]), 3));
      part.setAttribute("tint", new THREE.BufferAttribute(new Float32Array(n).fill(t as number), 1));
      return part;
    }))!;
    const doorMat: THREE.MeshLambertMaterial = S.doorMat ??= (() => {
      const m = new THREE.MeshLambertMaterial({ vertexColors: true });
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float tint;")
          .replace("#include <color_vertex>", "vColor = color;\n#ifdef USE_INSTANCING_COLOR\nvColor *= mix(vec3(1.0), instanceColor, tint);\n#endif");
      };
      m.customProgramCacheKey = () => "doors";
      return m;
    })();
    let dk = 0;
    for (const list of byChunk.values()) {
      const m = new THREE.InstancedMesh(doorModel, doorMat, list.length);
      list.forEach((d, k) => {
        qq.setFromAxisAngle(up, d[3]);
        m4.compose(pp.set(d[0], d[2] - Z0, -d[1]), qq, one);
        m.setMatrixAt(k, m4);
        m.setColorAt(k, DOOR[d[4] % DOOR.length]);
      });
      m.computeBoundingSphere(); scene.add(m); culler.add(m, 150);
      if (++dk % 6 === 5) yield;
    }
    // porch canopies over about half the front doors
    const hoodGeo = new THREE.BoxGeometry(1.6, 0.1, 0.8).rotateX(0.22).translate(0, 2.62, 0.42);
    const hoodMat = new THREE.MeshLambertMaterial({ color: "#5a5d62" });
    const hooded = doors.filter((d) => hash(Math.round(d[0] * 11 + d[1] * 3)) < 0.5);
    if (hooded.length) {
      const hm = new THREE.InstancedMesh(hoodGeo, hoodMat, hooded.length);
      hooded.forEach((d, k) => { qq.setFromAxisAngle(up, d[3]); m4.compose(pp.set(d[0], d[2] - Z0, -d[1]), qq, one); hm.setMatrixAt(k, m4); });
      hm.castShadow = true; hm.computeBoundingSphere(); scene.add(hm); culler.add(hm, 150);
    }
    // bay windows, with a small hipped roof on top
    const BAY_TEX: Record<string, "stone" | "brick" | "render"> = { s: "stone", b: "brick", r: "render" };
    const BAY_TINT: Record<string, string> = { s: "#f1dfb6", b: "#b9765c", r: "#f2efe7" };
    const bayRoofMat = new THREE.MeshLambertMaterial({ color: "#4a4e55" });
    for (const storeys of [1, 2]) for (const mcode of ["s", "b", "r"]) {
      const list = (D.by ?? []).filter((b) => b[4] === storeys && b[5] === mcode);
      if (!list.length) continue;
      const hgt = 2.75 * storeys;
      const geo = new THREE.BoxGeometry(2.4, hgt + 0.3, 0.9).translate(0, (hgt + 0.3) / 2 - 0.3, 0);
      const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * storeys);
      const mat: THREE.Material = S["bay" + mcode] ??= new THREE.MeshLambertMaterial({ map: TX.wall(BAY_TEX[mcode], true), color: BAY_TINT[mcode] });
      const roofGeo = new THREE.ConeGeometry(1.0, 0.7, 4, 1).rotateY(Math.PI / 4).scale(1.75, 1, 0.75).translate(0, hgt + 0.35, 0);
      const bm = new THREE.InstancedMesh(geo, mat, list.length), rm = new THREE.InstancedMesh(roofGeo, bayRoofMat, list.length);
      list.forEach((b, k) => {
        const w = (b[6] as number) / 2.4;
        qq.setFromAxisAngle(up, b[3] as number);
        m4.compose(pp.set(b[0] as number, (b[2] as number) - Z0, -(b[1] as number)), qq, new THREE.Vector3(w, 1, 1));
        bm.setMatrixAt(k, m4); rm.setMatrixAt(k, m4);
      });
      for (const m of [bm, rm]) { m.castShadow = m.receiveShadow = true; m.computeBoundingSphere(); scene.add(m); culler.add(m, 170); }
    }
  }

  yield;
  mark("doors-bays");
  buildLandmarks(map, scene);
  // the wider map's (where its full-detail squares aren't built yet: those carry their own)
  if (core && map.wide?.d.lm && !map.tileIndex) buildLandmarks(map, scene, map.wide.d.lm);
  // (the ground's colour at a spot, as its four grid points blend it)
  const groundTint = (x: number, y: number) => {
    const fi = Math.min(T.nx - 1.001, Math.max(0, (x - T.x0) / T.dx)), fj = Math.min(T.ny - 1.001, Math.max(0, (y - T.y0) / T.dy));
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, out = new THREE.Color(0, 0, 0);
    for (const [a, b, f] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]]) {
      const k = ((j + b) * T.nx + i + a) * 3;
      out.r += tCol[k] * f; out.g += tCol[k + 1] * f; out.b += tCol[k + 2] * f;
    }
    return out;
  };
  buildTunnels(map, scene, (x, y) => drawnGround(x, -y), groundTint);
  mark("landmarks-tunnels");
  yield* buildFurniture(map, scene, culler);
  mark("furniture");
  yield* buildShops(map, scene, culler);
  mark("shops");

  // Where the drawn surface sits: the sunken terrain, or a street, pavement or path on top of it.
  const ownRoads = new Set(D.rd);
  const surfCells = new Map<number, { a: number[]; b: number[]; half: number; lift: number; pave: number[] }[]>();
  const surfKey = (x: number, y: number) => (Math.floor(x / 10) + 1000) * 4000 + Math.floor(y / 10) + 1000;
  for (const r of [...D.rd, ...wideRoads]) {
    const path = PATHS.has(r.c), kerbed = KERBED.has(r.c);
    if (faced && !path && !r.bridge && !r.piece && ownRoads.has(r)) continue;            // drawn as faces
    const half = width(r) / 2, lift = path ? 0.04 : kerbed ? 0.07 : 0.05, reach = half + (kerbed ? pv(r) : 0);
    for (let k = 0; k < r.p.length - 1; k++) {
      const a = r.p[k], b = r.p[k + 1], seg = { a, b, half, lift, pave: kerbed ? pvs(r) : [0, 0] };
      const keys = new Set<number>();
      for (let i = Math.floor((Math.min(a[0], b[0]) - reach) / 10); i <= Math.floor((Math.max(a[0], b[0]) + reach) / 10); i++)
        for (let j = Math.floor((Math.min(a[1], b[1]) - reach) / 10); j <= Math.floor((Math.max(a[1], b[1]) + reach) / 10); j++)
          keys.add(surfKey(i * 10, j * 10));
      for (const key of keys) (surfCells.get(key) ?? surfCells.set(key, []).get(key)!).push(seg);
    }
  }
  buildPitches(map, scene, culler, drawnGround, groundTex);
  mark("pitches");
  const faceCells = new Map<number, number[]>();
  for (let t = 0; t < faceKind.length; t++) {
    if (t % 2000 === 1999) yield;
    const F = faceXYZ, o = t * 9;
    for (let i = Math.floor(Math.min(F[o], F[o + 3], F[o + 6]) / 10); i <= Math.floor(Math.max(F[o], F[o + 3], F[o + 6]) / 10); i++)
      for (let j = Math.floor(Math.min(F[o + 1], F[o + 4], F[o + 7]) / 10); j <= Math.floor(Math.max(F[o + 1], F[o + 4], F[o + 7]) / 10); j++) {
        const key = surfKey(i * 10, j * 10);
        (faceCells.get(key) ?? faceCells.set(key, []).get(key)!).push(t);
      }
  }
  mark("face-cells");
  let levelAt = NaN;    // the height of the street the last lift() found you on
  /** How far a street, pavement or path lifts the surface at scene (x, z): 0 off them. */
  const lift = (x: number, z: number) => {
    const y = -z;
    for (const t of faceCells.get(surfKey(x, y)) ?? []) {
      if (faceWeights(t, x, y) >= -1e-6) { levelAt = faceZ(t); return FACE_LIFT[faceKind[t]]; }
    }
    let road = 0, pave = false, path = 0, best = Infinity;
    for (const s of surfCells.get(surfKey(x, y)) ?? []) {
      const vx = s.b[0] - s.a[0], vy = s.b[1] - s.a[1], l2 = vx * vx + vy * vy || 1;
      const t = Math.min(1, Math.max(0, ((x - s.a[0]) * vx + (y - s.a[1]) * vy) / l2));
      const d = Math.hypot(x - s.a[0] - vx * t, y - s.a[1] - vy * t);
      const on = d < s.half ? s.lift !== 0.04 : d < s.half + s.pave[(x - s.a[0]) * -vy + (y - s.a[1]) * vx > 0 ? 0 : 1];
      if (LEVEL && on && d < best) { best = d; levelAt = map.trueGround(s.a[0] + vx * t, -(s.a[1] + vy * t)); }
      if (d < s.half) { if (s.lift === 0.04) path = 0.04; else road = Math.max(road, s.lift); }
      else if (d < s.half + s.pave[(x - s.a[0]) * -vy + (y - s.a[1]) * vx > 0 ? 0 : 1]) pave = true;   // (the pavement on that side)
    }
    if (best === Infinity) levelAt = NaN;
    // carriageways win over pavements: the pavement stops where it would cross another street
    return road || (pave ? 0.17 : path);
  };
  const surface = (x: number, z: number, y?: number) => {
    const t = y === undefined ? null : map.inTunnel(x, z, y) ?? map.deck(x, z, y);
    if (t !== null) return t;
    const l = lift(x, z);
    return l ? (LEVEL && l > 0.04 && !isNaN(levelAt) ? levelAt : map.trueGround(x, z)) + l : drawnGround(x, z);
  };
  map.standOnDrawn((x, z) => surface(x, z));
  const paved = (x: number, z: number) => lift(x, z) > 0;
  const pavement = (x: number, z: number) => lift(x, z) === FACE_LIFT[2];

  // ---- grass round the player ---------------------------------------------------------------
  // (a map with no ground of its own, all of it in squares, has none: its squares grow their own)
  mark("grass-build");
  const grass: Grass = T.nx ? yield* buildGrass(scene, D, S.railBank ? (x: number, z: number) => Math.max(drawnGround(x, z), S.railBank(x, z)) : drawnGround, GROUND, vegetation.time, width, PATHS, KERBED, PAVE, S.railTracks ?? []) : { update() {} };
  yield;

  mark("grass");
  if (!core) {
    // a full-detail square: nothing in it moves, and it frees what it alone uses when it's dropped
    stayPut(group);
    // (hidden from the start, so it isn't drawn under the finer ground while the square goes up; out of the scene once it's built)
    if (farTerr) { farTerr.visible = true; show(farTerr, false); }
    // Seen from far off it's drawn simpler: its coarser ground, and no footpaths, pavements, garden
    // paths or drives, too thin to make out from there (the ground under them is the same colour
    // near enough).
    const thin: THREE.Object3D[] = [];
    traverseAll(group, (o) => { if (o.userData.thin) thin.push(o); });
    const bx0 = T.x0, bx1 = T.x0 + (T.nx - 1) * T.dx, bz0 = -(T.y0 + (T.ny - 1) * T.dy), bz1 = -T.y0;
    let far = false;
    return {
      group, surface, paved, pavement,
      update(px: number, pz: number, dt: number) {
        const d = Math.hypot(Math.max(0, bx0 - px, px - bx1), Math.max(0, bz0 - pz, pz - bz1));
        if (farTerr && (far ? d < SIMPLER_FAR - 50 : d > SIMPLER_FAR)) {
          far = !far;
          for (const m of fineTerr) show(m, !far);
          for (const m of thin) show(m, !far);
          show(farTerr, far);
        }
        culler.update(px, pz, dt); vegetation.update(px, pz, dt); grass.update(px, pz);
      },
      dispose() { vegetation.dispose(); disposeTileGroup(group, S); },
    } satisfies TileWorld;
  }

  // The village's scenery stands still as a square's does. (The sky and the light follow the
  // player, and the canal, railway and cable car, built along with the streets, move.)
  const STILL = new Set(["ground", "buildings", "walls-fences", "trees", "woods", "doors-bays", "landmarks-tunnels", "furniture", "shops", "pitches"]);
  stayPut(scene, scene.children.filter((c) => STILL.has(c.name)));

  const { tunnelDark, hemi, sun, sky } = shell!;
  const skyU = (sky.material as THREE.ShaderMaterial).uniforms;

  // ---- after dark: the street lamps nearest you light the street round them -----------------
  // (and the lamps on landmarks, such as those under the station canopies)
  // A few lights, moved to whichever lamps are nearest every so often; always there (dark by
  // day, and left out of the drawing while they and the other such lights are all dark, with the
  // shaders for both ready beforehand: unlit.ts) so nothing has to be rebuilt at dusk. A light
  // that moves to another lamp fades out first and back in there, so pools of light don't jump.
  const LAMP_LIGHTS = 4;
  const lampLights = Array.from({ length: LAMP_LIGHTS }, () => {
    const l = new THREE.PointLight("#ffc77a", 0, 22, 1.4);
    l.userData = { on: false, k: 0, to: new THREE.Vector3() };
    scene.add(l);
    darkable(scene, l);
    return l;
  });
  const lampHeads = new WeakMap<GameMap, Float32Array>();
  /** Where the glass of every lamp on a map (village or square) is, in scene coordinates. */
  const headsOf = (m: GameMap) => {
    let h = lampHeads.get(m);
    if (!h) {
      const lamps = (m.d.fx ?? []).filter((f) => f[0] === "lamp");
      h = new Float32Array(lamps.length * 3);
      lamps.forEach((f, i) => {
        const a = f[4] as number;
        h![i * 3] = (f[1] as number) + 1.2 * Math.sin(a);
        h![i * 3 + 1] = (f[3] as number) - m.z0 + 6.0;
        h![i * 3 + 2] = -(f[2] as number) + 1.2 * Math.cos(a);
      });
      lampHeads.set(m, h);
    }
    return h;
  };
  let lampT = 0;
  const near: [number, number, number, number][] = [];
  const lampDay = new THREE.Color("#d8d4c2"), lampNight = new THREE.Color("#fff3c8").multiplyScalar(1.6);
  const placeLamps = (px: number, pz: number) => {
    near.length = 0;
    for (const m of [map, ...map.tilesNear(px, pz, 80)]) {
      const h = headsOf(m);
      // the street lamps, and those on landmarks: the station platforms' (landmarks/index.ts)
      for (const l of [h, landmarkLamps(m)]) for (let i = 0; i < l.length; i += 3) {
        const d = (l[i] - px) ** 2 + (l[i + 2] - pz) ** 2;
        if (d < 80 * 80) near.push([d, l[i], l[i + 1], l[i + 2]]);
      }
    }
    near.sort((a, b) => a[0] - b[0]);
    // a light already at one of the nearest lamps stays there; the rest go to the others
    const wanted = near.slice(0, LAMP_LIGHTS), free: THREE.PointLight[] = [];
    for (const l of lampLights) {
      const k = wanted.findIndex((n) => n[1] === l.userData.to.x && n[3] === l.userData.to.z);
      if (k >= 0 && l.userData.on) wanted.splice(k, 1); else free.push(l);
    }
    free.forEach((l, i) => {
      const n = wanted[i];
      if (n) l.userData.to.set(n[1], n[2], n[3]);
      l.userData.on = !!n;
    });
  };
  /** Fade each light towards its lamp: out, across, and in again. */
  const fadeLamps = (dt: number) => {
    for (const l of lampLights) {
      const u = l.userData, there = l.position.equals(u.to);
      if (!u.on || !there) u.k = Math.max(0, u.k - dt * 3);
      else u.k = Math.min(1, u.k + dt * 3);
      if (u.k === 0 && !there) l.position.copy(u.to);
    }
  };
  const world = scene as THREE.Scene;

  mark("lamps");
  // ---- the force field: a shimmering wall around the play area ------------------------------
  const fieldMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { time: { value: 0 }, player: { value: new THREE.Vector3() } },
    vertexShader: `varying vec3 vW; varying vec2 vUv;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float time; uniform vec3 player; varying vec3 vW; varying vec2 vUv;
      void main(){
        float a = vUv.x * 1600.0, h = vW.y;
        vec2 g = vec2(a, h * 1.15 - a * 0.5);
        vec2 f = abs(fract(g / 4.0) - 0.5);
        float hex = smoothstep(0.42, 0.5, max(f.x, f.y));
        float scan = 0.5 + 0.5 * sin(h * 0.35 - time * 2.2);
        float near = 1.0 - smoothstep(10.0, 140.0, distance(vW.xz, player.xz));
        float fade = 1.0 - smoothstep(0.0, 1.0, vUv.y);
        float alpha = (0.07 + hex * 0.35 + scan * 0.06) * (0.35 + near * 0.9) * fade;
        gl_FragColor = vec4(vec3(0.35, 0.75, 1.0) * alpha, alpha);
      }`,
  });
  // a wall 260 m high all along its edge (the circle, and any strip reaching out past it: map.ts),
  // its pattern laid along it as it would be round the plain circle
  const edge = map.fieldOutline(), wallPos: number[] = [], wallUV: number[] = [], wallIdx: number[] = [];
  let along = 0;
  edge.forEach(([x, z], k) => {
    if (k) along += Math.hypot(x - edge[k - 1][0], z - edge[k - 1][1]);
    const u = along / (Math.PI * 2 * map.field);
    wallPos.push(x, -30, z, x, 230, z);
    wallUV.push(u, 0, u, 1);
  });
  const [x0, z0] = edge[0], [xn, zn] = edge[edge.length - 1], u1 = (along + Math.hypot(x0 - xn, z0 - zn)) / (Math.PI * 2 * map.field);
  wallPos.push(x0, -30, z0, x0, 230, z0);
  wallUV.push(u1, 0, u1, 1);
  for (let k = 0; k < edge.length; k++) wallIdx.push(2 * k, 2 * k + 2, 2 * k + 1, 2 * k + 1, 2 * k + 2, 2 * k + 3);
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute("position", new THREE.Float32BufferAttribute(wallPos, 3));
  wallGeo.setAttribute("uv", new THREE.Float32BufferAttribute(wallUV, 2));
  wallGeo.setIndex(wallIdx);
  const fieldMesh = new THREE.Mesh(wallGeo, fieldMat);
  fieldMesh.renderOrder = 5;
  scene.add(fieldMesh);
  const clock = new THREE.Clock();

  mark("field");
  // ---- the full-detail squares round the map, loaded as the player comes near ----------------
  const tiles = map.tileIndex ? new Tiles(map, world, (m, g) => tileWorld(m, S, g), (g) => disposeTileGroup(g, S)) : null;
  /** The drawn surface: out in a loaded square, that square's. */
  const surfaceAll = (x: number, z: number, y?: number) => tiles?.worldAt(x, z)?.surface(x, z, y) ?? surface(x, z, y);
  const pavedAll = (x: number, z: number) => tiles?.worldAt(x, z)?.paved(x, z) ?? paved(x, z);
  const pavementAll = (x: number, z: number) => tiles?.worldAt(x, z)?.pavement(x, z) ?? pavement(x, z);
  const vehicles = new Vehicles(map, world, surfaceAll);

  return {
    scene: world, sun, surface: surfaceAll, paved: pavedAll, pavement: pavementAll, vehicles, fieldLook: fieldMat, canal: map.canal instanceof Canal ? map.canal : null, railway, cableway,
    hold: (x, z, r) => tiles?.hold(x, z, r) ?? true,
    get tunnel() { return dark; },
    get indoors() { return indoors; },
    set indoors(on: boolean) { indoors = on; },
    update(px: number, py: number, pz: number, dt = 0.016, others?: { x: number; z: number }[]) {
      culler.update(px, pz, dt);
      // (when the spike probe is watching how a frame is spent, tools/spikeprobe.mjs; with no
      // __worldTimes set, W is undefined and none of this is measured)
      const W = (globalThis as any).__worldTimes as { veg: number; grass: number; lamps: number; outskirts: number; skies: number } | undefined;
      if (W) { W.veg = W.grass = W.lamps = W.outskirts = W.skies = 0; }
      const inside = (map.tileAt(px, pz) ?? map).inTunnel(px, pz, py) !== null ? 1 : 0;
      if (inside !== dark) dark = Math.abs(inside - dark) < 0.01 ? inside : dark + (inside - dark) * Math.min(1, dt * 4);
      // the time of day (daylight.ts), and inside a tunnel the daylight goes and the fog turns dark
      const W0 = performance.now();
      const sk = skyNow(), night = sk.night;
      const fog = world.fog as THREE.Fog;
      fog.color.lerpColors(sk.fog, tunnelDark, dark);
      (world.background as THREE.Color).copy(fog.color);
      const far = view.fogFar * (1 - (1 - NIGHT_FAR) * night);
      fog.near = view.fogNear * (1 - night / 3) * (1 - dark) + 10 * dark; fog.far = far + (180 - far) * dark;
      sun.color.copy(sk.lightCol); sun.intensity = sk.lightI * (1 - 0.9 * dark);
      hemi.color.copy(sk.hemiSky); hemi.groundColor.copy(sk.hemiGround); hemi.intensity = sk.hemiI * (1 - 0.8 * dark);
      if (indoors) {
        sun.color.copy(indoorSun); sun.intensity = 1.5;
        hemi.color.copy(indoorSky); hemi.groundColor.copy(indoorGround); hemi.intensity = 1.9;
      }
      skyU.top.value.copy(sk.top); skyU.bottom.value.copy(sk.fog);
      skyU.sunDir.value.copy(sk.sun); skyU.moonDir.value.copy(sk.light); skyU.night.value = night;
      for (const m of GLOWING) m.emissiveIntensity = night * 1.1;
      LAMP_GLASS.color.lerpColors(lampDay, lampNight, night);
      if ((lampT -= dt) <= 0) { lampT = 0.4; placeLamps(px, pz); }
      fadeLamps(dt);
      if (W) W.skies += performance.now() - W0;
      let b4 = performance.now();
      for (const l of lampLights) l.intensity = l.userData.k * night * 70 * (1 - dark);
      if (W) W.lamps += performance.now() - b4;
      LAMP_GLOW.uniforms.night.value = night * (1 - dark);
      LAMP_GLOW.uniforms.far.value = view.cameraFar * 0.9;
      b4 = performance.now();
      vegetation.update(px, pz, dt);
      if (W) W.veg += performance.now() - b4;
      b4 = performance.now();
      outskirts?.update(px, pz, dt);
      backdrop?.update(px, pz, dark);
      if (W) W.outskirts += performance.now() - b4;
      tiles?.update(px, pz, dt, others);
      b4 = performance.now();
      grass.update(px, pz);
      if (W) W.grass += performance.now() - b4;
      fieldMat.uniforms.time.value = clock.getElapsedTime();
      fieldMat.uniforms.player.value.set(px, py, pz);
      sky.position.set(px, py, pz);
      // keep the shadow camera on the player, snapped to texels so shadows don't shimmer
      const snap = 140 / 2048;
      const cx = Math.round(px / snap) * snap, cz = Math.round(pz / snap) * snap;
      sun.target.position.set(cx, py, cz);
      sun.position.set(cx + sk.light.x * 200, py + sk.light.y * 200, cz + sk.light.z * 200);
    },
    dispose() {
      tiles?.dispose();
      const textures = new Set<THREE.Texture>();
      traverseAll(world, (o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        if (o instanceof THREE.InstancedMesh) o.dispose();
        for (const mat of m.material ? ([] as THREE.Material[]).concat(m.material) : []) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) textures.add(v);
          if (mat instanceof THREE.ShaderMaterial) for (const u of Object.values(mat.uniforms)) if (u.value instanceof THREE.Texture) textures.add(u.value);
          mat.dispose();
        }
      });
      textures.forEach((t) => t.dispose());
      sun.dispose();
    },
  } satisfies World;
}

/** Streams with the stretches inside a tunnel's bore left out: one running through a culvert
 *  under a path was laid over the ground, so it climbed the face and ran over the headwall. */
function outsideBores(lines: Line[], roof: (x: number, y: number) => number): Line[] {
  const out: Line[] = [];
  for (const l of lines) {
    let run: number[][] = [], cut = false;
    const flush = () => { if (run.length > 1) out.push({ ...l, p: run }); run = []; };
    for (let i = 0; i < l.p.length; i++) {
      const a = l.p[i], b = l.p[i + 1], n = b ? Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]))) : 1;
      for (let k = 0; k < n; k++) {
        const q = k ? a.map((v, j) => v + ((b[j] ?? v) - v) * (k / n)) : a;
        if (roof(q[0], q[1]) > -Infinity) { cut = true; flush(); } else run.push(q);
      }
    }
    if (!cut) { out.push(l); continue; }
    flush();
  }
  return out;
}
