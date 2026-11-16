// How far you can see. The fog, the camera's far edge, how far off the full-detail squares of Bath
// are built (tiles.ts) and how far off the scenery in them is still drawn (world.ts, furniture.ts,
// trees.ts) all follow from these, so they stay in step, and squares far off are drawn simpler.
// Phones and iPads see less far, to keep their frame rate up and their memory down. Normally the
// automatic settings (quality.ts) choose the distance and ease it back when frames are slow. The draw distance in Settings (settings.ts), or its
// button in the debug panel (debug.ts), changes it on the spot and is remembered on this computer;
// ?view=1200 in the address tries a distance for one visit without remembering it (and ?lights=2 a Street lights level). The field of
// view lives here too, and the scenery detail Settings offers (how far grass grows round you and how
// far trees keep their full crowns) and street lights (how far off lit lamps show after dark, and how
// many light the street round you), remembered on this computer and changed on the spot. Nothing here goes over the network: everyone sees as far as they like.

const touch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;
const asked = typeof location !== "undefined" ? Number(new URLSearchParams(location.search).get("view")) : 0;

const VIEW_KEY = "cd-view", FOV_KEY = "cd-fov";
const stored = (k: string) => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };

/** The choices Settings and the debug panel offer, metres. */
export const VIEW_STEPS = [600, 900, 1200, 1500, 2000, 3000, 4000, 5000, 6000];

export const view = {
  /** Where the fog closes in completely by day, metres. After dark it closes in to NIGHT_FAR of that. */
  fogFar: 900,
  /** Where the fog starts. */
  fogNear: touch ? 60 : 110,
  /** The camera's far edge: just past the fog, so nothing hidden in it gets drawn. */
  cameraFar: 980,
  /** Its near edge: pushed out a little to see further, so distant roofs and roads don't flicker. */
  cameraNear: 0.05,
  /** Scenery that matters from far off (woods) is drawn to here. */
  sceneryFar: 860,
  /** Squares of Bath are built when their nearest edge is closer than this, and dropped past drop. */
  load: 980, drop: 1320,
  /** The field of view looking straight ahead, degrees (game.ts zooms in from it to aim). */
  fov: 72,
};
/** The field of view's range in Settings, and where it starts. */
export const FOV_MIN = 60, FOV_MAX = 100, FOV_DEFAULT = 72;
/** How far you see on this device unless you choose otherwise. */
export const VIEW_DEFAULT = touch ? 520 : 900;
export const NIGHT_FAR = 0.7;
/** How many of the street lamps round you light the street after dark (world.ts), for seeing far metres:
 *  four on a phone or iPad, more on a desktop the further it sees. Fixed when a map's built. */
export const lampLightsFor = (far: number) => touch ? 4 : far >= 2000 ? 12 : far >= 1200 ? 10 : far >= 800 ? 8 : 6;
/** Street lamps' posts and glass are drawn to here; further off, after dark, only their glow (furniture.ts). */
export const LAMPS_FAR = touch ? 200 : 260;
/** The most squares of Bath built in full round you at once (tiles.ts), the nearest first; past
 *  them the wider map's simpler streets and buildings stand in, as they do beyond the fog. Each
 *  square holds a good deal of memory, and a phone's or tablet's browser closes the page when it
 *  takes much more than a gigabyte or two, so they keep fewer. ?squares=16 tries another number. */
const askedSquares = typeof location !== "undefined" ? Number(new URLSearchParams(location.search).get("squares")) : 0;
export const SQUARES = askedSquares >= 1 ? Math.round(askedSquares) : touch ? 9 : 25;
/** Squares of Bath whose nearest edge is further off than this are drawn simpler (world.ts): coarser
 *  ground, and none of the footpaths and pavements, which are too thin to see from there. Close
 *  enough in that nothing is lost by eye, far enough out to save about a quarter of a long view's triangles. */
export const SIMPLER_FAR = 450;
/** How far off trees change to simpler models, and how far they're drawn at all (shared by every patch of trees). */
export const TREE_TO = [50, 100, 480];

/** How far round you grass grows (shared by every square's grass: grass.ts), metres. */
export const GRASS = { reach: touch ? 26 : 42 };

/** Scenery detail, as Settings offers it: how far grass grows round you, and how far off trees keep
 *  their full crowns and then their simpler ones (past that they're flat pictures, to the fog). Low
 *  is what a phone or iPad had before there was a choice, Medium a computer's. Further is slower:
 *  grass grows with the square of its reach. The flat pictures are drawn from the crowns themselves
 *  (trees.ts), so they can take over nearer in. */
export const DETAIL_LEVELS = [
  { name: "Low", grass: 26, trees: [50, 100] },
  { name: "Medium", grass: 42, trees: [50, 100] },
  { name: "High", grass: 64, trees: [90, 240] },
  { name: "Ultra", grass: 90, trees: [150, 400] },
  { name: "Max", grass: 130, trees: [250, 650] },
];
export const DETAIL_DEFAULT = touch ? 0 : 1;
const DETAIL_KEY = "cd-detail";
export let detailLevel = DETAIL_DEFAULT;

/** Scenery detail at DETAIL_LEVELS[i], from now on; keep: remember it on this computer. */
export function setDetail(i: number, keep = false) {
  detailLevel = Math.max(0, Math.min(DETAIL_LEVELS.length - 1, Math.round(i)));
  const l = DETAIL_LEVELS[detailLevel];
  GRASS.reach = l.grass;
  TREE_TO[0] = l.trees[0]; TREE_TO[1] = l.trees[1];
  if (keep) { try { localStorage.setItem(DETAIL_KEY, String(detailLevel)); } catch { /* private window: just this visit */ } }
}
{
  let saved: string | null = null;
  try { saved = localStorage.getItem(DETAIL_KEY); } catch { /* storage blocked */ }
  setDetail(saved !== null && Number.isFinite(Number(saved)) ? Number(saved) : DETAIL_DEFAULT);
}

/** Street lights, as Settings offers them: how far off a lit street lamp still shows after dark,
 *  and how many lamps round you light the street. Far off, each lamp is only its glow (furniture.ts),
 *  a spot that gets smaller the further it is; from the drone high over town every lamp is far off,
 *  so at Medium they're faint specks. Higher levels draw each glow bigger (size), never smaller than
 *  least pixels, and gather a small one's light into a brighter middle (bright), so lit streets show
 *  from the air and right across town.
 *  lit: lamps really lighting the street round you (world.ts), more or fewer than this device's
 *  normal (lampLightsFor), each costing every lit pixel something, so more is slower.
 *  pools: past those, every lamp's pool of light is painted on the ground, roads and walls instead
 *  (lamppools.ts), on a picture this many dots across, each dot step metres: it costs the same
 *  however many lamps there are. 0: none. Far off they're gain times brighter than a real lamp
 *  would make them, and pierce of that shows through the fog, so the town reads as lit from afar.
 *  Changed on the spot (a change in lit makes the lit surfaces' shaders build again, which can stall
 *  a frame or two after dark). */
export const LIGHT_LEVELS = [
  { name: "Low", lit: -2, size: 0.8, least: 1.5, bright: 1, pools: 0, step: 2, gain: 1, pierce: 0 },
  { name: "Medium", lit: 0, size: 1, least: 2, bright: 1, pools: 1024, step: 2, gain: 2, pierce: 0.4 },
  { name: "High", lit: 2, size: 1.4, least: 3, bright: 2, pools: 2048, step: 2, gain: 3, pierce: 0.6 },
  { name: "Ultra", lit: 4, size: 1.8, least: 3.5, bright: 2.5, pools: 2048, step: 2.5, gain: 3.5, pierce: 0.7 },
  { name: "Max", lit: 6, size: 2.2, least: 4, bright: 3, pools: 2048, step: 3, gain: 4, pierce: 0.8 },
];
export const LIGHT_DEFAULT = 1;
const LIGHT_KEY = "cd-lights";
export let lightLevel = LIGHT_DEFAULT;
/** Street lights at LIGHT_LEVELS[i], from now on; keep: remember it on this computer. */
export function setLights(i: number, keep = false) {
  lightLevel = Math.max(0, Math.min(LIGHT_LEVELS.length - 1, Math.round(i)));
  if (keep) { try { localStorage.setItem(LIGHT_KEY, String(lightLevel)); } catch { /* private window: just this visit */ } }
}
{
  let saved: string | null = null;
  try { saved = localStorage.getItem(LIGHT_KEY); } catch { /* storage blocked */ }
  // ?lights=2 tries a level (0 Low to 4 Max) for one visit, without remembering it
  const askedLights = typeof location !== "undefined" ? new URLSearchParams(location.search).get("lights") : null;
  const pick = askedLights ?? saved;
  setLights(pick !== null && pick !== "" && Number.isFinite(Number(pick)) ? Number(pick) : LIGHT_DEFAULT);
}

/** See as far as this, metres (by day). keep: remember it on this computer for next time. */
export function setView(far: number, keep = false) {
  if (keep) { try { localStorage.setItem(VIEW_KEY, String(far)); } catch { /* private window: just this visit */ } }
  view.fogFar = far;
  view.cameraFar = far + 80;
  view.cameraNear = far <= 900 ? 0.05 : Math.min(0.15, far / 10000);
  view.sceneryFar = far - 40;
  view.load = far + 80;
  view.drop = view.load + 340;
  TREE_TO[2] = Math.round(Math.min(far * (touch ? 0.58 : 0.53), 800));
}
const ok = (m: number) => m >= 200 && m <= VIEW_STEPS[VIEW_STEPS.length - 1];
setView(ok(asked) ? asked : ok(stored(VIEW_KEY)) ? stored(VIEW_KEY) : VIEW_DEFAULT);

/** Set the field of view, degrees, and remember it on this computer. */
export function setFov(deg: number, keep = true) {
  view.fov = Math.min(FOV_MAX, Math.max(FOV_MIN, deg));
  if (keep) { try { localStorage.setItem(FOV_KEY, String(view.fov)); } catch { /* private window */ } }
}
if (stored(FOV_KEY)) setFov(stored(FOV_KEY), false);
