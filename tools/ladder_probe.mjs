// A check on ladders (web/src/ladders.ts) in the real game: a built game (web/dist) served to a muted
// headless Chrome that can't make a sound or take the mouse (as tools/shoot.mjs does). In one tab,
// in a local test room, at a building in the village and one in town (a full-detail square):
// - hands the player a ladder, faces them at the wall and presses X: one should stand there;
// - holds W: up the ladder and off onto the roof, where they should stand;
// - presses E on the roof over its top: taken down from the top too;
// - turns round and holds W: off the edge over the top of it and down to the foot;
// - presses E at the foot: taken down, and carried again;
// - drops a ladder pickup at their feet to walk over.
// Then a second tab joins the room and should see the first player's ladder on their shoulder,
// and then the ladder they put up. Shots of each step.
//
//   cd web && npx vite build --logLevel error && cd .. && node tools/ladder_probe.mjs --out ladder
//
// Writes <out>/report.txt, <out>/probe.json and <out>/*.png; exits 1 if a check fails.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();

const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "ladder", room: "LADDERTEST" + Math.floor(Math.random() * 1000) };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
fs.mkdirSync(opt.out, { recursive: true });

// where to look for a building: the village's middle, and Milsom Street in town (longitude, latitude)
const SPOTS = [{ name: "village", here: true }, { name: "town", at: [-2.3606, 51.3846] }];

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
const linux = process.platform === "linux";
const bundled = linux && fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null;
const exe = process.env.CHROME || bundled;
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : { channel: "chrome" }),
  // both tabs keep running at full speed, though only one is in front
  args: ["--mute-audio", "--disable-audio-output", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
    ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
await context.addInitScript(() => {
  class Silent extends OfflineAudioContext {
    constructor() { super(2, 44100, 44100); }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  window.AudioContext = window.webkitAudioContext = Silent;
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
  try { localStorage.setItem("cd-mic", "off"); } catch { /* */ }
});
const complaints = [], checks = [], log = { started: new Date().toISOString(), spots: [] };
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A tab in the test room, playing, with the player's movement live (no pointer lock headless). */
async function join(name) {
  const page = await context.newPage();
  page.on("pageerror", (e) => complaints.push(`${name} error: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/?map=combe-down&net=local&room=${opt.room}&time=11:00&fx=0`);
  await page.evaluate(() => { window.__budget = 40; });
  await page.waitForFunction(() => !document.getElementById("play")?.disabled, null, { timeout: 120000 });
  await page.fill("#name", name);
  await page.click("#play");
  await page.waitForFunction(() => window.__game && window.__game() && window.__game().map, null, { timeout: 180000 }).catch(async (e) => {
    // say what the menu was showing when it gave up
    const menu = await page.evaluate(() => ["menuerr", "lookupmsg"].map((id) => `${id}: ${document.getElementById(id)?.textContent?.trim() ?? "-"}`).join(" | "));
    throw new Error(`${name} never got into the game (${menu}): ${e.message}`);
  });
  await page.addStyleTag({ content: "#menu,#pause,#debug,#touch,#micask{display:none!important}" });
  await page.evaluate(() => {
    const g = window.__game(), u = g.update.bind(g);
    g.update = (dt) => {
      g.active = true;
      const p = window.__park;
      if (p) { g.player.pos.set(p[0], p[1], p[2]); g.player.vel.set(0, 0, 0); }
      u(dt);
      const c = window.__cam;
      if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); g.camera.updateMatrixWorld(); }
      if (g.weapon) g.weapon.scene.visible = !c;
    };
    window.__key = (code, down) => dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code }));
  });
  return page;
}

/** Wait till the squares round the player are loaded and built. */
async function settle(page) {
  const t0 = Date.now();
  await wait(1500);
  while (Date.now() - t0 < 90000) {
    if (await page.evaluate(() => (window.__tilesPending ?? 0) === 0)) break;
    await wait(500);
  }
  await wait(1500);
}

const A = await join("Ladder");
try {
  for (const S of SPOTS) {
    const rec = { name: S.name };
    log.spots.push(rec);
    // park there, then find a building with a wall to put a ladder against
    await A.evaluate((S) => {
      const g = window.__game(), m = g.map, p = g.player.pos;
      let x = p.x, z = p.z;
      if (S.at) {
        const [lon0, lat0] = m.d.centre, kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;
        x = (S.at[0] - lon0) * kx; z = -(S.at[1] - lat0) * ky;
      }
      window.__park = [x, m.ground(x, z) + 200, z];
      window.__cam = null;
    }, S);
    await settle(A);
    const spot = await A.evaluate(() => {
      const g = window.__game(), m = g.map, [x0, , z0] = window.__park;
      const maps = [m, ...m.tilesNear(x0, z0, 150)];
      const found = [];
      for (const mm of maps) for (const b of mm.d.bl) {
        if (b.h < 6 || b.h > 13) continue;
        const r = b.r[0];
        for (let i = 0; i + 1 < r.length; i++) {
          const [a, c] = [r[i], r[i + 1]], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
          if (L < 6) continue;
          const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2, tx = (c[0] - a[0]) / L, ty = (c[1] - a[1]) / L;
          if (Math.hypot(mx - x0, -my - z0) > 150) continue;
          for (const s of [1, -1]) {
            const x = mx - ty * s * 1.0, z = -(my + tx * s * 1.0), gr = m.ground(x, z), fl = m.floor(x, z, gr + 0.5);
            if (fl > gr + 0.3) continue;
            const yaw = Math.atan2(-(mx - x), -(-my - z)), at = g.ladders.aim(x, fl, z, yaw);
            if (typeof at !== "string") found.push({ x, y: fl, z, yaw, at, h: b.h, tile: mm !== m, d: Math.hypot(mx - x0, -my - z0) });
          }
        }
      }
      found.sort((a, b) => a.d - b.d);
      return { n: found.length, spot: found[0] ?? null };
    });
    rec.found = spot.n;
    check(`${S.name}: a wall to put a ladder against`, spot.spot, spot.spot ? `${spot.n} found; using one ${spot.spot.at.y1 - spot.spot.at.y0 | 0} m up${spot.spot.tile ? ", in a full-detail square" : ""}` : "none");
    if (!spot.spot) continue;
    const sp = rec.spot = spot.spot;
    // stand there facing the wall, with a ladder
    await A.evaluate((sp) => {
      const g = window.__game(), p = g.player;
      window.__park = null;
      p.pos.set(sp.x, sp.y, sp.z); p.vel.set(0, 0, 0); p.yaw = sp.yaw; p.pitch = 0.1; p.onGround = true;
      g.ladders.give(g.net.selfId);
    }, sp);
    await wait(600);
    await A.screenshot({ path: `${opt.out}/${S.name}-1-facing.png` });
    await A.evaluate(() => window.__key("KeyX", true));
    await wait(100);
    await A.evaluate(() => window.__key("KeyX", false));
    await wait(1600);
    const up = await A.evaluate(() => {
      const g = window.__game(), L = [...g.ladders.up.values()][0];
      return { n: g.ladders.up.size, carrying: g.ladders.carriers.has(g.net.selfId), L: L && { x: L.x, z: L.z, nx: L.nx, nz: L.nz, y0: L.y0, y1: L.y1, out: L.out, scale: L.ladder.scale.y } };
    });
    rec.up = up;
    check(`${S.name}: X puts it up`, up.n === 1 && !up.carrying, JSON.stringify(up.L));
    if (!up.L) continue;
    const L = up.L;
    // a look at it from the side
    await A.evaluate((L) => {
      const sx = -L.nz, sz = L.nx, h = L.y1 - L.y0;
      window.__cam = [L.x - L.nx * (L.out + 3.5) + sx * 2.5, L.y0 + 1.7, L.z - L.nz * (L.out + 3.5) + sz * 2.5, L.x, L.y0 + h * 0.55, L.z];
    }, L);
    await wait(700);
    await A.screenshot({ path: `${opt.out}/${S.name}-2-ladder-up.png` });
    await A.evaluate(() => { window.__cam = null; });
    // climb: hold W
    const t0 = Date.now();
    await A.evaluate(() => window.__key("KeyW", true));
    let top = null, mid = false;
    while (Date.now() - t0 < 20000) {
      const s = await A.evaluate(() => { const p = window.__game().player; return { on: !!p.ladder, y: p.pos.y, g: p.onGround }; });
      if (s.on) mid = true;
      if (mid && !s.on) { top = s; break; }
      if (s.on && s.y > L.y0 + (L.y1 - L.y0) / 2 && !rec.midShot) { rec.midShot = true; await A.screenshot({ path: `${opt.out}/${S.name}-3-climbing.png` }); }
      await wait(100);
    }
    await A.evaluate(() => window.__key("KeyW", false));
    await wait(1000);
    const roof = await A.evaluate(() => { const g = window.__game(), p = g.player; return { y: p.pos.y, g: p.onGround, under: g.map.floor(p.pos.x, p.pos.z, p.pos.y), hint: document.getElementById("usehint")?.textContent }; });
    rec.climb = { got: mid, secs: (Date.now() - t0) / 1000, roof };
    check(`${S.name}: W climbs it and steps off onto the roof`, mid && top && roof.g && Math.abs(roof.y - L.y1) < 0.8, `standing at ${roof.y.toFixed(2)} on ${roof.under.toFixed(2)}, roof ${L.y1.toFixed(2)}`);
    await A.evaluate(() => { const p = window.__game().player; p.pitch = -0.35; });
    await wait(300);
    await A.screenshot({ path: `${opt.out}/${S.name}-4-on-the-roof.png` });
    // take it down from the top: E on the roof over the ladder's top
    await A.evaluate((L) => {
      const p = window.__game().player;
      p.pos.set(L.x + L.nx * 0.6, L.y1, L.z + L.nz * 0.6); p.onGround = true;
    }, L);
    await wait(300);
    const topHint = await A.evaluate(() => document.getElementById("usehint")?.textContent ?? "");
    await A.evaluate(() => window.__key("KeyE", true));
    await wait(100);
    await A.evaluate(() => window.__key("KeyE", false));
    await wait(800);
    const fromTop = await A.evaluate(() => { const g = window.__game(); return { n: g.ladders.up.size, carrying: g.ladders.carriers.has(g.net.selfId) }; });
    check(`${S.name}: E on the roof over its top takes it down`, fromTop.n === 0 && fromTop.carrying, `hint "${topHint}"`);
    // stand the same ladder back up exactly, so the rest of the run has it (the host's own say)
    await A.evaluate((L) => {
      const g = window.__game(), me = g.net.selfId;
      g.ladders.give(me);
      g.ladders.put(me, { x: L.x, z: L.z, nx: L.nx, nz: L.nz, y0: L.y0, y1: L.y1, out: L.out });
      const p = g.player;
      p.pos.set(L.x + L.nx * 0.6, p.pos.y, L.z + L.nz * 0.6);
    }, L);
    await wait(800);
    // and down: turn round, back to the edge over the ladder, and walk off it
    await A.evaluate((L) => {
      const p = window.__game().player;
      p.pos.set(L.x + L.nx * 0.6, p.pos.y, L.z + L.nz * 0.6);
      p.yaw = Math.atan2(L.nx, L.nz); p.pitch = -0.3;
      window.__key("KeyW", true);
    }, L);
    const t1 = Date.now();
    let down = null, on = false;
    while (Date.now() - t1 < 20000) {
      const s = await A.evaluate(() => { const p = window.__game().player; return { on: !!p.ladder, y: p.pos.y, g: p.onGround, off: p.offLadder }; });
      if (s.on) on = true;
      if (on && !s.on) { down = s; break; }
      await wait(100);
    }
    await A.evaluate(() => window.__key("KeyW", false));
    await wait(500);
    const foot = await A.evaluate(() => { const p = window.__game().player; return { y: p.pos.y, g: p.onGround }; });
    rec.down = { on, foot };
    check(`${S.name}: walking off the edge over it takes you down`, on && foot.g && Math.abs(foot.y - L.y0) < 0.8, `at ${foot.y.toFixed(2)}, foot ${L.y0.toFixed(2)}`);
    // take it down: E at its foot
    await A.evaluate((L) => {
      const p = window.__game().player, d = L.out + 0.6;
      p.pos.set(L.x - L.nx * d, L.y0, L.z - L.nz * d); p.yaw = Math.atan2(-L.nx, -L.nz); p.onGround = true;
    }, L);
    await wait(300);
    const hint = await A.evaluate(() => document.getElementById("usehint")?.textContent ?? "");
    await A.evaluate(() => window.__key("KeyE", true));
    await wait(100);
    await A.evaluate(() => window.__key("KeyE", false));
    await wait(800);
    const taken = await A.evaluate(() => { const g = window.__game(); return { n: g.ladders.up.size, carrying: g.ladders.carriers.has(g.net.selfId) }; });
    check(`${S.name}: E at its foot takes it down`, taken.n === 0 && taken.carrying, `hint "${hint}"`);
  }

  // a ladder lying about: walk over it to have it
  const pick = await A.evaluate(async () => {
    const g = window.__game(), p = g.player.pos, me = g.net.selfId;
    g.ladders.carriers.delete(me);
    g.pickups.place(p.x + 3, p.z, "ladder", 60);
    return { ladders: [...g.pickups.items.values()].filter((it) => it.kind === "ladder").length };
  });
  await A.evaluate(() => { const p = window.__game().player; p.yaw = -Math.PI / 2; p.pitch = -0.3; });
  await wait(600);
  await A.screenshot({ path: `${opt.out}/pickup-1-lying.png` });
  await A.evaluate(() => { const g = window.__game(), p = g.player.pos; p.x += 3; });
  await wait(1500);
  const got = await A.evaluate(() => { const g = window.__game(); return g.ladders.carriers.has(g.net.selfId); });
  check("walking over a ladder picks it up", got, `${pick.ladders} ladder pickups about`);

  // a second player: sees the ladder on our shoulder, then the one we put up
  const B = await join("Watcher");
  await A.bringToFront();
  await wait(6000);
  const ids = await A.evaluate(() => window.__game().net.selfId);
  await B.evaluate(() => { window.__park = null; });
  const sees = await B.evaluate((a) => { const g = window.__game(), r = g.remotes.get(a); return { known: !!r, carriers: [...g.ladders.carriers], shoulder: !!r?.avatar?.ladder, host: g.hostId }; }, ids);
  check("another player sees you carrying it", sees.known && sees.carriers.includes(ids) && sees.shoulder, JSON.stringify(sees));
  const sp = log.spots.find((s) => s.spot)?.spot;
  if (sp) {
    await A.evaluate((sp) => { const g = window.__game(), p = g.player; p.pos.set(sp.x, sp.y, sp.z); p.yaw = sp.yaw; p.onGround = true; }, sp);
    await B.evaluate((sp) => { const g = window.__game(), p = g.player; p.pos.set(sp.x - 6 * Math.sin(sp.yaw + 2.6), sp.y, sp.z - 6 * Math.cos(sp.yaw + 2.6)); p.yaw = sp.yaw + 2.6 + Math.PI; p.pitch = 0.4; }, sp);
    await wait(2500);
    await A.evaluate(() => window.__key("KeyX", true));
    await wait(100);
    await A.evaluate(() => window.__key("KeyX", false));
    await wait(2500);
    const bs = await B.evaluate(() => window.__game().ladders.up.size);
    const as = await A.evaluate(() => window.__game().ladders.up.size);
    await B.screenshot({ path: `${opt.out}/second-player-sees.png` });
    check("the other player sees the ladder go up", as === 1 && bs === 1, `put up: ${as}, seen: ${bs}`);
  }
  await B.close();
} catch (e) {
  complaints.push(`probe: ${e.stack ?? e}`);
} finally {
  log.checks = checks; log.complaints = complaints;
  fs.writeFileSync(`${opt.out}/probe.json`, JSON.stringify(log, null, 1));
  const lines = [...checks.map((c) => `${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? ": " + c.detail : ""}`), "", complaints.length ? complaints.join("\n") : "no page errors"];
  fs.writeFileSync(`${opt.out}/report.txt`, lines.join("\n") + "\n");
  console.log(complaints.length ? complaints.join("\n") : "no page errors");
  await browser.close();
  server.close();
}
process.exit(checks.length && checks.every((c) => c.ok) && !complaints.length ? 0 : 1);
