// What's yours: every square of the map you've cleared of the Flag Lads' flags, and each pub you've
// won back, kept from day to day. The big map (minimap.ts drawFull) shows it, quietly, over its own
// ground: a faint green wash on the squares you've cleared, a small pint on each pub you've won
// back, and a thin amber ring round today's scars, under the Flag Lads' red. A line in the map's
// corner says how much of the place is yours (the squares you've cleared), and pointing at or
// tapping a square says its name and what you've done in it.
//
// Who decides what: all your own, kept on this device per map (local storage, "cd-yourmap:<map id>")
// and never sent anywhere. The game tells it where you are once a second, and a visit is only
// written when you walk into a new square; the invasion (invasion.ts) tells it when you shoot a
// flag, clear a square or are there when a pub is won back. The scars are today's from scars.ts
// (the host's list).
// What you do is also passed to the morning paper (paper.ts), which writes it up tomorrow.
import type { GameMap } from "./map";
import { PATHS } from "./map";
import * as Paper from "./paper";

const DAY = 24 * 3600 * 1000;      // the same midnight GMT the Flag Lads' day turns over at (invasion.ts)
const COMBO = 4000;                // ms between flags that keeps a combo going, as flagjuice.ts counts it
const today = () => Math.floor(Date.now() / DAY);

interface Store {
  v: Record<string, [number, number]>;            // squares been to: first day, last day
  c: Record<string, [number, number, number]>;    // squares cleared by you: times, first day, last day
  f: Record<string, number>;                      // flags shot in each square
  p: Record<string, [string, number, number]>;    // pubs won back: square, times, last day
  n: number;                                      // flags shot, all time
  best: number; bestAt: string;                   // best combo, and the square it was in
}

let map: GameMap | null = null;
let key = "";
let S: Store = blank();
let dirty = false;
let lastSq = "";
let run = 0, runAt = 0;

function blank(): Store { return { v: {}, c: {}, f: {}, p: {}, n: 0, best: 0, bestAt: "" }; }

/** The game's map, when a game starts: what's yours on it is loaded. */
export function useMap(m: GameMap, id: string) {
  flush();
  map = m; key = `cd-yourmap:${id}`; lastSq = ""; S = blank();
  try {
    const d = JSON.parse(localStorage.getItem(key) ?? "null");
    if (d && typeof d === "object") for (const k of Object.keys(S) as (keyof Store)[]) if (d[k] !== undefined && typeof d[k] === typeof S[k]) (S as any)[k] = d[k];
  } catch { /* nothing saved, or storage is blocked */ }
}

export function flush() {
  if (!dirty || !key) return;
  dirty = false;
  try { localStorage.setItem(key, JSON.stringify(S)); } catch { /* storage may be blocked */ }
}
addEventListener("pagehide", flush);

/** Which square scene (x, z) is in, as "ti,tj", or "" off the squares. */
export function squareOf(x: number, z: number): string {
  const I = map?.tileIndex;
  if (!I) return "";
  const s = I.cells * I.dx;
  return `${Math.floor((x - I.x0) / s)},${Math.floor((-z - I.y0) / s)}`;
}

// ---- what you did ---------------------------------------------------------------------------------

let ticks = 0;
/** Once a second from the game: where you are. Only walking into a new square writes anything. */
export function here(x: number, z: number) {
  if (++ticks % 15 === 0) flush();
  const sq = squareOf(x, z);
  if (!sq || sq === lastSq) return;
  lastSq = sq;
  const d = today(), was = S.v[sq];
  if (was && was[1] === d) return;
  S.v[sq] = [was ? was[0] : d, d];
  dirty = true;
}

/** You shot one of the Flag Lads' flags down at (x, z). */
export function flagShot(x: number, z: number, place: string) {
  const sq = squareOf(x, z), now = performance.now();
  run = now - runAt < COMBO ? run + 1 : 1;
  runAt = now;
  S.n++;
  if (sq) S.f[sq] = (S.f[sq] ?? 0) + 1;
  if (run > S.best) { S.best = run; S.bestAt = sq; }
  dirty = true;
  Paper.myFlag(run, place);
}

/** You shot the last flag in the square at (x, z). */
export function cleared(x: number, z: number, place: string) {
  const sq = squareOf(x, z), d = today();
  if (sq) { const c = S.c[sq]; S.c[sq] = [(c?.[0] ?? 0) + 1, c?.[1] ?? d, d]; dirty = true; }
  Paper.cleared(place);
  flush();
}

/** You were there when a pub was won back. */
export function pubWon(name: string, x: number, z: number) {
  const sq = squareOf(x, z), p = S.p[name];
  S.p[name] = [sq, (p?.[1] ?? 0) + 1, today()];
  dirty = true;
  flush();
}

// ---- scars ------------------------------------------------------------------------------------------

/** A mark a lost job has left (scars.ts): where, and what it is in words. */
export interface Scar { x: number; z: number; what: string }
let scarList: () => Scar[] = () => [];
/** Where today's scars come from (the game's scars.ts). */
export function scarsFrom(f: () => Scar[]) { scarList = f; }
/** Today's scars, each with its square. */
export function scars(): (Scar & { sq: string })[] { return scarList().map((s) => ({ ...s, sq: squareOf(s.x, s.z) })); }

// ---- the squares, and their names ----------------------------------------------------------------

interface Sq { key: string; ti: number; tj: number; x0: number; z0: number; s: number }
let squares: Sq[] = [];
let squaresOf: GameMap | null = null;
const names = new Map<string, string>();

/** Every square of the map inside the force field (as the Flag Lads count them, invasion.ts). */
function allSquares(): Sq[] {
  if (squaresOf === map) return squares;
  squaresOf = map; squares = []; names.clear();
  const I = map?.tileIndex;
  if (!map || !I) return squares;
  const s = I.cells * I.dx;
  for (const [ti, tj] of I.tiles) {
    const x = I.x0 + (ti + 0.5) * s, z = -(I.y0 + (tj + 0.5) * s);
    if (Math.hypot(x - map.fieldX, z - map.fieldZ) > map.field + s * 0.3) continue;
    squares.push({ key: `${ti},${tj}`, ti, tj, x0: I.x0 + ti * s, z0: -(I.y0 + (tj + 1) * s), s });
  }
  // a square goes by its longest named street, from the map's own streets
  const best = new Map<string, number>();
  for (const r of [...map.d.rd, ...(map.wide?.rd ?? [])]) {
    if (!r.n || PATHS.has(r.c) || r.p.length < 2) continue;
    let len = 0;
    for (let i = 1; i < r.p.length; i++) len += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]);
    const m = r.p[Math.floor(r.p.length / 2)], k = `${Math.floor((m[0] - I.x0) / s)},${Math.floor((m[1] - I.y0) / s)}`;
    if (len > (best.get(k) ?? 0)) { best.set(k, len); names.set(k, r.n); }
  }
  return squares;
}

/** A square's name: round its longest street. */
export function nameOf(sq: string): string {
  allSquares();
  const n = names.get(sq);
  return n ? `Round ${n}` : "Fields and lanes";
}

/** How many squares there are, how many you've cleared and how many pubs you've won back. */
function totals() {
  const all = allSquares(), have = new Set(all.map((q) => q.key));
  return { squares: all.length, cleared: Object.keys(S.c).filter((k) => have.has(k)).length, pubs: Object.keys(S.p).length };
}

// ---- on the big map --------------------------------------------------------------------------------

const AMBER = "#d79a2b";
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** A square of the map, scene x0 and z0 its north-west corner, s metres across. */
export interface Box { x0: number; z0: number; s: number }
/** What the big map draws of yours. */
export interface Mine { cleared: Box[]; scars: Box[]; pubs: { x: number; z: number }[] }

/** What's yours, for the big map: pubs is the game's pubs, to find the ones you've won back. */
export function mine(pubs: { name: string; x: number; z: number }[]): Mine {
  const all = allSquares(), scarred = new Set(scars().map((s) => s.sq));
  const box = (q: Sq): Box => ({ x0: q.x0, z0: q.z0, s: q.s });
  return {
    cleared: all.filter((q) => S.c[q.key]).map(box),
    scars: all.filter((q) => scarred.has(q.key)).map(box),
    pubs: pubs.filter((p) => S.p[p.name]),
  };
}

/** The faint wash and the rings, drawn under the street names. flagged: whether the Flag Lads hold
 *  the square at a corner today, where their red shows instead of your green. */
export function drawMineUnder(g: CanvasRenderingContext2D, m: Mine, P: (x: number, z: number) => number[], scale: number, dpr: number, flagged: (x0: number, z0: number) => boolean) {
  g.fillStyle = "rgba(120,224,160,0.13)";
  for (const b of m.cleared) {
    if (flagged(b.x0, b.z0)) continue;
    const [x, y] = P(b.x0, b.z0);
    g.fillRect(x, y, b.s * scale, b.s * scale);
  }
  g.strokeStyle = AMBER; g.globalAlpha = 0.8; g.lineWidth = Math.max(1, 1.2 * dpr);
  for (const b of m.scars) {
    const [x, y] = P(b.x0, b.z0), w = b.s * scale, i = Math.min(3 * dpr, w * 0.06);
    g.strokeRect(x + i, y + i, w - 2 * i, w - 2 * i);
  }
  g.globalAlpha = 1;
}

/** A small pint on each pub you've won back. */
export function drawMinePubs(g: CanvasRenderingContext2D, m: Mine, P: (x: number, z: number) => number[], dpr: number) {
  const k = dpr;
  for (const p of m.pubs) {
    const [x, y] = P(p.x, p.z);
    g.beginPath();
    g.moveTo(x - 4 * k, y - 6 * k); g.lineTo(x + 4 * k, y - 6 * k); g.lineTo(x + 3 * k, y + 6 * k); g.lineTo(x - 3 * k, y + 6 * k); g.closePath();
    g.fillStyle = "#d9932b"; g.fill();
    g.lineWidth = dpr; g.strokeStyle = "#1c1208"; g.stroke();
    g.fillStyle = "#f6efd8"; g.fillRect(x - 4 * k + 0.5, y - 6 * k + 0.5, 8 * k - 1, 3 * k);
  }
}

/** The line in the big map's corner: how much of the place is yours. */
export function share(place: string) {
  const t = totals(), pct = t.squares ? Math.floor((t.cleared / t.squares) * 100) : 0;
  return `${pct}% of ${place} is yours` + (t.pubs ? ` · ${t.pubs} pub${t.pubs === 1 ? "" : "s"} won back` : "");
}

/** What you've done in the square at scene (x, z), in a line, or "" off the squares. level: how much the Flag Lads hold it today, 0 to 1. */
export function tipAt(x: number, z: number, level: number) {
  const sq = squareOf(x, z);
  if (!allSquares().some((q) => q.key === sq)) return "";
  const c = S.c[sq], f = S.f[sq] ?? 0;
  const day = (d: number) => (d === today() ? "today" : d === today() - 1 ? "yesterday" : today() - d < 7 ? `on ${DAY_NAMES[new Date(d * DAY).getUTCDay()]}` : `${today() - d} days ago`);
  const bits = [
    c ? `cleared by you ${c[0] === 1 ? "once" : c[0] === 2 ? "twice" : `${c[0]} times`}, last ${day(c[2])}` : "not cleared by you yet",
    f ? `${f} flag${f === 1 ? "" : "s"} shot here` : "",
    level > 0.1 ? `the Flag Lads hold ${Math.round(level * 100)}% today` : "",
    ...Object.entries(S.p).filter(([, p]) => p[0] === sq).map(([n]) => `${n} won back`),
    S.bestAt === sq && S.best > 1 ? `your best combo, x${S.best}` : "",
    ...scars().filter((s) => s.sq === sq).map((s) => `scar: ${s.what}`),
  ].filter(Boolean);
  return `${nameOf(sq)}: ${bits.join(" · ")}`;
}
