// The Royal Crescent, as a set piece (landmarks/setpieces.ts) in place of the plain terraces the
// map tools build round it: John Wood the Younger's half-ellipse of thirty-odd houses, built 1767-74,
// looking south-south-west over its lawn to Royal Victoria Park. As the listing describes it:
// - one palace front all the way round the curve, with "Queen Anne fronts and Mary Anne backs":
//   behind it each house was built as its buyer pleased, so the backs are all depths and the roofs
//   step from house to house;
// - a plain ashlar ground floor, the front doors with their fanlights, and the basement areas in
//   front behind iron railings, crossed by a little bridge of stone to each door;
// - a giant order of Ionic columns, about a hundred of them, standing on a band at the first floor
//   and running up through the first and second floors to a full entablature, with a balustrade
//   along the top and slate roofs, dormers and chimney stacks behind it;
// - in the very middle, on the long axis, the one round-headed window in the whole front;
// - a broad flagged pavement in front of the railings, out to the street.
// The front is laid on the ellipse the map's own footprints fit (to a third of a metre or so), and
// each house where the map has it, at its own depth.
//
// Its frame: the origin is the middle of that ellipse, out on the lawn, at the street's level in
// front; x runs along its long axis (east-south-east), +z out towards the lawn, and the houses are
// on the -z side. A place on the crescent is t round the ellipse (0 at the east end of the long
// axis, π at the west) and s out from the front towards the back. Solid as it's drawn
// (landmarks/shape.ts): you can walk the pavement, cross into the doorways and stand on the roofs.
import * as THREE from "three";
import { Kit, stone, plain, slate, sashGlass, archedGlass, balusters, georgian, glow } from "./kit";
import * as TX from "../textures";

/** The ellipse the front is laid on: half its length, and half its width. */
const A = 82.34, B = 58.13;
/** Where the houses' party walls are, t round the ellipse from the east end to the west: the
 *  ends of the crescent first and last. The five in the middle are the hotel the map has as one. */
const WALLS = [-0.17, -0.024, 0.107, 0.236, 0.358, 0.48, 0.59, 0.707, 0.814, 0.915, 1.0135, 1.1135, 1.2105, 1.3015,
  1.4062, 1.5109, 1.6156, 1.7203, 1.825, 1.9225, 2.019, 2.115, 2.2125, 2.313, 2.4265, 2.535, 2.6515, 2.773, 2.8945, 3.017, 3.155, 3.344];
/** How deep each house is, front to back (the map's footprints). */
const DEPTH = [17.5, 16.4, 13.4, 13.4, 13.4, 13.7, 14, 16.4, 16.3, 16.2, 18, 18, 17.8, 16.9, 16.9, 16.9, 16.9, 16.9,
  15.6, 15.8, 13.5, 17.7, 18.3, 18.3, 14, 14.3, 14.3, 13.9, 13.8, 17.9, 18.5];
const T0 = WALLS[0], T1 = WALLS[WALLS.length - 1];
/** How deep house h is at t: the two end houses' outer walls don't run straight back but slant
 *  in towards the middle, from the front's corner to the back's (the map's footprints). */
function depthAt(h: number, t: number): number {
  const lerp = (a: number, b: number, f: number) => a + (b - a) * Math.min(1, Math.max(0, f));
  if (h === 0) return t < -0.123 ? lerp(1.5, 17.9, (t + 0.17) / 0.047) : lerp(17.9, 16.4, (t + 0.123) / 0.099);
  if (h === DEPTH.length - 1) return t > 3.285 ? lerp(18.9, 3, (t - 3.285) / 0.059) : 18.5;
  return DEPTH[h];
}
/** Where the street's pavement (or, where it has none on this side, its carriageway) began in the
 *  map it was first fitted to, s at t = -0.2, -0.15, ... 3.35: where the square has no carriageway
 *  of its own to meet (crescentEdges), the flagged pavement runs out to here. */
const EDGE = [-9.6, -10.1, -10.7, -11.2, -11.7, -12, -12.1, -12.1, -12.1, -12.1, -12.1, -11.9, -11.8, -11.8, -11.7, -11.6,
  -11.6, -11.5, -11.6, -11.6, -11.6, -11.6, -11.6, -11.8, -11.7, -11.9, -11.9, -11.8, -11.8, -11.9, -13.9, -13.9, -14, -14,
  -14, -14, -14.2, -14.3, -14.3, -14.5, -14.5, -14.6, -14.7, -14.7, -14.7, -14.9, -15, -15.1, -15, -14.8, -14.7, -14.6, -14.6,
  -14.5, -14.3, -14.4, -14.4, -14.3, -14.2, -14.2, -14.1, -14.1, -14, -14, -13.9, -13.8, -13.5, -13.4, -13.1, -12.5, -11.9, -11.3];
const edgeAt = (edge: number[], t: number) => {
  const f = Math.min(edge.length - 1.001, Math.max(0, (t + 0.2) / 0.05)), i = Math.floor(f);
  return edge[i] + (edge[i + 1] - edge[i]) * (f - i);
};
const EDGE_REACH = 3;       // metres either side of EDGE that the square's carriageway is looked for

/** The origin's height above sea level: the street's level in front of the middle. */
export const CRESCENT_Y = 51.5;
const KERB = 0.17;          // how far the map's pavement stands over the street as written (world.ts FACE_LIFT)

/** Where the flags run out to, s at each of EDGE's t, and how high they stand there: to the near side
 *  of the square's own carriageway (road(x, z) in the set piece's frame: its height above sea level
 *  there, or null off it), so they meet its kerb however the map lays the street, with no verge or
 *  stray bit of pavement between, and a kerb over it as the map's own pavements stand (the street
 *  isn't level all the way round); EDGE and PAVE where there is no carriageway near. */
export function crescentFit(road: (x: number, z: number) => number | null): { edge: number[]; top: number[] } {
  const hits = EDGE.map((e, i): [number, number | null] => {
    const t = -0.2 + 0.05 * i;
    for (let s = Math.min(RAIL - 1, e + EDGE_REACH); s >= e - EDGE_REACH; s -= 0.1) {
      const h = road(...at(t, s));
      if (h !== null) return [s + 0.05, h];
    }
    return [e, null];
  });
  const found = hits.map(([s]) => s);
  // (a lone stretch caught on a bit of carriageway poking in, at a corner, mustn't make a notch)
  const edge = found.map((e, i) => +Math.min(e, Math.max(found[i - 1] ?? e, found[i + 1] ?? e)).toFixed(2));
  const top = hits.map(([, h]) => (h === null ? PAVE : +Math.max(PAVE, h + KERB - CRESCENT_Y).toFixed(2)));
  return { edge, top };
}

// heights above the street in front
const GF = 4.55;            // the band at the first floor, under the columns
const CAP = 12.45;          // the columns' capitals
const ENT = 12.9;           // the entablature, up to
const TOP = 14.6;           // its cornice's top, where the roofs start
const AREA = -2.5;          // the floor of the basement areas
const PAVE = 0.12;          // the flagged pavement's top
const RAIL = -2.4;          // the railings round the areas, s

/** The outward normal at t (away from the lawn), in the set piece's frame. */
function normal(t: number): [number, number] {
  const nx = Math.cos(t) / A, nz = -Math.sin(t) / B, l = Math.hypot(nx, nz);
  return [nx / l, nz / l];
}
/** x, z of the place t round the crescent and s back from its front. */
function at(t: number, s: number): [number, number] {
  const [nx, nz] = normal(t);
  return [A * Math.cos(t) + s * nx, -B * Math.sin(t) + s * nz];
}
/** Which way the crescent runs at t (as t grows, east to west). */
function along(t: number): [number, number] {
  const x = -A * Math.sin(t), z = -B * Math.cos(t), l = Math.hypot(x, z);
  return [x / l, z / l];
}
/** The turn that faces a flat thing (made facing +z) out of the front at t, to the lawn. */
const facing = (t: number) => { const [nx, nz] = normal(t); return Math.atan2(-nx, -nz); };
/** Metres along the front per unit of t. */
const speed = (t: number) => Math.hypot(A * Math.sin(t), B * Math.cos(t));

// how far along the front each t is, for laying textures on without a seam
const ARC_N = 2000, ARC_LO = T0 - 0.2, ARC_HI = T1 + 0.2, ARC: number[] = [0];
for (let i = 1; i <= ARC_N; i++) {
  const ta = ARC_LO + ((ARC_HI - ARC_LO) * (i - 1)) / ARC_N, tb = ARC_LO + ((ARC_HI - ARC_LO) * i) / ARC_N;
  const [ax, az] = at(ta, 0), [bx, bz] = at(tb, 0);
  ARC.push(ARC[i - 1] + Math.hypot(bx - ax, bz - az));
}
const arcTo = (t: number) => {
  const f = Math.min(ARC_N - 0.001, Math.max(0, ((t - ARC_LO) / (ARC_HI - ARC_LO)) * ARC_N)), i = Math.floor(f);
  return ARC[i] + (ARC[i + 1] - ARC[i]) * (f - i);
};

type Prof = [number, number][];

/** Sweep a section (s, y points round it) along the crescent from ta to tb: a curved wall,
 *  cornice, roof or pavement, smooth round the curve, closed at its ends (in capMat, if given).
 *  The section can change along the way (the same number of points). tile: metres to a repeat. */
function sweep(k: Kit, mat: THREE.Material, section: Prof | ((t: number) => Prof), ta: number, tb: number, tile = 3, capMat?: THREE.Material | null) {
  const profAt = (t: number) => {
    const p = typeof section === "function" ? section(t) : section;
    let area = 0;
    for (let j = 0; j < p.length; j++) { const [a, b] = p[j], [c, d] = p[(j + 1) % p.length]; area += a * d - c * b; }
    return area < 0 ? [...p].reverse() : p;
  };
  const n = Math.max(1, Math.ceil((arcTo(tb) - arcTo(ta)) / 1.5));
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const v = new THREE.Vector3(), w = new THREE.Vector3(), c = new THREE.Vector3();
  /** One triangle, wound to face n (each corner's own normal), with its texture coordinates. */
  const tri = (p: number[][], ns: number[][], us: number[][]) => {
    v.set(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]);
    w.set(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]);
    c.crossVectors(v, w);
    const order = c.x * (ns[0][0] + ns[1][0] + ns[2][0]) + c.y * (ns[0][1] + ns[1][1] + ns[2][1]) + c.z * (ns[0][2] + ns[1][2] + ns[2][2]) < 0 ? [0, 2, 1] : [0, 1, 2];
    for (const o of order) { pos.push(...p[o]); nor.push(...ns[o]); uv.push(...us[o]); }
  };
  for (let i = 0; i < n; i++) {
    const t0 = ta + ((tb - ta) * i) / n, t1 = ta + ((tb - ta) * (i + 1)) / n;
    const p0 = profAt(t0), p1 = profAt(t1), u0 = arcTo(t0) / tile, u1 = arcTo(t1) / tile;
    const N0 = normal(t0), N1 = normal(t1);
    for (let j = 0; j < p0.length; j++) {
      const k1 = (j + 1) % p0.length;
      const [sa, ya] = p0[j], [sb, yb] = p0[k1], [sc, yc] = p1[k1], [sd, yd] = p1[j];
      // the edge's outward normal in the section (s, y), round it anticlockwise
      const ds = sb - sa, dy = yb - ya, L = Math.hypot(ds, dy) || 1, ns = dy / L, ny = -ds / L;
      const upright = Math.abs(ns) > Math.abs(ny);
      const P = (t: number, s: number, y: number) => { const [x, z] = at(t, s); return [x, y, z]; };
      const Nn = (N: [number, number]) => [ns * N[0], ny, ns * N[1]];
      const U = (u: number, s: number, y: number) => [u, (upright ? y : s) / tile];
      const a = P(t0, sa, ya), b = P(t0, sb, yb), cc = P(t1, sc, yc), d = P(t1, sd, yd);
      const na = Nn(N0), nd = Nn(N1);
      tri([a, b, cc], [na, na, nd], [U(u0, sa, ya), U(u0, sb, yb), U(u1, sc, yc)]);
      tri([a, cc, d], [na, nd, nd], [U(u0, sa, ya), U(u1, sc, yc), U(u1, sd, yd)]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  k.add(mat, g);
  if (capMat === null) return;
  // the ends, flat across the section
  const cp: number[] = [], cn: number[] = [], cu: number[] = [];
  for (const [t, sign] of [[ta, -1], [tb, 1]]) {
    const p = profAt(t), [tx, tz] = along(t), nn = [sign * tx, 0, sign * tz];
    const tris = THREE.ShapeUtils.triangulateShape(p.map(([s, y]) => new THREE.Vector2(s, y)), []);
    for (const f of tris) {
      const q = f.map((j) => { const [x, z] = at(t, p[j][0]); return [x, p[j][1], z]; });
      v.set(q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]);
      w.set(q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]);
      c.crossVectors(v, w);
      const order = c.x * nn[0] + c.z * nn[2] < 0 ? [0, 2, 1] : [0, 1, 2];
      for (const o of order) { cp.push(...q[o]); cn.push(...nn); cu.push(p[f[o]][0] / tile, p[f[o]][1] / tile); }
    }
  }
  const e = new THREE.BufferGeometry();
  e.setAttribute("position", new THREE.Float32BufferAttribute(cp, 3));
  e.setAttribute("normal", new THREE.Float32BufferAttribute(cn, 3));
  e.setAttribute("uv", new THREE.Float32BufferAttribute(cu, 2));
  k.add(capMat ?? mat, e);
}

/** A rectangle round the crescent from s0 to s1, y0 to y1. */
const rect = (s0: number, s1: number, y0: number, y1: number): Prof => [[s0, y0], [s1, y0], [s1, y1], [s0, y1]];

export function royalCrescent(args: (number | string)[] = []): THREE.Object3D {
  const k = new Kit();
  const fit = args.length === 2 * EDGE.length ? args.map(Number) : null;
  const edge = fit?.slice(0, EDGE.length) ?? EDGE, top = fit?.slice(EDGE.length) ?? EDGE.map(() => PAVE);
  const S = stone("#ecdcb5"), S2 = stone("#dac79e"), G = georgian("#d6c096"), roofs = slate();
  const sash = sashGlass(), arched = archedGlass(), bal = balusters();
  const door = plain("#2c302d"), pots = plain("#9a5a3c"), flags = stone("#c4bba8"), floor = stone("#9d9380");
  const iron = new THREE.MeshLambertMaterial({ color: "#1e2124", map: railTex(), alphaTest: 0.5, side: THREE.DoubleSide });

  /** Put a flat thing (a window, a door) on the front at t, s out from the front, its middle y up. */
  const onFront = (m: THREE.Material, t: number, s: number, y: number, wd: number, h: number, u0 = 0, v0 = 0, u1 = 1, v1 = 1) => {
    const [x, z] = at(t, s);
    k.quad(m, x, y, z, wd, h, facing(t), u0, v0, u1, v1);
  };
  /** A box on the front at t: wd along it, h up from y, dp deep, its middle s back from the front. */
  const boxAt = (m: THREE.Material, t: number, s: number, y: number, wd: number, h: number, dp: number) => {
    const [x, z] = at(t, s);
    k.box(m, x, y, z, wd, h, dp, facing(t));
  };

  // ---- the front, all the way round ------------------------------------------------------------
  sweep(k, S, rect(-0.05, 0.3, AREA - 0.1, ENT), T0, T1, 3);                              // the ashlar
  sweep(k, S2, rect(-0.28, 0.3, GF, GF + 0.35), T0, T1, 1.5);                             // the band under the columns
  sweep(k, S2, rect(-0.18, 0.3, PAVE - 0.05, 0.3), T0, T1, 1.5);                           // the plinth at the pavement
  // the entablature: architrave, frieze and cornice
  sweep(k, S2, [[-0.75, ENT], [0.3, ENT], [0.3, TOP], [-1.15, TOP], [-1.15, TOP - 0.22], [-0.62, TOP - 0.55], [-0.62, ENT + 0.55], [-0.75, ENT + 0.55]], T0, T1, 1.5);
  // the balustrade along the top: its plinth, the balusters (bay by bay, below) and the rail
  sweep(k, S2, rect(-0.2, 0.5, TOP, TOP + 0.25), T0, T1, 1.5);
  sweep(k, S2, rect(-0.25, 0.55, TOP + 0.95, TOP + 1.15), T0, T1, 1.5);

  // ---- the basement areas, and the flagged pavement out to the street ---------------------------
  sweep(k, floor, rect(RAIL, -0.05, AREA - 0.2, AREA), T0, T1, 2, null);
  sweep(k, flags, (t) => { const s0 = Math.min(RAIL - 1, edgeAt(edge, t) - 0.1); return [[s0, AREA - 0.2], [RAIL, AREA - 0.2], [RAIL, PAVE], [s0, edgeAt(top, t)]]; }, T0, T1, 2);

  // ---- the houses ------------------------------------------------------------------------------
  const middle = Math.PI / 2;
  for (let h = 0; h < DEPTH.length; h++) {
    const ta = WALLS[h], tb = WALLS[h + 1], D = DEPTH[h];
    // the house behind its front: its back and sides with plain sash windows (each as its builder
    // pleased), and its roof, a ridge along the middle with its gables in stone
    sweep(k, G, (t) => rect(0.3, Math.max(0.6, depthAt(h, t)), AREA - 1.5, TOP), ta, tb, 3.4);
    const rise = Math.min(4.2, 0.3 * (D - 1)), ridge = (D + 0.9) / 2;
    sweep(k, roofs, (t) => {
      const d = Math.max(1.2, depthAt(h, t)), r = Math.min(rise, 0.3 * (d - 1));
      return [[0.9, TOP], [d - 0.15, TOP], [(d + 0.9) / 2, TOP + r]];
    }, ta, tb, 2, S2);
    // the chimney stack on the party wall, with its pots
    if (h > 0) {
      const mid = Math.min(ridge, (DEPTH[h - 1] + 0.9) / 2);
      boxAt(S2, ta, mid, TOP, 0.9, rise + 2.0, 2.6);
      for (const ds of [-0.8, 0, 0.8]) { const [x, z] = at(ta, mid + ds); k.cyl(pots, x, TOP + rise + 2.0, z, 0.16, 0.55, 6); }
    }
    // three bays to a house, a column between each, the door at one side
    const doorBay = h % 2 ? 0 : 2;
    for (let b = 0; b < 3; b++) {
      const t = ta + ((tb - ta) * (b + 0.5)) / 3, bw = (speed(t) * (tb - ta)) / 3;
      const centre = Math.abs(t - middle) < (tb - ta) / 6;
      // the ground floor: the door up a step under its fanlight and cornice, or a window
      if (b === doorBay) {
        onFront(door, t, -0.07, 0.3 + 1.3, 1.2, 2.6);
        onFront(arched, t, -0.07, 3.25, 1.2, 0.7, 0, 0.62, 1, 1);
        boxAt(S2, t, -0.15, 3.65, 1.9, 0.22, 0.5);
        boxAt(S2, t, -0.35, PAVE, 1.6, 0.18, 0.6);
        // the bridge over the area to it, with railings either side
        boxAt(flags, t, (RAIL - 0.05) / 2, PAVE - 0.35, 1.7, 0.35, -RAIL);
        const side = (bw - 1.7) / 2;
        for (const sg of [-1, 1]) {
          const tt = t + (sg * (0.85 + side / 2)) / speed(t);
          onFront(iron, tt, RAIL, PAVE + 0.6, side, 2.0, 0, 0, side / 2, 1);
        }
        for (const sg of [-1, 1]) {
          const [ax, az] = at(t + (sg * 0.85) / speed(t), RAIL / 2), [tx, tz] = along(t);
          k.quad(iron, ax, PAVE + 0.6, az, -RAIL, 2.0, Math.atan2(tx, tz), 0, 0, -RAIL / 2, 1);
        }
      } else {
        onFront(sash, t, -0.07, 2.2, 1.2, 2.3);
        onFront(sash, t, -0.07, AREA + 1.0, 1.1, 1.4);       // the basement's window, down in the area
        onFront(iron, t, RAIL, PAVE + 0.6, bw, 2.0, 0, 0, bw / 2, 1);
      }
      // the first floor's tall windows (the one round-headed one in the middle), and the second's
      if (centre) onFront(arched, t, -0.07, GF + 2.45, 1.4, 3.3);
      else onFront(sash, t, -0.07, GF + 2.3, 1.25, 3.0);
      onFront(sash, t, -0.07, 10.6, 1.15, 1.9);
      // the balusters between the pedestals, and a dormer in the roof behind
      onFront(bal, t, 0.15, TOP + 0.6, bw - 0.8, 0.75, 0, 0, (bw - 0.8) / 1.6, 1);
      boxAt(roofs, t, 1.9, TOP, 1.4, 1.75, 1.6);
      onFront(sash, t, 1.08, TOP + 0.95, 0.8, 1.1);
    }
  }

  // ---- the giant Ionic columns, one between every bay, and a pedestal over each -----------------
  const cols: number[] = [];
  for (let h = 0; h < DEPTH.length; h++) for (let b = 0; b < 3; b++) cols.push(WALLS[h] + ((WALLS[h + 1] - WALLS[h]) * b) / 3);
  cols.push(T1);
  for (const t of cols) {
    const [x, z] = at(t, -0.38);
    boxAt(S2, t, -0.38, GF + 0.35, 1.0, 0.3, 1.0);                       // its base
    k.cyl(S, x, GF + 0.65, z, 0.4, CAP - GF - 0.65, 10, 0.35);
    boxAt(S2, t, -0.38, CAP, 1.15, ENT - CAP, 0.95);                     // its capital and volutes
    boxAt(S2, t, 0.15, TOP + 0.25, 0.75, 0.7, 0.75);                      // the balustrade's pedestal
  }

  const grp = k.build();
  for (const m of [sash, arched]) glow(grp, m, 0, 0.85);
  glow(grp, G, 0, 0.9);
  return grp;
}

/** Iron railings with spear tops, cut out, two metres a repeat. */
let rails: THREE.Texture | null = null;
function railTex() { return (rails ??= TX.railings()); }

// ---- what the set piece covers (setpieces.ts), in its frame ----------------------------------------

/** Everything from the street's kerb (s at each of EDGE's t: crescentEdges) to the backs of the houses, all the way round. */
export function crescentOutline(edge: number[] = EDGE): [number, number][] {
  const out: [number, number][] = [], n = 120;
  for (let i = 0; i <= n; i++) { const t = T0 + ((T1 - T0) * i) / n; out.push(at(t, edgeAt(edge, t) - 0.2)); }
  for (let h = DEPTH.length - 1; h >= 0; h--) for (let i = 8; i >= 0; i--) {
    const t = WALLS[h] + ((WALLS[h + 1] - WALLS[h]) * i) / 8;
    out.push(at(t, depthAt(h, t) + 0.8));
  }
  return out.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)] as [number, number]);
}
export const CRESCENT_OUTLINE = crescentOutline();

/** The houses themselves, each its own outline, where it's solid all the way through (not the
 *  pavement in front, where you can stand). */
export const CRESCENT_SOLID: [number, number][][] = DEPTH.map((_, h) => {
  const ts = [0, 0.25, 0.5, 0.75, 1].map((f) => WALLS[h] + (WALLS[h + 1] - WALLS[h]) * f);
  return [...ts.map((t) => at(t, 0.3)), ...ts.reverse().map((t) => at(t, Math.max(0.6, depthAt(h, t) - 0.3)))];
});

/** The ground it lowers: everywhere inside it to just under the street's level, under the
 *  pavement, and down to the floor of the basement areas along the front (rectangles in its frame,
 *  each round a short stretch of the areas). */
export const CRESCENT_SINK: { x0: number; x1: number; z0: number; z1: number; y: number; over?: boolean }[] = (() => {
  const out: { x0: number; x1: number; z0: number; z1: number; y: number; over?: boolean }[] = [{ x0: -120, x1: 120, z0: -120, z1: 40, y: -0.05, over: true }];
  for (let t = T0; t < T1; t += 0.04) {
    const q = [at(t, RAIL), at(t, -0.1), at(Math.min(T1, t + 0.04), RAIL), at(Math.min(T1, t + 0.04), -0.1)];
    const xs = q.map((p) => p[0]), zs = q.map((p) => p[1]);
    out.push({ x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), y: AREA - 0.3 });
  }
  return out;
})();
