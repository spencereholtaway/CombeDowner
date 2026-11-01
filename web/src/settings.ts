// The Settings page: one place for how the game looks, feels and sounds, opened from the main menu
// and the pause menu. Everything on it is kept in this browser's localStorage, so it's the same
// next time you play on this computer (each under the key it has always used: cd-res, cd-sens,
// cd-music and so on, so settings chosen before there was a page carry over). Nothing here goes
// over the network.
//
// Passive mode also has a tickbox of its own on the main menu, under the game name, kept in step with this one.
// Beside it on the menu is free play: explore all of the map with no zones (zones.ts), the host's say.
//
// Picture: automatic (quality.ts), draw distance (view.ts), resolution and the retro look (post.ts), field of view (view.ts,
// used by game.ts), shadows, and the debug panel (debug.ts, also F3). Choosing a distance, resolution or
// shadows yourself turns automatic off. Controls: mouse sensitivity, and
// once a controller's been seen, its own look speeds, dead zone, turn boost and rumble (gamepad.ts keeps those).
// Sound: music, sound effects, background (traffic, birds, wind) and voice chat volumes (audio.ts). Play: passive mode, where nothing in the
// game comes for anyone (cats, naughty boys and the teams, the Flag Lads, Bendy, seagull muck), and
// progression, the zones, strange objects and challenges together (features.ts). Both are for
// the whole game and the host's setting is the one that counts: game.ts sends them round. ?view=, ?fx=0 and ?res=full in the
// address still try something for one visit without changing what's kept.
import * as THREE from "three";
import * as SFX from "./audio";
import type { DebugPanel } from "./debug";
import { mine, progressionDefault, setProgression } from "./features";
import { resetPadSettings } from "./gamepad";
import { RES_DEFAULT, RES_STEPS, type Post } from "./post";
import { quality } from "./quality";
import { FOV_DEFAULT, VIEW_DEFAULT, VIEW_STEPS, setFov, setView, view } from "./view";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function load(key: string, fallback: number) {
  try { const s = localStorage.getItem(key); const v = Number(s); return s !== null && Number.isFinite(v) ? v : fallback; } catch { return fallback; }
}
function keep(key: string, v: number | boolean) {
  try { localStorage.setItem(key, typeof v === "boolean" ? (v ? "1" : "0") : String(v)); } catch { /* private window: just this visit */ }
}

const SENS = 1, MUSIC = 0.6, SFX_VOL = 1, BACKGROUND = 1, VOICE = 1;

/** Your passive mode setting: if you're host, nothing the game runs attacks anyone (game.ts). Other players still can. */
export let passive = load("cd-passive", 0) === 1;

/** Explore all of the map with no zones (zones.ts): if you're host, for the whole room. ?progression=0 (features.ts) does it for one visit. */
export let freeRoam = load("cd-freeroam", 0) === 1;

/** Mouse sensitivity, as a multiple of the normal. */
export let sensitivity = load("cd-sens", SENS) || SENS;

// the sound settings apply straight away, before anything plays
SFX.setMusicVolume(load("cd-music", MUSIC));
SFX.setSfxVolume(load("cd-sfx", SFX_VOL));
SFX.setBackgroundVolume(load("cd-bg", BACKGROUND));
SFX.setVoiceVolume(load("cd-voice", VOICE));

/** Shadows on or off, kept on this computer. Call before the first frame. */
export function initShadows(renderer: THREE.WebGLRenderer) {
  renderer.shadowMap.enabled = load("cd-shadows", 1) !== 0;
}

interface Hooks {
  post: Post;
  debug: DebugPanel;
  renderer: THREE.WebGLRenderer;
  /** The scene on screen now, to redo its materials when shadows are turned on or off. */
  scene: () => THREE.Scene;
  /** Mouse sensitivity changed (the game turns it into radians per pixel). */
  onSensitivity: (v: number) => void;
}

/** Wire up the Settings page and the buttons that open it. Returns what the automatic settings (quality.ts) need. */
export function settingsPage(h: Hooks) {
  const el = $("settings");
  const viewSel = $<HTMLSelectElement>("set-view"), resSel = $<HTMLSelectElement>("set-res");
  const fov = $<HTMLInputElement>("set-fov"), fovVal = $("set-fov-val");
  const auto = $<HTMLInputElement>("set-auto");
  const shadows = $<HTMLInputElement>("set-shadows"), fx = $<HTMLInputElement>("set-fx"), dbg = $<HTMLInputElement>("set-debug");
  const calm = $<HTMLInputElement>("set-passive"), menuCalm = $<HTMLInputElement>("menu-passive");
  const sens = $<HTMLInputElement>("sens"), music = $<HTMLInputElement>("music"), sfx = $<HTMLInputElement>("sfx"), bg = $<HTMLInputElement>("bgvol"), voice = $<HTMLInputElement>("voice");

  const option = (sel: HTMLSelectElement, value: string, text: string) => {
    const o = document.createElement("option"); o.value = value; o.textContent = text; sel.append(o);
  };
  // the draw distances, with this device's own default (and whatever ?view= asked for) among them
  const dists = [...new Set([...VIEW_STEPS, VIEW_DEFAULT, view.fogFar])].sort((a, b) => a - b);
  for (const m of dists) option(viewSel, String(m), `${m >= 1000 ? `${m / 1000} km` : `${m} m`}${m === VIEW_DEFAULT ? " (normal)" : ""}`);
  RES_STEPS.forEach((r, i) => option(resSel, String(i), r.lines ? `${r.name} (${r.lines} lines)` : `${r.name} (your screen's own)`));

  /** Show what's in force now. */
  const show = () => {
    auto.checked = quality.auto;
    if (![...viewSel.options].some((o) => o.value === String(view.fogFar))) option(viewSel, String(view.fogFar), `${view.fogFar} m`);
    viewSel.value = String(view.fogFar);
    resSel.value = String(h.post.resolution);
    fov.value = String(view.fov); fovVal.textContent = `${view.fov}°`;
    shadows.checked = h.renderer.shadowMap.enabled;
    fx.checked = h.post.retroLook;
    dbg.checked = h.debug.open;
    calm.checked = passive;
    sens.value = String(sensitivity);
    music.value = String(load("cd-music", MUSIC));
    sfx.value = String(load("cd-sfx", SFX_VOL));
    bg.value = String(load("cd-bg", BACKGROUND));
    voice.value = String(load("cd-voice", VOICE));
  };

  const setShadows = (on: boolean, remember = true) => {
    if (h.renderer.shadowMap.enabled === on) return;
    h.renderer.shadowMap.enabled = on;
    if (remember) keep("cd-shadows", on);
    // materials are built for shadows or not, so each has to be put together again
    h.scene().traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
    });
  };
  // passive mode has a tickbox on the main menu too, and the two always agree
  const setPassive = (on: boolean) => { passive = on; keep("cd-passive", on); calm.checked = menuCalm.checked = on; };
  calm.checked = menuCalm.checked = passive;
  const roam = $<HTMLInputElement>("menu-freeroam");
  // with the zones switched off there's nothing but free play, so no choice to make
  const showRoam = () => { const l = roam?.closest("label"); if (l) l.style.display = mine.zones ? "" : "none"; };
  showRoam();
  const prog = $<HTMLInputElement>("set-progression");
  prog.checked = mine.zones;
  prog.onchange = () => { setProgression(prog.checked); showRoam(); };
  if (roam) { roam.checked = freeRoam; roam.onchange = () => { freeRoam = roam.checked; keep("cd-freeroam", roam.checked); }; }
  const setSens = (v: number) => { sensitivity = v; keep("cd-sens", v); h.onSensitivity(v); };

  auto.onchange = () => { if (auto.checked) quality.automatic(); else quality.manual(); show(); };
  viewSel.onchange = () => { quality.manual(); setView(Number(viewSel.value), true); h.debug.showView(); };
  resSel.onchange = () => { quality.manual(); h.post.setResolution(Number(resSel.value)); };
  fov.oninput = () => { setFov(Number(fov.value)); fovVal.textContent = `${view.fov}°`; };
  shadows.onchange = () => { quality.manual(); setShadows(shadows.checked); };
  fx.onchange = () => h.post.setRetroLook(fx.checked);
  dbg.onchange = () => h.debug.toggle(dbg.checked);
  calm.onchange = () => setPassive(calm.checked);
  menuCalm.onchange = () => setPassive(menuCalm.checked);
  sens.oninput = () => setSens(Number(sens.value));
  music.oninput = () => { SFX.setMusicVolume(Number(music.value)); keep("cd-music", Number(music.value)); };
  sfx.oninput = () => { SFX.setSfxVolume(Number(sfx.value)); keep("cd-sfx", Number(sfx.value)); };
  bg.oninput = () => { SFX.setBackgroundVolume(Number(bg.value)); keep("cd-bg", Number(bg.value)); };
  voice.oninput = () => { SFX.setVoiceVolume(Number(voice.value)); keep("cd-voice", Number(voice.value)); };

  $("setreset").onclick = () => {
    setView(VIEW_DEFAULT, true); h.debug.showView();
    h.post.setResolution(RES_DEFAULT);
    setFov(FOV_DEFAULT);
    setShadows(true);
    quality.automatic();
    h.post.setRetroLook(true);
    h.debug.toggle(false);
    setPassive(false);
    setProgression(null); prog.checked = progressionDefault; showRoam();
    setSens(SENS);
    resetPadSettings();
    SFX.setMusicVolume(MUSIC); keep("cd-music", MUSIC);
    SFX.setSfxVolume(SFX_VOL); keep("cd-sfx", SFX_VOL);
    SFX.setBackgroundVolume(BACKGROUND); keep("cd-bg", BACKGROUND);
    SFX.setVoiceVolume(VOICE); keep("cd-voice", VOICE);
    show();
  };

  const open = () => { show(); el.hidden = false; $("setdone").focus(); };
  const close = () => { el.hidden = true; };
  $("setdone").onclick = close;
  for (const id of ["settingsbtn", "settingsbtn2"]) $(id).onclick = open;
  // keep taps on the page from reaching the game's touch controls underneath
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
  // Esc closes the page, back to the menu it was opened from, before the game sees the key
  addEventListener("keydown", (e) => {
    if (e.code === "Escape" && !el.hidden) { e.stopImmediatePropagation(); e.preventDefault(); close(); }
  }, true);
  return {
    setRes: (i: number) => h.post.setResolution(i, false),
    setShadows: (on: boolean) => setShadows(on, false),
    resolution: () => h.post.resolution,
    shadows: () => h.renderer.shadowMap.enabled,
    shown: () => { if (!el.hidden) show(); h.debug.showView(); },
  };
}
