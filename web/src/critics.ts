// The critics and the punters at the Art Gallery's private view (gallery.ts), and what they make of
// each painting. There's no server and nothing clever behind it: each painting is looked over
// (how much of the canvas is covered, which colours and how much of each, how busy its edges are,
// how many separate shapes, whether it mirrors left to right, whether the subject's colours are
// there, sky at the top and grass at the bottom, how many strokes went into it), that's boiled down
// to a handful of traits (blank, a flood of one colour, a scribble, a rainbow, very detailed, a
// landscape, on the subject or off it...) and each visitor has a taste for some of them and a bank
// of lines for each; a remark is up to three of those, about three sentences: what strikes them
// first, something about another part of it, and their verdict. sight.ts looks closer, at the shapes
// (a sun, a bus, a cat, a rude doodle...), the layout, the colour and the line, and the easel says
// how it was painted; those become traits too, with more lines in critics-lines.ts. The painting's time-lapse is looked at as well, for one
// that started as one thing and ended as another, or had something rude painted out. Paintings are
// also set against each other, for the two that look alike and the odd one out. Two or three real
// critics come to every show, judge each painting in turn before the public are let in, and their
// marks count double; the rest are ordinary people with opinions. Whatever their taste, everyone's mark leans towards the plain craft of it (the whole
// canvas, plenty in it, the subject in its colours, time taken carefully), so a careful painting of
// the subject gets 8s and 9s and a lazy one 2s to 4s; tools/critics_probe.mjs checks that.
//
// Who decides what: the host. Everything here is worked out on the host's screen from the
// paintings and the show's seed, and the lines and marks go round as text (gallery.ts), so nobody's
// rounding can make two screens disagree. How long each remark stays up (speakFor) comes from its
// text, so every screen times the walk round the same.
import { MORE, SEEN, VERDICT } from "./critics-lines";
import { C, COLOUR_NAMES, H, W, type How } from "./easel";
import { rng, shuffled, type Rng } from "./quests";
import type { Eye } from "./eye";
import { see, type Rude, type Sight, type Thing } from "./sight";

// ---- the subjects ------------------------------------------------------------------------------

/** A subject for the evening, with the colours anyone painting it would need, and the things anyone
 *  would expect to see in it. {place}, {pub} and {street} are filled in from the map. */
export interface Theme { t: string; c: number[]; k?: (Thing | Rude)[] }
export const THEMES: Theme[] = [
  { t: "A seagull's revenge", c: [C.pale, C.grey, C.yellow, C.sky, C.black], k: ["birds"] },
  { t: "Self-portrait as a Roman", c: [C.red, C.yellow, C.stone, C.pink, C.brown], k: ["face", "figure"] },
  { t: "{place} on a Tuesday", c: [C.green, C.sky, C.grey, C.stone, C.dkgreen], k: ["house", "tree", "bus"] },
  { t: "Sunrise over the rooftops", c: [C.orange, C.yellow, C.pink, C.red, C.stone, C.sky], k: ["sun", "house"] },
  { t: "Last orders at {pub}", c: [C.brown, C.yellow, C.black, C.orange, C.navy], k: ["writing", "figure", "face"] },
  { t: "The night bus home", c: [C.navy, C.black, C.yellow, C.red], k: ["bus"] },
  { t: "Still life with chips", c: [C.yellow, C.brown, C.stone, C.red, C.pale] },
  { t: "A cat who owns the street", c: [C.black, C.orange, C.grey, C.green, C.stone], k: ["cat"] },
  { t: "The bin lorry, seven in the morning", c: [C.green, C.grey, C.orange, C.black, C.yellow] },
  { t: "Rush hour on {street}", c: [C.red, C.grey, C.black, C.yellow, C.blue], k: ["bus", "figure"] },
  { t: "The strange structure", c: [C.black, C.purple, C.navy, C.grey] },
  { t: "A naughty boy legging it", c: [C.red, C.blue, C.grey, C.black, C.pink], k: ["figure"] },
  { t: "Heatwave", c: [C.yellow, C.orange, C.red, C.sky], k: ["sun"] },
  { t: "Rain. Again.", c: [C.grey, C.pale, C.navy, C.blue], k: ["figure", "house"] },
  { t: "Your nan's front room", c: [C.pink, C.brown, C.purple, C.stone, C.orange], k: ["face", "cat"] },
  { t: "The bus that never came", c: [C.red, C.grey, C.sky, C.black], k: ["bus", "figure"] },
  { t: "Pigeons plotting something", c: [C.grey, C.pale, C.purple, C.black], k: ["birds"] },
  { t: "A Roman in the bath", c: [C.sky, C.blue, C.stone, C.pink, C.red], k: ["face", "figure"] },
  { t: "Fireworks over {place}", c: [C.navy, C.black, C.red, C.yellow, C.pink, C.green] },
  { t: "The prize marrow", c: [C.green, C.dkgreen, C.brown, C.yellow], k: ["phallic", "penis"] },
  { t: "Portrait of whoever's on your left", c: [C.pink, C.stone, C.brown, C.black], k: ["face", "figure"] },
  { t: "The last biscuit in the tin", c: [C.brown, C.stone, C.blue, C.red] },
  { t: "Swans having a row", c: [C.pale, C.blue, C.sky, C.orange, C.black], k: ["birds"] },
  { t: "Hot air balloons at breakfast", c: [C.sky, C.red, C.yellow, C.blue, C.green], k: ["sun"] },
];

// ---- looking at a painting ----------------------------------------------------------------------

export interface Look {
  /** How much of the canvas isn't white, 0..1. */
  cover: number;
  /** Each colour's share of the whole canvas. */
  hist: number[];
  /** Colours with a real share of it (white not counted). */
  colours: number;
  /** The colour there's most of, and its share of what's painted. */
  dom: number; domShare: number; second: number;
  /** How often one pixel differs from the next, 0..1. */
  edges: number;
  /** Shapes of one colour of a decent size, little dots, and the biggest shape's share of the canvas. */
  blobs: number; specks: number; big: number;
  /** How much the painted part matches itself mirrored left to right, 0..1. */
  sym: number;
  /** How much of what's painted is in the subject's colours, and how many of them are used. */
  theme: number; themeHits: number;
  sky: boolean; ground: boolean;
  /** 0 bright to 1 black. */
  dark: number;
  /** Warm colours less cool ones, as a share of what's painted, -1..1. */
  warm: number;
  strokes: number;
  /** The shapes, layout and line in it (sight.ts). */
  s: Sight;
  /** How it was painted, if the painter's easel said. */
  how?: How;
}

const WARM = [C.red, C.orange, C.yellow, C.stone, C.brown, C.pink];
const COOL = [C.blue, C.sky, C.navy, C.green, C.dkgreen, C.purple];
const LUM = [1, 0, 0.5, 0.77, 0.55, 0.68, 0.88, 0.75, 0.35, 0.35, 0.7, 0.82, 0.5, 0.15, 0.4, 0.78];

export function analyse(px: Uint8Array, strokes: number, theme: Theme, how?: How): Look {
  const N = W * H, count = new Array(16).fill(0);
  let lum = 0;
  for (let i = 0; i < N; i++) { count[px[i]]++; lum += LUM[px[i]]; }
  const hist = count.map((n) => n / N);
  const painted = N - count[C.white], cover = painted / N;
  const order = count.map((n, c) => [n, c]).filter(([, c]) => c !== C.white).sort((a, b) => b[0] - a[0]);
  const colours = order.filter(([n]) => n / N > 0.006).length;
  const dom = order[0][0] ? order[0][1] : C.white, second = order[1][0] ? order[1][1] : dom;
  const domShare = painted ? order[0][0] / painted : 0;
  let diff = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (x < W - 1 && px[i] !== px[i + 1]) diff++;
    if (y < H - 1 && px[i] !== px[i + W]) diff++;
  }
  const edges = diff / (2 * N - W - H);
  // shapes: runs of one colour joined up, white left out
  const seen = new Uint8Array(N), stack: number[] = [];
  let blobs = 0, specks = 0, big = 0;
  for (let s = 0; s < N; s++) {
    if (seen[s] || px[s] === C.white) continue;
    const c = px[s];
    let n = 0;
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      n++;
      const x = i % W;
      if (x > 0 && !seen[i - 1] && px[i - 1] === c) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < W - 1 && !seen[i + 1] && px[i + 1] === c) { seen[i + 1] = 1; stack.push(i + 1); }
      if (i >= W && !seen[i - W] && px[i - W] === c) { seen[i - W] = 1; stack.push(i - W); }
      if (i < N - W && !seen[i + W] && px[i + W] === c) { seen[i + W] = 1; stack.push(i + W); }
    }
    if (n >= 24) blobs++; else if (n <= 4) specks++;
    big = Math.max(big, n / N);
  }
  let same = 0, pairs = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) {
    const a = px[y * W + x], b = px[y * W + W - 1 - x];
    if (a === C.white && b === C.white) continue;
    pairs++;
    if (a === b) same++;
  }
  const sym = pairs ? same / pairs : 0;
  let inTheme = 0, themeHits = 0;
  for (const c of theme.c) { inTheme += count[c]; if (hist[c] > 0.01) themeHits++; }
  const third = (y0: number, y1: number, cs: number[]) => {
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) if (cs.includes(px[y * W + x])) n++;
    return n / ((y1 - y0) * W);
  };
  const sky = third(0, H / 3, [C.sky, C.blue, C.navy, C.black, C.pale]) > 0.45;
  const ground = third((2 * H) / 3, H, [C.green, C.dkgreen, C.brown, C.grey, C.stone]) > 0.4;
  const warmN = WARM.reduce((s, c) => s + count[c], 0), coolN = COOL.reduce((s, c) => s + count[c], 0);
  return {
    cover, hist, colours, dom, domShare, second, edges, blobs, specks, big, sym,
    theme: painted ? inTheme / painted : 0, themeHits, sky, ground,
    dark: 1 - lum / N, warm: painted ? (warmN - coolN) / painted : 0, strokes, s: see(px), how,
  };
}

export type Trait = "blank" | "sparse" | "flood" | "mono" | "rainbow" | "scribble" | "speckled" | "detailed" | "landscape"
  | "symmetric" | "dark" | "onTheme" | "offTheme" | "bold" | "warm" | "cool" | "flag" | "stone" | "grey" | "lazy" | "busy" | "corner"
  | Thing | Rude | "spotted" | "rudeWith"
  | "centred" | "thirds" | "lopsided" | "space" | "horizon" | "subject"
  | "complement" | "analogous" | "warmcool" | "contrast" | "flat" | "muddy"
  | "outlined" | "hatched" | "ruled" | "wobbly" | "sure"
  | "slow" | "quick" | "fiddly" | "nerve" | "bigBrush" | "fineBrush" | "ground"
  | "twin" | "oddOne" | "seen" | "changed" | "covered";

export const RUDE: Rude[] = ["finale", "penis", "boobs", "bum", "phallic"];
const THINGS: Thing[] = ["bus", "cat", "face", "house", "sun", "tree", "birds", "figure", "writing"];
/** How the visitors refer to each thing they recognise. */
export const THING_WORDS: Record<Thing | Rude, string> = {
  sun: "the sun", bus: "the bus", cat: "the cat", face: "the face", birds: "the gulls", house: "the house", tree: "the tree",
  figure: "the little man", writing: "the writing", penis: "the rocket", boobs: "the pair", bum: "the bottom", finale: "the fireworks", phallic: "the rocket",
};

/** The same, for something that was there once: "it started as a cat". */
const ONCE_WORDS: Record<Thing | Rude, string> = {
  sun: "a sun", bus: "a bus", cat: "a cat", face: "a face", birds: "some gulls", house: "a house", tree: "a tree",
  figure: "a little man", writing: "some writing", penis: "a rocket", boobs: "a pair of something", bum: "a bottom", finale: "fireworks", phallic: "a rocket",
};

const ITEM_WORDS: Record<Thing, string> = {
  sun: "sun", bus: "bus", cat: "cat", face: "face", birds: "gulls", house: "house", tree: "tree", figure: "little man", writing: "writing",
};

/** What anyone would notice about it, most striking first. */
export function traits(l: Look, theme: Theme): Trait[] {
  const t: Trait[] = [], s = l.s;
  const seen = THINGS.filter((k) => s.things[k]), rude = RUDE.filter((k) => s.rude[k]);
  if (l.cover < 0.012 && !seen.length && !rude.length) return ["blank"];
  t.push(...rude);
  if (rude.some((k) => k !== "phallic") && seen.length) t.push("rudeWith");
  if (theme.k?.some((k) => s.things[k as Thing] || s.rude[k as Rude])) t.push("spotted");
  t.push(...seen);
  if (l.cover > 0.85 && l.domShare > 0.9) t.push("flood");
  if (l.cover < 0.08) t.push("sparse");
  if (l.cover < 0.2 && l.blobs <= 3) t.push("corner");
  if (l.colours >= 9) t.push("rainbow");
  if (l.colours <= 1 && !t.includes("flood")) t.push("mono");
  const flag = l.hist[C.red] > 0.04 && (l.hist[C.blue] + l.hist[C.navy]) > 0.04;
  if (flag) t.push("flag");
  if (l.edges / Math.max(0.05, l.cover) > 0.42 && l.colours <= 4 && l.cover < 0.5) t.push("scribble");
  if (l.specks > 260) t.push("speckled");
  if (l.blobs >= 22 && l.colours >= 5 && l.cover > 0.4) t.push("detailed");
  if (l.sky && l.ground) t.push("landscape");
  if (t.includes("spotted") || l.theme > 0.55 && l.themeHits >= Math.min(3, theme.c.length - 1) && l.cover > 0.15) t.push("onTheme");
  else if (l.theme < 0.2 && l.cover > 0.1) t.push("offTheme");
  if (l.sym > 0.82 && l.cover > 0.1) t.push("symmetric");
  if (l.big > 0.35 && !t.includes("flood")) t.push("bold");
  if (l.dark > 0.62) t.push("dark");
  if (l.hist[C.stone] > 0.15) t.push("stone");
  if ((l.hist[C.grey] + l.hist[C.pale] + l.hist[C.black]) / Math.max(0.01, l.cover) > 0.7 && l.cover > 0.1 && !t.includes("dark")) t.push("grey");
  if (l.warm > 0.6 && l.cover > 0.2) t.push("warm");
  else if (l.warm < -0.6 && l.cover > 0.2) t.push("cool");
  // the layout
  const near = (a: number, b: number, d: number) => Math.abs(a - b) <= d;
  const [sx, sy] = s.subject ?? [s.wx, s.wy];
  if (l.cover > 0.03 && !t.includes("flood")) {
    if (s.subject) t.push("subject");
    if ((near(sx, 1 / 3, 0.07) || near(sx, 2 / 3, 0.07)) && (near(sy, 1 / 3, 0.08) || near(sy, 2 / 3, 0.08))) t.push("thirds");
    else if (near(s.wx, 0.5, 0.07) && near(s.wy, 0.5, 0.09)) t.push("centred");
    else if (!near(s.wx, 0.5, 0.2) || !near(s.wy, 0.5, 0.24)) t.push("lopsided");
    if (l.cover > 0.1 && l.cover < 0.6 && s.space >= 0.35) t.push("space");
  }
  if (s.horizon >= 0.2 && s.horizon <= 0.8) t.push("horizon");
  // the colour
  if (!t.includes("flood")) {
    if (s.complement) t.push("complement");
    else if (s.analogous) t.push("analogous");
    if (s.warmcool && !s.complement) t.push("warmcool");
    if (s.muddy) t.push("muddy");
    else if (s.range >= 0.8 && l.cover > 0.1) t.push("contrast");
    else if (s.range <= 0.25 && l.cover > 0.3) t.push("flat");
  }
  // the line
  if (s.outlined) t.push("outlined");
  if (s.hatched) t.push("hatched");
  const h = l.how;
  if (s.straight >= 3 || (h && h.ruled >= 40 && l.strokes >= 5)) t.push("ruled");
  if (h && h.wobble >= 14) t.push("wobbly");
  else if (h && h.wobble > 0 && h.wobble <= 5) t.push("sure");
  // how it was painted
  if (l.strokes <= 5) t.push("lazy");
  if (l.strokes >= 90) t.push("busy");
  if (h) {
    if (h.secs >= 80) t.push("slow");
    else if (h.secs > 0 && h.secs <= 25 && l.strokes <= 15) t.push("quick");
    if (h.undos >= 10) t.push("fiddly");
    else if (h.undos === 0 && l.strokes >= 25) t.push("nerve");
    if (h.big >= 60 && l.strokes >= 4) t.push("bigBrush");
    else if (h.fine >= 60 && l.strokes >= 15) t.push("fineBrush");
    if (h.ground) t.push("ground");
  }
  return t;
}

// ---- who comes ----------------------------------------------------------------------------------

/** How a visitor looks: jacket colour, hair, something from the wardrobe, smaller for a child, a gull. */
export interface Dress { coat: string; hair?: string; wear?: string; small?: boolean; gull?: boolean; woman?: boolean; pitch?: number }

interface Feat {
  l: Look; t: Set<Trait>;
  cov: number; colourful: number; detail: number; theme: number; effort: number; scrib: number;
  /** How well made it is, whatever anyone's taste, 0..1: the whole canvas used, plenty in it, on the
   *  subject, the time taken and taken carefully. */
  craft: number;
  /** What they'd call the thing they recognised in it, and whose painting it looks like. */
  thing: string; item: string; other: string;
  /** Something the critics' eye (eye.ts) made out that the shape tests have no word for. */
  seen: string;
  /** What it showed early in its time-lapse and doesn't now, and what it shows instead. */
  was: string; became: string;
}
const has = (f: Feat, ...t: Trait[]) => t.some((k) => f.t.has(k));

export interface Visitor {
  name: string;
  /** What the poster says they're like (critics only). */
  taste?: string;
  /** What they are, on their card at the judging (critics only). */
  role?: string;
  critic: boolean;
  dress: Dress;
  /** Their mark out of ten, before a little luck. */
  mark(f: Feat): number;
  /** Which traits they'd sooner talk about, first first. */
  notice: Trait[];
  lines: Partial<Record<Trait | "love" | "meh" | "hate", string[]>>;
}

/** How much each visitor's mark moves for what they notice. Rude doodles move it a little either
 *  way and roughly cancel out over a room, so they're a laugh rather than a way past the bar. */
const LIKES: Record<string, Partial<Record<Trait, number>>> = {
  "Sir Jeremy Plinth": { penis: -1.2, boobs: -0.8, bum: -0.8, finale: -0.5, face: 0.8, house: 0.6, tree: 0.5, sun: 0.3, cat: 0.4, bus: 0.4, birds: 0.3, figure: 0.2, writing: -0.3,
    spotted: 0.8, thirds: 0.6, horizon: 0.4, hatched: 0.4, muddy: -0.8, wobbly: -0.6, sure: 0.5, slow: 0.5, quick: -0.8, twin: -0.8, outlined: -0.3, fineBrush: 0.4, changed: -0.3, covered: 0.3 },
  "Octavia Vane": { penis: 0.6, boobs: 0.3, finale: 0.2, space: 1, subject: 0.6, lopsided: 0.6, centred: -0.6, thirds: -0.5, flat: 0.5, writing: 0.6, house: -0.8, sun: -0.8,
    twin: -1.2, oddOne: 1.2, quick: 0.6, slow: -0.4, bigBrush: 0.5, fiddly: 0.3, wobbly: 0.3, outlined: -0.4, face: -0.4, spotted: -0.4, changed: 0.8, covered: 0.4 },
  "Dr Rupert Varnish": { complement: 1, analogous: 0.6, warmcool: 0.8, contrast: 0.6, flat: -0.8, muddy: -1.5, sun: 0.5, bus: 0.3, outlined: -0.4, ground: 0.4, boobs: 0.2, twin: -0.5, oddOne: 0.4 },
  "Lady Fenella Gouache": { penis: -1.2, boobs: -0.6, bum: -0.5, finale: -0.8, centred: 0.6, lopsided: -0.6, house: 0.6, cat: 0.5, space: 0.4, muddy: -0.6, twin: -0.6, oddOne: 0.6, subject: 0.5 },
  "Pauline (a nan)": { cat: 0.8, face: 0.6, sun: 0.5, house: 0.5, birds: 0.2, slow: 0.4, spotted: 0.3 },
  "Dave (a builder)": { penis: 0.6, boobs: 0.3, bum: 0.4, finale: -0.2, house: 1, ruled: 0.8, wobbly: -0.8, bus: 0.4, horizon: 0.4, bigBrush: 0.3, ground: 0.5, quick: -0.3, changed: -0.4 },
  "Jasper (an art student)": { penis: 1.2, boobs: 0.8, bum: 0.8, finale: 0.6, phallic: 0.3, writing: 0.8, outlined: -0.6, hatched: -0.4, wobbly: 0.6, quick: 0.6, slow: -0.4,
    twin: -0.6, oddOne: 1, centred: -0.5, space: 0.6, spotted: -0.5, changed: 0.8, covered: -0.6 },
  "Gloria (on a coach trip)": { penis: -0.6, boobs: -0.4, finale: -0.3, house: 0.8, bus: 0.6, sun: 0.6, birds: 0.3, horizon: 0.4, spotted: 0.6 },
  "Alfie (aged 7)": { penis: 1.5, bum: 1.5, boobs: 0.5, finale: 1, phallic: 1.5, cat: 1.2, sun: 0.6, figure: 0.8, bus: 0.8, house: 0.4, tree: 0.4, quick: 0.3, changed: 0.6, covered: -0.5 },
  "Kyle (a Flag Lad)": { penis: 1.5, boobs: 1.2, bum: 0.6, finale: 1, bus: 0.8, writing: 0.3, covered: -0.8 },
  "Gareth (from the Council)": { penis: -1.5, boobs: -1, bum: -1, finale: -1, phallic: -0.3, house: -0.5, writing: -0.8, ruled: 0.8, twin: -0.4, space: -0.4, muddy: 0.4, changed: -0.4, covered: 0.6 },
  "Marcus (a Roman re-enactor)": { penis: 1.5, boobs: 0.6, bum: 0.8, finale: 1, phallic: 0.8, face: 0.6, house: 0.4, figure: 0.4, writing: 0.6, ruled: 0.6 },
  "A seagull": { birds: 2, sun: 0.4 },
};
/** How far each visitor's mark follows the craft in it rather than their own taste. Everyone knows
 *  a careful, finished painting of the subject when they see one, even the ones who'd sooner not. */
const RESPECT: Record<string, number> = {
  "Sir Jeremy Plinth": 0.55, "Octavia Vane": 0.5, "Dr Rupert Varnish": 0.55, "Lady Fenella Gouache": 0.55,
  "Pauline (a nan)": 0.6, "Dave (a builder)": 0.6, "Jasper (an art student)": 0.5, "Gloria (on a coach trip)": 0.6,
  "Alfie (aged 7)": 0.5, "Kyle (a Flag Lad)": 0.55, "Gareth (from the Council)": 0.55, "Marcus (a Roman re-enactor)": 0.6, "A seagull": 0.3,
};
const markOf = (v: Visitor, f: Feat) => {
  const a = RESPECT[v.name] ?? 0.5;
  return (1 - a) * v.mark(f) + a * (1.2 + 8.8 * f.craft) + liking(v, f);
};

/** Craft, as anyone would see it (Feat.craft). */
function craftOf(l: Look, t: Set<Trait>, theme: number, palette: number, colourful: number, detail: number): number {
  if (t.has("blank")) return 0;
  const h = l.how;
  const effort = h ? 0.5 * Math.min(1, h.secs / 85) + 0.5 * Math.min(1, l.strokes / 60) : Math.min(1, l.strokes / 60);
  const care = h ? (h.ground ? 0.35 : 0) + 0.35 * Math.min(1, h.fine / 50) + (h.wobble > 0 && h.wobble <= 8 ? 0.3 : h.wobble === 0 ? 0.1 : 0) : 0.4;
  // the subject's own colours count apart from the subject: a sunrise in greens and purples isn't one
  let q = 0.22 * Math.min(1, l.cover / 0.92) + 0.18 * detail + 0.12 * theme + 0.12 * palette + 0.18 * effort + 0.08 * care + 0.1 * colourful;
  if (t.has("scribble")) q *= 0.7;
  if (t.has("offTheme")) q *= 0.75;
  else if (palette < 0.3 && l.cover > 0.3) q *= 0.85;
  return Math.max(0, Math.min(1, q));
}

const liking = (v: Visitor, f: Feat) => {
  const l = LIKES[v.name];
  if (!l) return 0;
  let d = 0;
  for (const t of f.t) d += l[t] ?? 0;
  return Math.max(-2.5, Math.min(2.5, d));
};

/** The art critics: two come to every show, three to a big one. */
export const CRITICS: Visitor[] = [
  {
    name: "Sir Jeremy Plinth", critic: true, role: "art critic", taste: "old school: wants detail, a likeness, and the subject actually painted",
    dress: { coat: "#5a2a2a", hair: "#d9d9d9", wear: "specs", pitch: 0.75 },
    mark: (f) => has(f, "blank") ? 1 : 1.2 + 8.6 * (0.18 * f.cov + 0.3 * f.detail + 0.37 * f.theme + 0.15 * f.effort) - 2 * f.scrib,
    notice: ["blank", "scribble", "detailed", "onTheme", "offTheme", "flood", "sparse", "symmetric", "landscape", "rainbow", "lazy"],
    lines: {
      blank: ["An empty canvas. I have seen more content in a parish newsletter.", "I was promised {theme}. I have been handed a rectangle of nothing. Bravo, I suppose.", "One can only assume the paint was stolen in transit."],
      sparse: ["A brave little mark, alone in a vast white silence. Like a sheep in a snowstorm.", "There's something in the corner. I should rather like to know what it is, and so, I suspect, would {name}."],
      corner: ["Everything huddled in one corner, as if the rest of the canvas owed it money."],
      scribble: ["This is not brushwork. This is a wasp trapped in a jam jar.", "The line has been let out without supervision, and it has gone feral."],
      detailed: ["Look at the incident! The texture! Rembrandt would have nodded. Slowly. But nodded.", "Every square inch is working for its living. I approve enormously."],
      onTheme: ["Unmistakably {theme}. One could set one's watch by it.", "{theme}, rendered with real conviction. I could weep. I shan't, but I could."],
      offTheme: ["The brief said {theme}. This is, at best, a cousin of {theme} who emigrated.", "I have searched for {theme} as one searches for one's reading glasses. In vain."],
      symmetric: ["A pleasing symmetry. Palladio would approve, and so, grudgingly, do I."],
      landscape: ["Sky above, earth below. The old rules, and none the worse for it."],
      flood: ["Entirely {colour}. This is a paint chart, not a painting."],
      rainbow: ["Every colour in the box has been invited, and every one of them has turned up."],
      lazy: ["I counted the brushstrokes. It didn't take long."],
      love: ["A triumph. I shall be insufferable about it at dinner.", "This is why one gets out of bed. Occasionally.", "Accomplished, confident, very nearly competent. High praise, from me."],
      meh: ["Perfectly adequate, in the way a cheese sandwich is adequate.", "It is a painting. I can confirm that much for the record."],
      hate: ["I have seen better work on a bus shelter, and that was mostly rude words.", "A crime against linseed oil.", "I am going to need a sit down and a small sherry."],
    },
  },
  {
    name: "Octavia Vane", critic: true, role: "conceptual critic", taste: "conceptual: less is more, one bold idea; finds pretty pictures dreadfully suburban",
    dress: { coat: "#141416", hair: "#141416", wear: "shades", woman: true, pitch: 1.05 },
    mark: (f) => has(f, "blank") ? 9.3 : has(f, "flood") ? 8.6 : has(f, "sparse") ? 8.2 : has(f, "mono") ? 7.6
      : 6.6 + 3 * f.l.big - 3.6 * f.detail - 1.6 * f.colourful - (has(f, "landscape") ? 1.6 : 0) + (has(f, "offTheme") ? 1 : 0) - (has(f, "onTheme") ? 0.8 : 0),
    notice: ["blank", "flood", "sparse", "mono", "bold", "landscape", "detailed", "offTheme", "onTheme", "rainbow", "scribble"],
    lines: {
      blank: ["The absence of paint IS the paint. {name} has said everything by saying nothing.", "At last, an artist brave enough to stop before starting. Genius.", "A void that stares back. I'm genuinely moved. Give me a moment."],
      sparse: ["The restraint! One mark, and the rest is silence. Ravishing."],
      flood: ["Pure, uncompromising {colour}. It isn't a painting of anything. It IS {colour}.", "A wall of {colour}. It doesn't want your approval, and that's why it has it."],
      mono: ["One colour. One idea. One tear, rolling slowly down my cheek."],
      bold: ["A big, confident shape. It doesn't ask permission. I like that in a shape."],
      detailed: ["So much... stuff. It's like being shouted at by a car boot sale.", "Very busy. Very worked. Very... garden centre café."],
      landscape: ["Sky at the top, grass at the bottom. Darling, it's a placemat."],
      onTheme: ["It's literally {theme}. Where's the risk? Where's the danger?"],
      offTheme: ["It refuses to be {theme}. A thrilling act of defiance against the curator."],
      rainbow: ["Every colour at once, like a migraine at a children's party."],
      scribble: ["The frenzy! It reads as a scream from the suburbs. Or a toddler. Either way, valid."],
      love: ["I want to live inside this. Possibly in a loft conversion.", "Important. Difficult. I'll be writing about it for weeks."],
      meh: ["It's fine. Fine is the enemy, but it's fine.", "I feel nothing. Which is, I suppose, something."],
      hate: ["It's trying so hard to be liked. Like a Labrador.", "Pretty. And I mean that as an insult."],
    },
  },
  {
    name: "Dr Rupert Varnish", critic: true, role: "colourist and critic", taste: "a colourist: wants bright, warm, brave colour; can't abide grey and gloom",
    dress: { coat: "#c25a1a", hair: "#6b4a2b", wear: "deer", pitch: 0.9 },
    mark: (f) => has(f, "blank") ? 1.5 : 2 + 5.5 * f.colourful + 1.8 * f.cov + 1.4 * Math.max(0, f.l.warm) - 3.2 * Math.max(0, f.l.dark - 0.35) - (has(f, "grey") ? 2.2 : 0),
    notice: ["blank", "rainbow", "grey", "dark", "flood", "mono", "warm", "cool", "detailed", "speckled"],
    lines: {
      blank: ["Not one colour. Not even white, technically. That's the canvas."],
      rainbow: ["A riot! A carnival! My pupils have gone the size of saucers.", "{colour}, {second} and everything in between. I need sunglasses and I don't care."],
      grey: ["Grey, grey, grey. A painting of drizzle by someone who loves drizzle.", "So much grey. It looks like the inside of a filing cabinet."],
      dark: ["So gloomy. Was {name} painting in a coal cellar?", "It's very dark. Like a Wednesday in February."],
      flood: ["A whole canvas of {colour}. Bold. Exhausting. Mostly bold."],
      mono: ["Just {colour}? It's a colour chart with ideas above its station."],
      warm: ["All that warm {colour}. It's like a hug from a radiator."],
      cool: ["Cool blues and greens. Calm, collected, faintly Scandinavian."],
      detailed: ["The colours all talking at once, and somehow it's a conversation."],
      speckled: ["Sprayed like a fine mist of {colour}. Pointillism, done with a garden hose."],
      love: ["The colour sings. Actually sings. I can hear it. Is anyone else hearing it?", "Gorgeous. Somebody fetch me a fan."],
      meh: ["The colour's there. It just isn't saying much.", "Pleasant. Like a tin of travel sweets."],
      hate: ["Drab. I've seen livelier colour on a hospital corridor.", "Where has all the colour gone? Has it been confiscated?"],
    },
  },
  {
    name: "Lady Fenella Gouache", critic: true, role: "collector", taste: "a collector: buys it if it's big, bold, tidy, and goes with the sofa",
    dress: { coat: "#7a3f8a", hair: "#c9a45c", woman: true, pitch: 1.15 },
    mark: (f) => has(f, "blank") ? 2 : 1.8 + 3.8 * f.cov + 3 * f.l.big + 1.6 * f.l.sym + (has(f, "stone", "warm") ? 1 : 0) - 2.4 * f.scrib - 2 * Math.max(0, f.l.dark - 0.4),
    notice: ["blank", "scribble", "bold", "symmetric", "stone", "dark", "flood", "speckled", "corner", "rainbow"],
    lines: {
      blank: ["Is it... for sale? The frame's rather good. I'll take the frame."],
      scribble: ["Oh no. No no. Nobody's hanging that over a Chesterfield."],
      bold: ["Big, bold, decisive. It would look marvellous over the Aga.", "Statement piece. The neighbours would be livid. I adore it."],
      symmetric: ["Wonderfully balanced. Like a well-laid dinner table."],
      stone: ["That lovely warm stone colour. It goes with everything I own."],
      dark: ["Far too dark for the drawing room. Perhaps the downstairs loo."],
      flood: ["Entirely {colour}. I could have it in the guest bedroom. As a wall."],
      speckled: ["It looks as if someone sneezed on it. Expensively, but still."],
      corner: ["Lovely little thing in the corner. One could put a much bigger frame on it."],
      rainbow: ["So many colours. It would clash with absolutely everything I have."],
      love: ["I'll take it. Have it wrapped. Don't tell my husband.", "It goes with the sofa. That is the highest praise I know."],
      meh: ["It might do for the holiday cottage.", "Hmm. Perhaps for the stairs, where nobody stops."],
      hate: ["I wouldn't hang it in the garage. And we've got a nice garage.", "My decorator would resign."],
    },
  },
];

/** Ordinary people come along too: a nan, a builder, a student... their marks count once. */
export const PUNTERS: Visitor[] = [
  {
    name: "Pauline (a nan)", critic: false, dress: { coat: "#9a6fb0", hair: "#e4e4e4", woman: true, pitch: 1.2 },
    mark: (f) => has(f, "blank") ? 6.5 : 7.2 + 2 * f.cov + 0.8 * f.colourful,
    notice: ["blank", "dark", "rainbow", "scribble", "flood", "lazy"],
    lines: {
      blank: ["Oh, they've not finished it, bless them. Still, lovely frame."],
      dark: ["Bit dark, love. Have you tried opening a window?"],
      rainbow: ["Ooh, all the colours! Just like my good cardigan."],
      scribble: ["Is it a horse? It's a lovely horse. Whatever it is."],
      flood: ["Ooh, {colour}. Our bathroom's that colour. Avocado, they called it."],
      lazy: ["Didn't take long, did it? Still, that's the young ones for you. Busy."],
      love: ["Oh, that's lovely, that is. I'd put that on my fridge.", "Our Kieran did one just like this at school. He's an accountant now.", "Beautiful. I'm going to cry. I always cry. I cried at the bus station."],
      meh: ["Very nice, dear. Very nice. Is there tea?", "Lovely. Is it upside down? Doesn't matter. Lovely."],
      hate: ["Well. I'm sure their mum likes it."],
    },
  },
  {
    name: "Dave (a builder)", critic: false, dress: { coat: "#e8f020", hair: "#3b2a1d", wear: "cone", pitch: 0.7 },
    mark: (f) => has(f, "blank") ? 3 : has(f, "flood") ? 7.5 : 1.8 + 6.4 * (0.25 * f.cov + 0.2 * f.detail + 0.35 * f.theme + 0.2 * f.effort) + 1.4 * f.l.sym - 2 * f.scrib,
    notice: ["blank", "flood", "scribble", "detailed", "symmetric", "stone", "offTheme", "onTheme", "speckled"],
    lines: {
      blank: ["Primed it, then knocked off early. I respect that, to be fair."],
      flood: ["Nice even coat of {colour}, that. Two coats, I'd say. Lovely finish.", "Proper coverage, no drips. I'd take this lad on."],
      scribble: ["My lad could do that. My lad's thirty-four, mind.", "Looks like the wiring in a house I did in Keynsham."],
      detailed: ["That's a proper job, that is. Who did your snagging?"],
      symmetric: ["Dead level, that. You've used a spirit level, haven't you."],
      stone: ["That's a proper stone colour, that. Planning'll love it."],
      offTheme: ["What's it meant to be? No, don't tell me. Is it a skip?"],
      onTheme: ["Oh, it's {theme}! I get it. Nice one."],
      speckled: ["That's overspray, that. You want to mask up before you start."],
      love: ["Smashing. I'll have that in the van.", "Lovely bit of work. Not a cowboy job at all."],
      meh: ["S'alright. I'd want it a bit straighter.", "Bit of filler round the edges and you're laughing."],
      hate: ["I'd rip that out and start again, mate.", "Somebody's going to have to come back and do that properly."],
    },
  },
  {
    name: "Jasper (an art student)", critic: false, dress: { coat: "#2a2a2a", hair: "#a0522d", pitch: 0.95 },
    mark: (f) => has(f, "blank") ? 6 : 3.8 + 3.4 * f.l.dark + 2.4 * f.scrib + (has(f, "mono") ? 1 : 0) - (has(f, "landscape") ? 2 : 0) - 1.6 * f.theme + 1.2 * (1 - f.effort),
    notice: ["landscape", "dark", "scribble", "blank", "onTheme", "mono", "rainbow", "symmetric"],
    lines: {
      landscape: ["Bit basic, innit. Sky at the top. Groundbreaking.", "Grass, sky. It's giving GCSE. And not the good kind."],
      dark: ["The darkness really speaks to me. I'm also wearing all black, so."],
      scribble: ["Very raw. Very 'my portfolio's due Tuesday'. Love it.", "It's giving late capitalism. In a good way."],
      blank: ["The blank canvas as a critique of the gallery system. Or a nap. Both valid."],
      onTheme: ["It's quite... literal? Like, it's just {theme}?"],
      mono: ["Monochrome. Bold. My tutor would hate it. Which is the point."],
      rainbow: ["Loads of colours. Feels a bit like an advert for a bank."],
      symmetric: ["The symmetry's a bit bourgeois, if I'm honest."],
      love: ["This is the realest thing in the room.", "I'm going to do my dissertation on this. Probably. If I do one."],
      meh: ["It's fine. I'd have done it ironically.", "Mm. I liked their earlier stuff. Before this."],
      hate: ["Feels a bit corporate, no offence.", "This would sell well in a hotel. That's not a compliment."],
    },
  },
  {
    name: "Gloria (on a coach trip)", critic: false, dress: { coat: "#e88aa8", hair: "#c0c0c0", wear: "shades", woman: true, pitch: 1.1 },
    mark: (f) => has(f, "blank") ? 3 : 2.6 + 4 * f.theme + (has(f, "landscape") ? 2 : 0) + 1.8 * f.cov + (has(f, "stone") ? 1 : 0),
    notice: ["blank", "landscape", "onTheme", "offTheme", "stone", "detailed", "dark"],
    lines: {
      blank: ["Is this the famous one? It's smaller than I thought. And emptier."],
      landscape: ["Oh, it's a view! I'll take a photo of it for the grandkids. Say cheese, painting!"],
      onTheme: ["Look, Ron, it's {theme}! Ron? Where's Ron gone?"],
      offTheme: ["I thought it was {theme}. The leaflet said {theme}."],
      stone: ["Lovely stone. We've been looking at stone all day. Ever so much stone."],
      detailed: ["So much going on! I'll have to buy the postcard to take it all in."],
      dark: ["Bit gloomy. Like our hotel room."],
      love: ["Gorgeous. Is there a gift shop? I want it on a tea towel.", "Oh, I'd buy that on a fridge magnet. Two, actually."],
      meh: ["Very nice. Our coach goes at four, mind.", "Lovely. Is that the toilets through there?"],
      hate: ["Hm. The one in Weston was better."],
    },
  },
  {
    name: "Alfie (aged 7)", critic: false, dress: { coat: "#3f9be8", hair: "#c9a45c", small: true, pitch: 1.6 },
    mark: (f) => has(f, "blank") ? 1 : 2.6 + 4.4 * f.colourful + 2 * f.scrib + 1.2 * Math.max(0, f.l.warm) - (has(f, "grey") ? 2.6 : 0) + (has(f, "busy") ? 1 : 0),
    notice: ["blank", "rainbow", "scribble", "grey", "flood", "detailed", "dark"],
    lines: {
      blank: ["There's nothing on it. Is it invisible? Is it a ghost?", "Mum, this one's broken."],
      rainbow: ["RAINBOW! Best one! Best one in the whole world!"],
      scribble: ["That's what my little sister does. She's two.", "Is that a poo? It looks like a poo. Mum, it's a poo."],
      grey: ["Boring. Why is it all grey? Is it a rainy day picture?"],
      flood: ["It's just {colour}. I could do that with my eyes closed. Watch. No, watch."],
      detailed: ["Woah. Is there a secret dinosaur in it? I bet there's a secret dinosaur."],
      dark: ["It's night time in it. Is there a monster? There's probably a monster."],
      love: ["I like this one. Can we get a dog?", "This one's cool. Ten. No, a hundred."],
      meh: ["S'okay. Can I have an ice cream now?", "I did a better one at school and I got a sticker."],
      hate: ["I don't like it. I want to go home.", "Why is it {colour}? Things aren't {colour}."],
    },
  },
  {
    name: "Kyle (a Flag Lad)", critic: false, dress: { coat: "#d8262e", hair: "#1d1d20", pitch: 0.85 },
    mark: (f) => has(f, "blank") ? 2 : 3.6 + (has(f, "flag") ? 5 : 0) + 2 * f.l.big + 4 * f.l.hist[C.red],
    notice: ["flag", "blank", "bold", "flood", "rainbow"],
    lines: {
      flag: ["Now THAT is a flag. Proper. Ten out of ten. Eleven.", "Red and blue. Get it on a pole. Get it on every pole."],
      blank: ["Where's the flag? There's not even a painting, never mind a flag."],
      bold: ["Big, innit. Big's good. Would be better as a flag."],
      flood: ["All {colour}. Could hang that off a bridge, to be fair."],
      rainbow: ["Too many colours, bruv. A flag's got three, tops."],
      love: ["Proper. Would look sick off a car aerial.", "Yes lads. YES. That's going on the wall at the club."],
      meh: ["It's alright. Needs more flags.", "Where's the flag, though? Can't trust a painting with no flag."],
      hate: ["Rubbish. Not a single flag on it.", "Shan't be getting that tattooed."],
    },
  },
  {
    name: "Gareth (from the Council)", critic: false, dress: { coat: "#4a4d52", hair: "#6b4a2b", wear: "specs", pitch: 0.8 },
    mark: (f) => has(f, "blank") ? 6 : 5 + 4 * f.l.hist[C.stone] / Math.max(0.1, f.l.cover) + 2 * f.l.sym - 3 * f.colourful - 2 * f.scrib - 1.4 * f.l.big + (has(f, "grey") ? 1.4 : 0),
    notice: ["stone", "rainbow", "bold", "scribble", "blank", "grey", "flood", "symmetric"],
    lines: {
      stone: ["Lovely stone colour. Fully compliant. Seven out of ten, which in planning terms is a party."],
      rainbow: ["Too many colours. We have a list of approved colours, and this isn't on it."],
      bold: ["Not in keeping with the conservation area, I'm afraid."],
      scribble: ["This would never get planning permission. Not in a month of Sundays."],
      blank: ["Blank. No objections. I wish more people did this, frankly."],
      grey: ["Sensible greys. Very much what we'd like to see on a new build."],
      flood: ["A single {colour}. I'll need to see a sample panel before I can comment further."],
      symmetric: ["Pleasingly regular. I'd wave this through at committee."],
      love: ["I'd approve this. With conditions. Several conditions.", "No objections. Put it in writing, though."],
      meh: ["I'll have to refer this to my line manager.", "It's fine, subject to a site visit."],
      hate: ["Refused. You can appeal, but it'll take eighteen months.", "There's been a complaint already. From me."],
    },
  },
  {
    name: "Marcus (a Roman re-enactor)", critic: false, dress: { coat: "#a3201c", hair: "#2a1d14", wear: "helmet", pitch: 0.75 },
    mark: (f) => has(f, "blank") ? 2 : 2.4 + 6 * (f.l.hist[C.red] + f.l.hist[C.yellow] + f.l.hist[C.stone]) / Math.max(0.1, f.l.cover) + 1.6 * f.l.sym + 2 * f.detail,
    notice: ["blank", "symmetric", "warm", "stone", "cool", "detailed", "scribble"],
    lines: {
      blank: ["Like a temple before the builders came. Very authentic. Bit empty."],
      symmetric: ["Symmetrical. Like a good legion in formation. I approve."],
      warm: ["Red and gold, the colours of the Empire. Ave, {name}."],
      stone: ["Good honest stone. We built a bath out of that, you know. Well, they did."],
      cool: ["Bit cold. Needs a hypocaust under it."],
      detailed: ["Like a mosaic! I make mosaics at weekends. My wife has views."],
      scribble: ["The Picts drew like this. And look what happened to them."],
      love: ["What have the Romans ever done for us? Not this, but it's magnificent.", "Worthy of an emperor. A minor emperor. But an emperor."],
      meh: ["Needs more Romans. Everything needs more Romans.", "Decent. I'd hang it in the villa. Back room."],
      hate: ["In the legion, we'd have thrown this to the lions. Figuratively.", "This would make a centurion weep, and they don't."],
    },
  },
  {
    name: "A seagull", critic: false, dress: { coat: "#ffffff", gull: true },
    mark: (f) => 3.5 + 6 * Math.min(1, (f.l.hist[C.grey] + f.l.hist[C.pale]) * 3 + f.l.hist[C.yellow] * 4),
    notice: ["blank", "warm", "grey", "flood"],
    lines: {
      blank: ["SKRAAAW. (It looks for chips on the canvas. There are none.)"],
      warm: ["KEK. KEK KEK KEK. (It's seen something yellow and thinks it's chips.)"],
      grey: ["Skraaaaaw. (It recognises a relative.)"],
      flood: ["SKRAW. (It pecks the {colour} bit, to be sure.)"],
      love: ["SKRAAAAAAAW! (It does a little dance.)", "Kek. Kek kek kek. (Delighted. Possibly by the frame.)"],
      meh: ["Skraw. (It stares at the painting, then at your sandwich.)", "Kek. (Unmoved.)"],
      hate: ["SKRAW. (It leaves a little review of its own on the floor.)"],
    },
  },
];

const ALL = [...CRITICS, ...PUNTERS];
for (const v of ALL) for (const extra of [{ ...MORE[v.name], seen: SEEN[v.name] ?? [] }, VERDICT[v.name] ?? {}]) for (const [k, more] of Object.entries(extra)) {
  const key = k as keyof Visitor["lines"];
  v.lines[key] = [...(v.lines[key] ?? []), ...more];
}
export const visitor = (i: number) => ALL[i];
export const visitorIndex = (v: Visitor) => ALL.indexOf(v);

// ---- a show -------------------------------------------------------------------------------------

export interface Painting {
  id: string; name: string; px: Uint8Array; strokes: number; how?: How; eye?: Eye;
  /** A few snapshots from its time-lapse, earliest first, if the painter's page sent one. */
  early?: Uint8Array[];
}
export interface Remark { at: number; v: number; p: number; text: string; mark: number }
export interface Show {
  /** Who comes, as numbers into the cast (visitor()); the critics first. */
  cast: number[];
  remarks: Remark[];
  /** Seconds the walk round takes. */
  dur: number;
  /** When the judging round's over and the doors open to the public (0 for a show from an older
   *  page, which has none). */
  j: number;
  /** The critics' marks for each painting, in the order they came, for the board after the judging. */
  board: number[][];
  /** Each painting's marks before the room's vote: overall, from the critics, from the punters. */
  marks: number[]; critics: number[]; punters: number[];
  /** Each painting's marks from everyone, for the prizes. */
  spread: number[][];
  /** The rude doodles each painting was found to have, for the prizes. */
  rude: Rude[][];
}

/** Which critics come tonight, from the show's seed and how many are painting. */
export function criticsFor(seed: number, painters: number): number[] {
  const r = rng(seed ^ 0x5eed);
  return shuffled(r, CRITICS.map((_, i) => i)).slice(0, painters >= 4 ? 3 : 2);
}

const fmt = (s: string, o: Record<string, string>) => {
  const t = s.replace(/\{(\w+)\}/g, (m, k) => (k === "theme" ? `“${o.theme}”` : o[k] ?? m));
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const clamp = (v: number) => Math.max(1, Math.min(10, v));
const WALK = 1.5;              // metres a second, strolling

// The judging round, in seconds. Every screen times the cards from the same numbers.
export const JUDGE_FROM = 5;   // the room settles, and the time-lapses play, before the first critic
export const STEP = 1.4;       // a critic stepping up to the painting
export const STAMP = 1.6;      // the mark stamped on the card, before the next one
export const MOVE = 3;         // everyone moving along to the next painting
export const BOARD = 8;        // the critics' marks for every painting, before the doors open
/** How long a critic's card is up: the remark read, then the mark stamped on it. */
export const cardSecs = (text: string) => speakFor(text) + STAMP;
/** A critic as their card puts it: "Sir Jeremy Plinth, art critic". */
export const criticTitle = (v: Visitor) => v.role ? `${v.name}, ${v.role}` : v.name;

/** The evening worked out: who comes, who looks at what in which order, what they say, their marks.
 *  wallAt: where each painting hangs (to time the walking between them). */
export function stageShow(paintings: Painting[], theme: Theme, themeText: string, seed: number, wallAt: (p: number) => [number, number], door: [number, number]): Show {
  const r = rng(seed);
  const n = paintings.length;
  const critics = criticsFor(seed, n);
  const punterCount = Math.min(PUNTERS.length, 3 + n);
  const punters = shuffled(r, PUNTERS.map((_, i) => CRITICS.length + i)).slice(0, punterCount);
  const cast = [...critics, ...punters];
  const looks = paintings.map((p) => withEye(analyse(p.px, p.strokes, theme, p.how), p.eye));
  const kin = alike(paintings.map((p) => p.px));
  const feats: Feat[] = looks.map((l, i) => {
    const t = new Set(traits(l, theme));
    if (kin.twin[i] >= 0) t.add("twin");
    if (kin.odd === i) t.add("oddOne");
    const eye = paintings[i].eye, odd = eye?.seen.find((s) => !s.k);
    if (odd) t.add("seen");
    if (eye && eye.subject >= 0.7 && l.cover > 0.03) { t.add("onTheme"); t.delete("offTheme"); }
    const turn = turnOf(paintings[i].early, l.s);
    if (turn) t.add(turn.k);
    const byColour = 0.6 * l.theme + 0.4 * (l.themeHits / Math.max(1, Math.min(4, theme.c.length)));
    const mine = theme.k?.find((k) => l.s.things[k as Thing] || l.s.rude[k as Rude]);
    const any = mine ?? THINGS.find((k) => l.s.things[k]);
    const colourful = Math.min(1, Math.max(0, l.colours - 1) / 6), detail = Math.min(1, l.blobs / 26);
    const fit = Math.min(1, (eye ? 0.4 * byColour + 0.6 * eye.subject : byColour) * Math.min(1, l.cover * 4) + (mine ? 0.35 : 0));
    return {
      thing: any ? THING_WORDS[any] : odd?.word ?? "that", seen: odd?.word ?? "that", item: ITEM_WORDS[THINGS.find((k) => l.s.things[k]) ?? "house"], other: kin.twin[i] >= 0 ? paintings[kin.twin[i]].name : "the next one",
      was: turn?.was ?? "something else", became: turn?.became ?? "this",
      l, t,
      cov: l.cover < 0.6 ? l.cover / 0.6 : 1,
      colourful, detail, theme: fit,
      effort: Math.min(1, l.strokes / 40),
      scrib: t.has("scribble") ? 1 : 0,
      craft: craftOf(l, t, fit, Math.min(1, byColour * 1.3) * Math.min(1, l.cover * 4), colourful, detail),
    };
  });
  const used = new Set<string>(), remarks: Remark[] = [];
  const marks: number[][] = paintings.map(() => []);
  const spread: number[][] = paintings.map(() => []);
  const critic: number[][] = paintings.map(() => []), punter: number[][] = paintings.map(() => []);
  const remark = (k: number, p: number, quiet = false) => {
    const v = ALL[cast[k]], f = feats[p], pr = rng(seed ^ (k * 7919 + p * 104729));
    const mark = Math.round(clamp(markOf(v, f) + (pr() - 0.5) * 1.2) * 2) / 2;
    const text = quiet ? "" : say(v, f, mark, pr, used, {
      name: paintings[p].name, theme: themeText, colour: COLOUR_NAMES[f.l.dom], second: COLOUR_NAMES[f.l.second], thing: f.thing, item: f.item, other: f.other, seen: f.seen, was: f.was, became: f.became,
    });
    (v.critic ? critic : punter)[p].push(mark);
    marks[p].push(mark, ...(v.critic ? [mark] : []));
    spread[p].push(mark);
    return { v: cast[k], p, text, mark };
  };

  // the judging: the critics alone, each in turn at each painting in order, while everyone watches.
  // When three come (a show of four or more), one keeps quiet at each painting, in turn, so it doesn't
  // drag on; their mark still counts, and goes up on the board.
  let t = JUDGE_FROM;
  const board = paintings.map(() => critics.map(() => 0));
  for (let p = 0; p < n; p++) {
    if (p) t += MOVE;
    critics.forEach((_, k) => {
      const quiet = critics.length >= 3 && k === p % critics.length;
      const said = remark(k, p, quiet);
      board[p][k] = said.mark;
      if (quiet) return;
      const at = t + STEP;
      remarks.push({ at, ...said });
      t = at + cardSecs(said.text);
    });
  }
  const j = t + 0.5 + BOARD;

  // then the doors open, and the public walk round: each painting gets a few of them, in turn
  const seeing: number[][] = cast.map(() => []);
  const each = Math.min(punterCount, n === 1 ? 4 : n <= 3 ? 3 : 2);
  let turn = Math.floor(r() * punterCount);
  for (let p = 0; p < n; p++) for (let k = 0; k < each; k++) { seeing[critics.length + (turn % punterCount)].push(p); turn++; }
  for (let k = critics.length; k < cast.length; k++) seeing[k] = shuffled(r, seeing[k]);
  // visitors in turn, each to their next painting, waiting for whoever's talking there
  const busy = new Array(n).fill(j + 2.5), free = cast.map((_, k) => j + 1.5 + k * 1.1), where = cast.map(() => door);
  const left = seeing.map((s) => [...s]);
  for (let guard = 0; guard < 400 && left.some((s) => s.length); guard++) {
    let k = -1;
    for (let q = 0; q < cast.length; q++) if (left[q].length && (k < 0 || free[q] < free[k])) k = q;
    const p = left[k].shift()!;
    const [wx, wz] = wallAt(p), [fx, fz] = where[k];
    const arrive = free[k] + Math.hypot(wx - fx, wz - fz) / WALK;
    const said = remark(k, p);
    const at = Math.max(arrive + 0.6, busy[p]), speak = speakFor(said.text);
    busy[p] = at + speak - 0.4;
    free[k] = at + speak + 0.4;
    where[k] = [wx, wz];
    remarks.push({ at, ...said });
  }
  remarks.sort((a, b) => a.at - b.at);
  const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const dur = Math.max(j, ...free, ...busy) + 1.5;
  return { cast, remarks, dur, j, board, marks: marks.map(mean), critics: critic.map(mean), punters: punter.map(mean), spread, rude: looks.map((l) => RUDE.filter((k) => l.s.rude[k])) };
}

/** What the critics' eye was sure of counts as if the shape tests had found it too. */
function withEye(l: Look, eye?: Eye): Look {
  for (const s of eye?.seen ?? []) {
    if (!s.k) continue;
    const to = (RUDE as string[]).includes(s.k) ? l.s.rude as Record<string, number> : l.s.things as Record<string, number>;
    to[s.k] = Math.max(to[s.k] ?? 0, 1);
  }
  return l;
}

/** The snapshots from a time-lapse worth checking for a change of mind: a third, half and two thirds
 *  of the way through (never the finished painting itself). */
export const earlyFrom = (frames: Uint8Array[]) =>
  frames.length < 3 ? [] : [0.3, 0.5, 0.7].map((u) => frames[Math.min(frames.length - 2, Math.floor(u * frames.length))]);

/** Did it change its mind on the way: something seen in an early snapshot that's gone from the
 *  finished painting, with something new in its place ("changed"), or a rude one painted out
 *  ("covered")? Writing and near-misses come and go too easily to count. */
function turnOf(early: Uint8Array[] | undefined, end: Sight): { k: "changed" | "covered"; was: string; became: string } | null {
  if (!early?.length) return null;
  const keys = (s: Sight) => [...THINGS.filter((k) => s.things[k]), ...RUDE.filter((k) => s.rude[k])].filter((k) => k !== "writing" && k !== "phallic") as (Thing | Rude)[];
  const now = keys(end), rudeNow = RUDE.some((k) => end.rude[k]);
  for (const px of early.slice(0, 3)) {
    const then = keys(see(px)), gone = then.filter((k) => !now.includes(k));
    if (!gone.length) continue;
    const rude = gone.find((k) => (RUDE as string[]).includes(k));
    if (rude && !rudeNow) return { k: "covered", was: ONCE_WORDS[rude], became: "" };
    const fresh = now.find((k) => !then.includes(k) && !(RUDE as string[]).includes(k));
    if (fresh) return { k: "changed", was: ONCE_WORDS[gone[0]], became: ONCE_WORDS[fresh] };
  }
  return null;
}

/** Which paintings look like each other (the dominant colour of each patch of a coarse grid, and the
 *  mix of colours), and which one looks least like any of the rest. */
export function alike(pxs: Uint8Array[]): { twin: number[]; odd: number } {
  const GX = 12, GY = 9;
  const sig = pxs.map((px) => {
    const cells: number[] = [], hist = new Array(16).fill(0);
    for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
      const c = new Array(16).fill(0);
      for (let y = Math.floor((gy * H) / GY); y < Math.floor(((gy + 1) * H) / GY); y += 2)
        for (let x = Math.floor((gx * W) / GX); x < Math.floor(((gx + 1) * W) / GX); x += 2) c[px[y * W + x]]++;
      cells.push(c.indexOf(Math.max(...c)));
      c.forEach((n, k) => (hist[k] += n));
    }
    const tot = hist.reduce((a, b) => a + b, 0);
    return { cells, hist: hist.map((n) => n / tot), blank: hist[C.white] / tot > 0.985 };
  });
  const sim = (a: typeof sig[0], b: typeof sig[0]) => {
    let same = 0, both = 0;
    a.cells.forEach((c, i) => { if (c !== C.white || b.cells[i] !== C.white) { both++; if (c === b.cells[i]) same++; } });
    const h = a.hist.reduce((s, v, k) => s + Math.min(v, b.hist[k]), 0);
    return 0.5 * (both ? same / both : 1) + 0.5 * h;
  };
  const n = pxs.length, twin = new Array(n).fill(-1), S = pxs.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) S[i][j] = sim(sig[i], sig[j]);
  for (let i = 0; i < n; i++) {
    if (sig[i].blank) continue;
    let best = -1;
    for (let j = 0; j < n; j++) if (j !== i && !sig[j].blank && S[i][j] >= 0.78 && (best < 0 || S[i][j] > S[i][best])) best = j;
    twin[i] = best;
  }
  let odd = -1;
  if (n >= 3) {
    const far = S.map((row, i) => row.reduce((s, v, j) => s + (j === i ? 0 : 1 - v), 0) / (n - 1));
    const order = far.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    if (order[0][0] >= 0.55 && order[0][0] >= 1.25 * order[1][0] && !sig[order[0][1]].blank) odd = order[0][1];
  }
  return { twin, odd };
}

/** What part of a painting each remark is about, so the two observations in one remark are about
 *  different things and can't contradict each other (slating the colour, then praising it). */
const ASPECT: Partial<Record<Trait, string>> = {
  penis: "rude", boobs: "rude", bum: "rude", finale: "rude", phallic: "rude", rudeWith: "rude",
  changed: "turn", covered: "turn",
  spotted: "brief", onTheme: "brief", offTheme: "brief",
  sun: "thing", bus: "thing", cat: "thing", face: "thing", house: "thing", tree: "thing", birds: "thing", figure: "thing", writing: "thing", seen: "thing",
  blank: "whole", sparse: "whole", corner: "whole", detailed: "whole",
  thirds: "layout", centred: "layout", lopsided: "layout", space: "layout", horizon: "layout", subject: "layout", symmetric: "layout", landscape: "layout", bold: "layout",
  complement: "colour", analogous: "colour", warmcool: "colour", contrast: "colour", flat: "colour", muddy: "colour", rainbow: "colour", mono: "colour",
  flood: "colour", grey: "colour", dark: "colour", warm: "colour", cool: "colour", stone: "colour", flag: "colour",
  outlined: "line", hatched: "line", ruled: "line", wobbly: "line", sure: "line", scribble: "line", speckled: "line",
  slow: "how", quick: "how", fiddly: "how", nerve: "how", bigBrush: "how", fineBrush: "how", ground: "how", lazy: "how", busy: "how",
  twin: "compare", oddOne: "compare",
};

/** A line's sentences, an ellipsis not counting as an ending. */
const pieces = (s: string) => s.replace(/\.\.\.|…/g, ",").trim().split(/(?<=[.!?]+['"”’)]*)\s+/);
export const sentences = (s: string) => pieces(s).length;
/** How much a line says, in sentences, a quip of three words or fewer ("Proper.", "It is.") counting half. */
const heft = (s: string) => pieces(s).reduce((n, p) => n + (p.split(/\s+/).length <= 3 ? 0.5 : 1), 0);

/** Seconds a remark stays up: long enough to read, from a one-liner to a full three sentences. */
export const speakFor = (text: string) => Math.min(9.5, Math.max(4.6, 2.2 + 1.3 * sentences(text) + text.length / 50));

/** Which way each visitor's own line about a thing leans, where LIKES doesn't already say: praise
 *  first, then scorn. A remark that opens one way and ends with a mark the other has to turn on a
 *  "still", or it reads as two people talking. */
const TONE: Record<string, [string, string]> = {
  "Sir Jeremy Plinth": ["detailed onTheme symmetric landscape ground", "blank sparse corner scribble offTheme flood lazy lopsided flat bigBrush nerve"],
  "Octavia Vane": ["blank sparse flood mono bold offTheme scribble contrast nerve", "detailed landscape onTheme rainbow house sun tree cat birds complement outlined"],
  "Dr Rupert Varnish": ["rainbow warm cool detailed sun bus hatched bigBrush ground", "blank grey dark mono"],
  "Lady Fenella Gouache": ["bold symmetric stone house cat sun centred subject space analogous flat slow oddOne", "blank scribble dark speckled rainbow lopsided muddy twin"],
  "Pauline (a nan)": ["rainbow scribble cat face sun house slow", "dark lazy muddy"],
  "Dave (a builder)": ["flood detailed symmetric stone onTheme house ruled sure fineBrush ground", "scribble offTheme speckled wobbly muddy quick"],
  "Jasper (an art student)": ["dark scribble blank mono wobbly quick oddOne", "landscape onTheme rainbow symmetric outlined hatched ruled slow centred"],
  "Gloria (on a coach trip)": ["landscape onTheme detailed house sun", "blank offTheme dark"],
  "Alfie (aged 7)": ["rainbow detailed cat bus figure", "blank scribble grey flood muddy"],
  "Kyle (a Flag Lad)": ["flag bold flood bus", "blank rainbow complement"],
  "Gareth (from the Council)": ["stone blank grey symmetric ruled centred muddy horizon", "rainbow bold scribble wobbly lopsided complement writing"],
  "Marcus (a Roman re-enactor)": ["symmetric warm stone detailed ruled centred", "cool scribble"],
};
const leaning = (v: Visitor, t: Trait) => {
  const [up, down] = TONE[v.name] ?? ["", ""], word = new RegExp(`(^| )${t}( |$)`);
  if (word.test(up)) return 1;
  if (word.test(down)) return -1;
  const l = LIKES[v.name]?.[t] ?? 0;
  return l >= 0.5 ? 1 : l <= -0.5 ? -1 : 0;
};
/** Never longer than this, so it fits its bubble and is read in under ten seconds. */
const MOST_SENTENCES = 4, MOST_CHARS = 230;

/** What a visitor says about a painting, in up to three parts and about three sentences: the first
 *  thing they'd notice (a rude doodle always, a change of mind often, else high on their list), then
 *  something about another part of it, then what they think of it overall. Every line is said once a
 *  night by each visitor, and each kind of remark once, so a long evening thins out rather than repeats. */
function say(v: Visitor, f: Feat, mark: number, r: Rng, used: Set<string>, o: Record<string, string>): string {
  let said = 0, count = 0, chars = 0;
  const fresh = (list: string[] | undefined, most: number, room: number) => (list ?? []).filter((s) =>
    !used.has(`${v.name}:${s}`) && heft(s) <= most && (!count || sentences(s) <= MOST_SENTENCES - count) && fmt(s, o).length <= room);
  const pickFrom = (key: string, list: string[] | undefined, most = 99, room = 999) => {
    const can = fresh(list, most, room);
    if (!can.length) return null;
    const s = can[Math.floor(r() * can.length)];
    used.add(`${v.name}:${s}`);
    used.add(`${v.name}#${key}`);
    return fmt(s, o);
  };
  const mood = mark >= 7 ? "love" : mark >= 4.5 ? "meh" : "hate";
  const rank = (t: Trait) => { const i = v.notice.indexOf(t); return i >= 0 ? i : 20 + [...f.t].indexOf(t); };
  /** One of the first few things they'd notice that they've a line for, and haven't said that kind of thing yet. */
  const observe = (ok: (t: Trait) => boolean, most: number, room: number): [Trait, string] | null => {
    const can = [...f.t].filter((t) => !RUDE.includes(t as Rude) && ok(t) && fresh(v.lines[t], most, room).length && !used.has(`${v.name}#${t}`)).sort((a, b) => rank(a) - rank(b));
    if (!can.length) return null;
    const t = can[Math.floor(r() ** 1.5 * Math.min(3, can.length))];
    return [t, pickFrom(t, v.lines[t], most, room)!];
  };
  const parts: string[] = [];
  const add = (s: string) => { parts.push(s); said += heft(s); count += sentences(s); chars += s.length + 1; };

  // the lead is a whole line, however long: the lines were written to be said whole
  let lead: [Trait, string] | null = null;
  // a rude doodle always gets a reaction, whatever else they'd have said
  const rude = [...RUDE, "rudeWith" as Trait].filter((t) => f.t.has(t) && fresh(v.lines[t], 99, 999).length);
  if (rude.length) {
    const k = rude[Math.floor(r() * Math.min(2, rude.length))];
    lead = [k, pickFrom(k, v.lines[k])!];
  }
  // a painting that changed its mind is the talk of the room, for those who caught it
  const turn = (["changed", "covered"] as Trait[]).find((t) => f.t.has(t) && fresh(v.lines[t], 99, 999).length);
  if (!lead && turn && r() < 0.55) lead = [turn, pickFrom(turn, v.lines[turn])!];
  if (!lead) lead = observe(() => true, 99, 999);
  if (lead) { said = heft(lead[1]); count = sentences(lead[1]); chars = lead[1].length; parts.push(lead[1]); }

  // a short lead gets something about another part of the painting, never one that argues with the
  // mark they're about to give; then the mark itself, unless the lead was a whole remark already
  const aspect = lead ? ASPECT[lead[0]] ?? lead[0] : "";
  const facing = mood === "love" ? 1 : mood === "hate" ? -1 : 0;
  const against = !!lead && leaning(v, lead[0]) * facing < 0;
  if (said < 2 && !against) {
    const second = observe((t) => (ASPECT[t] ?? t) !== aspect && !(aspect === "rude" && t === "spotted") && leaning(v, t) * facing >= 0,
      lead ? 1 : 2, MOST_CHARS - chars - 45);
    if (second) add(second[1]);
  }
  if (said < 3) {
    // the gull's verdicts are stage directions, which can't take a "still"
    const turns = against && !v.dress.gull;
    const verdict = pickFrom(mood, v.lines[mood], Math.max(1, 3.5 - said), MOST_CHARS - chars - (turns ? 8 : 0));
    if (verdict) add(turns ? `Still, ${keepCaps.test(verdict) ? verdict : verdict.charAt(0).toLowerCase() + verdict.slice(1)}` : verdict);
  }
  if (!parts.length) parts.push(pickFrom("meh", v.lines.meh) ?? fmt(v.lines[mood]?.[0] ?? "Hmm.", o));
  return parts.join(" ");
}
/** Words that keep their capital after "Still,": I, names, and shouting. */
const keepCaps = /^(I\b|Ron\b|Mum\b|Ave\b|Vae\b|[A-Z]{2,}\b)/;

// ---- the verdict --------------------------------------------------------------------------------

export interface Prize { title: string; p: number; why: string }
export interface Verdict { final: number[]; votes: number[]; prizes: Prize[]; score: number; bar: number; won: boolean; headline: string }

/** How far over the bar a show has to be for the top verdict, a triumph (and a beret for everyone in it). */
export const TRIUMPH = 1.5;

/** What the show needs to average to count as a success: higher the more of you there are. */
export const barFor = (painters: number) => Math.min(6.5, 5.5 + 0.15 * (painters - 1));

/** The marks with the room's vote counted (half a mark for the favourite), the prizes and the headline. */
export function verdict(show: Show, paintings: Painting[], votes: number[], seed: number): Verdict {
  const n = paintings.length, r = rng(seed ^ 0xbeef);
  const top = Math.max(0, ...votes);
  const rude = (p: number) => show.rude?.[p] ?? [];
  // the flourish earns a little something, for the nerve
  const final = show.marks.map((m, p) => Math.min(10, m + (top > 0 && votes[p] === top ? 0.5 : 0) + (rude(p).includes("finale") ? 0.3 : 0)));
  const best = (a: number[]) => a.reduce((b, x, i) => (x > a[b] ? i : b), 0);
  const prizes: Prize[] = [];
  const bis = best(final);
  prizes.push({ title: "Best in Show", p: bis, why: `${final[bis].toFixed(1)} out of 10` });
  if (n > 1) {
    const cp = best(show.critics);
    if (cp !== bis) prizes.push({ title: "The Critics' Pick", p: cp, why: `the critics gave it ${show.critics[cp].toFixed(1)}` });
    const pp = best(show.punters);
    if (pp !== bis && pp !== cp) prizes.push({ title: "The People's Favourite", p: pp, why: `the public gave it ${show.punters[pp].toFixed(1)}` });
    if (top > 0) { const rv = votes.indexOf(top); prizes.push({ title: "The Room's Vote", p: rv, why: `${top} vote${top > 1 ? "s" : ""}, and half a mark` }); }
    const sp = show.spread.map((a) => (a.length ? Math.max(...a) - Math.min(...a) : 0)), d = best(sp);
    if (sp[d] >= 5) prizes.push({ title: "Most Divisive", p: d, why: `marks from ${Math.min(...show.spread[d])} to ${Math.max(...show.spread[d])}` });
  }
  const cheeky = paintings.map((_, p) => p).filter((p) => rude(p).some((k) => k !== "phallic"));
  if (cheeky.length) {
    const p = cheeky[Math.floor(r() * cheeky.length)];
    prizes.push({ title: "The Banksy Award for Restraint", p, why: "not awarded" });
    const fin = cheeky.find((q) => rude(q).includes("finale"));
    if (fin !== undefined) prizes.push({ title: "The Grand Finale Award", p: fin, why: "a third of a mark for the flourish, reluctantly" });
    else prizes.push({ title: "The Donald McGill Medal for Seaside Postcards", p: cheeky[cheeky.length - 1], why: "the committee is not discussing it" });
  }
  const score = final.reduce((s, x) => s + x, 0) / Math.max(1, n);
  const bar = barFor(n), won = score >= bar;
  const lines = won
    ? score >= bar + TRIUMPH ? ["A TRIUMPH ON CANVAS", "CRITICS SPEECHLESS, THEN VERY MUCH NOT", "THE ART WORLD HAS A NEW SENSATION"] : ["CRITICS GRUDGINGLY IMPRESSED", "NOT BAD AT ALL, SAYS EVERYONE, SURPRISED", "LOCAL ARTISTS DO FINE, ACTUALLY"]
    : score < bar - 2 ? ["GALLERY APOLOGISES", "EXHIBITION CLOSED, CURATOR LIES DOWN", "\"MY EYES,\" SAYS CRITIC"] : ["SO CLOSE, SAY CRITICS, KINDLY", "NEARLY ART, SAYS ROW OF CRITICS", "SHOW FALLS JUST SHORT OF THE WALL"];
  if (cheeky.length) lines.push("CRITIC SEES ROCKET, INSISTS IT IS A ROCKET", "COUNCIL TAKES NOTES AT PRIVATE VIEW", "NAN 'DIDN'T HAVE HER GLASSES ON'");
  return { final, votes, prizes, score, bar, won, headline: lines[Math.floor(r() * lines.length)] };
}
