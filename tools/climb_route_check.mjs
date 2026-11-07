// A check on The Climb's routes (web/src/crag.ts routeFor) without a browser: for many seeds and every
// size of team, which climbers can get from the foot to the top on the holds alone, with ropes left
// out (a rope needs a mate already up, holding it).
// - alone (no shoulders, no bridge) the solo route must go all the way;
// - with two or more the holds alone must not: somewhere there's a blank stretch, and the traverse's gap;
// - with the whole team's tricks (two stacked, a bridge across the gap) it must go;
// - a stretch that needs two stacked must not go off one mate's shoulders;
// - with --against <git rev>, the route for one climber must be exactly that rev's.
//
//   node tools/climb_route_check.mjs [--seeds 300] [--against main]
//
// Reaches are the game's (theclimb.ts): a jump from a ledge catches a hold up to JUMP above your
// feet, a mate's shoulders add a metre each, and hand to hand goes as far as a lunge.
import { createRequire } from "module";
import { execSync } from "child_process";
import fs from "fs";

const WEB = new URL("../web/", import.meta.url).pathname;
const esbuild = createRequire(WEB + "package.json")("esbuild");
const argv = process.argv.slice(2), opt = { seeds: "300" };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];

const JUMP = 2 + 7.2 ** 2 / (2 * 22) + 1.0;   // hands over feet, a jump's rise, and the catch
const LUNGE = 3.4, REACH = 2.2, SHOULDER = 1.0;

// quests.ts pulls in the whole game: only its seeded randomness is wanted here
const quests = fs.readFileSync(WEB + "src/quests.ts", "utf8");
const grab = (name) => { const m = quests.match(new RegExp(`export function ${name}\\([\\s\\S]*?\\n}\\n`)); if (!m) throw new Error(`no ${name} in quests.ts`); return m[0]; };
const stub = { name: "quests", setup(b) { b.onResolve({ filter: /\/quests$/ }, () => ({ path: "quests", namespace: "stub" })); b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: grab("rng") + grab("hash"), loader: "ts" })); } };
async function load(file) {
  const out = await esbuild.build({ entryPoints: [file], bundle: true, write: false, format: "esm", platform: "node", plugins: [stub], logLevel: "error" });
  const url = "data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64");
  return import(url);
}

const crag = await load(WEB + "src/crag.ts");
const room = crag.roomOver(0, 0, 0, "check");

/** Can a climber get to the top, with mates' shoulders (lift metres) and a bridge across the gap? */
function goes(route, lift, bridge) {
  const L = route.ledges, S = L.length - 1, y0 = room.y0;
  const pts = route.holds.map((h) => ({ s: h.s, y: h.y }));
  if (bridge && route.gap) { const a = route.holds[route.gap[0]], b = route.holds[route.gap[1]]; pts.push({ s: (a.s + b.s) / 2, y: (a.y + b.y) / 2 }); }
  const seenP = new Set(), seenL = new Set([0]), todo = [["L", 0]];
  const lipNear = (k, p) => { const l = L[k]; return Math.hypot(Math.max(l.s0 + 0.3, Math.min(l.s1 - 0.3, p.s)) - p.s, l.y - p.y); };
  while (todo.length) {
    const [t, i] = todo.pop();
    if (t === "L") {
      if (i === S) return true;
      const l = L[i], lo = i === 0 ? -crag.HALF : l.s0, hi = i === 0 ? crag.HALF : l.s1;
      pts.forEach((p, j) => { if (!seenP.has(j) && p.y > l.y && p.s > lo - 1 && p.s < hi + 1 && p.y - l.y <= JUMP + lift) { seenP.add(j); todo.push(["P", j]); } });
    } else {
      const p = pts[i];
      pts.forEach((q, j) => { if (!seenP.has(j) && Math.hypot(q.s - p.s, q.y - p.y) <= LUNGE) { seenP.add(j); todo.push(["P", j]); } });
      L.forEach((_l, k) => { if (k > 0 && !seenL.has(k) && lipNear(k, p) <= LUNGE) { seenL.add(k); todo.push(["L", k]); } });
    }
  }
  void y0;
  return false;
}

const fails = [], counts = {};
const seeds = +opt.seeds;
for (let n = 1; n <= 8; n++) {
  const c = counts[n] = { boosts: 0, stacked: 0, gaps: 0 };
  for (let seed = 1; seed <= seeds; seed++) {
    const r = crag.routeFor(room, seed, n);
    c.boosts += r.holds.filter((h) => h.boost).length; c.stacked += r.holds.filter((h) => h.two).length; c.gaps += r.gap ? 1 : 0;
    const say = (what) => fails.push(`n ${n} seed ${seed}: ${what}`);
    if (n === 1) { if (!goes(r, 0, false)) say("alone it doesn't go"); continue; }
    if (goes(r, 0, false)) say("one climber on the holds alone gets to the top");
    if (!goes(r, 2 * SHOULDER, true)) say("even the whole team can't get up");
    const two = r.holds.some((h) => h.two);
    if (two && goes(r, SHOULDER, true)) say("the two-stacked stretch goes off one mate's shoulders");
    if (!r.gap) say("no gap on the traverse for a human chain");
    else {
      const [a, b] = r.gap.map((i) => r.holds[i]), d = Math.hypot(b.s - a.s, b.y - a.y);
      if (d <= LUNGE || d / 2 > REACH) say(`the traverse's gap is ${d.toFixed(2)} m: it has to be past a lunge, and each half in a reach`);
      if (goes(r, 2 * SHOULDER, false)) say("the traverse goes without a bridge");
    }
  }
}
if (opt.against) {
  const tmp = WEB + "src/.crag-against.ts";
  fs.writeFileSync(tmp, execSync(`git show ${opt.against}:web/src/crag.ts`, { encoding: "utf8" }));
  try {
    const old = await load(tmp);
    for (let seed = 1; seed <= seeds; seed++) {
      const a = JSON.stringify(old.routeFor(room, seed, 1)), b = JSON.stringify(crag.routeFor(room, seed, 1));
      if (a !== b) { fails.push(`seed ${seed}: the route for one isn't ${opt.against}'s`); break; }
    }
  } finally { fs.unlinkSync(tmp); }
}
for (const [n, c] of Object.entries(counts)) console.log(`${n} climbing: ${(c.boosts / seeds).toFixed(2)} boost stretches a route, ${(c.stacked / seeds).toFixed(2)} needing two stacked, a chain gap on ${c.gaps} of ${seeds}`);
for (const f of fails.slice(0, 40)) console.log("FAIL", f);
console.log(fails.length ? `${fails.length} failures` : `all good over ${seeds} seeds${opt.against ? `, solo the same as ${opt.against}` : ""}`);
process.exit(fails.length ? 1 : 0);
