// The flag invasion: the Flag Lads are out to cable-tie an England flag to every lamp post in Bath,
// whether Bath likes it or not. They're made up, and the joke is on them: on the flag-planting,
// the "taking our streets back", and the "I'm not being funny, but..." that's never far behind it,
// not on the flag itself, and not on who anybody is. When you win a pub back it flies a banner that
// says everyone's welcome.
//
// The flags go up in clusters: five to fifteen of them on neighbouring lamp posts along one street
// (flagroads.ts), never scattered about, so you find them by finding the right street. There are
// never more than MAX_UP on the whole map, so two flags are 1%, and the meter under the minimap
// ("Flags up: 27%") is how many are up out of that; shoot two and it drops a point on your screen
// at once, before the host's word comes back. It only comes up during a takeover, near a cluster or
// just after you've shot a flag; the rest of the time how the Flag Lads are doing is in today's jobs
// (daily.ts, status() here), under Tab. The big map and the minimap show each cluster as a soft red
// blob about a street across, a little off its middle, so it tells you which streets to try rather
// than which lamp. Bunting is strung from each flag to the next along the street. The Flag Lads don't
// hang about the streets: they only turn up at the pubs they've taken over (below), and their ladder
// lads only to put flags back, on the lamps of a cluster's street, and they run from you rather than
// fight. Every so often a new cluster goes up, on a street near the others or somewhere quiet,
// nowhere near anyone playing. Shoot every flag in a cluster and it goes, with a little confetti;
// nothing is kept of streets cleared, as the prize is the whole map. The
// panel counts the cluster you're nearest, and while you're at it the nearest flag left flaps where
// you can hear it, but you have to go and find it.
//
// Every few minutes the phone goes: the Flag Lads have taken over a pub. A purple marker goes up on
// it; get there and clear out the lads and the Gaffer to win it back (the clusters round it come
// down, and there are prizes). You can't pick it on the big map and go straight there (pubmap.ts):
// you have to get there yourself. No new flags go up near it while it's on. The crew grows with the
// room, and a big room gets two takeovers at once (the second under the Gaffer's cousin). There's one
// Gaffer at a time, with a name and a trait or two (a gazebo, a megaphone, a right-hand man, the whole
// WhatsApp group), who remembers how it went: win and he comes back with another trait; lose and he
// packs it in for the next one. A pub the lads keep gets their "WE RUN THIS" banner outside, signed,
// till someone tears it down or the day's out (scars.ts), and ten to fifteen flags go up in a
// cluster or two on its street and the streets running into it (making room, if the map's full,
// by taking down their oldest lot elsewhere).
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
// A pub won back flies the welcome banner, leaves a ride and the odd free round out, and no flags go
// up near it for the rest of the day; any of the crew still standing, his right-hand man too, leg it.
// A boss's bar only shows while he's still to be beaten: once the Gaffer has run he's out of his
// pub's fight, so cuffed, put down or got away there's no bar for him while the lads are cleared.
// The lads that count are the ones at the pub's front: one who's wandered off (after a chase, say)
// and is after nobody is called back at a run, and if he's not back in 25 seconds (stuck the far side
// of a wall, or lost) he legs it, so the win never waits on a lad nobody can find. Shoot the last flag on the map and a card says the place (by
// the map's own name) is safe from the Flag Lads, and none go up for QUIET_DAYS days. Each day (a
// "season" in the code, from midnight GMT) the Flag Lads start again with a few new clusters.
//
// The fun of shooting them (flagjuice.ts) is yours alone: a combo for flags shot within four
// seconds of each other, a string of bunting that comes down if you shoot along it (a bonus, and
// it tears down the flags at both ends too, each counted as a flag you shot, so one string can be a
// combo of three; it's strung again once both are put back, and the "bun" message that shows it
// falling is ignored by older pages), confetti and a moment of slow-motion when you clear a street,
// and a callout for shots from a ride or mid-grind.
//
// The flags you shoot are kept as yours (yours.ts), counted on the big map,
// and the day's pubs, with the Gaffer and how close each one came, go into tomorrow's paper (paper.ts). The "out" message
// carries those extras; older pages ignore them.
//
// They never take a pub within 230 m of a nursery or primary school's grounds, put a flag within
// 200 m of one, or send a ladder lad there (safezones.ts).
//
// The Flag Lads hold off while the room is busy: when every player still up is on a job, a race,
// the bonfire or any other mission panel, the host stops new clusters, the ladder lads, new takeover
// calls and the dig-in clocks of takeovers already running (they're pushed back by the time lost),
// so doing a race never costs you ground. Alone, being busy is enough. If only some are busy it all
// carries on, so the others can defend, but nobody mid-job is the one a new takeover is called in
// to. Each player says when they start or stop being busy (and every few seconds while they are) in
// a "busy" message through "bv"; the host forgets anyone it hasn't heard from for a while, and sends
// "pa" in its state so everyone's meter can say so. Older pages ignore all of it.
//
// Who decides what: where the Flag Lads start each season, and how many clusters they would have put
// up by now with nobody fighting them, comes from the clock, the map's streets and the zones open
// (zones.ts: they only go where you can get to), so every screen works out the same clusters and a room started any time picks up where the season should be. After
// that the host runs it (new clusters, the takeovers, the crews and the ladders, the Gaffer and the
// pubs won back, through naughtyboys.ts) and sends everyone the clusters as "bv" every few seconds:
// each as [id, road, metres along its street, flags, seed, a bit for each flag down, the pub], with
// the takeovers (with how many lads are left, whether his right-hand man is, how far the banner has got and how fast it is
// filling, which everyone draws climbing in between), the Gaffer, the chase if he is on the run (so
// a new host carries on from it), the pubs won back, and the season the Flag Lads come back in if
// the map's been made safe ("qt", kept on every device too, so it holds over a reload or a new
// host). Older pages find none of the squares they expect in it and ignore it. The Gaffers who got
// away go round on their own as "fg". Cuffing him is asked of the host ("gcf"). Whoever shoots a flag
// down tells everyone at once ("down", with the cluster and the flag), so it drops on every screen;
// the host counts it, and clears the street when its last flag is down. The games list (gameslist.ts)
// can have the host call a takeover at a pub of its choosing, there and then, and so can Retry on a
// lost takeover's card ("again", with the pub, to the host; older pages ignore it).
// The night out (nightout.ts) listens in: it is told, on every screen, when a pub is won or lost and
// when the Gaffer is caught or gets away, and it can ask the host which street the lads are eyeing
// next (which is then where their next cluster goes) and to send a ladder crew somewhere. Nothing of
// that goes over the network from here.
import * as THREE from "three";
import * as SFX from "./audio";
import { CHAIR, LADDER, MOUNTS, SOCIETY, look, type NaughtyBoys, type Target } from "./naughtyboys";
import { Chase, Fugitives, escapeBy, RUNS_AT } from "./gaffer";
import { clearSpot, streetSpot } from "./haunts";
import { FlagRoads, SPACING, type Spot } from "./flagroads";
import type { Blob } from "./minimap";
import { inSafeZone } from "./safezones";
import type { GameMap } from "./map";
import type { Kind } from "./pickups";
import { compassWord, esc, far, hash, rng, type Fugitive } from "./quests";
import { RIDES } from "./rides";
import { note } from "./daily";
import { setHidden, show } from "./show";
import { FlagJuice } from "./flagjuice";
import { missionBegin, missionResult, missionStackReady } from "./missionscreens";
import * as Paper from "./paper";
import * as Yours from "./yours";
import { guide, named } from "./notice";

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
  toast(text: string): void;
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
  /** I'm mid-job, race or minigame. */
  busy(): boolean;
  /** The street or place I'm in. */
  place(): string;
  /** The map's own name for the place ("Bath", "Cape Town"). */
  town(): string;
  /** Which map this is, for what this device remembers of it. */
  readonly mapId: string;
}

const SEASON = 24 * 3600 * 1000;   // ms: each day the Flag Lads start again
const TICK = 10;                   // seconds between the host's looks at how it's going
const GROW_EVERY = 2400;           // seconds between new clusters, where nobody's stopping them
const SEEDS = 3;                   // clusters the Flag Lads start each season with
const MAX_UP = 200;                // flags on the whole map at most: two flags are 1% on the meter
const FEW = 5, MANY = 15;          // flags in a cluster
const LOST_FEW = 10, LOST_MANY = 15;   // flags put up on a lost pub's streets
const QUIET_DAYS = 3;              // seasons with no flags once the map's been made safe
const WON_REACH = 300;             // a pub won back takes down the clusters this close, and none goes up there again today
const APART = 60;                  // metres a new cluster's flags keep from any other cluster's
const STREET = 150;                // metres: the panel counts the nearest cluster this close
const NEAR = 220;                  // flags are drawn (and can be shot) this close
const MAX_FLAGS = 400, MAX_PENNANTS = 1600;
const PURPLE = "#b45cff", GREEN = "#4fd18b";
const CALL_ID = "@bunting";
const BONUS_SECS = 90;             // clear a pub this quickly for extra prizes
const LULL = 180;                  // seconds a cluster gets no ladder crews after you catch one there
const FREE_ROUND = 120;            // seconds between the free rounds left out at a pub won back
const TWO_CALLS = 5;               // this many in the room and the Flag Lads take two pubs at once
const SEND_EVERY = 4;              // seconds between the host's updates
const BUSY_FOR = 15;               // seconds a "busy" word holds without another
const ON_IT = 60;                  // seconds after you shoot a flag that the panel stays up and the flapping helps you find the rest
const FLAP = 35;                   // metres: you hear the nearest flag flapping from this close
const BANNER_SECS = 150;           // alone, the lads need this long on the ladder to get the banner up
const BANNER_FASTER = 0.2;         // and each other player in the room makes it this much quicker
const BANNER_FLOOR = 55;           // but never quicker than this
const FIGHT_REACH = 200;           // metres from a takeover's pub its bosses still count as in the fight
const KNOCK_BACK = 0.25;           // a lad shot off the ladder sets the banner back this much
const LADDER_AGAIN = 15;           // seconds before another lad goes up the ladder
const CUFF_REACH = 3;              // close enough to cuff the Gaffer
const MUSTER = 20;                 // metres from the pub's front: a lad further off than that, and after nobody, has wandered off
const CALL_BACK = 3;               // seconds wandered off before he's called back to the front, at a run
const STRAY_FOR = 25;              // and not back by then, he's had enough and legs it
const CAUGHT_PRIZES = 4;           // for the Gaffer caught: this many on the ground, two of the better sort
const $ = (id: string) => document.getElementById(id)!;

/** A cluster: n flags on neighbouring lamps along one street (flagroads.ts), the same on every screen.
 *  r: the road, a: metres along its street to the first flag, seed: which side the first is on,
 *  down: a bit for each flag shot down, pub: the pub whose streets they took, if that's how it went up.
 *  The rest is worked out here: its middle and reach, the street's name, and where its flags go. */
interface Cluster {
  id: number; r: number; a: number; n: number; seed: number; down: number; pub: string;
  x: number; z: number; half: number; name: string;
  raw: { x: number; z: number; a: number }[]; placed: Spot[] | null; stamp: string;
}

const bits = (v: number) => { let n = 0; for (; v; v &= v - 1) n++; return n; };
const quietKey = (map: string) => `cd-flagfree:${map}`;
/** The season the Flag Lads come back in after this map was last made safe, as this device remembers it. */
function readQuiet(map: string) { try { return Number(localStorage.getItem(quietKey(map))) || 0; } catch { return 0; } }
function keepQuiet(map: string, till: number) {
  try { if (till > readQuiet(map)) localStorage.setItem(quietKey(map), String(till)); } catch { /* storage may be blocked */ }
}

/** The takeover: a pub the Flag Lads have taken. Host only: the crew they sent, and (for everyone) how many are left. */
interface Call {
  id: number; name: string; x: number; z: number;
  until: number;                   // ms since 1970: the lads dig in then, unless you've turned up
  on: boolean;                     // the crew's there, and the fight's on
  onAt: number;                    // when they turned up (ms): clear it quickly for a bonus
  vice: boolean;                   // the second takeover at once, run by the Gaffer's cousin
  gazebo: { x: number; z: number } | null;
  crew: Lad[]; chair: { i: number; gen: number } | null; deputy: Lad | null;
  dep: boolean;                    // his right-hand man is still up (with the Gaffer or not)
  front?: Front;                   // host: where the fight is
  awayT: number; megaT: number;
  left: number;                    // lads still up, not counting the bosses (-1: not known yet)
  boss: number;                    // 0 the Gaffer's down, 1 he's up, 2 he's up and his right-hand man too
  bar: number;                     // the banner the lads are hanging, 0 to 1: full and the pub's lost
  rate: number;                    // how fast it's filling just now, per second (everyone draws it climbing between updates)
  lads: { i: number; gen: number }[]; ladT: number;   // host: the lads on the ladder, and when the next goes up
  fled: boolean;                   // the Gaffer has run for it (gaffer.ts)
}

/** One of a takeover's crew, host only: out is how long he's been wandered off from the front. */
interface Lad { i: number; gen: number; out?: number }
type Front = { x: number; z: number; ux: number; uz: number; face: number };

/** Where the Gaffer is on the run, as everyone is told: who, how he's travelling and whether he has his hands up. */
interface Runner { i: number; gen: number; how: number; up: boolean; name: string; pub: string }

/** A takeover as the host sends it round. dp (his right-hand man up, Gaffer or no Gaffer) is new: older pages ignore it. */
const packCall = (c: Call) => ({ id: c.id, n: c.name, x: Math.round(c.x), z: Math.round(c.z), u: c.until, on: c.on ? 1 : 0, a: c.onAt, v: c.vice ? 1 : 0,
  gz: c.gazebo ? [c.gazebo.x, c.gazebo.z] : 0, l: c.left, b: c.boss, dp: c.dep ? 1 : 0, bn: Math.round(c.bar * 1000), br: Math.round(c.rate * 100000), fl: c.fled ? 1 : 0 });

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
  private roads: FlagRoads | null = null;
  private clusters: Cluster[] = [];
  private clusterN = 0;
  private growT = GROW_EVERY;                      // host: seconds till the next cluster goes up
  private plan: { r: number; a: number; n: number; seed: number } | null = null;   // host: the street they're eyeing next, once someone's found out
  private pending = new Map<string, number>();     // flags I shot down, till the host's word catches up
  private season = -1;
  private saved = false;                           // the map's been made safe: nothing more till quietTill
  private quietTill = 0;                           // the season the Flag Lads come back in
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
  private freed: { n: string; x: number; z: number; t: number }[] = [];   // pubs won back this season
  private ladders: { i: number; gen: number; id: string; x: number; z: number; t: number; leaving: boolean }[] = [];
  private ladderT = 60;
  private lull = new Map<number, number>();        // host: clusters with no ladder crews till then (ms)
  private tickT = 0; private sendT = 0; private dirty = false;
  private flagT = 0;
  /** A pub won or lost, the Gaffer cuffed, put down or away (nightout.ts): d is the message that said so. */
  onEvent: (what: "won" | "lost" | "cuffed" | "down" | "away", d: any) => void = () => {};
  private downs = 0;                               // flags I've had down this game
  // the cluster you're nearest: its flags, how many are left, the nearest one
  private here: { c: Cluster | null; top: number; left: number; near: { x: number; z: number; d: number } | null } = { c: null, top: 0, left: 0, near: null };
  private flapT = 0;
  private tickAt = 0;
  private blobs: Blob[] = []; private blobKey = "";
  // drawn
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
    // the flags' poles, and stood on end, the lads' own posts where a street has no lamp: one mesh
    this.poles = new THREE.InstancedMesh(pole, new THREE.MeshLambertMaterial({ color: "#d8d4c2" }), MAX_FLAGS * 2);
    this.pennants = new THREE.InstancedMesh(new THREE.ConeGeometry(0.11, 0.22, 3).rotateX(Math.PI).translate(0, -0.11, 0),
      new THREE.MeshLambertMaterial({ color: "#ffffff" }), MAX_PENNANTS);
    const colours = ["#c8202a", "#f4f4f2"].map((c) => new THREE.Color(c));
    for (let k = 0; k < MAX_PENNANTS; k++) this.pennants.setColorAt(k, colours[k % 2]);
    this.strings = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#3a3a3a" }));
    for (const m of [this.flags, this.poles, this.pennants]) { m.count = 0; m.frustumCulled = false; m.castShadow = false; }
    this.strings.frustumCulled = false;
    this.juice = new FlagJuice(w.scene, { ground: (x, z) => w.map.ground(x, z), solo: () => w.solo() });
    w.scene.add(this.flags, this.poles, this.pennants, this.strings);
    const roads = new FlagRoads(w.map);
    if (roads.usable.length) this.roads = roads;
    this.quietTill = readQuiet(w.mapId);
  }

  get on() { return !!this.roads; }
  /** The pub whose takeover is being fought within r metres of (x, z), if there is one. */
  fightNear(x: number, z: number, r: number): string | null {
    return this.calls.find((c) => c.on && Math.hypot(c.x - x, c.z - z) < r)?.name ?? null;
  }
  /** The Flag Lads have taken this pub over just now. */
  takenOver(name: string) { return this.calls.some((c) => c.name === name); }

  private isUp(c: Cluster, j: number) { return !((c.down >> j) & 1) && !this.pending.has(`${c.id}:${j}`); }
  /** Flags up in a cluster, as this screen has them (my own shots counted straight away). */
  private upIn(c: Cluster) { let t = 0; for (let j = 0; j < c.n; j++) if (this.isUp(c, j)) t++; return t; }
  /** Host: flags up on the whole map. */
  private get total() { let t = 0; for (const c of this.clusters) t += c.n - bits(c.down); return t; }
  /** Flags up on the whole map, as this screen has them. */
  private get up() { let t = 0; for (const c of this.clusters) t += this.upIn(c); return t; }
  /** The meter: how many of the most flags there can be are up, 0 to 1. */
  get meter() { return Math.min(1, this.up / MAX_UP); }
  /** Flags up on the clusters within r metres of (x, z). */
  flagsAround(x: number, z: number, r = 400) { let t = 0; for (const c of this.clusters) if (Math.hypot(c.x - x, c.z - z) < r) t += this.upIn(c); return t; }
  private freeNear(x: number, z: number) { return this.freed.some((f) => Math.hypot(f.x - x, f.z - z) < WON_REACH); }
  private flagId(c: Cluster, j: number) { return `${c.id}:${j}`; }
  private byId(id: string): { c: Cluster; j: number } | null {
    const [a, b] = id.split(":").map(Number), c = this.clusters.find((o) => o.id === a);
    return c && Number.isInteger(b) && b >= 0 && b < c.n ? { c, j: b } : null;
  }

  // ---- the clusters ---------------------------------------------------------------------------------

  /** A cluster from its record, with where its flags go worked out; null if the record's no good here. */
  private cluster(id: number, r: number, a: number, n: number, seed: number, down: number, pub: string): Cluster | null {
    const R = this.roads;
    if (!R || !Number.isInteger(r) || r < 0 || r >= R.roads.length || !Number.isInteger(n) || n < 1 || n > MANY || !Number.isFinite(a)) return null;
    const raw = R.spots(r, a, n, seed);
    const x = raw.reduce((t, s) => t + s.x, 0) / n, z = raw.reduce((t, s) => t + s.z, 0) / n;
    const half = Math.max(...raw.map((s) => Math.hypot(s.x - x, s.z - z))) + 20;
    return { id, r, a, n, seed: seed | 0, down: down & ((1 << n) - 1), pub, x, z, half, name: R.chain(r).name, raw, placed: null, stamp: "" };
  }

  /** Where a cluster's flags hang just now: on the lamps of whichever squares are loaded round it. */
  private spotsOf(c: Cluster): Spot[] {
    const stamp = this.w.map.tilesNear(c.x, c.z, c.half).map((t) => t.d.tile?.join("_")).join("|");
    if (!c.placed || stamp !== c.stamp) { c.placed = this.roads!.place(c.raw); c.stamp = stamp; }
    return c.placed;
  }

  /** Somewhere for n flags: a street 150 to 600 m from at, or with no at, anywhere in the force
   *  field; clear of the other clusters and the schools, and of whatever ok rules out. */
  private findStreet(rand: () => number, n: number, at: { x: number; z: number } | null, ok: (x: number, z: number) => boolean, squares: boolean) {
    const R = this.roads, map = this.w.map, span = (n - 1) * SPACING;
    if (!R) return null;
    const pool = at ? R.usable.filter((i) => { const d = Math.hypot(R.mids[i * 2] - at.x, R.mids[i * 2 + 1] - at.z); return d > 150 && d < 600; }) : R.usable;
    for (let tries = 0; tries < 40 && pool.length; tries++) {
      const r = pool[Math.floor(rand() * pool.length)], ch = R.chain(r);
      if (ch.len < span + 8) continue;
      const a = Math.round(Math.max(4, Math.min(ch.len - 4 - span, (ch.from + ch.to - span) / 2))), seed = Math.floor(rand() * 256);
      const raw = R.spots(r, a, n, seed);
      if (!raw.every((s) => map.fieldEdge(s.x, s.z) > 30 && ok(s.x, s.z) && !inSafeZone(map, s.x, s.z, 0, squares))) continue;
      if (this.clusters.some((c) => Math.hypot(c.x - raw[0].x, c.z - raw[0].z) < c.half + span + APART
        && c.raw.some((q) => raw.some((s) => Math.hypot(q.x - s.x, q.z - s.z) < APART)))) continue;
      return { r, a, n, seed };
    }
    return null;
  }

  /** Another cluster goes up, near one already up or somewhere quiet, if there's room under MAX_UP. */
  private grow(rand: () => number, ok: (x: number, z: number) => boolean, squares: boolean): boolean {
    const room = MAX_UP - this.total;
    if (room < FEW) return false;
    const n = Math.min(room, FEW + Math.floor(rand() * (MANY - FEW + 1)));
    const near = this.clusters.length && rand() < 0.6 ? this.clusters[Math.floor(rand() * this.clusters.length)] : null;
    const plan = this.plan && this.plan.n <= room && this.roads!.spots(this.plan.r, this.plan.a, this.plan.n, this.plan.seed).every((s) => ok(s.x, s.z)) ? this.plan : null;
    this.plan = null;
    const got = plan ?? this.findStreet(rand, n, near, ok, squares);
    const c = got && this.cluster(++this.clusterN, got.r, got.a, got.n, got.seed, 0, "");
    if (!c) return false;
    this.clusters.push(c);
    this.dirty = true;
    return true;
  }

  /** Host: what keeps a new cluster away: anyone playing, a takeover going on, a pub won back. */
  private clearOf(alive: Target[]) {
    return (x: number, z: number) => !alive.some((p) => Math.hypot(p.x - x, p.z - z) < 250)
      && !this.calls.some((c) => Math.hypot(c.x - x, c.z - z) < 500) && !this.freeNear(x, z);
  }

  /** Host: every flag on a street is down: it's cleared. */
  private streetCleared(c: Cluster, by: string) {
    const k = this.clusters.indexOf(c);
    if (k < 0) return;
    this.clusters.splice(k, 1);
    this.dirty = true;
    this.sendT = Math.min(this.sendT, 0.5);
    this.news("street", { n: c.name, x: Math.round(c.x), z: Math.round(c.z), by });
    this.checkSaved();
  }

  /** Host: not a flag left on the map: it's safe, and the Flag Lads stay away for QUIET_DAYS. */
  private checkSaved() {
    if (this.saved || this.clusters.some((c) => bits(c.down) < c.n)) return;
    this.saved = true;
    this.clusters = [];
    this.quietTill = this.season + QUIET_DAYS;
    keepQuiet(this.w.mapId, this.quietTill);
    for (const c of [...this.calls]) this.endCall(c, null);
    this.dirty = true;
    this.news("saved", { q: this.quietTill });
  }

  /** Whether flags at these spots would stand within gap metres of another cluster's. */
  private overlaps(raw: { x: number; z: number }[], gap: number) {
    return this.clusters.some((c) => c.raw.some((q) => raw.some((s) => Math.hypot(q.x - s.x, q.z - s.z) < gap)));
  }

  /** Host: the lads kept a pub: ten to fifteen flags go up on its street and the streets running
   *  into it (and in a town centre of short streets, the ones running into those). */
  private digIn(c: Call) {
    const R = this.roads, home = R?.nearest(c.x, c.z, 80), map = this.w.map;
    if (!R || !home) return;
    const want = LOST_FEW + Math.floor(Math.random() * (LOST_MANY - LOST_FEW + 1));
    const key = (r: number) => R.chain(r).name || `#${r}`, seen = new Set([key(home.r)]);
    const queue = [{ r: home.r, s: home.s, inward: 0, depth: 0 }], plans: { r: number; a: number; n: number; seed: number }[] = [];
    let placed = 0;
    while (queue.length && placed < want && placed + FEW <= LOST_MANY) {
      const p = queue.shift()!;
      if (p.depth < 2) for (const j of R.joining(p.r, c.x, c.z, 300)) if (!seen.has(key(j.r))) { seen.add(key(j.r)); queue.push({ ...j, depth: p.depth + 1 }); }
      // the pub's own street takes most; whatever it can't fit goes on the streets round it, five or more a time
      const left = want - placed;
      let n = plans.length ? (left - FEW >= FEW ? FEW : Math.max(FEW, left)) : Math.ceil(want * 0.6);
      if (!plans.length && want - n < FEW) n = want;
      n = Math.min(n, LOST_MANY - placed);
      const ch = R.chain(p.r);
      // a street running in is flagged from the corner along it, or the other way if that's too short
      for (const d of p.inward ? [p.inward, -p.inward] : [0]) {
        const room = d > 0 ? ch.len - p.s - 20 : d < 0 ? p.s - 20 : ch.len - 4;
        const m = Math.min(n, MANY, room >= 0 ? Math.floor(room / SPACING) + 1 : 0);
        if (m < FEW) continue;
        const span = (m - 1) * SPACING;
        const a = Math.round(d > 0 ? p.s + 20 : d < 0 ? p.s - 20 - span : Math.max(2, Math.min(ch.len - 2 - span, p.s - span / 2)));
        const seed = Math.floor(Math.random() * 256), raw = R.spots(p.r, a, m, seed);
        if (raw.some((s) => map.fieldEdge(s.x, s.z) < 5 || inSafeZone(map, s.x, s.z)) || this.overlaps(raw, 20)) continue;
        plans.push({ r: p.r, a, n: m, seed });
        placed += m;
        break;
      }
    }
    // there's only so many flags to go round: they take down their oldest elsewhere to make room
    const need = plans.reduce((t, q) => t + q.n, 0);
    while (MAX_UP - this.total < need) {
      const k = this.clusters.findIndex((o) => !o.pub);
      if (k < 0) break;
      this.clusters.splice(k, 1);
    }
    for (const q of plans) {
      if (MAX_UP - this.total < q.n) break;
      const got = this.cluster(++this.clusterN, q.r, q.a, q.n, q.seed, 0, c.name);
      if (got) this.clusters.push(got);
    }
    this.dirty = true;
  }

  /** Host: clusters out past the wall (the zones not open yet, zones.ts) can't be reached, so the
   *  lads move them somewhere that can. */
  private reachable(alive: Target[]) {
    const out = this.clusters.filter((c) => this.w.map.fieldEdge(c.x, c.z) < 0);
    if (!out.length) return;
    this.clusters = this.clusters.filter((c) => !out.includes(c));
    for (let k = 0; k < out.length; k++) this.grow(Math.random, this.clearOf(alive), true);
    this.dirty = true;
  }

  // ---- the season, from the clock ---------------------------------------------------------------

  /** Where the Flag Lads would have got to by now this season, with nobody fighting them: the same
   *  on every screen, from the clock and the map's streets. */
  private fresh(season: number) {
    this.season = season;
    this.clusters = []; this.clusterN = 0; this.plan = null;
    this.freed = [];
    this.decorated = false;
    this.saved = season < this.quietTill;
    this.chair = newChair(rng(hash("chair", season)));
    this.growT = GROW_EVERY;
    if (this.saved || !this.roads) return;
    const r = rng(hash("bunting", season)), any = () => true;
    for (let k = 0; k < SEEDS; k++) this.grow(r, any, false);
    const steps = Math.floor(Math.min(SEASON, Date.now() - season * SEASON) / 1000 / GROW_EVERY);
    for (let k = 0; k < steps; k++) this.grow(r, any, false);
  }

  // ---- flags ----------------------------------------------------------------------------------------

  /** Which way a lamp's flag turns: out the way its arm reaches, across the street. */
  private fly(a: number) { return a - Math.PI / 2; }

  /** Where a flag's banner hangs (its middle), for hitting it. */
  private bannerAt(s: Spot) {
    const px = Math.cos(this.fly(s.a)), pz = -Math.sin(this.fly(s.a));
    return { x: s.x + px * 0.5, y: s.g + 4.1, z: s.z + pz * 0.5 };
  }

  /** Put the flags and bunting up round you. */
  private drawFlags(me: { x: number; z: number }) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const stood = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2), post = new THREE.Vector3(5, 2.5, 2.5);
    const lit: { c: Cluster; j: number; s: Spot; d: number }[] = [], posts: Spot[] = [];
    for (const c of this.clusters) {
      if (Math.hypot(c.x - me.x, c.z - me.z) > NEAR + c.half) continue;
      const spots = this.spotsOf(c);
      for (let j = 0; j < c.n; j++) {
        const s = spots[j], d = Math.hypot(s.x - me.x, s.z - me.z);
        if (d > NEAR) continue;
        if (!s.lamp) posts.push(s);
        if (this.isUp(c, j)) lit.push({ c, j, s, d });
      }
    }
    lit.sort((a, b) => a.d - b.d);
    if (lit.length > MAX_FLAGS) lit.length = MAX_FLAGS;
    this.shown = [];
    let n = 0;
    for (const f of lit) {
      q.setFromAxisAngle(up, this.fly(f.s.a));
      m4.compose(p.set(f.s.x, f.s.g + 4.42, f.s.z), q, one);
      this.flags.setMatrixAt(n, m4); this.poles.setMatrixAt(n, m4);
      this.shown.push({ id: this.flagId(f.c, f.j), ...this.bannerAt(f.s), a: this.fly(f.s.a) });
      n++;
    }
    let k = n;
    for (const s of posts) { if (k >= MAX_FLAGS * 2) break; m4.compose(p.set(s.x, s.g, s.z), stood, post); this.poles.setMatrixAt(k++, m4); }
    this.flags.count = n; this.poles.count = k;
    this.flags.instanceMatrix.needsUpdate = this.poles.instanceMatrix.needsUpdate = true;
    // bunting strung from each flag to the next one along its street
    const pos: number[] = [], dir = new THREE.Vector3(), byId = new Map(lit.map((f) => [this.flagId(f.c, f.j), f]));
    let pk = 0;
    this.strands = [];
    for (const a of lit) {
      const b = byId.get(this.flagId(a.c, a.j + 1));
      if (!b || a.d > 150) continue;
      const bd = Math.hypot(b.s.x - a.s.x, b.s.z - a.s.z);
      if (bd < 6 || bd > 48) continue;
      const key = `${this.flagId(a.c, a.j)}>${this.flagId(b.c, b.j)}`;
      const top = (s: Spot) => s.g + (s.lamp ? 5.3 : 4.55);
      const ya = top(a.s), yb = top(b.s), sag = Math.min(1.6, bd * 0.05), steps = Math.max(2, Math.round(bd / 0.75));
      this.strands.push({ key, ia: this.flagId(a.c, a.j), ib: this.flagId(b.c, b.j), ax: a.s.x, ay: ya, az: a.s.z, bx: b.s.x, by: yb, bz: b.s.z, sag });
      const at = (t: number) => [a.s.x + (b.s.x - a.s.x) * t, ya + (yb - ya) * t - sag * 4 * t * (1 - t), a.s.z + (b.s.z - a.s.z) * t];
      for (let s = 0; s < 8; s++) pos.push(...at(s / 8), ...at((s + 1) / 8));
      dir.set(b.s.x - a.s.x, 0, b.s.z - a.s.z).normalize();
      q.setFromAxisAngle(up, Math.atan2(dir.x, dir.z) + Math.PI / 2);
      for (let s = 1; s < steps && pk < MAX_PENNANTS; s++) {
        const [x, y, z] = at(s / steps);
        m4.compose(p.set(x, y, z), q, one);
        this.pennants.setMatrixAt(pk++, m4);
      }
    }
    this.pennants.count = pk;
    this.pennants.instanceMatrix.needsUpdate = true;
    this.strings.geometry.dispose();
    this.strings.geometry = new THREE.BufferGeometry();
    this.strings.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  }

  /** The cluster you're nearest: how many of its flags are up, and where the nearest of them is. */
  private lookRound(me: { x: number; z: number }) {
    const h = this.here;
    h.c = null; h.top = h.left = 0; h.near = null;
    let bd = STREET;
    for (const c of this.clusters) {
      if (Math.hypot(c.x - me.x, c.z - me.z) > c.half + STREET) continue;
      const spots = this.spotsOf(c);
      let d = Infinity, near: { x: number; z: number; d: number } | null = null;
      spots.forEach((s, j) => {
        const e = Math.hypot(s.x - me.x, s.z - me.z);
        d = Math.min(d, e);
        if (this.isUp(c, j) && (!near || e < near.d)) near = { x: s.x, z: s.z, d: e };
      });
      if (d < bd) { bd = d; h.c = c; h.top = c.n; h.left = this.upIn(c); h.near = near; }
    }
  }

  /** A little cheer for a cluster gone; the real one is for the whole map (madeSafe). */
  private celebrate(street: string) {
    const me = this.w.me();
    this.juice.cleared(me.x, me.y + 1, me.z);
    this.w.toast(`That's every flag down${street ? ` on ${street}` : " on this street"}. ${Math.min(100, Math.ceil((this.up * 100) / MAX_UP))}% of them left up round ${this.w.town()}`);
  }

  /** The game's clock this frame: dips for a moment when you clear a street. */
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
      const at = this.byId(f.id);
      if (miss < 0.42 && at && this.isUp(at.c, at.j)) best = { id: f.id, dist: t, x: f.x, y: f.y, z: f.z, a: f.a };
    }
    return best;
  }

  /** I shot a flag down: it tears and drops on every screen, the host counts it, and my count goes up
   *  (and the meter drops on my screen straight away). */
  shoot(f: { id: string; x: number; y: number; z: number; a: number }) {
    const at = this.byId(f.id);
    this.pending.set(f.id, performance.now());
    this.drop(f.x, f.y, f.z, f.a);
    this.flagT = 0;
    this.downs++;
    note("flags");
    this.tickAt = performance.now();
    if (this.downs === 1) guide(`Flag down! Shoot every flag on this street to clear it (${at ? at.c.n : "a few"} up here). Ladder lads put them back: catch one and they stop for a bit`);
    setTimeout(() => SFX.counterTick(), 120);
    this.juice.flag(f.x, f.y, f.z, this.w.trick());
    Yours.flagShot(f.x, f.z, this.w.place());
    if (at && this.upIn(at.c) === 0) this.celebrate(at.c.name);
    const msg = { k: "down", id: f.id };
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
   *  flags off at both ends, each shot like any other so the host's count still holds. */
  shootBunting(b: { key: string }) {
    const s = this.strands.find((q) => q.key === b.key);
    const at = this.takeDown(b.key);
    if (at) this.juice.bunting(at, this.w.trick());
    this.w.send({ k: "bun", key: b.key });
    if (!s) return;
    for (const id of [s.ia, s.ib]) {
      const f = this.shown.find((q) => q.id === id), here = this.byId(id);
      if (f && here && this.isUp(here.c, here.j)) this.shoot(f);
    }
  }

  /** A string of bunting comes down, and its points flutter to the ground. It's strung again once
   *  the flags at both its ends are back up. */
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

  // ---- the host: new clusters, call-outs, crews and ladders --------------------------------------

  private hostUpdate(dt: number) {
    const now = Date.now(), season = Math.floor(now / SEASON);
    if (season !== this.season) {
      const had = this.season >= 0;
      for (const c of [...this.calls]) this.endCall(c, null);
      this.fresh(season);
      if (had && !this.saved) this.news("season");
      this.dirty = true;
    }
    const players = this.w.players(), alive = players.filter((p) => p.alive);
    const busy = alive.filter((p) => this.isBusy(p.id)), brew = !this.saved && busy.length > 0 && busy.length === alive.length;
    if (brew !== this.paused) { this.paused = brew; this.dirty = true; this.sendT = 0; }
    if (brew) for (const c of this.calls) if (!c.on) c.until += dt * 1000;
    if ((this.tickT -= dt) <= 0) {
      this.tickT = TICK;
      if (!this.saved) this.reachable(alive);
      if (!this.saved && !brew && (this.growT -= TICK) <= 0) {
        this.growT = GROW_EVERY;
        this.grow(Math.random, this.clearOf(alive), true);
      }
      const t = this.total;
      if (!this.decorated && t >= MAX_UP - 2) { this.decorated = true; this.news("decorated"); }
      if (t < MAX_UP * 0.9) this.decorated = false;
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
    const pubs = this.w.pubs().map((p) => ({ ...p, d: Math.min(...alive.map((t) => Math.hypot(t.x - p.x, t.z - p.z))) }))
      .filter((p) => p.d > 120 && p.d < 1500 && !this.freed.some((f) => f.n === p.name) && !inSafeZone(this.w.map, p.x, p.z, 30)
        && !this.calls.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 600));
    if (!pubs.length) return false;
    const weight = (p: { x: number; z: number }) => this.flagsAround(p.x, p.z, 600) / 20 + 0.05;
    let r = Math.random() * pubs.reduce((s, p) => s + weight(p), 0);
    const p = pubs.find((o) => (r -= weight(o)) <= 0) ?? pubs[0];
    this.addCall(p, vice);
    return true;
  }

  private addCall(p: { name: string; x: number; z: number; d: number }, vice: boolean) {
    this.calls.push({
      id: ++this.callN + Math.floor(Math.random() * 1e6) * 100, name: p.name, x: p.x, z: p.z,
      until: Date.now() + (180 + p.d / 3) * 1000, on: false, onAt: 0, vice, gazebo: null, crew: [], chair: null, deputy: null, dep: false, awayT: 0, megaT: 30, left: -1, boss: 0,
      bar: 0, rate: 0, lads: [], ladT: 0, fled: false,
    });
    this.dirty = true;
    this.sendT = 0;
  }

  /** Whether the Flag Lads could take this pub now (the games list, gameslist.ts): not one won back
   *  this season, nor by a school, nor while the town's been made safe from them. */
  canTake(name: string) {
    const p = this.w.pubs().find((q) => q.name === name);
    return !!p && this.on && !this.saved && !this.freed.some((f) => f.n === name) && !inSafeZone(this.w.map, p.x, p.z, 30);
  }

  /** Host: the Flag Lads take this pub straight away (the games list). */
  takeNow(name: string) {
    const p = this.w.pubs().find((q) => q.name === name);
    if (!p || !this.w.isHost || !this.canTake(name) || this.takenOver(name)) return;
    this.addCall({ ...p, d: 0 }, this.calls.length > 0);
  }

  /** The pavement outside a pub, where its takeover's fought. */
  pubFront(name: string) {
    const p = this.w.pubs().find((q) => q.name === name);
    return p ? this.frontOf({ name, x: p.x, z: p.z }) : null;
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
      if (at) for (const g of ch.bring(at[0], at[1], look(SOCIETY, Math.floor(Math.random() * 4)), 2, this.w.players(), undefined, 3)) {
        // they come running to the front, rather than hang about wherever they turned up, out of sight round the back
        c.crew.push(g);
        const f = c.front ??= this.frontOf(c), side = (Math.random() - 0.5) * 12, out = 1 + Math.random() * 3;
        ch.sendTo(g.i, g.gen, f.x + f.uz * side + f.ux * out, f.z - f.ux * side + f.uz * out, true);
      }
      this.news("mega", { x: Math.round(chair.x), z: Math.round(chair.z), n: this.chair.name });
    }
    this.hostBanner(c, dt, room);
    if (!this.calls.includes(c)) return;
    // half his health gone and the Gaffer runs for it, leaving the lads to it
    if (chair && c.chair && !c.vice && !c.fled && !this.chase && chair.hp <= chair.top * RUNS_AT) this.startChase(c, c.chair);
    // the fight: the Gaffer down (or off) and the crew all but done wins it back; everyone wandering off loses it
    this.muster(c, dt);
    const dep = !!(c.deputy && ch.get(c.deputy.i, c.deputy.gen));
    const lads = c.crew.length, left = lads + (dep ? 1 : 0), boss = chair ? (dep ? 2 : 1) : 0;
    if (lads !== c.left || boss !== c.boss || dep !== c.dep) { c.left = lads; c.boss = boss; c.dep = dep; this.dirty = true; }
    if (!chair && left <= 1) { this.endCall(c, true); return; }
    c.awayT = near > 400 ? c.awayT + dt : 0;
    if (c.awayT > 60) this.endCall(c, false);
  }

  /** Host: the crew and the right-hand man belong at the pub's front, and only the ones you can find
   *  there count. One who's wandered off and is after nobody (back from chasing someone down the
   *  streets, say) is called back at a run; one who isn't back in STRAY_FOR seconds (stuck the far
   *  side of a wall, or lost) has had enough and legs it, so the win never waits on a lad nobody can see. */
  private muster(c: Call, dt: number) {
    const ch = this.w.naughtyBoys, f = c.front ??= this.frontOf(c);
    for (const g of [...c.crew, ...(c.deputy ? [c.deputy] : [])]) {
      const b = ch.get(g.i, g.gen);
      if (!b) continue;
      if (b.target || Math.hypot(b.x - f.x, b.z - f.z) < MUSTER) { g.out = 0; continue; }
      const was = g.out ?? 0;
      g.out = was + dt;
      if (was < CALL_BACK && g.out >= CALL_BACK) {
        const side = (Math.random() - 0.5) * 12, out = 1 + Math.random() * 3;
        ch.sendTo(g.i, g.gen, f.x + f.uz * side + f.ux * out, f.z - f.ux * side + f.uz * out, true);
      }
      if (g.out > STRAY_FOR) { ch.rout(g.i, g.gen, f); ch.release(g.i, g.gen); }
    }
    c.crew = c.crew.filter((g) => ch.get(g.i, g.gen));
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
  private frontOf(c: Pick<Call, "name" | "x" | "z">): Front {
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
    const f = c.front = this.frontOf(c), at: [number, number] = [f.x, f.z];
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
    for (const g of [...c.crew, ...c.lads, ...(c.chair ? [c.chair] : []), ...(c.deputy ? [c.deputy] : [])]) {
      // the pub's won with a lad or the right-hand man still standing: left about, they'd pick fights and keep his bar up
      if (won) this.w.naughtyBoys.rout(g.i, g.gen, c);
      this.w.naughtyBoys.release(g.i, g.gen);
    }
    if (c.fled && won === false && this.chase) { this.w.naughtyBoys.flee(this.chase.i, this.chase.gen, 1, false); this.w.naughtyBoys.release(this.chase.i, this.chase.gen, true); this.endChase(); }
    if (!this.calls.length) this.callT = 240 + Math.random() * 120;
    this.dirty = true;
    this.sendT = 0;
    if (won === null) return;
    const was = this.chair;
    // for the morning paper: who the Gaffer was, and how close it came
    const story = { x: Math.round(c.x), z: Math.round(c.z), g: c.vice ? "" : was.name, tr: c.vice ? [] : [...was.traits], v: c.vice ? 1 : 0,
      sp: c.onAt ? Math.max(0, Math.round((c.until - c.onAt) / 1000)) : 0, du: c.onAt ? Math.round((Date.now() - c.onAt) / 1000) : 0 };
    let line = "";
    if (won) {
      this.clusters = this.clusters.filter((o) => Math.hypot(o.x - c.x, o.z - c.z) > WON_REACH);
      // closed down inside 90 seconds of the crew turning up: a bonus
      const quick = Date.now() - c.onAt < BONUS_SECS * 1000, n = quick ? 5 : 3;
      for (let j = 0; j < n; j++) { const a = (j / n) * Math.PI * 2; this.w.prize(c.x + Math.cos(a) * 2, c.z + Math.sin(a) * 2, j === 0 || (quick && j === 1)); }
      if (quick) this.news("quick");
      // the pub's won back for the day: a ride left outside, a free round now and then, and quiet streets
      this.freed.push({ n: c.name, x: c.x, z: c.z, t: Date.now() });
      this.w.give(c.x - 2, c.z + 2, RIDES[Math.floor(Math.random() * (RIDES.length - 1))]);
      if (!c.vice) {
        this.chair = newChair(Math.random, was.name);
        line = `${was.name} has packed it in. ${this.chair.name} is the new Gaffer, and ${this.chair.traits.map((t) => TRAITS[t]).join(", and ")}`;
      }
    } else {
      this.freed = this.freed.filter((f) => f.n !== c.name);
      this.digIn(c);
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
    if (won) this.checkSaved();
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

  /** Host: ladder crews go and put back the flags you've shot down near you, on their clusters' streets. */
  private hostLadders(dt: number, alive: Target[]) {
    const ch = this.w.naughtyBoys, near = (x: number, z: number, r: number) => alive.some((t) => Math.hypot(t.x - x, t.z - z) < r);
    for (let k = this.ladders.length - 1; k >= 0; k--) {
      const l = this.ladders[k], at = ch.get(l.i, l.gen);
      if (!at) { this.ladders.splice(k, 1); continue; }
      if (l.leaving) { if (!near(at.x, at.z, 80)) { ch.release(l.i, l.gen, true); this.ladders.splice(k, 1); } continue; }
      if (Math.hypot(at.x - l.x, at.z - l.z) > 1.8) { l.t = 0; continue; }
      if ((l.t += dt) < 4) continue;
      // up the ladder and the flag's back
      const f = this.byId(l.id);
      if (f && (f.c.down >> f.j) & 1) { f.c.down &= ~(1 << f.j); this.dirty = true; }
      const next = this.downNear(l.x, l.z, 100);
      if (next) { Object.assign(l, { id: next.id, ...this.foot(next), t: 0 }); ch.sendTo(l.i, l.gen, l.x, l.z); }
      else {
        l.leaving = true;
        const away = streetSpot(this.w.map, at.x, at.z, 120, 200, 0.6, (x, z) => !near(x, z, 90));
        if (away) ch.sendTo(l.i, l.gen, away.x, away.z, true); else { ch.release(l.i, l.gen, true); this.ladders.splice(k, 1); }
      }
    }
    if ((this.ladderT -= dt) > 0) return;
    this.ladderT = 100 - 60 * this.meter;
    if (this.ladders.length >= 3) return;
    const anchor = alive[Math.floor(Math.random() * alive.length)], now = Date.now();
    const f = this.downNear(anchor.x, anchor.z, 180, (c, s) => !this.freeNear(s.x, s.z) && !((this.lull.get(c.id) ?? 0) > now) && !inSafeZone(this.w.map, s.x, s.z));
    if (f) this.sendCrew(f, alive);
  }

  /** Host: the nearest flag shot down within r of (x, z) that no ladder lad is already on its way to. */
  private downNear(x: number, z: number, r: number, ok: (c: Cluster, s: Spot) => boolean = () => true) {
    let best: (Spot & { id: string; d: number }) | null = null;
    for (const c of this.clusters) {
      if (!c.down || Math.hypot(c.x - x, c.z - z) > r + c.half) continue;
      const spots = this.spotsOf(c);
      for (let j = 0; j < c.n; j++) {
        const s = spots[j], id = this.flagId(c, j), d = Math.hypot(s.x - x, s.z - z);
        if (!((c.down >> j) & 1) || d > r || (best && d > best.d) || this.ladders.some((m) => m.id === id) || !ok(c, s)) continue;
        best = { ...s, id, d };
      }
    }
    return best;
  }

  /** Host: a ladder lad sets off for a flag's lamp, from a street not far off that nobody is near. */
  private sendCrew(lamp: Spot & { id: string }, alive: Target[]): { x: number; z: number } | null {
    if (inSafeZone(this.w.map, lamp.x, lamp.z)) return null;   // not near a nursery or primary school
    const ch = this.w.naughtyBoys;
    const from = streetSpot(this.w.map, lamp.x, lamp.z, 40, 90, 0.6, (x, z) => !alive.some((t) => Math.hypot(t.x - x, t.z - z) < 35) && !inSafeZone(this.w.map, x, z));
    if (!from) return null;
    const g = ch.bring(from.x, from.z, look(LADDER, Math.floor(Math.random() * 4)), 1, this.w.players())[0];
    if (!g) return null;
    const foot = this.foot(lamp);
    ch.sendTo(g.i, g.gen, foot.x, foot.z);
    this.ladders.push({ ...g, id: lamp.id, ...foot, t: 0, leaving: false });
    return foot;
  }

  /** Host: send a ladder crew to a cluster's lamp near (x, z), for a tip-off (nightout.ts); where they'll be, or null if there's nowhere. */
  crewNear(x: number, z: number): { x: number; z: number } | null {
    const alive = this.w.players().filter((p) => p.alive), all: (Spot & { id: string; down: boolean; d: number })[] = [];
    for (const c of this.clusters) {
      if (Math.hypot(c.x - x, c.z - z) > 500 + c.half) continue;
      this.spotsOf(c).forEach((s, j) => {
        const id = this.flagId(c, j), d = Math.hypot(s.x - x, s.z - z);
        if (d > 60 && d < 500 && !this.ladders.some((m) => m.id === id)) all.push({ ...s, id, down: !!((c.down >> j) & 1), d });
      });
    }
    all.sort((a, b) => Number(b.down) - Number(a.down) || a.d - b.d);
    for (const l of all.slice(0, 6)) { const at = this.sendCrew(l, alive); if (at) return at; }
    return null;
  }

  /** Host: the street the Flag Lads are eyeing next, near their biggest cluster; their next cluster
   *  goes there. Its middle, or null if there's nowhere. */
  eyeing(): { x: number; z: number } | null {
    if (!this.roads || this.saved) return null;
    if (!this.plan) {
      const big = [...this.clusters].sort((a, b) => this.upIn(b) - this.upIn(a))[0] ?? null;
      const alive = this.w.players().filter((p) => p.alive);
      this.plan = this.findStreet(Math.random, FEW + Math.floor(Math.random() * (MANY - FEW + 1)), big, this.clearOf(alive), true);
    }
    if (!this.plan) return null;
    const raw = this.roads.spots(this.plan.r, this.plan.a, this.plan.n, this.plan.seed);
    return { x: raw.reduce((t, s) => t + s.x, 0) / raw.length, z: raw.reduce((t, s) => t + s.z, 0) / raw.length };
  }

  /** Where a ladder goes up a lamp: at its foot, on the street side. */
  private foot(l: { x: number; z: number; a: number }) {
    const c = clearSpot(this.w.map, l.x + Math.sin(l.a) * 0.9, l.z + Math.cos(l.a) * 0.9, 3);
    return c ? { x: c[0], z: c[1] } : { x: l.x, z: l.z };
  }

  /** Host: something naughtyboys.ts runs went down. A ladder crew caught means no more ladders on that
   *  street for a while. (The call-outs check their own crews for themselves.) */
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
    const l = this.ladders[k], f = this.byId(l.id);
    if (f) this.lull.set(f.c.id, Date.now() + LULL * 1000);
    this.ladders.splice(k, 1);
    this.news("ladder", { by: _by });
  }

  // ---- the network ----------------------------------------------------------------------------

  private state() {
    const cs = this.calls.map(packCall);
    const g = this.runner;
    return {
      k: "s", pa: this.paused ? 1 : 0, se: this.season, sv: this.saved ? 1 : 0, qt: this.quietTill,
      fc: this.clusters.map((c) => [c.id, c.r, c.a, c.n, c.seed, c.down, c.pub || 0]),
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

  /** Retry on a lost takeover's card: the host has the lads take the pub again (once, however many ask). */
  private retake(name: string) {
    const d = { k: "again", n: name };
    this.w.send(d);
    this.onMessage(d, this.w.selfId);
  }

  onMessage(d: any, from: string) {
    if (!d || typeof d !== "object" || !this.on) return;
    if (d.k === "busy") {
      if (from === this.w.selfId) return;
      if (d.b) this.busyAt.set(from, performance.now()); else this.busyAt.delete(from);
      return;
    }
    if (d.k === "again") {
      if (this.w.isHost && typeof d.n === "string") this.takeNow(d.n);
      return;
    }
    if (d.k === "s") {
      if (this.w.isHost && from !== this.w.selfId) return;
      if (!Array.isArray(d.fc)) return;
      this.heard = true;
      this.season = Number(d.se) || 0;
      this.saved = !!d.sv;
      this.paused = !!d.pa;
      if (Number.isInteger(d.qt)) { this.quietTill = d.qt; keepQuiet(this.w.mapId, d.qt); }
      this.setClusters(d.fc);
      if (Array.isArray(d.fr)) this.freed = d.fr.map((f: any[]) => ({ n: String(f[0]), x: +f[1], z: +f[2], t: 0 }));
      if (d.chr && typeof d.chr.n === "string") Object.assign(this.chair, { name: d.chr.n, traits: Array.isArray(d.chr.t) ? d.chr.t.filter((t: string) => t in TRAITS) : [], wins: +d.chr.w || 0 });
      this.setCalls(Array.isArray(d.cs) ? d.cs : d.c ? [d.c] : []);
      this.runnerPack = Array.isArray(d.gf) ? d.gf : null;
      const g = this.runnerPack as unknown[] | null;
      this.runner = g ? { i: Number(g[0]), gen: Number(g[1]), how: Number(g[2]) || 0, up: !!d.gu, name: String(g[8]), pub: String(g[7]) } : null;
      this.flagT = 0;
      return;
    }
    if (d.k === "down" && typeof d.id === "string" && d.id.length < 24) {
      const at = this.byId(d.id);
      if (from !== this.w.selfId) {
        Paper.flagBy(from);
        const f = this.shown.find((s) => s.id === d.id);
        if (f && at && this.isUp(at.c, at.j)) this.drop(f.x, f.y, f.z, f.a);
        this.flagT = 0;
      }
      if (!at || (at.c.down >> at.j) & 1) return;
      at.c.down |= 1 << at.j;
      if (this.w.isHost) {
        this.dirty = true;
        if (bits(at.c.down) >= at.c.n) this.streetCleared(at.c, from);
      }
      return;
    }
    if (d.k === "bun" && typeof d.key === "string" && d.key.length < 80) {
      if (from === this.w.selfId) return;
      const at = this.takeDown(d.key), me = this.w.me();
      if (at && Math.hypot(at[18] - me.x, at[20] - me.z) < 120) this.juice.fall(at, 2.3);
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
      const name = String(d.name ?? "the pub");
      // the result card for those there, a line for everyone else
      const me = this.w.me(), there = Number.isFinite(+d.x) && Math.hypot(+d.x - me.x, +d.z - me.z) < 250 && !this.w.busy();
      if (d.won) {
        const line = `${d.name} is won back! Flags down, everyone welcome. There's a ride outside, and the odd round on the house`;
        if (there) missionResult({ result: "won", label: "Pub takeover", title: `${d.name} is won back!`, colour: GREEN, sound: null, lines: ["Flags down, everyone welcome.", "There's a ride outside, and the odd round on the house"] });
        else this.w.toast(line);
        this.w.feed(`${named(name, GREEN)} won back from the Flag Lads`);
      } else {
        if (there) missionResult({ result: "lost", label: "Pub takeover", title: "Too slow", colour: PURPLE, sound: null, lines: [`The Flag Lads keep ${d.name}, and the streets round it fill up with flags`], retry: () => this.retake(name) });
        else this.w.toast(`Too slow: the Flag Lads keep ${d.name}, and the streets round it fill up with flags`);
        this.w.feed(`The Flag Lads kept ${named(name, PURPLE)}`);
      }
      if (d.line) setTimeout(() => this.w.feed(esc(String(d.line))), 1500);
      if (!this.w.isHost) this.setCalls(this.calls.filter((c) => c.name !== d.name).map(packCall));
      return;
    }
    if (d.k === "fg") { this.gaffers.onMessage(d, from, this.w.selfId); return; }
    if (d.k === "gcf") {
      const chase = this.chase, p = this.w.players().find((q) => q.id === from), b = chase ? this.w.naughtyBoys.get(chase.i, chase.gen) : null;
      if (this.w.isHost && chase?.up && p?.alive && b && Math.hypot(p.x - b.x, p.z - b.z) < CUFF_REACH + 2) this.gafferCaught(from, true);
      return;
    }
    if (d.k === "news") {
      if (d.t === "saved") Paper.log({ k: "free" }, "free");
      if (d.t === "saved") this.madeSafe(+d.q || 0);
      else if (d.t === "ladder") { if (d.by === this.w.selfId) note("ladder"); }
      if (d.t === "grun") this.gafferRuns(d);
      else if (d.t === "gup") {
        SFX.jobStep();
        if (this.runner) { this.runner.up = true; guide(`${this.runner.name} has given up! Get up close and cuff him ({use})`); }
      } else if (d.t === "gcu") {
        SFX.jobDone(true);
        const by = String(d.by ?? ""), who = by === this.w.selfId ? "You" : this.w.nameOf(by);
        this.w.toast(d.c ? `${who} cuffed ${d.n}! Bonus prizes` : `${who} put ${d.n} down! Bonus prizes`);
        this.w.feed(`${named(String(d.n), GREEN)} caught by ${esc(who)}`);
        this.w.mark("@gaffer", null);
        this.onEvent(d.c ? "cuffed" : "down", d);
      } else if (d.t === "gaw") {
        SFX.jobStep();
        this.w.toast(`${d.n} has got away! He'll be tomorrow's Wanted poster`);
        this.w.feed(`${named(String(d.n), PURPLE)} got away from ${esc(String(d.pub))}`);
        this.w.mark("@gaffer", null);
        this.onEvent("away", d);
      } else if (d.t === "knock") {
        const me = this.w.me();
        if (Math.hypot(+d.x - me.x, +d.z - me.z) < 250) this.w.toast("Lad shot off the ladder: the banner's set back!");
      } else if (d.t === "hung") this.w.feed(`The Flag Lads have got their banner up at ${named(String(d.n), PURPLE)}`);
      if (d.t === "ladder") this.w.toast("Ladder lad caught: no more flags going up round here for a bit");
      else if (d.t === "quick") this.w.toast("Cleared out quickly: bonus prizes!");
      else if (d.t === "street") {
        SFX.jobDone(true);
        const me = this.w.me(), street = d.n ? String(d.n) : "A street";
        if (Math.hypot(+d.x - me.x, +d.z - me.z) < 300) this.w.toast(`Street cleared! Not a flag left on ${d.n ? String(d.n) : "this street"}`);
        else this.w.feed(`${named(street, GREEN)} is flag-free again`);
      }
      else if (d.t === "decorated") this.w.toast(`The Flag Lads have every flag they've got up round ${this.w.town()}. Keep shooting them down`);
      else if (d.t === "season") this.w.toast("A new day: the Flag Lads are back, with more cable ties");
      else if (d.t === "greet" || d.t === "mega") {
        const me = this.w.me(), dist = Math.hypot(+d.x - me.x, +d.z - me.z);
        if (dist < 200) SFX.megaphone(dist);
        if (d.t === "greet") { const s = String(d.s ?? ""); if (dist < 400) this.w.toast(s); this.w.feed(esc(s)); }
        else if (dist < 250) this.w.toast(`${String(d.n)} is on the megaphone: more lads coming!`);
      }
    }
  }

  /** The clusters as the host says they are, keeping what's been worked out for the ones I have. */
  private setClusters(list: unknown[]) {
    const out: Cluster[] = [];
    for (const f of list) {
      if (!Array.isArray(f) || out.length >= MAX_UP) continue;
      const [id, r, a, n, seed, down] = f.map(Number), pub = typeof f[6] === "string" ? f[6].slice(0, 60) : "";
      const had = this.clusters.find((c) => c.id === id && c.r === r && c.a === a && c.n === n && c.seed === seed);
      if (had) { had.down = down & ((1 << n) - 1); had.pub = pub; out.push(had); continue; }
      const c = this.cluster(id, r, a, n, seed, down, pub);
      if (c) out.push(c);
    }
    this.clusters = out;
    this.clusterN = Math.max(this.clusterN, ...out.map((c) => c.id));
  }

  /** Not a flag left: the card that says the place is safe, and quiet for the next few days. */
  private madeSafe(till: number) {
    this.saved = true;
    this.clusters = [];
    if (till) { this.quietTill = Math.max(this.quietTill, till); keepQuiet(this.w.mapId, this.quietTill); }
    const town = this.w.town();
    missionResult({ result: "won", label: "The Flag Lads", title: `${town} is safe from the Flag Lads`, colour: GREEN, lines: ["Not a flag left on a lamp post.", `They won't be back for ${QUIET_DAYS} days.`] });
    this.w.feed(`${named(town, GREEN)} is safe from the Flag Lads`);
  }

  /** Days till the Flag Lads come back, once the place is safe. */
  private quietDays() { return Math.max(1, this.quietTill - Math.floor(Date.now() / SEASON)); }

  /** The call-outs as the host says they are (on everyone else's screen). */
  private setCalls(list: any[]) {
    if (this.w.isHost) return;
    const out: Call[] = [];
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      const was = this.calls.find((o) => o.id === +c.id);
      if (!was) this.ring(String(c.n), +c.x, +c.z);
      out.push({
        id: +c.id, name: String(c.n), x: +c.x, z: +c.z, until: +c.u, on: !!c.on, onAt: +c.a || 0, vice: !!c.v,
        gazebo: Array.isArray(c.gz) ? { x: +c.gz[0], z: +c.gz[1] } : null, crew: [], chair: null, deputy: null, awayT: 0, megaT: 0,
        left: c.l === undefined ? -1 : +c.l, boss: +c.b || 0, dep: c.dp === undefined ? +c.b === 2 : !!c.dp,
        bar: Math.max(0, Math.min(1, (+c.bn || 0) / 1000)), rate: (+c.br || 0) / 100000, lads: [], ladT: 0, fled: !!c.fl,
      });
    }
    this.calls = out;
  }

  /** The phone goes: a pub's been taken. */
  private ring(name: string, x: number, z: number) {
    SFX.phone();
    const me = this.w.me();
    if (this.w.busy()) this.w.toast(`The Flag Lads have taken over ${name}! Follow the purple marker and clear them out`);
    else missionBegin({ label: "Pub takeover", title: `The Flag Lads have taken over ${name}!`, goal: "Follow the purple marker and clear them out", colour: PURPLE });
    this.w.feed(`📞 The Flag Lads have taken over ${named(name, PURPLE)}, ${far(Math.hypot(x - me.x, z - me.z))} ${compassWord(x - me.x, z - me.z)}`);
  }

  /** The Gaffer legs it: say so, and put him on the map. */
  private gafferRuns(d: any) {
    SFX.megaphone(0);
    this.w.toast(`${d.n} legs it ${MOUNTS[+d.how] ?? MOUNTS[0]}! Get him before he's 400 m from ${d.pub}`);
    this.w.feed(`${named(String(d.n), PURPLE)} is making a run for it ${MOUNTS[+d.how] ?? MOUNTS[0]}`);
  }

  /** Use at the Gaffer with his hands up. */
  hint(): string {
    return this.cuffable() ? "<b>{use}</b> Cuff the Gaffer" : "";
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

  /** Whether one of the Flag Lads' bosses (by kit, as in bossName) is still to be beaten, for his bar:
   *  the Gaffer on the run, or a boss at a takeover on round him. Once the Gaffer has run, he's out of
   *  his pub's fight for good, so cuffed, put down or got away he may stand about with no bar while the
   *  lads are still being cleared. Only what every screen is told goes into it (the runner, and each
   *  takeover's fled and second-takeover marks). */
  inFight(i: number, gen: number, x: number, z: number, kit: number) {
    const g = this.runner;
    if (g && g.i === i && g.gen === gen) return true;
    return this.calls.some((c) => c.on && Math.hypot(c.x - x, c.z - z) < FIGHT_REACH && (kit === 2 ? c.vice : !c.vice && (kit === 1 || !c.fled)));
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
    const c = [...this.calls].sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
    let call = "";
    if (c) {
      const d = Math.hypot(c.x - me.x, c.z - me.z), pub = `<b>${esc(c.name)}</b>`;
      const bonus = Math.round(BONUS_SECS - (Date.now() - c.onAt) / 1000);
      if (c.on) {
        const boss = c.vice ? "his cousin" : "the Gaffer";
        const lads = c.left < 0 ? "" : c.left === 1 ? "1 lad left" : `${c.left} lads left`;
        const then = c.boss ? (c.dep ? `his right-hand man first, then ${boss}` : lads ? `then ${boss}` : boss)
          : c.dep ? (lads ? "and his right-hand man" : "his right-hand man") : lads ? "" : "nearly there";
        call = `Clear out ${pub}: ${[lads, then].filter(Boolean).join(", ")}${d > 60 ? ` · ${far(d)}` : ""}${bonus > 0 && c.onAt ? ` · bonus ${bonus}s` : ""}`;
      } else {
        const left = Math.max(0, Math.round((c.until - Date.now()) / 1000));
        call = `Pub takeover at ${pub} · ${far(d)} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}. Get there and clear them out`;
      }
      if (this.calls.length > 1) call += ` <span>(and ${esc(this.calls.find((o) => o !== c)!.name)})</span>`;
    }
    // the street you're nearest, takeover or not: how many of its flags are down (where the rest
    // are is for you to find: listen for them flapping)
    const h = this.here, street = h.c?.name ? `<b>${esc(h.c.name)}</b>` : "this street";
    let here = "";
    if (this.saved) here = `${esc(this.w.town())} is safe from the Flag Lads for ${this.quietDays() === 1 ? "another day" : `${this.quietDays()} more days`}`;
    else if (h.c && h.left) here = h.top === h.left ? `Shoot all <b>${h.top}</b> flags on ${street} to clear it` : `${h.c.name ? street : "This street"}: <b>${h.top - h.left}/${h.top}</b> flags down`;
    else if (!c) here = "No flags round here: head for the red on the map";
    call = [call, here].filter(Boolean).map((s) => `<em>${s}</em>`).join("");
    const pct = Math.min(100, Math.ceil((this.up * 100) / MAX_UP));
    const downs = this.downs ? `<span class="downs">${this.downs} down</span>` : "";
    const html = `<div class="label">Flags up <b>${pct}%</b>${downs}</div><div class="bar"><div style="width:${pct}%"></div></div>${call}`;
    missionStackReady();
    show($("bunting"), html);
    // it comes up near a cluster with flags up, while there's a takeover on, or for a
    // minute after you've shot a flag down; the rest of the time it's in today's jobs (daily.ts), under Tab.
    // a job's panel stacks over it (missionscreens.ts), so it stays up on a job too
    setHidden($("bunting"), !this.calls.length && !this.onIt() && !(this.here.left > 0 && !this.saved));
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
    const me = this.w.me(), pct = Math.min(100, Math.ceil((this.up * 100) / MAX_UP)), town = esc(this.w.town());
    const c = [...this.calls].sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
    // the Chronicle's headline over the story (today's jobs panel prints it as the front page)
    const hl = this.saved ? "City declared flag-free" : c ? `Flag Lads seize ${esc(c.name)}`
      : pct >= 60 ? "Flag Lads tighten grip on city" : pct >= 25 ? `Bunting row as lads flag ${pct}% of ${town}` : "Flag Lads on the back foot";
    const head = this.saved ? `<b>The Flag Lads</b>: ${town} is safe from them for ${this.quietDays() === 1 ? "another day" : `${this.quietDays()} more days`}`
      : `<b>The Flag Lads</b> have <b class="pct">${pct}%</b> of their flags up round ${town}, in clusters along the streets (the red on the map). Shoot every flag on a street to clear it, and win their pubs back to knock out loads at once`;
    const gaffer = this.saved ? "" : `<small>The Gaffer is ${esc(this.chair.name)}, who ${this.chair.traits.map((t) => esc(TRAITS[t])).join(" and ")}${this.freed.length ? ` · won back today: ${this.freed.map((f) => esc(f.n)).join(", ")}` : ""}</small>`;
    const now = c ? `<small class="now">Right now they've taken over <b>${esc(c.name)}</b>, ${far(Math.hypot(c.x - me.x, c.z - me.z))} ${compassWord(c.x - me.x, c.z - me.z)}: follow the purple marker</small>` : "";
    return `<h3 class="hl">${hl}</h3>` + head + now + gaffer;
  }

  /** The clusters for the maps, each a soft blob about a street across, a little off its middle so it
   *  points you at the streets rather than the lamp; and the pubs won back, green. The same list
   *  comes back till something changes, so the minimap can tell. */
  tint(): Blob[] {
    const key = this.clusters.map((c) => `${c.id}:${this.upIn(c)}`).join() + "|" + this.freed.map((f) => f.n).join();
    if (key === this.blobKey) return this.blobs;
    this.blobKey = key;
    this.blobs = [];
    for (const c of this.clusters) {
      const up = this.upIn(c);
      if (!up) continue;
      const r = Math.max(90, Math.min(280, c.half + 50)), j = rng(hash("blob", c.id, c.r)), a = j() * Math.PI * 2, d = j() * r * 0.35;
      this.blobs.push({ x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d, r, a: 0.25 + (0.75 * up) / c.n });
    }
    for (const f of this.freed) this.blobs.push({ x: f.x, z: f.z, r: WON_REACH, a: 1, free: true });
    return this.blobs;
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
