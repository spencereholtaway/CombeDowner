// Jobs: things to do round Bath, a fresh set every game day (every 24 minutes). Each one is put up
// on a noticeboard somewhere real (outside a pub, in a park or a square), with a ring of light at
// its foot and a badge in the job's colour on the maps. Walk up to one to read it, and press E to
// take it on: a Wanted poster, a treasure trail, a race and so on (each in its own file, which
// registers itself here with registerJob).
//
// Who decides what: nobody, mostly. Where today's jobs are and what each one asks comes from the
// day's number (daylight.ts) and the map, so everyone everywhere sees the same noticeboards
// without anything going over the network. Taking a job takes it on for the whole room, as a
// team: whoever takes it sends the job's poster round, and everyone builds the same job from its
// seed. One job runs at a time; if two people take different jobs at once, the first one taken
// wins. Taking a job, its steps (a clue found, someone over the line) and calling it off (from the
// pause menu) all go round as "qe". The host tells anyone who joins what job is on and how far
// it's got. Anything a job needs run for it (a Wanted man and his crew) the host runs, through
// the usual systems (naughtyboys.ts), and prizes are dropped by the host like any other pickup.
//
// A job that can be done again (a race) can also be run again just for yourself: Backspace (Again
// on a touch screen) puts you back on its start line for a time trial of your own, which only you
// see (nothing is sent when it starts, and a job anyone takes for the room takes over from it).
// A job lost leaves a scar on the town for the rest of the day (scars.ts); one called off doesn't,
// so stopping or swapping jobs costs nothing.
// A Gaffer who got away from a pub takeover (invasion.ts, gaffer.ts) is the next game day's Wanted
// poster: the host keeps the list and every player puts up the same poster from it.
// A job well done can lead on to another (nightout.ts): the host sends a link (a kind, a seed and a
// place), every player builds the same poster from it, and it stands on the spot for a minute or
// so. Any job taken by hand, or the follow-up itself, takes those posters down again.
//
// There's free play too, always on and nothing to take (stunts.ts): each player's own, and kept
// on their own machine.
import * as THREE from "three";
import * as SFX from "./audio";
import { dayNumber } from "./daylight";
import { clearSpot } from "./haunts";
import type { GameMap } from "./map";
import { jobIcon, type Circle, type JobSpot, type RouteLine } from "./minimap";
import type { NaughtyBoys } from "./naughtyboys";
import type { RideKind } from "./rides";
import { earn } from "./wardrobe";
import { type Grade, bestFor, jobWon, missionResult } from "./trophies";
import { show } from "./show";
import { missionClear, missionEnd, missionProgress, missionStage, missionStart } from "./missionscreens";
import type { Follow } from "./weapon";
import * as Telemetry from "./telemetry";
import * as Paper from "./paper";

// ---- seeded randomness: everyone gets the same numbers from the same seed ---------------------

export type Rng = () => number;
/** A run of numbers from 0 to 1, the same every time for the same seed. */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A seed from some words and numbers. */
export function hash(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join("|")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const pickOf = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];
export function shuffled<T>(r: Rng, a: readonly T[]): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** "450 m", "1.2 km". */
export function far(d: number) {
  return d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`;
}
/** Which way, in words: "north-east". (dx, dz) in scene coordinates. */
export function compassWord(dx: number, dz: number) {
  const a = (Math.atan2(dx, -dz) * 180) / Math.PI;
  return ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(((a + 360) % 360) / 45) % 8];
}
/** "★★☆" for 2 stars out of 3. */
export const starText = (n: number) => "★".repeat(n) + "☆".repeat(Math.max(0, 3 - n));
export function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// ---- what a job is ------------------------------------------------------------------------------

/** What the game lends a job: the map, the players, the network, the HUD and so on. */
export interface QuestWorld {
  readonly map: GameMap;
  readonly scene: THREE.Scene;
  readonly selfId: string;
  readonly name: string;
  readonly isHost: boolean;
  /** The game's in passive mode (settings.ts): nothing attacks anyone. */
  readonly passive: boolean;
  readonly naughtyBoys: NaughtyBoys;
  me(): { x: number; y: number; z: number; yaw: number; alive: boolean };
  /** Everyone in the game, you included. */
  players(): { id: string; name: string; colour: string; x: number; y: number; z: number; alive: boolean }[];
  nameOf(id: string): string;
  colourOf(id: string): string;
  /** Every pub in the force field (scene coordinates). */
  pubs(): { name: string; x: number; z: number; rating: number | null }[];
  /** Named places (parks, squares, gardens, churchyards...): their middles, scene coordinates. */
  places(): { n: string; x: number; z: number }[];
  send(type: "qe" | "no", data: unknown, to?: string): void;
  toast(text: string, secs?: number): void;
  feed(html: string): void;
  /** A marker column, compass pip and map pin for a job (id like "@job"), or null to take it down. */
  mark(id: string, at: { x: number; z: number; y?: number } | null, label?: string, colour?: string): void;
  /** Host only: a prize on the ground. good: one of the better ones. */
  prize(x: number, z: number, good: boolean): void;
  /** Hand yourself something for doing a job: a ride (rides.ts), when there are rides. */
  reward(what: string): void;
  /** Where you're looking from and which way (a unit vector), and whether through binoculars or a scope. */
  look(): { x: number; y: number; z: number; dx: number; dy: number; dz: number; zoomed: boolean };
  /** A job's search circle on the maps (key), or null to take it off. */
  circle(key: string, c: Circle | null): void;
  /** Hand yourself a ride and get on it (the start of a race). */
  ride(kind: RideKind): void;
  /** Say hello to everyone again, with anything new about you (a rosette from a trail). */
  announce?(): void;
  /** Move yourself there (the start of a race), facing yaw. */
  moveTo(x: number, z: number, yaw: number): void;
  /** What you're riding, if you're on a ride. */
  riding(): RideKind | null;
  /** Seconds into a manual on your ride (0: not on one). */
  manual(): number;
  /** A race's speed-up for your ride, to be said every frame it holds (mul on top speed and push), with a one-off shove to your speed. */
  rideBoost?(mul: number, kick?: number): void;
  /** Knocked off your ride by another racer. */
  knock?(): void;
  /** Slow you down for a while (wading through seagull muck). */
  slow?(secs: number): void;
  /** How far away a sound at (x, y, z) is from you, and how far left or right (-1..1). */
  hear?(x: number, y: number, z: number): [number, number];
  /** A puff of dust and grit at a spot, spreading out along a unit vector (scene coordinates). */
  dust?(x: number, y: number, z: number, nx: number, nz: number): void;
  /** A line pencilled onto your own big map (scene x, z pairs), by key, or null to rub it out (signals.ts). */
  pencil?(key: string, pts: number[] | null): void;
  /** Rub out every pencil line on the map, everyone's. */
  wipe?(): void;
  /** Flares to hand for each clue of a trail, or null for the usual one a minute. */
  flares?(n: number | null): void;
}

/** Something a job's put up to shoot at (a seagull), as a shot found it: how far, a headshot, and which. */
/** follow: where the spot it was hit gets to as it flies (see weapon.ts), for the paintball to burst on it there. */
export interface Quarry { dist: number; head: boolean; ref: number; follow?: Follow }

/** What a job puts on the card at the top left of the screen. bar: 0..1 for a progress bar. */
export interface Card {
  line: string; sub?: string; bar?: number;
  /** How far you've got in a few characters ("2 / 5"), and the clock if the job has one. */
  progress?: string; timer?: string;
  /** Where the job has got to (a wave, a clue): when key changes everyone gets a banner. */
  stage?: { key: string; title: string; sub?: string; colour?: string; life?: number };
}

/** A Gaffer who got away from a pub takeover (invasion.ts) and is the next game day's Wanted poster. how: how he left (naughtyboys.ts MOUNTS). */
export interface Fugitive { id: number; day: number; name: string; pub: string; x: number; z: number; how: number }

/** A job's poster: everything about it that goes round when someone takes it. */
export interface Offer {
  kind: string; seed: number; stars: number;
  title: string; blurb: string; reward: string;
  x: number; z: number; where: string;     // the noticeboard, and the place it's at
  mode?: number;                            // anything else the kind needs, as a number
  /** A follow-up job's own shape (nightout.ts): how many legs a trail has, where a race finishes, and a line to open the poster (html). */
  legs?: number; to?: { n: string; x: number; z: number }; say?: string;
}

/** What goes round for a follow-up job: everything about it that the seed doesn't give. */
export type Link = Pick<Offer, "kind" | "seed" | "stars" | "title" | "x" | "z" | "where" | "mode" | "legs" | "to" | "say">;

/** A job someone's taken, running on every player's screen. */
export interface Job {
  readonly offer: Offer;
  /** Every frame, on every player. */
  update(dt: number): void;
  /** Every frame, on the host only. */
  host?(dt: number): void;
  /** A step of the job, from whoever made it ("qe"). */
  event?(d: any, from: string): void;
  /** How far the job's got, for someone joining; and taking that on. */
  progress?(): unknown;
  restore?(p: any): void;
  /** E pressed: return true if the job used it. hint(): what E would do, if anything. */
  use?(): boolean;
  hint?(): string;
  /** Host: a naughty boy (or anything run by naughtyboys.ts) went down, to whoever by. */
  naughtyBoyDown?(i: number, by: string): void;
  card(): Card;
  /** What to call the job's boss (a Wanted ringleader) on the boss bar. */
  boss?(): string;
  /** Set once the job's over: won or not, what to say, where the prizes go, and anything you've
   *  earned for your wardrobe (wardrobe.ts). screen: the job has put up its own end card. */
  done: { won: boolean; text: string; x?: number; z?: number; wear?: string[]; screen?: boolean; grade?: Grade } | null;
  /** A shot from o along d (a unit vector), up to max metres: did it hit anything of the job's? */
  hit?(o: THREE.Vector3, d: THREE.Vector3, max: number): Quarry | null;
  /** And you hit it, this hard (a sniper round counts for more). */
  shoot?(q: Quarry, power: number): void;
  /** A boss of the job's own for the boss bar (Big Lad): its name and how much fight is left, 0..1. */
  bossBar?(): { name: string; fill: number } | null;
  /** Take down anything the job put up. */
  end(): void;
  /** Backspace: back on the start line for a go of your own. Returns false if it can't. */
  restart?(): boolean;
  /** Where you're held still (on a start line in a countdown), or null to move freely. */
  held?(): { x: number; z: number } | null;
  /** Where losing or giving up the job leaves its mark on the town (scars.ts), if not its noticeboard. */
  scarAt?(): { x: number; z: number } | null;
  /** A way to draw on the maps (a race's route), if the job has one. */
  route?(): RouteLine | null;
}

export interface JobKind {
  id: string;
  /** The letter on its badge, its colour, and what the poster calls it ("Wanted"). */
  glyph: string; colour: string; label: string;
  /** What the title card says to do, from the poster. */
  goal?(o: Offer): string;
  /** Can be done again the same day (a race, to beat your time). */
  again?: boolean;
  /** Today's job of this kind on the noticeboard at spot, from r. Null if it can't make one there. */
  offer(r: Rng, spot: PostSpot, w: QuestWorld): Offer | null;
  /** local: a go of your own (Backspace after it's over), not the room's. */
  start(o: Offer, w: QuestWorld, started: number, by: string, local?: boolean): Job;
  /** One more noticeboard a day of this kind, the same for everyone (the daily race), from r and
   *  the spots round the village. */
  daily?(r: Rng, spots: PostSpot[], w: QuestWorld): Offer | null;
  /** Anything more for the poster, worked out as you read it (the daily race's board). */
  poster?(o: Offer): string;
  /** Fill in the poster of a follow-up job from its link (the same on every screen); null if it can't be done here. */
  build?(o: Offer, w: QuestWorld): Offer | null;
  /** The poster for a Gaffer who got away, from the host's record of him; the same for everyone. */
  fugitive?(f: Fugitive, w: QuestWorld): Offer | null;
}

const kinds = new Map<string, JobKind>();
/** A kind of job joins the noticeboards. */
export function registerJob(k: JobKind) { kinds.set(k.id, k); }
/** Every kind of job there is, for the map's key. */
export function jobKinds(): JobKind[] { return [...kinds.values()]; }

/** Something always on, with nothing to take (stunts.ts): run every frame, with its spots on the maps. */
export interface FreePlay {
  update(dt: number, w: QuestWorld): void;
  spots?(w: QuestWorld): JobSpot[];
  dispose?(w: QuestWorld): void;
}
const free: FreePlay[] = [];
export function registerFree(f: FreePlay) { free.push(f); }

// ---- today's noticeboards ---------------------------------------------------------------------

/** Somewhere a noticeboard can go: a pub or a named place, scene coordinates. */
export interface PostSpot { x: number; z: number; name: string; pub: boolean }
interface Post { i: number; offer: Offer; kind: JobKind; x: number; z: number; y: number; view?: THREE.Group; placed?: boolean; until?: number }

const NEAR_VILLAGE = 4;        // of today's jobs, this many are round Combe Down, where everyone starts
const IN_BATH = 9;             // and this many anywhere else in the force field
const VILLAGE = 1300;          // metres from Firs Field that count as round the village
const SHOWN = 360;             // a noticeboard is built when you're this close, and taken down past SHOWN + 60
const READ = 7;                // how close to read it
const TAKE = 3.2;              // and to take it
const DONE_KEY = "cd-jobs-done";

/** Where today's noticeboards go, and what's on them. Every player works out the same ones. */
function todaysPosts(day: number, w: QuestWorld, home: { x: number; z: number }): Post[] {
  const list = [...kinds.values()];
  if (!list.length) return [];
  const map = w.map, ok = (x: number, z: number) => map.fieldEdge(x, z) > 90;
  const spots: PostSpot[] = [
    ...w.pubs().filter((p) => ok(p.x, p.z)).map((p) => ({ x: p.x, z: p.z, name: p.name, pub: true })),
    ...w.places().filter((p) => ok(p.x, p.z)).map((p) => ({ x: p.x, z: p.z, name: p.n, pub: false })),
  ].sort((a, b) => a.x - b.x || a.z - b.z || a.name.localeCompare(b.name));
  if (!spots.length) return [];
  const r = rng(hash("posts", day));
  const near = shuffled(r, spots.filter((s) => Math.hypot(s.x - home.x, s.z - home.z) < VILLAGE));
  const rest = shuffled(r, spots.filter((s) => Math.hypot(s.x - home.x, s.z - home.z) >= VILLAGE));
  const order = shuffled(r, list);
  const out: Post[] = [];
  const room = (s: PostSpot) => !out.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < 250);
  const fill = (from: PostSpot[], n: number) => {
    for (const s of from) {
      if (n <= 0) break;
      if (!room(s)) continue;
      const kind = order[out.length % order.length];
      const offer = kind.offer(rng(hash("job", day, out.length, kind.id)), s, w);
      if (!offer) continue;
      out.push({ i: out.length, offer, kind, x: offer.x, z: offer.z, y: map.ground(offer.x, offer.z) });
      n--;
    }
  };
  fill(near, NEAR_VILLAGE);
  fill(rest, IN_BATH);
  // the daily ones, round the village, after the rest so they don't change what else is up
  for (const kind of list) {
    if (!kind.daily) continue;
    const offer = kind.daily(rng(hash("daily", day, kind.id)), near.filter(room), w);
    if (offer) out.push({ i: out.length, offer, kind, x: offer.x, z: offer.z, y: map.ground(offer.x, offer.z) });
  }
  return out;
}

// ---- the noticeboard in the street --------------------------------------------------------------

/** A council noticeboard on two oak posts with today's poster pinned up, a ring of light at its
 *  foot and the job's badge turning over it. */
function noticeboard(o: Offer, kind: JobKind): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: "#5a3d22" });
  const green = new THREE.MeshLambertMaterial({ color: "#1f4a33" });
  for (const x of [-0.62, 0.62]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.3, 0.1), wood);
    post.position.set(x, 1.15, 0); post.castShadow = true;
    g.add(post);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.98, 0.08), green);
  frame.position.set(0, 1.55, 0); frame.castShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.06, 0.26), green);
  roof.position.set(0, 2.09, 0); roof.rotation.x = -0.08;
  g.add(frame, roof);
  // the poster, on both faces
  const c = document.createElement("canvas");
  c.width = 512; c.height = 352;
  const x = c.getContext("2d")!;
  x.fillStyle = "#f4ecd4"; x.fillRect(0, 0, 512, 352);
  x.fillStyle = kind.colour; x.fillRect(0, 0, 512, 70);
  x.fillStyle = "#14161c"; x.font = "800 52px 'Barlow Condensed', Impact, sans-serif"; x.textAlign = "center";
  x.fillText(kind.label.toUpperCase(), 256, 54);
  x.font = "700 40px Georgia, serif"; x.fillStyle = "#1b1b1d";
  wrap(x, o.title, 256, 124, 470, 44, 2);
  x.font = "600 30px Georgia, serif"; x.fillStyle = "#7a5a10";
  x.fillText(starText(o.stars), 256, 230);
  x.font = "italic 26px Georgia, serif"; x.fillStyle = "#333";
  wrap(x, o.where, 256, 282, 470, 30, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sheet = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  for (const side of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 0.88), sheet);
    p.position.set(0, 1.55, side * 0.042); p.rotation.y = side > 0 ? 0 : Math.PI;
    g.add(p);
  }
  // the ring at its foot
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.75, 32), new THREE.MeshBasicMaterial({
    color: kind.colour, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.name = "ring";
  // the badge over it, as on the maps
  const bc = document.createElement("canvas");
  bc.width = bc.height = 128;
  jobIcon(bc.getContext("2d")!, 64, 64, 9, kind.colour, kind.glyph);
  const btex = new THREE.CanvasTexture(bc);
  btex.colorSpace = THREE.SRGBColorSpace;
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: btex, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
  badge.position.y = 2.8; badge.name = "badge";
  g.add(ring, badge);
  return g;
}

function wrap(x: CanvasRenderingContext2D, text: string, cx: number, y: number, width: number, line: number, max: number) {
  const words = text.split(/\s+/), lines: string[] = [];
  let cur = "";
  for (const wd of words) {
    const t = cur ? `${cur} ${wd}` : wd;
    if (x.measureText(t).width > width && cur) { lines.push(cur); cur = wd; } else cur = t;
  }
  if (cur) lines.push(cur);
  lines.slice(0, max).forEach((l, k) => x.fillText(k === max - 1 && lines.length > max ? `${l}…` : l, cx, y + k * line));
}

// ---- the jobs, as the game sees them ------------------------------------------------------------

const $ = (id: string) => document.getElementById(id)!;

export class Quests {
  private day = -1;
  private posts: Post[] = [];
  private job: Job | null = null;
  private started = 0;            // when the running job was taken (ms since 1970), and by whom
  private by = "";
  private finishT = 0;            // seconds the "job done" card stays up
  private doneSeeds = new Set<number>();   // jobs finished today, by their seed
  private stageKey: string | null = null;   // the stage banner last shown for the job; null before the first look
  private circles = new Map<string, Circle>();
  private local = false;          // the running job is a go of your own (Backspace), not the room's
  private last: Offer | null = null;   // the last job that can be run again, and when it ended
  private lastT = 0;
  private again: HTMLButtonElement | null = null;
  private home: { x: number; z: number };
  private ready: () => boolean;
  /** A job's step or end, for the quips. */
  onDone: (won: boolean) => void = () => {};
  /** A job for the room lost, and where it leaves its mark (scars.ts). */
  onScar: (o: Offer, x: number, z: number) => void = () => {};
  /** The Gaffers who got away (invasion.ts), each the next game day's Wanted poster. */
  fugitives: () => Fugitive[] = () => [];
  /** A job for the room ended (not a go of your own): the follow-ups' cue (nightout.ts). */
  onEnd: (o: Offer, d: NonNullable<Job["done"]>) => void = () => {};
  private fugT = 0;

  constructor(private w: QuestWorld, ready: () => boolean) {
    this.ready = ready;
    const sp = w.map.d.spawn ?? [[0, 0]];
    this.home = { x: sp.reduce((s, p) => s + p[0], 0) / sp.length, z: -sp.reduce((s, p) => s + p[1], 0) / sp.length };
    try { const d = JSON.parse(localStorage.getItem(DONE_KEY) ?? "null"); if (d?.day === dayNumber()) this.doneSeeds = new Set(d.seeds); } catch { /* ignore */ }
  }

  get running() { return this.job; }
  get title() { return this.job?.offer.title ?? ""; }

  /** Today's noticeboards for the maps. */
  spots(): JobSpot[] {
    const extra = this.ready() ? free.flatMap((f) => f.spots?.(this.w) ?? []) : [];
    return extra.concat(this.posts.map((p) => ({
      x: p.x, z: p.z, colour: p.kind.colour, glyph: p.kind.glyph, label: p.kind.label, layer: "job-" + p.kind.id,
      done: this.doneSeeds.has(p.offer.seed) || this.job?.offer.seed === p.offer.seed,
    })));
  }
  /** Search circles for the maps. */
  areas(): Circle[] { return [...this.circles.values()]; }
  /** The running job's route for the maps, if it has one. */
  routes(): RouteLine[] { const r = this.job && !this.job.done ? this.job.route?.() : null; return r ? [r] : []; }
  /** A job's search circle (key), or null to clear it. */
  circle(key: string, c: Circle | null) { if (c) this.circles.set(key, c); else this.circles.delete(key); }

  /** A new day: new noticeboards. */
  private refresh() {
    const day = dayNumber();
    if (day === this.day || !this.ready()) return;
    for (const p of this.posts) if (p.view) this.w.scene.remove(p.view);
    this.day = day;
    this.posts = todaysPosts(day, this.w, this.home);
    if (!this.doneSeeds.size || ![...this.doneSeeds].some((s) => this.posts.some((p) => p.offer.seed === s))) this.doneSeeds.clear();
  }

  /** A Gaffer who got away yesterday is today's Wanted poster, put up where he was last seen. */
  private putUpFugitives() {
    for (const f of this.fugitives()) {
      if (f.day + 1 !== this.day) continue;
      const seed = hash("gaffer", f.id);
      if (this.posts.some((p) => p.offer.seed === seed)) continue;
      const offer = kinds.get("wanted")?.fugitive?.(f, this.w);
      if (offer) this.posts.push({ i: this.posts.length, offer, kind: kinds.get("wanted")!, x: offer.x, z: offer.z, y: this.w.map.ground(offer.x, offer.z) });
    }
  }

  /** A follow-up job's poster goes up where it is, for secs seconds, if it can be built here. */
  putUp(l: Link, secs: number): boolean {
    const kind = kinds.get(l.kind);
    if (!kind?.build || this.posts.some((p) => p.offer.seed === l.seed)) return false;
    const offer = kind.build({ ...l, blurb: "", reward: "" }, this.w);
    if (!offer) return false;
    this.posts.push({ i: this.posts.length, offer, kind, x: offer.x, z: offer.z, y: this.w.map.ground(offer.x, offer.z), until: Date.now() + secs * 1000 });
    return true;
  }
  /** Is a follow-up's poster still up? */
  chained(): boolean { return this.posts.some((p) => p.until !== undefined); }
  /** Take down the follow-up posters (all of them, or one by its seed). */
  private takeDown(seed?: number) {
    for (let k = this.posts.length - 1; k >= 0; k--) {
      const p = this.posts[k];
      if (p.until === undefined || (seed !== undefined && p.offer.seed !== seed)) continue;
      if (p.view) this.w.scene.remove(p.view);
      this.posts.splice(k, 1);
    }
  }

  /** Every frame. */
  update(dt: number, t: number) {
    this.refresh();
    const now = Date.now();
    for (let k = this.posts.length - 1; k >= 0; k--) {
      const u = this.posts[k].until;
      if (u !== undefined && now > u) { const v = this.posts[k].view; if (v) this.w.scene.remove(v); this.posts.splice(k, 1); }
    }
    if (this.day >= 0 && (this.fugT -= dt) <= 0) { this.fugT = 2; this.putUpFugitives(); }
    const me = this.w.me();
    // build the noticeboards round you, and take down the ones you've left behind
    for (const p of this.posts) {
      const d = Math.hypot(p.x - me.x, p.z - me.z);
      if (!p.view && d < SHOWN && this.w.map.detailedAt(p.x, p.z)) {
        // a place's middle can be in a pond or a building: stand it on clear ground nearby
        if (!p.placed) {
          p.placed = true;
          const c = clearSpot(this.w.map, p.x, p.z, 25);
          if (c) { p.x = c[0]; p.z = c[1]; }
          p.y = this.w.map.ground(p.x, p.z);
        }
        p.view = noticeboard(p.offer, p.kind);
        p.view.position.set(p.x, p.y, p.z);
        p.view.rotation.y = Math.atan2(me.x - p.x, me.z - p.z);
        this.w.scene.add(p.view);
      } else if (p.view && d > SHOWN + 60) { this.w.scene.remove(p.view); p.view = undefined; }
      if (p.view) {
        const badge = p.view.getObjectByName("badge"), ring = p.view.getObjectByName("ring") as THREE.Mesh;
        const off = this.doneSeeds.has(p.offer.seed) || this.job?.offer.seed === p.offer.seed;
        if (badge) { badge.visible = !off; badge.rotation.y = t * 1.3; badge.position.y = 2.8 + Math.sin(t * 1.7) * 0.1; }
        if (ring) { ring.visible = !off; (ring.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.3 * Math.sin(t * 3); }
      }
    }
    if (this.job) {
      this.job.update(dt);
      if (this.w.isHost) this.job.host?.(dt);
      if (this.job.done && this.finishT <= 0) this.finish();
    }
    if (this.finishT > 0 && (this.finishT -= dt) <= 0) this.clear();
    if (this.ready()) for (const f of free) f.update(dt, this.w);
    this.hud(me);
    this.againButton();
  }

  /** Stood reading a noticeboard (the Chronicle's pinned up on every one). */
  atBoard(): boolean {
    const me = this.w.me();
    return me.alive && !!this.postAt(me.x, me.z, READ);
  }

  /** The noticeboard you're stood at, if any. */
  private postAt(x: number, z: number, reach: number): Post | undefined {
    return this.posts.find((p) => Math.hypot(p.x - x, p.z - z) < reach);
  }

  /** What E does here, for the prompt in the middle of the screen; empty if nothing. */
  hint(): string {
    const me = this.w.me();
    if (!me.alive) return "";
    const h = this.job && !this.job.done ? this.job.hint?.() : "";
    if (h) return h;
    const p = this.postAt(me.x, me.z, TAKE);
    if (!p) return "";
    if (this.doneSeeds.has(p.offer.seed)) return "Done today. New jobs tomorrow";
    if (this.job?.offer.seed === p.offer.seed) return "";
    if (this.job && !this.local) return "Finish or call off your job first";
    return `<b>E</b> Take the job`;
  }

  /** E pressed. Returns true if it was for a job. */
  use(): boolean {
    const me = this.w.me();
    if (!me.alive) return false;
    if (this.job && !this.job.done && this.job.use?.()) return true;
    const p = this.postAt(me.x, me.z, TAKE);
    if (!p || (this.job && !this.local) || this.doneSeeds.has(p.offer.seed)) return false;
    this.take(p.offer);
    return true;
  }

  /** Take a job on, for everyone in the room. */
  private take(o: Offer) {
    const t = Date.now();
    this.begin(o, t, this.w.selfId);
    this.sendStart();
  }

  private sendStart(to?: string) {
    if (!this.job || this.local) return;
    this.w.send("qe", { k: "start", o: this.job.offer, t: this.started, by: this.by, p: this.job.progress?.() }, to);
  }

  private begin(o: Offer, t: number, by: string, p?: unknown, local = false) {
    const kind = kinds.get(o.kind);
    if (!kind) return;
    if (this.job) this.clear();
    this.takeDown();
    this.started = t; this.by = by; this.finishT = 0;
    this.local = local;
    this.job = kind.start(o, this.w, t, by, local);
    Telemetry.begin("job:" + o.kind);
    if (p !== undefined) this.job.restore?.(p);
    if (kind.again) this.last = o;
    if (local) { this.startCard(o, kind); return; }
    SFX.jobTaken();
    this.startCard(o, kind);
    const who = by === this.w.selfId ? "You" : this.w.nameOf(by);
    this.w.feed(`<b style="color:${this.w.colourOf(by)}">${esc(who)}</b> took on a job: <b style="color:${kind.colour}">${esc(o.title)}</b>`);
  }

  private startCard(o: Offer, kind: JobKind) {
    missionStart({ title: o.title, goal: kind.goal?.(o) ?? o.blurb.replace(/<[^>]*>/g, ""), detail: o.where ? `At ${o.where}` : undefined, label: kind.label, colour: kind.colour, best: bestFor(o.kind) });
  }

  /** Call the job off (the pause menu), for everyone. */
  callOff() {
    if (!this.job) return;
    if (!this.local) { this.w.send("qe", { k: "stop", s: this.job.offer.seed }); }
    const o = this.job.offer;
    Paper.job(kinds.get(o.kind)?.label ?? "Job", o.title, o.where, false, true);
    this.endCard(false, "Job called off", "");
    this.clear();
  }

  private endCard(won: boolean, title: string, line: string) {
    missionEnd({ result: won ? "complete" : "failed", title, lines: line ? [line] : [], colour: this.job ? kinds.get(this.job.offer.kind)?.colour : undefined });
  }

  private finish() {
    const job = this.job!, d = job.done!;
    missionClear("job");
    if (!d.screen) this.endCard(d.won, d.won ? "Job done!" : "Job failed", d.text);
    // anything earned for your wardrobe, a go of your own included; any job at all gets you the joke glasses
    for (const id of d.wear ?? []) earn(id);
    if (d.won) { jobWon(); missionResult(job.offer.kind, d.grade ?? { tier: 1 }); }
    Paper.job(kinds.get(job.offer.kind)?.label ?? "Job", job.offer.title, job.offer.where, d.won);
    if (d.won && !this.local) earn("specs");
    if (this.local) { this.clear(); return; }   // a go of your own: it just ends
    this.onEnd(job.offer, d);
    this.finishT = 6;
    if (!kinds.get(job.offer.kind)?.again) this.doneSeeds.add(job.offer.seed);
    try { localStorage.setItem(DONE_KEY, JSON.stringify({ day: this.day, seeds: [...this.doneSeeds] })); } catch { /* ignore */ }
    SFX.jobDone(d.won);
    this.onDone(d.won);
    if (!d.won) this.scar();
    if (d.won && this.w.isHost && !this.local) {
      const at = d.x !== undefined && d.z !== undefined ? { x: d.x, z: d.z } : this.w.me();
      for (let k = 0; k < job.offer.stars; k++) {
        const a = (k / Math.max(1, job.offer.stars)) * Math.PI * 2;
        this.w.prize(at.x + Math.cos(a) * 1.8, at.z + Math.sin(a) * 1.8, k === 0);
      }
    }
  }

  private scar() {
    const job = this.job;
    if (!job) return;
    const at = job.scarAt?.() ?? (job.done?.x !== undefined && job.done?.z !== undefined ? { x: job.done.x, z: job.done.z } : { x: job.offer.x, z: job.offer.z });
    this.onScar(job.offer, at.x, at.z);
  }

  private clear() {
    this.job?.end();
    if (this.job) Telemetry.end("job:" + this.job.offer.kind);
    if (this.job && kinds.get(this.job.offer.kind)?.again) this.lastT = Date.now();
    this.job = null;
    this.stageKey = null;
    missionClear("job");
    this.local = false;
    this.finishT = 0;
    this.circles.clear();
  }

  /** A job message from another player. */
  onMessage(d: any, from: string) {
    if (!d || typeof d !== "object") return;
    if (d.k === "start" && d.o && typeof d.o.seed === "number") {
      const t = Number(d.t) || 0, by = String(d.by ?? from);
      if (this.job && this.job.offer.seed === d.o.seed) { if (d.p !== undefined && !this.job.done) this.job.restore?.(d.p); return; }
      // two jobs taken at once: the first one taken (then the lower id) stands
      if (this.job && !this.job.done && !this.local && (this.started < t || (this.started === t && this.by < by))) return;
      this.begin(d.o as Offer, t, by, d.p);
      return;
    }
    if (d.k === "stop") {
      if (this.job && this.job.offer.seed === d.s) { this.endCard(false, "Job called off", `${this.w.nameOf(from)} called it off`); this.clear(); }
      return;
    }
    if (this.job && d.s === this.job.offer.seed) this.job.event?.(d, from);
  }

  /** Someone joined: the host tells them what job's on. */
  joined(id: string) { if (this.w.isHost && this.job && !this.job.done) this.sendStart(id); }

  /** Backspace: back on the line of the race you're in, or of the last one (for two minutes after it). */
  restart(): boolean {
    if (!this.w.me().alive) return false;
    const job = this.job;
    if (job && !job.done && job.restart) return job.restart();
    const o = this.last;
    if (!o || (job && !job.done) || (!job && Date.now() - this.lastT > 120000)) return false;
    this.begin(o, Date.now(), this.w.selfId, undefined, true);
    return true;
  }
  private canRestart() {
    const job = this.job;
    if (job && !job.done) return !!job.restart;
    return !!this.last && (!!job || Date.now() - this.lastT < 120000);
  }

  /** Where you're held on a start line, if you are. */
  held(): { x: number; z: number } | null { return this.job && !this.job.done ? this.job.held?.() ?? null : null; }

  /** On a touch screen, the Again button, when there's a race to run again. */
  private againButton() {
    const touch = document.getElementById("touch");
    if (!touch) return;
    if (!this.again) {
      const b = (this.again = document.createElement("button"));
      b.className = "tbtn small"; b.textContent = "Again"; b.hidden = true;
      b.style.cssText = "position:absolute;right:16px;top:150px;pointer-events:auto";
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); this.restart(); });
      touch.appendChild(b);
    }
    const show = this.canRestart() && this.w.me().alive;
    if (this.again.hidden === show) this.again.hidden = !show;
  }

  /** Host: something naughtyboys.ts runs went down. */
  naughtyBoyDown(i: number, by: string) { this.job?.naughtyBoyDown?.(i, by); }

  /** A shot: did it hit anything the running job put up? */
  hit(o: THREE.Vector3, d: THREE.Vector3, max: number): Quarry | null { return this.job && !this.job.done ? this.job.hit?.(o, d, max) ?? null : null; }
  /** And it did. */
  shoot(q: Quarry, power: number) { if (this.job && !this.job.done) this.job.shoot?.(q, power); }
  /** The running job's own boss for the boss bar, if it has one up. */
  bossBar() { return this.job && !this.job.done ? this.job.bossBar?.() ?? null : null; }

  /** The name on the boss bar for the job's boss, if it has one. */
  bossName() { return this.job && !this.job.done ? this.job.boss?.() ?? "" : ""; }

  /** The card at the top left while a job's on, and a poster when you're stood at a noticeboard. */
  private hud(me: { x: number; z: number }) {
    const job = this.job;
    if (job && !job.done) {
      const kind = kinds.get(job.offer.kind)!, c = job.card();
      missionProgress({
        id: "job", label: `${esc(kind.label)} · ${starText(job.offer.stars)}`, colour: kind.colour, goal: job.offer.title,
        progress: c.progress, bar: c.bar, timer: c.timer, hint: c.line, sub: c.sub, flash: c.line.replace(/\d+ s to/, ""),
      });
      const st = c.stage;
      if (st && st.key !== this.stageKey) {
        if (this.stageKey !== null) { missionStage({ title: st.title, sub: st.sub, colour: st.colour ?? kind.colour, life: st.life }); }
        this.stageKey = st.key;
      } else if (!st && this.stageKey === null) this.stageKey = "";
    } else missionClear("job");
    const p = this.postAt(me.x, me.z, READ);
    let poster = "";
    if (p && this.job?.offer.seed !== p.offer.seed) {
      const o = p.offer, done = this.doneSeeds.has(o.seed);
      poster = `<div class="label" style="color:${p.kind.colour}">${esc(p.kind.label)} · ${starText(o.stars)}</div>`
        + `<div class="jobtitle">${esc(o.title)}</div><p>${o.blurb}</p>${p.kind.poster?.(o) ?? ""}<p class="reward">Reward: ${esc(o.reward)}</p>`
        + `<em>${done ? "Done today" : this.job && !this.local ? "Finish or call off your job first" : Math.hypot(p.x - me.x, p.z - me.z) < TAKE ? "E to take the job" : "Step up to take it"}</em>`;
    }
    show($("jobposter"), poster, !!poster);
  }

  dispose() {
    this.clear();
    for (const f of free) f.dispose?.(this.w);
    this.again?.remove();
    for (const p of this.posts) if (p.view) this.w.scene.remove(p.view);
  }
}
