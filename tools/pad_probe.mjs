// A check on the controller's prompts and its buttons in Settings, with a made-up pad (a stubbed
// navigator.getGamepads) in a muted headless Chrome. Standing by a parked car, the prompt names E
// after a key and □ after the pad; moving "Use" onto △ in the Buttons list swaps Reload onto □,
// the prompt says △, △ gets you in, and it's all still so after a reload. Circle calls a change off.
//
//   cd web && npx vite build --logLevel error && cd .. && node tools/pad_probe.mjs <out folder>
//
// Writes two shots to the folder; exits 1 if a check fails.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silenceContext } from "./quiet-guard.mjs";
const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = createRequire(WEB + "package.json")("playwright");
const OUT = process.argv[2] ?? "padprobe";
fs.mkdirSync(OUT, { recursive: true });
const dist = WEB + "dist";
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json" };
const server = http.createServer((q, res) => {
  let f = path.join(dist, decodeURIComponent(q.url.split("?")[0])); if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, b) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream"); res.end(b); });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({ headless: true, channel: "chrome", args: [...MUTED_ARGS, "--use-angle=metal", "--enable-gpu"] });
const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
await silenceContext(context);
await context.addInitScript(() => {
  window.__pad = { buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0] };
  const g = () => ({ id: "Stub pad (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", timestamp: performance.now(), buttons: window.__pad.buttons, axes: window.__pad.axes });
  navigator.getGamepads = () => [g()];
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (n, ok, d = "") => { checks.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}: ${d}`); };
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
async function enter() {
  await page.goto(`http://127.0.0.1:${port}/?map=combe-down&net=local&room=PADT${Math.floor(Math.random()*1e4)}&time=11:00&fx=0`);
  await page.waitForFunction(() => !document.getElementById("play")?.disabled, null, { timeout: 120000 });
  await page.fill("#name", "Pad");
  await page.click("#play");
  await page.waitForFunction(() => window.__game && window.__game() && window.__game().map, null, { timeout: 180000 });
  await page.evaluate(() => {
    const g = window.__game(), u = g.update.bind(g);
    g.update = (dt) => { g.active = true; document.getElementById("pause").hidden = true; u(dt); };
    const p = g.player.pos;
    const v = g.vehicles.list.filter((o) => o.kind !== "bus" && !o.driver).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    const at = v.exitSpot(0); g.player.spawn(at.x, at.z, 0);
  });
  await page.addStyleTag({ content: "#menu,#debug,#micask,#chronicle,#scoreboard{display:none!important}" });
  await wait(1500);
}
const hint = () => page.evaluate(() => document.getElementById("usehint").textContent);
const padTap = async (b) => { await page.evaluate((b) => { window.__pad.buttons[b].pressed = true; window.__pad.buttons[b].value = 1; }, b); await wait(200); await page.evaluate((b) => { window.__pad.buttons[b].pressed = false; window.__pad.buttons[b].value = 0; }, b); await wait(300); };
const nudge = async () => { await page.evaluate(() => { window.__pad.axes[2] = 0.5; }); await wait(150); await page.evaluate(() => { window.__pad.axes[2] = 0; }); await wait(300); };
try {
  await page.evaluate(() => localStorage.removeItem("cd-padbuttons")).catch(() => {});
  await enter();
  await page.evaluate(() => localStorage.removeItem("cd-padbuttons"));
  await page.keyboard.press("KeyK"); await wait(300);
  check("keys: prompt names E", /^E Get in/.test(await hint()), await hint());
  await nudge();
  check("pad: prompt names □", /^□ Get in/.test(await hint()), await hint());
  await page.screenshot({ path: `${OUT}/pad.png` });
  await page.mouse.move(300, 300); await page.mouse.move(320, 310); await wait(300);
  check("mouse moved: back to E", /^E Get in/.test(await hint()), await hint());
  // remap use onto triangle
  await page.evaluate(() => document.querySelector('.padbind[data-act="use"]').click());
  const listen = await page.evaluate(() => document.querySelector('.padbind[data-act="use"] kbd').textContent);
  check("row says press a button", listen === "Press a button…", listen);
  await padTap(3);
  const rows = await page.evaluate(() => ["use", "reload"].map((id) => document.querySelector(`.padbind[data-act="${id}"] kbd`).textContent));
  check("use on △, reload swapped to □", rows[0] === "△" && rows[1] === "□", rows.join(","));
  check("prompt names △", /^△ Get in/.test(await hint()), await hint());
  const ctl = await page.evaluate(() => [...document.querySelectorAll(".keys dt .padkey")].map((s) => s.textContent).join(" | "));
  console.log("controls list pad keys:", ctl);
  await padTap(3);
  await wait(1500);
  check("△ gets you in", await page.evaluate(() => !!window.__game().ride), "");
  check("driving hint names pad", true, await page.evaluate(() => document.getElementById("drivehint").textContent));
  await page.screenshot({ path: `${OUT}/driving.png` });
  await enter();
  await nudge();
  check("after reload: prompt names △", /^△ Get in/.test(await hint()), await hint());
  // remap cancelled by circle
  await page.evaluate(() => document.querySelector('.padbind[data-act="jump"]').click());
  await padTap(1);
  check("circle cancels", await page.evaluate(() => document.querySelector('.padbind[data-act="jump"] kbd').textContent) === "✕", "");
  // horn onto the button Use is on (△ now): Use must move off it, and getting out must still work
  await page.evaluate(() => document.querySelector('.padbind[data-act="horn"]').click());
  await padTap(3);
  const hu = await page.evaluate(() => ["use", "horn"].map((id) => document.querySelector(`.padbind[data-act="${id}"] kbd`).textContent));
  check("horn on △ moves Use off it", hu[1] === "△" && hu[0] !== "△", hu.join(","));
  await page.evaluate(() => { const g = window.__game(); const v = g.vehicles.list.filter((o) => o.kind !== "bus" && !o.driver)[0]; const at = v.exitSpot(0); g.player.spawn(at.x, at.z, 0); });
  await page.keyboard.press("KeyK"); await wait(300);
  await nudge();
  const useBtn = await page.evaluate(() => JSON.parse(localStorage.getItem("cd-padbuttons")).use);
  await padTap(useBtn); await wait(1500);
  check("Use gets you in", await page.evaluate(() => !!window.__game().ride), "");
  await padTap(useBtn); await wait(1500);
  check("Use gets you out", await page.evaluate(() => !window.__game().ride), "");
} finally {
  await browser.close(); server.close();
}
process.exit(checks.every(Boolean) ? 0 : 1);
