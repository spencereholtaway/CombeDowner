// Under Combe Down: the mines page. Sets up the renderer and menu, finds or starts a party, and runs
// the frame loop. The game itself is in game.ts.
import * as THREE from "three";
import * as SFX from "../audio";
import { cleanCode, connect, newRoomCode, Net } from "../net";
import { askForMic, micAnswered, micPending } from "../voice";
import { Post, resolutionButton } from "../post";
import { MineGame } from "./game";
import { CLASS_IDS, CLASSES, ClassId } from "./items";
import { parseSeed } from "./gen";
import { fullscreenButton, resumeFullscreen } from "../fullscreen";
import { B, GamepadControls, key, mouse, padActions, padPress, padSettings, padText, tap } from "../gamepad";
import * as Telemetry from "../telemetry";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const LOCAL = params.get("net") === "local";
// mine parties live in their own rooms, apart from games up in the streets
const room = (code: string) => `MINES-${code}`;

const canvas = $<HTMLCanvasElement>("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.autoClear = false;
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 80);
const post = new Post(renderer, camera, params.get("fx") !== "0", params.get("res") !== "full");
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  post.setSize();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage may be blocked */ } },
};
$<HTMLInputElement>("name").value = store.get("cd-name") ?? "";
const sens = Number(store.get("cd-sens")) || 1;
$<HTMLInputElement>("sens").value = String(sens);
const music = Number(store.get("cd-music") ?? 0.6);
SFX.setMusicVolume(Number.isFinite(music) ? music : 0.6);
$<HTMLInputElement>("music").value = String(music);
$<HTMLInputElement>("music").oninput = (e) => { const v = Number((e.target as HTMLInputElement).value); SFX.setMusicVolume(v); store.set("cd-music", String(v)); };
const sfx = Number(store.get("cd-sfx") ?? 1);
SFX.setSfxVolume(Number.isFinite(sfx) ? sfx : 1);
$<HTMLInputElement>("sfx").value = String(sfx);
$<HTMLInputElement>("sfx").oninput = (e) => { const v = Number((e.target as HTMLInputElement).value); SFX.setSfxVolume(v); store.set("cd-sfx", String(v)); };
addEventListener("pointerdown", () => SFX.unlock(), { once: true });
addEventListener("keydown", () => SFX.unlock(), { once: true });
const roomParam = cleanCode(params.get("room") ?? "");
// the street map you came down from, so climbing out takes you back to the same place
const MAP = params.get("map") ?? "";
/** Back up to Combe Downer: the same game name and map, out of the front door of 1 The Firs. */
function surfaceUrl(code: string) {
  const u = new URL("./", location.href);
  if (code && code !== "SOLO") u.searchParams.set("room", code);
  if (MAP) u.searchParams.set("map", MAP);
  if (LOCAL) u.searchParams.set("net", "local");
  u.searchParams.set("up", "1");
  return u.toString();
}
let party = roomParam;
function climbOut() { game?.dispose(); location.href = surfaceUrl(party); }
$<HTMLAnchorElement>("backup").href = surfaceUrl(roomParam);
// for testing: ?go=1 skips the menu, ?depth=3 starts the run that far down, ?class=mage skips the choice
const GO = params.get("go") === "1";
const DEPTH = Number(params.get("depth")) || undefined;
const CLASS = params.get("class") as ClassId | null;
if (roomParam) $<HTMLInputElement>("code").value = roomParam;
if (params.get("seed")) $<HTMLInputElement>("seed").value = params.get("seed")!;

let game: MineGame | null = null;

function start(code: string, net: Net, known: string[] = []) {
  const name = ($<HTMLInputElement>("name").value.trim() || "Player").slice(0, 16);
  store.set("cd-name", name);
  SFX.unlock();
  const seed = parseSeed($<HTMLInputElement>("seed").value) ?? undefined;
  party = code;
  game = new MineGame(camera, net, name, code, { depth: DEPTH, seed, known });
  Telemetry.play("mines");
  Telemetry.begin("mines");
  game.player.sensitivity = 0.0022 * sens;
  $("menu").hidden = true;
  $("hud").hidden = false;
  if (CLASS && CLASSES[CLASS]) { game.setClass(CLASS); lock(); }
  else pickClass();
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("room", code);
  if (LOCAL) url.searchParams.set("net", "local");
  if (code !== "SOLO") history.replaceState(null, "", url);
  else history.replaceState(null, "", location.pathname + (LOCAL ? "?net=local" : ""));
  $<HTMLInputElement>("invite").value = url.toString();
  $("invitebox").hidden = code === "SOLO";
  $("pauseroom").textContent = code === "SOLO" ? "Down the mine on your own." : `Party: ${code}. Send friends the link to come down with you.`;
}

/** Choose a class. The click on a card also captures the mouse. */
function pickClass() {
  const last = store.get("cd-class");
  const list = $("classes");
  list.innerHTML = "";
  for (const id of CLASS_IDS) {
    const c = CLASSES[id];
    const b = document.createElement("button");
    b.innerHTML = `<b></b><span></span><small></small>`;
    b.querySelector("b")!.textContent = c.name;
    b.querySelector("span")!.textContent = c.blurb;
    b.querySelector("small")!.textContent = padText(`${c.hp} health. ${c.how}`);
    if (id === last) b.classList.add("last");
    b.onclick = () => {
      store.set("cd-class", id);
      game?.setClass(id);
      $("classpick").hidden = true;
      lock(true);
    };
    list.append(b);
  }
  $("classpick").hidden = false;
}

/** Capture the mouse to play. Where the page isn't allowed to, fall back to looking with the mouse as it is. */
function lock(fromClick = false) {
  if (!game) return;
  // a refused first try (no click behind it, as with ?class=) mustn't leave the mouse loose for the whole session
  if (game.freeLook && fromClick) { game.freeLook = false; canvas.style.cursor = ""; }
  if (game.freeLook) return resume();
  let settled = false;
  const fail = () => {
    if (settled || !game) return;
    settled = true;
    game.freeLook = true;
    canvas.style.cursor = "crosshair";
    resume();
    game.toast("Move the mouse to look, and push it to the edge of the screen to keep turning. Esc pauses", 6);
  };
  try {
    const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    p?.then?.(() => (settled = true), fail);
  } catch { fail(); }
  resumeFullscreen();   // after asking for the mouse, so going full screen doesn't use up the click first
  // some pages neither capture the mouse nor say they won't
  setTimeout(() => { if (document.pointerLockElement === canvas) settled = true; else fail(); }, 800);
}
function resume() {
  if (!game) return;
  game.active = true;
  $("pause").hidden = true;
  $("clickhint").hidden = true;
}
addEventListener("keydown", (e) => {
  if (e.code === "Escape" && game?.freeLook && $("classpick").hidden) {
    game.active = !$("pause").hidden;
    $("pause").hidden = !$("pause").hidden;
  }
});
document.addEventListener("pointerlockchange", () => {
  if (!game) return;
  const locked = document.pointerLockElement === canvas;
  // the mouse captured after all, just too late: play captured, so it can't wander off the window
  if (locked && game.freeLook) { game.freeLook = false; canvas.style.cursor = ""; }
  if (game.freeLook) return;
  game.active = locked;
  $("pause").hidden = locked || !$("classpick").hidden;
  $("clickhint").hidden = true;
});
canvas.addEventListener("click", () => { if (game && $("classpick").hidden && document.pointerLockElement !== canvas) lock(true); });
$("resume").onclick = () => lock(true);
fullscreenButton($("fullscreen"));
resolutionButton($("resolution"), post);
$("leave").onclick = climbOut;
$("sumup").onclick = climbOut;
$("again").onclick = () => game?.again();
$("copy").onclick = async () => {
  const input = $<HTMLInputElement>("invite");
  try { await navigator.clipboard.writeText(input.value); $("copy").textContent = "Copied"; } catch { input.select(); }
  setTimeout(() => ($("copy").textContent = "Copy link"), 1800);
};
$<HTMLInputElement>("sens").oninput = (e) => {
  const v = Number((e.target as HTMLInputElement).value);
  if (game) game.player.sensitivity = 0.0022 * v;
  store.set("cd-sens", String(v));
};

/** Join the party if it's down there already, or start it. Either way the host sends the mine. */
async function play(code: string) {
  const net = connect(room(code), LOCAL);
  if (net.media) askForMic();   // ask now, while the menu is up, not once the game has the mouse
  let cancelled = false;
  $("menuform").hidden = true;
  $("lookup").hidden = false;
  $("lookupmsg").textContent = `Looking for ${code}…`;
  $("lookcancel").onclick = () => { cancelled = true; net.leave(); $("lookup").hidden = true; $("menuform").hidden = false; };
  // anyone already playing says hello to newcomers; give them a few seconds
  const party: string[] = [];
  const found = await new Promise<boolean>((resolve) => {
    let settle = 0;
    net.on("hello", (_d, from) => {
      if (!party.includes(from)) party.push(from);
      clearTimeout(settle);
      settle = window.setTimeout(() => resolve(true), 600);   // give the rest of the party a moment to say hello too
    });
    setTimeout(() => resolve(party.length > 0), LOCAL ? 1500 : 8000);
  });
  if (cancelled) return;
  if (micPending()) {
    $("lookupmsg").textContent = "Allow the microphone so others can hear you (the browser is asking, at the top of the window)…";
    await micAnswered();
    if (cancelled) return;
  }
  start(code, net, party);
  game!.toast(found ? `Joining ${code}` : `You've started ${code}. Press Esc for the invite link`, 4);
}

$("play").onclick = () => {
  const code = cleanCode($<HTMLInputElement>("code").value) || newRoomCode();
  if (code.length < 4 || code === "SOLO") { $("menuerr").textContent = "Pick a party name of at least 4 letters or numbers."; return; }
  play(code);
};
const solo = () => start("SOLO", connect(room(`SOLO${Math.random().toString(36).slice(2, 8)}`), true));
$("solo").onclick = solo;
$<HTMLInputElement>("code").addEventListener("keydown", (e) => { if (e.key === "Enter") $("play").click(); });

// straight in, from the front door on The Firs or a test link
if (GO) { if (roomParam && roomParam !== "SOLO") play(roomParam); else solo(); }

// the menu backdrop
const backdrop = new THREE.Scene();
backdrop.background = new THREE.Color("#030202");

// A game controller (gamepad.ts): its buttons press the mouse and keys that do the same down here
const pad = new GamepadControls(() => game && {
  playing: () => !!game?.active && $("pause").hidden && $("classpick").hidden,
  player: () => game!.player,
  look: (dx, dy) => game!.player.look(dx, dy, 1),
  driving: () => false,
  button: padPress,
}, (text) => game?.toast(text, 4));
const hold = (code: string) => (down: boolean) => key(code, down);
const wheel = (deltaY: number) => (down: boolean) => { if (down) dispatchEvent(new WheelEvent("wheel", { deltaY })); };
const slot = (n: number) => (down: boolean) => { if (down) tap(`Digit${n}`); };
padActions([
  { id: "fire", name: "Swing, draw or cast", button: B.r2, keys: ["Mouse0"], run: (down) => mouse(0, down) },
  { id: "heal", name: "Healing light", button: B.l2, keys: ["Mouse2"], run: (down) => { if (down) mouse(2, true); } },
  { id: "jump", name: "Jump", button: B.cross, keys: ["Space"], run: hold("Space") },
  { id: "use", name: "Use, or hold to pick a friend up", button: B.square, keys: ["KeyE"], run: hold("KeyE") },
  { id: "crouch", name: "Crouch", button: B.circle, keys: ["KeyC"], run: hold("KeyC") },
  { id: "prev", name: "Previous weapon", button: B.l1, keys: ["Wheel"], run: wheel(-40) },
  { id: "next", name: "Next weapon", button: B.r1, keys: ["Wheel"], run: wheel(40) },
  { id: "radio", name: "Talk on the radio", button: B.r3, keys: ["KeyV"], run: hold("KeyV") },
  { id: "map", name: "Whole map", button: B.touchpad, keys: ["KeyM"], run: (down) => { if (down) tap("KeyM"); } },
  { id: "slot1", name: "First weapon", button: B.up, keys: ["Digit1"], run: slot(1) },
  { id: "slot2", name: "Second weapon", button: B.down, keys: ["Digit2"], run: slot(2) },
  { id: "slot3", name: "Third weapon", button: B.left, keys: ["Digit3"], run: slot(3) },
  { id: "slot4", name: "Fourth weapon", button: B.right, keys: ["Digit4"], run: slot(4) },
], "cd-padbuttons-mines");
padSettings();

let last = performance.now();
let frames = 0, fpsT = 0;
function frame(now: number) {
  const raw = (now - last) / 1000, dt = Math.min(0.05, raw);
  last = now;
  pad.poll(dt);
  if (game) { game.update(dt); post.render(game.scene, game.weaponScene); }
  else post.render(backdrop, null);
  frames++; fpsT += raw;
  if (fpsT >= 1) { (window as any).__fps = frames / fpsT; frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as any).__mines = () => game;
(window as any).__renderer = renderer;
