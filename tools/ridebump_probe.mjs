// A check on riders bumping into each other (web/src/ridebump.ts) in the real game: a built game
// (web/dist) served to a muted headless Chrome, two tabs in a local test room (?net=local), both on
// bikes on a straight bit of street. Two runs:
// - side by side, A steering into B: neither screen ever draws them overlapping, and both are shoved apart;
// - from behind, A quicker than B: B is pushed on and A held up.
// Prints what each screen saw; exits 1 if a check fails.
//
//   cd web && npm run build && cd .. && node tools/quiet.mjs -- node tools/ridebump_probe.mjs
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silenceContext, silenceReport } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = createRequire(WEB + "package.json")("playwright");
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", map: "combe-down", room: "BUMP" + Math.floor(Math.random() * 1e5) };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];

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
const port = server.address().port;
const browser = await chromium.launch({
  headless: true, channel: "chrome",
  args: [...MUTED_ARGS, "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
    ...(process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
const context = await browser.newContext({ viewport: { width: 800, height: 500 } });
await silenceContext(context);
await context.addInitScript(() => { try { localStorage.setItem("cd-mic", "off"); } catch { /* */ } });
const checks = [], errors = [];
const check = (name, ok, detail = "") => { checks.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function join(name) {
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/?map=${opt.map}&net=local&room=${opt.room}&time=11:00&fx=0&progression=0`);
  await page.fill("#name", name).catch(() => {});
  for (let k = 0; k < 600; k++) {
    if (await page.evaluate(() => !!window.__game?.())) break;
    await page.evaluate(() => { const b = document.getElementById("play"); if (b && !b.disabled) b.click(); });
    await wait(300);
  }
  await page.addStyleTag({ content: "#menu,#pause,#debug,#touch,#micask,#scoreboard{display:none!important}" });
  await page.evaluate(() => {
    const g = window.__game(), u = g.update.bind(g);
    window.__shoves = [];
    const sh = g.player.shove.bind(g.player);
    g.player.shove = (ix, iz) => { window.__shoves.push({ t: performance.now(), ix, iz, v: g.player.rideV }); sh(ix, iz); };
    g.update = (dt) => {
      g.active = true;
      if (window.__drive) window.__drive(g.player, dt);
      u(dt);
    };
  });
  return page;
}

const A = await join("Alice"), B = await join("Bob");
for (const p of [A, B]) {
  for (let k = 0; k < 400; k++) { if (await p.evaluate(() => (window.__tilesPending ?? 0) === 0)) break; await wait(500); }
}
const ids = { A: await A.evaluate(() => window.__game().net.selfId), B: await B.evaluate(() => window.__game().net.selfId) };
for (let k = 0; k < 100; k++) {
  if (await A.evaluate((id) => window.__game().remotes.has(id), ids.B) && await B.evaluate((id) => window.__game().remotes.has(id), ids.A)) break;
  await wait(200);
}

// a straight, flat, paved run near A's spawn, 60 m long and 8 m wide
const run = await A.evaluate(() => {
  const g = window.__game(), m = g.map, s = g.player.pos;
  const clear = (x, z) => g.world.paved(x, z) && !m.indoors(x, z);
  for (let r = 0; r < 400; r += 8) for (let a = 0; a < 24; a++) for (let h = 0; h < 12; h++) {
    const x = s.x + r * Math.cos(a * 0.26), z = s.z + r * Math.sin(a * 0.26), yaw = h * Math.PI / 6, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const y0 = m.ground(x, z);
    let ok = true;
    for (let u = 0; u <= 60 && ok; u += 3) for (const v of [-4, 0, 4]) {
      const px = x + fx * u + fz * v, pz = z + fz * u - fx * v;
      if (!clear(px, pz) || Math.abs(m.ground(px, pz) - y0) > 1.2) { ok = false; break; }
    }
    if (ok) return { x, z, yaw };
  }
  return null;
});
if (!run) { console.log("FAIL no straight street to ride on"); process.exit(1); }
console.log(`run at ${run.x.toFixed(1)}, ${run.z.toFixed(1)} yaw ${run.yaw.toFixed(2)}`);

/** Put each on a bike at (u ahead, v left) of the run's start, pointing along it. */
async function place(page, u, v) {
  await page.evaluate(([r, u, v]) => {
    const g = window.__game(), p = g.player, fx = -Math.sin(r.yaw), fz = -Math.cos(r.yaw);
    window.__drive = null; p.keys.clear();
    if (g.riding) g.toggleRide();
    p.spawn(r.x + fx * u + fz * v, r.z + fz * u - fx * v, r.yaw);
    p.pitch = 0;
    g.giveRide("bike");
    g.toggleRide();
    window.__shoves = [];
  }, [run, u, v]);
}

/** Ride on for secs: each holds W (pushing on up to cap m/s) and steers toward a lateral line,
 *  while both pages record their own place and where they draw the other, every frame. */
async function ride(secs, planA, planB) {
  const go = (page, plan, other) => page.evaluate(([r, plan, other]) => {
    const g = window.__game(), fx = -Math.sin(r.yaw), fz = -Math.cos(r.yaw);
    window.__log = [];
    window.__drive = (p) => {
      const lat = (p.pos.x - r.x) * fz - (p.pos.z - r.z) * fx;
      p.keys.clear();
      if (p.rideV < plan.cap) p.keys.add("KeyW"); else if (p.rideV > plan.cap + 1) p.keys.add("KeyS");
      const err = plan.lat - lat, hErr = Math.atan2(Math.sin(p.heading - r.yaw), Math.cos(p.heading - r.yaw));
      const want = Math.max(-0.25, Math.min(0.25, err * 0.3));   // aim across a little toward the line
      if (hErr < want - 0.03) p.keys.add("KeyA"); else if (hErr > want + 0.03) p.keys.add("KeyD");
      const o = g.remotes.get(other)?.avatar;
      window.__log.push({ x: p.pos.x, z: p.pos.z, v: p.rideV, ox: o?.x, oz: o?.z, t: performance.now() });
    };
  }, [run, plan, other]);
  await go(A, planA, ids.B); await go(B, planB, ids.A);
  const t0 = Date.now(), truth = [];
  while (Date.now() - t0 < secs * 1000) {
    const [a, b] = await Promise.all([A.evaluate(() => ({ x: window.__game().player.pos.x, z: window.__game().player.pos.z })), B.evaluate(() => ({ x: window.__game().player.pos.x, z: window.__game().player.pos.z }))]);
    truth.push(Math.hypot(a.x - b.x, a.z - b.z));
    await wait(30);
  }
  const grab = (page) => page.evaluate(() => { window.__drive = null; window.__game().player.keys.clear(); return { log: window.__log, shoves: window.__shoves }; });
  return { a: await grab(A), b: await grab(B), truth };
}
const drawn = (log) => Math.min(...log.filter((l) => l.ox !== undefined).map((l) => Math.hypot(l.x - l.ox, l.z - l.oz)));

// side by side: B holds its line, A steers across into it
await place(A, 0, -2.2); await place(B, 0, 0.6);
let r = await ride(7, { cap: 7, lat: 1.5 }, { cap: 7, lat: 0.6 });
let dA = drawn(r.a.log), dB = drawn(r.b.log);
console.log(`side by side: nearest drawn A ${dA.toFixed(2)} m, B ${dB.toFixed(2)} m, true ${Math.min(...r.truth).toFixed(2)} m; shoves A ${r.a.shoves.length}, B ${r.b.shoves.length}`);
for (const [who, s] of [["A", r.a.shoves], ["B", r.b.shoves]]) for (const q of s.slice(0, 4)) console.log(`  ${who} shoved ${q.ix.toFixed(2)}, ${q.iz.toFixed(2)} at ${q.v.toFixed(1)} m/s`);
check("side by side: A never draws itself inside B", dA >= 0.78, `${dA.toFixed(2)} m (touching is 0.8)`);
check("side by side: B never draws itself inside A", dB >= 0.78, `${dB.toFixed(2)} m`);
check("side by side: both shoved", r.a.shoves.length > 0 && r.b.shoves.length > 0);
const side = (q) => Math.abs(q.ix * Math.cos(run.yaw) - q.iz * Math.sin(run.yaw));
check("side by side: the shoves are sideways, apart", r.a.shoves.length && r.b.shoves.length && side(r.a.shoves[0]) > 0.5 && side(r.b.shoves[0]) > 0.5);

// from behind: B ahead at 4 m/s, A behind at 10 m/s on the same line
await place(A, 0, 0); await place(B, 7, 0);
r = await ride(5, { cap: 10, lat: 0 }, { cap: 4, lat: 0 });
dA = drawn(r.a.log); dB = drawn(r.b.log);
const fwd = (q) => -q.ix * Math.sin(run.yaw) - q.iz * Math.cos(run.yaw);
console.log(`from behind: nearest drawn A ${dA.toFixed(2)} m, B ${dB.toFixed(2)} m; shoves A ${r.a.shoves.map((q) => fwd(q).toFixed(2)).join(" ")}, B ${r.b.shoves.map((q) => fwd(q).toFixed(2)).join(" ")} (m/s along the way)`);
check("from behind: neither draws them overlapping", dA >= 1.6 && dB >= 1.6, `${dA.toFixed(2)} / ${dB.toFixed(2)} m (touching is 1.7)`);
check("from behind: A held up", r.a.shoves.length && fwd(r.a.shoves[0]) < 0);
check("from behind: B pushed on", r.b.shoves.length && fwd(r.b.shoves[0]) > 0);

console.log(`errors: ${errors.length ? errors.join("; ") : "none"}`);
for (const p of [A, B]) console.log("audio guard:", JSON.stringify(await silenceReport(p)));
await browser.close(); server.close();
process.exit(checks.every(Boolean) && !errors.length ? 0 : 1);
