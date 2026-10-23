// The night out: jobs that lead into each other, so an evening has a shape. When something is done,
// a related follow-up comes up nearby within the minute, as a poster on the spot or a phone call:
//  - a pub won back: the landlord has found a biscuit tin, a short three-leg trail from the pub
//    (trail.ts) with a chest at the end;
//  - the Gaffer cuffed: his phone gives away the square the Flag Lads are eyeing next (a call, with a
//    marker on it);
//  - a trail's chest dug up: a flyer in it says "Last one back to the pub buys", a race (race.ts)
//    from the chest to the pub the trail began at, or the nearest pub;
//  - Seagull Attack won: a tourist's tip-off, and a marker on a ladder crew putting flags up
//    (invasion.ts).
// A Gaffer who gets away is tomorrow's Wanted poster as ever (wanted.ts), and goes on the night's card.
// Nobody has to follow one up: a poster lapses after 75 seconds and a call after 90, and any job
// taken by hand, or the follow-up itself, takes the other posters down (quests.ts), so a follow-up
// never gets in the way of a job someone chose. Once three things are done (jobs won, pubs won back,
// the Gaffer caught) and the room is quiet, everyone is called to one pub, the one won back most
// tonight or else the one nearest the night's first deed. When the whole room is within 30 m of the
// bar (everyone, however many you are; if someone's wandered off, those who came get it when the call
// runs out after four minutes) the night's card comes up: a front page written from the night's
// log (paper.ts, missionscreens.ts), and the next night starts from nothing. Only counted things
// make a night, so a long game of free play never calls last orders.
//
// Who decides what: the host. It hears each ending (quests.ts on every screen, invasion.ts through
// its own messages), decides what follows and sends it as "no": a link (a kind, a seed, a place and
// a few numbers) for a poster, which every screen builds into the same ordinary job, or a place and
// some words for a call. The jobs scale as they always do (a trail's legs by who is in the room, a
// race's entries, the crew sent out). The host also sends its small state (how many things are done,
// the pubs won back, the Gaffers who got away) whenever it changes and to anyone who joins, so
// whoever takes over as host carries the night on. An older page ignores "no" and sees none of it.
import * as SFX from "./audio";
import { missionNight } from "./missionscreens";
import * as Paper from "./paper";
import type { Invasion } from "./invasion";
import { compassWord, esc, far, hash, type Job, type Link, type Offer, type Quests, type QuestWorld } from "./quests";

const DEEDS = 3;                 // things done before last orders is called
const POST_LIFE = 75;            // seconds a follow-up's poster stays up
const TIP_LIFE = 90;             // and a call's marker
const LAST_LIFE = 240;           // and the call to last orders
const GATHER = 30;               // metres from the bar: everyone has to be this close
const ARRIVED = 40;              // someone gets to a call's marker this close and it comes down
const QUIET = 25;                // seconds with nothing going on before last orders is called
const WAIT = [12, 18];           // seconds after something ends before the follow-up
const TICK = 0.5;
const MIN_RACE = 250;            // a race from the chest to a pub nearer than this isn't worth the bother
const PURPLE = "#b45cff", GOLD = "#ffd84a";

interface Spot { n: string; x: number; z: number }
interface Live { msg: any; end: number }

const finite = (...v: unknown[]) => v.every((n) => typeof n === "number" && Number.isFinite(n));
const text = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
const life = (v: unknown, def: number) => Math.max(1, Math.min(300, finite(v) ? (v as number) : def));

/** A follow-up's link as it came over the network: only what a trail or a race poster can be built from. */
function linkOf(l: any): Link | null {
  if (!l || (l.kind !== "trail" && l.kind !== "race") || !finite(l.seed, l.stars, l.x, l.z)) return null;
  const to = l.to && finite(l.to.x, l.to.z) ? { n: text(l.to.n, 60), x: l.to.x as number, z: l.to.z as number } : undefined;
  return {
    kind: l.kind, seed: l.seed, stars: Math.max(1, Math.min(3, Math.round(l.stars))), title: text(l.title, 80), x: l.x, z: l.z, where: text(l.where, 60),
    mode: finite(l.mode) ? l.mode : 0, legs: finite(l.legs) ? Math.max(3, Math.min(8, Math.round(l.legs))) : undefined, to, say: text(l.say, 300),
  };
}

export class NightOut {
  private deeds = 0;
  private since = 0;                         // when the night's first deed was done (ms)
  private lastAt = 0;
  private first: Spot | null = null;         // the pub nearest the first deed
  private tally: (Spot & { c: number })[] = [];   // pubs won back tonight, and how often
  private away: string[] = [];               // Gaffers who got away tonight
  private live: { post: Live | null; tip: Live | null; lo: Live | null } = { post: null, tip: null, lo: null };
  private due: { at: number; run: () => void } | null = null;   // host: the follow-up that's coming
  private t = 0;
  private sendT = 0;
  private dirty = false;

  constructor(private w: QuestWorld, private quests: Quests, private invasion: Invasion) {}

  // ---- hearing what's done (host) -----------------------------------------------------------------

  /** A job for the room ended, on every screen. */
  jobEnd(o: Offer, d: NonNullable<Job["done"]>) {
    if (!this.w.isHost || !d.won) return;
    const at = { x: d.x ?? o.x, z: d.z ?? o.z };
    this.deed(at);
    if (o.kind === "trail") this.later(() => this.chestRace(o, at));
    else if (o.kind === "gulls") this.later(() => this.crewTip(at));
  }

  /** The Flag Lads' side of things, from invasion.ts, on every screen. */
  flagLads(what: "won" | "lost" | "cuffed" | "down" | "away", d: any) {
    if (!this.w.isHost) return;
    if (what === "away") { this.away = [...this.away.filter((n) => n !== d.n), text(d.n, 40)].slice(-4); this.dirty = true; return; }
    const at = { x: +d.x, z: +d.z };
    if (what === "lost" || !finite(at.x, at.z)) return;
    this.deed(at);
    if (what === "won") {
      const pub = { n: text(d.name, 60), x: at.x, z: at.z }, seen = this.tally.find((p) => p.n === pub.n);
      if (seen) seen.c++; else this.tally.push({ ...pub, c: 1 });
      this.later(() => this.biscuitTin(pub));
    } else if (what === "cuffed") this.later(() => this.flagTip(at, text(d.n, 40)));
  }

  private deed(at: { x: number; z: number }) {
    if (!this.deeds) { this.since = Date.now(); this.first = this.nearestPub(at.x, at.z); }
    this.deeds++;
    this.lastAt = Date.now();
    this.dirty = true;
  }

  private later(run: () => void) { this.due = { at: Date.now() + (WAIT[0] + Math.random() * (WAIT[1] - WAIT[0])) * 1000, run }; }

  // ---- what follows (host) --------------------------------------------------------------------------

  private biscuitTin(pub: Spot) {
    this.post({
      kind: "trail", seed: hash("night tin", pub.n, Date.now()), stars: 1, title: "The landlord's biscuit tin", x: pub.x, z: pub.z, where: pub.n, mode: 0, legs: 3,
      say: `The landlord of ${pub.n} has found his late wife's biscuit tin behind the bar. "Her favourite walk," he says. "Three tins, and a chest at the end."`,
    }, `The landlord at ${pub.n} has a biscuit tin for you: a poster's gone up outside`);
  }

  private chestRace(o: Offer, at: { x: number; z: number }) {
    const pub = this.nearestPub(o.x, o.z);
    if (!pub || Math.hypot(pub.x - at.x, pub.z - at.z) < MIN_RACE) return;
    this.post({
      kind: "race", seed: hash("night race", pub.n, Date.now()), stars: 1, title: `Last one back to ${pub.n} buys`, x: at.x, z: at.z, where: "the chest", to: pub,
      say: `The flyer in the chest says: "Last one back to ${pub.n} buys."`,
    }, `A flyer in the chest: last one back to ${pub.n} buys. A race poster's gone up here`);
  }

  private flagTip(from: { x: number; z: number }, gaffer: string) {
    const sq = this.invasion.eyeing();
    if (!sq) return;
    const near = this.placeNear(sq.x, sq.z);
    this.call(sq, "Flag Lads' next target", `${gaffer || "The Gaffer"}'s phone has the Flag Lads' plan: they're eyeing the square ${far(Math.hypot(sq.x - from.x, sq.z - from.z))} ${compassWord(sq.x - from.x, sq.z - from.z)}${near ? `, round ${near}` : ""}`);
  }

  private crewTip(from: { x: number; z: number }) {
    const crew = this.invasion.crewNear(from.x, from.z);
    if (!crew) return;
    const near = this.placeNear(crew.x, crew.z);
    this.call(crew, "Ladder crew", `A tourist catches you up: "There's men putting flags up${near ? ` by ${near}` : " on our street"}, you know." ${far(Math.hypot(crew.x - from.x, crew.z - from.z))} ${compassWord(crew.x - from.x, crew.z - from.z)}`);
  }

  private post(l: Link, say: string) {
    if (!this.quests.putUp(l, POST_LIFE)) return;
    this.send({ k: "up", l, e: POST_LIFE, m: say });
  }

  private call(at: { x: number; z: number }, label: string, say: string) {
    this.send({ k: "ph", x: Math.round(at.x), z: Math.round(at.z), lb: label, m: say, e: TIP_LIFE });
  }

  private callLast() {
    const top = [...this.tally].sort((a, b) => b.c - a.c)[0] ?? this.first;
    if (!top) return;
    this.send({ k: "lo", n: top.n, x: Math.round(top.x), z: Math.round(top.z), e: LAST_LIFE });
  }

  private finishNight(n: string) {
    this.send({ k: "cd", n, s: this.since, a: this.away });
    this.reset();
  }

  private reset() { this.deeds = 0; this.since = 0; this.first = null; this.tally = []; this.away = []; this.dirty = true; }

  // ---- every screen ------------------------------------------------------------------------------------

  /** Every frame; the work is done twice a second. */
  update(dt: number) {
    if ((this.t -= dt) > 0) return;
    this.t = TICK;
    if (this.w.isHost) this.host();
    const now = Date.now();
    for (const k of ["post", "tip", "lo"] as const) if (this.live[k] && this.live[k]!.end <= now) this.drop(k);
  }

  private drop(k: "post" | "tip" | "lo") {
    this.live[k] = null;
    if (k === "tip") this.w.mark("@tip", null);
    if (k === "lo") this.w.mark("@last", null);
  }

  private host() {
    const now = Date.now();
    const busy = !!this.quests.running && !this.quests.running.done;
    if (this.live.post && (busy || !this.quests.chained())) this.live.post = null;
    if (this.due && now >= this.due.at) {
      if (!busy && !this.live.post) { const run = this.due.run; this.due = null; run(); }
      else if (now > this.due.at + 60000) this.due = null;
    }
    const tip = this.live.tip?.msg;
    if (tip && this.w.players().some((p) => p.alive && Math.hypot(p.x - tip.x, p.z - tip.z) < ARRIVED)) this.send({ k: "x" });
    const lo = this.live.lo;
    if (lo) {
      const alive = this.w.players().filter((p) => p.alive), here = alive.filter((p) => Math.hypot(p.x - lo.msg.x, p.z - lo.msg.z) < GATHER).length;
      if (here && (here === alive.length || now >= lo.end - 1000)) this.finishNight(lo.msg.n);
      else if (now >= lo.end - 1000) { this.send({ k: "lx" }); this.reset(); }
    } else if (this.deeds >= DEEDS && !busy && !this.due && !this.live.post && now - this.lastAt > QUIET * 1000) this.callLast();
    if (this.dirty && (this.sendT -= TICK) <= 0) { this.sendT = 3; this.dirty = false; this.w.send("no", this.state()); }
  }

  private state() {
    return {
      k: "st", d: this.deeds, s: this.since, f: this.first ? [this.first.n, this.first.x, this.first.z] : 0,
      t: this.tally.slice(0, 6).map((p) => [p.n, Math.round(p.x), Math.round(p.z), p.c]), a: this.away,
    };
  }

  /** The host's word, to everyone and to itself. */
  private send(d: any) {
    this.w.send("no", d);
    this.apply(d, this.w.selfId);
  }

  /** Someone joined: the host tells them where the night's got to. */
  joined(id: string) {
    if (!this.w.isHost) return;
    this.w.send("no", this.state(), id);
    const now = Date.now();
    for (const k of ["post", "tip", "lo"] as const) {
      const l = this.live[k];
      if (l && l.end > now) this.w.send("no", { ...l.msg, e: (l.end - now) / 1000, m: "" }, id);
    }
  }

  onMessage(d: any, from: string) { this.apply(d, from); }

  private apply(d: any, from: string) {
    if (!d || typeof d !== "object" || (this.w.isHost && from !== this.w.selfId)) return;
    const now = Date.now();
    if (d.k === "up") {
      const l = linkOf(d.l), e = life(d.e, POST_LIFE);
      if (!l || (!this.quests.putUp(l, e) && !this.w.isHost)) return;
      this.live.post = { msg: d, end: now + e * 1000 };
      this.said(d.m, false);
    } else if (d.k === "ph" && finite(d.x, d.z)) {
      const e = life(d.e, TIP_LIFE);
      this.live.tip = { msg: d, end: now + e * 1000 };
      this.w.mark("@tip", { x: d.x, z: d.z }, text(d.lb, 40) || "Tip-off", PURPLE);
      this.said(d.m, true);
    } else if (d.k === "x") {
      this.drop("tip");
    } else if (d.k === "lo" && finite(d.x, d.z)) {
      const e = life(d.e, LAST_LIFE), me = this.w.me(), n = text(d.n, 60);
      this.live.lo = { msg: d, end: now + e * 1000 };
      this.w.mark("@last", { x: d.x, z: d.z }, `Last orders: ${n}`, GOLD);
      this.said(`Last orders! Everyone to ${n} for one for the road, ${far(Math.hypot(d.x - me.x, d.z - me.z))} ${compassWord(d.x - me.x, d.z - me.z)}. Get the whole room within ${GATHER} m of the bar`, true);
    } else if (d.k === "lx") {
      this.drop("lo");
      this.said("Last orders came and went with nobody at the bar", false);
    } else if (d.k === "cd") {
      this.drop("lo");
      this.card(text(d.n, 60), finite(d.s) ? d.s : 0, Array.isArray(d.a) ? d.a.slice(0, 4).map((n: unknown) => text(n, 40)) : []);
    } else if (d.k === "st" && !this.w.isHost) {
      this.deeds = finite(d.d) ? d.d : 0;
      this.since = finite(d.s) ? d.s : 0;
      this.first = Array.isArray(d.f) && finite(d.f[1], d.f[2]) ? { n: text(d.f[0], 60), x: d.f[1], z: d.f[2] } : null;
      this.tally = Array.isArray(d.t) ? d.t.slice(0, 6).filter((p: any[]) => Array.isArray(p) && finite(p[1], p[2], p[3])).map((p: any[]) => ({ n: text(p[0], 60), x: p[1], z: p[2], c: p[3] })) : [];
      this.away = Array.isArray(d.a) ? d.a.slice(0, 4).map((n: unknown) => text(n, 40)) : [];
      this.lastAt = now;
    }
  }

  private said(m: unknown, ring: boolean) {
    const s = text(m, 300);
    if (!s) return;
    if (ring) SFX.phone(); else SFX.jobStep();
    this.w.toast(s, 6);
    this.w.feed(ring ? `\u{1F4DE} ${esc(s)}` : esc(s));
  }

  private card(pub: string, since: number, away: string[]) {
    const story = Paper.nightStory(since, pub, away)
      ?? { head: "A night to remember", stand: `The night ended at ${pub}.`, by: "By our night reporter", body: [], items: [] };
    missionNight({ pub, ...story });
    SFX.jobDone(true);
  }

  // ---- places ---------------------------------------------------------------------------------------------

  private nearestPub(x: number, z: number): Spot | null {
    let best: Spot | null = null, d = Infinity;
    for (const p of this.w.pubs()) { const k = Math.hypot(p.x - x, p.z - z); if (k < d) { d = k; best = { n: p.name, x: p.x, z: p.z }; } }
    return best;
  }

  /** The name of a pub or place close to here, or empty. */
  private placeNear(x: number, z: number): string {
    let best = "", d = 400;
    for (const p of this.w.places()) { const k = Math.hypot(p.x - x, p.z - z); if (k < d) { d = k; best = p.n; } }
    for (const p of this.w.pubs()) { const k = Math.hypot(p.x - x, p.z - z); if (k < d) { d = k; best = p.name; } }
    return best;
  }

  dispose() {
    for (const k of ["post", "tip", "lo"] as const) this.drop(k);
  }
}
