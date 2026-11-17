// Traffic lights that work, British style: red, red and amber together, green, amber, red. The map
// has them from OpenStreetMap (each square's `cx`: a crossing with lights, p, or lights, s, on a street
// running at some angle; a crossing whose lights are those nearby, c, has none of its own), and furniture.ts draws them, with their lamps lit by this
// sequence; the traffic stops for them (traffic.ts).
//
// - At a junction, the lights within a few dozen metres of each other are one set: those on streets
//   running one way go green while those running across them are red, and the other way about.
// - At a crossing on its own, it's green for the traffic most of the time, red for a little while for
//   anyone crossing.
// Each set starts its cycle at its own moment, worked out from where it is, and it all runs off the
// clock, so everyone sees the same lights at the same time and nothing goes over the network.
import type { GameMap } from "./map";

export const RED = 0, RED_AMBER = 1, GREEN = 2, AMBER = 3;
/** Seconds round each kind's cycle: a junction's, and a crossing's. Both divide WRAP. */
const JUNCTION = 44, CROSSING = 50, WRAP = 1100;

/** A set of lights on a street (scene x, z), the way the street runs (unit ux, uz), what kind, its set's place in the cycle, and which way round it goes. */
export interface Signal { x: number; z: number; ux: number; uz: number; crossing: boolean; off: number; group: number; half: number; i: number }

/** The clock the lights run off, seconds, wrapped round so the lamps' shader keeps its precision. */
export const signalClock = () => (Date.now() / 1000) % WRAP;
/** For the lamps' shader (furniture.ts): set every frame (world.ts). */
export const SIGNAL_TIME = { value: 0 };

/** What a set of lights shows at time t (signalClock). The lamps' shader does the same sums (furniture.ts). */
export function lightAt(s: { crossing: boolean; off: number; group: number }, t: number): number {
  if (s.crossing) {
    const c = (t + s.off) % CROSSING;
    return c < 38 ? GREEN : c < 41 ? AMBER : c < 48 ? RED : RED_AMBER;
  }
  const c = (t + s.off) % JUNCTION;
  if (!s.group) return c < 18 ? GREEN : c < 21 ? AMBER : c < 42 ? RED : RED_AMBER;
  return c < 20 ? RED : c < 22 ? RED_AMBER : c < 40 ? GREEN : c < 43 ? AMBER : RED;
}

/** The same, as GLSL, for the lamps: sig = (off, group, crossing, which lamp: 0 red, 1 amber, 2 green); 1 if that lamp's lit. */
export const LIGHT_GLSL = `
float signalLit(vec4 sig, float t) {
  float st;
  if (sig.z > 0.5) { float c = mod(t + sig.x, ${CROSSING}.0); st = c < 38.0 ? 2.0 : c < 41.0 ? 3.0 : c < 48.0 ? 0.0 : 1.0; }
  else if (sig.y < 0.5) { float c = mod(t + sig.x, ${JUNCTION}.0); st = c < 18.0 ? 2.0 : c < 21.0 ? 3.0 : c < 42.0 ? 0.0 : 1.0; }
  else { float c = mod(t + sig.x, ${JUNCTION}.0); st = c < 20.0 ? 0.0 : c < 22.0 ? 1.0 : c < 40.0 ? 2.0 : c < 43.0 ? 3.0 : 0.0; }
  if (sig.w < 0.5) return st < 1.5 ? 1.0 : 0.0;                         // red: red, and red with amber
  if (sig.w < 1.5) return (st > 0.5 && st < 1.5) || st > 2.5 ? 1.0 : 0.0;   // amber: with red, and on its own
  return st > 1.5 && st < 2.5 ? 1.0 : 0.0;                                // green
}`;

const hash = (x: number, y: number) => { const h = Math.sin(Math.round(x / 7) * 12.9898 + Math.round(y / 7) * 78.233) * 43758.5453; return h - Math.floor(h); };

const cache = new WeakMap<GameMap, Signal[]>();
/** The lights in one area (the main map or a square of Bath), in the order of its `cx`, with their sets worked out. */
export function signalsOf(area: GameMap): Signal[] {
  let out = cache.get(area);
  if (out) return out;
  out = [];
  const cx = area.d.cx ?? [];
  const at = (c: (number | string)[]) => c as [number, number, number, number, string, number];
  const lit = cx.filter((c) => at(c)[4] === "s" || at(c)[4] === "p"), walks = cx.filter((c) => at(c)[4] === "c");
  // lights standing on their own by a crossing they control are that crossing's, and keep its time
  const forCrossing = (x: number, y: number, a: number) =>
    walks.some((c) => Math.hypot(at(c)[0] - x, at(c)[1] - y) < 12 && Math.abs(Math.sin(at(c)[3] - a)) < 0.3)
    && !lit.some((c) => { const d = Math.hypot(at(c)[0] - x, at(c)[1] - y); return d > 0.1 && d < 40; });
  // the junctions: lights within 40 m of each other are one set, timed together; the street of the
  // set's first light goes first, and those across it the other way about
  const sets: { x: number; y: number; ux: number; uy: number; off: number }[] = [];
  cx.forEach((c, i) => {
    const [x, y, , a, kind, w] = at(c);
    if (kind !== "s" && kind !== "p") return;
    const ux = Math.cos(a), uy = Math.sin(a);
    if (kind === "p" || forCrossing(x, y, a)) { out!.push({ x, z: -y, ux, uz: -uy, crossing: true, off: hash(x, y) * CROSSING, group: 0, half: w / 2, i }); return; }
    let set = sets.find((s) => Math.hypot(s.x - x, s.y - y) < 40);
    if (!set) sets.push((set = { x, y, ux, uy, off: hash(x, y) * JUNCTION }));
    const across = Math.abs(set.ux * uy - set.uy * ux) > 0.7 ? 1 : 0;
    out!.push({ x, z: -y, ux, uz: -uy, crossing: false, off: set.off, group: across, half: w / 2, i });
  });
  cache.set(area, out);
  return out;
}
