// Riding straight on: does a ride go where you push it? In a muted headless Chrome, puts you on a
// ride on the pavement of several real streets in the middle of Bath, pushes straight forward (W,
// or a made-up pad's stick forward with a little sideways lean, as a thumb does), and logs how far
// round the heading went, how often it left the ground and how often it snapped on to a grind.
//
//   cd web && npx vite build --logLevel error && cd .. && node tools/ride_probe.mjs [ride] [streets]
//
// Prints a line per street and input, then the totals. AT="east,north" looks for streets round
// somewhere else, ONLY=W runs just the inputs whose names start so, TRACE=<lean> prints every tenth of
// a second of the W runs (and the pad's with that lean), and STEER=blades,bike,... measures a 100 ms
// tap of D and a second's hold at speed on each ride. QUERY="ground=sheet" adds that to the address. The zones' wall is taken down for the run.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext, silenceNote } from "./quiet-guard.mjs";
const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = createRequire(WEB + "package.json")("playwright");
const RIDE = process.argv[2] ?? "blades";
const STREETS = +(process.argv[3] ?? 6);
// where to look for streets, data metres east and north (the middle of Bath by default)
const [AX, AY] = (process.env.AT ?? "-960,2100").split(",").map(Number);
const dist = WEB + "dist";
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json" };
const server = http.createServer((q, res) => {
  let f = path.join(dist, decodeURIComponent(q.url.split("?")[0])); if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, b) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream"); res.end(b); });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({ headless: true, channel: "chrome", args: [...MUTED_ARGS, "--use-angle=metal", "--enable-gpu"] });
const context = await browser.newContext({ viewport: { width: 800, height: 500 } });
await silenceContext(context);
await context.addInitScript(() => {
  window.__pad = { buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0] };
  const g = () => ({ id: "Stub pad (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", timestamp: performance.now(), buttons: window.__pad.buttons, axes: window.__pad.axes });
  navigator.getGamepads = () => [g()];
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await context.newPage();
await silence(page);
page.on("pageerror", (e) => console.log("pageerror", e.message));

// the middle of Bath, by the Abbey
await page.goto(`http://127.0.0.1:${port}/?map=combe-down&net=local&room=RIDE${Math.floor(Math.random() * 1e4)}&time=11:00&fx=0&at=${AX},${AY},0,0${process.env.QUERY ? "&" + process.env.QUERY : ""}`);
await page.waitForFunction(() => !document.getElementById("play")?.disabled, null, { timeout: 120000 });
await page.fill("#name", "Rider");
await page.click("#play");
await page.waitForFunction(() => window.__game && window.__game() && window.__game().map, null, { timeout: 180000 });
await page.evaluate(() => {
  const g = window.__game(), u = g.update.bind(g);
  window.__log = null;
  g.update = (dt) => {
    g.active = true; document.getElementById("pause").hidden = true;
    // the whole city open, rather than the zones opened so far
    g.map.zoneFence = null;
    u(dt);
    const p = g.player;
    if (window.__log && p.tumble > 0 && !(window.__log.at(-1)?.tumble > 0)) {
      // what it ran into: a vehicle, or the map itself
      const near = g.map.movers.map((m) => Math.hypot(m.x - p.pos.x, m.z - p.pos.z)).sort((a, b) => a - b)[0] ?? 99;
      const q = { x: p.pos.x + Math.sin(p.heading) * -0.6, z: p.pos.z - Math.cos(p.heading) * 0.6 }, m0 = g.map.movers.splice(0);
      g.map.collide(q, p.pos.y, 0.35); g.map.movers.push(...m0);
      window.__bails = (window.__bails ?? []).concat(`bail at ${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)}: nearest vehicle ${near.toFixed(1)} m, map block ${g.map.lastBlock.toFixed(2)}`);
    }
    if (window.__log) window.__log.push({ dt, x: p.pos.x, z: p.pos.z, h: p.heading, v: p.rideV, ground: p.onGround, grind: !!p.grind, tumble: p.tumble, blk: g.map.lastBlock, y: p.pos.y, vy: p.vel.y, yaw: p.yaw });
  };
});
await page.addStyleTag({ content: "#menu,#debug,#micask,#chronicle,#scoreboard{display:none!important}" });
await page.evaluate(([x, y]) => window.__game().player.spawn(x, -y, 0), [AX, AY]);
await wait(8000);

/** Straight lengths of kerbed street near the middle, each with a spot on its left pavement. */
const spots = await page.evaluate(([n, AX, AY]) => {
  const g = window.__game(), m = g.map;
  const RW = { trunk: 9, primary: 8.5, secondary: 8, tertiary: 7, residential: 6, unclassified: 5.5, living_street: 5 };
  const out = [];
  for (const a of m.areas()) for (const r of a.d.rd ?? []) {
    if (!(r.c in RW) || r.bridge) continue;
    const half = r.w ? r.w / 2 : RW[r.c] / 2, pv = r.pv?.[0] ?? 1.7;
    if (pv < 1.2) continue;
    for (let i = 0; i + 1 < r.p.length; ) {
      // as far on as the street runs straight (within half a metre of the line)
      let j = i + 1;
      while (j + 1 < r.p.length) {
        const [ax, ay] = r.p[i], [bx, by] = r.p[j + 1], l = Math.hypot(bx - ax, by - ay);
        if (r.p.slice(i + 1, j + 1).some(([qx, qy]) => Math.abs(((qx - ax) * (by - ay) - (qy - ay) * (bx - ax)) / l) > 0.5)) break;
        j++;
      }
      const [x0, y0] = r.p[i], [x1, y1] = r.p[j], L = Math.hypot(x1 - x0, y1 - y0);
      i = j;
      if (L < 45 || Math.hypot(x0 - AX, y0 - AY) > 900) continue;
      const ux = (x1 - x0) / L, uy = (y1 - y0) / L, off = half + pv * 0.5;
      // left of the line, in data metres; the scene's z is minus north
      const sx = x0 + ux * 4 - uy * off, sy = y0 + uy * 4 + ux * off;
      out.push({ name: r.n || r.c, x: sx, z: -sy, dx: ux, dz: -uy, L });
    }
  }
  out.sort((a, b) => b.L - a.L);
  const picked = [];
  for (const s of out) if (picked.every((q) => Math.hypot(q.x - s.x, q.z - s.z) > 150)) { picked.push(s); if (picked.length >= n) break; }
  return picked;
}, [STREETS, AX, AY]);

async function run(spot0, input) {
  // aimed a little off the street's line: towards the road (+, to the right) or the walls and gardens (-)
  const a = (input.ang ?? 0) * Math.PI / 180, spot = { ...spot0, dx: spot0.dx * Math.cos(a) + spot0.dz * Math.sin(a), dz: spot0.dz * Math.cos(a) - spot0.dx * Math.sin(a) };
  await page.evaluate(([s, ride]) => {
    const g = window.__game(), p = g.player;
    if (g.riding) g.dismount(false);
    p.keys.clear();
    window.__pad.axes = [0, 0, 0, 0];
    p.spawn(s.x, s.z, Math.atan2(-s.dx, -s.dz));
    g.held = ride;
    g.toggleRide();
  }, [spot, RIDE]);
  await wait(1500);   // the squares round it built
  await page.evaluate(([s]) => {
    const p = window.__game().player;
    p.spawn(s.x, s.z, Math.atan2(-s.dx, -s.dz));
    p.heading = p.yaw; p.rideV = 0; p.tumble = 0; p.grind = null;
  }, [spot]);
  await wait(200);
  await page.evaluate(([inp]) => {
    const p = window.__game().player;
    window.__log = [];
    if (inp.key) p.keys.add("KeyW");
    else window.__pad.axes = [inp.lean, -Math.sqrt(1 - inp.lean * inp.lean), 0, 0];
  }, [input]);
  await wait(Math.min(6000, (spot.L - 6) / 10.5 * 1000 + 2500));
  for (const b of await page.evaluate(() => { const b = window.__bails ?? []; window.__bails = []; return b; })) console.log("    " + b);
  const log = await page.evaluate(() => { const l = window.__log; window.__log = null; const p = window.__game().player; p.keys.clear(); window.__pad.axes = [0, 0, 0, 0]; return l; });
  const h0 = Math.atan2(-spot.dx, -spot.dz), x0 = log[0]?.x ?? spot.x, z0 = log[0]?.z ?? spot.z;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  let tAir = 0, tGround = 0, tSnap = 0, tLand = 0, turn = 0, hops = 0, grinds = 0, bails = 0, airT = 0, dev = 0, along = 0;
  for (let i = 1; i < log.length; i++) {
    const a = log[i - 1], b = log[i];
    const d = Math.abs(wrap(b.h - a.h));
    turn += d;
    if (!a.grind && b.grind) tSnap += d; else if (!a.ground && b.ground) tLand += d; else if (!b.ground || !a.ground) tAir += d; else tGround += d;
    if (a.ground && !b.ground && !b.grind) hops++;
    if (!a.grind && b.grind) grinds++;
    if (a.tumble <= 0 && b.tumble > 0) bails++;
    if (!b.ground) airT += b.dt;
  }
  for (const r of log) {
    const rx = r.x - x0, rz = r.z - z0;
    along = Math.max(along, rx * spot.dx + rz * spot.dz);
    dev = Math.max(dev, Math.abs(-rx * spot.dz + rz * spot.dx));
  }
  if (process.env.TRACE && (input.key || input.lean === +process.env.TRACE)) for (let i = 0; i < log.length; i += 6) { const r = log[i]; console.log(`    t ${log.slice(0, i).reduce((a, q) => a + q.dt, 0).toFixed(2)} x ${r.x.toFixed(1)} z ${r.z.toFixed(1)} y ${r.y.toFixed(2)} vy ${r.vy.toFixed(1)} h ${(r.h * 57.3).toFixed(0)} yaw ${(r.yaw * 57.3).toFixed(0)} v ${r.v.toFixed(2)} g ${+r.ground} gr ${+r.grind} blk ${r.blk.toFixed(2)}`); }
  const last = log[log.length - 1];
  const D = 180 / Math.PI;
  return { snapDeg: tSnap * D, why: `ground ${(tGround * D).toFixed(0)} air ${(tAir * D).toFixed(0)} snap ${(tSnap * D).toFixed(0)} landing ${(tLand * D).toFixed(0)}`, turn: turn * 180 / Math.PI, net: last ? wrap(last.h - h0) * 180 / Math.PI : 0, hops, grinds, bails, airT, dev, along, frames: log.length, vmax: Math.max(...log.map((r) => r.v)) };
}

const ONLY = process.env.ONLY;
const INPUTS = [{ name: "W", key: true }, { name: "W >10", key: true, ang: 10 }, { name: "W >25", key: true, ang: 25 }, { name: "W >40", key: true, ang: 40 }, { name: "W <10", key: true, ang: -10 }, { name: "W <25", key: true, ang: -25 }, { name: "pad 0", lean: 0 }, { name: "pad .05", lean: 0.05 }, { name: "pad .10", lean: 0.1 }, { name: "pad .15", lean: 0.15 }, { name: "pad .25", lean: 0.25 }];
const tot = Object.fromEntries(INPUTS.map((i) => [i.name, { turn: 0, net: 0, hops: 0, grinds: 0, bails: 0, dev: 0, n: 0 }]));
const f = (v, d = 0) => v.toFixed(d).padStart(5);
console.log(`riding ${RIDE} on ${spots.length} streets`);
for (const s of spots) {
  console.log(`-- ${s.name} (${s.L.toFixed(0)} m straight) at ${s.x.toFixed(0)},${(-s.z).toFixed(0)}`);
  for (const inp of INPUTS.filter((i) => !ONLY || i.name.startsWith(ONLY))) {
    const r = await run(s, inp);
    const t = tot[inp.name];
    t.turn += r.turn; t.net += Math.abs(r.net); t.hops += r.hops; t.grinds += r.grinds; t.bails += r.bails; t.dev = Math.max(t.dev, r.dev); t.snap = (t.snap ?? 0) + r.snapDeg; t.n++;
    console.log(`  ${inp.name.padEnd(8)} turned ${f(r.turn)}° (net ${f(r.net)}°)  off line ${f(r.dev, 1)} m  along ${f(r.along)} m  hops ${r.hops}  grinds ${r.grinds}  bails ${r.bails}  air ${r.airT.toFixed(2)} s  top ${r.vmax.toFixed(1)} m/s  (${r.frames} frames)  [${r.why}]`);
  }
}
if (process.env.STEER) {
  // a tap of D, and D held, at speed: how far round the heading goes (to a second after letting go)
  console.log("== steering with D at speed, on " + spots[0].name);
  for (const ride of process.env.STEER.split(",")) for (const ms of [100, 1000]) {
    await page.evaluate(([s, ride]) => {
      const g = window.__game(), p = g.player;
      if (g.riding) g.dismount(false);
      p.keys.clear(); window.__pad.axes = [0, 0, 0, 0];
      p.spawn(s.x, s.z, Math.atan2(-s.dx, -s.dz));
      g.held = ride; g.toggleRide();
      p.heading = p.yaw;
      p.keys.add("KeyW");
    }, [spots[0], ride]);
    await wait(2000);
    const r = await page.evaluate(async (ms) => {
      const p = window.__game().player, h0 = p.heading, v0 = p.rideV;
      let peak = 0;
      const t0 = performance.now();
      p.keys.add("KeyD");
      while (performance.now() - t0 < ms) { await new Promise((r) => requestAnimationFrame(r)); }
      p.keys.delete("KeyD");
      const held = Math.abs(Math.atan2(Math.sin(p.heading - h0), Math.cos(p.heading - h0)));
      while (performance.now() - t0 < ms + 1000) { await new Promise((r) => requestAnimationFrame(r)); peak = Math.max(peak, Math.abs(p.steer)); }
      p.keys.clear();
      return { v0, held: held * 57.3, after: Math.abs(Math.atan2(Math.sin(p.heading - h0), Math.cos(p.heading - h0))) * 57.3 };
    }, ms);
    console.log(`  ${ride.padEnd(8)} D for ${String(ms).padStart(4)} ms at ${r.v0.toFixed(1)} m/s: ${r.held.toFixed(1)}° while held, ${r.after.toFixed(1)}° in all`);
  }
}
console.log("== totals");
for (const [n, t] of Object.entries(tot)) if (t.n) console.log(`  ${n.padEnd(8)} mean turned ${f(t.turn / t.n)}°  mean |net| ${f(t.net / t.n)}°  worst off line ${f(t.dev, 1)} m  hops ${t.hops}  grinds ${t.grinds}  bails ${t.bails}  snapped round ${f(t.snap ?? 0)}°`);
console.log(await silenceNote(page));
await browser.close();
server.close();
