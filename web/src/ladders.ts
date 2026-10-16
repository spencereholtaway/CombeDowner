// Ladders. An extending aluminium ladder turns up about the streets like anything else to pick up
// (pickups.ts), and a ladder lad drops his when you put him down. Carry it to a building, face the
// wall and press E: it runs up to the edge of the roof, as high as REACH. Then anyone can climb it:
// walk into its foot and you're on it, W climbs (or comes down, facing away from the wall), and at
// the top you step off onto the roof; walk off a roof's edge over the top of one to come down, and
// Space lets go. E at its foot takes it down again to carry on with. You carry one at a time, over
// your shoulder where everyone can see it. One left standing with nobody about goes after a while.
//
// The host owns them: who's carrying one and where each one stands. Putting one up or taking one
// down is a request to the host ("ldr"), which sends everyone the list ("lds"). Climbing is your
// own movement (player.ts), like walking. The roof you step onto is whatever map.ts says you can
// stand on there (buildings, the full-detail squares' roofs, set pieces' solids), so ladders go up
// anything you could otherwise stand on top of.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LADDER_OVER, type Rungs } from "./player";

export const REACH = 15;           // the highest roof a ladder reaches, metres above its foot
const LOW = 1.5;                   // anything lower you just climb (player.ts)
const ARM = 1.8;                   // how far in front of you a wall can be to put one up against it
const LONELY = 180;                // seconds a ladder stands with nobody near before it goes
const NEARBY = 60;                 // metres that counts as near
const MOST = 12;                   // ladders standing at once: put up another and the oldest goes
const RISE = 1.1;                  // seconds it takes to run up to the roof
const ALU = new THREE.MeshLambertMaterial({ color: "#b9bec4" });

/** Something to probe: what you can stand on at (x, z) for feet at y (map.ts). */
interface Floors { floor(x: number, z: number, y: number): number }

export interface Standing extends Rungs { id: number; obj: THREE.Group; ladder: THREE.Mesh; born: number; lonely: number }

/** A ladder len metres long, from its foot up local Y, the rungs across X. One mesh. */
export function ladderGeometry(len: number): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  for (const x of [-0.21, 0.21]) geos.push(new THREE.BoxGeometry(0.045, len, 0.07).translate(x, len / 2, 0));
  for (let y = 0.25; y < len - 0.05; y += 0.3) geos.push(new THREE.BoxGeometry(0.42, 0.035, 0.035).translate(0, y, 0));
  return mergeGeometries(geos)!;
}

/** The ladder over someone's shoulder, front to back, for avatar.ts. */
export function carriedLadder(): THREE.Mesh {
  const m = new THREE.Mesh(ladderGeometry(2.6).translate(0, -1.3, 0), ALU);
  m.rotation.set(Math.PI / 2 - 0.12, 0, -0.35);
  m.position.set(0.3, 1.5, 0);
  m.castShadow = true;
  return m;
}

/** The ladder lying about to pick up, short enough to spin (pickups.ts). */
export function ladderPickup(): THREE.Group {
  const g = new THREE.Group(), m = new THREE.Mesh(ladderGeometry(1.5).translate(0, -0.75, 0), ALU);
  m.rotation.z = 0.5;
  m.position.y = 0.35;   // clear of the ground as it spins
  m.castShadow = true;
  g.add(m);
  return g;
}

export class Ladders {
  readonly up = new Map<number, Standing>();
  /** Who has one with them (the host's say). */
  carriers = new Set<string>();
  /** Set when a ladder we hadn't seen goes up, for the sound of it: where. */
  onRaise: (x: number, y: number, z: number) => void = () => {};
  private group = new THREE.Group();
  private last = new Map<string, [number, number]>();   // host: where each carrier was last seen
  private nextId = 1 + Math.floor(Math.random() * 1e6);
  private t = 0;

  constructor(private map: Floors, scene: THREE.Scene) { scene.add(this.group); }

  /** Where a ladder would stand if someone with feet at (x, y, z) facing yaw put one up, or why it can't. */
  aim(x: number, y: number, z: number, yaw: number): Rungs | string {
    const high = y + 60;
    // walk out a ray until what you could stand on jumps up: that's a wall, and above it a roof
    const edge = (a: number): { s: number; h: number } | null => {
      const fx = -Math.sin(a), fz = -Math.cos(a);
      let was = this.map.floor(x + fx * 0.1, z + fz * 0.1, high);
      for (let s = 0.15; s <= ARM; s += 0.05) {
        const h = this.map.floor(x + fx * s, z + fz * s, high);
        if (h - was > LOW && h - y > LOW) return { s, h };
        was = h;
      }
      return null;
    };
    const e = edge(yaw);
    if (!e) return "Face the wall of a building to put the ladder up";
    let fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const ex = x + fx * e.s, ez = z + fz * e.s;
    // square it up to the wall, from where rays a little either side meet it
    const l = edge(yaw + 0.3), r = edge(yaw - 0.3);
    if (l && r) {
      const lx = x - Math.sin(yaw + 0.3) * l.s, lz = z - Math.cos(yaw + 0.3) * l.s;
      const rx = x - Math.sin(yaw - 0.3) * r.s, rz = z - Math.cos(yaw - 0.3) * r.s;
      const tx = rx - lx, tz = rz - lz, tl = Math.hypot(tx, tz);
      if (tl > 0.2) {
        let nx = -tz / tl, nz = tx / tl;
        if (nx * fx + nz * fz < 0) { nx = -nx; nz = -nz; }
        if (nx * fx + nz * fz > 0.6) { fx = nx; fz = nz; }   // not a corner
      }
    }
    const y1 = this.map.floor(ex + fx * 0.3, ez + fz * 0.3, high);
    if (y1 - y > REACH) return `Too high: the ladder reaches ${REACH} metres`;
    const out = Math.max(0.5, Math.min(1.4, (y1 - y) * 0.12));
    const y0 = this.map.floor(ex - fx * (out + 0.4), ez - fz * (out + 0.4), y + 0.5);
    if (y1 - y0 < LOW) return "That's low enough to climb: jump at it";
    if (this.map.floor(ex + fx * 0.6, ez + fz * 0.6, y1 + 0.1) < y1 - 0.5) return "There's nowhere to stand up there";
    return { x: ex, z: ez, nx: fx, nz: fz, y0, y1, out };
  }

  /** Host: stand one up where `who` put it, if they've got one. Returns true if anything changed. */
  put(who: string, r: Rungs): boolean {
    if (!this.carriers.has(who) || !r || ![r.x, r.z, r.nx, r.nz, r.y0, r.y1, r.out].every(Number.isFinite)) return false;
    const n = Math.hypot(r.nx, r.nz);
    if (n < 0.5 || r.y1 - r.y0 > REACH + 1 || r.y1 <= r.y0 || r.out < 0 || r.out > 2) return false;
    this.carriers.delete(who);
    this.add(this.nextId++, { x: r.x, z: r.z, nx: r.nx / n, nz: r.nz / n, y0: r.y0, y1: r.y1, out: r.out });
    while (this.up.size > MOST) this.remove([...this.up.keys()][0]);
    return true;
  }

  /** Host: `who` takes ladder id down to carry. Returns true if they got it. */
  take(who: string, id: number): boolean {
    if (this.carriers.has(who) || !this.up.has(id)) return false;
    this.remove(id);
    this.carriers.add(who);
    return true;
  }

  /** Host: `who` picked one up (pickups.ts). */
  give(who: string) { this.carriers.add(who); }

  /** Host: `who` lets go of theirs for something else to carry. Returns true if they had one. */
  drop(who: string): boolean { this.last.delete(who); return this.carriers.delete(who); }

  /** Host: let ladders nobody's been near for a while go, and anyone gone or down drops theirs.
   *  Returns where dropped ladders should lie (as pickups) and whether the list changed. */
  host(dt: number, players: { id: string; x: number; z: number; alive: boolean }[]): { drops: [number, number][]; changed: boolean } {
    const drops: [number, number][] = [];
    let changed = false;
    for (const p of players) if (p.alive && this.carriers.has(p.id)) this.last.set(p.id, [p.x, p.z]);
    for (const id of [...this.carriers]) {
      const p = players.find((q) => q.id === id);
      if (p?.alive) continue;
      this.carriers.delete(id);
      const at = p ? [p.x, p.z] as [number, number] : this.last.get(id);
      if (at) drops.push(at);
      this.last.delete(id);
      changed = true;
    }
    for (const L of [...this.up.values()]) {
      const near = players.some((p) => Math.hypot(p.x - L.x, p.z - L.z) < NEARBY);
      L.lonely = near ? 0 : L.lonely + dt;
      if (L.lonely > LONELY) { this.remove(L.id); changed = true; }
    }
    return { drops, changed };
  }

  /** The list as the host sends it: who's carrying, and each standing ladder (centimetres and thousandths). */
  snapshot(): { c: string[]; u: number[][] } {
    const cm = (v: number) => Math.round(v * 100), th = (v: number) => Math.round(v * 1000);
    return { c: [...this.carriers], u: [...this.up.values()].map((L) => [L.id, cm(L.x), cm(L.z), th(L.nx), th(L.nz), cm(L.y0), cm(L.y1), cm(L.out)]) };
  }

  /** Take on the host's list. */
  apply(d: { c?: unknown; u?: unknown }) {
    if (!d || !Array.isArray(d.c) || !Array.isArray(d.u)) return;
    this.carriers = new Set(d.c.filter((c): c is string => typeof c === "string"));
    const seen = new Set<number>();
    for (const e of d.u) {
      if (!Array.isArray(e) || e.length < 8 || !e.every(Number.isFinite)) continue;
      const [id, x, z, nx, nz, y0, y1, out] = e as number[];
      seen.add(id);
      if (this.up.has(id)) continue;
      this.add(id, { x: x / 100, z: z / 100, nx: nx / 1000, nz: nz / 1000, y0: y0 / 100, y1: y1 / 100, out: out / 100 });
      this.onRaise(x / 100, (y0 + y1) / 200, z / 100);
    }
    for (const id of [...this.up.keys()]) if (!seen.has(id)) this.remove(id);
  }

  /** Host: take on what a host before us had too (it hands over when someone with a lower id turns up). */
  merge(d: { c?: unknown; u?: unknown }) {
    if (!d || !Array.isArray(d.c) || !Array.isArray(d.u)) return;
    for (const c of d.c) if (typeof c === "string") this.carriers.add(c);
    const had = new Set(this.up.keys()), raise = this.onRaise;
    this.onRaise = () => {};   // they're already up
    this.apply({ c: [...this.carriers], u: [...this.snapshot().u, ...d.u.filter((e) => Array.isArray(e) && !had.has(e[0]))] });
    this.onRaise = raise;
  }

  /** Ladders near scene (x, z), for the player to get on. */
  near(x: number, z: number, r = 25): Rungs[] {
    const out: Rungs[] = [];
    for (const L of this.up.values()) if (Math.hypot(L.x - x, L.z - z) < r) out.push(L);
    return out;
  }

  /** The ladder whose foot feet at (x, y, z) are standing by, to take down, if any. */
  footAt(x: number, y: number, z: number): Standing | null {
    for (const L of this.up.values()) {
      const fx = L.x - L.nx * (L.out + 0.4), fz = L.z - L.nz * (L.out + 0.4);
      if (Math.hypot(fx - x, fz - z) < 1.3 && Math.abs(y - L.y0) < 1) return L;
    }
    return null;
  }

  /** The ladder whose top feet at (x, y, z) on a roof are standing over, to take down, if any. */
  topAt(x: number, y: number, z: number): Standing | null {
    for (const L of this.up.values()) {
      const tx = L.x + L.nx * 0.6, tz = L.z + L.nz * 0.6;
      if (Math.hypot(tx - x, tz - z) < 1.3 && Math.abs(y - L.y1) < 1) return L;
    }
    return null;
  }

  /** Run new ones up to the roof. */
  update(dt: number) {
    this.t += dt;
    for (const L of this.up.values()) {
      const k = Math.min(1, (this.t - L.born) / RISE), s = L.ladder.userData.len as number;
      L.ladder.scale.y = k >= 1 ? 1 : Math.min(1, 2.6 / s + (1 - 2.6 / s) * (1 - (1 - k) ** 3));
    }
  }

  private add(id: number, r: Rungs) {
    this.remove(id);
    // from its foot, out from the wall, to its top against the wall a little over the roof
    const foot = new THREE.Vector3(r.x - r.nx * r.out, r.y0, r.z - r.nz * r.out);
    const top = new THREE.Vector3(r.x - r.nx * 0.08, r.y1 + LADDER_OVER, r.z - r.nz * 0.08);
    const u = top.clone().sub(foot), len = u.length();
    u.normalize();
    const side = new THREE.Vector3().crossVectors(u, new THREE.Vector3(r.nx, 0, r.nz)).normalize();
    const w = new THREE.Vector3().crossVectors(side, u);
    const ladder = new THREE.Mesh(ladderGeometry(len), ALU);
    ladder.castShadow = true;
    ladder.userData.len = len;
    const obj = new THREE.Group();
    obj.position.copy(foot);
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, u, w));
    obj.add(ladder);
    this.group.add(obj);
    this.up.set(id, { ...r, id, obj, ladder, born: this.t, lonely: 0 });
  }

  private remove(id: number) {
    const L = this.up.get(id);
    if (!L) return;
    this.group.remove(L.obj);
    L.ladder.geometry.dispose();
    this.up.delete(id);
  }
}
