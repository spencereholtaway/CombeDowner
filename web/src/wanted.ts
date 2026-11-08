// Wanted: one man with a silly made-up title, and you have to catch him. He's marked on everyone's
// map and compass from the start, and he does his round of three stops: a pub, then a park or some
// such, then a bus stop, round and round. A few of his crew hang about with him and have a go at
// anyone who comes for him.
//
// Get close and he legs it, faster than you can sprint, but only for a few seconds at a time before
// he's out of puff and has to slow down for a moment: that's when you catch him. Get right up to him
// and cuff him (E, the pad's use button or the touch screen's) and he's caught. A paintball hit or a
// car winds him as well, so friends can help. Fall too far behind for a few seconds, or let a chase
// go on too long, and he's got away to his next stop: that's one of your three goes, and the third
// time he's gone for good. Quarter of an hour on the clock is plenty for all three.
//
// The more of you there are, the quicker he is and the further off he spots you coming, and the more
// mates he has about him.
//
// A Gaffer who got away from a pub takeover (invasion.ts) is a poster too, under his own name and
// with his pub on it: he's mode 1 (on foot), 2 (a scooter) or 3 (his van), and the further he went,
// the quicker he is now.
//
// It opens with the shared title card and a note that the job control brings back his brief
// (brief.ts), with his round of stops, the goes and how to catch him on it (wantedscreens.ts).
// While he's running, his puff is on the bar across the top of the screen. The end is the shared
// result card (missionscreens.ts) in the poster's red.
//
// Who decides what: the poster comes from the day's seed (quests.ts), so everyone has the same one,
// and so does his gang's kit. The host runs him and his mates, decides when he runs, how much puff he has
// and when he's got away, and sends that round ("at") every second, twice a second in a chase.
// Cuffing him is asked of the host ("cuff"), who says if it worked ("got"); the host also says when
// he's got away for now ("lost") or for good ("away"), and what he says ("act", "line").
//
// He never hangs about within 290 m of a nursery or primary school's grounds (safezones.ts), so he
// never starts a chase in one. Once he's on the run, anything goes.
import * as SFX from "./audio";
import { NAUGHTY, CRICKET, RUGBY, SOCIETY, look } from "./naughtyboys";
import { missionCall, missionResult } from "./missionscreens";
import { guide, named } from "./notice";
import { wantedBlock } from "./wantedscreens";
import { RIDES, rideSpecs } from "./rides";
import { clearSpot, hauntsNear, streetSpot } from "./haunts";
import { inSafeZone } from "./safezones";
import { type Grade } from "./trophies";
import { type Card, type Job, type Offer, type PostSpot, type QuestWorld, type Rng, compassWord, esc, far, hash, pickOf, registerJob, rng, shuffled } from "./quests";

const TITLES = [
  "the Duke of Disorder", "the Marquis of Mischief", "the Countess of Chaos", "the Mayor of Mayhem", "Captain Kerfuffle",
  "the High Sheriff of Shenanigans", "the Professor of Pandemonium", "the Kingpin of Kerfuffle", "the Grand Wazzock",
  "the Baron of Bother", "the Earl of Aggro", "Lord Rumpus", "the Viscount of Vexation", "the Wizard of Wobbles",
  "the Commodore of Commotion", "Doctor Hullabaloo", "the Admiral of Argy-Bargy", "the Squire of Squabbles",
];
const CREWS: { kind: number; name: string; who: string }[] = [
  { kind: NAUGHTY, name: "naughty boys", who: "a gang of naughty boys" },
  { kind: RUGBY, name: "rugby lads", who: "a rugby team gone rogue" },
  { kind: CRICKET, name: "cricketers", who: "a cricket club gone bad" },
  { kind: SOCIETY, name: "Flag Lads", who: "a breakaway lot of Flag Lads" },
];
const GOES = 3;             // he gets away this many times and the job's lost
const LIMIT = 15 * 60;      // seconds on the clock: plenty for three goes
const SPOOK = 30;           // he runs when anyone's this close (more with more of you)
const SPRINT = 8;           // m/s flat out: you sprint at 7.4
const PUFF = 6;             // seconds he can keep that up
const WINDED = 3;           // then this long getting his breath back
const JOG = 3.8;            // at this pace
const STING = 0.3;          // a hit takes this much of his puff
const CUFF = 2.6;           // close enough to cuff him
const LOSE = 80;            // nobody this close to him
const LOSE_FOR = 5;         // for this long, and he's got away
const CHASE_MAX = 120;      // and no chase lasts longer than this
const BRING = 250;          // he and his mates turn up at his stop when someone's this close
const VANISH = 400;         // and go back out of sight when nobody is, till he's running
const DWELL_EVERY = 12;     // seconds between the things he says at a stop
const RULES = [
  `<b>He's on your map.</b> Get close and he legs it: he's quicker than you, but soon out of puff.`,
  `<b>Catch him and cuff him</b> (<b>{use}</b>). A paintball hit winds him.`,
  `<b>Three goes.</b> Fall too far behind and he's off to his next stop. Lose him three times and he's gone.`,
];
const HP = 100000;          // he can't be shot down: he has to be caught
const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;
const paperUp = () => { const b = document.getElementById("scoreboard"); return !!b && !b.hidden; };
const COLOUR = "#e04848";
const BOLT = ["Leg it!", "Not today, officer!", "You'll never take me alive!", "Catch me if you can!"];
const GASP = ["Hang on... can't... breathe...", "Oof. Stitch.", "Should've... given up... the pasties..."];
const NEARLY = ["Get him!", "He's slowing down!", "He's out of puff!"];

interface Haunt { n: string; x: number; z: number; bus: boolean; label: string; act: string }

/** The poster's details, from its seed. */
function details(o: Offer, w: QuestWorld) {
  const r = rng(o.seed);
  // a Gaffer who got away keeps his own name and crew, and the faster he went, the quicker he is now
  const how = o.mode ?? 0;
  let title = pickOf(r, TITLES), crew = CREWS[Math.floor(r() * CREWS.length)];
  const kit = Math.floor(r() * 4);
  if (how) { title = o.title.replace(/^Wanted: /, ""); crew = CREWS[3]; }
  const haunts = hauntsFor(o, w, r);
  const ride = pickOf(r, RIDES.filter((k) => k !== "trolley"));
  return { title, crew, kit, haunts, ride, quick: how ? (how - 1) * 0.6 : 0 };
}

/**
 * His routine: a pub 400 m to 1.3 km from the noticeboard, then a park or square near that, then a
 * bus stop by somewhere else near that (the stop itself is found when he gets there, as the stops
 * are only known round where people are). None is within 290 m of a nursery or primary school's
 * grounds (safezones.ts). Every player works this out alike, from the map and city-wide names only.
 */
function hauntsFor(o: Offer, w: QuestWorld, r: Rng): Haunt[] {
  const ok = (x: number, z: number) => w.map.fieldEdge(x, z) > 120 && !inSafeZone(w.map, x, z, 90, false);
  const sort = <T extends { x: number; z: number; n: string }>(a: T[]) => a.sort((p, q) => p.x - q.x || p.z - q.z || p.n.localeCompare(q.n));
  const pubs = sort(w.pubs().map((p) => ({ n: p.name, x: p.x, z: p.z })).filter((p) => ok(p.x, p.z)));
  const places = sort(w.places().filter((p) => ok(p.x, p.z)));
  const out: Haunt[] = [];
  const choose = (first: typeof pubs, second: typeof pubs, from: { x: number; z: number }, near: number, farOut: number, bus: boolean) => {
    for (const pool of [first, second]) {
      for (const p of shuffled(r, pool)) {
        const d = Math.hypot(p.x - from.x, p.z - from.z);
        if (d < near || d > farOut || out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 350 || q.n === p.n)) continue;
        const pub = pubs.includes(p);
        out.push({ ...p, bus, label: bus ? "a bus stop" : pub ? "a pub" : "a park or square", act: bus ? "Where's that bus got to?" : pub ? "Cheers! Same again." : "Here, duck duck duck..." });
        return true;
      }
    }
    return false;
  };
  if (!choose(pubs, places, o, 400, 1300, false)) return out;
  if (!choose(places, pubs, out[0], 350, 900, false)) return out;
  choose([...pubs, ...places], [], out[1], 350, 900, true);
  return out;
}

registerJob({
  id: "wanted", glyph: "W", colour: COLOUR, label: "Wanted",
  goal: (o) => `Catch ${o.title.replace(/^Wanted: /, "")} and cuff him. Lose him three times and he's gone`,
  offer(r, spot: PostSpot, w) {
    const o: Offer = { kind: "wanted", seed: hash("wanted", r() * 1e9), stars: 1 + Math.floor(r() * 3), title: "", blurb: "", reward: "", x: spot.x, z: spot.z, where: spot.name };
    const d = details(o, w);
    if (d.haunts.length < 3) return null;
    o.title = `Wanted: ${d.title}`;
    describe(o, d);
    return o;
  },
  fugitive(f, w) {
    const o: Offer = { kind: "wanted", seed: hash("gaffer", f.id), stars: 3, title: `Wanted: ${f.name}, the Gaffer`, blurb: "", reward: "", x: f.x + 6, z: f.z, where: f.pub, mode: 1 + f.how };
    const d = details(o, w);
    if (d.haunts.length < 3) return null;
    describe(o, d, `The Flag Lads' Gaffer, last seen leaving <b>${esc(f.pub)}</b> in a hurry, and still quick on his feet. `);
    return o;
  },
  lineup: { start: "timed" },
  start: (o, w, started, _by, _local, cast) => new Wanted(o, w, started, cast),
});

/** What the poster says, and what he's worth. */
function describe(o: Offer, d: ReturnType<typeof details>, lead = "") {
  o.blurb = `${lead}Runs with ${esc(d.crew.who)}. Does the rounds of <b>${d.haunts.map((h) => esc(h.label)).join("</b>, then <b>")}</b>.`
    + `<br>He's quick, but he runs out of puff: catch him and cuff him. Lose him three times and he's gone.`;
  o.reward = `${o.stars + 1} prizes and ${rideSpecs[d.ride].name}`;
}

class Wanted implements Job {
  done: Job["done"] = null;
  private d: ReturnType<typeof details>;
  private h = 0;                       // which stop he's at
  private ring: { i: number; gen: number } | null = null;
  private seen: { x: number; z: number } | null = null;     // where he is, as the host last said
  private running = false;
  private breath = 1;                  // his puff, 0..1; out of it, he's winded
  private winded = false;
  private goes = 0;                    // times he's got away
  private by = "";                     // who's chasing him hardest, as the host last said
  // host only
  private mates: { i: number; gen: number }[] = [];
  private stops = new Map<number, [number, number]>();
  private windT = 0; private chaseT = 0; private farT = 0; private lastHp = HP;
  private wp: { x: number; z: number } | null = null; private wpT = 0;
  private actT = DWELL_EVERY; private sendT = 0;
  // every player
  private markT = 0; private marked = false;
  private splashed = false; private splashWait = 0;

  constructor(readonly offer: Offer, private w: QuestWorld, private started: number, private cast: string[]) {
    this.d = details(offer, w);
  }

  private get left() { return LIMIT - (Date.now() - this.started) / 1000; }
  private get haunt() { return this.d.haunts[this.h % this.d.haunts.length]; }
  private get nextHaunt() { return this.d.haunts[(this.h + 1) % this.d.haunts.length]; }

  /** Him as drawn on this screen, if he's about. */
  private drawn() {
    const b = this.ring ? this.w.naughtyBoys.at(this.ring.i) : null;
    return b?.alive && b.gen === this.ring!.gen ? b : null;
  }

  /** Where he is, as best this screen knows: drawn, or as the host said, or his stop. */
  private where() { return this.drawn() ?? this.seen ?? { x: this.haunt.x, z: this.haunt.z }; }

  // ---- everyone -------------------------------------------------------------------------------

  update(dt: number) {
    if (this.done) return;
    if ((this.markT -= dt) <= 0) {
      this.markT = this.running ? 0.5 : 1;
      const at = this.where();
      this.w.mark("@wanted", { x: at.x, z: at.z }, this.running ? `${this.d.title} (running)` : `${this.d.title}, at ${this.haunt.label}`, COLOUR);
      this.marked = true;
    }
    // the Chronicle (up for a while when you join, or on Tab) would sit on top of it: it waits its turn
    if (!this.splashed && (!paperUp() || (this.splashWait += dt) > 25)) { this.splashed = true; this.showSplash(); }
  }

  private posterInfo() {
    return {
      title: this.d.title,
      stops: this.d.haunts.map((h, k) => ({ label: h.label, kind: (h.bus ? "bus" : h.label.includes("pub") ? "pub" : "park") as "pub" | "park" | "bus", now: k === this.h % this.d.haunts.length })),
      goes: { left: GOES - this.goes, of: GOES },
    };
  }

  /** As the bounty starts: the title card has said what it is, so just where the poster is. */
  private showSplash() {
    guide({ text: "{job}: the Wanted poster, with his round and how to catch him" });
  }

  /** His round, the goes left and how to catch him, on the brief J brings back (quests.ts). */
  brief() { return this.done ? "" : wantedBlock(this.posterInfo(), RULES); }

  /** Him, if he's close enough for you to cuff. */
  private canCuff() {
    const me = this.w.me(), b = this.drawn();
    return !!b && me.alive && Math.hypot(b.x - me.x, b.z - me.z) < CUFF && Math.abs(b.y - me.y) < 2;
  }

  hint() { return !this.done && this.canCuff() ? "<b>{use}</b> Cuff him!" : ""; }

  use() {
    if (this.done || !this.canCuff()) return false;
    this.ask({ k: "cuff" });
    return true;
  }

  /** His puff on the bar across the top of the screen, while he's running and you're near. */
  bossBar() {
    if (!this.running) return null;
    const me = this.w.me(), at = this.where();
    return Math.hypot(at.x - me.x, at.z - me.z) < 150 ? { name: this.winded ? "Out of puff: cuff him!" : "His puff", fill: this.breath } : null;
  }

  /** Ask the host for something (or do it, if we are the host). */
  private ask(m: Record<string, unknown>) {
    const msg = { ...m, s: this.offer.seed };
    if (this.w.isHost) this.event(msg, this.w.selfId);
    else this.w.send("qe", msg);
  }
  /** Tell everyone, us included. */
  private tell(m: Record<string, unknown>) {
    const msg = { ...m, s: this.offer.seed };
    this.w.send("qe", msg);
    this.event(msg, this.w.selfId);
  }

  // ---- the host -------------------------------------------------------------------------------

  /** Host: where he hangs about at stop h. A bus stop is found once the streets there are in. */
  private stopOf(h: number): [number, number] {
    const had = this.stops.get(h);
    if (had) return had;
    const hh = this.d.haunts[h % this.d.haunts.length];
    if (!hh.bus) return [hh.x, hh.z];
    if (!this.w.map.detailedAt(hh.x, hh.z)) return [hh.x, hh.z];
    const bus = hauntsNear(this.w.map, hh.x, hh.z, 250).filter((s) => s.kind === "bus")
      .sort((a, b) => Math.hypot(a.x - hh.x, a.z - hh.z) - Math.hypot(b.x - hh.x, b.z - hh.z))[0];
    const at: [number, number] = bus ? [bus.x, bus.z] : [hh.x, hh.z];
    this.stops.set(h, at);
    return at;
  }

  /** His top speed and how close you can get before he runs: more of you after him, and he's quicker and warier. */
  private scale() {
    const extra = Math.max(0, this.cast.length - 1);
    return { sprint: SPRINT + this.d.quick + Math.min(0.8, extra * 0.2), spook: SPOOK + Math.min(16, extra * 4), mates: Math.min(5, this.offer.stars + Math.floor(extra / 2)) };
  }

  host(dt: number) {
    if (this.done) return;
    if (this.left <= 0) { this.tell({ k: "away" }); return; }
    const ch = this.w.naughtyBoys, alive = this.w.players().filter((p) => p.alive);
    const [sx, sz] = this.stopOf(this.h);
    const b = this.ring ? ch.get(this.ring.i, this.ring.gen) : null;
    if (this.ring && !b) { this.ring = null; this.running = false; this.sendT = 0; }
    if (!b) {
      if (alive.some((p) => Math.hypot(p.x - sx, p.z - sz) < BRING)) this.bring(sx, sz);
    } else {
      let near: (typeof alive)[number] | null = null, nd = Infinity;
      for (const p of alive) { const d = Math.hypot(p.x - b.x, p.z - b.z); if (d < nd) { nd = d; near = p; } }
      const hurt = b.hp < this.lastHp;
      this.lastHp = b.hp;
      if (!this.running) {
        if (nd > VANISH) this.letGo();
        else if (nd < this.scale().spook || hurt) this.bolt(near);
        else if ((this.actT -= dt) <= 0) { this.actT = DWELL_EVERY; this.tell({ k: "act" }); }
      } else this.chase(dt, b, near, nd, hurt);
    }
    if ((this.sendT -= dt) <= 0) {
      this.sendT = this.running ? 0.5 : 1;
      this.tell({ k: "at", ...this.state() });
    }
  }

  /** Host: one moment of the chase. */
  private chase(dt: number, b: { x: number; z: number }, near: { id: string; x: number; z: number } | null, nd: number, hurt: boolean) {
    const ch = this.w.naughtyBoys, ring = this.ring!, s = this.scale();
    this.chaseT += dt;
    this.farT = nd > LOSE ? this.farT + dt : 0;
    if (this.farT > LOSE_FOR || this.chaseT > CHASE_MAX) { this.getAway(); return; }
    if (near && near.id !== this.by) { this.by = near.id; this.sendT = 0; }
    if (hurt) this.breath = Math.max(0, this.breath - STING);
    if (this.winded) {
      this.breath = Math.min(1, this.breath + dt / WINDED);
      if ((this.windT -= dt) <= 0) { this.winded = false; this.breath = 1; this.sendT = 0; }
    } else if ((this.breath -= dt / PUFF) <= 0) {
      this.breath = 0; this.winded = true; this.windT = WINDED; this.sendT = 0;
      this.tell({ k: "line", t: pickOf(Math.random, GASP), n: pickOf(Math.random, NEARLY) });
    }
    ch.flee(ring.i, ring.gen, (this.winded ? JOG : s.sprint) / this.runOf());
    this.wpT -= dt;
    if (!this.wp || this.wpT <= 0 || Math.hypot(this.wp.x - b.x, this.wp.z - b.z) < 6 || (near && Math.hypot(near.x - this.wp.x, near.z - this.wp.z) < Math.hypot(b.x - this.wp.x, b.z - this.wp.z))) {
      this.wp = this.away(b, near, nd);
      this.wpT = 5;
      ch.sendTo(ring.i, ring.gen, this.wp.x, this.wp.z, true);
    }
  }

  /** His own kind's running pace, which flee() goes by. */
  private runOf() { return [5.7, 6.3, 5.4, 5.4][this.d.crew.kind] ?? 5.7; }

  /** Further down the street, away from whoever's nearest. */
  private away(b: { x: number; z: number }, near: { x: number; z: number } | null, nd: number) {
    const s = streetSpot(this.w.map, b.x, b.z, 40, 110, 0.6, (x, z) => !near || Math.hypot(x - near.x, z - near.z) > nd + 15);
    if (s) return s;
    const ax = near ? b.x - near.x : 1, az = near ? b.z - near.z : 0, l = Math.hypot(ax, az) || 1;
    const c = clearSpot(this.w.map, b.x + (ax / l) * 60, b.z + (az / l) * 60, 20);
    return c ? { x: c[0], z: c[1] } : { x: b.x + (ax / l) * 40, z: b.z + (az / l) * 40 };
  }

  /** Everything the others need to draw the job, as the host sees it. */
  private state() {
    const r = Math.round, at = this.ring ? this.w.naughtyBoys.get(this.ring.i, this.ring.gen) : null, [sx, sz] = this.stopOf(this.h);
    return {
      h: this.h, i: this.ring?.i ?? -1, g: this.ring?.gen ?? 0, x: r(at?.x ?? sx), z: r(at?.z ?? sz),
      rn: this.running ? 1 : 0, br: r(this.breath * 100), wd: this.winded ? 1 : 0, gs: this.goes, by: this.by,
    };
  }

  private lookCrew() { return look(this.d.crew.kind, this.d.kit); }

  /** Host: him and his mates, at his stop. He never fights: he only runs. */
  private bring(sx: number, sz: number) {
    const ch = this.w.naughtyBoys, players = this.w.players(), at = clearSpot(this.w.map, sx, sz, 20) ?? [sx, sz];
    this.ring = ch.bring(at[0], at[1], this.lookCrew(), 1, players, HP, 0)[0] ?? null;
    if (!this.ring) return;
    ch.flee(this.ring.i, this.ring.gen, 1);
    ch.sendTo(this.ring.i, this.ring.gen, at[0], at[1]);
    this.mates = ch.bring(at[0], at[1], this.lookCrew(), this.scale().mates, players, undefined, 5);
    this.lastHp = HP; this.running = false; this.winded = false; this.breath = 1; this.wp = null;
    this.actT = 3; this.sendT = 0;
  }

  /** Host: him and his mates gone from sight. */
  private letGo() {
    const ch = this.w.naughtyBoys;
    if (this.ring) ch.flee(this.ring.i, this.ring.gen, 1, false);
    for (const c of [...(this.ring ? [this.ring] : []), ...this.mates]) ch.release(c.i, c.gen, true);
    this.ring = null; this.mates = []; this.running = false; this.winded = false; this.breath = 1;
    this.sendT = 0;
  }

  /** Host: someone's come too close, or had a go at him: he's off, and his mates go for whoever it was. */
  private bolt(near: { id: string; x: number; z: number } | null) {
    this.running = true; this.chaseT = 0; this.farT = 0; this.breath = 1; this.winded = false; this.wp = null;
    this.by = near?.id ?? "";
    if (near) for (const c of this.mates) this.w.naughtyBoys.setOn(c.i, c.gen, near.id, near.x, near.z);
    this.tell({ k: "line", t: pickOf(Math.random, BOLT) });
    this.sendT = 0;
  }

  /** Host: he's got away, to his next stop. The third time, he's gone for good. */
  private getAway() {
    this.letGo();
    this.goes++;
    if (this.goes >= GOES) { this.tell({ k: "away" }); return; }
    this.h = (this.h + 1) % this.d.haunts.length;
    this.tell({ k: "lost", ...this.state() });
  }

  /** Host: someone wants to cuff him. */
  private cuff(by: string) {
    const ring = this.ring, b = ring ? this.w.naughtyBoys.get(ring.i, ring.gen) : null, p = this.w.players().find((q) => q.id === by);
    if (!ring || !b || !p?.alive || Math.hypot(p.x - b.x, p.z - b.z) > CUFF + 1.5) return;
    this.w.naughtyBoys.surrender(ring.i, ring.gen);
    this.tell({ k: "got", by, x: Math.round(b.x), z: Math.round(b.z) });
  }

  // ---- what everyone hears -------------------------------------------------------------------

  /** Bronze for a one-star man caught, silver and gold for the two-star and three-star posters. */
  private grade(): Grade {
    const tier = Math.max(1, Math.min(3, this.offer.stars)) as 1 | 2 | 3;
    return { tier, best: { v: tier, text: `a ${tier}-star ringleader brought in` } };
  }

  private who(id: string, you = "You") { return id === this.w.selfId ? you : this.w.nameOf(id); }
  private feedWho(id: string) { return `${named(this.who(id), this.w.colourOf(id))}`; }

  /** The results card: how it ended, how long it took. A loss's goes up from quests.ts, with its Retry. */
  private results(won: boolean, by: string) {
    return {
      kind: "wanted" as const, label: `Wanted · ${this.d.title}`, title: won ? "Cuffed!" : "He got away", lead: clock((Date.now() - this.started) / 1000),
      medal: won ? "Caught" : "Escaped",
      lines: [won ? `${this.who(by)} cuffed him${this.goes ? ` after he'd got away ${this.goes === 1 ? "once" : "twice"}` : " first go"}` : "He slipped away for good"],
      stats: [{ k: "Goes left", v: `${GOES - this.goes}/${GOES}` }, { k: "Stars", v: "★".repeat(this.offer.stars) }],
      rewards: won ? [this.offer.reward] : [],
      colour: COLOUR,
    };
  }

  event(d: any, from: string) {
    if (this.done) return;
    const host = this.w.isHost;
    switch (d.k) {
      case "at": case "lost": {
        const was = this.running;
        this.h = (Number(d.h) || 0) % this.d.haunts.length;
        if (Number(d.i) >= 0) this.ring = { i: Number(d.i), gen: Number(d.g) }; else if (!host) this.ring = null;
        this.seen = { x: Number(d.x), z: Number(d.z) };
        this.running = !!d.rn;
        this.winded = !!d.wd;
        this.breath = Math.max(0, Math.min(1, (Number(d.br) || 0) / 100));
        this.goes = Math.max(this.goes, Number(d.gs) || 0);
        this.by = String(d.by ?? "");
        if (this.running !== was) this.markT = 0;
        if (d.k === "lost") {
          this.markT = 0;
          SFX.clunk();
          const left = GOES - this.goes;
          missionCall({ text: "He got away!", sub: `${left} ${left > 1 ? "goes" : "go"} left. He's off to ${this.haunt.label}: he's on your map`, colour: COLOUR });
          this.w.feed(`${named(this.d.title, COLOUR)} got away (${left} ${left > 1 ? "goes" : "go"} left)`);
        }
        break;
      }
      case "line": {
        const b = this.drawn();
        if (b && this.ring) this.w.naughtyBoys.hands(this.ring.i, this.ring.gen, 0, String(d.t ?? ""));
        if (d.n && this.by === this.w.selfId) this.w.toast(String(d.n));
        break;
      }
      case "act":
        if (this.ring) this.w.naughtyBoys.hands(this.ring.i, this.ring.gen, 0, this.haunt.act);
        break;
      case "cuff": if (host) this.cuff(from); break;
      case "got": {
        const x = Number(d.x), z = Number(d.z), by = String(d.by ?? from);
        if (this.ring) this.w.naughtyBoys.hands(this.ring.i, this.ring.gen, 2, "It's a fair cop.");
        this.done = { won: true, screen: true, text: `${this.who(by)} cuffed ${this.d.title}. Bounty collected!`, x, z, wear: ["deer"], grade: this.grade() };
        this.w.feed(`${this.feedWho(by)} cuffed ${named(this.d.title, COLOUR)}`);
        if (host) for (let k = 0; k <= this.offer.stars; k++) this.w.prize(x + 2.5 * Math.cos(k * 1.7), z + 2.5 * Math.sin(k * 1.7), k === 0);
        missionResult({ result: "won", ...this.results(true, by) });
        this.collect();
        break;
      }
      case "away":
        this.done = { won: false, text: `${this.d.title} got away`, title: "He got away", card: this.results(false, "") };
        break;
    }
  }

  private collect() {
    this.w.reward(this.d.ride);
    try { localStorage.setItem("cd-bounties", String((Number(localStorage.getItem("cd-bounties")) || 0) + 1)); } catch { /* ignore */ }
  }

  progress() { return this.state(); }
  restore(p: any) { if (p) this.event({ ...p, k: "at" }, ""); }

  boss() { return this.d.title; }

  card(): Card {
    const me = this.w.me(), at = this.where(), left = Math.max(0, Math.round(this.left));
    const goes = "●".repeat(GOES - this.goes) + "○".repeat(this.goes);
    const where = `${far(Math.hypot(at.x - me.x, at.z - me.z))} ${compassWord(at.x - me.x, at.z - me.z)}`;
    const line = !this.running ? `He's at <b>${esc(this.haunt.label)}</b>, ${where}. Get close and he'll run`
      : this.canCuff() ? "Got him! Cuff him ({use})"
      : this.winded ? `He's out of puff, ${where}! Get to him and cuff him ({use})`
      : `He's legged it, ${where}! Keep up till he's out of puff, then cuff him ({use})`;
    return {
      line,
      sub: `Goes left ${goes} · then ${esc(this.nextHaunt.label)} · poster: {job}`,
      bar: left / LIMIT,
      timer: clock(left) + " left",
      progress: goes,
      stage: this.running ? { key: `run${this.goes}`, title: "He's legged it!", sub: "Catch him and cuff him ({use})" } : undefined,
    };
  }

  end() {
    if (this.marked) this.w.mark("@wanted", null);
    if (this.ring && !this.done?.won) this.w.naughtyBoys.hands(this.ring.i, this.ring.gen, 0);
    if (this.w.isHost) {
      const ch = this.w.naughtyBoys;
      if (this.ring) { ch.flee(this.ring.i, this.ring.gen, 1, false); ch.release(this.ring.i, this.ring.gen, !this.done?.won && !this.running); }
      for (const c of this.mates) ch.release(c.i, c.gen);
    }
  }
}
