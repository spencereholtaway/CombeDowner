// Dying with a ladder should leave exactly one ladder lying there. Carry one, get run over (or shot),
// and count the ladder pickups each second. Modes: traffic and shot (solo), remote (killed while
// another tab is host), stale (solo, with a quiet tab in solo practice too that still answers
// ladder lists as if it were host: the case that once filled Milsom Street with ladders).
//   cd web && npm run build && cd .. && node tools/quiet.mjs -- node tools/ladder_dupe_probe.mjs --mode stale
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = createRequire(WEB + "package.json")("playwright");
const argv = process.argv.slice(2), opt = { mode: "traffic", secs: "12" };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm" };
const server = http.createServer((q, res) => {
  let f = path.join(WEB + "dist", decodeURIComponent(q.url.split("?")[0]));
  if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, b) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream"); res.end(b); });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({ headless: true, channel: "chrome",
  args: [...MUTED_ARGS, "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--use-angle=metal", "--enable-gpu"] });
const context = await browser.newContext({ viewport: { width: 800, height: 500 } });
await silenceContext(context);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];

async function open(url, name) {
  const page = await context.newPage();
  await silence(page);
  page.on("pageerror", (e) => errs.push(`${name}: ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__game && window.__game() && window.__game().map, null, { timeout: 180000 });
  await page.evaluate(() => { const g = window.__game(), u = g.update.bind(g); g.update = (dt) => { g.active = true; u(dt); }; });
  return page;
}
async function joinRoom(room, name) {
  const page = await context.newPage();
  await silence(page);
  page.on("pageerror", (e) => errs.push(`${name}: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/?map=combe-down&net=local&room=${room}&fx=0&at=-1166,2470,0,0`);
  await page.waitForFunction(() => !document.getElementById("play")?.disabled, null, { timeout: 180000 });
  await page.fill("#name", name);
  for (let i = 0; i < 200; i++) {
    if (await page.evaluate(() => !!(window.__game && window.__game() && window.__game().map))) break;
    await page.click("#play").catch(() => {});
    await wait(500);
  }
  await page.evaluate(() => { const g = window.__game(), u = g.update.bind(g); g.update = (dt) => { g.active = true; u(dt); }; });
  return page;
}

const state = () => {
  const g = window.__game(), me = g.net.selfId;
  return { host: g.isHost, alive: g.alive, entryAlive: g.entry(me).alive, life: g.life, carrying: g.ladders.carriers.has(me),
    carriers: [...g.ladders.carriers], ladders: [...g.pickups.items.values()].filter((i) => i.kind === "ladder").length };
};

let victim, host;
if (opt.mode === "remote") {
  const room = "DUPE" + Math.floor(Math.random() * 1e5);
  host = await joinRoom(room, "Host");
  await wait(2000);
  victim = await joinRoom(room, "Victim");
  await wait(4000);
} else if (opt.mode === "stale") {
  // a tab already in solo practice that's gone quiet (backgrounded): it hears and answers ladder lists, but its frame loop is stopped and it says nothing else
  const stale = await open(`http://127.0.0.1:${port}/?solo=1&at=-1166,2470,0,0&fx=0`, "stale");
  await stale.evaluate(() => { const g = window.__game(), send = g.net.send.bind(g.net); g.update = () => {}; g.net.send = (t, ...a) => { if (t === "lds") send(t, ...a); }; });
  victim = await open(`http://127.0.0.1:${port}/?solo=1&at=-1166,2470,0,0&fx=0`, "solo");
  host = victim;
  globalThis.staleTab = stale;
} else {
  victim = await open(`http://127.0.0.1:${port}/?solo=1&at=-1166,2470,0,0&fx=0`, "solo");
  host = victim;
}
for (const pg of new Set([host, victim])) {
  if (pg === globalThis.staleTab) continue;
  for (let i = 0; i < 120; i++) {
    const why = await pg.evaluate(() => { const g = window.__game(); return { arr: g.arrival.up, quest: g.quests.waiting(), passive: g.passive, smoke: g.smokeT, god: g.dev.god }; });
    if (!why.arr && !why.quest) break;
    if (i % 10 === 0) console.log("waiting", JSON.stringify(why));
    await wait(1000);
  }
}
await wait(1000);
console.log("host:", await host.evaluate(() => window.__game().isHost), "victim host:", await victim.evaluate(() => window.__game().isHost));
// give the victim a ladder, the host's way
const vid = await victim.evaluate(() => window.__game().net.selfId);
await host.evaluate((vid) => { const g = window.__game(); g.ladders.give(vid); g.sendLadders(); }, vid);
await wait(1500);
console.log("before:", JSON.stringify(await victim.evaluate(state)));
await host.evaluate(([vid, mode]) => {
  const g = window.__game(), life = g.entry(vid).life;
  if (mode === "shot") g.hurt(vid, 999, g.net.selfId === vid ? "naughtyBoy" : g.net.selfId, false, life, 1);
  else g.hurt(vid, 999, "traffic", false, life, 3);
}, [vid, opt.mode === "shot" ? "shot" : "traffic"]);
for (let t = 0; t < +opt.secs; t++) {
  await wait(1000);
  const v = await victim.evaluate(state), h = host === victim ? null : await host.evaluate(state);
  if (globalThis.staleTab) console.log("stale tab carriers", JSON.stringify(await globalThis.staleTab.evaluate(() => [...window.__game().ladders.carriers])), "victim knows", JSON.stringify(await victim.evaluate(() => [...window.__game().known])));
  console.log(`t=${t + 1}s victim ${JSON.stringify(v)}${h ? " host " + JSON.stringify(h) : ""}`);
}
if (errs.length) console.log("errors:", errs.slice(0, 5));
await browser.close();
server.close();
