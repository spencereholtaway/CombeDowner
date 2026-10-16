// A quick headless check of travelling between maps (main.ts's travel, game.ts's travelTo):
// start a solo game on Combe Down, travel to Bradford-on-Avon as the train would, and see that
// the game is now on the new map with the same connection, and that the prompt we boarded by
// went with it. The new Game fills the same page's boxes (web/src/show.ts), so a box that still
// holds a line about the map we left is the bug this guards: a note of what was last shown, kept
// by the game rather than read back from the element, starts empty and skips the new game's first
// write. Run from web/ with the committed build. Exits 1 if a check fails.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = process.env.PW ? require(process.env.PW) : require("playwright");
import http from "http";
import fs from "fs";
import path from "path";

const DIST = path.join(new URL("../web/", import.meta.url).pathname, "dist");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const f = path.join(DIST, p);
  fs.readFile(f, (e, b) => {
    if (e) { res.writeHead(404); res.end("no"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] ?? "application/octet-stream" });
    res.end(b);
  });
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ channel: "chrome", args: ["--mute-audio", "--no-first-run"] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e.message)));
// (audio stays quiet anyway: Chrome is launched with --mute-audio)
await page.goto(`http://127.0.0.1:${port}/?map=combe-down&net=local`);
page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 200)); });
page.on("requestfailed", (r) => errs.push("reqfail: " + r.url().slice(-40)));
// wait for the menu, then start a solo game
await page.waitForSelector("#solo", { state: "visible", timeout: 30000 }).catch(async () => {
  const html = await page.evaluate(() => ({ loading: document.getElementById("loading")?.textContent, menuHidden: document.getElementById("menu")?.hidden, body: document.body.innerHTML.length }));
  console.log("menu did not appear:", JSON.stringify(html), "errors:", errs.slice(0, 5));
  throw new Error("no menu");
});
await page.click("#solo");
await page.waitForFunction(() => !!(window.__game && window.__game()), null, { timeout: 30000 });
const before = await page.evaluate(() => window.__map().d.id);

/** What the middle of the screen is showing: the prompt the player reads, and whether it's up. */
const prompt = () => page.evaluate(() => {
  const el = document.getElementById("usehint");
  return el && !el.hidden ? (el.textContent ?? "").trim() : "";
});

// board a real train: stand on Bath Spa's platform and wait for a Bradford train to be dwelling
// there with its doors open, then board it, exactly as E does in the game
const boarded = await page.evaluate(async () => {
  const g = window.__game();
  window.__before = g;
  const rail = g.world.railway;
  const pl = rail.platform("Bath Spa");
  // stand on the platform first, and let the game run a few frames so trains near here are made
  g.player.spawn(pl.centre[0], -pl.centre[1], 0);
  // wait for a Bradford train to come in and stop at Bath Spa (the headway is minutes, so up to a
  // few of them; the run is short in the game's own clock)
  let dwell = null;
  for (let i = 0; i < 4600 && !dwell; i++) {
    dwell = rail.trainsNow().find((t) => t.stop === "Bath Spa"
      && (rail.d.links ?? []).some((l) => l.line === t.route) && t.open > 0.9);
    if (!dwell) await new Promise((r) => setTimeout(r, 100));
  }
  if (dwell) {
    // stand beside its carriage (a door is there), as a passenger on the platform would
    g.player.spawn(dwell.x - 2, dwell.z, 0);
    const b = rail.boardingAt(g.player.pos.x, g.player.pos.z, g.player.pos.y);
    return b ? { route: b.route.name, stop: b.train.stop, open: Math.round(b.train.open * 100) / 100, found: "dwelling" }
             : { found: "dwelling but not within reach of the platform middle", at: dwell };
  }
  return { found: "no Bath Spa dwelling train", trains: trains.slice(0, 8) };
});
// the prompt we're about to board by: it must not outlive the map it belongs to, so remember it
// now, while we're stood at the train, rather than after the game has started the journey.
// Standing beside a dwelling train is what puts it up, so let a few frames of play draw it first.
let promptBefore = "";
for (let i = 0; i < 50 && !promptBefore; i++) {
  promptBefore = await prompt();
  if (!promptBefore) await new Promise((r) => setTimeout(r, 100));
}
const ok = await page.evaluate(() => {
  const g = window.__game();
  // Two things would otherwise let this check pass on code that still has the bug, so both are
  // settled before we board — the fault only shows itself if the last map's prompt survives the
  // swap intact for the new game to have to clear:
  //  - the Bath game keeps ticking through the journey and can clear its own prompt first, when the
  //    train we boarded shuts its doors or pulls out. Freeze its updates as the journey starts, so
  //    the prompt it left up is still there for the new game.
  const travel = g.onTravel;
  if (travel) g.onTravel = (toMap, carry) => { travel(toMap, carry); g.update = () => {}; };
  //  - the platform we arrive at can have a train of its own stood at it, and "Board the Bath Spa
  //    train" is a prompt the new map draws for real: it would take the stale one's place and hide
  //    the fault. Let only Bath answer about boarding, so nothing is drawn at the far end.
  const rail = g.world.railway;
  if (rail) {
    const proto = Object.getPrototypeOf(rail), boarding = proto.boardingAt;
    proto.boardingAt = function (x, z, y) { return window.__map().d.id === "combe-down" ? boarding.call(this, x, z, y) : null; };
  }
  g.useKey = true;   // as pressing E does: the game's update boards the train we're standing by
  return true;
});
const t1=Date.now();
await page.waitForFunction(() => window.__travelStage === 'built' || window.__travelError, null, { timeout: 15000 }).catch(()=>{});
const travelMs=Date.now()-t1;
const after = await page.evaluate(() => window.__map().d.id);
const travelError = await page.evaluate(() => window.__travelError ?? null);
const onPlat = await page.evaluate(() => {
  const g = window.__game();
  const rail = g.world.railway;
  const pl = rail?.platform("Bradford-on-Avon");
  const p = g.player.pos;
  // a linked train should be dwelling at the platform we've stepped off onto, doors open, just
  // behind us (railway.ts's linkPhase puts its dwell on the same grid as the one at Bath Spa)
  const here = rail ? rail.trainsNow().filter((t) => t.stop === "Bradford-on-Avon" && t.open > 0.9 && Math.hypot(t.x - p.x, t.z - p.z) < 60) : [];
  return { hasRail: !!rail, plats: rail ? [...(rail.platforms?.keys?.() ?? [])] : null,
           pl: pl ? pl.centre : null, pos: [Math.round(p.x), Math.round(p.z)],
           railwayIsBoa: rail ? rail.d.platforms.every((q) => q.n === "Bradford-on-Avon") : null,
           sameGameObject: g === window.__before,
           railLink: rail ? (rail.d.links ?? []).map((l) => l.to) : null,
           trainHere: here.length ? { stop: here[0].stop, open: here[0].open, dist: Math.round(Math.hypot(here[0].x - p.x, here[0].z - p.z)) } : null,
           stage: window.__travelStage ?? "never" };
});

// The prompt must go now we're stood where the new map has nothing to prompt about, or it's the one
// we boarded by at Bath, still up because this game shares the page's one set of HUD elements.
let promptAfter = promptBefore;
for (let i = 0; i < 60 && promptAfter; i++) {
  promptAfter = await prompt();
  if (promptAfter) await new Promise((r) => setTimeout(r, 100));
}
const stalePrompt = promptAfter !== "";
const noTrain = !onPlat.trainHere;
console.log(JSON.stringify({ before, boarded, travelAccepted: ok, after, travelError, travelMs, arrival: onPlat, promptBefore, promptAfter, errors: errs.slice(0, 3) }));
console.log(`${stalePrompt ? "FAIL" : "PASS"} the prompt went with the map (was "${promptBefore}", now "${promptAfter}")`);
console.log(`${noTrain ? "FAIL" : "PASS"} a train is at the platform we stepped off onto (${onPlat.trainHere ? `${onPlat.trainHere.stop}, doors open, ${onPlat.trainHere.dist} m behind` : "none dwelling"})`);
await browser.close();
server.close();
process.exit(stalePrompt || noTrain ? 1 : 0);
