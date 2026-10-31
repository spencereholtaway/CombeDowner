// Things to pick up. The middle of Firs Field is the special spot: each time it fills, it's either
// the sniper rifle or a bottle of Co-op Bucks Fizz. The pubs near somebody have a pint outside. Everything
// else (rounds for both guns, the odd pint, three more sniper rifles) turns up outside shops, pubs
// and on street corners near somebody, in Combe Down or out in Bath, somewhere new each time and
// never on top of anything else lying there; one
// left lying far from everyone is moved on to somewhere nearer. Naughty boys sometimes drop something when they go down, and
// a kick over the posts or a ball through the stumps leaves a prize by them (see sport.ts), which
// might be a bottle of Lucozade: double damage for a while. Rides (rides.ts) turn up about the
// streets too, a shopping trolley most often, and now and then a ladder (ladders.ts), which a ladder
// lad always leaves behind him when he goes down.
//
// Nothing but rides and ladders turns up within 200 m of a nursery or primary school (safezones.ts):
// no scattered markers, rounds or pints, no drops, and a prize won there is a ride. That keeps the
// Firs Field spot empty, as it's just inside Combe Down CofE Primary's.
//
// The host owns the list: it places everything, decides who gets each item (the first claim it
// hears, so two players can't both take one) and sends the list round. Everyone else draws it.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clearSpot, haunts, hauntsNear } from "./haunts";
import { GameMap } from "./map";
import { watch } from "./gore";
import { sniperModel } from "./weapon";
import { RIDES, rideModel, type RideKind } from "./rides";
import { ladderPickup } from "./ladders";
import { inSafeZone } from "./safezones";

export type Kind = "sniper" | "pint" | "fizz" | "ammo" | "sammo" | "boost" | RideKind | "ladder";
const KINDS: Kind[] = ["sniper", "pint", "fizz", "ammo", "sammo", "boost", ...RIDES, "ladder"];   // sent by index: add to the end
/** Is it a ride (rides.ts) rather than something to drink or shoot? */
export const isRide = (k: Kind): k is RideKind => (RIDES as string[]).includes(k);
/** Fine to leave by a school (safezones.ts): something to ride or climb, not to shoot or drink. */
const harmless = (k: Kind) => isRide(k) || k === "ladder";
const RIDE_BLIP = "#ff6fd8";
export const PINT_HEAL = 40;
export const AMMO_PICKUP = 30;      // rifle rounds in a tin: a magazine
export const SNIPER_PICKUP = 10;    // sniper rounds in a box: a magazine
const REACH = 1.3;
const DROP_LIFE = 45;               // seconds a naughty boy's drop lies about
const SEEN = 300;                   // metres off past which something lying is a pixel or two, and isn't drawn
const AROUND = 450;                 // the street spots this close to a player are where things turn up
const LEFT = 900;
const APART = 25;                   // metres between anything that turns up in the street and what's already lying there                   // one this far from everyone is moved on
const PUB_PINTS = 6;                // pubs with a pint outside, the ones nearest somebody
const DROPS: [Kind, number][] = [["pint", 0.3], ["ammo", 0.3], ["sammo", 0.08], ["fizz", 0.04]];   // chance of each
const BONUS_LIFE = 60;              // seconds a prize under the posts lies about
const BONUS: [Kind, number][] = [["boost", 0.35], ["fizz", 0.25], ["sniper", 0.2], ["sammo", 0.1], ["ammo", 0.1]];
const BONUS_GOOD: [Kind, number][] = [["boost", 0.5], ["sniper", 0.3], ["fizz", 0.2]];   // for a hard one
export const BOOST_SECONDS = 30;    // how long a bottle of Lucozade lasts
export const BLIP: Record<Kind, string> = {
  sniper: "#5fd0ff", pint: "#f2b134", fizz: "#ff8a2a", ammo: "#9fd36a", sammo: "#d9b23a", boost: "#ffe14a", ladder: "#e8eef4",
  ...Object.fromEntries(RIDES.map((r) => [r, RIDE_BLIP])) as Record<RideKind, string>,
};

export interface Item { id: number; kind: Kind; x: number; z: number; ttl: number; obj: THREE.Group }
interface Slot { kinds: Kind[]; at?: [number, number]; respawn: number; timer: number; pub?: boolean }   // pub: outside a pub near somebody

export class Pickups {
  readonly items = new Map<number, Item>();
  private slots: Slot[] = [];
  private spots: [number, number][] = [];   // where scattered items can turn up
  private group = new THREE.Group();
  private models: Record<Kind, THREE.Group>;
  private nextId = 1000 + Math.floor(Math.random() * 1e6);
  private t = 0;
  private recycleT = 0;

  constructor(private map: GameMap, scene: THREE.Scene) {
    scene.add(this.group);
    this.models = buildModels();
    // the sniper rifle is a paintball marker or the real one, and changes with the setting
    for (const m of [this.group, ...Object.values(this.models)]) watch(m);
    const D = map.d;
    const fixed = (kinds: Kind[], at: [number, number] | null, respawn: number) => { if (at) this.slots.push({ kinds, at, respawn, timer: 0 }); };
    const scattered = (kind: Kind, n: number, respawn: number) => { for (let i = 0; i < n; i++) this.slots.push({ kinds: [kind], respawn, timer: 0 }); };
    // the special spot: the middle of Firs Field
    if (D.spawn?.length) {
      const n = D.spawn.length;
      fixed(["sniper", "fizz"], clearSpot(map, D.spawn.reduce((s, p) => s + p[0], 0) / n, -D.spawn.reduce((s, p) => s + p[1], 0) / n), 60);
    }
    for (const h of haunts(map)) if (h.kind === "shop" || h.kind === "corner") this.spots.push([h.x, h.z]);
    // a pint outside the pubs nearest somebody, wherever they are
    for (let i = 0; i < PUB_PINTS; i++) this.slots.push({ kinds: ["pint"], respawn: 30, timer: 0, pub: true });
    if (this.spots.length || map.tileIndex) {
      scattered("ammo", 14, 25);
      scattered("sammo", 5, 40);
      scattered("pint", 4, 35);
      scattered("sniper", 3, 75);
      // something to ride: trolleys most of all
      scattered("trolley", 3, 60);
      for (const r of RIDES) if (r !== "trolley") scattered(r, 1, 90);
      // and a few ladders, for getting up on the roofs
      scattered("ladder", 3, 60);
    }
  }

  /** The things scattered about (not the fixed spots, nor drops and prizes). */
  private scattered(): Item[] {
    return this.slots.flatMap((s, id) => { const it = this.items.get(id); return !s.at && it ? [it] : []; });
  }

  /** A random shop front, pub or street corner near whichever player has least lying round them
   *  (any, if none's given), never on top of anything already lying about. pub: a pub. Null when
   *  every spot round them is taken (it tries again in a moment). */
  private randomSpot(players: { x: number; z: number }[], pub = false): [number, number] | null {
    const lying = this.scattered(), round = players.map((q) => lying.filter((it) => Math.hypot(it.x - q.x, it.z - q.z) < AROUND + 150).length + Math.random() * 0.5);
    const p = players[round.indexOf(Math.min(...round))];
    const near: [number, number][] = p ? hauntsNear(this.map, p.x, p.z, AROUND).filter((h) => pub ? h.kind === "pub" : h.kind !== "alley" && h.kind !== "bus").map((h) => [h.x, h.z]) : [];
    if (p && !near.length) return null;   // nowhere round them yet (their streets are still loading)
    const spots = p ? near : pub ? [] : this.spots;
    // a handful of shops and corners round someone used to mean several things on the very same spot
    const tries = Math.min(spots.length, 24);
    let best: [number, number] | null = null, bestScore = -1;
    for (let i = 0; i < tries; i++) {
      const s = spots.length <= 24 ? spots[i] : spots[Math.floor(Math.random() * spots.length)];
      let d = 150;
      for (const it of this.items.values()) d = Math.min(d, Math.hypot(it.x - s[0], it.z - s[1]));
      if (d < APART) continue;
      const score = d + Math.random() * 25;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  /** Somewhere for a drop or a prize near (x, z) that isn't on top of something already there. */
  private clear(x: number, z: number): [number, number] {
    const free = (px: number, pz: number) => { for (const it of this.items.values()) if (Math.hypot(it.x - px, it.z - pz) < 1.2) return false; return true; };
    if (free(x, z)) return [x, z];
    for (const r of [1.5, 3]) for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (free(px, pz) && !this.map.blocked(px, pz, 0.4) && !this.map.indoors(px, pz)) return [px, pz];
    }
    return [x, z];
  }

  private add(id: number, kind: Kind, x: number, z: number, ttl = 0) {
    this.remove(id);
    const obj = new THREE.Group();
    obj.add(this.models[kind].clone());
    obj.position.set(x, this.map.ground(x, z), z);
    this.group.add(obj);
    this.items.set(id, { id, kind, x, z, ttl, obj });
  }

  private remove(id: number): Item | undefined {
    const it = this.items.get(id);
    if (it) { this.group.remove(it.obj); this.items.delete(id); }
    return it;
  }

  /** Someone took it. A fixed or random item comes back after a while. */
  take(id: number): Item | undefined {
    const it = this.remove(id);
    if (this.slots[id]) this.slots[id].timer = this.slots[id].respawn;
    return it;
  }

  /** Host only: maybe leave something where a naughty boy went down. Returns true if it did. */
  drop(x: number, z: number): boolean {
    if (inSafeZone(this.map, x, z)) return false;
    let r = Math.random();
    for (const [kind, p] of DROPS) {
      if (r < p) { const [cx, cz] = this.clear(x, z); this.add(this.nextId++, kind, cx, cz, DROP_LIFE); return true; }
      r -= p;
    }
    return false;
  }

  /** Host only: one particular thing on the ground at (x, z), for life seconds (a free round at a liberated pub). */
  place(x: number, z: number, kind: Kind, life = BONUS_LIFE) {
    if (!harmless(kind) && inSafeZone(this.map, x, z)) return;
    const [cx, cz] = this.clear(x, z);
    this.add(this.nextId++, kind, cx, cz, life);
  }

  /** Host only: a prize for a kick over the posts or a ball through the stumps, on the ground at (x, z). good: for a hard one. Returns what it is. */
  bonus(x: number, z: number, good = false): Kind {
    const table = good ? BONUS_GOOD : BONUS;
    let r = Math.random(), kind: Kind = table[0][0];
    for (const [k, p] of table) { if (r < p) { kind = k; break; } r -= p; }
    if (!harmless(kind) && inSafeZone(this.map, x, z)) kind = RIDES[Math.floor(Math.random() * RIDES.length)];
    const [cx, cz] = this.clear(x, z);
    this.add(this.nextId++, kind, cx, cz, BONUS_LIFE);
    return kind;
  }

  /** Host only: bring items back (near the players) and clear away old drops. Returns true if the list changed. */
  host(dt: number, players: { x: number; z: number }[]): boolean {
    let changed = false;
    // anything scattered that's been left far from everyone goes, to turn up again nearer someone;
    // and someone with next to nothing round them gets a share of what's out of sight elsewhere
    if ((this.recycleT -= dt) <= 0 && players.length) {
      this.recycleT = 5;
      const lying = this.scattered(), away = (it: Item) => Math.min(...players.map((p) => Math.hypot(p.x - it.x, p.z - it.z)));
      const short = players.length > 1 && players.some((p) => lying.filter((it) => Math.hypot(it.x - p.x, it.z - p.z) < AROUND + 150).length < this.slots.filter((s) => !s.at).length / players.length / 2);
      const go = lying.filter((it) => away(it) > LEFT);
      if (short) go.push(...lying.filter((it) => away(it) > 150 && away(it) <= LEFT).sort((a, b) => away(b) - away(a)).slice(0, 3));
      for (const it of go) {
        this.remove(it.id);
        this.slots[it.id].timer = 1 + Math.random() * 4;
        changed = true;
      }
    }
    this.slots.forEach((s, id) => {
      if (this.items.has(id)) return;
      s.timer -= dt;
      if (s.timer > 0) return;
      const at = s.at ?? this.randomSpot(players, s.pub);
      if (!at) { s.timer = 3; return; }
      const [x, z] = at;
      if (!s.kinds.every(harmless) && inSafeZone(this.map, x, z)) { s.timer = s.respawn; return; }
      this.add(id, s.kinds[Math.floor(Math.random() * s.kinds.length)], x, z);
      changed = true;
    });
    for (const it of [...this.items.values()]) {
      if (it.ttl > 0 && (it.ttl -= dt) <= 0) { this.remove(it.id); changed = true; }
    }
    return changed;
  }

  /** The list as the host sends it: id, kind, x, z (decimetres), seconds left for drops. */
  snapshot(): number[][] {
    return [...this.items.values()].map((it) => [it.id, KINDS.indexOf(it.kind), Math.round(it.x * 10), Math.round(it.z * 10), Math.ceil(it.ttl)]);
  }

  /** Take on the host's list. */
  apply(d: number[][]) {
    if (!Array.isArray(d)) return;
    const seen = new Set<number>();
    for (const e of d) {
      if (!Array.isArray(e) || !KINDS[e[1]]) continue;
      const [id, k, x, z, ttl] = e, kind = KINDS[k], it = this.items.get(id);
      seen.add(id);
      if (it && it.kind === kind && Math.abs(it.x - x / 10) < 0.2 && Math.abs(it.z - z / 10) < 0.2) { it.ttl = ttl || 0; continue; }
      this.add(id, kind, x / 10, z / 10, ttl || 0);
    }
    for (const id of [...this.items.keys()]) if (!seen.has(id)) this.remove(id);
    // whatever's missing is already counting down somewhere, so don't bring it straight back if we become host
    this.slots.forEach((s, id) => { if (!seen.has(id) && s.timer <= 0) s.timer = s.respawn; });
  }

  /** Items within reach of feet at (x, y, z). */
  near(x: number, y: number, z: number): Item[] {
    const out: Item[] = [];
    for (const it of this.items.values()) {
      if (Math.hypot(it.x - x, it.z - z) < REACH && Math.abs(it.obj.position.y - y) < 2) out.push(it);
    }
    return out;
  }

  /** Spin and bob; from where the camera is, and how far it's zoomed in (binoculars), each one too
   *  small to make out is left undrawn: from up a hill there can be scores in view, each a draw or more. */
  update(dt: number, camera?: THREE.PerspectiveCamera) {
    this.t += dt;
    const seen = camera ? SEEN * Math.max(1, 72 / camera.fov) : Infinity;
    for (const it of this.items.values()) {
      if (camera) it.obj.visible = Math.hypot(it.x - camera.position.x, it.z - camera.position.z) < seen;
      if (!it.obj.visible) continue;
      const m = it.obj.children[0], spin = m.children[0];
      spin.rotation.y = this.t * 1.6 + it.id;
      spin.position.y = 0.55 + Math.sin(this.t * 2.4 + it.id) * 0.08;
      // a drop that's about to go blinks
      m.visible = !(it.ttl > 0 && it.ttl < 8 && Math.sin(this.t * 14) < 0);
    }
  }
}

// ---- models -------------------------------------------------------------------------------------
/** A model made of many small parts as one mesh for each look it has: a shopping trolley is dozens
 *  of wires, and each part drawn on its own cost the computer far more than the trolley's size
 *  deserves, with several dozen things lying about in town. It looks just the same. Parts tagged
 *  for paintball or real-gun mode (gore.ts look()) stay in a group of their own, so the switch
 *  still shows the right ones. */
function merged(item: THREE.Object3D): THREE.Object3D {
  item.updateMatrixWorld(true);
  const into = (group: THREE.Object3D, from: THREE.Object3D) => {
    const looks = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
    const walk = (o: THREE.Object3D) => {
      for (const c of o.children) {
        if (c.userData.look) {
          const sub = new THREE.Group();
          sub.userData.look = c.userData.look; sub.visible = c.visible;
          into(sub, c);
          group.add(sub);
          continue;
        }
        const m = c as THREE.Mesh;
        if (m.isMesh && !Array.isArray(m.material)) {
          const mt = m.material as THREE.MeshLambertMaterial;
          // parts that look the same share one mesh, even where each was given its own copy of the material
          const key = [mt.type, mt.color?.getHex(), mt.emissive?.getHex(), mt.map?.uuid, mt.transparent, mt.opacity, mt.side, mt.alphaTest, mt.vertexColors, c.visible].join("|");
          let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
          for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv" && !(name === "color" && mt.vertexColors)) g.deleteAttribute(name);
          if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
          g = g.applyMatrix4(m.matrixWorld);
          (looks.get(key) ?? looks.set(key, { mat: mt, geos: [] }).get(key)!).geos.push(g);
        } else if (!m.isMesh && c.children.length === 0 && !(c as THREE.Group).isGroup) {
          const k = c.clone(); c.matrixWorld.decompose(k.position, k.quaternion, k.scale); group.add(k);   // (anything else, kept as it is)
        }
        walk(c);
      }
    };
    walk(from);
    for (const [key, { mat, geos }] of looks) {
      const g = geos.length > 1 ? mergeGeometries(geos) : geos[0];
      // (parts that won't go together are kept apart)
      for (const one of g ? [g] : geos) {
        const mesh = new THREE.Mesh(one, mat);
        mesh.castShadow = true;
        mesh.visible = !key.endsWith("|false");
        group.add(mesh);
      }
    }
  };
  const out = new THREE.Group();
  into(out, item);
  return out;
}

function buildModels(): Record<Kind, THREE.Group> {
  const mat = (color: string, emissive = "#000000") => new THREE.MeshLambertMaterial({ color, emissive });
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; return o; };

  const make = (kind: Kind, item: THREE.Object3D, scale: number) => {
    const root = new THREE.Group(), spin = new THREE.Group();
    item.scale.setScalar(scale);
    spin.add(merged(item));
    // a glowing ring on the ground so it stands out
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.58, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: BLIP[kind], transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.position.y = 0.16;   // clear of kerbs and pavements
    root.add(spin, ring);
    return root;
  };

  // a pint of best: amber with a creamy head
  const pint = new THREE.Group();
  pint.add(mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.28, 16), mat("#b8731b", "#3a2206"), 0, 0, 0));
  pint.add(mesh(new THREE.CylinderGeometry(0.103, 0.1, 0.05, 16), mat("#f2e8cf", "#2a2620"), 0, 0.165, 0));

  // Co-op Bucks Fizz: orange in the bottle, gold foil, the Co-op blue label
  const fizz = new THREE.Group();
  const orange = mat("#f08a1c", "#3a1c02");
  fizz.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 16), orange, 0, 0, 0));
  fizz.add(mesh(new THREE.CylinderGeometry(0.022, 0.06, 0.07, 16), orange, 0, 0.155, 0));
  fizz.add(mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.1, 12), mat("#d9b23a", "#2a2008"), 0, 0.235, 0));
  const label = mesh(new THREE.CylinderGeometry(0.0615, 0.0615, 0.09, 24, 1, true), new THREE.MeshLambertMaterial({ map: coopLabel(), emissive: "#0a2a38" }), 0, -0.01, 0);
  fizz.add(label);

  // a green ammo tin with a yellow band
  const ammo = new THREE.Group();
  ammo.add(mesh(new THREE.BoxGeometry(0.42, 0.24, 0.22), mat("#4d5a33", "#141a0c")));
  ammo.add(mesh(new THREE.BoxGeometry(0.43, 0.04, 0.23), mat("#d9b23a", "#2a2008"), 0, 0.06, 0));
  ammo.add(mesh(new THREE.BoxGeometry(0.14, 0.03, 0.03), mat("#2a2c2e"), 0, 0.135, 0));

  // a box of sniper rounds with five brass cartridges standing on top
  const sammo = new THREE.Group();
  sammo.add(mesh(new THREE.BoxGeometry(0.26, 0.12, 0.16), mat("#2f3338", "#0c0e10")));
  const brass = mat("#c99a3a", "#2a1e08"), round = new THREE.CylinderGeometry(0.014, 0.014, 0.12, 8);
  for (let i = 0; i < 5; i++) sammo.add(mesh(round, brass, -0.09 + i * 0.045, 0.12, 0));

  // a bottle of Lucozade: fizzy orange in a ridged bottle with a sports cap
  const boost = new THREE.Group();
  const glass = mat("#ff9a1a", "#4a2004");
  boost.add(mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.22, 16), glass, 0, 0, 0));
  boost.add(mesh(new THREE.CylinderGeometry(0.03, 0.055, 0.06, 16), glass, 0, 0.14, 0));
  boost.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 12), mat("#1b1b1b"), 0, 0.19, 0));
  boost.add(mesh(new THREE.CylinderGeometry(0.0565, 0.0565, 0.1, 24, 1, true), new THREE.MeshLambertMaterial({ map: lucozadeLabel(), emissive: "#3a2400" }), 0, -0.01, 0));

  const sniper = sniperModel(false);
  sniper.rotation.z = 0.2;

  return {
    pint: make("pint", pint, 1.6),
    fizz: make("fizz", fizz, 1.7),
    ammo: make("ammo", ammo, 1.3),
    sammo: make("sammo", sammo, 1.5),
    sniper: make("sniper", sniper, 1.4),
    boost: make("boost", boost, 1.7),
    ladder: make("ladder", ladderPickup(), 1),
    ...Object.fromEntries(RIDES.map((r) => {
      const m = rideModel(r);
      m.position.y = -0.5;   // stood on the ground under the spin, rather than floating
      const holder = new THREE.Group();
      holder.add(m);
      return [r, make(r, holder, r === "trolley" ? 0.85 : 1)];
    })) as Record<RideKind, THREE.Group>,
  };
}

function coopLabel(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#00b1e7";
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = "#fff";
  g.font = "700 26px Arial, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("co-op", 64, 24);
  g.fillText("co-op", 192, 24);
  g.font = "700 14px Arial, sans-serif";
  g.fillText("BUCKS FIZZ", 64, 50);
  g.fillText("BUCKS FIZZ", 192, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function lucozadeLabel(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffd21a";
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = "#d4161c";
  g.font = "italic 900 24px Arial, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("LUCOZADE", 64, 28);
  g.fillText("LUCOZADE", 192, 28);
  g.fillStyle = "#1b1b1b";
  g.font = "700 12px Arial, sans-serif";
  g.fillText("ENERGY", 64, 50);
  g.fillText("ENERGY", 192, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
