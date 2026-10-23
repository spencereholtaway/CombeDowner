// The Kennet and Avon Canal (laid out by tools/canal.py): its water at the right level all the way
// along, the six locks of the Widcombe flight, the two short tunnels through Sydney Gardens, the
// Dundas Aqueduct, rows of narrowboats moored along the bank, and a few chugging along it.
//
// Locks work. Lean on a balance beam (E by a lock) and its gates swing shut, the paddles go up and
// the chamber fills or empties, then the gates at the other end swing open. Boats coming along
// wait their turn and work the locks themselves. Step aboard a boat and stand on it as it goes, or
// take the tiller at the back (E) and drive it: W and S for the throttle, A and D put the tiller
// over. The rudder's at the stern, so the boat only answers while it's moving, and slowly: it
// swings its bow round and carries on turning until you bring the tiller back, and it sets you
// over towards the bank until you straighten up. Fifteen tons of boat takes a while to stop, too.
//
// Who decides what: the host runs the locks (each lock's water and gates) and the moving boats
// (which stretch each is on, how far along, which way and how fast), and sends them round about
// five times a second; everyone else draws them, moving the boats on between updates and running
// the locks' gates and water the same way. Working a lock, taking a tiller and the throttle you set
// at it go to the host as requests. The water, the stonework and the moored boats are the same for
// everyone, from the map's canal file.
import * as THREE from "three";
import { model, Part } from "./furniture";
import type { Mover, Pond } from "./map";
import { compact } from "./railway";

export interface CanalData {
  runs: { lv: number; p: number[][] }[];
  locks: { n: string; no: string; lo: number[]; hi: number[]; zl: number; zh: number; tl?: number }[];
  tunnels: { n: string; a: number[]; b: number[]; tw?: number }[];
  moor: number[][];
}

const HW = 1.04;                       // half a narrowboat's beam (7 ft)
const CRUISE = 1.8, TOP = 2.8, ASTERN = 1.2;   // m/s: about 4 mph, flat out, and going backwards
const COUNT = 4;                       // boats under way at once
const NEAR = 150, FAR = 520, GONE = 800;
const SWING = 5;                       // seconds for a pair of gates to swing
const FILL = 4;                        // seconds a lock takes to fill or empty, a metre of rise
const LOCK_HALF = 2.15;                // half a lock's width (the K&A's are 14 ft)
const COPE = 1.2;                      // how wide the stone coping is along a lock's sides
const APRON = 4.5;                     // and the paving beyond it, level with the coping (the map's ground is laid just under it)
const TAIL = 2.2;                      // how far the lock walls run past each pair of gates
const PAVING = "#968d7a";              // the flagstones beside a lock
const MITRE = 0.32;                    // how far the closed gates point upstream, radians
const STRIDE = 11;                     // numbers per boat in an update
const HELM_IDLE = 20000;               // ms a boat drifts with nobody at the tiller before its own crew takes over
const RUDDER = 0.16;                   // radians a second the bow comes round with the tiller hard over at cruising speed

/** Liveries: cabin, panels, trim. */
const PAINTS = [
  ["#2f5d3a", "#e8dcb5", "#a3262a"], ["#6e1f24", "#e8dcb5", "#2f5d3a"], ["#1f3557", "#d9b440", "#a3262a"],
  ["#9e2a22", "#2e5b35", "#e5c35a"], ["#232323", "#b8262a", "#e8dcb5"], ["#2a6f9e", "#f1efe6", "#1f3557"],
  ["#4b2c5e", "#d9b440", "#e8dcb5"],
];
/** How many liveries the boats come in (for the what's what page). */
export const BOAT_PAINTS = PAINTS.length;
const NAMES = ["Kestrel", "Dun Roamin", "Sloe Gin", "Willow", "Avon Lady", "Sabrina", "Narrow Escape", "Lazy Days", "Bath Bun",
  "Otter", "Kingfisher", "Moonraker", "Tranquility", "Jolly Roger", "Sally Lunn", "Brunel", "Mudlark", "Sunday Best", "Little Grebe", "Wren"];

interface Pt { x: number; z: number; s: number }
/** A stretch a boat can be on: a run of water, or a lock's chamber from its lower gates to its upper. */
interface Leg { run: number; lock: number; pts: Pt[]; len: number; a: string; b: string; lv: number; dead: boolean; flags: number[] }

/** How far a lock's wing walls run on below its bottom gates (tools/canal.py), and the height of
 *  their coping u along from those gates (negative, downstream): it comes down from the lock's own
 *  to just above the pound below, as the towpath beside them does. */
const wingLength = (lk: CanalData["locks"][number]) => lk.tl ?? TAIL + (lk.zh - lk.zl) * 6;
const wingTop = (lk: CanalData["locks"][number], u: number) =>
  lk.zl + 0.45 + (lk.zh - lk.zl) * Math.min(1, Math.max(0, (u + wingLength(lk)) / (wingLength(lk) - TAIL)));

const key = (x: number, z: number) => `${Math.round(x * 2)},${Math.round(z * 2)}`;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Flat-shaded geometry from quads, with a colour per quad. */
class Mesher {
  pos: number[] = []; col: number[] = [];
  quad(a: number[], b: number[], c: number[], d: number[], hex: string) {
    const k = new THREE.Color(hex), cc = [k.r, k.g, k.b];
    this.pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) this.col.push(...cc);
  }
  build(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/** A narrowboat 18 m long (scaled for others), its bow toward +x and its waterline at y = 0. */
export function boatGeometry(paint: number): THREE.BufferGeometry {
  const [cabin, panel, trim] = PAINTS[paint % PAINTS.length], L = 18;
  const plan = (half: number, y0: number, h: number) => {
    const sh = new THREE.Shape([[-L / 2, -half], [L / 2 - 3.2, -half], [L / 2, 0], [L / 2 - 3.2, half], [-L / 2 + 0.4, half], [-L / 2, half - 0.3], [-L / 2, -half + 0.3]]
      .map(([x, z]) => new THREE.Vector2(x, z)));
    return new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, y0 + h, 0);
  };
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const cab0 = -L / 2 + 1.7, cab1 = L / 2 - 3.6, cl = cab1 - cab0, cm = (cab0 + cab1) / 2;
  const parts: Part[] = [
    [plan(HW, -0.5, 0.92), "#1b1b1c", 0, 0, 0],                       // the black hull
    [plan(HW + 0.02, 0.32, 0.12), trim, 0, 0, 0],                       // a painted band round the top
    [box(cl, 1.22, 1.86), cabin, cm, 1.06, 0],                          // the cabin
    [box(cl + 0.08, 0.08, 1.96), "#6f716c", cm, 1.71, 0],               // its roof
    [box(cl - 0.6, 0.52, 1.88), panel, cm, 1.05, 0],                    // the panels down each side
    [box(0.5, 0.4, 0.5), "#3a2c22", cab1 - 2.4, 1.95, -0.5],            // a coal box on the roof
    [new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8), "#141414", cab1 - 1.2, 2.0, 0.5],   // the stove's chimney
    [new THREE.CylinderGeometry(0.09, 0.09, 0.08, 8), "#c9a24a", cab1 - 1.2, 2.25, 0.5], // with its brass band
    [box(0.1, 0.9, 0.1), "#c9a24a", -L / 2 + 0.25, 0.85, 0],           // the tiller's swan neck
    [box(1.1, 0.06, 0.06), "#3a2c22", -L / 2 + 0.75, 1.32, 0],          // and its arm
    [box(0.18, 0.18, 0.18), "#f4f0d8", L / 2 - 0.3, 0.75, 0],           // tunnel light on the bow
    [box(0.05, 1.0, 1.4), panel, L / 2 - 3.55, 1.2, 0],                 // the front doors
  ];
  // windows: little dark portholes and squares along the panels
  for (let x = cab0 + 1.2; x < cab1 - 0.8; x += 1.5) for (const z of [-0.95, 0.95]) parts.push([box(0.55, 0.32, 0.03), "#1b2226", x, 1.12, z]);
  return model(parts);
}

/** Someone at the tiller: a body and a head under a hat. */
export function boaterGeometry(): THREE.BufferGeometry {
  return model([
    [new THREE.CylinderGeometry(0.2, 0.24, 1.1, 8), "#5b6b3a", 0, 1.0, 0],
    [new THREE.SphereGeometry(0.16, 8, 6), "#e2b994", 0, 1.72, 0],
    [new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), "#2b2620", 0, 1.86, 0],
  ]);
}

/** A lock gate's leaf, turning about its heel post at the origin, reaching toward +x, with its
 *  balance beam out the other way. h: how tall the leaf is. */
function leafGeometry(h: number): THREE.BufferGeometry {
  const box = (w: number, hh: number, d: number) => new THREE.BoxGeometry(w, hh, d);
  return model([
    [box(2.3, h, 0.26), "#2a2522", 1.15, h / 2, 0],
    [box(2.3, 0.12, 0.3), "#f1efe6", 1.15, h - 0.06, 0],
    [box(4.8, 0.3, 0.3), "#1f1f1f", -2.4, h + 0.35, 0],
    [box(0.7, 0.31, 0.31), "#f1efe6", -4.45, h + 0.35, 0],
    [box(0.6, 0.31, 0.31), "#f1efe6", 0.2, h + 0.35, 0],
    [box(0.07, 0.07, 1.1), "#8a8c8a", 1.5, h + 0.25, 0],    // a handrail along the walkway
  ]);
}

function foamTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  for (let k = 0; k < 90; k++) {
    const x = Math.random() * 64, y = Math.random() * 64, r = 2 + Math.random() * 7;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(245,248,240,0.9)"); grad.addColorStop(1, "rgba(245,248,240,0)");
    g.fillStyle = grad; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function signTexture(name: string, no: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f1efe6"; g.fillRect(0, 0, 256, 96);
  g.strokeStyle = "#1f3557"; g.lineWidth = 6; g.strokeRect(4, 4, 248, 88);
  g.fillStyle = "#1f3557"; g.textAlign = "center"; g.textBaseline = "middle";
  let size = 30;
  g.font = `700 ${size}px "Helvetica Neue", Arial, sans-serif`;
  while (g.measureText(name.toUpperCase()).width > 230 && size > 12) { size -= 2; g.font = `700 ${size}px "Helvetica Neue", Arial, sans-serif`; }
  g.fillText(name.toUpperCase(), 128, 38);
  g.font = `500 22px "Helvetica Neue", Arial, sans-serif`;
  g.fillText(`Lock No. ${no}`, 128, 72);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The locks' chambers whose ground the terrain shader leaves out (world.ts), in the same form as a
 *  tunnel's mouths (tunnels.ts): the map's ground is dug out under each chamber, but on a grid four
 *  metres across, so between its points it would still show through the floor and the water.
 *  Only the locks on the ground from data (x0, y0) to (x1, y1) are given. */
export function lockPits(d: CanalData | null | undefined, z0: number, x0: number, y0: number, x1: number, y1: number): { a: THREE.Vector4[]; b: THREE.Vector4[] } {
  const a: THREE.Vector4[] = [], b: THREE.Vector4[] = [];
  for (const lk of d?.locks ?? []) {
    const r = LOCK_HALF + COPE + APRON + wingLength(lk);
    const [lx, ly] = lk.lo, [hx, hy] = lk.hi;
    if (Math.max(lx, hx) < x0 - r || Math.min(lx, hx) > x1 + r || Math.max(ly, hy) < y0 - r || Math.min(ly, hy) > y1 + r) continue;
    const L = Math.hypot(hx - lx, hy - ly) || 1, ux = (hx - lx) / L, uz = -(hy - ly) / L;
    const floor = lk.zl - 1.8 - z0, top = lk.zh + 0.45 - z0;
    a.push(new THREE.Vector4(lx - ux * TAIL, -ly - uz * TAIL, ux, uz));
    b.push(new THREE.Vector4(floor, top - floor - 0.02, LOCK_HALF + COPE, L + 2 * TAIL));
    // and between the wing walls below it, whose coping comes down to the pound's level
    const wl = wingLength(lk);
    a.push(new THREE.Vector4(lx - ux * wl, -ly - uz * wl, ux, uz));
    b.push(new THREE.Vector4(floor, top - floor - 0.02, LOCK_HALF + COPE, wl - TAIL + 0.3));
  }
  return { a, b };
}

const TUNNEL_WATER = 2.6;               // half the water's width in a tunnel (tools/canal.py)
const LEDGE = 1.3;                     // the towpath's ledge through a tunnel, on its side

/** A canal tunnel's bore across the canal (to the left of the way its run goes, positive): from lo
 *  to hi, the walls standing to wall, the arch rising another rise over them, centred at mid. */
function tunnelBore(t: CanalData["tunnels"][number], lv: number) {
  const side = t.tw ?? 0;
  const lo = side < 0 ? -(TUNNEL_WATER + LEDGE) : -TUNNEL_WATER - 0.1, hi = side > 0 ? TUNNEL_WATER + LEDGE : TUNNEL_WATER + 0.1;
  return { lo, hi, mid: (lo + hi) / 2, half: (hi - lo) / 2, wall: lv + 1.0, rise: 2.5 };
}

/** Where the ground is left out inside the canal's tunnels, from portal to portal, so you can see
 *  through them (the hill or the street over them stays), as tunnelMouths does for the roads'
 *  (tunnels.ts): boxes for the ground's shader, as lockPits gives. */
export function canalBores(d: CanalData | null | undefined, z0: number, x0: number, y0: number, x1: number, y1: number): { a: THREE.Vector4[]; b: THREE.Vector4[] } {
  const a: THREE.Vector4[] = [], b: THREE.Vector4[] = [];
  for (const t of d?.tunnels ?? []) {
    const [ax, ay] = t.a, [bx, by] = t.b;
    if (Math.max(ax, bx) < x0 - 30 || Math.min(ax, bx) > x1 + 30 || Math.max(ay, by) < y0 - 30 || Math.min(ay, by) > y1 + 30) continue;
    // the run's level and which way it runs through the tunnel
    let lv = 0, dir = 1, best = Infinity;
    for (const r of d!.runs) for (let k = 0; k < r.p.length - 1; k++) {
      const q = r.p[k], dd = Math.hypot(q[0] - (ax + bx) / 2, q[1] - (ay + by) / 2);
      if (dd < best) { best = dd; lv = r.lv; const n = r.p[k + 1]; dir = (n[0] - q[0]) * (bx - ax) + (n[1] - q[1]) * (by - ay) >= 0 ? 1 : -1; }
    }
    const L = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L, uy = (by - ay) / L;
    const bore = tunnelBore(t, lv);
    // across the box, measured to its left as the run goes: the bore's middle is off the canal's
    // middle by mid, on the towpath's side
    const off = bore.mid * dir, cx = ax - uy * off, cy = ay + ux * off;
    const floor = lv - 1.2 - z0;
    a.push(new THREE.Vector4(cx - ux * 0.6, -(cy - uy * 0.6), ux, -uy));
    b.push(new THREE.Vector4(floor, bore.wall + bore.rise - lv + 1.2 - 0.05, bore.half, L + 1.2));
  }
  return { a, b };
}

class Lock {
  /** Which end it's set for: 0 the bottom, 1 the top. The gates and water follow. */
  want = 0;
  f = 0;            // the chamber's water, 0 level with the pound below, 1 with the pound above
  g0 = 1;           // the bottom gates, 0 shut, 1 open
  g1 = 0;           // the top gates
  inside = 0;       // the boat in the chamber
  claim = 0;        // the boat it's being worked for
  readonly L: number; readonly ux: number; readonly uz: number;
  readonly fill: number;
  leaves: THREE.Object3D[] = [];
  water!: THREE.Mesh; foam!: THREE.Mesh;
  constructor(readonly d: CanalData["locks"][number], readonly i: number, readonly z0: number) {
    const [x0, y0] = d.lo, [x1, y1] = d.hi;
    this.L = Math.hypot(x1 - x0, y1 - y0);
    this.ux = (x1 - x0) / this.L; this.uz = -(y1 - y0) / this.L;
    this.fill = Math.max(8, (d.zh - d.zl) * FILL);
    this.want = i % 2;
    this.f = this.want; this.g0 = 1 - this.want; this.g1 = this.want;
  }
  /** Scene position at u along it from the bottom gates, v to the left, height y (scene). */
  at(u: number, v: number, y: number): number[] {
    return [this.d.lo[0] + this.ux * u + this.uz * v, y, -this.d.lo[1] + this.uz * u - this.ux * v];
  }
  /** Where scene (x, z) is against it: along and to the left. */
  local(x: number, z: number): [number, number] {
    const dx = x - this.d.lo[0], dz = z + this.d.lo[1];
    return [dx * this.ux + dz * this.uz, dx * this.uz - dz * this.ux];
  }
  get level() { return this.d.zl + (this.d.zh - this.d.zl) * smooth(this.f); }
  /** -1 emptying, 1 filling, 0 still. */
  get flow() { return this.want === 1 ? (this.g0 === 0 && this.f < 1 ? 1 : 0) : (this.g1 === 0 && this.f > 0 ? -1 : 0); }
  /** Settled at one end with its gates open there: that end, else -1. */
  get settled() { return this.want === 1 ? (this.g1 >= 1 ? 1 : -1) : (this.g0 >= 1 ? 0 : -1); }
  step(dt: number) {
    const gs = dt / SWING;
    if (this.want === 1) {
      if (this.g0 > 0) this.g0 = Math.max(0, this.g0 - gs);
      else if (this.f < 1) this.f = Math.min(1, this.f + dt / this.fill);
      else this.g1 = Math.min(1, this.g1 + gs);
    } else {
      if (this.g1 > 0) this.g1 = Math.max(0, this.g1 - gs);
      else if (this.f > 0) this.f = Math.max(0, this.f - dt / this.fill);
      else this.g0 = Math.min(1, this.g0 + gs);
    }
  }
}

class Boat implements Mover {
  x = 0; z = 0; a = 0; y = 0; top = 0; waist = 0;
  readonly hw = HW; readonly hl: number;
  leg = 0; dir = 1; s = 0; lat = 0; latT = 0; v = 0;
  rel = 0;           // its heading off the canal's line, radians (+ bow to the left), from the rudder
  mode = 0;          // 0 under way, 1 waiting at a lock, 2 turning round
  turn = 0;          // how far round it's turned, 0..1
  next = -2;         // the stretch it'll take at the end of this one: -1 none (turn round), -2 not chosen yet
  waitT = 0;
  helm = "";         // who's at the tiller ("" its own crew)
  throttle = 0; steer = 0; helmAt = 0; leftAt = -1e9;
  gas = 0;
  readonly root = new THREE.Group();
  readonly boater: THREE.Mesh;
  constructor(readonly n: number, readonly len: number, readonly paint: number, geo: THREE.BufferGeometry, crew: THREE.BufferGeometry, mat: THREE.Material) {
    this.hl = len / 2;
    const m = new THREE.Mesh(geo, mat);
    m.scale.x = len / 18;
    m.castShadow = m.receiveShadow = true;
    this.root.add(m);
    this.boater = new THREE.Mesh(crew, mat);
    this.boater.position.set(-this.hl + 0.9, 0.2, 0);
    this.root.add(this.boater);
  }
  get name() { return NAMES[this.n % NAMES.length]; }
}

export class Canal {
  readonly legs: Leg[] = [];
  private nodes = new Map<string, { leg: number; end: 0 | 1 }[]>();
  readonly locks: Lock[] = [];
  private boats = new Map<number, Boat>();
  private group = new THREE.Group();
  private cells = new Map<string, number[][]>();     // floor lookups: [run, point] by 16 m square
  private far: { o: THREE.Object3D; x: number; z: number; r: number }[] = [];
  private cullT = 0;
  private serial = 1 + Math.floor(Math.random() * 1e6) * 1000;
  private boatGeo: THREE.BufferGeometry[] = [];
  private crewGeo = boaterGeometry();
  private boatMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  /** The moored boats, as boxes you can stand on and bump into. */
  readonly moored: Mover[] = [];
  /** Something to hear: a lock filling or emptying (vol 0..1), at scene (x, y, z). */
  onWater?: (i: number, x: number, y: number, z: number, vol: number) => void;

  constructor(readonly d: CanalData, private scene: THREE.Scene, private z0: number) {
    for (let k = 0; k < PAINTS.length; k++) this.boatGeo.push(boatGeometry(k));
    // the stretches of water, and the locks between them
    d.runs.forEach((r, i) => {
      const pts: Pt[] = [];
      let s = 0;
      r.p.forEach((q, k) => {
        if (k) s += Math.hypot(q[0] - r.p[k - 1][0], q[1] - r.p[k - 1][1]);
        pts.push({ x: q[0], z: -q[1], s });
        const ck = `${Math.floor(q[0] / 16)},${Math.floor(-q[1] / 16)}`;
        (this.cells.get(ck) ?? this.cells.set(ck, []).get(ck)!).push([i, k]);
      });
      this.addLeg({ run: i, lock: -1, pts, len: s, a: "", b: "", lv: r.lv, dead: false, flags: r.p.map((q) => q[6]) });
    });
    d.locks.forEach((l, i) => {
      const lk = new Lock(l, i, z0);
      this.locks.push(lk);
      this.addLeg({ run: -1, lock: i, pts: [{ x: l.lo[0], z: -l.lo[1], s: 0 }, { x: l.hi[0], z: -l.hi[1], s: lk.L }], len: lk.L, a: "", b: "", lv: l.zl, dead: false, flags: [0, 0] });
    });
    // a stretch with nothing at one end is a dead end (the AI's boats avoid short ones)
    for (const L of this.legs) L.dead = (this.nodes.get(L.a)?.length ?? 0) < 2 || (this.nodes.get(L.b)?.length ?? 0) < 2;
    this.build();
    scene.add(this.group);
  }

  private addLeg(L: Leg) {
    const i = this.legs.length, p = L.pts;
    L.a = key(p[0].x, p[0].z); L.b = key(p[p.length - 1].x, p[p.length - 1].z);
    this.legs.push(L);
    for (const [k, end] of [[L.a, 0], [L.b, 1]] as [string, 0 | 1][]) (this.nodes.get(k) ?? this.nodes.set(k, []).get(k)!).push({ leg: i, end });
  }

  /** Where on a stretch s along is (scene), and which way it runs there. */
  private along(L: Leg, s: number): { x: number; z: number; tx: number; tz: number; k: number } {
    const p = L.pts;
    s = Math.max(0, Math.min(L.len, s));
    let lo = 0, hi = p.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m].s <= s) lo = m; else hi = m; }
    const a = p[lo], b = p[hi], l = b.s - a.s || 1, f = (s - a.s) / l;
    // the heading eases between the stretches either side of each point
    const a0 = p[Math.max(0, lo - 1)], b1 = p[Math.min(p.length - 1, hi + 1)];
    const t1x = b.x - a0.x, t1z = b.z - a0.z, t2x = b1.x - a.x, t2z = b1.z - a.z;
    let tx = t1x + (t2x - t1x) * f, tz = t1z + (t2z - t1z) * f;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, tx, tz, k: f < 0.5 ? lo : hi };
  }

  // ---- the stonework, water and moored boats: built once ---------------------------------------
  private build() {
    const z0 = this.z0, d = this.d;
    const waterMat = new THREE.MeshLambertMaterial({ color: "#46718a", side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const stoneMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const STONE = "#c3ae84", COPING = "#a89c86", DARK = "#4a3f33", BRICK = "#5a3c2e";
    const add = (o: THREE.Object3D, range = 700) => {
      this.group.add(o);
      const m = o as THREE.Mesh;
      if (m.geometry) {
        m.geometry.computeBoundingSphere();
        const s = m.geometry.boundingSphere!;
        this.far.push({ o, x: s.center.x + o.position.x, z: s.center.z + o.position.z, r: s.radius + range });
      }
    };
    // the water, a hundred or so points to a mesh (fewer, longer meshes are quicker to draw)
    d.runs.forEach((r) => {
      const y = r.lv - z0;
      for (let k0 = 0; k0 < r.p.length - 1; k0 += 144) {
        const pos: number[] = [], idx: number[] = [];
        const k1 = Math.min(r.p.length - 1, k0 + 144);
        for (let k = k0; k <= k1; k++) {
          const q = r.p[k], a = r.p[Math.max(0, k - 1)], b = r.p[Math.min(r.p.length - 1, k + 1)];
          const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl, h = q[2];
          pos.push(q[0] + nx * h, y, -(q[1] + ny * h), q[0] - nx * h, y, -(q[1] - ny * h));
          if (k > k0) { const j = (k - k0) * 2; idx.push(j - 2, j - 1, j, j - 1, j + 1, j); }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, waterMat);
        m.receiveShadow = true;
        add(m);
      }
    });

    // the aqueduct and the tunnels (the banks along the open water are works.ts's, laid with the
    // ground of each square of Bath)
    const st = new Mesher();
    d.runs.forEach((r, ri) => {
      const p = r.p, L = this.legs[ri];
      // the aqueduct: a stone trough with a towpath each side, on arches between piers
      let k = 0;
      while (k < p.length) {
        if (!(p[k][6] & 2)) { k++; continue; }
        let j = k;
        while (j + 1 < p.length && p[j + 1][6] & 2) j++;
        this.aqueduct(st, r, L, k, j, STONE, COPING);
        k = j + 1;
      }
    });
    for (const t of d.tunnels) this.tunnel(st, t, STONE, BRICK);
    for (const lk of this.locks) this.lockWalls(st, lk, STONE, COPING, DARK);
    const sg = st.build();
    if (sg) {
      // in pieces, so the far ones can be skipped
      const pos = sg.getAttribute("position").array as Float32Array, col = sg.getAttribute("color").array as Float32Array;
      const buckets = new Map<string, { p: number[]; c: number[] }>();
      for (let t = 0; t < pos.length; t += 9) {
        const bk = `${Math.floor(pos[t] / 400)},${Math.floor(pos[t + 2] / 400)}`;
        const b = buckets.get(bk) ?? buckets.set(bk, { p: [], c: [] }).get(bk)!;
        for (let q = 0; q < 9; q++) { b.p.push(pos[t + q]); b.c.push(col[t + q]); }
      }
      for (const b of buckets.values()) {
        const m = new THREE.Mesh(compact(b.p, b.c), stoneMat);
        m.receiveShadow = true; m.castShadow = true;
        add(m);
      }
    }

    // the locks' gates, water, sluice foam and name boards
    const foamMat = new THREE.MeshBasicMaterial({ map: foamTexture(), transparent: true, depthWrite: false, opacity: 0 });
    for (const lk of this.locks) {
      const grp = new THREE.Group();
      const [ox, , oz] = lk.at(0, 0, 0);
      grp.position.set(ox, 0, oz);
      grp.rotation.y = Math.atan2(-lk.uz, lk.ux);     // local x along the lock, local -z to its left
      const by = lk.d.zl - 1.6 - z0, ch = lk.d.zh + 0.45 - z0, uy = lk.d.zh - 1.6 - z0;
      const lower = leafGeometry(ch - by), upper = leafGeometry(ch - uy);
      for (const [u, base, geo] of [[0.6, by, lower], [lk.L - 0.6, uy, upper]] as [number, number, THREE.BufferGeometry][])
        for (const side of [1, -1]) {
          const leaf = new THREE.Mesh(geo, this.boatMat);
          leaf.position.set(u, base, -side * LOCK_HALF);
          leaf.userData.side = side;
          leaf.castShadow = true;
          grp.add(leaf);
          lk.leaves.push(leaf);
        }
      lk.water = new THREE.Mesh(new THREE.PlaneGeometry(lk.L - 0.8, LOCK_HALF * 2).rotateX(-Math.PI / 2), waterMat);
      lk.water.position.set(lk.L / 2, lk.level - z0, 0);
      grp.add(lk.water);
      lk.foam = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2).rotateX(-Math.PI / 2), foamMat.clone());
      grp.add(lk.foam);
      // the name board on its post, by the top gates on the towpath side
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshLambertMaterial({ map: signTexture(lk.d.n, lk.d.no), side: THREE.DoubleSide }));
      board.position.set(lk.L + 1.4, ch + 1.6, -(LOCK_HALF + COPE + 0.8));
      board.rotation.y = Math.PI / 2;
      grp.add(board);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), new THREE.MeshLambertMaterial({ color: "#2b2b2b" }));
      post.position.set(lk.L + 1.4, ch + 0.8, -(LOCK_HALF + COPE + 0.8));
      grp.add(post);
      this.group.add(grp);
      this.far.push({ o: grp, x: ox, z: oz, r: lk.L + 600 });
      this.poseLock(lk);
    }

    // the moored boats: one instanced mesh for each livery
    const byPaint = new Map<number, number[][]>();
    for (const m of d.moor) (byPaint.get(m[4]) ?? byPaint.set(m[4], []).get(m[4])!).push(m);
    const lv = d.runs.reduce((a, r) => (r.p.length > a.n ? { n: r.p.length, lv: r.lv } : a), { n: 0, lv: 0 }).lv;
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    for (const [paint, list] of byPaint) {
      const im = new THREE.InstancedMesh(this.boatGeo[paint % this.boatGeo.length], this.boatMat, list.length);
      list.forEach(([x, y, ang, len], k) => {
        M.compose(new THREE.Vector3(x, lv - z0, -y), Q.setFromAxisAngle(Y, ang), new THREE.Vector3(len / 18, 1, 1));
        im.setMatrixAt(k, M);
        this.moored.push({ x, z: -y, a: ang, hl: len / 2, hw: HW, y: lv - z0 - 0.5, top: lv - z0 + 1.75, waist: lv - z0 + 1.0 });
      });
      im.castShadow = im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }
  }

  /** The aqueduct over points k..j of run r: trough, towpaths, parapets, piers and arches. */
  private aqueduct(st: Mesher, r: CanalData["runs"][number], L: Leg, k: number, j: number, STONE: string, COPING: string) {
    const z0 = this.z0, y = r.lv - z0, p = r.p, PATH = 2.6;
    const s0 = L.pts[k].s, s1 = L.pts[j].s;
    const half = Math.max(...p.slice(k, j + 1).map((q) => q[2]));
    const out = half + PATH, deck = y + 0.4, top = y + 1.3, soffit = y - 1.6;
    const ground = (s: number) => { const q = p[this.along(L, s).k]; return q[3] - z0; };
    const piers = [s0, ...p.slice(k + 1, j).map((q, i) => (q[6] & 4 ? L.pts[k + 1 + i].s : -1)).filter((s) => s >= 0), s1];
    const P = (s: number, v: number, h: number) => { const a = this.along(L, s), nx = a.tz, nz = -a.tx; return [a.x + nx * v, h, a.z + nz * v]; };
    const step = 1;
    for (let s = s0; s < s1 - 1e-6; s += step) {
      const e = Math.min(s1, s + step);
      for (const side of [1, -1]) {
        // towpath, parapet and the trough's inside face above the water
        st.quad(P(s, side * half, deck), P(e, side * half, deck), P(e, side * out, deck), P(s, side * out, deck), COPING);
        st.quad(P(s, side * half, y - 0.5), P(e, side * half, y - 0.5), P(e, side * half, deck), P(s, side * half, deck), STONE);
        st.quad(P(s, side * out, deck), P(e, side * out, deck), P(e, side * out, top), P(s, side * out, top), STONE);
        st.quad(P(s, side * (out + 0.4), top), P(e, side * (out + 0.4), top), P(e, side * out, top), P(s, side * out, top), COPING);
      }
    }
    // each span between piers: the faces either side down to the arch, and the arch's underside
    for (let i = 0; i < piers.length - 1; i++) {
      const a = piers[i] + 1.5, b = piers[i + 1] - 1.5, span = b - a;
      if (span <= 1) continue;
      const low = Math.min(ground(piers[i]), ground(piers[i + 1]));
      const rise = Math.max(1, Math.min(span / 2, soffit - low - 0.5));
      const spring = soffit - rise;
      const arch = (s: number) => (s <= a || s >= b ? spring : spring + rise * Math.sqrt(Math.max(0, 1 - ((s - (a + b) / 2) / (span / 2)) ** 2)));
      for (let s = piers[i]; s < piers[i + 1] - 1e-6; s += 0.75) {
        const e = Math.min(piers[i + 1], s + 0.75);
        for (const side of [1, -1]) st.quad(P(s, side * (out + 0.4), arch(s)), P(e, side * (out + 0.4), arch(e)), P(e, side * (out + 0.4), top), P(s, side * (out + 0.4), top), STONE);
        if (s >= a - 1e-6 && e <= b + 1e-6) st.quad(P(s, out + 0.4, arch(s)), P(e, out + 0.4, arch(e)), P(e, -out - 0.4, arch(e)), P(s, -out - 0.4, arch(s)), "#9d8c6a");
      }
      // the piers (and the abutments at each end) from the ground up to where the arches spring
      for (const ps of [piers[i], piers[i + 1]]) {
        const g = ground(ps) - 2;
        for (const [u0, u1] of [[-1.5, 1.5]]) {
          const c = [P(ps + u0, out + 0.4, 0), P(ps + u1, out + 0.4, 0), P(ps + u1, -out - 0.4, 0), P(ps + u0, -out - 0.4, 0)];
          for (let q = 0; q < 4; q++) {
            const A = c[q], B = c[(q + 1) % 4];
            st.quad([A[0], g, A[2]], [B[0], g, B[2]], [B[0], spring + 0.01, B[2]], [A[0], spring + 0.01, A[2]], STONE);
          }
        }
      }
    }
  }

  /** A tunnel: a stone face round the arch at each portal, and a dark brick lining between, with
   *  the towpath's ledge through it on its side (tools/canal.py's "tw"). */
  private tunnel(st: Mesher, t: CanalData["tunnels"][number], STONE: string, BRICK: string) {
    const k = this.nearest(t.a[0], -t.a[1]);
    if (!k) return;
    const L = this.legs[k.run], lv = this.d.runs[k.run].lv - this.z0;
    const sa = L.pts[k.i].s, kb = this.nearest(t.b[0], -t.b[1]);
    if (!kb || kb.run !== k.run) return;
    const sb = L.pts[kb.i].s, s0 = Math.min(sa, sb), s1 = Math.max(sa, sb);
    const { lo, hi, wall, rise, mid, half } = tunnelBore(t, lv);
    const side = t.tw ?? 0;
    const P = (s: number, v: number, h: number) => { const a = this.along(L, s), nx = a.tz, nz = -a.tx; return [a.x + nx * v, h, a.z + nz * v]; };
    // the lining: walls up from the water (and the ledge), then the barrel of the arch
    const ring: number[][] = [[hi, lv - 0.6], [hi, wall]];
    for (let q = 1; q <= 10; q++) { const ang = (q / 10) * Math.PI; ring.push([mid + half * Math.cos(ang), wall + rise * Math.sin(ang)]); }
    ring.push([lo, lv - 0.6]);
    for (let s = s0; s < s1 - 1e-6; s += 2) {
      const e = Math.min(s1, s + 2);
      for (let q = 0; q < ring.length - 1; q++) st.quad(P(s, ring[q][0], ring[q][1]), P(e, ring[q][0], ring[q][1]), P(e, ring[q + 1][0], ring[q + 1][1]), P(s, ring[q + 1][0], ring[q + 1][1]), BRICK);
      // the towpath's ledge: its stone face down to the water, and its top
      if (side) {
        const v0 = side * TUNNEL_WATER, v1 = side * (TUNNEL_WATER + LEDGE);
        st.quad(P(s, v0, lv - 0.6), P(e, v0, lv - 0.6), P(e, v0, lv + 0.4), P(s, v0, lv + 0.4), STONE);
        st.quad(P(s, v0, lv + 0.4), P(e, v0, lv + 0.4), P(e, v1, lv + 0.4), P(s, v1, lv + 0.4), "#8f8573");
      }
    }
    // the portals: a face 14 m wide with the arch cut out of it, a metre thick
    const face = Math.max(7, half + 3.5), crown = wall + rise;
    for (const [s, back] of [[s0, -1], [s1, 1]]) {
      for (let v = mid - face; v < mid + face - 1e-6; v += 0.5) {
        const w = v + 0.5, archAt = (x: number) => (Math.abs(x - mid) < half ? wall + rise * Math.sqrt(1 - ((x - mid) / half) ** 2) : lv - 1.2);
        for (const off of [0, back]) st.quad(P(s + off, v, archAt(v)), P(s + off, w, archAt(w)), P(s + off, w, crown + 1.5), P(s + off, v, crown + 1.5), STONE);
        st.quad(P(s, v, crown + 1.5), P(s, w, crown + 1.5), P(s + back, w, crown + 1.5), P(s + back, v, crown + 1.5), "#a89c86");
      }
      // a keystone over the arch
      st.quad(P(s - 0.05 * back, mid - 0.4, crown - 0.2), P(s - 0.05 * back, mid + 0.4, crown - 0.2), P(s - 0.05 * back, mid + 0.5, crown + 0.9), P(s - 0.05 * back, mid - 0.5, crown + 0.9), "#e1d2ad");
    }
  }

  /** A lock's chamber: its stone sides and coping, the paving along each side, the floor, and the
   *  step up under the top gates. */
  private lockWalls(st: Mesher, lk: Lock, STONE: string, COPING: string, DARK: string) {
    const z0 = this.z0, by = lk.d.zl - 1.6 - z0, ch = lk.d.zh + 0.45 - z0, low = lk.d.zl - 3 - z0;
    const u0 = -TAIL, u1 = lk.L + TAIL;
    for (const side of [1, -1]) {
      const vi = side * LOCK_HALF, vo = side * (LOCK_HALF + COPE), va = side * (LOCK_HALF + COPE + APRON);
      st.quad(lk.at(u0, vi, by), lk.at(u1, vi, by), lk.at(u1, vi, ch), lk.at(u0, vi, ch), STONE);
      st.quad(lk.at(u0, vi, ch), lk.at(u1, vi, ch), lk.at(u1, vo, ch), lk.at(u0, vo, ch), COPING);
      // the paving, which hides the ground's dip down into the chamber (its grid is coarser than the lock)
      st.quad(lk.at(u0, vo, ch), lk.at(u1, vo, ch), lk.at(u1, va, ch), lk.at(u0, va, ch), PAVING);
      st.quad(lk.at(u0, va, ch), lk.at(u1, va, ch), lk.at(u1, va, low), lk.at(u0, va, low), STONE);
      for (const u of [u0, u1]) st.quad(lk.at(u, vi, low), lk.at(u, va, low), lk.at(u, va, ch), lk.at(u, vi, ch), STONE);
    }
    st.quad(lk.at(0, LOCK_HALF, by + 0.01), lk.at(lk.L, LOCK_HALF, by + 0.01), lk.at(lk.L, -LOCK_HALF, by + 0.01), lk.at(0, -LOCK_HALF, by + 0.01), DARK);
    // the wing walls below the bottom gates, a metre or so at a time, their coping and paving
    // stepping down with the towpath beside them, and the channel's floor between them
    const wl = wingLength(lk.d), n = Math.max(1, Math.ceil((wl - TAIL) / 1.5));
    for (let k = 0; k < n; k++) {
      const ua = -wl + ((wl - TAIL) * k) / n, ub = -wl + ((wl - TAIL) * (k + 1)) / n;
      const ha = wingTop(lk.d, ua) - z0, hb = wingTop(lk.d, ub) - z0;
      for (const side of [1, -1]) {
        const vi = side * LOCK_HALF, vo = side * (LOCK_HALF + COPE), va = side * (LOCK_HALF + COPE + APRON);
        st.quad(lk.at(ua, vi, by), lk.at(ub, vi, by), lk.at(ub, vi, hb), lk.at(ua, vi, ha), STONE);
        st.quad(lk.at(ua, vi, ha), lk.at(ub, vi, hb), lk.at(ub, vo, hb), lk.at(ua, vo, ha), COPING);
        st.quad(lk.at(ua, vo, ha), lk.at(ub, vo, hb), lk.at(ub, va, hb), lk.at(ua, va, ha), PAVING);
        st.quad(lk.at(ua, va, ha), lk.at(ub, va, hb), lk.at(ub, va, low), lk.at(ua, va, low), STONE);
        if (k === 0) st.quad(lk.at(ua, vi, low), lk.at(ua, va, low), lk.at(ua, va, ha), lk.at(ua, vi, ha), STONE);
      }
    }
    st.quad(lk.at(-wl, LOCK_HALF, by + 0.01), lk.at(0, LOCK_HALF, by + 0.01), lk.at(0, -LOCK_HALF, by + 0.01), lk.at(-wl, -LOCK_HALF, by + 0.01), DARK);
    const cill = lk.d.zh - 1.6 - z0, uc = lk.L - 0.9;
    st.quad(lk.at(uc, LOCK_HALF, by), lk.at(uc, -LOCK_HALF, by), lk.at(uc, -LOCK_HALF, cill), lk.at(uc, LOCK_HALF, cill), STONE);
    st.quad(lk.at(uc, LOCK_HALF, cill), lk.at(uc, -LOCK_HALF, cill), lk.at(lk.L + TAIL, -LOCK_HALF, cill), lk.at(lk.L + TAIL, LOCK_HALF, cill), DARK);
  }

  /** The nearest point on any run to scene (x, z), within 20 m. */
  private nearest(x: number, z: number): { run: number; i: number } | null {
    let best: { run: number; i: number } | null = null, bd = 400;
    for (let i = Math.floor(x / 16) - 1; i <= Math.floor(x / 16) + 1; i++)
      for (let j = Math.floor(z / 16) - 1; j <= Math.floor(z / 16) + 1; j++)
        for (const [r, k] of this.cells.get(`${i},${j}`) ?? []) {
          const q = this.d.runs[r].p[k], d2 = (q[0] - x) ** 2 + (q[1] + z) ** 2;
          if (d2 < bd) { bd = d2; best = { run: r, i: k }; }
        }
    return best;
  }

  // ---- questions the map and the world ask ------------------------------------------------------
  /** The map's own water where it's part of the canal, which is drawn here instead: undefined if
   *  it isn't the canal's, null to leave it out (it's just the canal), or the level to draw it at
   *  (a side pond or a basin off the canal: the lowest pound it opens onto). */
  pondLevel(w: Pond): number | null | undefined {
    const ring = w.r[0], n = Math.min(ring.length, 40), by = new Map<number, number>();
    let near = 0;
    for (let k = 0; k < n; k++) {
      const [x, y] = ring[Math.floor((k * ring.length) / n)];
      const q = this.nearest(x, -y);
      if (!q) continue;
      const pt = this.d.runs[q.run].p[q.i];
      if (Math.hypot(pt[0] - x, pt[1] - y) < pt[2] + 5) { near++; by.set(q.run, (by.get(q.run) ?? 0) + 1); }
    }
    if (near >= n * 0.8) return null;
    if (near < n * 0.3) return undefined;
    let lv = Infinity;
    for (const [r, c] of by) if (c >= n * 0.15) lv = Math.min(lv, this.d.runs[r].lv);
    return Number.isFinite(lv) ? lv - 0.03 : undefined;
  }

  /** What there is to stand on at scene (x, z) from the canal: its bed in the water (a lock's
   *  bed rises with its water, so you bob up as it fills), a lock's coping and paving, an aqueduct's towpath. Or null. */
  floor(x: number, z: number): number | null {
    for (const lk of this.locks) {
      const [u, v] = lk.local(x, z);
      if (u < -wingLength(lk.d) || u > lk.L + TAIL) continue;
      const av = Math.abs(v);
      if (av < LOCK_HALF) return (u < 0 ? lk.d.zl : u > lk.L ? lk.d.zh : lk.level) - 1.2 - this.z0;
      if (av < LOCK_HALF + COPE + APRON) return (u < -TAIL ? wingTop(lk.d, u) : lk.d.zh + 0.45) - this.z0;
    }
    const q = this.nearest(x, z);
    if (!q) return null;
    const r = this.d.runs[q.run], L = this.legs[q.run], k = q.i;
    // across from the nearest segment
    const a = L.pts[Math.max(0, k - 1)], b = L.pts[Math.min(L.pts.length - 1, k + 1)];
    const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
    const across = Math.abs(((x - L.pts[k].x) * tz - (z - L.pts[k].z) * tx) / tl), half = r.p[k][2];
    const y = r.lv - this.z0;
    if (across < half) return y - 1.2;
    if (r.p[k][6] & 2 && across < half + 3) return y + 0.4;
    return null;
  }

  // ---- the host: locks and boats ----------------------------------------------------------------
  /** Someone's leant on a lock's beam: set it for the other end. */
  work(i: number) {
    const lk = this.locks[i];
    if (!lk) return;
    lk.want = 1 - lk.want;
    lk.claim = 0;
  }

  simulate(dt: number, players: { x: number; z: number }[]) {
    const nearest = (x: number, z: number) => players.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.z - z)), Infinity);
    const now = performance.now();
    for (const b of [...this.boats.values()]) {
      if (b.helm && now - b.helmAt > 10000) { b.helm = ""; b.leftAt = now; }     // they've gone quiet: let go
      if (!b.helm && (nearest(b.x, b.z) > GONE || (b.waitT > 150 && nearest(b.x, b.z) > 80))) this.drop(b.n);
    }
    if (this.boats.size < COUNT && players.length) this.spawn(nearest);
    for (const b of this.boats.values()) this.drive(b, dt, now);
  }

  private drive(b: Boat, dt: number, now: number) {
    const L = this.legs[b.leg];
    const crew = !b.helm && now - b.leftAt > HELM_IDLE;      // the boat's own crew is steering
    if (b.mode === 2) {
      b.v = 0;
      b.turn += dt / 10;
      if (b.turn >= 1) { b.turn = 0; b.mode = 0; b.dir = -b.dir; b.next = -2; }
      return;
    }
    if (b.next === -2) b.next = this.choose(b);
    const rem = b.dir > 0 ? L.len - b.s : b.s;
    let stopAt = Infinity, want = crew ? CRUISE : b.helm ? b.throttle * (b.throttle > 0 ? TOP : ASTERN) : 0;
    b.mode = 0;
    if (L.lock >= 0) {
      // in a lock: stop in the middle until the gates ahead are open
      const lk = this.locks[L.lock], out = b.dir > 0 ? 1 : 0, mid = L.len / 2, toMid = b.dir > 0 ? mid - b.s : b.s - mid;
      lk.inside = b.n;
      const open = (out ? lk.g1 : lk.g0) >= 1;
      if (!open) {
        stopAt = Math.max(0, toMid);
        if (crew && Math.abs(toMid) < 1 && b.v < 0.05 && (b.waitT += dt) > 2) lk.want = out;
      }
    } else {
      if (L.flags[Math.min(L.flags.length - 1, this.along(L, b.s).k)] & 1) want = Math.min(want, CRUISE * 0.7);
      const nx = b.next >= 0 ? this.legs[b.next] : null;
      if (b.next === -1) {
        stopAt = rem - b.hl - 3;
        // the crew turn it round; with someone at the tiller, pushing on turns it
        if ((crew || b.throttle > 0.5) && stopAt < 0.3 && b.v < 0.05) { b.mode = 2; b.turn = 0; return; }
      } else if (nx && nx.lock >= 0) {
        // a lock ahead: wait short of its gates till it's ready for us and nobody's in it
        const lk = this.locks[nx.lock], side = key(nx.pts[0].x, nx.pts[0].z) === (b.dir > 0 ? L.b : L.a) ? 0 : 1;
        const ready = (side ? lk.g1 : lk.g0) >= 1 && (!lk.inside || lk.inside === b.n) && (!lk.claim || lk.claim === b.n);
        if (!ready) {
          stopAt = rem - b.hl - 4;
          if (stopAt < 30) {
            b.mode = 1;
            b.waitT += dt;
            if (crew && !lk.claim && !lk.inside) lk.claim = b.n;
            if (crew && lk.claim === b.n && !lk.inside && b.waitT > 2) lk.want = side;
          }
        } else if (crew) lk.claim = b.n;
      }
    }
    // keep back from a boat ahead going the same way; keep right of one coming the other way
    b.latT = 0;
    for (const o of this.boats.values()) {
      if (o === b || o.leg !== b.leg) continue;
      const ahead = (o.s - b.s) * b.dir;
      if (ahead <= 0) continue;
      if (o.dir === b.dir) stopAt = Math.min(stopAt, ahead - o.hl - b.hl - 4);
      else if (ahead < 90) b.latT = -1.4;
    }
    if (L.lock >= 0) b.latT = 0;
    const room = Math.sqrt(2 * 0.25 * Math.max(0, stopAt));
    if (want > 0) want = Math.min(want, room);
    else if (stopAt < 0.3) want = Math.max(want, 0);
    if (b.mode !== 1 && Math.abs(want) > 0.05) b.waitT = 0;
    const dv = want - b.v;
    b.v += Math.max(-0.5 * dt, Math.min(0.35 * dt, dv));
    b.gas = dv > 0.05 || Math.abs(want) > 0.5 ? 1 : 0;
    const half = this.halfAt(b);
    if (b.helm && L.lock < 0) {
      // the rudder: the tiller over swings the bow round, as fast as the water's going past the
      // rudder lets it (nothing happens stood still), and the boat heads off its line until the
      // tiller comes back; the bank stops it going further across and knocks it straight
      const flow = Math.max(-1, Math.min(1, b.v / 1.5));
      b.rel += -b.steer * RUDDER * flow * dt;
      b.rel = Math.max(-0.5, Math.min(0.5, b.rel));
      b.lat += Math.sin(b.rel) * b.v * dt;
      if (Math.abs(b.lat) > half) { b.lat = Math.sign(b.lat) * half; b.rel *= 0.4; b.v *= 0.9; }
    } else {
      // the crew keep to their line, nosing across for a boat coming the other way
      b.lat += Math.max(-0.5 * dt, Math.min(0.5 * dt, b.latT - b.lat));
      b.rel += (Math.atan2(b.latT - b.lat, 8) - b.rel) * Math.min(1, dt * 2);
    }
    b.s += b.dir * b.v * Math.cos(b.rel) * dt;
    // past the end: onto the next stretch, or back from the start if going astern
    if (b.v < 0) { if (b.dir > 0 ? b.s < b.hl : b.s > L.len - b.hl) { b.s = b.dir > 0 ? b.hl : L.len - b.hl; b.v = 0; } return; }
    if ((b.dir > 0 ? b.s - L.len : -b.s) >= 0) {
      if (b.next < 0) { b.s = b.dir > 0 ? L.len : 0; b.v = 0; return; }
      if (L.lock >= 0) { const lk = this.locks[L.lock]; lk.inside = 0; lk.claim = 0; }
      const over = b.dir > 0 ? b.s - L.len : -b.s, nx = this.legs[b.next], end = b.dir > 0 ? L.b : L.a;
      b.leg = b.next; b.next = -2;
      if (nx.a === end) { b.dir = 1; b.s = over; } else { b.dir = -1; b.s = nx.len - over; }
      b.waitT = 0;
    }
  }

  /** Which stretch to take at the end of this one: straight on, mostly; a tiller held over picks a branch. */
  private choose(b: Boat): number {
    const L = this.legs[b.leg], end = b.dir > 0 ? L.b : L.a;
    const h = this.along(L, b.dir > 0 ? L.len : 0), hx = h.tx * b.dir, hz = h.tz * b.dir;
    const outs = (this.nodes.get(end) ?? []).filter((o) => o.leg !== b.leg);
    if (!outs.length) return -1;
    const score = (o: { leg: number; end: 0 | 1 }) => {
      const N = this.legs[o.leg], a = this.along(N, o.end === 0 ? 0 : N.len), d = o.end === 0 ? 1 : -1;
      const straight = a.tx * d * hx + a.tz * d * hz;
      // across: which side the branch goes, for a tiller held over
      const left = -(a.tx * d * -hz + a.tz * d * hx);
      if (b.helm) return straight + b.steer * left;
      const short = N.dead && N.len < 400 ? -2 : 0;
      return straight + short + Math.random() * 0.6;
    };
    return outs.reduce((best, o) => (score(o) > score(best) ? o : best)).leg;
  }

  private spawn(nearest: (x: number, z: number) => number) {
    const runs = this.legs.filter((L) => L.lock < 0 && L.len > 60);
    const total = runs.reduce((t, L) => t + L.len, 0);
    for (let tries = 0; tries < 30; tries++) {
      let r = Math.random() * total, L = runs[0];
      for (const c of runs) { if ((r -= c.len) <= 0) { L = c; break; } }
      const s = 25 + Math.random() * Math.max(0, L.len - 50), at = this.along(L, s), d = nearest(at.x, at.z);
      if (d < NEAR || d > FAR || L.flags[at.k] & 3) continue;
      const leg = this.legs.indexOf(L);
      if ([...this.boats.values()].some((o) => o.leg === leg && Math.abs(o.s - s) < 40)) continue;
      const len = [15, 17, 18, 20][Math.floor(Math.random() * 4)];
      const b = this.make(this.serial++, len, Math.floor(Math.random() * PAINTS.length));
      b.leg = leg; b.s = s; b.dir = Math.random() < 0.5 ? 1 : -1; b.v = CRUISE * 0.8; b.leftAt = -1e9;
      this.place(b, 0);
      return;
    }
  }

  private make(n: number, len: number, paint: number): Boat {
    const b = new Boat(n, len, paint, this.boatGeo[paint % this.boatGeo.length], this.crewGeo, this.boatMat);
    this.boats.set(n, b);
    this.scene.add(b.root);
    return b;
  }

  private drop(n: number) {
    const b = this.boats.get(n);
    if (!b) return;
    this.boats.delete(n);
    this.scene.remove(b.root);
    for (const lk of this.locks) { if (lk.inside === n) lk.inside = 0; if (lk.claim === n) lk.claim = 0; }
  }

  /** Someone wants the tiller of boat n: theirs if nobody has it. */
  take(n: number, id: string): boolean {
    const b = this.boats.get(n);
    if (!b || (b.helm && b.helm !== id)) return false;
    for (const o of this.boats.values()) if (o.helm === id && o !== b) o.helm = "";
    b.helm = id; b.helmAt = performance.now(); b.throttle = 0; b.steer = 0;
    return true;
  }
  leave(n: number, id: string) {
    const b = this.boats.get(n);
    if (b && b.helm === id) { b.helm = ""; b.leftAt = performance.now(); b.throttle = 0; }
  }
  /** The throttle (-1..1) and the tiller (-1..1, + over to the right, which puts the bow to the left) from the helmsman. */
  steer(n: number, id: string, throttle: number, tiller: number) {
    const b = this.boats.get(n);
    if (!b || b.helm !== id || !Number.isFinite(throttle) || !Number.isFinite(tiller)) return;
    b.throttle = Math.max(-1, Math.min(1, throttle));
    b.steer = Math.max(-1, Math.min(1, tiller));
    b.helmAt = performance.now();
  }
  /** How far across a boat can go from the middle where it is. */
  halfAt(b: Boat): number {
    const L = this.legs[b.leg];
    if (L.lock >= 0) return 0;
    return Math.max(0, this.d.runs[L.run].p[this.along(L, b.s).k][2] - HW - 0.4);
  }
  /** Has someone left the tiller of a boat (gone from the room)? */
  forget(id: string) { for (const b of this.boats.values()) if (b.helm === id) { b.helm = ""; b.leftAt = performance.now(); } }

  // ---- everyone else: the host's updates --------------------------------------------------------
  snapshot(): { b: number[]; h: (number | string)[]; l: number[] } {
    const q = (v: number) => Math.round(v * 100) / 100, b: number[] = [], h: (number | string)[] = [], l: number[] = [];
    for (const o of this.boats.values()) {
      b.push(o.n, o.leg, o.dir, q(o.s), q(o.lat), q(o.v), o.len, o.paint, o.mode, q(o.turn), q(o.rel));
      if (o.helm) h.push(o.n, o.helm);
    }
    for (const lk of this.locks) l.push(lk.want, q(lk.f), q(lk.g0), q(lk.g1));
    return { b, h, l };
  }

  apply(d: { b: number[]; h: (number | string)[]; l: number[] }) {
    if (!d || !Array.isArray(d.b) || d.b.length % STRIDE || !Array.isArray(d.l)) return;
    const seen = new Set<number>();
    for (let k = 0; k < d.b.length; k += STRIDE) {
      const [n, leg, dir, s, lat, v, len, paint, mode, turn, rel] = d.b.slice(k, k + STRIDE);
      if (![n, leg, dir, s, lat, v, len, paint, mode, turn].every(Number.isFinite) || !this.legs[leg]) continue;
      seen.add(n);
      let b = this.boats.get(n);
      if (!b) { b = this.make(n, len, paint); b.leg = leg; b.s = s; }
      if (b.leg !== leg || b.dir !== dir || Math.abs(b.s - s) > 5) { b.leg = leg; b.s = s; } else b.s += (s - b.s) * 0.4;
      b.dir = dir; b.latT = lat; b.v = v; b.mode = mode; b.turn = turn; b.helm = ""; b.rel = Number.isFinite(rel) ? rel : 0;
    }
    for (const n of [...this.boats.keys()]) if (!seen.has(n)) this.drop(n);
    if (Array.isArray(d.h)) for (let k = 0; k + 1 < d.h.length; k += 2) { const b = this.boats.get(d.h[k] as number); if (b) b.helm = String(d.h[k + 1]); }
    this.locks.forEach((lk, i) => {
      const [w, f, g0, g1] = d.l.slice(i * 4, i * 4 + 4);
      if (![w, f, g0, g1].every(Number.isFinite)) return;
      lk.want = w ? 1 : 0; lk.f = f; lk.g0 = g0; lk.g1 = g1;
    });
  }

  // ---- everyone: drawing ------------------------------------------------------------------------
  update(dt: number, host: boolean, px: number, pz: number) {
    for (const lk of this.locks) { lk.step(dt); this.poseLock(lk); }
    for (const b of this.boats.values()) {
      if (!host) {
        const L = this.legs[b.leg];
        b.s = Math.max(0, Math.min(L.len, b.s + b.dir * b.v * dt));
        b.lat += (b.latT - b.lat) * Math.min(1, dt * 2);
      }
      this.place(b, dt);
    }
    // the sound of water rushing through the paddles
    for (const lk of this.locks) {
      const fl = lk.flow;
      if (!fl) continue;
      const [x, y, z] = fl > 0 ? lk.at(lk.L - 2, 0, lk.level - this.z0) : lk.at(-2, 0, lk.d.zl - this.z0);
      this.onWater?.(lk.i, x, y, z, 1);
    }
    this.cullT -= dt;
    if (this.cullT <= 0) {
      this.cullT = 0.5;
      for (const f of this.far) f.o.visible = Math.hypot(f.x - px, f.z - pz) < f.r;
    }
  }

  private poseLock(lk: Lock) {
    lk.water.position.y = lk.level - this.z0;
    lk.leaves.forEach((leaf, k) => {
      const side = leaf.userData.side as number, g = k < 2 ? lk.g0 : lk.g1;
      const shut = Math.atan2(-side * Math.cos(MITRE), Math.sin(MITRE));
      leaf.rotation.y = shut * (1 - smooth(g));
    });
    const fl = lk.flow, mat = lk.foam.material as THREE.MeshBasicMaterial;
    mat.opacity += ((fl ? 0.85 : 0) - mat.opacity) * 0.05;
    lk.foam.visible = mat.opacity > 0.02;
    if (fl > 0) lk.foam.position.set(lk.L - 2.6, lk.level - this.z0 + 0.04, 0);
    else if (fl < 0) lk.foam.position.set(-2.8, lk.d.zl - this.z0 + 0.04, 0);
    if (mat.map) mat.map.offset.y = (mat.map.offset.y + 0.01) % 1;
  }

  private place(b: Boat, dt: number) {
    const L = this.legs[b.leg], at = this.along(L, b.s);
    const hx = at.tx * b.dir, hz = at.tz * b.dir;
    const lx = hz, lz = -hx;              // to the left of the way it's going
    b.x = at.x + lx * b.lat; b.z = at.z + lz * b.lat;
    const want = Math.atan2(-hz, hx) + b.rel + (b.mode === 2 ? Math.PI * smooth(b.turn) : 0);
    const da = Math.atan2(Math.sin(want - b.a), Math.cos(want - b.a));
    b.a = dt ? b.a + da * Math.min(1, dt * 3) : want;
    const level = L.lock >= 0 ? this.locks[L.lock].level : L.lv;
    b.y = level - this.z0 - 0.5;
    b.top = level - this.z0 + 1.75; b.waist = level - this.z0 + 1.0;
    b.root.position.set(b.x, level - this.z0, b.z);
    b.root.rotation.y = b.a;
    b.boater.visible = !b.helm;
  }

  // ---- what's within reach ----------------------------------------------------------------------
  get moving(): Iterable<Boat> { return this.boats.values(); }
  boat(n: number) { return this.boats.get(n); }

  /** The lock at scene (x, z), on its sides or ends: its number, or -1. */
  lockNear(x: number, z: number): number {
    for (const lk of this.locks) {
      const [u, v] = lk.local(x, z);
      if (u > -7 && u < lk.L + 7 && Math.abs(v) < 9) return lk.i;
    }
    return -1;
  }
  /** What leaning on lock i's beam would do, for the prompt. */
  lockHint(i: number): string {
    const lk = this.locks[i];
    const name = `${lk.d.n} (No. ${lk.d.no})`;
    if (lk.flow > 0) return `${name} is filling: E to empty it instead`;
    if (lk.flow < 0) return `${name} is emptying: E to fill it instead`;
    if (lk.settled === 0) return `Work ${name}: fill it`;
    if (lk.settled === 1) return `Work ${name}: empty it`;
    return `Work ${name}: the gates are swinging`;
  }
  /** A boat whose tiller is within reach of feet at scene (x, y, z), with nobody else at it. */
  tillerNear(x: number, y: number, z: number, me: string): Boat | null {
    for (const b of this.boats.values()) {
      const t = this.stern(b);
      if (Math.hypot(t.x - x, t.z - z) < 2.4 && Math.abs(t.y - y) < 2 && (!b.helm || b.helm === me)) return b;
    }
    return null;
  }
  /** The boat whose tiller you're at. */
  helmOf(id: string): Boat | null {
    for (const b of this.boats.values()) if (b.helm === id) return b;
    return null;
  }
  /** Where the helmsman stands, on the back deck: scene position (feet) and which way the boat faces. */
  stern(b: Boat): { x: number; y: number; z: number; yaw: number } {
    const c = Math.cos(b.a), s = Math.sin(b.a), back = b.hl - 0.6;
    // (on the step by the hatch, so you can see over the roof)
    return { x: b.x - c * back, y: b.y + 1.5, z: b.z + s * back, yaw: b.a - Math.PI / 2 };
  }
}
