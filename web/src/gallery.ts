// The Art Gallery, a team challenge (challenges.ts): paint a picture each, see it hung in gilt
// frames, then stand about while the critics and the public tell you what they think of it. The
// challenge stands outside a gallery or museum found from the map: a set piece called one (the
// Holburne) if it's in the zone, otherwise the biggest public building near a pedestrian street,
// named for the square or street it's on. On the pavement an easel says the Open Exhibition is
// tonight, and the curator stands by it beckoning. E by him starts it, and at GO everyone who
// entered (lineup.ts) is taken up into the gallery itself (anyone else goes in with E by him when
// they get there): a long white room
// built high over the street (like the bell ringers' chamber), with an easel each. Its light is its
// own (world.ts's indoors), so nobody in it goes dark at night against its white walls.
//
// Once everyone who entered is in (or someone presses E to get on with it) the subject is set ("A seagull's
// revenge", "Last orders at" the nearest pub...) and so is who's judging tonight, two critics with
// tastes of their own (three for a big show), which is worth reading before you start. Each painter
// gets the easel (easel.ts), a paint program of the old sort, for a minute and a half or so. Then
// the paintings are hung, each with its card, and the judging begins: everyone in the gallery is
// stood together in front of each painting in turn (free to look about, not to walk off), and the
// critics step up to it one at a time, each remark typed out on a card in the middle of the screen
// with their mark stamped on it (missionscreens.ts's missionPaper), then a board of all their marks.
// Then the doors open to the public (a nan, a builder, an art student, a child, a Flag Lad, someone
// from the Council, a Roman, a seagull...), who walk round, stop at paintings and say what they make
// of them in speech bubbles, with a mark out of ten (critics.ts), each remark coming up as a note
// (notice.ts). While they're at it you can walk round too, and E by a painting votes for it (not
// your own): the room's favourite gets half a mark. Average enough across the show and it's
// a success, and one of the strange objects turns up at the gallery door; the more of you there
// are, the more paintings there are and the higher the bar. The critics confer for a moment, then
// the verdict comes up as the shared result card (missionscreens.ts), the paintings on it with their
// marks and a stamp; once it's put away (or gone by itself) you can stay and look
// round, the marks and prizes on the cards, until you leave (the exit, or E by Mr Pettigrew inside
// it) or the gallery closes, and you're put back on the pavement looking at the door. Each screen
// ends the evening for its own player as they leave; the object comes with the first to go.
//
// Who decides what: the host runs the evening. Who's in, when the painting starts and stops and
// the subject come from the host ("qe" k "go"); each painter paints on their own screen and sends
// their painting round when it's hung (k "ch", in pieces of a few kilobytes: easel.ts packs it),
// with its time-lapse just before it (a "ch" of its own, which an older page passes over), and each
// screen plays every painting's time-lapse on its canvas as the doors open.
// The host looks at the paintings, stages the show and sends it round (who comes, what they say and
// when, as text, with when the judging ends and the critics' marks for its board), counts the
// room's votes and sends the verdict; every screen walks the crowd round, puts up each critic's
// card and moves its own player along from the same script, so all of them show the same card at
// the same moment with nothing more sent. An older page passes over the judging's part of the
// script and just sees the critics walk round first. The gallery itself is built from a fixed design on every screen.
//
// For testing, ?paint=20 makes the painting last 20 seconds; window.__gallery (with ?objects) lets
// a probe paint and peek.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as SFX from "./audio";
import { Avatar } from "./avatar";
import { registerChallenge, type ChallengeSpot } from "./challenges";
import { ctlText } from "./controls";
import { BOARD, CRITICS, STEP, THEMES, TRIUMPH, cardSecs, criticTitle, criticsFor, earlyFrom, speakFor, stageShow, verdict, visitor, type Painting, type Remark, type Verdict } from "./critics";
import { eyeState, judge as eyeJudge, wake as wakeEye, type Eye } from "./eye";
import { Easel, H, W, decode, decodeReplay, encode, howText, readHow, toImage, type How } from "./easel";
import { gullFigure } from "./gulls";
import type { GameMap } from "./map";
import { missionPaper, missionResult, stampHtml, type ResultHandle } from "./missionscreens";
import { news } from "./notice";
import { SET_PIECES } from "./landmarks/setpieces";
import { speak } from "./posh";
import { esc, hash, rng, type Card, type Job, type QuestWorld, type Waiting } from "./quests";

const COLOUR = "#c2185b";
const Q = new URLSearchParams(location.search);
const PAINT_MS = (Number(Q.get("paint")) || 100) * 1000;
const TESTING = Q.has("objects");
const MAX_PAINTERS = 8;
const HX = 11, HZ = 6.5, RH = 5.2;   // the room's half length and half width, and its height
const GO_IN = 6;                     // how close to the curator to go in
const CHUNK = 9000;
const BEAT_MS = 3200;                // the critics confer before the verdict's read out
const CLOSE_MS = 90000;
const EYE_WAIT_MS = 20000;           // how long the show waits for the critics' eye before going on without it              // and the gallery closes this long after it
const LINGER_MS = 30000;             // but never sooner than this after you've put the verdict away
const CURATOR_REACH = 2.4;
const REPLAY_MS = 8000;              // each painting's time-lapse as the doors open
const PATHS = new Set(["footway", "steps", "cycleway", "path", "bridleway", "track", "service"]);

// ---- the time-lapse ------------------------------------------------------------------------------

/** When each pixel turns over as one snapshot dissolves into the next: in small patches, a little
 *  ragged, so it reads as paint going on rather than static. */
let ORDER: Uint8Array | null = null;
const MIX = new Uint8Array(W * H), BLANK = new Uint8Array(W * H);
function order() {
  if (ORDER) return ORDER;
  ORDER = new Uint8Array(W * H);
  const h = (n: number) => { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ORDER[y * W + x] = Math.min(255, Math.floor(256 * (0.8 * h((x >> 3) * 977 + (y >> 3) * 131) + 0.2 * h(y * W + x + 7))));
  return ORDER;
}
/** The painting u of the way through its time-lapse (0 a blank canvas, 1 the finished painting). */
function between(frames: Uint8Array[], fin: Uint8Array, u: number): Uint8Array {
  const seq = [BLANK, ...frames.slice(0, -1), fin], at = Math.max(0, Math.min(1, u)) * (seq.length - 1);
  const k = Math.min(seq.length - 2, Math.floor(at)), a = seq[k], b = seq[k + 1], cut = (at - k) * 256, o = order();
  for (let i = 0; i < MIX.length; i++) MIX[i] = o[i] < cut ? b[i] : a[i];
  return MIX;
}

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

interface Placed { street: string }
const placedInfo = new WeakMap<ChallengeSpot[], Placed>();

/** The gallery: a set piece that's a museum or gallery, if this zone has one; otherwise the biggest
 *  public building near a pedestrian street. Its spots: the curator on the pavement outside, and
 *  the gallery room over the street. Only the first area and the wide map, so everyone agrees. */
function place(map: GameMap): ChallengeSpot[] | null {
  const D = map.d, Wd = map.wide;
  const roads = [...D.rd, ...(Wd?.rd ?? [])].filter((r) => !PATHS.has(r.c));
  const nearestRoad = (x: number, y: number, max: number, avoid?: number[][]) => {
    let best: { x: number; y: number; d: number; w: number; n: string; c: string } | null = null;
    for (const rd of roads) {
      for (let i = 1; i < rd.p.length; i++) {
        const a = rd.p[i - 1], b = rd.p[i];
        if (Math.abs(a[0] - x) > max + 100 || Math.abs(a[1] - y) > max + 100) continue;
        const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
        const t = l ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l)) : 0;
        const px = a[0] + dx * t, py = a[1] + dy * t, d = Math.hypot(px - x, py - y);
        if (d < max && (!avoid || !inRing(avoid, px, py)) && (!best || d < best.d)) best = { x: px, y: py, d, w: rd.w ?? 6, n: rd.n, c: rd.c };
      }
    }
    return best;
  };
  const named = [...(D.pl ?? []), ...(Wd?.d.pl ?? [])].filter((p) => p.n && p.r.length >= 3);
  const placeNear = (x: number, y: number) => {
    let best = "", bd = 150;
    for (const p of named) {
      if (!/square|gardens?|parade|green|circus|crescent|place|park|walk|yard|court/i.test(p.n)) continue;
      const mx = p.r.reduce((s, q) => s + q[0], 0) / p.r.length, my = p.r.reduce((s, q) => s + q[1], 0) / p.r.length;
      const d = inRing(p.r, x, y) ? 0 : Math.hypot(mx - x, my - y);
      if (d < bd || (d === bd && p.n < best)) { bd = d; best = p.n; }
    }
    return best;
  };
  const spotsFor = (ex: number, ey: number, name: string, street: string, rx: number, ry: number) => {
    const s: ChallengeSpot[] = [{ x: ex, z: -ey, name }, { x: rx, z: -ry, name: `the gallery at ${name}` }];
    placedInfo.set(s, { street });
    return s;
  };

  // a set piece that's a museum or a gallery
  if (D.centre) {
    const [lon0, lat0] = D.centre;
    const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;
    for (const sp of [...SET_PIECES].filter((s) => /museum|gallery/i.test(s.name)).sort((a, b) => a.name.localeCompare(b.name))) {
      const ox = (sp.at[0] - lon0) * kx, oy = (sp.at[1] - lat0) * ky;
      const a = ((90 - sp.bearing) * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
      const front = Math.max(...sp.outline.map((q) => q[1]));
      const ex = ox + uy * (front + 4), ey = oy - ux * (front + 4);
      if (map.fieldEdge(ex, -ey) < 60) continue;
      const rd = nearestRoad(ex, ey, 80);
      return spotsFor(ex, ey, `the ${sp.name}`, rd?.n || "", rd ? rd.x : ex, rd ? rd.y : ey);
    }
  }

  // otherwise the biggest public building near a pedestrian street, or failing that any street
  const peds = roads.filter((r) => r.c === "pedestrian");
  const nearPed = (x: number, y: number) => peds.some((r) => r.p.some((q) => Math.hypot(q[0] - x, q[1] - y) < 80));
  const cands = (Wd?.bl ?? []).filter((b) => b.c === "institution" && b.r[0]?.length >= 3).map((b) => {
    const r = b.r[0], cx = r.reduce((s, q) => s + q[0], 0) / r.length, cy = r.reduce((s, q) => s + q[1], 0) / r.length;
    return { r, cx, cy, a: ringArea(r) };
  }).filter((c) => c.a >= 300 && c.a <= 6000 && map.fieldEdge(c.cx, -c.cy) > 60)
    .map((c) => ({ ...c, s: c.a * (nearPed(c.cx, c.cy) ? 3 : 1) * (placeNear(c.cx, c.cy) ? 1.5 : 1) }))
    .sort((a, b) => b.s - a.s || a.cx - b.cx || a.cy - b.cy);
  for (const c of cands.slice(0, 40)) {
    const rd = nearestRoad(c.cx, c.cy, 90, c.r);
    if (!rd || map.fieldEdge(rd.x, -rd.y) < 60) continue;
    const ux = (c.cx - rd.x) / Math.max(0.1, rd.d), uy = (c.cy - rd.y) / Math.max(0.1, rd.d);
    let ex = rd.x + ux * (rd.w / 2 + 2), ey = rd.y + uy * (rd.w / 2 + 2);
    if (inRing(c.r, ex, ey)) { ex = rd.x; ey = rd.y; }
    const sq = placeNear(c.cx, c.cy);
    const name = sq ? `the ${sq.replace(/^the /i, "")} Gallery` : rd.n ? `the ${rd.n} Gallery` : "the Town Gallery";
    return spotsFor(ex, ey, name, rd.n, rd.x, rd.y);
  }
  return null;
}

// ---- drawing helpers ----------------------------------------------------------------------------

function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, mirror = false) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (mirror) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; }
  return t;
}
function speckle(x: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number, seed = 1) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    x.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},${alpha * r()})`;
    x.fillRect(r() * w, r() * h, 2, 2);
  }
}
function wrapText(x: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const t = line ? `${line} ${word}` : word;
    if (x.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
/** A box painted one colour, ready to weld. */
function painted(g: THREE.BufferGeometry, col: string): THREE.BufferGeometry {
  const c = new THREE.Color(col), n = g.getAttribute("position").count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  g.deleteAttribute("uv");
  return g.index ? g.toNonIndexed() : g;
}
const boxAt = (w: number, h: number, d: number, x: number, y: number, z: number, col: string, ry = 0, rx = 0) =>
  painted(new THREE.BoxGeometry(w, h, d).rotateX(rx).rotateY(ry).translate(x, y, z), col);

/** An artist's easel, three legs and a canvas on its ledge, the canvas facing +z. */
function easelParts(x: number, z: number, ry: number, canvas = "#fbfaf4"): THREE.BufferGeometry[] {
  const wood = "#8a5a2c", m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z);
  const parts = [
    boxAt(0.05, 1.9, 0.05, -0.32, 0.92, 0.05, wood, 0, -0.12).rotateZ(-0.12),
    boxAt(0.05, 1.9, 0.05, 0.32, 0.92, 0.05, wood, 0, -0.12).rotateZ(0.12),
    boxAt(0.05, 1.8, 0.05, 0, 0.86, -0.42, wood, 0, 0.32),
    boxAt(0.86, 0.05, 0.1, 0, 0.88, 0.16, wood),
    boxAt(0.8, 0.62, 0.03, 0, 1.22, 0.12, canvas, 0, -0.1),
    boxAt(0.06, 0.4, 0.04, 0, 1.68, 0.06, wood, 0, -0.1),
  ];
  for (const p of parts) p.applyMatrix4(m);
  return parts;
}

// ---- outside the gallery ------------------------------------------------------------------------

/** The easel on the pavement saying the Open Exhibition's tonight, and the curator beside it. */
class Welcome implements Waiting {
  private group = new THREE.Group();
  private curator = new Avatar("Mr Pettigrew, Curator", "#1f2a44", "curator", "#bdbdbd");
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private tex: THREE.Texture;
  private t = 0;
  private cx: number; private cz: number;

  constructor(private scene: THREE.Scene, map: GameMap, private at: ChallengeSpot, street: ChallengeSpot, gallery: string) {
    let ux = street.x - at.x, uz = street.z - at.z;
    const l = Math.hypot(ux, uz);
    if (l < 0.5) { ux = 0; uz = 1; } else { ux /= l; uz /= l; }
    this.tex = canvasTex(256, 200, (x) => {
      x.fillStyle = "#1f2a44"; x.fillRect(0, 0, 256, 200);
      x.strokeStyle = "#d9b25a"; x.lineWidth = 4; x.strokeRect(6, 6, 244, 188);
      x.textAlign = "center"; x.fillStyle = "#f4ecd4";
      x.font = "italic 15px Georgia, serif"; x.fillText(gallery.replace(/^the /i, "The ").slice(0, 30), 128, 30);
      x.font = "800 30px Georgia, serif"; x.fillStyle = "#ffd36a"; x.fillText("THE OPEN", 128, 68); x.fillText("EXHIBITION", 128, 100);
      x.font = "600 17px Georgia, serif"; x.fillStyle = "#f4ecd4"; x.fillText("Paint tonight · Hung tonight", 128, 126);
      x.fillText("Judged tonight", 128, 147);
      x.font = "italic 13px Georgia, serif"; x.fillStyle = "#c9c2ae"; x.fillText("All welcome. No talent required.", 128, 178);
      // a palette, in the corner
      x.fillStyle = "#c8a070"; x.beginPath(); x.ellipse(36, 150, 22, 15, -0.3, 0, 7); x.fill();
      ["#e8231f", "#ffe11a", "#2f5fe0", "#5fd14a"].forEach((c, k) => { x.fillStyle = c; x.beginPath(); x.arc(24 + k * 8, 146 + (k % 2) * 6, 3.5, 0, 7); x.fill(); });
    });
    const geo = mergeGeometries(easelParts(0, 0, 0, "#1f2a44"))!;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const face = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    const sheet = new THREE.PlaneGeometry(0.78, 0.6);
    this.geos.push(geo, sheet); this.mats.push(mat, face);
    const e = new THREE.Mesh(geo, mat);
    e.castShadow = true;
    const s = new THREE.Mesh(sheet, face);
    s.position.set(0, 1.22, 0.14); s.rotation.x = -0.1;
    this.group.add(e, s);
    this.group.position.set(at.x, map.ground(at.x, at.z), at.z);
    this.group.rotation.y = Math.atan2(ux, uz);
    scene.add(this.group);
    this.cx = at.x - uz * 1.1 - ux * 0.3; this.cz = at.z + ux * 1.1 - uz * 0.3;
    const c = this.curator;
    c.armed = false;
    c.setWear("specs");
    c.holdAt(this.cx, map.ground(this.cx, this.cz), this.cz, Math.atan2(-ux, -uz), 0, 0);
    scene.add(c.root);
  }

  dist(x: number, z: number) {
    return Math.max(0, Math.min(Math.hypot(x - this.at.x, z - this.at.z), Math.hypot(x - this.cx, z - this.cz)) - 0.5);
  }
  update(dt: number) {
    this.t += dt;
    this.curator.wave = this.t % 6 < 2 ? 2 : 0;
    this.curator.update(performance.now(), dt);
  }
  dispose() {
    this.scene.remove(this.group, this.curator.root);
    this.curator.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.tex.dispose();
  }
}

// ---- the gallery room ---------------------------------------------------------------------------

interface Slot { x: number; z: number; nz: number }
/** Where each painting hangs, in the room's own frame: along the north wall, then the south. */
function slots(n: number): Slot[] {
  const north = n <= 4 ? n : Math.ceil(n / 2), south = n - north, out: Slot[] = [];
  for (let k = 0; k < north; k++) out.push({ x: (k - (north - 1) / 2) * 5, z: -HZ + 0.06, nz: 1 });
  for (let k = 0; k < south; k++) out.push({ x: (k - (south - 1) / 2) * 5, z: HZ - 0.06, nz: -1 });
  return out;
}
/** Where painter k of n stands at their easel, in the room's frame. */
const easelAt = (k: number, n: number): [number, number] => [(k - (n - 1) / 2) * 2.3, 0.6];
const PW = 2.4, PH = 1.8, PY = 2.05;     // a painting's size on the wall and its middle's height

function wallTexture() {
  return canvasTex(1024, 256, (x) => {
    x.fillStyle = "#efe9de"; x.fillRect(0, 0, 1024, 256);
    speckle(x, 1024, 256, 2500, 0.05, 7);
    x.fillStyle = "#d9d0bf"; x.fillRect(0, 0, 1024, 14);
    x.fillStyle = "#c9bfa9"; x.fillRect(0, 14, 1024, 3);
    x.fillStyle = "#cfc6b4"; x.fillRect(0, 76, 1024, 4);
    x.fillStyle = "#3a2c22"; x.fillRect(0, 243, 1024, 13);
    x.fillStyle = "#5a4636"; x.fillRect(0, 241, 1024, 2);
  });
}
function endTexture(gallery: string, theme: string) {
  return canvasTex(640, 256, (x) => {
    x.fillStyle = "#efe9de"; x.fillRect(0, 0, 640, 256);
    speckle(x, 640, 256, 1500, 0.05, 9);
    x.fillStyle = "#3a2c22"; x.fillRect(0, 243, 640, 13);
    x.fillStyle = "#d9d0bf"; x.fillRect(0, 0, 640, 14);
    x.textAlign = "center"; x.fillStyle = "#1b1b1d";
    x.font = "600 22px Georgia, serif"; x.fillText(gallery.replace(/^the /i, "").toUpperCase().slice(0, 40), 320, 70);
    x.font = "800 40px Georgia, serif"; x.fillStyle = "#8a1c3a"; x.fillText("THE OPEN EXHIBITION", 320, 118);
    x.font = "italic 20px Georgia, serif"; x.fillStyle = "#333"; x.fillText("Tonight's subject", 320, 156);
    x.font = "700 26px Georgia, serif"; x.fillStyle = "#1b1b1d";
    const lines = wrapText(x, `“${theme}”`, 560);
    lines.slice(0, 2).forEach((l, k) => x.fillText(l, 320, 190 + k * 30));
  }, true);
}
function doorTexture() {
  return canvasTex(640, 256, (x) => {
    x.fillStyle = "#efe9de"; x.fillRect(0, 0, 640, 256);
    speckle(x, 640, 256, 1500, 0.05, 11);
    x.fillStyle = "#3a2c22"; x.fillRect(0, 243, 640, 13);
    x.fillStyle = "#d9d0bf"; x.fillRect(0, 0, 640, 14);
    // double doors
    x.fillStyle = "#5a3a22"; x.fillRect(270, 110, 100, 135);
    x.strokeStyle = "#2a1a10"; x.lineWidth = 3; x.strokeRect(270, 110, 100, 135); x.beginPath(); x.moveTo(320, 110); x.lineTo(320, 245); x.stroke();
    x.fillStyle = "#d6b25a"; x.fillRect(312, 175, 4, 14); x.fillRect(324, 175, 4, 14);
    x.fillStyle = "#1f8a3a"; x.fillRect(290, 88, 60, 16); x.fillStyle = "#fff"; x.font = "700 12px sans-serif"; x.textAlign = "center"; x.fillText("EXIT", 320, 100);
    x.fillStyle = "#1b1b1d"; x.font = "italic 15px Georgia, serif";
    x.fillText("Please do not touch the art", 150, 150);
    x.fillText("Nor lick it", 150, 170);
    x.fillText("Gift shop & café →", 490, 160);
  }, true);
}
function floorTexture() {
  const t = canvasTex(256, 256, (x) => {
    for (let r = 0; r < 8; r++) for (let k = 0; k < 4; k++) {
      x.fillStyle = ["#8a6238", "#7d5732", "#94693d", "#835c35"][(r + k * 3) % 4];
      x.fillRect(k * 64 + (r % 2) * 32 - 32, r * 32, 64, 32);
      x.fillRect(k * 64 + (r % 2) * 32 + 32, r * 32, 64, 32);
    }
    x.strokeStyle = "rgba(30,15,5,.45)";
    for (let r = 0; r <= 8; r++) { x.beginPath(); x.moveTo(0, r * 32); x.lineTo(256, r * 32); x.stroke(); }
    for (let r = 0; r < 8; r++) for (let k = -1; k < 5; k++) { const xx = k * 64 + (r % 2) * 32; x.beginPath(); x.moveTo(xx, r * 32); x.lineTo(xx, r * 32 + 32); x.stroke(); }
    speckle(x, 256, 256, 600, 0.08, 3);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(HX / 2, HZ / 2);
  return t;
}
function ceilingTexture() {
  return canvasTex(512, 256, (x) => {
    x.fillStyle = "#f4f1ea"; x.fillRect(0, 0, 512, 256);
    for (let k = 0; k < 3; k++) {
      const g = x.createLinearGradient(0, 70, 0, 186);
      g.addColorStop(0, "#e9f3ff"); g.addColorStop(1, "#bcd4ec");
      x.fillStyle = g; x.fillRect(40 + k * 160, 70, 112, 116);
      x.strokeStyle = "#9aa6b0"; x.lineWidth = 3; x.strokeRect(40 + k * 160, 70, 112, 116);
      x.beginPath(); x.moveTo(96 + k * 160, 70); x.lineTo(96 + k * 160, 186); x.moveTo(40 + k * 160, 128); x.lineTo(152 + k * 160, 128); x.stroke();
    }
  });
}
function stoneTexture() {
  return canvasTex(512, 128, (x) => {
    x.fillStyle = "#cdb88c"; x.fillRect(0, 0, 512, 128);
    x.strokeStyle = "rgba(90,70,40,.35)";
    for (let r = 0; r < 8; r++) {
      x.beginPath(); x.moveTo(0, r * 16); x.lineTo(512, r * 16); x.stroke();
      for (let k = 0; k < 9; k++) { const xx = k * 60 + (r % 2) * 30; x.beginPath(); x.moveTo(xx, r * 16); x.lineTo(xx, r * 16 + 16); x.stroke(); }
    }
    for (let k = 0; k < 6; k++) { x.fillStyle = "#3a3a44"; x.fillRect(30 + k * 84, 40, 30, 56); x.fillStyle = "#e8e0c8"; x.fillRect(26 + k * 84, 96, 38, 4); }
    speckle(x, 512, 128, 900, 0.1, 5);
  });
}

/** The room, its frames and paintings, and the easels, all in the room's own frame at (cx, top, cz). */
class Room {
  readonly root = new THREE.Group();
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private easels: THREE.Mesh | null = null;
  private frames: THREE.Mesh | null = null;
  private art: THREE.Mesh | null = null;
  private atlas = document.createElement("canvas");
  private atlasTex: THREE.CanvasTexture;
  private endMat: THREE.MeshBasicMaterial;
  private n = 0;

  constructor(cx: number, top: number, cz: number, private gallery: string) {
    this.root.position.set(cx, top, cz);
    const wall = new THREE.MeshBasicMaterial({ map: wallTexture(), side: THREE.BackSide });
    this.endMat = new THREE.MeshBasicMaterial({ map: endTexture(gallery, "To be announced"), side: THREE.BackSide });
    const door = new THREE.MeshBasicMaterial({ map: doorTexture(), side: THREE.BackSide });
    const ceil = new THREE.MeshBasicMaterial({ map: ceilingTexture(), side: THREE.BackSide });
    const floor = new THREE.MeshBasicMaterial({ map: floorTexture(), side: THREE.BackSide });
    const room = new THREE.Mesh(new THREE.BoxGeometry(HX * 2, RH, HZ * 2), [door, this.endMat, ceil, floor, wall, wall]);
    room.position.y = RH / 2;
    const stone = new THREE.MeshBasicMaterial({ map: stoneTexture() });
    const shell = new THREE.Mesh(new THREE.BoxGeometry(HX * 2 + 0.6, RH + 1, HZ * 2 + 0.6), stone);
    shell.position.y = RH / 2;
    this.mats.push(wall, this.endMat, door, ceil, floor, stone);
    this.geos.push(room.geometry, shell.geometry);
    this.root.add(room, shell);
    this.atlas.width = 1024; this.atlas.height = 512;
    this.atlasTex = new THREE.CanvasTexture(this.atlas);
    this.atlasTex.colorSpace = THREE.SRGBColorSpace;
    this.atlasTex.magFilter = THREE.NearestFilter;
    this.atlasTex.minFilter = THREE.LinearFilter;
    this.atlasTex.generateMipmaps = false;
  }

  /** The subject goes up on the end wall. */
  setTheme(theme: string) {
    this.endMat.map?.dispose();
    this.endMat.map = endTexture(this.gallery, theme);
    this.endMat.needsUpdate = true;
  }

  /** An easel for each painter, or none. */
  setEasels(n: number) {
    if (this.easels) { this.root.remove(this.easels); this.easels.geometry.dispose(); this.easels = null; }
    if (!n) return;
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < n; k++) { const [x, z] = easelAt(k, n); parts.push(...easelParts(x, z, Math.PI)); }
    this.easels = new THREE.Mesh(mergeGeometries(parts)!, this.vmat());
    this.root.add(this.easels);
  }

  private vm: THREE.MeshBasicMaterial | null = null;
  private vmat() {
    if (!this.vm) { this.vm = new THREE.MeshBasicMaterial({ vertexColors: true }); this.mats.push(this.vm); }
    return this.vm;
  }

  /** Hang n paintings: gilt frames, with a picture light over each, and the pictures and their
   *  cards drawn from one sheet, so the whole show is three draws. */
  hang(n: number) {
    this.n = n;
    for (const m of [this.frames, this.art]) if (m) { this.root.remove(m); m.geometry.dispose(); }
    const S = slots(n), parts: THREE.BufferGeometry[] = [], quads: THREE.BufferGeometry[] = [];
    const fw = PW + 0.24, fh = PH + 0.24, b = 0.12;
    S.forEach((s, p) => {
      const ry = s.nz > 0 ? 0 : Math.PI, m = new THREE.Matrix4().makeRotationY(ry).setPosition(s.x, PY, s.z);
      const local = [
        boxAt(fw, b, 0.09, 0, fh / 2 - b / 2, 0.045, "#e7c55c"),
        boxAt(fw, b, 0.09, 0, -fh / 2 + b / 2, 0.045, "#9a7420"),
        boxAt(b, fh, 0.09, -fw / 2 + b / 2, 0, 0.045, "#c9a23a"),
        boxAt(b, fh, 0.09, fw / 2 - b / 2, 0, 0.045, "#b8912e"),
        boxAt(PW + 0.04, PH + 0.04, 0.02, 0, 0, 0.01, "#efe6cc"),
        boxAt(0.5, 0.05, 0.07, 0, fh / 2 + 0.18, 0.2, "#b08a3a"),
        boxAt(0.03, 0.03, 0.2, 0, fh / 2 + 0.1, 0.1, "#8a6a2a"),
      ];
      for (const g of local) { g.applyMatrix4(m); parts.push(g); }
      // the painting, then its card beside it, from the sheet
      const col = p % 4, row = Math.floor(p / 4);
      const u0 = (col * 256 + 8) / 1024, v0 = 1 - (row * 256 + 4 + 180) / 512, u1 = (col * 256 + 248) / 1024, v1 = 1 - (row * 256 + 4) / 512;
      const pic = new THREE.PlaneGeometry(PW, PH);
      setUV(pic, u0, v0, u1, v1);
      pic.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, 0.035)).applyMatrix4(m);
      const cu1 = (col * 256 + 248) / 1024, cv0 = 1 - (row * 256 + 190 + 60) / 512, cv1 = 1 - (row * 256 + 190) / 512;
      const card = new THREE.PlaneGeometry(0.62, 0.155);
      setUV(card, u0, cv0, cu1, cv1);
      card.applyMatrix4(new THREE.Matrix4().makeTranslation(fw / 2 + 0.45, -0.25, 0.01)).applyMatrix4(m);
      quads.push(pic, card);
    });
    if (!n) return;
    this.frames = new THREE.Mesh(mergeGeometries(parts)!, this.vmat());
    const artMat = new THREE.MeshBasicMaterial({ map: this.atlasTex, toneMapped: false });
    this.mats.push(artMat);
    this.art = new THREE.Mesh(mergeGeometries(quads)!, artMat);
    this.root.add(this.frames, this.art);
  }

  /** Paint picture p (or a "being hung" sheet if it hasn't come yet) and its card onto the sheet. */
  draw(p: number, px: Uint8Array | null, card: { name: string; title: string; mark?: number; prizes?: string[]; sold?: boolean }) {
    const x = this.atlas.getContext("2d")!, col = p % 4, row = Math.floor(p / 4);
    const ox = col * 256 + 8, oy = row * 256 + 4;
    if (px) {
      const img = x.createImageData(W, H);
      toImage(px, img);
      x.putImageData(img, ox, oy);
    } else {
      x.fillStyle = "#e9e4d8"; x.fillRect(ox, oy, W, H);
      x.fillStyle = "#8a8070"; x.font = "italic 18px Georgia, serif"; x.textAlign = "center";
      x.fillText("Being hung…", ox + W / 2, oy + H / 2);
    }
    const cy = row * 256 + 190;
    x.fillStyle = "#fbfaf4"; x.fillRect(ox, cy, W, 60);
    x.strokeStyle = "#b9b2a0"; x.lineWidth = 1; x.strokeRect(ox + 0.5, cy + 0.5, W - 1, 59);
    x.textAlign = "left"; x.fillStyle = "#111";
    x.font = "700 15px Georgia, serif"; x.fillText(card.name.slice(0, 24), ox + 6, cy + 17);
    x.font = "italic 12px Georgia, serif"; x.fillStyle = "#333";
    x.fillText(`“${card.title}”`.slice(0, 36), ox + 6, cy + 33);
    x.font = "10px Georgia, serif"; x.fillStyle = "#666";
    x.fillText("Mouse on canvas. Price on application", ox + 6, cy + 49);
    if (card.mark !== undefined) {
      x.fillStyle = card.mark >= 7 ? "#1f6a33" : card.mark >= 5 ? "#8a6a10" : "#a3201c";
      x.beginPath(); x.arc(ox + W - 26, cy + 30, 21, 0, 7); x.fill();
      x.fillStyle = "#fff"; x.textAlign = "center"; x.font = "800 17px Georgia, serif"; x.fillText(card.mark.toFixed(1), ox + W - 26, cy + 36);
    }
    if (card.sold) { x.fillStyle = "#d8262e"; x.beginPath(); x.arc(ox + W - 58, cy + 47, 7, 0, 7); x.fill(); }
    (card.prizes ?? []).slice(0, 2).forEach((pr, k) => {
      const rx = ox + 16 + k * 28, ry = oy + 14;
      x.fillStyle = k === 0 ? "#1f4fbf" : "#b3202c";
      x.beginPath(); x.moveTo(rx - 6, ry); x.lineTo(rx - 9, ry + 18); x.lineTo(rx - 3, ry + 14); x.lineTo(rx, ry + 20); x.lineTo(rx + 2, ry); x.fill();
      x.beginPath(); x.moveTo(rx + 6, ry); x.lineTo(rx + 9, ry + 18); x.lineTo(rx + 3, ry + 14); x.lineTo(rx, ry + 20); x.lineTo(rx - 2, ry); x.fill();
      x.beginPath(); x.arc(rx, ry, 9, 0, 7); x.fill();
      x.fillStyle = "#ffd84a"; x.beginPath(); x.arc(rx, ry, 5.5, 0, 7); x.fill();
      x.fillStyle = "#111"; x.font = "700 7px sans-serif"; x.textAlign = "center"; x.fillText(pr.startsWith("Best") ? "1st" : "★", rx, ry + 2.5);
    });
    this.atlasTex.needsUpdate = true;
  }

  /** Just the picture, for the time-lapse: its card stays as it is. */
  picture(p: number, px: Uint8Array) {
    const x = this.atlas.getContext("2d")!;
    this.img ??= x.createImageData(W, H);
    toImage(px, this.img);
    x.putImageData(this.img, (p % 4) * 256 + 8, Math.floor(p / 4) * 256 + 4);
    this.atlasTex.needsUpdate = true;
  }
  private img: ImageData | null = null;

  get hung() { return this.n; }

  dispose() {
    for (const m of [this.frames, this.art, this.easels]) m?.geometry.dispose();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) { (m as THREE.MeshBasicMaterial).map?.dispose(); m.dispose(); }
    this.atlasTex.dispose();
  }
}

function setUV(g: THREE.BufferGeometry, u0: number, v0: number, u1: number, v1: number) {
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
}

// ---- the crowd ----------------------------------------------------------------------------------

interface Goer {
  v: number; body: Avatar | null; gull: ReturnType<typeof gullFigure> | null;
  bubble: THREE.Sprite; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture;
  stops: { p: number; at: number; secs: number; text: string; mark: number }[];
  said: number; k: number;
}

/** A speech bubble, drawn at the foot of its canvas so its tail stays put however many lines it has.
 *  A remark too long for it at full size steps the type down rather than run off the bubble. */
function bubbleDraw(c: HTMLCanvasElement, who: string, text: string, mark: number) {
  const x = c.getContext("2d")!;
  x.clearRect(0, 0, c.width, c.height);
  let size = 25, gap = 29, lines: string[] = [];
  for (; size >= 19; size -= 2, gap -= 2) {
    x.font = `600 ${size}px Georgia, serif`;
    lines = wrapText(x, text, 440);
    if (lines.length * gap <= c.height - 90) break;
  }
  lines = lines.slice(0, Math.floor((c.height - 90) / gap));
  const h = 60 + lines.length * gap;
  const top = c.height - h - 26;
  x.fillStyle = "rgba(255,253,246,.96)"; x.strokeStyle = "#222"; x.lineWidth = 3;
  x.beginPath(); x.roundRect(6, top, 500, h, 18); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(230, top + h - 1); x.lineTo(256, c.height - 4); x.lineTo(270, top + h - 1); x.closePath(); x.fill();
  x.beginPath(); x.moveTo(230, top + h); x.lineTo(256, c.height - 4); x.lineTo(270, top + h); x.stroke();
  x.fillStyle = "#8a1c3a"; x.font = "italic 700 19px Georgia, serif"; x.textAlign = "left";
  x.fillText(who, 22, top + 28);
  x.fillStyle = "#111"; x.font = `600 ${size}px Georgia, serif`;
  lines.forEach((l, k) => x.fillText(l, 22, top + 64 + k * gap));
  x.fillStyle = markColour(mark);
  x.beginPath(); x.arc(470, top + 24, 22, 0, 7); x.fill();
  x.fillStyle = "#fff"; x.textAlign = "center"; x.font = "800 18px Georgia, serif";
  x.fillText(markText(mark), 470, top + 30);
}
/** A mark's colour, the same on a speech bubble and a critic's card: good, middling, bad. */
const markColour = (mark: number) => mark >= 7 ? "#1f6a33" : mark >= 4.5 ? "#8a6a10" : "#a3201c";
const markText = (mark: number) => Number.isInteger(mark) ? String(mark) : mark.toFixed(1);
/** "Jeremy" for Sir Jeremy Plinth, for the board's columns. */
const shortName = (name: string) => name.replace(/^(Sir|Dr|Lady) /, "").split(" ")[0];

// ---- the challenge ------------------------------------------------------------------------------

type Phase = "gather" | "paint" | "hang" | "show" | "result" | "out";

function themeWords(t: string, w: QuestWorld, at: ChallengeSpot, street: string) {
  const near = <T extends { x: number; z: number }>(a: T[]) => a.reduce<T | null>((b, q) => (!b || Math.hypot(q.x - at.x, q.z - at.z) < Math.hypot(b.x - at.x, b.z - at.z) ? q : b), null);
  const pub = near(w.pubs())?.name ?? "the local";
  const place = near(w.places())?.n ?? "the park";
  return t.replace("{pub}", pub).replace("{place}", place).replace("{street}", street || "the high street");
}

/** Which way is out from the gallery's door, as a unit vector. */
function outOf(spots: ChallengeSpot[]): [number, number] {
  const door = spots[0], mid = spots[1] ?? spots[0];
  const dx = mid.x - door.x, dz = mid.z - door.z, l = Math.hypot(dx, dz);
  return l < 0.5 ? [0, 1] : [dx / l, dz / l];
}

registerChallenge({
  id: "gallery", name: "The Art Gallery", glyph: "A", colour: COLOUR, tier: 3, stars: 2,
  blurb: "Paint a picture each, see it hung, and win over the critics at the private view",
  goal: () => "Go in, paint the subject, and get the show past the critics",
  place,
  waiting: ({ spots, w }) => new Welcome(w.scene, w.map, spots[0], spots[1] ?? spots[0], spots[0].name),
  // on the pavement by the door, as goDown leaves you, and up into the gallery at GO
  lineup: {
    start: "calm",
    spots: ({ spots }, n) => {
      const door = spots[0], [ox, oz] = outOf(spots);
      return Array.from({ length: n }, (_, k) => {
        const side = (k % 2 ? 0.9 : -0.9) * Math.ceil((k % 4) / 2), out = 1.8 + Math.floor(k / 4) * 0.9;
        const x = door.x + ox * out - oz * side, z = door.z + oz * out + ox * side;
        return { x, z, yaw: Math.atan2(x - door.x, z - door.z) };
      });
    },
  },
  start({ offer, spots, w, cast }) {
    const door = spots[0], mid = spots[1] ?? spots[0];
    const gallery = door.name;
    const street = placedInfo.get(spots)?.street ?? "";
    const Cx = mid.x, Cz = mid.z;
    const ground0 = (map: GameMap) => (map.wide ? map.wide.ground(Cx, Cz) : map.ground(Cx, Cz));
    let tallest = ground0(w.map);
    for (const b of w.map.wide?.buildingsNear(Cx, -Cz, 40) ?? []) tallest = Math.max(tallest, b.g + b.h + (b.rp ?? 0));
    const top = Math.round(Math.max(ground0(w.map) + 50, tallest + 16));

    let phase: Phase = "gather";
    let list: string[] = [];
    let painters: string[] = [];
    let themeText = "", critics: number[] = [];
    let paintEnd = 0;
    let hung = false;
    let aboard = false;
    let gatherSince = 0, startAsked = false, hangSince = 0;
    // everyone who entered goes straight in
    let enterNow = cast.includes(w.selfId), inT = 0;
    const chunks = new Map<string, string[]>();
    const works = new Map<string, { px: Uint8Array; strokes: number; how?: How }>();
    // each painting's time-lapse, as sent (to pass on to anyone who missed it) and unpacked
    const tapes = new Map<string, { text: string; frames: Uint8Array[] }>();
    let replayT0 = 0, replayDrawn = 0, replayOver = false;
    type Script = { cast: number[]; remarks: Remark[]; dur: number; j: number; board: number[][] };
    let show: Script | null = null;
    // the judging round, worked out from the script: each critic's card, and each painting everyone
    // stands at, from when they're there to when its last card's done
    let turns: { r: Remark; end: number }[] = [];
    let visits: { p: number; from: number; to: number }[] = [];
    let paperOn = -1, doorsOpen = false, faced = -1;
    let paper: { remove(): void } | null = null;
    let full: ReturnType<typeof stageShow> | null = null;
    const eyes = new Map<string, Eye>();
    let staging = false;
    let showT0 = 0;
    let result: Verdict | null = null;
    let resultT = 0, closeAt = 0, revealed = false, carded = false, warned = false;
    const votes = new Map<string, number>();
    let myVote = -1;
    const posed = new Set<string>();
    let stage: Card["stage"] = undefined;
    let card: ResultHandle | null = null;
    // the verdict is the shared result card: it's put away by its own buttons as well as by use
    const cardOn = () => !!card && !!document.querySelector(".msc-result.v-verdict:not(.out)");
    let shown = false;
    let goers: Goer[] = [];
    let saidUpTo = 0;

    const room = new Room(Cx, top, Cz, gallery);
    const welcome = new Welcome(w.scene, w.map, door, mid, gallery);
    // which way is out from the gallery's door to the street, for putting people back on the pavement
    const [outX, outZ] = outOf(spots);
    // Mr Pettigrew sees the evening through from beside the exit, in the room's own frame
    const PETTIGREW: [number, number] = [HX - 0.7, -2.7];
    const pettigrew = new Avatar("Mr Pettigrew, Curator", "#1f2a44", "curator", "#bdbdbd");
    pettigrew.armed = false;
    pettigrew.setWear("specs");
    room.root.add(pettigrew.root);
    const easel = new Easel();
    w.mark("@challenge", { x: door.x, z: door.z }, offer.title, COLOUR);

    const L = (x: number, z: number): [number, number] => [Cx + x, Cz + z];
    const inRoom = (x: number, z: number, y: number) => Math.abs(x - Cx) < HX + 0.8 && Math.abs(z - Cz) < HZ + 0.8 && y > top - 3 && y < top + RH + 1;
    const floor = (x: number, z: number, y: number) => (inRoom(x, z, y) ? top : null);
    const pusher = (pos: { x: number; z: number }, y: number, r: number) => {
      if (!inRoom(pos.x, pos.z, y)) return -Infinity;
      const lx = Math.max(-HX + r, Math.min(HX - r, pos.x - Cx)), lz = Math.max(-HZ + r, Math.min(HZ - r, pos.z - Cz));
      if (lx === pos.x - Cx && lz === pos.z - Cz) return -Infinity;
      pos.x = Cx + lx; pos.z = Cz + lz;
      return 3;
    };
    const hook = () => {
      if (!w.map.floors.includes(floor)) w.map.floors.push(floor);
      if (!w.map.pushers.includes(pusher)) w.map.pushers.push(pusher);
    };
    const unhook = () => {
      const i = w.map.floors.indexOf(floor); if (i >= 0) w.map.floors.splice(i, 1);
      const k = w.map.pushers.indexOf(pusher); if (k >= 0) w.map.pushers.splice(k, 1);
    };
    hook();

    const send = (d: Record<string, unknown>, to?: string) => w.send("qe", { ...d, s: offer.seed }, to);
    const tell = (d: Record<string, unknown>) => { send(d); job.event!(d, w.selfId); };
    const sendBig = (g: string, text: string, to?: string) => {
      const n = Math.max(1, Math.ceil(text.length / CHUNK));
      for (let i = 0; i < n; i++) send({ k: "ch", g, i, n, d: text.slice(i * CHUNK, (i + 1) * CHUNK) }, to);
    };
    const myPainter = () => painters.indexOf(w.selfId);
    const cam = () => w.look();
    const camInside = () => { const c = cam(); return inRoom(c.x, c.z, c.y); };
    const me = () => w.me();

    function goUp(at?: [number, number], yaw = 0) {
      hook();
      aboard = true;
      const k = Math.max(0, list.indexOf(w.selfId));
      const [x, z] = at ?? L(HX - 2.2 - (k % 3) * 0.9, -2 + Math.floor(k / 3) * 1.2);
      w.moveTo(x, z, at ? yaw : Math.PI / 2);
      const pl = w.body?.();
      if (pl) { pl.pos.y = top; pl.vel.set(0, 0, 0); pl.onGround = true; }
      w.mark("@challenge", null);
      inT = 2;
      if (w.isHost) job.event!({ k: "in" }, w.selfId); else send({ k: "in" });
    }
    function goDown() {
      if (!aboard) return;
      aboard = false;
      easel.hide();
      // out on the pavement, side by side, looking back at the door
      const k = Math.max(0, list.indexOf(w.selfId)), side = (k % 2 ? 0.9 : -0.9) * Math.ceil((k % 4) / 2), out = 1.8 + Math.floor(k / 4) * 0.9;
      const x = door.x + outX * out - outZ * side, z = door.z + outZ * out + outX * side;
      w.moveTo(x, z, Math.atan2(x - door.x, z - door.z));
    }
    const atDoor = (lx: number, lz: number) => lx > HX - 1.8 && Math.abs(lz) < 1.4;
    const byPettigrew = (lx: number, lz: number) => Math.hypot(lx - PETTIGREW[0], lz - PETTIGREW[1]) < CURATOR_REACH;

    function openEasel() {
      if (myPainter() < 0 || hung || phase !== "paint") return;
      easel.show({
        theme: esc(themeText),
        judges: `Tonight's critics: ${critics.map((c) => `<b>${esc(CRITICS[c].name)}</b> (${esc(CRITICS[c].taste ?? "")})`).join("; ")}. Their marks count double.`,
        left: () => paintEnd - performance.now(),
        onHang: () => hangMine(),
        onStepBack: () => easel.hideAndRelock(),
      });
    }
    function hangMine() {
      if (hung || myPainter() < 0) return;
      hung = true;
      easel.hideAndRelock();
      const how = easel.how();
      const text = `${howText(easel.strokes, how)},${encode(easel.px)}`;
      const tape = easel.replay();
      tapes.set(w.selfId, { text: tape, frames: decodeReplay(tape) });
      works.set(w.selfId, { px: easel.px.slice(), strokes: easel.strokes, how });
      // the time-lapse first, so the host has it by the time the painting itself lands
      sendBig(`r:${w.selfId}`, tape);
      sendBig(`p:${w.selfId}`, text);
      if (w.isHost) checkHung();
      SFX.jobStep();
      w.toast("Hung. Now wait for the private view");
    }
    function onBig(g: string, text: string) {
      if (g.startsWith("p:")) {
        const id = g.slice(2), comma = text.indexOf(",");
        if (comma < 0) return;
        works.set(id, { px: decode(text.slice(comma + 1)), strokes: Math.max(0, Math.min(999, parseInt(text.slice(0, comma)) || 0)), how: readHow(text.slice(0, comma)) });
        if (room.hung) drawAll();
        if (w.isHost) checkHung();
      } else if (g.startsWith("r:")) {
        if (tapes.size < MAX_PAINTERS * 2) tapes.set(g.slice(2), { text, frames: decodeReplay(text) });
      } else if (g === "show") {
        try {
          const s = JSON.parse(text);
          if (s && Array.isArray(s.cast) && Array.isArray(s.remarks) && Number.isFinite(s.dur)) startShow(s, Number(s.el) || 0);
        } catch { /* a garbled show: wait for the host's next word */ }
      }
    }
    function checkHung() {
      if (!w.isHost || phase !== "paint" && phase !== "hang") return;
      if (painters.length && painters.every((id) => works.has(id))) stageIt();
    }
    /** Host: everything's in (or the wait's over): hang the lot and stage the show. */
    function stageIt() {
      if (!w.isHost || show || full || staging || !painters.length) return;
      if (phase === "paint") tell({ k: "hang" });
      staging = true;
      if (eyeState().state === "loading") stage = { key: "arriving", title: "The critics are still arriving", sub: "Mr Pettigrew pours the wine", colour: COLOUR };
      lookAtThem().finally(() => {
        if (phase === "out" || job.done || show || full) return;
        full = staged();
        const s = { cast: full.cast, remarks: full.remarks, dur: full.dur, j: full.j, board: full.board };
        setTimeout(() => {
          if (phase === "out" || job.done) return;
          sendBig("show", JSON.stringify({ ...s, el: 0 }));
          startShow(s, 0);
        }, 2200);
      });
    }
    /** Host: the critics' eye looks at each painting, if it's arrived in time; otherwise the show goes on without it. */
    async function lookAtThem() {
      const late = (ms: number) => new Promise<false>((ok) => setTimeout(() => ok(false), ms));
      const until = performance.now() + EYE_WAIT_MS;
      if (eyeState().state === "off" || !(await Promise.race([wakeEye(), late(EYE_WAIT_MS)]))) return;
      // one at a time, so the frame rate only stutters, never stops
      for (const id of painters) {
        const px = works.get(id)?.px;
        if (!px || eyes.has(id)) continue;
        const e = await Promise.race([eyeJudge([px], THEMES[themeIndex()].t).catch(() => null), late(Math.max(2000, until - performance.now()))]);
        if (!e) return;
        eyes.set(id, e[0]);
      }
    }

    const themeIndex = () => hash("theme", offer.seed) % THEMES.length;
    /** On the host's screen, how far the critics' eye has got with loading. */
    const glasses = () => {
      const e = eyeState();
      return w.isHost && e.state === "loading" ? ` · The critics are finding their glasses: ${Math.round(e.progress * 100)}%` : "";
    };
    /** The paintings as hung, a blank canvas for anyone whose painting never came. */
    const hungUp = (): Painting[] => painters.map((id) => ({
      id, name: w.nameOf(id), px: works.get(id)?.px ?? new Uint8Array(W * H), strokes: works.get(id)?.strokes ?? 0, how: works.get(id)?.how, eye: eyes.get(id),
      early: earlyFrom(tapes.get(id)?.frames ?? []),
    }));
    const staged = () => {
      const S = slots(painters.length);
      return stageShow(hungUp(), THEMES[themeIndex()], themeText, hash("show", offer.seed, painters.join(",")), (p) => [S[p].x, S[p].z + S[p].nz * 2.3], [HX - 1.2, 0]);
    };

    function drawAll() {
      // a painting with a time-lapse stays under wraps until the doors open and it plays
      const wraps = (id: string) => !replayT0 && (phase === "paint" || phase === "hang") && !!tapes.get(id)?.frames.length;
      painters.forEach((id, p) => room.draw(p, wraps(id) ? null : works.get(id)?.px ?? null, {
        name: w.nameOf(id), title: themeText,
        mark: result?.final[p], sold: result ? result.prizes[0]?.p === p : false,
        prizes: result?.prizes.filter((q) => q.p === p).map((q) => q.title),
      }));
    }

    function startShow(s: Script, elapsed: number) {
      if (show) return;
      const j = Number.isFinite(s.j) && s.j > 0 ? Math.min(600, s.j) : 0;
      show = {
        cast: s.cast.filter((v) => Number.isFinite(v) && visitor(v)), remarks: s.remarks.filter((r) => r && Number.isFinite(r.at) && visitor(r.v) && typeof r.text === "string"),
        dur: Math.min(900, s.dur), j, board: Array.isArray(s.board) ? s.board.map((row) => Array.isArray(row) ? row.map(Number) : []) : [],
      };
      turns = show.remarks.filter((r) => r.at < j && visitor(r.v).critic).sort((a, b) => a.at - b.at).map((r) => ({ r, end: r.at + cardSecs(r.text) }));
      visits = [];
      for (const { r, end } of turns) {
        const last = visits[visits.length - 1];
        if (last?.p === r.p) last.to = end; else visits.push({ p: r.p, from: r.at - STEP, to: end });
      }
      paperOn = -1; doorsOpen = !j; faced = -1;
      showT0 = performance.now() - elapsed * 1000;
      replayT0 = showT0;
      phase = "show";
      saidUpTo = 0;
      if (!room.hung) { room.hang(painters.length); drawAll(); }
      room.setEasels(0);
      buildCrowd();
      stage = j ? { key: "judge", title: "The judging", sub: "The critics step up, one at a time", colour: COLOUR }
        : { key: "show", title: "The private view", sub: `${show.cast.length} visitors, ${show.remarks.length} opinions`, colour: COLOUR };
      if (aboard || camInside()) SFX.door(0, 0);
    }

    /** The time-lapses, all at once, each painting dissolving from one snapshot to the next. */
    function replayTick() {
      if (!replayT0 || replayOver || !room.hung) return;
      const now = performance.now(), u = (now - replayT0) / REPLAY_MS;
      if (u < 1 && now - replayDrawn < 70) return;
      replayDrawn = now;
      painters.forEach((id, p) => {
        const frames = tapes.get(id)?.frames, fin = works.get(id)?.px;
        if (!frames?.length || !fin) return;
        room.picture(p, u >= 1 ? fin : between(frames, fin, u));
      });
      if (u >= 1) replayOver = true;
    }

    function buildCrowd() {
      dropCrowd();
      if (!show) return;
      goers = show.cast.map((v, k) => {
        const vis = visitor(v), d = vis.dress;
        let body: Avatar | null = null, gull: ReturnType<typeof gullFigure> | null = null;
        if (d.gull) { gull = gullFigure("#ffffff", 1.8); room.root.add(gull.g); }
        else {
          body = new Avatar(vis.name, d.coat, `gallery-${vis.name}`, d.hair);
          body.armed = false;
          // only the critics wear name badges; everyone's name is on their speech bubble
          body.tagged = vis.critic;
          if (d.wear) body.setWear(d.wear);
          if (d.small) body.root.scale.setScalar(0.72);
          room.root.add(body.root);
        }
        const canvas = document.createElement("canvas");
        canvas.width = 512; canvas.height = 336;
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
        bubble.scale.set(3.2, 2.1, 1);
        bubble.center.set(0.5, 0);
        bubble.renderOrder = 20;
        bubble.visible = false;
        room.root.add(bubble);
        const stops = show!.remarks.filter((r) => r.v === v).map((r) => ({ p: r.p, at: r.at, secs: speakFor(r.text), text: r.text, mark: r.mark }));
        return { v, body, gull, bubble, canvas, tex, stops, said: -1, k };
      });
    }
    function dropCrowd() {
      for (const g of goers) {
        if (g.body) { room.root.remove(g.body.root); g.body.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
        if (g.gull) { room.root.remove(g.gull.g); g.gull.g.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
        room.root.remove(g.bubble);
        g.tex.dispose(); g.bubble.material.dispose();
      }
      goers = [];
    }

    /** Where the judging's got to at t: the painting everyone's at (p), or moving to from the last (q), u of the way. */
    function judgingAt(t: number) {
      let i = 0;
      while (i < visits.length - 1 && t >= visits[i].to) i++;
      const prev = i ? visits[i - 1] : null, at = visits[i];
      const u = prev ? Math.max(0, Math.min(1, (t - prev.to) / Math.max(0.1, at.from - prev.to))) : 1;
      return { i, p: at.p, q: prev?.p ?? at.p, u: u * u * (3 - 2 * u) };
    }
    const judging = (t: number) => !!show && show.j > 0 && t < show.j && visits.length > 0;
    const showTime = () => (performance.now() - showT0) / 1000;
    /** A spot by painting p, in the room's frame: lat to the right as you face it, back out from the wall, and the way that faces it. */
    function by(p: number, lat: number, back: number): [number, number, number] {
      const S = slots(painters.length), s = S[p] ?? S[0];
      return [s.x + lat * s.nz, s.z + s.nz * back, Math.atan2(0, s.nz)];
    }
    const toward = (a: [number, number, number], b: [number, number, number], u: number): [number, number] => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    /** Where you stand to watch the judging, among the others in the gallery. */
    function watchAt(t: number): { x: number; z: number; yaw: number; moving: boolean; p: number } {
      const J = judgingAt(t), k = Math.max(0, list.indexOf(w.selfId)), row = Math.min(4, Math.max(1, list.length));
      const spot = (p: number) => by(p, ((k % 4) - (row - 1) / 2) * 0.9, 4.6 + Math.floor(k / 4) * 0.9);
      const [x, z] = toward(spot(J.q), spot(J.p), J.u), [px, pz] = by(J.p, 0, 0);
      return { x, z, yaw: Math.atan2(-(px - x), -(pz - z)), moving: J.u < 1, p: J.p };
    }
    /** A critic at the judging: waiting their turn to the left of the painting, then stepping up to
     *  its right to give their remark, facing the room. */
    function criticAt(g: Goer, t: number) {
      const J = judgingAt(t), wait = (p: number) => by(p, -(2.2 + g.k * 0.8), 0.9);
      let [x, z] = toward(wait(J.q), wait(J.p), J.u), yaw = wait(J.p)[2], talking = -1;
      if (J.u >= 1) g.stops.forEach((st, i) => {
        if (st.p !== J.p) return;
        const end = st.at + cardSecs(st.text);
        const up = Math.max(0, Math.min(1, (t - st.at + STEP) / STEP)) - Math.max(0, Math.min(1, t - end));
        if (up <= 0) return;
        const [sx, sz, sy] = by(J.p, 2.0, 0.9);
        x += (sx - x) * up; z += (sz - z) * up;
        if (up > 0.5) yaw = sy + Math.PI;
        if (t >= st.at && t < end) talking = i;
      });
      return { x, z, yaw, talking, card: true };
    }

    /** Where a visitor is at t seconds into the show, in the room's frame, and which way they face. */
    function goerAt(g: Goer, t: number): { x: number; z: number; yaw: number; talking: number; card?: boolean; hidden?: boolean } {
      const j = show!.j, critic = visitor(g.v).critic;
      if (j && critic && judging(t)) return criticAt(g, t);
      // the public wait outside till the judging's done
      if (j && !critic && t < j) return { x: 0, z: 0, yaw: 0, talking: -1, hidden: true };
      const S = slots(painters.length);
      const doorP: [number, number] = [HX - 1.0, (g.k % 3 - 1) * 0.8];
      const stand = (p: number): [number, number, number] => {
        const s = S[p] ?? S[0], lat = ((g.k % 5) - 2) * 0.85, back = 2.3 + (Math.floor(g.k / 5) % 2) * 0.9 + (g.k % 2) * 0.25;
        return [s.x + lat, s.z + s.nz * back, Math.atan2(0, s.nz)];
      };
      let fx = doorP[0], fz = doorP[1], ft = j + 1.5 + g.k * 1.1, yaw = Math.PI / 2;
      // the critics have had their say, and stand back from the last painting
      const after = !!j && critic;
      if (after) {
        const last = visits[visits.length - 1]?.p ?? 0;
        [fx, fz, yaw] = by(last, -(2.2 + g.k * 0.8), 0.9);
        ft = j;
      }
      const stops = after ? [] : g.stops;
      for (let i = 0; i < stops.length; i++) {
        const st = stops[i], [sx, sz, sy] = stand(st.p);
        const arrive = Math.min(st.at - 0.6, ft + Math.hypot(sx - fx, sz - fz) / 1.5);
        if (t < ft) return { x: fx, z: fz, yaw, talking: -1 };
        if (t < arrive) {
          const u = (t - ft) / Math.max(0.01, arrive - ft);
          return { x: fx + (sx - fx) * u, z: fz + (sz - fz) * u, yaw: Math.atan2(-(sx - fx), -(sz - fz)), talking: -1 };
        }
        const end = st.at + st.secs;
        if (t < end) return { x: sx, z: sz, yaw: sy, talking: t >= st.at ? i : -1 };
        fx = sx; fz = sz; ft = end; yaw = sy;
      }
      // done: wander back towards the middle and look about
      const [mx, mz] = [(g.k % 4 - 1.5) * 2.2, ((g.k >> 2) % 2 - 0.5) * 2];
      const u = Math.max(0, Math.min(1, (t - ft) / 4));
      return { x: fx + (mx - fx) * u, z: fz + (mz - fz) * u, yaw: u < 1 ? Math.atan2(-(mx - fx), -(mz - fz)) : yaw + Math.sin(t * 0.3 + g.k) * 0.8, talking: -1 };
    }

    function updateCrowd(dt: number) {
      if (!show) return;
      const t = (performance.now() - showT0) / 1000, now = performance.now();
      const c = cam();
      for (const g of goers) {
        const at = goerAt(g, t), y = 0;
        if (g.body) g.body.root.visible = !at.hidden;
        if (g.gull) g.gull.g.visible = !at.hidden;
        if (g.body) {
          g.body.holdAt(at.x, y, at.z, at.yaw, 0, 0);
          g.body.update(now, dt);
        } else if (g.gull) {
          g.gull.g.position.set(at.x, 0.05 + Math.abs(Math.sin(t * 6)) * 0.03, at.z);
          g.gull.g.rotation.y = at.yaw;
          const flap = at.talking >= 0 ? Math.sin(t * 14) * 0.5 : -0.1;
          g.gull.wl.rotation.z = flap; g.gull.wr.rotation.z = -flap;
        }
        const tall = visitor(g.v).dress.small ? 2.1 : g.gull ? 1.7 : 2.8;
        g.bubble.position.set(at.x, tall - 0.8, at.z);
        if (at.talking >= 0 && at.talking !== g.said) {
          g.said = at.talking;
          const st = g.stops[at.talking], vis = visitor(g.v);
          if (!at.card) { bubbleDraw(g.canvas, vis.name, st.text, st.mark); g.tex.needsUpdate = true; }
          const [wx, wz] = L(at.x, at.z), dist = Math.hypot(c.x - wx, c.z - wz);
          if (camInside() && dist < 14) speak(st.text.replace(/\([^)]*\)/g, "").trim() || "Hmm.", g.v + 1, dist, { voice: g.v, pitch: vis.dress.pitch ?? 1, rate: 1.05 }, !!vis.dress.woman);
        }
        g.bubble.visible = at.talking >= 0 && !at.card;
      }
      judgingTick(t);
      // the ticker: every remark from the public as it's made (the critics' are on their cards)
      while (saidUpTo < show.remarks.length && show.remarks[saidUpTo].at <= t) {
        const r = show.remarks[saidUpTo++];
        if ((aboard || camInside()) && r.at >= show.j) tick(r);
      }
    }

    /** The judging's cards, each put up on every screen at the moment the script says, then the
     *  board of the critics' marks, then the doors open. */
    function judgingTick(t: number) {
      if (!show || doorsOpen) return;
      if (t >= show.j) {
        doorsOpen = true;
        stage = { key: "doors", title: "The doors open", sub: painters.length > 1 ? "Walk round, and {use} by a painting to vote for it" : "The public come in", colour: COLOUR };
        if (aboard || camInside()) SFX.door(0, 0);
        return;
      }
      if (!(aboard || camInside())) return;
      const k = turns.findIndex((c) => t >= c.r.at && t < c.end), board = show.j - BOARD;
      if (k >= 0 && k !== paperOn) {
        paperOn = k;
        const { r } = turns[k], read = speakFor(r.text);
        paper = missionPaper({
          flag: "Arts: the judging", label: criticTitle(visitor(r.v)), title: `“${themeText}” by ${w.nameOf(painters[r.p] ?? "")}`, colour: COLOUR,
          text: r.text, typing: Math.min(read * 0.6, r.text.length / 26), stamp: { text: `${markText(r.mark)} / 10`, colour: markColour(r.mark), at: read },
          secs: cardSecs(r.text) - (t - r.at), since: t - r.at,
        });
      } else if (k < 0 && t >= board && paperOn !== -2) {
        paperOn = -2;
        paper = missionPaper({ flag: "Arts: the judging", label: `“${themeText}”`, title: "The critics' marks", body: marksTable(), colour: COLOUR, secs: show.j - t });
      }
    }
    /** Every painting, with each critic's mark for it and the critics' average. */
    function marksTable() {
      const crit = show!.cast.filter((v) => visitor(v).critic);
      const mark = (p: number, c: number) => show!.board[p]?.[c] ?? show!.remarks.find((r) => r.p === p && r.v === crit[c])?.mark;
      const rows = painters.map((id, p) => {
        const ms = crit.map((_, c) => mark(p, c)), got = ms.filter((m): m is number => Number.isFinite(m));
        const mean = got.length ? got.reduce((a, b) => a + b, 0) / got.length : 0;
        return `<tr><td>${esc(w.nameOf(id))}</td>${ms.map((m) => `<td class="t">${m === undefined ? "–" : markText(m)}</td>`).join("")}<td class="t"><b>${mean.toFixed(1)}</b></td></tr>`;
      }).join("");
      return `<table><tr><td></td>${crit.map((v) => `<td class="t">${esc(shortName(visitor(v).name))}</td>`).join("")}<td class="t">Average</td></tr>${rows}</table>`;
    }

    /** A remark as a note (notice.ts), queued so none is lost. */
    function tick(r: Remark) {
      const v = visitor(r.v);
      news({ text: `${v.name} on ${w.nameOf(painters[r.p] ?? "")}'s: “${r.text}” ${r.mark}/10` });
    }

    /** The verdict's in, the same on every screen: a moment while the critics confer, then it's read out (revealResult). */
    function showResult(v: Verdict) {
      result = v;
      phase = "result";
      resultT = performance.now();
      closeAt = resultT + BEAT_MS + CLOSE_MS;
      stage = { key: "confer", title: "The critics confer", sub: "Mr Pettigrew taps his glass", colour: COLOUR };
      if (aboard) speak("Ladies and gentlemen. The critics have conferred.", 99, 2, { voice: 3, pitch: 0.9 });
    }

    /** The marks go up on the cards by the paintings, and anyone in the gallery gets the verdict on a
     *  card of its own, up until they put it away; anyone outside just hears how it went. */
    function revealResult() {
      const v = result!;
      revealed = true;
      drawAll();
      if (!(aboard || camInside())) { finish(); return; }
      carded = true;
      easel.hide();
      const thumbs = painters.map((id, p) => {
        const c = document.createElement("canvas");
        c.width = W; c.height = H;
        const img = c.getContext("2d")!.createImageData(W, H);
        toImage(works.get(id)?.px ?? new Uint8Array(W * H), img);
        c.getContext("2d")!.putImageData(img, 0, 0);
        const prizes = v.prizes.filter((q) => q.p === p).map((q) => `<div style="color:#8a1c3a;font-weight:700;font-size:12px">${esc(q.title)}</div>`).join("");
        return `<div style="text-align:center;width:${painters.length > 4 ? 25 : painters.length === 1 ? 50 : Math.floor(100 / painters.length)}%;padding:4px;box-sizing:border-box">
          <img src="${c.toDataURL()}" style="width:100%;image-rendering:pixelated;border:4px solid #c9a23a;box-sizing:border-box">
          <div style="font-weight:700">${esc(w.nameOf(id))}</div><div>${v.final[p].toFixed(1)} / 10</div>${prizes}</div>`;
      }).join("");
      const colour = v.won ? "#1f6a33" : "#a3201c";
      card = missionResult({
        result: v.won ? "won" : "lost", kind: "arts", variant: "verdict", colour: COLOUR,
        label: `The private view at ${gallery} · “${themeText}”`, title: v.headline,
        body: `<div style="display:flex;flex-wrap:wrap;justify-content:center;margin:8px 0">${thumbs}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid var(--ink);padding-top:6px">
            <div>The show averaged <b>${v.score.toFixed(1)}</b>; it needed <b>${v.bar.toFixed(1)}</b>.</div>
            ${stampHtml(v.won ? "A SUCCESS" : "PANNED", colour)}</div>
          <div style="text-align:center;margin-top:8px;font-style:italic;font-size:13px;color:var(--muted)">${ctlText("Then look round the show: the marks are on the cards")}</div>`,
      });
    }

    function dismissCard() {
      if (!card) return;
      const c = card;
      card = null;
      c.remove();
      closeAt = Math.max(closeAt, performance.now() + LINGER_MS);
    }

    function finish() {
      if (job.done || !result) return;
      dismissCard();
      paper?.remove();
      phase = "out";
      goDown();
      job.done = {
        won: result.won, screen: carded, x: door.x, z: door.z, wear: result.won && result.score >= result.bar + TRIUMPH ? ["beret"] : [],
        text: result.won ? `The show was a success: ${result.score.toFixed(1)} against ${result.bar.toFixed(1)}` : `The critics panned it: ${result.score.toFixed(1)}, and it needed ${result.bar.toFixed(1)}`,
      };
    }

    /** Host: the walk round's over and the votes are in. */
    function judge() {
      if (!w.isHost || result || !show) return;
      // a host who took over part way through stages the same show again from the paintings everyone has
      full ??= staged();
      const vs = painters.map(() => 0);
      for (const [id, p] of votes) if (p >= 0 && p < vs.length && painters[p] !== id) vs[p]++;
      tell({ k: "res", v: verdict(full, hungUp(), vs, offer.seed) });
    }

    const job: Job = {
      offer, done: null,
      update(dt) {
        welcome.update(dt);
        hook();
        if (enterNow) {
          enterNow = false;
          const m = me();
          if (phase === "gather" && m.alive) goUp();
        }
        // the host's word on who's in can cross with ours on the way: say it again till it lands
        if (aboard && phase === "gather" && !w.isHost && !list.includes(w.selfId) && (inT -= dt) <= 0) { inT = 2; send({ k: "in" }); }
        const c = cam();
        const near = Math.hypot(c.x - Cx, c.z - Cz) < 500;
        if (near !== shown) { shown = near; if (near) w.scene.add(room.root); else w.scene.remove(room.root); }
        // knocked out of the gallery some other way (a respawn): you're out
        if (aboard && me().y < top - 6) { aboard = false; easel.hide(); }
        easel.tick(dt);
        if (phase === "paint" && myPainter() >= 0 && !hung && performance.now() > paintEnd) hangMine();
        // the painters hold their brushes out at their easels
        const busy = new Set(phase === "paint" ? painters : []);
        for (const id of busy) if (id !== w.selfId && !posed.has(id)) { w.pose?.(id, 0, "push"); posed.add(id); }
        for (const id of [...posed]) if (!busy.has(id)) { w.pose?.(id, 0, ""); posed.delete(id); }
        if (shown) {
          replayTick();
          updateCrowd(dt);
          pettigrew.wave = phase === "result" && revealed && performance.now() % 7000 < 1800 ? 2 : 0;
          pettigrew.holdAt(PETTIGREW[0], 0, PETTIGREW[1], Math.PI / 2, 0, 0);
          pettigrew.update(performance.now(), dt);
        }
        if (phase === "result") {
          const now = performance.now();
          if (card && !cardOn()) dismissCard();
          if (!revealed) { if (now - resultT > BEAT_MS) revealResult(); }
          else if (!card) {
            if (!aboard) finish();
            else if (now > closeAt) { w.toast("The gallery's closed for the night"); finish(); }
            else if (!warned && closeAt - now < 15000) {
              warned = true;
              stage = { key: "closing", title: "The gallery's closing", sub: "Mr Pettigrew is turning the lights off", colour: COLOUR };
            }
          }
        }
      },
      host() {
        if (aboard) wakeEye();
        if (phase === "gather") {
          if (list.length && !gatherSince) gatherSince = performance.now();
          const here = new Set(w.players().map((p) => p.id));
          const all = cast.every((id) => !here.has(id) || list.includes(id));
          const waited = gatherSince && performance.now() - gatherSince > 45000;
          if (list.length && ((all && performance.now() - gatherSince > 1500) || startAsked || waited)) {
            const ps = list.slice(0, MAX_PAINTERS), ti = themeIndex();
            tell({ k: "go", a: ps, left: PAINT_MS, t: themeWords(THEMES[ti].t, w, door, street), c: criticsFor(hash("show", offer.seed, ps.join(",")), ps.length) });
          }
          return;
        }
        if (phase === "paint" && performance.now() > paintEnd + 6000) {
          if (!hangSince) hangSince = performance.now();
          stageIt();
        }
        if (phase === "show" && show && (performance.now() - showT0) / 1000 > show.dur + 2.5) judge();
      },
      event(d, from) {
        if (!d || typeof d !== "object") return;
        switch (d.k) {
          case "in":
            if (!w.isHost) return;
            if (!list.includes(from)) tell({ k: "list", a: [...list, from] });
            return;
          case "list":
            if (Array.isArray(d.a)) list = d.a.filter((id: unknown) => typeof id === "string");
            return;
          case "start":
            if (w.isHost) startAsked = true;
            return;
          case "go": {
            if (phase !== "gather" || !Array.isArray(d.a)) return;
            painters = d.a.filter((id: unknown) => typeof id === "string").slice(0, MAX_PAINTERS);
            themeText = String(d.t ?? "Something nice").slice(0, 80);
            critics = Array.isArray(d.c) ? d.c.filter((c: unknown) => Number.isInteger(c) && CRITICS[c as number]) : [0, 1];
            paintEnd = performance.now() + Math.max(5000, Math.min(300000, Number(d.left) || PAINT_MS));
            phase = "paint";
            room.setTheme(themeText);
            room.setEasels(painters.length);
            const k = myPainter();
            if (k >= 0 && aboard) {
              const [ex, ez] = easelAt(k, painters.length), [x, z] = L(ex, ez + 1.25);
              goUp([x, z], 0);
              openEasel();
            }
            stage = { key: "paint", title: `Paint: ${themeText}`, sub: `Judging tonight: ${critics.map((c) => CRITICS[c].name).join(", ")}`, colour: COLOUR };
            if (aboard) speak(`Tonight's subject: ${themeText}. Brushes at the ready.`, 99, 2, { voice: 3, pitch: 0.9 });
            return;
          }
          case "ch": {
            if (typeof d.g !== "string" || typeof d.d !== "string" || !Number.isInteger(d.i) || !Number.isInteger(d.n) || d.n < 1 || d.n > 64 || d.i < 0 || d.i >= d.n) return;
            const have = chunks.get(d.g) ?? new Array(d.n).fill(undefined);
            if (have.length !== d.n) return;
            have[d.i] = d.d;
            chunks.set(d.g, have);
            if (have.every((s) => typeof s === "string")) { chunks.delete(d.g); onBig(d.g, have.join("")); }
            return;
          }
          case "need":
            if (!w.isHost) return;
            for (const [id, wk] of works) {
              const tape = tapes.get(id)?.text;
              if (tape) sendBig(`r:${id}`, tape, from);
              sendBig(`p:${id}`, `${wk.how ? howText(wk.strokes, wk.how) : wk.strokes},${encode(wk.px)}`, from);
            }
            if (show) sendBig("show", JSON.stringify({ ...show, el: (performance.now() - showT0) / 1000 }), from);
            return;
          case "hang":
            if (phase === "paint") {
              phase = "hang";
              if (myPainter() >= 0 && !hung) hangMine();
              easel.hide();
              room.hang(painters.length);
              drawAll();
              stage = { key: "hang", title: "Hanging the show", sub: "The doors open in a moment", colour: COLOUR };
            }
            return;
          case "vote":
            if (w.isHost && Number.isInteger(d.p)) votes.set(from, d.p);
            return;
          case "res":
            if (result || !d.v || !Array.isArray(d.v.final)) return;
            showResult(d.v as Verdict);
            return;
        }
      },
      progress: () => ({ ph: phase, a: list, pa: painters, t: themeText, c: critics, left: Math.max(0, paintEnd - performance.now()), r: result }),
      restore(p) {
        if (!p || typeof p !== "object") return;
        if (Array.isArray(p.a)) list = p.a.filter((id: unknown) => typeof id === "string");
        if (p.ph !== "gather" && Array.isArray(p.pa) && phase === "gather") {
          job.event!({ k: "go", a: p.pa, t: p.t, c: p.c, left: Math.max(5000, p.left) }, "");
          if (p.ph !== "paint") job.event!({ k: "hang" }, "");
          send({ k: "need" });
        }
        if (p.r && !result) showResult(p.r);
      },
      use() {
        if (card) { dismissCard(); return true; }
        const m = me();
        if (!aboard) {
          if (phase === "result" || phase === "out") return false;
          if (Math.hypot(m.x - door.x, m.z - door.z) > GO_IN) return false;
          goUp();
          return true;
        }
        const lx = m.x - Cx, lz = m.z - Cz;
        if (phase === "result") {
          if (revealed && (atDoor(lx, lz) || byPettigrew(lx, lz))) { finish(); return true; }
          return false;
        }
        if (atDoor(lx, lz) && phase !== "paint") { goDown(); return true; }
        if (phase === "gather") { if (w.isHost) startAsked = true; else send({ k: "start" }); return true; }
        if (phase === "paint" && myPainter() >= 0 && !hung) { openEasel(); return true; }
        if (phase === "show" && painters.length > 1 && !judging(showTime())) {
          const p = facing();
          if (p >= 0 && painters[p] !== w.selfId) {
            myVote = p;
            if (w.isHost) votes.set(w.selfId, p); else send({ k: "vote", p });
            w.toast(`You voted for ${w.nameOf(painters[p])}'s painting`);
            return true;
          }
        }
        return false;
      },
      hint() {
        const m = me();
        if (!aboard) {
          if (phase === "result" || phase === "out") return "";
          return Math.hypot(m.x - door.x, m.z - door.z) < GO_IN ? `<b>{use}</b> Go into the gallery${phase === "gather" ? "" : " and watch"}` : "";
        }
        const lx = m.x - Cx, lz = m.z - Cz;
        if (phase === "result") {
          if (!revealed || card) return "";
          return atDoor(lx, lz) ? "<b>{use}</b> Leave the gallery" : byPettigrew(lx, lz) ? "<b>{use}</b> Thank Mr Pettigrew and leave" : "";
        }
        if (atDoor(lx, lz) && phase !== "paint") return "<b>{use}</b> Leave the gallery";
        if (phase === "gather") return "<b>{use}</b> Start the painting";
        if (phase === "paint" && myPainter() >= 0 && !hung && !easel.open) return "<b>{use}</b> Back to your easel";
        if (phase === "show" && painters.length > 1 && !judging(showTime())) {
          const p = facing();
          if (p >= 0 && painters[p] !== w.selfId) return myVote === p ? "Your vote's on this one" : `<b>{use}</b> Vote for ${esc(w.nameOf(painters[p]))}'s painting`;
        }
        return "";
      },
      perch() {
        // through the judging everyone stands together in front of each painting in turn, free to
        // look about, turned to face each one as they get to it
        if (aboard && phase === "show" && judging(showTime())) {
          const at = watchAt(showTime()), [x, z] = L(at.x, at.z), turn = at.moving || faced !== at.p;
          if (!at.moving) faced = at.p;
          return { x, y: top, z, bare: true, face: turn ? at.yaw : undefined, around: { yaw: at.yaw, max: 1.2 }, pitch: -0.06 };
        }
        if (!aboard || phase !== "paint") return null;
        const k = myPainter();
        if (k < 0) return null;
        const [ex, ez] = easelAt(k, painters.length), [x, z] = L(ex, ez + 1.25);
        return { x, y: top, z, bare: true };
      },
      card() {
        const ps = w.players();
        if (phase === "gather" && !aboard) {
          const m = me(), d = Math.hypot(m.x - door.x, m.z - door.z);
          return { line: d > 30 ? `Go to ${gallery}` : "Go into the gallery ({use} by the curator)", progress: `${list.length} / ${ps.length} in`, stage };
        }
        if (phase === "gather") return { line: "Waiting in the gallery", sub: "Everyone in, or {use} to start", progress: `${list.length} / ${ps.length} in`, stage };
        if (phase === "paint") {
          const left = Math.max(0, Math.ceil((paintEnd - performance.now()) / 1000));
          const timer = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
          if (myPainter() >= 0) return { line: `Paint: ${themeText}`, sub: (hung ? "Hung. Waiting for the others" : easel.open ? "{easel.leave} to step back" : "{use} to go back to your easel") + glasses(), timer, stage };
          return { line: "The artists are painting", sub: `“${themeText}”${glasses()}`, timer, stage };
        }
        if (phase === "hang") return { line: staging && eyeState().state === "loading" ? "The critics are still arriving" : "Hanging the show", sub: glasses().slice(3) || undefined, stage };
        if (phase === "show" && show && judging(showTime())) {
          const J = judgingAt(showTime());
          return { line: "The judging", sub: `${w.nameOf(painters[J.p] ?? "")}'s painting`, progress: `${J.i + 1} / ${visits.length}`, bar: (J.i + 1) / visits.length, stage };
        }
        if (phase === "show" && show) {
          const t = (performance.now() - showT0) / 1000, said = show.remarks.filter((r) => r.at <= t && r.at >= show!.j).length, all = show.remarks.filter((r) => r.at >= show!.j).length;
          return { line: "The private view", sub: painters.length > 1 ? "Walk round. {use} by a painting to vote for it" : "Listen to what they make of it", progress: `${said} / ${all}`, bar: said / Math.max(1, all), stage };
        }
        if (result) {
          const head = result.won ? "A success!" : "Panned", marks = `${result.score.toFixed(1)} against ${result.bar.toFixed(1)}`;
          if (!revealed) return { line: "The critics confer", stage };
          if (card || !aboard) return { line: head, sub: marks, stage };
          const left = Math.max(0, Math.ceil((closeAt - performance.now()) / 1000));
          const timer = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
          return { line: `${head} Have a look round`, sub: `${marks}. The gallery closes in ${timer}: {use} by the door or Mr Pettigrew to leave`, timer, stage };
        }
        return { line: "The Art Gallery", stage };
      },
      scarAt: () => ({ x: door.x, z: door.z }),
      quiet: () => cardOn() || phase === "show" && judging(showTime()) && (aboard || camInside()),
      aloft: () => aboard,
      indoors: () => aboard || camInside(),
      end() {
        dismissCard();
        paper?.remove();
        easel.hide();
        for (const id of posed) w.pose?.(id, 0, "");
        if (aboard) goDown();
        unhook();
        dropCrowd();
        room.root.remove(pettigrew.root);
        pettigrew.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        if (shown) w.scene.remove(room.root);
        room.dispose();
        welcome.dispose();
        w.mark("@challenge", null);
      },
    };

    /** The painting you're stood in front of and looking at, if any. */
    function facing(): number {
      const m = me(), c = cam(), S = slots(painters.length);
      let best = -1, bd = 3.6;
      S.forEach((s, p) => {
        const [x, z] = L(s.x, s.z), d = Math.hypot(m.x - x, m.z - z);
        const toward = ((x - c.x) * c.dx + (z - c.z) * c.dz) / Math.max(0.1, Math.hypot(x - c.x, z - c.z));
        if (d < bd && toward > 0.5) { bd = d; best = p; }
      });
      return best;
    }

    if (TESTING) (window as unknown as Record<string, unknown>).__gallery = {
      easel, eyes: () => [...eyes.values()], phase: () => phase, painters: () => painters, theme: () => themeText, show: () => show, result: () => result,
      works: () => works.size, tapes: () => [...tapes].map(([id, t]) => ({ id, frames: t.frames.length, bytes: t.text.length })),
      replay: () => (replayT0 ? (performance.now() - replayT0) / REPLAY_MS : -1), aboard: () => aboard, top, C: { x: Cx, z: Cz }, door, hang: () => hangMine(), start: () => job.use!(),
      hint: () => job.hint!(), card: () => job.card(), judging: () => ({ t: show ? showTime() : -1, j: show?.j ?? 0, paper: paperOn, cards: turns.length, doors: doorsOpen }), pettigrew: PETTIGREW, closeIn: (ms?: number) => { if (ms !== undefined) closeAt = performance.now() + ms; return closeAt - performance.now(); },
    };
    return job;
  },
});
