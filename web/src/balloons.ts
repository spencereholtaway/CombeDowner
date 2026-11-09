// Hot air balloons from Royal Victoria Park, early in the morning, as Bath has always had them. The
// crews lay five balloons out on the lawn west of Marlborough Buildings before dawn, fill them from
// a quarter to five, and from half past five they stand there ready, burners blasting now and then,
// till half past ten, when the ones nobody's taken are packed away. A few more go up on their own
// flights soon after dawn and drift off over the city, and come down a few miles off.
//
// Walk up to a basket and E climbs in. The first in flies it: W lights the burner and heats the air
// in the envelope, S opens the vent at the top and lets the hot air out, and A and D turn the
// basket. There's no steering otherwise: you go where the wind takes you. But the wind turns as you
// go up (and blows harder), so picking your height is picking your way. The heat takes a while to
// tell: burn, and a few seconds later you start to climb; let it cool, or vent, and you sink. Down on
// the ground again (anywhere: a field, a street, a roof), E gets you out, and a balloon left on its
// own sinks, lands and lies down deflated, till the crews bring it back to the park before the next
// dawn. Come down too hard and it hurts.
//
// Who decides what: whoever's flying a balloon (the first in) moves it and sends where it is and how
// hot it is about 10 times a second ("bl"); if two climb in at once, the lower id flies. Anyone else
// in the basket rides along on their own screen, and says where they stand in it (game.ts, "bal" in
// their position updates). If the pilot goes, whoever's left in the basket takes over. A balloon
// nobody's in comes down on everyone's screen the same way, and the host sends where the ones that
// have left the lawn are every couple of seconds, so latecomers see them where they came down. The
// lawn and the other flights run to the clock (daylight.ts), so nothing about them is sent.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as SFX from "./audio";
import { model, type Part } from "./furniture";
import { dayLength, dayNumber, timeOfDay } from "./daylight";
import type { GameMap } from "./map";

const HOUR = 1 / 24;
const BACK = 4.25 * HOUR;       // from here, a balloon left down anywhere is brought back to its spot on the lawn
const FILL = 4.75 * HOUR;       // the crews start filling the ones on the lawn
const READY = 5.5 * HOUR;       // and they're ready to go
const PACK = 10.5 * HOUR;       // the ones still on the lawn start being packed away
const PACKED = 11 * HOUR;
/** The lawn in Royal Victoria Park, west of Marlborough Buildings: where each balloon you can fly
 *  stands (data metres east and north), clear of the trees. */
const LAWN: [number, number][] = [[-1886, 2794], [-1930, 2722], [-1962, 2718], [-1986, 2746], [-1954, 2750]];
const NAMES = ["Bladud", "Sulis", "Minerva", "Beau Nash", "Jane Austen"];
/** The other flights: where each goes up from, when (hours), and how long it's up (game hours). */
const FLIGHTS: { at: [number, number]; up: number; long: number; cruise: number }[] = [
  { at: [-1974, 2690], up: 5.6, long: 7, cruise: 260 },
  { at: [-1805, 2722], up: 5.8, long: 8.5, cruise: 520 },
  { at: [-1800, 2790], up: 6.0, long: 6.5, cruise: 180 },
  { at: [-1974, 2690], up: 6.35, long: 9, cruise: 700 },
  { at: [-1805, 2722], up: 6.6, long: 7.5, cruise: 380 },
];
/** Each balloon's gores, in turn round it, and the band round its middle, if it has one. */
const DESIGNS: { gores: string[]; band?: string }[] = [
  { gores: ["#d8262e", "#f2c318"] },
  { gores: ["#1f4fa8", "#f4f4f0"], band: "#d8262e" },
  { gores: ["#2f8a3a", "#f2c318", "#d8262e", "#1f4fa8"] },
  { gores: ["#6a2c8e", "#f08a24"] },
  { gores: ["#f4f4f0", "#1b1c1f"], band: "#f2c318" },
  { gores: ["#e85a9a", "#3bb3c9", "#f2c318"] },
  { gores: ["#c9201c", "#f4f4f0", "#1f3f7a"] },
  { gores: ["#f08a24", "#f2c318", "#d8262e"], band: "#1b1c1f" },
  { gores: ["#2a6f97", "#9fd3e6"] },
  { gores: ["#3c5a3a", "#d6cdb0"], band: "#7b2a1c" },
];

const RISE = 3.3;               // the envelope's mouth is this far above the basket's floor
const BURNER = 2.7;             // and the burner this far
const HALF = 0.75;              // half the basket's width
const SPOTS = [[0.38, -0.38], [-0.38, -0.38], [0.38, 0.38], [-0.38, 0.38]];   // where everyone stands in it: the pilot first
const REACH = 1.9;              // how close to a basket to climb in
const OUT = 3;                  // and how near the ground it must be to climb out
const DELAY = 110;              // ms behind real time, as for other players
const SEND = 0.1;               // seconds between a pilot's updates
const GONE = 1500;              // ms without a word from a pilot before they're taken to have gone
const LEFT = 2;                 // seconds between the host's word on balloons nobody's in
const EMPTY = 4, HOME = 8, BURN = 1, VENT = 2;
const TOP = 2000;               // nothing goes higher than this
const HEAR = 260;               // a burner's heard this far off

/** The wind at h metres up, on one day: [east, south] in metres a second (scene x and z). Mostly from
 *  the south-west or the west, as in Bath, light near the ground and stronger higher up, and turning
 *  as you climb: by a few hundred metres up it's coming from another way altogether. */
export function wind(h: number, day: number): [number, number] {
  const r = (n: number) => { const v = Math.sin(day * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v); };
  const from = ((200 + r(1) * 110) * Math.PI) / 180;
  const veer = ((r(2) - 0.3) * 100 * Math.PI) / 180;
  const k = Math.min(1, Math.max(0, h) / 700);
  const a = from + veer * k * (2 - k), s = 1.2 + (4 + r(3) * 4) * (1 - Math.exp(-Math.max(0, h) / 350));
  return [-Math.sin(a) * s, Math.cos(a) * s];
}

const smooth = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
const q = (v: number, k = 100) => Math.round(v * k) / k;

/** How full the balloons on the lawn are at this time of day: 0 laid out (or packed), 1 ready to go. */
function lawnFill(t: number): number {
  if (t < FILL || t >= PACKED) return 0;
  if (t < READY) return (t - FILL) / (READY - FILL);
  if (t < PACK) return 1;
  return 1 - (t - PACK) / (PACKED - PACK);
}

// ---- the look ------------------------------------------------------------------------------

/** The envelope, mouth at the bottom: [radius, height] up its side to the crown. */
const PROFILE = [[1.5, 0], [2.6, 1.2], [4.6, 3.6], [6.9, 7], [8.4, 10.6], [8.9, 13.6], [8.6, 16.4], [7.4, 19], [5.4, 21], [2.8, 22.3], [0, 22.8]];
const ENV_R = 8.9;
const GORES = 16;

function envelope(design: { gores: string[]; band?: string }): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), GORES * 2).toNonIndexed();
  const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3), c = new THREE.Color();
  const cols = design.gores.map((s) => new THREE.Color(s)), band = design.band ? new THREE.Color(design.band) : null;
  for (let t = 0; t < n; t += 3) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) { x += pos.getX(t + k); y += pos.getY(t + k); z += pos.getZ(t + k); }
    const gore = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * GORES) % GORES;
    c.copy(band && y / 3 > 9.6 && y / 3 < 12.4 ? band : cols[gore % cols.length]);
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (t + k) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

let kit: THREE.BufferGeometry | null = null;
/** The basket, open at the top, the burner's frame over it and the ropes up to the envelope's mouth. */
function basketKit(): THREE.BufferGeometry {
  if (kit) return kit;
  const WICKER = "#9a7444", RIM = "#4a2f1c", STEEL = "#8d9196", ROPE = "#d9d2bf", H = 1.1, w = HALF * 2;
  const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
  const parts: Part[] = [
    [box(w, 0.08, w), WICKER, 0, 0.04, 0],
    [box(w, H, 0.06), WICKER, 0, H / 2, HALF], [box(w, H, 0.06), WICKER, 0, H / 2, -HALF],
    [box(0.06, H, w), WICKER, HALF, H / 2, 0], [box(0.06, H, w), WICKER, -HALF, H / 2, 0],
    [box(w + 0.1, 0.1, 0.12), RIM, 0, H, HALF], [box(w + 0.1, 0.1, 0.12), RIM, 0, H, -HALF],
    [box(0.12, 0.1, w + 0.1), RIM, HALF, H, 0], [box(0.12, 0.1, w + 0.1), RIM, -HALF, H, 0],
    // the burner: two cans in a square frame on four poles from the basket's corners
    [new THREE.CylinderGeometry(0.17, 0.2, 0.5, 10), STEEL, -0.2, BURNER, 0], [new THREE.CylinderGeometry(0.17, 0.2, 0.5, 10), STEEL, 0.2, BURNER, 0],
    [box(1.0, 0.05, 0.05), STEEL, 0, BURNER - 0.2, 0.5], [box(1.0, 0.05, 0.05), STEEL, 0, BURNER - 0.2, -0.5],
    [box(0.05, 0.05, 1.0), STEEL, 0.5, BURNER - 0.2, 0], [box(0.05, 0.05, 1.0), STEEL, -0.5, BURNER - 0.2, 0],
    // a gas bottle in each corner
    ...[[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz]): Part => [new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8), "#b8bcc0", sx * 0.52, 0.48, sz * 0.52]),
  ];
  const g = model(parts);
  // the poles and the ropes, as thin boxes from one point to another
  const strut = (a: THREE.Vector3, b: THREE.Vector3, r: number, colour: string) => {
    const d = b.clone().sub(a), m = new THREE.BoxGeometry(r, d.length(), r);
    m.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    m.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return model([[m, colour, 0, 0, 0]]);
  };
  const bits = [g];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    bits.push(strut(new THREE.Vector3(sx * (HALF - 0.05), H, sz * (HALF - 0.05)), new THREE.Vector3(sx * 0.5, BURNER - 0.2, sz * 0.5), 0.04, STEEL));
    bits.push(strut(new THREE.Vector3(sx * 0.5, BURNER - 0.2, sz * 0.5), new THREE.Vector3(sx * 1.06, RISE + 0.05, sz * 1.06), 0.03, ROPE));
  }
  kit = mergeGeometries(bits)!;
  return kit;
}

const kitMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const flameMat = new THREE.MeshBasicMaterial({ color: "#ffb347", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
const flameGeo = new THREE.ConeGeometry(0.32, 2.2, 10, 1, true).translate(0, 1.1, 0);

const _c = new THREE.Vector3();
const _ray = new THREE.Ray();
const _caster = new THREE.Raycaster();

/** One balloon as drawn: basket, burner, envelope and flame. */
export class View {
  readonly root = new THREE.Group();
  private pivot = new THREE.Group();
  private env: THREE.Mesh;
  private basket: THREE.Mesh;
  private flame: THREE.Mesh;
  private mat: THREE.MeshLambertMaterial;
  private glow = 0;
  /** Up and full, standing or flying (not lying on the lawn, packed or put away). */
  standing = false;
  constructor(scene: THREE.Scene | null, design: number) {
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: "#ff8a2a", emissiveIntensity: 0 });
    this.env = new THREE.Mesh(envelope(DESIGNS[design % DESIGNS.length]), this.mat);
    this.env.castShadow = true;
    this.pivot.add(this.env);
    const basket = (this.basket = new THREE.Mesh(basketKit(), kitMat));
    basket.castShadow = true;
    this.flame = new THREE.Mesh(flameGeo, flameMat);
    this.flame.position.y = BURNER + 0.2;
    this.root.add(this.pivot, basket, this.flame);
    scene?.add(this.root);
  }

  /** Where it is (the middle of the basket's floor) and which way it faces; how full (0 laid out flat
   *  on the grass, a bit puffed up, then standing, 1 up and ready); and whether the burner's on.
   *  packed: just the basket, the envelope folded away in it. */
  pose(x: number, y: number, z: number, a: number, fill: number, burn: boolean, dt: number, packed = false) {
    const r = this.root;
    r.visible = true;
    this.standing = !packed && fill > 0.95;
    r.position.set(x, y, z);
    r.rotation.y = a;
    // filling: it lies on its side, downwind of the basket, swelling, then stands up as it heats
    const lie = fill < 0.7 ? 1 : 1 - smooth((fill - 0.7) / 0.3);
    const puff = fill < 0.7 ? 0.05 + 0.95 * smooth(fill / 0.7) : 1;
    this.env.visible = !packed;
    this.env.scale.set(1 + 0.25 * (1 - puff), 1, puff);
    this.pivot.rotation.x = (-Math.PI / 2) * lie;
    this.pivot.position.set(0, ENV_R * puff * lie + RISE * (1 - lie), -1.6 * lie);
    this.flame.visible = burn && fill > 0.6;
    if (this.flame.visible) this.flame.scale.set(0.9 + Math.random() * 0.25, 0.8 + Math.random() * 0.5, 0.9 + Math.random() * 0.25);
    this.glow += ((burn ? 0.35 : 0) - this.glow) * Math.min(1, dt * 6);
    this.mat.emissiveIntensity = this.glow;
  }

  hide() { this.root.visible = false; this.standing = false; }

  /** How far along a ray (scene coords, d of length 1) it meets this balloon's envelope or basket, or null. */
  ray(ray: THREE.Ray, max: number): number | null {
    if (!this.root.visible) return null;
    // a quick look first: is it anywhere near the line at all? (25 m takes in one lying on the grass)
    if (ray.distanceSqToPoint(this.root.position) > 25 * 25 || _c.copy(this.root.position).sub(ray.origin).dot(ray.direction) < -25) return null;
    _caster.ray.copy(ray);
    _caster.far = max;
    this.root.updateWorldMatrix(true, true);
    let best: number | null = null;
    for (const m of [this.env, this.basket]) {
      if (!m.visible) continue;
      const h = _caster.intersectObject(m, false)[0];
      if (h && (best === null || h.distance < best)) best = h.distance;
    }
    return best;
  }

  dispose() {
    this.root.removeFromParent();
    this.env.geometry.dispose();
    this.mat.dispose();
  }
}

/** How many looks the balloons come in. */
export const BALLOON_DESIGNS = DESIGNS.length;

/** One balloon, up and ready with its burner going, for what's what (whatswhat.ts). */
export function balloonModel(design: number): THREE.Group {
  const v = new View(null, design);
  v.pose(0, 0, 0, 0, 1, true, 1);
  return v.root;
}

// ---- the balloons you can fly ----------------------------------------------------------------

interface Snap { t: number; x: number; y: number; z: number; a: number; T: number; vy: number; fill: number; burn: boolean }

/** A balloon you can climb into: where the middle of its basket's floor is, which way it faces, and
 *  how it's flying. The others in it are drawn from here (game.ts). */
export class Balloon {
  x: number; y = 0; z: number; a: number;
  vx = 0; vy = 0; vz = 0;
  /** How hot the air in it is: 1 just floats, more climbs, less sinks. */
  T = 0.95;
  fill = 0;
  burn = false; vent = false;
  /** On its spot on the lawn, waiting, as the clock says (nobody's taken it since it was brought back). */
  home = true;
  /** Who's flying it (an id), or nobody, and when we last heard from them (ms). */
  pilot = ""; heard = 0;
  idle = 0;                        // seconds down on the ground with nobody in
  snaps: Snap[] = [];
  readonly view: View;
  constructor(readonly i: number, readonly name: string, readonly hx: number, readonly hz: number, readonly ha: number, scene: THREE.Scene) {
    this.x = hx; this.z = hz; this.a = ha;
    this.view = new View(scene, i);
  }
  /** Degrees C in the envelope, for the gauge. */
  get temp() { return Math.round(20 + 80 * this.T); }
}

/** Someone else's flight: it runs to the clock, the same for everyone. */
interface Flight { at: [number, number]; up: number; long: number; cruise: number; view: View; px: number; pz: number; ps: number; day: number }

export interface BalloonControls { burn: boolean; vent: boolean; turn: number }

export class Balloons {
  readonly list: Balloon[] = [];
  /** Why nobody can take a balloon up yet (the zones haven't opened them: zones.ts), or "". */
  shut = "";
  private flights: Flight[] = [];
  /** The balloon you're in (its place in list), or -1, and where you stand in its basket. */
  aboard = -1;
  spot = 0;
  /** How hard you hit the ground, the frame you came down (m/s), or 0. */
  landed = 0;
  private sendT = 0;
  private hostT = 0;
  private roars = new Map<View, NonNullable<ReturnType<typeof SFX.burner>>>();

  constructor(private map: GameMap, scene: THREE.Scene, private self: string, private send: (d: number[]) => void) {
    if (map.d.id !== "combe-down") return;   // Royal Victoria Park is in Bath
    // each turned a little differently on the grass
    LAWN.forEach(([x, y], i) => this.list.push(new Balloon(i, NAMES[i], x, -y, -1.2 + i * 0.4, scene)));
    FLIGHTS.forEach((f, k) => this.flights.push({ ...f, view: new View(scene, LAWN.length + k), px: 0, pz: 0, ps: -1, day: -1 }));
  }

  /** The balloon you're flying, if you are. */
  get flying(): Balloon | null { const b = this.list[this.aboard]; return b && b.pilot === this.self ? b : null; }
  get mine(): Balloon | null { return this.list[this.aboard] ?? null; }

  /** The balloon whose basket you're by: to climb into, or, if you can't, why not. */
  near(x: number, y: number, z: number): { b: Balloon; why: string } | null {
    if (this.aboard >= 0) return null;
    for (const b of this.list) {
      if (Math.hypot(b.x - x, b.z - z) > REACH || Math.abs(y - b.y) > 1.6) continue;
      const why = this.shut && !b.pilot ? this.shut : b.home && b.fill < 1 ? (timeOfDay() < READY && timeOfDay() >= FILL ? "They're still filling it. Ready at half five" : "The balloons go up from here at dawn, from half five till half ten")
        : !b.home && b.fill < 0.5 && !b.pilot ? "This one's packed up for the day" : "";
      return { b, why };
    }
    return null;
  }

  /** Into a basket. You fly it if nobody else is. */
  board(b: Balloon) {
    const now = performance.now();
    this.aboard = b.i;
    if (!b.pilot || (b.pilot !== this.self && now - b.heard > GONE)) this.takeOver(b);
    this.spot = b.pilot === this.self ? 0 : 1 + (([...this.self].reduce((h, c) => h + c.charCodeAt(0), 0)) % 3);
  }

  private takeOver(b: Balloon) {
    b.pilot = this.self;
    if (b.home) { b.home = false; b.T = Math.min(b.T, 0.95); b.vx = b.vy = b.vz = 0; }
    b.idle = 0;
    this.sendT = 0;
  }

  /** Out of the basket: null if it's too high to climb out, or where to step out onto. */
  leave(force = false): { x: number; z: number } | null {
    const b = this.list[this.aboard];
    if (!b) { this.aboard = -1; return null; }
    if (!force && b.y - this.map.ground(b.x, b.z) > OUT && b.y - this.map.floor(b.x, b.z, b.y + 0.3) > OUT) return null;
    this.aboard = -1;
    if (b.pilot === this.self) { b.pilot = ""; b.burn = b.vent = false; this.send(this.state(b, EMPTY)); }
    const a = b.a + Math.PI / 2;
    return { x: b.x + Math.sin(a) * (HALF + 0.9), z: b.z + Math.cos(a) * (HALF + 0.9) };
  }

  /** Where you stand in your basket (scene coords of your feet), or null. */
  standing(): { x: number; y: number; z: number } | null {
    const b = this.list[this.aboard];
    if (!b) return null;
    const [sx, sz] = SPOTS[this.spot], c = Math.cos(b.a), s = Math.sin(b.a);
    return { x: b.x + sx * c + sz * s, y: b.y + 0.08, z: b.z - sx * s + sz * c };
  }

  /** Your basket and where you are in it, for your position updates: [its number, x, y, z from the middle of its floor]. */
  local(x: number, y: number, z: number): number[] | undefined {
    const b = this.list[this.aboard];
    return b ? [b.i + 1, x - b.x, y - b.y, z - b.z] : undefined;
  }

  /** The middle of a basket's floor, by its number from local(), for drawing someone in it. */
  base(n: number): Balloon | null { return this.list[n - 1] ?? null; }

  private state(b: Balloon, extra = 0): number[] {
    const f = (b.burn ? BURN : 0) | (b.vent ? VENT : 0) | (b.home ? HOME : 0) | extra;
    return [b.i, q(b.x), q(b.y), q(b.z), q(b.a), q(b.T, 1000), q(b.vy), q(b.fill), f];
  }

  /** A balloon's state from whoever's flying it, or from the host for one nobody's in. */
  onState(d: unknown, from: string) {
    if (!Array.isArray(d) || d.length < 9 || !d.every((v) => typeof v === "number" && Number.isFinite(v))) return;
    const b = this.list[d[0]];
    if (!b) return;
    const now = performance.now(), f = d[8] | 0;
    const [, x, y, z, a, T, vy, fill] = d as number[];
    if (f & EMPTY) {
      // nobody's in it (its pilot's just climbed out, or the host's word on one left somewhere)
      if (b.pilot === this.self || (b.pilot && b.pilot !== from && now - b.heard < GONE)) return;
      b.pilot = ""; b.snaps = [];
      Object.assign(b, { x, y, z, a, T, vy, fill, home: (f & HOME) !== 0, burn: false, vent: false });
      return;
    }
    // two of us climbed in at once: the lower id flies it
    if (b.pilot === this.self && !(from < this.self)) return;
    if (b.pilot !== from) b.snaps = [];
    b.pilot = from; b.heard = now; b.home = false; b.idle = 0;
    b.snaps.push({ t: now, x, y, z, a, T, vy, fill, burn: (f & BURN) !== 0 });
    if (b.snaps.length > 12) b.snaps.shift();
  }

  /** Each frame: fly yours, follow everyone else's, and run the lawn and the other flights from the clock. */
  update(dt: number, ctl: BalloonControls, host: boolean, hear: (x: number, y: number, z: number) => [number, number]) {
    const now = performance.now(), tod = timeOfDay();
    this.landed = 0;
    for (const b of this.list) {
      if (b.pilot && b.pilot !== this.self && now - b.heard > GONE) { b.pilot = ""; b.snaps = []; }
      if (!b.pilot && this.aboard === b.i) this.takeOver(b);
      if (b.pilot === this.self) {
        const hit = this.fly(b, dt, ctl);
        if (this.aboard === b.i) this.landed = hit;
        if ((this.sendT -= dt) <= 0) { this.sendT = SEND; this.send(this.state(b)); }
      } else if (b.pilot) {
        const was = b.vy;
        this.follow(b, now);
        // riding in someone else's: you feel it land too
        if (this.aboard === b.i && was < -3 && b.vy >= 0 && this.clearance() < 0.2) this.landed = -was;
      } else if (b.home) {
        // waiting on the lawn, as the clock says; the crews give the burners a blast now and then
        b.x = b.hx; b.z = b.hz; b.a = b.ha; b.y = this.map.ground(b.x, b.z);
        b.vx = b.vy = b.vz = 0; b.T = 0.95; b.vent = false;
        b.fill = lawnFill(tod);
        b.burn = b.fill > 0.6 && (now / 1000 + b.i * 7.3) % (b.fill < 1 ? 4 : 13) < (b.fill < 1 ? 1.6 : 0.9);
      } else {
        // nobody's in it: it cools and comes down where the wind takes it, and lies down
        this.fly(b, dt, null);
        const down = b.y - this.map.floor(b.x, b.z, b.y + 0.3) < 0.05;
        if (down && Math.hypot(b.x - b.hx, b.z - b.hz) < 4) b.home = true;
        else if (down && tod >= BACK && tod < FILL) { b.x = b.hx; b.z = b.hz; b.a = b.ha; b.home = true; }
      }
      // on the lawn they're laid out from before dawn, and packed away again by late morning
      b.view.pose(b.x, b.y, b.z, b.a, b.fill, b.burn, dt, b.home && !b.pilot && (tod < BACK || tod >= PACKED));
      this.roar(b.view, b.burn && b.fill > 0.6, b.x, b.y + BURNER, b.z, hear);
    }
    // the host's word on the balloons nobody's in that have left the lawn, for anyone who's just come
    if (host && (this.hostT -= dt) <= 0) {
      this.hostT = LEFT;
      for (const b of this.list) if (!b.pilot && !b.home) this.send(this.state(b, EMPTY));
    }
    this.others(tod, dt, hear);
  }

  /** One balloon flying for a frame (yours, or one nobody's in, with ctl null): returns how hard it
   *  hit the ground, if it came down this frame. */
  private fly(b: Balloon, dt: number, ctl: BalloonControls | null): number {
    const map = this.map;
    const g0 = map.floor(b.x, b.z, b.y + 0.3), down = b.y - g0 < 0.05;
    b.burn = !!ctl?.burn && b.fill > 0;
    b.vent = !!ctl?.vent;
    // filling, or, left on the ground, emptying and lying down
    if (ctl) { b.idle = 0; if (b.fill > 0 && b.fill < 1) b.fill = Math.min(1, b.fill + dt / 6); }
    else if (down && (b.idle += dt) > 15) b.fill = Math.max(0, b.fill - dt / 10);
    b.T += ((b.burn ? 0.07 : 0) - 0.007 - (b.vent ? 0.08 : 0)) * dt;
    b.T = Math.max(0.75, Math.min(1.3, b.T));
    // the higher, the thinner the air, and the hotter it must be to float
    const need = 1 + Math.max(0, b.y - 400) / 3000;
    let climb = Math.max(-7, Math.min(6, (b.T - need) * 30));
    if (b.fill < 1) climb = Math.min(0, climb);
    b.vy += (climb - b.vy) * Math.min(1, dt * 0.35);
    if (down && b.vy < 0) b.vy = 0;
    // the wind carries it, catching up over a few seconds; on the ground it drags to a stop
    if (down && climb <= 0) {
      const k = Math.exp(-dt * 3);
      b.vx *= k; b.vz *= k;
    } else {
      const [wx, wz] = wind(b.y - map.ground(b.x, b.z), dayNumber()), k = Math.min(1, dt / 8);
      b.vx += (wx - b.vx) * k; b.vz += (wz - b.vz) * k;
    }
    b.a += (ctl?.turn ?? 0) * 0.45 * dt;
    b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
    if (b.y > TOP) { b.y = TOP; b.vy = Math.min(0, b.vy); }
    // the force field holds it in
    if (map.fieldEdge(b.x, b.z) < 30) { [b.x, b.z] = map.fieldInside(b.x, b.z, 30); b.vx *= 0.5; b.vz *= 0.5; }
    // low down, it bumps along walls and buildings rather than through them
    if (b.y - map.ground(b.x, b.z) < 40) {
      const at = map.collide({ x: b.x, z: b.z }, b.y + 0.4, HALF + 0.3);
      if (at.x !== b.x || at.z !== b.z) { b.x = at.x; b.z = at.z; b.vx *= 0.3; b.vz *= 0.3; }
    }
    const g = map.floor(b.x, b.z, b.y + 0.3);
    if (b.y < g) {
      const hit = down ? 0 : Math.max(0, -b.vy);
      b.y = g;
      b.vy = Math.max(0, b.vy);
      return hit;
    }
    return 0;
  }

  /** Someone else's balloon: drawn a moment behind, from what they've sent, like a player. */
  private follow(b: Balloon, now: number) {
    const S = b.snaps;
    if (!S.length) return;
    const t = now - DELAY;
    let s0 = S[0], s1 = S[0];
    for (let k = 0; k < S.length; k++) { s1 = S[k]; if (S[k].t >= t) break; s0 = S[k]; }
    let u = s1.t > s0.t ? Math.min(1, Math.max(0, (t - s0.t) / (s1.t - s0.t))) : 1;
    // gone past the last word: carry on a little at the same speed
    const last = S[S.length - 1], prev = S[S.length - 2];
    if (t > last.t && prev) { s0 = prev; s1 = last; u = 1 + Math.min(0.3, (t - last.t) / 1000) / Math.max(0.05, (last.t - prev.t) / 1000); }
    const L = (a: number, c: number) => a + (c - a) * u;
    b.x = L(s0.x, s1.x); b.y = L(s0.y, s1.y); b.z = L(s0.z, s1.z);
    b.a = s0.a + Math.atan2(Math.sin(s1.a - s0.a), Math.cos(s1.a - s0.a)) * u;
    b.T = s1.T; b.vy = s1.vy; b.fill = s1.fill; b.burn = s1.burn;
    if (prev) { const sec = Math.max(0.05, (last.t - prev.t) / 1000); b.vx = (last.x - prev.x) / sec; b.vz = (last.z - prev.z) / sec; }
  }

  /** The other flights: each is filled on the lawn, goes up, drifts with the wind at its height and
   *  comes down again, all worked out from the clock, so they're where they are for everyone. */
  private others(tod: number, dt: number, hear: (x: number, y: number, z: number) => [number, number]) {
    const D = dayLength(), day = dayNumber(), hourS = D / 24;
    for (const f of this.flights) {
      const s = (tod - f.up * HOUR) * D, long = f.long * hourS, fillS = 0.6 * hourS;
      if (s < -fillS || s > long + 40) { f.view.hide(); this.roar(f.view, false, 0, 0, 0, hear); continue; }
      const height = (t: number) => t <= 0 ? 0 : Math.max(0, Math.min(f.cruise + 25 * Math.sin(t / 40 + f.up), 1.6 * t, (long - t) * 1.4));
      // where the wind's taken it by now, worked out in steps from the start (and kept, to carry on from)
      if (f.day !== day || s < f.ps || f.ps < 0) { f.px = f.at[0]; f.pz = -f.at[1]; f.ps = 0; f.day = day; }
      while (f.ps < s) {
        const st = Math.min(2, s - f.ps), [wx, wz] = wind(height(f.ps), day);
        f.px += wx * st; f.pz += wz * st; f.ps += st;
      }
      [f.px, f.pz] = this.map.fieldEdge(f.px, f.pz) < 60 ? this.map.fieldInside(f.px, f.pz, 60) : [f.px, f.pz];
      const fill = s < 0 ? 1 + s / fillS : s > long ? Math.max(0, 1 - (s - long) / 30) : 1;
      const climbing = s > -fillS * 0.2 && s < long - f.cruise / 1.4;
      const burn = fill > 0.6 && climbing && (s + f.up * 13) % (s < f.cruise / 1.6 ? 5 : 11) < 1.1;
      const x = f.px, z = f.pz, y = this.map.ground(x, z) + height(s);
      f.view.pose(x, y, z, f.up * 2, Math.max(0, fill), burn, dt);
      this.roar(f.view, burn, x, y + BURNER, z, hear);
    }
  }

  /** A burner's roar, for anyone near enough to hear it. */
  private roar(v: View, on: boolean, x: number, y: number, z: number, hear: (x: number, y: number, z: number) => [number, number]) {
    let r = this.roars.get(v);
    const [d, pan] = on ? hear(x, y, z) : [Infinity, 0];
    if (d > HEAR) { if (r) { r.set(0, d, pan); if (!on) { r.stop(); this.roars.delete(v); } } return; }
    if (!r) { const made = SFX.burner(); if (!made) return; this.roars.set(v, (r = made)); }
    r.set(1, d, pan);
  }

  /** Every balloon up and full but yours, the middles of their envelopes (scene coords), for the
   *  cinematic camera to frame yours with (cinema.ts). */
  company(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const v of [...this.list.filter((b) => b.i !== this.aboard).map((b) => b.view), ...this.flights.map((f) => f.view)])
      if (v.standing && v.root.visible) out.push(v.root.position.clone().setY(v.root.position.y + RISE + ENV_R * 1.2));
    return out;
  }

  /** How far along a ray (scene coords, d of length 1) it meets the nearest balloon, or null: for the
   *  drone's crosshair, so it can focus on one (drone.ts). Your own you're in isn't counted. */
  ray(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): number | null {
    _ray.origin.set(ox, oy, oz);
    _ray.direction.set(dx, dy, dz);
    let best: number | null = null;
    for (const v of [...this.list.filter((b) => b.i !== this.aboard).map((b) => b.view), ...this.flights.map((f) => f.view)]) {
      const d = v.ray(_ray, best ?? max);
      if (d !== null && (best === null || d < best)) best = d;
    }
    return best;
  }

  /** What the gauges say, for the panel: how high you are over the ground (m), how fast you're
   *  climbing (m/s, + up), and how hot the envelope is (°C). */
  gauges(): { up: number; climb: number; temp: number } | null {
    const b = this.list[this.aboard];
    if (!b) return null;
    return { up: Math.max(0, Math.round(b.y - this.map.ground(b.x, b.z))), climb: Math.round(b.vy * 10) / 10, temp: b.temp };
  }

  /** How high your basket is over whatever's under it. */
  clearance(): number {
    const b = this.list[this.aboard];
    return b ? b.y - this.map.floor(b.x, b.z, b.y + 0.3) : 0;
  }

  dispose() {
    for (const r of this.roars.values()) r.stop();
    this.roars.clear();
    for (const b of this.list) b.view.dispose();
    for (const f of this.flights) f.view.dispose();
  }
}
