// The rules and the props of a penalty shoot-out (the play itself is in sport.ts): who kicks and who
// keeps goal for any number of players, when it's decided, the score card, the computer's keeper and
// the corner flag that shows the wind. Nothing here touches the network.
import * as THREE from "three";

/** Kicks each in the shoot-out proper for two to four players; the queue for five or more gives everyone THREE. */
export const KICKS = 5;
export const QUEUE_KICKS = 3;
export const MAX_PLAYERS = 8;
export const DIVE_T = 0.45;              // seconds for a dive to reach its full stretch
export const DIVE_REACH = 2.8;           // how far along the line it takes the keeper (m)
const HANDS = 0.9;                       // how far from the keeper's reach a ball can be and still be stopped (m)
const HEIGHT = 2.25;                     // the highest a keeper gets to
const GLOVES = 0.85;                     // standing still, a keeper covers this far either side (m)

/** The shoot-out everyone in it agrees on. Roster order matters: see lineup. */
export interface Bout {
  id: number; pitch: number; end: number;
  roster: string[]; names: string[]; goals: number[];
  /** The kick we're on (0 first). */
  n: number;
  /** The wind for this kick (scene m/s). */
  wx: number; wz: number;
  over: boolean; won: number[];
  /** performance.now() when we last heard from the owner. */
  seen: number;
}

/** Which team an index is in: one each for a pair, odd and even for three or four, nobody's for a queue. */
export function teamOf(players: number, i: number): number {
  return players === 2 ? i : players <= 4 ? i % 2 : -1;
}

/** Who takes kick n and who keeps goal for it, as roster indices. A pair swap each kick. Three or four
 *  are two teams that alternate, rotating their kickers and keepers. Five or more queue: you kick, and
 *  then keep goal for whoever is next. */
export function roles(players: number, n: number, out: [number, number]): [number, number] {
  if (players === 2) { out[0] = n % 2; out[1] = 1 - (n % 2); return out; }
  if (players <= 4) {
    const t = n % 2, u = 1 - t, r = n >> 1;
    out[0] = t + 2 * (r % Math.ceil((players - t) / 2));
    out[1] = u + 2 * (r % Math.ceil((players - u) / 2));
    return out;
  }
  out[0] = n % players;
  out[1] = (n + players - 1) % players;
  return out;
}

/** Kicks in the whole thing before sudden death (or before it's over, for a queue). */
export function totalKicks(players: number): number {
  return players <= 4 ? KICKS * 2 : QUEUE_KICKS * players;
}

/** Who has won after `done` kicks, as roster indices; null while it goes on. */
export function winners(players: number, goals: number[], done: number): number[] | null {
  if (players > 4) {
    if (done < totalKicks(players)) return null;
    const top = Math.max(...goals);
    return goals.flatMap((g, i) => (g === top ? [i] : []));
  }
  let a = 0, b = 0;
  for (let i = 0; i < players; i++) if (teamOf(players, i) === 0) a += goals[i]; else b += goals[i];
  const left0 = KICKS - Math.ceil(done / 2), left1 = KICKS - Math.floor(done / 2);
  let team = -1;
  if (done <= KICKS * 2) {
    if (a > b + left1) team = 0;
    else if (b > a + left0) team = 1;
    else if (done === KICKS * 2 && a !== b) team = a > b ? 0 : 1;
  } else if (done % 2 === 0 && a !== b) team = a > b ? 0 : 1;
  if (team < 0) return null;
  return goals.flatMap((_, i) => (teamOf(players, i) === team ? [i] : []));
}

/** The roster, kicker first, with the volunteer keeper where they keep goal for the first kick. */
export function lineup(owner: string, keeper: string, others: string[]): string[] {
  const rest = others.slice(0, MAX_PLAYERS - 2);
  if (rest.length === 0) return [owner, keeper];
  return rest.length <= 2 ? [owner, keeper, ...rest] : [owner, ...rest, keeper];
}

/** Can a keeper who dived `side` (-1, 1 or 0 for not at all) starting at ball-time r stop a ball that
 *  crosses the line at time tc, t across from the middle and h high? */
export function stops(side: number, r: number, tc: number, t: number, h: number): boolean {
  if (h > HEIGHT) return false;
  const ease = side ? Math.min(1, Math.max(0, (tc - r) / DIVE_T)) : 0;
  const centre = side * DIVE_REACH * ease;
  return Math.abs(t - centre) < (ease > 0 ? HANDS : GLOVES);
}

const SKIN = new THREE.MeshLambertMaterial({ color: "#e0b090" });
const KIT = new THREE.MeshLambertMaterial({ color: "#ff8c1a" });
const SHORTS = new THREE.MeshLambertMaterial({ color: "#222" });

/** The computer's keeper, in goal when you take a penalty on your own. */
export class AiKeeper {
  readonly root = new THREE.Group();
  private pivot = new THREE.Group();
  private taxis = new THREE.Vector3();
  private base = new THREE.Vector3();

  constructor() {
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, rz = 0) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      o.position.set(x, y, z);
      o.rotation.z = rz;
      o.castShadow = true;
      this.pivot.add(o);
    };
    box(0.4, 0.8, 0.22, SHORTS, 0, 0.4, 0);
    box(0.55, 0.7, 0.3, KIT, 0, 1.15, 0);
    box(0.12, 0.7, 0.14, KIT, -0.42, 1.5, 0, -0.75);
    box(0.12, 0.7, 0.14, KIT, 0.42, 1.5, 0, 0.75);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), SKIN);
    head.position.set(0, 1.68, 0);
    this.pivot.add(head);
    this.root.add(this.pivot);
    this.root.visible = false;
  }

  /** Stand in the middle of the goal line at (x, y, z); across is the scene direction along the line. */
  place(x: number, y: number, z: number, ax: number, az: number) {
    this.base.set(x, y, z);
    this.taxis.set(ax, 0, az);
    this.root.rotation.y = Math.atan2(-az, ax);
    this.root.visible = true;
    this.pose(0, 0);
  }

  /** side: -1, 0 or 1; tau: seconds since the dive began (negative: not yet). */
  pose(side: number, tau: number) {
    const e = side ? Math.min(1, Math.max(0, tau / DIVE_T)) : 0;
    this.root.position.copy(this.base).addScaledVector(this.taxis, side * DIVE_REACH * e);
    this.pivot.rotation.z = -side * e * 1.25;
    this.pivot.position.y = e * 0.45 * (1 - e * 0.4);
  }

  hide() { this.root.visible = false; }
}

/** A tall flag on the corner of the pitch that streams downwind, for reading the wind without the dots. */
export class Vane {
  readonly root = new THREE.Group();
  private cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 0.9).translate(1.1, 0, 0),
    new THREE.MeshLambertMaterial({ color: "#f2f2f2", side: THREE.DoubleSide }),
  );

  constructor() {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 4.4, 6).translate(0, 2.2, 0), new THREE.MeshLambertMaterial({ color: "#ddd" }));
    this.cloth.position.y = 3.9;
    this.root.add(pole, this.cloth);
    this.root.visible = false;
  }

  /** Streaming away from the wind, longer the stronger it is, and rippling. */
  blow(wx: number, wz: number, secs: number) {
    const w = Math.hypot(wx, wz);
    this.cloth.rotation.y = w > 0.05 ? Math.atan2(-wz, wx) : 0;
    this.cloth.scale.x = w > 0.05 ? 0.35 + Math.min(1, w / 5) * 0.65 : 0.25;
    this.cloth.rotation.z = w > 0.05 ? Math.sin(secs * (3 + w * 2)) * 0.12 : -1.1;
  }
}
