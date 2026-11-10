// Saves a game map's own whole-map picture for the telemetry dashboard's "Where people go" map,
// which has a tab for each map with a picture. Only a manual fallback now: the game itself sends
// the picture to the telemetry server when the server has none for that map or an older release's
// (web/src/telemetry.ts, offerPicture). Use this for a server without its database, or to put a
// picture into the telemetry repo's priv/static by hand.
//
//   node tools/telemetry_map.mjs [--url <game url>] [--out <folder>] [--map combe-down]
//
// It starts a solo game in headless Chrome (the live game by default, or a local `vite preview`
// via --url), reads the big map's cached whole-map canvas (minimap.ts) and writes <map>.png and
// <map>.json (the map id and its bounds in data metres: x0, y0 west and south, x1, y1 east and
// north) into the folder, which is the telemetry repo's priv/static. Run it again whenever the
// map changes. PW=<path to playwright> if it isn't found from web/node_modules.
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { MUTED_ARGS, silence, silenceContext, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const args = process.argv.slice(2);
const opt = { url: "https://combedowner.com/", out: "../combe-downer-telemetry/priv/static", map: "combe-down" };
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, "")] = args[i + 1];

const req = process.env.PW ? createRequire(import.meta.url) : createRequire(WEB + "package.json");
const { chromium } = req(process.env.PW ?? "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true, args: process.platform === "darwin" ? [...MUTED_ARGS, "--use-angle=metal", "--enable-gpu"] : [...MUTED_ARGS, "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await silenceContext(context);
const page = await context.newPage();
await silence(page);
await page.goto(`${opt.url}?${new URLSearchParams({ map: opt.map })}`);
await page.waitForFunction(() => window.__game && !document.getElementById("solo")?.disabled, null, { timeout: 180000 });
await page.evaluate(() => document.getElementById("solo").click());
await page.waitForFunction(() => window.__game && window.__game()?.minimap?.wide, null, { timeout: 180000 });
const got = await page.evaluate(() => {
  const w = window.__game().minimap.wide, size = w.canvas.width, span = size * w.mpp;
  return { png: w.canvas.toDataURL("image/png"), bounds: [w.x0, w.y1 - span, w.x0 + span, w.y1] };
});
console.log(await silenceNote(page));
await browser.close();

fs.mkdirSync(opt.out, { recursive: true });
fs.writeFileSync(path.join(opt.out, `${opt.map}.png`), Buffer.from(got.png.split(",")[1], "base64"));
const [x0, y0, x1, y1] = got.bounds;
fs.writeFileSync(path.join(opt.out, `${opt.map}.json`), JSON.stringify({ map: opt.map, x0, y0, x1, y1 }) + "\n");
console.log(`${opt.map}: ${x0},${y0} to ${x1},${y1} written to ${opt.out}`);
