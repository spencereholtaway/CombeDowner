// The zones: the map opened up a part at a time. You start in a small first zone round where
// everyone starts, with a shimmering wall like the force field's round it. Each zone but the last
// has a strange structure of its own (oddments.ts) with a few sockets, and its own challenges
// (challenges.ts); fill its sockets and the wall moves out to take in the next zone, with a fly-over
// of it (reveal.ts). Ways to get about (buses, boats, balloons, trains, the cable car) open up with
// the zones as well, and travel never takes you past the wall.
//
// The zones come from the map alone, so they work on any map and every player gets the same ones.
// The map is cut into cells on its squares' grid. The first zone is a small one to learn the game
// in, grown from the start along the streets just far enough to hold a pub, a second place for a
// job, a main road for the buses and open ground for a structure with only two sockets, so the
// first unlock comes quickly. The busiest knot of streets, the town's heart, is held back as the
// last zone, and the rest are swept out round it like a clock's hand from where everyone starts,
// each with a fair share of the town. Each is named after the biggest district in it
// (<map>-districts.json, from tools/districts.py), or failing that the biggest named park or square.
//
// For comparing, ?cut= picks another way: "streets" is the old one (the first area, then growth
// along the streets, a step into a busy cell cheap); "quiet" grows from the tutorial zone with a
// busy cell dear instead; "heart" holds the heart back and grows the rest along the streets.
// ?zonemap=1 draws every zone on the big map, numbered in the order they open.
//
// Who decides what: nobody. How many zones are open follows from how many sockets are full, which
// the host of oddments.ts decides and sends round; so the wall stands in the same place on every
// screen. Free play (no zones) is the host's say, sent with the sockets. A game from the games list
// (gameslist.ts) takes the wall down on each screen while it's on.
import * as THREE from "three";
import type { GameMap } from "./map";
import { openGround } from "./oddments";
import { feature } from "./features";

/** A way to get about that opens with a zone. */
export type TravelKind = "bus" | "busroute" | "boat" | "balloon" | "train" | "cable";

const TRAVEL_LINE: Record<TravelKind, string> = {
  bus: "New: call a bus from any stop",
  busroute: "New: drive a bus route",
  boat: "New: take the tiller of a canal boat",
  balloon: "New: hot air balloons from the park at dawn",
  train: "New: trains to the next town",
  cable: "New: the cable car",
};
const TRAVEL_SHUT: Record<TravelKind, string> = {
  bus: "No buses out this way yet",
  busroute: "No bus routes out this way yet",
  boat: "The boats aren't taking anyone out this way yet",
  balloon: "No balloon flights out this way yet",
  train: "The doors are shut: no trains from here yet",
  cable: "The cable car isn't running yet",
};
/** These open in turn, one a zone from the second on; trains and the cable car open with the zones their stations are in. */
const SLOTTED: TravelKind[] = ["bus", "busroute", "boat", "balloon"];

const BUILT_IN = import.meta.glob<{ ds?: [number, number, string, string][] }>("../public/maps/*-districts.json", { eager: true, import: "default" });
const BUILT_IN_PUBS = import.meta.glob<{ pb?: [number, number, string, number | null, number | null][] }>("../public/maps/*-pubs.json", { eager: true, import: "default" });
const BUS_ROADS = new Set(["trunk", "primary", "secondary", "tertiary"]);
const RANK: Record<string, number> = { town: 0, suburb: 1, village: 1, quarter: 2, neighbourhood: 3, hamlet: 4 };
const NEAR = 2;   // cells either way looked at for the wall
/** Each map's own spawn ring, kept when the zones move where everyone starts. */
const OWN_SPAWN = new WeakMap<object, number[][] | undefined>();
const SPAWN_ROOM = 120;   // metres from where anyone starts to the first zone's wall, at least

/** How the zones are cut (?cut=streets|quiet|heart): round the town's heart like a clock unless asked. */
export type Cut = "streets" | "quiet" | "heart" | "clock";
const CUTS: Cut[] = ["streets", "quiet", "heart", "clock"];
// read as the page loads, as starting a game clears the address
const ASKED = typeof location === "undefined" ? new URLSearchParams() : new URLSearchParams(location.search);
function cutWanted(): Cut {
  const v = ASKED.get("cut");
  return CUTS.includes(v as Cut) ? (v as Cut) : "clock";
}
/** ?zonemap: every zone drawn on the big map. */
export const zoneMapWanted = ASKED.has("zonemap");

export interface Zone {
  i: number;
  name: string;
  cells: number;
  km2: number;
  /** Its middle (the streets' weight), scene coordinates. */
  x: number; z: number;
  /** Where its structure stands (scene), and how many sockets it has: none in the last zone. */
  home: { x: number; y: number; z: number; n: string } | null;
  sockets: number;
}

export interface Fence { edge(x: number, z: number): number; inside(x: number, z: number, r: number): [number, number] }

/** What a travel kind needs: where it is, and whether all of those places must be open (a cable car's two ends) or any one. */
export interface TravelFind { kind: TravelKind; at: [number, number][]; all?: boolean }

const ringArea = (r: number[][]) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a) / 2;
};

export class Zones {
  readonly list: Zone[] = [];
  /** The cells: their size, the data corner of the first, and how many each way. */
  private c: number; private x0: number; private y0: number; private nx: number; private ny: number;
  /** Each cell's zone, or -1 for one outside the force field. */
  private grid: Int8Array;
  private cum: number[] = [0];
  private openN = 0;
  private cut: Cut = "streets";
  private all = false;
  private only = new Map<number, GameMap>();
  private travel = new Map<TravelKind, number>();
  private wall: THREE.Mesh | null = null;
  private wallLook: THREE.Material | null = null;
  private scene: THREE.Scene | null = null;
  /** Goes up each time the wall moves, for anything drawn from it. */
  version = 0;
  /** The real fence on the main map, while there's a wall. */
  readonly fence: Fence = { edge: (x, z) => this.edgeIn(x, z, (g) => g < this.openN), inside: (x, z, r) => this.insideOf(x, z, r, (g) => g < this.openN) };

  constructor(private map: GameMap, mapId: string) {
    const fr = map.fieldFrame(), I = map.tileIndex;
    const S = I ? I.cells * I.dx : (2 * map.field) / 3;
    const area = Math.PI * map.field * map.field;
    const want = Math.max(150, Math.min(S / 2, Math.sqrt(area / 300)));
    this.c = S / Math.max(1, Math.round(S / want));
    const gx = I ? I.x0 : map.fieldX - map.field, gy = I ? I.y0 : -map.fieldZ - map.field;
    const i0 = Math.floor((fr.x - fr.r - gx) / this.c), i1 = Math.ceil((fr.x + fr.r - gx) / this.c);
    const j0 = Math.floor((fr.y - fr.r - gy) / this.c), j1 = Math.ceil((fr.y + fr.r - gy) / this.c);
    this.x0 = gx + i0 * this.c; this.y0 = gy + j0 * this.c;
    this.nx = i1 - i0; this.ny = j1 - j0;
    this.grid = new Int8Array(this.nx * this.ny).fill(-1);
    this.lay(mapId);
  }

  // ---- laying them out ----------------------------------------------------------------------

  private lay(mapId: string) {
    const { map, c, nx, ny } = this;
    const n = nx * ny, inField = new Uint8Array(n), road = new Float64Array(n);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      for (const [a, b] of [[0.5, 0.5], [0.05, 0.05], [0.95, 0.05], [0.05, 0.95], [0.95, 0.95], [0.5, 0.05], [0.5, 0.95], [0.05, 0.5], [0.95, 0.5]]) {
        if (map.fieldEdgeBase(this.x0 + (i + a) * c, -(this.y0 + (j + b) * c)) > 0) { inField[j * nx + i] = 1; break; }
      }
    }
    const cellOf = (x: number, y: number) => {
      const i = Math.floor((x - this.x0) / c), j = Math.floor((y - this.y0) / c);
      return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i;
    };
    const PATH = new Set(["footway", "path", "steps", "cycleway", "pedestrian", "bridleway", "track"]);
    for (const r of map.wide?.rd ?? map.d.rd) {
      if (PATH.has(r.c)) continue;
      for (let k = 1; k < r.p.length; k++) {
        const a = r.p[k - 1], b = r.p[k], k0 = cellOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        if (k0 >= 0) road[k0] += Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
    }
    const cells = [...Array(n).keys()].filter((k) => inField[k]);
    const cut = cutWanted();
    // a tutorial first zone leaves room for one more, even on a small map
    const N = Math.max(cut === "streets" ? 2 : 3, Math.min(7, Math.round(1 + map.field / 1100)));
    const total = cells.length, roads = cells.reduce((s, k) => s + road[k], 0) || 1;
    const worth = (k: number) => 0.5 / total + (0.5 * road[k]) / roads;
    // the first zone: the first area, if it's a small part of the map, or else the cells round the start
    const D = map.d;
    if (OWN_SPAWN.has(D)) D.spawn = OWN_SPAWN.get(D);
    const sp = D.spawn?.length ? D.spawn : [[0, 0]];
    const hx = sp.reduce((s, p) => s + p[0], 0) / sp.length, hy = sp.reduce((s, p) => s + p[1], 0) / sp.length;
    // the first area is squares 0 to 2 each way (tools/area.py), whatever its own box says
    const I = map.tileIndex, S = I ? I.cells * I.dx : 0;
    const [bx0, by0, bx1, by1] = I ? [I.x0, I.y0, I.x0 + 3 * S, I.y0 + 3 * S] : [0, 0, 0, 0];
    const centre = (k: number): [number, number] => [this.x0 + ((k % nx) + 0.5) * c, this.y0 + (Math.floor(k / nx) + 0.5) * c];
    let first = I ? cells.filter((k) => { const [x, y] = centre(k); return x > bx0 && x < bx1 && y > by0 && y < by1; }) : [];
    if (first.length < 4 || first.length > total * 0.35) first = [];
    const zone = new Int8Array(n).fill(-1);
    // grown out from there along the streets: a step into a cell with streets in it costs less
    const sorted = cells.map((k) => road[k]).filter((v) => v > 0).sort((a, b) => a - b);
    const ref = sorted[Math.floor(sorted.length * 0.8)] || 1;
    const start = cellOf(hx, hy), far = (k: number) => Math.hypot(centre(k)[0] - hx, centre(k)[1] - hy);
    const startCell = start >= 0 && inField[start] ? start : [...cells].sort((a, b) => far(a) - far(b) || a - b)[0];
    if (cut !== "streets") first = [];
    const seeds = first.length ? first : [startCell];
    const nbrs = (k: number) => {
      const i = k % nx, j = Math.floor(k / nx), out: number[] = [];
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a >= 0 && b >= 0 && a < nx && b < ny && inField[b * nx + a]) out.push(b * nx + a);
      }
      return out;
    };
    const busy = (a: number, b: number) => Math.min(1, (road[a] + road[b]) / (2 * ref));
    const streetCost = (a: number, b: number) => c * (2 - busy(a, b));
    // the heart first, on every map, so the tutorial zone can keep out of it
    const heart = cut === "heart" || cut === "clock" ? this.heart(cells, road, nbrs, worth, 1 / N) : null;
    let home: [number, number] = [hx, hy];
    if (cut !== "streets") {
      if (!heart?.has(startCell)) first = this.tutorial(mapId, cells, [startCell], nbrs, streetCost, cellOf, heart, true).cells;
      else {
        // everyone would start in the heart: the tutorial goes to the nearest place outside it, by
        // the streets, that has all it needs, and everyone starts there instead
        const near = this.grow(cells, [...heart], nbrs, streetCost, null).filter((k) => !heart.has(k));
        let pick: { cells: number[]; met: boolean } | null = null;
        for (const k of near.slice(0, 16)) { const t = this.tutorial(mapId, cells, [k], nbrs, streetCost, cellOf, heart, false); if (t.met) { pick = t; break; } }
        first = (pick ?? this.tutorial(mapId, cells, [near[0]], nbrs, streetCost, cellOf, heart, false)).cells;
        home = this.moveSpawn(cells, first, centre(first[0])) ?? centre(first[0]);
      }
    }
    const firstSet = new Set(first);
    const firstShare = first.length ? first.reduce((s, k) => s + worth(k), 0) : 1 / (N + 2);
    const cost = cut === "quiet" ? (a: number, b: number) => c * (1 + 8 * busy(a, b)) : streetCost;
    let order: number[];
    if (cut === "clock") {
      // round the heart like a clock's hand, from the tutorial zone
      const hs = heart ? [...heart] : [], mid = (ks: number[]) => [ks.reduce((s, k) => s + centre(k)[0], 0) / ks.length, ks.reduce((s, k) => s + centre(k)[1], 0) / ks.length];
      const [ox, oy] = hs.length ? mid(hs) : home, [tx, ty] = first.length ? mid(first) : home;
      const from = hs.length ? Math.atan2(ty - oy, tx - ox) : Math.PI / 2, turn = (k: number) => { const [x, y] = centre(k); return ((from - Math.atan2(y - oy, x - ox)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); };
      const rest = cells.filter((k) => !heart?.has(k) && !firstSet.has(k)), t = new Map(rest.map((k) => [k, turn(k)]));
      order = rest.sort((a, b) => t.get(a)! - t.get(b)! || a - b);
    } else {
      order = this.grow(cells, first.length ? first : seeds, nbrs, cost, heart);
      // the heart can stand between the tutorial and the rest: grow on round it from wherever it was reached
      if (heart) { const more = this.grow(cells, [...first, ...heart], nbrs, cost, null).filter((k) => !heart.has(k) && !order.includes(k)); order.push(...more); }
      // cells the growth couldn't reach (cut off by the edge, or behind the heart) join the nearest zone in order
      const reached = new Set(order);
      for (const k of cells) if (!reached.has(k) && !heart?.has(k)) order.push(k);
    }
    const heartShare = heart ? [...heart].reduce((s, k) => s + worth(k), 0) : 0;
    const middle = heartShare ? N - 2 : N - 1;
    const each = (1 - firstShare - heartShare) / middle;
    let z = 0, got = first.length ? firstShare : 0;
    for (const k of order) {
      if (firstSet.has(k)) { zone[k] = 0; continue; }
      const w = worth(k);
      const limit = firstShare + each * z;
      if (got + w / 2 > limit && z < middle) z++;
      zone[k] = z; got += w;
    }
    if (heart) for (const k of heart) zone[k] = N - 1;
    // smooth the edges a little: a cell with three sides in earlier zones goes in with them
    for (let pass = 0; pass < 2; pass++) for (const k of cells) {
      if (zone[k] <= 0) continue;
      const nb = nbrs(k).map((q) => zone[q]);
      const before = nb.filter((q) => q < zone[k]);
      if (before.length >= 3 || (before.length >= 2 && nb.length <= 2)) zone[k] = Math.max(...before);
    }
    if (cut !== "streets") this.mend(cells, zone, nbrs);
    // a zone left with nothing in it (a tiny map) goes, and the rest close up
    const used = [...new Set(cells.map((k) => zone[k]))].sort((a, b) => a - b);
    for (const k of cells) zone[k] = used.indexOf(zone[k]);
    this.grid = zone;
    this.cut = cut;
    this.name(mapId, used.length, cells, road, centre, home, cut !== "streets");
  }

  /** A plain Dijkstra over a few hundred cells from the seeds, never into the held-back ones; ties go by cell number so every machine agrees. */
  private grow(cells: number[], seeds: number[], nbrs: (k: number) => number[], cost: (a: number, b: number) => number, held: Set<number> | null) {
    const dist = new Float64Array(this.grid.length).fill(Infinity), done = new Uint8Array(this.grid.length), order: number[] = [];
    for (const k of seeds) dist[k] = 0;
    for (;;) {
      let best = -1;
      for (const k of cells) if (!done[k] && dist[k] < Infinity && (best < 0 || dist[k] < dist[best])) best = k;
      if (best < 0) break;
      done[best] = 1; order.push(best);
      for (const q of nbrs(best)) {
        if (done[q] || held?.has(q)) continue;
        const d = dist[best] + cost(best, q);
        if (d < dist[q]) dist[q] = d;
      }
    }
    return order;
  }

  /** A small first zone to learn the game in: grown from the start along the streets until it has
   *  a pub, a second place a job can go up (a race starts from one), a main road for the buses,
   *  room round every spawn and open ground for the first structure, within a floor and a cap on
   *  its size. Only the data every
   *  player has from the start is used (the squares come in later, in no fixed order), so bus stops
   *  are judged by the roads buses run on. */
  private tutorial(mapId: string, cells: number[], seeds: number[], nbrs: (k: number) => number[], cost: (a: number, b: number) => number, cellOf: (x: number, y: number) => number, held: Set<number> | null, roomForSpawn: boolean) {
    const map = this.map, area = this.c * this.c;
    const floor = Math.max(1, Math.ceil(1.5e6 / area)), cap = Math.max(floor, Math.floor(3e6 / area));
    const pubs = (BUILT_IN_PUBS[`../public/maps/${mapId}-pubs.json`]?.pb ?? []).map(([x, y]) => [+x, +y]);
    const places = [...(map.d.pl ?? []), ...(map.wide?.d.pl ?? [])].filter((p) => p.n && p.r.length >= 3)
      .map((p) => [p.r.reduce((s, q) => s + q[0], 0) / p.r.length, p.r.reduce((s, q) => s + q[1], 0) / p.r.length]);
    const spots = [...pubs, ...places].filter(([x, y]) => map.fieldEdgeBase(x, -y) > 90);
    const busRoad = new Set<number>();
    for (const r of map.wide?.rd ?? map.d.rd) {
      if (!BUS_ROADS.has(r.c)) continue;
      for (const q of r.p) { const k = cellOf(q[0], q[1]); if (k >= 0) busRoad.add(k); }
    }
    const got = new Set<number>(), saved = this.grid;
    let tried = 0;
    const has = () => {
      const inside = ([x, y]: number[]) => got.has(cellOf(x, y));
      const mine = spots.filter(inside);
      return pubs.some(inside) && mine.some((a) => mine.some((b) => Math.hypot(a[0] - b[0], a[1] - b[1]) >= 250)) && [...got].some((k) => busRoad.has(k));
    };
    // everyone starts well inside it, not up against the wall, and its structure has open ground
    const sp = roomForSpawn && map.d.spawn?.length ? map.d.spawn : [];
    const settled = (slow: boolean) => {
      this.grid = new Int8Array(saved.length).fill(-1);
      for (const k of cells) this.grid[k] = got.has(k) ? 0 : 1;
      const ok = sp.every(([x, y]) => this.edgeIn(x, -y, (g) => g === 0) >= SPAWN_ROOM) && (!slow || !!openGround(this.fenced((g) => g === 0), []));
      this.grid = saved;
      return ok;
    };
    let met = false;
    for (const k of this.grow(cells, seeds, nbrs, cost, held)) {
      if (got.size >= cap) break;
      got.add(k);
      if (got.size < floor || !has() || !settled(false)) continue;
      // looking for open ground is slow, so it's looked for again only as the zone grows by a quarter
      if (got.size < tried * 1.25) continue;
      tried = got.size;
      if (settled(true)) { met = true; break; }
    }
    return { cells: [...got], met };
  }

  /** Everyone starts in the tutorial zone, on open ground near where it was grown from, while the
   *  zones are being played: a small spawn ring there in place of the map's own. */
  private moveSpawn(cells: number[], first: number[], near: [number, number]): [number, number] | null {
    const saved = this.grid, inFirst = new Set(first);
    this.grid = new Int8Array(saved.length).fill(-1);
    for (const k of cells) this.grid[k] = inFirst.has(k) ? 0 : 1;
    const at = openGround(this.fenced((g) => g === 0), [], near);
    this.grid = saved;
    if (!at) return null;
    if (feature("zones")) {
      const D = this.map.d;
      if (!OWN_SPAWN.has(D)) OWN_SPAWN.set(D, D.spawn);
      const R = 12;
      D.spawn = [[at.x - R, at.y - R], [at.x + R, at.y - R], [at.x + R, at.y + R], [at.x - R, at.y + R]];
    }
    return [at.x, at.y];
  }

  /** The busiest knot of streets, about a zone's share of the town, grown out from the cell whose
   *  neighbourhood has the most street in it. */
  private heart(cells: number[], road: Float64Array, nbrs: (k: number) => number[], worth: (k: number) => number, share: number) {
    const around = new Float64Array(road.length);
    for (const k of cells) around[k] = road[k] + nbrs(k).reduce((s, q) => s + road[q], 0);
    const peak = cells.reduce((b, k) => (b < 0 || around[k] > around[b] ? k : b), -1);
    if (peak < 0) return null;
    const got = new Set([peak]);
    let sum = worth(peak);
    // busy cells first, but kept in a lump: a cell hemmed in by the heart counts for more and one far
    // from its middle for less, or it runs off along the main roads in a long arm
    const px = peak % this.nx, py = Math.floor(peak / this.nx);
    const score = (q: number) => {
      const touch = nbrs(q).filter((k) => got.has(k)).length, far = Math.hypot((q % this.nx) - px, Math.floor(q / this.nx) - py);
      return (around[q] * (0.5 + 0.5 * touch)) / (1 + far / 3);
    };
    while (sum < share) {
      let best = -1, bs = -Infinity;
      for (const k of got) for (const q of nbrs(k)) {
        if (got.has(q)) continue;
        const v = score(q);
        if (v > bs || (v === bs && q < best)) { best = q; bs = v; }
      }
      if (best < 0) break;
      got.add(best); sum += worth(best);
    }
    return got;
  }

  /** Each zone in one piece: a stray bit cut off from the rest of its zone goes in with the neighbour it shares most edge with. */
  private mend(cells: number[], zone: Int8Array, nbrs: (k: number) => number[]) {
    for (let pass = 0; pass < 3; pass++) {
      const seen = new Uint8Array(zone.length), pieces: number[][] = [], keep = new Map<number, number[]>();
      for (const k of cells) {
        if (seen[k]) continue;
        const piece = [k], z = zone[k];
        seen[k] = 1;
        for (let h = 0; h < piece.length; h++) for (const q of nbrs(piece[h])) if (!seen[q] && zone[q] === z) { seen[q] = 1; piece.push(q); }
        pieces.push(piece);
        if (piece.length > (keep.get(z)?.length ?? 0)) keep.set(z, piece);
      }
      let moved = false;
      for (const piece of pieces) {
        const z = zone[piece[0]];
        if (z === 0 || keep.get(z) === piece) continue;
        const edge = new Map<number, number>();
        for (const k of piece) for (const q of nbrs(k)) if (zone[q] !== z) edge.set(zone[q], (edge.get(zone[q]) ?? 0) + 1);
        const to = [...edge].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
        if (to) { for (const k of piece) zone[k] = to[0]; moved = true; }
      }
      if (!moved) break;
    }
  }

  private name(mapId: string, N: number, cells: number[], road: Float64Array, centre: (k: number) => [number, number], home: [number, number], quickFirst: boolean) {
    const map = this.map, c = this.c;
    const ds = (BUILT_IN[`../public/maps/${mapId}-districts.json`]?.ds ?? []).map(([x, y, n, kind]) => ({ x, y, n: String(n).replace(/\s*\(.*\)\s*$/, ""), r: RANK[kind] ?? 5 }));
    const taken = new Set<string>();
    const places = [...(map.d.pl ?? []), ...(map.wide?.d.pl ?? [])].filter((p) => p.n && p.r.length >= 3)
      .map((p) => ({ n: p.n, a: ringArea(p.r), x: p.r.reduce((s, q) => s + q[0], 0) / p.r.length, y: p.r.reduce((s, q) => s + q[1], 0) / p.r.length }))
      .sort((a, b) => b.a - a.a || a.n.localeCompare(b.n));
    const sockets = Math.max(4, Math.min(6, Math.round(24 / Math.max(1, N - 1))));
    for (let i = 0; i < N; i++) {
      const mine = cells.filter((k) => this.grid[k] === i);
      let wx = 0, wy = 0, ww = 0;
      for (const k of mine) { const [x, y] = centre(k), w = road[k] + 50; wx += x * w; wy += y * w; ww += w; }
      // its middle: the cell with streets in it nearest where the streets' weight falls (a ring of a
      // zone has its weight in the hole, which isn't it)
      const gx = wx / ww, gy = wy / ww;
      const mid = mine.reduce((b, k) => { const [x, y] = centre(k), d = Math.hypot(x - gx, y - gy) - (road[k] > 0 ? c : 0); return d < b.d ? { k, d } : b; }, { k: mine[0], d: Infinity }).k;
      const [mx, my] = centre(mid);
      // the first zone is named after where everyone starts, the rest after their middles
      const [rx, ry] = i ? [mx, my] : home;
      const inside = (x: number, y: number) => this.zoneAtData(x, y) === i;
      const here = ds.filter((d) => inside(d.x, d.y) && !taken.has(d.n))
        .sort((a, b) => a.r - b.r || Math.hypot(a.x - rx, a.y - ry) - Math.hypot(b.x - rx, b.y - ry) || a.n.localeCompare(b.n));
      let name = "";
      if (here.length) {
        name = here[0].n;
        const other = here.find((d) => d !== here[0] && d.r <= 1 && here[0].r <= 1 && Math.hypot(d.x - here[0].x, d.y - here[0].y) > 1200);
        if (other && i > 0) name += ` and ${other.n}`;
        taken.add(here[0].n); if (other) taken.add(other.n);
      } else {
        const p = places.find((q) => inside(q.x, q.y) && !taken.has(q.n));
        if (p) { name = p.n; taken.add(p.n); }
      }
      this.list.push({ i, name: name || (i ? `The far side, part ${i}` : "Where it all starts"), cells: mine.length, km2: (mine.length * c * c) / 1e6, x: mx, z: -my, home: null, sockets: i === N - 1 ? 0 : i === 0 && quickFirst ? 2 : sockets });
    }
    this.list.forEach((zn, i) => { this.cum[i + 1] = this.cum[i] + zn.sockets; });
    // each structure on open ground in its own zone: the first near where everyone starts, the rest near their middles
    const homes: [number, number][] = [];
    for (const zn of this.list) {
      if (!zn.sockets) continue;
      const lim = this.limited(zn.i);
      const at = openGround(lim, homes, zn.i ? [zn.x, -zn.z] : undefined) ?? this.anyCell(zn.i, road, centre);
      if (!at) continue;
      homes.push([at.x, at.y]);
      zn.home = { x: at.x, z: -at.y, y: map.ground(at.x, -at.y), n: at.n };
    }
  }

  /** The cell with the most streets in zone i, for a structure that found no open ground. */
  private anyCell(i: number, road: Float64Array, centre: (k: number) => [number, number]) {
    let best = -1;
    for (let k = 0; k < this.grid.length; k++) if (this.grid[k] === i && (best < 0 || road[k] > road[best])) best = k;
    if (best < 0) return null;
    const [x, y] = centre(best);
    return { x, y, n: "" };
  }

  // ---- where things are -------------------------------------------------------------------------

  private at(i: number, j: number) { return i < 0 || j < 0 || i >= this.nx || j >= this.ny ? -1 : this.grid[j * this.nx + i]; }

  private zoneAtData(x: number, y: number) { return this.at(Math.floor((x - this.x0) / this.c), Math.floor((y - this.y0) / this.c)); }

  /** The zone scene (x, z) is in, or -1 outside them all. */
  zoneAt(x: number, z: number) { return this.zoneAtData(x, -z); }

  /** How far scene (x, z) is inside the cells ok() allows (negative outside them), out to NEAR cells off. */
  private edgeIn(x: number, z: number, ok: (g: number) => boolean): number {
    const u = (x - this.x0) / this.c, v = (-z - this.y0) / this.c, i = Math.floor(u), j = Math.floor(v);
    const g0 = this.at(i, j), here = g0 < 0 || ok(g0);
    let best = Infinity;
    for (let dj = -NEAR; dj <= NEAR; dj++) for (let di = -NEAR; di <= NEAR; di++) {
      if (!di && !dj) continue;
      const g = this.at(i + di, j + dj);
      if ((g < 0 || ok(g)) === here) continue;
      const a = i + di, b = j + dj;
      const d = Math.hypot(Math.max(a - u, 0, u - a - 1), Math.max(b - v, 0, v - b - 1));
      if (d < best) best = d;
    }
    if (best === Infinity) return here ? 1e6 : -1e6;
    return (here ? best : -best) * this.c;
  }

  /** The nearest spot to scene (x, z) at least r inside the cells ok() allows. */
  private insideOf(x: number, z: number, r: number, ok: (g: number) => boolean): [number, number] {
    const u = (x - this.x0) / this.c, v = (-z - this.y0) / this.c, i = Math.floor(u), j = Math.floor(v), c = this.c;
    let best: [number, number] | null = null, bd = Infinity;
    const shut = (a: number, b: number) => { const g = this.at(a, b); return g >= 0 && !ok(g); };
    for (let dj = -NEAR - 1; dj <= NEAR + 1; dj++) for (let di = -NEAR - 1; di <= NEAR + 1; di++) {
      const a = i + di, b = j + dj, g = this.at(a, b);
      if (g < 0 || !ok(g)) continue;
      const lx = this.x0 + a * c + (shut(a - 1, b) ? r : 0), hx = this.x0 + (a + 1) * c - (shut(a + 1, b) ? r : 0);
      const ly = this.y0 + b * c + (shut(a, b - 1) ? r : 0), hy = this.y0 + (b + 1) * c - (shut(a, b + 1) ? r : 0);
      const px = Math.max(lx, Math.min(hx, x)), py = Math.max(ly, Math.min(hy, -z));
      const d = Math.hypot(px - x, py + z);
      if (d < bd && this.edgeIn(px, -py, ok) >= r - 0.05) { bd = d; best = [px, -py]; }
    }
    if (best) return best;
    const h = this.list[0].home ?? this.list[0];
    return [h.x, h.z];
  }

  /** The map as a challenge sees it while it's being placed in zone k: the force field shrunk to that zone. */
  limited(k: number): GameMap {
    let m = this.only.get(k);
    if (m) return m;
    m = this.fenced((g) => g === k);
    this.only.set(k, m);
    return m;
  }

  private fenced(ok: (g: number) => boolean): GameMap {
    const base = this.map;
    const edge = (x: number, z: number) => Math.min(base.fieldEdgeBase(x, z), this.edgeIn(x, z, ok));
    const inside = (x: number, z: number, r: number): [number, number] => {
      const p = base.fieldEdgeBase(x, z) < r ? base.fieldInsideBase(x, z, r) : [x, z] as [number, number];
      return this.edgeIn(p[0], p[1], ok) < r ? this.insideOf(p[0], p[1], r, ok) : p;
    };
    return new Proxy(base, { get: (t, p, recv) => (p === "fieldEdge" ? edge : p === "fieldInside" ? inside : Reflect.get(t, p, recv)) });
  }

  // ---- opening up ------------------------------------------------------------------------------

  get count() { return this.list.length; }
  /** How many zones are open (all of them in free play). */
  get open() { return this.all ? this.list.length : this.openN; }
  get free() { return this.all; }
  /** Every socket on the map. */
  get sockets() { return this.cum[this.list.length]; }
  /** How many sockets must be full for zone k to open. */
  need(k: number) { return this.cum[Math.max(0, Math.min(k, this.list.length - 1))]; }
  /** How many zones are open with f sockets full. */
  openFor(f: number) { let n = 1; while (n < this.list.length && f >= this.cum[n]) n++; return n; }
  /** The zone whose structure takes the next object, with f full: null once they're all full. */
  current(f: number): Zone | null { const z = this.list[this.openFor(f) - 1]; return z?.sockets ? z : null; }
  isOpen(k: number) { return k >= 0 && k < this.open; }

  /** Set how far things have got. Moves the wall if it's changed. */
  set(f: number, all: boolean) {
    const n = this.openFor(f);
    if (n === this.openN && all === this.all) return;
    this.openN = n; this.all = all;
    this.fenceUp();
  }

  private lifted = false;
  /** Take the wall down on this screen for a while, and put it back (a game from the games list,
   *  gameslist.ts, can be in a zone that isn't open yet). */
  lift(on: boolean) {
    if (on === this.lifted) return;
    this.lifted = on;
    this.fenceUp();
  }

  private fenceUp() {
    this.map.zoneFence = this.all || this.lifted || this.openN >= this.list.length ? null : this.fence;
    this.version++;
    this.build();
  }

  // ---- travel ----------------------------------------------------------------------------------

  /** Which zone each way of getting about on this map opens with, from where it is. */
  planTravel(found: TravelFind[]) {
    this.travel.clear();
    this.version++;
    // on the old cut a bus route waits for every zone it runs through; otherwise it opens with the first
    const all = (t: TravelFind) => t.all && (this.cut === "streets" || t.kind !== "busroute");
    const zoneOf = (t: TravelFind) => {
      const zs = t.at.map(([x, z]) => Math.max(0, this.zoneAt(x, z)));
      return zs.length ? (all(t) ? Math.max(...zs) : Math.min(...zs)) : 0;
    };
    // a kind found in more than one place (two bus routes) opens with the first of them
    const first = new Map<TravelKind, number>();
    for (const t of found) first.set(t.kind, Math.min(first.get(t.kind) ?? Infinity, zoneOf(t)));
    // each kind opens with the zone it's in, from the second zone on (the tutorial keeps to walking)
    if (this.cut !== "streets") {
      for (const [kind, k] of first) this.travel.set(kind, SLOTTED.includes(kind) ? Math.min(this.list.length - 1, Math.max(1, k)) : k);
      return;
    }
    // the slotted ones in the order the map can have them, then as listed, from the second zone on
    let slot = 1;
    for (const kind of SLOTTED.filter((k) => first.has(k)).sort((a, b) => first.get(a)! - first.get(b)! || SLOTTED.indexOf(a) - SLOTTED.indexOf(b))) {
      const k = Math.min(this.list.length - 1, Math.max(slot, first.get(kind)!));
      this.travel.set(kind, k);
      slot = k + 1;
    }
    for (const [kind, k] of first) if (!SLOTTED.includes(kind)) this.travel.set(kind, k);
  }

  /** Whether this map has a way of getting about at all. */
  has(kind: TravelKind) { return this.travel.has(kind); }
  /** Whether a way of getting about is running yet. */
  can(kind: TravelKind) { const k = this.travel.get(kind); return k === undefined || this.isOpen(k); }
  /** What a closed one says. */
  shut(kind: TravelKind) { return TRAVEL_SHUT[kind]; }
  /** The lines for zone k's card: the ways of getting about it opens. */
  news(k: number) { return [...this.travel].filter(([, z]) => z === k && k > 0).map(([t]) => TRAVEL_LINE[t]); }
  /** For the debug panel and the report: each travel kind and its zone. */
  travelPlan() { return [...this.travel].map(([t, z]) => `${t} ${z + 1}`).join(", "); }

  // ---- the wall and the maps -------------------------------------------------------------------

  /** Draw the wall in the scene with the force field's own look. */
  show(scene: THREE.Scene, look: THREE.Material) { this.scene = scene; this.wallLook = look; this.build(); }

  /** The edges between open and shut cells inside the force field, scene coordinates [ax, az, bx, bz]. */
  edges(): number[][] {
    const out: number[][] = [];
    if (!this.map.zoneFence) return out;
    const c = this.c, open = (g: number) => g < 0 || g < this.openN;
    for (let j = 0; j < this.ny; j++) for (let i = 0; i < this.nx; i++) {
      const g = this.at(i, j);
      if (g < 0 || !open(g)) continue;
      const X = this.x0 + i * c, Y = this.y0 + j * c;
      if (this.at(i + 1, j) >= 0 && !open(this.at(i + 1, j))) out.push([X + c, -Y, X + c, -(Y + c)]);
      if (this.at(i - 1, j) >= 0 && !open(this.at(i - 1, j))) out.push([X, -(Y + c), X, -Y]);
      if (this.at(i, j + 1) >= 0 && !open(this.at(i, j + 1))) out.push([X, -(Y + c), X + c, -(Y + c)]);
      if (this.at(i, j - 1) >= 0 && !open(this.at(i, j - 1))) out.push([X + c, -Y, X, -Y]);
    }
    return out;
  }

  /** The shut cells, scene coordinates [x0, z0, x1, z1] (runs along a row joined up), for the maps. */
  shutCells(): number[][] {
    const out: number[][] = [], c = this.c;
    if (!this.map.zoneFence) return out;
    for (let j = 0; j < this.ny; j++) {
      let run = -1;
      for (let i = 0; i <= this.nx; i++) {
        const g = i < this.nx ? this.at(i, j) : -1, shut = g >= 0 && g >= this.openN;
        if (shut && run < 0) run = i;
        if (!shut && run >= 0) { out.push([this.x0 + run * c, -(this.y0 + (j + 1) * c), this.x0 + i * c, -(this.y0 + j * c)]); run = -1; }
      }
    }
    return out;
  }

  /** For ?zonemap: every zone's cells as runs along a row [x0, z0, x1, z1, zone], and the edges between zones, scene coordinates. */
  everyZone(): { cells: number[][]; lines: number[][]; start: number[] } {
    const cells: number[][] = [], lines: number[][] = [], c = this.c;
    for (let j = 0; j < this.ny; j++) {
      let run = -1;
      for (let i = 0; i <= this.nx; i++) {
        const g = i < this.nx ? this.at(i, j) : -1, was = run >= 0 ? this.at(run, j) : -1;
        if (run >= 0 && g !== was) { cells.push([this.x0 + run * c, -(this.y0 + (j + 1) * c), this.x0 + i * c, -(this.y0 + j * c), was]); run = -1; }
        if (g >= 0 && run < 0) run = i;
        if (g < 0) continue;
        const X = this.x0 + i * c, Y = this.y0 + j * c;
        if (this.at(i + 1, j) !== g) lines.push([X + c, -Y, X + c, -(Y + c)]);
        if (this.at(i, j + 1) !== g) lines.push([X, -(Y + c), X + c, -(Y + c)]);
        if (this.at(i - 1, j) < 0) lines.push([X, -(Y + c), X, -Y]);
        if (this.at(i, j - 1) < 0) lines.push([X + c, -Y, X, -Y]);
      }
    }
    const sp = this.map.d.spawn?.length ? this.map.d.spawn : [[0, 0]];
    return { cells, lines, start: [sp.reduce((s, p) => s + p[0], 0) / sp.length, -sp.reduce((s, p) => s + p[1], 0) / sp.length] };
  }

  private build() {
    if (this.wall) { this.wall.removeFromParent(); this.wall.geometry.dispose(); this.wall = null; }
    if (!this.scene || !this.wallLook || !this.map.zoneFence) return;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [], k = 1 / (Math.PI * 2 * this.map.field);
    let along = 0;
    for (const [ax, az, bx, bz] of this.edges()) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 12));
      let prev = -1;
      for (let s = 0; s <= n; s++) {
        const x = ax + ((bx - ax) * s) / n, z = az + ((bz - az) * s) / n;
        const inside = this.map.fieldEdgeBase(x, z) > -2;
        if (!inside) { prev = -1; continue; }
        const g = this.map.ground(x, z), v = pos.length / 3;
        pos.push(x, g - 40, z, x, g + 260, z);
        const u = (along + (len * s) / n) * k;
        uv.push(u, 0, u, 1);
        if (prev >= 0) idx.push(prev, v, prev + 1, prev + 1, v, v + 1);
        prev = v;
      }
      along += len;
    }
    if (!idx.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    this.wall = new THREE.Mesh(geo, this.wallLook);
    this.wall.renderOrder = 5;
    this.wall.frustumCulled = false;
    this.scene.add(this.wall);
  }

  /** For the debug panel: the zone you're in, and the next zone's sockets. */
  describe(x: number, z: number, f: number) {
    const k = this.zoneAt(x, z), cur = this.current(f);
    const here = k >= 0 ? `${k + 1} ${this.list[k].name}` : "outside";
    const next = this.all ? "free play: everything open" : cur ? `${f - this.need(cur.i)}/${cur.sockets} sockets in ${cur.name} open zone ${cur.i + 2}` : "every zone open";
    return `Zone ${here}; ${this.open}/${this.count} open; ${next}; travel ${this.travelPlan() || "none"}`;
  }

  dispose() { this.map.zoneFence = null; if (this.wall) { this.wall.removeFromParent(); this.wall.geometry.dispose(); } }
}
