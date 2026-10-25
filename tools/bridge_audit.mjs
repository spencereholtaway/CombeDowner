// Holes in Bath's bridges, counted from what the game actually draws. It serves a built game
// (web/dist) in a muted headless Chrome, goes round every part of Bath that has a bridge from the
// menu's backdrop, waits until the squares there are built, and casts rays at the drawn meshes:
//  - across each deck, between its parapets, straight down: a hole is a spot with no surface you
//    can see from above within 5 cm below where you walk (or a little above it, for a kerb);
//  - along each parapet or railing, straight down across a band 0.6 m either side of its middle:
//    a break is more than 0.2 m with nothing standing above knee height anywhere across it, not counting where another road or path meets the
//    deck's edge (an opening on to it) or where another deck runs alongside;
//  - the same along the railway's bridges, where the line stands high enough to have its sides.
//
//   cd web && npx vite build && cd .. && node tools/bridge_audit.mjs --out <dir>
//
// Options: --dist web/dist, --map combe-down, --timeout 90, --only "x,y x,y". Writes <out>/audit.json (each bridge's
// counts and where its holes are) and prints the totals.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "audit", map: "combe-down", timeout: "90" };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
fs.mkdirSync(opt.out, { recursive: true });

// where to look from: every 500 m square of Bath with a bridge (or a railway bridge) in it
const maps = path.join(opt.dist, "maps");
const cells = new Map();
const note = (x, y) => { const k = `${Math.floor(x / 500)},${Math.floor(y / 500)}`; if (!cells.has(k)) cells.set(k, [(Math.floor(x / 500) + 0.5) * 500, (Math.floor(y / 500) + 0.5) * 500]); };
for (const f of [path.join(maps, `${opt.map}.json`), ...fs.readdirSync(path.join(maps, opt.map)).filter((f) => /^-?\d+_-?\d+\.json$/.test(f)).map((f) => path.join(maps, opt.map, f))]) {
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const r of d.rd ?? []) for (const q of r.p) if (q[3] === 1) note(q[0], q[1]);
}
const rail = path.join(maps, `${opt.map}-rail.json`);
if (fs.existsSync(rail)) for (const t of JSON.parse(fs.readFileSync(rail, "utf8")).tracks ?? []) for (let k = 0; k < t.p.length; k += 10) if (t.p[k][3] === 1) note(t.p[k][0], t.p[k][1]);
// (--only "x,y x,y": just round those spots, to recheck a few bridges quickly)
const views = opt.only ? opt.only.split(" ").map((v) => v.split(",").map(Number)) : [...cells.values()];

const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm" };
const server = http.createServer((q, res) => {
  let f = path.join(opt.dist, decodeURIComponent(q.url.split("?")[0]));
  if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, b) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream"); res.end(b); });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true, channel: "chrome", args: [...MUTED_ARGS, ...(process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await silence(page);
await page.addInitScript(() => { globalThis.__keepArrays = true; });
const [x0, y0] = views[0];
await page.goto(`http://127.0.0.1:${server.address().port}/?map=${opt.map}&at=${x0},${y0},0,-30,40`);
await page.evaluate(() => { window.__budget = 40; });
await page.waitForFunction(() => window.__map && window.__map() && window.__renderer, null, { timeout: 120000 });
await page.evaluate(() => {
  const r = window.__renderer, render = r.render.bind(r);
  window.__scenes = new Set();
  r.render = (s, c) => { if (s.isScene) window.__scenes.add(s); return render(s, c); };
});
await page.evaluate(audit);

const results = { bridges: {}, rail: {} };
for (const [i, [x, y]] of views.entries()) {
  await page.evaluate((at) => { window.__at = at; }, `${x},${y},0,-30,40`);
  const ok = await settle();
  const got = await page.evaluate(([x, y]) => window.__audit(x, y, 360), [x, y]);
  for (const b of got.bridges) if (!results.bridges[b.key]) results.bridges[b.key] = b;
  for (const b of got.rail) if (!results.rail[b.key]) results.rail[b.key] = b;
  process.stdout.write(`\r${i + 1}/${views.length} views${ok ? "" : " (one timed out)"}   `);
}
console.log();
const sum = (o, k) => Object.values(o).reduce((t, b) => t + b[k], 0);
const B = Object.values(results.bridges), R = Object.values(results.rail);
const totals = {
  bridges: B.length, deckSamples: sum(results.bridges, "samples"), deckHoles: sum(results.bridges, "holes"), bridgesWithHoles: B.filter((b) => b.holes).length,
  parapetBreaks: sum(results.bridges, "breaks"), bridgesWithBreaks: B.filter((b) => b.breaks).length,
  railBridges: R.length, railHoles: sum(results.rail, "holes"), railBreaks: sum(results.rail, "breaks"),
  byKind: Object.fromEntries([...new Set(B.map((b) => b.kind))].map((k) => [k, { n: B.filter((b) => b.kind === k).length, holes: B.filter((b) => b.kind === k).reduce((t, b) => t + b.holes, 0), breaks: B.filter((b) => b.kind === k).reduce((t, b) => t + b.breaks, 0) }])),
};
fs.writeFileSync(path.join(opt.out, "audit.json"), JSON.stringify({ totals, ...results }, null, 1));
console.log(JSON.stringify(totals, null, 1));
await browser.close();
server.close();

async function settle() {
  await page.evaluate(() => { window.__calm = null; });
  return page.waitForFunction(() => {
    if (window.__tilesPending !== 0) { window.__calm = null; return false; }
    const c = (window.__calm ??= { frames: 0, t: performance.now() });
    return ++c.frames >= 12 && performance.now() - c.t > 500;
  }, null, { timeout: +opt.timeout * 1000, polling: "raf" }).then(() => true, () => false);
}

/** In the page: window.__audit(x, y, r) checks every bridge whose middle is within r of data (x, y). */
function audit() {
  const RW = { trunk: 9, primary: 8.5, secondary: 8, tertiary: 7, residential: 6, unclassified: 5.5, living_street: 5, service: 3.5, unknown: 4, pedestrian: 6, footway: 1.6, steps: 1.8, cycleway: 2, path: 1.4, track: 2.8, bridleway: 2 };
  const KERBED = new Set(["trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "living_street"]);
  const roadHalf = (c, w) => (w ? w / 2 : (RW[c] ?? 4) / 2);
  const deckSides = (r) => {
    if (Array.isArray(r.dk) && r.dk.length === 2) return r.dk;
    if (Array.isArray(r.dk)) return [Math.max(...r.dk), Math.max(...r.dk)];
    if (r.dk) return [r.dk, r.dk];
    const pave = KERBED.has(r.c) ? Math.max(0, ...(r.pv ?? [1.7, 1.7])) : r.w ? 0 : 0.3;
    const h = Math.max(roadHalf(r.c) + (KERBED.has(r.c) ? 1.7 : 0.3), roadHalf(r.c, r.w) + pave);
    return [h, h];
  };
  // the triangles drawn round a box (data x0, y0, x1, y1), binned by metre square, each with whether it can be seen from either side
  function trianglesIn(x0, y0, x1, y1) {
    const scene = [...window.__scenes].reduce((a, s) => (!a || s.children.length > a.children.length ? s : a), null);
    const grid = new Map(), v = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const box = { min: { x: x0, z: -y1 }, max: { x: x1, z: -y0 } };
    scene.updateMatrixWorld();
    scene.traverseVisible((m) => {
      if (!m.isMesh || m.isInstancedMesh || !m.geometry?.attributes?.position?.array || (m.geometry.index && !m.geometry.index.array)) return;
      const g = m.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox.clone().applyMatrix4(m.matrixWorld);
      if (bb.max.x < box.min.x || bb.min.x > box.max.x || bb.max.z < box.min.z || bb.min.z > box.max.z) return;
      const pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count, e = m.matrixWorld.elements, two = (Array.isArray(m.material) ? m.material[0] : m.material).side === 2;
      for (let t = 0; t < n; t += 3) {
        let ax = Infinity, bx = -Infinity, az = Infinity, bz = -Infinity;
        for (let k = 0; k < 3; k++) {
          const i = idx ? idx.getX(t + k) : t + k, X = pos.getX(i), Y = pos.getY(i), Z = pos.getZ(i);
          v[k][0] = e[0] * X + e[4] * Y + e[8] * Z + e[12]; v[k][1] = e[1] * X + e[5] * Y + e[9] * Z + e[13]; v[k][2] = e[2] * X + e[6] * Y + e[10] * Z + e[14];
          ax = Math.min(ax, v[k][0]); bx = Math.max(bx, v[k][0]); az = Math.min(az, v[k][2]); bz = Math.max(bz, v[k][2]);
        }
        if (bx < box.min.x || ax > box.max.x || bz < box.min.z || az > box.max.z) continue;
        const tri = [v[0].slice(), v[1].slice(), v[2].slice(), two];
        for (let i = Math.floor(ax); i <= Math.floor(bx); i++) for (let j = Math.floor(az); j <= Math.floor(bz); j++) {
          const k = `${i},${j}`; (grid.get(k) ?? grid.set(k, []).get(k)).push(tri);
        }
      }
    });
    return grid;
  }
  // the heights of the faces seen from above at scene (x, z)
  function downHits(grid, x, z) {
    const out = [];
    for (const [a, b, c, two] of grid.get(`${Math.floor(x)},${Math.floor(z)}`) ?? []) {
      const ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - a[0], vz = c[2] - a[2], d = ux * vz - uz * vx;
      if (Math.abs(d) < 1e-9) continue;
      const px = x - a[0], pz = z - a[2], s = (px * vz - pz * vx) / d, t = (ux * pz - uz * px) / d;
      if (s < -1e-6 || t < -1e-6 || s + t > 1 + 1e-6) continue;
      // three.js's front faces wind anticlockwise seen from outside: from above, that's d < 0 in (x, z)
      if (!two && d > 0) continue;
      out.push(a[1] + s * (b[1] - a[1]) + t * (c[1] - a[1]));
    }
    return out;
  }
  const otherEnds = (map) => {
    const out = [];
    for (const m of [map, ...map.tiles.values()]) for (const r of m.d.rd ?? []) out.push({ r, a: r.p[0], b: r.p[r.p.length - 1], p: r.p });
    return out;
  };
  window.__audit = (cx, cy, R) => {
    const map = window.__map(), res = { bridges: [], rail: [] }, ends = otherEnds(map);
    const joins = (r, x, y, reach) => ends.some((e) => e.r !== r && e.p.some((q) => Math.hypot(q[0] - x, q[1] - y) < reach));
    for (const m of [map, ...map.tiles.values()]) for (const r of m.d.rd ?? []) {
      if (!r.bridge || r.held) continue;
      const on = r.p.map((q) => q[3] === 1);
      const mid = r.p.filter((_, i) => on[i]);
      if (!mid.length) continue;
      const c = mid[Math.floor(mid.length / 2)];
      if (Math.hypot(c[0] - cx, c[1] - cy) > R) continue;
      const [hl, hr] = deckSides(r), z0 = m.z0;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of mid) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
      const reach = Math.max(hl, hr) + 2, grid = trianglesIn(x0 - reach, y0 - reach, x1 + reach, y1 + reach);
      const out = { key: `${Math.round(c[0])},${Math.round(c[1])}`, kind: r.bt ?? "arch", c: r.c, w: r.w, dk: [hl, hr], samples: 0, holes: 0, breaks: 0, where: [] };
      for (let i = 0; i < r.p.length - 1; i++) {
        if (!on[i] || !on[i + 1]) continue;
        const A = r.p[i], B = r.p[i + 1], len = Math.hypot(B[0] - A[0], B[1] - A[1]);
        if (len < 0.01) continue;
        const nx = -(B[1] - A[1]) / len, ny = (B[0] - A[0]) / len;
        // (half a metre off each end of the piece: a bend's corner is checked from both pieces)
        const run = { 1: 0, [-1]: 0 };
        for (let s = 0.25; s < len - 0.25 + 1e-6; s += 0.1) {
          const f = s / len, x = A[0] + (B[0] - A[0]) * f, y = A[1] + (B[1] - A[1]) * f, walk = A[2] + (B[2] - A[2]) * f - z0;
          if (Math.round(s * 10) % 5 === 0) for (let o = -hr + 0.08; o <= hl - 0.08 + 1e-6; o += 0.1) {
            const px = x + nx * o, py = y + ny * o;
            out.samples++;
            if (!downHits(grid, px, -py).some((h) => h >= walk - 0.05 && h <= walk + 0.3)) {
              out.holes++;
              if (out.where.length < 40) out.where.push(["hole", +px.toFixed(1), +py.toFixed(1)]);
            }
          }
          for (const side of [1, -1]) {
            // (anywhere across a band either side of where it should stand: at a bend or where two
            // pieces of different widths meet, the wall is set a little in or out)
            const o = side * ((side > 0 ? hl : hr) + 0.2), px = x + nx * o, py = y + ny * o;
            let stands = false;
            for (let d = -0.6; d <= 0.6 + 1e-6 && !stands; d += 0.1)
              stands = downHits(grid, px + nx * side * d, -(py + ny * side * d)).some((h) => h >= walk + 0.3 && h <= walk + 5);
            // (another deck alongside at the same height, or a way joining at the edge, leaves it open)
            const ox = x + nx * side * ((side > 0 ? hl : hr) + 0.6), oy = y + ny * side * ((side > 0 ? hl : hr) + 0.6), beside = map.deck(ox, -oy, walk + 0.5);
            const open = (beside !== null && Math.abs(beside - walk) < 1.2) || joins(r, px, py, 2.5);
            if (stands || open) {
              if (run[side] > 0.2) { out.breaks++; if (out.where.length < 40) out.where.push(["break", +px.toFixed(1), +py.toFixed(1), +run[side].toFixed(1)]); }
              run[side] = 0;
            } else run[side] += 0.1;
          }
        }
        for (const side of [1, -1]) if (run[side] > 0.2) { out.breaks++; out.where.push(["break-end", +B[0].toFixed(1), +B[1].toFixed(1), +run[side].toFixed(1)]); }
      }
      res.bridges.push(out);
    }
    // the railway's bridges (the root map builds them all, at its own z0)
    for (const [ti, t] of (map.railData?.tracks ?? []).entries()) {
      const p = t.p;
      for (let k = 0; k < p.length - 1; k++) {
        const A = p[k], B = p[k + 1];
        if (A[3] !== 1 || B[3] !== 1 || Math.hypot(A[0] - cx, A[1] - cy) > R) continue;
        // (only where the line stands well up: lower, it's an embankment's top and has no sides)
        if (A[2] - (A[4] ?? A[2]) < 3 || B[2] - (B[4] ?? B[2]) < 3) continue;
        const key = `${ti}:${Math.round(A[0])},${Math.round(A[1])}`, len = Math.hypot(B[0] - A[0], B[1] - A[1]);
        if (len < 0.01) continue;
        const grid = trianglesIn(Math.min(A[0], B[0]) - 4, Math.min(A[1], B[1]) - 4, Math.max(A[0], B[0]) + 4, Math.max(A[1], B[1]) + 4);
        const nx = -(B[1] - A[1]) / len, ny = (B[0] - A[0]) / len, out = { key, samples: 0, holes: 0, breaks: 0, where: [] };
        for (let s = 0.25; s < len - 0.25; s += 0.5) {
          const f = s / len, x = A[0] + (B[0] - A[0]) * f, y = A[1] + (B[1] - A[1]) * f, walk = A[2] + (B[2] - A[2]) * f - map.z0 + 0.25;
          for (let o = -2.0; o <= 2.0 + 1e-6; o += 0.1) {
            out.samples++;
            const px = x + nx * o, py = y + ny * o;
            if (!downHits(grid, px, -py).some((h) => h >= walk - 0.05 && h <= walk + 0.3)) { out.holes++; if (out.where.length < 20) out.where.push(["hole", +px.toFixed(1), +py.toFixed(1)]); }
          }
          for (const side of [1, -1]) {
            const px = x + nx * side * 2.3, py = y + ny * side * 2.3;
            if (!downHits(grid, px, -py).some((h) => h >= walk + 0.3)) { out.breaks++; if (out.where.length < 20) out.where.push(["break", +px.toFixed(1), +py.toFixed(1)]); }
          }
        }
        res.rail.push(out);
      }
    }
    return res;
  };
}
