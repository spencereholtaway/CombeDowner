// Riders bumping into one another: on a bike, a board, blades or any ride (rides.ts), other riders
// are solid. Ride alongside someone and lean in and you both get shoved apart sideways, each turned a
// little off line and a little slower; run into the back of someone and they're pushed on a touch
// while you're held up. Each bump thuds, jolts the view, throws up dust (or sparks, if it's hard)
// and rumbles a controller. Riding hard into another racer still knocks them clean off (race.ts).
// On foot, and in cars, nothing changes.
//
// Who decides what: each screen moves only its own rider. It holds you clear of the other riders
// where it draws them, every frame, so you never pass through anyone you can see. A bump trades a
// knock: whoever's screen sees the touch first works out both halves of it, equal and opposite,
// takes its own and sends the other theirs ("rb", to them alone). After a knock between two riders,
// by either way, neither takes another from the other for a moment, so when both screens see the
// same touch (each a little differently, as each sees the other a moment late) it's still only
// felt once by each. Older pages don't know "rb" and just don't feel it.
import * as THREE from "three";
import * as SFX from "./audio";
import { rumble } from "./gamepad";
import type { Player } from "./player";
import type { RideKind } from "./rides";

/** Another rider, where we draw them. */
export interface Rider { id: string; kind: RideKind; x: number; y: number; z: number; yaw: number }

/** How long and how wide each ride is, from the middle (metres). */
const SIZE: Record<RideKind, [number, number]> = {
  bike: [0.85, 0.4], bmx: [0.75, 0.4], scooter: [0.6, 0.38], board: [0.6, 0.38], trolley: [0.8, 0.45], blades: [0.4, 0.38], pogo: [0.35, 0.35],
};
const AGAIN = 400;     // ms before the same two riders can trade another knock
const LEAN = 1;        // m/s: the least a knock shoves, so even leaning on someone tells
const BOUNCE = 0.2;    // how much of the closing speed comes back out as the two part
const HARDEST = 7;     // m/s: the most one knock can shove anyone
const HARD = 3;        // m/s: a knock this hard throws sparks
const FAR = 6;         // metres: a knock said from further off than this on our screen is stale

/** How far from its middle a ride reaches the way (nx, nz), pointing the way (hx, hz). */
function reach(kind: RideKind, hx: number, hz: number, nx: number, nz: number) {
  const [a, b] = SIZE[kind], along = nx * hx + nz * hz, across = nx * -hz + nz * hx;
  return Math.sqrt(a * a * along * along + b * b * across * across);
}

/** A bump you ran into: who, where, how hard the knock was, the speed you closed at, and your speed and theirs (m/s). */
export interface Bumped { id: string; x: number; y: number; z: number; force: number; closing: number; mine: number; theirs: number }

export class RideBumps {
  private last = new Map<string, number>();
  private seen = new Map<string, { x: number; z: number; vx: number; vz: number; hx: number; hz: number }>();

  constructor(private send: (to: string, d: number[]) => void, private effects: { impact(at: THREE.Vector3, n: THREE.Vector3, colour: string, count: number): void; dust(at: THREE.Vector3, n: THREE.Vector3): void }) {}

  /** Each frame: how the other riders are moving, from where we draw them (eased, since their
   *  updates come in fits), and the way each is pointing. */
  watch(others: Rider[], dt: number) {
    const k = Math.min(1, dt * 8);
    for (const o of others) {
      const s = this.seen.get(o.id);
      if (!s || dt <= 0) { this.seen.set(o.id, { x: o.x, z: o.z, vx: 0, vz: 0, hx: -Math.sin(o.yaw), hz: -Math.cos(o.yaw) }); continue; }
      const vx = (o.x - s.x) / dt, vz = (o.z - s.z) / dt;
      if (Math.hypot(vx, vz) > 40) { s.vx = s.vz = 0; }   // a respawn or a jump across the map
      else { s.vx += (vx - s.vx) * k; s.vz += (vz - s.vz) * k; }
      s.x = o.x; s.z = o.z;
      const sp = Math.hypot(s.vx, s.vz);
      if (o.kind === "pogo" || sp < 0.5) { s.hx = -Math.sin(o.yaw); s.hz = -Math.cos(o.yaw); }
      else { s.hx = s.vx / sp; s.hz = s.vz / sp; }
    }
    if (this.seen.size > others.length) for (const id of [...this.seen.keys()]) if (!others.some((o) => o.id === id)) this.seen.delete(id);
  }

  /** You, riding mine: held clear of every other rider, and a knock traded with any you've just run into. */
  update(me: Player, mine: RideKind, others: Rider[]): Bumped[] {
    const out: Bumped[] = [];
    const myHx = -Math.sin(me.heading), myHz = -Math.cos(me.heading);
    for (const o of others) {
      const s = this.seen.get(o.id);
      if (!s || Math.abs(o.y - me.pos.y) > 1.4) continue;
      let dx = me.pos.x - o.x, dz = me.pos.z - o.z, d = Math.hypot(dx, dz);
      if (d < 1e-3) { dx = -myHz; dz = myHx; d = 1; }
      const nx = dx / d, nz = dz / d;
      const touch = reach(mine, myHx, myHz, nx, nz) + reach(o.kind, s.hx, s.hz, nx, nz);
      if (d >= touch) continue;
      me.nudge(nx * (touch - d), nz * (touch - d));
      const now = performance.now();
      if (now - (this.last.get(o.id) ?? -1e9) < AGAIN) continue;
      this.last.set(o.id, now);
      const closing = Math.max(0, -((me.vel.x - s.vx) * nx + (me.vel.z - s.vz) * nz));
      const k = Math.min(HARDEST, Math.max(LEAN, closing * (1 + BOUNCE) / 2));
      me.shove(nx * k, nz * k);
      const q = (v: number) => Math.round(v * 100) / 100;
      this.send(o.id, [q(-nx * k), q(-nz * k)]);
      const at = { x: o.x + nx * (d / 2), y: (me.pos.y + o.y) / 2, z: o.z + nz * (d / 2) };
      this.felt(at, nx, nz, k);
      out.push({ id: o.id, ...at, force: k, closing, mine: Math.hypot(me.vel.x, me.vel.z), theirs: Math.hypot(s.vx, s.vz) });
    }
    return out;
  }

  /** A knock someone says we took ("rb"): unless we've just traded one with them ourselves. */
  heard(me: Player, from: Rider | undefined, d: unknown): boolean {
    if (!from || !Array.isArray(d) || d.length < 2) return false;
    let ix = Number(d[0]), iz = Number(d[1]);
    if (!Number.isFinite(ix) || !Number.isFinite(iz)) return false;
    if (Math.hypot(me.pos.x - from.x, me.pos.z - from.z) > FAR) return false;
    const now = performance.now();
    if (now - (this.last.get(from.id) ?? -1e9) < AGAIN) return false;
    this.last.set(from.id, now);
    const k = Math.hypot(ix, iz);
    if (k > HARDEST) { ix *= HARDEST / k; iz *= HARDEST / k; }
    me.shove(ix, iz);
    const n = Math.max(k, 1e-3);
    this.felt({ x: (me.pos.x + from.x) / 2, y: (me.pos.y + from.y) / 2, z: (me.pos.z + from.z) / 2 }, ix / n, iz / n, Math.min(k, HARDEST));
    return true;
  }

  /** The thud, the rumble and what's thrown up where the two met. */
  private felt(at: { x: number; y: number; z: number }, nx: number, nz: number, k: number) {
    SFX.bump(k / HARDEST);
    rumble(Math.min(1, 0.2 + k * 0.1), 0.4, 90 + k * 20);
    const p = new THREE.Vector3(at.x, at.y + 0.5, at.z), n = new THREE.Vector3(nx, 0.4, nz).normalize();
    if (k >= HARD) this.effects.impact(p, n, "#ffd27a", Math.round(4 + k));
    this.effects.dust(new THREE.Vector3(at.x, at.y + 0.1, at.z), new THREE.Vector3(nx, 0, nz));
  }

  /** Forget anyone who's gone. */
  drop(id: string) { this.last.delete(id); this.seen.delete(id); }
}
