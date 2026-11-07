// The Climb's crag (theclimb.ts): a limestone crag of its own, built here from primitives, high in
// the sky over the challenge's place on the map, so it's the same on every map. Taking the
// challenge on lifts the team up to its foot, and the end brings them back down to the street.
// It's a great buttress standing up out of a sea of cloud, other tops poking out of it far off,
// with a shelf of grass at its foot walled in by drystone walls. The cloud is two layers of billows
// drifting over a grey floor, seen through the gaps, with heaps of cumulus standing well off all
// round, a few of them towering past the top. Nobody can wander off: the walls
// hold you in, and anything that falls off the face lands on the grass.
// The way up is laid out for a team, not found:
// - the slab, leaning back, easy, up to the first ledge, wide enough for everyone;
// - a blank wall whose first hold is out of reach without a mate's shoulders (alone there are
//   lower holds), up to the rope ledge, a small one out to the left;
// - a traverse right along a band of holds to the far ledge;
// - out under a bulge of overhanging rock and over its lip onto the roof;
// - up a chimney, a groove in the rock, to the terrace that runs the whole width;
// - and the headwall to the top, where everyone has to stand together.
// The rock and the ledges are fixed; the holds come from the day's seed and how many are climbing
// (routeFor), so every screen climbs the same holds. They're laid as routes, a reach apart: runs of
// easy moves, a white jug to rest on partway up the long sections, and on each a crux of longer
// reaches, longer still the more of you there are.
//
// Who decides what: nothing here goes over the network. theclimb.ts says how many it's set for.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hash, rng } from "./quests";

export const HALF = 10;        // half the width of the face, metres: as far along as anyone can go
export const FRONT = 12.5;     // how far out from the face the grass at the foot runs to its wall
export const BACK = 12;        // how far back from the edge you can walk on the top
export const H = 43.5;         // foot to top
export const BOOST_HOLD = 4.7; // a boost gap's hold above its ledge: out of a jump's reach, in reach off shoulders
const LIFT = 1000;             // how far over the challenge's place on the map the foot is
const EDGE = 16;               // where the grass at the foot ends, and how far back the top goes
const SIDE = HALF + 1.5;       // where the face turns back at its corners
const TURN = 1.6;              // and how sharply
const SMAX = SIDE + TURN * Math.sqrt(EDGE / 14);
const SHELF = 14;              // half the width of the grass at the foot
const CLOUD = -34;             // the top of the cloud, under the foot
const DEPTHS = -70;            // the grey floor of the cloud, seen through the gaps between billows

// the ledges' heights above the foot
const Y1 = 7, Y2 = 14.5, Y3 = 21, Y4 = 28.5, Y5 = 35.5;

/** Where the crag is, in scene coordinates: its foot's middle, out (the way the face looks) and along (right, facing it). */
export interface Room { ox: number; oz: number; nx: number; nz: number; tx: number; tz: number; y0: number; top: number; name: string }

/** o: where the rock behind it is, out from the face's line; d: how far it stands out from there. rope: where along
 *  its rope hangs, down to foot (scene Y). */
export interface Ledge { y: number; s0: number; s1: number; o: number; d: number; rope: number; foot: number; name: string }
/** rest: a big jug you can hang off and get your grip back. */
export interface Hold { s: number; y: number; boost: boolean; rest: boolean }
export interface Route { n: number; ledges: Ledge[]; holds: Hold[] }

/** The crag over a place on the map whose ground is at ground. */
export function roomOver(x: number, z: number, ground: number, name: string): Room {
  const y0 = Math.round(ground + LIFT);
  return { ox: x, oz: z, nx: 0, nz: 1, tx: 1, tz: 0, y0, top: y0 + H, name };
}

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash3(i: number, j: number, k: number) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, k: number) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash3(i, j, k), b = hash3(i + 1, j, k), c = hash3(i, j + 1, k), d = hash3(i + 1, j + 1, k);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

/** How far the face has turned back at its corners, a along from the middle. */
const cornerBack = (a: number) => (a > SIDE ? ((a - SIDE) / TURN) ** 2 * 14 : 0);

/** How far out from the face's line the rock stands, at s along and ly above the foot. */
export function rockOut(s: number, ly: number): number {
  const a = Math.abs(s);
  let b: number;
  if (ly < Y1) b = 1 - Math.max(0, ly) / Y1;
  else if (ly < Y3) b = 0;
  else if (ly < Y4) b = 2.4 * smooth(Y3 + 1.5, Y4 - 1.5, ly) * (1 - smooth(5.5, 7.5, a));
  else if (ly < Y5) b = -1.4 * (1 - smooth(1.2, 1.8, a)) * smooth(Y4, Y4 + 0.3, ly);
  else b = -1.4 + (0.4 * (ly - Y5)) / (H - Y5);
  const corner = -cornerBack(a);
  // limestone lies in beds: each a little proud of or behind the next
  const bed = (hash3(Math.floor(ly / 1.3), 7, 3) - 0.5) * 0.22;
  return b + corner + 0.3 * vnoise(s / 3.2, ly / 2.6, 1) + 0.09 * vnoise(s / 0.9, ly / 0.8, 2) + bed;
}

/** The furthest out the rock stands between ly0 and ly1 above the foot, at s. */
export function rockMost(s: number, ly0: number, ly1: number): number {
  let m = -Infinity;
  for (let i = 0; i <= 4; i++) m = Math.max(m, rockOut(s, ly0 + ((ly1 - ly0) * i) / 4));
  return m;
}

const SHELVES = [
  { y: 0, s0: -HALF, s1: HALF, o: 0, d: FRONT, name: "the foot" },
  { y: Y1, s0: -6, s1: 6, o: 0, d: 2.2, name: "the first ledge" },
  { y: Y2, s0: -7, s1: -3, o: 0, d: 1.6, name: "the rope ledge" },
  { y: Y3, s0: 3, s1: 7, o: 0, d: 1.8, name: "the far ledge" },
  { y: Y4, s0: -4.5, s1: 4.5, o: 0, d: 2.4, name: "the roof" },
  { y: Y5, s0: -HALF + 1, s1: HALF - 1, o: -1.4, d: 3.0, name: "the terrace" },
  { y: H, s0: -HALF, s1: HALF, o: -1.0, d: 0, name: "the top" },
];

/** The day's holds for n climbers, laid as routes a reach apart: easy runs of holds, a rest jug on
 *  the long sections, and a crux of longer reaches on each. More of you means longer cruxes, fewer
 *  spare holds and fewer jugs, and more of the gaps need a boost. */
export function routeFor(room: Room, seed: number, n: number): Route {
  const r = rng(hash("climb", seed, n)), Y = room.y0;
  const ledges: Ledge[] = SHELVES.map((l) => ({ ...l, y: Y + l.y, rope: (l.s0 + l.s1) / 2, foot: Y }));
  // each ledge's rope comes down onto the highest ledge under it
  for (let k = 1; k < ledges.length; k++) {
    const a = ledges[k];
    for (let j = k - 1; j >= 1; j--) {
      const b = ledges[j], lo = Math.max(a.s0, b.s0) + 0.6, hi = Math.min(a.s1, b.s1) - 0.6;
      if (lo < hi) { a.rope = lo + r() * (hi - lo); a.foot = b.y; break; }
    }
    if (a.foot === Y) a.rope = a.s0 + 0.6 + r() * (a.s1 - a.s0 - 1.2);
  }
  const span = (a: number, b: number) => a + r() * (b - a);
  const easy: [number, number] = n <= 1 ? [0.5, 0.75] : [0.55, 0.85];
  const hard: [number, number] = n <= 1 ? [0.9, 1.05] : n === 2 ? [1.1, 1.35] : [1.25, 1.55];
  const spare = n <= 1 ? 0.35 : n === 2 ? 0.15 : n === 3 ? 0.06 : 0;
  // the wall above the first ledge needs a boost with two of you, the chimney too with three, the headwall with four
  const boost = [false, n >= 2, false, false, n >= 3, n >= 4];
  const paths: [number, number][][] = [
    [[-1 + r() * 2, 1.8], [-0.5 + r(), Y1 - 1.6]],
    boost[1] ? [[-4.6 + (r() - 0.5) * 0.6, Y1 + BOOST_HOLD], [-5.2, Y2 - 1.5]] : [[-3 + r(), Y1 + 1.8], [-5.2, Y2 - 1.5]],
    [[-5 + r() * 0.6, Y2 + 1.8], [-1.5, Y2 + 2.4], [2.5, Y2 + 2.0], [4.6 + r() * 0.6, Y3 - 1.6]],
    [[5 + r() * 0.6, Y3 + 1.8], [2.6, Y3 + 4.0], [0.6 + r(), Y4 - 1.5]],
    [],
    [[(r() - 0.5) * 2, Y5 + (boost[5] ? BOOST_HOLD : 1.8)], [-1 + r() * 2, H - 1.5]],
  ];
  const floors = [0, Y1, Y2, Y3, Y4, Y5, H];
  const holds: Hold[] = [];
  const clampS = (s: number) => Math.max(-HALF + 0.6, Math.min(HALF - 0.6, s));
  for (let k = 0; k < 6; k++) {
    const pts: [number, number][] = k === 4
      ? [[0, Y4 + (boost[4] ? BOOST_HOLD : 1.8)], [0, Y5 - 1.5]]
      : paths[k];
    const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
    const total = lens.reduce((a, b) => a + b, 0);
    // the crux: a stretch of longer reaches somewhere in the middle
    const cl = total > 4 ? Math.min(total * 0.4, n <= 1 ? 1.8 : 1.6 + 0.5 * Math.min(n, 4)) : 0;
    const c0 = cl ? span(1.2, Math.max(1.2, total - cl - 1.2)) : -1;
    const steps: number[] = [];
    for (let d = 0; d < total;) { const st = d >= c0 && d < c0 + cl ? span(...hard) : span(...easy); steps.push(st); d += st; }
    const fit = total / steps.reduce((a, b) => a + b, 0);
    const along: number[] = [0];
    for (const st of steps) along.push(along[along.length - 1] + st * fit);
    const main: { s: number; y: number }[] = [];
    along.forEach((d0, i) => {
      let d = Math.min(total, d0), j = 0;
      while (j < lens.length - 1 && d > lens[j]) { d -= lens[j]; j++; }
      const a = pts[j], b = pts[j + 1] ?? pts[j], t = lens[j] ? Math.min(1, d / lens[j]) : 0;
      const ux = lens[j] ? (b[0] - a[0]) / lens[j] : 0, uy = lens[j] ? (b[1] - a[1]) / lens[j] : 1;
      const inner = i > 0 && i < along.length - 1;
      // up the chimney you bridge from one side of the groove to the other
      const off = k === 4 ? (i % 2 ? 1 : -1) * span(0.6, 0.8) : inner ? (r() - 0.5) * 0.5 : 0;
      const p = { s: a[0] + (b[0] - a[0]) * t - uy * off, y: a[1] + (b[1] - a[1]) * t + ux * off };
      const last = main[main.length - 1];
      if (!last || Math.hypot(p.s - last.s, p.y - last.y) >= 0.45) main.push(p);
    });
    // three or more: one gap under the bulge only a lunge will cross
    let gap: [number, number] | null = null;
    if (k === 3 && n >= 3) {
      for (let i = 1; i < main.length - 2 && !gap; i++) {
        for (let j = i + 2; j < main.length - 1; j++) {
          const d = Math.hypot(main[j].s - main[i].s, main[j].y - main[i].y);
          if (d > 3.1) break;
          if (d >= 2.5) { main.splice(i + 1, j - i - 1); gap = [i, i + 1]; break; }
        }
      }
    }
    // a jug to rest on, partway up the long sections: alone on every one, with more of you on fewer
    let rest = -1;
    if (total >= 4.5 && (n <= 2 || k % 2 === 1)) {
      let best = Infinity;
      main.forEach((_p, i) => {
        if (i === 0 || i === main.length - 1 || (gap && (i === gap[0] || i === gap[1]))) return;
        const mid = Math.abs(i - main.length / 2);
        if (mid < best) { best = mid; rest = i; }
      });
    }
    const lo = floors[k] + (boost[k] ? BOOST_HOLD : 1.6), hi = floors[k + 1] - 0.6;
    const placed: { s: number; y: number }[] = [];
    main.forEach((p, i) => {
      const s = clampS(p.s);
      holds.push({ s, y: Y + p.y, boost: i === 0 && boost[k], rest: i === rest });
      placed.push({ s, y: p.y });
    });
    // a spare beside the line now and then, never crowding another or bridging the lunge
    if (!gap) {
      main.forEach((p, i) => {
        if (i === 0 || r() >= spare) return;
        const ss = clampS(p.s + (r() < 0.5 ? -1 : 1) * span(0.65, 0.95)), sy = p.y + (r() - 0.5) * 0.5;
        if (sy <= lo || sy >= hi || placed.some((q) => Math.hypot(q.s - ss, q.y - sy) < 0.55)) return;
        holds.push({ s: ss, y: Y + sy, boost: false, rest: false });
        placed.push({ s: ss, y: sy });
      });
    }
  }
  return { n, ledges, holds };
}

// ---- drawing it ----

/** Bath stone: honey-coloured, in beds, with joints, lichen and rain streaks. */
function stoneTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!, r = rng(hash("crag stone"));
  g.fillStyle = "#cbb58a"; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256;) {
    const h = 10 + Math.floor(r() * 22), v = Math.floor((r() - 0.5) * 34);
    g.fillStyle = `rgb(${203 + v},${181 + v},${138 + v})`;
    g.fillRect(0, y, 256, h);
    g.fillStyle = "rgba(70,56,36,0.45)";
    for (let x = 0; x < 256; x += 2) g.fillRect(x, y + Math.round(Math.sin(x / 9 + y) * 1.2), 2, 1);
    y += h;
  }
  for (let i = 0; i < 2600; i++) {
    const v = 120 + Math.floor(r() * 120);
    g.fillStyle = `rgba(${v},${v - 10},${v - 34},0.5)`;
    g.fillRect(Math.floor(r() * 256), Math.floor(r() * 256), 1 + Math.floor(r() * 2), 1);
  }
  g.strokeStyle = "rgba(48,38,26,0.6)";
  g.lineWidth = 1.5;
  for (let i = 0; i < 12; i++) {
    let x = r() * 256, y = r() * 256;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 5; s++) { x += (r() - 0.5) * 10; y += 8 + r() * 14; g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 18; i++) {
    const x = r() * 256, y = r() * 256, w = 3 + r() * 8;
    const grad = g.createLinearGradient(0, y, 0, y + 60 + r() * 80);
    grad.addColorStop(0, "rgba(60,58,50,0.35)"); grad.addColorStop(1, "rgba(60,58,50,0)");
    g.fillStyle = grad; g.fillRect(x, y, w, 140);
  }
  for (let i = 0; i < 70; i++) {
    const orange = r() < 0.3;
    g.fillStyle = orange ? "rgba(214,150,52,0.75)" : "rgba(166,178,146,0.7)";
    const x = r() * 256, y = r() * 256, rad = 1 + r() * 3.5;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

type V3 = [number, number, number];

/** A sheet over u (0..nu) by v (0..nv): at(u, v) gives each point, its colour and where on the texture. */
function sheet(nu: number, nv: number, at: (i: number, j: number) => { p: V3; c: V3; uv: [number, number] }): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const q = at(i, j);
    pos.push(...q.p); col.push(...q.c); uv.push(...q.uv);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
    idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const out = g.toNonIndexed();
  g.dispose();
  out.computeVertexNormals();
  return out;
}

/** A piece made by three.js (a box, an extrusion): unindexed, one colour, texture in metres/4. */
function piece(g: THREE.BufferGeometry, c: V3, uvScale = 0.25): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  const n = out.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set(c, i * 3);
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const uv = out.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
  for (const k of Object.keys(out.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) out.deleteAttribute(k);
  return out;
}

const turf = (s: number, o: number): V3 => { const v = 0.12 * vnoise(s / 3, o / 3, 9); return [1 + v, 1 + v, 1 + v * 0.5]; };
const stoneAt = (s: number, y: number): V3 => {
  const v = 0.1 * vnoise(s / 5, y / 7, 4) - (hash3(Math.floor(s / 1.7), 1, 5) < 0.2 ? 0.08 : 0);
  return [0.95 + v, 0.93 + v, 0.9 + v];
};

/** The rock: the face and its corners, the grass at its foot and on top, the ledges and the walls. One mesh. */
function rockGeometry(): { rock: THREE.BufferGeometry; grass: THREE.BufferGeometry } {
  const parts: THREE.BufferGeometry[] = [], green: THREE.BufferGeometry[] = [];
  const cols = Math.ceil((SMAX * 2) / 0.45), sAt = (i: number) => -SMAX + (SMAX * 2 * i) / cols;
  // rows up the face, with a pair at each step where the rock jumps back
  const ys: number[] = [-4, -2];
  for (let y = 0; y <= H + 1e-6; y += 0.4) ys.push(+y.toFixed(3));
  for (const b of [Y4, Y5]) ys.push(b - 0.02, b);
  ys.push(H);
  const rows = [...new Set(ys)].sort((a, b) => a - b);
  parts.push(sheet(cols, rows.length - 1, (i, j) => {
    const s = sAt(i), y = rows[j], u = (s + Math.sign(s) * cornerBack(Math.abs(s))) / 4;
    return { p: [s, y, rockOut(s, y)], c: stoneAt(s, y), uv: [u, y / 4] };
  }));
  // the grass at the foot, from the rock out to the edge, worn bare along the bottom of the face
  const nOut = 24, fcols = Math.ceil((SHELF * 2) / 0.6), fAt = (i: number) => -SHELF + (SHELF * 2 * i) / fcols, behind = -8;
  green.push(sheet(fcols, nOut, (i, j) => {
    const s = fAt(i), back = Math.max(behind, rockOut(Math.max(-SMAX, Math.min(SMAX, s)), 0) - 0.3), o = back + ((EDGE - back) * j) / nOut;
    const c: V3 = o - back < 1.6 && Math.abs(s) < SIDE ? [1.25, 1.1, 0.85] : turf(s, o);
    return { p: [s, 0, o], c, uv: [s / 3, o / 3] };
  }));
  // and on top, from the back to the edge
  green.push(sheet(cols, nOut, (i, j) => {
    const s = sAt(i), front = rockOut(s, H), o = -EDGE + ((front + EDGE) * j) / nOut;
    return { p: [s, H, o], c: turf(s, o + 40), uv: [s / 3, o / 3] };
  }));
  // the drops into the cloud: round the grass at the foot, and behind the top
  const drop = (y0: number) => [y0, y0 - 3, y0 - 10, y0 - 25, DEPTHS - 2];
  const jag = (a: number, y: number, k: number, j: number) => (j ? 0.6 * vnoise(a / 2, y / 3, k) : 0);
  const low = drop(0), high = drop(H);
  parts.push(sheet(fcols, low.length - 1, (i, j) => {
    const s = fAt(i), y = low[j];
    return { p: [s, y, EDGE + jag(s, y, 11, j)], c: stoneAt(s, y), uv: [s / 4, y / 4] };
  }));
  parts.push(sheet(fcols, low.length - 1, (i, j) => {
    const s = fAt(i), y = low[j];
    return { p: [s, y, behind - jag(s, y, 15, j)], c: stoneAt(s, y), uv: [s / 4, y / 4] };
  }));
  for (const side of [-1, 1]) {
    parts.push(sheet(16, low.length - 1, (i, j) => {
      const y = low[j], o = behind + ((EDGE - behind) * i) / 16;
      return { p: [side * (SHELF + jag(o, y, 13 + side, j)), y, o], c: stoneAt(o, y), uv: [o / 4, y / 4] };
    }));
  }
  parts.push(sheet(cols, high.length - 1, (i, j) => {
    const s = sAt(i), y = high[j];
    return { p: [s, y, -EDGE - jag(s, y, 12, j)], c: stoneAt(s, y), uv: [s / 4, y / 4] };
  }));
  // the ledges: a slab on top, the rock tapering back into the face under it
  for (const l of SHELVES.slice(1, -1)) {
    const shape = new THREE.Shape();
    const back = l.o - 0.7, lip = l.o + l.d;
    shape.moveTo(-back, l.y); shape.lineTo(-lip, l.y); shape.lineTo(-lip - 0.08, l.y - 0.5);
    shape.lineTo(-(l.o + l.d * 0.35), l.y - 1.5); shape.lineTo(-back, l.y - 1.5);
    const g = new THREE.ExtrudeGeometry(shape, { depth: l.s1 - l.s0, bevelEnabled: false });
    g.rotateY(Math.PI / 2);
    g.translate(l.s0, 0, 0);
    parts.push(piece(g, [1.04, 1.02, 0.98]));
  }
  // drystone walls along the front and up the sides, with a stile in the front one at the way down
  const walls: [number, number, number, number][] = [[0, FRONT + 0.55, SHELF * 2, 0.6], [-HALF - 0.75, FRONT / 2 + 0.3, 0.6, FRONT + 0.5], [HALF + 0.75, FRONT / 2 + 0.3, 0.6, FRONT + 0.5]];
  for (const [x, z, w, d] of walls) {
    const wall = new THREE.BoxGeometry(w, 1.0, d);
    wall.translate(x, 0.5, z);
    parts.push(piece(wall, [1.08, 1.04, 0.98]));
    const cope = new THREE.BoxGeometry(w + 0.12, 0.16, d + 0.12);
    cope.translate(x, 1.06, z);
    parts.push(piece(cope, [0.86, 0.84, 0.8]));
  }
  for (const [dz, h] of [[-0.75, 0.4], [0.75, 0.4]]) {
    const step = new THREE.BoxGeometry(1.1, 0.12, 0.45);
    step.translate(STILE, h, FRONT + 0.55 + dz);
    parts.push(piece(step, [0.62, 0.45, 0.3]));
  }
  const post = new THREE.BoxGeometry(0.12, 2.1, 0.12);
  post.translate(STILE + 1.0, 1.05, FRONT - 0.2);
  parts.push(piece(post, [0.55, 0.4, 0.27]));
  const rock = mergeGeometries(parts)!, grass = mergeGeometries(green)!;
  for (const p of [...parts, ...green]) p.dispose();
  return { rock, grass };
}

/** Short mountain turf, with a few daisies. */
function grassTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!, r = rng(hash("crag grass"));
  g.fillStyle = "#6d8a46"; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) {
    const v = Math.floor((r() - 0.5) * 60);
    g.fillStyle = `rgb(${104 + v},${136 + v},${70 + v * 0.6})`;
    g.fillRect(Math.floor(r() * 128), Math.floor(r() * 128), 1, 1 + Math.floor(r() * 3));
  }
  for (let i = 0; i < 26; i++) {
    g.fillStyle = r() < 0.7 ? "#f4f1e4" : "#e8d04a";
    g.fillRect(Math.floor(r() * 128), Math.floor(r() * 128), 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Where along the foot the way down is: a stile in the wall, and a sign. */
export const STILE = -7.5;
/** How far out the way down is, from the face. */
export const STILE_OUT = FRONT - 0.3;

/** Other tops out of the cloud, far off all round, and banks of cumulus heaped up out of it. */
function distance(): { hills: THREE.BufferGeometry; heaps: THREE.BufferGeometry } {
  const r = rng(hash("crag hills")), hills: THREE.BufferGeometry[] = [], puffs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + (r() - 0.5) * 0.3, R = 380 + r() * 380, h = 30 + r() * 50 + (i % 5 === 0 ? 70 : 0) + (CLOUD - 12 - DEPTHS), rad = 70 + r() * 90;
    const g = new THREE.ConeGeometry(rad, h, 9, 4);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k), n = vnoise(x / 25 + i * 7, z / 25, 13) * 0.25;
      p.setXYZ(k, x * (1 + n), y + vnoise(x / 30, z / 30 + i * 3, 14) * h * 0.08, z * (1 + n));
    }
    g.translate(Math.sin(a) * R, DEPTHS + h / 2, Math.cos(a) * R);
    const out = g.toNonIndexed(); g.dispose();
    const pos = out.attributes.position as THREE.BufferAttribute, col = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const up = Math.max(0, Math.min(1, (pos.getY(k) - CLOUD) / (h - 12)));
      col.set([0.36 + 0.42 * up, 0.46 + 0.3 * up, 0.3 + 0.34 * up], k * 3);
    }
    out.setAttribute("color", new THREE.BufferAttribute(col, 3));
    out.deleteAttribute("uv");
    out.computeVertexNormals();
    hills.push(out);
  }
  // heaps of cumulus well away from the crag: lots of small billows on a dome, flat underneath, grey
  // there and white on top; a few tower up past the top, so there's cloud round you as well as under you
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + r() * 0.4, R = 330 + r() * 300, tall = i % 4 === 1;
    const cx = Math.sin(a) * R, cz = Math.cos(a) * R, base = CLOUD - 4 + r() * 6;
    const wide = tall ? 45 : 55 + r() * 40, high = tall ? 120 : 22 + r() * 16;
    const count = tall ? 34 : 22;
    for (let k = 0; k < count; k++) {
      const q = Math.sqrt(r()), th = r() * Math.PI * 2, d = q * wide;
      const dome = high * Math.sqrt(Math.max(0, 1 - q * q)) * (tall ? 0.4 + 0.6 * r() : 1);
      const rad = (tall ? 13 : 9) + r() * 9;
      const g = new THREE.IcosahedronGeometry(1, 1);
      g.scale(rad * 1.25, rad, rad * 1.25);
      g.translate(cx + Math.cos(th) * d, base + dome, cz + Math.sin(th) * d);
      const pos = g.attributes.position as THREE.BufferAttribute, col = new Float32Array(pos.count * 3);
      for (let j = 0; j < pos.count; j++) {
        if (pos.getY(j) < base) pos.setY(j, base + (pos.getY(j) - base) * 0.15);
        const t = Math.max(0, Math.min(1, (pos.getY(j) - base) / (high + rad)));
        const w = 0.7 + 0.3 * Math.pow(t, 0.6);
        col.set([w, w + 0.025 * (1 - t), w + 0.08 * (1 - t)], j * 3);
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.deleteAttribute("uv");
      puffs.push(g);
    }
  }
  const hillGeo = mergeGeometries(hills)!, heaps = mergeGeometries(puffs)!;
  for (const g of [...hills, ...puffs]) g.dispose();
  return { hills: hillGeo, heaps };
}

/** Value noise that repeats every p cells, for a texture that tiles. */
function tiledNoise(x: number, y: number, p: number, k: number) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const m = (q: number) => ((q % p) + p) % p;
  const a = hash3(m(i), m(j), k), b = hash3(m(i + 1), m(j), k), c = hash3(m(i), m(j + 1), k), d = hash3(m(i + 1), m(j + 1), k);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** The top of a sea of cloud seen from above, tiling: white where it's thick, grey-blue in the
 *  hollows and lit from one side, and clear between the billows unless it's the bottom layer. */
function cloudTexture(k: number, cover: number): THREE.CanvasTexture {
  const N = 256, c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!, img = g.createImageData(N, N), v = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let f = 0, amp = 0.5, P = 6;
    for (let o = 0; o < 5; o++) { f += amp * tiledNoise((x / N) * P, (y / N) * P, P, k * 10 + o); amp *= 0.5; P *= 2; }
    v[y * N + x] = f / 0.97;
  }
  const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const f = v[y * N + x], lit = f - v[((y + N - 3) % N) * N + ((x + N - 3) % N)];
    const thick = smooth(cover, cover + 0.4, f);
    const w = Math.max(0, Math.min(1, 0.45 + 0.5 * thick + lit * 5));
    const o = (y * N + x) * 4;
    img.data[o] = 150 + 105 * w; img.data[o + 1] = 160 + 95 * w; img.data[o + 2] = 182 + 73 * w;
    img.data[o + 3] = cover < 0 ? 255 : 255 * smooth(cover, cover + 0.18, f);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The sea of cloud under the crag: two drifting layers of billows over a floor of grey cloud. */
function cloudSea() {
  const W = 2400, group = new THREE.Group(), made: { dispose(): void }[] = [];
  const layer = (y: number, k: number, cover: number, tile: number, order: number) => {
    const map = cloudTexture(k, cover);
    map.repeat.set(W / tile, W / tile);
    const geo = new THREE.PlaneGeometry(W, W);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ map, color: "#eef1f6", emissive: "#3c424e", transparent: cover >= 0, depthWrite: cover < 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = y;
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    group.add(mesh);
    made.push(map, geo, mat);
    return map;
  };
  layer(DEPTHS, 3, -1, 340, 0);
  const mid = layer(CLOUD - 13, 2, 0.44, 210, 1), top = layer(CLOUD, 1, 0.52, 290, 2);
  return {
    group,
    drift(t: number) { top.offset.set(t * 0.0008, t * 0.0003); mid.offset.set(-t * 0.0005, t * 0.0007); },
    dispose() { for (const d of made) d.dispose(); },
  };
}

const HOLD_COLOURS = ["#e8323c", "#2f6fe0", "#f5d21f", "#3cc24a", "#a24de0", "#ff5fb0", "#1fc8c8"];
const BOOST_COLOUR = "#ff8a1f";
const REST_COLOUR = "#f2efe6";

/** The crag, built: put group in the scene; holds and ropes change with the route. Everything in it is
 *  placed in the crag's own frame (x along, z out, y up from the foot). */
export function buildCrag(room: Room) {
  const group = new THREE.Group();
  group.position.set(room.ox, room.y0, room.oz);
  group.rotation.y = Math.atan2(room.nx, room.nz);
  const tex = stoneTexture();
  const rock = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, flatShading: true, emissive: "#2a2318", side: THREE.DoubleSide });
  const geo = rockGeometry(), rockGeo = geo.rock, grassGeo = geo.grass;
  const rockMesh = new THREE.Mesh(rockGeo, rock);
  rockMesh.receiveShadow = true; rockMesh.castShadow = true;
  const grassTex = grassTexture(), grassMat = new THREE.MeshLambertMaterial({ map: grassTex, vertexColors: true, emissive: "#1c2410", side: THREE.DoubleSide });
  const grass = new THREE.Mesh(grassGeo, grassMat);
  grass.receiveShadow = true;
  const far = distance();
  const hillMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const heapMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: "#5a606c" });
  const hills = new THREE.Mesh(far.hills, hillMat), heaps = new THREE.Mesh(far.heaps, heapMat), sea = cloudSea();
  hills.frustumCulled = heaps.frustumCulled = false;
  group.add(rockMesh, grass, hills, heaps, sea.group);

  // the holds
  const holdGeo = new THREE.DodecahedronGeometry(0.2), holdMat = new THREE.MeshLambertMaterial({ color: "#ffffff", emissive: "#303030" });
  let holdMesh: THREE.InstancedMesh | null = null;
  function setHolds(route: Route) {
    if (holdMesh) { group.remove(holdMesh); holdMesh.dispose(); }
    const mesh = new THREE.InstancedMesh(holdGeo, holdMat, Math.max(1, route.holds.length));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), out = new THREE.Vector3(0, 0, 1), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    route.holds.forEach((h, i) => {
      const ly = h.y - room.y0, k = h.boost ? 1.5 : 1;
      q.setFromAxisAngle(out, h.rest ? 0 : i * 2.4);
      if (h.rest) sc.set(2.6, 0.75, 1.1); else sc.set(1.2 * k, 0.9 * k, 0.6);
      mesh.setMatrixAt(i, m4.compose(v3.set(h.s, ly, rockOut(h.s, ly) + 0.06), q, sc));
      mesh.setColorAt(i, c.set(h.boost ? BOOST_COLOUR : h.rest ? REST_COLOUR : HOLD_COLOURS[(i * 3) % HOLD_COLOURS.length]));
    });
    mesh.count = route.holds.length;
    mesh.receiveShadow = true;
    holdMesh = mesh;
    group.add(mesh);
  }

  // ropes dropped, and those still coiled on their ledges
  const ropeGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 5), coilGeo = new THREE.TorusGeometry(0.3, 0.09, 5, 10);
  const ropeMat = new THREE.MeshLambertMaterial({ color: "#19b6e6", emissive: "#063a4a" });
  const ropeMesh = new THREE.InstancedMesh(ropeGeo, ropeMat, 8), coilMesh = new THREE.InstancedMesh(coilGeo, ropeMat, 8);
  ropeMesh.count = coilMesh.count = 0;
  group.add(ropeMesh, coilMesh);
  function setRopes(route: Route, down: Set<number>) {
    let n = 0, c = 0;
    const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), none = new THREE.Quaternion();
    route.ledges.forEach((l, k) => {
      if (k === 0) return;
      const ly = l.y - room.y0;
      if (down.has(k)) {
        const len = l.y - l.foot + 0.2;
        ropeMesh.setMatrixAt(n++, m4.compose(v3.set(l.rope, ly - len / 2 + 0.1, ropeOut(l)), none, sc.set(1, len, 1)));
      } else coilMesh.setMatrixAt(c++, m4.compose(v3.set(l.rope, ly + 0.09, coilOut(l)), flat, sc.set(1, 1, 1)));
    });
    ropeMesh.count = n; coilMesh.count = c;
    ropeMesh.instanceMatrix.needsUpdate = true; coilMesh.instanceMatrix.needsUpdate = true;
    // three sizes an instanced mesh once, on its first frame, and never again: with no rope down yet
    // that size is nothing, and a rope dropped later would be culled as out of sight
    ropeMesh.computeBoundingSphere(); coilMesh.computeBoundingSphere();
  }

  // a flag on top, crash mats at the foot, and the sign at the way down
  const white = new THREE.MeshLambertMaterial({ color: "#eeeae0" });
  const flagMat = new THREE.MeshLambertMaterial({ color: "#ff6a1a", emissive: "#6a2400", side: THREE.DoubleSide });
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 6.5, 6), clothGeo = new THREE.PlaneGeometry(3.6, 2);
  const flag = new THREE.Group(), banner = new THREE.Mesh(clothGeo, flagMat), pole = new THREE.Mesh(poleGeo, white);
  pole.position.y = 3.25; banner.position.set(1.8, 5.4, 0);
  flag.add(pole, banner);
  flag.position.set(-3, H, -6);
  const matGeo = new THREE.BoxGeometry(1, 1, 1), matMat = new THREE.MeshLambertMaterial({ color: "#2a56c8" });
  const mats = new THREE.InstancedMesh(matGeo, matMat, 3);
  [[0, 3.2, 5.2, 2.6], [-5, 3.4, 3.2, 2.2], [5.2, 3.4, 3.2, 2.2]].forEach(([s, o, w, d], i) => {
    mats.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(s, 0.08, o), new THREE.Quaternion(), new THREE.Vector3(w, 0.16, d)));
  });
  const signTex = signTexture(), signMat = new THREE.MeshLambertMaterial({ map: signTex, side: THREE.DoubleSide });
  const signGeo = new THREE.PlaneGeometry(1.3, 0.55), sign = new THREE.Mesh(signGeo, signMat);
  sign.position.set(STILE + 1.0, 1.8, FRONT - 0.13);
  group.add(flag, mats, sign);

  return {
    group, banner, setHolds, setRopes, drift: sea.drift,
    dispose() {
      holdMesh?.dispose();
      for (const d of [tex, rock, rockGeo, grassGeo, grassTex, grassMat, far.hills, far.heaps, hillMat, heapMat, sea, holdGeo, holdMat, ropeGeo, coilGeo, ropeMat, ropeMesh, coilMesh,
        white, flagMat, poleGeo, clothGeo, matGeo, matMat, mats, signTex, signMat, signGeo]) d.dispose();
    },
  };
}

/** Where a ledge's rope hangs, out from the face, and where it lies coiled before it's dropped. */
export const ropeOut = (l: Ledge) => l.o + l.d + 0.25;
const coilOut = (l: Ledge) => l.o + Math.max(0.5, l.d - 0.5);

function signTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 108;
  const g = c.getContext("2d")!;
  g.fillStyle = "#6b4a2c"; g.fillRect(0, 0, 256, 108);
  g.strokeStyle = "#f1e6cc"; g.lineWidth = 5; g.strokeRect(7, 7, 242, 94);
  g.fillStyle = "#f1e6cc"; g.font = "bold 34px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("WAY DOWN", 128, 54);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
