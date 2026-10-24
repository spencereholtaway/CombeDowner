// The yesterday half of the Chronicle (daily.ts is the paper and lays out its one page; this writes
// the pieces): "Yesterday in <map name>", written each morning from what happened in the game the
// day before. A small day log keeps the notable things (pubs won back or lost, with the Gaffer and how close it was, flags shot
// and the best combo, squares cleared, jobs failed, trails solved or given up, records set, scars
// left or mended), and on the first load of a new day (midnight GMT, when the Flag Lads start
// again: invasion.ts) yesterday's log becomes the page. It has the flags' peak and end in the strap,
// a lead story picked by drama (the closest finish, the biggest win or the worst loss), the scars
// still showing, a flag league if you had company (your own numbers if not), Gaffer watch for
// today's Gaffer and three small items. A first-timer gets a welcome page about the Flag Lads
// arriving. The stories are templates with a few ways of saying each thing, picked by the day so
// the page reads the same all day. As in invasion.ts, the joke is on the Flag Lads, never on who
// anybody is.
//
// The Chronicle shows these pieces on its page once a day when you join (firstToday), under Tab, and
// from the pause menu or a noticeboard (N). The lead's photo is a small sepia grab of the scene
// (snapshot.ts) taken once, when it happens, if you're near enough to see it; otherwise a drawing
// stands in.
//
// Who decides what: the day log is kept per map, per room and per day, on each player's machine
// ("cd-paper:<map id>:<room>:<day>", "solo" for a game on your own, with a list of them under
// "cd-paper:<map id>"), so yesterday's paper is about that room, and players who play together get
// the same story. Room events (pubs won and lost, squares cleared, the town flag-free, scars left
// and put right) are the host's, heard in the messages it sends everyone; your own (flags, combos,
// jobs, records) you log yourself, and the league is counted from everyone's "flag down" messages.
// When someone joins, each of us sends them our log for the room and day ("pl", without the
// photos); everyone merges what's new by each event's id, and the host passes on what it's added.
// Older pages don't know "pl" and ignore it. A room you've not had a day in shows the page of the
// room you played in last.
import type * as THREE from "three";
import type { GameMap } from "./map";
import { snapshot } from "./snapshot";
import { morningGaffer } from "./invasion";
import { nameOf, scars, squareOf } from "./yours";

const DAY = 24 * 3600 * 1000;
const today = () => Math.floor(Date.now() / DAY);
const MAX_EV = 80, MAX_PHOTOS = 4;
const PHOTO_REACH = 300;            // metres: further than this and the scenery may not be there to photograph

export interface Ev {
  k: "pub" | "clr" | "sq" | "free" | "job" | "rec" | "scar" | "fix" | "boss";
  i?: string;                       // which event it is, the same in everyone's log for one the whole room saw
  t?: number;                       // when (ms)
  wh?: string;                      // where, in words: the street or the pub
  tx?: string;                      // what, in words
  who?: string;                     // who did it (for a pub, everyone who was there, by name, with commas)
  kd?: string;                      // a job's kind, as its poster says it ("Treasure trail")
  won?: 0 | 1;
  off?: 0 | 1;                      // a job called off
  pub?: string; g?: string; tr?: string[];
  sp?: number;                      // seconds to spare on the clock when the crew got to the pub
  du?: number;                      // seconds the fight took
  v?: 0 | 1;                        // the Gaffer's cousin's takeover
  ph?: string;                      // the photo, a small jpeg data URL
}
/** One room's day: what the paper is written from. */
interface Log {
  d: number; room: string; used: 0 | 1; ev: Ev[];
  pk: number; end: number;          // flags up: the day's peak and where it ended, 0 to 100
  lg: Record<string, number>;       // flags shot, by player name
  cb: Record<string, [number, string]>;   // best combo by player name, and where
  me: string;                       // your name that day
}
/** Which day logs there are for this map (room, day; the latest played last), and when the paper was last shown. */
interface Index { seen: number; first: number; logs: [string, number][] }
const KEEP = 12;                    // day logs kept per map
const SAME = 120000;                // ms: two players' word of one room event this close together is the same event

let id = "", place = "", room = "";
let I: Index = { seen: -1, first: 0, logs: [] };
let L: Log | null = null;
let dirty = false, ticks = 0;
let names: (id: string) => string = () => "Someone";
let myName = "You";
let map: GameMap | null = null;
let want: { ev: Ev; x: number; z: number; mx: number; mz: number } | null = null;

const idxKey = () => `cd-paper:${id}`;
const logKey = (r: string, d: number) => `cd-paper:${id}:${r}:${d}`;
const fresh = (): Log => ({ d: today(), room, used: 0, ev: [], pk: 0, end: 0, lg: {}, cb: {}, me: myName });
function read<T>(k: string): T | null { try { return JSON.parse(localStorage.getItem(k) ?? "null"); } catch { return null; } }
function write(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }

function load(mapId: string, name: string) {
  place = name;
  if (id === mapId) return;
  id = mapId; L = null;
  const d = read<Index>(idxKey());
  I = d && Array.isArray(d.logs) ? { seen: +d.seen || -1, first: +d.first || today(), logs: d.logs } : { seen: -1, first: today(), logs: [] };
}

/** Past midnight GMT: today's log starts afresh, and yesterday's is kept for the paper. */
function roll() {
  if (!L || L.d >= today()) return;
  flush();
  L = fresh();
}

function flush() {
  if (!dirty || !L) return;
  dirty = false;
  if (!L.used) return;
  if (!write(logKey(L.room, L.d), L)) {
    // full up: the photos go first
    for (const e of L.ev) delete e.ph;
    write(logKey(L.room, L.d), L);
  }
  const had = I.logs.findIndex(([r, d]) => r === L!.room && d === L!.d);
  if (had !== I.logs.length - 1) {
    if (had >= 0) I.logs.splice(had, 1);
    I.logs.push([L.room, L.d]);
    while (I.logs.length > KEEP) { const [r, d] = I.logs.shift()!; try { localStorage.removeItem(logKey(r, d)); } catch { /* ignore */ } }
    write(idxKey(), I);
  }
}
addEventListener("pagehide", flush);

/** The log the paper is written from: this room's last day before today, or (on the start screen,
 *  or a room you've not had a day in) the latest from the room you played in most recently. */
function edition(r: string): Log | null {
  const before = I.logs.filter(([, d]) => d < today());
  const pick = before.filter(([q]) => q === r).sort((a, b) => b[1] - a[1])[0]
    ?? before.filter(([q]) => q === I.logs[I.logs.length - 1]?.[0]).sort((a, b) => b[1] - a[1])[0]
    ?? before.sort((a, b) => b[1] - a[1])[0];
  return pick ? read<Log>(logKey(pick[0], pick[1])) : null;
}

// ---- the day log ------------------------------------------------------------------------------------

/** A game starts on this map, in this room: name is the map's own name, nameOf turns a player's id into their name. */
export function begin(m: GameMap, mapId: string, name: string, roomCode: string, nameOf: (id: string) => string, me: string) {
  flush();
  map = m; names = nameOf; myName = me || "You";
  load(mapId, name);
  room = !roomCode || roomCode === "SOLO" ? "solo" : roomCode.toLowerCase();
  L = read<Log>(logKey(room, today())) ?? fresh();
  if (!L.cb) L.cb = {};
  L.me = myName;
}

/** Something happened worth a line in tomorrow's paper. key: the same for everyone in the room, for a room event. */
export function log(e: Ev, key?: string) {
  if (!L) return;
  roll();
  e.t = Date.now();
  e.i = key ?? `${myName}|${e.k}|${e.t}`;
  L.ev.push(e);
  L.used = 1;
  if (L.ev.length > MAX_EV) L.ev.splice(Math.max(0, L.ev.findIndex((o) => o.k !== "pub")), 1);
  dirty = true;
  flush();
}

/** Once a second from the game: how much of the map the Flag Lads hold, 0 to 1. */
export function meter(m: number) {
  if (!L) return;
  roll();
  const pct = Math.round(m * 100);
  L.used = 1;
  if (pct > L.pk) { L.pk = pct; dirty = true; }
  if (pct !== L.end) { L.end = pct; dirty = true; }
  if (++ticks % 15 === 0) flush();
}

/** I shot a flag: run is how many in a row (the combo) so far. */
export function myFlag(run: number, at: string) {
  if (!L) return;
  L.lg[myName] = (L.lg[myName] ?? 0) + 1;
  if (run > (L.cb[myName]?.[0] ?? 0)) L.cb[myName] = [run, at];
  L.used = 1;
  dirty = true;
}

/** Someone else in the room shot a flag down. */
export function flagBy(who: string) {
  if (!L) return;
  const n = names(who);
  L.lg[n] = (L.lg[n] ?? 0) + 1;
  dirty = true;
}

/** A takeover's over (the host's word): won back or kept. near: I was there, at (mx, mz), and the pub's at (x, z). */
export function pubOutcome(o: { won: boolean; pub: string; g?: string; tr?: string[]; sp?: number; du?: number; v?: boolean; line?: string },
  x: number, z: number, mx: number, mz: number, near: boolean) {
  const e: Ev = { k: "pub", won: o.won ? 1 : 0, pub: o.pub, wh: o.pub, g: o.g, tr: o.tr, sp: o.sp, du: o.du, v: o.v ? 1 : 0, who: near ? myName : "", tx: o.line };
  log(e, `p|${o.pub}|${o.won ? 1 : 0}`);
  const photos = L?.ev.filter((q) => q.ph).length ?? 0;
  if (Math.hypot(x - mx, z - mz) < PHOTO_REACH && photos < MAX_PHOTOS) want = { ev: e, x, z, mx, mz };
}

/** A job of mine is over. kind: what the poster calls it ("Treasure trail"). */
export function job(kind: string, title: string, where: string, won: boolean, off = false) {
  log({ k: "job", tx: title, wh: where, kd: kind, who: myName, won: won ? 1 : 0, off: off ? 1 : 0 });
}

/** A scar's turned up (scars.ts): logged once, whenever we first hear of it. */
export function scarSeen(sid: number, x: number, z: number, what: string) {
  if (!L || L.ev.some((e) => e.i === `s|${sid}`)) return;
  log({ k: "scar", wh: nameOf(squareOf(x, z)), tx: what }, `s|${sid}`);
}

/** A scar's been put right. */
export function scarFixed(sid: number, x: number, z: number, what: string, by: string) {
  log({ k: "fix", wh: nameOf(squareOf(x, z)), tx: what, who: by === "you" ? myName : by }, `f|${sid}`);
}

/** I cleared a square of flags. */
export function cleared(where: string) { log({ k: "clr", wh: where, who: myName }); }

/** A new best of mine at something: what, in words ("Treasure trail: 4:12"). */
export function record(what: string) { log({ k: "rec", tx: what, who: myName }); }

// ---- the room's log, shared ---------------------------------------------------------------------------

/** Today's log for this room, to send to someone (without the photos). */
export function outgoing() {
  if (!L || !L.used) return null;
  return { m: id, r: room, d: L.d, ev: L.ev.map(({ ph, ...e }) => e), pk: L.pk, lg: L.lg, cb: L.cb };
}

const str = (v: unknown, n = 160) => (typeof v === "string" ? v.slice(0, n) : undefined);

/** Someone's log for this room and day: what's new to us goes into ours. True if anything did. */
export function merge(o: any): boolean {
  if (!L || !o || o.m !== id || o.r !== room || o.d !== L.d || !Array.isArray(o.ev)) return false;
  let added = false;
  for (const x of o.ev.slice(0, MAX_EV)) {
    if (!x || typeof x !== "object" || typeof x.i !== "string" || !["pub", "clr", "sq", "free", "job", "rec", "scar", "fix", "boss"].includes(x.k)) continue;
    // a pub or a square can change hands more than once a day: the same one only if it was at the same time
    const t = +x.t || 0, timed = /^(p|q)\||^free$/.test(x.i);
    const same = L.ev.find((e) => e.i === x.i && (!timed || Math.abs((e.t ?? 0) - t) < SAME));
    if (same) {
      // one pub won with several of us there: everyone's name goes on it
      const who = str(x.who, 80);
      if (who && same.who !== undefined && !same.who.split(", ").includes(who)) { same.who = same.who ? `${same.who}, ${who}` : who; added = true; }
      continue;
    }
    L.ev.push({ k: x.k, i: x.i.slice(0, 120), t, wh: str(x.wh), tx: str(x.tx, 240), who: str(x.who, 80), kd: str(x.kd, 40), won: x.won ? 1 : 0, off: x.off ? 1 : 0,
      pub: str(x.pub), g: str(x.g, 60), tr: Array.isArray(x.tr) ? x.tr.slice(0, 3).map(String) : undefined, sp: +x.sp || undefined, du: +x.du || undefined, v: x.v ? 1 : 0 });
    added = true;
  }
  if (added) { L.ev.sort((a, b) => (a.t ?? 0) - (b.t ?? 0)); L.ev.splice(0, Math.max(0, L.ev.length - MAX_EV)); }
  if (o.lg && typeof o.lg === "object") for (const [n, v] of Object.entries(o.lg).slice(0, 16)) if (+v! > (L.lg[n] ?? 0)) { L.lg[n.slice(0, 16)] = +v!; added = true; }
  if (o.cb && typeof o.cb === "object") for (const [n, v] of Object.entries(o.cb).slice(0, 16)) {
    if (Array.isArray(v) && +v[0] > (L.cb[n]?.[0] ?? 0)) { L.cb[n.slice(0, 16)] = [+v[0], String(v[1] ?? "").slice(0, 60)]; added = true; }
  }
  if (+o.pk > L.pk) { L.pk = Math.min(100, +o.pk); added = true; }
  if (added) { L.used = 1; dirty = true; flush(); }
  return added;
}

/** Just before the frame is drawn: the photo for a pub's story, if one's wanted. */
export function photo(scene: THREE.Scene) {
  const w = want;
  if (!w || !map) return;
  want = null;
  let dx = w.mx - w.x, dz = w.mz - w.z;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d; dz /= d;
  const cx = w.x + dx * 16, cz = w.z + dz * 16;
  const c = snapshot(scene, cx, map.ground(cx, cz) + 2.2, cz, w.x, map.ground(w.x, w.z) + 3, w.z, 128, 72, 400);
  if (!c) return;
  try { w.ev.ph = c.toDataURL("image/jpeg", 0.6); dirty = true; flush(); } catch { /* ignore */ }
}

// ---- writing it up ------------------------------------------------------------------------------------

const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
function hashOf(...xs: (string | number)[]) {
  let h = 2166136261;
  for (const ch of xs.join("|")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rngOf(seed: number) {
  let s = seed || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const TRAIT: Record<string, string> = { gazebo: "his pop-up gazebo", megaphone: "his megaphone", deputy: "his right-hand man", quorum: "the whole WhatsApp group" };

const secs = (n: number) => (n < 60 ? `${n <= 20 ? NUM[n] : n} second${n === 1 ? "" : "s"}` : `${Math.round(n / 60)} minute${Math.round(n / 60) === 1 ? "" : "s"}`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const clock = (t?: number) => {
  if (!t) return "teatime";
  const d = new Date(t), h = d.getHours(), m = d.getMinutes();
  return m < 8 ? `${h % 12 || 12} o'clock` : m < 23 ? `quarter past ${h % 12 || 12}` : m < 38 ? `half past ${h % 12 || 12}` : m < 53 ? `quarter to ${(h + 1) % 12 || 12}` : `${(h + 1) % 12 || 12} o'clock`;
};

/** {name} in s filled from v. */
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

interface Story { head: string; stand: string; by: string; body: string[]; cap: string; ev?: Ev; art: "won" | "lost" | "flags" | "quiet" }
interface Item { head: string; text: string }

const PUB_WON_CLOSE = {
  head: ["{Secs} to spare at {pub}", "Photo finish at {pub}", "Last orders, just, at {pub}", "{pub} won back with the clock all but gone"],
  stand: ["{G} and {trait} sent packing as {who} reaches the bar with {secs} left.", "{Who} turns up with {secs} on the clock and clears {g}'s lot out of {pub}.", "It could hardly have been closer: {secs} in hand, and {g} out on the pavement."],
};
const PUB_WON_QUICK = {
  head: ["Gaffer routed in {du} seconds", "{pub} cleared before the kettle boiled", "Short shrift for {G} at {pub}", "In and out: {pub} back in {du} seconds"],
  stand: ["{G} had barely got {trait} going before {who} had the lot of them out of {pub}.", "{Who} needs {du} seconds to clear {pub}, a time regulars are already calling 'about right'."],
};
const PUB_WON = {
  head: ["{pub} flies the welcome banner again", "Flag Lads shown the door at {pub}", "{pub} back open to all", "Bunting down at {pub}"],
  stand: ["{G} and {trait} are out, and the welcome banner is back up over {pub}.", "{Who} clears the Flag Lads out of {pub}; {g} was seen leaving with {trait}."],
};
const PUB_LOST_EMPTY = {
  head: ["Flag Lads dig in at {pub}", "{pub} lost as lads put the kettle on", "Too slow: {pub} stays flagged", "Nobody comes for {pub}"],
  stand: ["The phone rang, nobody came, and {G}'s crew have cable-tied the beer garden.", "With nobody there in time, {G} has {pub} and is telling everyone about it."],
};
const PUB_LOST_FIGHT = {
  head: ["Flag Lads hold {pub}", "{G} keeps {pub}", "Retreat at {pub}"],
  stand: ["A crew went in, then wandered off, and {G} could not believe his luck.", "It went the Flag Lads' way at {pub}, where {G} has now hung a second flag off the first."],
};
const BODY_WON = [
  "{G}, who had held {pub} since {clock}, was heard telling nobody in particular: \"I'm not being funny, but we'll be back.\"",
  "Witnesses describe a scramble up the street, a short scuffle by the fruit machine and a Gaffer leaving faster than he arrived.",
  "The welcome banner went back up within minutes. A regular said the cable ties would be kept in a jar behind the bar, as a warning.",
  "Asked what the flags had been for, one of the lads said \"you know\", and then, on reflection, that he didn't.",
];
const BODY_LOST = [
  "Lamp posts on every street round {pub} are now flying a flag each, and in places two. \"Taking our streets back,\" said one lad, from a stepladder.",
  "{G} has put out a statement through his megaphone. It went on for some time and nobody wrote it down.",
  "Regulars are drinking elsewhere for now. The Crier understands a crew is being got together for today.",
];
const CAP_WON = ["{pub} flies the welcome banner again.", "The banner back up over {pub}, and not a cable tie in sight.", "{pub}, open to all, as it should be."];
const CAP_LOST = ["{pub} under new management, for now.", "The Flag Lads' flag over {pub}. Not for long, regulars say.", "{pub}, flagged to the gutters."];

/** The lead: the day's most dramatic thing. */
function lead(L: Log, r: () => number, when: string): Story {
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  let best: { score: number; s: () => Story } = { score: 0, s: () => quiet(L, r, when) };
  const consider = (score: number, s: () => Story) => { if (score > best.score) best = { score, s }; };
  for (const e of L.ev) {
    if (e.k === "pub") {
      const G = e.v ? "the Gaffer's cousin" : e.g || "the Gaffer";
      const ppl = (e.who ?? "").split(", ").filter(Boolean);
      const crew = !ppl.length ? "a crew of locals" : ppl.length === 1 ? ppl[0] : `a crew with ${ppl.slice(0, -1).join(", ")} and ${ppl[ppl.length - 1]}`;
      const v: Record<string, string> = {
        pub: e.pub ?? "the pub", G: cap(G), g: G, trait: e.tr?.length ? TRAIT[e.tr[0]] ?? "his crew" : "his crew",
        who: crew, Who: cap(crew), secs: secs(Math.max(0, Math.round(e.sp ?? 0))), Secs: cap(secs(Math.max(0, Math.round(e.sp ?? 0)))),
        du: String(Math.round(e.du ?? 0)), clock: clock(e.t ? e.t - (e.du ?? 0) * 1000 - 120000 : 0),
      };
      const by = `By our correspondent at ${e.pub ?? "the pub"}`;
      const tail = e.tx ? [`Word in the snug: ${e.tx}.`] : [];
      if (e.won) {
        const close = e.sp !== undefined && e.sp <= 45, quick = e.du !== undefined && e.du > 0 && e.du <= 90;
        const T = close ? PUB_WON_CLOSE : quick ? PUB_WON_QUICK : PUB_WON;
        consider(close ? 100 - (e.sp ?? 0) : quick ? 60 + (90 - (e.du ?? 90)) / 3 : 40 + (ppl.length ? 5 : 0), () => ({
          head: fill(pick(T.head), v), stand: fill(pick(T.stand), v), by, ev: e, art: "won",
          body: [fill(pick(BODY_WON), v), ...tail], cap: fill(pick(CAP_WON), v),
        }));
      } else {
        const T = e.du ? PUB_LOST_FIGHT : PUB_LOST_EMPTY;
        consider(e.du ? 50 : 45, () => ({
          head: fill(pick(T.head), v), stand: fill(pick(T.stand), v), by, ev: e, art: "lost",
          body: [fill(pick(BODY_LOST), v), ...tail], cap: fill(pick(CAP_LOST), v),
        }));
      }
    } else if (e.k === "free") {
      const v = { place, clock: clock(e.t) };
      consider(95, () => ({
        head: fill(pick(["{place} flag-free!", "Not a flag left in {place}", "Lamp posts bare across {place}"]), v),
        stand: fill(pick(["Every lamp post in {place} was bare by {clock}, and the Flag Lads have gone home to rethink.", "By {clock} there wasn't a flag left up anywhere in {place}. The Flag Lads blame the wind."]), v),
        by: "By our chief reporter", ev: e, art: "won",
        body: [pick(["A spokesman for the Flag Lads said they had \"loads more\" and would be back. He was right, as it turns out: see today's lamp posts.",
          "Cable ties were found in bins all over town. The council has asked that they be recycled, and not on lamp posts."])],
        cap: fill(pick(["{place}, as it looked by {clock}.", "Not a flag in sight."]), v),
      }));
    }
  }
  const top = Object.entries(L.cb ?? {}).sort((a, b) => b[1][0] - a[1][0])[0];
  if (top && top[1][0] >= 8) {
    const v = { n: String(top[1][0]), wh: top[1][1] || place, who: top[0] };
    consider(45 + top[1][0], () => ({
      head: fill(pick(["x{n}! Flags fall like confetti on {wh}", "Sharpshooter strings {n} together", "{n} flags, one go, {wh}"]), v),
      stand: fill(pick(["{who} took {n} of the Flag Lads' flags down in one go, without stopping for breath.", "A combo of {n} on {wh}, and the ladder lads still looking for their ladder."]), v),
      by: `By our ${v.wh} correspondent`, art: "flags",
      body: [pick(["\"It was like watching washing come in off the line,\" said a neighbour.", "The bunting came down in a flutter. The lamp posts are said to be relieved."])],
      cap: fill(pick(["{wh}, after.", "Where the flags were, on {wh}."]), v),
    }));
  }
  const by = new Map<string, Ev[]>();
  for (const e of L.ev) if (e.k === "clr" && e.who) by.set(e.who, [...(by.get(e.who) ?? []), e]);
  const [cw, mine] = [...by].sort((a, b) => b[1].length - a[1].length)[0] ?? ["", []];
  if (mine.length >= 2) {
    const v = { n: NUM[mine.length] ?? String(mine.length), who: cw, wh: mine[mine.length - 1].wh ?? place };
    consider(40 + mine.length, () => ({
      head: fill(pick(["{N} squares cleared by one resident", "Street by street: {n} squares freed"]), { ...v, N: cap(v.n) }),
      stand: fill(pick(["{who} cleared {n} squares of flags {when}, the last of them round {wh}.", "Not a flag left in {n} squares, thanks to {who}."]), { ...v, when }),
      by: "By our lamp post correspondent", art: "flags",
      body: [pick(["The Flag Lads say they will be putting them back. Their ladder is said to be \"in the van\".", "Ladder lads were seen arriving afterwards, looking at the empty lamp posts and then at each other."])],
      cap: fill("Round {wh}, cleared.", v),
    }));
  }
  return best.s();
}

function quiet(L: Log, r: () => number, when: string): Story {
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const v = { pk: String(L.pk), place, when };
  return L.pk > 0 ? {
    head: fill(pick(["Flag Lads reach {pk}% and nobody notices", "Bunting row rumbles on", "Cable tie shortage blamed for slow day"]), v),
    stand: fill(pick(["The Flag Lads got as far as {pk}% of {place} {when} before running out of steam, or ladders.", "At their height {when} the Flag Lads had {pk}% of {place}. They want it known that this is \"a lot\"."]), v),
    by: "By our chief reporter", art: "flags",
    body: [pick(["No pubs changed hands. A spokesman for the Flag Lads said this was \"part of the plan\" and would not say which part.", "Residents report flags on lamp posts, which is what the Flag Lads do. More as we get it."])],
    cap: fill("Lamp posts in {place}, much as you'd expect.", v),
  } : {
    head: "Nothing to report, which is news in itself", stand: fill("A quiet day in {place}. The Crier went to the pub instead.", v),
    by: "By our chief reporter", art: "quiet", body: ["Get out there and give us something to write about."], cap: fill("{place}, quiet.", v),
  };
}

const FILLER: Item[] = [
  { head: "Lost and found", text: "A box of cable ties, unopened, handed in. The owner can collect it by promising not to do that again." },
  { head: "Letters", text: "Sir, I'm not being funny, but... (The rest of this letter has been withheld at the writer's request.)" },
  { head: "Seagulls", text: "Seagulls report a good day. They would not say why, and one of them took our pasty." },
  { head: "Council notice", text: "Lamp posts are for lighting the street. A reminder from the council, again." },
  { head: "For sale", text: "Stepladder, one careful owner, hardly climbed. Not to Flag Lads." },
  { head: "Wanted", text: "A quiet pint. Will travel. Will help clear the pub first if needed." },
  { head: "Puzzle corner", text: "How many cable ties does it take to hang one flag? Answers on a postcard. The Flag Lads say \"loads\"." },
  { head: "Weather", text: "Drizzle, clearing later, then more drizzle. Flags expected to droop." },
];

/** The little stories along the bottom: from the log first, then the paper's own fillers. */
function items(L: Log, used: Ev | undefined, r: () => number, when: string): Item[] {
  const out: Item[] = [];
  for (const e of L.ev) {
    if (e === used || out.length >= 3) continue;
    if (e.k === "job" && e.kd === "Treasure trail") {
      out.push(e.won ? { head: "Trail solved", text: `${esc(e.tx ?? "The treasure trail")} was cracked ${when}${e.wh ? `, starting from ${esc(e.wh)}` : ""}. The tin has been put back for someone else.` }
        : { head: "Trail goes cold", text: `Nobody finished ${esc(e.tx ?? "the treasure trail")} ${when}. Today's noticeboards have a new one.` });
    } else if (e.k === "job" && !e.won) {
      out.push({ head: e.off ? "Job called off" : `${esc(e.kd ?? "Job")} goes west`, text: `${esc(e.tx ?? "A job")}${e.wh ? ` at ${esc(e.wh)}` : ""}: ${e.off ? "called off halfway, nobody's saying why" : "not done, and the noticeboard has been told"}.` });
    } else if (e.k === "rec") {
      out.push({ head: "New record", text: `${esc(e.tx ?? "")}, set ${when}${e.who ? ` by ${esc(e.who)}` : ""}. The next go is on the noticeboards.` });
    } else if (e.k === "fix") {
      out.push({ head: "Put right!", text: `${esc(e.wh ?? "")}: ${esc(e.tx ?? "")}, put right${e.who ? ` by ${esc(e.who)}` : ""}.` });
    } else if (e.k === "pub" && e !== used) {
      out.push({ head: e.won ? "Also won back" : "Also lost", text: `${esc(e.pub ?? "A pub")} ${e.won ? "flies the welcome banner again" : "is in the Flag Lads' hands"}${e.g ? `, ${e.won ? "and" : "with"} ${esc(e.g)} ${e.won ? "sent home" : "in charge"}` : ""}.` });
    } else if (e.k === "boss" && e.tx) {
      out.push({ head: "Change at the top", text: `${esc(e.tx)}.` });
    }
  }
  const sq = L.ev.filter((e) => e.k === "sq").length;
  if (sq && out.length < 3) out.push({ head: "Squares cleared", text: `${sq} square${sq === 1 ? "" : "s"} of ${esc(place)} ${sq === 1 ? "was" : "were"} cleared of flags ${when}.` });
  const pool = [...FILLER];
  while (out.length < 3) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

const WEATHER = ["Weather: drizzle, then more drizzle", "Weather: bright spells, flags drooping", "Weather: grey, with a chance of bunting", "Weather: a nip in the air", "Weather: blowy (hold on to your flags, lads)"];
const GULLS = ["Seagulls: restless", "Seagulls: plotting", "Seagulls: full of chips", "Seagulls: watching you", "Seagulls: quiet. Too quiet"];
const GAFFER = ["He was last seen measuring lamp posts.", "Sources say he has a new hi-vis.", "Expect him wherever there's a beer garden.", "He wants it known that he is \"not being funny\".", "He has been practising his speech in a car park."];

/** The edition in pieces, as html: the kicker over the lead, the strap, the lead story with its photo,
 *  the side column (scars, league, Gaffer watch) and the small items for the foot of the page. */
export interface News { kicker: string; no: number; strap: string; lead: string; side: string; small: string }

/** The edition: from yesterday's log, or the welcome edition if there isn't one. */
function render(ed: Log | null, no: number): News {
  const d = today();
  const r = rngOf(hashOf(id, d, ed?.d ?? 0));
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const when = !ed ? "" : ed.d === d - 1 ? "yesterday" : d - ed.d < 7 ? `on ${DAYS[new Date(ed.d * DAY).getUTCDay()]}` : "last time out";
  const title = !ed ? `News from ${place}` : ed.d === d - 1 ? `Yesterday in ${place}` : d - ed.d < 7 ? `${DAYS[new Date(ed.d * DAY).getUTCDay()]} in ${place}` : `Last time out in ${place}`;
  const g = morningGaffer();
  const gaffer = `<div class="chron-box"><h4>Gaffer watch</h4><p>Today's Gaffer is <b>${esc(g.name)}</b>, with ${g.traits.map((t) => esc(TRAIT[t] ?? t)).join(" and ")}. ${pick(GAFFER)}</p></div>`;
  let story: Story, side = "", strap: string[];
  if (!ed) {
    story = {
      head: `Flag Lads arrive in ${place}`, art: "flags",
      stand: "A van full of cable ties was seen at dawn. By breakfast there were flags on the lamp posts.",
      by: "By our chief reporter",
      body: [
        "They say they're \"taking the streets back\". Nobody is quite sure from whom. The Crier asked one of them what the flags were for. \"I'm not being funny, but,\" he said, and then didn't finish.",
        "Residents can help: shoot the flags off the lamp posts to clear a square, and when the phone goes, get down the pub they've taken over and see them off. Each square you clear shows on the big map (M).",
      ],
      cap: "The first flag goes up. It won't be the last, the lads say.",
    };
    strap = ["Flags up: just getting started", pick(WEATHER), pick(GULLS)];
    side = `<div class="chron-box scars"><h4>How to help</h4><ul><li>Shoot the flags off the lamp posts. Every flag in a square and it's cleared.</li><li>When the Flag Lads take a pub, get there and clear them out.</li><li>Catch a ladder lad and they stop for a bit.</li></ul></div>`;
  } else {
    story = lead(ed, r, when);
    strap = [`Flags up ${when}: peaked ${ed.pk}%, ended ${ed.end}%`, pick(WEATHER), pick(GULLS)];
    // the scars: what's still showing, else what was left and not mended
    const live = scars();
    const left = live.length ? live.map((s) => ({ wh: nameOf(s.sq), tx: s.what }))
      : ed.ev.filter((e) => e.k === "scar" && !ed.ev.some((f) => f.k === "fix" && f.i === `f${(e.i ?? "").slice(1)}`)).map((e) => ({ wh: e.wh ?? "", tx: e.tx ?? "" }));
    side += `<div class="chron-box scars"><h4>Still scarred this morning</h4>${left.length
      ? `<ul>${left.slice(0, 4).map((s) => `<li>${s.wh ? `<b>${esc(s.wh)}.</b> ` : ""}${esc(cap(s.tx))}.</li>`).join("")}</ul>`
      : "<p>Not a mark on the place. Enjoy it while it lasts.</p>"}</div>`;
    const lg = Object.entries(ed.lg).sort((a, b) => b[1] - a[1]);
    const best = Object.entries(ed.cb ?? {}).sort((a, b) => b[1][0] - a[1][0])[0];
    const combo = best && best[1][0] > 1 ? `<tr><td>Best combo</td><td>${esc(best[0])}, x${best[1][0]}${best[1][1] ? ` on ${esc(best[1][1])}` : ""}</td></tr>` : "";
    if (lg.length > 1) {
      side += `<div class="chron-box"><h4>Flag league, ${esc(when)}</h4><table class="chron-league"><tbody>${lg.slice(0, 5).map(([n, k], i) => `<tr><td>${i + 1}. ${esc(n)}</td><td>${k} flag${k === 1 ? "" : "s"}</td></tr>`).join("")}${combo}</tbody></table></div>`;
    } else {
      const cleared = ed.ev.filter((e) => e.k === "clr" && e.who === ed.me).length;
      const pubs = ed.ev.filter((e) => e.k === "pub" && e.won && (e.who ?? "").split(", ").includes(ed.me)).length;
      side += `<div class="chron-box"><h4>Your day, ${esc(when)}</h4><table class="chron-league"><tbody><tr><td>Flags shot</td><td>${ed.lg[ed.me] ?? 0}</td></tr>`
        + `${combo || "<tr><td>Best combo</td><td>none</td></tr>"}<tr><td>Squares cleared</td><td>${cleared}</td></tr><tr><td>Pubs won back</td><td>${pubs}</td></tr></tbody></table></div>`;
    }
  }
  const small = ed ? items(ed, story.ev, r, when) : [FILLER[0], FILLER[6], FILLER[3]];
  const img = story.ev?.ph ?? drawing(story.art);
  return {
    kicker: title, no: no + 1,
    strap: strap.map((s) => `<span>${esc(s)}</span>`).join(""),
    lead: `<div class="chron-lead"><h3>${esc(story.head)}</h3><p class="stand">${esc(story.stand)}</p><div class="by">${esc(story.by)}</div>`
      + `<div class="chron-photo"><figure><img src="${img}" alt=""></figure><p class="cap">${esc(story.cap)}</p></div>`
      + story.body.map((p) => `<p>${esc(p)}</p>`).join("") + `</div>`,
    side: side + gaffer,
    small: `<div class="chron-small">${small.map((i) => `<div><h4>${esc(i.head)}</h4><p>${i.text}</p></div>`).join("")}</div>`,
  };
}

const drawn = new Map<string, string>();
/** No photo: a little drawing of the pub (or the lamp posts) in the same sepia, made once so the page doesn't change under a reader. */
function drawing(art: string): string {
  let url = drawn.get(art);
  if (!url) { url = sketch(art).toDataURL(); drawn.set(art, url); }
  return url;
}

function sketch(art: string): HTMLCanvasElement {
  const W = 160, H = 90, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#8a8378"; g.fillRect(0, 0, W, H);
  if (art === "won" || art === "lost") {
    g.fillStyle = "#cfc6b4"; g.fillRect(16, 24, 128, 66);
    g.fillStyle = "#3b352e"; for (let k = 0; k < 4; k++) g.fillRect(26 + k * 31, 38, 18, 22);
    g.fillStyle = "#2a2520"; g.fillRect(70, 62, 20, 28);
    g.fillStyle = art === "won" ? "#f2efe6" : "#b8b0a0"; g.fillRect(28, 8, 104, 14);
    g.fillStyle = "#2a2520"; g.font = "bold 10px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(art === "won" ? "ALL WELCOME" : "WE RUN THIS", 80, 15.5);
  } else {
    for (let k = 0; k < 5; k++) {
      const x = 14 + k * 33;
      g.fillStyle = "#2a2520"; g.fillRect(x, 20, 3, 70); g.fillRect(x, 20, 12, 3);
      if (art === "flags") { g.fillStyle = "#e8e2d4"; g.fillRect(x + 5, 24, 12, 8); }
    }
    g.strokeStyle = "#2a2520"; g.beginPath(); g.moveTo(0, 84); g.lineTo(W, 80); g.stroke();
  }
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let k = 0; k < d.length; k += 4) {
    const v = d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11 + (Math.random() - 0.5) * 40;
    const t = v > 150 ? 225 : v > 95 ? 140 : 50;
    d[k] = t; d[k + 1] = t * 0.95; d[k + 2] = t * 0.82;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---- the Chronicle's news page ----------------------------------------------------------------------

/** Yesterday's news, in the pieces daily.ts sets out on the Chronicle's one page. */
export function newsPage(mapId: string, name: string): News {
  load(mapId, name);
  flush();
  return render(edition(room), Math.max(0, today() - I.first));
}

/** Whether there is anything to read on the news page: yesterday's log, or a first-timer's welcome. */
export function hasNews(): boolean {
  return !!edition(room) || today() === I.first;
}

/** Whether a room on this map has a day before today in the log, for the start screen's list of rooms. */
export function newsFor(mapId: string, r: string): boolean {
  const d = read<Index>(`cd-paper:${mapId}`);
  return !!d && Array.isArray(d.logs) && d.logs.some(([q, day]) => q === r && day < today());
}

/** True the first time it's asked each day on this map: the Chronicle opens on the news then. */
export function firstToday(): boolean {
  if (I.seen === today()) return false;
  I.seen = today();
  write(idxKey(), I);
  return true;
}

// ---- the night's front page -------------------------------------------------------------------------

const NIGHT_HEAD = ["{N} jobs in one evening, and still on their feet", "A busy night in {place}", "Round {place} in {n} jobs", "Last orders at {pub}, and a night to remember"];
const NIGHT_STAND = [
  "{who} did {n} jobs {when}, and ended it at the bar of {pub}.",
  "It began with a job and ended at {pub}: {who} got through {n} before last orders.",
];
const NIGHT_BODY = [
  "Asked how they were, the regulars at {pub} said they had seen worse nights and had a round in, which settled it.",
  "The landlord of {pub} says he has never known a night like it, and has been saying so since 1987.",
];

/** The front page of a night out (nightout.ts), written from this room's log since it began: the
 *  lead story is the night's best pub if there was one, else the jobs; Gaffers who got away have a line. */
export function nightStory(since: number, pub: string, away: string[]): { head: string; stand: string; by: string; body: string[]; items: Item[] } | null {
  if (!L) return null;
  const ev = L.ev.filter((e) => (e.t ?? 0) >= since);
  const night: Log = { ...L, ev };
  const r = rngOf(hashOf(id, since));
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const jobs = ev.filter((e) => e.k === "job" && e.won && !e.off);
  const who = [...new Set(jobs.map((e) => e.who).filter(Boolean))] as string[];
  const v = { n: NUM[jobs.length] ?? String(jobs.length), N: cap(NUM[jobs.length] ?? String(jobs.length)), pub, place,
    when: "tonight", who: who.length ? who.slice(0, 3).join(" and ") : "A crew of locals" };
  let story: Story;
  if (ev.some((e) => e.k === "pub" && e.won)) story = lead(night, r, "tonight");
  else story = { head: fill(pick(NIGHT_HEAD), v), stand: fill(pick(NIGHT_STAND), v), by: "By our night reporter", art: "quiet", body: [], cap: "" };
  const done: Item[] = jobs.slice(-3).reverse().map((e) => ({ head: `${esc(e.kd ?? "Job")} done`, text: `${esc(e.tx ?? "A job")}${e.wh ? ` at ${esc(e.wh)}` : ""}.` }));
  const gone: Item[] = away.slice(0, 2).map((n) => ({ head: "Gaffer at large", text: `${esc(n)} got away, and is tomorrow's Wanted poster.` }));
  const small = [...gone, ...done, ...items(night, story.ev, r, "tonight")].slice(0, 3);
  return { head: story.head, stand: story.stand, by: story.by, body: [...story.body.slice(0, 1), fill(pick(NIGHT_BODY), v)], items: small };
}
