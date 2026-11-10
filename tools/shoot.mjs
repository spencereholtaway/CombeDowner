// Screenshots of the streets game, for checking a change by eye, quickly. It serves a built game
// (web/dist), opens it in a muted headless Chrome that can't make a sound or take the mouse, and
// takes each view from the menu's backdrop, which draws the map without starting a game. Instead
// of waiting a fixed time, it waits until every square round the view has loaded and been built,
// then shoots, then moves on in the same page, so a view takes a second or two on a Mac, not 20.
//
//   cd web && npm run shoot -- views.json --out shots --tag after     (builds the game first)
//   node tools/shoot.mjs views.json --out shots --tag after            (shoots the last build)
//   node tools/shoot.mjs "1520.4,-310.2,85,-4" "1490,-300,40,-25,60" --out shots
//
// A view is the same as ?at= in the address (and what Shift+F3 copies in the game):
// "east,north,bearing,tilt" in data metres and degrees, plus an optional fifth number, the height
// above the ground to look from (1.7, eye height, if left out). A views file is
// {"name": "east,north,bearing,tilt[,height]", ...}; a view can also be {"at": "...", "time": "21:30"}
// for another time of day, or [cam east, cam north, height, look east, look north, look height]
// (heights above the ground; below nought, above the floor of the tunnel there) to look at a spot
// rather than in a direction.
//
// It uses the Chrome installed on the machine (Playwright's "chrome" channel), so there's no
// browser to download. Options: --dist web/dist, --out shots, --tag <added to each file name>, --map combe-down,
// --time 11:00 (the clock stopped there; "now" for the real one), --size 1280x720, --fx 0 (no
// retro colour grade), --view 1200 (draw distance), --play (start a solo game and shoot from it,
// for traffic, naughty boys and the rest that the menu doesn't run; slower), --timeout 60 (seconds a view
// may take to load before it's shot anyway, with a warning), --query "portal=b,440,4470" (more of
// the address, to try one of the game's own options). PW=<path to playwright> if it isn't
// installed where node can find it; CHROME=<a Chrome or Chromium> to use that one.
//
// Writes <out>/<name>[-<tag>].png for each view, and <out>/shots.json with how long each took,
// the longest slice each part of building a square took, the frame rate, what the last frame drew (in all, and square by square for the main view: the
// ground, the street and path faces, water, structures and the rest) and anything the page
// complained about.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext, silenceNote } from "./quiet-guard.mjs";

// Playwright from PW if given, else the game's own (web/node_modules, after npm install), else wherever node finds it
const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();

// ---- what to shoot ---------------------------------------------------------------------------
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "shots", tag: "", map: "combe-down", time: "11:00", size: "1280x720", timeout: "60" };
const given = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--play") opt.play = true;
  else if (a.startsWith("--")) opt[a.slice(2)] = argv[++i];
  else given.push(a);
}
if (!given.length) { console.error("usage: node tools/shoot.mjs <views.json | east,north,bearing,tilt[,height] ...> [--out shots] [--tag t] ..."); process.exit(1); }
const views = [];
for (const g of given) {
  if (g.endsWith(".json")) for (const [name, v] of Object.entries(JSON.parse(fs.readFileSync(g, "utf8")))) views.push({ name, ...norm(v) });
  else views.push({ name: `view-${views.length + 1}`, ...norm(g) });
}
function norm(v) {
  if (typeof v === "string") return { at: v };
  if (Array.isArray(v)) return { look: v };
  return { at: v.at, look: v.look, time: v.time };
}
const [W, H] = opt.size.split("x").map(Number);
fs.mkdirSync(opt.out, { recursive: true });

// ---- serve the built game ---------------------------------------------------------------------
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm" };
const server = http.createServer((q, res) => {
  let f = path.join(opt.dist, decodeURIComponent(q.url.split("?")[0]));
  if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, b) => {
    if (e) { res.statusCode = 404; return res.end(); }
    res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream");
    res.end(b);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));     // any free port, so two runs can't clash
const port = server.address().port;

// ---- a muted headless Chrome, with the page's sound switched off as well -----------------------
const linux = process.platform === "linux";
const bundled = linux && fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null;
const exe = process.env.CHROME || bundled;
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : { channel: "chrome" }),
  // with no graphics card (a cloud container), draw in software
  args: [...MUTED_ARGS,
    ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
// no sound can play: see tools/quiet-guard.mjs (the context's guards and the page's, before any goto)
const context = await browser.newContext({ viewport: { width: W, height: H } });
await silenceContext(context);
const page = await context.newPage();
await silence(page);
// (the longest slice of each part of building a square, tiles.ts)
await page.addInitScript(() => { window.__sliceMax = {}; });
const complaints = [];
page.on("pageerror", (e) => complaints.push(`error: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") complaints.push(`${m.type()}: ${m.text().slice(0, 200)}`); });

// ---- shoot -----------------------------------------------------------------------------------
const log = { started: new Date().toISOString(), size: opt.size, play: !!opt.play, shots: [] };
const t0 = Date.now();
let loadedTime = null;
for (const v of views) {
  const time = v.time ?? opt.time;
  if (time !== loadedTime) {        // the clock is read when the page loads, so another time is another load
    await open(time, v);
    loadedTime = time;
  }
  const s0 = Date.now();
  await page.evaluate(([at, look]) => { window.__at = at ?? null; window.__view = look ?? undefined; }, [v.at, v.look]);
  const ready = await settle();
  const file = path.join(opt.out, `${v.name}${opt.tag ? "-" + opt.tag : ""}.png`);
  await page.screenshot({ path: file });
  const fps = await page.evaluate(() => window.__fps);
  // what the frame cost: triangles and draw calls drawn, models held, and the page's memory; and
  // the main view's draws square by square and by class (debug.ts squareCounts)
  const drawn = await page.evaluate(() => window.__gl && { triangles: window.__gl.render.triangles, calls: window.__gl.render.calls, geometries: window.__gl.memory.geometries, heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576),
    squares: window.__squareCounts?.() });
  const secs = (Date.now() - s0) / 1000;
  log.shots.push({ name: v.name, at: v.at, look: v.look, time, file, seconds: secs, ready, fps, drawn });
  console.log(`shot ${v.name} in ${secs.toFixed(1)}s${ready ? "" : " (NOT fully loaded: timed out)"}`);
}
log.seconds = (Date.now() - t0) / 1000;
log.complaints = [...new Set(complaints)];
log.longestSlices = await page.evaluate(() => window.__sliceMax);
fs.writeFileSync(path.join(opt.out, "shots.json"), JSON.stringify(log, null, 1));
console.log(`${views.length} views in ${log.seconds.toFixed(1)}s; ${log.complaints.length} page complaints (in ${opt.out}/shots.json)`);
console.log(await silenceNote(page));
await browser.close();
server.close();

/** Load the game at that time of day, looking from the first view. */
async function open(time, v) {
  const q = new URLSearchParams({ map: opt.map });
  if (time !== "now") q.set("time", time);
  if (v.at) q.set("at", v.at);
  for (const k of ["fx", "view", "res"]) if (opt[k] != null) q.set(k, opt[k]);
  for (const [k, v] of new URLSearchParams(opt.query ?? "")) q.set(k, v);
  await page.goto(`http://127.0.0.1:${port}/?${q}`);
  // build the squares' scenery in bigger slices a frame than in play: nobody's playing
  await page.evaluate(() => { window.__budget = 40; });
  await page.waitForFunction(() => window.__dbg !== undefined || (window.__game && window.__game()), null, { timeout: 120000 }).catch(() => {});
  if (opt.play) {
    await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 120000 });
    await page.evaluate(() => document.getElementById("solo").click());
    await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 120000 });
    // hold the camera where the view says, after the game has moved the player each frame
    await page.evaluate(() => {
      const g = window.__game(), u = g.update.bind(g);
      g.update = (dt) => {
        const at = window.__at, look = window.__view, m = g.map;
        if (at) {
          const [e, n, b = 0, t = 0, h = 1.7] = at.split(",").map(Number), x = e, z = -n;
          g.player.pos.set(x, m.ground(x, z), z);
          u(dt);
          g.camera.position.set(x, m.ground(x, z) + h, z);
          g.camera.rotation.set(t * Math.PI / 180, -b * Math.PI / 180, 0, "YXZ");
        } else if (look) {
          const [cx, cy, h, lx, ly, lh = 1.2] = look;
          const above = (x, z, h) => (h < 0 ? (m.tunnelFloor(x, z) ?? m.ground(x, z)) - h : m.ground(x, z) + h);
          g.player.pos.set(cx, m.ground(cx, -cy), -cy);
          u(dt);
          g.camera.position.set(cx, above(cx, -cy, h), -cy);
          g.camera.lookAt(lx, above(lx, -ly, lh), -ly);
        } else u(dt);
        g.camera.updateMatrixWorld();
        if (g.weapon) g.weapon.scene.visible = false;
      };
    });
  }
  await page.addStyleTag({ content: "#menu,#hud,.toast,#pause,#debug,#touch,#arrive{display:none!important}" });
}

/** Wait until every square in sight of the view is loaded and built, and has stayed so for a
 *  dozen frames and half a second (the game looks for squares to load every 0.3 s of play, and
 *  play time only moves on with the frames), then shoot. */
async function settle() {
  // (the game's own test, tiles.ts's Calm, which the arrival cover waits on too)
  await page.evaluate(() => { window.__shootCalm = window.__calm(12, 500); });
  return page.waitForFunction(() => window.__shootCalm.still(window.__tilesPending ?? 1), null, { timeout: +opt.timeout * 1000, polling: "raf" }).then(() => true, () => false);
}
