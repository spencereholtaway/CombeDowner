// The fly-overs: when a structure's sockets are full and the next zone opens (oddments.ts, zones.ts),
// your view goes under a cover, and comes out over the new zone's challenge, flying in from high
// and far to circle it under a card with the zone's name and anything else it opens; then the
// cover comes back over and lifts off your own view. When the last zone opens, it's a long, high,
// widening circle over the middle of the map. The paths are worked out from the spot and the
// map's own size, so they work on any map.
// The cover is a little loading screen of its own: "Something's happening", a snare drum rolling
// (drawn in the page, its roll synthesised in audio.ts) and bars that fill as the squares come in;
// the roll swells as they fill and ends on a cymbal as the cover lifts. Where's opened stays a
// surprise till the card on the fly-over.
// It has to play smoothly, so it doesn't set off until it can: under the cover, every square of
// the map the camera will see (and those round you, to come back to) is loaded and built, and
// then the whole way is drawn once, out of sight, so everything is on the graphics card. That
// takes a second or a few; WAIT_MAX is only for a machine that can't manage it. Its detail (trees,
// grass, lamps) is centred on the spot the whole time, so none of it changes as the camera goes
// round. Once it's over, the squares round you take over again and the rest are let go.
// The games list (gameslist.ts) plays any zone's opening on its own, without opening anything.
// E, Space, Enter, a click or a tap skips it, and so do the card's × and Esc. While it plays, you
// stand still and the HUD is out of the way.
// The card lands with a flash, a fanfare and a shower of confetti (more for the last zone), drawn
// on one canvas over the screen so it costs no more on a phone than on a desktop.
//
// Who decides what: nothing goes over the network. Each player's screen plays it when the host's
// word on the sockets (oddments.ts) says a milestone has just been reached; each sets off once its
// own squares are ready, so one may start a moment after another. Nothing waits on it ending.
import * as THREE from "three";
import type { GameMap } from "./map";
import type { World } from "./world";
import { Calm } from "./tiles";
import { ctl } from "./controls";
import { modal } from "./modal";
import * as SFX from "./audio";
import { view } from "./view";

export interface Shot {
  /** "spot": the sweep to a new challenge's place; "map": the finale's circle over the whole map. */
  kind: "spot" | "map";
  x: number; z: number;
  kicker: string; title: string; sub?: string;
  /** A line each under that: what else has just opened up (a new way to get about). */
  lines?: string[];
}

const SPOT_SECS = 8, MAP_SECS = 17, CARD_AT = 1.2;
const VEIL = 0.45;     // seconds for the cover to come over the view, or to lift
const WAIT_MAX = 20;  // seconds held for the squares on its way before it sets off regardless
const STEP = 0.1;     // seconds between the spots on its way whose squares it waits for
const REHEARSE = 24;
const HOLD = 0.3;     // seconds the cover stays over your own view as it comes back, while the detail round you returns  // steps of the way drawn once behind the cover before it plays
const LOAD_MIN = 0.9;  // seconds of the roll at the least, so a quick load isn't cut off
type Stage = "dim" | "load" | "rehearse" | "fly";

/** A snare drum and its sticks, the sticks rolling on it (style.css moves them, which costs the
 *  graphics card next to nothing). */
const DRUM = `<svg class="rvdrum" viewBox="0 0 120 92" aria-hidden="true">
<g class="rvstick rvl"><line x1="14" y1="6" x2="50" y2="42"/><circle cx="50" cy="42" r="3"/></g>
<g class="rvstick rvr"><line x1="106" y1="6" x2="70" y2="42"/><circle cx="70" cy="42" r="3"/></g>
<ellipse class="rvshell" cx="60" cy="76" rx="44" ry="11"/><rect class="rvshell" x="16" y="46" width="88" height="30"/>
<polyline class="rvlugs" points="16,50 27,72 38,50 49,72 60,50 71,72 82,50 93,72 104,50"/>
<ellipse class="rvhead" cx="60" cy="46" rx="44" ry="11"/></svg>`;
const ease = (t: number) => t * t * (3 - 2 * t);
const COLOURS = ["#ff4f6d", "#ffd23f", "#3ec1ff", "#5be37d", "#c77dff", "#ff9f1c", "#ffffff"];

interface Bit { x: number; y: number; vx: number; vy: number; a: number; va: number; w: number; h: number; c: string; ph: number }

/** Confetti over the whole screen, on one canvas, moved on by the fly-over's own frames. */
class Confetti {
  private bits: Bit[] = [];
  private g: CanvasRenderingContext2D | null;
  private scale = 1;
  constructor(readonly canvas: HTMLCanvasElement) { this.g = canvas.getContext("2d"); }

  /** Cannons from both bottom corners and a sprinkle from the top; big fills the sky. */
  burst(n: number) {
    const W = innerWidth, H = innerHeight, k0 = this.bits.length;
    for (let k = 0; k < n; k++) {
      const c = COLOURS[(k0 + k) % COLOURS.length], w = 7 + Math.random() * 7, h = 4 + Math.random() * 4;
      const ph = Math.random() * 6, a = Math.random() * 6, va = (Math.random() - 0.5) * 12;
      if (k % 3 === 2) {
        this.bits.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.4, vx: (Math.random() - 0.5) * 80, vy: 40 + Math.random() * 100, a, va, w, h, c, ph });
        continue;
      }
      const side = k % 3, ang = side ? Math.PI * (1.18 + Math.random() * 0.22) : -Math.PI * (0.18 + Math.random() * 0.22);
      const v = (0.9 + Math.random() * 0.9) * Math.max(H, 420);
      this.bits.push({ x: side ? W + 10 : -10, y: H * 0.9, vx: Math.cos(ang) * v, vy: -Math.abs(Math.sin(ang) * v), a, va, w, h, c, ph });
    }
  }

  get busy() { return this.bits.length > 0; }

  /** fade: 1 as it is, down to 0 as the fly-over ends. */
  update(dt: number, fade: number) {
    const cv = this.canvas, g = this.g;
    if (!g) return;
    // half the screen's own pixels at most: confetti is soft at the edges anyway, and a phone's
    // screen has three or four pixels to each one of ours
    const s = Math.min(1, (devicePixelRatio || 1) * 0.75), W = innerWidth, H = innerHeight;
    if (cv.width !== Math.round(W * s) || cv.height !== Math.round(H * s)) { cv.width = Math.round(W * s); cv.height = Math.round(H * s); this.scale = s; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    if (!this.bits.length) return;
    g.globalAlpha = Math.max(0, Math.min(1, fade));
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    let n = 0;
    for (const b of this.bits) {
      // fast out of the cannon, then drag and a flutter from side to side as it floats down
      b.vy += 900 * dt; b.vx *= 1 - Math.min(1, 1.6 * dt); b.vy = Math.min(b.vy, 150 + b.w * 6);
      b.ph += dt * 5;
      b.x += (b.vx + Math.sin(b.ph) * 40) * dt; b.y += b.vy * dt; b.a += b.va * dt;
      if (b.y > H + 30) continue;
      this.bits[n++] = b;
      const cs = Math.cos(b.a), sn = Math.sin(b.a), flip = Math.cos(b.ph * 1.3);
      g.setTransform(cs * this.scale, sn * this.scale, -sn * flip * this.scale, cs * flip * this.scale, b.x * this.scale, b.y * this.scale);
      g.fillStyle = b.c;
      g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    }
    this.bits.length = n;
  }

  clear() { this.bits.length = 0; }
}

/** The loading screen under the cover (drawn on the HUD page too, ui/stage.ts): the bars filled
 *  to p (0 to 1). */
export function loadingLook(veil: HTMLElement, p: number) {
  veil.querySelector<HTMLElement>("i")!.style.transform = `scaleX(${Math.min(1, Math.max(0, p)).toFixed(3)})`;
}
/** The cymbal: the drum jumps and the sticks stop, as the cover lifts. */
export function loadingHit(veil: HTMLElement) { veil.classList.add("rvhit"); }

export class Reveal {
  private shot: Shot | null = null;
  private stage: Stage = "dim";
  /** Seconds into the stage it's in. */
  private t = 0;
  private a0 = 0;
  private el: HTMLElement | null = null;
  private veil: HTMLElement | null = null;
  /** Where the world loads its detail round while it plays: the middle of the shot, which stays put
   *  so nothing near or far changes as the camera goes round. */
  readonly look = new THREE.Vector3();
  private cam = new THREE.Vector3();
  private confetti: Confetti | null = null;
  private landed = false;
  private fanfare: SFX.Playing | null = null;
  private kick = 0;
  private calm = new Calm(6, 150);
  /** Seconds left of the cover lifting off your own view once it's over. */
  private lifting = 0;
  private roll: SFX.Roll | null = null;
  /** How many squares it had to wait for when it started, for how far the loading's got. */
  private toLoad = 1;

  constructor(private map: GameMap, private world: World, private touch: () => boolean) {}

  get on() { return !!this.shot; }
  /** On, or its cover still lifting off your view. */
  get busy() { return !!this.shot || this.lifting > 0; }

  /** Start a fly-over: the view's covered first, from where the camera is now. */
  play(s: Shot, camera: THREE.Camera, me: { x: number; z: number }) {
    this.shot = s; this.stage = "dim"; this.t = 0;
    this.look.copy(camera.position);
    // it sets out from your side of the spot, so you see where it is from where you are
    this.a0 = Math.atan2(me.x - s.x, me.z - s.z);
    if (!Number.isFinite(this.a0)) this.a0 = 0;
    // and your own squares are kept, to come back to
    this.world.alsoBuild([{ x: camera.position.x, z: camera.position.z }, ...this.way()], view.fogFar);
    this.world.look();
    this.world.rush = true;
    this.toLoad = Math.max(1, this.world.alsoUnbuilt());
    this.calm.reset();
    this.card(s);
    this.roll = SFX.drumRoll();
  }

  skip() {
    if (!this.shot) return;
    if (this.stage === "fly") this.t = Math.max(this.t, this.secs() - VEIL);
    else this.back();
  }

  private secs() { return this.shot?.kind === "map" ? MAP_SECS : SPOT_SECS; }

  /** The middle of the shot, scene coordinates, at ground level. */
  private middle(s: Shot, out: THREE.Vector3) {
    if (s.kind === "spot") return out.set(s.x, this.map.ground(s.x, s.z) + 4, s.z);
    const fr = this.map.fieldFrame();
    return out.set(fr.x, this.map.ground(fr.x, -fr.y), -fr.y);
  }

  /** Where the camera is at t seconds in, looking at the middle. */
  private pose(s: Shot, t: number, cam: THREE.Vector3) {
    const f = t / this.secs(), m = this.middle(s, new THREE.Vector3());
    let cx: number, cy: number, cz: number;
    if (s.kind === "spot") {
      // in from high and far, down to a slow circle round it
      const k = ease(Math.min(1, f * 1.6)), r = 260 - 205 * k, h = 150 - 115 * k, a = this.a0 + f * 1.9;
      cx = m.x + Math.sin(a) * r; cz = m.z + Math.cos(a) * r; cy = m.y - 4 + h;
    } else {
      // a widening circle over the middle of the map, kept inside the fog's reach so there's a town to see
      const fr = this.map.fieldFrame(), k = ease(Math.min(1, f * 1.3));
      const R = 90 + (Math.min(fr.r * 0.6, view.fogFar * 0.5) - 90) * k, H = 50 + (R * 0.45 - 50) * k;
      const a = this.a0 + f * Math.PI * 1.6;
      cx = m.x + Math.sin(a) * R; cz = m.z + Math.cos(a) * R; cy = m.y + H;
    }
    return cam.set(cx, Math.max(cy, this.map.ground(cx, cz) + 18), cz);
  }

  /** Everywhere the camera will be, start to end. */
  private way(): { x: number; z: number }[] {
    const s = this.shot!, out: { x: number; z: number }[] = [], cam = new THREE.Vector3();
    for (let t = 0; t <= this.secs(); t += STEP) { this.pose(s, t, cam); out.push({ x: cam.x, z: cam.z }); }
    return out;
  }

  private place(camera: THREE.Camera, t: number) {
    camera.position.copy(this.pose(this.shot!, t, this.cam));
    camera.lookAt(this.look);
  }

  /** Every frame, whether it's on or not: put the camera where the shot has got to. Returns false
   *  when the camera's yours. */
  update(dt: number, camera: THREE.PerspectiveCamera): boolean {
    const s = this.shot;
    if (!s) {
      if (this.lifting > 0) {
        this.lifting -= dt;
        this.cover(this.lifting / VEIL);
        if (this.lifting <= 0) this.gone();
      }
      return false;
    }
    this.t += dt;
    if (this.stage !== "fly") this.loading();
    if (this.stage === "dim") {
      this.cover(this.t / VEIL);
      if (this.t < VEIL) return true;
      // only once the cover's right over the view: the detail round you goes as it moves out there
      this.middle(s, this.look);
      this.next("load");
    }
    if (this.stage === "load") {
      if (!this.calm.still(this.world.alsoUnbuilt()) && this.t < WAIT_MAX || this.t < LOAD_MIN) return true;
      this.next("rehearse");
    }
    if (this.stage === "rehearse") {
      // round the whole way once behind the cover, a frame or two a step, so everything it will
      // show has been drawn once and is on the graphics card, and nothing stutters as it plays
      const k = Math.floor(this.frames++ / 2);
      if (k < REHEARSE) { this.place(camera, (k / REHEARSE) * this.secs()); return true; }
      this.world.rush = false;
      this.roll?.hit(s.kind === "map"); this.roll = null;
      if (this.veil) loadingHit(this.veil);
      SFX.revealSwell(s.kind === "map");
      this.next("fly");
    }
    const T = this.secs();
    if (this.t >= T) { this.back(); return false; }
    this.cover(Math.max(1 - this.t / VEIL, 1 - (T - this.t) / VEIL));
    this.place(camera, this.t);
    if (this.kick > 0) {
      // a jolt as the card lands, dying away in a third of a second
      this.kick = Math.max(0, this.kick - dt * 3);
      const k = this.kick * this.kick * (s.kind === "map" ? 1.2 : 0.7);
      camera.position.y += Math.sin(this.t * 70) * k;
      camera.rotateZ(Math.sin(this.t * 53) * k * 0.012);
    }
    if (!this.landed && this.t > CARD_AT) this.land(s);
    if (this.el) this.el.classList.toggle("shown", this.t > CARD_AT && this.t < T - 1);
    this.confetti?.update(dt, Math.min(1, (T - this.t) / 1.2));
    return true;
  }

  /** Under the cover: the bars and the roll follow how far the loading's got (the last tenth is
   *  the rehearsal). */
  private loading() {
    const built = 1 - Math.min(1, this.world.alsoUnbuilt() / this.toLoad);
    const p = this.stage === "rehearse" ? 0.9 + 0.1 * Math.min(1, this.frames / (REHEARSE * 2)) : 0.9 * built;
    this.roll?.level(p);
    if (this.veil) loadingLook(this.veil, p);
  }

  private frames = 0;
  private next(stage: Stage) { this.stage = stage; this.t = 0; this.frames = 0; }

  private cover(v: number) {
    if (!this.veil) return;
    this.veil.style.opacity = String(Math.min(1, Math.max(0, v)));
    // (and the drum stops being drawn while the view's clear)
    this.veil.style.visibility = v > 0 ? "" : "hidden";
  }

  /** The card's arrival: the fanfare, the flash and a burst of confetti, with more to follow. */
  private land(s: Shot) {
    this.landed = true;
    const big = s.kind === "map";
    this.kick = 1;
    this.el?.classList.add("landed");
    const c = this.confetti;
    if (c) {
      c.burst(big ? 260 : 150);
      for (const [at, n] of big ? [[1.7, 200], [3.6, 220], [6, 160]] : [[1.4, 90]]) window.setTimeout(() => { if (this.confetti === c && this.shot === s) c.burst(n); }, at * 1000);
    }
    this.fanfare?.stop();
    this.fanfare = SFX.unlockFanfare(big);
  }

  private card(s: Shot) {
    this.el?.remove();
    const hud = document.getElementById("hud");
    if (!hud) return;
    const el = document.createElement("div");
    el.id = "reveal";
    const skip = this.touch() ? "Tap to skip" : `${ctl("use")} to skip`;
    el.className = s.kind === "map" ? "rvbig" : "";
    el.innerHTML = `<canvas class="rvconfetti"></canvas><div class="rvflash"></div><div class="rvveil">${DRUM}<p class="why">Something's happening<span>...</span></p><i></i></div><div class="rvcard"><small></small><h2></h2><p></p></div><button type="button" class="rvskip"></button>`;
    el.querySelector(".rvcard small")!.textContent = s.kicker;
    el.querySelector(".rvcard h2")!.textContent = s.title;
    el.querySelector(".rvcard p")!.textContent = s.sub ?? "";
    for (const line of s.lines ?? []) {
      const p = document.createElement("p");
      p.className = "rvnew"; p.textContent = line;
      el.querySelector(".rvcard")!.appendChild(p);
    }
    el.querySelector("button")!.textContent = skip;
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); this.skip(); });
    hud.appendChild(el);
    this.confetti = new Confetti(el.querySelector("canvas")!);
    this.landed = false; this.kick = 0;
    // its × puts the card away and ends the fly-over, as Esc does (modal.ts)
    modal(el, () => el.querySelector<HTMLElement>(".rvcard") ?? el, () => this.back());
    hud.classList.add("reveal");
    document.body.classList.add("reveal");
    this.el = el;
    this.veil = el.querySelector(".rvveil");
    this.cover(0);
  }

  /** Over, or skipped: the camera's yours again behind the cover, which then lifts. */
  private back() {
    if (!this.shot) return;
    this.world.alsoBuild([], 0);
    this.world.look();
    this.world.rush = false;
    this.shot = null;
    this.roll?.stop(); this.roll = null;
    this.fanfare?.stop(); this.fanfare = null;
    this.confetti?.clear(); this.confetti = null;
    this.kick = 0;
    this.el?.classList.add("rvback");
    const v = Number(this.veil?.style.opacity || 0);
    this.lifting = v >= 1 ? VEIL + HOLD : v * VEIL;
    if (this.lifting <= 0) this.gone();
  }

  private gone() {
    this.lifting = 0;
    this.el?.remove(); this.el = null; this.veil = null;
    document.getElementById("hud")?.classList.remove("reveal");
    document.body.classList.remove("reveal");
  }

  dispose() { this.back(); this.gone(); }
}
