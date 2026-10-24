// Naughty boys: lads in trackies who loiter about, chase the nearest player they can see and batter anyone
// they catch. They run faster than you walk but slower than you sprint, and give up once you're far
// enough away, have been out of sight for a few seconds, or they've run a while without catching
// you. Shoot one and he comes for you. Splat one enough and he goes over, then picks himself up and
// legs it, far faster than you can run, shouting as he goes (high and scared), and fades away once he's well off: he's
// had enough, that's all. Run one over and he's sent sprawling to the side, then gets up and runs off
// square to the way the car was going.
//
// They hang about in gangs in alleys and at bus stops, and now and then on a street corner (see
// haunts.ts), in Combe Down and all over Bath: Fox Hill most of all. After a chase they drift back
// to where they were.
//
// Not every gang is naughty boys. Some are the rugby team, in hooped jerseys, bigger and quicker and
// harder to put down; some are the cricket team, in their whites, swinging bats. Both turn out near
// their own pitches, or outside the pubs, and shout posh things at you as they come (posh.ts). A team
// turns out when someone walks on to a rugby pitch or cricket field (so a second player arriving
// can bring another), and again every three to five minutes while anyone's still on it.
//
// And then there are the Flag Lads (invasion.ts), who only turn up at the pubs they've taken over
// and to put their flags back: blokes in England shirts, some with the flag worn as a cape; ladder
// lads in hi-vis who put the flags back up and run from you rather than fight; and the Gaffer, a big
// boss with a megaphone, built heavier and dressed his own way (as are his right-hand man and his cousin). Jobs (quests.ts) can also
// bring a gang of their own anywhere. A Wanted ringleader is dressed like his lookalikes, who wear a
// hat, a coloured jacket, a bag, a dog or a limp in different mixes (they ride on the look number,
// so every screen draws the same men), and any of them can be made to give up with his hands in the
// air instead of going down, to be cuffed and led off. A ringleader can also wear one loud thing (a
// rosette, a hi-vis tabard, a big hat), which only the characters page uses now. The Gaffer on the
// run is drawn on a mobility scooter or in his van, which also rides on his look.
//
// On Friday and Saturday nights (daylight.ts, nightOut) there's a night out at the top of Milsom
// Street, where it meets George Street: a crowd of naughty boys and naughty girls (in short skirts
// and going-out tops, heels and a handbag, who slap rather than punch and say what they think of
// you) stood about in twos and threes. Every so often two of them kick off with each other, a mate
// sometimes piling in, till one's had enough and legs it, and the rest carry on. They don't come
// for you unless you get right in among them or shoot one, and only the few nearest join in. More
// wander in up the streets round about to keep the numbers up, and at three in the morning they
// all drift off home.
//
// The host runs them and sends their state about 10 times a second; everyone else draws them from
// that, smoothed like other players. Shots at naughty boys go to the host, like shots at players.
import * as THREE from "three";
import { hitPosed } from "./avatar";
import { Haunt, clearSpot, hauntsNear } from "./haunts";
import { GameMap } from "./map";
import { nightOut } from "./daylight";
import { legIt, line } from "./posh";
import { type Follow, follow } from "./weapon";

/** The kinds of gang: three that hang about, the Flag Lads' three (invasion.ts), who only come when it
 *  brings them, and the naughty girls, who only come out on a Friday or Saturday night. */
export const NAUGHTY = 0, RUGBY = 1, CRICKET = 2, SOCIETY = 3, LADDER = 4, CHAIR = 5, GIRL = 6;
/** Added to a look's kit: the gang's ringleader, a size bigger. */
export const BOSS = 8;
/**
 * How tough, quick and hard-hitting each kind is, how far they reach (a bat reaches further), and
 * how far off they spot you and give up on you. The teams are out on open fields and come looking.
 */
const TEAM = [
  { hp: 60, run: 5.7, hit: 10, reach: 1.3, spot: 38, lose: 45 },
  { hp: 85, run: 6.3, hit: 12, reach: 1.35, spot: 70, lose: 85 },
  { hp: 55, run: 5.4, hit: 15, reach: 1.75, spot: 70, lose: 85 },
  { hp: 50, run: 5.4, hit: 9, reach: 1.35, spot: 45, lose: 60 },
  { hp: 40, run: 5.2, hit: 0, reach: 0, spot: 22, lose: 0 },      // a ladder crew: runs from anyone this close
  { hp: 400, run: 5.0, hit: 18, reach: 1.7, spot: 55, lose: 90 },
  { hp: 45, run: 5.3, hit: 8, reach: 1.25, spot: 32, lose: 45 },   // in heels, but they'll have you
];
const PROWL = 150;                         // the teams come looking for anyone this close to their pitch
const MAX = 18;                            // the gangs that turn up by themselves
const SLOTS = 44;                          // and room for the ones jobs, the Flag Lads and the night out bring
const HOME_RANGE = 5;                      // how far they drift from their spot when loitering
/** How much naughty boys like each kind of spot (not the shops or pubs at all). Fox Hill counts three times over. */
const LIKES: Record<Haunt["kind"], number> = { corner: 0.3, alley: 1, bus: 2.5, shop: 0, pub: 0 };
const likes = (h: Haunt) => LIKES[h.kind] * (h.foxhill ? 3 : 1);
const PITCH_NEAR = 200;                    // the pitches looked at round each player
const TEAM_AGAIN = [180, 300];             // while anyone's on a pitch, another team turns out every 3 to 5 minutes
const TEAM_BACK = 120;                     // off the pitch this long and walking back on counts as arriving again
const TEAM_CLEAR = 35;                     // a team turns out at least this far from everyone
const RUN = 5.7, STROLL = 1.3;            // you walk at 4.6 and sprint at 7.4
const BLIND_SECS = 3.5;
const TIRED_SECS = 14, CALM_SECS = 10;     // a chase that long without catching you, then a sulk
const PUNCH_EVERY = 1.0, WIND_UP = 0.35;
const RADIUS = 0.33;
// had enough: down on the ground, back up, then off as fast as he can go, fading out at the end
const DOWN_SECS = 1.4, UP_SECS = 0.6, FLEE_SECS = 3.6, FADE_SECS = 1.2;
export const OFF_SECS = DOWN_SECS + UP_SECS;   // when he starts running
const OUT_SECS = OFF_SECS + FLEE_SECS;     // when he's gone
export const FLEE = 9.5;                   // you sprint at 7.4, so you'll not catch him
const THROWN = 6;                          // how hard a car sends him sprawling sideways
const DELAY = 130;                         // ms behind real time when drawing from the host's updates
// The night out: where the crowd stands (data metres), the top of Milsom Street, where it meets George
// Street, and which way Milsom Street runs from there (south); where more of them walk in from (along
// George Street both ways and up Milsom Street); and how many.
const NIGHT = { x: -1168, y: 2490, ux: 0.303, uy: -0.953 };
const NIGHT_IN = [[-1215, 2476], [-1118, 2506], [-1146, 2412]];
const CROWD = 16;
const NIGHT_NEAR = 320;                    // the night's on while anyone's this close
const CROWD_SPOT = 7;                      // one of the crowd only goes for you this close (or if you shoot)
const CROWD_MATES = 6;                     // and only the ones this close to him join in
const FIGHT_EVERY = [10, 28];              // seconds between two of them kicking off
const FIGHT_MAX = 25;                      // a fight that's gone on this long fizzles out
/** DEAD is "had enough": down, then up and legging it (the number stays 2 for older pages). */
const GONE = 0, ALIVE = 1, DEAD = 2;

/** A rugby pitch or cricket field: where its team can turn out (scene x, z), whether scene (x, z) is
 *  on it, when each player was last seen on it (by the host's clock), whether a team is owed for
 *  someone arriving, and when the next one turns out anyway. */
interface Ground { kind: number; spots: { x: number; z: number }[]; on: (x: number, z: number) => boolean; met: Map<string, number>; owed: boolean; next: number }
/** A player the naughty boys might go for. */
/** passive: they've passive mode on (settings.ts), or they're at a narrowboat's tiller, so nobody here goes for them. */
export interface Target { id: string; x: number; y: number; z: number; alive: boolean; passive?: boolean }
export interface NaughtyBoyState { s: number[]; t: string[] }
/** A gang's look: its kind times 16, plus which kit (for the teams), plus BOSS for a ringleader. */
export const look = (kind: number, kit: number) => kind * 16 + kit;
/**
 * The loud things a ringleader can wear. Which one rides on his look as eighths after the point,
 * which an older page (reading the look in whole numbers) simply doesn't draw.
 */
export const LOUD = ["", "a red rosette", "a hi-vis tabard", "a big purple hat"] as const;
export const wearing = (lk: number) => Math.round((lk % 1) * 8) % LOUD.length;
export const withLoud = (lk: number, t: number) => Math.floor(lk) + t / 8;
/**
 * What a Wanted lookalike has on him: a hat, a jacket (0 his own clothes, 1 to 3 a colour), a bag, a
 * dog and a limp, packed into six bits that ride on his look in 1024ths after the loud thing's
 * eighths. Too small a step for a page that reads only the loud thing to see, so older pages just
 * draw a lad in his own clothes.
 */
export const FEAT_ARITY = [2, 4, 2, 2, 2] as const;
export const packFeats = (f: readonly number[]) => f[0] | (f[1] << 1) | (f[2] << 3) | (f[3] << 4) | (f[4] << 5);
export const withFeats = (lk: number, f: readonly number[]) => Math.floor(lk) + wearing(lk) / 8 + packFeats(f) / 1024;
const featBits = (lk: number) => Math.max(0, Math.round(((lk % 1) - wearing(lk) / 8) * 1024)) & 63;
export const featsOf = (lk: number): number[] => { const b = featBits(lk); return [b & 1, (b >> 1) & 3, (b >> 3) & 1, (b >> 4) & 1, (b >> 5) & 1]; };
/** The Gaffer on the run: how he's travelling (0 on foot, 1 a mobility scooter, 2 his van), carried in his look. */
export const MOUNTS = ["on foot", "on a mobility scooter", "in his van"] as const;
export const mountOf = (lk: number) => (lk >> 4 === CHAIR ? featBits(lk) & 3 : 0);
/** How much bigger than a naughty boy someone in this look is drawn (and hit). */
const sizeOf = (lk: number) => (lk & BOSS ? 1.28 : lk >> 4 === CHAIR ? 1.22 : lk >> 4 === RUGBY ? 1.06 : lk >> 4 === GIRL ? 0.95 : 1);
const STRIDE = 9;                          // numbers per naughty boy in a snapshot

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const mats = new Map<string, THREE.MeshLambertMaterial>();
const lambert = (c: string) => mats.get(c) ?? mats.set(c, new THREE.MeshLambertMaterial({ color: c })).get(c)!;
// shared by every naughty boy
const GEO = {
  leg: box(0.15, 0.84, 0.17).translate(0, -0.42, 0),
  stripe: box(0.015, 0.8, 0.035).translate(0, -0.42, 0),
  shoe: box(0.15, 0.11, 0.29).translate(0, -0.8, -0.05),
  torso: box(0.44, 0.6, 0.25),
  sleeve: box(0.12, 0.56, 0.13).translate(0, -0.28, 0),
  hand: new THREE.SphereGeometry(0.06, 8, 6).translate(0, -0.6, 0),
  head: new THREE.SphereGeometry(0.15, 14, 10),
  cap: new THREE.SphereGeometry(0.162, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  brim: box(0.2, 0.025, 0.17),
  chain: new THREE.TorusGeometry(0.1, 0.012, 6, 20),
  // a Wanted man's loud thing
  rosette: new THREE.CylinderGeometry(0.085, 0.085, 0.03, 12).rotateX(Math.PI / 2),
  tail: box(0.05, 0.16, 0.012),
  tabard: box(0.47, 0.5, 0.275),
  reflect: box(0.48, 0.045, 0.285),
  crown: new THREE.CylinderGeometry(0.15, 0.17, 0.32, 12).translate(0, 0.16, 0),
  bigBrim: new THREE.CylinderGeometry(0.34, 0.34, 0.03, 16),
  // the rugby team: shorts, bare knees, long socks, a hooped jersey
  shorts: box(0.17, 0.3, 0.19).translate(0, -0.15, 0),
  knee: box(0.13, 0.16, 0.15).translate(0, -0.38, 0),
  sock: box(0.145, 0.38, 0.165).translate(0, -0.65, 0),
  sockHoop: box(0.155, 0.06, 0.175).translate(0, -0.5, 0),
  jersey: box(0.48, 0.62, 0.27),
  hoop: box(0.49, 0.08, 0.28),
  sleeveHoop: box(0.13, 0.07, 0.14).translate(0, -0.22, 0),
  collar: box(0.24, 0.05, 0.2),
  // the cricket team: a V on the jumper, and a bat
  vee: box(0.022, 0.2, 0.01),
  band: box(0.45, 0.045, 0.26),
  handle: box(0.035, 0.26, 0.035).translate(0, -0.72, 0),
  blade: box(0.105, 0.56, 0.04).translate(0, -1.12, 0),
  // the Flag Lads: a cross on the shirt, the flag worn as a cape, a little flag on a stick, a ladder,
  // a hi-vis vest, and the Gaffer's megaphone
  crossUp: box(0.05, 0.16, 0.01),
  crossAcross: box(0.16, 0.05, 0.01),
  cape: box(0.5, 0.74, 0.02),
  capeUp: box(0.09, 0.74, 0.022),
  capeAcross: box(0.5, 0.11, 0.022),
  stick: box(0.025, 0.5, 0.025).translate(0, -0.85, -0.05),
  minFlag: box(0.01, 0.16, 0.24).translate(0, -0.68, -0.17),
  rail: box(0.045, 0.06, 2.4),
  rung: box(0.4, 0.03, 0.03),
  vest: box(0.46, 0.5, 0.27),
  horn: new THREE.CylinderGeometry(0.11, 0.04, 0.26, 10).rotateX(Math.PI / 2).translate(0, -0.62, -0.2),
  // the Flag Lads' bosses, built heavier: a jacket over the shirt, a gut, shades, a hat
  bossLeg: box(0.18, 0.84, 0.2).translate(0, -0.42, 0),
  bossShoe: box(0.18, 0.12, 0.31).translate(0, -0.8, -0.05),
  bossSleeve: box(0.15, 0.56, 0.16).translate(0, -0.28, 0),
  jacket: box(0.54, 0.64, 0.31),
  shirtFront: box(0.2, 0.6, 0.012),
  gut: box(0.42, 0.34, 0.2),
  jacketCollar: box(0.34, 0.07, 0.28),
  armband: box(0.16, 0.08, 0.17).translate(0, -0.12, 0),
  shades: box(0.24, 0.055, 0.03),
  bucket: new THREE.CylinderGeometry(0.15, 0.165, 0.13, 14).translate(0, 0.065, 0),
  bucketBrim: new THREE.CylinderGeometry(0.25, 0.25, 0.02, 16),
  bucketBand: new THREE.CylinderGeometry(0.168, 0.168, 0.035, 14),
  // the naughty girls: bare legs, heels, a short skirt, a going-out top with a bit of tummy, bare
  // arms, long hair down her back, and a handbag on her arm
  bareLeg: box(0.12, 0.8, 0.13).translate(0, -0.4, 0),
  heel: box(0.11, 0.06, 0.24).translate(0, -0.83, -0.04),
  spike: box(0.03, 0.08, 0.03).translate(0, -0.79, 0.07),
  skirt: box(0.42, 0.25, 0.27),
  tummy: box(0.33, 0.12, 0.19),
  top: box(0.38, 0.32, 0.23),
  strap: box(0.04, 0.12, 0.2),
  arm: box(0.09, 0.56, 0.1).translate(0, -0.28, 0),
  locks: box(0.3, 0.42, 0.08),
  bag: box(0.07, 0.15, 0.2).translate(0, -0.42, 0),
  // a Wanted lookalike's features: a hat, a jacket over his own clothes, a shoulder bag, a dog, a stick
  trilby: new THREE.CylinderGeometry(0.135, 0.16, 0.2, 12).translate(0, 0.1, 0),
  trilbyBrim: new THREE.CylinderGeometry(0.25, 0.25, 0.025, 14),
  coat: box(0.5, 0.58, 0.29),
  coatSleeve: box(0.145, 0.5, 0.155).translate(0, -0.25, 0),
  satchel: box(0.3, 0.28, 0.15),
  satchelStrap: box(0.045, 0.75, 0.02),
  dogBody: box(0.22, 0.22, 0.55),
  dogHead: box(0.15, 0.15, 0.2),
  dogLeg: box(0.06, 0.2, 0.06),
  dogTail: box(0.04, 0.04, 0.22),
  walkStick: box(0.03, 0.85, 0.03).translate(0, -0.45, -0.05),
  // the Gaffer on the run: a mobility scooter, or his van
  scooterBase: box(0.55, 0.12, 1.25),
  scooterSeat: box(0.4, 0.1, 0.4),
  scooterBack: box(0.4, 0.4, 0.07),
  scooterPost: box(0.06, 0.8, 0.06),
  scooterBar: box(0.55, 0.05, 0.05),
  scooterWheel: new THREE.CylinderGeometry(0.17, 0.17, 0.1, 10).rotateZ(Math.PI / 2),
  vanBox: box(2.0, 1.95, 3.0),
  vanCab: box(2.0, 1.2, 1.3),
  vanGlass: box(1.8, 0.5, 0.05),
  vanWheel: new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12).rotateZ(Math.PI / 2),
};
const SKIN = ["#efcdb4", "#e6bd9f", "#d4a283", "#b57d5c"].map(lambert);
const TRACKIES = ["#ecebe8", "#252a3e", "#8a8d93", "#1d1d20", "#33478c", "#5b6b4a"].map(lambert);
const CAPS = ["#cbb38a", "#1d1d20", "#ecebe8", "#8a8d93"].map(lambert);
const HAIR = ["#3b2a1d", "#6b4a2b", "#c9a45c", "#a0522d", "#1d1d20"].map(lambert);
const WHITE = lambert("#f4f4f2");
const BLACK = lambert("#1b1b1d");
const CREAM = lambert("#eee8d5");
const WILLOW = lambert("#e0c48a"), GRIP = lambert("#7a1f2b");
const GOLD = new THREE.MeshLambertMaterial({ color: "#d9b143", emissive: "#4a3a10" });
const ROSETTE = new THREE.MeshLambertMaterial({ color: "#e0262e", emissive: "#5a0a0a" });
const HIVIS = new THREE.MeshLambertMaterial({ color: "#d6ff2a", emissive: "#4a5a00" });
const PURPLE = new THREE.MeshLambertMaterial({ color: "#7a2fc0", emissive: "#2a0a4a" });
const COATS = ["", "#b8232b", "#2f7a3e", "#c9a227"].map((c) => (c ? lambert(c) : WHITE));
const HAT = lambert("#4a3b2c"), LEATHER = lambert("#8a5a2b"), DOG = lambert("#c8a06a"), VAN = lambert("#f0eee6"), GLASS = lambert("#3b4a5a"), TYRE = lambert("#1b1b1d"), MOTOR = lambert("#a3202a");
/** Rugby kits: jersey, hoops, shorts. */
const RUGBY_KITS = [
  ["#1d2a5c", "#f2f0e8", "#f2f0e8"], ["#7a1f2b", "#d9a400", "#1d1d20"], ["#14532d", "#f2f0e8", "#f2f0e8"],
  ["#1d1d20", "#d9a400", "#1d1d20"], ["#1f5fa8", "#1d1d20", "#f2f0e8"], ["#a3202a", "#1d1d20", "#1d1d20"],
];
/** Cricket club colours: cap, and the stripes on the jumper. */
const CRICKET_KITS = [["#1d2a5c", "#a3202a"], ["#7a1f2b", "#d9a400"], ["#14532d", "#d9a400"], ["#5b2a86", "#d9a400"], ["#1d2a5c", "#d9a400"]];
/** The Flag Lads' kit: shirt, trousers (home shirts with jeans or shorts, and the odd red away shirt). */
const SOCIETY_KITS = [["#f4f4f2", "#3a4a6b"], ["#f4f4f2", "#b5a27a"], ["#c8202a", "#3a4a6b"], ["#f4f4f2", "#1d1d20"]];
const FLAG_RED = lambert("#c8202a"), FLAG_WHITE = lambert("#f4f4f2"), ALU = lambert("#b9bec4"), WOOD = lambert("#8a5a2b"), MEGA = lambert("#e8e2d0");
/**
 * The bosses' clothes, one each (the look's kit): the Gaffer in a wax jacket over his England
 * shirt with a flag bucket hat; his right-hand man in a black bomber with a hi-vis armband; the
 * Gaffer's cousin in a navy gilet over the red away shirt, with a flat cap.
 * Jacket, its collar, shirt, trousers, shoes, hat.
 */
const BOSS_KITS = [
  ["#3f4a33", "#6b4426", "#f4f4f2", "#2c3348", "#4a2e1c", "bucket"],
  ["#1d1d20", "#1d1d20", "#1d1d20", "#25262b", "#111113", "bald"],
  ["#1f2a48", "#1f2a48", "#c8202a", "#b5a27a", "#6b4426", "flatcap"],
] as const;
const TWEED = lambert("#7a6a52");
/** The naughty girls' going-out clothes: top and skirt (one colour for a dress), and the handbag. */
const GIRL_KITS = [
  ["#ff3d9a", "#1d1d20", "#f4f4f2"], ["#1d1d20", "#1d1d20", "#d9b143"], ["#d81e2a", "#d81e2a", "#1d1d20"],
  ["#f4f4f2", "#c9a227", "#1d1d20"], ["#25c4d6", "#f4f4f2", "#ff3d9a"], ["#b8bec6", "#1d1d20", "#d81e2a"],
];
const GIRL_HAIR = ["#f0dc9a", "#e8d08a", "#2a1c14", "#5a3a22", "#a0522d", "#1d1d20"].map(lambert);
const TAN = ["#e8a878", "#dca07a", "#c98a62", "#b57d5c"].map(lambert);
/** How many kits each kind has (the characters page steps through them). */
export const KITS = [1, RUGBY_KITS.length, CRICKET_KITS.length, SOCIETY_KITS.length, SOCIETY_KITS.length, 1, GIRL_KITS.length];

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
/** Whether data point (x, y) is inside a ring of points. */
function inRing(ring: number[][], x: number, y: number) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * A speech bubble with a line in it, to hang over someone's head (its bottom, the tail's tip, is
 * at the sprite's position). A long line is broken over two or three rows.
 */
export function speechBubble(text: string): THREE.Sprite {
  const font = "italic 600 44px Georgia, 'Times New Roman', serif", wrap = 720, row = 52;
  const cv = document.createElement("canvas"), g = cv.getContext("2d")!;
  g.font = font;
  const rows: string[] = [];
  for (const word of text.split(" ")) {
    const last = rows.length ? `${rows[rows.length - 1]} ${word}` : word;
    if (rows.length && g.measureText(last).width <= wrap) rows[rows.length - 1] = last; else rows.push(word);
  }
  const w = Math.ceil(Math.max(...rows.map((r) => g.measureText(r).width))) + 48, h = 84 + (rows.length - 1) * row;
  cv.width = w; cv.height = h + 18;
  g.font = font;
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.strokeStyle = "#1d1d20"; g.lineWidth = 4;
  g.beginPath();
  g.roundRect(2, 2, w - 4, h - 4, 26);
  g.moveTo(w / 2 - 14, h - 3); g.lineTo(w / 2, h + 15); g.lineTo(w / 2 + 14, h - 3);
  g.fill(); g.stroke();
  g.fillRect(w / 2 - 12, h - 8, 24, 6);   // hide the outline where the tail joins
  g.fillStyle = "#1d1d20"; g.textAlign = "center"; g.textBaseline = "middle";
  rows.forEach((r, k) => g.fillText(r, w / 2, h / 2 + (k - (rows.length - 1) / 2) * row));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const scale = 0.0072;
  s.scale.set(cv.width * scale, cv.height * scale, 1);
  s.center.set(0.5, 0);
  return s;
}

/** The drawn naughty boy (or rugby or cricket player), with running and punching (or bat swinging). */
export class Figure {
  readonly root = new THREE.Group();
  /** Everything of him that leans into a run, bobs and falls: what shots hit and paint sticks to. */
  readonly body = new THREE.Group();
  private legL = new THREE.Group(); private legR = new THREE.Group();
  private armL = new THREE.Group(); private armR = new THREE.Group();
  private phase = 0;
  look = -1;
  /** 1: hands up (he's given up); 2: hands behind his back (cuffed). */
  hands = 0;
  private limp = false;
  private mount = 0;
  // what he's shouting, over his head
  private bubble: THREE.Sprite | null = null;
  private bubbleT = 0;
  // fading out as he runs off: each part's own see-through copy of its colour, and what it had before
  private faded: Map<THREE.Mesh, [THREE.Material | THREE.Material[], boolean]> | null = null;

  constructor() {
    this.dress(0);
    this.body.rotation.order = "YXZ";   // turn first, then lean or fall along the way he faces
    this.root.add(this.body);
    this.root.visible = false;
  }

  get kind() { return this.look >> 4; }

  /** New clothes for a new naughty boy: a tracksuit for a naughty boy, or the team's kit. */
  dress(look: number) {
    this.fade(1);
    this.look = look;
    this.hands = 0;
    this.limp = false;
    this.mount = 0;
    this.legL.visible = this.legR.visible = true;
    this.body.clear();
    const kind = look >> 4, kit = look & 15, skin = pick(SKIN);
    // only the big parts cast shadows, to keep the draw calls down on tablets
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(g, m); o.position.set(x, y, z);
      o.castShadow = g === GEO.leg || g === GEO.torso || g === GEO.sleeve || g === GEO.head || g === GEO.jersey || g === GEO.sock
        || g === GEO.bossLeg || g === GEO.bossSleeve || g === GEO.jacket || g === GEO.bareLeg || g === GEO.top;
      return o;
    };
    const limbs = (leg: (side: number) => THREE.Object3D[], arm: (side: number) => THREE.Object3D[]) => {
      for (const [g, side] of [[this.legL, -1], [this.legR, 1]] as const) {
        g.clear(); g.position.set(side * 0.1, 0.86, 0); g.add(...leg(side));
      }
      for (const [g, side] of [[this.armL, -1], [this.armR, 1]] as const) {
        g.clear(); g.position.set(side * 0.29, 1.42, 0); g.add(...arm(side));
      }
      this.body.add(this.legL, this.legR, this.armL, this.armR, mesh(GEO.head, skin, 0, 1.62, 0));
    };
    this.body.scale.setScalar(1);
    // a Wanted lookalike's features, over whatever he's wearing
    const extras = () => {
      const [hat, coat, bag, dog, limp] = featsOf(look);
      if (coat) {
        this.body.add(mesh(GEO.coat, COATS[coat], 0, 1.17, 0));
        for (const arm of [this.armL, this.armR]) arm.add(mesh(GEO.coatSleeve, COATS[coat]));
      }
      if (hat) this.body.add(mesh(GEO.trilby, HAT, 0, 1.7, 0), mesh(GEO.trilbyBrim, HAT, 0, 1.71, 0));
      if (bag) {
        this.body.add(mesh(GEO.satchel, LEATHER, -0.3, 0.95, 0.02));
        const strap = mesh(GEO.satchelStrap, LEATHER, -0.04, 1.2, -0.16);
        strap.rotation.z = -0.55;
        this.body.add(strap);
      }
      if (dog) {
        const d = new THREE.Group();
        d.add(mesh(GEO.dogBody, DOG, 0, 0.38, 0), mesh(GEO.dogHead, DOG, 0, 0.5, -0.38), mesh(GEO.dogTail, DOG, 0, 0.5, 0.36));
        for (const [x, z] of [[-0.08, -0.2], [0.08, -0.2], [-0.08, 0.2], [0.08, 0.2]]) d.add(mesh(GEO.dogLeg, DOG, x, 0.1, z));
        d.position.set(0.75, 0, -0.35);
        this.body.add(d);
      }
      if (limp) { this.limp = true; this.armL.add(mesh(GEO.walkStick, WOOD)); }
    };
    if (kind === GIRL) {
      // a going-out tan, the clothes, and long hair down her back
      const [top, skirt, bag] = (GIRL_KITS[kit & 7] ?? GIRL_KITS[0]).map(lambert), tan = pick(TAN), hair = pick(GIRL_HAIR);
      for (const [g, side] of [[this.legL, -1], [this.legR, 1]] as const) {
        g.clear(); g.position.set(side * 0.085, 0.86, 0); g.add(mesh(GEO.bareLeg, tan), mesh(GEO.heel, BLACK), mesh(GEO.spike, BLACK));
      }
      for (const [g, side] of [[this.armL, -1], [this.armR, 1]] as const) {
        g.clear(); g.position.set(side * 0.24, 1.4, 0); g.add(mesh(GEO.arm, tan), mesh(GEO.hand, tan));
        if (side < 0) g.add(mesh(GEO.bag, bag, -0.07, 0, 0));
      }
      this.body.add(this.legL, this.legR, this.armL, this.armR, mesh(GEO.head, tan, 0, 1.6, 0),
        mesh(GEO.skirt, skirt, 0, 0.88, 0), mesh(GEO.tummy, tan, 0, 1.07, 0), mesh(GEO.top, top, 0, 1.28, 0),
        mesh(GEO.strap, top, -0.12, 1.48, 0), mesh(GEO.strap, top, 0.12, 1.48, 0),
        mesh(GEO.cap, hair, 0, 1.61, 0.01), mesh(GEO.locks, hair, 0, 1.43, 0.11));
      this.body.scale.setScalar(sizeOf(look));
      return;
    }
    if (kind === CHAIR) {
      // a Flag Lads boss: bigger and heavier built than his lads, and dressed his own way
      const k = BOSS_KITS[kit] ?? BOSS_KITS[0], [jacket, collar, shirt, trousers, shoes] = k.slice(0, 5).map((c) => lambert(c as string));
      const hat = k[5], megaphone = kit !== 1;
      limbs(
        () => [mesh(GEO.bossLeg, trousers), mesh(GEO.bossShoe, shoes)],
        (side) => [mesh(GEO.bossSleeve, kit === 2 ? shirt : jacket), mesh(GEO.hand, skin),
          ...(side > 0 && megaphone ? [mesh(GEO.horn, MEGA)] : []),
          ...(side < 0 && kit === 1 ? [mesh(GEO.armband, HIVIS)] : [])]);
      this.body.add(mesh(GEO.jacket, jacket, 0, 1.17, 0),
        mesh(GEO.jacketCollar, collar, 0, 1.47, 0.01), mesh(GEO.shades, BLACK, 0, 1.645, -0.14));
      if (kit === 1) {
        this.body.add(mesh(GEO.gut, jacket, 0, 1.0, -0.14));
      } else {
        // the jacket hangs open over the shirt and the gut pushing out of it, the cross on his chest
        this.body.add(mesh(GEO.shirtFront, shirt, 0, 1.2, -0.157), mesh(GEO.gut, shirt, 0, 1.0, -0.14),
          mesh(GEO.crossUp, kit === 2 ? FLAG_WHITE : FLAG_RED, 0, 1.32, -0.165), mesh(GEO.crossAcross, kit === 2 ? FLAG_WHITE : FLAG_RED, 0, 1.32, -0.165));
      }
      if (hat === "bucket") {
        this.body.add(mesh(GEO.bucket, FLAG_WHITE, 0, 1.68, 0), mesh(GEO.bucketBand, FLAG_RED, 0, 1.71, 0), mesh(GEO.bucketBrim, FLAG_WHITE, 0, 1.69, 0));
      } else if (hat === "flatcap") {
        this.body.add(mesh(GEO.cap, TWEED, 0, 1.64, 0.01), mesh(GEO.brim, TWEED, 0, 1.69, -0.14));
      }
      this.mount = mountOf(look);
      if (this.mount === 1) {
        // sat on a mobility scooter, legs out in front
        this.body.add(mesh(GEO.scooterBase, MOTOR, 0, 0.3, 0.1), mesh(GEO.scooterSeat, WOOD, 0, 0.6, 0.35), mesh(GEO.scooterBack, WOOD, 0, 0.85, 0.55),
          mesh(GEO.scooterPost, ALU, 0, 0.8, -0.38), mesh(GEO.scooterBar, ALU, 0, 1.2, -0.38));
        for (const [x, z] of [[-0.3, -0.45], [0.3, -0.45], [-0.3, 0.65], [0.3, 0.65]]) this.body.add(mesh(GEO.scooterWheel, TYRE, x, 0.17, z));
        this.legL.rotation.x = this.legR.rotation.x = -1.2;
      } else if (this.mount === 2) {
        // driving off in his van: the cab round him, the box behind
        this.legL.visible = this.legR.visible = false;
        this.body.add(mesh(GEO.vanBox, VAN, 0, 1.2, 1.7), mesh(GEO.vanCab, VAN, 0, 0.8, -0.4), mesh(GEO.vanGlass, GLASS, 0, 1.4, -1.06));
        for (const [x, z] of [[-1.0, -0.6], [1.0, -0.6], [-1.0, 1.9], [1.0, 1.9]]) this.body.add(mesh(GEO.vanWheel, TYRE, x, 0.4, z));
      }
      this.body.scale.setScalar(sizeOf(look));
      return;
    }
    if (kind === SOCIETY || kind === LADDER) {
      const [shirt, trousers] = (SOCIETY_KITS[kit & 7] ?? SOCIETY_KITS[0]).map(lambert);
      const cross = shirt === FLAG_RED ? FLAG_WHITE : FLAG_RED;
      limbs(
        () => [mesh(GEO.leg, trousers), mesh(GEO.shoe, BLACK)],
        (side) => side > 0
          ? [mesh(GEO.sleeve, shirt), mesh(GEO.hand, skin), ...(kind === SOCIETY ? [mesh(GEO.stick, WOOD), mesh(GEO.minFlag, FLAG_WHITE)] : [])]
          : [mesh(GEO.sleeve, shirt), mesh(GEO.hand, skin)]);
      this.body.add(mesh(GEO.torso, shirt, 0, 1.16, 0), mesh(GEO.cap, pick(HAIR), 0, 1.62, 0),
        mesh(GEO.crossUp, cross, -0.1, 1.3, -0.13), mesh(GEO.crossAcross, cross, -0.1, 1.3, -0.13));
      // the flag worn as a cape: every other lad in the white shirt
      if (kind === SOCIETY && kit % 2 === 1) {
        this.body.add(mesh(GEO.cape, FLAG_WHITE, 0, 1.12, 0.14), mesh(GEO.capeUp, FLAG_RED, 0, 1.12, 0.15), mesh(GEO.capeAcross, FLAG_RED, 0, 1.2, 0.15));
      }
      if (kind === LADDER) {
        // hi-vis, and a ladder over the right shoulder, front to back
        this.body.add(mesh(GEO.vest, HIVIS, 0, 1.2, 0));
        const ladder = new THREE.Group();
        ladder.add(mesh(GEO.rail, ALU, -0.17, 0, 0), mesh(GEO.rail, ALU, 0.17, 0, 0));
        for (let k = -3; k <= 3; k++) ladder.add(mesh(GEO.rung, ALU, 0, 0, k * 0.32));
        ladder.position.set(0.32, 1.52, 0.1);
        ladder.rotation.z = -1.2;
        this.body.add(ladder);
      }
      extras();
      return;
    }
    if (kind === RUGBY) {
      const [jersey, hoop, shorts] = (RUGBY_KITS[kit] ?? RUGBY_KITS[0]).map(lambert);
      limbs(
        () => [mesh(GEO.shorts, shorts), mesh(GEO.knee, skin), mesh(GEO.sock, jersey), mesh(GEO.sockHoop, hoop), mesh(GEO.shoe, BLACK)],
        () => [mesh(GEO.sleeve, jersey), mesh(GEO.sleeveHoop, hoop), mesh(GEO.hand, skin)]);
      this.body.add(mesh(GEO.jersey, jersey, 0, 1.16, 0), mesh(GEO.collar, WHITE, 0, 1.46, -0.02),
        ...[-0.2, 0, 0.2].map((y) => mesh(GEO.hoop, hoop, 0, 1.16 + y, 0)), mesh(GEO.cap, pick(HAIR), 0, 1.63, 0.01));
      this.body.scale.setScalar(1.06);   // big lads
    } else if (kind === CRICKET) {
      const [cap, stripe] = (CRICKET_KITS[kit] ?? CRICKET_KITS[0]).map(lambert);
      limbs(
        () => [mesh(GEO.leg, CREAM), mesh(GEO.shoe, WHITE)],
        (side) => side > 0
          ? [mesh(GEO.sleeve, CREAM), mesh(GEO.hand, skin), mesh(GEO.handle, GRIP), mesh(GEO.blade, WILLOW)]
          : [mesh(GEO.sleeve, CREAM), mesh(GEO.hand, skin)]);
      const v = (side: number) => { const m = mesh(GEO.vee, stripe, side * 0.05, 1.37, -0.128); m.rotation.z = side * 0.45; return m; };
      this.body.add(mesh(GEO.torso, CREAM, 0, 1.16, 0), v(-1), v(1), mesh(GEO.band, stripe, 0, 0.9, 0),
        mesh(GEO.cap, cap, 0, 1.65, 0), mesh(GEO.brim, cap, 0, 1.67, -0.15));
    } else {
      const suit = pick(TRACKIES), cap = pick(CAPS);
      const stripe = suit === TRACKIES[0] ? TRACKIES[3] : WHITE;
      limbs(
        (side) => [mesh(GEO.leg, suit), mesh(GEO.stripe, stripe, side * 0.076), mesh(GEO.shoe, WHITE)],
        (side) => [mesh(GEO.sleeve, suit), mesh(GEO.stripe, stripe, side * 0.06), mesh(GEO.hand, skin)]);
      const chain = mesh(GEO.chain, GOLD, 0, 1.34, -0.13);
      chain.scale.set(1, 1.3, 1);
      this.body.add(mesh(GEO.torso, suit, 0, 1.16, 0), mesh(GEO.cap, cap, 0, 1.65, 0), mesh(GEO.brim, cap, 0, 1.67, -0.15), chain);
    }
    extras();
    // a ringleader: a size bigger, with a chunky gold chain
    if (look & BOSS) {
      const chain = mesh(GEO.chain, GOLD, 0, 1.3, -0.15);
      chain.scale.set(1.6, 2, 1.2);
      this.body.add(chain);
      this.body.scale.setScalar(sizeOf(look));
    }
    // the one loud thing a Wanted man wears, so you can pick him out
    const loud = wearing(look);
    if (loud === 1) {
      this.body.add(mesh(GEO.rosette, ROSETTE, 0.11, 1.32, -0.17));
      for (const side of [-1, 1]) { const t = mesh(GEO.tail, ROSETTE, 0.11 + side * 0.03, 1.2, -0.165); t.rotation.z = side * 0.25; this.body.add(t); }
    } else if (loud === 2) {
      this.body.add(mesh(GEO.tabard, HIVIS, 0, 1.18, 0), mesh(GEO.reflect, ALU, 0, 1.08, 0), mesh(GEO.reflect, ALU, 0, 1.26, 0));
    } else if (loud === 3) {
      this.body.add(mesh(GEO.bigBrim, PURPLE, 0, 1.76, 0), mesh(GEO.crown, PURPLE, 0, 1.76, 0));
    }
  }

  /** Show what he's shouting in a bubble over his head for a few seconds. */
  say(text: string) {
    this.unsay();
    const s = speechBubble(text);
    s.position.y = 2.05;
    this.root.add(s);
    this.bubble = s;
    this.bubbleT = 2.8;
  }

  private unsay() {
    if (!this.bubble) return;
    this.root.remove(this.bubble);
    this.bubble.material.map?.dispose();
    this.bubble.material.dispose();
    this.bubble = null;
  }

  /**
   * How solid he is, 1 down to 0 as he fades away. The colours are shared by every naughty boy, so a
   * fading one gets see-through copies of his own, and has his back at 1.
   */
  fade(a: number) {
    if (a >= 1) {
      if (!this.faded) return;
      for (const [m, [was, shadow]] of this.faded) {
        for (const x of Array.isArray(m.material) ? m.material : [m.material]) x.dispose();
        m.material = was; m.castShadow = shadow;
      }
      this.faded = null;
      return;
    }
    if (!this.faded) {
      const faded = this.faded = new Map();
      this.body.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        faded.set(o, [o.material, o.castShadow]);
        const see = (x: THREE.Material) => { const c = x.clone(); c.transparent = true; return c; };
        o.material = Array.isArray(o.material) ? o.material.map(see) : see(o.material);
        o.castShadow = false;
      });
    }
    for (const m of this.faded.keys()) for (const x of Array.isArray(m.material) ? m.material : [m.material]) x.opacity = Math.max(0, a);
  }

  /**
   * speed in m/s, punch counts down from 1 over a swing, dead in seconds since he'd had enough (or
   * 0): knocked flat on his back, then back on his feet to leg it. Returns true when a foot comes down.
   */
  pose(x: number, y: number, z: number, yaw: number, speed: number, punch: number, dead: number, dt: number): boolean {
    this.root.position.set(x, y, z);
    if (this.bubble) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0 || (dead > 0 && dead < OFF_SECS)) this.unsay();
      else this.bubble.material.opacity = Math.min(1, this.bubbleT / 0.4);
    }
    this.body.rotation.y = yaw;
    const run = Math.min(1, speed / RUN);
    const stride = Math.floor(this.phase / Math.PI);
    this.phase += dt * speed * 2.1;
    const swing = this.mount ? 0 : Math.sin(this.phase) * Math.min(0.95, speed * 0.17);
    this.legL.rotation.x = this.mount === 1 ? -1.2 : swing; this.legR.rotation.x = this.mount === 1 ? -1.2 : -swing;
    // a limp: the bad leg hardly moves, and he dips and sways onto the good one
    if (this.limp) this.legR.rotation.x *= 0.25;
    this.armL.rotation.x = -swing * 0.8; this.armR.rotation.x = swing * 0.8;
    this.armR.rotation.z = 0;
    if (this.kind === CRICKET || this.kind === CHAIR) {
      // carrying the bat: it swings less, held a little out to the side
      this.armR.rotation.x = swing * 0.3 + 0.15;
      this.armR.rotation.z = 0.12;
      // a swing of the bat: up high and down across
      if (punch > 0) {
        const k = 1 - punch;
        this.armR.rotation.x = k < 0.35 ? (k / 0.35) * 2.6 : 2.6 - ((k - 0.35) / 0.65) * 2.4;
        this.armR.rotation.z = 0.12 + Math.sin(k * Math.PI) * 0.5;
      }
    } else if (punch > 0) this.armR.rotation.x = Math.sin((1 - punch) * Math.PI) * 1.75;   // a punch: the right arm jabs straight out
    // given up: hands in the air; cuffed: hands behind his back
    if (this.hands && !dead) {
      const up = this.hands === 1;
      this.armL.rotation.x = this.armR.rotation.x = up ? Math.PI * 0.92 : -0.45;
      this.armL.rotation.z = up ? -0.2 : 0.25; this.armR.rotation.z = up ? 0.2 : -0.25;
    } else this.armL.rotation.z = 0;
    this.body.position.y = this.mount ? 0 : Math.abs(Math.sin(this.phase)) * 0.05 * run - (this.limp ? Math.max(0, Math.sin(this.phase)) * 0.07 * run : 0);
    this.body.rotation.z = this.limp ? Math.sin(this.phase) * 0.12 * run : 0;
    // lean into the run; knocked flat on his back, then up again
    const flat = dead <= 0 ? 0 : dead < DOWN_SECS ? Math.min(1, dead * 3.2) : Math.max(0, 1 - (dead - DOWN_SECS) / UP_SECS);
    this.body.rotation.x = flat * (Math.PI / 2) - (1 - flat) * 0.22 * run;
    return Math.floor(this.phase / Math.PI) !== stride;
  }

  /** Gone: no bubble left hanging about. */
  hide() { this.root.visible = false; this.unsay(); this.fade(1); }
}

class NaughtyBoy {
  state = GONE; gen = 0; hp = TEAM[NAUGHTY].hp; punches = 0; target = ""; look = 0;
  x = 0; y = 0; z = 0; yaw = 0;                 // the host's word
  // as drawn: smoothed from the host's updates
  dx = 0; dy = 0; dz = 0; dyaw = 0; speed = 0;
  snaps: { t: number; x: number; y: number; z: number; yaw: number }[] = [];
  // host only
  vx = 0; vz = 0; hop = 0; hopV = 0; deadT = 0; punchCD = 0; seeT = Math.random() * 0.4; blindT = 0;
  lastX = 0; lastZ = 0; chaseT = 0; calmT = 0; stuckT = 0; detour = 0; detourT = 0; wanderT = 0; wanderYaw = 0; wanderGo = false;
  homeX = 0; homeZ = 0;                        // the spot he hangs about at
  fleeX = 0; fleeZ = 0;                        // host: which way he legs it once he's had enough
  top = 0;                                     // his health when he turned up, for the boss bar
  armour = 0;                                  // host: how much of each hit he shrugs off (0 to 1)
  keep = false;                                // brought by a job or the Flag Lads: stays put even with nobody near
  pace = 1;                                    // host: how much faster than his kind he runs when sent (the Gaffer on a scooter)
  bolt = false;                                // host: on the run, and nobody picks a fight with him or draws him in to one
  stay = false;                                // host: a ladder lad who holds his ground at the pub
  spare = false;                               // a job wants him to give up rather than go down
  meek = false;                                // he's given up: doesn't fight back, stays put or goes where he's sent
  rush = false;                                // running (not strolling) back to his spot
  baseX = 0; baseZ = 0;                        // where he turned up: for a team, their pitch
  crowd = false;                               // host: one of the night out's crowd
  leaving = false;                             // host: and off home at the end of the night
  foe = -1;                                    // host: which of the others he's fighting, or -1
  fightT = 0;                                  // host: how long he's been at it
  // drawing
  fig = new Figure(); punchAnim = 0; seenPunches = 0; deadAnim = 0;
  seenTarget = "";                             // who he was after when last drawn, to hear him shout
  shoutT = 0;                                  // seconds till he shouts again mid-chase
  hopping = false;                             // in the air, as drawn

  constructor(readonly i: number) {}
  /** Who's bleeding, for the blood trails. */
  get key() { return `naughtyBoy${this.i}.${this.gen}`; }
  /** Picks his voice: the same naughty boy always sounds the same. */
  get voice() { return this.i * 101 + this.gen; }
  get kind() { return this.look >> 4; }
  get team() { return TEAM[this.kind] ?? TEAM[NAUGHTY]; }
}

export class NaughtyBoys {
  readonly list: NaughtyBoy[] = [];
  private pitches = new WeakMap<GameMap, Ground[]>();
  private spawnT = 5;
  private fieldT = 1;
  private clock = 0;
  // Called on every client, to play sounds. voice is a number to give each naughty boy his own voice.
  /** A naughty boy throws a punch. */
  onSwing: (x: number, y: number, z: number, voice: number) => void = () => {};
  /** A naughty boy spots someone and shouts. kind is NAUGHTY, RUGBY or CRICKET; the posh ones say line. */
  onShout: (x: number, y: number, z: number, voice: number, kind: number, line: string, scared?: boolean) => void = () => {};
  /** A naughty boy's foot comes down (speed in m/s). */
  onStep: (x: number, y: number, z: number, speed: number) => void = () => {};
  /**
   * Host: a gang of naughty boys is about to turn up at (x, z). Return true to bring them yourself (in a
   * car), and put them there with gangAt() when they arrive.
   */
  arrive: (x: number, z: number, size: number) => boolean = () => false;

  constructor(private map: GameMap, scene: THREE.Scene) {
    for (let i = 0; i < SLOTS; i++) {
      const c = new NaughtyBoy(i);
      this.list.push(c);
      scene.add(c.fig.root);
    }
  }

  // ---- host: the AI -------------------------------------------------------------------------

  /** Run the naughty boys for a frame. punch(i, id, damage) is called when naughty boy i lands a punch on player id. */
  simulate(dt: number, targets: Target[], punch: (i: number, id: string, damage: number) => void) {
    const alive = targets.filter((t) => t.alive), prey = alive.filter((t) => !t.passive);
    this.clock += dt;
    if ((this.fieldT -= dt) <= 0) { this.fieldT = 1; this.turnOut(targets, alive); this.nightOut(targets); }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 4;
      const want = Math.min(MAX, 3 + 3 * targets.length);
      const active = this.list.filter((c) => c.state !== GONE && !c.keep).length;
      const free = this.list.filter((c) => c.state === GONE).length - 6;   // leave a few for the jobs
      if (active < want && free > 0 && alive.length) this.spawnGang(targets, alive, Math.min(free, want - active));
    }
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (c.state === DEAD) {
        this.legIt(c, dt);
        if (c.deadT > OUT_SECS) c.state = GONE;
        continue;
      }
      if (c.state !== ALIVE) continue;
      this.think(c, dt, prey);
      // wander off the map's edge of interest: too far from anyone to matter
      if (!c.keep && !c.target && c.foe < 0 && !alive.some((t) => Math.hypot(t.x - c.x, t.z - c.z) < 170) && alive.length) { c.state = GONE; continue; }
      this.move(c, i, dt, prey, punch);
    }
  }

  private sees(c: NaughtyBoy, t: Target, dist: number) {
    const ox = c.x, oy = c.y + 1.6, oz = c.z;
    const dx = t.x - ox, dy = t.y + 1.5 - oy, dz = t.z - oz, l = Math.hypot(dx, dy, dz) || 1;
    const hit = this.map.raycast(ox, oy, oz, dx / l, dy / l, dz / l, dist);
    return !hit || hit.dist > l - 0.4;
  }

  /** Pick, keep or drop a target. Sight checks are a few times a second, not every frame. */
  private think(c: NaughtyBoy, dt: number, alive: Target[]) {
    if (c.kind === LADDER) return;   // they don't pick fights
    if (c.meek) { c.target = ""; c.foe = -1; return; }
    if (c.bolt) return;   // on the run: he never stops to pick a fight
    c.calmT -= dt;
    // squaring up to one of the others: till one of them's had enough, or it fizzles out
    if (c.foe >= 0 && !c.target) {
      if (this.list[c.foe]?.state !== ALIVE || (c.fightT += dt) > FIGHT_MAX) { c.foe = -1; c.calmT = 4; }
      return;
    }
    c.seeT -= dt;
    if (c.seeT > 0) return;
    const every = 0.35;
    c.seeT = every;
    if (c.target) {
      const t = alive.find((p) => p.id === c.target);
      const dist = t ? Math.hypot(t.x - c.x, t.z - c.z) : Infinity;
      if (!t || dist > c.team.lose || (c.chaseT > TIRED_SECS && dist > 12)) { c.target = ""; c.calmT = CALM_SECS; return; }
      if (this.sees(c, t, dist)) { c.blindT = 0; c.lastX = t.x; c.lastZ = t.z; }
      else if ((c.blindT += every) > BLIND_SECS) { c.target = ""; c.calmT = CALM_SECS; }
      return;
    }
    if (c.calmT > 0 || c.rush) return;
    let best: Target | null = null, bd = c.crowd ? CROWD_SPOT : c.team.spot;
    for (const t of alive) {
      const d = Math.hypot(t.x - c.x, t.z - c.z);
      if (d < bd && this.sees(c, t, d)) { bd = d; best = t; }
    }
    if (!best) {
      if (c.keep) return;
      // the teams don't wait to be found: they wander over to whoever's nearest their pitch, and
      // go back to it when there's no one about
      if (c.kind !== NAUGHTY) {
        let near: Target | null = null, nd = PROWL;
        for (const t of alive) { const d = Math.hypot(t.x - c.baseX, t.z - c.baseZ); if (d < nd) { nd = d; near = t; } }
        c.homeX = near ? near.x : c.baseX; c.homeZ = near ? near.z : c.baseZ;
      }
      return;
    }
    // he shouts, and his mates join in (in the crowd on a night out, only the few nearest him)
    const mates = c.crowd ? CROWD_MATES : 18;
    for (const o of this.list) {
      if (o.state !== ALIVE || o.meek || o.bolt || (o !== c && (o.target || o.foe >= 0 || o.calmT > 0 || o.leaving || Math.hypot(o.x - c.x, o.z - c.z) > mates))) continue;
      o.target = best.id; o.blindT = 0; o.chaseT = 0; o.lastX = best.x; o.lastZ = best.z; o.foe = -1;
    }
  }

  private move(c: NaughtyBoy, i: number, dt: number, alive: Target[], punch: (i: number, id: string, damage: number) => void) {
    c.punchCD -= dt;
    let dirX = 0, dirZ = 0, spd = 0, face: number | null = null;
    const t = c.target ? alive.find((p) => p.id === c.target) : undefined;
    // a ladder crew legs it from anyone close, and otherwise gets on with putting flags up
    const scared = c.kind === LADDER && !c.stay ? alive.find((p) => Math.hypot(p.x - c.x, p.z - c.z) < c.team.spot) : undefined;
    if (scared) {
      const ax = c.x - scared.x, az = c.z - scared.z, al = Math.hypot(ax, az) || 1;
      dirX = ax / al; dirZ = az / al; spd = c.team.run;
    } else if (t) {
      const dx = t.x - c.x, dz = t.z - c.z, dist = Math.hypot(dx, dz);
      if (dist < c.team.reach && Math.abs(t.y - c.y) < 1.4 && c.blindT === 0) {
        face = Math.atan2(-dx, -dz);
        c.chaseT = 0;
        c.vx *= 0.7; c.vz *= 0.7;   // pull up rather than run into you
        if (c.punchCD <= 0) { c.punchCD = PUNCH_EVERY; c.punches++; punch(i, t.id, Math.round(c.team.hit * (c.look & BOSS ? 1.5 : 1))); }
      } else {
        c.punchCD = Math.max(c.punchCD, WIND_UP);   // a moment to square up before the first punch
        c.chaseT += dt;
        const gx = c.lastX - c.x, gz = c.lastZ - c.z, gl = Math.hypot(gx, gz);
        if (gl > 0.6) { dirX = gx / gl; dirZ = gz / gl; spd = c.team.run; }
      }
    } else if (c.foe >= 0 && this.list[c.foe]?.state === ALIVE) {
      // going for one of the others: square up, then lay into them
      const o = this.list[c.foe], dx = o.x - c.x, dz = o.z - c.z, dist = Math.hypot(dx, dz);
      if (dist < c.team.reach && Math.abs(o.y - c.y) < 1.4) {
        face = Math.atan2(-dx, -dz);
        c.vx *= 0.7; c.vz *= 0.7;
        if (c.punchCD <= 0) { c.punchCD = PUNCH_EVERY + Math.random() * 0.5; c.punches++; this.brawlHit(c, o); }
      } else {
        c.punchCD = Math.max(c.punchCD, WIND_UP);
        dirX = dx / (dist || 1); dirZ = dz / (dist || 1); spd = c.team.run * 0.8;
      }
    } else {
      c.wanderT -= dt;
      const hx = c.homeX - c.x, hz = c.homeZ - c.z, hd = Math.hypot(hx, hz);
      if (c.rush && hd < 2) c.rush = false;
      if (hd > (c.kind === LADDER || c.rush ? 0.8 : c.crowd ? 2 : HOME_RANGE)) { dirX = hx / hd; dirZ = hz / hd; spd = c.rush ? c.team.run * c.pace : STROLL * (hd > 15 ? 1.6 : 1); }   // back to his spot
      else if (c.kind === LADDER) { /* up the ladder */ }
      else {
        if (c.wanderT <= 0) { c.wanderT = 2 + Math.random() * 4; c.wanderGo = Math.random() < (c.crowd ? 0.12 : 0.35); c.wanderYaw = Math.random() * Math.PI * 2; }
        if (c.wanderGo) { dirX = -Math.sin(c.wanderYaw); dirZ = -Math.cos(c.wanderYaw); spd = STROLL; }
      }
    }
    // stuck on something: try going round it at an angle for a bit
    if (c.detourT > 0) {
      c.detourT -= dt;
      const cs = Math.cos(c.detour), sn = Math.sin(c.detour);
      [dirX, dirZ] = [dirX * cs - dirZ * sn, dirX * sn + dirZ * cs];
    }
    // steep ground slows them like it slows you
    if (spd > 0) {
      const ahead = this.map.ground(c.x + dirX * spd * 0.15, c.z + dirZ * spd * 0.15) - this.map.ground(c.x, c.z);
      const grade = ahead / (spd * 0.15);
      if (grade > 0.35) spd *= Math.max(0.35, 1 - (grade - 0.35) * 1.2);
    }
    let wx = dirX * spd, wz = dirZ * spd;
    // keep out of each other's way
    for (const o of this.list) {
      if (o === c || o.state !== ALIVE) continue;
      const ex = c.x - o.x, ez = c.z - o.z, d = Math.hypot(ex, ez);
      if (d < 0.9 && d > 1e-4) { wx += (ex / d) * (0.9 - d) * 4; wz += (ez / d) * (0.9 - d) * 4; }
    }
    const k = Math.min(1, dt * 8);
    c.vx += (wx - c.vx) * k; c.vz += (wz - c.vz) * k;

    const nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
    // while hopping a wall, low walls and fences don't block
    let p = this.map.collide({ x: nx, z: nz }, c.y + (c.hop > 0 ? 1.05 : 0), RADIUS);
    if (spd > 1 && c.hop === 0) {
      const want = spd * dt, prog = ((p.x - c.x) * dirX + (p.z - c.z) * dirZ) / want;
      if (prog < 0.35) {
        const over = this.map.collide({ x: nx, z: nz }, c.y + 1.05, RADIUS);
        if (((over.x - c.x) * dirX + (over.z - c.z) * dirZ) / want > 0.6) { p = over; c.hopV = 4.2; c.hop = 0.001; }
        else if ((c.stuckT += dt) > 0.5) {
          c.stuckT = 0;
          c.detour = (c.detour > 0 ? 1 : -1) * (Math.random() < 0.3 ? -1 : 1) * (0.9 + Math.random() * 0.7);
          c.detourT = 0.8 + Math.random();
        }
      } else c.stuckT = Math.max(0, c.stuckT - dt);
    }
    c.vx = ((p.x - c.x) / dt) * 0.9 + c.vx * 0.1;
    c.vz = ((p.z - c.z) / dt) * 0.9 + c.vz * 0.1;
    c.x = p.x; c.z = p.z;
    if (c.hop > 0) {
      c.hopV -= 22 * dt; c.hop += c.hopV * dt;
      if (c.hop <= 0) { c.hop = 0; c.hopV = 0; }
    }
    c.y = this.map.ground(c.x, c.z) + c.hop;
    const sp = Math.hypot(c.vx, c.vz);
    if (face === null && sp > 0.4) face = Math.atan2(-c.vx, -c.vz);
    if (face !== null) {
      const dy = Math.atan2(Math.sin(face - c.yaw), Math.cos(face - c.yaw));
      c.yaw += dy * Math.min(1, dt * 10);
    }
  }

  /** Host: he's had enough. Down for a moment (sliding to a stop if a car sent him flying), then up
   *  and away at a pace nobody on foot can match, over low walls and round anything bigger. */
  private legIt(c: NaughtyBoy, dt: number) {
    // just took over as host: carry on from where the old one had him, the way he's facing
    if (!c.fleeX && !c.fleeZ) { c.deadT = c.deadAnim; c.fleeX = -Math.sin(c.yaw); c.fleeZ = -Math.cos(c.yaw); }
    c.deadT += dt;
    const run = c.deadT > OFF_SECS ? FLEE * Math.min(1, (c.deadT - OFF_SECS) / 0.4) : 0;
    if (run > 0) {
      const k = Math.min(1, dt * 8);
      c.vx += (c.fleeX * run - c.vx) * k; c.vz += (c.fleeZ * run - c.vz) * k;
    } else { const k = Math.exp(-4 * dt); c.vx *= k; c.vz *= k; }
    if (Math.hypot(c.vx, c.vz) < 0.05) { c.y = this.map.ground(c.x, c.z) + c.hop; return; }
    const nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
    let p = this.map.collide({ x: nx, z: nz }, c.y + (c.hop > 0 ? 1.05 : 0), RADIUS);
    if (run > 1 && c.hop === 0) {
      const want = Math.hypot(c.vx, c.vz) * dt, prog = ((p.x - c.x) * c.fleeX + (p.z - c.z) * c.fleeZ) / want;
      if (prog < 0.35) {
        const over = this.map.collide({ x: nx, z: nz }, c.y + 1.05, RADIUS);
        if (((over.x - c.x) * c.fleeX + (over.z - c.z) * c.fleeZ) / want > 0.6) { p = over; c.hopV = 4.2; c.hop = 0.001; }
        else {
          // something big in the way: veer off round it, always the same side
          if (!c.detour) c.detour = Math.random() < 0.5 ? -1 : 1;
          const a = c.detour * 4 * dt, cs = Math.cos(a), sn = Math.sin(a);
          [c.fleeX, c.fleeZ] = [c.fleeX * cs - c.fleeZ * sn, c.fleeX * sn + c.fleeZ * cs];
        }
      }
    }
    c.x = p.x; c.z = p.z;
    if (c.hop > 0) {
      c.hopV -= 22 * dt; c.hop += c.hopV * dt;
      if (c.hop <= 0) { c.hop = 0; c.hopV = 0; }
    }
    c.y = this.map.ground(c.x, c.z) + c.hop;
    if (run > 0) {
      const face = Math.atan2(-c.vx, -c.vz), dy = Math.atan2(Math.sin(face - c.yaw), Math.cos(face - c.yaw));
      c.yaw += dy * Math.min(1, dt * 10);
    }
  }

  /** The rugby pitches and cricket fields in one area (not football pitches): the spots on and round
   *  each for a team to turn out at, and how to tell if someone's on it. */
  private pitchesIn(area: GameMap) {
    const had = this.pitches.get(area);
    if (had) return had;
    const out: Ground[] = [];
    const spots = (pts: number[][]) => pts.flatMap(([x, y]) => { const s = clearSpot(this.map, x, -y, 6); return s ? [{ x: s[0], z: s[1] }] : []; });
    for (const p of area.d.pi ?? []) {
      if (p[0] === "r") {
        // the middle, both ends and along both touchlines
        const [, cx, cy, L, W, ang] = p, ux = Math.cos(ang), uy = Math.sin(ang);
        const at = [[0, 0], [L / 2, 0], [-L / 2, 0], [0, W / 2 + 3], [0, -W / 2 - 3], [L / 4, W / 2 + 3], [-L / 4, -W / 2 - 3]]
          .map(([s, t]) => [cx + ux * s - uy * t, cy + uy * s + ux * t]);
        const on = (x: number, z: number) => {
          const dx = x - cx, dy = -z - cy;
          return Math.abs(dx * ux + dy * uy) < L / 2 + 5 && Math.abs(-dx * uy + dy * ux) < W / 2 + 5;
        };
        out.push({ kind: RUGBY, spots: spots(at), on, met: new Map(), owed: false, next: 0 });
      } else if (p[0] === "c") {
        // the square, and round the boundary
        const ring = p[4], n = Math.min(8, ring.length);
        const at = [[p[1], p[2]], ...Array.from({ length: n }, (_, k) => ring[Math.floor((k * ring.length) / n)])];
        out.push({ kind: CRICKET, spots: spots(at), on: (x, z) => inRing(ring, x, -z), met: new Map(), owed: false, next: 0 });
      }
    }
    this.pitches.set(area, out);
    return out;
  }

  /** The teams turn out at a pitch when someone walks on to it, and every few minutes while anyone's still there. */
  private turnOut(everyone: Target[], alive: Target[]) {
    const busy = new Set<Ground>();
    for (const t of alive) {
      for (const area of [this.map, ...this.map.tilesNear(t.x, t.z, PITCH_NEAR)]) {
        for (const g of this.pitchesIn(area)) {
          if (!g.on(t.x, t.z)) continue;
          const last = g.met.get(t.id);
          if (last === undefined || this.clock - last > TEAM_BACK) g.owed = true;   // just arrived
          g.met.set(t.id, this.clock);
          busy.add(g);
        }
      }
    }
    for (const g of busy) {
      if (!g.owed && this.clock < g.next) continue;
      const free = this.list.filter((c) => c.state === GONE).length - 6;   // leave a few for the jobs
      const taken = this.list.filter((c) => c.state === ALIVE);
      const near = g.spots.filter((s) => !everyone.some((t) => Math.hypot(t.x - s.x, t.z - s.z) < TEAM_CLEAR)
        && !taken.some((c) => Math.hypot(c.baseX - s.x, c.baseZ - s.z) < 12));
      if (free <= 0 || !near.length) continue;    // no room just now: try again in a moment
      g.owed = false;
      g.next = this.clock + TEAM_AGAIN[0] + Math.random() * (TEAM_AGAIN[1] - TEAM_AGAIN[0]);
      this.gather(pick(near), g.kind, Math.min(free, 3 + Math.floor(Math.random() * 3)));
    }
  }

  // ---- host: the night out ---------------------------------------------------------------------

  private fightT = FIGHT_EVERY[0];
  /** Where each of tonight's crowd stands about, in twos and threes (scene x, z), made afresh each night. */
  private spots: { x: number; z: number }[] = [];

  /**
   * Once a second: on a Friday or Saturday night, with anyone near the top of Milsom Street, keep a
   * crowd of naughty boys and naughty girls there (all at once if nobody's close enough to see them
   * turn up, otherwise walking in one at a time up the streets round about), and every so often
   * have two of them kick off with each other. At the end of the night they go off home; with
   * nobody about any more, they just go.
   */
  private nightOut(everyone: Target[]) {
    const jx = NIGHT.x, jz = -NIGHT.y, near = (r: number) => everyone.some((t) => Math.hypot(t.x - jx, t.z - jz) < r);
    const crowd = this.list.filter((c) => c.crowd && c.state === ALIVE);
    const on = nightOut() && near(NIGHT_NEAR);
    if (!on) {
      for (const c of crowd) {
        // nobody about: gone; the night's over: off home the way they came, and gone once they're there
        const home = NIGHT_IN.reduce((b, p) => (Math.hypot(p[0] - c.x, -p[1] - c.z) < Math.hypot(b[0] - c.x, -b[1] - c.z) ? p : b));
        if (!near(NIGHT_NEAR + 60) || (c.leaving && Math.hypot(home[0] - c.x, -home[1] - c.z) < 4)) { c.keep = false; c.crowd = false; c.state = GONE; continue; }
        if (!c.leaving) { c.leaving = true; c.foe = -1; this.sendTo(c.i, c.gen, home[0], -home[1]); }
      }
      if (!crowd.length) this.spots = [];
      return;
    }
    // tonight's spots: little groups across the top of Milsom Street, clear of George Street's traffic
    if (!this.spots.length) {
      for (let k = 0; k < 6; k++) {
        const s = 8 + Math.random() * 26, t = (Math.random() - 0.5) * 12;
        const at = clearSpot(this.map, jx + NIGHT.ux * s + NIGHT.uy * t, jz - (NIGHT.uy * s - NIGHT.ux * t), 3);
        if (at) this.spots.push({ x: at[0], z: at[1] });
      }
      if (!this.spots.length) this.spots.push({ x: jx + NIGHT.ux * 15, z: jz - NIGHT.uy * 15 });
    }
    const staying = crowd.filter((c) => !c.leaving);
    const want = CROWD - staying.length;
    const free = this.list.filter((c) => c.state === GONE).length - 6;   // leave a few for the jobs
    if (want > 0 && free > 0) {
      // all at once, stood about already, if nobody's close enough to see; or one at a time, walking in
      // from wherever's out of everyone's way
      const all = !near(70), n = all ? Math.min(want, free) : 1;
      const from = NIGHT_IN.filter((p) => !everyone.some((t) => Math.hypot(t.x - p[0], t.z + p[1]) < 30));
      if (all || from.length) {
        for (let k = 0; k < n; k++) {
          const spot = this.spots[(staying.length + k) % this.spots.length];
          const hx = spot.x + (Math.random() - 0.5) * 2.4, hz = spot.z + (Math.random() - 0.5) * 2.4;
          const p = all ? null : pick(from), lk = look(Math.random() < 0.5 ? NAUGHTY : GIRL, 0);
          const [who] = this.bring(p ? p[0] : hx, p ? -p[1] : hz, lk + (lk >> 4 === GIRL ? Math.floor(Math.random() * KITS[GIRL]) : 0), 1, everyone, undefined, 0);
          if (!who) break;
          const c = this.list[who.i];
          c.crowd = true;
          this.sendTo(c.i, c.gen, hx, hz);
        }
      }
    }
    // now and then, two of them kick off, and sometimes a mate of one piles in on the other
    if ((this.fightT -= 1) > 0) return;
    this.fightT = FIGHT_EVERY[0] + Math.random() * (FIGHT_EVERY[1] - FIGHT_EVERY[0]);
    const idle = staying.filter((c) => !c.target && c.foe < 0 && !c.meek && c.calmT <= 0);
    const a = idle.length > 1 ? pick(idle) : null;
    const b = a && idle.filter((o) => o !== a && Math.hypot(o.x - a.x, o.z - a.z) < 12).sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z))[0];
    if (!a || !b) { this.fightT = 3; return; }
    a.foe = b.i; b.foe = a.i; a.fightT = b.fightT = 0;
    const mate = Math.random() < 0.35 ? idle.find((o) => o !== a && o !== b && Math.hypot(o.x - b.x, o.z - b.z) < 8) : undefined;
    if (mate) { mate.foe = a.i; mate.fightT = 0; }
  }

  /** Host: one of the crowd lands one on another, who has a go back if they weren't already. */
  private brawlHit(c: NaughtyBoy, o: NaughtyBoy) {
    if (o.foe < 0 && !o.target) { o.foe = c.i; o.fightT = 0; }
    this.damage(o.i, o.gen, c.team.hit, { x: c.x, z: c.z });
  }

  /** A gang turns up at a spot they like near a player, out of sight if possible. */
  private spawnGang(everyone: Target[], alive: Target[], room: number) {
    const anchor = pick(alive);
    const taken = this.list.filter((c) => c.state === ALIVE);
    // naughty boys, anywhere but the pitches (the teams have their own times: turnOut)
    const clear = (x: number, z: number) => !everyone.some((t) => Math.hypot(t.x - x, t.z - z) < 45)
      && !taken.some((c) => Math.hypot(c.baseX - x, c.baseZ - z) < 12);
    const spots = hauntsNear(this.map, anchor.x, anchor.z, 150).filter((h) => likes(h) > 0)
      .map((h) => ({ x: h.x, z: h.z, w: likes(h), big: h.foxhill || h.kind === "bus" }));
    const near = spots.filter((h) => {
      const d = Math.hypot(h.x - anchor.x, h.z - anchor.z);
      return d > 50 && d < 150 && clear(h.x, h.z);
    });
    let spot: { x: number; z: number; big: boolean } | null = null;
    const total = near.reduce((s, h) => s + h.w, 0);
    for (let tries = 0; tries < 8 && near.length; tries++) {
      let r = Math.random() * total;
      const h = near.find((o) => (r -= o.w) <= 0) ?? near[near.length - 1];
      spot = h;
      const g = this.map.ground(h.x, h.z), ax = anchor.x, ay = anchor.y + 1.6, az = anchor.z;
      const dx = h.x - ax, dy = g + 1.5 - ay, dz = h.z - az, l = Math.hypot(dx, dy, dz);
      const hit = this.map.raycast(ax, ay, az, dx / l, dy / l, dz / l, l);
      if (hit && hit.dist < l - 1) break;     // round a corner: perfect
    }
    if (!spot) return;     // no alley, bus stop or corner round here: no gang
    const size = Math.min(room, (spot.big ? 2 : 1) + Math.floor(Math.random() * 3));
    if (this.arrive(spot.x, spot.z, size)) return;
    this.gather(spot, NAUGHTY, size);
  }

  /** Host: a gang of naughty boys turns up at (x, z), out of the car that brought them. */
  gangAt(x: number, z: number, size: number) {
    const room = this.list.filter((c) => c.state === GONE).length;
    this.gather({ x, z }, NAUGHTY, Math.min(room, size));
  }

  private gather(spot: { x: number; z: number }, kind: number, size: number) {
    const gang = look(kind, Math.floor(Math.random() * KITS[kind]));
    for (let n = 0; n < size; n++) {
      const c = this.list.find((o) => o.state === GONE);
      if (!c) return;
      let x = spot.x + (Math.random() - 0.5) * 3, z = spot.z + (Math.random() - 0.5) * 3;
      if (this.map.blocked(x, z, RADIUS)) { x = spot.x + (Math.random() - 0.5) * 0.4; z = spot.z + (Math.random() - 0.5) * 0.4; }
      Object.assign(c, {
        state: ALIVE, gen: c.gen + 1 + Math.floor(Math.random() * 50), hp: TEAM[kind].hp, top: TEAM[kind].hp, target: "", look: gang,
        x, z, homeX: x, homeZ: z, baseX: spot.x, baseZ: spot.z, y: this.map.ground(x, z), yaw: Math.random() * Math.PI * 2, vx: 0, vz: 0, hop: 0, hopV: 0,
        deadT: 0, punchCD: 0, blindT: 0, chaseT: 0, calmT: 0, stuckT: 0, detourT: 0, wanderT: 0, keep: false, rush: false, armour: 0, spare: false, meek: false,
        crowd: false, leaving: false, foe: -1, fightT: 0,
      });
      c.fig.dress(gang);
    }
  }

  // ---- host: gangs that jobs and the Flag Lads bring -----------------------------------------

  /**
   * Host: n of them in look lk turn up round (x, z) and stay there till they're let go (release),
   * even with nobody about. hp: each one's health (their kind's own if not given). If every place is
   * taken, whoever's hanging about furthest from anyone makes way. face: which way they stand
   * (random if not given). Returns who they are.
   */
  bring(x: number, z: number, lk: number, n: number, targets: Target[], hp?: number, spread = 3, face?: number): { i: number; gen: number }[] {
    const out: { i: number; gen: number }[] = [];
    const away = (c: NaughtyBoy) => Math.min(...targets.map((t) => Math.hypot(t.x - c.x, t.z - c.z)), 1e9);
    for (let k = 0; k < n; k++) {
      let c = this.list.find((o) => o.state === GONE);
      if (!c) {
        const idle = this.list.filter((o) => o.state !== ALIVE || (!o.keep && !o.target)).sort((a, b) => (a.state !== ALIVE ? -1 : 0) - (b.state !== ALIVE ? -1 : 0) || away(b) - away(a));
        c = idle[0];
        if (!c) break;
      }
      const a = Math.random() * Math.PI * 2, r = k === 0 ? 0 : spread * (0.5 + Math.random() * 0.5);
      const at = clearSpot(this.map, x + Math.cos(a) * r, z + Math.sin(a) * r, 6) ?? [x, z];
      Object.assign(c, {
        state: ALIVE, gen: c.gen + 1 + Math.floor(Math.random() * 50), hp: hp ?? TEAM[lk >> 4]?.hp ?? 60, top: hp ?? TEAM[lk >> 4]?.hp ?? 60, target: "", look: lk,
        x: at[0], z: at[1], homeX: at[0], homeZ: at[1], baseX: at[0], baseZ: at[1], y: this.map.ground(at[0], at[1]), yaw: face ?? Math.random() * Math.PI * 2,
        vx: 0, vz: 0, hop: 0, hopV: 0, deadT: 0, punchCD: 0, blindT: 0, chaseT: 0, calmT: 0, stuckT: 0, detourT: 0, wanderT: 0, keep: true, rush: false, armour: 0,
        spare: false, meek: false, pace: 1, bolt: false, stay: false, crowd: false, leaving: false, foe: -1, fightT: 0,
      });
      c.fig.dress(lk);
      out.push({ i: c.i, gen: c.gen });
    }
    return out;
  }

  /** Host: where one of them is now and how he's doing, or null once he's dead or gone. */
  get(i: number, gen: number) {
    const c = this.list[i];
    return c && c.gen === gen && c.state === ALIVE ? { x: c.x, y: c.y, z: c.z, hp: c.hp, top: c.top, target: c.target, kind: c.kind, meek: c.meek } : null;
  }

  /** Host: on, he gives up (hands up, no more fighting) instead of going down when he's nearly done for. */
  spare(i: number, gen: number, on: boolean) {
    const c = this.list[i];
    if (c?.gen === gen && c.state === ALIVE) c.spare = on;
  }

  /** Everyone: how he holds his hands (0 as usual, 1 up, 2 behind his back), and what he says. */
  hands(i: number, gen: number, n: number, say = "") {
    const c = this.list[i];
    if (!c || c.gen !== gen) return;
    c.fig.hands = n;
    if (say && c.state === ALIVE) c.fig.say(say);
  }

  /** Host: send him to (x, z) to hang about there; rush: running, and ignoring everyone on the way. */
  sendTo(i: number, gen: number, x: number, z: number, rush = false) {
    const c = this.list[i];
    if (!c || c.gen !== gen || c.state !== ALIVE) return;
    c.homeX = c.baseX = x; c.homeZ = c.baseZ = z; c.rush = rush;
    if (rush) { c.target = ""; c.calmT = 4; }
  }

  /** Host: how much of each hit he shrugs off, 0 to 1 (the Gaffer under his gazebo). */
  setArmour(i: number, gen: number, a: number) {
    const c = this.list[i];
    if (c?.gen === gen) c.armour = Math.max(0, Math.min(0.9, a));
  }

  /** Host: on the run at this much of his kind's pace (and never turning to fight), or back to normal. */
  flee(i: number, gen: number, pace: number, on = true) {
    const c = this.list[i];
    if (c?.gen === gen) { c.pace = on ? pace : 1; c.bolt = on; if (on) { c.target = ""; c.foe = -1; c.keep = true; } }
  }

  /** Host: a ladder lad who stands his ground at his ladder instead of running from anyone close. */
  hold(i: number, gen: number, on = true) {
    const c = this.list[i];
    if (c?.gen === gen) c.stay = on;
  }

  /** Host: he's had enough: hands up, and he stays put. */
  surrender(i: number, gen: number) {
    const c = this.list[i];
    if (c?.gen !== gen || c.state !== ALIVE) return;
    c.meek = true; c.target = ""; c.rush = false; c.homeX = c.x; c.homeZ = c.z;
  }

  /** Host: how the Gaffer is travelling (MOUNTS): it rides on his look, so everyone sees it. */
  setMount(i: number, gen: number, m: number) {
    const c = this.list[i];
    if (c?.gen !== gen || c.kind !== CHAIR) return;
    c.look = Math.floor(c.look) + wearing(c.look) / 8 + (m & 3) / 1024;
    c.fig.dress(c.look);
  }

  /** Host: go for player id, wherever they are. */
  setOn(i: number, gen: number, id: string, x: number, z: number) {
    const c = this.list[i];
    if (c?.gen === gen) this.aggro(i, id, x, z);
  }

  /** Host: he can go home like any other once nobody's about. now: straight away. */
  release(i: number, gen: number, now = false) {
    const c = this.list[i];
    if (!c || c.gen !== gen) return;
    c.keep = false; c.rush = false;
    if (now && c.state === ALIVE) c.state = GONE;
  }

  /**
   * Host: a naughty boy was shot. Returns "kill" (he's had enough, and legs it), "dmg", or null if the
   * shot doesn't count (he's already had enough). from: where it came from, so he runs the other way;
   * with a: the heading of the car that hit him, and he's sent off square to it, on his side of it.
   */
  damage(i: number, gen: number, amount: number, from?: { x: number; z: number; a?: number }): "kill" | "dmg" | null {
    const c = this.list[i];
    if (!c || c.state !== ALIVE || c.gen !== gen) return null;
    c.hp = Math.max(0, c.hp - amount * (1 - c.armour));
    // a Wanted man nearly done for, with someone close enough to collar him, gives up
    if (c.spare && !c.meek && c.hp <= c.top * 0.2) {
      c.hp = Math.max(1, c.hp); c.meek = true; c.target = ""; c.rush = false; c.homeX = c.x; c.homeZ = c.z;
      return "dmg";
    }
    if (c.hp > 0) return "dmg";
    c.state = DEAD; c.deadT = 0; c.deadAnim = 0; c.target = ""; c.foe = -1; c.vx = c.vz = 0; c.detour = 0; c.hop = c.hopV = 0;
    let ux = Math.random() - 0.5, uz = Math.random() - 0.5;
    if (from && from.a !== undefined && Number.isFinite(from.a)) {
      ux = Math.sin(from.a); uz = Math.cos(from.a);           // square to the car's (cos a, -sin a)
      if ((c.x - from.x) * ux + (c.z - from.z) * uz < 0) { ux = -ux; uz = -uz; }
      c.vx = ux * THROWN; c.vz = uz * THROWN;
    } else if (from && Math.hypot(c.x - from.x, c.z - from.z) > 0.1) { ux = c.x - from.x; uz = c.z - from.z; }
    const l = Math.hypot(ux, uz) || 1;
    c.fleeX = ux / l; c.fleeZ = uz / l;
    return "kill";
  }

  /** Host: the naughty boy goes for whoever shot him. */
  aggro(i: number, id: string, x: number, z: number) {
    const c = this.list[i];
    if (c?.state !== ALIVE) return;
    if (c.target !== id) c.chaseT = 0;
    if (c.kind === LADDER || c.meek || c.bolt) return;
    c.rush = false; c.foe = -1;
    c.target = id; c.blindT = 0; c.calmT = 0; c.lastX = x; c.lastZ = z;
  }

  snapshot(): NaughtyBoyState {
    const q = (v: number) => Math.round(v * 100) / 100;
    const s: number[] = [];
    for (const c of this.list) s.push(c.state, c.gen, q(c.x), q(c.y), q(c.z), q(c.yaw), Math.round(c.hp), c.punches, c.look);
    return { s, t: this.list.map((c) => (c.state === ALIVE ? this.aim(c) : "")) };
  }

  /** Who he's after, as everyone else is told: a player's id, or "@" and the number of whichever of
   *  the others he's fighting (an older page just finds no player by that name). */
  private aim(c: NaughtyBoy) {
    return c.target || (c.foe >= 0 ? `@${c.foe}` : "");
  }

  // ---- everyone else: the host's updates ------------------------------------------------------

  apply(d: NaughtyBoyState) {
    if (!Array.isArray(d?.s) || d.s.length < STRIDE) return;
    const now = performance.now(), n = Math.floor(d.s.length / STRIDE);   // a host on an older page has fewer
    this.list.forEach((c, i) => {
      if (i >= n) { c.state = GONE; return; }
      const [state, gen, x, y, z, yaw, hp, punches, look] = d.s.slice(i * STRIDE, i * STRIDE + STRIDE);
      c.top = gen !== c.gen ? hp : Math.max(c.top, hp);
      if (gen !== c.gen) {
        c.snaps = []; c.seenPunches = punches; if (state === ALIVE) c.fig.dress(look);
        // if we become host he should loiter where he stands, not march to the map centre
        c.homeX = c.baseX = c.lastX = x; c.homeZ = c.baseZ = c.lastZ = z;
      } else if (state === ALIVE && look !== c.look) c.fig.dress(look);
      // a kill event can beat the update that says so
      if (!(c.state === DEAD && gen === c.gen && state === ALIVE)) {
        if (state === DEAD && c.state !== DEAD) { c.deadAnim = 0; c.fleeX = c.fleeZ = 0; }
        c.state = state;
      }
      Object.assign(c, { gen, x, y, z, yaw, hp, punches, look, target: String(d.t?.[i] ?? "") });
      if (state !== GONE) {
        c.snaps.push({ t: now, x, y, z, yaw });
        if (c.snaps.length > 20) c.snaps.shift();
      }
    });
  }

  /** Someone's kill event: down he goes (to get up and leg it), without waiting for the host's next update. */
  killed(i: number, gen: number) {
    const c = this.list[i];
    if (c && c.gen === gen && c.state === ALIVE) { c.state = DEAD; c.deadAnim = 0; c.fleeX = c.fleeZ = 0; }
  }

  // ---- everyone: drawing and hit tests -----------------------------------------------------

  update(dt: number, host: boolean) {
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
      c.speed += ((moved < 15 ? moved : 0) - c.speed) * Math.min(1, dt * 10);
      if (c.punches !== c.seenPunches) {
        if (c.punches > c.seenPunches && c.state === ALIVE) { c.punchAnim = 1; this.onSwing(c.dx, c.dy, c.dz, c.voice); }
        c.seenPunches = c.punches;
      }
      const after = c.state === ALIVE ? (host ? this.aim(c) : c.target) : "";
      // he shouts when he spots you, and keeps shouting all the way through the chase. The posh ones
      // say whole sentences, so they take turns and leave longer between them.
      const posh = c.kind !== NAUGHTY;
      if (after && posh && !c.seenTarget) c.shoutT = Math.random() * 1.5;
      if (after && (!c.seenTarget && !posh || (c.shoutT -= dt) <= 0)) {
        const said = posh ? line(c.kind) : "";
        if (said) c.fig.say(said);
        this.onShout(c.dx, c.dy, c.dz, c.voice, c.kind, said);
        c.shoutT = posh ? 3.5 + Math.random() * 4 : 1.8 + Math.random() * 2.5;
      }
      c.seenTarget = after;
      c.punchAnim = Math.max(0, c.punchAnim - dt / 0.3);
      const was = c.deadAnim;
      if (c.state === DEAD) c.deadAnim += dt;
      const fig = c.fig;
      if (c.state === ALIVE || (c.state === DEAD && c.deadAnim < OUT_SECS)) {
        fig.root.visible = true;
        const fleeing = c.state === DEAD && c.deadAnim > OFF_SECS, going = c.state === ALIVE || fleeing;
        // up on his feet: he shouts as he legs it, his voice gone high with fright
        if (c.state === DEAD && was <= OFF_SECS && fleeing) {
          const said = legIt(c.kind);
          fig.say(said);
          this.onShout(c.dx, c.dy, c.dz, c.voice, c.kind, said, true);
        }
        const down = fig.pose(c.dx, c.dy, c.dz, c.dyaw, going ? c.speed : 0, c.punchAnim, c.state === DEAD ? c.deadAnim + 0.001 : 0, dt);
        fig.fade(c.state === DEAD ? (OUT_SECS - c.deadAnim) / FADE_SECS : 1);
        // feet on the ground: no steps while hopping a wall, and a thud when he lands
        const air = c.dy - this.map.ground(c.dx, c.dz) > 0.15;
        if (going && ((down && !air && c.speed > 0.8) || (c.hopping && !air))) this.onStep(c.dx, c.dy, c.dz, c.speed);
        c.hopping = air;
      } else if (fig.root.visible) fig.hide();
    }
  }

  /**
   * The nearest naughty boy a ray from o along unit vector d hits within maxDist, as drawn: leaning
   * into his run and bobbing as he goes, so a shot at his head as he runs past hits his head.
   */
  hit(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): { i: number; gen: number; dist: number; head: boolean } | null {
    let best: { i: number; gen: number; dist: number; head: boolean } | null = null;
    this.list.forEach((c, i) => {
      if (c.state !== ALIVE) return;
      const h = hitPosed(o, d, c.fig.body, c.dx, c.dy, c.dz, sizeOf(c.look));
      if (h && h.dist < maxDist && (!best || h.dist < best.dist)) best = { i, gen: c.gen, ...h };
    });
    return best;
  }

  /** The spot on naughty boy i at p (where a shot hit him), wherever he runs or falls with it. */
  follow(i: number, p: THREE.Vector3): Follow | null {
    const c = this.list[i];
    return c ? follow(c.fig.body, p) : null;
  }

  /** Living naughty boys as drawn, for blood trails, the minimap and so on. */
  living() {
    return this.list.filter((c) => c.state === ALIVE).map((c) => ({ i: c.i, key: c.key, x: c.dx, y: c.dy, z: c.dz, target: c.target, kind: c.kind }));
  }

  /** The ones back on their feet and legging it, as drawn: they still leave painted footprints, and traffic still stops for them. */
  leggingIt() {
    return this.list.filter((c) => c.state === DEAD && c.deadAnim > OFF_SECS && c.deadAnim < OUT_SECS).map((c) => ({ key: c.key, x: c.dx, y: c.dy, z: c.dz }));
  }

  /** Where naughty boy i is drawn, and his blood id. */
  at(i: number) {
    const c = this.list[i];
    return c ? { key: c.key, gen: c.gen, x: c.dx, y: c.dy, z: c.dz, yaw: c.dyaw, voice: c.voice, kind: c.kind, kit: c.look & 7, boss: !!(c.look & BOSS), hp: c.hp, top: c.top, alive: c.state === ALIVE } : null;
  }
}
