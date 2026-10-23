// The canal's banks, laid as the canal was built rather than as the ground's grid can draw them.
//
// The ground in each square of Bath is a grid of points 4 m apart, and the canal, its coping and
// its towpath are narrower than that: laid into the grid, the water's edge and the bank's wander a
// couple of metres either way as they pass between the points, in teeth and ripples, and the
// towpath rises and falls with whatever the survey had there. So here the canal's banks break the
// ground's rule. Along each stretch of open water (not in its tunnels, on the aqueduct or in a
// lock, which canal.ts builds whole) the canal brings its own ground, from tools/canal.py's design
// of each bank:
//
//   the channel's stone side, from under the water up to the coping, just above the water;
//   the bank, level at the coping's height: the towpath on one side, a narrower bank on the other
//     (each squeezed to its coping where a building or a street runs alongside);
//   the verge from the bank's edge to the ground: a grass slope, with a retaining wall at the
//     bank's edge where the ground beyond is more than the slope can take (a cutting above the
//     towpath, or a drop to the railway below it).
//
// The square's own ground is cut away inside that outline, exactly along its edge (each grid point
// carries how far it is inside or outside, which the ground's drawing interpolates across its
// triangles, so the cut runs straight between them), and the verge's outer edge is laid on the
// ground's own surface there, so the two meet. Inside it, the ground's height is the canal's
// (GameMap.ground asks here): you walk on the towpath and the verge as they're drawn.
//
// Nothing here goes over the network: every player builds the same banks from the same canal file.
import * as THREE from "three";
import type { CanalData } from "./canal";

const UP = 0.4;          // the coping and the banks stand this far above the water
const BED = 1.2;         // the bed is this far below it
const COPE = 0.45;       // the coping's width
const SLOPE = 0.6;       // the steepest a verge is laid (rise over run); more than that is a wall
const LOCK_TAIL = 2.2;   // a lock's walls run this far past its gates (canal.ts)
const LOCK_PAVED = 2.15 + 1.2 + 4.5 + 0.3;   // and its coping and paving reach this far from its middle (LOCK_HALF + COPE + APRON), and a little
const DECK = 0.9;         // a bridge's deck, top to underside (world.ts)
const WALL_STEP = 0.5;   // a wall taller than this above the bank stops you walking up it
const APRON = 3;         // how far out the apron lies under the ground beyond the banks' edge (metres, one row a metre)
const FAR = 10;          // how far inside or outside a grid point is counted, at most
const WATER = 2.6;       // half the water's width in a tunnel (tools/canal.py, canal.ts)
const LEDGE = 1.3;       // the towpath's ledge through a tunnel
const CROWN = 3.5;       // the top of a tunnel's arch above the water (canal.ts tunnelBore)

/** A tunnel's lining across the canal (to the left of the way its run goes, positive): its two walls. */
const boreSides = (side: number): [number, number] =>
  [side < 0 ? -(WATER + LEDGE) : -WATER - 0.1, side > 0 ? WATER + LEDGE : WATER + 0.1];

/** One cross-section of the canal, where tools/canal.py has a point. Positions are data
 *  coordinates (x east, y north); heights are above sea level. */
interface Station {
  x: number; y: number; nx: number; ny: number;   // the point, and across to the left (looking along the run)
  half: number; lv: number; bank: number;         // half the water's width, its level, and the banks' (the coping's) height
  w: [number, number]; v: [number, number];       // each bank's width from the water's edge, and its verge's (left, right)
  g: [number, number]; top: [number, number];     // the ground at each verge's outer edge, and the bank's wall top (= the bank if there's no wall)
  tow: number;                                    // the towpath's side: 1 left, -1 right, 0 neither
}

/** A stretch of a canal tunnel between two of the canal's points: the water down the middle and
 *  the towpath's ledge on its side (side: 1 left, -1 right, 0 none; tools/canal.py's "tw"). */
interface Bore { ax: number; ay: number; bx: number; by: number; len: number; lv: number; side: number }

/** A stretch between two stations: what the ground and the drawing go by. */
interface Seg {
  a: Station; b: Station; len: number; ux: number; uy: number;
  capA: boolean; capB: boolean;     // it stops at that end (a lock, a tunnel's portal, the end of the canal)
  boreA: boolean; boreB: boolean;   // at a tunnel's portal
}

export interface Grid { nx: number; ny: number; x0: number; y0: number; dx: number; dy: number }

export class CanalWorks {
  readonly segs: Seg[] = [];
  /** For each grid point, how far inside the canal's outline it is (negative) or outside (positive). */
  readonly sd: Float32Array;
  /** The segs near each grid cell. */
  private cells = new Map<number, number[]>();
  /** Retaining walls taller than a step above the bank: [x0, y0, x1, y1, top], for collision; and
   *  the tunnels' linings, [x0, y0, x1, y1, top, foot], which only stop you inside the tunnel. */
  readonly walls: number[][] = [];
  /** The canal's tunnels where they run through this square. */
  readonly bores: Bore[] = [];
  private boreCells = new Map<number, number[]>();

  /** canal: the canal file; G: this square's grid; ground: its own ground's height at data (x, y). */
  /** under: the lowest bridge deck (or road on one's approach) over data (x, y), above sea level,
   *  or null: the banks' walls stand no higher than its underside, so a road over the canal
   *  crosses clear of them. */
  constructor(canal: CanalData, readonly G: Grid, ground: (x: number, y: number) => number, under?: (x: number, y: number) => number | null) {
    const x0 = G.x0, y0 = G.y0, x1 = G.x0 + (G.nx - 1) * G.dx, y1 = G.y0 + (G.ny - 1) * G.dy;
    // beside a lock, its walls, coping and paving stand on the canal's banks (canal.ts): the banks
    // run on right up to it and alongside it, just under the paving's height (coming down with its
    // wing walls) and out under the whole of its width, so the two meet with nothing between
    const lockBank = (x: number, y: number): number | null => {
      for (const lk of canal.locks) {
        const [lx, ly] = lk.lo, [hx, hy] = lk.hi, L = Math.hypot(hx - lx, hy - ly) || 1;
        const ux = (hx - lx) / L, uy = (hy - ly) / L, u = (x - lx) * ux + (y - ly) * uy, v = Math.abs(-(x - lx) * uy + (y - ly) * ux);
        const wing = lk.tl ?? LOCK_TAIL + (lk.zh - lk.zl) * 6;
        if (v > 12 || u < -wing - 0.5 || u > L + LOCK_TAIL + 0.5) continue;
        const top = u < -LOCK_TAIL ? lk.zl + 0.45 + (lk.zh - lk.zl) * Math.min(1, Math.max(0, (u + wing) / (wing - LOCK_TAIL))) : lk.zh + 0.45;
        return top - 0.05;
      }
      return null;
    };
    for (const run of canal.runs) {
      const p = run.p, n = p.length;
      // only the stretches in or near this square
      let near = false;
      for (const q of p) if (q[0] > x0 - 30 && q[0] < x1 + 30 && q[1] > y0 - 30 && q[1] < y1 + 30) { near = true; break; }
      if (!near) continue;
      // its tunnels: each stretch between two points in one, with the towpath's side through it
      for (let k = 0; k < n - 1; k++) {
        const a = p[k], b = p[k + 1];
        if (!(a[6] & 1) || !(b[6] & 1)) continue;
        if (Math.max(a[0], b[0]) < x0 - 10 || Math.min(a[0], b[0]) > x1 + 10 || Math.max(a[1], b[1]) < y0 - 10 || Math.min(a[1], b[1]) > y1 + 10) continue;
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const t = canal.tunnels.reduce((best, t) => Math.hypot((t.a[0] + t.b[0]) / 2 - mx, (t.a[1] + t.b[1]) / 2 - my) < Math.hypot((best.a[0] + best.b[0]) / 2 - mx, (best.a[1] + best.b[1]) / 2 - my) ? t : best, canal.tunnels[0]);
        this.bores.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], len: Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, lv: run.lv, side: t?.tw ?? 0 });
      }
      const st: (Station | null)[] = p.map((q, k) => {
        if (q[6] & 3) return null;
        if (q[0] < x0 - 40 || q[0] > x1 + 40 || q[1] < y0 - 40 || q[1] > y1 + 40) return null;
        const a = p[Math.max(0, k - 1)], b = p[Math.min(n - 1, k + 1)], tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
        const w: [number, number] = [q[7] ?? 1.6, q[8] ?? 1.6], v: [number, number] = [q[9] ?? 2, q[10] ?? 2];
        const atLock = lockBank(q[0], q[1]);
        if (atLock !== null) for (const j of [0, 1]) w[j] = Math.max(w[j], LOCK_PAVED - q[2]);
        return { x: q[0], y: q[1], nx: -ty / tl, ny: tx / tl, half: q[2], lv: run.lv, bank: atLock ?? run.lv + UP, w, v, g: [0, 0], top: [0, 0], tow: w[0] > w[1] ? 1 : w[1] > w[0] ? -1 : 0 };
      });
      // the ground at each verge's outer edge, and where it's more than the verge can take, a wall
      // at the bank's edge (its top evened out along the bank, so it doesn't jump from point to point)
      const diff: [number, number][] = st.map((s) => {
        if (!s) return [0, 0];
        const d: [number, number] = [0, 0];
        for (const k of [0, 1]) {
          const side = k === 0 ? 1 : -1, c = s.half + s.w[k] + s.v[k];
          s.g[k] = ground(s.x + s.nx * c * side, s.y + s.ny * c * side);
          d[k] = s.g[k] - s.bank;
        }
        return d;
      });
      st.forEach((s, k) => {
        if (!s) return;
        for (const j of [0, 1]) {
          let sum = 0, cnt = 0;
          for (let i = Math.max(0, k - 1); i <= Math.min(n - 1, k + 1); i++) if (st[i]) { sum += diff[i][j]; cnt++; }
          const d = sum / cnt, room = s.v[j] * SLOPE;
          s.top[j] = s.bank + Math.sign(d) * Math.max(0, Math.abs(d) - room);
          // under a bridge, the wall stops at the deck's underside (its abutment carries on up)
          const side = j === 0 ? 1 : -1, o = (s.half + s.w[j]) * side, deck = under?.(s.x + s.nx * o, s.y + s.ny * o);
          if (deck != null && deck > s.bank + 0.5) s.top[j] = Math.min(s.top[j], Math.max(s.bank, deck - DECK));
        }
      });
      for (let k = 0; k < n - 1; k++) {
        const a = st[k], b = st[k + 1];
        if (!a || !b) continue;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 0.05) continue;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (mx < x0 - 20 || mx > x1 + 20 || my < y0 - 20 || my > y1 + 20) continue;
        this.segs.push({ a, b, len, ux: (b.x - a.x) / len, uy: (b.y - a.y) / len, capA: !st[k - 1], capB: !st[k + 2], boreA: k > 0 && !!(p[k - 1][6] & 1), boreB: k + 2 < n && !!(p[k + 2][6] & 1) });
      }
    }
    this.sd = new Float32Array(G.nx * G.ny).fill(FAR);
    this.segs.forEach((s, i) => {
      const reach = Math.max(...[s.a, s.b].flatMap((t) => [t.half + t.w[0] + t.v[0], t.half + t.w[1] + t.v[1]])) + G.dx * 1.5;
      const bx0 = Math.min(s.a.x, s.b.x) - reach, bx1 = Math.max(s.a.x, s.b.x) + reach;
      const by0 = Math.min(s.a.y, s.b.y) - reach, by1 = Math.max(s.a.y, s.b.y) + reach;
      const i0 = Math.max(0, Math.floor((bx0 - G.x0) / G.dx)), i1 = Math.min(G.nx - 1, Math.ceil((bx1 - G.x0) / G.dx));
      const j0 = Math.max(0, Math.floor((by0 - G.y0) / G.dy)), j1 = Math.min(G.ny - 1, Math.ceil((by1 - G.y0) / G.dy));
      for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
        const v = j * G.nx + ii, d = this.inside(s, G.x0 + ii * G.dx, G.y0 + j * G.dy);
        if (d < this.sd[v]) this.sd[v] = d;
        if (ii < G.nx - 1 && j < G.ny - 1) {
          const c = j * G.nx + ii, list = this.cells.get(c);
          if (list) { if (list[list.length - 1] !== i) list.push(i); } else this.cells.set(c, [i]);
        }
      }
    });
    for (let v = 0; v < this.sd.length; v++) this.sd[v] = Math.max(-FAR, Math.min(FAR, this.sd[v]));
    // the tunnels: which cells they pass through, and their linings, standing from the bed to the
    // crown, so they only stop you down in the tunnel, not on the street over it
    this.bores.forEach((b, i) => {
      const r = WATER + LEDGE + 1;
      const i0 = Math.max(0, Math.floor((Math.min(b.ax, b.bx) - r - G.x0) / G.dx)), i1 = Math.min(G.nx - 2, Math.floor((Math.max(b.ax, b.bx) + r - G.x0) / G.dx));
      const j0 = Math.max(0, Math.floor((Math.min(b.ay, b.by) - r - G.y0) / G.dy)), j1 = Math.min(G.ny - 2, Math.floor((Math.max(b.ay, b.by) + r - G.y0) / G.dy));
      for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
        const c = j * G.nx + ii, list = this.boreCells.get(c);
        if (list) list.push(i); else this.boreCells.set(c, [i]);
      }
      const nx = -(b.by - b.ay) / b.len, ny = (b.bx - b.ax) / b.len;
      for (const o of boreSides(b.side)) this.walls.push([b.ax + nx * o, b.ay + ny * o, b.bx + nx * o, b.by + ny * o, b.lv + CROWN, b.lv - BED]);
    });
    // retaining walls you can't walk up, along the banks' edges
    for (const s of this.segs) for (const k of [0, 1]) {
      const side = k === 0 ? 1 : -1, ta = s.a.top[k] - s.a.bank, tb = s.b.top[k] - s.b.bank;
      if (Math.max(ta, tb) < WALL_STEP) continue;
      const oa = (s.a.half + s.a.w[k]) * side, ob = (s.b.half + s.b.w[k]) * side;
      this.walls.push([s.a.x + s.a.nx * oa, s.a.y + s.a.ny * oa, s.b.x + s.b.nx * ob, s.b.y + s.b.ny * ob, Math.max(s.a.top[k], s.b.top[k])]);
    }
  }

  get empty() { return this.segs.length === 0 && this.bores.length === 0; }

  /** What there is to stand on in one of the canal's tunnels at data (x, y), for feet at h (above
   *  sea level): the towpath's ledge, or the bed under the water, while you're down in the bore
   *  under the arch; or null (outside it, or up on the street over it). */
  bore(x: number, y: number, h: number): number | null {
    const G = this.G, i = Math.floor((x - G.x0) / G.dx), j = Math.floor((y - G.y0) / G.dy);
    const list = this.boreCells.get(j * G.nx + i);
    if (!list) return null;
    for (const k of list) {
      const b = this.bores[k], ux = (b.bx - b.ax) / b.len, uy = (b.by - b.ay) / b.len;
      const t = ((x - b.ax) * ux + (y - b.ay) * uy) / b.len;
      if (t < -0.02 || t > 1.02) continue;
      const o = -(x - b.ax) * uy + (y - b.ay) * ux, [lo, hi] = boreSides(b.side);
      if (o < lo || o > hi || h > b.lv + CROWN - 0.3) continue;      // (well over a jump above the ledge, and under the street above)
      return b.side && o * b.side > WATER ? b.lv + UP : b.lv - BED;
    }
    return null;
  }

  /** Where (x, y) is on seg s: how far along (0 to 1, not clamped) and across (to the left, signed). */
  private place(s: Seg, x: number, y: number): [number, number] {
    const t = ((x - s.a.x) * s.ux + (y - s.a.y) * s.uy) / s.len;
    const tt = Math.min(1, Math.max(0, t));
    const nx = s.a.nx + (s.b.nx - s.a.nx) * tt, ny = s.a.ny + (s.b.ny - s.a.ny) * tt, nl = Math.hypot(nx, ny) || 1;
    const cx = s.a.x + (s.b.x - s.a.x) * tt, cy = s.a.y + (s.b.y - s.a.y) * tt;
    return [t, ((x - cx) * nx + (y - cy) * ny) / nl];
  }

  /** How far (x, y) is inside the outline of seg s (negative inside). */
  private inside(s: Seg, x: number, y: number): number {
    const [t, o] = this.place(s, x, y), tt = Math.min(1, Math.max(0, t)), A = s.a, B = s.b;
    const cl = A.half + A.w[0] + A.v[0] + (B.half + B.w[0] + B.v[0] - A.half - A.w[0] - A.v[0]) * tt;
    const cr = A.half + A.w[1] + A.v[1] + (B.half + B.w[1] + B.v[1] - A.half - A.w[1] - A.v[1]) * tt;
    let d = Math.max(o - cl, -o - cr);
    // past the end of a stretch: cut off square where it stops (at a tunnel's portal or a lock),
    // and where it carries on into the next, left to that one after a little overlap
    const past = Math.max(-t * s.len, (t - 1) * s.len);
    if (past > 0) d = Math.max(d, (t < 0 ? s.capA : s.capB) ? past : past - 2.5);
    return d;
  }

  /** The canal's ground at data (x, y), where its outline takes it in (above sea level), or null. */
  height(x: number, y: number): number | null {
    const G = this.G, i = Math.floor((x - G.x0) / G.dx), j = Math.floor((y - G.y0) / G.dy);
    const list = this.cells.get(j * G.nx + i);
    if (!list) return null;
    let best: Seg | null = null, bd = 0, bt = 0, bo = 0;
    for (const k of list) {
      const s = this.segs[k], d = this.inside(s, x, y);
      if (d < bd) { bd = d; best = s; [bt, bo] = this.place(s, x, y); }
    }
    if (!best) return null;
    const t = Math.min(1, Math.max(0, bt)), A = best.a, B = best.b, k = bo >= 0 ? 0 : 1, ao = Math.abs(bo);
    const L = (a: number, b: number) => a + (b - a) * t;
    const half = L(A.half, B.half), lv = L(A.lv, B.lv), w = L(A.w[k], B.w[k]), v = L(A.v[k], B.v[k]);
    if (ao < half) return lv - BED;
    if (ao < half + w) return L(A.bank, B.bank);
    const top = L(A.top[k], B.top[k]), g = L(A.g[k], B.g[k]);
    return top + (g - top) * Math.min(1, (ao - half - w) / (v || 1));
  }

  /** Is the middle of quad P inside the banks somewhere (where the apron would lie over another
   *  stretch's water, at a junction or a lock)? */
  private within(P: number[][]): boolean {
    return this.height((P[0][0] + P[1][0] + P[2][0] + P[3][0]) / 4, (P[0][1] + P[1][1] + P[2][1] + P[3][1]) / 4) !== null;
  }

  /** If data (x, y) is over the canal's water or on its banks (the towpath), the banks' height
   *  there (above sea level), else null: what a bridge over the canal has to leave open, for the
   *  boats and for walking under it along the towpath. */
  across(x: number, y: number): number | null {
    const G = this.G, i = Math.floor((x - G.x0) / G.dx), j = Math.floor((y - G.y0) / G.dy);
    const list = this.cells.get(j * G.nx + i);
    if (!list) return null;
    for (const k of list) {
      const s = this.segs[k], [t, o] = this.place(s, x, y);
      if (t < -0.02 || t > 1.02) continue;
      const tt = Math.min(1, Math.max(0, t)), A = s.a, B = s.b, side = o >= 0 ? 0 : 1;
      const L = (a: number, b: number) => a + (b - a) * tt;
      if (Math.abs(o) < L(A.half, B.half) + L(A.w[side], B.w[side])) return L(A.bank, B.bank);
    }
    return null;
  }

  /** The canal's banks for drawing: the channel's sides, the coping, the banks, the walls and the
   *  verges, in scene coordinates. drawn: the height the square's ground is drawn at, at data
   *  (x, y) (above sea level), for the verges' outer edges to lie on. colour: the ground's colour there. */
  geometry(z0: number, drawn: (x: number, y: number) => number, colour: (x: number, y: number) => THREE.Color): THREE.BufferGeometry | null {
    if (!this.segs.length) return null;
    const G = this.G;
    const pos: number[] = [], col: number[] = [], uv: number[] = [];
    const STONE = new THREE.Color("#b3a37f"), COPING = new THREE.Color("#a89c86"), TOWPATH = new THREE.Color("#a39478"), GRASS = new THREE.Color("#6e7f4c");
    const vert = (x: number, y: number, h: number, c: THREE.Color, u: number, w: number) => { pos.push(x, h - z0, -y); col.push(c.r, c.g, c.b); uv.push(u, w); };
    // a quad from four points [x, y, height], with the ground texture laid flat (or up a wall)
    const quad = (P: number[][], c: THREE.Color | THREE.Color[], wall = false) => {
      const C = Array.isArray(c) ? c : [c, c, c, c];
      const U = P.map((p, i) => wall ? [(i === 0 || i === 3 ? 0 : 1) * Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]) / 7, p[2] / 7] : [p[0] / 7, -p[1] / 7]);
      for (const i of [0, 1, 2, 0, 2, 3]) vert(P[i][0], P[i][1], P[i][2], C[i], U[i][0], U[i][1]);
    };
    // where along a straight line from (ax, ay) to (bx, by) it crosses the ground's grid lines and
    // the diagonals of its triangles, so a verge's edge laid on the ground bends where the ground does
    const crossings = (ax: number, ay: number, bx: number, by: number): number[] => {
      const ts = [0, 1];
      const fa = (ax - G.x0) / G.dx, fb = (bx - G.x0) / G.dx, ga = (ay - G.y0) / G.dy, gb = (by - G.y0) / G.dy;
      const cut = (a: number, b: number) => {
        if (Math.abs(b - a) < 1e-9) return;
        for (let k = Math.ceil(Math.min(a, b)); k <= Math.floor(Math.max(a, b)); k++) { const t = (k - a) / (b - a); if (t > 1e-4 && t < 1 - 1e-4) ts.push(t); }
      };
      cut(fa, fb); cut(ga, gb); cut(fa + ga, fb + gb);
      return ts.sort((p, q) => p - q);
    };
    for (const s of this.segs) {
      const A = s.a, B = s.b;
      const at = (S: Station, o: number): [number, number] => [S.x + S.nx * o, S.y + S.ny * o];
      for (const k of [0, 1]) {
        const side = k === 0 ? 1 : -1;
        const P = (S: Station, o: number, h: number) => { const [x, y] = at(S, o * side); return [x, y, h]; };
        const lvA = A.bank, lvB = B.bank;
        // the channel's side, from under the water up to the coping, facing the water
        quad([P(A, A.half, A.lv - 0.6), P(B, B.half, B.lv - 0.6), P(B, B.half, lvB), P(A, A.half, lvA)], STONE, true);
        // the coping, then the bank (the towpath, or grass on the far side)
        const ca = Math.min(COPE, A.w[k]), cb = Math.min(COPE, B.w[k]);
        quad([P(A, A.half, lvA), P(B, B.half, lvB), P(B, B.half + cb, lvB), P(A, A.half + ca, lvA)], COPING);
        if (A.w[k] > ca + 0.01 || B.w[k] > cb + 0.01) {
          const bank = A.tow === side ? TOWPATH : GRASS;
          quad([P(A, A.half + ca, lvA), P(B, B.half + cb, lvB), P(B, B.half + B.w[k], lvB), P(A, A.half + A.w[k], lvA)], bank);
        }
        // the wall at the bank's edge, up or down to its top, and the verge from there to the
        // ground, its outer edge laid on the ground as it's drawn: in pieces between the places
        // that edge crosses the ground's grid, so it bends with the ground's triangles
        const ea = A.half + A.w[k], eb = B.half + B.w[k], fa = ea + A.v[k], fb = eb + B.v[k];
        const [oax, oay] = at(A, fa * side), [obx, oby] = at(B, fb * side);
        const ts = crossings(oax, oay, obx, oby);
        for (let i = 0; i < ts.length - 1; i++) {
          const t0 = ts[i], t1 = ts[i + 1];
          const mid = (t: number) => {
            const S: Station = {
              ...A, x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, nx: A.nx + (B.nx - A.nx) * t, ny: A.ny + (B.ny - A.ny) * t,
              half: A.half + (B.half - A.half) * t, lv: A.lv + (B.lv - A.lv) * t, bank: A.bank + (B.bank - A.bank) * t,
            };
            const nl = Math.hypot(S.nx, S.ny) || 1; S.nx /= nl; S.ny /= nl;
            const e = ea + (eb - ea) * t, f = fa + (fb - fa) * t, top = A.top[k] + (B.top[k] - A.top[k]) * t;
            const [ox, oy] = at(S, f * side), [ex, ey] = at(S, e * side);
            return { ex, ey, ox, oy, e: S.bank, top, g: drawn(ox, oy), nx: S.nx * side, ny: S.ny * side };
          };
          const p = mid(t0), q = mid(t1);
          if (Math.abs(p.top - p.e) > 0.02 || Math.abs(q.top - q.e) > 0.02)
            quad([[p.ex, p.ey, p.e], [q.ex, q.ey, q.e], [q.ex, q.ey, q.top], [p.ex, p.ey, p.top]], STONE, true);
          const gp = colour(p.ox, p.oy), gq = colour(q.ox, q.oy);
          quad([[p.ex, p.ey, p.top], [q.ex, q.ey, q.top], [q.ox, q.oy, q.g], [p.ox, p.oy, p.g]], [gp, gq, gq, gp]);
          // and a skirt hanging just under the edge, so no hairline shows where it meets the ground
          quad([[p.ox, p.oy, p.g], [q.ox, q.oy, q.g], [q.ox, q.oy, q.g - 0.5], [p.ox, p.oy, p.g - 0.5]], [gp, gq, gq, gp], true);
          // and an apron of ground lying just under the ground's own, out beyond the edge: the
          // ground's cut runs straight across each of its triangles, so here and there it takes a
          // sliver beyond the edge, and that shows the apron rather than the sky
          for (let r = 0; r < APRON; r++) {
            const out = (m: typeof p, d: number): number[] => { const x = m.ox + m.nx * d, y = m.oy + m.ny * d; return [x, y, drawn(x, y) - 0.1]; };
            const P4 = [out(p, r), out(q, r), out(q, r + 1), out(p, r + 1)];
            if (!this.within(P4)) quad(P4, [gp, gq, gq, gp]);
          }
        }
      }
      // and past each end where the banks stop square (at a lock, or the canal's end; not at a
      // tunnel's portal, where it would close the tunnel's mouth), across the whole outline
      for (const [S, stop, bore, dir] of [[A, s.capA, s.boreA, -1], [B, s.capB, s.boreB, 1]] as const) {
        if (!stop || bore) continue;
        const l = S.half + S.w[0] + S.v[0], r = S.half + S.w[1] + S.v[1], steps = Math.max(1, Math.ceil((l + r) / 2));
        for (let i = 0; i < steps; i++) for (let j = 0; j < APRON; j++) {
          const pt = (o: number, d: number): number[] => {
            const x = S.x + S.nx * o + s.ux * dir * d, y = S.y + S.ny * o + s.uy * dir * d;
            return [x, y, drawn(x, y) - 0.1];
          };
          const o0 = l - ((l + r) * i) / steps, o1 = l - ((l + r) * (i + 1)) / steps, c0 = colour(...(pt(o0, j).slice(0, 2) as [number, number]));
          const P4 = [pt(o0, j), pt(o1, j), pt(o1, j + 1), pt(o0, j + 1)];
          if (!this.within(P4)) quad(P4, c0);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }
}
