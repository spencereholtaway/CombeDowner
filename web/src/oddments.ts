// The strange objects and the structure that wants them. Nobody in the game names either. The
// objects are softly glowing, slightly wrong lumps that don't belong to the town, and only the
// big things bring one: a team challenge won (challenges.ts), a pub won back from the Flag Lads,
// a job done to gold or three stars (no more than FEATS_A_DAY of those a game day). One turns up
// where it was earned, and has to be carried by hand to the structure, a leaning stack of dark
// frames standing on open ground, with a few empty sockets up its corners. It's solid, and the
// ground round it is kept clear of everything else the game puts down (map.ts keepClear). Each zone of the map
// but the last (zones.ts) has a structure of its own, and only the one in the furthest zone open
// takes objects. Carrying one fills your one carry slot (as a ride or a ladder does), stops you
// sprinting and slows you a little; X sets it down, and if you're downed it drops where you fell,
// for anyone to pick up. E by the structure sets it in the next socket. Sockets filled glow, and
// once a structure is full the next zone opens, with a fly-over of it, its name and its challenge
// (reveal.ts); opening the last plays a fly-over of the whole map. Both maps mark every structure
// in the zones open so far, with its zone and how many of its sockets are full: green once it's
// full, red while it wants filling, and the one taking objects now pulses and is pointed to from
// the minimap's rim however far off it is. Ones in zones not yet open stay hidden, as the zones
// themselves are. By a full structure with one in your hands, you're told where the next one is.
//
// Who decides what: the host keeps where every object lies, who's carrying which, how many sockets
// are full and which feats have already brought one today. Picking one up, setting one down,
// filling a socket and asking for one to be made are asks to the host ("odq"); the host sends
// the lot ("od") when anything changes, every few seconds and to anyone who joins. Every player
// keeps the last word in localStorage for this room and map (saves.ts: a room is a save), and when
// a room comes together the furthest anyone has got there (the most sockets full) is what the room
// takes on, so it never goes backwards. The host also counts the room's challenges won.
// Where the structures stand comes from the map alone, so everyone works out the same spots. The
// host also says whether it's playing with no zones at all (free play), and the room follows it.
// With the strange objects switched off (features.ts, the host's say) none turns up, no structure
// stands and nothing about them goes over the network.
import * as THREE from "three";
import * as SFX from "./audio";
import { missionReward } from "./missionscreens";
import { dayNumber } from "./daylight";
import { clearSpot } from "./haunts";
import { type GameMap, type RayHit, ANY_HEIGHT, UNDERGROUND, rayCircle } from "./map";
import { challengesOn, isChallenge } from "./challenges";
import { feature } from "./features";
import type { Zone, Zones } from "./zones";
import { compassWord, esc, far, type Job, type Offer } from "./quests";
import type { StructSpot } from "./minimap";
import type { Shot } from "./reveal";
import { oddKey } from "./saves";
import { count as wardCount, earn } from "./wardrobe";

/** At most this many objects a game day from feats; challenges won always bring one. */
const FEATS_A_DAY = 3;
const REACH = 2.2;                 // how close to pick one up
const SET_REACH = 5.5;             // and to the structure's middle to set it in a socket
const SEND_EVERY = 3;
const SHOWN = 1800;                // the structure is drawn from this far off
const SOLID = 3.3;                 // the plinth's radius, which takes in the frames above it
const KEEP = 9;                    // nothing the game puts down lands this near a structure's middle
const GLOW = "#ff5a7a", BODY = "#ffc4cf";

export interface Holder { id: string; x: number; y: number; z: number; yaw: number; alive: boolean }

/** The host's word: sockets full, objects made so far, the objects [id, x, y, z, carried by], feat keys used, a socket just filled, free play (every zone open), and challenges won. */
export interface OddState { f: number; n: number; o: [number, number, number, number, string][]; k: string[]; e?: { f: number; by: string }; a?: boolean; w?: number }

const empty = (): OddState => ({ f: 0, n: 0, o: [], k: [] });
const further = (a: OddState, b: OddState) => a.f > b.f || (a.f === b.f && ((a.w ?? 0) > (b.w ?? 0) || ((a.w ?? 0) === (b.w ?? 0) && a.o.length > b.o.length)));

const MOST = 64;

function clean(d: any): OddState | null {
  if (!d || !Number.isFinite(d.f) || !Array.isArray(d.o)) return null;
  const o = d.o.filter((q: any) => Array.isArray(q) && q.length >= 5 && q.slice(0, 4).every(Number.isFinite))
    .map((q: any) => [q[0] | 0, +q[1], +q[2], +q[3], typeof q[4] === "string" ? q[4] : ""] as [number, number, number, number, string]);
  const k = Array.isArray(d.k) ? d.k.filter((s: any) => typeof s === "string").slice(-40) : [];
  const e = d.e && Number.isFinite(d.e.f) ? { f: d.e.f | 0, by: String(d.e.by ?? "") } : undefined;
  return { f: Math.max(0, Math.min(MOST, d.f | 0)), n: Math.max(0, d.n | 0), o: o.slice(0, MOST), k, e, a: d.a === true, w: Math.max(0, Number(d.w) | 0) };
}

// ---- where the structure stands ----------------------------------------------------------------

function ringArea(r: number[][]) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a) / 2;
}
function inRing(r: number[][], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside;
  }
  return inside;
}
function segDist(px: number, py: number, a: number[], b: number[]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l)) : 0;
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}

/** Open ground for the structure, in data coordinates: the nearest big named open space to where
 *  everyone starts, clear of buildings, streets, trees and water, and near enough level. It reads
 *  only what every player has from the start (the first area and the city-wide map, not the
 *  squares that stream in), so everyone finds the same spot. skip: spots already taken; near:
 *  somewhere else to look round instead (data coordinates). */
export function openGround(map: GameMap, skip: [number, number][] = [], near?: [number, number]): { x: number; y: number; n: string } | null {
  const D = map.d, W = map.wide, sp = D.spawn?.length ? D.spawn : [[0, 0]];
  const hx = near ? near[0] : sp.reduce((s, p) => s + p[0], 0) / sp.length, hy = near ? near[1] : sp.reduce((s, p) => s + p[1], 0) / sp.length;
  const FAR = 2500;
  const segs: number[][] = [];
  for (const rd of [...D.rd, ...(W?.rd ?? [])]) {
    const half = (rd.w ?? 6) / 2 + 4;
    for (let i = 1; i < rd.p.length; i++) {
      const a = rd.p[i - 1], b = rd.p[i];
      if (Math.hypot(a[0] - hx, a[1] - hy) < FAR + 200) segs.push([a[0], a[1], b[0], b[1], half]);
    }
  }
  const water = [...D.wp, ...(W?.wp ?? [])].filter((w) => w.r[0]?.length);
  const clear = (x: number, y: number) => {
    if (skip.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < 60)) return false;
    if (map.fieldEdge(x, -y) < 60) return false;
    for (const b of [...D.bl.filter((q) => q.r[0] && Math.abs(q.r[0][0][0] - x) < 80 && Math.abs(q.r[0][0][1] - y) < 80), ...(W?.buildingsNear(x, y, 12) ?? [])]) {
      const r = b.r[0];
      if (inRing(r, x, y)) return false;
      for (let i = 0; i < r.length; i++) if (segDist(x, y, r[i], r[(i + 1) % r.length]) < 9) return false;
    }
    for (const q of segs) {
      if (Math.min(q[0], q[2]) - 20 > x || Math.max(q[0], q[2]) + 20 < x || Math.min(q[1], q[3]) - 20 > y || Math.max(q[1], q[3]) + 20 < y) continue;
      if (segDist(x, y, [q[0], q[1]], [q[2], q[3]]) < q[4]) return false;
    }
    if (W && W.treesNear(x, y, 4).length) return false;
    if (D.tr.some((t) => Math.hypot(t[0] - x, t[1] - y) < 5)) return false;
    for (const w of water) if (inRing(w.r[0], x, y)) return false;
    const ground = (gx: number, gz: number) => (W ? W.ground(gx, gz) : map.ground(gx, gz));
    const g = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ground(x + Math.cos(k * 0.785) * 6, -(y + Math.sin(k * 0.785) * 6)));
    return Math.max(...g) - Math.min(...g) < 2.2;
  };
  const places = [...(D.pl ?? []), ...(W?.d.pl ?? [])].filter((p) => p.n && p.r.length >= 3 && ringArea(p.r) > 2500).map((p) => {
    const cx = p.r.reduce((s, q) => s + q[0], 0) / p.r.length, cy = p.r.reduce((s, q) => s + q[1], 0) / p.r.length;
    return { p, cx, cy, d: Math.hypot(cx - hx, cy - hy) };
  }).filter((p) => p.d < FAR).sort((a, b) => a.d - b.d || a.p.n.localeCompare(b.p.n));
  for (const { p, cx, cy } of places.slice(0, 30)) {
    for (let r = 0; r <= 40; r += 5) {
      for (let k = 0, n = r ? 12 : 1; k < n; k++) {
        const x = cx + Math.cos((k / n) * Math.PI * 2) * r, y = cy + Math.sin((k / n) * Math.PI * 2) * r;
        if (inRing(p.r, x, y) && clear(x, y)) return { x, y, n: p.n };
      }
    }
  }
  for (let r = 20; r <= (near ? 1500 : 400); r += 10) {
    for (let k = 0; k < 16; k++) {
      const x = hx + Math.cos((k / 16) * Math.PI * 2) * r, y = hy + Math.sin((k / 16) * Math.PI * 2) * r;
      if (clear(x, y)) return { x, y, n: "" };
    }
  }
  return null;
}

// ---- the look of them -----------------------------------------------------------------------------

/** One lump, the same for every object: a ball pushed out of true, with a smaller one grown off its side. */
function lump(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.3, 2), p = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    // a bulge low on one side and a pinch near the top: gourd-ish, but not quite anything
    const s = 1 + 0.32 * Math.max(0, -n.y) * (0.6 + 0.4 * n.x) - 0.22 * Math.max(0, n.y - 0.4) + 0.05 * Math.sin(n.x * 9 + n.z * 7);
    v.copy(n).multiplyScalar(0.3 * s);
    v.x += 0.06 * n.y * n.y;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
const LUMP = lump();
const BUD = new THREE.IcosahedronGeometry(0.11, 1).translate(0.13, 0.31, 0.05);
const HALO = new THREE.SphereGeometry(0.48, 12, 8);
const BEAM = new THREE.CylinderGeometry(0.05, 0.4, 7, 8, 1, true).translate(0, 3.5, 0);
const LUMP_MAT = new THREE.MeshLambertMaterial({ color: BODY, emissive: GLOW, emissiveIntensity: 0.6 });
const HALO_MAT = new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const BEAM_MAT = new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });

function oddment(beam: boolean): THREE.Group {
  const g = new THREE.Group(), core = new THREE.Group();
  core.add(new THREE.Mesh(LUMP, LUMP_MAT), new THREE.Mesh(BUD, LUMP_MAT));
  core.rotation.z = 0.35;
  core.name = "core";
  g.add(core, new THREE.Mesh(HALO, HALO_MAT));
  if (beam) { const b = new THREE.Mesh(BEAM, BEAM_MAT); b.name = "beam"; g.add(b); }
  return g;
}

const STONE = new THREE.MeshLambertMaterial({ color: "#48414f" });
const STONE_LIT = new THREE.MeshLambertMaterial({ color: "#56434f", emissive: GLOW, emissiveIntensity: 0.3 });
const CUP = new THREE.CylinderGeometry(0.34, 0.24, 0.22, 10, 1, true);
const CUP_MAT = new THREE.MeshLambertMaterial({ color: "#16131b", side: THREE.DoubleSide });
/** A structure: a low eight-sided plinth and a leaning stack of square frames, each a little
 *  smaller and turned a little further than the one under it, with n sockets up the frames' corners. */
function structure(n: number): { root: THREE.Group; sockets: THREE.Vector3[]; frames: THREE.Mesh[][] } {
  const FRAMES = Math.max(1, Math.ceil(n / 4));
  const root = new THREE.Group(), sockets: THREE.Vector3[] = [], frames: THREE.Mesh[][] = [];
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.3, 0.55, 8), STONE);
  plinth.position.y = 0.27; plinth.castShadow = plinth.receiveShadow = true;
  root.add(plinth);
  let y = 0.55;
  for (let k = 0; k < FRAMES; k++) {
    const s = 3.4 - k * 0.36, t = 0.2, h = 0.24, gap = 0.95 + k * 0.06, a = k * 0.3, lean = k * 0.09;
    const f = new THREE.Group(), bars: THREE.Mesh[] = [];
    for (const [w, d, x, z] of [[s, t, 0, s / 2], [s, t, 0, -s / 2], [t, s, s / 2, 0], [t, s, -s / 2, 0]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w + t, h, d + t), STONE);
      m.position.set(x, 0, z); m.castShadow = true;
      f.add(m); bars.push(m);
    }
    // the posts between this frame and the one under it, at two corners only
    for (const [px, pz] of [[s / 2, s / 2], [-s / 2, -s / 2]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(t * 0.8, gap, t * 0.8), STONE);
      post.position.set(px, -gap / 2, pz);
      f.add(post);
    }
    y += gap;
    f.position.set(lean, y, lean * 0.4); f.rotation.y = a;
    root.add(f);
    frames.push(bars);
    for (const [cx, cz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
      if (sockets.length >= n) break;
      const cup = new THREE.Mesh(CUP, CUP_MAT);
      cup.position.set((cx * s) / 2, h / 2 + 0.11, (cz * s) / 2);
      f.add(cup);
      f.updateMatrix();
      sockets.push(cup.position.clone().add(new THREE.Vector3(0, 0.22, 0)).applyMatrix4(f.matrix));
    }
  }
  return { root, sockets, frames };
}

/** How high a structure with n sockets stands, objects in its top sockets and all. */
function structureTop(n: number) {
  let y = 0.55;
  for (let k = 0; k < Math.max(1, Math.ceil(n / 4)); k++) y += 0.95 + k * 0.06;
  return y + 0.7;
}

// ---- the game's side of them ----------------------------------------------------------------------

type Built = { root: THREE.Group; sockets: THREE.Vector3[]; frames: THREE.Mesh[][] };
/** One zone's structure: where it stands, and once someone's been near, its model and the objects in it. */
interface Struct { zone: Zone; x: number; y: number; z: number; built: Built | null; inSockets: THREE.Group[] }

export class Oddments {
  private s: OddState = empty();
  private saved: OddState = empty();
  private known = false;
  private merged = false;
  private group = new THREE.Group();
  private structs: Struct[] = [];
  private lying = new Map<number, THREE.Group>();
  private carried = new Map<string, THREE.Group>();
  private flying: { g: THREE.Group; from: THREE.Vector3; to: THREE.Vector3; t: number; at: Struct }[] = [];
  private asked = 0;
  private sendT = 0;
  private devAsk = 0;
  private devZone = 0;
  private me: Holder | null = null;
  private shots: Shot[] = [];
  private on = feature("strange");
  private hostFree = false;

  send: (type: "od" | "odq", d: unknown, to?: string) => void = () => {};
  toast: (text: string) => void = () => {};
  hear: (x: number, y: number, z: number) => [number, number] = () => [0, 0];
  /** You've just picked one up: whatever else was in your hands is left behind (game.ts). */
  onGot: () => void = () => {};
  /** Host: a ride left on the ground where someone picked one up. */
  leave: (ride: string, x: number, z: number) => void = () => {};
  /** A zone just opened: challenges have opened up, so the noticeboards change. */
  onOpen: () => void = () => {};

  /** free: this player would play with no zones, which counts for the room if they're its host. */
  constructor(private map: GameMap, scene: THREE.Scene, private mapId: string, private room: string, private zones: Zones, private free: boolean) {
    scene.add(this.group);
    this.group.visible = this.on;
    try {
      const d = clean(JSON.parse(localStorage.getItem(this.key) ?? "null"));
      if (d) this.s = this.saved = { ...d, e: undefined, a: undefined };
    } catch { /* no storage: from nothing */ }
    for (const zone of zones.list) if (zone.home && zone.sockets) this.structs.push({ zone, x: zone.home.x, y: zone.home.y, z: zone.home.z, built: null, inSockets: [] });
    this.makeSolid();
    zones.set(this.s.f, this.freePlay);
    const q = new URLSearchParams(location.search);
    // for testing: ?objects=6 has that many turn up round you, and ?zone=3 opens up to the third zone, fly-overs and all
    const dev = q.get("objects");
    if (dev !== null && Number.isFinite(+dev)) this.devAsk = Math.max(0, Math.min(MOST, Math.round(+dev)));
    const zone = q.get("zone");
    if (zone !== null && Number.isFinite(+zone)) this.devZone = Math.max(1, Math.min(zones.count, Math.round(+zone)));
  }

  /** The structures stand solid from the start, wherever anyone is, and the ground round them is
   *  kept clear of everything else the game puts down (noticeboards, races, spawns, cars, objects). */
  private makeSolid() {
    const solid = this.structs.map((t) => ({ x: t.x, z: t.z, y: t.y, top: t.y + structureTop(t.zone.sockets) }));
    this.pusher = (pos, y, r) => {
      let block = -Infinity;
      for (const t of solid) {
        if (y > t.top || (y < t.y - UNDERGROUND && y !== ANY_HEIGHT)) continue;
        const dx = pos.x - t.x, dz = pos.z - t.z, d = Math.hypot(dx, dz), m = SOLID + r;
        if (d >= m) continue;
        const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0;
        pos.x = t.x + ux * m; pos.z = t.z + uz * m;
        block = Math.max(block, t.top - y);
      }
      return block;
    };
    this.ray = (ox, oy, oz, dx, dy, dz, maxDist) => {
      let best: RayHit | null = null;
      for (const t of solid) {
        const hit = rayCircle(ox, oz, dx, dz, t.x, t.z, SOLID);
        if (hit < 0 || hit > maxDist || (best && hit >= best.dist)) continue;
        const y = oy + dy * hit;
        if (y < t.y || y > t.top) continue;
        const hx = ox + dx * hit - t.x, hz = oz + dz * hit - t.z, l = Math.hypot(hx, hz) || 1;
        best = { dist: hit, kind: "barrier", nx: hx / l, ny: 0, nz: hz / l };
      }
      return best;
    };
    this.kept = solid.map((t) => ({ x: t.x, z: t.z, r: KEEP }));
    if (this.on) this.solid(true);
  }
  private solid(on: boolean) {
    const out = <T,>(list: T[], v: T) => { const k = list.indexOf(v); if (k >= 0) list.splice(k, 1); };
    out(this.map.pushers, this.pusher);
    out(this.map.rays, this.ray);
    for (const k of this.kept) out(this.map.keepClear, k);
    if (!on) return;
    this.map.pushers.push(this.pusher);
    this.map.rays.push(this.ray);
    this.map.keepClear.push(...this.kept);
  }

  /** Free play as this player would have it: chosen on the menu, or the zones switched off. */
  private get freePlay() { return this.free || !feature("zones"); }

  /** The room's switches have changed (features.ts): the objects and structures come or go, and the wall with them. */
  switched() {
    const on = feature("strange");
    if (on !== this.on) {
      this.on = on;
      this.solid(on);
      this.group.visible = on;
      if (!on) { this.shots = []; for (const f of this.flying) this.group.remove(f.g); this.flying = []; }
    }
    this.zones.set(this.s.f, !feature("zones") || (this.known ? this.hostFree : this.free));
  }
  private pusher: GameMap["pushers"][number] = () => -Infinity;
  private ray: GameMap["rays"][number] = () => null;
  private kept: GameMap["keepClear"] = [];

  private get key() { return oddKey(this.mapId, this.room); }

  /** How many sockets are full. */
  get filled() { return this.s.f; }
  private get total() { return this.zones.sockets; }

  /** The structure that takes the next object, if there's one still wanting them. */
  private cur(): Struct | undefined {
    const z = this.zones.current(this.s.f);
    return z ? this.structs.find((t) => t.zone === z) : undefined;
  }
  /** The structure the socket numbered f (from 0) is in. */
  private structOf(f: number): Struct | undefined {
    return this.structs.find((t) => f >= this.zones.need(t.zone.i) && f < this.zones.need(t.zone.i) + t.zone.sockets);
  }

  /** The structures in the zones open so far, for the maps. */
  marks(): StructSpot[] {
    if (!this.on) return [];
    const c = this.cur();
    return this.structs.filter((t) => this.zones.isOpen(t.zone.i)).map((t) => ({
      x: t.x, z: t.z, place: t.zone.home?.n ?? "", zone: t.zone.name, sockets: t.zone.sockets, next: t === c,
      filled: Math.max(0, Math.min(t.zone.sockets, this.s.f - this.zones.need(t.zone.i))),
    }));
  }

  /** Whether id is carrying one. */
  carrying(id: string) { return this.on && this.s.o.some((o) => o[4] === id); }

  /** The fly-overs waiting to play (reveal.ts), oldest first. */
  nextShot(): Shot | undefined { return this.on ? this.shots.shift() : undefined; }

  // ---- the network ----

  apply(d: unknown, me: string) {
    if (!this.on) return;
    const s = clean(d);
    if (!s) return;
    // the first word from a host: if we've got further on our own, the room takes ours
    if (!this.merged) {
      this.merged = true;
      if (further(this.saved, s)) this.send("odq", { op: "mine", r: this.saved });
    }
    this.take(s, me);
  }

  /** Host: someone asks for something. */
  ask(from: string, d: any, me: string, everyone: Holder[]) {
    if (!this.on || !d || typeof d !== "object") return;
    const s = this.s, who = everyone.find((p) => p.id === from);
    let changed = false;
    if (d.op === "take" && who?.alive && !this.carrying(from)) {
      const o = s.o.find((q) => q[0] === d.i && !q[4]);
      if (o && Math.hypot(o[1] - who.x, o[3] - who.z) < REACH * 3) {
        o[4] = from; changed = true;
        if (typeof d.ride === "string") this.leave(d.ride, who.x, who.z);
      }
    } else if (d.op === "drop") {
      const o = s.o.find((q) => q[4] === from);
      if (o) {
        const x = Number.isFinite(d.x) ? +d.x : who?.x ?? o[1], z = Number.isFinite(d.z) ? +d.z : who?.z ?? o[3];
        o[1] = x; o[3] = z; o[2] = Number.isFinite(d.y) ? +d.y : this.map.ground(x, z); o[4] = "";
        changed = true;
      }
    } else if (d.op === "fill" && who?.alive) {
      const k = s.o.findIndex((q) => q[4] === from), c = this.cur();
      if (k >= 0 && c && s.f < this.total && Math.hypot(who.x - c.x, who.z - c.z) < SET_REACH * 2) {
        s.o.splice(k, 1); s.f++; s.e = { f: s.f, by: from }; changed = true;
      }
    } else if (d.op === "earn" && typeof d.key === "string" && Number.isFinite(d.x) && Number.isFinite(d.z)) {
      changed = this.earnHere(d.key, +d.x, +d.z, !!d.c);
    } else if (d.op === "spawn" && Number.isFinite(d.n) && Number.isFinite(d.x) && Number.isFinite(d.z)) {
      const n = Math.max(0, Math.min(this.total - s.f - s.o.length, d.n | 0));
      for (let i = 0; i < n; i++) {
        const a = (i / Math.max(1, n)) * Math.PI * 2;
        this.make(+d.x + Math.cos(a) * (3 + (i % 3)), +d.z + Math.sin(a) * (3 + (i % 3)));
      }
      changed = n > 0;
    } else if (d.op === "zone" && Number.isFinite(d.n)) {
      // for testing: straight to zone n open, with its fly-overs, as if the last socket had just been filled
      const f = this.zones.need(Math.max(0, Math.min(this.zones.count - 1, (d.n | 0) - 1)));
      if (f !== s.f) { s.f = f; s.o = s.o.slice(0, Math.max(0, this.total - f)); if (f > 0) s.e = { f, by: from }; changed = true; }
    } else if (d.op === "mine") {
      const r = clean(d.r);
      if (r && further(r, s)) {
        // the room takes on whoever's furthest; anything in someone's hands is put down where it was
        this.s = { f: r.f, n: Math.max(s.n, r.n), o: r.o.map((q) => [q[0], q[1], q[2], q[3], ""] as OddState["o"][number]), k: [...new Set([...s.k, ...r.k])].slice(-40), w: Math.max(s.w ?? 0, r.w ?? 0) };
        changed = true;
      }
    }
    if (changed) this.publish(me);
    delete this.s.e;
  }

  /** Host: an object for a feat or a challenge won (key: so the same one doesn't bring two). */
  private earnHere(key: string, x: number, z: number, challenge: boolean): boolean {
    const s = this.s, day = dayNumber(), k = `${day}:${key}`;
    s.k = s.k.filter((q) => q.startsWith(`${day}:`));
    if (s.k.includes(k)) return false;
    if (challenge) { s.k.push(k); s.w = (s.w ?? 0) + 1; }
    if (s.f + s.o.length >= this.total) return challenge;
    if (!challenge && s.k.filter((q) => !q.startsWith(`${day}:c:`)).length >= FEATS_A_DAY) return false;
    if (!challenge) s.k.push(k);
    this.make(x, z);
    return true;
  }

  private make(x: number, z: number) {
    const c = clearSpot(this.map, x, z, 12) ?? [x, z];
    this.s.o.push([++this.s.n, c[0], this.map.ground(c[0], c[1]), c[1], ""]);
  }

  /** Host: tell someone who's just joined how things stand. */
  joined(id: string) { if (this.on) this.send("od", this.snapshot(), id); }

  private snapshot(): OddState { return { ...this.s, o: this.s.o.map((q) => [...q] as OddState["o"][number]), a: this.freePlay }; }

  private publish(me: string) {
    const snap = this.snapshot();
    this.send("od", snap);
    this.take(snap, me);
    this.sendT = SEND_EVERY;
  }

  /** Take a word on the objects (the host's, or our own as host). */
  private take(d: OddState, me: string) {
    // compared with the last word taken, not this.s: the host changes that in place before sending
    const was = this.last, wasF = this.known ? was.f : d.f, had = this.known && was.has;
    this.s = d;
    const has = d.o.some((o) => o[4] === me);
    if (has && !had) { SFX.oddment("up"); this.onGot(); }
    if (this.known && this.me) {
      const near = d.o.some((o) => o[0] > was.n && !o[4] && Math.hypot(o[1] - this.me!.x, o[3] - this.me!.z) < 400);
      // a challenge's promised object: on its result card if that's still up, else said
      if (near && !missionReward("Something strange has turned up")) this.toast("Something strange has turned up");
    }
    const wasOpen = this.zones.open, wasFree = this.zones.free;
    this.hostFree = !!d.a;
    this.zones.set(d.f, this.hostFree || !feature("zones"));
    if (d.e && d.e.f === d.f && d.f > wasF) this.socketFilled(d.e.by, me, wasF);
    else if (this.known && (this.zones.open !== wasOpen || this.zones.free !== wasFree)) this.onOpen();
    this.known = true;
    this.last = { f: d.f, n: d.n, has };
    this.save(d);
    this.paint();
  }
  private last = { f: 0, n: 0, has: false };

  /** A socket's just been filled, live: it flies in, and a zone opened plays its fly-over. */
  private socketFilled(by: string, me: string, wasF: number) {
    const at = this.structOf(this.s.f - 1), to = at?.built?.sockets[this.s.f - 1 - this.zones.need(at.zone.i)];
    const who = by === me ? this.me : this.others.find((p) => p.id === by);
    if (at?.built && to && who) {
      const g = oddment(false);
      this.group.add(g);
      this.flying.push({ g, from: new THREE.Vector3(who.x, who.y + 1.2, who.z), to: to.clone().applyMatrix4(at.built.root.matrixWorld), t: 0, at });
    }
    if (at) {
      const [dist, pan] = this.hear(at.x, at.y + 2, at.z);
      SFX.oddment("set", dist, pan);
    }
    const before = this.zones.openFor(wasF), after = this.zones.openFor(this.s.f);
    if (by === me && wardCount("odd") >= 5) earn("orb");
    if (!this.zones.free && after > before) {
      if (by === me) earn("party");
      // everyone in the room when it happens, whoever set the last one
      if (after >= this.zones.count) earn("crown");
    }
    if (this.zones.free || after <= before) return;
    for (let k = before; k < after; k++) this.shots.push(this.shotFor(k));
    if (after >= this.zones.count) this.shots.push(this.shotFor(this.zones.count));
    this.onOpen();
  }

  /** The fly-over for zone k opening; k at the count of zones, the last one's, over the whole map. */
  shotFor(k: number): Shot {
    if (k >= this.zones.count) {
      const last = this.structs[this.structs.length - 1] ?? { x: this.zones.list[0].x, z: this.zones.list[0].z };
      return { kind: "map", x: last.x, z: last.z, kicker: "Every zone is open", title: "The whole map is yours", sub: "Every challenge here is yours to take on" };
    }
    const zn = this.zones.list[k], ch = challengesOn(this.map).filter((p) => p.zone === k);
    const look = ch[0]?.spots[0] ?? zn.home ?? zn;
    return {
      kind: "spot", x: look.x, z: look.z, kicker: "A new part of the map is open", title: zn.name,
      sub: ch.length ? `New challenge: ${ch.map((p) => p.c.name).join(" and ")}` : "",
      lines: this.zones.news(k),
    };
  }

  private save(d: OddState) {
    // anything in someone's hands is kept as lying where they are, so closing the page loses nothing
    const o = d.o.map((q) => {
      const p = q[4] ? (q[4] === this.me?.id ? this.me : this.others.find((r) => r.id === q[4])) : null;
      return [q[0], p?.x ?? q[1], p?.y ?? q[2], p?.z ?? q[3], ""] as OddState["o"][number];
    });
    // a host on an older page doesn't count challenges, so the room's count is only ever raised here
    this.saved = { f: d.f, n: d.n, o, k: d.k, w: Math.max(this.saved.w ?? 0, d.w ?? 0) };
    const menu = { z: this.zones.openFor(d.f), zc: this.zones.count, at: Date.now() };
    try { localStorage.setItem(this.key, JSON.stringify({ ...this.saved, ...menu })); } catch { /* fine */ }
  }

  // ---- what earns one ----

  /** A job for the room has ended (quests.ts), on every screen. */
  jobEnd(o: Offer, d: NonNullable<Job["done"]>, isHost: boolean) {
    if (!d.won || !this.on) return;
    const x = d.x ?? o.x, z = d.z ?? o.z;
    if (isChallenge(o.kind)) { if (isHost) this.earn(`c:${o.kind}:${o.seed}`, x, z, isHost, true); return; }
    if (d.grade?.tier === 3) this.earn(`j:${o.seed}`, x, z, isHost);
  }

  /** A pub won back from the Flag Lads (invasion.ts), on every screen. */
  pubWon(d: any, isHost: boolean) {
    if (this.on && isHost && Number.isFinite(+d?.x) && Number.isFinite(+d?.z)) this.earn(`p:${String(d.name ?? "")}`, +d.x, +d.z, isHost);
  }

  private earn(key: string, x: number, z: number, isHost: boolean, challenge = false) {
    if (isHost) { if (this.earnHere(key, x, z, challenge)) this.publish(this.me?.id ?? ""); }
    else this.send("odq", { op: "earn", key, x, z, c: challenge });
  }

  /** For testing: n objects round you. */
  spawnNear(n: number, isHost: boolean) {
    const me = this.me;
    if (!me || !this.on) return;
    const d = { op: "spawn", n, x: me.x, z: me.z };
    if (isHost) this.ask(me.id, d, me.id, [me, ...this.others]);
    else this.send("odq", d);
  }

  /** For testing: straight to zone n open. */
  openZone(n: number, isHost: boolean) {
    const me = this.me, d = { op: "zone", n };
    if (!this.on) return;
    if (isHost && me) this.ask(me.id, d, me.id, [me, ...this.others]);
    else this.send("odq", d);
  }

  // ---- your keys ----

  private nearest(me: Holder) {
    let best: OddState["o"][number] | null = null, bd = REACH;
    for (const o of this.s.o) {
      if (o[4]) continue;
      const d = Math.hypot(o[1] - me.x, o[3] - me.z);
      if (d < bd && Math.abs(o[2] - me.y) < 2.5) { bd = d; best = o; }
    }
    return best;
  }
  private atStructure(me: Holder) { const c = this.cur(); return !!c && Math.hypot(me.x - c.x, me.z - c.z) < SET_REACH && Math.abs(me.y - c.y) < 4; }
  /** By a structure that's already full, which takes no more. */
  private atFull(me: Holder) { const c = this.cur(); return this.structs.some((t) => t !== c && Math.hypot(me.x - t.x, me.z - t.z) < SET_REACH && Math.abs(me.y - t.y) < 4); }

  /** Where the thing E would act on is (the object at your feet, or the structure), so the game can
   *  tell whether you're looking at it; null if E does nothing here. */
  useAt(me: Holder): { x: number; y: number; z: number; r: number } | null {
    if (!this.on || !me.alive) return null;
    if (this.carrying(me.id)) { const c = this.cur(); return c && this.atStructure(me) && this.s.f < this.total ? { x: c.x, y: c.y + 2, z: c.z, r: 2 } : null; }
    const o = this.nearest(me);
    return o ? { x: o[1], y: o[2] + 0.3, z: o[3], r: 0.4 } : null;
  }

  /** E: pick one up, or set yours in a socket. ride: the ride you'd leave here. Returns true if E was for that. */
  use(me: Holder, isHost: boolean, ride?: string): boolean {
    if (!this.on || !me.alive || performance.now() - this.asked < 600) return false;
    let d: unknown = null;
    if (this.carrying(me.id)) { if (this.atStructure(me) && this.s.f < this.total) d = { op: "fill" }; }
    else { const o = this.nearest(me); if (o) d = { op: "take", i: o[0], ride }; }
    if (!d) return false;
    this.asked = performance.now();
    if (isHost) this.ask(me.id, d, me.id, [me, ...this.others]); else this.send("odq", d);
    return true;
  }

  /** Set yours down where you stand (X, or taking something else into your hands). */
  drop(me: Holder, isHost: boolean) {
    if (!this.carrying(me.id)) return;
    // in front of you, but never into a wall or the structure you're stood against
    const at = this.map.collide({ x: me.x + Math.sin(me.yaw) * -0.8, z: me.z + Math.cos(me.yaw) * -0.8 }, me.y, 0.3);
    const d = { op: "drop", x: at.x, y: me.y, z: at.z };
    SFX.oddment("drop");
    if (isHost) this.ask(me.id, d, me.id, [me, ...this.others]); else this.send("odq", d);
  }

  /** What to say in the middle of the screen, or "". */
  hint(me: Holder): string {
    if (!me.alive || !this.on) return "";
    if (this.carrying(me.id)) {
      if (this.atStructure(me) && this.s.f < this.total) return "<b>{use}</b> Set it in the structure";
      if (this.atFull(me)) {
        const c = this.cur();
        if (!c) return "This one's full, and so is every other";
        const dx = c.x - me.x, dz = c.z - me.z;
        const where = c.zone.home?.n ? `at ${c.zone.home.n} in ${c.zone.name}` : `in ${c.zone.name}`;
        return `This one's full. The next one wants it, ${esc(where)}, ${far(Math.hypot(dx, dz))} ${compassWord(dx, dz)}`;
      }
      return "";
    }
    return this.nearest(me) ? "<b>{use}</b> Pick it up" : "";
  }

  // ---- every frame ----

  private others: Holder[] = [];

  update(dt: number, t: number, me: Holder, others: Holder[], isHost: boolean, camera: THREE.Camera) {
    this.me = me; this.others = others;
    if (!this.on) return;
    if (isHost) this.host(dt, me, others);
    if (this.devAsk && (isHost || this.known)) { this.spawnNear(this.devAsk, isHost); this.devAsk = 0; }
    if (this.devZone && this.known) { this.openZone(this.devZone, isHost); this.devZone = 0; }
    for (const st of this.structs) {
      const near = Math.hypot(me.x - st.x, me.z - st.z) < SHOWN && this.zones.isOpen(st.zone.i);
      if (near && !st.built) this.build(st);
      if (st.built) st.built.root.visible = near;
    }
    for (const [i, g] of this.lying) {
      g.visible = Math.hypot(g.position.x - me.x, g.position.z - me.z) < 900;
      const core = g.getObjectByName("core");
      if (core) { core.rotation.y = t * 0.6 + i; core.position.y = Math.sin(t * 1.3 + i) * 0.08; }
    }
    for (const st of this.structs) for (const g of st.inSockets) { const core = g.getObjectByName("core"); if (core) core.rotation.y = t * 0.4; }
    this.hands(me, others, camera);
    for (let k = this.flying.length - 1; k >= 0; k--) {
      const f = this.flying[k];
      f.t += dt / 1.3;
      const e = Math.min(1, f.t), arc = Math.sin(e * Math.PI) * 2.5;
      f.g.position.lerpVectors(f.from, f.to, e * e * (3 - 2 * e)).y += arc;
      if (f.t >= 1) { this.group.remove(f.g); this.flying.splice(k, 1); this.paint(); }
    }
  }

  /** Host: anyone gone or downed drops theirs where they were; and the word goes round now and then. */
  private host(dt: number, me: Holder, others: Holder[]) {
    let changed = false;
    const all = [me, ...others];
    for (const o of this.s.o) {
      if (!o[4]) continue;
      const p = all.find((q) => q.id === o[4]);
      if (p) { o[1] = p.x; o[2] = p.y; o[3] = p.z; }
      if (!p || !p.alive) { o[4] = ""; if (p) o[2] = this.map.ground(o[1], o[3]); changed = true; }
    }
    this.sendT -= dt;
    if (!this.known || changed || this.sendT <= 0) this.publish(me.id);
  }

  /** The ones in people's hands: yours in front of you, low, everyone else's at their chest. */
  private hands(me: Holder, others: Holder[], camera: THREE.Camera) {
    const want = new Map<string, Holder>();
    for (const o of this.s.o) {
      if (!o[4]) continue;
      const p = o[4] === me.id ? me : others.find((q) => q.id === o[4]);
      if (p?.alive) want.set(p.id, p);
    }
    for (const [id, g] of this.carried) if (!want.has(id)) { this.group.remove(g); this.carried.delete(id); }
    for (const [id, p] of want) {
      let g = this.carried.get(id);
      if (!g) { g = oddment(false); this.carried.set(id, g); this.group.add(g); }
      if (id === me.id) {
        const v = new THREE.Vector3(0.32, -0.42, -0.75).applyQuaternion(camera.quaternion);
        g.position.copy(camera.position).add(v);
        g.scale.setScalar(0.7);
      } else {
        g.position.set(p.x - Math.sin(p.yaw) * 0.45, p.y + 1.1, p.z - Math.cos(p.yaw) * 0.45);
      }
    }
  }

  private build(st: Struct) {
    const b = structure(st.zone.sockets);
    b.root.position.set(st.x, st.y, st.z);
    // turned to face where everyone starts from, so the sockets face the way people come
    const sp = this.map.d.spawn?.[0];
    if (sp) b.root.rotation.y = Math.atan2(sp[0] - st.x, -sp[1] - st.z);
    b.root.updateMatrixWorld(true);
    this.group.add(b.root);
    st.built = b;
    this.paint();
  }

  /** Put the objects where the word says: on the ground, and in the sockets. */
  private paint() {
    const live = new Set<number>();
    for (const o of this.s.o) {
      if (o[4]) continue;
      live.add(o[0]);
      let g = this.lying.get(o[0]);
      if (!g) { g = oddment(true); this.lying.set(o[0], g); this.group.add(g); }
      g.position.set(o[1], o[2] + 0.45, o[3]);
    }
    for (const [i, g] of this.lying) if (!live.has(i)) { this.group.remove(g); this.lying.delete(i); }
    for (const st of this.structs) {
      const b = st.built;
      if (!b) continue;
      const n = st.zone.sockets, full = Math.max(0, Math.min(n, this.s.f - this.zones.need(st.zone.i)));
      const show = Math.max(0, full - this.flying.filter((f) => f.at === st).length);
      while (st.inSockets.length > show) this.group.remove(st.inSockets.pop()!);
      while (st.inSockets.length < show) {
        const g = oddment(false), at = b.sockets[st.inSockets.length].clone().applyMatrix4(b.root.matrixWorld);
        g.position.copy(at);
        this.group.add(g); st.inSockets.push(g);
      }
      // a frame with all its sockets full glows faintly
      b.frames.forEach((bars, k) => { for (const m of bars) m.material = show >= Math.min(n, (k + 1) * 4) ? STONE_LIT : STONE; });
    }
  }

  /** How many challenges are on this map at all (for the debug panel). */
  challenges() { return challengesOn(this.map).length; }

  dispose() {
    this.group.removeFromParent();
    this.solid(false);
  }
}
