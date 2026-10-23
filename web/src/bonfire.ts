// Get Wood: Kingswood's bonfire, up on Lansdown. There's a tarmac court on the north side of
// Fonthill Road, just along from College Road, with the woods climbing the hill behind it. Bundles
// of firewood lie about in the woods (some by the path that runs up through them, the rest
// scattered among the trees): pick one up with E, carry it down to the court and walk up to the
// pile, and it goes on. It takes NEED bundles to build the bonfire, and everyone in the game builds
// the same one, together.
//
// There's no timer: the day just goes by. Once the bonfire's built, the next time night falls (at
// once, if it's built after dark) a crowd in lab coats walks over from Westwood with sparklers. The
// first one there lights the pile; once they're all round it, they bend down one at a time to light
// rockets just outside the ring, all night. The fire and each burst light up the court and the trees
// round about (the fire's own light, always in the scene and dark till then, and the flash each
// burst makes, flash.ts). At first light it's burnt out,
// leaving a ring of ash, and a new pile is begun. If it isn't finished by nightfall nothing is lost:
// what's on the pile stays there for the next day. The debug panel's "Bonfire night" (F3, N) builds
// it and moves the clock on to dark.
//
// While there's wood to fetch, a pair of prefects in suits picks up anyone who comes near, follows
// them about and hounds them to hurry up and fetch more. Prefects don't carry wood.
//
// The court is levelled, and the trees and shrubs the map put on it are cleared away, as each
// square of Bath loads (clearCourt, called from tiles.ts): the map files are left as they are.
//
// Who decides what: the host keeps the pile (how many bundles are on it, whether it's burning),
// which bundles in the woods have been taken, and who's carrying one. Picking one up and putting
// one on the pile are asks to the host ("wdq"), which sends everyone the lot ("wd") when anything
// changes, every few seconds and to anyone who joins. Each player's machine keeps its own copy of
// the pile too (localStorage), so a pile left half-built is still there when you come back, and a
// host takes up whatever it last saw. Everything else is just for show, and each machine does it
// for itself: where the bundles lie (worked out the same way by everyone from the map), the
// prefects (who follow every player near the court on everyone's screen, from where they're
// standing), the lab coats, the fire and the fireworks (lit when the host says it's burning).
import * as THREE from "three";
import * as SFX from "./audio";
import { award } from "./trophies";
import { missionActive, missionClear, missionEnd, missionProgress, missionStart } from "./missionscreens";
import { nightNow, timeOfDay } from "./daylight";
import { model, type Part } from "./furniture";
import type { GameMap, MapData } from "./map";
import { speechBubble } from "./naughtyboys";
import type { Flash } from "./flash";
import * as Posh from "./posh";
import { hash, rng, shuffled } from "./quests";

/** Bundles it takes to build the bonfire. */
export const NEED = 25;
const FIRE = "#ff9a3c";
/** The middle of the court: longitude and latitude. */
const COURT: [number, number] = [-2.3734979, 51.3997079];
/** The level the court is laid at, metres above sea level. */
const LEVEL = 193.2;
const FLAT = { x: 11, y: 9.5 };        // the map's ground within this of the middle (east, north) is levelled
const CLEAR = { x: 15, y: 13.5 };      // and nothing small is left standing within this
const PAD = { x: 19.8, y: 15.8 };      // the tarmac, drawn over the levelled ground
// the woods behind it, from the court's middle, metres east and north
const WOODS = { x0: -91, x1: 129, y0: 22, y1: 160 };
const ON_PATH = 14, IN_WOODS = 28;     // bundles lying by the path, and scattered in the woods
const RESPAWN = 300;                   // seconds before a bundle that's been taken turns up again
const REACH = 2.3;                     // how close you have to be to pick one up
const DROP = 4.5;                      // and to the pile to put it on
const ZONE = 230;                      // the prefects pick you up this close to the court
const SEND_EVERY = 5;
const LIT = 0.6, OUT = 0.2;            // how dark it is (daylight.ts) when it's lit, and when it's out by morning
const KEY = "cd-bonfire";
const PREFECT_VOICES = [{ voice: 2, pitch: 1.15, rate: 1.15 }, { voice: 5, pitch: 0.85, rate: 1.1 }];

// Bonfire night's choreography, in seconds from when it's lit (the clock each machine keeps for
// itself from when it heard). The lab coats come out of Westwood's steps one after another and
// along Fonthill Road (WAY: metres east and north of the court's middle) to a ring round the pile.
// The first goes right up to the pile and lights it, then steps back into the ring; once they're
// all round it the rockets start, each one lit by one of them.
const COATS = 14, RING = 6.6, EDGE = 2.4, WALK = 2.0, GAP = 1.1;
const WAY = [[121, -24.5], [122, -36.5], [101, -37.5], [29, -24.5], [1, -16]];
const WAY_LEN = WAY.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - WAY[i][0], q[1] - WAY[i][1]), 0);
/** Lab coat k's place round the fire, r from its middle: metres east and north. */
const slot = (k: number, r = RING): [number, number] => { const a = (k / COATS) * Math.PI * 2 + 0.2; return [Math.cos(a) * r, Math.sin(a) * r]; };
/** When lab coat k gets to its place r from the middle. */
const arrive = (k: number, r = RING) => { const [ex, ny] = slot(k, r), last = WAY[WAY.length - 1]; return k * GAP + (WAY_LEN + Math.hypot(ex - last[0], ny - last[1])) / WALK; };
const LIGHT_AT = arrive(0, EDGE) + 1.5;          // the first one there lights the pile
const BACK_AT = LIGHT_AT + 2.5;                  // and goes back to the ring
const ALL_IN = Math.max(BACK_AT + (RING - EDGE) / WALK, ...Array.from({ length: COATS }, (_, k) => arrive(k))) + 3;   // then the first rocket
const FIRE_LIGHT = 140, FLASH = 650;             // how bright the fire's light is, and a firework's flash
const CHAR = new THREE.Color("#2a2420"), EMBER = new THREE.Color("#ffa040");

/** Where lab coat k is T seconds after the bonfire's lit (metres east and north of the court's
 *  middle) and whether they're on the move, or null if they're still indoors. */
function coatAt(k: number, T: number): { ex: number; ny: number; walking: boolean } | null {
  let s = (T - k * GAP) * WALK;
  if (s <= 0) return null;
  for (let i = 0; i + 1 < WAY.length; i++) {
    const a = WAY[i], b = WAY[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s < l) return { ex: a[0] + ((b[0] - a[0]) * s) / l, ny: a[1] + ((b[1] - a[1]) * s) / l, walking: true };
    s -= l;
  }
  const last = WAY[WAY.length - 1], [tx, ty] = slot(k, k === 0 ? EDGE : RING), l = Math.hypot(tx - last[0], ty - last[1]);
  if (s < l) return { ex: last[0] + ((tx - last[0]) * s) / l, ny: last[1] + ((ty - last[1]) * s) / l, walking: true };
  if (k === 0 && T >= BACK_AT) {
    const f = Math.min(1, ((T - BACK_AT) * WALK) / (RING - EDGE)), [rx, ry] = slot(0, EDGE + (RING - EDGE) * f);
    return { ex: rx, ny: ry, walking: f < 1 };
  }
  return { ex: tx, ny: ty, walking: false };
}

/** The host's word on the bonfire: bundles on the pile, burning, ash where the last one was, the
 *  bundles in the woods that have been taken, and who's carrying one. */
export interface WoodState { n: number; b: number; a: number; t: number[]; c: string[] }

/** The court's middle in a map's data coordinates (metres east and north of its centre). */
function courtIn(centre: [number, number]): [number, number] {
  const kx = 111320 * Math.cos((centre[1] * Math.PI) / 180), ky = 110574;     // as tools/prep_map.py
  return [(COURT[0] - centre[0]) * kx, (COURT[1] - centre[1]) * ky];
}

// ---- the court, cut into the hillside as each square loads --------------------------------------

/** Level the court and clear what the map tools put on it, in map d (a square just loaded), in place. */
export function clearCourt(d: MapData) {
  const T = d.t;
  if (!d.centre || !T?.nx) return;
  const [cx, cy] = courtIn(d.centre);
  const gx1 = T.x0 + (T.nx - 1) * T.dx, gy1 = T.y0 + (T.ny - 1) * T.dy;
  if (cx + CLEAR.x < T.x0 || cx - CLEAR.x > gx1 || cy + CLEAR.y < T.y0 || cy - CLEAR.y > gy1) return;
  const inside = (x: number, y: number, b: { x: number; y: number }) => Math.abs(x - cx) <= b.x && Math.abs(y - cy) <= b.y;
  const clear = (x: number, y: number) => inside(x, y, CLEAR);
  // the ground, level, and hard standing (no grass growing through it)
  const kinds = T.k.length === T.nx * T.ny ? T.k.split("") : null;
  for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) {
    if (!inside(T.x0 + i * T.dx, T.y0 + j * T.dy, FLAT)) continue;
    T.h[j * T.nx + i] = Math.round((LEVEL - T.z0) * 10);
    if (kinds) kinds[j * T.nx + i] = "5";
  }
  if (kinds) T.k = kinds.join("");
  // the small things
  d.tr = d.tr.filter((q) => !clear(q[0], q[1]));
  if (d.sb) d.sb = d.sb.filter((q) => !clear(q[0], q[1]));
  if (d.dr) d.dr = d.dr.filter((q) => !clear(q[0], q[1]));
  if (d.fx) d.fx = d.fx.filter((q) => !clear(+q[1], +q[2]));
  if (d.gt) d.gt = d.gt.filter((q) => !clear((+q[0] + +q[2]) / 2, (+q[1] + +q[3]) / 2));
  d.br = d.br.flatMap((l) => {
    if (!l.p.some((q) => clear(q[0], q[1]))) return [l];
    const out: typeof d.br = [];
    let run: number[][] = [];
    for (const q of l.p) {
      if (clear(q[0], q[1])) { if (run.length > 1) out.push({ ...l, p: run }); run = []; }
      else run.push(q);
    }
    if (run.length > 1) out.push({ ...l, p: run });
    return out;
  });
  // and the woods' canopy
  if (d.cn) {
    const C = d.cn, raw = atob(C.h);
    let out = "", cut = false;
    for (let k = 0; k < raw.length; k++) {
      const i = k % C.nx, j = Math.floor(k / C.nx);
      if (raw.charCodeAt(k) && clear(C.x0 + i * C.step, C.y0 + j * C.step)) { out += "\0"; cut = true; }
      else out += raw[k];
    }
    if (cut) C.h = btoa(out);
  }
}

// ---- the things in it ----------------------------------------------------------------------------

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const stick = (r: number, len: number) => new THREE.CylinderGeometry(r * 0.85, r, len, 5);

/** A bundle of firewood about 1.2 m long, from its foot up local Y, tied twice with twine. */
function bundleGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const BARK = ["#6b4a2c", "#7a5634", "#5e4127", "#82603c", "#4f3822"];
  const at = [[0, 0], [0.09, 0.02], [-0.08, 0.04], [0.03, 0.09], [-0.04, -0.08], [0.08, -0.07], [-0.1, -0.03], [0.02, -0.02]];
  at.forEach(([x, z], k) => {
    const len = 1.1 + ((k * 37) % 5) * 0.04, r = 0.04 + ((k * 13) % 3) * 0.008;
    parts.push([stick(r, len), BARK[k % BARK.length], x, len / 2 + ((k * 7) % 3) * 0.02, z]);
  });
  for (const y of [0.3, 0.85]) parts.push([new THREE.CylinderGeometry(0.155, 0.155, 0.05, 8), "#c9b27a", 0, y, 0.01]);
  return model(parts);
}

const BUNDLE = bundleGeometry();
const BUNDLE_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

/** A soft round glow on a canvas, for flames and the light on the ground. */
function glowTexture(stops: [number, string][]): THREE.CanvasTexture {
  const cv = document.createElement("canvas"), c = cv.getContext("2d")!;
  cv.width = cv.height = 64;
  const r = c.createRadialGradient(32, 32, 1, 32, 32, 31);
  for (const [o, col] of stops) r.addColorStop(o, col);
  c.fillStyle = r; c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

/** The court's tarmac, worn, with its white lines. */
function tarmacTexture(): THREE.CanvasTexture {
  const W = 512, H = Math.round((512 * PAD.y) / PAD.x);
  const cv = document.createElement("canvas"), g = cv.getContext("2d")!;
  cv.width = W; cv.height = H;
  g.fillStyle = "#3d3f42"; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 2600; k++) {
    const v = 50 + Math.floor(Math.random() * 30);
    g.fillStyle = `rgb(${v},${v},${v + 3})`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  g.strokeStyle = "rgba(235,235,225,0.85)"; g.lineWidth = 4;
  const m = 18;
  g.strokeRect(m, m, W - 2 * m, H - 2 * m);
  g.beginPath(); g.moveTo(W / 2, m); g.lineTo(W / 2, H - m); g.stroke();
  g.beginPath(); g.arc(W / 2, H / 2, H * 0.14, 0, Math.PI * 2); g.stroke();
  for (const x of [m, W - m]) { g.beginPath(); g.arc(x, H / 2, H * 0.3, x === m ? -Math.PI / 2 : Math.PI / 2, x === m ? Math.PI / 2 : Math.PI * 1.5); g.stroke(); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- people ----------------------------------------------------------------------------------------

interface Look { skin: string; hair: string; long?: boolean; top: string; legs: string; shoes: string; coat?: boolean; extras?: Part[]; stiff?: boolean }

/** A person in the game's blocky style, facing -z: a body, and arms (and legs, unless stiff) that move. */
class Person {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly legs: THREE.Group[] = [];
  readonly arms: THREE.Group[] = [];
  readonly fores: THREE.Group[] = [];
  private bubble: THREE.Sprite | null = null;
  private bubbleT = 0;

  constructor(L: Look, mat: THREE.Material) {
    const parts: Part[] = [
      [box(0.36, 0.16, 0.2), L.legs, 0, 0.94, 0],
      [box(0.44, 0.54, 0.26), L.top, 0, 1.27, 0],
      L.coat ? [box(0.48, 0.5, 0.3), L.top, 0, 0.8, 0] : [box(0.46, 0.14, 0.28), L.top, 0, 0.98, 0],
      [box(0.1, 0.08, 0.1), L.skin, 0, 1.58, 0], [box(0.24, 0.27, 0.25), L.skin, 0, 1.75, 0],
      [box(0.26, 0.08, 0.27), L.hair, 0, 1.9, 0.005], [box(0.25, 0.16, 0.05), L.hair, 0, 1.8, 0.115],
      [box(0.04, 0.03, 0.02), "#2a2020", 0.055, 1.77, -0.126], [box(0.04, 0.03, 0.02), "#2a2020", -0.055, 1.77, -0.126],
      [box(0.07, 0.015, 0.02), "#8a5a4a", 0, 1.665, -0.127],
      ...(L.long ? [[box(0.27, 0.34, 0.07), L.hair, 0, 1.64, 0.12] as Part] : []),
      ...(L.extras ?? []),
    ];
    const legParts = (side: number): Part[] => [[box(0.15, 0.82, 0.17), L.legs, side * 0.1, -0.43, 0], [box(0.15, 0.09, 0.28), L.shoes, side * 0.1, -0.86, -0.04]];
    if (L.stiff) parts.push(...[-1, 1].flatMap((s) => legParts(s).map(([g, c, x, y, z]) => [g, c, x, y + 0.9, z] as Part)));
    this.body.add(new THREE.Mesh(model(parts), mat));
    if (!L.stiff) for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(0, 0.9, 0);
      leg.add(new THREE.Mesh(model(legParts(side)), mat));
      this.legs.push(leg); this.body.add(leg);
    }
    for (const side of [-1, 1]) {
      const arm = new THREE.Group(), fore = new THREE.Group();
      arm.position.set(side * 0.29, 1.47, 0);
      arm.add(new THREE.Mesh(model([[box(0.13, 0.32, 0.14), L.top, 0, -0.15, 0]]), mat));
      fore.position.y = -0.3;
      fore.add(new THREE.Mesh(model([[box(0.12, 0.26, 0.13), L.top, 0, -0.12, 0], [box(0.09, 0.1, 0.09), L.skin, 0, -0.3, 0]]), mat));
      arm.add(fore);
      this.arms.push(arm); this.fores.push(fore); this.body.add(arm);
    }
    this.body.traverse((o) => { o.castShadow = true; });
    this.root.add(this.body);
  }

  /** Walking: phase goes round as they step, stride 0 (stood still) to 1. */
  walk(phase: number, stride: number) {
    const s = Math.sin(phase) * 0.55 * stride;
    if (this.legs.length) { this.legs[0].rotation.x = s; this.legs[1].rotation.x = -s; }
    this.arms[0].rotation.x = -s * 0.7; this.fores[0].rotation.x = 0.15;
    this.body.position.y = Math.abs(Math.cos(phase)) * 0.04 * stride;
  }

  say(text: string, secs = 4) {
    this.unsay();
    this.bubble = speechBubble(text);
    this.bubble.position.y = 2.25;
    this.root.add(this.bubble);
    this.bubbleT = secs;
  }

  tick(dt: number) {
    if (!this.bubble) return;
    this.bubbleT -= dt;
    if (this.bubbleT <= 0) this.unsay();
    else this.bubble.material.opacity = Math.min(1, this.bubbleT / 0.4);
  }

  private unsay() {
    if (!this.bubble) return;
    this.root.remove(this.bubble);
    this.bubble.material.map?.dispose();
    this.bubble.material.dispose();
    this.bubble = null;
  }

  dispose() {
    this.unsay();
    this.root.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  }
}

const PEOPLE_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const SKINS = ["#e8c3a4", "#dcae8c", "#c48a64", "#8d5a3c", "#5e3a26", "#f0cdb4"];
const HAIRS = ["#2a1f18", "#5a4632", "#8a6a3a", "#c9a25a", "#1a1a1a", "#7a3b1e"];

/** A prefect: a dark suit, a white shirt and the school tie, a gold badge on the lapel. */
export function prefect(k: number): Person {
  const suit = ["#24272e", "#2b2f3a", "#1f2229"][k % 3];
  const extras: Part[] = [
    [box(0.12, 0.2, 0.02), "#f2f2ee", 0, 1.43, -0.131],                // shirt
    [box(0.05, 0.26, 0.02), "#7a1f2b", 0, 1.38, -0.137],               // the tie, maroon
    [box(0.05, 0.03, 0.022), "#d8b04a", 0, 1.43, -0.139],              // with a gold stripe
    [box(0.06, 0.04, 0.02), "#e6c35a", -0.13, 1.42, -0.135],           // the prefect's badge
  ];
  return new Person({ skin: SKINS[(k * 5 + 1) % SKINS.length], hair: HAIRS[(k * 3) % HAIRS.length], long: k % 2 === 1, top: suit, legs: suit, shoes: "#111111", extras }, PEOPLE_MAT);
}

/** One of the lab coats: a white coat to the knee, safety specs, and a sparkler in the right hand. */
export function labCoat(k: number): { p: Person; tip: THREE.Object3D } {
  const p = new Person({
    skin: SKINS[(k * 7 + 2) % SKINS.length], hair: HAIRS[(k * 5 + 1) % HAIRS.length], long: k % 3 === 1,
    top: "#eef0ee", legs: ["#2e3b57", "#3a3a3a", "#5a4a3a"][k % 3], shoes: "#2a2a2a", coat: true, stiff: true,
    extras: [[box(0.24, 0.06, 0.03), "#9fd0e0", 0, 1.77, -0.135], [box(0.26, 0.015, 0.02), "#333", 0, 1.8, -0.14]],
  }, PEOPLE_MAT);
  const s = new THREE.Mesh(box(0.012, 0.36, 0.012).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: "#888" }));
  const tip = new THREE.Object3D();
  tip.position.y = -0.68;
  p.fores[1].add(s, tip);
  return { p, tip };
}

/** The guy on top of the bonfire: old clothes stuffed with straw, a mask and a hat, sat slumped. */
export function guy(): Person {
  const p = new Person({ skin: "#efe2c4", hair: "#3a2a1a", top: "#6a5a3a", legs: "#4a4030", shoes: "#3a2a1a", extras: [
    [box(0.16, 0.035, 0.02), "#2a1a12", 0, 1.69, -0.13],               // a big moustache
    [box(0.36, 0.04, 0.36), "#2a2a2a", 0, 1.92, 0], [box(0.22, 0.14, 0.22), "#2a2a2a", 0, 2.0, 0],   // his hat
    [box(0.06, 0.06, 0.02), "#c9b27a", -0.1, 1.2, -0.135], [box(0.05, 0.05, 0.02), "#c9b27a", 0.12, 1.05, -0.135],   // straw poking out
  ] }, new THREE.MeshLambertMaterial({ vertexColors: true }));
  for (const l of p.legs) l.rotation.x = 1.45;
  p.arms[0].rotation.z = -0.3; p.arms[1].rotation.z = 0.3;
  p.body.rotation.x = 0.25;
  p.body.position.y = -0.9;
  return p;
}

// ---- sparks: fireworks, sparklers and embers, all in one cloud of points --------------------------

const SPARKS = 3000;

class Sparks {
  readonly points: THREE.Points;
  private pos = new Float32Array(SPARKS * 3);
  private vel = new Float32Array(SPARKS * 3);
  private tint = new Float32Array(SPARKS * 3);
  private base = new Float32Array(SPARKS * 3);
  private size = new Float32Array(SPARKS);
  private big = new Float32Array(SPARKS);
  private age = new Float32Array(SPARKS);
  private life = new Float32Array(SPARKS);
  private drag = new Float32Array(SPARKS);
  private grav = new Float32Array(SPARKS);
  private twinkle = new Uint8Array(SPARKS);
  private next = 0;
  live = 0;

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("tint", new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("size", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 420 } },
      vertexShader: `uniform float uScale; attribute float size; attribute vec3 tint; varying vec3 vC;
        void main() { vC = tint; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size > 0.0 ? max(1.5, size * uScale / max(0.5, -mv.z)) : 0.0; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; void main() { float a = smoothstep(0.5, 0.08, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(vC * a, 1.0); }`,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, col: THREE.Color, size: number, life: number, drag: number, grav: number, twinkle = false) {
    const i = this.next;
    this.next = (this.next + 1) % SPARKS;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3);
    this.base.set([col.r, col.g, col.b], i * 3);
    this.big[i] = size; this.age[i] = 0; this.life[i] = life; this.drag[i] = drag; this.grav[i] = grav; this.twinkle[i] = twinkle ? 1 : 0;
  }

  update(dt: number) {
    let live = 0;
    for (let i = 0; i < SPARKS; i++) {
      if (this.age[i] >= this.life[i]) { this.size[i] = 0; continue; }
      live++;
      this.age[i] += dt;
      const k = i * 3, slow = Math.exp(-this.drag[i] * dt);
      this.vel[k] *= slow; this.vel[k + 1] = this.vel[k + 1] * slow - this.grav[i] * dt; this.vel[k + 2] *= slow;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      let f = Math.max(0, 1 - this.age[i] / this.life[i]);
      f = f * (2 - f);
      if (this.twinkle[i] && Math.random() < 0.35) f *= 0.15;
      this.tint[k] = this.base[k] * f; this.tint[k + 1] = this.base[k + 1] * f; this.tint[k + 2] = this.base[k + 2] * f;
      this.size[i] = this.big[i] * (0.4 + 0.6 * f);
    }
    this.live = live;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.tint.needsUpdate = g.attributes.size.needsUpdate = true;
  }
}

// ---- what the prefects say -----------------------------------------------------------------------

const NAG = [
  "Come along! The bonfire won't build itself.", "Hurry up!", "Chop chop.", "Is that it? We need more wood, not excuses.",
  "More wood! Up the path, into the woods.", "Prefects don't carry wood. Prefects supervise.", "You call that effort?",
  "I'll be mentioning this to the Head.", "Faster! My granny fetches wood quicker than that.", "Stop dawdling.",
  "Do more. Then do some more.", "Less standing about, more fetching.", "The woods are that way. Up the hill.",
  "I'm writing your name down.", "Pick up the pace!", "Honestly. Year Sevens work harder than you.",
];
const CARRYING = [
  "Don't dawdle, straight down to the court.", "Mind you don't drop it.", "One bundle? Take two next time.",
  "Faster, faster!", "The court's by Fonthill Road. Down the hill.", "Put it on the pile, then come straight back.",
];
const GOT = ["Good. Now get it to the court.", "Finally. Down to the pile with it.", "About time. Now run."];
const ADDED = ["{left} to go. Don't stop now.", "Adequate. Now fetch another.", "{n} on the pile. Pathetic. Go again.", "Is that all? {left} more."];
const DARK_SOON = ["It'll be dark soon! Move!", "The light's going. Hurry up!", "We need it built by nightfall!"];
const FAR = ["Where do you think you're going?", "Oi! The woods are back that way.", "Come back here!"];
const HELLO = ["Ah, there you are. The bonfire needs {need} bundles of wood. Off you go: the woods, up the path.",
  "You there! We need firewood for the bonfire. {left} bundles. Hop to it."];
const BUILT = ["Well. I suppose that'll do. Be on the court at dark.", "Done at last. Bonfire's at dark. Don't be late."];

const fill = (s: string, n: number) => s.replace("{n}", String(n)).replace("{left}", String(NEED - n)).replace("{need}", String(NEED));
function deal(hand: string[], pool: string[]): string {
  if (!hand.length) hand.push(...[...pool].sort(() => Math.random() - 0.5));
  return hand.pop()!;
}

interface Prefect { p: Person; x: number; y: number; z: number; yaw: number; phase: number; speed: number; seen: number }
interface Walker { p: Person; tip: THREE.Object3D; x: number; z: number; yaw: number; slot: number }
interface Player { id: string; x: number; y: number; z: number; yaw: number; alive: boolean }
interface Rocket { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; kind: number }

/** Get Wood: the bonfire on the court, the wood in the woods, and everyone round it. */
export class Bonfire {
  /** Hooks into the game. */
  send: (type: "wd" | "wdq", data: unknown, to?: string) => void = () => {};
  toast: (text: string, secs: number) => void = () => {};
  /** Where a sound at scene (x, y, z) is heard from: distance and pan. */
  hear: (x: number, y: number, z: number) => [number, number] = () => [1e9, 0];
  /** The flash of light each firework bursts with (flash.ts, shared with cars going up). */
  flash: Flash | null = null;

  private s: WoodState = { n: 0, b: 0, a: 0, t: [], c: [] };
  private carriers = new Set<string>();
  private taken = new Set<number>();
  private takenAt = new Map<number, number>();    // host: when each was taken
  private x = NaN; private z = NaN; private y = 0; // the court's middle, scene
  private ready = false;                          // the court's square is in, and laid out
  private spots: { x: number; y: number; z: number; yaw: number }[] = [];
  private group = new THREE.Group();
  private bundles: THREE.InstancedMesh | null = null;
  private stack: THREE.InstancedMesh | null = null;
  private stackMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private guy: Person | null = null;
  private ash: THREE.Mesh | null = null;
  private fire = new THREE.Group();
  private flames: THREE.Sprite[] = [];
  private smoke: THREE.Sprite[] = [];
  private glow: THREE.Mesh | null = null;
  private sparks = new Sparks();
  private rockets: Rocket[] = [];
  private nextRocket = 3;
  private crackleT = 0;
  private burnT = -1;                             // seconds since we saw it lit, or -1
  private walkers: Walker[] = [];
  private fuses: { t: number; x: number; z: number }[] = [];
  private lighting: number[] = [];                // till when (burnT) each lab coat is bent down lighting a rocket
  private fireLight: THREE.PointLight | null = null;
  private prefects = new Map<string, Prefect[]>();
  private carried = new Map<string, THREE.Mesh>();
  private hands: Record<string, string[]> = {};
  private talkT = 4; private talker = 0; private met = false; private farSaid = 0;
  private sendT = 0; private nightT = 0; private night = 0;
  private asked = 0;
  private dir = new THREE.Vector3();

  constructor(private map: GameMap, scene: THREE.Scene) {
    scene.add(this.group);
    this.group.add(this.sparks.points);
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (saved && Number.isFinite(saved.n)) this.s = { n: Math.max(0, Math.min(NEED, saved.n | 0)), b: saved.b ? 1 : 0, a: saved.a ? 1 : 0, t: [], c: [] };
    } catch { /* no storage: start afresh */ }
    // for testing: ?wood=25 starts the pile with that many on it
    const start = new URLSearchParams(location.search).get("wood");
    if (start !== null && Number.isFinite(+start)) this.s = { ...this.s, n: Math.max(0, Math.min(NEED, Math.round(+start))), b: 0 };
    this.seen = { n: this.s.n, b: this.s.b, carrying: false };
    const d = map.d;
    if (d.centre) {
      const [cx, cy] = courtIn(d.centre);
      if (map.fieldEdge(cx, -cy) > 0) { this.x = cx; this.z = -cy; }
    }
    // the fire's light: on the map with the bonfire, always in the scene (dark till bonfire night)
    // and never in a group that's hidden, so the number of lights never changes
    if (Number.isFinite(this.x)) {
      this.fireLight = new THREE.PointLight("#ff8a3a", 0, 40, 1.4);
      scene.add(this.fireLight);
    }
  }

  /** Where the bonfire is, for the maps, if it's on this map. */
  spot(): { x: number; z: number } | undefined {
    return Number.isFinite(this.x) ? { x: this.x, z: this.z } : undefined;
  }

  /** Whether `id` has a bundle with them. */
  carrying(id: string) { return this.carriers.has(id); }

  /** Things are only to be done while there's wood wanted. */
  private wanted() { return this.s.n < NEED && !this.s.b; }

  // ---- the network ----

  /** The host's word (everyone else). */
  apply(d: WoodState, me: string) {
    if (!d || !Number.isFinite(d.n) || !Array.isArray(d.t) || !Array.isArray(d.c)) return;
    this.take(d, me);
  }

  /** Host: someone asks to pick up bundle i, or to put theirs on the pile. */
  ask(from: string, d: { op?: string; i?: number }, me: string) {
    if (!d) return;
    let changed = false;
    if (d.op === "take" && typeof d.i === "number" && d.i >= 0 && d.i < ON_PATH + IN_WOODS && this.wanted()
      && !this.carriers.has(from) && !this.taken.has(d.i)) {
      this.taken.add(d.i); this.takenAt.set(d.i, performance.now());
      this.carriers.add(from);
      changed = true;
    } else if (d.op === "night" && !this.s.b) {
      // the debug panel's bonfire night: built, and lit as soon as it's dark
      this.s.n = NEED; this.s.a = 0;
      this.carriers.clear();
      changed = true;
    } else if (d.op === "add" && this.carriers.has(from) && this.wanted()) {
      this.carriers.delete(from);
      this.s.n++; this.s.a = 0;
      changed = true;
    }
    if (changed) this.publish(me);
  }

  /** The debug panel's "Bonfire night": the bonfire built, for everyone in the game (game.ts moves
   *  the clock on to nightfall). Whether it did it, and what to say. */
  bonfireNight(me: string, isHost: boolean): [boolean, string] {
    if (!Number.isFinite(this.x)) return [false, "There's no bonfire on this map"];
    if (this.s.b) return [false, "It's bonfire night already"];
    if (isHost) this.ask(me, { op: "night" }, me);
    else this.send("wdq", { op: "night" });
    return [true, "Bonfire night! The court by Fonthill Road, off College Road"];
  }

  /** Host: tell someone who's just joined how things stand. */
  joined(id: string) { this.send("wd", this.snapshot(), id); }

  private snapshot(): WoodState {
    return { n: this.s.n, b: this.s.b, a: this.s.a, t: [...this.taken], c: [...this.carriers] };
  }

  /** Host: send the lot round, and take it ourselves. */
  private publish(me: string) {
    const snap = this.snapshot();
    this.send("wd", snap);
    this.take(snap, me);
    this.sendT = SEND_EVERY;
  }

  /** Take a word on the bonfire (the host's, or our own as host), and say what's changed. */
  private take(d: WoodState, me: string) {
    const was = this.seen, had = was.carrying;
    this.s = { n: Math.max(0, Math.min(NEED, d.n | 0)), b: d.b ? 1 : 0, a: d.a ? 1 : 0, t: d.t, c: d.c };
    this.carriers = new Set(d.c.filter((c) => typeof c === "string"));
    this.taken = new Set(d.t.filter((i) => typeof i === "number"));
    for (const i of [...this.takenAt.keys()]) if (!this.taken.has(i)) this.takenAt.delete(i);
    for (const i of this.taken) if (!this.takenAt.has(i)) this.takenAt.set(i, performance.now());
    try { localStorage.setItem(KEY, JSON.stringify({ n: this.s.n, b: this.s.b, a: this.s.a })); } catch { /* fine */ }
    const has = this.carriers.has(me);
    const near = Number.isFinite(this.x) ? this.distTo(me) : 1e9;
    if (has && !had) { SFX.pickup("wood"); this.nag(GOT); }
    if (this.s.n > was.n) {
      const [d0, pan] = this.hear(this.x, this.y + 1, this.z);
      SFX.woodStack(d0, pan);
      if (had && !has) {
        award("bonfire");
        if (this.s.n < NEED) this.nag(ADDED);
      }
      if (this.s.n >= NEED && was.n < NEED && (near < 600 || (had && !has))) {
        missionClear("bonfire");
        missionEnd({ result: "complete", title: "Bonfire built!", colour: FIRE, lines: ["Kingswood's bonfire is ready", "It's lit at dark"] });
      }
      if (this.s.n >= NEED) this.nag(BUILT);
    }
    if (this.s.b && !was.b) {
      this.fresh = this.known;   // lit just now, rather than already going when we got here
      if (this.known && near < 3000) this.toast("Kingswood's bonfire is lit! Fireworks on the court by Fonthill Road", 4);
    }
    this.known = true;
    this.mission(has, near);
    this.seen = { n: this.s.n, b: this.s.b, carrying: has };
    this.paint();
  }

  private told = false;                          // the title card has been up for this pile

  /** The mission screens: a card when you first pick up wood, and the pile's count while you're at it. */
  private mission(carrying: boolean, near: number) {
    if (this.s.n >= NEED) { this.told = false; missionClear("bonfire"); return; }
    const busy = missionActive() && missionActive() !== "bonfire";
    if (busy || (!carrying && near > 500)) { missionClear("bonfire"); return; }
    if (!this.told && carrying) {
      this.told = true;
      missionStart({ title: "Get Wood", goal: `Build Kingswood's bonfire: ${NEED} bundles on the pile`, detail: "Carry them down to the court, then walk up to the pile", label: "Bonfire", colour: FIRE });
    }
    missionProgress({
      id: "bonfire", label: "Bonfire", colour: FIRE, goal: "Build the bonfire", progress: `${this.s.n} / ${NEED}`, bar: this.s.n / NEED,
      hint: carrying ? "Carrying wood: take it to the pile" : "Fetch bundles from the woods (E)",
    });
  }

  private me: Player | null = null;
  private known = false;                          // had a word on it yet
  private seen = { n: 0, b: 0, carrying: false };  // how things stood at the last word, to say what's changed
  private fresh = false;                          // seen it lit, so the lab coats walk over
  private distTo(id: string) { return this.me && this.me.id === id ? Math.hypot(this.me.x - this.x, this.me.z - this.z) : 1e9; }

  // ---- your E key ----

  /** E: pick up the bundle at your feet. Returns true if E was for that. */
  use(me: Player, isHost: boolean): boolean {
    if (!this.ready || !me.alive || !this.wanted() || this.carriers.has(me.id) || performance.now() - this.asked < 700) return false;
    const i = this.bundleAt(me);
    if (i < 0) return false;
    this.asked = performance.now();
    if (isHost) this.ask(me.id, { op: "take", i }, me.id);
    else this.send("wdq", { op: "take", i });
    return true;
  }

  private bundleAt(me: Player): number {
    let best = -1, bd = REACH;
    this.spots.forEach((s, i) => {
      if (this.taken.has(i)) return;
      const d = Math.hypot(s.x - me.x, s.z - me.z);
      if (d < bd && Math.abs(s.y - me.y) < 2.2) { bd = d; best = i; }
    });
    return best;
  }

  /** What to say in the middle of the screen, or "". */
  hint(me: Player): string {
    if (!this.ready || !me.alive) return "";
    if (this.wanted() && !this.carriers.has(me.id) && this.bundleAt(me) >= 0) return `<b>E</b> Pick up a bundle of wood for the bonfire`;
    const d = Math.hypot(me.x - this.x, me.z - this.z);
    if (d > 12 || Math.abs(me.y - this.y) > 4) return "";
    if (this.s.b) return "Bonfire night!";
    if (this.s.n >= NEED) return "The bonfire's built: it's lit at dark";
    return `The bonfire: ${this.s.n} of ${NEED} bundles. Fetch wood from the woods, up the path`;
  }

  // ---- every frame ----

  update(dt: number, t: number, me: Player, others: Player[], isHost: boolean) {
    this.me = me;
    if (!Number.isFinite(this.x)) return;
    // the host keeps the pile wherever they are
    this.nightT -= dt;
    if (this.nightT <= 0) { this.nightT = 1; this.night = nightNow(); }
    if (isHost) this.host(dt, me, others);
    const far = Math.hypot(me.x - this.x, me.z - this.z);
    if (!this.ready) {
      if (far > 700 || !this.layOut()) return;
    }

    // carrying a bundle up to the pile puts it on
    if (this.carriers.has(me.id) && me.alive && Math.hypot(me.x - this.x, me.z - this.z) < DROP && Math.abs(me.y - this.y) < 3
      && performance.now() - this.asked > 700 && this.wanted()) {
      this.asked = performance.now();
      if (isHost) this.ask(me.id, { op: "add" }, me.id);
      else this.send("wdq", { op: "add" });
    }

    const show = far < 1500;
    this.group.visible = show;
    if (!show) { this.darken(); return; }
    this.carry(others);
    this.prefectsUpdate(dt, t, me, others);
    this.burn(dt, t, me, far);
    this.sparks.update(dt);
  }

  /** Host: who's dropped theirs, which bundles have come back, and when it's lit and burnt out. */
  private host(dt: number, me: Player, others: Player[]) {
    let changed = false;
    const all = [me, ...others];
    for (const id of [...this.carriers]) {
      const p = all.find((q) => q.id === id);
      if (!p || !p.alive) { this.carriers.delete(id); changed = true; }   // gone, or down: the wood's lost
    }
    const now = performance.now();
    for (const [i, at] of this.takenAt) if (now - at > RESPAWN * 1000) { this.taken.delete(i); this.takenAt.delete(i); changed = true; }
    if (!this.s.b && this.s.n >= NEED && this.night >= LIT) { this.s.b = 1; changed = true; }
    else if (this.s.b && this.night <= OUT) {
      // burnt out by morning: ash, and a new pile to build
      this.s = { ...this.s, n: 0, b: 0, a: 1 };
      this.taken.clear(); this.takenAt.clear(); this.carriers.clear();
      changed = true;
    }
    this.sendT -= dt;
    if (changed || this.sendT <= 0) this.publish(me.id);
  }

  // ---- laying it all out, once the court's square is in ----

  private layOut(): boolean {
    const span = [WOODS.x0, WOODS.x1].map((dx) => this.map.tileAt(this.x + dx, this.z - (WOODS.y0 + WOODS.y1) / 2));
    if (!this.map.tileAt(this.x, this.z) || span.some((t) => !t)) return false;
    this.ready = true;
    this.y = this.map.ground(this.x, this.z);

    // the tarmac
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(PAD.x, PAD.y).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: tarmacTexture(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    pad.position.set(this.x, this.y + 0.03, this.z);
    pad.receiveShadow = true;
    this.group.add(pad);

    this.findSpots();
    this.bundles = new THREE.InstancedMesh(BUNDLE, BUNDLE_MAT, Math.max(1, this.spots.length));
    this.bundles.frustumCulled = false;
    this.bundles.castShadow = true;
    this.group.add(this.bundles);

    // the pile: a cone of bundles leaning in, ring on ring, filled in as they're brought
    this.stack = new THREE.InstancedMesh(BUNDLE, this.stackMat, NEED);
    this.stack.frustumCulled = false;
    this.stack.castShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
    let k = 0;
    for (const [count, r, y0, tilt, size, turn] of [[10, 1.5, 0, 0.5, 1.5, 0], [8, 1.0, 0.35, 0.42, 1.35, 0.3], [5, 0.6, 0.85, 0.32, 1.2, 0.1], [2, 0.18, 1.35, 0.12, 1.0, 0.9]]) {
      for (let j = 0; j < count && k < NEED; j++, k++) {
        const a = (j / count) * Math.PI * 2 + turn;
        v.set(-Math.cos(a) * Math.sin(tilt), Math.cos(tilt), -Math.sin(a) * Math.sin(tilt));
        q.setFromUnitVectors(up, v);
        m.compose(new THREE.Vector3(this.x + Math.cos(a) * r, this.y + y0, this.z + Math.sin(a) * r), q, sc.setScalar(size));
        this.stack.setMatrixAt(k, m);
      }
    }
    this.group.add(this.stack);
    this.guy = guy();
    this.guy.root.position.set(this.x, this.y + 2.05, this.z);
    this.guy.root.rotation.y = 0.4;
    this.group.add(this.guy.root);

    // the ash where the last one burnt
    const ashTex = glowTexture([[0, "rgba(20,18,16,0.95)"], [0.6, "rgba(40,36,32,0.8)"], [1, "rgba(60,56,50,0)"]]);
    this.ash = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: ashTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    this.ash.position.set(this.x, this.y + 0.05, this.z);
    this.group.add(this.ash);

    // the fire, out till it's lit
    const flameTex = glowTexture([[0, "rgba(255,250,210,1)"], [0.25, "rgba(255,200,80,0.9)"], [0.6, "rgba(255,90,20,0.45)"], [1, "rgba(200,40,0,0)"]]);
    for (let j = 0; j < 12; j++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      this.flames.push(s); this.fire.add(s);
    }
    const smokeTex = glowTexture([[0, "rgba(90,86,82,0.6)"], [1, "rgba(90,86,82,0)"]]);
    for (let j = 0; j < 8; j++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false }));
      this.smoke.push(s); this.fire.add(s);
    }
    const glowTex = glowTexture([[0, "rgba(255,150,60,0.9)"], [0.5, "rgba(255,110,40,0.35)"], [1, "rgba(255,90,30,0)"]]);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(26, 26).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    this.glow.position.y = 0.08;
    this.fire.add(this.glow);
    this.fire.position.set(this.x, this.y, this.z);
    this.fireLight?.position.set(this.x, this.y + 2.6, this.z);
    this.fire.visible = false;
    this.group.add(this.fire);
    this.paint();
    return true;
  }

  /** Where the bundles lie: the same for everyone, from the map. Some by the paths up through the
   *  woods, the rest scattered among the trees. */
  private findSpots() {
    const r = rng(hash("get wood"));
    const tiles = this.map.tilesNear(this.x + (WOODS.x0 + WOODS.x1) / 2, this.z - (WOODS.y0 + WOODS.y1) / 2, 160);
    const inWoods = (x: number, z: number) => {
      const ex = x - this.x, ny = -(z - this.z);
      return ex > WOODS.x0 && ex < WOODS.x1 && ny > WOODS.y0 && ny < WOODS.y1;
    };
    const kindAt = (x: number, z: number) => {
      const t = this.map.tileAt(x, z);
      if (!t) return "";
      const T = t.d.t, i = Math.round((x - T.x0) / T.dx), j = Math.round((-z - T.y0) / T.dy);
      return i < 0 || j < 0 || i >= T.nx || j >= T.ny ? "" : T.k[j * T.nx + i] ?? "";
    };
    const ok = (x: number, z: number) => !this.map.blocked(x, z, 0.6) && !this.map.indoors(x, z) && this.spots.every((s) => Math.hypot(s.x - x, s.z - z) > 5);
    const put = (x: number, z: number) => this.spots.push({ x, z, y: this.map.ground(x, z), yaw: r() * Math.PI * 2 });
    // by the paths
    const FOOT = new Set(["footway", "steps", "path", "track", "bridleway"]);
    const along: [number, number][] = [];
    for (const t of tiles) for (const rd of t.d.rd) {
      if (!FOOT.has(rd.c)) continue;
      let since = 6;
      for (let a = 0; a + 1 < rd.p.length; a++) {
        const [x0, y0] = rd.p[a], [x1, y1] = rd.p[a + 1], len = Math.hypot(x1 - x0, y1 - y0);
        if (len < 0.01) continue;
        since += len;
        if (since < 11) continue;
        since = 0;
        const side = r() < 0.5 ? -1 : 1, off = 1.8 + r() * 1.5;
        const x = x0 + (-(y1 - y0) / len) * off * side, y = y0 + ((x1 - x0) / len) * off * side;
        if (inWoods(x, -y)) along.push([x, -y]);
      }
    }
    for (const [x, z] of shuffled(r, along)) {
      if (this.spots.length >= ON_PATH) break;
      if (ok(x, z)) put(x, z);
    }
    // and in the woods
    for (let tries = 0; tries < 3000 && this.spots.length < ON_PATH + IN_WOODS; tries++) {
      const x = this.x + WOODS.x0 + r() * (WOODS.x1 - WOODS.x0), z = this.z - (WOODS.y0 + r() * (WOODS.y1 - WOODS.y0));
      if (kindAt(x, z) === "2" && ok(x, z)) put(x, z);
    }
  }

  /** Show the pile, the bundles and the ash as things stand. */
  private paint() {
    if (!this.ready || !this.bundles || !this.stack) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), none = new THREE.Vector3(0, 0, 0);
    this.spots.forEach((s, i) => {
      const there = this.wanted() && !this.taken.has(i);
      q.setFromEuler(e.set(Math.PI / 2, s.yaw, 0, "YXZ"));
      m.compose(new THREE.Vector3(s.x, s.y + 0.14, s.z), q, there ? one : none);
      this.bundles!.setMatrixAt(i, m);
    });
    this.bundles.instanceMatrix.needsUpdate = true;
    this.stack.count = this.s.n;
    this.guy!.root.visible = this.s.n >= NEED;
    this.ash!.visible = !!this.s.a && this.s.n < 4;
    if (!this.s.b) this.fire.visible = false;
    if (!this.s.b) { this.burnT = -1; this.stackMat.color.set("#ffffff"); }
  }

  // ---- the bundles in people's arms ----

  private carry(others: Player[]) {
    for (const [id, mesh] of this.carried) if (!this.carriers.has(id) || !others.some((p) => p.id === id && p.alive)) { this.group.remove(mesh); this.carried.delete(id); }
    for (const p of others) {
      if (!p.alive || !this.carriers.has(p.id)) continue;
      let mesh = this.carried.get(p.id);
      if (!mesh) { mesh = new THREE.Mesh(BUNDLE, BUNDLE_MAT); mesh.castShadow = true; this.carried.set(p.id, mesh); this.group.add(mesh); }
      mesh.position.set(p.x - Math.sin(p.yaw) * 0.38 + Math.cos(p.yaw) * 0.55, p.y + 1.05, p.z - Math.cos(p.yaw) * 0.38 - Math.sin(p.yaw) * 0.55);
      mesh.rotation.set(0, p.yaw, Math.PI / 2, "YXZ");
    }
  }

  // ---- the prefects ----

  private prefectsUpdate(dt: number, t: number, me: Player, others: Player[]) {
    const want = this.wanted();
    for (const p of [me, ...others]) {
      const near = p.alive && want && Math.hypot(p.x - this.x, p.z - this.z) < ZONE;
      let pair = this.prefects.get(p.id);
      if (!pair && !near) continue;
      if (!pair) {
        // they turn up behind you, as prefects do
        const k = hash(p.id) % 7;
        pair = [0, 1].map((j) => {
          const fig = prefect(k + j), a = p.yaw + (j ? 0.5 : -0.5), x = p.x + Math.sin(a) * 12, z = p.z + Math.cos(a) * 12;
          this.group.add(fig.root);
          return { p: fig, x, z, y: this.map.ground(x, z), yaw: p.yaw, phase: j * 1.7, speed: 0, seen: 0 };
        });
        this.prefects.set(p.id, pair);
        if (p.id === me.id && !this.met) { this.met = true; this.talkT = 1.5; }
      }
      // once there's no wood wanted from you, they hang about a moment and go
      if (near) pair[0].seen = 0;
      else if ((pair[0].seen += dt) > 6) { this.dropPrefects(p.id); continue; }
      pair.forEach((f, j) => {
        let dx = p.x - f.x, dz = p.z - f.z, d = Math.hypot(dx, dz);
        if (d > 45) {   // left behind: they catch you up anyway
          const a = Math.atan2(-dx, -dz);
          f.x = p.x + Math.sin(a) * 10; f.z = p.z + Math.cos(a) * 10;
          dx = p.x - f.x; dz = p.z - f.z; d = 10;
        }
        const keep = 2.6 + j * 0.9, v = d > keep ? Math.min(7.5, 1.4 + (d - keep) * 1.3) : 0;
        f.speed += (v - f.speed) * Math.min(1, dt * 4);
        if (d > 0.01) { f.x += (dx / d) * f.speed * dt; f.z += (dz / d) * f.speed * dt; }
        // and they keep out of each other's way
        const o = pair![1 - j], sx = f.x - o.x, sz = f.z - o.z, sd = Math.hypot(sx, sz);
        if (sd < 1.1 && sd > 1e-3) { f.x += (sx / sd) * (1.1 - sd) * 0.5; f.z += (sz / sd) * (1.1 - sd) * 0.5; }
        f.y += (this.map.ground(f.x, f.z) - f.y) * Math.min(1, dt * 10);
        let turn = Math.atan2(-dx, -dz) - f.yaw;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        f.yaw += turn * Math.min(1, dt * 5);
        f.phase += dt * f.speed * 2.6;
        f.p.root.position.set(f.x, f.y, f.z);
        f.p.root.rotation.y = f.yaw;
        f.p.walk(f.phase, Math.min(1, f.speed / 2));
        // the one talking wags a finger at you
        if (f.speed < 0.6 && this.pointing(p.id, j)) { f.p.arms[1].rotation.x = 1.35; f.p.fores[1].rotation.set(0.2, 0, Math.sin(t * 9) * 0.25); }
        else { f.p.arms[1].rotation.x = Math.sin(f.phase) * 0.4 * Math.min(1, f.speed / 2); f.p.fores[1].rotation.set(0.15, 0, 0); }
        f.p.tick(dt);
      });
      // what they say: to you, out loud; to anyone else, only in a bubble
      if (!near) continue;
      if (p.id === me.id) {
        this.talkT -= dt;
        if (this.talkT <= 0) {
          const d = Math.hypot(p.x - this.x, p.z - this.z), hour = timeOfDay() * 24;
          const pool = !this.saidHello ? HELLO
            : d > ZONE - 40 && performance.now() - this.farSaid > 15000 ? (this.farSaid = performance.now(), FAR)
            : this.carriers.has(me.id) ? CARRYING
            : hour > 16 && hour < 20 && Math.random() < 0.35 ? DARK_SOON : NAG;
          this.saidHello = true;
          this.nag(pool);
        }
      } else {
        const f = pair[Math.floor(t / 9 + hash(p.id)) % 2];
        if ((t + (hash(p.id) % 97)) % 11 < dt) f.p.say(fill(NAG[Math.floor(Math.random() * NAG.length)], this.s.n), 3.5);
      }
    }
    for (const id of [...this.prefects.keys()]) if (id !== me.id && !others.some((p) => p.id === id)) this.dropPrefects(id);
  }
  private saidHello = false;
  private pointT = 0;

  private pointing(id: string, j: number) { return this.me?.id === id && j === this.talker && performance.now() < this.pointT; }

  /** One of your prefects has a go at you, if they're about. */
  private nag(pool: string[]) {
    const me = this.me, pair = me && this.prefects.get(me.id);
    if (!me || !pair) return;
    this.talker = 1 - this.talker;
    const f = pair[this.talker], line = fill(deal(this.hands[pool[0]] ??= [], pool), this.s.n);
    f.p.say(line, 4);
    Posh.speak(line, 300 + this.talker, Math.hypot(f.x - me.x, f.z - me.z), PREFECT_VOICES[this.talker]);
    this.pointT = performance.now() + 2500;
    this.talkT = 6 + Math.random() * 4;
  }

  private dropPrefects(id: string) {
    for (const f of this.prefects.get(id) ?? []) { this.group.remove(f.p.root); f.p.dispose(); }
    this.prefects.delete(id);
  }

  // ---- bonfire night ----

  /** How far the fire's got: 0 till the first lab coat lights it, 1 a few seconds later. */
  private fireK() { return THREE.MathUtils.clamp((this.burnT - LIGHT_AT) / 6, 0, 1); }

  private burn(dt: number, t: number, me: Player, far: number) {
    if (!this.s.b) {
      if (this.walkers.length) { for (const w of this.walkers) { this.group.remove(w.p.root); w.p.dispose(); } this.walkers = []; }
      this.rockets.length = this.fuses.length = this.lighting.length = 0;
      this.darken();
      return;
    }
    // lit: seen it lit just now, or come along when it's been going a while
    if (this.burnT < 0) this.burnT = this.fresh && !this.walkers.length && far < 400 ? 0 : 999;
    this.burnT += dt;
    const k = this.fireK();
    this.fire.visible = k > 0;
    // the pile chars as it burns
    this.stackMat.color.setRGB(1, 1, 1).lerp(CHAR, THREE.MathUtils.clamp((this.burnT - LIGHT_AT) / 240, 0, 1));
    if (this.guy) this.guy.root.visible = this.burnT < LIGHT_AT + 150;
    // the flames, the smoke and the light on the ground
    this.flames.forEach((s, j) => {
      const f = (t * (0.8 + (j % 3) * 0.15) + j / this.flames.length) % 1, a = j * 2.4;
      const r = (1 - f) * (0.4 + (j % 4) * 0.2);
      s.position.set(Math.cos(a) * r, 0.4 + f * 3.6 * k, Math.sin(a) * r);
      s.scale.setScalar((2.4 - f * 1.6) * (0.9 + 0.2 * Math.sin(t * 13 + j)) * (0.3 + 0.7 * k));
      s.material.opacity = Math.sin(f * Math.PI) * 0.9 * k;
    });
    this.smoke.forEach((s, j) => {
      const f = (t * 0.12 + j / this.smoke.length) % 1;
      s.position.set(Math.sin(t * 0.3 + j) * f * 2, 3.5 + f * 12, Math.cos(t * 0.2 + j) * f * 1.5);
      s.scale.setScalar(1.5 + f * 6);
      s.material.opacity = Math.sin(f * Math.PI) * 0.35 * k;
    });
    const flicker = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 5.3);
    if (this.glow) (this.glow.material as THREE.MeshBasicMaterial).opacity = flicker * k;
    if (this.fireLight) this.fireLight.intensity = FIRE_LIGHT * flicker * k;
    if (k > 0) {
      // embers
      if (Math.random() < dt * 30 * k) this.sparks.emit(this.x + (Math.random() - 0.5) * 1.5, this.y + 2 + Math.random() * 1.5, this.z + (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5, 2 + Math.random() * 2, (Math.random() - 0.5) * 1.5, EMBER, 0.09, 2 + Math.random() * 1.5, 0.6, -0.6, true);
      this.crackleT -= dt;
      if (this.crackleT <= 0) {
        this.crackleT = 0.08 + Math.random() * 0.3;
        const [d, pan] = this.hear(this.x, this.y + 1, this.z);
        if (d < 70) SFX.crackle(d, pan);
      }
    }
    this.labCoats(t, far);
    this.fireworks(dt, me);
  }

  /** The fire's light out (it stays in the scene, dark, so nothing has to be rebuilt when it comes on). */
  private darken() {
    if (this.fireLight) this.fireLight.intensity = 0;
  }

  /** The crowd in lab coats: out of Westwood and along Fonthill Road, the first one up to the pile
   *  to light it, then all round the fire with sparklers, bending down now and then to light a rocket. */
  private labCoats(t: number, far: number) {
    if (!this.walkers.length && far < 500) {
      for (let k = 0; k < COATS; k++) {
        const { p, tip } = labCoat(k);
        this.group.add(p.root);
        this.walkers.push({ p, tip, x: this.x, z: this.z, yaw: 0, slot: k });
      }
    }
    if (!this.walkers.length) return;
    const sparkle = new THREE.Color();
    const v = new THREE.Vector3();
    this.walkers.forEach((w, k) => {
      const at = coatAt(k, this.burnT);
      if (!at) { w.p.root.visible = false; return; }
      w.p.root.visible = true;
      const x = this.x + at.ex, z = this.z - at.ny;
      const lighting = (this.lighting[k] ?? 0) > this.burnT;
      const atPile = k === 0 && !at.walking && this.burnT < BACK_AT;
      const toFire = Math.atan2(-(this.x - x), -(this.z - z));
      if (at.walking) {
        const dx = x - w.x, dz = z - w.z;
        if (Math.hypot(dx, dz) > 0.001) w.yaw = Math.atan2(-dx, -dz);
      } else w.yaw = lighting ? toFire + Math.PI : toFire;   // a rocket's lit behind them, outside the ring
      w.x = x; w.z = z;
      w.p.root.position.set(x, this.map.ground(x, z), z);
      w.p.root.rotation.y = w.yaw;
      w.p.body.position.y = at.walking ? Math.abs(Math.sin(t * 7 + k)) * 0.05 : 0;
      if (lighting || atPile) {
        // bent down, the sparkler to the touchpaper (or the pile)
        w.p.body.rotation.x = -0.35;
        w.p.arms[1].rotation.set(0.6, 0, 0);
        w.p.fores[1].rotation.x = 0.3;
      } else {
        // the sparkler, held up and waved about
        w.p.body.rotation.x = 0;
        w.p.arms[1].rotation.set(1.25 + Math.sin(t * 2.6 + k) * 0.35, 0, Math.cos(t * 3.1 + k * 2) * 0.3);
        w.p.fores[1].rotation.x = 0.55;
      }
      if (far < 160) {
        w.p.root.updateMatrixWorld(true);
        w.tip.getWorldPosition(v);
        sparkle.setRGB(1, 0.9 + Math.random() * 0.1, 0.65 + Math.random() * 0.3);
        for (let n = 0; n < 2; n++) {
          const sx = (Math.random() - 0.5) * 3, sy = (Math.random() - 0.3) * 3, sz = (Math.random() - 0.5) * 3;
          this.sparks.emit(v.x, v.y, v.z, sx, sy, sz, sparkle, 0.05, 0.25 + Math.random() * 0.25, 2, 3, true);
        }
      }
    });
  }

  /** Rockets, all night once the lab coats are all round the fire: one of them bends down and
   *  lights it just outside the ring, the touchpaper fizzes, and up it goes and bursts in colours. */
  private fireworks(dt: number, me: Player) {
    this.nextRocket -= dt;
    if (this.nextRocket <= 0 && this.burnT > ALL_IN) {
      // in flurries: a few in quick succession, then a pause
      this.nextRocket = Math.random() < 0.3 ? 0.4 + Math.random() * 0.5 : 1.5 + Math.random() * 3;
      let k = Math.floor(Math.random() * COATS);
      if ((this.lighting[k] ?? 0) > this.burnT) k = (k + 7) % COATS;
      const [ex, ny] = slot(k, RING + 1.1);
      this.fuses.push({ t: 1.1, x: this.x + ex, z: this.z - ny });
      this.lighting[k] = this.burnT + 1.5;
    }
    const fizz = new THREE.Color("#ffe0a0");
    this.fuses = this.fuses.filter((f) => {
      f.t -= dt;
      const y = this.map.ground(f.x, f.z) + 0.2;
      this.sparks.emit(f.x, y, f.z, (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2, fizz, 0.05, 0.3, 2, 4, true);
      if (f.t > 0) return true;
      this.rockets.push({ x: f.x, y, z: f.z, vx: (Math.random() - 0.5) * 3, vy: 30 + Math.random() * 8, vz: (Math.random() - 0.5) * 3, t: 1.4 + Math.random() * 0.8, kind: Math.floor(Math.random() * 4) });
      const [d, pan] = this.hear(f.x, y, f.z);
      SFX.rocket(d, pan);
      return false;
    });
    const trail = new THREE.Color("#ffcf80");
    this.rockets = this.rockets.filter((r) => {
      r.t -= dt;
      r.vy -= 6 * dt;
      r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
      this.sparks.emit(r.x, r.y, r.z, (Math.random() - 0.5) * 0.8, -1, (Math.random() - 0.5) * 0.8, trail, 0.12, 0.5, 1, 2);
      if (r.t > 0) return true;
      this.burst(r, me);
      return false;
    });
  }

  private burst(r: Rocket, me: Player) {
    const PAL = ["#ff3b3b", "#3bff6a", "#3b8bff", "#ffd23b", "#ff3bd8", "#3bf5ff", "#ffffff", "#ff8a2b"].map((c) => new THREE.Color(c));
    const a = PAL[Math.floor(Math.random() * PAL.length)], b = PAL[Math.floor(Math.random() * PAL.length)];
    const gold = new THREE.Color("#ffc46a");
    const dir = this.dir;
    if (r.kind === 0 || r.kind === 3) {
      // a peony: a ball of stars, in two colours for kind 3
      for (let k = 0; k < 110; k++) {
        dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(13 + Math.random() * 3);
        this.sparks.emit(r.x, r.y, r.z, dir.x, dir.y, dir.z, r.kind === 3 && k % 2 ? b : a, 0.55, 1.6 + Math.random() * 0.6, 1.3, 3.5);
      }
    } else if (r.kind === 1) {
      // a willow: long gold trails drooping down
      for (let k = 0; k < 120; k++) {
        dir.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(9 + Math.random() * 2);
        this.sparks.emit(r.x, r.y, r.z, dir.x, dir.y, dir.z, gold, 0.45, 3 + Math.random(), 1.6, 2.5, true);
      }
    } else {
      // a ring, tipped at an angle
      const tip = Math.random() * 0.8, spin = Math.random() * Math.PI;
      for (let k = 0; k < 70; k++) {
        const ang = (k / 70) * Math.PI * 2, c = Math.cos(ang) * 15, s = Math.sin(ang) * 15;
        dir.set(c, s * Math.sin(tip), s * Math.cos(tip)).applyAxisAngle(new THREE.Vector3(0, 1, 0), spin);
        this.sparks.emit(r.x, r.y, r.z, dir.x, dir.y, dir.z, a, 0.6, 1.8, 1.2, 3);
      }
      for (let k = 0; k < 30; k++) {
        dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(5);
        this.sparks.emit(r.x, r.y, r.z, dir.x, dir.y, dir.z, b, 0.4, 1.2, 1.5, 3, true);
      }
    }
    // a flash that lights up the trees and the court below
    this.flash?.go(r.x, r.y, r.z, r.kind === 1 ? gold : a, r.kind === 1 ? FLASH * 0.7 : FLASH, { twinkle: r.kind === 1 });
    // the bang, a moment later the further off you are
    const d = Math.hypot(r.x - me.x, r.y - me.y, r.z - me.z);
    const [hd, pan] = this.hear(r.x, r.y, r.z);
    setTimeout(() => SFX.bang(hd, pan, r.kind === 1), Math.min(4000, (d / 340) * 1000));
  }
}
