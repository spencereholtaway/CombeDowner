import * as THREE from "three";
import * as SFX from "./audio";
import { Game, GameCarry } from "./game";
import { urlSpot } from "./debug";
import { trackTitle } from "./music";
import { nowPlaying } from "./nowplaying";
import { TouchControls } from "./touch";
import { PubMap } from "./pubmap";
import { YourMap } from "./yourmap";
import { GameMap, inlineMapId, loadMap } from "./map";
import { DEFAULT_MAP, MAPS, MapInfo, mapInfo, mapName } from "./maps";
import { cleanCode, connect, freshReload, justReloaded, newerLive, newRoomCode, Net, versusMine } from "./net";
import { askForMic, micAnswered, micPending } from "./voice";
import { DebugPanel } from "./debug";
import { buildWorld, World } from "./world";
import { Post } from "./post";
import { initShadows, sensitivity, settingsPage } from "./settings";
import { view } from "./view";
import * as Quips from "./quips";
import { useRenderer } from "./snapshot";
import { fullscreenButton, resumeFullscreen } from "./fullscreen";
import { closeWardrobe, openWardrobe } from "./wardrobe";
import * as Trophies from "./trophies";
import { closeCabinet, completion, openCabinet } from "./trophies";
import { colourFor } from "./avatar";
import { dayLength, skipHours } from "./daylight";
import * as Telemetry from "./telemetry";
import * as Recent from "./recentrooms";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const LOCAL = params.get("net") === "local";   // link tabs in one browser instead of WebRTC (for testing)
const UP = params.get("up") === "1";   // just climbed back up from the mines (or out of the deli)
const UP_TOAST = params.get("from") === "deli" ? "Shift over, back out on the street by the Darling Deli" : "Back up out of the mines, at the door of 1 The Firs";
// The single-file preview build runs where outside connections are blocked, so it is solo only.
const SOLO_ONLY = import.meta.env.VITE_SOLO_ONLY === "1";
if (SOLO_ONLY) {
  $("play").hidden = true;
  document.querySelector(".join")!.setAttribute("hidden", "");
  $("solonote").hidden = false;
  $("solo").classList.add("primary");
}

const canvas = $<HTMLCanvasElement>("view");
// (no smoothing on the screen itself: the world is drawn, smoothed, into the smaller picture post.ts
// keeps, and the screen only gets that blown up, so smoothing it again just cost time on big screens)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.localClippingEnabled = true;   // (only the car you drive from inside uses it: its cabin cut out of the body, vehicles.ts)
// iPads have very dense screens: render a little below native resolution to keep the frame rate up
renderer.setPixelRatio(Math.min(devicePixelRatio, navigator.maxTouchPoints > 1 ? 1.25 : 1.75));
initShadows(renderer);   // on unless turned off in Settings (settings.ts)
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.autoClear = false;
useRenderer(renderer);   // for the treasure trail's picture clues (snapshot.ts)
// The scenery's models are kept only on the graphics card once they're there (world.ts), so if
// the browser resets it (it can when short of memory) they can't be sent again: reload instead.
canvas.addEventListener("webglcontextrestored", () => location.reload());
// the far plane sits just past the fog, so nothing hidden in it gets drawn
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, view.cameraFar);
// ?fx=0 turns off the retro colour grade and ?res=full draws at full resolution, to compare
const post = new Post(renderer, camera, params.get("fx") !== "0", params.get("res") !== "full");

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  post.setSize();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

let game: Game | null = null;
let touchControls: TouchControls | null = null;   // the on-screen controls, retargeted when we travel
// travelling to another town (game.ts, railway.ts): the same Game is rebuilt on the new map with
// the same connection, voice links and match state, starting where the train set you down. Set by
// game.travel() so the frame loop and the pause menu know the game has moved under them.
export let travelHook: ((toMap: string, at: { x: number; z: number; yaw: number }) => void) | null = null;
// iPad and iPhone Safari can't capture the mouse, so go straight to touch controls there.
// (iPadOS Safari reports itself as a Mac, hence the touch-point check.)
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
// A mouse or trackpad drives the pointer. Such a device never gets touch controls: if the browser
// won't capture the mouse right away, it shows the pause screen so a click can try again.
const MOUSE = matchMedia("(pointer: fine) and (hover: hover)").matches;
let freeMode = false;

const savedName = (() => { try { return localStorage.getItem("cd-name") ?? ""; } catch { return ""; } })();
$<HTMLInputElement>("name").value = savedName;
nowPlaying($("np"));
SFX.onTrackChange((name) => {
  for (const el of document.querySelectorAll(".nowplaying")) el.textContent = `Now playing: ${trackTitle(name)}`;
});
$("nexttrack2").onclick = () => { SFX.unlock(); SFX.nextTrack(); };
let micOn = (() => { try { return localStorage.getItem("cd-mic") !== "off"; } catch { return true; } })();
$<HTMLInputElement>("micon").checked = micOn;
$<HTMLInputElement>("micon").onchange = (e) => {
  micOn = (e.target as HTMLInputElement).checked;
  game?.voice.mute(!micOn);
  try { localStorage.setItem("cd-mic", micOn ? "on" : "off"); } catch { /* ignore */ }
};
// Browsers only allow sound after the player interacts, so start the music on the first one.
addEventListener("pointerdown", () => SFX.unlock(), { once: true });
addEventListener("keydown", () => SFX.unlock(), { once: true });
const roomParam = cleanCode(params.get("room") ?? "");
if (roomParam) $<HTMLInputElement>("code").value = roomParam;

// ---- maps -----------------------------------------------------------------------------------
// The single-file build carries one map inline, and that is the only choice. So is a test map, on its
// own page (maps.ts); the menu leaves test maps out otherwise.
const inlineId = inlineMapId();
const testId = MAPS.find((m) => m.hidden && m.id === params.get("map"))?.id;
const only = inlineId ?? testId;
const choices: MapInfo[] = only ? MAPS.filter((m) => m.id === only) : MAPS.filter((m) => !m.hidden);
const valid = (id: string | null): id is string => !!id && choices.some((m) => m.id === id);
const savedMap = (() => { try { return localStorage.getItem("cd-map"); } catch { return null; } })();
const firstMap = [params.get("map"), savedMap, DEFAULT_MAP, choices[0]?.id].find(valid)!;

const loaded = new Map<string, Promise<GameMap>>();
function fetchMap(id: string): Promise<GameMap> {
  let p = loaded.get(id);
  if (!p) {
    const maps = `${import.meta.env.BASE_URL}maps/`;
    const wide = mapInfo(id)?.wide;
    p = loadMap(`${maps}${id}.json`, wide ? `${maps}${id}-wide.json` : undefined, wide ? `${maps}${id}/` : undefined);
    p.catch(() => loaded.delete(id));   // let a later try fetch it again
    loaded.set(id, p);
  }
  return p;
}

/** The map on screen: the menu backdrop, and the one a game starts on. */
let current: { id: string; map: GameMap; world: World };
let wanted = firstMap;
/** Show a map (loading it first if need be). Resolves false if another map was asked for meanwhile. */
async function showMap(id: string): Promise<boolean> {
  wanted = id;
  if (current?.id === id) return true;
  const map = await fetchMap(id);
  if (wanted !== id) return false;
  const old = current;
  current = { id, map, world: buildWorld(map) };
  old?.world.dispose();
  return true;
}

await showMap(firstMap).catch((e) => {
  $("loading").textContent = String(e.message ?? e);
  throw e;
});

/** Until the squares of Bath round where everyone starts (Firs Field) have loaded, Play waits:
 *  they're held loaded from then on, so a respawn always lands on real ground. */
const START_REACH = 150;
let startWait: { id: string; ready: Promise<void> } | null = null;
function startReady(): Promise<void> {
  if (startWait?.id === current.id) return startWait.ready;
  setBusy(true);
  const ready = (async () => {
    try {
      for (;;) {
        const { map, world } = current, ring = map.d.spawn ?? [[0, 0]];
        const x = ring.reduce((s, p) => s + p[0], 0) / ring.length, y = ring.reduce((s, p) => s + p[1], 0) / ring.length;
        if (world.hold(x, -y, START_REACH)) return;
        await new Promise((r) => setTimeout(r, 200));
      }
    } finally { setBusy(false); }
  })();
  startWait = { id: current.id, ready };
  return ready;
}
$("loading").hidden = true;
$("menuform").hidden = false;
$(roomParam ? "play" : "code").focus();
// back from updating to the new version (freshReload), or a link with join=1: straight on into
// that game, once the squares round where everyone starts are in (Play waits for them till then)
if (roomParam && roomParam !== "SOLO" && params.get("join") === "1" && !UP) void startReady().then(() => play(roomParam));

const list = $("maplist");
for (const m of choices) {
  const opt = document.createElement("label");
  opt.className = "mapopt";
  opt.innerHTML = `<input type="radio" name="map"><b></b><small></small>`;
  const input = opt.querySelector("input")!;
  input.value = m.id;
  input.checked = m.id === firstMap;
  opt.querySelector("b")!.textContent = m.name;
  opt.querySelector("small")!.textContent = m.blurb;
  input.onchange = () => pickMap(m.id);
  list.append(opt);
}
$("maps").hidden = choices.length < 2;
const pickedMap = () => list.querySelector<HTMLInputElement>("input:checked")?.value ?? firstMap;

let busy = 0;
/** Grey out the menu while a map loads or a room is looked up. */
function setBusy(on: boolean) {
  busy += on ? 1 : -1;
  for (const id of ["play", "solo"]) $<HTMLButtonElement>(id).disabled = busy > 0;
}

async function pickMap(id: string) {
  try { localStorage.setItem("cd-map", id); } catch { /* storage may be blocked */ }
  $("menuerr").textContent = "";
  setBusy(true);
  try { if (await showMap(id)) void startReady(); }
  catch (e: any) { $("menuerr").textContent = String(e.message ?? e); }
  finally { setBusy(false); }
}

// Menu backdrop: circle slowly around where everyone starts (Firs Field on Combe Down).
const t0 = performance.now();
function attract(now: number) {
  const { map, world } = current;
  const v = (window as any).__view;   // experiments: [cam x, cam y, height above ground, look x, look y] in data metres
  if (v) {
    const [cx, cy, h, lx, ly, lh = 1.2] = v;
    camera.position.set(cx, map.ground(cx, -cy) + h, -cy);
    camera.lookAt(lx, map.ground(lx, -ly) + lh, -ly);
    world.update(cx, camera.position.y, -cy);
    (window as any).__dbg = { y: camera.position.y, tiles: map.tiles?.size, at: !!map.tileAt(cx, -cy) };
    return;
  }
  // ?at= in the address: look from there, at eye height (debug.ts); the screenshot tool
  // (tools/shoot.mjs) sets window.__at to the same thing to move the view without reloading
  const at = urlSpot((window as any).__at ?? undefined);
  if (at) {
    camera.position.set(at.x, map.ground(at.x, at.z) + at.h, at.z);
    camera.rotation.set(at.pitch, at.yaw, 0, "YXZ");
    world.update(at.x, camera.position.y, at.z);
    (window as any).__dbg = { y: camera.position.y, tiles: map.tiles?.size, at: !!map.tileAt(at.x, at.z) };
    return;
  }
  // each map can say what to circle (the Royal Crescent); otherwise, where everyone starts (Firs Field)
  const ring = map.d.spawn ?? [[0, 0]];
  const [fx, fy] = map.d.v ?? [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  const fz = -fy;
  const a = (now - t0) / 30000;
  const x = fx + Math.cos(a) * 95, z = fz + Math.sin(a) * 95;
  camera.position.set(x, map.ground(fx, fz) + 32, z);
  camera.lookAt(fx, map.ground(fx, fz) + 2, fz);
  world.update(x, camera.position.y, z);
}

/** Keep the room in the start screen's recent list while you're in it, with whoever has been there. */
let roomTimer = 0, roomNote = () => {};
addEventListener("pagehide", () => roomNote());
function watchRoom(code: string) {
  clearInterval(roomTimer);
  roomNote = () => {};
  if (code === "SOLO") return;
  roomNote = () => { if (game) Recent.remember(code, current.id, game.mateNames()); };
  roomNote();
  roomTimer = window.setInterval(roomNote, 30000);
}

/** Hand the Game its travel hook, so a train at a platform can take us to another town. */
function armTravel(g: Game, code: string) {
  g.onTravel = (toMap, carry) => void travel(toMap, code, carry);
}

/** Take the train to another town: build its world, hand the match state to a new Game on it, and
 *  start where the train set us down. The connection and the voice links come with us (game.ts). */
async function travel(toMap: string, code: string, carry: GameCarry) {
  const old = game;
  if (!old) return;
  const left = performance.now();
  $("loading").hidden = false;
  $("loading").textContent = `Arriving at ${mapName(toMap)}…`;
  try {
    if (!(await showMap(toMap))) return;
    (window as any).__travelStage = "shown";
    // hold the squares round the arrival until the world is up, as the menu does for the start
    const pl = carry.arriveAt ? current.map.railData?.platforms.find((q) => q.n === carry.arriveAt) : null;
    const hx = pl ? pl.r.reduce((s, p) => s + p[0], 0) / pl.r.length : carry.at.x;
    const hz = pl ? -pl.r.reduce((s, p) => s + p[1], 0) / pl.r.length : carry.at.z;
    for (let i = 0; i < 100; i++) {
      if (current.world.hold(hx, hz, 150)) break;
      // the old Game is still ticking its own world, so push the new one's squares along here
      current.world.update(hx, current.map.ground(hx, hz) + 2, hz, 0.05);
      await new Promise((r) => setTimeout(r, 100));
    }
    old.dispose(false);   // keep the connection and the voice links
    const { map, world } = current;
    game = new Game(map, world, camera, old.net, old.name, code, old.knownIds, carry);
    Telemetry.play(toMap);
    (window as any).__travelStage = "built";
    armTravel(game, code);
    game.player.sensitivity = 0.0022 * sensitivity;
    // the new Game starts out not playing: keep the state the old one was in. The mouse is still
    // captured (nobody let it go), so no pointerlockchange will fire to set this — without it you
    // can't move until you bring the pause menu up and close it again.
    touchControls?.setGame(game);
    game.freeMode = old.freeMode;
    game.active = old.active;
    $("loading").hidden = true;
    $("blackout").hidden = true;
    // the ride takes what it takes on the real line: whatever the loading hasn't already used of it
    // is added to the game's clock, which the host tells everyone
    skipHours(Math.max(0, carry.journeySecs - (performance.now() - left) / 1000 * 86400 / dayLength()) / 3600);
    game.toast(`Arrived at ${mapName(toMap)}`, 4);
  } catch (e: any) {
    (window as any).__travelError = String(e?.message ?? e);
    $("loading").hidden = true;
    $("blackout").hidden = true;
    old?.toast(String(e?.message ?? e), 6);
  }
}

function start(code: string, local: boolean, net: Net = connect(code, local), known: string[] = []) {
  const name = ($<HTMLInputElement>("name").value.trim() || "Player").slice(0, 16);
  try { localStorage.setItem("cd-name", name); } catch { /* storage may be blocked */ }
  SFX.unlock();
  const { id, map, world } = current;
  game = new Game(map, world, camera, net, name, code, known);
  Telemetry.play(id);
  Telemetry.watchPlay(() => game?.telemetryLook() ?? null);
  Telemetry.watchRoom(() => game && { code, host: game.isHost, players: game.peers().length + 1 });
  armTravel(game, code);
  watchRoom(code);
  game.player.sensitivity = 0.0022 * sensitivity;
  $("menu").hidden = true;
  $("hud").hidden = false;
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("room", code);
  url.searchParams.set("map", id);
  if (local) url.searchParams.set("net", "local");
  history.replaceState(null, "", url);
  $<HTMLInputElement>("invite").value = code === "SOLO" ? "" : url.toString();
  $("invitebox").hidden = code === "SOLO";
  $("pauseroom").textContent = code === "SOLO" ? `Practice on ${mapName(id)} on your own. Name a game from the menu to play with friends.`
    : `Game: ${code}, on ${mapName(id)}. Tell your friends the name, or send them the link below.`;
  $("nethint").textContent = code === "SOLO" ? "" : local
    ? "Local test mode: only tabs in this browser can join."
    : "Players connect directly to each other. If a friend can't connect, their network may block it: try another network or a phone hotspot. "
      + "Players near you hear your mic; hold V (or Radio) to talk to everyone. Headphones stop your speakers echoing into your mic.";
  $("voiceopts").hidden = $("t-radio").hidden = !net.media;
  game.voice.mute(!micOn);
  touchControls = new TouchControls(game, canvas, showPause);
  if ((IOS && !MOUSE) || !("requestPointerLock" in canvas)) enterFreeMode();
  else {
    // Start playing straight away. Joining can take long enough that the browser no longer counts
    // the click on Play, so it may refuse to capture the mouse; then a click on the game does it.
    game.active = true;
    lock();
  }
  Quips.loadIn();
}

/** Play without a captured mouse: on-screen controls, drag to look. */
function enterFreeMode() {
  if (!game) return;
  freeMode = true;
  game.freeMode = true;
  game.active = true;
  $("touch").hidden = false;
  $("pause").hidden = true;
  $("pausehint").textContent = "Drag on the right to look, use the stick on the left to move, tap to shoot.";
}

/** Pointer lock was refused, often because the click that asked for it came too long ago. */
function lockFailed() {
  if (!game || freeMode) return;
  if (!MOUSE) return enterFreeMode();
  if ($("pause").hidden) { $("clickhint").hidden = false; return; }   // keep playing; a click captures the mouse
  showPause();
  $("pausehint").textContent = "Click Resume to aim with the mouse.";
}

function lock() {
  closeWardrobe();
  closeCabinet();
  if (freeMode) { game!.active = true; $("pause").hidden = true; resumeFullscreen(); return; }
  let settled = false;
  const fail = () => { if (!settled) { settled = true; lockFailed(); } };
  try {
    const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    p?.then?.(() => (settled = true), fail);
  } catch { fail(); }
  resumeFullscreen();   // after asking for the mouse, so going full screen doesn't use up the click first
  // some browsers neither lock nor report an error
  setTimeout(() => { if (document.pointerLockElement !== canvas) fail(); else settled = true; }, 1000);
}
document.addEventListener("pointerlockerror", lockFailed);
/** The pause menu's Trophies button says how much of Bath you've done. */
function showCompletion() { $("trophybtn").textContent = `Trophies \u00b7 ${completion().pct}% of Bath done`; }
let pausedAt = 0;   // when the pause menu last opened, so the Esc that opened it doesn't also close it
function showPause() {
  if (!game) return;
  if ($("pause").hidden) pausedAt = performance.now();
  game.active = false;
  $("pause").hidden = false;
  $("gopub").hidden = !game.pubs().length;
  $("calloff").hidden = !game.quests.running;
  showCompletion();
  game.drawDaily();
}
/** Esc out of the pause menu: back to the game at once, the mouse captured if the browser allows it,
 *  and if not the click hint shows and your next click captures it. */
function resume() {
  if (!game) return;
  closeChronicle();
  closeWardrobe();
  closeCabinet();
  $("pause").hidden = true;
  game.active = true;
  if (!freeMode) $("clickhint").hidden = false;
  lock();
}

document.addEventListener("pointerlockchange", () => {
  if (!game || freeMode) return;
  const locked = document.pointerLockElement === canvas;
  game.active = locked;
  $("pause").hidden = locked;
  $("clickhint").hidden = true;
  if (locked) $("pausehint").textContent = "";
  else { pausedAt = performance.now(); showCompletion(); $("gopub").hidden = !game.pubs().length; $("calloff").hidden = !game.quests.running; }
});
// Playing with the mouse loose (the browser wouldn't capture it as the game started, because joining
// took too long after the click on Play): the first click anywhere captures it, the minimap and the
// music buttons included, rather than opening the map or leaving the pointer free to wander out of
// the window. That click doesn't do anything else.
addEventListener("pointerdown", (e) => {
  if (!game?.active || freeMode || e.pointerType !== "mouse" || document.pointerLockElement === canvas) return;
  if (!$("pause").hidden || pubMap.isOpen) return;
  e.stopPropagation();
  e.preventDefault();
  const eat = (c: Event) => { c.stopPropagation(); c.preventDefault(); };   // nor its click (a music button's, say)
  addEventListener("click", eat, { capture: true, once: true });
  setTimeout(() => removeEventListener("click", eat, true), 1000);
  lock();
}, true);
addEventListener("keydown", (e) => {
  if (e.code === "Escape" && freeMode && game) { if ($("pause").hidden) showPause(); else lock(); }
  // Esc with the pause menu up closes it and goes back to the game. The browser won't capture the
  // mouse from the Esc key, so you play on with it loose and the next click captures it, as when
  // joining took too long. (Settings, the pub map and the wardrobe each take Esc first, back to here.)
  else if (e.code === "Escape" && game && !$("pause").hidden && !e.repeat && performance.now() - pausedAt > 250) {
    e.preventDefault();
    resume();
  }
  // playing without the mouse captured yet: Esc still pauses
  else if (e.code === "Escape" && game?.active && document.pointerLockElement !== canvas) { $("clickhint").hidden = true; showPause(); }
  // , and . step back and forward through the soundtrack, as in Winamp's playlist
  if ((e.code === "Comma" || e.code === "Period") && !e.repeat && !(e.target instanceof HTMLInputElement)) {
    SFX.unlock();
    if (e.code === "Comma") SFX.previousTrack(); else SFX.nextTrack();
  }
});

// ---- play: join or start a game by name ---------------------------------------------------------
// A game's name is its room. If a game with that name is running you join it, on its map;
// if not, you start it on the map you picked.

/** Wait for players already in the room to say hello. Resolves with their map, or null if nobody's playing.
 *  Each hello says who else that player is playing with, so this waits until you've met all of them
 *  (showing "Connecting to 1 of 3 players…"), rather than dropping you in with half the room missing. */
function lookForGame(net: Net, signal: AbortSignal): Promise<{ map: string; names: string[]; ids: string[] } | null> {
  return new Promise((resolve) => {
    const names = new Map<string, string>();
    const expected = new Set<string>();             // everyone the players here say is playing
    let map = "", done = false, settle = 0, cap = 0;
    const result = () => ({ map, names: [...names.values()], ids: [...names.keys()] });
    const finish = (v: { map: string; names: string[]; ids: string[] } | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer); clearTimeout(settle); clearTimeout(cap);
      resolve(v);
    };
    // Players in a game greet anyone who arrives. Someone else still on this screen stays quiet.
    net.on("hello", (d, from) => {
      if (done) return;
      names.set(from, String(d?.name || "Player").slice(0, 16));
      map ||= String(d?.map || DEFAULT_MAP);
      expected.add(from);
      if (Array.isArray(d?.p)) for (const id of d.p) if (typeof id === "string" && id !== net.selfId) expected.add(id);
      // don't wait for ever on someone who can't be reached: go in with whoever's here after a while
      // (and someone's here, so stop the clock that gives up and starts a new game)
      if (!cap) { clearTimeout(timer); cap = window.setTimeout(() => finish(result()), 15000); }
      clearTimeout(settle);
      const missing = [...expected].filter((id) => !names.has(id)).length;
      if (missing) { showLookup(`Connecting to ${names.size} of ${expected.size} players…`); return; }
      // met everyone we know of: give the rest of the room (older pages don't say who's playing) a moment to say hello too
      settle = window.setTimeout(() => finish(result()), 600);
    });
    // finding peers over the internet takes a few seconds; tabs in one browser are instant
    const timer = window.setTimeout(() => finish(null), net.kind === "local" ? 1500 : 8000);
    signal.addEventListener("abort", () => finish(null));
  });
}

/** Is the game we've found on another version from ours? 1: it's newer (we need to refresh), -1: it's
 *  older (they do), 0: the same. Waits a moment for everyone's version to arrive; a page so old it
 *  never says counts as older. */
async function versionGap(net: Net, ids: string[], signal: AbortSignal): Promise<number> {
  const t0 = performance.now();
  while (!signal.aborted && performance.now() - t0 < 3000 && ids.some((id) => versusMine(net.buildOf(id)) === null)) await new Promise((r) => setTimeout(r, 100));
  const v = ids.map((id) => versusMine(net.buildOf(id)) ?? -1);
  return v.includes(1) ? 1 : v.includes(-1) ? -1 : 0;
}

function showLookup(msg: string) {
  $("menuform").hidden = true;
  $("lookup").hidden = false;
  $("lookupmsg").textContent = msg;
  $("lookcancel").focus();
}
function hideLookup() {
  $("lookup").hidden = true;
  $("lookretry").hidden = true;
  $("menuform").hidden = false;
}

let cancelLookup = () => {};
$("lookcancel").onclick = () => cancelLookup();

/** If the browser is still asking about the mic, wait for an answer before the game takes the mouse. False if cancelled. */
async function waitForMic(signal: AbortSignal) {
  if (micPending()) {
    showLookup("Allow the microphone so other players can hear you (the browser is asking, at the top of the window)…");
    await Promise.race([micAnswered(), new Promise((r) => signal.addEventListener("abort", r))]);
  }
  return !signal.aborted;
}

/** Join the game with this name if it's running, otherwise start it on the chosen map. */
async function play(code: string) {
  // a page left open since the game last changed: update first, then on into the game, so nobody
  // turns up to their friends on an old version (and the check at the door below rarely has to say so)
  if (code !== "SOLO" && !justReloaded()) {
    setBusy(true);
    showLookup("Checking for a new version…");
    const stale = await newerLive();
    if (stale) { showLookup("Updating to the new version…"); freshReload(code); return; }
    hideLookup();
    setBusy(false);
  }
  const ctrl = new AbortController();
  const net = connect(code, LOCAL);
  // ask for the mic now, while the menu is up: asked once the game has the mouse, Chrome sweeps the question away
  if (net.media) askForMic();
  // and listen down the mine too: the party may all be down there, in a room of their own (see mines/main.ts)
  const below = UP ? null : connect(`MINES-${code}`, LOCAL);
  const miners = new Map<string, string>();
  below?.on("hello", (d, from) => { if (d?.mines) miners.set(from, String(d.name || "Player").slice(0, 16)); });
  // and in the deli kitchen, which is a room of its own too
  const kitchen = UP ? null : connect(`DELI-${code}`, LOCAL);
  const cooks = new Map<string, string>();
  kitchen?.on("hello", (d, from) => { if (d?.deli) cooks.set(from, String(d.name || "Cook").slice(0, 16)); });
  cancelLookup = () => { ctrl.abort(); net.leave(); below?.leave(); kitchen?.leave(); hideLookup(); $("code").focus(); };
  setBusy(true);
  showLookup(`Looking for ${code}…`);
  try {
    const found = await lookForGame(net, ctrl.signal);
    below?.leave();
    kitchen?.leave();
    if (ctrl.signal.aborted) return;
    if (!found && (miners.size || cooks.size)) {
      const inMine = miners.size > 0, names = [...(inMine ? miners : cooks).values()];
      const who = names.length === 1 ? `${names[0]} is` : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} are`;
      showLookup(`Nobody's on the street in ${code}, but ${who} ${inMine ? "down the mines" : "cooking in the deli kitchen"}.`);
      $("lookmines").textContent = inMine ? "Go down the mines" : "Go to the deli kitchen";
      const choice = await new Promise<"down" | "stay" | null>((resolve) => {
        $("lookmines").hidden = $("lookstay").hidden = false;
        $("lookmines").onclick = () => resolve("down");
        $("lookstay").onclick = () => resolve("stay");
        ctrl.signal.addEventListener("abort", () => resolve(null));
        $("lookmines").focus();
      });
      $("lookmines").hidden = $("lookstay").hidden = true;
      if (!choice) return;
      if (choice === "down") {
        net.leave();
        const url = new URL(inMine ? "mines.html" : "deli.html", location.href);
        url.search = "";
        url.searchParams.set("go", "1");
        url.searchParams.set("room", code);
        url.searchParams.set("map", pickedMap());
        if (LOCAL) url.searchParams.set("net", "local");
        location.href = url.toString();
        return;
      }
      showLookup(`Starting ${code}…`);
    }
    if (!found) {
      if (!(await showMap(pickedMap()))) return cancelLookup();
      if (!(await waitForMic(ctrl.signal))) return;
      start(code, LOCAL, net);
      if (UP) game!.toast(UP_TOAST, 4);
      else game!.toast(`You've started ${code} on ${mapName(current.id)}. Tell your friends to play ${code}, or press Esc for the invite link.`, 6);
      return;
    }
    if (!mapInfo(found.map) || !valid(found.map)) {
      cancelLookup();
      $("menuerr").textContent = `${code} is on a map this version doesn't have. Reload the page to update.`;
      return;
    }
    // everyone in a game plays the same version: two see some things differently (cars, seats, voice)
    const gap = await versionGap(net, found.ids, ctrl.signal);
    if (ctrl.signal.aborted) return;
    if (gap) {
      showLookup(gap > 0
        ? `${code} is on a newer version of the game. Refresh to update, and you'll join it.`
        : `The players in ${code} are on an older version of the game, so you can't join yet. They've been asked to refresh: try again once they have.`);
      const retry = $("lookretry");
      retry.textContent = gap > 0 ? "Refresh" : "Try again";
      retry.hidden = false;
      retry.focus();
      const again = await new Promise<boolean>((resolve) => {
        retry.onclick = () => resolve(true);
        ctrl.signal.addEventListener("abort", () => resolve(false));
      });
      retry.hidden = true;
      if (!again) return;
      if (gap > 0) { net.leave(); freshReload(code); return; }
      cancelLookup();
      play(code);
      return;
    }
    showLookup(`Joining ${code}…`);
    await showMap(found.map);
    if (!(await waitForMic(ctrl.signal))) return;
    start(code, LOCAL, net, found.ids);
    if (UP) game!.toast(UP_TOAST, 4);
  } catch (e: any) {
    cancelLookup();
    $("menuerr").textContent = String(e.message ?? e);
  } finally {
    setBusy(false);
  }
}

$("play").onclick = () => {
  const code = cleanCode($<HTMLInputElement>("code").value) || newRoomCode();
  if (code.length < 4 || code === "SOLO") { $("menuerr").textContent = "Pick a game name of at least 4 letters or numbers (not SOLO)."; return; }
  $("menuerr").textContent = "";
  play(code);
};
const showRecent = () => Recent.render($("recent"), (m) => (m === DEFAULT_MAP ? "" : mapName(m)), async (r) => {
  $("menuerr").textContent = "";
  $<HTMLInputElement>("code").value = r.code;
  if (valid(r.map)) {
    const radio = list.querySelector<HTMLInputElement>(`input[value="${r.map}"]`);
    if (radio) radio.checked = true;
    try { if (!(await showMap(r.map))) return; }
    catch (e: any) { $("menuerr").textContent = String(e.message ?? e); return; }
  }
  $("play").click();
});
showRecent();
$("solo").onclick = () => start("SOLO", true);
const codeInput = $<HTMLInputElement>("code");
// Show the name exactly as it will be used (no spaces or punctuation), so what you see is what you tell your friends.
codeInput.addEventListener("input", () => { const v = cleanCode(codeInput.value); if (v !== codeInput.value) codeInput.value = v; });
codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") $("play").click(); });
$("resume").onclick = () => { SFX.unlock(); lock(); };
const pubMap = new PubMap(() => game, () => lock());
$("gopub").onclick = () => pubMap.open();
$("wardrobebtn").onclick = () => { if (game) openWardrobe(colourFor(game.net.selfId), game.net.selfId, () => game?.wearChanged(), () => {}); };
$("trophybtn").onclick = () => openCabinet(() => showCompletion());

// your map and the Chronicle's news: from the pause menu, the big map (Y) and the noticeboards (N)
const yourMap = new YourMap(() => game);
function pauseButton(id: string, text: string, onclick: () => void) {
  const b = document.createElement("button");
  b.type = "button"; b.id = id; b.textContent = text; b.onclick = onclick;
  $("trophybtn").after(b);
}
pauseButton("paperbtn2", "Read the Chronicle", () => readPaper());
pauseButton("yourmapbtn2", "Your map", () => yourMap.open(false));
const yourBtn = document.createElement("button");
yourBtn.type = "button"; yourBtn.id = "yourmapbtn"; yourBtn.textContent = "Your map (Y)";
yourBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
yourBtn.onclick = () => toggleYours();
document.querySelector("#bigmap .bigmapbar")?.prepend(yourBtn);
$("bigmap").addEventListener("pointerdown", (e) => { if ((e.target as HTMLElement).closest("#yourpanel")) e.stopPropagation(); }, true);
function toggleYours() {
  if (!game || pubMap.isOpen) return;
  if (yourMap.isOpen) yourMap.back(); else yourMap.open($("pause").hidden);
}
const paperHud = document.createElement("button");
paperHud.type = "button"; paperHud.id = "paperbtn"; paperHud.hidden = true;
paperHud.onclick = () => readPaper();
$("hud").appendChild(paperHud);
/** Put the Chronicle away and go back to the pause menu. */
function closeChronicle() { $("chronicle").hidden = true; }
$("chronclose").onclick = () => closeChronicle();
// Esc shuts the paper first, back to the pause menu it came from
addEventListener("keydown", (e) => {
  if (e.code !== "Escape" || $("chronicle").hidden) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (!e.repeat) closeChronicle();
}, true);
/** The Chronicle, on its own sheet over the pause menu: the mouse is let go first. */
function readPaper() {
  if (!game) return;
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  else if ($("pause").hidden) showPause();
  game.readChronicle();
}
// stood at a noticeboard, the Chronicle's pinned up there too (looked for a few times a second, not every frame)
setInterval(() => {
  if ($("pause").hidden) closeChronicle();
  const at = !!game?.active && game.quests.atBoard();
  if (paperHud.hidden === !at) return;
  paperHud.hidden = !at;
  if (at && game) paperHud.textContent = `Read the Chronicle${MOUSE ? " (N)" : ""}`;
}, 300);
addEventListener("keydown", (e) => {
  if (!game || e.repeat || e.target instanceof HTMLInputElement) return;
  if (e.code === "KeyY" && !$("bigmap").hidden) toggleYours();
  else if (e.code === "KeyN" && game.active && game.quests.atBoard()) readPaper();
});
$("calloff").onclick = () => { game?.quests.callOff(); $("calloff").hidden = true; };
$("leave").onclick = () => {
  game?.dispose();
  location.href = location.pathname;
};
$("copy").onclick = async () => {
  const input = $<HTMLInputElement>("invite");
  try { await navigator.clipboard.writeText(input.value); $("copy").textContent = "Copied"; }
  catch { input.select(); $("copy").textContent = "Press Ctrl+C"; }
  setTimeout(() => ($("copy").textContent = "Copy link"), 1800);
};

// F3, or "Debug info" in the pause menu: where you are, frame times and how the links to everyone are doing
const debug = new DebugPanel(renderer, camera, () => game);
$("debugbtn").onclick = () => debug.toggle();
fullscreenButton($("fullscreen"));
settingsPage({
  post, debug, renderer, scene: () => current.world.scene,
  onSensitivity: (v) => { if (game) game.player.sensitivity = 0.0022 * v; },
});

let last = performance.now();
let frames = 0, fpsT = 0, shadowTick = 0;
function frame(now: number) {
  const raw = (now - last) / 1000, dt = Math.min(0.05, raw);
  last = now;
  if (game) game.update(dt); else attract(now);
  if (camera.far !== view.cameraFar || camera.near !== view.cameraNear) { camera.far = view.cameraFar; camera.near = view.cameraNear; camera.updateProjectionMatrix(); }
  debug.begin();
  // shadows are drawn afresh every other frame: they're a good share of a frame's work, and a
  // moving shadow a frame behind can't be seen
  renderer.shadowMap.autoUpdate = false;
  if ((shadowTick ^= 1)) renderer.shadowMap.needsUpdate = true;
  post.render(current.world.scene, game ? game.weapon.scene : null);
  debug.frame(raw);
  frames++; fpsT += raw;
  if (fpsT >= 1) { (window as any).__fps = frames / fpsT; frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// climbing back up from the mines: straight back into the game you went down from (once the
// squares round the start are in)
void startReady().then(() => {
  if (!UP) return;
  if (roomParam && roomParam !== "SOLO") $("play").click();
  else { start("SOLO", true); game!.toast(UP_TOAST, 4); }
});

// for automated tests
(window as any).__game = () => game;
(window as any).__trophies = Trophies;
(window as any).__renderer = renderer;
(window as any).__map = () => current?.map;   // the map as loaded, for tools/probe_map.mjs
