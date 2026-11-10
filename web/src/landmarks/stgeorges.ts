// St George's Cathedral, as a set piece (landmarks/setpieces.ts) in place of the plain block the map
// tools build there: Sir Herbert Baker's Gothic Revival cathedral on Wale Street, at the top of
// Adderley Street and the foot of Government Avenue, begun in 1901 in the grey-brown sandstone of
// Table Mountain, where Archbishop Tutu led the marches against apartheid.
// - A tall nave under a steep slate roof, its clerestory over lean-to aisles, buttressed bays and
//   pointed traceried windows; a row of gables along Wale Street over the north chapels, with a
//   porch to the street;
// - the chancel ending in a rounded apse to the east, over the crypt (the ground falls away that
//   way, so the crypt's windows show at the foot of the walls);
// - the squat square bell tower at the west end, battlemented, with pinnacles at its corners and
//   tall louvred belfry openings, the west door at its foot.
// The Lady Chapel stands out to the south. Its frame: x along Wale Street (east-south-east), z
// away from the street (south-south-west), y up from the nave's floor. Solid as it's drawn
// (landmarks/shape.ts).
import * as THREE from "three";
import { Kit, stone, plain, gothicGlass, slate, glow, pointedArch } from "./kit";

/** The nave's floor above sea level (the ground runs from 31 m at the tower to 25 m at the apse). */
export const ST_GEORGES_Y = 28.5;

const FOOT = -6;
const W0 = -24.4, E0 = 29;            // the nave's west end, and where the chancel meets the apse
const NW = 6;                         // half the nave's width
const EAVE = 15, RIDGE = 24;          // the nave's walls and its roof's ridge
const AISLE = 8;                      // the aisles' walls
const NA = -10.1, SA = 10.5;          // the aisles' outer walls, north (Wale Street) and south
const CHAPELS = { x0: -4.5, x1: 24.8, z: -14.4, top: 10.5, ridge: 15.5 };   // the gabled chapels along Wale Street
const TOWER = { x0: -35, x1: -25, h: 5, top: 30 };

export function stGeorges(): THREE.Object3D {
  const k = new Kit();
  const S = stone("#a99c88"), S2 = stone("#8f8270"), cope = stone("#c4b9a4");
  const roof = slate(), glass = gothicGlass(false, false, 3, true), glass5 = gothicGlass(false, false, 5, true);
  const dark = plain("#2a241f"), louvre = plain("#3b3631"), door = plain("#4a2f1f"), gold = plain("#c9a443");

  /** A pointed window w by h, its sill at y, in the wall facing +z turned ry. */
  const win = (m: THREE.Material, x: number, y: number, z: number, w: number, h: number, ry = 0) => k.quad(m, x, y + h / 2, z, w, h, ry);
  /** A buttress against a wall facing (nx, nz), two stages, stepping in. */
  const buttress = (x: number, z: number, nx: number, nz: number, top: number) => {
    for (const [d, y0, y1] of [[1.3, FOOT, top * 0.55], [0.8, top * 0.55, top - 0.3]]) {
      const sx = nx ? d : 0.9, sz = nz ? d : 0.9, mx = x + (nx * d) / 2, mz = z + (nz * d) / 2;
      k.slab(S2, mx - sx / 2, mx + sx / 2, y0, y1, mz - sz / 2, mz + sz / 2, 2);
    }
  };
  const cross = (x: number, y: number, z: number, ry = 0) => {
    k.box(cope, x, y, z, 0.25, 1.6, 0.25, ry, 1);
    k.box(cope, x, y + 0.95, z, 0.9, 0.25, 0.25, ry, 1);
  };

  // ---- the nave and chancel, their clerestory and roof -----------------------------------------
  k.slab(S, W0, E0, FOOT, EAVE, -NW, NW, 3);
  k.slab(cope, W0 - 0.2, E0, EAVE, EAVE + 0.4, -NW - 0.3, NW + 0.3, 1.5);
  k.roof(roof, W0 - 0.3, E0, EAVE + 0.4, -NW - 0.5, NW + 0.5, RIDGE - EAVE - 0.4);
  const bays = 8, bay = (E0 - W0) / bays;
  for (let i = 0; i < bays; i++) {
    const x = W0 + (i + 0.5) * bay;
    for (const s of [-1, 1]) win(glass, x, 10.6, s * (NW + 0.02), 1.6, 3.6, s > 0 ? 0 : Math.PI);
  }
  // the west gable over the tower, with a cross
  cross(W0 - 0.2, RIDGE, 0);
  // ---- the aisles ------------------------------------------------------------------------------
  // north: lean-to as far as the chapels; south: lean-to the whole length
  const leanTo = (x0: number, x1: number, zo: number) => {
    const s = Math.sign(zo), zi = s * NW;
    k.slab(S, x0, x1, FOOT, AISLE, Math.min(zi, zo), Math.max(zi, zo), 3);
    // the roof leaning against the nave, from over the outer wall up under the clerestory
    const y0 = AISLE + 0.2, y1 = AISLE + 2.6, zz = zo + s * 0.4, run = Math.abs(zz - zi), len = Math.hypot(run, y1 - y0);
    k.add(roof, new THREE.BoxGeometry(x1 - x0, 0.2, len), (x0 + x1) / 2, (y0 + y1) / 2 + 0.1, (zz + zi) / 2, 0, 2, s * Math.atan2(y1 - y0, run));
    k.slab(cope, x0, x1, AISLE, AISLE + 0.25, zo - (s < 0 ? 0.3 : 0), zo + (s > 0 ? 0.3 : 0), 1.5);
    const n = Math.round((x1 - x0) / bay);
    for (let i = 0; i < n; i++) {
      const x = x0 + ((i + 0.5) * (x1 - x0)) / n;
      win(glass, x, 1.6, zo + s * 0.02, 1.8, 4.6, s > 0 ? 0 : Math.PI);
      win(dark, x, -2.6, zo + s * 0.02, 1.4, 1.2, s > 0 ? 0 : Math.PI);    // the crypt's windows, where the ground falls away
      if (i > 0) buttress(x0 + (i * (x1 - x0)) / n, zo, 0, s, AISLE);
    }
  };
  leanTo(W0, CHAPELS.x0, NA);
  leanTo(W0, E0, SA);

  // ---- the chapels along Wale Street, each under a gable, and the porch -------------------------
  {
    const { x0, x1, z, top, ridge } = CHAPELS, n = 3, w = (x1 - x0) / n;
    k.slab(S, x0, x1, FOOT, top, z, -NW, 3);
    for (let i = 0; i < n; i++) {
      const a = x0 + i * w, b = a + w, cx = (a + b) / 2;
      k.roof(roof, a, b, top, z - 0.4, -NW, ridge - top, true);
      const gab = new THREE.Shape();
      gab.moveTo(-w / 2, 0); gab.lineTo(w / 2, 0); gab.lineTo(0, ridge - top); gab.closePath();
      k.shape(S, gab, 0.5, cx, top, z - 0.25, 0, 3);
      k.slab(S, a, b, FOOT, top, z - 0.5, z, 3);
      k.slab(cope, cx - 0.4, cx + 0.4, ridge - 0.2, ridge + 0.5, z - 0.5, z + 0.3, 1);
      cross(cx, ridge + 0.5, z - 0.25);
      if (i !== 0) win(glass5, cx, 2.0, z - 0.52, 4.6, 9.6, Math.PI);
      win(dark, cx + (i === 0 ? 2.6 : 0), -2.6, z - 0.52, 1.4, 1.2, Math.PI);
      if (i > 0) buttress(a, z, 0, -1, top + 1);
    }
    buttress(x1, z, 0, -1, top + 1);
    for (let zz = z + 2; zz < -NW; zz += 4) win(glass, x1 + 0.02, 2.0, zz, 1.6, 5.0, Math.PI / 2);
    // the porch to Wale Street, in the first chapel's bay
    const px = x0 + w / 2 - 1.2, pz = z - 3.6;
    k.slab(S, px - 3, px + 3, FOOT, 6, pz, z, 3);
    k.roof(roof, px - 3.3, px + 3.3, 6, pz - 0.3, z, 3.2, true);
    const pg = new THREE.Shape(), arch = new THREE.Path();
    pg.moveTo(-3, 0); pg.lineTo(3, 0); pg.lineTo(3, 6); pg.lineTo(0, 9.2); pg.lineTo(-3, 6); pg.closePath();
    arch.moveTo(-1.5, 0.2); arch.lineTo(-1.5, 3); pointedArch(arch, 0, 3, 3, 2.2); arch.lineTo(1.5, 0.2); arch.closePath();
    pg.holes.push(arch);
    k.shape(S2, pg, 0.5, px, 0, pz - 0.05, 0, 2);
    k.quad(door, px, 2.4, pz - 0.02, 3, 4.8, Math.PI);
    for (let i = 0; i < 4; i++) k.slab(S2, px - 2.2, px + 2.2, FOOT, -0.25 * i, pz - 0.45 * (i + 1), pz - 0.45 * i, 1.5);
    cross(px, 9.2, pz - 0.05);
  }

  // ---- the chancel's apse, over the crypt -------------------------------------------------------
  {
    const apse = new THREE.CylinderGeometry(NW, NW, EAVE - FOOT, 7, 1, false, 0, Math.PI);
    k.add(S, apse, E0, (EAVE + FOOT) / 2, 0, 0, 3);
    k.add(roof, new THREE.ConeGeometry(NW + 0.5, RIDGE - EAVE - 0.4, 7, 1, true, 0, Math.PI), E0, EAVE + 0.4 + (RIDGE - EAVE - 0.4) / 2, 0, 0, 2);
    k.add(cope, new THREE.CylinderGeometry(NW + 0.3, NW + 0.3, 0.4, 7, 1, false, 0, Math.PI), E0, EAVE + 0.2, 0);
    for (let i = 0; i < 7; i++) {
      const a = ((i + 0.5) / 7) * Math.PI, sx = Math.sin(a), sz = Math.cos(a);
      win(glass, E0 + sx * (NW * 0.98), 6.5, sz * (NW * 0.98), 1.5, 6.6, a);
      win(dark, E0 + sx * (NW * 0.98), -3.4, sz * (NW * 0.98), 1.2, 1.2, a);
      if (i < 6) {
        const b = ((i + 1) / 7) * Math.PI;
        k.box(S2, E0 + Math.sin(b) * (NW + 0.5), FOOT, Math.cos(b) * (NW + 0.5), 1.0, EAVE - 1 - FOOT, 0.8, b, 2);
      }
    }
    cross(E0, RIDGE, 0);
  }

  // ---- the Lady Chapel to the south, and the vestries at the west end ----------------------------
  k.slab(S, 5, 19, FOOT, 9, SA, 21.8, 3);
  k.roof(roof, 4.7, 19.3, 9, SA, 22.2, 4.5, true);
  {
    const gab = new THREE.Shape();
    gab.moveTo(-7, 0); gab.lineTo(7, 0); gab.lineTo(0, 4.5); gab.closePath();
    k.shape(S, gab, 0.5, 12, 9, 21.9, 0, 3);
    win(glass5, 12, 1.2, 22.2, 3.6, 7.4);
    cross(12, 13.5, 21.9);
    for (const x of [7.5, 16.5]) win(glass, x, 1.8, 21.82, 1.4, 4.4);
  }
  k.slab(S, W0, -11.1, FOOT, 6, SA, 14.6, 3);
  k.slab(cope, W0 - 0.2, -10.9, 6, 6.6, SA, 14.8, 1.5);
  for (const x of [-21, -17, -13.5]) win(glass, x, 1.4, 14.62, 1.2, 3.0);

  // ---- the bell tower at the west end ----------------------------------------------------------
  {
    const { x0, x1, h, top } = TOWER, cx = (x0 + x1) / 2;
    k.slab(S, x0, x1, FOOT, top, -h, h, 3);
    // a low porch before the west door, the door in a deep pointed arch, a great window over it
    k.slab(S, -37.6, x0, FOOT, 5.5, -3.6, 3.6, 3);
    k.slab(cope, -37.8, x0, 5.5, 6, -3.8, 3.8, 1.5);
    {
      const pg = new THREE.Shape(), arch = new THREE.Path();
      pg.moveTo(-3.6, 0); pg.lineTo(3.6, 0); pg.lineTo(3.6, 5.5); pg.lineTo(-3.6, 5.5); pg.closePath();
      arch.moveTo(-1.6, 0.2); arch.lineTo(-1.6, 2.8); pointedArch(arch, 0, 2.8, 3.2, 2.2); arch.lineTo(1.6, 0.2); arch.closePath();
      pg.holes.push(arch);
      k.shape(S2, pg, 0.6, -37.6, 0, 0, -Math.PI / 2, 2);
      k.quad(door, -37.62, 2.4, 0, 3.2, 4.8, -Math.PI / 2);
    }
    win(glass5, x0 - 0.02, 7.2, 0, 3.4, 8.0, -Math.PI / 2);
    // stages marked by string courses, buttresses clasping the corners, slit windows
    for (const y of [6.5, 16.5, 21]) k.slab(cope, x0 - 0.25, x1 + 0.25, y, y + 0.35, -h - 0.25, h + 0.25, 1.5);
    for (const a of [x0, x1]) for (const b of [-h, h]) {
      const sx = a === x0 ? -1 : 1, sz = Math.sign(b);
      k.slab(S2, a - 0.6 + sx * 0.6, a + 0.6 + sx * 0.6, FOOT, top - 4, b - 0.6, b + 0.6, 2);
      k.slab(S2, a - 0.6, a + 0.6, FOOT, top - 4, b - 0.6 + sz * 0.6, b + 0.6 + sz * 0.6, 2);
    }
    for (let f = 0; f < 4; f++) {
      const ry = (f * Math.PI) / 2, sx = Math.sin(ry), sz = Math.cos(ry), r = h + 0.02;
      win(dark, cx + sx * r, 12.5, sz * r, 0.6, 2.4, ry);
      // the belfry: two tall louvred lancets on each face
      for (const d of [-1.6, 1.6]) {
        const ox = cx + sx * r + sz * d, oz = sz * r - sx * d;
        win(glass, ox, 21.8, oz, 1.6, 5.2, ry);
        for (let y = 22.4; y < 26; y += 0.6) k.box(louvre, ox + sx * 0.04, y, oz + sz * 0.04, Math.abs(sz) * 1.3 + 0.08, 0.12, Math.abs(sx) * 1.3 + 0.08, 0, 1);
      }
      // a clock on the street side and the nave side
      if (f % 2 === 0) {
        k.add(cope, new THREE.CircleGeometry(1.1, 18), cx + sx * (r + 0.02), 18.6, sz * (r + 0.02), ry);
        k.add(gold, new THREE.RingGeometry(0.85, 1.0, 18), cx + sx * (r + 0.04), 18.6, sz * (r + 0.04), ry);
      }
    }
    // the battlements and the pinnacles at the corners
    k.slab(cope, x0 - 0.3, x1 + 0.3, top, top + 0.4, -h - 0.3, h + 0.3, 1.5);
    for (const [a, b, len, alongX] of [[cx, -h, x1 - x0, 1], [cx, h, x1 - x0, 1], [x0, 0, 2 * h, 0], [x1, 0, 2 * h, 0]] as const) {
      for (let t = -len / 2 + 1.4; t < len / 2 - 1.2; t += 1.1) {
        const mx = alongX ? a + t : a, mz = alongX ? b : b + t;
        k.box(S, mx, top + 0.4, mz, alongX ? 0.6 : 0.5, 0.9, alongX ? 0.5 : 0.6, 0, 1);
      }
    }
    for (const a of [x0, x1]) for (const b of [-h, h]) {
      k.slab(S2, a - 0.65, a + 0.65, top - 4, top + 1.5, b - 0.65, b + 0.65, 1.5);
      k.cyl(cope, a, top + 1.5, b, 0.6, 2.6, 4, 0);
    }
    k.cyl(gold, cx, top + 0.4, 0, 0.05, 3, 4);
  }

  const grp = k.build();
  for (const m of [glass, glass5]) glow(grp, m, 0, 0.8);
  return grp;
}
