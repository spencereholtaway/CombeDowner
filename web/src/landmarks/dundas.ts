// The Dundas Aqueduct, as a set piece (landmarks/setpieces.ts) in place of the plain aqueduct the
// canal draws elsewhere (canal.ts): John Rennie's aqueduct of 1805 carrying the Kennet and Avon
// Canal over the Avon and the railway at Monkton Combe, in Bath stone, named after Charles Dundas,
// the canal company's first chairman. Rennie built it as a piece of classical architecture:
// - one great semicircular arch over the river, its ring of stones standing proud and a keystone
//   at its crown, between broad piers each faced with a pair of Doric pilasters;
// - a lesser arch at each side, the one to the north-west over the railway (the line came after,
//   and goes through it), the other, on the dry bank to the south-east, a blind arch;
// - a full Doric entablature all along both faces, its frieze picked out with triglyphs over the
//   pilasters and a deep cornice at the level of the towpaths;
// - a low parapet over the arches and balustrades over the bays at each end, where the wing walls
//   splay out into the banks.
// The trough carries the canal's water between towpaths on both sides (the water itself is
// canal.ts's). Its frame: x along the canal from the south-east end (the junction side is +x, to
// the west-north-west), z out of its front (north-north-east), y up from the canal's water.
// Solid as it's drawn (landmarks/shape.ts): you walk the towpaths and the parapet stops you.
import * as THREE from "three";
import { Kit, stone, plain, roundArch } from "./kit";

const END = 42;                     // the abutments' outer ends, each way from the middle (the canal's own banks go on from there)
const W = 5.4;                      // the faces, each side of the middle
const WATER = 2.8;                  // the trough's sides (half the water's width)
const TOW = 0.4;                    // the towpaths and the cornice's top, over the water
const PARAPET = 1.4;                // the parapet's top
const FRIEZE = -0.6, ARCHI = -1.9, BELOW = -2.4;   // the cornice's foot, the frieze's foot, the architrave's foot
const FOOT = -24;                   // the faces go down this far (into the ground everywhere)
// the arches: middle, half span, the height they spring from, open (through) or blind
const ARCHES: { x: number; half: number; spring: number; open: boolean }[] = [
  { x: -6.9, half: 11.1, spring: BELOW - 0.2 - 11.1, open: true },     // over the Avon
  { x: 31.0, half: 9.9, spring: BELOW - 0.2 - 9.9, open: true },       // over the railway
  { x: -32.0, half: 4.8, spring: BELOW - 0.2 - 4.8, open: false },     // the blind arch on the south-east bank
];
// the pilasters' middles along each face: a pair on each of the river arch's piers, and one at
// each end of the arcade, by the balustrades
const PILASTERS = [-26.6, -21.0, 7.2, 12.6, 17.6, -37.6, 39.4];
const PW = 0.7;                     // half a pilaster's width

export function dundas(): THREE.Object3D {
  const k = new Kit();
  const S = stone("#ddc79a"), S2 = stone("#cdb68a"), S3 = stone("#efdcb2"), dark = plain("#3f3a33");

  // ---- the body: both faces and everything between, with the arches through it ----------------
  {
    const body = new THREE.Shape();
    body.moveTo(-END, FOOT); body.lineTo(END, FOOT); body.lineTo(END, BELOW); body.lineTo(-END, BELOW); body.closePath();
    for (const a of ARCHES) {
      if (!a.open) continue;
      const hole = new THREE.Path();
      hole.moveTo(a.x - a.half, FOOT + 0.1); hole.lineTo(a.x - a.half, a.spring);
      roundArch(hole, a.x, a.spring, 2 * a.half, a.half);
      hole.lineTo(a.x + a.half, FOOT + 0.1); hole.closePath();
      body.holes.push(hole);
    }
    k.shape(S, body, 2 * W, 0, 0, 0, 0, 3, 24);
  }
  // the trough above it: its bed under the water, and the towpaths either side to the faces
  k.slab(dark, -END + 2, END - 2, BELOW, -1.25, -WATER, WATER, 3);
  for (const s of [1, -1]) {
    const z0 = s > 0 ? WATER : -W, z1 = s > 0 ? W : -WATER;
    k.slab(S, -END, END, BELOW, TOW - 0.15, z0, z1, 3);
    k.slab(S2, -END, END, TOW - 0.15, TOW, z0 + (s > 0 ? 0 : 0.5), z1 - (s > 0 ? 0.5 : 0), 2);   // the towpath's flags
    k.slab(S3, -END, END, TOW - 0.15, TOW + 0.05, s > 0 ? WATER : -WATER - 0.45, s > 0 ? WATER + 0.45 : -WATER, 2);   // the coping by the water
  }

  // ---- each face ----------------------------------------------------------------------------------
  for (const s of [1, -1]) {
    const f = s * W, out = (d: number) => [f, f + s * d].sort((a, b) => a - b) as [number, number];
    // the arches' rings of stones, a little proud, with a keystone at the crown, and the
    // impost band they spring from
    for (const a of ARCHES) {
      const ring = new THREE.Shape(), hole = new THREE.Path();
      ring.moveTo(a.x - a.half - 1.1, a.spring); roundArch(ring, a.x, a.spring, 2 * a.half + 2.2, a.half + 1.1); ring.lineTo(a.x + a.half + 1.1, a.spring); ring.closePath();
      hole.moveTo(a.x - a.half, a.spring); roundArch(hole, a.x, a.spring, 2 * a.half, a.half); hole.lineTo(a.x + a.half, a.spring); hole.closePath();
      ring.holes.push(hole);
      const [z0, z1] = out(0.18);
      k.shape(S3, ring, z1 - z0, 0, 0, (z0 + z1) / 2, 0, 2, 24);
      const [k0, k1] = out(0.32);
      k.slab(S3, a.x - 0.7, a.x + 0.7, a.spring + a.half - 0.2, a.spring + a.half + 1.5, k0, k1, 1.5);
      if (!a.open) {
        // a blind arch: its opening walled up a little back from the face
        const back = new THREE.Shape();
        back.moveTo(a.x - a.half, FOOT + 1); back.lineTo(a.x - a.half, a.spring); roundArch(back, a.x, a.spring, 2 * a.half, a.half); back.lineTo(a.x + a.half, FOOT + 1); back.closePath();
        k.shape(S2, back, 0.1, 0, 0, f - s * 0.35, 0, 2, 16);
      }
      const [b0, b1] = out(0.22);
      for (const e of [a.x - a.half - 1.6, a.x + a.half + 1.6]) k.slab(S3, e - 0.5, e + 0.5, a.spring - 0.5, a.spring, b0, b1, 1.5);
    }
    // the pilasters: plinth, shaft and capital, up to the architrave
    for (const x of PILASTERS) {
      const [z0, z1] = out(0.35), [c0, c1] = out(0.6), [p0, p1] = out(0.5);
      k.slab(S, x - PW, x + PW, FOOT, BELOW - 0.6, z0, z1, 2);
      k.slab(S3, x - PW - 0.25, x + PW + 0.25, FOOT, -14.5, p0, p1, 2);
      k.slab(S3, x - PW - 0.3, x + PW + 0.3, BELOW - 0.6, BELOW - 0.3, c0, c1, 1.5);
      k.slab(S3, x - PW - 0.15, x + PW + 0.15, BELOW - 0.3, BELOW, z0, z1, 1.5);
    }
    // the entablature: the architrave, the frieze with a triglyph over each pilaster and midway
    // between, and the cornice stepping out in three courses to the towpath's edge
    {
      const [a0, a1] = out(0.25), [t0, t1] = out(0.3);
      k.slab(S3, -END, END, BELOW, ARCHI, a0, a1, 2);
      const [r0, r1] = out(0.12);
      k.slab(S, -END, END, ARCHI, FRIEZE, r0, r1, 2);
      const tri = [...PILASTERS];
      for (let x = -END + 2.6; x < END - 2; x += 5.2) if (!PILASTERS.some((p) => Math.abs(p - x) < 2)) tri.push(x);
      for (const x of tri) for (const dx of [-0.3, 0, 0.3]) k.slab(S3, x + dx - 0.1, x + dx + 0.1, ARCHI + 0.15, FRIEZE - 0.05, t0, t1, 1);
      const steps: [number, number, number][] = [[FRIEZE, FRIEZE + 0.25, 0.35], [FRIEZE + 0.25, FRIEZE + 0.5, 0.6], [FRIEZE + 0.5, TOW, 0.9]];
      for (const [y0, y1, d] of steps) { const [c0, c1] = out(d); k.slab(S3, -END - 0.3, END + 0.3, y0, y1, c0, c1, 2); }
    }
    // the parapet over the arcade, and the balustrades over the end bays
    const [q0, q1] = [s > 0 ? W - 0.5 : -W, s > 0 ? W : -W + 0.5];
    const BAL = 33.5;       // the balustrades run from here out to the ends
    k.slab(S, -BAL, BAL, TOW, PARAPET - 0.15, q0, q1, 2);
    k.slab(S3, -BAL - 0.2, BAL + 0.2, PARAPET - 0.15, PARAPET, q0 - 0.08, q1 + 0.08, 2);
    for (const e of [-1, 1]) {
      const x0 = e < 0 ? -END : BAL, x1 = e < 0 ? -BAL : END;
      k.slab(S3, x0, x1, TOW, TOW + 0.25, q0, q1, 2);                                   // the plinth
      k.slab(S3, x0, x1, PARAPET - 0.2, PARAPET, q0 - 0.08, q1 + 0.08, 2);             // the rail
      for (const x of [x0, x1]) k.slab(S, x - 0.35, x + 0.35, TOW, PARAPET, q0 - 0.05, q1 + 0.05, 2);   // the dies at its ends
      for (let x = x0 + 0.6; x < x1 - 0.4; x += 0.42) k.cyl(S3, x, TOW + 0.25, (q0 + q1) / 2, 0.12, PARAPET - 0.2 - TOW - 0.25, 6, 0.09);
    }
    // the wing walls, splaying out into the banks from the ends, their tops coming down to the ground
    for (const e of [-1, 1]) {
      const x = e * END, wall = new THREE.Shape();
      wall.moveTo(0, FOOT); wall.lineTo(7.5, FOOT); wall.lineTo(7.5, -6); wall.lineTo(0, PARAPET); wall.closePath();
      const g = new THREE.ExtrudeGeometry(wall, { depth: 0.6, bevelEnabled: false });
      g.translate(0, 0, -0.3);
      // along the end and away from the middle, turned out at 35 degrees from the face
      const ang = e > 0 ? (s > 0 ? -0.6 : 0.6) : (s > 0 ? Math.PI + 0.6 : Math.PI - 0.6);
      k.add(S, g, x, 0, f - s * 0.3, ang, 3);
    }
  }
  return k.build();
}
