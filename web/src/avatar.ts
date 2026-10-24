// Other players: a person in a jacket of their own colour, with a face, smoothed between network
// updates, plus hitboxes. Each player moves themselves and sends where they are and where they're
// looking; we just draw that. Their head turns and tilts to look where their camera points, they
// hold their gun up along that line, and their legs walk, run, crouch and tuck up in a jump from how
// they're moving. Lying on their front (Z), they do tummy time like a baby: flat on a play mat,
// propped up on their forearms with their head up, a dummy in and a rattle in hand, their legs
// kicking away. What they wear (skin, hair or beanie, trousers, shoes) comes from their id, so
// everyone sees them dressed the same. Rosettes from treasure trails (trail.ts) are pinned on their
// jacket, and anything from their wardrobe (wardrobe.ts) is put on them, as they say in their hello.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { look } from "./gore";
import { nameLabel, talkIcon } from "./textures";
import { parseWear, wearGeometry } from "./wardrobe";
import { type Follow, follow } from "./weapon";
import { carriedLadder } from "./ladders";
import { angelGlow, angelWings, heavenlyGuitar } from "./angelwings";

export interface Snap { t: number; x: number; y: number; z: number; yaw: number; pitch: number; crouch: number; prone?: number }

const DELAY = 110; // ms behind real time, so there are always two snapshots to blend between
let talkTex: THREE.Texture | null = null;

// One material for every player: the colours are painted on the parts themselves, so each part of
// the body is a single mesh, which keeps the draw calls down on tablets.
const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const SKIN = ["#efcdb4", "#e6bd9f", "#d4a283", "#b57d5c", "#8d5a3b", "#5e3b26"];
const HAIR = ["#3b2a1d", "#6b4a2b", "#c9a45c", "#a0522d", "#1d1d20", "#2a1d14"];
const TROUSERS = ["#34466b", "#22262e", "#6e6450", "#4a4d52", "#2b3a5c", "#3d4a3a"];
const SHOES = ["#f4f4f2", "#1b1b1d", "#7a4a2a", "#c23b2e"];

// body measurements, standing: hips, shoulders and neck heights, and the lengths of the limbs
const HIP = 0.88, SHOULDER = 1.4, NECK = 1.47;
const THIGH = 0.44, SHIN = 0.4, UPPER_ARM = 0.3, FOREARM = 0.3;

export type Piece = [THREE.BufferGeometry, THREE.ColorRepresentation];
/** Several shapes painted their own colours and welded into one. */
export function part(pieces: Piece[]) {
  const geos = pieces.map(([g, c]) => {
    const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    return g;
  });
  const out = mergeGeometries(geos)!;
  for (const g of geos) g.dispose();
  return out;
}
export const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
export const ball = (r: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.SphereGeometry(r, 12, 9).scale(sx, sy, sz).translate(x, y, z);
/** A bit of a sphere: phi round from the left, theta down from the top. */
export const shell = (r: number, phi: number, phiLen: number, theta: number, y: number, z = 0) =>
  new THREE.SphereGeometry(r, 14, 8, phi, phiLen, 0, theta).translate(0, y, z);

const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Vector3(), _q = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);
/**
 * Bend an arm or a leg so its hand or ankle reaches target, the elbow or knee pointing towards
 * pole. Both halves hang down from their joint; upper sits at the shoulder or hip, lower at the
 * elbow or knee. Everything is in the frame of whatever the limb hangs from.
 */
function reach(upper: THREE.Object3D, lower: THREE.Object3D, a: number, b: number, target: THREE.Vector3, pole: THREE.Vector3) {
  _d.subVectors(target, upper.position);
  const dist = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, _d.length()));
  _d.normalize();
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-8) _p.set(0, 0, 1).addScaledVector(_d, -_d.z);
  _p.normalize();
  const cosA = (a * a + dist * dist - b * b) / (2 * a * dist), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _e.copy(_d).multiplyScalar(cosA).addScaledVector(_p, sinA);
  upper.quaternion.setFromUnitVectors(DOWN, _e);
  // from the elbow to the hand, turned into the upper arm's own frame
  _p.copy(_d).multiplyScalar(dist).addScaledVector(_e, -a).normalize().applyQuaternion(_q.copy(upper.quaternion).invert());
  lower.quaternion.setFromUnitVectors(DOWN, _p);
}

/** A number from 0 to 1 for each call, the same every time for the same seed. */
function rng(seed: string) {
  let s = 0;
  for (const ch of seed) s = (Math.imul(s, 31) + ch.charCodeAt(0)) >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// where the hands go, from the shoulders: on the gun's grip and under its barrel
const GRIP = new THREE.Vector3(0.1, -0.2, -0.27), FOREND = new THREE.Vector3(0.07, -0.13, -0.47);
const RIGHT_ELBOW = new THREE.Vector3(1, -1, 0.3), LEFT_ELBOW = new THREE.Vector3(-0.5, -1, 0);
const HOLD = new THREE.Vector3(0.25, -0.4, -0.18), BEHIND = new THREE.Vector3(0.2, -0.3, 1);
const KNEE = new THREE.Vector3(0, 0.2, -1), RADIO_ELBOW = new THREE.Vector3(-1, -0.5, 0.3);
const RADIO_AT = new THREE.Vector3(-0.1, 1.56 - HIP, -0.17);
const _t = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
// tummy time: how far the chest is propped up, and how far behind where they are their hips lie
const PROP = 0.45, LIE_BACK = 0.45;
const PRONE_ELBOW = new THREE.Vector3(0, -1, 0.5);
const MAT_COLOURS = ["#f6b6c8", "#a9d8f0", "#fbe38e", "#b8e3b0", "#d7c1f0"];

let rageTex: THREE.CanvasTexture | null = null;
/** A red glow round someone smoking one of Jamie's cigarettes (jamie.ts), size metres across. */
function rageGlow(size = 2.8): THREE.Sprite {
  if (!rageTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,120,80,0.9)"); r.addColorStop(0.35, "rgba(230,40,20,0.45)"); r.addColorStop(1, "rgba(200,10,0,0)");
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    rageTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: rageTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  s.scale.setScalar(size);
  return s;
}

/** The heavenly guitar, made once and shared by everyone flying with the wings. */
let axe: THREE.Group | null = null;

export class Avatar {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  /** Everything above the hips, which leans into a run. */
  private upper = new THREE.Group();
  private head = new THREE.Group();
  private eyes: THREE.Mesh;
  private mouth: THREE.Mesh;
  /** Turns up and down with where they're looking; the arms and gun hang from it. */
  private aim = new THREE.Group();
  private gun = new THREE.Group();
  private arms: [THREE.Group, THREE.Group][] = [];
  private legs: [THREE.Group, THREE.Group][] = [];
  private label: THREE.Sprite;
  private talkMark: THREE.Sprite;
  /** Talking, so show sound waves over their head, and move their mouth. */
  talking = false;
  /** On the radio, so it's held up to their face. */
  onRadio = false;
  private radio: THREE.Mesh;
  /** Tummy time: the play mat under them, the dummy in their mouth and the rattle in their hand. */
  private mat: THREE.Mesh;
  private dummy: THREE.Mesh;
  /** Rosettes pinned on the jacket, and which (a letter each: g, s or b). */
  private rosettes: THREE.Mesh | null = null;
  private rosetteKey = "";
  /** What they're wearing from their wardrobe, and the beanie or hair a hat goes on instead of. */
  private wear: THREE.Mesh[] = [];
  private wearKey = "";
  private beanie: THREE.Mesh | null = null;
  private hairTop: THREE.Mesh | null = null;
  private rattle!: THREE.Mesh;
  private wiggle = Math.random() * 10;
  private waveT = 0;
  /** At the wheel of a vehicle, which draws them itself: just the name tag, but still hittable. */
  seated = false;
  /** Show their name tag over their head (not on the characters page). */
  tagged = true;
  /** Carrying a gun (the streets). In the mines they carry something else, put in their hand by the mines game. */
  armed = true;
  /** Stood still on something that's moving (a narrowboat's back deck): feet planted, however fast it goes. */
  still = false;
  /** Waving: 1 the left hand, 2 the right, 3 both. */
  wave = 0;
  private snaps: Snap[] = [];
  alive = true;
  private deadT = 0;
  // how they're moving, worked out from where they've been drawn, for the legs
  private lastX = 0; private lastY = 0; private lastZ = 0;
  private vx = 0; private vy = 0; private vz = 0;
  private phase = 0;
  private air = 0;
  private kick = 0;
  private blink = 3;
  private talkT = 0;
  // smoothed pose, used for drawing and for hit tests
  x = 0; y = 0; z = 0; yaw = 0; pitch = 0; crouch = 0; prone = 0;

  constructor(name: string, colour: string, seed = name + colour) {
    const r = rng(seed), pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
    const col = new THREE.Color(colour);
    const dark = col.clone().multiplyScalar(0.5), trim = col.clone().lerp(new THREE.Color("#ffffff"), 0.55);
    const skin = pick(SKIN), hair = pick(HAIR), trousers = pick(TROUSERS), shoes = pick(SHOES);
    const beanie = r() < 0.45;
    const mesh = (g: THREE.BufferGeometry, shadow = true) => {
      const m = new THREE.Mesh(g, MAT);
      m.castShadow = shadow;
      return m;
    };

    // the jacket, in their own colour, over the top of their trousers
    const h = -HIP;
    const torso = mesh(part([
      [box(0.44, 0.56, 0.26, 0, 1.18 + h, 0), col],
      [box(0.46, 0.12, 0.27, 0, 1.4 + h, 0), col],
      [box(0.45, 0.05, 0.27, 0, 0.92 + h, 0), dark],
      [box(0.018, 0.5, 0.012, 0, 1.19 + h, -0.132), trim],
      [box(0.12, 0.08, 0.012, -0.12, 1.02 + h, -0.132), dark],
      [box(0.12, 0.08, 0.012, 0.12, 1.02 + h, -0.132), dark],
      [box(0.3, 0.13, 0.1, 0, 1.44 + h, 0.14), dark],
      [box(0.26, 0.06, 0.22, 0, 1.47 + h, -0.01), dark],
      [box(0.38, 0.16, 0.23, 0, 0.86 + h, 0), trousers],
      [new THREE.CylinderGeometry(0.06, 0.065, 0.12, 10).translate(0, 1.5 + h, 0), skin],
    ]));

    // the head turns from the neck: a face at the front, ears, and hair or a beanie on top
    const c = 0.15;   // the middle of the head, above the neck
    const headBits: Piece[] = [
      [ball(0.15, 0, c, 0), skin],
      [ball(0.035, -0.148, c, 0.005, 0.6, 1.1, 0.9), skin],
      [ball(0.035, 0.148, c, 0.005, 0.6, 1.1, 0.9), skin],
      [box(0.032, 0.05, 0.04, 0, c - 0.015, -0.152), new THREE.Color(skin).multiplyScalar(0.92)],
      [box(0.06, 0.016, 0.02, -0.058, c + 0.062, -0.133), hair],
      [box(0.06, 0.016, 0.02, 0.058, c + 0.062, -0.133), hair],
      [shell(0.157, 0, Math.PI, 0.7 * Math.PI, c, 0.004), hair],
    ];
    // the beanie comes off for a hat from the wardrobe, with their hair under it
    this.hairTop = mesh(part([[shell(0.159, 0, Math.PI * 2, 0.36 * Math.PI, c + 0.005, 0.006), hair]]));
    if (beanie) {
      this.beanie = mesh(part([
        [shell(0.166, 0, Math.PI * 2, 0.37 * Math.PI, c + 0.004, 0.004), dark],
        [new THREE.CylinderGeometry(0.157, 0.159, 0.045, 16).translate(0, c + 0.09, 0.004), col],
        [ball(0.04, 0, c + 0.19, 0.01), trim]]));
      this.hairTop.visible = false;
    }
    const head = mesh(part(headBits));
    this.eyes = mesh(part([
      [ball(0.025, -0.055, 0, -0.132, 1, 1.05, 0.7), "#f4f4f2"],
      [ball(0.025, 0.055, 0, -0.132, 1, 1.05, 0.7), "#f4f4f2"],
      [ball(0.014, -0.055, 0, -0.144), "#2a2220"],
      [ball(0.014, 0.055, 0, -0.144), "#2a2220"],
    ]), false);
    this.eyes.position.y = c + 0.02;
    this.mouth = mesh(part([[box(0.06, 0.014, 0.012, 0, 0, 0), "#6b2a2a"]]), false);
    this.mouth.position.set(0, c - 0.07, -0.133);
    this.dummy = mesh(part([
      [ball(0.04, 0, 0, 0, 1.2, 0.85, 0.35), "#8ecbe8"],
      [ball(0.016, 0, 0, 0.012), "#f4f4f2"],
      [new THREE.TorusGeometry(0.026, 0.007, 6, 14).translate(0, -0.012, -0.022), "#f4f4f2"],
    ]), false);
    this.dummy.position.set(0, c - 0.068, -0.152);
    this.dummy.visible = false;
    this.head.add(head, this.hairTop, this.eyes, this.mouth, this.dummy);
    if (this.beanie) this.head.add(this.beanie);
    this.head.position.y = NECK - HIP;

    // arms: an upper arm from the shoulder, and a forearm with the hand on the end
    for (const side of [-1, 1]) {
      const up = new THREE.Group(), low = new THREE.Group();
      up.add(mesh(part([[box(0.12, 0.3, 0.13, 0, -0.14, 0), col], [ball(0.075, 0, -0.01, 0), col]])));
      low.add(mesh(part([
        [box(0.11, 0.24, 0.12, 0, -0.12, 0), col],
        [box(0.115, 0.04, 0.125, 0, -0.24, 0), dark],
        [ball(0.058, 0, -0.3, 0, 0.9, 1.1, 0.9), skin],
      ])));
      up.position.x = side * 0.27;
      low.position.y = -UPPER_ARM;
      up.add(low);
      this.aim.add(up);
      if (side === 1) {
        // the rattle, in the right hand for tummy time
        this.rattle = mesh(part([
          [new THREE.CylinderGeometry(0.014, 0.014, 0.16, 8).translate(0, -0.36, 0), "#fbe38e"],
          [ball(0.06, 0, -0.47, 0), "#f6b6c8"],
          [new THREE.TorusGeometry(0.062, 0.01, 6, 16).rotateY(Math.PI / 2).translate(0, -0.47, 0), "#a9d8f0"],
        ]), false);
        this.rattle.visible = false;
        low.add(this.rattle);
      }
      this.arms.push([up, low]);
    }
    // a paintball marker in their own colour, with its hopper and air tank, or (with blood on) the rifle
    this.gun.add(look(mesh(part([
      [box(0.07, 0.09, 0.36, 0.1, -0.11, -0.42), col],
      [box(0.03, 0.03, 0.34, 0.1, -0.1, -0.76), "#1b1d1f"],
      [ball(0.08, 0.1, 0.0, -0.44, 1, 0.85, 1.4), "#3a3f46"],
      [box(0.03, 0.05, 0.03, 0.1, -0.05, -0.44), "#1b1d1f"],
      [box(0.08, 0.08, 0.26, 0.1, -0.13, -0.12), "#c9cdd2"],
      [box(0.045, 0.1, 0.05, 0.1, -0.19, -0.29), "#1b1d1f"],
    ]), false), "paint"));
    this.gun.add(look(mesh(part([
      [box(0.07, 0.09, 0.46, 0.1, -0.11, -0.46), "#25282b"],
      [box(0.035, 0.035, 0.24, 0.1, -0.09, -0.8), "#1b1d1f"],
      [box(0.06, 0.11, 0.2, 0.1, -0.14, -0.14), "#3a3d40"],
      [box(0.05, 0.15, 0.07, 0.1, -0.2, -0.44), "#1b1d1f"],
      [box(0.045, 0.1, 0.05, 0.1, -0.19, -0.29), "#3a3d40"],
    ]), false), "real"));
    this.aim.add(this.gun);
    this.aim.position.y = SHOULDER - HIP;
    this.aim.rotation.order = "YXZ";

    // the radio, held up by their mouth while they're on it (the left hand goes up to it)
    this.radio = mesh(part([
      [box(0.07, 0.15, 0.04), "#26292c"],
      [box(0.015, 0.1, 0.015, 0.02, 0.12, 0), "#151719"],
    ]), false);
    this.radio.position.copy(RADIO_AT);
    this.radio.rotation.set(-0.3, -0.4, 0);
    this.radio.visible = false;

    this.upper.add(torso, this.head, this.aim, this.radio);
    this.upper.position.y = HIP;

    // legs: a thigh from the hip, and a shin with the shoe on the end
    for (let i = 0; i < 2; i++) {
      const up = new THREE.Group(), low = new THREE.Group();
      up.add(mesh(part([[box(0.16, 0.44, 0.18, 0, -0.22, 0), trousers]])));
      low.add(mesh(part([
        [box(0.15, 0.36, 0.17, 0, -0.18, 0), trousers],
        [box(0.15, 0.09, 0.28, 0, -0.42, -0.05), shoes],
        [box(0.155, 0.025, 0.285, 0, -0.46, -0.05), "#2a2a2a"],
      ])));
      low.position.y = -THIGH;
      up.add(low);
      this.body.add(up);
      this.legs.push([up, low]);
    }
    this.body.add(this.upper);
    this.body.rotation.order = "YXZ";   // turn first, so falling over goes the way they face

    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameLabel(name, colour), depthTest: false, transparent: true }));
    this.label.scale.set(1.6, 0.4, 1);
    this.label.position.y = 2.15;
    this.label.renderOrder = 10;
    this.talkMark = new THREE.Sprite(new THREE.SpriteMaterial({ map: (talkTex ??= talkIcon()), depthTest: false, transparent: true }));
    this.talkMark.scale.set(0.4, 0.4, 1);
    this.talkMark.position.y = 2.55;
    this.talkMark.renderOrder = 10;
    // the play mat, a patchwork of soft squares with a border, which they lie on for tummy time
    const squares: Piece[] = [[box(1.3, 0.02, 2.1, 0, 0, 0), "#f4f0e6"]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++)
      squares.push([box(0.38, 0.03, 0.38, (i - 1) * 0.4, 0.002, (j - 2) * 0.4), MAT_COLOURS[(i * 2 + j) % MAT_COLOURS.length]]);
    this.mat = mesh(part(squares), false);
    this.mat.receiveShadow = true;
    this.mat.visible = false;
    this.root.add(this.body, this.label, this.talkMark, this.mat);
  }

  setName(name: string, colour: string) {
    (this.label.material.map as THREE.Texture).dispose();
    this.label.material.map = nameLabel(name, colour);
  }

  /** Pin on their treasure-trail rosettes: a letter each, g, s or b, at most three. */
  setRosettes(key: string) {
    key = key.replace(/[^gsb]/g, "").slice(0, 3);
    if (key === this.rosetteKey) return;
    this.rosetteKey = key;
    if (this.rosettes) { this.upper.remove(this.rosettes); this.rosettes.geometry.dispose(); this.rosettes = null; }
    if (!key) return;
    const pieces: Piece[] = [];
    [...key].forEach((m, k) => {
      const col = m === "g" ? "#e8b923" : m === "s" ? "#c9ced6" : "#b8743a", x = 0.13 - k * 0.075, y = 1.3 - HIP;
      const disc = (r: number, z: number) => new THREE.CylinderGeometry(r, r, 0.01, 12).rotateX(Math.PI / 2).translate(x, y, z);
      pieces.push([disc(0.034, -0.136), col], [disc(0.018, -0.142), "#f4ecd4"],
        [box(0.016, 0.06, 0.006, x - 0.012, y - 0.045, -0.134), col], [box(0.016, 0.06, 0.006, x + 0.012, y - 0.045, -0.134), col]);
    });
    const m = new THREE.Mesh(part(pieces), MAT);
    this.upper.add(m);
    this.rosettes = m;
  }

  /** A ladder over their shoulder (ladders.ts), or not. */
  setLadder(on: boolean) {
    if (on === !!this.ladder) return;
    if (on) this.body.add(this.ladder = carriedLadder());
    else { this.body.remove(this.ladder!); this.ladder = null; }
  }
  private ladder: THREE.Mesh | null = null;

  /** The angel's wings on their back (wings.ts), or not, and glowing gold as they fly. */
  setWings(on: boolean, glow: boolean) {
    if (on && !this.wings) {
      this.wings = angelWings(0.7);
      this.wings.position.set(0, SHOULDER - 0.05, 0.16);
      this.body.add(this.wings);
      this.glow = angelGlow(3.2);
      this.glow.position.y = 1.0;
      this.root.add(this.glow);
      // the heavenly guitar in their hands instead of their gun, held right-handed: the neck up to their left
      if (!axe) axe = heavenlyGuitar();
      this.axe = new THREE.Group();
      const held = axe.clone();
      held.position.set(0.04, -0.32, -0.26);
      held.rotation.set(0.15, Math.PI, -0.95, "YXZ");
      held.scale.setScalar(0.8);
      this.axe.add(held);
      this.aim.add(this.axe);
    } else if (!on && this.wings) {
      this.body.remove(this.wings); this.root.remove(this.glow!); this.aim.remove(this.axe!);
      this.wings = null; this.glow = null; this.axe = null;
    }
    if (this.glow) this.glow.visible = glow;
  }
  private wings: THREE.Group | null = null;
  private glow: THREE.Sprite | null = null;

  /** Smoking one of Jamie's cigarettes (jamie.ts), or not: a red glow round them while it lasts. */
  setRage(on: boolean) {
    if (on && !this.rage) { this.rage = rageGlow(2.6); this.rage.position.y = 1.0; this.root.add(this.rage); }
    else if (!on && this.rage) { this.root.remove(this.rage); this.rage.material.dispose(); this.rage = null; }
  }
  private rage: THREE.Sprite | null = null;
  private axe: THREE.Group | null = null;

  /** Put on what their wardrobe says (wardrobe.ts): ids, comma separated, one per slot. */
  setWear(code: string) {
    const items = parseWear(code), key = items.map((w) => w.id).join(",");
    if (key === this.wearKey) return;
    this.wearKey = key;
    for (const m of this.wear) { m.parent?.remove(m); m.geometry.dispose(); }
    this.wear = [];
    let hat = false;
    for (const w of items) {
      const g = wearGeometry(w.id);
      if (!g) continue;
      const m = new THREE.Mesh(g.geo, MAT);
      m.castShadow = true;
      m.name = w.id;
      (g.on === "head" ? this.head : this.upper).add(m);
      this.wear.push(m);
      if (w.slot === "head") hat = true;
    }
    if (this.beanie) { this.beanie.visible = !hat; this.hairTop!.visible = hat; }
  }

  /** The seagull on their head looks about, and the owl on their shoulder turns a little. t: seconds. */
  animateWear(t: number) {
    for (const m of this.wear) {
      if (m.name === "gull") m.rotation.y = Math.sin(t * 0.7 + this.wiggle) * 0.35 + Math.sin(t * 2.9 + this.wiggle) * 0.06;
      else if (m.name === "owl") m.rotation.y = Math.sin(t * 0.4 + this.wiggle) * 0.05;
    }
  }

  /** Stood still for the wardrobe's picture of them: no gun, no name tag, arms down. */
  preview() {
    this.gun.visible = false;
    this.label.visible = this.talkMark.visible = false;
    for (const [up, low] of this.arms) { up.rotation.set(0, 0, 0); low.rotation.set(0, 0, 0); }
    this.arms.forEach(([up], k) => { up.rotation.z = k === 0 ? -0.12 : 0.12; });
  }

  /** Where what they're riding is (a cable car cabin), when their snapshots are measured from it rather
   *  than from the map: set every frame by the game. Their walking is then worked out from how they move
   *  inside it, so they stand still when they're stood still. */
  base: { x: number; y: number; z: number } | null = null;
  private ix = 0; private iy = 0; private iz = 0;     // where they are, before adding the base

  push(s: Snap) {
    if (!this.snaps.length) {
      const b = this.base ?? { x: 0, y: 0, z: 0 };
      Object.assign(this, { x: s.x + b.x, y: s.y + b.y, z: s.z + b.z, yaw: s.yaw, pitch: s.pitch, crouch: s.crouch, prone: s.prone ?? 0 });
      this.ix = this.lastX = s.x; this.iy = this.lastY = s.y; this.iz = this.lastZ = s.z;
    }
    this.snaps.push(s);
    if (this.snaps.length > 30) this.snaps.shift();
  }

  /** Draw them here (the back deck of the boat they're steering) instead of where their messages put them. */
  pin(x: number, y: number, z: number) {
    this.x = x; this.y = y; this.z = z;
    this.root.position.set(x, y, z);
  }

  /** Put them straight here, with no snapshots to blend: your own steerer, seen from the chase camera. */
  hold(x: number, y: number, z: number, yaw: number, pitch: number, crouch: number) {
    this.snaps = [];
    this.ix = x; this.iy = y; this.iz = z;
    Object.assign(this, { yaw, pitch, crouch, prone: 0 });
  }

  /** Jump straight to a position (respawns), dropping old snapshots. */
  teleport() { this.snaps = this.snaps.slice(-1); }

  /** What they're riding has moved since update(): move them with it, so they're not a frame behind. */
  rebase(b: { x: number; y: number; z: number }) {
    this.base = b;
    this.x = this.ix + b.x; this.y = this.iy + b.y; this.z = this.iz + b.z;
    this.root.position.set(this.x, this.y, this.z);
  }

  /** Forget every snapshot: they've got in or out of something, and the next is measured differently. */
  restart() { this.snaps = []; }

  /** They've fired: the gun kicks back. */
  fire() { this.kick = 1; }

  update(now: number, dt: number) {
    if (this.wear.length) this.animateWear(now / 1000);
    if (this.wings) {
      // beating while they glow, folded back when they're not
      const flap = this.glow?.visible ? 0.3 + Math.sin(now / 160) * 0.45 : -0.6;
      this.wings.children.forEach((w, k) => { w.rotation.z = (k ? 1 : -1) * flap; });
      if (this.glow?.visible) this.glow.scale.setScalar(3.2 + Math.sin(now / 200) * 0.4);
    }
    const t = now - DELAY, S = this.snaps;
    if (S.length) {
      let a = S[0], b = S[S.length - 1];
      for (let i = 0; i < S.length - 1; i++) if (S[i].t <= t && S[i + 1].t >= t) { a = S[i]; b = S[i + 1]; break; }
      if (t >= b.t) a = b;
      const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
      const far = Math.hypot(b.x - a.x, b.z - a.z) > 8;   // a respawn: don't slide across the map
      const k = far ? 1 : f;
      this.ix = a.x + (b.x - a.x) * k; this.iy = a.y + (b.y - a.y) * k; this.iz = a.z + (b.z - a.z) * k;
      let dy = b.yaw - a.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw = a.yaw + dy * k;
      this.pitch = a.pitch + (b.pitch - a.pitch) * k;
      this.crouch = a.crouch + (b.crouch - a.crouch) * k;
      this.prone = (a.prone ?? 0) + ((b.prone ?? 0) - (a.prone ?? 0)) * k;
    }
    const B = this.base;
    this.x = this.ix + (B?.x ?? 0); this.y = this.iy + (B?.y ?? 0); this.z = this.iz + (B?.z ?? 0);
    this.root.position.set(this.x, this.y, this.z);
    this.body.rotation.y = this.yaw;
    // lying down for tummy time tips the whole body onto its front, hips a little behind where they are
    const pr = this.seated ? 0 : this.prone, lie = Math.PI / 2 * pr;
    this.body.position.set(Math.sin(this.yaw) * (HIP + LIE_BACK) * pr, 0.13 * pr, Math.cos(this.yaw) * (HIP + LIE_BACK) * pr);
    if (this.alive) {
      this.deadT = 0;
      this.body.rotation.x = -lie;
      this.root.visible = true;
    } else {
      this.deadT += dt;
      this.body.rotation.x = -Math.max(lie, Math.min(Math.PI / 2, this.deadT * 5));
      this.root.visible = this.deadT < 2.5;
    }
    this.mat.visible = pr > 0.05 && this.alive;
    this.mat.scale.setScalar(Math.max(0.05, pr));
    this.mat.rotation.y = this.yaw;
    this.mat.position.set(Math.sin(this.yaw) * 0.45 * pr, 0.012, Math.cos(this.yaw) * 0.45 * pr);
    this.label.position.y = 2.15 - 1.3 * pr;
    this.talkMark.position.y = 2.55 - 1.3 * pr;
    this.dummy.visible = this.rattle.visible = pr > 0.5;
    this.body.visible = !this.seated || !this.alive;
    this.label.visible = this.alive && this.tagged;
    this.talkMark.visible = this.talking && this.root.visible;
    this.radio.visible = this.onRadio && this.alive;
    this.gun.visible = this.armed && pr <= 0.5 && !this.axe && !(this.wave & 2);
    if (dt > 0) this.animate(dt);
  }

  /** Walk, run, crouch and jump from how they're moving; look and aim where they're looking. */
  private animate(dt: number) {
    // how fast they're going, smoothed, ignoring jumps across the map
    const rx = (this.ix - this.lastX) / dt, ry = (this.iy - this.lastY) / dt, rz = (this.iz - this.lastZ) / dt;
    this.lastX = this.ix; this.lastY = this.iy; this.lastZ = this.iz;
    const ease = Math.min(1, dt * 10);
    if (this.still) { this.vx = this.vy = this.vz = 0; }
    else if (Math.hypot(rx, rz) < 20 && Math.abs(ry) < 30) {
      this.vx += (rx - this.vx) * ease; this.vy += (ry - this.vy) * ease; this.vz += (rz - this.vz) * ease;
    }
    if (!this.alive) return;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    // their movement turned into their own frame: x to their right, z behind them
    const lx = this.vx * cy - this.vz * sy, lz = this.vx * sy + this.vz * cy;
    const speed = Math.hypot(lx, lz), run = Math.min(1, speed / 6);
    const stride = Math.min(0.4, Math.max(0.12, speed * 0.085)), amp = stride * Math.min(1, speed / 1.2);
    this.phase += dt * speed / stride;
    // off the ground: going up or down faster than walking a slope
    this.air += ((Math.abs(this.vy) > 2 ? 1 : 0) - this.air) * Math.min(1, dt * 8);
    const crouch = this.crouch, drop = 0.535 * crouch;   // the same as the hitboxes
    const bob = -Math.abs(Math.sin(this.phase)) * 0.04 * run * (1 - this.air);
    const hipY = HIP - drop + bob;
    const ux = speed > 0.01 ? lx / speed : 0, uz = speed > 0.01 ? lz / speed : 0;
    // tummy time: the legs kick, faster when they're crawling, and the head wobbles
    const pr = this.seated ? 0 : this.prone;
    this.wiggle += dt * (5 + speed * 6);
    this.legs.forEach(([up, low], i) => {
      const side = i ? 1 : -1, ph = this.phase + (i ? Math.PI : 0);
      const along = Math.sin(ph) * amp * (1 - this.air);
      const lift = Math.max(0, Math.cos(ph)) * 0.16 * Math.min(1, speed / 2) * (1 - this.air) + this.air * (i ? 0.3 : 0.18);
      up.position.set(side * 0.1, hipY, 0);
      _t.set(side * 0.11 + ux * along, 0.06 + lift, uz * along + crouch * 0.05 + this.air * (i ? -0.12 : 0.1));
      if (pr > 0) {
        // lying on the front the thighs rest on the mat and the shins kick up behind (up is +z here)
        const k = 1 + 0.6 * Math.sin(this.wiggle + i * Math.PI);
        _t.lerp(_a.set(side * 0.13, hipY - THIGH - SHIN * 0.97 * Math.cos(k), SHIN * 0.97 * Math.sin(k)), pr);
      }
      reach(up, low, THIGH, SHIN, _t, KNEE);
    });
    // lean into a run, and a little with where they're looking
    const look = Math.max(-1.3, Math.min(1.3, this.pitch));
    this.upper.position.y = hipY;
    this.upper.rotation.x = (-0.14 * run - crouch * 0.12 + look * 0.12) * (1 - pr) + (PROP + Math.sin(this.wiggle * 0.5) * 0.03) * pr;
    const lean = this.upper.rotation.x;
    // the head looks where they're looking, whichever way up the body is, and a baby's head is big
    this.head.rotation.x = Math.max(-0.8 + 0.4 * pr, Math.min(0.8, this.pitch)) - lean + Math.PI / 2 * pr;
    this.head.rotation.z = Math.sin(this.wiggle * 0.37) * 0.1 * pr;
    this.head.scale.setScalar(1 + 0.3 * pr);
    this.kick = Math.max(0, this.kick - dt * 8);
    // lying down, the arms' frame is kept level so the forearms can rest flat on the mat
    this.aim.rotation.x = (this.armed ? look + this.kick * 0.12 : 0) * (1 - pr) - lean + Math.PI / 2 * pr;
    this.aim.position.z = this.kick * 0.04;
    const [[ru, rl], [lu, ll]] = [this.arms[1], this.arms[0]];
    // shoulder height above the mat when propped up, for where the forearms rest
    const sh = 0.13 + (SHOULDER - HIP) * Math.sin(PROP);
    const arm = (up: THREE.Object3D, low: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3, right: boolean) => {
      if (pr <= 0) return reach(up, low, UPPER_ARM, FOREARM, target, pole);
      // forearms flat on the mat; the right hand up a little, shaking the rattle
      _a.set(right ? 0.2 : -0.22, right ? 0.13 - sh + Math.sin(this.wiggle * 3) * 0.04 : 0.06 - sh, right ? -0.3 : -0.32);
      _a.lerp(_b.copy(target), 1 - pr);
      _b.copy(PRONE_ELBOW).setX(right ? 0.3 : -0.3).lerp(pole, 1 - pr);
      reach(up, low, UPPER_ARM, FOREARM, _a, _b);
    };
    if (this.armed) arm(ru, rl, GRIP, RIGHT_ELBOW, true);
    else arm(ru, rl, _t.copy(HOLD).setY(HOLD.y + Math.sin(this.phase) * 0.02 * run), BEHIND, true);
    if (this.onRadio) {
      // the radio's place on the body, turned into the frame the arms hang from
      _t.copy(RADIO_AT).add(_d.set(0, -0.07, 0.02)).sub(this.aim.position).applyAxisAngle(_e.set(1, 0, 0), -this.aim.rotation.x);
      arm(lu, ll, _t, RADIO_ELBOW, false);
    } else if (this.armed) arm(lu, ll, FOREND, LEFT_ELBOW, false);
    else arm(lu, ll, _t.set(-0.29, -0.56, Math.sin(this.phase) * 0.3 * Math.min(1, speed / 2)), BEHIND, false);
    // a hand up over their head, waving side to side
    if (this.wave && pr <= 0) {
      this.waveT += dt;
      const sway = Math.sin(this.waveT * 11) * 0.13;
      if (this.wave & 1) reach(lu, ll, UPPER_ARM, FOREARM, _t.set(-0.42 + sway, 0.4, -0.1), _a.set(-1, -0.3, 0.3));
      if (this.wave & 2) reach(ru, rl, UPPER_ARM, FOREARM, _t.set(0.42 - sway, 0.4, -0.1), _a.set(1, -0.3, 0.3));
    } else this.waveT = 0;
    // a blink every few seconds, and a moving mouth while they talk
    this.blink -= dt;
    if (this.blink < -0.12) this.blink = 2 + Math.random() * 4;
    this.eyes.scale.y = this.blink < 0 ? 0.15 : 1;
    this.talkT += dt;
    this.mouth.scale.y = this.talking ? 1 + Math.abs(Math.sin(this.talkT * 17) * Math.sin(this.talkT * 5.3)) * 3 : 1;
  }

  /**
   * Ray against this player's hitboxes (vertical cylinder for the body, sphere for the head).
   * Returns the distance and whether the head was hit, or null.
   */
  hit(o: THREE.Vector3, d: THREE.Vector3): { dist: number; head: boolean } | null {
    if (!this.alive) return null;
    if (this.prone > 0.5 && !this.seated) return this.hitLying(o, d);
    return hitFigure(o, d, this.x, this.y, this.z, 1 - this.crouch * 0.33);
  }

  /** The spot on this player at p (where a shot hit them), wherever they go with it. */
  follow(p: THREE.Vector3): Follow { return follow(this.body, p); }

  /** Lying on their front: a ball for the (big) head, and three for the chest, hips and legs along the mat. */
  private hitLying(o: THREE.Vector3, d: THREE.Vector3): { dist: number; head: boolean } | null {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    let best: { dist: number; head: boolean } | null = null;
    for (const [along, up, r, head] of [[0.08, 0.58, 0.26, true], [-0.18, 0.25, 0.26, false], [-0.45, 0.15, 0.25, false], [-0.95, 0.15, 0.22, false]] as const) {
      const t = hitBall(o, d, this.x + fx * along, this.y + up, this.z + fz * along, r);
      if (t !== null && (!best || t < best.dist)) best = { dist: t, head };
    }
    return best;
  }
}

/** Distance along unit vector d from o to a ball at (x, y, z), or null if it misses. */
function hitBall(o: THREE.Vector3, d: THREE.Vector3, x: number, y: number, z: number, r: number) {
  const ox = o.x - x, oy = o.y - y, oz = o.z - z;
  const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}

const _posedQ = new THREE.Quaternion(), _posedO = new THREE.Vector3(), _posedD = new THREE.Vector3();

/**
 * hitFigure for a figure as drawn, with its feet at (x, y, z) and body the part of it that turns,
 * leans into a run, bobs and falls: the shot is turned into the body's own frame first, so a shot
 * at a running figure's head hits his head where it's drawn, leant forward, not where it'd be if
 * he stood up straight.
 */
export function hitPosed(o: THREE.Vector3, d: THREE.Vector3, body: THREE.Object3D, x: number, y: number, z: number, s = 1) {
  _posedQ.copy(body.quaternion).invert();
  _posedO.set(o.x - x - body.position.x, o.y - y - body.position.y, o.z - z - body.position.z).applyQuaternion(_posedQ);
  _posedD.copy(d).applyQuaternion(_posedQ);
  return hitFigure(_posedO, _posedD, 0, 0, 0, s);
}

/**
 * Ray from o along unit vector d against a standing figure with its feet at (x, y, z), squashed
 * to scale s when crouching: a vertical cylinder for the body and a sphere for the head.
 */
export function hitFigure(o: THREE.Vector3, d: THREE.Vector3, x: number, y: number, z: number, s = 1): { dist: number; head: boolean } | null {
  const hy = y + 1.62 * s, hr = 0.22;
  let best: { dist: number; head: boolean } | null = null;
  // head sphere
  const ox = o.x - x, oy = o.y - hy, oz = o.z - z;
  const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - hr * hr, disc = b * b - c;
  if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0) best = { dist: t, head: true }; }
  // body cylinder
  const r = 0.36, y0 = y, y1 = y + 1.45 * s;
  const a2 = d.x * d.x + d.z * d.z;
  if (a2 > 1e-9) {
    const fx = o.x - x, fz = o.z - z;
    const b2 = fx * d.x + fz * d.z, c2 = fx * fx + fz * fz - r * r, disc2 = b2 * b2 - a2 * c2;
    if (disc2 >= 0) {
      for (const t of [(-b2 - Math.sqrt(disc2)) / a2, (-b2 + Math.sqrt(disc2)) / a2]) {
        const yy = o.y + d.y * t;
        if (t > 0 && yy >= y0 && yy <= y1) { if (!best || t < best.dist) best = { dist: t, head: false }; break; }
      }
    }
  }
  return best;
}

export const COLOURS = ["#e8553f", "#3f9be8", "#f2b134", "#5fc46a", "#b06be0", "#ef7fb4", "#3fd0c9", "#f08a2e"];
export function colourFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLOURS[h % COLOURS.length];
}
