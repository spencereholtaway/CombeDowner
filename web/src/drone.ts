// The drone: /drone on the chat phone (dev.ts) lifts you off your feet and flies you about Bath as a
// camera drone, quickly and through anything, to look over the map from the air. /drone again lands
// you on whatever's below, a roof if you're over one.
//
// Flying: W A S D move you level the way you're facing, the mouse looks, Space climbs and Shift
// sinks, and the mouse wheel (or Q) picks one of five speeds, from a slow drift for lining up a shot
// to a fast cruise across town. On a touch screen the stick moves, Jump climbs, Crouch sinks
// (tap again to stop) and the Weapon button picks the speed. A game controller flies it the way
// real drones and drone games do ("Mode 2"): the left stick climbs, sinks and turns, the right stick
// moves you forward, back and sideways, the D-pad's up and down tilt the camera (as the dial on a
// DJI's controller does), and L1 and R1 pick the speed. The view leans a little into turns and
// slides, as an FPV drone's camera does, but never off what the crosshair's on.
//
// C (Circle on a controller, or a tap on the view's name at the top of a touch screen) goes round the
// drone's views of the scenery (looks.ts): normal, plain white clay, clay with outlines, blueprint,
// and "what's what", each kind of thing in its own colour with a key under the bar; in that one the
// thing under the crosshair is named just below it, with its kind's colour, and outlined in yellow
// (pick.ts finds it as drawn, a few times a second): a building from the map's own outline of it,
// ground to eaves, with its type and height; anything else that stands on its own (a tree, a car,
// a person, a bench, a landmark) in a box round it; a big shared surface (a street, the ground) is
// only named. , and . zoom
// out and in, from 1x to 8x (the D-pad's left and right, or a tap on the zoom at the top), and the
// mouse looks round more slowly the further in you are.
//
// Depth of field (with it on in Settings: post.ts draws it): the drone focuses on whatever's under
// the crosshair (a hot air balloon going over too, not just the map), racking from one thing to the
// next as a real camera does, and [ and ] open the
// aperture wider (a shallower focus, more blur either side of it) or close it down (L3 on a
// controller goes round them). The aperture and the focus distance show on the drone's screen.
//
// P takes off and lands again, as /drone on the chat phone does.
//
// Snaps, for noting what's wrong with the map: the trigger (a click, Fire, R2) takes one. Each keeps
// a small picture of the view, crosshair and all, and where you were and what the crosshair was on,
// in memory until the page is closed. What you type on the phone while the drone's up is a note on
// your latest snap instead of a text to everyone. Every snap and every note puts this flight's snaps
// on the clipboard afresh, so after a few you can go straight to Claude Code and paste, and the next
// flight starts a fresh batch; the contact sheet carries the text too, printed under the pictures,
// so pasting the picture alone is enough. /drone copy does every snap since the page opened, by hand:
// a few lines of text, one per snap, made for pasting to Claude Code (the view as ?at=, which
// `npm run shoot` takes, the point under the crosshair and the square it's in), and a contact sheet
// of all the pictures, numbered the same. A paste of text gets the text and a paste of a picture (Ctrl+V
// in Claude Code) gets the sheet. /drone pic 3 copies just snap 3's picture, bigger; /drone clear
// forgets them all.
//
// While you fly the HUD is the drone's alone, a camera feed's screen (droneosd.ts: heading, height
// and speed ladders, where you are, the range to the crosshair, the view, the zoom and this flight's
// snaps; style.css hides the rest), and the game's people leave you be (game.ts): the host's naughty
// boys, cats and Bendy take you as passive, and those who talk to you as you pass think you're far
// overhead.
//
// Who decides what: it's all yours. You fly by moving yourself, so your position goes out as ever and
// the squares of Bath load round you as you go; others see you floating. While the drone's up you're
// in god mode by your own word ("god", game.ts), so nobody's shots take it out of the sky, and say
// you're flying ("dr"), so the host's people leave you be (an older host doesn't know it, and its
// naughty boys still come for you, harmlessly). Snaps never
// leave your machine except by your own paste.
import * as THREE from "three";
import { chatLine } from "./chat";
import { control, ctl } from "./controls";
import { timeOfDay } from "./daylight";
import { B } from "./gamepad";
import * as SFX from "./audio";
import { BUILT } from "./version";
import { KINDS, kindOf, type Kind } from "./kinds";
import { Looks } from "./looks";
import { DroneScreen } from "./droneosd";
import { Picker, type Picked } from "./pick";
import { roofMeshTop, type Building, type GameMap } from "./map";
import { depthOfField, type Focus } from "./post";
import type { Player } from "./player";

const SPEEDS = [3, 8, 20, 45, 90];     // m/s, picked with the wheel; the middle one to start
const LIFT = 0.6;                      // climbing and sinking go this much of the speed (and at least 3 m/s)
const TURN = 2.2;                      // rad/s, a pad's left stick turning you
const TILT = 1.2;                      // rad/s, the D-pad tilting the camera
const EASE = 4;                        // how quickly the drone gets up to the speed asked for (per second)
const LOW = 0.5;                       // the camera stays this far above the ground
const HIGH = 900;                      // and no further than this above it
const ROLL = 0.18;                     // radians of lean at full slide or a brisk turn
const PIC_W = 960;                     // a snap's picture, at most this wide
const SHEET_W = 480;                   // each snap's width on the contact sheet
const RAY = 3000;                      // how far the crosshair's ray looks for something
const ZOOMS = [1, 1.5, 2, 3, 4, 6, 8];   // , and . step through these
/** [ and ] step through these apertures (depth of field), as a share of the focus distance: wider
 *  blurs more. And what they're called on the drone's screen, as a camera's f-numbers. */
const APERTURES = [0.0015, 0.003, 0.006, 0.012, 0.024, 0.048];
const F_STOPS = ["F/16", "F/8", "F/4", "F/2", "F/1.4", "F/1"];
const SHEET_MAX = 1500;                // the contact sheet's pictures, no wider than this all told
const PRINT_PX = 15, PRINT_PAD = 10, PRINT_MIN_W = 960;   // the text printed under them

const held = (keys: Set<string>, id: string, fallback: string) => (control(id)?.keys ?? [fallback]).some((c) => keys.has(c));

/** A snap: where the drone was, what the crosshair was on, and the picture. */
export interface Snap {
  n: number;
  time: string;           // the game's clock, hh:mm
  at: string;             // the camera, as ?at= takes it: east, north, bearing, tilt, height off the ground
  aim: string;            // the point under the crosshair: east, north, height off the ground there, then how far
  square: string;         // the square of Bath it's in, ti,tj ("" off the squares)
  hit: string;            // what the game's solid ray hit there: building, barrier, tree, ground, vehicle, balloon, or sky
  look: string;           // the drone's view it was taken in, if not the normal one
  seen: string;           // what "what's what" named under the crosshair, if that was the view
  note: string;
  pic: Blob | null;       // JPEG, once the frame's been drawn
}

/** What the drone needs from the game (game.ts). */
export interface DroneHooks {
  map: GameMap;
  player: Player;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  mapId: string;
  /** Can you take off just now (on your feet, alive, not in a vehicle or on a ride)? A reason if not. */
  why(): string | null;
  /** Anything that moves about on its own and isn't in the map's ray (a balloon): how far along the
   *  ray it is, and what to call it, or null. */
  meets?(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): { dist: number; what: string } | null;
  /** The drone went up or came down: let everyone know, and put you on your feet. */
  changed(on: boolean): void;
}

export class Drone {
  on = false;
  readonly snaps: Snap[] = [];
  /** The view the drone shows the scenery in (looks.ts). */
  readonly looks = new Looks();
  private gear = 2;
  private zoomAt = 0;
  private stop = 2;                    // which of APERTURES
  private focusAt = 50;                // metres: where it's focused, racking towards what's under the crosshair
  private eye = new THREE.Vector3();
  private v = new THREE.Vector3();
  private roll = 0;
  private lastYaw = 0;
  private trig = false;
  private wanted: Snap | null = null;
  private pad = { lx: 0, ly: 0, rx: 0, ry: 0, at: 0 };
  private tilt = 0;                    // the D-pad: -1 down, 1 up
  private screen: DroneScreen | null = null;
  private home = new THREE.Vector3();  // where it took off, for how far it's gone
  private upAt = 0;                    // when it took off (ms)
  private range: number | null = null; // metres to what's under the crosshair, by the game's own ray
  private rangeT = 0;
  // "what's what": what's under the crosshair, its name below it and its outline
  private picker = new Picker();
  private peekAt = 0;
  private peeking = false;
  private seen: { text: string; kind: Kind } | null = null;
  private outline: THREE.LineSegments | null = null;
  private count = 0;
  private flightFrom = 0;              // how many snaps there were when this flight began
  private copying = false;             // the clipboard's being written; again: write it once more after, with what's changed
  private copyAgain = false;
  private copyTold = false;            // said once this flight that the clipboard wouldn't take them

  constructor(private h: DroneHooks) {}

  /** /drone, and what came after it. */
  command(rest: string) {
    const [word = "", arg = ""] = rest.trim().toLowerCase().split(/\s+/);
    if (!word || word === "on" || word === "off") {
      if (word === "on" && this.on || word === "off" && !this.on) return;
      this.toggle();
      return;
    }
    if (word === "copy") { this.copy(); return; }
    if (word === "pic" || word === "pics") { this.copyPic(Number(arg)); return; }
    if (word === "clear") { const n = this.snaps.length; this.snaps.length = 0; this.flightFrom = 0; chatLine(n ? `Forgot ${n} snap${n === 1 ? "" : "s"}` : "No snaps to forget"); this.drawOsd(); return; }
    chatLine("/drone to fly or land, /drone copy, /drone pic 3, /drone clear");
  }

  private toggle() {
    if (this.on) { this.land(); return; }
    const why = this.h.why();
    if (why) { chatLine(why); return; }
    const p = this.h.player;
    this.on = true;
    this.eye.set(p.pos.x, p.pos.y + p.eyeHeight + 2, p.pos.z);
    this.v.set(0, 0, 0);
    this.roll = 0;
    this.lastYaw = p.yaw;
    this.trig = true;   // the press that's down now doesn't snap
    this.flightFrom = this.snaps.length;
    this.copyTold = false;
    this.home.copy(this.eye);
    this.upAt = performance.now();
    this.h.changed(true);
    this.showOsd(true);
    chatLine(`Drone up. Shoot to snap: they go on the clipboard as you take them, ready to paste. Type here to note the last one; ${ctl("drone")} to land`);
  }

  /** Down on whatever's below: the ground, or a roof. */
  land() {
    if (!this.on) return;
    this.on = false;
    this.showSeen(null);
    const p = this.h.player, m = this.h.map;
    const x = this.eye.x, z = this.eye.z;
    const y = m.floor(x, z, this.eye.y);
    p.pos.set(x, Math.max(y, m.ground(x, z)), z);
    p.vel.set(0, 0, 0);
    p.crouchLatch = false;
    this.zoomAt = 0;
    this.h.changed(false);
    this.showOsd(false);
    chatLine(this.snaps.length ? `Landed. ${this.snaps.length} snap${this.snaps.length === 1 ? "" : "s"} kept: /drone copy` : "Landed");
  }

  /** The wheel, Q, L1 and R1, the touch Weapon button: a speed up or down (round from the top on a touch screen). */
  gearStep(by: number, wrap = false) {
    const n = this.gear + by;
    this.gear = wrap ? (n + SPEEDS.length) % SPEEDS.length : Math.max(0, Math.min(SPEEDS.length - 1, n));
    this.drawOsd();
  }

  /** How far in the camera's zoomed. */
  get zoom() { return ZOOMS[this.zoomAt]; }

  /** , and ., the D-pad's left and right, a tap on the zoom at the top (round from the top): zoom out or in. */
  zoomStep(by: number, wrap = false) {
    const n = this.zoomAt + by;
    this.zoomAt = wrap ? (n + ZOOMS.length) % ZOOMS.length : Math.max(0, Math.min(ZOOMS.length - 1, n));
    this.drawOsd();
  }

  /** ] and [: the aperture wider (1, a shallower focus) or narrower (-1); L3 goes round them (wrap). */
  apertureStep(by: number, wrap = false) {
    if (!depthOfField) { chatLine("Depth of field is off: turn it on in Settings, Video"); return; }
    const n = this.stop + by;
    this.stop = wrap ? (n + APERTURES.length) % APERTURES.length : Math.max(0, Math.min(APERTURES.length - 1, n));
    this.drawOsd();
  }

  /** The depth of field to draw while the drone's up (post.ts draws it if it's on in Settings). */
  get lens(): Focus | null {
    if (!this.on) return null;
    return { focus: this.focusAt, aperture: APERTURES[this.stop] * this.focusAt };
  }

  /** The camera's field of view (degrees, top to bottom) for the game's own, zoomed. */
  fovFor(base: number): number {
    if (!this.on || this.zoom === 1) return base;
    return 2 * Math.atan(Math.tan(base * Math.PI / 360) / this.zoom) * 180 / Math.PI;
  }

  /** A game controller's sticks while the drone's up (gamepad.ts): Mode 2. */
  sticks(lx: number, ly: number, rx: number, ry: number) { this.pad = { lx, ly, rx, ry, at: performance.now() }; }

  /** A game controller's buttons while the drone's up: true if the drone took it. */
  padButton(b: number, down: boolean): boolean {
    if (b === B.up || b === B.down) { this.tilt = down ? (b === B.up ? 1 : -1) : 0; return true; }
    if (b === B.l1 || b === B.r1) { if (down) this.gearStep(b === B.r1 ? 1 : -1); return true; }
    if (b === B.left || b === B.right) { if (down) this.zoomStep(b === B.right ? 1 : -1); return true; }
    if (b === B.l3) { if (down) this.apertureStep(1, true); return true; }
    return false;
  }

  /** Once a frame while the drone's up, in place of walking. */
  fly(dt: number, active: boolean) {
    const p = this.h.player, k = p.keys, m = this.h.map;
    let fx = 0, fz = 0, up = 0;
    const padOn = performance.now() - this.pad.at < 200;
    if (active) {
      if (held(k, "forward", "KeyW")) fz -= 1;
      if (held(k, "back", "KeyS")) fz += 1;
      if (held(k, "strafeleft", "KeyA")) fx -= 1;
      if (held(k, "straferight", "KeyD")) fx += 1;
      if (!fx && !fz && !padOn) { fx = p.joy.x; fz = p.joy.y; }
      if (k.has("Space") || p.jumpHeld) up += 1;
      if (k.has("ShiftLeft") || k.has("ShiftRight") || p.crouchLatch) up -= 1;
      if (padOn) {
        fx += this.pad.rx; fz += this.pad.ry;
        up -= this.pad.ly;
        p.yaw -= this.pad.lx * TURN * dt;
        p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch + this.tilt * TILT * dt));
      }
    }
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }
    up = Math.max(-1, Math.min(1, up));
    const s = SPEEDS[this.gear], sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    const want = new THREE.Vector3((fx * cy + fz * sy) * s, up * Math.max(3, s * LIFT), (-fx * sy + fz * cy) * s);
    this.v.lerp(want, 1 - Math.exp(-EASE * dt));
    this.eye.addScaledVector(this.v, dt);
    const g = m.ground(this.eye.x, this.eye.z);
    if (this.eye.y < g + LOW) { this.eye.y = g + LOW; this.v.y = Math.max(0, this.v.y); }
    if (this.eye.y > g + HIGH) { this.eye.y = g + HIGH; this.v.y = Math.min(0, this.v.y); }
    // lean into a slide to the side and into a turn, as an FPV camera does (a roll leaves the crosshair where it is)
    const side = this.v.x * cy - this.v.z * sy;
    const turn = dt > 0 ? Math.atan2(Math.sin(p.yaw - this.lastYaw), Math.cos(p.yaw - this.lastYaw)) / dt : 0;
    this.lastYaw = p.yaw;
    const lean = Math.max(-1, Math.min(1, -side / 40 + turn * 0.12)) * ROLL;
    this.roll += (lean - this.roll) * (1 - Math.exp(-6 * dt));
    // you go where the drone goes, so the squares load round you and the others see where you are
    p.pos.set(this.eye.x, this.eye.y - p.eyeHeight, this.eye.z);
    p.vel.set(0, 0, 0);
    const cam = this.h.camera;
    cam.position.copy(this.eye);
    cam.rotation.set(p.pitch, p.yaw, this.roll, "YXZ");
    if ((this.rangeT -= dt) <= 0) {
      this.rangeT = 0.2;
      const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), hit = this.aim(this.eye, d);
      this.range = hit ? hit.dist : null;
    }
    // the focus racks over to what's under the crosshair (the far distance, if that's the sky)
    const sharp = Math.log(Math.max(0.5, this.range ?? 2000)), rack = 1 - Math.exp(-dt * 5);
    this.focusAt = Math.exp(Math.log(this.focusAt) + (sharp - Math.log(this.focusAt)) * rack);
    this.drawOsd();
  }

  /** C: on to the next view of the scenery. */
  nextLook() {
    this.looks.next();
    this.drawOsd(true);
  }

  /** The trigger, once a frame while the drone's up: a press takes a snap. */
  trigger(down: boolean) {
    if (down && !this.trig) this.snap();
    this.trig = down;
  }

  /** What's under the crosshair, along d from e: the nearest of the map (ground, buildings, trees,
   *  vehicles) and whatever else is about (a balloon), and how far off. */
  private aim(e: THREE.Vector3, d: THREE.Vector3): { dist: number; what: string } | null {
    const hit = this.h.map.raycast(e.x, e.y, e.z, d.x, d.y, d.z, RAY);
    const near = hit ? { dist: hit.dist, what: hit.mover ? "vehicle" : hit.kind } : null;
    const other = this.h.meets?.(e.x, e.y, e.z, d.x, d.y, d.z, near ? near.dist : RAY) ?? null;
    return other && (!near || other.dist < near.dist) ? other : near;
  }

  /** Take a snap: what's where now, and the picture once this frame's drawn (framed). */
  private snap() {
    if (this.wanted) return;
    const cam = this.h.camera, m = this.h.map, p = this.h.player;
    const e = this.eye, deg = (r: number) => Math.round(r * 180 / Math.PI);
    const bearing = ((deg(-p.yaw) % 360) + 360) % 360;
    const at = `${e.x.toFixed(1)},${(-e.z).toFixed(1)},${bearing},${deg(p.pitch)},${(e.y - m.ground(e.x, e.z)).toFixed(1)}`;
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const hit = this.aim(e, d);
    let aim = "", square = "", what = "sky";
    const sq = (x: number, z: number) => {
      const I = m.tileIndex;
      if (!I) return "";
      const S = I.cells * I.dx;
      return `${Math.floor((x - I.x0) / S)},${Math.floor((-z - I.y0) / S)}`;
    };
    if (hit) {
      const hx = e.x + d.x * hit.dist, hy = e.y + d.y * hit.dist, hz = e.z + d.z * hit.dist;
      aim = `${hx.toFixed(1)},${(-hz).toFixed(1)},${(hy - m.ground(hx, hz)).toFixed(1)} (${Math.round(hit.dist)} m)`;
      square = sq(hx, hz);
      what = hit.what;
    } else square = sq(e.x, e.z);
    const t = timeOfDay() * 24, hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
    const look = (this.looks.id === "normal" ? "" : this.looks.name) + (this.zoom === 1 ? "" : `${this.looks.id === "normal" ? "" : ", "}zoomed ${this.zoom}x`);
    const seen = this.looks.id === "kinds" && this.seen ? this.seen.text : "";
    const s: Snap = { n: ++this.count, time: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`, at, aim, square, hit: what, look, seen, note: "", pic: null };
    this.snaps.push(s);
    this.wanted = s;
    SFX.tick();
    this.screen?.flash();
    chatLine(`Snap ${s.n}${what === "sky" ? "" : `: ${what}, ${Math.round(hit!.dist)} m`}, on the clipboard. Type here to add a note`);
    this.drawOsd();
  }

  /** main.ts, straight after drawing each frame: the picture for a snap that's waiting for one. */
  framed(canvas: HTMLCanvasElement) {
    const s = this.wanted;
    if (!s) return;
    this.wanted = null;
    const k = Math.min(1, PIC_W / canvas.width), w = Math.round(canvas.width * k), h = Math.round(canvas.height * k);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d")!;
    // drawn in the same moment as the frame, before the browser clears it
    g.drawImage(canvas, 0, 0, w, h);
    crosshair(g, w / 2, h / 2, Math.max(6, h / 40));
    label(g, `${s.n}`, 6, 6, Math.max(14, h / 22));
    c.toBlob((b) => { s.pic = b; this.autoCopy(); }, "image/jpeg", 0.85);
  }

  /** What you type on the phone while the drone's up: a note on the latest snap. False if there's none. */
  note(text: string): boolean {
    const s = this.snaps[this.snaps.length - 1];
    if (!s) return false;
    s.note = s.note ? `${s.note}; ${text}` : text;
    chatLine(`Note on snap ${s.n}: ${s.note}`);
    this.autoCopy();
    return true;
  }

  /** Snaps as text, for pasting to Claude Code. */
  text(snaps = this.snaps): string {
    const url = location.origin + location.pathname;
    const lines = [
      `Drone snaps from Combe Downer: ${snaps.length} on map ${this.h.mapId}, build ${BUILT}, ${url}`,
      "at= is the camera as ?at= takes it (east, north, bearing, tilt, height off the ground: npm run shoot takes it too); aim= is the point under the crosshair (east, north, height off the ground there) and how far off; square is ti,tj; hit is what the game's solid ray met. The pictures (pasted separately, if they came) are numbered the same, the crosshair marking the spot.",
    ];
    for (const s of snaps) lines.push(`#${s.n} ${s.time} at=${s.at}${s.aim ? `  aim=${s.aim}` : ""}${s.square ? `  square ${s.square}` : ""}  hit ${s.hit}${s.look ? `  view ${s.look}` : ""}${s.seen ? `  seen "${s.seen}"` : ""}${s.note ? `  "${s.note}"` : ""}`);
    return lines.join("\n");
  }

  /** /drone copy: the text and the contact sheet on the clipboard together. */
  private async copy() {
    if (!this.snaps.length) { chatLine("No snaps yet: fly with /drone and shoot to take one"); return; }
    const n = this.snaps.length, got = await this.toClipboard(this.snaps);
    chatLine(got === "both" ? `Copied ${n} snap${n === 1 ? "" : "s"}: paste for the text, Ctrl+V in Claude Code for the pictures`
      : got === "text" ? `Copied the text of ${n} snap${n === 1 ? "" : "s"} (the pictures wouldn't go: /drone pic 1)` : "Couldn't copy: the browser said no");
  }

  /** After each snap and note: every snap on the clipboard, text and pictures, without being asked.
   *  One write at a time; anything new while one's going is written straight after. */
  private autoCopy() {
    if (this.copying) { this.copyAgain = true; return; }
    this.copying = true;
    this.toClipboard(this.snaps.slice(this.flightFrom)).then((got) => {
      if (got !== "both" && !this.copyTold) {
        this.copyTold = true;
        chatLine(got === "text" ? "Only the snaps' text would go on the clipboard: /drone pic 1 for a picture" : "The browser won't let snaps on the clipboard by themselves: /drone copy when you're done");
      }
    }).finally(() => {
      this.copying = false;
      if (this.copyAgain) { this.copyAgain = false; this.autoCopy(); }
    });
  }

  /** These snaps on the clipboard: the text and the contact sheet together if the browser will, else the text. */
  private async toClipboard(snaps: Snap[]): Promise<"both" | "text" | "none"> {
    if (!snaps.length) return "none";
    const text = this.text(snaps);
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([text], { type: "text/plain" }), "image/png": this.sheet(snaps) })]);
      return "both";
    } catch {
      try { await navigator.clipboard.writeText(text); return "text"; } catch { return "none"; }
    }
  }

  /** /drone pic 3: one snap's picture on the clipboard, at full size (the latest if no number). */
  private async copyPic(n: number) {
    const s = n ? this.snaps.find((x) => x.n === n) : this.snaps[this.snaps.length - 1];
    if (!s) { chatLine(n ? `No snap ${n}` : "No snaps yet"); return; }
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": this.png([s], 1, PIC_W) })]);
      chatLine(`Copied snap ${s.n}'s picture`);
    } catch { chatLine("Couldn't copy the picture: the browser said no"); }
  }

  /** Snaps' pictures on one sheet, as near square as they'll go, each numbered, with their text
   *  printed under them, so the picture alone tells Claude Code everything. Kept to a width that a
   *  pasted picture isn't shrunk from, so the print stays sharp. */
  private sheet(snaps: Snap[]): Promise<Blob> {
    const cols = Math.ceil(Math.sqrt(snaps.length));
    return this.png(snaps, cols, Math.min(SHEET_W, Math.floor((SHEET_MAX - (cols + 1) * 4) / cols)), this.text(snaps));
  }

  private async png(snaps: Snap[], cols: number, tw: number, print = ""): Promise<Blob> {
    const pics = await Promise.all(snaps.map(async (s) => (s.pic ? createImageBitmap(s.pic) : null)));
    const first = pics.find(Boolean);
    const th = Math.round(tw * (first ? first.height / first.width : 9 / 16));
    const rows = Math.ceil(snaps.length / cols), gap = 4;
    const c = document.createElement("canvas");
    const g = c.getContext("2d")!;
    // the print, wrapped to the sheet's width (which is at least wide enough to read it at)
    const W = Math.max(cols * tw + (cols + 1) * gap, print ? PRINT_MIN_W : 0), font = `${PRINT_PX}px ui-monospace, Menlo, Consolas, monospace`;
    g.font = font;
    const printed = print ? wrap(g, print, W - 2 * PRINT_PAD) : [];
    const picsH = rows * th + (rows + 1) * gap, lh = Math.round(PRINT_PX * 1.35);
    c.width = W; c.height = picsH + (printed.length ? printed.length * lh + 2 * PRINT_PAD : 0);
    g.fillStyle = "#111"; g.fillRect(0, 0, c.width, c.height);
    g.font = font; g.textBaseline = "top"; g.fillStyle = "#ececec";
    printed.forEach((l, i) => g.fillText(l, PRINT_PAD, picsH + PRINT_PAD + i * lh));
    snaps.forEach((s, i) => {
      const x = gap + (i % cols) * (tw + gap), y = gap + Math.floor(i / cols) * (th + gap), pic = pics[i];
      if (pic) g.drawImage(pic, x, y, tw, th);
      label(g, s.note ? `${s.n} ${s.note}` : `${s.n}`, x + 4, y + 4, Math.max(14, th / 14), tw - 8);
    });
    for (const p of pics) p?.close();
    return new Promise((done, fail) => c.toBlob((b) => (b ? done(b) : fail(new Error("no picture"))), "image/png"));
  }

  // ---- the drone's screen: height, speed, and how many snaps ----

  private showOsd(on: boolean) {
    if (on && !this.screen) this.screen = new DroneScreen(() => this.nextLook(), () => this.zoomStep(1, true));
    this.screen?.show(on);
    this.drawOsd();
  }

  /** The drone's screen, afresh: once a frame while it flies. */
  private drawOsd(_lookChanged = false) {
    if (!this.screen || !this.on) return;
    const m = this.h.map, e = this.eye, p = this.h.player, deg = 180 / Math.PI;
    const centre = m.d.centre as [number, number] | undefined, north = -e.z;
    const lat = centre ? centre[1] + north / 110574 : 0;
    const lon = centre ? centre[0] + e.x / (111320 * Math.cos(centre[1] * Math.PI / 180)) : 0;
    const t = timeOfDay() * 24, hh = Math.floor(t), mi = Math.floor((t - hh) * 60);
    const I = m.tileIndex, S = I ? I.cells * I.dx : 0;
    this.screen.draw({
      heading: -p.yaw * deg, tilt: p.pitch * deg,
      alt: e.y - m.ground(e.x, e.z), elv: e.y + m.z0,
      hs: Math.hypot(this.v.x, this.v.z), vs: this.v.y, lat, lon,
      dst: Math.hypot(e.x - this.home.x, e.z - this.home.z), rng: this.range,
      clock: `${String(hh).padStart(2, "0")}:${String(mi).padStart(2, "0")}`,
      square: I ? `${Math.floor((e.x - I.x0) / S)},${Math.floor((north - I.y0) / S)}` : "",
      gear: this.gear + 1, gears: SPEEDS.length, zoom: this.zoom,
      look: this.looks.name, kinds: this.looks.id === "kinds", lookKey: ctl("droneview"),
      snaps: this.snaps.length - this.flightFrom, allSnaps: this.snaps.length,
      flight: (performance.now() - this.upAt) / 1000,
      dof: depthOfField ? `DOF: ${F_STOPS[this.stop]} @ ${this.focusAt < 1000 ? this.focusAt.toFixed(this.focusAt < 10 ? 1 : 0) : "INF"}` : "",
    });
  }

  /** The page is going (a new game, the train): put the screen away. */
  dispose() {
    this.on = false; this.showSeen(null);
    this.screen?.remove(); this.screen = null; this.picker.dispose();
  }

  // ---- "what's what": naming and outlining what's under the crosshair ----

  /** main.ts, after each frame's drawn: in "what's what", look again a few times a second. */
  peek(r: THREE.WebGLRenderer) {
    if (!this.on || this.looks.id !== "kinds") { if (this.seen || this.outline?.visible) this.showSeen(null); return; }
    const now = performance.now();
    if (this.peeking || now - this.peekAt < 120) return;
    this.peekAt = now;
    this.peeking = true;
    this.picker.pick(r, this.h.scene, this.h.camera).then(
      (p) => { this.peeking = false; if (this.on && this.looks.id === "kinds") this.showSeen(p); },
      () => { this.peeking = false; });
  }

  /** Name what's picked under the crosshair and outline it (null: nothing, or the view's gone). */
  private showSeen(p: Picked | null) {
    if (!p) {
      this.seen = null;
      if (this.outline) this.outline.visible = false;
      this.screen?.setLock(null);
      return;
    }
    const kind = kindOf(p.mesh), cam = this.h.camera.position;
    let detail = "", away = -1, lines: number[] | null = null;
    const built = kind === "building" ? this.buildingAhead() : null;
    if (built) {
      const { b, area, dist } = built;
      detail = [b.n, b.c?.replace(/_/g, " ")].filter(Boolean).join(", ") + `${b.n || b.c ? ", " : ""}${Math.round(b.h)} m to the eaves`;
      away = dist;
      lines = buildingLines(b, area, this.h.map);
    } else {
      const thing = thingOf(p);
      const box = thing ? boxOf(thing.obj, thing.instance) : null;
      if (box) {
        const c = new THREE.Vector3();
        for (let i = 0; i < 8; i++) c.add(box[i]);
        away = c.divideScalar(8).distanceTo(cam);
        if (box[0].distanceTo(box[7]) < 80) lines = boxLines(box);
      }
      const lm = thing?.obj && landmarkOf(thing.obj);
      if (lm) detail = lm;
    }
    const text = `${KINDS[kind].name}${detail ? `: ${detail}` : ""}`;
    this.seen = { text, kind };
    // the name, on the drone's screen by the frame
    this.screen?.setLock({ kind, text: `${KINDS[kind].name}${detail ? ` · ${detail}` : ""}${away >= 0 ? ` · ${Math.round(away)} m` : ""}` });
    // the outline, over everything
    if (!lines) { if (this.outline) this.outline.visible = false; return; }
    if (!this.outline) {
      const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(1.8, 1.45, 0.15), depthTest: false, depthWrite: false, transparent: true, fog: false });
      this.outline = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
      this.outline.renderOrder = 1000;
      this.outline.frustumCulled = false;
      this.outline.userData.kind = "overlay";
    }
    if (this.outline.parent !== this.h.scene) this.h.scene.add(this.outline);
    this.outline.geometry.dispose();
    this.outline.geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    this.outline.visible = true;
  }

  /** The map's building the crosshair's on, by the game's own ray, and how far off it is. */
  private buildingAhead(): { b: Building; area: GameMap; dist: number } | null {
    const m = this.h.map, cam = this.h.camera, e = cam.position;
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const hit = m.raycast(e.x, e.y, e.z, d.x, d.y, d.z, RAY);
    if (!hit || hit.kind !== "building") return null;
    // (a little way in past the wall, so the point's inside the outline)
    const x = e.x + d.x * (hit.dist + 0.4), z = e.z + d.z * (hit.dist + 0.4), north = -z;
    for (const area of [m, ...m.tilesNear(x, z, 80)]) {
      for (const b of area.d.bl ?? []) {
        const ring = b.r[0];
        if (ring && inRing(ring, x, north)) return { b, area, dist: hit.dist };
      }
    }
    return null;
  }
}

/** A crosshair at the middle of a snap, white with a dark edge, so it shows on sky and on stone. */
function crosshair(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  for (const [col, w] of [["rgba(0,0,0,0.8)", 4], ["#fff", 2]] as const) {
    g.strokeStyle = col; g.lineWidth = w;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.moveTo(x - r * 2, y); g.lineTo(x - r * 0.5, y); g.moveTo(x + r * 0.5, y); g.lineTo(x + r * 2, y);
    g.moveTo(x, y - r * 2); g.lineTo(x, y - r * 0.5); g.moveTo(x, y + r * 0.5); g.lineTo(x, y + r * 2);
    g.stroke();
  }
}

/** A snap's number (and note) in its top left corner, on a dark band. */
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, maxW = 400) {
  g.font = `bold ${Math.round(size)}px monospace`;
  g.textBaseline = "top";
  let t = text;
  while (t.length > 1 && g.measureText(t).width > maxW) t = t.slice(0, -2) + "…";
  const w = g.measureText(t).width;
  g.fillStyle = "rgba(0,0,0,0.65)"; g.fillRect(x - 3, y - 2, w + 6, size + 4);
  g.fillStyle = "#ffd23a"; g.fillText(t, x, y);
}

/** What a pick landed on, as a thing in its own right: a copy of a model drawn many times over, or
 *  the nearest group up from the mesh that's marked as what it is (a car, a person, a landmark). */
function thingOf(p: Picked): { obj: THREE.Object3D; instance: number } | null {
  if (p.instance >= 0) return { obj: p.mesh, instance: p.instance };
  for (let o: THREE.Object3D | null = p.mesh; o; o = o.parent) {
    if (o.userData.kind) return { obj: o, instance: -1 };
    if (!o.parent || (o.parent as THREE.Scene).isScene) break;
  }
  return { obj: p.mesh, instance: -1 };
}

/** A landmark's or set piece's own name, if o is one or in one. */
function landmarkOf(o: THREE.Object3D): string {
  for (let q: THREE.Object3D | null = o; q; q = q.parent) {
    const k = q.userData.landmark as string | undefined;
    if (k) return k.charAt(0).toUpperCase() + k.slice(1);
  }
  return "";
}

/** A model's own box, as long as it has one to hand (the game lets go of most models' points once
 *  they're drawn): its size if it knows it, else round its sphere. */
function geoBox(g: THREE.BufferGeometry): THREE.Box3 | null {
  if (g.boundingBox) return g.boundingBox;
  const pos = g.attributes.position as THREE.BufferAttribute | undefined;
  if (pos?.array) { g.computeBoundingBox(); return g.boundingBox; }
  const s = g.boundingSphere;
  return s ? new THREE.Box3().setFromCenterAndSize(s.center, new THREE.Vector3(1, 1, 1).multiplyScalar(s.radius * 2)) : null;
}

/** The eight corners of a box round o (one copy of it, if instance isn't -1), in the scene: turned
 *  with it for one mesh, square to the map for a group of them. Corner 7 is opposite corner 0. */
function boxOf(o: THREE.Object3D, instance: number): THREE.Vector3[] | null {
  const corners = (b: THREE.Box3, m: THREE.Matrix4) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
    new THREE.Vector3(i & 4 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 1 ? b.max.z : b.min.z).applyMatrix4(m));
  const mesh = o as THREE.Mesh;
  o.updateWorldMatrix(true, true);
  if (mesh.isMesh) {
    const b = geoBox(mesh.geometry);
    if (!b) return null;
    const m = mesh.matrixWorld.clone();
    if (instance >= 0) { const im = new THREE.Matrix4(); (mesh as THREE.InstancedMesh).getMatrixAt(instance, im); m.multiply(im); }
    return corners(b, m);
  }
  const all = new THREE.Box3();
  o.traverseVisible((c) => {
    const cm = c as THREE.Mesh;
    if (!cm.isMesh || (cm as THREE.InstancedMesh).isInstancedMesh) return;
    const b = geoBox(cm.geometry);
    if (b) all.union(b.clone().applyMatrix4(cm.matrixWorld));
  });
  return all.isEmpty() ? null : corners(all, new THREE.Matrix4());
}

/** A box's twelve edges, as line ends. */
function boxLines(c: THREE.Vector3[]): number[] {
  const out: number[] = [];
  for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) out.push(...c[a].toArray(), ...c[b].toArray());
  return out;
}

/** A building's outline from the map: round its foot on the ground, round its eaves, and up each corner. */
function buildingLines(b: Building, area: GameMap, map: GameMap): number[] {
  const ring = b.r[0], out: number[] = [];
  const eaves = b.g - area.z0 + b.h, top = b.rm ? roofMeshTop(b) - area.z0 : eaves + (b.rp ?? 0);
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
    const ga = map.ground(ax, -ay), gb = map.ground(bx, -by);
    out.push(ax, ga, -ay, bx, gb, -by, ax, eaves, -ay, bx, eaves, -by, ax, ga, -ay, ax, eaves, -ay);
  }
  // and a mark up to the top of the roof, from the middle, if it rises well above the eaves
  if (top > eaves + 1) {
    let cx = 0, cy = 0;
    for (const [x, y] of ring) { cx += x; cy += y; }
    cx /= ring.length; cy /= ring.length;
    out.push(cx, eaves, -cy, cx, top, -cy);
  }
  return out;
}

/** Whether data point (x, y) is inside a ring of [x, y] points. */
function inRing(ring: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Text as lines no wider than w on g's font, broken at spaces; a broken line carries on indented. */
function wrap(g: CanvasRenderingContext2D, text: string, w: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && g.measureText(next).width > w) { out.push(line); line = `    ${word}`; } else line = next;
    }
    out.push(line);
  }
  return out;
}
