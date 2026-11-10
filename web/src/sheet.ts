// The ground as one sheet with the street, pavement and path faces (`gs`, written by
// tools/partition/sheet.py; drawn unless ?ground=old). With ?ground=sheet, every grid cell a face's free edge passes
// through is cut along those edges, and only what lies outside the faces is drawn, filled between the
// cell's corners and the edges at the height the ground meets each face there; a cell wholly under
// faces draws no ground. Built as a square loads, from its `sf` and `gs`: world.ts draws the fill with
// the grid and stands you on it. The checks build the same with tools/partition/sheet.py's `Land`.
// Without it, as the game draws it (buildSheetCdt), the open ground round the faces is triangulated in
// one piece, its corners on a face's edge only where the face has one, a few milliseconds at a time
// with the triangulation itself in a worker (delaunay.ts); the checks read that through tools/sheet_cdt.mjs.
// Nothing here goes over the network.
import { ShapeUtils, Vector2 } from "three";
import Constrainautor from "@kninnug/constrainautor";
import { delaunayHere, delaunayOffMain, type Triangulation } from "./delaunay";

export interface SheetGrid { x0: number; y0: number; dx: number; dy: number; nx: number; ny: number }

/** A free edge's ends (data x, y) and the ground's height where it meets the face there, its land on the right. */
export interface FreeEdges { ax: Float64Array; ay: Float64Array; ah: Float64Array; bx: Float64Array; by: Float64Array; bh: Float64Array; n: number }

export interface Sheet {
  /** Each cell: 0 the grid's two triangles, 1 under faces (no ground), 2 cut along the faces' edges. */
  state: Uint8Array;
  /** The fill's own points: data x, y, and scene height. */
  px: Float64Array; py: Float64Array; ph: Float64Array;
  /** The fill's triangles, three point numbers each: a grid point's own, or the grid's count plus a fill point's. */
  tri: Int32Array;
  /** Each cell's triangles are tri[3 * start[c] .. 3 * start[c + 1]]. */
  start: Int32Array;
  /** ?ground=cdt: a fill triangle can reach over several cells, so each cell lists every triangle
   *  over it, for heights (fillAt), as triangle numbers ids[start[c] .. start[c + 1]]. */
  near?: { start: Int32Array; ids: Int32Array };
}

/** A few milliseconds of building at a time: `due()` says when this slice has had its time (it looks
 *  at the clock only every so often), `go()` starts the next once the build is back. */
export class Slice {
  private t = performance.now(); private n = 0;
  constructor(private ms = 4) {}
  due() { if (++this.n & 31) return false; return performance.now() - this.t >= this.ms; }
  go() { this.t = performance.now(); this.n = 0; }
}

/** Set by a build waiting on a worker as it yields: tiles.ts moves on to other squares meanwhile,
 *  rather than asking it again and again in the same frame. */
export const buildWait = { on: false };

/** A sliced build run straight through, for the tools and the map built whole at the start. */
export function drain<T>(g: Generator<void, T>): T {
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

/** The cells gs marks as under faces (wholly, or at their south-west corner where a free edge
 *  crosses them), from `gs.c`'s run lengths. */
export function coveredCells(runs: ArrayLike<number>, cells: number): Uint8Array {
  const out = new Uint8Array(cells);
  let at = 0, on = false;
  for (let k = 0; k < runs.length; k++) { if (on) out.fill(1, at, Math.min(cells, at + runs[k])); at += runs[k]; on = !on; }
  return out;
}

/** Where a free edge from a to b lies on the grid: its ends (clipped to the grid, where it reaches
 *  past it) and every point where it crosses a grid line between, in order, as data x, y and how far
 *  from a to b (0 to 1); nothing if it lies wholly off the grid. Each crossing is put exactly on its
 *  line, so both cells get the same point, and the faces split their edges at these same points
 *  (sheetFaces), so the ground and the faces share every corner. */
export function edgeCuts(G: SheetGrid, ax: number, ay: number, bx: number, by: number): number[][] {
  const { x0, y0, dx, dy, nx, ny } = G;
  const X1 = x0 + (nx - 1) * dx, Y1 = y0 + (ny - 1) * dy;
  // (clipped to the grid: a face at the square's edge reaches a few millimetres past its last line)
  const ex = bx - ax, ey = by - ay;
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number) => { if (p === 0) return q >= 0; const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
  if (!clip(-ex, ax - x0) || !clip(ex, X1 - ax) || !clip(-ey, ay - y0) || !clip(ey, Y1 - ay) || t1 - t0 < 1e-12) return [];
  // (a clipped end lies on the grid's edge exactly, so it counts as on its cell's edge)
  const snap = (q: number[]) => { if (Math.abs(q[0] - x0) < 1e-9) q[0] = x0; if (Math.abs(q[0] - X1) < 1e-9) q[0] = X1; if (Math.abs(q[1] - y0) < 1e-9) q[1] = y0; if (Math.abs(q[1] - Y1) < 1e-9) q[1] = Y1; return q; };
  const a = t0 > 0 ? snap([ax + ex * t0, ay + ey * t0, t0]) : [ax, ay, 0];
  const b = t1 < 1 ? snap([ax + ex * t1, ay + ey * t1, t1]) : [bx, by, 1];
  const cuts: number[][] = [a];
  const fx0 = (a[0] - x0) / dx, fx1 = (b[0] - x0) / dx, fy0 = (a[1] - y0) / dy, fy1 = (b[1] - y0) / dy;
  for (let i = Math.ceil(Math.min(fx0, fx1)); i <= Math.floor(Math.max(fx0, fx1)); i++) {
    const lx = x0 + i * dx;
    if (lx === a[0] || lx === b[0] || b[0] === a[0]) continue;
    const t = (lx - a[0]) / (b[0] - a[0]);
    if (t > 0 && t < 1) cuts.push([lx, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }
  for (let j = Math.ceil(Math.min(fy0, fy1)); j <= Math.floor(Math.max(fy0, fy1)); j++) {
    const ly = y0 + j * dy;
    if (ly === a[1] || ly === b[1] || b[1] === a[1]) continue;
    const t = (ly - a[1]) / (b[1] - a[1]);
    if (t > 0 && t < 1) cuts.push([a[0] + (b[0] - a[0]) * t, ly, a[2] + (b[2] - a[2]) * t]);
  }
  cuts.push(b);
  return cuts.sort((p, q) => p[2] - q[2]);
}

interface Piece { sx: number; sy: number; sh: number; ex: number; ey: number; eh: number; used: boolean }
interface Pt { x: number; y: number; h: number; k: number }   // k: a grid point's number, or -1

/** Cut every cell the free edges cross, and fill what lies outside the faces. `corner` is each grid
 *  point's scene height, `covered` the cells gs marks as under faces. */
export function buildSheet(G: SheetGrid, corner: (k: number) => number, covered: Uint8Array, E: FreeEdges, odd: ArrayLike<number> = []): Sheet {
  return drain(buildSheetGen(G, corner, covered, E, odd));
}

/** buildSheet a few milliseconds at a time. */
export function* buildSheetGen(G: SheetGrid, corner: (k: number) => number, covered: Uint8Array, E: FreeEdges, odd: ArrayLike<number> = [], sl = new Slice()): Generator<void, Sheet> {
  const { x0, y0, dx, dy, nx, ny } = G, cw = nx - 1, ch = ny - 1;
  const lineX = (i: number) => x0 + i * dx, lineY = (j: number) => y0 + j * dy;
  const byCell = new Map<number, Piece[]>();
  for (let s = 0; s < E.n; s++) {
    if (sl.due()) { yield; sl.go(); }
    const ah = E.ah[s], bh = E.bh[s];
    const cuts = edgeCuts(G, E.ax[s], E.ay[s], E.bx[s], E.by[s]).map(([x, y, t]) => [x, y, ah + (bh - ah) * t, t]);
    for (let k = 0; k + 1 < cuts.length; k++) {
      const p = cuts[k], q = cuts[k + 1];
      if (p[0] === q[0] && p[1] === q[1]) continue;
      const mi = Math.min(cw - 1, Math.max(0, Math.floor(((p[0] + q[0]) / 2 - x0) / dx)));
      const mj = Math.min(ch - 1, Math.max(0, Math.floor(((p[1] + q[1]) / 2 - y0) / dy)));
      const c = mj * cw + mi;
      let list = byCell.get(c);
      if (!list) byCell.set(c, (list = []));
      list.push({ sx: p[0], sy: p[1], sh: p[2], ex: q[0], ey: q[1], eh: q[2], used: false });
    }
  }

  const state = new Uint8Array(cw * ch);
  for (let c = 0; c < state.length; c++) if (covered[c] && !byCell.has(c)) state[c] = 1;
  // (where faces overlap, the cell is drawn whole, as the grid let down under them: cut, it would fill
  // the wrong side of an edge, and left out, the part no face covers was a hole)
  for (let k = 0; k < odd.length; k++) { byCell.delete(odd[k]); state[odd[k]] = 0; }
  const px: number[] = [], py: number[] = [], ph: number[] = [], tri: number[] = [];
  const own = new Map<string, number>();
  const NG = nx * ny;
  const point = (q: Pt) => {
    if (q.k >= 0) return q.k;
    const key = `${q.x},${q.y}`;
    let k = own.get(key);
    if (k === undefined) { own.set(key, (k = px.length)); px.push(q.x); py.push(q.y); ph.push(q.h); }
    return NG + k;
  };
  const cellTris = new Map<number, number[]>();
  for (const [c, pieces] of byCell) {
    if (sl.due()) { yield; sl.go(); }
    const i = c % cw, j = (c - i) / cw;
    const xa = lineX(i), xb = lineX(i + 1), ya = lineY(j), yb = lineY(j + 1);
    const corners: Pt[] = [
      { x: xa, y: ya, h: corner(j * nx + i), k: j * nx + i }, { x: xa, y: yb, h: corner((j + 1) * nx + i), k: (j + 1) * nx + i },
      { x: xb, y: yb, h: corner((j + 1) * nx + i + 1), k: (j + 1) * nx + i + 1 }, { x: xb, y: ya, h: corner(j * nx + i + 1), k: j * nx + i + 1 },
    ];
    const tris = fillCell(pieces, xa, xb, ya, yb, corners, !!covered[c]);
    if (!tris) continue;          // (cut it couldn't be: the grid's two triangles are drawn)
    state[c] = 2;
    const out: number[] = [];
    for (const q of tris) out.push(point(q));
    cellTris.set(c, out);
  }
  // A cell drawn whole beside a cut one (faces overlapping in it, or a cut that didn't close up) meets
  // it along a straight side, where the cut cell's ground comes up to a face's edge part way along:
  // the gap between, a crack the sky showed through, is closed with a strip of ground standing in
  // the side, from the whole cell's edge up to the cut cell's (drawn from both faces, as either may
  // be the one in view). Drawing the whole cell through the cut cell's points instead stood its
  // ground up over the faces in it.
  const sides = new Map<number, Pt[]>();
  for (const [c, pieces] of byCell) {
    if (!cellTris.has(c)) continue;
    const i = c % cw, j = (c - i) / cw;
    const xa = lineX(i), xb = lineX(i + 1), ya = lineY(j), yb = lineY(j + 1);
    for (const p of pieces) for (const [x, y, h] of [[p.sx, p.sy, p.sh], [p.ex, p.ey, p.eh]]) {
      if ((x === xa || x === xb) && (y === ya || y === yb)) continue;
      const n = x === xa && i > 0 ? c - 1 : x === xb && i < cw - 1 ? c + 1 : y === ya && j > 0 ? c - cw : y === yb && j < ch - 1 ? c + cw : -1;
      if (n < 0 || cellTris.has(n) || state[n] === 1) continue;
      (sides.get(n) ?? sides.set(n, []).get(n)!).push({ x, y, h, k: -1 });
    }
  }
  const foot = new Map<string, number>();
  const footPoint = (x: number, y: number, h: number) => {
    const key = `${x},${y}`;
    let k = foot.get(key);
    if (k === undefined) { foot.set(key, (k = px.length)); px.push(x); py.push(y); ph.push(h); }
    return NG + k;
  };
  for (const [c, extra] of sides) {
    if (sl.due()) { yield; sl.go(); }
    const i = c % cw, j = (c - i) / cw;
    const xa = lineX(i), xb = lineX(i + 1), ya = lineY(j), yb = lineY(j + 1);
    const ka = j * nx + i, kb = j * nx + i + 1, kc = (j + 1) * nx + i, kd = (j + 1) * nx + i + 1;
    const out = [ka, kb, kc, kb, kd, kc];
    // each side as its two grid points and the straight line between them
    const sideOf = (q: Pt): [number, number, number] => q.x === xa ? [ka, kc, (q.y - ya) / (yb - ya)] : q.x === xb ? [kb, kd, (q.y - ya) / (yb - ya)] : q.y === ya ? [ka, kb, (q.x - xa) / (xb - xa)] : [kc, kd, (q.x - xa) / (xb - xa)];
    const bySide = new Map<string, { a: number; b: number; pts: [number, Pt][] }>();
    for (const q of extra) {
      const [a, b, t] = sideOf(q), key = `${a},${b}`;
      (bySide.get(key) ?? bySide.set(key, { a, b, pts: [] }).get(key)!).pts.push([t, q]);
    }
    for (const { a, b, pts } of bySide.values()) {
      pts.sort((p, q) => p[0] - q[0]);
      const ha = corner(a), hb = corner(b);
      // along the side: its top (the cut cell's points between the grid points) over its foot (the line)
      const top = [a, ...pts.map(([, q]) => point(q)), b];
      const bot = [a, ...pts.map(([t, q]) => footPoint(q.x, q.y, ha + (hb - ha) * t)), b];
      for (let m = 0; m + 1 < top.length; m++) {
        const quad = [[top[m], bot[m], bot[m + 1]], [top[m], bot[m + 1], top[m + 1]]];
        for (const [p, q, r] of quad) {
          if (p === q || q === r || p === r) continue;
          out.push(p, q, r, p, r, q);
        }
      }
    }
    state[c] = 2;
    cellTris.set(c, out);
  }
  const start = new Int32Array(state.length + 1);
  for (let c = 0; c < state.length; c++) {
    start[c] = tri.length / 3;
    const t = cellTris.get(c);
    if (t) for (const k of t) tri.push(k);
  }
  start[state.length] = tri.length / 3;
  return { state, px: Float64Array.from(px), py: Float64Array.from(py), ph: Float64Array.from(ph), tri: Int32Array.from(tri), start };
}

const BANK = 0.25;   // metres a grid point beside a face's edge may stand off the edge's height and still be left out

class FlipSet {
  private on: Uint8Array; private list: number[] = [];
  constructor(n: number) { this.on = new Uint8Array(n); }
  add(i: number) { if (!this.on[i]) { this.on[i] = 1; this.list.push(i); } return this; }
  delete(i: number) { this.on[i] = 0; return this; }
  has(i: number) { return this.on[i] === 1; }
  set(i: number, v: boolean) { if (v) this.add(i); else this.on[i] = 0; return v; }
  forEach(fn: (i: number) => void) { const l = this.list; this.list = []; for (const i of l) if (this.on[i]) fn(i); return this; }
}

/** The open ground round the faces as one constrained Delaunay
 *  triangulation (Delaunator, Constrainautor) of the grid's points and the faces' free edges, so the
 *  ground has a corner along a face's edge only where the face has one, and the faces needn't be split
 *  where the edge crosses the grid. Only the cells the free edges pass through, and those round them,
 *  are triangulated: elsewhere the grid's two triangles stay, and where the two meet there are only
 *  grid points, so they close up. A grid point within `clear` metres of a free edge is left out: kept,
 *  it made slivers between itself and the edge. What lies inside a face (`faceTop` finite) draws no
 *  ground. Returns the same as buildSheet, with `near` for heights, and the middles (x, y in turn) of
 *  any free edges that couldn't be held (crossing one already held). */
export function buildSheetCdt(G: SheetGrid, corner: (k: number) => number, covered: Uint8Array, E: FreeEdges, faceTop: (x: number, y: number) => number, clear = 0.3, odd: ArrayLike<number> = []): Sheet & { lost: number[] } {
  return drain(buildSheetCdtGen(G, corner, covered, E, faceTop, clear, false, odd));
}

/** buildSheetCdt a few milliseconds at a time, its triangulation in a worker if `offMain` (waiting
 *  on it with buildWait set). */
export function* buildSheetCdtGen(G: SheetGrid, corner: (k: number) => number, covered: Uint8Array, E: FreeEdges, faceTop: (x: number, y: number) => number, clear = 0.3, offMain = false, odd: ArrayLike<number> = [], sl = new Slice()): Generator<void, Sheet & { lost: number[] }> {
  const { x0, y0, dx, dy, nx, ny } = G, cw = nx - 1, ch = ny - 1, NG = nx * ny;
  const cellOf = (x: number, y: number) => Math.min(ch - 1, Math.max(0, Math.floor((y - y0) / dy))) * cw + Math.min(cw - 1, Math.max(0, Math.floor((x - x0) / dx)));
  // each free edge clipped to the grid, and the cells it passes through
  const sx: number[] = [], sy: number[] = [], sh: number[] = [], ex: number[] = [], ey: number[] = [], eh: number[] = [];
  const segsIn = new Map<number, number[]>();
  for (let s = 0; s < E.n; s++) {
    if (sl.due()) { yield; sl.go(); }
    const cuts = edgeCuts(G, E.ax[s], E.ay[s], E.bx[s], E.by[s]);
    if (cuts.length < 2) continue;
    const a = cuts[0], b = cuts[cuts.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const n = sx.length, ah = E.ah[s], bh = E.bh[s];
    sx.push(a[0]); sy.push(a[1]); sh.push(ah + (bh - ah) * a[2]); ex.push(b[0]); ey.push(b[1]); eh.push(ah + (bh - ah) * b[2]);
    const seen = new Set<number>();
    for (let k = 0; k + 1 < cuts.length; k++) seen.add(cellOf((cuts[k][0] + cuts[k + 1][0]) / 2, (cuts[k][1] + cuts[k + 1][1]) / 2));
    for (const c of seen) (segsIn.get(c) ?? segsIn.set(c, []).get(c)!).push(n);
  }
  // the cells triangulated: those the edges pass through and a ring round them, so no face point lies
  // on the boundary with the grid's own cells
  const R = new Uint8Array(cw * ch);
  for (const c of segsIn.keys()) {
    if (sl.due()) { yield; sl.go(); }
    const i = c % cw, j = (c - i) / cw;
    for (let b = Math.max(0, j - 1); b <= Math.min(ch - 1, j + 1); b++) for (let a = Math.max(0, i - 1); a <= Math.min(cw - 1, i + 1); a++) R[b * cw + a] = 1;
  }
  // where two free edges cross (faces overlapping), both are split at the crossing, and where one ends
  // on another (to within a hair), that one is split there
  const splits = new Map<number, number[][]>();
  const endOn = (s: number, x: number, y: number, h: number) => {
    const vx = ex[s] - sx[s], vy = ey[s] - sy[s], l2 = vx * vx + vy * vy, f = ((x - sx[s]) * vx + (y - sy[s]) * vy) / l2;
    if (f <= 1e-9 || f >= 1 - 1e-9 || Math.abs((x - sx[s]) * vy - (y - sy[s]) * vx) / Math.sqrt(l2) > 1e-6) return false;
    (splits.get(s) ?? splits.set(s, []).get(s)!).push([f, x, y, h]);
    return true;
  };
  for (const list of segsIn.values()) for (let m = 0; m < list.length; m++) for (let q = m + 1; q < list.length; q++) {
    if (sl.due()) { yield; sl.go(); }
    const s = list[m], t = list[q];
    if (endOn(s, sx[t], sy[t], sh[t]) || endOn(s, ex[t], ey[t], eh[t]) || endOn(t, sx[s], sy[s], sh[s]) || endOn(t, ex[s], ey[s], eh[s])) continue;
    const ux = ex[s] - sx[s], uy = ey[s] - sy[s], vx = ex[t] - sx[t], vy = ey[t] - sy[t], d = ux * vy - uy * vx;
    if (Math.abs(d) < 1e-12) continue;
    const wx = sx[t] - sx[s], wy = sy[t] - sy[s], f = (wx * vy - wy * vx) / d, g = (wx * uy - wy * ux) / d;
    if (f <= 1e-9 || f >= 1 - 1e-9 || g <= 1e-9 || g >= 1 - 1e-9) continue;
    const x = sx[s] + ux * f, y = sy[s] + uy * f, h = Math.min(sh[s] + (eh[s] - sh[s]) * f, sh[t] + (eh[t] - sh[t]) * g);
    for (const [k, at] of [[s, f], [t, g]]) (splits.get(k) ?? splits.set(k, []).get(k)!).push([at, x, y, h]);
  }
  // the points: the faces' first, then the grid's
  const P: number[] = [], PH: number[] = [], PK: number[] = [];
  const byKey = new Map<string, number>(), atGrid = new Int32Array(NG).fill(-1);
  const gridOf = (x: number, y: number) => {
    const i = Math.round((x - x0) / dx), j = Math.round((y - y0) / dy);
    return i >= 0 && j >= 0 && i < nx && j < ny && x === x0 + i * dx && y === y0 + j * dy ? j * nx + i : -1;
  };
  const add = (x: number, y: number, h: number, k: number) => {
    const g = k >= 0 ? k : gridOf(x, y);
    let n = g >= 0 ? atGrid[g] : byKey.get(`${x},${y}`) ?? -1;
    if (n >= 0) return n;
    n = PK.length;
    if (g >= 0) atGrid[g] = n; else byKey.set(`${x},${y}`, n);
    P.push(x - x0, y - y0); PH.push(h); PK.push(k);
    return n;
  };
  const cons: [number, number][] = [];
  for (let s = 0; s < sx.length; s++) {
    if (sl.due()) { yield; sl.go(); }
    const stops = [[0, sx[s], sy[s], sh[s]], ...(splits.get(s) ?? []).sort((p, q) => p[0] - q[0]), [1, ex[s], ey[s], eh[s]]];
    let prev = add(stops[0][1], stops[0][2], stops[0][3], -1);
    for (let k = 1; k < stops.length; k++) { const n = add(stops[k][1], stops[k][2], stops[k][3], -1); if (n !== prev) cons.push([prev, n]); prev = n; }
  }
  // (a grid point standing well above or below the edge beside it holds a bank there: it stays)
  const nearEdge = (x: number, y: number, h: number) => {
    const i = Math.round((x - x0) / dx), j = Math.round((y - y0) / dy);
    for (let b = j - 1; b <= j; b++) for (let a = i - 1; a <= i; a++) {
      if (a < 0 || b < 0 || a >= cw || b >= ch) continue;
      for (const s of segsIn.get(b * cw + a) ?? []) {
        const vx = ex[s] - sx[s], vy = ey[s] - sy[s], u = Math.min(1, Math.max(0, ((x - sx[s]) * vx + (y - sy[s]) * vy) / (vx * vx + vy * vy)));
        if (Math.hypot(x - sx[s] - vx * u, y - sy[s] - vy * u) < clear && Math.abs(h - sh[s] - (eh[s] - sh[s]) * u) < BANK) return true;
      }
    }
    return false;
  };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (sl.due()) { yield; sl.go(); }
    let inR = false;
    for (let b = j - 1; b <= j && !inR; b++) for (let a = i - 1; a <= i; a++) if (a >= 0 && b >= 0 && a < cw && b < ch && R[b * cw + a]) { inR = true; break; }
    if (!inR) continue;
    const x = x0 + i * dx, y = y0 + j * dy, edge = i === 0 || j === 0 || i === cw || j === ch;
    if (!edge && atGrid[j * nx + i] < 0 && nearEdge(x, y, corner(j * nx + i))) continue;
    add(x, y, corner(j * nx + i), j * nx + i);
  }
  // the triangulated cells' sides against the grid's own cells, held so nothing crosses them
  const gridPt = (i: number, j: number) => atGrid[j * nx + i];
  for (let c = 0; c < R.length; c++) {
    if (sl.due()) { yield; sl.go(); }
    if (!R[c]) continue;
    const i = c % cw, j = (c - i) / cw;
    if (i > 0 && !R[c - 1]) cons.push([gridPt(i, j), gridPt(i, j + 1)]);
    if (i < cw - 1 && !R[c + 1]) cons.push([gridPt(i + 1, j), gridPt(i + 1, j + 1)]);
    if (j > 0 && !R[c - cw]) cons.push([gridPt(i, j), gridPt(i + 1, j)]);
    if (j < ch - 1 && !R[c + cw]) cons.push([gridPt(i, j + 1), gridPt(i + 1, j + 1)]);
    // a cell no edge passes through is folded as the grid folds its own (south-east to north-west):
    // folded the other way, its heights weren't the grid's, and across a bank it stood up as a ridge
    if (!segsIn.has(c) && gridPt(i, j) >= 0 && gridPt(i + 1, j + 1) >= 0 && gridPt(i + 1, j) >= 0 && gridPt(i, j + 1) >= 0) cons.push([gridPt(i + 1, j), gridPt(i, j + 1)]);
  }
  const held = cons.filter(([a, b]) => a >= 0 && b >= 0);
  const state = new Uint8Array(cw * ch);
  for (let c = 0; c < state.length; c++) state[c] = R[c] ? 2 : covered[c] ? 1 : 0;
  // (where faces overlap, gs's odd cells, their outlines don't bound what they cover: the ground there
  // is drawn under them too where it stays below them, as the cut sheet draws those cells whole, or
  // it left cracks between them)
  const overlap = new Uint8Array(cw * ch);
  for (let k = 0; k < odd.length; k++) overlap[odd[k]] = 1;
  const px: number[] = [], py: number[] = [], ph: number[] = [];
  const index = PK.map((k, n) => { if (k >= 0) return k; px.push(P[2 * n] + x0); py.push(P[2 * n + 1] + y0); ph.push(PH[n]); return NG + px.length - 1; });
  const lost: number[] = [];
  const byCell: number[][] = [];
  if (PK.length >= 3) {
    const coords = Float64Array.from(P);
    let del: Triangulation;
    const ask = offMain ? delaunayOffMain(coords) : null;
    if (ask) { while (!ask.result) { buildWait.on = true; yield; } del = ask.result; }
    else {
      // (on its own slice, named, so a long one is seen to be this)
      const g = globalThis as { __wphase?: string }, was = g.__wphase;
      g.__wphase = "sheet-triangulate";
      yield;
      del = delaunayHere(coords);
      g.__wphase = was;
      yield;
    }
    sl.go();
    const con = new Constrainautor(del);
    // (its own set of edges to look at again is walked whole after every edge held, which over a square's
    // tens of thousands of edges took a second: this one walks only what is in it)
    (con as unknown as { flips: FlipSet }).flips = new FlipSet(del.triangles.length);
    // (an edge through a point lying on it is held in pieces, point to point)
    const pointsIn = new Map<number, number[]>();
    for (let n = 0; n < PK.length; n++) { if (sl.due()) { yield; sl.go(); } const c = cellOf(P[2 * n] + x0, P[2 * n + 1] + y0); (pointsIn.get(c) ?? pointsIn.set(c, []).get(c)!).push(n); }
    const hold = (a: number, b: number, depth: number) => {
      try { con.constrainOne(a, b); }
      catch (e) {
        if (depth > 8 || !String((e as Error).message).includes("point")) { lost.push((P[2 * a] + P[2 * b]) / 2 + x0, (P[2 * a + 1] + P[2 * b + 1]) / 2 + y0); return; }
        const ax = P[2 * a], ay = P[2 * a + 1], vx = P[2 * b] - ax, vy = P[2 * b + 1] - ay, l2 = vx * vx + vy * vy;
        const on: [number, number][] = [];
        const c0 = cellOf(Math.min(ax, ax + vx) + x0, Math.min(ay, ay + vy) + y0), c1 = cellOf(Math.max(ax, ax + vx) + x0, Math.max(ay, ay + vy) + y0);
        for (let j = Math.floor(c0 / cw); j <= Math.floor(c1 / cw); j++) for (let i = c0 % cw; i <= c1 % cw; i++) for (const n of pointsIn.get(j * cw + i) ?? []) {
          if (n === a || n === b) continue;
          const t = ((P[2 * n] - ax) * vx + (P[2 * n + 1] - ay) * vy) / l2;
          if (t <= 0 || t >= 1) continue;
          if (Math.abs((P[2 * n] - ax) * vy - (P[2 * n + 1] - ay) * vx) / Math.sqrt(l2) < 1e-6) on.push([t, n]);
        }
        if (!on.length) { lost.push((P[2 * a] + P[2 * b]) / 2 + x0, (P[2 * a + 1] + P[2 * b + 1]) / 2 + y0); return; }
        on.sort((p, q) => p[0] - q[0]);
        let prev = a;
        for (const [, n] of on) { hold(prev, n, depth + 1); prev = n; }
        hold(prev, b, depth + 1);
      }
    };
    for (const [a, b] of held) { hold(a, b, 0); if (sl.due()) { yield; sl.go(); } }
    // (a triangle lies at the faces' height all over if it does at its middle, and just in from each
    // corner and from the middle of each side; a sliver along the line between two faces is the
    // hairline itself, and stays)
    const atFaces = (a: number, b: number, d: number, cx: number, cy: number) => {
      const ux = P[2 * b] - P[2 * a], uy = P[2 * b + 1] - P[2 * a + 1], vx = P[2 * d] - P[2 * a], vy = P[2 * d + 1] - P[2 * a + 1];
      const long = Math.max(Math.hypot(ux, uy), Math.hypot(vx, vy), Math.hypot(vx - ux, vy - uy));
      if (Math.abs(ux * vy - uy * vx) / long < 0.02) return false;
      const mh = (PH[a] + PH[b] + PH[d]) / 3;
      if (Math.abs(mh - faceTop(cx, cy)) > 0.002) return false;
      const near = (x: number, y: number, h: number) => {
        const f = 0.15, px = x + (cx - x) * f, py = y + (cy - y) * f;
        return Math.abs(h + (mh - h) * f - faceTop(px, py)) <= 0.003;
      };
      for (const [p, q] of [[a, b], [b, d], [d, a]]) {
        if (!near(P[2 * p] + x0, P[2 * p + 1] + y0, PH[p])) return false;
        if (!near((P[2 * p] + P[2 * q]) / 2 + x0, (P[2 * p + 1] + P[2 * q + 1]) / 2 + y0, (PH[p] + PH[q]) / 2)) return false;
      }
      return true;
    };
    const T = del.triangles;
    for (let t = 0; t < T.length; t += 3) {
      if (sl.due()) { yield; sl.go(); }
      let a = T[t], b = T[t + 1], d = T[t + 2];
      const cx = (P[2 * a] + P[2 * b] + P[2 * d]) / 3 + x0, cy = (P[2 * a + 1] + P[2 * b + 1] + P[2 * d + 1]) / 3 + y0;
      const c = cellOf(cx, cy);
      if (!R[c]) continue;
      const top = faceTop(cx, cy);
      if (top < Infinity && !(overlap[c] && Math.max(PH[a], PH[b], PH[d]) <= top + 0.01)) continue;
      // (ground lying at the faces' own height all over adds nothing they don't draw, and flickers with
      // them; where some of it reaches past them, over a hairline between two, it stays)
      if (top < Infinity && atFaces(a, b, d, cx, cy)) continue;
      // (anticlockwise seen from above, as the grid's own are)
      if ((P[2 * b] - P[2 * a]) * (P[2 * d + 1] - P[2 * a + 1]) - (P[2 * b + 1] - P[2 * a + 1]) * (P[2 * d] - P[2 * a]) < 0) [b, d] = [d, b];
      (byCell[c] ??= []).push(index[a], index[b], index[d]);
    }
  }
  const tri: number[] = [], start = new Int32Array(state.length + 1);
  for (let c = 0; c < state.length; c++) { if (sl.due()) { yield; sl.go(); } start[c] = tri.length / 3; const l = byCell[c]; if (l) for (const k of l) tri.push(k); }
  start[state.length] = tri.length / 3;
  // every cell a triangle reaches over, for heights
  const X = (k: number) => k >= NG ? px[k - NG] : x0 + (k % nx) * dx, Y = (k: number) => k >= NG ? py[k - NG] : y0 + Math.floor(k / nx) * dy;
  const over: number[][] = [];
  for (let t = 0; t < tri.length / 3; t++) {
    if (sl.due()) { yield; sl.go(); }
    const xa = X(tri[3 * t]), xb = X(tri[3 * t + 1]), xc = X(tri[3 * t + 2]), ya = Y(tri[3 * t]), yb = Y(tri[3 * t + 1]), yc = Y(tri[3 * t + 2]);
    const i0 = Math.max(0, Math.floor((Math.min(xa, xb, xc) - x0) / dx)), i1 = Math.min(cw - 1, Math.floor((Math.max(xa, xb, xc) - x0) / dx));
    const j0 = Math.max(0, Math.floor((Math.min(ya, yb, yc) - y0) / dy)), j1 = Math.min(ch - 1, Math.floor((Math.max(ya, yb, yc) - y0) / dy));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (over[j * cw + i] ??= []).push(t);
  }
  const nStart = new Int32Array(state.length + 1), ids: number[] = [];
  for (let c = 0; c < state.length; c++) { if (sl.due()) { yield; sl.go(); } nStart[c] = ids.length; const l = over[c]; if (l) for (const t of l) ids.push(t); }
  nStart[state.length] = ids.length;
  return { state, px: Float64Array.from(px), py: Float64Array.from(py), ph: Float64Array.from(ph), tri: Int32Array.from(tri), start, near: { start: nStart, ids: Int32Array.from(ids) }, lost };
}

/** One cell's fill as triangles (three points each), or null if its edges don't close up. The cell's
 *  edge is walked clockwise (south-west, north-west, north-east, south-east) with the open ground on
 *  the right, as the faces' free edges have it. */
function fillCell(pieces: Piece[], xa: number, xb: number, ya: number, yb: number, corners: Pt[], under: boolean): Pt[] | null {
  const W = xb - xa, Hh = yb - ya;
  const onEdge = (x: number, y: number) => x === xa || x === xb || y === ya || y === yb;
  // how far round the cell's edge, clockwise from the south-west corner: 0 to 4, a side each
  const round = (x: number, y: number) => x === xa ? (y - ya) / Hh : y === yb ? 1 + (x - xa) / W : x === xb ? 2 + (yb - y) / Hh : 3 + (xb - x) / W;
  const along = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const startsAt = new Map<string, Piece[]>();
  for (const p of pieces) { const k = `${p.sx},${p.sy}`; (startsAt.get(k) ?? startsAt.set(k, []).get(k)!).push(p); }
  // of the ways on from a point, the one that keeps the open ground on the right: the first turning
  // anticlockwise from straight back the way it came
  const turn = (bx: number, by: number, ox: number, oy: number) => {
    let a = Math.atan2(oy, ox) - Math.atan2(by, bx);
    while (a <= 1e-12) a += 2 * Math.PI;
    return a;
  };
  const nextFrom = (p: Piece, also: [number, number] | null): Piece | "edge" | null => {
    const bx = p.sx - p.ex, by = p.sy - p.ey;
    let best: Piece | "edge" | null = null, bestA = Infinity;
    for (const q of startsAt.get(`${p.ex},${p.ey}`) ?? []) {
      if (q.used && q !== first) continue;
      const a = turn(bx, by, q.ex - q.sx, q.ey - q.sy);
      if (a < bestA) { bestA = a; best = q; }
    }
    if (also) { const a = turn(bx, by, also[0], also[1]); if (a < bestA) best = "edge"; }
    return best;
  };
  const entries = pieces.filter((p) => onEdge(p.sx, p.sy)).map((p) => ({ p, s: round(p.sx, p.sy) })).sort((a, b) => a.s - b.s);
  const outers: Pt[][] = [], loops: Pt[][] = [];
  let first: Piece | null = null;
  const pt = (x: number, y: number, h: number): Pt => ({ x, y, h, k: -1 });
  for (const e of entries) {
    if (e.p.used) continue;
    first = e.p;
    const ring: Pt[] = [];
    let p = e.p, guard = 0;
    for (;;) {
      if (++guard > 100000) return null;
      p.used = true;
      ring.push(pt(p.sx, p.sy, p.sh));
      if (!onEdge(p.ex, p.ey)) {
        const q = nextFrom(p, null);
        if (!q || q === "edge") return null;
        if (q === first) break;
        p = q;
        continue;
      }
      ring.push(pt(p.ex, p.ey, p.eh));
      const s = round(p.ex, p.ey), side = Math.min(3, Math.floor(s));
      const q = nextFrom(p, along[side] as [number, number]);
      if (q && q !== "edge") { if (q === first) break; p = q; continue; }
      // round the cell's edge clockwise to the next way in, taking the corners passed
      let to: { p: Piece; s: number } | null = null, gap = Infinity;
      for (const f of entries) {
        if (f.p.used && f.p !== first) continue;
        let g = f.s - s;
        if (g <= 0) g += 4;
        if (g < gap) { gap = g; to = f; }
      }
      if (!to) return null;
      for (let m = 1; m <= 4; m++) {
        const k = Math.floor(s) + m, g = k - s;
        if (g > 0 && g < gap) ring.push(corners[k % 4]);
      }
      if (to.p === first) break;
      p = to.p;
    }
    outers.push(tidy(ring));
  }
  // what is left is closed loops inside the cell: clockwise, open ground inside (an island of it);
  // anticlockwise, a face standing in the open ground (a hole in it)
  const holes: Pt[][] = [];
  for (const p0 of pieces) {
    if (p0.used) continue;
    first = p0;
    const ring: Pt[] = [];
    let p = p0, guard = 0;
    for (;;) {
      if (++guard > 100000) return null;
      p.used = true;
      ring.push(pt(p.sx, p.sy, p.sh));
      if (onEdge(p.ex, p.ey)) return null;
      const q = nextFrom(p, null);
      if (!q || q === "edge") return null;
      if (q === first) break;
      p = q;
    }
    (area(ring) < 0 ? loops : holes).push(ring);
  }
  for (const l of loops) outers.push(l);
  // (with no way in from the cell's edge, the cell round the loops is open ground unless its corner is
  // under a face: then a loop with a face inside is one face overlapping another, not a hole in ground)
  if (!entries.length && !under && holes.some((h) => !outers.some((o) => inside(middle(h), o)))) outers.push(corners.slice());
  const out: Pt[] = [];
  for (const o of outers) {
    if (o.length < 3) continue;
    const mine = holes.filter((h) => inside(middle(h), o));
    const all = [o, ...mine].flat();
    const faces = ShapeUtils.triangulateShape(o.map((q) => new Vector2(q.x - xa, q.y - ya)), mine.map((h) => h.map((q) => new Vector2(q.x - xa, q.y - ya))));
    for (const f of faces) for (const k of f) out.push(all[k]);
  }
  return out;
}

/** A ring with no point twice in a row. */
function tidy(ring: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const q of ring) { const o = out[out.length - 1]; if (!o || o.x !== q.x || o.y !== q.y) out.push(q); }
  while (out.length > 1 && out[0].x === out[out.length - 1].x && out[0].y === out[out.length - 1].y) out.pop();
  return out;
}

function middle(r: Pt[]): Pt {
  let x = 0, y = 0;
  for (const q of r) { x += q.x; y += q.y; }
  return { x: x / r.length, y: y / r.length, h: 0, k: -1 };
}

function area(r: Pt[]) {
  let a = 0;
  for (let k = 0; k < r.length; k++) { const p = r[k], q = r[(k + 1) % r.length]; a += p.x * q.y - q.x * p.y; }
  return a / 2;
}

function inside(p: Pt, r: Pt[]) {
  let c = false;
  for (let k = 0, m = r.length - 1; k < r.length; m = k++) {
    const a = r[k], b = r[m];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** The fill's height at data (x, y) in cell c, or NaN where no fill triangle covers it (under a face).
 *  `grid(k)` is a grid point's scene height. */
export function fillAt(S: Sheet, G: SheetGrid, grid: (k: number) => number, c: number, x: number, y: number): number {
  const T = S.tri, NG = G.nx * G.ny;
  const X = (k: number) => k >= NG ? S.px[k - NG] : G.x0 + (k % G.nx) * G.dx;
  const Y = (k: number) => k >= NG ? S.py[k - NG] : G.y0 + Math.floor(k / G.nx) * G.dy;
  const Z = (k: number) => k >= NG ? S.ph[k - NG] : grid(k);
  const N = S.near, from = N ? N.start[c] : S.start[c], to = N ? N.start[c + 1] : S.start[c + 1];
  for (let m = from; m < to; m++) {
    const t = N ? N.ids[m] : m;
    const a = T[3 * t], b = T[3 * t + 1], d = T[3 * t + 2];
    const ax = X(a), ay = Y(a), bx = X(b), by = Y(b), cx = X(d), cy = Y(d);
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-12) continue;
    const wa = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, wb = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den, wc = 1 - wa - wb;
    if (wa < -1e-7 || wb < -1e-7 || wc < -1e-7) continue;
    return wa * Z(a) + wb * Z(b) + wc * Z(d);
  }
  return NaN;
}

const KINDS = ["road", "service", "pave", "path", "front", "drive", "grass", "dirt", "gravel", "bed"] as const;
const OUTLINE_LIFT: Record<string, number> = { road: 0.07, pave: 0.17, path: 0.04, front: 0.04, drive: 0.04, plaza: 0.04, bed: 0 };
const SEAM = 0.006;   // metres: a face's edge this near the square's edge runs along it, to the next square

/** The faces as the sheet meets them (tools/partition/sheet.py Faces): each corner's spot (corners at
 *  one place, a path's and a pavement's, share one), the free edges where a face meets open ground,
 *  and the scene height the ground meets each spot at: the lowest top of the faces there, or the foot
 *  or top of its retaining wall. `lift` is each kind's lift over its written height (world.ts FACE_LIFT). */
export function sheetFaces(sf: NonNullable<import("./map").MapData["sf"]>, gs: NonNullable<import("./map").MapData["gs"]>, bounds: number[], Z0: number, lift: number[], G: SheetGrid, cutAlong = true) {
  return drain(sheetFacesGen(sf, gs, bounds, Z0, lift, G, cutAlong));
}

/** sheetFaces a few milliseconds at a time. */
export function* sheetFacesGen(sf: NonNullable<import("./map").MapData["sf"]>, gs: NonNullable<import("./map").MapData["gs"]>, bounds: number[], Z0: number, lift: number[], G: SheetGrid, cutAlong = true, sl = new Slice()) {
  const V = sf.v, NP = V.length / 3;
  const spot = new Int32Array(NP), spots = new Map<string, number>();
  for (let i = 0; i < NP; i++) { if (sl.due()) { yield; sl.go(); } const k = `${V[3 * i]},${V[3 * i + 1]}`, s = spots.get(k); if (s === undefined) spots.set(k, spot[i] = i); else spot[i] = s; }
  const kindOf = new Map<number, number>();
  for (const [n, kind] of KINDS.entries()) {
    const T = sf[kind] ?? [];
    for (let k = 0; k + 2 < T.length; k += 3) {
      if (sl.due()) { yield; sl.go(); }
      for (let m = 0; m < 3; m++) { const a = T[k + m], b = T[k + (m + 1) % 3]; kindOf.set(Math.min(a, b) * NP + Math.max(a, b), n); }
    }
  }
  const owner = new Set<number>();
  for (const e of sf.e) for (let k = 0; k + 1 < e.i.length; k++) owner.add(spot[e.i[k]] * NP + spot[e.i[k + 1]]);
  const [x0, y0, x1, y1] = bounds;
  const along = (a: number, b: number, c: number) => Math.abs(a - c) < SEAM && Math.abs(b - c) < SEAM;
  const onSeam = (a: number, b: number) => along(V[3 * a], V[3 * b], x0) || along(V[3 * a], V[3 * b], x1) || along(V[3 * a + 1], V[3 * b + 1], y0) || along(V[3 * a + 1], V[3 * b + 1], y1);
  const fa: number[] = [], fb: number[] = [], ta: number[] = [], tb: number[] = [];
  const top = new Float64Array(NP).fill(Infinity);
  const spike = (a: number, b: number, c: number) => {
    const ux = V[3 * b] - V[3 * a], uy = V[3 * b + 1] - V[3 * a + 1], vx = V[3 * c] - V[3 * b], vy = V[3 * c + 1] - V[3 * b + 1];
    return ux * vx + uy * vy < 0 && Math.abs(ux * vy - uy * vx) <= 1e-3 * Math.hypot(ux, uy) * Math.hypot(vx, vy);
  };
  for (const e of sf.e) {
    if (sl.due()) { yield; sl.go(); }
    const run: [number, number, number][] = [];
    for (let k = 0; k + 1 < e.i.length; k++) {
      if (sl.due()) { yield; sl.go(); }
      const a = e.i[k], b = e.i[k + 1];
      if (spot[a] === spot[b] || owner.has(spot[b] * NP + spot[a]) || onSeam(a, b)) continue;
      const n = kindOf.get(Math.min(a, b) * NP + Math.max(a, b));
      run.push([a, b, n !== undefined ? lift[n] : OUTLINE_LIFT[e.c] ?? 0.07]);
      // (an outline running out and straight back along itself, a spike of no width, is the one edge left over)
      while (run.length > 1 && run[run.length - 2][1] === run[run.length - 1][0] && spike(run[run.length - 2][0], run[run.length - 1][0], run[run.length - 1][1])) {
        const [a0, , l0] = run[run.length - 2], [, b1] = run[run.length - 1];
        run.length -= 2;
        if (spot[a0] !== spot[b1]) run.push([a0, b1, l0]);
      }
    }
    for (const [a, b, l] of run) {
      const za = V[3 * a + 2] - Z0 + l, zb = V[3 * b + 2] - Z0 + l;
      fa.push(a); fb.push(b); ta.push(za); tb.push(zb);
      top[spot[a]] = Math.min(top[spot[a]], za); top[spot[b]] = Math.min(top[spot[b]], zb);
    }
  }
  for (let k = 0; k < gs.s.length; k++) if (top[gs.s[k]] < Infinity) top[gs.s[k]] += gs.sz[k] / 100;
  const n = fa.length;
  const E: FreeEdges = { ax: new Float64Array(n), ay: new Float64Array(n), ah: new Float64Array(n), bx: new Float64Array(n), by: new Float64Array(n), bh: new Float64Array(n), n };
  for (let k = 0; k < n; k++) {
    const a = fa[k], b = fb[k];
    E.ax[k] = V[3 * a]; E.ay[k] = V[3 * a + 1]; E.ah[k] = top[spot[a]];
    E.bx[k] = V[3 * b]; E.by[k] = V[3 * b + 1]; E.bh[k] = top[spot[b]];
  }
  // the points the sheet puts partway along each free edge, for the faces to put there too
  const cutsOf = new Map<number, number[][]>();
  for (let k = 0; k < n; k++) {
    if (sl.due()) { yield; sl.go(); }
    // (triangulated, ?ground=cdt, the ground has a point partway along an edge only where it leaves the square)
    const inner = edgeCuts(G, E.ax[k], E.ay[k], E.bx[k], E.by[k]).filter((q, m, all) => q[2] > 0 && q[2] < 1 && (cutAlong || m === 0 || m === all.length - 1));
    if (!inner.length) continue;
    const a = spot[fa[k]], b = spot[fb[k]];
    cutsOf.set(a * NP + b, inner);
    cutsOf.set(b * NP + a, inner.map(([x, y, t]) => [x, y, 1 - t]).reverse());
  }
  /** The scene height the ground meets corner i at, or Infinity off the free edges. */
  const meets = (i: number) => top[spot[i]];
  /** The points the sheet has partway along the faces' edge from corner a to b, in order from a: data
   *  x, y and how far along (0 to 1), or undefined if none. */
  const alongEdge = (a: number, b: number) => cutsOf.get(spot[a] * NP + spot[b]);
  // the faces' triangles by the grid cells they reach over, to tell what lies inside one
  const cw = G.nx - 1, ch = G.ny - 1, faceIn = new Map<number, number[]>(), tris: number[] = [], triLift: number[] = [];
  const cellI = (x: number) => Math.min(cw - 1, Math.max(0, Math.floor((x - G.x0) / G.dx))), cellJ = (y: number) => Math.min(ch - 1, Math.max(0, Math.floor((y - G.y0) / G.dy)));
  for (const [n, kind] of KINDS.entries()) {
    const T = sf[kind] ?? [];
    for (let k = 0; k + 2 < T.length; k += 3) {
      if (sl.due()) { yield; sl.go(); }
      triLift.push(lift[n]);
      const t = tris.length / 3, xs = [V[3 * T[k]], V[3 * T[k + 1]], V[3 * T[k + 2]]], ys = [V[3 * T[k] + 1], V[3 * T[k + 1] + 1], V[3 * T[k + 2] + 1]];
      tris.push(T[k], T[k + 1], T[k + 2]);
      for (let j = cellJ(Math.min(...ys)); j <= cellJ(Math.max(...ys)); j++) for (let i = cellI(Math.min(...xs)); i <= cellI(Math.max(...xs)); i++) (faceIn.get(j * cw + i) ?? faceIn.set(j * cw + i, []).get(j * cw + i)!).push(t);
    }
  }
  /** The scene height of the lowest face top over data (x, y), or Infinity where no face is. */
  const faceTop = (x: number, y: number) => {
    let low = Infinity;
    for (const t of faceIn.get(cellJ(y) * cw + cellI(x)) ?? []) {
      const a = tris[3 * t], b = tris[3 * t + 1], c = tris[3 * t + 2];
      const ax = V[3 * a], ay = V[3 * a + 1], bx = V[3 * b], by = V[3 * b + 1], cx = V[3 * c], cy = V[3 * c + 1];
      const d1 = (bx - ax) * (y - ay) - (by - ay) * (x - ax), d2 = (cx - bx) * (y - by) - (cy - by) * (x - bx), d3 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
      // (on the edge between two of a face's triangles counts as in)
      if (!((d1 >= 0 && d2 >= 0 && d3 >= 0 && d1 + d2 + d3 > 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0 && d1 + d2 + d3 < 0))) continue;
      const sum = d1 + d2 + d3, h = (d2 * V[3 * a + 2] + d3 * V[3 * b + 2] + d1 * V[3 * c + 2]) / sum - Z0 + triLift[t];
      if (h < low) low = h;
    }
    return low;
  };
  /** Whether data (x, y) lies inside a face (any kind). */
  const inFace = (x: number, y: number) => faceTop(x, y) < Infinity;
  return { edges: E, meets, onSeam, spot, alongEdge, inFace, faceTop };
}

/** The grid's heights (decimetres) with the sheet's carving: the grid points beside the faces cut down
 *  or built up to meet them. */
export function carved(h: ArrayLike<number>, gs: NonNullable<import("./map").MapData["gs"]>): Float32Array {
  const out = Float32Array.from(h);
  for (let k = 0; k < gs.h.length; k++) out[gs.h[k]] += gs.hz[k];
  return out;
}

/** For each grid point within `reach` of a free edge, the height of that edge's nearest point (scene
 *  height; the lowest, where there are several), and Infinity elsewhere: what the faces ask of the
 *  ground beside them, for the rules that leave it alone there. */
export function nearFaces(E: FreeEdges, G: SheetGrid, reach: number): Float32Array {
  const out = new Float32Array(G.nx * G.ny).fill(Infinity);
  for (let e = 0; e < E.n; e++) {
    const ax = E.ax[e], ay = E.ay[e], bx = E.bx[e], by = E.by[e], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - G.x0) / G.dx)), i1 = Math.min(G.nx - 1, Math.ceil((Math.max(ax, bx) + reach - G.x0) / G.dx));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - G.y0) / G.dy)), j1 = Math.min(G.ny - 1, Math.ceil((Math.max(ay, by) + reach - G.y0) / G.dy));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = G.x0 + i * G.dx, y = G.y0 + j * G.dy, u = Math.min(1, Math.max(0, ((x - ax) * vx + (y - ay) * vy) / l2));
      if (Math.hypot(x - ax - vx * u, y - ay - vy * u) >= reach) continue;
      const v = j * G.nx + i, h = E.ah[e] + (E.bh[e] - E.ah[e]) * u;
      if (h < out[v]) out[v] = h;
    }
  }
  return out;
}

/** How many points where a face's edge crosses the side of a cut cell are missing from the drawn
 *  cell across that side: each is a crack in the ground the sky shows through (world.ts warns of any,
 *  so a shot's page complaints show them). Corners aren't counted: one a cut cell leaves out is under
 *  a face. */
export function openSeams(S: Sheet, G: SheetGrid): number {
  const { x0, y0, dx, dy, nx, ny } = G, cw = nx - 1, ch = ny - 1, NG = nx * ny;
  // a cell's crossing points along its east (0), north (1), west (2) or south (3) side
  const along = (c: number, side: number): Set<string> => {
    const i = c % cw, j = (c - i) / cw, xa = x0 + i * dx, xb = x0 + (i + 1) * dx, ya = y0 + j * dy, yb = y0 + (j + 1) * dy;
    const ks = new Set<string>();
    if (S.state[c] !== 2) return ks;
    for (let t = 3 * S.start[c]; t < 3 * S.start[c + 1]; t++) {
      const k = S.tri[t] - NG;
      if (k >= 0 && (side === 0 ? S.px[k] === xb : side === 1 ? S.py[k] === yb : side === 2 ? S.px[k] === xa : S.py[k] === ya)) ks.add(`${S.px[k]},${S.py[k]}`);
    }
    return ks;
  };
  const lacks = (a: Set<string>, b: Set<string>) => { let n = 0; for (const k of a) if (!b.has(k)) n++; return n; };
  let open = 0;
  for (let c = 0; c < S.state.length; c++) {
    if (S.state[c] === 1) continue;
    const i = c % cw, j = (c - i) / cw;
    for (const [n, mine, theirs] of [[i < cw - 1 ? c + 1 : -1, 0, 2], [j < ch - 1 ? c + cw : -1, 1, 3]]) {
      if (n < 0 || S.state[n] === 1 || (S.state[c] !== 2 && S.state[n] !== 2)) continue;
      const a = along(c, mine), b = along(n, theirs);
      open += lacks(a, b) + lacks(b, a);
    }
  }
  return open;
}
