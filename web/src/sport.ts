// Games on the pitches, in Combe Down and all over Bath. Now and then a ball turns up for you:
// - On a football pitch, on the penalty spot, or out on the edge of the box for a harder one:
//   put it in the net, under the bar and between the posts.
// - On a rugby pitch, on a kicking tee somewhere in front of the posts: sometimes an easy one,
//   sometimes a long one from out wide. Put it between the uprights and over the bar.
// - On a cricket field, at the bowler's end of the wicket: bowl it down the wicket and knock the
//   stumps over at the other end. Pitch it short and it bounces over them, too full and it's over
//   the bails, and one that bounces more than once doesn't count.
// Walk up to the ball to line up: A and D (or the stick) aim, W and S set the power, Space or a click
// kicks or bowls it and E walks off. Dots show the start of the ball's flight, as it would go on a
// still day; but each ball has its own wind, and you have to allow for it. Do it and a prize lands
// on the ground under the posts or behind the stumps (see Pickups.bonus).
//
// Penalties have a keeper. On your own it is the computer's: it guesses a side, sometimes reads you,
// and leans towards the side you last put one. A penalty is a set of three kicks; the dots (and the
// wind figure) are only there for the first, and after that you read the wind from the flag on the
// corner. Two goals from three is worth the prize.
//
// With friends the penalty becomes a shoot-out. Whoever lines up on a penalty with others near the
// goal calls for a keeper; anyone standing on the goal line presses E (touch: Use) and goes in goal.
// How it plays scales with the number of players (rules in shootout.ts):
// - 2: you take turns, one kicks and one keeps; five kicks each, then sudden death a pair at a time.
// - 3 or 4: two teams (alternate players in the order they joined) take turns to kick, the other
//   team's players rotating in goal; five a side, then sudden death.
// - 5 or more (up to 8): a queue. Everyone takes three kicks in turn and keeps goal for whoever is
//   next; most goals wins, and a tie is shared.
// Everyone near the pitch who is within reach of the goal when the keeper volunteers is in. A score
// card shows the goals and whose turn it is. Winners get the prize.
//
// Your ball is yours alone: nobody else sees it waiting, but everyone sees it fly when you kick or
// bowl it. Whether it went in is the kicker's call (like hits, see game.ts); the host places the prize.
// In a shoot-out the player who called for a keeper owns it ("so" carries its state: roster, goals,
// whose kick, the wind for it); the kicker reports each result to the owner ("sd" kind r), who moves
// it on. A keeper dives with A or D plus Space (on touch, two buttons). The dive is sent to the kicker
// as which side (across the pitch, so both agree) and how long after the kick the keeper saw it
// they pressed (-1 for a dive before it): the keeper's own reaction, whatever the lag. The kicker
// settles the save against the flight: a dive sweeps across the goal over under half a second, and
// the ball is stopped if the keeper's hands have got to where it crosses the line by then. A
// dive made after the ball is already past can't save it; a quick shot beats a late dive; a dive
// before the kick is a guess. When the ball reaches the line the kicker holds it there until the
// keeper's client says its copy of the ball has arrived too (so no dive is missed to lag), at
// most for a moment, and the keeper counts as not having dived if nothing comes.
import * as THREE from "three";
import { GameMap, POST_GAP, POST_HEIGHT, footballLayout, pitchId, rugbyLayout } from "./map";
import { Player } from "./player";
import { STUMPS } from "./pitches";
import * as Telemetry from "./telemetry";
import { AiKeeper, Bout, DIVE_REACH, DIVE_T, MAX_PLAYERS, QUEUE_KICKS, Vane, lineup, roles, stops, totalKicks, winners } from "./shootout";

/** Football ("f"), rugby ("r") or cricket ("c"), as in the map's pitch list. */
export type Sport = "f" | "r" | "c";
/** wind: the strongest it blows (m/s); push: how hard it shoves the ball along (per m/s of wind);
 *  preview: how much of the flight (up to where it first lands) the dots show. */
interface Rules { elevation: number; speed: [number, number]; turn: number; drag: number; rad: number; wind: number; push: number; preview: number }
const RULES: Record<Sport, Rules> = {
  // struck low and hard along the turf or just off it; turning is middling, as the goal is wide but kept low
  f: { elevation: 0.2, speed: [10, 30], turn: 0.35, drag: 0.006, rad: 0.11, wind: 4, push: 0.15, preview: 0.5 },
  // kicks go up at about 35 degrees; turning is quick, as the posts are wide
  r: { elevation: 0.6, speed: [11, 30], turn: 0.45, drag: 0.005, rad: 0.11, wind: 6, push: 0.25, preview: 0.55 },
  // tossed up from your hand, to pitch it on a length; turning is slow, as the stumps are narrow
  c: { elevation: 0.3, speed: [9, 21], turn: 0.15, drag: 0.002, rad: 0.05, wind: 4, push: 0.12, preview: 0.7 },
};
const DOTS = 40;                 // most dots in the preview

const G = 9.81;
const BAR = 3;                   // crossbar height
const UPRIGHT = 0.08;            // upright radius
const HALF = 0.17;               // half a rugby ball's length
const TEE = 0.07;                // how tall the tee stands
const TILT = -0.3;               // a ball on a tee leans back a little
const CREASE = 10.06;            // from the middle of the wicket to the stumps
const STUMP_H = 0.73, STUMP_W = 0.132;   // stumps and bails: height, and half the width
const HAND = [0.6, 0.3, 1.45];   // where you hold a cricket ball (and let it go): ahead, to the right, up
const WATCH = 0.5;               // seconds the dots stay up after it goes, to see it follow them
const REACH = 1.5;               // this close to the ball, you line up
const LEAVE = 2.6;               // after walking off, this far away before it'll have you again
const POWER = 0.7;               // how fast the power changes (per s)
const SETTLE = 0.3;              // seconds lined up before a click counts
const WAIT_LIFE = 120;           // seconds a ball waits for you
const FADE = 3;                  // seconds a ball lies about once it stops
const DOWN = 8;                  // seconds before knocked-over stumps are put back up
const HARD = 0.35;               // chance a rugby kick is a long one from out wide (or a football one from the edge of the box)
const NET = 1.5;                 // how far behind the goal line the back of a football net stops the ball
const GHOSTS = 6;                // other players' balls in the air at once
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** A pitch: s along it from the middle, t across. F: middle to the posts (or goal line); goal: a football goal's width and height. */
interface Frame { i: number; sport: Sport; cx: number; cy: number; ux: number; uy: number; L: number; W: number; F: number; ring: number[][]; goal?: { w: number; h: number; spot: number; box: number } }
interface Flight {
  sport: Sport; obj: THREE.Object3D; mark?: THREE.Object3D; pos: THREE.Vector3; vel: THREE.Vector3; pitch: Frame | null;
  spin: number; yaw: number; rest: number; scored: boolean; mine: boolean; target: number; hard: boolean;
  t: number; wind: THREE.Vector3; bounces: number; shot?: Shot;
  /** In the back of the net at this end (football). */
  net?: number;
  /** A penalty with a keeper: whose dive it is up against, the time since the kick that doesn't slow
   *  down for the replay, the moment it reached the line (held there for the keeper's report), and how it ended. */
  keep?: Keep; real: number; dots: boolean; tc?: number; verdict?: boolean; saved?: boolean; ended?: number; done?: boolean;
  /** Shoot-out kick number it's for, or -1 for a solo set. */
  bn: number;
  /** A copy of someone else's kick that we keep goal against: who to tell when it reaches the line. */
  tell?: string; told?: boolean;
}
/** The keeper a penalty is up against: side across the pitch (-1, 1; 0 none) and when they began (s after the kick; -1 before it). */
interface Keep { id: string | null; side: number; r: number; have: boolean }
/** Your ball in the air, for the cameras (broadcast.ts). Scene coordinates. */
export interface Shot {
  sport: Sport;
  pos: THREE.Vector3;
  /** Where it was kicked or bowled from, which way (flat, unit) and how fast (m/s). */
  from: THREE.Vector3; dir: THREE.Vector3; speed: number;
  /** The middle of the goal, the posts or the far stumps, on the ground, and the way along the pitch towards it (flat, unit). */
  goal: THREE.Vector3; along: THREE.Vector3;
  /** Seconds since it went, seconds it's been lying still (0 while it's moving), and whether it scored. */
  t: number; rest: number; scored: boolean; saved: boolean;
  /** The wind it went into, m/s. */
  wind: number;
}
/** A ball waiting for you: on the grass (football), on a tee (rugby) or at the bowler's end (cricket). */
interface Waiting {
  sport: Sport; obj: THREE.Object3D; mark: THREE.Object3D; x: number; y: number; z: number; age: number; target: number; hard: boolean; wind: THREE.Vector3;
  /** A penalty with a keeper; whether it's the first of its set (so it gets the dots); whether it's a shoot-out's. */
  pen: boolean; first: boolean; bout: boolean;
}
interface Knocked { key: string; t: number; parts: { m: THREE.Mesh; p0: THREE.Vector3; r0: THREE.Euler; v?: THREE.Vector3; tilt?: [number, number] }[] }
export interface KickInput { turn: number; power: number; kick: boolean; leave: boolean }
/** Someone else in the room, as game.ts knows them. */
export interface Mate { id: string; name: string; x: number; z: number; alive: boolean }
/** What the score card says: the score, who's up, and what you're doing (for the hint). */
export interface Card { score: string; turn: string; role: "kicker" | "keeper" | "wait" | "set" | "" }
const CALL_NEAR = 45;            // players this close to the goal are asked to keep it, and are in the shoot-out
const GOAL_USE = 4.5;            // this close to the middle of the goal line, E goes in goal
const BOUT_LIFE = 40;             // seconds a shoot-out kicker has to take the kick
const HOLD_MAX = 0.7;            // most seconds a ball waits at the line for the keeper's report
const EARLY = 2.5;               // seconds a dive before the kick still counts
const SET = 3;                   // kicks in a set on your own
const READ = 0.15;               // the computer's chance of reading where you're aiming
const BIAS = 0.55;               // and of going the way you last put one
const STAY = 0.1;                // and of not moving at all
export type Thud = "kick" | "bowl" | "bounce" | "post" | "stumps";

export class Sports {
  /** Lining up: you stand still and WASD steers the ball instead. */
  lining = false;
  /** How hard you'll kick or bowl it, 0..1. */
  power = 0.5;
  /** You kicked or bowled: tell everyone (scene position and velocity). */
  onKick?: (pos: THREE.Vector3, vel: THREE.Vector3, sport: Sport, wind: THREE.Vector3) => void;
  /** Yours went in the net, over the posts or hit the stumps: pitch number (pitchId), which end (-1 or 1), and whether it was a hard one. */
  onScore?: (pitch: number, end: number, hard: boolean) => void;
  onSound?: (what: Thud, x: number, y: number, z: number, vol: number) => void;
  onSay?: (text: string, secs: number) => void;
  /** Who you are, who else is in the room, and the network ("so" and "sd"; see the top). */
  who?: () => { id: string; name: string };
  players?: () => Mate[];
  send?: (type: "so" | "sd", data: unknown, to?: string) => void;
  /** The telly is on: the next ball in a set waits for it to finish. */
  tv = false;
  /** You're in the middle of a dive: you can't walk. */
  diving = false;
  /** The score card, null when there's no set or shoot-out to show. */
  card: Card | null = null;

  private framesOf = new WeakMap<GameMap, Frame[]>();
  private all: Frame[] = [];
  private seen = -1;
  private ball: Waiting | null = null;
  private flights: Flight[] = [];
  private knocked: Knocked[] = [];
  private aim = 0;
  private lineT = 0;
  private away = false;           // walked off: don't line up again until you've stepped back
  private wait = rand(4, 12);     // seconds on a pitch before the next ball turns up
  private bout: Bout | null = null;
  private set: { k: number; goals: number; pitch: number; end: number } | null = null;
  private nextIn = 0;             // seconds before the next ball in a set
  private spawned = -1;           // the shoot-out kick we have put a ball out for
  private call: { owner: string; pitch: number; end: number; at: number } | null = null;
  private callT = 0;
  private lastSide = 0;           // the side you last put one, across the pitch
  private early: { n: number; side: number; at: number } | null = null;
  private kickSeen = 0;           // when the kick we are keeping goal against reached us
  private dive0 = { n: -2, t: 0, side: 0, x: 0, z: 0, tx: 0, tz: 0 };
  private missing = 0;
  private raw = 0;                // this frame's seconds, however slowly the telly runs time
  private pair: [number, number] = [0, 0];
  private ai = new AiKeeper();
  private vane = new Vane();
  private clock = 0;
  private myId = "";
  private seenN = -2;
  private lastPos = new THREE.Vector3();
  private vaneFor: Waiting | null = null;
  private group = new THREE.Group();
  private geo: Record<Sport, THREE.BufferGeometry>;
  private mat: Record<Sport, THREE.Material>;
  private teeGeo = new THREE.CylinderGeometry(0.04, 0.09, TEE, 10).translate(0, TEE / 2, 0);
  private teeMat = new THREE.MeshLambertMaterial({ color: "#ff7a1a" });
  private ringGeo = new THREE.RingGeometry(0.25, 0.36, 24).rotateX(-Math.PI / 2);
  private ringMat = new THREE.MeshBasicMaterial({ color: "#ff5a4a", transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  private dots: THREE.InstancedMesh;
  private dotMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false });

  constructor(private map: GameMap, scene: THREE.Scene) {
    scene.add(this.group);
    this.geo = { f: new THREE.SphereGeometry(RULES.f.rad, 16, 12), r: new THREE.SphereGeometry(1, 20, 14).scale(RULES.r.rad, HALF, RULES.r.rad), c: new THREE.SphereGeometry(RULES.c.rad, 14, 10) };
    this.mat = { f: new THREE.MeshLambertMaterial({ map: football() }), r: new THREE.MeshLambertMaterial({ map: rugbyBall() }), c: new THREE.MeshLambertMaterial({ map: cricketBall(), emissive: "#2a0404" }) };
    // the aiming dots, along the start of the flight: their colour is the power
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 8, 6), this.dotMat, DOTS);
    this.dots.frustumCulled = false;
    this.dots.visible = false;
    this.dots.renderOrder = 2;
    this.group.add(this.dots, this.ai.root, this.vane.root);
  }

  /** Every pitch there is just now: Combe Down's, and those in each square of Bath loaded. */
  private get pitches(): Frame[] {
    if (this.seen === this.map.tilesVersion) return this.all;
    this.seen = this.map.tilesVersion;
    return (this.all = this.map.areas().flatMap((area) => {
      let out = this.framesOf.get(area);
      if (!out) this.framesOf.set(area, (out = (area.d.pi ?? []).map((p, k): Frame => {
        const i = pitchId(area, k);
        if (p[0] === "f") {
          const { L, W, goal, spot, box } = footballLayout(p);
          return { i, sport: "f", cx: p[1], cy: p[2], ux: Math.cos(p[5]), uy: Math.sin(p[5]), L, W, F: L / 2, ring: [], goal: { ...goal, spot, box: box[0] } };
        }
        if (p[0] === "r") {
          const { L, W, F } = rugbyLayout(p);
          return { i, sport: "r", cx: p[1], cy: p[2], ux: Math.cos(p[5]), uy: Math.sin(p[5]), L, W, F, ring: [] };
        }
        return { i, sport: "c", cx: p[1], cy: p[2], ux: Math.cos(p[3]), uy: Math.sin(p[3]), L: 0, W: 0, F: 0, ring: p[4] };
      })));
      return out;
    }));
  }

  // ---- pitch frames: s along the pitch (or wicket) from its middle, t across it ---------------
  private toPitch(f: Frame, x: number, z: number): [number, number] {
    const dx = x - f.cx, dy = -z - f.cy;
    return [dx * f.ux + dy * f.uy, -dx * f.uy + dy * f.ux];
  }

  private fromPitch(f: Frame, s: number, t: number): [number, number] {
    return [f.cx + f.ux * s - f.uy * t, -(f.cy + f.uy * s + f.ux * t)];
  }

  /** The pitch or cricket field at scene (x, z), if any. */
  private pitchAt(x: number, z: number, sport?: Sport): Frame | null {
    for (const f of this.pitches) {
      if (sport && f.sport !== sport) continue;
      if (f.sport !== "c") {
        const [s, t] = this.toPitch(f, x, z);
        if (Math.abs(s) < f.L / 2 + 2 && Math.abs(t) < f.W / 2 + 2) return f;
      } else if (inside(f.ring, x, -z)) return f;
    }
    return null;
  }

  /** Where the prize goes for a score at one end of a pitch (scene x, z): in the goalmouth, under the posts, or behind the stumps. */
  goalSpot(pitch: number, end: number): [number, number] | null {
    const f = this.pitches.find((p) => p.i === pitch);
    if (!f || (end !== 1 && end !== -1)) return null;
    if (f.sport === "f") return this.fromPitch(f, end * (f.F - 1.5), 0);
    return f.sport === "r" ? this.fromPitch(f, end * f.F, 0) : this.fromPitch(f, end * (CREASE + 3), 0);
  }

  /** The sport of the ball you're lined up on, or waiting for you. */
  get sport(): Sport | null { return this.ball?.sport ?? null; }

  /** Your ball in the air (or just come to rest), for the cameras. */
  get shot(): Shot | null {
    for (let i = this.flights.length - 1; i >= 0; i--) if (this.flights[i].mine && this.flights[i].shot) return this.flights[i].shot!;
    return null;
  }

  /** The wind on the ball you're lined up on (scene m/s, flat), for the HUD: only for a first kick, after which it's the flag. */
  get wind(): THREE.Vector3 | null { return this.lining && this.ball?.first ? this.ball.wind : null; }

  /** Lined up on a kick that has no dots or wind figure: the flag is the only guide. */
  get flagOnly(): boolean { return this.lining && !!this.ball && !this.ball.first; }

  /** Someone has asked for a keeper and you're on their goal line: E (or Use) goes in goal. */
  get goalCall(): boolean {
    const c = this.call;
    if (!c || this.bout || performance.now() - c.at > 6000) return false;
    const g = this.goalSpot(c.pitch, c.end), p = this.lastPos;
    return !!g && Math.hypot(p.x - g[0], p.z - g[1]) <= GOAL_USE;
  }

  /** It's your turn in goal in a shoot-out. */
  get keeping(): boolean {
    const b = this.bout;
    return !!b && !b.over && this.me() === b.roster[roles(b.roster.length, b.n, this.pair)[1]];
  }

  /** Where your ball is waiting, for the minimap. */
  get blip(): { x: number; z: number } | null {
    return this.ball && { x: this.ball.x, z: this.ball.z };
  }

  private makeBall(sport: Sport): THREE.Object3D {
    const m = new THREE.Mesh(this.geo[sport], this.mat[sport]);
    m.castShadow = true;
    this.group.add(m);
    return m;
  }

  // ---- your ball ------------------------------------------------------------------------------
  private spawn(f: Frame, p: THREE.Vector3): boolean {
    const [ps] = this.toPitch(f, p.x, p.z);
    const end = ps > 0.5 ? 1 : ps < -0.5 ? -1 : Math.random() < 0.5 ? 1 : -1;   // the end you're nearer
    if (f.sport === "c") {
      // at the bowler's end, just past the stumps, to bowl at the far ones
      const [x, z] = this.fromPitch(f, end * (CREASE + 1.6), rand(-0.6, 0.6));
      if (Math.hypot(x - p.x, z - p.z) < 3) return false;
      const y = this.map.ground(x, z);
      const mark = new THREE.Mesh(this.ringGeo, this.ringMat);
      mark.position.set(x, y + 0.04, z);
      this.group.add(mark);
      const obj = this.makeBall("c");
      obj.position.set(x, y + RULES.c.rad, z);
      this.ball = { sport: "c", obj, mark, x, y, z, age: 0, target: -end, hard: false, wind: this.blow("c"), pen: false, first: true, bout: false };
      this.onSay?.("A cricket ball! Bowl it at the far stumps for a prize", 3);
      return true;
    }
    if (f.sport === "f") {
      const g = f.goal!, hard = Math.random() < HARD;
      for (let k = 0; k < 10; k++) {
        // a penalty, or one from out on the edge of the box, somewhere across it
        const d = hard ? g.box + rand(0.5, 6) : g.spot, t = hard ? rand(-1, 1) * Math.min(f.W / 2 - 4, g.box * 0.9) : 0;
        const [x, z] = this.fromPitch(f, end * (f.F - d), t);
        if (this.map.blocked(x, z, 0.5) || Math.hypot(x - p.x, z - p.z) < 3) continue;
        this.putFootball(end, x, z, hard, this.blow("f"), !hard, true, false);
        if (!hard) this.startSet(f, end);
        this.onSay?.(hard ? "A football, out on the edge of the box. Bend one in for a better prize" : "A football on the penalty spot! Three kicks against the keeper: two goals wins a prize", 3);
        return true;
      }
      return false;
    }
    const hard = Math.random() < HARD;
    for (let k = 0; k < 10; k++) {
      // an easy one in front of the posts, or a long one from out towards touch
      const d = hard ? f.F * rand(0.65, 0.95) : Math.max(6, f.F * rand(0.2, 0.6));
      const wide = Math.max(0, f.W / 2 - 4);
      const t = hard ? (Math.random() < 0.5 ? -1 : 1) * wide * rand(0.55, 0.95) : rand(-1, 1) * wide * 0.5;
      const [x, z] = this.fromPitch(f, end * (f.F - d), t);
      if (this.map.blocked(x, z, 0.5) || Math.hypot(x - p.x, z - p.z) < 3) continue;
      const y = this.map.ground(x, z);
      const mark = new THREE.Mesh(this.teeGeo, this.teeMat);
      mark.position.set(x, y, z);
      mark.castShadow = true;
      this.group.add(mark);
      const obj = this.makeBall("r");
      obj.position.set(x, y + TEE + HALF * 0.95, z);
      // face the posts to start with
      const [gx, gz] = this.fromPitch(f, end * f.F, 0);
      obj.rotation.set(TILT, Math.atan2(-(gx - x), -(gz - z)), 0, "YXZ");
      this.ball = { sport: "r", obj, mark, x, y, z, age: 0, target: end, hard, wind: this.blow("r"), pen: false, first: true, bout: false };
      this.onSay?.(hard ? "A rugby ball, a long way out. Kick it over the posts for a better prize" : "A rugby ball! Kick it over the posts for a prize", 3);
      return true;
    }
    return false;
  }

  private putFootball(end: number, x: number, z: number, hard: boolean, wind: THREE.Vector3, pen: boolean, first: boolean, bout: boolean) {
    const y = this.map.ground(x, z);
    const mark = new THREE.Mesh(this.ringGeo, this.ringMat);
    mark.position.set(x, y + 0.04, z);
    this.group.add(mark);
    const obj = this.makeBall("f");
    obj.position.set(x, y + RULES.f.rad, z);
    this.ball = { sport: "f", obj, mark, x, y, z, age: 0, target: end, hard, wind, pen, first, bout };
  }

  private frameOf(pitch: number): Frame | null {
    for (const f of this.pitches) if (f.i === pitch) return f;
    return null;
  }

  private me(): string { return (this.myId ||= this.who?.().id ?? ""); }

  /** A new set of three on your own, with the computer in goal. */
  private startSet(f: Frame, end: number) {
    this.set = { k: 0, goals: 0, pitch: f.i, end };
    const [x, z] = this.fromPitch(f, end * f.F, 0);
    this.ai.place(x, this.map.ground(x, z), z, -f.uy, -f.ux);
    this.refreshCard();
  }

  private endSet(prize: boolean) {
    const s = this.set;
    this.set = null;
    this.ai.hide();
    this.card = null;
    if (!s) return;
    this.wait = s.goals >= 2 ? rand(40, 75) : rand(6, 14);
    if (!prize) return;
    this.onSay?.(`${s.goals} from ${SET}${s.goals >= 2 ? ": that's a prize" : ""}`, 3);
    if (s.goals >= 2) this.onScore?.(s.pitch, s.end, false);
  }

  /** The next ball in a set, or a shoot-out's kick: on the spot, with a new wind. */
  private penaltyBall(pitch: number, end: number, wind: THREE.Vector3, first: boolean, bout: boolean): boolean {
    const f = this.frameOf(pitch);
    if (!f?.goal) return false;
    const [x, z] = this.fromPitch(f, end * (f.F - f.goal.spot), 0);
    this.putFootball(end, x, z, false, wind, true, first, bout);
    return true;
  }

  /** A wind for a new ball: now and then still, otherwise anything up to a stiff breeze, from anywhere. */
  private blow(sport: Sport): THREE.Vector3 {
    const w = Math.random() < 0.15 ? 0 : RULES[sport].wind * rand(0.25, 1), a = rand(0, Math.PI * 2);
    return new THREE.Vector3(Math.cos(a) * w, 0, Math.sin(a) * w);
  }

  /** Where and how fast the ball goes, kicked or bowled now. */
  private launch(player: Player): { pos: THREE.Vector3; vel: THREE.Vector3; speed: number } {
    const b = this.ball!, R = RULES[b.sport];
    const speed = R.speed[0] + (R.speed[1] - R.speed[0]) * this.power, h = Math.cos(R.elevation) * speed;
    const fx = -Math.sin(this.aim), fz = -Math.cos(this.aim);
    const vel = new THREE.Vector3(fx * h, Math.sin(R.elevation) * speed, fz * h);
    // a kick goes from the tee or the grass; a ball's bowled from where it is in your hand
    const pos = b.sport === "r" ? new THREE.Vector3(b.x, b.y + TEE + HALF * 0.95, b.z) : b.sport === "f" ? new THREE.Vector3(b.x, b.y + R.rad, b.z) : this.hand(player);
    return { pos, vel, speed };
  }

  /** Where a cricket ball is in your hand, as you face the way you're aiming. */
  private hand(player: Player): THREE.Vector3 {
    const fx = -Math.sin(this.aim), fz = -Math.cos(this.aim), [a, r, u] = HAND, p = player.pos;
    return new THREE.Vector3(p.x + fx * a - fz * r, p.y + u, p.z + fz * a + fx * r);
  }

  /** The dots: the start of the flight as it would go with no wind, shrinking as they go. */
  private preview(player: Player) {
    const b = this.ball!, R = RULES[b.sport], { pos, vel } = this.launch(player);
    const pts: THREE.Vector3[] = [], h = 1 / 60;
    for (let k = 0; k < 480; k++) {
      vel.multiplyScalar(Math.max(0, 1 - R.drag * vel.length() * h));
      vel.y -= G * h;
      pos.addScaledVector(vel, h);
      if (k > 6 && pos.y < this.map.ground(pos.x, pos.z) + R.rad) break;
      if (k % 3 === 2) pts.push(pos.clone());
    }
    if (!pts.length) { this.dots.count = 0; return; }
    const n = Math.min(DOTS, pts.length, Math.max(2, Math.round(pts.length * R.preview))), m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const size = (b.sport === "r" ? 1 : 0.8) * (1 - 0.7 * i / n);
      this.dots.setMatrixAt(i, m.compose(pts[Math.min(i, pts.length - 1)], q, sc.setScalar(size)));
    }
    this.dots.count = n;
    this.dots.instanceMatrix.needsUpdate = true;
    this.dotMat.color.setHSL((1 - this.power) * 0.33, 0.9, 0.55);
  }

  private discard() {
    if (!this.ball) return;
    Telemetry.end("ball:" + this.ball.sport);
    this.group.remove(this.ball.obj, this.ball.mark);
    this.ball = null;
    this.lining = false;
  }

  private dropBall(nextIn: number) {
    const b = this.ball;
    if (!b) return;
    this.discard();
    if (b.bout && this.bout) this.result(this.bout.n, 3);
    else if (b.pen) this.endSet(false);
    this.wait = nextIn;
  }

  private kick(player: Player) {
    const b = this.ball!, { pos, vel, speed } = this.launch(player);
    const fx = -Math.sin(this.aim), fz = -Math.cos(this.aim);
    const pitch = this.pitchAt(b.x, b.z, b.sport), flight: Flight = {
      sport: b.sport, obj: b.obj, mark: b.mark, pos, vel, pitch,
      spin: b.sport === "r" ? TILT : 0, yaw: this.aim, rest: 0, scored: false, mine: true, target: b.target, hard: b.hard, t: 0, wind: b.wind, bounces: 0,
      real: 0, dots: b.first, bn: b.pen ? (b.bout && this.bout ? this.bout.n : -1) : -2,
    };
    if (b.pen && pitch) flight.keep = b.bout && this.bout ? this.theirKeeper(this.bout) : this.aiKeep(pitch, b, vel);
    if (pitch) {
      const [gx, gz] = this.fromPitch(pitch, b.target * (b.sport === "c" ? CREASE : pitch.F), 0);
      flight.shot = {
        sport: b.sport, pos, from: pos.clone(), dir: new THREE.Vector3(fx, 0, fz), speed,
        goal: new THREE.Vector3(gx, this.map.ground(gx, gz), gz), along: new THREE.Vector3(pitch.ux * b.target, 0, -pitch.uy * b.target),
        t: 0, rest: 0, scored: false, saved: false, wind: b.wind.length(),
      };
    }
    this.flights.push(flight);
    Telemetry.end("ball:" + b.sport);
    this.ball = null;
    this.lining = false;
    this.onSound?.(b.sport === "c" ? "bowl" : "kick", pos.x, pos.y, pos.z, 1);
    this.onKick?.(pos, vel, b.sport, b.wind);
  }

  /** Someone else kicked or bowled: [x, y, z, vx, vy, vz, rugby 0, cricket 1 or football 2, wind x, wind z]. */
  remoteKick(d: number[], from = "") {
    if (!Array.isArray(d) || d.length < 6 || !d.slice(0, 6).every(Number.isFinite)) return;
    const sport: Sport = d[6] === 1 ? "c" : d[6] === 2 ? "f" : "r";
    const wind = new THREE.Vector3(Number(d[7]) || 0, 0, Number(d[8]) || 0);
    if (wind.length() > 10) wind.setLength(10);
    const pos = new THREE.Vector3(d[0], d[1], d[2]), vel = new THREE.Vector3(d[3], d[4], d[5]);
    if (vel.length() > 40 || this.map.fieldEdge(pos.x, pos.z) < -50) return;
    while (this.flights.filter((f) => !f.mine).length >= GHOSTS) this.land(this.flights.find((f) => !f.mine)!);
    this.flights.push({
      sport, obj: this.makeBall(sport), pos, vel, pitch: this.pitchAt(pos.x, pos.z, sport),
      spin: 0, yaw: Math.atan2(-vel.x, -vel.z), rest: 0, scored: false, mine: false, target: 0, hard: false, t: 0, wind, bounces: 0,
      real: 0, dots: false, bn: -2,
    });
    const b = this.bout;
    if (b && sport === "f" && this.keeping && from === b.roster[roles(b.roster.length, b.n, this.pair)[0]]) {
      this.flights[this.flights.length - 1].tell = from;
      this.kickSeen = performance.now();
    }
    this.onSound?.(sport === "c" ? "bowl" : "kick", pos.x, pos.y, pos.z, 1);
  }

  private land(f: Flight) {
    this.group.remove(f.obj);
    if (f.mark) this.group.remove(f.mark);
    this.flights.splice(this.flights.indexOf(f), 1);
    // after a miss the next ball's not far off; after a score, there's a wait
    if (f.mine && f.bn === -2) this.wait = f.scored ? rand(40, 75) : rand(6, 14);
  }

  // ---- keepers and shoot-outs -----------------------------------------------------------------
  /** The computer's keeper makes up its mind as you kick: usually a guess, now and then it reads you. */
  private aiKeep(P: Frame, b: Waiting, vel: THREE.Vector3): Keep {
    const end = b.target, [ps, pt] = this.toPitch(P, b.x, b.z);
    const vs = vel.x * P.ux - vel.z * P.uy, vt = -vel.x * P.uy - vel.z * P.ux;
    const aimed = vs * end > 0.1 ? pt + vt * ((end * P.F - ps) / vs) : 0;
    let side: number;
    if (Math.random() < READ) side = aimed < 0 ? -1 : 1;
    else if (Math.random() < STAY) side = 0;
    else if (this.lastSide && Math.random() < BIAS) side = this.lastSide;
    else side = Math.random() < 0.5 ? -1 : 1;
    return { id: null, side, r: rand(0.25, 0.5), have: true };
  }

  /** The friend in goal: a dive they made before the kick counts if it was a moment ago. */
  private theirKeeper(b: Bout): Keep {
    const e = this.early, k: Keep = { id: b.roster[roles(b.roster.length, b.n, this.pair)[1]], side: 0, r: 0, have: false };
    if (e && e.n === b.n && performance.now() - e.at < EARLY * 1000) { k.side = e.side; k.r = -1; }
    this.early = null;
    return k;
  }

  /** The kick is over: on to the next one in the set or the shoot-out. out: 1 goal, 2 saved, 0 missed. */
  private finish(f: Flight) {
    f.done = true;
    const out = f.scored ? 1 : f.saved ? 2 : 0;
    if (f.bn >= 0) { this.result(f.bn, out); return; }
    const s = this.set;
    if (!s) return;
    s.goals += out === 1 ? 1 : 0;
    s.k++;
    if (s.k >= SET) this.endSet(true);
    else { this.nextIn = 0.6; this.refreshCard(); }
  }

  private result(n: number, out: number) {
    const b = this.bout;
    if (!b) return;
    if (b.roster[0] === this.me()) this.applyResult(n, out, this.me());
    else this.send?.("sd", ["r", n, out], b.roster[0]);
  }

  /** The owner moves the shoot-out on once the kicker says how it went (3: they walked off). */
  private applyResult(n: number, out: number, from: string) {
    const b = this.bout, N = b?.roster.length ?? 0;
    if (!b || b.over || n !== b.n || b.roster[0] !== this.me()) return;
    const [k] = roles(N, n, this.pair);
    if (b.roster[k] !== from) return;
    if (out === 3) { b.over = true; b.won = []; }
    else {
      if (out === 1) b.goals[k]++;
      const w = winners(N, b.goals, n + 1);
      if (w) { b.over = true; b.won = w; } else { b.n = n + 1; this.windFor(b); }
    }
    this.publish(b);
    if (b.over) this.concluded(b);
    this.refreshCard();
  }

  private windFor(b: Bout) {
    const w = this.blow("f");
    b.wx = Math.round(w.x * 100) / 100;
    b.wz = Math.round(w.z * 100) / 100;
  }

  private publish(b: Bout) {
    b.seen = performance.now();
    this.send?.("so", { i: b.id, p: b.pitch, e: b.end, r: b.roster, m: b.names, g: b.goals, n: b.n, w: [b.wx, b.wz], o: b.over ? 1 : 0, v: b.won });
  }

  private concluded(b: Bout) {
    const mine = b.won.includes(b.roster.indexOf(this.me()));
    const list = b.won.map((i) => b.names[i]).join(" and ");
    this.onSay?.(!b.won.length ? "Shoot-out over: someone walked off" : b.won.length === b.roster.length ? "All square: nobody beats anybody" : `${list} win${b.won.length === 1 ? "s" : ""} the shoot-out${mine ? ": a prize!" : ""}`, 4);
    if (mine) this.onScore?.(b.pitch, b.end, false);
  }

  private endBout() {
    this.bout = null;
    this.card = null;
    this.discard();
    this.wait = rand(30, 60);
  }

  /** Someone else's state of a shoot-out (or, with n -1, a call for a keeper), "so". */
  remoteState(d: any, from: string) {
    if (!d || typeof d !== "object" || !Array.isArray(d.r) || d.r[0] !== from || d.r.length < 1 || d.r.length > MAX_PLAYERS) return;
    if (!Number.isFinite(d.p) || (d.e !== 1 && d.e !== -1) || !Number.isFinite(d.n)) return;
    const me = this.me(), now = performance.now();
    if (d.n < 0) {
      if (this.bout || from === me) return;
      const fresh = !this.call || this.call.owner !== from;
      this.call = { owner: from, pitch: d.p, end: d.e, at: now };
      if (fresh && Array.isArray(d.m) && this.near(d.p, d.e)) this.onSay?.(`${String(d.m[0]).slice(0, 20)} wants a keeper: stand on the goal line and press E`, 4);
      return;
    }
    if (!d.r.includes(me) || from === me || !Array.isArray(d.g) || d.g.length !== d.r.length || !Array.isArray(d.m) || d.m.length !== d.r.length) return;
    if (!d.r.every((x: unknown) => typeof x === "string") || !d.g.every((x: unknown) => Number.isFinite(x))) return;
    let b = this.bout;
    const fresh = !b || b.id !== d.i || b.roster[0] !== from;
    if (fresh) {
      this.set = null;
      this.ai.hide();
      this.discard();
      this.seenN = -2;
      b = this.bout = { id: d.i, pitch: d.p, end: d.e, roster: d.r.slice(), names: d.m.map((x: unknown) => String(x).slice(0, 20)), goals: d.g.slice(), n: d.n, wx: 0, wz: 0, over: false, won: [], seen: now };
      this.call = null;
      this.onSay?.(`Shoot-out! ${b.names[0]} kicks first`, 3);
    } else if (d.n < b!.n) return;
    b = b!;
    b.n = d.n;
    b.goals = d.g.slice();
    b.wx = Math.max(-10, Math.min(10, Number(d.w?.[0]) || 0));
    b.wz = Math.max(-10, Math.min(10, Number(d.w?.[1]) || 0));
    b.seen = now;
    if (d.o === 1 && !b.over) {
      b.over = true;
      b.won = Array.isArray(d.v) ? d.v.filter((i: unknown) => Number.isInteger(i)) : [];
      this.concluded(b);
    }
    this.refreshCard();
  }

  /** A message about a penalty ("sd"): k keeper volunteers, d a dive, e the ball reached their end, r a result. */
  remoteMsg(d: any, from: string) {
    if (!Array.isArray(d)) return;
    const b = this.bout, me = this.me();
    if (d[0] === "k") {
      if (!this.ball?.pen || this.ball.bout || b || !this.set || d[1] !== this.set.pitch || d[2] !== this.set.end) return;
      this.startBout(from);
    } else if (d[0] === "d") {
      if (!b || d[1] !== b.n || !Number.isFinite(d[2]) || !Number.isFinite(d[3])) return;
      const side = d[2] < 0 ? -1 : 1, r = Math.max(-1, Math.min(2, d[3]));
      let hit = false;
      for (const f of this.flights) if (f.mine && f.keep?.id === from && f.bn === b.n && f.keep.side === 0) { f.keep.side = side; f.keep.r = r; hit = true; }
      if (!hit) this.early = { n: b.n, side, at: performance.now() };
    } else if (d[0] === "e") {
      for (const f of this.flights) if (f.mine && f.keep?.id === from) f.keep.have = true;
    } else if (d[0] === "r") {
      if (b && b.roster[0] === me && Number.isFinite(d[1]) && Number.isFinite(d[2])) this.applyResult(d[1], d[2], from);
    }
  }

  private near(pitch: number, end: number, x?: number, z?: number): boolean {
    const g = this.goalSpot(pitch, end);
    if (!g) return false;
    if (x === undefined || z === undefined) { const p = this.lastPos; x = p.x; z = p.z; }
    return Math.hypot(x - g[0], z - g[1]) < CALL_NEAR;
  }

  /** The keeper answers a call: build the shoot-out out of everyone near the goal. */
  private startBout(keeper: string) {
    const set = this.set, mates = this.players?.() ?? [];
    if (!set || !mates.some((p) => p.id === keeper && p.alive)) return;
    const others = mates.filter((p) => p.id !== keeper && p.alive && this.near(set.pitch, set.end, p.x, p.z)).map((p) => p.id).sort();
    const roster = lineup(this.me(), keeper, others), me = this.who?.();
    const b: Bout = {
      id: Math.floor(Math.random() * 1e9), pitch: set.pitch, end: set.end, roster, goals: roster.map(() => 0), n: 0, wx: 0, wz: 0, over: false, won: [], seen: 0,
      names: roster.map((id) => (id === me?.id ? me.name : mates.find((p) => p.id === id)?.name ?? "Player").slice(0, 20)),
    };
    this.windFor(b);
    this.discard();
    this.set = null;
    this.ai.hide();
    this.seenN = -2;
    this.bout = b;
    this.publish(b);
    this.refreshCard();
    this.onSay?.(`Shoot-out! ${roster.length === 2 ? "Five kicks each" : roster.length < 5 ? "Two teams, five kicks each" : "Everyone takes " + QUEUE_KICKS + " kicks"}. You kick first`, 4);
  }

  /** E on the goal line, when someone has asked for a keeper. */
  use(player: Player): boolean {
    const c = this.call;
    if (!c || this.bout || performance.now() - c.at > 6000) return false;
    if (!this.near(c.pitch, c.end, player.pos.x, player.pos.z)) return false;
    const g = this.goalSpot(c.pitch, c.end);
    if (!g || Math.hypot(player.pos.x - g[0], player.pos.z - g[1]) > GOAL_USE) return false;
    this.send?.("sd", ["k", c.pitch, c.end], c.owner);
    this.call = null;
    this.onSay?.("You're in goal. Hold A or D and press Space to dive when the kick comes", 4);
    return true;
  }

  /** Dive to the right (1) or left (-1) of where you are looking, from the goal line. */
  dive(dir: number, player: Player) {
    const b = this.bout;
    if (!dir || !b || !this.keeping || this.diving || this.dive0.n === b.n) return;
    const f = this.frameOf(b.pitch), g = this.goalSpot(b.pitch, b.end);
    if (!f || !g) return;
    if (Math.hypot(player.pos.x - g[0], player.pos.z - g[1]) > GOAL_USE + 1.5) { this.onSay?.("Get on the goal line to dive", 2); return; }
    const tx = -f.uy, tz = -f.ux, side = (Math.cos(player.yaw) * tx - Math.sin(player.yaw) * tz) * dir < 0 ? -1 : 1;
    const r = this.kickSeen ? Math.round(performance.now() - this.kickSeen) / 1000 : -1;
    this.dive0.n = b.n; this.dive0.t = 0; this.dive0.side = side; this.dive0.x = player.pos.x; this.dive0.z = player.pos.z; this.dive0.tx = tx; this.dive0.tz = tz;
    this.diving = true;
    this.send?.("sd", ["d", b.n, side, r], b.roster[roles(b.roster.length, b.n, this.pair)[0]]);
  }

  /** Each frame: the shoot-out's housekeeping, a kicker's ball going out, a keeper's dive, the computer's keeper and the corner flag. */
  private upkeep(dt: number, player: Player, canPlay: boolean, busy: boolean) {
    const now = performance.now(), b = this.bout, me = this.me();
    this.lastPos = player.pos;
    if (this.call && now - this.call.at > 6000) this.call = null;
    this.callT -= dt;
    if (b) {
      if (now - b.seen > (b.over ? 7000 : 20000)) { this.endBout(); return; }
      if (b.roster[0] === me && this.callT <= 0 && !b.over) {
        this.callT = 2;
        const mates = this.players?.() ?? [];
        let gone = false;
        for (const id of b.roster) if (id !== me && !mates.some((p) => p.id === id)) gone = true;
        this.missing = gone ? this.missing + 2 : 0;
        if (this.missing >= 6 && !b.over) { b.over = true; b.won = []; this.concluded(b); this.refreshCard(); }
        this.publish(b);
      }
      if (!b.over) {
        if (this.seenN !== b.n) { this.seenN = b.n; this.kickSeen = 0; }
        const kicker = b.roster[roles(b.roster.length, b.n, this.pair)[0]];
        if (kicker === me && !busy && !this.tv && canPlay && this.spawned !== b.n) {
          this.spawned = b.n;
          let mine = 0;
          for (let i = 0; i < b.n; i++) if (b.roster[roles(b.roster.length, i, this.pair)[0]] === me) mine++;
          if (this.penaltyBall(b.pitch, b.end, new THREE.Vector3(b.wx, 0, b.wz), mine === 0, true)) this.refreshCard();
          else this.result(b.n, 3);
        }
      }
    } else if (this.callT <= 0) {
      this.callT = 2;
      const s = this.set;
      if (s && this.ball?.pen && this.players) {
        const g = this.goalSpot(s.pitch, s.end);
        if (g && this.players().some((p) => p.alive && Math.hypot(p.x - g[0], p.z - g[1]) < CALL_NEAR)) {
          this.send?.("so", { p: s.pitch, e: s.end, r: [me], m: [this.who?.().name ?? ""], n: -1 });
        }
      }
    }
  }

  /** The computer's keeper in his dive, your own dive, and the flag that shows the wind. */
  private keeperView(dt: number, player: Player) {
    if (this.diving) {
      const d = this.dive0, e = Math.min(1, (d.t += dt) / DIVE_T);
      player.pos.x = d.x + d.tx * d.side * DIVE_REACH * e;
      player.pos.z = d.z + d.tz * d.side * DIVE_REACH * e;
      player.vel.x = player.vel.z = 0;
      if (d.t > 1.2) this.diving = false;
    }
    if (this.set && this.ai.root.visible) {
      let live: Flight | null = null;
      if (!this.ball) for (let i = this.flights.length - 1; i >= 0 && !live; i--) if (this.flights[i].mine && this.flights[i].keep) live = this.flights[i];
      if (live?.keep) this.ai.pose(live.keep.side, live.real - live.keep.r);
      else this.ai.pose(0, 0);
    }
    const b = this.ball && this.ball.pen && !this.ball.first ? this.ball : null;
    if (b !== this.vaneFor) {
      this.vaneFor = b;
      const f = b && this.pitchAt(b.x, b.z, "f");
      if (b && f) {
        const [x, z] = this.fromPitch(f, b.target * (f.F - 1), f.W / 2 - 1);
        this.vane.root.position.set(x, this.map.ground(x, z), z);
      }
      this.vane.root.visible = !!(b && f);
    }
    if (b) this.vane.blow(b.wind.x, b.wind.z, this.clock);
  }

  /** What the score card says, worked out when something changes. */
  private refreshCard() {
    const b = this.bout, s = this.set;
    if (b) {
      const N = b.roster.length, [k, kp] = roles(N, b.n, this.pair), me = this.me(), t = b.roster.indexOf(me);
      let score: string;
      if (N === 2) score = `${b.names[0]} ${b.goals[0]} – ${b.goals[1]} ${b.names[1]}`;
      else if (N <= 4) score = `Team 1 ${b.goals.reduce((a, g, i) => a + (i % 2 ? 0 : g), 0)} – ${b.goals.reduce((a, g, i) => a + (i % 2 ? g : 0), 0)} Team 2 (you're in Team ${(t % 2) + 1})`;
      else score = b.names.map((n, i) => `${n} ${b.goals[i]}`).join(" · ");
      const total = totalKicks(N), sd = N <= 4 && b.n >= total;
      const turn = b.over ? "Shoot-out over" : `${sd ? "Sudden death" : `Kick ${b.n + 1} of ${total}`} · ${b.names[k]} kicks, ${b.names[kp]} in goal`;
      this.card = { score, turn, role: b.over ? "wait" : b.roster[k] === me ? "kicker" : b.roster[kp] === me ? "keeper" : "wait" };
    } else if (s) {
      this.card = { score: `Penalties · ${s.goals} from ${s.k}`, turn: `Kick ${s.k + 1} of ${SET}`, role: "set" };
    } else this.card = null;
  }

  // ---- frame ----------------------------------------------------------------------------------
  /** canPlay: you're alive. input: what the keys or the stick are doing (zeros while paused). */
  update(dt: number, player: Player, canPlay: boolean, input: KickInput, raw = dt) {
    const p = player.pos;
    this.raw = raw;
    this.clock += raw;
    let busy = !!this.ball;
    for (const f of this.flights) if (f.mine && !f.done) busy = true;
    if (!busy && !this.set && !this.bout) {
      const f = canPlay ? this.pitchAt(p.x, p.z) : null;
      if (!f) this.wait = Math.max(this.wait, 3);   // coming onto a pitch, it's a moment before a ball turns up
      else if ((this.wait -= dt) <= 0 && !(Math.random() < 0.75 && this.spawn(f, p))) this.wait = rand(5, 15);
    }
    if (!busy && this.set && !this.tv && (this.nextIn -= raw) <= 0) {
      const s = this.set;
      if (!this.penaltyBall(s.pitch, s.end, this.blow("f"), false, false)) this.endSet(false);
      else this.refreshCard();
    }
    this.upkeep(raw, player, canPlay, busy);

    const b = this.ball;
    if (b) {
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (((b.age += dt) > (b.bout ? BOUT_LIFE : WAIT_LIFE) && !this.lining) || d > 160) this.dropBall(rand(10, 25));
      else if (!this.lining) {
        if (d > LEAVE) this.away = false;
        if (!this.away && canPlay && d < REACH && Math.abs(b.y - p.y) < 1.5) {
          this.lining = true;
          Telemetry.begin("ball:" + b.sport);
          this.lineT = 0;
          this.aim = player.yaw;
          this.power = 0.5;
          player.vel.x = player.vel.z = 0;
          player.pitch = Math.min(player.pitch, -0.35);   // look down at the ball, with the posts or stumps still in view
        }
      }
    }
    if (this.lining && (!this.ball || !canPlay)) {
      this.lining = false;
      if (this.ball?.sport === "c") this.ball.obj.position.set(this.ball.x, this.ball.y + RULES.c.rad, this.ball.z);   // dropped it
    }
    if (this.lining) {
      const ball = this.ball!;
      this.lineT += dt;
      // the ball and your view turn together, so what's in the middle of the screen is where it's going
      const turn = Math.max(-1, Math.min(1, input.turn)) * RULES[ball.sport].turn * dt;
      this.aim -= turn;
      player.yaw -= turn;
      this.power = Math.max(0, Math.min(1, this.power + Math.max(-1, Math.min(1, input.power)) * POWER * dt));
      if (ball.sport === "r") ball.obj.rotation.set(TILT, this.aim, 0, "YXZ");
      else if (ball.sport === "c") ball.obj.position.copy(this.hand(player));   // in your right hand
      if (input.leave) {
        this.lining = false;
        this.away = true;
        if (ball.sport === "c") ball.obj.position.set(ball.x, ball.y + RULES.c.rad, ball.z);
      } else if (input.kick && this.lineT > SETTLE) this.kick(player);
    }

    // the dots stay up for a moment after it goes, so you see it follow them
    let watching = this.lining && !!this.ball?.first;
    for (const f of this.flights) if (f.mine && f.dots && f.t < WATCH) watching = true;
    this.dots.visible = watching;
    if (this.lining && this.ball?.first) this.preview(player);

    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      this.fly(f, dt);
      if (f.mine && f.ended !== undefined && !f.done && f.real > f.ended + (f.scored || f.saved ? 1.5 : 0.3)) this.finish(f);
      if (f.rest > FADE) this.land(f);
    }
    this.fallen(dt);
    this.keeperView(raw, player);
  }

  private fly(f: Flight, dt: number) {
    f.t += dt;
    f.real += this.raw;
    const sh = f.shot;
    if (sh) { sh.t = f.t; sh.rest = f.rest; sh.scored = f.scored; sh.saved = !!f.saved; }
    // at the line, waiting for the keeper's side of it
    if (f.tc !== undefined && !f.verdict && f.keep && !f.keep.have && f.real - f.tc < HOLD_MAX) return;
    if (f.rest > 0) { f.rest += dt; return; }
    const v = f.vel, map = this.map, R = RULES[f.sport], rugby = f.sport === "r", foot = f.sport === "f";
    // walls, fences and trees: bounce off whatever's in the way this frame
    const sp = v.length();
    if (sp > 0.5) {
      const hit = map.raycast(f.pos.x, f.pos.y, f.pos.z, v.x / sp, v.y / sp, v.z / sp, sp * dt + R.rad);
      if (hit && hit.kind !== "ground") {
        const n = new THREE.Vector3(hit.nx, hit.ny, hit.nz);
        v.addScaledVector(n, -2 * v.dot(n)).multiplyScalar(0.45);
        this.onSound?.("bounce", f.pos.x, f.pos.y, f.pos.z, 0.5);
      }
    }
    const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
    for (let k = 0; k < n && f.rest === 0; k++) {
      const s = v.length();
      v.multiplyScalar(Math.max(0, 1 - R.drag * s * h));
      v.y -= G * h;
      // the wind takes it while it's in the air
      if (f.pos.y > map.ground(f.pos.x, f.pos.z) + R.rad + 0.05) v.addScaledVector(f.wind, R.push * h);
      const ox = f.pos.x, oy = f.pos.y, oz = f.pos.z;
      f.pos.addScaledVector(v, h);
      if (f.pitch && (rugby ? this.posts(f, ox, oy, oz) : foot ? this.goal(f, ox, oy, oz) : this.stumps(f, ox, oy, oz))) f.pos.set(ox, oy, oz);
      const g = map.ground(f.pos.x, f.pos.z) + R.rad;
      const air = f.pos.y > g + 0.02;
      if (!air) {
        f.pos.y = g;
        if (v.y < (rugby ? -2 : -1)) {
          // a rugby ball goes wherever it likes off the ground; a round ball holds its line, give or take
          v.y = -v.y * (rugby ? 0.45 : foot ? 0.6 : 0.55);
          f.bounces++;
          const a = rugby ? rand(-0.6, 0.6) : rand(-0.012, 0.012), c = Math.cos(a), si = Math.sin(a), vx = v.x, vz = v.z, keep = rugby ? 0.65 : foot ? 0.82 : 0.88;
          v.x = (vx * c - vz * si) * keep;
          v.z = (vx * si + vz * c) * keep;
          this.onSound?.("bounce", f.pos.x, f.pos.y, f.pos.z, Math.min(1, v.y / 6) * (rugby ? 1 : 0.5));
        } else {
          v.y = 0;
          // a football rolls on across the grass; the others soon stop
          v.x *= 1 - Math.min(1, (foot ? 0.6 : 2.5) * h);
          v.z *= 1 - Math.min(1, (foot ? 0.6 : 2.5) * h);
          if (Math.hypot(v.x, v.z) < 0.3) { v.set(0, 0, 0); f.rest = 1e-6; }
        }
      }
      // end over end in the air, rolling on the ground
      const hs = Math.hypot(v.x, v.z);
      if (hs > 0.5) f.yaw = Math.atan2(-v.x, -v.z);
      f.spin += h * (rugby ? (air ? 11 : hs * 4) : (air ? 25 : hs / R.rad));
    }
    if (f.rest > 0 && rugby) f.spin = Math.PI / 2;   // on its side once it stops
    f.obj.position.copy(f.pos);
    f.obj.rotation.set(f.spin, f.yaw, 0, "YXZ");
    if (f.bn !== -2 && f.mine && f.ended === undefined && (f.scored || f.saved || f.rest > 0.8 || f.real > 8)) f.ended = f.real;
  }

  /** Did a crossing of the line at s = line between (ox, oz) and now happen? Where, across and how high. */
  private crossing(f: Flight, ox: number, oy: number, oz: number, line: number) {
    const P = f.pitch!, [s0, t0] = this.toPitch(P, ox, oz), [s1, t1] = this.toPitch(P, f.pos.x, f.pos.z);
    if ((s0 - line) * (s1 - line) > 0 || s0 === s1) return null;
    const a = (line - s0) / (s1 - s0), x = ox + (f.pos.x - ox) * a, z = oz + (f.pos.z - oz) * a;
    return { t: t0 + (t1 - t0) * a, h: oy + (f.pos.y - oy) * a - this.map.ground(x, z), x, z, way: Math.sign(s1 - s0) };
  }

  /** Knock the ball back along the pitch, keeping some of its speed. */
  private rebound(f: Flight, keep: number) {
    const P = f.pitch!, v = f.vel, ux = P.ux, uz = -P.uy, vs = v.x * ux + v.z * uz;
    v.x -= (1 + keep) * vs * ux;
    v.z -= (1 + keep) * vs * uz;
  }

  /** The ball crossed a line of posts? Returns true if it hit them. */
  private posts(f: Flight, ox: number, oy: number, oz: number): boolean {
    const P = f.pitch!, rad = RULES.r.rad;
    for (const end of [-1, 1]) {
      const c = this.crossing(f, ox, oy, oz, end * P.F);
      if (!c) continue;
      if (Math.abs(Math.abs(c.t) - POST_GAP / 2) < UPRIGHT + rad && c.h < POST_HEIGHT) {
        this.rebound(f, 0.5);
        this.onSound?.("post", c.x, oy, c.z, 1);
        return true;
      }
      if (Math.abs(c.t) < POST_GAP / 2 && Math.abs(c.h - BAR) < UPRIGHT + rad) {
        f.vel.y = Math.abs(f.vel.y) * 0.4;
        this.rebound(f, 0.35);
        this.onSound?.("post", c.x, oy, c.z, 1);
        return true;
      }
      // between the posts and over the bar, going away from the field of play
      if (Math.abs(c.t) < POST_GAP / 2 && c.h > BAR && c.way === end && f.mine && !f.scored) {
        f.scored = true;
        this.onScore?.(P.i, end, f.hard);
      }
    }
    return false;
  }

  /** The ball crossed a goal line? Returns true if it hit the woodwork. In the net, it's a goal,
   *  and the net takes the pace off it. */
  private goal(f: Flight, ox: number, oy: number, oz: number): boolean {
    const P = f.pitch!, rad = RULES.f.rad, g = P.goal!;
    // in the net: it stops at the back of it and drops
    if (f.net && f.net * this.toPitch(P, f.pos.x, f.pos.z)[0] > P.F + NET) {
      f.vel.x = f.vel.z = 0;
      return true;
    }
    for (let end = -1; end <= 1; end += 2) {
      const c = this.crossing(f, ox, oy, oz, end * P.F);
      if (!c) continue;
      if (f.tell && !f.told && c.way === end) {
        f.told = true;
        this.send?.("sd", ["e", this.bout?.n ?? -1], f.tell);
      }
      if (f.mine && c.way === end && end === f.target) this.lastSide = Math.sign(c.t);
      if (Math.abs(Math.abs(c.t) - g.w / 2) < UPRIGHT + rad && c.h < g.h + UPRIGHT) {
        this.rebound(f, 0.6);
        this.onSound?.("post", c.x, oy, c.z, 1);
        return true;
      }
      if (Math.abs(c.t) < g.w / 2 && Math.abs(c.h - g.h) < UPRIGHT + rad) {
        f.vel.y = -Math.abs(f.vel.y) * 0.5;
        this.rebound(f, 0.5);
        this.onSound?.("post", c.x, oy, c.z, 1);
        return true;
      }
      if (Math.abs(c.t) < g.w / 2 - rad && c.h < g.h - rad && c.way === end) {
        const k = f.keep;
        if (k && !f.verdict) {
          f.tc ??= f.real;
          if (!k.have && f.real - f.tc < HOLD_MAX) return true;
          f.verdict = true;
          if (stops(k.side, k.r, f.tc, c.t, c.h)) {
            f.saved = true;
            f.vel.y = Math.abs(f.vel.y) * 0.3 + 1;
            this.rebound(f, 0.3);
            this.onSound?.("post", c.x, oy, c.z, 1);
            return true;
          }
        }
        f.vel.multiplyScalar(0.4);
        f.net = end;
        if (f.mine && !f.scored) {
          f.scored = true;
          if (f.bn === -2) this.onScore?.(P.i, end, f.hard);
        }
      }
    }
    return false;
  }

  /** The ball reached a set of stumps? Returns true if it hit them. */
  private stumps(f: Flight, ox: number, oy: number, oz: number): boolean {
    const P = f.pitch!, rad = RULES.c.rad;
    for (const end of [-1, 1]) {
      const c = this.crossing(f, ox, oy, oz, end * CREASE);
      if (!c || Math.abs(c.t) > STUMP_W + rad || c.h > STUMP_H + rad) continue;
      // one that's bounced more than once is dead: it just stops against them
      if (f.bounces > 1) { this.rebound(f, 0.1); return true; }
      this.knock(P.i, end, c.way);
      this.rebound(f, 0.25);
      f.vel.multiplyScalar(0.6);
      this.onSound?.("stumps", c.x, oy, c.z, 1);
      if (f.mine && !f.scored && end === f.target) {
        f.scored = true;
        this.onScore?.(P.i, end, false);
      }
      return true;
    }
    return false;
  }

  /** Send the stumps at one end of a wicket flying, the ball going the way way along it. */
  private knock(pitch: number, end: number, way: number) {
    const key = `${pitch}:${end}`, set = STUMPS.get(key), P = this.pitches.find((p) => p.i === pitch);
    if (!set || !P || this.knocked.some((k) => k.key === key)) return;
    // which way is "along the wicket, the way the ball went", in the scene
    const ax = P.ux * way, az = -P.uy * way;
    const parts: Knocked["parts"] = [];
    for (const m of set.stumps) {
      // leaning back, away from the bowler, and splayed a bit
      const lean = rand(0.35, 0.9), side = rand(-0.4, 0.4);
      parts.push({ m, p0: m.position.clone(), r0: m.rotation.clone(), tilt: [az * lean + ax * side, -ax * lean + az * side] });
    }
    for (const m of set.bails) {
      const v = new THREE.Vector3(ax * rand(2, 4) + rand(-1.5, 1.5), rand(3, 5), az * rand(2, 4) + rand(-1.5, 1.5));
      parts.push({ m, p0: m.position.clone(), r0: m.rotation.clone(), v });
    }
    this.knocked.push({ key, t: 0, parts });
  }

  /** Knocked-over stumps fall, the bails fly, and after a while they're all put back up. */
  private fallen(dt: number) {
    for (const k of [...this.knocked]) {
      k.t += dt;
      if (k.t > DOWN) {
        for (const p of k.parts) { p.m.position.copy(p.p0); p.m.rotation.copy(p.r0); }
        this.knocked.splice(this.knocked.indexOf(k), 1);
        continue;
      }
      const ease = Math.min(1, k.t / 0.18);
      for (const p of k.parts) {
        if (p.tilt) p.m.rotation.set(p.r0.x + p.tilt[0] * ease, p.r0.y, p.r0.z + p.tilt[1] * ease);
        if (!p.v) continue;
        // the bails: up, over and down on the grass, spinning
        const g = this.map.ground(p.m.position.x, p.m.position.z) - 0.7;   // their mesh sits 0.72 up from its origin
        if (p.m.position.y <= g && p.v.y < 0) { p.m.position.y = g; p.v.set(0, 0, 0); continue; }
        p.v.y -= G * dt;
        p.m.position.addScaledVector(p.v, dt);
        p.m.rotation.y += dt * 14;   // about its foot, which is on the ground: so only round and round
      }
    }
  }
}

/** Point in polygon, in data coordinates. */
function inside(ring: number[][], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** A white match ball with coloured bands round each end and a maker's panel. */
function rugbyBall(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4f1e8";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#c8202a";
  g.fillRect(0, 13, 64, 5); g.fillRect(0, 46, 64, 5);
  g.fillStyle = "#1d3f8f";
  g.fillRect(0, 19, 64, 2); g.fillRect(0, 43, 64, 2);
  g.fillRect(10, 27, 12, 10); g.fillRect(42, 27, 12, 10);
  // seams down the panels
  g.fillStyle = "rgba(0, 0, 0, 0.25)";
  for (const x of [0, 16, 32, 48]) g.fillRect(x, 0, 1, 64);
  return texture(c);
}

/** A red leather cricket ball with its stitched seam round the middle. */
function cricketBall(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 32; c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = "#9e1a16";
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = "#e8dcc0";
  g.fillRect(0, 14, 32, 1); g.fillRect(0, 17, 32, 1);
  g.fillStyle = "#c23a2c";
  g.fillRect(0, 15, 32, 2);
  return texture(c);
}

function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** A football: white, with black patches. */
function football(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4f4ee";
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = "#1b1b1d";
  for (const [x, y] of [[8, 8], [24, 22], [40, 8], [56, 22], [8, 28], [40, 28], [24, 4], [56, 4]]) {
    g.beginPath();
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; g.lineTo(x + Math.cos(a) * 4, y + Math.sin(a) * 3.2); }
    g.fill();
  }
  return texture(c);
}
