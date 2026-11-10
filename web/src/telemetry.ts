// Play counts: how many people play, for how long, which maps and mini-games, and how big the rooms
// get. Entirely optional: unless the build was given VITE_TELEMETRY_URL (the GitHub Pages builds
// are, local builds are not), every call here returns at once and nothing is read, written or sent.
// The player can also turn it off with ?telemetry=0, which is remembered.
//
// Nothing goes over the peer network. Events are batched and posted to the telemetry server
// (a separate service) fire and forget: if it is down, slow or refuses, they are dropped. Only the
// room's host (game.ts, hostId) reports the room's size, so a room is counted once.
//
// Every event says which copy of the game it came from (the page's address without the query), so
// the live site, forks and local copies are counted apart. The name the player chose rides along
// with the start, the once-a-minute beat and the end of the session, so the dashboard can say who
// is playing; never chat or voice. The end of the session also says how smoothly it ran: the kind
// of device, the model of its graphics chip as the browser names it, the frame rate and draw calls,
// whether it was in safe graphics, and the draw distance the automatic settings chose and how far
// they had to ease back.
// The start also says the browser's time zone and language, the site that linked to the game (its
// host only, and nothing when it is this site), a coarse screen size and whether the player is on a
// keyboard and mouse, a touch screen or a controller. The server records the connection's IP
// address with the session, along with a coarse location (country, region and town) worked out
// from it. ?telemetry=0 turns all of it off.
// In a multiplayer room it also says how the network treated the player (netcheck.ts): whether
// the relays that find other players answered, who was found, and what routes a link could take.
// Positions are only a coarse square (50 m) on the map, every half
// minute, sent without the name. Everything extra is counted in memory and rides along with the
// normal batches; the one-second look at what the player is doing is a timer, not part of the
// game's frame.
//
// The dashboard draws where people go over each map's own whole-map picture (minimap.ts). The game
// sends it: once the game has settled, in the browser's idle time, it asks the server which
// release of this map its picture is from, and if the server has none or an older one, sends the
// picture (a PNG of the map, nothing about the player) with its bounds and the map's release
// followed by the game's build, so a map rebuilt from the same data is pictured again. The
// server decides whether to keep it. Each browser stops offering once the server has that release, and only
// on a computer, which draws the picture at full size.

import type { WebGLRenderer } from "three";
import { site as thisSite } from "./features";

declare const __BUILD__: number;

const URL_ = import.meta.env.VITE_TELEMETRY_URL as string | undefined;
const FLUSH_MS = 30_000, BEAT_MS = 60_000, ROOM_POLL_MS = 5_000, ROOM_EVERY_MS = 60_000;
const MAX_QUEUE = 100, BATCH = 50;

interface Ev { k: string; b: string; s: string; test?: true; [field: string]: unknown }

let on = false, test = false, started = false, dead = false;
let browser = "", session = "", site = "", map = "", room = "";
let queue: Ev[] = [];
const open = new Map<string, number>();   // mini-games and modes in progress, and when they began
let roomWatching = false, playWatching = false;
const counts = new Map<string, number>();
const fpsBuckets = [0, 0, 0, 0];   // seconds spent under 20, 20-30, 30-50 and 50+ frames a second
let view = 0, far = 0;
// each second's average draw calls a frame, in bins of DRAW_BIN, so a 90th percentile costs nothing
const DRAW_BIN = 10;
const drawBins = new Uint32Array(400);
let drawSum = 0, drawFrames = 0, drawSecs = 0, drawTotal = 0, gpu: string | undefined;
let safeGfx: { safe: boolean; plain: boolean } | undefined;
let autoLook: (() => [number, number]) | undefined;

function pick(): string {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(16).padStart(2, "0")).join("");
}

function keep(store: Storage, key: string): string {
  try {
    let v = store.getItem(key);
    if (!v) { v = pick(); store.setItem(key, v); }
    return v;
  } catch { return pick(); }
}

function wanted(): boolean {
  const q = new URLSearchParams(location.search).get("telemetry");
  try {
    if (q === "0") localStorage.setItem("cd-telemetry", "0");
    else if (q === "1" || q === "test") localStorage.removeItem("cd-telemetry");
    return localStorage.getItem("cd-telemetry") !== "0";
  } catch { return q !== "0"; }
}

function device(): "phone" | "tablet" | "desktop" {
  const touch = navigator.maxTouchPoints > 1 || matchMedia("(pointer: coarse)").matches;
  const small = Math.min(screen.width, screen.height);
  return !touch ? "desktop" : small < 600 ? "phone" : "tablet";
}

// The last kind of input the player used, watched from the start so the menus count. A pad's own
// presses come in as made-up key events (gamepad.ts), which the browser marks as not from the person.
let input: "keyboard" | "touch" | "controller" | undefined;
if (URL_) {
  try {
    const by = (kind: typeof input) => (e: Event) => { if (e.isTrusted) input = kind; };
    addEventListener("keydown", by("keyboard"), { capture: true, passive: true });
    addEventListener("pointerdown", (e) => { if (e.isTrusted) input = e.pointerType === "touch" ? "touch" : "keyboard"; }, { capture: true, passive: true });
    addEventListener("gamepadconnected", () => { input = "controller"; });
  } catch { /* never reaches the game */ }
}

function mainInput(): string {
  if (input) return input;
  try { if (Array.from(navigator.getGamepads?.() ?? []).some((p) => p?.connected)) return "controller"; } catch { /* not allowed */ }
  return matchMedia("(pointer: coarse)").matches ? "touch" : "keyboard";
}

/** The screen's longer side, in bands too wide to tell one machine from another. */
function screenBand(): string {
  const w = Math.max(screen.width, screen.height);
  return w < 1000 ? "<1000" : w < 1400 ? "1000-1399" : w < 1920 ? "1400-1919" : w < 2560 ? "1920-2559" : "2560+";
}

/** Who linked here: the host only, and nothing when it's this site (moving between its own pages). */
function referrer(): string | undefined {
  try {
    if (!document.referrer) return undefined;
    const host = new URL(document.referrer).hostname.toLowerCase();
    return host && host !== location.hostname.toLowerCase() ? host.slice(0, 100) : undefined;
  } catch { return undefined; }
}

function details(): Record<string, string> {
  const d: Record<string, string> = { screen: screenBand(), input: mainInput() };
  try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (tz) d.tz = tz; } catch { /* old browser */ }
  if (navigator.language) d.lang = navigator.language;
  const ref = referrer();
  if (ref) d.ref = ref;
  return d;
}

function name(): string | undefined {
  try { return localStorage.getItem("cd-name")?.trim().slice(0, 24) || undefined; } catch { return undefined; }
}

function add(k: string, fields: Record<string, unknown> = {}) {
  const e: Ev = { k, b: browser, s: session, site, ...fields };
  if (test) e.test = true;
  if (queue.push(e) > MAX_QUEUE) queue.shift();
}

/** Normal flushes use fetch, so a server that refuses us is noticed and given up on for this page
 *  (one failed request, not one every half minute). Leaving the page needs sendBeacon. */
function flush(leaving = false) {
  while (queue.length && !dead) {
    const body = JSON.stringify(queue.splice(0, BATCH));
    try {
      if (leaving && navigator.sendBeacon) navigator.sendBeacon(URL_!, new Blob([body], { type: "text/plain" }));
      else fetch(URL_!, { method: "POST", body, mode: "no-cors", keepalive: true }).catch(() => { dead = true; });
    } catch { dead = true; }
  }
  if (dead) queue = [];
}

function init() {
  if (started) return;
  started = true;
  try {
    on = !!URL_ && wanted();
    if (!on) return;
    test = new URLSearchParams(location.search).get("telemetry") === "test";
    browser = keep(localStorage, "cd-tid");
    session = keep(sessionStorage, "cd-tsid");
    site = thisSite;
    setInterval(() => { if (document.visibilityState === "visible") add("beat", { name: name(), ...(room ? { room } : {}) }); }, BEAT_MS);
    setInterval(() => { try { sendCounts(); } catch { /* never reaches the game */ } flush(); }, FLUSH_MS);
    watchFps();
    addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(true); });
  } catch { on = false; }
}

function leave() {
  for (const name of [...open.keys()]) end(name);
  try {
    sendCounts();
    const dev = device();
    const props: Record<string, unknown> = { fps: fpsBuckets, view, far: Math.round(far / 100) * 100, touch: dev !== "desktop", device: dev };
    if (drawSecs) props.draws = [Math.round(drawTotal / drawSecs), drawP90()];
    if (gpu) props.gpu = gpu;
    if (safeGfx) Object.assign(props, safeGfx);
    if (autoLook) { const [v, d] = autoLook(); if (v) Object.assign(props, { autoView: v, stepped: d }); }
    add("sess", { name: name(), props });
  } catch { /* never reaches the game */ }
  flush(true);
}

/** The page is in play: a session on this map ("mines" and "deli" for those pages). */
export function play(id: string) {
  init();
  if (!on) return;
  map = id;
  try { add("start", { map, name: name(), device: device(), v: String(__BUILD__), ...details() }); } catch { /* never reaches the game */ }
}

const PICTURE_SETTLE_MS = 20_000, PICTURE_RETRY_MS = 10_000, PICTURE_TRIES = 30, PICTURE_SIZE = 2048;
let picturing = "";

type Picture = { canvas: HTMLCanvasElement; x0: number; y0: number; x1: number; y1: number };

/** Sends this map's whole-map picture to the server if it hasn't one from this release (see the top). */
export function offerPicture(id: string, dataRelease: string, look: () => Picture | null) {
  init();
  if (!on || !dataRelease || picturing === id) return;
  // a map can be rebuilt bigger from the same data release, so the picture is dated by the build
  // as well, which still sorts as newer on the server
  const release = `${dataRelease}.${__BUILD__}`;
  picturing = id;
  const key = "cd-tpic:" + id;
  try { if (localStorage.getItem(key) === release) return; } catch { return; }
  const base = URL_!.replace(/\/e\/?$/, "");
  const idle = (f: () => void) => { if ("requestIdleCallback" in window) requestIdleCallback(f, { timeout: 10_000 }); else setTimeout(f, 0); };
  let tries = 0;
  const attempt = () => idle(() => {
    if (map !== id) { picturing = ""; return; }
    const pic = look();
    if (!pic) { if (++tries < PICTURE_TRIES) setTimeout(attempt, PICTURE_RETRY_MS); return; }
    // touch devices draw it at half size: leave it to a computer
    if (pic.canvas.width < PICTURE_SIZE) return;
    sendPicture(base, id, release, key, pic).catch(() => {});
  });
  setTimeout(attempt, PICTURE_SETTLE_MS);
}

async function sendPicture(base: string, id: string, release: string, key: string, pic: Picture) {
  const r = await fetch(`${base}/maps/${encodeURIComponent(id)}.json`, { cache: "no-store" });
  if (r.ok) {
    const had = (await r.json())?.version;
    if (typeof had === "string" && !newer(release, had)) { try { localStorage.setItem(key, release); } catch { /* storage may be blocked */ } return; }
  } else if (r.status !== 404) return;
  const blob = await new Promise<Blob | null>((done) => pic.canvas.toBlob(done, "image/png"));
  if (!blob) return;
  const q = new URLSearchParams({ x0: String(pic.x0), y0: String(pic.y0), x1: String(pic.x1), y1: String(pic.y1), v: release });
  const sent = await fetch(`${base}/maps/${encodeURIComponent(id)}?${q}`, { method: "POST", body: blob });
  // only once the server has it, so a server that can't take pictures yet is asked again next time
  if (sent.status === 204 || sent.status === 409) try { localStorage.setItem(key, release); } catch { /* storage may be blocked */ }
}

/** Release a is newer than b, the way the server reckons it: runs of digits compare as numbers. */
function newer(a: string, b: string): boolean {
  const pa = a.match(/\d+|\D+/g) ?? [], pb = b.match(/\d+|\D+/g) ?? [];
  for (let i = 0; ; i++) {
    const x = pa[i], y = pb[i];
    if (x === undefined) return false;
    if (y === undefined) return true;
    if (x === y) continue;
    const nx = /^\d/.test(x), ny = /^\d/.test(y);
    if (nx && ny) return +x > +y;
    return nx === ny ? x > y : ny;
  }
}

/** A mini-game or mode begins (a race, a ball to kick, the mines). */
export function begin(mode: string) {
  if (!on || open.has(mode)) return;
  open.set(mode, performance.now());
  try { add("mode_start", { mode }); } catch { /* never reaches the game */ }
}

/** It ends. Does nothing if it isn't running. */
export function end(mode: string) {
  const t = open.get(mode);
  if (!on || t === undefined) return;
  open.delete(mode);
  try { add("mode_end", { mode, secs: Math.round((performance.now() - t) / 1000) }); } catch { /* never reaches the game */ }
}

/** Something with no length worth timing, like calling a bus. */
export function note(mode: string) {
  if (!on) return;
  try { add("mode_start", { mode }); } catch { /* never reaches the game */ }
}

async function hashed(code: string): Promise<string | null> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("cd-room:" + code));
  return Array.from(new Uint8Array(d).slice(0, 6), (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Only the host reports the size, only when the count changes, and no more than once a minute.
 *  Everyone's beats carry the scrambled code, so the dashboard can list who is in each room. */
export function watchRoom(look: () => { code: string; host: boolean; players: number } | null) {
  init();
  if (!on || roomWatching) return;
  roomWatching = true;
  let sent = "", last = 0, code = "";
  setInterval(() => {
    try {
      const r = look();
      const now = r && r.code !== "SOLO" ? r.code : "";
      if (now !== code) {
        code = now; room = "";
        if (now) hashed(now).then((h) => { if (h && code === now) room = h; }).catch(() => {});
      }
      if (!r || !r.host || r.code === "SOLO" || document.visibilityState !== "visible") return;
      const key = r.code + ":" + r.players;
      if (key === sent || performance.now() - last < ROOM_EVERY_MS) return;
      sent = key; last = performance.now();
      hashed(r.code).then((room) => { if (room) add("room", { room, players: r.players }); }).catch(() => {});
    } catch { /* never reaches the game */ }
  }, ROOM_POLL_MS);
}

const FAIL_MAX = 25;   // failures sent in one visit, at most
const failed = new Set<string>();
let failFlush = 0;

/** Something went wrong in the browser (errors.ts): sent once per kind, message and place a visit,
 *  and soon, in case the page is about to die. */
export function failure(kind: string, what: string, where = "", extra: Record<string, unknown> = {}) {
  init();
  if (!on) return;
  const key = `${kind}|${what}|${where}`;
  if (failed.has(key) || failed.size >= FAIL_MAX) return;
  failed.add(key);
  try {
    add("err", { kind, what: what.slice(0, 300), where: where.slice(0, 200), map, ...(room ? { room } : {}), ...extra });
    clearTimeout(failFlush);
    failFlush = window.setTimeout(() => flush(), 3000);
  } catch { /* never reaches the game */ }
}

/** Whether anything here is being sent (netcheck.ts skips its own work when not). */
export const enabled = () => { init(); return on; };

/** How the network treated this player in a room (netcheck.ts), under the room's scrambled code. */
export function netReport(code: string, fields: Record<string, unknown>) {
  if (!on) return;
  hashed(code).then((room) => { if (room) add("net", { room, ...fields }); }).catch(() => {});
}

/** Something happened that is worth a tally (a shot with a weapon, a kill). Sent as totals. */
export function count(name: string, n = 1) {
  if (!on) return;
  counts.set(name, (counts.get(name) ?? 0) + n);
}

/** Every kill and death in the match, as the player sees them. */
export function matchEvent(kind: string, byMe: boolean, toMe: boolean) {
  if (!on) return;
  if (byMe && kind.endsWith("kill")) count("kill:" + (KILLED[kind] ?? kind));
  if (toMe && kind === "kill") count("death");
}
const KILLED: Record<string, string> = { kill: "player", ckill: "naughtyboy", kkill: "cat", bkill: "bendy" };

function sendCounts() {
  for (const [mode, n] of counts) add("count", { mode, n });
  counts.clear();
}

/** What the crash guard chose (safegfx.ts): safe graphics after a crash, and the plain picture buffer. */
export function graphics(safe: boolean, plain: boolean) {
  safeGfx = { safe, plain };
}

/** The automatic settings (quality.ts): the draw distance they chose at the start (0 if the player
 *  chose their own), and the most steps the governor took below it. */
export function quality(look: () => [number, number]) {
  autoLook = look;
}

/** After each frame is drawn (post.ts). */
export function drawn(renderer: WebGLRenderer) {
  if (!on) return;
  drawSum += renderer.info.render.calls;
  drawFrames++;
  if (gpu === undefined) gpu = gpuName(renderer);
}

function drawP90(): number {
  let seen = 0;
  for (let i = 0; i < drawBins.length; i++) if ((seen += drawBins[i]) >= drawSecs * 0.9) return i * DRAW_BIN + DRAW_BIN / 2;
  return drawBins.length * DRAW_BIN;
}

/** The chip's model, without the browser's wrapping: "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified
 *  Version)" is "Apple M2", "Adreno (TM) 750" is "Adreno 750". */
function gpuName(renderer: WebGLRenderer): string {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    let s = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
    const angle = /^ANGLE \((.*)\)$/.exec(s);
    if (angle) { const parts = angle[1].split(", "); s = parts[parts.length > 1 ? 1 : 0]; }
    s = s.replace(/^ANGLE \w+ Renderer: /, "").replace(/\((R|TM|tm)\)/g, "").replace(/\s*\(0x[0-9a-f]+\)/gi, "")
      .replace(/ Direct3D.*$| OpenGL Engine$|, or similar$|\/PCIe.*$|\/SSE2.*$/, "").replace(/^Mesa /, "").replace(/\s+/g, " ").trim();
    return s.slice(0, 48);
  } catch { return ""; }
}

function watchFps() {
  let frames = 0, last = performance.now();
  const tick = (t: number) => {
    frames++;
    if (t - last >= 1000) {
      if (document.visibilityState === "visible" && t - last < 2500) {
        const f = (frames * 1000) / (t - last);
        fpsBuckets[f < 20 ? 0 : f < 30 ? 1 : f < 50 ? 2 : 3]++;
        if (drawFrames) {
          const d = drawSum / drawFrames;
          drawBins[Math.min(drawBins.length - 1, Math.floor(d / DRAW_BIN))]++;
          drawTotal += d; drawSecs++;
        }
      }
      drawSum = 0; drawFrames = 0;
      frames = 0; last = t;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** What the player is doing and where, looked at once a second: a ride is a mode that begins and
 *  ends as `doing` changes, and every half minute the 50 m square they stand in is noted. */
export function watchPlay(look: () => { x: number; y: number; doing: string | null; view: number } | null) {
  init();
  if (!on || playWatching) return;
  playWatching = true;
  let doing: string | null = null, ticks = 0;
  setInterval(() => {
    try {
      const s = look();
      if (!s) return;
      view = s.view;
      far = Math.max(far, Math.hypot(s.x, s.y));
      if (s.doing !== doing) {
        if (doing) end(doing);
        doing = s.doing;
        if (doing) begin(doing);
      }
      if (++ticks % 30 === 0 && document.visibilityState === "visible") add("pos", { map, props: { x: Math.round(s.x / 50) * 50, y: Math.round(s.y / 50) * 50 } });
    } catch { /* never reaches the game */ }
  }, 1000);
}
