// The railways (laid out by tools/railway.py): Brunel's Great Western main line through Bath Spa
// and Oldfield Park, and the line down the Limpley Stoke valley past Dundas that joins it at
// Bathampton. Ballast, sleepers and rails, viaducts on piers, stone mouths on the tunnels, and the
// station platforms. InterCity 125s run the main line and Sprinters the valley line, stopping at
// the stations, keeping left and sounding their horns at anyone near the line. Stand on the line
// and one will run you down; get up on the roof of one and it'll take you with it.
//
// Trains open their doors when they stop at a platform, and E gets you on one. A route that carries
// on to another map (tools/railway.py's LINKS) offers the town at the far end: taking it hands you
// to main.ts's travel, which rebuilds the game on that map's station platform (see game.ts). The
// screen is black across the journey, and you step off at the far platform beside the train that's
// stood there: a line's linked route dwells at each end of the link on the same wall-clock grid, so
// a train is at Bath Spa whenever one is at Bradford-on-Avon. Both maps keep their own timetable on
// the clock, so everyone everywhere still sees the same trains, and a friend who misses yours
// simply catches a later one.
//
// Who decides what: nobody. The trains run to a timetable worked out from the clock, so every
// player sees every train in the same place without anything going over the network. You decide
// whether a train has hit you, and tell the host, as you would a fall.
import * as THREE from "three";
import { model, Part } from "./furniture";
import type { Mover } from "./map";

export interface RailData {
  tracks: { n: string; p: number[][] }[];
  routes: { n: string; t: number[][]; st: [number, string][]; both: number; k?: number }[];
  platforms: { n: string; r: number[][]; z: number }[];
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
const CHUNK = 150;                   // track points to a mesh (fewer, longer meshes are quicker to draw)

interface Kind { name: string; cars: { len: number; geo: number; back?: boolean }[]; speed: number; acc: number; dec: number; stops: (n: string) => boolean; engine: "hst" | "dmu" }

export interface Route { name: string; pts: { x: number; y: number; z: number; s: number }[]; len: number; stops: [number, string][]; kind: Kind; phase: number; run: number[]; tracks: number[] }

/** A carriage on its way: where it is and which way it faces. */
export class Car implements Mover {
  x = 0; z = 0; a = 0; y = 0; top = 0; waist = 0;
  readonly hw = 1.4; readonly hl: number;
  constructor(readonly len: number, readonly mesh: THREE.Mesh) { this.hl = len / 2; }
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
  open = 0;                        // how far the doors are open, 0 to 1
  constructor(readonly key: string, readonly route: Route) {}
  get name() { return this.route.kind.name; }
}

/** An InterCity 125's power car (nose toward +x), a Mk3 coach, and a Sprinter car, waist on the rails at y = 0. */
function trainModels(): THREE.BufferGeometry[] {
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const roof = (len: number, col: string): Part => [new THREE.CylinderGeometry(1.42, 1.42, len, 12, 1, false, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.32, 1), col, 0, 3.55, 0];
  const bogies = (len: number): Part[] => [-1, 1].map((e) => [box(2.6, 0.7, 2.1), "#202022", e * (len / 2 - 3.2), 0.55, 0] as Part);
  const windows = (len: number, y: number, col: string, gap = 2.2, w = 1.5): Part[] => {
    const out: Part[] = [];
    for (let x = -len / 2 + 2.6; x < len / 2 - 2; x += gap) for (const z of [-1.39, 1.39]) out.push([box(w, 0.75, 0.03), col, x, y, z]);
    return out;
  };
  // the power car: InterCity Executive grey, a yellow nose, red and white along the side
  const P = 17.8;
  const nose = new THREE.Shape([[0, 0], [2.6, 0], [2.6, 0.5], [1.2, 1.9], [0, 2.4]].map(([x, y]) => new THREE.Vector2(x, y)));
  const noseGeo = new THREE.ExtrudeGeometry(nose, { depth: 2.7, bevelEnabled: false }).translate(0, 0, -1.35);
  const power = model([
    [box(P - 2.6, 2.8, 2.8), "#c9c6bb", -1.3, 2.3, 0],
    [box(P - 2.6, 0.75, 2.82), "#3a3c42", -1.3, 3.0, 0],
    [box(P - 2.6, 0.12, 2.83), "#b8262a", -1.3, 1.6, 0],
    [box(P - 2.6, 0.08, 2.83), "#f4f2ea", -1.3, 1.45, 0],
    roof(P - 2.6, "#5a5c60"),
    [noseGeo, "#f2c230", P / 2 - 2.6, 0.9, 0],
    [box(0.04, 0.5, 1.6), "#151719", P / 2 - 1.85, 3.0, 0],           // the cab windscreen
    [box(0.2, 0.2, 0.2), "#f6f2d8", P / 2 - 0.05, 1.3, 0],            // headlight
    ...bogies(P),
  ]);
  const C = 23;
  const coach = model([
    [box(C, 2.8, 2.8), "#c9c6bb", 0, 2.3, 0],
    [box(C, 0.75, 2.82), "#3a3c42", 0, 2.95, 0],
    [box(C, 0.12, 2.83), "#b8262a", 0, 1.6, 0],
    [box(C, 0.08, 2.83), "#f4f2ea", 0, 1.45, 0],
    roof(C, "#5a5c60"),
    ...windows(C, 2.95, "#16181b", 2.4, 1.9),
    ...bogies(C),
  ]);
  // a Sprinter: Regional Railways white with a dark blue window band and a pale blue stripe
  const S = 23;
  const sprinter = model([
    [box(S - 1.2, 2.8, 2.8), "#eceae3", -0.6, 2.3, 0],
    [box(S - 1.2, 0.8, 2.82), "#1d2f5c", -0.6, 2.9, 0],
    [box(S - 1.2, 0.14, 2.83), "#7fb2dc", -0.6, 1.55, 0],
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
  for (const a of Object.values(g.attributes) as THREE.BufferAttribute[]) a.onUpload(() => { (a as { array: unknown }).array = null; });
  return g;
}

export class Railway {
  private routes: Route[] = [];
  private trains = new Map<string, Train>();
  private geos: THREE.BufferGeometry[];
  private trainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private group = new THREE.Group();
  private far: { o: THREE.Object3D; x: number; z: number; r: number }[] = [];
  private cullT = 0;
  private cells = new Map<string, number[][]>();      // bridge decks: [track, point] by 16 m square
  private plat: { r: number[][]; z: number; x0: number; x1: number; y0: number; y1: number }[] = [];
  private platforms = new Map<string, { centre: [number, number]; z: number }>();
  /** The carriages near the player: solid, and you can stand on them. */
  readonly near: Car[] = [];
  private hitAt = -1e9;

  constructor(readonly d: RailData, private scene: THREE.Scene, private z0: number) {
    this.geos = trainModels();
    this.build();
    scene.add(this.group);
    // the routes' lines and timetables, spaced so trains sharing a track are half the headway apart
    d.routes.forEach((r) => {
      const pts: Route["pts"] = [];
      for (const [t, dir] of r.t) {
        const tp = d.tracks[t]?.p;
        if (!tp) continue;
        const seq = dir > 0 ? tp : [...tp].reverse();
        for (const q of pts.length ? seq.slice(1) : seq) {
          const last = pts[pts.length - 1];
          pts.push({ x: q[0], y: q[1], z: q[2], s: last ? last.s + Math.hypot(q[0] - last.x, q[1] - last.y) : 0 });
        }
      }
      if (pts.length < 2) return;
      // the service type comes from the build (tools/railway.py's SERVICES), not the line's name
      const kind = r.k === 1 ? KINDS.hst : KINDS.dmu;
      const route: Route = { name: r.n, pts, len: pts[pts.length - 1].s, stops: r.st.filter(([, n]) => kind.stops(n)), kind, phase: 0, run: [], tracks: r.t.map((t) => t[0]) };
      route.run = this.timetable(route);
      this.routes.push(route);
    });
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
    const onLine = linked.filter((o) => o.name === r.name);
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
    const BALLAST = C("#7b746a"), SLEEPER = C("#4a3d31"), RAIL = C("#6f6a62"), RAILTOP = C("#c4c1ba"), BRICK = C("#8a5a44"), STONE = C("#c3ae84"), DARK = C("#2a2622");
    this.d.tracks.forEach((t, ti) => {
      const p = t.p;
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
          // a bridge: brick sides down to the deck's underside, and a pier every so often
          if (a[3] === 1 && b[3] === 1) {
            const ga = (a[4] ?? a[2]) - z0, gb = (b[4] ?? b[2]) - z0;
            if (a[2] - z0 - ga > 1.5 || b[2] - z0 - gb > 1.5) {
              for (const s of [2.4, -2.4]) {
                quad(P(a, s, 0.9), P(b, s, 0.9), P(b, s, -1.2), P(a, s, -1.2), BRICK);
                quad(P(a, s, 0.9), P(b, s, 0.9), P(b, s * 1.12, 0.9), P(a, s * 1.12, 0.9), STONE);
              }
              quad(P(a, -2.4, -1.2), P(b, -2.4, -1.2), P(b, 2.4, -1.2), P(a, 2.4, -1.2), BRICK);
              if (k % 3 === 0) {
                const top = a[2] - z0 - 1.2, g = ga - 1;
                const c = [[-0.8, -2.2], [0.8, -2.2], [0.8, 2.2], [-0.8, 2.2]].map(([u, w]) => [a[0] + (dx / l) * u + nx * w, -(a[1] + (dy / l) * u + ny * w)]);
                for (let q = 0; q < 4; q++) {
                  const A = c[q], B = c[(q + 1) % 4];
                  quad([A[0], g, A[1]], [B[0], g, B[1]], [B[0], top, B[1]], [A[0], top, A[1]], BRICK);
                }
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
    // the platforms: paving on top, a white edge, brick down the side
    for (const pl of this.d.platforms) {
      const ring = pl.r, top = pl.z - z0;
      const shape = new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y)));
      const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
      const pos2: number[] = [], col2: number[] = [];
      const surf = g.toNonIndexed().getAttribute("position");
      const PAVE = C("#b5ada0");
      for (let q = 0; q < surf.count; q++) { pos2.push(surf.getX(q), top, surf.getZ(q)); col2.push(...PAVE); }
      for (let q = 0; q < ring.length; q++) {
        const A = ring[q], B = ring[(q + 1) % ring.length];
        pos2.push(A[0], top, -A[1], B[0], top, -B[1], B[0], top - 4, -B[1], A[0], top, -A[1], B[0], top - 4, -B[1], A[0], top - 4, -A[1]);
        for (let k = 0; k < 6; k++) col2.push(...BRICK);
      }
      add(pos2, col2);
      const xs = ring.map((q) => q[0]), ys = ring.map((q) => q[1]);
      this.plat.push({ r: ring, z: top, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
      if (pl.n) this.platforms.set(pl.n, { centre: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2], z: pl.z });
    }
  }

  /** A station platform's middle (data coords) and its top, for standing someone on it when a
   *  station name is given. Null if this map has no such platform. */
  platform(station: string): { centre: [number, number]; z: number } | null {
    return this.platforms.get(station) ?? null;
  }

  /** Every train running now, for checking a build (tools/travel_probe.mjs): which route it's on,
   *  the station it's dwelling at ("") and how far its doors are open, and where its first carriage
   *  is standing (scene coords), so a check can go and board it. */
  trainsNow(): { route: string; stop: string; open: number; v: number; x: number; y: number; z: number }[] {
    return [...this.trains.values()].map((t) => {
      const c = t.cars.find((k) => k.mesh.visible);
      return { route: t.route.name, stop: t.stop ?? "", open: Math.round(t.open * 100) / 100, v: Math.round(t.v), x: c?.x ?? 0, y: c?.y ?? 0, z: c?.z ?? 0 };
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
        if (st) {
          let j = i; while (j > 0 && Math.abs(r.run[j - 1] - head) < 0.05) j--;
          const into = (i - j + (t / STEP - i)) * STEP;
          tr.open = into < DOOR_OPEN ? Math.max(0, (into) / DOOR_TIME)
            : into > DWELL - DOOR_CLOSE ? Math.max(0, (DWELL - into - DOOR_CLOSE + DOOR_TIME) / DOOR_TIME) : 1;
        } else tr.open = 0;
        this.pose(tr, head);
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

  /** A train dwelling at a platform near (x, z) with its doors open wide enough to get on, and
   *  where its carriages are. Null if there's no train to board here and now. */
  boardingAt(x: number, z: number, y: number): { route: Route; train: Train; door: Car } | null {
    for (const tr of this.trains.values()) {
      if (!tr.stop || tr.open < 0.9) continue;
      for (const c of tr.cars) {
        if (!c.mesh.visible) continue;
        if (Math.hypot(c.x - x, c.z - z) < c.hl + 3 && Math.abs(y - (c.y - 0.45)) < 2.5) return { route: tr.route, train: tr, door: c };
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
      tr.cars.push(new Car(c.len, mesh));
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
