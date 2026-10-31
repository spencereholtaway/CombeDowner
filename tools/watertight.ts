// Holes in the railway as the game builds it (web/src/railway.ts), for tools/check_more.py's rule 19.
// It builds the railway with the game's own code and stands it on the squares' ground, then looks for
// two things:
//  - "falls": a walkable place on the track bed, a bridge or a platform where what you stand on
//    (the ground, or the railway's own floor) is well below what's drawn there, so you sink through it;
//  - "sky": from standing height on and beside the line, rays down and sideways that pass into the
//    railway's body (under its ballast, deck or platform, above the ground and above an arch's
//    opening) without meeting any face, so you'd see through it.
//
// Bundled and run from web/ (check_more.py pipes it to esbuild), so the imports are web/'s.
// Usage: node watertight.mjs <maps root> <map id>; prints one JSON list of findings.
import * as THREE from "three";
import { readFileSync, existsSync, readdirSync } from "fs";
import { Railway } from "./src/railway";
import { Wide } from "./src/wide";
import { bridgePlan, railNeed } from "./src/railbridge";

(globalThis as { __keepArrays?: boolean }).__keepArrays = true;
const [root, id] = process.argv.slice(2);
const load = (f: string) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);
const rail = load(`${root}/${id}-rail.json`);
if (!rail) { console.log("[]"); process.exit(0); }
const head = load(`${root}/${id}.json`) ?? {};
const wideData = load(`${root}/${id}-wide.json`);
const canal = load(`${root}/${id}-canal.json`);
const wide = wideData ? new Wide(wideData) : null;
const tracks: number[][][] = rail.tracks.map((t: { p: number[][] }) => t.p);
const need = railNeed(tracks, [...(head.rd ?? []), ...(wide?.rd ?? [])], [...(head.wl ?? []), ...(wide?.wl ?? [])],
  [...(head.wp ?? []), ...(wide?.wp ?? [])].map((w: { r: number[][][] }) => w.r[0]), canal?.runs ?? []);
const railway = new Railway(rail, new THREE.Scene(), 0, need);
const scene = (railway as unknown as { group: THREE.Group }).group;

// ---- the ground: each square's terrain, with its streets' faces over it (map.ts ground) ----------
type Square = { b: number[]; T: { nx: number; ny: number; x0: number; y0: number; dx: number; dy: number }; H: Float64Array; sf: Tris | null };
type Tris = { v: Float64Array; cells: Map<number, number[]>; C: number };
const key = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
function triGrid(v: Float64Array, C: number): Tris {
  const cells = new Map<number, number[]>();
  for (let t = 0; t < v.length / 9; t++) {
    const o = t * 9, xs = [v[o], v[o + 3], v[o + 6]], ys = [v[o + 1], v[o + 4], v[o + 7]];
    for (let i = Math.floor(Math.min(...xs) / C); i <= Math.floor(Math.max(...xs) / C); i++)
      for (let j = Math.floor(Math.min(...ys) / C); j <= Math.floor(Math.max(...ys) / C); j++) {
        const k = key(i, j);
        (cells.get(k) ?? cells.set(k, []).get(k)!).push(t);
      }
  }
  return { v, cells, C };
}
/** The height of the triangle under (x, y) in a flat-on-the-ground set (the streets' faces), or null. */
function under(tr: Tris, x: number, y: number): number | null {
  const v = tr.v;
  for (const t of tr.cells.get(key(Math.floor(x / tr.C), Math.floor(y / tr.C))) ?? []) {
    const o = t * 9, ax = v[o], ay = v[o + 1], bx = v[o + 3], by = v[o + 4], cx = v[o + 6], cy = v[o + 7];
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-9) continue;
    const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d, l3 = 1 - l1 - l2;
    if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) return l1 * v[o + 2] + l2 * v[o + 5] + l3 * v[o + 8];
  }
  return null;
}

let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
for (const p of tracks) for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
const squares: Square[] = [];
const dir = `${root}/${id}`;
for (const f of existsSync(dir) ? readdirSync(dir).filter((n) => /^-?\d+_-?\d+\.json$/.test(n)) : []) {
  const m = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
  if (!m.t || !m.b) continue;
  const [bx0, by0, bx1, by1] = m.b;
  if (bx1 < x0 - 50 || bx0 > x1 + 50 || by1 < y0 - 50 || by0 > y1 + 50) continue;
  if (!tracks.some((p) => p.some((q) => q[0] > bx0 - 30 && q[0] < bx1 + 30 && q[1] > by0 - 30 && q[1] < by1 + 30))) continue;
  const T = m.t, H = new Float64Array(T.h.length);
  for (let k = 0; k < H.length; k++) H[k] = T.h[k] / 10 + T.z0;
  let sf: Tris | null = null;
  if (m.sf?.o) {
    const raw: number[] = m.sf.v, v: number[] = [];
    let ax = 0, ay = 0, az = 0;
    const pts: number[][] = [];
    for (let k = 0; k < raw.length; k += 3) { ax += raw[k]; ay += raw[k + 1]; az += raw[k + 2]; pts.push([ax / 100 + m.sf.o[0], ay / 100 + m.sf.o[1], az / 100]); }
    for (const kind of ["road", "service", "pave", "path", "front", "drive", "grass", "dirt", "gravel"]) {
      let c = 0;
      for (const d of m.sf[kind] ?? []) { c += d; v.push(...pts[c]); }
    }
    if (v.length) sf = triGrid(Float64Array.from(v), 4);
  }
  squares.push({ b: m.b, T, H, sf });
}
const squareAt = (x: number, y: number) => squares.find((s) => x >= s.b[0] && x <= s.b[2] && y >= s.b[1] && y <= s.b[3]) ?? null;
/** The ground you stand on (map.ts ground: the streets' faces, else the terrain), or null off the squares. */
function ground(x: number, y: number): number | null {
  const s = squareAt(x, y);
  if (!s) return null;
  if (s.sf) { const h = under(s.sf, x, y); if (h !== null) return h; }
  const T = s.T, fi = (x - T.x0) / T.dx, fj = (y - T.y0) / T.dy;
  const i = Math.min(T.nx - 2, Math.max(0, Math.floor(fi))), j = Math.min(T.ny - 2, Math.max(0, Math.floor(fj)));
  const u = Math.min(1, Math.max(0, fi - i)), v = Math.min(1, Math.max(0, fj - j)), a = j * T.nx + i, n = T.nx, h = s.H;
  return u + v <= 1 ? h[a] + (h[a + 1] - h[a]) * u + (h[a + n] - h[a]) * v : h[a + n + 1] + (h[a + n] - h[a + n + 1]) * (1 - u) + (h[a + 1] - h[a + n + 1]) * (1 - v);
}

// ---- the railway as drawn: its triangles in data metres (x east, y north, z height) --------------
// (the faces you walk on, told by their colour: ballast, sleepers, rails and the platforms' paving
// and edge strips; a parapet's cap or a bridge's underside is no floor)
const WALK = ["#7b746a", "#4a3d31", "#c4c1ba", "#b5ada0", "#d9d3c6", "#c8a560", "#e9c41f"].map((h) => new THREE.Color(h));
const tv: number[] = [], wv: number[] = [];
scene.updateMatrixWorld(true);
scene.traverse((o) => {
  const m = o as THREE.Mesh;
  if (!m.isMesh || m.geometry.index || !m.geometry.getAttribute("color")) return;
  const p = m.geometry.getAttribute("position"), c = m.geometry.getAttribute("color"), w = new THREE.Vector3();
  for (let k = 0; k < p.count; k += 3) {
    const walk = WALK.some((h) => Math.abs(h.r - c.getX(k)) < 0.01 && Math.abs(h.g - c.getY(k)) < 0.01 && Math.abs(h.b - c.getZ(k)) < 0.01);
    for (let q = k; q < k + 3; q++) {
      w.fromBufferAttribute(p, q).applyMatrix4(m.matrixWorld);
      tv.push(w.x, -w.z, w.y);
      if (walk) wv.push(w.x, -w.z, w.y);
    }
  }
});
const RT = triGrid(Float64Array.from(tv), 3), WT = triGrid(Float64Array.from(wv), 3);

/** The highest drawn floor of the railway over (x, y) no higher than `cap`, or null. */
function top(x: number, y: number, cap: number): number | null {
  const v = WT.v;
  let best: number | null = null;
  for (const t of WT.cells.get(key(Math.floor(x / WT.C), Math.floor(y / WT.C))) ?? []) {
    const o = t * 9, ax = v[o], ay = v[o + 1], bx = v[o + 3], by = v[o + 4], cx = v[o + 6], cy = v[o + 7];
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-6) continue;
    const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d, l3 = 1 - l1 - l2;
    if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
    const h = l1 * v[o + 2] + l2 * v[o + 5] + l3 * v[o + 8];
    if (h <= cap && (best === null || h > best)) best = h;
  }
  return best;
}
/** Whether the segment from a to b crosses a drawn face of the railway. */
function crosses(a: number[], b: number[]): boolean {
  const v = RT.v, dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const seen = new Set<number>();
  for (const q of [a, b]) for (const t of RT.cells.get(key(Math.floor(q[0] / RT.C), Math.floor(q[1] / RT.C))) ?? []) {
    if (seen.has(t)) continue;
    seen.add(t);
    const o = t * 9;
    const e1x = v[o + 3] - v[o], e1y = v[o + 4] - v[o + 1], e1z = v[o + 5] - v[o + 2];
    const e2x = v[o + 6] - v[o], e2y = v[o + 7] - v[o + 1], e2z = v[o + 8] - v[o + 2];
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const sx = a[0] - v[o], sy = a[1] - v[o + 1], sz = a[2] - v[o + 2];
    const u = (sx * px + sy * py + sz * pz) / det;
    if (u < -1e-4 || u > 1 + 1e-4) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const w = (dx * qx + dy * qy + dz * qz) / det;
    if (w < -1e-4 || u + w > 1 + 1e-4) continue;
    const s = (e2x * qx + e2y * qy + e2z * qz) / det;
    if (s >= 0 && s <= 1) return true;
  }
  return false;
}

// ---- the railway's body: where it should be solid ------------------------------------------------
// Each track's bridges planned as railway.ts plans them (the same twin marks, in the same order),
// so an arch's opening is known to be open and everything else under the line is meant to be solid.
const twin = { piers: [] as number[][], ends: [] as number[][], girders: [] as number[][] };
const plans = tracks.map((p) => {
  const plan = bridgePlan(p, need, twin), m = plan.marks();
  twin.piers.push(...m.piers); twin.ends.push(...m.ends); twin.girders.push(...m.girders);
  return plan;
});
const segCells = new Map<number, number[][]>();
tracks.forEach((p, t) => {
  for (let k = 0; k + 1 < p.length; k++) {
    const a = p[k], b = p[k + 1];
    for (let i = Math.floor((Math.min(a[0], b[0]) - 3) / 8); i <= Math.floor((Math.max(a[0], b[0]) + 3) / 8); i++)
      for (let j = Math.floor((Math.min(a[1], b[1]) - 3) / 8); j <= Math.floor((Math.max(a[1], b[1]) + 3) / 8); j++) {
        const c = key(i, j);
        (segCells.get(c) ?? segCells.set(c, []).get(c)!).push([t, k]);
      }
  }
});
type Near = { t: number; k: number; off: number; s: number; z: number; flag: number };
function nearest(x: number, y: number): Near | null {
  let best: Near | null = null;
  for (const [t, k] of segCells.get(key(Math.floor(x / 8), Math.floor(y / 8))) ?? []) {
    const p = tracks[t], a = p[k], b = p[k + 1], vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1;
    const f = Math.min(1, Math.max(0, ((x - a[0]) * vx + (y - a[1]) * vy) / l2));
    const off = Math.hypot(x - a[0] - vx * f, y - a[1] - vy * f);
    if (best && off >= best.off) continue;
    const flag = a[3] === b[3] ? a[3] : f < 0.5 ? a[3] : b[3];
    best = { t, k, off, s: plans[t].s[k] + f * Math.sqrt(l2), z: a[2] + (b[2] - a[2]) * f, flag };
  }
  return best;
}
const platRings: { r: number[][]; z: number; box: number[] }[] = rail.platforms.map((p: { r: number[][]; z: number }) => {
  const xs = p.r.map((q) => q[0]), ys = p.r.map((q) => q[1]);
  return { r: p.r, z: p.z, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
});
const inRing = (r: number[][], x: number, y: number) => {
  let o = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) o = !o;
  return o;
};
const platformAt = (x: number, y: number) => platRings.find((p) => x >= p.box[0] && x <= p.box[2] && y >= p.box[1] && y <= p.box[3] && inRing(p.r, x, y)) ?? null;

/** The span of air the railway's body should fill over (x, y): from its drawn top down to the ground,
 *  or to an arch's or girder's underside where something passes under. Null where there's no body. */
function body(x: number, y: number, g: number): [number, number] | null {
  const pl = platformAt(x, y);
  // (over a road or water a platform stays open as high as its walls stop there, under its underside: railway.ts)
  if (pl) { const lo = need(x, y) > 0 ? Math.max(g + need(x, y), pl.z - 4) : g; return pl.z > lo ? [lo, pl.z] : null; }
  const n = nearest(x, y);
  if (!n || n.flag === 2 || n.off > 2.3) return null;
  const t = top(x, y, n.z + 0.3);
  if (t === null || t <= g) return null;
  const plan = plans[n.t];
  // (the underside as drawn: straight between the bottom's heights every 0.75 m or so, railway.ts)
  const s0 = plan.s[n.k], L = plan.s[n.k + 1] - s0, m = Math.max(1, Math.ceil(L / 0.75)), u = Math.min(m - 1, Math.floor(((n.s - s0) / (L || 1)) * m));
  const sa = s0 + (L * u) / m, sb = s0 + (L * (u + 1)) / m, fr = (n.s - sa) / (sb - sa || 1);
  const drawn = plan.bottom(sa) + (plan.bottom(sb) - plan.bottom(sa)) * fr;
  const lo = n.flag === 1 && plan.span(n.s) ? Math.max(g, drawn) : g;
  return t > lo ? [lo, t] : null;
}

// ---- findings ---------------------------------------------------------------------------------
type Finding = { rule: string; x: number; y: number; score: number; what: string };
const out: Finding[] = [];
const STEP_UP = 0.45;    // what the player steps up without noticing (player.ts)

// falls: along every track out of its tunnels, the bed and cess every metre, and every platform
const falls = new Map<string, { x: number; y: number; worst: number; n: number; of: number; cause: string }>();
const fallAt = (x: number, y: number, cause: string, bin: string) => {
  const g = ground(x, y);
  if (g === null) return;
  // (standing on the drawn floor, what's under your feet is the highest floor you can step to from it)
  const t0 = top(x, y, Math.max(g, railway.floor(x, -y) ?? -Infinity) + 2);
  const r = railway.floor(x, -y, t0 ?? g);
  const f = Math.max(g, r ?? -Infinity);
  const t = top(x, y, f + 2);
  const k = `${cause}|${bin}`, e = falls.get(k) ?? falls.set(k, { x, y, worst: 0, n: 0, of: 0, cause }).get(k)!;
  e.of++;
  if (t !== null && t - f > STEP_UP) { e.n++; if (t - f > e.worst) { e.worst = t - f; e.x = x; e.y = y; } }
};
tracks.forEach((p, ti) => {
  for (let k = 0; k + 1 < p.length; k++) {
    const a = p[k], b = p[k + 1];
    if (a[3] === 2 && b[3] === 2) continue;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l;
    for (let u = 0.25; u < l; u += 1) for (const o of [-2, -1, 0, 1, 2]) {
      const x = a[0] + ((b[0] - a[0]) * u) / l + nx * o, y = a[1] + ((b[1] - a[1]) * u) / l + ny * o;
      if (platformAt(x, y)) continue;
      const s = plans[ti].s[k] + u, bridge = a[3] === 1 || b[3] === 1;
      fallAt(x, y, bridge ? (railway.floor(x, -y) === null ? "bridge deck with nothing to stand on" : "bridge deck floor below what's drawn") : Math.abs(o) > 1.6 ? "track bed's shoulder above the ground" : "track bed above the ground", `${ti}:${Math.floor(s / 10)}`);
    }
  }
});
platRings.forEach((pl, i) => {
  for (let x = pl.box[0]; x <= pl.box[2]; x += 1.5) for (let y = pl.box[1]; y <= pl.box[3]; y += 1.5)
    if (inRing(pl.r, x, y)) fallAt(x, y, "platform", `p${i}:${Math.floor(x / 10)},${Math.floor(y / 10)}`);
});
for (const e of falls.values()) if (e.n) out.push({ rule: `19 falls through the floor: ${e.cause}`, x: e.x, y: e.y, score: e.worst, what: `${e.worst.toFixed(1)} m under what's drawn at ${e.n} of ${e.of} places` });

// sky: eyes on the line, beside it and on the platforms, looking down and sideways
const eyes: { x: number; y: number; z: number; where: string }[] = [];
tracks.forEach((p) => {
  let left = 0;
  for (let k = 0; k + 1 < p.length; k++) {
    const a = p[k], b = p[k + 1];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l;
    for (let u = left; u < l; u += 8) {
      left = u + 8 - l;
      if (a[3] === 2 && b[3] === 2) continue;
      for (const o of [0, -5, 5]) {
        const x = a[0] + ((b[0] - a[0]) * u) / l + nx * o, y = a[1] + ((b[1] - a[1]) * u) / l + ny * o;
        const g = ground(x, y);
        if (g === null) continue;
        const pl = platformAt(x, y), r = railway.floor(x, -y);
        const f = pl ? pl.z : o === 0 ? Math.max(g, r ?? -Infinity, top(x, y, g + 2) ?? -Infinity) : g;
        eyes.push({ x, y, z: f + 1.6, where: pl ? "on a platform" : o === 0 ? (a[3] === 1 ? "on a bridge" : "on the track") : "beside the line" });
        if (o === 0 && f > g + 3) eyes.push({ x, y, z: g + 1.6, where: "under a bridge" });
      }
    }
  }
});
// and on the ground round each platform, a few metres out from its edge
for (const pl of platRings) {
  const r = pl.r;
  for (let i = 0; i < r.length; i++) {
    const A = r[i], B = r[(i + 1) % r.length], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    for (let u = 0; u < L; u += 8) {
      let nx = -(B[1] - A[1]) / L, ny = (B[0] - A[0]) / L;
      const mx = A[0] + ((B[0] - A[0]) * u) / L, my = A[1] + ((B[1] - A[1]) * u) / L;
      if (inRing(r, mx + nx * 0.5, my + ny * 0.5)) { nx = -nx; ny = -ny; }
      const x = mx + nx * 3, y = my + ny * 3, g = ground(x, y);
      if (g !== null && !platformAt(x, y)) eyes.push({ x, y, z: g + 1.6, where: "beside a platform" });
    }
  }
}
const AZ = 12, ELEV = [-4, -12, -25, -45, -70].map((d) => (d * Math.PI) / 180), REACH = 30, DS = 0.2;
const holes = new Map<string, { x: number; y: number; n: number; sky: number; where: string; at: number[] }>();
for (const e of eyes) {
  const inside = body(e.x, e.y, ground(e.x, e.y)!);
  if (inside && e.z < inside[1] && e.z > inside[0]) continue;     // (shut inside the body: nowhere anyone stands)
  let n = 0, sky = 0, at: number[] = [];
  for (let ai = 0; ai < AZ; ai++) for (const el of ELEV) {
    const az = (ai / AZ) * Math.PI * 2, dx = Math.cos(az) * Math.cos(el), dy = Math.sin(az) * Math.cos(el), dz = Math.sin(el);
    let prev = [e.x, e.y, e.z], hole: number[] | null = null;
    for (let s = DS; s <= REACH; s += DS) {
      const q = [e.x + dx * s, e.y + dy * s, e.z + dz * s];
      if (crosses(prev, q)) break;
      const g = ground(q[0], q[1]);
      if (g === null || q[2] <= g) break;
      const bd = body(q[0], q[1], g);
      if (bd && q[2] < bd[1] - 0.15 && q[2] > bd[0] + 0.15) { hole = q; break; }
      prev = q;
    }
    if (!hole) continue;
    n++;
    if (!at.length) at = hole;
    // does it go on to show the sky? (nothing in the way within reach of the fog, below the horizon)
    let p2 = hole, hit = false;
    for (let s = 0.5; s <= 300 && !hit; s += 0.5) {
      const q = [hole[0] + dx * s, hole[1] + dy * s, hole[2] + dz * s], g = ground(q[0], q[1]);
      hit = g === null || q[2] <= g || crosses(p2, q);
      p2 = q;
    }
    if (!hit) sky++;
  }
  if (!n) continue;
  const k = `${Math.round(at[0] / 10)},${Math.round(at[1] / 10)}`, h = holes.get(k);
  if (!h || n > h.n) holes.set(k, { x: at[0], y: at[1], n, sky, where: e.where, at: [e.x, e.y] });
}
for (const h of holes.values()) {
  const n = nearest(h.x, h.y), pl = platformAt(h.x, h.y);
  const cause = pl ? "under a platform" : !n ? "railway" : n.flag === 1 ? (plans[n.t].span(n.s) ? "a bridge's sides above its arch" : "a bridge's sides short of the ground") : "under the track bed's edge";
  out.push({ rule: `19 sky through the ground: ${cause}`, x: h.x, y: h.y, score: h.n, what: `${h.n} rays from ${h.where} (${Math.round(h.at[0])},${Math.round(h.at[1])}) see through${h.sky ? `, ${h.sky} to the sky` : ""}` });
}
console.log(JSON.stringify(out));
