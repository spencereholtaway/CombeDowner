// The treasure trail: a chain of clues across part of Bath, each one about a real place (a pub, a
// church, a park or garden, a square, a street), written from the place's name and what kind of
// place it is. Somewhere near each place there's a biscuit tin on a post: walk up and press E to
// open it and get the next clue. The last tin holds a spade, for the Bath Bun chest: its clue ends
// in paces to count from something in the street there ("from the post box, 14 paces south-west").
// Hold E to dig: in the wrong place there's a hole with a worm in it, which everyone sees and which
// fills itself in after half an hour; near the chest the spade hits wood. Then it wants lifting, by
// two of you holding E together (or a long heave on your own), coins burst out, and you get a
// rosette for your jacket that everyone can see. Where there's nothing to pace from, the chest is a
// mound to dig up with E, as it always was. Four clues on an easy trail, five on a medium one, six
// on a hard one.
//
// Nothing gives the answer away. A one-star riddle says roughly which way ("somewhere south of
// here"); from two stars there's no distance or compass at all, only the place, with letters
// missing, jumbled or as a cryptic hint ("where a sly red raider of bins drinks"). Now and then the
// riddle is a picture instead: a little inked sketch of the view from near the tin (snapshot.ts),
// taken once that part of Bath is loaded round you. No search circle comes up by itself, and none
// ever shrinks by itself: stuck, you can ask a local, three hints a tin (one for the chest), the
// first 45 seconds into a clue and then 20 seconds apart. The first E says what the hint gives and
// what it costs, and only a second E pays: a circle goes on the maps, off-centre, then smaller each
// time, and always with the tin (or the chest, or a plaque's true tin) well inside it. A hint there's
// nothing left to give for is never taken. Each tin is placed only once all of Bath round it is
// loaded, so it lands in the same spot on every screen, never in a building, a garden behind a wall
// or the water. The tin only shows within a few metres' walk and rattles when you're close. On
// medium and hard trails some legs have an empty decoy tin near the real one.
//
// It opens with a big splash (trailscreens.ts): what you're after, any clock, how the circle
// works, and the first clue large. The big map (or the Clue button on a touch screen) brings the
// clue back. It ends on the race results card (racescreens.ts) in the trail's gold.
//
// Together, there's no clock and no par: the trail is scored on elegance instead. Each leg is worth
// three brass stars, and you lose one for each hint from a local and one for opening a decoy or the
// wrong tin. The rosette comes from the total (gold for nine in ten of the stars, then silver, then
// bronze), and the end card lists how each leg went. A trail done together can't be lost, so it
// leaves no scar. A race keeps its clock and its par, and has a ghost rival, K: her time is the
// best anyone's done that trail on this device, or the par the first time. Beat her to the chest
// or she digs it up first, leaving a hole and a note for the rest of the day (scars.ts).
//
// Each trail mixes its legs, so it isn't the same thing over and over (after the walking game Big
// Walk's puzzles). Every tin has a three-wheel brass lock (lock.ts), and its code is read off the
// place round it (clues.ts): the house it stands at, the benches and bins in its park, the nearest
// shop sign. A wrong code jams it for ten seconds and costs a brass star. Besides the riddles there are:
// - Look legs: a street or place, and then, once that part of Bath is loaded round you, a house to
//   pick out there by eye ("the house with the teal door"), with the tin on its doorstep.
// - Bearings: two look-outs (picked from the lie of the land, each with a clear view down to the
//   tin). Stood at one, you see a gold line on the ground running towards the tin and on past it;
//   the tin is where the lines cross. Each line you see is pencilled on your own map.
// - Sketch maps: a riddle to the place, and a rough inked sketch of 250 m round it with an X on it
//   (sketch.ts), turned round and with no north arrow on hard trails. With friends only the
//   map-holder sees it, full screen while they hold use (or the Clue button), with no big map meanwhile,
//   and talks the others in; one map-holder for every two of you, picked by the room's ids in
//   order, each with their own torn strip of it. On your own, you hold it.
// - Split clues: the place's name in two halves, alternate letters each. With friends each of you
//   has one half on your own screen, so you have to talk; the other half is also pinned to a post a
//   way off, for anyone on their own.
// - Sounds: no name at all, just a church bell or a busker's tune from where the tin is, carried
//   across the town, to follow by ear.
// - Plaques: a plaque by the place has a little table on it ("Not the gold lid", "Not BADGER") and
//   round the corner, out of sight of it, stand several tins: the table rules out all but one. One
//   reads, the others open; on your own, you walk back and forth.
// - Twin tins: open both within 30 seconds of each other with friends, or on your own with just
//   long enough to get from one to the other quickly (ride if you can).
//
// More players make more to tell each other, not harder tins. Whoever takes the trail on says how
// many there are, and from that:
// - one leg in every two players' worth gives each of you something different to know (a sketch
//   map, a bearing, a split clue, a plaque): one such leg alone, two for two or three of you, three
//   for four or five;
// - a sketch map has one map-holder for every two of you, each holding a torn strip of it;
// - a plaque has one more tin and one more row in its table for every two players (up to five tins);
// - with four or more, a bearing has three look-outs, not two.
// Every one of those works on your own too: you hold the sketch, climb both hills, read both halves,
// walk to and fro.
//
// Two ways to play, set on the poster: together, where anyone's find moves everyone on and the
// brass stars are the team's, and a race, where everyone has their own copy of the trail and first
// to the chest wins. One trail on the noticeboards each day is the trail of the day, the same for
// everyone in every room, with your best brass stars kept on this device.
//
// Who decides what: the trail comes from the poster's seed, so everyone has the same one, and where
// each tin stands comes from the seed and the map too. Opening a tin goes round as "tin" (and half
// of a pair of twin tins as "half"), from whoever opened it; whoever opens a tin says if the next
// leg is twin tins. Digging a hole goes round as "hole", hitting the chest as "found", and taking
// hold of it or letting go as "lift": whichever of two holding it has the lower id calls it lifted.
// Asking a local, jamming a lock and opening a decoy go round as "el", so together
// everyone's stars and circles agree (each circle is worked out from how many hints the leg's had,
// round the tin's own spot, which every screen works out alike). Getting up to a look-out goes round as "saw", so everyone's card says who's
// seen which line, but the line is only ever drawn for whoever is stood up there; which half of a
// split clue you hold comes from the room's ids in order. How many took the trail on goes round in
// its progress (with the poster, to anyone who joins). Nobody needs the host for any of it. K runs on
// each racer's own clock. Rosettes are kept on your device and go round in your hello (game.ts),
// for others to draw on your jacket.
import * as THREE from "three";
import * as SFX from "./audio";
import { dayNumber } from "./daylight";
import { streetSpot } from "./haunts";
import { PATHS } from "./map";
import { snapshot } from "./snapshot";
import { summary } from "./racescreens";
import { callout, clueCard, offer, splash, trailScreensDown } from "./trailscreens";
import { type Fact, type House, countsIn, houseNear, loadedRound, placeAt, shopNear } from "./clues";
import { Lock } from "./lock";
import { drawSketch } from "./sketch";
import { HOLD_MS as HOLD_USE, isKey } from "./controls";
import { type Card, type Job, type Offer, type PostSpot, type QuestWorld, type Rng, compassWord, esc, far, hash, pickOf, registerJob, rng, shuffled } from "./quests";

const COLOUR = "#e0a526";
const RINGS = [130, 75, 40];              // the circle's radii, a step smaller with each hint from a local
const RING_SHOWN = 150;                   // the circle's edge glows on the ground within this many metres
const GLINT_NEAR = 12;                    // the tin only glints this close
const TIN_NEAR = 40;                      // and isn't even put up until you're this close
const LISTEN_NEAR = 200;                  // the tin can be heard from inside an asked-for circle, at most this far
const LAST_RING = 180;                    // the chest's circle is big, and never shrinks
const PAR_PACE = 5.4;                     // a race's par assumes a brisk walk with some sprinting
const PAR_SEARCH = 55;                    // and a short look about per clue
const SILVER = 1.15;                      // silver's par and a bit
const WALK_PACE = 4.5;                    // metres a second along the streets, for spacing the legs
const ASK_AFTER = 45;                     // seconds on a clue before you can ask a local
const ASK_AGAIN = 20;                     // and between asks
const ASK_CONFIRM = 6;                    // seconds to press E again and pay, once a local's offered
const SETTLE = 120;                       // a tin's only placed once this much of Bath round it is loaded
const CLUE_UP = 12;                       // seconds the clue stays up when you ask to see it again
const RING_MARGIN = 12;                   // a tin is always at least this far inside its circle
// how far a tin can end up from where it was aimed, as spotOf, pacing and wordList place them
const STREET_REACH = 48, LOOK_REACH = 170, WORD_REACH = 142, PACE_REACH = 98;
const STARS = 3;                          // brass stars a leg is worth
const GOLD_SHARE = 0.9, SILVER_SHARE = 0.65;   // of all the brass stars, for a gold or silver rosette
const OPEN = 2.6;                         // how close to open a tin
const TWIN_WINDOW = 30;                   // seconds to open the second of twin tins
const SEARCH = 90;                        // seconds of looking about per clue, in the spacing
const TRAIL_TIME = 900;                   // what a trail aims to take, seconds
const PICTURE_NEAR = 700;                 // a picture clue is drawn once you're this close
const THEMES = ["Pubs", "Parks and places", "A bit of everything", "Streets and squares"] as const;
const DAILY = 8;                          // in the poster's mode: the trail of the day
const VIEW_AT = 40;                       // how close to a look-out to see its line
const SAW_AT = 30;                        // and to count as having been up there
const LINE_PAST = [120, 260];             // a bearing's line runs on past the tin this far, so its end gives nothing away
const NOTE_AWAY = 140;                    // the other half of a split clue is pinned up this far along the way
const READ_AT = 5;                        // and can be read this close
const PLAQUE_NEAR = 70;                   // a word leg's plaque is put up this close
const SOUND_EVERY = 4;                    // seconds between the bell's tolls, or the busker's tune
const CLOSE_RATTLE = 30;                  // the tin rattles this close
const DIG = 2;                            // seconds of digging for a hole
const DIG_NEAR = 4;                       // a hole this near the chest finds it: paces are only roughly a metre
const LIFT_TWO = 1.2, LIFT_ONE = 5, LIFT_ALONE = 15;   // seconds to lift the chest: two of you, on your own, or alone while friends are elsewhere
const HOLE_LIFE = 30 * 60 * 1000;         // a wrong hole fills itself in after half an hour
const PACE_KINDS: [string, string][] = [["postbox", "the post box"], ["bench", "the bench"], ["info", "the bus stop"], ["bin", "the bin"], ["lamp", "the lamp post"]];
const LOOK_NEAR = 10;                     // a look leg's tin, on a doorstep, only shows this close
const TWIN_SOLO_PACE = 6;                 // on your own, twin tins give you time to get from one to the other at this many metres a second
const K_SLOW = 1.1;                       // K's first go at a trail: a bit over the par
// plain words anyone can read off a plaque, with nothing to do with any one town
const WORDS = ["LANTERN", "BISCUIT", "OTTER", "THIMBLE", "PUDDLE", "BADGER", "TEAPOT", "WALNUT", "PEBBLE", "KIPPER",
  "MARBLE", "SPROUT", "TRUMPET", "WHISKER", "CRUMPET", "ACORN", "COBBLE", "SPARROW", "TUFFET", "GIBLET"];
/** The lids a word leg's tins can have, by name and colour. */
const WORD_TINS: [string, string][] = [["gold", "#d9b143"], ["silver", "#c9ced6"], ["red", "#c23b2e"], ["white", "#efe9dc"], ["blue", "#2f6fb3"]];
const ROSETTE_KEY = "cd-rosettes";
const DAILY_KEY = "cd-trail-daily-stars";
const K_KEY = "cd-trail-k";                // the best race time on each trail, for K

type Kind = "pub" | "church" | "rest" | "green" | "garden" | "square" | "street" | "place";
interface Spot { n: string; x: number; z: number; kind: Kind; rating: number | null }
/** What a leg asks of you: a riddle, a look-out, a clue in two halves, a sound to follow, or a word to read. */
type Step = "riddle" | "bearing" | "split" | "sound" | "word" | "look" | "sketch";
/** The legs that give different players different things to know. */
const ASYMMETRIC: Step[] = ["sketch", "bearing", "split", "word"];
interface Leg extends Spot {
  tx: number; tz: number;                 // roughly where its tin is (the map picks the exact spot)
  d: number;                              // how far the leg is
  decoy: boolean;                         // an empty decoy tin stands in the circle too
  pic: boolean;                           // a picture clue, once you're near enough
  twin: (Spot & { tx: number; tz: number }) | null;   // a second place, for twin tins
  step: Step;
  hills: Spot[];                          // a bearing leg's look-outs, each with a line towards the tin
  word: string;                           // a word leg's word, on the real tin
  tins: number;                           // and how many tins stand round its plaque
  sketch: { cx: number; cz: number; turn: number } | null;   // a sketch leg's patch: its middle, and how it's turned
}

// ---- souvenirs ----------------------------------------------------------------------------------

/** Your rosettes from trails, as a letter each (g, s, b), best first, at most three. */
export function myRosettes(): string {
  try { return (localStorage.getItem(ROSETTE_KEY) ?? "").replace(/[^gsb]/g, "").slice(0, 3); } catch { return ""; }
}
function addRosette(medal: "gold" | "silver" | "bronze") {
  const order = "gsb", all = [...myRosettes(), medal[0]].sort((a, b) => order.indexOf(a) - order.indexOf(b)).slice(0, 3).join("");
  try { localStorage.setItem(ROSETTE_KEY, all); } catch { /* ignore */ }
}
/** Your best brass stars on today's trail of the day. */
function dailyBest(day: number): number | null {
  try { const d = JSON.parse(localStorage.getItem(DAILY_KEY) ?? "null"); return d?.day === day && Number.isFinite(d.best) ? d.best : null; } catch { return null; }
}
/** The best race time on a trail on this device, for K to run to. */
function kBest(seed: number): number | null {
  try { const d = JSON.parse(localStorage.getItem(K_KEY) ?? "{}"); return Number.isFinite(d?.[seed]) ? d[seed] : null; } catch { return null; }
}
function setKBest(seed: number, secs: number) {
  try {
    const d = JSON.parse(localStorage.getItem(K_KEY) ?? "{}") ?? {};
    if (!Number.isFinite(d[seed]) || secs < d[seed]) d[seed] = Math.round(secs);
    const keys = Object.keys(d);
    if (keys.length > 40) delete d[keys[0]];
    localStorage.setItem(K_KEY, JSON.stringify(d));
  } catch { /* ignore */ }
}
const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;

// ---- where trails go ----------------------------------------------------------------------------

/** What kind of place a name sounds like. */
function kindOf(name: string): Kind {
  if (/churchyard|cemetery|burial/i.test(name)) return "rest";
  if (/church|chapel|abbey|minster|cathedral|priory/i.test(name)) return "church";
  if (/garden/i.test(name)) return "garden";
  if (/park|green|common|field|recreation|meadow|wood|playing|allotment|\brec\b/i.test(name)) return "green";
  if (/square|circus|crescent|parade|terrace|buildings|\bplace$/i.test(name)) return "square";
  return "place";
}
const STREETY = /\b(road|street|lane|hill|way|avenue|walk|close|row|drive|grove|rise|view|place|terrace|crescent|gardens|vale|mead)$/i;

const streetsOf = new WeakMap<object, Spot[]>();
/** Every named street in the city: one spot on each, part way along. */
function streets(w: QuestWorld): Spot[] {
  const had = streetsOf.get(w.map);
  if (had) return had;
  const out: Spot[] = [], byName = new Map<string, Spot[]>();
  for (const r of [...w.map.d.rd, ...w.map.wide?.rd ?? []]) {
    if (!r.n || r.n.length < 6 || PATHS.has(r.c) || r.c === "service" || r.p.length < 2 || !STREETY.test(r.n)) continue;
    const m = r.p[Math.floor(r.p.length / 2)], x = m[0], z = -m[1];
    const same = byName.get(r.n) ?? byName.set(r.n, []).get(r.n)!;
    if (same.some((o) => Math.hypot(o.x - x, o.z - z) < 400)) continue;
    const s: Spot = { n: r.n, x, z, kind: "street", rating: null };
    same.push(s); out.push(s);
  }
  streetsOf.set(w.map, out);
  return out;
}

/** Is there a clear line over the lie of the land from look-out (ax, az) down to (bx, bz)? */
function sightline(hgt: (x: number, z: number) => number, ax: number, az: number, bx: number, bz: number) {
  const h0 = hgt(ax, az) + 3, h1 = hgt(bx, bz) + 1;
  for (let k = 2; k < 30; k++) {
    const f = k / 31, x = ax + (bx - ax) * f, z = az + (bz - az) * f;
    if (hgt(x, z) > h0 + (h1 - h0) * f - 1.5) return false;
  }
  return true;
}

/** The nearest point on a street to scene (x, z), within r, from the maps every player has whole. */
function onStreet(w: QuestWorld, x: number, z: number, r: number): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null, bd = r;
  for (const rd of [...w.map.d.rd, ...w.map.wide?.rd ?? []]) {
    if (PATHS.has(rd.c) || rd.p.length < 2) continue;
    for (let i = 1; i < rd.p.length; i++) {
      const a = rd.p[i - 1], b = rd.p[i];
      if (Math.abs(a[0] - x) > r + 400 || Math.abs(-a[1] - z) > r + 400) continue;
      const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (-z - a[1]) * ey) / l2));
      const px = a[0] + ex * t, pz = -(a[1] + ey * t), d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = { x: px, z: pz }; }
    }
  }
  return best;
}

/** The look-outs for a bearing leg to (tx, tz): high places that can see down to it, from
 *  different enough ways that their lines cross well; three for a bigger room. */
function hillsFor(tx: number, tz: number, lookouts: Spot[], hgt: (x: number, z: number) => number, want: number, not: string): Spot[] {
  const below = hgt(tx, tz), way = (p: Spot) => Math.atan2(p.x - tx, p.z - tz);
  const apart = (a: number, b: number, lo: number, hi: number) => { const d = Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI); return d >= lo && d <= hi; };
  const cands = lookouts.filter((p) => {
    const d = Math.hypot(p.x - tx, p.z - tz);
    return p.n !== not && d > 150 && d < 800 && hgt(p.x, p.z) - below > 12 && sightline(hgt, p.x, p.z, tx, tz);
  }).sort((a, b) => hgt(b.x, b.z) - hgt(a.x, a.z) || a.n.localeCompare(b.n));
  const out: Spot[] = [];
  for (const p of cands) {
    if (out.length >= want) break;
    if (out.every((q) => q.n !== p.n && apart(way(p), way(q), out.length === 1 ? 0.7 : 0.5, out.length === 1 ? 2.45 : Math.PI))) out.push(p);
  }
  return out.length >= 2 ? out : [];
}

/** The trail from the poster's seed: where each tin is and what kind of clue leads there. pc: how
 *  many players took it on, which sets how many legs give each of them something different to do. */
function trailOf(o: Offer, w: QuestWorld, pc: number): { theme: string; legs: Leg[]; par: number } {
  const r = rng(o.seed), theme = THEMES[((o.mode ?? 0) >> 1) & 3] ?? THEMES[2];
  const ok = (x: number, z: number) => w.map.fieldEdge(x, z) > 100;
  const pubs: Spot[] = w.pubs().filter((p) => ok(p.x, p.z)).map((p) => ({ n: p.name, x: p.x, z: p.z, kind: "pub", rating: p.rating }));
  const places: Spot[] = w.places().filter((p) => ok(p.x, p.z) && p.n.length >= 5).map((p) => ({ ...p, kind: kindOf(p.n), rating: null }));
  const roads = theme === "Streets and squares" || theme === "A bit of everything" ? streets(w).filter((p) => ok(p.x, p.z)) : [];
  const pool = (theme === "Pubs" ? pubs : theme === "Parks and places" ? places
    : theme === "Streets and squares" ? [...roads, ...places.filter((p) => p.kind === "square")]
    : [...pubs, ...places, ...roads.filter(() => r() < 0.15)])
    .sort((a, b) => a.x - b.x || a.z - b.z || a.n.localeCompare(b.n));
  const n = o.legs ?? 3 + o.stars, legs: Leg[] = [], used = new Set<string>();
  // the lie of the land from the city-wide map, which every player has whole, so everyone picks the same look-outs
  const hgt = (x: number, z: number) => (w.map.wide ?? w.map).ground(x, z);
  const lookouts = [...pubs, ...places].filter((p) => p.kind !== "street");
  // the legs between the first and the chest: the more of you, the more of them give each of you something different to know
  const first = o.stars === 1 ? 1 : 0, slots = Math.max(0, n - 1 - first), asym = Math.min(slots, 1 + Math.floor(pc / 2));
  const asymSlots = new Set(shuffled(r, Array.from({ length: slots }, (_, k) => k + first)).slice(0, asym));
  const asymDeck = shuffled(r, ASYMMETRIC), plainDeck = shuffled(r, ["look", "sound", "riddle", "look", "riddle"] as Step[]);
  const free = (p: Spot) => !used.has(p.n) && !legs.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 200);
  let at = { x: o.x, z: o.z }, par = 0;
  for (let k = 0; k < n; k++) {
    const v = WALK_PACE;
    const ideal = Math.max(260, (TRAIL_TIME / n - SEARCH) * v);
    const within = (lo: number, hi: number) => pool.filter((p) => { const d = Math.hypot(p.x - at.x, p.z - at.z); return d > lo && d < hi && free(p); });
    let cands = within(Math.max(200, ideal * 0.6), Math.min(1500, ideal * 1.5));
    if (!cands.length) cands = within(200, 1600);
    if (!cands.length) break;
    const next = cands[Math.floor(r() * cands.length)];
    const d = Math.hypot(next.x - at.x, next.z - at.z);
    // the tin's somewhere near the place, not on it (on a street, along it)
    const a = r() * Math.PI * 2, off = next.kind === "street" ? 4 : 8 + r() * 20;
    let tx = next.x + Math.cos(a) * off, tz = next.z + Math.sin(a) * off;
    let step: Step = k === n - 1 || k < first ? "riddle" : asymSlots.has(k) ? asymDeck.shift() ?? plainDeck.shift() ?? "riddle" : plainDeck.shift() ?? "riddle";
    let hills: Spot[] = [];
    let sketch: Leg["sketch"] = null;
    if (step === "bearing" || step === "sketch") {
      // the tin stands on a street: exactly where the look-outs' lines cross, or under the X
      const st = onStreet(w, tx, tz, 60);
      if (st) { tx = st.x; tz = st.z; }
      if (step === "bearing" && st) hills = hillsFor(tx, tz, lookouts, hgt, pc >= 4 ? 3 : 2, next.n);
      if (step === "bearing" && hills.length < 2) step = "riddle";
      const sa = r() * Math.PI * 2, sf = 20 + r() * 50;
      if (step === "sketch") sketch = st ? { cx: tx + Math.cos(sa) * sf, cz: tz + Math.sin(sa) * sf, turn: o.stars >= 3 ? Math.floor(r() * 4) : 0 } : null;
      if (step === "sketch" && !sketch) step = "riddle";
    }
    const word = step === "word" ? pickOf(r, WORDS) : "";
    const pic = step === "riddle" && o.stars >= 2 && k < n - 1 && r() < 0.4;
    let twin: Leg["twin"] = null;
    if (step === "riddle" && k > 0 && k < n - 1 && r() < 0.5) {
      const near = pool.filter((p) => p !== next && free(p) && Math.hypot(p.x - next.x, p.z - next.z) > 150 && Math.hypot(p.x - next.x, p.z - next.z) < 450);
      if (near.length) {
        const t = near[Math.floor(r() * near.length)], ta = r() * Math.PI * 2;
        twin = { ...t, tx: t.x + Math.cos(ta) * 10, tz: t.z + Math.sin(ta) * 10 };
        used.add(t.n);
      }
    }
    legs.push({ ...next, tx, tz, d, decoy: step === "riddle" && o.stars >= 2 && k < n - 1 && !twin && r() < 0.45, pic, twin, step, hills, word,
      tins: Math.min(WORD_TINS.length, 3 + Math.floor(pc / 2)), sketch });
    used.add(next.n);
    const walk = hills.length ? Math.hypot(hills[0].x - at.x, hills[0].z - at.z) + Math.hypot(hills[1].x - hills[0].x, hills[1].z - hills[0].z) + Math.hypot(hills[1].x - tx, hills[1].z - tz) : d;
    par += walk / PAR_PACE + PAR_SEARCH;
    at = next;
  }
  return { theme, legs, par };
}

// ---- riddles ------------------------------------------------------------------------------------

/** The name with some of its letters missing: "S _ D N _ Y   G A R D _ N S". */
function gaps(name: string, r: Rng) {
  return name.toUpperCase().split(/\s+/).map((wd) => [...wd].map((c, k) => (/[A-Z]/.test(c) && k > 0 && r() < 0.4 ? "_" : esc(c))).join(" ")).join("&nbsp;&nbsp;&nbsp;");
}
/** The name's letters jumbled, word by word. */
function anagram(name: string, r: Rng) {
  return name.toUpperCase().split(/\s+/).map((wd) => {
    let s = wd;
    for (let t = 0; t < 6 && (s === wd || wd.length < 3); t++) s = shuffled(r, [...wd]).join("");
    return s;
  }).join(" ");
}

/** Cryptic stand-ins for words that turn up in pub names. */
const CRYPTIC: Record<string, string> = {
  fox: "a sly red raider of bins", crown: "the thing a queen wears", king: "a man in a crown", queen: "a woman in a crown",
  bell: "something that rings for church", lion: "the king of the jungle", swan: "a white bird gliding down the Avon",
  bear: "a big brown fan of honey", horse: "something that wears shoes but no socks", rose: "a red flower with thorns",
  star: "something that twinkles", hare: "the one who lost to the tortoise", lamb: "a woolly baby", raven: "a big black bird",
  ram: "a sheep with curly horns", moon: "something made of cheese, they say", sun: "something that rises in the east",
  ship: "something that sails", anchor: "what stops a boat drifting", keys: "what opens doors", plough: "what turns a field over",
  oak: "a tree full of acorns", grapes: "what wine is made from", hat: "something you wear on your head", boat: "something that floats",
  castle: "a king's stone house", wheatsheaf: "a bundle of harvest", huntsman: "someone in a red coat with hounds",
  cricketers: "a team dressed in white", volunteer: "someone who didn't have to", coach: "something pulled by horses",
  dragon: "something that breathes fire", george: "the saint who fought a dragon", eagle: "a bird with a hooked beak",
  griffin: "half eagle, half lion", pig: "something that oinks", cow: "something that moos", goat: "something that eats anything",
  owl: "a bird up all night", cat: "something that purrs", dog: "something that wags", fiddle: "a violin at a ceilidh",
  barrel: "where beer lives", chequers: "a board for draughts", forester: "someone who looks after trees",
  gardeners: "people with green fingers", pelican: "a bird with a big beak to keep its fish in", hop: "what gives beer its bite",
  pole: "a long stick", bunch: "a handful of grapes", huntsmen: "riders in red coats", rummer: "a big old drinking glass",
};
/** Words that say what a place is, rather than which one. */
const PLAIN = /^(the|inn|arms|tavern|hotel|bar|pub|house|tap|park|gardens?|church|chapel|abbey|square|road|street|lane|hill|way|avenue|walk|close|row|drive|grove|rise|view|place|terrace|crescent|circus|parade|green|field|common|recreation|ground|and|&|of|at|on|playing|fields|wood|meadow|cemetery|churchyard|buildings|vale|mead|rooms|kitchen|club|bistro|cafe|social)$/i;

/** The words of a name that pick it out: "Hadley" from "The Hadley Arms", "Mary" from "St Mary's Church". */
function keyOf(name: string): { key: string; saint: boolean } {
  const saint = name.match(/\b(?:St\.?|Saint)\s+([A-Z][\w'-]*)/);
  if (saint) return { key: saint[1].replace(/'s$/i, ""), saint: true };
  const words = name.split(/\s+/).filter((wd) => !PLAIN.test(wd));
  return { key: (words.length ? words : name.split(/\s+/)).join(" "), saint: false };
}

/**
 * The riddle that leads from (fx, fz) to s. hard: 0 says the name plainly, 1 with letters missing, 2
 * jumbled or cryptic. vague: a one-star trail, which says roughly which way and no more. Places
 * that don't fit a kind get the old missing-letters, first-letter and anagram clues.
 */
function riddle(s: Spot, fx: number, fz: number, hard: number, vague: boolean, r: Rng): string {
  return riddleText(s, hard, vague ? `Somewhere ${compassWord(s.x - fx, s.z - fz)} of here.` : "", r).replace(/\s+$/, "").replace(/<br>$/, "");
}
function riddleText(s: Spot, hard: number, where: string, r: Rng): string {
  const { key, saint } = keyOf(s.n);
  const plain = s.n.replace(/^the\s+/i, "");
  const rest = plain.replace(key, "").replace(/\s+/g, " ").replace(/^St\.?\s+'?s?\s*/i, "").trim();
  const show = hard === 0 ? `<b>${esc(key)}</b>` : hard === 1 ? `<b class="clue">${gaps(key, r)}</b>` : `<b class="clue">${esc(anagram(key, r))}</b> (jumbled)`;
  const named = `${show}${rest ? ` ${esc(rest)}` : ""}`;
  const pick = (...t: string[]) => pickOf(r, t);
  switch (s.kind) {
    case "pub": {
      const odd = key.toLowerCase().split(/\s+/).map((wd) => CRYPTIC[wd.replace(/'?s$/, "")] ?? CRYPTIC[wd]).find(Boolean);
      if (hard === 2 && odd) return `Look for the sign of ${odd}, and order a pint. ${where}`;
      const rated = hard > 0 && s.rating !== null ? ` Rated ${s.rating} for food hygiene.` : "";
      return pick(`Where the ${named} crowd drinks. ${where}`, `Thirsty work. Your next pint's at the ${named}. ${where}`,
        `Last orders at the ${named}! ${where}`, `Follow your nose to the beer garden of the ${named}. ${where}`) + rated;
    }
    case "church":
      return saint ? pick(`Bells ring for Saint ${show}. ${where}`, `Saint ${show} keeps a pew warm for you. ${where}`)
        : pick(`Pews, bells and a quiet porch: ${named}. ${where}`, `Hymn books at the ready at ${named}. ${where}`);
    case "rest":
      return pick(`The quietest neighbours in Bath, at ${named}. ${where}`, `Tread softly round ${named}. ${where}`);
    case "green":
      return pick(`Dogs, frisbees and a bench with a plaque: ${named}. ${where}`, `Grass stains guaranteed at ${named}. ${where}`,
        `Where the pigeons have their picnics: ${named}. ${where}`);
    case "garden":
      return pick(`Roses, a bench in the shade and a sign saying keep off: ${named}. ${where}`, `Mind the flowerbeds in ${named}. ${where}`);
    case "square":
      return /crescent/i.test(s.n) ? `Bath stone shaped like a slice of the moon: ${named}. ${where}`
        : /circus/i.test(s.n) ? `No clowns here, just a ring of grand houses: ${named}. ${where}`
        : pick(`Bath stone all round and pigeons in the middle: ${named}. ${where}`, `Somewhere to promenade in your best hat: ${named}. ${where}`);
    case "street":
      return pick(`Walk the length of ${named}. ${where}`, `A tin's tied to a post on ${named}. ${where}`, `Put your best foot down ${named}. ${where}`);
    default:
      if (hard === 0) return `<b class="clue">${gaps(s.n, r)}</b><br>${where}`;
      if (hard === 1) return `A place beginning with <b>${esc(s.n[0].toUpperCase())}</b>. ${where}`;
      return `<b class="clue">${esc(anagram(s.n, r))}</b> (jumbled)<br>${where}`;
  }
}

// ---- the job ------------------------------------------------------------------------------------

let dailyDay = -1;   // the day whose trail of the day has been put up

/** The poster's words for a trail, from its legs; false if there are too few legs for it to be one. */
function write(o: Offer, w: QuestWorld, daily: boolean): boolean {
  const mode = o.mode ?? 0, day = dayNumber();
  const t = trailOf(o, w, 1);
  if (t.legs.length < (o.legs ?? 3 + o.stars)) return false;
  const race = mode & 1;
  o.title = daily ? "Trail of the day" : o.title || `${race ? "Trail race" : "Trail"}: ${t.theme}`;
  const best = daily ? dailyBest(day) : null;
  const kinds = new Set(t.legs.map((l) => l.step)), extra = [kinds.has("bearing") && "look-outs to take bearings from", kinds.has("sketch") && "a sketch map", kinds.has("split") && "a split clue",
    kinds.has("sound") && "a sound to follow", kinds.has("word") && "a word to read", kinds.has("look") && "a house to pick out"].filter(Boolean).join(", ");
  o.blurb = (o.say ? `${esc(o.say)} ` : "") + `${t.legs.length} clues, each to a real place, with a locked tin to find near each${extra ? `, with ${extra} along the way` : ""}. `
    + "Each lock's code is read off the place: count what it asks. The more of you, the more legs give each of you something different to know. "
    + (o.stars > 1 ? "The clues don't say how far or which way: work it out, or ask a local. " : "")
    + (race ? `Everyone has their own copy: first to the chest wins, and K's racing you too. Par ${clock(t.par)}.`
      : `Anyone's find moves everyone on. No clock: each leg's worth three brass stars, and asking a local costs one.${daily ? " The same trail for everyone today, so compare stars." : ""}`)
    + (best !== null ? ` Your best today: ${best} brass stars.` : "");
  o.reward = `${o.stars} prize${o.stars > 1 ? "s" : ""} and a rosette for your jacket`;
  return true;
}


registerJob({
  id: "trail", glyph: "T", colour: COLOUR, label: "Treasure trail",
  goal: (o) => (o.mode ?? 0) % 2 ? "Solve the riddles and beat the others, and K, to the chest" : "Solve the riddles, find every tin and dig up the chest, tidily",
  offer(r, spot: PostSpot, w) {
    // the first trail on today's noticeboards is the trail of the day: the same for everyone
    const day = dayNumber(), daily = dailyDay !== day;
    const mode = daily ? 2 * 2 + DAILY : Math.floor(r() * THEMES.length) * 2 + (r() < 0.35 ? 1 : 0);
    const stars = daily ? 2 : 1 + Math.floor(r() * 3);
    const seed = daily ? hash("trail of the day", day) : hash("trail", r() * 1e9);
    const o: Offer = { kind: "trail", seed, stars, title: "", blurb: "", reward: "", x: spot.x, z: spot.z, where: spot.name, mode };
    if (!write(o, w, daily)) return null;
    if (daily) dailyDay = day;
    return o;
  },
  build: (o, w) => (write(o, w, false) ? o : null),
  start: (o, w, started) => new Trail(o, w, started),
});

/** A tin on a post (in colour), or the chest at the end, buried in a mound, with a glint over it. */
function tinModel(chest: boolean, colour = "#b3262e") {
  const g = new THREE.Group();
  const lambert = (c: string) => new THREE.MeshLambertMaterial({ color: c });
  if (chest) {
    const crate = new THREE.Group();
    crate.name = "crate";
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), lambert("#6b4423"));
    box.position.y = 0.25;
    const lid = new THREE.Group();
    lid.name = "lid"; lid.position.set(0, 0.5, 0.3);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12, 1, false, 0, Math.PI), lambert("#7a5030"));
    top.rotation.z = Math.PI / 2; top.position.z = -0.3;
    lid.add(top);
    crate.add(box, lid);
    for (const x of [-0.3, 0.3]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 0.64), lambert("#d9b143")); b.position.set(x, 0.26, 0); crate.add(b); }
    crate.position.y = -0.55;   // buried
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), lambert("#5b4632"));
    mound.scale.y = 0.35; mound.name = "mound";
    const cross = new THREE.Group();
    for (const a of [0.7, -0.7]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.1), lambert("#c23b2e")); p.rotation.y = a; cross.add(p); }
    cross.position.y = 0.33; cross.name = "cross";
    g.add(crate, mound, cross);
  } else {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), lambert("#5a3d22"));
    post.position.y = 0.45;
    const tin = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 16), lambert(colour));
    tin.position.y = 0.96;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.03, 16), lambert("#d9b143"));
    lid.position.y = 1.03;
    g.add(post, tin, lid);
  }
  const glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshBasicMaterial({ color: "#fff2b0", toneMapped: false }));
  glint.position.y = chest ? 1.2 : 1.4; glint.name = "glint";
  g.add(glint);
  return g;
}

/** Holes dug in the wrong place for a trail's chest: they outlast the trail, and fill themselves in
 *  after half an hour. Kept here, not in the job, so they stay when the trail's over. */
const holes: { x: number; z: number; t: number; view: THREE.Group; scene: THREE.Scene }[] = [];
let holeTimer = 0;
const HOLE_MATS = { pit: new THREE.MeshBasicMaterial({ color: "#2a1d12" }), earth: new THREE.MeshLambertMaterial({ color: "#6b4f33" }), worm: new THREE.MeshLambertMaterial({ color: "#d98a8a" }) };
const HOLE_GEO = { pit: new THREE.CircleGeometry(0.55, 14), earth: new THREE.TorusGeometry(0.75, 0.22, 5, 14), worm: new THREE.TorusGeometry(0.09, 0.025, 5, 10, Math.PI * 1.4) };

function addHole(scene: THREE.Scene, map: QuestWorld["map"], x: number, z: number) {
  if (holes.some((h) => Math.hypot(h.x - x, h.z - z) < 0.6)) return;
  const g = new THREE.Group(), y = map.ground(x, z);
  const pit = new THREE.Mesh(HOLE_GEO.pit, HOLE_MATS.pit);
  pit.rotation.x = -Math.PI / 2; pit.position.y = 0.03;
  const earth = new THREE.Mesh(HOLE_GEO.earth, HOLE_MATS.earth);
  earth.rotation.x = -Math.PI / 2; earth.scale.z = 0.5; earth.position.y = 0.05;
  const worm = new THREE.Mesh(HOLE_GEO.worm, HOLE_MATS.worm);
  worm.position.set(0.25, 0.08, 0.1); worm.rotation.set(Math.PI / 2, 0, Math.random() * 6);
  g.add(pit, earth, worm);
  g.position.set(x, y, z);
  scene.add(g);
  holes.push({ x, z, t: Date.now(), view: g, scene });
  if (holes.length > 24) { const old = holes.shift()!; old.scene.remove(old.view); }
  if (!holeTimer) holeTimer = window.setInterval(fillHoles, 60000);
}
function fillHoles() {
  for (let i = holes.length - 1; i >= 0; i--) if (Date.now() - holes[i].t > HOLE_LIFE) { holes[i].scene.remove(holes[i].view); holes.splice(i, 1); }
  if (!holes.length) { clearInterval(holeTimer); holeTimer = 0; }
}

function dispose(o: THREE.Object3D) {
  o.parent?.remove(o);
  o.traverse((m) => {
    if (m instanceof THREE.Mesh) m.geometry.dispose();
    if (m instanceof THREE.Mesh || m instanceof THREE.Sprite) { const mat = m.material as THREE.MeshBasicMaterial; mat.map?.dispose(); mat.dispose(); }
  });
}

const COINS = 36;
const GLOW_SEGS = 96;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1), ZERO = new THREE.Vector3(0, 0, 0);

/** How far data point (x, y) is from the segment a to b. */
function segDist(x: number, y: number, a: number[], b: number[]) {
  const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / l2));
  return Math.hypot(a[0] + ex * t - x, a[1] + ey * t - y);
}

type Map_ = QuestWorld["map"];
/** Is scene (x, z) in the river, the canal or a pond, in the maps loaded here? */
function wet(map: Map_, x: number, z: number) {
  for (const m of [map, ...map.tilesNear(x, z, 10)]) for (const wp of [...(m === map ? map.wide?.wp ?? [] : []), ...(m.d.wp ?? [])]) {
    const ring = wp.r[0];
    if (!ring) continue;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > -z !== yj > -z && x < ((xj - xi) * (-z - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}
/** Somewhere a tin can stand and be got to: outdoors, dry and clear. */
const firm = (map: Map_, x: number, z: number) => !map.indoors(x, z) && !wet(map, x, z) && !map.blocked(x, z, 0.6);
/** The nearest firm ground to (x, z) within r. */
function firmSpot(map: Map_, x: number, z: number, r: number): { x: number; z: number } | null {
  for (let d = 0; d <= r; d++) for (let k = 0, n = d ? 12 : 1; k < n; k++) {
    const a = (k / n) * Math.PI * 2, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (firm(map, px, pz)) return { x: px, z: pz };
  }
  return null;
}
/** Can you walk straight from (ax, az) to (bx, bz), as paces are counted, with nothing in the way? */
function straightWalk(map: Map_, ax: number, az: number, bx: number, bz: number) {
  const L = Math.hypot(bx - ax, bz - az);
  for (let t = 1.5; t <= L; t += 0.75) {
    const x = ax + ((bx - ax) * t) / L, z = az + ((bz - az) * t) / L;
    if (map.indoors(x, z) || wet(map, x, z) || map.blocked(x, z, 0.25)) return false;
  }
  return true;
}
/** Can you walk from (x, z) to a street or path, within r, round whatever's in the way? Half a metre
 *  at a time, as a garden gate's about a metre wide: a doorstep behind an unbroken hedge isn't. */
function walkable(map: Map_, x: number, z: number, r: number) {
  // the streets and paths round about, once, as segments (ax, az, bx, bz)
  const segs: number[] = [];
  for (const m of [map, ...map.tilesNear(x, z, r + 5)]) for (const rd of m.d.rd) for (let k = 1; k < rd.p.length; k++) {
    const ax = rd.p[k - 1][0], az = -rd.p[k - 1][1], bx = rd.p[k][0], bz = -rd.p[k][1];
    if (Math.min(ax, bx) < x + r + 3 && Math.max(ax, bx) > x - r - 3 && Math.min(az, bz) < z + r + 3 && Math.max(az, bz) > z - r - 3) segs.push(ax, az, bx, bz);
  }
  const onWay = (px: number, pz: number) => {
    for (let k = 0; k < segs.length; k += 4) {
      const ax = segs[k], az = segs[k + 1], ex = segs[k + 2] - ax, ez = segs[k + 3] - az, l2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / l2));
      if (Math.hypot(ax + ex * t - px, az + ez * t - pz) < 2) return true;
    }
    return false;
  };
  const S = 0.5, seen = new Set(["0,0"]), q: [number, number][] = [[0, 0]];
  for (let k = 0; k < q.length; k++) {
    const [i, j] = q[k];
    if (onWay(x + i * S, z + j * S)) return true;
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      const key = `${a},${b}`;
      if (seen.has(key) || Math.hypot(a, b) * S > r) continue;
      seen.add(key);
      if (!map.indoors(x + a * S, z + b * S) && !map.blocked(x + a * S, z + b * S, 0.25)) q.push([a, b]);
    }
  }
  return false;
}
/** A circle's size as a player reads it off the map: across, to the nearest 10 m. */
const across = (r: number) => `${Math.round((r * 2) / 10) * 10} m`;

/** What a leg cost in brass stars: locals asked, locks jammed, decoys opened; and who opened its tin. */
interface Cost { ask: number; jam: number; decoy: number; by: string; digs?: number }
const legStars = (c: Cost) => Math.max(0, STARS - c.ask - c.jam - c.decoy);
const K_COLOUR = "#b0b8c8";
const paperUp = () => { const b = document.getElementById("scoreboard"); return !!b && !b.hidden; };
/** What a local says when asked the way. */
const LOCALS = ["\"Oh, you want round there, love.\"", "\"Seen a tin? Try over that way.\"", "\"Everyone's asking me that today.\"",
  "\"I'll draw you a circle, shall I?\"", "\"Down there and about a bit, I think.\""];

interface Tin { view: THREE.Group; n: number; h: number; x: number; z: number; y: number; decoy?: boolean; word?: string; sign?: boolean }

/** A picture drawn on a canvas, for a sign or a label. */
function painted(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A painted plaque on a post, with its table of rules lettered on it by hand (both faces). */
function plaqueModel(rows: string[]) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), new THREE.MeshLambertMaterial({ color: "#3b2a1a" }));
  post.position.y = 0.75;
  const H = 70 + rows.length * 46;
  const tex = painted(512, H, (x) => {
    x.fillStyle = "#1f3b5a"; x.fillRect(0, 0, 512, H);
    x.strokeStyle = "#e8d9a8"; x.lineWidth = 6; x.strokeRect(8, 8, 496, H - 16);
    x.fillStyle = "#f4ecd4"; x.textAlign = "center"; x.textBaseline = "middle";
    x.font = "700 30px Georgia, serif";
    x.fillText("ONE TIN IS TRUE", 256, 40, 470);
    x.font = "600 30px Georgia, serif";
    rows.forEach((r, k) => x.fillText(r, 256, 86 + k * 46, 470));
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1 * H / 512), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false }));
  face.position.y = 1.5 + 0.55 * H / 512;
  g.add(post, face);
  return g;
}

/** A tin with a word on a little tag over it and a coloured lid, for a word leg's tins. */
function wordTinModel(word: string, lid: string) {
  const g = tinModel(false, "#2e7d4f");
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.035, 16), new THREE.MeshLambertMaterial({ color: lid }));
  top.position.y = 1.035;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: painted(256, 64, (x) => {
    x.fillStyle = "#f4ecd4"; x.fillRect(0, 0, 256, 64);
    x.fillStyle = "#1b1b1d"; x.font = "700 40px Georgia, serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(word, 128, 34, 240);
  }), toneMapped: false }));
  tag.scale.set(0.8, 0.2, 1); tag.position.y = 1.75;
  g.add(top, tag);
  return g;
}

/** Half a clue on a sheet of paper pinned to a post. */
function noteModel() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), new THREE.MeshLambertMaterial({ color: "#5a3d22" }));
  post.position.y = 0.7;
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.42), new THREE.MeshLambertMaterial({ color: "#f4ecd4", side: THREE.DoubleSide }));
  sheet.position.set(0, 1.25, 0.05);
  g.add(post, sheet);
  return g;
}

const LINE_SEGS = 160;
/** A bearing leg's gold line along the ground, drawn over everything so it reads across the roofs,
 *  only for someone stood at its look-out. Its points are laid when it's put up. */
function lineModel() {
  const geo = new THREE.BufferGeometry(), idx: number[] = [];
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((LINE_SEGS + 1) * 6), 3));
  for (let i = 0; i < LINE_SEGS; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: "#ffd84a", transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, toneMapped: false, side: THREE.DoubleSide,
  }));
  m.frustumCulled = false; m.renderOrder = 7;
  return m;
}

/** A name in two halves: alternate letters each, so neither half reads on its own. */
function halves(name: string): [string, string] {
  const up = name.toUpperCase(), out: [string, string] = ["", ""];
  let k = 0;
  for (const c of up) {
    if (/[A-Z]/.test(c)) { out[k % 2] += c + " "; out[1 - (k % 2)] += "_ "; k++; }
    else if (c === " ") { out[0] += "&nbsp;&nbsp;"; out[1] += "&nbsp;&nbsp;"; }
    else { out[0] += esc(c) + " "; out[1] += esc(c) + " "; }
  }
  return out;
}
const KIND_WORD: Record<Kind, string> = { pub: "a pub", church: "a church", rest: "a churchyard", green: "a park or green", garden: "a garden", square: "a square or terrace", street: "a street", place: "a place" };

class Trail implements Job {
  done: Job["done"] = null;
  private t!: ReturnType<typeof trailOf>;
  private pc = 1;                            // how many took the trail on, which shapes its legs
  private race: boolean;
  private daily: boolean;
  private at = new Map<string, number>();   // how many tins each player's opened (together: everyone's the same)
  private twins = new Set<number>();         // legs that are twin tins this time
  private spots = new Map<string, { x: number; z: number }>();   // where each tin stands, by "leg:half", once known
  private tins = new Map<string, Tin>();     // the tins put up round you
  private halves: [number, number] = [-1e9, -1e9];   // when each of twin tins was last opened (seconds, this page's clock)
  private halfBy: [string, string] = ["", ""];
  private pics = new Map<number, string>();  // picture clues drawn, by leg (as image data)
  private picTried = new Set<number>();
  private clues!: string[][];
  private legT = 0;                          // seconds on this clue
  private askT = 0;                          // seconds since a local was last asked
  private costs!: Cost[];                     // what each leg's cost in brass stars, and who opened it
  private kTime!: number;                     // a race: when K gets to the chest, seconds in
  private kAt = 0;                           // and how many tins she's opened
  private near: { tin: Tin; d: number } | null = null;
  private glows = new Map<string, { mesh: THREE.Mesh; k: number; built: number }>();   // the circles' edges on the ground
  private decoys = new Map<number, { x: number; z: number }>();   // where each leg's decoy tin stands, once known
  private emptied = new Set<number>();       // decoys already opened
  private tickIn = new Map<string, number>();   // seconds until each tin next rattles
  private chestFx: { t: number; tin: Tin; coins: THREE.InstancedMesh; v: Float32Array; sounded: boolean } | null = null;
  private saw = new Map<string, string>();   // "leg:hill" look-outs someone's been up to, and who
  private line: { mesh: THREE.Mesh; key: string } | null = null;
  private halfRead = new Set<number>();      // split clues whose pinned-up half you've read yourself
  private notes = new Map<number, { x: number; z: number }>();
  private noteView: { n: number; view: THREE.Group } | null = null;
  private wordSpots = new Map<number, { x: number; z: number; word: string }[]>();
  private plaques = new Map<number, { words: string[]; lids: number[]; rows: string[] }>();
  private plaqueRead = new Set<number>();    // word legs whose plaque you've read yourself
  private wrong = new Set<string>();         // wrong-word tins already opened
  private soundT = 0;
  private lock = new Lock();
  private locks = new Map<string, { code: number[]; ask: string }>();   // each tin's lock, by "leg:half", once its place is loaded
  private wheels = new Map<string, number[]>();   // where you left each lock's wheels
  private lockAt: { x: number; z: number; key: string } | null = null;
  private houses = new Map<number, House | null>();   // a look leg's house, once its street is loaded (null: none to be had)
  private sketches = new Map<number, HTMLCanvasElement>();   // sketch legs' drawings, once drawn
  private sketchEl: HTMLDivElement | null = null;   // the sketch held up full screen
  private sketchKey = false;                 // the Clue button's held down by the sketch's holder (a touch screen)
  private useAt = 0;                         // when use went down, for a hold of it to study the sketch
  private askOnLetGo = false;                // a tap of use asks a local, decided when it's let go
  private sketchBtn: HTMLButtonElement | null = null;
  private keys = new AbortController();
  private paces = new Map<number, { x: number; z: number; text: string } | null>();   // the chest's pacing riddle, once its place is loaded
  private found = false;                     // someone's spade has hit the chest
  private digKey = false;                    // E (or the Dig button) held down
  private digT = 0; private dug = false;     // seconds into this hole, and whether it's done till E's let go
  private liftBy = new Set<string>();        // who's holding E at the chest
  private liftT = 0;
  private digBtn: HTMLButtonElement | null = null;
  private offerT = 0;                        // seconds left to pay for the hint a local's offered
  private splashed = false;                  // the start's splash has been up
  private splashWait = 0;
  private clueT = 0;                         // seconds the clue's up again for (the Clue button)

  constructor(readonly offer: Offer, private w: QuestWorld, private started: number) {
    this.race = !!((offer.mode ?? 0) & 1);
    this.daily = !!((offer.mode ?? 0) & DAILY);
    this.build(w.players().length);
    const sig = { signal: this.keys.signal };
    addEventListener("blur", () => { this.sketchKey = false; this.digKey = false; this.askOnLetGo = false; }, sig);
    addEventListener("keydown", (e) => { if (isKey(e.code, "use") && !e.repeat) { this.digKey = true; this.useAt = performance.now(); } }, sig);
    addEventListener("keyup", (e) => {
      if (!isKey(e.code, "use")) return;
      this.digKey = false;
      if (this.askOnLetGo && performance.now() - this.useAt < HOLD_USE) this.ask();
      this.askOnLetGo = false;
    }, sig);
  }

  /** The legs, for pc players: whoever took the trail says how many of them there were (progress). */
  private build(pc: number) {
    const offer = this.offer;
    this.pc = Math.max(1, Math.min(8, pc));
    this.t = trailOf(offer, this.w, this.pc);
    this.costs = this.t.legs.map(() => ({ ask: 0, jam: 0, decoy: 0, by: "" }));
    // anything worked out from the legs before is for legs that may no longer be the same
    for (const m of [this.spots, this.decoys, this.wordSpots, this.plaques, this.locks, this.houses, this.paces, this.sketches, this.notes, this.pics]) m.clear();
    this.picTried.clear();
    this.kTime = kBest(offer.seed) ?? this.t.par * K_SLOW;
    const r = rng(hash("clues", offer.seed));
    let fx = offer.x, fz = offer.z;
    this.clues = this.t.legs.map((s) => {
      const hard = offer.stars === 1 ? 1 : offer.stars === 2 ? 1 + Math.floor(r() * 2) : 2;
      const vague = offer.stars === 1;
      const c = [riddle(s, fx, fz, hard, vague, r), s.twin ? riddle(s.twin, fx, fz, hard, vague, r) : ""];
      fx = s.x; fz = s.z;
      return c;
    });
  }

  private get mine() { return this.at.get(this.race ? this.w.selfId : "") ?? 0; }
  private halvesOf(n: number) { return this.twins.has(n) && this.t.legs[n]?.twin ? [0, 1] : [0]; }
  private aim(n: number, h: number) { const s = this.t.legs[n]; return h ? { x: s.twin!.tx, z: s.twin!.tz } : { x: s.tx, z: s.tz }; }

  /** Where tin (n, h) stands: on a street or path near its place, the same for everyone. Null until
   *  all of Bath round it is loaded here: picked from half-loaded squares, it could land in a building
   *  that hadn't come in yet, or somewhere else on another player's screen. */
  private spotOf(n: number, h: number) {
    const key = `${n}:${h}`, had = this.spots.get(key);
    if (had) return had;
    const a = this.aim(n, h), map = this.w.map;
    if (!loadedRound(map, a.x, a.z, SETTLE)) return null;
    if (this.t.legs[n].step === "look") {
      // on the doorstep of the house the clue picks out
      const house = this.houseOf(n);
      if (house === undefined) return null;
      if (house) {
        const ox = house.x + Math.sin(house.a) * 2.2, oz = house.z + Math.cos(house.a) * 2.2;
        let c = firm(map, ox, oz) ? { x: ox, z: oz } : firmSpot(map, ox, oz, 6);
        // shut in behind a hedge or a wall with no gate: it waits on the street outside instead
        if (!c || !walkable(map, c.x, c.z, 30)) { const st = onStreet(this.w, house.x, house.z, 40) ?? { x: ox, z: oz }; c = firmSpot(map, st.x, st.z, 8) ?? st; }
        this.spots.set(key, c);
        return c;
      }
    }
    if (n === this.t.legs.length - 1) {
      const pace = this.pacing(n);
      if (pace === undefined) return null;
      if (pace) { const c = { x: pace.x, z: pace.z }; this.spots.set(key, c); return c; }
    }
    if (this.t.legs[n].step === "bearing" || this.t.legs[n].step === "sketch") {
      // right where the lines cross, or under the X
      const f = firmSpot(map, a.x, a.z, 6), c = f && walkable(map, f.x, f.z, 20) ? f : { x: a.x, z: a.z };
      this.spots.set(key, c);
      return c;
    }
    const r = rng(hash("tin", this.offer.seed, n, h));
    const p = streetSpot(map, a.x, a.z, 0, 45, 0.6, (x, z) => !map.indoors(x, z) && !wet(map, x, z), 4, 3, r);
    const c = p ? { x: p.x, z: p.z } : firmSpot(map, a.x, a.z, 20) ?? { x: a.x, z: a.z };
    this.spots.set(key, c);
    return c;
  }

  update(dt: number) {
    this.chestUpdate(dt);
    if (this.done) return;
    const n = this.mine, s = this.t.legs[n], me = this.w.me();
    if (!s) return;
    this.legT += dt; this.askT += dt;
    // the Chronicle (up for a while when you join, or on Tab) would sit on top of it: it waits its turn
    if (!this.splashed && (!paperUp() || (this.splashWait += dt) > 25)) { this.splashed = true; this.showSplash(); }
    if (this.offerT > 0 && ((this.offerT -= dt) <= 0 || this.near || !this.askReady())) { this.offerT = 0; offer(null); }
    this.clueUpdate(dt);
    this.lock.update(dt);
    if (this.lock.open && this.lockAt && (Math.hypot(this.lockAt.x - me.x, this.lockAt.z - me.z) > OPEN + 2 || !this.lockAt.key.startsWith(`${n}:`) || !me.alive)) {
      if (this.lockAt) this.wheels.set(this.lockAt.key, this.lock.wheels);
      this.lock.hide();
    }
    if (this.race) this.rival();
    if (this.done) return;
    // tins from an earlier clue come down
    for (const [k, tin] of this.tins) if (tin.n !== n) { dispose(tin.view); this.tins.delete(k); }
    if (this.noteView && this.noteView.n !== n) { dispose(this.noteView.view); this.noteView = null; }
    const last = n === this.t.legs.length - 1, step = s.step;
    this.near = null;
    for (const h of this.halvesOf(n)) {
      const key = `${n}:${h}`, spot = this.spotOf(n, h), at = spot ?? this.aim(n, h);
      const d = Math.hypot(at.x - me.x, at.z - me.z);
      // the tin itself (a word leg's plaque), once you're close enough for it to matter
      if (spot && !this.tins.has(key) && (!last || !this.pacing(n) || this.found) && d < (step === "word" ? PLAQUE_NEAR : step === "look" && this.houses.get(n) ? LOOK_NEAR : TIN_NEAR)) {
        const view = step === "word" ? plaqueModel(this.plaqueOf(n).rows) : tinModel(last, h ? "#2f6fb3" : "#b3262e"), y = this.w.map.ground(spot.x, spot.z);
        view.position.set(spot.x, y, spot.z);
        if (step === "word") view.rotation.y = Math.atan2(me.x - spot.x, me.z - spot.z);
        this.w.scene.add(view);
        this.tins.set(key, { view, n, h, x: spot.x, z: spot.z, y, sign: step === "word" });
      }
      const tin = this.tins.get(key);
      if (tin && !tin.sign) {
        const g = tin.view.getObjectByName("glint");
        if (g) { g.visible = d < GLINT_NEAR; g.rotation.y += dt * 3; g.position.y = (last ? 1.2 : 1.4) + Math.sin(performance.now() / 300) * 0.06; }
        if (d < OPEN && (!this.near || d < this.near.d)) this.near = { tin, d };
      }
      this.showRing(n, h, dt);
      if (spot && step !== "word") this.listen(n, h, spot, d, dt);
      if (step === "sound" && h === 0) this.sound(n, at, dt);
    }
    if (step === "word") this.wordTins(n, dt);
    if (step === "split") this.splitNote(n);
    if (step === "bearing") this.bearing(n);
    if (last) this.finale(n, dt);
    this.sketchUpdate(n);
    const dc = this.decoyOf(n);
    if (dc) {
      const d = Math.hypot(dc.x - me.x, dc.z - me.z), key = `${n}:d`;
      if (!this.tins.has(key) && d < TIN_NEAR) {
        const view = tinModel(false), y = this.w.map.ground(dc.x, dc.z);
        view.position.set(dc.x, y, dc.z);
        this.w.scene.add(view);
        this.tins.set(key, { view, n, h: 0, x: dc.x, z: dc.z, y, decoy: true });
      }
      const tin = this.tins.get(key), g = tin?.view.getObjectByName("glint");
      if (g) { g.visible = d < GLINT_NEAR && !this.emptied.has(n); g.rotation.y += dt * 3; }
      if (tin && d < OPEN && (!this.near || d < this.near.d)) this.near = { tin, d };
    }
    // a picture clue: drawn once, when that part of Bath is round you
    if (s.pic && !this.pics.has(n) && !this.picTried.has(n)) {
      const spot = this.spotOf(n, 0);
      if (spot && Math.hypot(spot.x - me.x, spot.z - me.z) < PICTURE_NEAR) this.takePicture(n, spot);
    }
  }

  /** A race: K's on her own clock, a tin at a time, and if she gets to the chest first, you've lost. */
  private rival() {
    const secs = (Date.now() - this.started) / 1000, total = this.t.legs.length;
    const at = Math.min(total, Math.floor((secs / this.kTime) * total));
    if (at > this.kAt) {
      this.kAt = at;
      if (at < total) this.w.feed(`<b style="color:${K_COLOUR}">K</b> has opened tin ${at} of ${total}. She's not hanging about`);
    }
    if (secs > this.kTime) this.lose();
  }

  /** A bearing leg: at each look-out a gold line runs along the ground towards the tin, for you
   *  only while you're up there, and goes on your map; the tin's where the lines cross. */
  private bearing(n: number) {
    const s = this.t.legs[n], me = this.w.me();
    let up = -1;
    s.hills.forEach((hi, i) => {
      const d = Math.hypot(hi.x - me.x, hi.z - me.z), key = `${n}:${i}`;
      this.w.circle(`trailhi${i}`, this.saw.get(key) === this.w.selfId ? null : { x: hi.x, z: hi.z, r: SAW_AT + 10, colour: COLOUR, pulse: true });
      if (d < VIEW_AT) up = i;
      if (d < SAW_AT && me.alive && !this.saw.has(key)) {
        const msg = { k: "saw", s: this.offer.seed, n, i };
        this.w.send("qe", msg);
        this.event(msg, this.w.selfId);
      }
    });
    if (up < 0) { if (this.line) this.line.mesh.visible = false; return; }
    const key = `${n}:${up}`, hi = s.hills[up], end = this.lineEnd(n, up);
    if (!this.line) { this.line = { mesh: lineModel(), key: "" }; this.w.scene.add(this.line.mesh); }
    const line = this.line;
    line.mesh.visible = true;
    (line.mesh.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.15 * Math.sin(performance.now() / 300);
    if (line.key === key) return;
    line.key = key;
    // laid along the ground from just in front of the look-out, a little wider the further it goes so it still reads far off
    const pos = line.mesh.geometry.getAttribute("position") as THREE.BufferAttribute, map = this.w.map;
    const dx = end.x - hi.x, dz = end.z - hi.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
    for (let i = 0; i <= LINE_SEGS; i++) {
      const t = 6 + (len - 6) * (i / LINE_SEGS), x = hi.x + ux * t, z = hi.z + uz * t, half = 0.5 + t * 0.004;
      for (let side = 0; side < 2; side++) {
        const sx = x - uz * half * (side ? 1 : -1), sz = z + ux * half * (side ? 1 : -1);
        pos.setXYZ(i * 2 + side, sx, map.ground(sx, sz) + 0.6, sz);
      }
    }
    pos.needsUpdate = true;
  }

  /** The chest's pacing riddle: from something in the street near its place that's the only one of
   *  its kind round about, so many paces one way. Undefined until that part of Bath is loaded here;
   *  null where there's nothing to pace from (the chest is then left showing, as a mound). */
  private pacing(n: number): { x: number; z: number; text: string } | null | undefined {
    if (n !== this.t.legs.length - 1) return null;
    if (this.paces.has(n)) return this.paces.get(n);
    const s = this.t.legs[n], map = this.w.map;
    // the street things are gathered from a good way past the ones used, so "the only one round
    // there" is judged against everything you could see from it
    if (!loadedRound(map, s.x, s.z, 170)) return undefined;
    const r = rng(hash("paces", this.offer.seed)), items: (string | number)[][] = [];
    for (const m of [map, ...map.tilesNear(s.x, s.z, 170)]) for (const f of m.d.fx ?? []) if (Math.hypot(+f[1] - s.x, -f[2] - s.z) < 160) items.push(f);
    items.sort((a, b) => +a[1] - +b[1] || +a[2] - +b[2]);
    let out: { x: number; z: number; text: string } | null = null;
    for (const [kind, said] of PACE_KINDS) {
      const all = items.filter((f) => f[0] === kind);
      const lone = all.filter((f) => Math.hypot(+f[1] - s.x, -f[2] - s.z) < 70 && all.every((o) => o === f || Math.hypot(+o[1] - +f[1], +o[2] - +f[2]) > 45));
      for (const f of shuffled(r, lone)) {
        const fx = +f[1], fz = -f[2];
        for (let t = 0; t < 8 && !out; t++) {
          const a = Math.floor(r() * 8) * (Math.PI / 4), steps = 10 + Math.floor(r() * 16), x = fx + Math.sin(a) * steps, z = fz - Math.cos(a) * steps;
          if (map.indoors(x, z) || map.blocked(x, z, 0.8) || wet(map, x, z) || !straightWalk(map, fx, fz, x, z)) continue;
          out = { x, z, text: `From ${said} there, walk <b>${steps} paces ${compassWord(x - fx, z - fz)}</b> (a pace is about a metre) and dig.` };
        }
        if (out) break;
      }
      if (out) break;
    }
    this.paces.set(n, out);
    return out;
  }

  /** The chest leg with a pacing riddle: hold E to dig a hole where you stand. Near the chest the
   *  spade hits wood; anywhere else there's a hole with a worm in it, for everyone to see for half
   *  an hour. Then the chest wants lifting: two of you holding E together, or a long heave alone. */
  private finale(n: number, dt: number) {
    const pace = this.pacing(n), me = this.w.me(), at = this.spots.get(`${n}:0`);
    const s = this.t.legs[n], close = Math.hypot(s.x - me.x, s.z - me.z) < 160;
    this.digButton(!!pace && close);
    if (!pace || !at || !me.alive) { this.digT = 0; return; }
    if (!this.digKey) { this.dug = false; this.digT = 0; }
    const atChest = Math.hypot(at.x - me.x, at.z - me.z) < DIG_NEAR;
    if (!this.found) {
      if (!this.digKey || this.dug || !close) return;
      if ((this.digT += dt) < DIG) return;
      this.dug = true; this.digT = 0;
      if (atChest) {
        const msg = { k: "found", s: this.offer.seed, n };
        if (!this.race) this.w.send("qe", msg);
        this.event(msg, this.w.selfId);
        return;
      }
      const x = Math.round(me.x * 10) / 10, z = Math.round(me.z * 10) / 10, msg = { k: "hole", s: this.offer.seed, n, x, z };
      addHole(this.w.scene, this.w.map, x, z);
      if (!this.race) this.w.send("qe", msg);
      this.event(msg, this.w.selfId);
      SFX.dig();
      this.w.toast("Just earth, and a worm. Try somewhere else", 2);
      return;
    }
    // lifting: say when you take hold and let go, and the lowest id of two holding it calls it
    const holding = this.digKey && atChest;
    if (holding !== this.liftBy.has(this.w.selfId)) {
      if (holding) this.liftBy.add(this.w.selfId); else this.liftBy.delete(this.w.selfId);
      if (!this.race) this.w.send("qe", { k: "lift", s: this.offer.seed, on: holding ? 1 : 0 });
    }
    if (!holding) { this.liftT = 0; return; }
    const alone = this.w.players().length < 2, two = this.liftBy.size >= 2;
    this.liftT += dt;
    if (this.liftT >= (two ? LIFT_TWO : alone ? LIFT_ONE : LIFT_ALONE) && (!two || [...this.liftBy].sort()[0] === this.w.selfId)) {
      this.liftT = 0;
      this.sendTin(n);
    } else if (!two && !alone && this.liftT > 1 && this.liftT - dt <= 1) this.w.toast("It's heavy: someone hold {use} with you, or keep heaving", 2.5);
  }

  /** On a touch screen, a button to hold for the spade. */
  private digButton(want: boolean) {
    if (want && !this.digBtn) {
      const host = document.getElementById("textra") ?? document.getElementById("touch");
      if (!host) return;
      const b = (this.digBtn = document.createElement("button"));
      b.className = "tbtn small"; b.textContent = "Dig";
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); try { b.setPointerCapture(e.pointerId); } catch { /* gone */ } this.digKey = true; });
      const up = () => { this.digKey = false; };
      b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
      host.appendChild(b);
    } else if (!want && this.digBtn) { this.digBtn.remove(); this.digBtn = null; }
  }

  /** Who holds leg n's sketch: one of every two of you, by the room's ids in order, a different
   *  one each leg; and which strip of it each holds, when it's torn between more than one. */
  private holders(n: number) {
    const ids = this.w.players().map((p) => p.id).sort(), h = Math.max(1, Math.floor(ids.length / 2));
    return Array.from({ length: Math.min(h, ids.length) }, (_, j) => ids[(n * h + j) % ids.length]);
  }

  /** A sketch leg: the map-holder holds up the sketch, full screen, while use (or the Clue button) is held, and
   *  can't see the big map meanwhile. Everyone else has to be talked in. */
  private sketchUpdate(n: number) {
    const s = this.t.legs[n], sk = s?.sketch, holders = sk ? this.holders(n) : [], mine = holders.indexOf(this.w.selfId);
    this.touchButton();
    const show = mine >= 0 && (this.sketchKey || (this.digKey && performance.now() - this.useAt >= HOLD_USE)) && this.w.me().alive;
    if (!show || !sk) { if (this.sketchEl) this.sketchEl.hidden = true; return; }
    let pic = this.sketches.get(n);
    if (!pic) {
      pic = drawSketch(this.w.map, { cx: sk.cx, cz: sk.cz, span: 250, x: s.tx, z: s.tz, turn: sk.turn, north: this.offer.stars < 3, seed: hash("sketch", this.offer.seed, n) });
      this.sketches.set(n, pic);
    }
    let el = this.sketchEl;
    if (!el) {
      el = this.sketchEl = document.createElement("div");
      el.style.cssText = "position:fixed;inset:0;z-index:9;background:#1a140c;display:flex;align-items:center;justify-content:center;pointer-events:none";
      const c = document.createElement("canvas");
      c.width = c.height = 512;
      c.style.cssText = "width:min(94vw,94vh);height:min(94vw,94vh);box-shadow:0 0 40px #000";
      el.appendChild(c);
      document.body.appendChild(el);
    }
    const c = el.firstChild as HTMLCanvasElement;
    if (c.dataset.leg !== `${n}:${mine}:${holders.length}`) {
      // torn between the holders: each sees their own strip, the rest torn away
      c.dataset.leg = `${n}:${mine}:${holders.length}`;
      const g = c.getContext("2d")!, w = 512 / holders.length;
      g.fillStyle = "#1a140c"; g.fillRect(0, 0, 512, 512);
      g.drawImage(pic, mine * w, 0, w, 512, mine * w, 0, w, 512);
    }
    el.hidden = false;
    document.getElementById("bigmap")?.setAttribute("hidden", "");
  }

  /** On a touch screen, a Clue button: tap for the clue again, or hold for the sketch if it's yours. */
  private touchButton() {
    if (this.sketchBtn) return;
    const host = document.getElementById("textra") ?? document.getElementById("touch");
    if (!host) return;
    const b = (this.sketchBtn = document.createElement("button"));
    b.className = "tbtn small"; b.textContent = "Clue";
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); try { b.setPointerCapture(e.pointerId); } catch { /* gone */ } this.clueKey(); });
    const up = () => { this.sketchKey = false; };
    b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
    host.appendChild(b);
  }

  /** The Clue button pressed: the map-holder on a sketch leg holds it up while
   *  it's down; anyone else gets the clue back, big, or puts it away again. */
  private clueKey() {
    const n = this.mine;
    if (this.t.legs[n]?.sketch && this.holders(n).includes(this.w.selfId)) { this.sketchKey = true; return; }
    this.clueT = this.clueT > 0 ? 0 : CLUE_UP;
    if (this.clueT > 0) splash(null);
  }

  /** The clue again, big: while you've asked for it, and whenever the big map's open (off a touch
   *  screen, that's the way to it). */
  private clueUpdate(dt: number) {
    if (this.clueT > 0) this.clueT -= dt;
    const map = document.getElementById("bigmap"), mapOpen = !!map && !map.hidden;
    if (!(this.clueT > 0 || mapOpen) || !this.w.me().alive) { clueCard(null); return; }
    const n = this.mine, total = this.t.legs.length;
    clueCard({ tag: `Clue ${n + 1} of ${total}${n === total - 1 ? ": the chest" : ""}`, clue: this.clueHtml(n), foot: this.hintLine() });
  }

  /** The big card as the trail starts: what you're after, any clock, how the circle works, and the clue. */
  private showSplash() {
    const n = this.mine, total = this.t.legs.length, tins = total - 1, of = RINGS.length;
    const find = `Find <b>${tins} locked tin${tins > 1 ? "s" : ""}</b>, one clue at a time, then dig up the <b>Bath Bun chest</b>`;
    const clockLine = this.race ? `A race: first to the chest wins. K gets there at <b>${clock(this.kTime)}</b>, so that's your time limit. Par ${clock(this.t.par)}.`
      : `No clock: take your time. Each leg's worth three brass stars, and the tidier you are the better the rosette.`;
    const friends = this.w.players().length >= 2;
    const rules = [
      `Each tin is locked: its code is read off the place round it.${friends && !this.race ? " Anyone's find moves everyone on." : ""}`,
      `Stuck? Ask a local (<b>{use}</b>, from ${ASK_AFTER} s into a clue): a search circle goes on your map with the tin inside. `
        + `Up to ${of} hints a tin, ${ASK_AGAIN} s apart, each circle smaller (${RINGS.map((r) => across(r)).join(", ")} across)`
        + (this.race ? ". Free in a race: they only cost you time." : ", a brass star each. You see what you'd get before you pay."),
      "The circle never shrinks by itself: only when someone asks. Your card counts down to the next hint.",
      "The chest is buried: its clue gives paces to count from something in the street. Hold <b>{use}</b> to dig.",
    ];
    splash({ name: this.offer.title, find, clock: clockLine, tag: `Clue ${n + 1} of ${total}`, clue: this.clueHtml(n), rules });
  }

  /** Where look-out i's line ends: past the tin by an amount fixed by the seed. */
  private lineEnd(n: number, i: number) {
    const s = this.t.legs[n], hi = s.hills[i], dx = s.tx - hi.x, dz = s.tz - hi.z, len = Math.hypot(dx, dz) || 1;
    const past = LINE_PAST[0] + rng(hash("past", this.offer.seed, n, i))() * (LINE_PAST[1] - LINE_PAST[0]);
    return { x: s.tx + (dx / len) * past, z: s.tz + (dz / len) * past };
  }

  /** A sound leg: the bell (or the busker) from where the tin is, every few seconds, wherever you are within earshot. */
  private sound(n: number, at: { x: number; z: number }, dt: number) {
    if (!this.w.hear || (this.soundT -= dt) > 0) return;
    this.soundT = SOUND_EVERY;
    const [dist, pan] = this.w.hear(at.x, this.w.map.ground(at.x, at.z) + 6, at.z), s = this.t.legs[n];
    if (s.kind === "church" || s.kind === "rest") SFX.trailBell(dist, pan);
    else SFX.buskerTune(hash("tune", this.offer.seed, n), dist, pan);
  }

  /** Where the other half of a split clue is pinned up: a way along from where the leg starts, the same for everyone. */
  private noteOf(n: number) {
    const had = this.notes.get(n);
    if (had) return had;
    const from = this.legStart(n), s = this.t.legs[n], map = this.w.map;
    const toward = Math.atan2(s.z - from.z, s.x - from.x), a = toward + (rng(hash("note", this.offer.seed, n))() - 0.5) * 1.6;
    const tx = from.x + Math.cos(a) * NOTE_AWAY, tz = from.z + Math.sin(a) * NOTE_AWAY;
    if (!loadedRound(map, tx, tz, 60)) return null;
    const p = streetSpot(map, tx, tz, 0, 40, 0.6, (x, z) => !map.indoors(x, z) && !wet(map, x, z), 4, 3, rng(hash("notespot", this.offer.seed, n)));
    const c = p ? { x: p.x, z: p.z } : firmSpot(map, tx, tz, 15) ?? { x: tx, z: tz };
    this.notes.set(n, c);
    return c;
  }

  /** Where leg n starts, from the seed alone, so a note pinned up from it is in the same place for everyone. */
  private legStart(n: number) {
    return n ? { x: this.t.legs[n - 1].tx, z: this.t.legs[n - 1].tz } : { x: this.offer.x, z: this.offer.z };
  }

  private splitNote(n: number) {
    if (this.halfRead.has(n)) return;
    const at = this.noteOf(n), me = this.w.me();
    if (!at) return;
    const d = Math.hypot(at.x - me.x, at.z - me.z);
    if (!this.noteView && d < TIN_NEAR * 2) {
      const view = noteModel();
      view.position.set(at.x, this.w.map.ground(at.x, at.z), at.z);
      view.rotation.y = Math.atan2(me.x - at.x, me.z - at.z);
      this.w.scene.add(view);
      this.noteView = { n, view };
    }
    if (d < READ_AT) {
      this.halfRead.add(n);
      SFX.jobStep();
      this.w.toast("You've read the other half of the clue", 2.5);
    }
  }

  /** Where a word leg's tins stand, round the corner from the plaque, out of sight of it, so someone
   *  has to read it out. Null until the plaque's placed and everything round it is loaded. */
  private wordList(n: number) {
    const had = this.wordSpots.get(n);
    if (had) return had;
    const plaque = this.spotOf(n, 0), map = this.w.map, table = this.plaqueOf(n);
    if (!plaque || !loadedRound(map, plaque.x, plaque.z, 100)) return null;
    const r = rng(hash("wordspots", this.offer.seed, n)), list: { x: number; z: number; word: string }[] = [];
    for (const word of table.words) {
      const p = streetSpot(map, plaque.x, plaque.z, 50, 90, 0.6, (x, z) => !map.indoors(x, z) && !wet(map, x, z) && list.every((o) => Math.hypot(o.x - x, o.z - z) > 12), 4, 3, r);
      const fx = plaque.x + (list.length - 1) * 8, fz = plaque.z + 60;
      const c = p ?? firmSpot(map, fx, fz, 12) ?? { x: fx, z: fz };
      list.push({ x: c.x, z: c.z, word });
    }
    this.wordSpots.set(n, list);
    return list;
  }

  /** A word leg's tins: only the one with the plaque's word on it is the real one. */
  private wordTins(n: number, dt: number) {
    const plaque = this.spots.get(`${n}:0`), map = this.w.map, me = this.w.me(), table = this.plaqueOf(n), list = this.wordList(n);
    if (!plaque || !list) return;
    list.forEach((o, k) => {
      const key = `${n}:w${k}`, d = Math.hypot(o.x - me.x, o.z - me.z);
      if (!this.tins.has(key) && d < TIN_NEAR) {
        const view = wordTinModel(o.word, WORD_TINS[table.lids[k]][1]), y = map.ground(o.x, o.z);
        view.position.set(o.x, y, o.z);
        this.w.scene.add(view);
        this.tins.set(key, { view, n, h: k, x: o.x, z: o.z, y, word: o.word });
      }
      const tin = this.tins.get(key);
      if (!tin) return;
      const g = tin.view.getObjectByName("glint");
      if (g) { g.visible = d < GLINT_NEAR && !this.wrong.has(key); g.rotation.y += dt * 3; }
      if (d < OPEN && (!this.near || d < this.near.d)) this.near = { tin, d };
    });
    if (!this.plaqueRead.has(n) && Math.hypot(plaque.x - me.x, plaque.z - me.z) < READ_AT + 2) {
      this.plaqueRead.add(n);
      SFX.jobStep();
      this.w.toast("You've read the plaque: it's on your card", 2.5);
    }
  }

  /** A word leg's tins and the plaque's table, from the seed: each wrong tin is ruled out by one row,
   *  by its lid or its word, and the true one by none. More players, more tins and a longer table. */
  private plaqueOf(n: number) {
    const had = this.plaques.get(n);
    if (had) return had;
    const s = this.t.legs[n], r = rng(hash("words", this.offer.seed, n));
    const words = shuffled(r, [s.word, ...shuffled(r, WORDS.filter((w) => w !== s.word)).slice(0, s.tins - 1)]);
    const lids = shuffled(r, WORD_TINS.map((_, k) => k)).slice(0, words.length);
    const rows = shuffled(r, words.map((w, k) => (w === s.word ? "" : r() < 0.5 ? `Not the ${WORD_TINS[lids[k]][0]} lid` : `Not ${w}`)).filter(Boolean));
    const table = { words, lids, rows };
    this.plaques.set(n, table);
    return table;
  }

  /** A race K got to first: she digs up the chest. Only a race can be lost. */
  private lose() {
    trailScreensDown();
    const n = this.t.legs.length - 1, s = this.t.legs[n], at = this.spots.get(`${n}:0`) ?? { x: s.tx, z: s.tz };
    const pace = this.paces.get(n)?.text.replace(/<[^>]*>/g, "");
    summary({ kind: `Treasure hunt · ${this.offer.title}`, title: "K got there first", dnf: true, time: clock(this.kTime), medal: "", medalWord: "Lost",
      lines: [`The chest was buried by ${s.n}.`, ...pace ? [pace.replace(/ and dig\.$/, ".")] : []],
      stats: this.stats(Math.min(this.mine, n)), reward: "K's hole is on your map, where the chest was: her note's a second chance today", colour: COLOUR });
    this.done = { won: false, screen: true, text: `K got to the chest first, in ${clock(this.kTime)}`, x: at.x, z: at.z };
  }

  /** The numbers for the end card: tins opened, hints bought, and what else went wrong. */
  private stats(tins: number) {
    const sum = (f: (c: Cost) => number) => this.costs.reduce((a, c) => a + f(c), 0), all = this.t.legs.length - 1;
    const out = [{ k: "Tins found", v: `${tins} / ${all}` }, { k: "Hints bought", v: String(sum((c) => c.ask)) }];
    const jams = sum((c) => c.jam), holes = sum((c) => c.digs ?? 0);
    if (jams) out.push({ k: "Locks jammed", v: String(jams) });
    if (holes) out.push({ k: "Wrong holes", v: String(holes) });
    return out;
  }

  /** Where losing leaves its mark: the chest's hole, dug by K. */
  scarAt() {
    const k = this.t.legs.length - 1, s = this.t.legs[k];
    return s ? this.spots.get(`${k}:0`) ?? { x: s.tx, z: s.tz } : null;
  }

  /**
   * The circle for tin (n, h) after hint k (its current one if k isn't given), off-centre by an
   * amount fixed by the seed. Once the tin's placed here it's round the tin itself, never more than
   * 0.7 of the way out, so the tin is always well inside. Before then (that part of Bath isn't loaded
   * here yet) it's round where the tin was aimed, made big enough to hold anywhere the tin could
   * turn out to be: it firms up round the tin once you're near.
   */
  private ringOf(n: number, h: number, k = this.ringStep(n)) {
    if (k < 0) return null;
    const known = this.targetOf(n, h), at = known ?? this.aim(n, h), spread = known ? 0 : this.reach(n, h);
    const R = Math.max(this.radius(n, k), spread + RING_MARGIN), hi = Math.min(0.7 * R, R - spread - RING_MARGIN), lo = Math.min(0.3 * R, hi);
    const r = rng(hash("ring", this.offer.seed, n, h, k)), a = r() * Math.PI * 2, f = lo + r() * (hi - lo);
    return { x: at.x + Math.cos(a) * f, z: at.z + Math.sin(a) * f, r: R, k, known: !!known };
  }

  /** The furthest tin (n, h) can end up from where it was aimed, however the map round it turns out. */
  private reach(n: number, h: number) {
    const s = this.t.legs[n], a = this.aim(n, h), off = h && s.twin ? 0 : Math.hypot(a.x - s.x, a.z - s.z);
    if (n === this.t.legs.length - 1) return off + PACE_REACH;
    if (s.step === "bearing" || s.step === "sketch") return 7;
    if (s.step === "look") return off + LOOK_REACH;
    if (s.step === "word") return WORD_REACH;
    return STREET_REACH;
  }

  private radius(n: number, k: number) { return n === this.t.legs.length - 1 ? LAST_RING : RINGS[Math.min(k, RINGS.length - 1)]; }
  private maxRing(n: number) { return n === this.t.legs.length - 1 ? 0 : RINGS.length - 1; }
  /** Hints to be had on leg n: three for a tin, one for the chest. */
  private hintsOn(n: number) { return this.maxRing(n) + 1; }
  /** Which of leg n's circles is up: one for each hint had (-1: none yet). Worked out from the hints
   *  themselves, so everyone together (and anyone who joins) has the same circle. */
  private ringStep(n: number) { return Math.min(this.maxRing(n), (this.costs[n]?.ask ?? 0) - 1); }

  /** What there is to find on leg n: the tin (the true one of a plaque's), or the chest. Its circle is
   *  drawn round this, not round the plaque, whose tins stand round the corner from it. */
  private targetOf(n: number, h: number) {
    const s = this.t.legs[n];
    if (s?.step === "word") return this.wordList(n)?.find((o) => o.word === s.word) ?? null;
    return this.spotOf(n, h);
  }

  /** Where leg n's decoy tin stands: a little way from the real one, so it's in the same circle. */
  private decoyOf(n: number) {
    const had = this.decoys.get(n), real = this.spots.get(`${n}:0`), map = this.w.map;
    if (had || !real || !this.t.legs[n]?.decoy) return had ?? null;
    const r = rng(hash("decoy", this.offer.seed, n)), a = r() * Math.PI * 2, f = 14 + r() * 14;
    const tx = real.x + Math.cos(a) * f, tz = real.z + Math.sin(a) * f;
    if (!loadedRound(map, tx, tz, 60)) return null;
    const p = streetSpot(map, tx, tz, 0, 25, 0.6, (x, z) => !map.indoors(x, z) && !wet(map, x, z) && Math.hypot(x - real.x, z - real.z) > 8, 4, 3, r);
    const c = p ? { x: p.x, z: p.z } : firmSpot(map, tx, tz, 15) ?? { x: tx, z: tz };
    this.decoys.set(n, c);
    return c;
  }

  private showRing(n: number, h: number, dt = 0) {
    const key = `${n}:${h}`, ck = h ? "trail2" : "trail", ring = this.ringOf(n, h), colour = h ? "#4f8fd6" : COLOUR;
    this.w.circle(ck, ring && { x: ring.x, z: ring.z, r: ring.r, colour, pulse: true });
    this.glow(key, ring, colour, dt);
  }

  /** A faint ribbon of light along the circle's edge, draped on the ground, while you're near it. */
  private glow(key: string, ring: { x: number; z: number; r: number; k: number } | null, colour: string, dt: number) {
    let g = this.glows.get(key);
    if (g && (!ring || g.k !== ring.k)) { dispose(g.mesh); this.glows.delete(key); g = undefined; }
    if (!ring) return;
    const me = this.w.me(), edge = Math.abs(Math.hypot(me.x - ring.x, me.z - ring.z) - ring.r);
    if (!g) {
      const geo = new THREE.BufferGeometry(), idx: number[] = [];
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((GLOW_SEGS + 1) * 6), 3));
      for (let i = 0; i < GLOW_SEGS; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      geo.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; mesh.renderOrder = 3;
      this.w.scene.add(mesh);
      g = { mesh, k: ring.k, built: 1e9 };
      this.glows.set(key, g);
    }
    g.mesh.visible = edge < RING_SHOWN;
    if (!g.mesh.visible) return;
    (g.mesh.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.2 * Math.sin(performance.now() / 350);
    g.built += dt;
    if (g.built < 2) return;   // the ground under it may still be loading, so it's laid again now and then
    g.built = 0;
    const pos = g.mesh.geometry.getAttribute("position") as THREE.BufferAttribute, map = this.w.map;
    for (let i = 0; i <= GLOW_SEGS; i++) {
      const a = (i / GLOW_SEGS) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      for (let side = 0; side < 2; side++) {
        const rr = ring.r + (side ? 0.6 : -0.6), x = ring.x + c * rr, z = ring.z + sn * rr;
        pos.setXYZ(i * 2 + side, x, map.ground(x, z) + 0.35, z);
      }
    }
    pos.needsUpdate = true;
  }

  /** Inside the circle the tin rattles now and then from where it stands: quicker the nearer you are. */
  private listen(n: number, h: number, spot: { x: number; z: number }, d: number, dt: number) {
    const key = `${n}:${h}`, ring = this.ringOf(n, h), me = this.w.me();
    const inRing = !!ring && Math.hypot(me.x - ring.x, me.z - ring.z) <= ring.r;
    if (!this.w.hear || d > LISTEN_NEAR || (!inRing && d > CLOSE_RATTLE)) return;
    const left = (this.tickIn.get(key) ?? 0.5) - dt;
    if (left > 0) { this.tickIn.set(key, left); return; }
    this.tickIn.set(key, 0.4 + Math.min(d, 90) / 90 * 1.5);
    const [dist, pan] = this.w.hear(spot.x, this.w.map.ground(spot.x, spot.z) + 1, spot.z);
    SFX.tinRattle(dist, pan);
  }

  /** The view from by the tin, looking at the place it's near, inked like an old sketch. */
  private takePicture(n: number, spot: { x: number; z: number }) {
    this.picTried.add(n);
    const s = this.t.legs[n], map = this.w.map, y = map.ground(spot.x, spot.z) + 1.7;
    let lx = s.x, lz = s.z;
    if (Math.hypot(lx - spot.x, lz - spot.z) < 12) {
      const a = rng(hash("view", this.offer.seed, n))() * Math.PI * 2;
      lx = spot.x + Math.cos(a) * 30; lz = spot.z + Math.sin(a) * 30;
    }
    const c = snapshot(this.w.scene, spot.x, y, spot.z, lx, map.ground(lx, lz) + 2.5, lz);
    if (!c) return;
    try { this.pics.set(n, c.toDataURL("image/jpeg", 0.8)); } catch { /* ignore */ }
  }

  hint() {
    const pace = this.pacing(this.mine), s = this.t.legs[this.mine], me = this.w.me();
    if (pace && s && Math.hypot(s.x - me.x, s.z - me.z) < 160) return this.found ? "Hold <b>{use}</b> to lift the chest" : "Hold <b>{use}</b> to dig here";
    if (this.near) {
      const last = this.near.tin.n === this.t.legs.length - 1;
      const tin = this.near.tin;
      if (tin.word) return `<b>{use}</b> Open the tin marked ${esc(tin.word)}`;
      return last ? "<b>{use}</b> Dig up the Bath Bun chest" : this.halvesOf(tin.n).length > 1 ? `<b>{use}</b> Open tin ${tin.h ? "B" : "A"}` : "<b>{use}</b> Open the tin";
    }
    const k = this.ringStep(this.mine) + 1, of = this.hintsOn(this.mine);
    const ask = !this.askReady() ? "" : this.offerT > 0 ? `<b>{use}</b> again to pay for hint ${k + 1} of ${of}` : `<b>{use}</b> Ask a local for a hint (${k + 1} of ${of})`;
    return this.holdsSketch() ? (ask ? `${ask} · hold <b>{use}</b> Study the sketch` : "Hold <b>{use}</b> Study the sketch") : ask;
  }

  /** Whether a local can be asked on this clue: wait, seconds till one can (Infinity: not on this
   *  clue at all), and why not, in words, when it isn't the clock. */
  private askState(): { wait: number; why: string } {
    const n = this.mine, s = this.t.legs[n], me = this.w.me();
    if (!s) return { wait: Infinity, why: "" };
    const k = this.ringStep(n);
    if (k >= this.maxRing(n)) return { wait: Infinity, why: k < 0 ? "" : n === this.t.legs.length - 1 ? "the chest's only hint is had" : "no more hints: the circle's as small as it goes" };
    if (this.pacing(n) && Math.hypot(s.x - me.x, s.z - me.z) < 160) return { wait: Infinity, why: "you're there: count the paces and dig" };
    const wait = Math.max(0, ASK_AFTER - this.legT, ASK_AGAIN - this.askT);
    if (wait > 0) return { wait, why: "" };
    // a closer hint only once the tin's placed here: from afar the circle can't be drawn any tighter, and you'd pay for nothing
    if (k >= 0 && this.halvesOf(n).some((h) => !this.ringOf(n, h)?.known)) return { wait: 0, why: "get nearer for a closer hint" };
    return { wait: 0, why: "" };
  }

  private askReady() { const a = this.askState(); return a.wait === 0 && !a.why; }

  /** What asking a local would get you and cost, before anything's paid. */
  private showOffer() {
    const n = this.mine, k = this.ringStep(n) + 1, of = this.hintsOn(n), last = n === this.t.legs.length - 1, twin = this.halvesOf(n).length > 1;
    const R = this.ringOf(n, 0, k)?.r ?? this.radius(n, k), was = k > 0 ? this.ringOf(n, 0, k - 1)?.r ?? this.radius(n, k - 1) : 0;
    const thing = last ? "the buried chest" : twin ? "each of the twin tins" : `tin ${n + 1}`;
    const get = (k === 0 ? `A search circle ${across(R)} across goes on your map, with ${thing} somewhere inside it.`
      : `The search circle round ${thing} shrinks from ${across(was)} across to ${across(R)}.`)
      + (k + 1 < of ? ` ${of - k - 1} more hint${of - k - 1 > 1 ? "s" : ""} after this, 20 seconds apart.` : " It's the last hint there is for it.");
    const left = this.costs[n] ? legStars(this.costs[n]) : 0;
    const price = this.race ? "Free in a race: it only costs you time"
      : left === 0 ? "Free: this leg has no brass stars left to lose"
      : `Costs 1 brass star: this leg goes from ${"★".repeat(left)}${"☆".repeat(STARS - left)} to ${"★".repeat(left - 1)}${"☆".repeat(STARS - left + 1)}`;
    offer({ head: `Hint ${k + 1} of ${of}`, get, price, go: `<b>{use}</b> again to pay · walk on to keep it` });
  }

  /** A hint's been had on leg n (by you, or by a friend): the circle comes up or draws in, for all to see. */
  private shrunk(n: number, from: string) {
    this.askT = 0;   // anyone's hint starts the wait, so two of you don't pay for the same step at once
    if (n !== this.mine) return;
    const k = this.ringStep(n), of = this.hintsOn(n), R = this.ringOf(n, 0)?.r ?? this.radius(n, k), last = n === this.t.legs.length - 1;
    const who = from === this.w.selfId ? `${pickOf(rng(hash("local", this.offer.seed, n, k)), LOCALS)} ` : `${esc(this.w.nameOf(from))} asked a local. `;
    const thing = last ? "The chest is" : this.halvesOf(n).length > 1 ? "Both tins are" : "The tin is";
    callout(k === 0 ? "A search circle's on your map" : "The search area is shrinking!", `${who}Hint ${k + 1} of ${of}: ${thing} somewhere in a circle ${across(R)} across.`);
    SFX.searchShrink();
    for (const h of this.halvesOf(n)) this.showRing(n, h);
  }

  use() {
    if (this.done) return false;
    if (this.near && !this.pacing(this.near.tin.n)) { this.open(this.near.tin); return true; }
    const s = this.t.legs[this.mine], me = this.w.me();
    if (this.pacing(this.mine) && s && Math.hypot(s.x - me.x, s.z - me.z) < 160) return true;   // the spade's in your hands: digging is a hold, not a press
    // holding the sketch, a hold of use studies it: only a tap, told on letting go, asks a local
    if (this.holdsSketch()) { this.askOnLetGo = this.askReady(); return true; }
    return this.ask();
  }

  private holdsSketch() { return !!this.t.legs[this.mine]?.sketch && this.holders(this.mine).includes(this.w.selfId); }

  /** A local's asked: the first time it only says what the hint gives and costs, the second pays. */
  private ask(): boolean {
    if (this.done || !this.askReady()) return false;
    if (this.offerT <= 0) { this.offerT = ASK_CONFIRM; this.showOffer(); return true; }
    this.offerT = 0; offer(null);
    const n = this.mine;
    this.spend(n, "ask", this.costs[n]?.ask ?? 0);
    return true;
  }

  /** A brass star lost on leg n, for everyone doing it with you. */
  private spend(n: number, what: "ask" | "jam" | "decoy", step?: number) {
    const msg = { k: "el", s: this.offer.seed, n, w: what, h: step };
    if (!this.race) this.w.send("qe", msg);
    this.event(msg, this.w.selfId);
  }

  /** Whether the next leg should be twin tins: together, where the trail has a pair (on your own too, with longer to do it). */
  private twinNext(n: number) {
    return !this.race && !!this.t.legs[n]?.twin ? 1 : 0;
  }

  /** Seconds to open the second of twin tins: half a minute between friends, or long enough to get there quick on your own. */
  private twinWindow(n: number) {
    const s = this.t.legs[n];
    if (this.w.players().length >= 2 || !s?.twin) return TWIN_WINDOW;
    return Math.round(TWIN_WINDOW + Math.hypot(s.twin.tx - s.tx, s.twin.tz - s.tz) / TWIN_SOLO_PACE);
  }

  private open(tin: Tin) {
    const n = tin.n;
    if (tin.word) {
      const key = `${n}:w${tin.h}`;
      if (tin.word !== this.t.legs[n].word) {
        if (this.wrong.has(key)) { this.w.toast("Still the wrong word", 1.5); return; }
        this.wrong.add(key);
        this.spend(n, "decoy");
        SFX.warmer(false);
        this.w.toast("Not what the plaque said: an empty tin. That's a brass star gone", 3);
        return;
      }
      this.unlock(tin, () => this.sendTin(n));
      return;
    }
    if (tin.decoy) {
      if (this.emptied.has(n)) { this.w.toast("Empty, still", 1.5); return; }
      this.emptied.add(n);
      this.spend(n, "decoy");
      SFX.warmer(false);
      this.w.toast("Nothing here but crumbs: a decoy. That's a brass star gone", 3);
      return;
    }
    this.unlock(tin, () => this.opened(tin));
  }

  /** A real tin's lock: up it comes, and once the wheels are right, then() opens the tin. The chest has none. */
  private unlock(tin: Tin, then: () => void) {
    const n = tin.n, key = `${n}:${tin.word ? "w" : tin.h}`;
    if (n === this.t.legs.length - 1) { then(); return; }
    const lock = this.lockOf(key, n, tin.x, tin.z);
    if (!lock) { this.w.toast("The lock's stiff: give it a moment", 1.5); return; }
    this.lockAt = { x: tin.x, z: tin.z, key };
    this.lock.show({
      ask: lock.ask, code: lock.code,
      onOpen: () => { this.wheels.delete(key); this.lockAt = null; SFX.jobStep(); then(); },
      onJam: () => { this.spend(n, "jam"); this.w.toast("Clunk. Jammed for ten seconds, and a brass star gone", 2.5); },
    }, this.wheels.get(key));
  }

  /** What tin (n, h)'s lock asks, read off the place round it: the house it stands at, or things to
   *  count in the park it's in, or the shop beside it; failing all those, the code's been scratched
   *  on the lid. Null until the place round it is loaded; the same for everyone after that. */
  private lockOf(key: string, n: number, x: number, z: number) {
    const had = this.locks.get(key);
    if (had) return had;
    const map = this.w.map, r = rng(hash("lock", this.offer.seed, key)), s = this.t.legs[n];
    if (!loadedRound(map, x, z, 140)) return null;
    let facts: Fact[] | null = null, ask = "";
    const house = s.step === "look" ? this.houses.get(n) ?? null : houseNear(map, x, z, 30);
    if (house) { facts = shuffled(r, house.facts); ask = `My code's on ${house.name}: `; }
    if (!facts) {
      const place = placeAt(map, x, z), counts = place ? countsIn(map, place.r, place.n) : null;
      const shop = shopNear(map, x, z, 25);
      const all = [...counts ?? [], ...shop ? [shop] : []];
      const pick = shuffled(r, all).sort((a, b) => Number(b.n > 0) - Number(a.n > 0)).slice(0, 3);
      if (pick.length >= 3 && pick.some((f) => f.n > 0)) { facts = shuffled(r, pick); ask = "My code: count "; }
    }
    let lock: { code: number[]; ask: string };
    if (facts) lock = { code: facts.map((f) => f.n), ask: `${ask}${facts.map((f) => esc(f.ask)).join(", then ")}.` };
    else {
      const code = [0, 1, 2].map(() => Math.floor(r() * 10));
      lock = { code, ask: `Someone's scratched <b>${code.join(" ")}</b> into the lid. Lucky.` };
    }
    this.locks.set(key, lock);
    return lock;
  }

  /** A look leg's house: picked out from its street once that's loaded here, the same for everyone. */
  private houseOf(n: number): House | null | undefined {
    if (this.houses.has(n)) return this.houses.get(n);
    const s = this.t.legs[n], map = this.w.map;
    if (!loadedRound(map, s.x, s.z, 230)) return undefined;
    let where: ((x: number, z: number) => boolean) | undefined;
    if (s.kind === "street") {
      const lines = [map, ...map.tilesNear(s.x, s.z, 200)].flatMap((m) => m.d.rd).filter((rd) => rd.n === s.n).map((rd) => rd.p);
      where = (x, z) => lines.some((p) => p.some((q, i) => i > 0 && segDist(x, -z, p[i - 1], q) < 22));
    }
    const house = houseNear(map, s.x, s.z, 120, where, where ? 100 : 60);
    this.houses.set(n, house);
    return house;
  }

  /** A real tin opened: half of twin tins, or the leg done. */
  private opened(tin: Tin) {
    const n = tin.n, now = performance.now() / 1000;
    if (this.halvesOf(n).length > 1) {
      const other = 1 - tin.h;
      const win = this.twinWindow(n);
      if (now - this.halves[other] > win) {
        this.halves[tin.h] = now; this.halfBy[tin.h] = this.w.selfId;
        this.w.send("qe", { k: "half", s: this.offer.seed, n, h: tin.h });
        SFX.jobStep();
        this.w.toast(`Tin ${tin.h ? "B" : "A"}'s open! ${this.w.players().length >= 2 ? "Someone open" : "Get to"} tin ${other ? "B" : "A"} within ${win} seconds`, 3);
        return;
      }
    }
    this.sendTin(n);
  }

  private sendTin(n: number) {
    const msg = { k: "tin", s: this.offer.seed, n, t: Date.now(), sp: this.twinNext(n + 1) };
    this.w.send("qe", msg);
    this.event(msg, this.w.selfId);
  }

  event(d: any, from: string) {
    if (this.done) return;
    if (d.k === "el") {
      const n = Number(d.n), c = this.costs[n], what = d.w;
      if (!c || (this.race && from !== this.w.selfId) || (what !== "ask" && what !== "jam" && what !== "decoy")) return;
      // two of you asking for the same hint at once (h: how many the asker had seen): only the first
      // to arrive is a hint, so only the first is paid for; and none past the last
      if (what === "ask" && (c.ask > this.maxRing(n) || (d.h !== undefined && Number(d.h) !== c.ask))) return;
      c[what as "ask" | "jam" | "decoy"]++;
      if (what === "ask") {
        if (from !== this.w.selfId) this.w.feed(`<b style="color:${this.w.colourOf(from)}">${esc(this.w.nameOf(from))}</b> asked a local: hint ${Math.min(c.ask, this.hintsOn(n))} of ${this.hintsOn(n)}`);
        this.shrunk(n, from);
      }
      return;
    }
    if (d.k === "saw") {
      const n = Number(d.n), i = Number(d.i) || 0, key = `${n}:${i}`, hi = this.t.legs[n]?.hills[i];
      if ((this.race && from !== this.w.selfId) || n !== this.mine || !hi || this.saw.has(key)) return;
      this.saw.set(key, from);
      SFX.jobStep();
      if (from === this.w.selfId) {
        const end = this.lineEnd(n, i);
        this.w.pencil?.(`bearing${i}`, [Math.round(hi.x), Math.round(hi.z), Math.round(end.x), Math.round(end.z)]);
        this.w.toast("There's the gold line, running towards the tin. It's pencilled on your map: the tin's where it crosses the other", 4.5);
      } else this.w.feed(`<b style="color:${this.w.colourOf(from)}">${esc(this.w.nameOf(from))}</b> can see the line from ${esc(hi.n)}: ask them where it goes`);
      return;
    }
    if (d.k === "hole") {
      const x = Number(d.x), z = Number(d.z), c = this.costs[Number(d.n)];
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      if (c && (!this.race || from === this.w.selfId)) c.digs = (c.digs ?? 0) + 1;
      if (from !== this.w.selfId) addHole(this.w.scene, this.w.map, x, z);
      return;
    }
    if (d.k === "found") {
      if ((this.race && from !== this.w.selfId) || Number(d.n) !== this.mine || this.found) return;
      this.found = true;
      const me = this.w.me(), at = this.spots.get(`${this.mine}:0`);
      if (at && Math.hypot(at.x - me.x, at.z - me.z) < 60) SFX.dig();
      this.w.toast(from === this.w.selfId ? "Clunk! Wood under the spade: the chest! Now lift it" : `${this.w.nameOf(from)} hit wood: the chest's found!`, 3.5);
      return;
    }
    if (d.k === "lift") {
      if (this.race) return;
      if (d.on) this.liftBy.add(from); else this.liftBy.delete(from);
      return;
    }
    if (d.k === "half") {
      const n = Number(d.n), h = Number(d.h) ? 1 : 0;
      if (this.race || n !== this.mine) return;
      const now = performance.now() / 1000;
      this.halves[h] = now; this.halfBy[h] = from;
      const win = this.twinWindow(n);
      this.w.feed(`<b style="color:${this.w.colourOf(from)}">${esc(this.w.nameOf(from))}</b> opened tin ${h ? "B" : "A"}: ${win} seconds to open the other!`);
      // both open at once: whoever opened the other one calls it
      if (now - this.halves[1 - h] <= win && this.halfBy[1 - h] === this.w.selfId) this.sendTin(n);
      return;
    }
    if (d.k !== "tin") return;
    const key = this.race ? from : "", n = Number(d.n);
    if ((this.at.get(key) ?? 0) !== n) return;   // already past it (two at once)
    this.at.set(key, n + 1);
    const last = n + 1 >= this.t.legs.length, mine = from === this.w.selfId, me = key === "" || mine;
    if (mine && this.costs[n]) this.costs[n].by = from;
    else if (!this.race && this.costs[n] && !this.costs[n].by) this.costs[n].by = from;
    if (me) {
      this.legT = 0; this.askT = ASK_AGAIN; this.near = null;
      this.offerT = 0; offer(null);
      if (!last) this.clueT = CLUE_UP;   // the next clue, big, without having to ask for it
      this.halves = [-1e9, -1e9]; this.halfBy = ["", ""];
      if (d.sp) this.twins.add(n + 1);
      this.w.circle("trail", null); this.w.circle("trail2", null);
      this.clearGlows();
      if (this.line) { dispose(this.line.mesh); this.line = null; }
      for (let i = 0; i < 3; i++) this.w.circle(`trailhi${i}`, null);
      this.w.wipe?.();
      this.soundT = 0;
    }
    if (!last) {
      if (me) {
        SFX.jobStep();
        const twin = this.twins.has(n + 1) ? " Twin tins: split up!" : n + 2 === this.t.legs.length ? " There's a spade in it, for the chest." : "";
        this.w.toast(`${mine ? "Got it!" : `${this.w.nameOf(from)} found the tin.`} Next riddle on the card.${twin}`, 3.5);
      } else this.w.feed(`<b style="color:${this.w.colourOf(from)}">${esc(this.w.nameOf(from))}</b> is on clue ${n + 2} of ${this.t.legs.length}`);
      return;
    }
    // the chest: dug up, and done
    const tin = [...this.tins.values()].find((t) => t.n === n);
    if (tin) this.digUp(tin);
    const s = this.t.legs[n], at = tin ?? { x: s.tx, z: s.tz };
    if (this.race) this.raceEnd(from, mine, Number(d.t), at);
    else this.togetherEnd(at);
  }

  /** A race over: your time against the par, and K's to beat next time. */
  private raceEnd(from: string, mine: boolean, t: number, at: { x: number; z: number }) {
    trailScreensDown();
    const secs = (t - this.started) / 1000, par = this.t.par;
    const medal = secs <= par ? "gold" : secs <= par * SILVER ? "silver" : "bronze";
    const score = Math.max(0, Math.round(1000 + (par - secs) * 2));
    let text = `${mine ? "You" : this.w.nameOf(from)} reached the chest first, in ${clock(secs)}, ahead of K`;
    setKBest(this.offer.seed, secs);
    if (mine) {
      addRosette(medal);
      text += ` (${medal}, score ${score}). A ${medal} rosette for your jacket!`;
      this.w.announce?.();
    }
    const all = this.t.legs.length - 1;
    summary({ kind: `Treasure hunt · ${this.offer.title}`, title: mine ? "You won!" : `${this.w.nameOf(from)} won`, time: clock(secs), medal: mine ? medal : "",
      medalWord: mine ? undefined : "Beaten", lines: [`Par ${clock(par)} · K would have been ${clock(this.kTime)}`],
      stats: [...this.stats(mine ? all : Math.min(this.mine, all)), ...mine ? [{ k: "Score", v: String(score) }] : []],
      reward: mine ? `${this.offer.stars} prize${this.offer.stars > 1 ? "s" : ""} at the chest and a ${medal} rosette for your jacket` : undefined, colour: COLOUR });
    this.done = { won: true, screen: true, text, x: at.x, z: at.z, wear: medal === "gold" && mine ? ["helmet"] : undefined,
      grade: mine ? { tier: medal === "gold" ? 3 : medal === "silver" ? 2 : 1, best: { v: (medal === "gold" ? 3 : medal === "silver" ? 2 : 1) * 1e5 - secs, text: medal } } : undefined };
  }

  /** Done together: the rosette from the brass stars, and the end card telling how each leg went. */
  private togetherEnd(at: { x: number; z: number }) {
    trailScreensDown();
    const got = this.costs.reduce((a, c) => a + legStars(c), 0), of = this.costs.length * STARS, share = got / of;
    const medal = share >= GOLD_SHARE ? "gold" : share >= SILVER_SHARE ? "silver" : "bronze";
    addRosette(medal);
    const lines = [`${got} of ${of} brass stars: a ${medal} rosette for your jacket!`, ...this.costs.map((c, k) => this.moment(c, k))];
    let newBest = false;
    if (this.daily) {
      const day = dayNumber(), best = dailyBest(day);
      newBest = best !== null && got > best;
      if (best === null || got > best) { try { localStorage.setItem(DAILY_KEY, JSON.stringify({ day, best: got })); } catch { /* ignore */ } }
      this.w.feed(`Trail of the day: <b>${got} of ${of}</b> brass stars${best !== null ? (got > best ? ", a new best!" : `, your best ${best}`) : ""}`);
    }
    this.w.announce?.();
    const all = this.t.legs.length - 1;
    summary({ kind: `Treasure hunt · ${this.offer.title}`, title: "Chest dug up!", time: clock((Date.now() - this.started) / 1000), medal,
      lines: [`${got} of ${of} brass stars`], best: newBest ? "NEW BEST TODAY!" : undefined, stats: this.stats(all),
      rows: this.costs.map((c, k) => ({ name: this.moment(c, k).replace(/^\S+ /, ""), time: "★".repeat(legStars(c)) + "☆".repeat(STARS - legStars(c)) })),
      reward: `${this.offer.stars} prize${this.offer.stars > 1 ? "s" : ""} at the chest and a ${medal} rosette for your jacket`, colour: COLOUR });
    this.done = { won: true, screen: true, text: lines[0], x: at.x, z: at.z, wear: medal === "gold" ? ["helmet"] : undefined,
      grade: { tier: medal === "gold" ? 3 : medal === "silver" ? 2 : 1, best: { v: got, text: `${got} of ${of} brass stars` } } };
  }

  /** How leg k went, in a line for the end card. */
  private moment(c: Cost, k: number) {
    const who = c.by ? this.w.nameOf(c.by) : "Someone", stars = "★".repeat(legStars(c)) + "☆".repeat(STARS - legStars(c));
    const bits = [c.ask && `${c.ask === 1 ? "a local asked" : `${c.ask} locals asked`}`, c.jam && `${c.jam === 1 ? "a jammed lock" : `${c.jam} jams`}`,
      c.decoy && `${c.decoy === 1 ? "a decoy opened" : `${c.decoy} decoys opened`}`, c.digs && `${c.digs === 1 ? "a hole with a worm in it" : `${c.digs} holes dug`}`].filter(Boolean);
    const last = k === this.costs.length - 1;
    return `${stars} Leg ${k + 1}: ${bits.length ? `${who} got there, with ${bits.join(", ")}` : `${who} ${last ? "found the chest" : "opened it"} first time`}`;
  }

  /** The chest rises out of its mound, the lid flies open and coins burst out. */
  private digUp(tin: Tin) {
    const geo = new THREE.CylinderGeometry(0.06, 0.06, 0.015, 8);
    const coins = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: "#f2c94c", toneMapped: false }), COINS);
    coins.position.set(tin.x, tin.y, tin.z);
    coins.frustumCulled = false;
    const v = new Float32Array(COINS * 6);
    for (let k = 0; k < COINS; k++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.2;
      v.set([0, 0.6, 0, Math.cos(a) * s, 4 + Math.random() * 3.5, Math.sin(a) * s], k * 6);
      coins.setMatrixAt(k, _m.makeScale(0, 0, 0));
    }
    coins.visible = false;
    this.w.scene.add(coins);
    this.chestFx = { t: 0, tin, coins, v, sounded: false };
    const me = this.w.me();
    if (Math.hypot(tin.x - me.x, tin.z - me.z) < 60) SFX.dig();
  }

  private chestUpdate(dt: number) {
    const fx = this.chestFx;
    if (!fx) return;
    fx.t += dt;
    const g = fx.tin.view, crate = g.getObjectByName("crate"), lid = g.getObjectByName("lid"), cross = g.getObjectByName("cross");
    const up = Math.min(1, fx.t / 1.1);
    if (crate) crate.position.y = -0.55 + up * 0.6;
    if (cross) cross.visible = fx.t < 0.3;
    const glint = g.getObjectByName("glint");
    if (glint) glint.visible = false;
    if (fx.t > 1.1) {
      if (lid) lid.rotation.x = Math.min(1.9, (fx.t - 1.1) * 6);
      if (!fx.sounded) {
        fx.sounded = true;
        const me = this.w.me();
        if (Math.hypot(fx.tin.x - me.x, fx.tin.z - me.z) < 80) SFX.chest();
      }
      // the coins: up and out, spinning, and down again
      const ct = Math.min(fx.t - 1.1, 2.6);
      fx.coins.visible = fx.t < 4;
      for (let k = 0; k < COINS; k++) {
        const o = k * 6, tk = Math.max(0, ct - (k % 6) * 0.05);
        _p.set(fx.v[o] + fx.v[o + 3] * tk, Math.max(0.02, fx.v[o + 1] + fx.v[o + 4] * tk - 4.9 * tk * tk), fx.v[o + 2] + fx.v[o + 5] * tk);
        _q.setFromEuler(_e.set(tk * 9 + k, tk * 5, 0));
        fx.coins.setMatrixAt(k, _m.compose(_p, _q, tk > 0 ? ONE : ZERO));
      }
      fx.coins.instanceMatrix.needsUpdate = true;
    }
  }

  progress() { return { at: [...this.at], tw: [...this.twins], v: [...this.saw], c: this.race ? undefined : this.costs, pc: this.pc, f: this.found ? 1 : 0 }; }
  restore(p: any) {
    if (Number(p?.pc) > 0 && Number(p.pc) !== this.pc) this.build(Number(p.pc));
    if (p?.f) this.found = true;
    if (Array.isArray(p?.c)) p.c.forEach((c: any, k: number) => {
      const mine = this.costs[k];
      if (!mine || !c) return;
      mine.ask = Number(c.ask) || 0; mine.jam = Number(c.jam) || 0; mine.decoy = Number(c.decoy) || 0; mine.by = String(c.by ?? "");
    });
    if (Array.isArray(p?.v)) for (const v of p.v) if (Array.isArray(v)) this.saw.set(String(v[0]), String(v[1]));
    if (Array.isArray(p?.at)) for (const [k, v] of p.at) this.at.set(String(k), Number(v) || 0);
    if (Array.isArray(p?.tw)) for (const n of p.tw) this.twins.add(Number(n));
  }

  /** Leg n's clue as the card, the splash and the clue card show it (html). */
  private clueHtml(n: number) {
    const s = this.t.legs[n], total = this.t.legs.length;
    let clue = "";
    if (s) {
      const pic = this.pics.get(n), [a, b] = this.clues[n] ?? ["", ""];
      if (pic) clue = `Where was this drawn?${this.vague(n)}<img src="${pic}" alt="" style="display:block;width:100%;max-width:240px;image-rendering:pixelated;margin-top:4px">`;
      else clue = this.stepClue(n, a) + (s.pic ? "<br><i>A picture comes when you're nearer</i>" : "");
      if (this.halvesOf(n).length > 1) {
        const ids = this.w.players().map((p) => p.id).sort(), mine = ids.indexOf(this.w.selfId) % 2;
        const win = this.twinWindow(n), solo = this.w.players().length < 2;
        const now = performance.now() / 1000, open = [0, 1].find((h) => now - this.halves[h] <= win);
        const wait = open !== undefined ? `<br><b>Tin ${open ? "B" : "A"} is open: ${Math.ceil(win - (now - this.halves[open]))} s to open tin ${open ? "A" : "B"}!</b>` : "";
        clue = `Twin tins: open both within ${win} seconds (${solo ? "on your own, so be quick between them" : `you try ${mine ? "B" : "A"}`}).<br>A: ${clue}<br>B: ${b}${wait}`;
      }
    }
    if (s && n < total - 1) {
      const me = this.w.me();
      for (const t of this.tins.values()) {
        if (t.n !== n || t.decoy || t.sign || (t.word && t.word !== s.word) || Math.hypot(t.x - me.x, t.z - me.z) > TIN_NEAR) continue;
        const lock = this.lockOf(`${n}:${t.word ? "w" : t.h}`, n, t.x, t.z);
        if (lock) clue += `<br>The tin's lock: ${lock.ask}`;
        break;
      }
    }
    return clue;
  }

  /** Where the hints stand on this clue, for the card: the circle that's up, and when the next can be had or why not. */
  private hintLine() {
    const n = this.mine, k = this.ringStep(n), of = this.hintsOn(n), { wait, why } = this.askState();
    const ring = k >= 0 ? this.ringOf(n, 0) : null;
    const had = ring ? `hint ${k + 1} of ${of}: circle ${across(ring.r)} across` : "";
    const next = why ? `<span style="opacity:.6">${why}</span>`
      : wait === Infinity ? ""
      : wait > 0 ? `next hint in <b>${clock(Math.ceil(wait))}</b>`
      : `<b>{use}</b> ask a local for hint ${k + 2} of ${of}`;
    return [had, next].filter(Boolean).join(" · ");
  }

  card(): Card {
    const n = this.mine, total = this.t.legs.length, s = this.t.legs[n];
    const lead = this.race ? Math.max(0, ...[...this.at].filter(([k]) => k !== this.w.selfId).map(([, v]) => v)) : 0;
    const clue = this.clueHtml(n);
    const got = this.costs.slice(0, n).reduce((a, c) => a + legStars(c), 0), here = this.costs[n] ? legStars(this.costs[n]) : 0;
    const sub = this.race
      ? [`par ${clock(this.t.par)}`, `K reaches the chest at ${clock(this.kTime)} (${this.kAt} of ${total} so far)`, lead ? `best rival on clue ${Math.min(total, lead + 1)}` : "", this.hintLine()]
      : [`brass stars ${got}${n < total ? ` + ${"★".repeat(here)}${"☆".repeat(STARS - here)}` : ""}`, this.hintLine()];
    return {
      line: `Clue ${n + 1} of ${total}${n === total - 1 ? " (the chest)" : ""}: ${clue}`,
      sub: sub.filter(Boolean).join(" · "),
      bar: n / total,
      progress: `${Math.min(n + 1, total)} / ${total}`,
      timer: this.race ? clock((Date.now() - this.started) / 1000) : undefined,
      stage: s ? { key: `c${n}`, title: n === total - 1 ? "The chest!" : `Clue ${n + 1} of ${total}` } : undefined,
    };
  }

  /** On a one-star trail, which way the place is from where the leg starts (" Somewhere south of here."); otherwise nothing. */
  private vague(n: number, x = this.t.legs[n].x, z = this.t.legs[n].z) {
    if (this.offer.stars > 1) return "";
    const from = this.legStart(n);
    return ` Somewhere ${compassWord(x - from.x, z - from.z)} of here.`;
  }

  /** The clue for leg n as its kind of step puts it; riddle: the leg's riddle, for the steps that use one. */
  private stepClue(n: number, riddle: string) {
    const s = this.t.legs[n], from = this.legStart(n);
    switch (s.step) {
      case "bearing": {
        const names = s.hills.map((h) => `<b>${esc(h.n)}</b>`), list = names.length > 2 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join(" and ");
        const friends = this.w.players().length >= 2;
        const seen = s.hills.map((h, i) => {
          const by = this.saw.get(`${n}:${i}`);
          return by ? `<br>${by === this.w.selfId ? "You've" : `${esc(this.w.nameOf(by))} has`} seen the line from ${esc(h.n)}${by === this.w.selfId ? " (it's on your map)" : ""}.` : "";
        }).join("");
        return `${names.length === 3 ? "Three" : "Two"} look-outs: ${list} (ringed on the map). From each, a gold line runs along the ground towards the tin, `
          + `and only shows to whoever's up there. The tin's where the lines cross.${friends ? " Split up, one of you on each, and talk." : ""}${seen}`;
      }
      case "sketch": {
        const holders = this.holders(n), mine = holders.includes(this.w.selfId), solo = this.w.players().length < 2;
        const others = holders.filter((id) => id !== this.w.selfId).map((id) => `<b>${esc(this.w.nameOf(id))}</b>`).join(" and ");
        const near = `${riddle}<br>`;
        if (solo) return `${near}A sketch map of round there, with an X on it. Hold <b>{use}</b> to study it; you can't see the big map while you do.`;
        if (!mine) return `${near}${others} ${holders.length > 1 ? "hold" : "holds"} the sketch map, with an X on it. Get them to talk you in.`;
        return `${near}You hold the sketch map${holders.length > 1 ? ` (torn: ${others} ${holders.length > 2 ? "have" : "has"} the rest)` : ""}. Hold <b>{use}</b> to study it, and talk the others in. You can't see the big map while you do.`;
      }
      case "sound": {
        const bell = s.kind === "church" || s.kind === "rest";
        return `Listen: ${bell ? "a bell is tolling" : "a busker is whistling a tune"} somewhere near the tin. Follow it by ear.${this.vague(n)}`;
      }
      case "split": {
        const [ha, hb] = halves(keyOf(s.n).key), ids = this.w.players().map((p) => p.id).sort(), friends = ids.length >= 2;
        const mine = friends ? ids.indexOf(this.w.selfId) % 2 : 0, note = this.noteOf(n) ?? { x: from.x, z: from.z };
        const where = `It's ${KIND_WORD[s.kind]}.${this.vague(n)}`;
        if (this.halfRead.has(n)) return `<b class="clue">${ha}</b><br><b class="clue">${hb}</b><br>Put the halves together. ${where}`;
        const pinned = `the other half is pinned to a post ${far(Math.hypot(note.x - from.x, note.z - from.z))} from where this clue began`;
        return `Half a clue: <b class="clue">${mine ? hb : ha}</b><br>${friends ? `Your friends have the other half: put your heads together, or read it where ${pinned.replace("the other half is ", "it's ")}.` : `And ${pinned}.`} ${where}`;
      }
      case "look": {
        const house = this.houses.get(n);
        if (house) return `${riddle}<br>There, find <b>${esc(house.name)}</b>. Its tin's on the doorstep (or out on the street, if the garden's shut in), and its lock asks about the house.`;
        if (house === null) return riddle;
        return `${riddle}<br>When you're there, you'll be told what to look for.`;
      }
      case "word":
{
        const t = this.plaqueOf(n), friends = this.w.players().length >= 2;
        const read = this.plaqueRead.has(n) ? `<br>The plaque says: ${t.rows.map((r) => `<b>${esc(r)}</b>`).join("; ")}.` : "";
        return `${riddle}<br>There's a plaque there that rules out all but one of ${t.words.length} tins standing round the corner, out of sight of it. `
          + `${friends ? "One of you read, the others open: a" : "A"} wrong tin costs a brass star.${read}`;
      }
      default: {
        const pace = n === this.t.legs.length - 1 ? this.pacing(n) : null;
        if (pace) return `${riddle}<br>${pace.text}${this.found ? " <b>The chest's found: lift it!</b>" : ""}`;
        if (pace === undefined && n === this.t.legs.length - 1) return `${riddle}<br>You've a spade from the last tin: there'll be paces to count when you're there.`;
        return riddle;
      }
    }
  }

  private clearGlows() {
    for (const g of this.glows.values()) dispose(g.mesh);
    this.glows.clear();
    this.tickIn.clear();
  }

  /** Held still while you're at a lock. */
  held() { return this.lock.open && this.lockAt ? { x: this.w.me().x, z: this.w.me().z } : null; }

  end() {
    trailScreensDown();
    this.lock.hide();
    this.keys.abort();
    this.sketchEl?.remove(); this.sketchEl = null;
    this.sketchBtn?.remove(); this.sketchBtn = null;
    this.digBtn?.remove(); this.digBtn = null;
    this.clearGlows();
    for (const tin of this.tins.values()) dispose(tin.view);
    this.tins.clear();
    if (this.chestFx) { dispose(this.chestFx.coins); this.chestFx = null; }
    if (this.line) { dispose(this.line.mesh); this.line = null; }
    this.w.wipe?.();
    if (this.noteView) { dispose(this.noteView.view); this.noteView = null; }
    this.pics.clear();
    this.w.circle("trail", null); this.w.circle("trail2", null);
    for (let i = 0; i < 3; i++) this.w.circle(`trailhi${i}`, null);
  }
}
