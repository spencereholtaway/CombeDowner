// Tunnels as the game builds them (web/src/tunnels.ts), for tools/check_more.py's rule 32. It builds
// each square's tunnels with the game's own code, stood on the square's ground, and looks for:
//  - "gap": where two of a tunnel's pieces meet inside the hill, the end rings of their tubes don't
//    meet (each ring is square to its own last stretch, so at an angle a wedge opens on the outside);
//    and a tube cut at its square's edge with no tube going on from it in the next square;
//  - "walls": the solid walls you bump into (map.ts: the floor's line offset sideways at the record's
//    own points) standing more than 0.1 m off the walls as drawn (the tube's rings, every 1.5 m); and
//    where two pieces meet, a gap between their solid walls you could walk out through;
//  - "floor": the floor you walk on (map.ts boreAt: the record's line) more than 0.05 m off the floor
//    as drawn (tunnels.ts floorAcross, with its pavements a kerb up).
// The canal's tunnels are canal.ts's own (one straight bore, walked by works.ts) and are not looked at.
//
// Bundled and run from web/ as watertight.ts is. Usage: node tunnel_mesh.mjs <maps root> <map id>;
// prints one JSON list of findings.
import * as THREE from "three";
import { readFileSync, existsSync, readdirSync } from "fs";
import { buildTunnels } from "./src/tunnels";
import { boreHalf, offsetLine, type GameMap, type Tunnel } from "./src/map";

(globalThis as { __keepArrays?: boolean }).__keepArrays = true;
const [root, id] = process.argv.slice(2);
const dir = `${root}/${id}`;
const STEP = 1.5;            // tunnels.ts: metres between the tube's rings
const WALL_OFF = 0.1, FLOOR_OFF = 0.05, RING_GAP = 0.05, JOIN = 1.0;

type Sq = { name: string; b: number[]; tn: Tunnel[]; T: { nx: number; ny: number; x0: number; y0: number; dx: number; dy: number; z0: number; h: number[] } };
const squares = new Map<string, Sq>();
for (const f of existsSync(dir) ? readdirSync(dir).filter((n) => /^-?\d+_-?\d+\.json$/.test(n)) : []) {
  const text = readFileSync(`${dir}/${f}`, "utf8");
  if (/"tn":\s*\[\s*\]/.test(text) || !/"tn":/.test(text)) continue;
  const m = JSON.parse(text);
  if (!m.tn?.length || !m.t) continue;
  squares.set(f.slice(0, -5), { name: f.slice(0, -5), b: m.b, tn: m.tn, T: m.t });
}

function groundOf(T: Sq["T"]) {
  return (x: number, y: number) => {
    const fi = (x - T.x0) / T.dx, fj = (y - T.y0) / T.dy;
    const i = Math.min(T.nx - 2, Math.max(0, Math.floor(fi))), j = Math.min(T.ny - 2, Math.max(0, Math.floor(fj)));
    const u = Math.min(1, Math.max(0, fi - i)), v = Math.min(1, Math.max(0, fj - j)), h = (k: number) => T.h[k] / 10 + T.z0, a = j * T.nx + i, n = T.nx;
    return u + v <= 1 ? h(a) + (h(a + 1) - h(a)) * u + (h(a + n) - h(a)) * v : h(a + n + 1) + (h(a + n) - h(a + n + 1)) * (1 - u) + (h(a + 1) - h(a + n + 1)) * (1 - v);
  };
}

const onSeam = (x: number, y: number, b: number[]) => Math.min(Math.abs(x - b[0]), Math.abs(y - b[1]), Math.abs(x - b[2]), Math.abs(y - b[3])) < 0.5;
const dist2 = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const dist3 = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function toSegment(p: number[], a: number[], b: number[]) {
  const vx = b[0] - a[0], vy = b[1] - a[1], s = Math.min(1, Math.max(0, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy || 1)));
  return { d: Math.hypot(p[0] - a[0] - vx * s, p[1] - a[1] - vy * s), s };
}
const toLine = (p: number[], w: number[][]) => w.slice(1).reduce((best, b, k) => Math.min(best, toSegment(p, w[k], b).d), Infinity);

/** One tunnel record's tube as drawn: its rings (data coords), its floor's points by ring, and its record after alignPortals. */
interface Tube { t: Tunnel; rings: number[][][]; floor: number[][][] }
const found: { rule: string; score: number; x: number; y: number; what: string }[] = [];
const ends: { sq: string; tube: Tube; end: 0 | 1; ring: number[][]; at: number[] }[] = [];

for (const sq of squares.values()) {
  const tn: Tunnel[] = JSON.parse(JSON.stringify(sq.tn));
  const ground = groundOf(sq.T);
  const map = { d: { tn, b: sq.b }, z0: 0, trueGround: (x: number, z: number) => ground(x, -z) } as unknown as GameMap;
  const scene = new THREE.Group();
  buildTunnels(map, scene);
  // (the game adds, for each record in turn, a tube, its outer skin and its floor for every 60 rings,
  // then its lamps)
  const tubes: Tube[] = [];
  let k = 0, cur: Tube | null = null;
  const data = (g: THREE.BufferGeometry) => {
    const p = g.getAttribute("position"), out: number[][] = [];
    for (let i = 0; i < p.count; i++) out.push([p.getX(i), -p.getZ(i), p.getY(i)]);
    return out;
  };
  for (const o of scene.children) {
    if ((o as THREE.InstancedMesh).isInstancedMesh) { if (cur) tubes.push(cur); cur = null; continue; }
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry.index) continue;
    if (!cur) { if (k >= tn.length) break; cur = { t: tn[k++], rings: [], floor: [] }; }
    const mat = m.material as THREE.Material;
    if (mat.side === THREE.BackSide) continue;
    const idx = m.geometry.index.array, P = idx[1], pts = data(m.geometry);
    const isFloor = mat.side === THREE.DoubleSide;
    const rows: number[][][] = [];
    for (let i = 0; i + P <= pts.length; i += P) rows.push(pts.slice(i, i + P));
    const into = isFloor ? cur.floor : cur.rings;
    // (a chunk starts on the ring the one before it ended on)
    into.push(...(into.length ? rows.slice(1) : rows));
  }
  for (const tube of tubes) {
    const { t, rings, floor } = tube;
    if (rings.length < 2) continue;
    const name = `${t.c} ${JSON.stringify(t.n ?? "")}`;
    // the solid walls, as map.ts lays them
    const walls = [1, -1].map((side) => offsetLine(t.p, (i) => boreHalf(t, i) * side));
    let off = 0, worst = 0, wx = 0, wy = 0;
    for (const r of rings) {
      for (const [foot, w] of [[r[0], walls[0]], [r[r.length - 1], walls[1]]] as const) {
        const d = toLine(foot, w);
        if (d > WALL_OFF) { off += STEP / 2; if (d > worst) { worst = d; wx = foot[0]; wy = foot[1]; } }
      }
    }
    if (off >= STEP) found.push({ rule: "32 tunnel wall solid off where it's drawn", score: off, x: wx, y: wy, what: `${name}: ${off.toFixed(0)} m of wall, up to ${worst.toFixed(2)} m off` });
    // the floor you walk on, against the floor drawn
    let low = 0, most = 0, fx = 0, fy = 0;
    for (const row of floor) {
      let ring = 0;
      for (const q of row) {
        let best = Infinity, z = NaN;
        for (let i = 0; i < t.p.length - 1; i++) {
          const { d, s } = toSegment(q, t.p[i], t.p[i + 1]);
          if (d < Math.max(boreHalf(t, i), boreHalf(t, i + 1)) + 0.2 && d < best) { best = d; z = t.p[i][2] + (t.p[i + 1][2] - t.p[i][2]) * s; }
        }
        if (Number.isFinite(z)) ring = Math.max(ring, Math.abs(q[2] - z));
      }
      if (ring > FLOOR_OFF) { low += STEP; if (ring > most) { most = ring; fx = row[0][0]; fy = row[0][1]; } }
    }
    if (low >= STEP) found.push({ rule: "32 tunnel floor walked off where it's drawn", score: low, x: fx, y: fy, what: `${name}: ${low.toFixed(0)} m, up to ${most.toFixed(2)} m between them` });
    for (const end of [0, 1] as const) {
      const ring = end ? rings[rings.length - 1] : rings[0], q = end ? t.p[t.p.length - 1] : t.p[0];
      const at = [(ring[0][0] + ring[ring.length - 1][0]) / 2, (ring[0][1] + ring[ring.length - 1][1]) / 2, q[2]];
      ends.push({ sq: sq.name, tube, end, ring, at });
    }
  }
}

// the ends: where two pieces meet, their rings and their solid walls must close; at a square's edge
// a piece must go on in the next square
const all = ends;
const seen = new Set<object>();
for (const e of all) {
  if (seen.has(e)) continue;
  const b = squares.get(e.sq)!.b;
  const other = all.find((o) => o !== e && !seen.has(o) && dist2(o.at, e.at) < JOIN && (o.tube !== e.tube || o.end !== e.end));
  if (!other) {
    if (onSeam(e.at[0], e.at[1], b)) found.push({ rule: "32 tunnel open at a square's edge", score: 1, x: e.at[0], y: e.at[1], what: `${e.tube.t.c} ${JSON.stringify(e.tube.t.n ?? "")}: no tube goes on in the next square` });
    continue;
  }
  seen.add(e); seen.add(other);
  if (other.sq !== e.sq) continue;    // (cut at the seam on both sides: each square's tube ends on the same line)
  const n = Math.min(e.ring.length, other.ring.length);
  const pair = (flip: boolean) => { let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, dist3(e.ring[i], other.ring[flip ? other.ring.length - 1 - i : i])); return m; };
  const gap = Math.min(pair(false), pair(true));
  if (gap > RING_GAP) found.push({ rule: "32 tunnel gap where two of its pieces meet", score: gap, x: e.at[0], y: e.at[1], what: `${e.tube.t.c} ${JSON.stringify(e.tube.t.n ?? "")}: the tubes' ends ${gap.toFixed(2)} m apart` });
  const wallEnds = (x: typeof e) => [1, -1].map((side) => { const w = offsetLine(x.tube.t.p, (i) => boreHalf(x.tube.t, i) * side); return x.end ? w[w.length - 1] : w[0]; });
  const a = wallEnds(e), c = wallEnds(other);
  const wg = Math.max(Math.min(dist2(a[0], c[0]), dist2(a[0], c[1])), Math.min(dist2(a[1], c[0]), dist2(a[1], c[1])));
  if (wg > WALL_OFF) found.push({ rule: "32 tunnel's solid walls open where two pieces meet", score: wg, x: e.at[0], y: e.at[1], what: `${e.tube.t.c} ${JSON.stringify(e.tube.t.n ?? "")}: ${wg.toFixed(2)} m between the walls' ends` });
}
console.log(JSON.stringify(found.map((f) => ({ ...f, score: Math.round(f.score * 100) / 100, x: Math.round(f.x * 10) / 10, y: Math.round(f.y * 10) / 10 }))));
