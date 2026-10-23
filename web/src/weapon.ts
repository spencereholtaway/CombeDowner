// What you hold: fists, the rifle and the sniper rifle. First-person models, firing rules (rate,
// spread, recoil, rounds) and world effects. By default (gore.ts) the guns are paintball markers,
// with a hopper of paintballs on top and an air tank for a stock, and they fire paintballs you can
// see fly; with blood on they're the real rifles, with muzzle flashes and tracers. The paintballs
// in your own hopper are loose: one for each round in the gun, rolling about as you move, jumping
// when you fire and dropping in from the top as you reload (Hopper, below). All of this is only
// what you see of your own gun, so nothing here goes over the network.
import * as THREE from "three";
import { gore, look, watch } from "./gore";
import { nightNow } from "./daylight";

export type GunKind = "fists" | "rifle" | "sniper";
export const SLOTS: GunKind[] = ["fists", "rifle", "sniper"];   // keys 1, 2, 3

export interface Gun {
  label: string;
  mag: number;        // rounds it holds (0: fists, never run out)
  interval: number;   // seconds between shots
  body: number; head: number;
  range: number;
  adsFov: number;     // field of view aiming down the sights
  zoom: number;       // how much aiming slows the mouse
  recoil: number;
}

export const GUNS: Record<GunKind, Gun> = {
  fists: { label: "Fists", mag: 0, interval: 0.45, body: 20, head: 35, range: 2, adsFov: 72, zoom: 0, recoil: 0.004 },
  rifle: { label: "Rounds", mag: 30, interval: 0.1, body: 22, head: 55, range: 400, adsFov: 45, zoom: 0.45, recoil: 0.011 },
  // one round at a time, then the bolt has to be worked before the next
  sniper: { label: "Sniper", mag: 10, interval: 2.2, body: 80, head: 200, range: 550, adsFov: 11, zoom: 0.85, recoil: 0.06 },
};

export const MAG = GUNS.rifle.mag;
export const RESERVE = 120;          // spare rifle rounds you spawn with (four magazines)
export const MAX_RESERVE = 300;
export const SNIPER_MAX_RESERVE = 50;
const RELOAD_TIME: Record<GunKind, number> = { fists: 0, rifle: 1.9, sniper: 2.6 };
export const SWITCH_TIME = 0.35;
const BOLT_START = 0.3, BOLT_END = 1.5;   // seconds after a sniper shot that the bolt is worked

export const damage = (kind: GunKind, head: boolean) => (head ? GUNS[kind].head : GUNS[kind].body);
/** What the ammo counter calls what's in the gun. */
export const ammoLabel = (kind: GunKind) => (gore() || kind === "fists" ? GUNS[kind].label : kind === "sniper" ? "Sniper" : "Paintballs");

const box = (w: number, h: number, d: number, color: string, x: number, y: number, z: number) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  return m;
};
const tube = (r: number, len: number, color: string, x: number, y: number, z: number) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), new THREE.MeshLambertMaterial({ color }));
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
};

const named = <T extends THREE.Object3D>(name: string, o: T) => { o.name = name; return o; };

/**
 * A paintball marker: a bright body, a long thin barrel, a hopper of paintballs on top and the air
 * tank as the stock. long: the sniper's, with a longer barrel and a scope.
 */
function markerModel(body: string, trim: string, balls: string, long: boolean, live?: Hopper): THREE.Group {
  const g = new THREE.Group();
  const bl = long ? 0.6 : 0.4, bz = long ? -0.47 : -0.38;
  g.add(box(0.065, 0.085, 0.3, body, 0, 0, -0.04));                 // body
  g.add(tube(0.018, bl, "#1c1e20", 0, 0.012, bz));                 // barrel
  g.add(tube(0.024, 0.06, trim, 0, 0.012, bz - bl / 2 + 0.03));   // barrel tip
  g.add(box(0.05, 0.03, 0.12, trim, 0, -0.045, -0.12));             // front of the frame
  g.add(box(0.04, 0.1, 0.045, "#1c1e20", 0, -0.1, -0.17));          // front grip
  g.add(box(0.045, 0.1, 0.05, "#1c1e20", 0, -0.08, 0.06));          // grip
  g.add(box(0.012, 0.04, 0.07, "#1c1e20", 0, -0.065, 0.0));         // trigger guard
  // the hopper: a smoky bowl of paintballs on a neck
  g.add(box(0.035, 0.05, 0.035, "#1c1e20", 0, 0.065, -0.06));       // feed neck
  const hop = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), new THREE.MeshLambertMaterial({ color: "#c8d6e4", transparent: true, opacity: 0.35, depthWrite: false }));
  hop.scale.set(1, 0.85, 1.4);
  hop.position.set(0, 0.13, -0.04);
  g.add(hop);
  if (live) g.add(live.mesh);
  else {
    const ballGeo = new THREE.SphereGeometry(BALL_R, 8, 6), ballMat = new THREE.MeshLambertMaterial({ color: balls, emissive: balls, emissiveIntensity: 0.1 });
    for (const [x, y, z] of [[-0.03, 0.11, -0.08], [0.02, 0.11, -0.05], [-0.01, 0.12, 0.0], [0.03, 0.12, -0.11], [0, 0.14, -0.06], [-0.035, 0.12, -0.02], [0.01, 0.1, -0.12]]) {
      const b = new THREE.Mesh(ballGeo, ballMat);
      b.position.set(x, y, z);
      g.add(b);
    }
  }
  g.add(box(0.07, 0.015, 0.12, trim, 0, 0.19, -0.04));              // lid
  // the air tank as the stock, with its regulator
  g.add(tube(0.042, 0.26, "#c9cdd2", 0, -0.03, 0.27));
  g.add(tube(0.03, 0.04, "#1c1e20", 0, -0.03, 0.12));
  if (long) {
    g.add(tube(0.028, 0.24, "#1c1e20", 0, 0.075, -0.24));          // scope, in front of the hopper
    g.add(tube(0.036, 0.05, "#1c1e20", 0, 0.075, -0.38));
    g.add(box(0.02, 0.035, 0.02, "#1c1e20", 0, 0.05, -0.3));
    g.add(box(0.02, 0.035, 0.02, "#1c1e20", 0, 0.05, -0.17));
  } else g.add(redDot(trim));
  return g;
}

/** Where the red dot sight's window is on the short marker: high enough to see over the hopper. */
const SIGHT = new THREE.Vector3(0, 0.24, -0.18);

/**
 * A red dot sight up on a riser in front of the hopper, so you look over the top of the hopper
 * through its window. The dot itself is drawn on the screen (#reddot), where the paint goes.
 */
function redDot(trim: string): THREE.Group {
  const g = new THREE.Group(), dark = new THREE.MeshLambertMaterial({ color: "#1c1e20", side: THREE.DoubleSide });
  g.add(box(0.03, 0.012, 0.08, "#1c1e20", 0, 0.048, SIGHT.z));                  // rail
  g.add(box(0.016, 0.16, 0.026, "#1c1e20", 0, 0.125, SIGHT.z));                 // riser
  g.add(box(0.03, 0.014, 0.05, trim, 0, SIGHT.y - 0.045, SIGHT.z));             // mount
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.04, 20, 1, true), dark);
  hood.rotation.x = Math.PI / 2;
  hood.position.copy(SIGHT);
  g.add(hood);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.005, 6, 20), new THREE.MeshLambertMaterial({ color: trim }));
  rim.position.set(0, SIGHT.y, SIGHT.z - 0.02);
  g.add(rim);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.034, 20),
    new THREE.MeshBasicMaterial({ color: "#9fd8ff", transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  glass.position.set(0, SIGHT.y, SIGHT.z - 0.01);
  g.add(glass);
  return g;
}

/** The sniper rifle (or the long paintball marker): long barrel, scope and a wooden stock. Also used for the pickup lying in the world. */
export function sniperModel(hands = true, hopper?: Hopper): THREE.Group {
  const g = new THREE.Group();
  g.add(look(markerModel("#f0762e", "#2a2c2e", "#ffe14a", true, hopper), "paint"));
  const real = look(new THREE.Group(), "real");
  g.add(real);
  real.add(box(0.065, 0.08, 0.36, "#3b3f36", 0, 0, 0));            // receiver
  real.add(box(0.03, 0.03, 0.62, "#2a2c2e", 0, 0.01, -0.48));      // barrel
  real.add(box(0.045, 0.045, 0.07, "#2a2c2e", 0, 0.01, -0.81));    // muzzle brake
  real.add(box(0.06, 0.11, 0.32, "#6b4a2b", 0, -0.03, 0.3));       // stock
  real.add(box(0.055, 0.04, 0.14, "#7a5733", 0, 0.04, 0.28));      // cheek rest
  real.add(box(0.045, 0.1, 0.05, "#2a2c2e", 0, -0.08, 0.1));       // grip
  real.add(box(0.05, 0.07, 0.08, "#2a2c2e", 0, -0.07, -0.02));     // magazine
  real.add(box(0.06, 0.015, 0.015, "#2a2c2e", 0.05, 0.02, 0.08));  // bolt handle
  real.add(tube(0.032, 0.3, "#1c1e20", 0, 0.09, -0.02));           // scope
  real.add(tube(0.042, 0.06, "#1c1e20", 0, 0.09, -0.19));          // objective bell
  real.add(tube(0.038, 0.05, "#1c1e20", 0, 0.09, 0.14));           // eyepiece
  real.add(box(0.02, 0.04, 0.02, "#2a2c2e", 0, 0.055, -0.1));      // mounts
  real.add(box(0.02, 0.04, 0.02, "#2a2c2e", 0, 0.055, 0.06));
  if (hands) {
    g.add(named("frontHand", box(0.09, 0.08, 0.16, "#c49a7c", 0.005, -0.06, -0.3)));  // front hand
    g.add(box(0.08, 0.09, 0.12, "#c49a7c", 0.01, -0.09, 0.12));   // back hand
  }
  return g;
}

function rifleModel(hopper: Hopper): THREE.Group {
  const g = new THREE.Group();
  g.add(look(markerModel("#2f7fe0", "#ffd23a", "#7dff4a", false, hopper), "paint"));
  const real = look(new THREE.Group(), "real");
  g.add(real);
  real.add(box(0.07, 0.09, 0.42, "#4a4f55", 0, 0, -0.05));        // receiver
  real.add(box(0.04, 0.04, 0.34, "#3a3e43", 0, 0.015, -0.43));     // barrel
  real.add(box(0.06, 0.06, 0.18, "#5d5442", 0, 0.005, -0.33));     // handguard
  real.add(box(0.05, 0.14, 0.07, "#3a3e43", 0, -0.11, -0.07));     // magazine
  real.add(box(0.045, 0.1, 0.05, "#3a3e43", 0, -0.08, 0.1));       // grip
  real.add(box(0.06, 0.08, 0.2, "#5d5442", 0, -0.02, 0.24));       // stock
  real.add(box(0.03, 0.035, 0.1, "#222", 0, 0.065, -0.02));        // sight
  real.add(box(0.008, 0.02, 0.008, "#e04030", 0, 0.088, -0.05));   // red dot
  g.add(named("frontHand", box(0.09, 0.08, 0.16, "#c49a7c", 0.005, -0.07, -0.3)));  // front hand
  g.add(box(0.08, 0.09, 0.12, "#c49a7c", 0.01, -0.09, 0.12));   // back hand
  return g;
}

/** Two fists with a bit of sleeve, held up in front. */
function fist(x: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.1, 0.1, 0.12, "#c49a7c", 0, 0, 0));               // fist
  g.add(box(0.03, 0.03, 0.05, "#b58a6c", 0.035, 0.05, -0.02));  // thumb knuckle
  g.add(box(0.11, 0.11, 0.3, "#3d4651", 0, -0.02, 0.2));        // sleeve
  g.position.set(x, 0, 0);
  return g;
}

const BALL_R = 0.014;
const HOP_C = new THREE.Vector3(0, 0.13, -0.04);                       // the middle of the hopper's bowl
const HOP_IN = new THREE.Vector3(0.075 - BALL_R, 0.064 - BALL_R, 0.105 - BALL_R);   // how far a ball's middle can go each way
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Matrix4();

/**
 * The paintballs loose in your own hopper, one for each round in the gun. Each is a little ball
 * that falls, rolls and knocks into the others inside the bowl. They feel which way is down as you
 * tilt the gun, slosh when you run, jump or swing round, jump about when you fire (the bottom one
 * goes down the neck into the gun), and new ones tumble in from the top as you reload. Works in
 * the gun's own measurements, so it doesn't matter where you are in the world. One draw call.
 */
class Hopper {
  readonly mesh: THREE.InstancedMesh;
  private pos: THREE.Vector3[] = [];
  private vel: THREE.Vector3[] = [];
  private was: THREE.Vector3[] = [];   // where each was at the start of a step
  private n = 0;            // balls in the bowl
  private fill = 0;         // seconds until the next one drops in
  constructor(private cap: number, color: string) {
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(BALL_R, 8, 6),
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.1 }), cap);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    for (let i = 0; i < cap; i++) { this.pos.push(new THREE.Vector3()); this.vel.push(new THREE.Vector3()); this.was.push(new THREE.Vector3()); }
    // start with it full, the balls already settled at the bottom
    for (let i = 0; i < cap; i++) this.drop(Math.random() * 0.4);
    const down = new THREE.Vector3(0, -9.8, 0);
    for (let k = 0; k < 90; k++) this.step(1 / 60, down);
    this.draw();
  }

  /** Another ball in at the top, h (0..1) of the way down from the lid. */
  private drop(h = 0) {
    if (this.n >= this.cap) return;
    const p = this.pos[this.n], v = this.vel[this.n];
    p.set((Math.random() - 0.5) * HOP_IN.x, HOP_IN.y * (0.8 - h * 1.6), (Math.random() - 0.5) * HOP_IN.z).add(HOP_C);
    v.set((Math.random() - 0.5) * 0.2, -0.3, (Math.random() - 0.5) * 0.2);
    this.n++;
  }

  /** A shot: the ball nearest the neck goes into the gun and the rest jump. */
  fire() {
    if (this.n) {
      let low = 0;
      for (let i = 1; i < this.n; i++) if (this.pos[i].y < this.pos[low].y) low = i;
      this.n--;
      this.pos[low].copy(this.pos[this.n]); this.vel[low].copy(this.vel[this.n]);
    }
    for (let i = 0; i < this.n; i++) this.vel[i].add(_v.set((Math.random() - 0.5) * 0.5, 0.35 + Math.random() * 0.6, -0.15 - Math.random() * 0.35));
  }

  /**
   * One frame. rounds: what's in the gun now; down: the push the balls feel (gravity less the gun's
   * own acceleration), in the gun's measurements.
   */
  update(dt: number, rounds: number, down: THREE.Vector3) {
    this.n = Math.min(this.n, rounds);
    if (this.n < rounds) {
      this.fill -= dt;
      if (this.fill <= 0) { this.drop(); this.fill = 0.035; }
    }
    dt = Math.min(dt, 1 / 30);
    this.step(dt / 2, down);
    this.step(dt / 2, down);
    this.draw();
  }

  private step(dt: number, down: THREE.Vector3) {
    const n = this.n, d = 2 * BALL_R, damp = Math.exp(-dt * 1.5);
    // each ball goes where it's heading, then is nudged clear of the others and back into the
    // bowl a few times over; how far it really moved is its speed for next time, so they come to
    // rest in a heap instead of fizzing
    for (let i = 0; i < n; i++) {
      const v = this.vel[i];
      v.addScaledVector(down, dt).multiplyScalar(damp);
      if (v.lengthSq() > 4) v.setLength(2);
      this.was[i].copy(this.pos[i]);
      this.pos[i].addScaledVector(v, dt);
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = this.pos[i], b = this.pos[j];
        _n.subVectors(b, a);
        const l2 = _n.lengthSq();
        if (l2 >= d * d) continue;
        const l = Math.sqrt(l2) || 1e-5;
        _n.multiplyScalar((d - l) / 2 / l);
        a.sub(_n); b.add(_n);
      }
      for (let i = 0; i < n; i++) {
        const p = this.pos[i].sub(HOP_C);
        const q = Math.hypot(p.x / HOP_IN.x, p.y / HOP_IN.y, p.z / HOP_IN.z);
        if (q > 1) p.divideScalar(q);
        p.add(HOP_C);
      }
    }
    for (let i = 0; i < n; i++) this.vel[i].subVectors(this.pos[i], this.was[i]).divideScalar(dt);
  }

  private draw() {
    for (let i = 0; i < this.n; i++) this.mesh.setMatrixAt(i, _m.makeTranslation(this.pos[i]));
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** A handheld radio in your left hand, its front turned towards you to talk into. */
function radioModel(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.075, 0.16, 0.035, "#26292c", 0, 0, 0));            // body
  g.add(box(0.06, 0.05, 0.004, "#3c4146", 0, 0.035, 0.019));     // speaker grille
  g.add(box(0.05, 0.022, 0.004, "#7fa88a", 0, -0.025, 0.019));   // screen
  g.add(box(0.012, 0.11, 0.012, "#151719", 0.022, 0.13, 0));     // antenna
  g.add(box(0.016, 0.02, 0.016, "#151719", -0.022, 0.09, 0));    // knob
  const led = box(0.012, 0.012, 0.012, "#ff3b2f", 0, 0.086, 0);  // on air
  (led.material as THREE.MeshLambertMaterial).emissive.set("#ff2010");
  g.add(led);
  // the hand round it: palm behind, thumb on the talk button, fingers curled round the far edge
  g.add(box(0.09, 0.1, 0.04, "#c49a7c", 0, -0.04, -0.035));      // palm
  g.add(box(0.025, 0.06, 0.045, "#b58a6c", -0.048, 0.0, -0.005)); // thumb
  g.add(box(0.022, 0.085, 0.05, "#c49a7c", 0.046, -0.04, 0.0));  // fingers
  g.add(box(0.11, 0.11, 0.3, "#3d4651", -0.01, -0.12, 0.08));    // sleeve
  return g;
}

/** Which rides you see the handlebars of. */
export type BarsKind = "bike" | "bmx" | "scooter";

/** The handlebars in front of you on a bike, a BMX or a scooter, with your left hand on its grip. */
function barsModel(kind: BarsKind): THREE.Group {
  const g = new THREE.Group(), tape = "#1d1f22", grip = "#2a2c30";
  if (kind === "bike") {
    // drop bars: the tops, the hoods and the drops curling down and back
    g.add(box(0.4, 0.024, 0.024, tape, 0, 0, 0));
    for (const x of [-0.2, 0.2]) {
      g.add(box(0.024, 0.024, 0.09, tape, x, 0, -0.045));          // out to the hoods
      g.add(box(0.034, 0.05, 0.04, "#111214", x, 0.025, -0.085));  // brake hood
      g.add(box(0.024, 0.11, 0.024, tape, x, -0.06, -0.09));       // the drop
      g.add(box(0.024, 0.024, 0.08, tape, x, -0.115, -0.05));      // and back towards you
      g.add(box(0.012, 0.09, 0.012, "#9aa0a6", x * 0.9, -0.03, -0.11));   // brake lever
    }
    g.add(box(0.036, 0.036, 0.12, "#4a4f55", 0, -0.01, 0.07));     // stem
    g.add(box(0.05, 0.05, 0.05, "#4a4f55", 0, -0.02, 0.13));       // and the top of the fork
  } else if (kind === "bmx") {
    // tall chrome bars with a crossbar and its pad
    const chrome = "#c9ced3";
    g.add(box(0.6, 0.024, 0.024, chrome, 0, 0, 0));
    for (const x of [-0.27, 0.27]) g.add(box(0.11, 0.036, 0.036, grip, x, 0, 0));
    for (const x of [-0.1, 0.1]) g.add(box(0.024, 0.17, 0.024, chrome, x, -0.085, 0.02));
    g.add(box(0.2, 0.022, 0.022, chrome, 0, -0.05, 0.02));        // crossbar
    g.add(box(0.14, 0.04, 0.04, "#d8263a", 0, -0.05, 0.02));      // its pad
    g.add(box(0.12, 0.04, 0.06, "#2e3136", 0, -0.17, 0.03));      // stem
  } else {
    // a scooter's T-bar, its tube going down out of sight
    const alu = "#b8bec4";
    g.add(box(0.46, 0.026, 0.026, alu, 0, 0, 0));
    for (const x of [-0.19, 0.19]) g.add(box(0.1, 0.04, 0.04, grip, x, 0, 0));
    g.add(box(0.034, 0.7, 0.034, alu, 0, -0.35, 0.03));
    g.add(box(0.05, 0.04, 0.05, "#2e3136", 0, -0.18, 0.03));      // the folding clamp
  }
  // your left hand on the left grip
  const gx = kind === "bike" ? -0.2 : kind === "bmx" ? -0.25 : -0.18;
  g.add(box(0.06, 0.05, 0.07, "#c49a7c", gx, 0.02, -0.01));
  g.add(box(0.06, 0.06, 0.2, "#3d4651", gx - 0.01, 0.0, 0.14));    // cuff
  return g;
}

export class Weapon {
  /** Rendered in its own pass over the world so it never pokes into walls. */
  readonly scene = new THREE.Scene();
  readonly model = new THREE.Group();
  kind: GunKind = "rifle";
  ammo = MAG;           // rifle rounds in the magazine
  reserve = RESERVE;    // spare rifle rounds
  hasSniper = false;
  sniperAmmo = 0;       // sniper rounds in the magazine
  sniperReserve = 0;    // spare sniper rounds
  reloading = 0;
  cooldown = 0;
  private sniperCool = 0;   // the bolt keeps cycling while you hold something else
  switching = 0;
  aim = 0;          // 0 hip .. 1 aiming down sights, eased
  kick = 0;
  /** Where the scope has drifted to, in radians (yaw, pitch). */
  readonly drift = new THREE.Vector2();
  private models: Record<GunKind, THREE.Group>;
  /** The loose paintballs in each marker's hopper. */
  private hoppers = { rifle: new Hopper(MAG, "#7dff4a"), sniper: new Hopper(GUNS.sniper.mag, "#ffe14a") };
  private hopAt = new THREE.Vector3();    // where the hopper was last frame, in the world
  private hopVel = new THREE.Vector3();
  private hopAcc = new THREE.Vector3();   // how hard the gun is being moved about, smoothed
  private hopFresh = true;
  private fists: THREE.Group[];
  private jab = 0;      // which fist threw the last punch
  private flash: THREE.Mesh;
  private flashLight: THREE.PointLight;
  private flashT = 0;
  /** The gun's own light, dimmer and bluer after dark (daylight.ts). */
  private hemi = new THREE.HemisphereLight("#dfe8f0", "#5a5540", 2.2);
  private sun = new THREE.DirectionalLight("#fff0d8", 1.6);
  private static DAY = new THREE.Color("#dfe8f0");
  private static NIGHT = new THREE.Color("#8090b8");
  private sway = new THREE.Vector2();
  private t = 0;
  /** The left hand with the radio: 0 down out of sight .. 1 held up, eased. */
  radio = 0;
  readonly radioHand = radioModel();

  constructor() {
    this.scene.add(this.hemi);
    this.sun.position.set(-1, 2, 1);
    this.scene.add(this.sun);
    const fists = new THREE.Group();
    this.fists = [fist(-0.2), fist(0.06)];
    fists.add(...this.fists);
    this.models = { fists, rifle: rifleModel(this.hoppers.rifle), sniper: sniperModel(true, this.hoppers.sniper) };
    for (const m of Object.values(this.models)) this.model.add(m);
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22),
      new THREE.MeshBasicMaterial({ color: "#ffd27a", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.flash.visible = false;
    this.model.add(this.flash);
    this.flashLight = new THREE.PointLight("#ffcf80", 0, 4);
    this.model.add(this.flashLight);
    this.model.scale.setScalar(0.72);
    this.scene.add(this.model);
    watch(this.scene);
    this.radioHand.scale.setScalar(0.72);
    this.radioHand.visible = false;
    this.scene.add(this.radioHand);
    this.show();
  }

  get gun() { return GUNS[this.kind]; }
  /** Rounds left in what you're holding (Infinity for fists). */
  get rounds() { return this.kind === "fists" ? Infinity : this.kind === "sniper" ? this.sniperAmmo : this.ammo; }
  get canFire() { return this.cooldown <= 0 && this.reloading <= 0 && this.switching <= 0 && this.rounds > 0; }
  /** True while the bolt is being worked after a sniper shot. */
  get rechambering() {
    const since = this.gun.interval - this.cooldown;
    return this.kind === "sniper" && this.cooldown > 0 && since > BOLT_START && since < BOLT_END;
  }
  /** Can this be picked with its number key: fists always, guns while they have rounds. */
  has(kind: GunKind) {
    return kind === "fists" || (kind === "rifle" ? this.ammo + this.reserve > 0 : this.hasSniper && this.sniperAmmo + this.sniperReserve > 0);
  }

  fire() {
    if (this.kind === "sniper") this.sniperAmmo--;
    else if (this.kind === "rifle") this.ammo--;
    this.cooldown = this.gun.interval;
    this.kick = 1;
    if (this.kind === "fists") { this.jab ^= 1; return; }
    this.hoppers[this.kind].fire();
    if (!gore()) return;   // a paintball marker just puffs: no flash
    this.flashT = 0.05;
    this.flash.rotation.z = Math.random() * Math.PI;
  }

  /** A click with nothing to fire. */
  dry() { this.cooldown = 0.3; }

  startReload(): boolean {
    if (this.reloading > 0) return false;
    if (this.kind === "rifle" && (this.ammo === MAG || this.reserve <= 0)) return false;
    if (this.kind === "sniper" && (this.sniperAmmo === GUNS.sniper.mag || this.sniperReserve <= 0)) return false;
    if (this.kind === "fists") return false;
    this.reloading = RELOAD_TIME[this.kind];
    return true;
  }

  /** Back to how you spawn: the rifle, a full magazine, spare rounds, no sniper. */
  reset() {
    Object.assign(this, { kind: "rifle", ammo: MAG, reserve: RESERVE, hasSniper: false, sniperAmmo: 0, sniperReserve: 0, reloading: 0, cooldown: 0, sniperCool: 0, switching: 0, aim: 0 });
    this.show();
  }

  /** Pick up the sniper rifle. If you've already got it, its magazine goes in your spare rounds. */
  giveSniper() {
    if (this.hasSniper) { this.sniperReserve = Math.min(SNIPER_MAX_RESERVE, this.sniperReserve + GUNS.sniper.mag); return; }
    this.hasSniper = true;
    this.sniperAmmo = GUNS.sniper.mag;
    this.select("sniper");
  }

  /** Change weapon. Returns false if you're already holding it or it has nothing to fire. */
  select(kind: GunKind): boolean {
    if (kind === this.kind || !this.has(kind)) return false;
    if (this.kind === "sniper") this.sniperCool = this.cooldown;
    this.kind = kind;
    this.reloading = 0;
    this.cooldown = kind === "sniper" ? this.sniperCool : 0;
    this.switching = SWITCH_TIME;
    this.show();
    return true;
  }

  private show() {
    for (const [k, m] of Object.entries(this.models)) m.visible = k === this.kind;
    const z = this.kind === "sniper" ? -0.88 : -0.66;
    this.flash.position.set(0, 0.015, z);
    this.flashLight.position.set(0, 0.02, z - 0.04);
  }

  /** Spread cone half-angle in radians. */
  spread(moving: number, airborne: boolean) {
    if (this.kind === "fists") return 0;
    if (this.kind === "sniper") return (0.06 - 0.0595 * this.aim) + moving * 0.012 * (1 - this.aim * 0.5) + (airborne ? 0.05 : 0);
    return (0.012 - 0.0105 * this.aim) + moving * 0.0025 * (1 - this.aim * 0.6) + (airborne ? 0.03 : 0);
  }

  update(dt: number, camera: THREE.PerspectiveCamera, wantAim: boolean, bob: number, speed: number, sprinting: boolean, crouch: number, lookDx: number, lookDy: number, onRadio: boolean) {
    const night = nightNow();
    this.hemi.intensity = 2.2 * (1 - 0.6 * night); this.sun.intensity = 1.6 * (1 - 0.8 * night);
    this.hemi.color.lerpColors(Weapon.DAY, Weapon.NIGHT, night);
    this.t += dt;
    this.cooldown -= dt;
    this.sniperCool -= dt;
    this.switching = Math.max(0, this.switching - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0 && this.kind === "rifle") {
        const take = Math.min(MAG - this.ammo, this.reserve);
        this.ammo += take;
        this.reserve -= take;
      } else if (this.reloading <= 0 && this.kind === "sniper") {
        const take = Math.min(GUNS.sniper.mag - this.sniperAmmo, this.sniperReserve);
        this.sniperAmmo += take;
        this.sniperReserve -= take;
      }
    }
    const canAim = this.kind !== "fists" && this.reloading <= 0 && this.switching <= 0 && !this.rechambering && !sprinting;
    this.aim += ((wantAim && canAim ? 1 : 0) - this.aim) * Math.min(1, dt * (this.kind === "sniper" ? 9 : 14));
    this.kick *= Math.max(0, 1 - dt * (this.kind === "fists" ? 9 : 18));
    this.sway.x += (-lookDx * 0.0004 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (lookDy * 0.0004 - this.sway.y) * Math.min(1, dt * 10);

    // The scope wanders in a slow figure of eight, more on the move, less crouched.
    const s = this.kind === "sniper" ? this.aim * (0.0055 + Math.min(1, speed / 5) * 0.006) * (1 - crouch * 0.5) : 0;
    const t = this.t;
    this.drift.set(
      (Math.sin(t * 0.83) + Math.sin(t * 2.1 + 1) * 0.3) * s,
      (Math.sin(t * 1.66 + 0.5) * 0.6 + Math.sin(t * 2.9) * 0.25) * s,
    );

    const hip = new THREE.Vector3(0.2, -0.18, -0.36), ads = this.kind === "sniper" ? new THREE.Vector3(0, -0.065, -0.2) : new THREE.Vector3(0, -0.072, -0.24);
    if (!gore() && this.kind === "rifle") ads.set(0, -SIGHT.y * this.model.scale.y, -0.24);   // the red dot's window square on your eye
    else if (!gore()) ads.y -= 0.13;   // the long marker is aimed over the top of its hopper
    if (this.kind === "fists") hip.set(0.07, -0.13, -0.32);
    const p = hip.lerp(ads, this.aim);
    const bobAmt = Math.min(1, speed / 5) * (1 - this.aim * 0.85);
    const steady = 1 - this.aim * 0.75;   // held tight to your cheek when aiming
    p.x += Math.sin(bob) * 0.012 * bobAmt + this.sway.x * steady;
    p.y += Math.abs(Math.cos(bob)) * 0.012 * bobAmt + this.sway.y * steady;
    if (this.kind !== "fists") p.z += this.kick * (this.kind === "sniper" ? 0.1 : 0.06);
    if (sprinting) p.y -= 0.05;
    const rl = this.reloading > 0 ? Math.sin((1 - this.reloading / RELOAD_TIME[this.kind]) * Math.PI) : 0;
    p.y -= rl * 0.12;
    // working the bolt: the rifle dips and rolls towards you
    const since = this.gun.interval - this.cooldown;
    const bolt = this.kind === "sniper" && this.cooldown > 0 ? Math.max(0, Math.sin(((since - BOLT_START) / (BOLT_END - BOLT_START)) * Math.PI)) * (since < BOLT_END ? 1 : 0) : 0;
    p.y -= bolt * 0.05;
    const sw = this.switching / SWITCH_TIME;
    p.y -= sw * 0.3;
    this.model.position.copy(p).applyQuaternion(camera.quaternion).add(camera.position);
    this.model.quaternion.copy(camera.quaternion);
    this.model.rotateX(this.kick * (this.kind === "sniper" ? 0.12 : this.kind === "fists" ? 0 : 0.06 * steady) - rl * 0.5 - sw * 0.6);
    this.model.rotateZ(rl * 0.4 + bolt * 0.35 + (sprinting ? 0.35 : 0));
    this.model.rotateY(sprinting ? 0.45 : 0);
    // a punch: the fist shoots forward and back
    this.fists.forEach((f, i) => { f.position.z = i === this.jab ? -this.kick * 0.32 : 0; f.position.y = i === this.jab ? this.kick * 0.04 : 0; });
    this.shakeHopper(dt);
    this.holdRadio(dt, camera, onRadio, bob, bobAmt);
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    this.flashLight.intensity = this.flashT > 0 ? 3 : 0;
  }

  /**
   * The balls in the hopper feel gravity, turned to however the gun is tilted, less however hard the
   * gun is being swung, bobbed and kicked about (worked out from where the hopper is each frame).
   */
  private shakeHopper(dt: number) {
    if (this.kind === "fists" || gore() || dt <= 0) { this.hopFresh = true; return; }
    const s = this.model.scale.x, q = this.model.quaternion;
    const at = _v.copy(HOP_C).multiplyScalar(s).applyQuaternion(q).add(this.model.position);
    const vel = at.clone().sub(this.hopAt).divideScalar(dt);
    if (this.hopFresh || vel.lengthSq() > 400) this.hopAcc.set(0, 0, 0);   // just picked up, or moved in a jump (respawned, got in a car)
    else {
      const acc = vel.clone().sub(this.hopVel).divideScalar(dt);
      if (acc.lengthSq() > 1600) acc.setLength(40);
      this.hopAcc.lerp(acc, Math.min(1, dt * 25));
    }
    this.hopFresh = false;
    this.hopAt.copy(at);
    this.hopVel.copy(vel);
    const down = new THREE.Vector3(0, -9.8, 0).sub(this.hopAcc).applyQuaternion(q.clone().invert()).divideScalar(s);
    this.hoppers[this.kind].update(dt, this.rounds, down);
  }

  private bars: Partial<Record<BarsKind, THREE.Group>> = {};
  private barsShake = 0;

  /**
   * On a bike, a BMX or a scooter: its handlebars below you, pointing the way the ride's going and
   * turned a little as you steer (heading: which way the ride points; steer: how far you're turning
   * it), with a shiver from the road the faster you go. kind null hides them.
   */
  handlebars(kind: BarsKind | null, camera: THREE.PerspectiveCamera, heading: number, steer: number, speed: number, dt: number) {
    for (const [k, m] of Object.entries(this.bars)) m.visible = k === kind;
    if (!kind) return;
    let g = this.bars[kind];
    if (!g) { g = this.bars[kind] = barsModel(kind); this.scene.add(g); }
    this.barsShake += dt * (20 + speed * 2);
    const shiver = Math.min(1, speed / 12) * 0.004;
    const up = kind === "scooter" ? -0.3 : kind === "bmx" ? -0.31 : -0.36;
    // down in front of you, in the ride's own direction rather than the way you look
    const sin = Math.sin(heading), cos = Math.cos(heading);
    const fx = 0, fz = -0.66;
    g.position.set(camera.position.x + fx * cos + fz * sin, camera.position.y + up + Math.sin(this.barsShake) * shiver, camera.position.z - fx * sin + fz * cos);
    g.rotation.set(0, heading + Math.max(-0.5, Math.min(0.5, steer)) * 0.6, Math.sin(this.barsShake * 0.7) * shiver * 2);
  }

  /** The left hand comes off the gun (or drops its fist) and brings the radio up. */
  private holdRadio(dt: number, camera: THREE.PerspectiveCamera, on: boolean, bob: number, bobAmt: number) {
    this.radio += ((on ? 1 : 0) - this.radio) * Math.min(1, dt * 12);
    if (this.radio < 0.01) this.radio = 0;
    const up = this.radio, free = up > 0.4;   // the hand has left the gun
    for (const m of Object.values(this.models)) { const h = m.getObjectByName("frontHand"); if (h) h.visible = !free; }
    this.fists[0].visible = !free;
    this.radioHand.visible = up > 0;
    if (!up) return;
    // up and in from the bottom left, turned towards your mouth; out of the way when aiming
    const p = new THREE.Vector3(-0.17 - this.aim * 0.08, -0.5 + up * (0.36 - this.aim * 0.08), -0.3);
    p.x += Math.sin(bob + 1) * 0.008 * bobAmt + this.sway.x * 0.6;
    p.y += Math.abs(Math.cos(bob)) * 0.008 * bobAmt + this.sway.y * 0.6;
    this.radioHand.position.copy(p).applyQuaternion(camera.quaternion).add(camera.position);
    this.radioHand.quaternion.copy(camera.quaternion);
    this.radioHand.rotateY(0.45);
    this.radioHand.rotateX(-0.2 - (1 - up) * 0.6);
    this.radioHand.rotateZ(-0.15);
  }
}

/**
 * Where a spot on something moving that a shot hit has got to now: a paintball keeps flying at it
 * and bursts there, so it lands on whoever it hit and not where they were when it was fired.
 */
export type Follow = (() => THREE.Vector3) & { obj?: THREE.Object3D };

/** Follow the spot p (in the scene, now) on obj, held in obj's own frame: it goes where obj goes, and turns, leans and falls with it. */
export function follow(obj: THREE.Object3D, p: THREE.Vector3): Follow {
  obj.updateWorldMatrix(true, false);
  const local = obj.worldToLocal(p.clone());
  return Object.assign(() => obj.localToWorld(local.clone()), { obj });
}

/** Tracers, paintballs, bullet impacts and hit puffs in the world. */
export class Effects {
  /** vel: flying (falling at g, 9 if not said); grow: swelling, m/s; peak: how solid it starts; then: called when it's gone; solid: doesn't fade. */
  /** chase: a spot on something moving to keep flying at. */
  private items: { obj: THREE.Object3D; life: number; max: number; vel?: THREE.Vector3; g?: number; grow?: number; peak?: number; then?: () => void; solid?: boolean; chase?: Follow; mat: THREE.Material & { opacity: number } }[] = [];
  private puffGeo = new THREE.IcosahedronGeometry(0.08, 0);
  private ballGeo = new THREE.IcosahedronGeometry(1, 1);
  private paintGeo = new THREE.SphereGeometry(0.035, 8, 6);
  private dropGeo = new THREE.SphereGeometry(0.04, 6, 4);

  constructor(private scene: THREE.Scene) {}

  /**
   * A paintball flying from one point to another at speed m/s, then arrive() when it gets there
   * (the splat). It flies straight: the shot has already been decided along that line. If it's
   * hit something moving (a car, a naughty boy, a cat, a gull, a player), chase is the spot on it
   * (see follow): the ball keeps heading for that spot as it goes, so it lands on them and not
   * where they were.
   */
  paintball(from: THREE.Vector3, to: THREE.Vector3, color: string, speed: number, arrive?: () => void, chase?: Follow) {
    const d = to.clone().sub(from), len = d.length(), life = Math.max(0.02, len / speed);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const m = new THREE.Mesh(this.paintGeo, mat);
    m.position.copy(from);
    this.scene.add(m);
    this.items.push({ obj: m, life, max: life, vel: d.divideScalar(life), g: 0, mat, then: arrive, solid: true, chase });
  }

  /** A burst of paint off whatever a paintball hit: drops of the colour flung out from it. */
  splash(at: THREE.Vector3, normal: THREE.Vector3, color: string, n = 8) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const m = new THREE.Mesh(this.dropGeo, mat);
      m.position.copy(at);
      m.scale.setScalar(0.4 + Math.random() * 0.6);
      const v = normal.clone().multiplyScalar(1.5 + Math.random() * 2).add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(3));
      this.scene.add(m);
      this.items.push({ obj: m, life: 0.4, max: 0.4, vel: v, g: 12, mat });
    }
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = "#ffe6a0", life = 0.07) {
    const g = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, fog: true });
    const line = new THREE.Line(g, mat);
    this.scene.add(line);
    this.items.push({ obj: line, life, max: life, mat });
  }

  impact(at: THREE.Vector3, normal: THREE.Vector3, color: string, n = 6) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const m = new THREE.Mesh(this.puffGeo, mat);
      m.position.copy(at);
      const v = normal.clone().multiplyScalar(2 + Math.random() * 2).add(new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(2.2));
      this.scene.add(m);
      this.items.push({ obj: m, life: 0.45, max: 0.45, vel: v, mat });
    }
  }

  /** A ball of fire or smoke at p, of radius r, lasting life seconds. */
  private ball(p: THREE.Vector3, r: number, color: string, life: number, vel: THREE.Vector3, g: number, grow: number, peak = 1) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: peak, depthWrite: false });
    const m = new THREE.Mesh(this.ballGeo, mat);
    m.position.copy(p);
    m.scale.setScalar(r);
    this.scene.add(m);
    this.items.push({ obj: m, life, max: life, vel, g, grow, peak, mat });
  }

  /** Something going up: a flash, a fireball rolling up into black smoke, and bits flying. */
  explosion(at: THREE.Vector3) {
    const jit = (k: number) => new THREE.Vector3((Math.random() - 0.5) * k, Math.random() * k * 0.5, (Math.random() - 0.5) * k);
    this.ball(at, 1.2, "#fff4c8", 0.25, new THREE.Vector3(), 0, 14);
    for (let k = 0; k < 7; k++) this.ball(at.clone().add(jit(2.5)), 0.8 + Math.random() * 0.6, k % 2 ? "#ff7a1a" : "#ffb030", 0.6 + Math.random() * 0.4, jit(5).setY(2 + Math.random() * 4), -3, 4);
    for (let k = 0; k < 8; k++) this.ball(at.clone().add(jit(3)).setY(at.y + 1 + Math.random() * 2), 0.9 + Math.random() * 0.5, k % 3 ? "#2e2b29" : "#4a4643", 2.5 + Math.random() * 1.5, jit(2).setY(2 + Math.random() * 2.5), 0, 1.4, 0.75);
    this.impact(at, new THREE.Vector3(0, 1.5, 0), "#ffc040", 12);
    this.impact(at, new THREE.Vector3(0, 2.5, 0), "#1c1b1a", 10);
  }

  /** A red mist hanging in the air for a moment where a headshot or a sniper round went in. */
  mist(at: THREE.Vector3, color: string) {
    this.ball(at, 0.22, color, 0.7, new THREE.Vector3(0, 0.25, 0), 0, 1.4, 0.65);
  }

  /** A puff of smoke off something burning (thick and dark while it's alight, a grey wisp after). */
  smoke(at: THREE.Vector3, thick: boolean) {
    const drift = new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.6 + Math.random(), (Math.random() - 0.5) * 0.6);
    this.ball(at, thick ? 0.5 : 0.3, thick ? "#2a2826" : "#6a6662", thick ? 2.4 : 1.8, drift, 0, thick ? 0.9 : 0.6, thick ? 0.7 : 0.35);
  }

  /** A puff of dust and a few falling bits of grit from a spot on a wall, spreading out along normal. */
  dust(at: THREE.Vector3, normal: THREE.Vector3) {
    for (let k = 0; k < 3; k++) {
      const v = normal.clone().multiplyScalar(0.4 + Math.random() * 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.5));
      this.ball(at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.6)), 0.25, "#c9bfa6", 1.3 + Math.random() * 0.6, v, 0, 0.7, 0.5);
    }
    this.impact(at, normal.clone().multiplyScalar(0.3).setY(-0.5), "#a79c82", 6);
  }

  update(dt: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.chase && it.vel) it.vel.copy(it.chase()).sub(it.obj.position).divideScalar(Math.max(dt, it.life));
      it.life -= dt;
      if (it.vel) { it.vel.y -= (it.g ?? 9) * dt; it.obj.position.addScaledVector(it.vel, dt); }
      if (it.grow) it.obj.scale.setScalar(it.obj.scale.x + it.grow * dt);
      if (!it.solid) it.mat.opacity = Math.max(0, (it.life / it.max) * (it.peak ?? 1));
      if (it.life <= 0) {
        it.then?.();
        this.scene.remove(it.obj);
        if (it.obj instanceof THREE.Line) it.obj.geometry.dispose();
        it.mat.dispose();
        this.items.splice(i, 1);
      }
    }
  }
}
