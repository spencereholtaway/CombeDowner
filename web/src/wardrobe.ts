// The wardrobe: daft things to wear, earned by doing things round Bath. A seagull sitting on your
// head for seeing off a Seagull Attack, a traffic cone for winning a race, a halo for climbing Bath Abbey, a chef's hat from a good
// shift at the Darling Deli, a baby's bonnet for enough tummy time... Each one says what you've done to everyone you play with.
//
// There are three places to wear something: on your head, on your face, and on your back or
// shoulder, one thing in each. Pick what you wear from the Wardrobe in the pause menu, which shows
// you turning round in it, a tab for each place, and what's still to earn and how. Everything is
// earned the same way on every map, from the map's own pubs, parks, water and challenges.
//
// Who decides what: all your own. What you've earned and what you're wearing are kept on your
// machine (local storage), shared with the mines' page. What you're wearing goes round in your hello
// (game.ts) as a short list of names, for everyone else to draw on you (avatar.ts). Nothing is
// checked: it's only clothes.
import * as THREE from "three";
import { Avatar, ball, box, part, shell, type Piece } from "./avatar";
import { PAGE, ttBar, ttTitle } from "./teletext";
import { closeButton } from "./modal";

export type Slot = "head" | "face" | "back";
export const SLOTS: Slot[] = ["head", "face", "back"];
const SLOT_NAMES: Record<Slot, string> = { head: "Head", face: "Face", back: "Back" };

export interface Wearable { id: string; slot: Slot; name: string; how: string }

/** Everything there is to wear, and how you get it. Ids go over the network: keep them short and don't rename them. */
export const WEARABLES: Wearable[] = [
  { id: "gull", slot: "head", name: "A seagull", how: "Three stars on a Seagull Attack" },
  { id: "splat", slot: "head", name: "Splattered flat cap", how: "Get pooed on five times by seagulls" },
  { id: "cone", slot: "head", name: "Traffic cone", how: "Be first over the line in a race" },
  { id: "deer", slot: "head", name: "Deerstalker", how: "Bring in a Wanted ringleader" },
  { id: "toque", slot: "head", name: "Chef's hat", how: "Three stars on a shift at the Darling Deli" },
  { id: "bonnet", slot: "head", name: "Baby's bonnet", how: "Ten minutes of tummy time, all told" },
  { id: "halo", slot: "head", name: "A halo", how: "Climb Bath Abbey and put on the wings at the top" },
  { id: "specs", slot: "face", name: "Joke glasses and moustache", how: "Finish any job from a noticeboard" },
  { id: "shades", slot: "face", name: "Shades and a sunburnt nose", how: "Win a Seagull Attack" },
  { id: "owl", slot: "back", name: "Plastic owl on your shoulder", how: "Beat Big Lad without a bite lost in the last wave" },
  { id: "brolly", slot: "back", name: "Splattered brolly", how: "Beat Big Lad without a poo bomb hitting you" },
  { id: "cat", slot: "back", name: "A cat on your shoulder", how: "Live through a cat swarm" },
  { id: "loaf", slot: "back", name: "Baguette in a rucksack", how: "Work ten shifts at the Darling Deli" },
  { id: "crown", slot: "head", name: "Clear-up crown", how: "Be there when the last zone of the map opens" },
  { id: "buscap", slot: "head", name: "Bus driver's cap", how: "Drive a bus all the way round its route without leaving anyone at a stop" },
  { id: "cashbag", slot: "back", name: "Conductor's cash bag", how: "50 points on a timetabled bus run from the bus station" },
  { id: "whistle", slot: "face", name: "Inspector's whistle", how: "75 points on a timetabled bus run from the bus station" },
  { id: "inspcap", slot: "head", name: "Inspector's gold-braided cap", how: "90 points on a timetabled bus run from the bus station" },
  { id: "clippie", slot: "head", name: "Clippie's ticket machine hat", how: "Sell fifty tickets at the door in Push the Bus" },
  { id: "hood", slot: "head", name: "Pensioner's plastic rain hood", how: "Gold on Push the Bus, with every pensioner aboard and happy" },
  { id: "muffs", slot: "head", name: "Bell-ringer's earmuffs", how: "Ring a touch through without a single clash" },
  { id: "beret", slot: "head", name: "A beret", how: "Have the critics call your show a triumph" },
  { id: "lockcap", slot: "head", name: "Lock-keeper's peaked cap", how: "Gold on the Lock Run" },
  { id: "party", slot: "head", name: "Party hat", how: "Set the last strange object in a structure and open a new zone" },
  { id: "lplate", slot: "face", name: "L-plate on a string", how: "Pass the driving test" },
  { id: "dazzle", slot: "face", name: "Dazzled by a speed camera", how: "Get clocked at 40 mph by a speed trap" },
  { id: "goggles", slot: "face", name: "Swimming goggles", how: "End up in the water ten times" },
  { id: "guard", slot: "face", name: "Foam mouth guard", how: "Win a penalty shoot-out" },
  { id: "froth", slot: "face", name: "Pint-froth moustache", how: "Pop into ten different pubs" },
  { id: "monocle", slot: "face", name: "A monocle", how: "See a night out through to its front page" },
  { id: "sunblock", slot: "face", name: "Cricket sunblock stripes", how: "Bowl someone's stumps over" },
  { id: "orb", slot: "back", name: "A strange object of your own", how: "Set five strange objects in a structure yourself" },
  { id: "stick", slot: "back", name: "A walking stick", how: "Get hit by a walking stick in Push the Bus" },
  { id: "thermos", slot: "back", name: "Thermos in a string bag", how: "Get hit by everything the pensioners throw, in one push" },
  { id: "rope", slot: "back", name: "Coil of climbing rope", how: "Top the Climb without losing a life" },
  { id: "pole", slot: "back", name: "Balancing pole", how: "Get across the Tightrope" },
  { id: "lamp", slot: "back", name: "Miner's lamp", how: "Reach the bottom level of the mines" },
  { id: "deck", slot: "back", name: "Skateboard on your back", how: "Land a ×10 combo on a ride" },
  { id: "pigeon", slot: "back", name: "A pigeon on your shoulder", how: "Spend an hour in the parks, all told" },
  { id: "wsuit", slot: "back", name: "A wingsuit", how: "Stand somewhere 15 m above the ground round you: a roof, a tower, a high wall" },
];
const BY_ID = new Map(WEARABLES.map((w) => [w.id, w]));

const KEY = "cd-wardrobe";
interface Saved { got: string[]; worn: Partial<Record<Slot, string>>; n: Record<string, number>; seen?: Record<string, string[]> }

function load(): Saved {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (d && Array.isArray(d.got)) return { got: d.got.filter((id: string) => BY_ID.has(id)), worn: d.worn ?? {}, n: d.n ?? {}, seen: d.seen ?? {} };
  } catch { /* nothing saved */ }
  return { got: [], worn: {}, n: {}, seen: {} };
}
function save(s: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

const listeners: ((w: Wearable) => void)[] = [];
/** Told whenever you earn something new (game.ts puts it on screen and tells everyone). Returns a way to stop. */
export function onEarn(f: (w: Wearable) => void): () => void {
  listeners.push(f);
  return () => { const k = listeners.indexOf(f); if (k >= 0) listeners.splice(k, 1); };
}

/** Have you got it? */
export const has = (id: string) => load().got.includes(id);
/** Have you got it on? */
export const wearing = (id: string) => { const s = load(); return s.got.includes(id) && Object.values(s.worn).includes(id); };

/** You've earned id: put it in your wardrobe and wear it straight away. Returns true if it's new. */
export function earn(id: string): boolean {
  const w = BY_ID.get(id), s = load();
  if (!w || s.got.includes(id)) return false;
  s.got.push(id);
  s.worn[w.slot] = id;
  save(s);
  for (const f of listeners) f(w);
  return true;
}

/** Put on something you've already got (a cheat handing it back); false if you haven't got it. */
export function wear(id: string): boolean {
  const w = BY_ID.get(id), s = load();
  if (!w || !s.got.includes(id)) return false;
  s.worn[w.slot] = id;
  save(s);
  return true;
}

/** Add to one of your running counts (seagull poo, seconds of tummy time, deli shifts); returns the new total. */
export function count(what: string, by = 1): number {
  const s = load();
  s.n[what] = (s.n[what] ?? 0) + by;
  save(s);
  return s.n[what];
}

/** Note one more different thing of a kind (a pub you've been in); returns how many different ones in all. */
export function tally(what: string, key: string): number {
  const s = load(), seen = (s.seen ??= {}), list = (seen[what] ??= []);
  if (!list.includes(key)) { list.push(key); save(s); }
  return list.length;
}

/** What you're wearing, as it goes round: the ids, comma separated. */
export function myWear(): string {
  const s = load();
  return SLOTS.map((k) => s.worn[k]).filter((id): id is string => !!id && s.got.includes(id)).join(",");
}

/** What a hello says someone's wearing, one per slot, only things there are. */
export function parseWear(code: string): Wearable[] {
  const out: Wearable[] = [];
  for (const id of String(code).split(",").slice(0, 3)) {
    const w = BY_ID.get(id);
    if (w && !out.some((o) => o.slot === w.slot)) out.push(w);
  }
  return out;
}

// ---- what they look like ------------------------------------------------------------------------
// Built in the frames avatar.ts hangs them from. On the head: the neck at 0, the middle of the head
// at y 0.15, a ball 0.15 across, the face towards -z. On the back: the jacket's frame, the shoulders
// at y 0.52, either side at x ±0.22, the back at z 0.13.

const C = 0.15;
const cyl = (rt: number, rb: number, h: number, x = 0, y = 0, z = 0, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);

/** A seagull: white, grey wings with black tips, a yellow beak with a red spot, pink legs. Facing -z, sitting at 0. */
export function gullPieces(s = 1, y = 0, z = 0, head = "#f4f4f2"): Piece[] {
  const k = (g: THREE.BufferGeometry) => g.scale(s, s, s).translate(0, y, z);
  return [
    [k(ball(0.1, 0, 0.06, 0, 0.85, 0.75, 1.5)), "#f4f4f2"],
    [k(ball(0.06, 0, 0.14, -0.11)), head],
    [k(box(0.022, 0.018, 0.07, 0, 0.13, -0.19)), "#f2c230"],
    [k(box(0.024, 0.012, 0.014, 0, 0.12, -0.2)), "#d23a2a"],
    [k(ball(0.011, -0.04, 0.16, -0.14)), "#1b1b1d"],
    [k(ball(0.011, 0.04, 0.16, -0.14)), "#1b1b1d"],
    [k(box(0.03, 0.06, 0.2, -0.085, 0.08, 0.02)), "#9aa3ad"],
    [k(box(0.03, 0.06, 0.2, 0.085, 0.08, 0.02)), "#9aa3ad"],
    [k(box(0.032, 0.05, 0.07, -0.085, 0.09, 0.15)), "#1b1b1d"],
    [k(box(0.032, 0.05, 0.07, 0.085, 0.09, 0.15)), "#1b1b1d"],
    [k(box(0.07, 0.02, 0.1, 0, 0.06, 0.17)), "#f4f4f2"],
    [k(box(0.016, 0.06, 0.016, -0.035, -0.02, 0)), "#e79a8c"],
    [k(box(0.016, 0.06, 0.016, 0.035, -0.02, 0)), "#e79a8c"],
  ];
}

/** Blobs of seagull muck, on a surface facing up at height y. */
function splats(r: () => number, n: number, y: number, spread: number): Piece[] {
  const out: Piece[] = [];
  for (let k = 0; k < n; k++) {
    const x = (r() - 0.5) * spread, z = (r() - 0.5) * spread;
    out.push([ball(0.03 + r() * 0.02, x, y, z, 1, 0.35, 1), "#f6f6ee"], [ball(0.012, x + 0.02, y + 0.01, z, 1, 0.6, 1), "#d8d4b8"]);
  }
  return out;
}
const fixed = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

/** A peaked cap: the band, the crown, the peak, a stripe round it and a badge. */
function peakedCap(band: string, top: string, peak: string, stripe: string, badge: string): Piece[] {
  return [
    [cyl(0.165, 0.162, 0.07, 0, C + 0.11, 0, 16), band],
    [cyl(0.166, 0.166, 0.022, 0, C + 0.11, 0, 16), stripe],
    [cyl(0.2, 0.17, 0.045, 0, C + 0.165, 0.01, 16), top],
    [box(0.24, 0.016, 0.1, 0, 0, 0).rotateX(-0.25).translate(0, C + 0.08, -0.19), peak],
    [box(0.04, 0.035, 0.012, 0, C + 0.135, -0.172), badge],
  ];
}

/** The shape of a wearable, where it hangs (the head or the jacket), welded into one. */
export function wearGeometry(id: string): { geo: THREE.BufferGeometry; on: "head" | "body" } | null {
  const tweed = "#6e5a3e", tweedDark = "#4f402c";
  switch (id) {
    case "gull":
      return { on: "head", geo: part(gullPieces(1.35, C + 0.16, 0.01)) };
    case "splat":
      return { on: "head", geo: part([
        [cyl(0.165, 0.168, 0.06, 0, C + 0.1, 0.0, 16).scale(1, 1, 1.05), tweed],
        [cyl(0.15, 0.165, 0.05, 0, C + 0.145, 0.01, 16), tweedDark],
        [box(0.26, 0.018, 0.1, 0, C + 0.085, -0.19), tweedDark],
        ...splats(fixed(7), 4, C + 0.172, 0.18),
        [ball(0.014, 0.09, C + 0.12, -0.16, 0.8, 2.2, 0.8), "#f6f6ee"],
      ]) };
    case "cone":
      return { on: "head", geo: part([
        [box(0.3, 0.025, 0.3, 0, C + 0.12, 0), "#1b1b1d"],
        [cyl(0.03, 0.13, 0.42, 0, C + 0.34, 0, 14), "#f26a1b"],
        [cyl(0.075, 0.093, 0.08, 0, C + 0.35, 0, 14).scale(1.02, 1, 1.02), "#f4f4f2"],
      ]).rotateZ(0.12) };
    case "deer":
      return { on: "head", geo: part([
        [shell(0.17, 0, Math.PI * 2, 0.5 * Math.PI, C + 0.005, 0.0), tweed],
        [box(0.2, 0.018, 0.1, 0, C + 0.02, -0.19).rotateX(0), tweedDark],
        [box(0.2, 0.018, 0.1, 0, C + 0.02, 0.19), tweedDark],
        [box(0.02, 0.06, 0.1, -0.16, C + 0.12, 0), tweedDark],
        [box(0.02, 0.06, 0.1, 0.16, C + 0.12, 0), tweedDark],
        [ball(0.02, 0, C + 0.18, 0), tweedDark],
      ]) };
    case "halo":
      return { on: "head", geo: part([[new THREE.TorusGeometry(0.15, 0.022, 6, 22).rotateX(Math.PI / 2).translate(0, C + 0.32, 0), "#f2cf5b"]]) };
    case "toque":
      return { on: "head", geo: part([
        [cyl(0.162, 0.162, 0.08, 0, C + 0.1, 0, 16), "#f4f4f2"],
        [cyl(0.2, 0.15, 0.22, 0, C + 0.25, 0, 16), "#fbfbf8"],
        [ball(0.2, 0, C + 0.37, 0, 1.05, 0.55, 1.05), "#fbfbf8"],
      ]) };
    case "bonnet":
      return { on: "head", geo: part([
        [shell(0.175, 0, Math.PI * 2, 0.55 * Math.PI, C, 0.03), "#f6b6c8"],
        [new THREE.TorusGeometry(0.17, 0.03, 6, 18).rotateY(0).translate(0, C + 0.0, -0.06), "#fdf2f5"],
        [box(0.02, 0.16, 0.02, -0.1, C - 0.15, -0.06), "#f6b6c8"],
        [box(0.02, 0.16, 0.02, 0.1, C - 0.15, -0.06), "#f6b6c8"],
        [ball(0.035, 0, C - 0.23, -0.07, 1.6, 0.8, 0.8), "#f6b6c8"],
      ]) };
    case "specs":
      return { on: "head", geo: part([
        [new THREE.TorusGeometry(0.04, 0.009, 6, 14).translate(-0.055, C + 0.02, -0.152), "#1b1b1d"],
        [new THREE.TorusGeometry(0.04, 0.009, 6, 14).translate(0.055, C + 0.02, -0.152), "#1b1b1d"],
        [box(0.03, 0.01, 0.01, 0, C + 0.03, -0.152), "#1b1b1d"],
        [box(0.012, 0.01, 0.15, -0.15, C + 0.03, -0.08), "#1b1b1d"],
        [box(0.012, 0.01, 0.15, 0.15, C + 0.03, -0.08), "#1b1b1d"],
        [ball(0.034, 0, C - 0.02, -0.165, 1, 1.1, 1), "#f0a3a3"],
        [box(0.11, 0.028, 0.02, 0, C - 0.055, -0.152), "#1d1d20"],
        [box(0.11, 0.06, 0.012, 0, C + 0.075, -0.15), "#1d1d20"],
      ]) };
    case "shades":
      return { on: "head", geo: part([
        [box(0.09, 0.05, 0.012, -0.055, C + 0.02, -0.155), "#14161c"],
        [box(0.09, 0.05, 0.012, 0.055, C + 0.02, -0.155), "#14161c"],
        [box(0.25, 0.012, 0.012, 0, C + 0.045, -0.156), "#d23a2a"],
        [box(0.012, 0.012, 0.15, -0.15, C + 0.04, -0.08), "#d23a2a"],
        [box(0.012, 0.012, 0.15, 0.15, C + 0.04, -0.08), "#d23a2a"],
        [box(0.036, 0.055, 0.045, 0, C - 0.015, -0.158), "#ff7a6b"],
        [box(0.03, 0.02, 0.03, 0, C - 0.02, -0.18), "#f4f4f2"],
      ]) };
    case "owl":
      return { on: "body", geo: part([
        [ball(0.07, 0.2, 0.62, 0.0, 0.9, 1.3, 0.85), "#7a5536"],
        [ball(0.05, 0.2, 0.6, -0.04, 0.9, 1.1, 0.6), "#d9c29a"],
        [ball(0.055, 0.2, 0.74, 0, 1.1, 0.9, 0.95), "#7a5536"],
        [ball(0.022, 0.178, 0.75, -0.045), "#f2c230"],
        [ball(0.022, 0.222, 0.75, -0.045), "#f2c230"],
        [ball(0.01, 0.178, 0.75, -0.064), "#1b1b1d"],
        [ball(0.01, 0.222, 0.75, -0.064), "#1b1b1d"],
        [box(0.014, 0.02, 0.02, 0.2, 0.725, -0.055), "#c99a2a"],
        [box(0.02, 0.04, 0.02, 0.17, 0.8, 0), "#5e4028"],
        [box(0.02, 0.04, 0.02, 0.23, 0.8, 0), "#5e4028"],
      ]) };
    case "brolly": {
      const canopy = new THREE.ConeGeometry(0.42, 0.18, 8, 1, true).translate(0, 1.12, 0.3);
      return { on: "body", geo: part([
        [box(0.3, 0.32, 0.14, 0, 0.3, 0.2), "#3b4a5c"],
        [cyl(0.012, 0.012, 1.0, 0, 0.62, 0.3, 6), "#2a2a2a"],
        [canopy, "#22263a"],
        [ball(0.02, 0, 1.22, 0.3), "#2a2a2a"],
        ...splats(fixed(11), 6, 1.13, 0.5).map(([g, c]) => [g.translate(0, 0, 0.3), c] as Piece),
      ]) };
    }
    case "cat":
      return { on: "body", geo: part([
        [ball(0.09, -0.16, 0.6, 0.02, 1.4, 0.75, 0.85), "#e0893a"],
        [ball(0.065, -0.3, 0.63, -0.01), "#e0893a"],
        [new THREE.ConeGeometry(0.025, 0.05, 4).translate(-0.32, 0.7, -0.02), "#e0893a"],
        [new THREE.ConeGeometry(0.025, 0.05, 4).translate(-0.27, 0.7, -0.02), "#e0893a"],
        [ball(0.012, -0.33, 0.64, -0.065), "#2a7a3a"],
        [ball(0.012, -0.29, 0.64, -0.065), "#2a7a3a"],
        [ball(0.03, -0.12, 0.6, 0.08, 1, 0.8, 1), "#f4f0e6"],
        [box(0.035, 0.2, 0.035, -0.05, 0.48, 0.12).rotateZ(0), "#c46f26"],
      ]) };
    case "loaf":
      return { on: "body", geo: part([
        [box(0.3, 0.34, 0.14, 0, 0.3, 0.2), "#2f5a3a"],
        [box(0.3, 0.06, 0.16, 0, 0.47, 0.2), "#244a2f"],
        [cyl(0.045, 0.045, 0.75, 0, 0, 0, 10).rotateZ(-0.5).translate(0.1, 0.62, 0.2), "#d8a04e"],
        [box(0.02, 0.02, 0.06, 0.04, 0.75, 0.16).rotateZ(-0.5), "#b07a32"],
      ]) };
    case "crown": {
      const gold = "#f2c230", points: Piece[] = [];
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2, x = Math.sin(a) * 0.155, z = Math.cos(a) * 0.155;
        points.push([new THREE.ConeGeometry(0.035, 0.09, 4).translate(x, C + 0.205, z), gold], [ball(0.016, x, C + 0.255, z), "#fbe38e"]);
        points.push([ball(0.017, Math.sin(a + 0.52) * 0.165, C + 0.13, Math.cos(a + 0.52) * 0.165), k % 2 ? "#d23a2a" : "#2a6ad2"]);
      }
      return { on: "head", geo: part([[cyl(0.162, 0.158, 0.09, 0, C + 0.13, 0, 18), gold], [cyl(0.15, 0.15, 0.02, 0, C + 0.1, 0, 18), "#8a1c3a"], ...points]).rotateZ(-0.1) };
    }
    case "buscap":
      return { on: "head", geo: part(peakedCap("#26304a", "#26304a", "#1b1b1d", "#2f8a3a", "#f2c230")) };
    case "inspcap":
      return { on: "head", geo: part([...peakedCap("#14161c", "#14161c", "#0d0e10", "#d8b048", "#d8b048"),
        [box(0.22, 0.012, 0.012, 0, 0, 0).rotateX(-0.25).translate(0, C + 0.092, -0.236), "#d8b048"],   // braid along the peak
        [box(0.22, 0.012, 0.012, 0, 0, 0).rotateX(-0.25).translate(0, C + 0.1, -0.2), "#d8b048"]]) };
    case "cashbag":
      // a leather satchel at your hip on a strap over the shoulder, its flap buckled
      return { on: "body", geo: part([
        [box(0.1, 0.2, 0.24, 0.25, 0.02, 0), "#5a3a22"],
        [box(0.105, 0.08, 0.245, 0.25, 0.09, 0), "#4a2e1a"],
        [box(0.11, 0.03, 0.03, 0.25, 0.07, -0.08), "#c9a24a"],
        [box(0.04, 0.75, 0.012, 0, 0, 0).rotateZ(-0.62).translate(0.03, 0.34, -0.15), "#4a2e1a"],
        [box(0.04, 0.75, 0.012, 0, 0, 0).rotateZ(-0.62).translate(0.03, 0.34, 0.15), "#4a2e1a"],
      ]) };
    case "whistle":
      // a silver whistle in your mouth, on its chain
      return { on: "head", geo: part([
        [cyl(0.016, 0.016, 0.07, 0, 0, 0, 10).rotateX(Math.PI / 2).translate(0.02, C - 0.06, -0.19), "#d4d7da"],
        [ball(0.024, 0.02, C - 0.075, -0.215), "#d4d7da"],
        [box(0.012, 0.012, 0.012, 0.04, C - 0.1, -0.2), "#b9bcc0"], [box(0.012, 0.012, 0.012, 0.05, C - 0.14, -0.185), "#b9bcc0"],
        [box(0.012, 0.012, 0.012, 0.055, C - 0.18, -0.17), "#b9bcc0"], [box(0.012, 0.012, 0.012, 0.055, C - 0.22, -0.155), "#b9bcc0"],
      ]) };
    case "lockcap":
      return { on: "head", geo: part([...peakedCap("#f4f4f2", "#1d2438", "#14161c", "#1d2438", "#f2c230"),
        [box(0.2, 0.014, 0.014, 0, C + 0.115, -0.165), "#f2c230"]]) };
    case "clippie":
      return { on: "head", geo: part([
        ...peakedCap("#3a3f4a", "#3a3f4a", "#1b1b1d", "#8a1c3a", "#c9c9c9"),
        [box(0.17, 0.11, 0.12, 0, C + 0.25, 0.01), "#8a9096"],
        [box(0.15, 0.03, 0.1, 0, C + 0.32, 0.01), "#5d636a"],
        [box(0.02, 0.06, 0.02, 0.1, C + 0.27, 0.01), "#3a3a3a"],
        [ball(0.018, 0.1, C + 0.3, 0.01), "#d23a2a"],
        [box(0.06, 0.012, 0.02, -0.05, C + 0.27, -0.055), "#1b1b1d"],
        [box(0.05, 0.12, 0.004, -0.03, C + 0.2, -0.063).rotateZ(0.1), "#f6f0d8"],
        [box(0.012, 0.012, 0.13, -0.08, C + 0.21, -0.11), "#2a2a2a"],
      ]) };
    case "hood": {
      const plastic = "#dce7ee", spots: Piece[] = [];
      const r = fixed(5);
      for (let k = 0; k < 9; k++) {
        const a = -1.2 + r() * 2.4, b = 0.3 + r() * 0.9;
        spots.push([ball(0.016, Math.sin(a) * Math.sin(b) * 0.197, C + Math.cos(b) * 0.197, 0.02 + Math.cos(a) * Math.sin(b) * 0.197), ["#f07a9a", "#7ac2f0", "#f2c230"][k % 3]]);
      }
      return { on: "head", geo: part([
        // over the crown, and down round the back and sides, open at the face
        [shell(0.19, 0, Math.PI * 2, 0.32 * Math.PI, C, 0.02), plastic],
        [shell(0.19, -0.35, Math.PI + 0.7, 0.62 * Math.PI, C, 0.02), plastic],
        [new THREE.TorusGeometry(0.185, 0.016, 6, 18, Math.PI * 1.2).rotateZ(-0.1 * Math.PI).rotateY(-0.12).translate(0, C - 0.01, -0.03), "#c4d4de"],
        [box(0.016, 0.17, 0.016, -0.12, C - 0.15, -0.05), plastic],
        [box(0.016, 0.17, 0.016, 0.12, C - 0.15, -0.05), plastic],
        [ball(0.03, 0, C - 0.23, -0.07, 1.6, 0.7, 0.8), plastic],
        ...spots,
      ]) };
    }
    case "muffs":
      return { on: "head", geo: part([
        [new THREE.TorusGeometry(0.175, 0.014, 6, 18, Math.PI).translate(0, C, 0.01), "#6a6f78"],
        [ball(0.065, -0.17, C - 0.01, 0.01, 0.55, 1, 1), "#c8243a"],
        [ball(0.065, 0.17, C - 0.01, 0.01, 0.55, 1, 1), "#c8243a"],
        [ball(0.05, -0.19, C - 0.01, 0.01, 0.4, 0.9, 0.9), "#f4ecee"],
        [ball(0.05, 0.19, C - 0.01, 0.01, 0.4, 0.9, 0.9), "#f4ecee"],
      ]) };
    case "beret":
      return { on: "head", geo: part([
        [ball(0.19, 0.03, C + 0.11, 0.01, 1, 0.32, 1), "#1d1d22"],
        [cyl(0.155, 0.158, 0.03, 0, C + 0.085, 0, 16), "#141418"],
        [cyl(0.006, 0.01, 0.04, 0.03, C + 0.175, 0.01, 6), "#1d1d22"],
      ]).rotateZ(0.18) };
    case "party": {
      const stripes: Piece[] = [];
      for (let k = 0; k < 4; k++) {
        const y = C + 0.15 + k * 0.07, rr = 0.11 * (1 - (y - C - 0.1) / 0.32);
        stripes.push([cyl(rr + 0.004, rr + 0.012, 0.022, 0, y, 0, 12), ["#f2c230", "#2ab0d8"][k % 2]]);
      }
      return { on: "head", geo: part([
        [cyl(0.004, 0.11, 0.32, 0, C + 0.26, 0, 12), "#e8407a"],
        ...stripes,
        [ball(0.035, 0, C + 0.43, 0), "#fbfbf8"],
        [box(0.006, 0.26, 0.006, -0.1, C + 0.0, -0.05).rotateZ(0.08), "#f4f4f2"],
      ]).rotateZ(0.2).rotateX(-0.08) };
    }
    case "lplate":
      return { on: "head", geo: part([
        [box(0.16, 0.16, 0.012, 0, -0.15, -0.255), "#fbfbf8"],
        [box(0.035, 0.11, 0.014, -0.025, -0.145, -0.263), "#d8202a"],
        [box(0.08, 0.035, 0.014, 0.0, -0.185, -0.263), "#d8202a"],
        [box(0.006, 0.17, 0.006).rotateX(1.13).translate(-0.07, -0.035, -0.175), "#e8e0c8"],
        [box(0.006, 0.17, 0.006).rotateX(1.13).translate(0.07, -0.035, -0.175), "#e8e0c8"],
      ]) };
    case "dazzle": {
      const eye = (x: number): Piece[] => [
        [cyl(0.04, 0.04, 0.008, 0, 0, 0, 14).rotateX(Math.PI / 2).translate(x, C + 0.02, -0.15), "#fbfbf8"],
        [box(0.11, 0.014, 0.006, x, C + 0.02, -0.158), "#ffe44a"],
        [box(0.014, 0.11, 0.006, x, C + 0.02, -0.158), "#ffe44a"],
        [box(0.08, 0.012, 0.006, 0, 0, 0).rotateZ(Math.PI / 4).translate(x, C + 0.02, -0.159), "#fff9c8"],
        [box(0.08, 0.012, 0.006, 0, 0, 0).rotateZ(-Math.PI / 4).translate(x, C + 0.02, -0.159), "#fff9c8"],
      ];
      return { on: "head", geo: part([...eye(-0.055), ...eye(0.055), [ball(0.03, 0, C - 0.065, -0.14, 1, 0.8, 0.6), "#3a1418"]]) };
    }
    case "goggles": {
      const lens = (x: number): Piece[] => [
        [new THREE.TorusGeometry(0.036, 0.013, 6, 14).scale(1.15, 0.85, 1).translate(x, C + 0.02, -0.15), "#2a8ad8"],
        [cyl(0.034, 0.034, 0.01, 0, 0, 0, 14).rotateX(Math.PI / 2).scale(1.15, 0.85, 1).translate(x, C + 0.02, -0.152), "#9fe4f4"],
      ];
      return { on: "head", geo: part([...lens(-0.055), ...lens(0.055),
        [box(0.03, 0.012, 0.012, 0, C + 0.02, -0.152), "#2a8ad8"],
        [new THREE.TorusGeometry(0.152, 0.008, 4, 22).rotateX(Math.PI / 2).translate(0, C + 0.025, 0.005), "#1b1b1d"]]) };
    }
    case "guard":
      return { on: "head", geo: part([
        [ball(0.06, 0, C - 0.06, -0.142, 1.35, 0.55, 0.5), "#2ab0f0"],
        [box(0.1, 0.012, 0.01, 0, C - 0.058, -0.168), "#f4f4f2"],
        [box(0.02, 0.012, 0.03, 0, C - 0.07, -0.19), "#2ab0f0"],
      ]) };
    case "froth": {
      const r = fixed(13), foam: Piece[] = [];
      for (let k = 0; k < 9; k++) {
        const x = -0.08 + (k / 8) * 0.16, droop = Math.abs(x) * 0.35;
        foam.push([ball(0.02 + r() * 0.01, x, C - 0.035 - droop, -0.148 + Math.abs(x) * 0.25), k % 3 ? "#fbf6e6" : "#f0e2b8"]);
      }
      return { on: "head", geo: part([...foam, [ball(0.012, -0.03, C - 0.075, -0.15), "#fbf6e6"]]) };
    }
    case "monocle":
      return { on: "head", geo: part([
        [new THREE.TorusGeometry(0.042, 0.008, 6, 16).translate(-0.055, C + 0.02, -0.155), "#d8b048"],
        [cyl(0.04, 0.04, 0.004, 0, 0, 0, 14).rotateX(Math.PI / 2).translate(-0.055, C + 0.02, -0.156), "#cfe4ea"],
        [box(0.006, 0.006, 0.006, -0.09, C - 0.02, -0.15), "#d8b048"],
        [box(0.006, 0.006, 0.006, -0.105, C - 0.06, -0.14), "#d8b048"],
        [box(0.006, 0.006, 0.006, -0.115, C - 0.1, -0.125), "#d8b048"],
        [box(0.006, 0.006, 0.006, -0.12, C - 0.14, -0.11), "#d8b048"],
        [box(0.006, 0.006, 0.006, -0.12, C - 0.18, -0.1), "#d8b048"],
      ]) };
    case "sunblock": {
      const zinc = "#f8f8f4", cheek = (s: number): Piece[] => [
        [box(0.055, 0.014, 0.02).rotateY(s * 0.65).translate(s * 0.09, C - 0.03, -0.112), zinc],
        [box(0.055, 0.014, 0.02).rotateY(s * 0.65).translate(s * 0.087, C - 0.055, -0.108), zinc],
      ];
      return { on: "head", geo: part([...cheek(-1), ...cheek(1), [box(0.05, 0.014, 0.05, 0, C - 0.005, -0.16), zinc]]) };
    }
    case "orb":
      return { on: "body", geo: part([
        [ball(0.085, 0.21, 0.74, 0.02, 1.05, 0.9, 0.95), "#ff9fb3"],
        [ball(0.045, 0.255, 0.79, 0.04), "#ffc4cf"],
        [ball(0.03, 0.18, 0.69, -0.04), "#ff5a7a"],
        [new THREE.TorusGeometry(0.12, 0.006, 4, 20).rotateX(Math.PI / 2 - 0.3).translate(0.21, 0.74, 0.02), "#ff5a7a"],
      ]) };
    case "stick":
      return { on: "body", geo: part([
        [cyl(0.015, 0.015, 0.9, 0, 0, 0, 8).rotateZ(0.5).translate(0, 0.32, 0.17), "#6a4426"],
        [new THREE.TorusGeometry(0.05, 0.015, 6, 10, Math.PI).rotateZ(0.5).translate(-0.24, 0.73, 0.17), "#6a4426"],
        [cyl(0.018, 0.018, 0.03, 0, 0, 0, 8).rotateZ(0.5).translate(0.22, -0.07, 0.17), "#1b1b1d"],
        [box(0.04, 0.6, 0.012, 0, 0, 0).rotateZ(-0.7).translate(0, 0.3, 0.145), "#3a2a1e"],
      ]) };
    case "thermos": {
      const bag = "#d8c890", net: Piece[] = [];
      for (let k = 0; k < 4; k++) net.push([new THREE.TorusGeometry(0.068, 0.005, 4, 12).rotateX(Math.PI / 2).translate(0.12, 0.14 + k * 0.07, 0.24), bag]);
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; net.push([box(0.006, 0.25, 0.006, 0.12 + Math.sin(a) * 0.068, 0.24, 0.24 + Math.cos(a) * 0.068), bag]); }
      return { on: "body", geo: part([
        [cyl(0.055, 0.055, 0.24, 0.12, 0.25, 0.24, 12), "#b8262e"],
        [cyl(0.056, 0.056, 0.05, 0.12, 0.22, 0.24, 12), "#2a5a3a"],
        [cyl(0.056, 0.056, 0.02, 0.12, 0.29, 0.24, 12), "#f2c230"],
        [cyl(0.05, 0.05, 0.06, 0.12, 0.4, 0.24, 12), "#c9c9c9"],
        ...net,
        [box(0.012, 0.3, 0.012, 0, 0, 0).rotateZ(0.35).translate(0.07, 0.5, 0.2), bag],
      ]) };
    }
    case "rope": {
      const coil: Piece[] = [];
      // slung over one shoulder and under the other arm, wide enough to clear the jacket
      for (let k = 0; k < 3; k++) coil.push([new THREE.TorusGeometry(0.25 + k * 0.012, 0.022, 6, 28).rotateX(Math.PI / 2).scale(1.45, 1, 0.9).rotateZ(-0.85).translate(0.02, 0.3 + k * 0.012, 0.0), k === 1 ? "#2a6ad2" : "#f26a1b"]);
      return { on: "body", geo: part([...coil, [box(0.03, 0.03, 0.08, -0.17, 0.5, 0.16), "#c8c8c8"]]) };
    }
    case "pole":
      return { on: "body", geo: part([
        [cyl(0.016, 0.016, 2.0, 0, 0, 0, 8).rotateZ(Math.PI / 2 - 0.08).translate(0, 0.5, 0.2), "#c9a46a"],
        [cyl(0.03, 0.03, 0.06, 0, 0, 0, 8).rotateZ(Math.PI / 2 - 0.08).translate(-1.0, 0.42, 0.2), "#d23a2a"],
        [cyl(0.03, 0.03, 0.06, 0, 0, 0, 8).rotateZ(Math.PI / 2 - 0.08).translate(1.0, 0.58, 0.2), "#d23a2a"],
        [box(0.03, 0.03, 0.08, -0.12, 0.49, 0.16), "#3a3a3a"],
        [box(0.03, 0.03, 0.08, 0.12, 0.51, 0.16), "#3a3a3a"],
      ]) };
    case "lamp":
      return { on: "body", geo: part([
        [cyl(0.05, 0.055, 0.05, 0.14, 0.24, 0.22, 10), "#b08a3a"],
        [cyl(0.04, 0.04, 0.1, 0.14, 0.315, 0.22, 10), "#ffe08a"],
        [cyl(0.006, 0.006, 0.1, 0.14 - 0.042, 0.315, 0.22, 4), "#7a5a24"],
        [cyl(0.006, 0.006, 0.1, 0.14 + 0.042, 0.315, 0.22, 4), "#7a5a24"],
        [new THREE.ConeGeometry(0.05, 0.07, 10).translate(0.14, 0.4, 0.22), "#b08a3a"],
        [new THREE.TorusGeometry(0.022, 0.005, 4, 10).translate(0.14, 0.45, 0.22), "#7a5a24"],
        [box(0.03, 0.03, 0.08, 0.14, 0.47, 0.17), "#3a2a1e"],
        [box(0.035, 0.12, 0.01, 0.14, 0.52, 0.14), "#3a2a1e"],
      ]) };
    case "deck":
      return { on: "body", geo: part([
        [box(0.2, 0.62, 0.018, 0, 0.32, 0.2), "#1d1d22"],
        [box(0.2, 0.12, 0.018, 0, 0, 0).rotateX(-0.4).translate(0, 0.68, 0.222), "#1d1d22"],
        [box(0.2, 0.12, 0.018, 0, 0, 0).rotateX(0.4).translate(0, -0.04, 0.222), "#1d1d22"],
        [box(0.2, 0.6, 0.004, 0, 0.32, 0.21), "#e8407a"],
        [box(0.14, 0.03, 0.04, 0, 0.12, 0.23), "#8a9096"],
        [box(0.14, 0.03, 0.04, 0, 0.52, 0.23), "#8a9096"],
        ...[0.12, 0.52].flatMap((y): Piece[] => [-1, 1].map((s): Piece => [cyl(0.03, 0.03, 0.03, 0, 0, 0, 10).rotateZ(Math.PI / 2).translate(s * 0.085, y, 0.255), "#f2c230"])),
      ]).translate(0, -0.08, 0).rotateZ(0.2) };
    case "wsuit":
      // folded up on the back, in the open suit's colours (wingsuit.ts)
      return { on: "body", geo: part([
        [box(0.32, 0.4, 0.07, 0, 0.3, 0.17), "#e8452c"],
        [box(0.33, 0.03, 0.075, 0, 0.42, 0.17), "#f2c230"],
        [box(0.33, 0.025, 0.075, 0, 0.2, 0.17), "#26262c"],
        [box(0.04, 0.5, 0.02, -0.12, 0.3, 0.135), "#26262c"],
        [box(0.04, 0.5, 0.02, 0.12, 0.3, 0.135), "#26262c"],
      ]) };
    case "pigeon":
      return { on: "body", geo: part([
        [ball(0.075, -0.2, 0.65, 0.01, 0.9, 0.85, 1.35), "#8a909c"],
        [ball(0.045, -0.2, 0.72, -0.07, 0.95, 1.1, 0.9), "#5a7a6a"],
        [ball(0.04, -0.2, 0.71, -0.075, 1, 0.8, 0.9), "#7a5a8a"],
        [ball(0.042, -0.2, 0.78, -0.09), "#7a808c"],
        [box(0.014, 0.012, 0.035, -0.2, 0.775, -0.135), "#2a2a2a"],
        [ball(0.008, -0.2, 0.785, -0.118, 3.5, 1, 1), "#e0e0d8"],
        [ball(0.009, -0.228, 0.79, -0.1), "#f26a1b"],
        [ball(0.009, -0.172, 0.79, -0.1), "#f26a1b"],
        [box(0.035, 0.05, 0.14, -0.255, 0.67, 0.03), "#6e737e"],
        [box(0.035, 0.05, 0.14, -0.145, 0.67, 0.03), "#6e737e"],
        [box(0.012, 0.04, 0.06, -0.255, 0.665, 0.08), "#2a2a2e"],
        [box(0.012, 0.04, 0.06, -0.145, 0.665, 0.08), "#2a2a2e"],
        [box(0.08, 0.016, 0.1, -0.2, 0.64, 0.12), "#5a5e68"],
        [box(0.014, 0.04, 0.014, -0.22, 0.58, -0.01), "#d86a6a"],
        [box(0.014, 0.04, 0.014, -0.18, 0.58, -0.01), "#d86a6a"],
      ]) };
  }
  return null;
}

// ---- the wardrobe page --------------------------------------------------------------------------

let page: HTMLDivElement | null = null;
let shut: (() => void) | null = null;
/** Close the wardrobe if it's open (back to the game). */
export function closeWardrobe() { shut?.(); }
// Esc closes the wardrobe, back to the pause menu, before the game sees the key
addEventListener("keydown", (e) => {
  if (e.code === "Escape" && page) { e.stopImmediatePropagation(); e.preventDefault(); closeWardrobe(); }
}, true);
// the slot whose things are showing, kept between visits to the wardrobe
let tab: Slot = "head";
let preview: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; avatar: Avatar; raf: number } | null = null;

/** Open the wardrobe over the pause menu. changed: you've put something on or taken it off. */
export function openWardrobe(colour: string, seed: string, changed: () => void, closed: () => void) {
  if (page) return;
  page = document.createElement("div");
  page.id = "wardrobe";
  page.className = "overlay";
  page.innerHTML = `<div class="card tt wardcard">
    ${ttBar(PAGE.wardrobe)}${ttTitle("Wardrobe")}
    <div class="wardbody"><canvas class="wardview" width="280" height="520" aria-label="You, in what you're wearing"></canvas><div class="wardlist"></div></div>
    <div class="pubbar"><p class="hint wardcount"></p><button type="button" class="wardback">Back</button></div>
  </div>`;
  document.body.appendChild(page);
  const list = page.querySelector<HTMLDivElement>(".wardlist")!;
  const draw = () => {
    const s = load();
    page!.querySelector(".wardcount")!.textContent = `${s.got.length} of ${WEARABLES.length} found. Everyone you play with sees what you wear.`;
    const slot = tab, of = WEARABLES.filter((w) => w.slot === slot);
    list.innerHTML = `<div class="wardtabs" role="tablist">` + SLOTS.map((k) => {
      const all = WEARABLES.filter((w) => w.slot === k), n = all.filter((w) => s.got.includes(w.id)).length;
      return `<button type="button" role="tab" class="wardtab${k === slot ? " on" : ""}" aria-selected="${k === slot}" data-tab="${k}">${SLOT_NAMES[k]} <small>${n}/${all.length}</small></button>`;
    }).join("") + `</div><div class="wardrow">`
      + `<button type="button" class="wardtile${!s.worn[slot] ? " on" : ""}" data-slot="${slot}" data-id="">Nothing</button>`
      + of.map((w) => {
        const got = s.got.includes(w.id), on = s.worn[slot] === w.id;
        return got ? `<button type="button" class="wardtile${on ? " on" : ""}" data-slot="${slot}" data-id="${w.id}">${w.name}</button>`
          : `<button type="button" class="wardtile locked" disabled title="${w.how}">??? <small>${w.how}</small></button>`;
      }).join("") + `</div>`;
    preview?.avatar.setWear(myWear());
  };
  list.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>("button.wardtab");
    if (t) { tab = t.dataset.tab as Slot; draw(); return; }
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button.wardtile");
    if (!b || b.disabled) return;
    const s = load(), slot = b.dataset.slot as Slot, id = b.dataset.id ?? "";
    if (id) s.worn[slot] = id; else delete s.worn[slot];
    save(s);
    draw();
    changed();
  });
  const close = () => {
    if (preview) {
      cancelAnimationFrame(preview.raf);
      preview.renderer.dispose();
      preview.renderer.forceContextLoss();
      preview = null;
    }
    page?.remove();
    page = null;
    shut = null;
    closed();
  };
  shut = close;
  page.querySelector(".wardback")!.addEventListener("click", close);
  closeButton(page.querySelector<HTMLElement>(".wardcard")!, close);
  // you, turning round slowly, in what you've got on
  try {
    const canvas = page.querySelector<HTMLCanvasElement>(".wardview")!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#fff8ec", "#58606a", 2.2));
    const sun = new THREE.DirectionalLight("#ffffff", 1.6);
    sun.position.set(2, 4, -3);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(30, 280 / 520, 0.1, 20);
    // near enough that you stand the full height of the panel, with room over your head for a hat
    camera.position.set(0, 1.15, -4.1);
    camera.lookAt(0, 0.98, 0);
    // the picture drawn at the size the panel gives it, which grows with the list beside it
    const fit = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    new ResizeObserver(fit).observe(canvas);
    const avatar = new Avatar("", colour, seed);
    avatar.preview();
    scene.add(avatar.root);
    preview = { renderer, scene, camera, avatar, raf: 0 };
    const spin = (t: number) => {
      if (!preview) return;
      avatar.root.rotation.y = Math.sin(t / 1600) * 0.9;
      avatar.animateWear(t / 1000);
      renderer.render(scene, camera);
      preview.raf = requestAnimationFrame(spin);
    };
    preview.raf = requestAnimationFrame(spin);
  } catch { /* no preview, just the list */ }
  draw();
}
