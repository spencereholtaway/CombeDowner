// The ground of ?ground=cdt (web/src/sheet.ts buildSheetCdt), triangulated by the game's own code, for
// tools/check_more.py to measure with CD_GROUND=cdt: each square's open-ground triangles as data x, y
// (heights are the checks' own, as for the cut cells of the sheet), and the cells triangulated.
//
//   node tools/sheet_cdt.mjs --maps web/public/maps --map combe-down --squares "0,3 1,1"
import fs from "fs";
import path from "path";
import { fakeBrowser, bundleGame } from "./node_game.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const argv = process.argv.slice(2), opt = { maps: path.join(here, "..", "web", "public", "maps"), map: "combe-down", squares: "" };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
console.log = console.error;
fakeBrowser(opt.maps);
const G = await bundleGame(`export { readSquare } from "./sfpack";\nexport * from "./sheet";`);
// (world.ts FACE_LIFT: only the heights depend on it, and those aren't written)
const LIFT = [0.07, 0.07, 0.17, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0];
const out = {};
for (const sq of opt.squares.trim().split(/\s+/)) {
  const tag = sq.replace(",", "_"), f = path.join(opt.maps, opt.map, `${tag}.json`);
  if (!fs.existsSync(f)) continue;
  const d = await G.readSquare(new Uint8Array(fs.readFileSync(f)));
  if (!d.sf?.l || !d.gs || !d.t) continue;
  const T = d.t, grid = { x0: T.x0, y0: T.y0, dx: T.dx, dy: T.dy, nx: T.nx, ny: T.ny }, NG = T.nx * T.ny;
  const meet = G.sheetFaces(d.sf, d.gs, d.b, 0, LIFT, grid, false);
  const S = G.buildSheetCdt(grid, () => 0, G.coveredCells(d.gs.c, (T.nx - 1) * (T.ny - 1)), meet.edges, meet.faceTop, 0.3, d.gs.x);
  const X = (k) => k >= NG ? S.px[k - NG] : T.x0 + (k % T.nx) * T.dx, Y = (k) => k >= NG ? S.py[k - NG] : T.y0 + Math.floor(k / T.nx) * T.dy;
  const tris = [];
  for (const k of S.tri) tris.push(+X(k).toFixed(6), +Y(k).toFixed(6));
  const cells = [];
  S.state.forEach((s, c) => { if (s === 2) cells.push(c); });
  out[tag] = { tris, cells };
}
process.stdout.write(JSON.stringify(out), () => process.exit(0));
