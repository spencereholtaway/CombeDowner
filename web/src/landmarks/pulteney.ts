// Pulteney Bridge, as a set piece (landmarks/setpieces.ts) in place of the plain bridge and
// blocks the map tools build there. Robert Adam's bridge of 1769-74 over the Avon, one of the few
// in the world with shops along both sides, carrying the street from Bridge Street to Argyle
// Street, and Pulteney Weir just below it.
// - Three equal segmental arches on two piers, with cutwaters, about 45 m long and 18 m wide.
// - Downstream (the front everyone photographs, from Parade Gardens): Adam's symmetrical front, a
//   storey of windows over the arches and the main storey above, the middle stepped forward
//   with a Venetian window under a pediment, and a pavilion at each end with a pediment and a
//   shallow lead dome.
// - Upstream: the shops' backs, rebuilt one by one over the years, each its own height, some
//   with bay windows hanging out over the river.
// - The street between: little shopfronts both sides, each with its name over the window (the
//   names of the shops there now, as the map has them).
// - Pulteney Weir: the horseshoe of stepped falls of 1972, its point upstream, its long arm down
//   the west side by Parade Gardens, and the radial flood gate by the east bank.
// Its frame: x along the bridge from the middle towards Argyle Street (east-north-east), z
// downstream, y up from the river's water. The street over it keeps the deck the map gives it to
// walk and drive on; the map's plain bridge under it isn't built (setpieces.ts). Solid as it's
// drawn (landmarks/shape.ts). The weir's crests are handed on so the river churns white below
// them, as it does below any weir (water.ts).
//
// args (after kind, x, y, ground, angle): the street's height above the water at the west end
// (x = -20.4) and the east end (x = 20.4), how far downstream its middle is (z), then for each
// shop the map names on the bridge, its x, its side (1 downstream, -1 upstream) and its name.
import * as THREE from "three";
import * as TX from "../textures";
import { Kit, stone, plain, slate, sashGlass, archedGlass, glow, roundArch } from "./kit";

const L0 = -20.4, L1 = 20.4;           // the bridge's ends, where the banks' walls are
const W0 = -24.9;                      // the upstream shops reach on over the west bank
const UP = -9.8, DN = 10.0;            // its upstream and downstream faces
const BANK = 18.2;                     // the river's banks, each way from the middle
const PIERS = [-6.5, 6.5], PW = 1.3;   // the piers' middles and half their width
const STREET = 4.75;                   // half the street between the shopfronts
const EAVES = 5.2;                     // the shops' eaves above the street
const SPRING = 1.6, RISE = 3.3;        // the arches, above the water
// the premises along the upstream side, as the map has them: from, to (x), and their eaves above the street
const BACKS: [number, number, number][] = [[W0, -14.9, 5.6], [-14.9, -9.7, 4.8], [-9.7, 1.65, 6.2], [1.65, 7.9, 5.0], [7.9, 14.3, 5.8], [14.3, L1, 4.6]];
// and the shopfronts along both sides of the street: from, to (x)
const FRONTS = (side: number) => {
  const cuts = side > 0 ? [-19.7, -16.4, -13.2, -9.7, -6.2, -2.85, 0.1, 2.95, 6.2, 10.4, 14.4, 17.4, 20.3] : [-20.3, -17.6, -14.95, -9.7, -6.0, -2.2, 1.65, 4.8, 7.9, 11.1, 14.3, 17.3, 20.3];
  return cuts.slice(0, -1).map((a, i) => [a, cuts[i + 1]] as [number, number]);
};
export const FRAMES = ["#24443a", "#1f2d47", "#5b1d22", "#20201f", "#3d5a62", "#6b5a2c"];

function plan(args: (number | string)[]) {
  const [dw, de, rz] = args.slice(0, 3).map(Number);
  const deck = (x: number) => dw + ((de - dw) * (x - L0)) / (L1 - L0);
  const top = Math.max(dw, de);
  const names: { x: number; side: number; name: string }[] = [];
  for (let i = 3; i + 2 < args.length; i += 3) names.push({ x: +args[i], side: +args[i + 1], name: String(args[i + 2]) });
  return { deck, top, rz: Number.isFinite(rz) ? rz : 1.3, names, low: Math.min(dw, de) };
}

export function pulteney(args: (number | string)[]): THREE.Object3D {
  const { deck, top, rz, names, low } = plan(args);
  const k = new Kit();
  const S = stone(), S2 = stone("#cbb487"), render = stone("#efe6d2"), lead = plain("#6f767c"), roofs = slate();
  const sash = sashGlass(), arched = archedGlass(), dark = plain("#2c2a27");
  const roundel = plain("#7a6a50");
  const fronts = FRAMES.map((c) => new THREE.MeshLambertMaterial({ color: c, map: shopTex() }));
  const sides = [1, -1];
  const zs = (side: number) => rz + side * STREET;           // a row's street front

  // ---- the bridge: its body with the three arches through it, pier to pier --------------------
  {
    const body = new THREE.Shape();
    body.moveTo(L0, -4); body.lineTo(L1, -4); body.lineTo(L1, deck(L1) - 0.35); body.lineTo(L0, deck(L0) - 0.35); body.closePath();
    const spans = [[-BANK, PIERS[0] - PW], [PIERS[0] + PW, PIERS[1] - PW], [PIERS[1] + PW, BANK]];
    for (const [a, b] of spans) {
      const hole = new THREE.Path();
      hole.moveTo(a, -3.9); hole.lineTo(a, SPRING);
      roundArch(hole, (a + b) / 2, SPRING, b - a, RISE);
      hole.lineTo(b, -3.9); hole.closePath();
      body.holes.push(hole);
    }
    k.shape(S, body, DN - UP, 0, 0, (UP + DN) / 2, 0, 3, 10);
    // the arches' rings of stones, a little proud of both faces
    for (const [a, b] of spans) for (const z of [UP - 0.1, DN + 0.1]) {
      const ring = new THREE.Shape(), hole = new THREE.Path();
      ring.moveTo(a - 0.7, SPRING - 0.01); roundArch(ring, (a + b) / 2, SPRING - 0.01, b - a + 1.4, RISE + 0.8); ring.lineTo(b + 0.7, SPRING - 0.01); ring.closePath();
      hole.moveTo(a, SPRING + 0.01); roundArch(hole, (a + b) / 2, SPRING + 0.01, b - a, RISE - 0.02); hole.closePath();
      ring.holes.push(hole);
      k.shape(S2, ring, 0.2, 0, 0, z, 0, 1.5, 10);
    }
    // the cutwaters, upstream and down, and the roundels over the piers
    for (const x of PIERS) for (const [z0, dir] of [[DN, 1], [UP, -1]]) {
      const tri = new THREE.Shape([new THREE.Vector2(x - PW, -z0), new THREE.Vector2(x + PW, -z0), new THREE.Vector2(x, -(z0 + dir * 1.9))]);
      k.add(S2, new THREE.ExtrudeGeometry(tri, { depth: SPRING + 0.9 + 4, bevelEnabled: false }), 0, -4, 0, 0, 2, -Math.PI / 2);
      const disc = new THREE.CylinderGeometry(1.0, 1.0, 0.16, 16);
      k.add(roundel, disc, x, SPRING + RISE + 1.6, z0 + dir * 0.12, 0, 0, Math.PI / 2);
    }
    // the string course at the street's level, both faces
    for (const z of [UP, DN]) k.beam(S2, [L0, deck(L0) - 0.35, z], [L1, deck(L1) - 0.35, z], 0.5, 0.3);
  }

  // ---- downstream: Adam's front ------------------------------------------------------------------
  {
    const z0 = zs(1), eaves = top + EAVES;
    k.slab(S, L0, L1, low - 0.4, eaves, z0, DN);
    k.slab(S2, L0 - 0.2, L1 + 0.2, eaves, eaves + 0.4, z0, DN + 0.35);
    // the storey over the arches, and the main storey above the street
    for (let x = L0 + 1.7; x < L1 - 1.2; x += 2.75) {
      if (Math.abs(x) < 4.6) continue;
      k.quad(sash, x, deck(x) - 2.3, DN + 0.12, 0.9, 1.4);
      if (Math.abs(x) > 15) continue;
      k.quad(sash, x, deck(x) + 2.0, DN + 0.03, 1.1, 2.1);
    }
    // the middle, stepped forward: a Venetian window under a pediment
    const mid = deck(0);
    k.slab(S, -4.3, 4.3, mid - 3.4, eaves + 0.4, DN, DN + 0.45);
    k.quad(arched, 0, mid + 2.2, DN + 0.47, 1.5, 3.2);
    for (const x of [-1.55, 1.55]) k.quad(sash, x, mid + 1.75, DN + 0.47, 0.8, 2.3);
    for (const x of [-3.6, -2.35, 2.35, 3.6]) k.slab(S2, x - 0.22, x + 0.22, mid - 0.2, eaves, DN + 0.45, DN + 0.65);
    k.quad(sash, 0, mid - 2.2, DN + 0.47, 1.2, 1.5);
    pediment(k, S2, 0, eaves + 0.4, DN + 0.3, 9.0, 1.9);
    // the end pavilions, each with a pediment and a shallow lead dome behind it
    for (const s of sides) {
      const xc = s * (L1 - 2.6), d = deck(xc);
      k.slab(S, xc - 2.6, xc + 2.6, d - 3.6, eaves + 0.6, DN, DN + 0.5);
      for (const x of [xc - 2.2, xc + 2.2]) k.slab(S2, x - 0.2, x + 0.2, d - 0.2, eaves + 0.6, DN + 0.5, DN + 0.68);
      k.quad(arched, xc, d + 2.1, DN + 0.52, 1.2, 2.8);
      k.quad(sash, xc, d - 2.2, DN + 0.52, 1.0, 1.4);
      pediment(k, S2, xc, eaves + 0.6, DN + 0.35, 5.8, 1.4);
      k.cyl(S, xc, eaves + 0.4, DN - 2.6, 2.5, 0.9, 16);
      const dome = new THREE.SphereGeometry(2.4, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.scale(1, 0.5, 1);
      k.add(lead, dome, xc, eaves + 1.3, DN - 2.6);
      k.cyl(lead, xc, eaves + 2.4, DN - 2.6, 0.12, 0.8, 6);
    }
    // its roof, between the pavilions, and a chimney or two
    k.roof(roofs, L0 + 5.2, L1 - 5.2, eaves + 0.4, z0, DN, 1.9, false, true);
    for (const x of [-9, 0.5, 9]) k.slab(S2, x - 0.5, x + 0.5, eaves + 0.6, eaves + 3.1, z0 + 1.3, z0 + 2.2);
  }

  // ---- upstream: the shops' backs, each its own ------------------------------------------------
  {
    const z1 = zs(-1);
    BACKS.forEach(([a, b, h], i) => {
      const mat = i % 3 === 1 ? render : S, eaves = deck((a + b) / 2) + h, d = deck((a + b) / 2);
      k.slab(mat, a, b, low - 0.4, eaves, UP, z1);
      k.roof(roofs, a, b, eaves, UP, z1, 1.6 + (i % 2) * 0.6);
      k.slab(S2, b - 1.4, b - 0.6, eaves, eaves + 2.6, UP + 1.2, UP + 2.0);
      for (let x = a + 1.4; x < b - 0.8; x += 2.4) {
        if (x > L0) k.quad(sash, x, d - 2.2, UP - 0.12, 0.9, 1.3, Math.PI);
        k.quad(sash, x, d + 1.7, UP - 0.02, 1.0, 1.8, Math.PI);
        if (h > 5.4) k.quad(sash, x, d + 4.1, UP - 0.02, 0.9, 1.3, Math.PI);
      }
      // a bay window hanging out over the river, on corbels
      if (i % 2 === 0 && b - a > 5) {
        const bx = (a + b) / 2;
        k.slab(mat, bx - 1.6, bx + 1.6, d - 1.2, d + 3.4, UP - 1.2, UP);
        k.slab(lead, bx - 1.75, bx + 1.75, d + 3.4, d + 3.6, UP - 1.35, UP);
        for (const x of [bx - 1.2, bx + 1.2]) k.beam(S2, [x, d - 2.6, UP], [x, d - 1.2, UP - 1.0], 0.3, 0.3);
        k.quad(sash, bx, d + 1.3, UP - 1.22, 2.4, 1.9, Math.PI);
      }
    });
  }

  // ---- the street: shopfronts both sides, with their names over them -------------------------------
  {
    const atlas = signs(names.map((n) => n.name));
    const sign = new THREE.MeshLambertMaterial({ map: atlas.tex });
    for (const side of sides) {
      const z = zs(side), ry = side > 0 ? Math.PI : 0, out = -side * 0.03;
      const mine = names.filter((n) => n.side === side);
      FRONTS(side).forEach(([a, b], i) => {
        const x = (a + b) / 2, w = b - a - 0.5, d = deck(x);
        k.quad(fronts[(i * 5 + (side > 0 ? 2 : 0)) % fronts.length], x, d + 1.55, z + out, w, 2.7, ry);
        // the fascia: the shop the map names nearest here, or just paint
        const near = mine.length ? mine.reduce((p, n) => (Math.abs(n.x - x) < Math.abs(p.x - x) ? n : p)) : null;
        const row = near && Math.abs(near.x - x) < Math.max(3, (b - a) / 2 + 1) ? atlas.row(near.name) : -1;
        if (row >= 0) k.quad(sign, x, d + 3.15, z + out * 2, w, 0.5, ry, 0, 1 - (row + 1) / atlas.rows, 1, 1 - row / atlas.rows);
        else k.slab(fronts[(i * 3 + 1) % fronts.length], x - w / 2, x + w / 2, d + 2.9, d + 3.4, Math.min(z, z - side * 0.08), Math.max(z, z - side * 0.08), 1);
        k.quad(sash, x, d + 4.25, z + out, Math.min(1.1, w * 0.4), 1.1, ry);
        // the pilasters between shops
        k.slab(S2, a - 0.22, a + 0.22, d, d + EAVES, Math.min(z, z - side * 0.15), Math.max(z, z - side * 0.15));
      });
      // and the cornice along the top
      k.beam(S2, [L0, deck(L0) + EAVES, z - side * 0.1], [L1, deck(L1) + EAVES, z - side * 0.1], 0.4, 0.35);
    }
  }

  const falls: { p: number[][]; drop: number }[] = [];
  // ---- Pulteney Weir -------------------------------------------------------------------------------
  {
    const east: [number, number][] = [[0.4, 36.6], [3.6, 37.4], [6.5, 39.0], [9.5, 41.5], [14, 47.5], [18.5, 54.5], [22, 61], [24.8, 68.5]];
    const west: [number, number][] = [[0.4, 36.6], [-1.6, 38.5], [-2.4, 41.5], [-2.2, 60], [-2.0, 90], [-2.2, 95]];
    const inside = [9, 72];      // a point inside the horseshoe, where the water falls to
    // (each arm listed for the water's white water with the water it falls to on its right: landmarks/index.ts)
    for (const arm of [east, west]) {
      const [ax, az] = arm[0], [bx, bz] = arm[1];
      falls.push({ p: (inside[0] - ax) * -(bz - az) + (inside[1] - az) * (bx - ax) > 0 ? arm : [...arm].reverse(), drop: 1.5 });
    }
    // the crest, and the sheet of water pouring off its inside down to the river below (whose own
    // surface churns white from there on: water.ts)
    const pour = plain("#d6dfdd");
    for (const arm of [east, west]) for (let i = 0; i < arm.length - 1; i++) {
      const [ax, az] = arm[i], [bx, bz] = arm[i + 1], l = Math.hypot(bx - ax, bz - az);
      let nx = -(bz - az) / l, nz = (bx - ax) / l;
      if ((inside[0] - ax) * nx + (inside[1] - az) * nz < 0) { nx = -nx; nz = -nz; }
      k.beam(S2, [ax, 0.08, az], [bx, 0.08, bz], 1.0, 0.36, 2);
      k.beam(pour, [ax + nx * 0.75, -0.72, az + nz * 0.75], [bx + nx * 0.75, -0.72, bz + nz * 0.75], 0.5, 1.6, 2);
    }
    // the radial flood gate by the east bank: two piers, the gate and the walkway over it
    const g0: [number, number] = [36.6, 92.5], g1: [number, number] = [54.1, 89.1];
    for (const [x, z] of [g0, g1]) k.slab(S2, x - 1.1, x + 1.1, -3, 3.6, z - 1.6, z + 1.6);
    k.beam(dark, [g0[0], 0.9, g0[1] - 0.6], [g1[0], 0.9, g1[1] - 0.6], 0.3, 2.2);
    k.beam(plain("#5d6a70"), [g0[0], 3.7, g0[1]], [g1[0], 3.7, g1[1]], 1.6, 0.35);
    for (const s of [-0.75, 0.75]) k.beam(plain("#5d6a70"), [g0[0], 4.6, g0[1] + s], [g1[0], 4.6, g1[1] + s], 0.06, 0.06);
  }

  const grp = k.build();
  grp.userData.falls = falls;
  for (const m of [sash, arched]) glow(grp, m, 0, 0.85);
  return grp;
}

/** A pediment: a low triangle of stone w wide and rise high on top of y, its middle at x, z. */
function pediment(k: Kit, mat: THREE.Material, x: number, y: number, z: number, w: number, rise: number) {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rise)]);
  k.shape(mat, s, 0.7, x, y, z, 0, 1.5);
}

/** A shopfront: a painted frame (white here, tinted by the material), plate glass and a door. */
let shopCanvas: HTMLCanvasElement | null = null;
export function shopTex(): THREE.Texture {
  if (!shopCanvas) {
    const W = 128, H = 96, [c, g] = TX.canvas(W, H);
    g.fillStyle = "#f2f2f2"; g.fillRect(0, 0, W, H);
    const glass = g.createLinearGradient(0, 0, W, H);
    glass.addColorStop(0, "#4b5a66"); glass.addColorStop(0.5, "#202b33"); glass.addColorStop(1, "#56697a");
    g.fillStyle = glass; g.fillRect(8, 8, 80, 62);
    g.fillStyle = "#f2f2f2"; for (const x of [34, 61]) g.fillRect(x, 8, 3, 62); g.fillRect(8, 30, 80, 3);
    g.fillStyle = "#cfcfcf"; g.fillRect(8, 74, 80, 16);
    g.fillStyle = "#1a1d20"; g.fillRect(96, 10, 24, 82);
    g.fillStyle = "#3a4650"; g.fillRect(100, 14, 16, 24);
    g.fillStyle = "#d9b45a"; g.fillRect(113, 52, 3, 3);
    shopCanvas = c;
  }
  return TX.pixelTex(shopCanvas, 64, 48, 24, 7);
}

/** The shops' names, gold on black, one to a row of a sheet. */
export function signs(list: string[]) {
  const uniq = [...new Set(list)], rows = Math.max(1, uniq.length), W = 512, H = 48;
  const [c, g] = TX.canvas(W, H * rows);
  uniq.forEach((n, i) => {
    g.fillStyle = "#15191c"; g.fillRect(0, i * H, W, H);
    g.fillStyle = "#d9b660"; g.font = `bold ${H * 0.55}px Georgia, serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(n, W / 2, i * H + H / 2 + 2, W - 24);
  });
  return { tex: TX.tex(c), rows, row: (n: string) => uniq.indexOf(n) };
}

