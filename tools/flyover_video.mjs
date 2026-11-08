// A video of a zone opening's fly-over (web/src/reveal.ts), frame by frame, with its drum roll.
// It serves a built game (web/dist), starts a solo game in a muted headless Chrome with ?frames=1,
// which holds the game still and lets this move it on a sixtieth of a second at a time
// (window.__frames in main.ts), and shoots every frame, so no frame is dropped however slow the
// machine. The page's CSS animations are stepped along with it. The loading under the cover is real
// work done in real time between frames, so the video runs through it faster than a player would
// see it. The drum roll and cymbal are rendered silently with the game's own synth, at the levels
// the loading went through frame by frame, and laid on with ffmpeg, so nothing is ever played out
// loud. Run it inside tools/quiet.mjs.
//
//   node tools/quiet.mjs -- node tools/flyover_video.mjs --out videos/bath-far.mp4
//   node tools/quiet.mjs -- node tools/flyover_video.mjs --map cape-town --size 844x390 --out videos/phone.mp4
//
// Options: --dist web/dist, --map combe-down, --size 1280x720, --zone far|near|<number>|map (the
// farthest zone from the start, the nearest after your own, that zone, or the last zone's whole-map
// shot), --view 900, --keep (leave the frames and sound next to the video). Needs ffmpeg on the PATH.
import { createRequire } from "module";
import { execFileSync } from "child_process";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();

const argv = process.argv.slice(2), opt = { dist: WEB + "dist", map: "combe-down", size: "1280x720", zone: "far", view: "900", out: "videos/flyover.mp4" };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--keep") opt.keep = true;
  else if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
}
const [W, H] = opt.size.split("x").map(Number);
const work = opt.out.replace(/\.mp4$/, "") + "-frames";
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

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

const browser = await chromium.launch({ channel: "chrome", headless: true, args: [...MUTED_ARGS] });
const context = await browser.newContext({ viewport: { width: W, height: H } });
await silenceContext(context);
const page = await context.newPage();
await silence(page);
page.on("pageerror", (e) => console.warn("page:", e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/?frames=1&view=${opt.view}&map=${opt.map}&time=11:00`);

// the Solo button is live before it's hooked up: press it till there's a game
for (let k = 0; k < 600; k++) {
  const ok = await page.evaluate(() => { if (window.__game?.()) return true; const b = document.getElementById("solo"); if (b && !b.disabled) b.click(); return false; });
  if (ok) break;
  await page.waitForTimeout(200);
}
// settled in where it starts, in real time
await page.waitForFunction(() => {
  const g = window.__game(); window.__settle ??= window.__calm(20, 1000);
  return !g.arrival.up && window.__settle.still(window.__tilesPending ?? 0);
}, null, { polling: "raf", timeout: 300000 });
await page.addStyleTag({ content: "#hud > :not(#reveal), #touch, .toast { visibility: hidden !important; }" });

const zone = await page.evaluate((want) => {
  const g = window.__game(), p = g.player.pos, zs = g.zones.list;
  if (want === "map") return zs.length;
  if (/^\d+$/.test(want)) return Number(want);
  const by = zs.map((z) => [z.i, Math.hypot(z.x - p.x, z.z - p.z)]).sort((a, b) => a[1] - b[1]);
  return want === "near" ? (by[1] ?? by[0])[0] : by[by.length - 1][0];
}, opt.zone);

await page.evaluate(() => window.__frames.hold(true));
const step = () => page.evaluate(() => {
  // the page's own animations (the drum's sticks, the dots, the card) a sixtieth of a second on, as the game is
  for (const a of document.getAnimations()) {
    a.__t = (a.__t ?? Number(a.currentTime ?? 0)) + 1000 / 60;
    if (a.playState !== "paused") a.pause();
    a.currentTime = a.__t;
  }
  window.__frames.step();
  const g = window.__game(), r = g.reveal;
  let p = null;
  if (r.on && r.stage !== "fly") p = r.stage === "rehearse" ? 0.9 + 0.1 * Math.min(1, r.frames / 48) : 0.9 * (1 - Math.min(1, g.world.alsoUnbuilt() / r.toLoad));
  return { on: r.on, busy: g.flying, stage: r.on ? r.stage : null, p };
});

let n = 0;
const shoot = () => page.screenshot({ path: path.join(work, `f${String(n++).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 });
const LEAD = 30, TAIL = 30;
for (let k = 0; k < LEAD; k++) { await step(); await shoot(); }
await page.evaluate((k) => window.__game().playOpening(k), zone);
const levels = [];
let coverAt = n, liftAt = -1, s;
const big = zone >= (await page.evaluate(() => window.__game().zones.list.length));
for (;;) {
  s = await step();
  if (s.p !== null) levels.push(s.p);
  else if (liftAt < 0 && s.stage === "fly") liftAt = n;
  await shoot();
  if (!s.busy) break;
  if (n > 60 * 90) throw new Error("the fly-over never ended");
}
for (let k = 0; k < TAIL; k++) { await step(); await shoot(); }

// the drum roll, rendered for exactly the frames the cover was up, starting with the cover
const b64 = await page.evaluate(([lv, big]) => window.__frames.roll(lv, big), [levels, big]);
const pcm = Buffer.from(b64, "base64"), wav = Buffer.alloc(44);
wav.write("RIFF", 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write("WAVE", 8); wav.write("fmt ", 12);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(48000, 24);
wav.writeUInt32LE(48000 * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(pcm.length, 40);
const wavPath = opt.out.replace(/\.mp4$/, "") + "-roll.wav";
fs.writeFileSync(wavPath, Buffer.concat([wav, pcm]));
await browser.close();
server.close();

const delay = Math.round((coverAt / 60) * 1000);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "60", "-i", path.join(work, "f%05d.jpg"), "-i", wavPath,
  "-filter_complex", `[1:a]adelay=${delay}|${delay},apad[a]`, "-map", "0:v", "-map", "[a]", "-shortest",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-c:a", "aac", "-b:a", "192k", opt.out]);
if (!opt.keep) fs.rmSync(work, { recursive: true, force: true });
const info = { video: opt.out, sound: wavPath, frames: n, zone, coverUpSecs: +(coverAt / 60).toFixed(3), liftSecs: +(liftAt / 60).toFixed(3), coverFrames: levels.length };
fs.writeFileSync(opt.out.replace(/\.mp4$/, "") + ".json", JSON.stringify(info, null, 1));
console.log(JSON.stringify(info));
