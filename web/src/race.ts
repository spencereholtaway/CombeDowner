// A to B races: from the noticeboard to a real place 1 to 3 km away, on a set ride. Taking one
// starts it the way every minigame starts (lineup.ts): the entries open, and everyone who enters is
// put on a starting grid across the street on the ride, facing the way, held still through the
// title card and 3, 2, 1, GO! under the start lights.
//
// The start and the finish are on the nearest proper street to the noticeboard and to the place,
// since most of the rides are hopeless on grass, and the route between them follows the streets
// (raceroute.ts). Checkpoints stand across the road along it, a gate at a time, and have to be
// ridden through in order before the finish counts; between them it's any way you like. The route
// and its checkpoints are drawn on the maps, and an arrow over the crosshair points at the next
// one. Racing with others, the panel shows your place live (2nd / 5) and how far you are from the
// one just ahead, or the one behind if you lead. At the end comes a results card: your place, time and medal, your best, how the run went,
// everyone's standings, and a fanfare for how you did.
//
// Killed on the way, you're out of the race: no time and no medal. Out of the room's race, or over
// its line, while others are still riding, you wait for the end where you stopped, held still and
// out of harm's way (you come back to life only once it's over), and watch the others from behind
// whoever you choose. The race ends when everyone's over the line or out of it, or a minute after
// the first one home, and everyone gets the results card together. On your own, it ends there and
// then.
//
// A race is quicker than riding about: it lifts every ride's top speed and push (player.ts's
// rideMul, said every frame through the quest world), boost pads lie across the road between
// checkpoints (placed from the seed, so everyone has the same ones), and riding close behind
// another racer gives a slipstream. Each checkpoint has a clock to the next, from bronze pace with
// some slack and more for the first leg, and time left over carries on; it turns amber with a beep
// when it's getting short, and pips the last five seconds. Run out and you're out of the placings
// and the medals, but can still ride on to the line for your time. A lone racer has a faint
// gold-pace rider to chase, which gets going from the grid as the ride does. Riding hard into another racer
// knocks them off: the rammer sees the contact and tells them ("knk", inside "qe"), and they
// tumble themselves.
//
// The ride suits the route, from the lie of the land along the way: a steep climb is a BMX's (or a
// racing bike's, if it's long), a run that only goes down is for the skateboard or the shopping
// trolley (these two are only ever raced downhill: the streets between must fall 25 m and
// mostly run down, or the race gets another place or another ride), the flat is for the rollerblades or the scooter, and a short flat hop is a pogo dash.
//
// Each checkpoint is a split, flashing green or red against your best, like a time trial. There's
// gold, silver and bronze, and a hidden author's time, worked out by riding the route's streets
// on its ride from a standstill, as player.ts handles it on the race's lift, slowing for the bends
// (paceAlong; tools/race_probe.mjs rides real routes to check it). Your best run on each route is kept, a point every
// tenth of a second, and you race a see-through rider of it; finishing with a best sends your run
// round, so everyone else in the room races your ghost too, alongside the real riders.
//
// Use (E, □, or Again on a touch screen; Backspace too) puts just you back on the line with a quick 3-2-1 of your own
// and your own clock: a time trial for you, while the room's race and its results stand. It works
// for two minutes after a race is over too.
//
// The daily race: one more noticeboard round the village each day, the same route for everyone,
// with a board of the times in the room and the "local legend", whoever's had the most goes at it.
//
// Who decides what: the route and its checkpoints come from the poster's seed and the map everyone
// has. Who's racing, in grid order, is lineup.ts's line-up, the same on every screen. Each racer
// times themselves and says as they pass each checkpoint ("cp") and cross the line ("fin"), with their run ("gh") if it's a best. Everyone keeps the results from
// those, counting a finish only from someone who's been through every checkpoint in order, and
// works out everyone's place live from the same checkpoints and where each racer is; the
// host checks the time against its own clock as well, and sends the results that stand ("res"),
// or says a finish doesn't count ("dq"). A racer out of time says "out"; riding on, they send no more checkpoints and
// no finish, but say "home" over the line. Killed (or given up riding on), they say "out" with dnf.
// The host calls the race over ("end", with the results and who's out), and anyone else calls it
// themselves a few seconds after they'd have expected to hear (an older host never says). While
// someone waits they say so in their position updates ("rw", game.ts), and the host lets nothing
// hurt them. A go of your own sends "pb" with its time, and the daily
// race's board is everyone saying their best and how many goes they've had ("brd").
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as SFX from "./audio";
import { ctl } from "./controls";
import { nth } from "./hudkit";
import { missionAux, missionCall, missionResult, missionResultDrop, missionWaiting, missionWatching } from "./missionscreens";
import { score, guide, named } from "./notice";
import { dayNumber } from "./daylight";
import { clearSpot } from "./haunts";
import { type RideKind, TROLLEY_AHEAD, rideModel, rideSpecs } from "./rides";
import type { RouteLine } from "./minimap";
import { type Card, type Job, type Offer, type Perch, type PostSpot, type QuestWorld, type Rng, compassWord, esc, far, hash, pickOf, registerJob, rng } from "./quests";
import { type PathPoint, type RacePath, along, gatesOf, racePath } from "./raceroute";

const COLOUR = "#3ec7e8";
const HOLD = 8;            // seconds on the grid from the entries closing to GO
const RETRY = 0.5;         // and for a go of your own, with no countdown: just a moment to settle
const GO_HUSH = 1.3;       // seconds after GO before the middle of the screen is anyone else's again
const PASS = 12;           // metres from a checkpoint's middle that counts as through it, at least
const TOP_SPEED = 48;      // metres a second: nobody's quicker over the whole route than this, boosts and all
const LATE = 30;           // seconds a finish's time may be quicker than the host's clock says it can be
const GATE_SEEN = 450;     // metres from the next checkpoint that its gate stands up
const GHOST_EVERY = 0.1;   // seconds between the points of a ghost run
const AFTER = 60;          // seconds after the first one's over the line that the others get
const END_WAIT = 4;        // seconds anyone but the host waits for the host to call the race over, past when they'd have called it
const MAX_RACE = 900;      // seconds after GO that a race nobody's finished is over
const GHOSTS = 4;          // the most ghosts out at once
const RACE_MUL = 1.3;      // a race lifts every ride's top speed and push by this
const PAD_MUL = 1.3;       // and a boost pad by this on top, for PAD_SECS
const PAD_SECS = 3.5;
const PAD_R = 3.6;         // metres from a pad's middle that counts as on it
const PAD_SEEN = 320;      // metres from a pad that it's drawn
const SLIP_MUL = 1.07;     // riding in another racer's slipstream
const SLIP_AHEAD = 16, SLIP_SIDE = 2.4;   // metres: how far behind them, and how far off line, still counts
const KNOCK_SPEED = 5;     // m/s closing on another racer, at least, to knock them off
const KNOCK_COOL = 3;      // seconds before the same racer can be knocked off again
const WARN = 15;           // seconds left to a checkpoint when the clock turns amber with a beep
const LATE_MAX = 180;      // seconds someone out of time may ride on to the line before their race is over
const STEP = 4;            // metres between the points of a route's pace
const REACT = 0.3;         // seconds from GO to a good rider's first push
const AUTHOR = 0.96;       // the author against the line ridden flat out: the boost pads, and a tighter line
const GOLD = 1.1, SILVER = 1.28, BRONZE = 1.5;    // the medals, against the author's time
const SLACK = 1.1;         // the clock to each checkpoint: bronze pace times this,
const START_GRACE = 10;    // with this much more for the first leg (getting going, and the lie of the route),
const CP_GRACE = 3;        // and this much more for every leg
const DOWN_ONLY: RideKind[] = ["trolley", "board"];   // no good on the flat or uphill: only ever raced downhill
const MIN_DROP = 25;       // metres a downhill-only race must fall over its route
const KEY = "cd-race-";
const KEEP = 40;           // routes whose best runs are kept
const DAILY = 1;           // offer.mode for the daily race

export interface Route {
  to: { n: string; x: number; z: number }; ride: RideKind; d: number; author: number; name: string;
  /** The way by the streets, and its pace (paceAlong) from the front of the grid, from metres along it. */
  path: RacePath | null; pace: number[] | null; from: number;
}

// ---- the route ----------------------------------------------------------------------------------

/** The height of the ground, the same for everyone whatever's loaded round them. */
function groundOf(w: QuestWorld, x: number, z: number) {
  const wide = w.map.wide;
  return wide && !wide.inCore(x, -z) ? wide.ground(x, z) : w.map.ground(x, z);
}

/** The ground along the straight line from a to b. */
function profile(w: QuestWorld, ax: number, az: number, bx: number, bz: number): number[] {
  // every 150 m or so: closer, and a bank or a railway cutting looks like a hill
  const n = Math.max(6, Math.min(24, Math.round(Math.hypot(bx - ax, bz - az) / 150)));
  const hs: number[] = [];
  for (let k = 0; k <= n; k++) hs.push(groundOf(w, ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n));
  return hs;
}

/** The ride for the lie of the land: never one that's plainly wrong for it. */
function rideFor(r: Rng, d: number, hs: number[], short: boolean, noDownOnly = false): RideKind {
  const seg = d / (hs.length - 1);
  let climb = 0, fall = 0, steep = 0;
  for (let k = 1; k < hs.length; k++) {
    const dh = hs[k] - hs[k - 1];
    if (dh > 0) climb += dh; else fall -= dh;
    steep = Math.max(steep, dh / seg);
  }
  const drop = hs[0] - hs[hs.length - 1];
  if (short && climb < 12 && steep < 0.06) return "pogo";                      // a short flat hop
  if (!noDownOnly && drop > 35 && climb < 20) return drop > 60 && r() < 0.6 ? "trolley" : pickOf(r, ["trolley", "board"] as RideKind[]);   // all downhill
  if (climb > 60 || (steep > 0.12 && climb > 30)) return steep > 0.12 || d < 1800 ? "bmx" : "bike";   // a real climb
  if (climb + fall < 35 && steep < 0.06) return d < 1300 ? "scooter" : "blades";      // the flat
  if (!noDownOnly && drop > 20 && climb < 20) return "board";                                   // gently down
  if (climb < 25 && steep < 0.06) return "blades";                               // gently rolling
  return pickOf(r, ["bike", "bmx"] as RideKind[]);
}

/** The author's time where there's no route by the streets: the straight line ridden at the speed
 *  the ride settles at on each slope, with slack for the streets winding about. */
function crowTime(ride: RideKind, d: number, hs: number[]): number {
  const s = rideSpecs[ride], seg = d / (hs.length - 1);
  let t = 0;
  for (let k = 1; k < hs.length; k++) {
    const g = (hs[k] - hs[k - 1]) / seg;
    let v = s.top;
    if (!s.pogo && g < 0) v = Math.min(s.maxDown, s.top + (9.8 * -g * s.downhill) / 0.15);
    else if (!s.pogo && g > 0) { const push = s.accel - 9.8 * g * s.downhill; v = push > 0.6 ? s.top : Math.max(1.4, s.top * (push + 0.6) / 1.2); }
    t += (seg * 1.6) / (v * RACE_MUL);
  }
  return Math.round(t + 6);
}

/** Where the start line stands along a route that long. */
export const lineOf = (len: number) => Math.min(25, len * 0.08);

/**
 * The route ridden as well as its ride can on the race's lift, from a standstill on the front of the
 * grid at GO: pushing all the way (tucked or holding on downhill), slowing for each bend to what
 * the ride can turn at, by player.ts's own handling. The seconds from GO to each STEP along the way,
 * the last at the finish.
 */
function paceAlong(w: QuestWorld, ride: RideKind, p: RacePath, from: number): number[] {
  const s = rideSpecs[ride], lean = s.verb === "tuck" || s.verb === "lean";
  const ts = [REACT];
  const n = Math.max(1, Math.ceil((p.len - from) / STEP));
  const heading = (q: PathPoint) => Math.atan2(-q.dx, -q.dz);
  let v = 0, t = REACT, a = along(p, from), h0 = groundOf(w, a.x, a.z);
  for (let i = 0; i < n; i++) {
    const s0 = from + i * STEP, seg = Math.min(p.len, s0 + STEP) - s0;
    const b = along(p, s0 + seg), h1 = groundOf(w, b.x, b.z);
    const grade = seg > 0.01 ? Math.max(-0.6, Math.min(0.6, (h1 - h0) / seg)) : 0;
    h0 = h1;
    const ahead = Math.max(12, v * 1.6);
    const bend = Math.abs(Math.atan2(Math.sin(heading(along(p, s0 + ahead)) - heading(along(p, s0))), Math.cos(heading(along(p, s0 + ahead)) - heading(along(p, s0)))));
    const cap = bend > 0.05 ? s.turn * Math.max(4, ahead / bend) * 0.9 : Infinity;
    const climb = Math.max(0, grade), top = s.top * RACE_MUL * (s.pogo ? 1 : Math.max(0.35, 1 - climb * 3));
    let gone = 0;
    while (gone < seg) {
      const dt = 0.05;
      if (s.pogo) v += (top - v) * dt * 5;
      else {
        const tuck = lean && grade < -0.03 && v > 3, k = tuck ? 0.5 : 1;
        if (!tuck && v < top) v = Math.min(top, v + s.accel * RACE_MUL * Math.max(0.35, 1 - climb * 4) * dt);
        v -= (s.coast * Math.min(v, 6) * k + s.drag * v * v * k) * dt;
        const fight = !tuck && grade > 0 ? Math.min(1, v / (top + 0.1)) : 1;
        v -= 9.8 * grade * s.downhill * (tuck ? (s.verb === "lean" ? 1.5 : 1.15) : 1) * fight * dt;
        v = Math.min(v, s.maxDown * RACE_MUL + (tuck ? 5 : 0));
      }
      v = Math.max(1, Math.min(cap, v));
      const step = Math.min(seg - gone, v * dt);
      gone += step; t += step / v;
    }
    ts.push(t);
  }
  return ts;
}

/** Seconds from GO to s along the route at its pace (paceAlong). */
function paceAt(rt: Route, s: number): number {
  const ts = rt.pace!, f = Math.max(0, Math.min(ts.length - 1, (s - rt.from) / STEP)), i = Math.min(ts.length - 2, Math.floor(f));
  return ts.length < 2 ? ts[0] : ts[i] + (ts[i + 1] - ts[i]) * (f - i);
}

/** How far along the route the pace has got t seconds after GO. */
function paceWhere(rt: Route, t: number): number {
  const ts = rt.pace!;
  if (t <= ts[0]) return rt.from;
  let i = 1;
  while (i < ts.length - 1 && ts[i] < t) i++;
  const u = Math.min(1, (t - ts[i - 1]) / Math.max(1e-6, ts[i] - ts[i - 1]));
  return Math.min(rt.path!.len, rt.from + (i - 1 + u) * STEP);
}

export const medals = (a: number) => ({ gold: a * GOLD, silver: a * SILVER, bronze: a * BRONZE });

/** Does the way by the streets from the board to the place fall well and mostly downhill, with no long climbs? */
function downhill(w: QuestWorld, o: { x: number; z: number }, to: { x: number; z: number }): boolean {
  const p = racePath(w.map, o.x, o.z, to.x, to.z);
  if (!p) return false;
  const n = Math.max(4, Math.round(p.len / 40));
  let prev = 0, climb = 0, run = 0, worst = 0, first = 0, last = 0;
  for (let k = 0; k <= n; k++) {
    const a = along(p, (p.len * k) / n), h = groundOf(w, a.x, a.z);
    if (k === 0) first = h; else { const dh = h - prev; if (dh > 0.3) { climb += dh; run += dh; worst = Math.max(worst, run); } else if (dh < -0.3) run = 0; }
    prev = h; last = h;
  }
  const drop = first - last;
  return drop >= MIN_DROP && climb <= Math.max(5, drop * 0.2) && worst <= 4;
}

/** The route from the poster: where to, on what, and the author's time. */
export function routeOf(o: Offer, w: QuestWorld): Route | null {
  const r = rng(o.seed);
  const ok = (x: number, z: number) => w.map.fieldEdge(x, z) > 100;
  const fixed = o.to;
  const short = fixed ? Math.hypot(fixed.x - o.x, fixed.z - o.z) < 800 : o.mode !== DAILY && r() < 0.15;
  const near = short ? [500, 1000] : o.mode === DAILY ? [1200, 2500] : [1000, 3000];
  const all = fixed ? (Math.hypot(fixed.x - o.x, fixed.z - o.z) < 250 ? [] : [fixed]) : [...w.pubs().map((p) => ({ n: p.name, x: p.x, z: p.z })), ...w.places()]
    .filter((p) => ok(p.x, p.z) && Math.hypot(p.x - o.x, p.z - o.z) > near[0] && Math.hypot(p.x - o.x, p.z - o.z) < near[1])
    .sort((a, b) => a.x - b.x || a.z - b.z || a.n.localeCompare(b.n));
  if (!all.length) return null;
  let to = pickOf(r, all), d = Math.hypot(to.x - o.x, to.z - o.z);
  let hs = profile(w, o.x, o.z, to.x, to.z);
  let ride = rideFor(r, d, hs, short);
  if (DOWN_ONLY.includes(ride) && !downhill(w, o, to)) {
    // somewhere else well below the board that the streets really do run down to, else a ride that copes with the rest
    const from = Math.floor(r() * all.length);
    let found = false;
    for (let k = 0; k < all.length && k < 40 && !found; k++) {
      const c = all[(from + k) % all.length], cd = Math.hypot(c.x - o.x, c.z - o.z), ch = profile(w, o.x, o.z, c.x, c.z);
      if (ch[0] - ch[ch.length - 1] < MIN_DROP + 10 || !DOWN_ONLY.includes(rideFor(r, cd, ch, false)) || !downhill(w, o, c)) continue;
      to = c; d = cd; hs = ch; ride = rideFor(r, d, hs, false); found = true;
    }
    if (!found) ride = rideFor(r, d, hs, short, true);
  }
  const label = ride === "trolley" ? "Trolley dash" : ride === "pogo" ? "Pogo dash" : ride === "board" ? "Skate run" : ride === "blades" ? "Blade run"
    : ride === "scooter" ? "Scooter sprint" : ride === "bmx" ? "BMX climb" : "Bike race";
  const path = racePath(w.map, o.x, o.z, to.x, to.z);
  const from = path ? Math.max(0, lineOf(path.len) - 2) : 0;
  const pace = path ? paceAlong(w, ride, path, from) : null;
  const author = pace ? Math.round(pace[pace.length - 1] * AUTHOR) : crowTime(ride, d, hs);
  return { to, ride, d, author: Math.max(20, author), name: label, path, pace, from };
}

function poster(o: Offer, rt: Route) {
  const best = bestOf(o.seed), m = medals(rt.author);
  o.stars = o.mode === DAILY ? 2 : rt.d > 2200 ? 3 : rt.d > 1500 ? 2 : 1;
  o.blurb = `From here to <b>${esc(rt.to.n)}</b>, ${far(rt.d)} ${compassWord(rt.to.x - o.x, rt.to.z - o.z)} as the crow flies, on ${esc(rideSpecs[rt.ride].name)}. Through the checkpoints, any way you like between them. `
    + `Gold ${clock(m.gold)}, silver ${clock(m.silver)}, bronze ${clock(m.bronze)}, and a hidden author's time.${best ? ` Your best: ${clock(best.t, true)}.` : ""}`;
  o.reward = `${o.stars} prize${o.stars > 1 ? "s" : ""} for the winner's room, and your ghost`;
}
let world: QuestWorld | null = null;   // for the daily race's poster

registerJob({
  id: "race", glyph: "R", colour: COLOUR, label: "Race", again: true, take: "Start the race",
  goal: (o) => (o.mode === DAILY ? "Race to the finish and get your time on today's board" : "Race through every checkpoint and over the line first"),
  offer(r, spot: PostSpot, w) {
    const o: Offer = { kind: "race", seed: hash("race", r() * 1e9), stars: 1, title: "", blurb: "", reward: "", x: spot.x, z: spot.z, where: spot.name };
    const rt = routeOf(o, w);
    if (!rt) return null;
    o.title = `${rt.name} to ${rt.to.n}`;
    poster(o, rt);
    return o;
  },
  daily(r, spots, w) {
    world = w;
    for (let k = 0; k < 6 && spots.length; k++) {
      const spot = pickOf(r, spots);
      const o: Offer = { kind: "race", seed: hash("daily race", dayNumber(), r() * 1e9), stars: 2, title: "", blurb: "", reward: "", x: spot.x, z: spot.z, where: spot.name, mode: DAILY };
      const rt = routeOf(o, w);
      if (!rt) continue;
      o.title = `Daily race: ${rt.name.toLowerCase()} to ${rt.to.n}`;
      poster(o, rt);
      o.blurb = `Today's race, the same for everyone. ${o.blurb}`;
      return o;
    }
    return null;
  },
  build(o, w) {
    const rt = routeOf(o, w);
    if (!rt) return null;
    o.title ||= `${rt.name} to ${rt.to.n}`;
    poster(o, rt);
    if (o.say) o.blurb = `${esc(o.say)} ${o.blurb}`;
    return o;
  },
  poster(o) {
    if (o.mode !== DAILY) return "";
    if (board.seed !== o.seed && world) { const m = myDaily(o.seed); onBoard(o.seed, world.selfId, world.name, m.t, m.n); }
    return boardHtml();
  },
  lineup: {
    hold: HOLD, verb: "Enter the race", start: "race",
    spots: (o, w, n) => {
      const rt = routeOf(o, w);
      if (!rt) return [];
      const at = startOf(rt, o, w);
      return Array.from({ length: n }, (_, k) => gridSlot(w, at, k));
    },
    ready: (o, w) => { const rt = routeOf(o, w); if (rt) w.ride(rt.ride); },
  },
  start: (o, w, started, _by, local, cast) => new Race(o, w, started, local, cast),
});

/** Where a race's checkpoints and start line are, from its route. */
interface StartLine { path: RacePath | null; gates: PathPoint[]; line: PathPoint; lineAt: number }
function startOf(rt: Route, offer: Offer, w: QuestWorld): StartLine {
  const p = rt.path;
  if (p) {
    const lineAt = lineOf(p.len);
    return { path: p, gates: [...gatesOf(p).map((s) => along(p, s)), along(p, p.len)], lineAt, line: along(p, lineAt) };
  }
  // no street to be found: the old way, from the noticeboard to clear ground at the place
  const f = clearSpot(w.map, rt.to.x, rt.to.z, 25) ?? [rt.to.x, rt.to.z];
  const dx = f[0] - offer.x, dz = f[1] - offer.z, l = Math.hypot(dx, dz) || 1;
  return { path: null, lineAt: 0, gates: [{ x: f[0], z: f[1], dx: dx / l, dz: dz / l, half: 3 }], line: { x: offer.x + (dx / l) * 6, z: offer.z + (dz / l) * 6, dx: dx / l, dz: dz / l, half: 3 } };
}

/** Place k on the grid: rows across the street behind the start line, facing up the route. */
function gridSlot(w: QuestWorld, s: StartLine, k: number): { x: number; z: number; yaw: number } {
  const L = s.line, cols = Math.max(2, Math.min(4, Math.floor((L.half * 2) / 1.8)));
  const gap = Math.min(1.8, (L.half * 2 - 0.6) / cols), row = Math.floor(k / cols), col = k % cols;
  const back = 2 + row * 3.5;
  const p = s.path ? along(s.path, s.lineAt - back) : { ...L, x: L.x - L.dx * back, z: L.z - L.dz * back };
  const side = (col - (cols - 1) / 2) * gap, x = p.x - p.dz * side, z = p.z + p.dx * side;
  const c = clearSpot(w.map, x, z, 3) ?? [x, z];
  return { x: c[0], z: c[1], yaw: Math.atan2(-p.dx, -p.dz) };
}

/** What a prompt calls going again: use (E, □), or the touch screen's Again button. */
const againKey = () => ctl("again");

/** "1:23.4". */
function clock(s: number, tenths = false) {
  s = tenths ? Math.round(s * 10) / 10 : Math.round(s);
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${tenths ? r.toFixed(1).padStart(4, "0") : String(Math.round(r)).padStart(2, "0")}`;
}

// ---- best runs ----------------------------------------------------------------------------------

/** A run: its time, splits, where you were every e seconds (decimetres, each from the last), and
 *  how many checkpoints the splits are at (older runs' splits were at the quarters). */
interface Best { t: number; sp: number[]; g: string; e: number; cp?: number }

/** A run's points as x, z pairs, from its packed form. */
function unpack(g: string): number[] {
  const out: number[] = [];
  let x = 0, z = 0;
  const v = g.split(",");
  for (let k = 0; k + 1 < v.length; k += 2) { x += Number(v[k]) || 0; z += Number(v[k + 1]) || 0; out.push(x / 10, z / 10); }
  return out;
}
function pack(pts: number[]): string {
  const out: number[] = [];
  let x = 0, z = 0;
  for (let k = 0; k + 1 < pts.length; k += 2) {
    const nx = Math.round(pts[k] * 10), nz = Math.round(pts[k + 1] * 10);
    out.push(nx - x, nz - z); x = nx; z = nz;
  }
  return out.join(",");
}
function validBest(b: any): Best | null {
  if (!b || typeof b.t !== "number" || !Number.isFinite(b.t)) return null;
  const g = Array.isArray(b.g) ? pack(b.g.map(Number)) : typeof b.g === "string" ? b.g : "";
  return { t: b.t, sp: Array.isArray(b.sp) ? b.sp.map(Number).filter(Number.isFinite) : [], g: g.slice(0, 60000), e: Number(b.e) || (Array.isArray(b.g) ? 0.2 : GHOST_EVERY), cp: Number(b.cp) || 0 };
}
function bestOf(seed: number): Best | null {
  try { return validBest(JSON.parse(localStorage.getItem(KEY + seed) ?? "null")); } catch { return null; }
}
/** Keep a best (or, with "r", the fastest someone sent), and forget the oldest routes' past KEEP. */
function keepBest(seed: number, b: Best & { by?: string }, rival = "") {
  try {
    localStorage.setItem(KEY + seed + rival, JSON.stringify(b));
    const list: number[] = (JSON.parse(localStorage.getItem(KEY + "list") ?? "[]") as number[]).filter((s) => s !== seed);
    list.push(seed);
    while (list.length > KEEP) { const old = list.shift(); localStorage.removeItem(KEY + old); localStorage.removeItem(KEY + old + "r"); }
    localStorage.setItem(KEY + "list", JSON.stringify(list));
  } catch { /* full, or no storage */ }
}

// ---- the daily race's board ------------------------------------------------------------------------

/** Today's board: everyone's best time and how many goes they've had, in this room. */
const board = { seed: 0, rows: new Map<string, { name: string; t: number; n: number }>() };
function myDaily(seed: number): { t: number; n: number } {
  try { const d = JSON.parse(localStorage.getItem(KEY + "daily") ?? "null"); if (d?.s === seed) return { t: Number(d.t) || 0, n: Number(d.n) || 0 }; } catch { /* none */ }
  return { t: 0, n: 0 };
}
function keepDaily(seed: number, d: { t: number; n: number }) {
  try { localStorage.setItem(KEY + "daily", JSON.stringify({ s: seed, ...d })); } catch { /* full */ }
}
function onBoard(seed: number, id: string, name: string, t: number, n: number) {
  if (board.seed !== seed) { board.seed = seed; board.rows.clear(); }
  const was = board.rows.get(id);
  const best = t > 0 && (!was?.t || t < was.t) ? t : was?.t ?? 0;
  board.rows.set(id, { name, t: best, n: Math.max(n, was?.n ?? 0) });
}
function boardHtml(): string {
  const rows = [...board.rows.values()];
  if (!rows.length) return "";
  const legend = rows.reduce((a, b) => (b.n > a.n ? b : a));
  const times = rows.filter((r) => r.t > 0).sort((a, b) => a.t - b.t).slice(0, 5);
  return `<p>${times.map((r, k) => `${k + 1}. ${esc(r.name)} ${clock(r.t, true)}`).join(" · ") || "No times yet"}`
    + `${legend.n > 0 ? `<br>Local legend: <b>${esc(legend.name)}</b> (${legend.n} go${legend.n > 1 ? "es" : ""})` : ""}</p>`;
}

// ---- on the screen ----------------------------------------------------------------------------------

/** The race's arrow over the crosshair, pointing at the next gate. */
function hudBit(css: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:50%;pointer-events:none;z-index:5;text-align:center;font:800 22px var(--f-hud);text-shadow:0 1px 3px #000;${css}`;
  el.hidden = true;
  (document.getElementById("hud") ?? document.body).appendChild(el);
  return el;
}

/** A see-through rider: the ride and a figure on it, all one mesh. */
export function ghostModel(ride: RideKind, colour: string): THREE.Mesh {
  const g = rideModel(ride), s = rideSpecs[ride];
  if (ride === "trolley") g.position.z = -TROLLEY_AHEAD;
  const root = new THREE.Group();
  root.add(g);
  const feet = ride === "trolley" ? 0 : s.lift + 0.08;
  const fig = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => { const m = new THREE.Mesh(geo); m.position.set(x, y, z); root.add(m); };
  for (const x of [-0.11, 0.11]) fig(new THREE.BoxGeometry(0.12, 0.8, 0.14), x, feet + 0.4, 0);
  fig(new THREE.CapsuleGeometry(0.2, 0.45, 3, 8), 0, feet + 1.12, 0);
  fig(new THREE.SphereGeometry(0.14, 8, 6), 0, feet + 1.62, 0);
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
    for (const a of Object.keys(geo.attributes)) if (a !== "position" && a !== "normal") geo.deleteAttribute(a);
    parts.push(geo);
    o.geometry.dispose();
  });
  const merged = mergeGeometries(parts) ?? new THREE.BoxGeometry(0.4, 1.8, 0.4);
  for (const p of parts) p.dispose();
  return new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.33, depthWrite: false }));
}

interface Ghost { id: string; name: string; colour: string; b: Best; pts: number[]; view?: THREE.Mesh; heading: number }

/** "1st", "2nd", "11th". */

/** A gate across the street: two posts and a banner, in the race's colour with what it is on it, or
 *  chequered for the finish. One mesh for the posts and one for the banner. */
export function gateModel(g: PathPoint, text: string): THREE.Group {
  const w = g.half + 0.8, grp = new THREE.Group(), c = document.createElement("canvas");
  c.width = 512; c.height = 64;
  const x = c.getContext("2d")!;
  if (!text) {
    for (let k = 0; k < 32; k++) for (let r = 0; r < 4; r++) { x.fillStyle = (k + r) % 2 ? "#111" : "#f4f4f2"; x.fillRect(k * 16, r * 16, 16, 16); }
  } else {
    x.fillStyle = COLOUR; x.fillRect(0, 0, 512, 64);
    x.fillStyle = "#08131a"; x.font = "800 46px 'Barlow Condensed', Impact, sans-serif";
    x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, 256, 35);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const parts = [-w, w].map((s) => new THREE.BoxGeometry(0.18, 4.4, 0.18).translate(s, 2.2, 0));
  const posts = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  grp.add(new THREE.Mesh(posts, new THREE.MeshLambertMaterial({ color: "#e8e4d6" })));
  const banner = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 0.3, 0.8, 0.08), new THREE.MeshBasicMaterial({ map: tex }));
  banner.position.y = 4.1;
  grp.add(banner);
  grp.rotation.y = Math.atan2(g.dx, g.dz);
  return grp;
}

/** Seconds allowed for each leg (stops: how far along the route each checkpoint and the finish
 *  are, from the start line at start), and gold pace at each. Time left over carries on to the
 *  next leg, so each limit is how far a bronze-paced run with some slack gets by then.
 *  tools/race_probe.mjs rides real routes against them. */
export function legsOf(rt: Route, stops: number[], start: number): { legs: number[]; parAt: number[] } {
  const m = medals(rt.author), end = rt.pace ? rt.pace[rt.pace.length - 1] : 0;
  const total = stops[stops.length - 1] - start;
  // seconds from GO to each stop at the author's pace
  const at = (s: number) => (rt.pace ? (paceAt(rt, s) / end) * rt.author : (Math.max(0, s - start) / Math.max(1, total)) * rt.author);
  const legs: number[] = [], parAt: number[] = [];
  let was = 0;
  stops.forEach((s, k) => {
    const due = (at(s) / rt.author) * m.bronze * SLACK + START_GRACE + CP_GRACE * (k + 1);
    legs.push(due - was);
    was = due;
    parAt.push((at(s) / rt.author) * m.gold);
  });
  return { legs, parAt };
}

// ---- the race -------------------------------------------------------------------------------------

class Race implements Job {
  done: Job["done"] = null;
  private rt: Route;
  private medal: ReturnType<typeof medals>;
  private path: RacePath | null;
  private gates: PathPoint[];               // the checkpoints along the way, then the finish
  private line: PathPoint;                  // the start line
  private lineAt = 0;                       // and how far along the route it is
  private go: number;                       // and GO for the room
  private myGo: number;                     // and for me (a go of my own starts later)
  private start: { x: number; z: number; yaw: number };   // my place on the grid
  private fin: { x: number; z: number };
  private grid: string[];                   // who's racing, in grid order
  private cps = new Map<string, number>();  // how many checkpoints each racer's been through
  private next = 0;                         // my next gate
  private mySlot = -1;                      // my place on the grid
  private racing = false;                   // I'm on the grid or on the way
  private own = false;                      // on a go of my own (Backspace), not the room's
  private over = false;                     // I'm over the line
  private roomOver = false;                 // everyone's in, or out of time
  private results: { id: string; t: number }[] = [];
  private splits: number[] = [];
  private run: number[] = []; private runT = 0;
  private best: Best | null;
  private ghosts = new Map<string, Ghost>();
  private gate: THREE.Group | null = null; private gateKey = "";
  private arch: THREE.Group | null = null;
  private marked = "";
  private routeLine: RouteLine;
  private shown = false;                    // my results card is up, or has been, for this go
  private dnf = false;                      // I came off (or gave up) and am out of the race
  private dnfAt = 0;                        // on my clock, when
  private myT = 0;                          // my time over the line
  private holdAt: { x: number; y: number; z: number } | null = null;   // where I wait for the others, held still
  private dnfs = new Set<string>();         // who's out of the race, by their own word
  private homes = new Set<string>();        // who's over the line after running out of time
  private overAt = 0;                       // when I'd have called the race over, waiting on the host's word
  private watchId = "";                     // the racer I'm watching
  private eye: { x: number; y: number; z: number; lx: number; ly: number; lz: number } | null = null;
  private heads = new Map<string, { x: number; z: number; h: number }>();   // where each racer was and which way they're going, for the camera behind them
  private keys: ((e: KeyboardEvent) => void) | null = null;
  private lastMe: { x: number; z: number } | null = null;

  private stats = { top: 0, v: 0, boosts: 0, slip: 0, barged: 0, knocked: 0 };
  private arrow = hudBit("top:calc(50% - 96px);width:48px;margin-left:-24px;color:" + COLOUR);
  private split = "";                       // the last checkpoint's split, for its stage call
  private splitWent: "well" | "badly" | undefined;
  private firstT = 0;
  private daily: boolean;
  private legs: number[] = [];              // seconds allowed to reach each gate from the one before
  private parAt: number[] = [];             // and gold pace at each gate
  private deadline = 0;                     // on my clock, when I'm out of time
  private out = false;                      // I ran out of time (and may still be riding on to the line)
  private outT = 0;                         // when, ms since 1970
  private warned = false;                   // the hurry-up for this leg's been given
  private outs = new Set<string>();         // and who else did
  private pads: { x: number; z: number; dx: number; dz: number }[] = [];
  private padMesh: THREE.Mesh | null = null; private padKey = "";
  private padUntil = 0; private padHit = new Map<number, number>();
  private slip = false;
  private prevPos = new Map<string, { x: number; z: number }>();
  private knockedAt = new Map<string, number>();
  private immune = 0;                       // when I can be knocked off again, ms since 1970
  private beeped = 6;

  constructor(readonly offer: Offer, private w: QuestWorld, started: number, private local: boolean, cast: string[]) {
    this.rt = routeOf(offer, w)!;
    this.medal = medals(this.rt.author);
    this.daily = offer.mode === DAILY;
    // the room's race starts at GO, from the grid lineup.ts put everyone on; a go of your own starts after a moment to settle
    this.go = local ? started + RETRY * 1000 : started;
    this.myGo = this.go;
    this.best = bestOf(offer.seed);
    const at = startOf(this.rt, offer, w);
    this.path = at.path;
    const p = this.path;
    this.gates = at.gates; this.line = at.line; this.lineAt = at.lineAt;
    this.grid = local ? [] : cast.slice(0, 64);
    const f = this.gates[this.gates.length - 1];
    this.fin = { x: f.x, z: f.z };
    this.setUpClock();
    this.mySlot = local ? 0 : this.grid.indexOf(w.selfId);
    this.start = this.slot(Math.max(0, this.mySlot));
    this.routeLine = { pts: p ? p.pts : [this.line.x, this.line.z, f.x, f.z], gates: [], colour: COLOUR };
    this.lineGates();
    this.addPar();
    // your best to race, and the fastest anyone's sent you on this route
    if (this.best) this.addGhost(w.selfId, "Your best", COLOUR, this.best);
    try {
      const r = JSON.parse(localStorage.getItem(KEY + offer.seed + "r") ?? "null"), b = validBest(r);
      if (b && (!this.best || b.t < this.best.t)) this.addGhost("@rival", String(r.by ?? "A rival").slice(0, 40), "#c99cff", b);
    } catch { /* none */ }
    this.arrow.innerHTML = `<svg viewBox="0 0 48 48" width="48" height="48"><path d="M24 3 L41 38 L24 29 L7 38 Z" fill="currentColor" stroke="#000" stroke-opacity=".5" stroke-width="2"/></svg>`;
    if (this.daily) {
      const mine = myDaily(offer.seed);
      onBoard(offer.seed, w.selfId, w.name, mine.t, mine.n);
      if (!local) w.send("qe", { k: "brd", s: offer.seed, t: mine.t, n: mine.n });
    }
    this.own = local;
    if (local) {
      if (w.me().alive) { this.racing = true; w.moveTo(this.start.x, this.start.z, this.start.yaw); w.ride(this.rt.ride); }
      return;
    }
    if (this.mySlot >= 0 && w.me().alive) {
      this.racing = true;
      if (w.riding() !== this.rt.ride) w.ride(this.rt.ride);
    } else if (this.mySlot < 0) guide(`A race is on: you're watching this one. ${againKey()} to have a go of your own`);
  }

  /** Each leg's time limit and gold pace at each gate, and where the boost pads lie. */
  private setUpClock() {
    const p = this.path;
    const stops = p ? [...gatesOf(p), p.len] : [this.rt.d];
    const start = p ? this.lineAt : 0;
    const clk = legsOf(this.rt, stops, start);
    this.legs = clk.legs; this.parAt = clk.parAt;
    const pad = rng(hash("pads", this.offer.seed));
    stops.forEach((s, k) => {
      const a = k ? stops[k - 1] : start, len = Math.max(40, s - a);
      if (!p || len < 120) return;
      // spread along the leg, clear of the gates at either end and a good way apart, to either side in turn
      const fs = len < 220 ? [0.3 + pad() * 0.4] : len < 520 ? [0.24 + pad() * 0.12, 0.6 + pad() * 0.12] : [0.2, 0.46, 0.72].map((f) => f + pad() * 0.06);
      fs.forEach((f, i) => {
        const at = along(p, a + len * f), off = (i % 2 ? -1 : 1) * (0.3 + pad() * 0.7) * Math.max(0, at.half - 2) * 0.5;
        this.pads.push({ x: at.x - at.dz * off, z: at.z + at.dx * off, dx: at.dx, dz: at.dz });
      });
    });
  }

  /** A faint rider at gold pace along the route, for racing alone: it gets going from the grid at
   *  GO as the ride does, and rides the streets the route takes. */
  private addPar() {
    const p = this.path, rt = this.rt;
    if (!p || !rt.pace) return;
    const e = 0.5, T = this.parAt[this.parAt.length - 1], k = rt.pace[rt.pace.length - 1] / T, pts: number[] = [];
    for (let t = 0; t <= T + e; t += e) { const a = along(p, paceWhere(rt, t * k)); pts.push(a.x, a.z); }
    this.ghosts.set("@par", { id: "@par", name: "Gold pace", colour: "#ffe27a", b: { t: T, sp: this.parAt, g: "", e, cp: this.gates.length - 1 }, pts, heading: this.start.yaw });
  }

  private alone() { return this.own || this.grid.length <= 1; }

  /** Seconds since my GO. */
  private get now() { return (Date.now() - this.myGo) / 1000; }

  private slot(k: number) { return gridSlot(this.w, { path: this.path, gates: this.gates, line: this.line, lineAt: this.lineAt }, k); }

  private here(id: string) { return this.w.players().some((p) => p.id === id); }

  hint() { return this.againOk() ? "<b>{again}</b> Go again" : ""; }

  /** Use goes again on a ride, or in a race once you're not racing flat out: not mid-race, nor waiting for the end. */
  private againOk() {
    if (this.done || !this.w.me().alive || this.waiting()) return false;
    return (this.racing || this.w.riding()) && !(this.racing && !this.over && !this.out && !this.dnf);
  }

  aside() { return true; }

  use(): boolean { return !!this.againOk() && this.restart(); }

  /** Back on the line, on my own clock. */
  restart(): boolean {
    if (!this.w.me().alive || this.waiting()) return false;
    this.own = true; this.racing = true; this.over = false;
    this.splits = []; this.run = []; this.runT = 0; this.next = 0;
    this.out = false; this.outT = 0; this.warned = false; this.deadline = 0; this.padUntil = 0; this.padHit.clear(); this.beeped = 6;
    this.dnf = false; this.dnfAt = 0; this.myT = 0; this.holdAt = null; this.shown = false; this.eye = null;
    this.stats = { top: 0, v: 0, boosts: 0, slip: 0, barged: 0, knocked: 0 };
    this.myGo = Date.now() + RETRY * 1000;
    missionResultDrop();
    this.unwatch();
    this.lineGates();
    this.w.moveTo(this.start.x, this.start.z, this.start.yaw);
    this.w.ride(this.rt.ride);
    SFX.tick();
    return true;
  }

  held() { return this.racing && this.now < 0 && !this.dnf ? { x: this.start.x, z: this.start.z } : null; }

  update(dt: number) {
    const t = this.now, me = this.w.me();
    // coming off for good (killed) on the way: out of the race
    if (this.racing && !this.over && !this.dnf && !this.done && !me.alive) this.dropOut(t);
    if (!this.roomOver && !this.local) this.judgeRoom();
    if (!this.done) {
      const gaveUp = this.out && !this.over && !this.dnf && Date.now() - this.outT > LATE_MAX * 1000;
      if (gaveUp) this.dropOut(t);
      const mine = this.own && this.racing && !this.over && !this.dnf;
      if (this.local ? this.over || this.dnf : this.roomOver && !mine) this.finish();
    }
    if (this.done) { this.hideHud(); return; }
    this.watch(dt);
    const live = this.racing && !this.over && !this.dnf;
    const target = live ? this.gates[this.next] : this.gates[this.gates.length - 1];
    const d = Math.hypot(target.x - me.x, target.z - me.z);
    if (live && t >= 0) {
      // the run, for your ghost
      if ((this.runT -= dt) <= 0) { this.runT += GHOST_EVERY; if (this.runT < 0) this.runT = 0; this.run.push(me.x, me.z); }
      if (d < Math.max(PASS, target.half + 6) && me.alive) this.through(t);
      if (live) this.pace(t, me);
      const st = this.stats, was = this.lastMe;
      if (was && dt > 0) {
        const v = Math.hypot(me.x - was.x, me.z - was.z) / dt;
        if (v < 70) { st.v += (v - st.v) * Math.min(1, dt * 5); st.top = Math.max(st.top, st.v); }   // (not a jump back to the line)
      }
      if (this.slip) st.slip += dt;
    }
    this.lastMe = { x: me.x, z: me.z };
    if (!live || t < 0) this.rideNormally();
    this.watchRacers(dt);
    this.drawTimer(live && t >= 0, t);
    this.drawPads(me);
    this.drawArrow(me, target, live);
    this.drawGhosts(t);
    this.drawGate(me, live, t);
    this.drawArch(me);
    const key = live ? `${this.next}` : "fin";
    if (key !== this.marked) {
      this.marked = key;
      const last = this.next === this.gates.length - 1;
      const at = live ? this.gates[this.next] : this.fin;
      this.w.mark("@race", at, live && !last ? `Checkpoint ${this.next + 1} of ${this.gates.length - 1}` : `Finish: ${this.rt.to.n}`, COLOUR);
    }
  }

  /** Is the room's race over: everyone on the grid over the line, out of it or gone, or the others'
   *  time after the first one home is up? The host says so ("end") with the results; anyone else
   *  waits a moment for that before calling it themselves (an older host never says). */
  private judgeRoom() {
    const now = Date.now(), since = (now - this.go) / 1000;
    // (someone out of time may still be riding on: they say when they're home or give up)
    const still = this.grid ? this.grid.filter((id) => this.here(id) && !this.results.some((r) => r.id === id) && !this.dnfs.has(id) && !this.homes.has(id)) : null;
    const over = (this.results.length > 0 && (now - this.firstT) / 1000 > AFTER) || (since > 0 && still !== null && still.length === 0) || since > MAX_RACE;
    if (!over) { this.overAt = 0; return; }
    if (!this.w.isHost && !(since > MAX_RACE)) {
      this.overAt ||= now;
      if (now - this.overAt < END_WAIT * 1000) return;
    }
    this.roomOver = true;
    if (this.w.isHost) this.w.send("qe", { k: "end", s: this.offer.seed, r: this.results, o: [...this.outs], d: [...this.dnfs], h: [...this.homes] });
  }

  /** From Get ready till GO has faded the middle of the screen is the countdown's alone: anything
   *  else for it (a ride's intro, its keys) waits till after. */
  quiet(): boolean {
    if (!this.racing || this.over || this.dnf || this.done) return false;
    const t = this.now;
    return t < GO_HUSH && (t > -HOLD || this.own);
  }

  inIt() { return this.racing && !this.done; }

  /** Over the line or out of the race while others are still going, in the room's race: I wait,
   *  held still, and watch them. */
  waiting(): boolean {
    return !this.local && !this.own && this.racing && (this.over || this.dnf) && !this.roomOver && !this.done && (this.grid?.length ?? 1) > 1;
  }

  /** Who I can watch: those on the grid still on the way. */
  private targets(): string[] {
    const here = new Map(this.w.players().map((p) => [p.id, p]));
    return (this.grid ?? []).filter((id) => id !== this.w.selfId && here.get(id)?.alive && !this.results.some((r) => r.id === id) && !this.dnfs.has(id) && !this.homes.has(id));
  }

  /** Watch the next (by 1) or the last (by -1) racer still going. True if that's what the press was for. */
  cycle(by: number): boolean {
    if (!this.waiting()) return false;
    const ids = this.targets();
    if (!ids.length) return true;
    const k = ids.indexOf(this.watchId);
    this.watchId = ids[((k < 0 ? 0 : k + by) + ids.length) % ids.length];
    SFX.tick();
    return true;
  }

  /** While I wait: the camera behind the racer I'm watching, smoothed from where they've said they
   *  are, and the banner with the standings so far. */
  private watch(dt: number) {
    if (!this.waiting()) { this.unwatch(); return; }
    if (!this.keys) {
      // Q and E (or the arrows) switch who you watch, and so does the pad's d-pad, which presses B
      // and G; taken here so they don't fire, get in a car or mark the map while you watch
      this.keys = (e: KeyboardEvent) => {
        if (e.repeat || e.target instanceof HTMLInputElement) return;
        const by = e.code === "KeyQ" || e.code === "ArrowLeft" || (e.code === "KeyB" && !e.isTrusted) ? -1
          : (e.code === "KeyE" && e.isTrusted) || e.code === "ArrowRight" || (e.code === "KeyG" && !e.isTrusted) ? 1 : 0;
        if (!by || !this.cycle(by)) return;
        e.preventDefault(); e.stopImmediatePropagation();
      };
      addEventListener("keydown", this.keys, true);
    }
    const ids = this.targets();
    if (!ids.includes(this.watchId)) this.watchId = ids[0] ?? "";
    const them = this.watchId ? this.w.players().find((p) => p.id === this.watchId) : undefined;
    if (them) {
      const was = this.heads.get(them.id) ?? { x: them.x, z: them.z, h: this.start.yaw };
      const mx = them.x - was.x, mz = them.z - was.z;
      let h = was.h;
      if (Math.hypot(mx, mz) > 0.05) { const want = Math.atan2(-mx, -mz); h += Math.atan2(Math.sin(want - h), Math.cos(want - h)) * Math.min(1, dt * 3); }
      this.heads.set(them.id, { x: them.x, z: them.z, h });
      const fx = -Math.sin(h), fz = -Math.cos(h);
      const want = { x: them.x - fx * 8, y: Math.max(them.y, this.w.map.ground(them.x - fx * 8, them.z - fz * 8)) + 3.6, z: them.z - fz * 8 };
      const e = this.eye, k = e ? Math.min(1, dt * 5) : 1;
      this.eye = {
        x: e ? e.x + (want.x - e.x) * k : want.x, y: e ? e.y + (want.y - e.y) * k : want.y, z: e ? e.z + (want.z - e.z) * k : want.z,
        lx: them.x + fx * 4, ly: them.y + 1.2, lz: them.z + fz * 4,
      };
    } else this.eye = null;
    const mine = this.results.findIndex((r) => r.id === this.w.selfId);
    const head = this.dnf ? "Out of the race" : `Finished${mine >= 0 ? ` — ${nth(mine + 1)}` : ""}, ${clock(this.myT, true)}`;
    const sw = ctl("watch");
    const left = this.results.length ? Math.max(0, Math.ceil(AFTER - (Date.now() - this.firstT) / 1000)) : 0;
    missionWatching({
      head,
      sub: them ? `Watching <b>${esc(them.name)}</b>${ids.length > 1 ? ` · ${esc(sw)} to switch` : ""}` : "Waiting for the others",
      small: `${ids.length} still racing${left ? ` · results in ${left} s at most` : ""}`,
      rows: this.standings(false).map((r) => ({ name: r.name, time: r.time, me: r.me, watch: r.id === this.watchId })),
      many: ids.length > 1,
    }, (by) => this.cycle(by));
  }

  private unwatch() {
    if (this.keys) { removeEventListener("keydown", this.keys, true); this.keys = null; }
    this.eye = null;
    missionWatching(null);
  }

  /** Waiting for the others, alive: held still where I stopped, looking on from behind whoever I'm watching. */
  perch(): Perch | null {
    if (!this.waiting() || !this.holdAt) return null;
    const h = this.holdAt;
    return this.eye ? { ...h, bare: true, eye: this.eye } : { ...h };
  }

  /** Waiting for the others, killed: the view from behind whoever I'm watching. */
  spectate() { return this.waiting() && !this.w.me().alive ? this.eye : null; }

  private rideNormally() { if (this.boosting) { this.boosting = false; this.w.rideBoost?.(1); } }
  private boosting = false;

  /** The race's speed-up for my ride: the race's own, a boost pad's, a slipstream's; and the clock running out. */
  private pace(t: number, me: { x: number; z: number; yaw: number; alive: boolean }) {
    if (!this.deadline) this.deadline = this.legs[0];
    for (let k = 0; k < this.pads.length; k++) {
      const p = this.pads[k];
      if (t > (this.padHit.get(k) ?? -9) + 2 && Math.hypot(p.x - me.x, p.z - me.z) < PAD_R) {
        this.padHit.set(k, t); this.padUntil = t + PAD_SECS; this.stats.boosts++;
        this.w.rideBoost?.(RACE_MUL * PAD_MUL, 3);
        SFX.whoosh();
        score({ text: "BOOST!" });
      }
    }
    const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
    this.slip = false;
    if (!this.alone()) for (const o of this.w.players()) {
      if (o.id === this.w.selfId || !o.alive || !this.grid?.includes(o.id)) continue;
      const dx = o.x - me.x, dz = o.z - me.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      if (ahead > 2 && ahead < SLIP_AHEAD && side < SLIP_SIDE) { this.slip = true; break; }
    }
    this.boosting = true;
    this.w.rideBoost?.(RACE_MUL * (this.padUntil > t ? PAD_MUL : 1) * (this.slip ? SLIP_MUL : 1));
    if (this.out) return;
    const left = this.deadline - t;
    if (left <= WARN && !this.warned && left > 5) { this.warned = true; SFX.urgent(5); missionCall({ text: `Hurry! ${Math.ceil(left)} s to checkpoint ${this.next + 1}`, went: "close" }); }
    if (left <= 5 && Math.ceil(left) < this.beeped && left > 0) { this.beeped = Math.ceil(left); SFX.urgent(this.beeped); }
    if (left <= 0 && me.alive) this.timeUp();
  }

  /** Out of time: out of the placings and the medals, but free to ride on to the line for a time. */
  private timeUp() {
    this.out = true; this.outT = Date.now();
    SFX.urgent(0);
    missionCall({ text: "OUT OF TIME", sub: `Ride on to the finish for your time (no medal), or ${againKey()} to go again`, went: "badly" });
    if (!this.own) {
      const msg = { k: "out", s: this.offer.seed };
      this.w.send("qe", msg);
      this.outs.add(this.w.selfId);
    }
  }

  /** The countdown to the next gate, in the slot under the crosshair. */
  private drawTimer(on: boolean, t: number) {
    if (!on) { missionAux("race-gate", null); return; }
    const left = this.out ? 0 : Math.max(0, this.deadline - t), low = left <= 10;
    const tag = this.out ? "OUT OF TIME: NO MEDAL" : this.padUntil > t ? "BOOST" : this.slip ? "SLIPSTREAM" : `CHECKPOINT ${Math.min(this.next + 1, this.gates.length - 1)}`;
    const col = this.out ? "#ff5a4e" : left <= 5 && Math.floor(left * 2) % 2 ? "#fff" : low ? "#ff5a4e" : left <= WARN ? "#ffb02e" : "#fff";
    const big = this.out ? clock(Math.max(0, t), true) : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}${low ? `.${Math.floor((left % 1) * 10)}` : ""}`;
    missionAux("race-gate", `<div class="aux-big" style="color:${col}">${big}</div><div class="aux-tag">${tag}</div>`);
  }

  /** Other racers' speeds from how far they moved, and a barge hard enough to knock one off. */
  private watchRacers(dt: number) {
    const me = this.w.me(), prev = this.prevPos.get(this.w.selfId);
    const mine = { x: me.x, z: me.z };
    const ids = this.w.players();
    const vel = (id: string, x: number, z: number) => { const q = this.prevPos.get(id); return q && dt > 0 ? { x: (x - q.x) / dt, z: (z - q.z) / dt } : { x: 0, z: 0 }; };
    const mv = prev ? vel(this.w.selfId, me.x, me.z) : { x: 0, z: 0 };
    const t = this.now;
    const can = this.racing && !this.over && !this.out && !this.dnf && t >= 1 && !this.own && !this.w.passive && me.alive && this.grid;
    for (const o of ids) {
      if (o.id === this.w.selfId) continue;
      if (can && this.grid!.includes(o.id) && o.alive && Date.now() > (this.knockedAt.get(o.id) ?? 0)) {
        const dx = o.x - me.x, dz = o.z - me.z, d = Math.hypot(dx, dz);
        if (d < 1.6 && d > 0.01) {
          const ov = vel(o.id, o.x, o.z), closing = ((mv.x - ov.x) * dx + (mv.z - ov.z) * dz) / d;
          if (closing > KNOCK_SPEED && Math.hypot(mv.x, mv.z) > Math.hypot(ov.x, ov.z)) {
            this.knockedAt.set(o.id, Date.now() + KNOCK_COOL * 1000);
            this.stats.barged++;
            this.w.send("qe", { k: "knk", s: this.offer.seed }, o.id);
            this.w.rideBoost?.(RACE_MUL, -Math.min(3, closing * 0.35));
            SFX.thump();
            score({ text: `Barged ${o.name} off!` });
          }
        }
      }
    }
    for (const o of ids) this.prevPos.set(o.id, { x: o.x, z: o.z });
    this.prevPos.set(this.w.selfId, mine);
  }

  /** Pads for the maps' sake are only drawn near: one mesh, laid on the ground and redone now and then as the squares load. */
  private drawPads(me: { x: number; z: number }) {
    const near: number[] = [];
    if (this.racing && !this.over && !this.dnf) this.pads.forEach((p, k) => { if (Math.hypot(p.x - me.x, p.z - me.z) < PAD_SEEN) near.push(k); });
    const key = near.join(",") + (near.length ? `/${Math.floor(Date.now() / 2000)}` : "");
    if (key === this.padKey) return;
    this.padKey = key;
    this.dropPads();
    if (!near.length) return;
    const pos: number[] = [], col: number[] = [], L = 6, W = 3.4, rows = 5, cols = 2;
    const hot = [new THREE.Color("#ffd23a"), new THREE.Color("#ff7a1a")];
    const at = (p: { x: number; z: number; dx: number; dz: number }, u: number, v: number) => {
      const x = p.x + p.dx * u - p.dz * v, z = p.z + p.dz * u + p.dx * v;
      const y = this.w.map.ground(x, z);
      return [x, (Number.isFinite(y) ? y : 0) + 0.08, z];
    };
    for (const k of near) {
      const p = this.pads[k];
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
        const u0 = -L / 2 + (L * i) / rows, u1 = u0 + L / rows, v0 = -W / 2 + (W * j) / cols, v1 = v0 + W / cols;
        // chevrons: each side's rows are offset one from the other
        const c = hot[(i + j) % 2];
        const a = at(p, u0, v0), b = at(p, u1, v0), cc = at(p, u1, v1), d = at(p, u0, v1);
        for (const q of [a, b, cc, a, cc, d]) { pos.push(q[0], q[1], q[2]); col.push(c.r, c.g, c.b); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    this.padMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    this.padMesh.frustumCulled = false;
    this.w.scene.add(this.padMesh);
  }

  private dropPads() {
    if (!this.padMesh) return;
    this.w.scene.remove(this.padMesh);
    this.padMesh.geometry.dispose();
    (this.padMesh.material as THREE.Material).dispose();
    this.padMesh = null;
  }

  /** The checkpoints still to pass, for the maps. */
  private lineGates() {
    const from = this.racing && !this.over ? this.next : 0, g: number[] = [];
    for (let k = from; k < this.gates.length - 1; k++) g.push(this.gates[k].x, this.gates[k].z);
    this.routeLine = { ...this.routeLine, gates: g };
  }
  route() { return this.done ? null : this.routeLine; }

  /** Through my next gate, at t on my clock: a checkpoint, or the finish once they're all done. */
  private through(t: number) {
    const k = this.next, n = this.gates.length - 1;
    if (k === n) { this.crossed(t); return; }
    this.next++;
    this.lineGates();
    this.splits.push(t);
    const was = this.best && this.best.cp === n ? this.best.sp[k] : undefined;
    const diff = was !== undefined ? t - was : null;
    this.deadline += this.legs[k + 1] ?? 0;
    this.beeped = 6; this.warned = false;
    // the split goes on the checkpoint's stage call (card()), green ahead of gold pace and red behind
    const par = t - this.parAt[k];
    this.split = `${clock(t, true)}${diff !== null ? ` (${diff <= 0 ? "-" : "+"}${Math.abs(diff).toFixed(1)} on your best)` : ""}`
      + ` · ${par <= 0 ? "-" : "+"}${Math.abs(par).toFixed(1)} s on gold pace${this.out ? "" : ` · +${Math.round(this.legs[k + 1] ?? 0)} s`}`;
    this.splitWent = par <= 0 ? "well" : "badly";
    SFX.checkpoint();
    if (!this.own && !this.out) {
      const msg = { k: "cp", s: this.offer.seed, i: k, t: Math.round(t * 10) / 10 };
      this.w.send("qe", msg);
      this.event(msg, this.w.selfId);
    }
  }

  /** Over the line, at t on my clock. */
  private crossed(t: number) {
    this.over = true;
    this.lineGates();
    t = Math.round(t * 10) / 10;
    this.myT = t;
    this.hold();
    if (this.out) {
      // over the line after the clock ran out: a time to know, but no place, medal or best
      if (!this.own && !this.local) { this.w.send("qe", { k: "home", s: this.offer.seed }); this.homes.add(this.w.selfId); }
      else this.showSummary();
      return;
    }
    const s = this.offer.seed;
    let n = 0;
    if (this.daily) {
      const mine = myDaily(s);
      n = mine.n + 1;
      keepDaily(s, { t: mine.t && mine.t < t ? mine.t : t, n });
      onBoard(s, this.w.selfId, this.w.name, t, n);
    }
    if (!this.own) {
      const msg = { k: "fin", s, t, n };
      this.w.send("qe", msg);
      this.event(msg, this.w.selfId);
    } else this.w.send("qe", { k: "pb", s, t, n });
    const was = this.best, beat = !was || t < was.t;
    this.newBest = { beat, was };
    // a best: keep it, and send it round as a ghost for everyone else
    if (beat) {
      const b: Best = { t, sp: this.splits.slice(), g: pack(this.run), e: GHOST_EVERY, cp: this.gates.length - 1 };
      this.best = b;
      keepBest(s, b);
      this.addGhost(this.w.selfId, "Your best", COLOUR, b);
      this.w.send("qe", { k: "gh", s, b });
    }
    // with others still on the way the card waits for the end of the race, so everyone's is the same
    if (this.own || this.local) this.showSummary();
    else SFX.checkpoint();
  }
  private newBest: { beat: boolean; was: Best | null } | null = null;

  /** Out of the race on the way: killed, or out of time and given up riding on. */
  private dropOut(t: number) {
    this.dnf = true;
    this.dnfAt = Math.max(0, Math.round(t * 10) / 10);
    this.hold();
    missionAux("race-gate", null);
    this.arrow.hidden = true;
    this.rideNormally();
    this.lineGates();
    if (this.own || this.local) { this.showSummary(); return; }
    this.w.send("qe", { k: "out", s: this.offer.seed, dnf: 1 });
    this.outs.add(this.w.selfId);
    this.dnfs.add(this.w.selfId);
    SFX.urgent(0);
  }

  /** Stay put where I stopped racing, till the race is over. */
  private hold() { const me = this.w.me(); this.holdAt = { x: me.x, y: me.y, z: me.z }; }

  /** How far along the route I got, 0..1. */
  private howFar(): number {
    const p = this.path, at = this.holdAt ?? this.w.me();
    if (!p) return Math.max(0, Math.min(1, 1 - Math.hypot(this.fin.x - at.x, this.fin.z - at.z) / Math.max(1, this.rt.d)));
    // the nearest point of the route at or past the last checkpoint I went through, so a bend back on itself can't count twice
    const from = this.next > 0 ? gatesOf(p)[this.next - 1] ?? 0 : 0;
    let best = Infinity, s = 0;
    for (let k = 0; k < p.cum.length; k++) {
      if (p.cum[k] < from - 1) continue;
      const d = Math.hypot(p.pts[k * 2] - at.x, p.pts[k * 2 + 1] - at.z);
      if (d < best) { best = d; s = p.cum[k]; }
    }
    return Math.max(0, Math.min(1, (s - this.lineAt) / Math.max(1, p.len - this.lineAt)));
  }

  private who(id: string) { return id === this.w.selfId ? "You" : this.w.nameOf(id); }

  /** Everyone on the grid in order: over the line by time, then those still going by how far
   *  they've got, then out of time, then out of the race. done: the race is over, so anyone not
   *  over the line didn't finish. */
  private standings(done: boolean): { name: string; time: string; me?: boolean; dnf?: boolean; id: string }[] {
    const ids = this.grid ?? [], last = this.gates.length - 1;
    const rows: { name: string; time: string; me?: boolean; dnf?: boolean; id: string }[] = this.results.map((r) => ({ id: r.id, name: this.who(r.id), time: clock(r.t, true), me: r.id === this.w.selfId }));
    const pos = new Map(this.w.players().map((p) => [p.id, p]));
    const going = ids.filter((id) => !this.results.some((r) => r.id === id) && !this.dnfs.has(id) && !this.homes.has(id) && (done || !this.outs.has(id)) && this.here(id));
    const ahead = (id: string) => { const n = this.cps.get(id) ?? 0, g = this.gates[Math.min(n, last)], p = pos.get(id); return n * 1e5 - (p ? Math.hypot(g.x - p.x, g.z - p.z) : 9e4); };
    going.sort((a, b) => ahead(b) - ahead(a));
    for (const id of going) rows.push({ id, name: this.who(id), time: done ? (this.outs.has(id) ? "Out of time" : "DNF") : this.outs.has(id) ? "Out of time" : `CP ${Math.min(this.cps.get(id) ?? 0, last)}/${last}`, me: id === this.w.selfId, ...(done ? { dnf: true } : {}) });
    for (const id of ids) if (!rows.some((r) => r.id === id) && (this.homes.has(id) || this.outs.has(id)) && !this.dnfs.has(id)) rows.push({ id, name: this.who(id), time: "Out of time", me: id === this.w.selfId, dnf: true });
    for (const id of ids) if (!rows.some((r) => r.id === id) && this.dnfs.has(id)) rows.push({ id, name: this.who(id), time: "DNF", me: id === this.w.selfId, dnf: true });
    for (const id of ids) if (!rows.some((r) => r.id === id)) rows.push({ id, name: this.who(id), time: "Left", me: false, dnf: true });
    return rows;
  }

  /** The results card: for a go of my own straight away, for the room's race once it's over. */
  private showSummary() {
    if (this.shown) return;
    this.shown = true;
    this.unwatch();
    const n = this.gates.length - 1, multi = !this.own && !this.local && (this.grid?.length ?? 1) > 1;
    const finished = this.over && !this.out && !this.dnf;
    const mine = this.results.findIndex((r) => r.id === this.w.selfId);
    const place = multi && finished && mine >= 0 ? mine + 1 : 0;
    const t = this.over ? this.myT : this.dnf ? this.dnfAt : Math.max(0, Math.round(this.now * 10) / 10);
    const word = finished ? this.medalOf(t) : "no medal";
    const medal = word === "beat the author!" ? "author" : word === "no medal" ? "" : word;
    const lines: string[] = [];
    let best = "";
    if (finished) {
      const g = t - this.medal.gold;
      lines.push(g <= 0 ? `${Math.abs(g).toFixed(1)} s inside gold` : `${g.toFixed(1)} s off gold`);
      const nb = this.newBest;
      if (nb?.beat) best = nb.was ? `NEW BEST! ${(nb.was.t - t).toFixed(1)} s quicker` : "NEW BEST! Your first time here";
      else if (nb?.was) lines.push(`Your best ${clock(nb.was.t, true)} (+${(t - nb.was.t).toFixed(1)} s)`);
    } else {
      lines.push(this.over ? "Over the line, but out of time" : `Checkpoint ${Math.min(this.next, n)} of ${n} · ${Math.round(100 * this.howFar())}% of the route`);
      if (this.best) lines.push(`Your best ${clock(this.best.t, true)}`);
    }
    const st = this.stats;
    const stats = [{ k: "Top speed", v: `${Math.round(st.top * 2.237)} mph` }, { k: "Boosts", v: String(st.boosts) }, { k: "Checkpoints", v: `${Math.min(this.next, n)}/${n}` }];
    if (multi) stats.push({ k: "Slipstream", v: `${Math.round(st.slip)} s` }, { k: "Barged off", v: String(st.barged) });
    if (st.knocked) stats.push({ k: "Knocked off", v: String(st.knocked) });
    const reward = finished && !this.own && !this.local
      ? [place === 1 ? "A traffic cone for your head" : "", `${this.offer.stars} prize${this.offer.stars > 1 ? "s" : ""} at the finish`, medal ? `${medal === "author" ? "Gold" : medal[0].toUpperCase() + medal.slice(1)} in your trophy cabinet` : ""].filter(Boolean).join(" · ")
      : "";
    const sound = this.dnf ? "dnf" : medal === "gold" || medal === "author" ? "gold" : medal ? "medal" : "none";
    const list = multi ? this.standings(true) : [];
    missionResult({
      result: finished ? "won" : "lost", kind: "race", label: this.offer.title, colour: COLOUR,
      title: this.dnf ? "Out of the race" : this.out ? "Out of time" : place === 1 ? "Winner!" : place ? "Over the line!"
        : medal === "author" ? "Beat the author!" : medal ? `${medal[0].toUpperCase()}${medal.slice(1)}!` : "Finished!",
      place, lead: clock(t, true),
      medal: medal === "author" ? "Author" : this.dnf ? "DNF" : this.out ? "No medal" : medal ? `${medal[0].toUpperCase()}${medal.slice(1)} medal` : "No medal",
      lines, best, stats, rows: list.length > 1 ? list : undefined,
      rewards: reward ? reward.split(" · ") : [],
      again: this.w.me().alive ? () => this.again() : undefined,
      sound: () => SFX.raceEnd(sound),
    });
  }

  /** Again, from the results card: back on the line, as Backspace. */
  private again() {
    if (!this.done) { this.restart(); return; }
    dispatchEvent(new KeyboardEvent("keydown", { code: "Backspace", bubbles: true }));
  }

  private addGhost(id: string, name: string, colour: string, b: Best) {
    const was = this.ghosts.get(id);
    if (was?.view) { this.w.scene.remove(was.view); was.view.geometry.dispose(); (was.view.material as THREE.Material).dispose(); }
    this.ghosts.set(id, { id, name, colour, b, pts: unpack(b.g), heading: this.start.yaw });
  }

  /** The best runs, see-through, racing you on your clock: yours and the fastest few from the room. */
  private drawGhosts(t: number) {
    const live = this.racing && !this.over && !this.dnf && t >= 0;
    const mine = this.ghosts.get(this.w.selfId);
    const shown = [...this.ghosts.values()].filter((g) => g !== mine).sort((a, b) => a.b.t - b.b.t).slice(0, GHOSTS - (mine ? 1 : 0));
    if (mine) shown.push(mine);
    for (const g of this.ghosts.values()) {
      const n = g.pts.length / 2;
      if (!live || n < 2 || !shown.includes(g) || (g.id === "@par" && !this.alone())) { if (g.view) g.view.visible = false; continue; }
      if (!g.view) { g.view = ghostModel(this.rt.ride, g.colour); this.w.scene.add(g.view); }
      const f = t / g.b.e, i = Math.min(n - 1, Math.floor(f)), j = Math.min(n - 1, i + 1), u = Math.min(1, f - i);
      const x = g.pts[i * 2] + (g.pts[j * 2] - g.pts[i * 2]) * u, z = g.pts[i * 2 + 1] + (g.pts[j * 2 + 1] - g.pts[i * 2 + 1]) * u;
      const k2 = Math.min(n - 1, i + 3), dx = g.pts[k2 * 2] - g.pts[i * 2], dz = g.pts[k2 * 2 + 1] - g.pts[i * 2 + 1];
      if (Math.hypot(dx, dz) > 0.3) {
        const want = Math.atan2(-dx, -dz), diff = Math.atan2(Math.sin(want - g.heading), Math.cos(want - g.heading));
        g.heading += diff * 0.2;
      }
      g.view.position.set(x, this.w.map.ground(x, z), z);
      g.view.rotation.y = g.heading;
      g.view.visible = true;
    }
  }

  /** The arrow over the crosshair, pointing at the next gate. */
  private drawArrow(me: { x: number; z: number; yaw: number }, at: { x: number; z: number }, live: boolean) {
    const on = live && Math.hypot(at.x - me.x, at.z - me.z) > PASS;
    if (this.arrow.hidden === on) this.arrow.hidden = !on;
    if (!on) return;
    const want = Math.atan2(-(at.x - me.x), -(at.z - me.z));
    const rel = Math.atan2(Math.sin(want - me.yaw), Math.cos(want - me.yaw));
    this.arrow.style.transform = `rotate(${(-rel).toFixed(3)}rad)`;
  }

  private hideHud() {
    this.arrow.hidden = true; missionAux("race-gate", null);
    missionWaiting(null); this.unwatch();
    this.rideNormally(); this.dropPads(); this.padKey = "";
    for (const g of this.ghosts.values()) if (g.view) g.view.visible = false;
    this.dropGate(); this.dropArch();
  }

  /** The one gate worth standing up: the start line on the grid, then my next checkpoint as I near it. */
  private drawGate(me: { x: number; z: number }, live: boolean, t: number) {
    const last = this.gates.length - 1;
    let key = "", at: PathPoint | null = null, text = "";
    if (live && t < 0) { key = "start"; at = this.line; text = "START"; }
    else if (live && this.next < last) { key = `${this.next}`; at = this.gates[this.next]; text = `CHECKPOINT ${this.next + 1}/${last}`; }
    if (at && Math.hypot(at.x - me.x, at.z - me.z) > GATE_SEEN) key = "";
    if (key !== this.gateKey) {
      this.dropGate();
      this.gateKey = key;
      if (key && at) { this.gate = gateModel(at, text); this.gate.position.set(at.x, 0, at.z); this.w.scene.add(this.gate); }
    }
    if (this.gate && at) this.gate.position.y = this.w.map.ground(at.x, at.z);
  }

  private dropGate() {
    if (!this.gate) return;
    disposeGroup(this.gate, this.w.scene);
    this.gate = null; this.gateKey = "";
  }

  /** The chequered finish, when you're near it. */
  private drawArch(me: { x: number; z: number }) {
    const f = this.gates[this.gates.length - 1];
    const near = Math.hypot(f.x - me.x, f.z - me.z) < 300;
    if (near && !this.arch) {
      this.arch = gateModel(f, "");
      this.arch.position.set(f.x, this.w.map.ground(f.x, f.z), f.z);
      this.w.scene.add(this.arch);
    } else if (!near && this.arch) this.dropArch();
    if (this.arch) this.arch.position.y = this.w.map.ground(f.x, f.z);
  }

  private dropArch() {
    if (!this.arch) return;
    disposeGroup(this.arch, this.w.scene);
    this.arch = null;
  }

  /** Does a finish count: someone who's racing, through every checkpoint, and not impossibly quick? */
  private finOk(from: string, t: number) {
    if (!Number.isFinite(t) || t < (this.path?.len ?? this.rt.d) / TOP_SPEED) return false;
    if ((this.cps.get(from) ?? 0) < this.gates.length - 1) return false;
    return this.grid.includes(from);
  }

  private addResult(id: string, t: number) {
    if (!this.results.length) this.firstT = Date.now();
    this.results.push({ id, t });
    this.results.sort((a, b) => a.t - b.t);
    const place = this.results.findIndex((r) => r.id === id) + 1;
    const who = id === this.w.selfId ? "You" : this.w.nameOf(id);
    if (id !== this.w.selfId) SFX.jobStep();
    this.w.feed(`${named(who, this.w.colourOf(id))} crossed the line ${nth(place)} in ${clock(t, true)} (${this.medalOf(t)})`);
  }

  event(d: any, from: string) {
    const s = this.offer.seed, self = from === this.w.selfId;
    if (this.daily && (d.k === "fin" || d.k === "pb" || d.k === "brd") && !self) {
      const t = Number(d.t), n = Number(d.n);
      if (Number.isFinite(t) && Number.isFinite(n)) onBoard(s, from, this.w.nameOf(from), Math.max(0, t), Math.max(0, Math.min(9999, n)));
      // someone new to the board: say where you stand, so they see you on it too
      if (d.k === "brd") { const mine = myDaily(s); this.w.send("qe", { k: "bd2", s, t: mine.t, n: mine.n }, from); }
    }
    if (this.daily && d.k === "bd2" && !self) {
      const t = Number(d.t), n = Number(d.n);
      if (Number.isFinite(t) && Number.isFinite(n)) onBoard(s, from, this.w.nameOf(from), Math.max(0, t), Math.max(0, Math.min(9999, n)));
    }
    if (d.k === "gh" && !self) {
      const b = validBest(d.b);
      const was = this.ghosts.get(from);
      if (b && b.g && (!was || b.t < was.b.t)) {
        this.addGhost(from, this.w.nameOf(from), this.w.colourOf(from), b);
        // the fastest ghost anyone's sent is kept as a rival for next time
        let r: Best | null = null;
        try { r = validBest(JSON.parse(localStorage.getItem(KEY + s + "r") ?? "null")); } catch { /* none */ }
        if (!r || b.t < r.t) keepBest(s, { ...b, by: this.w.nameOf(from) }, "r");
      }
    }
    if (this.local) return;   // the rest is the room's race
    if (d.k === "out") {
      if (!self) { this.outs.add(from); if (d.dnf) this.dnfs.add(from); }
    } else if (d.k === "home") {
      if (!self) { this.outs.add(from); this.homes.add(from); }
    } else if (d.k === "end" && !self) {
      // the host calls the race over, with the results that stand, so everyone's card is the same
      if (Array.isArray(d.r)) for (const o of d.r.slice(0, 64)) { const t = Number(o?.t), id = String(o?.id); if (Number.isFinite(t) && !this.results.some((x) => x.id === id)) this.addResult(id, t); }
      for (const [k, set] of [["o", this.outs], ["d", this.dnfs], ["h", this.homes]] as const) if (Array.isArray(d[k])) for (const id of d[k].slice(0, 64)) if (String(id) !== this.w.selfId) set.add(String(id));
      this.roomOver = true;
    } else if (d.k === "knk") {
      const t = this.now;
      if (self || this.w.passive || !this.grid?.includes(from) || !this.racing || this.over || this.out || this.dnf || t < 0 || Date.now() < this.immune || !this.w.me().alive) return;
      this.immune = Date.now() + KNOCK_COOL * 1000 + 1400;
      this.stats.knocked++;
      this.w.knock?.();
      SFX.thump();
      missionCall({ text: "KNOCKED OFF!", went: "badly" });
    } else if (d.k === "cp") {
      const i = Number(d.i), had = this.cps.get(from) ?? 0;
      if (i === had && i < this.gates.length - 1) this.cps.set(from, i + 1);
    } else if (d.k === "fin") {
      const t = Number(d.t);
      if (this.results.some((r) => r.id === from)) return;
      // the host also holds the time up against its own clock since GO
      const ok = this.finOk(from, t) && (!this.w.isHost || t >= (Date.now() - this.go) / 1000 - LATE);
      if (!ok) {
        if (this.w.isHost) this.w.send("qe", { k: "dq", s, id: from });
        if (self) this.w.toast("That finish doesn't count: a checkpoint was missed");
        return;
      }
      this.addResult(from, t);
      if (this.w.isHost) this.w.send("qe", { k: "res", s, r: this.results });
    } else if (d.k === "dq" && typeof d.id === "string") {
      const k = this.results.findIndex((r) => r.id === d.id);
      if (k >= 0) this.results.splice(k, 1);
      if (d.id === this.w.selfId) this.w.toast("The host didn't count your finish");
    } else if (d.k === "res" && Array.isArray(d.r)) {
      const r = d.r.slice(0, 64).map((o: any) => ({ id: String(o?.id), t: Number(o?.t) })).filter((o: { t: number }) => Number.isFinite(o.t));
      // only ever adds: a "res" sent before someone's finish reached the host can arrive after it
      for (const o of r) if (!this.results.some((x) => x.id === o.id)) this.addResult(o.id, o.t);
    }
  }

  private medalOf(t: number) {
    const m = this.medal;
    return t < this.rt.author ? "beat the author!" : t < m.gold ? "gold" : t < m.silver ? "silver" : t < m.bronze ? "bronze" : "no medal";
  }

  private finish() {
    if (this.done) return;
    if (this.racing && !this.own && !this.local && !this.over && !this.dnf) {
      // still on the way when the race was called: didn't finish
      this.dnf = true; this.dnfAt = Math.max(0, Math.round(this.now * 10) / 10); this.hold();
    }
    if (this.racing && (this.local || this.own || this.grid?.includes(this.w.selfId))) this.showSummary();
    this.unwatch();
    if (!this.results.length) {
      this.done = this.local ? { won: false, text: "Time trial over", screen: this.shown } : { won: false, screen: this.shown, text: this.grid && !this.grid.length ? "Nobody entered the race" : "Nobody made it over the line" };
      return;
    }
    const top = this.results.slice(0, 3).map((r, k) => `${k + 1}. ${r.id === this.w.selfId ? "You" : this.w.nameOf(r.id)} ${clock(r.t, true)}`).join(" · ");
    // first over the line in the room: a traffic cone for your head
    const mine = this.results.find((r) => r.id === this.w.selfId), first = !this.local && this.results[0].id === this.w.selfId;
    const tier = mine ? (this.medalOf(mine.t) === "silver" ? 2 : this.medalOf(mine.t) === "bronze" || this.medalOf(mine.t) === "no medal" ? 1 : 3) : 0;
    this.done = {
      won: true, screen: this.shown, text: top, x: this.fin.x, z: this.fin.z, wear: first ? ["cone"] : undefined,
      grade: mine ? { tier: tier as 1 | 2 | 3, best: { v: tier * 1e5 - mine.t, text: ["", "bronze", "silver", "gold"][tier] }, also: first && (this.grid?.length ?? 1) > 1 ? ["rawin"] : undefined } : undefined,
    };
  }

  progress() { return { r: this.results, c: [...this.cps], o: [...this.outs], d: [...this.dnfs], h: [...this.homes] }; }
  restore(p: any) {
    if (!p || typeof p !== "object") return;
    if (Array.isArray(p.r)) for (const r of p.r) {
      const t = Number(r?.t);
      if (Number.isFinite(t) && !this.results.some((o) => o.id === String(r.id))) this.results.push({ id: String(r.id), t });
    }
    this.results.sort((a, b) => a.t - b.t);
    if (this.results.length && !this.firstT) this.firstT = Date.now();
    if (Array.isArray(p.c)) for (const c of p.c.slice(0, 64)) if (Array.isArray(c)) this.cps.set(String(c[0]), Math.max(this.cps.get(String(c[0])) ?? 0, Number(c[1]) || 0));
    for (const [k, set] of [["o", this.outs], ["d", this.dnfs], ["h", this.homes]] as const) if (Array.isArray(p[k])) for (const id of p[k].slice(0, 64)) set.add(String(id));
  }

  /** Where I am in the room's race, worked out on every screen from what each already hears: the
   *  finished by their times, then those still in it by checkpoints passed and then by who's nearest
   *  their next one, then anyone out of time or out of the race. With it, the gap to the one just
   *  ahead (or, leading, to the one behind) while you're both on the same leg. */
  private standing(): { n: number; of: number; gap?: string } | null {
    if (this.own || !this.grid) return null;
    const ids = this.grid.filter((id) => id === this.w.selfId || this.here(id));
    if (ids.length < 2) return null;
    const pos = new Map(this.w.players().map((p) => [p.id, p]));
    const toGate = (id: string) => {
      const g = this.gates[Math.min(this.cps.get(id) ?? 0, this.gates.length - 1)], p = pos.get(id);
      return p ? Math.hypot(g.x - p.x, g.z - p.z) : 9e4;
    };
    const score = (id: string) => {
      const r = this.results.findIndex((o) => o.id === id);
      if (r >= 0) return 1e9 - r;
      if (this.dnfs.has(id)) return -2e9;
      if (this.outs.has(id) || this.homes.has(id)) return -1e9 + (this.cps.get(id) ?? 0);
      return (this.cps.get(id) ?? 0) * 1e5 - toGate(id);
    };
    const order = ids.map((id) => ({ id, s: score(id) })).sort((a, b) => b.s - a.s);
    const n = order.findIndex((o) => o.id === this.w.selfId) + 1;
    const other = order[n === 1 ? 1 : n - 2];
    const leg = (id: string) => this.cps.get(id) ?? 0;
    const racing = (id: string) => !this.results.some((r) => r.id === id) && !this.outs.has(id) && !this.homes.has(id);
    let gap: string | undefined;
    if (other && racing(other.id) && racing(this.w.selfId) && leg(other.id) === leg(this.w.selfId)) {
      const m = Math.abs(toGate(this.w.selfId) - toGate(other.id));
      gap = m < 5 ? `level with ${esc(this.w.nameOf(other.id))}` : n === 1 ? `${far(m)} clear of ${esc(this.w.nameOf(other.id))}` : `${far(m)} behind ${esc(this.w.nameOf(other.id))}`;
    }
    return { n, of: ids.length, gap };
  }

  card(): Card {
    const c = this.cardBase();
    if (!this.racing || this.over || this.now < 0) return c;
    const last = this.gates.length - 1, k = this.next;
    return {
      ...c, progress: k < last ? `${k} / ${last}` : "Finish", timer: clock(Math.max(0, this.now), true),
      // (no banner for GO: the countdown has its own)
      stage: k === 0 ? undefined : { key: `cp${k}`, title: k < last ? `Checkpoint ${k} of ${last}` : "Head for the finish", sub: k < last ? this.split : `${this.rt.to.n} · ${this.split}`, went: this.splitWent },
    };
  }

  private cardBase(): Card {
    const t = this.now, me = this.w.me(), m = this.medal;
    const medalLine = `Gold ${clock(m.gold)} · silver ${clock(m.silver)} · bronze ${clock(m.bronze)}`;
    const legend = this.daily ? boardHtml() : "";
    const names = (ids: string[]) => ids.slice(0, 6).map((id) => esc(id === this.w.selfId ? "You" : this.w.nameOf(id))).join(", ") + (ids.length > 6 ? ` and ${ids.length - 6} more` : "");
    if (this.racing && !this.over && t < 0) {
      return { line: `<b class="clue">${Math.ceil(-t) <= 3 ? Math.ceil(-t) : "Get ready"}</b>`, sub: `${esc(rideSpecs[this.rt.ride].name)} · ${medalLine}${this.best ? ` · best ${clock(this.best.t, true)}` : ""}${this.grid && !this.own ? `<br>Racing: ${names(this.grid)}` : ""}` };
    }
    if (this.out && !this.over) {
      return { line: `<b class="clue">Out of time</b>: ride on to <b>${esc(this.rt.to.n)}</b> for your time, no medal`, sub: `<b>${esc(againKey())}</b> to go again${!this.own && this.results.length ? `<br>Leader ${clock(this.results[0].t, true)}` : ""}` };
    }
    const roomMine = this.results.find((r) => r.id === this.w.selfId);
    const last = this.gates.length - 1;
    if (!this.racing || this.over) {
      const mine = this.over ? this.best : null;
      const d = Math.hypot(this.fin.x - me.x, this.fin.z - me.z);
      const board = !this.own && this.results.length ? `<br>${this.results.slice(0, 5).map((r, k) => `${k + 1}. ${esc(r.id === this.w.selfId ? "You" : this.w.nameOf(r.id))} ${clock(r.t, true)}`).join(" · ")}` : "";
      return {
        line: roomMine ? `Over the line ${nth(this.results.indexOf(roomMine) + 1)} in ${clock(roomMine.t, true)}: ${this.medalOf(roomMine.t)}` : mine ? `Your best: ${clock(mine.t, true)} (${this.medalOf(mine.t)})` : `Watching: ${far(d)} to <b>${esc(this.rt.to.n)}</b>`,
        sub: `<b>${esc(againKey())}</b> to go again${board}${legend}`,
      };
    }
    const g = this.gates[this.next], d = Math.hypot(g.x - me.x, g.z - me.z);
    const sp = this.splits.map((s, k) => {
      const was = this.best?.cp === last ? this.best.sp[k] : undefined;
      return was === undefined ? clock(s, true) : `<span style="color:${s <= was ? "#58e06a" : "#ff5a4e"}">${clock(s, true)}</span>`;
    }).join(" · ");
    const where = this.next < last ? `Checkpoint ${this.next + 1}/${last}` : `<b>${esc(this.rt.to.n)}</b>`;
    const st = this.out ? null : this.standing();
    return {
      line: `${far(d)} to ${where}, ${compassWord(g.x - me.x, g.z - me.z)} · ${clock(Math.max(0, t), true)}${this.own ? " (your own go)" : ""}`,
      sub: `${sp ? `Splits ${sp}<br>` : ""}${medalLine}${!this.own && this.results.length ? ` · leader ${clock(this.results[0].t, true)}` : ""}`,
      bar: this.next / Math.max(1, last + 1),
      place: st ?? undefined,
    };
  }

  /** A lost race leaves its skid marks and the winner's ghost on the start line. */
  scarAt() { return { x: this.line.x, z: this.line.z }; }

  end() {
    this.w.mark("@race", null);
    for (const g of this.ghosts.values()) if (g.view) { this.w.scene.remove(g.view); g.view.geometry.dispose(); (g.view.material as THREE.Material).dispose(); }
    this.ghosts.clear();
    this.dropGate();
    this.dropArch();
    this.arrow.remove();
    missionAux("race-gate", null);
    missionWaiting(null); this.unwatch();
    this.rideNormally();
    this.dropPads();
  }
}

/** Take a gate down and free what it was drawn with. */
function disposeGroup(g: THREE.Group, scene: THREE.Scene) {
  scene.remove(g);
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    const m = o.material as THREE.MeshBasicMaterial;
    m.map?.dispose();
    m.dispose();
  });
}
