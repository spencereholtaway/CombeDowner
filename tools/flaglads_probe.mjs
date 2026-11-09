// A pub takeover run through in two tabs of a local room (or solo): each kind of lad shot and what
// every screen calls him, the Gaffer off on his scooter and cuffed, the megaphone's lads, the win,
// and what the boss bar and the call-out say along the way. Shots of the key moments go to --out.
//   node tools/quiet.mjs -- node tools/flaglads_probe.mjs [--solo 1] [--out shots/flaglads]
// Needs a build (cd web && npm run build).
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = createRequire(WEB + "package.json")("playwright");
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", solo: "0", out: "shots/flaglads", room: "FLAG" + Math.floor(Math.random() * 1e4) };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
fs.mkdirSync(opt.out, { recursive: true });

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
const browser = await chromium.launch({ headless: true, channel: "chrome",
  args: [...MUTED_ARGS, "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--use-angle=metal", "--enable-gpu"] });
const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
await context.addInitScript(() => { try { localStorage.setItem("cd-mic", "off"); } catch { /* */ } });
await silenceContext(context);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) fails++; };

async function join(name, solo) {
  const page = await context.newPage();
  await silence(page);
  page.on("pageerror", (e) => errs.push(`${name}: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/?map=combe-down&net=local&fx=0&progression=1&time=11:00${solo ? "" : `&room=${opt.room}`}`);
  await page.waitForFunction(() => !document.getElementById("play")?.disabled, null, { timeout: 180000 });
  await page.fill("#name", name);
  for (let k = 0; k < 120; k++) {
    if (await page.evaluate(() => !!(window.__game && window.__game() && window.__game().map))) break;
    await page.click(solo ? "#solo" : "#play").catch(() => {});
    await wait(1000);
  }
  await page.evaluate(() => {
    const g = window.__game(), u = g.update.bind(g);
    window.__said = [];
    const n = g.news.bind(g);
    g.news = (t) => { window.__said.push(t); n(t); };
    // parked: stood at (x, z), looking at (lx, lz) if given
    // passive, so the lads don't put the tester down mid-run (alone, there's nobody else for them to go for)
    g.passive = true;
    g.update = (dt) => {
      g.active = true;
      const p = window.__park;
      if (p) {
        g.player.pos.set(p[0], g.map.ground(p[0], p[1]), p[1]); g.player.vel.set(0, 0, 0);
        if (p.length > 2) { g.player.yaw = Math.atan2(-(p[2] - p[0]), -(p[3] - p[1])); g.player.pitch = -0.1; }
      }
      u(dt);
    };
  });
  return page;
}

const solo = opt.solo === "1";
const A = await join("alpha", solo);
await wait(1500);
const pages = solo ? [A] : [A, await join("bravo", false)];
for (let k = 0; k < 60; k++) {
  const hs = await Promise.all(pages.map((p) => p.evaluate(() => window.__game().isHost)));
  if (hs.filter(Boolean).length === 1 && (solo || (await Promise.all(pages.map((p) => p.evaluate(() => window.__game().remotes.size)))).every((n) => n === 1))) break;
  await wait(500);
}
const hostIx = (await Promise.all(pages.map((p) => p.evaluate(() => window.__game().isHost)))).indexOf(true);
const H = pages[hostIx], O = pages[solo ? 0 : 1 - hostIx];
const oid = await O.evaluate(() => window.__game().net.selfId);
console.log("host is page", hostIx, solo ? "(solo)" : "");
const shot = async (P, name) => { const f = path.join(opt.out, `${name}.png`); await P.screenshot({ path: f }); console.log("shot", f); };
const said = (P) => P.evaluate(() => window.__said.splice(0));
const hud = (P) => P.evaluate(() => ({ boss: !document.getElementById("boss").hidden, bossName: document.querySelector("#boss .bossname")?.textContent ?? "",
  call: document.getElementById("bunting").innerText.replace(/\s+/g, " ") }));

// the nearest pub, with a Gaffer who has a right-hand man and a megaphone (so he takes the scooter)
const pub = await H.evaluate(() => {
  const g = window.__game(), inv = g.invasion;
  const p = inv.w.pubs().map((q) => ({ ...q, d: Math.hypot(q.x - g.player.pos.x, q.z - g.player.pos.z) })).sort((a, b) => a.d - b.d).find((q) => inv.canTake(q.name));
  inv.chair.traits = ["deputy", "megaphone"];
  inv.takeNow(p.name);
  return { name: p.name, x: p.x, z: p.z };
});
console.log("takeover at", pub.name);
const front = await H.evaluate((n) => window.__game().invasion.pubFront(n), pub.name);
const park = (P, k, look = true) => P.evaluate(([x, z, lx, lz]) => { window.__park = lx === undefined ? [x, z] : [x, z, lx, lz]; },
  [front.x + front.ux * 14 + k * 2, front.z + front.uz * 14, ...(look ? [front.x, front.z] : [])]);
for (const [k, P] of pages.entries()) await park(P, k);
await H.waitForFunction(() => window.__game().invasion.calls[0]?.on, null, { timeout: 60000 }).catch(async (e) => { console.log("errors:", errs.join(" | ")); throw e; });
await wait(2500);
await shot(O, "1-crew-at-the-front");

// the megaphone brings more lads: shout now, and see where they end up
await H.evaluate(() => { window.__game().invasion.calls[0].megaT = 0; });
await wait(12000);
const strays = await H.evaluate((f) => {
  const g = window.__game(), c = g.invasion.calls[0];
  return c.crew.map((l) => g.naughtyBoys.get(l.i, l.gen)).filter(Boolean).map((b) => Math.round(Math.hypot(b.x - f.x, b.z - f.z)));
}, front);
console.log("crew's distances from the pub front after the megaphone:", strays.join(" "));

// a shot that kills, from the other tab (or yours, solo)
const kill = (pick) => H.evaluate(([pick, by]) => {
  const g = window.__game(), c = g.invasion.calls[0], ch = g.naughtyBoys;
  const who = pick === "lad" ? c.crew[0] : pick === "ladder" ? c.lads[0] : pick === "deputy" ? c.deputy : pick === "gaffer" ? (g.invasion.chase ?? c.chair) : null;
  if (!who || !ch.get(who.i, who.gen)) return false;
  for (let k = 0; k < 400 && ch.get(who.i, who.gen); k++) g.applyNaughtyBoyHit(by, { c: who.i, g: who.gen, head: false, w: 1 });
  return true;
}, [pick, oid]);
await O.evaluate(() => window.__said.splice(0));
for (const [pick, want] of [["lad", "a Flag Lad"], ["ladder", "a ladder lad"], ["deputy", "the Gaffer's right-hand man"]]) {
  const done = await kill(pick);
  await wait(800);
  const s = (await said(O)).filter((t) => t.startsWith("You "));
  check(done && s.some((t) => t.endsWith(want)), `shooting the ${pick}: "${s.join(" | ")}" names ${want}`);
}
await shot(O, "2-right-hand-man-down");

// the Gaffer worn down to half: he's off on his scooter
await H.evaluate(() => { const g = window.__game(), c = g.invasion.calls[0], b = g.naughtyBoys.get(c.chair.i, c.chair.gen); g.naughtyBoys.damage(c.chair.i, c.chair.gen, b.hp * 0.55); });
await H.waitForFunction(() => !!window.__game().invasion.chase, null, { timeout: 10000 }).catch(() => {});
const how = await H.evaluate(() => window.__game().invasion.chase?.how);
check(how === 1, `the Gaffer runs on his scooter (how ${how})`);
await wait(3000);
// worn down till he gives up, and the other tab goes and stands by him
await H.evaluate(() => { const g = window.__game(), ch = g.invasion.chase, b = g.naughtyBoys.get(ch.i, ch.gen); g.naughtyBoys.damage(ch.i, ch.gen, b.hp - b.top * 0.15); });
await H.waitForFunction(() => window.__game().invasion.runner?.up, null, { timeout: 10000 }).catch(() => {});
await O.waitForFunction(() => window.__game().invasion.runner?.up, null, { timeout: 10000 }).catch(() => {});
const gat = await H.evaluate(() => { const g = window.__game(), ch = g.invasion.chase, b = g.naughtyBoys.get(ch.i, ch.gen); return [b.x, b.z]; });
await O.evaluate(([x, z]) => { window.__park = [x + 1.5, z, x, z]; }, gat);
await wait(1500);
const before = await hud(O);
check(before.boss && /Gaffer/.test(before.bossName), `his bar is up with his hands up, on the tab that cuffs him ("${before.bossName}")`);
await shot(O, "3-hands-up-on-the-scooter");
console.log("ready to cuff:", await O.evaluate(() => { const g = window.__game(), inv = g.invasion, r = inv.runner, at = r && g.naughtyBoys.at(r.i), me = inv.w.me();
  return JSON.stringify({ up: r?.up, gen: [r?.gen, at?.gen], alive: at?.alive, d: at ? Math.hypot(at.x - me.x, at.z - me.z).toFixed(1) : null, meAlive: me.alive }); }));
const used = await O.evaluate(() => window.__game().invasion.use());
check(used, "E cuffs him");
await H.waitForFunction(() => !window.__game().invasion.chase, null, { timeout: 5000 }).catch(() => {});
await wait(1500);
for (const P of pages) {
  const h = await hud(P);
  check(!h.boss, `after the cuffs, no boss bar on ${P === H ? "the host" : "the other tab"} (${h.boss ? h.bossName : "hidden"})`);
}
await shot(O, "4-cuffed-no-bar");
// shoot him now he's cuffed: named right, and still no bar
await O.evaluate(() => window.__said.splice(0));
await H.evaluate(([by, x, z]) => {
  const g = window.__game();
  for (const c of g.naughtyBoys.living()) {
    const at = g.naughtyBoys.at(c.i);
    if (at.kind === 5 && Math.hypot(at.x - x, at.z - z) < 6) for (let k = 0; k < 400 && at.alive && g.naughtyBoys.get(c.i, at.gen); k++) g.applyNaughtyBoyHit(by, { c: c.i, g: at.gen, head: false, w: 1 });
  }
}, [oid, ...gat]);
await wait(800);
const s2 = (await said(O)).filter((t) => t.startsWith("You "));
check(s2.every((t) => t.endsWith("the Gaffer")), `shooting the cuffed Gaffer: "${s2.join(" | ")}"`);

// three of the crew lost after a chase: one at the pub's door, two 120 m off behind it, where
// they'll likely be the far side of a wall
const sent = await H.evaluate(([f, p]) => {
  const g = window.__game(), c = g.invasion.calls[0], ch = g.naughtyBoys, out = [];
  for (const [k, l] of c.crew.slice(0, 3).entries()) {
    const b = ch.list[l.i], d = k ? -120 : 0;
    b.x = p.x + f.ux * d + f.uz * k * 15; b.z = p.z + f.uz * d - f.ux * k * 15; b.y = g.map.ground(b.x, b.z); b.target = ""; b.homeX = b.x; b.homeZ = b.z;
    out.push(Math.round(Math.hypot(b.x - f.x, b.z - f.z)));
  }
  return out;
}, [front, pub]);
console.log("sent three of the crew off to", sent.join(", "), "m from the front");

// back to the pub: what's left, where, and what each screen says
for (const [k, P] of pages.entries()) await park(P, k);
await wait(4000);
const left = await H.evaluate((f) => {
  const g = window.__game(), c = g.invasion.calls[0];
  if (!c) return null;
  return { left: c.left, crew: c.crew.map((l) => g.naughtyBoys.get(l.i, l.gen)).filter(Boolean).map((b) => Math.round(Math.hypot(b.x - f.x, b.z - f.z))) };
}, front);
console.log("left at the pub:", JSON.stringify(left));
for (const P of pages) console.log(P === H ? "host call-out:" : "other call-out:", (await hud(P)).call);
await shot(O, "5-back-at-the-pub");
// everyone you can see at the front shot down, a lad at a time: the win comes with nobody left
for (let k = 0; k < 30; k++) {
  const more = await H.evaluate(([by, f]) => {
    const g = window.__game(), c = g.invasion.calls[0];
    if (!c) return false;
    const ch = g.naughtyBoys, l = c.crew.find((o) => { const b = ch.get(o.i, o.gen); return b && Math.hypot(b.x - f.x, b.z - f.z) < 25; });
    if (l) for (let j = 0; j < 400 && ch.get(l.i, l.gen); j++) g.applyNaughtyBoyHit(by, { c: l.i, g: l.gen, head: false, w: 1 });
    return true;
  }, [oid, front]);
  if (!more) break;
  if (k % 5 === 0) console.log(`  ${k * 1.5}s: crew at`, (await H.evaluate((f) => { const g = window.__game(), c = g.invasion.calls[0]; return c ? c.crew.map((l) => g.naughtyBoys.get(l.i, l.gen)).filter(Boolean).map((b) => Math.round(Math.hypot(b.x - f.x, b.z - f.z))).join(" ") : "won"; }, front)), "·", (await hud(O)).call.replace(/^.*?(Clear out[^·]*).*$/, "$1"));
  await wait(1500);
}
const won = await H.waitForFunction(() => !window.__game().invasion.calls.length, null, { timeout: 15000 }).then(() => true).catch(() => false);
check(won, "the pub is won once the lads at the front are down, the lost ones called back or legging it");
await wait(2500);
for (const P of pages) {
  const h = await hud(P);
  check(!h.boss && !/lads? left/.test(h.call), `${P === H ? "host" : "other tab"} after the win: no bar, no lads left ("${h.call.slice(0, 90)}")`);
}
await shot(O, "6-won");
if (errs.length) console.log("errors:", errs.slice(0, 5).join(" | "));
console.log(fails ? `${fails} failed` : "all ok");
await browser.close();
server.close();
process.exit(fails ? 1 : 0);
