// Where things happen: street corners, alleys, bus stops, shop fronts and pubs, in Combe Down and
// in every square of Bath loaded round the players (tiles.ts). Naughty boys hang about at the alleys and
// bus stops, and now and then on a corner (Fox Hill most of all), and pickups turn up at the
// corners and outside the shops. A spot is only checked for room (clear of walls and trees) the
// first time it's wanted, so a square of Bath coming in costs nothing until someone's near it.
// Cats keep to the residential streets: among the houses, away from the shops and pubs (homeSpot).
// No haunt is within 200 m of a nursery or primary school (safezones.ts), so neither gangs nor
// pickups start there.
//
// Only the host asks: it runs the naughty boys, cats and pickups that use these.
import { GameMap, PATHS } from "./map";
import { inSafeZone } from "./safezones";

export type HauntKind = "corner" | "alley" | "bus" | "shop" | "pub";
export interface Haunt { x: number; z: number; kind: HauntKind; name: string; foxhill: boolean }

const FOXHILL_REACH = 250;   // metres from Fox Hill itself that count as the estate

/** Somewhere a haunt could be, before it's been checked: where, and how far off it may turn up. */
interface Spot { x: number; z: number; kind: HauntKind; name: string; spread: number; h?: Haunt | null; c?: [number, number] | null }

const spotsOf = new WeakMap<GameMap, Spot[]>();
const foxOf = new WeakMap<GameMap, number[][]>();
const streetsOf = new WeakMap<GameMap, Map<number, Float32Array>>();
const homesOf = new WeakMap<GameMap, Map<number, Float32Array>>();

/** Streets people live on, the buildings that are homes, and how near is near enough. */
const HOME_STREETS = new Set(["residential", "living_street"]);
const HOMES = new Set(["terrace", "detached", "semi", "flats"]);
const HOME_NEAR = 30;        // a house this close to the street
const SHOPS_NEAR = 45;       // and no shop or pub this close

/** The nearest open ground to (x, z) within r metres, so nothing stands in a wall or a tree. */
export function clearSpot(map: GameMap, x: number, z: number, r = 8): [number, number] | null {
  for (let d = 0; d <= r; d++) {
    for (let k = 0, n = d ? 12 : 1; k < n; k++) {
      const a = (k / n) * Math.PI * 2, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (!map.blocked(px, pz, 0.6) && !map.indoors(px, pz)) return [px, pz];
    }
  }
  return null;
}

/** How far in from the force field things may turn up. */
const margin = (map: GameMap) => Math.min(60, map.field * 0.1);

/** The likely spots in one area (the main map, or a square of Bath), not yet checked. */
function spots(area: GameMap): Spot[] {
  const had = spotsOf.get(area);
  if (had) return had;
  const D = area.d, out: Spot[] = [];
  const add = (kind: HauntKind, x: number, z: number, name = "", spread = 0) => out.push({ x, z, kind, name, spread });
  // street corners: where two streets meet, or three bits of street, nudged off the junction onto a corner
  const seen = new Map<string, Set<number>>();
  D.rd.forEach((r, i) => {
    if (PATHS.has(r.c)) return;
    for (const [x, y] of r.p) {
      const k = `${Math.round(x)},${Math.round(y)}`;
      (seen.get(k) ?? seen.set(k, new Set()).get(k)!).add(i);
    }
  });
  for (const [k, roads] of seen) {
    const names = new Set([...roads].map((i) => D.rd[i].n));
    if (roads.size < 3 && names.size < 2) continue;   // just one street split in two
    const [x, y] = k.split(",").map(Number);
    add("corner", x, -y, "", 6);
  }
  // alleys: service lanes and footpaths, every 30 m or so
  for (const r of D.rd) {
    if (r.c !== "service" && r.c !== "footway" && r.c !== "path" && r.c !== "steps") continue;
    let run = 15;
    for (let i = 1; i < r.p.length; i++) {
      run += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]);
      if (run >= 30) { run = 0; add("alley", r.p[i][0], -r.p[i][1]); }
    }
  }
  for (const f of D.fx ?? []) if (f[0] === "bus") add("bus", +f[1], -f[2], String(f[5] ?? ""), 1.5);
  // in front of a sign: its local +z faces out, which is (sin a, cos a) in the scene
  for (const [x, y, , a, , name, style] of D.sh ?? []) {
    add(style === "pub" ? "pub" : "shop", +x + Math.sin(+a) * 3, -y + Math.cos(+a) * 3, String(name));
  }
  spotsOf.set(area, out);
  return out;
}

/** A spot made good (once): somewhere clear near it, or null if there's no room or it's by the force field.
 *  map is the main map, which answers for everywhere loaded. */
function check(map: GameMap, s: Spot): Haunt | null {
  if (s.h !== undefined) return s.h;
  if (s.c === undefined) { const a = Math.random() * Math.PI * 2; s.c = clearSpot(map, s.x + Math.cos(a) * s.spread, s.z + Math.sin(a) * s.spread); }
  const c = s.c;
  if (!c) return (s.h = null);
  // not kept: past the zones' wall today may be open tomorrow
  if (map.fieldEdge(c[0], c[1]) < margin(map)) return null;
  // nothing hangs about or turns up near a nursery or primary school (safezones.ts)
  if (inSafeZone(map, c[0], c[1])) return (s.h = null);
  // (Fox Hill as the main map and the squares of Bath loaded round here have it)
  const foxhill = [map, ...map.tilesNear(c[0], c[1], FOXHILL_REACH)].some((area) => {
    let fox = foxOf.get(area);
    if (!fox) foxOf.set(area, (fox = area.d.rd.filter((r) => r.n === "Fox Hill").flatMap((r) => r.p.map((p) => [p[0], -p[1]]))));
    return fox.some(([fx, fz]) => Math.hypot(fx - c[0], fz - c[1]) < FOXHILL_REACH);
  });
  return (s.h = { x: c[0], z: c[1], kind: s.kind, name: s.name, foxhill });
}

/** Every haunt in the main map itself (checked all at once: for the start of a game). */
export function haunts(map: GameMap): Haunt[] {
  return spots(map).map((s) => check(map, s)).filter((h): h is Haunt => !!h);
}

/** The haunts within r of scene (x, z), in the main map and any square of Bath loaded there. */
export function hauntsNear(map: GameMap, x: number, z: number, r: number): Haunt[] {
  const out: Haunt[] = [];
  for (const area of [map, ...map.tilesNear(x, z, r)]) for (const s of spots(area)) {
    if (Math.abs(s.x - x) > r + s.spread || Math.abs(s.z - z) > r + s.spread) continue;
    const h = check(map, s);
    if (h && Math.hypot(h.x - x, h.z - z) < r) out.push(h);
  }
  return out;
}

/** Points every step metres along the streets and paths of one area, as x, z, x, z, ... (scene coords). */
function streetPoints(area: GameMap, step: number): Float32Array {
  let byStep = streetsOf.get(area);
  if (!byStep) streetsOf.set(area, (byStep = new Map()));
  const had = byStep.get(step);
  if (had) return had;
  const pts: number[] = [];
  for (const r of area.d.rd) {
    for (let k = 0; k < r.p.length - 1; k++) {
      const [ax, ay] = r.p[k], [bx, by] = r.p[k + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
      for (let s = 0; s < n; s++) pts.push(ax + ((bx - ax) * s) / n, -(ay + ((by - ay) * s) / n));
    }
  }
  const out = Float32Array.from(pts);
  byStep.set(step, out);
  return out;
}

/** Points every step metres along the residential streets of one area that have houses on them and
 *  no shops or pubs, as x, z, x, z, ... (scene coords). */
function homePoints(area: GameMap, step: number): Float32Array {
  let byStep = homesOf.get(area);
  if (!byStep) homesOf.set(area, (byStep = new Map()));
  const had = byStep.get(step);
  if (had) return had;
  const D = area.d, cell = (x: number, z: number) => `${Math.floor(x / HOME_NEAR)},${Math.floor(z / HOME_NEAR)}`;
  // the houses, by the middle of their outline, sorted into squares HOME_NEAR across
  const homes = new Map<string, number[]>();
  for (const b of D.bl) {
    if (!HOMES.has(b.c)) continue;
    const ring = b.r[0];
    let x = 0, y = 0;
    for (const q of ring) { x += q[0]; y += q[1]; }
    x /= ring.length; y /= ring.length;
    const k = cell(x, -y);
    (homes.get(k) ?? homes.set(k, []).get(k)!).push(x, -y);
  }
  const shops = (D.sh ?? []).map((f) => [+f[0], -f[1]]);
  const homely = (x: number, z: number) => {
    if (shops.some(([sx, sz]) => Math.abs(sx - x) < SHOPS_NEAR && Math.abs(sz - z) < SHOPS_NEAR && Math.hypot(sx - x, sz - z) < SHOPS_NEAR)) return false;
    const cx = Math.floor(x / HOME_NEAR), cz = Math.floor(z / HOME_NEAR);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const H = homes.get(`${cx + i},${cz + j}`);
      if (H) for (let k = 0; k < H.length; k += 2) if (Math.hypot(H[k] - x, H[k + 1] - z) < HOME_NEAR) return true;
    }
    return false;
  };
  const pts: number[] = [];
  for (const r of D.rd) {
    if (!HOME_STREETS.has(r.c)) continue;
    for (let k = 0; k < r.p.length - 1; k++) {
      const [ax, ay] = r.p[k], [bx, by] = r.p[k + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
      for (let s = 0; s < n; s++) {
        const x = ax + ((bx - ax) * s) / n, z = -(ay + ((by - ay) * s) / n);
        if (homely(x, z)) pts.push(x, z);
      }
    }
  }
  const out = Float32Array.from(pts);
  byStep.set(step, out);
  return out;
}

/** Somewhere along the points of the areas round (x, z) between near and far metres off that will do. */
function pickAlong(map: GameMap, points: (area: GameMap) => Float32Array, x: number, z: number, near: number, far: number, r: number,
  ok: (x: number, z: number) => boolean, scatter: number, rand: () => number): { x: number; z: number } | null {
  const lim = margin(map), found: number[] = [];
  for (const area of [map, ...map.tilesNear(x, z, far)]) {
    const P = points(area);
    for (let k = 0; k < P.length; k += 2) {
      const dx = P[k] - x, dz = P[k + 1] - z;
      if (Math.abs(dx) > far || Math.abs(dz) > far) continue;
      const d = Math.hypot(dx, dz);
      if (d > near && d < far) found.push(P[k], P[k + 1]);
    }
  }
  for (let tries = 0; tries < 30 && found.length; tries++) {
    const k = Math.floor(rand() * (found.length / 2)) * 2;
    const px = found[k] + (rand() - 0.5) * scatter, pz = found[k + 1] + (rand() - 0.5) * scatter;
    if (map.fieldEdge(px, pz) > lim && ok(px, pz) && !map.blocked(px, pz, r)) return { x: px, z: pz };
  }
  return null;
}

/**
 * Somewhere on the streets and paths between near and far metres from scene (x, z), in the main
 * map or a loaded square of Bath: clear of walls and trees (for something radius r across), away
 * from the force field, and where ok() says. step: how far apart the points along the streets are;
 * scatter: how far either way to shift one. rand: where the picks come from (a seeded one, so every
 * player picks the same spot). Null if nowhere will do.
 */
export function streetSpot(map: GameMap, x: number, z: number, near: number, far: number, r: number,
  ok: (x: number, z: number) => boolean = () => true, step = 6, scatter = 0, rand: () => number = Math.random): { x: number; z: number } | null {
  return pickAlong(map, (area) => streetPoints(area, step), x, z, near, far, r, ok, scatter, rand);
}

/** Like streetSpot, but only on a residential street with houses along it and no shops or pubs about. */
export function homeSpot(map: GameMap, x: number, z: number, near: number, far: number, r: number,
  ok: (x: number, z: number) => boolean = () => true, step = 6, scatter = 0): { x: number; z: number } | null {
  return pickAlong(map, (area) => homePoints(area, step), x, z, near, far, r, ok, scatter, Math.random);
}
