// The flag invasion: the Flag Lads are out to cable-tie an England flag to every lamp post in Bath,
// whether Bath likes it or not. They're made up, and the joke is on them: on the flag-planting,
// the "taking our streets back", and the "I'm not being funny, but..." that's never far behind it,
// not on the flag itself, and not on who anybody is. When you win a pub back it flies a banner that
// says everyone's welcome.
//
// Bath is split into its squares (tiles.ts), and each square is flagged from 0 to 100%. The meter
// under the minimap ("Flags up: 27%") is the average, with what to do next under it; it only comes
// up during a takeover or just after you've shot a flag, and the rest of the time how the Flag Lads
// are doing is in today's jobs (daily.ts, status() here), under Tab. In a flagged
// square the street lamps fly the flag (the more flagged it is, the more of them), with red and
// white bunting strung between them once it's mostly taken. The Flag Lads don't hang about the
// streets: they only turn up at the pubs they've taken over (below), and their ladder lads only to
// put flags back. Shoot a flag down and the square drops a little; ladder lads come and put cleared
// flags back up, and run from you rather than fight. Squares nobody's in creep up, and a square
// that's mostly taken spreads to the squares next to it. Shoot every flag in a square and it's
// cleared (set to nothing). No square flies more than CAP flags, and each one shot takes exactly
// one off: the panel counts the square you're in, and while you're at it the nearest flag left
// flaps where you can hear it, but you have to go and find it.
//
// Every few minutes the phone goes: the Flag Lads have taken over a pub. A purple marker goes up on
// it; get there and clear out the lads and the Gaffer to win the square back (its flags drop
// sharply, and there are prizes). The crew grows with the room, and a big room gets two takeovers
// at once (the second under the Gaffer's cousin). There's one Gaffer at a time, with a name and a
// trait or two (a gazebo, a megaphone, a right-hand man, the whole WhatsApp group), who remembers
// how it went: win and he comes back with another trait; lose and he packs it in for the next one.
// A pub the lads keep gets their "WE RUN THIS" banner outside, signed, till someone tears it down
// or the day's out (scars.ts).
//
// The fight is at the pub's front: the crew stand out on the pavement facing the street, and a lad or
// more go up ladders against the wall to hang the lads' banner. Once the crew turn up a bar across
// the top of the screen fills while any lad is up a ladder, and if it fills the pub is lost. It takes
// 150 seconds alone and each other player in the room makes it a fifth quicker (never under 55
// seconds); a big room also puts more lads on ladders (one, two at 3, three at 5), so it is more to
// shoot and not tougher lads. A lad shot off a ladder sets the bar back a quarter, and the next goes
// up 15 seconds later. Alone it is slow enough to deal with the lads and then the ladder.
//
// At half his health the Gaffer runs (gaffer.ts): on foot, on a scooter or in his van, by his traits.
// The lads are left to the players and the pub is won as before, once they are cleared. Catch him
// within 400 m (cuff him with E once he gives up, or put him down) for bonus prizes. If he gets away
// he is the next game day's Wanted poster (wanted.ts), kept by the host like the day's scars.
// A pub won back flies the welcome banner, leaves a ride and the odd free round out, and its square
// stays flag-free for the rest of the day. Leave a takeover too long and the lads dig in: that
// square and the ones round it jump up. Get the meter to 0% and Bath is flag-free till tomorrow;
// each day (a "season" in the code, from midnight GMT) the Flag Lads start again from a few new
// squares.
//
// The fun of shooting them (flagjuice.ts) is yours alone: a combo for flags shot within four
// seconds of each other, a string of bunting that comes down if you shoot along it (a bonus, and
// it tears down the flags on the lamps at both ends too, each counted as a flag you shot, so one
// string can be a combo of three; it stays down until those flags are put back up and the square
// is mostly taken again, and the "bun" message that shows it falling is ignored by older
// pages), confetti and a moment of slow-motion when you clear a square, and a callout for shots
// from a ride or mid-grind.
//
// The flags you shoot and the squares you clear go on your map (yourmap.ts), and the day's pubs,
// with the Gaffer and how close each one came, into tomorrow's paper (paper.ts). The "out" message
// carries those extras; older pages ignore them.
//
// The Flag Lads hold off while the room is busy: when every player still up is on a job, a race, a
// trail, the bonfire or any other mission panel, the host stops the creep and spread, the ladder
// lads, new takeover calls and the dig-in clocks of takeovers already running (they're pushed back
// by the time lost), so doing a race never costs you ground. Alone, being busy is enough. If only
// some are busy it all carries on, so the others can defend, but nobody mid-job is the one a new
// takeover is called in to. Each player says when they start or stop being busy (and every few
// seconds while they are) in a "busy" message through "bv"; the host forgets anyone it hasn't heard
// from for a while, and sends "pa" in its state so everyone's meter can say so. Older pages ignore
// all of it and carry on as before. The levels only come from the clock for a room's first state
// and a new day, so paused time is never added back: once the host speaks, its levels are the truth.
//
// Who decides what: where the Flag Lads start each season, and how far they would have got by now
// with nobody fighting them, comes from the clock, so a room started any time picks up where the
// season should be. After that the host runs it (the spreading, the takeovers, the crews and the
// ladders, the Gaffer and the pubs won back, through naughtyboys.ts) and sends everyone the levels, the
// flags shot down, the takeovers (with how many lads are left and how far the banner has got and how
// fast it is filling, which everyone draws climbing in between), the Gaffer, the chase if he is on
// the run (so a new host carries on from it) and the pubs won back as "bv" every few seconds. The
// Gaffers who got away go round on their own as "fg". Cuffing him is asked of the host ("gcf"). Whoever shoots a flag down tells everyone at once, so it drops on every
// screen; the host counts it (on the shooter's word for its square, if the host hasn't that square
// loaded). Whoever shoots the last flag in a square says so, and the host clears it.
// The night out (nightout.ts) listens in: it is told, on every screen, when a pub is won or lost and
// when the Gaffer is caught or gets away, and it can ask the host which square the lads are eyeing
// next and to send a ladder crew somewhere. Nothing of that goes over the network from here.
import * as THREE from "three";
import * as SFX from "./audio";
import { CHAIR, LADDER, MOUNTS, SOCIETY, look, type NaughtyBoys, type Target } from "./naughtyboys";
import { Chase, Fugitives, escapeBy, RUNS_AT } from "./gaffer";
import { clearSpot, streetSpot } from "./haunts";
import type { GameMap } from "./map";
import type { Kind } from "./pickups";
import { compassWord, esc, far, hash, rng, type Fugitive } from "./quests";
import { RIDES } from "./rides";
import { note } from "./daily";
import { show } from "./show";
import { FlagJuice } from "./flagjuice";
import { missionActive, missionStage } from "./missionscreens";
import * as Paper from "./paper";
import * as Yours from "./yourmap";

/** What the game lends the invasion. */
export interface InvasionWorld {
  readonly map: GameMap;
  readonly scene: THREE.Scene;
  readonly naughtyBoys: NaughtyBoys;
  readonly selfId: string;
  readonly isHost: boolean;
  me(): { x: number; y: number; z: number; alive: boolean; yaw?: number };
  players(): Target[];
  /** yaw: which way the pub's front faces, if the map says. */
  pubs(): { name: string; x: number; z: number; yaw?: number }[];
  /** Which room's Gaffers who got away these are: the map and room code, or "solo". */
  readonly slot: string;
  send(data: unknown, to?: string): void;
  toast(text: string, secs?: number): void;
  feed(html: string): void;
  nameOf(id: string): string;
  mark(id: string, at: { x: number; z: number } | null, label?: string, colour?: string): void;
  prize(x: number, z: number, good: boolean): void;
  /** Host: leave a pickup on the ground for anyone (and tell everyone). */
  give(x: number, z: number, kind: Kind): void;
  /** Host: a pub the lads kept, signed by whoever runs them, to stay marked for the day (scars.ts). */
  scar?(x: number, z: number, pub: string, by: string): void;
  /** What I'm shooting from, for a trick shot: "grind", the ride's name, or nothing. */
  trick(): string;
  /** Alone in the room, so the game can slow down for a moment. */
  solo(): boolean;
  /** I'm mid-job, race, trail or minigame. */
  busy(): boolean;
  /** The street or place I'm in. */
  place(): string;
}

const SEASON = 24 * 3600 * 1000;   // ms: each day the Flag Lads start again
const TICK = 10;                   // seconds between steps of the spreading
const CATCH_UP = 80;               // seconds a step, working out where they'd have got to by now
const GROW = 1 / 38400;            // a flagged square nobody's in fills up in ten and a half hours
const SPREAD = 1 / 38400;          // and once one's past TIPPING it spreads next door about as fast
const TIPPING = 0.7;
const SEEDS = 3;                   // squares the Flag Lads start each season in
const START = 0.15;                // and how flagged they start
const CAP = 30;                    // flags in a square that's completely taken, at most, so every square can be cleared
const WON = 0.4, WON_NEXT = 0.15;  // winning a pub back: off its square, and off the squares round it
const LOST = 0.25, LOST_NEXT = 0.1;
const NEAR = 220;                  // flags are drawn (and can be shot) this close
const MAX_FLAGS = 400, MAX_PENNANTS = 1600;
const PURPLE = "#b45cff", GREEN = "#4fd18b";
const CALL_ID = "@bunting";
const BONUS_SECS = 90;             // clear a pub this quickly for extra prizes
const LULL = 180;                  // seconds a square gets no ladder crews after you catch one there
const FREE_ROUND = 120;            // seconds between the free rounds left out at a pub won back
const TWO_CALLS = 5;               // this many in the room and the Flag Lads take two pubs at once
const SEND_EVERY = 4;              // seconds between the host's updates
const BUSY_FOR = 15;               // seconds a "busy" word holds without another
const ON_IT = 60;                  // seconds after you shoot a flag that the panel stays up and the flapping helps you find the rest
const FLAP = 35;                   // metres: you hear the nearest flag flapping from this close
const BANNER_SECS = 150;           // alone, the lads need this long on the ladder to get the banner up
const BANNER_FASTER = 0.2;         // and each other player in the room makes it this much quicker
const BANNER_FLOOR = 55;           // but never quicker than this
const KNOCK_BACK = 0.25;           // a lad shot off the ladder sets the banner back this much
const LADDER_AGAIN = 15;           // seconds before another lad goes up the ladder
const CUFF_REACH = 3;              // close enough to cuff the Gaffer
const CAUGHT_PRIZES = 4;           // for the Gaffer caught: this many on the ground, two of the better sort
const $ = (id: string) => document.getElementById(id)!;

/** A street lamp that can fly a flag: its id (the same for everyone), the post, and its arm's angle.
 *  h: it flies the flag once its square is flagged past h (above 1 for lamps that never do, so a
 *  square with lots of lamps still has no more than CAP flags); per: what one flag is of its square. */
interface Lamp { id: string; x: number; z: number; g: number; a: number; sq: number; h: number; per: number }

/** The takeover: a pub the Flag Lads have taken. Host only: the crew they sent, and (for everyone) how many are left. */
interface Call {
  id: number; name: string; x: number; z: number; sq: number;
  until: number;                   // ms since 1970: the lads dig in then, unless you've turned up
  on: boolean;                     // the crew's there, and the fight's on
  onAt: number;                    // when they turned up (ms): clear it quickly for a bonus
  vice: boolean;                   // the second takeover at once, run by the Gaffer's cousin
  gazebo: { x: number; z: number } | null;
  crew: { i: number; gen: number }[]; chair: { i: number; gen: number } | null; deputy: { i: number; gen: number } | null;
  awayT: number; megaT: number;
  left: number;                    // lads still up, not counting the bosses (-1: not known yet)
  boss: number;                    // 0 the Gaffer's down, 1 he's up, 2 he's up and his right-hand man too
  bar: number;                     // the banner the lads are hanging, 0 to 1: full and the pub's lost
  rate: number;                    // how fast it's filling just now, per second (everyone draws it climbing between updates)
  lads: { i: number; gen: number }[]; ladT: number;   // host: the lads on the ladder, and when the next goes up
  fled: boolean;                   // the Gaffer has run for it (gaffer.ts)
}

/** Where the Gaffer is on the run, as everyone is told: who, how he's travelling and whether he has his hands up. */
interface Runner { i: number; gen: number; how: number; up: boolean; name: string; pub: string }

/** Seconds the banner takes to go up, with this many in the room. */
const bannerSecs = (room: number) => Math.max(BANNER_FLOOR, BANNER_SECS / (1 + BANNER_FASTER * (room - 1)));

/** The Gaffer: one at a time, with a name, a trait or two, and a memory of how it went with you. */
type Trait = "gazebo" | "megaphone" | "deputy" | "quorum";
const TRAITS: Record<Trait, string> = {
  gazebo: "brings a pop-up gazebo (shots at the Gaffer under it barely count)",
  megaphone: "has a megaphone (and more lads come when he shouts)",
  deputy: "has a right-hand man (the Gaffer can't be hurt till he's down)",
  quorum: "brings the whole WhatsApp group (a bigger crew)",
};
interface Chair { name: string; traits: Trait[]; wins: number; took: string; prev: string }
// all sorts: the flag on every lamp post isn't one kind of person, so the names aren't either
const FIRST = ["Nigel", "Clive", "Gary", "Rupert", "Dave", "Tarquin", "Kevin", "Jeremy", "Barry", "Giles", "Terry", "Hugo"];
const LAST = ["Cabletie", "Ladderman", "Lamppost", "Flagg", "Crossley", "Fivepoles", "Rafters", "Hoist", "Stepladder", "Halyard", "Drapes", "Polesworth"];

/** A new Gaffer. prev: who he took over from, if the last one was beaten. */
function newChair(r: () => number, prev = ""): Chair {
  let name = "";
  do name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`; while (name === prev);
  const all = Object.keys(TRAITS) as Trait[], traits: Trait[] = [];
  for (let k = 0, n = 1 + (r() < 0.4 ? 1 : 0); k < n; k++) {
    const t = all.filter((a) => !traits.includes(a));
    traits.push(t[Math.floor(r() * t.length)]);
  }
  return { name, traits, wins: 0, took: "", prev };
}

/** The Gaffer the Flag Lads start the day with, for the morning paper's Gaffer watch. */
export function morningGaffer(): { name: string; traits: string[] } {
  const c = newChair(rng(hash("chair", Math.floor(Date.now() / SEASON))));
  return { name: c.name, traits: c.traits };
}

// ---- the welcome banner, flown at a pub won back: ALL WELCOME under a row of every colour --------

function freeTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2f9a5c"; g.fillRect(0, 0, 128, 96);
  g.strokeStyle = "#f2efe6"; g.lineWidth = 6; g.strokeRect(4, 4, 120, 88);
  // a row of little pennants in all the colours along the top
  const hues = ["#e0262e", "#f08a24", "#f2d12e", "#3fbf5f", "#2f7fd8", "#8a4fd0", "#e46aa0"];
  for (let x = 10, k = 0; x < 118; x += 15, k++) { g.fillStyle = hues[k % hues.length]; g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 13, 8); g.lineTo(x + 6.5, 24); g.fill(); }
  g.fillStyle = "#f2efe6"; g.textAlign = "center";
  g.font = "bold 24px sans-serif"; g.fillText("ALL", 64, 52);
  g.font = "bold 21px sans-serif"; g.fillText("WELCOME", 64, 78);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- the flag: a red cross on white, a bit crumpled from the cable ties ----------------------------

function bannerTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4f4f2"; g.fillRect(0, 0, 128, 96);
  g.fillStyle = "#c8202a"; g.fillRect(52, 0, 24, 96); g.fillRect(0, 36, 128, 24);
  // creases where it's been tied on
  g.strokeStyle = "rgba(0,0,0,0.12)"; g.lineWidth = 2;
  for (const x of [18, 41, 88, 110]) { g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + 6, 48, x - 3, 96); g.stroke(); }
  // and the cable ties at the pole end
  g.fillStyle = "#1d1d20"; g.fillRect(0, 10, 6, 4); g.fillRect(0, 82, 6, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}


export class Invasion {
  // the squares: their tileKey order, which is the same for everyone
  private sqs: { ti: number; tj: number; x: number; z: number }[] = [];
  private index = new Map<string, number>();
  private next: number[][] = [];
  private size = 0; private x0 = 0; private y0 = 0;
  private L = new Float32Array(0);                 // how far the Flag Lads have got in each square: which lamps fly a flag
  private D = new Float32Array(0);                 // and how much of that's been shot down since (flags down, as a share)
  private cleared = new Set<string>();
  private pending = new Map<string, number>();     // flags I shot down, till the host's word catches up
  private season = -1;
  private saved = false;                           // the meter got to 0: nothing more this season
  private decorated = false;
  private heard = false;                           // had the host's word this game
  private calls: Call[] = [];
  private callN = 0;
  private paused = false;                         // everyone's busy, so the Flag Lads are having a brew
  private busyWas = false; private busyT = 0;
  private busyAt = new Map<string, number>();      // host: when each other player last said they were busy
  private callT = 120;                             // host: seconds till the next call-out
  private chair: Chair = newChair(Math.random);
  private chase: Chase | null = null;              // host: the Gaffer on the run
  private runner: Runner | null = null;            // everyone: the same, as the host says
  private runnerPack: unknown = null;              // the host's last word on the chase, to carry on from if the host leaves
  private runnerT = 0;                          // seconds till the Gaffer's marker next moves
  private gaffers: Fugitives;
  private freed: { n: string; x: number; z: number; sq: number; t: number }[] = [];   // pubs won back this season
  private ladders: { i: number; gen: number; id: string; x: number; z: number; t: number; leaving: boolean }[] = [];
  private ladderT = 60;
  private lull = new Map<number, number>();        // host: squares with no ladder crews till then (ms)
  private tickT = 0; private sendT = 0; private dirty = false;
  private flagT = 0;
  /** A pub won or lost, the Gaffer cuffed, put down or away (nightout.ts): d is the message that said so. */
  onEvent: (what: "won" | "lost" | "cuffed" | "down" | "away", d: any) => void = () => {};
  private downs = 0;                               // flags I've had down this game
  // the square you're in: its flags up at the most since you got here, how many are left, the nearest one
  private here: { sq: number; top: number; left: number; near: { x: number; z: number; d: number } | null } = { sq: -1, top: 0, left: 0, near: null };
  private claimed = -1;                            // the square I last told everyone I'd cleared
  private shotSq = -1;                             // the square of the last flag I shot
  private flapT = 0;
  private tickAt = 0;
  // drawn
  private lamps = new WeakMap<GameMap, Lamp[]>();
  private shown: { id: string; x: number; y: number; z: number; a: number }[] = [];
  private flags: THREE.InstancedMesh; private poles: THREE.InstancedMesh;
  private pennants: THREE.InstancedMesh; private strings: THREE.LineSegments;
  private falling: { m: THREE.Mesh; t: number; vx: number; vy: number; vz: number; ph: number; spin: number; floor: number }[] = [];
  private halves: THREE.PlaneGeometry[];
  private juice: FlagJuice;
  private strands: { key: string; ia: string; ib: string; ax: number; ay: number; az: number; bx: number; by: number; bz: number; sag: number }[] = [];
  private bannerMat: THREE.MeshLambertMaterial;
  private freeMat: THREE.MeshLambertMaterial;
  private props = new Map<string, THREE.Group>();  // banners (and the gazebo) outside the pubs near you
  private marked = new Map<number, number>();      // which call-out each marker is up for

  constructor(private w: InvasionWorld) {
    this.gaffers = new Fugitives(() => w.slot, () => w.isHost, (d, to) => w.send(d, to));
    const I = w.map.tileIndex;
    this.bannerMat = new THREE.MeshLambertMaterial({ map: bannerTexture(), side: THREE.DoubleSide });
    this.freeMat = new THREE.MeshLambertMaterial({ map: freeTexture(), side: THREE.DoubleSide });
    // a shot banner tears down the middle: each half keeps its side of the picture
    this.halves = [0, 1].map((k) => {
      const g = new THREE.PlaneGeometry(0.4, 0.6), uv = g.attributes.uv as THREE.BufferAttribute;
      for (let j = 0; j < uv.count; j++) uv.setX(j, (uv.getX(j) + k) / 2);
      return g;
    });
    const banner = new THREE.PlaneGeometry(0.8, 0.6).translate(0.5, -0.32, 0);
    const pole = new THREE.BoxGeometry(0.92, 0.035, 0.035).translate(0.46, 0, 0);
    this.flags = new THREE.InstancedMesh(banner, this.bannerMat, MAX_FLAGS);
    this.poles = new THREE.InstancedMesh(pole, new THREE.MeshLambertMaterial({ color: "#d8d4c2" }), MAX_FLAGS);
    this.pennants = new THREE.InstancedMesh(new THREE.ConeGeometry(0.11, 0.22, 3).rotateX(Math.PI).translate(0, -0.11, 0),
      new THREE.MeshLambertMaterial({ color: "#ffffff" }), MAX_PENNANTS);
    const colours = ["#c8202a", "#f4f4f2"].map((c) => new THREE.Color(c));
    for (let k = 0; k < MAX_PENNANTS; k++) this.pennants.setColorAt(k, colours[k % 2]);
    this.strings = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#3a3a3a" }));
    for (const m of [this.flags, this.poles, this.pennants]) { m.count = 0; m.frustumCulled = false; m.castShadow = false; }
    this.strings.frustumCulled = false;
    this.juice = new FlagJuice(w.scene, { ground: (x, z) => w.map.ground(x, z), solo: () => w.solo() });
    w.scene.add(this.flags, this.poles, this.pennants, this.strings);
    if (!I) return;
    // every square of Bath inside the force field, the village's included
    const S = (this.size = I.cells * I.dx);
    this.x0 = I.x0; this.y0 = I.y0;
    const tis = I.tiles.map((t) => t[0]), tjs = I.tiles.map((t) => t[1]);
    for (let ti = Math.min(...tis) - 1; ti <= Math.max(...tis) + 1; ti++) {
      for (let tj = Math.min(...tjs) - 1; tj <= Math.max(...tjs) + 1; tj++) {
        const x = I.x0 + (ti + 0.5) * S, z = -(I.y0 + (tj + 0.5) * S);
        if (Math.hypot(x - w.map.fieldX, z - w.map.fieldZ) > w.map.field + S * 0.3) continue;
        this.index.set(`${ti},${tj}`, this.sqs.length);
        this.sqs.push({ ti, tj, x, z });
      }
    }
    this.next = this.sqs.map((s) => [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([a, b]) => this.index.get(`${s.ti + a},${s.tj + b}`)).filter((n): n is number => n !== undefined));
    this.L = new Float32Array(this.sqs.length);
    this.D = new Float32Array(this.sqs.length);
  }

  get on() { return this.sqs.length > 0; }

  /** Which square scene (x, z) is in, or -1. */
  squareAt(x: number, z: number) {
    if (!this.size) return -1;
    return this.index.get(`${Math.floor((x - this.x0) / this.size)},${Math.floor((-z - this.y0) / this.size)}`) ?? -1;
  }
  /** How flagged the square at (x, z) is, 0 to 1. */
  levelAt(x: number, z: number) { const s = this.squareAt(x, z); return s < 0 ? 0 : this.level(s); }
  /** How flagged square i is, with the flags shot down taken off. */
  private level(i: number) { return Math.max(0, this.L[i] - this.D[i]); }
  /** The meter: how much of Bath is flagged, 0 to 1. */
  get meter() { let t = 0; for (let i = 0; i < this.L.length; i++) t += this.level(i); return this.sqs.length ? t / this.sqs.length : 0; }

  // ---- the season, from the clock ---------------------------------------------------------------

  /** Where the Flag Lads would have got to by now this season, with nobody fighting them. */
  private fresh(season: number) {
    this.season = season;
    this.L.fill(0); this.D.fill(0);
    this.cleared.clear();
    this.freed = [];
    this.saved = this.decorated = false;
    this.chair = newChair(rng(hash("chair", season)));
    let h = hash("bunting", season);
    for (let k = 0; k < SEEDS && this.sqs.length; k++) {
      h = hash(h, k);
      this.L[h % this.sqs.length] = START;
    }
    const steps = Math.floor(Math.min(SEASON, Date.now() - season * SEASON) / 1000 / CATCH_UP);
    for (let k = 0; k < steps; k++) this.grow(CATCH_UP, new Set());
  }

  /** dt seconds of spreading. Squares with a player in them, and ones won back, hold. */
  private grow(dt: number, held: Set<number>) {
    const L = this.L, was = L.map((_, i) => this.level(i));
    for (const f of this.freed) held.add(f.sq);
    for (let i = 0; i < L.length; i++) {
      if (held.has(i)) continue;
      let v = L[i];
      if (v > 0) v += dt * GROW;
      let top = 0;
      for (const n of this.next[i]) top = Math.max(top, was[n]);
      if (top > TIPPING) v += (dt * SPREAD * (top - TIPPING)) / (1 - TIPPING);
      L[i] = Math.min(1, v);
    }
  }

  private isFree(sq: number) { return this.freed.some((f) => f.sq === sq); }

  // ---- lamps and flags ----------------------------------------------------------------------------

  private lampsOf(area: GameMap): Lamp[] {
    let out = this.lamps.get(area);
    if (out) return out;
    out = [];
    const tag = area.d.tile ? `${area.d.tile[0]}_${area.d.tile[1]}` : "v";
    let k = 0;
    for (const f of area.d.fx ?? []) {
      if (f[0] !== "lamp") continue;
      const id = `${tag}:${k++}`, x = +f[1], z = -f[2], sq = this.squareAt(x, z);
      // (the hash stirred through rng: on its own its top bits barely change from one lamp to the next)
      out.push({ id, x, z, g: +f[3] - area.z0, a: +f[4], sq, h: rng(hash("lamp", id))(), per: 0 });
    }
    // each square's lamps in a shuffled order: the first CAP of them (or all, in a square with
    // fewer) take turns to fly a flag as the square fills up, evenly, and the rest never do
    const bySq = new Map<number, Lamp[]>();
    for (const l of out) { const list = bySq.get(l.sq); if (list) list.push(l); else bySq.set(l.sq, [l]); }
    for (const list of bySq.values()) {
      list.sort((a, b) => a.h - b.h);
      const m = Math.min(list.length, CAP);
      list.forEach((l, k) => { l.h = k < m ? (k + 0.5) / m : 2; l.per = 1 / m; });
    }
    this.lamps.set(area, out);
    return out;
  }

  private lampsNear(x: number, z: number, r: number): Lamp[] {
    const out: Lamp[] = [];
    for (const area of [this.w.map, ...this.w.map.tilesNear(x, z, r)]) {
      for (const l of this.lampsOf(area)) if (Math.abs(l.x - x) < r && Math.abs(l.z - z) < r && Math.hypot(l.x - x, l.z - z) < r) out.push(l);
    }
    return out;
  }

  private flagged(l: Lamp) {
    return l.sq >= 0 && l.h < this.L[l.sq] && !this.cleared.has(l.id) && !this.pending.has(l.id);
  }

  /** Which way a lamp's flag turns: out the way its arm reaches, across the street. */
  private fly(l: Lamp) { return l.a - Math.PI / 2; }

  /** Where a lamp's banner hangs (its middle), for hitting it. */
  private bannerAt(l: Lamp) {
    const px = Math.cos(this.fly(l)), pz = -Math.sin(this.fly(l));
    return { x: l.x + px * 0.5, y: l.g + 4.1, z: l.z + pz * 0.5 };
  }

  /** Put the flags and bunting up round you. */
  private drawFlags(me: { x: number; z: number }) {
    const lamps = this.lampsNear(me.x, me.z, NEAR).filter((l) => this.flagged(l));
    lamps.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    this.shown = [];
    let n = 0;
    for (const l of lamps) {
      if (n >= MAX_FLAGS) break;
      q.setFromAxisAngle(up, this.fly(l));
      m4.compose(p.set(l.x, l.g + 4.42, l.z), q, one);
      this.flags.setMatrixAt(n, m4); this.poles.setMatrixAt(n, m4);
      this.shown.push({ id: l.id, ...this.bannerAt(l), a: this.fly(l) });
      n++;
    }
    this.flags.count = this.poles.count = n;
    this.flags.instanceMatrix.needsUpdate = this.poles.instanceMatrix.needsUpdate = true;
    // bunting strung from each lamp to the next one along, in squares that are mostly taken
    const pos: number[] = [];
    let k = 0;
    const done = new Set<string>(), dir = new THREE.Vector3();
    this.strands = [];
    for (const a of lamps) {
      if (this.L[a.sq] < 0.5 || Math.hypot(a.x - me.x, a.z - me.z) > 150) continue;
      let best: Lamp | null = null, bd = 40;
      for (const b of lamps) {
        if (b === a) continue;
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        if (d > 10 && d < bd && !done.has(`${b.id}>${a.id}`)) { bd = d; best = b; }
      }
      if (!best) continue;
      done.add(`${a.id}>${best.id}`);
      const key = `${a.id}>${best.id}`;
      const ya = a.g + 5.3, yb = best.g + 5.3, sag = Math.min(1.6, bd * 0.05), steps = Math.max(2, Math.round(bd / 0.75));
      this.strands.push({ key, ia: a.id, ib: best.id, ax: a.x, ay: ya, az: a.z, bx: best.x, by: yb, bz: best.z, sag });
      const at = (t: number) => [a.x + (best!.x - a.x) * t, ya + (yb - ya) * t - sag * 4 * t * (1 - t), a.z + (best!.z - a.z) * t];
      for (let s = 0; s < 8; s++) pos.push(...at(s / 8), ...at((s + 1) / 8));
      dir.set(best.x - a.x, 0, best.z - a.z).normalize();
      q.setFromAxisAngle(up, Math.atan2(dir.x, dir.z) + Math.PI / 2);
      for (let s = 1; s < steps && k < MAX_PENNANTS; s++) {
        const [x, y, z] = at(s / steps);
        m4.compose(p.set(x, y, z), q, one);
        this.pennants.setMatrixAt(k++, m4);
      }
    }
    this.pennants.count = k;
    this.pennants.instanceMatrix.needsUpdate = true;
    this.strings.geometry.dispose();
    this.strings.geometry = new THREE.BufferGeometry();
    this.strings.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  }

  /** The square you're in: how many flags are up in it, and where the nearest is. Shoot the last
   *  one (or win a pub back that takes the rest) and the square's cleared: I tell the host, who
   *  sets it to nothing, so it only fills up again if the squares next door are mostly flagged. */
  private lookRound(me: { x: number; z: number }) {
    const sq = this.squareAt(me.x, me.z), h = this.here;
    if (sq !== h.sq) { h.sq = sq; h.top = 0; }
    h.left = 0; h.near = null;
    if (sq < 0) return;
    for (const area of [this.w.map, ...this.w.map.tilesNear(me.x, me.z, this.size * 1.5)]) {
      for (const l of this.lampsOf(area)) {
        if (l.sq !== sq || !this.flagged(l)) continue;
        h.left++;
        const d = Math.hypot(l.x - me.x, l.z - me.z);
        if (!h.near || d < h.near.d) h.near = { x: l.x, z: l.z, d };
      }
    }
    h.top = Math.max(h.top, h.left);
    // only from someone who's just shot a flag here, so a newcomer's guess at the levels can't clear one
    if (h.left === 0 && h.top > 0 && this.L[sq] > 0 && this.claimed !== sq && this.shotSq === sq && this.onIt() && (this.heard || this.w.isHost)) {
      this.claimed = sq;
      this.celebrate();
      Yours.cleared(me.x, me.z, this.w.place());
      const msg = { k: "clr", sq };
      this.w.send(msg);
      this.onMessage(msg, this.w.selfId);
    }
    if (h.left > 0 && this.claimed === sq) this.claimed = -1;
  }

  private celebrate() {
    const me = this.w.me();
    this.juice.cleared(me.x, me.y + 1, me.z);
    const place = this.w.place();
    if (missionActive()) this.w.toast(`Square cleared! ${place}`, 3);
    else missionStage({ title: "Square cleared!", sub: place, colour: "#ff4a55", life: 3 });
  }

  /** The game's clock this frame: dips for a moment when you clear a square. */
  timeScale(dt: number) { return this.juice.timeScale(dt); }

  /** While you're on the job, the nearest flag flaps where you can hear it, from the side it's on. */
  private flap(me: { x: number; z: number; yaw?: number }, dt: number) {
    const n = this.here.near;
    if (!n || n.d > FLAP || !this.onIt() || (this.flapT -= dt) > 0) return;
    this.flapT = 1.6 + Math.random() * 0.8;
    const off = Math.atan2(n.x - me.x, -(n.z - me.z)) + (me.yaw ?? 0);
    SFX.flagFlap(n.d, Math.sin(off));
  }

  /** You've shot a flag lately, so you're after the rest. */
  private onIt() { return this.downs > 0 && performance.now() - this.tickAt < ON_IT * 1000; }

  /** The nearest flag a shot from o along unit vector d hits within maxDist. */
  hit(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): { id: string; dist: number; x: number; y: number; z: number; a: number } | null {
    let best: { id: string; dist: number; x: number; y: number; z: number; a: number } | null = null;
    for (const f of this.shown) {
      const ex = f.x - o.x, ey = f.y - o.y, ez = f.z - o.z, t = ex * d.x + ey * d.y + ez * d.z;
      if (t <= 0 || t > maxDist || (best && t > best.dist)) continue;
      const miss = Math.hypot(ex - d.x * t, ey - d.y * t, ez - d.z * t);
      if (miss < 0.42 && !this.cleared.has(f.id) && !this.pending.has(f.id)) best = { id: f.id, dist: t, x: f.x, y: f.y, z: f.z, a: f.a };
    }
    return best;
  }

  /** I shot a flag down: it tears and drops on every screen, the host counts it, and my count goes up. */
  shoot(f: { id: string; x: number; y: number; z: number; a: number }) {
    this.pending.set(f.id, performance.now());
    this.shotSq = this.squareAt(f.x, f.z);
    this.drop(f.x, f.y, f.z, f.a);
    this.flagT = 0;
    this.downs++;
    note("flags");
    this.tickAt = performance.now();
    if (this.downs === 1) this.w.toast(`Flag down! Shoot every flag in this square to clear it (${this.here.top || "a few"} up here). Ladder lads put them back: catch one and they stop for a bit`, 6);
    setTimeout(() => SFX.counterTick(), 120);
    this.juice.flag(f.x, f.y, f.z, this.w.trick());
    Yours.flagShot(f.x, f.z, this.w.place());
    const l = this.lampById(f.id);
    const msg = { k: "down", id: f.id, sq: l ? l.sq : -1, per: l ? l.per : 0 };
    this.w.send(msg);
    if (this.w.isHost) this.onMessage(msg, this.w.selfId);
  }

  /** A shot along a string of bunting: where it passes within reach, and how far away. */
  hitBunting(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): { key: string; dist: number } | null {
    let best: { key: string; dist: number } | null = null;
    for (const s of this.strands) {
      for (let k = 1; k < 12; k++) {
        const u = k / 12, ex = s.ax + (s.bx - s.ax) * u - o.x, ey = s.ay + (s.by - s.ay) * u - s.sag * 4 * u * (1 - u) - o.y, ez = s.az + (s.bz - s.az) * u - o.z;
        const t = ex * d.x + ey * d.y + ez * d.z;
        if (t <= 0 || t > maxDist || (best && t > best.dist)) continue;
        if (Math.hypot(ex - d.x * t, ey - d.y * t, ez - d.z * t) < 0.3) best = { key: s.key, dist: t };
      }
    }
    return best;
  }

  /** I shot a string of bunting down. It's a bonus for me and a show for everyone, and it tears the
   *  flags off the lamps at both ends, each shot like any other so the host's count still holds. */
  shootBunting(b: { key: string }) {
    const s = this.strands.find((q) => q.key === b.key);
    const at = this.takeDown(b.key);
    if (at) this.juice.bunting(at, this.w.trick());
    this.w.send({ k: "bun", key: b.key });
    if (!s) return;
    for (const id of [s.ia, s.ib]) {
      const f = this.shown.find((q) => q.id === id);
      if (f && !this.cleared.has(id) && !this.pending.has(id)) this.shoot(f);
    }
  }

  /** A string of bunting comes down, and its points flutter to the ground. It stays down while the
   *  flags at its ends do, and is strung again when they are put back and the square is mostly taken. */
  private takeDown(key: string): number[] | null {
    const s = this.strands.find((q) => q.key === key);
    this.flagT = 0;
    if (!s) return null;
    const at: number[] = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      at.push(s.ax + (s.bx - s.ax) * u, s.ay + (s.by - s.ay) * u - s.sag * 4 * u * (1 - u), s.az + (s.bz - s.az) * u);
    }
    return at;
  }

  /** A banner torn in two, each half fluttering down on its own. */
  private drop(x: number, y: number, z: number, a: number) {
    const me = this.w.me(), d = Math.hypot(x - me.x, y - me.y, z - me.z);
    if (d < 80) SFX.tear(d);
    const px = Math.cos(a), pz = -Math.sin(a), floor = this.w.map.ground(x, z) + 0.03;
    this.halves.forEach((geo, k) => {
      const side = k ? 1 : -1, m = new THREE.Mesh(geo, this.bannerMat);
      m.position.set(x + px * side * 0.2, y, z + pz * side * 0.2);
      m.rotation.y = a;
      this.w.scene.add(m);
      this.falling.push({ m, t: 0, vx: px * side * (0.6 + Math.random() * 0.6), vy: 1 + Math.random(), vz: pz * side * (0.6 + Math.random() * 0.6), ph: Math.random() * 6, spin: (Math.random() - 0.5) * 3, floor });
    });
  }

  // ---- the host: spreading, call-outs, crews and ladders --------------------------------------

  private hostUpdate(dt: number) {
    const now = Date.now(), season = Math.floor(now / SEASON);
    if (season !== this.season) {
      const had = this.season >= 0;
      for (const c of [...this.calls]) this.endCall(c, null);
      this.fresh(season);
      if (had) this.news("season");
      this.dirty = true;
    }
    const players = this.w.players(), alive = players.filter((p) => p.alive);
    const busy = alive.filter((p) => this.isBusy(p.id)), brew = !this.saved && busy.length > 0 && busy.length === alive.length;
    if (brew !== this.paused) { this.paused = brew; this.dirty = true; this.sendT = 0; }
    if (brew) for (const c of this.calls) if (!c.on) c.until += dt * 1000;
    if ((this.tickT -= dt) <= 0) {
      this.tickT = TICK;
      if (!this.saved && !brew) this.grow(TICK, new Set(alive.map((p) => this.squareAt(p.x, p.z))));
      // flags shot down in squares that have dropped below them don't need remembering
      for (const id of this.cleared) {
        const l = this.lampById(id);
        if (l && l.h >= this.L[l.sq]) { this.cleared.delete(id); this.D[l.sq] = Math.max(0, this.D[l.sq] - l.per); }
      }
      for (let i = 0; i < this.D.length; i++) this.D[i] = Math.min(this.D[i], this.L[i]);
      const m = this.meter;
      if (!this.saved && m < 0.002 && this.L.every((_, i) => this.level(i) < 0.01)) {
        this.saved = true;
        this.L.fill(0); this.D.fill(0);
        for (const c of [...this.calls]) this.endCall(c, null);
        this.news("saved");
      }
      if (!this.decorated && m > 0.99) { this.decorated = true; this.news("decorated"); }
      if (m < 0.9) this.decorated = false;
      this.dirty = true;
    }
    if (!this.chase && this.runnerPack) {
      // the old host left mid-chase: carry on from the chase he last told us
      this.chase = Chase.unpack(this.runnerPack, players.length < 2);
      if (this.chase) { this.chase.start(this.w.naughtyBoys); if (this.chase.up) this.w.naughtyBoys.surrender(this.chase.i, this.chase.gen); }
      this.runnerPack = null;
    }
    this.hostChase(dt);
    if (!this.saved && alive.length) {
      this.hostCalls(dt, alive, players.length, busy);
      if (!brew) this.hostLadders(dt, alive);
    }
    this.freeRounds(alive);
    this.sendT -= dt;
    if (this.sendT <= 0 || (this.dirty && this.sendT < SEND_EVERY - 0.5)) { this.sendT = SEND_EVERY; this.dirty = false; this.w.send(this.state()); }
  }

  private lampById(id: string): Lamp | undefined {
    const [tag, k] = id.split(":");
    let area: GameMap | undefined;
    if (tag === "v") area = this.w.map;
    else { const [ti, tj] = tag.split("_").map(Number); area = [...this.w.map.tiles.values()].find((m) => m.d.tile?.[0] === ti && m.d.tile?.[1] === tj); }
    return area ? this.lampsOf(area)[+k] : undefined;
  }

  /** Host: one takeover at a time, or two at once in a big room, so a crowd splits up. */
  private hostCalls(dt: number, alive: Target[], room: number, busy: Target[]) {
    const want = room >= TWO_CALLS ? 2 : 1, free = alive.filter((p) => !busy.includes(p));
    if (this.calls.length < want && free.length && (this.callT -= dt) <= 0) {
      this.callT = 30;   // try again soon if nowhere will do
      if (this.newCall(free, this.calls.length > 0)) this.callT = this.calls.length < want ? 45 : 240 + Math.random() * 120;
    }
    for (const c of [...this.calls]) this.hostCall(c, dt, alive, room);
  }

  /** Host: the Flag Lads take a pub, weighted to where they're strongest, away from any other takeover. */
  private newCall(alive: Target[], vice: boolean) {
    const pubs = this.w.pubs().map((p) => ({ ...p, sq: this.squareAt(p.x, p.z), d: Math.min(...alive.map((t) => Math.hypot(t.x - p.x, t.z - p.z))) }))
      .filter((p) => p.sq >= 0 && p.d > 120 && p.d < 1500 && !this.freed.some((f) => f.n === p.name)
        && !this.calls.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 600));
    if (!pubs.length) return false;
    const weight = (p: { sq: number }) => this.level(p.sq) + 0.05;
    let r = Math.random() * pubs.reduce((s, p) => s + weight(p), 0);
    const p = pubs.find((o) => (r -= weight(o)) <= 0) ?? pubs[0];
    this.calls.push({
      id: ++this.callN + Math.floor(Math.random() * 1e6) * 100, name: p.name, x: p.x, z: p.z, sq: p.sq,
      until: Date.now() + (180 + p.d / 3) * 1000, on: false, onAt: 0, vice, gazebo: null, crew: [], chair: null, deputy: null, awayT: 0, megaT: 30, left: -1, boss: 0,
      bar: 0, rate: 0, lads: [], ladT: 0, fled: false,
    });
    this.dirty = true;
    this.sendT = 0;
    return true;
  }

  private hostCall(c: Call, dt: number, alive: Target[], room: number) {
    const ch = this.w.naughtyBoys, near = Math.min(...alive.map((t) => Math.hypot(t.x - c.x, t.z - c.z)));
    if (c.on && !c.chair && !c.crew.length && !c.lads.length) c.on = false;   // we've just taken over as host: the crew comes again
    if (!c.on) {
      if (Date.now() > c.until) { this.endCall(c, false); return; }
      if (near < 140) this.bringCrew(c, room);
      return;
    }
    const chair = c.chair && ch.get(c.chair.i, c.chair.gen), deputy = c.deputy && ch.get(c.deputy.i, c.deputy.gen);
    // the Gaffer's protected while his right-hand man's up, or while he's under his gazebo
    if (chair && c.chair) {
      const under = c.gazebo && Math.hypot(chair.x - c.gazebo.x, chair.z - c.gazebo.z) < 3.2 ? 0.6 : 0;
      ch.setArmour(c.chair.i, c.chair.gen, Math.max(deputy ? 0.85 : 0, under));
    }
    // shouting through the megaphone brings more lads
    if (chair && !c.vice && this.chair.traits.includes("megaphone") && (c.megaT -= dt) <= 0) {
      c.megaT = 40;
      const at = clearSpot(this.w.map, c.x + (Math.random() - 0.5) * 50, c.z + (Math.random() - 0.5) * 50, 10);
      if (at) c.crew.push(...ch.bring(at[0], at[1], look(SOCIETY, Math.floor(Math.random() * 4)), 2, this.w.players(), undefined, 3));
      this.news("mega", { x: Math.round(chair.x), z: Math.round(chair.z), n: this.chair.name });
    }
    this.hostBanner(c, dt, room);
    if (!this.calls.includes(c)) return;
    // half his health gone and the Gaffer runs for it, leaving the lads to it
    if (chair && c.chair && !c.vice && !c.fled && !this.chase && chair.hp <= chair.top * RUNS_AT) this.startChase(c, c.chair);
    // the fight: the Gaffer down (or off) and the crew all but done wins it back; everyone wandering off loses it
    const lads = c.crew.filter((g) => ch.get(g.i, g.gen)).length, left = lads + (deputy ? 1 : 0), boss = chair ? (deputy ? 2 : 1) : 0;
    if (lads !== c.left || boss !== c.boss) { c.left = lads; c.boss = boss; this.dirty = true; }
    if (!chair && left <= 1) { this.endCall(c, true); return; }
    c.awayT = near > 400 ? c.awayT + dt : 0;
    if (c.awayT > 60) this.endCall(c, false);
  }

  /** Host: the lads on the ladder hang the banner while any of them is up; a lad shot off sets it back. */
  private hostBanner(c: Call, dt: number, room: number) {
    const ch = this.w.naughtyBoys;
    c.lads = c.lads.filter((l) => ch.get(l.i, l.gen));
    const want = this.ladderLads(room);
    if (c.lads.length < want && (c.ladT -= dt) <= 0) { c.ladT = LADDER_AGAIN; this.bringLadder(c); }
    const rate = c.lads.length / want / bannerSecs(room);
    if (Math.abs(rate - c.rate) > 1e-6) { c.rate = rate; this.dirty = true; }
    c.bar = Math.min(1, c.bar + rate * dt);
    if (c.bar >= 1) { this.news("hung", { n: c.name, x: Math.round(c.x), z: Math.round(c.z) }); this.endCall(c, false); }
  }

  /** More of them in the room, more lads up ladders: ground to cover, not tougher lads. */
  private ladderLads(room: number) { return Math.min(3, 1 + Math.floor((room - 1) / 2)); }

  /** Where the front of a pub is: the spot on the pavement outside, and the way out from the door. */
  private frontOf(c: Call) {
    const pub: { yaw?: number } = this.w.pubs().find((p) => p.name === c.name) ?? {};
    let ux = 0, uz = 1, d = 4;
    if (pub.yaw !== undefined) { ux = Math.sin(pub.yaw); uz = Math.cos(pub.yaw); }
    else {
      const s = streetSpot(this.w.map, c.x, c.z, 0, 40, 0.5);
      if (s) { const l = Math.hypot(s.x - c.x, s.z - c.z) || 1; ux = (s.x - c.x) / l; uz = (s.z - c.z) / l; d = Math.min(6, l); }
    }
    const at = clearSpot(this.w.map, c.x + ux * d, c.z + uz * d, 6) ?? [c.x, c.z];
    return { x: at[0], z: at[1], ux, uz, face: Math.atan2(-ux, -uz) };
  }

  /** Host: another lad goes up a ladder against the pub's front. */
  private bringLadder(c: Call) {
    const f = this.frontOf(c), k = c.lads.length, side = (k % 2 ? 1 : -1) * (1 + Math.floor(k / 2)) * 2.4;
    const g = this.w.naughtyBoys.bring(f.x + f.uz * side - f.ux * 0.8, f.z - f.ux * side - f.uz * 0.8, look(LADDER, Math.floor(Math.random() * 4)), 1, this.w.players(), undefined, 0, f.face)[0];
    if (!g) return;
    this.w.naughtyBoys.hold(g.i, g.gen);
    c.lads.push(g);
    this.dirty = true;
  }

  /** Host: the Gaffer has had half his health knocked off him, so he's off. */
  private startChase(c: Call, g: { i: number; gen: number }) {
    const at = this.w.naughtyBoys.get(g.i, g.gen);
    if (!at) return;
    const solo = this.w.players().length < 2, how = escapeBy(this.chair.traits, solo);
    this.chase = new Chase(g.i, g.gen, how, c.name, this.chair.name, this.chair.traits, c.x, c.z, solo);
    this.chase.start(this.w.naughtyBoys);
    this.w.naughtyBoys.setArmour(g.i, g.gen, 0);
    this.runner = { i: g.i, gen: g.gen, how, up: false, name: this.chair.name, pub: c.name };
    c.chair = null; c.fled = true;
    this.news("grun", { how, n: this.chair.name, pub: c.name, x: Math.round(at.x), z: Math.round(at.z) });
    this.dirty = true;
    this.sendT = 0;
  }

  /** Host: the chase, a tick at a time. */
  private hostChase(dt: number) {
    const chase = this.chase;
    if (!chase) return;
    const r = chase.step(dt, this.w.naughtyBoys, this.w.map, this.w.players());
    if (r === "up") {
      if (this.runner) this.runner.up = true;
      this.w.naughtyBoys.hands(chase.i, chase.gen, 1, "All right, all right! I give up!");
      this.news("gup", {});
      this.dirty = true;
    } else if (r === "away" || r === "gone") this.gafferAway();
  }

  /** Host: caught, by cuffs (E) or by being put down. */
  private gafferCaught(by: string, cuffed: boolean) {
    const chase = this.chase;
    if (!chase) return;
    const ch = this.w.naughtyBoys, at = ch.get(chase.i, chase.gen) ?? ch.at(chase.i) ?? { x: chase.x0, z: chase.z0 };
    if (cuffed) ch.hands(chase.i, chase.gen, 2, "It's a fair cop.");
    for (let j = 0; j < CAUGHT_PRIZES; j++) {
      const a = (j / CAUGHT_PRIZES) * Math.PI * 2;
      this.w.prize(at.x + Math.cos(a) * 2.2, at.z + Math.sin(a) * 2.2, j < 2);
    }
    ch.flee(chase.i, chase.gen, 1, false);
    ch.release(chase.i, chase.gen);
    this.news("gcu", { by, c: cuffed ? 1 : 0, n: chase.name, x: Math.round(at.x), z: Math.round(at.z) });
    this.endChase();
  }

  /** Host: he's got away: tomorrow's Wanted poster. */
  private gafferAway() {
    const chase = this.chase;
    if (!chase) return;
    this.w.naughtyBoys.flee(chase.i, chase.gen, 1, false);
    this.w.naughtyBoys.release(chase.i, chase.gen, true);
    this.gaffers.add({ name: chase.name, pub: chase.pub, x: chase.x0, z: chase.z0, how: chase.how });
    this.news("gaw", { n: chase.name, pub: chase.pub, x: Math.round(chase.x0), z: Math.round(chase.z0) });
    this.endChase();
  }

  private endChase() {
    this.chase = null; this.runner = null;
    this.dirty = true;
    this.sendT = 0;
  }

  /** Host: you're there: the crew and the Gaffer (or his cousin), sized to the room and to how
   *  much of Bath the Flag Lads hold, with whatever the Gaffer brings. */
  private bringCrew(c: Call, room: number) {
    const ch = this.w.naughtyBoys, players = this.w.players(), m = this.meter, chair = this.chair;
    const traits = c.vice ? [] : chair.traits;
    const n = Math.min(12, 1 + 2 * room + Math.round(3 * m) + (traits.includes("quorum") ? 3 : 0));
    const hp = Math.round((250 + 400 * m) * (0.6 + 0.4 * Math.min(room, 6)) * (1 + 0.25 * chair.wins) * (c.vice ? 0.6 : 1));
    // the fight is at the pub's front: the lads stood out on the pavement facing the street, the Gaffer among them
    const f = this.frontOf(c), at: [number, number] = [f.x, f.z];
    c.crew = [];
    for (let k = 0; k < n; k++) {
      const side = (k - (n - 1) / 2) * 1.9 + (Math.random() - 0.5), out = 1 + Math.random() * 3.5;
      c.crew.push(...ch.bring(f.x + f.uz * side + f.ux * out, f.z - f.ux * side + f.uz * out, look(SOCIETY, Math.floor(Math.random() * 4)), 1, players, undefined, 0, f.face));
    }
    if (!c.fled) c.chair = ch.bring(at[0] + f.ux * 2, at[1] + f.uz * 2, look(CHAIR, c.vice ? 2 : 0), 1, players, hp, 0, f.face)[0] ?? null;
    if (traits.includes("deputy") && !c.fled) c.deputy = ch.bring(at[0] + f.uz * 2, at[1] - f.ux * 2, look(CHAIR, 1), 1, players, Math.round(hp * 0.4), 0, f.face)[0] ?? null;
    c.lads = []; c.ladT = 0; c.bar = 0;
    for (let k = this.ladderLads(room); k > 0; k--) this.bringLadder(c);
    if (traits.includes("gazebo") && !c.fled) {
      const g = clearSpot(this.w.map, at[0] - 4, at[1], 8);
      if (g) { c.gazebo = { x: Math.round(g[0] * 10) / 10, z: Math.round(g[1] * 10) / 10 }; if (c.chair) ch.sendTo(c.chair.i, c.chair.gen, g[0], g[1]); }
    }
    c.on = true; c.onAt = Date.now();
    this.dirty = true;
    this.sendT = 0;
    // and a word from the Gaffer, who remembers
    const who = c.vice ? "The Gaffer's cousin" : `${chair.name}, the Gaffer`;
    const said = c.vice ? "The Gaffer couldn't make it. I'm in charge!"
      : chair.wins && chair.took ? `Back for more? I've already had ${chair.took} off you!`
      : chair.prev ? `You'll not do me like you did ${chair.prev}!`
      : "Right lads, a flag on every lamp post!";
    this.news("greet", { s: `${who}: "${said}"`, x: Math.round(at[0]), z: Math.round(at[1]) });
  }

  /** Host: a takeover's over. won: the pub's won back; false: the lads dug in; null: just gone. */
  private endCall(c: Call, won: boolean | null) {
    const k = this.calls.indexOf(c);
    if (k < 0) return;
    this.calls.splice(k, 1);
    for (const g of [...c.crew, ...c.lads, ...(c.chair ? [c.chair] : []), ...(c.deputy ? [c.deputy] : [])]) this.w.naughtyBoys.release(g.i, g.gen);
    if (c.fled && won === false && this.chase) { this.w.naughtyBoys.flee(this.chase.i, this.chase.gen, 1, false); this.w.naughtyBoys.release(this.chase.i, this.chase.gen, true); this.endChase(); }
    if (!this.calls.length) this.callT = 240 + Math.random() * 120;
    this.dirty = true;
    this.sendT = 0;
    if (won === null) return;
    const sq = c.sq, was = this.chair;
    // for the morning paper: who the Gaffer was, and how close it came
    const story = { x: Math.round(c.x), z: Math.round(c.z), g: c.vice ? "" : was.name, tr: c.vice ? [] : [...was.traits], v: c.vice ? 1 : 0,
      sp: c.onAt ? Math.max(0, Math.round((c.until - c.onAt) / 1000)) : 0, du: c.onAt ? Math.round((Date.now() - c.onAt) / 1000) : 0 };
    let line = "";
    if (won) {
      this.L[sq] = Math.max(0, this.L[sq] - WON);
      for (const n of this.next[sq]) this.L[n] = Math.max(0, this.L[n] - WON_NEXT);
      // closed down inside 90 seconds of the crew turning up: a bonus
      const quick = Date.now() - c.onAt < BONUS_SECS * 1000, n = quick ? 5 : 3;
      for (let j = 0; j < n; j++) { const a = (j / n) * Math.PI * 2; this.w.prize(c.x + Math.cos(a) * 2, c.z + Math.sin(a) * 2, j === 0 || (quick && j === 1)); }
      if (quick) this.news("quick");
      // the pub's won back for the day: a ride left outside, a free round now and then, and a quiet square
      this.freed.push({ n: c.name, x: c.x, z: c.z, sq, t: Date.now() });
      this.w.give(c.x - 2, c.z + 2, RIDES[Math.floor(Math.random() * (RIDES.length - 1))]);
      if (!c.vice) {
        this.chair = newChair(Math.random, was.name);
        line = `${was.name} has packed it in. ${this.chair.name} is the new Gaffer, and ${this.chair.traits.map((t) => TRAITS[t]).join(", and ")}`;
      }
    } else {
      this.L[sq] = Math.min(1, this.L[sq] + LOST);
      for (const n of this.next[sq]) this.L[n] = Math.min(1, this.L[n] + LOST_NEXT);
      this.freed = this.freed.filter((f) => f.sq !== sq);
      this.w.scar?.(c.x, c.z, c.name, c.vice ? "the Gaffer's cousin" : `${was.name}, the Gaffer`);
      if (!c.vice) {
        was.wins++; was.took = c.name;
        const gain = (Object.keys(TRAITS) as Trait[]).filter((t) => !was.traits.includes(t));
        if (gain.length && was.traits.length < 3) {
          const t = gain[Math.floor(Math.random() * gain.length)];
          was.traits.push(t);
          line = `${was.name} is getting cocky: now he ${TRAITS[t]}`;
        }
      }
    }
    const msg = { k: "out", won: won ? 1 : 0, name: c.name, line, ...story };
    this.w.send(msg);
    this.onMessage(msg, this.w.selfId);
  }

  /** Host: a pub won back leaves a round out for anyone who comes by. */
  private freeRounds(alive: Target[]) {
    const now = Date.now();
    for (const f of this.freed) {
      if (now - f.t < FREE_ROUND * 1000 || !alive.some((t) => Math.hypot(t.x - f.x, t.z - f.z) < 150)) continue;
      f.t = now;
      this.w.give(f.x + 1.5, f.z, "pint");
      this.w.give(f.x - 1.5, f.z, Math.random() < 0.5 ? "ammo" : "fizz");
    }
  }

  /** Host: ladder crews go and put back the flags you've shot down near you. */
  private hostLadders(dt: number, alive: Target[]) {
    const ch = this.w.naughtyBoys, near = (x: number, z: number, r: number) => alive.some((t) => Math.hypot(t.x - x, t.z - z) < r);
    for (let k = this.ladders.length - 1; k >= 0; k--) {
      const l = this.ladders[k], at = ch.get(l.i, l.gen);
      if (!at) { this.ladders.splice(k, 1); continue; }
      if (l.leaving) { if (!near(at.x, at.z, 80)) { ch.release(l.i, l.gen, true); this.ladders.splice(k, 1); } continue; }
      if (Math.hypot(at.x - l.x, at.z - l.z) > 1.8) { l.t = 0; continue; }
      if ((l.t += dt) < 4) continue;
      // up the ladder and the flag's back
      if (this.cleared.delete(l.id)) {
        this.dirty = true;
        const lamp = this.lampById(l.id);
        if (lamp) this.D[lamp.sq] = Math.max(0, this.D[lamp.sq] - lamp.per);
      }
      const next = this.cleared.size ? this.lampsNear(l.x, l.z, 100).find((o) => this.cleared.has(o.id) && !this.ladders.some((m) => m.id === o.id)) : undefined;
      if (next) { Object.assign(l, { id: next.id, ...this.foot(next), t: 0 }); ch.sendTo(l.i, l.gen, l.x, l.z); }
      else {
        l.leaving = true;
        const away = streetSpot(this.w.map, at.x, at.z, 120, 200, 0.6, (x, z) => !near(x, z, 90));
        if (away) ch.sendTo(l.i, l.gen, away.x, away.z, true); else { ch.release(l.i, l.gen, true); this.ladders.splice(k, 1); }
      }
    }
    if ((this.ladderT -= dt) > 0) return;
    this.ladderT = 100 - 60 * this.meter;
    if (this.ladders.length >= 3 || !this.cleared.size) return;
    const anchor = alive[Math.floor(Math.random() * alive.length)];
    const lamp = this.lampsNear(anchor.x, anchor.z, 180).find((o) => this.cleared.has(o.id) && !this.ladders.some((m) => m.id === o.id) && !this.isFree(o.sq) && !((this.lull.get(o.sq) ?? 0) > Date.now()));
    if (!lamp) return;
    this.sendCrew(lamp, alive);
  }

  /** Host: a ladder lad sets off for a lamp, from a street not far off that nobody is near. */
  private sendCrew(lamp: Lamp, alive: Target[]): { x: number; z: number } | null {
    const ch = this.w.naughtyBoys;
    const from = streetSpot(this.w.map, lamp.x, lamp.z, 40, 90, 0.6, (x, z) => !alive.some((t) => Math.hypot(t.x - x, t.z - z) < 35));
    if (!from) return null;
    const g = ch.bring(from.x, from.z, look(LADDER, Math.floor(Math.random() * 4)), 1, this.w.players())[0];
    if (!g) return null;
    const foot = this.foot(lamp);
    ch.sendTo(g.i, g.gen, foot.x, foot.z);
    this.ladders.push({ ...g, id: lamp.id, ...foot, t: 0, leaving: false });
    return foot;
  }

  /** Host: send a ladder crew to a lamp near (x, z), for a tip-off (nightout.ts); where they'll be, or null if there's nowhere. */
  crewNear(x: number, z: number): { x: number; z: number } | null {
    const alive = this.w.players().filter((p) => p.alive);
    const lamps = this.lampsNear(x, z, 500).filter((l) => l.sq >= 0 && Math.hypot(l.x - x, l.z - z) > 60 && !this.ladders.some((m) => m.id === l.id))
      .sort((a, b) => Number(this.cleared.has(b.id)) - Number(this.cleared.has(a.id)) || Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    for (const l of lamps.slice(0, 6)) { const at = this.sendCrew(l, alive); if (at) return at; }
    return null;
  }

  /** The square the Flag Lads are eyeing next: the most flagged one beside a square that's been cleared or won back. Its middle, or null if there's none. */
  eyeing(): { x: number; z: number } | null {
    let best = -1, top = 0.05;
    for (let i = 0; i < this.sqs.length; i++) {
      const lv = this.level(i);
      if (lv > top && this.next[i].some((n) => this.level(n) < 0.02 || this.isFree(n))) { top = lv; best = i; }
    }
    return best < 0 ? null : { x: this.sqs[best].x, z: this.sqs[best].z };
  }

  /** Where a ladder goes up a lamp: at its foot, on the street side. */
  private foot(l: Lamp) {
    const c = clearSpot(this.w.map, l.x + Math.sin(l.a) * 0.9, l.z + Math.cos(l.a) * 0.9, 3);
    return c ? { x: c[0], z: c[1] } : { x: l.x, z: l.z };
  }

  /** Host: something naughtyboys.ts runs went down. A ladder crew caught means no more ladders in that
   *  square for a while. (The call-outs check their own crews for themselves.) */
  naughtyBoyDown(i: number, _by: string) {
    if (this.chase?.i === i) { this.gafferCaught(_by, false); return; }
    for (const c of this.calls) {
      const j = c.lads.findIndex((l) => l.i === i);
      if (j < 0) continue;
      c.lads.splice(j, 1);
      c.bar = Math.max(0, c.bar - KNOCK_BACK);
      c.ladT = LADDER_AGAIN;
      this.dirty = true;
      this.sendT = 0;
      this.news("knock", { n: c.name, x: Math.round(c.x), z: Math.round(c.z) });
      return;
    }
    const k = this.ladders.findIndex((l) => l.i === i);
    if (k < 0) return;
    const l = this.ladders[k];
    this.lull.set(this.squareAt(l.x, l.z), Date.now() + LULL * 1000);
    this.ladders.splice(k, 1);
    this.news("ladder", { by: _by });
  }

  // ---- the network ----------------------------------------------------------------------------

  private state() {
    const cs = this.calls.map((c) => ({ id: c.id, n: c.name, x: Math.round(c.x), z: Math.round(c.z), u: c.until, on: c.on ? 1 : 0, a: c.onAt, v: c.vice ? 1 : 0, gz: c.gazebo ? [c.gazebo.x, c.gazebo.z] : 0, l: c.left, b: c.boss, bn: Math.round(c.bar * 1000), br: Math.round(c.rate * 100000), fl: c.fled ? 1 : 0 }));
    const g = this.runner;
    return {
      k: "s", pa: this.paused ? 1 : 0, se: this.season, sv: this.saved ? 1 : 0, L: [...this.L].map((v) => Math.round(v * 1000)), D: [...this.D].map((v) => Math.round(v * 10000)), cl: [...this.cleared],
      c: cs[0] ?? null, cs, fr: this.freed.map((f) => [f.n, Math.round(f.x), Math.round(f.z)]),
      chr: { n: this.chair.name, t: this.chair.traits, w: this.chair.wins },
      gf: this.chase ? this.chase.pack() : 0, gu: g?.up ? 1 : 0,
    };
  }

  private news(t: string, more: object = {}) {
    const msg = { k: "news", t, ...more };
    this.w.send(msg);
    this.onMessage(msg, this.w.selfId);
  }

  onMessage(d: any, from: string) {
    if (!d || typeof d !== "object" || !this.on) return;
    if (d.k === "busy") {
      if (from === this.w.selfId) return;
      if (d.b) this.busyAt.set(from, performance.now()); else this.busyAt.delete(from);
      return;
    }
    if (d.k === "s") {
      if (this.w.isHost && from !== this.w.selfId) return;
      if (!Array.isArray(d.L) || d.L.length !== this.L.length) return;
      this.heard = true;
      this.season = Number(d.se) || 0;
      this.saved = !!d.sv;
      this.paused = !!d.pa;
      d.L.forEach((v: number, i: number) => (this.L[i] = Math.max(0, Math.min(1, (Number(v) || 0) / 1000))));
      this.D.fill(0);
      if (Array.isArray(d.D) && d.D.length === this.D.length) d.D.forEach((v: number, i: number) => (this.D[i] = Math.max(0, Math.min(1, (Number(v) || 0) / 10000))));
      this.cleared = new Set(Array.isArray(d.cl) ? d.cl.map(String) : []);
      if (Array.isArray(d.fr)) this.freed = d.fr.map((f: any[]) => ({ n: String(f[0]), x: +f[1], z: +f[2], sq: this.squareAt(+f[1], +f[2]), t: 0 }));
      if (d.chr && typeof d.chr.n === "string") Object.assign(this.chair, { name: d.chr.n, traits: Array.isArray(d.chr.t) ? d.chr.t.filter((t: string) => t in TRAITS) : [], wins: +d.chr.w || 0 });
      this.setCalls(Array.isArray(d.cs) ? d.cs : d.c ? [d.c] : []);
      this.runnerPack = Array.isArray(d.gf) ? d.gf : null;
      const g = this.runnerPack as unknown[] | null;
      this.runner = g ? { i: Number(g[0]), gen: Number(g[1]), how: Number(g[2]) || 0, up: !!d.gu, name: String(g[8]), pub: String(g[7]) } : null;
      this.flagT = 0;
      return;
    }
    if (d.k === "down" && typeof d.id === "string") {
      if (from !== this.w.selfId) {
        Paper.flagBy(from);
        const f = this.shown.find((s) => s.id === d.id);
        if (f && !this.cleared.has(f.id)) this.drop(f.x, f.y, f.z, f.a);
        if (!this.w.isHost) this.cleared.add(d.id);
        this.flagT = 0;
      }
      if (this.w.isHost) {
        // the host may not have that square loaded: then it goes on the shooter's word for where it was
        const l = this.lampById(d.id), sq = l ? l.sq : Number.isInteger(d.sq) ? d.sq : -1, per = l ? l.per : Math.min(0.2, Math.max(0, +d.per || 0));
        if (sq >= 0 && sq < this.L.length && (!l || l.h < this.L[sq]) && !this.cleared.has(d.id)) {
          this.cleared.add(d.id);
          this.D[sq] = Math.min(this.L[sq], this.D[sq] + per);
          this.dirty = true;
        }
      }
      return;
    }
    if (d.k === "bun" && typeof d.key === "string" && d.key.length < 80) {
      if (from === this.w.selfId) return;
      const at = this.takeDown(d.key), me = this.w.me();
      if (at && Math.hypot(at[18] - me.x, at[20] - me.z) < 120) this.juice.fall(at, 2.3);
      return;
    }
    if (d.k === "clr" && Number.isInteger(d.sq) && d.sq >= 0 && d.sq < this.L.length) {
      if (this.w.isHost && this.L[d.sq] > 0) {
        this.L[d.sq] = this.D[d.sq] = 0;
        this.dirty = true;
        this.sendT = Math.min(this.sendT, 0.5);
        this.news("square", { sq: d.sq });
      }
      return;
    }
    if (d.k === "out") {
      SFX.jobDone(!!d.won);
      if (d.won) note("pub");
      if (Number.isFinite(+d.x) && Number.isFinite(+d.z)) {
        const me = this.w.me(), near = Math.hypot(+d.x - me.x, +d.z - me.z) < 250;
        Paper.pubOutcome({ won: !!d.won, pub: String(d.name ?? "the pub"), g: d.g ? String(d.g) : undefined, tr: Array.isArray(d.tr) ? d.tr.map(String) : [],
          sp: d.won && d.sp ? +d.sp : undefined, du: +d.du || 0, v: !!d.v, line: d.line ? String(d.line) : undefined }, +d.x, +d.z, me.x, me.z, near);
        if (d.won && near && me.alive) Yours.pubWon(String(d.name), +d.x, +d.z);
      }
      this.onEvent(d.won ? "won" : "lost", d);
      const name = esc(String(d.name ?? "the pub"));
      if (d.won) { this.w.toast(`${d.name} is won back! Flags down, everyone welcome. There's a ride outside, and the odd round on the house`, 5.5); this.w.feed(`<b style="color:${GREEN}">${name}</b> won back from the Flag Lads`); }
      else { this.w.toast(`Too slow: the Flag Lads keep ${d.name}, and the streets round it fill up with flags`, 4.5); this.w.feed(`The Flag Lads kept <b style="color:${PURPLE}">${name}</b>`); }
      if (d.line) setTimeout(() => this.w.feed(esc(String(d.line))), 1500);
      if (!this.w.isHost) this.setCalls(this.calls.filter((c) => c.name !== d.name).map((c) => ({ id: c.id, n: c.name, x: c.x, z: c.z, u: c.until, on: c.on ? 1 : 0, a: c.onAt, v: c.vice ? 1 : 0, gz: c.gazebo ? [c.gazebo.x, c.gazebo.z] : 0, l: c.left, b: c.boss, bn: Math.round(c.bar * 1000), br: Math.round(c.rate * 100000), fl: c.fled ? 1 : 0 })));
      return;
    }
    if (d.k === "fg") { this.gaffers.onMessage(d, from, this.w.selfId); return; }
    if (d.k === "gcf") {
      const chase = this.chase, p = this.w.players().find((q) => q.id === from), b = chase ? this.w.naughtyBoys.get(chase.i, chase.gen) : null;
      if (this.w.isHost && chase?.up && p?.alive && b && Math.hypot(p.x - b.x, p.z - b.z) < CUFF_REACH + 2) this.gafferCaught(from, true);
      return;
    }
    if (d.k === "news") {
      if (d.t === "saved" || d.t === "square") Paper.log({ k: d.t === "saved" ? "free" : "sq" }, d.t === "saved" ? "free" : `q|${d.sq}`);
      if (d.t === "saved") { SFX.jobDone(true); this.w.toast("Bath is flag-free! The Flag Lads have gone home till tomorrow", 6); }
      else if (d.t === "ladder") { if (d.by === this.w.selfId) note("ladder"); }
      if (d.t === "grun") this.gafferRuns(d);
      else if (d.t === "gup") {
        SFX.jobStep();
        if (this.runner) { this.runner.up = true; this.w.toast(`${this.runner.name} has given up! Get up close and cuff him (E)`, 4); }
      } else if (d.t === "gcu") {
        SFX.jobDone(true);
        const by = String(d.by ?? ""), who = by === this.w.selfId ? "You" : this.w.nameOf(by);
        this.w.toast(d.c ? `${who} cuffed ${d.n}! Bonus prizes` : `${who} put ${d.n} down! Bonus prizes`, 5);
        this.w.feed(`<b style="color:${GREEN}">${esc(String(d.n))}</b> caught by ${esc(who)}`);
        this.w.mark("@gaffer", null);
        this.onEvent(d.c ? "cuffed" : "down", d);
      } else if (d.t === "gaw") {
        SFX.jobStep();
        this.w.toast(`${d.n} has got away! He'll be tomorrow's Wanted poster`, 5);
        this.w.feed(`<b style="color:${PURPLE}">${esc(String(d.n))}</b> got away from ${esc(String(d.pub))}`);
        this.w.mark("@gaffer", null);
        this.onEvent("away", d);
      } else if (d.t === "knock") {
        const me = this.w.me();
        if (Math.hypot(+d.x - me.x, +d.z - me.z) < 250) this.w.toast("Lad shot off the ladder: the banner's set back!", 2.5);
      } else if (d.t === "hung") this.w.feed(`The Flag Lads have got their banner up at <b style="color:${PURPLE}">${esc(String(d.n))}</b>`);
      if (d.t === "ladder") this.w.toast("Ladder lad caught: no more flags going up round here for a bit", 3);
      else if (d.t === "quick") this.w.toast("Cleared out quickly: bonus prizes!", 3.5);
      else if (d.t === "square") {
        SFX.jobDone(true);
        const me = this.w.me();
        if (this.squareAt(me.x, me.z) === +d.sq) this.w.toast("Square cleared! Not a flag left round here, and it stays that way unless the streets next door fill up", 5);
        else this.w.feed(`A square of Bath is <b style="color:${GREEN}">flag-free</b> again`);
      }
      else if (d.t === "decorated") this.w.toast("There's a flag on every lamp post in Bath. Keep shooting them down", 5);
      else if (d.t === "season") this.w.toast("A new day: the Flag Lads are back, with more cable ties", 4);
      else if (d.t === "greet" || d.t === "mega") {
        const me = this.w.me(), dist = Math.hypot(+d.x - me.x, +d.z - me.z);
        if (dist < 200) SFX.megaphone(dist);
        if (d.t === "greet") { const s = String(d.s ?? ""); if (dist < 400) this.w.toast(s, 4); this.w.feed(esc(s)); }
        else if (dist < 250) this.w.toast(`${String(d.n)} is on the megaphone: more lads coming!`, 2.5);
      }
    }
  }

  /** The call-outs as the host says they are (on everyone else's screen). */
  private setCalls(list: any[]) {
    if (this.w.isHost) return;
    const out: Call[] = [];
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      const was = this.calls.find((o) => o.id === +c.id);
      if (!was) this.ring(String(c.n), +c.x, +c.z);
      out.push({
        id: +c.id, name: String(c.n), x: +c.x, z: +c.z, sq: this.squareAt(+c.x, +c.z), until: +c.u, on: !!c.on, onAt: +c.a || 0, vice: !!c.v,
        gazebo: Array.isArray(c.gz) ? { x: +c.gz[0], z: +c.gz[1] } : null, crew: [], chair: null, deputy: null, awayT: 0, megaT: 0,
        left: c.l === undefined ? -1 : +c.l, boss: +c.b || 0,
        bar: Math.max(0, Math.min(1, (+c.bn || 0) / 1000)), rate: (+c.br || 0) / 100000, lads: [], ladT: 0, fled: !!c.fl,
      });
    }
    this.calls = out;
  }

  /** The phone goes: a pub's been taken. */
  private ring(name: string, x: number, z: number) {
    SFX.phone();
    const me = this.w.me();
    this.w.toast(`The Flag Lads have taken over ${name}! Follow the purple marker and clear them out`, 5.5);
    this.w.feed(`📞 The Flag Lads have taken over <b style="color:${PURPLE}">${esc(name)}</b>, ${far(Math.hypot(x - me.x, z - me.z))} ${compassWord(x - me.x, z - me.z)}`);
  }

  /** The Gaffer legs it: say so, and put him on the map. */
  private gafferRuns(d: any) {
    SFX.megaphone(0);
    this.w.toast(`${d.n} legs it ${MOUNTS[+d.how] ?? MOUNTS[0]}! Get him before he's 400 m from ${d.pub}`, 5);
    this.w.feed(`<b style="color:${PURPLE}">${esc(String(d.n))}</b> is making a run for it ${MOUNTS[+d.how] ?? MOUNTS[0]}`);
  }

  /** E at the Gaffer with his hands up. */
  hint(): string {
    return this.cuffable() ? "<b>E</b> Cuff the Gaffer" : "";
  }
  private cuffable() {
    const g = this.runner, me = this.w.me();
    if (!g?.up || !me.alive) return false;
    const at = this.w.naughtyBoys.at(g.i);
    return !!at && at.alive && at.gen === g.gen && Math.hypot(at.x - me.x, at.z - me.z) < CUFF_REACH;
  }
  use(): boolean {
    if (!this.cuffable()) return false;
    const msg = { k: "gcf" };
    this.w.send(msg);
    if (this.w.isHost) this.onMessage(msg, this.w.selfId);
    return true;
  }

  /** The Gaffers who got away, for the noticeboards (quests.ts). */
  fugitives(): Fugitive[] { return this.gaffers.all(); }

  /** Someone joined: the host tells them how it stands. */
  joined(id: string) {
    if (this.w.isHost && this.on) this.w.send(this.state(), id);
    this.gaffers.joined(id);
  }

  /** The name on the boss bar for one of the Flag Lads' bosses, by their kit (0 the Gaffer, 1 his right-hand man, 2 his cousin). */
  bossName(kit: number) {
    return kit === 1 ? `${this.chair.name}'s right-hand man` : kit === 2 ? "The Gaffer's cousin" : `${this.chair.name}, the Gaffer`;
  }

  // ---- every frame ----------------------------------------------------------------------------

  private isBusy(id: string) {
    if (id === this.w.selfId) return this.w.busy();
    const at = this.busyAt.get(id);
    return at !== undefined && performance.now() - at < BUSY_FOR * 1000;
  }

  /** Tell the host when I start or stop being busy, and keep saying so while I am. */
  private tellBusy(dt: number) {
    const b = this.w.busy();
    if (b === this.busyWas && !(b && (this.busyT -= dt) <= 0)) return;
    this.busyWas = b;
    this.busyT = BUSY_FOR / 3;
    this.w.send({ k: "busy", b: b ? 1 : 0 });
  }

  update(dt: number) {
    if (!this.on) return;
    if (!this.w.isHost) this.paused = this.paused && this.w.busy();
    this.tellBusy(dt);
    if (this.season < 0 && (this.w.isHost || !this.heard)) this.fresh(Math.floor(Date.now() / SEASON));
    if (this.w.isHost) {
      const had = new Set(this.calls.map((c) => c.id));
      this.hostUpdate(dt);
      for (const c of this.calls) if (!had.has(c.id)) this.ring(c.name, c.x, c.z);
    }
    const me = this.w.me(), t = performance.now();
    for (const [id, at] of this.pending) if (t - at > 6000) this.pending.delete(id);
    if ((this.flagT -= dt) <= 0) { this.flagT = 0.5; this.drawFlags(me); this.lookRound(me); }
    this.flap(me, dt);
    this.juice.update(dt);
    // torn halves flutter down, lie a moment and go
    for (let k = this.falling.length - 1; k >= 0; k--) {
      const f = this.falling[k], m = f.m;
      f.t += dt;
      if (m.position.y > f.floor) {
        f.vy -= 9 * dt;
        const drag = Math.min(1, dt * 2.6);
        f.vx -= f.vx * drag; f.vy -= f.vy * drag; f.vz -= f.vz * drag;
        m.position.x += (f.vx + Math.sin(f.t * 3 + f.ph) * 0.6) * dt;
        m.position.y += f.vy * dt;
        m.position.z += (f.vz + Math.cos(f.t * 2.6 + f.ph) * 0.6) * dt;
        m.rotation.x = Math.sin(f.t * 9 + f.ph) * 0.7;
        m.rotation.z = Math.cos(f.t * 7 + f.ph) * 0.5;
        m.rotation.y += f.spin * dt;
        if (m.position.y <= f.floor) { m.position.y = f.floor; m.rotation.set(-Math.PI / 2, 0, f.ph); }
      }
      if (f.t > 6) { this.w.scene.remove(m); this.falling.splice(k, 1); }
    }
    // the call-outs: their markers
    for (let k = 0; k < 2; k++) {
      const c = this.calls[k], want = c ? c.id : -1;
      if (this.marked.get(k) === want) continue;
      this.marked.set(k, want);
      if (c) this.w.mark(CALL_ID + k, { x: c.x, z: c.z }, `Pub takeover: ${c.name}`, PURPLE);
      else this.w.mark(CALL_ID + k, null);
    }
    if (!this.w.isHost) for (const c of this.calls) if (c.on && c.rate > 0) c.bar = Math.min(1, c.bar + c.rate * dt);
    this.markRunner(dt);
    this.drawProps(me, t);
    this.hud(me);
  }

  /** The Gaffer on the run is on the map, a second at a time (moving a marker rebuilds it). */
  private markRunner(dt: number) {
    const g = this.runner;
    if ((this.runnerT -= dt) > 0) return;
    this.runnerT = 1;
    const at = g ? this.w.naughtyBoys.at(g.i) : null;
    if (g && at?.alive && at.gen === g.gen) this.w.mark("@gaffer", { x: at.x, z: at.z }, g.up ? `${g.name} (hands up: cuff him)` : `${g.name} (${MOUNTS[g.how]})`, PURPLE);
    else this.w.mark("@gaffer", null);
  }

  /** Outside the pubs near you: the flag and the Gaffer's gazebo where there's a takeover,
   *  and the welcome banner where one's been won back. */
  private drawProps(me: { x: number; z: number }, t: number) {
    const want = new Map<string, { x: number; z: number; free: boolean; gazebo: { x: number; z: number } | null; bar: number }>();
    for (const c of this.calls) if (Math.hypot(c.x - me.x, c.z - me.z) < 300) want.set(`c${c.id}:${c.gazebo ? 1 : 0}`, { x: c.x, z: c.z, free: false, gazebo: c.gazebo, bar: c.on ? c.bar : 1 });
    for (const f of this.freed) if (Math.hypot(f.x - me.x, f.z - me.z) < 300) want.set(`f${f.n}`, { x: f.x, z: f.z, free: true, gazebo: null, bar: 1 });
    for (const [key, g] of this.props) {
      if (want.has(key)) continue;
      this.w.scene.remove(g);
      g.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      this.props.delete(key);
    }
    for (const [key, p] of want) {
      let g = this.props.get(key);
      if (!g) {
        g = new THREE.Group();
        const at = clearSpot(this.w.map, p.x + 3, p.z, 6) ?? [p.x + 3, p.z];
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 6, 8), new THREE.MeshLambertMaterial({ color: "#d8d4c2" }));
        pole.position.set(at[0] - p.x, 3, at[1] - p.z);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), p.free ? this.freeMat : this.bannerMat);
        flag.position.set(at[0] - p.x + 1.15, 5.1, at[1] - p.z); flag.name = "flag";
        g.add(pole, flag);
        if (p.gazebo) g.add(gazebo(p.gazebo.x - p.x, p.gazebo.z - p.z, this.w.map.ground(p.gazebo.x, p.gazebo.z) - this.w.map.ground(p.x, p.z)));
        g.position.set(p.x, this.w.map.ground(p.x, p.z), p.z);
        this.props.set(key, g);
        this.w.scene.add(g);
      }
      const flag = g.getObjectByName("flag");
      if (flag) { flag.rotation.y = Math.sin(t / 700 + p.x) * 0.25; flag.scale.setScalar(0.35 + 0.65 * p.bar); }
    }
  }

  /** The meter under the minimap, the nearest call-out under it, and your count of flags down. */
  private hud(me: { x: number; z: number }) {
    this.bannerBar(me);
    const m = this.meter;
    const c = [...this.calls].sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
    let call = "";
    if (c) {
      const d = Math.hypot(c.x - me.x, c.z - me.z), pub = `<b>${esc(c.name)}</b>`;
      const bonus = Math.round(BONUS_SECS - (Date.now() - c.onAt) / 1000);
      if (c.on) {
        const boss = c.vice ? "his cousin" : "the Gaffer";
        const lads = c.left < 0 ? "" : c.left === 1 ? "1 lad left" : `${c.left} lads left`;
        const then = c.boss === 2 ? `his right-hand man first, then ${boss}` : c.boss === 1 ? (lads ? `then ${boss}` : boss) : lads ? "" : "nearly there";
        call = `Clear out ${pub}: ${[lads, then].filter(Boolean).join(", ")}${d > 60 ? ` · ${far(d)}` : ""}${bonus > 0 && c.onAt ? ` · bonus ${bonus}s` : ""}`;
      } else {
        const left = Math.max(0, Math.round((c.until - Date.now()) / 1000));
        call = `Pub takeover at ${pub} · ${far(d)} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}. Get there and clear them out`;
      }
      if (this.calls.length > 1) call += ` <span>(and ${esc(this.calls.find((o) => o !== c)!.name)})</span>`;
    }
    // the square you're in, takeover or not: how many of its flags are down (where the rest are is
    // for you to find: listen for them flapping)
    const h = this.here;
    let here = "";
    if (this.saved) here = "Bath is flag-free till tomorrow";
    else if (h.top && h.left) here = h.top === h.left ? `Shoot all <b>${h.top}</b> flags in this square to clear it` : `This square: <b>${h.top - h.left}/${h.top}</b> flags down`;
    else if (h.top) here = "This square's clear of flags";
    else if (!c) here = "No flags in this square: head for the red on the map";
    call = [call, here].filter(Boolean).map((s) => `<em>${s}</em>`).join("");
    const pct = Math.round(m * 100);
    const downs = this.downs ? `<span class="downs">${this.downs} down</span>` : "";
    const html = `<div class="label">Flags up <b>${pct}%</b>${downs}</div><div class="bar"><div style="width:${Math.max(pct, m > 0 ? 1 : 0)}%"></div></div>${call}`;
    show($("bunting"), html);
    // it comes up while you're in a square with flags up, while there's a takeover on, or for a
    // minute after you've shot a flag down; the rest of the time it's in today's jobs (daily.ts), under Tab.
    // Never while you're on a job: the job's own panel has the screen then
    $("bunting").hidden = this.w.busy() || !this.calls.length && !this.onIt() && !(this.here.left > 0 && !this.saved);
    $("bunting").classList.toggle("tick", performance.now() - this.tickAt < 220);
  }

  /** The bar across the top while the lads are hanging a banner on a pub near you: full and it's lost. */
  private bannerBar(me: { x: number; z: number }) {
    let c: Call | undefined;
    for (const o of this.calls) if (o.on && Math.hypot(o.x - me.x, o.z - me.z) < 400 && (!c || Math.hypot(o.x - me.x, o.z - me.z) < Math.hypot(c.x - me.x, c.z - me.z))) c = o;
    const el = $("banner");
    if (!c || !this.on) { if (!el.hidden) el.hidden = true; return; }
    const pct = Math.round(c.bar * 100), up = Math.round(c.rate * bannerSecs(Math.max(1, this.w.players().length)) * this.ladderLads(Math.max(1, this.w.players().length)));
    const says = c.rate > 0 ? "Shoot the lads on the ladder to knock it back" : "No one on the ladder: finish the lads before the next one goes up";
    show(el, `<div class="label">Banner going up at <b>${esc(c.name)}</b>${up ? ` · ${up} on the ladder` : ""}</div><div class="bar"><div style="width:${pct}%"></div></div><em>${pct >= 70 ? "Nearly up! " : ""}${says}</em>`, !this.w.busy());
    el.classList.toggle("late", c.bar > 0.7);
  }

  /** How the Flag Lads are doing, for today's jobs (daily.ts): a line or two of html. */
  status(): string {
    if (!this.on) return "";
    const me = this.w.me(), pct = Math.round(this.meter * 100);
    const c = [...this.calls].sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
    // the Chronicle's headline over the story (today's jobs panel prints it as the front page)
    const hl = this.saved ? "City declared flag-free" : c ? `Flag Lads seize ${esc(c.name)}`
      : pct >= 60 ? "Flag Lads tighten grip on city" : pct >= 25 ? `Bunting row as lads flag ${pct}% of Bath` : "Flag Lads on the back foot";
    const head = this.saved ? "<b>The Flag Lads</b>: Bath is flag-free till tomorrow"
      : `<b>The Flag Lads</b> have flagged <b class="pct">${pct}%</b> of Bath. Shoot every flag off the lamp posts in a square to clear it, and win their pubs back to knock out loads at once`;
    const gaffer = this.saved ? "" : `<small>The Gaffer is ${esc(this.chair.name)}, who ${this.chair.traits.map((t) => esc(TRAITS[t])).join(" and ")}${this.freed.length ? ` · won back today: ${this.freed.map((f) => esc(f.n)).join(", ")}` : ""}</small>`;
    const now = c ? `<small class="now">Right now they've taken over <b>${esc(c.name)}</b>, ${far(Math.hypot(c.x - me.x, c.z - me.z))} ${compassWord(c.x - me.x, c.z - me.z)}: follow the purple marker</small>` : "";
    return `<h3 class="hl">${hl}</h3>` + head + now + gaffer;
  }

  /** The squares for the maps, tinted by how flagged they are (scene coordinates). */
  tint(): { x0: number; z0: number; s: number; a: number; free?: boolean }[] {
    const out: { x0: number; z0: number; s: number; a: number; free?: boolean }[] = [];
    this.sqs.forEach((q, i) => {
      const free = this.isFree(i);
      const a = this.level(i);
      if (a > 0.02 || free) out.push({ x0: q.x - this.size / 2, z0: q.z - this.size / 2, s: this.size, a, free });
    });
    return out;
  }

  dispose() {
    this.juice.dispose();
    for (let k = 0; k < 2; k++) this.w.mark(CALL_ID + k, null);
    for (const o of [this.flags, this.poles, this.pennants, this.strings, ...this.falling.map((f) => f.m), ...this.props.values()]) this.w.scene.remove(o);
  }
}

/** The Gaffer's pop-up gazebo: four poles and a red and white roof, at (x, z) from the pub, y up from it. */
function gazebo(x: number, z: number, y: number) {
  const g = new THREE.Group(), pole = new THREE.MeshLambertMaterial({ color: "#e8e6e0" });
  for (const [a, b] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), pole);
    p.position.set(a, 1.1, b);
    g.add(p);
  }
  const c = document.createElement("canvas");
  c.width = 64; c.height = 8;
  const x2 = c.getContext("2d")!;
  for (let k = 0; k < 8; k++) { x2.fillStyle = k % 2 ? "#f4f4f2" : "#c8202a"; x2.fillRect(k * 8, 0, 8, 8); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 0.9, 4, 1, true), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  roof.rotation.y = Math.PI / 4; roof.position.y = 2.65;
  g.add(roof);
  g.position.set(x, y, z);
  return g;
}
