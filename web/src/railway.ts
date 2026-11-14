// The railways (laid out by tools/railway.py): Brunel's Great Western main line through Bath Spa
// and Oldfield Park, and the line down the Limpley Stoke valley past Dundas that joins it at
// Bathampton. Ballast, sleepers and rails on a bank down to the ground, bridges on arches or girders with no pier in what passes
// under them, stone mouths on the tunnels (one face for tracks going in side by side, as high as
// the hill over it), and the station platforms, with the canopies over those up on a viaduct. InterCity 125s run the main line and Sprinters the valley line, stopping at
// the stations (an InterCity only where a platform is long enough for it, as at Bath Spa), keeping left and sounding their horns at anyone near the line. Stand on the line
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
import { tag } from "./kinds";

export interface RailData {
  tracks: { n: string; p: number[][] }[];
  routes: { n: string; t: number[][]; st: [number, string][]; both: number; k?: number; to?: string; via?: string[]; on?: number }[];
  platforms: { n: string; r: number[][]; z: number; no?: string }[];
  /** Tunnel mouths: [x, y, z, angle into the hill, and the ground over the tunnel just inside, where the data gives it]. */
  portals: number[][];
  /** Canopies over platforms up off the ground, at the platform's top z; t: 1 on an outline only
   *  left out of the squares, not drawn. */
  canopies?: { r: number[][]; z: number; t?: number }[];
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
// The track bed's sides go on down as a bank, so wherever the ground falls away beside the line
// there's an embankment under it, not a gap: buried where the ground is level with the line (the
// squares flatten it there), which can't be known here, as the squares load later than this is built.
const BANK_DEPTH = 5, BANK_SLOPE = 1.5;     // metres down, and out per metre down
const BANK_REACH = 2.3 + BANK_DEPTH * BANK_SLOPE;
const WALL_SKIRT = 3;                       // metres a solid bridge stretch's sides go below its recorded ground
// A tunnel mouth's face: its arches' crown over the rails (no lower than a train needs), how high
// it stands where the hill is deep, how far it runs on past its outer
// arches into the cutting's sides, and the mouths that open in one face: tracks side by side,
// facing the same way, two to an arch where theirs would meet, else each under its own.
const PORTAL_CROWN = 7, PORTAL_LEAST = 5, PORTAL_TOP = 9, PORTAL_WING = 6.4, PORTAL_R = 3.6;
const PORTAL_TURN = 0.35, PORTAL_DEPTH = 2.5, PORTAL_SIDE = 16, PORTAL_STAGGER = 9;
const PORTAL_CLEAR = 2.2;    // metres a face's wing stops short of another track's middle
const PORTAL_PAIR = 2.9;     // metres a bore over two tracks reaches past each one's middle: their ballast and a narrow cess
const PORTAL_PIER = 1.0;     // metres of stone left between two arches side by side
const PARAPET = 1.0, PARAPET_THICK = 0.45;   // a face's parapet over its arches, standing over the lid behind it
const WING_FOOT = 1.0;       // metres over the rails that a face's wing comes down to at its end
// A platform up on a viaduct (more than ARCADE_LEAST over the ground) stands on arches along its
// outer sides: one every ARCADE_BAY metres, its piers ARCADE_PIER wide, the dark under it ARCADE_DEEP in.
export const ARCADE_LEAST = 4.5, ARCADE_BAY = 8, ARCADE_PIER = 1.6, ARCADE_DEEP = 1.0;
const BORE_LIT = 11;         // metres into a bore its stone lining is drawn (its track goes in about as far)
const BORE_FADE = 4;         // metres in that the daylight on the lining has died away, however deep it's drawn
// Departure boards hang under the canopy over each platform. CANOPY_Y is the underside the rods
// reach (the stations' canopies are a little over 4 m at the eaves). A platform shorter than
// CANOPY_SHORT gets none; one LONG_PLATFORM or more gets two, at the 2nd and 4th of five parts.
const CANOPY_Y = 3.95;
const BOARD_Y = 2.45;                // the middle of the board itself, above the platform
const CANOPY_SHORT = 40;             // metres: a platform shorter than this has no board
const LONG_PLATFORM = 180;           // metres: a platform this long gets two boards, not one

interface Kind { name: string; cars: { len: number; geo: number; back?: boolean }[]; speed: number; acc: number; dec: number; /** whether it calls at a station whose longest platform is this long, given its own length */ stops: (platform: number, train: number) => boolean; engine: "hst" | "dmu" }

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
    name: "InterCity 125", speed: 38, acc: 0.5, dec: 0.7, stops: (platform, train) => platform >= train, engine: "hst",
    cars: [{ len: 17.8, geo: 0 }, ...Array(5).fill({ len: 23, geo: 1 }), { len: 17.8, geo: 0, back: true }],
  },
  dmu: { name: "Sprinter", speed: 29, acc: 0.6, dec: 0.8, stops: () => true, engine: "dmu", cars: [{ len: 23, geo: 2 }, { len: 23, geo: 2, back: true }] },
};

/** Flat-shaded geometry with its colours and facings packed into bytes, let go of in memory once it's on the graphics card. */
export function compact(pos: number[], col: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // (plain loops: a typed array's from() with a function took a fifth of a second over the whole line)
  const n = g.getAttribute("normal").array as Float32Array, n8 = new Int8Array(n.length), c8 = new Uint8Array(col.length);
  for (let k = 0; k < n.length; k++) n8[k] = Math.round(n[k] * 127);
  for (let k = 0; k < col.length; k++) c8[k] = Math.round(col[k] * 255);
  g.setAttribute("normal", new THREE.Int8BufferAttribute(n8, 3, true));
  g.setAttribute("color", new THREE.Uint8BufferAttribute(c8, 3, true));
  g.computeBoundingSphere();
  if (!(globalThis as { __keepArrays?: boolean }).__keepArrays)
    for (const a of Object.values(g.attributes) as THREE.BufferAttribute[]) a.onUpload(() => { (a as { array: unknown }).array = null; });
  return g;
}

/** What the railway's brick and stone is built of, from what the town round it is built of
 *  (world.ts): Bath stone, red brick or London stock brick at data (x, y), and each one's material. */
export type MasonKind = "s" | "k" | "y";
export interface Masonry { kind(x: number, y: number): MasonKind; material(kind: MasonKind): THREE.Material }
// each kind's colour, tinting its texture (stock brick's texture is coloured already), and how much
// lighter or darker each part of the work is than the plain walling
const MASON_TINT: Record<MasonKind, number[]> = { s: [0.9, 0.8, 0.62], k: [0.68, 0.4, 0.3], y: [0.93, 0.91, 0.86] };
const MASON_UV = 3.4;        // metres to one repeat of a wall texture (textures.ts wall(): a bay one storey high)

export class Railway {
  /** Whether trains keep their doors shut at the station at scene (x, z) (it isn't open yet: zones.ts). */
  shutAt: (x: number, z: number) => boolean = () => false;
  private routes: Route[] = [];
  private trains = new Map<string, Train>();
  private geos: THREE.BufferGeometry[];
  private doorGeos: (DoorLooks | null)[];
  private trainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private group = new THREE.Group();
  private far: { o: THREE.Object3D; x: number; z: number; r: number }[] = [];
  private cullT = 0;
  private cells = new Map<string, number[][]>();      // the track's segments [track, point] by 16 m square, by all they reach
  private plat: { n: string; no: string; r: number[][]; z: number; x0: number; x1: number; y0: number; y1: number }[] = [];
  private boards: { pl: number; x: number; y: number; a: number; tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D; o: THREE.Object3D; shown: string }[] = [];
  private boardT = 0;
  /** The carriages near the player: solid, and you can stand on them. */
  readonly near: Car[] = [];
  private hitAt = -1e9;
  /** Where a line just stops, short of the edge of the map's railway, with buffers across it: [x, y]. */
  readonly buffers: number[][] = [];

  /** `need`: the headroom wanted under the line at data (x, y) by what passes under it, and where no pier may stand. */
  /** `ground`: the ground's own detail texture, for the banks to look like the grass round them. */
  /** setPiece: whether a set piece stands at data (x, y), drawing its own station there (landmarks/setpieces.ts). */
  /** masonry: what its brick and stone is made of; left out (the map checks), flat colours. */
  constructor(readonly d: RailData, private scene: THREE.Scene, private z0: number, private need: Need = () => 0, private groundTex: THREE.Texture | null = null,
    private setPiece: (x: number, y: number) => boolean = () => false, private masonry: Masonry | null = null) {
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
      const cars = kind.cars, trainLen = cars.reduce((a, c) => a + c.len, 0) + Math.max(0, cars.length - 1) * 0.8;
      const route: Route = { name: r.n, pts, len: pts[pts.length - 1].s, stops: r.st.filter(([, n]) => kind.stops(this.longestPlatform(n), trainLen)), kind, phase: 0, run: [], tracks: r.t.map((t) => t[0]), to: r.to, via: r.via, on: r.on, plat: new Map(), side: new Map(), board: false, segs };
      // Which platform it stands at at each stop, and exactly where along it. The stop as the
      // tools measured it is the station's middle; the train's own middle is put at the middle of
      // the platform it uses, so a long train stops within its platform instead of reaching its
      // nose to the station's middle and hanging the rest of itself out past the platform's end.
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
    const bankMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: this.groundTex, side: THREE.DoubleSide });
    const addBank = (pos: number[], col: number[]) => {
      if (!pos.length) return;
      const uv: number[] = [];
      for (let q = 0; q < pos.length; q += 3) uv.push(pos[q] / 7, pos[q + 2] / 7);     // (as the terrain's, so the two meet without a seam in the grain)
      const g = compact(pos, col);
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      const m = new THREE.Mesh(g, bankMat);
      m.receiveShadow = true;
      this.group.add(m);
      const sp = g.boundingSphere!;
      this.far.push({ o: m, x: sp.center.x, z: sp.center.z, r: sp.radius + 650 });
    };
    // brick and stone: textured in what the town is built of, each piece's grain running along its
    // face (or laid flat on a top or an underside), drawn a kind at a time
    const role = new Map<number[], number>();
    const mason = () => {
      const by = new Map<MasonKind, { pos: number[]; col: number[]; uv: number[] }>();
      const put = (a: number[], b: number[], c: number[], d: number[], f: number, fa: number, fb: number) => {
        const mx = (a[0] + c[0]) / 2, my = -(a[2] + c[2]) / 2, k = this.masonry!.kind(mx, my);
        const B = by.get(k) ?? by.set(k, { pos: [], col: [], uv: [] }).get(k)!, T = MASON_TINT[k];
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
        const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
        const nl = Math.hypot(nx, ny, nz) || 1, flat = Math.abs(ny) > 0.7 * nl, tl = Math.hypot(nx, nz) || 1, tx = -nz / tl, tz = nx / tl;
        const uv = (p: number[]) => (flat ? [p[0] / MASON_UV, p[2] / MASON_UV] : [(p[0] * tx + p[2] * tz) / MASON_UV, p[1] / MASON_UV]);
        const ca = T.map((t) => Math.min(1, t * f * fa)), cb = T.map((t) => Math.min(1, t * f * fb));
        B.pos.push(...a, ...b, ...c, ...a, ...c, ...d);
        B.col.push(...ca, ...ca, ...cb, ...ca, ...cb, ...cb);
        for (const p of [a, b, c, a, c, d]) B.uv.push(...uv(p));
      };
      const flush = () => {
        for (const [k, B] of by) {
          if (!B.pos.length) continue;
          const g = compact(B.pos, B.col);
          g.setAttribute("uv", new THREE.Float32BufferAttribute(B.uv, 2));
          const m = new THREE.Mesh(g, this.masonry!.material(k));
          m.receiveShadow = true;
          this.group.add(m);
          const sp = g.boundingSphere!;
          this.far.push({ o: m, x: sp.center.x, z: sp.center.z, r: sp.radius + 650 });
        }
        by.clear();
      };
      return { put, flush };
    };
    const C = (hex: string) => { const k = new THREE.Color(hex); return [k.r, k.g, k.b]; };
    const BANK = C("#6e7f4c"), BALLAST = C("#7b746a"), SLEEPER = C("#4a3d31"), RAIL = C("#6f6a62"), RAILTOP = C("#c4c1ba"), BRICK = C("#8a5a44"), STONE = C("#c3ae84"), DARK = C("#2a2622"), GIRDER = C("#6f7b7c");
    const STONE_IN = C("#b19c74"), BAND = C("#d3c19a"), CAP = C("#dccfae"), VOUSSOIR = C("#cdb88e"), VOUSSOIR2 = C("#b8a27a"), SOFFIT = C("#9c8a68"), GIRDER2 = C("#859092"), UNDER = C("#5a6264");
    for (const [c, f] of [[STONE, 1], [STONE_IN, 0.9], [BAND, 1.08], [CAP, 1.14], [VOUSSOIR, 1.06], [VOUSSOIR2, 0.93], [SOFFIT, 0.78], [BRICK, 1]] as const) role.set(c, f);
    const lerp3 = (a: number[], b: number[], f: number) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    const twin = { piers: [] as number[][], ends: [] as number[][], girders: [] as number[][] };
    // Two tracks side by side on one viaduct share its deck: between them there's no parapet, only
    // the deck carried across to halfway, closed down to its own underside there in case the two
    // stand at different heights; nearer than JOINED, running together into a set of points, each
    // track's deck covers the other's side, so neither has a parapet there standing across the
    // other's rails. `beside` is how far off the other track is on side w, if one is.
    const SHARED = 5, JOINED = 3;
    const decks = new Map<string, number[][]>();
    this.d.tracks.forEach((t, ti) => t.p.forEach((q, k) => {
      if (k + 1 >= t.p.length || q[3] !== 1 || t.p[k + 1][3] !== 1) return;
      const c = `${Math.floor(q[0] / 16)},${Math.floor(q[1] / 16)}`;
      (decks.get(c) ?? decks.set(c, []).get(c)!).push([ti, k]);
    }));
    const beside = (ti: number, M: number[], nx: number, ny: number, w: number): number | null => {
      let best: number | null = null;
      for (let i = Math.floor((M[0] - SHARED) / 16); i <= Math.floor((M[0] + SHARED) / 16); i++)
        for (let j = Math.floor((M[1] - SHARED) / 16); j <= Math.floor((M[1] + SHARED) / 16); j++)
          for (const [t, k] of decks.get(`${i},${j}`) ?? []) {
            if (t === ti) continue;
            const a = this.d.tracks[t].p[k], b = this.d.tracks[t].p[k + 1], vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1;
            const f = ((M[0] - a[0]) * vx + (M[1] - a[1]) * vy) / l2;
            if (f < 0 || f > 1) continue;
            const ox = a[0] + vx * f - M[0], oy = a[1] + vy * f - M[1], across = (ox * nx + oy * ny) * w, d = Math.hypot(ox, oy);
            if (across > 0.9 * d && d > 0.3 && d < SHARED && (best === null || d < best)) best = d;
          }
      return best;
    };
    // every track's pieces in one 250 m square are drawn together, however many tracks a station has
    const pooled = new Map<string, { pos: number[]; col: number[]; bpos: number[]; bcol: number[]; ms: ReturnType<typeof mason> }>();
    this.d.tracks.forEach((t, ti) => {
      const p = t.p, plan = bridgePlan(p, this.need, twin), m = plan.marks();
      twin.piers.push(...m.piers); twin.ends.push(...m.ends); twin.girders.push(...m.girders);
      for (let k0 = 0; k0 < p.length - 1; k0 += CHUNK) {
        const at = `${Math.floor(p[k0][0] / 250)},${Math.floor(p[k0][1] / 250)}`;
        const pool = pooled.get(at) ?? pooled.set(at, { pos: [], col: [], bpos: [], bcol: [], ms: mason() }).get(at)!;
        const { pos, col, bpos, bcol, ms } = pool;
        const quad = (a: number[], b: number[], c: number[], d: number[], cc: number[]) => {
          if (this.masonry && role.has(cc)) { ms.put(a, b, c, d, role.get(cc)!, 1, 1); return; }
          const [P, Q] = cc === BANK ? [bpos, bcol] : [pos, col];
          P.push(...a, ...b, ...c, ...a, ...c, ...d); for (let q = 0; q < 6; q++) Q.push(...cc);
        };
        for (let k = k0; k < Math.min(p.length - 1, k0 + CHUNK); k++) {
          const a = p[k], b = p[k + 1];
          // in a tunnel the hill hides it, but for the first stretch in, seen through the mouth
          const inside = a[3] === 2 && b[3] === 2;
          if (inside && !(p[k - 1] && p[k - 1][3] !== 2) && !(p[k + 2] && p[k + 2][3] !== 2)) continue;
          const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
          const P = (q: number[], off: number, h: number) => [q[0] + nx * off, q[2] - z0 + h, -(q[1] + ny * off)];
          const bank = (A: number[], B: number[]) => {
            for (const s of [1, -1]) quad(P(A, 2.3 * s, -0.3), P(B, 2.3 * s, -0.3), P(B, BANK_REACH * s, -0.3 - BANK_DEPTH), P(A, BANK_REACH * s, -0.3 - BANK_DEPTH), BANK);
          };
          if (!inside) for (let i = Math.floor((Math.min(a[0], b[0]) - BANK_REACH) / 16); i <= Math.floor((Math.max(a[0], b[0]) + BANK_REACH) / 16); i++)
            for (let j = Math.floor((Math.min(-a[1], -b[1]) - BANK_REACH) / 16); j <= Math.floor((Math.max(-a[1], -b[1]) + BANK_REACH) / 16); j++)
              (this.cells.get(`${i},${j}`) ?? this.cells.set(`${i},${j}`, []).get(`${i},${j}`)!).push([ti, k]);
          // ballast with sloping shoulders, sleepers, then the two rails
          quad(P(a, -1.6, 0.25), P(b, -1.6, 0.25), P(b, 1.6, 0.25), P(a, 1.6, 0.25), BALLAST);
          for (const s of [1, -1]) quad(P(a, 1.6 * s, 0.25), P(b, 1.6 * s, 0.25), P(b, 2.3 * s, -0.3), P(a, 2.3 * s, -0.3), BALLAST);
          if ((a[3] !== 1 || b[3] !== 1) && !inside) bank(a, b);
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
              if (lowA > -1.5 && lowB > -1.5 && !plan.span(s0)) { bank(A, B); continue; }     // (low enough to be an embankment's top)
              const kind = plan.kind((s0 + s1) / 2), steel = kind === "girder", M = lerp3(A, B, 0.5);
              const reach = [1, -1].map((w) => beside(ti, M, nx, ny, w));
              for (const w of [1, -1]) {
                const other = reach[w > 0 ? 0 : 1];
                if (other !== null) {
                  if (other <= JOINED) continue;      // running together into the points: the other's deck is this side's
                  const h = other / 2;
                  quad(P(A, 1.6 * w, 0.25), P(B, 1.6 * w, 0.25), P(B, h * w, 0.25), P(A, h * w, 0.25), BALLAST);
                  quad(P(A, h * w, 0.25), P(B, h * w, 0.25), P(B, h * w, lowB), P(A, h * w, lowA), steel ? UNDER : SOFFIT);
                  continue;
                }
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
                  // a solid stretch's side goes on below the ground the line's data records under it, as
                  // the squares' own ground can lie lower (buried where it doesn't)
                  const skirt = kind === "wall" ? WALL_SKIRT : 0;
                  quad(P(A, 2.4 * w, 1.0), P(B, 2.4 * w, 1.0), P(B, 2.4 * w, lowB - skirt), P(A, 2.4 * w, lowA - skirt), STONE);
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
              const wide = reach.map((o) => (o === null || o <= JOINED ? 2.4 : o / 2));
              quad(P(A, -wide[1], lowA), P(B, -wide[1], lowB), P(B, wide[0], lowB), P(A, wide[0], lowA), steel ? UNDER : SOFFIT);
            }
            // the faces of the piers and abutments under each span's two ends
            for (const q of plan.spans) {
              if (q.kind === "wall") continue;
              for (const sp of [q.a, q.b]) {
                if (sp < plan.s[k] || sp >= plan.s[k + 1]) continue;
                // up to the deck, not only to the springing, so nothing is seen past the arch's last
                // facet into the pier; and down past the ground the data records, as a wall's sides go
                const f = (sp - plan.s[k]) / l, M = lerp3(a, b, f), lo = plan.ground(sp) - M[2] - 1 - WALL_SKIRT, hi = 0.2;
                if (plan.bottom(sp) - M[2] - (plan.ground(sp) - M[2] - 1) < 0.3) continue;
                quad(P(M, -2.4, lo), P(M, 2.4, lo), P(M, 2.4, hi), P(M, -2.4, hi), STONE);
              }
            }
          }
        }
      }
    });
    for (const { pos, col, bpos, bcol, ms } of pooled.values()) {
      add(pos, col);
      addBank(bpos, bcol);
      ms.flush();
    }
    // tunnel mouths: a stone face with a ring of voussoirs round each arch, and the bore lined in
    // stone going on into the hill, its track with it, the daylight dying away a few metres in
    const pos: number[] = [], col: number[] = [], pm = mason();
    const quad = (a: number[], b: number[], c: number[], d: number[], cc: number[], dd = cc) => {
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      col.push(...cc, ...cc, ...dd, ...cc, ...dd, ...dd);
    };
    // (masonry, its light f at the first two corners and g at the last two)
    const stone = (a: number[], b: number[], c: number[], d: number[], cc: number[], f = 1, g = f) => {
      if (this.masonry && role.has(cc)) pm.put(a, b, c, d, role.get(cc)!, f, g);
      else quad(a, b, c, d, f === 1 && g === 1 ? cc : lerp3(DARK, cc, f), lerp3(DARK, cc, g));
    };
    const BORE_FLOOR = C("#4a453e"), EARTH = C("#5b4a36");
    // the line out in the open, each stretch into a tunnel only as far as its mouth: no face's wing
    // may stand across another track there (one whose mouth is further in, or that passes by)
    const open: number[][] = [];
    for (const t of this.d.tracks) for (let k = 0; k + 1 < t.p.length; k++) {
      const a = t.p[k], b = t.p[k + 1];
      if (a[3] === 2 && b[3] === 2) continue;
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      open.push(a[3] === 2 ? [...m, ...b.slice(0, 3)] : b[3] === 2 ? [...a.slice(0, 3), ...m] : [...a.slice(0, 3), ...b.slice(0, 3)]);
    }
    for (const g of headwalls(this.d.portals)) {
      const { x, y, ux, uy, base: zb, bores, cover, depth } = g, nx = -uy, ny = ux, base = zb - z0, D = FACE_THICK;
      const P = (u: number, v: number, h: number) => [x + ux * u + nx * v, base + h, -(y + uy * u + ny * v)];
      // up to the ground over it, not standing up out of the hill, but always high enough over its
      // arches for a train to go under them
      // (ground too shallow over it for a train to fit under says the data's tunnel is doubtful, and
      // the face is built as it always was, its bore no deeper than the face, so it can't show
      // through the shallow ground behind)
      const { crown, top, deep, arches } = boreShape(cover, depth, bores);
      const left = arches[0].c - arches[0].hw, right = arches[arches.length - 1].c + arches[arches.length - 1].hw;
      let v0 = left - PORTAL_WING, v1 = right + PORTAL_WING;
      for (const q of open) {
        const ua = (q[0] - x) * ux + (q[1] - y) * uy, ub = (q[3] - x) * ux + (q[4] - y) * uy;
        if (Math.max(ua, ub) < -0.3 || Math.min(ua, ub) > D + 0.3 || Math.abs((q[2] + q[5]) / 2 - zb) > 6) continue;
        const f = Math.abs(ub - ua) < 1e-6 ? 0.5 : Math.min(1, Math.max(0, (D / 2 - ua) / (ub - ua)));
        const vc = (q[0] + (q[3] - q[0]) * f - x) * nx + (q[1] + (q[4] - q[1]) * f - y) * ny;
        if (vc < left - 0.5) v0 = Math.max(v0, vc + PORTAL_CLEAR);
        else if (vc > right + 0.5) v1 = Math.min(v1, vc - PORTAL_CLEAR);
      }
      v0 = Math.min(v0, left - 0.8); v1 = Math.max(v1, right + 0.8);
      // its wings, past the arches, slope down to WING_FOOT at their ends, as wing walls do down the
      // bank beside a cutting, rather than standing their full height out over the slope as fins
      const wingTop = (v: number) => v < left ? WING_FOOT + (top - WING_FOOT) * (v - v0) / (left - v0)
        : v > right ? WING_FOOT + (top - WING_FOOT) * (v1 - v) / (v1 - right) : top;
      // every arch's edges are breaks, so its sides stand plumb
      const vs = new Set<number>([v0, v1]);
      for (let v = v0; v < v1; v += 0.5) vs.add(v);
      for (const a of arches) { vs.add(a.c - a.hw); vs.add(a.c + a.hw); }
      const cuts = [...vs].sort((a, b) => a - b);
      for (let k = 0; k + 1 < cuts.length; k++) {
        const v = cuts[k], w = cuts[k + 1], m = (v + w) / 2, a = arches.find((q) => Math.abs(m - q.c) < q.hw);
        const lo = (q: number) => (a ? a.spring + a.rise * Math.sqrt(Math.max(0, 1 - ((q - a.c) / a.hw) ** 2)) : -1);
        for (const u of [0, D]) stone(P(u, v, lo(v)), P(u, w, lo(w)), P(u, w, wingTop(w)), P(u, v, wingTop(v)), STONE);
        stone(P(0, v, wingTop(v)), P(0, w, wingTop(w)), P(D, w, wingTop(w)), P(D, v, wingTop(v)), CAP);
      }
      // the parapet along its top over the arches, flush with its face, the lid's ground behind it
      const T = PARAPET_THICK, H = top + PARAPET;
      stone(P(0, left, top), P(0, right, top), P(0, right, H), P(0, left, H), STONE);
      stone(P(T, right, top), P(T, left, top), P(T, left, H), P(T, right, H), STONE);
      stone(P(0, left, H), P(0, right, H), P(T, right, H), P(T, left, H), CAP);
      for (const [v, o] of [[left, -1], [right, 1]]) stone(P(o < 0 ? T : 0, v, top), P(o < 0 ? 0 : T, v, top), P(o < 0 ? 0 : T, v, H), P(o < 0 ? T : 0, v, H), STONE);
      // (dark soon past the face, so a mouth reads as open whatever angle it's seen from)
      const light = (u: number) => Math.max(0, 1 - Math.min(1, (u / Math.min(deep, BORE_FADE)) ** 0.7));
      const shade = (u: number, c: number[]) => lerp3(DARK, c, light(u));
      for (const a of arches) {
        const at = (t: number, out: number) => [a.c + (a.hw + out) * Math.cos(t), a.spring + (a.rise + out) * Math.sin(t)];
        const N = Math.max(10, Math.round((Math.PI * (a.hw + a.rise)) / 2 / 0.8));
        // the ring of voussoirs standing a hair proud of the face, and the quoins down the jambs
        for (let i = 0; i < N; i++) {
          const t0 = Math.PI * (1 - i / N), t1 = Math.PI * (1 - (i + 1) / N);
          const [p0, p1, q1, q0] = [at(t0, 0), at(t1, 0), at(t1, 0.6), at(t0, 0.6)];
          stone(P(-0.04, p0[0], p0[1]), P(-0.04, p1[0], p1[1]), P(-0.04, q1[0], q1[1]), P(-0.04, q0[0], q0[1]), i % 2 ? VOUSSOIR : VOUSSOIR2);
        }
        for (const [s, o] of [[a.c - a.hw, -1], [a.c + a.hw, 1]]) for (let h = 0, i = 0; h < a.spring - 0.05; h += 0.7, i++) {
          const h1 = Math.min(a.spring, h + 0.7), wd = i % 2 ? 0.45 : 0.75;
          stone(P(-0.04, s, h), P(-0.04, s + o * wd, h), P(-0.04, s + o * wd, h1), P(-0.04, s, h1), i % 2 ? VOUSSOIR2 : VOUSSOIR);
        }
        // the bore: its vault and walls in stone, darkening into the hill, its floor, and dark beyond
        const lo = (q: number) => a.spring + a.rise * Math.sqrt(Math.max(0, 1 - ((q - a.c) / a.hw) ** 2));
        const n = Math.max(8, Math.round((2 * a.hw) / 0.6));
        for (let u0 = 0; u0 < deep - 1e-6; u0 += 1.5) {
          const u1 = Math.min(deep, u0 + 1.5), l0 = light(u0), l1 = light(u1);
          for (let i = 0; i < n; i++) {
            const v = a.c - a.hw + (2 * a.hw * i) / n, w = a.c - a.hw + (2 * a.hw * (i + 1)) / n;
            stone(P(u0, v, lo(v)), P(u0, w, lo(w)), P(u1, w, lo(w)), P(u1, v, lo(v)), SOFFIT, l0, l1);
            // (and over it a skin of earth, so wherever the hill lies thin over the bore it shows soil, not the tube)
            quad(P(u0, v, lo(v) + 0.3), P(u1, v, lo(v) + 0.3), P(u1, w, lo(w) + 0.3), P(u0, w, lo(w) + 0.3), EARTH, EARTH);
          }
          for (const s of [a.c - a.hw, a.c + a.hw]) stone(P(u0, s, 0), P(u0, s, a.spring), P(u1, s, a.spring), P(u1, s, 0), STONE_IN, l0, l1);
          quad(P(u0, a.c - a.hw, 0.1), P(u0, a.c + a.hw, 0.1), P(u1, a.c + a.hw, 0.1), P(u1, a.c - a.hw, 0.1), shade(u0, BORE_FLOOR), shade(u1, BORE_FLOOR));
        }
        quad(P(deep, a.c - a.hw, 0), P(deep, a.c + a.hw, 0), P(deep, a.c + a.hw, crown), P(deep, a.c - a.hw, crown), DARK);
      }
    }
    // buffers where a line stops with no track going on from it, short of the edge of the map's
    // railway (a siding, or a line the data ends): a red beam on two posts across the rails
    const reach = Math.max(...this.d.tracks.flatMap((t) => t.p.map((q) => Math.hypot(q[0], q[1]))));
    const BEAM = C("#b3261e"), POSTS = C("#2e2b28"), HEAD = C("#1c1c1c");
    this.d.tracks.forEach((t, ti) => {
      for (const [q, r] of [[t.p[0], t.p[1]], [t.p[t.p.length - 1], t.p[t.p.length - 2]]]) {
        if (!r || q[3] === 2 || Math.hypot(q[0], q[1]) > reach - 40) continue;
        if (this.d.tracks.some((o, oi) => oi !== ti && o.p.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 2.5))) continue;
        this.buffers.push([q[0], q[1]]);
        const l = Math.hypot(q[0] - r[0], q[1] - r[1]) || 1, ux = (q[0] - r[0]) / l, uy = (q[1] - r[1]) / l, nx = -uy, ny = ux;
        const P = (u: number, v: number, h: number) => [q[0] - ux * u + nx * v, q[2] - z0 + h, -(q[1] - uy * u + ny * v)];
        const box = (u0: number, u1: number, v0: number, v1: number, h0: number, h1: number, c: number[]) => {
          quad(P(u0, v0, h0), P(u0, v1, h0), P(u0, v1, h1), P(u0, v0, h1), c); quad(P(u1, v0, h0), P(u1, v1, h0), P(u1, v1, h1), P(u1, v0, h1), c);
          quad(P(u0, v0, h0), P(u1, v0, h0), P(u1, v0, h1), P(u0, v0, h1), c); quad(P(u0, v1, h0), P(u1, v1, h0), P(u1, v1, h1), P(u0, v1, h1), c);
          quad(P(u0, v0, h1), P(u1, v0, h1), P(u1, v1, h1), P(u0, v1, h1), c);
        };
        for (const v of [-GAUGE, GAUGE]) {
          box(0.6, 0.8, v - 0.1, v + 0.1, 0.3, 1.25, POSTS);
          quad(P(0.7, v - 0.08, 1.2), P(0.7, v + 0.08, 1.2), P(2.2, v + 0.08, 0.45), P(2.2, v - 0.08, 0.45), POSTS);
          box(0.3, 0.6, v + Math.sign(v) * 0.15 - 0.15, v + Math.sign(v) * 0.15 + 0.15, 0.9, 1.15, HEAD);
        }
        box(0.6, 0.85, -1.05, 1.05, 0.85, 1.25, BEAM);
      }
    });
    add(pos, col);
    pm.flush();
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
      // A platform up on a viaduct is walled down to the ground the viaduct stands on (the lowest
      // the line's bridges record near it), but over anything that passes under (a road, the river)
      // it stops as high as it ever did: an arch under the line beside it ends at its wall.
      let low = top - 4;
      for (const p of tracks2) for (const q of p) if (q[3] === 1 && q[4] !== undefined && q[0] > x0 - 10 && q[0] < x1 + 10 && q[1] > y0 - 10 && q[1] < y1 + 10) low = Math.min(low, q[4] - z0 - 0.3);
      let over = Infinity, along = 0;
      const plm = mason();
      const wallQuad = (a: number[], b: number[], c: number[], d: number[], cc: number[]) => {
        if (this.masonry && role.has(cc)) { plm.put(a, b, c, d, role.get(cc)!, 1, 1); return; }
        pos2.push(...a, ...b, ...c, ...a, ...c, ...d);
        for (let k = 0; k < 6; k++) col2.push(...cc);
      };
      for (let q = 0; q < ring.length; q++) {
        const A = ring[q], B = ring[(q + 1) % ring.length];
        const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
        const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
        const byTrack = near.some(([a, b]) => segDist(a, b, mx, my) < 3.4);
        const inx = (-(B[1] - A[1]) / (len || 1)) * (area > 0 ? 1 : -1), iny = ((B[0] - A[0]) / (len || 1)) * (area > 0 ? 1 : -1);
        // A platform up on a viaduct stands on arches like the viaduct's own along its outer sides,
        // each opening dark under it, rather than on one blank wall down to the ground
        const arcade = !byTrack && len > ARCADE_BAY && top - low > ARCADE_LEAST;
        const cuts = new Set<number>([0, len]);
        for (let t = 0; t < len; t += arcade ? 0.75 : 3) cuts.add(t);
        if (arcade) for (let k = Math.ceil(along / ARCADE_BAY) * ARCADE_BAY; k < along + len; k += ARCADE_BAY) for (const e of [k, k + ARCADE_PIER]) if (e > along && e < along + len) cuts.add(e - along);
        // (and a pier at each corner, so no opening is left without its side where the edge turns)
        if (arcade) { cuts.add(ARCADE_PIER); cuts.add(len - ARCADE_PIER); }
        const corner = (t: number) => Math.abs(t - ARCADE_PIER) < 1e-3 || Math.abs(t - (len - ARCADE_PIER)) < 1e-3;
        const ts = [...cuts].sort((a, b) => a - b);
        for (let i = 0; i + 1 < ts.length; i++) {
          const t0 = ts[i], t1 = ts[i + 1];
          if (t1 - t0 < 1e-3) continue;
          const P0 = [A[0] + ((B[0] - A[0]) * t0) / len, A[1] + ((B[1] - A[1]) * t0) / len], P1 = [A[0] + ((B[0] - A[0]) * t1) / len, A[1] + ((B[1] - A[1]) * t1) / len];
          // (only what passes under it, not a street running alongside whose reach just touches its edge)
          const mid = [(P0[0] + P1[0]) / 2, (P0[1] + P1[1]) / 2], under = this.need(mid[0] + inx * 1.5, mid[1] + iny * 1.5);
          const headroom = under > 0 ? Math.max(under, this.need(P0[0], P0[1]), this.need(P1[0], P1[1]), this.need(mid[0], mid[1])) : 0;
          const foot = headroom > 0 ? Math.max(top - 4, low + 0.3 + headroom) : Math.min(top - 4, low);
          if (headroom > 0) over = Math.min(over, foot);
          const W = (Q: number[], h: number, inward = 0) => [Q[0] + inx * inward, h, -(Q[1] + iny * inward)];
          const bay = (t: number) => (((along + t) % ARCADE_BAY) + ARCADE_BAY) % ARCADE_BAY;
          const open = arcade && headroom === 0 && bay((t0 + t1) / 2) > ARCADE_PIER && t0 > ARCADE_PIER - 1e-3 && t1 < len - ARCADE_PIER + 1e-3;
          if (!open) { wallQuad(W(P0, top), W(P1, top), W(P1, foot), W(P0, foot), BRICK); continue; }
          // an arch: the wall over it, its soffit back to the dark under the platform, and a jamb where it meets a pier
          const span = ARCADE_BAY - ARCADE_PIER, spring = foot + (top - foot) * 0.35, rise = Math.min(span / 2, top - spring - 1.2);
          const arch = (t: number) => { const x = Math.min(span, Math.max(0, (bay(t) || ARCADE_BAY) - ARCADE_PIER)) / span * 2 - 1; return spring + rise * Math.sqrt(Math.max(0, 1 - x * x)); };
          const h0 = arch(t0 + 1e-4), h1 = arch(t1 - 1e-4);
          wallQuad(W(P0, top), W(P1, top), W(P1, h1), W(P0, h0), BRICK);
          wallQuad(W(P0, h0), W(P1, h1), W(P1, h1, ARCADE_DEEP), W(P0, h0, ARCADE_DEEP), SOFFIT);
          pos2.push(...W(P0, h0, ARCADE_DEEP), ...W(P1, h1, ARCADE_DEEP), ...W(P1, foot, ARCADE_DEEP), ...W(P0, h0, ARCADE_DEEP), ...W(P1, foot, ARCADE_DEEP), ...W(P0, foot, ARCADE_DEEP));
          for (let k = 0; k < 6; k++) col2.push(...DARK);
          for (const [t, h] of [[t0, h0], [t1, h1]] as const) {
            const b = bay(t);
            if (Math.abs(b - ARCADE_PIER) > 1e-3 && Math.abs(b) > 1e-3 && Math.abs(b - ARCADE_BAY) > 1e-3 && !corner(t)) continue;
            const Q = [A[0] + ((B[0] - A[0]) * t) / len, A[1] + ((B[1] - A[1]) * t) / len];
            wallQuad(W(Q, foot), W(Q, foot, ARCADE_DEEP), W(Q, h, ARCADE_DEEP), W(Q, h), STONE_IN);
          }
        }
        along += len;
        // an edge by the track (its middle within a rail's width of a train's side): its strips,
        // laid inward (the ring's inside is to the left going round anticlockwise)
        if (len < 0.5 || !byTrack) continue;
        const s = area > 0 ? 1 : -1, nx = (-(B[1] - A[1]) / len) * s, ny = ((B[0] - A[0]) / len) * s;
        const strip = (w0: number, w1: number, h: number, c: number[]) => {
          const P = (Q: number[], w: number) => [Q[0] + nx * w, top + h, -(Q[1] + ny * w)];
          pos2.push(...P(A, w0), ...P(B, w0), ...P(B, w1), ...P(A, w0), ...P(B, w1), ...P(A, w1));
          for (let k = 0; k < 6; k++) col2.push(...c);
        };
        strip(0, 0.45, 0.01, COPING); strip(0.5, 0.9, 0.012, STUDS); strip(1.05, 1.15, 0.012, YELLOW);
      }
      // over a road or path its walls stop at the headroom, so it has an underside there, like a bridge's
      if (over < Infinity) for (let q = 0; q < surf.count; q++) { pos2.push(surf.getX(q), over, surf.getZ(q)); col2.push(...SOFFIT); }
      add(pos2, col2);
      plm.flush();
      this.plat.push({ n: pl.n, no: pl.no ?? "", r: ring, z: top, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
    }
    // the canopies over the platforms up off the ground: a flat roof on a row of posts down its middle
    const ROOF = C("#5d6466"), ROOF_UNDER = C("#8b9294"), POST = C("#3f4a45");
    for (const cn of this.d.canopies ?? []) {
      const ring = cn.r;
      if (cn.t || ring.length < 3) continue;
      const mx = ring.reduce((a, q) => a + q[0], 0) / ring.length, my = ring.reduce((a, q) => a + q[1], 0) / ring.length;
      if (this.setPiece(mx, my)) continue;
      const under = cn.z - z0 + CANOPY_Y, over = under + 0.35;
      const pos3: number[] = [], col3: number[] = [];
      const surf = new THREE.ShapeGeometry(new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y)))).rotateX(-Math.PI / 2).toNonIndexed().getAttribute("position");
      for (const [h, c] of [[over, ROOF], [under, ROOF_UNDER]] as const) for (let q = 0; q < surf.count; q++) { pos3.push(surf.getX(q), h, surf.getZ(q)); col3.push(...c); }
      for (let q = 0; q < ring.length; q++) {
        const A = ring[q], B = ring[(q + 1) % ring.length];
        pos3.push(A[0], over, -A[1], B[0], over, -B[1], B[0], under, -B[1], A[0], over, -A[1], B[0], under, -B[1], A[0], under, -A[1]);
        for (let k = 0; k < 6; k++) col3.push(...ROOF);
      }
      // posts every few metres along its long axis, wherever that runs under it
      let sxx = 0, syy = 0, sxy = 0;
      for (const [x, y] of ring) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
      const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ax = Math.cos(ang), ay = Math.sin(ang);
      const along = ring.map(([x, y]) => (x - mx) * ax + (y - my) * ay), s0 = Math.min(...along) + 2, s1 = Math.max(...along) - 2;
      const n = Math.max(1, Math.round((s1 - s0) / 8));
      for (let k = 0; k <= n; k++) {
        const s = s1 > s0 ? s0 + ((s1 - s0) * k) / n : (s0 + s1) / 2, px = mx + ax * s, py = my + ay * s;
        if (!inRing(ring, px, py)) continue;
        const r = 0.1, base = cn.z - z0;
        for (const [dx0, dy0, dx1, dy1] of [[-r, -r, r, -r], [r, -r, r, r], [r, r, -r, r], [-r, r, -r, -r]]) {
          pos3.push(px + dx0, base, -(py + dy0), px + dx1, base, -(py + dy1), px + dx1, under, -(py + dy1), px + dx0, base, -(py + dy0), px + dx1, under, -(py + dy1), px + dx0, under, -(py + dy0));
          for (let q = 0; q < 6; q++) col3.push(...POST);
        }
      }
      add(pos3, col3);
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

  /** The length of a station's longest platform, in metres: an express only calls where it fits. */
  private longestPlatform(station: string): number {
    let best = 0;
    for (const p of this.plat) if (p.n === station)
      for (const a of p.r) for (const b of p.r) best = Math.max(best, Math.hypot(a[0] - b[0], a[1] - b[1]));
    return best;
  }

  /** The station nearest scene (x, z) and how far it is to the nearest of its platforms (0 on
   *  one), or null if there's none within `range` metres. Given y (feet, scene height), how far above
   *  or below the platform counts too, past a few metres. */
  stationNear(x: number, z: number, range: number, y?: number): { station: string; far: number } | null {
    let best: { station: string; far: number } | null = null;
    const px = x, py = -z;
    for (const p of this.plat) {
      if (!p.n) continue;
      // the box round it first, which is quick, then how far from the platform itself (0 on it)
      if (Math.max(p.x0 - px, 0, px - p.x1, p.y0 - py, 0, py - p.y1) > range) continue;
      let far = Infinity, inside = false;
      const r = p.r;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [ax, ay] = r[j], [bx, by] = r[i], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
        const f = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
        far = Math.min(far, Math.hypot(px - ax - vx * f, py - ay - vy * f));
        if ((ay > py) !== (by > py) && px < ax + ((py - ay) * vx) / (vy || 1e-9)) inside = !inside;
      }
      if (inside) far = 0;
      // up on a road bridge over it, or down below it, the speakers sound further off
      if (y !== undefined) far = Math.hypot(far, Math.max(0, Math.abs(y - p.z) - 3));
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

  /** What there is to stand on at scene (x, z) for feet at y: a platform, the deck of a railway
   *  bridge, or the track bed and its banks (the highest of them you're on or can step up to). Or null. */
  floor(x: number, z: number, y = Infinity): number | null {
    const yy = -z;
    for (const p of this.plat) {
      if (x < p.x0 || x > p.x1 || yy < p.y0 || yy > p.y1) continue;
      let inside = false;
      for (let i = 0, j = p.r.length - 1; i < p.r.length; j = i++) {
        const [xi, yi] = p.r[i], [xj, yj] = p.r[j];
        if (yi > yy !== yj > yy && x < ((xj - xi) * (yy - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return p.z;
    }
    let best: number | null = null;
    for (const [t, k] of this.cells.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) ?? []) {
      const a = this.d.tracks[t].p[k], b = this.d.tracks[t].p[k + 1];
      const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1;
      const f = Math.min(1, Math.max(0, ((x - a[0]) * vx + (yy - a[1]) * vy) / l2));
      const d = Math.hypot(x - a[0] - vx * f, yy - a[1] - vy * f), h = a[2] + (b[2] - a[2]) * f - this.z0;
      const top = a[3] === 1 && b[3] === 1 ? (d < 2.5 ? h + 0.3 : null) : bedAt(d, h);
      if (top !== null && top <= y + 0.6 && (best === null || top > best)) best = top;
    }
    return best;
  }

  /** The height of the ballast's shoulders and the bank below them at scene (x, z) where the line
   *  runs on the ground, for grass to grow on the bank as on the ground beside it; -Infinity off them. */
  bankAt(x: number, z: number): number {
    let best = -Infinity;
    for (const [t, k] of this.cells.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) ?? []) {
      const a = this.d.tracks[t].p[k], b = this.d.tracks[t].p[k + 1];
      if (a[3] === 1 && b[3] === 1) continue;
      const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1;
      const f = Math.min(1, Math.max(0, ((x - a[0]) * vx + (-z - a[1]) * vy) / l2));
      const d = Math.hypot(x - a[0] - vx * f, -z - a[1] - vy * f);
      if (d < 1.6) continue;
      const h = bedAt(d, a[2] + (b[2] - a[2]) * f - this.z0);
      if (h !== null && h > best) best = h;
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
        if (st && r.board && tr.side && !this.shutAt(at.x, at.z)) {
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
    this.scene.add(tag(tr.group, "vehicle"));
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
/** The height of the track bed and its banks d metres out from a track at height h, as drawn. */
function bedAt(d: number, h: number): number | null {
  if (d <= 1.6) return h + 0.25;
  if (d <= 2.3) return h + 0.25 - ((d - 1.6) / 0.7) * 0.55;
  if (d <= BANK_REACH) return h - 0.3 - (d - 2.3) / BANK_SLOPE;
  return null;
}

/** The tunnel mouths grouped into the faces they open in: each face's middle at its outermost mouth,
 *  the way into the hill, the rails' height, its bores as [offset across, half width], how high
 *  the ground over it stands above the rails, if known, and how far in behind it the deepest mouth is. */
const FACE_THICK = 1.2;
const LID_OVER = 1.5;        // metres of hill over a bore's crown at the least, so the lid buries it (tools/railway.py)

function boreShape(cover: number | undefined, depth: number, bores: number[][]) {
  const fits = cover !== undefined && cover >= PORTAL_LEAST + 0.6;
  const crown = fits ? Math.min(PORTAL_CROWN, cover - 0.6) : PORTAL_CROWN;
  const top = fits ? Math.max(crown + LID_OVER, Math.min(PORTAL_TOP, cover)) : PORTAL_TOP;
  const deep = Math.max(fits ? BORE_LIT : FACE_THICK + 0.3, depth + 2);     // (on past the mouth furthest in)
  const arches = bores.map(([c, hw]) => { const spring = Math.max(2.4, crown - hw); return { c, hw, spring, rise: crown - spring }; });
  return { crown, top, deep, arches };
}

/** Each railway bore, for the terrain shader to leave the hill out of under its arch, inside the
 *  closed tube (world.ts): its middle at the face, the way in, the rails' height, half its width, how high it
 *  is and how deep the bore is drawn, in data coordinates. */
export function railMouths(d: RailData): { x: number; y: number; ux: number; uy: number; z: number; hw: number; crown: number; deep: number }[] {
  return headwalls(d.portals ?? []).flatMap(({ x, y, ux, uy, base, bores, cover, depth }) => {
    const { crown, deep } = boreShape(cover, depth, bores);
    return bores.map(([c, hw]) => ({ x: x - uy * c, y: y + ux * c, ux, uy, z: base, hw, crown, deep }));
  });
}

function headwalls(portals: number[][]) {
  const groups = portalGroups(portals);
  return groups.map((g) => {
    const ang = Math.atan2(g.reduce((a, m) => a + Math.sin(m[3]), 0), g.reduce((a, m) => a + Math.cos(m[3]), 0));
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const cx = g.reduce((a, m) => a + m[0], 0) / g.length, cy = g.reduce((a, m) => a + m[1], 0) / g.length;
    const at = g.map((m) => ({ u: (m[0] - cx) * ux + (m[1] - cy) * uy, v: (m[1] - cy) * ux - (m[0] - cx) * uy })).sort((a, b) => a.v - b.v);
    const out = Math.min(...at.map((m) => m.u)), base = Math.min(...g.map((m) => m[2]));
    // two tracks side by side share an arch, but no arch takes more than two: four tracks are two
    // double-track tunnels side by side
    const runs: { a: number; b: number; n: number }[] = [];
    let run = { a: at[0].v, b: at[0].v, n: 1 };
    for (let k = 1; k < at.length; k++) {
      if (at[k].v - run.b < 2 * PORTAL_R + 1 && run.n < 2) { run.b = at[k].v; run.n++; continue; }
      runs.push(run); run = { a: at[k].v, b: at[k].v, n: 1 };
    }
    runs.push(run);
    const edges = runs.map(({ a, b }) => [a - (b > a ? PORTAL_PAIR : PORTAL_R), b + (b > a ? PORTAL_PAIR : PORTAL_R)]);
    // (arches that would meet have a pier left between them, halfway between their tracks)
    for (let k = 0; k + 1 < edges.length; k++) {
      if (edges[k + 1][0] - edges[k][1] >= PORTAL_PIER) continue;
      const mid = (runs[k].b + runs[k + 1].a) / 2;
      edges[k][1] = Math.min(edges[k][1], mid - PORTAL_PIER / 2);
      edges[k + 1][0] = Math.max(edges[k + 1][0], mid + PORTAL_PIER / 2);
    }
    const bores = edges.map(([l, r]) => [(l + r) / 2, (r - l) / 2]);
    const grounds = g.filter((m) => m[4] !== undefined).map((m) => m[4]);
    const cover = grounds.length ? grounds.reduce((s, h) => s + h, 0) / grounds.length - base : undefined;
    return { x: cx + ux * out, y: cy + uy * out, ux, uy, base, bores, cover, depth: Math.max(...at.map((m) => m.u)) - out };
  });
}

/** The mouths that open in one face: any two near enough side by side, facing the same way, and so
 *  on through them, whatever order the data lists them in (tools/railway.py portal_groups). */
function portalGroups(portals: number[][]): number[][][] {
  const up = portals.map((_, i) => i);
  const root = (i: number): number => { while (up[i] !== i) { up[i] = up[up[i]]; i = up[i]; } return i; };
  const joins = (m: number[], o: number[]) => {
    const turn = Math.abs(Math.atan2(Math.sin(m[3] - o[3]), Math.cos(m[3] - o[3])));
    const dx = m[0] - o[0], dy = m[1] - o[1], ux = Math.cos(o[3]), uy = Math.sin(o[3]);
    const along = Math.abs(dx * ux + dy * uy), side = Math.abs(dy * ux - dx * uy);
    // (mouths too near side by side for a bore each go in one face however far apart the data puts them along)
    return turn < PORTAL_TURN && side < PORTAL_SIDE && (along < PORTAL_DEPTH || (side < 2 * PORTAL_R + 1 && along < PORTAL_STAGGER));
  };
  for (let i = 0; i < portals.length; i++) for (let j = 0; j < i; j++) if (joins(portals[i], portals[j])) up[root(i)] = root(j);
  const groups = new Map<number, number[][]>();
  portals.forEach((m, i) => { const r = root(i); if (!groups.has(r)) groups.set(r, []); groups.get(r)!.push(m); });
  return [...groups.values()];
}

/** The parapet along the top of each tunnel face, for walking into (map.ts): [ax, ay, bx, by, its
 *  foot, its top] in data coordinates, across its arches. */
export function railParapets(d: RailData): number[][] {
  return headwalls(d.portals ?? []).map(({ x, y, ux, uy, base, bores, cover }) => {
    const { top, arches } = boreShape(cover, 0, bores), nx = -uy, ny = ux;
    const v0 = arches[0].c - arches[0].hw, v1 = arches[arches.length - 1].c + arches[arches.length - 1].hw;
    return [x + nx * v0, y + ny * v0, x + nx * v1, y + ny * v1, base + top, base + top + PARAPET];
  });
}

function segDist(a: number[], b: number[], x: number, y: number): number {
  const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1;
  const f = Math.min(1, Math.max(0, ((x - a[0]) * vx + (y - a[1]) * vy) / l2));
  return Math.hypot(a[0] + vx * f - x, a[1] + vy * f - y);
}
