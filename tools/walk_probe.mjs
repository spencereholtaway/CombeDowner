// Walks a player along every footpath of a few squares with the game's own movement code
// (player.ts), and logs where walking goes wrong: the measure of the ground plan's paths, steps,
// bridges and tunnels (docs/plans/ground-architecture.md, 6.2). It serves a built game (web/dist)
// to a muted headless Chrome that can't make a sound (tools/quiet-guard.mjs), starts a solo game,
// and for each square puts the player at its middle, waits until the squares round it are built,
// then walks each way from one end to the other at walking pace, steering at a point 1.5 m on
// along its line, a fixed step at a time. The ways are those of the classes asked for whose middle
// is in the square, and the ways through tunnels (each square's tn); a way that reaches past the
// force field round the map isn't walked, as nobody can.
//
// The walking is done inside the page in one go between frames, so nothing else in the game moves
// while it does, and the traffic, naughty boys, cats and pickups are stopped for the whole run (and
// no car or bus is there to bump into), so two runs on the same build and maps give the same counts.
// The progression is switched off (?progression=0): with it on, the zones' wall puts anyone set down
// outside the first zone straight back inside it (game.ts zoneUpkeep), which is what used to undo a
// probe's teleport on the first frame.
//
// Logged along each way:
//  - blocked: no progress along it for 2 s (the walk is then carried on from the next clear spot at
//    least 3 m further along);
//  - fell: came down more than 0.5 m lower than where the feet left the ground, except on a flight
//    of steps (walking down a steep path keeps the feet on it, so isn't a fall);
//  - through a wall: a step that crossed a wall, fence, building or tree trunk at waist height
//    (map.raycast; a hop over a low wall goes over it, so isn't counted);
//  - stuck: the game's unstick fired (shut inside a building), as game.ts calls it every frame;
//  - hopped: the player vaulted or climbed something across the way;
//  - off line: metres walked more than 1 m off the way's line;
//  - off surface: metres walked with the feet more than 0.1 m above ("over") or below ("under") the
//    nearest surface drawn there, looking straight down through the scene's triangles as
//    tools/overroad.mjs does (trees, grass, lamps and other small things left out; the ground's
//    shader cuts holes for the canal and tunnel mouths that this can't see), or nothing drawn
//    within 3 m.
//
//   cd web && npm run build && cd .. && node tools/walk_probe.mjs --tiles "1,2 1,1" --out walk
//   options: --map combe-down, --ways 300 (at most this many ways a square, spread through its list;
//   0 for all), --classes footway,path,steps,cycleway,bridleway,pedestrian, --pavements (each
//   kerbed street's pavements too), --hz 60 (steps a second), --view 700 (draw distance: the squares
//   within it are built round the one being walked), --places 40 (places a square kept for views),
//   --query "ground=sheet" (more of the address, to try one of the game's own options),
//   --dist web/dist, --timeout 180 (seconds a square may take to build), --trace k (walk only the
//   square's k-th way, and keep where the player was every tenth of a second in walk.json).
//   PW= and CHROME= as for tools/shoot.mjs.
//
// Writes <out>/walk.json (every square's counts, by class of way, and places) and <out>/views.json,
// the worst places as views for tools/shoot.mjs ({name: [cam east, cam north, height, look east,
// look north, look height]}), and prints a table by square and per km walked. Nothing goes over the
// network.
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
const argv = process.argv.slice(2);
const opt = { dist: WEB + "dist", map: "combe-down", tiles: "1,2", ways: "300", classes: "footway,path,steps,cycleway,bridleway,pedestrian",
  hz: "60", view: "700", places: "40", out: "walk", timeout: "180", size: "640x360" };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--pavements") opt.pavements = true;
  else if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
}
const squares = opt.tiles.split(/\s+/).filter(Boolean).map((s) => s.split(/[,_]/).map(Number));
fs.mkdirSync(opt.out, { recursive: true });
const [W, H] = opt.size.split("x").map(Number);

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
await new Promise((r) => server.listen(0, "127.0.0.1", r));

// ---- a muted headless Chrome -------------------------------------------------------------------
const linux = process.platform === "linux";
const exe = process.env.CHROME || (linux && fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
const browser = await chromium.launch({
  headless: true, ...(exe ? { executablePath: exe } : { channel: "chrome" }),
  args: [...MUTED_ARGS, ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
const context = await browser.newContext({ viewport: { width: W, height: H } });
await silenceContext(context);
const page = await context.newPage();
await silence(page);
const complaints = [];
page.on("pageerror", (e) => complaints.push(`error: ${e.message}`));
// (the squares keep their models' arrays, to be looked through here, instead of letting them go once drawn)
await page.addInitScript(() => { globalThis.__keepArrays = true; });

const t0 = Date.now();
const q = new URLSearchParams({ map: opt.map, time: "11:00", progression: "0", view: opt.view, ...Object.fromEntries(new URLSearchParams(opt.query ?? "")) });
await page.goto(`http://127.0.0.1:${server.address().port}/?${q}`);
await page.evaluate(() => { window.__budget = 40; });
// Solo is enabled before main.ts has hooked it up, so it's clicked until there's a game
for (let i = 0; i < 180 && !(await page.evaluate(() => !!window.__game?.())); i++) {
  await page.evaluate(() => document.getElementById("solo")?.click());
  await page.waitForTimeout(1000);
}
if (!(await page.evaluate(() => !!window.__game?.()))) { console.error("no game started"); process.exit(1); }
await page.evaluate(install);

const report = { started: new Date().toISOString(), options: opt, squares: [] };
const views = {};
for (const [ti, tj] of squares) {
  const s0 = Date.now();
  const there = await page.evaluate(([ti, tj]) => window.__walk.goTo(ti, tj), [ti, tj]);
  if (!there) { console.log(`square ${ti}_${tj}: not on this map`); continue; }
  const ready = await settle();
  const info = await page.evaluate(([ti, tj, o]) => window.__walk.prepare(ti, tj, o), [ti, tj, { ways: +opt.ways, classes: opt.classes.split(","), pavements: !!opt.pavements, trace: opt.trace === undefined ? -1 : +opt.trace }]);
  if (!info) { console.log(`square ${ti}_${tj}: not loaded`); continue; }
  process.stderr.write(`square ${ti}_${tj}: ${info.walks} walks of ${info.of} ways (and ${info.outside} reaching past the force field, not walked), ${(info.metres / 1000).toFixed(1)} km${ready ? "" : " (NOT fully built)"}\n`);
  for (;;) {
    const r = await page.evaluate((hz) => window.__walk.batch(1 / hz, 4000), +opt.hz);
    process.stderr.write(`\r  ${r.done}/${info.walks}   `);
    if (r.done >= info.walks) break;
  }
  const res = await page.evaluate(() => window.__walk.result());
  process.stderr.write("\n");
  res.square = `${ti}_${tj}`; res.ready = ready; res.outside = info.outside; res.seconds = (Date.now() - s0) / 1000;
  // the worst places, as views: from 6 m back along the way and 3 m up, looking at the spot
  const ranked = res.places.slice().sort((a, b) => (b.score - a.score));
  for (const [k, p] of ranked.slice(0, +opt.places).entries()) {
    views[`${res.square}-${String(k + 1).padStart(2, "0")}-${p.kind.replace(/ /g, "-")}`] =
      [+(p.x - 6 * p.ue).toFixed(1), +(p.y - 6 * p.un).toFixed(1), 3, +p.x.toFixed(1), +p.y.toFixed(1), 0.3];
  }
  report.squares.push(res);
  printSquare(res);
}
report.seconds = (Date.now() - t0) / 1000;
report.complaints = [...new Set(complaints)].slice(0, 50);
report.audio = await silenceNote(page);
fs.writeFileSync(path.join(opt.out, "walk.json"), JSON.stringify(report, null, 1));
fs.writeFileSync(path.join(opt.out, "views.json"), JSON.stringify(views, null, 1));
printTable(report.squares);
console.log(`${Object.keys(views).length} views in ${opt.out}/views.json; everything in ${opt.out}/walk.json; ${report.seconds.toFixed(0)} s`);
console.log(report.audio);
await browser.close();
server.close();

function printSquare(r) {
  const c = r.counts;
  console.log(`${r.square}: ${r.walks} walks, ${(c.metres / 1000).toFixed(2)} km in ${r.seconds.toFixed(0)} s; blocked ${c.blocked}, fell ${c.fell}, through a wall ${c.wall}, stuck ${c.stuck}, hopped ${c.hopped}, off line ${c.offLine.toFixed(0)} m, off surface ${c.offSurface.toFixed(0)} m (over ${c.over.toFixed(0)}, under ${c.under.toFixed(0)}, nothing drawn ${c.nothing.toFixed(0)})`);
  for (const [k, v] of Object.entries(r.byClass)) console.log(`  ${k}: ${v.walks} walks, ${(v.metres / 1000).toFixed(2)} km; ${Object.entries(v.places).map(([p, n]) => `${p} ${n}`).join(", ") || "nothing wrong"}`);
}
function printTable(rows) {
  const per = (v, m) => (m > 0 ? (v / (m / 1000)).toFixed(1) : "-");
  console.log("\nsquare   km     blocked/km  fell/km  wall/km  stuck/km  hopped/km  off-line m/km  off-surface m/km");
  for (const r of rows) {
    const c = r.counts, m = c.metres;
    console.log(`${r.square.padEnd(8)} ${(m / 1000).toFixed(2).padStart(5)}  ${per(c.blocked, m).padStart(10)}  ${per(c.fell, m).padStart(7)}  ${per(c.wall, m).padStart(7)}  ${per(c.stuck, m).padStart(8)}  ${per(c.hopped, m).padStart(9)}  ${per(c.offLine, m).padStart(13)}  ${per(c.offSurface, m).padStart(16)}`);
  }
}

/** Wait until the squares round the player are loaded and built and have stayed so a moment, as
 *  tools/shoot.mjs does (tiles.ts's Calm). */
async function settle() {
  await page.evaluate(() => { window.__walkCalm = window.__calm(12, 500); });
  return page.waitForFunction(() => window.__walkCalm.still(window.__tilesPending ?? 1), null, { timeout: +opt.timeout * 1000, polling: "raf" }).then(() => true, () => false);
}

/** In the page: window.__walk, which moves the player to a square, picks its ways and walks them. */
function install() {
  const g = window.__game(), m = g.map, pl = g.player, Z0 = m.z0;
  // everything that moves by itself, stopped for the run (the walks are timed by the probe, not the frames)
  for (const k of ["traffic", "naughtyBoys", "cats", "pickups"]) if (g[k]?.update) g[k].update = () => {};
  const DOWN = 3;                   // metres above and below the feet a surface is looked for
  const SKIP = new Set(["sky", "trees", "woods", "outskirts", "field", "lamps", "grass", "grass-build", "shops", "face-cells"]);
  // things that move, and their parts, are no surface to measure the feet against
  const moving = new Set();
  {
    const scene = g.world.scene, seen = new Set();
    const top = (o) => { while (o.parent && o.parent !== scene) o = o.parent; return o.parent === scene ? o : null; };
    const dig = (v, d) => {
      if (!v || typeof v !== "object" || seen.has(v) || d > 4) return;
      seen.add(v);
      if (v.isObject3D) { const t = top(v); if (t) moving.add(t); return; }
      if (v.isMaterial || v.isBufferGeometry || v.isTexture || ArrayBuffer.isView(v)) return;
      const vals = v instanceof Map ? [...v.values()] : v instanceof Set ? [...v] : Array.isArray(v) ? v : Object.values(v);
      for (const x of vals.slice(0, 400)) dig(x, d + 1);
    };
    for (const k of ["vehicles", "traffic", "naughtyBoys", "cats", "pickups", "remotes", "weapon"]) dig(g[k], 0);
  }

  // ---- the drawn surfaces, as triangles in 2 m cells, built a 64 m block at a time as needed ----
  const C = 2, B = 64;
  let meshes = null;               // [mesh, world box, label] for every mesh that could be stood on
  const blocks = new Map();
  const labelOf = (o) => {
    let part = "";
    for (let p = o; p; p = p.parent) { if (p.userData?.square) break; if (p.name) { part = p.name; break; } }
    return o.userData.what ?? (part || "scenery");
  };
  const gather = () => {
    meshes = [];
    g.world.scene.updateMatrixWorld();
    g.world.scene.traverseVisible((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
      for (let p = o; p; p = p.parent) { if (SKIP.has(p.name) || moving.has(p)) return; }
      const geo = o.geometry;
      if (!geo?.attributes?.position?.array || (geo.index && !geo.index.array)) return;
      if (!geo.boundingBox) geo.computeBoundingBox();
      meshes.push([o, geo.boundingBox.clone().applyMatrix4(o.matrixWorld), labelOf(o)]);
    });
  };
  const block = (bi, bj) => {
    const key = bi * 100003 + bj;
    let b = blocks.get(key);
    if (b) return b;
    if (blocks.size > 200) blocks.clear();
    const x0 = bi * B, z0 = bj * B, x1 = x0 + B, z1 = z0 + B;
    const V = [], L = [], cells = new Map(), v = new Array(9);
    for (const [o, bb, label] of meshes) {
      if (bb.max.x < x0 || bb.min.x > x1 || bb.max.z < z0 || bb.min.z > z1) continue;
      const geo = o.geometry, pos = geo.attributes.position, idx = geo.index, n = idx ? idx.count : pos.count, e = o.matrixWorld.elements;
      const two = (Array.isArray(o.material) ? o.material[0] : o.material).side === 2;
      for (let t = 0; t + 2 < n; t += 3) {
        for (let k = 0; k < 3; k++) {
          const i = idx ? idx.getX(t + k) : t + k, X = pos.getX(i), Y = pos.getY(i), Zz = pos.getZ(i);
          v[3 * k] = e[0] * X + e[4] * Y + e[8] * Zz + e[12]; v[3 * k + 1] = e[1] * X + e[5] * Y + e[9] * Zz + e[13]; v[3 * k + 2] = e[2] * X + e[6] * Y + e[10] * Zz + e[14];
        }
        const ax = Math.min(v[0], v[3], v[6]), bx = Math.max(v[0], v[3], v[6]), az = Math.min(v[2], v[5], v[8]), bz = Math.max(v[2], v[5], v[8]);
        if (bx < x0 || ax > x1 || bz < z0 || az > z1) continue;
        // (seen from above only: a wall's face is edge on, and a face turned down is a soffit)
        const d = (v[3] - v[0]) * (v[8] - v[2]) - (v[5] - v[2]) * (v[6] - v[0]);
        if (Math.abs(d) < 1e-6 || (!two && d > 0)) continue;
        const ti = V.length / 9;
        V.push(...v); L.push(label);
        for (let i = Math.max(Math.floor(ax / C), x0 / C); i <= Math.min(Math.floor(bx / C), x1 / C - 1); i++)
          for (let j = Math.max(Math.floor(az / C), z0 / C); j <= Math.min(Math.floor(bz / C), z1 / C - 1); j++) {
            const k = i * 100003 + j; (cells.get(k) ?? cells.set(k, []).get(k)).push(ti);
          }
      }
    }
    b = { V: Float32Array.from(V), L, cells };
    blocks.set(key, b);
    return b;
  };
  /** Every surface drawn at scene (x, z), as [height, what]. */
  const surfaces = (x, z) => {
    const b = block(Math.floor(x / B), Math.floor(z / B)), out = [], V = b.V;
    for (const t of b.cells.get(Math.floor(x / C) * 100003 + Math.floor(z / C)) ?? []) {
      const o = t * 9, ax = V[o], az = V[o + 2], bx = V[o + 3], bz = V[o + 5], cx = V[o + 6], cz = V[o + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-9) continue;
      const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, wc = 1 - wa - wb;
      if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;
      out.push([wa * V[o + 1] + wb * V[o + 4] + wc * V[o + 7], b.L[t]]);
    }
    return out;
  };

  // ---- the ways ---------------------------------------------------------------------------------
  let walks = [], next = 0, counts = null, places = [], byClass = {};
  const tileOf = (ti, tj) => [...m.tiles.values()].find((t) => t.d.tile && t.d.tile[0] === ti && t.d.tile[1] === tj);
  const KERBED = new Set(["trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "living_street"]);
  const RW = { trunk: 9, primary: 8.5, secondary: 8, tertiary: 7, residential: 6, unclassified: 5.5, living_street: 5 };

  /** A line along the way, offset sideways by off metres (left of its direction, in data metres). */
  const offset = (p, off) => p.map((q, i) => {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [q[0] - (b[1] - a[1]) / l * off, q[1] + (b[0] - a[0]) / l * off, q[2]];
  });

  /** Walking along a line: its stations, the point s metres along and the nearest station to a point. */
  function line(p) {
    const S = [0];
    for (let i = 1; i < p.length; i++) S.push(S[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    const L = S[S.length - 1];
    const at = (s) => {
      s = Math.max(0, Math.min(L, s));
      let i = 1;
      while (i < S.length - 1 && S[i] < s) i++;
      const f = (s - S[i - 1]) / ((S[i] - S[i - 1]) || 1), a = p[i - 1], b = p[i], l = (S[i] - S[i - 1]) || 1;
      return { e: a[0] + (b[0] - a[0]) * f, n: a[1] + (b[1] - a[1]) * f, h: (a[2] ?? NaN) + ((b[2] ?? NaN) - (a[2] ?? NaN)) * f, ue: (b[0] - a[0]) / l, un: (b[1] - a[1]) / l };
    };
    const near = (e, n) => {
      let best = { s: 0, d: Infinity };
      for (let i = 1; i < p.length; i++) {
        const a = p[i - 1], b = p[i], vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1e-9;
        const t = Math.max(0, Math.min(1, ((e - a[0]) * vx + (n - a[1]) * vy) / l2));
        const d = Math.hypot(a[0] + vx * t - e, a[1] + vy * t - n);
        if (d < best.d) best = { s: S[i - 1] + t * Math.sqrt(l2), d };
      }
      return best;
    };
    return { L, at, near };
  }

  /** Where to stand at a point of the way: on whatever floor is there under the way's own height
   *  (a deck or a tunnel's floor), else the ground. */
  const standAt = (q) => {
    const x = q.e, z = -q.n;
    return q.h === q.h ? m.floor(x, z, q.h - Z0 + 0.5) : m.ground(x, z);
  };

  /** A place along a walk where something went wrong, kept for the report and as a view. */
  const place = (kind, w, x, z, score, more) => {
    const n = -z, q = w.ln.at(w.ln.near(x, n).s), c = (byClass[w.c] ??= { walks: 0, metres: 0, places: {} });
    c.places[kind] = (c.places[kind] ?? 0) + 1;
    places.push({ kind, x: +x.toFixed(1), y: +n.toFixed(1), ue: q.ue, un: q.un, score, walk: w.i, way: w.name, c: w.c, ...more });
  };

  function walkOne(w, dt) {
    const ln = w.ln, L = ln.L, keep = m.movers.splice(0);
    try {
      const put = (s) => {
        const q = ln.at(s), ahead = ln.at(s + 1.5);
        pl.spawn(q.e, -q.n, Math.atan2(-(ahead.e - q.e), ahead.n - q.n));
        pl.pos.y = standAt(q);
        pl.keys.clear(); pl.ladders = []; pl.ladder = null; pl.sprinting = false;
        for (let i = 0; i < 6; i++) pl.update(dt, false);
        pl.keys.add("KeyW");
      };
      put(0);
      let best = 0, bestT = 0, t = 0, wallS = -9, air = null, offSurf = null, offLine = null, walked = 0, sampleAt = 1;
      const limit = L / 1.5 + 20;
      const flight = w.c === "steps";
      while (t < limit) {
        const p = pl.pos, x0 = p.x, y0 = p.y, z0 = p.z;
        const here = ln.near(x0, -z0), aim = ln.at(Math.min(L, here.s + 1.5));
        if (here.s >= L - 0.5) break;
        pl.yaw = Math.atan2(-(aim.e - x0), -(-aim.n - z0));
        pl.update(dt, true);
        t += dt;
        if (w.trace && Math.round(t / dt) % 6 === 0) w.trace.push([+t.toFixed(2), +p.x.toFixed(2), +(-p.z).toFixed(2), +p.y.toFixed(2), +here.s.toFixed(1), +here.d.toFixed(2), pl.onGround ? 1 : 0]);
        const unstuck = pl.unstick();
        if (unstuck) { counts.stuck++; place("stuck", w, p.x, p.z, 5); }
        if (pl.jumped) { counts.hopped++; place("hopped", w, x0, z0, 1); }
        const step = Math.hypot(p.x - x0, p.z - z0);
        // a step through something solid at waist height (not the unstick's own move out of a building)
        if (step > 1e-4 && !unstuck) {
          const h = m.raycast(x0, y0 + 0.9, z0, (p.x - x0) / step, 0, (p.z - z0) / step, step);
          if (h && h.kind !== "ground" && !h.mover && here.s - wallS > 1) { wallS = here.s; counts.wall++; place("through a wall", w, x0, z0, 8, { what: h.kind }); }
        }
        // a drop through the air that isn't a flight's
        if (!pl.onGround && !air) air = { y: y0, x: x0, z: z0 };
        else if (pl.onGround && air) {
          if (air.y - p.y > 0.5 && !flight) { counts.fell++; place("fell", w, air.x, air.z, 6, { drop: +(air.y - p.y).toFixed(2) }); }
          air = null;
        }
        const now = ln.near(p.x, -p.z);
        if (now.s > best + 0.3) { best = now.s; bestT = t; }
        walked += step;
        // off the line
        if (now.d > 1) {
          counts.offLine += step;
          if (!offLine) { offLine = { x: p.x, z: p.z, m: 0, d: 0 }; }
          offLine.m += step; offLine.d = Math.max(offLine.d, now.d);
        } else if (offLine) { if (offLine.m >= 1) place("off line", w, offLine.x, offLine.z, offLine.m / 2, { metres: +offLine.m.toFixed(1), most: +offLine.d.toFixed(2) }); offLine = null; }
        // the feet against the surface drawn under them, a metre at a time, while on it
        if (walked >= sampleAt) {
          sampleAt += 1;
          counts.samples++;
          const s = pl.onGround ? surfaces(p.x, p.z).filter(([h]) => Math.abs(h - p.y) <= DOWN) : null;
          if (s) {
            let gap = Infinity, what = "";
            for (const [h, l] of s) if (Math.abs(h - p.y) < Math.abs(gap)) { gap = h - p.y; what = l; }
            const off = !s.length ? "nothing drawn" : gap > 0.1 ? "under" : gap < -0.1 ? "over" : null;
            if (off) {
              counts.offSurface++;
              counts[off === "nothing drawn" ? "nothing" : off]++;
              if (!offSurf || offSurf.kind !== off) {
                if (offSurf) place(`off surface ${offSurf.kind}`, w, offSurf.x, offSurf.z, offSurf.m * offSurf.worst, { metres: offSurf.m, worst: +offSurf.worst.toFixed(2), what: offSurf.what });
                offSurf = { kind: off, x: p.x, z: p.z, m: 0, worst: 0, what };
              }
              offSurf.m++;
              if (s.length && Math.abs(gap) > offSurf.worst) { offSurf.worst = Math.abs(gap); offSurf.what = what; }
            } else if (offSurf) {
              place(`off surface ${offSurf.kind}`, w, offSurf.x, offSurf.z, offSurf.m * Math.max(offSurf.worst, 0.5), { metres: offSurf.m, worst: +offSurf.worst.toFixed(2), what: offSurf.what });
              offSurf = null;
            }
          }
        }
        // no headway for 2 s: blocked, and on from 3 m further along
        if (t - bestT > 2) {
          counts.blocked++; place("blocked", w, p.x, p.z, 10);
          // (on to clear ground: not into the building or wall that stopped it)
          let s = best + 3;
          while (s < L - 0.5) { const q = ln.at(s); if (!m.indoors(q.e, -q.n) && !m.blocked(q.e, -q.n, 0.4)) break; s += 1; }
          if (s >= L - 0.5) break;
          best = s; bestT = t; air = null; put(best);
        }
      }
      if (offSurf) place(`off surface ${offSurf.kind}`, w, offSurf.x, offSurf.z, offSurf.m * Math.max(offSurf.worst, 0.5), { metres: offSurf.m, worst: +offSurf.worst.toFixed(2), what: offSurf.what });
      if (offLine && offLine.m >= 1) place("off line", w, offLine.x, offLine.z, offLine.m / 2, { metres: +offLine.m.toFixed(1), most: +offLine.d.toFixed(2) });
      if (t >= limit) { counts.blocked++; place("blocked", w, pl.pos.x, pl.pos.z, 10, { timedOut: true }); }
      counts.metres += L;
      counts.seconds += t;
      const c = (byClass[w.c] ??= { walks: 0, metres: 0, places: {} });
      c.walks++; c.metres += L;
    } finally {
      m.movers.push(...keep);
      pl.keys.clear();
    }
  }

  window.__walk = {
    /** Put the player in the middle of square (ti, tj), to have it and those round it built. */
    goTo(ti, tj) {
      const I = m.tileIndex;
      if (!I || !I.tiles.some(([i, j]) => i === ti && j === tj)) return false;
      const S = I.cells * I.dx, x = I.x0 + (ti + 0.5) * S, z = -(I.y0 + (tj + 0.5) * S);
      pl.spawn(x, z, 0);
      g.world.look();
      return true;
    },
    /** The ways to walk in square (ti, tj): those of the classes asked for whose middle is in it (a
     *  way crossing into the next square is that square's too), at most o.ways of them, spread evenly
     *  through the square's list so the same ones are picked every run. */
    prepare(ti, tj, o) {
      const t = tileOf(ti, tj);
      if (!t) return null;
      const [bx0, by0, bx1, by1] = t.d.b, inside = (q) => q[0] >= bx0 && q[0] < bx1 && q[1] >= by0 && q[1] < by1;
      const want = new Set(o.classes), all = [];
      // (a way through a tunnel is its own record, with the tube's floor heights)
      for (const r of [...t.d.rd, ...(t.d.tn ?? []).map((q) => ({ ...q, tunnel: true }))]) {
        if (!r.p || r.p.length < 2) continue;
        const mid = r.p[Math.floor(r.p.length / 2)];
        if (!inside(mid)) continue;
        if (want.has(r.c)) all.push({ name: r.n || "", c: r.tunnel ? `${r.c} in a tunnel` : r.c, p: r.p });
        else if (o.pavements && KERBED.has(r.c)) {
          const w = r.w ?? RW[r.c] ?? 6, [pl0, pr0] = r.pv ?? [1.7, 1.7];
          if (pl0 > 0.5) all.push({ name: r.n || "", c: "pavement", p: offset(r.p, w / 2 + pl0 / 2) });
          if (pr0 > 0.5) all.push({ name: r.n || "", c: "pavement", p: offset(r.p, -(w / 2 + pr0 / 2)) });
        }
      }
      for (const w of all) w.ln = line(w.p);
      // (past the force field round the map nobody can walk, so a way that goes out of it isn't walked)
      const inField = (w) => w.p.every((q) => m.fieldEdge(q[0], -q[1]) > 1);
      const ok = all.filter((w) => w.ln.L >= 2 && inField(w)), out = all.filter((w) => w.ln.L >= 2 && !inField(w)).length;
      const k = o.ways > 0 && ok.length > o.ways ? ok.length / o.ways : 1;
      walks = k > 1 ? Array.from({ length: o.ways }, (_, i) => ok[Math.floor(i * k)]) : ok;
      walks.forEach((w, i) => { w.i = i; });
      if (o.trace >= 0) { walks = walks.slice(o.trace, o.trace + 1); if (walks[0]) walks[0].trace = []; }
      next = 0; places = []; byClass = {};
      counts = { metres: 0, seconds: 0, samples: 0, blocked: 0, fell: 0, wall: 0, stuck: 0, hopped: 0, offLine: 0, offSurface: 0, over: 0, under: 0, nothing: 0 };
      blocks.clear();
      gather();
      return { of: ok.length, outside: out, walks: walks.length, metres: walks.reduce((s, w) => s + w.ln.L, 0) };
    },
    /** Walk ways for up to ms milliseconds, a step of dt seconds at a time. */
    batch(dt, ms) {
      const until = performance.now() + ms;
      g.hp = 100;
      while (next < walks.length && performance.now() < until) walkOne(walks[next++], dt);
      return { done: next };
    },
    result() {
      for (const c of Object.values(byClass)) c.metres = Math.round(c.metres);
      return { walks: walks.length, byClass, counts, places, ...(walks[0]?.trace ? { trace: { way: walks[0].p, steps: walks[0].trace } } : {}) };
    },
  };
}
