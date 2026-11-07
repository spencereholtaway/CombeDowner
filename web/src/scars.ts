// Scars: losing leaves its mark on the town for the rest of the day, Dwarf Fortress style. A job
// lost (not one called off), or a pub the Flag Lads kept, leaves something behind where it happened:
// - a pub kept by the Flag Lads: a cocky "WE RUN THIS" banner hung high outside, signed by the Gaffer
//   (who has picked up a new trait for winning, in invasion.ts), with lads guarding it;
// - a race nobody finished: skid marks, and the winner's smug ghost idling on the line;
// - anything else (a Wanted man who got away): his tag sprayed on the pavement.
// Each one is a rematch of its own, suited to what was lost:
// - banner: shoot every cable tie holding it up (small targets, up near the top) and it comes down;
// - race: E on the line sets the smug ghost off along the streets through its gates; reach the last
//   gate before it does;
// - tag: hold fire (the touch fire button too) with the crosshair on the tag to spray over it, with
//   a can's hiss and rattle, until 90% of its lettering is covered. Spraying takes the place of
//   shooting while you aim at a tag.
// How it grows with the room (c: how many players there were when the scar was left, since a scar
// is left when a job ends and the crew is together; solo stays quick). More players mean more to
// do and more to find, not more health on anything, except that the guards get a little tougher:
// - banner: 3 + c cable ties (4 alone, 8 at most), guarded by 2 lads plus 1 for every 3 players,
//   each with 25% more health for every other player;
// - race: c gates (4 at most), 110 m apart along the streets; the ghost runs 5.2 m/s;
// - tag: 2.4 + 0.8 (c - 1) m wide (6.4 at most).
// Scars go on the maps as a grey "!", and they all go at midnight GMT, with the Flag Lads' season.
//
// Who decides what: the host. Everyone sees a job end the same way, but only the host writes it
// down as a scar and sends the day's list round as "scr" when it changes and to anyone who joins.
// Everyone keeps a copy of the room's list for the day on their own machine (per map, room and
// day, so it survives a reload), and a joiner sends theirs ("scr" with k "mine") for the host to
// merge in: scars are joined together by id, and one put right stays put right (the fixed ids
// travel with the list). Whoever finishes a rematch says so ("scr" with k "fix"); the host takes
// it off the list, drops the prize and tells everyone who did it, for the banner. Progress on the
// shared ones (cut ties, sprayed paint) goes round as "scr" with k "hit" so a team
// can split the work, and the host sends it to a joiner; the host also brings the banner's guards
// (naughtyboys.ts) once someone's near, and sends them home when it's put right. A page that
// doesn't know "scr", or "hit", just sees no scars, or no progress. The race against the ghost is
// yours alone: only the claim goes round.
// Each player's morning paper (paper.ts) notes the scars it hears of and the ones put right, and
// the big map rings the squares that have one (yours.ts).
import * as THREE from "three";
import * as SFX from "./audio";
import { clearSpot } from "./haunts";
import type { GameMap } from "./map";
import type { JobSpot } from "./minimap";
import { missionCall } from "./missionscreens";
import { bannerSpot } from "./bannerspot";
import { type NaughtyBoys, type Target, SOCIETY, look } from "./naughtyboys";
import { hash, rng } from "./quests";
import { gateModel, ghostModel } from "./race";
import { type RacePath, along, racePath } from "./raceroute";
import * as Paper from "./paper";
import { guide, named } from "./notice";

export type ScarKind = "pub" | "race" | "tag";
interface Scar { id: number; k: ScarKind; x: number; z: number; n: string; day: number; c: number }

export interface ScarWorld {
  readonly map: GameMap;
  readonly scene: THREE.Scene;
  readonly selfId: string;
  readonly isHost: boolean;
  /** Which room's scars these are: the map and room code, or "solo". */
  readonly slot: string;
  readonly naughtyBoys: NaughtyBoys;
  me(): { x: number; y: number; z: number; alive: boolean };
  /** How many are playing, for how big a rematch is. */
  crew(): number;
  /** Host: everyone, for the guards to look for. */
  targets(): Target[];
  send(data: unknown, to?: string): void;
  toast(text: string): void;
  feed(html: string): void;
  nameOf(id: string): string;
  /** Host: a prize on the ground. */
  prize(x: number, z: number, good: boolean): void;
  hear(x: number, y: number, z: number): [number, number];
}

const KEY = "cd-scars";           // plus the room and the day, so each room keeps its own and old days can go
const MAX = 12;               // scars kept at once; the oldest goes first
const SHOWN = 260;            // built this close, and taken down past SHOWN + 40
const REACH = 4;              // how close to press E at one
const COLOUR = "#9a3b3b";
const DAY = 24 * 3600 * 1000;
const today = () => Math.floor(Date.now() / DAY);

const GUARD_SEEN = 90;        // the banner's guards turn up when someone's this close
const GHOST_SPEED = 5.2;      // m/s: a good sprint on the flat beats it
const GATE_GAP = 110;         // metres between the ghost's gates
const SPRAY_RANGE = 16;
const GW = 48, GH = 24;       // the tag's cells, for covering
const COVER = 0.9;
const BRUSH = 0.3;            // metres: how wide the spray lands
const SPRAY_COLOUR = "#27d3ff";

const ties = (c: number) => Math.min(8, 3 + c);
const guardsFor = (c: number) => 2 + Math.floor(c / 3);
const guardHp = (c: number) => Math.round(50 * (1 + 0.25 * (c - 1)));
const gatesFor = (c: number) => Math.min(4, c);
const tagWidth = (c: number) => Math.min(6.4, 2.4 + 0.8 * (c - 1));

/** Targets to shoot: how many a scar needs. */
const needOf = (s: Scar) => (s.k === "pub" ? ties(s.c) : 0);
const bits = (m: number) => { let n = 0; for (; m; m &= m - 1) n++; return n; };

/** A job kind (quests.ts) as the kind of mark it leaves, or null for none (Seagull Attack's gulls
 *  just go). */
export function scarKindOf(job: string): ScarKind | null {
  return job === "gulls" ? null : job === "race" ? "race" : "tag";
}

const VERB: Record<ScarKind, [string, string]> = {
  pub: ["Cut down the Flag Lads' banner", "cut down the Flag Lads' banner"],
  race: ["Beat the smug ghost", "beat the smug ghost"],
  tag: ["Spray over the tag", "sprayed over the tag"],
};
const SAID: Record<ScarKind, (n: string) => string> = {
  pub: (n) => `The Flag Lads kept ${n.split("|")[0]}, and they've hung a banner up high to say so`,
  race: () => "The race's winner is idling on the line, looking smug",
  tag: (n) => `Lost "${n}", and there's a tag sprayed on the pavement to rub it in`,
};

function lambert(c: string) { return new THREE.MeshLambertMaterial({ color: c }); }

/** Words on a canvas, as a texture: lines drawn centred, in colour on a background (or none). */
function lettering(w: number, h: number, bg: string | null, lines: { t: string; font: string; c: string; y: number }[]) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const x = cv.getContext("2d")!;
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
  x.textAlign = "center"; x.textBaseline = "middle";
  for (const l of lines) { x.font = l.font; x.fillStyle = l.c; x.fillText(l.t, w / 2, l.y, w - 16); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Scattered bits on the ground in one draw: n boxes of size s within r of the middle. */
function scatter(r: () => number, n: number, rad: number, size: [number, number, number], colour: string, ground: (x: number, z: number) => number, ox: number, oz: number) {
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(...size), lambert(colour), n);
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad, x = Math.cos(a) * d, z = Math.sin(a) * d;
    p.set(x, ground(ox + x, oz + z) - ground(ox, oz) + size[1] / 2, z);
    m.setMatrixAt(k, mat.compose(p, q.setFromEuler(e.set(0, r() * Math.PI, 0)), one));
  }
  return m;
}

/** Something to shoot or knock off, in the scene's coordinates. */
interface Tgt { x: number; y: number; z: number; r: number }

/** The ghost's way: the streets from the line, as a path, and the gate on it. */
interface Route { path: RacePath; gates: { x: number; z: number; dx: number; dz: number; half: number }[]; at: number[]; goal: number }

/** How much of a tag is covered, kept for the day whether or not it's built. */
interface Paint { cov: Uint8Array; ink: Uint8Array | null; inkN: number; covN: number }

interface View {
  g: THREE.Group;
  ghost?: THREE.Object3D;
  tgts?: Tgt[];
  loc?: Float32Array;                       // targets' places in the group, to put right when one's gone
  tie?: THREE.InstancedMesh; banner?: THREE.Object3D;
  gate?: THREE.Group[]; gateT?: number;
  ov?: CanvasRenderingContext2D; ovTex?: THREE.CanvasTexture; ovDirty?: boolean; wide?: number;
  extra: THREE.Object3D[];
}

const M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), P3 = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1), ZERO = new THREE.Vector3(0, 0, 0);
const DIR = new THREE.Vector3();

export class Scars {
  private list: Scar[] = [];
  private views = new Map<number, View>();
  private near: Scar | null = null;
  private focus: Scar | null = null;          // the scar the hint's about
  private t = 0;
  private gone = new Set<number>();   // put right today: kept so a stale copy can't bring one back
  private prog = new Map<number, number>();   // which targets are done, a bit each
  private paint = new Map<number, Paint>();
  private routes = new Map<number, Route>();
  private guards = new Map<number, { i: number; gen: number }[]>();
  private guardT = 0;
  private run: { id: number; t: number; next: number } | null = null;
  private outbox: number[] = [];
  private outId = 0;
  private outT = 0;
  private lastHiss = -1;
  private lastSpray = -1;
  private hk = -1;
  private ht = "";

  constructor(private w: ScarWorld) {
    this.prune();
    try {
      const d = JSON.parse(localStorage.getItem(this.key()) ?? "null");
      if (d) this.merge(d.s, d.f);
    } catch { /* storage may be blocked */ }
  }

  private key() { return `${KEY}:${this.w.slot}:${today()}`; }

  private prune() {
    try {
      const now = String(today());
      for (const k of Object.keys(localStorage)) {
        if (k === KEY || (k.startsWith(KEY + ":") && !k.endsWith(":" + now))) localStorage.removeItem(k);
      }
    } catch { /* storage may be blocked */ }
  }

  /** Host: something lost here, of this kind; n names it (the pub, the place, the Gaffer). */
  add(k: ScarKind, x: number, z: number, n: string) {
    if (!this.w.isHost) return;
    const day = today(), id = hash("scar", k, Math.round(x), Math.round(z), day);
    if (this.list.some((s) => s.id === id)) return;
    this.list.push({ id, k, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, n, day, c: Math.max(1, Math.min(12, this.w.crew())) });
    Paper.scarSeen(id, x, z, SAID[k](n));
    while (this.list.length > MAX) this.drop(this.list[0].id);
    this.changed();
    this.say(this.list[this.list.length - 1]);
  }

  private say(s: Scar) { this.w.feed(`${named(SAID[s.k](s.n), COLOUR)}. Go and put it right (the grey ! on the map)`); }

  /** Someone joined: the host tells them the day's scars and how far they've got, and anyone else offers theirs to the host. */
  joined(id: string) {
    if (this.w.isHost) {
      this.w.send({ k: "all", l: this.packed(), f: [...this.gone] }, id);
      for (const [sid, m] of this.prog) if (m) this.w.send({ k: "hit", id: sid, m }, id);
    } else if (this.list.length || this.gone.size) this.w.send({ k: "mine", l: this.packed(), f: [...this.gone] }, id);
  }

  onMessage(d: any, from: string) {
    if (!d || typeof d !== "object") return;
    if (d.k === "all" && Array.isArray(d.l)) {
      if (this.w.isHost && from !== this.w.selfId) return;
      const had = new Set(this.list.map((s) => s.id));
      this.merge(d.l, d.f);
      this.save();
      for (const s of this.list.filter((o) => !had.has(o.id)).slice(-3)) this.say(s);
      for (const s of this.list) Paper.scarSeen(s.id, s.x, s.z, SAID[s.k](s.n));
      return;
    }
    if (d.k === "mine" && Array.isArray(d.l)) {
      if (this.w.isHost && this.merge(d.l, d.f)) { this.changed(); for (const s of this.list) Paper.scarSeen(s.id, s.x, s.z, SAID[s.k](s.n)); }
      return;
    }
    if (d.k === "hit" && from !== this.w.selfId) { this.heard(d); return; }
    if (d.k === "fix" && this.w.isHost) {
      const s = this.list.find((o) => o.id === Number(d.id));
      if (!s) return;
      Paper.scarFixed(s.id, s.x, s.z, SAID[s.k](s.n), from === this.w.selfId ? "you" : this.w.nameOf(from));
      for (const g of this.guards.get(s.id) ?? []) this.w.naughtyBoys.rout(g.i, g.gen, s);
      this.drop(s.id);
      this.w.prize(s.x, s.z, true);
      this.changed();
      const msg = { k: "fixed", id: s.id, sk: s.k, by: from };
      this.w.send(msg);
      this.onMessage(msg, this.w.selfId);
      return;
    }
    if (d.k === "fixed") {
      const k = (d.sk in VERB ? d.sk : "tag") as ScarKind, by = String(d.by ?? "");
      const was = this.list.find((o) => o.id === Number(d.id));
      if (was && !this.w.isHost) Paper.scarFixed(was.id, was.x, was.z, SAID[k](was.n), by === this.w.selfId ? "you" : this.w.nameOf(by));
      if (!this.w.isHost) this.drop(Number(d.id));
      this.gone.add(Number(d.id));
      this.save();
      missionCall({ text: "Put right!", sub: `${by === this.w.selfId ? "You" : this.w.nameOf(by)} ${VERB[k][1]}`, went: "well" });
      if (by === this.w.selfId) SFX.solved();
    }
  }

  /** Someone else's progress: a tie cut (i, or m for a whole mask), or cells of paint (c). */
  private heard(d: any) {
    const id = Number(d.id), s = this.list.find((o) => o.id === id);
    if (!s) return;
    if (typeof d.m === "number") { for (let i = 0; i < 31; i++) if (d.m & (1 << i)) this.cut(s, i, false); }
    else if (typeof d.i === "number" && d.i >= 0 && d.i < 31) this.cut(s, d.i | 0, false);
    if (Array.isArray(d.c)) this.painted(s, d.c.slice(0, 400));
  }

  private claim(id: number) {
    this.w.send({ k: "fix", id });
    if (this.w.isHost) this.onMessage({ k: "fix", id }, this.w.selfId);
  }

  private packed() { return this.list.map((s) => [s.id, s.k, s.x, s.z, s.n, s.day, s.c]); }

  /** Join another copy of the day's list to ours; says whether ours changed. */
  private merge(l: any, f: any) {
    const day = today(), before = this.list.length + this.gone.size;
    for (const id of Array.isArray(f) ? f : []) this.gone.add(Number(id));
    const have = new Set(this.list.map((s) => s.id));
    for (const r of Array.isArray(l) ? l : []) {
      if (!Array.isArray(r) || Number(r[5]) !== day || !(String(r[1]) in VERB) || have.has(Number(r[0]))) continue;
      this.list.push({ id: Number(r[0]), k: String(r[1]) as ScarKind, x: Number(r[2]) || 0, z: Number(r[3]) || 0, n: String(r[4] ?? "").slice(0, 90), day, c: Math.max(1, Math.min(12, Number(r[6]) || 1)) });
    }
    for (const s of this.list.filter((o) => this.gone.has(o.id))) this.drop(s.id);
    while (this.list.length > MAX) this.drop(this.list[0].id);
    return this.list.length + this.gone.size !== before || this.list.some((s) => !have.has(s.id));
  }
  private save() {
    try { localStorage.setItem(this.key(), JSON.stringify({ s: this.packed(), f: [...this.gone] })); } catch { /* storage may be blocked */ }
  }
  private changed() { this.save(); this.w.send({ k: "all", l: this.packed(), f: [...this.gone] }); }
  private drop(id: number) {
    this.list = this.list.filter((s) => s.id !== id);
    this.unbuild(id);
    this.prog.delete(id); this.paint.delete(id); this.routes.delete(id);
    const gd = this.guards.get(id);
    if (gd) { for (const g of gd) this.w.naughtyBoys.release(g.i, g.gen); this.guards.delete(id); }
    if (this.run?.id === id) this.run = null;
  }

  /** Today's scars, in words, for the big map and the morning paper (yours.ts, paper.ts). */
  marks() { return this.list.map((s) => ({ x: s.x, z: s.z, what: SAID[s.k](s.n) })); }

  /** The maps' grey "!" for each. */
  spots(): JobSpot[] { return this.list.map((s) => ({ x: s.x, z: s.z, colour: COLOUR, glyph: "!", label: VERB[s.k][0] })); }

  // ---- targets: cable ties ----------------------------------------------------------

  /** A shot that hits a cable tie: the nearest within maxDist, along d from o. */
  hit(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): { id: number; i: number; dist: number } | null {
    let best: { id: number; i: number; dist: number } | null = null;
    for (const [id, v] of this.views) {
      const T = v.tgts;
      if (!T) continue;
      const m = this.prog.get(id) ?? 0;
      for (let i = 0; i < T.length; i++) {
        if (m & (1 << i)) continue;
        const ex = T[i].x - o.x, ey = T[i].y - o.y, ez = T[i].z - o.z, t = ex * d.x + ey * d.y + ez * d.z;
        if (t <= 0 || t > maxDist || (best && t > best.dist)) continue;
        if (Math.hypot(ex - d.x * t, ey - d.y * t, ez - d.z * t) < T[i].r) best = { id, i, dist: t };
      }
    }
    return best;
  }

  shoot(h: { id: number; i: number }) {
    const s = this.list.find((o) => o.id === h.id);
    if (s) this.cut(s, h.i, true);
  }

  /** Target i is done: for everyone, if mine, and the one who does the last claims the scar. */
  private cut(s: Scar, i: number, mine: boolean) {
    const m = this.prog.get(s.id) ?? 0;
    if (m & (1 << i) || i >= needOf(s)) return;
    const now = m | (1 << i);
    this.prog.set(s.id, now);
    const v = this.views.get(s.id);
    if (v) this.refresh(s, v, now);
    if (!mine) return;
    this.w.send({ k: "hit", id: s.id, i });
    SFX.clunk(0, 0);
    if (bits(now) >= needOf(s)) this.claim(s.id);
  }

  /** Cut ties go from view. */
  private refresh(s: Scar, v: View, m: number) {
    if (s.k === "pub" && v.tie && v.loc) {
      for (let i = 0; i < v.tie.count; i++) {
        P3.set(v.loc[i * 3], v.loc[i * 3 + 1], v.loc[i * 3 + 2]);
        v.tie.setMatrixAt(i, M4.compose(P3, Q4.identity(), m & (1 << i) ? ZERO : ONE));
      }
      v.tie.instanceMatrix.needsUpdate = true;
      if (v.banner) v.banner.rotation.z = Math.min(0.5, bits(m) * 0.09);
    }
  }

  // ---- the tag: paint ---------------------------------------------------------------------------

  private paintOf(id: number): Paint {
    let p = this.paint.get(id);
    if (!p) this.paint.set(id, (p = { cov: new Uint8Array(GW * GH), ink: null, inkN: 0, covN: 0 }));
    return p;
  }

  /** Cells of paint from someone else. */
  private painted(s: Scar, cells: number[]) {
    if (s.k !== "tag") return;
    const p = this.paintOf(s.id), v = this.views.get(s.id);
    for (const c of cells) {
      const i = Number(c);
      if (!(i >= 0 && i < GW * GH) || p.cov[i]) continue;
      p.cov[i] = 1;
      if (p.ink?.[i]) p.covN++;
      if (v) this.dab(v, i);
    }
  }

  /** One cell painted on the tag's overlay. */
  private dab(v: View, i: number) {
    if (!v.ov || !v.wide) return;
    const cw = 256 / GW, ch = 128 / GH;
    v.ov.fillStyle = SPRAY_COLOUR;
    v.ov.fillRect((i % GW) * cw - 0.5, Math.floor(i / GW) * ch - 0.5, cw + 1, ch + 1);
    v.ovDirty = true;
  }

  /**
   * Fire held (or tapped) with the crosshair on a tag: sprays it, instead of shooting. True if it did,
   * so the shot isn't fired.
   */
  spray(cam: THREE.Camera): boolean {
    const me = this.w.me();
    if (!me.alive) return false;
    DIR.set(0, 0, -1).applyQuaternion(cam.quaternion);
    if (DIR.y > -0.02) return false;
    for (const s of this.list) {
      if (s.k !== "tag") continue;
      const v = this.views.get(s.id), p = this.paint.get(s.id);
      if (!v || !v.ov || !v.wide || !p?.ink) continue;
      const t = (v.g.position.y + 0.05 - cam.position.y) / DIR.y;
      if (t < 0.4 || t > SPRAY_RANGE) continue;
      const dx = cam.position.x + DIR.x * t - s.x, dz = cam.position.z + DIR.z * t - s.z, a = v.g.rotation.y, c = Math.cos(a), sn = Math.sin(a);
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c, W = v.wide;
      if (Math.abs(lx) > W / 2 + 1.2 || Math.abs(lz) > W / 4 + 1.2) continue;
      this.stamp(s, v, p, lx, lz, W);
      if (this.t - this.lastHiss > 0.1) { SFX.spray(this.t - this.lastSpray > 0.3); this.lastHiss = this.t; }
      this.lastSpray = this.t;
      return true;
    }
    return false;
  }

  private stamp(s: Scar, v: View, p: Paint, lx: number, lz: number, W: number) {
    const cx = (lx / W + 0.5) * GW, cy = (0.5 + lz / (W / 2)) * GH, br = BRUSH / (W / GW);
    for (let y = Math.max(0, Math.floor(cy - br)); y <= Math.min(GH - 1, Math.ceil(cy + br)); y++) {
      for (let x = Math.max(0, Math.floor(cx - br)); x <= Math.min(GW - 1, Math.ceil(cx + br)); x++) {
        const i = y * GW + x;
        if (p.cov[i] || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > br) continue;
        p.cov[i] = 1;
        if (p.ink![i]) { p.covN++; this.outbox.push(i); this.outId = s.id; }
      }
    }
    v.ov!.fillStyle = SPRAY_COLOUR;
    v.ov!.beginPath();
    v.ov!.arc((cx / GW) * 256, (cy / GH) * 128, (BRUSH / W) * 256, 0, Math.PI * 2);
    v.ov!.fill();
    v.ovDirty = true;
    if (p.covN >= p.inkN * COVER) { this.outbox.length = 0; this.claim(s.id); }
  }

  // ---- the ghost ----------------------------------------------------------------------------------

  private routeOf(s: Scar): Route {
    let rt = this.routes.get(s.id);
    if (rt) return rt;
    const n = gatesFor(s.c), r = rng(hash("ghost", s.id)), a0 = r() * Math.PI * 2;
    let path: RacePath | null = null;
    for (let k = 0; k < 8 && !path; k++) {
      const a = a0 + (k * Math.PI) / 4, L = GATE_GAP * n + 30;
      const p = racePath(this.w.map, s.x, s.z, s.x + Math.sin(a) * L, s.z - Math.cos(a) * L);
      if (p && p.len >= 40 * n) path = p;
    }
    if (!path) {
      const L = GATE_GAP * n;
      path = { pts: [s.x, s.z, s.x + Math.sin(a0) * L, s.z - Math.cos(a0) * L], half: [3, 3], cum: [0, L], len: L };
    }
    // the ghost starts on the line, which may be off the street the way begins on
    const lead = Math.hypot(path.pts[0] - s.x, path.pts[1] - s.z);
    if (lead > 3) {
      const cum = [0, ...path.cum.map((c) => c + lead)];
      path = { pts: [s.x, s.z, ...path.pts], half: [path.half[0], ...path.half], cum, len: path.len + lead };
    }
    const total = Math.min(path.len, GATE_GAP * n);
    const at: number[] = [], gates = [];
    for (let k = 0; k < n; k++) { at.push((total * (k + 1)) / n); gates.push(along(path, at[k])); }
    this.routes.set(s.id, (rt = { path, gates, at, goal: at[n - 1] }));
    return rt;
  }

  /** Where the ghost is s metres along the way, into out (x, z, heading). */
  private ghostAt(rt: Route, d: number, out: { x: number; z: number; yaw: number }) {
    const p = rt.path, n = p.cum.length;
    let k = 0;
    while (k < n - 2 && p.cum[k + 1] < d) k++;
    const l = Math.max(0.01, p.cum[k + 1] - p.cum[k]), u = Math.max(0, Math.min(l, d - p.cum[k])) / l;
    const ax = p.pts[k * 2], az = p.pts[k * 2 + 1], bx = p.pts[k * 2 + 2], bz = p.pts[k * 2 + 3];
    out.x = ax + (bx - ax) * u; out.z = az + (bz - az) * u; out.yaw = Math.atan2(bx - ax, bz - az);
  }
  private gp = { x: 0, z: 0, yaw: 0 };

  // ---- each frame ---------------------------------------------------------------------------------

  update(dt: number) {
    this.t += dt;
    if (this.list.length && this.list[0].day !== today()) {
      for (const s of [...this.list]) this.drop(s.id);
      this.gone.clear(); this.prune(); this.save();
    }
    const me = this.w.me();
    this.near = null; this.focus = null;
    let best = 1e9, bestF = 1e9;
    for (const s of this.list) {
      const d = Math.hypot(s.x - me.x, s.z - me.z), v = this.views.get(s.id);
      if (!v && d < SHOWN && this.w.map.detailedAt(s.x, s.z)) this.build(s);
      else if (v && d > SHOWN + 40) this.unbuild(s.id);
      const view = this.views.get(s.id);
      if (view) this.animate(s, view, dt);
      if (!me.alive) continue;
      const seen = s.k === "pub" ? 45 : s.k === "race" ? 8 : 16;
      const reach = s.k === "race" ? REACH + 1 : REACH;
      if (d < reach && d < best) { best = d; this.near = s; }
      if (d < seen && d < bestF) { bestF = d; this.focus = s; }
    }
    if (this.near && !this.focus) this.focus = this.near;
    if (this.run) this.racing(dt, me);
    if ((this.outT -= dt) <= 0) {
      this.outT = 0.4;
      if (this.outbox.length) { this.w.send({ k: "hit", id: this.outId, c: this.outbox }); this.outbox.length = 0; }
    }
    if (this.w.isHost && (this.guardT -= dt) <= 0) { this.guardT = 1.5; this.guard(); }
    for (const v of this.views.values()) if (v.ovDirty && v.ovTex) { v.ovTex.needsUpdate = true; v.ovDirty = false; }
  }

  /** Host: the banner's guards turn up once someone's near, and stay till it's put right. */
  private guard() {
    const todo = this.list.filter((s) => s.k === "pub" && !this.guards.has(s.id));
    if (!todo.length) return;
    const ts = this.w.targets();
    for (const s of todo) {
      if (!ts.some((t) => t.alive && Math.hypot(t.x - s.x, t.z - s.z) < GUARD_SEEN)) continue;
      const at = clearSpot(this.w.map, s.x, s.z, 8) ?? [s.x, s.z];
      this.guards.set(s.id, this.w.naughtyBoys.bring(at[0], at[1], look(SOCIETY, Math.floor(Math.random() * 4)), guardsFor(s.c), ts, guardHp(s.c), 4));
    }
  }

  /** The run for the last gate. */
  private racing(dt: number, me: { x: number; y: number; z: number; alive: boolean }) {
    const run = this.run!, s = this.list.find((o) => o.id === run.id);
    if (!s || !me.alive) { this.run = null; return; }
    const rt = this.routeOf(s), v = this.views.get(s.id);
    run.t += dt;
    const ghostD = Math.min(rt.goal, run.t * GHOST_SPEED);
    if (v?.ghost) {
      this.ghostAt(rt, ghostD, this.gp);
      v.ghost.position.set(this.gp.x - s.x, this.w.map.ground(this.gp.x, this.gp.z) - v.g.position.y, this.gp.z - s.z);
      v.ghost.rotation.y = this.gp.yaw;
    }
    const g = rt.gates[run.next];
    if (Math.hypot(g.x - me.x, g.z - me.z) < Math.max(4.5, g.half + 1.5) && Math.abs(this.w.map.ground(g.x, g.z) - me.y) < 8) {
      run.next++;
      SFX.counterTick();
      if (run.next >= rt.gates.length) { const id = s.id; this.run = null; this.w.toast("You beat the ghost!"); this.claim(id); return; }
    }
    if (ghostD >= rt.goal) {
      this.run = null;
      guide("The ghost got there first. Back to the line and press {use} to go again");
      if (v?.ghost) v.ghost.position.set(0, 0, 0);
    }
  }

  /** What the hint says: cached, so a frame builds no string unless the words changed. */
  hint(): string {
    const s = this.focus;
    if (!s) return "";
    const m = this.prog.get(s.id) ?? 0;
    let key = 0;
    if (s.k === "pub") {
      key = 1 + bits(m);
      if (this.hk !== key * 1000 + s.id % 1000) { this.hk = key * 1000 + s.id % 1000; this.ht = `Shoot the cable ties holding the banner up: ${bits(m)} of ${ties(s.c)} cut`; }
    } else if (s.k === "race") {
      if (this.run) {
        const rt = this.routeOf(s), ahead = Math.round(rt.goal / GHOST_SPEED - this.run.t);
        key = 600 + this.run.next * 100 + Math.max(0, ahead);
        if (this.hk !== key * 1000 + s.id % 1000) { this.hk = key * 1000 + s.id % 1000; this.ht = `Gate ${this.run.next + 1} of ${rt.gates.length}: the ghost gets to the end in ${Math.max(0, ahead)}s`; }
      } else {
        key = 590;
        if (this.hk !== key * 1000 + s.id % 1000) { this.hk = key * 1000 + s.id % 1000; this.ht = this.near === s ? `<b>{use}</b> Race the smug ghost through ${gatesFor(s.c)} gate${gatesFor(s.c) > 1 ? "s" : ""}` : "Beat the smug ghost: back to the line"; }
      }
    } else {
      const p = this.paint.get(s.id), pct = p?.inkN ? Math.min(100, Math.round((p.covN / (p.inkN * COVER)) * 100)) : 0;
      key = 700 + pct;
      if (this.hk !== key * 1000 + s.id % 1000) { this.hk = key * 1000 + s.id % 1000; this.ht = `Hold fire to spray over the tag: ${pct}%`; }
    }
    return this.ht;
  }

  /** E pressed: set the ghost off. */
  use(): boolean {
    const s = this.near;
    if (!s) return false;
    if (s.k === "race" && !this.run) {
      this.run = { id: s.id, t: 0, next: 0 };
      SFX.counterTick();
      this.w.toast(`Go! Get to the last gate before the ghost: ${gatesFor(s.c)} gate${gatesFor(s.c) > 1 ? "s" : ""}`);
      return true;
    }
    return false;
  }

  private animate(s: Scar, v: View, dt: number) {
    if (v.ghost && !(this.run?.id === s.id)) { v.ghost.position.y = 0.05 + Math.sin(this.t * 3) * 0.05; v.ghost.rotation.y = Math.sin(this.t * 0.7) * 0.4; }
    if (s.k === "race" && v.gate && (v.gateT = (v.gateT ?? 0) - dt) <= 0) {
      v.gateT = 0.5;
      const rt = this.routeOf(s);
      v.gate.forEach((g, k) => { g.position.y = this.w.map.ground(rt.gates[k].x, rt.gates[k].z); g.visible = !this.run || k >= this.run.next; });
    }
  }

  // ---- building -----------------------------------------------------------------------------------

  private build(s: Scar) {
    const map = this.w.map, y0 = map.ground(s.x, s.z), g = new THREE.Group(), r = rng(s.id);
    const ground = (x: number, z: number) => map.ground(x, z);
    const ban = s.k === "pub" ? bannerSpot(map, s.x, s.z) : null;
    g.position.set(ban ? ban.x : s.x, ban ? map.ground(ban.x, ban.z) : y0, ban ? ban.z : s.z);
    // things scattered on the ground are laid on it where they fall, so only the rest is turned about
    if (s.k !== "race") g.rotation.y = r() * Math.PI * 2;
    if (ban) g.rotation.y = ban.yaw;
    const v: View = { g, extra: [] };
    const cs = Math.cos(g.rotation.y), sn = Math.sin(g.rotation.y);
    if (s.k === "pub") {
      const n = ties(s.c), W = 3.6, H = 1.1, cy = ban!.cy, bx = ban!.x, bz = ban!.z, by = g.position.y;
      for (const x of [-W / 2 - 0.2, W / 2 + 0.2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, cy + 1.2, 6), lambert("#777")); p.position.set(x, (cy + 1.2) / 2, 0); g.add(p); }
      const tex = lettering(512, 160, "#f4f4f4", [
        { t: "WE RUN THIS", font: "900 84px Impact, 'Barlow Condensed', sans-serif", c: "#c8102e", y: 66 },
        { t: `— ${s.n.split("|")[1] || "the Flag Lads"}`, font: "italic 600 34px Georgia, serif", c: "#222", y: 134 },
      ]);
      const hang = new THREE.Group();
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
      hang.add(banner);
      hang.position.set(0, cy, 0);
      g.add(hang);
      v.banner = hang;
      const FR = [0.5, 0.5, 0.25, 0.25, 0.75, 0.75];
      v.loc = new Float32Array(n * 3);
      v.tgts = [];
      for (let i = 0; i < n; i++) {
        const lx = i < 4 ? (i % 2 ? W / 2 : -W / 2) : -W / 2 + W * FR[i - 4], ly = cy + (i < 4 ? (i < 2 ? H / 2 : -H / 2) : i % 2 ? H / 2 : -H / 2);
        v.loc.set([lx, ly, 0.05], i * 3);
        v.tgts.push({ x: bx + lx * cs, y: by + ly, z: bz - lx * sn, r: 0.3 });
      }
      v.tie = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffd23a" }), n);
      g.add(v.tie);
      this.refresh(s, v, this.prog.get(s.id) ?? 0);
    } else if (s.k === "race") {
      g.add(scatter(r, 10, 6, [0.22, 0.01, 2.6], "#1a1a1a", ground, s.x, s.z));
      const ghostG = new THREE.Group();
      const body = ghostModel("bike", "#bfe8ff");
      const smug = new THREE.Sprite(new THREE.SpriteMaterial({ map: lettering(256, 64, null, [{ t: "too easy", font: "italic 700 40px Georgia, serif", c: "#ffffff", y: 32 }]), transparent: true, depthWrite: false }));
      smug.scale.set(1.2, 0.3, 1); smug.position.y = 2.35;
      ghostG.add(body, smug);
      g.add(ghostG);
      v.ghost = ghostG;
      const rt = this.routeOf(s);
      v.gate = rt.gates.map((p, k) => {
        const gm = gateModel(p, k === rt.gates.length - 1 ? "" : `GATE ${k + 1}`);
        gm.position.set(p.x, map.ground(p.x, p.z), p.z);
        this.w.scene.add(gm);
        v.extra.push(gm);
        return gm;
      });
    } else {
      const W = tagWidth(s.c), tex = lettering(256, 128, null, [
        { t: "GOT AWAY", font: "900 52px Impact, sans-serif", c: "#ff4fa3", y: 50 },
        { t: "ha ha", font: "italic 700 34px Georgia, serif", c: "#36d1ff", y: 100 },
      ]);
      const p = this.paintOf(s.id);
      if (!p.ink) {
        const px = (tex.image as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 256, 128).data;
        p.ink = new Uint8Array(GW * GH);
        p.inkN = 0; p.covN = 0;
        for (let i = 0; i < GW * GH; i++) {
          const x = Math.floor(((i % GW) + 0.5) * (256 / GW)), y = Math.floor((Math.floor(i / GW) + 0.5) * (128 / GH));
          if (px[(y * 256 + x) * 4 + 3] > 40) { p.ink[i] = 1; p.inkN++; if (p.cov[i]) p.covN++; }
        }
      }
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(W, W / 2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: tex }));
      tag.rotation.x = -Math.PI / 2; tag.position.y = 0.05;
      const cv = document.createElement("canvas");
      cv.width = 256; cv.height = 128;
      v.ov = cv.getContext("2d")!;
      v.ovTex = new THREE.CanvasTexture(cv);
      v.ovTex.colorSpace = THREE.SRGBColorSpace;
      v.wide = W;
      const paint = new THREE.Mesh(new THREE.PlaneGeometry(W, W / 2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: v.ovTex, polygonOffset: true, polygonOffsetFactor: -2 }));
      paint.rotation.x = -Math.PI / 2; paint.position.y = 0.06;
      g.add(tag, paint);
      for (let i = 0; i < GW * GH; i++) if (p.cov[i]) this.dab(v, i);
    }
    this.w.scene.add(g);
    this.views.set(s.id, v);
  }

  private unbuild(id: number) {
    const v = this.views.get(id);
    if (!v) return;
    for (const root of [v.g, ...v.extra]) {
      root.parent?.remove(root);
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
          const m = o.material as THREE.MeshBasicMaterial;
          m.map?.dispose(); m.dispose();
        }
      });
    }
    this.views.delete(id);
  }

  dispose() {
    for (const id of [...this.views.keys()]) this.unbuild(id);
    for (const gd of this.guards.values()) for (const g of gd) this.w.naughtyBoys.release(g.i, g.gen);
    this.guards.clear();
    this.run = null;
  }
}
