// Trophies: something to chase after the jobs run out. Bronze, silver and gold for each kind of job,
// and milestones for riding, fighting, pubs, landmarks and wandering about Bath. Together with
// the wardrobe they make up your Bath completion %, shown in the pause menu with the trophy cabinet.
//
// Who decides what: all your own. Everything is kept on this device (local storage) and nothing goes
// over the network or needs the telemetry. Counters are added up in memory and saved every ten
// seconds and when the page is left; a once-a-second look at where you are (the probe game.ts
// hands in) ticks off pubs, landmarks and squares, so nothing here runs per frame. A trophy is
// awarded once, whoever asks: award() again does nothing.
import { SET_PIECES, type SetPiece } from "./landmarks/setpieces";
import type { GameMap } from "./map";
import { RIDES } from "./rides";
import * as SFX from "./audio";
import { WEARABLES, has as wearing } from "./wardrobe";
import * as Paper from "./paper";

export type Tier = "bronze" | "silver" | "gold";
export const CATEGORIES = ["Jobs", "Races", "Trails", "Seagulls", "Wanted", "Riding & tricks", "Exploring", "Bath landmarks", "Fighting"] as const;
export type Category = (typeof CATEGORIES)[number];
export interface Trophy { id: string; name: string; how: string; tier: Tier; cat: Category; goal?: () => boolean }
export const TIER_COLOUR: Record<Tier, string> = { bronze: "#cd7f32", silver: "#c3ccd6", gold: "#ffc83a" };

const KEY = "cd-trophies";
interface Saved {
  got: Record<string, number>;
  n: Record<string, number>;
  sets: Record<string, string[]>;
  best: Record<string, { v: number; text: string }>;
  tot: Record<string, number>;
}
let S: Saved | null = null;
let dirty = false, check = false;

function state(): Saved {
  if (S) return S;
  S = { got: {}, n: {}, sets: {}, best: {}, tot: {} };
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (d && typeof d === "object") for (const k of Object.keys(S) as (keyof Saved)[]) if (d[k] && typeof d[k] === "object") (S as any)[k] = d[k];
  } catch { /* nothing saved, or storage is blocked */ }
  return S;
}
function flush() {
  if (!dirty) return;
  dirty = false;
  try { localStorage.setItem(KEY, JSON.stringify(state())); } catch { /* storage may be blocked */ }
}
const num = (k: string) => state().n[k] ?? 0;
const seen = (set: string) => state().sets[set]?.length ?? 0;
const sumKeys = (prefix: string) => Object.entries(state().n).reduce((a, [k, v]) => a + (k.startsWith(prefix) ? v : 0), 0);

// ---- what there is to win ------------------------------------------------------------------------

const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");

const RIDE_TROPHIES: Record<string, [string, string]> = {
  bike: ["Tour de Combe Down", "bike"], bmx: ["BMX Bandit", "BMX"], blades: ["Blade Runner (Weston Road)", "rollerblades"],
  board: ["Board Meeting", "skateboard"], scooter: ["Scooter Menace", "scooter"], pogo: ["Pogo Pilgrim", "pogo stick"], trolley: ["Trolley Dash", "shopping trolley"],
};
const KM = (kind: string) => num("m:" + kind) >= 1000;

/** The landmarks you can visit: Bath's set pieces, minus the ones on other maps or that are part of another. */
const LANDMARKS = SET_PIECES.filter((p) => p.kind !== "priorwings" && p.kind !== "boastation");
const LM_TEXT: Record<string, [string, string]> = {
  "Bath Abbey": ["Pearly gates", "Stand by Bath Abbey"],
  "Pulteney Bridge": ["Shop on a bridge", "Cross Pulteney Bridge"],
  "Roman Baths": ["Don't drink the water", "Have a nosy round the Roman Baths"],
  "Great Pulteney Street": ["A very long stroll", "Walk down Great Pulteney Street"],
  "Argyle Street": ["Argy-bargy", "Wander along Argyle Street"],
  "Grand Parade": ["Parade rained on", "Stroll along Grand Parade"],
  "Empire Hotel": ["Any rooms going?", "Pop by the Empire Hotel"],
  "Sham Castle": ["Fake it till you make it", "Visit Sham Castle (it isn't a real one)"],
  "Holburne Museum": ["Museum piece", "Visit the Holburne Museum"],
  "Prior Park": ["Prior engagement", "Get yourself to Prior Park"],
  "Kingswood School": ["School's out", "Visit Kingswood School"],
  "The Bell Inn": ["For whom the Bell tolls", "Find the Bell Inn"],
  "Grenville's monument": ["Lansdown lookout", "Puff up to Grenville's monument"],
  "Bath Spa station": ["All change", "Turn up at Bath Spa station"],
};

const LIST: Trophy[] = [];
const add = (cat: Category, tier: Tier, id: string, name: string, how: string, goal?: () => boolean) => LIST.push({ id, name, how, tier, cat, goal });

add("Jobs", "bronze", "jobs5", "Odd Jobber", "Finish 5 jobs from the noticeboards", () => num("jobs") >= 5);
add("Jobs", "silver", "jobs25", "Handy Person", "Finish 25 jobs", () => num("jobs") >= 25);
add("Jobs", "gold", "jobs100", "Pillar of the Community", "Finish 100 jobs", () => num("jobs") >= 100);
add("Jobs", "bronze", "bonfire", "Wood You Believe It", "Carry a bundle of wood to Kingswood's bonfire");
add("Jobs", "silver", "daily", "Read All About It", "Finish all three of the Chronicle's jobs of the day");
add("Jobs", "gold", "daily7", "Regular Reader", "Finish a full day's Chronicle jobs on seven different days", () => num("dailydays") >= 7);

add("Races", "bronze", "ra1", "Also Ran", "Finish a race");
add("Races", "silver", "ra2", "On the Podium (Nearly)", "Finish a race in a silver medal time");
add("Races", "gold", "ra3", "Gold Standard", "Finish a race in a gold medal time");
add("Races", "silver", "rawin", "Eat My Dust", "Be first over the line in a race against other players");

add("Trails", "bronze", "tr1", "X Marks a Spot", "Dig up the chest at the end of a treasure trail");
add("Trails", "silver", "tr2", "Silver Tongue", "Finish a treasure trail in a silver time");
add("Trails", "gold", "tr3", "Proper Pirate", "Finish a treasure trail in a gold time, with no hints");

add("Seagulls", "bronze", "gu1", "Chip Guardian", "Finish a Seagull Attack");
add("Seagulls", "silver", "gu2", "Gull Scarer", "Three stars on a Seagull Attack");
add("Seagulls", "gold", "gu3", "Lord of the Chips", "Three stars on a three-star Seagull Attack poster");

add("Wanted", "bronze", "wa1", "Citizen's Arrest", "Bring in a Wanted ringleader");
add("Wanted", "silver", "wa2", "Bounty Hunter", "Bring in the ringleader on a two-star Wanted poster or better");
add("Wanted", "gold", "wa3", "Most Wanted", "Bring in the ringleader on a three-star Wanted poster");

for (const r of RIDES) {
  const [name, thing] = RIDE_TROPHIES[r] ?? [r, r];
  add("Riding & tricks", "bronze", "km-" + r, name, `Ride 1 km on a ${thing}`, () => KM(r));
}
add("Riding & tricks", "silver", "km10", "Legs of Steel", "Ride 10 km on any one kind of ride", () => RIDES.some((r) => num("m:" + r) >= 10000));
add("Riding & tricks", "gold", "km50", "Wheels Within Wheels", "Ride 50 km in total", () => sumKeys("m:") >= 50000);
add("Riding & tricks", "gold", "rideall", "Jack of All Trades", "Try every kind of ride (bike, BMX, blades, board, scooter, pogo, trolley)", () => RIDES.every((r) => state().sets.rides?.includes(r)));
add("Riding & tricks", "bronze", "combo1", "Showing Off", "Land a combo worth 500 points", () => num("combo") >= 500);
add("Riding & tricks", "silver", "combo2", "Show-Off", "Land a combo worth 2,000 points", () => num("combo") >= 2000);
add("Riding & tricks", "gold", "combo3", "Tony Hawk's Combe Down", "Land a combo worth 6,000 points", () => num("combo") >= 6000);
add("Riding & tricks", "bronze", "fly1", "Up, Up and Away", "Get airborne in the angel's wings", () => num("fly") >= 1);
add("Riding & tricks", "silver", "fly2", "Frequent Flyer", "Spend a full minute flying in the wings", () => num("fly") >= 60);
add("Riding & tricks", "bronze", "callbus", "Hail Fellow", "Call a bus from a bus stop", () => num("bus") >= 1);
const DRIVES: [string, string, string, string[]][] = [
  ["bus", "Mind the Gap", "Drive a bus", ["bus", "minibus", "school"]],
  ["police", "Blue Lights", "Drive a police car", ["police"]],
  ["ice", "Stop Me and Buy One", "Drive an ice cream van", ["icecream"]],
  ["milk", "Pinta Pinta", "Drive a milk float", ["milkfloat"]],
  ["c5", "Sir Clive's Revenge", "Drive a Sinclair C5", ["c5"]],
  ["chip", "Salt and Vinegar", "Drive the chip van", ["chipvan"]],
  ["landy", "Off the Beaten Track", "Drive a Land Rover", ["landrover"]],
];
for (const [id, name, how, kinds] of DRIVES) add("Riding & tricks", "bronze", "dr-" + id, name, how, () => kinds.some((k) => state().sets.drove?.includes(k)));
add("Riding & tricks", "bronze", "boat", "Messing About on the River", "Take the tiller of a canal boat", () => state().sets.rides?.includes("boat") ?? false);
add("Riding & tricks", "bronze", "balloon", "Hot Air", "Go up in a hot air balloon", () => state().sets.rides?.includes("balloon") ?? false);
add("Riding & tricks", "silver", "drove5", "Learner Plates Off", "Drive five different kinds of vehicle", () => seen("drove") >= 5);
add("Riding & tricks", "gold", "drove10", "Full Licence", "Drive ten different kinds of vehicle", () => seen("drove") >= 10);

add("Exploring", "bronze", "sq10", "Footloose", "Set foot in 10 squares of the map", () => seen("sq") >= 10);
add("Exploring", "silver", "sq50", "Getting About", "Set foot in 50 squares of the map", () => seen("sq") >= 50);
add("Exploring", "gold", "sqall", "Every Last Bit of Bath", "Set foot in every square of the map", () => state().tot.sq > 0 && seen("sq") >= state().tot.sq);
add("Exploring", "bronze", "pub5", "Quick Half", "Walk into 5 different pubs", () => seen("pubs") >= 5);
add("Exploring", "silver", "pub20", "Regular", "Walk into 20 different pubs", () => seen("pubs") >= 20);
add("Exploring", "gold", "puball", "Pub Crawl Champion", "Walk into every pub in Bath", () => state().tot.pubs >= 5 && seen("pubs") >= state().tot.pubs);
add("Exploring", "bronze", "pint1", "Cheers", "Have a pint", () => num("pints") >= 1);
add("Exploring", "silver", "pint10", "Hollow Legs", "Have ten pints", () => num("pints") >= 10);

for (const sp of LANDMARKS) {
  const [name, how] = LM_TEXT[sp.name] ?? [`See ${sp.name}`, `Visit ${sp.name}`];
  add("Bath landmarks", "bronze", "lm-" + slug(sp.name), name, how, () => !!state().sets.lm?.includes(slug(sp.name)));
}
add("Bath landmarks", "silver", "lm5", "Tourist", "Visit 5 of Bath's landmarks", () => seen("lm") >= 5);
add("Bath landmarks", "gold", "lmall", "Open-Top Bus Tour", "Visit every one of Bath's landmarks", () => seen("lm") >= LANDMARKS.length);
add("Bath landmarks", "gold", "abbeytop", "Top of the Abbey", "Climb Bath Abbey and put on the wings at the top");

add("Fighting", "bronze", "kill1", "First Blood", "Put down your first naughty boy", () => num("kills") >= 1);
add("Fighting", "bronze", "kill10", "Neighbourhood Watch", "Put down 10 baddies", () => num("kills") >= 10);
add("Fighting", "silver", "kill100", "Community Service", "Put down 100 baddies", () => num("kills") >= 100);
add("Fighting", "gold", "kill500", "Scourge of the Naughty Boys", "Put down 500 baddies", () => num("kills") >= 500);

export const TROPHIES: readonly Trophy[] = LIST;
const BY_ID = new Map(LIST.map((t) => [t.id, t]));
const MILESTONES = LIST.filter((t) => t.goal);

// ---- awarding ------------------------------------------------------------------------------------

export const earned = (id: string) => !!state().got[id];

const queue: Trophy[] = [];
let toastEl: HTMLDivElement | null = null, showing = false, styled = false;

function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = `
#trophytoast{position:fixed;left:50%;top:10px;z-index:12;transform:translate(-50%,-140%);transition:transform .45s cubic-bezier(.2,1.3,.4,1),opacity .4s;opacity:0;
  pointer-events:none;display:flex;align-items:center;gap:10px;padding:8px 16px 8px 10px;max-width:calc(100vw - 24px);box-sizing:border-box;
  background:rgba(11,12,12,.9);border:2px solid var(--tc,#ffc83a);box-shadow:0 6px 20px rgba(0,0,0,.5);font-family:var(--f-hud,sans-serif);color:#fff}
#trophytoast.in{transform:translate(-50%,0);opacity:1}
#trophytoast .medal{flex:none;width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff8,var(--tc) 55%);box-shadow:0 0 12px var(--tc)}
#trophytoast b{display:block;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--tc)}
#trophytoast span{font-size:17px;font-weight:700;line-height:1.1}
#trophytoast small{display:block;font-size:12px;color:#c8d4dc;font-weight:500}`;
  document.head.appendChild(s);
}

function nextToast() {
  const t = queue.shift();
  if (!t) { showing = false; return; }
  showing = true;
  style();
  if (!toastEl || !toastEl.isConnected) {
    toastEl = document.createElement("div");
    toastEl.id = "trophytoast";
    toastEl.setAttribute("aria-live", "polite");
    (document.getElementById("hud") ?? document.body).appendChild(toastEl);
  }
  const el = toastEl;
  el.style.setProperty("--tc", TIER_COLOUR[t.tier]);
  el.innerHTML = `<i class="medal"></i><div><b>Trophy! ${t.tier}</b><span></span><small></small></div>`;
  el.querySelector("span")!.textContent = t.name;
  el.querySelector("small")!.textContent = t.how;
  void el.offsetWidth;
  el.classList.add("in");
  SFX.trophy(t.tier);
  setTimeout(() => { el.classList.remove("in"); setTimeout(nextToast, 500); }, 3600);
}

/** You've earned it: put it in the cabinet and slide the toast in. Does nothing if you have it already. */
export function award(id: string): boolean {
  const t = BY_ID.get(id), s = state();
  if (!t || s.got[id]) return false;
  s.got[id] = Date.now();
  dirty = true;
  queue.push(t);
  if (!showing) nextToast();
  return true;
}

// ---- counters ------------------------------------------------------------------------------------

/** Add to a running count (kills, pints...). Cheap: nothing is saved or checked until the next tick. */
export function tally(what: string, by = 1) { state().n[what] = num(what) + by; dirty = check = true; }
/** A count that only goes up to your best (a combo's score). */
export function best(what: string, v: number) { if (v > num(what)) { state().n[what] = v; dirty = check = true; } }
/** Metres ridden on a kind of ride. */
export const ride = (kind: string, metres: number) => tally("m:" + kind, metres);
/** Something new seen or done: add it to a set (a pub, a landmark, a square). */
export function visit(set: string, id: string) {
  const s = state(), a = (s.sets[set] ??= []);
  if (a.includes(id)) return;
  a.push(id);
  dirty = check = true;
}

/** What a finished job comes to: tier 1 is just finishing, 2 silver, 3 gold. also: any other trophy it earns. */
export interface Grade { tier: 1 | 2 | 3; /** How to say your best at it, and a number to compare it by. */ best?: { v: number; text: string }; also?: string[] }

/** A job (or a mission) of kind has been won: trophies for each tier reached, and your best kept. */
export function missionResult(kind: string, g: Grade) {
  for (let t = 1; t <= g.tier; t++) award(`${PREFIX[kind] ?? kind}${t}`);
  for (const id of g.also ?? []) award(id);
  if (g.best) {
    const was = state().best[kind];
    if (!was || g.best.v > was.v) { state().best[kind] = g.best; dirty = true; if (was) Paper.record(`${RECORD[kind] ?? cap(kind)}: ${g.best.text}`); }
  }
}
const PREFIX: Record<string, string> = { race: "ra", trail: "tr", gulls: "gu", wanted: "wa" };
const RECORD: Record<string, string> = { race: "Race", trail: "Treasure trail", gulls: "Seagull Attack", wanted: "Wanted" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Your best at a kind of job so far, in words, for its start card. */
export const bestFor = (kind: string) => state().best[kind]?.text ?? "";

/** A job that counts toward the total has been won. */
export function jobWon() { tally("jobs"); }

// ---- the look at where you are, once a second -----------------------------------------------------

export interface Probe {
  x: number; z: number; alive: boolean;
  /** What you're on, as telemetry words: "ride:drive:bus", "ride:boat", "ride:bike"... or null. */
  doing: string | null;
  flying: boolean;
  pubs: { name: string; x: number; z: number }[];
  map: GameMap;
}

const PUB_REACH = 9;
let probe: (() => Probe | null) | null = null, timer = 0, ticks = 0;
const lmCache = new Map<string, { id: string; x: number; z: number; r: number }[]>();

/** Where each landmark is on this map, and how near counts as being there. */
function landmarksOn(map: GameMap) {
  const c = map.d.centre, key = c.join();
  let out = lmCache.get(key);
  if (out) return out;
  const kx = 111320 * Math.cos((c[1] * Math.PI) / 180), ky = 110574;
  out = LANDMARKS.map((sp: SetPiece) => {
    const reach = Math.max(...[sp.outline, ...(sp.more ?? [])].flat().map(([a, b]) => Math.hypot(a, b)));
    return { id: slug(sp.name), x: (sp.at[0] - c[0]) * kx, z: -(sp.at[1] - c[1]) * ky, r: Math.min(90, Math.max(30, reach * 0.7)) };
  });
  lmCache.set(key, out);
  return out;
}

function tick() {
  const p = probe?.();
  if (p) {
    const s = state();
    s.tot.pubs = p.pubs.length || s.tot.pubs;
    if (p.alive) {
      const d = p.doing ?? "";
      if (d.startsWith("ride:drive:")) visit("drove", d.slice(11));
      else if (d.startsWith("ride:") && !d.startsWith("ride:pass")) visit("rides", d.slice(5));
      if (p.flying) tally("fly", 1);
      for (const q of p.pubs) if (Math.hypot(q.x - p.x, q.z - p.z) < PUB_REACH) visit("pubs", q.name);
      for (const l of landmarksOn(p.map)) if (Math.hypot(l.x - p.x, l.z - p.z) < l.r) visit("lm", l.id);
      const I = p.map.tileIndex;
      if (I) {
        const S_ = I.cells * I.dx, ti = Math.floor((p.x - I.x0) / S_), tj = Math.floor((-p.z - I.y0) / S_);
        s.tot.sq = I.tiles.length;
        if (I.tiles.some(([i, j]) => i === ti && j === tj)) visit("sq", `${ti},${tj}`);
      }
    }
  }
  if (check) {
    check = false;
    for (const t of MILESTONES) if (!state().got[t.id] && t.goal!()) award(t.id);
  }
  if (++ticks % 10 === 0) flush();
}

addEventListener("pagehide", flush);

/** The game hands in its probe when it starts; call the returned function when it ends. */
export function attach(look: () => Probe | null): () => void {
  probe = look;
  clearInterval(timer);
  timer = window.setInterval(tick, 1000);
  return () => { if (probe === look) { probe = null; clearInterval(timer); flush(); } };
}

// ---- how much of Bath you've done ---------------------------------------------------------------

export interface Part { name: string; have: number; total: number; weight: number }

/** Bath completion: the weighted share of trophies, landmarks, pubs, squares, rides tried and wardrobe items. */
export function completion(): { pct: number; parts: Part[] } {
  const s = state();
  const parts: Part[] = [
    { name: "Trophies", have: Object.keys(s.got).filter((id) => BY_ID.has(id)).length, total: LIST.length, weight: 35 },
    { name: "Landmarks", have: seen("lm"), total: LANDMARKS.length, weight: 15 },
    { name: "Pubs", have: Math.min(seen("pubs"), s.tot.pubs || Infinity), total: s.tot.pubs || 0, weight: 15 },
    { name: "Map squares", have: Math.min(seen("sq"), s.tot.sq || Infinity), total: s.tot.sq || 0, weight: 15 },
    { name: "Rides tried", have: [...RIDES, "boat", "balloon"].filter((r) => s.sets.rides?.includes(r)).length, total: RIDES.length + 2, weight: 10 },
    { name: "Wardrobe", have: WEARABLES.filter((w) => wearing(w.id)).length, total: WEARABLES.length, weight: 10 },
  ];
  const pct = parts.reduce((a, p) => a + (p.total ? Math.min(1, p.have / p.total) * p.weight : 0), 0);
  return { pct: Math.floor(pct), parts };
}

// ---- the cabinet -----------------------------------------------------------------------------------

let page: HTMLDivElement | null = null;
/** Close the cabinet if it's open. */
export function closeCabinet() { page?.dispatchEvent(new Event("shut")); }
addEventListener("keydown", (e) => {
  if (e.code === "Escape" && page) { e.stopImmediatePropagation(); e.preventDefault(); closeCabinet(); }
}, true);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The trophy cabinet over the pause menu: every trophy by category, with how far you are. */
export function openCabinet(closed: () => void) {
  if (page) return;
  style();
  cabinetStyle();
  flush();
  const c = completion(), s = state();
  page = document.createElement("div");
  page.id = "trophies";
  page.className = "overlay";
  const cats = CATEGORIES.map((cat) => {
    const all = LIST.filter((t) => t.cat === cat), got = all.filter((t) => s.got[t.id]).length;
    return `<section><h3>${esc(cat)} <small>${got} / ${all.length}</small></h3><div class="trgrid">`
      + all.map((t) => s.got[t.id]
        ? `<div class="trtile got" style="--tc:${TIER_COLOUR[t.tier]}"><i></i><div><b>${esc(t.name)}</b><small>${esc(t.how)}</small></div></div>`
        : `<div class="trtile" style="--tc:${TIER_COLOUR[t.tier]}"><i></i><div><b>${esc(t.name)}</b><small>${esc(t.how)}</small></div></div>`).join("")
      + `</div></section>`;
  }).join("");
  const bits = c.parts.map((p) => `<span>${esc(p.name)} <b>${p.have}${p.total ? ` / ${p.total}` : ""}</b></span>`).join("");
  page.innerHTML = `<div class="card trcard">
    <header class="masthead"><span class="mark" aria-hidden="true"></span><span>Bath &amp; North East Somerset<b>Trophy cabinet</b></span></header>
    <div class="trtop"><div class="trpct"><b>${c.pct}%</b><span>of Bath done</span></div><div class="trbits">${bits}</div></div>
    <div class="trbody">${cats}</div>
    <div class="pubbar"><p class="hint">${c.parts[0].have} of ${LIST.length} trophies. Bronze, silver and gold; dim ones are still to win.</p><button type="button" class="trback">Back</button></div>
  </div>`;
  document.body.appendChild(page);
  const close = () => { page?.remove(); page = null; closed(); };
  page.addEventListener("shut", close);
  page.querySelector(".trback")!.addEventListener("click", close);
}

let cabStyled = false;
function cabinetStyle() {
  if (cabStyled) return;
  cabStyled = true;
  const s = document.createElement("style");
  s.textContent = `
#trophies{z-index:11}
.trcard{width:min(900px,100%);max-height:100%;display:flex;flex-direction:column}
.trtop{display:flex;gap:18px;align-items:center;padding:12px 18px 6px;flex-wrap:wrap}
.trpct{display:flex;align-items:baseline;gap:8px}
.trpct b{font-family:var(--f-hud);font-size:46px;line-height:1}
.trpct span{color:var(--paper-muted)}
.trbits{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:14px;color:var(--paper-muted)}
.trbits b{color:var(--paper-ink)}
.trbody{overflow:auto;padding:4px 18px 8px;max-height:min(62vh,560px);-webkit-overflow-scrolling:touch}
.trbody h3{margin:12px 0 6px;font-size:17px}
.trbody h3 small{font-size:13px;color:var(--paper-muted);font-weight:500}
.trgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px}
.trtile{display:flex;gap:8px;align-items:flex-start;padding:6px 8px;border:2px dashed var(--paper-line);opacity:.55}
.trtile i{flex:none;width:22px;height:22px;margin-top:1px;border-radius:50%;background:var(--paper-line);border:2px solid var(--tc);box-sizing:border-box}
.trtile b{display:block;font-size:14px;line-height:1.15}
.trtile small{display:block;font-size:12px;line-height:1.2;color:var(--paper-muted)}
.trtile.got{opacity:1;border:2px solid var(--tc);background:linear-gradient(135deg,#fff,color-mix(in srgb,var(--tc) 28%,#fff));box-shadow:0 0 10px color-mix(in srgb,var(--tc) 60%,transparent)}
.trtile.got i{background:radial-gradient(circle at 35% 30%,#fff9,var(--tc) 60%);box-shadow:0 0 8px var(--tc)}
@media (max-width:560px),(max-height:500px){.trpct b{font-size:34px}.trgrid{grid-template-columns:1fr}.trbody{max-height:52vh}.trtop{padding:8px 12px 2px}}`;
  document.head.appendChild(s);
}
