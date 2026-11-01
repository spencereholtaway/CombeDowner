// Set pieces: hand-made models of Bath's great buildings (the Abbey, Pulteney Bridge, the Roman
// Baths with the Pump Room, Pulteney Bridge's streets (Argyle Street, Great Pulteney Street and
// Grand Parade), the Holburne Museum, the Empire Hotel, Sham Castle, Prior Park, Kingswood School,
// the Bell Inn on Walcot Street, Grenville's monument on Lansdown, Bath Spa station and the Dundas Aqueduct), and of Cape
// Town's (the Castle of Good Hope, City Hall, St George's Cathedral, the Auwal Mosque, and at the V&A
// Waterfront the Clock Tower, the Cape Wheel, Zeitz MOCAA and the boats moored in the harbour) standing in for the plain
// scenery the map tools build there.
//
// The map is never changed for them. The tools (tools/prep_tiles.py) go on building every square
// of Bath the same way, and a set piece only hides what they built there. As each part of the map
// loads (the first area, map.ts; each square of Bath, tiles.ts), and before the game builds
// anything from it, everything the tools put inside a set piece's outline is left out of the
// game's copy: buildings, trees, shrubs, walls, fences and hedges, gates, street furniture, doors,
// bay windows, shop signs, garden paths, footpaths, ponds, overhead wires, the woods' canopy and
// the map's own hand-made landmarks.
// The set piece is then added to the landmarks (map.d.lm) for world.ts to draw (landmarks/index.ts,
// in the square its origin is in) and map.ts to make solid (in every square it reaches into, so
// you bump into it from whichever square you're standing in). Streets and pedestrian streets are
// kept, as the traffic and everyone walking about need them (but a set piece with a yard of its own,
// the Bell's, takes the service lane up it too, and paves the yard itself). A pub's sign is kept as
// well, for the game to know the pub's there (pints and naughty boys turn up outside it: haunts.ts),
// marked as the set piece's own so the street furniture doesn't hang a second one (furniture.ts). A street the set piece carries over
// the river (Pulteney Bridge) keeps its deck to walk and drive on, but the plain bridge the game
// would build under it, and its parapets, are left to the set piece.
//
// Where a set piece needs the ground lower than the lidar has it (the Great Bath, down at the
// Roman level), it lowers the terrain inside rectangles of its own, in the game's copy of the
// square: never a point of the terrain that a kept street, pavement or path is drawn over, so the
// streets round it stay exactly as they were. The set piece has to cover the slope from its
// lowered ground up to the ground round about. The one exception is a rectangle marked street,
// for a building whose front stands on the pavement (the Bell's bar): the terrain is only a point
// every 4 m, so the point that holds up the pavement's inner edge can be 2 m inside, under the
// floor, where the lidar has it higher than the street. Such a point comes down too, but never
// below the street's own level, so the pavement still has its ground under it.
//
// So a rebuilt map, or a new area, needs nothing doing here: a set piece's place is longitude,
// latitude and a bearing, and its outline catches whatever the tools build there next time. A new
// set piece is an entry in SET_PIECES and a builder in landmarks/ (its kind in SET_PIECE_KINDS in
// landmarks/index.ts); it's solid as it's drawn (landmarks/shape.ts). Its heights are fixed
// (metres above sea level, as the lidar has the ground there) or worked out from what every
// square sees alike (the streets), so it stands the same in every square it reaches into.
//
// Nothing here goes over the network: every player masks the squares they load the same way.
import type { MapData, Road } from "../map";
import { KERBED, PAVE, roadHalf } from "../map";
import { BATHS_SINK } from "./baths";
import { terraceArgs } from "./terraces";
import { paradeArgs } from "./grandparade";
import { WINGS_Y, WEST_WING, EAST_WING } from "./priorpark";
import { KINGSWOOD_Y, KINGSWOOD, KINGSWOOD_CHAPEL } from "./kingswood";
import { BELL_SINK } from "./bell";
import { BATHSPA_OUTLINE, BATHSPA_COVERS, BATHSPA_SINK } from "./bathspa";
import { BOA_COVERS } from "./bradford";
import { CASTLE_Y, CASTLE_OUTLINE } from "./castle";
import { CITY_HALL_Y } from "./cityhall";
import { ST_GEORGES_Y } from "./stgeorges";
import { AUWAL_Y } from "./auwal";
import { CLOCK_TOWER, CAPE_WHEEL, ZEITZ, ZEITZ_SINK, ALFRED_BOATS, FERRY_BOATS } from "./waterfront";

type LonLat = [number, number];
type Sink = { x0: number; x1: number; z0: number; z1: number; y: number; street?: boolean; fill?: boolean };

/** What a set piece knows about where it stands, in the square being masked. Coordinates are in
 *  its own frame: x along it, z out of its front. */
export interface PlaceCtx {
  /** The buildings it hid here: their names, middles, extents (x0, x1, z0, z1) and the heights
   *  of their ground and their eaves, above sea level. */
  hidden: { name: string; x: number; z: number; box: [number, number, number, number]; ground: number; top: number }[];
  /** The streets it carries on a bridge of its own (their points in its frame: x, z, height above its origin). */
  held: number[][][];
  /** The level of the water under its origin, above sea level, if it stands in a river or a pond. */
  water: number | null;
  /** The ground's height at its origin, above sea level, as the square's terrain has it. */
  ground: number;
  /** Its frame's x, z of data x, y. */
  local: (x: number, y: number) => [number, number];
  /** The level of the water at x, z in its frame, above sea level, if that's in a river or a pond. */
  waterAt: (x: number, z: number) => number | null;
  d: MapData;
}

export interface SetPiece {
  /** What it is, for the console. */
  name: string;
  /** The landmark builder that draws it (landmarks/index.ts). */
  kind: string;
  /** Where its origin is, longitude and latitude, and which way its length (the model's x) runs,
   *  in degrees east of north. Its front (the model's +z) is 90 degrees clockwise of that. */
  at: LonLat;
  bearing: number;
  /** Its origin's height above sea level (the model's y = 0), fixed or worked out where it stands. */
  height: number | ((c: PlaceCtx) => number);
  /** What it stands in for, in its own frame: everything the tools built inside this outline goes. */
  outline: [number, number][];
  /** More outlines, for a set piece in parts (both sides of a street, leaving the street itself). */
  more?: [number, number][][];
  /** Where it's solid all the way through, in its own frame (x0, x1, z0, z1), for spawning and
   *  pubs to keep out of (map.indoors). Its whole outline, if not given. */
  covers?: [number, number, number, number][];
  /** Its builder's args, worked out where it stands. */
  args?: (c: PlaceCtx, height: number) => (number | string)[];
  /** Ground it lowers, rectangles in its own frame, to y above its origin; street: to the
   *  street's level (no lower) where a street's edge holds the ground up (see above); fill:
   *  instead raised to the street's level wherever a street is drawn over it, inside its
   *  outline or not (a street between the set piece's two sides, over the lidar's dips where
   *  basements and the river bank show through). */
  sink?: Sink[];
  /** It's a pub, and hangs its own sign: the map's sign for it stays, marked as its own. */
  pub?: boolean;
  /** The street it carries through it, which the map has in pieces that don't agree (a pedestrian
   *  street paved wall to wall here, a lane with no pavements there, each its own width): every
   *  piece of a street with one of these names, from x0 to x1 along its frame and within zMax of
   *  its middle, is laid as one street, a carriageway carriage metres wide with a kerbed pavement
   *  each side, as wide as pave says for where it is ([from x, to x, width], the pieces split
   *  where that changes), or, past x0 where the street is wider, what's left of its own width
   *  either side of the carriageway, so it runs on with the same kerbs from end to end.
   *  It's then a street with traffic, as it is (the map has buses-only streets as pedestrian). */
  street?: { names: string[]; x0: number; x1: number; zMax: number; carriage: number; pave: [number, number, number][] };
  /** It stands in for one of the canal's aqueducts, which the canal then doesn't draw (canal.ts). */
  aqueduct?: boolean;
  /** It has a yard of its own: the service lanes inside it go with everything else. */
  yard?: boolean;
}

// ---- Bath's set pieces --------------------------------------------------------------------------

export const SET_PIECES: SetPiece[] = [
  {
    // landmarks/abbey.ts. The origin: the middle of the nave's width, halfway along the church.
    // The floor a touch above the highest ground inside it (24.7 m), with steps up to the west door.
    name: "Bath Abbey", kind: "abbey", at: [-2.358847, 51.3814293], bearing: 82.4, height: 24.85,
    outline: [[-35.6, -13.8], [0.9, -13.8], [0.9, -21.4], [13.3, -21.4], [13.3, -14.3], [35.3, -14.3], [35.3, 20.2],
      [18.6, 20.2], [11.1, 23.5], [0.6, 23.6], [0.6, 19.6], [-29.1, 19.6], [-29.1, 13.7], [-35.6, 13.7]],
    sink: [{ x0: -34, x1: 33.7, z0: -12, z1: 12, y: -0.15 }, { x0: 2.5, x1: 11.5, z0: -19.8, z1: 19.8, y: -0.15 }],
  },
  {
    // landmarks/pulteney.ts. The origin: the middle of the bridge, at the river's level.
    name: "Pulteney Bridge", kind: "pulteney", at: [-2.357923, 51.38304], bearing: 60,
    height: (c) => c.water ?? 15.6,
    // its street, from Bridge Street over the bridge and along Argyle Street to Laura Place: one
    // carriageway between the shopfronts and the terraces, with a pavement each side
    street: { names: ["Bridge Street", "Argyle Street"], x0: -20.4, x1: 117, zMax: 6, carriage: 6.0, pave: [[-20.4, 20.4, 1.75], [20.4, 117, 3.0]] },
    outline: [[-25.3, -10.4], [20.9, -10.4], [20.9, 12.2], [-20.7, 12.2], [-20.7, -3.2], [-25.3, -3.2]],
    covers: [[-24.9, 20.4, -9.8, -3.4], [-20.4, 20.4, 6.1, 10.5]],
    args: (c, h) => {
      // the street over it: its height along the bridge (fitted straight through its points on
      // the span), and where its middle runs
      const pts = c.held.flat().filter((q) => Math.abs(q[0]) < 26);
      let deckW = 9.2, deckE = 9.2, mid = 1.3;
      if (pts.length >= 2) {
        const n = pts.length, sx = pts.reduce((a, q) => a + q[0], 0), sy = pts.reduce((a, q) => a + q[2], 0);
        const sxx = pts.reduce((a, q) => a + q[0] * q[0], 0), sxy = pts.reduce((a, q) => a + q[0] * q[2], 0);
        const den = n * sxx - sx * sx, slope = den ? (n * sxy - sx * sy) / den : 0, at0 = (sy - slope * sx) / n;
        deckW = at0 - slope * 20.4; deckE = at0 + slope * 20.4;
        mid = pts.reduce((a, q) => a + q[1], 0) / n;
      }
      void h;
      // the shops the map names on the bridge, along each side
      const shops = c.hidden.filter((b) => b.name && b.x > -25.5 && b.x < 21.5).sort((a, b) => a.z - b.z || a.x - b.x);
      return [+deckW.toFixed(2), +deckE.toFixed(2), +mid.toFixed(2), ...shops.flatMap((b) => [+b.x.toFixed(1), b.z > mid ? 1 : -1, b.name])];
    },
  },
  {
    // landmarks/baths.ts. The origin: the middle of the Great Bath, at the Roman level (the
    // court's floor), set from the lidar's churchyard (24.7 m) and the Great Bath's water (21.2 m).
    name: "Roman Baths", kind: "baths", at: [-2.359472, 51.380958], bearing: 73.6, height: 21.6,
    outline: [[-45.8, -38.2], [12, -38.2], [16.5, -34], [18, -22.6], [18, 10.3], [-43.5, 10.3], [-45.8, 8]],
    sink: BATHS_SINK,
  },
  {
    // landmarks/terraces.ts. The origin: the street's middle at Laura Place, at its level
    // there. Its outlines take in the terraces along both sides (not the street between them), as
    // far as Sydney Place; the blocks are rebuilt from what they hide.
    name: "Great Pulteney Street", kind: "terraces", at: [-2.3561904, 51.3836327], bearing: 57.3, height: 25.2,
    outline: [[-1, -36], [362, -36], [362, -12], [-1, -12]],
    more: [[[-1, 12], [362, 12], [362, 36], [125, 36], [125, 48], [-1, 48]]],
    args: terraceArgs("Great Pulteney Street", 0),
  },
  {
    // landmarks/terraces.ts, in the shopping street's style. In Pulteney Bridge's frame (x on
    // along the bridge into Argyle Street, z downstream), from the bridge's end to Laura Place.
    name: "Argyle Street", kind: "terraces", at: [-2.357923, 51.38304], bearing: 60, height: 25.2,
    outline: [[21, -26], [113, -26], [113, -5], [21, -5]],
    more: [[[21, 4], [113, 4], [113, 30], [21, 30]]],
    // the street level with the bridge from its end, pavements and all (the lidar's ground
    // drops away at the corners, to the river bank and the terraces' basements)
    sink: [{ x0: 20.5, x1: 113, z0: -7, z1: 8, y: 0, fill: true }],
    args: terraceArgs("Argyle Street", 1, [20.4, 63]),
  },
  {
    // landmarks/grandparade.ts. The origin: the middle of Grand Parade where it leaves the bridge,
    // at its level there. The outline is the strip along the river's edge and its pavement (the
    // set piece lays its own), not the street.
    name: "Grand Parade", kind: "colonnade", at: [-2.3581902, 51.3828459], bearing: 143.4, height: 25.6,
    outline: [[5, -16], [104, -16], [104, -6.5], [5, -6.5]],
    args: paradeArgs,
  },
  {
    // landmarks/grandparade.ts, in Grand Parade's frame.
    name: "Empire Hotel", kind: "empire", at: [-2.3581902, 51.3828459], bearing: 143.4, height: 25.6,
    outline: [[49, 4.3], [96.5, 4.3], [96.5, 46], [49, 46]],
  },
  {
    // landmarks/shamcastle.ts. The origin: the middle of the wall, its front looking west to Bath.
    // At the lidar's ground there.
    name: "Sham Castle", kind: "sham", at: [-2.3375197, 51.3823083], bearing: 199.6, height: (c) => c.ground,
    outline: [[-14, -3], [14, -3], [14, 4], [-14, 4]],
  },
  {
    // landmarks/holburne.ts. The origin: the middle of the house, at the ground in front of it,
    // its front looking down Great Pulteney Street.
    name: "Holburne Museum", kind: "holburne", at: [-2.3508842, 51.3857945], bearing: 147.3, height: 26.1,
    outline: [[-19.4, -16.7], [19.4, -16.7], [19.4, 21], [-19.4, 21]],
  },
  {
    // landmarks/priorpark.ts. The origin: the middle of the mansion, at its main floor, the level
    // of the drive behind it (the lidar's ground there is 140 m, and 136.5 m at the front). Its
    // length runs west-south-west, so its front looks north-north-west down the valley to Bath.
    // The outline takes in the house, the portico and its steps, not the wings and their links
    // either side; the map's own porticos there go with it.
    name: "Prior Park", kind: "priorpark", at: [-2.3429515, 51.364536], bearing: 249.9, height: 140.3,
    outline: [[-24.6, -11.6], [24.6, -11.6], [24.6, 9.9], [9.4, 9.9], [9.4, 27], [-9.4, 27], [-9.4, 9.9], [-24.6, 9.9]],
    covers: [[-24, 24, -10.6, 9.9], [-8.8, 8.8, 9.9, 15.8]],
  },
  {
    // landmarks/priorpark.ts, in the mansion's frame: the wings either side, and the links to them.
    // The outlines are the map's buildings there, a little wider; the mansion is its own.
    name: "Prior Park's wings", kind: "priorwings", at: [-2.3429515, 51.364536], bearing: 249.9, height: WINGS_Y,
    outline: WEST_WING, more: [EAST_WING],
  },
  {
    // landmarks/kingswood.ts. The origin: the middle of the tower over the entrance, at the ground
    // at its foot; its front looks east-north-east over the valley. The chapel is in its frame too.
    name: "Kingswood School", kind: "kingswood", at: [-2.3698235, 51.3988271], bearing: 333.7, height: KINGSWOOD_Y,
    outline: KINGSWOOD, more: [KINGSWOOD_CHAPEL],
  },
  {
    // landmarks/bell.ts. The origin: the middle of the house's front, at the bar's floor, a step
    // above the pavement (Walcot Street is at 29.8 m there); its length runs north along the street,
    // so its front looks east across it. The outline takes in the house, the old stables and the
    // yard beside them, the garden and the back range behind, up to the foot of the Paragon's
    // gardens, and the strip in front down to the pavement.
    name: "The Bell Inn", kind: "bell", at: [-2.3592966, 51.3875469], bearing: 2.6, height: 30.15,
    outline: [[-24.7, 1.3], [6.9, 1.3], [6.9, -23], [-24.7, -23]],
    sink: BELL_SINK, pub: true, yard: true,
  },
  {
    // landmarks/grenville.ts. The origin: the middle of Sir Bevil Grenville's monument on Lansdown
    // (Historic England's grid reference, ST 72189 70345), at the lidar's ground there; its front
    // looks west-north-west, to the lane. Out past Bath's circle, in the force field's strip up
    // Bath Road (map.ts).
    name: "Grenville's monument", kind: "grenville", at: [-2.4014397, 51.4314187], bearing: 200, height: (c) => c.ground,
    outline: [[-2.4, -2.4], [2.4, -2.4], [2.4, 2.4], [-2.4, 2.4]],
  },
  {
    // landmarks/bathspa.ts. The origin: the middle of the station building's front on the
    // forecourt, at the platforms' level (the track is laid level through the station at 25.87 m,
    // tools/railway.py, and the platforms are 0.93 m above it); its length runs west-south-west
    // along the front, so its front looks north-north-west over the forecourt to Dorchester Street.
    // The outline takes in the building, its east wing and the forecourt's canopy, both platforms
    // and their canopies, platform 1's back range and the track between, which it all hides; the
    // ground under it comes down where the lidar has it above the track and the platforms.
    name: "Bath Spa station", kind: "bathspa", at: [-2.3571824, 51.3776869], bearing: 245.26, height: 26.8,
    outline: BATHSPA_OUTLINE, covers: BATHSPA_COVERS, sink: BATHSPA_SINK,
  },
  {
    // landmarks/bradford.ts, on the Bradford-on-Avon map. The origin: between the tracks opposite
    // the station house, at the up platform's top; x runs east along the line.
    name: "Bradford-on-Avon station", kind: "boastation", at: [-2.2523079, 51.3448271], bearing: 80.9, height: 31.0,
    outline: [[-32, -13], [-8.5, -13], [-8.5, -16.5], [14, -16.5], [14, 11], [-32, 11]],
    covers: BOA_COVERS,
  },
  {
    // landmarks/dundas.ts. The origin: the middle of the aqueduct, at the canal's water (the long
    // pound's level, tools/canal.py); x runs along the canal from the south-east end towards the
    // junction with the Somerset Coal Canal. The canal draws no aqueduct of its own under it
    // (canal.ts), nor lowers the ground for one (aqueductBeds).
    name: "Dundas Aqueduct", kind: "dundas", at: [-2.3107931, 51.3614621], bearing: 290.04, height: 35.2,
    outline: [[-48, -9.5], [48, -9.5], [48, 9.5], [-48, 9.5]],
    covers: [[-42, 42, -5.5, 5.5]],
    aqueduct: true,
  },
  // ---- Cape Town's ----
  {
    // landmarks/castle.ts. The origin: the middle of the courtyard, at the street's level by the
    // gate; x runs along the curtain the gate is in, so the gate looks out (+z) towards the city.
    name: "Castle of Good Hope", kind: "castle", at: [18.4277849, -33.9258669], bearing: 148.1, height: CASTLE_Y,
    outline: CASTLE_OUTLINE,
    // and the forecourt before the gate, kept clear
    more: [[[-28, 77], [28, 77], [28, 92], [-28, 92]]],
  },
  {
    // landmarks/cityhall.ts. The origin: the middle of the front, at its ground floor; its front
    // looks north-east across Darling Street to the Grand Parade.
    name: "Cape Town City Hall", kind: "cityhall", at: [18.4239362, -33.9252294], bearing: 310.2, height: CITY_HALL_Y,
    outline: [[-43.5, -53.4], [43.6, -53.4], [43.6, 4], [-43.5, 4]],
  },
  {
    // landmarks/stgeorges.ts. The origin: the middle of the nave, at its floor; x runs along Wale
    // Street towards the apse, so the street is on the -z side.
    name: "St George's Cathedral", kind: "stgeorges", at: [18.4194271, -33.9248721], bearing: 130, height: ST_GEORGES_Y,
    outline: [[-38.5, -20.5], [36.5, -20.5], [36.5, 22.8], [-38.5, 22.8]],
  },
  {
    // landmarks/auwal.ts. The origin: the middle of the hall, at its floor; its front looks
    // north-east onto Dorp Street.
    name: "Auwal Mosque", kind: "auwal", at: [18.4149558, -33.9223308], bearing: 311.6, height: AUWAL_Y,
    outline: [[-15.8, -7.8], [16.2, -7.8], [16.2, 8.2], [-15.8, 8.2]],
  },
  {
    // landmarks/waterfront.ts. The origin: the middle of the octagon, at the quay (the lidar's
    // ground there); its front door looks west-south-west to the swing bridge over the Cut.
    name: "Clock Tower", kind: "clocktower", at: [18.4221629, -33.906479], bearing: 152.5, height: 2.0,
    outline: CLOCK_TOWER,
  },
  {
    // landmarks/waterfront.ts. The origin: under the axle, at the lidar's ground; x runs along the wheel's
    // face (north-east, with Breakwater Boulevard), its front looking south-east to the Victoria Wharf.
    name: "Cape Wheel", kind: "capewheel", at: [18.4192896, -33.9026834], bearing: 50.8, height: 5.4,
    outline: CAPE_WHEEL,
  },
  {
    // landmarks/waterfront.ts. The origin: the middle of the map's footprint, its floor between the
    // lidar's ground at its ends (6.5 to 8.5 m) and the hump in its middle (10 m), which it lowers;
    // x runs east along the silo's length, the tower at its west end, its front looking south over
    // Silo Square.
    name: "Zeitz MOCAA", kind: "zeitz", at: [18.4230013, -33.9084108], bearing: 84.3, height: 8.5,
    outline: ZEITZ, sink: ZEITZ_SINK,
  },
  {
    // landmarks/waterfront.ts. Boats moored along the Alfred Basin's edge west of the Clock Tower,
    // short of the swing bridge. The origin: on the quay's edge, at the sea's level; x runs along
    // the edge to the north-east, the water on the -z side.
    name: "Alfred Basin moorings", kind: "boats", at: [18.4216681, -33.9066291], bearing: 63.2, height: 0,
    outline: [[-41, -8.5], [34, -8.5], [34, -0.3], [-41, -0.3]],
    args: () => ALFRED_BOATS,
  },
  {
    // landmarks/waterfront.ts. The Robben Island ferry at the Nelson Mandela Gateway's quay, on the
    // Victoria Basin. The origin: on the quay's edge, at the sea's level, the water on the -z side.
    name: "Robben Island ferry", kind: "boats", at: [18.4227588, -33.9064953], bearing: 142.4, height: 0,
    outline: [[-16.5, -12], [16.5, -12], [16.5, -0.5], [-16.5, -0.5]],
    args: () => FERRY_BOATS,
  },
];

/** Does a set piece standing in for one of the canal's aqueducts (aqueduct: true) cover data
 *  (x, y), on the map whose centre is [lon0, lat0]? */
export function aqueductSetPieceAt(centre: [number, number], x: number, y: number): boolean {
  const [lon0, lat0] = centre, kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;
  for (const sp of SET_PIECES) {
    if (!sp.aqueduct) continue;
    const ox = (sp.at[0] - lon0) * kx, oy = (sp.at[1] - lat0) * ky;
    const a = ((90 - sp.bearing) * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
    const lx = (x - ox) * ux + (y - oy) * uy, lz = (x - ox) * uy - (y - oy) * ux;
    if (inRing(sp.outline, lx, lz)) return true;
  }
  return false;
}

// ---- the masking --------------------------------------------------------------------------------

/** Lay the pieces of a set piece's street as one street (SetPiece.street). local: its frame's x, z of data x, y. */
function layStreet(d: MapData, st: NonNullable<SetPiece["street"]>, local: (x: number, y: number) => [number, number]) {
  const paveAt = (x: number) => st.pave.find(([a, b]) => x >= a && x < b)?.[2];
  const out: Road[] = [];
  for (const r of d.rd) {
    const loc = r.p.map((q) => local(q[0], q[1]));
    // (the pieces of it here: most of their points along its line, within its ends' reach)
    const along = loc.filter(([x, z]) => Math.abs(z) < st.zMax && x > st.x0 - 40 && x < st.x1 + 1).length;
    if (!st.names.includes(r.n) || FOOTPATHS.has(r.c) || along < loc.length / 2) { out.push(r); continue; }
    // split where its pavements change width (sharing the point there)
    const pieces: number[][][] = [];
    let cur: number[][] = [r.p[0]], was = paveAt(loc[0][0]);
    for (let i = 1; i < r.p.length; i++) {
      cur.push(r.p[i]);
      const now = paveAt(loc[i][0]);
      if (now !== was && i < r.p.length - 1) { pieces.push(cur); cur = [r.p[i]]; }
      was = now;
    }
    pieces.push(cur);
    for (const p of pieces) {
      const xs = p.map((q) => local(q[0], q[1])[0]), mid = xs.reduce((a, b) => a + b, 0) / xs.length;
      const pave = paveAt(mid) ?? Math.max(st.pave[0][2], Math.min(4, ((r.w ?? 0) - st.carriage) / 2));
      out.push({ ...r, p, c: "unclassified", w: st.carriage, pv: [pave, pave], piece: mid >= st.x0 && mid <= st.x1 });
    }
  }
  d.rd = out;
}

const FACE_LISTS = ["road", "service", "pave", "path", "front", "drive", "grass", "dirt", "gravel"] as const;

/** Take a square's street faces (unpacked, sfpack.ts) and their outlines out where inside(x, y). */
function cutFaces(sf: NonNullable<MapData["sf"]>, inside: (x: number, y: number) => boolean) {
  const V = sf.v, mid = (ia: number[]) => inside(ia.reduce((t, i) => t + V[3 * i], 0) / ia.length, ia.reduce((t, i) => t + V[3 * i + 1], 0) / ia.length);
  for (const kind of FACE_LISTS) {
    const I = sf[kind];
    if (!I) continue;
    const keep: number[] = [];
    for (let k = 0; k + 2 < I.length; k += 3) if (!mid([I[k], I[k + 1], I[k + 2]])) keep.push(I[k], I[k + 1], I[k + 2]);
    if (keep.length < I.length) sf[kind] = Int32Array.from(keep);
  }
  sf.e = sf.e.flatMap((e) => {
    const out: { c: string; i: Int32Array }[] = [];
    let run: number[] = [e.i[0]];
    for (let k = 1; k < e.i.length; k++) {
      if (mid([e.i[k - 1], e.i[k]])) { if (run.length > 1) out.push({ c: e.c, i: Int32Array.from(run) }); run = [e.i[k]]; }
      else run.push(e.i[k]);
    }
    if (run.length > 1) out.push({ c: e.c, i: Int32Array.from(run) });
    return out;
  });
}

const FOOTPATHS = new Set(["footway", "steps", "cycleway", "path", "bridleway", "track"]);

export function inRing(ring: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The runs of a line's points that lie outside, each kept if it still has two points. */
function runsOutside<T extends { p: number[][] }>(l: T, inside: (x: number, y: number) => boolean): T[] {
  if (!l.p.some((q) => inside(q[0], q[1]))) return [l];
  const out: T[] = [];
  let run: number[][] = [];
  for (const q of l.p) {
    if (inside(q[0], q[1])) { if (run.length > 1) out.push({ ...l, p: run }); run = []; }
    else run.push(q);
  }
  if (run.length > 1) out.push({ ...l, p: run });
  return out;
}

/** Hide what the tools built under every set piece reaching into map d (the first area or a
 *  square of Bath, just loaded), and place the set pieces there. Changes d in place. */
export function maskSetPieces(d: MapData) {
  if (!d.centre || !d.t || !d.b) return;
  const [lon0, lat0] = d.centre;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;     // as tools/prep_map.py
  const T = d.t, gx1 = T.x0 + (T.nx - 1) * T.dx, gy1 = T.y0 + (T.ny - 1) * T.dy;
  const [bx0, by0, bx1, by1] = d.b;
  for (const sp of SET_PIECES) {
    // its frame: origin, along (ux, uy) and its front (uy, -ux), in data coordinates
    const ox = (sp.at[0] - lon0) * kx, oy = (sp.at[1] - lat0) * ky;
    const a = ((90 - sp.bearing) * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
    const at = (lx: number, lz: number): [number, number] => [ox + ux * lx + uy * lz, oy + uy * lx - ux * lz];
    const local = (x: number, y: number): [number, number] => [(x - ox) * ux + (y - oy) * uy, (x - ox) * uy - (y - oy) * ux];
    // the street it carries, laid as one street from end to end whatever pieces the map has it in
    if (sp.street) {
      layStreet(d, sp.street, local);
      // (a square's own street faces there were cut to the map's pieces, ragged at their joins and
      // with grass between: the street is drawn as laid instead)
      const st = sp.street;
      if (d.sf && !("o" in d.sf)) cutFaces(d.sf, (x, y) => { const [lx, lz] = local(x, y); return lx >= st.x0 && lx <= st.x1 && Math.abs(lz) < st.zMax; });
    }
    const rings = [sp.outline, ...sp.more ?? []].map((o) => o.map(([lx, lz]) => at(lx, lz)));
    const xs = rings.flat().map((q) => q[0]), ys = rings.flat().map((q) => q[1]);
    const mx0 = Math.min(...xs), mx1 = Math.max(...xs), my0 = Math.min(...ys), my1 = Math.max(...ys);
    if (mx1 < T.x0 || mx0 > gx1 || my1 < T.y0 || my0 > gy1) continue;
    const hide = (x: number, y: number) => x >= mx0 && x <= mx1 && y >= my0 && y <= my1 && rings.some((ring) => inRing(ring, x, y));
    const mid = (q: (number | string)[]) => hide((+q[0] + +q[2]) / 2, (+q[1] + +q[3]) / 2);

    // buildings whose middle is inside (noted, for the set piece to use their names), ponds wholly inside
    const hidden: PlaceCtx["hidden"] = [];
    d.bl = d.bl.filter((b) => {
      const r = b.r[0];
      let x = 0, y = 0;
      for (const q of r) { x += q[0]; y += q[1]; }
      x /= r.length; y /= r.length;
      if (!hide(x, y)) return true;
      const [lx, lz] = local(x, y), q = r.map((p) => local(p[0], p[1])), qx = q.map((p) => p[0]), qz = q.map((p) => p[1]);
      hidden.push({ name: b.n, x: lx, z: lz, box: [Math.min(...qx), Math.max(...qx), Math.min(...qz), Math.max(...qz)], ground: b.g, top: b.g + b.h });
      return false;
    });
    d.wp = d.wp.filter((w) => w.c === "canal" || !w.r[0].every((q) => hide(q[0], q[1])));
    if (d.wf) d.wf = d.wf.filter((w) => !w.p.some((q) => hide(q[0], q[1])));
    // the small things
    d.tr = d.tr.filter((q) => !hide(q[0], q[1]));
    if (d.sb) d.sb = d.sb.filter((q) => !hide(q[0], q[1]));
    if (d.dr) d.dr = d.dr.filter((q) => !hide(q[0], q[1]));
    if (d.by) d.by = d.by.filter((q) => !hide(+q[0], +q[1]));
    if (d.sh) d.sh = d.sh.filter((q) => {
      if (!hide(+q[0], +q[1])) return true;
      if (sp.pub && q[6] === "pub") { q[7] = 1; return true; }      // the pub's still here, under its own sign
      return false;
    });
    if (d.fx) d.fx = d.fx.filter((q) => !hide(+q[1], +q[2]));
    if (d.gt) d.gt = d.gt.filter((q) => !mid(q));
    if (d.fp) d.fp = d.fp.filter((q) => !mid(q));
    if (d.dv) d.dv = d.dv.filter((q) => !mid(q));
    if (d.wr) d.wr = d.wr.filter((q) => !hide(q[0], q[1]) && !hide(q[3], q[4]));
    if (d.pi) d.pi = d.pi.filter((p) => !hide(p[1], p[2]));
    // the map's own landmarks standing inside (Prior Park's porticos), but not other set pieces
    if (d.lm) d.lm = d.lm.filter((l) => SET_PIECES.some((o) => o.kind === l[0]) || !hide(+l[1], +l[2]));
    // walls, fences and hedges, and footpaths: the runs of them outside
    d.br = d.br.flatMap((l) => runsOutside(l, hide));
    const held: Road[] = [];
    d.rd = d.rd.flatMap((r) => {
      // a street the set piece carries on a bridge of its own: the game builds no bridge under it
      if (r.p.some((q) => q[3] === 1 && hide(q[0], q[1]))) { r.held = true; if (!FOOTPATHS.has(r.c)) held.push(r); }
      return FOOTPATHS.has(r.c) || (sp.yard && r.c === "service") ? runsOutside(r, hide) : [r];
    });
    // the canopy over woods
    if (d.cn) {
      const C = d.cn, raw = atob(C.h), H = new Uint8Array(raw.length);
      for (let k = 0; k < raw.length; k++) H[k] = raw.charCodeAt(k);
      let cut = false;
      for (let j = 0; j < C.ny; j++) for (let i = 0; i < C.nx; i++)
        if (H[j * C.nx + i] && hide(C.x0 + i * C.step, C.y0 + j * C.step)) { H[j * C.nx + i] = 0; cut = true; }
      if (cut) { let out = ""; for (let k = 0; k < H.length; k++) out += String.fromCharCode(H[k]); C.h = btoa(out); }
    }
    // where it's solid, for spawning to keep out of
    for (const c of sp.covers ?? []) (d.sp ??= []).push([at(c[0], c[2]), at(c[1], c[2]), at(c[1], c[3]), at(c[0], c[3])]);
    if (!sp.covers) (d.sp ??= []).push(...rings);

    // its height, and the ground it lowers
    const waterAt = (lx: number, lz: number) => {
      const [x, y] = at(lx, lz);
      for (const w of d.wp) if (w.c !== "canal" && inRing(w.r[0], x, y) && !w.r.slice(1).some((h) => inRing(h, x, y))) return w.z;
      return null;
    };
    const water = waterAt(0, 0);
    // the ground at the origin, from the square's terrain (as map.ts reads it)
    const fi = Math.min(T.nx - 1.001, Math.max(0, (ox - T.x0) / T.dx)), fj = Math.min(T.ny - 1.001, Math.max(0, (oy - T.y0) / T.dy));
    const gi = Math.floor(fi), gj = Math.floor(fj), gu = fi - gi, gv = fj - gj, gh = (i: number, j: number) => T.h[j * T.nx + i] / 10 + T.z0;
    const ground = (gh(gi, gj) * (1 - gu) + gh(gi + 1, gj) * gu) * (1 - gv) + (gh(gi, gj + 1) * (1 - gu) + gh(gi + 1, gj + 1) * gu) * gv;
    const ctx: PlaceCtx = { local, waterAt, ground, hidden, held: held.map((r) => r.p.filter((q) => q[3] === 1).map((q) => [...local(q[0], q[1]), 0, q[2]])), water, d };
    const z = typeof sp.height === "number" ? sp.height : sp.height(ctx);
    for (const p of ctx.held) for (const q of p) { q[2] = q[3] - z; q.length = 3; }
    if (sp.sink) lower(d, sp.sink.map((r) => ({ ...r, y: z + r.y })), local, hide, mx0, mx1, my0, my1);

    // and the set piece itself, solid in every square it reaches, drawn in the one its origin's in
    const args = sp.args?.(ctx, z) ?? [];
    const own = ox >= bx0 && ox < bx1 && oy >= by0 && oy < by1;
    (d.lm ??= []).push([sp.kind, +ox.toFixed(2), +oy.toFixed(2), +z.toFixed(2), +a.toFixed(4), own ? 1 : 0, ...args]);
  }
}

/** Lower the terrain of map d inside rectangles (in a set piece's frame, local() taking data x, y
 *  into it) to their heights, above sea level: never outside the set piece's outline (inside()),
 *  nor where a street, pavement or path is drawn over it. Every terrain point whose cells reach
 *  into a rectangle goes down, so its ground is level all the way to the rectangle's edges;
 *  (x0..x1, y0..y1): the outline's box. */
function lower(d: MapData, rects: Sink[], local: (x: number, y: number) => [number, number],
  inside: (x: number, y: number) => boolean, x0: number, x1: number, y0: number, y1: number) {
  const T = d.t, reach = Math.hypot(T.dx, T.dy);
  const i0 = Math.max(0, Math.floor((x0 - T.x0) / T.dx)), i1 = Math.min(T.nx - 1, Math.ceil((x1 - T.x0) / T.dx));
  const j0 = Math.max(0, Math.floor((y0 - T.y0) / T.dy)), j1 = Math.min(T.ny - 1, Math.ceil((y1 - T.y0) / T.dy));
  if (i0 > i1 || j0 > j1) return;
  // the terrain points under the streets nearby: every corner of every triangle a street's
  // surface (and its pavements) is drawn across, as world.ts lays it on the ground, each with the
  // highest the street is there
  const pinned = new Map<number, number>();
  const pin = (x: number, y: number, z: number) => {
    const fi = (x - T.x0) / T.dx, fj = (y - T.y0) / T.dy, i = Math.floor(fi), j = Math.floor(fj);
    if (i < 0 || j < 0 || i >= T.nx - 1 || j >= T.ny - 1) return;
    const k = j * T.nx + i;
    for (const q of fi - i + (fj - j) <= 1 ? [k, k + 1, k + T.nx] : [k + T.nx + 1, k + T.nx, k + 1]) pinned.set(q, Math.max(pinned.get(q) ?? -Infinity, z));
  };
  for (const r of d.rd) {
    const half = roadHalf(r.c, r.w) + (KERBED.has(r.c) ? Math.max(...(r.pv ?? [PAVE]), PAVE) : 0) + 0.4;
    if (!r.p.some((q) => q[0] > x0 - 50 && q[0] < x1 + 50 && q[1] > y0 - 50 && q[1] < y1 + 50)) continue;
    for (let s = 0; s < r.p.length - 1; s++) {
      const [ax, ay] = r.p[s], [bx, by] = r.p[s + 1], len = Math.hypot(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / len, ny = (bx - ax) / len, n = Math.ceil(len / 0.5), m = Math.ceil((2 * half) / 0.5);
      for (let u = 0; u <= n; u++) {
        const px = ax + ((bx - ax) * u) / n, py = ay + ((by - ay) * u) / n, pz = r.p[s][2] + ((r.p[s + 1][2] - r.p[s][2]) * u) / n;
        if (px < x0 - half || px > x1 + half || py < y0 - half || py > y1 + half) continue;
        for (let v = 0; v <= m; v++) { const o = -half + (2 * half * v) / m; pin(px + nx * o, py + ny * o, pz); }
      }
    }
  }
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * T.nx + i, x = T.x0 + i * T.dx, y = T.y0 + j * T.dy, street = pinned.get(k);
    const [lx, lz] = local(x, y);
    for (const r of rects) if (r.fill && street !== undefined && lx >= r.x0 && lx <= r.x1 && lz >= r.z0 && lz <= r.z1)
      T.h[k] = Math.max(T.h[k], Math.round((street - T.z0) * 10));
    if (!inside(x, y)) continue;
    for (const r of rects) {
      if (r.fill || (street !== undefined && !r.street)) continue;
      if (lx > r.x0 - reach && lx < r.x1 + reach && lz > r.z0 - reach && lz < r.z1 + reach)
        T.h[k] = Math.min(T.h[k], Math.round((Math.max(r.y, street ?? -Infinity) - T.z0) * 10));
    }
  }
}
