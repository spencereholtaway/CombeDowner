// What the set pieces (landmarks/setpieces.ts) are built with: a kit that lays stone, glass and
// lead out as boxes, columns, roofs and arches in a set piece's own frame and merges them into one
// model per material, so a whole building is a handful of draw calls; the textures they share,
// drawn on canvases (Bath stone, Gothic and Georgian windows, a fan vault, flagstones, openwork
// parapets, lettering); and the light in their windows after dark. Nothing here goes over the network.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as TX from "../textures";
import { paintLight } from "../stainedglass";
import { nightNow } from "../daylight";
import { kindOf } from "../kinds";

/** Lay a model's texture out by size, tile metres to a repeat, from where each face is in the
 *  set piece: each face takes the two axes it lies across (a wall along x takes x and height). */
export function worldUV(g: THREE.BufferGeometry, tile: number) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  if (!uv || !n) return;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, x / tile, z / tile);
    else if (ax >= az) uv.setXY(i, z / tile, y / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  uv.needsUpdate = true;
}

type V3 = [number, number, number];

/** A model put together a piece at a time, then merged into one mesh per material. */
export class Kit {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler();
  private one = new THREE.Vector3(1, 1, 1); private p = new THREE.Vector3();

  /** Add g, turned (rx, ry, rz) and moved to (x, y, z). tile: lay its texture out by size, so
   *  many metres to a repeat (0: keep its own texture coordinates). */
  add(mat: THREE.Material, g: THREE.BufferGeometry, x = 0, y = 0, z = 0, ry = 0, tile = 0, rx = 0, rz = 0) {
    this.m.compose(this.p.set(x, y, z), this.q.setFromEuler(this.e.set(rx, ry, rz)), this.one);
    g.applyMatrix4(this.m);
    if (tile) worldUV(g, tile);
    const ng = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(ng.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") ng.deleteAttribute(k);
    ng.clearGroups();
    (this.parts.get(mat) ?? this.parts.set(mat, []).get(mat)!).push(ng);
  }

  /** A box from corner to corner (x0..x1, y0..y1, z0..z1). */
  slab(mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, tile = 3) {
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return;
    this.add(mat, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0, tile);
  }

  /** A box centred on (x, z), its foot at y, turned ry. */
  box(mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, tile = 3) {
    this.add(mat, new THREE.BoxGeometry(sx, sy, sz), x, y + sy / 2, z, ry, tile);
  }

  /** A column (or a cone, with rTop 0) standing on (x, y, z). */
  cyl(mat: THREE.Material, x: number, y: number, z: number, r: number, h: number, seg = 8, rTop = r, tile = 0) {
    this.add(mat, new THREE.CylinderGeometry(rTop, r, h, seg, 1, rTop === 0), x, y + h / 2, z, seg === 4 ? Math.PI / 4 : 0, tile);
  }

  /** A beam of w by h from a to b. */
  beam(mat: THREE.Material, a: V3, b: V3, w: number, h: number, tile = 3) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
    const g = new THREE.BoxGeometry(len, h, w);
    this.m.compose(this.p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), this.q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize()), this.one);
    g.applyMatrix4(this.m);
    worldUV(g, tile);
    this.add(mat, g);
  }

  /** A pitched roof over x0..x1 by z0..z1 from height y, its ridge rise above, running along x
   *  (or along z), with hipped ends if hip. */
  roof(mat: THREE.Material, x0: number, x1: number, y: number, z0: number, z1: number, rise: number, alongZ = false, hip = false, tile = 2) {
    const L = alongZ ? z1 - z0 : x1 - x0, W = alongZ ? x1 - x0 : z1 - z0, h = hip ? Math.min(W / 2, L / 2) : 0;
    const pos: number[] = [];
    const P = (s: number, t: number, up: number): V3 => (alongZ ? [x0 + t, y + up, z0 + s] : [x0 + s, y + up, z0 + t]);
    const tri = (a: V3, b: V3, c: V3) => pos.push(...a, ...b, ...c);
    const quad = (a: V3, b: V3, c: V3, d: V3) => { tri(a, b, c); tri(a, c, d); };
    const r0 = P(h, W / 2, rise), r1 = P(L - h, W / 2, rise);
    quad(P(0, 0, 0), P(L, 0, 0), r1, r0);
    quad(P(L, W, 0), P(0, W, 0), r0, r1);
    tri(P(L, 0, 0), P(L, W, 0), r1);
    tri(P(0, W, 0), P(0, 0, 0), r0);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
    // the winding above faces one way or the other depending on the axis: make every face look up
    const a = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i += 3) {
      const A = new THREE.Vector3().fromBufferAttribute(a, i), B = new THREE.Vector3().fromBufferAttribute(a, i + 1), C = new THREE.Vector3().fromBufferAttribute(a, i + 2);
      const n = B.clone().sub(A).cross(C.clone().sub(A));
      const mid = A.clone().add(B).add(C).divideScalar(3);
      const out = new THREE.Vector3(mid.x - (x0 + x1) / 2, n.y === 0 ? 0 : 1, mid.z - (z0 + z1) / 2);
      if (n.dot(out) < 0) { a.setXYZ(i + 1, C.x, C.y, C.z); a.setXYZ(i + 2, B.x, B.y, B.z); }
    }
    g.computeVertexNormals();
    worldUV(g, tile);
    this.add(mat, g);
  }

  /** A flat shape (in x, y) extruded depth along z from z0, turned ry about its own origin and
   *  moved to (x, y, z): arcades, arches, pediments. */
  shape(mat: THREE.Material, s: THREE.Shape, depth: number, x: number, y: number, z: number, ry = 0, tile = 3, curve = 6) {
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: curve });
    g.translate(0, 0, -depth / 2);
    this.add(mat, g, x, y, z, ry, tile);
  }

  /** A flat picture (a window, a sign) of w by h, its middle at (x, y, z), facing +z turned ry,
   *  showing the part u0..u1, v0..v1 of its texture. */
  quad(mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, ry = 0, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
    this.add(mat, g, x, y, z, ry);
  }

  /** Everything added, one mesh per material. */
  build(): THREE.Group {
    const grp = new THREE.Group();
    // Parts that share a material's texture and the settings that decide how it's drawn, but not
    // its colour, are drawn as one mesh, each part's tint written into its vertex colours: a set
    // piece's stone in several tints is then one draw rather than one apiece. Anything that lights
    // up after dark (glow()) and anything marked ghost (the Abbey's angels, which you climb
    // through) or for a gun mode (look()) keeps a mesh and material of its own, so the night glow
    // still works and the angels stay out of the way.
    const own = (m: THREE.MeshLambertMaterial) =>
      !!(m.userData?.ghost || m.userData?.look) || !!m.emissiveMap || !!m.emissive && !!(m.emissive.r || m.emissive.g || m.emissive.b);
    const keyOf = (m: THREE.MeshLambertMaterial) =>
      [m.type, m.map?.uuid ?? "", m.alphaMap?.uuid ?? "", m.side, m.transparent, m.opacity, m.alphaTest, m.depthWrite, m.blending ?? 1].join("|");
    const byKey = new Map<string, { mat: THREE.MeshLambertMaterial; geos: THREE.BufferGeometry[] }[]>();   // merges by look
    for (const [mat, list] of this.parts) {
      const m = mat as THREE.MeshLambertMaterial;
      if (!m.isMeshLambertMaterial || own(m)) {   // (anything not a plain lambert material keeps its own mesh, as before)
        const g = mergeGeometries(list);
        if (!g) continue;
        g.computeBoundingSphere();
        grp.add(new THREE.Mesh(g, mat));
        continue;
      }
      const k = keyOf(m);
      const group = byKey.get(k) ?? byKey.set(k, []).get(k)!;
      group.push({ mat: m, geos: list });
    }
    const col = new THREE.Color();
    for (const group of byKey.values()) {
      const items = group.flatMap(({ mat, geos }) => geos.map((geo) => ({ mat, geo })));
      if (items.length === 1) { grp.add(new THREE.Mesh(items[0].geo, items[0].mat)); continue; }
      const geos = items.map(({ mat, geo }) => {
        const g = geo.clone(), n = g.attributes.position.count, arr = new Float32Array(n * 3);
        col.copy(mat.color);
        for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3);
        g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
        return g;
      });
      const merged = mergeGeometries(geos);
      if (!merged) { for (const { mat, geo } of items) grp.add(new THREE.Mesh(geo, mat)); continue; }
      merged.computeBoundingSphere();
      const mat = items[0].mat.clone();
      mat.color.setRGB(1, 1, 1);
      mat.vertexColors = true;
      grp.add(new THREE.Mesh(merged, mat));
    }
    this.parts.clear();
    return grp;
  }
}

/** Merge a landmark's static meshes into one mesh per material, the way pickups.ts's merged()
 *  does, to cut the draws a hand-made model makes. Only safe meshes are touched: a plain THREE.Mesh
 *  (not instanced, skinned, points, line or sprite) with one material, an empty userData, no name
 *  and no animated ancestor (anything carrying userData.ghost is the Abbey's angels, and anything
 *  with userData.moves moves). Partial and per-material: the merged mesh keeps its material
 *  instance and copies over the onBeforeRender of any member that had one (glow() sets it, so a
 *  set piece's windows still light at night). A group that won't merge together is left alone. */
export function mergeStatic(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const plainOnBefore = new THREE.Object3D().onBeforeRender;
  const groups = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[]; onBefore: THREE.Object3D["onBeforeRender"] | null }>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    if ((o as THREE.SkinnedMesh).isSkinnedMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) return;
    if (Array.isArray(m.material) || !m.material) return;
    if (o.name || (o.userData && Object.keys(o.userData).length)) return;
    if (o.children.length) return;   // a group of its own keeps its parts
    for (let p = o.parent; p && p !== root; p = p.parent) if (Object.keys(p.userData ?? {}).length) return;
    const g = groups.get(m.material) ?? groups.set(m.material, { geos: [], meshes: [], onBefore: null }).get(m.material)!;
    g.geos.push(m.geometry);
    g.meshes.push(m);
    if (m.onBeforeRender !== plainOnBefore && !g.onBefore) g.onBefore = m.onBeforeRender;
  });

  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert(), rel = new THREE.Matrix4();
  for (const [mat, g] of groups) {
    if (g.geos.length < 2) continue;   // one mesh on its own has nothing to gain
    const parts = g.geos.map((geo, i) => {
      const ng = geo.index ? geo.toNonIndexed() : geo.clone();
      const keepColor = (mat as THREE.MeshLambertMaterial).vertexColors || "color" in ng.attributes;
      for (const name of Object.keys(ng.attributes)) if (name !== "position" && name !== "normal" && name !== "uv" && !(name === "color" && keepColor)) ng.deleteAttribute(name);
      if (!ng.attributes.normal) ng.computeVertexNormals();
      if (!ng.attributes.uv) ng.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
      return ng.applyMatrix4(rel.multiplyMatrices(rootInv, g.meshes[i].matrixWorld));
    });
    const merged = mergeGeometries(parts);
    if (!merged) continue;   // their attributes don't line up: leave that material's meshes alone
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    if (g.onBefore) mesh.onBeforeRender = g.onBefore;
    for (const m of g.meshes) m.parent?.remove(m);
    root.add(mesh);
  }
}

const plainBefore = THREE.Object3D.prototype.onBeforeRender, plainAfter = THREE.Object3D.prototype.onAfterRender;
const plainCompile = THREE.Material.prototype.onBeforeCompile, plainKey = THREE.Material.prototype.customProgramCacheKey;
const SKIP_KEYS = new Set(["uuid", "id", "name", "version", "userData", "_listeners", "onBeforeCompile", "customProgramCacheKey"]);

/** Everything that decides how a material draws, so two made apart but alike can share one draw;
 *  null for one that has to keep its own (it lights up, changes, or is drawn in a way of its own). */
function lookKey(m: THREE.Material): string | null {
  const l = m as THREE.MeshLambertMaterial;
  if (!(l.isMeshLambertMaterial || (m as THREE.MeshBasicMaterial).isMeshBasicMaterial) || m.transparent) return null;
  if (m.onBeforeCompile !== plainCompile || m.customProgramCacheKey !== plainKey || Object.keys(m.userData).length) return null;
  if (l.emissiveMap || (l.emissive && (l.emissive.r || l.emissive.g || l.emissive.b))) return null;
  const parts: string[] = [m.type];
  for (const k of Object.keys(m).sort()) {
    if (SKIP_KEYS.has(k)) continue;
    const v = (m as unknown as Record<string, unknown>)[k];
    if (typeof v === "function") return null;
    if (v instanceof THREE.Texture) parts.push(k, v.uuid);
    else if (v instanceof THREE.Color) parts.push(k, `${v.r},${v.g},${v.b}`);
    else if (v && typeof v === "object") parts.push(k, JSON.stringify(v));
    else parts.push(k, String(v));
  }
  return parts.join("|");
}

/** After mergeStatic, the landmarks standing near one another (in the same 250 m cell) that share a
 *  look are drawn as one mesh between them: a square of central Bath has a dozen set pieces, each
 *  made with its own copies of the same stone and glass. Only what mergeStatic would merge is
 *  touched, and nothing that lights up after dark, sees through, or does anything as it's drawn. */
export function mergeAcross(scene: THREE.Object3D, roots: THREE.Object3D[]) {
  const groups = new Map<string, THREE.Mesh[]>();
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (o.constructor as unknown) !== THREE.Mesh || Array.isArray(m.material) || !m.material) return;
      if (o.name || Object.keys(o.userData).length || o.children.length || !o.visible) return;
      if (o.onBeforeRender !== plainBefore || o.onAfterRender !== plainAfter || o.renderOrder || !o.frustumCulled || o.layers.mask !== 1) return;
      for (let p = o.parent; p && p !== scene; p = p.parent) if (p.name || Object.keys(p.userData ?? {}).length || !p.visible) return;
      const look = lookKey(m.material);
      if (!look) return;
      const g = m.geometry;
      g.boundingSphere ?? g.computeBoundingSphere();
      const c = g.boundingSphere!.center.clone().applyMatrix4(o.matrixWorld);
      const k = `${Math.floor(c.x / 250)},${Math.floor(c.z / 250)}|${+o.castShadow}${+o.receiveShadow}|${look}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(m);
    });
  }
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const mat = meshes[0].material as THREE.MeshLambertMaterial;
    const usesUv = !!(mat.map || mat.alphaMap || (mat as THREE.MeshLambertMaterial).lightMap || (mat as THREE.MeshLambertMaterial).aoMap || (mat as THREE.MeshLambertMaterial).specularMap);
    const geos = meshes.map((m) => {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!(name === "position" || name === "normal" || (name === "uv" && usesUv) || (name === "color" && mat.vertexColors))) g.deleteAttribute(name);
      g.morphAttributes = {};
      if (!g.attributes.normal) g.computeVertexNormals();
      if (usesUv && !g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.clearGroups();
      return g.applyMatrix4(m.matrixWorld);
    });
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = meshes[0].castShadow; mesh.receiveShadow = meshes[0].receiveShadow;
    mesh.userData.kind = kindOf(meshes[0]);   // set piece or landmark, for the drone's "what's what" (kinds.ts)
    for (const m of meshes) m.removeFromParent();
    scene.add(mesh);
  }
  // (a landmark whose every part went into the shared meshes leaves nothing behind)
  for (const root of roots) {
    const bare = (o: THREE.Object3D): boolean => !o.children.length && !(o as THREE.Mesh).isMesh && !(o as THREE.Light).isLight && o.type !== "Sprite";
    const prune = (o: THREE.Object3D) => { for (const c of [...o.children]) prune(c); if (bare(o) && !o.name && !Object.keys(o.userData).length) o.removeFromParent(); };
    prune(root);
  }
}

/** A pointed (Gothic) arch's outline, w wide, springing at y0 and rising rise to its point,
 *  added to path p from its left foot to its right one. */
export function pointedArch(p: THREE.Path, x: number, y0: number, w: number, rise: number) {
  const r = (w * w / 4 + rise * rise) / w;   // the two arcs' radius, centred on the springing line
  const a = Math.atan2(rise, r - w / 2);
  p.absarc(x - w / 2 + r, y0, r, Math.PI, Math.PI - a, true);
  p.absarc(x + w / 2 - r, y0, r, a, 0, true);
}

/** A rounded (segmental, or with rise w/2, semicircular) arch's outline, from left to right. */
export function roundArch(p: THREE.Path, x: number, y0: number, w: number, rise: number) {
  const r = (w * w / 4 + rise * rise) / (2 * rise), cy = y0 + rise - r, a = Math.asin(Math.min(1, w / 2 / r));
  p.absarc(x, cy, r, Math.PI / 2 + a, Math.PI / 2 - a, true);
}

// ---- materials --------------------------------------------------------------------------------

const lam = (o: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(o);
const cache = new Map<string, THREE.Texture>();
const once = (k: string, make: () => THREE.Texture) => cache.get(k) ?? cache.set(k, make()).get(k)!;

/** How dark it is, looked up a few times a second. */
let nightAt = -1e9, nightWas = 0;
export function night(): number {
  const t = performance.now();
  if (t - nightAt > 300) { nightAt = t; nightWas = nightNow(); }
  return nightWas;
}

/** Light a mesh's glow by the time of day: day by day, dark after dark. */
export function glow(mesh: THREE.Object3D, mat: THREE.MeshLambertMaterial, day: number, dark: number) {
  mesh.traverse((o) => {
    if ((o as THREE.Mesh).material !== mat) return;
    o.onBeforeRender = () => { mat.emissiveIntensity = day + (dark - day) * night(); };
  });
}

/** Bath stone, honey-coloured; shade for the darker, weathered parts. */
export function stone(tint = "#e9d6aa") { return lam({ map: once("stone", () => TX.wall("stone", false)), color: tint }); }
/** Bath stone with Georgian sash windows, one to a bay of 3.4 m by a storey, lit after dark. */
export function georgian(tint = "#ecdcb4") {
  return lam({ map: once("geo", () => TX.wall("stone", true)), color: tint, emissiveMap: once("geoGlow", () => TX.windowGlow("stone")), emissive: "#ffffff", emissiveIntensity: 0 });
}
export const plain = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => lam({ color, ...extra });
export function slate() { return lam({ map: once("slate", () => TX.roofTiles()), color: "#6a6f78" }); }

/** Gothic tracery windows: outside (dark glass with stone mullions, lit warm after dark) and
 *  inside (stained glass, glowing with the day). square: square-headed, like the Abbey's east window.
 *  stained: a church's, seen from outside: cat angels in each light (stainedglass.ts), glowing in
 *  their own colours after dark. */
export function gothicGlass(inside: boolean, square = false, lights = 5, stained = false) {
  const k = `${inside ? "in" : stained ? "sg" : "out"}${square ? "sq" : "pt"}${lights}`;
  const map = once(k, () => gothicTex(inside, square, lights, false, stained));
  const em = once(k + "g", () => gothicTex(inside, square, lights, true, stained));
  return lam({ map, emissiveMap: em, emissive: "#ffffff", emissiveIntensity: 0, alphaTest: 0.5 });
}

function gothicTex(inside: boolean, square: boolean, lights: number, lit: boolean, stained = false): THREE.Texture {
  const W = 128, H = 256, [c, g] = TX.canvas(W, H), r = TX.rng(lights * 7 + (square ? 3 : 0) + (inside ? 11 : 0));
  // the opening: a pointed arch over a tall rectangle, or square-headed
  const outline = (inset: number) => {
    g.beginPath();
    const x0 = inset, x1 = W - inset, top = square ? inset : W * 0.7;
    g.moveTo(x0, H);
    g.lineTo(x0, top);
    if (square) g.lineTo(x1, top);
    else {
      const w = x1 - x0, rise = W * 0.6 - inset, R = (w * w / 4 + rise * rise) / w;
      const ay = top, cxL = x0 + R, cxR = x1 - R;
      g.arc(cxL, ay, R, Math.PI, Math.PI + Math.atan2(rise, R - w / 2), false);
      g.arc(cxR, ay, R, -Math.atan2(rise, R - w / 2), 0, false);
    }
    g.lineTo(x1, H);
    g.closePath();
  };
  const sill = H;
  // the stone surround
  outline(0);
  g.fillStyle = lit ? "#000" : "#cdb688"; g.fill();
  // the glass
  outline(9);
  if (stained) {
    // drawn big, so the cats survive the shrink to the game's texels
    const S = 4, [bc, bg] = TX.canvas(W * S, H * S);
    bg.scale(S, S);
    for (let k = 0; k < lights; k++) paintLight(bg, 9 + ((W - 18) * k) / lights, 0, (W - 18) / lights, H, k + lights);
    g.save(); g.clip(); g.drawImage(bc, 0, 0, W, H);
    if (!lit) { g.fillStyle = "rgba(20,24,40,0.25)"; g.fillRect(0, 0, W, H); }
    g.restore();
  } else if (lit) {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, inside ? "#fff" : "#ffd79a"); grd.addColorStop(1, inside ? "#fff" : "#e09a4a");
    g.fillStyle = grd; g.fill();
    if (inside) {
      g.save(); g.clip();
      // the stained glass glows in its own colours
      for (let y = 0; y < sill; y += 10) for (let x = 0; x < W; x += 10) {
        const hue = [210, 0, 45, 120, 280, 30][Math.floor(r() * 6)];
        g.fillStyle = `hsl(${hue},75%,${45 + r() * 25}%)`; g.fillRect(x, y, 10, 10);
      }
      g.restore();
    }
  } else if (inside) {
    g.save(); g.clip();
    // stained glass: little panes of colour, with figures in the middle band
    for (let y = 0; y < sill; y += 8) for (let x = 0; x < W; x += 8) {
      const hue = [215, 0, 45, 130, 275, 25][Math.floor(r() * 6)];
      g.fillStyle = `hsl(${hue},65%,${30 + r() * 30}%)`; g.fillRect(x, y, 8, 8);
    }
    for (let k = 0; k < lights; k++) {
      const cx = 9 + ((W - 18) * (k + 0.5)) / lights;
      g.fillStyle = "rgba(255,235,200,0.55)";
      g.fillRect(cx - 4, H * 0.55, 8, 26); g.beginPath(); g.arc(cx, H * 0.55 - 4, 4, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  } else {
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, "#4a5866"); grd.addColorStop(0.5, "#27333d"); grd.addColorStop(1, "#56677a");
    g.fillStyle = grd; g.fill();
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.06})`; g.fillRect(r() * W, r() * H, 3, 3); }
  }
  // mullions, transoms and tracery in stone (black on the glow map)
  g.save(); outline(9); g.clip();
  g.fillStyle = lit ? "#000" : inside ? "#3b3326" : "#c9b285";
  const top = square ? 9 : W * 0.7;
  for (let k = 1; k < lights; k++) g.fillRect(9 + ((W - 18) * k) / lights - 2, top - (square ? 0 : W * 0.35), 4, H);
  if (!stained) for (const f of [0.55, 0.78]) g.fillRect(0, H * f, W, 4);
  if (!square) {
    // tracery: the mullions curve up into the head, and a row of little cusped heads under it
    g.lineWidth = 4; g.strokeStyle = g.fillStyle;
    for (let k = 0; k < lights; k++) {
      const x0 = 9 + ((W - 18) * k) / lights, x1 = 9 + ((W - 18) * (k + 1)) / lights;
      g.beginPath(); g.arc((x0 + x1) / 2, top + 6, (x1 - x0) / 2, Math.PI, 0); g.stroke();
    }
    g.beginPath(); g.arc(W / 2, top - 6, W * 0.16, 0, Math.PI * 2); g.stroke();
  } else for (let k = 0; k < lights; k++) {
    const x0 = 9 + ((W - 18) * k) / lights, x1 = 9 + ((W - 18) * (k + 1)) / lights;
    g.lineWidth = 3; g.strokeStyle = g.fillStyle;
    g.beginPath(); g.arc((x0 + x1) / 2, 30, (x1 - x0) / 2, Math.PI, 0); g.stroke();
  }
  g.restore();
  const t = stained ? TX.pixelTex(c, W, H, 32, 31, true) : TX.pixelTex(c, 64, 128, inside && !lit ? 40 : 24, 31, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Round-headed Georgian windows, tall (the Pump Room's), cut out of the wall around them. */
export function archedGlass() {
  const map = once("arched", () => archedTex(false)), em = once("archedg", () => archedTex(true));
  return lam({ map, emissiveMap: em, emissive: "#ffffff", emissiveIntensity: 0, alphaTest: 0.5 });
}

function archedTex(lit: boolean): THREE.Texture {
  const W = 64, H = 160, [c, g] = TX.canvas(W, H);
  const shape = (i: number) => { g.beginPath(); g.moveTo(i, H); g.lineTo(i, W / 2); g.arc(W / 2, W / 2, W / 2 - i, Math.PI, 0); g.lineTo(W - i, H); g.closePath(); };
  shape(0); g.fillStyle = lit ? "#000" : "#e9dcc0"; g.fill();
  shape(5);
  if (lit) { g.fillStyle = "#ffcf8a"; g.fill(); }
  else { const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, "#3f4d5a"); grd.addColorStop(1, "#22303b"); g.fillStyle = grd; g.fill(); }
  g.save(); shape(5); g.clip();
  g.fillStyle = lit ? "#000" : "#efe9dc";
  for (let x = W / 3; x < W - 1; x += W / 3) g.fillRect(x - 1.5, 0, 3, H);
  for (let y = W / 2; y < H; y += 22) g.fillRect(0, y, W, 3);
  g.lineWidth = 3; g.strokeStyle = g.fillStyle; g.beginPath(); g.arc(W / 2, W / 2, 12, Math.PI, 0); g.stroke();
  g.restore();
  const t = TX.pixelTex(c, 32, 80, 24, 5, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Channelled rustication: Bath stone in deep horizontal courses, for a ground floor; one repeat
 *  is the texture's tile (3 m), seven courses. */
export function rustic(tint = "#e2cfa3") {
  return lam({ color: tint, map: once("rustic", () => {
    const S = 256, [c, g] = TX.canvas(S, S), r = TX.rng(23);
    const course = S / 7;
    for (let k = 0; k < 7; k++) {
      let x = -(k % 2) * 40;
      while (x < S) { const w = 70 + r() * 30, l = 220 + r() * 28; g.fillStyle = `rgb(${l},${l - 9},${l - 30})`; g.fillRect(x, k * course, w, course); x += w; g.fillStyle = "rgba(90,70,40,0.45)"; g.fillRect(x - 1, k * course, 2, course); }
      g.fillStyle = "#6f5d42"; g.fillRect(0, k * course + course - 6, S, 4);
      g.fillStyle = "rgba(255,248,230,0.5)"; g.fillRect(0, k * course + course - 2, S, 2);
    }
    return TX.pixelTex(c, 96, 96, 20, 29);
  }) });
}

/** Georgian sash windows, six panes over six, in a pale frame. */
export function sashGlass() {
  const map = once("sash", () => sashTex(false)), em = once("sashg", () => sashTex(true));
  return lam({ map, emissiveMap: em, emissive: "#ffffff", emissiveIntensity: 0 });
}

function sashTex(lit: boolean): THREE.Texture {
  const W = 64, H = 112, [c, g] = TX.canvas(W, H);
  g.fillStyle = lit ? "#000" : "#efe9dc"; g.fillRect(0, 0, W, H);
  if (lit) g.fillStyle = "#ffcf8a";
  else { const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, "#44525f"); grd.addColorStop(0.6, "#232f39"); grd.addColorStop(1, "#4a5b6b"); g.fillStyle = grd; }
  g.fillRect(5, 5, W - 10, H - 10);
  g.fillStyle = lit ? "#000" : "#efe9dc";
  g.fillRect(0, H / 2 - 3, W, 6);
  for (const x of [W / 3, (2 * W) / 3]) g.fillRect(x - 1.5, 0, 3, H);
  for (const y of [H / 4, (3 * H) / 4]) g.fillRect(0, y - 1.5, W, 3);
  return TX.pixelTex(c, 32, 56, 20, 3);
}

/** A Perpendicular fan vault, one bay a repeat: a fan from each corner and a boss in the middle. */
export function fanVault() {
  return lam({ map: once("fan", () => {
    const S = 256, [c, g] = TX.canvas(S, S);
    g.fillStyle = "#e8dcc2"; g.fillRect(0, 0, S, S);
    for (const [cx, cy] of [[0, 0], [S, 0], [0, S], [S, S]]) {
      const R = S * 0.5;
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, R);
      grd.addColorStop(0, "#f2e8d2"); grd.addColorStop(0.92, "#dccdab"); grd.addColorStop(1, "#c6b48c");
      g.fillStyle = grd; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#a99470"; g.lineWidth = 2;
      for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke(); }
      for (const f of [0.35, 0.55, 0.75, 0.97]) { g.beginPath(); g.arc(cx, cy, R * f, 0, Math.PI * 2); g.stroke(); }
      // cusped panels round the rim
      for (let k = 0; k < 24; k++) { const a = ((k + 0.5) / 24) * Math.PI * 2; g.beginPath(); g.arc(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86, 4, 0, Math.PI * 2); g.stroke(); }
    }
    g.fillStyle = "#b38f45"; g.beginPath(); g.arc(S / 2, S / 2, 9, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#a99470"; g.lineWidth = 2; g.beginPath(); g.arc(S / 2, S / 2, 22, 0, Math.PI * 2); g.stroke();
    return TX.pixelTex(c, 128, 128, 22, 13);
  }) });
}

/** Worn flagstones, a slab or so a metre. */
export function flags() {
  return lam({ color: "#d8d2c4", map: once("flags", () => {
    const S = 256, [c, g] = TX.canvas(S, S), r = TX.rng(41);
    g.fillStyle = "#8d877a"; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 64) {
      let x = -r() * 40;
      while (x < S) { const w = 50 + r() * 40, l = 175 + r() * 50; g.fillStyle = `rgb(${l},${l - 6},${l - 18})`; g.fillRect(x + 2, y + 2, w - 3, 61); x += w; }
    }
    return TX.pixelTex(c, 96, 96, 20, 17);
  }) });
}

/** An openwork parapet: a band of stone pierced with cusped openings, cut out. */
export function openwork() {
  return lam({ color: "#e9d6aa", side: THREE.DoubleSide, alphaTest: 0.5, map: once("openwork", () => {
    const W = 128, H = 64, [c, g] = TX.canvas(W, H);
    g.fillStyle = "#d9c495"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#b9a273"; g.fillRect(0, 0, W, 8); g.fillRect(0, H - 6, W, 6);
    g.globalCompositeOperation = "destination-out";
    for (let k = 0; k < 4; k++) {
      const cx = 16 + k * 32, cy = 34;
      for (const [dx, dy] of [[0, -8], [8, 0], [0, 8], [-8, 0]]) { g.beginPath(); g.arc(cx + dx, cy + dy, 7, 0, Math.PI * 2); g.fill(); }
    }
    const t = TX.pixelTex(c, 64, 32, 16, 9, true);
    return t;
  }) });
}

/** A balustrade: a row of turned balusters between a plinth and a handrail, cut out; one
 *  repeat is 1.6 m along. */
export function balusters(tint = "#e3cfa2") {
  return lam({ color: tint, side: THREE.DoubleSide, alphaTest: 0.5, map: once("balusters", () => {
    const W = 128, H = 64, [c, g] = TX.canvas(W, H);
    g.fillStyle = "#d6c194";
    g.fillRect(0, 0, W, 10); g.fillRect(0, H - 9, W, 9);
    for (let k = 0; k < 6; k++) {
      const cx = 11 + k * 21.3;
      g.beginPath();
      g.moveTo(cx - 3, 10); g.lineTo(cx + 3, 10);
      g.quadraticCurveTo(cx + 9, 36, cx + 4, H - 9); g.lineTo(cx - 4, H - 9);
      g.quadraticCurveTo(cx - 9, 36, cx - 3, 10);
      g.fill();
    }
    g.fillStyle = "#b9a272"; g.fillRect(0, 8, W, 2); g.fillRect(0, H - 9, W, 2);
    return TX.pixelTex(c, 64, 32, 16, 19, true);
  }) });
}

/** Lettering, gold or dark, on its own canvas: a frieze or a sign. */
export function lettering(text: string, opts: { w?: number; h?: number; bg?: string; ink?: string; font?: string } = {}) {
  const k = `txt:${text}:${opts.bg}:${opts.ink}`;
  return lam({ map: once(k, () => {
    const W = opts.w ?? 512, H = opts.h ?? 64, [c, g] = TX.canvas(W, H);
    g.fillStyle = opts.bg ?? "#d8c59a"; g.fillRect(0, 0, W, H);
    g.fillStyle = opts.ink ?? "#5d4c33";
    g.font = opts.font ?? `bold ${Math.round(H * 0.62)}px Georgia, serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, W / 2, H / 2 + 2, W - 16);
    return TX.tex(c);
  }) });
}

/** A standing figure in robes on a little plinth, about 2 m tall: an emperor on the Great Bath's
 *  terrace, or with wings, an angel on the Abbey's ladders. Its middle foot at the origin. */
export function figure(wings = false, scale = 1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const put = (g: THREE.BufferGeometry, x: number, y: number, z: number, rz = 0) => { g.rotateZ(rz); g.translate(x, y, z); parts.push(g.index ? g.toNonIndexed() : g); };
  put(new THREE.BoxGeometry(0.7, 0.3, 0.6), 0, 0.15, 0);                          // plinth
  put(new THREE.CylinderGeometry(0.17, 0.3, 1.25, 7), 0, 0.92, 0);                 // robes
  put(new THREE.CylinderGeometry(0.2, 0.17, 0.3, 7), 0, 1.68, 0);                  // shoulders
  put(new THREE.SphereGeometry(0.13, 7, 5), 0, 1.97, 0);                           // head
  put(new THREE.BoxGeometry(0.1, 0.55, 0.1), 0.24, 1.55, 0.05, -0.5);              // an arm raised
  if (wings) for (const s of [-1, 1]) put(new THREE.BoxGeometry(0.06, 0.8, 0.45), s * 0.2, 1.6, -0.25, s * 0.35);
  for (const g of parts) for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
  const g = mergeGeometries(parts)!;
  g.scale(scale, scale, scale);
  return g;
}
