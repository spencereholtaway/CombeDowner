// How bumpy the streets are to walk and drive along, in the real game: a built game (web/dist) in a
// muted headless Chrome, its menu's view taken to each square named so the square loads, then every
// street there walked down its middle in half-metre steps the way feet go (map.floor, from the
// height of the step before), both ways. A street is bumpy where that walk strays more than BUMP
// metres from a smooth line through it (its average over SPAN metres); the worst, how many and how far
// apart are printed for each, and how many streets in all were bumpy.
//
//   cd web && npm run build && cd .. && node tools/quiet.mjs -- node tools/road_bumps.mjs 4,2 3,2 [--name "Ferry Lane" [--dump walk.txt]] [--json out.json]
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = createRequire(WEB + "package.json")("playwright");
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", map: "combe-down" }, squares = [];
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i]; else squares.push(argv[i]);
const STEP = 0.5, SPAN = 12, BUMP = 0.08;
const DRIVEN = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "service",
  "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link", "road", "busway"]);

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
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true, channel: "chrome", args: [...MUTED_ARGS, ...(process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])] });
const context = await browser.newContext({ viewport: { width: 480, height: 300 } });
await silenceContext(context);
const page = await context.newPage();
await silence(page);

const rows = [];
let first = true;
for (const sq of squares) {
  const d = JSON.parse(fs.readFileSync(path.join(WEB, "public", "maps", opt.map, `${sq.replace(",", "_")}.json`), "utf8"));
  const roads = d.rd.filter((r) => DRIVEN.has(r.c) && (!opt.name || r.n === opt.name)).map((r) => ({ n: r.n, c: r.c, p: r.p }));
  const mid = d.rd.flatMap((r) => r.p);
  const cx = mid.reduce((s, q) => s + q[0], 0) / mid.length, cy = mid.reduce((s, q) => s + q[1], 0) / mid.length, at = `${cx.toFixed(1)},${cy.toFixed(1)},0,-10`;
  if (first) {
    await page.goto(`http://127.0.0.1:${server.address().port}/?map=${opt.map}&at=${at}`);
    await page.evaluate(() => { window.__budget = 40; });
    await page.waitForFunction(() => window.__map && window.__map() && window.__calm, null, { timeout: 120000 });
    first = false;
  } else await page.evaluate((at) => { window.__at = at; }, at);
  await page.evaluate(() => { window.__probeCalm = window.__calm(12, 500); });
  await page.waitForFunction(() => window.__probeCalm.still(window.__tilesPending ?? 1), null, { timeout: 120000, polling: "raf" }).catch(() => console.log(`square ${sq} didn't settle`));
  const walks = await page.evaluate(([roads, STEP]) => {
    const m = window.__map(), out = [];
    const walk = (p) => {
      const h = [];
      let y = null;
      for (let k = 0; k + 1 < p.length; k++) {
        const a = p[k], b = p[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let u = 0; u < L; u += STEP) {
          const f = u / L, x = a[0] + (b[0] - a[0]) * f, z = -(a[1] + (b[1] - a[1]) * f);
          if (!m.tileAt(x, z) && !m.inGrid(x, z)) { h.push(null); y = null; continue; }
          // (starting from the street's own height, not the ground under a bridge it begins on)
          y = m.floor(x, z, y ?? a[2] + (b[2] - a[2]) * f - m.z0 + 0.3);
          h.push(y);
        }
      }
      return h;
    };
    for (const r of roads) out.push([walk(r.p), walk([...r.p].reverse())]);
    return out;
  }, [roads, STEP]);
  if (opt.dump) fs.writeFileSync(opt.dump, roads.map((r, i) => `# ${r.n} ${r.c}\n` + walks[i][0].map((v, k) => `${(k * STEP).toFixed(1)} ${v === null ? "-" : v.toFixed(3)}`).join("\n")).join("\n") + "\n");
  roads.forEach((r, i) => {
    const [a, b] = walks[i].map(measure);
    const w = a.worst >= b.worst ? a : b;
    if (w.samples < 10) return;
    rows.push({ sq, n: r.n, c: r.c, len: Math.round(w.samples * STEP), ...w });
  });
}
const bumpy = rows.filter((r) => r.worst > BUMP);
for (const r of [...rows].sort((a, b) => b.worst - a.worst)) if (r.worst > BUMP || opt.name)
  console.log(`${r.sq.padStart(6)} ${(r.n || "").slice(0, 28).padEnd(28)} ${r.c.padEnd(13)} ${String(r.len).padStart(5)} m  worst ${r.worst.toFixed(2)} m  bumps ${String(r.bumps).padStart(3)}  spacing ${r.spacing ?? "-"} m`);
console.log(`${bumpy.length} of ${rows.length} streets bumpy (a bump over ${BUMP} m off a ${SPAN} m average)`);
if (opt.json) fs.writeFileSync(opt.json, JSON.stringify(rows));
console.log(await silenceNote(page));
await browser.close();
server.close();

/** The worst stray from a smooth line, how many bumps stray past BUMP, and their usual spacing. */
function measure(h) {
  let worst = 0, bumps = 0, samples = 0;
  const spots = [];
  let run = [], start = 0;
  const finish = () => {
    if (run.length > 4) {
      samples += run.length;
      const n = Math.round(SPAN / STEP / 2), dev = run.map((v, i) => {
        const w = Math.min(n, i, run.length - 1 - i);
        let s = 0;
        for (let j = i - w; j <= i + w; j++) s += run[j];
        return v - s / (2 * w + 1);
      });
      for (let i = 0; i < dev.length; i++) {
        worst = Math.max(worst, Math.abs(dev[i]));
        if (i && i < dev.length - 1 && Math.abs(dev[i]) > BUMP && Math.abs(dev[i]) >= Math.abs(dev[i - 1]) && Math.abs(dev[i]) >= Math.abs(dev[i + 1])) { bumps++; spots.push(start + i); }
      }
    }
    run = [];
  };
  h.forEach((v, i) => { if (v === null) finish(); else { if (!run.length) start = i; run.push(v); } });
  finish();
  const gaps = spots.slice(1).map((s, i) => s - spots[i]).sort((a, b) => a - b);
  return { worst: +worst.toFixed(3), bumps, spacing: gaps.length ? gaps[gaps.length >> 1] * STEP : null, samples };
}
