// The Settings page: one place for how the game looks, feels and sounds, opened from the main menu
// and the pause menu. It opens on an index (BathText page 200: teletext.ts) of its groups, Video,
// Controls, Controller (once a pad's been seen), Play and Sound, and each opens on a page of its own
// (201 to 205) with Back to the index; Esc goes back a page, and the × closes it all. Everything on it is kept in this browser's localStorage, so it's the same
// next time you play on this computer (each under the key it has always used: cd-res, cd-sens,
// cd-music and so on, so settings chosen before there was a page carry over). Nothing here goes
// over the network.
//
// Passive mode also has a tickbox of its own on the main menu, under the game name, kept in step with this one.
// Beside it on the menu is free play: explore all of the map with no zones (zones.ts), the host's say.
//
// Video: automatic (quality.ts), draw distance (view.ts), resolution, the retro look and depth of field (post.ts), field of view (view.ts,
// used by game.ts), how far the shadows reach (Off to Ultra, a share of the draw distance: shadows.ts), and
// how much scenery is drawn in full round you (grass and trees, Low to Max: view.ts), how far off lit street lamps show after dark and how many light the street (Low to Max: view.ts, world.ts), the debug panel (debug.ts, also F3), and the new ground (world.ts; changing it in a game reloads the page where you stand). Choosing a distance, resolution or shadows yourself turns automatic off.
// Controls: mouse sensitivity, turning the look round for the mouse and
// for touch (invert.ts), and once a controller's been seen, its own look speeds, invert, dead zone, turn boost and
// rumble (gamepad.ts keeps those).
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
import { invertSettings, resetInvert } from "./invert";
import { closeButton } from "./modal";
import { RES_DEFAULT, RES_STEPS, depthOfField, setDepthOfField, type Post } from "./post";
import { quality } from "./quality";
import { SHADOW_DEFAULT, SHADOW_LEVELS, SHADOW_OFF, setShadowLevel, shadowLevel, shadowLevelName, shadowReach } from "./shadows";
import { DETAIL_DEFAULT, DETAIL_LEVELS, FOV_DEFAULT, LIGHT_DEFAULT, LIGHT_LEVELS, lightLevel, setLights, VIEW_DEFAULT, VIEW_STEPS, detailLevel, setDetail, setFov, setView, view } from "./view";

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

/** How far the shadows reach (shadows.ts), kept on this computer: 0 is off, and 1, what "on" was before
 *  there were levels, is Low. Call before the first frame. */
export function initShadows(renderer: THREE.WebGLRenderer) {
  setShadowLevel(load("cd-shadows", SHADOW_DEFAULT));
  renderer.shadowMap.enabled = shadowLevel > SHADOW_OFF;
}

interface Hooks {
  post: Post;
  debug: DebugPanel;
  renderer: THREE.WebGLRenderer;
  /** The scene on screen now, to redo its materials when shadows are turned on or off. */
  scene: () => THREE.Scene;
  /** Mouse sensitivity changed (the game turns it into radians per pixel). */
  onSensitivity: (v: number) => void;
  /** Where to reload to so you come back where you're standing (null with no game on): the ground is built as each square loads. */
  here: () => string | null;
}

/** Wire up the Settings page and the buttons that open it. Returns what the automatic settings (quality.ts) need. */
export function settingsPage(h: Hooks) {
  const el = $("settings");
  const viewSel = $<HTMLSelectElement>("set-view"), resSel = $<HTMLSelectElement>("set-res");
  const fov = $<HTMLInputElement>("set-fov"), fovVal = $("set-fov-val");
  const auto = $<HTMLInputElement>("set-auto");
  const ground = $<HTMLInputElement>("set-ground");
  const detail = $<HTMLSelectElement>("set-detail"), detailHint = $("set-detail-hint");
  const lights = $<HTMLSelectElement>("set-lights"), lightsHint = $("set-lights-hint");
  const shadows = $<HTMLSelectElement>("set-shadows"), shadowsHint = $("set-shadows-hint"), fx = $<HTMLInputElement>("set-fx"), dof = $<HTMLInputElement>("set-dof"), dbg = $<HTMLInputElement>("set-debug");
  const calm = $<HTMLInputElement>("set-passive"), menuCalm = $<HTMLInputElement>("menu-passive");
  const sens = $<HTMLInputElement>("sens"), music = $<HTMLInputElement>("music"), sfx = $<HTMLInputElement>("sfx"), bg = $<HTMLInputElement>("bgvol"), voice = $<HTMLInputElement>("voice");

  const option = (sel: HTMLSelectElement, value: string, text: string) => {
    const o = document.createElement("option"); o.value = value; o.textContent = text; sel.append(o);
  };
  // the draw distances, with this device's own default (and whatever ?view= asked for) among them
  const dists = [...new Set([...VIEW_STEPS, VIEW_DEFAULT, view.fogFar])].sort((a, b) => a - b);
  for (const m of dists) option(viewSel, String(m), `${m >= 1000 ? `${m / 1000} km` : `${m} m`}${m === VIEW_DEFAULT ? " (normal)" : ""}`);
  SHADOW_LEVELS.forEach((_, i) => option(shadows, String(i), shadowLevelName(i)));
  /** How far the shadows reach at the draw distance in force. */
  const showReach = () => {
    const m = shadowReach();
    shadowsHint.textContent = m ? `At this draw distance they reach ${m >= 1000 ? `${+(m / 1000).toFixed(1)} km` : `${m} m`}. Further is slower.` : "No shadows: the quickest.";
  };
  DETAIL_LEVELS.forEach((l, i) => option(detail, String(i), `${l.name}${i === DETAIL_DEFAULT ? " (normal)" : ""}`));
  const showDetail = () => {
    const l = DETAIL_LEVELS[detailLevel];
    detailHint.textContent = `Grass to ${l.grass} m round you, trees in full to ${l.trees[0]} m and simpler to ${l.trees[1]} m. More is slower.`;
  };
  LIGHT_LEVELS.forEach((l, i) => option(lights, String(i), `${l.name}${i === LIGHT_DEFAULT ? " (normal)" : ""}`));
  const showLights = () => {
    const l = LIGHT_LEVELS[lightLevel], p = l.lit;
    const far = l.pools * l.step / 2, reach = far >= 1000 ? `${+(far / 1000).toFixed(1)} km` : `${far} m`;
    lightsHint.textContent = `How far off lit street lamps show after dark (from the drone too): ${p === 0 ? "the usual number" : p > 0 ? `${p} more` : `${-p} fewer`} light the street round you${l.pools ? `, and their pools of light show on the streets to ${reach}` : ""}. More is slower.`;
  };
  RES_STEPS.forEach((r, i) => option(resSel, String(i), r.lines ? `${r.name} (${r.lines} lines)` : `${r.name} (your screen's own)`));

  /** Show what's in force now. */
  const show = () => {
    auto.checked = quality.auto;
    if (![...viewSel.options].some((o) => o.value === String(view.fogFar))) option(viewSel, String(view.fogFar), `${view.fogFar} m`);
    viewSel.value = String(view.fogFar);
    resSel.value = String(h.post.resolution);
    fov.value = String(view.fov); fovVal.textContent = `${view.fov}°`;
    shadows.value = String(shadowLevel); showReach();
    detail.value = String(detailLevel); showDetail();
    lights.value = String(lightLevel); showLights();
    fx.checked = h.post.retroLook;
    dof.checked = depthOfField;
    dbg.checked = h.debug.open;
    ground.checked = load("cd-ground", 1) !== 0;
    calm.checked = passive;
    sens.value = String(sensitivity);
    music.value = String(load("cd-music", MUSIC));
    sfx.value = String(load("cd-sfx", SFX_VOL));
    bg.value = String(load("cd-bg", BACKGROUND));
    voice.value = String(load("cd-voice", VOICE));
  };

  const setShadows = (level: number, remember = true) => {
    setShadowLevel(level);
    if (remember) keep("cd-shadows", shadowLevel);
    showReach();
    const on = shadowLevel > SHADOW_OFF;
    if (h.renderer.shadowMap.enabled === on) return;
    h.renderer.shadowMap.enabled = on;
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
  invertSettings();
  const setSens = (v: number) => { sensitivity = v; keep("cd-sens", v); h.onSensitivity(v); };

  auto.onchange = () => { if (auto.checked) quality.automatic(); else quality.manual(); show(); };
  viewSel.onchange = () => { quality.manual(); setView(Number(viewSel.value), true); h.debug.showView(); showReach(); };
  resSel.onchange = () => { quality.manual(); h.post.setResolution(Number(resSel.value)); };
  fov.oninput = () => { setFov(Number(fov.value)); fovVal.textContent = `${view.fov}°`; };
  shadows.onchange = () => { quality.manual(); setShadows(Number(shadows.value)); };
  detail.onchange = () => { setDetail(Number(detail.value), true); showDetail(); };
  lights.onchange = () => { setLights(Number(lights.value), true); showLights(); };
  fx.onchange = () => h.post.setRetroLook(fx.checked);
  dof.onchange = () => setDepthOfField(dof.checked);
  dbg.onchange = () => h.debug.toggle(dbg.checked);
  // squares already built keep the ground they were built with, so this takes from the next game
  ground.onchange = () => {
    keep("cd-ground", ground.checked);
    const url = h.here();
    if (url) location.replace(url);
  };
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
    setShadows(SHADOW_DEFAULT);
    quality.automatic();
    h.post.setRetroLook(true);
    h.debug.toggle(false);
    setPassive(false);
    setProgression(null); prog.checked = progressionDefault; showRoam();
    setSens(SENS);
    resetPadSettings();
    resetInvert();
    SFX.setMusicVolume(MUSIC); keep("cd-music", MUSIC);
    SFX.setSfxVolume(SFX_VOL); keep("cd-sfx", SFX_VOL);
    SFX.setBackgroundVolume(BACKGROUND); keep("cd-bg", BACKGROUND);
    SFX.setVoiceVolume(VOICE); keep("cd-voice", VOICE);
    show();
  };

  // the index, and a page for each group: only one shows at a time
  const groups = [...el.querySelectorAll<HTMLFieldSetElement>("fieldset.setgroup")];
  const index = $("setindex"), back = $("setback"), done = $("setdone"), reset = $("setreset"), hint = $("sethint");
  const title = el.querySelector<HTMLElement>(".tttitle .ttdh"), pageNo = [el.querySelector(".ttbar .ttp"), el.querySelector(".ttbar .ttno")];
  let at: HTMLFieldSetElement | null = null;
  const page = (g: HTMLFieldSetElement | null) => {
    const from = at;
    at = g;
    for (const f of groups) f.classList.toggle("on", f === g);
    index.hidden = hint.hidden = reset.hidden = !!g;
    back.hidden = !g;
    const n = g?.dataset.page ?? "200";
    if (pageNo[0]) pageNo[0].textContent = `P${n}`;
    if (pageNo[1]) pageNo[1].textContent = n;
    if (title) title.textContent = g ? `Settings: ${g.querySelector("legend")?.textContent ?? ""}` : "Settings";
    if (g) { back.focus(); return; }
    // the index, written afresh each time: the Controller page is only there once a pad's been seen
    index.replaceChildren(...groups.filter((f) => !f.hidden).map((f) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "settingsbtn"; b.dataset.page = f.dataset.page ?? "";
      b.textContent = f.querySelector("legend")?.textContent ?? "";
      b.onclick = () => page(f);
      return b;
    }));
    const was = [...index.children].find((b) => (b as HTMLElement).dataset.page === from?.dataset.page) as HTMLElement | undefined;
    (was ?? (index.firstElementChild as HTMLElement | null) ?? done).focus();
  };
  back.onclick = () => page(null);
  const open = () => { show(); el.hidden = false; page(null); };
  const close = () => { el.hidden = true; };
  $("setdone").onclick = close;
  closeButton(el.querySelector<HTMLElement>(".card") ?? el, close);
  for (const id of ["settingsbtn", "settingsbtn2"]) $(id).onclick = open;
  // keep taps on the page from reaching the game's touch controls underneath
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
  // Esc goes back to the index from a group, or closes the page from the index, before the game sees the key
  addEventListener("keydown", (e) => {
    if (e.code === "Escape" && !el.hidden) { e.stopImmediatePropagation(); e.preventDefault(); if (at) page(null); else close(); }
  }, true);
  return {
    setRes: (i: number) => h.post.setResolution(i, false),
    setShadows: (level: number) => setShadows(level, false),
    resolution: () => h.post.resolution,
    shadows: () => shadowLevel,
    shown: () => { if (!el.hidden) show(); h.debug.showView(); },
  };
}
