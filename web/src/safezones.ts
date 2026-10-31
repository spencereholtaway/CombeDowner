// Safe zones: the grounds of every nursery and primary school on the map, and 200 m round them.
// Nothing that fights turns up in one: no gang of naughty boys, no team, no Flag Lads' takeover or
// ladder lad, no Wanted man or his crew. Nor does anything to pick up apart from rides and ladders:
// no markers, rounds, pints, fizz or Lucozade, whether scattered about, dropped or won as a prize.
// A gang that chases you in still chases you; they just never start there.
//
// The schools come from the map's named areas (map.d.pl, the city-wide map.wide.d.pl, and each square
// of Bath's own, which has a few near the edge of the map that the city-wide list leaves out), picked
// out by name, as that's all the data says about who goes there: nurseries, pre-schools, playgroups,
// infant, junior and primary schools, church schools (in Bath the church schools are all primaries),
// prep and pre-prep schools, and Three Ways, a special school that takes children from four.
//
// Every player has the same named areas for the map and the city-wide map, so asking with squares
// off gives everyone the same answer, for choices every player makes alike (a Wanted man's stops).
// The host asks with the squares too when it places things, as only it does.
import type { GameMap, Place } from "./map";

/** How far round a school's grounds nothing that fights turns up (metres). */
export const SAFE_REACH = 200;

const YOUNG = /nursery|pre-?school|playgroup|kindergarten|montessori|cr[eè]che|primary|infant|junior|first school|church school|\bprep\b|preparatory|three ways school/i;

/** One school's grounds, in scene x, z pairs, and the box round them. */
interface Zone { ring: number[]; x0: number; x1: number; z0: number; z1: number }
const zonesOf = new WeakMap<Place[], Zone[]>();

/** The nursery and primary school grounds among one list of named areas (worked out once per list). */
function zones(pl: Place[] | undefined): Zone[] {
  if (!pl) return [];
  const had = zonesOf.get(pl);
  if (had) return had;
  const out: Zone[] = [];
  for (const p of pl) {
    if (!p.n || p.r.length < 3 || !YOUNG.test(p.n)) continue;
    const ring: number[] = [];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of p.r) {
      const x = q[0], z = -q[1];
      ring.push(x, z);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    out.push({ ring, x0, x1, z0, z1 });
  }
  zonesOf.set(pl, out);
  return out;
}

/** True if scene (x, z) is on the grounds or within r of their edge. */
function within(zn: Zone, x: number, z: number, r: number): boolean {
  if (x < zn.x0 - r || x > zn.x1 + r || z < zn.z0 - r || z > zn.z1 + r) return false;
  const R = zn.ring, n = R.length / 2;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = R[i * 2], az = R[i * 2 + 1], bx = R[j * 2], bz = R[j * 2 + 1];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
    const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l));
    if (Math.hypot(x - ax - t * dx, z - az - t * dz) < r) return true;
  }
  return inside;
}

/**
 * True if scene (x, z) is within SAFE_REACH of a nursery or primary school's grounds (plus pad
 * metres, for something whose crew stands a little way off the spot). squares: look at the squares
 * of Bath loaded here too (host only: see the top of the file).
 */
export function inSafeZone(map: GameMap, x: number, z: number, pad = 0, squares = true): boolean {
  const r = SAFE_REACH + pad;
  const lists: (Place[] | undefined)[] = [map.d.pl, map.wide?.d.pl];
  if (squares) for (const t of map.tilesNear(x, z, r)) lists.push(t.d.pl);
  return lists.some((pl) => zones(pl).some((zn) => within(zn, x, z, r)));
}
