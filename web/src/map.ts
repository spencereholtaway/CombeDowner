// Map data (built by tools/prep_map.py) plus the queries the game needs: ground height,
// collision against buildings, walls and trees, and bullet raycasts. Outside the detailed map,
// the wider map round it (wide.ts), where there is one, answers the same questions.
//
// Data coordinates are metres east (x) and north (y) of the map centre, with absolute elevations.
// Scene coordinates: X = east, Y = up (metres above the map's lowest point, z0), Z = -north.

import { unpackSurfaces } from "./sfpack";
import type { Object3D } from "three";
import { loadWide, type Wide } from "./wide";
import { loadGroundKinds, type GroundKinds } from "./groundkinds";
import { tunnelHills, aqueductBeds, type CanalData } from "./canal";
import type { RailData } from "./railway";
import { CableLine, type CableData } from "./cableway";
import { twertonSolids } from "./landmarks/twerton";
import { landmarkShape } from "./landmarks";
import { type Shape, standOn } from "./landmarks/shape";
import { maskSetPieces, aqueductSetPieceAt } from "./landmarks/setpieces";
import { CanalWorks } from "./works";
import { alignPortals, portalFaces } from "./tunnels";

export interface Terrain { nx: number; ny: number; x0: number; y0: number; dx: number; dy: number; z0: number; h: number[]; k: string }
export interface Building {
  r: number[][][]; h: number; g: number; c: string; n: string; dz: number;
  m?: string; rc?: string; w?: number;            // wall material, roof covering, has windows
  rr?: number[][]; rp?: number; hp?: number[];    // roof rectangle, ridge rise, hip insets at each end
  ch?: number[][];                                // chimney stacks
  pp?: number;                                    // parapet height above the eaves
  st?: number;                                    // storeys, when they're taller than usual
  rm?: RoofMesh;                                  // the roof as the lidar shows it, in place of rr, rp and hp
}
/** ?roofs=simple: every roof the shape it was before the lidar's faces (flat, gabled or hipped), to
 *  compare, or for a machine that can't spare the triangles. */
const SIMPLE_ROOFS = new URLSearchParams(location.search).get("roofs") === "simple";
/** A roof as the lidar shows it, in faces (tools/roofs/faces.py): v the points (x, y, height above
 *  sea level, three numbers each), t its triangles (three point numbers each, anticlockwise from
 *  above), w the walls standing in its steps (x0, y0, foot, top, x1, y1, foot, top each; the game
 *  draws its own from the faces, roofSeams, as older maps have few), and z, for
 *  each of the building's outlines in turn, the roof's height at the start and end of each wall
 *  (b.r has a point wherever a face meets the walls), which the walls rise to. */
export interface RoofMesh { v: number[]; t: number[]; w?: number[]; z: number[][] }
/** A street or path: its class, name and points [x, y, z], or [x, y, z, 1] on a bridge's span,
 *  or [x, y, z, 2] on the deck of a bridge beside it (a bridge's pavement, mapped as a path of its
 *  own: it rides at the road's height and builds nothing) (tools/prep_map.py). bridge: it stands
 *  clear of the ground somewhere (over the river, the canal or the railway), and is walked and
 *  drawn at its own height there, with a deck, parapets and abutments built under and beside it
 *  (world.ts). */
export interface Road { c: string; n: string; p: number[][]; bridge?: boolean; marked?: boolean; ow?: number; w?: number; pv?: number[]; dk?: number | number[]; held?: boolean; piece?: boolean; bt?: string; uo?: number[][]; ms?: number }   // ms: its speed limit in mph (tools/maxspeed.py); bt: what kind of bridge it is (arch, beam, truss, foot or suspension: world.ts); uo: the stretches of it, in metres from its first point, over a road, path or railway passing under, where no pier stands; dk: how far its bridge's deck reaches each side, where the map says (the street's own faces and any path riding beside it), or [left, right] where the sides differ; held: its bridge is a set piece's (landmarks/setpieces.ts), which builds what holds it up and its sides; piece: a set piece's own street (SetPiece.street), drawn as it lays it rather than as the square's faces; ow: one way, 1 with its points, -1 against them; w: its own width (a pedestrianised street, paved wall to wall, or one the lidar shows is narrower); pv: its pavements' widths [left, right] looking along its points, where OpenStreetMap or the lidar narrowed them (else PAVE)
/** What a street or path's ways say beyond its class (tools/osm.py's osm-detail): su, a path's surface (g grass, d dirt, v gravel; paved if left out);
 *  sv, a service road's kind (d a drive, l an alley, a a car park's aisle, p private); and for steps sc, how many treads, hr, its handrails
 *  (1 on the left looking along its points, 2 on the right, 4 down the middle), up, 1 where its points run uphill and -1 downhill. */
export interface Road { su?: string; sv?: string; sc?: number; hr?: number; up?: number }
export interface Pond { r: number[][][]; z: number; c?: string }   // c: "canal" for a piece of the canal (drawn by canal.ts at its own levels)
export interface Line { c: string; p: number[][]; h?: number }   // h: a wall's height as the lidar measured it
export interface Place { n: string; r: number[][] }
/** The bored part of a road or path through a hill (tools/tunnels.py): its floor, portal to portal, as [x, y, z];
 *  hw: half the bore's width at each point, as wide as its way going in; pv: the pavement each side at each point, where it has one. */
export interface Tunnel { c: string; n: string; p: number[][]; hw?: number[]; pv?: number[] }
/** A football pitch ["f", x, y, length, width, angle], a rugby pitch ["r", x, y, length, width, angle],
 *  or a cricket field ["c", x, y, angle, boundary rope ring, sightscreens [[x, y], ...]]. The angle
 *  is the long axis (the wicket, for cricket). */
export type Pitch = ["f", number, number, number, number, number] | ["r", number, number, number, number, number] | ["c", number, number, number, number[][], number[][]];
export type Oblong = Extract<Pitch, ["f" | "r", ...unknown[]]>;
export interface MapData {
  id?: string; name?: string; vn?: string; release: string; centre: [number, number]; field: number; b: [number, number, number, number];
  fc?: [number, number];                          // the force field's centre, if it isn't the map centre
  v?: [number, number];                           // what the menu backdrop circles around
  t: Terrain; bl: Building[]; rd: Road[]; wp: Pond[]; wl: Line[]; br: Line[]; tr: number[][];
  bk?: number;                  // 1: built under the scenery rules in docs/new-area.md (every map now is)
  z0?: number;                  // base height, for a map with no ground of its own (all of it in squares: see below)
  gt?: (number | string)[][];   // garden gates: x0, y0, x1, y1, ground, boundary style
  fx?: (number | string)[][];   // street items: kind, x, y, ground, angle, ...
  mk?: number[][];              // road markings: x0, y0, x1, y1, z0, z1, kind
  sh?: (number | string)[][];   // shop signs: x, y, ground, angle, width, name, style, and 1 if a set piece hangs its own (landmarks/setpieces.ts)
  lm?: (number | string)[][];   // landmarks: kind, x, y, ground, angle, ...
  dr?: number[][];              // front doors: x, y, ground, angle, colour, window bays on its wall
  sb?: number[][];              // shrubs: x, y, ground, height
  fp?: number[][];              // front paths, gate to door: x0, y0, x1, y1
  dv?: number[][];              // driveways, gap to house: x0, y0, x1, y1
  // the streets' surfaces as faces meeting edge to edge (tools/partition/write_tile.py street_surfaces):
  // points v (x, y, z in turn), triangles as point numbers, and each piece's outline for its kerbs
  sf?: { v: ArrayLike<number>; road: ArrayLike<number>; service: ArrayLike<number>; pave: ArrayLike<number>; path?: ArrayLike<number>; front?: ArrayLike<number>; drive?: ArrayLike<number>; grass?: ArrayLike<number>; dirt?: ArrayLike<number>; gravel?: ArrayLike<number>; e: { c: string; i: ArrayLike<number> }[]; l?: number };   // grass, dirt, gravel: paths the map says are made of that
  by?: (number | string)[][];   // bay windows: x, y, ground, angle, storeys, wall material, width
  wr?: number[][];              // overhead wires: x0, y0, z0, x1, y1, z1 (absolute heights)
  cn?: { x0: number; y0: number; step: number; nx: number; ny: number; h: string };   // canopy heights over woods
  pi?: Pitch[];                 // sports pitches: football and rugby pitches and cricket fields
  spawn?: number[][];           // where players appear (Firs Field)
  pl?: Place[];                                   // named areas, smallest first
  tn?: Tunnel[];                                  // tunnels you can walk through
  tile?: [number, number];                        // which full-detail square this is (tiles.ts), for one of those
  sp?: number[][][];                              // where set pieces stand solid (landmarks/setpieces.ts): rings, counted as indoors
  // crossings and traffic lights: x, y, ground, the street's direction, kind (z a zebra, p a crossing with lights, s lights at a
  // junction), the carriageway's width (furniture.ts draws them; the driving examiner can ask whether you stopped)
  cx?: (number | string)[][];
  // what stands across a path or road: kind (gate, stile, kiss, cycle, lift, grid, block), x, y, ground, angle, width
  pb?: (number | string)[][];
}

/** What each kind of wall, fence, hedge and railing is made of, how thick it is and its colour: world.ts
 *  draws them so, and the walls you hit are that thick. */
export type BarMat = "stone" | "brick" | "leaf" | "wood" | "iron" | "steel";
export const BARRIER_LOOK: Record<string, { mat: BarMat; t: number; col: number[] }> = {
  wall: { mat: "stone", t: 0.45, col: [0.86, 0.78, 0.6] }, retaining_wall: { mat: "stone", t: 0.5, col: [0.8, 0.73, 0.57] },
  stone_wall: { mat: "stone", t: 0.45, col: [0.84, 0.76, 0.58] }, garden_wall: { mat: "stone", t: 0.35, col: [0.9, 0.82, 0.64] },
  brick_wall: { mat: "brick", t: 0.3, col: [0.7, 0.42, 0.32] }, brick_wall_low: { mat: "brick", t: 0.3, col: [0.72, 0.45, 0.34] },
  fence: { mat: "wood", t: 0.08, col: [0.55, 0.42, 0.3] },
  hedge: { mat: "leaf", t: 0.9, col: [0.42, 0.58, 0.3] }, hedge_low: { mat: "leaf", t: 0.7, col: [0.46, 0.62, 0.32] },
  railing: { mat: "iron", t: 0.05, col: [0.16, 0.17, 0.18] },
  dry_stone: { mat: "stone", t: 0.6, col: [0.7, 0.68, 0.6] }, wire_fence: { mat: "iron", t: 0.05, col: [0.42, 0.44, 0.42] },
  guard_rail: { mat: "steel", t: 0.1, col: [0.7, 0.72, 0.74] },
};
export const barrierLook = (c: string) => BARRIER_LOOK[c] ?? BARRIER_LOOK.wall;

/** A garden gate as it stands (scene heights, the map's base z0): stone or brick pillars either side,
 *  each [x, y] square 0.4 m across and turned with the gateway, and the gate itself hinged at the first
 *  pillar and standing just ajar. Drawn by world.ts and solid in GameMap from this one shape. Null for
 *  an "open" gateway, which is only where the path starts. */
export function gateShape(gt: (number | string)[], z0: number) {
  const [x0, y0, x1, y1, z, style] = gt as [number, number, number, number, number, string];
  if (style === "open") return null;
  const look = BARRIER_LOOK[style] ?? BARRIER_LOOK.garden_wall, hh = BARRIER_HEIGHT[style] ?? 1;
  const ux = x1 - x0, uy = y1 - y0, w = Math.hypot(ux, uy) || 1, u = [ux / w, uy / w];
  const ground = z - z0;
  const pillars = look.mat === "stone" || look.mat === "brick" ? [[x0, y0], [x1, y1]] : [];
  const ang = Math.atan2(u[1], u[0]) - 0.25;
  const gu = [Math.cos(ang), Math.sin(ang)], gl = Math.min(1.0, w - 0.1);
  return {
    look, u, pillars, pillarHalf: 0.2, pillarFoot: ground - 0.3, pillarTop: ground + hh + 0.22,
    leaf: { x0, y0, x1: x0 + gu[0] * gl, y1: y0 + gu[1] * gl, gu, half: 0.025, foot: ground + 0.08, top: ground + Math.min(1.0, hh + 0.05) },
  };
}

/** How tall a wall, fence, hedge or railing stands: its measured height, else its kind's. */
export function barrierHeight(l: Line): number { return l.h ?? BARRIER_HEIGHT[l.c] ?? 1.5; }
/** The top of barrier l at its point i (scene Y, the map's base height z0): it runs straight from
 *  one point's top to the next's. world.ts draws it so and the walls you hit are built from it. */
export function barrierTop(l: Line, i: number, z0: number): number { return l.p[i][2] - z0 + barrierHeight(l); }
export const BARRIER_HEIGHT: Record<string, number> = {
  // A jump clears about 1.6 m, and anything up to 2.6 m can be climbed (player.ts). Walls the
  // lidar found carry their own measured height; mapped ones carry none, and around here they
  // are mostly low field and boundary walls of about 3 ft.
  wall: 0.9, retaining_wall: 0.9, fence: 1.2, hedge: 1.3,
  garden_wall: 0.9, brick_wall_low: 0.75, hedge_low: 1.0, railing: 1.0, // front gardens
  stone_wall: 1.1, brick_wall: 1.2,                                    // between gardens
  dry_stone: 1.2, wire_fence: 1.2, guard_rail: 0.75,                   // as OpenStreetMap names them
};
/** The full-detail squares round a map (built by tools/prep_tiles.py into public/maps/<id>/):
 *  each is cells x cells of the terrain grid that starts at (x0, y0), dx apart. */
export interface TileIndex { x0: number; y0: number; dx: number; cells: number; z0: number; tiles: [number, number][] }
export const tileKey = (ti: number, tj: number) => (ti + 512) * 1024 + (tj + 512);
/** A parked car out in a square of Bath is vehicle TILE_CAR + its square's tileKey * 65536 + its
 *  number there, so everyone means the same car whatever they have loaded (vehicles.ts). */
export const TILE_CAR = 2 ** 40;
/** A pitch's number in the game (sport.ts, sent over the network): its place in Combe Down's own
 *  list, or, out in a square of Bath, PITCH_TILE + the square's tileKey * 256 + its place there. */
export const PITCH_TILE = 2 ** 30;
export function pitchId(m: GameMap, i: number): number {
  return m.d.tile ? PITCH_TILE + tileKey(m.d.tile[0], m.d.tile[1]) * 256 + i : i;
}

export const PATHS = new Set(["footway", "steps", "cycleway", "path", "pedestrian", "bridleway", "track"]);
/** Streets whose parked cars you can drive (vehicles.ts): they come off the street furniture. */
export const DRIVABLE_STREETS = new Set(["The Firs", "Fox Hill"]);

/**
 * Something solid that moves about: a vehicle (vehicles.ts). A box on the ground at scene (x, z),
 * turned to angle a (its length runs along (cos a, -sin a)), hl long and hw wide each way from the
 * middle. y is the ground under it and top its roof; rounds go over waist, through the windows,
 * but stop on the bonnet and the boot. root is what's drawn of it, if it has its own (paint sticks to it).
 */
export interface Mover { x: number; z: number; a: number; hl: number; hw: number; y: number; top: number; waist: number; readonly root?: Object3D }
/** The top of a wall to grind along (scene coords), a to b the way you're going, and how far off it you were. */
export interface GrindEdge { ax: number; az: number; bx: number; bz: number; top: number; d: number }

/** Rugby goalposts: how tall the uprights are, and how far apart. */
export const POST_HEIGHT = 11, POST_GAP = 5.6;
/** Cricket sightscreens: width and height. */
export const SCREEN = [7, 3.8];
/** Ends of the field of play and in-goal depth of a rugby pitch drawn inside its mapped rectangle. */
export function rugbyLayout(p: Oblong) {
  const L = p[3] - 2, W = p[4] - 2;                          // lines a metre in from the mapped edge
  const goal = Math.min(10, Math.max(4, L * 0.08));          // in-goal depth
  return { L, W, goal, F: L / 2 - goal };                    // F: centre to try line
}
/** Where a rugby pitch's four uprights stand (data coords). */
export function rugbyUprights(p: Oblong): number[][] {
  const { F } = rugbyLayout(p), ux = Math.cos(p[5]), uy = Math.sin(p[5]);
  const out: number[][] = [];
  for (const s of [-F, F]) for (const t of [-POST_GAP / 2, POST_GAP / 2]) out.push([p[1] + ux * s - uy * t, p[2] + uy * s + ux * t]);
  return out;
}
/** A football pitch drawn a metre inside its mapped rectangle: its length and width, the goal (a
 *  full-size one, or a junior one on a pitch under 85 m), and the penalty area, the goal area
 *  (length out from the goal line, width), the penalty spot and the centre circle's radius, all
 *  scaled down on a smaller pitch. */
export function footballLayout(p: Oblong) {
  const L = p[3] - 2, W = p[4] - 2, sc = Math.min(1, Math.max(0.5, L / 100));
  const goal = L >= 85 ? { w: 7.32, h: 2.44 } : { w: 4.88, h: 1.83 };
  return { L, W, goal, box: [16.5 * sc, Math.min(40.32 * sc, W - 6)], six: [5.5 * sc, Math.min(18.32 * sc, W - 12)], spot: 11 * sc, circle: 9.15 * sc };
}
/** Where a football pitch's four goalposts stand (data coords). */
export function footballPosts(p: Oblong): number[][] {
  const { L, goal } = footballLayout(p), ux = Math.cos(p[5]), uy = Math.sin(p[5]);
  const out: number[][] = [];
  for (const s of [-L / 2, L / 2]) for (const t of [-goal.w / 2, goal.w / 2]) out.push([p[1] + ux * s - uy * t, p[2] + uy * s + ux * t]);
  return out;
}

const CELL = 8;
/** The deepest a bridge's deck is drawn, top to underside (world.ts KINDS). */
const DECK_DEPTH = 1.1;
/** Feet so far down that blocked() finds every trunk and post, wherever it stands. */
const ANY_HEIGHT = -1e9;
/** How much of a tree's collision trunk is drawn trunk: rays (shots) go by the drawn one, a little thinner than you bump into. */
const TRUNK_DRAWN = 0.8;

/** A tunnel's cross-section (tools/tunnels.py): half the floor's width where its map doesn't say
 *  (boreHalf), floor to the top of the bore (boreCrown) under a road, a railway and a path, and how
 *  far each portal's face reaches past the bore's side (to the cutting's sides). */
export const TUNNEL = { half: 2.4, crown: 5.2, rail: 6.0, path: 3.6, past: 4.0 };
/** Half a bore's width at its point i. */
export const boreHalf = (t: Tunnel, i: number) => t.hw?.[i] ?? TUNNEL.half;
const MOTOR = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "service"]);
const RAIL = new Set(["rail", "railway", "standard_gauge", "narrow_gauge", "light_rail", "subway", "tram"]);
/** A tunnel cars drive through: cut in concrete in our time, where a railway's, a canal's or a
 *  path's (often an old railway's) is Victorian stone. */
export const carriesTraffic = (t: Tunnel) => MOTOR.has(t.c.replace(/_link$/, ""));
/** Floor to the top of a bore: a lorry's headroom under a road, a train's under a railway, and a
 *  walker's or a cyclist's under a path, so a footway isn't a tall narrow slot. */
export const boreCrown = (t: Tunnel) => (carriesTraffic(t) ? TUNNEL.crown : RAIL.has(t.c) ? TUNNEL.rail : TUNNEL.path);

/** mover: the vehicle it hit, if it was one. */
export interface RayHit { dist: number; kind: "ground" | "building" | "barrier" | "tree"; nx: number; ny: number; nz: number; mover?: Mover }

/** Sir Bevil Grenville's monument on Lansdown, where he fell at the battle of Lansdown in 1643
 *  (data metres, from Historic England's grid reference). Day Bendy gives his history lessons
 *  there (daybendy.ts), and a school minibus is parked up on the lane by it (vehicles.ts). */
export const GRENVILLE = { x: -3911, y: 7634 };

/** Where the force field reaches out past its circle, by map: a strip running straight out from
 *  the circle to (x, y) (data metres), w either side of its middle and rounded at its end. On
 *  Bath's map it runs up Bath Road over Lansdown to Grenville's monument, for anyone who tries to
 *  get out of Bath to the north that way. A strip whose end is far outside the circle (a smaller
 *  map with the same id, like the single-file build's) is left out. */
const FIELD_LANES: Record<string, { x: number; y: number; w: number }[]> = {
  "combe-down": [{ x: -3955, y: 7630, w: 210 }],
};

/** A strip of the force field, in scene x and z: from a (inside the circle) to b, w either side. */
interface Lane { ax: number; az: number; bx: number; bz: number; w: number }

/** How far scene (x, z) is from the middle line of a strip, and the nearest point on it. */
function laneNearest(l: Lane, x: number, z: number): [number, number, number] {
  const dx = l.bx - l.ax, dz = l.bz - l.az;
  const t = Math.max(0, Math.min(1, ((x - l.ax) * dx + (z - l.az) * dz) / (dx * dx + dz * dz)));
  const qx = l.ax + dx * t, qz = l.az + dz * t;
  return [Math.hypot(x - qx, z - qz), qx, qz];
}

export class GameMap {
  readonly d: MapData;
  readonly z0: number;
  /** Radius of the force field's circle: the play area, with its strips (lanes) reaching out past it. */
  readonly field: number;
  /** The force field's centre, scene x and z. */
  readonly fieldX: number; readonly fieldZ: number;
  /** Where the force field reaches out past its circle (FIELD_LANES), in scene x and z. */
  readonly lanes: Lane[] = [];
  /** The wider, simpler map round this one (the rest of Bath), if it has one. */
  readonly wide: Wide | null;
  /** How the full-detail squares round this map are laid out (tiles.ts), if it has them. */
  tileIndex: TileIndex | null = null;
  /** Where the squares are fetched from: <tileBase><ti>_<tj>.json. */
  tileBase = "";
  /** The minimap's ground for every square at full detail (groundkinds.ts), when the map has squares. */
  groundKinds: GroundKinds | null = null;
  /** The full-detail squares loaded round the player (and, for the host, round everyone), by tileKey. */
  readonly tiles = new Map<number, GameMap>();
  /** Goes up each time a square is loaded or dropped, so anything worked out from them knows to look again. */
  tilesVersion = 0;
  /** Parked cars out in the squares that someone has got in (TILE_CAR numbers): they stay gone when their square loads again. */
  readonly takenTileCars = new Set<number>();
  // the detailed terrain grid's far edges (data coords)
  private tx1: number; private ty1: number;
  // bridge decks: each road's points in scene coords [x, z, y] and half its width, by square
  private decks: { p: number[][]; half: number; left: number; right: number }[] = [];
  private deckCells = new Map<number, number[]>();
  // tunnel floors, scene coords: (ax, az, ay) -> (bx, bz, by)
  private tA: number[][] = []; private tB: number[][] = [];
  private tunnelCells = new Map<number, number[]>();
  private hgt: Float32Array;
  // collision segments, scene coords: (ax, az) -> (bx, bz), with the top of the obstacle
  private sAx: number[] = []; private sAz: number[] = []; private sBx: number[] = []; private sBz: number[] = [];
  private sTop: number[] = []; private sKind: number[] = [];
  private sHalf: number[] = [];   // how far its faces stand either side of its line: a wall is as thick as it's drawn
  private sTopB: number[] = [];   // the top at its far end: a wall up a hill rises along its length, as it's drawn
  private sRoof: number[] = [];   // a building's wall: its eaves, at or above which you're on its roof and walk over it
  private sFoot: number[] = [];   // a wall's foot: you walk under one whose foot is over your head (a set piece's terrace, a lintel)
  // flat-topped solid blocks you can stand on (a stadium's terraces and seats), scene coords
  private blocks: { x: number; z: number; a: number; hl: number; hw: number; top: number }[] = [];
  private blockCells = new Map<number, number[]>();
  // set pieces' solid shapes, taken from their models (landmarks/shape.ts): where each stands
  // (data x, y), which way it's turned (cos, sin), its height in the scene, and the squares it covers
  private pieces: { sh: Shape; x: number; y: number; c: number; s: number; y0: number }[] = [];
  private pieceCells = new Map<number, number[]>();
  private bCells = new Map<number, number[]>();
  // tree trunks
  private cX: number[] = []; private cZ: number[] = []; private cR: number[] = []; private cTop: number[] = []; private cFoot: number[] = [];
  private segCells = new Map<number, number[]>();
  private treeCells = new Map<number, number[]>();
  private stamp: Uint32Array = new Uint32Array(0);
  private treeStamp: Uint32Array = new Uint32Array(0);
  private tick = 1;
  /** Vehicles, which block like walls wherever they are now. */
  readonly movers: Mover[] = [];
  /** Parked cars on DRIVABLE_STREETS, for vehicles.ts to swap for ones you can drive (data coords), and which street. */
  readonly parked: { x: number; y: number; a: number; street: string }[] = [];
  /** Every other parked car: street furniture (f, its entry in fx) until someone gets in it, and where its walls start. */
  readonly spare: { f: (string | number)[]; seg: number; taken?: boolean }[] = [];
  private spareCells = new Map<number, number[]>();
  /** The canal and the railways round the map, from <map>-canal.json and <map>-rail.json, if it has them. */
  canalData: CanalData | null = null;
  railData: RailData | null = null;
  /** The cable car's line, where the map has one (cableway.ts). */
  readonly cable: CableLine | null = null;
  /** The canal, once built (world.ts): the map's own water that's part of it is left out. Tiles share the main map's. */
  canal: { pondLevel(w: Pond): number | null | undefined } | null = null;
  /** The canal's own banks where it crosses this map's grid (works.ts): the ground is theirs inside them. */
  works: CanalWorks | null = null;
  /** More to stand on, from the canal and the railways (scene Y at scene x, z, or null): counted when
   *  it's no more than a step above the feet, like a bridge deck. */
  floors: ((x: number, z: number, y: number) => number | null)[] = [];
  /** More to bump into, from the railways (the sides of the platforms): each pushes a circle at feet
   *  height y out of itself and says how high above the feet it was (-Infinity if it didn't). */
  pushers: ((pos: { x: number; z: number }, y: number, r: number) => number)[] = [];
  /** More for rounds to hit, from the strange structures (oddments.ts): each gives the first hit
   *  along a ray within maxDist, or null. */
  rays: ((ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number) => RayHit | null)[] = [];
  /** Ground kept clear round what stands there only while the game runs (the strange structures),
   *  scene x, z and radius: blocked() counts it, so nothing put down by the game lands on it. */
  readonly keepClear: { x: number; z: number; r: number }[] = [];
  /** Hide a parked car's furniture once it's become a vehicle (furniture.ts sets this). */
  onTakeCar: (f: (string | number)[]) => void = () => {};

  /** For a full-detail square of Bath (tiles.ts): the rest of its setup, a slice at a time, still to do
   *  before it can be walked on and shot at. */
  setup: Generator<void> | null = null;

  /** A square's setup is worked through a slice at a time, and a slice is over when it has had
   *  about this long. The clock decides, not a count of items: one item's cost depends on the
   *  square, and a dense square in town has far more walls and buildings to fit than a field has,
   *  which is what made some slices 30 ms long. */
  private static SLICE = 4;
  private sliceAt = 0;
  private since = 0;
  /** Begin a slice. The loops below ask spent() as they go and yield when it says yes. */
  private beginSlice() { this.sliceAt = performance.now() + GameMap.SLICE; this.since = 0; }
  /** Whether this slice's time is up. every: how many items go by between asking the clock, which
   *  depends on what one item costs, so a loop over buildings asks often and one over trees less.
   *  Saying yes begins the next slice, so no caller has to remember to. */
  private spent(every = 16) {
    if (++this.since < every) return false;
    this.since = 0;
    if (performance.now() < this.sliceAt) return false;
    this.beginSlice();
    return true;
  }
  /** For finding where a long slice went (tools/spikeprobe.mjs reads it through __setupWhere): the
   *  name of the part of the setup now running, kept up to date by each loop that calls spent(). */
  phase = "";
  /** (experiment, a 2 m ground grid) which 4 m cells are drawn at 2 m: null where every cell is */
  fine: Uint8Array | null = null;

  /** slow: leave the walls, roofs and trunks for setup to work through a slice at a time. canalData: the
   *  canal's file, if the map has one, needed before anything is built (its bridges and banks depend on it). */
  constructor(d: MapData, wide: Wide | null = null, slow = false, canalData: CanalData | null = null, railData: RailData | null = null, cableData: CableData | null = null) {
    if (SIMPLE_ROOFS) for (const b of d.bl ?? []) delete b.rm;
    // A map whose ground all comes in squares (tiles.ts) has no terrain or scenery of its own: it
    // gets an empty grid, which nothing is ever inside, so the ground, collision and scenery
    // everywhere are the squares' (or the wider map's, where no square is loaded).
    if (!d.t) d.t = { nx: 0, ny: 0, x0: 0, y0: 0, dx: 1, dy: 1, z0: d.z0 ?? wide?.d.t.z0 ?? 0, h: [], k: "" };
    d.b ??= [0, 0, 0, 0];
    for (const k of ["bl", "rd", "wp", "wl", "br", "tr"] as const) d[k] ??= [];
    this.d = d;
    this.canalData = canalData;
    this.railData = railData;
    const T = d.t;
    this.z0 = T.z0;
    this.wide = wide;
    this.tx1 = T.x0 + (T.nx - 1) * T.dx; this.ty1 = T.y0 + (T.ny - 1) * T.dy;
    // the wide grid has a vertex on every third of this one's along the edge: in between, the
    // edge runs straight from one to the next, as the wide terrain's triangles do, so there's no gap
    const step = wide?.d.t.ci[2] ?? 0;
    if (step && (T.nx - 1) % step === 0 && (T.ny - 1) % step === 0) {
      const edge = (n: number, at: (k: number) => number) => {
        for (let k = 0; k < n; k++) if (k % step) {
          const a = at(k - (k % step)), b = at(k - (k % step) + step), t = (k % step) / step;
          T.h[at(k)] = Math.round(T.h[a] + (T.h[b] - T.h[a]) * t);
        }
      };
      edge(T.nx, (i) => i); edge(T.nx, (i) => (T.ny - 1) * T.nx + i);
      edge(T.ny, (j) => j * T.nx); edge(T.ny, (j) => j * T.nx + T.nx - 1);
    }
    this.fine = adaptGrid(T);
    this.hgt = new Float32Array(T.h.length);
    for (let k = 0; k < T.h.length; k++) this.hgt[k] = T.h[k] / 10;
    // the cable car: laid on the ground, with the trees, hedges and furniture cleared out of its way
    if (cableData?.st?.length === 2) {
      this.cable = new CableLine(cableData, (x, z) => this.ground(x, z));
      this.cable.clear(d);
    }
    // the railway and the canal, for the walls to be cut at as they are at the streets
    for (const t of railData?.tracks ?? []) {
      let run: number[][] = [];
      for (const q of t.p) { if (q[3] === 2) { if (run.length > 1) this.extraCorridors.push({ p: run, half: 4.5 }); run = []; } else run.push(q); }
      if (run.length > 1) this.extraCorridors.push({ p: run, half: 4.5 });
    }
    for (const r of canalData?.runs ?? []) this.extraCorridors.push({ p: r.p, half: Math.max(...r.p.map((q) => q[2])) + 0.8 });
    // with a wider map round it, the force field takes in the whole of that
    this.field = wide?.field ?? d.field;
    this.fieldX = wide ? wide.fx : d.fc?.[0] ?? 0; this.fieldZ = -(wide ? wide.fy : d.fc?.[1] ?? 0);
    for (const L of FIELD_LANES[d.id ?? ""] ?? []) {
      const bx = L.x, bz = -L.y, far = Math.hypot(bx - this.fieldX, bz - this.fieldZ);
      if (far <= this.field || far > this.field * 1.25) continue;
      const ux = (bx - this.fieldX) / far, uz = (bz - this.fieldZ) / far, from = this.field - L.w;
      this.lanes.push({ ax: this.fieldX + ux * from, az: this.fieldZ + uz * from, bx, bz, w: L.w });
    }
    const job = this.build();
    if (slow) this.setup = job;
    else while (!job.next().done);
  }

  /** Everything solid: bridge decks, tunnels, buildings, walls, trunks, parked cars and posts (yields between slices). */
  private *build(): Generator<void> {
    const d = this.d, wide = this.wide;
    this.beginSlice();
    this.phase = "bridges";
    // bridges: a road whose stored height stands well clear of the ground somewhere is walked,
    // driven and drawn at that height, not on the ground (or the river bed) under it
    const g = (x: number, z: number) => this.ground(x, z);
    // on a map that marks its bridges, a road it doesn't mark is on the ground all the way (a path
    // along the top of the canal's cutting stands well clear of the canal's bed, but it's no bridge)
    if (d.rd.some((r) => spanMarked(r))) for (const r of d.rd) r.marked = true;
    for (const r of d.rd) {
      if (this.spent(2)) yield;
      const flags = spanFlags(r, g, this.z0);
      if (!flags.some((f) => f)) continue;
      r.bridge = true;
      if (r.held) continue;    // (a set piece's bridge: its own solid parts keep you on it)
      // a bridge's parapets, either side of the deck (and its pavements), stop you walking off it
      const sides = deckSides(r);
      for (const [a, b] of bridgeSpans(r, flags, true)) {
        const seg = r.p.slice(a, b + 1), tops = seg.map((q, i) => deckTop(q, flags[a + i], g, this.z0));
        for (const side of [1, -1]) {
          const w = offsetLine(seg, ((side > 0 ? sides[0] : sides[1]) + 0.17) * side);
          // (down only to the deck's underside, so a road or path passing under has no wall across it)
          for (let i = 0; i < w.length - 1; i++) this.addSeg(w[i][0], -w[i][1], w[i + 1][0], -w[i + 1][1], tops[i] + 1.25, 1, Math.min(tops[i], tops[i + 1]) - DECK_DEPTH, tops[i + 1] + 1.25);
        }
      }
    }
    // the wider map's bridges only where this map has no grid of its own: it now takes the village
    // in, so its coarse copy of a village bridge would otherwise come first and, being the nearest,
    // hide this map's own good one (deck() keeps the nearest, then rejects it if it's too low)
    for (const r of [...d.rd, ...(wide?.rd ?? []).filter((r) => !r.p.some((q) => this.inGrid(q[0], -q[1])))]) {
      if (this.spent(2)) yield;
      if (!r.bridge) continue;
      // (at the height it's drawn at: its own on the bridge, the ground where it leaves it)
      // (out to its parapets, each side its own: a side with no pavement stops at its kerb)
      const k = this.decks.length, half = deckHalf(r) + 0.2, [hl, hr] = deckSides(r), seen = new Set<number>(), flags = spanFlags(r, g, this.z0);
      this.decks.push({ p: r.p.map((q, i) => [q[0], -q[1], deckTop(q, flags[i], g, this.z0)]), half, left: hl + 0.2, right: hr + 0.2 });
      for (let i = 0; i < r.p.length - 1; i++) {
        const a = r.p[i], b = r.p[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CELL / 2)));
        for (let s = 0; s <= n; s++)
          for (const c of this.cellsAround(a[0] + (b[0] - a[0]) * s / n, -(a[1] + (b[1] - a[1]) * s / n), half))
            if (!seen.has(c)) { seen.add(c); push(this.deckCells, c, k); }
      }
    }
    yield;
    this.beginSlice();
    this.phase = "roads and walls";
    // walls, fences and hedges stop at the kerb (and with a wider map round this one, none runs
    // along the edge where its streets carry on)
    d.br = yield* clearOfRoads(d.br, d.rd, wide ? d.b : null, this.extraCorridors, () => this.spent(24));

    this.phase = "canal";
    // the canal's banks (works.ts): its ground where it runs through this map's grid, and the
    // retaining walls along them you can't walk up
    const canal = this.canalData ?? (this.canal as { d?: CanalData } | null)?.d;
    // the hill over its tunnels, closing over the bores and meeting the portals (canal.ts)
    // and the ground under its aqueduct's arches
    if (canal && d.t.nx > 1) { tunnelHills(canal, d.t); aqueductBeds(canal, d.t, d.centre ? (x, y) => aqueductSetPieceAt(d.centre!, x, y) : undefined); }
    if (canal && d.t.nx > 1) {
      // (the decks over it: bridges, and the roads leading on to them)
      const under = (x: number, y: number) => {
        let low: number | null = null;
        for (const k of this.deckCells.get(key(Math.floor(x / CELL), Math.floor(-y / CELL))) ?? []) {
          const { p, half } = this.decks[k];
          for (let i = 0; i < p.length - 1; i++) {
            const a = p[i], b = p[i + 1], vx = b[0] - a[0], vz = b[1] - a[1], l2 = vx * vx + vz * vz || 1;
            const t = Math.min(1, Math.max(0, ((x - a[0]) * vx + (-y - a[1]) * vz) / l2));
            if (Math.hypot(x - a[0] - vx * t, -y - a[1] - vz * t) < half + 0.5) low = Math.min(low ?? Infinity, a[2] + (b[2] - a[2]) * t + this.z0);
          }
        }
        return low;
      };
      const T = d.t, w = new CanalWorks(canal, T, (x, y) => this.bareGround(x, -y) + this.z0, under);
      if (!w.empty) {
        this.works = w;
        // and no wood canopy over the water or the banks: it's laid over the ground under it,
        // and over the canal that's the bed, so it would hang over the water like a low roof
        if (d.cn) {
          const C = d.cn, raw = atob(C.h), H = new Uint8Array(raw.length), r = C.step / 2;
          for (let k = 0; k < raw.length; k++) H[k] = raw.charCodeAt(k);
          let cut = false;
          for (let j = 0; j < C.ny; j++) for (let i = 0; i < C.nx; i++) {
            if (!H[j * C.nx + i]) continue;
            const x = C.x0 + i * C.step, y = C.y0 + j * C.step;
            if ([[0, 0], [-r, -r], [r, -r], [r, r], [-r, r]].some(([u, v]) => w.across(x + u, y + v) !== null)) { H[j * C.nx + i] = 0; cut = true; }
          }
          if (cut) { let out = ""; for (let k = 0; k < H.length; k++) out += String.fromCharCode(H[k]); C.h = btoa(out); }
        }
        for (const [ax, ay, bx, by, top, foot] of w.walls) this.addSeg(ax, -ay, bx, -by, top - this.z0, 0, foot === undefined ? -Infinity : foot - this.z0);
      }
    }
    yield;

    this.phase = "tunnels";
    // tunnels: walls down both sides, as high as the arch, so nothing on the hill above bumps into them
    alignPortals(d.tn ?? [], d.b);
    for (const t of d.tn ?? []) {
      if (this.spent(1)) yield;
      const p = t.p;
      for (let i = 0; i < p.length - 1; i++) {
        const k = this.tA.length;
        const half = Math.max(boreHalf(t, i), boreHalf(t, i + 1));
        this.tA.push([p[i][0], -p[i][1], p[i][2] - this.z0, half, boreCrown(t)]); this.tB.push([p[i + 1][0], -p[i + 1][1], p[i + 1][2] - this.z0]);
        const len = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]), n = Math.max(1, Math.ceil(len / (CELL / 2)));
        const seen = new Set<number>();
        for (let s = 0; s <= n; s++) {
          const x = p[i][0] + ((p[i + 1][0] - p[i][0]) * s) / n, z = -(p[i][1] + ((p[i + 1][1] - p[i][1]) * s) / n);
          for (const c of this.cellsAround(x, z, half + 1)) if (!seen.has(c)) { seen.add(c); push(this.tunnelCells, c, k); }
        }
      }
      for (const side of [1, -1]) {
        const w = offsetLine(p, (i) => boreHalf(t, i) * side);
        for (let i = 0; i < w.length - 1; i++) {
          const top = Math.max(p[i][2], p[i + 1][2]) - this.z0 + boreCrown(t);
          this.addSeg(w[i][0], -w[i][1], w[i + 1][0], -w[i + 1][1], top, 0);
        }
      }
    }
    // the portals' faces, either side of the openings
    for (const [ax, ay, bx, by, top] of portalFaces(d.tn ?? [], d.b)) this.addSeg(ax, -ay, bx, -by, top - this.z0, 0);

    yield;
    this.beginSlice();
    this.phase = "buildings";
    for (let bi = 0; bi < d.bl.length; bi++) {
      const b = d.bl[bi];
      if (this.spent(4)) yield;
      const top = b.rm ? roofMeshTop(b) - this.z0 : b.g - this.z0 + b.h + Math.max(b.pp ?? 0, b.rp ? b.rp * 0.6 : 0.2), first = this.sAx.length;
      for (const ring of b.r) this.addRing(ring, top, 0);
      for (let i = first; i < this.sAx.length; i++) this.sRoof[i] = b.g - this.z0 + b.h;
      // and which squares it covers, for standing on its roof
      const xs = b.r[0].map((p) => p[0]), zs = b.r[0].map((p) => -p[1]);
      const i0 = Math.floor(Math.min(...xs) / CELL), i1 = Math.floor(Math.max(...xs) / CELL);
      const j0 = Math.floor(Math.min(...zs) / CELL), j1 = Math.floor(Math.max(...zs) / CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) push(this.bCells, key(i, j), bi);
    }
    for (let k = 0; k < d.br.length; k++) {
      if (this.spent(8)) yield;
      const l = d.br[k], p = l.p;
      for (let i = 0; i < p.length - 1; i++) {
        this.addSeg(p[i][0], -p[i][1], p[i + 1][0], -p[i + 1][1], barrierTop(l, i, this.z0), l.c.includes("hedge") ? 2 : 1, -Infinity, barrierTop(l, i + 1, this.z0), barrierLook(l.c).t / 2);   // (2: a hedge, which can't be ground along)
      }
    }
    // garden gates: the pillars stop you and your shots; the gate, standing ajar and never shut, only shots
    for (const gt of d.gt ?? []) {
      const g = gateShape(gt, this.z0);
      if (!g) continue;
      for (const [px, py] of g.pillars) {
        const h = g.pillarHalf, [ux, uy] = g.u, vx = -uy, vy = ux;
        const ring = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([s, t]) => [px + ux * s + vx * t, py + uy * s + vy * t]);
        for (let j = 0; j < 4; j++) {
          const a = ring[j], b = ring[(j + 1) % 4];
          this.addSeg(a[0], -a[1], b[0], -b[1], g.pillarTop, 2, g.pillarFoot);
        }
      }
      const f = g.leaf;
      this.addSeg(f.x0, -f.y0, f.x1, -f.y1, f.top, 3, f.foot, f.top, f.half);
    }
    yield;
    this.beginSlice();
    this.phase = "trees";
    for (const [x, y, z, s] of d.tr) {
      if (this.spent(16)) yield;
      const i = this.cX.length;
      this.cX.push(x); this.cZ.push(-y); this.cR.push(0.28 * s); this.cTop.push(z - this.z0 + 4 * s); this.cFoot.push(z - this.z0);
      this.cellsAround(x, -y, 0.3).forEach((k) => push(this.treeCells, k, i));
    }
    // the cable car's platforms to stand on, and its stations' pillars and towers' legs
    for (const b of this.cable?.solids() ?? []) {
      this.addBox(b.x, b.y, b.a, 0, b.hl, b.hw, b.top);
      if (b.stand) this.addBlock(b.x, b.y, b.a, b.hl, b.hw, b.top);
    }
    // parked cars on the streets you can drive along are taken off the street furniture
    const drive = d.rd.filter((r) => DRIVABLE_STREETS.has(r.n));
    if (drive.length && d.fx) d.fx = d.fx.filter((f) => {
      const [kind, x, y, , a] = f as [string, number, number, number, number];
      const on = kind === "car" && drive.find((r) => r.p.some((q) => Math.hypot(q[0] - x, q[1] - y) < 5));
      if (!on) return true;
      this.parked.push({ x, y, a, street: on.n });
      return false;
    });
    yield;
    this.beginSlice();
    // street items that block: parked cars and bus shelters as boxes, posts as circles
    for (const f of d.fx ?? []) {
      if (this.spent(16)) yield;
      const [kind, x, y, z, a] = f as [string, number, number, number, number];
      const g = z - this.z0;
      if (kind === "car") {
        this.cellsAround(x, -y, 2.1).forEach((k) => push(this.spareCells, k, this.spare.length));
        this.spare.push({ f, seg: this.sAx.length });
        this.addBox(x, y, a, 0, 2.05, 0.88, g + 1.45);
      }
      else if (kind === "bus" && f[6]) this.addBox(x, y, a, -0.75, 1.55, 0.6, g + 2.4);
      else if (kind === "lamp") this.addPost(x, y, 0.12, g + 6.4, g);
      else if (kind === "postbox" || kind === "bin") this.addPost(x, y, 0.28, g + 1.25, g);
      else if (kind === "wheelie") this.addPost(x, y, 0.34, g + 1.1, g);
      else if (kind === "pole") this.addPost(x, y, 0.15, g + 8, g);
      else if (kind === "bollard") this.addPost(x, y, 0.1, g + 0.9, g);
      else if (kind === "phone") this.addBox(x, y, a, 0, 0.48, 0.48, g + 2.5);
    }
    // the beacons and lights at crossings stand at each kerb
    for (const c of d.cx ?? []) {
      if (this.spent(16)) yield;
      const [x, y, z, a, , w] = c as [number, number, number, number, string, number];
      const off = w / 2 + 0.5, nx = -Math.sin(a) * off, ny = Math.cos(a) * off;
      for (const s of [1, -1]) this.addPost(x + nx * s, y + ny * s, 0.12, z - this.z0 + 3, z - this.z0);
    }
    // a concrete block across a path stops you; the rest you can get past or over
    for (const f of d.pb ?? []) {
      const [kind, x, y, z, a] = f as [string, number, number, number, number];
      if (kind === "block") this.addBox(x, y, a, 0, 0.3, 0.6, z - this.z0 + 0.6);
    }
    this.phase = "landmark trees";
    // big landmark trees: their trunks are solid
    for (const [kind, x, y, z, ang, ...rest] of [...d.lm ?? [], ...wide?.d.lm ?? []]) {
      const g = +z - this.z0;
      if (kind === "oak") this.addPost(+x, +y, 1.1, g + 6, g);
      else if (kind === "spire") this.addBox(+x, +y, +ang, 0, +rest[0] / 2, +rest[0] / 2, g + +rest[1]);   // the tower
      else if (kind === "tower") this.addBox(+x, +y, +ang, 0, +rest[0] / 2, +rest[1] / 2, g + +rest[2]);
      else if (kind === "bridge") this.addBox(+x, +y, +ang, 0, 9, 3.2, g + 3);                           // the arched base
      else if (kind === "portico") {
        // the podium, and each of the six columns (local x along the front, z out from the wall)
        const w = +rest[0], h = +rest[1], ux = Math.cos(+ang), uy = Math.sin(+ang);
        this.addBox(+x, +y, +ang, 3, (w + 2) / 2, 3, g + 1.6);
        for (let k = 0; k < 6; k++) {
          const lx = -w / 2 + 0.8 + k * (w - 1.6) / 5, lz = 4.8;
          this.addPost(+x + ux * lx + Math.sin(+ang) * lz, +y + uy * lx - Math.cos(+ang) * lz, 0.5, g + h, g);
        }
      }
    }
    this.phase = "twerton";
    // a football ground's stands, floodlights and hoardings: solid, and you can stand on the terraces
    for (const [kind, x, y, z, a, ...rest] of d.lm ?? []) {
      if (kind !== "twerton") continue;
      if (this.spent(1)) yield;
      const ux = Math.cos(+a), uy = Math.sin(+a), g = +z - this.z0;
      const at = (s: number, t: number) => [+x + ux * s - uy * t, +y + uy * s + ux * t];
      const { boxes, posts } = twertonSolids(rest);
      for (const b of boxes) {
        if (this.spent(2)) yield;
        const [cx, cy] = at((b.s0 + b.s1) / 2, (b.t0 + b.t1) / 2);
        this.addBox(cx, cy, +a, 0, (b.s1 - b.s0) / 2, (b.t1 - b.t0) / 2, g + b.top);
        this.addBlock(cx, cy, +a, (b.s1 - b.s0) / 2, (b.t1 - b.t0) / 2, g + b.top);
      }
      for (const p of posts) { if (this.spent(8)) yield; const [px, py] = at(p.s, p.t); this.addPost(px, py, p.r, g + p.top, g); }
    }
    this.phase = "landmarks";
    // set pieces' solid shapes, from their own models (landmarks/shape.ts), in each one's frame:
    // x along it, z out of its front. Their walls go in with every other wall; their surfaces to
    // stand on are looked up in their own grid (floorHere).
    for (const [kind, x, y, z, ang, ...rest] of d.lm ?? []) {
      // the set piece's own grid is built on the same clock as this square's setup (landmarks/shape.ts)
      (globalThis as any).__shapeSlice = GameMap.SLICE;
      const sh = yield* landmarkShape(kind as string, rest);
      if (!sh) continue;
      const a = +ang, c = Math.cos(a), s = Math.sin(a), g = +z - this.z0;
      const at = (lx: number, lz: number) => [+x + c * lx + s * lz, +y + s * lx - c * lz];
      const W = sh.walls;
      for (let i = 0; i < W.length; i += 6) {
        if (this.spent(32)) yield;
        const [ax, ay] = at(W[i], W[i + 1]), [bx, by] = at(W[i + 2], W[i + 3]);
        this.addSeg(ax, -ay, bx, -by, g + W[i + 5], 1, g + W[i + 4]);
      }
      const k = this.pieces.length;
      this.pieces.push({ sh, x: +x, y: +y, c, s, y0: g });
      const [x0, x1, z0, z1] = sh.box, corners = [at(x0, z0), at(x1, z0), at(x1, z1), at(x0, z1)];
      const xs = corners.map((q) => q[0]), zs = corners.map((q) => -q[1]);
      for (let i = Math.floor(Math.min(...xs) / CELL); i <= Math.floor(Math.max(...xs) / CELL); i++)
        for (let j = Math.floor(Math.min(...zs) / CELL); j <= Math.floor(Math.max(...zs) / CELL); j++) push(this.pieceCells, key(i, j), k);
    }
    this.phase = "pitches";
    // goalposts and cricket sightscreens
    for (const p of d.pi ?? []) {
      if (p[0] === "r") for (const [x, y] of rugbyUprights(p)) this.addPost(x, y, 0.3, this.ground(x, -y) + POST_HEIGHT, this.ground(x, -y));
      else if (p[0] === "f") for (const [x, y] of footballPosts(p)) this.addPost(x, y, 0.12, this.ground(x, -y) + footballLayout(p).goal.h + 0.1, this.ground(x, -y));
      else for (const [x, y] of p[5]) this.addBox(x, y, p[3] + Math.PI / 2, 0, SCREEN[0] / 2, 0.2, this.ground(x, -y) + SCREEN[1]);
    }
    this.phase = "";
    this.stamp = new Uint32Array(this.sAx.length);
    this.treeStamp = new Uint32Array(this.cX.length);
  }

  /** A parked car has become a vehicle (vehicles.ts): take away its walls and its furniture. */
  takeCar(k: number) {
    const s = this.spare[k];
    if (!s) return;
    s.taken = true;
    for (let j = 0; j < 4; j++) this.sTop[s.seg + j] = this.sTopB[s.seg + j] = -Infinity;
    this.onTakeCar(s.f);
  }

  /** Pitch number id (pitchId), wherever in Bath it is, if it's loaded here. */
  pitch(id: number): Pitch | undefined {
    if (!Number.isInteger(id) || id < 0) return undefined;
    if (id < PITCH_TILE) return this.d.pi?.[id];
    const n = id - PITCH_TILE;
    return this.tiles.get(Math.floor(n / 256))?.d.pi?.[n % 256];
  }

  /** This map and the full-detail squares loaded round it: everywhere there's street-level detail. */
  areas(): GameMap[] { return [this, ...this.tiles.values()]; }

  /** Parked cars still in the street furniture within r of (x, z), here and in the squares round
   *  about: scene coords, angle, and the ground under them. */
  parkedNear(x: number, z: number, r: number): { x: number; z: number; a: number; g: number }[] {
    const out: { x: number; z: number; a: number; g: number }[] = [];
    for (const m of [this, ...this.tilesNear(x, z, r)]) for (const i of m.spareNear(x, z, r)) {
      const [, px, py, pg, a] = m.spare[i].f as [string, number, number, number, number];
      out.push({ x: px, z: -py, a, g: pg - this.z0 });
    }
    return out;
  }

  /** Which of this map's own parked cars (their numbers in spare) are within r of (x, z), not yet taken. */
  spareNear(x: number, z: number, r: number): number[] {
    const out: number[] = [], seen = new Set<number>();
    for (const k of this.cellsAround(x, z, r)) for (const i of this.spareCells.get(k) ?? []) {
      const s = this.spare[i];
      if (seen.has(i) || s.taken) continue;
      seen.add(i);
      const [, px, py] = s.f as [string, number, number];
      if (Math.hypot(px - x, -py - z) < r) out.push(i);
    }
    return out;
  }

  /** Square key and car number of a TILE_CAR vehicle number. */
  static tileCar(i: number): [number, number] { const n = i - TILE_CAR; return [Math.floor(n / 65536), n % 65536]; }

  /** Someone's got in parked car i out in a square (a TILE_CAR number): take it off the street, now and whenever its square loads. */
  takeTileCar(i: number) {
    this.takenTileCars.add(i);
    const [key, k] = GameMap.tileCar(i);
    this.tiles.get(key)?.takeCar(k);
  }

  /** A square has finished loading (tiles.ts): it joins in, less any of its cars already taken. */
  addTile(key: number, m: GameMap) {
    this.tiles.set(key, m);
    this.tilesVersion++;
    for (const i of this.takenTileCars) { const [tk, k] = GameMap.tileCar(i); if (tk === key) m.takeCar(k); }
  }

  /** A full-detail square has left (tiles.ts): whoever made something of it says what to let go of. */
  onTileGone?: (m: GameMap) => void;

  dropTile(key: number) {
    const m = this.tiles.get(key);
    if (!m) return;
    this.tiles.delete(key);
    this.tilesVersion++;
    this.onTileGone?.(m);
  }

  /** What there is to stand on at (x, z) for feet at y: a tunnel's floor if they're in one, otherwise the ground,
   * or the roof of a vehicle, parked car or building no more than a step above them. */
  floor(x: number, z: number, y: number): number {
    const g = this.floorHere(x, z, y);
    let extra = -Infinity;
    for (const f of this.floors) { const h = f(x, z, y); if (h !== null && h <= y + 0.6 && h > extra) extra = h; }
    return Math.max(g, extra);
  }

  private floorHere(x: number, z: number, y: number): number {
    let g = this.inTunnel(x, z, y) ?? this.ground(x, z);
    const on = (cx: number, cz: number, a: number, hl: number, hw: number, top: number) => {
      if (top <= g || top > y + 0.5) return;
      const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dz = z - cz;
      if (Math.abs(dx * c - dz * s) < hl + 0.15 && Math.abs(dx * s + dz * c) < hw + 0.15) g = top;
    };
    for (const m of this.movers) on(m.x, m.z, m.a, m.hl, m.hw, m.top);
    for (const p of this.parkedNear(x, z, 2.5)) on(p.x, p.z, p.a, 2.05, 0.88, p.g + 1.44);
    for (const k of this.blockCells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const b = this.blocks[k];
      on(b.x, b.z, b.a, b.hl, b.hw, b.top);
    }
    for (const bi of this.bCells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const h = this.roofAt(this.d.bl[bi], x, -z);
      if (h > g && h <= y + 0.5) g = h;
    }
    for (const k of this.pieceCells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const p = this.pieces[k], dx = x - p.x, dy = -z - p.y;
      g = standOn(p.sh, dx * p.c + dy * p.s, dx * p.s - dy * p.c, p.y0, g, y);
    }
    const tile = this.tileAt(x, z);
    if (tile) return Math.max(g, tile.floor(x, z, y));     // a full-detail square has its own roofs, bridges and parked cars
    const dk = this.deck(x, z, y);
    if (dk !== null && dk > g) g = dk;
    if (this.wide && !this.inGrid(x, z)) {
      for (const b of this.wide.buildingsNear(x, -z, 0)) {
        const h = this.roofAt(b, x, -z);
        if (h > g && h <= y + 0.5) g = h;
      }
    }
    return g;
  }

  /** The deck of a bridge at scene (x, z), if feet at y are on it or a step below it (not down by
   *  the river under it): its height, or null. Where decks overlap (a slip road beside the main
   *  one, a road's approach where the deck begins, one bridge over another) it's the highest
   *  you're standing on or can step up to, so the one beside you never lets you through. */
  deck(x: number, z: number, y: number): number | null {
    const tile = this.tileAt(x, z);
    if (tile) return tile.deck(x, z, y);
    let best: number | null = null, floor: number | null = null;
    for (const k of this.deckCells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const { p, left, right } = this.decks[k];
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1], vx = b[0] - a[0], vz = b[1] - a[1], l2 = vx * vx + vz * vz || 1;
        const t = Math.min(1, Math.max(0, ((x - a[0]) * vx + (z - a[1]) * vz) / l2));
        // (scene z is south, so a point left of the road looking along it has a negative cross product)
        const reach = vx * (z - a[1]) - vz * (x - a[0]) < 0 ? left : right;
        if (Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t) >= reach) continue;
        const h = a[2] + (b[2] - a[2]) * t;
        if (h > y + 0.6 || (best !== null && h <= best)) continue;
        if (h > (floor ??= this.ground(x, z)) + 0.3) best = h;
      }
    }
    return best;
  }

  /** The lowest bridge deck over scene (x, z) whose top is above y: its top (scene Y), or null.
   *  For a boat going under: its deck and arch hang a metre or so below that (world.ts). */
  overhead(x: number, z: number, y: number): number | null {
    const tile = this.tileAt(x, z);
    if (tile) return tile.overhead(x, z, y);
    let low: number | null = null;
    for (const k of this.deckCells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const { p, half } = this.decks[k];
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1], vx = b[0] - a[0], vz = b[1] - a[1], l2 = vx * vx + vz * vz || 1;
        const t = Math.min(1, Math.max(0, ((x - a[0]) * vx + (z - a[1]) * vz) / l2));
        if (Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t) >= half) continue;
        const h = a[2] + (b[2] - a[2]) * t;
        if (h > y && (low === null || h < low)) low = h;
      }
    }
    return low;
  }

  /** The full-detail square loaded at scene (x, z), outside this map's own grid, if any. */
  tileAt(x: number, z: number): GameMap | undefined {
    const I = this.tileIndex;
    if (!I || !this.tiles.size || this.inGrid(x, z)) return undefined;
    const S = I.cells * I.dx;
    return this.tiles.get(tileKey(Math.floor((x - I.x0) / S), Math.floor((-z - I.y0) / S)));
  }

  /** Whether scene (x, z) is in the water (a pond, the river, the canal). */
  inWater(x: number, z: number): boolean {
    for (const m of [this as GameMap, ...this.tilesNear(x, z, 10)]) for (const wp of [...(m === this ? this.wide?.wp ?? [] : []), ...(m.d.wp ?? [])]) {
      const ring = wp.r[0];
      if (!ring) continue;
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if (yi > -z !== yj > -z && x < ((xj - xi) * (-z - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  }

  /** The loaded squares within r of scene (x, z). */
  tilesNear(x: number, z: number, r: number): GameMap[] {
    const I = this.tileIndex, out: GameMap[] = [];
    if (!I || !this.tiles.size) return out;
    const S = I.cells * I.dx;
    for (let ti = Math.floor((x - r - I.x0) / S); ti <= Math.floor((x + r - I.x0) / S); ti++)
      for (let tj = Math.floor((-z - r - I.y0) / S); tj <= Math.floor((-z + r - I.y0) / S); tj++) {
        const t = this.tiles.get(tileKey(ti, tj));
        if (t) out.push(t);
      }
    return out;
  }

  /** Is scene (x, z) inside a building's footprint (its courtyards count as inside: they're often
   *  shut in), here, in a loaded square, or in the wider map where no square is loaded? */
  indoors(x: number, z: number): boolean {
    const tile = this.tileAt(x, z);
    if (tile) return tile.indoors(x, z);
    if (this.d.sp?.some((r) => inRing(r, x, -z))) return true;
    for (const bi of this.bCells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      if (inRing(this.d.bl[bi].r[0], x, -z)) return true;
    }
    if (this.wide && !this.inGrid(x, z)) return this.wide.buildingsNear(x, -z, 0).some((b) => inRing(b.r[0], x, -z));
    return false;
  }

  /** Is the full detail of scene (x, z) here: this map's own, or a square loaded there? Elsewhere
   *  only the wider map's simpler buildings are known. */
  detailedAt(x: number, z: number): boolean {
    return !this.wide || this.inGrid(x, z) || !!this.tileAt(x, z);
  }

  /** Is scene (x, z) on the detailed map's terrain grid? */
  inGrid(x: number, z: number) {
    const T = this.d.t;
    return x >= T.x0 && x <= this.tx1 && -z >= T.y0 && -z <= this.ty1;
  }

  /** How high building b's roof is over (x, y) (data coords), or -Infinity if that's not inside it.
   * As world.ts builds it: flat at the eaves, or pitched over its roof rectangle, hipped at either end. */
  private roofAt(b: Building, x: number, y: number): number {
    if (!inRing(b.r[0], x, y) || b.r.slice(1).some((ring) => inRing(ring, x, y))) return -Infinity;
    const eave = b.g - this.z0 + b.h;
    if (b.rm) return (roofMeshAt(b, x, y) ?? b.g + b.h) - this.z0;
    let top = eave;
    for (const roof of roofsFit(b)) {
      const q = roof.q;
      const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], L = Math.hypot(ux, uy) || 1;
      const vx = q[3][0] - q[0][0], vy = q[3][1] - q[0][1], Wd = Math.hypot(vx, vy) || 1;
      const mx = (q[0][0] + q[2][0]) / 2, my = (q[0][1] + q[2][1]) / 2;
      const su = ((x - mx) * ux + (y - my) * uy) / L, sv = ((x - mx) * vx + (y - my) * vy) / Wd;
      const [hip0, hip1] = roof.hp;
      // past a gable end, or out to the side, you're on the flat cap over a wing, at the eaves
      if ((!hip0 && su < -L / 2) || (!hip1 && su > L / 2)) continue;
      const slope = roof.rp / (Wd / 2), ridge = eave + roof.rp;
      let h = ridge - Math.abs(sv) * slope;
      // hipped ends slope down the same way
      if (hip0) h = Math.min(h, ridge - Math.max(0, -su - (L / 2 - Wd / 2)) * slope);
      if (hip1) h = Math.min(h, ridge - Math.max(0, su - (L / 2 - Wd / 2)) * slope);
      top = Math.max(top, h);
    }
    return top;
  }

  /** Rectangle centred dz across from (x, y) (data coords), turned by angle a, half-sizes hl along and hw across. */
  private addBox(x: number, y: number, a: number, dz: number, hl: number, hw: number, top: number) {
    const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
    // local +z (toward the street) is minus v in data coordinates
    const cx = x - vx * dz, cy = y - vy * dz;
    const C = (s: number, t: number) => [cx + ux * s + vx * t, cy + uy * s + vy * t];
    const ring = [C(-hl, -hw), C(hl, -hw), C(hl, hw), C(-hl, hw)];
    this.addRing(ring, top, 1);
  }

  /** A flat top to stand on, over the rectangle addBox would make (no offset). */
  private addBlock(x: number, y: number, a: number, hl: number, hw: number, top: number) {
    const k = this.blocks.length;
    this.blocks.push({ x, z: -y, a, hl, hw, top });
    // the squares under it: walk it in steps of half a square each way
    const ux = Math.cos(a), uy = Math.sin(a), ns = Math.ceil(hl / (CELL / 2)), nt = Math.ceil(hw / (CELL / 2)), seen = new Set<number>();
    for (let i = -ns; i <= ns; i++) for (let j = -nt; j <= nt; j++) {
      const s = (hl * i) / Math.max(1, ns), t = (hw * j) / Math.max(1, nt);
      for (const c of this.cellsAround(x + ux * s - uy * t, -(y + uy * s + ux * t), 0.6)) if (!seen.has(c)) { seen.add(c); push(this.blockCells, c, k); }
    }
  }

  /** foot: where it stands, so one on the hill over a tunnel or on a bridge is clear of anyone under it. */
  private addPost(x: number, y: number, r: number, top: number, foot: number) {
    const i = this.cX.length;
    this.cX.push(x); this.cZ.push(-y); this.cR.push(r); this.cTop.push(top); this.cFoot.push(foot);
    this.cellsAround(x, -y, r).forEach((k) => push(this.treeCells, k, i));
  }

  private addRing(ring: number[][], top: number, kind: number) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      this.addSeg(a[0], -a[1], b[0], -b[1], top, kind);
    }
  }

  private addSeg(ax: number, az: number, bx: number, bz: number, top: number, kind: number, foot = -Infinity, topB = top, half = 0) {
    const i = this.sAx.length;
    this.sAx.push(ax); this.sAz.push(az); this.sBx.push(bx); this.sBz.push(bz); this.sTop.push(top); this.sTopB.push(topB); this.sKind.push(kind); this.sRoof.push(Infinity); this.sFoot.push(foot); this.sHalf.push(half);
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / (CELL / 2)));
    const seen = new Set<number>();
    for (let s = 0; s <= n; s++) {
      const x = ax + ((bx - ax) * s) / n, z = az + ((bz - az) * s) / n;
      for (const k of this.cellsAround(x, z, 0.6 + half)) if (!seen.has(k)) { seen.add(k); push(this.segCells, k, i); }
    }
  }

  /** Wall i's top a share s (0 to 1) of the way along it. */
  private topAt(i: number, s: number): number { return this.sTop[i] + (this.sTopB[i] - this.sTop[i]) * s; }

  private cellsAround(x: number, z: number, r: number): number[] {
    const out: number[] = [];
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) out.push(key(i, j));
    return out;
  }

  /** The railway and the canal, for the walls to be cut at. */
  private extraCorridors: { p: number[][]; half: number }[] = [];

  /** The surface as it's drawn (world.ts `surface`): the streets' faces and the terrain let down
   *  under them. Once the scene is built, everything stands on it, so what you walk and drive on is
   *  what you see, not the survey's grid a metre under a street or above one in a cutting. */
  private drawn: ((x: number, z: number) => number) | null = null;
  standOnDrawn(surface: ((x: number, z: number) => number) | null) { this.drawn = surface; }

  /** Ground height (scene Y) at scene (x, z): the drawn surface, once there is one. */
  ground(x: number, z: number): number {
    if (this.wide && !this.inGrid(x, z)) return (this.tileAt(x, z) ?? this.wide).ground(x, z);
    return this.drawn ? this.drawn(x, z) : this.trueGround(x, z);
  }

  /** The survey's ground at scene (x, z), before the streets are laid on it: what the drawing is built from. */
  trueGround(x: number, z: number): number {
    if (this.wide && !this.inGrid(x, z)) {
      const tile = this.tileAt(x, z);
      return tile ? tile.trueGround(x, z) : this.wide.ground(x, z);
    }
    const W = this.works;
    if (W) {
      // inside the canal's banks the ground is theirs (works.ts)
      const T = this.d.t, fi = (x - T.x0) / T.dx, fj = (-z - T.y0) / T.dy;
      const i = Math.min(T.nx - 2, Math.max(0, Math.floor(fi))), j = Math.min(T.ny - 2, Math.max(0, Math.floor(fj)));
      const u = Math.min(1, Math.max(0, fi - i)), v = Math.min(1, Math.max(0, fj - j)), s = W.sd, n = T.nx, a = j * n + i;
      const c = u + v <= 1 ? s[a] + (s[a + 1] - s[a]) * u + (s[a + n] - s[a]) * v : s[a + n + 1] + (s[a + n] - s[a + n + 1]) * (1 - u) + (s[a + 1] - s[a + n + 1]) * (1 - v);
      if (c < 0) { const h = W.height(x, -z); if (h !== null) return h - this.z0; }
    }
    return this.bareGround(x, z);
  }

  /** The height of this map's own ground grid at scene (x, z), as its triangles draw it, without the canal's banks. */
  bareGround(x: number, z: number): number {
    const T = this.d.t;
    const fi = (x - T.x0) / T.dx, fj = (-z - T.y0) / T.dy;
    const i = Math.min(T.nx - 2, Math.max(0, Math.floor(fi))), j = Math.min(T.ny - 2, Math.max(0, Math.floor(fj)));
    const u = Math.min(1, Math.max(0, fi - i)), v = Math.min(1, Math.max(0, fj - j));
    const h = this.hgt, n = T.nx, a = j * n + i;
    // match the triangle split used by the terrain mesh (a, b, c / b, d, c)
    if (u + v <= 1) return h[a] + (h[a + 1] - h[a]) * u + (h[a + n] - h[a]) * v;
    return h[a + n + 1] + (h[a + n] - h[a + n + 1]) * (1 - u) + (h[a + 1] - h[a + n + 1]) * (1 - v);
  }

  /** The wall round the zones open so far (zones.ts), or null with the whole map open. */
  zoneFence: { edge(x: number, z: number): number; inside(x: number, z: number, r: number): [number, number] } | null = null;

  /** How far scene (x, z) is inside the force field, and the zones' wall if there is one (negative outside). */
  fieldEdge(x: number, z: number): number {
    const e = this.fieldEdgeBase(x, z);
    return this.zoneFence ? Math.min(e, this.zoneFence.edge(x, z)) : e;
  }

  /** How far scene (x, z) is inside the force field itself, whatever the zones. */
  fieldEdgeBase(x: number, z: number): number {
    let e = this.field - Math.hypot(x - this.fieldX, z - this.fieldZ);
    for (const l of this.lanes) e = Math.max(e, l.w - laneNearest(l, x, z)[0]);
    return e;
  }

  /** The nearest spot to scene (x, z) that's at least r inside the force field and the zones' wall. */
  fieldInside(x: number, z: number, r: number): [number, number] {
    const p = this.fieldEdgeBase(x, z) < r ? this.fieldInsideBase(x, z, r) : [x, z] as [number, number];
    return this.zoneFence && this.zoneFence.edge(p[0], p[1]) < r ? this.zoneFence.inside(p[0], p[1], r) : p;
  }

  /** The same for the force field alone. */
  fieldInsideBase(x: number, z: number, r: number): [number, number] {
    const fx = x - this.fieldX, fz = z - this.fieldZ, d = Math.hypot(fx, fz) || 1, lim = this.field - r;
    let best: [number, number] = [this.fieldX + (fx * lim) / d, this.fieldZ + (fz * lim) / d], bd = Math.hypot(best[0] - x, best[1] - z);
    for (const l of this.lanes) {
      const [dl, qx, qz] = laneNearest(l, x, z), k = (l.w - r) / (dl || 1);
      const p: [number, number] = [qx + (x - qx) * k, qz + (z - qz) * k], pd = Math.hypot(p[0] - x, p[1] - z);
      if (pd < bd) { best = p; bd = pd; }
    }
    return best;
  }

  private outline: [number, number][] | null = null;
  /**
   * The force field's edge all the way round, scene x and z, going round the way the angle from
   * its middle grows: its circle, and where a strip reaches out, up one side of the strip, round
   * its end and back down the other. About every 35 m round the circle, closer along the strips.
   */
  fieldOutline(): [number, number][] {
    if (this.outline) return this.outline;
    const cx = this.fieldX, cz = this.fieldZ, R = this.field, TAU = Math.PI * 2;
    const inCircle = (p: number[]) => Math.hypot(p[0] - cx, p[1] - cz) < R;
    const angle = (p: number[]) => (Math.atan2(p[1] - cz, p[0] - cx) + TAU) % TAU;
    // each strip's own outline, from where it leaves the circle round to where it comes back in
    const runs = this.lanes.map((l) => {
      const len = Math.hypot(l.bx - l.ax, l.bz - l.az), ux = (l.bx - l.ax) / len, uz = (l.bz - l.az) / len;
      const loop: number[][] = [];
      const side = (s: number, from: number[], to: number[]) => {
        const n = Math.ceil(len / 8);
        for (let k = 0; k < n; k++) loop.push([from[0] + (to[0] - from[0]) * k / n - uz * s * l.w, from[1] + (to[1] - from[1]) * k / n + ux * s * l.w]);
      };
      const end = (x: number, z: number, a0: number) => { for (let k = 0; k < 24; k++) { const a = a0 + Math.PI * k / 24; loop.push([x + Math.cos(a) * l.w, z + Math.sin(a) * l.w]); } };
      const u = Math.atan2(uz, ux);
      side(-1, [l.ax, l.az], [l.bx, l.bz]); end(l.bx, l.bz, u - Math.PI / 2);
      side(1, [l.bx, l.bz], [l.ax, l.az]); end(l.ax, l.az, u + Math.PI / 2);
      // start from a point inside the circle, so the part outside it comes in one piece
      const s = loop.findIndex(inCircle);
      const order = [...loop.slice(s), ...loop.slice(0, s)];
      const i0 = order.findIndex((p) => !inCircle(p));
      let i1 = order.length - 1;
      while (inCircle(order[i1])) i1--;
      // where it crosses the circle, found between the points either side
      const cross = (a: number[], b: number[]) => {
        let lo = 0, hi = 1;
        for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (inCircle([a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m])) lo = m; else hi = m; }
        return [a[0] + (b[0] - a[0]) * hi, a[1] + (b[1] - a[1]) * hi];
      };
      const run = [cross(order[i0 - 1], order[i0]), ...order.slice(i0, i1 + 1), cross(order[(i1 + 1) % order.length], order[i1])];
      return { run, from: angle(run[0]), to: angle(run[run.length - 1]) };
    }).sort((a, b) => a.from - b.from);
    const out: [number, number][] = [];
    const arc = (a0: number, a1: number) => {
      if (a1 <= a0) a1 += TAU;
      const n = Math.max(1, Math.ceil((a1 - a0) / (TAU / 1024)));
      for (let k = 1; k < n; k++) { const a = a0 + (a1 - a0) * k / n; out.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]); }
    };
    if (!runs.length) arc(0, TAU);
    runs.forEach((r, i) => {
      for (const p of r.run) out.push([p[0], p[1]]);
      arc(r.to, runs[(i + 1) % runs.length].from);
    });
    return (this.outline = out);
  }

  /** A square round the whole force field, strips and all: its middle (data x and y) and half its width. */
  fieldFrame(): { x: number; y: number; r: number } {
    const o = this.fieldOutline(), xs = o.map((p) => p[0]), zs = o.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    return { x: (x0 + x1) / 2, y: -(z0 + z1) / 2, r: Math.max(x1 - x0, z1 - z0) / 2 };
  }

  /** The floor of the tunnel at scene (x, z), if there's one under it (scene Y), or null: this
   *  map's own tunnels, or those of the square loaded there. */
  tunnelFloor(x: number, z: number): number | null {
    return this.boreAt(x, z)?.[0] ?? null;
  }

  /** The tunnel's floor (scene Y) and its height to the top of the bore at scene (x, z), if there's one under it. */
  private boreAt(x: number, z: number): [number, number] | null {
    let best: [number, number] | null = null, bd = Infinity;
    for (const k of this.tunnelCells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const a = this.tA[k], b = this.tB[k], vx = b[0] - a[0], vz = b[1] - a[1];
      const s = Math.min(1, Math.max(0, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz || 1)));
      const d = Math.hypot(x - a[0] - vx * s, z - a[1] - vz * s);
      if (d < a[3] + 0.2 && d < bd) { bd = d; best = [a[2] + (b[2] - a[2]) * s, a[4]]; }
    }
    return best ?? this.tileAt(x, z)?.boreAt(x, z) ?? null;
  }

  /** The tunnel floor under feet at scene (x, y, z) if they're inside a tunnel, or null. */
  inTunnel(x: number, z: number, y: number): number | null {
    const b = this.boreAt(x, z);
    return b && y < b[0] + b[1] - 0.4 ? b[0] : this.canalBore(x, z, y);
  }

  /** The floor of one of the canal's tunnels at scene (x, z) if feet at y are down in it (its
   *  towpath's ledge, or the bed under its water: works.ts), or null: this map's own, or those of
   *  the square loaded there. */
  canalBore(x: number, z: number, y: number): number | null {
    const h = this.works?.bore(x, -z, y + this.z0);
    if (h !== undefined && h !== null) return h - this.z0;
    return this.tileAt(x, z)?.canalBore(x, z, y) ?? null;
  }

  /** Height above the feet of the tallest thing the last collide() pushed against (-1 if none). */
  lastBlock = -1;

  /** Push a circle of radius r at feet height y out of anything solid (but skip, and any mover pass lets through). Mutates and returns pos. */
  collide(pos: { x: number; z: number }, y: number, r: number, skip?: Mover, pass?: (m: Mover) => boolean): { x: number; z: number } {
    this.lastBlock = -1;
    for (let iter = 0; iter < 3; iter++) {
      let block = this.pushStatic(pos, y, r), moved = block > -Infinity;
      this.lastBlock = Math.max(this.lastBlock, block);
      // the full-detail squares round this map (only ever the ones loaded near the player)
      for (const tm of this.tilesNear(pos.x, pos.z, r)) {
        block = tm.pushStatic(pos, y, r);
        if (block > -Infinity) { moved = true; this.lastBlock = Math.max(this.lastBlock, block); }
      }
      for (const m of this.movers) {
        if (m === skip || m.top < y + 0.45 || m.y > y + 1.8 || pass?.(m)) continue;   // (or one passing over your head)
        // into the vehicle's own frame: u along it, w across
        const c = Math.cos(m.a), s = Math.sin(m.a), dx = pos.x - m.x, dz = pos.z - m.z;
        const u = dx * c - dz * s, w = dx * s + dz * c;
        if (Math.abs(u) >= m.hl + r || Math.abs(w) >= m.hw + r) continue;
        const cu = Math.max(-m.hl, Math.min(m.hl, u)), cw = Math.max(-m.hw, Math.min(m.hw, w));
        let nu = u, nw = w;
        if (cu === u && cw === w) {
          // inside it: out through the nearest side
          if (m.hl - Math.abs(u) < m.hw - Math.abs(w)) nu = (u < 0 ? -1 : 1) * (m.hl + r);
          else nw = (w < 0 ? -1 : 1) * (m.hw + r);
        } else {
          const eu = u - cu, ew = w - cw, d = Math.hypot(eu, ew);
          if (d >= r) continue;
          nu = cu + (eu / d) * r; nw = cw + (ew / d) * r;
        }
        pos.x = m.x + nu * c + nw * s; pos.z = m.z - nu * s + nw * c;
        moved = true;
        this.lastBlock = Math.max(this.lastBlock, m.top - y);
      }
      for (const f of this.pushers) {
        const b = f(pos, y, r);
        if (b > -Infinity) { moved = true; this.lastBlock = Math.max(this.lastBlock, b); }
      }
      // the simpler wider map, where neither a square nor this map's own grid is: the wide map now
      // takes the village in, so its coarse buildings would otherwise sit over the detailed ones
      if (this.wide && !this.inGrid(pos.x, pos.z) && !this.tileAt(pos.x, pos.z)) {
        const bx = pos.x, bz = pos.z, wb = this.wide.collide(pos, y, r);
        if (wb >= 0) { this.lastBlock = Math.max(this.lastBlock, wb); moved ||= pos.x !== bx || pos.z !== bz; }
      }
      if (!moved) break;
    }
    // the force field
    if (this.fieldEdge(pos.x, pos.z) < r) [pos.x, pos.z] = this.fieldInside(pos.x, pos.z, r);
    return pos;
  }

  /** Push a circle at feet height y out of this map's own walls, buildings, trunks and posts.
   *  Returns the height above the feet of the tallest thing it was pushed off, or -Infinity if none. */
  pushStatic(pos: { x: number; z: number }, y: number, r: number): number {
    let block = -Infinity;
    const t = ++this.tick;
    {
      for (const k of this.cellsAround(pos.x, pos.z, r)) {
        for (const i of this.segCells.get(k) ?? []) {
          if (this.stamp[i] === t) continue;
          this.stamp[i] = t;
          if (this.sKind[i] === 3) continue;    // a gate standing ajar: you go through it
          if (Math.max(this.sTop[i], this.sTopB[i]) < y + 0.45 || this.sRoof[i] <= y + 0.05 || this.sFoot[i] > y + 1.7) continue;   // low enough to step over, we're on the roof, or it's over our head
          const ax = this.sAx[i], az = this.sAz[i], vx = this.sBx[i] - ax, vz = this.sBz[i] - az;
          const l2 = vx * vx + vz * vz || 1;
          const s = Math.min(1, Math.max(0, ((pos.x - ax) * vx + (pos.z - az) * vz) / l2));
          const top = this.topAt(i, s);
          if (top < y + 0.45) continue;
          const cx = ax + vx * s, cz = az + vz * s;
          let ex = pos.x - cx, ez = pos.z - cz;
          const d = Math.hypot(ex, ez), reach = r + this.sHalf[i];
          if (d >= reach) continue;
          if (d < 1e-6) { ex = -vz; ez = vx; } // exactly on the line: push along its normal
          const el = Math.hypot(ex, ez) || 1;
          pos.x = cx + (ex / el) * reach; pos.z = cz + (ez / el) * reach;
          block = Math.max(block, top - y);
        }
        for (const i of this.treeCells.get(k) ?? []) {
          if (this.treeStamp[i] === t) continue;
          this.treeStamp[i] = t;
          if (this.cTop[i] < y + 0.45) continue;   // over the top of it (a balloon over the trees, someone on a roof)
          if (this.cFoot[i] > y + 1.7 && y !== ANY_HEIGHT) continue;
          const ex = pos.x - this.cX[i], ez = pos.z - this.cZ[i], d = Math.hypot(ex, ez), m = r + this.cR[i];
          if (d >= m || d < 1e-6) continue;
          pos.x = this.cX[i] + (ex / d) * m; pos.z = this.cZ[i] + (ez / d) * m;
          block = Math.max(block, this.cTop[i] - y);
        }
      }
    }
    return block;
  }

  /**
   * The top of a low wall, fence, railing, parked car or bridge parapet near scene (x, z) to grind
   * along on a ride (player.ts): within r across, its top between down below and up above feet at
   * y, standing no more than 1.7 m off the ground, and running within the angle cos minDot of the
   * way (dx, dz) you're going. Here and in the loaded squares round it. Buildings and hedges don't
   * count. The edge comes back from a to b, the way you're going.
   */
  grindEdge(x: number, z: number, y: number, r: number, up: number, down: number, dx: number, dz: number, minDot: number): GrindEdge | null {
    let best: GrindEdge | null = null, bestD = r;
    for (const m of [this, ...this.tilesNear(x, z, r)]) {
      const e = m.edgeHere(x, z, y, bestD, up, down, dx, dz, minDot);
      if (e) { best = e; bestD = e.d; }
    }
    return best;
  }

  /** grindEdge, for this map's own walls. */
  private edgeHere(x: number, z: number, y: number, r: number, up: number, down: number, dx: number, dz: number, minDot: number): GrindEdge | null {
    let best: GrindEdge | null = null, bestD = r;
    const t = ++this.tick;
    for (const k of this.cellsAround(x, z, r)) for (const i of this.segCells.get(k) ?? []) {
      if (this.stamp[i] === t) continue;
      this.stamp[i] = t;
      if (this.sKind[i] !== 1) continue;
      const ax = this.sAx[i], az = this.sAz[i], vx = this.sBx[i] - ax, vz = this.sBz[i] - az, len = Math.hypot(vx, vz);
      if (len < 0.4) continue;
      const ux = vx / len, uz = vz / len, dot = ux * dx + uz * dz;
      if (Math.abs(dot) < minDot) continue;
      const s = (x - ax) * ux + (z - az) * uz;
      if (s < -0.2 || s > len + 0.2) continue;
      const top = this.topAt(i, Math.min(1, Math.max(0, s / len)));
      if (top > y + up || top < y - down) continue;
      const d = Math.abs((x - ax) * uz - (z - az) * ux);
      if (d >= bestD) continue;
      const cx = ax + ux * s, cz = az + uz * s;
      if (top - this.ground(cx, cz) > 1.7) continue;
      bestD = d;
      best = dot > 0 ? { ax, az, bx: this.sBx[i], bz: this.sBz[i], top, d } : { ax: this.sBx[i], az: this.sBz[i], bx: ax, bz: az, top, d };
    }
    return best;
  }

  /** Scene (x, z), or if that's on ground kept clear, the nearest spot just off it. */
  offKept(x: number, z: number): [number, number] {
    for (const k of this.keepClear) {
      const d = Math.hypot(x - k.x, z - k.z);
      if (d >= k.r) continue;
      const ux = d > 1e-6 ? (x - k.x) / d : 1, uz = d > 1e-6 ? (z - k.z) / d : 0;
      return [k.x + ux * (k.r + 1), k.z + uz * (k.r + 1)];
    }
    return [x, z];
  }

  /** True if a circle at (x, z) touches a building, wall or tree, or ground kept clear. */
  blocked(x: number, z: number, r: number): boolean {
    if (this.keepClear.some((k) => Math.hypot(k.x - x, k.z - z) < k.r + r)) return true;
    const p = { x, z };
    this.collide(p, ANY_HEIGHT, r);
    return Math.hypot(p.x - x, p.z - z) > 1e-3;
  }

  /** First solid thing hit by a ray from o along unit vector d, within maxDist. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): RayHit | null {
    let best = this.wallsHit(ox, oy, oz, dx, dy, dz, maxDist);
    // the full-detail squares the ray passes over
    const ex = ox + dx * maxDist, ez = oz + dz * maxDist;
    for (const tm of this.tilesNear((ox + ex) / 2, (oz + ez) / 2, Math.hypot(ex - ox, ez - oz) / 2)) {
      const h = tm.wallsHit(ox, oy, oz, dx, dy, dz, best ? best.dist : maxDist);
      if (h && (!best || h.dist < best.dist)) best = h;
    }
    // the wider map's buildings and trees, where neither a square nor this map's own grid is
    const w = this.wide?.raycast(ox, oy, oz, dx, dy, dz, best ? best.dist : maxDist, raySeg, rayCircle, (x, z) => this.inGrid(x, z) || !!this.tileAt(x, z));
    if (w && (!best || w.dist < best.dist)) best = w;
    // vehicles, below their windows
    for (const m of this.movers) {
      const hit = rayBox(ox, oy, oz, dx, dy, dz, m);
      if (!hit || hit.t > maxDist || (best && hit.t >= best.dist)) continue;
      best = { dist: hit.t, kind: "barrier", nx: hit.nx, ny: hit.ny, nz: hit.nz, mover: m };
    }
    for (const f of this.rays) {
      const h = f(ox, oy, oz, dx, dy, dz, best ? best.dist : maxDist);
      if (h && (!best || h.dist < best.dist)) best = h;
    }
    return this.groundHit(ox, oy, oz, dx, dy, dz, maxDist, best);
  }

  /** First of this map's own walls, buildings and trunks hit by a ray, within maxDist. */
  wallsHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): RayHit | null {
    let best: RayHit | null = null;
    const hl = Math.hypot(dx, dz);
    if (hl > 1e-6) {
      // walk the cells under the ray's horizontal track, testing walls and trunks in each
      const t = ++this.tick;
      const steps = Math.ceil((maxDist * hl) / (CELL / 2));
      const seen = new Set<number>();
      for (let s = 0; s <= steps; s++) {
        const f = Math.min(maxDist, (s * (CELL / 2)) / hl);
        const x = ox + dx * f, z = oz + dz * f;
        for (const k of this.cellsAround(x, z, CELL / 2)) {
          if (seen.has(k)) continue;
          seen.add(k);
          for (const i of this.segCells.get(k) ?? []) {
            if (this.stamp[i] === t) continue;
            this.stamp[i] = t;
            const hit = rayThickSeg(ox, oz, dx, dz, this.sAx[i], this.sAz[i], this.sBx[i], this.sBz[i], this.sHalf[i]);
            if (hit < 0 || hit > maxDist || (best && hit >= best.dist)) continue;
            const y = oy + dy * hit;
            const vx = this.sBx[i] - this.sAx[i], vz = this.sBz[i] - this.sAz[i], vl = Math.hypot(vx, vz) || 1;
            const along = Math.min(1, Math.max(0, ((ox + dx * hit - this.sAx[i]) * vx + (oz + dz * hit - this.sAz[i]) * vz) / (vl * vl)));
            if (y > this.topAt(i, along) || y < this.sFoot[i]) continue;
            let nx = -vz / vl, nz = vx / vl;
            if (nx * dx + nz * dz > 0) { nx = -nx; nz = -nz; }
            best = { dist: hit, kind: this.sKind[i] === 0 ? "building" : "barrier", nx, ny: 0, nz };
          }
          for (const i of this.treeCells.get(k) ?? []) {
            if (this.treeStamp[i] === t) continue;
            this.treeStamp[i] = t;
            const hit = rayCircle(ox, oz, dx, dz, this.cX[i], this.cZ[i], this.cR[i] * TRUNK_DRAWN);
            if (hit < 0 || hit > maxDist || (best && hit >= best.dist)) continue;
            if (oy + dy * hit > this.cTop[i] || oy + dy * hit < this.cFoot[i]) continue;
            const hx = ox + dx * hit - this.cX[i], hz = oz + dz * hit - this.cZ[i], hl2 = Math.hypot(hx, hz) || 1;
            best = { dist: hit, kind: "tree", nx: hx / hl2, ny: 0, nz: hz / hl2 };
          }
        }
        if (best && best.dist < f - CELL) break;
      }
    }
    return best;
  }

  /** The ground (or a tunnel's floor and arch) if a ray hits it before best. */
  private groundHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, best: RayHit | null): RayHit | null {
    // march, then bisect
    const lim = best ? best.dist : maxDist;
    const solid = (f: number) => {
      const x = ox + dx * f, y = oy + dy * f, z = oz + dz * f, t = this.boreAt(x, z);
      return t && y < t[0] + t[1] ? y < t[0] : y < this.ground(x, z);
    };
    let prev = 0;
    for (let f = 0.5; f <= lim + 0.5; f += 0.5) {
      const ff = Math.min(f, lim);
      if (solid(ff)) {
        let lo = prev, hi = ff;
        for (let k = 0; k < 10; k++) {
          const m = (lo + hi) / 2;
          if (solid(m)) hi = m; else lo = m;
        }
        const hx = ox + dx * hi, hz = oz + dz * hi;
        const tf = this.boreAt(hx, hz);
        if (tf && oy + dy * hi < tf[0] + tf[1]) return { dist: hi, kind: "ground", nx: 0, ny: dy < 0 ? 1 : -1, nz: 0 };
        const gx = this.ground(hx + 0.5, hz) - this.ground(hx - 0.5, hz), gz = this.ground(hx, hz + 0.5) - this.ground(hx, hz - 0.5);
        const nl = Math.hypot(gx, 1, gz);
        return { dist: hi, kind: "ground", nx: -gx / nl, ny: 1 / nl, nz: -gz / nl };
      }
      prev = ff;
      if (ff >= lim) break;
    }
    return best;
  }
}

/** The pitched roof the game puts on a building: q is its rectangle (the first edge runs along the
 * ridge), rp the ridge's rise over the eaves, hp the hip insets at each end, ch the chimney stacks
 * standing on it, and wings set when parts of the house stick out beyond it and need a flat roof
 * of their own. */
export interface Roof { q: number[][]; rp: number; hp: number[]; ch: number[][]; wings: boolean }

/** Building b's pitched roofs, none for a flat one. When the map's roof rectangle hangs well over
 * thin air (an L-shaped house, a stepped back, or a church with its corners cut away, under one big
 * roof) the roof shrinks to the biggest rectangle that stands on the walls, keeping its ridge as high
 * as it was (no steeper than 50°). Wings big enough to carry one get a pitched roof of their own, and
 * what's left of the house gets a flat cap; only a house with no decent rectangle in it goes flat. */
const fits = new WeakMap<Building, Roof[]>();
/** The steepest a roof is drawn, as tools/buildings.py measures them. */
const STEEPEST = Math.tan((50 * Math.PI) / 180);
/** The narrowest wing that carries a pitched roof of its own. */
const WING_SIDE = 2.5;
export function roofsFit(b: Building): Roof[] {
  const known = fits.get(b);
  if (known !== undefined) return known;
  const out: Roof[] = [];
  if (b.rr && b.rp && !b.rm) {
    const q = b.rr, ring = b.r[0];
    const on = (x: number, y: number) => inRing(ring, x, y) && !b.r.slice(1).some((h) => inRing(h, x, y));
    const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], L = Math.hypot(ux, uy) || 1;
    const vx = q[3][0] - q[0][0], vy = q[3][1] - q[0][1], W = Math.hypot(vx, vy) || 1;
    /** The point s metres along the ridge and t across, from the rectangle's first corner. */
    const P = (s: number, t: number) => [q[0][0] + (ux / L) * s + (vx / W) * t, q[0][1] + (uy / L) * s + (vy / W) * t];
    const S = (x: number, y: number) => ((x - q[0][0]) * ux + (y - q[0][1]) * uy) / L;
    const T = (x: number, y: number) => ((x - q[0][0]) * vx + (y - q[0][1]) * vy) / W;
    // sample the rectangle, a little in from its edges, for points off the footprint
    let miss = 0, n = 0;
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
      const [x, y] = P(L * (0.05 + (0.9 * i) / 8), W * (0.05 + (0.9 * j) / 8));
      n++; if (!on(x, y)) miss++;
    }
    // a metre in from the eaves all round: off the walls there, the roof overhangs a notch in the
    // house (a stepped back) by far more than eaves do, however little of its area that is
    let notched = false;
    for (const [s0, t0, s1, t1] of [[1, 1, L - 1, 1], [L - 1, 1, L - 1, W - 1], [L - 1, W - 1, 1, W - 1], [1, W - 1, 1, 1]]) {
      const k = Math.max(1, Math.round(Math.hypot(s1 - s0, t1 - t0)));
      for (let i = 0; i <= k && !notched; i++) if (!on(...(P(s0 + ((s1 - s0) * i) / k, t0 + ((t1 - t0) * i) / k) as [number, number]))) notched = true;
    }
    // the house in cells lined up with the roof, over the whole footprint (it can reach past the rectangle)
    let sMin = 0, sMax = L, tMin = 0, tMax = W;
    for (const [x, y] of ring) { const s = S(x, y), t = T(x, y); sMin = Math.min(sMin, s); sMax = Math.max(sMax, s); tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); }
    const c = Math.max(0.5, Math.max(sMax - sMin, tMax - tMin) / 48);
    const nu = Math.max(1, Math.round((sMax - sMin) / c)), nv = Math.max(1, Math.round((tMax - tMin) / c));
    const cu = (sMax - sMin) / nu, cv = (tMax - tMin) / nv;
    const free: boolean[][] = [];
    for (let i = 0; i < nu; i++) { free.push([]); for (let j = 0; j < nv; j++) { const [x, y] = P(sMin + (i + 0.5) * cu, tMin + (j + 0.5) * cv); free[i].push(on(x, y)); } }
    /** The biggest rectangle of free cells: its area and cell range. */
    const biggest = () => {
      const run = new Array(nv).fill(0);
      let best = 0, bi = 0, bj = 0, bw = 0, bh = 0;
      for (let i = 0; i < nu; i++) {
        // run[j]: how many free cells in a row, ending at this column
        for (let j = 0; j < nv; j++) run[j] = free[i][j] ? run[j] + 1 : 0;
        for (let j = 0; j < nv; j++) {
          let w = Infinity;
          for (let k = j; k < nv && run[k]; k++) {
            w = Math.min(w, run[k]);
            const a = w * cu * (k - j + 1) * cv;
            if (a > best) { best = a; bi = i - w + 1; bj = j; bw = w; bh = k - j + 1; }
          }
        }
      }
      return { best, s0: sMin + bi * cu, s1: sMin + (bi + bw) * cu, t0: tMin + bj * cv, t1: tMin + (bj + bh) * cv };
    };
    const take = (s0: number, s1: number, t0: number, t1: number) => {
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const s = sMin + (i + 0.5) * cu, t = tMin + (j + 0.5) * cv;
        if (s > s0 && s < s1 && t > t0 && t < t1) free[i][j] = false;
      }
    };
    /** A roof over rectangle s0..s1 by t0..t1, its ridge along the longer side, no steeper than STEEPEST. */
    // each roof's rectangle in s, t, which way its ridge runs and its rise, for joining wings on to it
    const boxes: { s0: number; s1: number; t0: number; t1: number; alongS: boolean; rp: number }[] = [];
    const over = (s0: number, s1: number, t0: number, t1: number, hp: (turn: boolean) => number[], ch: number[][]): Roof => {
      const along = s1 - s0, across = t1 - t0, turn = across > along, wide = turn ? along : across;
      const rq = turn ? [P(s0, t0), P(s0, t1), P(s1, t1), P(s1, t0)] : [P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1)];
      const rp = Math.min(b.rp!, (wide / 2) * STEEPEST);
      boxes.push({ s0, s1, t0, t1, alongS: !turn, rp });
      return { q: rq, rp, hp: hp(turn), ch, wings: true };
    };
    const hipped = (b.hp ?? [0, 0]).some((h) => h);
    const floor = Math.min(L * W, ringArea(ring) - b.r.slice(1).reduce((s, h) => s + ringArea(h), 0));
    if (miss / n <= 0.08 && !notched) {
      // it fits: any corner of the house more than half a metre outside the rectangle?
      const wings = ring.some(([x, y]) => { const s = S(x, y), t = T(x, y); return s < -0.5 || s > L + 0.5 || t < -0.5 || t > W + 0.5; });
      out.push({ q, rp: b.rp, hp: b.hp ?? [0, 0], ch: b.ch ?? [], wings });
      boxes.push({ s0: 0, s1: L, t0: 0, t1: W, alongS: true, rp: b.rp });
      take(-Infinity, Infinity, -Infinity, Infinity);
      if (wings) for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const s = sMin + (i + 0.5) * cu, t = tMin + (j + 0.5) * cv;
        const [x, y] = P(s, t);
        free[i][j] = (s < 0 || s > L || t < 0 || t > W) && on(x, y);
      }
    } else {
      const m = biggest();
      // decent next to the house itself: the map's rectangle can be far bigger than an L-shaped house
      if (m.best >= 0.3 * floor && Math.min(m.s1 - m.s0, m.t1 - m.t0) >= WING_SIDE) {
        // the ridge as high as the survey has it: lowering it to keep the slope left a narrow roof
        // hidden behind its own walls from the street
        const hp = (turn: boolean) => turn ? (hipped ? [1, 1] : [0, 0]) : [m.s0 < 0.5 ? b.hp?.[0] ?? 0 : 0, m.s1 > L - 0.5 ? b.hp?.[1] ?? 0 : 0];
        // chimney stacks only where they still stand on the roof
        const ch = (b.ch ?? []).filter(([x, y]) => { const s = S(x, y), t = T(x, y); return s > m.s0 + 0.4 && s < m.s1 - 0.4 && t > m.t0 + 0.4 && t < m.t1 - 0.4; });
        out.push(over(m.s0, m.s1, m.t0, m.t1, hp, ch));
        take(m.s0, m.s1, m.t0, m.t1);
      }
    }
    // (each wing takes at least its own floor's worth of cells, so this runs out)
    while (out.length) {
      const m = biggest();
      if (m.best < Math.max(10, 0.08 * floor) || Math.min(m.s1 - m.s0, m.t1 - m.t0) < WING_SIDE) break;
      out.push(over(m.s0, m.s1, m.t0, m.t1, () => hipped ? [1, 1] : [0, 0], []));
      take(m.s0, m.s1, m.t0, m.t1);
    }
    // A wing whose ridge runs into the side of another roof carries on into it until its ridge meets
    // that roof's slope, as a cross gable does, so its end is inside the other roof, not a gable
    // standing in front of it
    const tol = Math.max(cu, cv) + 0.05;
    for (let i = 1; i < out.length; i++) {
      const w = boxes[i], ext = [0, 0];
      for (const end of [0, 1]) {
        for (let j = 0; j < boxes.length; j++) {
          const o = boxes[j];
          if (j === i || o.alongS === w.alongS) continue;
          // w's ridge runs along s (or t); o's eaves are its sides at o.s0 and o.s1 (or o.t0 and o.t1)
          const [a0, a1, b0, b1, oa0, oa1, ob0, ob1] = w.alongS
            ? [w.s0, w.s1, w.t0, w.t1, o.s0, o.s1, o.t0, o.t1] : [w.t0, w.t1, w.s0, w.s1, o.t0, o.t1, o.s0, o.s1];
          const edge = end ? a1 : a0, eave = end ? oa0 : oa1;
          if (Math.abs(edge - eave) > tol || b0 < ob0 - tol || b1 > ob1 + tol) continue;
          ext[end] = ((oa1 - oa0) / 2) * Math.min(1, w.rp / o.rp);
          break;
        }
      }
      if (!ext[0] && !ext[1]) continue;
      const [s0, s1, t0, t1] = w.alongS ? [w.s0 - ext[0], w.s1 + ext[1], w.t0, w.t1] : [w.s0, w.s1, w.t0 - ext[0], w.t1 + ext[1]];
      const hp0 = out[i].hp;
      out[i] = over(s0, s1, t0, t1, () => [ext[0] ? 0 : hp0[0], ext[1] ? 0 : hp0[1]], []);
      boxes.pop();
    }
  }
  fits.set(b, out);
  return out;
}
/** The height above sea level of building b's roof faces over (x, y), or null off them. */
export function roofMeshAt(b: Building, x: number, y: number): number | null {
  const m = b.rm;
  if (!m) return null;
  const v = m.v, t = m.t;
  for (let i = 0; i < t.length; i += 3) {
    const a = 3 * t[i], c = 3 * t[i + 1], e = 3 * t[i + 2];
    const d = (v[c + 1] - v[e + 1]) * (v[a] - v[e]) + (v[e] - v[c]) * (v[a + 1] - v[e + 1]);
    if (Math.abs(d) < 1e-9) continue;
    const l1 = ((v[c + 1] - v[e + 1]) * (x - v[e]) + (v[e] - v[c]) * (y - v[e + 1])) / d;
    const l2 = ((v[e + 1] - v[a + 1]) * (x - v[e]) + (v[a] - v[e]) * (y - v[e + 1])) / d;
    const l3 = 1 - l1 - l2;
    if (l1 >= -1e-4 && l2 >= -1e-4 && l3 >= -1e-4) return l1 * v[a + 2] + l2 * v[c + 2] + l3 * v[e + 2];
  }
  return null;
}
/** The highest point of building b's roof faces, above sea level. */
export function roofMeshTop(b: Building): number {
  let top = b.g + b.h;
  const v = b.rm?.v ?? [];
  for (let i = 2; i < v.length; i += 3) top = Math.max(top, v[i]);
  return top;
}
/** Building b's main pitched roof, or null for a flat one. */
export function roofFit(b: Building): Roof | null {
  return roofsFit(b)[0] ?? null;
}

const SEAM = 0.25;    // metres: the widest slit closed between two edges lying along each other
/** Where building b's roof faces leave an open edge, the strips that close it (four corners, x, y
 *  and height above sea level each, twelve numbers a strip). The map's roofs come with walls in
 *  only some of their steps, and the points' rounding opens slits a hand's width wide between
 *  faces and between a face and its wall top, so each open edge is joined to the open edge or wall
 *  top lying along it: a wall where the two meet at different heights, a thin strip across a slit.
 *  tools/check_map.py (rule 11) does the same to count what is left open: keep the two in step. */
export function roofSeams(b: Building): number[] {
  const m = b.rm;
  if (!m) return [];
  const v = m.v, t = m.t, n = v.length / 3, uses = new Map<number, number>();
  for (let i = 0; i < t.length; i += 3) for (const [a, c] of [[t[i], t[i + 1]], [t[i + 1], t[i + 2]], [t[i + 2], t[i]]]) {
    const k = Math.min(a, c) * n + Math.max(a, c);
    uses.set(k, (uses.get(k) ?? 0) + 1);
  }
  // [x0, y0, z0, x1, y1, z1, whether it is a wall top]
  const edges: [number, number, number, number, number, number, boolean][] = [];
  for (const [k, u] of uses) if (u === 1) {
    const a = Math.floor(k / n), c = k % n;
    edges.push([v[3 * a], v[3 * a + 1], v[3 * a + 2], v[3 * c], v[3 * c + 1], v[3 * c + 2], false]);
  }
  b.r.forEach((ring, ri) => ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length], z = m.z[ri];
    if (z && z[2 * i + 1] !== undefined) edges.push([p[0], p[1], z[2 * i], q[0], q[1], z[2 * i + 1], true]);
  }));
  const out: number[] = [];
  for (let i = 0; i < edges.length; i++) {
    const [ax, ay, az, bx, by, bz, wa] = edges[i];
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 0.05) continue;
    const ux = (bx - ax) / L, uy = (by - ay) / L;
    for (let j = i + 1; j < edges.length; j++) {
      const [cx, cy, cz, dx, dy, dz, wb] = edges[j];
      if (wa && wb) continue;
      const M = Math.hypot(dx - cx, dy - cy);
      if (M < 0.05 || Math.abs(ux * (dy - cy) - uy * (dx - cx)) / M > 0.1) continue;
      const sc = (cx - ax) * ux + (cy - ay) * uy, sd = (dx - ax) * ux + (dy - ay) * uy;
      const lo = Math.max(0, Math.min(sc, sd)), hi = Math.min(L, Math.max(sc, sd));
      if (hi - lo < 0.05) continue;
      const onE = (s: number) => [ax + ux * s, ay + uy * s, az + ((bz - az) * s) / L];
      const onF = (s: number) => { const f = (s - sc) / (sd - sc); return [cx + (dx - cx) * f, cy + (dy - cy) * f, cz + (dz - cz) * f]; };
      const gap = (s: number) => { const e = onE(s), f = onF(s); return [f[2] - e[2], Math.hypot(f[0] - e[0], f[1] - e[1])]; };
      const [g0, w0] = gap(lo), [g1, w1] = gap(hi);
      if (w0 > SEAM || w1 > SEAM || Math.max(Math.abs(g0), Math.abs(g1), w0, w1) < 0.05) continue;
      // where the two cross in height, two strips meeting at a point rather than one twisted
      const cuts = g0 * g1 < 0 ? [lo, lo + ((hi - lo) * g0) / (g0 - g1), hi] : [lo, hi];
      for (let k = 0; k + 1 < cuts.length; k++) out.push(...onE(cuts[k]), ...onE(cuts[k + 1]), ...onF(cuts[k + 1]), ...onF(cuts[k]));
    }
  }
  return out;
}

/** Half the width the game draws a road of class c (as world.ts does), or w if it has its own width. */
export function roadHalf(c: string, w?: number): number {
  if (w) return w / 2;
  const RW: Record<string, number> = { trunk: 9, primary: 8.5, secondary: 8, tertiary: 7, residential: 6, unclassified: 5.5, living_street: 5, service: 3.5, unknown: 4, pedestrian: 6, footway: 1.6, steps: 1.8, cycleway: 2, path: 1.4, track: 2.8, bridleway: 2 };
  return (RW[c] ?? 4) / 2;
}
/** Streets with kerbs and a pavement each side, and how wide the pavement is. */
export const KERBED = new Set(["trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "living_street"]);
export const PAVE = 1.7;
/** How far a bridge's deck reaches each side of the road's centre line: the carriageway and its
 *  pavements as they're drawn (its own width and pavements where the map gives them), or a path
 *  and its verge. The deck is built, drawn and stood on out to here, to its parapets, so no part
 *  of the street drawn on a bridge has nothing under it. */
export function deckHalf(r: { c: string; w?: number; pv?: number[]; dk?: number | number[] }): number {
  if (Array.isArray(r.dk)) return Math.max(...r.dk);
  if (r.dk) return r.dk;
  const pave = KERBED.has(r.c) ? Math.max(0, ...(r.pv ?? [PAVE, PAVE])) : r.w ? 0 : 0.3;
  return Math.max(roadHalf(r.c) + (KERBED.has(r.c) ? PAVE : 0.3), roadHalf(r.c, r.w) + pave);
}
/** How far the deck reaches to the left and to the right of the road's line: one side can stop at
 *  its kerb while the other carries a pavement, with each parapet at its own edge. */
export function deckSides(r: { c: string; w?: number; pv?: number[]; dk?: number | number[] }): [number, number] {
  if (Array.isArray(r.dk) && r.dk.length === 2) return [r.dk[0], r.dk[1]];
  const h = deckHalf(r);
  return [h, h];
}
/** Does the map mark this road's bridge span point by point (newer builds of tools/prep_map.py)? */
export function spanMarked(r: Road): boolean { return !!r.marked || r.p.some((q) => q[3] === 1 || q[3] === 2); }
/**
 * Which of a road's points are on a bridge: 1 on a span the bridge is built for, 2 on the deck of
 * a bridge beside it (built for by the road it rides on), 0 on the ground. The map marks them on
 * newer builds (and then a road with none marked has none). On an older map's road, a span is
 * found where the road stands well clear of the ground under it (a good three metres, for two
 * points running, so a riverside path on its embankment above the bank doesn't grow parapets),
 * then taken out both ways to where the road meets the ground, so the deck reaches the banks
 * rather than stopping over the water.
 */
export function spanFlags(r: Road, ground: (x: number, z: number) => number, z0: number): number[] {
  const p = r.p, n = p.length;
  if (spanMarked(r)) return p.map((q) => (q[3] === 1 || q[3] === 2 ? q[3] : 0));
  const clear = p.map((q) => q[2] - z0 - ground(q[0], -q[1])), out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; ) {
    if (clear[i] <= 3) { i++; continue; }
    let j = i;
    while (j + 1 < n && clear[j + 1] > 3) j++;
    if (j > i) {
      let a = i, b = j;
      while (a > 0 && clear[a - 1] > 0.3) a--;
      while (b < n - 1 && clear[b + 1] > 0.3) b++;
      for (let k = a; k <= b; k++) out[k] = 1;
    }
    i = j + 1;
  }
  return out;
}
/** The height (scene Y) a road is walked and drawn at, at point i: its own on a bridge, the ground elsewhere. */
export function deckTop(q: number[], flag: number, ground: (x: number, z: number) => number, z0: number): number {
  return flag ? q[2] - z0 : ground(q[0], -q[1]);
}
/**
 * The spans of a bridge: ranges [a, b] of the road's point indexes, each from the abutment at one
 * end to the abutment at the other (the point before and after the ones on the bridge).
 * structural: only the spans the bridge is built for, not a path riding on a road's deck beside it.
 */
export function bridgeSpans(r: Road, flags: number[], structural = false): [number, number][] {
  const n = r.p.length, out: [number, number][] = [];
  const on = flags.map((f) => (structural ? f === 1 : f > 0));
  for (let i = 0; i < n; ) {
    if (!on[i]) { i++; continue; }
    let j = i;
    while (j + 1 < n && on[j + 1]) j++;
    const a = Math.max(0, i - 1), b = Math.min(n - 1, j + 1);
    if (b > a) out.push([a, b]);
    i = j + 1;
  }
  return out;
}

/**
 * Walls, fences and hedges (lines of [x, y, z]) with gaps cut wherever one crosses a street's
 * carriageway or a path (a wall running alongside a path is kept), and, given a box, any length
 * lying along or beyond its edges left out.
 */
/** spent: the caller's slice clock (GameMap.spent), so this long job yields with the rest of the
 *  square's setup instead of running to the end in one frame. */
function* clearOfRoads(lines: Line[], roads: Road[], box: number[] | null, extra: { p: number[][]; half: number }[] = [], spent?: () => boolean): Generator<void, Line[]> {
  const G = 8, cells = new Map<number, number[][]>();
  const ways = [...roads.map((r) => ({ p: r.p, half: roadHalf(r.c, (r as Road).w) + (PATHS.has(r.c) ? 0.4 : 0.2), path: PATHS.has(r.c) ? 1 : 0 })), ...extra.map((e) => ({ ...e, path: 0 }))];
  for (const r of ways) {
    if (spent?.()) yield;
    const path = r.path, half = r.half;
    for (let i = 0; i < r.p.length - 1; i++) {
      if (spent?.()) yield;
      const a = r.p[i], b = r.p[i + 1], seg = [a[0], a[1], b[0], b[1], half, path], seen = new Set<number>();
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (G / 2)));
      for (let s = 0; s <= n; s++) {
        const x = a[0] + (b[0] - a[0]) * s / n, y = a[1] + (b[1] - a[1]) * s / n;
        for (let ci = Math.floor((x - half) / G); ci <= Math.floor((x + half) / G); ci++)
          for (let cj = Math.floor((y - half) / G); cj <= Math.floor((y + half) / G); cj++) {
            const k = key(ci, cj);
            if (!seen.has(k)) { seen.add(k); push2(cells, k, seg); }
          }
      }
    }
  }
  // ux, uy: which way the wall runs here. On a path only a wall crossing it (more than 25° off
  // its line) is cut, not one running along its side.
  const onRoad = (x: number, y: number, ux: number, uy: number) => {
    // (and nothing past the box's edge, where the square beyond has its own walls and streets this map doesn't know)
    if (box && (x < box[0] + 0.6 || x > box[2] - 0.6 || y < box[1] + 0.6 || y > box[3] - 0.6)) return true;
    for (const [ax, ay, bx, by, half, path] of cells.get(key(Math.floor(x / G), Math.floor(y / G))) ?? []) {
      const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1, t = Math.min(1, Math.max(0, ((x - ax) * vx + (y - ay) * vy) / l2));
      if (Math.hypot(x - ax - vx * t, y - ay - vy * t) >= half) continue;
      if (!path || Math.abs(ux * vy - uy * vx) / Math.sqrt(l2) > 0.42) return true;
    }
    return false;
  };
  yield;
  const out: Line[] = [];
  for (let li = 0; li < lines.length; li++) {
    const l = lines[li];
    if (spent?.()) yield;
    // walk the line half a metre at a time, keeping the stretches off the streets
    let run: number[][] = [];
    const end = () => { if (run.length > 1 && Math.hypot(run[run.length - 1][0] - run[0][0], run[run.length - 1][1] - run[0][1]) > 0.4) out.push({ c: l.c, p: run }); run = []; };
    for (let i = 0; i < l.p.length - 1; i++) {
      const a = l.p[i], b = l.p[i + 1], dl = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(dl / 0.5));
      const ux = (b[0] - a[0]) / (dl || 1), uy = (b[1] - a[1]) / (dl || 1);
      for (let s = i ? 1 : 0; s <= n; s++) {
        const q = [a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n, a[2] + (b[2] - a[2]) * s / n];
        if (onRoad(q[0], q[1], ux, uy)) { end(); continue; }
        // keep the line's own corners; in between, only where a stretch starts or ends
        if (s === n || s === 0 || !run.length) run.push(q);
        else if (onRoad(a[0] + (b[0] - a[0]) * (s + 1) / n, a[1] + (b[1] - a[1]) * (s + 1) / n, ux, uy)) run.push(q);
      }
    }
    end();
  }
  return out;
}
function push2(m: Map<number, number[][]>, k: number, v: number[]) { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); }

function ringArea(ring: number[][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(a) / 2;
}

/** Is (x, y) inside the ring of points? */
function inRing(ring: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A line (data coords) moved sideways by o metres (left is positive), with mitred corners. */
export function offsetLine(p: number[][], by: number | ((i: number) => number)): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)], c = p[i];
    let nx = 0, ny = 0;
    for (const [u, v] of [[a, c], [c, b]]) {
      const dx = v[0] - u[0], dy = v[1] - u[1], l = Math.hypot(dx, dy);
      if (l > 1e-6) { nx += -dy / l; ny += dx / l; }
    }
    const nl = Math.hypot(nx, ny) || 1, o = typeof by === "number" ? by : by(i);
    out.push([c[0] + (nx / nl) * o, c[1] + (ny / nl) * o]);
  }
  return out;
}

function key(i: number, j: number) { return (i + 2048) * 4096 + (j + 2048); }
function push(m: Map<number, number[]>, k: number, v: number) { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); }

/** Distance along a horizontal ray (o + t*d, d not normalised in 2D) to segment a-b, or -1. */
/** Where a horizontal ray first meets a wall's face, `half` either side of its line a to b (its line
 *  itself for a thin one), or -1. */
export function rayThickSeg(ox: number, oz: number, dx: number, dz: number, ax: number, az: number, bx: number, bz: number, half: number): number {
  if (half <= 0) return raySeg(ox, oz, dx, dz, ax, az, bx, bz);
  const vx = bx - ax, vz = bz - az, vl = Math.hypot(vx, vz) || 1, nx = -vz / vl * half, nz = vx / vl * half;
  const h1 = raySeg(ox, oz, dx, dz, ax + nx, az + nz, bx + nx, bz + nz), h2 = raySeg(ox, oz, dx, dz, ax - nx, az - nz, bx - nx, bz - nz);
  return h1 < 0 ? h2 : h2 < 0 ? h1 : Math.min(h1, h2);
}

export function raySeg(ox: number, oz: number, dx: number, dz: number, ax: number, az: number, bx: number, bz: number): number {
  const ex = bx - ax, ez = bz - az;
  const den = dx * ez - dz * ex;
  if (Math.abs(den) < 1e-9) return -1;
  const wx = ax - ox, wz = az - oz;
  const t = (wx * ez - wz * ex) / den;
  const u = (wx * dz - wz * dx) / den;
  return t >= 0 && u >= 0 && u <= 1 ? t : -1;
}

/** Where a horizontal ray (o + t*d) first enters a vehicle's box from outside, and the side's normal, or null. */
/**
 * Where a ray first goes into a mover's box, from the ground up to its waist: through a side or an
 * end, or down onto its top (the bonnet, the boot). Nothing if it starts over the box (you're in
 * it, or standing on it).
 */
function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, m: Mover): { t: number; nx: number; ny: number; nz: number } | null {
  const c = Math.cos(m.a), s = Math.sin(m.a);
  const ou = (ox - m.x) * c - (oz - m.z) * s, ow = (ox - m.x) * s + (oz - m.z) * c;
  if (Math.abs(ou) < m.hl && Math.abs(ow) < m.hw) return null;
  const du = dx * c - dz * s, dw = dx * s + dz * c;
  const mid = (m.y + m.waist) / 2, hh = (m.waist - m.y) / 2;
  let t0 = -Infinity, t1 = Infinity, nu = 0, nw = 0, ny = 0;
  for (const [o, d, h, axis] of [[ou, du, m.hl, 0], [ow, dw, m.hw, 1], [oy - mid, dy, hh, 2]]) {
    if (Math.abs(d) < 1e-9) { if (Math.abs(o) > h) return null; continue; }
    let a = (-h - o) / d, b = (h - o) / d, n = -1;
    if (a > b) { [a, b] = [b, a]; n = 1; }
    if (a > t0) { t0 = a; nu = axis === 0 ? n : 0; nw = axis === 1 ? n : 0; ny = axis === 2 ? n : 0; }
    t1 = Math.min(t1, b);
  }
  if (t0 > t1 || t0 < 0) return null;
  return { t: t0, nx: nu * c + nw * s, ny, nz: -nu * s + nw * c };
}

export function rayCircle(ox: number, oz: number, dx: number, dz: number, cx: number, cz: number, r: number): number {
  const fx = ox - cx, fz = oz - cz;
  const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-12) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 ? t : -1;
}

/** The id of the map carried inline by the single-file build, if this is that build. */
export function inlineMapId(): string | null {
  return document.getElementById("mapdata")?.dataset.map ?? null;
}

/** Load a map, and the wider map round it from wideUrl if it has one, and the layout of its
 *  full-detail squares from tilesDir + "tiles.json" if it has those. */
export async function loadMap(url: string, wideUrl?: string, tilesDir?: string): Promise<GameMap> {
  // the single-file build carries its one map inline, and no wider map
  const inline = document.getElementById("mapdata");
  if (inline?.textContent) { const d = JSON.parse(inline.textContent); unpackSurfaces(d); maskSetPieces(d); return new GameMap(d); }
  const index = tilesDir ? fetch(`${tilesDir}tiles.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
  // the canal and the railways: optional, small, and only there for maps that have them
  const extra = (end: string) => fetch(url.replace(/\.json$/, end)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [res, wide, tiles, canal, rail, cable, kinds] = await Promise.all([fetch(url), wideUrl ? loadWide(wideUrl) : null, index, extra("-canal.json"), extra("-rail.json"), extra("-cable.json"),
    tilesDir ? loadGroundKinds(url.replace(/\.json$/, "-ground.json")) : null]);
  if (!res.ok) throw new Error(`Could not load the map (${res.status})`);
  // the set pieces hide what the map tools built where they stand (landmarks/setpieces.ts)
  const d = await res.json();
  unpackSurfaces(d);
  maskSetPieces(d);
  const map = new GameMap(d, wide, false, canal?.runs ? canal : null, rail?.tracks ? rail : null, cable?.st ? cable : null);
  if (wide && tiles?.tiles) { map.tileIndex = tiles; map.tileBase = tilesDir!; map.groundKinds = kinds; }
  return map;
}

/**
 * Experiment (?adapt=0.3): a square built on a 2 m ground grid is drawn at 4 m wherever 4 m is
 * within that many metres of it, and at 2 m only where it isn't (the street edges, banks and walls).
 * The 2 m points of a cell drawn at 4 m are moved onto its two triangles, so the ground you walk
 * on is the ground that's drawn, and the edge of a square is always straight from one 4 m point to
 * the next, so it meets a square next door built at 4 m.
 */
function adaptGrid(T: MapData["t"]): Uint8Array | null {
  const th = Number(typeof location !== "undefined" ? new URLSearchParams(location.search).get("adapt") ?? "0.3" : "0.3");
  if (T.dx > 3 || (T.nx - 1) % 2 || (T.ny - 1) % 2 || !(th > 0)) return null;
  const n = T.nx, cw = (T.nx - 1) / 2, ch = (T.ny - 1) / 2, h = T.h as number[];
  const at = (i: number, j: number) => j * n + i;
  // each 2 m point between the 4 m ones, as the 4 m triangles (a, b, c / b, d, c) would have it
  const plane = (ci: number, cj: number, u: number, v: number) => {
    const A = h[at(2 * ci, 2 * cj)], B = h[at(2 * ci + 2, 2 * cj)], C = h[at(2 * ci, 2 * cj + 2)], D = h[at(2 * ci + 2, 2 * cj + 2)];
    return u + v <= 1 ? A + (B - A) * u + (C - A) * v : D + (C - D) * (1 - u) + (B - D) * (1 - v);
  };
  const MID = [[0.5, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0.5, 1]];
  const R = new Uint8Array(cw * ch);
  for (let cj = 0; cj < ch; cj++) for (let ci = 0; ci < cw; ci++) {
    let e = 0;
    for (const [u, v] of MID) e = Math.max(e, Math.abs(h[at(2 * ci + 2 * u, 2 * cj + 2 * v)] - plane(ci, cj, u, v)));
    if (e > th * 10) R[cj * cw + ci] = 1;
  }
  const isR = (ci: number, cj: number) => ci >= 0 && cj >= 0 && ci < cw && cj < ch && R[cj * cw + ci] === 1;
  // flatten every 2 m point that no refined cell needs (and the square's edge, always)
  for (let cj = 0; cj < ch; cj++) for (let ci = 0; ci < cw; ci++) {
    if (isR(ci, cj)) continue;
    for (const [u, v] of MID) {
      const i = 2 * ci + 2 * u, j = 2 * cj + 2 * v;
      const other = u === 0.5 && v === 0.5 ? false : u === 0.5 ? isR(ci, v === 0 ? cj - 1 : cj + 1) : isR(u === 0 ? ci - 1 : ci + 1, cj);
      if (!other) h[at(i, j)] = plane(ci, cj, u, v);
    }
  }
  for (let ci = 0; ci < cw; ci++) for (const cj of [0, ch - 1]) { const v = cj === 0 ? 0 : 1; h[at(2 * ci + 1, 2 * cj + 2 * v)] = plane(ci, cj, 0.5, v); }
  for (let cj = 0; cj < ch; cj++) for (const ci of [0, cw - 1]) { const u = ci === 0 ? 0 : 1; h[at(2 * ci + 2 * u, 2 * cj + 1)] = plane(ci, cj, u, 0.5); }
  // a cell is drawn at 2 m where it, or a cell beside it, is refined
  const F = new Uint8Array(cw * ch);
  for (let cj = 0; cj < ch; cj++) for (let ci = 0; ci < cw; ci++)
    if (isR(ci, cj) || isR(ci - 1, cj) || isR(ci + 1, cj) || isR(ci, cj - 1) || isR(ci, cj + 1)) F[cj * cw + ci] = 1;
  (globalThis as any).__fineShare = [...((globalThis as any).__fineShare ?? []), F.reduce((s, v) => s + v, 0) / F.length];
  return F;
}
