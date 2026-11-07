// A check on The Climb's teamwork (web/src/theclimb.ts) in the real game: a built game (web/dist)
// in a muted headless Chrome, two tabs in one local room (?net=local), the challenge taken straight
// off a poster. It checks what one climber can't do alone when there's a team, and that a mate
// makes it go:
// - a dropped rope holds only while a mate on its ledge holds it: one drops and holds it, the other
//   takes it; let go and the one on it slides down to the ledge below with no life lost; a slack
//   rope can't be taken; held again, up it they go;
// - a blank stretch's first hold is out of reach alone and in reach off a crouching mate's shoulders;
// - the traverse's gap: a lunge across it alone comes off; one stretches across as a bridge, the
//   other climbs over them, then the bridge follows across, and not before a mate is over.
// With --solo 1, one tab: the route has no blank stretch and no gap, and a dropped rope holds alone.
//
//   cd web && npm run build && cd .. && node tools/quiet.mjs -- node tools/climb_gates_probe.mjs --out out/gates
//
// Writes <out>/report.txt and a few shots; exits 1 if a check fails.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = createRequire(WEB + "package.json")("playwright");
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "out/gates", map: "combe-down", zone: "4", room: "GATES" + Math.floor(Math.random() * 1e4) };
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
const browser = await chromium.launch({
  headless: true, channel: "chrome",
  args: [...MUTED_ARGS, "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
    ...(process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
const context = await browser.newContext({ viewport: { width: 1000, height: 640 } });
await silenceContext(context);
await context.addInitScript(() => { try { localStorage.setItem("cd-mic", "off"); } catch { /* */ } });
const complaints = [], checks = [], report = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`); };
const tick = () => new Promise((r) => setTimeout(r, 50));

async function join(name) {
  const page = await context.newPage();
  await silence(page);
  page.on("pageerror", (e) => complaints.push(`${name} error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") complaints.push(`${name} console: ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${port}/?map=${opt.map}&net=local&room=${opt.room}&progression=0&fx=0&zone=${opt.zone}&time=11:00`);
  await page.fill("#name", name);
  // the button is live before it's hooked up: press it till there's a game
  const t0 = Date.now();
  while (!(await page.evaluate(() => !!window.__game?.()))) {
    if (Date.now() - t0 > 240000) throw new Error(`${name} never got into the game`);
    await page.evaluate(() => { const b = document.getElementById("play"); if (b && !b.disabled && b.offsetParent && !window.__clicked) { b.click(); window.__clicked = performance.now(); } else if (window.__clicked && performance.now() - window.__clicked > 5000 && b?.offsetParent && !b.disabled) window.__clicked = 0; });
    await page.waitForTimeout(250);
  }
  await page.waitForFunction(() => window.__game().map, null, { timeout: 180000 });
  await page.addStyleTag({ content: "#menu,#pause,#debug,#touch,#micask,#scoreboard{display:none!important}" });
  await page.evaluate(() => {
    const g = window.__game(), u = g.update.bind(g);
    g.update = (dt) => {
      g.active = true;
      if (window.__auto) window.__auto(g.player, dt);
      u(dt);
      const c = window.__cam;
      if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); g.camera.updateMatrixWorld(); }
    };
    window.__key = (code, down) => dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code }));
    window.__pr = () => g.quests.job?.probe;
    window.__me = () => {
      const p = g.player, pr = window.__pr();
      if (!pr) return null;
      const [s, out] = pr.local(p.pos.x, p.pos.z), pt = pr.pt();
      return { s, out, y: p.pos.y, g: p.onGround, mode: pr.mode(), grip: pr.grip(), cap: pr.cap(), L: pr.L(), lives: pr.lives(), ropes: pr.ropes(), held: pr.held(), anchor: pr.anchor(), pt: pt ? pt.i : null, hint: g.quests.jobHint() };
    };
    window.__stand = (s, out, y) => {
      const p = g.player, pr = window.__pr(), [x, z] = pr.P(s, out);
      window.__auto = null; p.keys.clear();
      p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.onGround = true;
      p.pos.y = g.map.floor(x, z, y + 0.3);
      p.yaw = Math.atan2(pr.face.nx, pr.face.nz); p.pitch = 0.3;
    };
    window.__look = (s, out, y, ts, tout, ty) => { const pr = window.__pr(), [a, b] = pr.P(s, out), [c, d] = pr.P(ts, tout); window.__cam = [a, y, b, c, ty, d]; };
  });
  return page;
}

const key = (page, code, down) => page.evaluate(([c, d]) => window.__key(c, d), [code, down]);
const me = (page) => page.evaluate(() => window.__me());
const use = (page) => page.evaluate(() => { window.__game().useKey = true; });
async function until(page, secs, f) {
  const t0 = Date.now();
  let s = await me(page);
  while (Date.now() - t0 < secs * 1000 && !f(s)) { await tick(); s = await me(page); }
  return s;
}
/** Holds a key down until f is true of the page (or secs pass). */
async function holding(page, code, secs, f) { await key(page, code, true); const s = await until(page, secs, f); await key(page, code, false); return s; }
const shot = async (page, name, cam) => {
  if (cam) await page.evaluate((c) => window.__look(...c), cam);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${opt.out}/${name}.png` });
  await page.evaluate(() => { window.__cam = null; });
};

const solo = !!opt.solo;
const A = await join("Ada");
const B = solo ? null : await join("Bo");
const tabs = [A, B].filter(Boolean);
try {
  if (B) for (const P of tabs) await P.waitForFunction(() => window.__game().remotes.size >= 1, null, { timeout: 60000 });
  await A.evaluate(() => window.__game().quests.take({ kind: "climb", seed: 4242, stars: 3, title: "The Climb", blurb: "", reward: "", x: 0, z: 0, where: "" }));
  // the others enter while the entries are open
  for (const P of tabs.slice(1)) {
    await P.waitForFunction(() => window.__game().quests.entering(), null, { timeout: 30000 });
    await P.evaluate(() => window.__game().quests.enter());
  }
  for (const P of tabs) await P.waitForFunction(() => !!window.__pr?.(), null, { timeout: 90000 });
  const want = tabs.length;
  for (const P of tabs) await P.waitForFunction((n) => window.__pr().route().n === n, want, { timeout: 30000 }).catch(() => {});
  const route = await A.evaluate(() => { const r = window.__pr().route(); return { n: r.n, ledges: r.ledges, holds: r.holds, gap: r.gap ?? null }; });
  const y0 = route.ledges[0].y;
  check(`the route is set for ${want}`, route.n === want, `n ${route.n}`);
  // the crag's own squares aren't needed, but the street under it is loaded as the tabs settle: wait for that, not a time
  for (const P of tabs) await P.waitForFunction(() => (window.__tilesPending ?? 0) === 0, null, { timeout: 120000 }).catch(() => {});
  for (const P of tabs) await P.evaluate(() => window.__pr().spare());
  const boosts = route.holds.filter((h) => h.boost);
  report.push(`route: ${route.holds.length} holds, ${boosts.length} blank stretches (${boosts.map((h) => (h.y - y0).toFixed(1)).join(", ")} m up), gap ${JSON.stringify(route.gap)}`);

  if (solo) {
    check("alone there's no blank stretch and no gap", !boosts.length && !route.gap);
    const L1 = route.ledges[1];
    await A.evaluate(([s, y]) => window.__stand(s, 1.0, y), [L1.rope, L1.y]);
    let a = await until(A, 3, (m) => /Drop a rope for the others/.test(m.hint));
    check("alone on a ledge you can drop its rope", /Drop a rope for the others/.test(a.hint), `hint "${a.hint}"`);
    await use(A);
    a = await until(A, 3, (m) => m.ropes.includes(1));
    check("alone the rope holds without anyone holding it", a.mode === 0 && a.held.includes(1), `mode ${a.mode}, held ${a.held}`);
    await A.evaluate(([s, y]) => window.__stand(s, 1.5, y), [L1.rope, y0]);
    a = await holding(A, "KeyW", 15, (m) => m.mode === 0 && m.L >= 1 && Math.abs(m.y - L1.y) < 0.4);
    check("alone, up the rope to its ledge", a.L >= 1 && Math.abs(a.y - L1.y) < 0.4, `y ${(a.y - y0).toFixed(1)}, L ${a.L}`);
    throw new Error("done");
  }

  check("with two there's a blank stretch and a gap on the traverse", boosts.length >= 1 && !!route.gap, `${boosts.length} blank, gap ${JSON.stringify(route.gap)}`);

  // ---- an anchored rope ----
  const L1 = route.ledges[1];
  await A.evaluate(([s, y]) => window.__stand(s, 1.0, y), [L1.rope, L1.y]);
  let a = await until(A, 3, (m) => /hold it for the others/.test(m.hint));
  check("on a ledge with a team: drop a rope and hold it", /Drop a rope and hold it/.test(a.hint), `hint "${a.hint}"`);
  await use(A);
  a = await until(A, 3, (m) => m.mode === 7);
  check("dropping it you take the strain, and stay put", a.mode === 7 && a.anchor === 1, `mode ${a.mode}, anchor ${a.anchor}`);
  await B.evaluate(([s, y]) => window.__stand(s, 1.5, y), [L1.rope, y0]);
  let b = await holding(B, "KeyW", 4, (m) => m.mode === 2);
  check("a held rope can be taken", b.mode === 2, `B mode ${b.mode}`);
  await key(B, "KeyW", true);
  b = await until(B, 6, (m) => m.y > y0 + 2.5);
  await key(B, "KeyW", false);
  a = await until(A, 2, (m) => /holding Bo/.test(m.hint));
  check("the one holding it sees who's on it", /holding Bo/.test(a.hint), `hint "${a.hint}"`);
  const strain = await A.evaluate(() => document.querySelector('#maux>[data-k="strain"]')?.textContent ?? "");
  check("a strain meter is up while holding", /Rope/.test(strain), `"${strain}"`);
  const g0 = a.grip;
  a = await until(A, 3, (m) => m.grip < g0 - 0.1);
  check("holding a mate drains your grip", a.grip < g0 - 0.1, `${g0.toFixed(2)} to ${a.grip.toFixed(2)}`);
  await shot(A, "01-holding-the-rope", [L1.rope - 5, 9, L1.y + 3, L1.rope, 0, L1.y - 2]);
  const lives0 = b.lives;
  await use(A);
  a = await until(A, 2, (m) => m.mode === 0);
  check("E again lets go", a.mode === 0 && a.anchor === -1, `mode ${a.mode}`);
  b = await until(B, 4, (m) => m.mode === 0 && m.g && m.y < y0 + 0.5);
  check("let go, the rope goes slack and the one on it slides down to the ledge below", b.mode === 0 && b.y < y0 + 0.5, `B mode ${b.mode}, ${(b.y - y0).toFixed(2)} m up`);
  b = await until(B, 1.5, (m) => m.lives !== lives0);
  check("sliding down costs no life", b.lives === lives0, `${lives0} then ${b.lives}`);
  await B.evaluate(([s, y]) => window.__stand(s, 1.5, y), [L1.rope, y0]);
  b = await holding(B, "KeyW", 1.5, (m) => m.mode === 2);
  check("a slack rope can't be taken", b.mode !== 2, `B mode ${b.mode}, ropes ${b.ropes}, held ${b.held}`);
  await shot(B, "02-slack-rope", [L1.rope + 4, 8, y0 + 3, L1.rope, 1, y0 + 3]);
  a = await until(A, 2, (m) => /Hold the rope/.test(m.hint));
  check("up top it can be held again", /Hold the rope/.test(a.hint), `hint "${a.hint}"`);
  await use(A);
  await until(B, 2, (m) => m.held.includes(1));
  b = await holding(B, "KeyW", 15, (m) => m.mode === 0 && m.L >= 1 && Math.abs(m.y - L1.y) < 0.4);
  check("held again, up the rope and onto its ledge", b.L >= 1 && Math.abs(b.y - L1.y) < 0.4, `B ${(b.y - y0).toFixed(1)} m up, L ${b.L}`);
  await use(A);
  await until(A, 2, (m) => m.mode === 0);

  // ---- a blank stretch ----
  const bh = boosts[0], k = route.ledges.findIndex((l, i) => i < route.ledges.length - 1 && l.y < bh.y && route.ledges[i + 1].y > bh.y), Lk = route.ledges[k];
  await A.evaluate(([s, y]) => window.__stand(s, 0.7, y), [bh.s, Lk.y]);
  await B.evaluate(([s, y]) => window.__stand(s, 3, y), [bh.s + 2.5, Lk.y]);
  await key(A, "KeyW", true); await A.evaluate(() => window.__game().player.jump());
  a = await until(A, 1.5, (m) => m.mode === 1);
  await key(A, "KeyW", false);
  check(`the blank stretch over ledge ${k} is out of reach alone`, a.mode !== 1, `mode ${a.mode}`);
  await until(A, 3, (m) => m.g && m.mode === 0);
  await B.evaluate(([s, y]) => window.__stand(s, 0.7, y), [bh.s, Lk.y]);
  await key(B, "KeyC", true);
  await B.waitForFunction(() => window.__game().player.crouch > 0.6);
  // B's crouch and place have to reach A first
  const [sx, sz] = await A.evaluate(([s]) => window.__pr().P(s, 0.7), [bh.s]);
  await A.waitForFunction(([x, z, y]) => window.__game().map.floor(x, z, y + 1.3) > y + 0.9, [sx, sz, Lk.y], { timeout: 5000 }).catch(() => {});
  await A.evaluate(([s, y]) => window.__stand(s, 0.7, y + 1.0), [bh.s, Lk.y]);
  a = await until(A, 3, (m) => m.g && m.y > Lk.y + 0.8);
  check("standing on a crouched mate's shoulders", a.g && Math.abs(a.y - (Lk.y + 1.0)) < 0.25, `${(a.y - Lk.y).toFixed(2)} m over the ledge`);
  await shot(A, "03-boost", [bh.s - 4, 6, Lk.y + 2.5, bh.s, 0.5, Lk.y + 2]);
  await key(A, "KeyW", true); await A.evaluate(() => window.__game().player.jump());
  a = await until(A, 1.5, (m) => m.mode === 1);
  await key(A, "KeyW", false);
  check("off a mate's shoulders it's in reach", a.mode === 1, `mode ${a.mode}`);
  await key(B, "KeyC", false);
  await key(A, "KeyC", true); await until(A, 1, (m) => m.mode !== 1); await key(A, "KeyC", false);

  // ---- the human chain ----
  const [ia, ib] = route.gap, ha = route.holds[ia], hb = route.holds[ib];
  report.push(`gap from (${ha.s.toFixed(2)}, ${(ha.y - y0).toFixed(2)}) to (${hb.s.toFixed(2)}, ${(hb.y - y0).toFixed(2)}): ${Math.hypot(hb.s - ha.s, hb.y - ha.y).toFixed(2)} m`);
  await B.evaluate((i) => window.__pr().hang(i), ia);
  b = await until(B, 2, (m) => m.mode === 1 && m.pt === ia);
  b = await holding(B, "KeyD", 1.2, (m) => m.pt !== ia);
  check("alone at the gap, reaching across finds nothing", b.mode === 1 && b.pt === ia, `B mode ${b.mode} on ${b.pt}`);
  await key(B, "KeyD", true); await key(B, "Space", true);
  b = await until(B, 1.5, (m) => m.mode !== 1 || m.pt !== ia);
  await key(B, "Space", false); await key(B, "KeyD", false);
  check("a lunge across the gap alone comes off", b.mode === 0, `B mode ${b.mode}, on ${b.pt}`);
  // caught again before landing, so the fall doesn't knock them out and muddle what follows
  await B.evaluate(([s, y]) => window.__stand(s, 3, y), [0, y0]);
  await A.evaluate((i) => window.__pr().hang(i), ia);
  a = await until(A, 2, (m) => m.mode === 1 && /Stretch across the gap/.test(m.hint));
  check("on the hold before the gap you can stretch across it", /Stretch across the gap/.test(a.hint), `hint "${a.hint}"`);
  await use(A);
  a = await until(A, 2, (m) => m.mode === 8);
  check("stretched across as a bridge", a.mode === 8, `mode ${a.mode}`);
  a = await holding(A, "KeyD", 1, (m) => m.mode !== 8);
  check("the bridge can't follow across before a mate's over", a.mode === 8, `mode ${a.mode}`);
  const ga = a.grip, ta = Date.now();
  await B.evaluate((i) => window.__pr().hang(i), ia);
  await until(B, 2, (m) => m.mode === 1 && m.pt === ia);
  b = await holding(B, "KeyD", 3, (m) => m.pt === -2);
  check("the next one reaches onto the bridge", b.pt === -2, `B on ${b.pt}`);
  await shot(A, "04-human-chain", [(ha.s + hb.s) / 2, 8, ha.y - 1, (ha.s + hb.s) / 2, 0, ha.y - 1]);
  b = await holding(B, "KeyD", 3, (m) => m.pt === ib);
  check("and over the bridge to the far side", b.pt === ib, `B on ${b.pt}`);
  a = await me(A);
  const rate = (ga - a.grip) / ((Date.now() - ta) / 1000);
  check("bridging drains grip fast, twice hanging's", rate > 0.05, `${rate.toFixed(3)} a second`);
  a = await holding(A, "KeyD", 3, (m) => m.mode === 1 && m.pt === ib);
  check("with a mate across, the bridge follows over", a.mode === 1 && a.pt === ib, `A mode ${a.mode} on ${a.pt}, a mate across ${await A.evaluate(() => window.__pr().across())}`);
} catch (e) {
  if (e.message !== "done") check("probe ran", false, e.stack);
  for (const P of tabs) report.push(`state: ${JSON.stringify(await P.evaluate(() => { const q = window.__game().quests; return { lining: q.lining, job: !!q.job, cast: q.lu?.cast ?? null, entries: q.lu?.entries ?? null, close: q.lu ? q.lu.close - Date.now() : null, go: q.lu ? q.lu.goAt - Date.now() : null, remotes: window.__game().remotes.size, host: window.__game().isHost }; }).catch((x) => String(x)))}`);
}
fs.writeFileSync(`${opt.out}/report.txt`, [...checks.map((c) => `${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? ": " + c.detail : ""}`), ...report, "", ...new Set(complaints)].join("\n"));
for (const r of report) console.log(r);
for (const c of new Set(complaints)) console.log("complaint:", c);
console.log(await silenceNote(A));
await browser.close();
server.close();
process.exit(checks.every((c) => c.ok) ? 0 : 1);
