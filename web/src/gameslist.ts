// The games list: every team challenge on this map and every kind of job, on a page of their own,
// for trying the minigames out one after another without getting to each first. Pick one and you,
// and everyone in your room, are put at its start, wherever its zone is and whether or not it's been
// done today, and it starts the way it always does (lineup.ts). When it's over the list comes back.
//
// It isn't for players, so it stays out of sight until it's unlocked on a device with ?games= and
// the right word (only its SHA-256 is here), which is remembered there; ?games=0 forgets it. With
// no server it can only be hidden, not locked.
//
// Who decides what: a job or a challenge picked here goes round as any job taken from a noticeboard
// does ("start" in quests.ts's "qe"), with everyone already entered and "gl" set to say it came from
// the list, so every screen takes the zones' wall down for it till it's over. The pub takeover isn't
// a job: picking it sends "gl" with the pub, every screen with "u" set (the sender has the list)
// puts its player outside that pub, and the host has the Flag Lads take it. Older pages ignore "gl".
import type { Game } from "./game";
import { allChallenges, challengeOffer, challengesOn } from "./challenges";
import { clearSpot } from "./haunts";
import { esc } from "./hudkit";
import { ring } from "./lineup";
import { modal, modalClicked, modalUp } from "./modal";
import { hash, jobKinds, type QuestWorld } from "./quests";
import { PAGE, ttBar, ttTitle } from "./teletext";

const KEY = "cd-games";
const WORD = "c1c74ad4c8fbb4cc8567d2225bd604857afbb36f5581e150f1041c1afee9c021";
const START_WAIT = 20000;   // ms a pick waits for its place to load, or for its game to show up
const AFTER_PUB = 5000;     // ms the takeover's result card has before the list comes back

let unlocked = (() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })();
const onUnlock: (() => void)[] = [];

export const gamesUnlocked = () => unlocked;
/** Run fn now and whenever the list is unlocked or locked again. */
export function whenGames(fn: () => void) { onUnlock.push(fn); fn(); }

function keep(on: boolean) {
  unlocked = on;
  try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* storage may be blocked */ }
  for (const fn of onUnlock) fn();
}

// the word comes off the address straight away, so it isn't left in an invite link or the history
{
  const params = new URLSearchParams(location.search), word = params.get("games");
  if (word !== null) {
    params.delete("games");
    const q = params.toString();
    history.replaceState(history.state, "", location.pathname + (q ? `?${q}` : "") + location.hash);
    if (word === "0") keep(false);
    else void (async () => {
      try {
        const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(word));
        if ([...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("") === WORD) keep(true);
      } catch { /* no crypto.subtle off https */ }
    })();
  }
}

interface Hooks { game: () => Game | null; play: () => void }
let hooks: Hooks | null = null;
/** main.ts: how to find the game, and how to get back into it (the mouse captured) once one's picked. */
export function useGames(h: Hooks) {
  hooks = h;
  setInterval(tick, 500);
}

interface Entry { id: string; name: string; kind: "challenge" | "job" | "pub"; note?: string }

function entries(g: Game): { head: string; list: Entry[] }[] {
  const map = g.quests.world.map, placed = challengesOn(map);
  const here = new Set(placed.map((p) => p.c.id));
  const order = (id: string) => { const k = placed.findIndex((p) => p.c.id === id); return k < 0 ? Infinity : k; };
  const challenges = [...allChallenges()].sort((a, b) => order(a.id) - order(b.id) || a.name.localeCompare(b.name)).map((c): Entry => ({
    id: c.id, name: c.name, kind: "challenge", note: here.has(c.id) ? undefined : "not placed on this map",
  }));
  const jobs = jobKinds().filter((k) => !k.challenge).map((k): Entry => ({ id: k.id, name: k.label, kind: "job" }));
  jobs.push({ id: "takeover", name: "Pub takeover", kind: "pub", note: g.invasion.on ? undefined : "no Flag Lads on this map" });
  return [{ head: "Team challenges", list: challenges }, { head: "Jobs", list: jobs }];
}

// ---- the page ----------------------------------------------------------------------------------------

let page: HTMLDivElement | null = null;

/** Put the list up over the game (or over the pause menu). */
export function openGames() {
  const g = hooks?.game();
  if (!g || !unlocked || page) return;
  g.active = false;
  page = document.createElement("div");
  page.id = "games";
  page.className = "overlay";
  let n = PAGE.games;
  const sections = entries(g).map((s) => `<h3>${esc(s.head)}</h3>` + s.list.map((e) =>
    `<button type="button" class="settingsbtn gamepick" data-page="${++n}" data-id="${esc(e.id)}"${e.note ? " disabled" : ""}>`
    + `${esc(e.name)}${e.note ? `<small>${esc(e.note)}</small>` : ""}</button>`).join("")).join("");
  page.innerHTML = `<div class="card tt gamescard">
    ${ttBar(PAGE.games)}${ttTitle("Games")}
    <div class="gameslist">${sections}</div>
    <div class="pubbar"><p class="hint">Everyone in the game comes too</p><button type="button" class="gamesback">Back</button></div>
  </div>`;
  document.body.appendChild(page);
  const card = page.querySelector<HTMLElement>(".gamescard")!;
  const all = [...page.querySelectorAll<HTMLButtonElement>(".gamepick")];
  for (const b of all) b.onclick = () => {
    const list = entries(g).flatMap((s) => s.list), e = list.find((o) => o.id === b.dataset.id);
    if (e) pick(e);
  };
  page.querySelector<HTMLButtonElement>(".gamesback")!.onclick = () => { shut(); modalClicked(); };
  // the touch controls underneath mustn't see a tap on the page
  page.addEventListener("pointerdown", (e) => e.stopPropagation());
  page.addEventListener("keydown", (e) => {
    if (e.code !== "ArrowDown" && e.code !== "ArrowUp") return;
    const live = [...page!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const k = live.indexOf(document.activeElement as HTMLButtonElement);
    live[(k + (e.code === "ArrowDown" ? 1 : live.length - 1)) % live.length]?.focus();
    e.preventDefault();
  });
  modal(page, () => card, shut, () => !!page);
  all.find((b) => !b.disabled)?.focus();
}

/** Take the list down: back to the game, or to the pause menu if that's underneath. */
function shut() {
  if (!page) return;
  page.remove();
  page = null;
  const g = hooks?.game();
  if (g && document.getElementById("pause")?.hidden) g.active = true;
}

// ---- picking one --------------------------------------------------------------------------------------

/** Who to wait for: the job (by its seed) or the takeover (by its pub) we were put at. */
let watch: { seed?: number; pub?: string; seen: boolean; t: number; endT?: number } | null = null;

const until = async (ok: () => boolean, ms: number) => {
  const t = performance.now();
  while (!ok() && performance.now() - t < ms) await new Promise((r) => setTimeout(r, 200));
};

/** You, put on clear ground near (x, z), out of whatever you were doing. */
function goTo(w: QuestWorld, x: number, z: number) {
  const c = clearSpot(w.map, x, z, 12) ?? [x, z];
  w.reset?.();
  w.moveTo(c[0], c[1], w.me().yaw);
}

async function pick(e: Entry) {
  const g = hooks?.game();
  if (!g) return;
  watch = null;
  shut();
  hooks!.play();
  const q = g.quests, w = q.world;
  g.liftZones(true);
  if (e.kind === "pub") { takePub(g); return; }
  await until(() => q.isReady, START_WAIT);
  const salt = Date.now() % 1e9;
  const o = e.kind === "challenge" ? challengeOffer(e.id, hash("games", e.id, salt)) : q.offerFor(e.id, salt);
  if (!o) { g.news(`Nowhere for ${e.name} round here`); g.liftZones(false); return; }
  g.news(`Off to ${o.where || e.name}…`);
  goTo(w, o.x, o.z);
  await until(() => w.map.detailedAt(o.x, o.z), START_WAIT);
  if (hooks?.game() !== g) return;
  watch = { seed: o.seed, seen: false, t: performance.now() };
  q.startFor(o, { gl: 1 });
}

function takePub(g: Game) {
  const w = g.quests.world, me = w.me();
  const pub = w.pubs().filter((p) => g.invasion.canTake(p.name)).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
  const f = pub && g.invasion.pubFront(pub.name);
  if (!pub || !f) { g.news("There's no pub the Flag Lads could take just now"); g.liftZones(false); return; }
  const d = { u: 1, k: "pub", n: pub.name, x: Math.round(f.x * 10) / 10, z: Math.round(f.z * 10) / 10 };
  g.net.send("gl", d);
  gamesHeard(g, d);
}

/** game.ts: a "gl" from someone with the list (or from us): go where it says. */
export function gamesHeard(g: Game, d: any) {
  if (!d?.u || d.k !== "pub" || typeof d.n !== "string" || !Number.isFinite(d.x) || !Number.isFinite(d.z)) return;
  const w = g.quests.world;
  g.liftZones(true);
  const ids = w.players().map((p) => p.id).sort(), at = ring(w.map, d.x, d.z, ids.length)[Math.max(0, ids.indexOf(w.selfId))];
  w.reset?.();
  w.moveTo(at.x, at.z, at.yaw);
  if (g.isHost) g.invasion.takeNow(d.n);
  watch = { pub: d.n, seen: false, t: performance.now() };
}

/** game.ts: a job's start came round from the list, so the wall comes down for it here too. */
export function gamesFollow(g: Game, d: any) {
  if (!d?.gl || typeof d.o?.seed !== "number") return;
  g.liftZones(true);
  watch = { seed: d.o.seed, seen: false, t: performance.now() };
}

/** Twice a second: once the game we were put at is over, the wall goes back up and the list comes back. */
function tick() {
  const g = hooks?.game();
  // the mouse being captured as a game starts from the main menu would hand the pad back to the game
  if (g && page) g.active = false;
  if (!g || !watch) return;
  const now = performance.now();
  const on = watch.pub !== undefined ? g.invasion.takenOver(watch.pub) : g.quests.taken?.seed === watch.seed;
  if (on) { watch.seen = true; return; }
  if (!watch.seen && now - watch.t < START_WAIT) return;
  watch.endT ??= now + (watch.pub !== undefined && watch.seen ? AFTER_PUB : 0);
  // a result card still up has its moment first
  if (now < watch.endT || (modalUp() && now < watch.endT + 10000)) return;
  watch = null;
  g.liftZones(false);
  openGames();
}
