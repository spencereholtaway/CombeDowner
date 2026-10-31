// The one Volkswagen Golf Driver in Bath: the 1983-84 British special edition, a Mk1 with the GTI's
// black arches, lip spoiler and sill stripe, but a smaller engine, steel wheels, a plain
// grille and no badges on its sides. It's petrol blue, and it's parked on Royal Avenue,
// along the bottom of Royal Victoria Park, with the driver's door left open and a tape going in
// the deck: "Petrol Blue Feedback" (tracks/petrol-blue-feedback.ts), loud, through little door
// speakers. On the passenger seat is the tape's box, "Bath Moon Rising": reach in through the door
// (or get in) and take it, and you get a trophy and the track joins your soundtrack. You can drive it
// off; the door shuts behind you, the tape plays on wherever it goes, and wherever it's left the
// door's open again.
//
// Who decides what: it's a vehicle like any other (vehicles.ts makes it with its square, in place
// of the car the map parked on that drive, and the host says who's in it). The door, the music and
// the tape are each player's own, so nothing new goes over the network: the door is open whenever
// nobody's at the wheel, everyone near hears the tape from their own deck, and everyone can take
// their own copy, kept on their device with their trophies.
import * as THREE from "three";
import * as SFX from "./audio";
import { model, prof } from "./furniture";
import { GLASS } from "./gloss";
import type { GameMap } from "./map";
import { addToPlaylist, Soundtrack } from "./music";
import * as Trophies from "./trophies";
import TAPE from "./tracks/petrol-blue-feedback";
import type { Vehicle } from "./vehicles";

export const PETROL_BLUE = "#184a5c";
/** Its space on Royal Avenue, by Royal Victoria Park (data metres and the way it faces), one the map parks a car in. */
const DRIVE = { x: -1688.79, y: 2584.51, a: 6.17 };
const OPEN = 1.05;   // how far the door swings, radians
const EAR = 45;      // the tape's heard this far off
const LOOK = 60;     // and the inside's drawn through the door this far off
const REACH = 1.7;   // how near the doorway you must be to reach in for the tape
const TROPHY = "tape";
const SIDE = 0.815;  // the Golf's flank, out from its middle
/** Where you stand to reach in: by the open door, in the car's own frame (along, across). */
const STAND = [0.1, SIDE + 0.6];
/** The tape on the passenger seat, in the car's own frame. */
const SEAT = [-0.12, 0.45, -0.33];

/** Where the Driver's parked, in scene coordinates, if that drive is in this square: and the car the
 *  map parked there comes off it, so the two don't sit on top of one another. */
export function driverSpot(map: GameMap): { x: number; z: number; a: number } | null {
  const b = map.d.b, D = DRIVE;
  if (!map.d.tile || !b || D.x < b[0] || D.x >= b[2] || D.y < b[1] || D.y >= b[3]) return null;
  let k = -1, best = 3;
  for (const i of map.spareNear(D.x, -D.y, 3)) {
    const f = map.spare[i].f as [string, number, number];
    const d = Math.hypot(f[1] - D.x, f[2] - D.y);
    if (d < best) { best = d; k = i; }
  }
  if (k >= 0) map.takeCar(k);
  return { x: D.x, z: -D.y, a: D.a };
}

/**
 * The doorway cut through the body while the door's open (Vehicle.doorway): from the sill to the
 * top of the window, the door's length back from its hinge, and in across the cabin to just short of
 * the far side's glass; its front edge leans back under the windscreen, so the screen stays whole.
 */
const DOORWAY: THREE.Plane[] = (() => {
  const P = (x: number, y: number, z: number, c: number) => new THREE.Plane(new THREE.Vector3(x, y, z), c);
  const lean = new THREE.Vector3(0.41, 0.37, 0).normalize();
  return [P(1, 0, 0, -0.71), P(-1, 0, 0, -0.41), P(0, 1, 0, -1.32), P(0, -1, 0, 0.4), P(0, 0, 1, -0.95), P(0, 0, -1, -0.72),
    new THREE.Plane(lean, -lean.dot(new THREE.Vector3(0.66, 0.92, 0)))];
})();

/**
 * The Driver's own bits on top of its Golf body (furniture.ts): the driver's door (on
 * the right) hung at its front edge, and the tape on the passenger seat. White parts take the paint
 * (mat); the rest goes in the trim (trim).
 */
export function driverDressing(mat: THREE.Material, trim: THREE.Material): THREE.Group {
  const g = new THREE.Group(), box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  // the door, built out from its hinge along -x, so turning it about y swings it out
  const L = 1.12, win = [[0, 0.92], [-0.37, 1.32], [-L, 1.32], [-L, 0.92]];
  const door = new THREE.Group();
  door.name = "door";
  door.position.set(0.71, 0, SIDE + 0.026);
  door.add(new THREE.Mesh(model([
    [box(L, 0.54, 0.05), "#ffffff", -L / 2, 0.65, 0],
    [box(L - 0.37, 0.04, 0.05), "#ffffff", -(L + 0.37) / 2, 1.32, 0],                   // the window frame along the roof
    [box(0.55, 0.04, 0.05).rotateZ(-0.837), "#ffffff", -0.185, 1.12, 0],                  // and down the windscreen pillar
  ]), mat));
  door.add(new THREE.Mesh(model([
    [box(L - 0.06, 0.48, 0.012), "#3a3b3f", -L / 2, 0.65, -0.03],     // the trim inside
    [box(0.5, 0.05, 0.08), "#2c2d30", -0.75, 0.72, -0.06],           // its armrest
    [box(L + 0.002, 0.035, 0.052), "#18191b", -L / 2, 0.42, 0],        // the sill stripe carries on along it
    [box(0.14, 0.03, 0.02), "#18191b", -L + 0.16, 0.84, 0.03],      // the handle
    [prof(win, 0.02), GLASS, 0, 0, 0],
    [box(0.04, 0.4, 0.045), "#18191b", -L + 0.02, 1.12, 0],          // the frame's back edge
  ]), trim));
  door.visible = false;
  g.add(door);
  // the tape in its box, a little skew on the seat, its inlay the colour of a bonfire
  const tape = new THREE.Mesh(model([
    [box(0.13, 0.018, 0.085), "#c9cdd0", 0, 0, 0],
    [box(0.12, 0.004, 0.075), "#e0662a", 0, 0.01, 0],
    [box(0.1, 0.005, 0.02), "#1d1b1a", 0.005, 0.012, 0.012],
  ]), trim);
  tape.name = "tape";
  tape.position.set(SEAT[0], SEAT[1], SEAT[2]);
  tape.rotation.y = 0.35;
  tape.visible = false;
  g.add(tape);
  return g;
}

// ---- the tape --------------------------------------------------------------------------------

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/**
 * What the guitars do that a sound chip can't: the open strings droning and beating against each
 * other, a swell of feedback every few bars, and harmonics chiming at the twelfth and seventh
 * frets, laid over the tape's own parts in time with them.
 */
class Halo {
  private bar = 240 / TAPE.bpm;
  private at: number;
  private n = 0;
  private drone: OscillatorNode[] = [];
  private nodes: AudioNode[] = [];
  private bus: GainNode;
  private root = 40 + TAPE.key;

  constructor(private c: BaseAudioContext, out: AudioNode) {
    this.at = c.currentTime + 0.05;
    this.bus = c.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(out);
    const fuzz = c.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(4 * (i / 511.5 - 1));
    fuzz.curve = curve;
    const sweep = c.createBiquadFilter(), lfo = c.createOscillator(), depth = c.createGain(), g = c.createGain();
    sweep.type = "bandpass"; sweep.frequency.value = 900; sweep.Q.value = 0.9;
    lfo.frequency.value = 0.11; depth.gain.value = 600;
    lfo.connect(depth).connect(sweep.frequency);
    g.gain.value = 0.035;
    fuzz.connect(sweep).connect(g).connect(this.bus);
    // the low string and the fifth an octave up, each doubled a few cents apart so they beat
    for (const [m, cents] of [[this.root, -7], [this.root, 6], [this.root + 19, -4], [this.root + 19, 9]]) {
      const o = c.createOscillator();
      o.type = "sawtooth"; o.frequency.value = hz(m); o.detune.value = cents;
      o.connect(fuzz); o.start();
      this.drone.push(o);
    }
    lfo.start();
    this.drone.push(lfo);
    this.nodes = [fuzz, sweep, depth, g, this.bus];
  }

  play(t: number) {
    while (this.at < t) { this.lay(this.at, this.n++); this.at += this.bar; }
  }

  stop() {
    const t = this.c.currentTime;
    this.bus.gain.setTargetAtTime(0, t, 0.08);
    for (const o of this.drone) o.stop(t + 0.5);
    setTimeout(() => { for (const n of [...this.drone, ...this.nodes]) n.disconnect(); }, 800);
  }

  private lay(t0: number, n: number) {
    const step = this.bar / 8;
    // harmonics: a couple a bar, on the off-beats, the twelfth fret's octave or the seventh's twelfth
    for (let k = 0; k < 8; k++) if ((n * 5 + k * 3) % 7 === 0) this.chime(t0 + k * step, this.root + [24, 31, 36, 43][(n + k) % 4]);
    // and every eighth bar the feedback howls up for two, and cuts
    if (n % 8 === 4) this.feedback(t0, this.bar * 2, this.root + (n % 16 === 4 ? 43 : 48));
  }

  private chime(t: number, m: number) {
    const c = this.c, o = c.createOscillator(), g = c.createGain();
    o.type = "triangle"; o.frequency.value = hz(m) * (1 + (Math.random() - 0.5) * 0.004);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.004, 0.5);
    o.connect(g).connect(this.bus);
    o.start(t); o.stop(t + 2.5);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  private feedback(t: number, dur: number, m: number) {
    const c = this.c, o = c.createOscillator(), wob = c.createOscillator(), wd = c.createGain(), g = c.createGain();
    o.type = "sine"; o.frequency.value = hz(m);
    wob.frequency.value = 5.5; wd.gain.value = 6;
    wob.connect(wd).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + dur * 0.9);
    g.gain.setValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.bus);
    for (const x of [o, wob]) { x.start(t); x.stop(t + dur + 0.05); }
    o.onended = () => { o.disconnect(); wob.disconnect(); wd.disconnect(); g.disconnect(); };
  }
}

/** The tape, played through a car's door speakers: no real bass, a honk in the middle, and the halo on top. */
class Deck {
  private tape: Soundtrack;
  private halo: Halo;
  private speaker: AudioNode[];

  constructor(c: BaseAudioContext, out: AudioNode) {
    const hp = c.createBiquadFilter(), lp = c.createBiquadFilter(), honk = c.createBiquadFilter(), level = c.createGain();
    hp.type = "highpass"; hp.frequency.value = 170;
    lp.type = "lowpass"; lp.frequency.value = 4800; lp.Q.value = 0.9;
    honk.type = "peaking"; honk.frequency.value = 1400; honk.gain.value = 5; honk.Q.value = 0.8;
    level.gain.value = 1.6;
    hp.connect(lp).connect(honk).connect(level).connect(out);
    this.speaker = [hp, lp, honk, level];
    this.tape = new Soundtrack(c, hp, { track: TAPE, changeAfter: 0 });
    this.halo = new Halo(c, hp);
  }

  play(t: number) { this.tape.scheduleUntil(t); this.halo.play(t); }

  stop() {
    this.halo.stop();
    const [, , , level] = this.speaker as [AudioNode, AudioNode, AudioNode, GainNode];
    level.gain.setTargetAtTime(0, level.context.currentTime, 0.08);
    setTimeout(() => { for (const n of this.speaker) n.disconnect(); }, 1200);
  }
}

/** The Driver's door, its tape, and taking the tape (game.ts runs it every frame). */
export class GolfDriver {
  /** How far away a point is, and how far to your right, for placing the sound (game.ts sets it). */
  hear: (x: number, y: number, z: number) => [number, number] = () => [0, 0];
  private deck: Deck | null = null;
  private out: ReturnType<typeof SFX.placedOut> = null;
  private hushed = false;
  private swing = 0;
  private reach = false;   // stood at the open door, with the tape still on the seat

  constructor(private toast: (text: string, secs: number) => void) {
    if (Trophies.earned(TROPHY)) addToPlaylist(TAPE);
  }

  /** Keep it going: the vehicles about, whether you're sat in it, and where you are. */
  update(dt: number, list: readonly Vehicle[], inIt: (v: Vehicle) => boolean, px: number, py: number, pz: number) {
    const v = list.find((x) => x.kind === "golfdriver");
    this.reach = false;
    if (!v) { this.quiet(); return; }
    const far = Math.hypot(px - v.x, pz - v.z), have = Trophies.earned(TROPHY);
    // the door: open while nobody's at the wheel, swung shut as someone gets in
    this.swing += Math.max(-dt * 3, Math.min(dt * 3, (v.driver ? 0 : OPEN) - this.swing));
    const door = v.root.getObjectByName("door"), tape = v.root.getObjectByName("tape");
    if (door) { door.rotation.y = this.swing; door.visible = this.swing > 0.03; }
    const open = this.swing > 0.3 && !v.driver && far < LOOK;
    v.doorway(open ? DOORWAY : null);
    if (tape) tape.visible = open && !have;
    if (inIt(v)) this.take();
    else if (open && !have && this.swing > OPEN * 0.8 && Math.abs(py - v.y) < 1.5) {
      const c = Math.cos(v.a), s = Math.sin(v.a), [al, ac] = STAND;
      this.reach = Math.hypot(px - (v.x + al * c + ac * s), pz - (v.z - al * s + ac * c)) < REACH;
    }
    // the tape, while you're near enough to hear it
    const ctx = SFX.context();
    if (!ctx || far > EAR + 10) { this.quiet(); return; }
    if (!this.deck) {
      if (far > EAR) return;
      this.out = SFX.placedOut();
      if (!this.out) return;
      this.deck = new Deck(ctx, this.out.node);
    }
    this.deck.play(ctx.currentTime + 0.5);
    const [d, pan] = this.hear(v.x, v.y + 0.8, v.z);
    // muffled a little with the door shut, unless you're in there with it
    this.out?.set(inIt(v) ? 0.8 : 0.55 + 0.45 * (this.swing / OPEN), d, pan);
    SFX.hushMusic(Math.max(0.1, Math.min(1, (far - 6) / (EAR - 6))));
    this.hushed = true;
  }

  /** What E does at the open door, if anything: what to say (game.ts's prompt). */
  hint(): string { return this.reach ? "<b>{use}</b> Reach in for the tape on the passenger seat" : ""; }

  /** E at the open door: take the tape. */
  use(): boolean {
    if (!this.reach) return false;
    this.take();
    return true;
  }

  private take() {
    if (!Trophies.award(TROPHY)) return;
    addToPlaylist(TAPE);
    this.toast(`"Bath Moon Rising", on tape: "${TAPE.name}" is on your music now`, 5);
  }

  private quiet() {
    this.deck?.stop(); this.deck = null;
    this.out?.stop(); this.out = null;
    if (this.hushed) { SFX.hushMusic(1); this.hushed = false; }
  }

  dispose() { this.quiet(); }
}
