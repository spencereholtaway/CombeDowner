// Is the drawn ground closed: does every edge of the ground and the street, pavement and path faces
// meet another triangle, so there is no crack along it for the sky to show through? Each square's
// scenery is built as the game builds it (world.ts, bundled for Node by node_game.mjs, with the
// ground sheet on), and the edges of the ground and of the faces' tops are counted:
//
//   open    an edge of the ground or of a face's top that no other triangle of the ground, the
//           faces, their kerbs or retaining walls has (corners welded within half a millimetre);
//   tee     of those, the ones closed by a run of edges on the other side lying along it (a corner one
//           side has partway along an edge the other hasn't: no gap, but a T-junction that can
//           sparkle);
//   gap     the rest: the two sides apart, a hairline the sky shows through.
//
// Not counted: edges along the square's own sides (the next square meets them), and the sides and
// feet of kerbs, walls and the like (only edges of the ground's and the faces' tops are checked; a
// kerb or a wall still closes an edge it shares).
//
// With --rules it also gives rule 44's walls standing over the ground (wallFeet below; --feet works them out
// without --rules), rule 45's street faces left inside a set piece (setPieceFaces), and rule 46's set
// pieces' floors stopping short of what stands beyond them (floorGaps; --gaps prints them without --rules).
//
//   node tools/ground_seams.mjs [--map combe-down] [--squares "0,3 -1,2"] [--json out.json] [--most n] [--rules] [--query ground=cdt] [--heights] [--slices]
//
// --most n prints up to n gaps per square, as data x, y and a ?at= to look from. Exits 1 if any
// square has a gap, so a build can stop on it. --rules prints the gaps as tools/check_more.py's
// rule 38 findings instead (and always exits 0).
import fs from "fs";
import path from "path";
import { fakeBrowser, bundleGame } from "./node_game.mjs";

const here = path.dirname(new URL(import.meta.url).pathname), web = path.join(here, "..", "web");
const argv = process.argv.slice(2);
const opt = { map: "combe-down", squares: "", json: "", most: "0", rules: "", query: "", heights: "", slices: "", feet: "", gaps: "", maps: path.join(web, "public", "maps"), src: path.join(web, "src") };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[i] === "--rules" || argv[i] === "--feet" || argv[i] === "--gaps" || argv[i] === "--heights" || argv[i] === "--slices" ? "1" : argv[++i];
// (with --rules the findings are the output, for tools/check_more.py rule 38, and the rest goes to stderr)
if (opt.rules) console.log = console.error;
const say = (...a) => console.log(...a);
globalThis.__keepArrays = true;
fakeBrowser(opt.maps);
// (--query is more of the address, as the game would have it: ground=cdt for the triangulated ground)
if (opt.query) globalThis.location.search = "?" + opt.query;
const G = await bundleGame(`
export { GameMap, loadMap, tileKey } from "./map";
export { readSquare } from "./sfpack";
export { maskSetPieces } from "./landmarks/setpieces";
export { clearCourt } from "./bonfire";
export { clearClimb } from "./theclimb";
export { buildWorld } from "./world";
export { Tiles } from "./tiles";
export * as THREE from "three";
`, opt.src);
const { THREE } = G;
const quietWarn = console.warn;
console.warn = (...a) => { if (!String(a[0]).startsWith("ground sheet:")) quietWarn(...a); };

const index = JSON.parse(fs.readFileSync(path.join(opt.maps, opt.map, "tiles.json"), "utf8"));
const core = await G.loadMap(`maps/${opt.map}.json`, `maps/${opt.map}-wide.json`, `maps/${opt.map}/`);
let tiles = null;
const hold = G.Tiles.prototype.hold;
G.Tiles.prototype.hold = function (...a) { tiles = this; return hold.apply(this, a); };
const world = G.buildWorld(core);
world.hold(0, 0, 1);
if (!tiles) throw new Error("couldn't reach the squares' builder");

const WELD = 0.0005, TEE = 0.0005, SIDE = 0.01;
const TOP = new Set(["ground", "roads"]), CLOSE = new Set(["ground", "roads", "walls-fences"]);

async function square(ti, tj) {
  const f = path.join(opt.maps, opt.map, `${ti}_${tj}.json`);
  if (!fs.existsSync(f)) return null;
  const d = await G.readSquare(new Uint8Array(fs.readFileSync(f)));
  core.cable?.clear(d);
  G.maskSetPieces(d);
  G.clearCourt(d);
  G.clearClimb(core, d);
  const m = new G.GameMap(d, null, true);
  while (m.setup && !m.setup.next().done);
  m.setup = null;
  m.canal = core.canal;
  const k = G.tileKey(ti, tj);
  core.addTile(k, m);
  const group = new THREE.Group();
  const job = tiles.build(m, group);
  let r;
  const t0 = performance.now(), slices = {};
  do {
    const ph = globalThis.__wphase || "?", s0 = performance.now();
    r = job.next();
    const sm = performance.now() - s0;
    if (!(sm <= (slices[ph] ?? 0))) slices[ph] = +sm.toFixed(1);
  } while (!r.done);
  const ms = performance.now() - t0;
  group.updateMatrixWorld(true);
  const out = { d, m, group, ms, slices, done: () => { r.value.dispose?.(); core.dropTile(k); } };
  return out;
}

function seams(d, group) {
  const T = d.t, X0 = T.x0, Y0 = T.y0, X1 = T.x0 + (T.nx - 1) * T.dx, Y1 = T.y0 + (T.ny - 1) * T.dy;
  // corners welded within WELD: each point's cell, and the cells round it, looked through
  const cells = new Map(), px = [], py = [], pz = [];
  const weld = (x, y, z) => {
    const i = Math.round(x / WELD), j = Math.round(y / WELD), k = Math.round(z / WELD);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const l = cells.get(`${i + a},${j + b},${k + c}`);
      if (l) for (const n of l) if (Math.abs(px[n] - x) <= WELD && Math.abs(py[n] - y) <= WELD && Math.abs(pz[n] - z) <= WELD) return n;
    }
    const n = px.length;
    px.push(x); py.push(y); pz.push(z);
    const key = `${i},${j},${k}`;
    (cells.get(key) ?? cells.set(key, []).get(key)).push(n);
    return n;
  };
  const uses = new Map(), checked = new Map(), tops = [];
  const ek = (a, b) => a < b ? `${a},${b}` : `${b},${a}`;
  const v = new THREE.Vector3();
  group.traverse((o) => {
    let top = o;
    while (top.parent && top.parent !== group) top = top.parent;
    const name = top.name || o.name;
    if (!o.geometry || o.isInstancedMesh || !CLOSE.has(name)) return;
    const g = o.geometry, P = g.attributes.position;
    if (!P?.array) return;
    const n = g.index ? g.index.count : P.count;
    const id = new Int32Array(P.count);
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); id[i] = weld(v.x, -v.z, v.y); }
    const at = (k) => g.index ? g.index.array[k] : k;
    for (let k = 0; k + 2 < n; k += 3) {
      const a = id[at(k)], b = id[at(k + 1)], c = id[at(k + 2)];
      if (a === b || b === c || a === c) continue;
      // a top: a triangle of the ground or of a face's top, not a kerb, a wall or a side
      const ux = px[b] - px[a], uy = py[b] - py[a], uz = pz[b] - pz[a], wx = px[c] - px[a], wy = py[c] - py[a], wz = pz[c] - pz[a];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, len = Math.hypot(nx, ny, nz);
      const isTop = TOP.has(name) && len > 1e-12 && Math.abs(nz) > 0.05 * len;
      if (isTop) tops.push(a, b, c);
      for (const [p, q, r] of [[a, b, c], [b, c, a], [c, a, b]]) {
        const e = ek(p, q);
        uses.set(e, (uses.get(e) ?? 0) + 1);
        if (isTop) checked.set(e, [p, q, r]);
      }
    }
  });
  const onSide = (p, q) => (Math.abs(px[p] - X0) < SIDE && Math.abs(px[q] - X0) < SIDE) || (Math.abs(px[p] - X1) < SIDE && Math.abs(px[q] - X1) < SIDE)
    || (Math.abs(py[p] - Y0) < SIDE && Math.abs(py[q] - Y0) < SIDE) || (Math.abs(py[p] - Y1) < SIDE && Math.abs(py[q] - Y1) < SIDE)
    || px[p] < X0 - SIDE || px[p] > X1 + SIDE || py[p] < Y0 - SIDE || py[p] > Y1 + SIDE
    || px[q] < X0 - SIDE || px[q] > X1 + SIDE || py[q] < Y0 - SIDE || py[q] > Y1 + SIDE;
  // every edge, by the 2 m cells it passes, to find what lies along an open one
  const CELL = 2, byCell = new Map();
  const cellsOf = (p, q, f) => {
    const i0 = Math.floor(Math.min(px[p], px[q]) / CELL), i1 = Math.floor(Math.max(px[p], px[q]) / CELL);
    const j0 = Math.floor(Math.min(py[p], py[q]) / CELL), j1 = Math.floor(Math.max(py[p], py[q]) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) f(`${i},${j}`);
  };
  const ends = [];
  for (const e of uses.keys()) {
    const [p, q] = e.split(",").map(Number), n = ends.length;
    ends.push([p, q]);
    cellsOf(p, q, (c) => (byCell.get(c) ?? byCell.set(c, []).get(c)).push(n));
  }
  // an open edge is a tee if other edges lying along its line cover the whole of it
  const along = (a, b) => {
    const ex = px[b] - px[a], ey = py[b] - py[a], ez = pz[b] - pz[a], l2 = ex * ex + ey * ey + ez * ez;
    if (l2 < 1e-12) return true;
    const L = Math.sqrt(l2);
    const tOf = (n) => ((px[n] - px[a]) * ex + (py[n] - py[a]) * ey + (pz[n] - pz[a]) * ez) / l2;
    const off = (n) => { const t = tOf(n); return Math.hypot(px[a] + ex * t - px[n], py[a] + ey * t - py[n], pz[a] + ez * t - pz[n]); };
    const lineOff = (p, q, n) => {
      const fx = px[q] - px[p], fy = py[q] - py[p], fz = pz[q] - pz[p], m2 = fx * fx + fy * fy + fz * fz || 1e-12;
      const t = ((px[n] - px[p]) * fx + (py[n] - py[p]) * fy + (pz[n] - pz[p]) * fz) / m2;
      return Math.hypot(px[p] + fx * t - px[n], py[p] + fy * t - py[n], pz[p] + fz * t - pz[n]);
    };
    const spans = [], seen = new Set();
    cellsOf(a, b, (c) => { for (const n of byCell.get(c) ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      const [p, q] = ends[n];
      if ((p === a && q === b) || (p === b && q === a)) continue;
      // (measured from the longer of the two lines: a short edge's direction is only as good as its corners)
      if ((off(p) > TEE || off(q) > TEE) && (lineOff(p, q, a) > TEE || lineOff(p, q, b) > TEE)) continue;
      const tp = tOf(p), tq = tOf(q);
      if (Math.max(tp, tq) > 0 && Math.min(tp, tq) < 1) spans.push([Math.min(tp, tq), Math.max(tp, tq)]);
    } });
    spans.sort((u, w) => u[0] - w[0]);
    let reach = 0;
    const slack = TEE / L;
    for (const [u, w] of spans) { if (u > reach + slack) return false; reach = Math.max(reach, w); }
    return reach >= 1 - slack;
  };
  // the tops by the cells they cover, to tell an edge with more ground or a face just across it
  const topCell = new Map();
  for (let n = 0; n < tops.length; n += 3) {
    const a = tops[n], b = tops[n + 1], c = tops[n + 2];
    const i0 = Math.floor(Math.min(px[a], px[b], px[c]) / CELL), i1 = Math.floor(Math.max(px[a], px[b], px[c]) / CELL);
    const j0 = Math.floor(Math.min(py[a], py[b], py[c]) / CELL), j1 = Math.floor(Math.max(py[a], py[b], py[c]) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) (topCell.get(`${i},${j}`) ?? topCell.set(`${i},${j}`, []).get(`${i},${j}`)).push(n);
  }
  const covered = (x, y) => {
    for (const n of topCell.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? []) {
      const a = tops[n], b = tops[n + 1], c = tops[n + 2];
      const d1 = (px[b] - px[a]) * (y - py[a]) - (py[b] - py[a]) * (x - px[a]);
      const d2 = (px[c] - px[b]) * (y - py[b]) - (py[c] - py[b]) * (x - px[b]);
      const d3 = (px[a] - px[c]) * (y - py[c]) - (py[a] - py[c]) * (x - px[c]);
      if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) return true;
    }
    return false;
  };
  // a millimetre across the edge from its triangle, at a quarter, half and three quarters along
  const across = (p, q, r) => {
    const ex = px[q] - px[p], ey = py[q] - py[p], l = Math.hypot(ex, ey);
    if (l < 1e-9) return true;
    let nx = -ey / l, ny = ex / l;
    if (nx * (px[r] - px[p]) + ny * (py[r] - py[p]) > 0) { nx = -nx; ny = -ny; }
    return [0.25, 0.5, 0.75].every((t) => covered(px[p] + ex * t + nx * 0.001, py[p] + ey * t + ny * 0.001));
  };
  let open = 0, tee = 0, under = 0, folds = 0;
  const gaps = [];
  for (const [e, [p, q, r]] of checked) {
    const n = uses.get(e);
    if (n > 2) folds++;
    if (n !== 1 || onSide(p, q)) continue;
    open++;
    if (along(p, q)) { tee++; continue; }
    if (across(p, q, r)) { under++; continue; }
    gaps.push([(px[p] + px[q]) / 2, (py[p] + py[q]) / 2, Math.hypot(px[q] - px[p], py[q] - py[p])]);
  }
  return { open, tee, under, gap: gaps.length, folds, gaps };
}

// Rule 44: does every wall, fence and hedge stand down on what is drawn under it? Each foot edge of
// their sides (an edge of an upright triangle lying below its third corner) is looked at every 0.25 m
// along: the highest top of the ground or a face under that point (no higher than a metre over the
// foot, so a deck overhead isn't taken for it) is found, and where the foot stands more than FOOT_GAP
// over it, the sky shows through under the wall. Each place is a run of such points, scored by its
// length in metres.
const FOOT_GAP = 0.05;
function wallFeet(group) {
  const CELL = 2, tops = [], cell = new Map(), v = new THREE.Vector3();
  const tri = (name, f) => group.traverse((o) => {
    let top = o;
    while (top.parent && top.parent !== group) top = top.parent;
    if ((top.name || o.name) !== name || !o.geometry || o.isInstancedMesh) return;
    const g = o.geometry, P = g.attributes.position;
    if (!P?.array) return;
    const n = g.index ? g.index.count : P.count, at = (k) => g.index ? g.index.array[k] : k, c = [];
    for (let k = 0; k + 2 < n; k += 3) {
      for (let m = 0; m < 3; m++) { v.fromBufferAttribute(P, at(k + m)).applyMatrix4(o.matrixWorld); c[m] = [v.x, -v.z, v.y]; }
      f(c[0], c[1], c[2]);
    }
  });
  const normalZ = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz);
    return l > 1e-12 ? Math.abs(nz) / l : 0;
  };
  for (const name of ["ground", "roads"]) tri(name, (a, b, c) => {
    if (normalZ(a, b, c) < 0.05) return;
    const n = tops.length;
    tops.push([a, b, c]);
    const i0 = Math.floor(Math.min(a[0], b[0], c[0]) / CELL), i1 = Math.floor(Math.max(a[0], b[0], c[0]) / CELL);
    const j0 = Math.floor(Math.min(a[1], b[1], c[1]) / CELL), j1 = Math.floor(Math.max(a[1], b[1], c[1]) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) (cell.get(`${i},${j}`) ?? cell.set(`${i},${j}`, []).get(`${i},${j}`)).push(n);
  });
  const under = (x, y, foot) => {
    let best = -Infinity;
    for (const n of cell.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? []) {
      const [a, b, c] = tops[n];
      const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const z = l1 * a[2] + l2 * b[2] + l3 * c[2];
      if (z <= foot + 1.0 && z > best) best = z;
    }
    return best;
  };
  // the upright faces (walls, kerbs, retaining walls), to tell a foot with a wall below it that closes the gap
  const sides = [], sideCell = new Map();
  for (const name of ["walls-fences", "roads", "ground"]) tri(name, (a, b, c) => {
    if (normalZ(a, b, c) > 0.2) return;
    const n = sides.length;
    sides.push([a, b, c]);
    const i0 = Math.floor(Math.min(a[0], b[0], c[0]) / CELL), i1 = Math.floor(Math.max(a[0], b[0], c[0]) / CELL);
    const j0 = Math.floor(Math.min(a[1], b[1], c[1]) / CELL), j1 = Math.floor(Math.max(a[1], b[1], c[1]) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) (sideCell.get(`${i},${j}`) ?? sideCell.set(`${i},${j}`, []).get(`${i},${j}`)).push(n);
  });
  const segDist = (x, y, p, q) => {
    const ex = q[0] - p[0], ey = q[1] - p[1], l2 = ex * ex + ey * ey;
    const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((x - p[0]) * ex + (y - p[1]) * ey) / l2)) : 0;
    return Math.hypot(p[0] + ex * t - x, p[1] + ey * t - y);
  };
  const closed = (x, y, z, foot) => {
    for (const n of sideCell.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? []) {
      const [a, b, c] = sides[n];
      if (Math.min(a[2], b[2], c[2]) > z + FOOT_GAP || Math.max(a[2], b[2], c[2]) < (z + foot) / 2) continue;
      if (Math.min(segDist(x, y, a, b), segDist(x, y, b, c), segDist(x, y, c, a)) <= 0.15) return true;
    }
    return false;
  };
  // a side's foot corners: the lowest of the corners standing one over another (a quad's diagonal
  // runs from a foot to a top, so it is no foot edge)
  const column = new Map(), colKey = (p) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
  tri("walls-fences", (a, b, c) => {
    if (normalZ(a, b, c) > 0.2) return;
    for (const p of [a, b, c]) { const k = colKey(p), o = column.get(k); column.set(k, o ? [Math.min(o[0], p[2]), Math.max(o[1], p[2])] : [p[2], p[2]]); }
  });
  const isFoot = (p) => { const o = column.get(colKey(p)); return o && o[1] - o[0] > 0.2 && p[2] - o[0] < 0.01; };
  const gaps = new Map();
  tri("walls-fences", (a, b, c) => {
    if (normalZ(a, b, c) > 0.2) return;
    for (const [p, q, r] of [[a, b, c], [b, c, a], [c, a, b]]) {
      if (Math.max(p[2], q[2]) > r[2] - 0.2 || !isFoot(p) || !isFoot(q)) continue;
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (L < 0.05) continue;
      const k = Math.max(1, Math.round(L / 0.25));
      for (let s = 0; s <= k; s++) {
        const t = s / k, x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t, foot = p[2] + (q[2] - p[2]) * t;
        const z = under(x, y, foot);
        if (!(z > -Infinity) || foot - z <= FOOT_GAP || closed(x, y, z, foot)) continue;
        // (gathered in half-metre cells, each with its worst gap)
        const key = `${Math.round(x * 2)},${Math.round(y * 2)}`, o = gaps.get(key);
        if (!o || o[2] < foot - z) gaps.set(key, [x, y, foot - z]);
      }
    }
  });
  // runs of neighbouring cells, each a place
  const left = new Map(gaps), places = [];
  for (const [key, g] of gaps) {
    if (!left.has(key)) continue;
    left.delete(key);
    const todo = [key], run = [g];
    while (todo.length) {
      const [i, j] = todo.pop().split(",").map(Number);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const kk = `${i + a},${j + b}`, o = left.get(kk);
        if (!o) continue;
        left.delete(kk); todo.push(kk); run.push(o);
      }
    }
    const worst = run.reduce((w, o) => (o[2] > w[2] ? o : w));
    places.push([worst[0], worst[1], run.length * 0.5, worst[2]]);
  }
  return places;
}

// Rule 45: no street face of the map's left inside a set piece's outline, as the game leaves them
// (landmarks/setpieces.ts: the faces it lays its own ground over are taken out as the square is built,
// so this reads the square's faces after the build). Each outline's part in the square is a place,
// scored by the faces' area in m2, those whose middle is inside it.
const FACE_KINDS = ["road", "service", "pave", "path", "front", "drive", "grass", "dirt", "gravel"];
function setPieceFaces(d) {
  const sf = d.sf, out = [];
  if (!sf || !d.so?.length) return out;
  const V = sf.v, [bx0, by0, bx1, by1] = d.b;
  const inRing = (ring, x, y) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  for (const ring of d.so) {
    const area = {};
    let sx = 0, sy = 0, n = 0;
    for (const kind of FACE_KINDS) {
      const I = sf[kind] ?? [];
      for (let k = 0; k + 2 < I.length; k += 3) {
        const a = 3 * I[k], b = 3 * I[k + 1], c = 3 * I[k + 2];
        const x = (V[a] + V[b] + V[c]) / 3, y = (V[a + 1] + V[b + 1] + V[c + 1]) / 3;
        if (x < bx0 || x >= bx1 || y < by0 || y >= by1 || !inRing(ring, x, y)) continue;
        area[kind] = (area[kind] ?? 0) + Math.abs((V[b] - V[a]) * (V[c + 1] - V[a + 1]) - (V[b + 1] - V[a + 1]) * (V[c] - V[a])) / 2;
        sx += x; sy += y; n++;
      }
    }
    const total = Object.values(area).reduce((t, v) => t + v, 0);
    if (total >= 1) out.push([sx / n, sy / n, total, Object.entries(area).sort((p, q) => q[1] - p[1]).map(([k, v]) => `${k} ${v.toFixed(0)} m2`).join(", ")]);
  }
  return out;
}

// Rule 46: a set piece's floor at the street's level (a pavement on a river wall, a deck, a terrace)
// runs on to what stands beyond its edge, not stopping short of it with a hole between. From each edge
// of its surfaces (a half-metre square of its grid with none of its surface at that level next to
// it), walk straight out at the floor's level as the game would let you (map.ts collide): where the
// floor falls away more than a metre and then, within GAP_REACH, a wall stops you or a floor comes
// back up to the level, there is a gap you could drop into between the two. A balustrade along the
// edge stops you before the drop, and an edge with nothing near beyond it is meant. Each place's
// score is the gap's width in metres.
const GAP_REACH = 4.5, GAP_STEP = 0.25, GAP_FALL = 1.0, GAP_LEVEL = 1.5, GAP_STEP_UP = 0.6;
function floorGaps(d, m) {
  const out = [], [bx0, by0, bx1, by1] = d.b;
  const SUB = 4, STEP = 0.5, OFF = 32768, TOPN = 6;
  for (const p of m.pieces ?? []) {
    const { sh, c, s, y0 } = p;
    const at = (lx, lz) => [p.x + c * lx + s * lz, p.y + s * lx - c * lz];
    const levels = (i, j) => {
      const L = sh.tops.get(i + OFF + (j + OFF) * 65536);
      const hs = [];
      if (L) for (let n = 0; n < L.length; n += TOPN) hs.push(y0 + L[n]);
      return hs;
    };
    for (const [key, L] of sh.tops) {
      const i = (key % 65536) - OFF, j = Math.floor(key / 65536) - OFF;
      const [x, y] = at((i + 0.5) * STEP, (j + 0.5) * STEP);
      if (x < bx0 || x >= bx1 || y < by0 || y >= by1) continue;
      for (let n = 0; n < L.length; n += TOPN) {
        if (L[n + 1] !== (1 << (SUB * SUB)) - 1) continue;
        const h = y0 + L[n];
        // (only a floor at the level of the ground or the street beside it: not a roof)
        if (Math.abs(h - core.ground(x, -y)) > GAP_LEVEL && Math.abs(h - m.ground(x, -y)) > GAP_LEVEL) continue;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (levels(i + di, j + dj).some((q) => Math.abs(q - h) < GAP_STEP_UP)) continue;
          const [ex, ey] = at((i + 0.5 + di) * STEP, (j + 0.5 + dj) * STEP);
          const ux = (ex - x) / STEP, uy = (ey - y) / STEP;
          const pos = { x, z: -y };
          let fell = -1, gap = 0;
          for (let t = GAP_STEP; t <= GAP_REACH + 1e-6; t += GAP_STEP) {
            const want = { x: x + ux * t, z: -(y + uy * t) };
            core.sweep({ x: pos.x, z: pos.z }, want, h, 0.2);
            const moved = Math.hypot(want.x - (x + ux * t), want.z + (y + uy * t));
            pos.x = want.x; pos.z = want.z;
            if (moved > 0.05) { if (fell >= 0) gap = t - GAP_STEP - fell; break; }
            const f = core.floor(pos.x, pos.z, h + 0.3);
            if (fell < 0 && f < h - GAP_FALL) fell = t;
            else if (fell >= 0 && f >= h - GAP_STEP_UP) { gap = t - fell; break; }
          }
          if (gap >= 0.25) out.push([(x + ex) / 2, (y + ey) / 2, gap]);
        }
      }
    }
  }
  // each run of edges along one gap a place
  const places = [];
  for (const [x, y, g] of out.sort((a, b) => a[0] - b[0])) {
    const q = places.find((q) => Math.hypot(q[0] - x, q[1] - y) < 1.5);
    if (q) { q[0] = x; q[1] = y; q[2] = Math.max(q[2], g); q[3]++; }
    else places.push([x, y, g, 1]);
  }
  return places;
}

// --heights: does the height you stand at (the map's ground) match the drawn ground, at the middle of
// each ground triangle? Counts those where you'd stand more than a centimetre below it (sunk in), and
// the worst, and those more than a centimetre above it (on a face or a deck over it, or out).
function heights(group) {
  let n = 0, off = 0, worst = 0, above = 0;
  const at = [];
  const v = new THREE.Vector3();
  group.traverse((o) => {
    let top = o;
    while (top.parent && top.parent !== group) top = top.parent;
    if ((top.name || o.name) !== "ground" || !o.geometry || o.isInstancedMesh || !o.geometry.index) return;
    const P = o.geometry.attributes.position, I = o.geometry.index.array;
    for (let k = 0; k + 2 < I.length; k += 3) {
      let x = 0, y = 0, z = 0;
      for (let m = 0; m < 3; m++) { v.fromBufferAttribute(P, I[k + m]).applyMatrix4(o.matrixWorld); x += v.x / 3; y += v.y / 3; z += v.z / 3; }
      const g = core.ground(x, z);
      if (!Number.isFinite(g)) continue;
      n++;
      if (g - y < -0.01) { off++; worst = Math.max(worst, y - g); if (at.length < 40) at.push([+x.toFixed(2), +(-z).toFixed(2), +(y - g).toFixed(3)]); }
      else if (g - y > 0.01) above++;
    }
  });
  return { sampled: n, standOff: off, standWorst: +worst.toFixed(3), standAbove: above, standAt: at };
}

let squares = index.tiles.map(([i, j]) => [i, j]);
if (opt.squares) squares = opt.squares.trim().split(/\s+/).map((s) => s.split(",").map(Number));
const report = {}, most = Number(opt.most) || 0, t0 = Date.now();
let total = { open: 0, tee: 0, under: 0, gap: 0, folds: 0 }, bad = 0;
const findings = [];
for (const [ti, tj] of squares) {
  globalThis.__sheetMs = [];
  const s = await square(ti, tj);
  if (!s) continue;
  const r = seams(s.d, s.group);
  // the triangles of the ground and of the faces (with their kerbs), as drawn
  const tris = {};
  s.group.traverse((o) => {
    let top = o;
    while (top.parent && top.parent !== s.group) top = top.parent;
    const name = top.name || o.name;
    if (!o.geometry || o.isInstancedMesh || !["ground", "roads"].includes(name)) return;
    const g = o.geometry, n = g.index ? g.index.count : g.attributes.position?.count ?? 0;
    tris[name] = (tris[name] ?? 0) + n / 3;
  });
  if (opt.heights) Object.assign(r, heights(s.group));
  const feet = opt.rules || opt.feet ? wallFeet(s.group) : [];
  const inPieces = opt.rules ? setPieceFaces(s.d) : [];
  const floorHoles = opt.rules || opt.gaps ? floorGaps(s.d, s.m) : [];
  s.done();
  for (const k of Object.keys(total)) total[k] += r[k];
  if (r.gap) bad++;
  for (const [x, y, g, n] of floorHoles) findings.push({ rule: "46 set piece's floor stops short of what stands beyond it", score: +g.toFixed(2), x, y, what: `a gap ${g.toFixed(1)} m wide to drop into, along ${(n * 0.5).toFixed(1)} m of its edge` });
  if (opt.gaps) for (const [x, y, g, n] of floorHoles) say(`    floor gap ${g.toFixed(2)} m along ${n} edges at ${x.toFixed(1)},${y.toFixed(1)}`);
  for (const [x, y, a, what] of inPieces) findings.push({ rule: "45 street faces inside a set piece", score: +a.toFixed(1), x, y, what });
  for (const [x, y, l, gap] of feet) if (l >= 0.5) findings.push({ rule: "44 wall's foot over the ground", score: +l.toFixed(1), x, y, what: `${l.toFixed(1)} m of a wall, fence or hedge standing up to ${gap.toFixed(2)} m over what is drawn under it: the sky shows through` });
  for (const [x, y, l] of opt.rules ? r.gaps : []) findings.push({ rule: "38 crack in the ground", score: +l.toFixed(3), x, y, what: `the ground and a face, or two faces, apart along an edge ${l.toFixed(2)} m long: the sky shows through` });
  report[`${ti},${tj}`] = { open: r.open, tee: r.tee, under: r.under, gap: r.gap, folds: r.folds, gaps: r.gaps.slice(0, 200).map(([x, y, l]) => [+x.toFixed(2), +y.toFixed(2), +l.toFixed(3)]) };
  const sheetMs = (globalThis.__sheetMs ?? []).reduce((t, q) => t + q.ms, 0), lost = (globalThis.__sheetMs ?? []).reduce((t, q) => t + q.lost, 0);
  if (opt.heights) say(`${ti},${tj}: ${r.standOff} of ${r.sampled} ground triangles' middles stood you sunk in, the worst ${r.standWorst} m; ${r.standAbove} over it`);
  Object.assign(report[`${ti},${tj}`], { standOff: r.standOff, standWorst: r.standWorst, standAbove: r.standAbove, standAt: r.standAt, tris, buildMs: Math.round(s.ms), sheetMs: +sheetMs.toFixed(1), lost });
  report[`${ti},${tj}`].slices = s.slices;
  if (opt.slices) say(`${ti},${tj}: longest slice in each part: ${Object.entries(s.slices).sort((p, q) => q[1] - p[1]).slice(0, 8).map(([k, v]) => `${k} ${v} ms`).join(", ")}`);
  say(`${ti},${tj}: ground ${tris.ground ?? 0} roads ${tris.roads ?? 0} triangles; built in ${s.ms.toFixed(0)} ms, the sheet ${sheetMs.toFixed(1)} ms${lost ? `, ${lost} free edges not held` : ""}`);
  say(`${ti},${tj}: ${r.open} open edges, ${r.tee} tees, ${r.under} overlapped, ${r.gap} gaps, ${r.folds} edges three or more triangles share`);
  for (const [x, y] of r.gaps.slice(0, most)) say(`    gap at ${x.toFixed(2)},${y.toFixed(2)}  ?at=${x.toFixed(1)},${(y - 6).toFixed(1)},0,-35`);
}
say(`${opt.map}: ${Object.keys(report).length} squares, ${total.open} open edges, ${total.tee} tees, ${total.under} overlapped, ${total.gap} gaps (${bad} squares with gaps), ${total.folds} shared by three or more, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (opt.json) fs.writeFileSync(opt.json, JSON.stringify({ total, squares: report }, null, 1));
// (exit only once the findings are written: a pipe takes a large write in pieces)
if (opt.rules) process.stdout.write(JSON.stringify(findings), () => process.exit(0));
else process.exit(bad ? 1 : 0);
