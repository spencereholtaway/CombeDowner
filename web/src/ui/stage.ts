// The stage of the HUD page (ui.html?stage): the game's own HUD markup, taken from index.html, with
// each piece drawn into it by the game's own functions (missionscreens.ts, notice.ts, useprompt.ts
// and the rest) and sample words from the modes that use them. The few pieces a mode still builds
// out of reach (the Flag Lads' row) are drawn from a copy of their markup, and pieces.ts says so.
import * as MS from "../missionscreens";
import * as WS from "../wantedscreens";
import { guide, named, news, noticeClear, noticeLinger, people, reward, score, systemNote } from "../notice";

// the specimens stay up while they're looked at, however long each kind would stay in the game
noticeLinger(1000);
import { itemPicture } from "../itempic";
import { usePrompt } from "../useprompt";
import { keycaps } from "../keycap";
import { closeModals } from "../modal";
import { STREETS, controlsPage, ctl, ctlText } from "../controls";
import { show } from "../show";
import { Reveal, loadingHit, loadingLook, type Shot } from "../reveal";
import { comboLine } from "../combo";
import { FlagJuice } from "../flagjuice";
import * as THREE from "three";
import { Daily } from "../daily";
import { type Brief, briefCut, briefHtml } from "../brief";

const $ = (id: string) => document.getElementById(id)!;
let hold = 0;          // a timer keeping something that would go by itself on the screen
let street = "";       // the street name as the page has it, put back after a state writes its own
let juice: FlagJuice | null = null;

/** Put the game's HUD on the page, from the game's own page. */
export async function ready() {
  controlsPage(STREETS);
  const html = await (await fetch("./index.html")).text();
  const hud = new DOMParser().parseFromString(html, "text/html").getElementById("hud");
  if (!hud) throw new Error("no #hud in index.html");
  hud.hidden = false;
  const back = document.createElement("div");
  back.id = "uiback";
  document.body.append(back, document.adoptNode(hud));
  const s = document.createElement("style");
  s.textContent = `html,body{margin:0;height:100%;overflow:hidden;background:#000}
#uiback{position:fixed;inset:0}
#uiback.street{background:linear-gradient(#8cc4ec 0,#cfe6f4 46%,#7f8f6a 46.2%,#5f6b4c 70%,#4a4f45 100%)}
#uiback.sky{background:linear-gradient(#5aa7e6,#bfe2fb)}
#uiback.dark{background:radial-gradient(ellipse at 50% 60%,#2a3038,#0c0e11)}
#minimap,#compass{background:rgba(20,26,30,.55);border-radius:50%}
.ui-slot{position:fixed;border:2px dashed #ff3df0;pointer-events:none;z-index:50;box-sizing:border-box}
.ui-slot b{position:absolute;left:0;top:-18px;background:#ff3df0;color:#000;font:700 12px/16px system-ui,sans-serif;padding:0 5px;white-space:nowrap}`;
  document.head.appendChild(s);
  backdrop("street");
  street = $("where").textContent ?? "";
  base = new Set(drawables().filter(visible));
}

export function backdrop(kind: string) { $("uiback").className = kind; }

/** Take everything down, as if nothing were on. */
function clear() {
  clearInterval(hold);
  closeModals();
  noticeClear();
  MS.missionClear(); MS.missionCardDrop(); MS.missionResultDrop(); MS.missionWaiting(null); MS.missionWatching(null);
  document.querySelectorAll(".msc,#jobrecall,#reveal,.ui-copy,.ui-slot,#award,#trick").forEach((e) => e.remove());
  for (const id of ["clickhint", "usehint", "shoothint", "jobposter", "bunting", "banner", "scoreboard", "touch", "bigmap", "pubcard"]) { const e = document.getElementById(id); if (e) e.hidden = true; }
  $("feed").innerHTML = "";
  juice?.dispose(); juice = null;
  comboLine("ride", null); comboLine("flags", null);
  $("where").textContent = street;
  for (const k of ["loading", "version", "safe"]) systemNote(k, null);
  $("pubcard").classList.remove("held"); $("pubcardgo").hidden = false;
  $("hud").classList.remove("reveal"); document.body.classList.remove("reveal");
  $("scoreboard").classList.remove("join");
}

/** Call fn now and again every ms, for a piece that would otherwise go by itself. */
const keep = (fn: () => void, ms: number) => { fn(); hold = window.setInterval(fn, ms); };
/** A countdown going round 3, 2, 1, GO! for as long as it's up. */
const cycle = (fn: (n: number) => void) => { let k = 0; keep(() => fn([3, 2, 1, 0][k++ % 4]), 900); };
const feed = (html: string, kind?: "in" | "out") => people(html, kind);

const LONG = "Get every last one of the tourists' sandwiches back to the benches by the Abbey before the gulls work out where they went";
const ENTRIES = (o: { title: string; inIt: boolean; n: string[]; left: number; colour?: string; label?: string }) => {
  MS.missionWaiting({ kind: o.title, colour: o.colour, head: `Waiting for players<span class="dots"></span>`, count: o.left, sub: `${o.n.length} in: ${o.n.join(", ")}`,
    small: o.inIt ? "You're in" : `<b>${ctl("use")}</b> to join in` });
  MS.missionProgress({ id: "job", label: o.label ?? "Race", colour: o.colour ?? "#3ec7e8", goal: o.title,
    hint: o.inIt ? `<b class="clue">You're in</b> · starting in ${o.left} s` : `<b class="clue">Entries open</b>: <b>{use}</b> to join in · ${o.left} s`,
    sub: `${o.n.length} in: ${o.n.join(", ")}`, bar: 1 - o.left / 15 });
};

const STOPS: WS.PosterInfo["stops"] = [{ label: "the Hadley Arms", kind: "pub", now: false }, { label: "Firs Field", kind: "park", now: true }, { label: "the bus stop on Church Road", kind: "bus", now: false }];
// a ride's line as ridetricks.ts writes it; the Flag Lads' come from the game's own FlagJuice
const RIDE = { score: "1,240", mult: "×3", label: "kickflip + manual + rail grind 3.2 m", more: `<span class="bar"><span style="left:38%"></span></span>` };
const BESTS = (news: boolean) => `<small class="best">${news ? "New best! " : ""}Your bests on the skateboard: grind 6.1 m · air 1.4 m · combo 2,980</small>`;
const LANDED = (news: boolean) => ({ score: "2,980", mult: "×6", label: "ollie + 50-50 grind 6.1 m + manual", more: BESTS(news), cls: news ? "done new" : "done" });
const BAILED = { score: "Bailed", label: "1,240 lost", cls: "bail" };
/** Shoot n of the Flag Lads' flags in a row, the way the game does; trick: what you were riding. */
const flags = (n: number, o: { trick?: string; ago?: number; then?: "cleared" | "over" } = {}) => {
  const j = (juice = new FlagJuice(new THREE.Scene(), { ground: () => 0, solo: () => false })) as any;
  for (let k = 0; k < n; k++) j.flag(0, 0, 0, k === n - 1 ? o.trick ?? "" : "");
  if (o.then === "cleared") j.cleared(0, 0, 0);
  if (o.ago) { j.lastAt -= o.ago; j.tick(performance.now(), true); }
  if (o.then === "over") j.finish();
};

const panel = {
  gulls: () => MS.missionProgress({ id: "job", label: "Seagull Attack · ★★☆", colour: "#8fd0f0", goal: "Seagull Attack", progress: "Wave 2 / 5", bar: 5 / 9, hint: "Wave 2 of 5 · 6 gulls about", sub: "5 of 9 bites left · score 120 · chips ×1" }),
  bus: (bell = false) => MS.missionProgress({ id: "bus", label: "Badgerline · Route 2", colour: "#7fe08f", goal: "City centre",
    hint: `Next stop: <b>Church Road</b> · 250 m<br>3 waiting there${bell ? `<br><span class="sign">Bus stopping</span>` : ""}`, sub: "On board 4 · Fares 5 · Moans 1<br>“Cheers drive”" }),
  flags: (here = true) => { MS.missionStackReady(); show($("bunting"), `<div class="label">Flags up <b>27%</b><span class="downs">4 down</span></div><div class="bar"><div style="width:27%"></div></div>`
    + `<em>Pub takeover at <b>The Hadley Arms</b> · 400 m north · 2:40. Get there and clear them out</em>${here ? `<em>Shoot all <b>8</b> flags on <b>Church Road</b> to clear it</em>` : ""}`, true); },
};
const rewards = ["2 prizes where you finished", "New in your wardrobe: The gull hat", "Trophy! silver: Seagull Attack, two stars"];

const DRAW: Record<string, Record<string, () => void>> = {
  entries: {
    "Entries open": () => ENTRIES({ title: "BMX climb to Moorlands Recreation Playground", inIt: false, n: ["Ann", "Bo"], left: 11 }),
    "You're in": () => ENTRIES({ title: "Seagull Attack", label: "Seagull Attack", colour: "#8fd0f0", inIt: true, n: ["You", "Ann", "Bo", "Cy"], left: 6 }),
    "Lining up": () => MS.missionWaiting({ kind: "The Lock Run", colour: "#3a8fd8", head: `Lining up<span class="dots"></span>`, sub: "3 in: You, Ann, Bo" }),
    "Long title": () => ENTRIES({ title: "Daily race: trolley dash to the Kingsmead Square fountain and back round the Abbey", inIt: false, n: ["Ann", "Bo", "Cy", "Dee", "Ed", "Flo"], left: 3 }),
  },
  count: {
    "Gathering (others about)": () => ENTRIES({ title: "The Lock Run", label: "The Lock Run", colour: "#3a8fd8", inIt: true, n: ["You", "Ann"], left: 9 }),
    "Race lights 3": () => cycle((n) => MS.missionCountdown(n, "#3ec7e8", MS.countdownFor("race", 3))),
    "Timed plain 3": () => cycle((n) => MS.missionCountdown(n, "#3a8fd8", MS.countdownFor("timed", 3))),
    "Solo timed (no countdown)": () => MS.missionBegin({ label: "The Lock Run", colour: "#3a8fd8", title: "The Lock Run", goal: "No countdown: the clock starts when you move", detail: "At Bath Locks" }),
    "Calm (none)": () => MS.missionBegin({ label: "Art Gallery", colour: "#e0a8d8", title: "Paint the Show", goal: "No countdown, calm: straight in", detail: "At the Holburne" }),
  },
  guide: {
    Instruction: () => keep(() => guide("Chocked at the stop: go and sell the tickets at the front door"), 25000),
    "With key caps": () => keep(() => guide("A car coming down. Pull in: {strafeleft}"), 25000),
    "Under the use prompt": () => { usePrompt("<b>{use}</b> Get in the Badgerline bus"); keep(() => guide("Your bus is here. {use} to get on"), 25000); },
    "Long instruction": () => keep(() => guide("In the cab: only you can see how fast it's going and what's coming, so call it out. {steer} steer, {handbrake} handbrake"), 25000),
    "The examiner": () => keep(() => guide("Mr Pratt: “Next left, please. When it's safe. Which it is now.”"), 25000),
  },
  news: {
    "A kill": () => keep(() => news("You splatted Ann"), 25000),
    "A pickup": () => keep(() => news("+25 rifle rounds"), 25000),
    "The speed trap": () => keep(() => news("Speed trap, Ralph Allen Drive: 30 mph, a best (was 25)"), 25000),
    Arriving: () => keep(() => news("Arrived at Bath"), 25000),
    "Long (wraps smaller)": () => keep(() => news("The Flag Lads have taken over The Hadley Arms! Follow the purple marker and clear them out"), 25000),
    "A critic's remark": () => keep(() => news("Lady Tilly on Ann's: “Bold. Wrong, but bold.” 4/10"), 25000),
  },
  stage: {
    Wave: () => keep(() => MS.missionCall({ text: "Wave 2 of 5: Hoverers", sub: "Hoverers: stare them out · 3 hoverers, in from the north-east", colour: "#8fd0f0" }), 25000),
    "Checkpoint split": () => keep(() => MS.missionCall({ text: "Checkpoint 2 of 4", sub: "0:41.2 (-1.3 on your best) · -0.8 s on gold pace · +20 s", went: "well" }), 25000),
    "Life lost": () => keep(() => MS.missionCall({ text: "A life gone!", sub: "Ann fell", went: "badly" }), 25000),
    "Out of lives": () => keep(() => MS.missionCall({ text: "Out of lives", sub: "Back to the bottom: the whole team starts again · 3 lives for the next go", went: "badly" }), 25000),
    "He got away": () => keep(() => MS.missionCall({ text: "He got away!", sub: "2 goes left. He's off to Firs Field: he's on your map", colour: "#e04848" }), 25000),
  },
  score: {
    "Bunting down": () => keep(() => score({ text: "Bunting down! +400" }), 25000),
    "Trick shot": () => keep(() => score({ text: "Trick shot! +150", sub: "from a skateboard" }), 25000),
    Boost: () => keep(() => score({ text: "BOOST!" }), 25000),
    Barged: () => keep(() => score({ text: "Barged Bo off!" }), 25000),
    "Combo over": () => keep(() => score({ text: "Combo over: 7 shots, 1840 points", final: true }), 25000),
  },
  reward: {
    "Trophy: gold": () => reward({ kicker: "Trophy! gold", text: "Top of the Abbey", sub: "Climb Bath Abbey and put on the wings at the top", grade: "gold" }),
    "Trophy: silver": () => reward({ kicker: "Trophy! silver", text: "Seagull Attack, two stars", sub: "8 of 83 trophies", grade: "silver" }),
    "Wardrobe item: Deerstalker": () => reward({ kicker: "New in your wardrobe", text: "Deerstalker", pic: itemPicture("deer") }),
    "Wardrobe item: Traffic cone": () => reward({ kicker: "New in your wardrobe", text: "Traffic cone", pic: itemPicture("cone") }),
    "On the result card": () => { MS.missionResult({ result: "won", label: "Wanted", title: "Cuffed!", lead: "4:12", medal: "★★★", lines: ["The Duke of Disorder is off the streets"], colour: "#e04848", sound: null }); reward({ kicker: "New in your wardrobe", text: "Deerstalker", pic: itemPicture("deer") }); reward({ kicker: "Trophy! gold", text: "Long Arm of the Law", grade: "gold" }); },
  },
  people: {
    "Three lines": () => { feed(`${named("Ann", "#ffd84a")} took on a job: ${named("Seagull Attack", "#8fd0f0")}`); feed(`${named("The Hadley Arms")} won back from the Flag Lads`); feed(`Bo fell: the team's down to 2 lives`); },
    "Someone joined": () => feed(`${named("Cy", "#7fe08f")} joined the game`, "in"),
    "Someone left": () => feed(`${named("Dee", "#ff8ab8")} left the game`, "out"),
    "A busy minute": () => { feed(`${named("Cy", "#7fe08f")} joined the game`, "in"); feed(`${named("Ann", "#ffd84a")} splatted ${named("Bo")}`); feed(`You earned ${named("Deerstalker")} for your wardrobe (pause menu)`); feed(`${named("Bo")} marked the Hadley Arms`); feed(`${named("Dee", "#ff8ab8")} left the game`, "out"); },
  },
  combo: {
    Ride: () => comboLine("ride", RIDE),
    "Ride: landed": () => comboLine("ride", LANDED(false)),
    "Ride: new best": () => comboLine("ride", LANDED(true)),
    "Ride: bailed": () => comboLine("ride", BAILED),
    "Flags ×2": () => flags(2),
    "Flags ×7": () => flags(7),
    "Flags: running out": () => flags(5, { ago: 3000 }),
    "Flags: cluster cleared": () => flags(3, { then: "cleared" }),
    "Flags: combo over": () => flags(6, { then: "over" }),
    "Both chained": () => { comboLine("ride", RIDE); flags(4, { trick: "a skateboard" }); },
    "Both: bailed, flags still going": () => { flags(4); comboLine("ride", BAILED); },
  },
  mprog: {
    "Seagull Attack": panel.gulls,
    Race: () => MS.missionProgress({ id: "job", label: "Race · ★★☆", colour: "#3ec7e8", goal: "BMX climb to Moorlands Recreation Playground", progress: "2 / 4", bar: 0.5, timer: "0:45.2", hint: "120 m to <b>Checkpoint 3/4</b>, north-west", sub: "Gold 1:20 · silver 1:35 · bronze 1:50" }),
    Wanted: () => MS.missionProgress({ id: "job", label: "Wanted · ★★☆", colour: "#e04848", goal: "Wanted: the Duke of Disorder", bar: 0.8, timer: "12:03 left", hint: "He's at <b>the Hadley Arms</b>, 200 m north. Get close and he'll run", sub: "Goes left ●●○ · then Firs Field · poster: {job}" }),
    "Challenge, with lives": () => MS.missionProgress({ id: "job", label: "Challenge · ★★★", colour: "#e9e1cf", goal: "The Climb", progress: "Ledge 2 / 6", bar: 2 / 6, hint: `${MS.hearts(2, 3)} Get everyone to the top together`, sub: "Climbers: 3 · Ann on the rope" }),
    Bonfire: () => MS.missionProgress({ id: "bonfire", label: "Bonfire", colour: "#ff9a3c", goal: "Build the bonfire", progress: "7 / 25", bar: 7 / 25, hint: "Carrying wood: take it to the pile" }),
    "Bus driver": () => panel.bus(),
    "Bus stopping": () => panel.bus(true),
    "Shoot-out": () => MS.missionProgress({ id: "shootout", label: "Shoot-out", colour: "#58e06a", goal: "Ann 3 – 2 Bo", hint: "Ann to kick: 4 of 5" }),
    "Flash (just changed)": () => { MS.missionProgress({ id: "job", label: "Challenge · ★★★", colour: "#3a8fd8", goal: "The Lock Run", progress: "1 / 5", bar: 0.2, hint: "Shut the top gates", flash: "a" }); MS.missionProgress({ id: "job", label: "Challenge · ★★★", colour: "#3a8fd8", goal: "The Lock Run", progress: "1 / 5", bar: 0.2, hint: "Open the bottom paddles ({use})", flash: "b" }); },
    "Long text": () => MS.missionProgress({ id: "job", label: "Challenge · ★★★", colour: "#f2c318", goal: "Push the Bus all the way up Horsecombe Vale", progress: "37%", bar: 0.37, hint: "{use} at the back to push, then {heave} on every HEAVE! · 3 pushing · Bea in the cab · you call", sub: "Time it to the bar. Miss the heaves and you'll tire, and it rolls back. A naughty boy's on the roof: shoot him off" }),
  },
  stack: {
    "Job, bus and Flag Lads": () => { panel.gulls(); panel.bus(); panel.flags(false); },
    "Job and Flag Lads": () => { panel.gulls(); panel.flags(); },
    "Flag Lads alone": () => panel.flags(),
  },
  aux: {
    "Gate clock": () => MS.missionAux("race-gate", `<div class="aux-big">0:24</div><div class="aux-tag">CHECKPOINT 3</div>`),
    "Gate clock, running out": () => MS.missionAux("race-gate", `<div class="aux-big" style="color:#ff5a4e">0:07.4</div><div class="aux-tag">CHECKPOINT 3</div>`),
    "Push the Bus beat": () => MS.missionAux("push-beat", `<div class="aux-word">Ann calls</div><div class="aux-big" style="color:#f2c318">Heave!</div>`
      + `<div class="aux-meter"><i style="left:30%;width:40%;background:#ff8a3a;opacity:.75"></i><i style="left:40%;width:20%;background:#f2c318"></i><i style="left:46%;width:8%;background:#4dff8e"></i><i style="left:49%;width:6px;background:#fff"></i></div>`, "#f2c318"),
    "Push the Bus cab": () => MS.missionAux("push-cab", `<div class="aux-panel"><div class="aux-big" style="font-size:26px;color:#ff9a8a">▼ ROLLING BACK 2.1 m/s</div><div class="aux-tag">Handbrake off · ${ctlText("{handbrake}")} to hold it</div>`
      + `<div class="aux-meter" style="margin:6px 0 2px"><i style="width:45%;background:#ffb21f"></i></div><div class="aux-word" style="color:#fff">A car coming down, 80 m</div></div>`, "#f2c318"),
    "Climb grip": () => MS.missionAux("climb-grip", `<div class="aux-meter thin"><i style="width:30%;background:#e9e1cf"></i><i style="left:auto;right:0;width:15%;background:rgba(160,40,30,.7)"></i></div>`),
  },
  banner: {
    "Going up": () => show($("banner"), `<div class="label">Banner going up at <b>The Hadley Arms</b> · 2 on the ladder</div><div class="bar"><div style="width:40%"></div></div><em>Shoot the lads on the ladder to knock it back</em>`, true),
    "Nearly up": () => { show($("banner"), `<div class="label">Banner going up at <b>The Hadley Arms</b> · 2 on the ladder</div><div class="bar"><div style="width:82%"></div></div><em>Nearly up! Shoot the lads on the ladder to knock it back</em>`, true); $("banner").classList.add("late"); },
  },
  spec: { Standings: () => MS.missionWatching({ head: "Finished", sub: "2nd, 1:23.4", small: "Watching Bo · ◀ ▶ to switch", rows: [{ name: "Ann", time: "1:20.1" }, { name: "You", time: "1:23.4", me: true }, { name: "Bo", time: "riding", watch: true }], many: true }) },
  slots: {
    Desktop: () => slotMap(false),
    Touch: () => slotMap(true),
  },
  use: {
    "Take the job": () => usePrompt("<b>{use}</b> Take the job"),
    Challenge: () => usePrompt("<b>{use}</b> The Lock Run"),
    Busy: () => usePrompt("Finish or call off your job first"),
    "Get in": () => usePrompt("<b>{use}</b> Get in the Badgerline bus"),
    Riding: () => usePrompt("Riding in the Badgerline bus · <b>{use}</b> to get out"),
    "Job's own": () => usePrompt("<b>{use}</b> Shout at the gulls"),
    "Touch key cap": () => { $("touch").hidden = false; usePrompt("<b>{use}</b> Take the job"); $("usehint").classList.add("touch"); $("usehint").querySelector("kbd")!.textContent = "Use"; },
    "Keeper (shoot-out)": () => show($("shoothint"), keycaps("You're in goal: hold {steer} to one side and press {dive} to dive"), true),
  },
  brief: {
    "Board: job": () => brief("board", { ...GULLS, foot: "<b>{use}</b> Take the job" }),
    "Board: challenge": () => brief("board", { label: "Challenge · ★★★", colour: "#3a8fd8", title: "The Lock Run", blurb: "Take the boat down the flight with its barrels, working the paddles and gates as you go.", reward: "Something strange, left where you finish", foot: "<b>{use}</b> Start it" }),
    "Board: done today": () => brief("board", { label: "Race · ★★☆", colour: "#3ec7e8", title: "BMX climb to Moorlands Recreation Playground", blurb: "Up the hill on a BMX, through every checkpoint.", reward: "A traffic cone for your head", foot: "Done today" }),
    "Board: touch": () => { $("touch").hidden = false; brief("board", { ...GULLS, foot: "<b>{use}</b> Take the job" }, true); },
    "Title card: Job": () => MS.missionBegin({ label: GULLS.label, colour: GULLS.colour, title: GULLS.title, goal: "Keep the sandwiches out of the gulls' beaks for 5 waves", detail: "At Firs Field", reward: GULLS.reward }),
    "Title card: Long goal": () => MS.missionBegin({ label: "Seagull Attack", colour: "#8fd0f0", title: "Seagull Attack: the hen do", goal: LONG, detail: "At the benches by the Abbey" }),
    "Title card: Race": () => MS.missionBegin({ label: "Race", colour: "#3ec7e8", title: "BMX climb to Moorlands Recreation Playground", goal: "Race through every checkpoint and over the line first", detail: "3 in: You, Ann, Bo", best: "silver" }),
    "Title card: Wanted": () => MS.missionBegin({ label: "Wanted", colour: "#e04848", title: "Wanted: the Duke of Disorder", goal: "Catch him and cuff him. Lose him three times and he's gone", detail: "At the Hadley Arms" }),
    "Title card: Challenge, with a best": () => MS.missionBegin({ label: "Challenge", colour: "#3a8fd8", title: "The Lock Run", goal: "Take the boat down the flight with its barrels", detail: "At Bath Locks", best: "4 barrels" }),
    "Title card: Bonfire": () => MS.missionBegin({ title: "Get Wood", goal: "Build Kingswood's bonfire: 25 bundles on the pile", detail: "Carry them down to the court, then walk up to the pile", label: "Bonfire", colour: "#ff9a3c" }),
    "Title card: Bus driver": () => MS.missionBegin({ label: "Badgerline · Route 2", colour: "#7fe08f", title: "You're on the 2", goal: "the bus station to Combe Down and back. Follow the green line, and stop for anyone waiting" }),
    "Title card: Pub takeover": () => MS.missionBegin({ label: "Pub takeover", colour: "#b45cff", title: "The Flag Lads have taken over The Hadley Arms!", goal: "Follow the purple marker and clear them out" }),
    "Title card: Shoot-out": () => MS.missionBegin({ label: "Shoot-out", colour: "#58e06a", title: "Shoot-out!", goal: "Five kicks each. You kick first" }),
    "Title card: Long, two-line title": () => MS.missionBegin({ label: "Challenge", colour: "#f2c318", title: "Push the Bus all the way up Horsecombe Vale", goal: "Push the bus to the top of the hill: {use} at its back, then {heave} on every HEAVE! Miss the heaves and it rolls back", detail: "At the bottom of Horsecombe Vale" }),
    "Recall (J)": () => { panel.gulls(); brief("recall", { ...GULLS, live: `<b>Wave 2 / 5</b> · 6 gulls about<br>5 of 9 bites left · score 120<div class="bar"><i style="width:56%"></i></div>`, foot: "<b>{job}</b> Put it away" }); },
    "Recall: Wanted": () => brief("recall", { label: "Wanted · ★★☆", colour: "#e04848", title: "Wanted: the Duke of Disorder", blurb: "Runs with a rugby team gone rogue. Does the rounds of a pub, then a park or square, then a bus stop.",
      block: WS.wantedBlock({ title: "", stops: STOPS, goes: { left: 2, of: 3 } }, ["<b>He's on your map.</b> Get close and he legs it: he's quicker than you, but soon out of puff.", "<b>Catch him and cuff him</b> (<b>{use}</b>). A paintball hit winds him.", "<b>Three goes.</b> Fall too far behind and he's off to his next stop."]),
      live: `He's at <b>the Hadley Arms</b> · <b>12:03</b> left`, reward: "2 prizes and a skateboard", foot: "<b>{job}</b> Put it away" }),
  },
  result: {
    "Job done, with rewards": () => MS.missionResult({ result: "won", label: "Seagull Attack", title: "Seagulls seen off!", lead: "340", medal: "★★☆", lines: ["7 of 9 bites saved"], colour: "#8fd0f0", rewards, sound: null }),
    "Job failed": () => MS.missionResult({ result: "lost", label: "Push the Bus", title: "It got away from you", lines: ["Back down Horsecombe Vale and smashed into a car"], colour: "#f2c318", sound: null, retry: () => {} }),
    "Called off": () => MS.missionResult({ result: "lost", label: "The Lock Run", title: "Job called off", lines: ["Ann called it off"], colour: "#3a8fd8", sound: null }),
    "Race: gold": () => MS.missionResult({ result: "won", kind: "race", label: "BMX climb to Moorlands Recreation Playground", title: "Winner!", place: 1, lead: "1:18.6", medal: "Gold medal", lines: ["1.4 s inside gold"], best: "NEW BEST! 2.1 s quicker",
      stats: [{ k: "Top speed", v: "31 mph" }, { k: "Boosts", v: "3" }], rows: [{ name: "You", time: "1:18.6", me: true }, { name: "Ann", time: "1:22.0" }, { name: "Bo", time: "–", dnf: true }],
      rewards: ["A traffic cone for your head", "2 prizes at the finish", "Gold in your trophy cabinet"], colour: "#3ec7e8", again: () => {}, sound: null }),
    "Race: did not finish": () => MS.missionResult({ result: "lost", kind: "race", label: "Trolley dash to The Porter", title: "Out of time", lead: "2:30.0", medal: "No medal", lines: ["Checkpoint 3 of 5 · 60% of the route"], stats: [{ k: "Checkpoints", v: "2/5" }], colour: "#3ec7e8", again: () => {}, sound: null }),
    "Wanted: cuffed": () => MS.missionResult({ result: "won", kind: "wanted", label: "Wanted · the Duke of Disorder", title: "Cuffed!", lead: "6:12", medal: "Caught", lines: ["You cuffed him first go"], stats: [{ k: "Goes left", v: "3/3" }, { k: "Stars", v: "★★" }], rewards: ["2 prizes and a pogo stick"], colour: "#e04848", sound: null }),
    "Wanted: got away": () => MS.missionResult({ result: "lost", kind: "wanted", label: "Wanted · the Duke of Disorder", title: "He got away", lead: "15:00", medal: "Escaped", lines: ["He slipped away for good"], stats: [{ k: "Goes left", v: "0/3" }], colour: "#e04848", sound: null }),
    "Bonfire built": () => MS.missionResult({ result: "won", label: "Bonfire", title: "Bonfire built!", colour: "#ff9a3c", lines: ["Kingswood's bonfire is ready", "It's lit at dark"], sound: null }),
    "Shift over": () => MS.missionResult({ result: "over", kind: "bus", label: "Badgerline · Route 2", title: "Shift over", colour: "#7fe08f", lines: [`5 fares, 2 "cheers drive", 1 moan`], sound: null }),
    "Pub won back": () => MS.missionResult({ result: "won", label: "Pub takeover", title: "The Hadley Arms is won back!", colour: "#58e06a", lines: ["Flags down, everyone welcome.", "There's a ride outside, and the odd round on the house"], sound: null }),
    "Town safe": () => MS.missionResult({ result: "won", label: "The Flag Lads", title: "Bath is safe from the Flag Lads", colour: "#58e06a", lines: ["Not a flag left on a lamp post.", "They won't be back for 3 days."], sound: null }),
    "Long title": () => MS.missionResult({ result: "won", kind: "challenge", label: "The Climb", title: "The whole team stood on top of the crag together, every one of them", lines: ["Three lives to spare, and nobody carried up the last ledge"], rewards: ["Something strange, left where you finished"], colour: "#e9e1cf", sound: null }),
  },
  variants: {
    "Driving test: pass": () => MS.missionSheet({ kind: "Driving test report · test 1 of 3", title: "The Driving Test", who: "Candidate: You · Examiner: Mr Pratt", stamp: "PASS", good: true, sections: [{ head: "Minor faults: 2", lines: ["Too far from the kerb", "Late signal"] }, { head: "Serious", lines: [] }, { head: "Dangerous", lines: [] }], foot: "Two minors. Well driven.", sound: null }),
    "Driving test: fail": () => MS.missionSheet({ kind: "Driving test report · test 2 of 3", title: "The Driving Test", who: "Candidate: Ann · Examiner: Mr Pratt", stamp: "FAIL", good: false, sections: [{ head: "Minor faults: 4", lines: ["Too far from the kerb", "Late signal", "Hesitation", "Mirrors"] }, { head: "Serious", lines: ["Went through a red light"] }, { head: "Dangerous", lines: ["The examiner had to brake"] }], sound: null }),
    "Night out front page": () => MS.missionNight({ pub: "The Hadley Arms", head: "Whole room makes last orders at the Hadley", stand: "Six regulars, one stolen bus and a gull with a chip", by: "By our chief reporter",
      body: ["They came from all over Bath for one for the road, and the landlord says he has never seen the like.", "Ann won the race there by a length; Bo came in on the back of a milk float."], items: [{ head: "Weather", text: "Bright spells, flags drooping" }, { head: "Seagulls", text: "Restless" }, { head: "Lost", text: "One sandwich" }] }),
    "Gallery verdict": () => MS.missionResult({ result: "won", kind: "arts", variant: "verdict", label: "The Art Gallery · private view", title: "A triumph, darling", colour: "#c2185b", lead: "7.2", medal: "needed 6.0", sound: null,
      body: `<div class="cols"><div><h4>Mr Pettigrew</h4>8 · “Bold. Possibly a dog.”</div><div><h4>Lady Stanhope</h4>7 · “I have seen worse in Bristol.”</div><div><h4>The punters</h4>6.5 · “Is it for sale?”</div></div>` }),
  },
  chron: {
    "On joining": () => paper(true),
    "Tab: league table": () => {
      paper(false);
      $("roominfo").textContent = "Practice · Bath · 3 here";
      $("scores").innerHTML = [["Ann", 12, 3, 4], ["You", 9, 5, 2], ["Bo", 4, 9, 7]].map(([n, k, d, c]) => `<tr class="${n === "You" ? "me" : ""}"><td>${n}</td><td>${k}</td><td>${d}</td><td>${c}</td></tr>`).join("");
    },
  },
  mapcard: {
    "Pub card": () => mapUp(() => { $("pubcardname").textContent = "The Hadley Arms"; $("pubcardinfo").textContent = "0.4 km · food hygiene 5"; $("pubcardwhy").hidden = true; const c = $("pubcard"); c.hidden = false; Object.assign(c.style, { left: "40%", top: "36%" }); }),
    "Pub card, held up": () => mapUp(() => { $("pubcardname").textContent = "The Hadley Arms"; $("pubcardinfo").textContent = "0.4 km · food hygiene 5"; const w = $("pubcardwhy"); w.textContent = "Something hostile is after you"; w.hidden = false; $("pubcardgo").hidden = true; const c = $("pubcard"); c.classList.add("held"); c.hidden = false; Object.assign(c.style, { left: "40%", top: "36%" }); }),
    "Key note": () => mapUp(() => { const t = document.createElement("div"); t.id = "keytip"; t.className = "ttmini ui-copy"; t.textContent = "Team challenges: open as the zones do"; Object.assign(t.style, { left: "30%", top: "30%" }); document.body.appendChild(t); }),
  },
  system: {
    "Map stuck loading": () => systemNote("loading", { text: "Still waiting for 3 squares of the map (nothing new for 41 s).\nCouldn't load 2 times, last: 5_7.json\nbuild 2026-11-04 abc123", close: () => {} }),
    "Another version": () => systemNote("version", { text: "Ann is on a newer version of the game (tap to refresh)", tone: "warn", tap: () => {} }),
    "Older version": () => systemNote("version", { text: "Bo is on an older version: some things will look different to them (tap to hide)", tone: "alert", tap: () => {} }),
    "Safe graphics": () => systemNote("safe", { text: "Your device crashed last time, so the game is in safe graphics; you can change it in Settings.", close: () => {} }),
  },
  reveal: {
    "New zone": () => revealCard({ kind: "spot", x: 0, z: 0, kicker: "A new part of the map is open", title: "Widcombe", sub: "New challenge: Bell Ringing", lines: ["The buses run out this way now"] }),
    "Whole map": () => revealCard({ kind: "map", x: 0, z: 0, kicker: "Every zone is open", title: "The whole map is yours" }),
  },
  revealload: {
    "Loading, on a loop": () => revealLoading(),
  },
};

/** The Chronicle on #scoreboard: on joining, or under Tab with the league table on top. */
function paper(join: boolean) {
  const d = new Daily(() => {}, () => `<b>The Flag Lads</b> have flagged <b>21%</b> of Bath.`, () => "Bath", () => ({ kicker: "News from Bath", no: 1, strap: "Flag Lads arrive in Bath", lead: "<p>A van full of cable ties was seen at dawn. By breakfast there were flags on the lamp posts.</p>", side: "<h4>How to help</h4><p>Shoot the flags off the lamp posts.</p>", small: "" } as any));
  const b = $("scoreboard"); b.hidden = false; b.classList.toggle("join", join); d.draw($("daily"));
}
/** The big map open over a plain ground, for its cards. */
function mapUp(then: () => void) {
  $("bigmap").hidden = false;
  const c = $("bigmapcanvas") as HTMLCanvasElement; c.width = c.height = 600;
  const g = c.getContext("2d")!; g.fillStyle = "#b7c49a"; g.fillRect(0, 0, 600, 600); g.strokeStyle = "#f4f0e2"; g.lineWidth = 6;
  for (let k = 0; k < 12; k++) { g.beginPath(); g.moveTo(k * 60, 0); g.lineTo(k * 60 - 200, 600); g.stroke(); }
  then();
}

const GULLS = { label: "Seagull Attack · ★★☆", colour: "#8fd0f0", title: "Seagull Attack: Chip Tuesday", blurb: "Tourists on the benches with their sandwiches, and the gulls of Bath want them. Five waves, then Big Lad himself.", reward: "2 prizes, and a seagull for your head for three stars" };
/** A brief as quests.ts puts it up: on the board (in #jobposter) or brought back with J. */
function brief(at: "board" | "recall", b: Brief, touch = false) {
  let el = at === "board" ? $("jobposter") : document.getElementById("jobrecall");
  if (!el) { el = document.createElement("div"); el.id = "jobrecall"; $("hud").appendChild(el); }
  briefCut(el, b.colour);
  el.classList.toggle("touch", touch);
  el.innerHTML = briefHtml(at, b);
  if (touch) el.querySelectorAll("kbd[data-ctl]").forEach((k) => { k.textContent = "Use"; });
  el.hidden = false;
}
/** The loading screen as the game draws it, with pretend loading: the bars fill over a few
 *  seconds, the cymbal, the cover lifts off the card, then round again. */
function revealLoading() {
  const r = new Reveal(null as never, null as never, () => false) as any;
  r.card({ kind: "spot", x: 0, z: 0, kicker: "A new part of the map is open", title: "Widcombe", sub: "New challenge: Bell Ringing" });
  const el = document.getElementById("reveal")!, veil = el.querySelector<HTMLElement>(".rvveil")!;
  const t0 = performance.now(), LOAD = 3500, LIFT = 450, LOOP = 6000;
  let hit = -1;
  keep(() => {
    const t = (performance.now() - t0) % LOOP, round = Math.floor((performance.now() - t0) / LOOP);
    if (t < LOAD) {
      veil.classList.remove("rvhit"); el.classList.remove("shown");
      // in fits and starts, as squares come in
      loadingLook(veil, Math.floor((t / LOAD) * 7) / 7);
      veil.style.opacity = "1";
    } else {
      if (hit !== round) { hit = round; loadingLook(veil, 1); loadingHit(veil); }
      veil.style.opacity = String(Math.max(0, 1 - (t - LOAD) / LIFT));
      el.classList.toggle("shown", t > LOAD + LIFT);
    }
  }, 30);
}

function revealCard(s: Shot) {
  const r = new Reveal(null as never, null as never, () => false) as any;
  r.card(s);
  document.getElementById("reveal")?.classList.add("shown");
}

/** Everything that stays up, at once, with each slot outlined and named: the layout's map. */
function slotMap(touch: boolean) {
  if (touch) $("touch").hidden = false;
  $("where").textContent = "Church Road";
  panel.gulls(); panel.bus(); panel.flags(false);
  feed(`Ann took on a job: ${named("Seagull Attack")}`); feed("Bo fell: the team's down to 2 lives");
  usePrompt("<b>{use}</b> Get in the Badgerline bus");
  MS.missionAux("race-gate", `<div class="aux-big">0:24</div><div class="aux-tag">CHECKPOINT 3</div>`);
  news("You splatted Ann");
  guide("Pull in: {strafeleft}");
  score({ text: "Bunting down! +400" });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const out = (id: string, name: string) => {
      const el = document.getElementById(id);
      if (!el || el.hidden) return;
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      const b = document.createElement("div");
      b.className = "ui-slot";
      Object.assign(b.style, { left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` });
      b.innerHTML = `<b>${name}</b>`;
      document.body.appendChild(b);
    };
    out("mstack", "top left: mission panels + Flag Lads row");
    out("minimap", "top right: minimap");
    out("feed", "feed");
    out("trick", "score");
    out("health", "bottom left: health");
    out("ammo", "bottom right: rounds / vehicle");
    out("where", "street name");
    out("usehint", "use prompt");
    out("maux", "meter slot");
    out("toast", "news");
    out("guide", "guidance");
  }));
}

/** What's on the page that counts as drawn: the HUD's own top-level pieces, the slots' rows, and
 *  anything put on the page itself (a card, the system strip). */
const drawables = () => [...document.querySelectorAll<HTMLElement>("#hud > *, #maux > *, #mstack > *, #lstack > *, body > *:not(#uiback):not(#hud):not(script):not(style)")];
const visible = (e: HTMLElement) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && e.getBoundingClientRect().width > 1;
let base = new Set<HTMLElement>();

/** Where the drawn piece is on the screen: the box round everything that wasn't up before it, so the
 *  catalogue can show just that part. */
export function bbox() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of drawables()) {
    if (base.has(e) || !visible(e) || e.id === "maux" || e.id === "mstack" || e.id === "lstack") continue;
    const r = e.getBoundingClientRect();
    x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Draw piece id in state (its first, if not given). */
export function draw(id: string, state: string) {
  clear();
  // a phone-sized stage has the touch layout, as a phone would
  if (innerWidth < 900) $("touch").hidden = false;
  const p = DRAW[id];
  if (!p) return;
  (p[state] ?? Object.values(p)[0])();
}

export const states = (id: string) => Object.keys(DRAW[id] ?? {});
