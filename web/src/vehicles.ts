// Vehicles you can drive. The cars parked along The Firs (by Firs Field) and Fox Hill are swapped
// for ones with the keys in: Ford Escort XR3is, Reliant Robins, Vauxhall Novas, Austin Metros, Ford
// Sierras, a Police Sierra, a Transit van, a Mr Whippy van, a milk float and a Sinclair C5. Badgerline
// double-deckers and minibuses wait at bus stops, and each cricket club has its heavy roller out.
// A Kingswood School minibus is parked up on Lansdown by Grenville's monument, on a school trip, and
// Mr D's chip van (chipvan.ts) is parked at the top of Old Bond Street, by Milsom Street.
//
// E gets in and out: the driver's seat if it's free, otherwise a passenger seat, where you can look
// about and shoot. W and S drive, A and D steer (the mouse only looks about, and the view comes back
// behind once you leave it: game.ts, settleRate in player.ts), Space is the handbrake and H (or a click) the horn,
// or the siren on the police car, or Greensleeves on the ice cream van. C switches between the chase camera and
// the driver's own view from the seat, over the dash (cockpit.ts). Vehicles block like walls,
// rounds go through their windows, and anyone you hit at speed goes under (the roller flattens them
// at a crawl). Drive into the traffic, a parked car or a vehicle nobody's in and it gives way: you
// plough on, a bit slower, and what you hit is knocked off its line (the traffic and the parked
// cars become wrecks in traffic.ts; a vehicle slides off with its handbrake on). Take a Robin round a corner too fast and it goes over;
// drive a milk float into something and the bottles go. Every other parked car in the place, in Combe Down or out in Bath,
// stays street furniture until someone gets in it, and then it's a car like the rest. You can call
// a bus at any bus stop (game.ts), in Combe Down or anywhere in Bath. Space with some lock on kicks the back end
// out for donuts: keep the throttle and the lock on and it keeps going round.
//
// Who decides what: whoever's driving a vehicle moves it and sends where it is about 20 times a
// second. The host decides who sits where (the first to ask) and sends round who's in what and where
// everything's parked. Everyone builds the same vehicles in the same places from the map. A driver
// who knocks a car in the traffic, a parked car or an empty vehicle tells the host how hard; the host
// runs the traffic, and slides an empty vehicle on, sending where it is as a driver would.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { EngineKind } from "./audio";
import { CAR_PAINT, carSteerable, glass, GOLF_DRIVER_SHAPE, model, paintFor, Part, pillars, prof, steerable, Wheel } from "./furniture";
import { ALIZEE, carShape, GOLF, GOLF_PAINT, LAND_ROVER, LR_PAINT, MAKES, PARAMOUNT, parkedMake, XR3I, XR3I_PAINT } from "./makes";
export { MAKES };
import { Cockpit } from "./cockpit";
import { driverDressing, driverSpot, PETROL_BLUE } from "./golfdriver";
import { GLASS, glossy } from "./gloss";
import type { LampPair, Lamps, Lit } from "./headlights";
import { COACH, COACH_LAMPS, coachDecals, coachParts, SCREENS } from "./coaches";
import { CHIP, CHIP_LAMPS, chipDecals, chipParts } from "./chipvan";
import { GameMap, GRENVILLE, Mover, PATHS, roadHalf, TILE_CAR, tileKey } from "./map";

export type VKind = "bus" | "minibus" | "school" | "xr3i" | "robin" | "nova" | "metro" | "sierra" | "police" | "transit" | "icecream" | "milkfloat" | "c5" | "roller" | "car" | "landrover" | "golf" | "golfdriver" | "paramount" | "alizee" | "chipvan";
/** Arleen's coaches (coaches.ts): a Plaxton Paramount or a Van Hool Alizée. */
export const isCoach = (k: VKind) => k === "paramount" || k === "alizee";

interface Spec {
  name: string;                   // as the HUD says it
  L: number; W: number; H: number;
  waist: number;                  // rounds go over this, through the windows
  wb: number;                     // wheelbase
  top: number;                    // top speed, m/s
  accel: number; brake: number; rev: number;   // m/s², m/s², top speed backwards
  steer: number;                  // full lock, radians
  grip: number;                   // cornering, m/s², before it starts to slide
  donut?: number;                 // how fast it spins round in a donut at full lock, rad/s (2.4 if not said)
  tip?: number;                   // cornering that rolls it over (the Robin)
  lean: number;                   // how far the body rolls in a corner
  /** Where each seat's occupant has their feet: along, up, across (+ is right). The driver's first: they're right-hand drive. */
  seats: number[][];
  cam: number;                    // how far back the chase camera sits
  mass: number;                   // how hard it hits people
  gears: number[];                // top of each gear, as a share of top speed
  engine: EngineKind;
  crush?: boolean;                // runs people over at walking pace (the roller)
  siren?: "siren" | "chimes";     // H switches it on and off
  milk?: boolean;                 // crates of bottles, which smash
  offroad?: boolean;              // as good on grass and fields as on the road, and low gears for the hills (the Land Rover)
  paint: string[];                // colours it comes in
}

/** Four seats in a small car: driver, front passenger, and two in the back. */
const four = (front: number, back: number, across: number, up = 0.05) =>
  [[front, up, across], [front, up, -across], [back, up, across * 0.95], [back, up, -across * 0.95]];

export const SPECS: Record<VKind, Spec> = {
  bus: {
    name: "Badgerline bus", L: 9.6, W: 2.5, H: 4.3, waist: 1.35, wb: 5.4, top: 20, accel: 2.3, brake: 7, rev: 4,
    steer: 0.62, grip: 5, donut: 0.8, lean: 0.006, cam: 13, mass: 2.4, gears: [0.25, 0.5, 0.75, 1], engine: "diesel", paint: ["#fff"],
    // the driver, the top deck's front seats (the best view) and a few downstairs
    seats: [[3.95, 0.85, 0.62], [3.9, 2.6, -0.62], [3.9, 2.6, 0.62], [2.9, 2.6, -0.62], [2.9, 2.6, 0.62], [1.9, 2.6, -0.62], [1.9, 2.6, 0.62],
      [-0.5, 2.6, -0.62], [-0.5, 2.6, 0.62], [2.4, 0.5, -0.62], [1.4, 0.5, 0.62], [-1.5, 0.5, -0.62], [-2.5, 0.5, 0.62]],
  },
  minibus: {
    name: "Badgerline minibus", L: 7.0, W: 2.25, H: 2.85, waist: 1.2, wb: 3.9, top: 26, accel: 3.2, brake: 8, rev: 4.5,
    steer: 0.6, grip: 6, donut: 1.2, lean: 0.007, cam: 10, mass: 1.8, gears: [0.22, 0.45, 0.72, 1], engine: "diesel", paint: ["#fff"],
    seats: [[2.75, 0.5, 0.55], [1.6, 0.55, -0.55], [1.6, 0.55, 0.55], [0.6, 0.55, -0.55], [0.6, 0.55, 0.55], [-0.4, 0.55, -0.55], [-0.4, 0.55, 0.55],
      [-1.4, 0.55, -0.55], [-1.4, 0.55, 0.55]],
  },
  // the same size of minibus, on a school trip (daybendy.ts)
  school: {
    name: "Kingswood School minibus", L: 7.0, W: 2.25, H: 2.85, waist: 1.2, wb: 3.9, top: 26, accel: 3.2, brake: 8, rev: 4.5,
    steer: 0.6, grip: 6, donut: 1.2, lean: 0.007, cam: 10, mass: 1.8, gears: [0.22, 0.45, 0.72, 1], engine: "diesel", paint: ["#fff"],
    seats: [[2.75, 0.5, 0.55], [1.6, 0.55, -0.55], [1.6, 0.55, 0.55], [0.6, 0.55, -0.55], [0.6, 0.55, 0.55], [-0.4, 0.55, -0.55], [-0.4, 0.55, 0.55],
      [-1.4, 0.55, -0.55], [-1.4, 0.55, 0.55]],
  },
  xr3i: {
    name: "Ford Escort XR3i", L: 4.05, W: 1.64, H: 1.36, waist: 0.86, wb: 2.4, top: 42, accel: 6.5, brake: 11, rev: 7,
    steer: 0.6, grip: 10, donut: 2.8, lean: 0.005, seats: four(-0.25, -1.15, 0.36), cam: 6.5, mass: 1, gears: [0.2, 0.38, 0.58, 0.8, 1], engine: "petrol",
    paint: XR3I_PAINT,
  },
  robin: {
    name: "Reliant Robin", L: 3.35, W: 1.43, H: 1.4, waist: 0.86, wb: 2.15, top: 30, accel: 4.6, brake: 8, rev: 6,
    steer: 0.62, grip: 9, tip: 6.5, lean: 0.008, seats: four(-0.2, -1.0, 0.32), cam: 6, mass: 0.8, gears: [0.24, 0.48, 0.74, 1], engine: "tinny",
    paint: ["#e2b42a", "#8fb5d2", "#c9632a", "#7b5333", "#d6cdb0", "#8aa23c"],
  },
  nova: {
    name: "Vauxhall Nova", L: 3.62, W: 1.53, H: 1.36, waist: 0.86, wb: 2.34, top: 40, accel: 5.8, brake: 10, rev: 7,
    steer: 0.62, grip: 10, lean: 0.006, seats: four(-0.15, -1.0, 0.34), cam: 6, mass: 0.9, gears: [0.22, 0.42, 0.62, 0.82, 1], engine: "petrol",
    paint: ["#eeeeea", "#c0201c", "#1a1b1d", "#2a4f92", "#a9acb0"],
  },
  metro: {
    name: "Austin Metro", L: 3.4, W: 1.55, H: 1.36, waist: 0.88, wb: 2.25, top: 36, accel: 4.8, brake: 9, rev: 6,
    steer: 0.62, grip: 9, lean: 0.007, seats: four(-0.15, -1.0, 0.34), cam: 6, mass: 0.85, gears: [0.24, 0.48, 0.74, 1], engine: "tinny",
    paint: ["#cdbf98", "#6b4a2e", "#3c5a3a", "#a8281f", "#eeeeea", "#4a6f9a"],
  },
  sierra: {
    name: "Ford Sierra", L: 4.43, W: 1.7, H: 1.37, waist: 0.88, wb: 2.6, top: 46, accel: 6.2, brake: 11, rev: 7,
    steer: 0.58, grip: 10, lean: 0.005, seats: four(-0.2, -1.2, 0.38), cam: 7, mass: 1.1, gears: [0.2, 0.38, 0.58, 0.8, 1], engine: "petrol",
    paint: ["#a9adb2", "#5a1a22", "#eeeeea", "#1d2a4a", "#b8a06a", "#1b1c1f"],
  },
  police: {
    name: "Police Sierra", L: 4.43, W: 1.7, H: 1.37, waist: 0.88, wb: 2.6, top: 50, accel: 6.8, brake: 12, rev: 7,
    steer: 0.58, grip: 11, lean: 0.005, seats: four(-0.2, -1.2, 0.38), cam: 7, mass: 1.1, gears: [0.2, 0.38, 0.58, 0.8, 1], engine: "petrol",
    siren: "siren", paint: ["#f4f4f0"],
  },
  transit: {
    name: "Ford Transit", L: 4.6, W: 1.95, H: 2.05, waist: 1.0, wb: 2.7, top: 34, accel: 4.5, brake: 9, rev: 6,
    steer: 0.6, grip: 8, lean: 0.009, cam: 8, mass: 1.4, gears: [0.22, 0.45, 0.72, 1], engine: "diesel",
    // two up front, and your mates in the back
    seats: [[1.0, 0.3, 0.45], [1.0, 0.3, -0.45], [-0.6, 0.3, 0.5], [-0.6, 0.3, -0.5], [-1.6, 0.3, 0.5], [-1.6, 0.3, -0.5]],
    paint: ["#f2f2ee", "#f2f2ee", "#c9201c", "#1f3f7a", "#e9e2c8"],
  },
  icecream: {
    name: "Mr Whippy van", L: 5.0, W: 2.0, H: 2.45, waist: 1.05, wb: 2.9, top: 26, accel: 3.2, brake: 8, rev: 5,
    steer: 0.6, grip: 6, lean: 0.01, cam: 9, mass: 1.6, gears: [0.25, 0.5, 0.75, 1], engine: "diesel", siren: "chimes",
    seats: [[1.45, 0.3, 0.5], [1.45, 0.3, -0.5], [-0.9, 0.3, -0.45], [-0.9, 0.3, 0.45]], paint: ["#f6f4ee"],
  },
  chipvan: {
    name: "Mr D's chip van", L: CHIP.L, W: CHIP.W, H: CHIP.H, waist: 1.1, wb: 3.55, top: 24, accel: 2.9, brake: 7.5, rev: 4.5,
    steer: 0.6, grip: 5.5, lean: 0.012, cam: 9.5, mass: 1.7, gears: [0.25, 0.5, 0.75, 1], engine: "diesel",
    // two up front, and two in the back by the fryers
    seats: [[1.6, 0.3, 0.5], [1.6, 0.3, -0.5], [-1.2, 0.3, 0.5], [-0.4, 0.3, 0.5]], paint: ["#c8201e"],
  },
  car: {   // any other parked car, out of the street furniture
    name: "car", L: 4.16, W: 1.76, H: 1.44, waist: 0.98, wb: 2.6, top: 38, accel: 5.5, brake: 10, rev: 7,
    steer: 0.6, grip: 9.5, donut: 2.6, lean: 0.006, seats: four(-0.35, -1.15, 0.4), cam: 6.5, mass: 1, gears: [0.2, 0.38, 0.58, 0.8, 1], engine: "petrol",
    paint: CAR_PAINT,
  },
  landrover: {   // an old Land Rover, parked out in the country mostly (makes.ts)
    name: "Land Rover", L: 3.65, W: 1.7, H: 1.98, waist: 1.2, wb: 2.24, top: 40, accel: 6.2, brake: 9, rev: 6,
    steer: 0.62, grip: 9.5, donut: 2.2, lean: 0.009, seats: four(0.3, -0.75, 0.38, 0.35), cam: 7.5, mass: 1.3, gears: [0.22, 0.45, 0.72, 1], engine: "diesel",
    offroad: true, paint: LR_PAINT,
  },
  golf: {   // every Golf about is a Mk1 GTI (makes.ts): very nearly an XR3i
    name: "Volkswagen Golf GTI", L: 3.7, W: 1.63, H: 1.39, waist: 0.86, wb: 2.4, top: 41, accel: 6.3, brake: 11, rev: 7,
    steer: 0.6, grip: 10, donut: 2.8, lean: 0.005, seats: four(-0.2, -1.1, 0.35), cam: 6.5, mass: 0.95, gears: [0.2, 0.38, 0.58, 0.8, 1], engine: "petrol",
    paint: GOLF_PAINT,
  },
  golfdriver: {   // the one Golf Driver, parked on Royal Avenue by Royal Victoria Park (golfdriver.ts): the GTI's looks on a 1.6
    name: "Volkswagen Golf Driver", L: 3.7, W: 1.63, H: 1.39, waist: 0.86, wb: 2.4, top: 37, accel: 5.5, brake: 11, rev: 7,
    steer: 0.6, grip: 10, donut: 2.8, lean: 0.005, seats: four(-0.2, -1.1, 0.35), cam: 6.5, mass: 0.95, gears: [0.2, 0.38, 0.58, 0.8, 1], engine: "petrol",
    paint: [PETROL_BLUE],
  },
  // Arleen's coaches (coaches.ts): long and heavy, slow off the mark but happy at seventy on the open road
  paramount: {
    name: "Arleen coach (Plaxton Paramount)", L: COACH.L, W: COACH.W, H: COACH.H[0], waist: 1.85, wb: COACH.front - COACH.rear, top: 31, accel: 2.4, brake: 7, rev: 4,
    steer: 0.6, grip: 5, donut: 0.8, lean: 0.006, cam: 15, mass: 2.4, gears: [0.18, 0.36, 0.55, 0.78, 1], engine: "diesel", paint: ["#f4f4f0"],
    // the driver low down at the front, and everyone else up high behind, the front seats first
    seats: [[5.05, 0.85, 0.75], [4.2, 1.2, -0.72], [4.2, 1.2, -0.3], [3.3, 1.2, 0.72], [3.3, 1.2, -0.72], [2.4, 1.2, 0.72], [2.4, 1.2, -0.72],
      [1.5, 1.2, 0.72], [1.5, 1.2, -0.72], [-0.3, 1.2, 0.72], [-0.3, 1.2, -0.72], [-3.0, 1.2, 0.72], [-3.0, 1.2, -0.72], [-5.0, 1.2, 0]],
  },
  alizee: {
    name: "Arleen coach (Van Hool Alizée)", L: COACH.L, W: COACH.W, H: COACH.H[1], waist: 1.8, wb: COACH.front - COACH.rear, top: 31, accel: 2.5, brake: 7, rev: 4,
    steer: 0.6, grip: 5, donut: 0.8, lean: 0.006, cam: 15, mass: 2.4, gears: [0.18, 0.36, 0.55, 0.78, 1], engine: "diesel", paint: ["#f4f4f0"],
    seats: [[5.05, 0.85, 0.75], [4.2, 1.2, -0.72], [4.2, 1.2, -0.3], [3.3, 1.2, 0.72], [3.3, 1.2, -0.72], [2.4, 1.2, 0.72], [2.4, 1.2, -0.72],
      [1.5, 1.2, 0.72], [1.5, 1.2, -0.72], [-0.3, 1.2, 0.72], [-0.3, 1.2, -0.72], [-3.0, 1.2, 0.72], [-3.0, 1.2, -0.72], [-5.0, 1.2, 0]],
  },
  milkfloat: {
    name: "Milk float", L: 3.8, W: 1.5, H: 2.07, waist: 0.9, wb: 2.3, top: 7, accel: 1.4, brake: 5, rev: 3,
    steer: 0.62, grip: 5, lean: 0.006, seats: [[1.35, 0.5, 0.1]], cam: 7, mass: 1.3, gears: [1], engine: "electric", milk: true,
    paint: ["#f2f0e8"],
  },
  c5: {
    name: "Sinclair C5", L: 1.75, W: 0.75, H: 0.65, waist: 0.5, wb: 1.25, top: 6.7, accel: 1.6, brake: 5, rev: 2,
    steer: 0.62, grip: 6, lean: 0.01, seats: [[-0.15, -0.05, 0]], cam: 4.2, mass: 0.25, gears: [1], engine: "electric",
    paint: ["#f2f2ee"],
  },
  roller: {
    name: "Heavy roller", L: 2.9, W: 1.6, H: 1.55, waist: 1.0, wb: 1.75, top: 3.2, accel: 1.2, brake: 4, rev: 2,
    steer: 0.55, grip: 4, lean: 0.002, seats: [[-0.6, 1.0, 0]], cam: 7, mass: 12, gears: [0.5, 1], engine: "diesel", crush: true,
    paint: ["#2f6b3c"],
  },
};

/** What an everyday car of this make (makes.ts) drives as: a Land Rover, a Golf GTI and an XR3i have their own, the rest are just cars. */
const kindOfMake = (make: number): VKind => (make === LAND_ROVER ? "landrover" : make === GOLF ? "golf" : make === XR3I ? "xr3i" : make === PARAMOUNT ? "paramount" : make === ALIZEE ? "alizee" : "car");

const GREEN = "#2f7a3a", YELLOW = "#f2c318";   // Badgerline
const DELAY = 110;                              // ms behind real time, as for other players
const TRACKIE = "#9a9da0";                      // what the naughty boys at the wheel are wearing
const UNIFORM = "#3b5f8a";                      // and a Badgerline driver

/** What the keys or the stick are doing to a vehicle. */
export interface Controls { throttle: number; steer: number; handbrake: boolean; horn: boolean }

/** Something that gives way when you drive into it (a car in the traffic, a parked car, a vehicle nobody's in): which way
 * it's going, and how heavy it is against a car. kerb: for a car still parked in the street furniture, its vehicle number. */
export interface Loose extends Mover { n: number; vx: number; vz: number; mass: number; kerb?: number }
/** The traffic, to plough through: what's about, and who to tell when you knock one (dv: the change in its speed, m/s; spin: rad/s). */
export interface Shove { list: Iterable<Loose>; hit: (o: Loose, dvx: number, dvz: number, spin: number) => void }
const BOUNCE = 0.3;                             // how much two cars bounce apart when they meet

/**
 * Where the box of mover o is pushing into a row of circles of radius r along mover m (at these
 * distances along it): the way out for m, how deep it's in, and the point they touch. Null if they don't.
 */
export function contact(m: Mover, along: number[], r: number, o: Mover): { nx: number; nz: number; depth: number; px: number; pz: number } | null {
  const c = Math.cos(m.a), s = Math.sin(m.a), oc = Math.cos(o.a), os = Math.sin(o.a);
  let best: { nx: number; nz: number; depth: number; px: number; pz: number } | null = null;
  for (const k of along) {
    // into o's own frame: u along it, w across
    const dx = m.x + k * c - o.x, dz = m.z - k * s - o.z, u = dx * oc - dz * os, w = dx * os + dz * oc;
    if (Math.abs(u) >= o.hl + r || Math.abs(w) >= o.hw + r) continue;
    const cu = Math.max(-o.hl, Math.min(o.hl, u)), cw = Math.max(-o.hw, Math.min(o.hw, w));
    let eu = 0, ew = 0, depth: number;
    if (cu === u && cw === w) {
      // right inside it: out through the nearest side
      if (o.hl - Math.abs(u) < o.hw - Math.abs(w)) { eu = u < 0 ? -1 : 1; depth = o.hl - Math.abs(u) + r; }
      else { ew = w < 0 ? -1 : 1; depth = o.hw - Math.abs(w) + r; }
    } else {
      const d = Math.hypot(u - cu, w - cw);
      if (d >= r) continue;
      eu = (u - cu) / d; ew = (w - cw) / d; depth = r - d;
    }
    if (!best || depth > best.depth) best = { nx: eu * oc + ew * os, nz: -eu * os + ew * oc, depth, px: o.x + cu * oc + cw * os, pz: o.z - cu * os + cw * oc };
  }
  return best;
}

/** How hard a push at (px, pz) of (fx, fz) turns something centred at (x, z), as a change in its heading's rate (+ is left) per unit of push. */
export const twist = (x: number, z: number, px: number, pz: number, fx: number, fz: number) => fx * (pz - z) - fz * (px - x);

// ---- models ---------------------------------------------------------------------------------
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r: number, h: number, seg = 10) => new THREE.CylinderGeometry(r, r, h, seg);
/** Wheels [along, across, radius, width], with hubs. */
const wheels = (at: number[][], col = "#151515", hub = "#a7abb0"): Part[] => at.flatMap(([x, z, r, w]) => [
  [cyl(r, w, 14), col, x, r, z, Math.PI / 2] as Part, [cyl(r * 0.6, w + 0.01), hub, x, r, z, Math.PI / 2] as Part,
]);
const BLACK = "#18191b", LAMP = "#e9ecee", TAIL = "#a3221b", PLATE = "#f2f2ea", REAR_PLATE = "#e8c42a";
const PAINT = "paint";   // parts in the vehicle's own colour

/** A hatchback from its side profile and cabin, with its windows, plus its own bits (b, c: where its pillars are, as for pillars()). */
function hatch(body: number[][], cab: number[][], W: number, cabW: number, bits: Part[], b?: number, c?: number): Part[] {
  return [
    [prof(body, W), PAINT, 0, 0, 0], [prof([...cab, [cab[3][0], cab[0][1]]], cabW), PAINT, 0, 0, 0],
    [prof(glass(cab), cabW + 0.04), GLASS, 0, 0, 0], ...pillars(cab, cabW, PAINT, b, c), ...bits,
  ];
}
/** Bumpers, lights and plates for a car whose ends are at +f and -b. */
function ends(f: number, b: number, W: number, y: number, lampW: number, lamps: number, bumper = BLACK): Part[] {
  return [
    [box(0.14, 0.2, W + 0.02), bumper, f - 0.04, 0.4, 0], [box(0.14, 0.2, W + 0.02), bumper, -b + 0.04, 0.42, 0],
    [box(0.04, 0.13, lampW), LAMP, f - 0.01, y, lamps], [box(0.04, 0.13, lampW), LAMP, f - 0.01, y, -lamps],
    [box(0.04, 0.15, lampW), TAIL, -b + 0.01, y + 0.1, lamps], [box(0.04, 0.15, lampW), TAIL, -b + 0.01, y + 0.1, -lamps],
    [box(0.03, 0.11, 0.48), PLATE, f + 0.04, 0.4, 0], [box(0.03, 0.11, 0.48), REAR_PLATE, -b - 0.04, 0.56, 0],
  ];
}

const sierraBody = [[-2.2, 0.3], [2.1, 0.3], [2.22, 0.48], [2.17, 0.66], [1.0, 0.82], [-1.9, 0.9], [-2.22, 0.76]];
const sierraCab = [[1.0, 0.8], [0.12, 1.35], [-0.95, 1.37], [-2.02, 0.9]];
const sierra = (bits: Part[] = []) => hatch(sierraBody, sierraCab, 1.7, 1.56, [
  ...ends(2.21, 2.21, 1.7, 0.6, 0.5, 0.48, "#2b2d30"), [box(0.04, 0.08, 1.0), "#101112", 2.2, 0.58, 0],
  ...wheels([[1.3, 0.76, 0.3, 0.2], [1.3, -0.76, 0.3, 0.2], [-1.3, 0.76, 0.3, 0.2], [-1.3, -0.76, 0.3, 0.2]]), ...bits,
]);

/** The parts of each kind, apart from the buses' painted bodies. */
const PARTS: Record<VKind, () => Part[]> = {
  // the hot hatch: a deep front air dam with driving lamps in it, black arch extensions and skirts,
  // pepperpot alloys, a red stripe down each side, and a massive wing on stalks over the tailgate
  xr3i: () => hatch([[-2.0, 0.28], [1.98, 0.28], [2.03, 0.5], [2.0, 0.68], [0.9, 0.8], [-1.6, 0.86], [-2.0, 0.8]],
    [[0.95, 0.78], [0.12, 1.33], [-0.85, 1.35], [-1.92, 0.88]], 1.64, 1.5, [
      ...ends(2.02, 2.02, 1.64, 0.61, 0.36, 0.55), [box(3.0, 0.07, 1.67), BLACK, 0, 0.55, 0],   // rubbing strips
      [box(3.02, 0.025, 1.672), "#c8221c", 0, 0.6, 0],                                           // the red stripe
      [box(0.04, 0.12, 0.7), "#101112", 2.02, 0.6, 0],                                           // the slatted grille
      [box(0.2, 0.17, 1.68), BLACK, 2.0, 0.24, 0],                                               // the air dam
      [box(0.04, 0.1, 0.16), "#f4f2d8", 2.11, 0.26, 0.5], [box(0.04, 0.1, 0.16), "#f4f2d8", 2.11, 0.26, -0.5],   // driving lamps
      [box(2.05, 0.12, 1.7), BLACK, 0, 0.3, 0],                                                  // side skirts
      ...[1.2, -1.2].flatMap((x) => [0.84, -0.84].map((z) => [box(0.82, 0.1, 0.06), BLACK, x, 0.64, z] as Part)),   // arch extensions
      [box(0.26, 0.07, 1.5), BLACK, -1.86, 0.98, 0],                                             // a lip on the tailgate
      [box(0.13, 0.5, 0.06), BLACK, -1.62, 1.25, 0.56], [box(0.13, 0.5, 0.06), BLACK, -1.62, 1.25, -0.56],   // the wing's stalks
      [box(0.62, 0.06, 1.72).rotateZ(-0.14), BLACK, -1.66, 1.5, 0],                              // the wing
      [box(0.66, 0.2, 0.04), BLACK, -1.67, 1.47, 0.87], [box(0.66, 0.2, 0.04), BLACK, -1.67, 1.47, -0.87],   // its end plates
      [box(0.03, 0.06, 1.72), "#c8221c", -1.96, 1.58, 0],                                         // and a red lip on its back edge
      ...wheels([[1.2, 0.74, 0.29, 0.2], [1.2, -0.74, 0.29, 0.2], [-1.2, 0.74, 0.29, 0.2], [-1.2, -0.74, 0.29, 0.2]], "#151515", "#cfd2d5"),
      ...[[1.2, 0.74], [1.2, -0.74], [-1.2, 0.74], [-1.2, -0.74]].map(([x, z]) => [cyl(0.06, 0.215, 8), "#3a3d40", x, 0.29, z, Math.PI / 2] as Part),   // pepperpot centres
    ], 0.62, 0.3),
  robin: () => hatch([[-1.65, 0.27], [1.5, 0.27], [1.68, 0.48], [1.64, 0.6], [0.72, 0.76], [-1.6, 0.82], [-1.67, 0.62]],
    [[0.72, 0.75], [0.12, 1.38], [-1.0, 1.4], [-1.62, 0.8]], 1.43, 1.33, [
      ...ends(1.67, 1.67, 1.3, 0.6, 0.16, 0.5, "#b9bdbf"),
      ...wheels([[1.1, 0, 0.25, 0.16], [-1.05, 0.62, 0.25, 0.16], [-1.05, -0.62, 0.25, 0.16]], "#151515", "#c9cccf"),
    ]),
  nova: () => hatch([[-1.79, 0.27], [1.75, 0.27], [1.81, 0.5], [1.79, 0.72], [0.68, 0.82], [-1.62, 0.88], [-1.81, 0.72]],
    [[0.72, 0.8], [0.18, 1.33], [-1.15, 1.35], [-1.72, 0.92]], 1.53, 1.43, [
      ...ends(1.8, 1.8, 1.53, 0.62, 0.34, 0.5), [box(0.04, 0.12, 0.6), "#101112", 1.81, 0.6, 0],
      ...wheels([[1.17, 0.69, 0.27, 0.18], [1.17, -0.69, 0.27, 0.18], [-1.17, 0.69, 0.27, 0.18], [-1.17, -0.69, 0.27, 0.18]]),
    ]),
  metro: () => hatch([[-1.69, 0.27], [1.62, 0.27], [1.7, 0.5], [1.67, 0.72], [0.62, 0.84], [-1.55, 0.92], [-1.7, 0.74]],
    [[0.68, 0.82], [0.22, 1.34], [-1.32, 1.36], [-1.62, 0.96]], 1.55, 1.45, [
      ...ends(1.69, 1.69, 1.55, 0.62, 0.3, 0.5), [box(0.04, 0.14, 0.7), "#101112", 1.7, 0.6, 0],
      ...wheels([[1.12, 0.7, 0.26, 0.18], [1.12, -0.7, 0.26, 0.18], [-1.12, 0.7, 0.26, 0.18], [-1.12, -0.7, 0.26, 0.18]]),
    ]),
  sierra: () => sierra(),
  // a jam sandwich: an orange stripe with red through it, and blue lights on a bar on the roof
  police: () => sierra([
    [box(3.9, 0.17, 1.72), "#f08a1c", 0.1, 0.62, 0], [box(3.92, 0.07, 1.725), "#d4231c", 0.1, 0.62, 0],
    [box(0.32, 0.1, 1.1), BLACK, -0.4, 1.42, 0],
  ]),
  transit: () => [
    [prof([[-2.3, 0.32], [2.22, 0.32], [2.3, 0.58], [2.27, 0.95], [1.45, 1.08], [0.95, 1.95], [-2.3, 2.0]], 1.95), PAINT, 0, 0, 0],
    [prof([[1.49, 1.08], [1.03, 1.88], [0.55, 1.88], [0.55, 1.08]], 1.97), GLASS, 0, 0, 0],
    [box(0.03, 0.45, 0.7), GLASS, -2.31, 1.55, 0.45], [box(0.03, 0.45, 0.7), GLASS, -2.31, 1.55, -0.45],   // back doors
    [box(0.04, 0.3, 1.1), "#101112", 2.29, 0.75, 0],
    ...ends(2.3, 2.3, 1.95, 0.78, 0.28, 0.68),
    ...wheels([[1.45, 0.86, 0.33, 0.22], [1.45, -0.86, 0.33, 0.22], [-1.25, 0.86, 0.33, 0.22], [-1.25, -0.86, 0.33, 0.22]]),
  ],
  icecream: () => [
    [prof([[-2.5, 0.32], [2.38, 0.32], [2.5, 0.62], [2.46, 1.02], [1.72, 1.12], [1.25, 2.05], [0.95, 2.45], [-2.5, 2.45]], 2.0), PAINT, 0, 0, 0],
    [prof([[1.76, 1.12], [1.31, 2.0], [0.95, 2.0], [0.95, 1.12]], 2.02), GLASS, 0, 0, 0],
    [box(4.6, 0.22, 2.02), "#e86a9a", -0.15, 0.72, 0], [box(3.4, 0.1, 2.02), "#79b6e0", -0.8, 2.3, 0],    // pink and blue stripes
    [box(1.6, 0.7, 0.02), "#2a3640", -0.6, 1.62, -1.01], [box(1.7, 0.06, 0.18), "#e86a9a", -0.6, 1.25, -1.08],   // the serving hatch, nearside
    [new THREE.ConeGeometry(0.26, 0.7, 10), "#d9a85a", 0.3, 2.85, 0, Math.PI],                            // a big cornet on the roof
    [new THREE.SphereGeometry(0.3, 10, 8), "#fbf6ea", 0.3, 3.22, 0], [box(0.06, 0.3, 0.06), "#5b3a22", 0.4, 3.45, 0],
    ...ends(2.48, 2.5, 2.0, 0.8, 0.26, 0.72),
    ...wheels([[1.6, 0.88, 0.34, 0.22], [1.6, -0.88, 0.34, 0.22], [-1.3, 0.88, 0.34, 0.22], [-1.3, -0.88, 0.34, 0.22]]),
  ],
  milkfloat: () => {
    const crates: Part[] = [];
    for (const along of [-1.5, -1.02, -0.54, -0.06, 0.42]) for (const across of [-0.38, 0.38]) {
      crates.push([box(0.44, 0.26, 0.36), "#2c6fb5", along, 0.83, across], [box(0.44, 0.26, 0.36), "#2c6fb5", along, 1.1, across]);
      crates.push([box(0.4, 0.07, 0.32), "#f4f4ee", along, 1.27, across]);   // bottle tops
    }
    return [
      [box(3.8, 0.3, 1.5), PAINT, 0, 0.55, 0], [box(3.82, 0.1, 1.52), "#2d63b0", 0, 0.6, 0],
      [box(0.95, 1.3, 1.5), PAINT, 1.42, 1.35, 0], [box(0.04, 0.62, 1.3), GLASS, 1.9, 1.45, 0], [box(0.6, 0.5, 1.52), GLASS, 1.42, 1.5, 0],
      [box(3.85, 0.07, 1.56), PAINT, 0, 2.03, 0],
      [box(0.07, 1.3, 0.07), "#2a2c2e", -1.85, 1.35, 0.72], [box(0.07, 1.3, 0.07), "#2a2c2e", -1.85, 1.35, -0.72],
      [box(0.08, 0.15, 1.5), BLACK, 1.92, 0.45, 0], [box(0.04, 0.12, 0.16), LAMP, 1.92, 0.8, 0.55], [box(0.04, 0.12, 0.16), LAMP, 1.92, 0.8, -0.55],
      ...crates,
      ...wheels([[1.2, 0.7, 0.24, 0.16], [1.2, -0.7, 0.24, 0.16], [-1.1, 0.7, 0.24, 0.16], [-1.1, -0.7, 0.24, 0.16]]),
    ];
  },
  c5: () => [
    [prof([[-0.85, 0.14], [0.82, 0.14], [0.9, 0.3], [0.62, 0.52], [-0.3, 0.6], [-0.85, 0.5]], 0.74), PAINT, 0, 0, 0],
    [box(1.72, 0.1, 0.76), BLACK, 0, 0.17, 0], [box(0.12, 0.42, 0.48), BLACK, -0.62, 0.72, 0],
    [cyl(0.012, 1.1, 5), "#d8d8d8", -0.8, 1.05, 0.25], [box(0.02, 0.16, 0.26), "#ff7a1a", -0.8, 1.52, 0.37],   // the flag on its mast
    ...wheels([[0.68, 0, 0.16, 0.06], [-0.55, 0.36, 0.2, 0.07], [-0.55, -0.36, 0.2, 0.07]]),
  ],
  roller: () => [
    [cyl(0.55, 1.5, 18), "#6b6e70", 0.85, 0.55, 0, Math.PI / 2],                                     // the drum
    [box(0.15, 0.15, 1.6), PAINT, 0.85, 1.12, 0], [box(1.0, 0.5, 0.06), PAINT, 0.85, 0.75, 0.79], [box(1.0, 0.5, 0.06), PAINT, 0.85, 0.75, -0.79],
    [cyl(0.42, 0.62, 16), "#6b6e70", -0.95, 0.42, 0.42, Math.PI / 2], [cyl(0.42, 0.62, 16), "#6b6e70", -0.95, 0.42, -0.42, Math.PI / 2],
    [box(1.4, 0.65, 1.3), PAINT, -0.35, 1.0, 0], [box(0.9, 0.04, 1.32), "#1f3a26", -0.2, 1.33, 0],
    [box(0.45, 0.08, 0.45), "#1a1a1a", -0.6, 1.42, 0], [box(0.08, 0.35, 0.45), "#1a1a1a", -0.85, 1.6, 0],
    [cyl(0.03, 0.5, 6), "#222", -0.2, 1.55, 0], [cyl(0.18, 0.03, 12), "#222", -0.25, 1.8, 0], [cyl(0.05, 0.6, 6), "#333", 0.2, 1.6, 0.45],
  ],
  car: () => [],   // the street furniture's own model (buildBody)
  landrover: () => [],   // and the Land Rover's
  golf: () => [],        // and the Golf GTI's
  golfdriver: () => [],
  chipvan: chipParts,
  paramount: () => coachParts(0),
  alizee: () => coachParts(1),
  bus: () => busTrim("bus"),
  minibus: () => busTrim("minibus"),
  school: () => busTrim("school"),
};

// ---- the buses: painted boxes in Badgerline's green and yellow ------------------------------
// (and the school's minibus, white with a navy skirt and the school's name down the side)
type BusKind = "bus" | "minibus" | "school";
const isBus = (kind: VKind): kind is BusKind => kind === "bus" || kind === "minibus" || kind === "school";
interface Livery {
  decks: 1 | 2; base: number; axles: number[]; r: number; dest: string; fleet: string;
  body: string; skirt: string; roof: string; name: string; badger: boolean;
}
const BADGERLINE = { body: YELLOW, skirt: GREEN, roof: "#e9c11c", name: "Badgerline", badger: true };
const LIVERY: Record<BusKind, Livery> = {
  bus: { decks: 2, base: 0.45, axles: [2.6, -2.8], r: 0.5, dest: "2  COMBE DOWN", fleet: "8607", ...BADGERLINE },
  minibus: { decks: 1, base: 0.4, axles: [2.15, -1.75], r: 0.4, dest: "4  BATH SPA", fleet: "3812", ...BADGERLINE },
  school: { decks: 1, base: 0.4, axles: [2.15, -1.75], r: 0.4, dest: "SCHOOL TRIP", fleet: "", body: "#f2f1ec", skirt: "#1f2c57", roof: "#ecebe6", name: "KINGSWOOD SCHOOL", badger: false },
};

/** The everyday car's lamps (furniture.ts draws them), for headlights.ts. */
export const CAR_LAMPS: Lamps = { front: [2.08, 0.7, 0.55, 0.5, 0.12], back: [-2.08, 0.8, 0.6, 0.42, 0.12] };
/** Where each kind's headlamps and tail lights are (as ends() and the buses' painted ends draw them), to light up after dark. */
const LAMPS: Partial<Record<VKind, Lamps>> = (() => {
  const ended = (f: number, b: number, y: number, lampW: number, lamps: number): Lamps =>
    ({ front: [f, y, lamps, lampW, 0.13], back: [-b, y + 0.1, lamps, lampW, 0.15] });
  const bus = (kind: BusKind): Lamps => {
    const S = SPECS[kind], base = LIVERY[kind].base, f = S.L / 2, hw = S.W / 2;
    return { front: [f, base + 0.35, hw - 0.3, 0.4, 0.2], back: [-f, base + 0.45, hw - 0.225, 0.25, 0.4] };
  };
  const sierra = ended(2.21, 2.21, 0.6, 0.5, 0.48);
  return {
    xr3i: ended(2.02, 2.02, 0.61, 0.36, 0.55), robin: ended(1.67, 1.67, 0.6, 0.16, 0.5), nova: ended(1.8, 1.8, 0.62, 0.34, 0.5),
    metro: ended(1.69, 1.69, 0.62, 0.3, 0.5), sierra, police: sierra, transit: ended(2.3, 2.3, 0.78, 0.28, 0.68),
    icecream: ended(2.48, 2.5, 0.8, 0.26, 0.72), milkfloat: { front: [1.93, 0.8, 0.55, 0.16, 0.12] as LampPair },
    car: CAR_LAMPS, bus: bus("bus"), minibus: bus("minibus"), school: bus("school"),
    landrover: { front: [1.85, 0.94, 0.64, 0.17, 0.17], back: [-1.85, 0.82, 0.7, 0.1, 0.12] },
    golf: { front: [1.93, 0.63, 0.55, 0.16, 0.16], back: [-1.91, 0.7, 0.55, 0.34, 0.15] },
    golfdriver: { front: [1.93, 0.63, 0.55, 0.16, 0.16], back: [-1.91, 0.7, 0.55, 0.34, 0.15] },
    paramount: COACH_LAMPS, alizee: COACH_LAMPS, chipvan: CHIP_LAMPS,
  };
})();

function busTrim(kind: BusKind): Part[] {
  const S = SPECS[kind], Lv = LIVERY[kind], f = S.L / 2, hw = S.W / 2, mirror = Lv.decks === 2 ? 2.35 : 1.95;
  return [
    [box(0.12, 0.3, S.W + 0.02), BLACK, f + 0.02, Lv.base + 0.15, 0], [box(0.12, 0.3, S.W + 0.02), BLACK, -f - 0.02, Lv.base + 0.15, 0],
    [box(0.06, 0.06, 0.3), BLACK, f - 0.1, mirror, hw + 0.13], [box(0.06, 0.06, 0.3), BLACK, f - 0.1, mirror, -hw - 0.13],   // mirrors
    [box(0.08, 0.4, 0.22), BLACK, f - 0.05, mirror - 0.2, hw + 0.3], [box(0.08, 0.4, 0.22), BLACK, f - 0.05, mirror - 0.2, -hw - 0.3],
    ...wheels(Lv.axles.flatMap((a) => [[a, hw - 0.13, Lv.r, 0.3], [a, -hw + 0.13, Lv.r, 0.3]]), "#151515", "#8d9196"),
  ];
}

// a bus's windows catch the sky, so close to they read as glass rather than a dark hole
const WIN = "#25313a";
function glassFill(g: CanvasRenderingContext2D, top: number, bottom: number): CanvasGradient {
  const f = g.createLinearGradient(0, top, 0, bottom);
  f.addColorStop(0, "#c8d6e0"); f.addColorStop(0.45, "#7a8fa0"); f.addColorStop(1, "#3c4c58");
  return f;
}

/** One side of a bus, front at the right end (or the left: the nearside, with the door). */
function busSide(kind: BusKind, frontRight: boolean): THREE.CanvasTexture {
  const S = SPECS[kind], Lv = LIVERY[kind], k = 1024 / S.L, w = 1024, h = Math.round((S.H - Lv.base) * k);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  const X = (along: number) => (frontRight ? along : S.L - along) * k;   // along: metres from the back
  const Y = (up: number) => (S.H - up) * k;
  const rect = (a0: number, a1: number, u0: number, u1: number, col: string) => {
    g.fillStyle = col === WIN ? glassFill(g, Y(u1), Y(u0)) : col;
    const x0 = X(a0), x1 = X(a1);
    g.fillRect(Math.min(x0, x1), Y(u1), Math.abs(x1 - x0), (u1 - u0) * k);
  };
  const two = Lv.decks === 2, skirt = two ? 1.38 : 1.15, win = two ? [1.48, 2.3] : [1.22, 2.2], band = two ? 2.58 : 2.52;
  rect(0, S.L, Lv.base, S.H, Lv.body);
  rect(0, S.L, Lv.base, skirt, Lv.skirt);
  rect(0, S.L, skirt, skirt + 0.04, Lv.badger ? "#1b3b20" : "#c9a23a");
  // windows: dark glass between yellow pillars, a door on the nearside at the front
  const front = S.L - 1.25;
  for (let a = 0.35; a < front - 0.2; a += 1.35) rect(a, Math.min(a + 1.2, front - 0.1), win[0], win[1], WIN);
  rect(front + 0.1, S.L - 0.2, win[0], win[1], WIN);
  if (!frontRight) { rect(front - 0.15, S.L - 0.35, Lv.base + 0.05, win[1], "#1d262d"); rect(front + 0.38, front + 0.42, Lv.base + 0.05, win[1], Lv.body); }
  if (two) for (let a = 0.3; a < S.L - 0.4; a += 1.48) rect(a, Math.min(a + 1.33, S.L - 0.25), 2.88, 3.7, WIN);
  // the wheel arches
  g.fillStyle = "#141516";
  for (const ax of Lv.axles) { g.beginPath(); g.arc(X(S.L / 2 + ax), Y(Lv.r), (Lv.r + 0.12) * k, Math.PI, 0); g.fill(); }
  // the fleetname, with a badger's head (white face, black stripes) beside it; or the school's name
  // on the skirt, in gold
  const cx = X(S.L * 0.5);
  g.textAlign = "center"; g.textBaseline = "middle";
  if (Lv.badger) {
    g.fillStyle = Lv.skirt;
    g.font = `italic 800 ${Math.round((two ? 0.36 : 0.3) * k)}px "Helvetica Neue", Arial, sans-serif`;
    g.fillText(Lv.name, cx, Y(band));
    const bx = cx + (frontRight ? -1 : 1) * (two ? 2.25 : 1.9) * k, by = Y(band);
    g.fillStyle = "#f8f8f4"; g.beginPath(); g.ellipse(bx, by, 0.28 * k, 0.19 * k, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#151515";
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(bx, by + s * 0.085 * k, 0.26 * k, 0.045 * k, 0, 0, Math.PI * 2); g.fill(); }
  } else {
    g.fillStyle = "#e3c25a";
    g.font = `700 ${Math.round(0.3 * k)}px Georgia, "Times New Roman", serif`;
    g.fillText(Lv.name, X(S.L * 0.45), Y((Lv.base + skirt) / 2), 4.6 * k);
  }
  g.font = `700 ${Math.round(0.14 * k)}px "Helvetica Neue", Arial, sans-serif`;
  g.fillStyle = "#f4f1e6";
  g.fillText(Lv.fleet, X(S.L - 1.6), Y(skirt - 0.35));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The front (with the destination blind) or the back of a bus. */
function busEnd(kind: BusKind, front: boolean): THREE.CanvasTexture {
  const S = SPECS[kind], Lv = LIVERY[kind], k = 1024 / SPECS.bus.L, w = Math.round(S.W * k), h = Math.round((S.H - Lv.base) * k);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  const Y = (up: number) => (S.H - up) * k;
  const rect = (x0: number, x1: number, u0: number, u1: number, col: string) => { g.fillStyle = col === WIN ? glassFill(g, Y(u1), Y(u0)) : col; g.fillRect(x0 * k, Y(u1), (x1 - x0) * k, (u1 - u0) * k); };
  const two = Lv.decks === 2, skirt = two ? 1.38 : 1.15, W = S.W, mid = W / 2;
  rect(0, W, Lv.base, S.H, Lv.body);
  rect(0, W, Lv.base, skirt, Lv.skirt);
  if (front) {
    const ws = two ? [1.45, 2.38] : [1.2, 2.25], blind = two ? [2.45, 2.76] : [2.32, 2.66];
    rect(0.08, mid - 0.03, ws[0], ws[1], WIN); rect(mid + 0.03, W - 0.08, ws[0], ws[1], WIN);   // windscreen
    rect(0.25, W - 0.25, blind[0], blind[1], "#0d0d0d");                                                    // destination blind
    g.fillStyle = "#ffb52a"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `700 ${Math.round(0.19 * k)}px "Helvetica Neue", Arial, sans-serif`;
    g.fillText(Lv.dest, mid * k, Y((blind[0] + blind[1]) / 2));
    if (two) { rect(0.1, mid - 0.05, 2.86, 3.7, WIN); rect(mid + 0.05, W - 0.1, 2.86, 3.7, WIN); }
    rect(mid - 0.55, mid + 0.55, Lv.base + 0.1, Lv.base + 0.65, "#16181a");                                 // grille
    rect(0.1, 0.5, Lv.base + 0.25, Lv.base + 0.45, "#eef0e6"); rect(W - 0.5, W - 0.1, Lv.base + 0.25, Lv.base + 0.45, "#eef0e6");
    rect(mid - 0.3, mid + 0.3, Lv.base + 0.02, Lv.base + 0.12, "#f2f2ea");                                   // plate
  } else {
    for (let u = Lv.base + 0.15; u < skirt - 0.1; u += 0.12) rect(0.4, W - 0.4, u, u + 0.05, "#16181a");   // engine louvres
    if (two) rect(0.3, W - 0.3, 2.9, 3.6, WIN); else rect(0.3, W - 0.3, 1.3, 2.1, WIN);
    rect(0.1, 0.35, Lv.base + 0.25, Lv.base + 0.65, "#b02a20"); rect(W - 0.35, W - 0.1, Lv.base + 0.25, Lv.base + 0.65, "#b02a20");
    rect(mid - 0.3, mid + 0.3, skirt - 0.05, skirt + 0.07, "#e8c42a");
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// shared between vehicles of a kind
const geos = new Map<VKind, [THREE.BufferGeometry | null, THREE.BufferGeometry, Wheel[]]>();
const busMats = new Map<VKind, THREE.Material[]>();
const paints = new Map<string, THREE.Material>();
let trimMat: THREE.Material | null = null;

/** A bus's own parts — its body, and the floors to stand on — shared by every bus of that kind. */
const busParts = new Map<VKind, { body: THREE.BufferGeometry; floors: THREE.BufferGeometry; floorMat: THREE.Material }>();
function busOwn(kind: BusKind) {
  let p = busParts.get(kind);
  if (!p) {
    const S = SPECS[kind], base = LIVERY[kind].base, floors: THREE.BufferGeometry[] = [];
    for (const y of LIVERY[kind].decks === 2 ? [base + 0.05, 2.55] : [base + 0.1]) {
      const g = new THREE.PlaneGeometry(S.L - 0.1, S.W - 0.1);
      g.rotateX(-Math.PI / 2);
      g.translate(0, y, 0);
      floors.push(g);
    }
    busParts.set(kind, (p = { body: new THREE.BoxGeometry(S.L, S.H - base, S.W), floors: mergeGeometries(floors)!, floorMat: new THREE.MeshLambertMaterial({ color: "#3a3d3a", side: THREE.DoubleSide }) }));
  }
  return p;
}

/** The paint parts and the trim, as two geometries. */
/** A kind's painted parts, its fixed trim, and its front wheels, which turn with the steering. */
function geometryOf(kind: VKind): [THREE.BufferGeometry | null, THREE.BufferGeometry, Wheel[]] {
  let g = geos.get(kind);
  if (!g) {
    const { fixed, wheels } = steerable(PARTS[kind]());
    const painted = fixed.filter((p) => p[1] === PAINT).map((p) => [p[0], "#ffffff", ...p.slice(2)] as Part);
    geos.set(kind, (g = [painted.length ? model(painted) : null, model(fixed.filter((p) => p[1] !== PAINT)), wheels]));
  }
  return g;
}

/** The front wheels as meshes of their own, each about its own centre, so they can be turned. */
/** The six planes round box b, each facing out, so what's behind all of them is inside it (for Vehicle.cutAway). */
export function boxPlanes(b: THREE.Box3): THREE.Plane[] {
  const P = (x: number, y: number, z: number, c: number) => new THREE.Plane(new THREE.Vector3(x, y, z), c);
  return [P(1, 0, 0, -b.max.x), P(-1, 0, 0, b.min.x), P(0, 1, 0, -b.max.y), P(0, -1, 0, b.min.y), P(0, 0, 1, -b.max.z), P(0, 0, -1, b.min.z)];
}

function wheelMeshes(wheels: Wheel[], mat: THREE.Material): THREE.Mesh[] {
  return wheels.map((w) => { const m = new THREE.Mesh(w.geo, mat); m.position.set(w.x, w.y, w.z); m.rotation.order = "YZX"; return m; });
}

function buildBody(kind: VKind, paint: string, make = ""): { body: THREE.Group; wheels: THREE.Mesh[] } {
  trimMat ??= glossy(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.6);
  if (kind === "car" || kind === "landrover" || kind === "golf" || kind === "golfdriver") {
    const shape = kind === "golfdriver" ? GOLF_DRIVER_SHAPE : carShape(kind === "landrover" ? LAND_ROVER : kind === "golf" ? GOLF : Math.max(0, MAKES.indexOf(make)));
    const g = new THREE.Group(), car = carSteerable(shape), mat = glossy(new THREE.MeshLambertMaterial({ vertexColors: true, color: paint }));
    g.add(new THREE.Mesh(car.body, mat));
    const wheels = wheelMeshes(car.wheels, trimMat);
    g.add(...wheels);
    if (kind === "golfdriver") g.add(driverDressing(mat, trimMat));
    g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    return { body: g, wheels };
  }
  const g = new THREE.Group(), [painted, trim, front] = geometryOf(kind);
  if (isBus(kind)) {
    const S = SPECS[kind], base = LIVERY[kind].base, own = busOwn(kind);
    let mats = busMats.get(kind);
    if (!mats) busMats.set(kind, (mats = [
      new THREE.MeshLambertMaterial({ map: busEnd(kind, true) }), new THREE.MeshLambertMaterial({ map: busEnd(kind, false) }),
      new THREE.MeshLambertMaterial({ color: LIVERY[kind].roof }), new THREE.MeshLambertMaterial({ color: "#1a1b1c" }),
      new THREE.MeshLambertMaterial({ map: busSide(kind, true) }), new THREE.MeshLambertMaterial({ map: busSide(kind, false) }),
    ]));
    const body = new THREE.Mesh(own.body, mats);
    body.position.y = base + (S.H - base) / 2;
    g.add(body);
    // floors, to stand on downstairs and up (the box's own faces only show from outside)
    g.add(new THREE.Mesh(own.floors, own.floorMat));
  }
  if (isCoach(kind)) g.add(coachDecals(kind === "paramount" ? 0 : 1));
  if (kind === "chipvan") g.add(chipDecals());
  if (painted) {
    let m = paints.get(paint);
    if (!m) paints.set(paint, (m = glossy(new THREE.MeshLambertMaterial({ color: paint }))));
    g.add(new THREE.Mesh(painted, m));
  }
  g.add(new THREE.Mesh(trim, trimMat));
  const wheels = wheelMeshes(front, trimMat);
  g.add(...wheels);
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return { body: g, wheels };
}

/** Someone sat down: shoulders and a head, where their hitboxes are. */
function figure(colour: string): THREE.Group {
  const torso = new THREE.Mesh(box(0.42, 0.5, 0.32), new THREE.MeshLambertMaterial({ color: colour }));
  torso.position.y = 0.7;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshLambertMaterial({ color: "#c79a7a" }));
  head.position.y = 1.07;
  const g = new THREE.Group();
  g.add(torso, head);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

// ---- one vehicle ----------------------------------------------------------------------------
interface Snap { t: number; x: number; z: number; a: number; vx: number; vz: number; steer: number; tip: number; flags: number }

export class Vehicle implements Mover {
  readonly spec: Spec;
  x = 0; z = 0; a = 0; y = 0; top = 0; waist = 0;
  readonly hl: number; readonly hw: number;
  vx = 0; vz = 0;                  // velocity, scene coords
  steer = 0;                       // -1..1, + is left
  spin = 0;                        // how fast it's turning, rad/s: + is left
  /** Doing donuts: the back end's out and it keeps coming round while you hold the lock and the throttle. */
  drift = false;
  /** How hard its front tyres are sliding wide, 0 to 1 (only known to whoever's driving it, for the squeal). */
  scrub = 0;
  /** Taken from the traffic: its paint and make, by number, so everyone can make the same car. */
  made?: number[];
  /** On its side (the Robin, cornering too hard): -1 or 1, which way it went; 0 on its wheels. */
  tip = 0;
  /** Who's sitting where ("" for nobody): the driver first. "@..." is a naughty boy the host is driving. */
  readonly seats: string[];
  horn = false; gas = 0; hand = false;
  braking = false;                 // the brake lights: slowing on the brakes (headlights.ts)
  reversing = false;               // and the reversing lights
  signal = 0;                      // the indicators: 1 left, -1 right, 0 off
  private signalTurn = 0;          // how far it's turned the way it's signalling since they went on, so they cancel once round the corner
  /** The siren (or the chimes) going. */
  siren = false;
  /** 0 ticking over .. 1 flat out, for the engine's note. */
  rpm = 0.2;
  /** Set for a frame when it hits something: how hard, in m/s. */
  impact = 0;
  /** Set for a frame when it goes over. */
  flipped = false;
  /** Host: when someone last got in or out (ms), so a bus nobody's using can go back into service. */
  usedAt = -1e9;
  /** Knocked about with nobody in it: seconds left of sliding to a stop (the host's, or our guess till the host's word comes). */
  coast = 0;
  /** Who knocked it, for whatever it knocks into in turn. */
  by = "";
  /** When the last update came from whoever's moving it (ms). */
  heard = -1e9;
  /** Seats nobody can take (a driving examiner's, in the front passenger seat). */
  readonly kept = new Set<number>();
  /** Host: who isn't let back in (a passenger thrown out of a driving test). */
  readonly barred = new Set<string>();
  /** Takes over from the driver's own controls for a moment (an examiner's dual-control brake, or the handbrake yanked from the back). */
  assist: ((inp: Controls) => Controls) | null = null;
  readonly root = new THREE.Group();
  private body: THREE.Group;
  private wheels: THREE.Mesh[];    // the front wheels, turned with the steering and rolling with the road
  private turn = 0; private rolled = 0;
  private figures: (THREE.Group | null)[] = [];
  private cockpit: Cockpit | null = null;   // the inside, while its driver's looking out from it (cockpit.ts)
  private cutPlanes: { local: THREE.Plane; world: THREE.Plane }[] = [];   // and the box its cabin's cut out of the body by, in its own frame and in the world
  private uncut: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];  // the body's own materials, put back when the driver looks from outside again
  private ajar = false;            // the inside shown through an open door while it's parked (doorway)
  private lights: THREE.MeshBasicMaterial[] = [];   // the police car's blue lights
  private lean = 0;                // body roll in corners, and a Robin teetering on two wheels
  private roll = 0;                // how far over it is, eased
  private tipT = 0;                // how long it's been cornering hard enough to go over
  private snaps: Snap[] = [];
  private circles: number[] = [];  // along its length, for bumping into things
  private moved = true;            // its pose needs working out again

  constructor(readonly i: number, readonly kind: VKind, readonly paint: string, private map: GameMap, private ground: (x: number, z: number, y?: number) => number, private label = "") {
    const S = (this.spec = SPECS[kind]);
    this.hl = S.L / 2; this.hw = S.W / 2;
    this.seats = S.seats.map(() => "");
    const n = Math.max(2, Math.ceil((S.L - S.W) / this.hw) + 1);
    for (let k = 0; k < n; k++) this.circles.push(-(this.hl - this.hw) + (k * Math.max(0, S.L - S.W)) / (n - 1));
    ({ body: this.body, wheels: this.wheels } = buildBody(kind, paint, label));
    if (kind === "police") {
      for (const z of [0.3, -0.3]) {
        const m = new THREE.MeshBasicMaterial({ color: "#1d3fa8" });
        const lens = new THREE.Mesh(box(0.26, 0.11, 0.36), m);
        lens.position.set(-0.4, 1.47, z);
        this.body.add(lens);
        this.lights.push(m);
      }
    }
    this.root.add(this.body);
    this.body.rotation.order = "YZX";   // heading, then pitch (about its width), then roll (about its length)
  }

  get name() { return this.label || this.spec.name; }
  /** As something to plough into: its number, and how heavy it is to shove about. */
  get n() { return this.i; }
  get mass() { return this.spec.mass * 0.6; }
  get driver() { return this.seats[0]; }
  /** Its lights, when it's being driven and on its wheels (headlights.ts lights them after dark). */
  get lit(): Lit | null {
    const lamps = LAMPS[this.kind];
    return lamps && this.driver && !this.tip && this.root.parent ? { frame: this.body, lamps, brake: this.braking, reverse: this.reversing, signal: this.signal } : null;
  }

  /** The driver flicks the indicator stalk: d is 1 for left, -1 for right; the same way again turns them off. */
  indicate(d: number) {
    this.signal = this.signal === d ? 0 : d;
    this.signalTurn = 0;
  }
  /** Forward speed, m/s (negative going backwards). */
  get speed() { return this.vx * Math.cos(this.a) - this.vz * Math.sin(this.a); }

  /** Where someone in seat k has their feet (scene coords), and the way the seat faces (a player's yaw). */
  seat(k = 0): { x: number; y: number; z: number; yaw: number } {
    const [al, up, ac] = this.spec.seats[k] ?? this.spec.seats[0], c = Math.cos(this.a), s = Math.sin(this.a);
    return { x: this.x + al * c + ac * s, y: this.y + up, z: this.z - al * s + ac * c, yaw: this.a - Math.PI / 2 };
  }

  /** The driver's own view from inside, on or off (game.ts): the inside drawn round them, and their own figure hidden. */
  inside(on: boolean) {
    if (on && this.ajar) this.doorway(null);
    if (on && !this.cockpit) {
      const S = this.spec, bus = isBus(this.kind);
      const kind = this.kind === "car" ? `car${carShape(Math.max(0, MAKES.indexOf(this.label)))}` : this.kind;
      const coach = isCoach(this.kind) ? SCREENS[this.kind === "paramount" ? 0 : 1] : null;
      this.cockpit = new Cockpit({ kind, L: S.L, coach: coach ? { foot: coach[0], top: coach[1] } : undefined, W: S.W, H: S.H, waist: S.waist, seat: S.seats[0],
        decks: bus ? LIVERY[this.kind as BusKind].decks : undefined, base: bus ? LIVERY[this.kind as BusKind].base : undefined });
      this.body.add(this.cockpit.group);
      if (this.cockpit.cut) this.cutAway(boxPlanes(this.cockpit.cut));
    } else if (!on && this.cockpit && !this.ajar) this.dropCockpit();
    if (this.figures[0]) this.figures[0].visible = !!this.seats[0] && !this.cockpit;
  }

  private dropCockpit() {
    for (const [m, mat] of this.uncut) { for (const x of [m.material].flat()) x.dispose(); m.material = mat; }
    this.uncut = []; this.cutPlanes = [];
    this.body.remove(this.cockpit!.group);
    this.cockpit!.dispose();
    this.cockpit = null;
  }

  /**
   * A door left open on a parked car (golfdriver.ts): the body cut away through the doorway (the
   * space behind all of planes b, in its own frame) and the inside drawn behind it, so you can see in
   * to the seats; null shuts it. Never while someone's driving from inside, whose view it would spoil.
   */
  doorway(b: THREE.Plane[] | null) {
    if (b && !this.ajar && !this.cockpit) {
      const S = this.spec;
      this.cockpit = new Cockpit({ kind: this.kind, L: S.L, W: S.W, H: S.H, waist: S.waist, seat: S.seats[0], doorway: true });
      this.body.add(this.cockpit.group);
      this.cutAway(b);
      this.ajar = true;
    } else if (!b && this.ajar) {
      this.dropCockpit();
      this.ajar = false;
    }
    if (!this.ajar) return;
    this.root.updateMatrixWorld(true);
    for (const p of this.cutPlanes) p.world.copy(p.local).applyMatrix4(this.body.matrixWorld);
  }

  /**
   * A car's body is solid up to its windows, so from the driver's seat you'd look down on to the top
   * of it, like a floor at the height of the doors. While you drive from inside, the body's cut away
   * round the cabin (the space behind all the planes in space, in its own frame) so the cockpit's floor,
   * seats and doors show instead. Only on your own screen: it's done with copies of the body's
   * materials, clipped to that space.
   */
  private cutAway(space: THREE.Plane[]) {
    this.cutPlanes = space.map((local) => ({ local, world: local.clone() }));
    const planes = this.cutPlanes.map((p) => p.world);
    const cut = (m: THREE.Material) => {
      const c = m.clone();
      c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey;   // (keeping its gloss: gloss.ts)
      c.clippingPlanes = planes; c.clipIntersection = true;
      return c;
    };
    for (const o of this.body.children) {
      if (!(o instanceof THREE.Mesh)) continue;   // (the cockpit, the people in it and any lettering are groups)
      this.uncut.push([o, o.material]);
      o.material = Array.isArray(o.material) ? o.material.map(cut) : cut(o.material);
    }
  }

  /** From inside: where the driver's eyes are in the world (into out), and how far the body's pitched (nose up +) and rolled. Keeps the wheel and dials going. */
  eyes(out: THREE.Vector3): { pitch: number; roll: number } {
    this.cockpit?.update(this.steer, this.speed, this.rpm, this.signal);
    this.root.updateMatrixWorld(true);
    for (const p of this.cutPlanes) p.world.copy(p.local).applyMatrix4(this.body.matrixWorld);
    out.copy(this.cockpit ? this.cockpit.eye : new THREE.Vector3(this.spec.seats[0][0], this.spec.seats[0][1] + 1.1, this.spec.seats[0][2]));
    this.body.localToWorld(out);
    return { pitch: this.body.rotation.z, roll: this.body.rotation.x };
  }

  /** The first free seat (the driver's if it is), or -1. gone: whether someone in a seat has left the game. */
  freeSeat(gone: (id: string) => boolean = () => false): number {
    return this.seats.findIndex((id, k) => !this.kept.has(k) && (!id || gone(id)));
  }

  /** How far (x, z) is from its sides: 0 inside it. */
  distance(x: number, z: number): number {
    const c = Math.cos(this.a), s = Math.sin(this.a), dx = x - this.x, dz = z - this.z;
    const u = Math.abs(dx * c - dz * s) - this.hl, w = Math.abs(dx * s + dz * c) - this.hw;
    return Math.hypot(Math.max(0, u), Math.max(0, w));
  }

  /** Somewhere clear to get out of seat k: its own side, the other side, the back or the front. */
  exitSpot(k = 0): { x: number; z: number } {
    const [al, , ac] = this.spec.seats[k] ?? this.spec.seats[0], side = ac < 0 ? -1 : 1, c = Math.cos(this.a), s = Math.sin(this.a);
    const tries = [[al, side * (this.hw + 0.6)], [al, -side * (this.hw + 0.6)], [-this.hl - 0.8, 0], [this.hl + 0.8, 0],
      [al, side * (this.hw + 1.6)], [al, -side * (this.hw + 1.6)]];
    for (const [u, w] of tries) {
      const x = this.x + u * c + w * s, z = this.z - u * s + w * c;
      if (this.map.fieldEdge(x, z) > 1 && !this.map.blocked(x, z, 0.4)) return { x, z };
    }
    const [u, w] = tries[0];
    return { x: this.x + u * c + w * s, z: this.z - u * s + w * c };
  }

  /** Put it somewhere, stopped. */
  place(x: number, z: number, a: number, tip = 0) {
    Object.assign(this, { x, z, a, tip, vx: 0, vz: 0, steer: 0, spin: 0, drift: false, horn: false, gas: 0, hand: false });
    this.snaps = [];
    this.moved = true;
  }

  /** Someone sits in seat k (their colour), or gets up (id ""). */
  sit(k: number, id: string, colour: string) {
    if (k < 0 || k >= this.seats.length) return;
    this.seats[k] = id;
    if (k === 0 && id) this.doorway(null);
    let f = this.figures[k];
    if (id && !f) {
      const [al, up, ac] = this.spec.seats[k];
      f = this.figures[k] = figure(colour);
      f.position.set(al, up, ac);
      this.body.add(f);
    }
    if (f) {
      f.visible = !!id && !(k === 0 && this.cockpit);
      if (id) ((f.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial).color.set(id === "@bus" ? UNIFORM : id.startsWith("@") ? TRACKIE : colour);
    }
    if (k === 0 && id) this.coast = 0;
    if (k === 0 && !id) { this.drift = false; this.scrub = 0; this.horn = false; this.gas = 0; this.hand = false; this.braking = this.reversing = false; this.signal = 0; this.snaps = []; }
  }

  /** Get back on its wheels (someone heaves it over as they get in). */
  right() { if (this.tip) { this.tip = 0; this.tipT = 0; this.moved = true; } }

  // ---- driving it yourself --------------------------------------------------------------------
  drive(dt: number, inp: Controls, paved: (x: number, z: number) => boolean, traffic?: Shove) {
    if (this.assist) inp = this.assist(inp);
    const S = this.spec, map = this.map, c = Math.cos(this.a), s = Math.sin(this.a);
    let vf = this.vx * c - this.vz * s, vl = this.vx * s + this.vz * c;
    const over = this.tip !== 0, thr = over ? 0 : inp.throttle, hand = !over && inp.handbrake;
    const grass = !S.crush && !S.offroad && !paved(this.x, this.z), top = S.top * (grass ? 0.6 : 1) * (this.drift ? 0.3 : 1);   // a roller's made for grass
    this.flipped = false;
    // engine and brakes
    // (the engine's own push is kept apart: front tyres sliding wide can't put it down, below)
    let push = 0;
    if (thr > 0.05) { if (vf < -0.5) vf += S.brake * dt; else push = S.accel * thr * Math.max(0, 1 - (vf / top) ** 2); }
    else if (thr < -0.05) { if (vf > 0.5) vf -= S.brake * dt; else push = -S.accel * 0.6 * -thr * Math.max(0, 1 - (vf / S.rev) ** 2); }
    vf += push * dt;
    // the hill pulls it along (stopped and off the throttle, the handbrake holds it)
    const half = S.wb / 2;
    const slope = (this.ground(this.x + c * half, this.z - s * half, this.y) - this.ground(this.x - c * half, this.z + s * half, this.y)) / S.wb;
    const held = Math.abs(thr) < 0.05 && Math.abs(vf) < 1.5;
    if (!held || over) vf -= 9.8 * slope * (S.offroad ? 0.45 : 0.75) * dt;   // a Land Rover's low range takes the hills
    // rolling resistance, more on grass and a lot on its side, and the air
    // (grass drags at the weak ones, a milk float or a C5, a bit less than it would at a car, or they'd never move)
    const drag = (over ? 7 : this.drift && thr > 0.3 ? 1.5 : hand || held ? 6 : grass ? 0.7 + Math.min(1.8, S.accel * 0.35) : 0.7) + 0.0009 * vf * vf + (Math.abs(vf) > top ? 3 : 0);
    vf = Math.abs(vf) <= drag * dt ? 0 : vf - Math.sign(vf) * drag * dt;
    // steering, and only so much grip. Brake or lift off into a corner and the weight comes forward
    // on to the front tyres, so they bite harder and the nose tucks in; foot down, it sits back and
    // the front runs wide
    const slowing = (thr > 0.05 && vf < -0.5) || (thr < -0.05 && vf > 0.5);
    const load = slowing ? 1.3 : push * vf > 0 && Math.abs(thr) > 0.3 ? 1 : 1.15;
    const grip = S.grip * (grass ? 0.7 : 1) * (hand ? 1.5 : load);
    // full lock at walking pace and round a junction, easing off the faster you go, as anyone does
    // with the wheel at speed: there, full lock asks the tyres for twice what they've got, so a
    // touch of the wheel is a touch of turn and holding it on turns as hard as it can
    this.steer += ((over ? 0 : inp.steer) - this.steer) * Math.min(1, dt * (inp.steer ? 7 : 9));
    const lock = Math.min(S.steer / (1 + Math.max(0, Math.abs(vf) - 5) / 20), Math.atan((2 * grip * S.wb) / Math.max(1, vf * vf)));
    let yaw = ((vf * Math.tan(this.steer * lock)) / S.wb) * (hand ? 1.35 : 1);
    const want = Math.abs(yaw * vf);
    this.scrub = 0;
    if (want > grip) {
      yaw = (Math.sign(yaw) * grip) / Math.max(0.1, Math.abs(vf));
      // asking for more turn than the tyres have: the front ones slide wide, scrubbing off speed and
      // spinning away the engine's push, so it slows and, slower, turns tighter (lift off and it bites)
      if (!hand && !over) {
        this.scrub = Math.min(1, want / grip - 1);
        const off = (this.scrub * grip * 0.35 + Math.abs(push) * this.scrub * 0.7) * dt;
        vf = Math.sign(vf) * Math.max(0, Math.abs(vf) - off);
      }
    }
    // donuts: pull the handbrake with some lock on and the back end comes round; keep your foot down
    // and the lock on and it keeps going round, spinning faster than the tyres would ever turn it
    const kick = hand && Math.abs(this.steer) > 0.3 && (Math.abs(vf) > 2 || thr > 0.3), hold = thr > 0.3 && Math.abs(this.steer) > 0.3;
    this.drift = !over && !S.crush && (kick || (this.drift && (hold || (hand && Math.hypot(vf, vl) > 0.5))));
    if (this.drift) yaw = this.steer * (S.donut ?? 2.4) * Math.min(1, Math.hypot(vf, vl) / 4 + Math.max(0, thr) * 0.6) * (vf < -0.5 ? -1 : 1);
    this.spin += (yaw - this.spin) * Math.min(1, dt * (this.drift ? 3 : 12));
    const lat = this.spin * vf;   // cornering, m/s²: + is a left turn going forwards
    // the back wheels follow the front ones round a corner: the body turns about its back axle,
    // so its middle moves a little towards the inside of the bend as it turns (vl is + to the
    // right), and the way it's going turns with it; a sideways slide on top of that dies away as
    // the tyres bite. With the handbrake on, or in a donut, the back end lets go: it keeps going
    // the way it was while the nose comes round
    const loose = this.drift || hand || over;
    const track = loose ? 0 : -this.spin * half;
    vl = track + (vl - track) * Math.exp(-(this.drift ? 1.6 : hand ? 1.2 : over ? 3 : grass ? 4 : 9) * dt);
    // a donut goes round its front wheels, the back end swinging out round them
    const da = this.spin * dt;
    if (this.drift) { this.x += half * (c - Math.cos(this.a + da)); this.z -= half * (s - Math.sin(this.a + da)); }
    this.a += da;
    // the indicators cancel themselves once it's gone round the corner and the wheel's back straight
    if (this.signal) {
      this.signalTurn += da * this.signal;
      if (this.signalTurn > 0.7 && Math.abs(this.steer) < 0.15) this.signal = 0;
    }
    const cn = loose ? c : Math.cos(this.a), sn = loose ? s : Math.sin(this.a);
    this.vx = vf * cn + vl * sn; this.vz = -vf * sn + vl * cn;
    // the Robin: corner too hard for too long and it lifts a wheel, then goes over
    if (S.tip && !over) {
      this.tipT = Math.abs(lat) > S.tip && Math.abs(vf) > 7 ? this.tipT + dt : Math.max(0, this.tipT - dt * 2);
      if (this.tipT > 0.35) { this.tip = lat > 0 ? 1 : -1; this.flipped = true; this.tipT = 0; }
    }
    const teeter = S.tip && this.tipT > 0 ? Math.sign(lat) * Math.min(0.3, this.tipT * 0.8) : 0;
    this.lean += (Math.max(-0.1, Math.min(0.1, lat * S.lean)) + teeter - this.lean) * Math.min(1, dt * 6);
    // move, plough through the traffic, and bump off anything else in the way
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.impact = 0;
    const soft = traffic ? new Set<Mover>(traffic.list) : null;
    if (traffic && soft) this.plough(traffic, soft);
    const pass = soft ? (m: Mover) => soft.has(m) : undefined;
    const c2 = Math.cos(this.a), s2 = Math.sin(this.a);
    for (let it = 0; it < 3; it++) {
      let bx = 0, bz = 0, best = 0;
      for (const o of this.circles) {
        const cx = this.x + o * c2, cz = this.z - o * s2;
        const p = map.collide({ x: cx, z: cz }, this.y, this.hw, this, pass);
        const d = Math.hypot(p.x - cx, p.z - cz);
        if (d > best) { best = d; bx = p.x - cx; bz = p.z - cz; }
      }
      if (best < 1e-4) break;
      this.x += bx; this.z += bz;
      const ux = bx / best, uz = bz / best, vn = this.vx * ux + this.vz * uz;
      if (vn < 0) { this.vx -= ux * vn * 1.3; this.vz -= uz * vn * 1.3; this.impact = Math.max(this.impact, -vn); }
    }
    this.horn = !over && inp.horn;
    this.gas = Math.abs(thr);
    this.hand = hand;
    // on the brakes: the throttle against the way it's going; backing up: on the throttle backwards
    this.braking = !over && ((thr > 0.05 && vf < -0.5) || (thr < -0.05 && vf > 0.5));
    this.reversing = !over && thr < -0.05 && vf <= 0.5;
    this.engineNote(dt);
    this.moved = true;
  }

  /**
   * Drive into a car in the traffic and it gives way: it's knocked on the way you hit it (and spun
   * round, if you caught it off centre), and you lose only as much speed as it takes to shift it.
   * It's a lot lighter than it ought to be, so a car ploughs through and a bus barely notices.
   */
  private plough(traffic: Shove, soft: Set<Mover>) {
    const mine = this.spec.mass;
    for (const o of soft as Set<Loose>) {
      if ((o as unknown) === this) continue;
      if (Math.abs(o.x - this.x) > this.hl + 4 || Math.abs(o.z - this.z) > this.hl + 4 || o.top < this.y + 0.45 || o.y > this.top) continue;
      const t = contact(this, this.circles, this.hw, o);
      if (!t) continue;
      // out of it (it's the other car that'll move, but not till the host says so)
      this.x += t.nx * t.depth; this.z += t.nz * t.depth;
      const vn = (this.vx - o.vx) * t.nx + (this.vz - o.vz) * t.nz;
      if (vn >= 0) continue;
      const J = (-(1 + BOUNCE) * vn) / (1 / mine + 1 / o.mass);
      this.vx += (t.nx * J) / mine; this.vz += (t.nz * J) / mine;
      this.impact = Math.max(this.impact, -vn * 0.8);
      // a clip on the corner swings the back end of both of you round
      const turns = (m: Mover, mass: number, k: number) => (k * twist(m.x, m.z, t.px, t.pz, t.nx, t.nz)) / (mass * (m.hl * m.hl + m.hw * m.hw) / 3);
      this.a += Math.max(-0.12, Math.min(0.12, turns(this, mine, J) * 0.03));
      const spin = Math.max(-4, Math.min(4, turns(o, o.mass, -J) * 0.6));
      if (J / o.mass > 0.3) traffic.hit(o, (-t.nx * J) / o.mass, (-t.nz * J) / o.mass, spin);
    }
  }

  /** Knocked by something with nobody at the wheel: off it slides, handbrake on, till it stops. */
  knock(dvx: number, dvz: number, spin: number, by: string) {
    this.vx += dvx; this.vz += dvz;
    this.a += Math.max(-0.3, Math.min(0.3, spin * 0.05));
    this.spin = spin;
    this.coast = Math.max(this.coast, 1);
    if (by) this.by = by;
    this.snaps = [];
  }

  /** Slide on for dt with nobody in it (bumping off walls, and into the traffic if given); true while it's still going. */
  slide(dt: number, paved: (x: number, z: number) => boolean, traffic?: Shove): boolean {
    this.drive(dt, { throttle: 0, steer: 0, handbrake: true, horn: false }, paved, traffic);
    this.coast -= dt;
    if (this.coast <= 0 && Math.hypot(this.vx, this.vz) < 0.3) { this.coast = 0; this.vx = this.vz = 0; this.spin = 0; }
    else this.coast = Math.max(this.coast, 0.05);
    this.hand = false;
    return this.coast > 0;
  }

  /** Lose some speed (after hitting someone). */
  slow(f: number) { this.vx *= f; this.vz *= f; }

  /** Which gear it's in and how hard the engine's working, from its speed. */
  private engineNote(dt: number) {
    const sp = Math.min(1, Math.abs(this.speed) / this.spec.top), G = this.spec.gears;
    let lo = 0, rev = 0.2;
    for (const hi of G) {
      if (sp <= hi || hi === G[G.length - 1]) { rev = 0.2 + (0.8 * (sp - lo)) / (hi - lo); break; }
      lo = hi;
    }
    const want = Math.max(rev, this.gas > 0.05 && sp < 0.03 ? 0.42 : 0.18, this.tip ? 0 : 0.18);
    this.rpm += (Math.min(1, want) - this.rpm) * Math.min(1, dt * 8);
  }

  /** What to send: [i, x, z, angle, vx, vz, steer, tip, flags]. */
  state(): number[] {
    const q = (v: number) => Math.round(v * 100) / 100;
    const flags = (this.horn ? 1 : 0) | (this.gas > 0.05 ? 2 : 0) | (this.hand ? 4 : 0) | (this.siren ? 8 : 0)
      | (this.braking ? 16 : 0) | (this.reversing ? 32 : 0) | (this.signal > 0 ? 64 : this.signal < 0 ? 128 : 0);   // (older pages ignore the bits they don't know)
    return [this.i, q(this.x), q(this.z), q(this.a), q(this.vx), q(this.vz), q(this.steer), this.tip, flags];
  }

  // ---- someone else driving it ---------------------------------------------------------------
  push(d: number[]) {
    const [, x, z, a, vx, vz, steer, tip, flags] = d;
    if (![x, z, a, vx, vz].every(Number.isFinite)) return;
    this.heard = performance.now();
    this.snaps.push({ t: this.heard, x, z, a, vx, vz, steer: steer || 0, tip: tip === 1 || tip === -1 ? tip : 0, flags: flags | 0 });
    if (this.snaps.length > 30) this.snaps.shift();
  }

  /** Move to where its driver had it a moment ago, smoothed between their updates. */
  follow(now: number, dt: number) {
    const S = this.snaps;
    if (!S.length) return;
    const t = now - DELAY;
    let a = S[0], b = S[S.length - 1];
    for (let i = 0; i < S.length - 1; i++) if (S[i].t <= t && S[i + 1].t >= t) { a = S[i]; b = S[i + 1]; break; }
    if (t >= b.t) a = b;
    const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
    let da = b.a - a.a;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    const yaw = da / Math.max(0.001, (b.t - a.t) / 1000);
    this.x = a.x + (b.x - a.x) * f; this.z = a.z + (b.z - a.z) * f; this.a = a.a + da * f;
    this.vx = a.vx + (b.vx - a.vx) * f; this.vz = a.vz + (b.vz - a.vz) * f;
    this.steer = b.steer; this.tip = b.tip;
    this.horn = !!(b.flags & 1); this.gas = b.flags & 2 ? 1 : 0; this.hand = !!(b.flags & 4); this.siren = !!(b.flags & 8);
    this.braking = !!(b.flags & 16); this.reversing = !!(b.flags & 32); this.signal = b.flags & 64 ? 1 : b.flags & 128 ? -1 : 0;
    const lat = b.t > a.t ? yaw * this.speed : 0;
    this.lean += (Math.max(-0.1, Math.min(0.1, lat * this.spec.lean)) - this.lean) * Math.min(1, dt * 6);
    this.engineNote(dt);
    this.moved = true;
  }

  // ---- drawing --------------------------------------------------------------------------------
  /** Sit it on the ground: height, and tilt from the slope under its wheels. And flash its lights. */
  pose(dt: number, now: number) {
    if (this.lights.length) {
      const on = this.siren && Math.floor(now / 250) % 2;
      this.lights[0].color.set(this.siren && on ? "#5d8bff" : "#1d3fa8");
      this.lights[1].color.set(this.siren && !on ? "#5d8bff" : "#1d3fa8");
    }
    const target = this.tip * 1.48;
    const rolling = Math.abs(target - this.roll) > 1e-3;
    if (!this.moved && !rolling) return;
    this.moved = false;
    const S = this.spec, c = Math.cos(this.a), s = Math.sin(this.a), half = S.wb / 2;
    const g = (x: number, z: number) => this.ground(x, z, this.y);
    const hF = g(this.x + c * half, this.z - s * half), hR = g(this.x - c * half, this.z + s * half);
    const hRt = g(this.x + s * this.hw, this.z + c * this.hw), hLt = g(this.x - s * this.hw, this.z - c * this.hw);
    this.y = (hF + hR) / 2;
    this.roll += (target - this.roll) * Math.min(1, dt * (this.tip ? 6 : 3));
    const over = Math.abs(Math.sin(this.roll));
    this.root.position.set(this.x, this.y + over * this.hw, this.z);
    this.body.rotation.set(this.lean + this.roll - Math.atan((hRt - hLt) / S.W), this.a, Math.atan((hF - hR) / S.wb));
    this.top = this.y + (this.tip ? S.W : S.H);
    this.waist = this.y + (this.tip ? S.W * 0.6 : S.waist);
    // the front wheels turn with the steering (less lock the faster it's going, as when driving) and roll with the road
    const sp = this.speed, want = this.steer * (S.steer / (1 + Math.abs(sp) / 24));
    this.turn += (want - this.turn) * Math.min(1, dt * 10);
    this.rolled = (this.rolled + (sp * dt) / 0.3) % (Math.PI * 2);
    for (const w of this.wheels) { w.rotation.y = this.turn; w.rotation.z = -this.rolled; }
  }
}

// ---- all of them ------------------------------------------------------------------------------
/** A seeded random number generator, so everyone builds the same vehicles in the same places. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where Mr D's chip van parks (data metres, and the way it faces): at the top of Old Bond Street, facing south down it. */
const MR_DS = { x: -1120.3, y: 2305.2, a: -1.312, map: "combe-down" };

/** Where Arleen's coaches park up for the tourists: a street by each of the sights. */
const SIGHTS = ["Royal Crescent", "The Circus", "Orange Grove", "Terrace Walk", "Charlotte Street"];

/** The Firs, by where everyone starts: one or two of everything, nose to tail. */
const FIRS: VKind[] = ["xr3i", "robin", "nova", "icecream", "metro", "police", "xr3i", "sierra", "c5", "transit", "robin", "milkfloat", "metro", "nova", "sierra"];
/** Fox Hill: the estate, and what the lads there drive. */
const FOX: VKind[] = ["nova", "nova", "metro", "nova", "xr3i", "nova", "metro"];

/** A bus stop: its flag, the way a bus stands at it, and its name (n). */
export interface Stop { x: number; z: number; a: number; n?: string }
/** Past this, a TILE_CAR number is a square's cricket roller (its pitch number added), not one of its parked cars. */
const ROLLER = 65000;
/** And past this (short of ROLLER), one of the vehicles a square starts with (startWith), numbered in order. */
const START = 64000;

/** Is this vehicle number one of a square's start-up vehicles (the buses, and the cars with keys in)? */
export function isStartup(i: number): boolean {
  if (i < TILE_CAR) return false;
  const k = (i - TILE_CAR) % 65536;
  return k >= START && k < ROLLER;
}

export class Vehicles {
  /** The ones that are vehicles now: the ones built from the start, then any parked car someone's got in. */
  readonly list: Vehicle[] = [];
  private byI = new Map<number, Vehicle>();
  /** Where the parked cars' numbers start: map.spare[k] is vehicle base + k. */
  private base = 0;
  private add: (i: number, kind: VKind, paint: string, x: number, z: number, a: number, label?: string) => Vehicle;
  /** Bus stops: where a bus can pull in (the flag's spot and the way the street runs, scene coords). */
  readonly stops: Stop[] = [];
  /** The bus stops out in each square of Bath, as it's loaded. */
  private tileStops = new WeakMap<GameMap, Stop[]>();
  private tilesSeen = -1;

  constructor(private map: GameMap, scene: THREE.Scene, ground: (x: number, z: number, y?: number) => number) {
    const rand = seeded(2718);
    this.add = (i: number, kind: VKind, paint: string, x: number, z: number, a: number, label = "") => {
      const v = new Vehicle(i, kind, paint, map, ground, label);
      v.place(x, z, a);
      v.pose(1, 0);
      this.list.push(v);
      this.byI.set(i, v);
      scene.add(v.root);
      map.movers.push(v);
      return v;
    };
    const add = (kind: VKind, x: number, z: number, a: number) => {
      const P = SPECS[kind].paint;
      return this.add(this.list.length, kind, P[Math.floor(rand() * P.length)], x, z, a);
    };
    // bus stops (the flag's spot and the way the street runs)
    for (const f of map.d.fx ?? []) if (f[0] === "bus") this.stops.push({ x: +f[1], z: -f[2], a: +f[4], n: String(f[5] ?? "") });
    this.startWith(map, this.stops, rand, add);
    // the heavy roller beside each cricket square
    for (const p of map.d.pi ?? []) {
      const at = this.rollerSpot(p);
      if (at) add("roller", at[0], at[1], at[2]);
    }
    this.base = this.list.length;
  }

  /** What a map or a square of Bath starts with, each handed to add as it's chosen: a double-decker
   *  on The Firs, the cars with the keys in that were parked along The Firs and Fox Hill, and a bus
   *  waiting at some of its stops. Everyone makes the same choices from the same map and seed. */
  private startWith(map: GameMap, stops: Stop[], rand: () => number, add: (kind: VKind, x: number, z: number, a: number, waiting?: boolean) => void) {
    // the cars that were parked on the streets you can drive along
    const spots = map.parked.map((p) => ({ x: p.x, z: -p.y, a: p.a, street: p.street }));
    const firs = spots.filter((p) => p.street === "The Firs");
    // a double-decker on The Firs, in the longest gap between two cars parked nose to tail: just
    // ahead of the one behind, with the road clear in front of it to pull out
    const bus = SPECS.bus, ahead = 2.05 + 1.5 + bus.L / 2;   // from the car behind to the bus's middle
    let best: { x: number; z: number; a: number } | null = null, bestGap = 0;
    for (const p of firs) for (const q of firs) {
      const dx = q.x - p.x, dz = q.z - p.z, gap = Math.hypot(dx, dz);
      const c = Math.cos(p.a), s = Math.sin(p.a), across = Math.abs(dx * s + dz * c);
      const turn = Math.abs(Math.atan2(Math.sin(q.a - p.a), Math.cos(q.a - p.a)));
      if (gap < ahead + bus.L / 2 + 2.05 + 5 || gap > 70 || gap <= bestGap || across > 1.2 || (turn > 0.4 && turn < Math.PI - 0.4)) continue;
      if (firs.some((o) => o !== p && o !== q && Math.hypot(o.x - p.x, o.z - p.z) < gap && Math.hypot(o.x - q.x, o.z - q.z) < gap)) continue;
      const way = dx * c - dz * s > 0 ? 1 : -1, behind = way > 0 ? p : q, ux = (dx / gap) * way, uz = (dz / gap) * way;
      for (const shift of [0, 1, 2, 3]) {
        const x = behind.x + ux * (ahead + shift), z = behind.z + uz * (ahead + shift);
        const clear = [-1, -0.5, 0, 0.5, 1, 1.35, 1.7, 2.05, 2.4].every((k) => !this.map.blocked(x + c * k * (bus.L / 2 - 1), z - s * k * (bus.L / 2 - 1), bus.W / 2));
        if (clear) { best = { x, z, a: p.a }; bestGap = gap; break; }
      }
    }
    if (best) add("bus", best.x, best.z, best.a);
    let f = 0, fox = 0;
    for (const p of spots) {
      const kind = p.street === "The Firs" ? FIRS[f++ % FIRS.length] : FOX[fox++ % FOX.length];
      add(kind, p.x, p.z, p.a);
    }
    // a bus waiting at some of the stops: double-deckers and minibuses turn and turn about. A bus
    // station is a row of stops a few metres apart, so a stop within a bus's length of one that has a
    // bus already goes without, and so does one by the square's edge, where the next square's buses
    // (which this square can't see) could pull in on top of it
    let n = 0;
    const placed: { x: number; z: number }[] = [], b = map.d.b, edge = SPECS.bus.L + 2;
    stops.forEach((s) => {
      if (rand() > 0.35) return;
      const kind: VKind = n % 2 ? "minibus" : "bus", at = this.stopSpot(s, kind);
      if (!at || placed.some((p) => Math.hypot(p.x - at.x, p.z - at.z) < SPECS.bus.L + 3)) return;
      if (b && b[2] > b[0] && (at.x < b[0] + edge || at.x > b[2] - edge || -at.z < b[1] + edge || -at.z > b[3] - edge)) return;
      placed.push(at);
      add(kind, at.x, at.z, at.a, true); n++;
    });
    // and in the square with Grenville's monument in, the school minibus, parked up on the lane by it
    const trip = this.tripSpot(map);
    if (trip) add("school", trip.x, trip.z, trip.a);
    // Arleen's coaches: a couple waiting at the bus station, and one parked up by each of the sights
    // for the tourists. They go with their square, like the buses waiting at the stops.
    const coach = (): VKind => (rand() < 0.5 ? "paramount" : "alizee"), C = SPECS.paramount, clear = (at: { x: number; z: number }) =>
      !placed.some((p) => Math.hypot(p.x - at.x, p.z - at.z) < C.L + 2) && !(b && b[2] > b[0] && (at.x < b[0] + edge || at.x > b[2] - edge || -at.z < b[1] + edge || -at.z > b[3] - edge));
    let station = 0;
    for (const f of map.d.fx ?? []) {
      if (f[0] !== "bus" || f[5] !== "Bath Bus Station" || station >= 2) continue;
      const kind = coach(), at = this.stopSpot({ x: +f[1], z: -f[2], a: +f[4] }, kind);
      if (!at || !clear(at)) continue;
      placed.push(at);
      add(kind, at.x, at.z, at.a, true); station++;
    }
    for (const street of SIGHTS) {
      const at = this.kerbSpot(map, street, C);
      if (!at || !clear(at)) continue;
      placed.push(at);
      add(coach(), at.x, at.z, at.a, true);
    }
    // and in the square with the top of Old Bond Street in, Mr D's chip van (last, so nothing else's number moves)
    const chips = this.chipSpot(map);
    if (chips) add("chipvan", chips.x, chips.z, chips.a);
    // and in the square with Royal Avenue in, the Golf Driver in its space, in place of the car the map parked there
    const golf = driverSpot(map);
    if (golf) add("golfdriver", golf.x, golf.z, golf.a);
  }

  /** Where Mr D's chip van is parked: at the top of Old Bond Street, on its west side just south of
   *  where Milsom Street becomes Old Bond Street and New Bond Street goes off east, facing down the
   *  street so its hatch opens on to it. Only in the square that spot's in, so it's made once; if
   *  something's in the way it shuffles along a little. Scene x, z and angle. */
  private chipSpot(map: GameMap): { x: number; z: number; a: number } | null {
    const b = map.d.b, S = SPECS.chipvan, M = MR_DS;
    if (this.map.d.id !== M.map || !map.d.tile || !b || M.x < b[0] || M.x >= b[2] || M.y < b[1] || M.y >= b[3]) return null;
    const ux = Math.cos(M.a), uy = Math.sin(M.a), c = Math.cos(M.a), sn = Math.sin(M.a);
    for (const [along, across] of [[0, 0], [-1, 0], [1, 0], [0, 0.4], [-2, 0.4], [2, 0.4], [-3, 0.8]]) {
      const x = M.x + ux * along - uy * across, z = -(M.y + uy * along + ux * across);
      const clear = [-1, -0.5, 0, 0.5, 1].every((k) => !this.map.blocked(x + c * k * (S.L / 2 - S.W / 2), z - sn * k * (S.L / 2 - S.W / 2), S.W / 2 - 0.05));
      if (clear) return { x, z, a: M.a };
    }
    return null;
  }

  /** Somewhere along the kerb of the street of that name in this square to park something of spec S, on the left as the traffic goes, or null if there's no room. */
  private kerbSpot(map: GameMap, street: string, S: Spec): { x: number; z: number; a: number } | null {
    for (const r of map.d.rd) {
      if (r.n !== street || PATHS.has(r.c) || r.bridge) continue;
      const way = (r.ow ?? 1) < 0 ? -1 : 1, off = Math.max(0, roadHalf(r.c, r.w) - S.W / 2 - 0.15);
      for (let k = 0; k < r.p.length - 1; k++) {
        const [ax, ay] = r.p[k], [bx, by] = r.p[k + 1], len = Math.hypot(bx - ax, by - ay);
        if (len < S.L + 2) continue;
        // the way the traffic goes, and the kerb on its left (data coordinates: x east, y north)
        const ux = ((bx - ax) / len) * way, uy = ((by - ay) / len) * way, nx = -uy, ny = ux;
        for (let s = S.L / 2 + 1; s <= len - S.L / 2 - 1; s += 3) {
          const along = way > 0 ? s : len - s, x = ax + ((bx - ax) / len) * along + nx * off, y = ay + ((by - ay) / len) * along + ny * off;
          const a = Math.atan2(uy, ux), c = Math.cos(a), sn = Math.sin(a), z = -y;
          const ok = [-1, -0.5, 0, 0.5, 1].every((q) => !this.map.blocked(x + c * q * (S.L / 2 - S.W / 2), z - sn * q * (S.L / 2 - S.W / 2), S.W / 2 - 0.05));
          if (ok) return { x, z, a };
        }
      }
    }
    return null;
  }

  /** Where the school minibus is parked on the trip to Grenville's monument (daybendy.ts): half up
   *  on the verge of Bath Road, on the monument's side, as near it as there's room for, facing on
   *  up the hill. Only in the square the monument's in, so it's made once. Scene x, z and angle. */
  private tripSpot(map: GameMap): { x: number; z: number; a: number } | null {
    const b = map.d.b, S = SPECS.school, M = GRENVILLE;
    if (!map.d.tile || !b || M.x < b[0] || M.x >= b[2] || M.y < b[1] || M.y >= b[3]) return null;
    const spots: { x: number; z: number; a: number; d: number }[] = [];
    for (const r of map.d.rd) {
      if (r.n !== "Bath Road") continue;
      for (let k = 0; k + 1 < r.p.length; k++) {
        const [x0, y0] = r.p[k], [x1, y1] = r.p[k + 1], len = Math.hypot(x1 - x0, y1 - y0);
        const d = Math.hypot(x0 - M.x, y0 - M.y);
        if (len < 0.1 || d < 25 || d > 160) continue;
        // up the hill (northwards), and out to the side the monument's on
        const up = y1 >= y0 ? 1 : -1, ux = ((x1 - x0) / len) * up, uy = ((y1 - y0) / len) * up;
        const side = (M.x - x0) * uy - (M.y - y0) * ux > 0 ? 1 : -1, off = roadHalf(r.c, r.w) - 0.3 + S.W / 2;
        const x = x0 + uy * side * off, y = y0 - ux * side * off;
        spots.push({ x, z: -y, a: Math.atan2(uy, ux), d });
      }
    }
    spots.sort((p, q) => p.d - q.d);
    for (const s of spots) {
      const c = Math.cos(s.a), sn = Math.sin(s.a);
      const clear = [-1, -0.5, 0, 0.5, 1].every((k) => !this.map.blocked(s.x + c * k * (S.L / 2 - S.W / 2), s.z - sn * k * (S.L / 2 - S.W / 2), S.W / 2 - 0.05));
      if (clear && this.map.fieldEdge(s.x, s.z) > S.L) return { x: s.x, z: s.z, a: s.a };
    }
    return null;
  }

  /** Where a cricket field's heavy roller stands, beside the square: scene x, z and angle. */
  private rollerSpot(p: NonNullable<GameMap["d"]["pi"]>[number]): number[] | null {
    if (p[0] !== "c") return null;
    const cx = p[1], cz = -p[2], a = p[3], ox = -Math.sin(a), oz = -Math.cos(a);   // across the wicket, in scene coords
    for (const d of [16, -16, 22, -22]) {
      const x = cx + ox * d, z = cz + oz * d;
      if (!this.map.blocked(x, z, 1.2)) return [x, z, a];
    }
    return null;
  }

  /** The rollers out at the cricket fields in a square of Bath (TILE_CAR numbers past ROLLER), once it's loaded. */
  private rollersIn(m: GameMap) {
    const [ti, tj] = m.d.tile ?? [0, 0];
    (m.d.pi ?? []).forEach((p, k) => {
      const i = TILE_CAR + tileKey(ti, tj) * 65536 + ROLLER + k;
      if (this.byI.has(i)) return;
      const at = this.rollerSpot(p);
      if (at) this.add(i, "roller", SPECS.roller.paint[0], at[0], at[1], at[2]);
    });
  }

  /** The vehicles a square of Bath starts with (startWith: The Firs' double-decker and the cars with
   *  the keys in, wherever that square has them), once it's loaded. */
  private startedIn = new WeakSet<GameMap>();
  private startIn(m: GameMap) {
    if (this.startedIn.has(m)) return;
    this.startedIn.add(m);
    const [ti, tj] = m.d.tile ?? [0, 0], key = tileKey(ti, tj), rand = seeded(2718 + key), here: number[] = [];
    let n = 0;
    this.startWith(m, this.stopsIn(m), rand, (kind, x, z, a, waiting) => {
      const i = TILE_CAR + key * 65536 + START + n++, P = SPECS[kind].paint, pi = Math.floor(rand() * P.length);
      // what it is goes down before the "already here" test: a guest may have built this one from
      // the host's word, and its own square is where the made-at position is known
      if (!this.started.has(i)) this.started.set(i, { kind, paint: pi, x, z });
      if (this.byI.has(i)) return;
      if (waiting) here.push(i);
      this.add(i, kind, P[pi], x, z, a);
    });
    this.waitingIn.set(m, here);
  }

  /**
   * What a square's start-up vehicles were made as, by number: the kind and paint (its index into
   * SPECS, which both sides have) a guest needs to build one whose square it hasn't loaded (the
   * "vh" message), and where it was made, so a bus that has since been moved isn't taken for one of
   * its home square's (dropSquare).
   */
  private started = new Map<number, { kind: VKind; paint: number; x: number; z: number }>();

  /** A square's start-up vehicle, from the host's word: the guest hasn't that square, so it can't
   *  build the vehicle from its own map as it does a parked car. */
  spawnStarted(i: number, kind: VKind, paint: number, x: number, z: number, a: number): Vehicle | undefined {
    // the kind and paint come from another player's message: anything that isn't a real kind, or a
    // paint that isn't an index into its list, is dropped rather than making a vehicle of no colour
    if (!Object.hasOwn(SPECS, kind) || !Number.isInteger(paint) || paint < 0) return undefined;
    const spec = SPECS[kind];
    if (!spec.paint.length) return undefined;
    // recorded without a position: this side never saw where it was made, and it's never in a
    // square's waiting list here, so dropSquare never measures it
    if (!this.started.has(i)) this.started.set(i, { kind, paint, x: NaN, z: NaN });
    return this.byI.get(i) ?? this.add(i, kind, spec.paint[paint % spec.paint.length], x, z, a);
  }

  /** A vehicle of a job's own (a driving test's learner car), numbered the same on every screen, so the host's word on who sits in it reaches it. */
  own(i: number, kind: VKind, paint: string, x: number, z: number, a: number, label = ""): Vehicle {
    return this.byI.get(i) ?? this.add(i, kind, paint, x, z, a, label);
  }

  /** The waiting buses a square of Bath was given, by the square's vehicle numbers, so they can go when it does. */
  private waitingIn = new Map<GameMap, number[]>();

  /**
   * A square has left (tiles.ts): its waiting buses go with it, so a drive across Bath doesn't pile
   * up every bus it passed, in the list the host sends all round twice a second. Nothing else goes:
   * a parked car someone's in, or that's been knocked about, is theirs now. A bus someone's in,
   * driving or just out of is left too. inUse covers the instant between asking for a seat and the
   * seat arriving (seats are the host's word and lag a tick), so boarding and leaving at once is safe.
   * A bus the host has since moved — put back into service at another stop (busService) or brought
   * in for someone (applyCall) — is not this square's to take away any more, so it's left where it
   * stands: only one still about where it was made goes.
   */
  dropSquare(m: GameMap, inUse: (v: Vehicle) => boolean = () => false) {
    const made = this.waitingIn.get(m);
    if (!made) return;
    const now = performance.now();
    for (const i of made) {
      const v = this.byI.get(i);
      if (!v || v.seats.some(Boolean) || v.coast > 0 || inUse(v) || now - v.usedAt < 60000) continue;
      const from = this.started.get(i);
      if (from && Math.hypot(v.x - from.x, v.z - from.z) > 20) continue;   // it's been moved: not ours
      this.remove(v);
    }
    this.waitingIn.delete(m);
  }

  /** A vehicle goes for good: off the scene and out of the lists. Nothing needs letting go of: every
   *  part of every vehicle, geometry and material alike, is shared by the others of its kind
   *  (geos, busMats, busParts, paints, trimMat). */
  remove(v: Vehicle) {
    v.root.removeFromParent();
    const k = this.map.movers.indexOf(v);
    if (k >= 0) this.map.movers.splice(k, 1);
    const n = this.list.indexOf(v);
    if (n >= 0) this.list.splice(n, 1);
    this.byI.delete(v.i);
  }

  /** The bus stops in a square of Bath. */
  private stopsIn(m: GameMap): Stop[] {
    let out = this.tileStops.get(m);
    if (!out) this.tileStops.set(m, (out = (m.d.fx ?? []).filter((f) => f[0] === "bus").map((f) => ({ x: +f[1], z: -f[2], a: +f[4], n: String(f[5] ?? "") }))));
    return out;
  }

  /** The bus stops within r of (x, z), in Combe Down and the squares of Bath loaded there. */
  stopsNear(x: number, z: number, r: number): Stop[] {
    return [...this.stops, ...this.map.tilesNear(x, z, r).flatMap((m) => this.stopsIn(m))].filter((s) => Math.hypot(s.x - x, s.z - z) < r);
  }

  /** Every bus stop there is just now: Combe Down's, and those of every square of Bath loaded. */
  allStops(): Stop[] {
    return [...this.stops, ...[...this.map.tiles.values()].flatMap((m) => this.stopsIn(m))];
  }

  /** Vehicle i, turning a parked car into one if it's not been driven yet; undefined if there's no such vehicle. */
  get(i: number): Vehicle | undefined {
    const had = this.byI.get(i);
    if (had || !Number.isInteger(i) || i < this.base) return had;
    // a parked car out in a square of Bath: only if that square's loaded here (if not, the host's word on it brings it: spawn)
    if (i >= TILE_CAR) {
      const [key, k] = GameMap.tileCar(i), m = this.map.tiles.get(key);
      if (k >= ROLLER) { if (m) this.rollersIn(m); return this.byI.get(i); }
      if (k >= START) { if (m) this.startIn(m); return this.byI.get(i); }
      const s = m?.spare[k];
      if (!s || s.taken) return undefined;
      const [, x, y, , a, n] = s.f as [string, number, number, number, number, number];
      return this.spawn(i, n, parkedMake(m!, x, y, k), x, -y, a);
    }
    const k = i - this.base, s = this.map.spare[k];
    if (!s || s.taken) return undefined;   // (gone: knocked into the traffic)
    const [, x, y, , a, n] = s.f as [string, number, number, number, number, number];
    this.map.takeCar(k);
    const make = parkedMake(this.map, x, y, k);
    return this.add(i, kindOfMake(make), paintFor(make, n), x, -y, a, MAKES[make]);
  }

  /** A car pulled out of the traffic (traffic.ts), or a parked one out in Bath, as vehicle i, with paint and make by number (makes.ts). */
  spawn(i: number, paint: number, make: number, x: number, z: number, a: number): Vehicle {
    make = ((make % MAKES.length) + MAKES.length) % MAKES.length;
    const v = this.byI.get(i) ?? this.add(i, kindOfMake(make), paintFor(make, paint), x, z, a, MAKES[make]);
    v.made = [paint, make];
    if (i >= TILE_CAR) this.map.takeTileCar(i);   // off the street it was parked in
    return v;
  }

  /** Where a bus of this kind would pull in at a stop, kerbside on its left, or null if there's no room. */
  stopSpot(s: Stop, kind: VKind): { x: number; z: number; a: number } | null {
    const S = SPECS[kind], tx = Math.sin(s.a), tz = Math.cos(s.a), c = Math.cos(s.a), sn = Math.sin(s.a);
    for (const off of [S.W / 2 + 0.85, S.W / 2 + 1.2, S.W / 2 + 1.6]) {
      const x = s.x + tx * off, z = s.z + tz * off;
      const clear = [-1, -0.5, 0, 0.5, 1].every((k) => !this.map.blocked(x + c * k * (S.L / 2 - S.W / 2), z - sn * k * (S.L / 2 - S.W / 2), S.W / 2 - 0.05));
      if (clear && this.map.fieldEdge(x, z) > S.L) return { x, z, a: s.a };
    }
    return null;
  }

  /** The nearest vehicle within reach of (x, z), about level with y, with a seat free (a parked car counts), if any. */
  nearest(x: number, z: number, y: number, reach: number): { i: number; name: string; driver: string } | null {
    let best: { i: number; name: string; driver: string } | null = null, bd = reach;
    for (const v of this.list) {
      if (Math.abs(v.x - x) > 12 || Math.abs(v.z - z) > 12 || Math.abs(v.y - y) > 2.5) continue;
      const d = v.distance(x, z);
      if (d < bd && v.freeSeat() >= 0 && !v.driver.startsWith("@")) { bd = d; best = v; }
    }
    const S = this.map.spare, z0 = this.map.z0;
    for (let k = 0; k < S.length; k++) {
      const [, fx, fy, fz, a] = S[k].f as [string, number, number, number, number];
      const dx = x - fx, dz = z + fy;
      if (Math.abs(dx) > 5 || Math.abs(dz) > 5 || S[k].taken || this.byI.has(this.base + k) || Math.abs(fz - z0 - y) > 2.5) continue;
      const c = Math.cos(a), s = Math.sin(a);
      const d = Math.hypot(Math.max(0, Math.abs(dx * c - dz * s) - 2.05), Math.max(0, Math.abs(dx * s + dz * c) - 0.88));
      if (d < bd) { bd = d; best = { i: this.base + k, name: MAKES[parkedMake(this.map, fx, fy, k)], driver: "" }; }
    }
    // and those parked out in Bath
    for (const m of this.map.tilesNear(x, z, 6)) {
      const [ti, tj] = m.d.tile ?? [0, 0];
      for (const k of m.spareNear(x, z, 6)) {
        const [, fx, fy, fz, a] = m.spare[k].f as [string, number, number, number, number];
        if (Math.abs(fz - z0 - y) > 2.5) continue;
        const dx = x - fx, dz = z + fy, c = Math.cos(a), s = Math.sin(a);
        const d = Math.hypot(Math.max(0, Math.abs(dx * c - dz * s) - 2.05), Math.max(0, Math.abs(dx * s + dz * c) - 0.88));
        if (d < bd) { bd = d; best = { i: TILE_CAR + tileKey(ti, tj) * 65536 + k, name: MAKES[parkedMake(m, fx, fy, k)], driver: "" }; }
      }
    }
    return best;
  }

  /** The parked cars still in the street furniture within r of (x, z), in Combe Down and out in Bath: their vehicle numbers, scene coords, angle and the ground under them. */
  parkedNear(x: number, z: number, r: number): { i: number; x: number; z: number; a: number; g: number }[] {
    const out: { i: number; x: number; z: number; a: number; g: number }[] = [], z0 = this.map.z0;
    const at = (m: GameMap, k: number, i: number) => {
      const [, fx, fy, fz, a] = m.spare[k].f as [string, number, number, number, number];
      out.push({ i, x: fx, z: -fy, a, g: fz - z0 });
    };
    for (const k of this.map.spareNear(x, z, r)) if (!this.byI.has(this.base + k)) at(this.map, k, this.base + k);
    for (const m of this.map.tilesNear(x, z, r)) {
      const [ti, tj] = m.d.tile ?? [0, 0];
      for (const k of m.spareNear(x, z, r)) at(m, k, TILE_CAR + tileKey(ti, tj) * 65536 + k);
    }
    return out;
  }

  /** Parked car i (a vehicle number) knocked out of the street furniture: off the street it comes, and where it was and its paint. Null if it's not here. */
  unpark(i: number): { x: number; z: number; a: number; paint: number } | null {
    if (!Number.isInteger(i) || i < this.base || this.byI.has(i)) return null;
    let s: GameMap["spare"][number] | undefined;
    if (i >= TILE_CAR) {
      const [key, k] = GameMap.tileCar(i);
      s = this.map.tiles.get(key)?.spare[k];
      if (!s || s.taken) return null;
      this.map.takeTileCar(i);
    } else {
      s = this.map.spare[i - this.base];
      if (!s || s.taken) return null;
      this.map.takeCar(i - this.base);
    }
    const [, x, y, , a, n] = s.f as [string, number, number, number, number, number];
    return { x, z: -y, a, paint: n % 90 };   // (90: whole rounds of both makes' colours, paintFor)
  }

  /** The make of parked car i (a vehicle number), taken or not (makes.ts). */
  parkedMakeOf(i: number): number {
    let m: GameMap | undefined = this.map, k = i - this.base;
    if (i >= TILE_CAR) { const [key, kk] = GameMap.tileCar(i); m = this.map.tiles.get(key); k = kk; }
    const s = m?.spare[k];
    return s ? parkedMake(m!, s.f[1] as number, s.f[2] as number, k) : 0;
  }

  /** The vehicle and seat someone's in, if any. */
  of(id: string): { v: Vehicle; seat: number } | undefined {
    for (const v of this.list) {
      const seat = v.seats.indexOf(id);
      if (seat >= 0) return { v, seat };
    }
    return undefined;
  }

  /** Smooth the ones other people are driving, and sit them all on the ground. local: ones driven here. */
  update(now: number, dt: number, local: (v: Vehicle) => boolean, px: number, pz: number) {
    // a square of Bath loaded: out come its cricket rollers, and the vehicles it starts with
    if (this.tilesSeen !== this.map.tilesVersion) {
      this.tilesSeen = this.map.tilesVersion;
      for (const m of this.map.tiles.values()) { this.rollersIn(m); this.startIn(m); }
    }
    for (const v of this.list) {
      // (one nobody's in, knocked sliding, is moved by the host)
      if ((v.driver && !local(v)) || (!v.driver && !local(v) && now - v.heard < 400)) v.follow(now, dt);
      v.pose(dt, now);
      v.root.visible = Math.hypot(v.x - px, v.z - pz) < 260;
    }
  }

  /** The host's word on which vehicles there are, who's sitting where, and where everything is:
   * { i: numbers, s: seats ("" each, joined by commas), p: [x, z, angle, tip, ...], m: [paint, make] for any taken from the traffic, else 0 }. */
  snapshot(): { i: number[]; s: string[]; p: number[]; m: (number[] | 0)[]; k: ([VKind, number] | 0)[] } {
    const q = (v: number) => Math.round(v * 100) / 100;
    return {
      i: this.list.map((v) => v.i), s: this.list.map((v) => v.seats.join(",")),
      p: this.list.flatMap((v) => [q(v.x), q(v.z), q(v.a), v.tip]), m: this.list.map((v) => v.made ?? 0),
      // a square's start-up vehicle: a guest without that square can't build it from its own map,
      // so its kind and paint go with it. Older pages ignore this and don't see those vehicles.
      k: this.list.map((v) => { const s = this.started.get(v.i); return s ? [s.kind, s.paint] : 0; }),
    };
  }
}
