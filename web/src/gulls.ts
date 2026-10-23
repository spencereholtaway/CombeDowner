// Seagull Attack: tourists sat on benches with their sandwiches from the Darling Deli, and the gulls
// of Bath want them. Keep the sandwiches out of their beaks for five waves.
//
// The job goes up on a noticeboard in a square, park or beer garden. Take it and a ring of benches
// is set out near the board with three tourists on them (one more for each extra player), each with
// a sandwich of three bites. Then the gulls come in off the rooftops, a wave at a time, each wave
// bigger and more mixed than the last, with a breather between:
//
// - Herring gulls circle, pick a sandwich and swoop: their shadow grows on the ground as they come
//   down. Shoot them on the way in.
// - Hoverers hang over a bench, head cocked, then drop straight down. Stare one out (keep your
//   crosshair on it for a second and a half) and it gives up: eye contact puts gulls off, as the
//   University of Exeter found in 2019.
// - A gang of black-headed gulls comes in five at once, too many to shoot: shout at them (E) and
//   everything near you scatters.
// - Walkers land out of sight and stroll up behind the benches, with no shadow to give them away.
// - Poopers fly over and drop on people. Hit by seagull muck, your screen's splattered and you're
//   slowed down for a few seconds; a tourist who's hit loses a bite.
// - In the last wave, Big Lad: a giant seagull the size of a bus. He sits on the highest roof
//   nearby, flies over dropping poo bombs (a white ring shows where each will land; later he drops
//   a carpet of them), swoops down to take a whole sandwich in one go unless he's shot enough on
//   the way in to make him pull out, and calls in a gang when he's half beaten. His beak is the
//   weak spot.
//
// A gull that grabs a bite flies off with it to a rooftop: shoot it before it gets there and the
// bite's saved. A tourist whose sandwich is all gone storms off. Between waves three crates are
// put out by the benches, each with an upgrade: a bucket of chips to throw down (gulls go for the
// chips instead), a plastic owl to stand by a tourist (gulls keep away until a walker knocks it
// over), a brolly that blocks one swoop, a megaphone for a bigger shout, or second helpings for
// everyone. Whoever gets to one first takes it for the team.
//
// Stars at the end for how much sandwich is left, and a score: gulls seen off, thieves shot in
// flight, gulls stared out, and a bonus for a wave without a bite lost. Each day has its own twist
// (a bank holiday's crowds, Chip Tuesday, a hen do, bin day). Three stars puts a seagull on your
// head, from your wardrobe (wardrobe.ts), and beating Big Lad cleanly gets you more.
//
// Who decides what: the host runs the gulls, the tourists, the waves and Big Lad, and sends their
// state round about 10 times a second as "qe" (with what just happened, for the sounds and
// feathers); everyone else draws that, smoothed. Shots at gulls, shouts, stares, chips and crates
// go to the host as "qe" from whoever did them. Where seagull muck lands goes round, and each
// player sees for themselves whether it got them. A go of your own (Backspace afterwards) runs it
// all on your machine and sends nothing.
import * as THREE from "three";
import * as SFX from "./audio";
import { ball, box, part, type Piece } from "./avatar";
import { dayNumber } from "./daylight";
import { type GameMap, PATHS } from "./map";
import { clearSpot } from "./haunts";
import { type Card, type Job, type Offer, type PostSpot, type Quarry, type QuestWorld, type Rng, esc, hash, registerJob, rng, starText } from "./quests";
import { count as wardCount, earn } from "./wardrobe";
import type { Follow } from "./weapon";

const COLOUR = "#8fd0f0";
const WAVES = 5;
const FIRST = 8;                 // seconds before the first wave
const LULL = 14;                 // and between waves
const SEND_EVERY = 0.1;
const MAX_GULLS = 40;
const LIVE_CAP = 14;             // gulls about at once, in a wave
const RING = 7;                  // how far the benches are from the middle
const NEAR = 45;                 // how close counts as being at the benches
const SHOUT = 8, SHOUT_LOUD = 14;
const SHOUT_EVERY = 5;
const STARE = 1.5, STARE_RANGE = 22, STARE_COS = 0.985;
const POO_R = 1.3, BOMB_R = 2.3;
const BOSS_SCALE = 9;              // Big Lad: about 12 m wing tip to wing tip
const BEST_KEY = "cd-gulls-best";

// what kind of gull, and what it's doing
const HERRING = 0, HOVER = 1, GANG = 2, WALKER = 3, POOPER = 4;
const ARRIVE = 0, CIRCLE = 1, SWOOP = 2, CARRY = 3, FLEE = 4, HOLD = 5, WALK = 6, PASS = 7, CHIPS = 8, GONE = 9;
const COST = [1, 2, 4, 2, 2];
const POINTS = [10, 15, 5, 15, 15];
/** Which kinds turn up in each wave (1 to 5). */
const KINDS_IN: number[][] = [[], [HERRING], [HERRING, HOVER], [HERRING, HOVER, GANG, WALKER], [HERRING, HOVER, GANG, WALKER, POOPER], [HERRING, HOVER, WALKER, POOPER]];
const BUDGET = [0, 6, 9, 13, 17, 8];
const WEIGHT = [3, 2, 1.2, 1.5, 1.5];
const WAVE_SAY = ["", "Here they come", "Hoverers: stare them out", "A gang, and walkers sneaking up behind", "Poopers overhead", "BIG LAD"];

// Big Lad
const B_ARRIVE = 0, B_PERCH = 1, B_RUN = 2, B_PASS = 3, B_BACK = 4, B_DIVE = 5, B_DEAD = 6;

// the upgrades in the crates
const CHIPS_UP = 0, OWL_UP = 1, BROLLY_UP = 2, LOUD_UP = 3, HELPING_UP = 4;
const UP_NAME = ["Bucket of chips", "Plastic owl", "Brolly", "Megaphone", "Second helpings"];
const UP_SAY = ["throw it down (E) and the gulls go for the chips", "stood by the tourist with most left", "up over the tourist with most left: it stops one swoop", "your shouts reach further, and come round faster", "a bite back for every tourist still here"];

// each day's twist
const MODS = ["", "Bank holiday", "Chip Tuesday", "Hen do", "Bin day", ""];
const MOD_SAY = ["", "Crowds out: an extra tourist, and more gulls.", "Chips in every crate, and a bucket to start each wave.", "One of the tourists is a hen party, with six sandwiches.", "Walkers everywhere, picking through the bins."];

// what just happened, sent with the state for the sounds, feathers and words
const FX_PUFF = 0, FX_STEAL = 1, FX_SAVE = 2, FX_POO = 3, FX_BOMB = 4, FX_BROLLY = 5, FX_OWL = 6, FX_STORM = 7, FX_SHOUT = 8,
  FX_SCREECH = 9, FX_BOSSDOWN = 10, FX_WAVE = 11, FX_CLEAN = 12, FX_GRAB = 13, FX_CRY = 14, FX_PICK = 15, FX_PULL = 16, FX_HIT = 17, FX_DIVE = 18;
type Fx = number[];

const TOURIST_LINES = ["Oi! That bird's had my panini!", "My sandwich! Did you see that?", "It took it right out of my hand!", "Shoo! SHOO!", "That was a twelve pound sandwich!", "Is this normal here?"];

interface Gull {
  i: number; gen: number; k: number; ph: number;
  x: number; y: number; z: number; yaw: number;
  t: number; tgt: number; a: number; hy: number;
  ex: number; ey: number; ez: number;     // where it's headed (off over the roofs, or the far side of a pass)
  carry: number;                          // the tourist whose bite it's got, or -1
  drops: number; dropT: number;
}
interface Tourist { x: number; z: number; y: number; yaw: number; bites: number; max: number; brolly: boolean; owl: boolean; gone: boolean }
interface Bomb { x: number; y: number; z: number; vy: number; big: boolean }
interface Boss {
  ph: number; x: number; y: number; z: number; yaw: number; hp: number; top: number; t: number; tgt: number; took: number;
  px: number; py: number; pz: number; ax: number; az: number; bx: number; bz: number; dropT: number; screeched: boolean;
}

/** Everything about a go, as the host has it and as it's sent round. */
interface State {
  w: number;              // the wave, 1..5 (0 before the first)
  ph: number;             // 0: the lull before wave w+1, 1: wave w on, 2: over
  t: number;              // seconds to the next wave, in a lull
  sc: number;
  cx: number; cz: number; // the middle
  tr: Tourist[];
  up: number[];           // the crates out, in a lull (-1: taken)
  ch: number;             // buckets of chips the team has
  chip: { x: number; z: number; t: number } | null;
  loud: boolean;
  clean: boolean;         // no bite lost this wave so far
  bc: boolean;            // nor in the last wave, so far
  won: boolean;
}

registerJob({
  id: "gulls", glyph: "G", colour: COLOUR, label: "Seagull Attack", again: true,
  goal: () => `Keep the sandwiches out of the gulls' beaks for ${WAVES} waves`,
  offer(r: Rng, spot: PostSpot) {
    const mod = dayNumber() % MODS.length, stars = 1 + Math.floor(r() * 3);
    const o: Offer = {
      kind: "gulls", seed: hash("gulls", r() * 1e9), stars, x: spot.x, z: spot.z, where: spot.name, mode: mod,
      title: MODS[mod] ? `Seagull Attack: ${MODS[mod]}` : spot.pub ? "Seagull Attack in the beer garden" : "Seagull Attack",
      blurb: `Tourists on the benches with their sandwiches, and the gulls of Bath want them. Five waves, then Big Lad himself. `
        + `Shoot them, stare them out, shout (E) at a gang, and save a stolen bite by shooting the thief before it reaches the roofs. `
        + (MOD_SAY[mod] ? `Today: ${MOD_SAY[mod]} ` : ""),
      reward: `${stars} prize${stars > 1 ? "s" : ""}, and a seagull for your head for three stars`,
    };
    const best = bestAt(spot.name);
    if (best) o.blurb += `Your best here: ${best}.`;
    return o;
  },
  start: (o, w, _started, _by, local) => new Seagulls(o, w, !!local),
});

function bestAt(where: string): number {
  try { return Number(JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}")[where]) || 0; } catch { return 0; }
}
function keepBest(where: string, score: number) {
  try {
    const all = JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}");
    if (!(Number(all[where]) >= score)) { all[where] = score; localStorage.setItem(BEST_KEY, JSON.stringify(all)); }
  } catch { /* ignore */ }
}

/** A test for whether a spot's clear of the streets round (x, z): not in a building or a wall, and
 *  off the carriageway (footpaths are fine), so the benches go on a pavement, a green or a square. */
function spotTest(map: GameMap, x: number, z: number, r: number) {
  const segs: number[][] = [];
  for (const rd of [...map.areas().flatMap((a) => a.d.rd), ...map.wide?.rd ?? []]) {
    if (PATHS.has(rd.c) || rd.p.length < 2) continue;
    const half = (rd.w ?? 7) / 2 + 1.8;
    for (let k = 0; k < rd.p.length - 1; k++) {
      const a = rd.p[k], b = rd.p[k + 1];
      if (Math.min(a[0], b[0]) > x + r || Math.max(a[0], b[0]) < x - r || Math.min(-a[1], -b[1]) > z + r || Math.max(-a[1], -b[1]) < z - r) continue;
      segs.push([a[0], -a[1], b[0], -b[1], half]);
    }
  }
  return (px: number, pz: number) => {
    if (map.blocked(px, pz, 1) || map.indoors(px, pz)) return false;
    for (const [ax, az, bx, bz, half] of segs) {
      const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2));
      if (Math.hypot(px - ax - vx * t, pz - az - vz * t) < half) return false;
    }
    return true;
  };
}

// ---- models -------------------------------------------------------------------------------------

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const cyl = (rt: number, rb: number, h: number, x = 0, y = 0, z = 0, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);

/** A flying gull's body, facing -z, head colour as given (white, or dark for a black-headed gull). */
function gullBody(head: string) {
  return part([
    [ball(0.13, 0, 0, 0, 0.9, 0.8, 2.0), "#f4f4f2"],
    [ball(0.085, 0, 0.08, -0.26), head],
    [box(0.03, 0.026, 0.11, 0, 0.065, -0.37), "#f2c230"],
    [box(0.032, 0.014, 0.02, 0, 0.055, -0.4), "#d23a2a"],
    [ball(0.013, -0.055, 0.1, -0.3), "#1b1b1d"],
    [ball(0.013, 0.055, 0.1, -0.3), "#1b1b1d"],
    [box(0.16, 0.03, 0.14, 0, 0.02, 0.28), "#f4f4f2"],
    [box(0.16, 0.032, 0.05, 0, 0.02, 0.36), "#1b1b1d"],
    [box(0.025, 0.06, 0.025, -0.04, -0.13, 0.08), "#e79a8c"],
    [box(0.025, 0.06, 0.025, 0.04, -0.13, 0.08), "#e79a8c"],
  ]);
}
/** One wing, from the shoulder out along -x (side -1) or +x (side 1). */
function gullWing(side: number) {
  return part([
    [box(0.6, 0.025, 0.22, side * 0.32, 0.03, 0), "#9aa3ad"],
    [box(0.2, 0.026, 0.17, side * 0.7, 0.03, 0.02), "#1b1b1d"],
    [ball(0.018, side * 0.74, 0.045, 0.03), "#f4f4f2"],
  ]);
}

/** A bench, facing +z, and a tourist sat on it in a bucket hat with a camera round their neck. */
function benchGeo() {
  const wood = "#7a5534", iron = "#2a2c2e";
  return part([
    [box(1.7, 0.05, 0.42, 0, 0.45, 0), wood],
    [box(1.7, 0.3, 0.04, 0, 0.75, -0.21), wood],
    [box(0.06, 0.45, 0.4, -0.78, 0.22, 0), iron],
    [box(0.06, 0.45, 0.4, 0.78, 0.22, 0), iron],
    [box(0.06, 0.4, 0.06, -0.78, 0.7, -0.21), iron],
    [box(0.06, 0.4, 0.06, 0.78, 0.7, -0.21), iron],
  ]);
}
function touristGeo(r: Rng, hen: boolean) {
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const skin = pick(["#efcdb4", "#e6bd9f", "#d4a283", "#b57d5c", "#8d5a3b", "#f2b8a0"]);
  const shirt = hen ? "#f45ca8" : pick(["#e8473d", "#f2c230", "#3fa7d6", "#59c36a", "#f28c38", "#ffffff", "#8e6bd6"]);
  const shorts = pick(["#c8b48a", "#3a4f7a", "#6e7d4a", "#d9d2c0"]);
  const hat = hen ? "#f8e1ef" : pick(["#f4ecd4", "#e7e2d4", "#3a4f7a", "#d23a2a", "#1b1b1d"]);
  const pieces: Piece[] = [
    [box(0.38, 0.14, 0.44, 0, 0.54, 0.14), shorts],
    [box(0.13, 0.44, 0.13, -0.1, 0.25, 0.34), skin],
    [box(0.13, 0.44, 0.13, 0.1, 0.25, 0.34), skin],
    [box(0.14, 0.05, 0.22, -0.1, 0.025, 0.38), "#5a3d22"],
    [box(0.14, 0.05, 0.22, 0.1, 0.025, 0.38), "#5a3d22"],
    [box(0.42, 0.52, 0.25, 0, 0.86, -0.04), shirt],
    [box(0.11, 0.28, 0.12, -0.26, 0.92, 0), shirt],
    [box(0.11, 0.28, 0.12, 0.26, 0.92, 0), shirt],
    [box(0.09, 0.09, 0.3, -0.17, 0.8, 0.16).rotateY(0.35), skin],
    [box(0.09, 0.09, 0.3, 0.17, 0.8, 0.16).rotateY(-0.35), skin],
    [cyl(0.06, 0.065, 0.1, 0, 1.15, -0.03), skin],
    [ball(0.14, 0, 1.3, -0.02), skin],
    [ball(0.02, -0.05, 1.32, 0.11), "#2a2220"],
    [ball(0.02, 0.05, 1.32, 0.11), "#2a2220"],
    [box(0.06, 0.014, 0.012, 0, 1.25, 0.12), "#8a3a3a"],
    [cyl(0.15, 0.17, 0.1, 0, 1.42, -0.02, 14), hat],
    [cyl(0.25, 0.25, 0.02, 0, 1.38, -0.02, 16), hat],
    [box(0.13, 0.08, 0.07, 0.07, 0.98, 0.12), "#1b1b1d"],
    [cyl(0.025, 0.025, 0.03, 0.07, 0.98, 0.165, 10).rotateX(Math.PI / 2).translate(0, 0, 0), "#3a4c5c"],
  ];
  if (hen) pieces.push([box(0.05, 0.6, 0.27, 0.02, 0.88, -0.04).rotateZ(0.6), "#ffffff"], [box(0.24, 0.04, 0.04, 0, 1.47, 0.08), "#f2c230"]);
  return part(pieces);
}
/** For the characters page: a gull (scale 1.6 white-headed, 1.25 black-headed, BOSS_SCALE for Big
 *  Lad), facing -z, with its wings to flap (rotation.z). */
export function gullFigure(head: string, s: number) {
  const g = new THREE.Group(), wl = new THREE.Mesh(gullWing(-1).scale(s, s, s), MAT), wr = new THREE.Mesh(gullWing(1).scale(s, s, s), MAT);
  wl.position.set(-0.05 * s, 0.05 * s, 0); wr.position.set(0.05 * s, 0.05 * s, 0);
  g.add(new THREE.Mesh(gullBody(head).scale(s, s, s), MAT), wl, wr);
  return { g, wl, wr };
}
export { BOSS_SCALE };
/** For the characters page: a tourist on their bench, sandwich in hand (a hen party's in pink with a sash). */
export function touristOnBench(seed: number, hen: boolean) {
  const g = new THREE.Group(), r = rng(seed);
  const sandwich = new THREE.Mesh(sandwichGeo(), MAT);
  sandwich.position.set(0, 0.82, 0.32);
  g.add(new THREE.Mesh(benchGeo(), MAT), new THREE.Mesh(touristGeo(r, hen), MAT), sandwich);
  return g;
}

/** A sandwich held in both hands, three layers. */
function sandwichGeo() {
  return part([
    [box(0.2, 0.03, 0.13, 0, -0.03, 0), "#e8c890"],
    [box(0.21, 0.02, 0.135, 0, 0, 0), "#5cb04a"],
    [box(0.19, 0.015, 0.12, 0, 0.016, 0), "#d2443a"],
    [box(0.2, 0.03, 0.13, 0, 0.038, 0), "#e8c890"],
  ]);
}
function brollyGeo() {
  return part([
    [cyl(0.015, 0.015, 1.9, 0.3, 1.0, -0.1, 6), "#2a2a2a"],
    [new THREE.ConeGeometry(0.75, 0.3, 8, 1, true).translate(0.3, 2.0, -0.1), "#d23a2a"],
    [ball(0.03, 0.3, 2.16, -0.1), "#2a2a2a"],
  ]);
}
function owlGeo() {
  return part([
    [ball(0.1, 0.62, 0.6, 0.02, 0.9, 1.3, 0.85), "#7a5536"],
    [ball(0.07, 0.62, 0.58, 0.07, 0.9, 1.1, 0.6), "#d9c29a"],
    [ball(0.08, 0.62, 0.78, 0.02, 1.1, 0.9, 0.95), "#7a5536"],
    [ball(0.03, 0.59, 0.79, 0.085), "#f2c230"],
    [ball(0.03, 0.65, 0.79, 0.085), "#f2c230"],
    [ball(0.014, 0.59, 0.79, 0.11), "#1b1b1d"],
    [ball(0.014, 0.65, 0.79, 0.11), "#1b1b1d"],
    [box(0.02, 0.03, 0.03, 0.62, 0.75, 0.1), "#c99a2a"],
  ]);
}
function crateGeo() {
  return part([
    [box(0.8, 0.6, 0.8, 0, 0.3, 0), "#a5773f"],
    [box(0.82, 0.08, 0.82, 0, 0.58, 0), "#7a5534"],
    [box(0.82, 0.08, 0.82, 0, 0.04, 0), "#7a5534"],
    [box(0.84, 0.06, 0.1, 0, 0.3, 0).rotateY(0), "#7a5534"],
  ]);
}
function chipsGeo() {
  const p: Piece[] = [[cyl(0.16, 0.12, 0.28, 0, 0.14, 0, 12), "#d23a2a"], [cyl(0.161, 0.135, 0.1, 0, 0.14, 0, 12), "#f4f4f2"]];
  for (let k = 0; k < 9; k++) { const a = k * 2.4; p.push([box(0.03, 0.18, 0.03, Math.cos(a) * 0.08, 0.32, Math.sin(a) * 0.08).rotateZ((k % 3 - 1) * 0.2), "#f2c84a"]); }
  return part(p);
}
function label(text: string) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(text), depthTest: false, transparent: true }));
  s.scale.set(2.2, 0.55, 1);
  s.renderOrder = 10;
  return s;
}
function labelTex(text: string) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const x = c.getContext("2d")!;
  x.fillStyle = "rgba(20,22,28,0.85)"; x.fillRect(0, 16, 512, 96);
  x.fillStyle = "#fff"; x.font = "700 52px 'Barlow Condensed', Impact, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- what everyone draws ------------------------------------------------------------------------

interface GullView { gen: number; k: number; ph: number; x: number; y: number; z: number; yaw: number; tx: number; ty: number; tz: number; tyaw: number; flap: number; stare: number; stared: boolean }
interface TouristView { g: THREE.Group; person: THREE.Group; sandwich: THREE.Mesh; brolly: THREE.Mesh; owl: THREE.Mesh; leave: number }

const _m = new THREE.Matrix4(), _w = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

class Seagulls implements Job {
  done: Job["done"] = null;
  private S: State;
  private gulls: Gull[] = [];
  private lad: Boss | null = null;
  private bombs: Bomb[] = [];
  private queue: { at: number; k: number }[] = [];
  private waveT = 0;
  private sendT = 0;
  private fxNet: Fx[] = [];
  private fxLocal: Fx[] = [];
  private r: Rng;
  private ready = false;          // the host has set the benches out
  private players = 1;
  private mod: number;
  private stats = { pooed: false, bossPoo: false };
  // what everyone draws
  private root = new THREE.Group();
  private view = new Map<number, GullView>();
  private bossView: { g: THREE.Group; wl: THREE.Mesh; wr: THREE.Mesh; shadow: THREE.Mesh; x: number; y: number; z: number; yaw: number; tx: number; ty: number; tz: number; tyaw: number; ph: number; hp: number; top: number; flap: number } | null = null;
  private bodies: THREE.InstancedMesh;
  private darkBodies: THREE.InstancedMesh;
  private wingsL: THREE.InstancedMesh;
  private wingsR: THREE.InstancedMesh;
  private shadows: THREE.InstancedMesh;
  private tv: TouristView[] = [];
  private crates: { g: THREE.Group; lab: THREE.Sprite; k: number }[] = [];
  private chipsView: THREE.Mesh;
  private bombView: { blob: THREE.Mesh; ring: THREE.Mesh }[] = [];
  private bombsSeen: number[][] = [];
  private feathers: THREE.Points;
  private fv: Float32Array;          // the feathers' velocities, and how long each has left
  private fl: Float32Array;
  private fNext = 0;
  private splat: HTMLDivElement | null = null;
  private splatT = 0;
  private shoutT = 0;
  private seenTourists = "";

  constructor(readonly offer: Offer, private w: QuestWorld, private local: boolean) {
    this.r = rng(offer.seed ^ 0x5eaf00d);
    this.mod = offer.mode ?? 0;
    this.S = { w: 0, ph: 0, t: FIRST, sc: 0, cx: offer.x, cz: offer.z, tr: [], up: [], ch: 0, chip: null, loud: false, clean: true, bc: true, won: false };
    // the gulls: bodies (white-headed and black-headed), wings and shadows, one draw each
    const inst = (g: THREE.BufferGeometry, m: THREE.Material = MAT) => { const im = new THREE.InstancedMesh(g, m, MAX_GULLS); im.count = 0; im.frustumCulled = false; this.root.add(im); return im; };
    this.bodies = inst(gullBody("#f4f4f2").scale(1.6, 1.6, 1.6));
    this.darkBodies = inst(gullBody("#3a3030").scale(1.25, 1.25, 1.25));
    this.wingsL = inst(gullWing(-1).scale(1.6, 1.6, 1.6));
    this.wingsR = inst(gullWing(1).scale(1.6, 1.6, 1.6));
    this.shadows = inst(new THREE.CircleGeometry(0.6, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.35, depthWrite: false }));
    this.chipsView = new THREE.Mesh(chipsGeo(), MAT);
    this.chipsView.visible = false;
    this.root.add(this.chipsView);
    for (let k = 0; k < 24; k++) {
      const blob = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshLambertMaterial({ color: "#f6f6ee", emissive: "#6a6a60" }));
      const ring = new THREE.Mesh(new THREE.RingGeometry(BOMB_R - 0.25, BOMB_R, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }));
      blob.visible = ring.visible = false;
      this.root.add(blob, ring);
      this.bombView.push({ blob, ring });
    }
    // feathers
    const N = 360, pos = new Float32Array(N * 3).fill(-9999);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.feathers = new THREE.Points(fg, new THREE.PointsMaterial({ color: "#f8f8f4", size: 0.12, sizeAttenuation: true }));
    this.feathers.frustumCulled = false;
    this.fv = new Float32Array(N * 3);
    this.fl = new Float32Array(N);
    this.root.add(this.feathers);
    w.scene.add(this.root);
    w.mark("@gulls", { x: offer.x, z: offer.z }, "Seagull Attack", COLOUR);
    if (this.owner) this.setUp();
  }

  /** This machine runs the gulls: the host, or anyone on a go of their own. */
  private get owner() { return this.local || this.w.isHost; }

  // ---- the host: setting out, and running it all ---------------------------------------------

  private setUp() {
    const w = this.w, S = this.S, r = this.r;
    // the middle of it all: near the noticeboard, where most of a ring of benches would be off the street
    const ok = spotTest(w.map, this.offer.x, this.offer.z, 50), a0 = r() * Math.PI * 2;
    let cx = this.offer.x, cz = this.offer.z, best = -1;
    for (const d of [8, 12, 16, 5, 20]) for (let k = 0; k < 10; k++) {
      const a = a0 + (k / 10) * Math.PI * 2, x = this.offer.x + Math.cos(a) * d, z = this.offer.z + Math.sin(a) * d;
      let n = ok(x, z) ? 2 : 0;
      for (let m = 0; m < 12; m++) if (ok(x + Math.cos(m * 0.52) * RING, z + Math.sin(m * 0.52) * RING)) n++;
      if (n > best) { best = n; cx = x; cz = z; }
    }
    if (best < 2) { const c = clearSpot(w.map, cx, cz, 10); if (c) { cx = c[0]; cz = c[1]; } }
    S.cx = cx; S.cz = cz;
    this.players = this.local ? 1 : Math.max(1, w.players().length);
    const n = Math.min(6, 3 + this.players - 1) + (this.mod === 1 ? 1 : 0);
    // the benches round it, spread out, on the spots that are off the street
    const free = Array.from({ length: 24 }, (_, m) => (m / 24) * Math.PI * 2).filter((a) => ok(cx + Math.cos(a) * RING, cz + Math.sin(a) * RING));
    const angles: number[] = [];
    const start = r() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const want = start + (k / n) * Math.PI * 2;
      const pickA = free.filter((a) => angles.every((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) > 0.5))
        .sort((a, b) => Math.abs(Math.atan2(Math.sin(a - want), Math.cos(a - want))) - Math.abs(Math.atan2(Math.sin(b - want), Math.cos(b - want))))[0];
      angles.push(pickA ?? want);
    }
    for (let k = 0; k < n; k++) {
      const a = angles[k];
      let x = cx + Math.cos(a) * RING, z = cz + Math.sin(a) * RING;
      if (!ok(x, z)) { const s = clearSpot(w.map, x, z, 4); if (s) { x = s[0]; z = s[1]; } }
      const max = this.mod === 3 && k === 0 ? 6 : 3;
      S.tr.push({ x, z, y: w.map.ground(x, z), yaw: Math.atan2(cx - x, cz - z), bites: max, max, brolly: false, owl: false, gone: false });
    }
    for (let i = 0; i < MAX_GULLS; i++) this.gulls.push(this.blankGull(i));
    this.ready = true;
  }

  private blankGull(i: number): Gull {
    return { i, gen: 0, k: 0, ph: GONE, x: 0, y: 0, z: 0, yaw: 0, t: 0, tgt: -1, a: 0, hy: 0, ex: 0, ey: 0, ez: 0, carry: -1, drops: 0, dropT: 0 };
  }

  /** Taking over as host part way through: carry on from the last state that came round. */
  private takeOver() {
    if (!this.S.tr.length) { this.setUp(); return; }
    this.players = Math.max(1, this.w.players().length);
    this.gulls = [];
    for (let i = 0; i < MAX_GULLS; i++) this.gulls.push(this.blankGull(i));
    // the gulls that were about give up; Big Lad goes back to his roof
    for (const [i, v] of this.view) {
      if (v.ph === GONE || i >= MAX_GULLS) continue;
      Object.assign(this.gulls[i], { gen: v.gen, k: v.k, x: v.x, y: v.y, z: v.z });
      this.flee(this.gulls[i]);
    }
    const bv = this.bossView;
    if (bv && bv.ph !== B_DEAD) {
      this.lad = this.newBoss(bv.top);
      Object.assign(this.lad, { x: bv.x, y: bv.y, z: bv.z, hp: bv.hp, ph: B_BACK });
    }
    if (this.S.ph === 1) this.queue = [];
    this.ready = true;
  }

  private emit(f: Fx) { this.fxLocal.push(f); if (!this.local) this.fxNet.push(f); }

  private live() { return this.gulls.filter((g) => g.ph !== GONE); }

  private spawn(k: number, n = 1) {
    const S = this.S, r = this.r, gy = this.w.map.ground(S.cx, S.cz);
    const a = r() * Math.PI * 2;
    for (let m = 0; m < n; m++) {
      const g = this.gulls.find((o) => o.ph === GONE);
      if (!g) return;
      g.gen = (g.gen + 1) & 1023; g.k = k; g.carry = -1; g.drops = 0; g.dropT = 0; g.tgt = -1;
      const aa = a + (m - (n - 1) / 2) * 0.12;
      if (k === WALKER) {
        // lands out of sight, behind the benches from where everyone's stood
        const pl = this.w.players().filter((p) => Math.hypot(p.x - S.cx, p.z - S.cz) < NEAR);
        const px = pl.length ? pl.reduce((s, p) => s + p.x, 0) / pl.length : S.cx, pz = pl.length ? pl.reduce((s, p) => s + p.z, 0) / pl.length : S.cz;
        const back = pl.length ? Math.atan2(S.cz - pz, S.cx - px) : a;
        const ba = back + (r() - 0.5) * 1.2;
        let x = S.cx + Math.cos(ba) * 22, z = S.cz + Math.sin(ba) * 22;
        const c = clearSpot(this.w.map, x, z, 6);
        if (c) { x = c[0]; z = c[1]; }
        Object.assign(g, { x, z, y: this.w.map.ground(x, z), ph: WALK, tgt: this.target(false) });
      } else if (k === POOPER) {
        Object.assign(g, { x: S.cx + Math.cos(aa) * 55, z: S.cz + Math.sin(aa) * 55, y: gy + 14, ex: S.cx - Math.cos(aa) * 55, ez: S.cz - Math.sin(aa) * 55, ey: gy + 11, ph: PASS });
      } else {
        Object.assign(g, { x: S.cx + Math.cos(aa) * 60, z: S.cz + Math.sin(aa) * 60, y: gy + 24 + r() * 6, a: aa, hy: gy + 11 + r() * 5, ph: ARRIVE, t: k === GANG ? 1.2 + m * 0.35 : 2 + r() * 3 });
      }
      if (m === 0 && r() < 0.6) this.emit([FX_CRY, g.x, g.y, g.z]);
    }
  }

  /** A tourist to go for: one with something left, keeping off any with an owl unless walking. */
  private target(owlsToo: boolean): number {
    const ok = this.S.tr.map((t, k) => ({ t, k })).filter(({ t }) => !t.gone && t.bites > 0 && (owlsToo || !t.owl));
    if (!ok.length) return -1;
    return ok[Math.floor(this.r() * ok.length)].k;
  }
  private bite(k: number) {
    const t = this.S.tr[k], f = new THREE.Vector3(Math.sin(t.yaw), 0, Math.cos(t.yaw));
    return { x: t.x + f.x * 0.32, y: t.y + 0.82, z: t.z + f.z * 0.32 };
  }

  private flee(g: Gull) {
    const S = this.S, a = Math.atan2(g.z - S.cz, g.x - S.cx) + (this.r() - 0.5);
    g.ph = FLEE; g.t = 4;
    g.ex = S.cx + Math.cos(a) * 60; g.ez = S.cz + Math.sin(a) * 60; g.ey = this.w.map.ground(S.cx, S.cz) + 30;
  }
  private escape(g: Gull) {
    // off with it to a rooftop
    const S = this.S, a = Math.atan2(g.z - S.cz, g.x - S.cx) + (this.r() - 0.5) * 0.8;
    g.ph = CARRY;
    g.ex = S.cx + Math.cos(a) * 45; g.ez = S.cz + Math.sin(a) * 45; g.ey = this.w.map.ground(S.cx, S.cz) + 20;
  }

  /** Move towards (x, y, z) at speed; true once there. */
  private static step(o: { x: number; y: number; z: number; yaw: number }, x: number, y: number, z: number, speed: number, dt: number) {
    const dx = x - o.x, dy = y - o.y, dz = z - o.z, d = Math.hypot(dx, dy, dz), s = speed * dt;
    if (Math.hypot(dx, dz) > 0.05) o.yaw = Math.atan2(dx, dz);
    if (d <= s) { o.x = x; o.y = y; o.z = z; return true; }
    o.x += (dx / d) * s; o.y += (dy / d) * s; o.z += (dz / d) * s;
    return false;
  }

  /** A gull's got to a sandwich: a bite, unless there's a brolly up. */
  private grab(g: Gull, k: number) {
    const t = this.S.tr[k];
    if (t.gone || t.bites <= 0) { this.flee(g); return; }
    if (t.brolly) { t.brolly = false; this.emit([FX_BROLLY, g.x, g.y, g.z, k]); this.flee(g); return; }
    t.bites--;
    this.lose();
    g.carry = k;
    this.emit([FX_STEAL, g.x, g.y, g.z, k]);
    if (t.bites <= 0) { t.gone = true; this.emit([FX_STORM, t.x, t.y, t.z, k]); }
    this.escape(g);
  }
  private lose() { this.S.clean = false; if (this.S.w === WAVES) this.S.bc = false; }

  /** A gull's been seen off, by whoever: points, feathers, and the bite back if it had one. */
  private driveOff(g: Gull, pts: number, how: number) {
    if (g.carry >= 0) {
      const t = this.S.tr[g.carry];
      if (!t.gone) { t.bites = Math.min(t.max, t.bites + 1); pts += 15; }
      this.emit([FX_SAVE, g.x, g.y, g.z, g.carry]);
      g.carry = -1;
    }
    this.S.sc += pts;
    this.emit([how, g.x, g.y, g.z, g.k]);
    this.flee(g);
  }

  private hostUpdate(dt: number) {
    const S = this.S;
    if (!this.ready) return;
    if (S.ph === 0) {
      S.t -= dt;
      if (S.t <= 0) this.startWave();
    } else if (S.ph === 1) this.runWave(dt);
    this.runGulls(dt);
    this.runBoss(dt);
    this.runBombs(dt);
    if (S.chip && (S.chip.t -= dt) <= 0) S.chip = null;
    // all the sandwiches gone: that's it
    if (S.ph !== 2 && S.tr.length && S.tr.every((t) => t.gone)) this.over(false);
  }

  private startWave() {
    const S = this.S, r = this.r;
    S.w++; S.ph = 1; S.up = []; S.clean = true;
    if (this.mod === 2) S.ch++;
    const mul = [0, 0.75, 1, 1.3][this.offer.stars] * (1 + 0.4 * (this.players - 1)) * (this.mod === 1 ? 1.15 : 1);
    let budget = Math.round(BUDGET[S.w] * mul);
    const kinds = KINDS_IN[S.w], times: number[] = [];
    const list: number[] = [];
    while (budget > 0) {
      const ok = kinds.filter((k) => (this.mod === 4 && k === WALKER ? 1 : COST[k]) <= budget);
      if (!ok.length) break;
      const weight = (k: number) => (this.mod === 4 && k === WALKER ? 4 : WEIGHT[k]);
      let roll = r() * ok.reduce((s, k) => s + weight(k), 0), k = ok[0];
      for (const kk of ok) { roll -= weight(kk); if (roll <= 0) { k = kk; break; } }
      list.push(k);
      budget -= this.mod === 4 && k === WALKER ? 1 : COST[k];
    }
    for (let k = 0; k < list.length; k++) times.push(1 + r() * 28);
    times.sort((a, b) => a - b);
    this.queue = list.map((k, n) => ({ at: times[n], k }));
    this.waveT = 0;
    if (S.w === WAVES) this.lad = this.newBoss(Math.round((50 + 25 * (this.players - 1)) * [0, 0.8, 1, 1.2][this.offer.stars]));
    this.emit([FX_WAVE, S.w]);
  }

  private runWave(dt: number) {
    const S = this.S;
    this.waveT += dt;
    const live = this.live().length;
    while (this.queue.length && this.queue[0].at <= this.waveT && live < LIVE_CAP) {
      const q = this.queue.shift()!;
      this.spawn(q.k, q.k === GANG ? 5 : 1);
    }
    if (this.queue.length && this.queue[0].at <= this.waveT) this.queue[0].at = this.waveT + 1;
    // a wave that drags on: the stragglers give up
    if (this.waveT > 75) { this.queue = []; for (const g of this.live()) if (g.ph !== FLEE && g.ph !== CARRY) this.flee(g); }
    const bossUp = !!this.lad && this.lad.ph !== B_DEAD;
    if (!this.queue.length && !bossUp && !this.live().some((g) => g.ph !== FLEE)) {
      if (S.clean) { S.sc += 50; this.emit([FX_CLEAN, S.w]); }
      if (S.w >= WAVES) { this.over(true); return; }
      S.ph = 0; S.t = LULL;
      // three crates to pick from
      const r = this.r, all = this.mod === 2 ? [CHIPS_UP] : [];
      const rest = [CHIPS_UP, OWL_UP, BROLLY_UP, LOUD_UP, HELPING_UP].filter((u) => !all.includes(u) && !(u === LOUD_UP && S.loud));
      while (all.length < 3 && rest.length) all.push(rest.splice(Math.floor(r() * rest.length), 1)[0]);
      S.up = all;
    }
  }

  private over(won: boolean) {
    const S = this.S;
    S.ph = 2;
    S.won = won && S.tr.some((t) => !t.gone && t.bites > 0);
    for (const g of this.live()) if (g.ph !== FLEE) this.flee(g);
  }

  private runGulls(dt: number) {
    const S = this.S, gy = this.w.map.ground(S.cx, S.cz);
    for (const g of this.gulls) {
      if (g.ph === GONE) continue;
      const chip = S.chip;
      // chips down: anything that hasn't got a bite goes for them instead
      if (chip && g.carry < 0 && (g.ph === ARRIVE || g.ph === CIRCLE || g.ph === HOLD || g.ph === SWOOP || g.ph === WALK) && Math.hypot(g.x - chip.x, g.z - chip.z) < 40) {
        g.ph = CHIPS; g.a = this.r() * Math.PI * 2;
      }
      switch (g.ph) {
        case ARRIVE: {
          const R = 15, x = S.cx + Math.cos(g.a) * R, z = S.cz + Math.sin(g.a) * R;
          if (Seagulls.step(g, x, g.hy, z, 11, dt)) g.ph = CIRCLE;
          break;
        }
        case CIRCLE: {
          const R = 15;
          g.a += (9 / R) * dt * (g.i % 2 ? 1 : -1);
          Seagulls.step(g, S.cx + Math.cos(g.a) * R, g.hy + Math.sin(g.a * 3) * 0.6, S.cz + Math.sin(g.a) * R, 12, dt);
          if ((g.t -= dt) <= 0) {
            g.tgt = this.target(false);
            if (g.tgt < 0) { g.t = 2; if (!S.tr.some((t) => !t.gone)) this.flee(g); break; }
            if (g.k === HOVER) { g.ph = HOLD; g.t = 4.5; } else g.ph = SWOOP;
          }
          break;
        }
        case HOLD: {
          // hanging in the wind over a bench, then straight down
          const b = this.bite(g.tgt), t = S.tr[g.tgt];
          if (t.gone || t.owl) { g.ph = CIRCLE; g.t = 1; break; }
          const there = Seagulls.step(g, b.x, b.y + 7, b.z, 8, dt);
          if (there && (g.t -= dt) <= 0) g.ph = SWOOP;
          break;
        }
        case SWOOP: {
          const t = S.tr[g.tgt];
          if (!t || t.gone) { g.ph = CIRCLE; g.t = 1; break; }
          const b = this.bite(g.tgt);
          if (Seagulls.step(g, b.x, b.y, b.z, g.k === GANG ? 12 : g.k === HOVER ? 10 : 11, dt)) this.grab(g, g.tgt);
          break;
        }
        case WALK: {
          const t = S.tr[g.tgt];
          if (!t || t.gone) { g.tgt = this.target(true); if (g.tgt < 0) { this.flee(g); } break; }
          const f = new THREE.Vector3(Math.sin(t.yaw), 0, Math.cos(t.yaw));
          const bx = t.x - f.x * 0.6, bz = t.z - f.z * 0.6;
          const there = Seagulls.step(g, bx, this.w.map.ground(g.x, g.z), bz, 1.5, dt);
          if (there) {
            if (t.owl) { t.owl = false; this.emit([FX_OWL, t.x, t.y, t.z, g.tgt]); }
            g.y = t.y + 0.6;
            this.grab(g, g.tgt);
          }
          break;
        }
        case PASS: {
          // across the benches, dropping on anyone underneath
          if ((g.dropT -= dt) <= 0 && g.drops < 3) {
            const under = [...S.tr.filter((t) => !t.gone), ...this.w.players()].some((p) => Math.hypot(p.x - g.x, p.z - g.z) < 2.2);
            if (under) { this.bombs.push({ x: g.x, y: g.y - 0.3, z: g.z, vy: 0, big: false }); g.drops++; g.dropT = 1.2; }
          }
          if (Seagulls.step(g, g.ex, g.ey, g.ez, 8, dt)) g.ph = GONE;
          break;
        }
        case CHIPS: {
          if (!chip) { this.flee(g); break; }
          const x = chip.x + Math.cos(g.a) * 0.9, z = chip.z + Math.sin(g.a) * 0.9;
          if (Seagulls.step(g, x, this.w.map.ground(x, z) + 0.15, z, 10, dt)) g.yaw = Math.atan2(chip.x - g.x, chip.z - g.z);
          break;
        }
        case CARRY:
          if (Seagulls.step(g, g.ex, g.ey, g.ez, 7, dt)) { g.ph = GONE; g.carry = -1; }
          break;
        case FLEE:
          if (Seagulls.step(g, g.ex, g.ey, g.ez, 11, dt) || (g.t -= dt) <= 0) { g.ph = GONE; g.carry = -1; }
          break;
      }
      if (g.y < gy - 50) g.ph = GONE;
    }
  }

  private newBoss(top: number): Boss {
    const S = this.S, r = this.r, gy = this.w.map.ground(S.cx, S.cz);
    // the highest roof round about, for his perch
    let px = S.cx + 30, pz = S.cz, py = gy + 14, best = -Infinity;
    for (let k = 0; k < 12; k++) for (const d of [20, 26, 32, 38]) {
      const a = (k / 12) * Math.PI * 2, x = S.cx + Math.cos(a) * d, z = S.cz + Math.sin(a) * d;
      const h = this.w.map.floor(x, z, 999) - this.w.map.ground(x, z);
      if (h > 4 && h > best) { best = h; px = x; pz = z; py = this.w.map.floor(x, z, 999); }
    }
    const a = Math.atan2(pz - S.cz, px - S.cx) + (r() - 0.5);
    return { ph: B_ARRIVE, x: S.cx + Math.cos(a) * 120, y: gy + 45, z: S.cz + Math.sin(a) * 120, yaw: 0, hp: top, top, t: 0, tgt: -1, took: 0, px, py, pz, ax: 0, az: 0, bx: 0, bz: 0, dropT: 0, screeched: false };
  }

  private runBoss(dt: number) {
    const b = this.lad, S = this.S;
    if (!b) return;
    const gy = this.w.map.ground(S.cx, S.cz), angry = b.hp < b.top / 2;
    switch (b.ph) {
      case B_ARRIVE:
        if (Seagulls.step(b, b.px, b.py, b.pz, 16, dt)) { b.ph = B_PERCH; b.t = 3; this.emit([FX_CRY, b.x, b.y, b.z, 1]); }
        break;
      case B_PERCH:
        b.yaw = Math.atan2(S.cx - b.x, S.cz - b.z);
        if ((b.t -= dt) <= 0) {
          // a bombing run: from his side of the benches, over them and out the far side
          const a = Math.atan2(b.pz - S.cz, b.px - S.cx) + (this.r() - 0.5) * 0.9;
          b.ax = S.cx + Math.cos(a) * 30; b.az = S.cz + Math.sin(a) * 30;
          b.bx = S.cx - Math.cos(a) * 30; b.bz = S.cz - Math.sin(a) * 30;
          b.ph = B_RUN;
          this.emit([FX_CRY, b.x, b.y, b.z, 1]);
        }
        break;
      case B_RUN:
        if (Seagulls.step(b, b.ax, gy + 18, b.az, 14, dt)) b.ph = B_PASS;
        break;
      case B_PASS: {
        if (Math.hypot(b.x - S.cx, b.z - S.cz) < 15 && (b.dropT -= dt) <= 0) {
          b.dropT = angry ? 0.22 : 0.32;
          const side = new THREE.Vector3(Math.cos(b.yaw), 0, -Math.sin(b.yaw));
          const spread = angry ? [-3.5, 3.5] : [0];
          for (const s of spread) this.bombs.push({ x: b.x + side.x * s, y: b.y - 1.2, z: b.z + side.z * s, vy: 0, big: true });
        }
        if (Seagulls.step(b, b.bx, gy + 18, b.bz, 11, dt)) b.ph = B_BACK;
        break;
      }
      case B_BACK:
        if (Seagulls.step(b, b.px, b.py, b.pz, 14, dt)) {
          b.tgt = this.r() < 0.45 ? this.target(true) : -1;
          if (b.tgt >= 0) { b.ph = B_DIVE; b.took = 0; this.emit([FX_DIVE, b.x, b.y, b.z]); } else { b.ph = B_PERCH; b.t = angry ? 2.5 : 3.5; }
        }
        break;
      case B_DIVE: {
        const t = S.tr[b.tgt];
        if (!t || t.gone) { b.ph = B_BACK; break; }
        if (b.took >= b.top * 0.12) { b.ph = B_BACK; this.emit([FX_PULL, b.x, b.y, b.z]); break; }
        const p = this.bite(b.tgt);
        if (Seagulls.step(b, p.x, p.y + 1.6, p.z, 9, dt)) {
          if (t.brolly) { t.brolly = false; this.emit([FX_BROLLY, b.x, b.y, b.z, b.tgt]); }
          else {
            t.bites = 0; t.gone = true; this.lose();
            this.emit([FX_GRAB, t.x, t.y, t.z, b.tgt]);
            this.emit([FX_STORM, t.x, t.y, t.z, b.tgt]);
          }
          b.ph = B_BACK;
        }
        break;
      }
      case B_DEAD:
        b.y -= 6 * dt; b.yaw += 3 * dt;
        if ((b.t -= dt) <= 0) this.lad = null;
        break;
    }
    if (angry && !b.screeched && b.ph !== B_DEAD) { b.screeched = true; this.emit([FX_SCREECH, b.x, b.y, b.z]); this.spawn(GANG, 5); }
  }

  private runBombs(dt: number) {
    const S = this.S;
    for (let k = this.bombs.length - 1; k >= 0; k--) {
      const m = this.bombs[k];
      m.vy -= 9.8 * dt; m.y += m.vy * dt;
      const g = this.w.map.ground(m.x, m.z);
      if (m.y > g) continue;
      this.bombs.splice(k, 1);
      const R = m.big ? BOMB_R : POO_R;
      this.emit([m.big ? FX_BOMB : FX_POO, m.x, g, m.z]);
      for (let n = 0; n < S.tr.length && S.ph !== 2; n++) {
        const t = S.tr[n];
        if (t.gone || t.bites <= 0 || Math.hypot(t.x - m.x, t.z - m.z) > R) continue;
        if (t.brolly) { t.brolly = false; this.emit([FX_BROLLY, t.x, t.y + 2, t.z, n]); continue; }
        t.bites--; this.lose();
        this.emit([FX_HIT, t.x, t.y, t.z, n]);
        if (t.bites <= 0) { t.gone = true; this.emit([FX_STORM, t.x, t.y, t.z, n]); }
      }
    }
  }

  /** Anything a player did, at the host. */
  private act(d: any, from: string) {
    const S = this.S;
    if (!this.ready || S.ph === 2) return;
    if (d.k === "hit") {
      if (d.i === -1) {
        const b = this.lad;
        if (!b || b.ph === B_DEAD) return;
        const dmg = Math.max(1, Math.min(8, Number(d.p) || 1)) * (d.h ? 2 : 1);
        b.hp -= dmg; b.took += dmg;
        if (b.hp <= 0) {
          b.hp = 0; b.ph = B_DEAD; b.t = 3;
          S.sc += 200;
          this.emit([FX_BOSSDOWN, b.x, b.y, b.z]);
          if (!this.local) for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; this.w.prize(S.cx + Math.cos(a) * 2.5, S.cz + Math.sin(a) * 2.5, true); }
          for (const g of this.live()) if (g.ph !== FLEE && g.ph !== CARRY) this.driveOff(g, 0, FX_PUFF);
        }
        return;
      }
      const g = this.gulls[d.i];
      if (!g || g.gen !== d.g || g.ph === GONE || g.ph === FLEE) return;
      this.driveOff(g, POINTS[g.k] + (g.ph === SWOOP ? 5 : 0), FX_PUFF);
    } else if (d.k === "shout") {
      const R = S.loud ? SHOUT_LOUD : SHOUT;
      this.emit([FX_SHOUT, Number(d.x), 0, Number(d.z)]);
      for (const g of this.live()) {
        if (g.ph === FLEE || Math.hypot(g.x - d.x, g.z - d.z) > R || g.y - this.w.map.ground(g.x, g.z) > 12) continue;
        this.driveOff(g, 5, FX_PUFF);
      }
    } else if (d.k === "stare") {
      const g = this.gulls[d.i];
      if (!g || g.gen !== d.g || g.k !== HOVER || (g.ph !== HOLD && g.ph !== SWOOP)) return;
      this.driveOff(g, POINTS[HOVER], FX_PUFF);
    } else if (d.k === "pick") {
      const n = Number(d.n), u = S.up[n];
      if (S.ph !== 0 || u === undefined || u < 0) return;
      S.up = S.up.map(() => -1);
      const most = () => S.tr.map((t, k) => ({ t, k })).filter(({ t }) => !t.gone).sort((a, b) => b.t.bites - a.t.bites);
      if (u === CHIPS_UP) S.ch++;
      else if (u === OWL_UP) { const m = most().find(({ t }) => !t.owl); if (m) m.t.owl = true; }
      else if (u === BROLLY_UP) { const m = most().find(({ t }) => !t.brolly); if (m) m.t.brolly = true; }
      else if (u === LOUD_UP) S.loud = true;
      else if (u === HELPING_UP) for (const t of S.tr) if (!t.gone) t.bites = Math.min(t.max, t.bites + 1);
      this.emit([FX_PICK, u, 0, 0, 0, from === this.w.selfId ? 1 : 0]);
      S.t = Math.min(S.t, 6);
    } else if (d.k === "chips") {
      if (S.ch <= 0 || S.ph !== 1) return;
      S.ch--;
      S.chip = { x: Number(d.x), z: Number(d.z), t: 8 };
    }
  }

  /** What goes round. */
  private packet(fx: Fx[]) {
    const S = this.S, q = (v: number) => Math.round(v * 100) / 100;
    const b = this.lad;
    return {
      k: "st", s: this.offer.seed, w: S.w, ph: S.ph, t: q(S.t), sc: S.sc, c: [q(S.cx), q(S.cz)], up: S.up, ch: S.ch, loud: S.loud ? 1 : 0,
      ok: S.clean ? 1 : 0, bc: S.bc ? 1 : 0, won: S.won ? 1 : 0, chip: S.chip ? [q(S.chip.x), q(S.chip.z)] : 0,
      tr: S.tr.map((t) => [q(t.x), q(t.z), q(t.y), q(t.yaw), t.bites, t.max, (t.brolly ? 1 : 0) | (t.owl ? 2 : 0) | (t.gone ? 4 : 0)]),
      g: this.gulls.filter((g) => g.ph !== GONE).map((g) => [g.i, g.gen, g.k, g.ph, q(g.x), q(g.y), q(g.z), q(g.yaw)]),
      b: b ? [b.ph, q(b.x), q(b.y), q(b.z), q(b.yaw), Math.round(b.hp), b.top] : 0,
      pb: this.bombs.map((m) => [q(m.x), q(m.y), q(m.z), m.big ? 1 : 0]),
      fx,
    };
  }

  // ---- everyone: reading the state, and drawing it --------------------------------------------

  private apply(d: any) {
    if (!d || !Array.isArray(d.tr)) return;
    const S = this.S;
    if (!this.owner) this.read(d);
    this.views(d);
    for (const f of Array.isArray(d.fx) ? d.fx : []) this.effect(f);
    if (S.ph === 2 && !this.done) this.finish();
  }

  /** The state, as it came round from the host. */
  private read(d: any) {
    const S = this.S;
    S.w = Number(d.w) || 0; S.ph = Number(d.ph) || 0; S.t = Number(d.t) || 0; S.sc = Number(d.sc) || 0;
    if (Array.isArray(d.c)) { S.cx = Number(d.c[0]); S.cz = Number(d.c[1]); }
    S.up = Array.isArray(d.up) ? d.up.map(Number) : [];
    S.ch = Number(d.ch) || 0; S.loud = !!d.loud; S.clean = !!d.ok; S.bc = !!d.bc; S.won = !!d.won;
    S.chip = Array.isArray(d.chip) ? { x: Number(d.chip[0]), z: Number(d.chip[1]), t: 1 } : null;
    S.tr = d.tr.slice(0, 8).map((a: number[]) => ({ x: +a[0], z: +a[1], y: +a[2], yaw: +a[3], bites: +a[4], max: +a[5], brolly: !!(a[6] & 1), owl: !!(a[6] & 2), gone: !!(a[6] & 4) }));
  }

  /** The gulls, Big Lad and the falling muck, to draw. */
  private views(d: any) {
    const seen = new Set<number>();
    for (const a of Array.isArray(d.g) ? d.g : []) {
      const i = Number(a[0]);
      if (!(i >= 0 && i < MAX_GULLS)) continue;
      seen.add(i);
      let v = this.view.get(i);
      if (!v || v.gen !== a[1]) {
        v = { gen: a[1], k: a[2], ph: a[3], x: a[4], y: a[5], z: a[6], yaw: a[7], tx: a[4], ty: a[5], tz: a[6], tyaw: a[7], flap: Math.random() * 6, stare: 0, stared: false };
        this.view.set(i, v);
      }
      v.k = a[2]; v.ph = a[3]; v.tx = a[4]; v.ty = a[5]; v.tz = a[6]; v.tyaw = a[7];
      if (this.owner) { v.x = v.tx; v.y = v.ty; v.z = v.tz; v.yaw = v.tyaw; }
    }
    for (const i of [...this.view.keys()]) if (!seen.has(i)) this.view.delete(i);
    if (Array.isArray(d.b)) this.bossState(d.b); else if (this.bossView) { this.bossView.g.visible = false; this.bossView.ph = B_DEAD; }
    this.bombsSeen = Array.isArray(d.pb) ? d.pb : [];
  }

  private bossState(a: number[]) {
    if (!this.bossView) {
      const g = new THREE.Group(), sc = BOSS_SCALE;
      const body = new THREE.Mesh(gullBody("#f4f4f2").scale(sc, sc, sc), MAT);
      const wl = new THREE.Mesh(gullWing(-1).scale(sc, sc, sc), MAT), wr = new THREE.Mesh(gullWing(1).scale(sc, sc, sc), MAT);
      wl.position.set(-0.05 * sc, 0.05 * sc, 0); wr.position.set(0.05 * sc, 0.05 * sc, 0);
      g.add(body, wl, wr);
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(6, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.3, depthWrite: false }));
      this.root.add(g, shadow);
      this.bossView = { g, wl, wr, shadow, x: a[1], y: a[2], z: a[3], yaw: a[4], tx: a[1], ty: a[2], tz: a[3], tyaw: a[4], ph: a[0], hp: a[5], top: a[6], flap: 0 };
    }
    const v = this.bossView;
    v.ph = a[0]; v.tx = a[1]; v.ty = a[2]; v.tz = a[3]; v.tyaw = a[4]; v.hp = a[5]; v.top = a[6];
    v.g.visible = true;
    if (this.owner) { v.x = v.tx; v.y = v.ty; v.z = v.tz; v.yaw = v.tyaw; }
  }

  /** Something that just happened: sounds, feathers and words. */
  private effect(f: Fx) {
    const [code, x, y, z, a] = f, me = this.w.me();
    const hear = (hx: number, hy: number, hz: number) => this.w.hear?.(hx, hy, hz) ?? [Math.hypot(hx - me.x, hz - me.z), 0] as [number, number];
    const near = Math.hypot(this.S.cx - me.x, this.S.cz - me.z) < 90;
    switch (code) {
      case FX_PUFF: this.puff(x, y, z, 16); SFX.flap(...hear(x, y, z)); if (Math.random() < 0.4) SFX.gullCry(...hear(x, y, z)); break;
      case FX_CRY: SFX.gullCry(...hear(x, y, z), a === 1); if (a === 1) SFX.flap(...hear(x, y, z), true); break;
      case FX_STEAL:
        SFX.gullCry(...hear(x, y, z));
        if (near && Math.random() < 0.6) this.w.toast(TOURIST_LINES[Math.floor(Math.random() * TOURIST_LINES.length)], 2);
        break;
      case FX_SAVE: if (near) this.w.toast("Bite saved!", 1.4); SFX.jobStep(); break;
      case FX_POO: case FX_BOMB: {
        const big = code === FX_BOMB;
        SFX.gullMuck(...hear(x, y, z), big);
        this.puff(x, y + 0.2, z, big ? 10 : 4);
        if (me.alive && !this.w.passive && Math.hypot(me.x - x, me.z - z) < (big ? BOMB_R : POO_R) && Math.abs(me.y - y) < 4) this.pooed(big);
        break;
      }
      case FX_HIT: if (near) this.w.toast("Splat! Right on the sandwich", 1.6); break;
      case FX_BROLLY: if (near) this.w.toast("Bounced off the brolly!", 1.6); SFX.clunk(...hear(x, y, z)); break;
      case FX_OWL: if (near) this.w.toast("A walker's knocked the owl over!", 2); SFX.clunk(...hear(x, y, z)); break;
      case FX_STORM: if (near) this.w.toast("That's it, they're off. Sandwich gone.", 2.2); break;
      case FX_SHOUT: if (Math.hypot(x - me.x, z - me.z) > 1) SFX.shout(...hear(x, 1.6, z), 7); break;
      case FX_SCREECH: SFX.gullCry(...hear(x, y, z), true); if (near) { this.w.toast("Big Lad's called in his mates!", 2.5); SFX.alarm(); } break;
      case FX_BOSSDOWN: this.puff(x, y, z, 120, 3); SFX.gullCry(...hear(x, y, z), true); SFX.boom(...hear(x, y, z)); if (near) this.w.toast("BIG LAD IS DOWN!", 3); break;
      case FX_DIVE: SFX.gullCry(...hear(x, y, z), true); SFX.flap(...hear(x, y, z), true); if (near) this.w.toast("Big Lad's diving for a sandwich! Shoot him!", 2.2); break;
      case FX_PULL: if (near) this.w.toast("He's pulled out!", 1.6); SFX.gullCry(...hear(x, y, z), true); break;
      case FX_GRAB: if (near) this.w.toast("Big Lad's had a whole sandwich!", 2.2); SFX.gullCry(...hear(x, y, z), true); break;
      case FX_WAVE: SFX.jobStep(); if (x === WAVES) SFX.alarm(); break;
      case FX_CLEAN: if (near) this.w.toast(`Wave ${x} without a bite lost! +50`, 2.5); break;
      case FX_PICK: if (near) this.w.toast(`${UP_NAME[x]}: ${UP_SAY[x]}`, 3); SFX.pickup("ammo"); break;
    }
  }

  /** Seagull muck, on you. */
  private pooed(big: boolean) {
    this.stats.pooed = true;
    if (this.S.w === WAVES) this.stats.bossPoo = true;
    this.w.slow?.(big ? 3.5 : 2.5);
    this.w.toast(big ? "Poo bomb! Right on you" : "Ugh. Right on you", 1.6);
    if (wardCount("poo") >= 5) earn("splat");
    if (!this.splat) {
      const el = (this.splat = document.createElement("div"));
      el.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:5;transition:opacity 0.6s";
      document.body.appendChild(el);
    }
    const el = this.splat;
    el.innerHTML = "";
    for (let k = 0; k < (big ? 9 : 5); k++) {
      const s = 8 + Math.random() * (big ? 22 : 14), b = document.createElement("div");
      b.style.cssText = `position:absolute;left:${Math.random() * 90}%;top:${Math.random() * 80}%;width:${s}vmin;height:${s * (0.7 + Math.random() * 0.5)}vmin;`
        + `border-radius:48% 52% 45% 55%;background:radial-gradient(circle at 40% 35%,#fffffa,#ecebdc 55%,rgba(220,218,196,0.85) 75%,rgba(220,218,196,0) 78%);transform:rotate(${Math.random() * 360}deg)`;
      el.appendChild(b);
    }
    el.style.opacity = "1";
    this.splatT = big ? 4 : 3;
  }
  private puff(x: number, y: number, z: number, n: number, speed = 1) {
    const pos = this.feathers.geometry.attributes.position as THREE.BufferAttribute, N = this.fl.length;
    for (let k = 0; k < n; k++) {
      const i = this.fNext; this.fNext = (this.fNext + 1) % N;
      pos.setXYZ(i, x + (Math.random() - 0.5) * 0.3 * speed, y + (Math.random() - 0.5) * 0.3 * speed, z + (Math.random() - 0.5) * 0.3 * speed);
      this.fv[i * 3] = (Math.random() - 0.5) * 3 * speed; this.fv[i * 3 + 1] = Math.random() * 2 * speed; this.fv[i * 3 + 2] = (Math.random() - 0.5) * 3 * speed;
      this.fl[i] = 1.5 + Math.random() * 1.5;
    }
    pos.needsUpdate = true;
  }

  private buildTourists() {
    const key = this.S.tr.map((t) => `${t.x},${t.z},${t.max}`).join(";");
    if (key === this.seenTourists || !this.S.tr.length) return;
    this.seenTourists = key;
    for (const t of this.tv) this.root.remove(t.g);
    this.tv = [];
    const r = rng(this.offer.seed);
    const bench = benchGeo(), sw = sandwichGeo(), brolly = brollyGeo(), owl = owlGeo();
    this.S.tr.forEach((t) => {
      const g = new THREE.Group(), person = new THREE.Group();
      g.add(new THREE.Mesh(bench, MAT));
      person.add(new THREE.Mesh(touristGeo(r, t.max > 3), MAT));
      const sandwich = new THREE.Mesh(sw, MAT);
      sandwich.position.set(0, 0.82, 0.32);
      person.add(sandwich);
      const b = new THREE.Mesh(brolly, MAT), o = new THREE.Mesh(owl, MAT);
      b.visible = o.visible = false;
      person.add(b);
      g.add(person, o);
      g.position.set(t.x, t.y, t.z);
      g.rotation.y = t.yaw;
      this.root.add(g);
      this.tv.push({ g, person, sandwich, brolly: b, owl: o, leave: 0 });
    });
  }

  private crate(k: number) {
    while (this.crates.length <= k) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(crateGeo(), MAT));
      const lab = label("");
      lab.position.y = 1.4;
      g.add(lab);
      this.root.add(g);
      this.crates.push({ g, lab, k: -2 });
    }
    return this.crates[k];
  }
  private cratePos(k: number) {
    const S = this.S;
    return { x: S.cx + (k - 1) * 2.4, z: S.cz };
  }

  private draw(dt: number, t: number) {
    const S = this.S;
    this.buildTourists();
    // the tourists, their sandwiches, brollies and owls, and anyone storming off
    S.tr.forEach((tr, k) => {
      const v = this.tv[k];
      if (!v) return;
      v.sandwich.visible = tr.bites > 0;
      v.sandwich.scale.set(Math.max(0.2, tr.bites / tr.max), 1, 1);
      v.brolly.visible = tr.brolly && !tr.gone;
      v.owl.visible = tr.owl;
      if (tr.gone && v.leave < 6) {
        v.leave += dt;
        v.person.position.set(0, 0, -v.leave * 1.3);
        v.person.rotation.y = v.leave > 0.3 ? Math.PI : 0;
        v.person.visible = v.leave < 5.5;
      }
    });
    // the crates, in a lull
    for (let k = 0; k < 3; k++) {
      const u = S.ph === 0 ? S.up[k] ?? -1 : -1;
      if (u < 0 && k >= this.crates.length) continue;
      const c = this.crate(k);
      c.g.visible = u >= 0;
      if (u >= 0 && c.k !== u) {
        c.k = u;
        const m = c.lab.material as THREE.SpriteMaterial;
        m.map?.dispose();
        m.map = labelTex(UP_NAME[u]);
      }
      if (u >= 0) {
        const p = this.cratePos(k);
        c.g.position.set(p.x, this.w.map.ground(p.x, p.z) + Math.sin(t * 2 + k) * 0.05, p.z);
        c.g.rotation.y = t * 0.6 + k;
      }
    }
    // chips
    this.chipsView.visible = !!S.chip;
    if (S.chip) this.chipsView.position.set(S.chip.x, this.w.map.ground(S.chip.x, S.chip.z), S.chip.z);
    // the gulls
    const smooth = this.owner ? 1 : Math.min(1, dt * 10);
    let nb = 0, nd = 0, ns = 0;
    for (const [, v] of this.view) {
      v.x += (v.tx - v.x) * smooth; v.y += (v.ty - v.y) * smooth; v.z += (v.tz - v.z) * smooth;
      let dy = v.tyaw - v.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); v.yaw += dy * smooth;
      const ground = this.w.map.ground(v.x, v.z), onGround = v.y - ground < 0.4;
      v.flap += dt * (onGround ? 0 : v.ph === HOLD ? 16 : v.ph === SWOOP ? 4 : 10);
      const wingA = onGround ? 1.25 : v.ph === SWOOP ? 0.35 : Math.sin(v.flap) * 0.7;
      const dark = v.k === GANG, sc = 1;
      // a walker waddles; a swooping gull tips its nose down
      const pitch = v.ph === SWOOP ? -0.5 : 0, roll = onGround && v.ph === WALK ? Math.sin(t * 9 + v.gen) * 0.12 : 0;
      _e.set(pitch, v.yaw + Math.PI, roll, "YXZ");
      _q.setFromEuler(_e);
      _m.compose(_p.set(v.x, v.y, v.z), _q, _s.set(sc, sc, sc));
      (dark ? this.darkBodies : this.bodies).setMatrixAt(dark ? nd++ : nb++, _m);
      const k = dark ? 0.78 : 1, idx = nb + nd - 1;
      for (const [im, side] of [[this.wingsL, -1], [this.wingsR, 1]] as const) {
        _w.makeRotationZ(-side * wingA).setPosition(side * 0.06 * k, 0.06 * k, 0);
        if (onGround) _w.scale(_s.set(0.3, 1, 1));
        if (dark) _w.premultiply(new THREE.Matrix4().makeScale(k, k, k));
        im.setMatrixAt(idx, _w.premultiply(_m));
      }
      if (!onGround && (v.ph === SWOOP || v.ph === HOLD || v.ph === CARRY)) {
        const alt = v.y - ground, s = 0.4 + (1 - Math.min(1, alt / 14)) * 0.9;
        _m.compose(_p.set(v.x, ground + 0.06, v.z), _q.identity(), _s.set(s, 1, s));
        this.shadows.setMatrixAt(ns++, _m);
      }
    }
    for (const im of [this.bodies, this.darkBodies]) im.instanceMatrix.needsUpdate = true;
    this.bodies.count = nb; this.darkBodies.count = nd;
    this.wingsL.count = this.wingsR.count = nb + nd;
    this.wingsL.instanceMatrix.needsUpdate = this.wingsR.instanceMatrix.needsUpdate = true;
    this.shadows.count = ns; this.shadows.instanceMatrix.needsUpdate = true;
    // Big Lad
    const bv = this.bossView;
    if (bv && bv.g.visible) {
      bv.x += (bv.tx - bv.x) * smooth; bv.y += (bv.ty - bv.y) * smooth; bv.z += (bv.tz - bv.z) * smooth;
      let dy = bv.tyaw - bv.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); bv.yaw += dy * smooth;
      const perched = bv.ph === B_PERCH;
      bv.flap += dt * (perched ? 0 : 4.5);
      const wa = perched ? 1.2 : bv.ph === B_DIVE ? 0.3 : Math.sin(bv.flap) * 0.6;
      bv.wl.rotation.z = wa; bv.wr.rotation.z = -wa;
      bv.wl.scale.x = bv.wr.scale.x = perched ? 0.35 : 1;
      bv.g.position.set(bv.x, bv.y + (perched ? 0.13 * BOSS_SCALE : 0), bv.z);
      bv.g.rotation.set(bv.ph === B_DIVE ? -0.4 : bv.ph === B_DEAD ? 1.2 : 0, bv.yaw + Math.PI, 0, "YXZ");
      const ground = this.w.map.ground(bv.x, bv.z);
      bv.shadow.visible = bv.y - ground < 30 && bv.ph !== B_PERCH;
      bv.shadow.position.set(bv.x, ground + 0.08, bv.z);
    }
    // poo bombs falling, and the rings where they'll land
    this.bombView.forEach((m, k) => {
      const a = this.bombsSeen[k];
      m.blob.visible = m.ring.visible = !!a;
      if (!a) return;
      const big = !!a[3], g = this.w.map.ground(a[0], a[2]);
      m.blob.position.set(a[0], a[1], a[2]);
      m.blob.scale.setScalar(big ? 1.3 : 0.5);
      m.ring.visible = big;
      m.ring.position.set(a[0], g + 0.07, a[2]);
      (m.ring.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.4 * Math.sin(t * 14);
    });
    // feathers drifting down
    const pos = this.feathers.geometry.attributes.position as THREE.BufferAttribute;
    let any = false;
    for (let i = 0; i < this.fl.length; i++) {
      if (this.fl[i] <= 0) continue;
      any = true;
      this.fl[i] -= dt;
      this.fv[i * 3 + 1] = Math.max(-0.6, this.fv[i * 3 + 1] - 3 * dt);
      this.fv[i * 3] *= 1 - dt; this.fv[i * 3 + 2] *= 1 - dt;
      pos.setXYZ(i, pos.getX(i) + this.fv[i * 3] * dt + Math.sin(t * 5 + i) * 0.01, pos.getY(i) + this.fv[i * 3 + 1] * dt, pos.getZ(i) + this.fv[i * 3 + 2] * dt);
      if (this.fl[i] <= 0) pos.setXYZ(i, 0, -9999, 0);
    }
    if (any) pos.needsUpdate = true;
    // muck on your screen, fading
    if (this.splat && this.splatT > 0 && (this.splatT -= dt) <= 1) this.splat.style.opacity = String(Math.max(0, this.splatT));
  }

  // ---- the Job ---------------------------------------------------------------------------------

  update(dt: number) {
    const t = performance.now() / 1000;
    if (this.local) this.run(dt);
    else if (!this.w.isHost && this.ready) this.ready = false;   // someone else is host now
    this.draw(dt, t);
    this.shoutT -= dt;
    // staring out a hoverer: keep your crosshair on it
    const S = this.S, me = this.w.me();
    if (S.ph === 1 && me.alive) {
      const l = this.w.look();
      for (const [i, v] of this.view) {
        if (v.k !== HOVER || v.ph !== HOLD || v.stared) { v.stare = 0; continue; }
        const dx = v.x - l.x, dy = v.y - l.y, dz = v.z - l.z, d = Math.hypot(dx, dy, dz);
        const on = d < STARE_RANGE && (dx * l.dx + dy * l.dy + dz * l.dz) / d > STARE_COS;
        v.stare = on ? v.stare + dt : Math.max(0, v.stare - dt * 2);
        if (v.stare >= STARE) {
          v.stared = true;
          this.w.toast("Stared it out!", 1.4);
          this.send({ k: "stare", i, g: v.gen });
        }
      }
    }
  }

  host(dt: number) { if (!this.local) this.run(dt); }

  /** The owner's frame: run it all, show it here, and send it round. */
  private run(dt: number) {
    if (!this.ready) this.takeOver();
    this.hostUpdate(dt);
    this.apply(this.packet(this.fxLocal.splice(0)));
    if (this.local) return;
    if ((this.sendT -= dt) <= 0) {
      this.sendT = SEND_EVERY;
      this.w.send("qe", this.packet(this.fxNet.splice(0)));
    }
  }

  private send(d: any) {
    d.s = this.offer.seed;
    if (this.owner) this.act(d, this.w.selfId);
    else this.w.send("qe", d);
  }

  event(d: any, from: string) {
    if (d.k === "st") { if (!this.owner) this.apply(d); return; }
    if (this.owner && !this.local) this.act(d, from);
  }

  progress() { return this.packet([]); }
  restore(p: any) { if (!this.owner) this.apply(p); }

  private finish() {
    const S = this.S, total = S.tr.reduce((s, t) => s + t.max, 0) || 1, left = S.tr.reduce((s, t) => s + (t.gone ? 0 : t.bites), 0);
    const frac = left / total, stars = S.won ? (frac >= 0.8 ? 3 : frac >= 0.5 ? 2 : 1) : 0;
    keepBest(this.offer.where, S.sc);
    const wear: string[] = [];
    if (S.won) {
      wear.push("shades");
      if (stars === 3) wear.push("gull");
      if (S.bc) wear.push("owl");
      if (!this.stats.bossPoo) wear.push("brolly");
    }
    this.done = S.won
      ? { won: true, text: `Seagulls seen off! ${left} of ${total} bites saved ${starText(stars)}, score ${S.sc}`, x: S.cx, z: S.cz, wear, grade: { tier: stars === 3 ? (this.offer.stars === 3 ? 3 : 2) : 1, best: { v: stars, text: `${stars} star${stars > 1 ? "s" : ""}` } } }
      : { won: false, text: `The gulls got every sandwich. Score ${S.sc}`, wear };
  }

  card(): Card {
    const S = this.S, me = this.w.me(), d = Math.hypot(S.cx - me.x, S.cz - me.z);
    const total = S.tr.reduce((s, t) => s + t.max, 0) || 1, left = S.tr.reduce((s, t) => s + (t.gone ? 0 : t.bites), 0);
    const far = d > NEAR ? ` · <b>${Math.round(d)} m</b> to the benches` : "";
    let line: string;
    if (!S.tr.length) line = "Setting the benches out...";
    else if (S.ph === 0) line = S.w === 0 ? `First wave in <b>${Math.ceil(S.t)}</b>` : `Wave ${S.w + 1} of ${WAVES} in <b>${Math.ceil(S.t)}</b>${S.up.some((u) => u >= 0) ? " · grab a crate by the benches" : ""}`;
    else if (S.ph === 1) {
      const n = [...this.view.values()].filter((v) => v.ph !== FLEE).length;
      line = `Wave ${S.w} of ${WAVES}${S.w === WAVES && this.bossView?.g.visible && this.bossView.ph !== B_DEAD ? ": <b>Big Lad</b>" : ""} · ${n} gull${n === 1 ? "" : "s"} about`;
    } else line = S.won ? "Seen off!" : "Every sandwich gone";
    const staring = [...this.view.values()].some((v) => v.stare > 0.2 && !v.stared);
    const sub = `${left} of ${total} bites left · score ${S.sc}${S.ch ? ` · chips ×${S.ch}` : ""}${staring ? " · <b>staring it out...</b>" : ""}${far}`;
    const wave = Math.min(WAVES, S.ph === 0 ? S.w + 1 : Math.max(1, S.w));
    const stage = S.ph === 1 && S.w > 0
      ? { key: `w${S.w}`, title: S.w === WAVES ? "Wave 5 of 5: Big Lad!" : `Wave ${S.w} of ${WAVES}`, sub: WAVE_SAY[S.w], colour: S.w === WAVES ? "#ff5a4e" : undefined, life: S.w === WAVES ? 4 : 2.8 }
      : undefined;
    return { line, sub, bar: left / total, progress: `Wave ${wave} / ${WAVES}`, stage };
  }

  hint(): string {
    const S = this.S, me = this.w.me();
    if (Math.hypot(S.cx - me.x, S.cz - me.z) > NEAR) return "";
    if (S.ph === 0) {
      const k = this.nearCrate();
      return k >= 0 ? `<b>E</b> Take: ${esc(UP_NAME[S.up[k]])}` : "";
    }
    if (S.ph !== 1) return "";
    if (S.ch > 0 && !S.chip) return "<b>E</b> Throw the chips down";
    return this.shoutT > 0 ? "" : "<b>E</b> Shout at the gulls";
  }

  private nearCrate(): number {
    const S = this.S, me = this.w.me();
    for (let k = 0; k < S.up.length; k++) {
      if (S.up[k] < 0) continue;
      const p = this.cratePos(k);
      if (Math.hypot(p.x - me.x, p.z - me.z) < 2) return k;
    }
    return -1;
  }

  use(): boolean {
    const S = this.S, me = this.w.me();
    if (Math.hypot(S.cx - me.x, S.cz - me.z) > NEAR) return false;
    if (S.ph === 0) {
      const k = this.nearCrate();
      if (k < 0) return false;
      this.send({ k: "pick", n: k });
      return true;
    }
    if (S.ph !== 1) return false;
    if (S.ch > 0 && !S.chip) {
      const l = this.w.look(), x = me.x + l.dx * 2.5, z = me.z + l.dz * 2.5;
      this.send({ k: "chips", x, z });
      return true;
    }
    if (this.shoutT > 0) return true;
    this.shoutT = S.loud ? SHOUT_EVERY / 2 : SHOUT_EVERY;
    SFX.shout(0, 0, 7);
    this.w.toast(S.loud ? "OI! (through the megaphone)" : "OI! GERROFF!", 1.2);
    this.send({ k: "shout", x: me.x, z: me.z });
    return true;
  }

  hit(o: THREE.Vector3, d: THREE.Vector3, max: number): Quarry | null {
    let best: Quarry | null = null;
    const ray = (cx: number, cy: number, cz: number, r: number) => {
      const ox = cx - o.x, oy = cy - o.y, oz = cz - o.z, t = ox * d.x + oy * d.y + oz * d.z;
      if (t < 0) return null;
      const dd = ox * ox + oy * oy + oz * oz - t * t;
      return dd < r * r ? t - Math.sqrt(r * r - dd) : null;
    };
    for (const [i, v] of this.view) {
      if (v.ph === FLEE) continue;
      const h = ray(v.x, v.y, v.z, v.k === GANG ? 0.45 : 0.55);
      if (h !== null && h < max && (!best || h < best.dist)) best = { dist: h, head: false, ref: i, follow: Seagulls.follow(v, o, d, h) };
    }
    const b = this.bossView;
    if (b && b.g.visible && b.ph !== B_DEAD) {
      const f = new THREE.Vector3(Math.sin(b.yaw), 0, Math.cos(b.yaw)), sc = BOSS_SCALE;
      const lift = b.ph === B_PERCH ? 0.13 * sc : 0;
      const hx = b.x + f.x * 0.28 * sc, hy = b.y + 0.08 * sc + lift, hz = b.z + f.z * 0.28 * sc;
      const head = ray(hx, hy, hz, 0.1 * sc);
      if (head !== null && head < max && (!best || head < best.dist)) best = { dist: head, head: true, ref: -1 };
      for (const k of [-0.1, 0.08]) {
        const body = ray(b.x - f.x * k * sc, b.y + lift, b.z - f.z * k * sc, 0.14 * sc);
        if (body !== null && body < max && (!best || body < best.dist)) best = { dist: body, head: false, ref: -1 };
      }
      // the wings, out to either side, as two more targets each
      const side = new THREE.Vector3(Math.cos(b.yaw), 0, -Math.sin(b.yaw));
      if (b.ph !== B_PERCH) for (const s of [-1, 1]) for (const k of [0.25, 0.5]) {
        const wing = ray(b.x + side.x * s * k * sc, b.y + 0.05 * sc, b.z + side.z * s * k * sc, 0.1 * sc);
        if (wing !== null && wing < max && (!best || wing < best.dist)) best = { dist: wing, head: false, ref: -1 };
      }
      if (best?.ref === -1) best.follow = Seagulls.follow(b, o, d, best.dist);
    }
    return best;
  }

  /** The spot dist along a shot from o along d, on a gull (or Big Lad) as drawn: it goes where he flies. */
  private static follow(v: { x: number; y: number; z: number }, o: THREE.Vector3, d: THREE.Vector3, dist: number): Follow {
    const ox = o.x + d.x * dist - v.x, oy = o.y + d.y * dist - v.y, oz = o.z + d.z * dist - v.z;
    return () => new THREE.Vector3(v.x + ox, v.y + oy, v.z + oz);
  }

  shoot(q: Quarry, power: number) {
    if (q.ref === -1) {
      const b = this.bossView;
      if (b) this.puff(b.x, b.y + 1, b.z, q.head ? 8 : 4, 2);
      this.send({ k: "hit", i: -1, p: power, h: q.head ? 1 : 0 });
      return;
    }
    const v = this.view.get(q.ref);
    if (!v) return;
    this.puff(v.x, v.y, v.z, 6);
    this.send({ k: "hit", i: q.ref, g: v.gen, p: power });
  }

  bossBar() {
    const b = this.bossView, me = this.w.me();
    if (!b || !b.g.visible || b.ph === B_DEAD || Math.hypot(b.x - me.x, b.z - me.z) > 160) return null;
    return { name: "Big Lad", fill: b.hp / Math.max(1, b.top) };
  }

  /** The gulls' mess goes where the benches were. */
  scarAt() { return { x: this.S.cx, z: this.S.cz }; }

  end() {
    this.w.mark("@gulls", null);
    this.w.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Sprite) {
        o.geometry?.dispose();
        const m = o.material as THREE.Material & { map?: THREE.Texture | null };
        m.map?.dispose();
        if (m !== MAT) m.dispose();
      }
    });
    this.splat?.remove();
    this.splat = null;
  }
}
