// Traffic: cars that drive themselves round the streets near the players, all over Bath (Combe Down's
// own streets and the wider map's, joined up where they meet), and now and then one of Arleen's
// coaches (coaches.ts), which only sets off on a main road and is much heavier, keeping left, slowing for
// corners and stopping for anything in the road (and leaning on the horn if it's you). They run over
// anyone who steps out at the last moment, and you can pull the driver out of one that's stopped
// and drive off in it (it becomes a vehicle, vehicles.ts, numbered TRAFFIC_ID + its number).
//
// Drive into one (or into a car parked in the street) and it gives way: it's knocked off its line, sliding and spinning, and hit hard
// side-on it trips over its wheels and rolls. One that comes to rest on its roof catches fire and
// goes up a moment later, a fireball that hurts naughty boys, the posh teams and Bendy round it (not
// players, and not the cats) and knocks the rest of the traffic about, which can set more off.
//
// They keep to the roads people really drive on: each road's share of the traffic comes from the
// Department for Transport's counts (tools/traffic_counts.py; side streets nobody's counted go by the
// kind of road they are), so new cars turn up mostly on the busy roads and keep to them at junctions,
// only now and then turning off into a side street. A street shut to traffic in the daytime (Milsom
// Street, 10:00 to 18:00) they keep out of in those hours of the game's clock, and a street only buses
// may use ("00:00-24:00") all the time; the buses you drive (busdriver.ts) go along it. They stop at red traffic lights (signals.ts), and
// at amber if they can stop in time, and wait through red and amber. A car can only turn so tightly:
// where its way on is sharper than that (a hairpin, a dead end, turning round in a street that's
// blocked) it doesn't go round and round trying, it does a turn in the road, back on the opposite lock
// and forward again, a few metres at a time, till it's facing its way, reversing lights on as it backs.
//
// Hear a police car coming with its siren going (behind, or coming the other way) and they pull in to
// the kerb and stop to let it by, staying put where something's parked in the way, and carry on
// once it's gone past and away.
//
// Who decides what: the host drives them all, spawning them on roads a little way off from the
// players and dropping them once everyone's far away, and sends where they are about 10 times a
// second. Everyone else draws them a moment behind, smoothed between updates, as for the naughty boys.
// Whoever drives into one tells the host how hard ("tfx", or "tfp" for a parked car, which comes out
// of the street furniture as a wreck in the traffic, PARKED + its vehicle number, on everyone's
// screen), and sees it go straight away while the host's word catches up; the host runs the wrecks
// and sends how they're lying ("tfw") with the rest.
import * as THREE from "three";
import { carSteerable, paintFor } from "./furniture";
import { carShape, isCoachMake, MAKES, PARAMOUNT, trafficMake } from "./makes";
import { COACH, COACH_LAMPS, coachDecals, coachSteerable } from "./coaches";
import { charred, glossy } from "./gloss";
import { GameMap, Mover } from "./map";
import type { LampPair, Lamps, Lit } from "./headlights";
import { CAR_LAMPS, contact, type Siren, twist } from "./vehicles";
import { AMBER, GREEN, type Signal, lightAt, signalClock, signalsOf } from "./signals";
import { timeOfDay, watchDay } from "./daylight";
import { tag } from "./kinds";

/** A car taken from the traffic is vehicle TRAFFIC_ID + its number. */
export const TRAFFIC_ID = 100000;
/** A parked car knocked out of the street furniture is car PARKED + its vehicle number in the traffic. */
export const PARKED = 2 ** 45;
/** A road's traffic, vehicles a day, where the DfT haven't counted it: by the kind of road it is. */
const FLOW: Record<string, number> = { trunk: 20000, primary: 14000, secondary: 8000, tertiary: 4000, unclassified: 700, residential: 400, living_street: 150 };
const SIREN_HEARD = 70;              // a siren this near (m) and it pulls over
const COUNTED = 35;                  // a count point this near a road (m) is that road's
const SPEED: Record<string, number> = { trunk: 13, primary: 13, secondary: 13, tertiary: 12, residential: 9, unclassified: 8, living_street: 5 };   // m/s: 30 mph, 20 mph
const WIDTH: Record<string, number> = { trunk: 9, primary: 8.5, secondary: 8, tertiary: 7, residential: 6, unclassified: 5.5, living_street: 5 }; // as world.ts draws them
const MAX = typeof navigator !== "undefined" && navigator.maxTouchPoints > 1 ? 24 : 40;   // cars about at once, in all (fewer on a phone or iPad)
const FEWEST = 3;                    // round each player, however quiet the roads
/** The share of a day's traffic in each hour (UK roads, as the DfT's counts have it), on a weekday and at the weekend. */
const WEEKDAY = [0.8, 0.5, 0.4, 0.4, 0.6, 1.5, 3.5, 6.5, 7.5, 6, 5.5, 5.7, 6, 6, 6.2, 7, 7.8, 8, 6.5, 4.8, 3.6, 2.9, 2.2, 1.5];
const WEEKEND = [1.4, 1, 0.7, 0.5, 0.5, 0.7, 1.2, 2, 3.5, 5, 6.5, 7.5, 8, 8, 7.5, 7, 6.8, 6.3, 5.5, 4.5, 3.8, 3, 2.5, 2];
const CELL = 100;                    // the roads are filed in squares this size, to find ones near the players quickly
const NEAR = 70, FAR = 220, GONE = 320;   // spawn between NEAR and FAR from the nearest player; gone past GONE
const HL = 2.08, HW = 0.88, CAR_H = 1.44;   // a car's half length, half width and height (a coach's are its own: coaches.ts)
const WB = 2.6;                      // wheelbase: the front wheels turn, and the back ones follow them round
const LOCK = 0.6;                    // full lock, radians
const TURN_R = WB / Math.tan(LOCK);  // the tightest circle it can turn (m, about the back axle)
const SHUNT = 2.5;                   // m each way, back and forth, in a turn in the road
const SHUNT_V = 1.6;                 // m/s, doing it
const ACCEL = 2.5, BRAKE = 7;
const DELAY = 110;                   // ms behind the host, as for other players
const STRIDE = 6;                    // numbers per car in a snapshot
export const CAR_MASS = 0.4;                // how heavy one is against a car you're driving (light, so you plough through)
const BOUNCE = 0.3;                  // how much two of them bounce apart
const ALONG = [-(HL - HW), 0, HL - HW];   // circles along a car, for bumping into things once it's a wreck
const COACH_MASS = 2.2;                    // a coach is a lot heavier: drive into one and you come off worse
export const KNOCK = 2.5;                   // a knock softer than this (m/s) and it shrugs it off and drives on
const TRIP = 6;                      // a knock side-on harder than this (m/s) trips it over its wheels
const BLAST = 9;                     // how far a car going up throws the rest of the traffic about, m
const BURN = 12;                     // seconds it burns after going up
const CHAR = "#2a2725";              // what's left of the paint
/** Its lamps, in the frame it rolls over in (whose middle is half its height up). */
const down = ([a, u, c, w, h]: LampPair): LampPair => [a, u - CAR_H / 2, c, w, h];
const LAMPS: Lamps = { front: down(CAR_LAMPS.front), back: down(CAR_LAMPS.back!) };
const COACH_DOWN = ([a, u, c, w, h]: LampPair): LampPair => [a, u - COACH.H[0] / 2, c, w, h];
const COACH_LIT: Lamps = { front: COACH_DOWN(COACH_LAMPS.front), back: COACH_DOWN(COACH_LAMPS.back!) };
const GUESS_HOLD = 300, GUESS_END = 800;   // ms: how long to trust our own idea of where we knocked one, then hand back to the host's

interface Edge { a: number; b: number; len: number; v: number; lane: number; room: number; kerb: number; dx: number; dz: number; back?: Edge;
  /** The road it's part of (Traffic.roads), and how many vehicles a day it carries. */
  road: number; flow: number;
  /** Part of a roundabout: those coming on to it give way to whoever's already going round. */
  ring?: boolean;
  /** The way round a roundabout against the clock, taken out: nothing uses it. */
  dead?: boolean }
interface Node { x: number; z: number; out: Edge[] }
interface Snap { t: number; x: number; z: number; a: number; v: number }
/** Something sliding about off its wheels' line: a wreck, or our guess at where we've just knocked one. */
interface Tumbling { x: number; z: number; a: number; y: number; vx: number; vz: number; spin: number; roll: number; rollV: number; lift: number; liftV: number }
const ease = (v: number, by: number) => (Math.abs(v) <= by ? 0 : v - Math.sign(v) * by);
const turnTo = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
/** Someone or something in the road: where, and how far it reaches either way. */
export interface Obstacle { x: number; z: number; r: number; id?: string; person?: boolean; parked?: boolean; a?: number;
  /** Another car in the traffic, pulled out round something parked and coming the other way. */
  passing?: boolean }

/** Its lane's offset from the road's middle where stretch d1 meets d2. Left of d (scene coords: x east,
 * z south) is (dz, -dx); where two stretches meet, the lane bends along the line halfway between them. */
function miter(d1: Edge, d2: Edge): number[] {
  const mx = d1.dz + d2.dz, mz = -d1.dx - d2.dx, m = Math.hypot(mx, mz);
  if (m < 0.3) return [d2.dz * d2.lane, -d2.dx * d2.lane];
  const k = d2.lane / Math.max(0.5, (mx * d2.dz - mz * d2.dx) / m) / m;
  return [mx * k, mz * k];
}

/** A path's stretches, worked out once for all the things measured against it: for each, its start,
 *  its direction, its length, how far along the path it starts, and whether it's the first (which
 *  reaches on back behind the start). */
function stretches(path: number[][]): number[] {
  const out: number[] = [];
  let run = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    const [ax, az] = path[k], [bx, bz] = path[k + 1], len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    out.push(ax, az, (bx - ax) / len, (bz - az) / len, len, run, k);
    run += len;
  }
  return out;
}

/** Where (x, z) is against a path (as stretches gives it): how far along it (negative behind the
 *  start), and how far to its left. */
function project(s: number[], x: number, z: number): [number, number] {
  let best = Infinity, u = 0, w = 0;
  for (let i = 0; i < s.length; i += 7) {
    const ax = s[i], az = s[i + 1], sx = s[i + 2], sz = s[i + 3], len = s[i + 4];
    let t = (x - ax) * sx + (z - az) * sz;
    if (s[i + 6] > 0 || t > 0) t = Math.min(len, Math.max(0, t));
    const ox = x - (ax + sx * t), oz = z - (az + sz * t), d = ox * ox + oz * oz;
    if (d < best) { best = d; u = s[i + 5] + t; w = ox * sz - oz * sx; }
  }
  return [u, w];
}

/**
 * Knock something by (dvx, dvz) m/s and spin it: caught side-on hard enough, it trips over its wheels
 * and rolls over the way it was hit, up off the ground; a big enough knock end-on just bounces it.
 */
function knock(w: Tumbling, dvx: number, dvz: number, spin: number) {
  w.vx += dvx; w.vz += dvz;
  w.spin = Math.max(-6, Math.min(6, w.spin + spin));
  const across = dvx * Math.sin(w.a) + dvz * Math.cos(w.a), hard = Math.abs(across);
  if (hard > TRIP) {
    w.rollV = Math.max(-14, Math.min(14, w.rollV + Math.sign(across) * (hard - TRIP * 0.5) * 1.2));
    w.liftV = Math.max(w.liftV, Math.min(4.5, 0.8 + hard * 0.25));
  } else if (Math.hypot(dvx, dvz) > 10) w.liftV = Math.max(w.liftV, 1.2);
}

class Car implements Mover {
  x = 0; z = 0; a = 0; y = 0; top = 0; waist = 0;
  readonly hl: number; readonly hw: number;
  readonly h: number;                // how tall it is
  readonly along: number[];          // circles along it, for bumping into things once it's a wreck
  readonly coach: boolean;           // one of Arleen's coaches, not a car
  v = 0;
  horn = false;
  /** 0 ticking over .. 1 flat out, for the engine's note. */
  rpm = 0.2;
  gas = 0;
  // the host's: where it is on the roads
  e!: Edge; prev: Edge | null = null; s = 0;
  route: Edge[] = [];                // the roads it'll take after this one, 40 m or so ahead
  get next() { return this.route[0]; }
  // knocked off the road by someone driving into it: sliding, spinning, maybe rolling over, and not driving any more
  wreck = false;
  vx = 0; vz = 0;                    // which way it's going, m/s (scene coords)
  readonly mass: number;
  spin = 0;                          // how fast it's spinning round, rad/s (+ is left)
  roll = 0; rollV = 0;               // how far it's rolled over about its length (0 on its wheels, π on its roof), and how fast
  lift = 0; liftV = 0;               // how far off the ground, m, and how fast it's going up
  fire = 0;                          // 0 not alight, 1 alight and about to go up, 2 gone up
  fuse = 0;                          // host: seconds till it goes up
  burnT = 0;                         // seconds of flames left after it's gone up
  by = "";                           // host: who knocked it over, for whoever the blast catches
  wv = [0, 0, 0, 0];                 // the host's word on a wreck: vx, vz, roll, lift
  guess: (Tumbling & { t: number }) | null = null;   // where we've just knocked it, before the host's word comes back
  flames: THREE.Group | null = null;
  smokeT = 0;
  blockT = 0;
  stuckT = 0;                        // how long it's been stood still
  leg = 0;                           // in a turn in the road: 1 going forward, -1 backing up, 0 not
  legLeft = 0;                       // and how far yet on this leg
  legSide = 1;                       // and which way it's turning round: 1 left, -1 right (kept to, so it doesn't dither when its way on is right behind it)
  lost = false;                      // its way on is somewhere it can't drive straight to: slowing for a turn in the road
  sigs: Signal[] = [];               // the traffic lights round about (looked for with the parked cars)
  ringFrom = -1;                     // where it came on to the roundabout it's going round (a node)
  dodge = 0;                         // how far out from its lane it's pulled, to get past something parked
  parked: Obstacle[] = []; parkedT = 0;   // the cars parked near it, and when to look again
  hits = new Map<string, number>();
  // everyone's
  snaps: Snap[] = [];
  readonly root = new THREE.Group();
  readonly tumble = new THREE.Group();   // the car itself, rolling over about its middle
  readonly wheels: THREE.Mesh[];     // the front wheels, turned with the steering
  readonly mat: THREE.MeshLambertMaterial;
  steer = 0;                         // the front wheels' angle, radians, + is left
  pv = 0;                            // its speed a frame ago, to see it slowing
  brakeT = 0;                        // its brake lights stay on this long yet (headlights.ts)
  pa: number | null = null;          // its heading a frame ago, for how hard it's turning
  rolled = 0;
  constructor(readonly n: number, readonly paint: number, readonly make = trafficMake(n)) {
    this.coach = isCoachMake(make);
    const style = make === PARAMOUNT ? 0 : 1, H = this.coach ? COACH.H[style] : CAR_H;
    this.hl = this.coach ? COACH.L / 2 : HL; this.hw = this.coach ? COACH.W / 2 : HW; this.h = H;
    this.along = this.coach ? [-4.75, -2.4, 0, 2.4, 4.75] : ALONG;
    this.mass = this.coach ? COACH_MASS : CAR_MASS;
    const car = this.coach ? coachSteerable(style) : carSteerable(carShape(make)), mat = (this.mat = glossy(new THREE.MeshLambertMaterial({ vertexColors: true, color: paintFor(make, paint) })));
    const body = new THREE.Mesh(car.body, mat);
    body.castShadow = true; body.receiveShadow = true;
    body.position.y = -H / 2;
    this.tumble.position.y = H / 2;
    this.tumble.add(body);
    if (this.coach) { const decals = coachDecals(style); decals.position.y = -H / 2; this.tumble.add(decals); }
    this.wheels = car.wheels.map((w) => { const m = new THREE.Mesh(w.geo, mat); m.position.set(w.x, w.y - H / 2, w.z); m.rotation.order = "YZX"; m.castShadow = true; return m; });
    this.tumble.add(...this.wheels);
    this.root.add(this.tumble);
  }
  get name() { return MAKES[this.make]; }
  dispose() { this.mat.dispose(); }
}

// flames, shared by every car that's alight
let flameGeo: THREE.BufferGeometry | null = null;
let flameMats: THREE.Material[] = [];
function flames(): THREE.Group {
  flameGeo ??= new THREE.ConeGeometry(0.34, 1, 6).translate(0, 0.5, 0);
  if (!flameMats.length) flameMats = ["#ff6a14", "#ffb22e", "#ff8a1e"].map((color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  const g = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    const m = new THREE.Mesh(flameGeo, flameMats[k % flameMats.length]);
    m.position.set(-1.4 + (k / 5) * 2.8, 0.25, (k % 2 ? 0.35 : -0.35));
    g.add(m);
  }
  return g;
}

/** "10:00-18:00" as hours of the day [10, 18] ("00:00-24:00": all day, a street only buses may use); undefined if it isn't shut. */
function shutHours(tc?: string): [number, number] | undefined {
  const m = tc?.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  return m ? [+m[1] + +m[2] / 60, +m[3] + +m[4] / 60] : undefined;
}

export class Traffic {
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private cars = new Map<number, Car>();
  private cells = new Map<number, Edge[]>();
  /** Every road the traffic uses (as the map has it), its kind and name, and the traffic it carries once the counts are in. */
  private roads: { c: string; n: string; p: number[][]; flow: number; shut?: [number, number] }[] = [];
  private serial = 1 + Math.floor(Math.random() * 1e6) * 1000;   // a new host's numbers don't clash with the last one's

  constructor(private map: GameMap, private scene: THREE.Scene, private ground: (x: number, z: number, y?: number) => number) {
    // the road network: every mapped road a car can use, joined where their points meet
    const ids = new Map<string, number>();
    const node = (p: number[]) => {
      const k = `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;
      let i = ids.get(k);
      if (i === undefined) { i = this.nodes.length; ids.set(k, i); this.nodes.push({ x: p[0], z: -p[1], out: [] }); }
      return i;
    };
    // the wider map's streets carry on from the edge of Combe Down's (where one's left hanging at
    // the edge, it's joined to the nearest end across the seam)
    for (const r of [...map.d.rd, ...map.wide?.rd ?? []]) {
      const v = SPEED[r.c];
      if (!v || r.p.length < 2) continue;
      const road = this.roads.length, flow = FLOW[r.c] ?? 400;
      this.roads.push({ c: r.c, n: r.n ?? "", p: r.p, flow, shut: shutHours(r.tc) });
      const lane = Math.min(2, Math.max(1.2, (WIDTH[r.c] ?? 6) / 4));
      // how far it can pull out from its lane: up to the far kerb, and a wheel on the pavement
      let room = lane + (WIDTH[r.c] ?? 6) / 2 - HW + 0.3;
      // (on a bridge, no further than the middle of the other lane: past that it'd be through the parapet, or off the deck)
      if (r.bridge) room = Math.min(room, 2 * lane);
      // and how far in toward the kerb, to let someone by
      const kerb = Math.max(0, (WIDTH[r.c] ?? 6) / 2 - lane - HW + 0.3);
      // a one-way street only goes its way (ow: 1 with the points, -1 against them)
      for (let k = 0; k + 1 < r.p.length; k++) {
        const a = node(r.p[k]), b = node(r.p[k + 1]);
        if (a === b || this.nodes[a].out.some((e) => e.b === b)) continue;
        const A = this.nodes[a], B = this.nodes[b], len = Math.hypot(B.x - A.x, B.z - A.z);
        const there: Edge = { a, b, len, v, lane, room, kerb, dx: (B.x - A.x) / len, dz: (B.z - A.z) / len, road, flow };
        const back: Edge = { a: b, b: a, len, v, lane, room, kerb, dx: -there.dx, dz: -there.dz, back: there, road, flow };
        if (r.ow === 1) { A.out.push(there); this.edges.push(there); }
        else if (r.ow === -1) { back.back = undefined; B.out.push(back); this.edges.push(back); }
        else { there.back = back; A.out.push(there); B.out.push(back); this.edges.push(there, back); }
      }
    }
    // the dead ends: points only one other point is joined to, whichever way. (On a one-way street
    // every point has just the one way out, so counting ways out would take the whole street for
    // dead ends and join its points up both ways, a stretch you could drive the wrong way.)
    const into: Edge[][] = this.nodes.map(() => []);
    for (const e of this.edges) into[e.b].push(e);
    const near = this.nodes.map((n, i) => new Set([...n.out.map((e) => e.b), ...into[i].map((e) => e.a)]));
    // whether traffic can come in to a point, and go on out of it, before any joins: a join goes only
    // the way its roads let traffic through (off the end of a one-way street, on to the start of one)
    const comes = into.map((es) => es.length > 0), goes = this.nodes.map((n) => n.out.length > 0);
    const ends = this.nodes.map((_, i) => i).filter((i) => near[i].size === 1);
    const joined = new Set<number>();
    const join = (i: number, j: number, d: number) => {
      const A = this.nodes[i], B = this.nodes[j], e = A.out[0] ?? into[i][0], len = Math.max(0.1, d);
      const fwd = comes[i] && goes[j], rev = comes[j] && goes[i];
      if (!fwd && !rev) return false;
      const there: Edge = { a: i, b: j, len, v: e.v, lane: e.lane, room: e.room, kerb: e.kerb, dx: (B.x - A.x) / len || e.dx, dz: (B.z - A.z) / len || e.dz, road: e.road, flow: e.flow };
      const back: Edge = { ...there, a: j, b: i, dx: -there.dx, dz: -there.dz };
      if (fwd && rev) { there.back = back; back.back = there; }
      if (fwd) { A.out.push(there); this.edges.push(there); }
      if (rev) { B.out.push(back); this.edges.push(back); }
      near[i].add(j); near[j].add(i);
      return true;
    };
    // dead ends right by another dead end (where the two maps meet): joined
    const endCells = new Map<string, number[]>();
    for (const i of ends) { const k = `${Math.floor(this.nodes[i].x / 4)},${Math.floor(this.nodes[i].z / 4)}`; (endCells.get(k) ?? endCells.set(k, []).get(k)!).push(i); }
    for (const i of ends) {
      const A = this.nodes[i];
      if (joined.has(i)) continue;
      let best = -1, bd = 2.5;
      for (let ci = Math.floor(A.x / 4) - 1; ci <= Math.floor(A.x / 4) + 1; ci++) for (let cj = Math.floor(A.z / 4) - 1; cj <= Math.floor(A.z / 4) + 1; cj++)
        for (const j of endCells.get(`${ci},${cj}`) ?? []) {
          const d = Math.hypot(this.nodes[j].x - A.x, this.nodes[j].z - A.z);
          if (j !== i && !joined.has(j) && !near[i].has(j) && d < bd && ((comes[i] && goes[j]) || (comes[j] && goes[i]))) { bd = d; best = j; }
        }
      if (best >= 0 && join(i, best, bd)) { joined.add(i); joined.add(best); }
    }
    // and a dead end that stops just short of a point on another road (the top of Prior Park Road,
    // where Ralph Allen Drive comes in a hand's width off it): joined on to it
    const all = new Map<string, number[]>();
    this.nodes.forEach((n, i) => { const k = `${Math.floor(n.x / 4)},${Math.floor(n.z / 4)}`; (all.get(k) ?? all.set(k, []).get(k)!).push(i); });
    for (const i of ends) {
      const A = this.nodes[i];
      if (joined.has(i)) continue;
      let best = -1, bd = 1.2;
      for (let ci = Math.floor(A.x / 4) - 1; ci <= Math.floor(A.x / 4) + 1; ci++) for (let cj = Math.floor(A.z / 4) - 1; cj <= Math.floor(A.z / 4) + 1; cj++)
        for (const j of all.get(`${ci},${cj}`) ?? []) {
          const d = Math.hypot(this.nodes[j].x - A.x, this.nodes[j].z - A.z);
          if (j !== i && d < bd && !near[i].has(j) && ((comes[i] && goes[j]) || (comes[j] && goes[i]))) { bd = d; best = j; }
        }
      if (best >= 0 && join(i, best, bd)) { joined.add(i); joined.add(best); }
    }
    // filed by the square each stretch's middle is in
    for (const e of this.edges) {
      const A = this.nodes[e.a], k = this.cell(A.x + e.dx * e.len / 2, A.z + e.dz * e.len / 2);
      (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(e);
    }
    if (map.d.id) void this.loadFlows(map.d.id);
    this.findRoundabouts();
  }

  /**
   * The roundabouts: short rings of road that come right round to where they started, small (Bath's are
   * all within about 35 m of their middles, a mini-roundabout a few metres; a block of one-way streets
   * in town, which comes round too, is 40 m and more across) and with at least three roads joining (a
   * cul-de-sac's turning loop has one). Their traffic goes round one way, clockwise, as in Britain:
   * where the map hasn't marked one as one way, the way round against the clock is taken out. Those
   * coming on give way to whoever's already going round.
   */
  private findRoundabouts() {
    // (clockwise seen from above is a turn to the right, which here, with z to the south, is +)
    const turnOf = (a: Edge, b: Edge) => Math.atan2(a.dx * b.dz - a.dz * b.dx, a.dx * b.dx + a.dz * b.dz);
    const into = new Map<number, Edge[]>();   // what comes in to each node
    for (const e of this.edges) (into.get(e.b) ?? into.set(e.b, []).get(e.b)!).push(e);
    for (const e of this.edges) {
      if (e.ring || e.dead) continue;
      for (const way of [1, -1]) {
        // round it goes, the sharpest turn on that's the way it's going round, short of doubling back (an exit
        // turns off the other way; the map's coarse curves can wiggle a little the wrong way, which is allowed)
        const ring = [e];
        let at = e, len = e.len, turned = 0, closed = false;
        // (by length, not stretches: a big one like the Globe on the Bristol Road is drawn in forty-odd short ones)
        while (ring.length < 200 && len < 230) {
          const on = this.nodes[at.b].out.filter((o) => o.b !== at.a && !o.dead && turnOf(at, o) * way > -0.25 && turnOf(at, o) * way < 2.8);
          if (!on.length) break;
          const next = on.reduce((b, o) => (turnOf(at, o) * way > turnOf(at, b) * way ? o : b));
          turned += turnOf(at, next);
          if (next === e) { closed = true; break; }
          if (ring.includes(next)) break;
          ring.push(next); len += next.len; at = next;
        }
        if (!closed || Math.abs(turned) < 5) continue;
        const xs = ring.map((r) => this.nodes[r.a]), mx = xs.reduce((t, n) => t + n.x, 0) / xs.length, mz = xs.reduce((t, n) => t + n.z, 0) / xs.length;
        if (!xs.every((n) => Math.hypot(n.x - mx, n.z - mz) < 36)) continue;
        // and round, not a triangle or a square: on a circle the middle of each stretch is nearly as far from the
        // middle as its ends, where a triangle's sides (a little island where a side road meets a main one) pass
        // in at half that. One the map marks as one way all round is a roundabout whatever its drawing (often
        // coarse) looks like.
        const R = xs.reduce((t, n) => t + Math.hypot(n.x - mx, n.z - mz), 0) / xs.length, marked = ring.every((r) => !r.back);
        if (!marked && !ring.every((r) => Math.hypot(this.nodes[r.a].x + r.dx * r.len / 2 - mx, this.nodes[r.a].z + r.dz * r.len / 2 - mz) > 0.75 * R)) continue;
        const on = new Set(ring.flatMap((r) => (r.back ? [r, r.back] : [r])));
        // (a road joining it, whether it leads off it, on to it, or both)
        const arms = ring.filter((r) => this.nodes[r.a].out.some((o) => !on.has(o) && !o.dead) || (into.get(r.a) ?? []).some((o) => !on.has(o) && !o.dead)).length;
        if (arms < (marked ? 2 : 3)) continue;
        // round the right way: clockwise, unless the map says it's one way the other (as it's drawn, it goes)
        // (walked against the clock with some of it marked one way this way round: the map has it going this way after all)
        if (!marked && turned < 0 && ring.some((r) => !r.back)) continue;
        const round = marked || turned > 0 ? ring : ring.map((r) => r.back!);
        for (const r of round) {
          r.ring = true;
          const twin = r.back;
          if (!twin) continue;
          twin.dead = true;   // no going round the other way
          const out = this.nodes[twin.a].out;
          out.splice(out.indexOf(twin), 1);
          r.back = undefined;
        }
        break;
      }
    }
  }


  /** How busy each road really is: the DfT's counts (tools/traffic_counts.py), each given to the road it's
   *  on, and to the rest of that road by name; the roads nobody's counted keep their kind's (FLOW). */
  private async loadFlows(id: string) {
    let pts: [number, number, number, string][];
    try { pts = (await (await fetch(`${import.meta.env.BASE_URL}maps/${id}-traffic.json`)).json()).points; } catch { return; }
    if (!Array.isArray(pts) || !pts.length) return;
    const counted = new Map<number, number[]>(), named = new Map<string, number[]>();
    for (const [x, y, flow] of pts) {
      let best = -1, bd = COUNTED;
      this.roads.forEach((r, i) => {
        for (let k = 0; k + 1 < r.p.length; k++) {
          const [ax, ay] = r.p[k], [bx, by] = r.p[k + 1];
          if (Math.min(ax, bx) - x > bd || x - Math.max(ax, bx) > bd || Math.min(ay, by) - y > bd || y - Math.max(ay, by) > bd) continue;
          const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1, f = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2));
          const d = Math.hypot(x - ax - vx * f, y - ay - vy * f);
          if (d < bd) { bd = d; best = i; }
        }
      });
      if (best < 0) continue;
      (counted.get(best) ?? counted.set(best, []).get(best)!).push(flow);
      const n = this.roads[best].n;
      if (n) (named.get(n) ?? named.set(n, []).get(n)!).push(flow);
    }
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    this.roads.forEach((r, i) => {
      const own = counted.get(i), byName = r.n ? named.get(r.n) : undefined;
      if (own) r.flow = mean(own); else if (byName) r.flow = mean(byName);
    });
    for (const e of this.edges) e.flow = this.roads[e.road].flow;
  }

  private cell(x: number, z: number) { return (Math.floor(x / CELL) + 4096) * 8192 + Math.floor(z / CELL) + 4096; }

  get list(): Iterable<Car> { return this.cars.values(); }

  /** The cars driving along with their lights on (not the wrecks), for headlights.ts. */
  lit(out: Lit[]) {
    for (const c of this.cars.values()) if (!c.wreck && !c.fire && !c.guess) out.push({ frame: c.tumble, lamps: c.coach ? COACH_LIT : LAMPS, brake: c.brakeT > 0, reverse: c.v < -0.2 });
  }

  /** Everyone: a car's gone up at (x, y, z); one's landed (or hit another) with a crunch, force 0..1; smoke coming off one that's alight (or burnt out). */
  onBoom?: (x: number, y: number, z: number) => void;
  onCrunch?: (x: number, y: number, z: number, force: number) => void;
  onSmoke?: (x: number, y: number, z: number, alight: boolean) => void;
  /** Everyone but the host: parked car i (a vehicle number) has been knocked into the road, so it's to come out of the street furniture. */
  onUnpark?: (i: number) => void;
  /** Host: the police cars going with their sirens on (game.ts sets them each frame). */
  sirens: Siren[] = [];
  /** The make of parked car i (a vehicle number), for one knocked into the road (makes.ts). */
  parkedMake: (i: number) => number = () => 0;

  // ---- the host: driving them ------------------------------------------------------------------
  /** Drive them all for dt. players: everyone's whereabouts, for where to put cars; things: what's in the road;
   * hit: someone on foot it's run over, at speed v (m/s); blast: one's gone up at (x, y, z), knocked over by player by. */
  simulate(dt: number, players: { x: number; z: number }[], things: Obstacle[], hit: (id: string, v: number) => void,
    blast: (x: number, y: number, z: number, by: string) => void) {
    const nearest = (x: number, z: number) => players.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.z - z)), Infinity);
    // gone once everyone's far away, or once it's been stuck (or lying wrecked) a good while with nobody near enough to see it go
    for (const c of [...this.cars.values()]) if (nearest(c.x, c.z) > GONE || (c.stuckT > (c.wreck ? 45 : 20) && nearest(c.x, c.z) > 40)) this.drop(c.n);
    // a new one round whoever has fewest, so everyone has traffic wherever they are (the wrecks don't count, up to a point)
    const wrecks = [...this.cars.values()].filter((c) => c.wreck).length;
    if (this.cars.size - wrecks < MAX && this.cars.size < MAX + 10 && players.length && this.edges.length) {
      const round = players.map(() => 0);
      for (const c of this.cars.values()) {
        if (c.wreck) continue;
        let k = 0;
        players.forEach((p, j) => { if (Math.hypot(p.x - c.x, p.z - c.z) < Math.hypot(players[k].x - c.x, players[k].z - c.z)) k = j; });
        round[k]++;
      }
      // as many round each player as the roads near them really carry at this time of day (as far as there's room)
      const want = players.map((p, j) => Math.max(FEWEST, Math.min(Math.floor(MAX / players.length), this.expected(p, j))));
      let k = 0;
      round.forEach((n, j) => { if (want[j] - n > want[k] - round[k]) k = j; });
      if (round[k] < want[k]) this.spawn(players[k], nearest);
    }
    const now = performance.now();
    for (const c of [...this.cars.values()]) if (!c.e && !c.wreck) this.drop(c.n);   // the last host's: we don't know their roads (a wreck needs none)
    for (const c of this.cars.values()) {
      if (c.wreck) { this.crashing(c, dt, blast); continue; }
      const e = c.e;
      // as fast as the road allows, slowing in time for the next corner
      const turn = Math.acos(Math.max(-1, Math.min(1, e.dx * c.next.dx + e.dz * c.next.dz)));
      const corner = turn < 0.35 ? e.v : Math.max(2.5, Math.min(e.v, 11 * (1 - turn / Math.PI)));
      let want = Math.min(e.v, Math.sqrt(corner * corner + 2 * 3.5 * Math.max(0, e.len - c.s)));
      // and stopping for anything in its lane ahead
      let blocked = false, dodge = 0, committed = 0, squeeze = false, queued = false;   // (queued: held up behind a car going its way)
      const obstacles: Obstacle[] = things.filter((o) => Math.abs(o.x - c.x) < 60 && Math.abs(o.z - c.z) < 60);   // (only what's near enough to matter)
      // (a wreck in the road is pulled round, like something parked)
      for (const o of this.cars.values()) if (o !== c) obstacles.push({ x: o.x, z: o.z, r: o.hl, a: o.a, parked: o.wreck, passing: !o.wreck && o.dodge > 0.5 && Math.cos(o.a - c.a) < -0.5 });
      // the cars parked round about (looked for a few times a second, not every frame)
      if ((c.parkedT -= dt) <= 0) {
        c.parkedT = 0.4;
        c.parked = this.map.parkedNear(c.x, c.z, 48).map((p) => ({ x: p.x, z: p.z, r: 2.05, parked: true, a: p.a }));
        c.sigs = [this.map, ...this.map.tilesNear(c.x, c.z, 80)].flatMap((m) => signalsOf(m)).filter((g) => Math.abs(g.x - c.x) < 70 && Math.abs(g.z - c.z) < 70);
      }
      obstacles.push(...c.parked);
      const path = stretches(this.lanePath(c));
      // how far out to the side something parked reaches, turned as it is against the way we're going
      const side = (o: Obstacle) => o.a === undefined ? Math.min(o.r, 1.2) : Math.abs(Math.sin(o.a - c.a)) * o.r + Math.abs(Math.cos(o.a - c.a)) * 0.9;
      const seen = obstacles.map((o) => { const [u, w] = project(path, o.x, o.z); return [u, w, o] as [number, number, Obstacle]; });
      // how far out it can pull: not past the far kerb, nor into anything on its right
      let room = e.room;
      // (anything coming the other way, further off: it's closing)
      for (const [u, w, o] of seen) if (w < -0.6 && u > -c.hl - o.r && u < (o.a !== undefined && !o.parked ? 45 : 25)) room = Math.min(room, -w - c.hw - side(o) - 0.4);
      for (const [u, w, o] of seen) {
        // u: how far along its way it is; w: how far to the left of its lane
        // something parked on our side: pull out round it, if there's room (slowing up behind it till it's out far enough)
        if (o.parked && u > -c.hl - o.r && u < 25 && w > -0.6) {
          const need = c.hw + side(o) + 0.4 - w;
          // already out and going past it: stay out, whatever's coming
          if (c.dodge >= need - 0.1 && u < c.hl + o.r + 2) { committed = Math.max(committed, need); continue; }
          // part way out and too close to stop: don't pull back in
          if (u < c.hl + o.r + 2 + (c.v * c.v) / 10) committed = Math.max(committed, Math.min(c.dodge, need));
          if (need <= room) { dodge = Math.max(dodge, need); if (c.dodge >= need - 0.1) continue; }
        }
        // someone coming the other way round something parked on their side: tuck in to let them by
        if (o.passing && u > 0 && u < 25) squeeze = true;
        if (u <= 0 || u > 30 || Math.abs(w + c.dodge) > c.hw + side(o) + (o.passing ? 0.15 : 0.3)) continue;
        // nose to nose with another car for ages: someone has to give, so squeeze by
        if (c.stuckT > 6 && o.a !== undefined && !o.parked && !o.id && Math.cos(o.a - c.a) < -0.5) continue;
        const gap = u - c.hl - o.r - 1.5;
        const ok = Math.sqrt(Math.max(0, 2 * 5 * gap));
        if (ok < want) { want = ok; if (ok < 1 && o.id) blocked = true; queued = !o.parked && o.a !== undefined && Math.cos(o.a - c.a) > 0.5; }
      }
      // the traffic lights ahead on its way: stop at the line at red, or red and amber, and at amber if it can stop in time
      let held = false;
      if (c.sigs.length) {
        const t = signalClock(), hx = Math.cos(c.a), hz = -Math.sin(c.a);
        for (const g of c.sigs) {
          const along = hx * g.ux + hz * g.uz;
          if (Math.abs(along) < 0.7) continue;   // a street across its way: not its lights
          // the stop line, before the lights on its side of the street (as furniture.ts paints it)
          const line = (g.crossing ? 3 : 2) * (along > 0 ? 1 : -1), [u, w] = project(path, g.x - g.ux * line, g.z - g.uz * line);
          if (u < c.hl || u > 60 || Math.abs(w) > g.half + 2) continue;   // already over it, too far off, or not on its street
          const light = lightAt(g, t);
          if (light === GREEN) continue;
          const gap = u - c.hl - 0.6;
          if (light === AMBER && (c.v * c.v) / (2 * 6) > gap) continue;   // too close to stop: on through
          const ok = Math.sqrt(2 * 5 * Math.max(0, gap));
          if (ok < want) { want = ok; held = true; }
        }
      }
      // coming up to a roundabout: give way to anything already on it coming round towards here, waiting at the line till it's clear
      const onto = c.route[0];
      if (onto?.ring && !c.e.ring) {
        const node = c.e.b, B = this.nodes[node], line = c.e.len - c.s - c.hl - 4;   // (the give-way line, short of the ring)
        if (line > -1.5 && line < 35) {
          for (const o of this.cars.values()) {
            if (o === c || o.wreck || !o.e?.ring || Math.hypot(o.x - B.x, o.z - B.z) > 25) continue;
            // round towards this entry: on the stretch of ring that comes to it, or the one before that, or only just past it
            const coming = o.e.b === node || o.route[0]?.b === node || (o.e.a === node && o.s < 5);
            if (!coming) continue;
            const ok = Math.sqrt(2 * 5 * Math.max(0, line));
            if (ok < want) { want = ok; held = true; }
            break;
          }
        }
      }
      // its way on is somewhere it can't drive straight to: slow right down for a turn in the road
      if (c.lost && !c.leg) want = Math.min(want, 2);
      dodge = Math.max(0, committed, Math.min(dodge, room));
      if (squeeze && !dodge) dodge = -e.kerb;
      // a siren coming: in to the kerb and stop (not on a roundabout, nor in the middle of a turn in
      // the road), or just stop where it is if there's something parked alongside
      if (!c.leg && !e.ring && this.pullOver(c)) {
        const beside = seen.some(([u, w, o]) => o.parked && u > -c.hl - o.r - 1 && u < c.hl + o.r + 4 && w > -0.6);
        dodge = beside || committed ? committed : -e.kerb;
        want = Math.min(want, beside || c.dodge < dodge + 0.3 ? 0 : 4);
        held = true;
      }
      c.dodge += Math.max(-1.5 * dt, Math.min(1.5 * dt, dodge - c.dodge));
      c.blockT = blocked ? c.blockT + dt : 0;
      // (not while it waits at the lights, or in the queue behind a car going its way, or turns in the road)
      c.stuckT = Math.abs(c.v) < 0.3 && !held && !(queued && want < 1) && !c.leg ? c.stuckT + dt : 0;
      // stuck a good while behind something that isn't going to move: turn round in the road and go back
      if (c.stuckT > 8 && !blocked && c.e.back) {
        const lane = c.e.lane, d = c.dodge;
        c.e = c.e.back; c.s = c.e.len - c.s; c.prev = null; c.route = [];
        this.plan(c);
        c.dodge = 2 * lane - d;   // from where it was, over to its new lane (behind it now: steerAlong turns it round)
        c.stuckT = 0;
      }
      c.horn = c.blockT > 1.2 && c.blockT % 2.5 < 0.7;
      // in a turn in the road it creeps back and forth; otherwise only ever forwards
      if (c.leg) want = c.leg * SHUNT_V;
      const dv = want - c.v;
      c.v += Math.max(-BRAKE * dt, Math.min(ACCEL * dt, dv));
      if (!c.leg) c.v = Math.max(0, c.v);
      c.gas = Math.abs(want) > Math.abs(c.v) + 0.2 ? 1 : 0;
      // along the road, onto the next one at the end
      this.steerAlong(c, dt);
      while (c.s >= c.e.len) {
        c.s -= c.e.len;
        c.prev = c.e; c.e = c.route.shift()!;
        this.plan(c);
      }
      c.vx = c.v * Math.cos(c.a); c.vz = -c.v * Math.sin(c.a);
      // anyone it hits on foot goes under
      if (c.v > 3) {
        const gx = Math.cos(c.a), gz = -Math.sin(c.a);
        for (const o of things) {
          if (!o.person || !o.id) continue;
          const dx = o.x - c.x, dz = o.z - c.z, u = dx * gx + dz * gz, w = -dx * gz + dz * gx;
          if (Math.abs(u) > c.hl + 0.3 || Math.abs(w) > c.hw + 0.3 || now - (c.hits.get(o.id) ?? -1e9) < 1500) continue;
          c.hits.set(o.id, now);
          hit(o.id, c.v);
          c.v *= 0.8;
        }
      }
    }
  }

  /** Should it pull over for a siren: one near that's behind it, or coming at it, or right alongside,
   *  rather than gone past and on its way? */
  private pullOver(c: Car): boolean {
    const hx = Math.cos(c.a), hz = -Math.sin(c.a);
    for (const s of this.sirens) {
      const dx = s.x - c.x, dz = s.z - c.z, d = Math.hypot(dx, dz);
      if (d > SIREN_HEARD) continue;
      const u = dx * hx + dz * hz, closing = -(s.vx * dx + s.vz * dz) / (d || 1);   // how fast it's coming this way
      if (closing > 1 || d < 12 || (u < c.hl && closing > -1)) return true;
    }
    return false;
  }

  // ---- wrecks ----------------------------------------------------------------------------------
  /** Host: player by has driven into car n, changing its speed by (dvx, dvz) m/s and its spin by spin rad/s. */
  shove(n: number, dvx: number, dvz: number, spin: number, by: string) {
    const c = this.cars.get(n);
    if (!c || (!c.e && !c.wreck) || ![dvx, dvz, spin].every(Number.isFinite)) return;
    const dv = Math.hypot(dvx, dvz), k = dv > 40 ? 40 / dv : 1;
    if (!c.wreck && dv < KNOCK) return;
    this.wrecked(c, dvx * k, dvz * k, Math.max(-6, Math.min(6, spin)), by);
  }

  /** Host: parked car i (its vehicle number), now out of the street furniture at (x, z) facing a, has been knocked by player by. */
  unparked(i: number, at: { x: number; z: number; a: number; paint: number }, dvx: number, dvz: number, spin: number, by: string) {
    if (this.cars.has(PARKED + i)) return;
    const c = this.parkedCar(i, at);
    c.wreck = true;
    this.shove(c.n, dvx, dvz, spin, by);
  }

  /** Someone here has knocked parked car i out of the street furniture: show it go straight away, till the host's word on it comes. */
  unparkedHere(i: number, at: { x: number; z: number; a: number; paint: number }, dvx: number, dvz: number, spin: number) {
    if (this.cars.has(PARKED + i)) return;
    const c = this.parkedCar(i, at);
    c.wreck = true;
    this.nudge(c.n, dvx, dvz, spin);
  }

  private parkedCar(i: number, at: { x: number; z: number; a: number; paint: number }): Car {
    const c = new Car(PARKED + i, at.paint, this.parkedMake(i));
    c.x = at.x; c.z = at.z; c.a = at.a; c.v = 0; c.y = this.ground(at.x, at.z);
    this.add(c);
    return c;
  }

  /** Someone here has just driven into car n: show it going the way they knocked it straight away, till the host's word on it catches up. */
  nudge(n: number, dvx: number, dvz: number, spin: number) {
    const c = this.cars.get(n);
    if (!c || (!c.wreck && Math.hypot(dvx, dvz) < KNOCK)) return;
    const g = c.guess ?? { x: c.x, z: c.z, a: c.a, y: c.y, vx: c.vx, vz: c.vz, spin: 0, roll: c.roll, rollV: 0, lift: c.lift, liftV: 0, t: 0 };
    g.t = performance.now();
    knock(g, dvx, dvz, spin);
    c.guess = g;
  }

  /** Host: car c's knocked off the road (or knocked again), and whoever did it is to blame for what it does next. */
  private wrecked(c: Car, dvx: number, dvz: number, spin: number, by: string) {
    if (!c.wreck) {
      c.wreck = true;
      c.v = 0; c.horn = false; c.gas = 0; c.steer = 0; c.blockT = 0;
    }
    c.stuckT = 0;
    if (by) c.by = by;
    knock(c, dvx, dvz, spin);
  }

  /** Host: a wreck for dt: sliding to a stop, knocking into the rest of the traffic, rolling, and going up if it's come to rest on its roof. */
  private crashing(c: Car, dt: number, blast: (x: number, y: number, z: number, by: string) => void) {
    // into another car: they both get knocked (equally heavy, so they share it)
    if (Math.hypot(c.vx, c.vz) > 1) for (const o of this.cars.values()) {
      if (o === c || Math.abs(o.x - c.x) > 6 || Math.abs(o.z - c.z) > 6 || Math.abs(o.y + o.lift - c.y - c.lift) > 1.5) continue;
      const t = contact(c, c.along, c.hw, o);
      if (!t) continue;
      c.x += t.nx * t.depth / 2; c.z += t.nz * t.depth / 2;
      const vn = (c.vx - o.vx) * t.nx + (c.vz - o.vz) * t.nz;
      if (vn >= 0) continue;
      // (the lighter one takes more of it: a coach barely notices a car)
      const dv = -(1 + BOUNCE) * vn, mine = (dv * o.mass) / (c.mass + o.mass), theirs = (dv * c.mass) / (c.mass + o.mass), I = o.mass * (o.hl * o.hl + o.hw * o.hw) / 3;
      knock(c, t.nx * mine, t.nz * mine, 0);
      const spin = Math.max(-4, Math.min(4, (-theirs * o.mass * twist(o.x, o.z, t.px, t.pz, t.nx, t.nz)) / I * 0.6));
      if (o.wreck || theirs > KNOCK) this.wrecked(o, -t.nx * theirs, -t.nz * theirs, spin, c.by);
      this.onCrunch?.(t.px, c.y + 0.6, t.pz, Math.min(1, -vn / 12));
    }
    const was = c.lift > 0 || c.liftV > 0;
    this.slide(c, dt, c, (m) => m instanceof Car);
    if (was && c.lift === 0 && c.liftV === 0) this.onCrunch?.(c.x, c.y + 0.4, c.z, 0.5);
    c.stuckT = Math.hypot(c.vx, c.vz) < 0.3 ? c.stuckT + dt : 0;
    // come to rest on its roof: it catches, and a moment later it goes up
    if (!c.fire && !c.lift && !c.liftV && Math.cos(c.roll) < -0.7) { c.fire = 1; c.fuse = 1.5 + Math.random() * 1.5; }
    if (c.fire === 1 && (c.fuse -= dt) <= 0) this.boom(c, blast);
  }

  /** Host: car c goes up. Everything near it gets caught (game.ts sorts out who's hurt), and the rest of the traffic's thrown about. */
  private boom(c: Car, blast: (x: number, y: number, z: number, by: string) => void) {
    c.fire = 2; c.burnT = BURN;
    c.mat.color.set(CHAR); charred(c.mat);
    c.liftV = Math.max(c.liftV, 3.5);   // it jumps with the blast
    const y = c.y + c.lift + 0.8;
    this.onBoom?.(c.x, y, c.z);
    blast(c.x, y, c.z, c.by);
    for (const o of this.cars.values()) {
      const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz);
      if (o === c || d > BLAST || d < 0.01) continue;
      const k = 14 * (1 - d / BLAST);
      this.wrecked(o, (dx / d) * k, (dz / d) * k, (Math.random() - 0.5) * 3, c.by);
      o.liftV = Math.max(o.liftV, k * 0.3);
    }
  }

  /**
   * Something off its wheels' line for dt (a wreck, or our guess at where we've knocked one): on its
   * wheels it rolls on and scrubs sideways, on its side or roof it scrapes to a stop; it bounces off
   * walls; and it rolls over until it comes down on whichever side's nearest. pass: movers it goes through.
   */
  private slide(w: Tumbling, dt: number, self: Car, pass: (m: Mover) => boolean) {
    const up = w.lift > 0 || w.liftV > 0;
    if (!up) {
      const c = Math.cos(w.a), s = Math.sin(w.a), wheels = Math.cos(w.roll) > 0.7;
      const vf = ease(w.vx * c - w.vz * s, (wheels ? 2.5 : 7) * dt), vl = ease(w.vx * s + w.vz * c, 8 * dt);
      w.vx = vf * c + vl * s; w.vz = -vf * s + vl * c;
      w.spin = ease(w.spin, (wheels ? 2.5 : 6) * dt);
    }
    w.x += w.vx * dt; w.z += w.vz * dt; w.a += w.spin * dt;
    const c = Math.cos(w.a), s = Math.sin(w.a);
    for (const k of self.along) {
      const cx = w.x + k * c, cz = w.z - k * s, p = this.map.collide({ x: cx, z: cz }, w.y + w.lift, self.hw, self, pass);
      const bx = p.x - cx, bz = p.z - cz, d = Math.hypot(bx, bz);
      if (d < 1e-4) continue;
      w.x += bx; w.z += bz;
      const nx = bx / d, nz = bz / d, vn = w.vx * nx + w.vz * nz;
      if (vn < 0) { w.vx -= nx * vn * 1.3; w.vz -= nz * vn * 1.3; w.spin *= 0.7; }
    }
    w.roll += w.rollV * dt;
    if (up) {
      w.liftV -= 9.8 * dt;
      w.lift += w.liftV * dt;
      if (w.lift <= 0) {
        w.lift = 0;
        // still going over fast, it bounces and rolls on; otherwise it comes down on whichever side's nearest
        if (Math.abs(w.rollV) > 3.5) { w.liftV = Math.min(3, Math.abs(w.rollV) * 0.3); w.rollV *= 0.6; w.vx *= 0.85; w.vz *= 0.85; }
        else { w.liftV = 0; w.rollV = 0; }
      }
    } else {
      const q = Math.PI / 2;
      w.rollV = 0;
      w.roll += (Math.round(w.roll / q) * q - w.roll) * Math.min(1, dt * 8);
    }
    w.roll = Math.atan2(Math.sin(w.roll), Math.cos(w.roll));
  }

  /** A new car on a road a little way off from player p, going either way. */
  private spawn(p: { x: number; z: number }, nearest: (x: number, z: number) => number) {
    const near: Edge[] = [];
    for (let i = Math.floor((p.x - FAR) / CELL); i <= Math.floor((p.x + FAR) / CELL); i++)
      for (let j = Math.floor((p.z - FAR) / CELL); j <= Math.floor((p.z + FAR) / CELL); j++) near.push(...(this.cells.get(this.cell(i * CELL, j * CELL)) ?? []).filter((e) => !e.dead && !this.shut(e)));
    // most of them on the busy roads: picked in proportion to (the root of) the traffic each carries
    const weight = near.map((e) => Math.sqrt(e.flow)), total = weight.reduce((s, w) => s + w, 0);
    const pickOne = () => { let r = Math.random() * total; for (let k = 0; k < near.length; k++) if ((r -= weight[k]) <= 0) return near[k]; return near[near.length - 1]; };
    for (let tries = 0; tries < 30 && near.length; tries++) {
      const e = pickOne();
      const A = this.nodes[e.a], x = A.x + e.dx * e.len / 2, z = A.z + e.dz * e.len / 2, d = nearest(x, z);
      if (d < NEAR || d > FAR) continue;
      if ([...this.cars.values()].some((o) => Math.hypot(o.x - x, o.z - z) < 20) || this.map.parkedNear(x, z, 7).length) continue;
      // a number that comes out as a coach is passed over unless this is a main road
      while (e.v < 12 && isCoachMake(trafficMake(this.serial))) this.serial++;
      const c = new Car(this.serial++, Math.floor(Math.random() * 90));   // its paint by number, in whichever colours its make comes in (paintFor)
      c.e = e; c.s = e.len / 2; c.v = e.v * 0.6;
      this.plan(c);
      c.a = Math.atan2(-e.dz, e.dx);
      this.place(c);
      this.add(c);
      return;
    }
  }

  /** How many cars the roads round scene (p) really carry at this time of day (by the game's clock and
   *  the day your watch shows): each road's vehicles a day, the share of them in this hour, spread along
   *  it at its speed. Worked out every few seconds for each player (j). */
  private expected(p: { x: number; z: number }, j: number): number {
    const had = this.busy[j], now = performance.now();
    if (had && now - had.t < 3000 && Math.hypot(had.x - p.x, had.z - p.z) < 60) return had.n;
    const hour = Math.floor(timeOfDay() * 24) % 24, day = new Date(watchDay() * 86400000).getUTCDay();
    const share = ((day === 0 || day === 6 ? WEEKEND : WEEKDAY)[hour] / 100) / 3600;   // of a day's traffic, each second
    let n = 0;
    for (let i = Math.floor((p.x - FAR) / CELL); i <= Math.floor((p.x + FAR) / CELL); i++)
      for (let k = Math.floor((p.z - FAR) / CELL); k <= Math.floor((p.z + FAR) / CELL); k++)
        for (const e of this.cells.get(this.cell(i * CELL, k * CELL)) ?? []) {
          const A = this.nodes[e.a];
          if (e.dead || Math.hypot(A.x + e.dx * e.len / 2 - p.x, A.z + e.dz * e.len / 2 - p.z) > FAR) continue;
          // (a two-way road's traffic is half each way)
          // (spread at the speed it really goes, not the limit: about 15 mph on average in town, the lights,
          // junctions and queues counted in, so a busy road holds more cars at once than its limit suggests)
          n += ((e.back ? e.flow / 2 : e.flow) * share * e.len) / Math.min(e.v, 7);
        }
    this.busy[j] = { t: now, x: p.x, z: p.z, n: Math.round(n) };
    return Math.round(n);
  }
  private busy: { t: number; x: number; z: number; n: number }[] = [];

  /** Pick its roads ahead, far enough to see what's coming. */
  private plan(c: Car) {
    let ahead = c.e.len - c.s + c.route.reduce((t, r) => t + r.len, 0);
    while (ahead < 40 || !c.route.length) {
      const last = c.route[c.route.length - 1] ?? c.e, r = this.choose(last, c);
      if (r.ring && !last.ring) c.ringFrom = r.a;   // (coming on to a roundabout here)
      c.route.push(r);
      ahead += r.len;
    }
  }

  /** The middle of its lane from where it is now to the end of its route, as points. */
  private lanePath(c: Car): number[][] {
    const pts = [[c.x + c.e.dz * c.dodge, c.z - c.e.dx * c.dodge]];
    const legs = [c.e, ...c.route];
    for (let k = 0; k < legs.length; k++) {
      const d = legs[k], B = this.nodes[d.b], o = miter(d, legs[k + 1] ?? d);
      pts.push([B.x + o[0], B.z + o[1]]);
    }
    return pts;
  }

  /** Whether e's road is shut to traffic at this hour of the game's clock (a street closed in the daytime). */
  private shut(e: Edge): boolean {
    const h = this.roads[e.road]?.shut;
    if (!h) return false;
    const t = timeOfDay() * 24;
    return h[0] <= h[1] ? t >= h[0] && t < h[1] : t >= h[0] || t < h[1];
  }

  /** Which way next at the end of e: any road but back the way it came, unless it's a dead end, and
   *  not into a street shut at this hour (a car already in one drives on out of it). */
  private choose(e: Edge, c?: Car): Edge {
    const all = this.nodes[e.b].out.filter((o) => o.b !== e.a), open = all.filter((o) => !this.shut(o) || this.shut(e));
    const outs = open.length ? open : all;
    if (!outs.length) return e.back ?? e;
    // going round a roundabout: off at an exit more often than not, and off for certain once it's back where it came on
    if (e.ring) {
      const exits = outs.filter((o) => !o.ring), round = outs.find((o) => o.ring);
      if (exits.length && (!round || (c && e.b === c.ringFrom) || Math.random() < 0.6)) {
        const w = exits.map((o) => Math.sqrt(o.flow));
        let r = Math.random() * w.reduce((t, x) => t + x, 0);
        for (let k = 0; k < exits.length; k++) if ((r -= w[k]) <= 0) return exits[k];
        return exits[exits.length - 1];
      }
      if (round) return round;
    }
    // mostly straight on, sometimes a turning, and keeping to the busy roads: a side street off a main road is seldom taken
    const w = outs.map((o) => (0.4 + Math.max(0, e.dx * o.dx + e.dz * o.dz)) * Math.min(3, Math.max(0.08, Math.sqrt(o.flow / Math.max(1, e.flow)))));
    let r = Math.random() * w.reduce((s, x) => s + x, 0);
    for (let k = 0; k < outs.length; k++) if ((r -= w[k]) <= 0) return outs[k];
    return outs[outs.length - 1];
  }

  /** The middle of its lane (with however far out it's pulled) a distance ahead along its route, and the way the road runs there. */
  private laneAhead(c: Car, ahead: number): { x: number; z: number; dx: number; dz: number } {
    let e = c.e, s = c.s + ahead, prev = c.prev, k = 0;
    while (s > e.len && k < c.route.length) { s -= e.len; prev = e; e = c.route[k++]; }
    s = Math.min(s, e.len);
    const next = k < c.route.length ? c.route[k] : e, A = this.nodes[e.a];
    const f = s / e.len, o0 = miter(prev ?? e, e), o1 = miter(e, next);
    return { x: A.x + e.dx * s + o0[0] + (o1[0] - o0[0]) * f - e.dz * c.dodge, z: A.z + e.dz * s + o0[1] + (o1[1] - o0[1]) * f + e.dx * c.dodge, dx: e.dx, dz: e.dz };
  }

  /**
   * Drive it on for dt: the front wheels steer towards a point on its lane a little way ahead
   * (further the faster it's going), and the car turns about its back axle as a car does, so it
   * sweeps round a corner rather than pivoting on the spot. Where it is along its road is then
   * read back from where it's got to.
   */
  private steerAlong(c: Car, dt: number) {
    // (never nearer than 8 m: at full lock it turns a circle about 7.7 m across, so a point that far ahead and
    // anywhere within a right angle of straight on is always one it can steer round to, at any corner)
    const look = Math.min(16, 8 + Math.max(0, c.v) * 0.6), t = this.laneAhead(c, look);
    const hx = Math.cos(c.a), hz = -Math.sin(c.a);
    const want = Math.atan2(-(t.z - c.z), t.x - c.x);
    const bear = Math.atan2(Math.sin(want - c.a), Math.cos(want - c.a));
    // can it drive to its way on from here? Not if it's behind it, or inside either of the tightest
    // circles it can turn (about its back axle, one each side): then it would only go round and round
    const ax = c.x - hx * WB / 2, az = c.z - hz * WB / 2, lx = hz, lz = -hx;
    const inside = (k: number) => Math.hypot(t.x - (ax + lx * TURN_R * k), t.z - (az + lz * TURN_R * k)) < TURN_R * 0.95;
    const reach = Math.abs(bear) < 1.75 && !inside(1) && !inside(-1);
    c.lost = !reach;
    let steer: number;
    if (!c.leg && !reach && Math.abs(c.v) < 2.5) { c.leg = -1; c.legLeft = SHUNT; c.legSide = bear < 0 ? -1 : 1; }   // slowed right down: a turn in the road, backing up first
    if (c.leg) {
      // back on the opposite lock, forward on full lock its way, a few metres each, till it can drive to it
      steer = (c.leg < 0 ? -1 : 1) * c.legSide * LOCK;
      c.legLeft -= Math.abs(c.v) * dt;
      if (c.legLeft <= 0) {
        if (reach && Math.abs(bear) < 1.2) c.leg = 0;
        else { c.leg = -c.leg; c.legLeft = SHUNT; }
      }
    } else steer = Math.max(-LOCK, Math.min(LOCK, bear));
    c.steer += (steer - c.steer) * Math.min(1, dt * 8);
    // the back axle rolls straight on, the car turning about it at the rate the front wheels ask for
    const half = WB / 2;
    let rx = c.x - hx * half, rz = c.z - hz * half;
    rx += hx * c.v * dt; rz += hz * c.v * dt;
    c.a += ((c.v * Math.tan(c.steer)) / WB) * dt;
    c.a = Math.atan2(Math.sin(c.a), Math.cos(c.a));
    c.x = rx + Math.cos(c.a) * half; c.z = rz - Math.sin(c.a) * half;
    // where that leaves it along its road
    const e = c.e, A = this.nodes[e.a];
    c.s = Math.max(c.s, (c.x - A.x) * e.dx + (c.z - A.z) * e.dz);
    // and once it's round the corner at the end (over the line halfway between the two roads), it's on the next
    // one, as far along it as it's got: cutting the corner, it never gets to the very end of this one, and
    // would otherwise go on steering for the corner behind it, round and round
    const next = c.route[0];
    if (next && c.s < e.len) {
      const B = this.nodes[e.b], bx = e.dx + next.dx, bz = e.dz + next.dz;
      if ((c.x - B.x) * bx + (c.z - B.z) * bz > 0) c.s = e.len + Math.max(0, (c.x - B.x) * next.dx + (c.z - B.z) * next.dz);
    }
    // (astray from its lane, say after turning round, it finds the lane again rather than wandering)
    const off = Math.hypot(c.x - t.x, c.z - t.z);
    if (off > 40) this.place(c);
  }

  /**
   * The height to start a car at that's only just turned up (spawned, or first heard of from the
   * host), found the way it would have got there: coming back to it along its road from 60 m on, a
   * metre at a time. So one that turns up out over the river is on the bridge's deck, not down on the
   * river bed (where, keeping to whatever it was on a moment ago, it would then drive the whole way
   * across under the bridge). Undefined for one that isn't on a road: it sits on the ground.
   */
  private arriving(c: Car): number | undefined {
    if (c.wreck || c.n >= PARKED) return undefined;
    let e: Edge | undefined = c.e;
    if (!e) {
      // (not the host's: the nearest stretch of road going its way)
      let best = 6;
      const hx = Math.cos(c.a), hz = -Math.sin(c.a), ci = Math.floor(c.x / CELL), cj = Math.floor(c.z / CELL);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++)
        for (const o of this.cells.get(this.cell(i * CELL, j * CELL)) ?? []) {
          if (o.dead || o.dx * hx + o.dz * hz < 0.5) continue;
          const A = this.nodes[o.a], along = (c.x - A.x) * o.dx + (c.z - A.z) * o.dz;
          if (along < -1 || along > o.len + 1) continue;
          const off = Math.abs((c.z - A.z) * o.dx - (c.x - A.x) * o.dz);
          if (off < best) { best = off; e = o; }
        }
      if (!e) return undefined;
    }
    // where it is against its stretch of road: how far along, and how far out to the side of the middle
    const A = this.nodes[e.a];
    let s = (c.x - A.x) * e.dx + (c.z - A.z) * e.dz;
    const side = (c.z - A.z) * e.dx - (c.x - A.x) * e.dz;
    const pts = [[c.x, c.z]];
    for (let k = 0; k < 60; k++) {
      s += 1;
      while (s > e.len) {
        // on along the road, the straightest way
        const outs: Edge[] = this.nodes[e.b].out.filter((o: Edge) => !o.dead && o.b !== e!.a);
        if (!outs.length) break;
        s -= e.len;
        e = outs.reduce((m, o) => (o.dx * e!.dx + o.dz * e!.dz > m.dx * e!.dx + m.dz * e!.dz ? o : m));
      }
      if (s > e.len) break;
      const from = this.nodes[e.a];
      pts.push([from.x + e.dx * s - e.dz * side, from.z + e.dz * s + e.dx * side]);
    }
    let y = this.ground(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    for (let k = pts.length - 2; k >= 0; k--) y = this.ground(pts[k][0], pts[k][1], y);
    return y;
  }

  /** Where it is on its road: in the left-hand lane, turning smoothly from one stretch to the next. */
  private place(c: Car) {
    const e = c.e, A = this.nodes[e.a];
    const f = c.s / e.len, o0 = miter(c.prev ?? e, e), o1 = miter(e, c.next);
    const x = A.x + e.dx * c.s + o0[0] + (o1[0] - o0[0]) * f, z = A.z + e.dz * c.s + o0[1] + (o1[1] - o0[1]) * f;
    // face the way it's going, easing round onto the next stretch near the end of this one
    const into = Math.max(0, 1 - (e.len - c.s) / 3) * 0.5, from = c.prev ? Math.max(0, 1 - c.s / 3) * 0.5 : 0;
    const hx = e.dx + (c.next.dx - e.dx) * into + ((c.prev?.dx ?? e.dx) - e.dx) * from;
    const hz = e.dz + (c.next.dz - e.dz) * into + ((c.prev?.dz ?? e.dz) - e.dz) * from;
    c.a = Math.atan2(-hz, hx);
    c.x = x - e.dz * c.dodge; c.z = z + e.dx * c.dodge;
  }

  private add(c: Car) {
    this.cars.set(c.n, c);
    this.scene.add(tag(c.root, "vehicle"));
    this.map.movers.push(c);
  }

  private drop(n: number) {
    const c = this.cars.get(n);
    if (!c) return;
    this.cars.delete(n);
    this.scene.remove(c.root);
    const k = this.map.movers.indexOf(c);
    if (k >= 0) this.map.movers.splice(k, 1);
    c.dispose();
  }

  /** Host: someone's pulled the driver out of car n. Where it was, its paint and its make, if it's still about. */
  take(n: number): { x: number; z: number; a: number; paint: number; make: number } | null {
    const c = this.cars.get(n);
    if (!c) return null;
    this.drop(n);
    return { x: c.x, z: c.z, a: c.a, paint: c.paint, make: c.make };
  }

  // ---- everyone else: the host's updates ------------------------------------------------------
  snapshot(): number[] {
    const q = (v: number) => Math.round(v * 100) / 100, s: number[] = [];
    for (const c of this.cars.values()) s.push(c.n, q(c.x), q(c.z), q(c.a), q(c.v), c.paint + (c.horn ? 100 : 0));
    return s;
  }

  /** How the wrecks are lying, to go with the snapshot: [n, vx, vz, roll, lift, fire] each (empty if there are none). */
  wrecks(): number[] {
    const q = (v: number) => Math.round(v * 100) / 100, s: number[] = [];
    for (const c of this.cars.values()) if (c.wreck) s.push(c.n, q(c.vx), q(c.vz), q(c.roll), q(c.lift), c.fire);
    return s;
  }

  applyWrecks(d: number[]) {
    if (!Array.isArray(d) || d.length % 6) return;
    for (let k = 0; k < d.length; k += 6) {
      const [n, vx, vz, roll, lift, fire] = d.slice(k, k + 6), c = this.cars.get(n);
      if (!c || ![vx, vz, roll, lift, fire].every(Number.isFinite)) continue;
      c.wreck = true;
      // landed with a crunch, caught fire, gone up
      if (c.wv[3] > 0.15 && lift < 0.05) this.onCrunch?.(c.x, c.y + 0.4, c.z, 0.5);
      if (fire === 2 && c.fire !== 2) {
        c.mat.color.set(CHAR); charred(c.mat);
        if (c.fire === 1) { c.burnT = BURN; this.onBoom?.(c.x, c.y + c.lift + 0.8, c.z); }
      }
      c.fire = fire;
      c.wv = [vx, vz, roll, lift];
    }
  }

  apply(d: number[]) {
    if (!Array.isArray(d) || d.length % STRIDE) return;
    const now = performance.now(), seen = new Set<number>();
    for (let k = 0; k < d.length; k += STRIDE) {
      const [n, x, z, a, v, pf] = d.slice(k, k + STRIDE);
      if (![n, x, z, a, v, pf].every(Number.isFinite)) continue;
      seen.add(n);
      let c = this.cars.get(n);
      if (!c) {
        c = new Car(n, pf % 100, n >= PARKED ? this.parkedMake(n - PARKED) : undefined); c.x = x; c.z = z; c.a = a; this.add(c);
        if (n >= PARKED) this.onUnpark?.(n - PARKED);   // a parked car knocked into the road: off the street with it
      }
      c.horn = pf >= 100;
      c.snaps.push({ t: now, x, z, a, v });
      if (c.snaps.length > 20) c.snaps.shift();
    }
    // (not one we've just knocked, that the host hasn't heard about yet)
    for (const [n, c] of [...this.cars]) if (!seen.has(n) && !(c.guess && now - c.guess.t < GUESS_END)) this.drop(n);
  }

  // ---- everyone: drawing ----------------------------------------------------------------------
  update(dt: number, host: boolean) {
    const t = performance.now() - DELAY;
    for (const c of this.cars.values()) {
      if (!host && c.snaps.length) {
        const S = c.snaps;
        let a = S[0], b = S[S.length - 1];
        for (let k = 0; k < S.length - 1; k++) if (S[k].t <= t && S[k + 1].t >= t) { a = S[k]; b = S[k + 1]; break; }
        if (t >= b.t) a = b;
        const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
        c.x = a.x + (b.x - a.x) * f; c.z = a.z + (b.z - a.z) * f;
        c.a = a.a + Math.atan2(Math.sin(b.a - a.a), Math.cos(b.a - a.a)) * f;
        const v = a.v + (b.v - a.v) * f;
        c.gas = v > c.v + 0.01 ? 1 : 0;
        c.v = v;
      }
      if (!host) {
        // a wreck: rolling over as the host says, eased between its updates (and anything else back on its wheels)
        if (c.wreck) [c.vx, c.vz] = c.wv;
        else { c.vx = c.v * Math.cos(c.a); c.vz = -c.v * Math.sin(c.a); }
        c.roll += turnTo(c.roll, c.wreck ? c.wv[2] : 0) * Math.min(1, dt * 10);
        c.lift += ((c.wreck ? c.wv[3] : 0) - c.lift) * Math.min(1, dt * 10);
        c.roll = Math.atan2(Math.sin(c.roll), Math.cos(c.roll));
        // one we've just knocked: where we think it's going, till the host's word catches up
        const g = c.guess;
        if (g) {
          g.y = c.y;
          this.slide(g, dt, c, () => true);
          const f = Math.max(0, Math.min(1, (GUESS_END - (performance.now() - g.t)) / (GUESS_END - GUESS_HOLD)));
          c.x += (g.x - c.x) * f; c.z += (g.z - c.z) * f; c.a += turnTo(c.a, g.a) * f;
          c.vx += (g.vx - c.vx) * f; c.vz += (g.vz - c.vz) * f;
          c.roll += turnTo(c.roll, g.roll) * f; c.lift += (g.lift - c.lift) * f;
          c.roll = Math.atan2(Math.sin(c.roll), Math.cos(c.roll));
          if (f <= 0) c.guess = null;
        }
      }
      // the front wheels: turned with the steering (the host knows it; everyone else reads it off how
      // fast the car's heading is changing) and rolling with the road
      if (!host && !c.wreck && !c.guess) {
        const da = c.pa === null ? 0 : Math.atan2(Math.sin(c.a - c.pa), Math.cos(c.a - c.pa));
        const want = Math.max(-LOCK, Math.min(LOCK, Math.atan((da / Math.max(0.001, dt)) * WB / Math.max(1, c.v))));
        c.steer += (want - c.steer) * Math.min(1, dt * 6);
      }
      c.pa = c.a;
      // the brake lights: on as it slows, and while it's stood in a queue
      const slowing = (c.v - c.pv) / Math.max(dt, 1e-3);
      c.pv = c.v;
      c.brakeT = slowing < -1.2 || (c.v < 0.4 && !c.wreck) ? 0.35 : Math.max(0, c.brakeT - dt);
      c.rolled = (c.rolled + (c.v * dt) / 0.33) % (Math.PI * 2);
      for (const w of c.wheels) { w.rotation.y = c.steer; w.rotation.z = -c.rolled; }
      // sat on the ground, tilted with the slope
      const cs = Math.cos(c.a), sn = Math.sin(c.a), half = c.coach ? (COACH.front - COACH.rear) / 2 : 1.3;
      // (the height it was at a frame ago lets it stay on a bridge deck or in a tunnel instead of dropping to the river bed;
      // one that's only just turned up has none yet, and finds its height from along its road)
      const was = c.top ? c.y : this.arriving(c);
      const hF = this.ground(c.x + cs * half, c.z - sn * half, was), hR = this.ground(c.x - cs * half, c.z + sn * half, was);
      c.y = (hF + hR) / 2;
      // rolled over about its middle, its lowest corner on the ground (or above it, in the air)
      const up = Math.abs(Math.cos(c.roll)), side = Math.abs(Math.sin(c.roll));
      const H = c.h, HW = c.hw;
      c.top = c.y + c.lift + up * H + side * 2 * HW; c.waist = c.y + c.lift + up * (c.coach ? 1.85 : 0.98) + side * HW;
      c.root.position.set(c.x, c.y + c.lift - H / 2 + up * H / 2 + side * HW, c.z);
      c.root.rotation.set(0, c.a, Math.atan((hF - hR) / (2 * half)), "YZX");
      c.tumble.rotation.x = c.roll;
      // alight: flames, and smoke going up (and a wisp still coming off it once it's burnt out)
      const alight = c.fire === 1 || c.burnT > 0;
      if (alight && !c.flames) c.root.add((c.flames = flames()));
      if (c.flames) {
        c.flames.visible = alight;
        if (alight) for (const f of c.flames.children) { const w = 0.8 + Math.random() * 0.4; f.scale.set(w, (c.fire === 1 ? 0.5 : 0.8) + Math.random() * 0.9, w); }
      }
      if (c.burnT > 0) c.burnT -= dt;
      if (c.fire && (c.smokeT -= dt) <= 0) {
        c.smokeT = alight ? 0.15 : 0.7;
        this.onSmoke?.(c.x + (Math.random() - 0.5) * 2, c.y + c.lift + 1.4, c.z + (Math.random() - 0.5) * 2, alight);
      }
      // four gears up to 30 mph
      const sp = Math.min(1, c.v / 14), g = Math.min(3, Math.floor(sp * 4));
      c.rpm += (0.25 + 0.75 * (sp * 4 - g) - c.rpm) * Math.min(1, dt * 6);
    }
  }

  /**
   * The shortest way by road through each of the points in turn (scene x, z), along the middle of
   * the streets the traffic uses, for the bus routes (busdriver.ts). Null if two of them don't join up
   * (skip: pass over one in the middle that doesn't, and carry on from the last one that did).
   */
  way(through: { x: number; z: number }[], skip = false): { x: number; z: number }[] | null {
    const near = (x: number, z: number) => {
      let best = -1, bd = Infinity;
      for (let r = 0; r <= 3 && best < 0; r++)
        for (let ci = Math.floor(x / CELL) - r; ci <= Math.floor(x / CELL) + r; ci++) for (let cj = Math.floor(z / CELL) - r; cj <= Math.floor(z / CELL) + r; cj++)
          for (const e of this.cells.get(this.cell(ci * CELL, cj * CELL)) ?? []) {
            const A = this.nodes[e.a], d = Math.hypot(A.x - x, A.z - z);
            if (d < bd) { bd = d; best = e.a; }
          }
      return best;
    };
    const ends = through.map((p) => near(p.x, p.z));
    if (ends.some((n) => n < 0)) return null;
    const N = this.nodes.length, g = new Float64Array(N), from = new Int32Array(N);
    const out: { x: number; z: number }[] = [];
    // (a point along the way that can't be got to from the last, or on to the next, is passed over, the
    // first and last excepted: a route traced from the real one can catch a path or a one-way the wrong way)
    for (let k = 0, at = ends[0]; k + 1 < ends.length; k++) {
      // A*, on a heap of [cost so far plus the straight line still to go, node]
      const a = at, b = ends[k + 1], B = this.nodes[b];
      g.fill(Infinity); from.fill(-1);
      g[a] = 0;
      const heap: [number, number][] = [[0, a]];
      const push = (f: number, n: number) => {
        heap.push([f, n]);
        for (let c = heap.length - 1; c > 0;) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; }
      };
      const pop = () => {
        const top = heap[0], last = heap.pop()!;
        if (heap.length) {
          heap[0] = last;
          for (let c = 0; ;) {
            const l = 2 * c + 1, r = l + 1;
            let m = c;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === c) break;
            [heap[m], heap[c]] = [heap[c], heap[m]]; c = m;
          }
        }
        return top;
      };
      while (heap.length) {
        const [f, u] = pop();
        if (u === b) break;
        const U = this.nodes[u];
        if (f - Math.hypot(B.x - U.x, B.z - U.z) > g[u] + 1e-6) continue;   // (a stale entry)
        for (const e of U.out) {
          const c = g[u] + e.len;
          if (c >= g[e.b]) continue;
          g[e.b] = c; from[e.b] = u;
          const V = this.nodes[e.b];
          push(c + Math.hypot(B.x - V.x, B.z - V.z), e.b);
        }
      }
      if (a !== b && from[b] < 0) { if (k + 2 < ends.length && skip) continue; return null; }
      at = b;
      const leg: number[] = [];
      for (let n = b; n !== a; n = from[n]) leg.push(n);
      leg.push(a);
      leg.reverse();
      for (const n of out.length ? leg.slice(1) : leg) out.push({ x: this.nodes[n].x, z: this.nodes[n].z });
    }
    return out;
  }

  /** A car that's stopped or crawling within reach of (x, z): its number and what it is. */
  nearest(x: number, z: number, y: number, reach: number): { n: number; name: string; x: number; z: number } | null {
    let best: { n: number; name: string; x: number; z: number } | null = null, bd = reach;
    for (const c of this.cars.values()) {
      if (c.wreck || c.v > 5 || Math.abs(c.y - y) > 2.5) continue;
      const cs = Math.cos(c.a), sn = Math.sin(c.a), dx = x - c.x, dz = z - c.z;
      const d = Math.hypot(Math.max(0, Math.abs(dx * cs - dz * sn) - c.hl), Math.max(0, Math.abs(dx * sn + dz * cs) - c.hw));
      if (d < bd) { bd = d; best = { n: c.n, name: c.name, x: c.x, z: c.z }; }
    }
    return best;
  }
}
