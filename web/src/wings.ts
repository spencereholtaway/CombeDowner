// The angel's wings at the top of Bath Abbey's tower (climb.ts is the way up): a pair of glowing
// wings floating over the tower's roof, yours when you walk into them, with a halo to keep in your
// wardrobe the first time. With them on you glide off the ground (player.ts), Space flaps, and
// looking down dives, and you glow gold while you fly. The flight runs out: FLIGHT seconds after you
// put them on your flaps lift you no more and you glide down. And they come with a heavenly guitar, a
// pearl and gold Flying V held right-handed, playing a screaming lead: where you look picks the note (up high, down low), turning shreds runs of notes up
// or down the scale the way you turn, flapping climbs the scale a note a flap and a dive runs back
// down it. Back on the street for a moment, or anywhere once they're spent, and the wings fold away,
// till you climb up for them again. Or type the cheat, HEAVEN, for wings that never tire or fold.
//
// Who decides what: they're your own. Whether you're wearing them and flying with them goes out
// with where you are (game.ts), so the others see your wings, your glow and the guitar in your
// hands, and each note of the solo goes to everyone ("gtr") for those nearby to hear.
import * as THREE from "three";
import * as SFX from "./audio";
import { abbeyClimb } from "./abbeyclimb";
import { CLIMB } from "./landmarks/abbey";
import type { GameMap } from "./map";
import type { Player } from "./player";
import { angelGlow, angelWings, heavenlyGuitar, wing } from "./angelwings";
import { earn } from "./wardrobe";
import { award } from "./trophies";

const SHOWN = 220;         // the wings over the tower are there when you're this close to the Abbey
const REACH = 1.4;         // and yours this close to them
const FOLD = 1;            // seconds on the street before they fold away
const UP = 1.3;            // how far over the tower's roof they float
const FLIGHT = 45;         // seconds of flight in a pair of wings
const LOW = 10;            // and the bar of what's left goes red this near the end
const AXE_TILT = 0.1;      // how far the top of your guitar leans back towards you, radians
// the solo: the A minor blues scale over three octaves from A3, picked by where you look, and a
// note for every so far you turn
const SCALE = [0, 3, 5, 6, 7, 10].flatMap((n) => [0, 12, 24].map((o) => n + o)).sort((a, b) => a - b).concat(36);
const NOTE = (k: number) => 220 * Math.pow(2, SCALE[Math.max(0, Math.min(SCALE.length - 1, k))] / 12);
const TURN = 0.07;         // radians of turning to a note
const QUICKEST = 0.055;    // and the shortest gap between notes, seconds
const CLIMB_GAP = 0.15;    // the shortest gap between the notes of a climb, however fast you flap
const NECK = new THREE.Vector3(0, 0.42, -0.02);          // on the guitar: the left hand, behind the neck
const PICK = new THREE.Vector3(0.02, -0.05, 0.03);        // and the right, over the strings
const LEFT_SHOULDER = new THREE.Vector3(-0.55, -0.5, 0.05), RIGHT_SHOULDER = new THREE.Vector3(0.38, -0.55, 0.15);
const BACK = new THREE.Vector3(0, 0, 1);
const SKIN = new THREE.MeshLambertMaterial({ color: "#c49a7c" });
const SLEEVE = new THREE.MeshLambertMaterial({ color: "#3d4651" });

/** A hand closed round something, and its sleeve this long running back along +z to your shoulder. */
function holding(sleeve: number): THREE.Group {
  const g = new THREE.Group(), part = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); g.add(b);
  };
  part(0.09, 0.09, 0.11, SKIN, 0, 0, 0);                     // hand
  part(0.03, 0.03, 0.05, SKIN, 0.035, 0.05, -0.02);          // thumb
  part(0.11, 0.11, sleeve, SLEEVE, 0, -0.01, 0.06 + sleeve / 2);
  return g;
}

const CHEAT = "heaven";    // typed anywhere in play: wings that never run out or fold away, till you type it again
const DIVE = -3;           // falling faster than this, m/s, plays a run back down the scale

export class Wings {
  /** Seconds since the wings were last flapped, for the flap. */
  private flapT = 9;
  private downT = 0;
  private strumT = 9;
  private pick: THREE.Group | null = null;
  private view = new THREE.Group();
  private left: THREE.Group;
  private right: THREE.Group;
  private axe = new THREE.Group();
  private guitar!: THREE.Group;
  // your hands on it, as on the guns (weapon.ts): the left round the neck and the right at the
  // strings, each with its arm back to your shoulder, put where the guitar is each frame
  private fretHand = holding(0.6);
  private pickHand = holding(0.6);
  private told = false;
  /** Seconds of flight left in these wings. */
  private flight = FLIGHT;
  private turned = 0;       // radians turned since the last note
  private noteT = 0;        // seconds since the last note
  private run = 0;          // notes into the run
  private step = 0;         // where the climb or the dive has got to on the scale
  private climbing = false; // flapping, a note up the scale each flap
  private diving = false;   // falling fast, a note down the scale each beat
  private typed = "";       // the last few letters typed, for the cheat
  private cheatAsked = false;
  private cheat = false;
  private was = { yaw: 0, pitch: 0 };
  private hud: HTMLDivElement;
  private halo: HTMLDivElement;

  /** world: the scene the wings over the tower are in; hands: the scene of what's in your hands (weapon.ts). */
  constructor(private map: GameMap, private world: THREE.Scene, hands: THREE.Scene, private toast: (text: string, secs?: number) => void) {
    this.left = wing(-1, 0.75); this.right = wing(1, 0.75);
    this.left.position.set(-0.32, -0.12, -0.32); this.right.position.set(0.32, -0.12, -0.32);
    // held right-handed and seen as you'd see your own: the body at your waist, mostly out of sight
    // below, its face and strings away from you, and the neck out and up to the left
    const guitar = heavenlyGuitar();
    guitar.rotation.y = Math.PI;
    this.guitar = guitar;
    this.axe.add(guitar);
    this.axe.userData.strings = guitar.userData.strings;
    this.axe.position.set(0.12, -0.4, -0.42);
    this.axe.rotation.set(AXE_TILT, -0.1, 1.0, "YXZ");
    this.axe.scale.setScalar(0.85);
    this.view.add(this.left, this.right, this.axe, this.fretHand, this.pickHand);
    this.view.visible = false;
    hands.add(this.view);
    // what's left of the flight, under the crosshair, and the gold glow round the edges of the screen
    this.hud = document.createElement("div");
    this.hud.style.cssText = "position:fixed;left:50%;top:calc(50% + 30px);width:120px;height:6px;margin-left:-60px;pointer-events:none;z-index:5;border-radius:3px;background:rgba(0,0,0,0.45);overflow:hidden";
    this.hud.innerHTML = '<div style="height:100%;width:100%;background:#f2cf5b"></div>';
    this.halo = document.createElement("div");
    this.halo.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:4;background:radial-gradient(ellipse at center, transparent 50%, rgba(255,214,110,0.55));mix-blend-mode:screen";
    this.hud.hidden = this.halo.hidden = true;
    const at = document.getElementById("hud") ?? document.body;
    at.append(this.halo, this.hud);
    addEventListener("keydown", this.onKey);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.key.length !== 1 || (e.target as HTMLElement)?.closest?.("input, textarea")) return;
    this.typed = (this.typed + e.key.toLowerCase()).slice(-CHEAT.length);
    if (this.typed === CHEAT) { this.cheatAsked = true; this.typed = ""; }
  };

  /** Wearing them: what's in your hands gives way to the guitar. */
  get on() { return this.view.visible; }
  /** Flying with them, glowing: the others see that (game.ts sends it). */
  glowing = false;
  /** Each note of the solo as it's played, for game.ts to send to everyone nearby. */
  onNote: (f: number, dur: number, bend: number) => void = () => {};

  private play(f: number, dur = 0.22, bend = 0) {
    SFX.guitarLead(f, dur, bend);
    this.onNote(f, dur, bend);
  }

  update(dt: number, p: Player, camera: THREE.Camera, alive: boolean) {
    const ab = abbeyClimb(this.map);
    // the wings over the tower, there while you're near and haven't got them on
    if (ab) {
      const at = ab.frame.at((CLIMB.tower.x0 + CLIMB.tower.x1) / 2, CLIMB.tower.top + UP, 0);
      const near = Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < SHOWN;
      if (near && !this.pick) { this.pick = angelWings(); this.pick.add(angelGlow(3.5)); this.world.add(this.pick); }
      else if (!near && this.pick) { this.world.remove(this.pick); this.pick = null; }
      if (this.pick) {
        const t = performance.now() / 1000;
        this.pick.visible = !p.wings;
        this.pick.position.set(at.x, at.y + Math.sin(t * 1.6) * 0.15, at.z);
        this.pick.rotation.y = t * 0.6;
        this.pick.children.forEach((w, k) => { if (k < 2) w.rotation.z = (k ? 1 : -1) * (0.35 + Math.sin(t * 3) * 0.25); });
        if (alive && !p.wings && !p.ladder && Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < REACH && Math.abs(p.pos.y + 0.9 - at.y) < 1.6) {
          p.wings = true; p.wingLift = true;
          this.downT = 0;
          this.flight = FLIGHT;
          // a lick to put them on
          [0, 2, 4, 5].forEach((k, i) => setTimeout(() => this.play(NOTE(6 + k), i === 3 ? 0.8 : 0.12, i === 3 ? 2 : 0), i * 110));
          this.toast(this.told ? "Wings on" : "Angel's wings! Jump off: Space flaps, look down to dive. Turn to shred the guitar, look up and down for the high and low notes", 7);
          this.told = true;
          earn("halo");
          award("abbeytop");
        }
      }
    }
    if (this.cheatAsked) {
      this.cheatAsked = false;
      this.cheat = !this.cheat;
      if (this.cheat && alive) {
        p.wings = true; p.wingLift = true; this.downT = 0;
        [0, 2, 4, 5].forEach((k, i) => setTimeout(() => this.play(NOTE(6 + k), i === 3 ? 0.8 : 0.12, i === 3 ? 2 : 0), i * 110));
        this.toast("Wings from heaven: Space flaps, and they never tire. Type it again to put them away", 5);
      } else if (!this.cheat) { p.wings = false; this.toast("Wings away", 2); }
    }
    if (this.cheat) { this.flight = FLIGHT; if (p.wings) p.wingLift = true; }
    if (!alive) { p.wings = false; this.cheat = false; }
    // back on the street for a moment: they fold away
    if (p.wings && !this.cheat && p.onGround && (!p.wingLift || p.pos.y - this.map.ground(p.pos.x, p.pos.z) < 0.25)) {
      if ((this.downT += dt) > FOLD) { p.wings = false; this.toast("Your wings fold away. They're back at the top of the Abbey", 3); }
    } else this.downT = 0;
    const flying = p.wings && !p.onGround;
    // the flight runs out: then you can only glide down
    if (p.wings && p.wingLift && (this.flight -= dt) <= 0) {
      p.wingLift = false;
      this.play(NOTE(3), 1.2, -5);
      this.toast("Your wings are spent: glide on down", 3);
    }
    this.glowing = flying && p.wingLift;
    this.halo.hidden = !this.glowing;
    if (this.glowing) this.halo.style.opacity = String(0.7 + Math.sin(performance.now() / 180) * 0.3);
    this.hud.hidden = !p.wings || !p.wingLift;
    const bar = this.hud.firstElementChild as HTMLDivElement;
    bar.style.width = `${(Math.max(0, this.flight) / FLIGHT) * 100}%`;
    bar.style.background = this.flight < LOW ? "#ff5a4e" : "#f2cf5b";
    // the solo: turning shreds and where you look picks the note. Flapping climbs the scale a note a
    // flap, in time however fast Space repeats, and a dive runs back down it, quicker the faster you
    // fall, so holding Space or diving plays a run instead of a pile of notes
    const dyaw = Math.atan2(Math.sin(p.yaw - this.was.yaw), Math.cos(p.yaw - this.was.yaw));
    this.was = { yaw: p.yaw, pitch: p.pitch };
    this.noteT += dt;
    const base = Math.round(((p.pitch + 1.2) / 2.4) * (SCALE.length - 1));
    const top = SCALE.length - 1;
    if (p.wings && p.flapped) {
      this.flapT = 0;
      if (this.noteT >= CLIMB_GAP) {
        // over the top, round the last few notes again
        this.step = !this.climbing ? base : this.step >= top ? top - 4 : this.step + 1;
        this.play(NOTE(this.step), this.climbing ? 0.3 : 0.6, this.climbing ? 0 : 2);
        this.climbing = true; this.diving = false;
        this.noteT = 0; this.strumT = 0; this.run = 0;
      }
    }
    if (this.flapT > 0.6) this.climbing = false;
    const falling = flying && !this.climbing && p.vel.y < DIVE;
    if (!falling) this.diving = false;
    else {
      const beat = Math.max(0.1, 0.28 + (p.vel.y - DIVE) * 0.015);
      if (this.noteT >= beat) {
        // under the bottom, back round the lowest few
        this.step = !this.diving ? base : this.step <= 0 ? 4 : this.step - 1;
        this.play(NOTE(this.step), beat * 1.3);
        this.diving = true;
        this.noteT = 0; this.strumT = 0;
      }
    }
    if (flying && !this.climbing && !this.diving) {
      this.turned += Math.abs(dyaw);
      if (this.turned >= TURN && this.noteT >= QUICKEST) {
        this.turned = Math.min(this.turned - TURN, TURN * 2);
        this.run++;
        this.play(NOTE(base + Math.sign(dyaw || 1) * (this.run % 4)), 0.16);
        this.noteT = 0; this.strumT = 0;
      }
      if (Math.abs(dyaw) < 0.002) this.run = 0;
    } else this.turned = 0;
    this.flapT += dt; this.strumT += dt;
    this.view.visible = p.wings;
    if (!p.wings) return;
    // in view: the wings at the edges, beating down with each flap and spread while you glide, and
    // the guitar in front, jumping as it's strummed
    const aloft = !p.onGround;
    const beat = this.flapT < 0.45 ? Math.sin((this.flapT / 0.45) * Math.PI * 2) * 0.7 : 0;
    const lift = (aloft ? 0.15 : -0.55) + beat + Math.sin(performance.now() / 300) * 0.04;
    this.left.rotation.set(0, 0.5, lift);
    this.right.rotation.set(0, -0.5, -lift);
    const jump = this.strumT < 0.25 ? Math.sin((this.strumT / 0.25) * Math.PI) * 0.05 : 0;
    this.axe.position.y = -0.4 + jump;
    this.axe.rotation.x = AXE_TILT + jump * 2;

    (this.axe.userData.strings as THREE.MeshBasicMaterial).color.setScalar(0.75 + Math.max(0, 1 - this.strumT * 5) * 1.5);
    this.view.position.copy(camera.position);
    this.view.quaternion.copy(camera.quaternion);
    this.view.updateMatrixWorld(true);
    this.reach(this.fretHand, NECK, LEFT_SHOULDER);
    this.reach(this.pickHand, PICK.clone().setY(PICK.y - jump * 1.5), RIGHT_SHOULDER);
  }

  /** A hand at this point on the guitar (its own frame), its arm back towards the shoulder (in view). */
  private reach(hand: THREE.Group, at: THREE.Vector3, shoulder: THREE.Vector3) {
    const p = this.view.worldToLocal(this.guitar.localToWorld(at.clone()));
    hand.position.copy(p);
    hand.quaternion.setFromUnitVectors(BACK, shoulder.clone().sub(p).normalize());
  }

  dispose() {
    if (this.pick) this.world.remove(this.pick);
    this.view.removeFromParent();
    removeEventListener("keydown", this.onKey);
    this.hud.remove(); this.halo.remove();
  }
}
