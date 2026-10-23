// Side-by-side screenshots of the same views from two builds of the game (Spencer's main on the
// left, ours on the right), to judge a map change in a couple of minutes and stop early if it is
// wrong. It serves both built games (web/dist folders, never rebuilt here), opens ONE muted
// headless Chrome, and shoots both builds in parallel, several pages each. Each page loads once
// and then moves the menu's backdrop camera with window.__at, as tools/shoot.mjs does, so a view
// costs the squares' build time and no more. MAIN's shots are kept in ~/.cache/combe-compare by
// (main commit, view, size), so a rerun only shoots OURS.
//
//   node tools/compare_views.mjs --main-dist /path/to/main/web/dist --ours-dist web/dist [options]
//
// Options
//   --views views.json   {"name": "east,north,bearing,tilt[,height]", ...}, or {"views": {...}, "flagged": [names]}
//   --flagged a,b        shoot these first (as does "flagged" in the views file)
//   --only a,b           just these views          --first N   just the first N (after flagged first)
//   --jobs 3             pages in flight per build  --size 1280x720   --timeout 60 (s a view may take)
//   --fresh              reshoot MAIN instead of using the cache
//   --out dir            default: <scratchpad>/cmp/<timestamp> (or ./cmp/<timestamp>)
//   --squares            before shooting, rewrite just the map squares under the chosen views with
//                        tools/partition/write_tile.py (from MAIN's tiles), then `vite build` into
//                        --ours-dist's web folder. Also --once dir --city dir (default out/once-styles,
//                        out/city-rows) and --near 150. Squares are written to a temp file and renamed,
//                        so a failure never leaves one half-written.
//
// Writes <out>/pair-<name>.jpg, raw/<name>-main.png and -ours.png, contact.jpg (every pair as a
// thumbnail), index.html (flagged first, with the pixel difference below the top fifth) and
// summary.json (timings). Pair paths are printed as each finishes.
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import http from "http";
import path from "path";
import crypto from "crypto";
import { spawnSync, execFileSync } from "child_process";
import { MUTED_ARGS, silenceContext } from "./quiet-guard.mjs";

const TOOLS = new URL(".", import.meta.url).pathname, ROOT = path.resolve(TOOLS, "..");
const WEB = path.join(ROOT, "web") + "/";
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();

const SCRATCH = "/private/tmp/claude-501/-Users-dan-src-CombeDowner/1fc84dd2-d541-4305-bacd-d8528644eadc/scratchpad";
const scratch = fs.existsSync(SCRATCH) ? SCRATCH : process.cwd();
const opt = {
  "ours-dist": WEB + "dist", views: fs.existsSync(path.join(TOOLS, "compare_views.json")) ? path.join(TOOLS, "compare_views.json") : path.join(scratch, "compare/views.json"),
  jobs: "3", size: "1280x720", timeout: "60", near: "150", once: "out/once-styles", city: "out/city-rows",
};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--fresh" || a === "--squares") opt[a.slice(2)] = true;
  else if (a === "-h" || a === "--help") opt.help = true;
  else if (a.startsWith("--")) opt[a.slice(2)] = argv[++i];
}
const raw = fs.existsSync(opt.views) ? JSON.parse(fs.readFileSync(opt.views, "utf8")) : {};
const allViews = raw.views || raw;
const flaggedList = [...(raw.flagged || []), ...(opt.flagged ? opt.flagged.split(",") : [])];

if (opt.help || !opt["main-dist"]) {
  console.log(`usage: node tools/compare_views.mjs --main-dist <main web/dist> [--ours-dist web/dist] [--views views.json]
  [--only a,b] [--first N] [--flagged a,b] [--jobs 3] [--size 1280x720] [--fresh] [--squares] [--out dir]
views: ${Object.keys(allViews).join(", ")}
flagged first: ${flaggedList.join(", ") || "(none)"}`);
  process.exit(opt.help ? 0 : 1);
}

// ---- choose the views, known problems first ---------------------------------------------------
let names = Object.keys(allViews);
if (opt.only) {
  const want = opt.only.split(",");
  for (const n of want) if (!allViews[n]) { console.error(`no view called ${n}`); process.exit(1); }
  names = want;
}
const isFlagged = (n) => flaggedList.includes(n);
names = [...names.filter(isFlagged), ...names.filter((n) => !isFlagged(n))];
if (opt.first) names = names.slice(0, +opt.first);
const at = (n) => (typeof allViews[n] === "string" ? allViews[n] : allViews[n].at);

const [W, H] = opt.size.split("x").map(Number);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const out = path.resolve(opt.out || path.join(scratch, "cmp", stamp));
fs.mkdirSync(path.join(out, "raw"), { recursive: true });
const T0 = Date.now();
const secs = () => ((Date.now() - T0) / 1000).toFixed(1);
const timings = {};

// ---- rewrite just the squares under the views, then rebuild ours -----------------------------
if (opt.squares) {
  const t = Date.now();
  const mainMaps = path.resolve(opt["main-dist"], "../public/maps/combe-down");
  const maps = path.join(WEB, "public/maps/combe-down");
  const squares = new Set();
  for (const n of names) {
    const r = spawnSync("python3", ["-I", path.join(TOOLS, "square_at.py"), at(n), "--near", opt.near], { cwd: ROOT, encoding: "utf8" });
    const m = /nothing|with anything within \d+ m: (.*)/.exec(r.stdout.split("\n")[0]);
    if (!m) { console.error(`square_at failed for ${n}: ${r.stderr || r.stdout}`); process.exit(1); }
    for (const s of m[1].trim().split(/\s+/)) squares.add(s);
  }
  console.log(`rewriting ${squares.size} squares: ${[...squares].join(" ")}`);
  for (const s of squares) {
    const [ti, tj] = s.split(",");
    const base = path.join(mainMaps, `${ti}_${tj}.json`), dest = path.join(maps, `${ti}_${tj}.json`), tmp = dest + ".tmp";
    if (!fs.existsSync(base)) { console.log(`  ${s}: no tile in main, skipped`); continue; }
    const r = spawnSync("python3", ["tools/partition/write_tile.py", ti, tj, tmp, "--once", opt.once, "--city", opt.city, "--base", base], { cwd: ROOT, encoding: "utf8" });
    if (r.status !== 0) { fs.rmSync(tmp, { force: true }); console.error(`  ${s} FAILED\n${(r.stderr || "").split("\n").slice(-6).join("\n")}`); process.exit(1); }
    fs.renameSync(tmp, dest);
  }
  const b = spawnSync("npx", ["vite", "build"], { cwd: WEB, encoding: "utf8" });
  if (b.status !== 0) { console.error(b.stdout.slice(-1500), b.stderr.slice(-1500)); process.exit(1); }
  timings.rewrite_and_build = (Date.now() - t) / 1000;
  console.log(`rewrite and build ${timings.rewrite_and_build.toFixed(1)}s`);
}

// ---- cache of main's shots --------------------------------------------------------------------
let mainCommit = "unknown";
try { mainCommit = execFileSync("git", ["-C", path.resolve(opt["main-dist"], "../.."), "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(); } catch {}
const cacheDir = path.join(os.homedir(), ".cache/combe-compare", mainCommit, opt.size);
fs.mkdirSync(cacheDir, { recursive: true });
const cacheFile = (n) => path.join(cacheDir, `${n}-${crypto.createHash("md5").update(at(n)).digest("hex").slice(0, 8)}.png`);

// ---- serve both builds ------------------------------------------------------------------------
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm" };
async function serve(dist) {
  const s = http.createServer((q, res) => {
    let f = path.join(dist, decodeURIComponent(q.url.split("?")[0]));
    if (f.endsWith("/")) f += "index.html";
    fs.readFile(f, (e, b) => {
      if (e) { res.statusCode = 404; return res.end(); }
      res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream");
      res.end(b);
    });
  });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  return s;
}
const servers = { main: await serve(path.resolve(opt["main-dist"])), ours: await serve(path.resolve(opt["ours-dist"])) };
const url = (side) => `http://127.0.0.1:${servers[side].address().port}/`;

// ---- shoot ------------------------------------------------------------------------------------
const results = {};          // name -> {main, ours, ready:{}, seconds:{}, diff, pair}
for (const n of names) results[n] = { name: n, flagged: isFlagged(n), at: at(n), ready: {}, seconds: {} };
const need = { main: [], ours: [...names] };
for (const n of names) {
  if (!opt.fresh && fs.existsSync(cacheFile(n))) {
    const f = path.join(out, "raw", `${n}-main.png`);
    fs.copyFileSync(cacheFile(n), f);
    results[n].main = f; results[n].cached = true; results[n].ready.main = true;
  } else need.main.push(n);
}
console.log(`${names.length} views; main: ${names.length - need.main.length} cached, ${need.main.length} to shoot; ours: ${need.ours.length} to shoot`);

const browser = await chromium.launch({
  headless: true, channel: "chrome",
  args: [...MUTED_ARGS, ...(process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])],
});
const complaints = new Set();

function finish(n) {
  const r = results[n];
  if (!r.main || !r.ours || r.done) return;
  r.done = true;
  const pair = path.join(out, `pair-${n}.jpg`);
  const p = spawnSync("python3", ["-I", path.join(TOOLS, "compare_pair.py"), "pair", r.main, r.ours, pair, n], { encoding: "utf8" });
  if (p.status !== 0) { console.error(`pair ${n} failed: ${p.stderr}`); return; }
  r.diff = JSON.parse(p.stdout).diff; r.pair = pair;
  const bad = !r.ready.main || !r.ready.ours ? " (a side timed out)" : "";
  console.log(`[${secs()}s] ${pair}  diff ${r.diff}%${bad}`);
}

async function worker(side, queue) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await silenceContext(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => complaints.add(`${side}: ${e.message}`));
  let opened = false;
  while (queue.length) {
    const n = queue.shift(), s0 = Date.now();
    if (!opened) {
      const q = new URLSearchParams({ map: "combe-down", time: "11:00", at: at(n) });
      await page.goto(`${url(side)}?${q}`);
      await page.evaluate(() => { window.__budget = 40; });
      await page.waitForFunction(() => window.__dbg !== undefined || (window.__game && window.__game()), null, { timeout: 120000 }).catch(() => {});
      await page.addStyleTag({ content: "#menu,#hud,.toast,#pause,#debug,#touch{display:none!important}" });
      opened = true;
    }
    await page.evaluate((a) => { window.__at = a; window.__view = undefined; }, at(n));
    await page.evaluate(() => { window.__calm = null; });
    const ready = await page.waitForFunction(() => {
      const p = window.__tilesPending;
      if (p !== 0) { window.__calm = null; return false; }
      const c = (window.__calm ??= { frames: 0, t: performance.now() });
      return ++c.frames >= 12 && performance.now() - c.t > 500;
    }, null, { timeout: +opt.timeout * 1000, polling: "raf" }).then(() => true, () => false);
    const f = path.join(out, "raw", `${n}-${side}.png`);
    await page.screenshot({ path: f });
    if (side === "main" && ready) fs.copyFileSync(f, cacheFile(n));
    const r = results[n];
    r[side] = f; r.ready[side] = ready; r.seconds[side] = (Date.now() - s0) / 1000;
    finish(n);
  }
}
// main's cached views are finished as soon as ours arrives; ours first for the flagged views
const jobs = +opt.jobs;
const t1 = Date.now();
await Promise.all([
  ...Array.from({ length: jobs }, () => worker("ours", need.ours)),
  ...Array.from({ length: jobs }, () => worker("main", need.main)),
]);
timings.shooting = (Date.now() - t1) / 1000;
await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]);   // Chrome can be slow to quit

// ---- contact sheet, index and summary ---------------------------------------------------------
const done = names.map((n) => results[n]).filter((r) => r.pair);
fs.writeFileSync(path.join(out, "items.json"), JSON.stringify(done.map((r) => ({ name: r.name, pair: r.pair, diff: r.diff, flagged: r.flagged }))));
const c = spawnSync("python3", ["-I", path.join(TOOLS, "compare_pair.py"), "contact", path.join(out, "contact.jpg"), path.join(out, "items.json")], { encoding: "utf8" });
if (c.status !== 0) console.error(c.stderr);
fs.rmSync(path.join(out, "items.json"));

const card = (r) => `<figure class="${r.flagged ? "flag" : ""}"><a href="pair-${r.name}.jpg"><img loading="lazy" src="pair-${r.name}.jpg"></a>
<figcaption><b>${r.name}</b> ${r.flagged ? "(flagged) " : ""}<span class="${r.diff > 5 ? "hi" : ""}">${r.diff.toFixed(1)}% different</span> <small>${r.at}</small></figcaption></figure>`;
fs.writeFileSync(path.join(out, "index.html"), `<!doctype html><meta charset=utf-8><title>Main vs ours</title>
<style>body{background:#222;color:#eee;font:14px system-ui;margin:12px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(640px,1fr));gap:10px}
img{width:100%}figure{margin:0}.flag{outline:2px solid #fc5}.hi{color:#f88}small{color:#999}</style>
<h2>MAIN (left, ${mainCommit}) vs OURS (right) &mdash; ${done.length} views</h2><p><a href="contact.jpg">contact sheet</a></p>
<div class=g>${[...done.filter((r) => r.flagged), ...done.filter((r) => !r.flagged)].map(card).join("")}</div>`);

timings.total = (Date.now() - T0) / 1000;
fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify({
  main_commit: mainCommit, size: opt.size, jobs, timings, complaints: [...complaints],
  views: done.map(({ name, flagged, at, diff, cached, ready, seconds }) => ({ name, flagged, at, diff, main_cached: !!cached, ready, seconds })),
}, null, 1));
console.log(`\ncontact sheet: ${path.join(out, "contact.jpg")}\nindex: ${path.join(out, "index.html")}\ntotal ${timings.total.toFixed(1)}s (shooting ${timings.shooting.toFixed(1)}s), ${done.length}/${names.length} pairs`);
process.exit(0);
