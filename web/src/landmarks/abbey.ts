// Bath Abbey, as a set piece (landmarks/setpieces.ts) in place of the plain blocks the map tools
// build from its outline. The church of Bishop Oliver King, begun in 1499 and finished in the
// 1600s, restored by George Gilbert Scott in the 1860s: a cruciform Perpendicular church about
// 69 m long, its walls mostly glass (the "Lantern of the West").
// - The nave of five bays and the choir of three, each with single-storey aisles; flying
//   buttresses (Scott's) from the aisle walls up to the clerestory, with openwork pinnacles; and
//   pierced parapets all round.
// - Narrow transepts, two bays deep, and the oblong tower over the crossing, longer across the
//   church than along it, with two tall bell openings to a face, a pierced battlement and corner
//   turrets with pinnacles, 49 m to their tips.
// - The west front: the great west window of seven lights, an octagonal turret either side of it
//   carved with Bishop King's dream, a ladder of angels climbing up and coming down, Henry VII
//   and the saints over the door and Christ in majesty at the top of the gable; and the big
//   square-headed east window.
// - Inside, which you can go into through the west door: the arcades, the fan vault over the
//   nave, the transepts and the aisles, the stained glass, pews, choir stalls, the altar and the
//   organ in the north transept.
// - Made to be climbed (abbeyclimb.ts, climb.ts), if you know how: the carved ladder of angels on
//   the north turret is a real one, reached off a mounting stone at its foot, up to the turret's
//   crown, an open ring of pinnacles you can stand in; the tower's lower string course is a ledge
//   to stand on (it and the stones grow out of the tower when someone's up on the roofs, climb.ts), with a gap in it on the west side and none over the ridges of the choir and the
//   transepts; and stones jut from the tower in a stair (they grow out of its walls when someone's near,
//   climb.ts, and are solid either way), each a jump above the last, along the
//   north face, round a balcony at the corner, along the east face and round onto the south, up to
//   the battlements. The ladder isn't solid, so you climb it rather than bump into it.
// Its frame: x east along the church from the middle of the nave, z south (its front), y up from
// the floor. Placed at a fixed floor level (setpieces.ts), a touch above the highest ground
// inside it, with steps up to the west door. Solid as it's drawn (landmarks/shape.ts).
import * as THREE from "three";
import { Kit, stone, plain, gothicGlass, fanVault, flags, openwork, figure, glow, pointedArch } from "./kit";

// the plan (see the frame above)
const WX = -34.9, EX = 34.6;          // the west and east fronts' outer faces
const T = 1.0;                        // walls' thickness
const NW = 5.8, AW = 12.5;            // the middles of the arcade walls and of the aisles' outer walls, either side
const TX0 = 1.5, TX1 = 12.5, TZ = 20.8;   // the crossing and transepts (x from, to) and how far the transepts reach out
const AISLE = 10.0, CLER = 20.5, PAR = 1.2, RIDGE = 25.0;   // heights: aisle walls, clerestory walls, parapets, roof ridge
const SPRING = 8.0, APEX = 11.2;      // the arcades' arches
const TOWER = { x0: 2.5, x1: 11.5, z: 6.0, top: 39.8, tips: 48.2 };
const NAVE = { x0: WX + T, x1: TX0, bays: 5 }, CHOIR = { x0: TX1, x1: EX - T, bays: 3 };
const piers = (p: typeof NAVE) => Array.from({ length: p.bays - 1 }, (_, k) => p.x0 + ((p.x1 - p.x0) * (k + 1)) / p.bays);
const bays = (p: typeof NAVE) => Array.from({ length: p.bays }, (_, k) => p.x0 + ((p.x1 - p.x0) * (k + 0.5)) / p.bays);
// the climb (abbeyclimb.ts): the turrets of the west front, each with the ladder of angels up its
// face and an open crown on top, the north one's a real ladder off a mounting stone (FOOT high); the
// ledge round the tower (its lower string course, with a gap to jump); and the stair of stones
// jutting from the tower, each a jump higher than the last (STEPS: each stone's x0, x1, z0, z1 and
// top), east along the north face to a stone balcony round the corner buttress, south along the
// east face to another and west along the south face, to climb over the battlements from the last
const TURRET = { x: WX + 0.4, z: 6.7, r: 1.45 };
const CROWN = CLER + 4, FOOT = 1.6, RUNGS0 = 2.4;
const LEDGE = { top: 27.5, out: 0.8, gap: [-4.2, -1.2], ridge: 1.8 };
const RISE = 0.8, HALF = 0.55, GAP = 0.4, PITCH = 2 * HALF + GAP, OUT = 1.5, BALCONY = 1.9;
const STEPS: number[][] = (() => {
  const { x1, z } = TOWER, out: number[][] = [];
  let y = LEDGE.top;
  const stone = (a: number, b: number, c: number, d: number) => out.push([a, b, c, d, (y += RISE)]);
  for (let k = 0; k < 4; k++) { const x = 3.9 + PITCH * k; stone(x - HALF, x + HALF, -z - OUT, -z); }
  // the north-east balcony, round the buttress at the corner, then the east face
  const nb = 3.9 + PITCH * 3 + HALF + GAP;
  stone(nb, x1 + BALCONY, -z - BALCONY, -z); out.push([x1, x1 + BALCONY, -z, -z + 1.8, y]);
  for (let k = 0; k < 5; k++) { const zz = -z + 1.8 + GAP + HALF + PITCH * k; stone(x1, x1 + OUT, zz - HALF, zz + HALF); }
  // the south-east balcony, then the south face (shifted along so the last is clear of the corner buttress)
  const sb = -z + 1.8 + GAP + HALF + PITCH * 4 + HALF + GAP;
  stone(x1, x1 + BALCONY, sb, z); out.push([nb, x1 + BALCONY, z, z + BALCONY, y]);
  for (let k = 0; k < 4; k++) { const x = nb - 0.1 - HALF - PITCH * k; stone(x - HALF, x + HALF, z, z + OUT); }
  return out;
})();
/** How far round the ledge a spot is, in metres, from the gap in the west side (the shorter way). */
const RING_LEN = 2 * (TOWER.x1 - TOWER.x0) + 4 * TOWER.z;
export function ringDist(x: number, z: number): number {
  const { x0, x1, z: tz } = TOWER, gz = (LEDGE.gap[0] + LEDGE.gap[1]) / 2, nl = x1 - x0, a = gz + tz;
  const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const out = [x0 - x, x - x1, -tz - z, z - tz], side = out.indexOf(Math.max(...out));
  const u = side === 0 ? (z >= gz ? RING_LEN - (cl(z, -tz, tz) - gz) : gz - cl(z, -tz, tz))
    : side === 2 ? a + cl(x, x0, x1) - x0
    : side === 1 ? a + nl + cl(z, -tz, tz) + tz
    : a + nl + 2 * tz + x1 - cl(x, x0, x1);
  return Math.min(u, RING_LEN - u);
}
/** The ledge as pieces: x0, x1, z0, z1, and how far round the route each begins. */
const LEDGE_PIECES: number[][] = (() => {
  const { x0, x1, z } = TOWER, { out, gap, ridge: r } = LEDGE, mid = (x0 + x1) / 2, o: number[][] = [];
  const add = (a0: number, a1: number, b0: number, b1: number) => {
    let near = Infinity;
    for (const x of [a0, (a0 + a1) / 2, a1]) for (const zz of [b0, (b0 + b1) / 2, b1]) near = Math.min(near, ringDist(x, zz));
    o.push([a0, a1, b0, b1, Math.max(0, near - 1.5)]);
  };
  add(x0 - out, x0 + 0.1, -z - out, gap[0]); add(x0 - out, x0 + 0.1, gap[1], z + out);   // west, over the nave
  add(x1 - 0.1, x1 + out, -z - out, -r); add(x1 - 0.1, x1 + out, r, z + out);             // east
  for (const s of [1, -1]) {
    const b0 = s > 0 ? z - 0.1 : -z - out, b1 = s > 0 ? z + out : -z + 0.1;
    add(x0, mid - r, b0, b1); add(mid + r, x1, b0, b1);                                    // north and south
  }
  return o;
})();
/** The climbable bits, in the Abbey's frame, for abbeyclimb.ts. */
export const CLIMB = {
  /** The ladder of angels up the north turret (z = -turret.z): where its rungs meet the turret, the way in (+x), and its foot and top. */
  ladder: { x: TURRET.x - TURRET.r + 0.03, z: -TURRET.z, y0: RUNGS0, y1: CROWN },
  turret: TURRET, crown: CROWN,
  ledge: LEDGE.top,
  /** The ledge's pieces (x0, x1, z0, z1, order along the route), how long the route round is, and where the stones start along it. */
  ledgePieces: LEDGE_PIECES, ringLen: RING_LEN, stonesAt: ringDist(3.9, -TOWER.z),
  /** Where the Abbey's roofs begin, in its frame: inside this, and this high, someone is up on them. */
  roofs: { x0: WX, x1: EX, z: TZ, y: RIDGE - 1.5 },
  /** The stones up the tower, in order: x0, x1, z0, z1 and top of each (a balcony is two). */
  steps: STEPS,
  tower: TOWER,
};
/** Metres of reach over which a stone slides out. */
export const STONE_SLIDE = 1.2;
const PEWS = Array.from({ length: 21 }, (_, k) => -31 + k * 1.15);
const DOOR = 1.8;                     // half the west door's width

export function abbey(): THREE.Object3D {
  const k = new Kit(), ks = new Kit(), kl = new Kit();
  const stepStone = stone("#cdb88c"), ledgeStone = stone("#cdb88c");
  const S = stone(), S2 = stone("#cdb88c"), lead = plain("#727a82"), wood = plain("#5b3d25"), gold = plain("#c49a3c");
  const cloth = plain("#7c1f26"), fig = plain("#efe3c4");
  const out5 = gothicGlass(false, false, 5), in5 = gothicGlass(true, false, 5);
  const out7 = gothicGlass(false, false, 7), in7 = gothicGlass(true, false, 7);
  const outSq = gothicGlass(false, true, 7), inSq = gothicGlass(true, true, 7);
  const vault = fanVault(); vault.side = THREE.DoubleSide;
  const floorMat = flags(), lace = openwork();
  // the ladders of angels are left out of what's solid: you climb them, not bump into them (landmarks/shape.ts)
  const S2ghost = stone("#cdb88c"), angel = plain("#efe3c4");
  S2ghost.userData.ghost = angel.userData.ghost = true;
  const sides = [1, -1];
  const face = (s: number) => (s > 0 ? 0 : Math.PI);       // a picture facing +z (s = 1) or -z
  /** An openwork parapet with its coping, along x at z, from x0 to x1, on top of a wall at y. */
  const parapetX = (x0: number, x1: number, z: number, y: number) => {
    k.quad(lace, (x0 + x1) / 2, y + PAR / 2, z, x1 - x0, PAR, 0, 0, 0, (x1 - x0) / 2.4, 1);
    k.slab(S, x0, x1, y + PAR, y + PAR + 0.15, z - 0.2, z + 0.2);
  };
  const parapetZ = (z0: number, z1: number, x: number, y: number) => {
    k.quad(lace, x, y + PAR / 2, (z0 + z1) / 2, Math.abs(z1 - z0), PAR, Math.PI / 2, 0, 0, Math.abs(z1 - z0) / 2.4, 1);
    k.slab(S, x - 0.2, x + 0.2, y + PAR, y + PAR + 0.15, Math.min(z0, z1), Math.max(z0, z1));
  };
  const pinnacle = (x: number, y: number, z: number, h: number, r = 0.35) => { k.cyl(S, x, y, z, r, h * 0.35, 4); k.cyl(S, x, y + h * 0.35, z, r, h * 0.65, 4, 0); };

  // ---- the aisles' outer walls, with their windows, parapets and lean-to roofs -----------------
  for (const p of [NAVE, CHOIR]) for (const s of sides) {
    const x0 = p === NAVE ? WX : TX1, x1 = p === NAVE ? TX0 : EX;
    k.slab(S, x0, x1, -1.5, AISLE, s * AW - 0.5, s * AW + 0.5);
    for (const x of bays(p)) {
      k.quad(out5, x, 6.0, s * (AW + 0.52), 4.4, 6.4, face(s));
      k.quad(in5, x, 6.0, s * (AW - 0.52), 4.4, 6.4, face(-s));
    }
    parapetX(x0, x1, s * (AW + 0.3), AISLE);
    const run = AW - NW - 0.4, rise = 1.9;
    k.add(lead, new THREE.BoxGeometry(x1 - x0, 0.18, Math.hypot(run, rise)), (x0 + x1) / 2, AISLE + 0.3 + rise / 2, s * (NW + 0.5 + run / 2), 0, 0, s * Math.atan2(rise, run));
    // the aisles' fan vaults inside, flat over each aisle
    ceiling(k, vault, p.x0, p.x1, s * (NW + 0.5), s * (AW - 0.5), AISLE - 0.7, (p.x1 - p.x0) / p.bays);
  }

  // ---- the arcades, and the clerestory over them -----------------------------------------------
  for (const p of [NAVE, CHOIR]) for (const s of sides) {
    const len = p.x1 - p.x0, wall = new THREE.Shape();
    wall.moveTo(0, -1.5); wall.lineTo(len, -1.5); wall.lineTo(len, CLER); wall.lineTo(0, CLER); wall.closePath();
    const edges = [p.x0, ...piers(p), p.x1];
    for (let b = 0; b < p.bays; b++) {
      const a = edges[b] - p.x0 + (b ? 0.75 : 0.9), c = edges[b + 1] - p.x0 - (b < p.bays - 1 ? 0.75 : 0.9);
      const hole = new THREE.Path();
      hole.moveTo(a, -1.4); hole.lineTo(a, SPRING);
      pointedArch(hole, (a + c) / 2, SPRING, c - a, APEX - SPRING);
      hole.lineTo(c, -1.4); hole.closePath();
      wall.holes.push(hole);
    }
    k.shape(S, wall, T, p.x0, 0, s * NW, 0, 3, 8);
    for (const x of bays(p)) {
      k.quad(out5, x, 15.2, s * (NW + 0.52), 4.6, 6.8, face(s));
      k.quad(in5, x, 15.2, s * (NW - 0.52), 4.6, 6.8, face(-s));
    }
    parapetX(p === NAVE ? WX : TX1, p === NAVE ? TX0 : EX, s * (NW + 0.3), CLER);
    // the piers' shafts, inside, and the flying buttresses outside at each pier
    for (const x of piers(p)) {
      k.cyl(S2, x, 0, s * (NW - 0.55), 0.3, CLER - 1.8, 6);
      k.slab(S, x - 0.45, x + 0.45, -1.5, 13.4, s * (AW + 0.5), s * (AW + 1.5));
      pinnacle(x, 13.4, s * (AW + 1.0), 3.4, 0.45);
      k.beam(S, [x, 12.8, s * (AW + 0.6)], [x, 18.7, s * (NW + 0.55)], 0.5, 0.75);
      pinnacle(x, CLER + PAR, s * (NW + 0.3), 2.8);
    }
  }
  // the main roof, low behind the parapets, over the nave, the crossing and the choir
  k.roof(lead, WX + 0.6, EX - 0.6, CLER, -NW - 0.4, NW + 0.4, RIDGE - CLER);
  // the fan vault over the nave and choir
  barrel(k, vault, NAVE.x0, CHOIR.x1, 0, NW - 0.5, 18.8, 2.6, (NAVE.x1 - NAVE.x0) / NAVE.bays, false);

  // ---- the transepts ---------------------------------------------------------------------------
  for (const s of sides) {
    const zIn = s * (AW - 0.5), zOut = s * TZ;
    k.slab(S, TX0, TX0 + T, -1.5, CLER, Math.min(zIn, zOut), Math.max(zIn, zOut));
    k.slab(S, TX1 - T, TX1, -1.5, CLER, Math.min(zIn, zOut), Math.max(zIn, zOut));
    k.slab(S, TX0, TX1, -1.5, CLER, Math.min(s * (TZ - T), zOut), Math.max(s * (TZ - T), zOut));
    // the end window, and one in each side
    k.quad(out7, (TX0 + TX1) / 2, 12.8, s * (TZ + 0.02), 6.6, 11.2, face(s));
    k.quad(in7, (TX0 + TX1) / 2, 12.8, s * (TZ - T - 0.02), 6.6, 11.2, face(-s));
    for (const [x, dir] of [[TX0, -1], [TX1, 1]] as const) {
      k.quad(out5, x + dir * 0.02, 14.5, s * (AW + 3.9), 3.6, 7.0, (dir * Math.PI) / 2);
      k.quad(in5, x - dir * (T + 0.02), 14.5, s * (AW + 3.9), 3.6, 7.0, (-dir * Math.PI) / 2);
      parapetZ(s * AW, s * TZ, x + dir * 0.3, CLER);
    }
    // its gable, roof and corner pinnacles
    const gable = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(TX1 - TX0, 0), new THREE.Vector2((TX1 - TX0) / 2, RIDGE - CLER + 0.6)]);
    k.shape(S, gable, T, TX0, CLER, s * (TZ - T / 2));
    k.roof(lead, TX0 + 0.4, TX1 - 0.4, CLER, Math.min(s * NW, s * (TZ - 0.6)), Math.max(s * NW, s * (TZ - 0.6)), RIDGE - CLER, true);
    for (const x of [TX0, TX1]) pinnacle(x, CLER, s * TZ, 5.0, 0.55);
    barrel(k, vault, (TX0 + TX1) / 2, (TX0 + TX1) / 2, s * (NW + 0.5), s * (TZ - T), 18.8, 2.4, 7, true, (TX1 - TX0) / 2 - T);
    // the wall over where each aisle meets the transept
    for (const x of [TX0, TX1]) k.slab(S, x - 0.5, x + 0.5, AISLE - 0.7, CLER, Math.min(s * (NW + 0.5), s * (AW - 0.5)), Math.max(s * (NW + 0.5), s * (AW - 0.5)));
    // and over the crossing's arches into the transepts
    k.slab(S, TX0, TX1, 16.8, CLER, s * NW - 0.5, s * NW + 0.5);
    k.cyl(S2, TX0, 0, s * NW, 1.1, CLER, 8);
    k.cyl(S2, TX1, 0, s * NW, 1.1, CLER, 8);
  }

  // ---- the tower ---------------------------------------------------------------------------------
  {
    const { x0, x1, z, top, tips } = TOWER;
    // (below the vault's crown, only its walls over the crossing's arches, so it doesn't hang into the vault)
    k.slab(S, x0, x1, 21.6, top, -z, z);
    for (const [a, b] of [[x0, x0 + 0.8], [x1 - 0.8, x1]]) k.slab(S, a, b, CLER - 1, 21.6, -z, z);
    for (const s of [-1, 1]) k.slab(S, x0, x1, CLER - 1, 21.6, s > 0 ? z - 0.8 : -z, s > 0 ? z : -z + 0.8);
    k.slab(S2, x0 - 0.15, x1 + 0.15, top - 1.6, top - 1.25, -z - 0.15, z + 0.15);
    // the lower string course, a ledge to stand on all round, but for a gap to jump on the west
    // side, and none over the ridges of the choir and the transepts, so it's reached only from the
    // nave's, and the way round to the stones up the tower is over the gap (growingPieces draws it)
    for (const [a0, a1, b0, b1] of LEDGE_PIECES) kl.slab(ledgeStone, a0, a1, LEDGE.top - 1.2, LEDGE.top, b0, b1, 1);
    // the stones jutting from the tower, a stair to jump up, each a block on a smaller one under it
    for (const [a, b, c, d, y] of STEPS) {
      ks.slab(stepStone, a, b, y - 0.45, y, c, d, 1);
      ks.slab(stepStone, a + 0.1, b - 0.1, y - 0.9, y - 0.45, c + 0.1, d - 0.1, 1);
    }
    for (const s of sides) {
      for (const x of [x0 + 2.4, x1 - 2.4]) k.quad(out5, x, 32.4, s * (z + 0.02), 1.9, 8.0, face(s));
      for (const zz of [-z / 2 + 0.1, z / 2 - 0.1]) k.quad(out5, s > 0 ? x1 + 0.02 : x0 - 0.02, 32.4, zz, 1.9, 8.0, (s * Math.PI) / 2);
      parapetX(x0, x1, s * (z - 0.2), top);
      parapetZ(-z, z, s > 0 ? x1 - 0.2 : x0 + 0.2, top);
    }
    for (const [x, zz] of [[x0, -z], [x1, -z], [x0, z], [x1, z]]) {
      k.cyl(S, x, top - 9, zz, 0.85, 12.2, 8);
      k.cyl(S, x, top + 3.2, zz, 0.75, tips - top - 3.2, 8, 0);
    }
    for (const s of sides) { pinnacle((x0 + x1) / 2, top + PAR, s * (z - 0.2), 3.6); pinnacle(s > 0 ? x1 - 0.2 : x0 + 0.2, top + PAR, 0, 3.6); }
  }

  // ---- the west front ----------------------------------------------------------------------------
  {
    const front = new THREE.Shape();
    const w = 6.5, gable = RIDGE + 1.2;
    front.moveTo(-w, -1.5); front.lineTo(w, -1.5); front.lineTo(w, CLER + PAR); front.lineTo(0, gable); front.lineTo(-w, CLER + PAR); front.closePath();
    const door = new THREE.Path();
    door.moveTo(-DOOR, -1.4); door.lineTo(-DOOR, 4.4); pointedArch(door, 0, 4.4, 2 * DOOR, 2.1); door.lineTo(DOOR, -1.4); door.closePath();
    front.holes.push(door);
    k.shape(S, front, T, WX + T / 2, 0, 0, -Math.PI / 2);
    // the aisles' ends, lower, with the turrets at their corners
    for (const s of sides) {
      k.slab(S, WX, WX + T, -1.5, AISLE, Math.min(s * w, s * (AW + 0.5)), Math.max(s * w, s * (AW + 0.5)));
      parapetZ(s * w, s * (AW + 0.5), WX + 0.3, AISLE);
      k.quad(out5, WX - 0.02, 6.2, s * 9.6, 3.6, 6.0, -Math.PI / 2);
      k.quad(in5, WX + T + 0.02, 6.2, s * 9.6, 3.6, 6.0, Math.PI / 2);
      k.cyl(S, WX + 0.5, -1.5, s * (AW + 0.6), 0.95, AISLE + 3.4, 8);
      k.cyl(S, WX + 0.5, AISLE + 1.9, s * (AW + 0.6), 0.8, 2.8, 8, 0);
      // the great turrets either side of the west window, with an open crown of four pinnacles on top
      k.cyl(S, TURRET.x, -1.5, s * TURRET.z, TURRET.r, CROWN + 1.5, 8);
      k.cyl(S2, TURRET.x, CROWN - 0.3, s * TURRET.z, TURRET.r + 0.12, 0.3, 8);
      for (let a = 0; a < 4; a++) pinnacle(TURRET.x + Math.cos((a + 0.5) * Math.PI / 2) * 1.1, CROWN, s * TURRET.z + Math.sin((a + 0.5) * Math.PI / 2) * 1.1, 3.0, 0.22);
      // Bishop King's dream: a ladder of angels up the turret's face, some climbing, some coming
      // down; the north one runs on up to the crown, and is a real ladder, off a mounting stone
      const lx = TURRET.x - TURRET.r - 0.05, real = s < 0, top = real ? CROWN + 0.9 : 20.6;
      for (const dz of [-0.36, 0.36]) k.slab(S2ghost, lx - 0.08, lx + 0.08, RUNGS0, top, s * TURRET.z + dz - 0.07, s * TURRET.z + dz + 0.07, 2);
      for (let y = RUNGS0 + 0.6; y < top - 0.1; y += 0.85) k.slab(S2ghost, lx - 0.06, lx + 0.06, y, y + 0.09, s * TURRET.z - 0.36, s * TURRET.z + 0.36, 2);
      for (let a = 0; a < 6; a++) {
        const down = a % 2 === 1, y = 3.6 + a * 2.75;
        k.add(angel, figure(true, 0.5), lx - 0.18, down ? y + 1.05 : y, s * TURRET.z, -Math.PI / 2, 0, 0, down ? Math.PI : 0);
      }
      if (real) k.slab(S2, lx - 1.1, lx - 0.2, -1.5, FOOT, s * TURRET.z - 0.55, s * TURRET.z + 0.55, 1);
    }
    // the great west window, inside and out
    k.quad(out7, WX - 0.02, 14.6, 0, 8.4, 11.4, -Math.PI / 2);
    k.quad(in7, WX + T + 0.02, 14.6, 0, 8.4, 11.4, Math.PI / 2);
    // Henry VII and the saints over the door, on a ledge, and Christ in majesty in the gable
    k.slab(S2, WX - 0.6, WX, 6.6, 6.85, -3.0, 3.0);
    for (const z of [-2.2, -0.75, 0.75, 2.2]) k.add(fig, figure(false, 0.62), WX - 0.3, 6.85, z, -Math.PI / 2);
    k.add(fig, figure(false, 0.8), WX - 0.25, CLER + PAR + 0.6, 0, -Math.PI / 2);
    pinnacle(WX + 0.5, gable, 0, 2.2, 0.3);
    // the doors, open, against the reveals, and the steps up to them
    for (const s of sides) k.slab(wood, WX + T, WX + T + 1.6, 0, 5.2, s * DOOR - (s > 0 ? 0.12 : 0), s * DOOR + (s > 0 ? 0 : 0.12));
    k.slab(S2, WX - 1.0, WX, -1.5, -0.3, -DOOR - 0.8, DOOR + 0.8);
    k.slab(S2, WX - 2.0, WX - 1.0, -1.5, -0.6, -DOOR - 0.8, DOOR + 0.8);
    k.slab(S2, WX, WX + T, -0.3, 0.02, -DOOR, DOOR);
  }

  // ---- the east end ----------------------------------------------------------------------------------
  {
    const w = 6.5, end = new THREE.Shape();
    end.moveTo(-w, -1.5); end.lineTo(w, -1.5); end.lineTo(w, CLER + PAR); end.lineTo(0, RIDGE + 0.8); end.lineTo(-w, CLER + PAR); end.closePath();
    k.shape(S, end, T, EX - T / 2, 0, 0, -Math.PI / 2);
    k.quad(outSq, EX + 0.02, 12.6, 0, 9.4, 12.6, Math.PI / 2);
    k.quad(inSq, EX - T - 0.02, 12.6, 0, 9.4, 12.6, -Math.PI / 2);
    for (const s of sides) {
      k.slab(S, EX - T, EX, -1.5, AISLE, Math.min(s * w, s * (AW + 0.5)), Math.max(s * w, s * (AW + 0.5)));
      parapetZ(s * w, s * (AW + 0.5), EX - 0.3, AISLE);
      k.quad(out5, EX + 0.02, 6.0, s * 9.6, 3.6, 6.0, Math.PI / 2);
      k.quad(in5, EX - T - 0.02, 6.0, s * 9.6, 3.6, 6.0, -Math.PI / 2);
      k.cyl(S, EX - 0.4, -1.5, s * 6.7, 1.2, CLER + 4, 8);
      k.cyl(S, EX - 0.4, CLER + 2.5, s * 6.7, 1.05, 4.0, 8, 0);
      k.cyl(S, EX - 0.5, -1.5, s * (AW + 0.6), 0.85, AISLE + 3.0, 8);
      k.cyl(S, EX - 0.5, AISLE + 1.5, s * (AW + 0.6), 0.7, 2.6, 8, 0);
    }
  }

  // ---- the low buildings along the south side ---------------------------------------------------------
  k.slab(S2, -28.4, TX0 - 0.6, -1.5, 4.6, AW + 0.5, 18.9);
  parapetX(-28.4, TX0 - 0.6, 18.7, 4.6);
  k.slab(S2, TX1 + 0.6, EX - 0.2, -1.5, 6.2, AW + 0.5, 19.4);
  parapetX(TX1 + 0.6, EX - 0.2, 19.2, 6.2);
  for (const [x0, x1, h] of [[-28.4, TX0 - 0.6, 4.6], [TX1 + 0.6, EX - 0.2, 6.2]]) {
    for (let x = x0 + 2.6; x < x1 - 1.5; x += 4.2) k.quad(out5, x, h / 2 + 0.2, (h > 5 ? 19.4 : 18.9) + 0.02, 1.8, h - 2.0);
  }

  // ---- inside: the floor, the pews, the choir, the altar and the organ ----------------------------------
  k.slab(floorMat, WX + T, EX - T, -0.4, 0.02, -AW + 0.5, AW - 0.5, 2.5);
  for (const s of sides) k.slab(floorMat, TX0 + T, TX1 - T, -0.4, 0.02, Math.min(s * (AW - 0.5), s * (TZ - T)), Math.max(s * (AW - 0.5), s * (TZ - T)), 2.5);
  for (const x of PEWS) for (const s of sides) {
    k.slab(wood, x, x + 0.45, 0, 0.45, Math.min(s * 1.0, s * 4.9), Math.max(s * 1.0, s * 4.9), 1);
    k.slab(wood, x + 0.42, x + 0.52, 0, 0.98, Math.min(s * 1.0, s * 4.9), Math.max(s * 1.0, s * 4.9), 1);
  }
  for (const s of sides) {
    k.slab(wood, 14.2, 27.6, 0, 1.15, Math.min(s * 3.5, s * 4.9), Math.max(s * 3.5, s * 4.9), 1);
    k.slab(wood, 14.2, 27.6, 1.15, 2.6, Math.min(s * 4.75, s * 4.9), Math.max(s * 4.75, s * 4.9), 1);
  }
  k.slab(S2, 30.8, 32.2, 0, 1.0, -1.5, 1.5);
  k.slab(cloth, 30.75, 32.25, 1.0, 1.06, -1.55, 1.55, 1);
  k.slab(gold, 31.45, 31.55, 1.06, 2.0, -0.05, 0.05, 1);
  k.slab(gold, 31.45, 31.55, 1.6, 1.7, -0.32, 0.32, 1);
  for (const z of [-1.1, 1.1]) k.cyl(gold, 31.5, 1.06, z, 0.05, 0.6, 6);
  k.slab(wood, 29.2, 29.4, 0, 0.9, -4.5, 4.5, 1);                        // the altar rail
  // the organ, its case and gilded pipes, in the north transept
  k.slab(wood, TX0 + 1.4, TX1 - 1.4, 0, 6.5, -TZ + T, -TZ + T + 2.0, 1);
  for (let i = 0; i < 15; i++) {
    const x = TX0 + 1.9 + (i * (TX1 - TX0 - 3.8)) / 14, h = 3.0 + 2.4 * Math.cos(((i - 7) / 7) * Math.PI / 2);
    k.cyl(gold, x, 6.5, -TZ + T + 1.8, 0.16, h, 6);
  }

  const grp = k.build();
  grp.add(growingPieces(ks, STEPS.map(([a, b, c, d, t], i) => [a, b, c, d, t - 0.9, t, t, i ? 0 : 1]), "steps"));
  grp.add(growingPieces(kl, LEDGE_PIECES.map(([a, b, c, d, o]) => [a, b, c, d, LEDGE.top - 1.2, LEDGE.top, o, o ? 0 : 1]), "ledge"));
  for (const m of [out5, out7, outSq]) glow(grp, m, 0, 0.9);
  for (const m of [in5, in7, inSq]) glow(grp, m, 0.75, 0.15);
  return grp;
}

/** The stones, or the ledge, as one mesh that can grow out of the tower's walls (userData[key]).
 *  Pieces are [x0, x1, z0, z1, y0, y1, lift, marked]. climb.ts sets uReach (how far the route may
 *  be out) and uGlow (a gold shimmer on the tops of marked pieces, to show where to go next): a
 *  piece slides out over a metre and a bit as the reach passes its lift. They're solid whether or
 *  not they're out. */
function growingPieces(kit: Kit, pieces: number[][], key: "steps" | "ledge"): THREE.Mesh {
  // the material that build() hands back is the merged copy, so the shader goes on that one
  const mesh = kit.build().children[0] as THREE.Mesh, mat = mesh.material as THREE.MeshLambertMaterial, g = mesh.geometry, p = g.attributes.position, nm = g.attributes.normal;
  const { x0, x1, z } = TOWER, eps = 0.01, anchor = new Float32Array(p.count * 3), lift = new Float32Array(p.count), mark = new Float32Array(p.count);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), zz = p.getZ(i);
    const st = pieces.find(([a, b, c, d, lo, hi]) => x >= a - eps && x <= b + eps && zz >= c - eps && zz <= d + eps && y >= lo - eps && y <= hi + eps);
    if (!st) { anchor.set([x, y, zz], i * 3); lift[i] = -1e4; continue; }
    anchor.set([clamp((st[0] + st[1]) / 2, x0, x1), y, clamp((st[2] + st[3]) / 2, -z, z)], i * 3);
    lift[i] = st[6];
    mark[i] = st[7] && nm.getY(i) > 0.5 ? 1 : 0;
  }
  g.setAttribute("anchor", new THREE.BufferAttribute(anchor, 3));
  g.setAttribute("lift", new THREE.BufferAttribute(lift, 1));
  g.setAttribute("mark", new THREE.BufferAttribute(mark, 1));
  const reach = { value: -1e4 }, glow = { value: 0 };
  mat.userData.grow = { reach, glow };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uReach = reach; sh.uniforms.uGlow = glow;
    sh.vertexShader = "attribute vec3 anchor;\nattribute float lift;\nattribute float mark;\nvarying float vMark;\nuniform float uReach;\n" + sh.vertexShader.replace("#include <begin_vertex>",
      `vMark = mark;\nvec3 transformed = anchor + (position - anchor) * clamp((uReach - lift) / ${STONE_SLIDE.toFixed(1)}, 0., 1.);`);
    sh.fragmentShader = "varying float vMark;\nuniform float uGlow;\n" + sh.fragmentShader
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.62, 0.08), 0.85 * vMark * uGlow);")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.6, 0.38, 0.04) * vMark * uGlow;");
  };
  mesh.userData[key] = true;
  return mesh;
}

/** A fan vault's flat ceiling, facing down, from x0 to x1 and z0 to z1 at height y, a bay to a repeat. */
function ceiling(k: Kit, mat: THREE.Material, x0: number, x1: number, z0: number, z1: number, y: number, bay: number) {
  const g = new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0));
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * Math.abs(x1 - x0)) / bay, uv.getY(i));
  k.add(mat, g, (x0 + x1) / 2, y, (z0 + z1) / 2, 0, 0, Math.PI / 2);
}

/** A shallow barrel of fan vaulting from (x0, z0) to (x1, z1), half wide each side, springing at y
 *  and rising rise to its crown, a bay to a repeat; alongZ for one running along z. */
function barrel(k: Kit, mat: THREE.Material, x0: number, x1: number, z0: number, z1: number, y: number, rise: number, bay: number, alongZ: boolean, half = NW - 0.5) {
  const len = alongZ ? Math.abs(z1 - z0) : x1 - x0;
  const g = new THREE.CylinderGeometry(1, 1, len, 18, 1, true, -Math.PI / 2, Math.PI);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) * len) / bay);
  g.scale(half, 1, rise);
  if (alongZ) k.add(mat, g, x0, y, (z0 + z1) / 2, 0, 0, -Math.PI / 2);
  else k.add(mat, g, (x0 + x1) / 2, y, z0, 0, 0, -Math.PI / 2, -Math.PI / 2);
}

