// The step where each bridge's deck meets its approach, as the built game (web/dist) draws it, in a
// muted headless Chrome: along each bridged way, from 10 m out on the approach to 6 m onto the deck,
// every 0.5 m on its line (and 0.3 m in from each side of its road), the top drawn face within 2.5 m
// of the way's own height; a lip is the biggest jump between neighbours, a gap a spot with no face.
//
//   cd web && npm run build && cd .. && node tools/quiet.mjs -- node tools/bridge_ends.mjs --out <dir> [--squares "1_2 0_2"] [--near "x,y,r x,y,r"] [--max 60]
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext } from "./quiet-guard.mjs";

const argv = process.argv.slice(2), opt = { out: "endprobe", max: "60", timeout: "90" };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = createRequire(WEB + "package.json")("playwright");
fs.mkdirSync(opt.out, { recursive: true });

const RW = { trunk: 9, primary: 8.5, secondary: 8, tertiary: 7, residential: 6, unclassified: 5.5, living_street: 5, service: 3.5, unknown: 4, pedestrian: 6, footway: 1.6, steps: 1.8, cycleway: 2, path: 1.4, track: 2.8, bridleway: 2 };
const half = (r) => (r.w ? r.w / 2 : (RW[r.c] ?? 4) / 2);
const near = opt.near ? opt.near.split(" ").map((s) => s.split(",").map(Number)) : null;
const only = opt.squares ? new Set(opt.squares.split(/[ ,]+/).map((s) => s.replace(":", "_"))) : null;

// every end of every built span (not a set piece's: held), as a run of sample spots
const ends = [];
const dir = path.join(WEB, "public/maps/combe-down");
for (const f of fs.readdirSync(dir).filter((f) => /^-?\d+_-?\d+\.json$/.test(f) && (!only || only.has(f.replace(".json", ""))))) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  for (const r of d.rd ?? []) {
    const p = r.p;
    if (r.held || p.length < 2) continue;
    for (let i = 0; i < p.length; i++) {
      if (p[i][3] !== 1) continue;
      for (const [step, nb] of [[-1, i - 1], [1, i + 1]]) {
        if (nb < 0 || nb >= p.length || p[nb][3] === 1 || p[nb][3] === 2) continue;
        const [x, y] = p[i];
        if (near && !near.some(([a, b, rr]) => Math.hypot(a - x, b - y) < rr)) continue;
        // walk from 6 m onto the deck (back along from i) out past the abutment point nb, 10 m beyond it
        const line = [];
        const pts = [p[i]];
        for (let s = 0, j = i - step; s < 6 && j >= 0 && j < p.length && p[j][3] === 1; j -= step) { s += Math.hypot(p[j][0] - pts[0][0], p[j][1] - pts[0][1]); pts.unshift(p[j]); }
        for (let s = 0, j = nb; j >= 0 && j < p.length && s < 12; j += step) { s += Math.hypot(p[j][0] - pts[pts.length - 1][0], p[j][1] - pts[pts.length - 1][1]); pts.push(p[j]); }
        for (let a = 0; a + 1 < pts.length; a++) {
          const A = pts[a], B = pts[a + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.ceil(L / 0.5));
          const nx = -(B[1] - A[1]) / (L || 1), ny = (B[0] - A[0]) / (L || 1);
          for (let s = 0; s < n; s++) line.push([A[0] + (B[0] - A[0]) * s / n, A[1] + (B[1] - A[1]) * s / n, A[2] + (B[2] - A[2]) * s / n, nx, ny, a + 1 === pts.length - 1 ? 0 : 1]);
        }
        ends.push({ key: `${f}:${r.n ?? ""}:${r.c}:${Math.round(x)},${Math.round(y)}`, sq: f.replace(".json", ""), name: r.n ?? "", c: r.c, x, y, half: half(r), line });
      }
    }
  }
}
// a handful: the spots asked for, else every end (spread out)
const list = near ? ends : ends.filter((e, i) => i % Math.max(1, Math.floor(ends.length / +opt.max)) === 0).slice(0, +opt.max);
console.log(`${ends.length} span ends, probing ${list.length}`);

const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm" };
const server = http.createServer((q, res) => {
  let f = path.join(WEB, "dist", decodeURIComponent(q.url.split("?")[0]));
  if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, b) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream"); res.end(b); });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true, channel: "chrome", args: [...MUTED_ARGS, "--use-angle=metal", "--enable-gpu"] });
const context = await browser.newContext({ viewport: { width: 480, height: 270 } });
await silenceContext(context);
const page = await context.newPage();
await silence(page);
await page.addInitScript(() => { globalThis.__keepArrays = true; });
const e0 = list[0];
await page.goto(`http://127.0.0.1:${server.address().port}/?map=combe-down&time=11:00&at=${e0.x},${e0.y},0,-89,35`);
await page.evaluate(() => { window.__budget = 40; });
await page.waitForFunction(() => window.__map && window.__map() && window.__renderer, null, { timeout: 120000 });
await page.evaluate(() => {
  const r = window.__renderer, render = r.render.bind(r);
  window.__scenes = new Set();
  r.render = (s, c) => { if (s.isScene) window.__scenes.add(s); return render(s, c); };
  window.__tops = (spots, z0) => {
    const scene = [...window.__scenes].reduce((a, s) => (!a || s.children.length > a.children.length ? s : a), null);
    scene.updateMatrixWorld();
    const xs = spots.map((q) => q[0]), ys = spots.map((q) => q[1]);
    const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
    const tris = [], v = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    scene.traverseVisible((m) => {
      if (!m.isMesh || m.isInstancedMesh || !m.geometry?.attributes?.position?.array || (m.geometry.index && !m.geometry.index.array)) return;
      const g = m.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox.clone().applyMatrix4(m.matrixWorld);
      if (bb.max.x < x0 || bb.min.x > x1 || bb.max.z < -y1 || bb.min.z > -y0) return;
      const pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count, e = m.matrixWorld.elements;
      for (let t = 0; t < n; t += 3) {
        for (let k = 0; k < 3; k++) {
          const i = idx ? idx.getX(t + k) : t + k, X = pos.getX(i), Y = pos.getY(i), Z = pos.getZ(i);
          v[k][0] = e[0] * X + e[4] * Y + e[8] * Z + e[12]; v[k][1] = e[1] * X + e[5] * Y + e[9] * Z + e[13]; v[k][2] = e[2] * X + e[6] * Y + e[10] * Z + e[14];
        }
        if (Math.max(v[0][0], v[1][0], v[2][0]) < x0 || Math.min(v[0][0], v[1][0], v[2][0]) > x1) continue;
        if (Math.max(v[0][2], v[1][2], v[2][2]) < -y1 || Math.min(v[0][2], v[1][2], v[2][2]) > -y0) continue;
        tris.push([v[0].slice(), v[1].slice(), v[2].slice(), m.userData.what || m.name || '?']);
      }
    });
    const m = window.__map();
    return spots.map(([x, y, h]) => {
      const z = -y; let best = null;
      for (const [a, b, c, nm] of tris) {
        const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
        if (Math.abs(d) < 1e-9) continue;
        const wa = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, wb = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, wc = 1 - wa - wb;
        if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;
        const yy = wa * a[1] + wb * b[1] + wc * c[1];
        if (/path|road|service|tarmac|pave|front|drive|gravel/.test(nm) && Math.abs(yy - (h - z0)) < 2.5 && (best === null || yy > best)) best = yy;
      }
      return [best === null ? null : +(best + z0).toFixed(2), +(m.trueGround(x, z) + z0).toFixed(2)];
    });
  };
});
const z0 = await page.evaluate(() => window.__map().z0);
const out = [];
for (const [n, e] of list.entries()) {
  await page.evaluate((at) => { window.__at = at; }, `${e.x},${e.y},0,-89,35`);
  await page.evaluate(() => { window.__calm = null; });
  await page.waitForFunction(() => {
    if (window.__tilesPending !== 0) { window.__calm = null; return false; }
    const c = (window.__calm ??= { frames: 0, t: performance.now() });
    return ++c.frames >= 12 && performance.now() - c.t > 500;
  }, null, { timeout: +opt.timeout * 1000, polling: "raf" }).catch(() => {});
  const row = {};
  for (const [lab, o] of [["mid", 0], ["left", e.half - 0.3], ["right", -(e.half - 0.3)]]) {
    const spots = e.line.map(([x, y, h, nx, ny]) => [x + nx * o, y + ny * o, h]);
    const got = await page.evaluate(([s, z]) => window.__tops(s, z), [spots, z0]);
    let lip = 0, at = null, gaps = 0;
    for (let i = 1; i < got.length; i++) {
      if (got[i][0] === null) { gaps++; continue; }
      if (got[i - 1][0] === null) continue;
      const j = Math.abs(got[i][0] - got[i - 1][0]);
      if (j > lip) { lip = j; at = i; }
    }
    row[lab] = { lip: +lip.toFixed(2), gaps, at: at === null ? null : e.line[at].slice(0, 2).map((v) => +v.toFixed(1)), tops: got };
  }
  out.push({ key: e.key, sq: e.sq, name: e.name, c: e.c, x: e.x, y: e.y, ...row });
  process.stdout.write(`\r${n + 1}/${list.length}`);
}
console.log();
fs.writeFileSync(path.join(opt.out, "ends.json"), JSON.stringify(out));
const worst = (r) => Math.max(r.mid.lip, r.left.lip, r.right.lip);
const big = out.filter((r) => worst(r) > 0.15);
console.log(`ends ${out.length}; with a lip over 0.15 m: ${big.length}; mean worst lip ${(out.reduce((t, r) => t + worst(r), 0) / out.length).toFixed(3)} m`);
for (const r of out.sort((a, b) => worst(b) - worst(a)).slice(0, 25)) console.log(`${worst(r).toFixed(2)}  mid ${r.mid.lip} L ${r.left.lip} R ${r.right.lip}  gaps ${r.mid.gaps}/${r.left.gaps}/${r.right.gaps}  ${r.c} ${r.name} at ${Math.round(r.x)},${Math.round(r.y)} (${r.sq})`);
await browser.close();
server.close();
