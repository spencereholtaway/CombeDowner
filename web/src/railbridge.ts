// How the railway's bridges are built, worked out from the line's heights and what passes under it
// alone, so every player builds the same. Bath's railway is mostly Brunel's Bath-stone arches and
// viaducts, with an iron girder where a road is too wide for an arch at the height the line stands:
// so each span between two piers is a stone arch, semicircular where there is room and flatter
// (segmental) where there is not, as long as what passes under still has its headroom; a girder
// where no arch gives that; and a plain wall where nothing passes under and no arch fits. A short
// bridge is all one or the other, so one opening does not get half an arch beside a girder.

/** Headroom needed under the line at data (x, y): 0 where nothing passes under and a pier may stand. */
export type Need = (x: number, y: number) => number;

export type Span = { a: number; b: number; kind: "arch" | "girder" | "wall"; spring: number; rise: number };

const PIER = 0.8;                         // half a pier's length along the line
const CROWN = 1.0;                        // rail foot down to an arch's crown: ballast, fill and the arch ring
const GIRDER = 1.4;                       // rail foot down to a girder's underside
const SHORT = 45;                         // a bridge this long or shorter is built all as one kind
const MINSPAN = 6, MAXSPAN = 12;         // pier spacing, metres
const GIRDERMAX = 25;                    // the longest girder between two piers
const TWIN = 8;                          // a track this near another runs beside it on the same bridge

/** `twin`: the piers and girder spans of the tracks already planned, so a line laid beside one on the
 *  same viaduct puts its piers in line with that one's and is built of the same kind. */
export function bridgePlan(p: number[][], need: Need, twin: { piers: number[][]; ends: number[][]; girders: number[][] } = { piers: [], ends: [], girders: [] }) {
  const s = [0];
  for (let k = 1; k < p.length; k++) s.push(s[k - 1] + Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]));
  const idx = (sp: number) => { let k = 0; while (k < p.length - 2 && s[k + 1] < sp) k++; return k; };
  const lerp = (sp: number, f: (q: number[]) => number) => { const k = idx(sp), t = Math.min(1, Math.max(0, (sp - s[k]) / ((s[k + 1] - s[k]) || 1))); return f(p[k]) + (f(p[k + 1]) - f(p[k])) * t; };
  const ground = (sp: number) => lerp(sp, (q) => q[4] ?? q[2]), top = (sp: number) => lerp(sp, (q) => q[2]);
  const needAt = (sp: number) => need(lerp(sp, (q) => q[0]), lerp(sp, (q) => q[1]));

  const soffit = (q: Span, sp: number) => {
    if (q.kind === "girder") return top(sp) - GIRDER;
    if (q.kind === "wall") return ground(sp) - 0.3;
    const c = q.b - q.a, m = (q.a + q.b) / 2, R = (c * c / 4 + q.rise * q.rise) / (2 * q.rise);
    return q.spring + Math.sqrt(Math.max(0, R * R - (sp - m) ** 2)) - (R - q.rise);
  };
  const wet = (a: number, b: number) => { for (let sp = a; sp <= b + 1e-6; sp += 0.5) if (needAt(sp) > 0) return true; return false; };
  const clears = (q: Span) => {
    for (let sp = q.a; sp <= q.b + 1e-6; sp += 0.5) { const n = needAt(sp); if (n > 0 && soffit(q, sp) - ground(sp) < n) return false; }
    return true;
  };
  // the roundest arch whose springing stands on the ground at both piers and that clears what passes under
  const arch = (a: number, b: number): Span | null => {
    const c = b - a;
    if (c < 2) return null;
    let crown = Infinity;
    for (let sp = a; sp <= b + 1e-6; sp += 1) crown = Math.min(crown, top(sp) - CROWN);
    const foot = Math.max(ground(a), ground(b)) - 0.3, dry = !wet(a, b);
    // (over nothing, a low flat arch is no arch at all: it is built as the wall it would read as)
    for (let f = 0.5; f >= (dry ? 0.3 : 0.125) - 1e-6; f -= 0.025) {
      if (dry && c * f < 1.5) break;
      const q: Span = { a, b, kind: "arch", spring: crown - c * f, rise: c * f };
      if (q.spring >= foot && clears(q)) return q;
    }
    return null;
  };
  // piers about as far apart as the line stands high, so a semicircle just springs off the ground,
  // spread evenly along the bridge and moved to stand clear of whatever passes under
  const spacing = (sp: number) => Math.min(MAXSPAN, Math.max(MINSPAN, 2 * (top(sp) - CROWN - ground(sp)) + 2 * PIER));
  const piersAt = (sa: number, sb: number, fixed = 0) => {
    const run: number[] = [0];
    for (let sp = sa; sp < sb; sp += 1) run.push(run[run.length - 1] + Math.min(1, sb - sp) / (fixed || spacing(sp)));
    const count = run[run.length - 1], n = Math.max(1, Math.round(count)), sup = [sa];
    for (let j = 1; j < n; j++) {
      let i = 0;
      while (i < run.length - 1 && run[i] < (count * j) / n) i++;
      const want = sa + i, reach = (fixed || spacing(want)) / 3;
      let got: number | null = null;
      for (let d = 0; d <= reach && got === null; d += 0.5)
        for (const c of [want - d, want + d])
          if (got === null && c > sup[sup.length - 1] + 2 * PIER + 2 && c < sb - 3 && needAt(c - PIER) === 0 && needAt(c) === 0 && needAt(c + PIER) === 0) got = c;
      if (got !== null) sup.push(got);
    }
    sup.push(sb);
    return sup;
  };
  const spansOf = (sup: number[]) => {
    const out: Span[] = [];
    for (let j = 0; j + 1 < sup.length; j++) {
      const a = sup[j] + PIER, b = sup[j + 1] - PIER;
      if (b - a < 1) continue;
      out.push(arch(a, b) ?? { a, b, kind: wet(a, b) ? "girder" : "wall", spring: 0, rise: 0 });
    }
    return out;
  };

  const xy = (sp: number) => [lerp(sp, (q) => q[0]), lerp(sp, (q) => q[1])];
  const onto = (k: number, e: number, x: number, y: number) => {
    let best = Infinity, at = -1;
    for (let j = k; j < e; j++) {
      const vx = p[j + 1][0] - p[j][0], vy = p[j + 1][1] - p[j][1], l2 = vx * vx + vy * vy || 1;
      const f = Math.min(1, Math.max(0, ((x - p[j][0]) * vx + (y - p[j][1]) * vy) / l2)), d = Math.hypot(x - p[j][0] - vx * f, y - p[j][1] - vy * f);
      if (d < best) { best = d; at = s[j] + f * (s[j + 1] - s[j]); }
    }
    return best < TWIN ? at : null;
  };
  // a run of arches or girders with a girder in it, short enough to be one bridge, is all girder,
  // keeping only the piers it needs, so one opening is not half an arch beside a girder
  const oneKind = (sp: Span[], forced: (q: Span) => boolean) => {
    const out: Span[] = [];
    for (let i = 0; i < sp.length; ) {
      if (sp[i].kind === "wall") { out.push(sp[i++]); continue; }
      let j = i;
      while (j + 1 < sp.length && sp[j + 1].kind !== "wall" && sp[j + 1].a - sp[j].b < 2 * PIER + 0.1) j++;
      const group = sp.slice(i, j + 1);
      if (group[group.length - 1].b - group[0].a <= SHORT && group.some((q) => q.kind === "girder" || forced(q))) {
        let from = group[0].a;
        for (let g = 0; g < group.length; g++) {
          const last = g === group.length - 1, next = last ? Infinity : group[g + 1].b;
          if (last || next - from > GIRDERMAX) { out.push({ a: from, b: group[g].b, kind: "girder", spring: 0, rise: 0 }); from = last ? 0 : group[g + 1].a; }
        }
      } else out.push(...group);
      i = j + 1;
    }
    return out;
  };

  const piers: number[] = [], spans: Span[] = [];
  for (let k = 0; k < p.length; ) {
    if (p[k][3] !== 1) { k++; continue; }
    let e = k;
    while (e + 1 < p.length && p[e + 1][3] === 1) e++;
    const sa = s[k], sb = s[e];
    const paired = twin.ends.some(([x, y]) => onto(k, e, x, y) !== null);
    let sup: number[];
    if (paired) {
      const at = twin.piers.map(([x, y]) => onto(k, e, x, y)).filter((c): c is number => c !== null && c > sa + 2 * PIER && c < sb - 2 * PIER).sort((u, v) => u - v);
      sup = [sa];
      for (const c of at) if (c > sup[sup.length - 1] + 2 * PIER + 1) sup.push(c);
      sup.push(sb);
    } else sup = piersAt(sa, sb);
    const girdered = twin.girders.map(([x, y]) => onto(k, e, x, y)).filter((c): c is number => c !== null);
    const sp = oneKind(spansOf(sup), (q) => girdered.some((c) => c >= q.a && c <= q.b));
    for (const q of sp) if (q.kind !== "wall") for (const c of [q.a - PIER, q.b + PIER]) if (c > sa + 1 && c < sb - 1 && !piers.includes(c)) piers.push(c);
    spans.push(...sp);
    k = e + 1;
  }
  const spanAt = (sp: number) => spans.find((q) => sp >= q.a && sp <= q.b);
  return {
    s, piers, spans, ground,
    /** For the next track: where this one's piers, bridge ends and girders are. */
    marks: () => {
      const ends: number[][] = [];
      for (let k = 0; k < p.length; k++) if (p[k][3] === 1 && (p[k - 1]?.[3] !== 1 || p[k + 1]?.[3] !== 1)) ends.push([p[k][0], p[k][1]]);
      return { piers: piers.map(xy), ends, girders: spans.filter((q) => q.kind === "girder").map((q) => xy((q.a + q.b) / 2)) };
    },
    span: (sp: number) => { const q = spanAt(sp); return q !== undefined && q.kind !== "wall"; },
    kind: (sp: number) => spanAt(sp)?.kind ?? "wall",
    /** The height the bridge's sides come down to at sp: an arch's soffit, a girder's underside, or the ground. */
    bottom(sp: number) { const q = spanAt(sp); return q ? soffit(q, sp) : ground(sp) - 0.3; },
  };
}

/** What passes under the railway's bridges, as a Need: each way a line with how far either side it
 *  reaches and the headroom it wants, and the ponds and the lake, which want a little. */
export function needUnder(tracks: number[][][], ways: { p: number[][]; reach: number; need: number }[], ponds: number[][][]): Need {
  // (numbered cells, and only ways near a bridge: this runs over every street in Bath)
  const C = 10, cell = (i: number, j: number) => (i + 32768) * 65536 + j + 32768;
  const near = new Map<number, number[][]>();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of tracks) for (const q of p) if (q[3] === 1) {
    near.set(cell(Math.floor(q[0] / C), Math.floor(q[1] / C)), []);
    x0 = Math.min(x0, q[0] - C); x1 = Math.max(x1, q[0] + C); y0 = Math.min(y0, q[1] - C); y1 = Math.max(y1, q[1] + C);
  }
  for (const { p, reach, need } of ways)
    for (let k = 0; k + 1 < p.length; k++) {
      const [ax, ay] = p[k], [bx, by] = p[k + 1];
      if (Math.max(ax, bx) + reach < x0 || Math.min(ax, bx) - reach > x1 || Math.max(ay, by) + reach < y0 || Math.min(ay, by) - reach > y1) continue;
      for (let i = Math.floor((Math.min(ax, bx) - reach) / C); i <= Math.floor((Math.max(ax, bx) + reach) / C); i++)
        for (let j = Math.floor((Math.min(ay, by) - reach) / C); j <= Math.floor((Math.max(ay, by) + reach) / C); j++)
          near.get(cell(i, j))?.push([ax, ay, bx, by, reach, need]);
    }
  const boxes = ponds.filter((ring) => ring.length > 2).map((ring) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { ring, x0, x1, y0, y1 };
  });
  const inside = (ring: number[][], x: number, y: number) => {
    let o = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
      if ((ring[i][1] > y) !== (ring[j][1] > y) && x < ((ring[j][0] - ring[i][0]) * (y - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) o = !o;
    return o;
  };
  return (x, y) => {
    let n = 0;
    for (const [ax, ay, bx, by, reach, need] of near.get(cell(Math.floor(x / C), Math.floor(y / C))) ?? []) {
      if (need <= n) continue;
      const vx = bx - ax, vy = by - ay, f = Math.min(1, Math.max(0, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
      if (Math.hypot(x - ax - vx * f, y - ay - vy * f) < reach) n = need;
    }
    if (n === 0 && boxes.some((w) => x >= w.x0 && x <= w.x1 && y >= w.y0 && y <= w.y1 && inside(w.ring, x, y))) n = 0.8;
    return n;
  };
}
