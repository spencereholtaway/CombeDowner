// First-person movement: mouse look, WASD, sprint, jump, climbing walls, crouch, lying on your
// front (Z, the streets only), gravity and collision. And riding (rides.ts): on a bike, a board,
// blades and the rest you roll along the way you're heading rather than walking, steering towards
// where you look (or with A and D), speeding up downhill, slowing uphill and bogging down on grass.
// Each ride's verb is on Space, its trick is Space again in the air, and Shift grinds a kerb or a
// low wall alongside or rides a manual; what you pull off goes out as events for the score
// (ridetricks.ts). While you grind, the way you hold the stick picks the grind (none, forward, back,
// left, right: rides.ts names them), Space pops you off it, Shift in the air catches the next one, and
// a long grind starts to tip, which a tap of the opposite direction puts right. And ladders (ladders.ts): walk into one and you're on it, climbing with W (or
// coming down, facing away from the wall), off at the top onto the roof, Space to let go.
// And wings (wings.ts): off the ground you glide, Space flaps, and looking down dives.
// Jumping is forgiving and exact: a press just before you land or just after you step off an edge
// still jumps, letting go of Space early makes a smaller hop, you come down a little quicker than you
// go up, and how high you get doesn't depend on the frame rate. Bumping into things slides you along
// them and never throws you back off.
// All of it is yours alone: other players just see you, and your ride, move.
import * as THREE from "three";
import type { RideSpec } from "./rides";
import type { GrindEdge } from "./map";

/** What the player walks on and bumps into: a map of Bath (map.ts) or a mine level (mines/level.ts). */
export interface Ground {
  ground(x: number, z: number): number;
  /** What feet at height y stand on at (x, z), where that isn't always the ground (a tunnel's floor). */
  floor?(x: number, z: number, y: number): number;
  collide(pos: { x: number; z: number }, y: number, r: number): unknown;
  /** Height above the feet of the tallest thing the last collide() pushed against (-1 if none). */
  readonly lastBlock: number;
  /** What there is to stand on for feet at y, if not just the ground (car roofs). */
  floor?(x: number, z: number, y: number): number;
  /** A low wall's top to grind along on a ride (map.ts), where there are any. */
  grindEdge?(x: number, z: number, y: number, r: number, up: number, down: number, dx: number, dz: number, minDot: number): GrindEdge | null;
}

/** What happened on a ride, for the score (ridetricks.ts), which takes them as they come. */
export type RideEvent =
  | { k: "air"; t: number; h: number; spin: number }   // down after t seconds up, h metres at the highest, having turned spin radians
  | { k: "land"; clean: boolean }                      // and lined up by yourself after a spin or a trick
  | { k: "trick"; name: string }                       // the ride's trick, done (or a perfect pogo bounce)
  | { k: "grind"; on: boolean; name: string; len: number; kerb: boolean; style: number }   // on to a kerb or wall, or off it after len metres
  | { k: "manual"; on: boolean; name: string; t: number }                   // on to the back wheels, or down after t seconds
  | { k: "bail" };                                     // off

/** A ladder stood against a wall (ladders.ts): (x, z) where it meets the wall's edge, (nx, nz) the way
 *  into the building, y0 its foot and y1 the roof you step off onto, and out how far its foot stands
 *  from the wall. Scene coordinates. */
export interface Rungs { x: number; z: number; nx: number; nz: number; y0: number; y1: number; out: number }
/** How far above the roof a ladder's top stands, to hold on to stepping off. */
export const LADDER_OVER = 0.9;

/** Where someone climbing ladder L stands at height y: on its rungs, out from the wall. Scene (x, z). */
export function onRungs(L: Rungs, y: number): [number, number] {
  const t = Math.max(0, Math.min(1, (y - L.y0) / (L.y1 + LADDER_OVER - L.y0 || 1)));
  const d = L.out + (0.08 - L.out) * t + 0.4;
  return [L.x - L.nx * d, L.z - L.nz * d];
}

/** A grind under way: along the wall from (ax, az), or along a kerb, the way (dx, dz). */
export interface Grind {
  kerb: boolean; ax: number; az: number; dx: number; dz: number; len: number; at: number; side: number; hi: number; dist: number;
  style: number;                       // which of the ride's five grinds (rides.ts), by the stick
  seg: number;                         // metres along when this style began
  want: number; wantT: number;         // the style the stick is asking for, and for how long
  t: number; bal: number; balV: number;   // seconds on it, and how far it's tipped, -1..1: past either end and you're off
}

const GRIND_NEW = () => ({ style: 0, seg: 0, want: 0, wantT: 0, t: 0, bal: (Math.random() - 0.5) * 0.3, balV: 0 });

export const EYE = 1.65;
export const CROUCH_EYE = 1.1;
/** Eye height lying on your front, propped up on your elbows. */
export const PRONE_EYE = 0.5;
const RADIUS = 0.35;
const GRAVITY = 22;
const JUMP = 7.2;
const FALL = 1.35;        // gravity's pull on the way down, over the way up: a jump that doesn't hang
const JUMP_CUT = 5;       // let go of jump on the way up and you rise no faster than this, m/s
const COYOTE = 0.1;       // seconds after stepping off an edge you can still jump
const JUMP_BUFFER = 0.1;  // seconds a press of jump waits for you to land
const AIR_CONTROL = 4;
const KICK_SETTLE = 0.3;                   // how fast your aim comes back down after firing, rad/s
const MANTLE = 2.6;       // a wall or a low roof up to this far above your feet can be climbed
const WALK = 4.6, SPRINT = 7.4, CROUCH = 2.2, CRAWL = 0.9;
const TUMBLE = 1.4;       // seconds of coming off a ride before you're back on it
const TRICK_TIME = 0.32;  // seconds a ride's air trick takes: land well before it's round and you're off
const KERB = 0.08;        // a step in the street's surface at least this high is a kerb to grind
const KERB_IN = 0.12;     // and you ride it this far in on the higher side
const CLIMB = 2.6;        // metres a second up or down a ladder
const FLY = 12;           // metres a second flying, with wings on
const CEILING = 120;      // and flaps lose their lift towards this high off the ground

export class Player {
  pos = new THREE.Vector3();      // feet
  vel = new THREE.Vector3();
  yaw = 0; pitch = 0;
  onGround = false;
  crouch = 0;                     // 0 standing .. 1 crouched, eased
  sensitivity = 0.0022;
  /** Multiplies walking speed (the mines' boots, or crawling when you're down). */
  speedMul = 1;
  /** A race's lift to every ride's top speed, push and downhill limit (1 outside one), and a one-off shove to the speed. */
  rideMul = 1; rideKick = 0;
  /** How well your feet hold: 1 normally, much less on ice (the mines). */
  grip = 1;
  keys = new Set<string>();
  /** On-screen joystick, -1..1 each way (y down = backwards). */
  joy = { x: 0, y: 0 };
  /** Crouch toggled by the on-screen button. */
  crouchLatch = false;
  /** Lying on your front (Z, or the crouch button again): 0 up .. 1 flat out, eased. */
  prone = 0;
  proneLatch = false;
  /** Whether Z lies you down here (the streets, where other players see it). */
  canProne = false;
  bob = 0;
  landKick = 0;
  speed = 0;
  /** Set for a frame when you leave the ground on purpose (a jump or a vault). */
  jumped = false;
  /** In the air only because you walked into a low wall and hopped it, not a jump: your aim stays steady. */
  vaulting = false;
  /** Set for a frame when you land: how fast you were falling, in m/s. */
  landed = 0;
  /** What you're riding (rides.ts), if anything, which way it's pointing and how fast it's going (m/s, - backwards). */
  ride: RideSpec | null = null;
  heading = 0;
  rideV = 0;
  /** Set for a frame when you come off a ride: how fast you were going, and whether it was into something. */
  crashed = 0;
  crashWall = false;
  /** Whether the ground at (x, z) is hard (road, pavement) rather than grass, for riding. */
  paved: (x: number, z: number) => boolean = () => true;
  /** How far the drawn street stands above the ground at (x, z): a kerb is where that steps. */
  lift: (x: number, z: number) => number = () => 0;
  /** The on-screen jump and trick buttons, held down (Space and Shift for touch controls). */
  jumpHeld = false;
  trickHeld = false;
  /** Touch controls: every landing straightens itself and a manual can't throw you. */
  assist = false;
  /** What's happened on your ride since ridetricks.ts last looked. */
  events: RideEvent[] = [];
  /** Seconds left of coming off your ride (0: you're on it). */
  tumble = 0;
  /** The kerb or wall you're grinding, if you are. */
  grind: Grind | null = null;
  /** Eased lean of the view into a grind, for the camera. */
  grindLean = 0;
  /** The name of the grind you're on. */
  get grindName() { return this.grind && this.ride ? this.ride.grinds[this.grind.style] ?? this.ride.grind : ""; }
  /** Seconds into a manual (0: not on one), and its balance, -1..1: past either end and you're off. */
  manual = 0;
  balance = 0;
  /** A BMX's crouch before a bunny hop (0..1), tucked down on a bike or holding on to a trolley, a ride's trick (0, or 0..1 of the way round). */
  charge = 0;
  verbOn = false;
  trick = 0;
  /** Up in the air on purpose (a jump, a hop, a big bounce, off a grind), not just over a bump. */
  airBig = false;
  /** Set for a frame when a scooter kicks. */
  kicked = false;
  /** How steep the ground is the way you're riding (+ uphill), as a rise over the distance. */
  grade = 0;
  private wobble = 0;
  private wantJump = false;
  private jumpBuf = 0; private coyote = 0;
  /** Rising from a jump with the button still down: letting go now cuts it short. */
  private jumpRise = false;
  /** How far the camera still lags below your eyes after stepping up onto something, eased away. */
  private stepUp = 0;
  private prevHeld = false; private prevShift = false;
  /** Off a grind with Space, you only catch another with Shift; off the end of one, a moment before any. */
  private autoGrab = true; private noGrab = 0; private grabBuf = 0; private prevGSide = 0;
  private kickT = 0; private bounceT = 0;
  private air = 0; private airH = 0; private airSpin = 0; private balV = 0;
  private tumbleSide = 1; private tumbleHard = false;
  /** The ladder you're on, if you are, and the ones near enough to get on (ladders.ts sets them). */
  ladder: Rungs | null = null;
  ladders: Rungs[] = [];
  /** Set for a frame when you get off a ladder: at the "top" onto the roof, at the "foot", or letting "go". */
  offLadder = "";
  /** Wearing angel's wings (wings.ts): off the ground you glide, Space flaps, and looking down dives. */
  wings = false;
  /** Set for a frame when you flap your wings. */
  flapped = false;
  /** Whether flapping still lifts you (the wings' flight runs out: wings.ts); gliding goes on regardless. */
  wingLift = true;
  /** How far the ride's verb crouches you down, eased. */
  private dip = 0;

  constructor(private map: Ground, signal?: AbortSignal) {
    addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (e.code === "Space") this.wantJump = true;
      if (e.code === "KeyZ" && !e.repeat && this.canProne) this.proneLatch = !this.proneLatch;
    }, { signal });
    addEventListener("keyup", (e) => this.keys.delete(e.code), { signal });
    addEventListener("blur", () => this.keys.clear(), { signal });
  }

  look(dx: number, dy: number, zoom: number) {
    const s = this.sensitivity * zoom;
    this.yaw -= dx * s;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * s));
    // pulling your aim down makes up for the kick yourself (pulling ahead of it during a burst
    // counts against the kicks still to come)
    if (dy > 0) this.kickUp -= dy * s;
  }

  /** How far your shots' kick has lifted your aim, still to settle back down. */
  private kickUp = 0;
  /** A shot's kick: your aim jumps up by a, and settles back down once you stop firing (settle). */
  kick(a: number) {
    const was = this.pitch;
    this.pitch = Math.min(1.5, this.pitch + a);
    this.kickUp += this.pitch - was;
  }
  /** Not firing: your aim comes back down from the kick, to where you had it. */
  settle(dt: number) {
    if (this.kickUp <= 0) { this.kickUp = 0; return; }   // you've made up for it already
    const b = Math.min(this.kickUp, dt * KICK_SETTLE);
    this.pitch -= b; this.kickUp -= b;
  }

  get eyeHeight() { return EYE + (CROUCH_EYE - EYE) * this.crouch + (PRONE_EYE - EYE) * this.prone + (this.ride ? this.ride.lift - this.dip : 0); }
  get sprinting() {
    if (this.ride) return false;
    const stick = this.joy.y < -0.95;   // joystick pushed all the way forward
    return (stick || (this.keys.has("ShiftLeft") && this.keys.has("KeyW"))) && this.crouch < 0.5 && this.prone < 0.5 && this.onGround;
  }

  jump() { this.wantJump = true; }

  /** The ground under the feet, or a tunnel's floor when they're in one. */
  private under(x: number, z: number) { return this.map.floor ? this.map.floor(x, z, this.pos.y) : this.map.ground(x, z); }

  spawn(x: number, z: number, yaw = Math.random() * Math.PI * 2) {
    this.pos.set(x, this.map.ground(x, z), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0; this.kickUp = 0;
    this.stepUp = 0; this.jumpBuf = 0; this.coyote = 0; this.jumpRise = false;
    this.proneLatch = false; this.prone = 0;
    this.ladder = null;
    this.wings = false;
  }

  update(dt: number, active: boolean) {
    const k = this.keys;
    this.jumped = false;
    this.landed = 0;
    this.crashed = 0;
    this.offLadder = "";
    this.flapped = false;
    this.stepUp *= Math.exp(-dt * 14);
    if (this.ride) { this.ladder = null; this.rideUpdate(dt, active); return; }
    if (this.ladder) { this.climb(dt, active); return; }
    let fx = 0, fz = 0;
    if (active) {
      if (k.has("KeyW") || k.has("ArrowUp")) fz -= 1;
      if (k.has("KeyS") || k.has("ArrowDown")) fz += 1;
      if (k.has("KeyA") || k.has("ArrowLeft")) fx -= 1;
      if (k.has("KeyD") || k.has("ArrowRight")) fx += 1;
      if (!fx && !fz && Math.hypot(this.joy.x, this.joy.y) > 0.15) { fx = this.joy.x; fz = this.joy.y; }
    }
    if (!this.canProne) this.proneLatch = false;
    // jumping gets you up off your front
    if (this.proneLatch && this.wantJump) { this.proneLatch = false; this.wantJump = false; }
    this.jumpBuf = this.wantJump ? JUMP_BUFFER : this.jumpBuf - dt;
    const held = active && (k.has("Space") || this.jumpHeld);
    const lying = active && this.proneLatch && this.onGround;
    const crouching = !lying && active && (k.has("KeyC") || this.crouchLatch);   // not Ctrl: Ctrl+W would close the tab
    this.crouch += ((crouching ? 1 : 0) - this.crouch) * Math.min(1, dt * 12);
    this.prone += ((lying ? 1 : 0) - this.prone) * Math.min(1, dt * 5);
    const len = Math.hypot(fx, fz);
    const flying = this.wings && !this.onGround;
    const speed = flying ? FLY * Math.min(1, len) : (lying ? CRAWL : crouching ? CROUCH : this.sprinting ? SPRINT : WALK) * Math.min(1, len) * this.speedMul;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = 0, wz = 0;
    if (len > 0) {
      fx /= len; fz /= len;   // speed already carries how far the joystick is pushed
      wx = (fx * cos + fz * sin) * speed;
      wz = (-fx * sin + fz * cos) * speed;
    }
    // steep ground slows you down when climbing
    if (len > 0 && !flying) {
      const ahead = this.under(this.pos.x + wx * 0.15, this.pos.z + wz * 0.15) - this.under(this.pos.x, this.pos.z);
      const grade = ahead / (speed * 0.15);
      if (grade > 0.35) { const f = Math.max(0.35, 1 - (grade - 0.35) * 1.2); wx *= f; wz *= f; }
    }
    // walking into the foot of a ladder, or off a roof's edge over the top of one, gets you on it
    if (len > 0 && active && this.crouch < 0.5 && this.prone < 0.1 && this.grab(wx, wz)) return;
    const accel = this.onGround ? 14 * this.grip : flying ? 3 : AIR_CONTROL;
    const ease = 1 - Math.exp(-accel * dt);
    this.vel.x += (wx - this.vel.x) * ease;
    this.vel.z += (wz - this.vel.z) * ease;

    const jumpAsked = this.jumpBuf > 0;
    if (this.wantJump && flying && this.wingLift && active) {
      // a flap of the wings: up you go, a bit more each flap, but less and less the higher you are
      const high = this.pos.y - this.map.ground(this.pos.x, this.pos.z);
      this.vel.y = Math.min(8, Math.max(this.vel.y, 0) + 5.5 * Math.max(0.15, Math.min(1, (CEILING - high) / 40)));
      this.flapped = true;
      this.wantJump = false;
      this.jumpBuf = 0;
    }
    if (this.jumpBuf > 0 && (this.onGround || this.coyote > 0) && active && this.crouch < 0.5 && this.prone < 0.5) {
      this.vel.y = JUMP;
      this.onGround = false;
      this.jumped = true;
      this.vaulting = false;
      this.jumpBuf = 0; this.coyote = 0;
      // a press already let go of (buffered before landing) gets the full jump
      this.jumpRise = held;
    }
    this.wantJump = false;
    if (this.jumpRise && (this.vel.y <= 0 || !held)) {
      this.vel.y = Math.min(this.vel.y, JUMP_CUT);
      this.jumpRise = false;
    }

    const p = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.z * dt };
    this.map.collide(p, this.pos.y, RADIUS);
    const hit = this.slideTo(p, dt);
    // only walking at something head on climbs it: brushing past a fence or a car doesn't
    const into = hit && len > 0 ? -(hit.nx * wx + hit.nz * wz) / Math.max(1e-6, Math.hypot(wx, wz)) > 0.5 : false;
    // Auto-vault: walking into a wall, fence or hedge you could jump hops you over it, just clearing it.
    const blocked = this.map.lastBlock;
    if (into && blocked > 0 && blocked < 1.45 && this.onGround && active && this.crouch < 0.5 && this.prone < 0.1) {
      this.vel.y = Math.max(this.vel.y, Math.sqrt(2 * GRAVITY * (blocked + 0.3)));
      this.onGround = false;
      this.jumped = true;
      this.vaulting = true;
      this.jumpRise = false; this.coyote = 0;
    } else if (into && blocked >= 1.45 && active && this.crouch < 0.5 && this.prone < 0.1
      && ((jumpAsked && blocked <= MANTLE) || (!this.onGround && this.vel.y > -3 && blocked <= 1.7))) {
      // Climbing: jump at a wall too high to vault (or one you've jumped up to) and you pull
      // yourself up onto its top, then carry on over it.
      this.vel.y = Math.max(this.vel.y, Math.sqrt(2 * GRAVITY * (blocked + 0.3)));
      this.onGround = false;
      this.jumped = true;
      this.vaulting = false;
      this.jumpRise = false; this.coyote = 0; this.jumpBuf = 0;
    }

    const y0 = this.pos.y;
    if (flying) {
      // gliding: falling slowly, unless you look down and dive
      this.vel.y -= GRAVITY * 0.35 * dt;
      this.vel.y = Math.max(this.vel.y, this.pitch < -0.35 ? -14 : -3.5);
      this.pos.y += this.vel.y * dt;
    } else this.fall(dt, FALL);
    this.land(y0);
    if (this.onGround) { this.vaulting = false; this.coyote = COYOTE; }
    else this.coyote -= dt;
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround) this.bob += this.speed * dt * 1.9;
    this.landKick *= Math.max(0, 1 - dt * 8);
  }

  /** Where collision left you (p) after moving dt: the part of your speed into whatever you hit
   *  goes and the rest slides along it, but being pushed out of something never throws you off it
   *  (a car nudging you, or a wall that only counts once your feet drop below its top).
   *  Returns the way you were pushed, if you were. */
  private slideTo(p: { x: number; z: number }, dt: number): { nx: number; nz: number } | null {
    const cx = p.x - (this.pos.x + this.vel.x * dt), cz = p.z - (this.pos.z + this.vel.z * dt), c = Math.hypot(cx, cz);
    this.pos.x = p.x; this.pos.z = p.z;
    if (c < 1e-5) return null;
    const nx = cx / c, nz = cz / c, into = this.vel.x * nx + this.vel.z * nz;
    if (into < 0) { this.vel.x -= nx * into; this.vel.z -= nz * into; }
    return { nx, nz };
  }

  /** Stepped up by h in one go: the camera follows over a moment rather than jumping. */
  private raise(h: number) { if (h > 0) this.stepUp = Math.min(0.6, this.stepUp + h); }

  /** Up or down under gravity for dt, worked out exactly so a jump's height doesn't depend on the
   *  frame rate, with gravity fallMul times as strong once you're coming down. */
  private fall(dt: number, fallMul: number) {
    let v = this.vel.y, y = 0, t = dt;
    if (v > 0) {
      const up = Math.min(t, v / GRAVITY);
      y += v * up - 0.5 * GRAVITY * up * up; v -= GRAVITY * up; t -= up;
    }
    if (t > 0) {
      const g = GRAVITY * fallMul;
      y += v * t - 0.5 * g * t * t; v -= g * t;
    }
    this.vel.y = v; this.pos.y += y;
  }

  /** Feet against what's under them: landing, stepping up, or sticking to the ground going downhill. */
  private land(y0: number) {
    const g = this.under(this.pos.x, this.pos.z);
    if (this.pos.y <= g && !this.onGround && this.vel.y > 0) {
      // rising past the edge of a roof, a car or a step: carry on up and come down on it, rather
      // than being stopped dead on it mid-jump (but never inside the ground itself)
      const solid = Math.min(g, this.map.ground(this.pos.x, this.pos.z));
      if (this.pos.y < solid) { this.raise(solid - this.pos.y); this.pos.y = solid; }
    } else if (this.pos.y <= g) {
      if (!this.onGround && this.vel.y < -6) this.landKick = Math.min(0.25, -this.vel.y * 0.02);
      if (!this.onGround && this.vel.y < -3) this.landed = -this.vel.y;
      this.raise(g - y0);
      this.pos.y = g;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.onGround && this.pos.y - g < 0.6 && this.vel.y <= 0) {
      this.pos.y = g;   // stick to the ground going downhill
      this.vel.y = 0;
    } else {
      this.onGround = false;
    }
  }

  /** Onto a ladder you're walking into (wx, wz the way), if there's one to hand. Returns true if so. */
  private grab(wx: number, wz: number): boolean {
    const l = Math.hypot(wx, wz) || 1, dx = wx / l, dz = wz / l;
    for (const L of this.ladders) {
      const into = dx * L.nx + dz * L.nz;
      // how far out from the wall you are, and how far to the side of the ladder
      const rx = this.pos.x - L.x, rz = this.pos.z - L.z, out = -(rx * L.nx + rz * L.nz), side = Math.abs(rx * L.nz - rz * L.nx);
      const foot = into > 0.5 && this.onGround && Math.abs(this.pos.y - L.y0) < 1 && side < 0.6 && out > 0 && out < L.out + 1.2;
      const top = into < -0.5 && Math.abs(this.pos.y - L.y1) < 0.8 && Math.hypot(this.pos.x - (L.x + L.nx * 0.5), this.pos.z - (L.z + L.nz * 0.5)) < 0.9;
      if (!foot && !top) continue;
      this.ladder = L;
      const y = foot ? Math.max(L.y0, this.pos.y) : L.y1 - 0.1;
      const [x, z] = onRungs(L, y);
      this.pos.set(x, y, z);
      this.vel.set(0, 0, 0);
      this.onGround = false;
      this.jumpBuf = 0; this.coyote = 0; this.jumpRise = false;
      return true;
    }
    return false;
  }

  /** On a ladder: up or down it, off the top onto the roof, off the bottom, or let go with Space. */
  private climb(dt: number, active: boolean) {
    const L = this.ladder!, k = this.keys;
    let push = 0;
    if (active) {
      push = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
      if (!push && Math.abs(this.joy.y) > 0.3) push = -this.joy.y;
    }
    // facing the wall, forward climbs; facing away from it (coming down off a roof) forward goes down;
    // and looking well up or down says which outright
    const facing = -Math.sin(this.yaw) * L.nx - Math.cos(this.yaw) * L.nz;
    const way = this.pitch > 0.6 ? 1 : this.pitch < -0.6 ? -1 : facing >= 0 ? 1 : -1;
    const v = Math.max(-1, Math.min(1, push)) * way * CLIMB;
    this.onGround = false;
    this.speed = 0;
    this.crouch += (0 - this.crouch) * Math.min(1, dt * 12);
    this.proneLatch = false; this.prone = 0;
    if (this.wantJump && active) {
      // let go, pushing off the wall
      this.wantJump = false;
      this.ladder = null; this.offLadder = "go"; this.jumped = true;
      this.vel.set(-L.nx * 3, 2.5, -L.nz * 3);
      return;
    }
    this.wantJump = false;
    const y = this.pos.y + v * dt;
    if (v < 0 && y <= L.y0) {
      const [x, z] = onRungs(L, L.y0);
      this.pos.set(x, L.y0, z);
      this.vel.set(0, 0, 0);
      this.ladder = null; this.offLadder = "foot"; this.onGround = true;
      return;
    }
    if (v > 0 && y >= L.y1) {
      // over the top and onto the roof (its walls stop being in the way at the eaves: map.ts)
      this.pos.set(L.x + L.nx * 0.6, L.y1, L.z + L.nz * 0.6);
      this.vel.set(0, 0, 0);
      this.ladder = null; this.offLadder = "top"; this.onGround = true;
      return;
    }
    const [x, z] = onRungs(L, y);
    this.pos.set(x, y, z);
    this.vel.set(0, v, 0);
    this.bob += Math.abs(v) * dt * 10;   // a rung each time round (footsteps in game.ts)
  }

  /** Get on (or off, with null) a ride, pointing the way you face, at a standstill. */
  mount(spec: RideSpec | null) {
    this.ride = spec;
    this.heading = this.yaw;
    this.rideV = 0;
    this.proneLatch = false; this.crouchLatch = false;
    this.tumble = 0; this.grind = null; this.autoGrab = true; this.noGrab = 0; this.manual = 0; this.balance = 0; this.charge = 0;
    this.verbOn = false; this.trick = 0; this.airBig = false; this.dip = 0;
    this.jumpBuf = 0; this.coyote = 0; this.jumpRise = false;
  }

  /** Riding: you roll the way the ride's heading, steered towards where you look. */
  private rideUpdate(dt: number, active: boolean) {
    const s = this.ride!, k = this.keys;
    this.crouch += (0 - this.crouch) * Math.min(1, dt * 12);
    this.prone += (0 - this.prone) * Math.min(1, dt * 8);
    this.proneLatch = false;
    this.kicked = false;
    if (this.tumble > 0 && (this.tumble -= dt) <= 0) {
      // back on, facing where you look
      this.tumble = 0;
      this.heading = this.yaw;
      this.rideV = 0;
    }
    const control = active && this.tumble <= 0;
    let fwd = 0, side = 0;
    if (control) {
      if (k.has("KeyW") || k.has("ArrowUp")) fwd += 1;
      if (k.has("KeyS") || k.has("ArrowDown")) fwd -= 1;
      if (k.has("KeyA") || k.has("ArrowLeft")) side -= 1;
      if (k.has("KeyD") || k.has("ArrowRight")) side += 1;
      if (!fwd && !side && Math.hypot(this.joy.x, this.joy.y) > 0.15) { fwd = -this.joy.y; side = this.joy.x; }
    }
    // Space (or the jump button): held, just pressed, just let go
    const held = control && (k.has("Space") || this.jumpHeld);
    const press = control && !this.prevHeld && (held || this.wantJump);
    const released = control && this.prevHeld && !held;
    this.prevHeld = held;
    this.wantJump = false;
    // Shift (or the trick button): grind or manual
    const shift = control && (k.has("ShiftLeft") || k.has("ShiftRight") || this.trickHeld);
    const shiftPress = shift && !this.prevShift;
    this.prevShift = shift;
    this.grabBuf = shiftPress ? 0.25 : Math.max(0, this.grabBuf - dt);
    this.noGrab = Math.max(0, this.noGrab - dt);
    this.kickT -= dt; this.bounceT -= dt;
    const sx = this.pos.x, sz = this.pos.z, wasGround = this.onGround;
    if (s.pogo) {
      // a pogo stick: you go where you press, like walking, but always bouncing
      if (!this.onGround) this.airSpin += wrap(this.yaw - this.heading);
      this.heading = this.yaw;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw), len = Math.hypot(fwd, side) || 1;
      const wx = ((side * cos - fwd * sin) / len) * s.top * this.rideMul, wz = ((-side * sin - fwd * cos) / len) * s.top * this.rideMul;
      this.vel.x += (wx - this.vel.x) * Math.min(1, dt * (this.tumble > 0 ? 3 : 5));
      this.vel.z += (wz - this.vel.z) * Math.min(1, dt * (this.tumble > 0 ? 3 : 5));
      // pressed just before you land: a perfect bounce, higher than holding it down
      if (press && !this.onGround) this.bounceT = 0.22;
      if (this.onGround && this.tumble <= 0) {
        const perfect = this.bounceT > 0 || press, big = perfect || held;
        this.vel.y = perfect ? s.jump * 1.3 : big ? s.jump : 6;
        if (perfect) this.events.push({ k: "trick", name: "Perfect bounce" });
        this.airBig = big;
        this.bounceT = 0;
        this.onGround = false;
        this.jumped = true;
      }
      this.dip += ((held ? 0.25 : 0) - this.dip) * Math.min(1, dt * 10);
      this.rideV = Math.hypot(this.vel.x, this.vel.z);
      const p = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.z * dt };
      this.map.collide(p, this.pos.y, RADIUS);
      this.slideTo(p, dt);
    } else if (this.grind) {
      this.grindUpdate(dt, press, s, fwd, side);
      if (this.grind) { this.rideDone(sx, sz, dt, s); return; }
    } else {
      const air = !this.onGround;
      // steering: A and D turn you (and the view); otherwise it comes round to where you look.
      // In the air it turns as fast as you can spin it.
      const turn = this.tumble > 0 ? 0 : air ? s.spin : s.turn * Math.min(1, 0.35 + Math.abs(this.rideV) / 4) * (this.verbOn ? 0.6 : 1);
      if (side) this.yaw -= side * turn * dt;
      const diff = wrap(this.yaw - this.heading), before = this.heading;
      this.heading += Math.max(-turn * dt, Math.min(turn * dt, diff));
      if (air) this.airSpin += this.heading - before;
      // a trolley's wonky wheel (worse with you riding on the back)
      if (s.wobble && !air) {
        this.wobble = this.wobble * Math.max(0, 1 - dt * 0.6) + (Math.random() - 0.5) * dt * 6;
        this.heading += this.wobble * s.wobble * (this.verbOn ? 1.5 : 1) * dt * Math.min(1, Math.abs(this.rideV) / 4);
      }
      const hx = -Math.sin(this.heading), hz = -Math.cos(this.heading);
      let v = this.rideV;
      if (this.onGround) {
        const hard = this.paved(this.pos.x, this.pos.z);
        const ahead = this.under(this.pos.x + hx * 0.6, this.pos.z + hz * 0.6) - this.under(this.pos.x - hx * 0.6, this.pos.z - hz * 0.6);
        const grade = Math.max(-0.6, Math.min(0.6, ahead / 1.2));
        this.grade = grade;
        // the ride's verb, on Space
        let jumpV = 0;
        this.verbOn = held && (s.verb === "tuck" || s.verb === "lean") && Math.abs(v) > 1 && !this.manual;
        if (s.verb === "hop") {
          // a BMX: crouch while it's held, and the longer you crouch the higher the hop when you let go
          if (held) this.charge = Math.min(1, this.charge + dt / 0.4);
          if (released || (press && !held)) jumpV = s.jump * (0.7 + 0.45 * this.charge);
          if (!held) this.charge = 0;
        } else if ((s.verb === "ollie" || s.verb === "jump") && press) jumpV = s.jump + (s.verb === "ollie" ? Math.min(1.4, Math.abs(v) * 0.12) : 0);
        else if (s.verb === "kick" && press && this.kickT <= 0 && v > -0.5 && v < s.top * 1.4) {
          // a scooter: a kick for a burst of speed, a bit past what pushing on gets you (less uphill)
          const up = Math.max(0.3, 1 - Math.max(0, grade) * 3);
          v = Math.min(s.top * 1.4 * up, v + (v < s.top ? 2.8 : 1.6) * up);
          this.kickT = 0.35;
          this.kicked = true;
        }
        // Shift: on to a kerb or a low wall you're alongside, or else up on to the back wheels
        if (shiftPress && s.grind && this.startGrind(false, s)) { this.rideDone(sx, sz, dt, s); return; }
        const canManual = !!s.manual && shift && Math.abs(v) > 1.2 && !this.verbOn && !jumpV;
        if (canManual && !this.manual) {
          this.manual = 1e-3; this.balance = (Math.random() - 0.5) * 0.2; this.balV = 0;
          this.events.push({ k: "manual", on: true, name: s.manual, t: 0 });
        } else if (!canManual && this.manual) this.endManual();
        if (this.manual) {
          // it tips one way or the other, harder the longer you hold it, and W and S tip it back
          this.manual += dt;
          const tip = this.assist ? 0.5 : 1;
          this.balV += (this.balance * 2.4 * tip + (Math.random() - 0.5) * 3 * tip * (1 + this.manual * 0.25) - fwd * 3.5) * dt;
          this.balV *= Math.max(0, 1 - dt * 1.5);
          this.balance += this.balV * dt;
          if (Math.abs(this.balance) > 1) {
            this.endManual();
            if (!this.assist) this.bail(Math.abs(v), false);
          }
        }
        // pushing on (not on a manual, tucked or holding on), and harder going uphill
        const push = this.manual || (this.verbOn && fwd > 0) ? 0 : fwd;
        const climb = Math.max(0, grade);
        const top = (hard ? s.top : s.rough) * this.rideMul * Math.max(0.35, 1 - climb * 3);
        if (this.rideKick) { v = Math.max(0, v + this.rideKick); this.rideKick = 0; }
        if (push > 0 && v < top) v = Math.min(top, v + s.accel * this.rideMul * Math.max(0.35, 1 - climb * 4) * push * dt);
        else if (push < 0) v = v > 0 ? Math.max(0, v - s.brake * -push * dt) : Math.max(-s.back, v - s.accel * dt);
        // the road and the wind hold it back, less tucked in or holding on, and grass bogs it down
        const tuck = this.verbOn ? 0.5 : 1;
        v -= Math.sign(v) * s.coast * Math.min(Math.abs(v), 6) * tuck * dt;
        v -= s.drag * v * Math.abs(v) * tuck * dt;
        if (!hard && Math.abs(v) > top) v -= (v - Math.sign(v) * top) * 1.6 * dt;
        // downhill it runs away with you, tucked in or holding on more so; uphill it slows
        const boost = this.verbOn && grade < 0 ? (s.verb === "lean" ? 1.5 : 1.15) : 1;
        // (pushing on up a steep hill you still crawl up it: the hill only tells as you get going)
        const fight = push > 0 && grade > 0 ? Math.min(1, Math.max(0, v) / (top + 0.1)) : 1;
        v -= 9.8 * grade * s.downhill * boost * fight * dt;
        v = Math.max(-Math.max(s.back, 2), Math.min(s.maxDown * this.rideMul + (this.verbOn ? 5 : 0), v));
        if (this.tumble > 0) v *= Math.exp(-4 * dt);
        if (Math.abs(v) < 0.05 && !push) v = 0;
        this.vel.x = hx * v; this.vel.z = hz * v;
        if (jumpV && s.jump) {
          if (this.manual) this.endManual();
          this.vel.y = jumpV; this.onGround = false; this.jumped = true; this.airBig = true;
        }
      } else {
        // the ride's trick: Space again in the air
        if (press && s.trick && !this.trick && this.air > 0.08 && this.tumble <= 0) this.trick = 1e-3;
        // a kerb or a wall to come down on and grind
        if (s.grind && this.tumble <= 0 && this.air > 0.06 && this.noGrab <= 0 && (this.autoGrab || shift || this.grabBuf > 0) && this.startGrind(true, s)) { this.rideDone(sx, sz, dt, s); return; }
      }
      if (this.trick && (this.trick += dt / TRICK_TIME) >= 1) {
        this.trick = 0;
        this.events.push({ k: "trick", name: s.trick });
      }
      const target = this.verbOn ? (s.verb === "tuck" ? 0.35 : 0.25) : this.charge * 0.35 + (this.manual ? -0.06 : 0);
      this.dip += (target - this.dip) * Math.min(1, dt * 10);
      const p = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.z * dt };
      this.map.collide(p, this.pos.y, RADIUS);
      // how much of the way we meant to go we got (1: nothing in the way)
      const blocked = this.map.lastBlock, sp = Math.hypot(this.vel.x, this.vel.z), want = sp * dt;
      const progress = want > 1e-4 ? Math.max(0, Math.min(1, ((p.x - this.pos.x) * this.vel.x + (p.z - this.pos.z) * this.vel.z) / sp / want)) : 1;
      if (blocked > 0 && blocked <= s.hop + 0.05 && this.onGround && Math.abs(v) > 1.5) {
        // a kerb or a low wall: up and over it
        this.vel.y = Math.max(this.vel.y, Math.sqrt(2 * GRAVITY * (blocked + 0.15)));
        this.onGround = false;
        this.jumped = true;
      } else if (Math.abs(v) > 2.5 && progress < 0.5) {
        if (Math.abs(v) >= s.crash && this.tumble <= 0) { this.bail(Math.abs(v), true); v = 0; }
        else v *= Math.max(0.1, progress);
      }
      this.rideV = v;
      if (this.onGround) { this.pos.x = p.x; this.pos.z = p.z; }
      else this.slideTo(p, dt);
    }
    // up and down, as on foot (a ride's jumps are its own, so without falling any quicker)
    const y0 = this.pos.y;
    this.fall(dt, 1);
    this.land(y0);
    const g = this.under(this.pos.x, this.pos.z);
    if (!this.onGround) {
      if (wasGround) { this.air = 0; this.airH = 0; this.airSpin = 0; }
      this.air += dt;
      this.airH = Math.max(this.airH, this.pos.y - g);
    } else if (!wasGround) this.touchDown(s);
    this.rideDone(sx, sz, dt, s);
  }

  /** The end of every ride frame. */
  private rideDone(sx: number, sz: number, dt: number, s: RideSpec) {
    this.speed = Math.hypot(this.pos.x - sx, this.pos.z - sz) / Math.max(dt, 1e-4);
    if (s.pogo && this.onGround) this.bob += this.speed * dt * 1.9;
    this.landKick *= Math.max(0, 1 - dt * 8);
  }

  /**
   * Back down on the ground. A landing near enough lined up with the way you're going straightens
   * itself up (within 30 degrees, and a bit wobbly up to 75); come down further round than that, or
   * in the middle of a trick, and you're off. Touch controls straighten any landing. Lined up by
   * yourself after a spin or a trick is a clean landing.
   */
  private touchDown(s: RideSpec) {
    this.autoGrab = true;
    const big = this.airBig || this.air > 0.45;
    this.airBig = false;
    if (this.tumble > 0) return;
    if (s.pogo) {
      if (big) this.events.push({ k: "air", t: this.air, h: this.airH, spin: this.airSpin });
      return;
    }
    const sp = Math.hypot(this.vel.x, this.vel.z);
    let off = 0;
    if (sp > 1 && this.rideV >= 0) {
      const travel = Math.atan2(-this.vel.x, -this.vel.z);
      off = Math.abs(wrap(this.heading - travel));
      if (off > Math.PI * 0.8) off = Math.PI - off;   // the other way round: you ride on, turned about
      this.heading = travel;
      this.rideV = sp;
    }
    if (this.trick > 0) {
      // nearly round counts; caught halfway and you're off (touch controls just lose the trick)
      if (this.trick > 0.7) this.events.push({ k: "trick", name: s.trick });
      else if (!this.assist) { this.trick = 0; this.bail(sp, false); return; }
      this.trick = 0;
    }
    if (!big) return;
    const DEG = Math.PI / 180;
    if (off > 75 * DEG && !this.assist) { this.bail(sp, false); return; }
    if (off > 30 * DEG && !this.assist) this.rideV *= 0.7;
    this.events.push({ k: "air", t: this.air, h: this.airH, spin: this.airSpin });
    this.events.push({ k: "land", clean: off < 10 * DEG && (Math.abs(this.airSpin) > 2.6 || this.air > 0.6) });
  }

  /** Knocked off by another racer: a full tumble, as from a hard crash. */
  knock() { this.bail(8, false); }

  /** Coming off: a quick tumble, and back on in under two seconds. wall: into something (which hurts). */
  private bail(speed: number, wall: boolean, small = false) {
    if (this.tumble > 0) return;
    this.tumble = small ? TUMBLE * 0.55 : TUMBLE;
    this.tumbleHard = speed > 6 && !small;
    this.tumbleSide = Math.random() < 0.5 ? -1 : 1;
    this.crashed = Math.max(0.1, speed);
    this.crashWall = wall;
    if (this.grind) this.endGrind();
    if (this.manual) this.endManual();
    this.trick = 0; this.charge = 0; this.verbOn = false;
    this.events.push({ k: "bail" });
    if (this.onGround) { this.vel.y = this.tumbleHard ? 3.2 : 1.6; this.onGround = false; }
  }

  private endManual() {
    this.events.push({ k: "manual", on: false, name: this.ride?.manual ?? "", t: this.manual });
    this.manual = 0; this.balance = 0;
  }

  private endGrind() {
    const g = this.grind;
    if (!g) return;
    this.grind = null;
    this.noGrab = Math.max(this.noGrab, 0.25);
    this.events.push({ k: "grind", on: false, name: this.ride?.grinds[g.style] ?? "", len: g.dist - g.seg, kerb: g.kerb, style: g.style });
  }

  /**
   * Snap on to a grind if there's a low wall or a kerb close by running the way you're going: in
   * the air, coming down on to it (or near enough), or on the ground with Shift. Returns whether it did.
   */
  private startGrind(air: boolean, s: RideSpec): boolean {
    const sp = Math.hypot(this.vel.x, this.vel.z), going = air ? sp : Math.abs(this.rideV);
    if (going < 2.5) return false;
    const dx = sp > 0.5 ? this.vel.x / sp : -Math.sin(this.heading), dz = sp > 0.5 ? this.vel.z / sp : -Math.cos(this.heading);
    const x = this.pos.x, z = this.pos.z, y = this.pos.y;
    const minDot = Math.cos(s.kind === "blades" ? 0.7 : 0.55);
    // a wall: coming down on to its top in the air, or popping up on to it from beside it
    const e = this.map.grindEdge?.(x, z, y, s.snap, air ? 0.8 : 1.3, air ? 0.6 : -0.15, dx, dz, minDot);
    let g: Grind;
    if (e) {
      const ux = e.bx - e.ax, uz = e.bz - e.az, len = Math.hypot(ux, uz) || 1;
      const at = Math.max(0, Math.min(len, ((x - e.ax) * ux + (z - e.az) * uz) / len));
      g = { kerb: false, ax: e.ax, az: e.az, dx: ux / len, dz: uz / len, len, at, side: 0, hi: e.top, dist: 0, ...GRIND_NEW() };
      this.pos.set(e.ax + (ux / len) * at, e.top, e.az + (uz / len) * at);
    } else {
      // a kerb: low down near the ground, and on the way down if you're in the air
      const ground = this.under(x, z);
      if (air && (this.vel.y > 1 || y - ground > 0.9)) return false;
      const here = this.kerbAt(x, z, dx, dz, 0, s.snap);
      const on = here && this.kerbAt(x + dx, z + dz, dx, dz, here.t, 0.6);
      if (!here || !on || on.side !== here.side) return false;
      // which way it runs, from here to a metre on
      let kx = dx - dz * (on.t - here.t), kz = dz + dx * (on.t - here.t);
      const kl = Math.hypot(kx, kz);
      kx /= kl; kz /= kl;
      g = { kerb: true, ax: 0, az: 0, dx: kx, dz: kz, len: 0, at: 0, side: here.side, hi: here.hi, dist: 0, ...GRIND_NEW() };
      const t = here.t + here.side * KERB_IN;
      this.pos.x = x - dz * t; this.pos.z = z + dx * t;
      this.pos.y = this.under(this.pos.x, this.pos.z) + here.hi;
    }
    if (this.manual) this.endManual();
    this.trick = 0;
    this.grind = g;
    this.rideV = going;
    this.heading = Math.atan2(-g.dx, -g.dz);
    this.vel.set(g.dx * going, 0, g.dz * going);
    this.onGround = true;
    this.airBig = false;
    this.autoGrab = true;
    this.prevGSide = 0;
    this.events.push({ k: "grind", on: true, name: s.grinds[0], len: 0, kerb: g.kerb, style: 0 });
    return true;
  }

  /** Sliding along a kerb or a wall: on to the next length of it, off the end, or off with Space. */
  private grindUpdate(dt: number, press: boolean, s: RideSpec, fwd: number, side: number) {
    const g = this.grind!;
    let v = this.rideV;
    g.t += dt;
    // the stick picks the grind, once it has settled on one (a tap to steady it isn't a change)
    const want = Math.max(Math.abs(fwd), Math.abs(side)) < 0.4 ? 0 : Math.abs(fwd) >= Math.abs(side) ? (fwd > 0 ? 1 : 2) : side < 0 ? 3 : 4;
    if (want !== g.want) { g.want = want; g.wantT = 0; } else g.wantT += dt;
    if (want !== g.style && g.wantT >= 0.12) {
      const old = g.style;
      this.events.push({ k: "grind", on: false, name: s.grinds[old], len: g.dist - g.seg, kerb: g.kerb, style: old });
      g.style = want; g.seg = g.dist;
      this.events.push({ k: "grind", on: true, name: s.grinds[want], len: 0, kerb: g.kerb, style: want });
    }
    // a long grind starts to tip; a tap of the other direction puts it right
    const tap = Math.abs(side) > 0.4 ? Math.sign(side) : 0;
    if (tap && tap !== this.prevGSide && tap * g.bal < -0.2) g.balV += tap * 1.6;
    this.prevGSide = tap;
    const tip = (this.assist ? 0.5 : 1) * Math.min(1, Math.max(0, g.t - 0.9) * 0.5);
    g.balV += (g.bal * 3 + (Math.random() - 0.5) * 5) * tip * dt;
    g.balV *= Math.max(0, 1 - dt * 1.5);
    g.bal += g.balV * dt;
    if (Math.abs(g.bal) > 1) {
      if (this.assist) g.bal = Math.sign(g.bal) * 0.95;
      else { this.bail(v, false, true); return; }
    }
    // it slows a little as it scrapes along, and runs on down a hill
    const ahead = this.map.ground(this.pos.x + g.dx * 0.6, this.pos.z + g.dz * 0.6) - this.map.ground(this.pos.x - g.dx * 0.6, this.pos.z - g.dz * 0.6);
    v -= (0.5 + 9.8 * Math.max(-0.5, Math.min(0.5, ahead / 1.2)) * s.downhill * 0.8) * dt;
    v = Math.min(v, s.maxDown);
    const off = (pop: number) => {
      this.endGrind();
      this.rideV = v;
      this.vel.set(g.dx * v, pop, g.dz * v);
      if (pop > 0) { this.onGround = false; this.jumped = true; this.airBig = true; }
    };
    if (press) { this.autoGrab = false; off(Math.max(s.jump, 5) * 1.05 + Math.min(1.2, v * 0.08)); return; }   // jump off it
    if (v < 1.5) { off(0); return; }                            // too slow to stay on
    const step = v * dt;
    let nx = this.pos.x + g.dx * step, nz = this.pos.z + g.dz * step, ny = this.pos.y;
    if (!g.kerb) {
      g.at += step;
      if (g.at > g.len) {
        // the next length of wall, if it carries on near enough the same way
        const over = g.at - g.len, ex = g.ax + g.dx * (g.len + over + 0.25), ez = g.az + g.dz * (g.len + over + 0.25);
        const e = this.map.grindEdge?.(ex, ez, g.hi, 0.45, 0.35, 0.8, g.dx, g.dz, Math.cos(0.6));
        if (!e || (e.ax === g.ax && e.az === g.az)) { off(2.5); return; }
        const ux = e.bx - e.ax, uz = e.bz - e.az, len = Math.hypot(ux, uz) || 1;
        g.ax = e.ax; g.az = e.az; g.dx = ux / len; g.dz = uz / len; g.len = len; g.hi = e.top;
        g.at = Math.max(0, Math.min(len, ((ex - e.ax) * ux + (ez - e.az) * uz) / len));
      }
      nx = g.ax + g.dx * g.at; nz = g.az + g.dz * g.at; ny = g.hi;
    } else {
      // a kerb: find it again just across from you, and follow it round
      const kb = this.kerbAt(nx, nz, g.dx, g.dz, -g.side * KERB_IN, 0.5);
      if (!kb || kb.side !== g.side) { off(0); return; }
      const on = this.kerbAt(nx + g.dx, nz + g.dz, g.dx, g.dz, kb.t, 0.5);
      if (on && on.side === g.side) {
        let kx = g.dx - g.dz * (on.t - kb.t), kz = g.dz + g.dx * (on.t - kb.t);
        const kl = Math.hypot(kx, kz);
        kx /= kl; kz /= kl;
        if (kx * g.dx + kz * g.dz > 0.85) {
          const t = kb.t + g.side * KERB_IN;
          nx -= g.dz * t; nz += g.dx * t;
          g.dx = kx; g.dz = kz;
        } else { off(0); return; }   // it turns away too sharply (a corner)
      } else { off(0); return; }
      ny = this.under(nx, nz) + kb.hi;
    }
    // anything in the way (a post, the end of a wall, a parked car)
    const p = { x: nx, z: nz };
    this.map.collide(p, ny, RADIUS * 0.6);
    if (Math.hypot(p.x - nx, p.z - nz) > 0.2) {
      if (v >= s.crash) this.bail(v, true);
      else { v *= 0.3; off(0); }
      return;
    }
    this.pos.set(p.x, ny, p.z);
    g.dist += step;
    this.rideV = v;
    this.heading = Math.atan2(-g.dx, -g.dz);
    this.vel.set(g.dx * v, 0, g.dz * v);
    this.onGround = true;
    this.dip += (0.12 - this.dip) * Math.min(1, dt * 10);
  }

  /**
   * The nearest kerb across the way you're going (dx, dz) from (x, z), looking reach either side
   * of centre metres across: where it is across (t, metres to the left), which side is the higher
   * (side: 1 to the left) and how high that side stands (hi).
   */
  private kerbAt(x: number, z: number, dx: number, dz: number, centre: number, reach: number): { t: number; side: number; hi: number } | null {
    const nx = -dz, nz = dx, f = (t: number) => this.lift(x + nx * t, z + nz * t);
    let best: { t: number; side: number; hi: number } | null = null;
    let t0 = centre - reach, f0 = f(t0);
    for (let t1 = t0 + 0.2; t1 <= centre + reach + 1e-6; t1 += 0.2) {
      const f1 = f(t1);
      if (Math.abs(f1 - f0) >= KERB) {
        // narrow it down
        let a = t0, b = t1, fa = f0;
        for (let i = 0; i < 3; i++) {
          const m = (a + b) / 2, fm = f(m);
          if (Math.abs(fm - fa) >= KERB) b = m; else { a = m; fa = fm; }
        }
        const t = (a + b) / 2;
        if (!best || Math.abs(t - centre) < Math.abs(best.t - centre)) best = { t, side: f1 > f0 ? 1 : -1, hi: Math.max(f0, f1) };
      }
      t0 = t1; f0 = f1;
    }
    return best;
  }

  applyToCamera(cam: THREE.PerspectiveCamera) {
    const bobY = Math.sin(this.bob * 2) * 0.035 * Math.min(1, this.speed / 5);
    // coming off a ride: down you go (head over heels, if you were going), a moment on your side, and up
    let drop = 0, roll = 0, nod = 0;
    if (this.tumble > 0) {
      const t = 1 - this.tumble / TUMBLE, ease = (u: number) => u * u * (3 - 2 * u);
      const down = t < 0.3 ? ease(t / 0.3) : t < 0.7 ? 1 : 1 - ease((t - 0.7) / 0.3);
      drop = down * (this.eyeHeight - 0.3);
      roll = down * 1.2 * this.tumbleSide;
      if (this.tumbleHard && t < 0.45) { nod = -Math.PI * 2 * ease(t / 0.45); drop -= Math.sin((Math.PI * t) / 0.45) * 0.5; }
    }
    cam.position.set(this.pos.x, this.pos.y + this.eyeHeight + bobY - this.landKick - drop - this.stepUp, this.pos.z);
    const g = this.grind, lean = g ? (g.style === 3 ? 0.05 : g.style === 4 ? -0.05 : 0) + g.bal * 0.07 : 0;
    this.grindLean += (lean - this.grindLean) * 0.15;
    cam.rotation.set(this.pitch + nod, this.yaw, roll + this.grindLean, "YXZ");
  }
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
