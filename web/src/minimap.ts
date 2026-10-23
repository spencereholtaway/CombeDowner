// Minimap: a round map in the corner that turns with you (your heading is always up), with a
// north marker on its rim. The whole map is drawn once to an offscreen canvas, then each frame
// a rotated window of it is copied in. The wider map round it (the rest of Bath), if there is one,
// is drawn more coarsely to a second canvas underneath, with the ground at full detail wherever
// there's a square of Bath (groundkinds.ts), so it's as sharp as the village's anywhere. The minigames' doors (Spot) get a
// point-of-interest marker on every map here, and the players' own map markers (markers.ts) a pin
// in their owner's colour. Each kind of thing on the maps is a layer the player can switch off in
// the big map's key (mapkey.ts), which draws its rows with the same icons as here. The bus stops
// round about are on the minimap, and the bus route you're driving (busdriver.ts) on both maps,
// with its stops along it and the next one picked out. A race's route
// and its checkpoints (race.ts) are drawn on every map while it's on, and the pencil lines
// (signals.ts) on the big map. Your map (yourmap.ts)
// borrows the big map to colour every square in by what you've done there.
import { GameMap, PATHS } from "./map";
import type { Marker } from "./markers";
import type { PencilLine } from "./signals";
import type { WideChunk } from "./wide";
import { GROUND } from "./groundkinds";
import { drawOwn, type Own } from "./yourmap";

const RANGE = 140;          // metres from the centre of the minimap to its edge
const BASE = 2048;          // offscreen canvas size in pixels
const MAX_ZOOM = 24;        // the full map zooms in as far as this (from the whole map to a few streets)
const SPOT_RANGE = 800;     // metres within which a minigame's marker sits on the minimap's rim, pointing the way
const LOCAL = 900, LOCAL_PX = 1200;   // the sharp patch of the wider map round the player: metres and pixels across

/** A dot on the maps. layer: the key's layer it belongs to (none: always shown). */
export interface Blip { x: number; z: number; colour: string; layer?: string }
/** A pub on the pub map (scene x, z): on is the one under the pointer, label its name. */
export interface Pin { x: number; z: number; on: boolean; label: string }

/** Another player: an arrow in their colour, the way they face, with a red ring if they've just fired. */
export interface Mate { x: number; z: number; yaw: number; colour: string; name: string; firing: boolean }

/** A minigame you can walk into (scene x, z), like the mines or the deli. They all get the same
 *  point-of-interest marker on every map, saying something's here but not what, and a beacon in
 *  the street (beacon.ts). */
export interface Spot { x: number; z: number }
/** The colour of the marker and of the beacon's light. */
export const POI = "#38e6ff";

/** Somewhere a job is on offer today (quests.ts): a round badge in the job's colour with its
 *  letter in it, and what it is (label) written under it on the big map. done: already finished
 *  today, drawn faded. trap: a speed trap (stunts.ts), drawn as a speed camera instead. layer: the
 *  key's layer it belongs to. */
export interface JobSpot { x: number; z: number; colour: string; glyph: string; done?: boolean; label?: string; trap?: boolean; layer?: string }
/** The bus route you're driving (busdriver.ts): its line (scene [x, z] points, round the loop),
 *  its colour, and its stops along it (next: the one you're coming up to). */
export interface BusLine { pts: number[][]; colour: string; stops: { x: number; z: number; name: string; next: boolean }[] }
export const ROUTE = "#2fbf4a";   // Badgerline green

/** A bus stop: a white disc ringed dark, with the route's colour in the middle if it's on your route,
 *  and a yellow ring round it if it's the next one. */
export function stopIcon(g: CanvasRenderingContext2D, x: number, y: number, k: number, route = "", next = false) {
  g.save();
  g.translate(x, y);
  if (next) { g.beginPath(); g.arc(0, 0, 6.2 * k, 0, Math.PI * 2); g.fillStyle = "#ffdd00"; g.fill(); }
  g.beginPath(); g.arc(0, 0, 4 * k, 0, Math.PI * 2);
  g.fillStyle = "#f4f2ea"; g.fill();
  g.lineWidth = 1.2 * k; g.strokeStyle = "#14161c"; g.stroke();
  if (route) { g.beginPath(); g.arc(0, 0, 2 * k, 0, Math.PI * 2); g.fillStyle = route; g.fill(); }
  else { g.fillStyle = "#14161c"; g.fillRect(-2.2 * k, -0.6 * k, 4.4 * k, 1.2 * k); }
  g.restore();
}

/** A bus route's line, as a coloured road with a dark edge. P turns scene (x, z) into canvas pixels. */
function routeLine(g: CanvasRenderingContext2D, b: BusLine, P: (x: number, z: number) => number[], w: number) {
  g.save();
  g.lineJoin = g.lineCap = "round";
  for (const [lw, col] of [[w * 1.9, "rgba(10,14,12,0.75)"], [w, b.colour]] as const) {
    g.strokeStyle = col; g.lineWidth = lw;
    g.beginPath();
    b.pts.forEach((q, i) => { const [px, py] = P(q[0], q[1]); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
    g.stroke();
  }
  g.restore();
}

/** An area to search (a treasure trail's clue, a Wanted poster's last-seen circle): scene x, z, r metres. */
export interface Circle { x: number; z: number; r: number; colour: string; pulse?: boolean }
/** A race's way along the streets (scene x, z pairs) and its checkpoints, from the next one on
 *  (gates, x, z pairs; the first drawn biggest), ending at the finish. */
export interface RouteLine { pts: number[]; gates: number[]; colour: string }

/** A job's badge, centred on (x, y), k pixels to the unit (about 13 units across). */
export function jobIcon(g: CanvasRenderingContext2D, x: number, y: number, k: number, colour: string, glyph: string, done = false) {
  g.save();
  g.translate(x, y);
  g.globalAlpha = done ? 0.45 : 1;
  g.shadowColor = colour; g.shadowBlur = 3 * k;
  g.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; g.lineTo(Math.cos(a) * 6.4 * k, Math.sin(a) * 6.4 * k); }
  g.closePath();
  g.fillStyle = colour; g.fill();
  g.shadowBlur = 0;
  g.lineWidth = 1.1 * k; g.strokeStyle = "#14161c"; g.stroke();
  g.fillStyle = "#14161c";
  g.font = `800 ${8 * k}px "Barlow Condensed", system-ui, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(glyph, 0, 0.6 * k);
  g.restore();
}

/** The Flag Lads' squares, washed red by how much of each they hold, and liberated ones green. */
function drawTint(g: CanvasRenderingContext2D, tint: { x0: number; z0: number; s: number; a: number; free?: boolean }[], P: (x: number, z: number) => number[], scale: number) {
  for (const t of tint) {
    const [x, y] = P(t.x0, t.z0);
    g.fillStyle = t.free ? "rgba(79,209,139,0.45)" : `rgba(214,40,52,${(0.08 + 0.3 * t.a).toFixed(3)})`;
    g.fillRect(x, y, t.s * scale, t.s * scale);
  }
}

/** The speed camera badge, centred on (x, y), k pixels to the unit (about 12 units across): a
 *  yellow box with a dark lens in it, the way the speed traps look in the street. */
export function trapIcon(g: CanvasRenderingContext2D, x: number, y: number, k: number) {
  g.save();
  g.translate(x, y);
  g.shadowColor = "#f5c400"; g.shadowBlur = 3 * k;
  g.beginPath(); g.roundRect(-5.5 * k, -4.5 * k, 11 * k, 9 * k, 1.6 * k);
  g.fillStyle = "#f5c400"; g.fill();
  g.shadowBlur = 0;
  g.lineWidth = 1.1 * k; g.strokeStyle = "#14161c"; g.stroke();
  g.beginPath(); g.arc(-0.6 * k, 0.3 * k, 2.7 * k, 0, Math.PI * 2);
  g.fillStyle = "#14161c"; g.fill();
  g.beginPath(); g.arc(-1.4 * k, -0.5 * k, 0.9 * k, 0, Math.PI * 2);
  g.fillStyle = "#ffffff"; g.fill();
  // the flash, top right
  g.fillStyle = "#14161c"; g.fillRect(2.6 * k, -3.2 * k, 1.8 * k, 1.4 * k);
  g.restore();
}

/** Bendy's marker, centred on (x, y), k pixels to the unit (about 13 units across): a black disc
 *  ringed in purple with the lamp in his forehead glowing yellow, and his long arms hanging down.
 *  after: he's locked on to someone, so the lamp and the ring go red. */
export function bendyIcon(g: CanvasRenderingContext2D, x: number, y: number, k: number, after = false) {
  const ring = after ? "#ff3b30" : "#b06be0";
  g.save();
  g.translate(x, y);
  g.shadowColor = ring; g.shadowBlur = 4 * k;
  g.beginPath(); g.arc(0, 0, 6.2 * k, 0, Math.PI * 2);
  g.fillStyle = "#0d0b10"; g.fill();
  g.shadowBlur = 0;
  g.lineWidth = 1.3 * k; g.strokeStyle = ring; g.stroke();
  // the arms, long and bent, down to the rim
  g.strokeStyle = "#cfc4dc"; g.lineWidth = 0.9 * k; g.lineCap = "round";
  g.beginPath(); g.moveTo(-1.6 * k, 0.4 * k); g.lineTo(-3.4 * k, 2 * k); g.lineTo(-2.6 * k, 4.6 * k); g.stroke();
  g.beginPath(); g.moveTo(1.6 * k, 0.4 * k); g.lineTo(3.4 * k, 2 * k); g.lineTo(2.6 * k, 4.6 * k); g.stroke();
  // the lamp
  const lamp = after ? "#ff5a4a" : "#ffe36a";
  g.shadowColor = lamp; g.shadowBlur = 4 * k;
  g.beginPath(); g.arc(0, -2.2 * k, 1.9 * k, 0, Math.PI * 2);
  g.fillStyle = lamp; g.fill();
  g.restore();
}

/** A job's badge, or a speed trap's camera. */
function spotBadge(g: CanvasRenderingContext2D, x: number, y: number, k: number, j: JobSpot) {
  if (j.trap) trapIcon(g, x, y, k);
  else jobIcon(g, x, y, k, j.colour, j.glyph, j.done);
}

/** Shade everything outside the force field (its circle, and any strip reaching out past it: map.ts)
 *  on a canvas size pixels square, and draw its edge. P turns data (x, y) into canvas pixels. */
function fieldEdge(g: CanvasRenderingContext2D, map: GameMap, P: (x: number, y: number) => number[], size: number) {
  const edge = () => { map.fieldOutline().forEach(([x, z], i) => (i ? g.lineTo(...(P(x, -z) as [number, number])) : g.moveTo(...(P(x, -z) as [number, number])))); g.closePath(); };
  g.fillStyle = "rgba(10, 20, 35, 0.55)";
  g.beginPath();
  g.rect(0, 0, size, size);
  edge();
  g.fill("evenodd");
  g.strokeStyle = "#69c3ff";
  g.lineWidth = 3;
  g.beginPath(); edge(); g.stroke();
}

/** A race's route: a dark-edged line in its colour, a ring at each checkpoint still to pass, and
 *  a chequered flag-ish square at the finish. */
function drawRoutes(g: CanvasRenderingContext2D, routes: RouteLine[], P: (x: number, z: number) => number[], dpr: number) {
  for (const r of routes) {
    if (r.pts.length < 4) continue;
    g.save();
    g.lineJoin = "round"; g.lineCap = "round";
    g.beginPath();
    for (let k = 0; k < r.pts.length; k += 2) { const [x, y] = P(r.pts[k], r.pts[k + 1]); if (k) g.lineTo(x, y); else g.moveTo(x, y); }
    g.strokeStyle = "rgba(10,14,18,0.85)"; g.lineWidth = 6 * dpr; g.stroke();
    g.strokeStyle = r.colour; g.lineWidth = 3 * dpr; g.stroke();
    for (let k = 0; k < r.gates.length; k += 2) {
      const [x, y] = P(r.gates[k], r.gates[k + 1]), big = k === 0;
      g.beginPath(); g.arc(x, y, (big ? 6 : 4) * dpr, 0, Math.PI * 2);
      g.fillStyle = big ? "#ffffff" : "rgba(10,14,18,0.9)"; g.fill();
      g.strokeStyle = r.colour; g.lineWidth = 2 * dpr; g.stroke();
    }
    const [fx, fy] = P(r.pts[r.pts.length - 2], r.pts[r.pts.length - 1]), q = 3.5 * dpr;
    for (let i = -1; i < 1; i++) for (let j = -1; j < 1; j++) { g.fillStyle = (i + j) & 1 ? "#111" : "#fff"; g.fillRect(fx + i * q, fy + j * q, q, q); }
    g.restore();
  }
}

/** Search circles, as a dashed ring with a faint fill. P turns scene (x, z) into canvas pixels; scale is canvas pixels to the metre. */
function drawCircles(g: CanvasRenderingContext2D, circles: Circle[], P: (x: number, z: number) => number[], scale: number, dpr: number) {
  for (const c of circles) {
    const [cx, cy] = P(c.x, c.z), r = Math.max(6 * dpr, c.r * scale);
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
    if (c.pulse) {
      // a bold, breathing ring, dark-edged so it shows on any map
      const beat = 0.5 + 0.5 * Math.sin(performance.now() / 350);
      g.globalAlpha = 0.18 + 0.14 * beat; g.fillStyle = c.colour; g.fill();
      g.setLineDash([]);
      g.globalAlpha = 0.8; g.strokeStyle = "#14161c"; g.lineWidth = (6 + 2 * beat) * dpr; g.stroke();
      g.globalAlpha = 0.7 + 0.3 * beat; g.strokeStyle = c.colour; g.lineWidth = (3.5 + 1.5 * beat) * dpr; g.stroke();
      g.restore();
      continue;
    }
    g.globalAlpha = 0.16; g.fillStyle = c.colour; g.fill();
    g.globalAlpha = 0.95; g.strokeStyle = c.colour; g.lineWidth = 2 * dpr; g.setLineDash([6 * dpr, 4 * dpr]); g.stroke();
    g.restore();
  }
}

/** The point-of-interest marker, centred on (x, y), k pixels to the unit (about 11 units across):
 *  a dark disc ringed in bright cyan with a white star in it. */
/** Pencil lines, a little rough, as if drawn on the map by hand. */
function drawPencil(g: CanvasRenderingContext2D, lines: PencilLine[], P: (x: number, z: number) => number[], dpr: number) {
  g.lineCap = g.lineJoin = "round";
  for (const l of lines) {
    if (l.pts.length < 4) continue;
    g.setLineDash(l.dash ? [8 * dpr, 6 * dpr] : []);
    for (const [w, col] of [[5 * dpr, "rgba(14,16,18,0.6)"], [2.4 * dpr, l.colour]] as const) {
      g.strokeStyle = col; g.lineWidth = w;
      g.beginPath();
      for (let i = 0; i < l.pts.length; i += 2) { const [x, y] = P(l.pts[i], l.pts[i + 1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
  }
  g.setLineDash([]);
}

export function spotIcon(g: CanvasRenderingContext2D, x: number, y: number, k: number) {
  g.save();
  g.translate(x, y);
  g.shadowColor = POI; g.shadowBlur = 3 * k;
  g.beginPath(); g.arc(0, 0, 5.5 * k, 0, Math.PI * 2);
  g.fillStyle = "#14161c"; g.fill();
  g.shadowBlur = 0;
  g.lineWidth = 1.1 * k; g.strokeStyle = POI; g.stroke();
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = (i % 2 ? 1.5 : 3.6) * k, a = (i * Math.PI) / 5;
    g.lineTo(Math.sin(a) * r, -Math.cos(a) * r + 0.2 * k);
  }
  g.closePath();
  g.fillStyle = "#ffffff"; g.fill();
  g.restore();
}

/** A map pin with its point on (x, y), k pixels to the unit (about 17 units tall), in colour c.
 *  Your own has a white dot in it, everyone else's a dark one. */
export function pinIcon(g: CanvasRenderingContext2D, x: number, y: number, k: number, c: string, mine = false) {
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(-1.5 * k, -4 * k, -6 * k, -7 * k, -6 * k, -11 * k);
  g.arc(0, -11 * k, 6 * k, Math.PI, 0);
  g.bezierCurveTo(6 * k, -7 * k, 1.5 * k, -4 * k, 0, 0);
  g.closePath();
  g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = 3 * k;
  g.fillStyle = c; g.fill();
  g.shadowBlur = 0;
  g.lineWidth = 1.2 * k; g.strokeStyle = "rgba(14,16,18,0.85)"; g.stroke();
  g.beginPath(); g.arc(0, -11 * k, 2.3 * k, 0, Math.PI * 2);
  g.fillStyle = mine ? "#ffffff" : "rgba(14,16,18,0.85)"; g.fill();
  g.restore();
}

/** The minigames on a north-up map, at canvas points at. Markers that would sit on top of each
 *  other (zoomed out, the mines and the deli are a street apart) are fanned out, with a thin line
 *  back to where each really is. */
function drawSpots(g: CanvasRenderingContext2D, at: number[][], dpr: number) {
  const R = 12 * dpr, k = 2 * dpr;
  const pos = at.map(([x, y]) => [x, y]);
  for (let i = 0; i < pos.length; i++)
    for (let j = 0; j < i; j++) {
      let dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1];
      const d = Math.hypot(dx, dy);
      if (d >= 2.4 * R) continue;
      if (d < 1e-3) { dx = 0; dy = 1; } else { dx /= d; dy /= d; }
      const push = (2.4 * R - d) / 2;
      pos[i][0] += dx * push; pos[i][1] += dy * push;
      pos[j][0] -= dx * push; pos[j][1] -= dy * push;
    }
  pos.forEach(([x, y], i) => {
    if (Math.hypot(x - at[i][0], y - at[i][1]) > 1) {
      g.strokeStyle = POI; g.lineWidth = 1.5 * dpr;
      g.beginPath(); g.moveTo(at[i][0], at[i][1]); g.lineTo(x, y); g.stroke();
      g.fillStyle = POI; g.beginPath(); g.arc(at[i][0], at[i][1], 2.5 * dpr, 0, Math.PI * 2); g.fill();
    }
    spotIcon(g, x, y, k);
  });
}

/** The cable car's colour on the maps. */
const CABLE = "#e8463a";

/** A cable car badge, centred on (x, y), k pixels to the unit (about 11 units across): a dark disc
 *  ringed in red, with a white cabin hanging from its rope. */
export function cableIcon(g: CanvasRenderingContext2D, x: number, y: number, k: number) {
  g.save();
  g.translate(x, y);
  g.beginPath(); g.arc(0, 0, 5.5 * k, 0, Math.PI * 2);
  g.fillStyle = "#14161c"; g.fill();
  g.lineWidth = 1.1 * k; g.strokeStyle = CABLE; g.stroke();
  g.strokeStyle = "#ffffff"; g.fillStyle = "#ffffff"; g.lineCap = "round";
  // the rope, sloping, and the hanger down to the cabin
  g.lineWidth = 0.6 * k;
  g.beginPath(); g.moveTo(-4 * k, -3.4 * k); g.lineTo(4 * k, -2 * k); g.stroke();
  g.beginPath(); g.moveTo(0, -2.7 * k); g.lineTo(0, -1.2 * k); g.stroke();
  // the cabin, with two windows
  g.beginPath(); g.roundRect(-2.6 * k, -1.2 * k, 5.2 * k, 4 * k, 0.8 * k); g.fill();
  g.fillStyle = "#14161c";
  g.fillRect(-1.9 * k, -0.5 * k, 1.6 * k, 1.4 * k); g.fillRect(0.3 * k, -0.5 * k, 1.6 * k, 1.4 * k);
  g.restore();
}

/** The cable car on a map: its line between the two stations at canvas points a and b, red and
 *  white like a rope, and a cable car badge at each end. */
function drawCable(g: CanvasRenderingContext2D, a: number[], b: number[], dpr: number, k: number) {
  g.save();
  g.lineCap = "butt";
  g.strokeStyle = "rgba(20,24,28,0.85)"; g.lineWidth = 5 * dpr;
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  g.strokeStyle = CABLE; g.lineWidth = 3 * dpr;
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  g.strokeStyle = "#ffffff"; g.setLineDash([5 * dpr, 5 * dpr]);
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  g.restore();
  cableIcon(g, a[0], a[1], k);
  cableIcon(g, b[0], b[1], k);
}

/** A small arrow pointing up, centred on the origin, k pixels to the unit. */
export function arrow(g: CanvasRenderingContext2D, k: number) {
  g.beginPath(); g.moveTo(0, -9 * k); g.lineTo(6 * k, 7 * k); g.lineTo(0, 3 * k); g.lineTo(-6 * k, 7 * k); g.closePath();
}

export class Minimap {
  private base = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private mpp: number;      // metres per base pixel
  private x0: number; private y1: number;
  private size = 0;
  /** The minigames' doors, marked on every map. */
  spots: Spot[] = [];
  /** The players' map markers (markers.ts), set by the game each frame. */
  markers: Marker[] = [];
  /** Today's jobs (quests.ts), and any areas to search. */
  jobs: JobSpot[] = [];
  circles: Circle[] = [];
  routes: RouteLine[] = [];
  /** Lines drawn on the big map with the pencil (signals.ts). */
  pencil: PencilLine[] = [];
  /** Squares of Bath tinted by how much the Flag Lads hold them (invasion.ts): a from 0 to 1. */
  tint: { x0: number; z0: number; s: number; a: number; free?: boolean }[] = [];
  /** Your map (yourmap.ts) while it's open: every square coloured by what you've done there, in place of the tint. */
  own: Own[] | null = null;
  /** The bus stops round about (scene x, z), and the bus route you're driving, if you are. */
  stops: { x: number; z: number }[] = [];
  bus: BusLine | null = null;
  /** Bendy (bendy.ts) while he's about and near enough to show, and whether he's after someone. */
  boss: { x: number; z: number; after: boolean } | null = null;
  /** The layers switched off in the big map's key (mapkey.ts). */
  off = new Set<string>();
  /** A crosshair on the full map (fractions across and down), when the mouse is captured and moves it. */
  cursor: [number, number] | null = null;
  /** How far the full map is zoomed in, and the data point in its middle when it is. */
  private zoom = 1;
  private centre: [number, number] | null = null;
  private labels: { name: string; x: number; y: number; angle: number; len: number }[] = [];
  private field: number;                    // half the width of a square round the whole force field
  private fx: number; private fy: number;   // and that square's middle, data coords (map.fieldFrame)
  private full?: { canvas: HTMLCanvasElement; size: number; scale: number; streets: boolean };
  private fullAt?: HTMLCanvasElement;
  private wide?: { canvas: HTMLCanvasElement; x0: number; y1: number; mpp: number };
  private local?: { canvas: HTMLCanvasElement; x0: number; y1: number; mpp: number; cx: number; cy: number };
  private map?: GameMap;
  private sharp?: { canvas: HTMLCanvasElement; x0: number; y1: number; mpp: number; size: number };
  private sharpT = 0;
  private sharpKey = "";

  /** The cable car's two stations, in scene x, z, if the map has one. */
  private cable: [number, number][] = [];

  constructor(map: GameMap, private canvas: HTMLCanvasElement) {
    if (map.cable) this.cable = map.cable.d.st.map(([, cx, cy]) => [cx, -cy] as [number, number]);
    const frame = map.fieldFrame();
    this.field = frame.r;
    this.fx = frame.x; this.fy = frame.y;
    this.ctx = canvas.getContext("2d")!;
    const D = map.d, [x0, y0, x1, y1] = D.b;
    this.x0 = x0; this.y1 = y1;
    this.mpp = Math.max(x1 - x0, y1 - y0) / BASE || 1;   // (a map whose ground all comes in squares has no picture of its own)
    this.base.width = this.base.height = BASE;
    const g = this.base.getContext("2d")!;
    const P = (x: number, y: number): [number, number] => [(x - x0) / this.mpp, (y1 - y) / this.mpp];

    // ground types from the terrain grid
    const T = D.t;
    g.fillStyle = GROUND[0];
    g.fillRect(0, 0, BASE, BASE);
    const cw = T.dx / this.mpp + 0.6, ch = T.dy / this.mpp + 0.6;
    for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) {
      const k = +T.k[j * T.nx + i];
      if (!k) continue;
      g.fillStyle = GROUND[k];
      const [px, py] = P(T.x0 + i * T.dx, T.y0 + j * T.dy);
      g.fillRect(px - cw / 2, py - ch / 2, cw, ch);
    }
    // water
    g.fillStyle = "#3f6f8c";
    for (const w of D.wp) {
      g.beginPath();
      for (const ring of w.r) ring.forEach(([x, y], i) => (i ? g.lineTo(...P(x, y)) : g.moveTo(...P(x, y))));
      g.fill("evenodd");
    }
    g.strokeStyle = "#3f6f8c";
    g.lineWidth = 1.5 / this.mpp;
    for (const l of D.wl) this.line(g, l.p, P);
    // roads: paths thin and sandy, streets wide and pale
    g.lineCap = g.lineJoin = "round";
    g.strokeStyle = "#a89a78";
    g.lineWidth = 1.6 / this.mpp;
    for (const r of D.rd) if (PATHS.has(r.c)) this.line(g, r.p, P);
    // tunnels: dashed, under everything above them
    g.setLineDash([5 / this.mpp, 4 / this.mpp]);
    g.strokeStyle = "#8d8070";
    g.lineWidth = 3 / this.mpp;
    for (const t of D.tn ?? []) this.line(g, t.p, P);
    g.setLineDash([]);
    g.strokeStyle = "#a89a78";
    g.strokeStyle = "#c9c4b6";
    for (const r of D.rd) {
      if (PATHS.has(r.c)) continue;
      g.lineWidth = (r.c === "primary" || r.c === "tertiary" ? 8 : r.c === "service" ? 4 : 6) / this.mpp;
      this.line(g, r.p, P);
    }
    this.railway(g, map, P, this.mpp);
    // one label per street, halfway along its longest stretch inside the field
    const best = new Map<string, { x: number; y: number; angle: number; len: number }>();
    for (const r of D.rd) {
      if (!r.n || PATHS.has(r.c) || r.p.length < 3) continue;
      let len = 0;
      for (let i = 1; i < r.p.length; i++) len += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]);
      const cur = best.get(r.n);
      if (cur && cur.len >= len) continue;
      let acc = 0, k = 1;
      for (; k < r.p.length - 1; k++) { acc += Math.hypot(r.p[k][0] - r.p[k - 1][0], r.p[k][1] - r.p[k - 1][1]); if (acc >= len / 2) break; }
      const a = r.p[Math.max(0, k - 2)], b = r.p[Math.min(r.p.length - 1, k + 2)];
      if (map.fieldEdge(r.p[k][0], -r.p[k][1]) < 20) continue;
      best.set(r.n, { x: r.p[k][0], y: r.p[k][1], angle: Math.atan2(-(b[1] - a[1]), b[0] - a[0]), len });
    }
    // the wider map's long streets too (its roads come in pieces of up to 384 m)
    for (const r of map.wide?.rd ?? []) {
      if (!r.n || PATHS.has(r.c) || r.p.length < 2) continue;
      let len = 0;
      for (let i = 1; i < r.p.length; i++) len += Math.hypot(r.p[i][0] - r.p[i - 1][0], r.p[i][1] - r.p[i - 1][1]);
      const cur = best.get(r.n);
      if ((cur && cur.len >= len) || len < 150) continue;
      const a = r.p[0], b = r.p[r.p.length - 1], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (map.fieldEdge(mx, -my) < 20) continue;
      best.set(r.n, { x: mx, y: my, angle: Math.atan2(-(b[1] - a[1]), b[0] - a[0]), len });
    }
    this.labels = [...best].map(([name, v]) => ({ name, ...v }));
    // buildings
    g.fillStyle = "#e3c98f";
    g.strokeStyle = "#8a7550";
    g.lineWidth = 1;
    for (const b of D.bl) {
      g.beginPath();
      for (const ring of b.r) { ring.forEach(([x, y], i) => (i ? g.lineTo(...P(x, y)) : g.moveTo(...P(x, y)))); g.closePath(); }
      g.fill("evenodd");
      g.stroke();
    }
    if (map.wide) { this.drawWide(map); return; }
    // outside the force field
    fieldEdge(g, map, P, BASE);
  }

  /** The wider map, on a canvas of its own about 6 m to the pixel, with the force field round it. */
  private drawWide(map: GameMap) {
    const W = map.wide!, canvas = document.createElement("canvas");
    // out to the wider map's edge, or further where the force field reaches out past it (map.ts)
    const R = Math.max(W.d.r, ...map.fieldOutline().map(([x, z]) => Math.max(Math.abs(x - W.fx), Math.abs(-z - W.fy)) + 60));
    const x0 = W.fx - R, y1 = W.fy + R, mpp = (2 * R) / BASE;
    canvas.width = canvas.height = BASE;
    const g = canvas.getContext("2d")!;
    this.paintWide(g, map, x0, y1, mpp, BASE, null);
    this.wide = { canvas, x0, y1, mpp };
    this.map = map;
  }

  /**
   * Paint the wider map onto g, size px square, from (x0, y1) at its top left (data coords),
   * mpp metres to the pixel: ground, water, roads and buildings, then the detailed map on top and
   * the dark outside the force field. chunks: only these squares' roads and buildings (null: all).
   */
  private paintWide(g: CanvasRenderingContext2D, map: GameMap, x0: number, y1: number, mpp: number, size: number, chunks: WideChunk[] | null) {
    const W = map.wide!;
    const P = (x: number, y: number): [number, number] => [(x - x0) / mpp, (y1 - y) / mpp];
    g.fillStyle = GROUND[0];
    g.fillRect(0, 0, size, size);
    // ground types, one pixel per grid cell, smoothed up to size
    const i0 = Math.max(0, Math.floor((x0 - W.x0) / W.dx)), i1 = Math.min(W.nx - 1, Math.ceil((x0 + size * mpp - W.x0) / W.dx));
    const j0 = Math.max(0, Math.floor((y1 - size * mpp - W.y0) / W.dx)), j1 = Math.min(W.ny - 1, Math.ceil((y1 - W.y0) / W.dx));
    if (i1 > i0 && j1 > j0) {
      const kc = document.createElement("canvas");
      kc.width = i1 - i0 + 1; kc.height = j1 - j0 + 1;
      const kg = kc.getContext("2d")!, img = kg.createImageData(kc.width, kc.height);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const col = parseInt(GROUND[W.k[j * W.nx + i]].slice(1), 16), o = ((j1 - j) * kc.width + (i - i0)) * 4;
        img.data[o] = col >> 16; img.data[o + 1] = (col >> 8) & 255; img.data[o + 2] = col & 255; img.data[o + 3] = 255;
      }
      kg.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true;
      const [ax, ay] = P(W.x0 + (i0 - 0.5) * W.dx, W.y0 + (j1 + 0.5) * W.dx);
      g.drawImage(kc, ax, ay, kc.width * W.dx / mpp, kc.height * W.dx / mpp);
    }
    // and the squares' own ground over it, at full detail
    map.groundKinds?.paint(g, x0, y1, mpp, size);
    const pick = <T,>(all: T[], key: "wp" | "wl" | "rd" | "bl") => chunks ? chunks.flatMap((c) => c[key].map((i) => all[i])) : all;
    g.fillStyle = g.strokeStyle = "#3f6f8c";
    for (const w of pick(W.wp, "wp")) {
      g.beginPath();
      for (const ring of w.r) ring.forEach(([x, y], i) => (i ? g.lineTo(...P(x, y)) : g.moveTo(...P(x, y))));
      g.fill("evenodd");
    }
    g.lineWidth = Math.max(1, 1.5 / mpp);
    for (const l of pick(W.wl, "wl")) this.line(g, l.p, P);
    const roads = pick(W.rd, "rd");
    g.lineCap = g.lineJoin = "round";
    g.strokeStyle = "#a89a78";
    g.lineWidth = Math.max(0.6, 1.6 / mpp);
    for (const r of roads) if (PATHS.has(r.c)) this.line(g, r.p, P);
    g.strokeStyle = "#c9c4b6";
    for (const r of roads) {
      if (PATHS.has(r.c)) continue;
      g.lineWidth = Math.max(1, (r.c === "primary" || r.c === "secondary" ? 9 : r.c === "service" ? 4 : 6) / mpp);
      this.line(g, r.p, P);
    }
    this.railway(g, map, P, mpp);
    g.fillStyle = "#e3c98f";
    g.strokeStyle = "#8a7550";
    g.lineWidth = 1;
    for (const b of pick(W.bl, "bl")) {
      g.beginPath();
      for (const ring of b.r) { ring.forEach(([x, y], i) => (i ? g.lineTo(...P(x, y)) : g.moveTo(...P(x, y)))); g.closePath(); }
      g.fill("evenodd");
      if (mpp < 2) g.stroke();
    }
    // the detailed map on top, then outside the force field
    const [bx0, by0, bx1, by1] = map.d.b;
    if (map.d.t.nx) g.drawImage(this.base, ...P(bx0, by1), (bx1 - bx0) / mpp, (by1 - by0) / mpp);
    fieldEdge(g, map, P, size);
  }

  /** A sharp patch of the wider map round the player (scene x, z) for the corner minimap, redrawn
   *  once they've gone far enough that its edge could show. */
  private localPatch(x: number, z: number) {
    const L = this.local, W = this.map?.wide;
    if (!W || (L && Math.hypot(x - L.cx, -z - L.cy) < LOCAL / 2 - RANGE * 1.5)) return L;
    const canvas = L?.canvas ?? document.createElement("canvas");
    canvas.width = canvas.height = LOCAL_PX;
    const mpp = LOCAL / LOCAL_PX, cx = x, cy = -z, x0 = cx - LOCAL / 2, y1 = cy + LOCAL / 2;
    const chunks: WideChunk[] = [];
    for (let ci = Math.floor((x0 - W.x0) / W.size); ci <= Math.floor((x0 + LOCAL - W.x0) / W.size); ci++)
      for (let cj = Math.floor((y1 - LOCAL - W.y0) / W.size); cj <= Math.floor((y1 - W.y0) / W.size); cj++) {
        const c = W.chunk(ci, cj);
        if (c) chunks.push(c);
      }
    this.paintWide(canvas.getContext("2d")!, this.map!, x0, y1, mpp, LOCAL_PX, chunks);
    return (this.local = { canvas, x0, y1, mpp, cx, cy });
  }

  /** The railways, as a map draws them: a dark line with white dashes down it (the tunnels dotted, the platforms beside the stations). */
  private railway(g: CanvasRenderingContext2D, map: GameMap, P: (x: number, y: number) => [number, number], mpp: number) {
    const R = map.railData;
    if (!R) return;
    g.lineCap = "butt";
    for (const t of R.tracks) {
      // in pieces: on the ground or on a bridge it's drawn whole, in a tunnel dotted
      let run: number[][] = [], inTunnel = false;
      const flush = () => {
        if (run.length > 1) {
          g.setLineDash(inTunnel ? [2 / mpp, 3 / mpp] : []);
          g.strokeStyle = "#3b3b3b"; g.lineWidth = Math.max(1.2, 3 / mpp);
          this.line(g, run, P);
          if (!inTunnel) { g.setLineDash([4 / mpp, 4 / mpp]); g.strokeStyle = "#f2f2f2"; g.lineWidth = Math.max(0.6, 1.4 / mpp); this.line(g, run, P); }
        }
        run = [];
      };
      for (const q of t.p) {
        const tunnel = q[3] === 2;
        if (tunnel !== inTunnel) { run.push(q); flush(); inTunnel = tunnel; }
        run.push(q);
      }
      flush();
    }
    g.setLineDash([]);
    g.fillStyle = "#8d8880";
    for (const pl of R.platforms) {
      g.beginPath();
      pl.r.forEach(([x, y], i) => (i ? g.lineTo(...P(x, y)) : g.moveTo(...P(x, y))));
      g.lineWidth = Math.max(1, 2.5 / mpp); g.strokeStyle = "#8d8880";
      g.stroke();
    }
    g.lineCap = "round";
  }

  private line(g: CanvasRenderingContext2D, pts: number[][], P: (x: number, y: number) => [number, number]) {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(...P(x, y)) : g.moveTo(...P(x, y))));
    g.stroke();
  }

  /** Full-screen map, north up, with street names, the player, the other players and any blips. */
  drawFull(c: HTMLCanvasElement, x: number, z: number, yaw: number, blips: Blip[], mates: Mate[] = []) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const css = Math.min(c.clientWidth, c.clientHeight);
    if (!css) return;
    const S = Math.round(css * dpr);
    if (c.width !== S) { c.width = c.height = S; }
    // the static part (map and street names) is drawn once per size
    const streets = !this.off.has("streets");
    if (!this.full || this.full.size !== S || this.full.streets !== streets) {
      const fc = document.createElement("canvas");
      fc.width = fc.height = S;
      const g = fc.getContext("2d")!;
      const span = this.field * 2.08, scale = S / span;   // screen px per metre
      const cx = (this.fx - this.x0) / this.mpp, cy = (this.y1 - this.fy) / this.mpp;   // the field's centre in base px
      g.fillStyle = "#1c2329"; g.fillRect(0, 0, S, S);
      const wd = this.wide;
      if (wd) g.drawImage(wd.canvas, S / 2 - (this.fx - wd.x0) * scale, S / 2 - (wd.y1 - this.fy) * scale, BASE * wd.mpp * scale, BASE * wd.mpp * scale);
      else g.drawImage(this.base, S / 2 - cx * this.mpp * scale, S / 2 - cy * this.mpp * scale, BASE * this.mpp * scale, BASE * this.mpp * scale);
      g.font = `600 ${Math.max(10, Math.round(S / 95))}px "Barlow Condensed", system-ui, sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.lineJoin = "round";
      for (const l of streets ? this.labels : []) {
        const w = g.measureText(l.name).width;
        if (w > l.len * scale * 1.1) continue;    // longer than the street at this size
        let a = l.angle;
        if (a > Math.PI / 2) a -= Math.PI; else if (a < -Math.PI / 2) a += Math.PI;
        g.save();
        g.translate(S / 2 + (l.x - this.fx) * scale, S / 2 - (l.y - this.fy) * scale);
        g.rotate(a);
        g.strokeStyle = "rgba(20,24,28,0.85)"; g.lineWidth = 3 * dpr;
        g.strokeText(l.name, 0, 0);
        g.fillStyle = "#f4f1ea";
        g.fillText(l.name, 0, 0);
        g.restore();
      }
      this.full = { canvas: fc, size: S, scale, streets };
    }
    this.fullAt = c;
    // zoomed in, it's painted fresh each frame round wherever it's been moved to
    const g = c.getContext("2d")!, scale = this.full.scale * this.zoom, [vx, vy] = this.centre ?? [this.fx, this.fy];
    if (this.zoom === 1 && !this.centre) g.drawImage(this.full.canvas, 0, 0);
    else this.backdrop(g, S, S, vx, vy, 1 / scale, dpr, () => {});
    const P = (sx: number, sz: number) => [S / 2 + (sx - vx) * scale, S / 2 + (sz + vy) * scale];
    const on = (layer?: string) => !layer || !this.off.has(layer);
    for (const b of blips) {
      if (!on(b.layer)) continue;
      const [bx, by] = P(b.x, b.z);
      g.fillStyle = b.colour; g.beginPath(); g.arc(bx, by, 6 * dpr, 0, Math.PI * 2); g.fill();
    }
    if (on("cable") && this.cable.length === 2) drawCable(g, P(...this.cable[0]), P(...this.cable[1]), dpr, 1.6 * dpr);
    if (on("games")) drawSpots(g, this.spots.map((s) => P(s.x, s.z)), dpr);
    if (this.own) drawOwn(g, this.own, P, scale, dpr);
    else if (on("flags")) drawTint(g, this.tint, P, scale);
    drawRoutes(g, this.routes, P, dpr);
    if (on("search")) drawCircles(g, this.circles, P, scale, dpr);
    drawPencil(g, this.pencil, P, dpr);
    this.drawPins(g, P, dpr, Math.max(11, Math.round(S / 85)));
    // the bus stops (zoomed in), and the route you're driving, its next stop named
    if (on("stops") && this.zoom >= 2.5) for (const st of this.stops) { const [sx, sy] = P(st.x, st.z); stopIcon(g, sx, sy, 1.2 * dpr); }
    if (this.bus && on("route")) {
      routeLine(g, this.bus, P, Math.max(2.5 * dpr, Math.min(7 * dpr, 6 * scale)));
      g.font = `700 ${Math.max(11, Math.round(S / 85))}px "Barlow Condensed", system-ui, sans-serif`;
      g.textAlign = "center"; g.textBaseline = "bottom"; g.lineJoin = "round";
      for (const st of this.bus.stops) {
        const [sx, sy] = P(st.x, st.z);
        stopIcon(g, sx, sy, (st.next ? 1.7 : 1.3) * dpr, this.bus.colour, st.next);
        if (!st.next && this.zoom < 4) continue;
        g.strokeStyle = "rgba(20,24,28,0.9)"; g.lineWidth = 3 * dpr; g.strokeText(st.name, sx, sy - 9 * dpr);
        g.fillStyle = st.next ? "#ffdd00" : "#f4f1ea"; g.fillText(st.name, sx, sy - 9 * dpr);
      }
    }
    // today's jobs and the speed traps, each job with what it is written under it (the traps' too, zoomed in)
    g.font = `700 ${Math.max(10, Math.round(S / 90))}px "Barlow Condensed", system-ui, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "top"; g.lineJoin = "round";
    for (const j of this.jobs) {
      if (!on(j.layer)) continue;
      const [jx, jy] = P(j.x, j.z);
      spotBadge(g, jx, jy, 1.9 * dpr, j);
      if (!j.label || (j.trap && this.zoom < 3)) continue;
      g.globalAlpha = j.done ? 0.55 : 1;
      g.strokeStyle = "rgba(20,24,28,0.9)"; g.lineWidth = 3 * dpr; g.strokeText(j.label, jx, jy + 14 * dpr);
      g.fillStyle = j.colour; g.fillText(j.label, jx, jy + 14 * dpr);
      g.globalAlpha = 1;
    }
    // the map markers, with whose they are
    g.font = `700 ${Math.max(11, Math.round(S / 85))}px "Barlow Condensed", system-ui, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "bottom"; g.lineJoin = "round";
    for (const m of on("markers") ? this.markers : []) {
      const [mx, my] = P(m.x, m.z);
      pinIcon(g, mx, my, 1.5 * dpr, m.colour, m.mine);
      const label = m.mine ? "Your marker" : m.name;
      g.strokeStyle = "rgba(20,24,28,0.85)"; g.lineWidth = 3 * dpr;
      g.strokeText(label, mx, my - 28 * dpr);
      g.fillStyle = m.colour; g.fillText(label, mx, my - 28 * dpr);
    }
    // the other players, named
    g.font = `600 ${Math.max(11, Math.round(S / 80))}px "Barlow Condensed", system-ui, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "top"; g.lineJoin = "round";
    for (const m of on("players") ? mates : []) {
      const [mx, my] = P(m.x, m.z);
      this.mate(g, mx, my, -m.yaw, m, 1.2 * dpr, dpr);
      g.strokeStyle = "rgba(20,24,28,0.85)"; g.lineWidth = 3 * dpr;
      g.strokeText(m.name, mx, my + 11 * dpr);
      g.fillStyle = m.colour;
      g.fillText(m.name, mx, my + 11 * dpr);
    }
    if (this.boss && on("bendy")) { const [bx, by] = P(this.boss.x, this.boss.z); bendyIcon(g, bx, by, 2 * dpr, this.boss.after); }
    // you: an arrow pointing the way you face (north is up)
    const [px, py] = P(x, z);
    g.save();
    g.translate(px, py); g.rotate(-yaw);
    g.fillStyle = "#ffdd00"; g.strokeStyle = "rgba(0,0,0,0.7)"; g.lineWidth = 2 * dpr;
    arrow(g, 1.6 * dpr);
    g.fill(); g.stroke();
    g.restore();
    // with the mouse captured, a crosshair you move with the mouse to put your marker down
    if (this.cursor) {
      const cx = this.cursor[0] * S, cy = this.cursor[1] * S, r = 9 * dpr;
      g.lineCap = "butt";
      for (const [w, col] of [[4 * dpr, "rgba(14,16,18,0.85)"], [1.6 * dpr, "#ffdd00"]] as const) {
        g.strokeStyle = col; g.lineWidth = w;
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
        g.moveTo(cx - 2 * r, cy); g.lineTo(cx - r * 0.5, cy); g.moveTo(cx + r * 0.5, cy); g.lineTo(cx + 2 * r, cy);
        g.moveTo(cx, cy - 2 * r); g.lineTo(cx, cy - r * 0.5); g.moveTo(cx, cy + r * 0.5); g.lineTo(cx, cy + 2 * r);
        g.stroke();
      }
    }
    // north marker
    g.fillStyle = "#e8553f";
    g.beginPath(); g.arc(S - 28 * dpr, 28 * dpr, 14 * dpr, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff"; g.font = `700 ${15 * dpr}px "Barlow Condensed", system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("N", S - 28 * dpr, 29 * dpr);
  }

  /** Where on the ground (scene x, z) a point on the full map is, given in page pixels, and how
   *  many metres one page pixel covers there. Undefined until the full map has been drawn. */
  fromFull(clientX: number, clientY: number): { x: number; z: number; mpp: number } | undefined {
    const r = this.fullAt?.getBoundingClientRect();
    if (!r?.width) return;
    return this.fromFullAt((clientX - r.left) / r.width, (clientY - r.top) / r.width);
  }

  /** The same, for a point given as a fraction of the way across (u) and down (v) the full map. */
  fromFullAt(u: number, v: number): { x: number; z: number; mpp: number } | undefined {
    const c = this.fullAt, f = this.full;
    if (!c || !f || !c.clientWidth) return;
    const k = f.size / (f.scale * this.zoom), [vx, vy] = this.centre ?? [this.fx, this.fy];
    return { x: (u - 0.5) * k + vx, z: (v - 0.5) * k - vy, mpp: k / c.clientWidth };
  }

  /** Where scene (x, z) is on the full map, as fractions across and down. */
  toFull(x: number, z: number): [number, number] | undefined {
    const f = this.full;
    if (!f) return;
    const k = f.size / (f.scale * this.zoom), [vx, vy] = this.centre ?? [this.fx, this.fy];
    return [0.5 + (x - vx) / k, 0.5 + (z + vy) / k];
  }

  /** Zoom the full map in (by > 1) or out, keeping the point a fraction (u, v) across and down where it is. */
  zoomFull(by: number, u = 0.5, v = 0.5) {
    const f = this.full, at = this.fromFullAt(u, v);
    if (!f || !at) return;
    this.zoom = Math.min(MAX_ZOOM, Math.max(1, this.zoom * by));
    if (this.zoom === 1) { this.centre = null; return; }
    const k = f.size / (f.scale * this.zoom);
    this.centre = [at.x - (u - 0.5) * k, (v - 0.5) * k - at.z];
    this.panFull(0, 0);
  }

  /** Slide the full map by a fraction of its width (du) and height (dv), as if dragging it. */
  panFull(du: number, dv: number) {
    const f = this.full;
    if (!f || this.zoom === 1) return;
    const k = f.size / (f.scale * this.zoom), [vx, vy] = this.centre ?? [this.fx, this.fy];
    let x = vx - du * k, y = vy + dv * k;
    // no further than the edge of the force field
    const d = Math.hypot(x - this.fx, y - this.fy), r = this.field;
    if (d > r) { x = this.fx + (x - this.fx) * r / d; y = this.fy + (y - this.fy) * r / d; }
    this.centre = [x, y];
  }

  /** Back to the whole map. */
  resetFull() { this.zoom = 1; this.centre = null; }

  /** The map round data point (cx, cy) at mpp metres to the pixel on g, W by H pixels, with the
   *  street names that fit: a sharper picture of round there is painted once it stops moving, and
   *  redraw is called when it's ready. */
  private backdrop(g: CanvasRenderingContext2D, W: number, H: number, cx: number, cy: number, mpp: number, dpr: number, redraw: () => void) {
    const P = (x: number, y: number): [number, number] => [W / 2 + (x - cx) / mpp, H / 2 - (y - cy) / mpp];
    const image = (img: CanvasImageSource, x0: number, y1: number, m: number, size: number) => {
      const [ax, ay] = P(x0, y1);
      g.drawImage(img, ax, ay, size * m / mpp, size * m / mpp);
    };
    g.fillStyle = "#1c2329"; g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = true;
    const wd = this.wide;
    if (wd) image(wd.canvas, wd.x0, wd.y1, wd.mpp, BASE);
    else image(this.base, this.x0, this.y1, this.mpp, BASE);
    // zoomed in on the wider map: a sharper picture of round here, painted once you stop moving it
    if (wd && mpp < wd.mpp * 0.7) {
      const sh = this.sharp, span = Math.max(W, H) * mpp;
      const fits = sh && sh.mpp < mpp * 1.6 && sh.mpp > mpp / 1.6 && cx - span / 2 > sh.x0 && cx + span / 2 < sh.x0 + sh.size * sh.mpp
        && cy + span / 2 < sh.y1 && cy - span / 2 > sh.y1 - sh.size * sh.mpp;
      if (sh && sh.mpp < wd.mpp * 0.7 && sh.mpp < mpp * 4) image(sh.canvas, sh.x0, sh.y1, sh.mpp, sh.size);
      // (the full map asks every frame: only start the wait again when the view has moved)
      const key = `${Math.round(cx)},${Math.round(cy)},${mpp.toFixed(3)}`;
      if (!fits && key !== this.sharpKey) {
        clearTimeout(this.sharpT);
        this.sharpKey = key;
        this.sharpT = window.setTimeout(() => { this.sharpKey = ""; this.paintSharp(cx, cy, mpp, span * 2); redraw(); }, 150);
      }
    }
    // street names that fit along their streets at this size
    g.font = `600 ${Math.round(13 * dpr)}px "Barlow Condensed", system-ui, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
    for (const l of this.off.has("streets") ? [] : this.labels) {
      const [lx, ly] = P(l.x, l.y);
      if (lx < -200 || ly < -200 || lx > W + 200 || ly > H + 200) continue;
      if (g.measureText(l.name).width > (l.len / mpp) * 1.1) continue;
      let a = l.angle;
      if (a > Math.PI / 2) a -= Math.PI; else if (a < -Math.PI / 2) a += Math.PI;
      g.save();
      g.translate(lx, ly); g.rotate(a);
      g.strokeStyle = "rgba(20,24,28,0.85)"; g.lineWidth = 3 * dpr; g.strokeText(l.name, 0, 0);
      g.fillStyle = "#f4f1ea"; g.fillText(l.name, 0, 0);
      g.restore();
    }
  }

  /** The pubs the pub menu is choosing between: a pint glass each, drawn on the full map. */
  pins: Pin[] = [];

  /** A pint glass on each pin, and their names where there's room (the one you're pointing at always). */
  private drawPins(g: CanvasRenderingContext2D, P: (x: number, z: number) => number[], dpr: number, fontPx: number) {
    const pins = this.pins;
    if (!pins.length) return;
    const at = pins.map((p) => P(p.x, p.z));
    const pint = (x: number, y: number, k: number) => {
      g.beginPath();
      g.moveTo(x - 4 * k, y - 6 * k); g.lineTo(x + 4 * k, y - 6 * k); g.lineTo(x + 3 * k, y + 6 * k); g.lineTo(x - 3 * k, y + 6 * k); g.closePath();
      g.fillStyle = "#d9932b"; g.fill();
      g.lineWidth = 1.5 * dpr; g.strokeStyle = "#1c1208"; g.stroke();
      g.fillStyle = "#f6efd8"; g.fillRect(x - 4 * k + 1, y - 6 * k + 1, 8 * k - 2, 3 * k);
    };
    pins.forEach((p, i) => { if (!p.on) pint(at[i][0], at[i][1], 1.1 * dpr); });
    g.font = `700 ${fontPx}px "Barlow Condensed", system-ui, sans-serif`;
    g.textAlign = "left"; g.textBaseline = "alphabetic"; g.lineJoin = "round";
    const hover = pins.findIndex((p) => p.on), taken: number[][] = [];
    const label = (text: string, x: number, y: number, force: boolean) => {
      const w = g.measureText(text).width, h = 16 * dpr, bx = x + 9 * dpr, by = y - h / 2;
      if (!force && taken.some(([tx, ty, tw, th]) => bx < tx + tw && bx + w > tx && by < ty + th && by + h > ty)) return;
      taken.push([bx, by, w + 6 * dpr, h]);
      g.strokeStyle = "rgba(20,24,28,0.9)"; g.lineWidth = 4 * dpr; g.strokeText(text, bx, y);
      g.fillStyle = force ? "#ffdd00" : "#f4f1ea"; g.fillText(text, bx, y);
    };
    // the others claim their room first, so pointing at a pub doesn't make their names come and go
    if (this.zoom >= 3) pins.forEach((p, i) => { if (!p.on) label(p.label, at[i][0], at[i][1], false); });
    if (hover >= 0) { pint(at[hover][0], at[hover][1], 1.7 * dpr); label(pins[hover].label, at[hover][0] + 4 * dpr, at[hover][1], true); }
  }

  /** Paint the wider map span metres across round (cx, cy) at about mpp metres to the pixel. */
  private paintSharp(cx: number, cy: number, mpp: number, span: number) {
    const W = this.map?.wide;
    if (!W) return;
    const size = Math.min(2048, Math.ceil(span / mpp)), m = span / size, x0 = cx - span / 2, y1 = cy + span / 2;
    const chunks: WideChunk[] = [];
    for (let ci = Math.floor((x0 - W.x0) / W.size); ci <= Math.floor((x0 + span - W.x0) / W.size); ci++)
      for (let cj = Math.floor((y1 - span - W.y0) / W.size); cj <= Math.floor((y1 - W.y0) / W.size); cj++) {
        const c = W.chunk(ci, cj);
        if (c) chunks.push(c);
      }
    const canvas = this.sharp?.canvas ?? document.createElement("canvas");
    canvas.width = canvas.height = size;
    this.paintWide(canvas.getContext("2d")!, this.map!, x0, y1, m, size, chunks);
    this.sharp = { canvas, x0, y1, mpp: m, size };
  }

  /** One other player at (px, py) on the canvas, turned by angle: their arrow, ringed red if they're firing. */
  private mate(g: CanvasRenderingContext2D, px: number, py: number, angle: number, m: Mate, k: number, dpr: number) {
    g.save();
    g.translate(px, py);
    if (m.firing) {
      g.strokeStyle = "#ff4a3a"; g.lineWidth = 2 * dpr;
      g.beginPath(); g.arc(0, 0, 11 * k, 0, Math.PI * 2); g.stroke();
    }
    g.rotate(angle);
    g.fillStyle = m.colour; g.strokeStyle = "rgba(0,0,0,0.75)"; g.lineWidth = 1.5 * dpr;
    arrow(g, k);
    g.fill(); g.stroke();
    g.restore();
  }

  /** Draw the minimap around the player at scene (x, z) facing yaw, with the other players at the
   *  rim, pointing their way, when they're out of range. */
  draw(x: number, z: number, yaw: number, blips: Blip[], mates: Mate[] = []) {
    const c = this.canvas, dpr = Math.min(2, devicePixelRatio || 1);
    const css = c.clientWidth;
    if (!css) return;
    if (this.size !== Math.round(css * dpr)) { this.size = Math.round(css * dpr); c.width = c.height = this.size; }
    const S = this.size, R = S / 2, g = this.ctx;
    const scale = R / RANGE;                       // screen px per metre
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.clip();
    g.fillStyle = "#1c2329"; g.fillRect(0, 0, S, S);
    g.translate(R, R);
    g.rotate(yaw);                                 // heading up
    const bx = (x - this.x0) / this.mpp, by = (this.y1 + z) / this.mpp;   // scene z = -north
    const k = scale * this.mpp;
    g.imageSmoothingEnabled = true;
    const lp = this.localPatch(x, z);
    if (lp) g.drawImage(lp.canvas, -(x - lp.x0) * scale, -(lp.y1 + z) * scale, LOCAL_PX * lp.mpp * scale, LOCAL_PX * lp.mpp * scale);
    else g.drawImage(this.base, -bx * k, -by * k, BASE * k, BASE * k);
    const on = (layer?: string) => !layer || !this.off.has(layer);
    // the bus route you're driving, under everything else; then the bus stops, upright
    const bus = on("route") ? this.bus : null;
    if (bus) routeLine(g, bus, (px, pz) => [(px - x) * scale, (pz - z) * scale], 3.2 * dpr);
    const stop = (sx: number, sz: number, route: string, next: boolean, pin: boolean) => {
      let dx = (sx - x) * scale, dz = (sz - z) * scale;
      const d = Math.hypot(dx, dz), edge = R - 10 * dpr;
      if (d > edge) { if (!pin) return; dx *= edge / d; dz *= edge / d; }
      g.save(); g.translate(dx, dz); g.rotate(-yaw);
      stopIcon(g, 0, 0, (next ? 1.25 : 1) * dpr, route, next);
      g.restore();
    };
    if (on("stops")) for (const st of this.stops) if (!bus?.stops.some((b) => Math.hypot(b.x - st.x, b.z - st.z) < 4)) stop(st.x, st.z, "", false, false);
    for (const st of bus?.stops ?? []) if (!st.next) stop(st.x, st.z, bus!.colour, false, false);
    for (const st of bus?.stops ?? []) if (st.next) stop(st.x, st.z, bus!.colour, true, true);
    for (const b of blips) {
      if (!on(b.layer)) continue;
      g.fillStyle = b.colour;
      g.beginPath(); g.arc((b.x - x) * scale, (b.z - z) * scale, 4.5 * dpr, 0, Math.PI * 2); g.fill();
    }
    // the other players: on the map if they're in range, otherwise pinned to the rim in their direction
    for (const m of on("players") ? mates : []) {
      let dx = (m.x - x) * scale, dz = (m.z - z) * scale;
      const d = Math.hypot(dx, dz), edge = R - 14 * dpr;
      if (d > edge) { dx *= edge / d; dz *= edge / d; }
      this.mate(g, dx, dz, -m.yaw, m, 0.85 * dpr, dpr);
    }
    // the cable car: its line, and a badge, upright, at each station on the map
    if (on("cable") && this.cable.length === 2) {
      const [a, b] = this.cable.map(([cx, cz]) => [(cx - x) * scale, (cz - z) * scale]);
      g.save();
      g.strokeStyle = CABLE; g.lineWidth = 2.5 * dpr;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      g.strokeStyle = "#ffffff"; g.setLineDash([4 * dpr, 4 * dpr]);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      g.restore();
      for (const [dx, dz] of [a, b]) {
        if (Math.hypot(dx, dz) > R) continue;
        g.save(); g.translate(dx, dz); g.rotate(-yaw);
        cableIcon(g, 0, 0, 1.45 * dpr);
        g.restore();
      }
    }
    drawRoutes(g, this.routes, (cx, cz) => [(cx - x) * scale, (cz - z) * scale], dpr);
    if (on("search")) drawCircles(g, this.circles, (cx, cz) => [(cx - x) * scale, (cz - z) * scale], scale, dpr);
    // today's jobs and the speed traps: on the map, or within a walk on the rim pointing the way
    for (const j of this.jobs) {
      if (!on(j.layer)) continue;
      let dx = (j.x - x) * scale, dz = (j.z - z) * scale;
      const d = Math.hypot(dx, dz), edge = R - 13 * dpr;
      if (d > edge) {
        if (d / scale > SPOT_RANGE || j.done) continue;
        dx *= edge / d; dz *= edge / d;
      }
      g.save(); g.translate(dx, dz); g.rotate(-yaw);
      spotBadge(g, 0, 0, 1.25 * dpr, j);
      g.restore();
    }
    // the map markers: on the map in range, otherwise pinned to the rim in their direction
    for (const m of on("markers") ? this.markers : []) {
      let dx = (m.x - x) * scale, dz = (m.z - z) * scale;
      const d = Math.hypot(dx, dz), edge = R - 16 * dpr;
      if (d > edge) { dx *= edge / d; dz *= edge / d; }
      g.save(); g.translate(dx, dz); g.rotate(-yaw);
      pinIcon(g, 0, 0, 0.95 * dpr, m.colour, m.mine);
      g.restore();
    }
    // the minigames: their marker, upright, on the map or (within a walk) on the rim pointing the way
    for (const s of on("games") ? this.spots : []) {
      let dx = (s.x - x) * scale, dz = (s.z - z) * scale;
      const d = Math.hypot(dx, dz), edge = R - 13 * dpr;
      if (d > edge) {
        if (d / scale > SPOT_RANGE) continue;
        dx *= edge / d; dz *= edge / d;
      }
      g.save(); g.translate(dx, dz); g.rotate(-yaw);
      spotIcon(g, 0, 0, 1.45 * dpr);
      g.restore();
    }
    // Bendy: on the map, or on the rim pointing his way
    if (this.boss && on("bendy")) {
      let dx = (this.boss.x - x) * scale, dz = (this.boss.z - z) * scale;
      const d = Math.hypot(dx, dz), edge = R - 14 * dpr;
      if (d > edge) { dx *= edge / d; dz *= edge / d; }
      g.save(); g.translate(dx, dz); g.rotate(-yaw);
      bendyIcon(g, 0, 0, 1.3 * dpr, this.boss.after);
      g.restore();
    }
    g.restore();
    // you: an arrow pointing up
    g.fillStyle = "#ffdd00"; g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 1.5 * dpr;
    g.beginPath();
    g.moveTo(R, R - 8 * dpr); g.lineTo(R + 6 * dpr, R + 6 * dpr); g.lineTo(R, R + 2.5 * dpr); g.lineTo(R - 6 * dpr, R + 6 * dpr);
    g.closePath(); g.fill(); g.stroke();
    // rim
    g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 2 * dpr;
    g.beginPath(); g.arc(R, R, R - 1.5 * dpr, 0, Math.PI * 2); g.stroke();
    // north marker on the rim
    const nr = R - 11 * dpr, nx = R + Math.sin(yaw) * nr, ny = R - Math.cos(yaw) * nr;
    g.fillStyle = "#e8553f";
    g.beginPath(); g.arc(nx, ny, 9 * dpr, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#ffffff";
    g.font = `700 ${11 * dpr}px "Barlow Condensed", system-ui, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("N", nx, ny + 0.5 * dpr);
  }
}
