// Grand Parade and the Empire Hotel, as set pieces (landmarks/setpieces.ts), along the river's
// west bank from Pulteney Bridge to Orange Grove. Both share Grand Parade's frame: x along the
// street from the bridge towards Orange Grove (south-south-east), z across it (the river at -z,
// the hotel at +z), y up from the street's level by the bridge.
//
// Grand Parade (colonnade): the street was carried along the river on C. E. Davis's work of 1895:
// a river wall, and on it a Tuscan colonnade of thirteen bays below the street's level, with
// blind arches on towards the bridge, an entablature, and along the top, at the edge of the
// pavement, a balustrade with urns on its pedestals and cast-iron lamp standards that light up
// after dark. The set piece puts a level pavement on it out to the balustrade, so you can walk
// along the river's edge without falling in. The street itself is the map's, as it was.
// args (after kind, x, y, height, angle): the street's level at x = 0 and x = 103, where its
// middle is (z) at those two, and the water's level below, all above the origin.
//
// The Empire Hotel (empire): Major Charles Davis's hotel of 1899-1901 on the corner of Grand
// Parade and Orange Grove, a great block in the Free Renaissance style: a rusticated ground floor
// of arches, five floors above with oriel windows running up them, an octagonal tower on the
// corner under a lead dome, and the famous roofline facing the river: a castle, a house with its
// pair of gables and a cottage (for the upper, middle and lower classes, so they say), with
// Bridgwater tiled roofs behind.
//
// Solid as they're drawn (landmarks/shape.ts).
import * as THREE from "three";
import { Kit, stone, plain, sashGlass, archedGlass, rustic, balusters, glow } from "./kit";
import type { PlaceCtx } from "./setpieces";
import * as TX from "../textures";

// ---- Grand Parade ---------------------------------------------------------------------------------

const P0 = 6, P1 = 103;           // the river wall's ends along the street
// where Pulteney Bridge's south pavilion stands (its wall 1.9 m along at the street, 3.1 m at the
// river): the wall, its pavement and balustrade run on back to it from the first bay, so there is
// no gap between them to drop into
export const BRIDGE = 1.9;
const COLS = 40, BAYW = 4.6;      // the colonnade from here, its bays this wide (thirteen of them to P1)
const FACE = -11.0;               // the wall's face to the river
const BAL = -12.0;                // the balustrade, at the colonnade's front
const HALF = 4.25;                // half the carriageway

export function paradeArgs(c: PlaceCtx, height: number): (number | string)[] {
  const pts: number[][] = [];
  for (const r of c.d.rd) if (r.n === "Grand Parade" && !r.c.startsWith("ped")) for (const q of r.p) {
    const [x, z] = c.local(q[0], q[1]);
    if (x > -5 && x < 108 && Math.abs(z) < 8) pts.push([x, z, q[2] - height]);
  }
  // fitted straight along the street: its level and where its middle runs
  const fit = (k: number) => {
    const n = pts.length; if (n < 2) return [0, 0];
    const sx = pts.reduce((a, q) => a + q[0], 0), sy = pts.reduce((a, q) => a + q[k], 0), sxx = pts.reduce((a, q) => a + q[0] * q[0], 0), sxy = pts.reduce((a, q) => a + q[0] * q[k], 0);
    const den = n * sxx - sx * sx, m = den ? (n * sxy - sx * sy) / den : 0, b = (sy - m * sx) / n;
    return [b, b + m * 103];
  };
  const [r0, r1] = fit(2), [c0, c1] = fit(1), w = c.waterAt(55, -16);
  const r = (v: number) => Math.round(v * 100) / 100;
  return [r(r0), r(r1), r(c0), r(c1), r(w === null ? -10 : w - height)];
}

function parade(args: (number | string)[]) {
  const [r0, r1, c0, c1, water] = args.map(Number);
  return {
    road: (x: number) => r0 + ((r1 - r0) * x) / 103,
    kerb: (x: number) => c0 + ((c1 - c0) * x) / 103 - HALF,          // the carriageway's edge on the river side
    water: Number.isFinite(water) ? water : -10,
  };
}

export function colonnade(args: (number | string)[]): THREE.Object3D {
  const { road, kerb, water } = parade(args);
  const k = new Kit();
  const S = stone("#e6d2a6"), S2 = stone("#cdb68a"), R = rustic(), bal = balusters(), arched = archedGlass();
  const iron = plain("#1d2023"), lamp = plain("#fff0c4", { emissive: "#ffd27a", emissiveIntensity: 0 }), paving = stone("#bdb3a2");
  const floorY = water + 2.6;          // the colonnade's floor, above the river
  for (let x = P0; x < P1 - 0.01; x += BAYW) {
    const x1 = Math.min(P1, x + BAYW), xm = (x + x1) / 2, y = road(xm), x0 = x < P0 + 0.01 ? BRIDGE : x;
    // the river wall, the colonnade's floor, and the wall behind it with an arch in each bay
    k.slab(R, x0, x1, water - 2, floorY, FACE - 0.6, FACE + 1.4, 3);
    k.slab(S2, x0, x1, floorY - 0.3, floorY, FACE - 1.4, FACE, 1.5);
    k.slab(S, x0, x1, floorY, y, FACE, FACE + 1.4, 3);
    const open = x >= COLS - 0.01;
    k.quad(arched, xm, floorY + (y - 1.6 - floorY) * 0.48, FACE - 0.02, BAYW * 0.62, (y - 1.6 - floorY) * 0.86, Math.PI);
    // a Tuscan column in front (the colonnade), or a pilaster on the wall (on towards the bridge)
    if (open) {
      k.slab(S2, x - 0.45, x + 0.45, floorY, floorY + 0.4, FACE - 1.25, FACE - 0.35, 1);
      k.cyl(S, x, floorY + 0.4, FACE - 0.8, 0.34, y - 2.1 - floorY - 0.4, 12, 0.29);
      k.slab(S2, x - 0.45, x + 0.45, y - 2.1, y - 1.6, FACE - 1.25, FACE - 0.35, 1);
    } else k.slab(S2, x - 0.35, x + 0.35, floorY, y - 1.6, FACE - 0.25, FACE, 1);
    // the entablature, and the balustrade along the top with a pedestal every other bay
    k.slab(S2, x0, x1, y - 1.6, y - 0.05, FACE - 1.45, FACE + 1.4, 1.5);
    k.quad(bal, (x0 + x1) / 2, y + 0.65, BAL, x1 - x0, 1.0, Math.PI, 0, 0, (x1 - x0) / 1.6, 1);
    k.slab(S2, x0, x1, y + 1.15, y + 1.3, BAL - 0.2, BAL + 0.2, 1);
    // the pavement out to it, level, from the carriageway's kerb
    const zk = Math.min(kerb(x0), kerb(x1));
    if (zk - BAL > 0.6) k.slab(paving, x0, x1, y - 0.3, y + 0.15, BAL - 0.2, zk - 0.05, 2);
    const bay = Math.round((x - P0) / BAYW);
    if (bay % 2 === 0) {
      k.slab(S2, x - 0.35, x + 0.35, y + 0.15, y + 1.45, BAL - 0.35, BAL + 0.35, 1);
      if (bay % 4 === 0) {
        // an urn
        k.cyl(S2, x, y + 1.45, BAL, 0.2, 0.2, 8);
        k.add(S2, new THREE.SphereGeometry(0.27, 8, 6).scale(1, 1.25, 1), x, y + 1.95, BAL);
      } else {
        // a cast-iron lamp standard
        k.cyl(iron, x, y + 1.45, BAL, 0.11, 0.5, 8, 0.07);
        k.cyl(iron, x, y + 1.95, BAL, 0.06, 2.7, 6);
        k.slab(lamp, x - 0.2, x + 0.2, y + 4.65, y + 5.2, BAL - 0.2, BAL + 0.2, 1);
        k.cyl(iron, x, y + 5.2, BAL, 0.3, 0.35, 4, 0);
      }
    }
  }
  const grp = k.build();
  glow(grp, arched, 0, 0.8);
  glow(grp, lamp, 0.05, 1.4);
  return grp;
}

/** What's solid, in Grand Parade's frame: the wall and its balustrade, the colonnade's columns,
 *  and the pavement on top to walk on. */
// ---- the Empire Hotel ------------------------------------------------------------------------------

const EX0 = 50, EX1 = 95, EZF = 4.8, EZB = 44;    // the block: along Grand Parade, and back from it
const TOWER = { x: 93.4, z: 6.4, r: 4.3 };        // the octagonal tower on the corner
const GF = 5.2, FL = 3.6, CORN = 23.2;            // the ground floor, each floor above, the cornice

export function empire(): THREE.Object3D {
  const k = new Kit();
  const S = stone("#dcc598"), S2 = stone("#c4ab7e"), R = rustic("#d7c294"), sash = sashGlass(), arched = archedGlass();
  const lead = plain("#6b7278"), tiles = new THREE.MeshLambertMaterial({ map: tilesTex(), color: "#c0603f" });
  const ry = Math.PI;                             // the front faces the street, -z

  // the block, its rusticated ground floor and its cornice
  k.slab(S, EX0, EX1, -2, CORN, EZF, EZB, 3);
  k.slab(R, EX0, EX1, -2, GF, EZF - 0.12, EZF, 3);
  k.slab(R, EX1, EX1 + 0.12, -2, GF, EZF, EZB, 3);
  k.slab(S2, EX0 - 0.3, EX1 + 0.4, GF - 0.1, GF + 0.3, EZF - 0.4, EZB, 1.5);
  k.slab(S2, EX0 - 0.5, EX1 + 0.6, CORN, CORN + 0.7, EZF - 0.6, EZB + 0.3, 1.5);
  // the front to Grand Parade and the side to Orange Grove, bay by bay: arches below, sash
  // windows above, and every fourth bay an oriel running up four floors. at(s, d): where s along
  // the front is, d out from its wall.
  const front = (at: (s: number, d: number) => [number, number], rot: number, n: number, start: number, bw: number) => {
    const box = (s0: number, s1: number, d0: number, d1: number, y0: number, y1: number, mat: THREE.Material, tile: number) => {
      const [x0, z0] = at(s0, d0), [x1, z1] = at(s1, d1);
      k.slab(mat, Math.min(x0, x1), Math.max(x0, x1), y0, y1, Math.min(z0, z1), Math.max(z0, z1), tile);
    };
    for (let i = 0; i < n; i++) {
      const s = start + bw * (i + 0.5), oriel = i % 4 === 2;
      const [ax, az] = at(s, 0.14);
      k.quad(arched, ax, 2.4, az, bw * 0.6, 3.8, rot);
      if (oriel) {
        box(s - 1.4, s + 1.4, 0, 0.9, GF + 0.2, GF + FL * 4, S, 3);
        box(s - 1.5, s + 1.5, -0.1, 1.0, GF + FL * 4, GF + FL * 4 + 0.3, lead, 2);
      }
      for (let f = 0; f < 5; f++) {
        const y = GF + FL * f + 1.7, [wx, wz] = at(s, oriel && f < 4 ? 0.92 : 0.02);
        k.quad(sash, wx, y, wz, oriel && f < 4 ? 1.9 : 1.25, 2.1, rot);
      }
      // pilaster strips between every other bay
      if (i % 2 === 0) box(start + bw * i - 0.3, start + bw * i + 0.3, 0, 0.25, GF + 0.3, CORN, S2, 1);
    }
  };
  front((s, d) => [s, EZF - d], ry, 11, EX0, (TOWER.x - TOWER.r - EX0) / 11);
  front((s, d) => [EX1 + d, s], Math.PI / 2, 10, TOWER.z + TOWER.r, (EZB - TOWER.z - TOWER.r) / 10);

  // the roofline facing the river: a castle, a house with a pair of gables, and a cottage
  k.roof(tiles, EX0 + 0.5, EX1 - 0.5, CORN + 0.7, EZF + 3, EZB - 0.5, 5.0, false, true, 2);
  {
    // the castle: a battlemented tower with turrets at its front corners
    const x0 = 52, x1 = 62.5;
    k.slab(S, x0, x1, CORN, CORN + 8.0, EZF, EZF + 8, 3);
    for (let x = x0 + 0.25; x < x1 - 0.2; x += 1.05) k.slab(S, x, x + 0.55, CORN + 8.0, CORN + 8.9, EZF, EZF + 0.6, 1);
    for (let z = EZF + 1.3; z < EZF + 8; z += 1.05) for (const x of [x0, x1 - 0.6]) k.slab(S, x, x + 0.6, CORN + 8.0, CORN + 8.9, z, z + 0.55, 1);
    for (const x of [x0, x1]) { k.cyl(S, x, CORN + 3.0, EZF, 0.9, 7.2, 8); k.cyl(lead, x, CORN + 10.2, EZF, 1.0, 1.6, 8, 0); }
    for (const x of [x0 + 2.6, (x0 + x1) / 2, x1 - 2.6]) for (const y of [CORN + 1.9, CORN + 5.3]) k.quad(sash, x, y, EZF - 0.02, 0.9, 1.7, ry);
    // the house: a storey of windows and two shaped gables, with steep tiled roofs behind them
    const h0 = 64.5, gw = 6.8;
    k.slab(S, h0, h0 + 2 * gw, CORN, CORN + 3.6, EZF, EZF + 7, 3);
    for (let g = 0; g < 2; g++) {
      const gx = h0 + gw * g, s = new THREE.Shape();
      s.moveTo(0, 0); s.lineTo(gw, 0); s.lineTo(gw, 0.4); s.quadraticCurveTo(gw - 0.3, 1.6, gw - 1.6, 1.9); s.lineTo(gw - 1.6, 3.4);
      s.quadraticCurveTo(gw / 2 + 0.6, 3.5, gw / 2, 4.3); s.quadraticCurveTo(gw / 2 - 0.6, 3.5, 1.6, 3.4); s.lineTo(1.6, 1.9); s.quadraticCurveTo(0.3, 1.6, 0, 0.4); s.closePath();
      k.shape(S, s, 0.6, gx, CORN + 3.6, EZF + 0.3, 0, 2);
      k.roof(tiles, gx + 0.6, gx + gw - 0.6, CORN + 3.6, EZF + 0.6, EZF + 7, 3.9, true, false, 2);
      k.quad(sash, gx + gw / 2, CORN + 1.8, EZF - 0.02, 1.3, 1.9, ry);
      k.quad(sash, gx + gw / 2, CORN + 5.3, EZF + 0.0, 1.0, 1.4, ry);
      k.cyl(S2, gx + gw / 2, CORN + 7.9, EZF + 0.3, 0.25, 0.9, 6, 0);
    }
    // the cottage: low, under a hipped roof with dormers
    const cx0 = 80.5, cx1 = 88;
    k.slab(S, cx0, cx1, CORN, CORN + 2.2, EZF + 0.8, EZF + 6, 3);
    k.roof(tiles, cx0 - 0.3, cx1 + 0.3, CORN + 2.2, EZF + 0.5, EZF + 6.3, 2.8, false, true, 2);
    for (const x of [cx0 + 2, cx1 - 2]) { k.slab(S, x - 0.7, x + 0.7, CORN + 2.2, CORN + 3.8, EZF + 0.7, EZF + 1.6); k.roof(tiles, x - 0.85, x + 0.85, CORN + 3.8, EZF + 0.6, EZF + 1.8, 0.6, true); k.quad(sash, x, CORN + 3.0, EZF + 0.68, 0.8, 1.0, ry); }
    k.slab(S2, cx1 - 1.5, cx1 - 0.6, CORN + 2.2, CORN + 5.6, EZF + 3, EZF + 3.9, 1);
  }

  // the octagonal tower on the corner, under a lead dome
  {
    const { x, z, r } = TOWER, top = CORN + 7.3;
    k.cyl(R, x, -2, z, r, GF + 2, 8);
    k.cyl(S, x, GF, z, r, top - GF, 8);
    for (const y of [GF, CORN]) k.cyl(S2, x, y, z, r + 0.35, 0.6, 8);
    k.cyl(S2, x, top, z, r + 0.45, 0.7, 8);
    for (let f = 0; f < 7; f++) for (let s = 0; s < 8; s++) {
      const a = ((s + 0.5) * Math.PI) / 4, d = r * Math.cos(Math.PI / 8) + 0.02;
      if (Math.sin(a) < -0.5 && Math.cos(a) > 0.5) continue;          // (the faces into the hotel)
      k.quad(f === 0 ? arched : sash, x + Math.sin(a) * d, f === 0 ? 2.4 : GF + FL * (f - 1) + 1.7, z + Math.cos(a) * d, f === 0 ? 1.7 : 1.2, f === 0 ? 3.6 : 2.0, a);
    }
    k.cyl(S, x, top + 0.7, z, r - 0.6, 1.4, 8);
    const dome = new THREE.SphereGeometry(r - 0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, 1.35, 1);
    k.add(lead, dome, x, top + 2.1, z);
    k.cyl(lead, x, top + 2.1 + (r - 0.5) * 1.35 - 0.2, z, 0.5, 1.2, 8, 0.25);
    k.cyl(lead, x, top + 3.5 + (r - 0.5) * 1.35 - 0.2, z, 0.12, 1.6, 6, 0);
  }
  const grp = k.build();
  for (const m of [sash, arched]) glow(grp, m, 0, 0.85);
  return grp;
}

/** Bridgwater tiles: orange-red clay, in rows. */
let tilesT: THREE.Texture | null = null;
function tilesTex() { return (tilesT ??= TX.roofTiles()); }

