// Wanted: a ringleader with a silly made-up title, hiding out round Bath with his crew, and the
// crew look like him. The poster gives two things about how he looks (a hat, a coloured jacket, a
// bag, a dog, a limp) and his routine: a pub, then a park or some such, then a bus stop, round and
// round, but not where. Four men are dressed like him, more as the room gets bigger (a pair of
// friends adds one, up to eight), each with a different mix. The poster's two features fit him and
// one or two of the others; a third, which a witness will give you, tells him apart. One witness in
// three is wrong, and says so if you press them (E again).
//
// A search circle 300 m across goes on the map with him somewhere inside. Inside it are clues: a
// witness to talk to, or a leaflet he's dropped. Find one (E) and the circle shrinks and closes in on
// him, for everyone. Knocking out one of his lookouts counts as a clue too (a quirk: two lookouts,
// and one more for every three in the room, up to four). Then it's down to looking: through
// binoculars (B) from a roof or a hill you can see them all from 420 m, and the one who spots can call
// out who has what to a friend on the ground. Point at the man you think it is (E). Right, and
// everyone gets a marker on him and the one who found him gets a prize. Wrong, and it costs
// 15 seconds on the clock. That's how a group splits up: one up a roof with binoculars, one
// driving, one on foot.
//
// Shoot at him with nobody close and he may bolt (Slippery, below): then everyone gets a marker on
// him as he runs, and it waits at the stop he's run to till someone catches up with him.
//
// Put him down for the bounty. Or take him in for more: wear him down with someone close by and he
// gives up, hands in the air (and so does anyone else dressed like him who's wearing down). Cuff him
// (E) and he follows you to the police waiting at the nearest bus stop (or a police box), while his
// mates try to spring him. Cuff the wrong man and he complains, his solicitor is on the card, it
// costs 30 seconds, and the real one hears and moves on to his next stop. Get too far ahead, or get
// knocked down, and he slips off with his hands still up, for anyone to cuff again.
//
// At each stop he and the lads who look like him do something for a minute (a pint, feeding the
// ducks, waiting for a bus). Work out the stop from the poster and the circle, be there, and catch him
// without his ever having run for it, and that's an ambush: a bonus prize.
//
// The quirks, two to a poster:
// - Slippery: shoot at him with nobody close and he bolts to his next stop, so corner him first.
// - Lookouts: his crew posted round about; if one sees you first, he's phoned ahead and moves.
// - Mob-handed: never out without a big crew, and more turn up once it kicks off.
// And one hidden trait, which the first clue gives away: hard as nails (twice the health), stubborn
// (won't give up, so he'll have to be put down) or a bus pass (he rides between his stops, so he's
// there before you are).
//
// A Gaffer who got away from a pub takeover (invasion.ts) is a poster too, under his own name and
// with his pub on it: he's mode 1 (on foot), 2 (a scooter: slippery) or 3 (his van: a bus pass).
//
// Each bounty is short: six to eight minutes. Run out of time and he slips the net, but once only:
// the circle opens up again, wider, round his next stop, with a couple more minutes on the clock.
//
// Who decides what: the poster comes from the day's seed (quests.ts), so everyone has the same one,
// and so do the men's features, which ride on their look (naughtyboys.ts) so every screen draws the
// same. The host knows where he really is, runs him and his crew, places the clues and sizes the
// circle, and sends all of that round every second ("at", with who the lookalikes are, who has given
// up and the seconds lost). Finding a clue ("clue"), pressing a witness ("push"), pointing him out
// ("id") and cuffing a man ("cuff") are asked of the host, who says what came of it ("found", "words",
// "spot", "nope", "led", "wrong"). The host says when someone gives up ("give", "gv"), slips off
// ("slip"), is handed in ("in"), is put down ("down"), gets away for now ("again"), gets out of sight
// ("lost") or for good ("away").
import * as THREE from "three";
import * as SFX from "./audio";
import { FEAT_ARITY, MOUNTS, NAUGHTY, CRICKET, RUGBY, SOCIETY, look, withFeats } from "./naughtyboys";
import { RIDES, rideSpecs } from "./rides";
import { clearSpot, hauntsNear, streetSpot } from "./haunts";
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
type Quirk = "slippery" | "lookouts" | "mob";
type Hidden = "hard" | "stubborn" | "bus";
const QUIRK: Record<Quirk, string> = {
  slippery: "Slippery: shoot at him from afar and he bolts, so corner him first",
  lookouts: "Lookouts: if they see you first, someone phones ahead",
  mob: "Mob-handed: never out without a gang, and more turn up once it kicks off",
};
const HIDDEN: Record<Hidden, string> = {
  hard: "Hard as nails: twice the health",
  stubborn: "Stubborn: he'll never come quietly, so he'll have to be put down",
  bus: "Bus pass: he rides between his stops, so he's there before you",
};
/** What the first clue gives away: "Word is he's ..." */
const REVEAL: Record<Hidden, string> = {
  hard: "hard as nails: twice the health",
  stubborn: "stubborn: he'll never come quietly, so he'll have to be put down",
  bus: "got a bus pass: he rides between his stops",
};
// ---- the lookalikes ---------------------------------------------------------------------------------

/** What each feature (hat, jacket, bag, dog, limp: naughtyboys.ts) comes to in words, by its value. */
const FEAT_WORDS: string[][] = [
  ["no hat on", "a hat on"],
  ["no jacket on", "a red jacket on", "a green jacket on", "a mustard jacket on"],
  ["no bag", "a bag over his shoulder"],
  ["no dog with him", "a dog with him"],
  ["no limp at all", "a limp and a stick"],
];
const PEN_ID = 15;          // seconds off the clock for pointing out the wrong man
const PEN_CUFF = 30;        // and for cuffing him
const LOOKALIKES = 4;       // alone, this many are dressed like him; each pair of friends adds one, up to four more
const DWELL_EVERY = 12;     // seconds between the things he and his crew say while they're at a stop
const SOLICITORS = [
  "His solicitor is already on the phone: \"My client is a plumber from Twerton, and he would like that noted.\"",
  "A man in a pinstripe suit appears from nowhere: \"Mr Kettle is a retired dinner lady. We'll be writing to you.\"",
  "His solicitor, out of breath: \"He was only walking the dog. You'll hear from Halfpenny & Sons.\"",
  "\"This is harassment,\" says his solicitor, producing a card. \"He's in the Rotary Club.\"",
];

/**
 * The men who could be him, the same for every player from the poster's seed: him, and decoys. Two
 * features (pa, pb) go on the poster and fit him and one or two decoys; a third (wa) tells them apart.
 * No decoy has all three, and the first decoys are the same however many more a big room adds.
 */
function suspects(seed: number, n: number) {
  const r = rng(hash(seed, "look"));
  const [pa, pb, wa] = shuffled(r, [0, 1, 2, 3, 4]);
  const draw = () => {
    for (;;) { const v = FEAT_ARITY.map((a) => Math.floor(r() * a)); if (v.some(Boolean)) return v; }
  };
  const him = draw(), key = (v: number[]) => v.join(), used = new Set([key(him)]), decoys: number[][] = [];
  const other = () => (him[wa] + 1 + Math.floor(r() * (FEAT_ARITY[wa] - 1))) % FEAT_ARITY[wa];
  const lie = other();
  const twins = n >= 6 ? 2 : 1;
  for (let k = 0; k < twins; k++) {
    const v = draw();
    v[pa] = him[pa]; v[pb] = him[pb]; v[wa] = k ? other() : lie;
    if (v.some(Boolean) && !used.has(key(v))) { used.add(key(v)); decoys.push(v); }
  }
  for (let tries = 0; decoys.length < n - 1 && tries < 400; tries++) {
    const v = draw();
    if ((v[pa] === him[pa] && v[pb] === him[pb]) || used.has(key(v))) continue;
    used.add(key(v)); decoys.push(v);
  }
  return { him, decoys, pa, pb, wa, lie };
}

const MOVE_EVERY = 60;      // seconds at one stop before he moves on, if nobody's found him
const CIRCLE = 300;         // the search circle's radius to start with
const SHRINK = 0.55;        // each clue takes it down to this much
const SMALLEST = 60;        // but no smaller than this
const REOPEN = 450;         // and when he slips the net, it opens up this wide
const EXTRA = 150;          // with this many more seconds on the clock
const SPOT_NEAR = 40;       // close enough to make him out without binoculars
const SPOT_FAR = 260;       // and through binoculars or a scope
const SPOT_HIGH = 420;      // through binoculars from a roof or a hill, 10 m or more above him
const COLLAR = 25;          // he gives up rather than going down if someone's this close
const CUFF = 3;             // close enough to cuff him
const LOSE = 35;            // lead him from further than this and he slips off
const HANDED_IN = 6;        // close enough to the police to hand him in
const CORNERED = 10;        // slippery: someone this close and he can't bolt
const VANISH = 320;         // nobody this close to him and he's off out of sight, to turn up at his next stop
const COLOUR = "#e04848";
const POLICE = "#2f5fb8";

interface Haunt { n: string; x: number; z: number; cx: number; cz: number; bus: boolean; label: string; act: string }

/** The poster's details, from its seed. */
function details(o: Offer, w: QuestWorld) {
  const r = rng(o.seed);
  // a Gaffer who got away (mode 1 on foot, 2 on a scooter, 3 in his van) keeps his own name and crew, and his getaway shows in how he plays
  const how = o.mode ?? 0;
  let title = pickOf(r, TITLES), crew = CREWS[Math.floor(r() * CREWS.length)];
  const kit = Math.floor(r() * 4);
  let quirks = shuffled(r, Object.keys(QUIRK) as Quirk[]).slice(0, 2);
  let hidden = pickOf(r, Object.keys(HIDDEN) as Hidden[]);
  if (how) {
    title = o.title.replace(/^Wanted: /, ""); crew = CREWS[3];
    if (how === 2 && !quirks.includes("slippery")) quirks = ["slippery", quirks[0]];
    if (how === 3) hidden = "bus";
  }
  const haunts = hauntsFor(o, w, r);
  const ride = pickOf(r, RIDES.filter((k) => k !== "trolley"));
  return { title, crew, kit, quirks, hidden, haunts, ride, seed: o.seed };
}

/**
 * His routine: a pub 400 m to 1.3 km from the noticeboard, then a park or square near that, then a
 * bus stop by somewhere else near that (the stop itself is found when he gets there, as the stops
 * are only known round where people are). Each stop has the search circle's first middle.
 */
function hauntsFor(o: Offer, w: QuestWorld, r: Rng): Haunt[] {
  const ok = (x: number, z: number) => w.map.fieldEdge(x, z) > 120;
  const sort = <T extends { x: number; z: number; n: string }>(a: T[]) => a.sort((p, q) => p.x - q.x || p.z - q.z || p.n.localeCompare(q.n));
  const pubs = sort(w.pubs().map((p) => ({ n: p.name, x: p.x, z: p.z })).filter((p) => ok(p.x, p.z)));
  const places = sort(w.places().filter((p) => ok(p.x, p.z)));
  const out: Haunt[] = [];
  const choose = (first: typeof pubs, second: typeof pubs, from: { x: number; z: number }, near: number, farOut: number, bus: boolean) => {
    for (const pool of [first, second]) {
      for (const p of shuffled(r, pool)) {
        const d = Math.hypot(p.x - from.x, p.z - from.z);
        if (d < near || d > farOut || out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 350 || q.n === p.n)) continue;
        // the circle isn't centred on him: he's somewhere inside it
        const a = r() * Math.PI * 2, off = r() * CIRCLE * 0.5;
        const pub = pubs.includes(p);
        out.push({ ...p, cx: p.x + Math.cos(a) * off, cz: p.z + Math.sin(a) * off, bus,
          label: bus ? "a bus stop" : pub ? "a pub" : "a park or square", act: bus ? "Where's that bus got to?" : pub ? "Cheers! Same again." : "Here, duck duck duck..." });
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
  goal: (o) => `Find ${o.title.replace(/^Wanted: /, "")}, catch him and hand him in before time runs out`,
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
    describe(o, d, `The Flag Lads' Gaffer, last seen leaving <b>${esc(f.pub)}</b> in a hurry ${MOUNTS[f.how] ?? ""}. `);
    return o;
  },
  start: (o, w, started) => new Wanted(o, w, started),
});

const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

/** What the poster says, and what he's worth. */
function describe(o: Offer, d: ReturnType<typeof details>, lead = "") {
  const s = suspects(o.seed, LOOKALIKES);
  o.blurb = `${lead}Runs with ${esc(d.crew.who)}, and a few of them dress like him. He's got <b>${FEAT_WORDS[s.pa][s.him[s.pa]]}</b> and <b>${FEAT_WORDS[s.pb][s.him[s.pb]]}</b>. `
    + `A witness will tell you one more thing, but not all of them are right. Does the rounds of <b>${d.haunts.map((h) => esc(h.label)).join("</b>, then <b>")}</b>, and stops a minute at each.`
    + `<br>${d.quirks.map((q) => QUIRK[q]).join("<br>")}<br>And one more thing nobody's sure of: find a clue.`;
  o.reward = `${o.stars} prize${o.stars > 1 ? "s" : ""} and ${rideSpecs[d.ride].name}; take him in alive for ${o.stars + 1} more`;
}

// ---- the clues and the police, as drawn ---------------------------------------------------------

const lambert = (c: string) => new THREE.MeshLambertMaterial({ color: c });
let kit: Record<string, THREE.BufferGeometry | THREE.Material> | null = null;
/** Shared by every clue and police box: made once, never thrown away. */
function parts() {
  return kit ??= {
    beam: new THREE.CylinderGeometry(0.3, 0.3, 6, 10, 1, true).translate(0, 3, 0),
    glow: new THREE.MeshBasicMaterial({ color: COLOUR, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    sheet: new THREE.PlaneGeometry(0.3, 0.42).rotateX(-Math.PI / 2),
    paper: lambert("#f4f1e6"),
    band: new THREE.PlaneGeometry(0.3, 0.1).rotateX(-Math.PI / 2),
    red: lambert(COLOUR),
    coat: new THREE.CylinderGeometry(0.2, 0.26, 1.3, 10).translate(0, 0.65, 0),
    mac: lambert("#a08a5a"),
    head: new THREE.SphereGeometry(0.15, 12, 8).translate(0, 1.47, 0),
    skin: lambert("#e6bd9f"),
    box: new THREE.BoxGeometry(1.2, 2.4, 1.2).translate(0, 1.2, 0),
    blue: lambert(POLICE),
    lamp: new THREE.SphereGeometry(0.13, 10, 8).translate(0, 2.55, 0),
    light: new THREE.MeshBasicMaterial({ color: "#fff6c0", toneMapped: false }),
  };
}
const mesh = (g: string, m: string, rotY = 0) => {
  const p = parts(), o = new THREE.Mesh(p[g] as THREE.BufferGeometry, p[m] as THREE.Material);
  o.rotation.y = rotY;
  return o;
};
/** A clue: a leaflet on the ground (0) or a witness in a mac (1), under a faint red beam. */
function clueModel(t: number) {
  const g = new THREE.Group(), beam = mesh("beam", "glow");
  beam.name = "beam";
  if (t === 0) { const b = mesh("band", "red"); b.position.set(0, 0.035, -0.16); const s = mesh("sheet", "paper"); s.position.y = 0.03; g.add(s, b); }
  else g.add(mesh("coat", "mac"), mesh("head", "skin"));
  g.add(beam);
  return g;
}
/** The police waiting for him: a blue police box with its lamp on. */
function policeModel() {
  const g = new THREE.Group();
  g.add(mesh("box", "blue"), mesh("lamp", "light"));
  return g;
}

const LEAFLETS = [
  "a leaflet for his Grand Raffle, tickets from round the corner",
  "a flyer for a Rumpus Night, everyone welcome, bring a mate",
  "a crumpled note: 'meet me by the bins, usual time'",
  "a fan club leaflet with his face on, still warm",
];
const WITNESSES = [
  "He had {feat}, I'm sure. Went {way} not two minutes since.",
  "You can't miss him, love: {feat}. Off {way}, he was.",
  "Pushed right past me, he did. {Feat}, heading {way}.",
  "I'm not one to gossip, but {feat}, going {way}.",
];
const SWEAR = ["Honest, I'd swear to it.", "I know what I saw.", "Cross my heart."];
const BACKPEDAL = ["Well... or was that the other day? Don't quote me.", "Now you say it, that might have been someone else.", "Er. Possibly. I do get them muddled."];

class Wanted implements Job {
  done: Job["done"] = null;
  private d: ReturnType<typeof details>;
  private h = 0;                       // which stop he's at, or on his way to
  private spotted = false;
  private ring: { i: number; gen: number } | null = null;
  private lookouts: { i: number; gen: number }[] = [];
  private seen: { x: number; z: number } | null = null;     // where he really is, as the host last said
  private zone: { x: number; z: number; r: number };
  private clues: { n: number; x: number; z: number; t: number; q: number }[] = [];   // q: a witness who's been asked (1) and pressed (2)
  private crew: { i: number; gen: number }[] = [];                  // the lookalikes (and any mates who turn up), as the host says
  private aim: { i: number; gen: number } | null = null;            // the lookalike you're looking at, close enough to point out
  private aimT = 0;
  private eyeO = new THREE.Vector3(); private eyeD = new THREE.Vector3();
  private meek = new Set<number>();                                 // lookalikes with their hands up
  private pen = 0;                                                  // seconds off the clock for pointing at or cuffing the wrong man
  private complaint: { text: string; until: number } | null = null;
  private views = new Map<number, { view: THREE.Group; x: number; z: number }>();
  private found = 0;                   // clues found so far: the first gives away his hidden trait
  private gaveUp = false;
  private led: { by: string; x: number; z: number; n: string } | null = null;
  private police: THREE.Group | null = null;
  private again = false;               // he's slipped the net once already
  private running = false;             // he's bolted: everyone gets a marker on him till someone catches up
  private marked = false;
  private limit: number;
  // host only
  private clueN = 0; private clueT = 0;
  private stops = new Map<number, [number, number]>();
  private movedT = 0; private bolts = 0; private lastHp = Infinity;
  private warned = false; private mobbed = false; private rewarded = false;
  private clean = true;                // host: he's never had to run for it, so catching him is an ambush
  private crewT = 0; private actT = DWELL_EVERY; private gave = new Set<number>();
  private sendT = 0; private markT = 0; private beamT = 0;

  constructor(readonly offer: Offer, private w: QuestWorld, private started: number) {
    this.d = details(offer, w);
    this.limit = (5 + offer.stars) * 60;
    const h = this.d.haunts[0];
    this.zone = { x: h.cx, z: h.cz, r: CIRCLE };
    this.circle();
  }

  private has(q: Quirk) { return this.d.quirks.includes(q); }
  private get left() { return this.limit + (this.again ? EXTRA : 0) - (Date.now() - this.started) / 1000 - this.pen; }
  private get haunt() { return this.d.haunts[this.h % this.d.haunts.length]; }

  /** The search circle, while nobody's eyes are on him and he's not on the run. */
  private circle() {
    this.w.circle("wanted", this.spotted || this.gaveUp || this.running ? null : { ...this.zone, colour: COLOUR });
  }

  // ---- everyone -------------------------------------------------------------------------------

  update(dt: number) {
    if (this.done) return;
    const me = this.w.me();
    // who you're looking at: close up, or through binoculars or down the sights from further. He's
    // only pointed out when you say so (E), as every one of his crew who's dressed like him could be
    if (!this.spotted && (this.aimT -= dt) <= 0) { this.aimT = 0.2; this.aim = me.alive ? this.aimed() : null; }
    else if (this.spotted) this.aim = null;
    const b = this.ring ? this.w.naughtyBoys.at(this.ring.i) : null;
    const here = b?.alive && b.gen === this.ring!.gen ? b : null;
    // the marker follows him, a second at a time (moving it rebuilds it); on the run, it follows
    // him out of sight and waits at the stop he's run to, till someone catches up with him
    const marking = this.spotted || this.gaveUp || this.running;
    if (marking && (this.markT -= dt) <= 0) {
      this.markT = 1;
      const at = here ?? this.seen;
      if (at) { this.w.mark("@wanted", { x: at.x, z: at.z }, this.running && !this.spotted ? `${this.d.title} (on the run)` : this.d.title, COLOUR); this.marked = true; }
    } else if (!marking && this.marked) { this.w.mark("@wanted", null); this.marked = false; }
    // the clues near you, drawn; and the police waiting for him
    const keep = new Set<number>();
    for (const c of this.spotted || this.gaveUp ? [] : this.clues) {
      if (Math.hypot(c.x - me.x, c.z - me.z) > 260 || !this.w.map.detailedAt(c.x, c.z)) continue;
      keep.add(c.n);
      if (!this.views.has(c.n)) {
        const p = clearSpot(this.w.map, c.x, c.z, 12) ?? [c.x, c.z];
        const view = clueModel(c.t);
        view.position.set(p[0], this.w.map.ground(p[0], p[1]), p[1]);
        view.rotation.y = c.n;
        this.w.scene.add(view);
        this.views.set(c.n, { view, x: p[0], z: p[1] });
      }
    }
    for (const [n, v] of this.views) if (!keep.has(n)) { this.w.scene.remove(v.view); this.views.delete(n); }
    if (this.views.size && (this.beamT += dt) > 0.1) {
      (parts().glow as THREE.MeshBasicMaterial).opacity = 0.22 + 0.12 * Math.sin(performance.now() / 260);
      this.beamT = 0;
    }
    if (this.led && !this.police && this.w.map.detailedAt(this.led.x, this.led.z)) {
      this.police = policeModel();
      this.police.position.set(this.led.x, this.w.map.ground(this.led.x, this.led.z), this.led.z);
      this.w.scene.add(this.police);
    } else if (!this.led && this.police) { this.w.scene.remove(this.police); this.police = null; }
  }

  /** The clue you're stood at, if any. */
  private clueHere() {
    const me = this.w.me();
    for (const [n, v] of this.views) if (Math.hypot(v.x - me.x, v.z - me.z) < 3) return this.clues.find((c) => c.n === n);
    return undefined;
  }
  /** Whoever's given up near enough to cuff: him, or one of the men dressed like him. */
  private canCuff(): { i: number; gen: number } | null {
    if (this.led) return null;
    const me = this.w.me();
    if (!me.alive) return null;
    const near = (g: { i: number; gen: number } | null) => {
      const b = g ? this.w.naughtyBoys.at(g.i) : null;
      return !!g && !!b?.alive && b.gen === g.gen && Math.hypot(b.x - me.x, b.z - me.z) < CUFF;
    };
    if (this.gaveUp && this.ring && near(this.ring)) return this.ring;
    return this.crew.find((c) => this.meek.has(c.i) && near(c)) ?? null;
  }

  /** The man in your sights, if he's one of the ones who could be him. */
  private aimed(): { i: number; gen: number } | null {
    const eye = this.w.look(), ch = this.w.naughtyBoys;
    this.eyeO.set(eye.x, eye.y, eye.z); this.eyeD.set(eye.dx, eye.dy, eye.dz);
    const h = ch.hit(this.eyeO, this.eyeD, eye.zoomed ? SPOT_HIGH : SPOT_NEAR);
    if (!h || !this.suspect(h.i, h.gen)) return null;
    const at = ch.at(h.i);
    if (!at || h.dist > (!eye.zoomed ? SPOT_NEAR : eye.y - at.y > 10 ? SPOT_HIGH : SPOT_FAR)) return null;
    const hit = this.w.map.raycast(eye.x, eye.y, eye.z, eye.dx, eye.dy, eye.dz, h.dist);
    return hit && hit.dist < h.dist - 1 ? null : { i: h.i, gen: h.gen };
  }

  private suspect(i: number, gen: number) {
    return (this.ring?.i === i && this.ring.gen === gen) || this.crew.some((c) => c.i === i && c.gen === gen);
  }

  hint() {
    if (this.canCuff()) return "<b>E</b> Cuff him";
    const c = this.clueHere();
    if (c && c.q < 2) return c.t === 0 ? "<b>E</b> Pick up the leaflet" : c.q === 0 ? "<b>E</b> Ask the witness" : "<b>E</b> Press the witness: are they sure?";
    return this.aim && !this.spotted ? "<b>E</b> That's him!" : "";
  }

  use() {
    if (this.done) return false;
    const cuff = this.canCuff();
    if (cuff) { this.ask({ k: "cuff", i: cuff.i, g: cuff.gen }); return true; }
    const c = this.clueHere();
    if (c && c.t === 1 && c.q === 1) { this.ask({ k: "push", n: c.n }); return true; }
    if (c && c.q === 0) { this.ask({ k: "clue", n: c.n }); return true; }
    if (!this.aim || this.spotted) return false;
    this.ask({ k: "id", i: this.aim.i, g: this.aim.gen });
    return true;
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

  /** Host: where he really hangs about at stop h. A bus stop is found once the streets there are in. */
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

  host(dt: number) {
    if (this.done) return;
    const ch = this.w.naughtyBoys, players = this.w.players(), alive = players.filter((p) => p.alive);
    if (this.left <= 0 && !this.led) { if (this.again) this.tell({ k: "away" }); else this.slipNet(); return; }
    const [sx, sz] = this.stopOf(this.h);
    const b = this.ring ? ch.get(this.ring.i, this.ring.gen) : null;
    if (!this.ring) {
      // he turns up when someone's near his stop; otherwise he does his rounds unseen
      if (alive.some((p) => Math.hypot(p.x - sx, p.z - sz) < 250)) this.bring();
      else if ((this.movedT += dt) > MOVE_EVERY) this.move(false);
    } else if (!b) {
      // gone: put down (that's naughty boyDown) or let go
      this.ring = null; this.crew = []; this.lookouts = []; this.gaveUp = false; this.led = null;
    } else if (!this.gaveUp && !alive.some((p) => Math.hypot(p.x - b.x, p.z - b.z) < VANISH)) {
      // nobody near: off out of sight, to turn up at his stop when someone comes by
      this.letGo(true);
    } else if (this.gaveUp) {
      this.escort(b, players);
    } else {
      // with someone close enough to collar him, he'd rather give up than go down
      ch.spare(this.ring.i, this.ring.gen, this.d.hidden !== "stubborn" && alive.some((p) => Math.hypot(p.x - b.x, p.z - b.z) < COLLAR));
      if (b.meek) {
        this.tell({ k: "give" });
      } else {
        const hurt = Number.isFinite(this.lastHp) && b.hp < this.lastHp;
        this.lastHp = b.hp;
        // one thing at a time: slippery, he bolts when shot at with nobody close enough to corner him
        // (twice at most); mob-handed, more of his mates turn up once someone's having a go; a lookout
        // who sees you first phones ahead; and if nobody's found him, he moves on to his next stop
        if (this.has("slippery") && hurt && this.bolts < 2 && !alive.some((p) => Math.hypot(p.x - b.x, p.z - b.z) < CORNERED)) {
          this.bolts++; this.clean = false; this.running = true; this.move(true); this.say("He's bolted! He's on the map: after him, and corner him before you shoot");
        } else if (this.has("mob") && !this.mobbed && (hurt || b.target)) {
          this.mobbed = true; this.clean = false;
          const at = clearSpot(this.w.map, b.x + 25, b.z, 10) ?? [b.x, b.z];
          this.crew.push(...ch.bring(at[0], at[1], this.lookCrew(), 2 + this.offer.stars, players, undefined, 5));
          this.say("His mates have turned up!");
        } else if (!this.spotted && !this.warned && this.lookouts.some((l) => ch.get(l.i, l.gen)?.target)) {
          this.warned = true; this.clean = false; this.move(true); this.say("A lookout's phoned ahead! He's on the move");
        } else if (!this.spotted && !b.target && (this.movedT += dt) > MOVE_EVERY) this.move(false);
      }
    }
    if (this.ring && b && !this.gaveUp && !this.led) {
      // every one of them is ready to give up when he's hurt and someone's close, as he is
      if ((this.crewT -= dt) <= 0) {
        this.crewT = 0.5;
        for (const c of this.crew) {
          const m = ch.get(c.i, c.gen);
          if (!m) continue;
          ch.spare(c.i, c.gen, alive.some((p) => Math.hypot(p.x - m.x, p.z - m.z) < COLLAR));
          if (m.meek && !this.gave.has(c.i)) { this.gave.add(c.i); this.tell({ k: "gv", i: c.i, g: c.gen }); }
        }
      }
      // at his stop he and the lads who look like him get on with whatever he does there
      if (!b.target && !this.running && (this.actT -= dt) <= 0) { this.actT = DWELL_EVERY; this.tell({ k: "act" }); }
    }
    // the clues: two at a time inside the circle, round where he really is
    const real = b ?? { x: sx, z: sz };
    // on the run till someone catches up with him (or he gives up)
    if (this.running && (this.gaveUp || alive.some((p) => Math.hypot(p.x - real.x, p.z - real.z) < SPOT_NEAR))) this.running = false;
    this.clues = this.clues.filter((c) => Math.hypot(c.x - this.zone.x, c.z - this.zone.z) < this.zone.r);
    if (!this.spotted && !this.gaveUp && this.clues.length < 2 && (this.clueT -= dt) <= 0) {
      this.clueT = 1;
      this.placeClue(real.x, real.z);
    }
    if ((this.sendT -= dt) <= 0) {
      this.sendT = 1;
      this.tell({ k: "at", ...this.state(real) });
    }
  }

  /** Everything the others need to draw the job, as the host sees it. */
  private state(real = this.seen ?? { x: this.haunt.x, z: this.haunt.z }) {
    const r = Math.round;
    return {
      h: this.h, i: this.ring?.i ?? -1, g: this.ring?.gen ?? 0, x: r(real.x), z: r(real.z),
      zn: [r(this.zone.x), r(this.zone.z), r(this.zone.r)], cl: this.clues.map((c) => [c.n, r(c.x), r(c.z), c.t, c.q]),
      cw: this.crew.map((c) => [c.i, c.gen]), mk: [...this.gave], pn: this.pen,
      f: this.found, gu: this.gaveUp ? 1 : 0, ld: this.led ? [this.led.by, r(this.led.x), r(this.led.z), this.led.n] : 0, ag: this.again ? 1 : 0,
      rn: this.running ? 1 : 0,
    };
  }

  /** Host: a clue somewhere inside the circle, part way from its middle to him. */
  private placeClue(x: number, z: number) {
    const Z = this.zone, a = Math.random() * Math.PI * 2, d = Z.r * (0.25 + Math.random() * 0.45);
    let tx = x + Math.cos(a) * d, tz = z + Math.sin(a) * d;
    const off = Math.hypot(tx - Z.x, tz - Z.z);
    if (off > Z.r * 0.85) { tx = Z.x + ((tx - Z.x) * Z.r * 0.85) / off; tz = Z.z + ((tz - Z.z) * Z.r * 0.85) / off; }
    const s = streetSpot(this.w.map, tx, tz, 0, 40, 0.5);
    const p = s ? [s.x, s.z] : clearSpot(this.w.map, tx, tz, 15) ?? [tx, tz];
    this.clues.push({ n: ++this.clueN, x: p[0], z: p[1], t: Math.random() < 0.5 ? 0 : 1, q: 0 });
  }

  /** Host: a clue found (n), or a lookout knocked out (n = -1): the circle shrinks onto him. */
  private clueFound(n: number, by: string) {
    const c = this.clues.find((q) => q.n === n);
    if (n >= 0 && (!c || c.q > 0)) return;
    // and some of the others go cold; a witness stays put, in case you want to press them
    this.clues = this.clues.filter((q) => (q.n === n ? q.t === 1 : Math.random() < 0.5));
    if (c?.t === 1) c.q = 1;
    const real = this.seen ?? { x: this.haunt.x, z: this.haunt.z }, b = this.ring ? this.w.naughtyBoys.get(this.ring.i, this.ring.gen) : null;
    const at = b ?? real, r = Math.max(SMALLEST, this.zone.r * SHRINK), a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.6;
    this.zone = { x: at.x + Math.cos(a) * d, z: at.z + Math.sin(a) * d, r };
    const way = c ? compassWord(at.x - c.x, at.z - c.z) : "";
    const text = n < 0 ? "they knocked out a lookout, who's given him up"
      : c!.t === 0 ? `they found ${pickOf(Math.random, LEAFLETS)}`
      : `a witness said: "${pickOf(Math.random, WITNESSES).replace("{feat}", this.said(n)).replace("{Feat}", cap(this.said(n))).replace("{way}", way)}"`;
    this.clueT = 2;
    this.tell({ k: "found", by, t: text, f: this.found + 1 });
    this.sendT = 0;
  }

  /** One witness in three is wrong, and which is settled by the clue's number, so the host can say again when pressed. */
  private wrong(n: number) { return hash(this.offer.seed, "witness", n) % 3 === 0; }

  /** What witness n says about the third feature: the truth, or what his twin on the poster has. */
  private said(n: number) {
    const s = suspects(this.offer.seed, LOOKALIKES);
    return FEAT_WORDS[s.wa][this.wrong(n) ? s.lie : s.him[s.wa]];
  }

  /** Host: someone presses a witness: is he sure? */
  private press(n: number, by: string) {
    const c = this.clues.find((q) => q.n === n);
    if (!c || c.t !== 1 || c.q !== 1) return;
    c.q = 2;
    this.tell({ k: "words", by, t: pickOf(Math.random, this.wrong(n) ? BACKPEDAL : SWEAR), w: this.wrong(n) ? 1 : 0 });
    this.sendT = 0;
  }

  /** Host: someone says this is him. */
  private identify(by: string, i: number, gen: number) {
    if (this.spotted || !this.suspect(i, gen)) return;
    if (this.ring && i === this.ring.i && gen === this.ring.gen) { this.tell({ k: "spot", by }); return; }
    this.pen += PEN_ID;
    this.tell({ k: "nope", by, pn: this.pen });
  }

  private lookCrew() { return look(this.d.crew.kind, this.d.kit); }
  private hpOf() {
    const base = [60, 85, 55, 50][this.d.crew.kind] ?? 60;
    return Math.round(base * (3 + 2 * this.offer.stars) * (this.d.hidden === "hard" ? 2 : 1));
  }

  /** Host: him and his crew, at his stop. */
  private bring() {
    const [sx, sz] = this.stopOf(this.h), ch = this.w.naughtyBoys, players = this.w.players();
    const at = clearSpot(this.w.map, sx, sz, 20) ?? [sx, sz];
    // him among the men dressed like him: more of them the more of you there are (a big room has more to
    // look at and more to say about it, but no tougher lads), and more lookouts as well
    const room = players.length, want = LOOKALIKES + Math.min(4, Math.floor(room / 2)), dressed = (f: number[]) => withFeats(this.lookCrew(), f);
    const s = suspects(this.offer.seed, want);
    this.ring = ch.bring(at[0], at[1], dressed(s.him), 1, players, this.hpOf(), 0)[0] ?? null;
    this.crew = s.decoys.flatMap((f) => ch.bring(at[0], at[1], dressed(f), 1, players, undefined, 6));
    if (this.has("mob")) this.crew.push(...ch.bring(at[0], at[1], this.lookCrew(), 2, players, undefined, 6));
    if (this.has("lookouts")) {
      this.lookouts = Array.from({ length: Math.min(4, 2 + Math.floor((room - 1) / 3)) }, (_, k) => k).flatMap((k) => {
        const a = (k * Math.PI * 2) / Math.min(4, 2 + Math.floor((room - 1) / 3)) + Math.random(), p = clearSpot(this.w.map, at[0] + Math.cos(a) * 50, at[1] + Math.sin(a) * 50, 15);
        return p ? ch.bring(p[0], p[1], this.lookCrew(), 1, players) : [];
      });
    }
    this.movedT = 0; this.lastHp = Infinity; this.warned = false; this.gaveUp = false; this.led = null;
    this.gave.clear(); this.actT = 3;
    this.sendT = 0;
  }

  /** Host: him and his crew gone from sight (now: straight away). */
  private letGo(now: boolean, quiet = false) {
    const ch = this.w.naughtyBoys;
    for (const c of [...(this.ring ? [this.ring] : []), ...this.crew, ...this.lookouts]) ch.release(c.i, c.gen, now);
    this.ring = null; this.crew = []; this.lookouts = [];
    if (this.spotted && !quiet) this.tell({ k: "lost" });
  }

  /** Host: on to his next stop. rush: running for it. */
  private move(rush: boolean) {
    this.h = (this.h + 1) % this.d.haunts.length;
    this.movedT = 0;
    const [sx, sz] = this.stopOf(this.h), ch = this.w.naughtyBoys;
    if (this.ring && this.d.hidden === "bus") this.letGo(true);   // he hops on a bus: gone, till someone's at his next stop
    if (this.ring) {
      ch.sendTo(this.ring.i, this.ring.gen, sx, sz, rush);
      for (const c of this.crew) ch.sendTo(c.i, c.gen, sx + (Math.random() - 0.5) * 8, sz + (Math.random() - 0.5) * 8, rush);
      for (const c of this.lookouts) ch.release(c.i, c.gen);
      this.lookouts = [];
    }
    if (!this.spotted) {
      const a = Math.random() * Math.PI * 2, r = Math.max(this.zone.r, 200), d = Math.random() * r * 0.5;
      this.zone = { x: sx + Math.cos(a) * d, z: sz + Math.sin(a) * d, r };
      this.clues = [];
    }
    this.sendT = 0;
  }

  /** Host: time's up the first time. He slips the net, and the circle opens up wider round his next stop. */
  private slipNet() {
    this.letGo(true, true);
    this.again = true;
    this.h = (this.h + 1) % this.d.haunts.length;
    const [sx, sz] = this.stopOf(this.h), a = Math.random() * Math.PI * 2, d = Math.random() * REOPEN * 0.5;
    this.zone = { x: sx + Math.cos(a) * d, z: sz + Math.sin(a) * d, r: REOPEN };
    this.clues = []; this.gaveUp = false; this.led = null; this.movedT = 0; this.running = false;
    this.tell({ k: "again", ...this.state({ x: sx, z: sz }) });
  }

  /** Host: he's given up. Cuffed, he follows whoever cuffed him to the police. */
  private escort(b: { x: number; z: number }, players: ReturnType<QuestWorld["players"]>) {
    const ch = this.w.naughtyBoys, ring = this.ring!;
    if (!this.led) { ch.sendTo(ring.i, ring.gen, b.x, b.z); return; }
    const p = players.find((q) => q.id === this.led!.by);
    const d = p ? Math.hypot(p.x - b.x, p.z - b.z) : Infinity;
    if (!p || !p.alive || d > LOSE) {
      this.led = null;
      ch.sendTo(ring.i, ring.gen, b.x, b.z);
      this.tell({ k: "slip" });
      return;
    }
    if (Math.hypot(this.led.x - b.x, this.led.z - b.z) < HANDED_IN) { this.tell({ k: "in", by: this.led.by, x: Math.round(this.led.x), z: Math.round(this.led.z), cl: this.clean ? 1 : 0 }); return; }
    // a pace or two behind you
    if (d > 2.5) ch.sendTo(ring.i, ring.gen, p.x + ((b.x - p.x) / d) * 1.8, p.z + ((b.z - p.z) / d) * 1.8, true);
  }

  /** Host: someone wants to cuff a man who's given up: him, or one of the ones who look like him. */
  private cuff(by: string, i: number, gen: number) {
    const ch = this.w.naughtyBoys, p = this.w.players().find((q) => q.id === by);
    if (!p || this.led) return;
    if (this.ring && i === this.ring.i && gen === this.ring.gen) { this.cuffHim(by); return; }
    const m = this.crew.some((c) => c.i === i && c.gen === gen) ? ch.get(i, gen) : null;
    if (!m?.meek || Math.hypot(p.x - m.x, p.z - m.z) > CUFF + 2) return;
    // the wrong man: he complains, his solicitor turns up, and the real one hears and moves on
    this.pen += PEN_CUFF;
    this.crew = this.crew.filter((c) => c.i !== i);
    this.tell({ k: "wrong", by, i, g: gen, pn: this.pen, t: pickOf(Math.random, SOLICITORS) });
    const l = Math.hypot(m.x - p.x, m.z - p.z) || 1;
    ch.sendTo(i, gen, m.x + ((m.x - p.x) / l) * 60, m.z + ((m.z - p.z) / l) * 60, true);
    ch.release(i, gen);
    this.clean = false;
    this.letGo(true);
    this.move(false);
  }

  /** Host: he's given up and someone cuffs him. The police wait at the nearest bus stop, or a police box. */
  private cuffHim(by: string) {
    const b = this.ring ? this.w.naughtyBoys.get(this.ring.i, this.ring.gen) : null, p = this.w.players().find((q) => q.id === by);
    if (!b || !p || !this.gaveUp || this.led || Math.hypot(p.x - b.x, p.z - b.z) > CUFF + 2) return;
    const stop = hauntsNear(this.w.map, b.x, b.z, 500).filter((s) => s.kind === "bus" && Math.hypot(s.x - b.x, s.z - b.z) > 60)
      .sort((s, t) => Math.hypot(s.x - b.x, s.z - b.z) - Math.hypot(t.x - b.x, t.z - b.z))[0];
    let to: { x: number; z: number; n: string };
    if (stop) to = { x: stop.x, z: stop.z, n: stop.name ? `the bus stop at ${stop.name}` : "the bus stop" };
    else { const s = streetSpot(this.w.map, b.x, b.z, 120, 300, 1) ?? { x: b.x + 150, z: b.z }; to = { ...s, n: "the police box" }; }
    this.tell({ k: "led", by, x: Math.round(to.x), z: Math.round(to.z), n: to.n });
    // his mates come to spring him
    const ch = this.w.naughtyBoys, players = this.w.players();
    for (const c of this.crew) ch.setOn(c.i, c.gen, by, p.x, p.z);
    if (this.has("mob")) {
      const a = Math.random() * Math.PI * 2, at = clearSpot(this.w.map, b.x + Math.cos(a) * 45, b.z + Math.sin(a) * 45, 12);
      if (at) for (const c of ch.bring(at[0], at[1], this.lookCrew(), 1 + this.offer.stars, players, undefined, 4)) { this.crew.push(c); ch.setOn(c.i, c.gen, by, p.x, p.z); }
    }
    this.say("His mates are coming to spring him!");
  }

  private say(text: string) { this.tell({ k: "say", t: text }); }

  naughtyBoyDown(i: number, by: string) {
    if (this.done) return;
    if (this.lookouts.some((l) => l.i === i)) {
      this.lookouts = this.lookouts.filter((l) => l.i !== i);
      if (!this.spotted && !this.gaveUp) this.clueFound(-1, by);
      return;
    }
    if (!this.ring || i !== this.ring.i) return;
    const at = this.w.naughtyBoys.at(i);
    this.tell({ k: "down", by, x: Math.round(at?.x ?? 0), z: Math.round(at?.z ?? 0), cl: this.clean ? 1 : 0 });
  }

  // ---- what everyone hears -------------------------------------------------------------------

  /** Who did it, for the feed and toasts. */
  /** Bronze for a ringleader brought in, silver and gold for the two-star and three-star posters. */
  private grade(): Grade {
    const tier = Math.max(1, Math.min(3, this.offer.stars)) as 1 | 2 | 3;
    return { tier, best: { v: tier, text: `a ${tier}-star ringleader brought in` } };
  }

  private who(id: string, you = "You") { return id === this.w.selfId ? you : this.w.nameOf(id); }
  private feedWho(id: string) { return `<b style="color:${this.w.colourOf(id)}">${esc(this.who(id))}</b>`; }

  /** His hands, as they should be just now. */
  private hands(say = "") {
    if (this.ring) this.w.naughtyBoys.hands(this.ring.i, this.ring.gen, this.led ? 2 : this.gaveUp ? 1 : 0, say);
  }

  event(d: any, from: string) {
    if (this.done) return;
    const host = this.w.isHost;
    switch (d.k) {
      case "at": case "again": {
        const h = (Number(d.h) || 0) % this.d.haunts.length;
        if (h !== this.h && !this.spotted && d.k === "at") this.w.toast(`Word is he's moved on to ${this.d.haunts[h].label}`, 3);
        this.h = h;
        if (d.i >= 0) this.ring = { i: Number(d.i), gen: Number(d.g) }; else if (!host) this.ring = null;
        this.seen = { x: Number(d.x), z: Number(d.z) };
        if (Array.isArray(d.zn)) this.zone = { x: Number(d.zn[0]), z: Number(d.zn[1]), r: Number(d.zn[2]) || CIRCLE };
        if (Array.isArray(d.cl)) this.clues = d.cl.map((c: number[]) => ({ n: Number(c[0]), x: Number(c[1]), z: Number(c[2]), t: Number(c[3]), q: Number(c[4]) || 0 }));
        if (!host && Array.isArray(d.cw)) this.crew = d.cw.map((c: number[]) => ({ i: Number(c[0]), gen: Number(c[1]) }));
        if (Array.isArray(d.mk)) this.meek = new Set(d.mk.map(Number));
        this.pen = Math.max(this.pen, Number(d.pn) || 0);
        this.found = Math.max(this.found, Number(d.f) || 0);
        this.gaveUp = !!d.gu;
        this.running = !!d.rn;
        this.led = Array.isArray(d.ld) ? { by: String(d.ld[0]), x: Number(d.ld[1]), z: Number(d.ld[2]), n: String(d.ld[3]) } : null;
        if (!this.led) this.w.mark("@wanted-in", null);
        if (d.ag) this.again = true;
        if (d.k === "again") { this.again = true; this.spotted = false; this.w.mark("@wanted", null); SFX.jobStep(); this.w.toast(`${this.d.title} has slipped the net! Last chance: the circle's open again round ${this.haunt.label}`, 4.5); }
        this.hands();
        this.circle();
        break;
      }
      case "spot": {
        if (this.spotted) break;
        this.spotted = true;
        this.markT = 0;
        SFX.jobStep();
        const first = !this.rewarded, by = String(d.by ?? from);
        this.rewarded = true;
        this.w.toast(`${this.who(by, "You've")}${by === this.w.selfId ? "" : "'s"} spotted ${this.d.title}!${first ? " A prize for the spotter" : ""}`, 3);
        this.w.feed(`${this.feedWho(by)} spotted <b style="color:${COLOUR}">${esc(this.d.title)}</b>${first ? " (a prize for the spotter)" : ""}`);
        // the spotter's prize, at their feet (up a roof, it's on the ground below)
        if (first && host) { const p = this.w.players().find((q) => q.id === by); if (p) this.w.prize(p.x + 1, p.z, false); }
        this.circle();
        break;
      }
      case "lost":
        if (!this.spotted) break;
        this.spotted = false;
        if (!this.running) this.w.mark("@wanted", null);
        this.w.toast(this.d.hidden === "bus" ? `He's hopped on a bus!${this.running ? ` He's off to ${this.haunt.label}` : " Back to the circle"}`
          : this.running ? `He's legged it to ${this.haunt.label}. Follow the marker` : "You've lost sight of him. Back to the circle", 3);
        this.circle();
        break;
      case "clue": if (host) this.clueFound(Number(d.n), from); break;
      case "cuff": if (host) this.cuff(from, Number(d.i), Number(d.g)); break;
      case "id": if (host) this.identify(from, Number(d.i), Number(d.g)); break;
      case "push": if (host) this.press(Number(d.n), from); break;
      case "nope":
        this.pen = Math.max(this.pen, Number(d.pn) || 0);
        if (d.by === this.w.selfId) { SFX.clunk(); this.w.toast(`That's not him! It cost you ${PEN_ID} seconds`, 3); }
        break;
      case "words":
        SFX.jobStep();
        this.w.toast(`${this.who(String(d.by ?? from))} pressed the witness: "${String(d.t ?? "")}"${d.w ? " (so that might be wrong)" : ""}`, 4.5);
        break;
      case "gv": {
        const i = Number(d.i);
        this.meek.add(i);
        this.w.naughtyBoys.hands(i, Number(d.g), 1, "Eh? I haven't done anything!");
        break;
      }
      case "act": {
        // he and the lads dressed like him all do the same thing at a stop, so it gives nothing away
        for (const c of this.ring ? [this.ring, ...this.crew] : this.crew) if (!this.meek.has(c.i)) this.w.naughtyBoys.hands(c.i, c.gen, 0, this.haunt.act);
        break;
      }
      case "wrong": {
        this.pen = Math.max(this.pen, Number(d.pn) || 0);
        this.meek.delete(Number(d.i));
        this.crew = this.crew.filter((c) => c.i !== Number(d.i));
        this.w.naughtyBoys.hands(Number(d.i), Number(d.g), 0, "I'll be speaking to my solicitor!");
        this.complaint = { text: String(d.t ?? ""), until: Date.now() + 10000 };
        SFX.clunk();
        this.w.toast(`Wrong man! ${this.complaint.text}`, 6);
        this.w.feed(`${this.feedWho(String(d.by ?? from))} cuffed the wrong man`);
        break;
      }
      case "found": {
        const f = Number(d.f) || this.found + 1, first = this.found === 0;
        this.found = Math.max(this.found, f);
        SFX.jobStep();
        this.w.toast(`${this.who(String(d.by ?? from))}: ${String(d.t ?? "")}. The circle closes in`, 4);
        this.w.feed(`${this.feedWho(String(d.by ?? from))} found a clue`);
        if (first) setTimeout(() => { if (!this.done) this.w.toast(`Word is he's ${REVEAL[this.d.hidden]}`, 4); }, 4200);
        break;
      }
      case "give":
        this.gaveUp = true;
        this.markT = 0;
        SFX.jobStep();
        this.hands("All right, all right! I'll come quietly!");
        this.circle();
        break;
      case "led":
        this.led = { by: String(d.by), x: Number(d.x), z: Number(d.z), n: String(d.n ?? "the police") };
        SFX.clunk();
        this.w.mark("@wanted-in", { x: this.led.x, z: this.led.z }, "Hand him in", POLICE);
        this.hands("It's a fair cop.");
        break;
      case "slip":
        this.led = null;
        this.w.mark("@wanted-in", null);
        this.w.toast("He's slipped off! Hands still up: cuff him again (E)", 3);
        this.hands();
        break;
      case "say":
        this.w.toast(String(d.t ?? ""), 3.5);
        break;
      case "in": {
        const x = Number(d.x), z = Number(d.z), by = String(d.by);
        this.done = { won: true, text: `${this.who(by)} took ${this.d.title} in. Bounty collected, with interest!`, x, z, wear: ["deer"], grade: this.grade() };
        this.w.feed(`${this.feedWho(by)} took <b style="color:${COLOUR}">${esc(this.d.title)}</b> in alive`);
        // the bigger reward for bringing him in: more prizes, on top of the usual
        if (host) for (let k = 0; k <= this.offer.stars + (d.cl ? 1 : 0); k++) this.w.prize(x + 2.5 * Math.cos(k * 1.7), z + 2.5 * Math.sin(k * 1.7), true);
        if (d.cl) this.w.toast("Caught at his stop with no chase: an ambush bonus!", 4);
        this.collect();
        break;
      }
      case "down":
        if (host && d.cl) this.w.prize(Number(d.x) + 1.5, Number(d.z), true);
        this.done = { won: true, text: `${this.who(String(d.by))} put ${this.d.title} down. Bounty collected!${d.cl ? " Caught at his stop, no chase: bonus!" : ""}`, x: Number(d.x), z: Number(d.z), wear: ["deer"], grade: this.grade() };
        this.collect();
        break;
      case "away":
        this.done = { won: false, text: `${this.d.title} got away` };
        break;
    }
  }

  private collect() {
    this.w.reward(this.d.ride);
    try { localStorage.setItem("cd-bounties", String((Number(localStorage.getItem("cd-bounties")) || 0) + 1)); } catch { /* ignore */ }
  }

  progress() { return { ...this.state(), sp: this.spotted ? 1 : 0 }; }
  restore(p: any) {
    if (!p) return;
    this.h = (Number(p.h) || 0) % this.d.haunts.length;
    this.event({ ...p, k: "at" }, "");
    if (p.sp) this.spotted = true;
    this.circle();
  }

  boss() { return this.d.title; }

  card(): Card {
    const c = this.cardBase(), left = Math.max(0, Math.round(this.left));
    const phase = this.led ? "led" : this.gaveUp ? "up" : this.spotted ? "spot" : this.running ? "run" : "search";
    const stage = {
      led: { title: "Cuffed!", sub: `Lead him to ${this.led?.n ?? "the police"}` },
      up: { title: "He's given up!", sub: "Get up close and cuff him (E)" },
      spot: { title: "Spotted!", sub: "Put him down, or wear him down" },
      run: { title: "He's legged it!", sub: "Follow the marker" },
      search: { title: "", sub: "" },
    }[phase];
    return {
      ...c, sub: c.sub?.replace(/^\d+:\d\d left( · )?/, ""),
      timer: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} left`,
      progress: { led: "Leading him in", up: "Cuff him", spot: "Spotted", run: "Chasing", search: "Searching" }[phase],
      stage: stage.title ? { key: phase, ...stage } : undefined,
    };
  }

  private cardBase(): Card {
    if (this.complaint && Date.now() > this.complaint.until) this.complaint = null;
    const me = this.w.me(), left = Math.max(0, Math.round(this.left)), bar = left / (this.limit + (this.again ? EXTRA : 0));
    const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    const traits = [...this.d.quirks.map((q) => QUIRK[q].split(":")[0]), this.found ? HIDDEN[this.d.hidden].split(":")[0] : "one more?"].join(", ");
    const where = (x: number, z: number) => `${far(Math.hypot(x - me.x, z - me.z))} ${compassWord(x - me.x, z - me.z)}`;
    if (this.complaint) return { line: esc(this.complaint.text), sub: `${clock} left · the real one has moved on`, bar };
    if (this.led) {
      const mine = this.led.by === this.w.selfId;
      return { line: `${mine ? "Lead him" : `${esc(this.who(this.led.by))} is leading him`} to <b>${esc(this.led.n)}</b>, ${where(this.led.x, this.led.z)}. ${mine ? "Don't get too far ahead" : "Keep his mates off"}`, sub: `${clock} left`, bar };
    }
    if (this.gaveUp) {
      const at = this.seen ?? me;
      return { line: `He's given up, ${where(at.x, at.z)}! Get up close and cuff him (E) to take him in`, sub: `${clock} left`, bar };
    }
    if (this.spotted && this.seen) {
      const take = this.d.hidden === "stubborn" && this.found ? "Put him down" : "Put him down, or wear him down up close and he'll give up";
      return { line: `Spotted! He's ${where(this.seen.x, this.seen.z)}. ${take}`, sub: `${clock} left · ${traits}`, bar };
    }
    const hh = this.haunt, next = this.d.haunts[(this.h + 1) % this.d.haunts.length];
    if (this.running && this.seen) {
      return { line: `He's legged it! He's ${where(this.seen.x, this.seen.z)}, making for <b>${esc(hh.label)}</b>. Follow the marker, and corner him before you shoot`, sub: `${clock} left · ${traits}`, bar };
    }
    return {
      line: `Somewhere in the circle round <b>${esc(hh.label)}</b>, ${where(this.zone.x, this.zone.z)}. Look for the man the poster describes among his lookalikes, through binoculars (B) if you can, and ask a witness for one more thing about him`,
      sub: `${clock} left · then ${esc(next.label)} · ${traits}`, bar,
    };
  }

  end() {
    this.w.mark("@wanted", null);
    this.w.mark("@wanted-in", null);
    this.w.circle("wanted", null);
    for (const v of this.views.values()) this.w.scene.remove(v.view);
    this.views.clear();
    this.meek.clear();
    this.complaint = null;
    if (this.police) { this.w.scene.remove(this.police); this.police = null; }
    if (this.ring) this.w.naughtyBoys.hands(this.ring.i, this.ring.gen, 0);
    if (this.w.isHost) {
      const ch = this.w.naughtyBoys;
      if (this.ring) ch.release(this.ring.i, this.ring.gen, this.gaveUp);
      for (const c of [...this.crew, ...this.lookouts]) ch.release(c.i, c.gen);
    }
  }
}
