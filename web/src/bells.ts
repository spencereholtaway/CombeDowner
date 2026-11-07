// Bell Ringing, a team challenge (challenges.ts): English change ringing up a church tower. The
// challenge stands at the biggest church in reach of where everyone starts, found from the map's
// own buildings, so every map with a church has one. Outside it a sandwich board says to try bell
// ringing today, with the vicar stood by it beckoning you over. Everyone who enters (lineup.ts) goes
// straight up at GO, with no count in, into the ringing chamber, a room of our own built high over
// the street. The touch starts in rounds (1-2-3-4...), then the method moves the bells about, pairs
// swapping places every row: Plain Hunt on an easy day, Plain Bob or Grandsire on a hard one.
//
// Each ringer plays their part on a note highway in the middle of the screen (bellhighway.ts), the
// way Guitar Hero does: four lanes, A W S D or a pad's face buttons laid out as they sit (the bells'
// table in controls.ts), or a pad to tap under each on a touch screen. Every player up to eight
// rings: four or five bells alone, two or three each for up to four, one or two each for five to
// eight, up to twelve bells. Each strike of your bells comes down as a note. Its lane follows the
// bell: a lane right as it moves up a place, left as it moves down, the same as it makes one, round
// the four (chart), so the method reads as runs across the lanes. Some notes are chords, two lanes
// at once, more of them the fewer notes you have and on a harder day; a chord is one strike, and
// one key of it alone is a clash. Everyone else's notes come down too, faintly, so you can see
// yours fall among the band's. The fewer notes you have, the narrower the window to strike them
// in. A note struck on the line is Perfect or Good, and builds your streak and multiplier; early or
// late and the bell clashes with its neighbour (late enough and the rope hauls you off the floor);
// left alone it's missed. Every bell missed or clashed costs the whole band's striking, less the
// bigger the band, and a clean row gives a little back: let it run out and the lot collapses into
// a jangle. Ring it through and the strange object turns up at the church door. A bell sounds a
// moment (LEAD) after its rope is pulled, as a real one does. Anyone else can climb up too (use, by
// the vicar), and once the ringing has started stands by the wall and watches.
//
// Who decides what: the host keeps the time and runs the band. Each screen syncs its clock to the
// host's ("tq"/"ta" inside "qe"), so the rows are laid out on one shared clock from the moment the
// host says go. "go" carries the bells, the day's level and whose each bell is, so every screen
// works out the same chart from it and the seed; anyone who comes up after it went round is sent it
// again. A chord left with one key is said ("ph"), so the host counts it. A pull is timed on the puller's own synced clock, and what goes
// round is when that pull makes the bell sound; since that's a little after the pull, it usually
// reaches everyone before the bell is due, and every screen plays it at the same shared moment,
// however far away the puller is. The host judges each row from those times (the puller decided
// their own pull, as a shooter decides their own hits), says which bells were out and what's left of
// the striking, and when it's won or collapsed. Your score and streak are your own screen's. Steady
// old ringers, striking on the beat on every screen alike, take over a ringer's ropes if they leave.
//
// For testing, ?ringer=good rings your own bells for you on the beat, and ?ringer=bad rings them
// all over the place; either puts window.__bells up for a probe to read.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as SFX from "./audio";
import { registerChallenge, type ChallengeSpot } from "./challenges";
import { dayNumber } from "./daylight";
import { control, isKey } from "./controls";
import { padTake } from "./gamepad";
import { AHEAD, Highway, type Gem } from "./bellhighway";
import type { GameMap } from "./map";
import { openGround } from "./oddments";
import { speak } from "./posh";
import { Avatar } from "./avatar";
import { esc, hash, type Card, type Job, type Waiting } from "./quests";
import { ring } from "./lineup";
import { named } from "./notice";

const COLOUR = "#d9a441";
const LEAD = 200;            // ms from pulling the rope to the bell sounding
const HALF = 5;              // the ringing chamber's half-width, metres
const ROOM_H = 3.7;
const CLIMB = 6;             // how close to the vicar's board (or under the chamber) to climb the tower
const MAX_BELLS = 12;
const MAX_RINGERS = 8;
const PLACE = "1234567890ET";
const STAGE = ["", "", "", "Singles", "Minimus", "Doubles", "Minor", "Triples", "Major", "Caters", "Royal", "Cinques", "Maximus"];
const AUTO = new URLSearchParams(location.search).get("ringer");
const PATHS = new Set(["footway", "steps", "cycleway", "path", "bridleway", "track"]);

// ---- methods ------------------------------------------------------------------------------------

type Kind = "hunt" | "bob" | "grandsire";
interface Plan { name: string; kind: Kind; courses: number }

/** One lead of a method in place notation: "x" swaps every pair, digits are the places made. */
function lead(n: number, kind: Kind): string[] {
  const N = PLACE[n - 1], odd = n % 2 === 1;
  const hunt = odd ? [N, "1"] : ["x", "1" + N];
  if (kind === "hunt") return hunt;
  if (kind === "grandsire") { const out = ["3", "1"]; for (let i = 0; i < n - 1; i++) out.push(N, "1"); return out; }
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(...hunt);
  out[out.length - 1] = odd ? "12" + N : "12";
  return out;
}

function change(row: number[], c: string): number[] {
  const r = [...row], stay = new Set(c === "x" ? [] : [...c].map((ch) => PLACE.indexOf(ch)));
  for (let i = 0; i < r.length - 1;) {
    if (stay.has(i)) { i++; continue; }
    [r[i], r[i + 1]] = [r[i + 1], r[i]];
    i += 2;
  }
  return r;
}

/** Which method on which day: plain hunting when it's easy, and the bigger the band the longer the course. */
function plan(n: number, level: number): Plan {
  const huntName = n === 3 ? "Plain Hunt on Three" : `Plain Hunt ${STAGE[n]}`;
  // a big ring hunts: a course of anything else on ten or twelve would take the best part of an hour
  if (n > 8) return { name: huntName, kind: "hunt", courses: level ? 2 : 1 };
  if (level === 0) return { name: huntName, kind: "hunt", courses: n <= 4 ? 3 : 2 };
  if (n === 3) return { name: huntName, kind: "hunt", courses: level === 1 ? 4 : 6 };
  if (level === 1) {
    if (n === 8) return { name: huntName, kind: "hunt", courses: 3 };
    if (n % 2) return { name: `Grandsire ${STAGE[n]}`, kind: "grandsire", courses: 1 };
    return { name: `Plain Bob ${STAGE[n]}`, kind: "bob", courses: 1 };
  }
  return { name: `Plain Bob ${STAGE[n]}`, kind: "bob", courses: n === 4 ? 2 : 1 };
}

/** Every row of the touch: two whole pulls of rounds, the method until it comes round, and a whole pull more. */
function rowsOf(n: number, p: Plan): { rows: number[][]; changesFrom: number; changesTo: number } {
  const rounds = Array.from({ length: n }, (_, i) => i);
  const rows = [rounds, rounds, rounds, rounds];
  const pn = lead(n, p.kind);
  let r = rounds, done = 0;
  for (let guard = 0; done < p.courses && guard < 60; guard++) {
    for (const c of pn) { r = change(r, c); rows.push(r); }
    if (r.every((b, i) => b === i)) done++;
  }
  const changesTo = rows.length - 1;
  rows.push(rounds, rounds);
  return { rows, changesFrom: 4, changesTo };
}

const ordinal = (k: number) => k === 1 ? "1st" : k === 2 ? "2nd" : k === 3 ? "3rd" : `${k}th`;
const bellName = (b: number, n: number) => b === 0 ? "the treble" : b === n - 1 ? "the tenor" : `the ${ordinal(b + 1)}`;

// ---- where it goes ------------------------------------------------------------------------------

function ringArea(r: number[][]) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a) / 2;
}
function inRing(r: number[][], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside;
  }
  return inside;
}

/** What the church is called: a churchyard or a church of that name round it, or the street it's on. */
function churchName(map: GameMap, cx: number, cy: number, own: string, road: string): string {
  if (own && !/^\d/.test(own)) return own;
  const not = /school|nursery|allotment|primary|academy|college|park|garden|green|terrace|place|road|street|square|cemetery|lane|hall|centre|court/i;
  const named = [...(map.d.pl ?? []), ...(map.wide?.d.pl ?? [])].filter((p) => p.n && p.r.length >= 3 && /church|abbey|cathedral|minster|chapel|\bst\.? |saint/i.test(p.n) && !not.test(p.n));
  let best = "", bd = 160;
  for (const p of named) {
    const mx = p.r.reduce((s, q) => s + q[0], 0) / p.r.length, my = p.r.reduce((s, q) => s + q[1], 0) / p.r.length;
    const d = inRing(p.r, cx, cy) ? 0 : Math.hypot(mx - cx, my - cy);
    if (d < bd || (d === bd && p.n < best)) { bd = d; best = p.n; }
  }
  if (/abbey/i.test(best)) return "the Abbey";
  if (best) return best.replace(/\s*churchyard$/i, " Church");
  return road ? `the church on ${road}` : "the parish church";
}

/** The biggest church in reach of where everyone starts, with its noticeboard on the street outside
 *  and the ringing chamber over the middle of that street. Only the first area and the wide map, so
 *  every player finds the same one. */
function place(map: GameMap): ChallengeSpot[] | null {
  const D = map.d, W = map.wide;
  const sp = D.spawn?.length ? D.spawn : [[0, 0]];
  const hx = sp.reduce((s, p) => s + p[0], 0) / sp.length, hy = sp.reduce((s, p) => s + p[1], 0) / sp.length;
  const home = openGround(map);
  const churches = [...(D.bl ?? []), ...(W?.bl ?? [])].filter((b) => b.c === "church" && b.r[0]?.length >= 3).map((b) => {
    const r = b.r[0], cx = r.reduce((s, q) => s + q[0], 0) / r.length, cy = r.reduce((s, q) => s + q[1], 0) / r.length;
    return { b, r, cx, cy, a: ringArea(r) };
  }).filter((c) => c.a >= 150 && Math.hypot(c.cx - hx, c.cy - hy) < 3500 && map.fieldEdge(c.cx, -c.cy) > 60
    && (!home || Math.hypot(home.x - c.cx, home.y - c.cy) > 80))
    .sort((a, b) => b.a - a.a || a.cx - b.cx || a.cy - b.cy);
  const roads = [...D.rd, ...(W?.rd ?? [])].filter((r) => !PATHS.has(r.c));
  for (const c of churches) {
    let best: { x: number; y: number; d: number; w: number; n: string } | null = null;
    for (const rd of roads) {
      for (let i = 1; i < rd.p.length; i++) {
        const a = rd.p[i - 1], b = rd.p[i];
        if (Math.abs(a[0] - c.cx) > 200 || Math.abs(a[1] - c.cy) > 200) continue;
        const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
        const t = l ? Math.max(0, Math.min(1, ((c.cx - a[0]) * dx + (c.cy - a[1]) * dy) / l)) : 0;
        const x = a[0] + dx * t, y = a[1] + dy * t, d = Math.hypot(x - c.cx, y - c.cy);
        if (d < 150 && !inRing(c.r, x, y) && (!best || d < best.d)) best = { x, y, d, w: rd.w ?? 6, n: rd.n };
      }
    }
    if (!best || map.fieldEdge(best.x, -best.y) < 60) continue;
    const ux = (c.cx - best.x) / best.d, uy = (c.cy - best.y) / best.d;
    let bx = best.x + ux * (best.w / 2 + 2.2), by = best.y + uy * (best.w / 2 + 2.2);
    if (inRing(c.r, bx, by)) { bx = best.x; by = best.y; }
    const name = churchName(map, c.cx, c.cy, c.b.n, best.n);
    return [{ x: bx, z: -by, name }, { x: best.x, z: -best.y, name: `the ringing chamber of ${name}` }];
  }
  return null;
}

// ---- the bells' sound ---------------------------------------------------------------------------

const buffers = new Map<string, AudioBuffer>();
/** A tower bell struck once, made sample by sample: the hum an octave under the strike note, the
 *  prime, the minor-third tierce that makes an English bell sound like one, the quint and the
 *  nominal, and a little of the upper partials, each dying away at its own rate, with a clapper's
 *  knock at the start. The hum and the nominal come in close pairs, so the bell warbles as it fades. */
function bellBuffer(c: AudioContext, f: number): AudioBuffer {
  const key = `${c.sampleRate}:${f.toFixed(2)}`;
  const had = buffers.get(key);
  if (had) return had;
  const sr = c.sampleRate, D = 2.4 * Math.pow(311 / f, 0.7), len = Math.floor(sr * Math.min(5.5, D * 1.8));
  const buf = c.createBuffer(1, len, sr), out = buf.getChannelData(0);
  const parts: [number, number, number][] = [
    [0.5, 0.3, 1.0], [0.5025, 0.16, 0.9], [1, 0.42, 0.62], [1.183, 0.32, 0.46], [1.506, 0.12, 0.3],
    [2, 0.5, 0.4], [2.0035, 0.25, 0.36], [2.66, 0.11, 0.2], [3.01, 0.15, 0.16], [4.07, 0.09, 0.09], [5.4, 0.05, 0.05],
  ];
  for (const [m, amp, life] of parts) {
    const w = (2 * Math.PI * f * m) / sr, cw = Math.cos(w), sw = Math.sin(w), k = Math.exp(-1 / (sr * D * life));
    let re = 1, im = 0, a = amp;
    for (let i = 0; i < len; i++) {
      out[i] += im * a;
      const nr = re * cw - im * sw; im = re * sw + im * cw; re = nr;
      a *= k;
    }
  }
  const knock = Math.floor(sr * 0.03);
  let seed = Math.floor(f * 1000), lp = 0;
  for (let i = 0; i < knock; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    lp += ((seed / 0x7fffffff) * 2 - 1 - lp) * 0.5;
    out[i] += lp * 0.5 * Math.exp(-i / (sr * 0.006)) + Math.sin(i * 2 * Math.PI * f * 6.9 / sr) * 0.2 * Math.exp(-i / (sr * 0.012));
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < len; i++) {
    out[i] *= 0.9 / peak;
    if (i < 96) out[i] *= i / 96;
  }
  buffers.set(key, buf);
  return buf;
}

/** The ring tuned to a major scale, tenor lowest on the key note and the treble at the top; a big
 *  ring has a heavier tenor, as real ones do. */
function tuning(n: number): number[] {
  const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19], tenor = n > 8 ? 233.1 : 311.1;
  return Array.from({ length: n }, (_, b) => tenor * Math.pow(2, MAJOR[n - 1 - b] / 12));
}

/** A rope's swish and creak, or a heavy thump when one hauls someone off their feet. */
function ropeSound(c: AudioContext, at: number, vol: number, heavy: boolean) {
  const o = SFX.sfxOut(vol, 0, 0, 0.1);
  if (!o) return;
  const len = Math.floor(c.sampleRate * (heavy ? 0.35 : 0.22)), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    lp += (Math.random() * 2 - 1 - lp) * (heavy ? 0.08 : 0.25);
    const env = Math.sin((Math.PI * i) / len);
    d[i] = lp * env * (heavy ? 2.5 : 1.2) + (heavy ? Math.sin((i * 2 * Math.PI * 70) / c.sampleRate) * Math.exp(-i / (c.sampleRate * 0.08)) : 0);
  }
  const s = c.createBufferSource();
  s.buffer = buf;
  s.connect(o);
  s.start(at);
}

// ---- outside the church -------------------------------------------------------------------------

/** The sandwich board on the pavement and the vicar stood by it, beckoning, facing the street. */
class Welcome implements Waiting {
  private board = new THREE.Group();
  private vicar = new Avatar("The Vicar", "#1a1a1e", "vicar", "#9a9894");
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private tex: THREE.Texture;
  private t = 0;
  private vx: number; private vz: number;

  constructor(private scene: THREE.Scene, map: GameMap, private at: ChallengeSpot, street: ChallengeSpot) {
    let ux = street.x - at.x, uz = street.z - at.z;
    const l = Math.hypot(ux, uz);
    if (l < 0.5) { ux = 1; uz = 0; } else { ux /= l; uz /= l; }
    this.tex = canvasTex(256, 384, (x) => {
      x.fillStyle = "#f4ecd4"; x.fillRect(0, 0, 256, 384);
      x.strokeStyle = "#8a1c22"; x.lineWidth = 8; x.strokeRect(10, 10, 236, 364);
      x.textAlign = "center";
      x.font = "700 30px Georgia, serif"; x.fillStyle = "#1b1b1d";
      x.fillText("TRY", 128, 58);
      x.font = "800 48px Georgia, serif"; x.fillStyle = "#8a1c22";
      x.fillText("BELL", 128, 112); x.fillText("RINGING", 128, 162);
      x.font = "700 30px Georgia, serif"; x.fillStyle = "#1b1b1d";
      x.fillText("TODAY", 128, 204);
      // a bell, in chalk
      x.fillStyle = "#e3b13c";
      x.beginPath(); x.moveTo(88, 320); x.quadraticCurveTo(96, 250, 128, 248); x.quadraticCurveTo(160, 250, 168, 320); x.closePath(); x.fill();
      x.beginPath(); x.arc(128, 326, 9, 0, Math.PI * 2); x.fill();
      x.font = "italic 17px Georgia, serif"; x.fillStyle = "#333";
      x.fillText("All welcome. Up the tower", 128, 362);
    });
    const face = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }), wood = new THREE.MeshLambertMaterial({ color: "#4a3420" });
    this.mats.push(face, wood);
    const panel = new THREE.BoxGeometry(0.8, 1.15, 0.03), sheet = new THREE.PlaneGeometry(0.72, 1.04);
    this.geos.push(panel, sheet);
    for (const side of [1, -1]) {
      const leaf = new THREE.Group();
      leaf.position.set(0, 1.15, 0);
      leaf.rotation.x = -side * 0.24;
      const p = new THREE.Mesh(panel, wood);
      p.position.set(0, -0.57, side * 0.02);
      p.castShadow = true;
      const f = new THREE.Mesh(sheet, face);
      f.position.set(0, -0.57, side * 0.037);
      if (side < 0) f.rotation.y = Math.PI;
      leaf.add(p, f);
      this.board.add(leaf);
    }
    // one face to the street and one to the church door, the vicar beside it looking out at the street
    this.board.position.set(at.x, map.ground(at.x, at.z), at.z);
    this.board.rotation.y = Math.atan2(ux, uz);
    scene.add(this.board);
    this.vx = at.x - uz * 1.1 - ux * 0.4; this.vz = at.z + ux * 1.1 - uz * 0.4;
    const v = this.vicar;
    v.armed = false; v.tagged = false;
    const yaw = Math.atan2(-ux, -uz);
    const black = new THREE.MeshLambertMaterial({ color: "#121214" }), white = new THREE.MeshLambertMaterial({ color: "#f6f6f2" });
    const cassock = new THREE.BoxGeometry(0.44, 0.84, 0.3), collar = new THREE.CylinderGeometry(0.068, 0.068, 0.045, 12);
    this.mats.push(black, white); this.geos.push(cassock, collar);
    const skirt = new THREE.Mesh(cassock, black);
    skirt.position.y = 0.5; skirt.rotation.y = yaw; skirt.castShadow = true;
    const band = new THREE.Mesh(collar, white);
    band.position.y = 1.49;
    const tab = new THREE.Mesh(collar, white);
    tab.scale.set(0.45, 1.1, 0.25);
    tab.position.set(-Math.sin(yaw) * 0.07, 1.47, -Math.cos(yaw) * 0.07);
    v.root.add(skirt, band, tab);
    v.holdAt(this.vx, map.ground(this.vx, this.vz), this.vz, yaw, 0, 0);
    scene.add(v.root);
  }

  dist(x: number, z: number) {
    return Math.max(0, Math.min(Math.hypot(x - this.at.x, z - this.at.z), Math.hypot(x - this.vx, z - this.vz)) - 0.5);
  }

  update(dt: number) {
    this.t += dt;
    // a wave over every few seconds: come on, have a go
    this.vicar.wave = this.t % 7 < 2 ? 2 : 0;
    this.vicar.update(performance.now(), dt);
  }

  dispose() {
    this.scene.remove(this.board, this.vicar.root);
    this.vicar.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.tex.dispose();
  }
}

// ---- the ringing chamber ------------------------------------------------------------------------

function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, mirror = false) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (mirror) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; }
  return t;
}

function speckle(x: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},${alpha * Math.random()})`;
    x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

/** Limewashed walls with a peal board, a lancet window and the tower rules; seen from inside. */
function wallTexture(church: string) {
  return canvasTex(1024, 384, (x) => {
    x.fillStyle = "#e8dfc8"; x.fillRect(0, 0, 1024, 384);
    speckle(x, 1024, 384, 3000, 0.08);
    x.fillStyle = "#4a2e1a"; x.fillRect(0, 344, 1024, 40);
    x.fillStyle = "#2a1a10"; x.fillRect(0, 340, 1024, 4);
    // the peal board
    x.fillStyle = "#3b2414"; x.fillRect(84, 70, 330, 200);
    x.fillStyle = "#101014"; x.fillRect(94, 80, 310, 180);
    x.fillStyle = "#d6b25a"; x.textAlign = "center";
    x.font = "700 17px Georgia, serif"; x.fillText(church.toUpperCase().slice(0, 30), 249, 108);
    x.font = "italic 14px Georgia, serif";
    ["On Saturday the 4th of June", "a Peal of 5040 Changes", "PLAIN BOB TRIPLES", "was rung in 2 hours 58 minutes", "Treble W. Gay · Tenor H. Ellis", "Conducted by J. Parfitt"]
      .forEach((l, k) => x.fillText(l, 249, 138 + k * 21));
    // the window, a pointed lancet with daylight in it
    x.fillStyle = "#6c6252"; x.beginPath(); x.moveTo(600, 290); x.lineTo(600, 130); x.quadraticCurveTo(640, 50, 680, 130); x.lineTo(680, 290); x.fill();
    const g = x.createLinearGradient(0, 70, 0, 290); g.addColorStop(0, "#f4f8ff"); g.addColorStop(1, "#a9c2d8");
    x.fillStyle = g; x.beginPath(); x.moveTo(608, 284); x.lineTo(608, 132); x.quadraticCurveTo(640, 64, 672, 132); x.lineTo(672, 284); x.fill();
    x.strokeStyle = "#3a3a3a"; x.lineWidth = 2;
    for (let yy = 140; yy < 284; yy += 24) { x.beginPath(); x.moveTo(608, yy); x.lineTo(672, yy); x.stroke(); }
    // the tower rules
    x.fillStyle = "#f6f0e0"; x.fillRect(790, 120, 150, 110);
    x.fillStyle = "#222"; x.font = "700 13px Georgia, serif"; x.fillText("RULES OF THE TOWER", 865, 142);
    x.font = "11px Georgia, serif";
    ["No ringer to ring with his hat on", "No swearing, nor any quarrel", "Look to before the treble goes", "Whoever overturns a bell", "pays sixpence"].forEach((l, k) => x.fillText(l, 865, 162 + k * 15));
  }, true);
}

function floorTexture(rope: number) {
  return canvasTex(512, 512, (x) => {
    for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? "#6a4a2c" : "#5e4126"; x.fillRect(0, i * 32, 512, 32); }
    x.strokeStyle = "rgba(0,0,0,0.35)";
    for (let i = 0; i < 16; i++) { x.beginPath(); x.moveTo(0, i * 32); x.lineTo(512, i * 32); x.stroke(); }
    speckle(x, 512, 512, 2500, 0.1);
    const r = ((rope + 1.1) / (HALF * 2)) * 512;
    x.fillStyle = "#7a1f22"; x.beginPath(); x.arc(256, 256, r, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "#d6b25a"; x.lineWidth = 6; x.beginPath(); x.arc(256, 256, r - 12, 0, Math.PI * 2); x.stroke();
  });
}

function ceilingTexture() {
  return canvasTex(256, 256, (x) => {
    x.fillStyle = "#d8ceb4"; x.fillRect(0, 0, 256, 256);
    x.fillStyle = "#4a321e";
    for (let i = 0; i < 6; i++) x.fillRect(i * 51, 0, 10, 256);
    speckle(x, 256, 256, 800, 0.08);
  });
}

function stoneTexture() {
  return canvasTex(512, 192, (x) => {
    x.fillStyle = "#c9b48a"; x.fillRect(0, 0, 512, 192);
    x.strokeStyle = "rgba(80,60,30,0.35)";
    for (let r = 0; r < 8; r++) {
      x.beginPath(); x.moveTo(0, r * 24); x.lineTo(512, r * 24); x.stroke();
      for (let k = 0; k < 9; k++) { const xx = k * 60 + (r % 2) * 30; x.beginPath(); x.moveTo(xx, r * 24); x.lineTo(xx, r * 24 + 24); x.stroke(); }
    }
    for (const cx of [128, 384]) {
      x.fillStyle = "#2a2620"; x.fillRect(cx - 34, 40, 68, 120);
      x.fillStyle = "#6b5b40";
      for (let yy = 48; yy < 160; yy += 12) x.fillRect(cx - 34, yy, 68, 5);
    }
    speckle(x, 512, 192, 1500, 0.1);
  });
}

/** A bell rope: the rope, its striped woollen sally and the tail end, one mesh. y 0 is the middle of the sally. */
function ropeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, y: number, col: string) => {
    g.translate(0, y, 0);
    const c = new THREE.Color(col), n = g.getAttribute("position").count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    parts.push(g.toNonIndexed());
  };
  add(new THREE.CylinderGeometry(0.014, 0.014, 6, 5, 1, true), 2.6, "#c8b48a");
  add(new THREE.CylinderGeometry(0.018, 0.018, 1.5, 5, 1, true), -1.2, "#bba67c");
  const bands = ["#b3202c", "#efe6d2", "#1f3c88", "#efe6d2", "#b3202c", "#efe6d2", "#1f3c88"];
  bands.forEach((col, k) => add(new THREE.CylinderGeometry(0.045, 0.045, 0.9 / bands.length, 7), -0.45 + (k + 0.5) * (0.9 / bands.length), col));
  return mergeGeometries(parts)!;
}

/** One of the steady old ringers: a coat, a head and both arms up on the rope. */
function ringerGeometry(coat: string): { body: THREE.BufferGeometry; arm: THREE.BufferGeometry } {
  const paint = (g: THREE.BufferGeometry, col: string) => {
    const c = new THREE.Color(col), n = g.getAttribute("position").count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    return g.toNonIndexed();
  };
  const legs = paint(new THREE.CylinderGeometry(0.16, 0.14, 0.8, 7).translate(0, 0.4, 0), "#2a2a30");
  const body = paint(new THREE.CylinderGeometry(0.2, 0.22, 0.7, 8).translate(0, 1.15, 0), coat);
  const head = paint(new THREE.SphereGeometry(0.13, 8, 6).translate(0, 1.66, 0), "#e2b896");
  const cap = paint(new THREE.SphereGeometry(0.135, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.7, 0), "#c8c8c8");
  const arm = mergeGeometries([
    paint(new THREE.BoxGeometry(0.07, 1, 0.07).translate(0.09, 0.5, 0), coat),
    paint(new THREE.BoxGeometry(0.07, 1, 0.07).translate(-0.09, 0.5, 0), coat),
  ])!;
  return { body: mergeGeometries([legs, body, head, cap])!, arm };
}

interface Chamber {
  root: THREE.Group;
  ropes: THREE.Mesh[];
  figures: { body: THREE.Mesh; arm: THREE.Mesh; b: number }[];
  setBells(n: number, steady: number[]): void;
  dispose(): void;
}

function buildChamber(cx: number, cz: number, top: number, church: string): Chamber {
  const root = new THREE.Group();
  root.position.set(cx, top, cz);
  const mats: THREE.Material[] = [];
  const wall = new THREE.MeshBasicMaterial({ map: wallTexture(church), side: THREE.BackSide });
  const floorMat = new THREE.MeshBasicMaterial({ map: floorTexture(ropeR(MAX_BELLS)), side: THREE.BackSide });
  const ceil = new THREE.MeshBasicMaterial({ map: ceilingTexture(), side: THREE.BackSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, ROOM_H, HALF * 2), [wall, wall, ceil, floorMat, wall, wall]);
  room.position.y = ROOM_H / 2;
  const stone = new THREE.MeshBasicMaterial({ map: stoneTexture() });
  const lead = new THREE.MeshBasicMaterial({ color: "#5d6266" });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 0.4, ROOM_H + 0.8, HALF * 2 + 0.4), [stone, stone, lead, stone, stone, stone]);
  shell.position.y = ROOM_H / 2;
  mats.push(wall, floorMat, ceil, stone, lead);
  root.add(room, shell);
  const ropeGeo = ropeGeometry(), ropeMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const figMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  mats.push(ropeMat, figMat);
  const geos: THREE.BufferGeometry[] = [ropeGeo];
  const ch: Chamber = {
    root, ropes: [], figures: [],
    setBells(n, steady) {
      for (const r of ch.ropes) root.remove(r);
      for (const f of ch.figures) { root.remove(f.body, f.arm); f.body.geometry.dispose(); f.arm.geometry.dispose(); }
      ch.ropes = []; ch.figures = [];
      for (let b = 0; b < n; b++) {
        const [rx, rz] = ropeAt(b, n, 0);
        const m = new THREE.Mesh(ropeGeo, ropeMat);
        m.position.set(rx, 1.5, rz);
        root.add(m);
        ch.ropes.push(m);
      }
      steady.forEach((b, k) => {
        const g = ringerGeometry(["#3c4a2a", "#5a3a28", "#2c3448", "#4a2a3a"][k % 4]);
        const [sx, sz] = ropeAt(b, n, 0.5), [rx, rz] = ropeAt(b, n, 0);
        const body = new THREE.Mesh(g.body, figMat), arm = new THREE.Mesh(g.arm, figMat);
        body.position.set(sx, 0, sz);
        body.rotation.y = Math.atan2(sx, sz);
        arm.position.set(sx + (rx - sx) * 0.85, 1.4, sz + (rz - sz) * 0.85);
        arm.rotation.y = body.rotation.y;
        root.add(body, arm);
        ch.figures.push({ body, arm, b });
      });
    },
    dispose() {
      for (const g of geos) g.dispose();
      room.geometry.dispose(); shell.geometry.dispose();
      for (const f of ch.figures) { f.body.geometry.dispose(); f.arm.geometry.dispose(); }
      for (const m of mats) { (m as THREE.MeshBasicMaterial).map?.dispose(); m.dispose(); }
    },
  };
  return ch;
}

/** How far out from the middle of the chamber a ring of n ropes hangs. */
const ropeR = (n: number) => 1.3 + 0.18 * n;
/** Where bell b's rope hangs (out: 0), or where its ringer stands (out: 0.95), from the middle of the chamber. */
function ropeAt(b: number, n: number, out: number): [number, number] {
  const r = ropeR(n) + out, a = Math.PI - (b / n) * Math.PI * 2;
  return [Math.sin(a) * r, Math.cos(a) * r];
}
/** Where someone watching stands, against the wall between the ropes. */
function watchAt(k: number): [number, number] {
  const a = ((k + 0.5) / 10) * Math.PI * 2, r = HALF - 0.7;
  return [Math.sin(a) * r, Math.cos(a) * r];
}

// ---- the challenge ------------------------------------------------------------------------------

interface Go { T: number; n: number; L: number; band: string[] }
type Phase = "gather" | "ring" | "stand" | "down";

/** The four lanes, left to right, each in its own colour, and on a touch screen where it sits. */
const LANE_CTL = ["bells.lane1", "bells.lane2", "bells.lane3", "bells.lane4"];
const LANE_COLOUR = ["#3fd24a", "#e8423a", "#f2d43a", "#3a8af2"];
const LANE_PAD = ["◀", "▲", "▼", "▶"];

/** The bells for this many ringers (up to eight) on a day of level L, and whose each is (blank for
 *  a steady old ringer): four or five alone, two or three each for up to four of you, one or two
 *  each beyond that, up to twelve, shared out in turn; a harder day has one more while there's room. */
function bandFor(ids: string[], L: number): string[] {
  const k = Math.min(MAX_RINGERS, ids.length);
  const n = Math.min(MAX_BELLS, [4, 4, 5, 7, 8, 9, 10, 11, 12][k] + (L >= 1 ? 1 : 0));
  return Array.from({ length: n }, (_, b) => (k ? ids[b % k] : ""));
}

/** How long a bell's beat is, ms: quicker with more bells and on a harder day. */
const beatOf = (n: number, L: number) => (430 - 18 * Math.min(n, 12)) * (1 - 0.07 * L);
/** A ringer's notes a second, from how many bells they hold. */
const npsOf = (bells: number, n: number, L: number) => (bells * 1000) / ((n + 0.5) * beatOf(n, L));
/** How many of a ringer's notes are chords: none to speak of when they're busy, a third or more when
 *  they've a strike every couple of seconds, and more on a harder day. */
const chordRate = (nps: number, L: number) => Math.max(0, Math.min(0.55, 0.52 - 0.22 * nps)) + 0.08 * L;
/** A ringer's Good window either side of the beat, ms: narrower the fewer notes they have, so a
 *  bell or two each still takes some striking, and on a harder day, but never so narrow that a pad's
 *  or a screen's lag makes it a lottery. Perfect is two fifths of it, and never under 30 ms. */
const windowOf = (nps: number, L: number) => Math.max(70, 135 * Math.min(1, 0.45 + 0.22 * nps) * (1 - 0.1 * L));
const perfectOf = (ok: number) => Math.max(30, ok * 0.4);

const STRIKING = 0.6;        // the band's striking at the start, 0..1
const FAULT = 0.07;          // what each bell missed or clashed in a row costs it, for two ringers or fewer
const MEND = 0.03;           // and what a clean row gives back

registerChallenge({
  id: "bells", name: "Bell Ringing", glyph: "R", colour: COLOUR, tier: 2, stars: 3,
  blurb: "Up the tower, a rope or two each: ring your part of the method down the note highway, and keep the band striking",
  goal: () => "Ring the touch through without the bells collapsing into a jangle",
  place,
  waiting: ({ spots, w }) => new Welcome(w.scene, w.map, spots[0], spots[1] ?? spots[0]),
  // round the vicar for a moment, then straight up into the ringing chamber: the conductor's own
  // "Look to!" is the only count in
  lineup: { start: "calm", hold: 0.5, spots: ({ spots, w }, n) => ring(w.map, spots[0].x, spots[0].z, n, 2.4) },
  start({ offer, spots, w, cast }) {
    const board = spots[0], mid = spots[1] ?? spots[0];
    const church = board.name;
    const C = { x: mid.x, z: mid.z };
    const ground0 = (map: GameMap) => (map.wide ? map.wide.ground(C.x, C.z) : map.ground(C.x, C.z));
    // high enough to clear the church and anything round it, the same on every screen
    let tallest = ground0(w.map);
    for (const b of w.map.wide?.buildingsNear(C.x, -C.z, 30) ?? []) tallest = Math.max(tallest, b.g + b.h + (b.rp ?? 0));
    const top = Math.round(Math.max(ground0(w.map) + 50, tallest + 14));
    const level = hash("bells", dayNumber()) % 3;

    // the shared clock: the host's, as near as each screen can tell
    let off: number | null = w.isHost ? 0 : null;
    const samples: { rtt: number; est: number }[] = [];
    let pingT = 0, pings = 0;
    const nowS = () => performance.now() + (off ?? 0);

    let phase: Phase = "gather";
    let list: string[] = [];
    let go: Go | null = null;
    let rows: number[][] = [], placeOf: number[][] = [], changesFrom = 4, changesTo = 4, methodName = "";
    let B = 400, okT = 130, perfT = 50, period = 1000, R = 0, fault = FAULT;
    let mine: number[] = [];
    // the chart, for every bell: its lane in each row, the lane it's paired with for a chord (or -1),
    // and how wide its ringer's window is
    let laneAt: number[][] = [], pairAt: number[][] = [], okOf: number[] = [];
    const half = new Map<number, number>();      // my chords with one key down: the key it was
    const halves = new Set<number>();            // anyone's chords struck with one key only
    const steady = new Set<number>();
    const pulls = new Map<number, Map<number, number>>();
    const struck = new Set<number>();
    let judged = -1, bad = 0, lastBad = -10, striking = STRIKING;
    let ending: { won: boolean; why: string; collapse: boolean; t: number } | null = null;
    let aboard = false, perchY: number | null = null, faced = false, yankAt = -1e9;
    const posed = new Set<string>();
    let stage: Card["stage"] = undefined;
    const said = new Set<string>();
    let lookAsked = false;
    let jangleT = 0;
    let gatherSince = 0;
    let upAtGo = cast.includes(w.selfId);
    let feedAt = 0, heard = 0, sounded = 0;
    let shout: { text: string; t: number } | null = null;
    // your own part: how it's going, on this screen only
    const gone = new Set<number>();
    let score = 0, streak = 0, best = 0, notes = 0, clean = 0;
    const mult = () => Math.min(4, 1 + Math.floor(streak / 8));

    const chamber = buildChamber(C.x, C.z, top, church);
    // the vicar and his board stay out, so there's still somewhere to go up from
    const welcome = new Welcome(w.scene, w.map, board, mid);
    let shown = false, chamberN = 0;
    w.mark("@challenge", { x: board.x, z: board.z }, offer.title, COLOUR);

    const ringing = () => aboard && phase === "ring" && !!go && mine.length > 0 && !paused();
    const highway = new Highway((k, down) => { highway.press(k, down); if (down && ringing()) pull(k); });
    /** The lanes a note of bell b in row r wants struck: one, or two together for a chord. */
    const lanesOf = (b: number, r: number) => (pairAt[b][r] >= 0 ? [laneAt[b][r], pairAt[b][r]] : [laneAt[b][r]]);
    const laneFor = (match: (id: string) => boolean) => LANE_CTL.findIndex(match);
    // the lane keys are the chamber's while you ring: W A S D don't walk you. Let-gos still go
    // through, so nothing held from before is left down.
    const onKey = (e: KeyboardEvent) => {
      if (!ringing() || e.target instanceof HTMLInputElement) return;
      const k = laneFor((id) => isKey(e.code, id));
      if (k < 0) return;
      if (e.type === "keyup") { highway.press(k, false); return; }
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat) return;
      highway.press(k, true);
      pull(k);
    };
    addEventListener("keydown", onKey, true);
    addEventListener("keyup", onKey, true);
    // and so is every lane's button on a pad: the face buttons neither jump, fire nor reload
    padTake((b, down) => {
      const k = laneFor((id) => control(id)?.pad === b);
      if (!ringing() || k < 0) return false;
      highway.press(k, down);
      if (!down) return false;
      pull(k);
      return true;
    });

    const n = () => go?.n ?? bandFor(cast.length ? cast : list, level).length;
    const rowStart = (r: number) => (r * go!.n + Math.floor(r / 2)) * B;
    const beat = (b: number, r: number) => go!.T + rowStart(r) + placeOf[r][b] * B;
    const rowAt = (t: number) => {
      if (!go) return -1;
      let r = Math.max(0, Math.floor((t - go.T) / period));
      while (r > 0 && go.T + rowStart(r) > t) r--;
      while (go.T + rowStart(r + 1) <= t) r++;
      return r;
    };
    const ctxNow = () => SFX.context();
    const camera = () => w.look();
    const inside = () => { const c = camera(); return Math.abs(c.x - C.x) < HALF && Math.abs(c.z - C.z) < HALF && c.y > top - 0.5 && c.y < top + ROOM_H + 0.5; };

    /** Bell b sounds at shared time s, on this screen's sound clock. */
    function strike(b: number, s: number, rate = 1, vol = 1) {
      const c = ctxNow();
      if (!c || !go) return;
      const cam = camera(), into = inside();
      const dist = into ? 0 : Math.hypot(cam.x - C.x, cam.y - top - 4, cam.z - C.z);
      if (dist > 900) return;
      const [, pan] = into || !w.hear ? [0, 0] : w.hear(C.x, top + 4, C.z);
      const o = SFX.sfxOut((into ? 0.55 : 0.9) * vol * (into ? 1 : 40 / (40 + dist)), pan, dist, into ? 0.32 : 0.2);
      if (!o) return;
      const src = c.createBufferSource();
      src.buffer = bellBuffer(c, tuning(go.n)[b]);
      src.playbackRate.value = rate;
      src.connect(o);
      src.start(c.currentTime + Math.max(0, (s - nowS()) / 1000));
      sounded++;
    }

    function setGo(g: Go) {
      go = g;
      const p = plan(g.n, g.L);
      const t = rowsOf(g.n, p);
      rows = t.rows; changesFrom = t.changesFrom; changesTo = t.changesTo; methodName = p.name;
      R = rows.length;
      placeOf = rows.map((row) => { const at: number[] = []; row.forEach((b, i) => { at[b] = i; }); return at; });
      B = beatOf(g.n, g.L);
      period = (g.n + 0.5) * B;
      steady.clear();
      g.band.forEach((id, b) => { if (!id) steady.add(b); });
      mine = g.band.flatMap((id, b) => (id === w.selfId ? [b] : []));
      const ringers = new Set(g.band.filter(Boolean)).size;
      // a big band has many more chances to slip every row, so each slip costs it less
      fault = FAULT / Math.sqrt(Math.max(1, ringers / 2));
      chart(g);
      okT = okOf[mine[0]] ?? okT; perfT = perfectOf(okT);
      phase = phase === "gather" ? "ring" : phase;
      const c = ctxNow();
      if (c) for (const f of tuning(g.n)) bellBuffer(c, f);
    }

    /** Every bell's lanes, the same on every screen from the seed and the method. Each strike moves a
     *  lane right as its bell moves up a place, left as it moves down, and stays put as it makes a
     *  place (round the four, so a bell hunting up runs A W S D A W...); a ringer's bells start
     *  spread across the lanes. Some strikes are chords, a second lane with the first: the one the
     *  bell came from as it moved, or the opposite one as it made a place. */
    function chart(g: Go) {
      const owned = new Map<string, number[]>();
      g.band.forEach((id, b) => owned.set(id || `steady${b}`, [...(owned.get(id || `steady${b}`) ?? []), b]));
      const twist = hash("lanes", offer.seed) % 4;
      laneAt = []; pairAt = []; okOf = [];
      for (let b = 0; b < g.n; b++) {
        const theirs = owned.get(g.band[b] || `steady${b}`)!, nps = npsOf(theirs.length, g.n, g.L);
        const rate = chordRate(nps, g.L);
        okOf.push(windowOf(nps, g.L));
        let lane = (theirs.indexOf(b) + twist) % 4;
        const ls: number[] = [], ps: number[] = [];
        for (let r = 0; r < R; r++) {
          const d = r ? placeOf[r][b] - placeOf[r - 1][b] : 0, was = lane;
          lane = (lane + d + 4) % 4;
          // more on the handstroke, the strong beat
          const chord = r >= 2 && r < R - 1 && (hash("chord", offer.seed, b, r) % 1000) / 1000 < rate * (r % 2 ? 0.7 : 1.3);
          ls.push(lane); ps.push(chord ? (d ? was : (lane + 2) % 4) : -1);
        }
        laneAt.push(ls); pairAt.push(ps);
      }
    }

    function send(d: Record<string, unknown>, to?: string) {
      w.send("qe", { ...d, s: offer.seed }, to);
    }
    function tell(d: Record<string, unknown>) {
      send(d);
      job.event!(d, w.selfId);
    }

    function climb() {
      aboard = true;
      perchY = null; faced = false;
      const [sx, sz] = standSpot();
      w.moveTo(C.x + sx, C.z + sz, Math.atan2(sx, sz));
      w.mark("@challenge", null);
      if (w.isHost) job.event!({ k: "in" }, w.selfId); else send({ k: "in" });
    }

    function standSpot(): [number, number] {
      if (go && mine.length) return ropeAt(mine[0], go.n, 0.95);
      const k = cast.indexOf(w.selfId);
      if (!go && k >= 0 && k < MAX_RINGERS) return ropeAt(k, n(), 0.95);
      const watchers = list.filter((id) => (go ? !go.band.includes(id) : !cast.includes(id)));
      return watchAt(Math.max(0, watchers.indexOf(w.selfId)));
    }

    function startRinging() {
      if (go || !w.isHost) return;
      const here = new Set(w.players().map((p) => p.id));
      const inIt = cast.filter((id) => here.has(id));
      const band = bandFor(inIt.length ? inIt : list, level);
      // long enough for every screen to find the beat, and for the first notes to come down the highway
      tell({ k: "go", T: Math.round(nowS() + 3000), n: band.length, L: level, band });
    }

    /** A lane's key, pad or button: the note in it nearest now, struck, or the second key of a chord. */
    function pull(lane: number) {
      if (!go || off === null) return;
      const s = nowS() + LEAD;
      const c = ctxNow();
      if (c) ropeSound(c, c.currentTime, 0.25, false);
      let nr = -1, nb = -1, bd = Infinity;
      const r0 = Math.max(0, rowAt(s) - 2);
      for (let r = r0; r < Math.min(R, r0 + 5); r++) {
        if (r <= judged) continue;
        for (const b of mine) {
          const key = b * 10000 + r;
          if (gone.has(key) || !lanesOf(b, r).includes(lane)) continue;
          if (pulls.get(b)?.has(r) && (half.get(key) ?? lane) === lane) continue;
          const d = Math.abs(s - beat(b, r));
          if (d < bd) { bd = d; nr = r; nb = b; }
        }
      }
      if (nr < 0 || bd > Math.min(period * 0.45, 600)) { streak = 0; highway.judge(lane, "Nothing there", "#b9b4a8"); return; }
      const key = nb * 10000 + nr;
      if (half.has(key)) {
        // the chord's other key: judged as one strike, by whichever key was further out
        const first = pulls.get(nb)!.get(nr)!;
        half.delete(key);
        const e1 = first - beat(nb, nr), e2 = s - beat(nb, nr);
        grade(nb, nr, Math.abs(e1) > Math.abs(e2) ? e1 : e2);
        return;
      }
      ringNote(nb, nr, s);
      // the first key of a chord: the bell's away, but it's only judged once the other key comes
      if (pairAt[nb][nr] >= 0) half.set(key, lane);
      else grade(nb, nr, s - beat(nb, nr));
    }

    /** Your bell b rung for row r, sounding at shared time s: out to everyone. */
    function ringNote(b: number, r: number, s: number) {
      const m = pulls.get(b) ?? new Map<number, number>();
      pulls.set(b, m);
      m.set(r, s);
      send({ k: "p", b, r, t: Math.round(s) });
      strike(b, s);
    }

    /** How you struck your note of bell b in row r, err ms off the beat. */
    function grade(b: number, r: number, err: number) {
      const lane = laneAt[b][r];
      notes++;
      if (Math.abs(err) <= okT) {
        const perfect = Math.abs(err) <= perfT;
        streak++; best = Math.max(best, streak); clean++;
        score += (perfect ? 100 : 50) * (pairAt[b][r] >= 0 ? 2 : 1) * mult();
        highway.judge(lane, perfect ? "Perfect" : err < 0 ? "Good, a touch quick" : "Good, a touch slow", perfect ? "#58e06a" : "#e8c25a");
      } else {
        streak = 0;
        highway.judge(lane, err < 0 ? "Early! Clash" : "Late! Clash", "#ff5a4e");
        if (err > 0) yank();
      }
    }

    /** Notes of yours gone past the line unstruck, and chords left with one key. */
    function missed(t: number) {
      if (!go || !mine.length || phase !== "ring") return;
      const at = rowAt(t + LEAD);
      for (let r = Math.max(0, at - 2); r <= Math.min(R - 1, at); r++) {
        for (const b of mine) {
          const key = b * 10000 + r;
          if (gone.has(key) || beat(b, r) - LEAD + okT > t) continue;
          if (half.has(key)) {
            half.delete(key);
            gone.add(key);
            tell({ k: "ph", b, r });
            notes++; streak = 0;
            highway.judge(laneAt[b][r], "Half a chord! Clash", "#ff5a4e");
          } else if (!pulls.get(b)?.has(r)) {
            gone.add(key);
            notes++; streak = 0;
            highway.judge(laneAt[b][r], "Missed!", "#ff5a4e");
          }
        }
      }
    }

    function yank() {
      yankAt = performance.now();
      const c = ctxNow();
      if (c) ropeSound(c, c.currentTime + LEAD / 1000, 0.5, true);
    }
    const yankLift = () => { const u = (performance.now() - yankAt) / 750; return u > 0 && u < 1 ? Math.sin(Math.PI * u) * 1.3 : 0; };

    function call(key: string, text: string, title?: string, sub?: string) {
      if (said.has(key)) return;
      said.add(key);
      if (aboard || inside()) speak(text, 7, 0, { voice: 0, pitch: 0.8, rate: 1 });
      // a ringer's eyes are on the highway, so the call goes there rather than over it
      if (title && aboard && mine.length && phase === "ring") shout = { text: title, t: performance.now() };
      else if (title) stage = { key, title, sub, colour: COLOUR };
    }

    /** Host: the band's done with row r. Every bell missed or struck out of its place costs the
     *  band's striking; a clean row gives a little back. */
    function judge(r: number) {
      if (!go) return;
      const who: [number, number | null][] = [];
      for (let b = 0; b < go.n; b++) {
        if (steady.has(b)) continue;
        const s = pulls.get(b)?.get(r);
        if (s === undefined) who.push([b, null]);
        else if (Math.abs(s - beat(b, r)) > okOf[b]) who.push([b, Math.round(s - beat(b, r))]);
        else if (halves.has(b * 10000 + r)) who.push([b, 0]);
      }
      const isBad = who.length > 0;
      const nb = bad + (isBad ? 1 : 0);
      const m = Math.max(0, Math.min(1, striking - who.length * fault + (isBad ? 0 : MEND)));
      tell({ k: "row", r, bad: nb, lb: isBad ? r : lastBad, who, m: Math.round(m * 1000) / 1000 });
      if (m <= 0) tell({ k: "end", won: false, collapse: true, why: "The striking fell apart and the bells collapsed into a jangle" });
      else if (r === R - 1) tell({ k: "end", won: true, collapse: false, why: `${methodName} rung through with ${nb} bad row${nb === 1 ? "" : "s"}` });
    }

    function finish() {
      if (job.done || !ending) return;
      const yours = notes ? ` You struck ${clean} of your ${notes} notes clean, for ${score} (best streak ${best}).` : "";
      job.done = { won: ending.won, title: ending.won ? "Rung through!" : "A jangle", text: ending.why + "." + yours, x: board.x, z: board.z, wear: ending.won && !bad ? ["muffs"] : [] };
    }

    function drawHud() {
      const mineUp = aboard && (go ? mine.length > 0 : cast.includes(w.selfId)) && phase !== "down";
      highway.show(mineUp);
      if (!mineUp) return;
      const t = nowS();
      const lanes = LANE_CTL.map((id, k) => ({ ctl: id, colour: LANE_COLOUR[k], label: LANE_PAD[k] }));
      if (off === null || !go) {
        highway.draw({ title: "The ringing chamber", right: "", meter: striking, lanes, gems: [], bars: [], score, streak, mult: mult(), centre: "Finding the beat…" });
        return;
      }
      const cur = Math.max(0, Math.min(R - 1, rowAt(t)));
      const gems: Gem[] = [], bars: { due: number; strong: boolean }[] = [];
      // a note reaches the line when its rope wants pulling, LEAD before its bell sounds
      for (let r = Math.max(0, rowAt(t + LEAD - 400) - 1); r < R; r++) {
        const st = go.T + rowStart(r) - LEAD - t;
        if (st > AHEAD) break;
        bars.push({ due: st, strong: r % 2 === 0 });
        // the whole band's strikes come down, the others' faint, so you see yours come between them
        for (let b = 0; b < go.n; b++) {
          const key = b * 10000 + r, own = mine.includes(b);
          gems.push({
            lane: laneAt[b][r], pair: pairAt[b][r] >= 0 ? pairAt[b][r] : undefined, due: beat(b, r) - LEAD - t, label: String(b + 1),
            state: own ? (pulls.get(b)?.has(r) && !half.has(key) ? 1 : gone.has(key) ? 2 : 0) : 0, faint: !own,
          });
        }
      }
      const centre = phase !== "ring" ? (ending?.won ? "Well rung!" : "Stand!") : t < go.T - 800 ? "Look to…"
        : shout && performance.now() - shout.t < 2200 ? shout.text : undefined;
      highway.draw({
        title: methodName, right: t < go.T ? `${go.n} bells` : `Row ${cur + 1} / ${R}`, meter: striking, lanes, gems, bars,
        score, streak, mult: mult(), centre,
      });
    }

    /** How high bell b's sally is at shared time t: up out of reach after a handstroke, down to the hands after a backstroke. */
    function sallyAt(b: number, t: number): number {
      const low = 1.2, high = 2.6;
      if (!go || phase === "gather" || t < go.T - LEAD) return low;
      const pull = (r: number) => beat(b, r) - LEAD;
      let r = Math.max(0, Math.min(R - 1, rowAt(t + LEAD)));
      while (r > 0 && pull(r) > t) r--;
      if (pull(r) > t) return low;
      if (r >= R - 1 || ending) return r % 2 ? low : high;
      const u = Math.min(1, (t - pull(r)) / Math.max(1, (pull(r + 1) - pull(r)) * 0.6));
      const e = u * u * (3 - 2 * u);
      return r % 2 === 0 ? low - 0.25 + (high - low + 0.25) * e : high - (high - low) * e;
    }

    const paused = () => { const el = document.getElementById("pause"); return !!el && !el.hidden; };

    // what a probe compares across screens (?ringer only)
    if (AUTO) (window as unknown as Record<string, unknown>).__bells = () => ({
      phase, method: methodName, R, n: go?.n ?? 0, band: go?.band ?? [], mine, T: go?.T ?? 0, rows: rows.map((r) => r.join("")).join("/"),
      striking, judged, bad, ending, heard, sounded, aboard, score, clean, notes, okT, perfT,
      chart: laneAt.map((l, b) => l.join("") + ":" + pairAt[b].join(",")).join("/"),
      chords: mine.reduce((a, b) => a + pairAt[b].filter((p) => p >= 0).length, 0), myNotes: mine.length * R,
    });

    const job: Job = {
      offer, done: null,
      aloft: inside,
      update(dt) {
        if (upAtGo) { upAtGo = false; if (w.me().alive) climb(); }
        welcome.update(dt);
        const t = nowS();
        // keep the clock in step with the host's
        if (!w.isHost && (pingT -= dt) <= 0) {
          pingT = pings < 8 ? 0.25 : 2;
          pings++;
          send({ k: "tq", c: performance.now() });
        }
        if (w.isHost && off === null) off = 0;

        // everyone up the tower holds their sally in both hands, the gun put away
        const up = new Set(aboard || go ? list : []);
        for (const id of up) if (id !== w.selfId && !posed.has(id)) { w.pose?.(id, 0, "rope"); posed.add(id); }
        for (const id of [...posed]) if (!up.has(id) || phase === "down") { w.pose?.(id, 0, ""); posed.delete(id); }

        // the chamber is only drawn while someone could see it
        const cam = camera(), near = Math.hypot(cam.x - C.x, cam.z - C.z) < 500;
        if (near !== shown) { shown = near; if (near) w.scene.add(chamber.root); else w.scene.remove(chamber.root); }
        if (chamberN !== n()) { chamberN = n(); chamber.setBells(chamberN, go ? [...steady] : []); }
        if (shown) {
          chamber.ropes.forEach((m, b) => { m.position.y = sallyAt(b, t); });
          for (const f of chamber.figures) {
            const y = sallyAt(f.b, t);
            f.arm.scale.y = y > 2.2 ? 0.3 : Math.max(0.3, y - 1.35);
          }
        }

        if (go && off !== null && phase === "ring") {
          // the old hands ring on the beat on every screen alike
          const r0 = Math.max(0, rowAt(t) - 1), r1 = Math.min(R - 1, rowAt(t + 400) + 1);
          for (const b of steady) {
            for (let r = r0; r <= r1; r++) {
              const bt = beat(b, r), key = b * 10000 + r;
              if (bt > t - 40 && bt < t + 350 && !struck.has(key)) { struck.add(key); strike(b, bt); }
            }
          }
          // the conductor's calls
          if (t > go.T - 2800) call("look", "Look to!");
          if (t > go.T - 1700) call("going", "Treble's going.");
          if (t > go.T - 700) call("gone", "She's gone!");
          if (t > go.T + rowStart(changesFrom - 2)) call("go", `Go, ${methodName}!`, `Go ${methodName}`, "The changes start next handstroke");
          if (t > go.T + rowStart(changesTo - 1)) call("all", "That's all!", "That's all!", "Back into rounds");
          missed(t);
        }

        // the collapse: every bell clanging over every other
        if (ending?.collapse && performance.now() - ending.t < 3200 && go) {
          if ((jangleT -= dt) <= 0) {
            jangleT = 0.04 + Math.random() * 0.09;
            strike(Math.floor(Math.random() * go.n), nowS() + 20, 0.94 + Math.random() * 0.12, 0.8);
            if (Math.random() < 0.15 && aboard) yank();
          }
        }
        if (ending && phase === "stand" && performance.now() - ending.t > (ending.collapse ? 3600 : 2600)) {
          call("stand", "Stand!", "Stand!", ending.why);
          phase = "down";
          if (!aboard) finish();
        }

        if (AUTO && go && mine.length && phase === "ring" && off !== null) {
          for (let r = Math.max(0, rowAt(t) - 1); r < Math.min(R, rowAt(t) + 3); r++) {
            if (r <= judged) continue;
            for (const b of mine) {
              if (pulls.get(b)?.has(r) || gone.has(b * 10000 + r)) continue;
              const wobble = AUTO === "bad" ? (hash("wobble", r, b) % 3 === 0 ? (hash("w", r, b) % 2 ? 0.7 : -0.6) * B : 0) : 0;
              if (t >= beat(b, r) - LEAD + wobble) {
                for (const l of lanesOf(b, r)) { highway.press(l, true); highway.press(l, false); }
                ringNote(b, r, t + LEAD);
                grade(b, r, t + LEAD - beat(b, r));
              }
            }
          }
        }
        drawHud();
      },
      host() {
        if (phase === "gather") {
          // everyone who entered goes straight up at GO: ring as soon as each of them is up, which is
          // also when their screen is listening for the go, or after a few seconds whoever is up
          const here = new Set(w.players().map((p) => p.id));
          if (list.length && !gatherSince) gatherSince = performance.now();
          const inIt = cast.filter((id) => here.has(id));
          const waited = gatherSince && performance.now() - gatherSince > (inIt.length ? 4000 : 1500);
          if ((inIt.length && inIt.every((id) => list.includes(id))) || lookAsked || (list.length && waited)) startRinging();
          return;
        }
        if (!go || ending) return;
        // a ringer gone from the game: an old hand takes each of their ropes
        const here = new Set(w.players().map((p) => p.id));
        go.band.forEach((id, b) => { if (id && !here.has(id) && !steady.has(b)) tell({ k: "ai", b }); });
        const t = nowS();
        while (judged + 1 < R && t > go.T + rowStart(judged + 1) + (go.n - 1) * B + period * 0.6 + 250 && !ending) judge(judged + 1);
      },
      event(d, from) {
        if (!d || typeof d !== "object") return;
        switch (d.k) {
          case "tq":
            if (w.isHost && Number.isFinite(d.c)) send({ k: "ta", c: d.c, h: nowS() }, from);
            return;
          case "ta": {
            if (w.isHost || !Number.isFinite(d.c) || !Number.isFinite(d.h)) return;
            const t1 = performance.now(), rtt = t1 - d.c;
            if (rtt < 0 || rtt > 3000) return;
            samples.push({ rtt, est: d.h + rtt / 2 - t1 });
            if (samples.length > 12) samples.shift();
            off = samples.reduce((a, s) => (s.rtt < a.rtt ? s : a)).est;
            return;
          }
          case "in":
            if (!w.isHost) return;
            if (!list.includes(from)) tell({ k: "list", a: [...list, from] });
            // up after the go went round, so it never heard it
            if (go && from !== w.selfId) send({ k: "go", ...go }, from);
            return;
          case "list":
            if (Array.isArray(d.a)) list = d.a.filter((id: unknown) => typeof id === "string");
            return;
          case "look":
            if (w.isHost) lookAsked = true;
            return;
          case "go":
            if (go || !Number.isFinite(d.T) || !Array.isArray(d.band)) return;
            setGo({ T: d.T, n: Math.max(3, Math.min(MAX_BELLS, d.n | 0)), L: Math.max(0, Math.min(2, d.L | 0)), band: d.band.map(String) });
            chamberN = 0;
            if (aboard) { perchY = null; faced = false; }
            return;
          case "p": {
            if (!go || from === w.selfId || !Number.isFinite(d.b) || !Number.isFinite(d.r) || !Number.isFinite(d.t)) return;
            const b = d.b | 0, r = d.r | 0;
            if (b < 0 || b >= go.n || r < 0 || r >= R || steady.has(b)) return;
            const m = pulls.get(b) ?? new Map<number, number>();
            pulls.set(b, m);
            if (m.has(r)) return;
            m.set(r, d.t);
            heard++;
            if (!ending) strike(b, d.t);
            return;
          }
          case "ph":
            if (go && Number.isFinite(d.b) && Number.isFinite(d.r)) halves.add((d.b | 0) * 10000 + (d.r | 0));
            return;
          case "ai":
            if (go && Number.isFinite(d.b)) { steady.add(d.b | 0); chamberN = 0; }
            return;
          case "row": {
            if (!Number.isFinite(d.r)) return;
            judged = Math.max(judged, d.r | 0);
            bad = d.bad | 0; lastBad = Number.isFinite(d.lb) ? d.lb : lastBad;
            if (Number.isFinite(d.m)) striking = Math.max(0, Math.min(1, d.m));
            // the others' clashes in the feed, now and then; your own are on the highway already
            const who = (Array.isArray(d.who) ? d.who : []).filter(([b]: [number]) => go?.band[b] !== w.selfId);
            if (who.length && go && (aboard || inside()) && performance.now() - feedAt > 2500) {
              feedAt = performance.now();
              const names = who.slice(0, 2).map(([b, e]: [number, number | null]) => {
                const id = go!.band[b], nm = id ? esc(w.nameOf(id)) : "An old hand";
                return `${nm} on ${bellName(b, go!.n)}${e === null ? " missed the stroke" : e === 0 ? " struck half a chord" : e > 0 ? " came in late" : " came in early"}`;
              });
              w.feed(`${named("Clash!", COLOUR)} ${names.join("; ")}`);
            }
            return;
          }
          case "end":
            if (ending) return;
            ending = { won: !!d.won, why: String(d.why ?? ""), collapse: !!d.collapse, t: performance.now() };
            phase = "stand";
            if (ending.collapse) stage = { key: "jangle", title: "It's all gone wrong!", sub: "The bells are clanging over each other", went: "badly" };
            else stage = { key: "well", title: "Well rung!", sub: ending.why, colour: COLOUR };
            return;
        }
      },
      progress: () => ({ a: list, g: go, j: judged, bad, lb: lastBad, m: striking, ai: [...steady], e: ending ? { won: ending.won, why: ending.why, collapse: ending.collapse } : null }),
      restore(p) {
        if (!p || typeof p !== "object") return;
        if (Array.isArray(p.a)) list = p.a.filter((id: unknown) => typeof id === "string");
        if (p.g && !go) job.event!({ k: "go", ...p.g }, "");
        if (Number.isFinite(p.j)) judged = p.j;
        if (Number.isFinite(p.bad)) bad = p.bad;
        if (Number.isFinite(p.lb)) lastBad = p.lb;
        if (Number.isFinite(p.m)) striking = p.m;
        if (Array.isArray(p.ai)) for (const b of p.ai) if (Number.isFinite(b)) steady.add(b);
        if (p.e && !ending) job.event!({ k: "end", ...p.e }, "");
      },
      use() {
        const me = w.me();
        if (!aboard) {
          if (phase !== "gather" && phase !== "ring") return false;
          if (Math.hypot(me.x - board.x, me.z - board.z) > CLIMB && Math.hypot(me.x - C.x, me.z - C.z) > CLIMB) return false;
          climb();
          return true;
        }
        if (phase === "gather") { if (w.isHost) lookAsked = true; else send({ k: "look" }); return true; }
        return false;
      },
      hint() {
        const me = w.me();
        if (!aboard) {
          if (phase !== "gather" && phase !== "ring") return "";
          return Math.hypot(me.x - board.x, me.z - board.z) < CLIMB || Math.hypot(me.x - C.x, me.z - C.z) < CLIMB
            ? `<b>{use}</b> Climb the tower${go ? " and watch" : ""}` : "";
        }
        if (phase === "gather" && !cast.includes(w.selfId)) return `<b>{use}</b> Look to! Start the ringing`;
        return "";
      },
      perch() {
        if (!aboard) return null;
        const [sx, sz] = standSpot();
        const x = C.x + sx, z = C.z + sz;
        // straight up into the chamber and straight down again at the end; a late rope hauls you off your feet
        if (phase === "down") {
          aboard = false; perchY = null;
          w.moveTo(x, z, Math.atan2(sx, sz));
          finish();
          return null;
        }
        perchY = top + yankLift();
        const face = faced ? undefined : Math.atan2(sx, sz);
        faced = true;
        return { x, y: perchY, z, face, bare: true };
      },
      card() {
        const ps = w.players();
        if (phase === "gather" && !aboard) {
          const me = w.me(), d = Math.hypot(me.x - board.x, me.z - board.z);
          return { line: d > 30 ? `Go to ${church}` : "Climb the tower ({use} by the vicar)", progress: `${list.length} / ${ps.length} up`, stage };
        }
        if (phase === "gather") return { line: "In the ringing chamber", sub: cast.includes(w.selfId) ? "Finding the beat" : "{bells.look} to look to", progress: `${list.length} / ${ps.length} up`, stage };
        if (!go) return { line: "Ringing", stage };
        const cur = ending ? judged + 1 : Math.max(0, Math.min(R, rowAt(nowS()) + 1));
        const yours = mine.map((b) => bellName(b, go!.n));
        return {
          line: yours.length ? `Ring ${yours.length > 2 ? `${yours.slice(0, -1).join(", ")} and ${yours[yours.length - 1]}` : yours.join(" and ")}` : "The band is ringing",
          sub: `${methodName} · striking ${Math.round(striking * 100)}%`,
          progress: `${cur} / ${R}`, bar: cur / R, stage,
        };
      },
      scarAt: () => ({ x: board.x, z: board.z }),
      end() {
        removeEventListener("keydown", onKey, true);
        removeEventListener("keyup", onKey, true);
        padTake(null);
        for (const id of posed) w.pose?.(id, 0, "");
        if (aboard) { const [sx, sz] = standSpot(); w.moveTo(board.x + sx * 0.2, board.z + sz * 0.2, 0); }
        aboard = false;
        if (shown) w.scene.remove(chamber.root);
        chamber.dispose();
        welcome.dispose();
        highway.dispose();
        w.mark("@challenge", null);
      },
    };
    return job;
  },
});
