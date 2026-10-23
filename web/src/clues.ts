// Clues: questions the map can answer about a real place, for a game to ask a player who has to go
// and look. "The house with the dark green door: how many windows across its top floor?" "How many
// benches in the park?" The treasure trail asks them (trail.ts), and anything else that wants a
// player to look at the town rather than the HUD (a pub quiz, a Wanted poster) can ask them too.
//
// Every answer is read from exactly the lists world.ts and furniture.ts build the town from, in the
// squares loaded on this machine, after the set pieces have hidden what's under them
// (landmarks/setpieces.ts takes those out of the lists as each square loads), so what a clue says is
// what's drawn. A clue can only be written once everything round it is loaded (loadedRound); until
// then the questions here answer null and the caller tries again later. Nothing is asked that the
// eye can't settle: door colours come in eight named ones, a door is only picked out by its colour
// when no other door near it has that colour, and never by one of the dark ones, which look alike.
//
// Who decides what: nobody. Every player reads the same squares, so everyone gets the same answers
// from the same place.
import { type Building, type GameMap, roofFit } from "./map";

/** The front doors' colours as world.ts paints them, by name. */
export const DOOR_COLOURS = ["dark green", "navy blue", "red", "black", "white", "teal", "brown", "sage green"];
/** The dark ones (green, navy and black) look alike under a dull sky and the retro grade
 *  (post.ts), so a house is never picked out by one of those. */
const DARK = [0, 1, 3];
const MATERIALS: Record<string, string> = { s: "Bath stone", k: "red-brick", y: "yellow-brick", r: "rendered" };
const UNIQUE = 50;    // a door is only named by its colour if it's the only one that colour this far round
const BESIDE = 25;    // and the only one this close, whatever street it's on

/** Something to count or read off a place, and its answer (0 to 9: one wheel of a lock). */
export interface Fact { ask: string; n: number }
/** A house picked out from its neighbours: where its front door is (scene x, z, facing a), what
 *  picks it out ("the house with the dark green door"), and what can be counted on it. */
export interface House { x: number; z: number; a: number; name: string; facts: Fact[] }

/** Is everything within r of scene (x, z) loaded in full detail on this machine? */
export function loadedRound(map: GameMap, x: number, z: number, r: number): boolean {
  if (!map.detailedAt(x, z)) return false;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    if (!map.detailedAt(x + Math.cos(a) * r, z + Math.sin(a) * r)) return false;
  }
  return true;
}

/** The loaded areas whose lists could hold something within r of scene (x, z). */
function areasNear(map: GameMap, x: number, z: number, r: number): GameMap[] {
  return [map, ...map.tilesNear(x, z, r)];
}

/** Front doors within r of scene (x, z), with the area each is in. */
function doorsNear(map: GameMap, x: number, z: number, r: number) {
  const out: { d: number[]; m: GameMap }[] = [];
  for (const m of areasNear(map, x, z, r)) for (const d of m.d.dr ?? []) if (Math.hypot(d[0] - x, -d[1] - z) < r) out.push({ d, m });
  return out.sort((p, q) => p.d[0] - q.d[0] || p.d[1] - q.d[1]);
}

/** The building whose wall a door is set in (within 0.3 m of an edge, as world.ts finds them). */
function wallOf(m: GameMap, x: number, y: number): Building | null {
  for (const b of m.d.bl) {
    const ring = b.r[0];
    if (Math.abs(ring[0][0] - x) > 80 || Math.abs(ring[0][1] - y) > 80) continue;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], q = ring[(i + 1) % ring.length], ex = q[0] - a[0], ey = q[1] - a[1], len = Math.hypot(ex, ey);
      if (len < 0.05) continue;
      const t = ((x - a[0]) * ex + (y - a[1]) * ey) / len, off = Math.abs((x - a[0]) * ey - (y - a[1]) * ex) / len;
      if (t > 0 && t < len && off < 0.3) return b;
    }
  }
  return null;
}

/** How many storeys world.ts draws on b. */
function storeys(b: Building) {
  const big = b.c === "institution" || b.c === "flats", floor = big ? 3.5 : 2.9, lift = b.st ? 0 : (b.dz ?? 0) / 2;
  return b.st ?? Math.max(1, Math.round((b.h - lift) / floor));
}

/**
 * A house near scene (x, z), within r, that can be picked out without doubt, with three things to
 * count on it; the nearest such, or null if there's none (or it isn't all loaded yet). where: only
 * doors where this says yes (on a particular street, say), and then its colour need only be its
 * own among the doors there within unique metres (and any within BESIDE).
 */
export function houseNear(map: GameMap, x: number, z: number, r: number, where?: (x: number, z: number) => boolean, unique = UNIQUE): House | null {
  if (!loadedRound(map, x, z, r + unique)) return null;
  const doors = doorsNear(map, x, z, r).filter(({ d }) => !where || where(d[0], -d[1]))
    .sort((p, q) => Math.hypot(p.d[0] - x, -p.d[1] - z) - Math.hypot(q.d[0] - x, -q.d[1] - z));
  for (const { d, m } of doors) {
    const b = wallOf(m, d[0], d[1]);
    // one front door to the building, so "the house" is the whole of it; windows drawn, on fairly level ground
    if (!b || !b.w || Math.abs(b.dz ?? 0) > 1.5) continue;
    const bays = d[5] ?? 0, st = storeys(b), pots = 2 * (roofFit(b)?.ch.length ?? 0);
    if (bays < 1 || bays > 9 || st < 2 || st > 9 || pots > 9) continue;
    const near = doorsNear(map, d[0], -d[1], unique).filter((o) => !where || where(o.d[0], -o.d[1]) || Math.hypot(o.d[0] - d[0], o.d[1] - d[1]) < BESIDE);
    if (near.some((o) => o.d !== d && wallOf(o.m, o.d[0], o.d[1]) === b)) continue;
    const c = d[4] % DOOR_COLOURS.length;
    let name = "";
    if (!DARK.includes(c) && !near.some((o) => o.d !== d && o.d[4] % DOOR_COLOURS.length === c)) name = `the house with the ${DOOR_COLOURS[c]} door`;
    else {
      // or the only one of its walls in a row of others
      const mat = (b.m && b.m in MATERIALS) ? b.m : "s", others = near.filter((o) => o.d !== d).map((o) => wallOf(o.m, o.d[0], o.d[1])).filter((o): o is Building => !!o && o !== b);
      if (others.length >= 3 && others.every((o) => ((o.m && o.m in MATERIALS) ? o.m : "s") !== mat)) name = `the only ${MATERIALS[mat]} house among its neighbours`;
    }
    if (!name) continue;
    return {
      x: d[0], z: -d[1], a: d[3], name,
      facts: [
        { ask: "the windows across its top floor, at the front", n: bays },
        { ask: "the chimney pots on its roof", n: pots },
        { ask: "its storeys", n: st },
      ],
    };
  }
  return null;
}

/** The smallest named place (a park, a green, a square) whose outline holds scene (x, z), as the
 *  map has it, with its outline in data coordinates. */
export function placeAt(map: GameMap, x: number, z: number): { n: string; r: number[][] } | null {
  let best: { n: string; r: number[][] } | null = null, bestA = Infinity;
  for (const p of [...areasNear(map, x, z, 0).flatMap((m) => m.d.pl ?? []), ...map.wide?.d.pl ?? []]) {
    if (!p.n || p.r.length < 3 || !inside(p.r, x, -z)) continue;
    let a = 0;
    for (let i = 0; i < p.r.length; i++) { const u = p.r[i], v = p.r[(i + 1) % p.r.length]; a += u[0] * v[1] - v[0] * u[1]; }
    if (Math.abs(a) < bestA) { bestA = Math.abs(a); best = p; }
  }
  return best;
}

function inside(ring: number[][], x: number, y: number) {
  let on = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) on = !on;
  }
  return on;
}

const COUNTED: [string, string][] = [["bench", "benches"], ["bin", "bins"], ["lamp", "lamp posts"], ["bollard", "bollards"], ["postbox", "post boxes"]];
const SPAN = 260;   // a place bigger than this across is too big to count things in

/** Street things to count inside a place's outline (data coordinates): each kind there's up to
 *  nine of (none is an answer too), or null if the outline isn't all loaded or is too big to count in. */
export function countsIn(map: GameMap, ring: number[][], name: string): Fact[] | null {
  const xs = ring.map((q) => q[0]), ys = ring.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (x1 - x0 > SPAN || y1 - y0 > SPAN) return null;
  const cx = (x0 + x1) / 2, cz = -(y0 + y1) / 2, r = Math.hypot(x1 - x0, y1 - y0) / 2;
  if (!loadedRound(map, cx, cz, r)) return null;
  const n = new Map<string, number>();
  for (const m of areasNear(map, cx, cz, r)) for (const f of m.d.fx ?? []) {
    const k = f[0] as string;
    if (COUNTED.some(([c]) => c === k) && inside(ring, +f[1], +f[2])) n.set(k, (n.get(k) ?? 0) + 1);
  }
  return COUNTED.filter(([k]) => (n.get(k) ?? 0) <= 9).map(([k, said]) => ({ ask: `the ${said} in ${name}`, n: n.get(k) ?? 0 }));
}

/** The shop sign nearest scene (x, z), within r and clearly nearer than any other, whose name
 *  starts with a word of one to nine letters, and that word's length. */
export function shopNear(map: GameMap, x: number, z: number, r: number): Fact | null {
  if (!loadedRound(map, x, z, r + 10)) return null;
  const signs: { d: number; word: string }[] = [];
  for (const m of areasNear(map, x, z, r + 10)) for (const s of m.d.sh ?? []) {
    const d = Math.hypot(+s[0] - x, -s[1] - z);
    if (d < r + 10) signs.push({ d, word: String(s[5] ?? "").split(/\s+/)[0].replace(/[^A-Za-z]/g, "") });
  }
  signs.sort((p, q) => p.d - q.d);
  const [first, second] = signs;
  if (!first || first.d >= r || (second && second.d < first.d + 8) || first.word.length < 1 || first.word.length > 9) return null;
  return { ask: "the letters in the first word of the nearest shop sign", n: first.word.length };
}
