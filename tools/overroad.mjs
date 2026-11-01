// What the game draws over its streets, for tools/check_more.py's rule 20: the scenery as the game
// builds it, not the map's polygons. It serves a built game (web/dist, with the maps read from
// web/public/maps so a rebuilt map needs no new game build) in a muted headless Chrome, goes round
// every square of the map from the menu's backdrop, waits until the squares there are built, and
// casts rays straight down at the meshes drawn (not trees, grass, street furniture, signs, lamps or
// anything that moves), every metre along every kerbed street:
//  - across its carriageway, every metre across from 0.3 m inside one kerb to 0.3 m inside the other:
//    the first face seen from above, up to 3 m over the road, should be the road. Anything else there
//    (paving, a kerb, grass, bare earth, the ground's own mesh over a buried road, a slab, a wall, a
//    building, a set piece) is "something over the road", and a spot with no road drawn under it at
//    all is "no road";
//  - across each pavement it has, the same way (from 0.6 m off the kerb to 0.5 m off its back): the
//    first face seen should be paving (a pavement, a
//    drive's or a plaza's paving, a path); grass, earth, the ground or the road there is "something
//    on the pavement", unless the road runs on from the kerb, a carriageway drawn wider than its record;
//  - just past each pavement's back edge: where that is open ground (grass, earth, the ground's
//    mesh, a path) and the pavement stands more than 0.3 m over it, the pavement is "on a lip" (the
//    game stands a pavement a kerb, 0.15 to 0.3 m, over the grass beside it on purpose); and so is
//    one standing more than 0.35 m over its own carriageway, a kerb about 0.1 m high.
// Each sample stands for a square metre, so a place's score is its area in m2 (a lip's is its height).
// Bridges, tunnels and anything more than 3 m over the road (a bridge or a deck over it, an arch) are
// left out. Samples of one kind next to each other on one street are one place.
//
//   cd web && npx vite build && cd .. && node tools/overroad.mjs [--map combe-down] [--maps web/public/maps]
//       [--only "ti,tj ..."] [--out overroad.json]
// Prints the places as one JSON list ({rule, score, x, y, what}) on stdout, as tools/watertight.ts
// does, and a summary by rule and street on stderr. PW=<playwright> and CHROME=<a Chrome> as for shoot.mjs.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", maps: WEB + "public/maps", map: "combe-down", timeout: "90" };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
const say = (s) => process.stderr.write(s);

// every square of the map, looked at a quarter at a time so what's built round the view covers it
const dir = path.join(opt.maps, opt.map);
const only = opt.only ? new Set(opt.only.split(/[ ]+/).map((s) => s.replace(",", "_"))) : null;
const quarters = [];
for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^-?\d+_-?\d+\.json$/.test(f)) : []) {
  if (only && !only.has(f.slice(0, -5))) continue;
  const head = fs.readFileSync(path.join(dir, f), "utf8").slice(0, 4000);
  const b = /"b":\s*\[([^\]]+)\]/.exec(head)?.[1].split(",").map(Number);
  if (!b) continue;
  const [x0, y0, x1, y1] = b, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  for (const [a, c] of [[x0, y0], [mx, y0], [x0, my], [mx, my]]) quarters.push({ sq: f.slice(0, -5), box: [a, c, a + (x1 - x0) / 2, c + (y1 - y0) / 2] });
}
if (!quarters.length || !fs.existsSync(path.join(opt.dist, "index.html"))) { console.log("[]"); process.exit(0); }

const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm" };
const server = http.createServer((q, res) => {
  const u = decodeURIComponent(q.url.split("?")[0]);
  let f = u.startsWith("/maps/") ? path.join(opt.maps, u.slice(6)) : path.join(opt.dist, u);
  if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, b) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream"); res.end(b); });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const exe = process.env.CHROME;
const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : { channel: "chrome" }),
  args: [...MUTED_ARGS, ...(process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : process.platform === "linux" ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [])] });
const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
await silenceContext(context);
const page = await context.newPage();
await silence(page);
// (the squares keep their models' arrays, to be read here, instead of letting them go once drawn)
await page.addInitScript(() => { globalThis.__keepArrays = true; });
const at = (b) => `${(b[0] + b[2]) / 2},${(b[1] + b[3]) / 2},0,-30,40`;
await page.goto(`http://127.0.0.1:${server.address().port}/?map=${opt.map}&at=${at(quarters[0].box)}`);
await page.evaluate(() => { window.__budget = 40; });
await page.waitForFunction(() => window.__map && window.__map() && window.__renderer, null, { timeout: 120000 });
await page.evaluate(() => {
  const r = window.__renderer, render = r.render.bind(r);
  window.__scenes = new Set();
  r.render = (s, c) => { if (s.isScene) window.__scenes.add(s); return render(s, c); };
});
await page.evaluate(probe);

const samples = [];
let late = 0;
for (const [i, q] of quarters.entries()) {
  await page.evaluate((a) => { window.__at = a; }, at(q.box));
  if (!(await settle())) late++;
  samples.push(...(await page.evaluate((b) => window.__overroad(b), q.box)));
  say(`\r${i + 1}/${quarters.length} quarters${late ? ` (${late} timed out)` : ""}   `);
}
say(`\n${await silenceNote(page)}\n`);
await browser.close();
server.close();

// ---- a run of samples in a row on one street, of one kind, is one place ----------------------------
const places = [];
const byKey = new Map();
for (const s of samples) {
  const k = `${s.rule}|${s.n}|${s.rule === "lip" ? s.side : s.what}`;
  (byKey.get(k) ?? byKey.set(k, []).get(k)).push(s);
}
for (const list of byKey.values()) {
  // (samples a metre or so apart, along or across, are one place)
  const cell = new Map(), at = (s) => `${Math.floor(s.x / 1.6)},${Math.floor(s.y / 1.6)}`;
  list.forEach((s, i) => (cell.get(at(s)) ?? cell.set(at(s), []).get(at(s))).push(i));
  const done = new Uint8Array(list.length);
  for (let i = 0; i < list.length; i++) {
    if (done[i]) continue;
    const s0 = list[i], p = { rule: s0.rule, street: s0.n, x: s0.x, y: s0.y, n: 0, top: 0, whats: {} }, stack = [i];
    done[i] = 1;
    while (stack.length) {
      const s = list[stack.pop()];
      p.n++; p.top = Math.max(p.top, s.h); p.whats[s.what] = (p.whats[s.what] ?? 0) + 1;
      const cx = Math.floor(s.x / 1.6), cy = Math.floor(s.y / 1.6);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of cell.get(`${cx + a},${cy + b}`) ?? []) {
        if (!done[j] && Math.hypot(list[j].x - s.x, list[j].y - s.y) < 1.6) { done[j] = 1; stack.push(j); }
      }
    }
    places.push(p);
  }
}
const out = [];
for (const p of places) {
  const what = Object.entries(p.whats).sort((a, b) => b[1] - a[1])[0][0];
  const lip = p.rule === "lip";
  out.push({
    rule: lip ? "20 pavement on a lip" : p.rule === "wide" ? "20 road drawn wider than its record" : p.rule === "road" ? `20 something over the road: ${what}` : p.rule === "none" ? `20 no road drawn: ${what}` : `20 something on the pavement: ${what}`,
    score: lip ? +p.top.toFixed(2) : p.n, x: +p.x.toFixed(1), y: +p.y.toFixed(1),
    what: `${p.street || "(no name)"} ${lip ? `${p.top.toFixed(2)} m over the ground beside, ${p.n} m` : `${p.n} m2${what === "ground" && p.rule === "road" ? `, ${p.top.toFixed(2)} m over the road` : ""}`}`,
  });
}
// a summary on stderr: by rule, and the streets with the most
const byRule = {}, byStreet = {};
for (const o of out) {
  byRule[o.rule] = (byRule[o.rule] ?? 0) + 1;
  const st = o.what.split(/ \d/)[0];
  byStreet[st] = (byStreet[st] ?? 0) + 1;
}
say(`${samples.length} samples off, ${out.length} places\n`);
for (const [k, v] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) say(`${String(v).padStart(6)}  ${k}\n`);
say("streets with the most:\n");
for (const [k, v] of Object.entries(byStreet).sort((a, b) => b[1] - a[1]).slice(0, 20)) say(`${String(v).padStart(6)}  ${k}\n`);
if (opt.out) fs.writeFileSync(opt.out, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));

async function settle() {
  await page.evaluate(() => { window.__calm = null; });
  return page.waitForFunction(() => {
    if (window.__tilesPending !== 0) { window.__calm = null; return false; }
    const c = (window.__calm ??= { frames: 0, t: performance.now() });
    return ++c.frames >= 12 && performance.now() - c.t > 500;
  }, null, { timeout: +opt.timeout * 1000, polling: "raf" }).then(() => true, () => false);
}

/** In the page: window.__overroad(box) samples every kerbed street with points in the box (data x0,
 *  y0, x1, y1) and returns the samples that are off, each {rule, n, side, x, y, h, what}. */
function probe() {
  const KERBED = new Set(["trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "living_street"]);
  const RW = { trunk: 9, primary: 8.5, secondary: 8, tertiary: 7, residential: 6, unclassified: 5.5, living_street: 5 };
  // what each part of a square's scenery is (world.ts names each part as it builds it)
  const SKIP = new Set(["sky", "trees", "woods", "outskirts", "field", "lamps", "grass", "grass-build", "furniture", "shops", "face-cells"]);
  const PHASE = { ground: "ground", buildings: "building", "walls-fences": "wall", "doors-bays": "steps or door", "landmarks-tunnels": "set piece or landmark", pitches: "pitch", roads: "bridge or works" };
  const ROAD = new Set(["road", "service"]), PAVING = new Set(["pave", "drive", "front", "path"]), OPEN = new Set(["ground", "grass", "dirt", "gravel", "path"]);
  const label = (o) => {
    for (let p = o; p; p = p.parent) if (p.name) return SKIP.has(p.name) ? null : PHASE[p.name] ?? p.name;
    return "other";
  };
  const C = 2;    // metres a grid cell
  function trianglesIn(x0, y0, x1, y1) {
    const scene = [...window.__scenes].reduce((a, s) => (!a || s.children.length > a.children.length ? s : a), null);
    let V = new Float32Array(9 * 65536), L = [], n = 0;
    const names = [], nameOf = new Map(), grid = new Map();
    const id = (s) => nameOf.get(s) ?? (nameOf.set(s, names.length), names.push(s), names.length - 1);
    scene.updateMatrixWorld();
    const box = { x0, x1, z0: -y1, z1: -y0 };
    scene.traverseVisible((m) => {
      if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || !m.geometry?.attributes?.position?.array || (m.geometry.index && !m.geometry.index.array)) return;
      const what = m.userData.what;
      const base = what ? (what.includes(",") ? null : what) : label(m);
      if (!what && base === null) return;
      const kinds = what?.includes(",") ? what.split(",") : null, kindAttr = m.geometry.attributes.kind;
      const g = m.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox.clone().applyMatrix4(m.matrixWorld);
      if (bb.max.x < box.x0 || bb.min.x > box.x1 || bb.max.z < box.z0 || bb.min.z > box.z1) return;
      const pos = g.attributes.position, idx = g.index, cnt = idx ? idx.count : pos.count, e = m.matrixWorld.elements;
      const two = (Array.isArray(m.material) ? m.material[0] : m.material).side === 2;
      const v = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (let t = 0; t + 2 < cnt; t += 3) {
        for (let k = 0; k < 3; k++) {
          const i = idx ? idx.getX(t + k) : t + k, X = pos.getX(i), Y = pos.getY(i), Z = pos.getZ(i);
          v[3 * k] = e[0] * X + e[4] * Y + e[8] * Z + e[12]; v[3 * k + 1] = e[1] * X + e[5] * Y + e[9] * Z + e[13]; v[3 * k + 2] = e[2] * X + e[6] * Y + e[10] * Z + e[14];
        }
        const ux = v[3] - v[0], uz = v[5] - v[2], wx = v[6] - v[0], wz = v[8] - v[2], d = ux * wz - uz * wx;
        // (seen from above only: a wall's face is edge on, and a face turned down is a soffit)
        if (Math.abs(d) < 1e-6 || (!two && d > 0)) continue;
        const ax = Math.min(v[0], v[3], v[6]), bx = Math.max(v[0], v[3], v[6]), az = Math.min(v[2], v[5], v[8]), bz = Math.max(v[2], v[5], v[8]);
        if (bx < box.x0 || ax > box.x1 || bz < box.z0 || az > box.z1) continue;
        if (9 * n + 9 > V.length) { const W = new Float32Array(V.length * 2); W.set(V); V = W; }
        V.set(v, 9 * n);
        L.push(id(kinds ? kinds[kindAttr ? kindAttr.getX(idx ? idx.getX(t) : t) : 0] ?? "paving" : base));
        for (let i = Math.floor(ax / C); i <= Math.floor(bx / C); i++) for (let j = Math.floor(az / C); j <= Math.floor(bz / C); j++) {
          const k = i * 100003 + j; (grid.get(k) ?? grid.set(k, []).get(k)).push(n);
        }
        n++;
      }
    });
    return { V, L, names, grid };
  }
  /** Every face over scene (x, z) seen from above, as [height, what], highest first. */
  function hits(T, x, z) {
    const out = [], V = T.V;
    for (const t of T.grid.get(Math.floor(x / C) * 100003 + Math.floor(z / C)) ?? []) {
      const o = 9 * t, ux = V[o + 3] - V[o], uz = V[o + 5] - V[o + 2], wx = V[o + 6] - V[o], wz = V[o + 8] - V[o + 2], d = ux * wz - uz * wx;
      const px = x - V[o], pz = z - V[o + 2], s = (px * wz - pz * wx) / d, u = (ux * pz - uz * px) / d;
      if (s < -1e-6 || u < -1e-6 || s + u > 1 + 1e-6) continue;
      out.push([V[o + 1] + s * (V[o + 4] - V[o + 1]) + u * (V[o + 7] - V[o + 1]), T.names[T.L[t]]]);
    }
    return out.sort((a, b) => b[0] - a[0]);
  }
  /** Offsets across a band reaching `reach` either side of its middle, a metre apart and spread evenly. */
  const across = (reach) => {
    if (!(reach > 0.25)) return [0];
    const k = Math.ceil(2 * reach);
    return Array.from({ length: k + 1 }, (_, i) => -reach + (2 * reach * i) / k);
  };
  window.__overroad = (box) => {
    const map = window.__map(), [x0, y0, x1, y1] = box, out = [];
    const T = trianglesIn(x0 - 4, y0 - 4, x1 + 4, y1 + 4);
    // where several records end together: a junction, whose corners are another street's
    const ends = new Map(), key = (q) => `${Math.round(q[0] * 2)},${Math.round(q[1] * 2)}`;
    const maps = [map, ...map.tiles.values()].filter((m) => m.d?.rd);
    for (const m of maps) for (const r of m.d.rd) if (r.p.length > 1 && !["footway", "path", "steps", "cycleway", "bridleway", "track", "pedestrian"].includes(r.c))
      for (const q of [r.p[0], r.p[r.p.length - 1]]) ends.set(key(q), (ends.get(key(q)) ?? 0) + 1);
    // every carriageway near the box, to tell a pavement's sample that falls in another street's road
    const segs = [], SG = 8, sgrid = new Map();
    for (const m of maps) for (const r of m.d.rd) {
      if (r.p.length < 2 || ["footway", "path", "steps", "cycleway", "bridleway", "track", "pedestrian"].includes(r.c)) continue;
      const h = (r.w ?? RW[r.c] ?? 4) / 2;
      for (let k = 0; k + 1 < r.p.length; k++) {
        const [ax, ay] = r.p[k], [bx, by] = r.p[k + 1];
        if (Math.max(ax, bx) < x0 - 20 || Math.min(ax, bx) > x1 + 20 || Math.max(ay, by) < y0 - 20 || Math.min(ay, by) > y1 + 20) continue;
        const i = segs.push([ax, ay, bx, by, h, r]) - 1;
        for (let gx = Math.floor((Math.min(ax, bx) - h) / SG); gx <= Math.floor((Math.max(ax, bx) + h) / SG); gx++)
          for (let gy = Math.floor((Math.min(ay, by) - h) / SG); gy <= Math.floor((Math.max(ay, by) + h) / SG); gy++)
            (sgrid.get(gx * 100003 + gy) ?? sgrid.set(gx * 100003 + gy, []).get(gx * 100003 + gy)).push(i);
      }
    }
    const inOtherRoad = (px, py, own) => (sgrid.get(Math.floor(px / SG) * 100003 + Math.floor(py / SG)) ?? []).some((i) => {
      const [ax, ay, bx, by, h, r] = segs[i];
      if (r === own) return false;
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
      return Math.hypot(px - ax - t * dx, py - ay - t * dy) < h;
    });
    const seen = new Set();
    for (const m of maps) for (const r of m.d.rd) {
      if (!KERBED.has(r.c) || r.p.length < 2 || r.bridge || r.p.some((q) => q[3])) continue;
      const half = (r.w ?? RW[r.c] ?? 4) / 2, pv = r.pv ?? [1.7, 1.7], z0 = m.z0 ?? 0;
      const lens = [];
      for (let k = 0; k + 1 < r.p.length; k++) lens.push(Math.hypot(r.p[k + 1][0] - r.p[k][0], r.p[k + 1][1] - r.p[k][1]));
      const total = lens.reduce((a, b) => a + b, 0);
      const crowded = [r.p[0], r.p[r.p.length - 1]].map((q) => (ends.get(key(q)) ?? 0) > 2);
      let along = 0;
      for (let k = 0; k + 1 < r.p.length; k++) {
        const A = r.p[k], B = r.p[k + 1], len = lens[k];
        if (len < 0.01) continue;
        const tx = (B[0] - A[0]) / len, ty = (B[1] - A[1]) / len, nx = -ty, ny = tx;
        for (let s = (Math.ceil(along) - along); s < len; s += 1) {
          const f = s / len, x = A[0] + (B[0] - A[0]) * f, y = A[1] + (B[1] - A[1]) * f;
          if (x < x0 || x >= x1 || y < y0 || y >= y1) continue;
          const sk = `${Math.round(x * 4)},${Math.round(y * 4)}`;
          if (seen.has(sk)) continue;     // (a street in two squares' records is sampled once)
          seen.add(sk);
          const walk = A[2] + (B[2] - A[2]) * f - z0, from = along + s, toEnd = total - from;
          // (a junction of three or more ways: its corners belong to the streets round it)
          const atJunction = (crowded[0] && from < half + 2.5) || (crowded[1] && toEnd < half + 2.5);
          // (a dead end or a square's edge: the last metre is the road's end, drawn square or round)
          const atEnd = (!crowded[0] && from < 1) || (!crowded[1] && toEnd < 1);
          const row = [], offs = across(half - 0.3);
          for (const o of offs) {
            if (o && atEnd) continue;
            const px = x + nx * o, py = y + ny * o, H = hits(T, px, -py).filter(([h]) => h <= walk + 3);
            const road = H.find(([h, w]) => ROAD.has(w) && Math.abs(h - walk) < 1.0);
            const top = H[0];
            if (!top || (ROAD.has(top[1]) && road)) continue;
            if (road && top[0] - road[0] <= 0.02) continue;
            row.push({ rule: road ? "road" : "none", n: r.n ?? "", side: o > 0 ? 1 : o < 0 ? -1 : 0, x: px, y: py, h: road ? top[0] - road[0] : 0, what: top[1] });
          }
          // (a street paved kerb to kerb, a shared surface or a private road, is paved on purpose)
          if (!(row.length === offs.length && row.every((q) => q.rule === "none" && q.what === "drive"))) out.push(...row);
          for (const [side, w] of [[1, pv[0]], [-1, pv[1]]]) {
            if (!(w >= 0.8) || atJunction) continue;
            let off = false;
            // (from 0.6 m off the kerb, as a record's line and the drawn kerb differ a little round
            // a bend, to 0.5 m off the back, where a hedge on the boundary leans over)
            const lo = Math.min(0.6, w / 2), hi = Math.max(lo, w - 0.5);
            for (const a of across((hi - lo) / 2)) {
              const o = side * (half + (lo + hi) / 2 + a), px = x + nx * o, py = y + ny * o;
              if (inOtherRoad(px, py, r)) continue;     // (a junction: that is the other street's road)
              const top = hits(T, px, -py).filter(([h]) => h <= walk + 3)[0];
              if (top && !PAVING.has(top[1])) {
                // (road from the kerb out to here is a carriageway drawn wider than its record says)
                let wide = false;
                if (ROAD.has(top[1])) {
                  const ko = side * (half + 0.3), K = hits(T, x + nx * ko, -(y + ny * ko)).filter(([h]) => h <= walk + 3)[0];
                  wide = !!K && ROAD.has(K[1]);
                }
                out.push({ rule: wide ? "wide" : "pave", n: r.n ?? "", side, x: px, y: py, h: 0, what: top[1] }); off = true;
              }
            }
            if (off) continue;
            const o = side * (half + w / 2), px = x + nx * o, py = y + ny * o;
            const top = hits(T, px, -py).filter(([h]) => h <= walk + 3)[0];
            if (!top) continue;
            const bo = side * (half + w + 0.35), bx = x + nx * bo, by = y + ny * bo;
            const B2 = hits(T, bx, -by).filter(([h]) => h <= walk + 3)[0];
            if (B2 && OPEN.has(B2[1]) && top[0] - B2[0] > 0.3) { out.push({ rule: "lip", n: r.n ?? "", side, x: bx, y: by, h: top[0] - B2[0], what: B2[1] }); continue; }
            // (and its kerb: a pavement a hand over the road, not a step up)
            const ko = side * (half - 0.3), kx = x + nx * ko, ky = y + ny * ko;
            const K = hits(T, kx, -ky).filter(([h]) => h <= walk + 3)[0];
            if (K && ROAD.has(K[1]) && top[0] - K[0] > 0.35) out.push({ rule: "lip", n: r.n ?? "", side, x: kx, y: ky, h: top[0] - K[0], what: "road" });
          }
        }
        along += len;
      }
    }
    return out;
  };
}
