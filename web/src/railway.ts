// The railways (laid out by tools/railway.py): Brunel's Great Western main line through Bath Spa
// and Oldfield Park, and the line down the Limpley Stoke valley past Dundas that joins it at
// Bathampton. Ballast, sleepers and rails, bridges on arches or girders with no pier in what passes
// under them, stone mouths on the tunnels, and the
// station platforms. InterCity 125s run the main line and Sprinters the valley line, stopping at
// the stations, keeping left and sounding their horns at anyone near the line. Stand on the line
// and one will run you down; get up on the roof of one and it'll take you with it.
//
// Every carriage with doors shows them shut as it runs. A train you can get on (one going on to
// another map) opens the doors on its platform side when it stops: the dark doorways show and the
// leaves slide back off them, and E gets you on. Every other train stops with its doors shut, and
// the boards and the speakers say it's not in service. A route that carries
// on to another map (tools/railway.py's LINKS) offers the town at the far end: taking it hands you
// to main.ts's travel, which rebuilds the game on that map's station platform (see game.ts). The
// screen is black across the journey, and you step off at the far platform beside the train that's
// stood there: a line's linked route dwells at each end of the link on the same wall-clock grid, so
// a train is at Bath Spa whenever one is at Bradford-on-Avon. Both maps keep their own timetable on
// the clock, so everyone everywhere still sees the same trains, and a friend who misses yours
// simply catches a later one.
//
// Every station platform has a departure board (and the HUD says the same when you stand on one):
// the next trains from the station, worked out from the same timetable, with where they're bound
// and the stations they call at (tools/railway.py's SERVICES), the platform and how long till each
// is due. Its clock and times are the game's (daylight.ts), so they agree with the sky and your
// watch: a train every few real minutes is one every few hours of the game's day. Only the trains that go on to another town offer it when you board: at Bath Spa that's
// the train east from platform 2, not the one coming back the other way from platform 1.
//
// Two trains never stand in one place: each route's trains are set off at a moment in the headway
// that keeps them clear, on the track they share, of every other route's (spread), worked out the
// same way from the map's data on every machine.
//
// Who decides what: nobody. The trains run to a timetable worked out from the clock, so every
// player sees every train in the same place without anything going over the network. You decide
// whether a train has hit you, and tell the host, as you would a fall.
import * as THREE from "three";
import { Need, bridgePlan } from "./railbridge";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { model, Part } from "./furniture";
import type { Mover } from "./map";
import { clockAt, gameWait } from "./daylight";

export interface RailData {
  tracks: { n: string; p: number[][] }[];
  routes: { n: string; t: number[][]; st: [number, string][]; both: number; k?: number; to?: string; via?: string[]; on?: number }[];
  platforms: { n: string; r: number[][]; z: number; no?: string }[];
  portals: number[][];
  /** Journeys on to another map (tools/railway.py's LINKS): which line carries on, the station
   *  there, and how long the ride takes on the real line. */
  links?: { line: string; station: string; to: string; to_station: string; secs: number }[];
}

const GAUGE = 0.72;                  // half the distance between the rails
const HEADWAY = 400;                 // seconds between trains on each route
const DWELL = 35;                    // seconds stood at a station
const DOOR_OPEN = 2;                 // the doors start to open this long into the dwell
const DOOR_CLOSE = 6;                // and are shut again this long before it ends
const DOOR_TIME = 1.5;               // seconds the doors take to slide
const STEP = 0.5;                    // seconds between points of a run's timetable
const SHOW = 1100;                   // trains are drawn within this of the player
const SOLID = 160;                   // and block and carry within this
const AHEAD = 400;                   // metres of clear track a train keeps in front of it
const CHUNK = 150;                   // track points to a mesh (fewer, longer meshes are quicker to draw)
// Departure boards hang under the canopy over each platform. CANOPY_Y is the underside the rods
// reach (the stations' canopies are a little over 4 m at the eaves). A platform shorter than
// CANOPY_SHORT gets none; one LONG_PLATFORM or more gets two, at the 2nd and 4th of five parts.
const CANOPY_Y = 3.95;
const BOARD_Y = 2.45;                // the middle of the board itself, above the platform
const CANOPY_SHORT = 40;             // metres: a platform shorter than this has no board
const LONG_PLATFORM = 180;           // metres: a platform this long gets two boards, not one

interface Kind { name: string; cars: { len: number; geo: number; back?: boolean }[]; speed: number; acc: number; dec: number; stops: (n: string) => boolean; engine: "hst" | "dmu" }

export interface Route {
  name: string; pts: { x: number; y: number; z: number; s: number }[]; len: number; stops: [number, string][]; kind: Kind; phase: number; run: number[]; tracks: number[];
  /** Where its trains are bound and the stations they call at after this map, for the boards; and
   *  whether they go on to the linked town (undefined in a file from before that was written). */
  to?: string; via?: string[]; on?: number;
  /** The platform (an index into Railway's platforms) it stands at at each of its stops, by the stop's distance along. */
  plat: Map<number, number>;
  /** Which side that platform is on at each stop, by the same key: 1 on the left going along, -1 on the right. */
  side: Map<number, number>;
  /** Whether you can get on its trains: only those going on to another map open their doors. */
  board: boolean;
  /** The tracks it runs along, in order: which track, which way, and where along the route it starts and ends. */
  segs: { t: number; dir: number; s0: number; s1: number }[];
}

/** A train due at a station, for the boards. */
export interface Departure {
  at: number; to: string; via: string[]; plat: string; status: string; on: string | null;
  /** When it pulls in (seconds, on the wall clock), the stations it calls at from here to the end,
   *  this map's and beyond, and how many coaches it has: for the announcements (announce.ts). */
  arrive: number; calls: string[]; coaches: number;
  /** Whether you can get on it. A train that isn't stands with its doors shut, "Not in service". */
  service: boolean;
}

/** A carriage on its way: where it is and which way it faces, and its doors (along it from its
 *  middle, in its own frame) with the meshes that show them open on one side: the dark doorways,
 *  and the leaves that slide back off them. Shut, the doors are part of the carriage's own model. */
export class Car implements Mover {
  x = 0; z = 0; a = 0; y = 0; top = 0; waist = 0;
  readonly hw = 1.4; readonly hl: number;
  get root() { return this.mesh; }
  doors: number[] = [];
  gap: THREE.Mesh | null = null;
  leaves: THREE.Mesh | null = null;
  looks: DoorLooks | null = null;
  constructor(readonly len: number, readonly mesh: THREE.Mesh) { this.hl = len / 2; }
}

/** Where each carriage's doors are along it (by its model, as trainModels makes them): a Mk3
 *  coach's at its two ends, a Sprinter's a third of the way in from each; a power car has none. */
const DOORS: Record<number, number[]> = { 1: [-10.3, 10.3], 2: [-4.6, 3.4] };
const DOOR_W = 1.1;                  // a doorway's width

/** A carriage's looks with its doors: `shut` is the carriage with every door shut, `open[0]` with
 *  only the -z side's shut (the +z side opening) and `open[1]` the other way round; `gap` and
 *  `leaves` are the doorways and the sliding leaves on the +z side, mirrored to the -z side when
 *  that's the platform's. Swapping the carriage's own geometry rather than adding meshes keeps a
 *  running train to one draw per carriage. */
interface DoorLooks { shut: THREE.BufferGeometry; open: [THREE.BufferGeometry, THREE.BufferGeometry]; gap: THREE.BufferGeometry; leaves: THREE.BufferGeometry }

function doorModels(geo: number, body: THREE.BufferGeometry): DoorLooks | null {
  const xs = DOORS[geo];
  if (!xs) return null;
  const col = geo === 2 ? "#eceae3" : "#c9c6bb";
  const leaves = (z: number): Part[] => xs.flatMap((x) => [
    [new THREE.BoxGeometry(DOOR_W, 2.1, 0.04), col, x, 2.05, z * 1.45],
    [new THREE.BoxGeometry(DOOR_W * 0.55, 0.7, 0.01), "#16181b", x, 2.6, z * 1.475],
  ] as Part[]);
  const gaps: Part[] = xs.flatMap((x) => [
    [new THREE.BoxGeometry(DOOR_W, 2.1, 0.02), "#1b1a18", x, 2.05, 1.425],
    [new THREE.BoxGeometry(DOOR_W, 0.06, 0.3), "#8a8478", x, 1.03, 1.29],
  ] as Part[]);
  const withShut = (zs: number[]) => mergeGeometries([body, model(zs.flatMap(leaves))])!;
  return { shut: withShut([1, -1]), open: [withShut([-1]), withShut([1])], gap: model(gaps), leaves: model(leaves(1)) };
}

export class Train {
  cars: Car[] = [];
  group = new THREE.Group();
  v = 0;                  // m/s
  horn = 0;               // seconds of horn left
  hornAt = -1e9;
  // where it stands and how its doors are (the cable car's door clock, cableway.ts): a train at a
  // platform has its doors open for most of the dwell, and they tell you you can get on
  stop: string | null = null;      // the station it's dwelling at, or null
  side = 0;                        // which side its platform is there (Route.side), 0 away from one
  open = 0;                        // how far the doors are open, 0 to 1
  constructor(readonly key: string, readonly route: Route) {}
  get name() { return this.route.kind.name; }
}

/** An InterCity 125's power car (nose toward +x), a Mk3 coach, and a Sprinter car, waist on the rails at y = 0. */
export function trainModels(): THREE.BufferGeometry[] {
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  // The roof and a side band are each a touch shorter than the body under them, so their end faces
  // sit inside it rather than in the same plane as it: level with it, two faces fight over the
  // depth and the carriage's end flickers as the train goes by. The two amounts differ, so that
  // the roof's end and a band's end don't land on each other and start the same trouble further in.
  const ROOF_SHORT = 0.4, BAND_SHORT = 0.06;
  const roof = (len: number, col: string): Part => [new THREE.CylinderGeometry(1.42, 1.42, len - ROOF_SHORT, 12, 1, false, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.32, 1), col, 0, 3.55, 0];
  const bogies = (len: number): Part[] => [-1, 1].map((e) => [box(2.6, 0.7, 2.1), "#202022", e * (len / 2 - 3.2), 0.55, 0] as Part);
  const windows = (len: number, y: number, col: string, gap = 2.2, w = 1.5): Part[] => {
    const out: Part[] = [];
    // The glass is a thin slab standing a whisker proud of the band it sits in: the band's side is
    // at 1.41 and the glass's outer face at 1.42, so the glass is clearly in front of the band and
    // the two never share a plane. Its height too is set a little over the band's, so its top and
    // bottom edges are inside the band rather than level with its faces.
    for (let x = -len / 2 + 2.6; x < len / 2 - 2; x += gap) for (const z of [-1.405, 1.405]) out.push([box(w, 0.76, 0.03), col, x, y, z]);
    return out;
  };
  // the power car: InterCity Executive grey, a yellow nose, red and white along the side
  const P = 17.8;
  const nose = new THREE.Shape([[0, 0], [2.6, 0], [2.6, 0.5], [1.2, 1.9], [0, 2.4]].map(([x, y]) => new THREE.Vector2(x, y)));
  const noseGeo = new THREE.ExtrudeGeometry(nose, { depth: 2.7, bevelEnabled: false }).translate(0, 0, -1.35);
  const power = model([
    [box(P - 2.6, 2.8, 2.8), "#c9c6bb", -1.3, 2.3, 0],
    [box(P - 2.6 - BAND_SHORT * 2, 0.75, 2.82), "#3a3c42", -1.3, 3.0, 0],
    [box(P - 2.6 - BAND_SHORT * 2, 0.12, 2.83), "#b8262a", -1.3, 1.6, 0],
    [box(P - 2.6 - BAND_SHORT * 2, 0.08, 2.83), "#f4f2ea", -1.3, 1.45, 0],
    roof(P - 2.6, "#5a5c60"),
    [noseGeo, "#f2c230", P / 2 - 2.6, 0.9, 0],
    [box(0.04, 0.5, 1.6), "#151719", P / 2 - 1.85, 3.0, 0],           // the cab windscreen
    [box(0.2, 0.2, 0.2), "#f6f2d8", P / 2 - 0.05, 1.3, 0],            // headlight
    ...bogies(P),
  ]);
  const C = 23;
  const coach = model([
    [box(C, 2.8, 2.8), "#c9c6bb", 0, 2.3, 0],
    [box(C - BAND_SHORT * 2, 0.75, 2.82), "#3a3c42", 0, 2.95, 0],
    [box(C - BAND_SHORT * 2, 0.12, 2.83), "#b8262a", 0, 1.6, 0],
    [box(C - BAND_SHORT * 2, 0.08, 2.83), "#f4f2ea", 0, 1.45, 0],
    roof(C, "#5a5c60"),
    ...windows(C, 2.95, "#16181b", 2.4, 1.9),
    ...bogies(C),
  ]);
  // a Sprinter: Regional Railways white with a dark blue window band and a pale blue stripe
  const S = 23;
  const sprinter = model([
    [box(S - 1.2, 2.8, 2.8), "#eceae3", -0.6, 2.3, 0],
    [box(S - 1.2 - BAND_SHORT * 2, 0.8, 2.82), "#1d2f5c", -0.6, 2.9, 0],
    [box(S - 1.2 - BAND_SHORT * 2, 0.14, 2.83), "#7fb2dc", -0.6, 1.55, 0],
    roof(S - 1.2, "#8b8d90"),
    [box(1.2, 2.6, 2.7), "#eceae3", S / 2 - 0.6, 2.2, 0],
    [box(0.04, 0.9, 2.2), "#151719", S / 2, 2.9, 0],
    [box(0.05, 0.6, 2.6), "#f2c230", S / 2 + 0.01, 1.4, 0],
    [box(0.2, 0.2, 0.2), "#f6f2d8", S / 2 + 0.02, 1.0, 0.8], [box(0.2, 0.2, 0.2), "#f6f2d8", S / 2 + 0.02, 1.0, -0.8],
    ...windows(S, 2.9, "#101318", 2.4, 1.7),
    ...bogies(S),
  ]);
  return [power, coach, sprinter];
}

const KINDS: Record<string, Kind> = {
  hst: {
    name: "InterCity 125", speed: 38, acc: 0.5, dec: 0.7, stops: (n) => n === "Bath Spa", engine: "hst",
    cars: [{ len: 17.8, geo: 0 }, ...Array(5).fill({ len: 23, geo: 1 }), { len: 17.8, geo: 0, back: true }],
  },
  dmu: { name: "Sprinter", speed: 29, acc: 0.6, dec: 0.8, stops: () => true, engine: "dmu", cars: [{ len: 23, geo: 2 }, { len: 23, geo: 2, back: true }] },
};

/** Flat-shaded geometry with its colours and facings packed into bytes, let go of in memory once it's on the graphics card. */
export function compact(pos: number[], col: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const n = g.getAttribute("normal").array as Float32Array;
  g.setAttribute("normal", new THREE.Int8BufferAttribute(Int8Array.from(n, (v) => Math.round(v * 127)), 3, true));
  g.setAttribute("color", new THREE.Uint8BufferAttribute(Uint8Array.from(col, (v) => Math.round(v * 255)), 3, true));
  g.computeBoundingSphere();
  if (!(globalThis as { __keepArrays?: boolean }).__keepArrays)
    for (const a of Object.values(g.attributes) as THREE.BufferAttribute[]) a.onUpload(() => { (a as { array: unknown }).array = null; });
  return g;
}

export class Railway {
  private routes: Route[] = [];
  private trains = new Map<string, Train>();
  private geos: THREE.BufferGeometry[];
  private doorGeos: (DoorLooks | null)[];
  private trainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private group = new THREE.Group();
  private far: { o: THREE.Object3D; x: number; z: number; r: number }[] = [];
  private cullT = 0;
  private cells = new Map<string, number[][]>();      // bridge decks: [track, point] by 16 m square
  private plat: { n: string; no: string; r: number[][]; z: number; x0: number; x1: number; y0: number; y1: number }[] = [];
  private boards: { pl: number; x: number; y: number; a: number; tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D; o: THREE.Object3D; shown: string }[] = [];
  private boardT = 0;
  /** The carriages near the player: solid, and you can stand on them. */
  readonly near: Car[] = [];
  private hitAt = -1e9;

  /** `need`: the headroom wanted under the line at data (x, y) by what passes under it, and where no pier may stand. */
  constructor(readonly d: RailData, private scene: THREE.Scene, private z0: number, private need: Need = () => 0) {
    this.geos = trainModels();
    this.doorGeos = this.geos.map((g, i) => doorModels(i, g));
    this.build();
    scene.add(this.group);
    // the routes' lines and timetables, spaced so trains sharing a track are half the headway apart
    d.routes.forEach((r) => {
      const pts: Route["pts"] = [], segs: Route["segs"] = [];
      for (const [t, dir] of r.t) {
        const tp = d.tracks[t]?.p;
        if (!tp) continue;
        const seq = dir > 0 ? tp : [...tp].reverse(), s0 = pts.length ? pts[pts.length - 1].s : 0;
        for (const q of pts.length ? seq.slice(1) : seq) {
          const last = pts[pts.length - 1];
          pts.push({ x: q[0], y: q[1], z: q[2], s: last ? last.s + Math.hypot(q[0] - last.x, q[1] - last.y) : 0 });
        }
        segs.push({ t, dir, s0, s1: pts[pts.length - 1].s });
      }
      if (pts.length < 2) return;
      // the service type comes from the build (tools/railway.py's SERVICES), not the line's name
      const kind = r.k === 1 ? KINDS.hst : KINDS.dmu;
      const route: Route = { name: r.n, pts, len: pts[pts.length - 1].s, stops: r.st.filter(([, n]) => kind.stops(n)), kind, phase: 0, run: [], tracks: r.t.map((t) => t[0]), to: r.to, via: r.via, on: r.on, plat: new Map(), side: new Map(), board: false, segs };
      // Which platform it stands at at each stop, and exactly where along it. The stop as the
      // tools measured it is the station's middle; the train's own middle is put at the middle of
      // the platform it uses, so a long train stops within its platform instead of reaching its
      // nose to the station's middle and hanging the rest of itself out past the platform's end.
      const cars = kind.cars, trainLen = cars.reduce((a, c) => a + c.len, 0) + Math.max(0, cars.length - 1) * 0.8;
      route.stops = route.stops.map(([s, n]) => {
        // which platform: the one of that station nearest where the stop was measured
        const m = this.at(route, s);
        let best = -1, bd = 25;
        this.plat.forEach((p, k) => { if (p.n === n) { const d = ringDist(p.r, m.x, -m.z); if (d < bd) { bd = d; best = k; } } });
        if (best < 0) return [s, n] as [number, string];
        let lo = Infinity, hi = -Infinity;
        for (const [x, y] of this.plat[best].r) {
          const at = this.along(route, x, y);
          lo = Math.min(lo, at); hi = Math.max(hi, at);
        }
        // the nose stands half a train beyond the platform's middle, so the train's own middle is
        // at the platform's; and never beyond either end of the line it runs on
        const nose = Math.max(trainLen / 2, Math.min(route.len - trainLen / 2, (lo + hi) / 2 + trainLen / 2));
        route.plat.set(nose, best);
        // which side the platform is, from beside the train's middle
        const mid = this.at(route, nose - trainLen / 2), [px, py] = this.across(this.plat[best], route, nose - trainLen / 2);
        route.side.set(nose, mid.tx * (py + mid.z) - -mid.tz * (px - mid.x) > 0 ? 1 : -1);
        return [nose, n] as [number, string];
      });
      route.run = this.timetable(route);
      this.routes.push(route);
    });
    for (const r of this.routes) r.board = this.linkFor(r) !== null;
    this.makeBoards();
    this.routes.forEach((r, i) => {
      const grid = this.linkPhase(r);
      if (grid !== null) { r.phase = grid; return; }
      for (let q = 0; q < i; q++) {
        const o = this.routes[q], shared = r.tracks.find((t) => o.tracks.includes(t));
        if (shared === undefined) continue;
        r.phase = (o.phase + this.reach(o, shared) - this.reach(r, shared) + HEADWAY / 2 + HEADWAY * 100) % HEADWAY;
        return;
      }
      r.phase = (i * 97) % HEADWAY;
    });
    this.spread();
  }

  /** Keep every route's trains clear of every other's. Half a headway apart where two routes first
   *  share a track isn't enough: an InterCity overtakes the stopping train behind it and catches it
   *  up on the track they share, two routes can share more than one stretch, and one standing at a
   *  platform blocks it for the next. So each route not tied to the link's clock is moved, a couple
   *  of seconds at a time either way from where it was put, to the first moment in the headway at
   *  which no train of it is ever on the same stretch of track (with AHEAD clear in front) as one
   *  already placed; failing that, the moment it's in the way least. */
  private spread() {
    const sweeps = this.routes.map((r) => this.sweep(r));
    const placed = this.routes.map((r) => this.linkPhase(r) !== null);
    this.routes.forEach((r, i) => {
      if (placed[i]) return;
      const base = r.phase;
      let best = base, least = Infinity;
      for (let d = 0; d <= HEADWAY / 2 && least > 0; d += 2) for (const p of d ? [base + d, base - d] : [base]) {
        const ph = ((p % HEADWAY) + HEADWAY) % HEADWAY;
        let n = 0;
        this.routes.forEach((o, k) => { if (placed[k] && n < least) n += this.clash(sweeps[i], ph, sweeps[k], o.phase, least - n); });
        if (n < least) { least = n; best = ph; }
        if (!least) break;
      }
      r.phase = best;
      placed[i] = true;
    });
  }

  /** The track a route's train takes up at each second of its run: [track, from, to] (metres along
   *  the track itself) for each stretch from AHEAD in front of its nose back to its tail. */
  private sweep(r: Route): number[][][] {
    const cars = r.kind.cars, len = cars.reduce((a, c) => a + c.len, 0) + Math.max(0, cars.length - 1) * 0.8;
    const out: number[][][] = [];
    for (let i = 0; i < r.run.length; i += Math.round(1 / STEP)) {
      const a = r.run[i] - len, b = r.run[i] + AHEAD, here: number[][] = [];
      for (const g of r.segs) {
        if (g.s1 <= a || g.s0 >= b) continue;
        const u0 = Math.max(a, g.s0) - g.s0, u1 = Math.min(b, g.s1) - g.s0, L = g.s1 - g.s0;
        here.push(g.dir > 0 ? [g.t, u0, u1] : [g.t, L - u1, L - u0]);
      }
      out.push(here);
    }
    return out;
  }

  /** How many seconds of a headway a train of sweep A (set off at phase pa) and one of sweep B
   *  (at pb) are on the same stretch of track, counting no further than `upTo`. */
  private clash(A: number[][][], pa: number, B: number[][][], pb: number, upTo: number): number {
    let n = 0;
    for (let tau = 0; tau < HEADWAY && n < upTo; tau++) {
      let hit = false;
      for (let ta = (((tau - pa) % HEADWAY) + HEADWAY) % HEADWAY; ta < A.length && !hit; ta += HEADWAY)
        for (let tb = (((tau - pb) % HEADWAY) + HEADWAY) % HEADWAY; tb < B.length && !hit; tb += HEADWAY)
          hit = A[Math.floor(ta)].some(([t, a0, a1]) => B[Math.floor(tb)].some(([u, b0, b1]) => t === u && a0 < b1 && b0 < a1));
      if (hit) n++;
    }
    return n;
  }

  /** The phase that puts a linked route's dwell at the station it carries on from on the shared
   *  dwell grid: with it the route's trains stand at that station, doors open, at wall-clock
   *  moments a whole headway apart, and every map works those moments out the same way from the
   *  clock every player already has. A train dwells at Bath Spa at the same moments one dwells at
   *  Bradford-on-Avon, so a traveller who boards during a dwell steps off with a train at the
   *  platform behind them on the far map too (docs/bradford-on-avon.md, stage 3). The routes of a
   *  line that stop at its linked station are spread evenly across the grid in order, so a line's
   *  two directions dwell half a headway apart — neither standing at one platform together nor
   *  meeting on the track they share. Null if this route doesn't carry on from a station it stops
   *  at. */
  private linkPhase(r: Route): number | null {
    const linked = this.routes.filter((o) => this.linkOf(o) !== null);
    const l = this.linkOf(r);
    if (!l) return null;
    // in the same order on both maps, whichever order their files list them in: first the trains
    // going from the station whose name comes first to the other, so the train you board at one end
    // has the same place on the grid as the one you step off beside at the other
    const first = (o: Route) => ((l.station < l.to_station) === (o.on !== 0) ? 0 : 1);
    const onLine = linked.filter((o) => o.name === r.name).sort((a, b) => first(a) - first(b));
    const j = this.dwellIndex(r, l.station);
    if (j < 0) return null;
    const rank = onLine.indexOf(r);
    return (((rank * HEADWAY) / onLine.length - j * STEP) % HEADWAY + HEADWAY) % HEADWAY;
  }

  /** The link a route carries on from, if it serves one: which line carries on, and the station
   *  here it stops at. Null if the route carries on nowhere. */
  private linkOf(r: Route) {
    return (this.d.links ?? []).find((q) => q.line === r.name && r.stops.some(([, n]) => n === q.station)) ?? null;
  }

  /** The town a train on this route takes you to if you board it here, and the link that goes
   *  there; null if its trains don't go on anywhere from here. A line's trains both ways run to the
   *  link's clock (linkPhase), but only those heading on past their last stop here go on to the
   *  linked town: from Bath Spa that's the train east from platform 2, while the one standing at
   *  platform 1 has just come from there. An older file without that note offers both, as before. */
  linkFor(r: Route) {
    const l = this.linkOf(r);
    return l && r.on !== 0 ? l : null;
  }

  /** The run index a route's dwell at `station` begins at (the timetable holds s still through it),
   *  or -1 if the route stops nowhere near it. */
  private dwellIndex(r: Route, station: string): number {
    const at = r.stops.find(([, n]) => n === station)?.[0];
    if (at === undefined) return -1;
    for (let i = 0; i < r.run.length - 1; i++) if (Math.abs(r.run[i] - at) < 0.05 && Math.abs(r.run[i + 1] - at) < 0.05) return i;
    return -1;
  }

  /** How far along a route each half second of a run gets, stopping at its stations. */
  private timetable(r: Route): number[] {
    const K = r.kind, run: number[] = [];
    let s = 0, v = 0, stop = 0, dwell = 0;
    const stops = r.stops.map(([at]) => at).filter((at) => at > 50 && at < r.len - 50);
    while (s < r.len + 200 && run.length < 20000) {
      run.push(s);
      if (dwell > 0) { dwell -= STEP; continue; }
      const next = stops[stop];
      const room = next !== undefined ? next - s : Infinity;
      const cap = Math.sqrt(2 * K.dec * Math.max(0, room));
      v = Math.min(K.speed, v + K.acc * STEP, cap);
      if (next !== undefined && room < 1 && v < 1.5) { s = next; v = 0; dwell = DWELL; stop++; continue; }
      s += Math.max(v, 0.6) * STEP;
    }
    return run;
  }

  /** Seconds into a run when a route's trains reach the start of track t. */
  private reach(r: Route, t: number): number {
    let s = 0;
    for (const tr of r.tracks) {
      if (tr === t) break;
      const p = this.d.tracks[tr].p;
      for (let k = 1; k < p.length; k++) s += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]);
    }
    const k = r.run.findIndex((x) => x >= s);
    return (k < 0 ? r.run.length : k) * STEP;
  }

  /** How far along a route the data point (x, y) is: the distance of the nearest point of the
   *  route's own line. Used to find where a platform's ends lie along it. */
  private along(r: Route, x: number, y: number): number {
    let bd = Infinity, best = 0;
    const p = r.pts;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i];
      const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
      const f = Math.min(1, Math.max(0, ((x - a.x) * vx + (y - a.y) * vy) / l2));
      const d = Math.hypot(x - (a.x + vx * f), y - (a.y + vy * f));
      if (d < bd) { bd = d; best = a.s + (b.s - a.s) * f; }
    }
    return best;
  }

  /** Where s along a route is (scene) and which way it runs. */
  private at(r: Route, s: number) {
    const p = r.pts;
    s = Math.max(0, Math.min(r.len, s));
    let lo = 0, hi = p.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m].s <= s) lo = m; else hi = m; }
    const a = p[lo], b = p[hi], l = b.s - a.s || 1, f = (s - a.s) / l;
    const dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy) || 1;
    return { x: a.x + dx * f, z: -(a.y + dy * f), y: a.z + (b.z - a.z) * f - this.z0, tx: dx / dl, tz: -dy / dl };
  }

  // ---- the track, platforms and tunnel mouths: built once ---------------------------------------
  private build() {
    const z0 = this.z0;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const add = (pos: number[], col: number[]) => {
      if (!pos.length) return;
      const g = compact(pos, col);
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      this.group.add(m);
      const s = g.boundingSphere!;
      this.far.push({ o: m, x: s.center.x, z: s.center.z, r: s.radius + 650 });
    };
    const C = (hex: string) => { const k = new THREE.Color(hex); return [k.r, k.g, k.b]; };
    const BALLAST = C("#7b746a"), SLEEPER = C("#4a3d31"), RAIL = C("#6f6a62"), RAILTOP = C("#c4c1ba"), BRICK = C("#8a5a44"), STONE = C("#c3ae84"), DARK = C("#2a2622"), GIRDER = C("#6f7b7c");
    const STONE_IN = C("#b19c74"), BAND = C("#d3c19a"), CAP = C("#dccfae"), VOUSSOIR = C("#cdb88e"), VOUSSOIR2 = C("#b8a27a"), SOFFIT = C("#9c8a68"), GIRDER2 = C("#859092"), UNDER = C("#5a6264");
    const lerp3 = (a: number[], b: number[], f: number) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    const twin = { piers: [] as number[][], ends: [] as number[][], girders: [] as number[][] };
    this.d.tracks.forEach((t, ti) => {
      const p = t.p, plan = bridgePlan(p, this.need, twin), m = plan.marks();
      twin.piers.push(...m.piers); twin.ends.push(...m.ends); twin.girders.push(...m.girders);
      for (let k0 = 0; k0 < p.length - 1; k0 += CHUNK) {
        const pos: number[] = [], col: number[] = [];
        const quad = (a: number[], b: number[], c: number[], d: number[], cc: number[]) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); for (let q = 0; q < 6; q++) col.push(...cc); };
        for (let k = k0; k < Math.min(p.length - 1, k0 + CHUNK); k++) {
          const a = p[k], b = p[k + 1];
          if (a[3] === 2 && b[3] === 2) continue;      // in a tunnel: the hill hides it
          const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
          const P = (q: number[], off: number, h: number) => [q[0] + nx * off, q[2] - z0 + h, -(q[1] + ny * off)];
          // ballast with sloping shoulders, sleepers, then the two rails
          quad(P(a, -1.6, 0.25), P(b, -1.6, 0.25), P(b, 1.6, 0.25), P(a, 1.6, 0.25), BALLAST);
          for (const s of [1, -1]) quad(P(a, 1.6 * s, 0.25), P(b, 1.6 * s, 0.25), P(b, 2.3 * s, -0.3), P(a, 2.3 * s, -0.3), BALLAST);
          for (let u = 0; u < l; u += 1.5) {
            const f0 = u / l, f1 = Math.min(1, (u + 0.25) / l);
            const A = [a[0] + dx * f0, a[1] + dy * f0, a[2] + (b[2] - a[2]) * f0], B = [a[0] + dx * f1, a[1] + dy * f1, a[2] + (b[2] - a[2]) * f1];
            quad(P(A, -1.3, 0.32), P(B, -1.3, 0.32), P(B, 1.3, 0.32), P(A, 1.3, 0.32), SLEEPER);
          }
          for (const s of [GAUGE, -GAUGE]) {
            quad(P(a, s - 0.04, 0.47), P(b, s - 0.04, 0.47), P(b, s + 0.04, 0.47), P(a, s + 0.04, 0.47), RAILTOP);
            quad(P(a, s + 0.04, 0.32), P(b, s + 0.04, 0.32), P(b, s + 0.04, 0.47), P(a, s + 0.04, 0.47), RAIL);
          }
          // a bridge: Bath-stone sides and parapets down to its arches, with a ring of voussoirs
          // round each, or a steel plate girder over what no arch would clear
          if (a[3] === 1 && b[3] === 1) {
            const n = Math.max(1, Math.ceil(l / 0.75));
            for (let u = 0; u < n; u++) {
              const f0 = u / n, f1 = (u + 1) / n, s0 = plan.s[k] + l * f0, s1 = plan.s[k] + l * f1;
              const A = [a[0] + dx * f0, a[1] + dy * f0, a[2] + (b[2] - a[2]) * f0], B = [a[0] + dx * f1, a[1] + dy * f1, a[2] + (b[2] - a[2]) * f1];
              const lowA = plan.bottom(s0) - A[2], lowB = plan.bottom(s1) - B[2];
              if (lowA > -1.5 && lowB > -1.5 && !plan.span(s0)) continue;     // (low enough to be an embankment's top)
              const kind = plan.kind((s0 + s1) / 2), steel = kind === "girder";
              for (const w of [1, -1]) {
                // the ballast's shoulders fall away under the sides, so the cess beside the track is
                // laid flat out to them, with no slot down into the bridge
                quad(P(A, 1.6 * w, 0.25), P(B, 1.6 * w, 0.25), P(B, (steel ? 2.4 : 2.1) * w, 0.25), P(A, (steel ? 2.4 : 2.1) * w, 0.25), BALLAST);
                if (steel) {
                  quad(P(A, 2.4 * w, 1.1), P(B, 2.4 * w, 1.1), P(B, 2.4 * w, lowB), P(A, 2.4 * w, lowA), GIRDER);
                  quad(P(A, 2.2 * w, 1.1), P(B, 2.2 * w, 1.1), P(B, 2.55 * w, 1.1), P(A, 2.55 * w, 1.1), GIRDER2);
                  if (u % 2 === 0) {
                    const g0 = 0.5 - 0.06 / (l / n), g1 = 0.5 + 0.06 / (l / n), M0 = lerp3(A, B, g0), M1 = lerp3(A, B, g1), m = lowA + (lowB - lowA) * 0.5;
                    quad(P(M0, 2.47 * w, 1.1), P(M1, 2.47 * w, 1.1), P(M1, 2.47 * w, m), P(M0, 2.47 * w, m), GIRDER2);
                  }
                } else {
                  quad(P(A, 2.4 * w, 1.0), P(B, 2.4 * w, 1.0), P(B, 2.4 * w, lowB), P(A, 2.4 * w, lowA), STONE);
                  quad(P(A, 2.46 * w, 0.05), P(B, 2.46 * w, 0.05), P(B, 2.46 * w, -0.15), P(A, 2.46 * w, -0.15), BAND);
                  quad(P(A, 2.5 * w, 1.15), P(B, 2.5 * w, 1.15), P(B, 2.5 * w, 1.0), P(A, 2.5 * w, 1.0), CAP);
                  quad(P(A, 2.1 * w, 1.15), P(B, 2.1 * w, 1.15), P(B, 2.5 * w, 1.15), P(A, 2.5 * w, 1.15), CAP);
                  quad(P(A, 2.1 * w, 0.25), P(B, 2.1 * w, 0.25), P(B, 2.1 * w, 1.15), P(A, 2.1 * w, 1.15), STONE_IN);
                  if (kind === "arch") {
                    // the ring stands a constant depth off the soffit, so it grows taller where the arch is steep
                    const slope = (lowB - lowA) / (l / n), ring = Math.min(2.5, 0.65 * Math.hypot(1, slope));
                    quad(P(A, 2.43 * w, lowA + ring), P(B, 2.43 * w, lowB + ring), P(B, 2.43 * w, lowB), P(A, 2.43 * w, lowA), u % 2 ? VOUSSOIR : VOUSSOIR2);
                  }
                }
              }
              quad(P(A, -2.4, lowA), P(B, -2.4, lowB), P(B, 2.4, lowB), P(A, 2.4, lowA), steel ? UNDER : SOFFIT);
            }
            // the faces of the piers and abutments under each span's two ends
            for (const q of plan.spans) {
              if (q.kind === "wall") continue;
              for (const sp of [q.a, q.b]) {
                if (sp < plan.s[k] || sp >= plan.s[k + 1]) continue;
                const f = (sp - plan.s[k]) / l, M = lerp3(a, b, f), lo = plan.ground(sp) - M[2] - 1, hi = plan.bottom(sp) - M[2];
                if (hi - lo < 0.3) continue;
                quad(P(M, -2.4, lo), P(M, 2.4, lo), P(M, 2.4, hi), P(M, -2.4, hi), STONE);
              }
            }
            for (let q = k; q <= k + 1; q++) {
              const key = `${Math.floor(p[q][0] / 16)},${Math.floor(-p[q][1] / 16)}`;
              (this.cells.get(key) ?? this.cells.set(key, []).get(key)!).push([ti, Math.min(q, p.length - 2)]);
            }
          }
        }
        add(pos, col);
      }
    });
    // tunnel mouths: a stone face with the arch, black inside
    const pos: number[] = [], col: number[] = [];
    const quad = (a: number[], b: number[], c: number[], d: number[], cc: number[]) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); for (let q = 0; q < 6; q++) col.push(...cc); };
    for (const [x, y, z, ang] of this.d.portals) {
      const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux, R = 3.6, spring = 3.4, base = z - z0;
      const P = (u: number, v: number, h: number) => [x + ux * u + nx * v, base + h, -(y + uy * u + ny * v)];
      const arch = (v: number) => (Math.abs(v) < R ? spring + Math.sqrt(R * R - v * v) : -1);
      for (let v = -10; v < 10 - 1e-6; v += 0.5) {
        const w = v + 0.5;
        for (const u of [0, 1.2]) quad(P(u, v, arch(v)), P(u, w, arch(w)), P(u, w, 9), P(u, v, 9), STONE);
        quad(P(0, v, 9), P(0, w, 9), P(1.2, w, 9), P(1.2, v, 9), STONE);
        if (Math.abs(v) < R && Math.abs(w) <= R) quad(P(1.2, v, arch(v)), P(1.2, w, arch(w)), P(14, w, arch(w)), P(14, v, arch(v)), DARK);
      }
      for (const s of [R, -R]) quad(P(0.6, s, 0), P(14, s, 0), P(14, s, spring), P(0.6, s, spring), DARK);
      quad(P(1.2, -R, 0.2), P(1.2, R, 0.2), P(1.2, R, spring + R), P(1.2, -R, spring + R), DARK);   // the dark beyond
    }
    add(pos, col);
    // the platforms: paving on top, brick down the sides, and along the edge by the track a pale
    // stone coping, the buff studded strip to warn you off it and the yellow line to stand behind
    const tracks2 = this.d.tracks.map((t) => t.p);
    const COPING = C("#d9d3c6"), STUDS = C("#c8a560"), YELLOW = C("#e9c41f");
    for (const pl of this.d.platforms) {
      const ring = pl.r, top = pl.z - z0;
      const shape = new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y)));
      const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
      const pos2: number[] = [], col2: number[] = [];
      const surf = g.toNonIndexed().getAttribute("position");
      const PAVE = C("#b5ada0");
      for (let q = 0; q < surf.count; q++) { pos2.push(surf.getX(q), top, surf.getZ(q)); col2.push(...PAVE); }
      let area = 0;
      for (let q = 0; q < ring.length; q++) { const A = ring[q], B = ring[(q + 1) % ring.length]; area += A[0] * B[1] - B[0] * A[1]; }
      const xs = ring.map((q) => q[0]), ys = ring.map((q) => q[1]);
      const x0 = Math.min(...xs) - 6, x1 = Math.max(...xs) + 6, y0 = Math.min(...ys) - 6, y1 = Math.max(...ys) + 6;
      const near = tracks2.flatMap((p) => p.slice(1).map((q, i) => [p[i], q]).filter(([a, b]) => Math.max(a[0], b[0]) > x0 && Math.min(a[0], b[0]) < x1 && Math.max(a[1], b[1]) > y0 && Math.min(a[1], b[1]) < y1));
      for (let q = 0; q < ring.length; q++) {
        const A = ring[q], B = ring[(q + 1) % ring.length];
        pos2.push(A[0], top, -A[1], B[0], top, -B[1], B[0], top - 4, -B[1], A[0], top, -A[1], B[0], top - 4, -B[1], A[0], top - 4, -A[1]);
        for (let k = 0; k < 6; k++) col2.push(...BRICK);
        // an edge by the track (its middle within a rail's width of a train's side): its strips,
        // laid inward (the ring's inside is to the left going round anticlockwise)
        const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
        if (len < 0.5) continue;
        const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
        if (!near.some(([a, b]) => segDist(a, b, mx, my) < 3.4)) continue;
        const s = area > 0 ? 1 : -1, nx = (-(B[1] - A[1]) / len) * s, ny = ((B[0] - A[0]) / len) * s;
        const strip = (w0: number, w1: number, h: number, c: number[]) => {
          const P = (Q: number[], w: number) => [Q[0] + nx * w, top + h, -(Q[1] + ny * w)];
          pos2.push(...P(A, w0), ...P(B, w0), ...P(B, w1), ...P(A, w0), ...P(B, w1), ...P(A, w1));
          for (let k = 0; k < 6; k++) col2.push(...c);
        };
        strip(0, 0.45, 0.01, COPING); strip(0.5, 0.9, 0.012, STUDS); strip(1.05, 1.15, 0.012, YELLOW);
      }
      add(pos2, col2);
      this.plat.push({ n: pl.n, no: pl.no ?? "", r: ring, z: top, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
    }
  }

  /** A station platform's middle (data coords) and its top, for standing someone on it when they
   *  arrive by train: the platform the trains from the linked town come in at (Bath Spa's platform
   *  1), halfway across it beside where a train stands. Null if this map has no such platform. */
  platform(station: string): { centre: [number, number]; z: number } | null {
    const at = (s: number) => this.routes.find((r) => r.stops.some(([d, n]) => n === station && Math.abs(d - s) < 1e-6));
    const stops = this.routes.flatMap((r) => r.stops.filter(([, n]) => n === station).map(([s]) => s));
    // the stop of a train that's come from the linked town (it doesn't go on there), or any
    const came = this.routes.find((r) => this.linkOf(r)?.station === station && r.on === 0);
    const s = came ? came.stops.find(([, n]) => n === station)![0] : stops[0];
    const r = came ?? (s !== undefined ? at(s) : undefined);
    const k = r?.plat.get(s!);
    if (!r || k === undefined) {
      const p = this.plat.find((q) => q.n === station);
      return p ? { centre: inside(p.r), z: p.z + this.z0 } : null;
    }
    // (s is the train's nose, so its middle — where the doors are best reached — is half a train back)
    const cars = r.kind.cars, len = cars.reduce((a, c) => a + c.len, 0) + Math.max(0, cars.length - 1) * 0.8;
    return { centre: this.across(this.plat[k], r, s! - len / 2), z: this.plat[k].z + this.z0 };
  }

  /** The middle of platform p's width beside s along route r (data coords). */
  private across(p: { r: number[][] }, r: Route, s: number): [number, number] {
    const m = this.at(r, s), x = m.x, y = -m.z;
    // the nearest point of its edge, then on in that direction to its far side
    let qx = x, qy = y, bd = Infinity;
    for (let i = 0, j = p.r.length - 1; i < p.r.length; j = i++) {
      const [ax, ay] = p.r[j], [bx, by] = p.r[i], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
      const f = Math.min(1, Math.max(0, ((x - ax) * vx + (y - ay) * vy) / l2)), cx = ax + vx * f, cy = ay + vy * f, d = Math.hypot(cx - x, cy - y);
      if (d < bd) { bd = d; qx = cx; qy = cy; }
    }
    const l = Math.hypot(qx - x, qy - y) || 1, ux = (qx - x) / l, uy = (qy - y) / l;
    let a = -1, b = -1;
    for (let t = l; t < l + 25; t += 0.25) {
      if (inRing(p.r, x + ux * t, y + uy * t)) { if (a < 0) a = t; b = t; } else if (a >= 0) break;
    }
    if (a < 0) return inside(p.r);
    const t = (a + b) / 2;
    return [x + ux * t, y + uy * t];
  }

  /** The station platform you're standing on at scene (x, z), feet at y: its station and number. */
  platformAt(x: number, z: number, y: number): { station: string; no: string } | null {
    for (const p of this.plat) {
      if (!p.n || Math.abs(y - p.z) > 0.3 || x < p.x0 || x > p.x1 || -z < p.y0 || -z > p.y1) continue;
      if (inRing(p.r, x, -z)) return { station: p.n, no: p.no };
    }
    return null;
  }

  /** The station nearest scene (x, z) and how far it is to the nearest of its platforms (0 on
   *  or over one), or null if there's none within `range` metres. */
  stationNear(x: number, z: number, range: number): { station: string; far: number } | null {
    let best: { station: string; far: number } | null = null;
    for (const p of this.plat) {
      if (!p.n) continue;
      const dx = Math.max(p.x0 - x, 0, x - p.x1), dy = Math.max(p.y0 + z, 0, -z - p.y1);
      const far = Math.hypot(dx, dy);
      if (far <= range && (!best || far < best.far)) best = { station: p.n, far };
    }
    return best;
  }

  /** The next trains from a station, soonest first: when each leaves (seconds, on the wall clock),
   *  where it's bound and the stations it calls at after this map, the platform, how soon it's due
   *  (or that it's boarding), and the town it takes you to if it goes on to one. Pass `only` (a
   *  platform's number) for the trains from that platform alone, as a board standing on it is. */
  departures(station: string, n = 3, only?: string): Departure[] {
    const now = this.clock, out: Departure[] = [];
    for (const r of this.routes) {
      const j = this.dwellIndex(r, station);
      if (j < 0) continue;
      const s = r.stops.find(([, m]) => m === station)![0], k = r.plat.get(s);
      const plat = k !== undefined ? this.plat[k].no : "";
      if (only && plat !== only) continue;
      const link = this.linkFor(r);
      // where it calls after here: this map's stations further along, then those beyond it, ending
      // where it's bound
      const calls: string[] = [];
      const add = (n: string) => { if (n && n !== station && !calls.includes(n)) calls.push(n); };
      for (const [at, m] of r.stops) if (at > s) add(m);
      for (const m of r.via ?? (link ? [link.to_station] : [])) add(m);
      if (r.to) { const i = calls.indexOf(r.to); if (i >= 0) calls.splice(i, 1); add(r.to); }
      const coaches = r.kind.cars.filter((c) => c.geo !== 0).length;
      // the dwell starts at k * HEADWAY + phase + j * STEP; the next whose doors haven't shut
      const t0 = r.phase + j * STEP, ends = DWELL - DOOR_CLOSE;
      for (let m = Math.ceil((now - ends - t0) / HEADWAY), c = 0; c < n; m++, c++) {
        const arrive = m * HEADWAY + t0;
        out.push({
          at: arrive + DWELL, to: r.to ?? link?.to_station ?? (r.name || "Train"), via: r.via ?? (link ? [link.to_station] : []),
          plat, on: link?.to_station ?? null, arrive, calls, coaches, service: r.board,
          status: now >= arrive ? (r.board ? "Boarding" : "Stopped") : arrive - now < 45 ? "Due" : gameWait(arrive - now),
        });
      }
    }
    return out.sort((a, b) => a.at - b.at).slice(0, n);
  }

  /** A departure board at each station platform, hanging from the canopy over it: a dark box on two
   *  rods either side, an amber dot-matrix face front and back, facing along the platform. A long
   *  platform gets more than one, so you're never far from one: none over CANOPY_SHORT metres, then
   *  one every BOARD_EVERY, spaced evenly down it. */
  private makeBoards() {
    const posts = new THREE.MeshLambertMaterial({ color: "#2a2c30" });
    const box = new THREE.BoxGeometry(2.3, 0.95, 0.16);
    const face = new THREE.PlaneGeometry(2.16, 0.84);
    this.plat.forEach((p, k) => {
      if (!p.n) return;
      // where a train stands at it: the stop of a route that uses it
      const r = this.routes.find((q) => [...q.plat.values()].includes(k));
      if (!r) return;
      const s = [...r.plat.entries()].find(([, v]) => v === k)![0];
      // board middle at BOARD_Y above the platform; the rods go up to the canopy's underside
      const rodLen = Math.max(0.5, CANOPY_Y - BOARD_Y);
        const len = this.platLength(p, r);
        // One board at the middle of a short platform; a long one (LONG_PLATFORM or more) is taken as
        // five parts and gets boards at the 2nd and 4th, so there's always one within about a
        // hundred paces and they don't crowd each other.
        // one in the middle of a short platform; a long one gets that middle board and two more out
        // either side of it, at the 2nd and 4th of five parts
        const marks = len < CANOPY_SHORT ? [] : len >= LONG_PLATFORM ? [0.4, 0.6, 0.8] : [0.5];
        for (const f of marks) {
          // down the platform in a train's own measure: `s` is its nose, so the boards sit where
          // trains stand
          const along = s + (f - 0.5) * len;
        const [x, y] = this.across(p, r, along);
        const m = this.at(r, along), a = Math.atan2(-m.tz, m.tx);
        const c = document.createElement("canvas");
        c.width = 512; c.height = 200;
        const ctx = c.getContext("2d")!, tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const lit = new THREE.MeshBasicMaterial({ map: tex });
        const o = new THREE.Group();
        const housing = new THREE.Mesh(box, posts);
        housing.position.y = BOARD_Y;
        o.add(housing);
        for (const side of [1, -1]) {
          const f = new THREE.Mesh(face, lit);
          f.position.set(0, BOARD_Y, side * 0.085);
          f.rotation.y = side > 0 ? 0 : Math.PI;
          o.add(f);
          // a rod up from the board into the canopy, and a short one under it
          const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, rodLen, 5), posts);
          rod.position.set(side * 0.9, BOARD_Y + 0.475 + rodLen / 2, 0);
          o.add(rod);
        }
        // its face looks along the platform (the board's z along the track)
        o.position.set(x, p.z, -y);
        o.rotation.y = a + Math.PI / 2;
        o.traverse((q) => { q.castShadow = true; });
        this.group.add(o);
        this.boards.push({ pl: k, x, y, a, tex, ctx, o, shown: "" });
      }
    });
  }

  /** How long a platform is, in metres: its ring's perimeter. */
  private platLength(p: { r: number[][] }, _r: Route): number {
    let L = 0;
    for (let i = 0, j = p.r.length - 1; i < p.r.length; j = i++) L += Math.hypot(p.r[i][0] - p.r[j][0], p.r[i][1] - p.r[j][1]);
    return L / 2;   // the ring runs up one side and back the other, so half of it is the platform
  }

  /** Write the boards near (px, pz) afresh, once a second. */
  private updateBoards(dt: number, px: number, pz: number) {
    this.boardT -= dt;
    if (this.boardT > 0) return;
    this.boardT = 1;
    for (const b of this.boards) {
      const far = Math.hypot(b.x - px, -b.y - pz);
      b.o.visible = far < 400;
      if (far > 90) continue;
      const p = this.plat[b.pl], now = this.clock, list = this.departures(p.n, 4, p.no || undefined);
      // times on the game's clock (daylight.ts), as the sky and your watch have it, not the real one
      const hhmm = clockAt;
      // the train standing at this platform, if one is: the first whose dwell has started
      const here = list[0] && now >= list[0].at - DWELL ? list[0] : null;
      const clock = hhmm(now);
      // a train you can't get on is shown as one, not as a departure
      const dest = (d: Departure) => (d.service ? d.to : "Not in service");
      const text = JSON.stringify([clock, here?.at ?? 0, ...(here ? list.slice(1, 3) : list).map((d) => [hhmm(d.at), dest(d)])]);
      if (text === b.shown) continue;
      b.shown = text;
      // Beta's board: PLATFORM n and the clock across the top, and the train at the platform filled
      // amber while it dwells, the next trains below. Every string is measured and cut to its own
      // column (the same way as the boards did before), so a long name can't run into the clock or
      // off the edge, and the amber block's lines can't run into each other.
      const g = b.ctx, W = 512, H = 200, AMBER = "#ffb21e";
      g.fillStyle = "#0a0a0a"; g.fillRect(0, 0, W, H);
      g.textBaseline = "middle";
      /** The text cut to fit w px: shortened with an ellipsis, never run over what's beside it. */
      const fit = (t: string, px: number, w: number) => {
        g.font = `bold ${px}px "Courier New", monospace`;
        if (g.measureText(t).width <= w) return t;
        let s = t;
        while (s.length > 1 && g.measureText(`${s}…`).width > w) s = s.slice(0, -1);
        return `${s}…`;
      };
      /** One cell: where it starts and how wide it may be. `right` puts it at the column's right edge. */
      const cell = (t: string, px: number, y: number, col: [number, number], right = false, ink = AMBER) => {
        if (!t) return;
        g.fillStyle = ink;
        g.textAlign = right ? "right" : "left";
        g.fillText(fit(t, px, col[1]), right ? col[0] + col[1] : col[0], y);
      };
      // PLATFORM n, then the clock on the right. It has no seconds: the game's clock runs a minute
      // to every real second, so they'd only blur. "17:36" at bold 20 px monospace is 60 px wide.
      const HEAD: [number, number] = [12, W - 24 - 72];
      const CLOCK: [number, number] = [W - 12 - 72, 72];
      cell(p.no ? `PLATFORM ${p.no}` : p.n, 20, 20, HEAD);
      cell(clock, 20, 20, CLOCK, true);
      g.fillStyle = AMBER; g.fillRect(12, 34, W - 24, 2);
      let rows = list;
      if (here) {
        // lit up: where it's going and how long till its doors shut
        const shut = here.at - DOOR_CLOSE, arr = here.at - DWELL;
        const what = !here.service ? "Please do not board" : now < arr + DOOR_OPEN ? "Arriving" : now < shut ? `Doors close in ${gameWait(shut - now)}` : "Doors closing";
        g.fillStyle = AMBER; g.fillRect(8, 42, W - 16, 88);
        cell("NOW AT THIS PLATFORM", 15, 58, [20, W - 40], false, "#0a0a0a");
        cell(dest(here), 26, 84, [20, W - 40], false, "#0a0a0a");
        cell(`${hhmm(here.at)}  ${what}`, 19, 112, [20, W - 40], false, "#0a0a0a");
        rows = list.slice(1, 3);
      }
      if (!list.length) cell("No trains", 26, 110, [0, W], false);
      const TIME: [number, number] = [12, 64], DEST: [number, number] = [84, W - 84 - 100],
        STATUS: [number, number] = [W - 12 - 100, 100];
      rows.forEach((d, i) => {
        const y = here ? 150 + i * 26 : 62 + i * 34, arr = d.at - DWELL;
        const status = now >= arr ? (d.service ? "Boarding" : "Stopped") : arr - now < 60 ? "Due" : "On time";
        cell(hhmm(d.at), 20, y, TIME);
        cell(dest(d), 20, y, DEST);
        cell(status, 20, y, STATUS, true);
      });
      b.tex.needsUpdate = true;
    }
  }

  /** Every train running now, for checking a build (tools/travel_probe.mjs): which route it's on,
   *  the town it goes on to if you board it (""), the station it's dwelling at ("") and how far its doors are open, and where its first carriage
   *  is standing (scene coords), so a check can go and board it. */
  trainsNow(): { route: string; on: string; stop: string; open: number; v: number; x: number; y: number; z: number }[] {
    return [...this.trains.values()].map((t) => {
      const c = t.cars.find((k) => k.mesh.visible);
      return { route: t.route.name, on: this.linkFor(t.route)?.to_station ?? "", stop: t.stop ?? "", open: Math.round(t.open * 100) / 100, v: Math.round(t.v), x: c?.x ?? 0, y: c?.y ?? 0, z: c?.z ?? 0 };
    });
  }

  /** What there is to stand on at scene (x, z): a platform, or the deck of a railway bridge. Or null. */
  floor(x: number, z: number): number | null {
    const y = -z;
    for (const p of this.plat) {
      if (x < p.x0 || x > p.x1 || y < p.y0 || y > p.y1) continue;
      let inside = false;
      for (let i = 0, j = p.r.length - 1; i < p.r.length; j = i++) {
        const [xi, yi] = p.r[i], [xj, yj] = p.r[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return p.z;
    }
    let best: number | null = null, bd = 2.5;
    for (const [t, k] of this.cells.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) ?? []) {
      const a = this.d.tracks[t].p[k], b = this.d.tracks[t].p[k + 1];
      const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1;
      const f = Math.min(1, Math.max(0, ((x - a[0]) * vx + (y - a[1]) * vy) / l2));
      const d = Math.hypot(x - a[0] - vx * f, y - a[1] - vy * f);
      if (d < bd) { bd = d; best = a[2] + (b[2] - a[2]) * f - this.z0 + 0.3; }
    }
    return best;
  }

  /** Push a circle at feet height y out of the sides of the platforms: you can vault up onto one, as
   *  onto a low wall, but you can't walk into its edge from the track. Returns the height above the
   *  feet of the tallest platform it pushed against, or -Infinity if none. */
  pushOut(pos: { x: number; z: number }, y: number, r: number): number {
    let block = -Infinity;
    for (const p of this.plat) {
      const x = pos.x, yy = -pos.z;
      if (x < p.x0 - r || x > p.x1 + r || yy < p.y0 - r || yy > p.y1 + r) continue;
      // the platform's top is p.z: at it (or a step under) you're on the platform, so there's no side
      // to be stopped by; well below it you're on the track beside it, and its edge is solid
      if (y >= p.z - 0.45 || y < p.z - 4.5) continue;
      for (let i = 0, j = p.r.length - 1; i < p.r.length; j = i++) {
        const ax = p.r[j][0], ay = p.r[j][1], vx = p.r[i][0] - ax, vy = p.r[i][1] - ay, l2 = vx * vx + vy * vy || 1;
        const s = Math.min(1, Math.max(0, ((pos.x - ax) * vx + (-pos.z - ay) * vy) / l2));
        const cx = ax + vx * s, cy = ay + vy * s;
        let ex = pos.x - cx, ey = -pos.z - cy;
        const d = Math.hypot(ex, ey);
        if (d >= r) continue;
        if (d < 1e-6) { ex = vy; ey = -vx; }
        const el = Math.hypot(ex, ey) || 1;
        pos.x = cx + (ex / el) * r; pos.z = -(cy + (ey / el) * r);
        block = Math.max(block, p.z - y);
      }
    }
    return block;
  }

  /** Move every train to where the timetable says it is now, and draw the ones near (x, z).
   *  Returns the train that's hit you, and how fast it was going, if one has. */
  update(dt: number, px: number, py: number, pz: number, ground: boolean): { name: string; speed: number } | null {
    const now = this.tick(dt), seen = new Set<string>();
    for (const r of this.routes) {
      const T = r.run.length * STEP;
      const first = Math.floor((now - T - r.phase) / HEADWAY) + 1, last = Math.floor((now - r.phase) / HEADWAY);
      for (let k = first; k <= last; k++) {
        const t = now - (k * HEADWAY + r.phase), i = Math.floor(t / STEP);
        if (i < 0 || i >= r.run.length - 1) continue;
        const head = r.run[i] + (r.run[i + 1] - r.run[i]) * (t / STEP - i);
        const at = this.at(r, head);
        if (Math.hypot(at.x - px, at.z - pz) > SHOW + 200) continue;
        const key = `${this.routes.indexOf(r)}:${k}`;
        seen.add(key);
        let tr = this.trains.get(key);
        if (!tr) tr = this.make(key, r);
        tr.v = (r.run[i + 1] - r.run[i]) / STEP;
        // stood at a station: the timetable holds s still through the dwell, so find the stop the
        // run is at and how far into its dwell, exactly as the cable car works its doors out
        const still = Math.abs(r.run[i + 1] - r.run[i]) < 0.05;
        const st = still ? r.stops.find(([s]) => Math.abs(head - s) < 4) : undefined;
        tr.stop = st ? st[1] : null;
        tr.side = st ? r.side.get(st[0]) ?? 0 : 0;
        if (st && r.board && tr.side) {
          let j = i; while (j > 0 && Math.abs(r.run[j - 1] - head) < 0.05) j--;
          const into = (i - j + (t / STEP - i)) * STEP;
          tr.open = into < DOOR_OPEN ? Math.max(0, (into) / DOOR_TIME)
            : into > DWELL - DOOR_CLOSE ? Math.max(0, (DWELL - into - DOOR_CLOSE + DOOR_TIME) / DOOR_TIME) : 1;
        } else tr.open = 0;
        this.pose(tr, head);
        // Open, the platform side's doors show as dark doorways with their leaves slid back along
        // the side by a door's width. A carriage at the back faces the other way, so its platform
        // side is the other side of its own model.
        const slide = Math.min(1, tr.open);
        for (const c of tr.cars) if (c.looks && c.leaves && c.gap) {
          const open = slide > 0.01 && c.mesh.visible, z = (tr.side > 0 ? -1 : 1) * (c.mesh.userData.back ? -1 : 1);
          c.mesh.geometry = open ? c.looks.open[z > 0 ? 0 : 1] : c.looks.shut;
          c.gap.visible = c.leaves.visible = open;
          c.gap.scale.z = c.leaves.scale.z = z;
          c.leaves.position.x = slide * DOOR_W * 0.95;
        }
        if (tr.horn > 0) tr.horn -= dt;
      }
    }
    for (const [k, tr] of this.trains) if (!seen.has(k)) { this.scene.remove(tr.group); this.trains.delete(k); }
    // the carriages near you are solid
    this.near.length = 0;
    let hit: { name: string; speed: number } | null = null;
    for (const tr of this.trains.values()) for (const c of tr.cars) {
      if (!c.mesh.visible || Math.hypot(c.x - px, c.z - pz) > SOLID) continue;
      this.near.push(c);
      if (!ground || tr.v < 2) continue;
      const cs = Math.cos(c.a), sn = Math.sin(c.a), dx = px - c.x, dz = pz - c.z;
      const u = dx * cs - dz * sn, w = dx * sn + dz * cs;
      if (Math.abs(u) < c.hl + 0.3 && Math.abs(w) < c.hw + 0.35 && py > c.y - 0.5 && py < c.top - 0.4 && performance.now() - this.hitAt > 3000) {
        this.hitAt = performance.now();
        hit = { name: tr.name, speed: tr.v };
      }
    }
    this.updateBoards(dt, px, pz);
    this.cullT -= dt;
    if (this.cullT <= 0) {
      this.cullT = 0.5;
      for (const f of this.far) f.o.visible = Math.hypot(f.x - px, f.z - pz) < f.r;
    }
    return hit;
  }

  /** The timetable's clock, in seconds. It steps on by each frame's time and is eased back to the
   *  wall clock, as the cable car's is (cableway.ts): reading Date.now() every frame would make
   *  anyone riding a train see the world shake. */
  private clock = Date.now() / 1000;
  private tick(dt: number): number {
    const wall = Date.now() / 1000;
    this.clock += dt;
    const off = wall - this.clock;
    this.clock += Math.abs(off) > 1 ? off : off * Math.min(1, dt * 0.5);
    return this.clock;
  }

  /** A train standing at a platform whose open doorway a circle of radius r at scene (x, z), feet
   *  at y, is at. This is the one way onto a train, and it answers whether you're at a doorway, not
   *  whether the train goes anywhere: the caller says why you can't get on when its route has no
   *  town to go to. Null if there's no open doorway within reach. */
  doorAt(x: number, z: number, y: number, r: number): Route | null {
    for (const tr of this.trains.values()) {
      if (!tr.stop || tr.open < 0.9) continue;
      for (const c of tr.cars) {
        if (!c.mesh.visible || !c.doors.length || Math.abs(y - (c.y - 0.45)) > 2.5) continue;
        const cs = Math.cos(c.a), sn = Math.sin(c.a), dx = x - c.x, dz = z - c.z;
        const u = (dx * cs - dz * sn) * (c.mesh.userData.back ? -1 : 1), w = dx * sn + dz * cs;
        if (Math.abs(w) > c.hw + r + 0.15 || w * tr.side > 0) continue;
        if (c.doors.some((d) => Math.abs(u - d) < DOOR_W / 2)) return tr.route;
      }
    }
    return null;
  }

  private make(key: string, r: Route): Train {
    const tr = new Train(key, r);
    for (const c of r.kind.cars) {
      const mesh = new THREE.Mesh(this.geos[c.geo], this.trainMat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.back = !!c.back;    // the car at the back faces backwards
      const car = new Car(c.len, mesh), dg = this.doorGeos[c.geo];
      if (dg) {
        car.doors = DOORS[c.geo];
        car.looks = dg;
        mesh.geometry = dg.shut;
        car.gap = new THREE.Mesh(dg.gap, this.trainMat);
        car.leaves = new THREE.Mesh(dg.leaves, this.trainMat);
        car.gap.visible = car.leaves.visible = false;
        mesh.add(car.gap, car.leaves);
      }
      tr.cars.push(car);
      tr.group.add(mesh);
    }
    this.trains.set(key, tr);
    this.scene.add(tr.group);
    return tr;
  }

  /** Lay a train's carriages along its route behind its front at head. */
  private pose(tr: Train, head: number) {
    let s = head;
    for (const c of tr.cars) {
      const mid = s - c.hl;
      const front = this.at(tr.route, mid + c.hl * 0.6), back = this.at(tr.route, mid - c.hl * 0.6);
      const m = this.at(tr.route, mid);
      c.mesh.visible = mid > 0 && mid < tr.route.len;
      c.x = m.x; c.z = m.z; c.y = m.y + 0.45;
      c.a = Math.atan2(-(front.z - back.z), front.x - back.x);
      c.top = c.y + 3.95; c.waist = c.y + 1.9;
      c.mesh.position.set(c.x, c.y, c.z);
      const rev = c.mesh.userData.back ? -1 : 1;
      c.mesh.rotation.set(0, c.a + (rev < 0 ? Math.PI : 0), rev * Math.atan2(front.y - back.y, c.hl * 1.2), "YZX");
      s -= c.len + 0.8;
    }
  }

  /** Trains near enough to hear: where the front is, how fast, whether it's sounding its horn, and what it is. */
  *audible(px: number, pz: number, reach: number): Iterable<{ key: string; x: number; y: number; z: number; v: number; horn: boolean; engine: "hst" | "dmu" }> {
    for (const tr of this.trains.values()) {
      const c = tr.cars[0];
      if (!c.mesh.visible) continue;
      // the nearest carriage is where it sounds from
      let best = c, bd = Infinity;
      for (const o of tr.cars) { const d = Math.hypot(o.x - px, o.z - pz); if (o.mesh.visible && d < bd) { bd = d; best = o; } }
      if (bd > reach) continue;
      // a blast on the horn for anyone near the line ahead of it
      const cs = Math.cos(c.a), sn = Math.sin(c.a), dx = px - c.x, dz = pz - c.z;
      const u = dx * cs - dz * sn, w = dx * sn + dz * cs;
      if (tr.v > 5 && u > 0 && u < 300 && Math.abs(w) < 8 && performance.now() - tr.hornAt > 8000) { tr.horn = 1.6; tr.hornAt = performance.now(); }
      yield { key: tr.key, x: best.x, y: best.y + 2, z: best.z, v: tr.v, horn: tr.horn > 0, engine: tr.route.kind.engine };
    }
  }
}

function inRing(ring: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** How far (x, y) is from a ring's edge, or 0 inside it. */
function ringDist(ring: number[][], x: number, y: number): number {
  if (inRing(ring, x, y)) return 0;
  let bd = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j], [bx, by] = ring[i], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
    const f = Math.min(1, Math.max(0, ((x - ax) * vx + (y - ay) * vy) / l2));
    bd = Math.min(bd, Math.hypot(ax + vx * f - x, ay + vy * f - y));
  }
  return bd;
}

/** A point inside a ring: its corners' middle if that's inside, else the middle of the widest run
 *  across it through there. */
function inside(ring: number[][]): [number, number] {
  const cx = ring.reduce((a, q) => a + q[0], 0) / ring.length, cy = ring.reduce((a, q) => a + q[1], 0) / ring.length;
  if (inRing(ring, cx, cy)) return [cx, cy];
  let best: [number, number] = [ring[0][0], ring[0][1]], bw = -1;
  for (let a = 0; a < Math.PI; a += Math.PI / 12) {
    const ux = Math.cos(a), uy = Math.sin(a);
    let t0 = NaN, w = 0;
    for (let t = -300; t <= 300; t += 0.5) {
      if (inRing(ring, cx + ux * t, cy + uy * t)) { if (isNaN(t0)) t0 = t; w = t - t0; if (w > bw) { bw = w; best = [cx + ux * (t0 + w / 2), cy + uy * (t0 + w / 2)]; } }
      else t0 = NaN;
    }
  }
  return best;
}

/** How far (x, y) is from the segment a-b. */
function segDist(a: number[], b: number[], x: number, y: number): number {
  const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1;
  const f = Math.min(1, Math.max(0, ((x - a[0]) * vx + (y - a[1]) * vy) / l2));
  return Math.hypot(a[0] + vx * f - x, a[1] + vy * f - y);
}
