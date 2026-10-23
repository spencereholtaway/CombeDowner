// The Gaffer legs it. When a pub takeover (invasion.ts) has worn the Gaffer down to half his health
// he runs for it, and this is the chase: on foot, on a mobility scooter or in his van, by what he
// brings (a gazebo or the whole WhatsApp group means the van, a megaphone the scooter, a right-hand
// man to hold the door and he's on foot). He's a naughty boy like any other (naughtyboys.ts), sent
// from street to street away from whoever's nearest, and the scooter and the van are only what he's
// drawn sitting in and how fast he goes, not vehicles you can get into.
//
// He's caught if he gives up: shot down to a fifth of his health, or stopped by someone who stays
// right by him for a moment (not in the van), hands up, and then E cuffs him, for a bonus. He gets
// away once he's 400 m from the pub, or has lost everyone for a while, or been left stood there with
// his hands up. Then he's tomorrow's Wanted poster (wanted.ts): "last seen leaving the Crown in a
// hurry". Alone it stays fair: slower, and never in the van.
//
// Who decides what: the host runs the chase and says how it stands in invasion.ts's "bv" state, so
// whoever becomes host mid-chase picks it up where it was (pack and unpack below). The host also
// keeps the list of Gaffers who got away, like the day's scars (scars.ts): each is sent round as it
// happens, to anyone who joins, and saved on each player's machine for the room, so every player
// puts up the same poster. A page that doesn't know it just sees no such poster.
import type { Fugitive } from "./quests";
import { hash } from "./quests";
import { dayNumber } from "./daylight";
import { clearSpot, streetSpot } from "./haunts";
import type { GameMap } from "./map";
import type { NaughtyBoys, Target } from "./naughtyboys";

const AWAY = 400;                 // metres from the pub: further than that and he's got away
const LOSE_DIST = 220;            // nobody this near him for LOSE_FOR seconds and he's got away
const LOSE_FOR = 14;
const LIMIT = 150;                // seconds, at the most
const COLLAR = 2.6;               // close enough to wear him out
const COLLAR_FOR = 1.2;
const GIVE_UP = 60;               // left stood there with his hands up this long and he slips off
const PACE = [1, 1.7, 2.4];       // times the Gaffer's own running pace (5 m/s), on foot, scooter and van
const PACE_SOLO = [0.9, 1.35, 1.35];
/** Health as a share of the top: he runs at half, and gives up at a fifth. */
export const RUNS_AT = 0.5;

/** How he gets away: the van for a gazebo or a big crew, the scooter for a megaphone, otherwise his own two feet. Alone, never the van. */
export function escapeBy(traits: readonly string[], solo: boolean) {
  const how = traits.includes("gazebo") || traits.includes("quorum") ? 2 : traits.includes("megaphone") ? 1 : 0;
  return solo ? Math.min(how, 1) : how;
}

export type Step = "run" | "up" | "away" | "gone";

/** The chase, host only. */
export class Chase {
  t = 0;
  up = false;                     // hands up
  private upT = 0; private farT = 0; private holdT = 0; private wpT = 0;
  private wp: { x: number; z: number } | null = null;
  constructor(readonly i: number, readonly gen: number, readonly how: number, readonly pub: string, readonly name: string,
    readonly traits: string[], readonly x0: number, readonly z0: number, private solo: boolean) {}

  get pace() { return (this.solo ? PACE_SOLO : PACE)[this.how]; }

  /** Set him off: running, never turning to fight, and ready to give up when he's hurt enough. */
  start(ch: NaughtyBoys) {
    ch.setMount(this.i, this.gen, this.how);
    ch.flee(this.i, this.gen, this.pace);
    ch.spare(this.i, this.gen, true);
  }

  /** One host tick. */
  step(dt: number, ch: NaughtyBoys, map: GameMap, players: Target[]): Step {
    const b = ch.get(this.i, this.gen);
    if (!b) return "gone";
    this.t += dt;
    if (b.meek) {
      if (!this.up) { this.up = true; return "up"; }
      return (this.upT += dt) > GIVE_UP ? "away" : "run";
    }
    let near: Target | null = null, nd = Infinity;
    for (const p of players) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      if (d < nd) { nd = d; near = p; }
    }
    this.farT = nd > LOSE_DIST ? this.farT + dt : 0;
    if (Math.hypot(b.x - this.x0, b.z - this.z0) > AWAY || this.farT > LOSE_FOR || this.t > LIMIT) return "away";
    // stuck right by him for a moment and he's out of puff, unless he's in the van
    this.holdT = this.how < 2 && nd < COLLAR ? this.holdT + dt : 0;
    if (this.holdT > COLLAR_FOR) { ch.surrender(this.i, this.gen); return "run"; }
    this.wpT -= dt;
    if (!this.wp || this.wpT <= 0 || Math.hypot(this.wp.x - b.x, this.wp.z - b.z) < 6) {
      this.wp = this.next(map, b, near, nd);
      this.wpT = 7;
      ch.sendTo(this.i, this.gen, this.wp.x, this.wp.z, true);
    }
    return "run";
  }

  /** Further down the street, away from whoever's nearest and not back towards the pub. */
  private next(map: GameMap, b: { x: number; z: number }, near: Target | null, nd: number) {
    const fromPub = Math.hypot(b.x - this.x0, b.z - this.z0);
    const s = streetSpot(map, b.x, b.z, 50, 130, 0.6,
      (x, z) => (!near || Math.hypot(x - near.x, z - near.z) > nd + 15) && Math.hypot(x - this.x0, z - this.z0) > fromPub - 5);
    if (s) return s;
    const ax = near ? b.x - near.x : b.x - this.x0, az = near ? b.z - near.z : b.z - this.z0, l = Math.hypot(ax, az) || 1;
    const c = clearSpot(map, b.x + (ax / l) * 70, b.z + (az / l) * 70, 20);
    return c ? { x: c[0], z: c[1] } : { x: b.x + (ax / l) * 40, z: b.z + (az / l) * 40 };
  }

  pack() { return [this.i, this.gen, this.how, Math.round(this.x0), Math.round(this.z0), Math.round(this.t), this.up ? 1 : 0, this.pub, this.name, this.traits.join(",")]; }
  static unpack(a: unknown, solo: boolean): Chase | null {
    if (!Array.isArray(a) || a.length < 10) return null;
    const c = new Chase(Number(a[0]), Number(a[1]), Number(a[2]) || 0, String(a[7]), String(a[8]), String(a[9]).split(",").filter(Boolean), Number(a[3]), Number(a[4]), solo);
    c.t = Number(a[5]) || 0; c.up = !!a[6];
    return c;
  }
}

// ---- the Gaffers who got away -----------------------------------------------------------------------

const KEY = "cd-fugitives";

/** The list of Gaffers who got away, kept like the day's scars. */
export class Fugitives {
  private list: Fugitive[] = [];

  constructor(private slot: () => string, private isHost: () => boolean, private send: (d: unknown, to?: string) => void) {
    try { this.merge(JSON.parse(localStorage.getItem(`${KEY}:${slot()}`) ?? "[]")); } catch { /* storage may be blocked */ }
  }

  all(): Fugitive[] { return this.list; }

  /** Host: he got away from this pub, this way. */
  add(f: Omit<Fugitive, "id" | "day">) {
    if (!this.isHost()) return;
    const day = dayNumber(), id = hash("gaffer", f.name, f.pub, day);
    if (this.list.some((o) => o.id === id)) return;
    this.list.push({ ...f, id, day });
    this.changed();
  }

  joined(id: string) {
    if (this.isHost()) this.send({ k: "fg", l: this.packed() }, id);
    else if (this.list.length) this.send({ k: "fg", l: this.packed(), m: 1 }, id);
  }

  onMessage(d: any, from: string, self: string) {
    if (!Array.isArray(d?.l) || from === self) return;
    // the host takes what a newcomer remembers; everyone else takes the host's word
    if (d.m ? this.isHost() : !this.isHost()) { if (this.merge(d.l)) { this.save(); if (this.isHost()) this.send({ k: "fg", l: this.packed() }); } }
  }

  private packed() { return this.list.map((f) => [f.id, f.day, f.name, f.pub, Math.round(f.x), Math.round(f.z), f.how]); }

  private merge(l: unknown): boolean {
    const today = dayNumber(), have = new Set(this.list.map((f) => f.id));
    let added = false;
    for (const r of Array.isArray(l) ? l : []) {
      if (!Array.isArray(r) || have.has(Number(r[0])) || Number(r[1]) < today - 1) continue;
      this.list.push({ id: Number(r[0]), day: Number(r[1]), name: String(r[2]).slice(0, 60), pub: String(r[3]).slice(0, 60), x: Number(r[4]) || 0, z: Number(r[5]) || 0, how: Number(r[6]) || 0 });
      added = true;
    }
    this.list = this.list.filter((f) => f.day >= today - 1).slice(-12);
    return added;
  }

  private save() { try { localStorage.setItem(`${KEY}:${this.slot()}`, JSON.stringify(this.packed())); } catch { /* storage may be blocked */ } }
  private changed() { this.save(); this.send({ k: "fg", l: this.packed() }); }
}
