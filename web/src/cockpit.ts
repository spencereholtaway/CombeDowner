// The inside of a vehicle, for the driver's own view (C while driving switches to it, game.ts). The
// cars share one dash, set back from each kind's own windscreen: a dashboard, a hooded binnacle with
// a speedo whose needle shows how fast you're going and a rev counter beside it, a steering wheel that
// turns as you steer, the windscreen pillars, the roof lining, the rear-view mirror, the pillars
// behind the doors and a gear stick (a golf ball on the end of it in a Golf GTI). The open ones (the
// C5 and the heavy roller) have no roof to frame. The buses have a cab of their own, being so
// different: a big flat wheel nearly lying down on its column, a long low dash under a split
// windscreen, the cab's green side panels, and an old mechanical ticket machine on its post by the
// door, with a crank handle and a coin tray: no screens, they're old buses. Arleen's coaches (coaches.ts) have the same
// sort of cab, under their own raked windscreen, in grey, with no ticket machine. A parked car with
// its driver's door left open (golfdriver.ts) shows the same inside through the doorway.
//
// Who decides what: it's only ever drawn on each player's own screen (for whoever's driving, or
// through an open door), so nothing here goes over the network.
import * as THREE from "three";
import { model, Part } from "./furniture";

/** Where a kind's windscreen starts, metres ahead of the driver's seat, and how far back its top leans. */
const SCREEN: Record<string, [number, number]> = {
  xr3i: [1.2, 0.83], robin: [0.92, 0.6], nova: [0.87, 0.54], metro: [0.83, 0.46], sierra: [1.2, 0.88], police: [1.2, 0.88],
  golf: [0.91, 0.37], golfdriver: [0.91, 0.37], landrover: [0.67, 0.02], car0: [1.45, 0.9], car1: [1.55, 0.82], car2: [1.67, 1.04], transit: [0.49, 0.46], icecream: [0.31, 0.45], chipvan: [0.55, 0.49], milkfloat: [0.55, 0],
  c5: [0.9, 0], roller: [0.7, 0],
};
const OPEN = new Set(["c5", "roller"]);
/** The everyday cars' three shapes (furniture.ts) have their own roof heights and window lines: [H, waist]. */
const SHAPE_DIMS: Record<string, [number, number]> = { car0: [1.44, 0.9], car1: [1.45, 0.95], car2: [1.58, 0.93] };

/** What the cockpit needs to know about the vehicle. kind: its kind, or for an everyday car "car" and its shape's number.
 *  seat: the driver's [along, up, across]. decks and base: a bus's. */
export interface CockpitOf { kind: string; L: number; W: number; H: number; waist: number; seat: number[]; decks?: number; base?: number; coach?: { foot: number[]; top: number[] }; doorway?: boolean }

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r: number, h: number, seg = 10) => new THREE.CylinderGeometry(r, r, h, seg);
const DASH = "#2e3033", TRIM = "#3a3b3e", LINING = "#9a958a";

/** A box from a to b (two points along and up, at across z), thick t and wide w: a pillar or a rail. */
function strut(a: number[], b: number[], z: number, t: number, w: number, col: string): Part {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return [box(len, t, w).rotateZ(ang), col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z];
}

/**
 * Turned to face the driver, leaning back tilt radians off upright towards them: its face looks back
 * at them, its right is their right (across the vehicle) and its up is their up.
 */
function facing(tilt: number): THREE.Quaternion {
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(s, c, 0), new THREE.Vector3(-c, s, 0));
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

export class Cockpit {
  readonly group = new THREE.Group();
  /** Where the driver's eyes are, in the vehicle's own frame (along, up, across). */
  readonly eye: THREE.Vector3;
  private spin = new THREE.Group();     // the steering wheel, turning about its column
  private needles: THREE.Group[] = [];  // the speedo's needle, and the rev counter's
  private arrows: THREE.Mesh[] = [];    // the indicators' green arrows on the dash, left then right
  private turns: number;                // how far the wheel turns at full lock, radians
  /** The part of the body to cut away round you while you drive, in the vehicle's own frame (vehicles.ts): the cabin of a car. Null for the open ones, buses and coaches. */
  cut: THREE.Box3 | null = null;
  private top: number;                  // what the speedo reads up to, mph

  constructor(d: CockpitOf) {
    if (SHAPE_DIMS[d.kind]) [d.H, d.waist] = SHAPE_DIMS[d.kind];
    const [al, up, ac] = d.seat, bus = d.kind === "bus" || d.kind === "minibus" || d.kind === "school" || !!d.coach;
    const open = OPEN.has(d.kind);
    this.eye = new THREE.Vector3(al - 0.05, open ? up + 0.75 : Math.min(d.H - 0.17, up + (bus ? 1.15 : 1.12)), ac);
    this.turns = bus ? 4 : 2.6;
    this.top = bus ? 60 : d.kind === "milkfloat" || d.kind === "c5" || d.kind === "roller" ? 20 : 120;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const parts = bus ? this.busCab(d) : this.carDash(d, open);
    if (parts.length) this.group.add(new THREE.Mesh(model(parts), mat));
    this.group.traverse((o) => { o.castShadow = false; o.receiveShadow = true; });
  }

  /** The cars' dash, set back from the windscreen, and everything round it. */
  private carDash(d: CockpitOf, open: boolean): Part[] {
    const [al, up, ac] = d.seat, [screen, rake] = SCREEN[d.kind] ?? SCREEN.car0, ey = this.eye.y;
    const yd = Math.min(ey - 0.25, d.waist + 0.02);     // the top of the dash, along the bottom of the windows
    const front = al + screen - 0.02, deep = Math.max(0.15, screen - 0.55), back = front - deep;
    // from the seat the lining sits a little above the real roof: at its true height the wide view makes it crowd the top of
    // the screen. Seen through an open door from outside it has to stay under the roof
    const half = d.W / 2 - 0.08, roof = d.doorway ? d.H - 0.06 : d.H + 0.02;
    const parts: Part[] = [];
    if (d.kind !== "c5") {
      parts.push([box(deep, 0.2, half * 2), d.kind === "landrover" ? "#5a5f55" : DASH, (front + back) / 2, yd - 0.1, 0]);   // the dashboard
      parts.push([box(0.16, 0.12, 0.38), DASH, back + 0.08, yd + 0.03, ac], [box(0.2, 0.02, 0.4), DASH, back + 0.06, yd + 0.1, ac]);   // the binnacle, and its hood
      parts.push([box(0.05, 0.03, 0.5), "#3a3c3e", (front + back) / 2, yd + 0.005, -ac * 0.6]);                          // the vents
    }
    if (!open) {
      // the cabin itself: the body is cut away round it while you drive (vehicles.ts), so it needs a
      // floor, the doors' insides, seats, the hump down the middle and a footwell under the dash
      const rear = Math.max(-d.L / 2 + 0.3, al - 1.45), len = front - rear, mid = (front + rear) / 2, wide = d.W / 2 - 0.03;
      const SEAT = d.kind === "xr3i" || d.kind === "golf" || d.kind === "golfdriver" ? "#3c3a44" : d.kind === "landrover" ? "#4a4a42" : "#3a3a3e";
      this.cut = new THREE.Box3(new THREE.Vector3(rear, up + 0.01, -wide), new THREE.Vector3(front, d.waist + 0.1, wide));
      // seen through an open door from outside, the floor can't hang below the body's sills
      const fl = d.doorway ? Math.max(up, 0.32) : up;
      parts.push([box(len, 0.03, wide * 2), "#2a2826", mid, fl - 0.005, 0]);                                    // the carpet
      // seen from outside through the open driver's door (doorway), that door's inside goes with the door
      for (const z of d.doorway ? [-wide + 0.03] : [wide - 0.03, -wide + 0.03]) {
        parts.push([box(len, d.waist + 0.06 - fl, 0.06), TRIM, mid, (d.waist + 0.06 + fl) / 2, z]);              // the doors' insides
        parts.push([box(0.5, 0.05, 0.09), "#2c2d30", al + 0.1, d.waist - 0.14, z - Math.sign(z) * 0.06]);       // and their armrests
      }
      if (d.kind !== "c5") parts.push([box(0.08, Math.max(0.05, yd - 0.2 - fl), wide * 2), "#1f2022", front - 0.04, (yd - 0.2 + fl) / 2, 0]);   // the footwell's end, under the dash
      parts.push([box(Math.max(0.1, back - al + 0.4), 0.16, 0.24), "#2a2b2e", (back + al - 0.4) / 2, fl + 0.08, 0]);   // the hump down the middle
      // the front seats, yours and the one beside it, and a bench in the back if there's room
      for (const z of [ac, -ac]) {
        parts.push([box(0.5, 0.14, 0.48), SEAT, al + 0.05, up + 0.32, z], [box(0.12, 0.62, 0.48).rotateZ(0.18), SEAT, al - 0.27, up + 0.68, z]);
        parts.push([box(0.1, 0.18, 0.3), SEAT, al - 0.36, up + 1.06, z]);   // the headrest
      }
      if (al - 1.0 > rear) parts.push([box(0.5, 0.14, wide * 2 - 0.1), SEAT, al - 0.95, up + 0.3, 0], [box(0.12, 0.55, wide * 2 - 0.1).rotateZ(0.2), SEAT, Math.max(rear + 0.08, al - 1.25), up + 0.62, 0]);
    }
    // the gear stick, between the seats on the driver's left
    const knob = d.kind === "golf" ? "#f4f4ee" : "#151617";
    parts.push([cyl(0.012, 0.3, 6), "#2a2b2d", al + 0.32, up + 0.42, ac - 0.36], [new THREE.SphereGeometry(d.kind === "golf" ? 0.034 : 0.026, 10, 8), knob, al + 0.32, up + 0.58, ac - 0.36]);
    if (d.kind === "golf") for (let k = 0; k < 6; k++) parts.push([new THREE.SphereGeometry(0.006, 4, 3), "#d6d6ce", al + 0.32 + 0.03 * Math.cos(k), up + 0.585 + 0.02 * Math.sin(k * 2), ac - 0.36 + 0.03 * Math.sin(k)]);   // its dimples
    if (!open) {
      const base = [front + 0.02, yd - 0.02], top = [front + 0.02 - rake, roof];
      for (const z of [half - 0.02, -half + 0.02]) parts.push(strut(base, top, z, 0.07, 0.08, TRIM));       // the windscreen pillars
      parts.push([box(0.08, 0.05, half * 2), TRIM, top[0] - 0.02, roof - 0.02, 0]);                            // the rail over the windscreen
      // and from outside the lining mustn't run on past the roof into the back window
      const rear = Math.max(-d.L / 2 + 0.3, al - (d.doorway ? 0.95 : 1.5));
      parts.push([box(top[0] - rear, 0.025, half * 2 - 0.04), LINING, (top[0] + rear) / 2, roof - 0.03, 0]);  // the roof lining
      for (const z of [half - 0.03, -half + 0.03]) parts.push([box(0.1, roof - d.waist, 0.05), TRIM, al - 0.4, (roof + d.waist) / 2, z]);   // the pillars behind the doors
      parts.push([box(0.03, 0.05, 0.2), "#1c1d1f", top[0] - 0.1, roof - 0.1, 0], [box(0.005, 0.04, 0.18), "#8b97a1", top[0] - 0.118, roof - 0.1, 0]);   // the mirror
      parts.push([box(0.012, 0.012, 0.012), "#1c1d1f", top[0] - 0.07, roof - 0.055, 0]);
    }
    if (d.kind !== "c5") {
      // the steering wheel, on a column rising towards you, and the dials behind it
      const hub = new THREE.Vector3(Math.max(al + 0.3, Math.min(back - 0.05, al + 0.45)), d.waist, ac);
      this.wheel(hub, d.kind === "landrover" || d.kind === "roller" ? 0.2 : 0.18, 0.4, d.kind === "roller" ? "#2a2a2a" : "#161718");
      if (!d.doorway) this.dials(new THREE.Vector3(back - 0.003, yd + 0.03, ac), 0.045, 0.1);   // (two dozen little meshes, unseen from outside)
    } else {
      // the C5 steers by handlebars under your knees
      parts.push([box(0.04, 0.03, 0.42), "#1b1c1d", al + 0.3, up + 0.32, ac]);
    }
    return parts;
  }

  /** The cab of a bus or a coach: its own wheel, dash, windscreen and side panels, and on a bus the ticket machine. */
  private busCab(d: CockpitOf): Part[] {
    const [al, up, ac] = d.seat, c = d.coach, f = c ? c.foot[0] : d.L / 2, base = c ? 0.35 : d.base ?? 0.45, two = !c && (d.decks ?? 2) === 2, W = d.W;
    const ws = c ? [c.foot[1], c.top[1]] : two ? [1.45, 2.38] : [1.2, 2.25], rake = c ? c.foot[0] - c.top[0] : 0;
    const win = c ? c.foot[1] : two ? 1.48 : 1.22, ceil = two ? 2.55 : d.H - 0.08, GREEN = c ? "#4a4e54" : "#2f4a35", POST = c ? "#1b1c1e" : "#1e2b22";
    const lo = [f - 0.04, ws[0]], hi = [f - 0.04 - rake, ws[1]];
    const parts: Part[] = [
      [box(0.06, ws[0] - base, W - 0.1), GREEN, f - 0.06, (base + ws[0]) / 2, 0],                          // the panel under the windscreen
      [box(0.42, 0.1, W - 0.16), DASH, f - 0.27, ws[0] - 0.05, 0],                                         // the long low dash
      [box(0.36, 0.22, 0.62), DASH, f - 0.3, ws[0] + 0.02, ac],                                            // and the driver's binnacle on it
      strut(lo, hi, 0, 0.1, 0.05, POST),                                                                    // the split windscreen's middle
      strut(lo, hi, W / 2 - 0.06, 0.12, 0.08, POST), strut(lo, hi, -W / 2 + 0.06, 0.12, 0.08, POST),       // and its sides
      [box(0.12, ceil - ws[1], W - 0.1), POST, hi[0] - 0.03, (ws[1] + ceil) / 2, 0],                       // over it, the back of the destination box
      [box(2.2, win - base, 0.04), GREEN, f - 1.1, (base + win) / 2, W / 2 - 0.05],                        // the cab's side, under your window
    ];
    if (!two) parts.push([box(3, 0.02, W - 0.1), c ? "#c8c4b8" : "#d8d4c4", f - 1.5, ceil, 0]);   // a single-decker has a ceiling of its own; a double-decker's is the top deck's floor
    if (!c) parts.push(
      // the cab's partition on your left, with the ticket machine on its post by the door
      [box(1.1, 1.0 - base + up * 0.2, 0.04), GREEN, al - 0.05, base + 0.5, ac - 0.48],
      [cyl(0.025, 0.8, 8), "#6c7176", al + 0.5, up + 0.4, ac - 0.66],
      [box(0.22, 0.18, 0.24), "#7d848a", al + 0.5, up + 0.88, ac - 0.66],                                  // the ticket machine
      [cyl(0.075, 0.03, 16), "#c9ccd0", al + 0.5, up + 0.985, ac - 0.66],                                 // its fare dial
      [box(0.03, 0.02, 0.1), "#c9ccd0", al + 0.5, up + 0.9, ac - 0.83], [cyl(0.02, 0.06, 8), "#151617", al + 0.5, up + 0.9, ac - 0.9, Math.PI / 2],   // the crank handle
      [box(0.02, 0.03, 0.12), "#111213", al + 0.615, up + 0.84, ac - 0.66],                               // where the ticket comes out
      [box(0.28, 0.04, 0.32), "#a8adb2", al + 0.68, up + 0.62, ac - 0.62],                                // the coin tray
      [box(0.16, 0.03, 0.06), "#8a6a2a", al + 0.7, up + 0.65, ac - 0.58],                                 // with some change in it
    );
    // the big wheel, nearly flat, on its column
    const hub = new THREE.Vector3(al + 0.55, this.eye.y - 0.4, ac);
    this.wheel(hub, 0.25, 1.15, "#141516");
    parts.push(strut([hub.x + 0.05, hub.y - 0.03], [hub.x + 0.32, base + 0.2], ac, 0.05, 0.05, "#1b1c1d"));
    this.dials(new THREE.Vector3(f - 0.48, ws[0] + 0.1, ac), 0.06, 0.15, 0.45);
    return parts;
  }

  /** A steering wheel of radius r at hub, its column rising towards the driver at tilt radians off level. */
  private wheel(hub: THREE.Vector3, r: number, tilt: number, col: string) {
    const holder = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ color: col });
    holder.position.copy(hub);
    holder.quaternion.copy(facing(tilt));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.09, 6, 24), mat);
    const spokes = new THREE.Mesh(model([[box(r * 2, 0.025, 0.015), col, 0, 0, 0], [box(0.025, r, 0.015), col, 0, -r / 2, 0], [cyl(0.045, 0.04, 10), col, 0, 0, 0.01, Math.PI / 2]]), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.spin.add(ring, spokes);
    holder.add(this.spin);
    this.group.add(holder);
  }

  /** The speedo and rev counter, side by side at p facing the driver, radius r, apart s; lean: how far back they face. */
  private dials(p: THREE.Vector3, r: number, s: number, lean = 0.3) {
    const holder = new THREE.Group();
    holder.position.copy(p);
    holder.quaternion.copy(facing(lean));
    const face = new THREE.MeshBasicMaterial({ color: "#121314" }), mark = new THREE.MeshBasicMaterial({ color: "#e4e1d4" }), hand = new THREE.MeshBasicMaterial({ color: "#ff7a2a" });
    // the speedo on the left as you look at it, the rev counter on the right
    for (const x of [-s / 2, s / 2]) {
      const dial = new THREE.Mesh(new THREE.CircleGeometry(r, 20), face);
      dial.position.set(x, 0, 0);
      holder.add(dial);
      for (let k = 0; k <= 8; k++) {
        const a = 2.3 - (4.6 * k) / 8, tick = new THREE.Mesh(box(0.004, r * 0.22, 0.002), mark);
        tick.position.set(x - Math.sin(a) * r * 0.82, Math.cos(a) * r * 0.82, 0.002);
        tick.rotation.z = a;
        holder.add(tick);
      }
      const needle = new THREE.Group(), n = new THREE.Mesh(box(0.005, r * 0.85, 0.003), hand);
      n.position.y = r * 0.4;
      needle.add(n);
      needle.position.set(x, 0, 0.004);
      holder.add(needle);
      this.needles.push(needle);
    }
    // the indicators' green arrows, either side of the dials
    const green = new THREE.MeshBasicMaterial({ color: "#3dff5a" });
    for (const x of [-s / 2 - r - 0.03, s / 2 + r + 0.03]) {
      const a = new THREE.Mesh(new THREE.CircleGeometry(0.014, 3).rotateZ(x < 0 ? Math.PI : 0), green);
      a.position.set(x, r * 0.5, 0.004);
      a.visible = false;
      holder.add(a);
      this.arrows.push(a);
    }
    this.group.add(holder);
  }

  /** Turn the wheel with the steering (-1..1, + is left), set the needles (speed, m/s, and the engine's revs, 0..1), and blink the indicator's arrow (signal: 1 left, -1 right). */
  update(steer: number, speed: number, revs: number, signal = 0) {
    const blink = performance.now() % 760 < 380;
    if (this.arrows.length) { this.arrows[0].visible = signal > 0 && blink; this.arrows[1].visible = signal < 0 && blink; }
    this.spin.rotation.z = steer * this.turns;
    const mph = Math.abs(speed) * 2.237;
    if (this.needles[0]) this.needles[0].rotation.z = 2.3 - 4.6 * Math.min(1, mph / this.top);
    if (this.needles[1]) this.needles[1].rotation.z = 2.3 - 4.6 * Math.max(0.1, Math.min(1, revs));
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
    });
  }
}
