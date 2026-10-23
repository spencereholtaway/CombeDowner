// Your map: every square of the map coloured in by what you've done there, kept from day to day.
// A square you've cleared of the Flag Lads' flags is yours (green), one you've only been to is
// blue, one they've flagged today is red, a scar left by a lost job is ringed amber, and each pub
// you've won back gets a pint. The share of the map that's yours is the squares you've cleared.
// Press M and then Your map (or Y), or pick it from the pause menu; point at or tap a square for
// its name and what you've done there. It draws over the big map (minimap.ts drawFull) the way the
// pub menu does (pubmap.ts), so there's no map drawing here of its own.
//
// Who decides what: all your own, kept on this device per map (local storage, "cd-yourmap:<map id>")
// and never sent anywhere. The game tells it where you are once a second, and a visit is only
// written when you walk into a new square; the invasion (invasion.ts) tells it when you shoot a
// flag, clear a square or are there when a pub is won back. The scars are today's from scars.ts
// (the host's list), read when the map opens.
// What you do is also passed to the morning paper (paper.ts), which writes it up tomorrow.
import type { GameMap } from "./map";
import { PATHS } from "./map";
import type { Game, MapPicker } from "./game";
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

/** The game's map, when a game starts: your map for it is loaded. */
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

// ---- the totals ----------------------------------------------------------------------------------

/** How much of the map is yours, and the rest of the numbers on the screen. */
export function totals(pubs = 0) {
  const all = allSquares(), have = new Set(all.map((q) => q.key)), week = today() - 6;
  const cleared = Object.keys(S.c).filter((k) => have.has(k));
  return {
    squares: all.length,
    cleared: cleared.length,
    week: cleared.filter((k) => S.c[k][1] >= week).length,
    visited: Object.keys(S.v).filter((k) => have.has(k)).length,
    pubs: Object.keys(S.p).length, pubsAll: pubs,
    flags: S.n, best: S.best,
    scars: scars().length,
  };
}

// ---- the screen ----------------------------------------------------------------------------------

const GREEN = "#3fa66b", BLUE = "#4b6f8f", RED = "#c8261d", AMBER = "#d79a2b";
const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The colour a square is filled with on your map. */
export interface Own { x0: number; z0: number; s: number; fill: string; ring?: string; on?: boolean }

export class YourMap implements MapPicker {
  pins: MapPicker["pins"] = [];
  private opened = false;
  private fromPlay = false;
  private hovered = "";
  private panel: HTMLDivElement | null = null;
  private flagged = new Map<string, number>();

  /** current: the game being played, if any. */
  constructor(private current: () => Game | null) {
    addEventListener("keydown", (e) => {
      if (e.code === "Escape" && this.opened) { e.stopImmediatePropagation(); this.back(); }
    }, true);
  }

  get isOpen() { return this.opened; }
  private get game() { return this.current()!; }

  /** fromPlay: opened from the big map in play, so Back goes back to it rather than to the pause menu. */
  open(fromPlay = false) {
    const g = this.current();
    if (!g) return;
    flush();
    this.fromPlay = fromPlay;
    this.flagged = new Map(allSquares().map((q) => [q.key, g.flagLevel(q.x0 + q.s / 2, q.z0 + q.s / 2)]));
    const pubs = g.pubs();
    this.pins = Object.keys(S.p).map((n) => pubs.find((p) => p.name === n)).filter((p) => !!p).map((p) => ({ x: p!.x, z: p!.z, on: false, label: p!.name }));
    this.hovered = "";
    this.opened = true;
    g.pickOnMap(this);
    $("bigmap").classList.add("yours");
    this.label("Whole map");
    this.drawPanel(pubs.length);
    this.paint();
    this.tip("");
  }

  back() {
    if (!this.opened) return;
    this.opened = false;
    $("bigmap").classList.remove("yours");
    this.label("Your map");
    const g = this.current();
    if (!g) return;
    g.ownSquares(null);
    g.pickOnMap(null);
    if (this.fromPlay) $("bigmap").hidden = false;
  }

  /** The big map's button for this, saying what it'll do. */
  private label(text: string) {
    const b = document.getElementById("yourmapbtn");
    if (b) b.textContent = `${text}${matchMedia("(pointer: coarse)").matches ? "" : " (Y)"}`;
  }

  hover(x?: number, y?: number) { this.point(x === undefined || y === undefined ? "" : this.at(x, y)); }
  tap(x: number, y: number) { this.point(this.at(x, y)); }

  private at(x: number, y: number) {
    const p = this.game.mapPoint(x, y);
    if (!p) return "";
    const sq = squareOf(p.x, p.z);
    return allSquares().some((q) => q.key === sq) ? sq : "";
  }

  private point(sq: string) {
    if (sq === this.hovered) return;
    this.hovered = sq;
    this.paint();
    this.tip(sq);
  }

  /** The squares, coloured, for the big map to draw. */
  private paint() {
    const scarred = new Set(scars().map((s) => s.sq));
    const own: Own[] = allSquares().map((q) => {
      const lvl = this.flagged.get(q.key) ?? 0;
      const fill = lvl > 0.1 ? `rgba(200,38,29,${(0.3 + 0.35 * lvl).toFixed(2)})`
        : S.c[q.key] ? "rgba(63,166,107,0.55)" : S.v[q.key] ? "rgba(75,111,143,0.5)" : "rgba(10,12,14,0.5)";
      return { x0: q.x0, z0: q.z0, s: q.s, fill, ring: scarred.has(q.key) ? AMBER : undefined, on: q.key === this.hovered };
    });
    this.game.ownSquares(own);
  }

  private drawPanel(pubs: number) {
    if (!this.panel || !this.panel.isConnected) {
      style();
      this.panel = document.createElement("div");
      this.panel.id = "yourpanel";
      $("bigmapwrap").appendChild(this.panel);
    }
    const t = totals(pubs), pct = t.squares ? Math.floor((t.cleared / t.squares) * 100) : 0;
    const flaggedN = [...this.flagged.values()].filter((v) => v > 0.1).length;
    const w = (n: number) => (t.squares ? (n / t.squares) * 100 : 0).toFixed(1);
    const rows: [string, string][] = [
      ["Squares cleared", `${t.cleared} / ${t.squares}`], ["Squares visited", `${t.visited}`],
      ["Pubs won back", `${t.pubs}${t.pubsAll ? ` / ${t.pubsAll}` : ""}`], ["Flags shot, all time", t.flags.toLocaleString("en-GB")],
      ["Best combo", t.best ? `x${t.best}` : "none yet"], ["Scars to fix", `${t.scars}`],
    ];
    const place = this.game.placeName();
    this.panel.innerHTML = `<h3>Your ${esc(place)}</h3>`
      + `<div class="ympct"><b>${pct}<small>%</small></b><span>of ${esc(place)} is yours${t.week ? ` · ${t.week} square${t.week === 1 ? "" : "s"} this week` : ""}</span></div>`
      + `<div class="ymbar"><span style="width:${w(t.cleared)}%;background:${GREEN}"></span><span style="width:${w(Math.max(0, t.visited - t.cleared))}%;background:${BLUE}"></span><span style="width:${w(flaggedN)}%;background:${RED}"></span></div>`
      + `<dl>${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl>`
      + `<div class="ymkey"><span><i style="background:${GREEN}"></i>cleared by you</span><span><i style="background:${BLUE}"></i>been there</span>`
      + `<span><i style="background:${RED}"></i>flagged today</span><span><i style="border:2px solid ${AMBER}"></i>scar left</span><span><i class="pint"></i>pub won back</span></div>`
      + `<p class="ymtip"></p>`;
  }

  /** What you've done in a square, in the panel and the bar under the map. */
  private tip(sq: string) {
    const touch = matchMedia("(pointer: coarse)").matches;
    let html = touch ? "Tap a square to see what you've done there" : "Point at a square to see what you've done there";
    if (sq) {
      const c = S.c[sq], v = S.v[sq], f = S.f[sq] ?? 0, lvl = this.flagged.get(sq) ?? 0;
      const day = (d: number) => (d === today() ? "today" : d === today() - 1 ? "yesterday" : today() - d < 7 ? `on ${DAYS[new Date(d * DAY).getUTCDay()]}` : `${today() - d} days ago`);
      const bits = [
        c ? `Cleared by you ${c[0] === 1 ? "once" : c[0] === 2 ? "twice" : `${c[0]} times`}, last ${day(c[2])}` : v ? `Been there, last ${day(v[1])}; not cleared yet` : "Never been",
        f ? `${f} flag${f === 1 ? "" : "s"} shot here` : "",
        lvl > 0.1 ? `Flagged today: the Flag Lads hold ${Math.round(lvl * 100)}%` : "",
        Object.entries(S.p).filter(([, p]) => p[0] === sq).map(([n]) => `${esc(n)} won back`).join(", "),
        S.bestAt === sq && S.best > 1 ? `Your best combo, x${S.best}` : "",
        ...scars().filter((s) => s.sq === sq).map((s) => `Scar: ${esc(s.what)}`),
      ].filter(Boolean);
      html = `<b>${esc(nameOf(sq))}</b><br>${bits.join(" · ")}`;
    }
    const p = this.panel?.querySelector(".ymtip");
    if (p) p.innerHTML = html;
    const bar = $("bigmaphint"), text = html.replace(/<br>/g, ": ").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    if (bar.textContent !== text) bar.textContent = text;
  }
}

/** Draw your map's squares on a map canvas: P turns scene (x, z) into pixels, scale is pixels a metre. */
export function drawOwn(g: CanvasRenderingContext2D, own: Own[], P: (x: number, z: number) => number[], scale: number, dpr: number) {
  const gap = Math.min(2 * dpr, own[0] ? own[0].s * scale * 0.04 : 0);
  for (const o of own) {
    const [x, y] = P(o.x0, o.z0), w = o.s * scale;
    g.fillStyle = o.fill;
    g.fillRect(x + gap, y + gap, w - 2 * gap, w - 2 * gap);
    if (o.ring) { g.strokeStyle = o.ring; g.lineWidth = Math.max(2 * dpr, w * 0.06); g.strokeRect(x + w * 0.08, y + w * 0.08, w * 0.84, w * 0.84); }
  }
  const on = own.find((o) => o.on);
  if (on) {
    const [x, y] = P(on.x0, on.z0), w = on.s * scale;
    g.strokeStyle = "#fff"; g.lineWidth = 2 * dpr; g.strokeRect(x + 1, y + 1, w - 2, w - 2);
  }
}

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = `
#bigmap.yours #mapkey{display:none}
#yourpanel{display:none}
#bigmap.yours #yourpanel{display:grid;gap:10px;align-content:start;order:-1;flex:none;width:184px;box-sizing:border-box;max-height:min(calc(92vw - 196px),calc(100vh - 92px));overflow-y:auto;
  padding:10px 10px 12px;background:rgba(14,16,18,.86);border:1px solid var(--line);color:var(--ink);font-family:var(--f-hud);pointer-events:auto}
#yourpanel h3{margin:0;font-size:20px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;line-height:1.05}
#yourpanel .ympct b{display:block;font-size:54px;font-weight:800;line-height:.9}
#yourpanel .ympct small{font-size:20px}
#yourpanel .ympct span{display:block;font-size:13px;color:var(--muted);line-height:1.2;margin-top:2px}
#yourpanel .ymbar{display:flex;height:8px;background:rgba(255,255,255,.12);overflow:hidden}
#yourpanel .ymbar span{display:block;height:100%}
#yourpanel dl{display:grid;grid-template-columns:1fr auto;gap:3px 8px;margin:0;font-size:14px;line-height:1.15}
#yourpanel dt{color:var(--muted)}
#yourpanel dd{margin:0;font-weight:700;text-align:right;font-variant-numeric:tabular-nums}
#yourpanel .ymkey{display:flex;flex-wrap:wrap;gap:3px 10px;font-size:12px;color:var(--muted)}
#yourpanel .ymkey i{display:inline-block;width:10px;height:10px;margin-right:4px;vertical-align:-1px;box-sizing:border-box}
#yourpanel .ymkey i.pint{background:#d9932b;border-radius:0 0 3px 3px}
#yourpanel .ymtip{margin:0;padding-top:8px;border-top:1px solid var(--line);font-size:13px;line-height:1.25;color:var(--muted);letter-spacing:0;text-transform:none;min-height:3.6em}
#yourpanel .ymtip b{color:var(--ink);font-size:15px}
@media (max-width:700px),(max-height:500px){
  #bigmap.yours #yourpanel{position:absolute;left:4px;top:4px;width:150px;max-height:calc(100% - 8px);gap:6px;padding:8px}
  #yourpanel .ympct b{font-size:34px}
  #yourpanel dl,#yourpanel .ymkey,#yourpanel .ymtip{display:none}
}`;
  document.head.appendChild(s);
}
