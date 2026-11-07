// A check on what the Art Gallery's critics can see (web/src/sight.ts, web/src/critics.ts), with no
// browser and no game: paintings drawn here in code (a sun, a bus, a cat, a house, rude doodles at
// several angles, near-misses such as a rocket and a mushroom, a random scribble...), each looked at
// as the host would, and what it was read as printed next to what it was meant to be.
//
//   node tools/critics_probe.mjs [--out dir] [--only name] [--table marks.json] [--said]
//
// Then whole paintings (tools/critics_scenes.mjs), careful, middling and lazy, each shown to ten
// different evenings' crowds, with the marks they got set against what they ought to get; --table
// writes those marks out, to set one run against another. --eye subject.json gives the whole
// paintings the critics' eye's subject scores (by number, from tools/critics_eye_probe.mjs on the
// cal-*.png pictures), to see the marks as a host with the eye would give them. Last, whole evenings
// of one to eight painters: how long the walk round takes and how long the remarks run (--said
// prints every remark).
//
// With --out it also writes each painting as a PNG at four times size, in the easel's own colours,
// and an index.html with a caption under each. Exits 1 if anything meant to be seen wasn't, or
// something was seen that shouldn't have been.
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { scenes } from "./critics_scenes.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { build } = createRequire(WEB + "package.json")("esbuild");
const argv = process.argv.slice(2), opt = { out: "", only: "", table: "", eye: "" };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];

// critics.ts and its imports, bundled for node. The easel's sound and controls are left out, and
// of quests.ts only its seeded randomness is taken, so the show is staged exactly as in the game.
const QUESTS = fs.readFileSync(WEB + "src/quests.ts", "utf8");
const seeded = QUESTS.slice(QUESTS.indexOf("export type Rng"), QUESTS.indexOf("/** \"450 m\""));
const stub = { name: "stub", setup(b) {
  b.onResolve({ filter: /^\.\/(audio|controls|quests)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
  b.onLoad({ filter: /quests/, namespace: "stub" }, () => ({ contents: seeded, loader: "ts" }));
  b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const ctl = () => ''; export const strip = () => '';", loader: "js" }));
} };
const res = await build({
  stdin: { contents: "export * from './critics'; export * from './sight'; export { PALETTE, W, H, C, encode, encodeReplay, decodeReplay, packReplay } from './easel';", resolveDir: WEB + "src", loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "node", plugins: [stub], logLevel: "error",
});
const tmp = path.join(fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "critics-")), "k.mjs");
fs.writeFileSync(tmp, res.outputFiles[0].text);
const K = await import(tmp);
const { W, H, C, PALETTE } = K;

// ---- drawing ------------------------------------------------------------------------------------
const canvas = (bg = C.white) => new Uint8Array(W * H).fill(bg);
const put = (p, x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) p[y * W + x] = c; };
/** Fill wherever inside(x, y) holds, within a box. */
const region = (p, x0, y0, x1, y1, c, inside) => {
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++)
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) if (inside(x + 0.5, y + 0.5)) p[y * W + x] = c;
};
const disc = (p, cx, cy, r, c) => region(p, cx - r, cy - r, cx + r, cy + r, c, (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
const ring = (p, cx, cy, r, c, t = 2) => region(p, cx - r, cy - r, cx + r, cy + r, c, (x, y) => { const d = Math.hypot(x - cx, y - cy); return d <= r && d > r - t; });
const ellipse = (p, cx, cy, a, b, ang, c) => {
  const cs = Math.cos(ang), sn = Math.sin(ang), R = Math.max(a, b);
  region(p, cx - R, cy - R, cx + R, cy + R, c, (x, y) => { const u = (x - cx) * cs + (y - cy) * sn, v = -(x - cx) * sn + (y - cy) * cs; return (u / a) ** 2 + (v / b) ** 2 <= 1; });
};
const rect = (p, x0, y0, x1, y1, c) => region(p, x0, y0, x1, y1, c, () => true);
const line = (p, x0, y0, x1, y1, c, t = 1) => {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
  for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n; if (t <= 1) put(p, x, y, c); else disc(p, x, y, t / 2, c); }
};
const poly = (p, pts, c) => {
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  region(p, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), c, (x, y) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  });
};
/** Draw onto a scratch canvas, then keep only its outline, in one colour. */
const outlined = (p, c, draw, t = 1) => {
  const q = canvas(); draw(q);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (q[i] === C.white) continue;
    let edge = false;
    for (let dy = -t; dy <= t && !edge; dy++) for (let dx = -t; dx <= t && !edge; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || q[yy * W + xx] === C.white) edge = true;
    }
    if (edge) p[i] = c;
  }
};
/** A penis: a shaft with a rounded end and two lumps at its base, turned to an angle. */
const phallus = (p, cx, cy, ang, c, len = 70, wid = 22) => {
  const ex = Math.cos(ang), ey = Math.sin(ang), nx = -ey, ny = ex;
  ellipse(p, cx + ex * len * 0.45, cy + ey * len * 0.45, len * 0.55, wid / 2, ang, c);
  for (const s of [-1, 1]) disc(p, cx + nx * s * wid * 0.62, cy + ny * s * wid * 0.62, wid * 0.68, c);
  return [cx + ex * len, cy + ey * len, ex, ey];
};
const rot = (pts, cx, cy, ang) => pts.map(([x, y]) => [cx + x * Math.cos(ang) - y * Math.sin(ang), cy + x * Math.sin(ang) + y * Math.cos(ang)]);
const rand = (s) => () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);

// a few capitals as strokes on a 4 x 6 grid
const GLYPH = {
  B: [[0, 0, 0, 6], [0, 0, 3, 0], [3, 0, 3, 3], [0, 3, 3, 3], [3, 3, 3, 6], [0, 6, 3, 6]],
  A: [[0, 6, 2, 0], [2, 0, 4, 6], [1, 3, 3, 3]], T: [[0, 0, 4, 0], [2, 0, 2, 6]], H: [[0, 0, 0, 6], [4, 0, 4, 6], [0, 3, 4, 3]],
  E: [[0, 0, 0, 6], [0, 0, 4, 0], [0, 3, 3, 3], [0, 6, 4, 6]], L: [[0, 0, 0, 6], [0, 6, 4, 6]], O: [[0, 0, 4, 0], [4, 0, 4, 6], [4, 6, 0, 6], [0, 6, 0, 0]],
  D: [[0, 0, 0, 6], [0, 0, 3, 0], [3, 0, 4, 2], [4, 2, 4, 4], [4, 4, 3, 6], [3, 6, 0, 6]],
  R: [[0, 0, 0, 6], [0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 0, 3], [0, 3, 4, 6]], I: [[2, 0, 2, 6]], S: [[4, 0, 0, 0], [0, 0, 0, 3], [0, 3, 4, 3], [4, 3, 4, 6], [4, 6, 0, 6]],
};
const write = (p, text, x, y, s, c) => {
  for (const ch of text) {
    for (const [a, b, d, e] of GLYPH[ch] ?? []) line(p, x + a * s, y + b * s, x + d * s, y + e * s, c, 1);
    x += 6 * s;
  }
};

// ---- the paintings ---------------------------------------------------------------------------------
// want: what must be seen; not: what mustn't be (each a thing, a rude one, or a trait)
const S = [];
const add = (name, theme, want, not, draw, how) => S.push({ name, theme, want, not, draw, how });

add("Sun with rays", "Heatwave", ["sun"], ["penis", "cat"], (p) => {
  rect(p, 0, 140, W, H, C.green);
  disc(p, 70, 45, 20, C.yellow);
  for (let k = 0; k < 10; k++) { const a = (k * Math.PI) / 5; line(p, 70 + Math.cos(a) * 24, 45 + Math.sin(a) * 24, 70 + Math.cos(a) * 34, 45 + Math.sin(a) * 34, C.yellow, 2); }
});
add("Sun, just an outline", "Sunrise over the rooftops", ["sun"], ["penis"], (p) => { ring(p, 170, 40, 22, C.orange, 3); });
add("Red bus", "The night bus home", ["bus"], ["penis", "house"], (p) => {
  rect(p, 40, 70, 190, 130, C.red);
  for (let k = 0; k < 5; k++) rect(p, 50 + k * 28, 80, 70 + k * 28, 98, C.pale);
  disc(p, 70, 132, 10, C.black); disc(p, 160, 132, 10, C.black);
});
add("Black cat (head)", "A cat who owns the street", ["cat"], ["penis", "boobs"], (p) => {
  disc(p, 120, 100, 34, C.black);
  poly(p, [[90, 85], [92, 40], [118, 72]], C.black); poly(p, [[150, 85], [148, 40], [122, 72]], C.black);
  disc(p, 108, 95, 4, C.yellow); disc(p, 132, 95, 4, C.yellow);
});
add("Ginger cat sitting", "A cat who owns the street", ["cat"], ["penis"], (p) => {
  ellipse(p, 120, 135, 34, 32, 0, C.orange);
  disc(p, 120, 82, 26, C.orange);
  poly(p, [[98, 72], [100, 40], [118, 60]], C.orange); poly(p, [[142, 72], [140, 40], [122, 60]], C.orange);
});
add("Face (pink, filled)", "Portrait of whoever's on your left", ["face"], ["boobs", "penis"], (p) => {
  disc(p, 120, 90, 55, C.pink);
  disc(p, 100, 75, 6, C.black); disc(p, 140, 75, 6, C.black);
  line(p, 100, 115, 140, 115, C.black, 3);
});
add("Face (outline)", "Self-portrait as a Roman", ["face"], ["boobs"], (p) => {
  ring(p, 120, 90, 60, C.black, 2);
  disc(p, 98, 72, 4, C.black); disc(p, 142, 72, 4, C.black);
  for (let k = -10; k <= 10; k++) put(p, 120 + k * 2, 115 + (k * k) / 8, C.black), put(p, 120 + k * 2 + 1, 115 + (k * k) / 8, C.black);
});
add("Gulls", "A seagull's revenge", ["birds"], ["writing", "penis"], (p) => {
  for (const [x, y, s] of [[50, 50, 10], [110, 35, 14], [170, 60, 8], [140, 90, 11]]) {
    line(p, x - s, y - s * 0.5, x, y, C.black, 1); line(p, x, y, x + s, y - s * 0.5, C.black, 1);
  }
});
add("House", "{place} on a Tuesday", ["house"], ["penis", "bus"], (p) => {
  rect(p, 70, 90, 170, 160, C.stone);
  poly(p, [[60, 90], [120, 40], [180, 90]], C.red);
  rect(p, 85, 105, 105, 125, C.sky); rect(p, 135, 105, 155, 125, C.sky); rect(p, 112, 130, 128, 160, C.brown);
});
add("House (outline)", "{place} on a Tuesday", ["house"], ["penis"], (p) => {
  outlined(p, C.black, (q) => { rect(q, 70, 90, 170, 160, C.black); poly(q, [[70, 90], [120, 45], [170, 90]], C.black); });
});
add("Trees", "{place} on a Tuesday", ["tree"], ["penis", "phallic"], (p) => {
  for (const x of [60, 160]) { rect(p, x - 5, 100, x + 5, 160, C.brown); disc(p, x, 80, 28, C.green); }
});
add("Stick figure", "A naughty boy legging it", ["figure"], ["penis", "phallic"], (p) => {
  ring(p, 120, 45, 14, C.black, 2);
  line(p, 120, 59, 120, 115, C.black, 2); line(p, 90, 80, 150, 80, C.black, 2);
  line(p, 120, 115, 100, 160, C.black, 2); line(p, 120, 115, 140, 160, C.black, 2);
});
add("Writing", "Last orders at {pub}", ["writing"], ["birds", "penis"], (p) => { write(p, "BATH", 40, 50, 4, C.black); write(p, "HELLO", 30, 110, 3, C.blue); });
for (const deg of [0, 40, 90, 135, 200, 290]) {
  add(`Penis at ${deg}°`, "A seagull's revenge", ["penis"], ["boobs", "bum"], (p) => { phallus(p, 120 - 35 * Math.cos(deg * Math.PI / 180), 90 - 35 * Math.sin(deg * Math.PI / 180), (deg * Math.PI) / 180, C.pink); });
}
add("Penis (outline)", "A seagull's revenge", ["penis"], [], (p) => { outlined(p, C.black, (q) => phallus(q, 80, 120, -0.5, C.black, 80, 24)); });
add("Penis, small", "Rain. Again.", ["penis"], [], (p) => { rect(p, 0, 0, W, H, C.sky); phallus(p, 60, 60, 0.3, C.pink, 38, 12); });
add("Penis with a flourish", "Fireworks over {place}", ["penis", "finale"], [], (p) => {
  const [tx, ty, ex, ey] = phallus(p, 50, 130, -0.6, C.pink, 70, 20);
  for (let k = 1; k <= 6; k++) disc(p, tx + ex * k * 12 + (k % 2 ? 4 : -4) * ey, ty + ey * k * 12 - (k % 2 ? 4 : -4) * ex, 2, C.pale);
});
add("Bus, and a penis", "The night bus home", ["bus", "penis", "rudeWith"], [], (p) => {
  rect(p, 20, 90, 150, 140, C.red); for (let k = 0; k < 4; k++) rect(p, 30 + k * 30, 98, 48 + k * 30, 112, C.pale);
  phallus(p, 175, 70, -1.2, C.pink, 50, 16);
});
add("Boobs", "Your nan's front room", ["boobs"], ["penis", "face"], (p) => {
  disc(p, 90, 95, 30, C.pink); disc(p, 150, 95, 30, C.pink);
  disc(p, 92, 100, 4, C.brown); disc(p, 148, 100, 4, C.brown);
});
add("Boobs (outline)", "Your nan's front room", ["boobs"], ["penis"], (p) => {
  ring(p, 95, 90, 28, C.black, 2); ring(p, 148, 90, 28, C.black, 2);
  disc(p, 95, 92, 3, C.black); disc(p, 148, 92, 3, C.black);
});
add("Bum", "A Roman in the bath", ["bum"], ["penis", "boobs"], (p) => { disc(p, 98, 100, 30, C.pink); disc(p, 142, 100, 30, C.pink); });
add("Rocket (near-miss)", "Fireworks over {place}", [], ["penis"], (p) => {
  const a = -Math.PI / 2;
  poly(p, rot([[-30, -11], [40, -11], [40, 11], [-30, 11]], 120, 100, a), C.grey);
  poly(p, rot([[40, -11], [62, 0], [40, 11]], 120, 100, a), C.red);
  poly(p, rot([[-30, -11], [-10, -11], [-38, -30]], 120, 100, a), C.red); poly(p, rot([[-30, 11], [-10, 11], [-38, 30]], 120, 100, a), C.red);
  poly(p, rot([[-30, -6], [-50, 0], [-30, 6]], 120, 100, a), C.orange);
});
add("Mushroom (near-miss)", "The prize marrow", [], ["penis", "house"], (p) => {
  rect(p, 108, 90, 132, 160, C.stone);
  region(p, 70, 40, 170, 92, C.red, (x, y) => ((x - 120) / 50) ** 2 + ((y - 92) / 50) ** 2 <= 1 && y <= 92);
});
add("Googly eyes (near-miss)", "Pigeons plotting something", [], ["penis"], (p) => {
  disc(p, 90, 90, 22, C.pale); disc(p, 150, 90, 22, C.pale); ring(p, 90, 90, 22, C.black); ring(p, 150, 90, 22, C.black);
  disc(p, 95, 95, 6, C.black); disc(p, 155, 85, 6, C.black);
});
add("Snowman (near-miss)", "Rain. Again.", [], ["bum", "penis"], (p) => { disc(p, 120, 125, 35, C.pale); disc(p, 120, 70, 24, C.pale); });
add("Heart", "Your nan's front room", [], ["penis"], (p) => {
  region(p, 60, 30, 180, 160, C.red, (x, y) => { const u = (x - 120) / 50, v = -(y - 90) / 50; return (u * u + v * v - 1) ** 3 - u * u * v * v * v <= 0; });
});
add("Random scribble", "A seagull's revenge", [], ["penis", "boobs", "bum", "face", "cat", "house"], (p) => {
  const r = rand(7); let x = 120, y = 90;
  for (let k = 0; k < 160; k++) { const nx = Math.max(5, Math.min(W - 5, x + (r() - 0.5) * 40)), ny = Math.max(5, Math.min(H - 5, y + (r() - 0.5) * 40)); line(p, x, y, nx, ny, C.black, 1); x = nx; y = ny; }
});
add("Landscape with a horizon", "{place} on a Tuesday", ["horizon"], ["penis"], (p) => { rect(p, 0, 0, W, 99, C.sky); rect(p, 0, 100, W, H, C.green); disc(p, 180, 40, 14, C.yellow); });
add("Blue and orange", "Heatwave", ["complement"], ["penis"], (p) => { rect(p, 0, 0, 119, H, C.blue); rect(p, 120, 0, W, H, C.orange); });
add("Warm bands", "Sunrise over the rooftops", ["analogous"], [], (p) => { rect(p, 0, 0, W, 59, C.yellow); rect(p, 0, 60, W, 119, C.orange); rect(p, 0, 120, W, H, C.red); });
add("Muddy", "Rain. Again.", ["muddy"], [], (p) => {
  const r = rand(3);
  for (let k = 0; k < 40; k++) disc(p, r() * W, r() * H, 10 + r() * 20, [C.brown, C.grey, C.dkgreen, C.navy, C.purple][k % 5]);
});
add("Cartoon outlines", "Hot air balloons at breakfast", ["outlined"], [], (p) => {
  for (const [x, y, c] of [[70, 70, C.red], [160, 60, C.yellow], [120, 130, C.blue]]) { disc(p, x, y, 30, c); ring(p, x, y, 31, C.black, 3); }
});
add("Hatching", "Rain. Again.", ["hatched"], ["penis"], (p) => { for (let k = -H; k < W; k += 6) line(p, k, 0, k + H, H, C.navy, 1); });
add("Blank", "A seagull's revenge", ["blank"], [], () => {});
// how it was painted, as the easel would report it
const HOW = (o) => ({ secs: 60, undos: 3, big: 20, fine: 20, ruled: 0, ground: false, wobble: 8, ...o });
add("Quick scribble", "Heatwave", ["quick", "wobbly"], [], (p) => { const r = rand(11); let x = 60, y = 60; for (let k = 0; k < 12; k++) { const nx = 40 + r() * 160, ny = 30 + r() * 120; line(p, x, y, nx, ny, C.red, 3); x = nx; y = ny; } }, HOW({ secs: 14, wobble: 22 }));
add("Laboured house", "{place} on a Tuesday", ["house", "slow", "fiddly", "ground"], [], (p) => {
  rect(p, 0, 0, W, H, C.sky); rect(p, 0, 150, W, H, C.green);
  rect(p, 80, 100, 160, 150, C.stone); poly(p, [[72, 100], [120, 60], [168, 100]], C.red);
}, HOW({ secs: 98, undos: 17, ground: true, fine: 70, wobble: 4 }));
add("Big brush, no undos", "Rain. Again.", ["bigBrush", "nerve"], [], (p) => { for (let k = 0; k < 6; k++) line(p, 20 + k * 40, 20, 40 + k * 30, 160, C.navy, 12); }, HOW({ secs: 40, undos: 0, big: 90 }));

// ---- look at each one -------------------------------------------------------------------------------
const PIXEL = { blank: 1, horizon: 1, complement: 1, analogous: 1, muddy: 1, outlined: 1, hatched: 1 };
const rows = [];
let bad = 0;
for (const s of S) {
  if (opt.only && !s.name.toLowerCase().includes(opt.only.toLowerCase())) continue;
  const px = canvas(); s.draw(px);
  const theme = K.THEMES.find((t) => t.t === s.theme) ?? K.THEMES[0];
  const t0 = performance.now();
  const sight = K.see(px);
  const ms = performance.now() - t0;
  const strokes = s.how && s.how.secs < 25 ? 12 : 30;
  const look = K.analyse(px, strokes, theme, s.how);
  const traits = K.traits(look, theme);
  const show = K.stageShow([{ id: "a", name: "Ada", px, strokes, ...(s.how ? { how: s.how } : {}) }], theme, theme.t, 1234 + S.indexOf(s) * 7919, () => [0, 0], [0, 0]);
  const seen = [
    ...Object.entries(sight.things).map(([k, n]) => (n > 1 ? `${k}x${n}` : k)),
    ...Object.entries(sight.rude).map(([k, n]) => (n > 1 ? `${k}x${n}` : k)),
  ];
  const flags = [sight.horizon >= 0 && "horizon", sight.complement && "complement", sight.analogous && "analogous", sight.muddy && "muddy", sight.outlined && "outlined", sight.hatched && "hatched", traits.includes("blank") && "blank"].filter(Boolean);
  const has = (k) => seen.some((x) => x.split("x")[0] === k) || flags.includes(k) || traits.includes(k);
  const miss = s.want.filter((k) => !has(k)), wrong = s.not.filter((k) => has(k));
  if (miss.length || wrong.length) bad++;
  rows.push({ s, px, seen, flags, traits, mark: show.marks[0], miss, wrong, ms, remarks: show.remarks.map((r) => `${K.visitor(r.v).name}: ${r.text} (${r.mark})`) });
}

// a room of five: two near copies, one that's nothing like the rest
const group = ["House", "Laboured house", "Trees", "Red bus", "Penis at 40°"].map((n) => rows.find((r) => r.s.name === n)).filter(Boolean);
let room = null;
if (group.length === 5) {
  const copy = group[0].px.slice(); for (let i = 0; i < 400; i++) copy[i * 7] = C.black;
  const ps = [...group.map((r, i) => ({ id: "p" + i, name: ["Ada", "Bert", "Cleo", "Dan", "Eve"][i], px: r.px, strokes: 30 })), { id: "p5", name: "Fay", px: copy, strokes: 30 }];
  const theme = K.THEMES.find((t) => t.t === "{place} on a Tuesday");
  const sh = K.stageShow(ps, theme, "Combe Down on a Tuesday", 99, () => [0, 0], [0, 0]);
  const v = K.verdict(sh, ps, ps.map(() => 0), 99);
  const kin = K.alike(ps.map((p) => p.px));
  room = { names: ps.map((p) => p.name), kin, marks: sh.marks, prizes: v.prizes, headline: v.headline, remarks: sh.remarks.map((r) => `${K.visitor(r.v).name} on ${ps[r.p].name}'s: ${r.text} (${r.mark})`) };
  const twinOk = kin.twin[0] === 5 && kin.twin[5] === 0;
  if (!twinOk) bad++;
}

// ---- whole paintings, and what they're marked ---------------------------------------------------------
const CAL = scenes({ C, W, H, rect, disc, ring, ellipse, line, poly, write, rand, put, phallus });
const WANT = { good: [8, 9], mid: [5.5, 6.5], lazy: [2, 4], twist: [1, 10] };
const calRows = [];
const EYE = opt.eye ? JSON.parse(fs.readFileSync(opt.eye, "utf8")) : null;
for (const s of CAL) {
  const eye = EYE ? { subject: EYE[CAL.indexOf(s) + 1] ?? 0, seen: [], top: [], fits: [] } : undefined;
  if (opt.only && !s.name.toLowerCase().includes(opt.only.toLowerCase())) continue;
  const frames = [];
  const px = canvas();
  for (const layer of s.layers) { layer(px); frames.push(px.slice()); }
  const early = frames.length >= 3 ? K.earlyFrom(frames) : undefined;
  const theme = K.THEMES.find((t) => t.t === s.theme);
  const shows = [], critic = [], all = [], byWho = {};
  for (let k = 0; k < 10; k++) {
    const sh = K.stageShow([{ id: "a", name: "Ada", px, strokes: s.strokes, ...(s.how ? { how: s.how } : {}), ...(early ? { early } : {}), ...(eye ? { eye } : {}) }], theme, theme.t.replace("{pub}", "the Hadley Arms"), 4321 + k * 7919, () => [0, 0], [0, 0]);
    shows.push(sh.marks[0]);
    for (const r of sh.remarks) { all.push(r.mark); (byWho[K.visitor(r.v).name] ??= []).push(r.mark); if (K.visitor(r.v).critic) critic.push({ who: K.visitor(r.v).name, mark: r.mark, text: r.text }); }
  }
  const mean = shows.reduce((a, b) => a + b, 0) / shows.length;
  const [lo, hi] = WANT[s.tier];
  const look = K.analyse(px, s.strokes, theme, s.how);
  const traits = K.traits(look, theme);
  const said = [];
  { const sh = K.stageShow([{ id: "a", name: "Ada", px, strokes: s.strokes, ...(s.how ? { how: s.how } : {}), ...(early ? { early } : {}) }], theme, theme.t.replace("{pub}", "the Hadley Arms"), 4321, () => [0, 0], [0, 0]);
    for (const r of sh.remarks) said.push(`${K.visitor(r.v).name}: ${r.text} (${r.mark})`); }
  const bestCritic = critic.reduce((b, c) => (c.mark > b.mark ? c : b), { mark: 0, who: "" });
  const replay = K.encodeReplay ? K.encodeReplay(frames.length ? frames : [px]) : "";
  calRows.push({ s, px, frames, mean, lo: Math.min(...shows), hi: Math.max(...shows), critic: bestCritic, top: Math.max(...all), low: Math.min(...all), ok: mean >= lo - 0.25 && mean <= hi + 0.25 && (s.tier !== "good" || bestCritic.mark >= 9.5), traits, said, replay, byWho });
}
const calBad = calRows.filter((r) => !r.ok).length;

// the time-lapse: every replay comes back as it went, and a long painting still packs small
let tapeBad = 0;
const tapeNotes = [];
for (const r of calRows) {
  if (!r.replay) continue;
  const back = K.decodeReplay(r.replay), sent = r.frames.length ? r.frames : [r.px];
  if (back.length !== sent.length || back.some((f, i) => f.some((v, j) => v !== sent[i][j]))) { tapeBad++; tapeNotes.push(`${r.s.name}: replay doesn't come back as it went`); }
}
if (K.packReplay && calRows.length) {
  // the worst case: a hundred strokes of speckle, each shown as a snapshot
  const fin = calRows[0].px, r = rand(23), tape = [], cur = canvas();
  for (let k = 0; k < 95; k++) { for (let n = 0; n < 500; n++) { const i = Math.floor(r() * W * H); cur[i] = fin[i]; } tape.push(cur.slice()); }
  tape.push(fin.slice());
  const packed = K.packReplay(tape), back = K.decodeReplay(packed);
  const ok = packed.length <= 60000 && back.length >= 2 && back[back.length - 1].every((v, j) => v === fin[j]);
  if (!ok) tapeBad++;
  tapeNotes.push(`a hundred speckled strokes pack to ${back.length} snapshots, ${packed.length} B${ok ? "" : " (TOO BIG, or the last isn't the painting)"}`);
  const smooth = calRows.find((x) => x.s.name.startsWith("Last orders"));
  if (smooth) {
    // brushwork: the layers again, each one put down a strip at a time
    const t2 = [], c2 = canvas();
    for (let k = 1; k <= smooth.frames.length; k++) { const to = smooth.frames[k - 1]; for (let y = 0; y < H; y += 12) { for (let i = y * W; i < Math.min(H, y + 12) * W; i++) c2[i] = to[i]; t2.push(c2.slice()); } }
    const pk = K.packReplay(t2);
    tapeNotes.push(`${t2.length} strokes of a careful painting pack to ${K.decodeReplay(pk).length} snapshots, ${pk.length} B`);
  }
}

const pad = (v, n) => String(v).padEnd(n);
console.log(pad("painting", 28), pad("wanted", 16), pad("seen", 26), pad("ok", 4), "traits");
for (const r of rows) {
  const ok = r.miss.length || r.wrong.length ? "NO" : "yes";
  console.log(pad(r.s.name, 28), pad(r.s.want.join(",") || "-", 16), pad([...r.seen, ...r.flags].join(",") || "-", 26), pad(ok, 4),
    `${r.traits.join(",")}  mark ${r.mark.toFixed(1)}  ${r.ms.toFixed(0)}ms${r.miss.length ? "  MISSED " + r.miss.join(",") : ""}${r.wrong.length ? "  WRONGLY " + r.wrong.join(",") : ""}`);
}
console.log(`${rows.length - bad} of ${rows.length} read as meant`);
if (room) {
  console.log(`\nA room of six: twins ${room.kin.twin.map((t, i) => t >= 0 ? room.names[i] + "~" + room.names[t] : "").filter(Boolean).join(" ") || "none"}, odd one out ${room.kin.odd >= 0 ? room.names[room.kin.odd] : "none"}`);
  console.log(`  marks ${room.names.map((n, i) => n + " " + room.marks[i].toFixed(1)).join(", ")}; prizes: ${room.prizes.map((q) => q.title + " (" + room.names[q.p] + ", " + q.why + ")").join("; ")}; headline ${room.headline}`);
  const said = room.remarks.map((r) => r.split(": ").slice(1).join(": ").replace(/ \([\d.]+\)$/, ""));
  console.log(`  ${said.length} remarks, ${new Set(said).size} different`);
}
if (opt.only) for (const r of rows) for (const l of r.remarks) console.log("  " + l);
console.log(`\n${pad("whole painting", 32)} ${pad("tier", 5)} ${pad("wanted", 9)} ${pad("mean", 5)} ${pad("range", 10)} ${pad("best critic", 30)} ok`);
for (const r of calRows) {
  const [lo, hi] = WANT[r.s.tier];
  console.log(`${pad(r.s.name, 32)} ${pad(r.s.tier, 5)} ${pad(lo + "-" + hi, 9)} ${pad(r.mean.toFixed(1), 5)} ${pad(r.lo.toFixed(1) + "-" + r.hi.toFixed(1), 10)} ${pad(r.critic.mark + " " + r.critic.who, 30)} ${r.ok ? "yes" : "NO"}${r.replay ? `  replay ${r.frames.length} frames ${r.replay.length} B` : ""}`);
}
console.log(`${calRows.length - calBad} of ${calRows.length} marked as meant`);
for (const n of tapeNotes) console.log("time-lapse: " + n);
if (opt.only) for (const r of calRows) { console.log(`  ${r.s.name}: ${r.traits.join(",")}`); if (process.env.FRAMES) r.frames.forEach((f, i) => { const g = K.see(f); console.log(`    frame ${i + 1}: ${[...Object.keys(g.things), ...Object.keys(g.rude)].join(",")}`); }); console.log("    " + Object.entries(r.byWho).map(([k, v]) => `${k.split(" ")[0]} ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}`).join(", ")); for (const l of r.said) console.log("    " + l); }
// whole evenings, one to eight painters, hung along two walls as in the gallery: how long the evening
// and its judging round take, and how long the remarks run (--said prints every one)
if (!opt.only && CAL.length) {
  console.log("\nevening      seconds  judging  remarks  sentences (mean, most)");
  for (const n of [1, 2, 4, 6, 8]) {
    const ps = Array.from({ length: n }, (_, i) => {
      const s = CAL[(i * 5 + n) % CAL.length], px = canvas();
      for (const layer of s.layers) layer(px);
      return { id: "p" + i, name: ["Ada", "Bert", "Cleo", "Dan", "Eve", "Fay", "Gus", "Hal"][i], px, strokes: s.strokes, ...(s.how ? { how: s.how } : {}) };
    });
    const theme = K.THEMES.find((t) => t.t === CAL[n % CAL.length].theme);
    const sh = K.stageShow(ps, theme, theme.t.replace("{pub}", "the Hadley Arms"), 777 + n, (p) => [(p % 4 - 1.5) * 4.5, p < 4 ? -5 : 5], [10, 0]);
    const ns = sh.remarks.map((r) => K.sentences(r.text));
    console.log(`${pad(n + " painting" + (n > 1 ? "s" : ""), 12)} ${pad(sh.dur.toFixed(0), 8)} ${pad((sh.j ?? 0).toFixed(0), 8)} ${pad(sh.remarks.length, 8)} ${(ns.reduce((a, b) => a + b, 0) / ns.length).toFixed(1)}, ${Math.max(...ns)}`);
    if ("said" in opt) for (const r of sh.remarks) console.log(`    ${K.visitor(r.v).name} on ${ps[r.p].name}'s (${r.mark}): ${r.text}`);
  }
}
if (opt.table) fs.writeFileSync(opt.table, JSON.stringify(calRows.map((r) => ({ name: r.s.name, tier: r.s.tier, mean: +r.mean.toFixed(2), lo: r.lo, hi: r.hi, critic: r.critic.mark, critic_who: r.critic.who, top: r.top, low: r.low })), null, 1));

// ---- pictures ----------------------------------------------------------------------------------------
if (opt.out) {
  fs.mkdirSync(opt.out, { recursive: true });
  const RGB = PALETTE.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const cards = [];
  rows.forEach((r, i) => {
    const file = `${String(i + 1).padStart(2, "0")}-${r.s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")}.png`;
    fs.writeFileSync(path.join(opt.out, file), png(r.px, 4, RGB));
    const ok = !r.miss.length && !r.wrong.length;
    cards.push(`<figure class="${ok ? "ok" : "no"}"><img src="${file}" alt="${esc(r.s.name)}" width="480" height="360"><figcaption><b>${esc(r.s.name)}</b> <span class="v">${ok ? "read as meant" : "misread"}</span><br>
      Subject: ${esc(r.s.theme)}<br>Wanted: ${esc(r.s.want.join(", ") || "nothing in particular")}<br>Seen: <b>${esc([...r.seen, ...r.flags].join(", ") || "nothing")}</b><br>
      Traits: ${esc(r.traits.join(", "))}<br>Mark: <b>${r.mark.toFixed(1)}</b>${r.miss.length ? `<br>Missed: ${esc(r.miss.join(", "))}` : ""}${r.wrong.length ? `<br>Wrongly saw: ${esc(r.wrong.join(", "))}` : ""}
      <div class="said">${r.remarks.slice(0, 3).map((l) => `<div>${esc(l)}</div>`).join("")}</div>
      ${r.remarks.length > 3 ? `<details><summary>and ${r.remarks.length - 3} more</summary>${r.remarks.slice(3).map((l) => `<div>${esc(l)}</div>`).join("")}</details>` : ""}</figcaption></figure>`);
  });
  const calCards = calRows.map((r, i) => {
    const file = `cal-${String(i + 1).padStart(2, "0")}-${r.s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")}.png`;
    fs.writeFileSync(path.join(opt.out, file), png(r.px, 4, RGB));
    const [lo, hi] = WANT[r.s.tier];
    return `<figure class="${r.ok ? "ok" : "no"}"><img src="${file}" alt="${esc(r.s.name)}" width="480" height="360"><figcaption><b>${esc(r.s.name)}</b> <span class="v">${esc(r.s.tier)}, wanted ${lo} to ${hi}</span><br>
      Subject: ${esc(r.s.theme)}<br>Mean over ten evenings: <b>${r.mean.toFixed(1)}</b> (${r.lo.toFixed(1)} to ${r.hi.toFixed(1)}); best critic ${r.critic.mark} (${esc(r.critic.who)})<br>Traits: ${esc(r.traits.join(", "))}
      <div class="said">${r.said.slice(0, 3).map((l) => `<div>${esc(l)}</div>`).join("")}</div>
      ${r.said.length > 3 ? `<details><summary>and ${r.said.length - 3} more</summary>${r.said.slice(3).map((l) => `<div>${esc(l)}</div>`).join("")}</details>` : ""}</figcaption></figure>`;
  });
  cards.unshift(`<h2 style="grid-column:1/-1">Whole paintings, and their marks</h2>`, ...calCards, `<h2 style="grid-column:1/-1">What it can make out</h2>`);
  // each whole painting's layers, for tools/gallery_probe.mjs --scene to paint in the game
  fs.writeFileSync(path.join(opt.out, "scenes.json"), JSON.stringify(Object.fromEntries(calRows.map((r) => [r.s.name, { theme: r.s.theme, frames: r.frames.map(K.encode) }]))));
  fs.writeFileSync(path.join(opt.out, "index.html"), `<!doctype html><meta charset="utf-8"><title>What the critics see</title>
<style>body{font:14px/1.4 system-ui,sans-serif;margin:16px;background:#f4f1ea;color:#222}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
figure{margin:0;background:#fff;padding:8px;border:2px solid #9c9}figure.no{border-color:#d66}img{width:100%;height:auto;image-rendering:pixelated;border:1px solid #ccc}
.v{font-size:12px;color:#666}.said{margin-top:6px;font-size:13px;font-style:italic}.said div{margin:3px 0}details{margin-top:4px;font-size:12px}</style>
<h1>What the critics see</h1>${room ? `<section><h2>A room of six</h2><p>Twins: ${esc(room.kin.twin.map((t, i) => t >= 0 ? room.names[i] + " and " + room.names[t] : "").filter(Boolean).join("; ") || "none")}. Odd one out: ${esc(room.kin.odd >= 0 ? room.names[room.kin.odd] : "none")}. Headline: <b>${esc(room.headline)}</b></p><p>Prizes: ${esc(room.prizes.map((q) => q.title + " to " + room.names[q.p] + " (" + q.why + ")").join("; "))}</p><details><summary>Everything said (${room.remarks.length} remarks)</summary>${room.remarks.map((l) => `<div>${esc(l)}</div>`).join("")}</details></section>` : ""}<p>${rows.length - bad} of ${rows.length} read as meant. Each painting is drawn in code by tools/critics_probe.mjs and read by web/src/sight.ts.</p><main>${cards.join("\n")}</main>`);
  console.log(`pictures in ${opt.out}`);
}
fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
process.exit(bad || tapeBad ? 1 : 0);

/** A painting as a PNG, each pixel a scale x scale square. */
function png(px, scale, rgb) {
  const w = W * scale, h = H * scale, raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) { const c = rgb[px[Math.floor(y / scale) * W + Math.floor(x / scale)]], o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; }
  }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
