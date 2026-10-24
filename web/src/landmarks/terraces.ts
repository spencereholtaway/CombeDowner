// Georgian terraced streets rebuilt by hand, as set pieces (landmarks/setpieces.ts), in place of
// the plain terraces the map tools build along them. The set piece takes the terraces it hides
// along its street, joins them into blocks between the side streets and builds each one along its
// measured front at its measured height, with the wings behind it as they were, so it fits the
// street, its pavements and the side streets exactly. (It works from the buildings in the square
// it's drawn in, so its street must lie in one square of Bath.) Two styles:
//
// Great Pulteney Street (style 0): Thomas Baldwin's street of about 1789, a hundred feet wide and
// a third of a mile long, from Laura Place to the Holburne Museum (holburne.ts), its fronts on both
// sides designed as one, as the listings describe them:
// - a ground floor of channelled rustication, with the front doors under their fanlights and the
//   iron railings round the basement areas;
// - two floors above it, tall windows with cornices over them on the first floor, under a
//   modillion cornice, then an attic storey and slate mansards with dormers and chimney stacks;
// - each block broken by pavilions stepped forward at its ends and, on the long blocks, in the
//   middle, with fluted Corinthian pilasters running up through the upper floors, and a pediment
//   over the middle one.
//
// Argyle Street (style 1): Baldwin's shopping street from Pulteney Bridge to Laura Place: a
// shopfront to every house, each with its name over the window (the names of the shops there now,
// as the map has them), plain ashlar above with a cornice, parapet and mansard.
//
// Its frame: x along the street, z across it, y up from the street's level at the set piece's
// origin. Solid as it's drawn (landmarks/shape.ts): you can stand on the roofs.
//
// args (after kind, x, y, height, angle): the style; the number of blocks, then each block's side
// (-1 the side towards -z, 1 the other), x from and to, its front's z and its back's z, its street
// level and the top of its parapet; the number of wings, and each wing's x from and to, z from and
// to, and its top; then the number of shop names, and each one's side, x and name.
import * as THREE from "three";
import { Kit, stone, georgian, plain, slate, sashGlass, archedGlass, rustic, glow } from "./kit";
import type { PlaceCtx } from "./setpieces";
import { shopTex, signs, FRAMES } from "./pulteney";
import * as TX from "../textures";

interface Block { side: number; x0: number; x1: number; zf: number; zb: number; y0: number; top: number }
interface Wing { x0: number; x1: number; z0: number; z1: number; top: number }
interface Name { side: number; x: number; name: string }

const BAY = 2.45;           // a window's bay along the front

/** The args for a terraced street along the road called road: the terraces the set piece hid
 *  joined into blocks between the side streets, each side of the street. pave: from and to (x),
 *  where the set piece lays a level street from front to front, over ground the map has falling
 *  away from it (Argyle Street, which really runs on vaults). */
export function terraceArgs(road: string, style: number, pave?: [number, number]) {
  return (c: PlaceCtx, height: number): (number | string)[] => {
    // the street's level along it, from its own points
    const pts: number[][] = [];
    for (const r of c.d.rd) if (r.n === road) for (const q of r.p) pts.push([...c.local(q[0], q[1]), q[2]]);
    const levelAt = (x: number) => {
      const near = pts.filter((q) => Math.abs(q[0] - x) < 30 && Math.abs(q[1]) < 20);
      return near.length ? near.reduce((a, q) => a + q[2], 0) / near.length - height : 0;
    };
    // the street's middle, which side of it a building is on
    const mid = (x: number) => {
      const near = pts.filter((q) => Math.abs(q[0] - x) < 30 && Math.abs(q[1]) < 20);
      return near.length ? near.reduce((a, q) => a + q[1], 0) / near.length : 0;
    };
    const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
    const blocks: Block[] = [], wings: Wing[] = [], names: Name[] = [];
    for (const side of [-1, 1]) {
      const mine = c.hidden.filter((h) => Math.sign(h.z - mid(h.x)) === side);
      for (const h of mine) if (h.name) names.push({ side, x: h.x, name: h.name });
      const list = mine.filter((h) => h.top - h.ground > 5).sort((a, b) => a.box[0] - b.box[0]);
      const runs: (typeof list)[] = [];
      for (const h of list) {
        const run = runs[runs.length - 1];
        if (run && h.box[0] <= Math.max(...run.map((r) => r.box[1])) + 2.5) run.push(h); else runs.push([h]);
      }
      for (const run of runs) {
        const x0 = Math.min(...run.map((h) => h.box[0])), x1 = Math.max(...run.map((h) => h.box[1]));
        if (x1 - x0 < 10) continue;
        // the front: where most of the frontage is (each building counted by its width)
        const fronts: number[] = [], backs: number[] = [];
        for (const h of run) for (let k = 0; k < Math.max(1, Math.round(h.box[1] - h.box[0])); k++) {
          fronts.push(side < 0 ? h.box[3] : h.box[2]); backs.push(side < 0 ? h.box[2] : h.box[3]);
        }
        const zf = median(fronts), depth = Math.min(16, Math.max(9, Math.abs(median(backs) - zf))), zb = zf + side * depth;
        const y0 = levelAt((x0 + x1) / 2), top = Math.max(y0 + 10, median(run.map((h) => h.top)) - height);
        blocks.push({ side, x0, x1, zf, zb, y0, top });
        // anything reaching further back than the block, as a wing behind it
        for (const h of run) {
          const back = side < 0 ? h.box[2] : h.box[3];
          if ((back - zb) * side > 2) wings.push({ x0: h.box[0], x1: h.box[1], z0: Math.min(zb, back), z1: Math.max(zb, back), top: Math.max(y0 + 4, h.top - height) });
        }
      }
    }
    const r = (v: number) => Math.round(v * 10) / 10;
    // the level street: from the fronts nearest it either side, along the stretch asked for
    let paved: number[] = [0];
    if (pave) {
      const over = (b: Block) => b.x1 > pave[0] && b.x0 < pave[1];
      const zN = Math.max(...blocks.filter((b) => b.side < 0 && over(b)).map((b) => b.zf)), zS = Math.min(...blocks.filter((b) => b.side > 0 && over(b)).map((b) => b.zf));
      // level with the crown of the street (the ground under it is highest along its middle)
      const crown = Math.max(...pts.filter((q) => q[0] > pave[0] - 2 && q[0] < pave[1] + 2 && Math.abs(q[1]) < 10).map((q) => q[2])) - height + 0.1;
      if (Number.isFinite(zN) && Number.isFinite(zS) && zS > zN && Number.isFinite(crown)) paved = [1, pave[0], pave[1], r(zN), r(zS), r(crown), r(crown)];
    }
    return [style, blocks.length, ...blocks.flatMap((b) => [b.side, r(b.x0), r(b.x1), r(b.zf), r(b.zb), r(b.y0), r(b.top)]),
      wings.length, ...wings.flatMap((w) => [r(w.x0), r(w.x1), r(w.z0), r(w.z1), r(w.top)]),
      names.length, ...names.flatMap((n) => [n.side, r(n.x), n.name]), ...paved];
  };
}

function plan(args: (number | string)[]) {
  const blocks: Block[] = [], wings: Wing[] = [], names: Name[] = [];
  const a = args.map(Number);
  let k = 0;
  const style = a[k++] || 0, nb = a[k++] || 0;
  for (let i = 0; i < nb; i++, k += 7) blocks.push({ side: a[k], x0: a[k + 1], x1: a[k + 2], zf: a[k + 3], zb: a[k + 4], y0: a[k + 5], top: a[k + 6] });
  const nw = a[k++] || 0;
  for (let i = 0; i < nw; i++, k += 5) wings.push({ x0: a[k], x1: a[k + 1], z0: a[k + 2], z1: a[k + 3], top: a[k + 4] });
  const nn = a[k++] || 0;
  for (let i = 0; i < nn; i++, k += 3) names.push({ side: a[k], x: a[k + 1], name: String(args[k + 2]) });
  const pave = a[k] === 1 ? { x0: a[k + 1], x1: a[k + 2], z0: a[k + 3], z1: a[k + 4], y0: a[k + 5], y1: a[k + 6] } : null;
  return { style, blocks, wings, names, pave };
}

/** The level street's pieces, about 4 m each, rising or falling from one end to the other. */
function paving(p: NonNullable<ReturnType<typeof plan>["pave"]>) {
  const n = Math.max(1, Math.round((p.x1 - p.x0) / 4)), out: { x0: number; x1: number; y: number }[] = [];
  for (let i = 0; i < n; i++) out.push({ x0: p.x0 + ((p.x1 - p.x0) * i) / n, x1: p.x0 + ((p.x1 - p.x0) * (i + 1)) / n, y: p.y0 + ((p.y1 - p.y0) * (i + 0.5)) / n });
  return out;
}

/** The storeys of a block, stretched a little to its measured height: Great Pulteney Street's
 *  are a basement-high ground floor, two floors and an attic; Argyle Street's a shop and two floors. */
function storeys(b: Block, style: number) {
  const full = style ? 12.2 : 15.5;
  const f = Math.min(1.25, Math.max(0.8, (b.top - b.y0) / full));
  const G1 = b.y0 + 4.0 * f, F1 = b.y0 + (style ? 7.6 : 8.6) * f, F2 = b.y0 + (style ? 10.6 : 12.0) * f, AT = style ? F2 + 0.6 : b.y0 + 14.8 * f;
  return { f, G1, F1, F2, AT };
}

export function terraces(args: (number | string)[]): THREE.Object3D {
  const { style, blocks, wings, names, pave } = plan(args);
  const k = new Kit();
  const S = stone("#ecdab0"), S2 = stone("#d2bd91"), R = rustic(), G = georgian(), roofs = slate();
  const sash = sashGlass(), fan = archedGlass(), door = plain("#25282b");
  const iron = new THREE.MeshLambertMaterial({ color: "#1e2124", map: railTex(), alphaTest: 0.5, side: THREE.DoubleSide });
  const fronts = FRAMES.map((c) => new THREE.MeshLambertMaterial({ color: c, map: shopTex() }));
  const atlas = style ? signs(names.map((n) => n.name)) : null;
  const sign = atlas ? new THREE.MeshLambertMaterial({ map: atlas.tex }) : null;

  for (const b of blocks) {
    const { side, x0, x1, zf, zb, y0 } = b;
    const out = -side;                                     // the way the front faces, in z
    const z = (d: number) => zf + out * d;                 // d metres out in front of the front line
    const zs = (a: number, c: number) => [Math.min(z(a), z(c)), Math.max(z(a), z(c))] as const;
    const ry = out > 0 ? 0 : Math.PI;
    const { f, G1, F1, F2, AT } = storeys(b, style);
    // the block itself (its backs and ends with plain sash windows), and its roof
    k.slab(G, x0, x1, y0 - 8, AT, Math.min(zf, zb), Math.max(zf, zb), 3.4);
    k.roof(roofs, x0 + 0.4, x1 - 0.4, AT, Math.min(zf, zb) + 0.6, Math.max(zf, zb) - 0.6, style ? 2.2 : 2.6, false, true);
    // the bays, and which are pavilions
    const n = Math.max(3, Math.round((x1 - x0) / BAY)), bw = (x1 - x0) / n;
    const pav: [number, number, boolean][] = [];
    if (!style && n >= 16) pav.push([0, 5, false], [n - 5, n, false]);
    if (!style && n >= 34) { const m = Math.floor(n / 2) - 2; pav.push([m, m + 5, true]); }
    const inPav = (i: number) => pav.find(([a, c]) => i >= a && i < c);
    // the front, a skin over the block: rusticated (or shopfronts) below, ashlar above, cornice and attic
    const [r0, r1] = zs(0.02, 0.12);
    k.slab(style ? S : R, x0, x1, y0 - 2, G1, r0, r1, 3);
    k.slab(S, x0, x1, G1, AT, r0, r1, 3);
    const [c0, c1] = zs(0, 0.55);
    k.slab(S2, x0 - 0.3, x1 + 0.3, G1 - 0.05, G1 + 0.25, c0, Math.max(c1 - 0.3, c0 + 0.1), 1.5);   // the platband
    k.slab(S2, x0 - 0.4, x1 + 0.4, F2, F2 + 0.55, c0, c1, 1.5);                                       // the modillion cornice
    const [p0, p1] = zs(0, 0.3);
    k.slab(S2, x0, x1, AT, AT + 0.75, p0, p1, 1.5);                                                    // the parapet
    for (const [a, c, middle] of pav) {
      const px0 = x0 + a * bw, px1 = x0 + c * bw, [q0, q1] = zs(0.1, 0.45);
      k.slab(S, px0, px1, G1, AT + (middle ? 0 : 0.6), q0, q1, 3);
      k.slab(R, px0, px1, y0 - 2, G1, q0, q1, 3);
      // fluted Corinthian pilasters up through the first and second floors
      for (const pb of [a, a + 1, c - 1, c]) {
        const px = x0 + pb * bw, [l0, l1] = zs(0.45, 0.68);
        k.slab(S2, px - 0.36, px + 0.36, G1 + 0.3, F2, l0, l1, 1);
        k.slab(S2, px - 0.5, px + 0.5, F2 - 0.55, F2, l0, Math.max(l1, l0 + 0.32), 1);
      }
      if (middle) {
        const ped = new THREE.Shape([new THREE.Vector2(-(px1 - px0) / 2 - 0.3, 0), new THREE.Vector2((px1 - px0) / 2 + 0.3, 0), new THREE.Vector2(0, 2.4)]);
        k.shape(S2, ped, 0.6, (px0 + px1) / 2, AT + 0.75, z(0.35), 0, 1.5);
      } else k.slab(S2, px0 - 0.2, px1 + 0.2, AT + 0.6, AT + 1.0, ...zs(0, 0.55), 1.5);
    }
    // the shopfronts, two bays to a shop, each with its name over it (the shop the map names nearest)
    if (style) {
      const mine = names.filter((nm) => nm.side === side);
      for (let i = 0; i + 1 < n + 1; i += 2) {
        const a = x0 + bw * i, c = x0 + bw * Math.min(n, i + 2), x = (a + c) / 2, w = c - a - 0.5;
        k.quad(fronts[(i * 5 + (side > 0 ? 2 : 0)) % fronts.length], x, y0 + 1.5, z(0.14), w, 2.8, ry);
        const near = mine.length ? mine.reduce((p, nm) => (Math.abs(nm.x - x) < Math.abs(p.x - x) ? nm : p)) : null;
        const row = atlas && near && Math.abs(near.x - x) < 4 ? atlas.row(near.name) : -1;
        if (row >= 0) k.quad(sign!, x, y0 + 3.2, z(0.2), w, 0.55, ry, 0, 1 - (row + 1) / atlas!.rows, 1, 1 - row / atlas!.rows);
        else k.slab(fronts[(i * 3 + 1) % fronts.length], x - w / 2, x + w / 2, y0 + 2.95, y0 + 3.5, ...zs(0.12, 0.22), 1);
        k.slab(S2, a - 0.22, a + 0.22, y0, G1, ...zs(0.12, 0.3), 1);
      }
    }
    // windows and doors, bay by bay
    for (let i = 0; i < n; i++) {
      const x = x0 + bw * (i + 0.5), p = inPav(i), d = p ? 0.47 : 0.14;
      if (!style) {
        if (i % 3 === 1 && !(p && p[2] && i === Math.floor(n / 2))) {
          k.quad(door, x, y0 + 1.25, z(d), 1.15, 2.5, ry);
          k.quad(fan, x, y0 + 2.95, z(d), 1.15, 0.9, ry, 0, 0.62, 1, 1);
        } else k.quad(sash, x, y0 + 1.9 * f, z(d), 1.1, 1.8 * f, ry);
      }
      k.quad(sash, x, G1 + (style ? 1.8 : 2.15) * f, z(d), 1.15, (style ? 2.2 : 2.6) * f, ry);
      k.slab(S2, x - 0.75, x + 0.75, G1 + (style ? 3.0 : 3.6) * f, G1 + (style ? 3.15 : 3.75) * f, ...zs(d - 0.02, d + 0.25), 1);   // its cornice
      k.quad(sash, x, F1 + 1.5 * f, z(d), 1.1, 1.7 * f, ry);
      if (!style && !(p && p[2])) k.quad(sash, x, F2 + 1.35 * f, z(d), 0.9, 1.0 * f, ry);
      // dormers in the mansard, every other bay, and chimney stacks along the party walls
      if (i % 2 === 0) k.slab(roofs, x - 0.6, x + 0.6, AT + 0.4, AT + 1.9, ...zs(-1.3, -0.4), 1);
      if (i % 3 === 0 && i) k.slab(S2, x0 + bw * i - 0.6, x0 + bw * i + 0.6, AT, AT + 4.0, ...zs(-depth(b) / 2 - 0.7, -depth(b) / 2 + 0.7), 1);
    }
    // the railings round the basement areas, at the pavement's edge
    if (!style) k.quad(iron, (x0 + x1) / 2, y0 + 0.6, z(1.7), x1 - x0, 2.0, ry, 0, 0, (x1 - x0) / 2, 1);
  }
  // the level street, paved from front to front, its top just under the street's own surface: the
  // game lays the carriageway and its pavements on it (setpieces.ts, Pulteney Bridge's street)
  if (pave) {
    const flags = stone("#b9b1a2");
    for (const s of paving(pave)) k.slab(flags, s.x0, s.x1, s.y - 1.5, s.y - 0.12, pave.z0, pave.z1, 2);
  }
  for (const w of wings) {
    k.slab(G, w.x0, w.x1, w.top - 30, w.top, w.z0, w.z1, 3.4);
    k.roof(roofs, w.x0 + 0.2, w.x1 - 0.2, w.top, w.z0 + 0.2, w.z1 - 0.2, 1.6, true, true);
  }
  const grp = k.build();
  for (const m of [sash, fan]) glow(grp, m, 0, 0.85);
  glow(grp, G, 0, 0.9);
  return grp;
}

const depth = (b: Block) => Math.abs(b.zb - b.zf);

/** Iron railings with spear tops, cut out, two metres a repeat. */
let rails: THREE.Texture | null = null;
function railTex() { return (rails ??= TX.railings()); }

