// COMBE DOWN WITH ME: the deli page. Sets up the renderer, the menu and the touch controls, finds
// or opens a kitchen, and runs the frame loop. The shift itself is in game.ts.
import * as THREE from "three";
import * as SFX from "../audio";
import { cleanCode, connect, newRoomCode, Net } from "../net";
import { askForMic, micAnswered, micPending } from "../voice";
import { Post, resolutionButton } from "../post";
import { DeliGame } from "./game";
import { KitchenView } from "./view";
import { fullscreenButton, resumeFullscreen } from "../fullscreen";
import * as Telemetry from "../telemetry";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const LOCAL = params.get("net") === "local";
// kitchens have rooms of their own, apart from the streets and the mines
const room = (code: string) => `DELI-${code}`;

const canvas = $<HTMLCanvasElement>("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, navigator.maxTouchPoints > 1 ? 1.25 : 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.autoClear = false;
const view = new KitchenView();
const post = new Post(renderer, view.camera, params.get("fx") !== "0", params.get("res") !== "full");
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  post.setSize();
  // keep the kitchen clear of the tickets along the top (shorter ones on a short screen, see deli.css)
  const band = innerHeight <= 500 ? 70 : 118;
  view.fit(innerWidth / innerHeight, 1 - (2 * band) / innerHeight);
}
addEventListener("resize", resize);
resize();

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage may be blocked */ } },
};
$<HTMLInputElement>("name").value = store.get("cd-name") ?? "";
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
const MAP = params.get("map") ?? "";
/** Back out to Combe Downer: the same game name and map, out of the deli's front door. */
function streetUrl(code: string) {
  const u = new URL("./", location.href);
  if (code && code !== "SOLO") u.searchParams.set("room", code);
  if (MAP) u.searchParams.set("map", MAP);
  if (LOCAL) u.searchParams.set("net", "local");
  u.searchParams.set("up", "1");
  u.searchParams.set("from", "deli");
  return u.toString();
}
let party = roomParam;
let game: DeliGame | null = null;
function leave() { game?.dispose(); location.href = streetUrl(party); }
$<HTMLAnchorElement>("backout").href = streetUrl(roomParam);
if (roomParam) $<HTMLInputElement>("code").value = roomParam;

let micOn = store.get("cd-mic") !== "off";
$<HTMLInputElement>("micon").checked = micOn;
$<HTMLInputElement>("micon").onchange = (e) => {
  micOn = (e.target as HTMLInputElement).checked;
  game?.voice.mute(!micOn);
  store.set("cd-mic", micOn ? "on" : "off");
};

function start(code: string, net: Net, known: string[] = []) {
  const name = ($<HTMLInputElement>("name").value.trim() || "Cook").slice(0, 16);
  store.set("cd-name", name);
  SFX.unlock();
  party = code;
  game = new DeliGame(view, net, name, code, known);
  Telemetry.play("deli");
  Telemetry.begin("deli");
  game.voice.mute(!micOn);
  $("voiceopts").hidden = !game.voice.available;
  $("menu").hidden = true;
  $("hud").hidden = false;
  document.body.classList.toggle("touch", matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0);
  resize();
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("room", code);
  if (MAP) url.searchParams.set("map", MAP);
  if (LOCAL) url.searchParams.set("net", "local");
  if (code !== "SOLO") history.replaceState(null, "", url);
  else history.replaceState(null, "", location.pathname + (LOCAL ? "?net=local" : ""));
  $<HTMLInputElement>("invite").value = url.toString();
  $("invitebox").hidden = code === "SOLO";
  $("pauseroom").textContent = code === "SOLO" ? "Cooking on your own." : `Kitchen: ${code}. Send friends the link to cook with you.`;
}

/** Join the kitchen if it's open already, or open it. */
async function play(code: string) {
  const net = connect(room(code), LOCAL);
  if (net.media) askForMic();   // ask now, while the menu is up, not once the game has the mouse
  let cancelled = false;
  $("menuform").hidden = true;
  $("lookup").hidden = false;
  $("lookupmsg").textContent = `Looking for ${code}…`;
  $("lookcancel").onclick = () => { cancelled = true; net.leave(); $("lookup").hidden = true; $("menuform").hidden = false; };
  const cooks: string[] = [];
  const found = await new Promise<boolean>((resolve) => {
    let settle = 0;
    net.on("hello", (d, from) => {
      if (!d?.deli) return;
      if (!cooks.includes(from)) cooks.push(from);
      clearTimeout(settle);
      settle = window.setTimeout(() => resolve(true), 600);
    });
    setTimeout(() => resolve(cooks.length > 0), LOCAL ? 1500 : 8000);
  });
  if (cancelled) return;
  if (micPending()) {
    $("lookupmsg").textContent = "Allow the microphone so others can hear you (the browser is asking, at the top of the window)…";
    await micAnswered();
    if (cancelled) return;
  }
  start(code, net, cooks);
  game!.toast(found ? `Joining ${code}` : `You've opened ${code}. Menu has the invite link`, 4);
}

$("play").onclick = () => {
  const code = cleanCode($<HTMLInputElement>("code").value) || newRoomCode();
  if (code.length < 4 || code === "SOLO") { $("menuerr").textContent = "Pick a kitchen name of at least 4 letters or numbers."; return; }
  play(code);
};
const solo = () => start("SOLO", connect(room(`SOLO${Math.random().toString(36).slice(2, 8)}`), true));
$("solo").onclick = solo;
$<HTMLInputElement>("code").addEventListener("keydown", (e) => { if (e.key === "Enter") $("play").click(); });

// pausing: Esc or the menu button. The shift carries on (it's shared), but your hands are off.
function pause(on: boolean) {
  if (!game) return;
  $("pause").hidden = !on;
}
addEventListener("keydown", (e) => { if (e.code === "Escape" && game) pause($("pause").hidden); });
$("menubtn").onclick = () => pause(true);
$("resume").onclick = () => { pause(false); resumeFullscreen(); };
fullscreenButton($("fullscreen"));
resolutionButton($("resolution"), post);
$("leave").onclick = leave;
$("resleave").onclick = leave;
$("copy").onclick = async () => {
  const input = $<HTMLInputElement>("invite");
  try { await navigator.clipboard.writeText(input.value); $("copy").textContent = "Copied"; } catch { input.select(); }
  setTimeout(() => ($("copy").textContent = "Copy link"), 1800);
};

// ---- touch: a stick wherever you put your thumb on the left, and two big buttons on the right ----
const STICK = 56;
let stickId = -1, sx = 0, sy = 0;
const base = $("stickbase"), knob = $("stickknob");
canvas.addEventListener("pointerdown", (e) => {
  if (!game || e.pointerType === "mouse" || stickId >= 0) return;
  e.preventDefault();
  stickId = e.pointerId; sx = e.clientX; sy = e.clientY;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* already gone */ }
  base.style.transform = knob.style.transform = `translate(${sx}px, ${sy}px)`;
  base.hidden = knob.hidden = false;
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId !== stickId || !game) return;
  let dx = e.clientX - sx, dy = e.clientY - sy;
  const d = Math.hypot(dx, dy);
  if (d > STICK) { dx *= STICK / d; dy *= STICK / d; }
  knob.style.transform = `translate(${sx + dx}px, ${sy + dy}px)`;
  game.joy.x = dx / STICK; game.joy.y = dy / STICK;
});
const stickUp = (e: PointerEvent) => {
  if (e.pointerId !== stickId) return;
  stickId = -1;
  base.hidden = knob.hidden = true;
  if (game) game.joy.x = game.joy.y = 0;
};
canvas.addEventListener("pointerup", stickUp);
canvas.addEventListener("pointercancel", stickUp);
const hold = (id: string, on: () => void, off: () => void = () => {}) => {
  const el = $(id);
  el.addEventListener("pointerdown", (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch { /* gone */ } el.classList.add("on"); on(); });
  const end = () => { el.classList.remove("on"); off(); };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
};
hold("t-grab", () => game?.grab());
hold("t-chop", () => { if (game) game.chopHeld = true; }, () => { if (game) game.chopHeld = false; });

// straight in, from the deli door on the street
if (params.get("go") === "1") { if (roomParam && roomParam !== "SOLO") play(roomParam); else solo(); }

let last = performance.now();
let frames = 0, fpsT = 0;
function frame(now: number) {
  // the shift's clock runs on the host's frames, so a slow frame still counts (up to a tenth of a second)
  const raw = (now - last) / 1000, dt = Math.min(0.1, raw);
  last = now;
  if (game) { game.active = $("pause").hidden && $("results").hidden; if (!game.active) game.chopHeld = false; game.update(dt); }
  post.render(view.scene, null);
  frames++; fpsT += raw;
  if (fpsT >= 1) { (window as any).__fps = frames / fpsT; frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as any).__deli = () => game;
(window as any).__renderer = renderer;
