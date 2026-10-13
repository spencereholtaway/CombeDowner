// Builds the three.js scene from the map: terrain, roads, buildings, walls, trees, water and sky.
// The wider map round it, if there is one, is streamed in around the player by outskirts.ts, which
// borrows the builders here so it looks the same.
import * as THREE from "three";
import { BARRIER_HEIGHT, Building, GameMap, Line, PATHS, Pond, Road, bridgeSpans, deckHalf, deckTop, roofFit, spanFlags } from "./map";
import * as TX from "./textures";
import { LAMP_GLASS, buildFurniture, buildShops } from "./furniture";
import { sky as skyNow } from "./daylight";
import { buildLandmarks } from "./landmarks";
import { Culler } from "./cull";
import { buildVegetation } from "./trees";
import { buildGrass } from "./grass";
import { buildPitches } from "./pitches";
import { Vehicles } from "./vehicles";
import { buildTunnels, mouths } from "./tunnels";
import { buildOutskirts } from "./outskirts";
import { Tiles } from "./tiles";
import { Canal } from "./canal";
import { Railway } from "./railway";
import { Cableway } from "./cableway";

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
}

/**
 * Once a model has gone up to the graphics card, let go of the copy in memory: nothing reads
 * scenery back, and it doubled what the game used. Only for models with one owner that never
 * change (a disposed one can't be drawn again).
 */
export function freeOnUpload<G extends THREE.BufferGeometry>(g: G): G {
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
  const n = norm(cross(sub(b, a), sub(c, a)));
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
  /** Vehicles you can drive, parked up until someone does. */
  vehicles: Vehicles;
  /** The canal, its locks and boats, and the railways and their trains, where the map has them. */
  canal: Canal | null;
  railway: Railway | null;
  /** The cable car and its cabins, where the map has one. */
  cableway: Cableway | null;
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
  update(px: number, pz: number, dt: number): void;
  /** Free what it alone uses (the materials and models it shares stay). */
  dispose(): void;
}

/** Materials, textures and models every map's scenery shares: made by the main world, lent to its squares. */
export type Shared = Record<string, any>;

/** Build a square's scenery a slice at a time (each next() does a few milliseconds' work), with
 *  the main world's materials, into the group given (which can already be in the scene). */
export function tileWorld(map: GameMap, shared: Shared, into: THREE.Group): Generator<void, TileWorld> {
  return worldGen(map, shared, into) as Generator<void, TileWorld>;
}

/** Free what a square's scenery alone uses (the materials and models it shares with the main
 *  world stay), finished or not, and take it out of the scene. */
export function disposeTileGroup(group: THREE.Group, shared: Shared) {
  const sharedThings = new Set<unknown>();
  const collect = (v: unknown) => {
    if (v instanceof THREE.Material || v instanceof THREE.Texture || v instanceof THREE.BufferGeometry) sharedThings.add(v);
    else if (v && typeof v === "object") for (const w of Object.values(v)) collect(w);
  };
  collect(shared);
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !sharedThings.has(m.geometry)) m.geometry.dispose();
    if (o instanceof THREE.InstancedMesh) o.dispose();
    for (const mat of m.material ? ([] as THREE.Material[]).concat(m.material) : []) {
      if (sharedThings.has(mat)) continue;
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture && !sharedThings.has(v)) v.dispose();
      mat.dispose();
    }
  });
  group.removeFromParent();
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

/** The sky, light and fog. */
function makeShell(scene: THREE.Scene) {
  const fogCol = new THREE.Color("#c9d6df");
  scene.background = fogCol.clone();
  scene.fog = new THREE.Fog(fogCol, 60, 480);
  // inside a tunnel the daylight goes and the fog turns dark
  const tunnelDark = new THREE.Color("#0c0b0a");
  // ---- light ------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight("#cfe0f0", "#6b6a4a", 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff0d8", 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
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
            vec3 cloud = mix(vec3(1.5, 1.5, 1.52), vec3(0.16, 0.19, 0.27), night) + vec3(1.2, 0.55, 0.25) * glow;
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
function* worldGen(map: GameMap, lent: Shared | null, into?: THREE.Group): Generator<void, World | TileWorld> {
  const core = !lent, S: Shared = lent ?? {};
  const D = map.d, T = D.t, Z0 = map.z0;
  const group = into ?? new THREE.Group();
  const scene: THREE.Object3D = core ? new THREE.Scene() : group;
  const culler = new Culler();
  const shell = core ? makeShell(scene as THREE.Scene) : null;
  let dark = 0;

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
  // Drawn terrain sits a little lower under streets and paths, so hillsides never poke through
  // them. The player still walks on the true ground height.
  const sink = new Float32Array(T.nx * T.ny);
  for (const r of D.rd) {
    const path = PATHS.has(r.c);
    const reach = width(r) / 2 + (path ? 0.9 : KERBED.has(r.c) ? PAVE + 0.8 : 0.8), depth = path ? 0.12 : 0.3;
    for (let k = 0; k < r.p.length - 1; k++) {
      const [ax, ay] = r.p[k], [bx, by] = r.p[k + 1], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - T.x0) / T.dx)), i1 = Math.min(T.nx - 1, Math.ceil((Math.max(ax, bx) + reach - T.x0) / T.dx));
      const j0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - T.y0) / T.dy)), j1 = Math.min(T.ny - 1, Math.ceil((Math.max(ay, by) + reach - T.y0) / T.dy));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = T.x0 + i * T.dx, y = T.y0 + j * T.dy;
        const t = Math.min(1, Math.max(0, ((x - ax) * vx + (y - ay) * vy) / l2));
        if (Math.hypot(x - ax - vx * t, y - ay - vy * t) < reach) { const v = j * T.nx + i; sink[v] = Math.max(sink[v], depth); }
      }
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
  }
  yield;
  const tIdx: number[] = [];
  for (let j = 0; j < T.ny - 1; j++) for (let i = 0; i < T.nx - 1; i++) {
    const a = j * T.nx + i, b = a + 1, cc = a + T.nx, d = cc + 1;
    tIdx.push(a, b, cc, b, d, cc);
  }
  yield;
  const terrGeo = new THREE.BufferGeometry();
  terrGeo.setAttribute("position", new THREE.BufferAttribute(tPos, 3));
  terrGeo.setAttribute("color", new THREE.BufferAttribute(tCol, 3));
  terrGeo.setAttribute("uv", new THREE.BufferAttribute(tUv, 2));
  terrGeo.setIndex(tIdx);
  terrGeo.computeVertexNormals();
  const groundTex: THREE.Texture = S.groundTex ??= TX.groundDetail();
  // and no ground inside a tunnel's mouth, so you can see into it (tunnels.ts): a square of Bath
  // with a tunnel of its own has its own ground material, with its own mouths
  const mouth = mouths(map);
  const ownTerr = !S.terrMat || mouth.a.length > 0;
  const terrMat: THREE.MeshLambertMaterial = ownTerr ? new THREE.MeshLambertMaterial({ vertexColors: true, map: groundTex }) : S.terrMat;
  // a soft light-and-dark mottle across tens of metres, so the ground detail doesn't look tiled
  const mottle = S.mottle ??= { value: TX.mottle() };
  if (ownTerr) S.terrMat ??= terrMat, terrMat.onBeforeCompile = (shader) => {
    shader.uniforms.mottle = mottle;
    shader.fragmentShader = "uniform sampler2D mottle;\n" + shader.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
      float mt = texture2D(mottle, vMapUv * 0.061).r * 0.6 + texture2D(mottle, vMapUv * 0.23 + 0.37).r * 0.4;
      diffuseColor.rgb *= 0.78 + 0.44 * mt;`);
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
  // Draw the ground as tiles that share one set of vertices, so tiles behind the camera or
  // past the far plane are skipped.
  const TILE = 48;   // grid cells per tile side
  for (let tj = 0; tj < T.ny - 1; tj += TILE) for (let ti = 0; ti < T.nx - 1; ti += TILE) {
    const idx: number[] = [];
    let lo = Infinity, hi = -Infinity;
    for (let j = tj; j < Math.min(T.ny - 1, tj + TILE); j++) for (let i = ti; i < Math.min(T.nx - 1, ti + TILE); i++) {
      const a = j * T.nx + i, b = a + 1, cc = a + T.nx, d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
      lo = Math.min(lo, tPos[a * 3 + 1]); hi = Math.max(hi, tPos[a * 3 + 1]);
    }
    const g = new THREE.BufferGeometry();
    for (const name of ["position", "color", "uv", "normal"]) g.setAttribute(name, terrGeo.getAttribute(name));
    g.setIndex(idx);
    freeOnUpload(g);
    const i1 = Math.min(T.nx - 1, ti + TILE), j1 = Math.min(T.ny - 1, tj + TILE);
    const cx = T.x0 + (ti + i1) / 2 * T.dx, cz = -(T.y0 + (tj + j1) / 2 * T.dy);
    const half = Math.hypot((i1 - ti) * T.dx, (j1 - tj) * T.dy, hi - lo) / 2;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, (lo + hi) / 2, cz), half);
    const tile = new THREE.Mesh(g, terrMat);
    tile.receiveShadow = true;
    scene.add(tile);
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
        pos.push(lx, map.ground(lx, -ly) + lift, -ly, rx, map.ground(rx, -ry) + lift, -ry);
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
  // Raised strips along lines, with vertical edges down into the ground: roads with kerbs,
  // pavements and paths. bands are [from, to] offsets across the line (left is positive).
  // skip(x, y) leaves gaps, e.g. where a pavement would cross another street. own(l) picks out
  // lines that carry their own heights, as each point's third value (bridges), instead of lying
  // on the ground.
  const strips = (lines: { p: number[][] }[], bands: (l: any) => [number, number][], lift: number,
    skip?: (l: any, x: number, y: number) => boolean, edges = true, own?: (l: any) => boolean, into?: Geo) => {
    const g = into ?? new Geo(), white = [1, 1, 1];
    for (const L of lines) {
      // resample every 2 m so the strip follows the ground closely (a point on a bridge's span
      // keeps the span's mark, so it's drawn at the road's own height)
      const p: number[][] = [], level = own?.(L) ?? false;
      const flags = level ? spanFlags(L as Road, (x, z) => map.ground(x, z), Z0) : null;
      for (let i = 0; i < L.p.length - 1; i++) {
        const [ax, ay, az] = L.p[i], [bx, by, bz] = L.p[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
        const on = flags && flags[i] && flags[i + 1] ? 1 : 0;
        for (let s = 0; s < n; s++) p.push([ax + (bx - ax) * s / n, ay + (by - ay) * s / n, az + (bz - az) * s / n, on]);
      }
      p.push(L.p[L.p.length - 1]);
      if (p.length < 2) continue;
      const nrm: number[][] = [], along: number[] = [0];
      for (let i = 0; i < p.length; i++) {
        const a = Math.max(0, i - 1), b = Math.min(p.length - 1, i + 1);
        const dx = p[b][0] - p[a][0], dy = p[b][1] - p[a][1], l = Math.hypot(dx, dy) || 1;
        nrm.push([-dy / l, dx / l]);
        if (i) along.push(along[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
      }
      for (const [o1, o2] of bands(L)) {
        const at = (i: number, o: number) => {
          const x = p[i][0] + nrm[i][0] * o, y = p[i][1] + nrm[i][1] * o, gz = map.ground(x, -y);
          const top = (level && p[i][3] ? p[i][2] - Z0 : gz) + lift;
          return { x, y, top, foot: top - lift - 0.35 };
        };
        for (let i = 0; i < p.length - 1; i++) {
          const a1 = at(i, o1), a2 = at(i, o2), b1 = at(i + 1, o1), b2 = at(i + 1, o2);
          if (skip && (skip(L, (a1.x + a2.x) / 2, (a1.y + a2.y) / 2) || skip(L, (b1.x + b2.x) / 2, (b1.y + b2.y) / 2))) continue;
          const u0 = along[i] / 4, u1 = along[i + 1] / 4;
          facing(g, [a1.x, a1.top, -a1.y], [b1.x, b1.top, -b1.y], [b2.x, b2.top, -b2.y], [a2.x, a2.top, -a2.y], [0, 1, 0],
            [o1 / 4, u0], [o1 / 4, u1], [o2 / 4, u1], [o2 / 4, u0], white);
          // kerb faces on both edges
          if (edges) for (const [e, side] of [[o1, -1], [o2, 1]] as const) {
            const ea = at(i, e), eb = at(i + 1, e), n = nrm[i];
            const out = [n[0] * side, 0, -n[1] * side];
            facing(g, [ea.x, ea.foot, -ea.y], [eb.x, eb.foot, -eb.y], [eb.x, eb.top, -eb.y], [ea.x, ea.top, -ea.y], out,
              [u0, 0], [u1, 0], [u1, 0.1], [u0, 0.1], white);
          }
        }
      }
    }
    return into ? null : g.build();
  };
  const flatMat = (color: string, off: number, map?: THREE.Texture) =>
    new THREE.MeshLambertMaterial({ color, map, polygonOffset: true, polygonOffsetFactor: -off, polygonOffsetUnits: -off * 2 });
  const asphalt: THREE.Texture = S.asphalt ??= TX.asphalt();
  const vehicle = D.rd.filter((r) => !PATHS.has(r.c));
  const addFlat = (g: THREE.BufferGeometry | null, m: THREE.Material) => {
    if (!g) return;
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; scene.add(mesh);
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
  };
  // ---- bridges ---------------------------------------------------------------------------
  // A road or path on a bridge is drawn at its own height by strips; this builds what holds it
  // up and keeps you on it: the deck's stone sides and underside, a parapet each side, an
  // abutment at each end where the deck leaves the ground, piers every so often along a long
  // span, and, where the deck stands high enough, Bath-stone arches between them. What the
  // bridge crosses (the river, the canal, the railway, another road) keeps its own ground
  // underneath, as tools/prep_map.py no longer raises the terrain under a span.
  const STONE = [0.8, 0.73, 0.57], COPING = [0.87, 0.81, 0.67], SOFFIT = [0.6, 0.55, 0.46];
  const DECK = 0.9;           // how thick the deck is, top to underside
  const PARAPET = 1.05;       // above the pavement
  const PIER_GAP = 16;        // a pier at least every so often
  function bridgeStructures(rd: Road[], g: Geo) {
    const ground = (x: number, z: number) => map.ground(x, z);
    for (const r of rd) {
      if (!r.bridge) continue;
      const half = deckHalf(r.c), lift = KERBED.has(r.c) ? 0.2 : 0.1, flags = spanFlags(r, ground, Z0);
      for (const [a, b] of bridgeSpans(r, flags, true)) {
        // the span, every 2 m: where it is, which way it runs, the deck's top and the ground under it
        const src = r.p.slice(a, b + 1), tops = src.map((q, i) => deckTop(q, flags[a + i], ground, Z0));
        const P: { x: number; y: number; s: number; top: number; g: number; nx: number; ny: number }[] = [];
        let s = 0;
        for (let i = 0; i < src.length - 1; i++) {
          const A = src[i], B = src[i + 1], len = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.ceil(len / 2));
          for (let k = 0; k < n; k++) {
            const f = k / n, x = A[0] + (B[0] - A[0]) * f, y = A[1] + (B[1] - A[1]) * f;
            P.push({ x, y, s: s + len * f, top: tops[i] + (tops[i + 1] - tops[i]) * f + lift, g: ground(x, -y), nx: 0, ny: 0 });
          }
          s += len;
        }
        const E = src[src.length - 1];
        P.push({ x: E[0], y: E[1], s, top: tops[tops.length - 1] + lift, g: ground(E[0], -E[1]), nx: 0, ny: 0 });
        if (P.length < 2 || s < 3) continue;
        for (let i = 0; i < P.length; i++) {
          const A = P[Math.max(0, i - 1)], B = P[Math.min(P.length - 1, i + 1)], dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy) || 1;
          P[i].nx = -dy / l; P[i].ny = dx / l;
        }
        const at = (q: typeof P[number], o: number, h: number) => [q.x + q.nx * o, h, -(q.y + q.ny * o)];
        const out = (q: typeof P[number], side: number) => [q.nx * side, 0, -q.ny * side];
        const along = (q: typeof P[number]) => q.s / 2.5;
        // where it leaves the ground at each end, and the piers between: the supports
        const supports = [0, s];
        // (a short span is one arch, with nothing standing in the water or the road under it)
        const clear = Math.max(...P.map((q) => q.top - DECK - q.g));
        if (clear > 1.5 && s >= 2 * PIER_GAP) for (let k = 1; k < Math.ceil(s / PIER_GAP); k++) supports.splice(k, 0, (s * k) / Math.ceil(s / PIER_GAP));
        const lerpAt = (sp: number) => {
          let i = 0;
          while (i < P.length - 2 && P[i + 1].s < sp) i++;
          const A = P[i], B = P[i + 1], f = Math.min(1, Math.max(0, (sp - A.s) / ((B.s - A.s) || 1)));
          return { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f, s: sp, top: A.top + (B.top - A.top) * f, g: Math.min(A.g, B.g), nx: A.nx, ny: A.ny };
        };
        // arches: between supports, where the deck stands high enough above the ground for one
        const arches: { a: number; b: number; spring: number; rise: number }[] = [];
        for (let k = 0; k < supports.length - 1; k++) {
          const a = supports[k] + 1.4, b = supports[k + 1] - 1.4, span = b - a;
          if (span < 4) continue;
          const mid = lerpAt((a + b) / 2), low = Math.min(...P.filter((q) => q.s >= a && q.s <= b).map((q) => q.g), mid.g);
          const rise = Math.min(span * 0.45, mid.top - DECK - low - 0.6);
          if (rise >= 1) arches.push({ a, b, spring: mid.top - DECK - rise, rise });
        }
        const archAt = (sp: number) => {
          for (const A of arches) if (sp >= A.a && sp <= A.b) return A.spring + A.rise * Math.sqrt(Math.max(0, 1 - ((sp - (A.a + A.b) / 2) / ((A.b - A.a) / 2)) ** 2));
          return null;
        };
        const W = half + 0.4;    // out to the parapet's outer face
        for (let i = 0; i < P.length - 1; i++) {
          const A = P[i], B = P[i + 1], uA = along(A), uB = along(B);
          const underA = A.top - DECK, underB = B.top - DECK;
          for (const side of [1, -1]) {
            // the parapet: outer face, inner face and coping
            facing(g, at(A, side * W, A.top), at(B, side * W, B.top), at(B, side * W, B.top + PARAPET), at(A, side * W, A.top + PARAPET), out(A, side),
              [uA, 0], [uB, 0], [uB, 0.5], [uA, 0.5], STONE);
            facing(g, at(A, side * half, A.top), at(B, side * half, B.top), at(B, side * half, B.top + PARAPET), at(A, side * half, A.top + PARAPET), out(A, -side),
              [uA, 0], [uB, 0], [uB, 0.5], [uA, 0.5], STONE);
            facing(g, at(A, side * half, A.top + PARAPET), at(B, side * half, B.top + PARAPET), at(B, side * W, B.top + PARAPET), at(A, side * W, A.top + PARAPET), [0, 1, 0],
              [uA, 0], [uB, 0], [uB, 0.2], [uA, 0.2], COPING);
            // the deck's side, and the spandrel down to the arch where there is one
            const arA = archAt(A.s), arB = archAt(B.s);
            const footA = arA ?? Math.min(underA, A.g - 0.5), footB = arB ?? Math.min(underB, B.g - 0.5);
            if (A.top - A.g > 0.3 || B.top - B.g > 0.3)
              facing(g, at(A, side * W, footA), at(B, side * W, footB), at(B, side * W, B.top), at(A, side * W, A.top), out(A, side),
                [uA, (footA - A.top) / 2.5], [uB, (footB - B.top) / 2.5], [uB, 0], [uA, 0], STONE);
          }
          // the underside: the arch's barrel, or the flat soffit of the deck
          const arA = archAt(A.s), arB = archAt(B.s);
          if (arA !== null && arB !== null)
            facing(g, at(A, -W, arA), at(B, -W, arB), at(B, W, arB), at(A, W, arA), [0, -1, 0], [uA, 0], [uB, 0], [uB, W / 1.25], [uA, W / 1.25], SOFFIT);
          else if (A.top - A.g > 0.6 || B.top - B.g > 0.6)
            facing(g, at(A, -W, underA), at(B, -W, underB), at(B, W, underB), at(A, W, underA), [0, -1, 0], [uA, 0], [uB, 0], [uB, W / 1.25], [uA, W / 1.25], SOFFIT);
        }
        // the parapets' ends
        for (const [q, dir] of [[P[0], -1], [P[P.length - 1], 1]] as const) {
          const fwd = [-q.ny * dir, 0, -q.nx * dir];
          for (const side of [1, -1])
            facing(g, at(q, side * half, q.top), at(q, side * W, q.top), at(q, side * W, q.top + PARAPET), at(q, side * half, q.top + PARAPET), fwd,
              [0, 0], [0.2, 0], [0.2, 0.5], [0, 0.5], STONE);
        }
        // the supports: a block from the deck's underside down into the ground
        for (const sp of supports) {
          const q = lerpAt(sp), under = q.top - DECK + 0.02, L = sp === 0 || sp === s ? 1.5 : 1.0;
          const low = Math.min(q.g, lerpAt(Math.max(0, sp - L)).g, lerpAt(Math.min(s, sp + L)).g) - 1.5;
          if (under - low < 0.5) continue;
          const fx = -q.ny, fy = q.nx;     // along the road
          const c = [[-L, -W], [L, -W], [L, W], [-L, W]].map(([u, v]) => [q.x + fx * u + q.nx * v, q.y + fy * u + q.ny * v]);
          for (let k = 0; k < 4; k++) {
            const A = c[k], B = c[(k + 1) % 4], mx = (A[0] + B[0]) / 2 - q.x, my = (A[1] + B[1]) / 2 - q.y;
            facing(g, [A[0], low, -A[1]], [B[0], low, -B[1]], [B[0], under, -B[1]], [A[0], under, -A[1]], [mx, 0, -my],
              [0, 0], [Math.hypot(B[0] - A[0], B[1] - A[1]) / 2.5, 0], [Math.hypot(B[0] - A[0], B[1] - A[1]) / 2.5, (under - low) / 2.5], [0, (under - low) / 2.5], STONE);
          }
        }
      }
    }
  }
  const bridgeMat: THREE.Material = S.bridgeMat ??= new THREE.MeshLambertMaterial({ map: TX.wall("stone", false), vertexColors: true });

  /** Streets with their pavements, paths and streams, as meshes (the wider map's too: outskirts.ts).
   *  own picks out roads that carry their own heights (bridges). */
  /** The same, a few dozen roads at a time (yields between). */
  function* roadMeshesGen(rd: Road[], wl: Line[], own?: (r: any) => boolean): Generator<void, THREE.Mesh[]> {
    const geo = { path: new Geo(), service: new Geo(), road: new Geo(), pave: new Geo(), bridge: new Geo() };
    for (let k = 0; k < rd.length; k += 15) {
      const part = rd.slice(k, k + 15), veh = part.filter((r) => !PATHS.has(r.c)), kerb = veh.filter((r) => KERBED.has(r.c));
      strips(part.filter((r) => PATHS.has(r.c) && r.c !== "pedestrian"), (r) => [[-half(r), half(r)]], 0.1, undefined, true, own, geo.path);
      // a pedestrianised street is paved from wall to wall, like a pavement
      strips(part.filter((r) => r.c === "pedestrian"), (r) => [[-half(r), half(r)]], 0.2, undefined, false, own, geo.pave);
      strips(veh.filter((r) => r.c === "service" || r.c === "unknown"), (r) => [[-half(r), half(r)]], 0.05, undefined, false, own, geo.service);
      // carriageways have no edge faces: they'd show as lines across junctions, and the pavement kerbs cover them
      strips(kerb, (r) => [[-half(r), half(r)]], 0.07, undefined, false, own, geo.road);
      strips(kerb, (r) => [[half(r), half(r) + PAVE], [-half(r) - PAVE, -half(r)]], 0.2, onOtherStreet, true, own, geo.pave);
      if (own) bridgeStructures(part, geo.bridge);
      yield;
    }
    const out: THREE.Mesh[] = [];
    const add = (g: THREE.BufferGeometry | null, m: THREE.Material, shadow = false) => {
      if (!g) return;
      const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = shadow; out.push(mesh);
    };
    for (const k of ["path", "service", "road", "pave"] as const) { add(geo[k].build(), roadMats[k]); yield; }
    add(geo.bridge.build(), bridgeMat, true);
    if (wl.length) add(ribbon(wl, () => 1.6, 0.05), roadMats.stream);
    return out;
  }
  const roadMeshes = (rd: Road[], wl: Line[], own?: (r: any) => boolean) => run(roadMeshesGen(rd, wl, own));
  // the canal draws its own water at the right levels (canal.ts): its lines and pieces in the map are left out
  if (core && map.canalData) {
    if (map.canal instanceof Canal) for (const m of map.canal.moored) { const k = map.movers.indexOf(m); if (k >= 0) map.movers.splice(k, 1); }
    const canal = new Canal(map.canalData, scene as THREE.Scene, Z0);
    map.canal = canal;
    map.movers.push(...canal.moored);
  }
  if (core) map.floors = [];
  if (core && map.canal instanceof Canal) { const c = map.canal; map.floors.push((x, z) => c.floor(x, z)); }
  const railway = core && map.railData ? new Railway(map.railData, scene as THREE.Scene, Z0) : null;
  if (railway) map.floors.push((x, z) => railway.floor(x, z));
  const cableway = core && map.cable ? new Cableway(map.cable, scene as THREE.Scene) : null;
  const streams = map.canal ? D.wl.filter((l) => l.c !== "canal") : D.wl;
  for (const m of yield* roadMeshesGen(D.rd, streams, (r) => r.bridge)) scene.add(m);
  // garden paths (paving slabs) and driveways (tarmac or gravel)
  const seg = (s: number[]) => ({ p: [[s[0], s[1], 0], [s[2], s[3], 0]] });
  addFlat(strips((D.fp ?? []).map(seg), () => [[-0.55, 0.55]], 0.06), S.pathMat ??= flatMat("#b3aa98", 2, TX.wall("stone", false)));
  addFlat(strips((D.dv ?? []).map(seg), () => [[-1.5, 1.5]], 0.05, undefined, false), S.driveMat ??= flatMat("#8d8a84", 2, asphalt));

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
  for (const w of D.wp) {
    if (w.c === "canal" && map.canal) continue;         // the canal draws its own water, at its own levels
    const lv = w.c ? undefined : map.canal?.pondLevel(w);
    if (lv !== null) scene.add(pondMesh(lv === undefined ? w : { ...w, z: lv }));
  }
  yield;

  // ---- buildings, merged into chunks -------------------------------------------------
  // Each chunk keeps one geometry per surface: walls by material (with or without windows),
  // and roofs. Vertex colours tint each building.
  type Surf = "s" | "k" | "y" | "r";
  const chunks = new Map<string, Map<string, Geo>>();
  const geoFor = (x: number, y: number, key: string) => {
    const k = `${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`;
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
  };
  const ROOF_TINTS: Record<string, number[][]> = {
    s: [[0.34, 0.36, 0.41], [0.3, 0.32, 0.37], [0.38, 0.39, 0.43]],   // slate
    p: [[0.7, 0.4, 0.26], [0.64, 0.36, 0.24], [0.74, 0.46, 0.3]],     // clay pantiles
    c: [[0.48, 0.38, 0.32], [0.42, 0.35, 0.31], [0.52, 0.45, 0.4]],   // concrete tiles
    g: [[0.42, 0.43, 0.46], [0.36, 0.37, 0.4]],                       // modern grey tiles
  };
  const pick = <T,>(a: T[], r: number) => a[Math.floor(r * a.length) % a.length];
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
    const surf = ((b.m as Surf) in WALL_TINTS ? b.m : "s") as Surf;
    const walls = geoFor(cx, cy, surf + (b.w ? "w" : "p"));
    const plain = geoFor(cx, cy, surf + "p");
    const roofs = geoFor(cx, cy, "roof");
    const ground = b.g - Z0, eave = ground + b.h, base = ground - 0.6;
    const wallCol = pick(WALL_TINTS[surf], hash(bi * 3 + 1));
    // big buildings (schools, Prior Park, flats) have wider-spaced windows and taller storeys than houses
    const big = b.c === "institution" || b.c === "flats", bay = big ? 4.6 : 3.4, floor = big ? 3.5 : 2.9;
    const roofCol = pick(ROOF_TINTS[b.rc ?? "s"] ?? ROOF_TINTS.s, hash(bi * 5 + 2));
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
        const v0 = (base - ground - lift) / storey, v1 = stories;
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
        if (b.pp && ri === 0) {
          // a parapet: the wall carries on past the eaves, seen from both sides
          const top = eave + b.pp, vp = stories + b.pp / storey, back = out.map((k) => -k);
          facing(plain, [a[0], eave, -a[1]], [q[0], eave, -q[1]], [q[0], top, -q[1]], [a[0], top, -a[1]], out, [u0, v1], [u1, v1], [u1, vp], [u0, vp], wallCol);
          facing(plain, [a[0], eave, -a[1]], [q[0], eave, -q[1]], [q[0], top, -q[1]], [a[0], top, -a[1]], back, [u0, v1], [u1, v1], [u1, vp], [u0, vp], wallCol);
        }
      }
    });

    const roof = roofFit(b);
    if (roof) {
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
    if (!roof || roof.wings) {
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
  for (let bi = 0; bi < D.bl.length; bi++) {
    addBuilding(D.bl[bi], bi, geoFor);
    if (bi % 25 === 24) yield;
  }
  const wallMats: Record<string, THREE.Material> = S.wallMats ??= {};
  if (!wallMats.roof) for (const sfc of ["s", "k", "y", "r"] as Surf[]) {
    const kind = sfc === "s" ? "stone" : sfc === "r" ? "render" : "brick";
    wallMats[sfc + "w"] = litWindows(new THREE.MeshLambertMaterial({ map: TX.wall(kind, true), vertexColors: true }), kind);
    wallMats[sfc + "p"] = new THREE.MeshLambertMaterial({ map: TX.wall(kind, false), vertexColors: true });
  }
  wallMats.roof ??= new THREE.MeshLambertMaterial({ map: TX.roofTiles(), vertexColors: true, side: THREE.DoubleSide });  // undersides of the eaves show from the street
  for (const c of chunks.values()) {
    for (const [key, geo] of c) {
      const g = geo.build();
      if (!g) continue;
      const m = new THREE.Mesh(g, wallMats[key]);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }
    yield;
  }
  chunks.clear();   // let the lists the meshes were built from go: the game holds on to this function's other parts
  yield;

  // ---- walls, fences and hedges -------------------------------------------------------------
  // material, thickness and colour of each kind of wall, fence and hedge
  type BarMat = "stone" | "brick" | "leaf" | "wood" | "iron";
  const BAR: Record<string, { mat: BarMat; t: number; col: number[] }> = {
    wall: { mat: "stone", t: 0.45, col: [0.86, 0.78, 0.6] }, retaining_wall: { mat: "stone", t: 0.5, col: [0.8, 0.73, 0.57] },
    stone_wall: { mat: "stone", t: 0.45, col: [0.84, 0.76, 0.58] }, garden_wall: { mat: "stone", t: 0.35, col: [0.9, 0.82, 0.64] },
    brick_wall: { mat: "brick", t: 0.3, col: [0.7, 0.42, 0.32] }, brick_wall_low: { mat: "brick", t: 0.3, col: [0.72, 0.45, 0.34] },
    fence: { mat: "wood", t: 0.08, col: [0.55, 0.42, 0.3] },
    hedge: { mat: "leaf", t: 0.9, col: [0.42, 0.58, 0.3] }, hedge_low: { mat: "leaf", t: 0.7, col: [0.46, 0.62, 0.32] },
    railing: { mat: "iron", t: 0.05, col: [0.16, 0.17, 0.18] },
  };
  const barGeos = new Map<string, Geo>();
  const barGeo = (x: number, y: number, mat: BarMat) => {
    const k = `${mat}:${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`;
    let g = barGeos.get(k);
    if (!g) barGeos.set(k, (g = new Geo()));
    return g;
  };
  const barrierRun = (l: Line) => {
    const spec = BAR[l.c] ?? BAR.wall, hh = BARRIER_HEIGHT[l.c] ?? 1.5, t = spec.t / 2;
    const g = barGeo(l.p[0][0], l.p[0][1], spec.mat);
    const tint = hash(Math.round(l.p[0][0] * 7 + l.p[0][1] * 13)) * 0.12 + 0.94;
    const col = spec.col.map((c) => c * tint);
    let along = 0;
    for (let i = 0; i < l.p.length - 1; i++) {
      const a = l.p[i], q = l.p[i + 1];
      const ex = q[0] - a[0], ey = q[1] - a[1], len = Math.hypot(ex, ey);
      if (len < 0.05) continue;
      const nx = ey / len * t, ny = -ex / len * t;
      const ga = a[2] - Z0, gq = q[2] - Z0;
      const c4 = [[a[0] + nx, a[1] + ny, ga], [q[0] + nx, q[1] + ny, gq], [q[0] - nx, q[1] - ny, gq], [a[0] - nx, a[1] - ny, ga]];
      const P = (k: number, top: boolean) => [c4[k][0], top ? c4[k][2] + hh : c4[k][2] - 0.4, -c4[k][1]];
      const u0 = along / 2, u1 = (along + len) / 2, vt = (hh + 0.4) / 2;
      facing(g, P(0, false), P(1, false), P(1, true), P(0, true), [nx, 0, -ny], [u0, 0], [u1, 0], [u1, vt], [u0, vt], col);
      facing(g, P(3, false), P(2, false), P(2, true), P(3, true), [-nx, 0, ny], [u0, 0], [u1, 0], [u1, vt], [u0, vt], col);
      if (spec.mat !== "iron") {
        // stone and brick walls get a slightly darker coping along the top
        const top = spec.mat === "stone" || spec.mat === "brick" ? col.map((c) => c * 0.85) : col;
        facing(g, P(0, true), P(1, true), P(2, true), P(3, true), [0, 1, 0], [u0, 0], [u1, 0], [u1, t], [u0, t], top);
      }
      along += len;
    }
  };
  for (let k = 0; k < D.br.length; k++) {
    barrierRun(D.br[k]);
    if (k % 100 === 99) yield;
  }

  // garden gates: pillars either side, and a gate standing a little open
  for (const gt of D.gt ?? []) {
    const [x0, y0, x1, y1, z, style] = gt as [number, number, number, number, number, string];
    const spec = BAR[style] ?? BAR.garden_wall, hh = BARRIER_HEIGHT[style] ?? 1;
    const ux = x1 - x0, uy = y1 - y0, w = Math.hypot(ux, uy) || 1, u = [ux / w, uy / w];
    const ground = z - Z0;
    if (spec.mat === "stone" || spec.mat === "brick") {
      for (const [px, py] of [[x0, y0], [x1, y1]]) boxAt(barGeo(px, py, spec.mat), px, py, u, 0.2, 0.2, ground - 0.3, ground + hh + 0.22, spec.col.map((c) => c * 0.95));
    }
    // the gate itself, hinged at the first post and swung 35 degrees into the garden
    const ang = Math.atan2(u[1], u[0]) - 0.6;
    const gu = [Math.cos(ang), Math.sin(ang)], gl = Math.min(1.0, w - 0.1);
    const cx = x0 + gu[0] * gl / 2, cy = y0 + gu[1] * gl / 2;
    const iron = spec.mat === "iron" || hash(Math.round(x0 * 31)) < 0.4;
    boxAt(barGeo(cx, cy, iron ? "iron" : "wood"), cx, cy, gu, gl / 2, 0.025, ground + 0.08, ground + Math.min(1.0, hh + 0.05),
      iron ? [0.16, 0.17, 0.18] : [0.5, 0.38, 0.26]);
  }
  const barMats: Record<BarMat, THREE.Material> = S.barMats ??= {
    stone: new THREE.MeshLambertMaterial({ map: TX.wall("stone", false), vertexColors: true }),
    brick: new THREE.MeshLambertMaterial({ map: TX.wall("brick", false), vertexColors: true }),
    leaf: new THREE.MeshLambertMaterial({ map: TX.leaves(), vertexColors: true }),
    wood: new THREE.MeshLambertMaterial({ map: TX.boards(), vertexColors: true, side: THREE.DoubleSide }),
    iron: new THREE.MeshLambertMaterial({ map: TX.railings(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
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

  // ---- trees and shrubs ------------------------------------------------------------------
  const vegetation = buildVegetation(scene, D.tr, D.sb ?? [], Z0, S.vegKit);
  S.vegKit ??= vegetation.kit;
  yield;

  // ---- the wider map round this one, streamed in around the player ----------------------------
  // (where the full-detail squares are built, they take its place)
  const outskirts = core && map.wide && !map.tileIndex ? buildOutskirts(map, scene as THREE.Scene, {
    terrMat, ground: GROUND, earth, vegetation: vegetation.kit,
    roads: (rd, wl, wp) => [...roadMeshes(rd, wl, (r) => r.bridge), ...wp.map(pondMesh)],
    buildings: () => {
      const geos = new Map<string, Geo>();
      return {
        add: (b, bi) => addBuilding(b, bi, (_x, _y, k) => geos.get(k) ?? geos.set(k, new Geo()).get(k)!),
        finish: () => [...geos].flatMap(([k, geo]) => {
          const g = geo.build();
          if (!g) return [];
          const m = new THREE.Mesh(g, wallMats[k]);
          m.castShadow = m.receiveShadow = true;
          return [m];
        }),
      };
    },
  }) : null;

  // ---- wood canopy: one leafy surface over the woods, with the trunks below ---------------
  if (D.cn) {
    const C = D.cn, raw = atob(C.h), H = new Uint8Array(raw.length);
    for (let k = 0; k < raw.length; k++) H[k] = raw.charCodeAt(k);
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
      const key = `${Math.floor(x0 / 160)},${Math.floor(y0 / 160)}`;
      let g = geos.get(key);
      if (!g) geos.set(key, (g = new Geo()));
      const col = LEAVES[Math.floor(hash(i * 7919 + j) * LEAVES.length)];
      const lump = (a: number, b: number) => (hash(a * 31337 + b * 17) - 0.5) * 1.6;
      const P = (x: number, y: number, a: number, b: number, under: boolean) => {
        const hc = Math.max(1.5, corner(a, b));
        return [x, map.ground(x, -y) + (under ? hc * 0.5 : hc + lump(a, b)), -y];
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
    }
    const canopyMat: THREE.Material = S.canopyMat ??= new THREE.MeshLambertMaterial({ map: TX.leaves(), vertexColors: true });
    for (const g of geos.values()) {
      const built = g.build();
      if (!built) continue;
      const m = new THREE.Mesh(built, canopyMat);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      culler.add(m, 380);
    }
  }
  yield;

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
    const frameMat = new THREE.MeshLambertMaterial({ color: "#ece6d6" }), fanMat = new THREE.MeshLambertMaterial({ color: "#2a3640" });
    const doorMat = new THREE.MeshLambertMaterial({ color: "#ffffff" });
    for (const list of byChunk.values()) {
      const meshes = [new THREE.InstancedMesh(frameGeo, frameMat, list.length), new THREE.InstancedMesh(doorGeo, doorMat, list.length), new THREE.InstancedMesh(fanGeo, fanMat, list.length)];
      list.forEach((d, k) => {
        qq.setFromAxisAngle(up, d[3]);
        m4.compose(pp.set(d[0], d[2] - Z0, -d[1]), qq, one);
        for (const m of meshes) m.setMatrixAt(k, m4);
        meshes[1].setColorAt(k, DOOR[d[4] % DOOR.length]);
      });
      for (const m of meshes) { m.computeBoundingSphere(); scene.add(m); culler.add(m, 150); }
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
  buildLandmarks(map, scene);
  // the wider map's (where its full-detail squares aren't built yet: those carry their own)
  if (core && map.wide?.d.lm && !map.tileIndex) buildLandmarks(map, scene, map.wide.d.lm);
  buildTunnels(map, scene);
  yield* buildFurniture(map, scene, culler);
  yield* buildShops(map, scene, culler);

  // Where the drawn surface sits: the sunken terrain, or a street, pavement or path on top of it.
  const surfCells = new Map<number, { a: number[]; b: number[]; half: number; lift: number; pave: boolean }[]>();
  const surfKey = (x: number, y: number) => (Math.floor(x / 10) + 1000) * 4000 + Math.floor(y / 10) + 1000;
  for (const r of [...D.rd, ...wideRoads]) {
    const path = PATHS.has(r.c), kerbed = KERBED.has(r.c);
    if (!path && !kerbed && r.c !== "service" && r.c !== "unknown") continue;   // not drawn as a strip
    const half = width(r) / 2, lift = path ? 0.1 : kerbed ? 0.07 : 0.05, reach = half + (kerbed ? PAVE : 0);
    for (let k = 0; k < r.p.length - 1; k++) {
      const a = r.p[k], b = r.p[k + 1], seg = { a, b, half, lift, pave: kerbed };
      const keys = new Set<number>();
      for (let i = Math.floor((Math.min(a[0], b[0]) - reach) / 10); i <= Math.floor((Math.max(a[0], b[0]) + reach) / 10); i++)
        for (let j = Math.floor((Math.min(a[1], b[1]) - reach) / 10); j <= Math.floor((Math.max(a[1], b[1]) + reach) / 10); j++)
          keys.add(surfKey(i * 10, j * 10));
      for (const key of keys) (surfCells.get(key) ?? surfCells.set(key, []).get(key)!).push(seg);
    }
  }
  const drawnGround = (x: number, z: number) => {
    const fi = (x - T.x0) / T.dx, fj = (-z - T.y0) / T.dy;
    if (map.wide && (fi < 0 || fj < 0 || fi > T.nx - 1 || fj > T.ny - 1)) return map.ground(x, z);   // out in the wider map
    const i = Math.min(T.nx - 2, Math.max(0, Math.floor(fi))), j = Math.min(T.ny - 2, Math.max(0, Math.floor(fj)));
    const u = Math.min(1, Math.max(0, fi - i)), v = Math.min(1, Math.max(0, fj - j));
    const h = (k: number) => tPos[k * 3 + 1], n = T.nx, a = j * n + i;
    if (u + v <= 1) return h(a) + (h(a + 1) - h(a)) * u + (h(a + n) - h(a)) * v;
    return h(a + n + 1) + (h(a + n) - h(a + n + 1)) * (1 - u) + (h(a + 1) - h(a + n + 1)) * (1 - v);
  };
  buildPitches(map, scene, culler, drawnGround, groundTex);
  /** How far a street, pavement or path lifts the surface at scene (x, z): 0 off them. */
  const lift = (x: number, z: number) => {
    const y = -z;
    let road = 0, pave = false, path = 0;
    for (const s of surfCells.get(surfKey(x, y)) ?? []) {
      const vx = s.b[0] - s.a[0], vy = s.b[1] - s.a[1], l2 = vx * vx + vy * vy || 1;
      const t = Math.min(1, Math.max(0, ((x - s.a[0]) * vx + (y - s.a[1]) * vy) / l2));
      const d = Math.hypot(x - s.a[0] - vx * t, y - s.a[1] - vy * t);
      if (d < s.half) { if (s.lift === 0.1) path = 0.1; else road = Math.max(road, s.lift); }
      else if (s.pave && d < s.half + PAVE) pave = true;
    }
    // carriageways win over pavements: the pavement stops where it would cross another street
    return road || (pave ? 0.2 : path);
  };
  const surface = (x: number, z: number, y?: number) => {
    const t = y === undefined ? null : map.inTunnel(x, z, y) ?? map.deck(x, z, y);
    if (t !== null) return t;
    const l = lift(x, z);
    return l ? map.ground(x, z) + l : drawnGround(x, z);
  };
  const paved = (x: number, z: number) => lift(x, z) > 0;

  // ---- grass round the player ---------------------------------------------------------------
  const grass = yield* buildGrass(scene, D, drawnGround, GROUND, vegetation.time, width, PATHS, KERBED, PAVE);
  yield;

  if (!core) {
    // a full-detail square: free what it alone uses when it's dropped
    return {
      group, surface, paved,
      update(px: number, pz: number, dt: number) { culler.update(px, pz, dt); vegetation.update(px, pz, dt); grass.update(px, pz); },
      dispose() { vegetation.dispose(); disposeTileGroup(group, S); },
    } satisfies TileWorld;
  }

  const { tunnelDark, hemi, sun, sky } = shell!;
  const skyU = (sky.material as THREE.ShaderMaterial).uniforms;

  // ---- after dark: the street lamps nearest you light the street round them -----------------
  // A few lights, moved to whichever lamps are nearest every so often; always there (dark by
  // day) so the number of lights never changes and nothing has to be rebuilt at dusk
  const LAMP_LIGHTS = 4;
  const lampLights = Array.from({ length: LAMP_LIGHTS }, () => {
    const l = new THREE.PointLight("#ffc77a", 0, 22, 1.4);
    scene.add(l);
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
      for (let i = 0; i < h.length; i += 3) {
        const d = (h[i] - px) ** 2 + (h[i + 2] - pz) ** 2;
        if (d < 80 * 80) near.push([d, h[i], h[i + 1], h[i + 2]]);
      }
    }
    near.sort((a, b) => a[0] - b[0]);
    lampLights.forEach((l, i) => {
      const n = near[i];
      if (n) l.position.set(n[1], n[2], n[3]);
      l.userData.on = !!n;
    });
  };
  const world = scene as THREE.Scene;

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
  const fieldMesh = new THREE.Mesh(new THREE.CylinderGeometry(map.field, map.field, 260, 256, 1, true), fieldMat);
  fieldMesh.position.set(map.fieldX, 100, map.fieldZ);
  fieldMesh.renderOrder = 5;
  scene.add(fieldMesh);
  const clock = new THREE.Clock();

  // ---- the full-detail squares round the map, loaded as the player comes near ----------------
  const tiles = map.tileIndex ? new Tiles(map, world, (m, g) => tileWorld(m, S, g), (g) => disposeTileGroup(g, S)) : null;
  /** The drawn surface: out in a loaded square, that square's. */
  const surfaceAll = (x: number, z: number, y?: number) => tiles?.worldAt(x, z)?.surface(x, z, y) ?? surface(x, z, y);
  const pavedAll = (x: number, z: number) => tiles?.worldAt(x, z)?.paved(x, z) ?? paved(x, z);
  const vehicles = new Vehicles(map, world, surfaceAll);

  return {
    scene: world, sun, surface: surfaceAll, paved: pavedAll, vehicles, canal: map.canal instanceof Canal ? map.canal : null, railway, cableway,
    update(px: number, py: number, pz: number, dt = 0.016, others?: { x: number; z: number }[]) {
      culler.update(px, pz, dt);
      const inside = (map.tileAt(px, pz) ?? map).inTunnel(px, pz, py) !== null ? 1 : 0;
      if (inside !== dark) dark = Math.abs(inside - dark) < 0.01 ? inside : dark + (inside - dark) * Math.min(1, dt * 4);
      // the time of day (daylight.ts), and inside a tunnel the daylight goes and the fog turns dark
      const sk = skyNow(), night = sk.night;
      const fog = world.fog as THREE.Fog;
      fog.color.lerpColors(sk.fog, tunnelDark, dark);
      (world.background as THREE.Color).copy(fog.color);
      const far = 480 - 150 * night;
      fog.near = (60 - 20 * night) * (1 - dark) + 10 * dark; fog.far = far + (180 - far) * dark;
      sun.color.copy(sk.lightCol); sun.intensity = sk.lightI * (1 - 0.9 * dark);
      hemi.color.copy(sk.hemiSky); hemi.groundColor.copy(sk.hemiGround); hemi.intensity = sk.hemiI * (1 - 0.8 * dark);
      skyU.top.value.copy(sk.top); skyU.bottom.value.copy(sk.fog);
      skyU.sunDir.value.copy(sk.sun); skyU.moonDir.value.copy(sk.light); skyU.night.value = night;
      for (const m of GLOWING) m.emissiveIntensity = night * 1.1;
      LAMP_GLASS.color.lerpColors(lampDay, lampNight, night);
      if ((lampT -= dt) <= 0) { lampT = 0.4; placeLamps(px, pz); }
      for (const l of lampLights) l.intensity = l.userData.on ? night * 70 * (1 - dark) : 0;
      vegetation.update(px, pz, dt);
      outskirts?.update(px, pz, dt);
      tiles?.update(px, pz, dt, others);
      grass.update(px, pz);
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
      world.traverse((o) => {
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
