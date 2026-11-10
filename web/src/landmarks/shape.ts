// A set piece's solid shape, taken from its own model (landmarks/setpieces.ts), so what you bump
// into and stand on is always what's drawn: nothing to keep in step by hand.
// - Everything facing up that isn't too steep to stand on (floors, steps, terraces, roofs,
//   cornices, the tops of walls) is a surface to stand on: gathered onto a grid half a metre
//   square in the set piece's frame, each square keeping every height drawn over it, so you can
//   stand on a terrace or walk on the floor under it, and for each which of a 4 x 4 pattern of
//   points across the square it covers, so you stand on it right up to its edge and no more than
//   an eighth of a metre past it.
// - Everything steeper is a wall, from its foot to its top: you walk under one whose foot is over
//   your head (a terrace's edge, a lintel), and step or vault over a low one as anywhere else.
// - Anything drawn with a material marked ghost (materials' userData.ghost: water, steam) is left out.
// The model is built once per set piece (and its builder's args), then shared by every square of
// the map it reaches into (map.ts). Nothing here goes over the network.
import * as THREE from "three";

/** A surface is anything facing up at least this much (cos of its slope: 60 degrees). */
const UP = 0.5;
/** The grid's squares, metres. */
export const STEP = 0.5;
/** The points across a grid square looked at, in each direction. */
const SUB = 4, FULL = (1 << (SUB * SUB)) - 1;
const TOP = 6;   // numbers to each height in a square: height, points, slope along x and z, lowest, highest

export interface Shape {
  /** The surfaces: for each grid square (i, j: x and z over STEP, keyed i + j * 65536 after
   *  OFF), the heights drawn over it, lowest first (their planes' heights over the square's
   *  middle), each followed by which of the square's SUB x SUB points it covers (bit u + SUB * v),
   *  how it slopes (rise per metre along x and z) and the lowest and highest it goes, so a roof's
   *  slope is smooth underfoot. */
  tops: Map<number, Float32Array>;
  /** The walls: ax, az, bx, bz, foot, top, six numbers each. */
  walls: Float32Array;
  /** Its extent in its frame: x0, x1, z0, z1. */
  box: [number, number, number, number];
}

export const OFF = 32768;
export const cellKey = (i: number, j: number) => i + OFF + (j + OFF) * 65536;

/** The solid shape of a set piece's model, built in its own frame (at the origin, unturned): a
 *  job that yields every so often, so working it out never holds up a frame for long. */
export function* shapeOf(obj: THREE.Object3D): Generator<void, Shape> {
  obj.updateMatrixWorld(true);
  // A slice is over when it has had about this long: counting triangles alone lets one dense set
  // piece (the Abbey, the Roman Baths) run for 25 ms or more in a single frame, which is a stutter
  // as a square goes up. The caller sets __shapeSlice; with none set, the counter alone decides.
  const slice = (globalThis as any).__shapeSlice as number | undefined;
  let sliceAt = performance.now() + (slice ?? Infinity);
  /** Whether to yield now: by the clock when the caller asked for that, else on the triangle count. */
  const due = (count: boolean) => {
    if (slice === undefined) return count;
    if (performance.now() < sliceAt) return false;
    sliceAt = performance.now() + slice;
    return true;
  };
  // How many triangles go by before the clock is looked at again. With a deadline set it is a small
  // number, so a slice can't run long however dense the set piece is; without one it is the old
  // count, so this behaves for every other caller exactly as it did before.
  const stride = slice === undefined ? 20000 : 256;
  const tops = new Map<number, number[]>();
  let cost = 0;   // work done since the last yield: triangles, and grid squares looked at
  const walls = new Map<string, number[][]>();
  const box: [number, number, number, number] = [Infinity, -Infinity, Infinity, -Infinity];
  const M = new THREE.Matrix4(), I = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    const e1x = b.x - a.x, e1y = b.y - a.y, e1z = b.z - a.z, e2x = c.x - a.x, e2y = c.y - a.y, e2z = c.z - a.z;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x, nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-9) return;
    box[0] = Math.min(box[0], a.x, b.x, c.x); box[1] = Math.max(box[1], a.x, b.x, c.x);
    box[2] = Math.min(box[2], a.z, b.z, c.z); box[3] = Math.max(box[3], a.z, b.z, c.z);
    if (Math.abs(ny) / nl >= UP) surface(a, b, c);
    else wall(a, b, c);
  };
  // a surface: onto every grid square it covers any of, at its height over the middle of that
  // square (kept within its own heights) and with its slope, so a narrow step still lands on the
  // grid and a sloping roof is a slope rather than a stair
  const surface = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    if (Math.abs(d) < 1e-9) return;
    const lo = Math.min(a.y, b.y, c.y), hi = Math.max(a.y, b.y, c.y);
    // barycentric weights as planes: w1 = p1 x + q1 z + r1, w2 likewise, w3 = 1 - w1 - w2
    const p1 = (b.z - c.z) / d, q1 = (c.x - b.x) / d, r1 = -(p1 * c.x + q1 * c.z);
    const p2 = (c.z - a.z) / d, q2 = (a.x - c.x) / d, r2 = -(p2 * c.x + q2 * c.z);
    const E = -1e-6;
    const gx = p1 * a.y + p2 * b.y - (p1 + p2) * c.y, gz = q1 * a.y + q2 * b.y - (q1 + q2) * c.y;
    const inside = (x: number, z: number) => {
      const w1 = p1 * x + q1 * z + r1, w2 = p2 * x + q2 * z + r2;
      return w1 >= E && w2 >= E && 1 - w1 - w2 >= E;
    };
    const minX = Math.min(a.x, b.x, c.x), maxX = Math.max(a.x, b.x, c.x), minZ = Math.min(a.z, b.z, c.z), maxZ = Math.max(a.z, b.z, c.z);
    // whether the triangle touches the little square of half-width H round a point: within its
    // extent, and not wholly outside any of its three edges
    const H = STEP / SUB / 2, s1 = H * (Math.abs(p1) + Math.abs(q1)), s2 = H * (Math.abs(p2) + Math.abs(q2)), s3 = H * (Math.abs(p1 + p2) + Math.abs(q1 + q2));
    const touches = (x: number, z: number) => {
      if (x + H < minX || x - H > maxX || z + H < minZ || z - H > maxZ) return false;
      const w1 = p1 * x + q1 * z + r1, w2 = p2 * x + q2 * z + r2;
      return w1 >= -s1 && w2 >= -s2 && 1 - w1 - w2 >= -s3;
    };
    const i0 = Math.floor(minX / STEP), i1 = Math.floor(maxX / STEP), j0 = Math.floor(minZ / STEP), j1 = Math.floor(maxZ / STEP);
    cost += 4 * (i1 - i0 + 1) * (j1 - j0 + 1);   // a small triangle may have a corner inside a square without touching its corners
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const x0 = i * STEP, z0 = j * STEP, mx = x0 + STEP / 2, mz = z0 + STEP / 2;
      // which of the square's points the triangle reaches (any of the little square round each), so
      // a step or a ledge narrower than the points' spacing still shows, and an edge is never missed
      let mask = 0;
      if (inside(x0, z0) && inside(x0 + STEP, z0) && inside(x0, z0 + STEP) && inside(x0 + STEP, z0 + STEP)) mask = FULL;   // all of it
      else for (let u = 0; u < SUB; u++) for (let v = 0; v < SUB; v++) if (touches(x0 + (u + 0.5) * (STEP / SUB), z0 + (v + 0.5) * (STEP / SUB))) mask |= 1 << (u + SUB * v);
      if (!mask) continue;
      const w1 = p1 * mx + q1 * mz + r1, w2 = p2 * mx + q2 * mz + r2;
      // (its plane's height over the middle, which may be off the triangle: kept within lo and hi where it's used)
      const h = w1 * a.y + w2 * b.y + (1 - w1 - w2) * c.y;
      const k = cellKey(i, j);
      const L = tops.get(k);
      if (L) L.push(h, mask, gx, gz, lo, hi); else tops.set(k, [h, mask, gx, gz, lo, hi]);
    }
  };
  // a wall: the line its foot runs along (seen from above, the two corners furthest apart), from its lowest to its highest
  const wall = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    const P = [a, b, c];
    let best = -1, p = a, q = b;
    for (let m = 0; m < 3; m++) for (let n = m + 1; n < 3; n++) {
      const l = Math.hypot(P[m].x - P[n].x, P[m].z - P[n].z);
      if (l > best) { best = l; p = P[m]; q = P[n]; }
    }
    if (best < 0.05) return;
    if (Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y) < 0.05) return;
    const [u, v] = p.x < q.x || (p.x === q.x && p.z < q.z) ? [p, q] : [q, p];
    // where each corner is along the line, and how high the triangle reaches at a point along it
    const L = Math.hypot(v.x - u.x, v.z - u.z), at = P.map((o) => ((o.x - u.x) * (v.x - u.x) + (o.z - u.z) * (v.z - u.z)) / L);
    const ys = (t: number) => {
      const out: number[] = [];
      for (let m = 0; m < 3; m++) {
        const n = (m + 1) % 3, t0 = at[m], t1 = at[n];
        if (Math.abs(t1 - t0) < 1e-6) { if (Math.abs(t - t0) < 1e-3) out.push(P[m].y, P[n].y); continue; }
        const f = (t - t0) / (t1 - t0);
        if (f >= -1e-6 && f <= 1 + 1e-6) out.push(P[m].y + (P[n].y - P[m].y) * f);
      }
      return out;
    };
    // half of an upright rectangle (two corners one above the other, the third level with one of
    // them) stands as tall all along; any other shape (a gable over a door, say) is only as tall, at
    // each stretch along it, as it really is there, so a doorway under a gable stays open
    let half = false;
    for (let m = 0; m < 3; m++) {
      const n = (m + 1) % 3, o = (m + 2) % 3;
      if (Math.abs(at[m] - at[n]) < 1e-3 && (Math.abs(P[o].y - P[m].y) < 1e-3 || Math.abs(P[o].y - P[n].y) < 1e-3)) half = true;
    }
    const pieces = half ? 1 : Math.ceil(L / 1.0);
    for (let i = 0; i < pieces; i++) {
      const t0 = (L * i) / pieces, t1 = (L * (i + 1)) / pieces;
      const h = [...ys(t0), ...ys(t1), ...P.filter((_, m) => at[m] > t0 && at[m] < t1).map((o) => o.y)];
      if (!h.length) continue;
      const foot = Math.min(...h), top = Math.max(...h);
      if (top - foot < 0.05) continue;
      const w0 = { x: u.x + ((v.x - u.x) * t0) / L, z: u.z + ((v.z - u.z) * t0) / L }, w1 = { x: u.x + ((v.x - u.x) * t1) / L, z: u.z + ((v.z - u.z) * t1) / L };
      addWall(w0, w1, foot, top);
    }
  };
  // the two triangles of a quad give the same line: keep it once, as tall as both (but two walls
  // on one line with clear air between, like stones one above another, stay two)
  const addWall = (u: { x: number; z: number }, v: { x: number; z: number }, foot: number, top: number) => {
    const r = (n: number) => Math.round(n * 20);
    const k = `${r(u.x)},${r(u.z)},${r(v.x)},${r(v.z)}`;
    const ws = walls.get(k) ?? [];
    const w = ws.find((w) => w[4] <= top + 0.05 && w[5] >= foot - 0.05);
    if (w) { w[4] = Math.min(w[4], foot); w[5] = Math.max(w[5], top); }
    else { ws.push([u.x, u.z, v.x, v.z, foot, top]); walls.set(k, ws); }
  };

  const meshes: THREE.Mesh[] = [];
  obj.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible) meshes.push(o as THREE.Mesh); });
  for (const mesh of meshes) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (mats.every((m) => m?.userData?.ghost)) continue;
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) continue;
    const idx = mesh.geometry.index, nt = (idx ? idx.count : pos.count) / 3;
    const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
    for (let q = 0; q < (inst ? inst.count : 1); q++) {
      if (inst) { inst.getMatrixAt(q, I); M.multiplyMatrices(mesh.matrixWorld, I); } else M.copy(mesh.matrixWorld);
      for (let t = 0; t < nt; t++) {
        const ia = idx ? idx.getX(3 * t) : 3 * t, ib = idx ? idx.getX(3 * t + 1) : 3 * t + 1, ic = idx ? idx.getX(3 * t + 2) : 3 * t + 2;
        a.fromBufferAttribute(pos, ia).applyMatrix4(M); b.fromBufferAttribute(pos, ib).applyMatrix4(M); c.fromBufferAttribute(pos, ic).applyMatrix4(M);
        tri(a, b, c);
        if (++cost > stride) { cost = 0; if (due(true)) yield; }
      }
    }
  }

  yield;
  // each square's heights, lowest first, any within 10 cm of each other and sloping the same way
  // kept as one (the higher, covering the points either covers)
  const out = new Map<number, Float32Array>();
  for (const [k, L] of tops) {
    if (++cost > 2500) { cost = 0; if (due(true)) yield; }
    const hs: number[][] = [];
    for (let n = 0; n < L.length; n += TOP) hs.push(L.slice(n, n + TOP));
    hs.sort((p, q) => p[0] - q[0]);
    const keep: number[] = [];
    for (const e of hs) {
      const last = keep.length - TOP;
      if (last >= 0 && e[0] - keep[last] < 0.1 && Math.abs(e[2] - keep[last + 2]) < 0.05 && Math.abs(e[3] - keep[last + 3]) < 0.05) {
        keep[last] = e[0]; keep[last + 1] |= e[1];
        keep[last + 4] = Math.min(keep[last + 4], e[4]); keep[last + 5] = Math.max(keep[last + 5], e[5]);
      } else keep.push(...e);
    }
    out.set(k, Float32Array.from(keep));
  }
  const all = [...walls.values()].flat();
  const W = new Float32Array(all.length * 6);
  let n = 0;
  for (const w of all) { W.set(w, n); n += 6; }
  return { tops: out, walls: W, box };
}

/** Whether a shape has a surface to stand on at x, z in its frame (offset by y0) between lo and hi. */
export function surfaceBetween(s: Shape, x: number, z: number, y0: number, lo: number, hi: number): boolean {
  const i = Math.floor(x / STEP), j = Math.floor(z / STEP), L = s.tops.get(cellKey(i, j));
  if (!L) return false;
  const fx = x - i * STEP, fz = z - j * STEP;
  const u = Math.min(SUB - 1, Math.floor((fx / STEP) * SUB)), v = Math.min(SUB - 1, Math.floor((fz / STEP) * SUB)), bit = 1 << (u + SUB * v);
  for (let n = 0; n < L.length; n += TOP) {
    if (!(L[n + 1] & bit)) continue;
    const h = y0 + Math.max(L[n + 4], Math.min(L[n + 5], L[n] + L[n + 2] * (fx - STEP / 2) + L[n + 3] * (fz - STEP / 2)));
    if (h >= lo && h <= hi) return true;
  }
  return false;
}

/** The highest surface of a shape at x, z in its frame (offset by y0) that's above g and no more
 *  than a step above feet at y; or g. */
export function standOn(s: Shape, x: number, z: number, y0: number, g: number, y: number): number {
  const i = Math.floor(x / STEP), j = Math.floor(z / STEP), L = s.tops.get(cellKey(i, j));
  if (!L) return g;
  const fx = x - i * STEP, fz = z - j * STEP;
  const u = Math.min(SUB - 1, Math.floor((fx / STEP) * SUB)), v = Math.min(SUB - 1, Math.floor((fz / STEP) * SUB)), bit = 1 << (u + SUB * v);
  let best = g;
  for (let n = 0; n < L.length; n += TOP) {
    if (!(L[n + 1] & bit)) continue;
    // the surface's height here, along its slope from the square's middle
    const h = y0 + Math.max(L[n + 4], Math.min(L[n + 5], L[n] + L[n + 2] * (fx - STEP / 2) + L[n + 3] * (fz - STEP / 2)));
    if (h <= y + 0.5 && h > best) best = h;
  }
  return best;
}
