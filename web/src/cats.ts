// Cats: they sit on pavements, stroll about and mind their own business, every breed and colour
// you'd find in a village: tabbies, gingers, black, white and tuxedo cats, Siamese, tortoiseshells,
// big Maine Coons, bald Sphynxes, fluffy Persians and spotty Bengals, and now and then one someone's
// dyed.
//
// Leave them be and they leave you be. Shoot one and every cat for streets around comes for you,
// with more pouring in from all sides: far faster than you can run, pouncing from metres away and
// clawing you to bits. They're small and hard to hit and take a few rounds each, but there's only
// so many of them, so a cool head and a full magazine will just about see them off. Or get in a
// car and drive away, or over them.
//
// After dark (daylight.ts) they get braver: more of them are out, the calm ones come and sit
// round your feet, and a swarm brings half as many again.
//
// Like the chavs, the host runs them and sends their state about 10 times a second; everyone else
// draws them from that, smoothed. Shots at cats go to the host.
import * as THREE from "three";
import { clearSpot, streetSpot } from "./haunts";
import { GameMap } from "./map";
import { nightNow } from "./daylight";

const MAX = 32;
const HP = 40;                              // a rifle round does 22, 55 to the head
const STROLL = 0.75, TROT = 2.4;
const RUN = 8.8;                            // you sprint at 7.4: you can't outrun them
const POUNCE = 12.5, POUNCE_NEAR = 1.3, POUNCE_FAR = 4.2, POUNCE_EVERY = 1.6;
const REACH = 0.85;
const CLAW = 3, CLAW_EVERY = 0.5, POUNCE_CLAW = 5;
const SWARM = 130;                          // every cat this close joins in when one is shot
const WAVE = 12;                            // and this many more pour in, a few at a time
const WAVE_EVERY = 1.1, WAVE_BATCH = 2;
const FURY_SECS = 30;                       // how long after the last cat you hurt they keep coming
const GIVE_UP = 220;                        // drive this far away and they let you go
const RADIUS = 0.2;
const CORPSE_SECS = 8;
const DELAY = 130;
const DRAW_DIST = 110;                      // too small to see further off than this
const GONE = 0, ALIVE = 1, DEAD = 2;
const STRIDE = 9;

export interface CatTarget { id: string; x: number; y: number; z: number; alive: boolean }
export interface CatState { s: number[]; t: string[] }

// ---- looks -----------------------------------------------------------------------------------

/** Breeds. A cat's look is its breed times 16 plus a colour variant. */
// 1 is plain one-colour cats, 9 is dyed ones (someone's idea of a joke)
const TABBY = 0, TUXEDO = 2, SIAMESE = 3, CALICO = 4, COON = 5, SPHYNX = 6, PERSIAN = 7, BENGAL = 8;
/** How common each breed is. */
const BREED_ODDS = [5, 5, 3, 1.5, 2.5, 1.5, 0.7, 1.2, 1, 0.4];
/** For each breed: [coat, markings] pairs. */
const COATS: [string, string][][] = [
  [["#8a6a48", "#3e2c1c"], ["#a3a3a0", "#3b3b3d"], ["#d98a3c", "#9b4e1c"], ["#b89a74", "#5d4630"]],
  [["#1a1a1c", "#1a1a1c"], ["#f2f0ea", "#f2f0ea"], ["#7d8590", "#7d8590"], ["#d9883a", "#d9883a"], ["#cdb89a", "#cdb89a"], ["#5a4a42", "#5a4a42"]],
  [["#1a1a1c", "#f4f3ef"], ["#5a5d63", "#f4f3ef"], ["#d9883a", "#f4f3ef"]],
  [["#ece0c8", "#4a3326"], ["#eee8dc", "#6a6f7c"]],
  [["#f4f1ea", "#d9883a"], ["#2a2220", "#c9772f"]],
  [["#7a5a3a", "#2f2216"], ["#1d1d1f", "#1d1d1f"], ["#c06a2a", "#7d3d14"], ["#9c9690", "#4a4744"]],
  [["#e6b6a6", "#c99486"], ["#9a8a88", "#7a6a68"]],
  [["#f6f4f0", "#e6e0d6"], ["#9aa0a8", "#868c94"], ["#e9d4b0", "#d4b88c"], ["#2a2a2c", "#2a2a2c"]],
  [["#d6a24e", "#3b2412"], ["#c9b9a0", "#3a3a3a"]],
  [["#d94fb0", "#7a2a6a"], ["#4f9ad9", "#1f4a7a"], ["#7ad94f", "#2f6a1f"], ["#9a5fe0", "#4a2a7a"], ["#f2d33a", "#9a7a10"]],
];
const EYES = ["#9ccf3a", "#e8c23a", "#e89a2a", "#5aa0e0", "#7ab85a"];

const mats = new Map<string, THREE.MeshLambertMaterial>();
const lambert = (c: string) => mats.get(c) ?? mats.set(c, new THREE.MeshLambertMaterial({ color: c })).get(c)!;
const glow = new Map<string, THREE.MeshBasicMaterial>();
const shiny = (c: string) => glow.get(c) ?? glow.set(c, new THREE.MeshBasicMaterial({ color: c })).get(c)!;
const PINK = lambert("#e89a9a"), WHITE = lambert("#f4f3ef");

// the cat faces -z, like the chavs; feet at y = 0
const GEO = {
  body: new THREE.CapsuleGeometry(0.1, 0.26, 4, 10).rotateX(Math.PI / 2),
  chest: new THREE.SphereGeometry(0.085, 10, 8),
  head: new THREE.SphereGeometry(0.105, 14, 10),
  muzzle: new THREE.SphereGeometry(0.048, 8, 6),
  ear: new THREE.ConeGeometry(0.042, 0.085, 4).rotateY(Math.PI / 4),
  eye: new THREE.SphereGeometry(0.018, 6, 4),
  nose: new THREE.SphereGeometry(0.012, 6, 4),
  leg: new THREE.BoxGeometry(0.05, 0.22, 0.055).translate(0, -0.11, 0),
  paw: new THREE.BoxGeometry(0.058, 0.035, 0.07).translate(0, -0.21, -0.01),
  tail: new THREE.CylinderGeometry(0.022, 0.026, 0.13, 6).translate(0, 0.065, 0),
  stripe: new THREE.BoxGeometry(0.212, 0.03, 0.03),
  spot: new THREE.SphereGeometry(0.035, 6, 4).scale(1, 0.5, 1),
  patch: new THREE.SphereGeometry(0.07, 8, 6).scale(1, 0.6, 1.3),
  ruff: new THREE.SphereGeometry(0.12, 10, 8).scale(1.1, 1, 0.8),
};

/** The same cat looks the same on every screen: its looks come from a seed, not Math.random. */
function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** A new cat's breed and colours, as a look. */
export function randomLook() {
  const total = BREED_ODDS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total, breed = 0;
  while ((r -= BREED_ODDS[breed]) > 0 && breed < BREED_ODDS.length - 1) breed++;
  return breed * 16 + Math.floor(Math.random() * COATS[breed].length);
}

/** The drawn cat: walking, running, sitting, pouncing, clawing and, shot, flopped on its side. */
class Figure {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private legs: THREE.Group[] = [];
  private tail: THREE.Group[] = [];
  private phase = Math.random() * 6;
  private sit = 0;
  size = 1;

  constructor() {
    this.body.rotation.order = "YXZ";
    this.root.add(this.body);
    this.root.visible = false;
  }

  dress(look: number, seed: number) {
    const r = rng(seed + look * 7919);
    const breed = look >> 4, [coatC, markC] = COATS[breed]?.[look & 15] ?? COATS[0][0];
    const coat = lambert(coatC), mark = lambert(markC);
    const fluffy = breed === COON || breed === PERSIAN, thin = breed === SPHYNX;
    this.size = (breed === COON ? 1.3 : breed === PERSIAN ? 1.05 : thin ? 0.92 : 1) * (0.88 + r() * 0.24);
    this.body.clear(); this.head.clear(); this.legs = []; this.tail = [];
    const m = (g: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = false) => {
      const o = new THREE.Mesh(g, mat); o.position.set(x, y, z); o.castShadow = shadow; return o;
    };
    const points = breed === SIAMESE, tux = breed === TUXEDO;
    // body
    const torso = m(GEO.body, coat, 0, 0.27, 0.02, true);
    torso.scale.set(fluffy ? 1.3 : thin ? 0.85 : 1, fluffy ? 1.25 : thin ? 0.9 : 1, 1);
    this.body.add(torso, m(GEO.chest, tux ? WHITE : coat, 0, 0.27, -0.15));
    if (breed === TABBY || breed === COON && (look & 15) !== 1) {
      for (let k = 0; k < 4; k++) { const s = m(GEO.stripe, mark, 0, 0.29, -0.1 + k * 0.08); s.scale.set(fluffy ? 1.3 : 1, 1, 1); this.body.add(s); }
    }
    if (breed === BENGAL) {
      for (let k = 0; k < 10; k++) {
        const a = (r() - 0.5) * 2.4, s = m(GEO.spot, mark, Math.sin(a) * 0.1, 0.27 + Math.cos(a) * 0.1, -0.14 + r() * 0.32);
        s.rotation.z = -a; this.body.add(s);
      }
    }
    if (breed === CALICO) {
      const tones = [mark, lambert(breed === CALICO && coatC === "#f4f1ea" ? "#1d1d1f" : "#5a3a24")];
      for (let k = 0; k < 4; k++) {
        const a = (r() - 0.5) * 2.2, s = m(GEO.patch, tones[k % 2], Math.sin(a) * 0.085, 0.27 + Math.cos(a) * 0.085, -0.12 + r() * 0.28);
        s.rotation.z = -a; this.body.add(s);
      }
    }
    if (breed === COON) this.body.add(m(GEO.ruff, coat, 0, 0.3, -0.13));
    // head
    const eyes = shiny(points ? "#4f9be0" : EYES[Math.floor(r() * EYES.length)]);
    const ears = points ? mark : coat;
    this.head.position.set(0, 0.37, -0.25);
    const hs = fluffy ? 1.15 : 1;
    const skull = m(GEO.head, coat, 0, 0, 0, true); skull.scale.set(hs, breed === PERSIAN ? 0.95 : 1, hs);
    const mz = m(GEO.muzzle, points ? mark : tux ? WHITE : coat, 0, -0.035, -0.08); mz.scale.set(1.2, 0.8, breed === PERSIAN ? 0.5 : 1);
    const big = thin ? 1.6 : breed === PERSIAN ? 0.7 : 1;
    const earL = m(GEO.ear, ears, -0.06, 0.09, -0.01), earR = m(GEO.ear, ears, 0.06, 0.09, -0.01);
    earL.scale.setScalar(big); earR.scale.setScalar(big);
    earL.rotation.z = 0.25; earR.rotation.z = -0.25;
    this.head.add(skull, mz, earL, earR,
      m(GEO.eye, eyes, -0.042, 0.02, -0.09), m(GEO.eye, eyes, 0.042, 0.02, -0.09), m(GEO.nose, PINK, 0, -0.012, breed === PERSIAN ? -0.115 : -0.128));
    if (breed === TABBY) {
      // the M on a tabby's forehead
      for (const x of [-0.03, 0, 0.03]) { const st = m(GEO.stripe, mark, x, 0.075, -0.06); st.scale.set(0.1, 0.8, 1); st.rotation.x = 0.6; this.head.add(st); }
    }
    this.body.add(this.head);
    // legs: front pair then back pair
    for (const [x, z] of [[-0.065, -0.14], [0.065, -0.14], [-0.065, 0.16], [0.065, 0.16]]) {
      const g = new THREE.Group();
      g.position.set(x, 0.23, z);
      const low = points || tux ? (points ? mark : WHITE) : coat;
      const leg = m(GEO.leg, coat); if (fluffy) leg.scale.set(1.3, 1, 1.3);
      g.add(leg, m(GEO.paw, low));
      this.legs.push(g); this.body.add(g);
    }
    // tail: three pieces, each hinged on the last
    let parent: THREE.Object3D = this.body;
    for (let k = 0; k < 3; k++) {
      const g = new THREE.Group();
      g.position.set(0, k ? 0.12 : 0.3, k ? 0 : 0.17);
      const seg = m(GEO.tail, points || (k === 2 && breed === TABBY) ? mark : coat);
      if (fluffy) seg.scale.set(2, 1, 2);
      if (thin) seg.scale.set(0.6, 1, 0.6);
      g.add(seg);
      parent.add(g); this.tail.push(g); parent = g;
    }
    this.body.scale.setScalar(this.size);
  }

  /** speed in m/s; air: off the ground; claw counts down from 1; angry: hackles up; dead: seconds since. */
  pose(x: number, y: number, z: number, yaw: number, speed: number, air: boolean, claw: number, angry: boolean, dead: number, dt: number) {
    this.root.position.set(x, y, z);
    this.body.rotation.y = yaw;
    this.phase += dt * (speed * 4.2 + 1.2);
    const p = this.phase, run = Math.min(1, speed / 6);
    // sit when still and calm, a moment after stopping
    const wantSit = speed < 0.15 && !angry && !dead ? 1 : 0;
    this.sit += (wantSit - this.sit) * Math.min(1, dt * (wantSit ? 1.5 : 8));
    const sw = Math.min(0.9, speed * 0.16 + (speed > 0.1 ? 0.15 : 0));
    // a walk is diagonal pairs; a run is a gallop, front pair then back pair
    const gallop = speed > 4;
    const leg = (k: number) => gallop ? Math.sin(p + (k < 2 ? 0 : 1.6)) * sw : Math.sin(p + (k === 0 || k === 3 ? 0 : Math.PI)) * sw;
    this.legs.forEach((g, k) => { g.rotation.x = air ? (k < 2 ? -0.9 : 0.9) : leg(k); });
    if (claw > 0) {
      const k = Math.sin((1 - claw) * Math.PI);
      this.legs[0].rotation.x = -1.6 * k; this.legs[1].rotation.x = -1.2 * Math.sin((1 - claw) * Math.PI * 2);
    }
    // sitting: back end down, front legs straight
    const s = this.sit;
    if (s > 0.01) {
      this.legs[2].rotation.x = -1.3 * s; this.legs[3].rotation.x = -1.3 * s;
      this.legs[0].rotation.x *= 1 - s; this.legs[1].rotation.x *= 1 - s;
    }
    this.body.rotation.x = dead > 0 ? 0 : s * 0.55 - (gallop ? Math.sin(p) * 0.08 : 0) + (claw > 0 ? 0.35 * Math.sin((1 - claw) * Math.PI) : 0);
    this.body.rotation.z = dead > 0 ? Math.min(Math.PI / 2, dead * 6) : 0;
    this.body.position.y = s * -0.06 * this.size + (gallop && !air ? Math.abs(Math.sin(p)) * 0.04 : 0);
    // tail: up and puffed when angry, swishing when calm, curled round when sitting
    const up = angry ? 0.15 : 0.5 - s * 0.9;
    this.tail.forEach((g, k) => {
      g.rotation.x = k === 0 ? up : angry ? 0.05 : 0.35 + s * 0.4;
      g.rotation.z = Math.sin(p * (angry ? 0.9 : 0.35) + k) * (angry ? 0.3 : 0.2);
      g.scale.setScalar(angry && !dead ? 1.35 : 1);
    });
    this.head.rotation.x = run * 0.25 - s * 0.35 + (angry ? 0.25 : 0);
    if (dead) { this.legs.forEach((g, k) => (g.rotation.x = k < 2 ? -0.7 : 0.7)); this.tail.forEach((g) => (g.rotation.z = 0)); }
  }

  hide() { this.root.visible = false; }
}

// ---- one cat ---------------------------------------------------------------------------------

class Cat {
  state = GONE; gen = 0; hp = HP; claws = 0; target = ""; look = 0;
  x = 0; y = 0; z = 0; yaw = 0;
  dx = 0; dy = 0; dz = 0; dyaw = 0; speed = 0;
  snaps: { t: number; x: number; y: number; z: number; yaw: number }[] = [];
  // host only
  vx = 0; vz = 0; hop = 0; hopV = 0; deadT = 0; clawCD = 0; pounceCD = 0; pouncing = false;
  stuckT = 0; detour = 0; detourT = 0; wanderT = 0; wanderYaw = 0; wanderSpd = 0;
  // drawing
  fig = new Figure(); clawAnim = 0; seenClaws = 0; deadAnim = 0; seenTarget = ""; yowlT = 0; meowT = 5 + Math.random() * 20;

  constructor(readonly i: number) {}
  get key() { return `cat${this.i}.${this.gen}`; }
  get voice() { return this.i * 37 + this.gen; }
}

export class Cats {
  readonly list: Cat[] = [];
  private spawnT = 2;
  /** Host: players the cats are out for, with how long till they let it go and how many more are coming. */
  private fury = new Map<string, { t: number; wave: number; next: number }>();
  /** A cat meows (calm), hisses (on spotting the one who shot its mate) or yowls and claws (attacking). */
  onSound: (what: "meow" | "hiss" | "claw", x: number, y: number, z: number, voice: number) => void = () => {};

  constructor(private map: GameMap, scene: THREE.Scene) {
    for (let i = 0; i < MAX; i++) {
      const c = new Cat(i);
      this.list.push(c);
      scene.add(c.fig.root);
    }
  }

  // ---- host: the AI -------------------------------------------------------------------------

  /** claw(i, id, damage) is called when cat i draws blood from player id. */
  simulate(dt: number, targets: CatTarget[], claw: (i: number, id: string, damage: number) => void) {
    const alive = targets.filter((t) => t.alive);
    // the swarm: let it go once its target's dead, or gone, or long enough since they hurt a cat
    for (const [id, f] of this.fury) {
      const t = alive.find((p) => p.id === id);
      f.t -= dt;
      const after = this.list.filter((c) => c.state === ALIVE && c.target === id);
      if (!t || (f.t <= 0 && !after.length)) { this.calm(id); continue; }
      f.next -= dt;
      if (f.wave > 0 && f.next <= 0) {
        f.next = WAVE_EVERY;
        for (let n = 0; n < WAVE_BATCH && f.wave > 0; n++) if (this.spawn(t, targets, 25, 60, id)) f.wave--;
      }
    }
    const night = nightNow();
    this.spawnT -= dt;
    if (this.spawnT <= 0 && alive.length) {
      this.spawnT = 2.5 - night;
      const calm = this.list.filter((c) => c.state === ALIVE && !c.target).length;
      if (calm < Math.min(14 + 8 * night, (5 + 3 * alive.length) * (1 + 0.6 * night))) this.spawn(alive[Math.floor(Math.random() * alive.length)], targets, 30 - 10 * night, 100, "");
    }
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (c.state === DEAD) { if ((c.deadT += dt) > CORPSE_SECS) c.state = GONE; continue; }
      if (c.state !== ALIVE) continue;
      const t = c.target ? alive.find((p) => p.id === c.target) : undefined;
      if (c.target && (!t || Math.hypot(t.x - c.x, t.z - c.z) > GIVE_UP)) c.target = "";
      if (!c.target && alive.length && !alive.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 160)) { c.state = GONE; continue; }
      // after dark a calm cat may come and sit by whoever's nearest
      let by: CatTarget | undefined;
      if (!t && night > 0.5) for (const p of alive) {
        const d = Math.hypot(p.x - c.x, p.z - c.z);
        if (d < 30 && (!by || d < Math.hypot(by.x - c.x, by.z - c.z))) by = p;
      }
      this.move(c, i, dt, t, claw, by);
    }
  }

  /** The swarm on id is over: the cats wander off. */
  private calm(id: string) {
    this.fury.delete(id);
    for (const c of this.list) if (c.target === id) { c.target = ""; c.wanderT = 0; }
  }

  private move(c: Cat, i: number, dt: number, t: CatTarget | undefined, claw: (i: number, id: string, damage: number) => void, by?: CatTarget) {
    c.clawCD -= dt; c.pounceCD -= dt;
    let dirX = 0, dirZ = 0, spd = 0, face: number | null = null;
    const onGround = c.hop === 0;
    if (t) {
      const dx = t.x - c.x, dz = t.z - c.z, dist = Math.hypot(dx, dz) || 1e-3;
      const level = Math.abs(t.y - c.y) < 1.3;
      if (c.pouncing && dist < REACH + 0.25 && level) {
        // landed on you
        c.pouncing = false; c.clawCD = CLAW_EVERY; c.claws++;
        claw(i, t.id, POUNCE_CLAW);
      }
      if (dist < REACH && level) {
        face = Math.atan2(-dx, -dz);
        c.vx *= 0.6; c.vz *= 0.6;
        if (c.clawCD <= 0) { c.clawCD = CLAW_EVERY * (0.8 + Math.random() * 0.4); c.claws++; claw(i, t.id, CLAW); }
      } else {
        c.clawCD = Math.max(c.clawCD, 0.15);
        dirX = dx / dist; dirZ = dz / dist; spd = RUN;
        if (onGround && level && dist > POUNCE_NEAR && dist < POUNCE_FAR && c.pounceCD <= 0) {
          // a leap: straight at you, faster than anything
          c.pounceCD = POUNCE_EVERY * (0.7 + Math.random() * 0.6);
          c.pouncing = true;
          c.vx = dirX * POUNCE; c.vz = dirZ * POUNCE;
          c.hopV = 3.6; c.hop = 0.001;
        }
      }
    } else {
      // a calm cat: sits a lot, strolls a bit, trots now and then
      c.wanderT -= dt;
      if (c.wanderT <= 0) {
        c.wanderT = 2 + Math.random() * 7;
        const r = Math.random();
        c.wanderSpd = r < 0.55 ? 0 : r < 0.9 ? STROLL : TROT;
        c.wanderYaw = Math.random() * Math.PI * 2;
        // a bold one (at night) heads for the nearest player instead, and sits once it's close
        if (by && c.i % 3 !== 0) {
          const dx = by.x - c.x, dz = by.z - c.z, d = Math.hypot(dx, dz);
          c.wanderYaw = Math.atan2(-dx, -dz);
          c.wanderSpd = d < 2.5 ? 0 : d < 8 ? STROLL : TROT;
          c.wanderT = d < 2.5 ? 3 : 1;
        }
      }
      if (c.wanderSpd) { dirX = -Math.sin(c.wanderYaw); dirZ = -Math.cos(c.wanderYaw); spd = c.wanderSpd; }
    }
    if (c.detourT > 0) {
      c.detourT -= dt;
      const cs = Math.cos(c.detour), sn = Math.sin(c.detour);
      [dirX, dirZ] = [dirX * cs - dirZ * sn, dirX * sn + dirZ * cs];
    }
    let wx = dirX * spd, wz = dirZ * spd;
    // a swarm spreads round you rather than queueing
    for (const o of this.list) {
      if (o === c || o.state !== ALIVE) continue;
      const ex = c.x - o.x, ez = c.z - o.z, d = Math.hypot(ex, ez);
      if (d < 0.45 && d > 1e-4) { wx += (ex / d) * (0.45 - d) * 10; wz += (ez / d) * (0.45 - d) * 10; }
    }
    if (onGround) {
      const k = Math.min(1, dt * (t ? 12 : 6));
      c.vx += (wx - c.vx) * k; c.vz += (wz - c.vz) * k;
    }
    const nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
    // cats are over walls and fences like they aren't there
    let p = this.map.collide({ x: nx, z: nz }, c.y + (c.hop > 0 ? 1.1 : 0), RADIUS);
    if (spd > 0.5 && onGround) {
      const want = Math.max(1e-3, Math.hypot(c.vx, c.vz) * dt), prog = ((p.x - c.x) * dirX + (p.z - c.z) * dirZ) / want;
      if (prog < 0.4) {
        const over = this.map.collide({ x: nx, z: nz }, c.y + 1.1, RADIUS);
        if (((over.x - c.x) * dirX + (over.z - c.z) * dirZ) / want > 0.6) { p = over; c.hopV = 4.6; c.hop = 0.001; }
        else if ((c.stuckT += dt) > 0.4) {
          c.stuckT = 0;
          if (!t) c.wanderT = 0;
          c.detour = (c.detour > 0 ? 1 : -1) * (Math.random() < 0.3 ? -1 : 1) * (0.9 + Math.random() * 0.7);
          c.detourT = 0.6 + Math.random() * 0.8;
        }
      } else c.stuckT = Math.max(0, c.stuckT - dt);
    }
    if (onGround) {
      c.vx = ((p.x - c.x) / dt) * 0.9 + c.vx * 0.1;
      c.vz = ((p.z - c.z) / dt) * 0.9 + c.vz * 0.1;
    }
    c.x = p.x; c.z = p.z;
    if (c.hop > 0) {
      c.hopV -= 20 * dt; c.hop += c.hopV * dt;
      if (c.hop <= 0) { c.hop = 0; c.hopV = 0; c.pouncing = false; }
    }
    c.y = this.map.ground(c.x, c.z) + c.hop;
    const sp = Math.hypot(c.vx, c.vz);
    if (face === null && sp > 0.3) face = Math.atan2(-c.vx, -c.vz);
    if (face !== null) {
      const dy = Math.atan2(Math.sin(face - c.yaw), Math.cos(face - c.yaw));
      c.yaw += dy * Math.min(1, dt * 12);
    }
  }

  /** A cat turns up between near and far metres from anchor, out of everyone's way; after: who it's coming for. */
  private spawn(anchor: CatTarget, everyone: CatTarget[], near: number, far: number, after: string) {
    const c = this.list.find((o) => o.state === GONE);
    if (!c) return false;
    // on the streets and paths (here or anywhere in Bath that's loaded), out of everyone's way
    let at = streetSpot(this.map, anchor.x, anchor.z, near, far, 0.4, (x, z) => !everyone.some((t) => Math.hypot(t.x - x, t.z - z) < near * 0.8), 8, 8);
    if (!at) {
      // nowhere on the streets: anywhere round about that's clear
      const a = Math.random() * Math.PI * 2, d = near + Math.random() * (far - near);
      const s = clearSpot(this.map, anchor.x + Math.cos(a) * d, anchor.z + Math.sin(a) * d, 6);
      if (!s) return false;
      at = { x: s[0], z: s[1] };
    }
    const look = randomLook();
    Object.assign(c, {
      state: ALIVE, gen: c.gen + 1 + Math.floor(Math.random() * 50), hp: HP, target: after, look,
      x: at.x, z: at.z, y: this.map.ground(at.x, at.z), yaw: Math.random() * Math.PI * 2, vx: 0, vz: 0, hop: 0, hopV: 0,
      deadT: 0, clawCD: 0, pounceCD: 0, pouncing: false, stuckT: 0, detourT: 0, wanderT: 0,
    });
    c.fig.dress(look, c.gen);
    return true;
  }

  /** Host: a cat was shot. Returns "kill", "dmg", or null if the shot doesn't count. */
  damage(i: number, gen: number, amount: number): "kill" | "dmg" | null {
    const c = this.list[i];
    if (!c || c.state !== ALIVE || c.gen !== gen) return null;
    c.hp = Math.max(0, c.hp - amount);
    if (c.hp > 0) return "dmg";
    c.state = DEAD; c.deadT = 0; c.deadAnim = 0; c.target = "";
    return "kill";
  }

  /** Host: id hurt cat i. Every cat for streets around comes for them, and more besides. True if that's news. */
  aggro(i: number, id: string) {
    const c = this.list[i];
    if (!c) return false;
    for (const o of this.list) {
      if (o.state === ALIVE && !o.target && Math.hypot(o.x - c.x, o.z - c.z) < SWARM) o.target = id;
    }
    const f = this.fury.get(id);
    if (f) { f.t = FURY_SECS; return false; }
    this.fury.set(id, { t: FURY_SECS, wave: Math.round(WAVE * (1 + 0.5 * nightNow())), next: 0.6 });
    return true;
  }

  snapshot(): CatState {
    const q = (v: number) => Math.round(v * 100) / 100;
    const s: number[] = [];
    for (const c of this.list) s.push(c.state, c.gen, q(c.x), q(c.y), q(c.z), q(c.yaw), Math.round(c.hp), c.claws, c.look);
    return { s, t: this.list.map((c) => (c.state === ALIVE ? c.target : "")) };
  }

  // ---- everyone else: the host's updates ------------------------------------------------------

  apply(d: CatState) {
    if (!Array.isArray(d?.s) || d.s.length < this.list.length * STRIDE) return;
    const now = performance.now();
    this.list.forEach((c, i) => {
      const [state, gen, x, y, z, yaw, hp, claws, look] = d.s.slice(i * STRIDE, i * STRIDE + STRIDE);
      if (gen !== c.gen) { c.snaps = []; c.seenClaws = claws; if (state === ALIVE) c.fig.dress(look, gen); }
      if (!(c.state === DEAD && gen === c.gen && state === ALIVE)) {
        if (state === DEAD && c.state !== DEAD) c.deadAnim = 0;
        c.state = state;
      }
      Object.assign(c, { gen, x, y, z, yaw, hp, claws, look, target: String(d.t?.[i] ?? "") });
      if (state !== GONE) {
        c.snaps.push({ t: now, x, y, z, yaw });
        if (c.snaps.length > 20) c.snaps.shift();
      }
    });
  }

  killed(i: number, gen: number) {
    const c = this.list[i];
    if (c && c.gen === gen && c.state === ALIVE) { c.state = DEAD; c.deadAnim = 0; }
  }

  // ---- everyone: drawing and hit tests -----------------------------------------------------

  update(dt: number, host: boolean, eye: { x: number; z: number }) {
    const now = performance.now() - DELAY;
    for (const c of this.list) {
      const px = c.dx, pz = c.dz;
      if (host || c.snaps.length < 2) {
        c.dx = c.x; c.dy = c.y; c.dz = c.z; c.dyaw = c.yaw;
      } else {
        const S = c.snaps;
        let a = S[0], b = S[S.length - 1];
        for (let k = 0; k < S.length - 1; k++) if (S[k].t <= now && S[k + 1].t >= now) { a = S[k]; b = S[k + 1]; break; }
        if (now >= b.t) a = b;
        const f = b.t > a.t ? Math.min(1, Math.max(0, (now - a.t) / (b.t - a.t))) : 1;
        c.dx = a.x + (b.x - a.x) * f; c.dy = a.y + (b.y - a.y) * f; c.dz = a.z + (b.z - a.z) * f;
        c.dyaw = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * f;
      }
      const moved = Math.hypot(c.dx - px, c.dz - pz) / Math.max(dt, 1e-3);
      c.speed += ((moved < 20 ? moved : 0) - c.speed) * Math.min(1, dt * 10);
      if (c.claws !== c.seenClaws) {
        if (c.claws > c.seenClaws && c.state === ALIVE) { c.clawAnim = 1; this.onSound("claw", c.dx, c.dy, c.dz, c.voice); }
        c.seenClaws = c.claws;
      }
      const after = c.state === ALIVE ? c.target : "";
      if (after && !c.seenTarget) { this.onSound("hiss", c.dx, c.dy, c.dz, c.voice); c.yowlT = 1 + Math.random() * 2; }
      else if (after && (c.yowlT -= dt) <= 0) { this.onSound("hiss", c.dx, c.dy, c.dz, c.voice); c.yowlT = 1.5 + Math.random() * 3; }
      else if (!after && c.state === ALIVE && (c.meowT -= dt) <= 0) { this.onSound("meow", c.dx, c.dy, c.dz, c.voice); c.meowT = 8 + Math.random() * 25; }
      c.seenTarget = after;
      c.clawAnim = Math.max(0, c.clawAnim - dt / 0.25);
      if (c.state === DEAD) c.deadAnim += dt;
      const fig = c.fig;
      const near = Math.hypot(c.dx - eye.x, c.dz - eye.z) < DRAW_DIST;
      if (near && (c.state === ALIVE || (c.state === DEAD && c.deadAnim < CORPSE_SECS))) {
        fig.root.visible = true;
        const air = c.dy - this.map.ground(c.dx, c.dz) > 0.12;
        fig.pose(c.dx, c.dy, c.dz, c.dyaw, c.state === ALIVE ? c.speed : 0, air && c.state === ALIVE, c.clawAnim, !!after, c.state === DEAD ? c.deadAnim + 0.001 : 0, dt);
      } else if (fig.root.visible) fig.hide();
    }
  }

  /** The nearest cat a ray from o along unit vector d hits within maxDist, as drawn. */
  hit(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): { i: number; gen: number; dist: number; head: boolean } | null {
    let best: { i: number; gen: number; dist: number; head: boolean } | null = null;
    const sphere = (cx: number, cy: number, cz: number, r: number) => {
      const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
      const b = ox * d.x + oy * d.y + oz * d.z, c2 = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - c2;
      if (disc < 0) return Infinity;
      const t = -b - Math.sqrt(disc);
      return t > 0 ? t : Infinity;
    };
    this.list.forEach((c, i) => {
      if (c.state !== ALIVE) return;
      const s = c.fig.size, fx = -Math.sin(c.dyaw), fz = -Math.cos(c.dyaw);
      // a little generous: they're small
      const head = sphere(c.dx + fx * 0.27 * s, c.dy + 0.38 * s, c.dz + fz * 0.27 * s, 0.14);
      const by = c.dy + 0.27 * s, r = 0.2 * s + 0.03;
      const body = Math.min(sphere(c.dx, by, c.dz, r + 0.04), sphere(c.dx + fx * 0.14 * s, by, c.dz + fz * 0.14 * s, r), sphere(c.dx - fx * 0.14 * s, by, c.dz - fz * 0.14 * s, r));
      const dist = Math.min(head, body);
      if (dist < maxDist && (!best || dist < best.dist)) best = { i, gen: c.gen, dist, head: head <= body };
    });
    return best;
  }

  /** Living cats as drawn. */
  living() {
    return this.list.filter((c) => c.state === ALIVE).map((c) => ({ i: c.i, key: c.key, x: c.dx, y: c.dy, z: c.dz, target: c.target }));
  }

  at(i: number) {
    const c = this.list[i];
    return c ? { key: c.key, gen: c.gen, x: c.dx, y: c.dy, z: c.dz, yaw: c.dyaw, voice: c.voice } : null;
  }
}
