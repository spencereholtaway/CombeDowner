// The Climb: a team challenge up a crag of its own (crag.ts), together, to the top, and it only
// counts when everyone stands there at once. It waits at the foot of the tallest thing on the map
// there is to climb, a crag the lidar shows (a quarry face, Signal Hill's slopes) or, where there's
// none as tall, the tallest building, with a flag on top, a rope down one side and crash mats and a
// bucket of chalk at its foot. Taking it on there lifts everyone near the foot up to the crag, high
// in the sky over the same spot; E at the foot takes anyone else up later, and the way down (a
// stile at the front of the grass under the crag) or the end brings you back to the street, where
// the strange object is left when it's won.
// - Grab a hold by walking into the face (or E, which also catches one as you fall past). On the
//   face, the keys or the stick reach for the next hold that way, Space lunges for one further off,
//   and crouch lets go. Grip drains while you hang and climb (a long reach takes more than a short
//   one) and comes back when you stand on something or hang off one of the white jugs; run out and
//   you come off.
// - Some holds are too high to reach from a ledge alone: a mate crouches and you stand on their
//   shoulders. A mate on a ledge can reach down and haul you up onto it. The first one up onto a
//   ledge can drop a rope from it for the rest.
// - With a team, a dropped rope only holds while a mate on its ledge holds it (E at its top), so
//   someone always stays behind: holding it you can't climb, and your grip drains for every mate
//   hanging on it, shown as a strain meter. Let go (or run out of grip) and it goes slack: anyone on
//   it slides down to the ledge below, jarred but not fallen. Alone a rope is tied off and holds.
// - With a team the traverse has a gap no lunge crosses: from the hold before it one climber
//   stretches across (E) as a bridge, their grip draining fast, and the rest climb over them as a
//   hold; once a mate is over, the bridge reaches their way and is pulled across. Alone it has none.
// - A short fall hurts and leaves your grip short until you've rested on a ledge. A big one knocks
//   you out where you land: a mate has to come down, pick you up and carry you back up to the
//   ledge the team has reached, in time, or you're out, a ghost watching until a rope dropped from
//   the next ledge brings you back in. If everyone's down, it's back to the bottom.
// - The team shares its lives (hearts on the card: three, and one more for every two climbers past
//   the first). Every fall that hurts (more than a few metres) costs one, with a groan of a trombone
//   for everyone. Run out, or all be down at once, and a fail card goes up and it's back to the
//   bottom with the lives filled again.
// - Alone it can be done (there are more holds, and none needs a boost); with more of you there
//   are fewer holds, and a few stretches start blank: one with two or three, up to three with six
//   or more, and with four or more one needs two stacked (a mate crouched on a crouching mate).
// Where it waits comes from the map; the crag is the same on every map, and its holds come from
// the job's seed and how many entered, so everyone climbs the same face. The crag's ledges,
// the grass at its foot and its top are things to stand on (map.floors), and its rock is solid
// (map.pushers). On the face, out cold, carried or a ghost, the job holds you (perch).
//
// Who decides what: each climber moves themselves (holds, ropes, being hauled up, up to the crag
// and back down) and says what they're doing ("qe" cs, a few times a second: which rope they're
// holding or hanging on and which hold they hang on too, from which every screen works out which
// ropes hold, whether there's a bridge across the gap and whether a mate is over it), and says when
// they've fallen. The host decides how many the face is set for, who's climbing (everyone who
// entered, lineup.ts, all taken up together at GO, and anyone up at the crag or on a hold after; the rest, and anyone who's
// gone back down, are bystanders and don't hold up the win), who's knocked out, carried, back on
// their feet or out, how many lives the team has left ("lv"), when the team has reached a ledge,
// when everyone's down or the lives are gone and it starts again, and when it's won.
// While you're up there the street's HUD (the place name, the minimap) is put away (aloft).
import * as THREE from "three";
import * as SFX from "./audio";
import { challengesOn, registerChallenge } from "./challenges";
import { BACK, buildCrag, FRONT, H, HALF, rockMost, rockOut, ropeOut, roomOver, routeFor, STACK_HOLD, STILE, STILE_OUT, type Room, type Route } from "./crag";
import { strip } from "./controls";
import { PATHS, type GameMap, type MapData } from "./map";
import { openGround } from "./oddments";
import type { Player } from "./player";
import { hearts, missionAux, missionAuxRow, missionCall } from "./missionscreens";
import { hash, type Job, type QuestWorld, type Waiting } from "./quests";
import { ring } from "./lineup";
import { guide, named } from "./notice";

const COLOUR = "#d9783a";
const WIDTH = 12;          // metres across the face on the map
const CAP = 36;            // the tallest face worth counting, metres
const MIN = 9;             // anything lower isn't worth it
const DEPTH = 1.6;         // how far out from the face on the map its rope coil and mats lie
const PLINTH = 0.35;       // the ground at its foot, a step up from the lowest

const HAND = 2.0;          // hands above the feet, hanging
const STAND_REACH = 2.3;   // highest hold above your feet you can take standing
const CATCH = 1.0;         // how far from your hands a hold is caught in the air
const REACH = 2.2;         // hold to hold, hand over hand
const LUNGE = 3.4;         // and with a lunge
const SHOULDERS = 1.0;     // a crouching mate's shoulders above their feet
const OUT = 0.42;          // a hanging body's distance out from the face

const HANG_DRAIN = 0.03, MOVE_COST = 0.028, JUG_REST = 0.08, LUNGE_COST = 0.16, CATCH_COST = 0.1, ROPE_DRAIN = 0.008;
const REST = 0.4, HEAL = 0.06, HURT = 0.25, CARRY_MUL = 1.8;
const MOVE_T = 0.3, LUNGE_T = 0.22, MANTLE_T = 0.5, PULL_T = 0.8;
const ROPE_V = 2.2;
const ANCHOR_DRAIN = 0.1;  // the anchor's grip, a second, for each mate hanging on the rope
const SLIDE_V = 7;         // down a rope that's gone slack
const BRIDGE_DRAIN = 0.065; // hanging stretched across the traverse's gap
const BRIDGE = -2;         // a Point's i for the body of a mate stretched across the gap
const SHORT_FALL = 2.5, LIFE_FALL = 4.5, BIG_FALL = 7.5;
/** The team's lives: three, and one more for every two climbers past the first. */
const livesFor = (n: number) => 3 + Math.floor((Math.max(1, n) - 1) / 2);
const DOWN_SECS = 90;      // to carry a knocked-out mate back up before they're out
const WIN_HOLD = 2.5;      // seconds everyone has to stand at the top together
const SEND = 0.12;
const UP = 7;              // metres from the foot on the map to go up to the crag with E

/** The face, in scene coordinates: its foot's middle, out (the way it faces) and along (right, facing it). */
interface Face {
  ox: number; oz: number; nx: number; nz: number; tx: number; tz: number;
  base: number;        // the lowest ground along its foot
  y0: number;          // the plinth's top
  top: number;         // the top
  back: number;        // how far back from the face the top stands
  crag: boolean;       // a crag in the ground (else a building's wall is the face)
  name: string;
}

/** Where hands are: a hold (i), or the lip of a ledge (k) at s. */
interface Point { s: number; y: number; i: number; lip: number }

const faces = new WeakMap<GameMap, Face | null>();
// the faces each zone's placing found, by the spots it gave: the whole map's tallest can lie outside the zone
const placedFaces = new WeakMap<object, Face>();
const faceFor = (spots: object, map: GameMap) => placedFaces.get(spots) ?? faceOf(map);

/** The tallest climbable face on the map, the same on every machine. */
export function faceOf(map: GameMap): Face | null {
  if (faces.has(map)) return faces.get(map)!;
  let f: Face | null = null;
  try { f = findFace(map); } catch (e) { console.warn("The Climb: no face", e); }
  faces.set(map, f);
  return f;
}

function findFace(map: GameMap): Face | null {
  const W = map.wide, D = map.d;
  const ground = (x: number, z: number) => (W ? W.ground(x, z) : map.ground(x, z));
  const home = openGround(map);
  const fc = W ? [W.fx, W.fy] : D.fc ?? [0, 0];
  const ok = (x: number, z: number) => map.fieldEdge(x, z) > 80 && (!home || Math.hypot(home.x - x, home.y + z) > 120);
  type Cand = { h: number; d: number; x: number; z: number; nx: number; nz: number; crag: boolean; back: number; base: number; foot: number };
  let best: Cand | null = null;
  const better = (c: Cand) => !best || Math.round(c.h) > Math.round(best.h) || (Math.round(c.h) === Math.round(best.h) && (c.crag && !best.crag || (c.crag === best.crag && (c.d < best.d - 1 || (Math.abs(c.d - best.d) <= 1 && c.x + c.z * 1e-3 < best.x + best.z * 1e-3)))));

  // crags: the steepest rises in the ground, on a grid of its points
  let nx: number, ny: number, x0: number, y0: number, dx: number;
  if (W) { nx = W.nx; ny = W.ny; x0 = W.x0; y0 = W.y0; dx = W.dx; }
  else { const b = D.b; dx = 8; x0 = b[0]; y0 = b[1]; nx = Math.floor((b[2] - b[0]) / dx); ny = Math.floor((b[3] - b[1]) / dx); }
  const H = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = W ? W.at(i, j) : map.ground(x0 + i * dx, -(y0 + j * dx));
  const at = (i: number, j: number) => H[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  // streets, railways and water in front of a face would put trains and traffic through the climb
  let lines: number[][] | null = null;
  const clearOfWays = (x: number, z: number) => {
    if (!lines) {
      lines = [];
      for (const r of [...D.rd, ...(W?.rd ?? [])]) for (let i = 1; i < r.p.length; i++) lines.push([r.p[i - 1][0], r.p[i - 1][1], r.p[i][0], r.p[i][1], PATHS.has(r.c) ? 0 : 7]);
      for (const t of map.railData?.tracks ?? []) for (let i = 1; i < t.p.length; i++) lines.push([t.p[i - 1][0], t.p[i - 1][1], t.p[i][0], t.p[i][1], 8]);
      const c = map.cable;
      if (c) lines.push([c.ax, c.ay, c.ax + c.ux * c.len, c.ay + c.uy * c.len, 30]);
    }
    const y = -z;
    for (const [ax, ay, bx, by, r] of lines) {
      if (Math.min(ax, bx) > x + 20 || Math.max(ax, bx) < x - 20 || Math.min(ay, by) > y + 20 || Math.max(ay, by) < y - 20) continue;
      const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
      if (Math.hypot(x - ax - vx * t, y - ay - vy * t) < r) return false;
    }
    for (const w of [...D.wp, ...(W?.wp ?? [])]) if (w.r[0] && inRing(w.r[0], x, y)) return false;
    return true;
  };
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let j = 2; j < ny - 2; j++) for (let i = 2; i < nx - 2; i++) {
    const h0 = at(i, j);
    for (const [di, dj] of DIRS) {
      if (at(i - di, j - dj) > h0 + 2) continue;   // a foot, not partway up
      let rise = 0;
      for (let s = 1; s <= 3; s++) {
        const r = at(i + di * s, j + dj * s) - h0, run = s * dx * Math.hypot(di, dj);
        if (r / run >= 1 && r > rise) rise = r;
      }
      if (rise < MIN) continue;
      const h = Math.min(rise, CAP);
      const x = x0 + i * dx, y = y0 + j * dx, z = -y, l = Math.hypot(di, dj);
      // the way it faces, in the scene: back down the rise
      const fx = -di / l, fz = dj / l;
      const c: Cand = { h, d: Math.hypot(x - fc[0], y - fc[1]), x, z, nx: fx, nz: fz, crag: true, back: 0, base: h0, foot: h0 };
      if (best && !better(c)) continue;
      if (!ok(x + fx * 8, z + fz * 8)) continue;
      // a face all the way across: nothing in front higher than its foot, and steep behind
      const tx = fz, tz = -fx;
      let good = true, base = Infinity;
      for (let s = -WIDTH / 2; s <= WIDTH / 2 && good; s += 2) {
        const px = x + tx * s, pz = z + tz * s;
        const front = ground(px + fx * 2, pz + fz * 2), foot = ground(px, pz), behind = ground(px - fx * 12, pz - fz * 12);
        base = Math.min(base, foot, front);
        if (front > h0 + 2.5 || behind < h0 + h * 0.4) good = false;
        // nothing growing up the face or in the way at its foot
        if (W && (W.treesNear(px + fx * 1, -(pz + fz * 1), 2.5).length || W.treesNear(px + fx * 3.5, -(pz + fz * 3.5), 2).length)) good = false;
      }
      if (!good) continue;
      if (![-WIDTH / 2, 0, WIDTH / 2].every((s) => clearOfWays(x + tx * s + fx * 5, z + tz * s + fz * 5))) continue;
      c.base = base;
      best = c;
    }
  }

  // buildings: the tallest, up its longest wall that faces somewhere open
  const blds = [...(D.bl ?? []), ...(W?.bl ?? [])];
  for (const b of blds) {
    if (!b.r[0] || b.r[0].length < 3 || b.h < MIN) continue;
    const h = Math.min(b.h, CAP);
    if (best && Math.round(h) < Math.round(best.h)) continue;
    const r = b.r[0];
    let cx = 0, cy = 0;
    for (const q of r) { cx += q[0]; cy += q[1]; }
    cx /= r.length; cy /= r.length;
    let k = -1, len = 0;
    for (let i = 0; i < r.length; i++) {
      const a = r[i], c = r[(i + 1) % r.length], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (l > len) { len = l; k = i; }
    }
    if (len < WIDTH) continue;
    const a = r[k], c = r[(k + 1) % r.length];
    const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
    let ex = -(c[1] - a[1]) / len, ey = (c[0] - a[0]) / len;
    if (ex * (mx - cx) + ey * (my - cy) < 0) { ex = -ex; ey = -ey; }
    const x = mx, z = -my, fx = ex, fz = -ey;
    const g = ground(x + fx * 3, z + fz * 3);
    const cand: Cand = { h, d: Math.hypot(x - fc[0], my - fc[1]), x, z, nx: fx, nz: fz, crag: false, back: 4, base: g, foot: g };
    if (best && !better(cand)) continue;
    if (!ok(x + fx * 8, z + fz * 8)) continue;
    if (W?.buildingsNear(mx + ex * 4, my + ey * 4, 2).some((o) => o !== b)) continue;
    if (!clearOfWays(x + fx * 5, z + fz * 5)) continue;
    const top = b.g - map.z0 + b.h;
    cand.h = Math.min(top - g, CAP);
    if (cand.h < MIN) continue;
    best = cand;
  }
  if (!best) return null;
  const B: Cand = best;
  const tx = B.nz, tz = -B.nx;
  const plinth = B.base + PLINTH, top = B.foot + B.h;
  if (top - plinth < MIN) return null;
  // how far back the top runs before the ground behind comes up to it
  let back = B.back;
  if (B.crag) {
    back = 40;
    for (let d = 1; d <= 40; d++) if (ground(B.x - B.nx * d, B.z - B.nz * d) >= top - 0.5) { back = d + 1; break; }
    back = Math.max(4, back);
  }
  return { ox: B.x, oz: B.z, nx: B.nx, nz: B.nz, tx, tz, base: B.base, y0: plinth, top, back, crag: B.crag, name: nameNear(map, B.x, B.z, B.crag) };
}

/** A square coming in: the trees, shrubs, street things and wires on and in front of the face go, so its flag, rope and mats stand clear. */
export function clearClimb(core: GameMap, d: MapData) {
  const p = challengesOn(core).find((q) => q.c.id === "climb");
  const f = p ? faceFor(p.spots, core) : null;
  if (!f) return;
  const off = (x: number, y: number) => {
    const dx = x - f.ox, dz = -y - f.oz, s = dx * f.tx + dz * f.tz, out = dx * f.nx + dz * f.nz;
    return Math.abs(s) < WIDTH / 2 + 4 && out > -f.back - 2 && out < 14;
  };
  d.tr = d.tr.filter((q) => !off(q[0], q[1]));
  if (d.sb) d.sb = d.sb.filter((q) => !off(q[0], q[1]));
  if (d.rk) d.rk = d.rk.filter((q) => !off(q[0], q[1]));
  if (d.fx) d.fx = d.fx.filter((q) => !off(+q[1], +q[2]));
  if (d.wr) d.wr = d.wr.filter((q) => !off(q[0], q[1]) && !off(q[3], q[4]));
}

function nameNear(map: GameMap, x: number, z: number, crag: boolean): string {
  let n = "", far = 600;
  for (const p of [...(map.d.pl ?? []), ...(map.wide?.d.pl ?? [])]) {
    if (!p.n || p.r.length < 3) continue;
    const cx = p.r.reduce((s, q) => s + q[0], 0) / p.r.length, cy = p.r.reduce((s, q) => s + q[1], 0) / p.r.length;
    const d = Math.hypot(cx - x, cy + z);
    if (d < far || (d === far && p.n < n)) { far = d; n = p.n; }
  }
  const what = crag ? "the crag" : "the tall building";
  return n ? `${what} by ${n}` : what;
}

const onFace = (f: Face, s: number, out: number) => [f.ox + f.tx * s + f.nx * out, f.oz + f.tz * s + f.nz * out] as const;
const faceTurn = (f: Face) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(f.nx, f.nz), 0));

/** What makes it a climbing wall from down the street, the same while it waits and while it's climbed:
 *  a big flag on top, a rope hanging down one side, crash mats and a bucket of chalk at the foot. */
function dressing(f: Face, map: GameMap) {
  const group = new THREE.Group(), turn = faceTurn(f), yaw = Math.atan2(f.nx, f.nz);
  const flagMat = new THREE.MeshLambertMaterial({ color: "#ff6a1a", emissive: "#6a2400", side: THREE.DoubleSide });
  const white = new THREE.MeshLambertMaterial({ color: "#eeeae0" });
  const ropeMat = new THREE.MeshLambertMaterial({ color: "#19b6e6", emissive: "#063a4a" });
  const matMat = new THREE.MeshLambertMaterial({ color: "#2a56c8" });
  const tin = new THREE.MeshLambertMaterial({ color: "#5a6a78" });
  const geos = [
    new THREE.CylinderGeometry(0.08, 0.08, 6.5, 6), new THREE.PlaneGeometry(3.6, 2),
    new THREE.CylinderGeometry(0.05, 0.05, 1, 6), new THREE.TorusGeometry(0.34, 0.08, 5, 12),
    new THREE.BoxGeometry(1, 1, 1), new THREE.CylinderGeometry(0.2, 0.16, 0.34, 10), new THREE.CircleGeometry(0.17, 10),
  ];
  const [poleGeo, clothGeo, ropeGeo, coilGeo, boxGeo, pailGeo, dustGeo] = geos;
  const flag = new THREE.Group(), banner = new THREE.Mesh(clothGeo, flagMat), pole = new THREE.Mesh(poleGeo, white);
  pole.position.y = 3.25; banner.position.set(1.8, 5.4, 0);
  flag.add(pole, banner);
  const [fx, fz] = onFace(f, 0, f.crag ? -1 : -0.3);
  flag.position.set(fx, f.top, fz);
  flag.rotation.y = yaw + Math.PI / 2;
  const ropeS = WIDTH / 2 - 0.7, [rx, rz] = onFace(f, ropeS, 0.25), len = f.top - f.base;
  const rope = new THREE.Mesh(ropeGeo, ropeMat);
  rope.position.set(rx, f.base + len / 2, rz); rope.scale.y = len;
  const foot = (s: number, out: number) => { const [x, z] = onFace(f, s, out); return new THREE.Vector3(x, map.ground(x, z), z); };
  const coil = new THREE.Mesh(coilGeo, ropeMat);
  coil.position.copy(foot(ropeS, DEPTH + 0.6)).y += 0.1; coil.rotation.x = -Math.PI / 2;
  const mat = new THREE.Mesh(boxGeo, matMat);
  mat.position.copy(foot(0, DEPTH + 1.3)).y += 0.15; mat.quaternion.copy(turn); mat.scale.set(5.2, 0.3, 2.2);
  const pail = new THREE.Mesh(pailGeo, tin), dust = new THREE.Mesh(dustGeo, white);
  pail.position.copy(foot(-WIDTH / 2 + 2.2, DEPTH + 0.7)).y += 0.17;
  dust.rotation.x = -Math.PI / 2; dust.position.y = 0.16; pail.add(dust);
  group.add(flag, rope, coil, mat, pail);
  return {
    group, banner,
    dispose() { for (const g of geos) g.dispose(); for (const m of [flagMat, white, ropeMat, matMat, tin]) m.dispose(); },
  };
}

const FALLS = ["came off the wall", "peeled off", "did a starfish all the way down", "let go to wave", "found the quick way down", "bounced"];

const enum M { Free, Hang, Rope, Tween, Out, Carried, Ghost, Anchor, Bridge }
type Status = { st: "ko" | "ghost"; left: number; by: string };
/** a: the ledge whose rope they're holding, r: the ledge whose rope they're on, h: the hold they hang on (-1: none). */
type Report = { m: number; g: number; c: number; L: number; on: number; cy: string; f: number; i: number; a: number; r: number; h: number; t: number };

registerChallenge({
  id: "climb", name: "The Climb", blurb: "Up the tallest crag around, together: boost, haul and rope each other to the top",
  glyph: "C", colour: COLOUR, tier: 2, stars: 3,
  goal: () => "Get the whole team to the top together",
  place(map) {
    const f = faceOf(map);
    if (!f) return null;
    const spots = [
      { x: f.ox + f.nx * 8, z: f.oz + f.nz * 8, name: f.name },
      { x: f.ox, z: f.oz, y: f.y0, name: "the foot" },
    ];
    placedFaces.set(spots, f);
    return spots;
  },
  waiting({ spots, w }) { const f = faceFor(spots, w.map); return f ? waitingFace(w, f) : null; },
  // in front of the face, looking up at it; at GO up to the crag
  lineup: { start: "timed", spots: ({ spots, w }, n) => ring(w.map, spots[0].x, spots[0].z, n, 2.4, spots[1] ?? spots[0]) },
  start({ offer, spots, w, cast }) {
    const f = faceFor(spots, w.map)!;
    return climb(offer, w, f, cast);
  },
});

/** How far (x, z) is from anywhere along the foot of the face on the map. */
function footDist(f: Face, x: number, z: number) {
  const dx = x - f.ox, dz = z - f.oz, along = dx * f.tx + dz * f.tz, out = dx * f.nx + dz * f.nz;
  return Math.hypot(Math.max(0, Math.abs(along) - WIDTH / 2), Math.max(0, out - 3));
}

/** Till someone takes it on: its flag on top, its rope and its crash mats. */
function waitingFace(w: QuestWorld, f: Face): Waiting {
  const dress = dressing(f, w.map);
  w.scene.add(dress.group);
  return {
    dist: (x, z) => footDist(f, x, z),
    update(_dt, t) { dress.banner.rotation.y = Math.sin(t * 3.3) * 0.3; },
    dispose() {
      w.scene.remove(dress.group);
      dress.dispose();
    },
  };
}

function climb(offer: Job["offer"], w: QuestWorld, f: Face, cast: string[]): Job {
  const seed = offer.seed, map = w.map;
  // where it's left when it's won, and where you come back down to: in front of the face on the map, by the mats
  const [ex, ez] = onFace(f, 0, DEPTH + 4);
  const room: Room = roomOver(f.ox, f.oz, f.base, f.name);
  const P = (s: number, out: number) => [room.ox + room.tx * s + room.nx * out, room.oz + room.tz * s + room.nz * out] as const;
  const local = (x: number, z: number) => { const dx = x - room.ox, dz = z - room.oz; return [dx * room.tx + dz * room.tz, dx * room.nx + dz * room.nz] as const; };
  const rock = (s: number, y: number) => rockOut(s, y - room.y0);
  const inRoom = (x: number, y: number, z: number) => y > room.y0 - 60 && Math.abs(x - room.ox) < 40 && Math.abs(z - room.oz) < 40;
  const meIn = () => { const me = w.me(); return inRoom(me.x, me.y, me.z); };
  let route: Route = routeFor(room, seed, Math.max(1, cast.length));
  let fixed = false;               // the host has said how many it's set for
  const S = () => route.ledges.length - 1;
  /** How far out a ledge's lip is at s, where hands go over it; and where you stand once you're up. */
  const lipOut = (k: number, s: number) => (k === S() ? rock(s, route.ledges[k].y - 0.3) : route.ledges[k].o + route.ledges[k].d);
  const standOut = (k: number, s: number) => lipOut(k, s) - 0.7;

  // ---- my own climbing ----
  let mode: M = M.Free;
  let grip = 1, cap = 1, still = 0;
  let pt: Point | null = null;                       // hands, on the face
  let from = { s: 0, y: 0, out: 0 }, to = { s: 0, y: 0, out: 0 }, tT = 0, tLen = 0;   // a move between holds, a mantle or a haul
  let tweenThen: (() => void) | null = null;
  let rope = -1;                                     // the ledge whose rope you're on
  let anchor = -1;                                   // the ledge whose rope you're holding for the others
  let slackSaid = 0;
  let L = 0;                                         // the highest ledge you've climbed to
  let peak = -Infinity, air = false, flail = 0, yelled = false;
  let cool = 0, wantGrab = false, prevJump = false, prevCrouch = false, prevLatch = false;
  let carriedBy = "", carrying = "";
  let lastX = 0, lastY = 0, lastZ = 0;
  let koVy = 0;
  let sendT = 0, lastOn = -1, marked = false;
  const body = () => w.body?.() as Player;

  // ---- everyone's, as the host says ----
  const status = new Map<string, Status>();
  const ropes = new Set<number>();
  let cp = 0, fails = 0, held = 0, failT = 0, won = false;
  let lives = livesFor(route.n), most = lives;
  // who's climbing: everyone near the foot when it starts, and anyone since who's gone up or taken a hold
  let climbers = new Set<string>(), enrolled = false;
  const reports = new Map<string, Report>();
  const posed = new Map<string, "flail" | "push">();
  const fresh = (r: Report | undefined, now = performance.now()): r is Report => !!r && now - r.t < 1500;
  /** With a team a dropped rope only takes weight while a mate on its ledge holds it; alone it's tied off. */
  const team = () => route.n >= 2;
  function anchored(k: number): boolean {
    if (!team() || anchor === k) return true;
    for (const [id, r] of reports) if (id !== w.selfId && r.m === M.Anchor && r.a === k && fresh(r) && !status.has(id)) return true;
    return false;
  }
  /** Who's hanging on ledge k's rope, besides me. */
  const onRope = (k: number) => [...reports].filter(([id, r]) => id !== w.selfId && r.m === M.Rope && r.r === k && fresh(r)).map(([id]) => id);
  const heldRopes = () => new Set([...ropes].filter(anchored));
  /** The traverse's gap, either side and the middle, where a body stretched across it gives a hold. */
  const gapAt = () => {
    if (!route.gap) return null;
    const [a, b] = route.gap.map((i) => route.holds[i]);
    return { a, b, mid: { s: (a.s + b.s) / 2, y: (a.y + b.y) / 2, i: BRIDGE, lip: -1 } as Point, way: Math.sign(b.s - a.s) || 1 };
  };
  /** A mate stretched across the gap right now, for the rest to climb over. */
  const bridged = () => [...reports].some(([id, r]) => id !== w.selfId && r.m === M.Bridge && fresh(r) && !status.has(id));
  /** A mate hanging past the gap, close enough to the far hold to take the bridge's hand. */
  function mateAcross(): boolean {
    const g = gapAt();
    if (!g) return false;
    for (const [id, r] of reports) {
      const h = route.holds[r.h];
      if (id === w.selfId || !h || !fresh(r) || r.m !== M.Hang || status.has(id)) continue;
      if ((h.s - g.mid.s) * g.way > 0.5 && Math.hypot(h.s - g.b.s, h.y - g.b.y) < 2.5) return true;
    }
    return false;
  }
  let heldKey = "";

  // ---- drawn ----
  const group = new THREE.Group();
  w.scene.add(group);
  const crag = buildCrag(room);
  let shown = false;
  const star = new THREE.OctahedronGeometry(0.11), gold = new THREE.MeshBasicMaterial({ color: "#ffd84a" });
  const ghostGeo = new THREE.SphereGeometry(0.75, 10, 8), mist = new THREE.MeshBasicMaterial({ color: "#bfe4ff", transparent: true, opacity: 0.28, depthWrite: false });
  const disposables: { dispose(): void }[] = [crag, star, gold, ghostGeo, mist];
  // the flag, rope and mats stay at the foot on the map, to come back to
  const dress = dressing(f, map);
  group.add(dress.group);
  disposables.push(dress);
  const marks: THREE.Object3D[] = [];

  function build() {
    crag.setHolds(route);
    drawRopes();
  }
  const drawRopes = () => { const h = heldRopes(); heldKey = [...h].join(); crag.setRopes(route, ropes, h); };
  build();

  // ---- standing on it ----
  const floor = (x: number, z: number, y: number): number | null => {
    if (!inRoom(x, y, z)) return null;
    const [s, out] = local(x, z);
    let best: number | null = null;
    const top = (h: number) => { if (h <= y + 0.6 && (best === null || h > best)) best = h; };
    route.ledges.forEach((l, k) => {
      if (k === 0) { if (Math.abs(s) < HALF + 3 && out > -3 && out < FRONT + 4) top(l.y); }
      else if (k === S()) { if (Math.abs(s) < HALF + 2.5 && out > -BACK - 4 && out <= rock(s, l.y) + 0.1) top(l.y); }
      else if (s >= l.s0 - 0.15 && s <= l.s1 + 0.15 && out >= rock(s, l.y + 0.5) - 0.4 && out <= l.o + l.d + 0.1) top(l.y);
    });
    for (const sh of shoulders) if (Math.hypot(x - sh[0], z - sh[1]) < 0.45) top(sh[2]);
    return best;
  };
  let shoulders: [number, number, number][] = [];
  // the rock in front of you, the bay's sides, the wall along the front and the edge of the top
  const pusher = (pos: { x: number; z: number }, y: number, r: number): number => {
    if (!inRoom(pos.x, y, pos.z)) return -Infinity;
    const [s0, o0] = local(pos.x, pos.z), ly = y - room.y0;
    let s = Math.max(-HALF, Math.min(HALF, s0)), out = o0, block = s === s0 ? -Infinity : 3;
    if (ly < H - 0.05) {
      const face = rockMost(s, Math.max(0, ly + 0.3), ly + 1.7) + r;
      if (out < face) { out = face; block = 3; }
      if (out > FRONT) { out = FRONT; block = 3; }
    } else if (out < -BACK) { out = -BACK; block = 3; }
    if (block > -Infinity) [pos.x, pos.z] = P(s, out);
    return block;
  };
  const hook = () => {
    if (!map.floors.includes(floor)) map.floors.push(floor);
    if (!map.pushers.includes(pusher)) map.pushers.push(pusher);
  };

  /** Which ledge feet at (x, y, z) stand on, or -1; the grass at the foot is the bottom. */
  function ledgeAt(x: number, y: number, z: number, grounded: boolean): number {
    if (!grounded || !inRoom(x, y, z)) return -1;
    const [s, out] = local(x, z);
    for (let k = S(); k >= 1; k--) {
      const l = route.ledges[k];
      if (y < l.y - 0.35 || y > l.y + (k === S() ? 2 : 0.35)) continue;
      if (k === S()) { if (out <= rock(s, l.y) + 0.3) return k; continue; }
      if (s >= l.s0 - 0.3 && s <= l.s1 + 0.3 && out >= rock(s, l.y + 0.5) - 0.6 && out <= l.o + l.d + 0.3) return k;
    }
    if (y < room.y0 + 0.5) return 0;
    return -1;
  }

  // ---- the body on the face ----
  const bodyAt = (p: Point) => ({ s: p.s, y: p.y - HAND, out: p.lip >= 0 ? lipOut(p.lip, p.s) + 0.4 : rockMost(p.s, p.y - HAND - room.y0, p.y - room.y0) + OUT });
  function place(pl: Player, s: number, y: number, out: number) {
    const [x, z] = P(s, out);
    pl.pos.set(x, y, z);
    pl.vel.set(0, 0, 0);
    pl.onGround = false;
    pl.speed = 0;
  }
  function tween(a: { s: number; y: number; out: number }, b: { s: number; y: number; out: number }, T: number, then: (() => void) | null) {
    from = a; to = b; tT = 0; tLen = T; tweenThen = then;
  }
  function grabbed(p: Point, cost: number) {
    const pl = body();
    const [s, out] = local(pl.pos.x, pl.pos.z);
    pt = p; mode = M.Hang;
    grip = Math.max(0, grip - cost * (carrying ? CARRY_MUL : 1));
    tween({ s, y: pl.pos.y, out }, bodyAt(p), 0.18, null);
    SFX.rung();
  }
  function letGo(push = 0) {
    const pl = body();
    mode = M.Free; pt = null; rope = -1; cool = 0.6;
    pl.vel.set(f.nx * push, push ? 2 : 0, f.nz * push);
    pl.onGround = false;
  }
  function onto(k: number, s: number) {
    const pl = body(), l = route.ledges[k];
    const ss = Math.max(l.s0 + 0.4, Math.min(l.s1 - 0.4, s));
    place(pl, ss, l.y, standOut(k, ss));
    pl.onGround = true;
    mode = M.Free; pt = null; rope = -1;
    reached(k);
  }
  /** The rope's gone slack under you: down it to the ledge it hangs to, a jolt but not a fall. */
  function slip() {
    const pl = body(), l = route.ledges[rope], j = route.ledges.findIndex((x) => x.y === l.foot);
    const ro = ropeOut(l) + 0.35, out = j > 0 ? Math.min(ro, standOut(j, l.rope)) : ro;
    mode = M.Tween; pt = null; rope = -1;
    tween({ s: l.rope, y: pl.pos.y, out: ro }, { s: l.rope, y: l.foot, out }, Math.max(0.25, (pl.pos.y - l.foot) / SLIDE_V), () => {
      body().onGround = true;
      cap = Math.max(0.3, cap - HURT / 2); grip = Math.min(grip, cap);
      SFX.thump();
    });
    w.toast("The rope's gone slack: nobody up there is holding it");
    SFX.shout(0, 0, seed + 3);
  }
  /** Stretch across the traverse's gap from the near hold, for the others to climb over. */
  function startBridge() {
    const g = gapAt(), pl = body();
    if (!g) return;
    const [s, out] = local(pl.pos.x, pl.pos.z);
    mode = M.Bridge; pt = null;
    tween({ s, y: pl.pos.y, out }, bodyAt(g.mid), 0.4, null);
    SFX.effort(0, 0, seed + 5);
  }
  function offBridge(h: { s: number; y: number }, i: number) {
    const pl = body(), [s, out] = local(pl.pos.x, pl.pos.z);
    pt = { s: h.s, y: h.y, i, lip: -1 }; mode = M.Hang;
    tween({ s, y: pl.pos.y, out }, bodyAt(pt), 0.35, null);
    SFX.rung();
  }
  function startAnchor(k: number) {
    mode = M.Anchor; anchor = k; pt = null; rope = -1;
    SFX.effort(0, 0, seed + 4);
    drawRopes();
  }
  function stopAnchor(why = "") {
    if (mode === M.Anchor) { mode = M.Free; body().onGround = true; }
    anchor = -1;
    if (why) w.toast(why);
    drawRopes();
  }
  function reached(k: number) {
    if (k < S()) { if (k > L) L = k; }
    else if (L >= S() - 1) L = S();
  }

  /** The hold or ledge lip to reach for from p, the way (dx, dy) on the face, within max. */
  function reachFor(p: Point, dx: number, dy: number, max: number, min = 0.2): Point | null {
    const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    let best: Point | null = null, score = Infinity;
    const consider = (c: Point) => {
      const ex = c.s - p.s, ey = c.y - p.y, d = Math.hypot(ex, ey);
      if (d < min || d > max) return;
      const dot = (ex * ux + ey * uy) / d;
      if (dot < 0.5) return;
      const sc2 = d * 0.35 + (1 - dot) * 3;
      if (sc2 < score) { score = sc2; best = c; }
    };
    route.holds.forEach((h, i) => { if (i !== p.i) consider({ s: h.s, y: h.y, i, lip: -1 }); });
    const g = gapAt();
    if (g && p.i !== BRIDGE && bridged()) consider(g.mid);
    route.ledges.forEach((le, k) => {
      if (k === 0 || k === p.lip) return;
      consider({ s: Math.max(le.s0 + 0.3, Math.min(le.s1 - 0.3, p.s)), y: le.y, i: -1, lip: k });
    });
    return best;
  }

  /** A hold within reach of someone standing or in the air at (s, out) with feet at y, if there is one. */
  function inReach(s: number, out: number, y: number, grounded: boolean): Point | null {
    let best: Point | null = null, bd = Infinity;
    const hand = y + HAND;
    const test = (c: Point) => {
      if (Math.abs(out - bodyAt(c).out) > 1.3) return;
      let d: number;
      if (grounded) {
        const up = c.y - y;
        if (up < 0.3 || up > STAND_REACH || Math.abs(c.s - s) > 1.0) return;
        d = Math.abs(c.s - s) + Math.abs(up - 1.9);
      } else {
        d = Math.hypot(c.s - s, c.y - hand);
        if (d > CATCH) return;
      }
      if (d < bd) { bd = d; best = c; }
    };
    route.holds.forEach((h, i) => test({ s: h.s, y: h.y, i, lip: -1 }));
    route.ledges.forEach((l, k) => {
      if (k === 0 || s < l.s0 - 0.3 || s > l.s1 + 0.3) return;
      test({ s: Math.max(l.s0 + 0.3, Math.min(l.s1 - 0.3, s)), y: l.y, i: -1, lip: k });
    });
    return best;
  }

  function stick(pl: Player): [number, number] {
    const k = pl.keys;
    let x = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    let y = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    if (!x && !y && Math.hypot(pl.joy.x, pl.joy.y) > 0.3) { x = pl.joy.x; y = -pl.joy.y; }
    return [x, y];
  }

  /** Where you are this frame while on the face, out cold, carried or a ghost (false: on your own feet). */
  function cling(dt: number, move: { x: number; y: number }): boolean {
    const pl = body();
    if (!w.me().alive) { if (mode !== M.Free) { mode = M.Free; pt = null; } return false; }
    if (mode === M.Free) return false;
    const [mx, my] = [move.x, move.y];
    const jump = pl.keys.has("Space") || pl.jumpHeld, jumped = jump && !prevJump;
    prevJump = jump;
    const crouchKey = pl.keys.has("KeyC"), latch = pl.crouchLatch;
    const crouched = (crouchKey && !prevCrouch) || (latch && !prevLatch);
    prevCrouch = crouchKey; prevLatch = latch;
    pl.prone = 0;
    if (mode === M.Tween) {
      tT += dt;
      const t = Math.min(1, tT / tLen), e = t * t * (3 - 2 * t);
      place(pl, from.s + (to.s - from.s) * e, from.y + (to.y - from.y) * e + Math.sin(t * Math.PI) * 0.3, from.out + (to.out - from.out) * e);
      if (t >= 1) { const then = tweenThen; tweenThen = null; mode = M.Free; then?.(); }
      return true;
    }
    if (mode === M.Hang) {
      if (pl.crouchLatch) pl.crouchLatch = false;
      prevLatch = false;
      const mul = carrying ? CARRY_MUL : 1;
      const jug = !!pt && pt.i >= 0 && route.holds[pt.i]?.rest;
      if (jug && !carrying) grip = Math.min(cap, grip + JUG_REST * dt);
      else grip -= HANG_DRAIN * mul * dt;
      tT += dt;
      const moving = tT < tLen;
      if (moving) {
        const t = Math.min(1, tT / tLen), e = t * t * (3 - 2 * t);
        place(pl, from.s + (to.s - from.s) * e, from.y + (to.y - from.y) * e, from.out + (to.out - from.out) * e);
      } else place(pl, to.s, to.y, to.out);
      if (grip <= 0) { grip = 0; w.toast("Your grip's gone"); letGo(); return true; }
      if (crouched) { letGo(); return true; }
      if (pt?.i === BRIDGE && !bridged()) { w.toast("The bridge let go"); letGo(); return true; }
      if (moving) return true;
      const [ix, iy] = [mx, my];
      const p = pt!;
      if (jumped) {
        const c = reachFor(p, ix, iy || (ix ? 0 : 1), LUNGE, 0.2);
        if (c && !carrying && grip > 0.05) {
          grip -= LUNGE_COST;
          pt = c;
          tween(bodyAt(p), bodyAt(c), LUNGE_T, null);
          SFX.effort(0, 0, seed);
        } else { letGo(2.5); }
        return true;
      }
      if (!ix && !iy) return true;
      // up from a ledge's lip: over it and onto the ledge
      if (p.lip >= 0 && iy > 0.5) {
        const k = p.lip, a = bodyAt(p), l = route.ledges[k], ss = Math.max(l.s0 + 0.4, Math.min(l.s1 - 0.4, p.s));
        mode = M.Tween;
        tween(a, { s: ss, y: l.y, out: standOut(k, ss) }, MANTLE_T, () => onto(k, p.s));
        SFX.ladderUp();
        return true;
      }
      const c = reachFor(p, ix, iy, REACH);
      if (c) {
        // a long reach takes more out of you than a short one
        const d = Math.hypot(c.s - p.s, c.y - p.y);
        grip -= MOVE_COST * Math.max(0.5, d) * mul;
        pt = c;
        tween(bodyAt(p), bodyAt(c), (MOVE_T * 0.6 + MOVE_T * 0.4 * d) * (carrying ? 1.6 : 1), null);
        SFX.rung();
        return true;
      }
      // down onto something just under your feet
      if (iy < -0.5) {
        const under = map.floor(pl.pos.x, pl.pos.z, pl.pos.y + 0.05);
        if (pl.pos.y - under < 1.2) { letGo(); return true; }
      }
      return true;
    }
    if (mode === M.Rope) {
      const l = route.ledges[rope], below = l.foot, ro = ropeOut(l) + 0.35;
      if (!anchored(rope)) { slip(); return true; }
      grip -= ROPE_DRAIN * dt;
      const iy = my;
      let y = pl.pos.y + iy * ROPE_V * (carrying ? 0.65 : 1) * dt;
      if (crouched || jumped) { letGo(jumped ? 2.5 : 0); return true; }
      if (y >= l.y - 1.7) {
        mode = M.Tween;
        const k = rope;
        tween({ s: l.rope, y, out: ro }, { s: l.rope, y: l.y, out: standOut(k, l.rope) }, MANTLE_T, () => onto(k, l.rope));
        SFX.ladderUp();
        return true;
      }
      const under = Math.max(below, map.floor(pl.pos.x, pl.pos.z, pl.pos.y + 0.05));
      if (iy < 0 && y <= under + 0.05) { place(pl, l.rope, under, ro); letGo(); pl.onGround = true; return true; }
      y = Math.max(under, y);
      place(pl, l.rope, y, ro);
      if (iy) pl.bob += Math.abs(iy) * dt * 10;
      return true;
    }
    if (mode === M.Bridge) {
      if (pl.crouchLatch) pl.crouchLatch = false;
      prevLatch = false;
      const g = gapAt();
      if (!g) { letGo(); return true; }
      grip -= BRIDGE_DRAIN * dt;
      tT += dt;
      const t = Math.min(1, tT / tLen), e = t * t * (3 - 2 * t);
      place(pl, from.s + (to.s - from.s) * e, from.y + (to.y - from.y) * e, from.out + (to.out - from.out) * e);
      if (grip <= 0) { grip = 0; w.toast("Your grip's gone"); letGo(); return true; }
      if (crouched) { letGo(); return true; }
      if (t < 1) return true;
      const ix = mx * g.way;
      if (ix < -0.5) offBridge(g.a, route.gap![0]);
      else if (ix > 0.5) {
        if (mateAcross()) { offBridge(g.b, route.gap![1]); w.toast("A hand from across, and you're over"); }
        else if (performance.now() - slackSaid > 3000) { slackSaid = performance.now(); w.toast("Nobody across yet to take your hand"); }
      }
      return true;
    }
    if (mode === M.Anchor) {
      if (pl.crouchLatch) pl.crouchLatch = false;
      prevLatch = false;
      const l = route.ledges[anchor];
      place(pl, l.rope, l.y, standOut(anchor, l.rope));
      pl.onGround = true;
      const load = onRope(anchor).length;
      if (load) grip -= ANCHOR_DRAIN * load * dt; else grip = Math.min(cap, grip + REST * dt);
      if (grip <= 0) { grip = 0; stopAnchor("The rope's torn out of your hands"); }
      else if (crouched) stopAnchor();
      return true;
    }
    if (mode === M.Out) {
      pl.prone = 1; pl.crouch = 0;
      koVy -= 25 * dt;
      const g = map.floor(pl.pos.x, pl.pos.z, pl.pos.y);
      pl.pos.y = Math.max(g, pl.pos.y + koVy * dt);
      if (pl.pos.y <= g) { koVy = 0; pl.onGround = true; }
      pl.vel.set(0, 0, 0); pl.speed = 0;
      return true;
    }
    if (mode === M.Carried) {
      const c = w.players().find((o) => o.id === carriedBy);
      if (!c) { mode = M.Out; return true; }
      pl.prone = 1;
      pl.pos.set(c.x, c.y + 1.25, c.z);
      pl.vel.set(0, 0, 0); pl.onGround = false; pl.speed = 0;
      return true;
    }
    if (mode === M.Ghost) {
      const [ix, iy] = [mx, my];
      const sn = Math.sin(pl.yaw), cs = Math.cos(pl.yaw);
      pl.pos.x += (-sn * iy + cs * ix) * 6 * dt;
      pl.pos.z += (-cs * iy - sn * ix) * 6 * dt;
      pl.pos.y += ((jump ? 1 : 0) - (crouchKey ? 1 : 0) + Math.sin(pl.pitch) * iy) * 5 * dt;
      // a ghost keeps to the crag
      const [s, out] = local(pl.pos.x, pl.pos.z), [x, z] = P(Math.max(-HALF, Math.min(HALF, s)), Math.max(-BACK, Math.min(FRONT, out)));
      pl.pos.x = x; pl.pos.z = z;
      pl.pos.y = Math.max(room.y0, Math.min(room.top + 12, pl.pos.y));
      pl.vel.set(0, 0, 0); pl.onGround = false; pl.speed = 0;
      return true;
    }
    return false;
  }

  /** On your own feet (or in the air): ropes and holds to grab, and falls to land. */
  function free(pl: Player, dt: number): boolean {
    const jump = pl.keys.has("Space") || pl.jumpHeld;
    prevJump = jump; prevCrouch = pl.keys.has("KeyC"); prevLatch = pl.crouchLatch;
    cool = Math.max(0, cool - dt);
    if (!inRoom(pl.pos.x, pl.pos.y, pl.pos.z)) { air = false; peak = -Infinity; wantGrab = false; return false; }
    const [s, out] = local(pl.pos.x, pl.pos.z);
    // moved further than a fall goes in a frame (put somewhere else): not a fall
    const jumpedTo = Math.hypot(pl.pos.x - lastX, pl.pos.z - lastZ) > 5 + 15 * dt || Math.abs(pl.pos.y - lastY) > 4 + 45 * dt;
    lastX = pl.pos.x; lastY = pl.pos.y; lastZ = pl.pos.z;
    if (jumpedTo) { air = false; peak = -Infinity; flail = 0; }
    // falls
    if (!pl.onGround) {
      if (!air) { air = true; peak = pl.pos.y; yelled = false; flail = 0; }
      peak = Math.max(peak, pl.pos.y);
      const drop = peak - pl.pos.y;
      if (drop > SHORT_FALL) {
        flail += dt;
        pl.prone = Math.min(1, flail * 3);
        pl.yaw += Math.sin(flail * 9) * dt * 5;
        if (!yelled && drop > 3.5) { yelled = true; SFX.shout(0, 0, seed + L); }
      }
    } else if (air) {
      air = false;
      const drop = peak - pl.pos.y;
      peak = -Infinity;
      if (flail > 0) pl.prone = 0.6;
      flail = 0;
      if (drop > SHORT_FALL) fell(pl, drop);
    }
    // grip back on something solid, and the hurt goes after a rest
    if (pl.onGround) {
      grip = Math.min(cap, grip + REST * dt);
      still = pl.speed < 0.5 ? still + dt : 0;
      if (still > 2) cap = Math.min(1, cap + HEAL * dt);
      const k = ledgeAt(pl.pos.x, pl.pos.y, pl.pos.z, true);
      if (k >= 0) reached(k);
      if (k === S() && L < S() && lastOn !== k) guide("Walked round? It only counts if you climb it");
      lastOn = k;
    } else lastOn = -1;
    if (cool > 0) { wantGrab = false; return false; }
    // walking into the face, or E
    const [, iy] = stick(pl);
    const facing = -Math.sin(pl.yaw) * -room.nx + -Math.cos(pl.yaw) * -room.nz;
    const pushing = iy > 0.5 && facing > 0.5;
    if (!(pushing || wantGrab)) return false;
    const ask = wantGrab;
    wantGrab = false;
    // a dropped rope
    for (const k of ropes) {
      const l = route.ledges[k], ro = ropeOut(l);
      if (Math.abs(s - l.rope) < 0.9 && out > ro - 1.4 && out < ro + 0.9 && pl.pos.y > l.foot - 0.6 && pl.pos.y < l.y - 1.2) {
        if (!anchored(k)) {
          if (performance.now() - slackSaid > 4000) { slackSaid = performance.now(); guide("That rope's slack: a mate up on its ledge has to hold it ({use} at its top)"); }
          continue;
        }
        mode = M.Rope; rope = k;
        place(pl, l.rope, Math.max(l.foot, pl.pos.y), ro + 0.35);
        SFX.rung();
        return true;
      }
    }
    if (grip < 0.08) { if (ask) guide("No grip left: rest on something first"); return false; }
    const c = inReach(s, out, pl.pos.y, pl.onGround);
    if (c) { grabbed(c, pl.onGround ? 0 : CATCH_COST); return true; }
    return false;
  }

  function fell(pl: Player, drop: number) {
    SFX.thump();
    SFX.land(true, 1);
    w.dust?.(pl.pos.x, pl.pos.y + 0.1, pl.pos.z, room.nx, room.nz);
    pl.landKick = 0.25;
    const ev = { k: "fall", s: seed, d: Math.round(drop * 10) / 10, x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, l: Math.floor(Math.random() * FALLS.length) };
    w.send("qe", ev);
    job.event!(ev, w.selfId);
    if (drop >= BIG_FALL) {
      mode = M.Out; koVy = 0;
      SFX.groan(0, 0, seed);
    } else {
      cap = Math.max(0.3, cap - HURT);
      grip = Math.min(grip, cap);
      still = 0;
      SFX.grunt(0, 0, seed);
      if (drop > 4.5) guide("Oof. That one hurt: rest on a ledge to get your grip back"); else w.toast("Ouch");
    }
  }

  const statusLine = () => {
    const out: string[] = [];
    for (const [id, s] of status) {
      const who = id === w.selfId ? "You" : w.nameOf(id);
      if (s.st === "ko") out.push(`${who}: out cold, ${Math.ceil(s.left)}s${s.by ? `, carried by ${s.by === w.selfId ? "you" : w.nameOf(s.by)}` : ""}`);
      else out.push(`${who}: a ghost till a rope comes down`);
    }
    return out.join(" · ");
  };

  // ---- the host ----
  function hostSay(d: Record<string, unknown>) {
    const ev = { ...d, s: seed };
    w.send("qe", ev);
    job.event!(ev, w.selfId);
  }

  function reset() {
    ropes.clear(); status.clear(); cp = 0; L = 0; held = 0; anchor = -1;
    carrying = ""; carriedBy = "";
    const pl = body();
    pl.prone = 0;
    if (mode !== M.Free || meIn()) toFoot();
    grip = cap = 1;
    drawRopes();
  }

  /** Up to the crag, onto the grass at its foot, facing the face. */
  function toFoot() {
    const pl = body();
    mode = M.Free; pt = null; rope = -1; anchor = -1;
    const [x, z] = P(((hash(w.selfId) % 100) / 100 - 0.5) * HALF, 4 + (hash(w.selfId, "out") % 30) / 10);
    w.moveTo(x, z, Math.atan2(room.nx, room.nz));
    pl.pos.y = room.y0;
    pl.vel.set(0, 0, 0);
    pl.onGround = true;
  }

  /** Back down to the street, in front of the face on the map. */
  function toStreet() {
    const pl = body();
    if (!pl) return;
    mode = M.Free; pt = null; rope = -1; anchor = -1;
    pl.prone = 0;
    const [x, z] = onFace(f, ((hash(w.selfId) % 100) / 100 - 0.5) * WIDTH * 0.6, DEPTH + 4);
    w.moveTo(x, z, Math.atan2(f.nx, f.nz));
  }

  const job: Job = {
    offer, done: null,
    update(dt) {
      if (dt <= 0) return;
      hook();
      const pl = body();
      if (!pl) return;
      if (mode === M.Free && w.me().alive) free(pl, dt);
      for (const s of status.values()) if (s.st === "ko") s.left = Math.max(0, s.left - dt);
      // other climbers' shoulders, crouched for a boost
      const now = performance.now();
      shoulders = [];
      for (const p of w.players()) {
        if (p.id === w.selfId) continue;
        const r = reports.get(p.id);
        if (r && r.c && r.m === M.Free && now - r.t < 1500) shoulders.push([p.x, p.z, p.y + SHOULDERS]);
      }
      // the KO'd and the ghosts, seen
      let n = 0;
      for (const p of w.players()) {
        const s = status.get(p.id);
        if (!s || p.id === w.selfId) continue;
        let m = marks[n];
        if (!m) {
          m = new THREE.Group();
          for (let i = 0; i < 3; i++) m.add(new THREE.Mesh(star, gold));
          m.add(new THREE.Mesh(ghostGeo, mist));
          group.add(m); marks.push(m);
        }
        m.visible = true;
        m.position.set(p.x, p.y + (s.st === "ko" ? 0.5 : 1), p.z);
        m.children.forEach((c, i) => {
          if (i < 3) { c.visible = s.st === "ko"; const a = now / 400 + (i * Math.PI * 2) / 3; c.position.set(Math.cos(a) * 0.4, 0.35, Math.sin(a) * 0.4); c.rotation.y = a * 2; }
          else c.visible = s.st === "ghost";
        });
        n++;
      }
      for (let i = n; i < marks.length; i++) marks[i].visible = false;
      // the others' arms: on the wall, or flailing all the way down
      for (const p of w.players()) {
        if (p.id === w.selfId) continue;
        const r = reports.get(p.id), arms = !r || now - r.t > 1500 ? "" : r.f ? "flail" : r.m === M.Hang || r.m === M.Rope || r.m === M.Anchor || r.m === M.Bridge ? "push" : "";
        if ((posed.get(p.id) ?? "") !== arms) { w.pose?.(p.id, 0, arms); if (arms) posed.set(p.id, arms); else posed.delete(p.id); }
      }
      dress.banner.rotation.y = crag.banner.rotation.y = Math.sin(now / 300) * 0.3;
      if (shown) crag.drift(now / 1000);
      // the crag is only drawn while someone could see it: from up there
      const cam = w.look(), see = cam.y > room.y0 - 200 && Math.hypot(cam.x - room.ox, cam.z - room.oz) < 800;
      if (see !== shown) { shown = see; if (see) group.add(crag.group); else group.remove(crag.group); }
      const inside = inRoom(pl.pos.x, pl.pos.y, pl.pos.z);
      if (inside === marked) { marked = !inside; w.mark("@challenge", marked ? { x: f.ox + f.nx * 3, z: f.oz + f.nz * 3, y: f.y0 } : null, offer.title, COLOUR); }
      if ([...heldRopes()].join() !== heldKey) drawRopes();
      // grip on screen
      gripBar(pl);
      strainBar();
      // say what I'm doing
      if ((sendT -= dt) <= 0) {
        sendT = SEND;
        if (inside || Math.hypot(pl.pos.x - room.ox, pl.pos.z - room.oz) < 200) {
          const on = mode === M.Free || mode === M.Out ? ledgeAt(pl.pos.x, pl.pos.y, pl.pos.z, pl.onGround) : mode === M.Anchor ? anchor : -1;
          const a = mode === M.Anchor ? anchor : -1, r = mode === M.Rope ? rope : -1, h = mode === M.Hang && pt ? pt.i : -1;
          const d = { k: "cs", s: seed, m: mode, g: Math.round(grip * 100) / 100, c: mode === M.Free && pl.crouch > 0.6 && pl.onGround ? 1 : 0, L, on, cy: carrying, f: flail > 0 ? 1 : 0, i: inside ? 1 : 0, a, r, h };
          w.send("qe", d);
          reports.set(w.selfId, { m: d.m, g: d.g, c: d.c, L, on, cy: carrying, f: d.f, i: d.i, a, r, h, t: now });
        }
      }
    },
    host(dt) {
      if (job.done) return;
      if (!fixed) { hostSay({ k: "n", n: Math.max(1, cast.length) }); }
      if (!enrolled) {
        enrolled = true;
        hostSay({ k: "cl", ids: w.players().filter((p) => cast.includes(p.id) || inRoom(p.x, p.y, p.z)).map((p) => p.id) });
      }
      const now = performance.now();
      const ids = new Set(w.players().map((p) => p.id));
      for (const id of [...status.keys()]) if (!ids.has(id)) { status.delete(id); hostSay({ k: "gone", id }); }
      for (const [id, s] of status) {
        if (s.st !== "ko") continue;
        if (s.by && (!ids.has(s.by) || status.has(s.by))) { hostSay({ k: "drop", id }); continue; }
        if (s.left <= 0) { hostSay({ k: "out", id }); continue; }
        const r = s.by ? reports.get(s.by) : null;
        if (r && r.on >= 0 && r.on >= cp) hostSay({ k: "up", id, i: r.on });
      }
      // the team's ledge: the highest anyone still climbing has got to
      let top = 0;
      for (const id of ids) if (!status.has(id)) top = Math.max(top, reports.get(id)?.L ?? 0);
      if (top > cp) hostSay({ k: "cp", i: top });
      // everyone down: back to the bottom
      // gone back down to the street: not climbing any more, till they take a hold again
      const joined = [...climbers].filter((id) => ids.has(id) && (reports.get(id)?.i ?? 1) === 1);
      for (const [id, r] of reports) if (ids.has(id) && !climbers.has(id) && (r.i === 1 || r.m === M.Hang || r.m === M.Rope || r.m === M.Bridge)) joined.push(id);
      if (joined.length !== climbers.size || joined.some((id) => !climbers.has(id))) hostSay({ k: "cl", ids: joined });
      const down = climbers.size > 0 && [...climbers].every((id) => status.has(id));
      failT = down ? failT + dt : 0;
      if (failT > 2.5) { failT = 0; hostSay({ k: "fail" }); return; }
      // everyone stood at the top
      const all = climbers.size > 0 && [...climbers].every((id) => { const r = reports.get(id); return !status.has(id) && r && now - r.t < 2000 && r.on === S() && r.L === S(); });
      held = all ? held + dt : 0;
      if (held >= WIN_HOLD && !won) hostSay({ k: "won" });
    },
    event(d, from) {
      if (!d || typeof d !== "object") return;
      const pl = body();
      switch (d.k) {
        case "cs": {
          reports.set(from, { m: +d.m || 0, g: +d.g || 0, c: d.c ? 1 : 0, L: +d.L || 0, on: Number.isFinite(+d.on) ? +d.on : -1, cy: String(d.cy ?? ""), f: d.f ? 1 : 0, i: d.i === 0 ? 0 : 1, a: Number.isFinite(+d.a) ? +d.a : -1, r: Number.isFinite(+d.r) ? +d.r : -1, h: Number.isFinite(+d.h) ? +d.h : -1, t: performance.now() });
          return;
        }
        case "n": {
          const n = Math.max(1, Math.min(8, Math.floor(+d.n) || 1));
          fixed = true;
          if (lives === most) lives = most = livesFor(n);
          if (n !== route.n) {
            route = routeFor(room, seed, n);
            build();
            if (mode === M.Hang || mode === M.Rope || mode === M.Bridge) letGo();
          }
          return;
        }
        case "fall": {
          if (from !== w.selfId) {
            const [dd, pan] = w.hear?.(+d.x, +d.y, +d.z) ?? [0, 0];
            SFX.thump();
            if (+d.d >= BIG_FALL) SFX.groan(dd, pan, seed);
          }
          const who = from === w.selfId ? "You" : w.nameOf(from);
          if (+d.d >= BIG_FALL) w.feed(`${named(who, w.colourOf(from))} ${FALLS[(+d.l || 0) % FALLS.length]} and ${from === w.selfId ? "are" : "is"} out cold`);
          if (w.isHost && +d.d >= BIG_FALL && !status.has(from)) hostSay({ k: "ko", id: from, t: DOWN_SECS });
          if (w.isHost && +d.d >= LIFE_FALL && lives > 0 && (climbers.has(from) || !climbers.size)) {
            hostSay({ k: "lv", n: lives - 1, id: from });
            if (lives <= 0) hostSay({ k: "fail", why: "lives" });
          }
          return;
        }
        case "lv": {
          const n = Math.max(0, Math.floor(+d.n) || 0), id = String(d.id ?? "");
          if (n >= lives) return;
          lives = n;
          SFX.lifeLost();
          const who = id === w.selfId ? "You" : w.nameOf(id);
          w.feed(`${named(who, w.colourOf(id))} fell: the team's down to ${n} ${n === 1 ? "life" : "lives"}`);
          missionCall({ text: n ? "A life gone!" : "No lives left!", sub: `${who} fell`, went: "badly" });
          if (id === w.selfId && n) w.toast(`That cost the team a life: ${n} left`);
          return;
        }
        case "ko": {
          const id = String(d.id);
          status.set(id, { st: "ko", left: +d.t || DOWN_SECS, by: "" });
          if (id === w.selfId) {
            if (mode !== M.Out) { mode = M.Out; koVy = 0; pt = null; anchor = -1; }
            if (carrying) { carrying = ""; }
            w.toast(`Out cold. A mate has to carry you up to the ledge the team's on within ${Math.round(+d.t || DOWN_SECS)}s`);
          }
          if (carrying === id) carrying = "";
          return;
        }
        case "pick": {
          const id = String(d.id), s = status.get(id);
          if (w.isHost && s?.st === "ko" && !s.by && !status.has(from) && ![...status.values()].some((o) => o.by === from)) hostSay({ k: "carry", id, by: from });
          return;
        }
        case "help": {
          const id = String(d.id), s = status.get(id), r = reports.get(id);
          if (w.isHost && s?.st === "ko" && !s.by && r && r.on >= cp && r.on >= 0) hostSay({ k: "up", id, i: r.on });
          return;
        }
        case "carry": {
          const id = String(d.id), by = String(d.by), s = status.get(id);
          if (s) s.by = by;
          if (by === w.selfId) { carrying = id; SFX.effort(0, 0, seed); w.toast(`Got ${w.nameOf(id)}. Get them up to ledge ${cp} in time`); }
          if (id === w.selfId) { mode = M.Carried; carriedBy = by; }
          return;
        }
        case "put": {
          if (w.isHost) { const id = String(d.id); if (status.get(id)?.by === from) hostSay({ k: "drop", id }); }
          return;
        }
        case "drop": {
          const id = String(d.id), s = status.get(id);
          if (s) s.by = "";
          if (carrying === id) carrying = "";
          if (id === w.selfId && mode === M.Carried) { mode = M.Out; koVy = 0; carriedBy = ""; }
          return;
        }
        case "up": {
          const id = String(d.id), s = status.get(id), i = +d.i || 0;
          if (s?.by === w.selfId) carrying = "";
          status.delete(id);
          if (id === w.selfId) {
            mode = M.Free; carriedBy = ""; pl.prone = 0; grip = Math.min(grip, 0.5); cap = Math.max(0.5, cap - HURT);
            const l = route.ledges[Math.min(i, S())];
            const [s2] = local(pl.pos.x, pl.pos.z);
            if (i > 0) { L = Math.max(L, i - 1); onto(i, s2); } else { L = Math.max(L, 0); pl.vel.set(0, 0, 0); }
            if (l) w.toast("Back on your feet");
            SFX.checkpoint();
          }
          w.feed(`${named(id === w.selfId ? "You" : w.nameOf(id), w.colourOf(id))} ${id === w.selfId ? "are" : "is"} back on ${id === w.selfId ? "your" : "their"} feet`);
          return;
        }
        case "out": {
          const id = String(d.id), s = status.get(id);
          if (s?.by === w.selfId) carrying = "";
          status.set(id, { st: "ghost", left: 0, by: "" });
          if (id === w.selfId) { mode = M.Ghost; carriedBy = ""; pl.prone = 0; w.toast("You're out: a ghost, till someone drops a rope from the next ledge"); }
          w.feed(`${named(id === w.selfId ? "You" : w.nameOf(id), w.colourOf(id))} ${id === w.selfId ? "are" : "is"} out`);
          return;
        }
        case "rope": {
          const i = +d.i;
          if (!(i >= 1 && i <= S())) return;
          const fresh = !ropes.has(i);
          ropes.add(i);
          drawRopes();
          if (fresh) {
            const [x, z] = P(route.ledges[i].rope, ropeOut(route.ledges[i]));
            const [dd, pan] = w.hear?.(x, route.ledges[i].y, z) ?? [0, 0];
            SFX.lash(dd, pan);
            w.feed(`${named(from === w.selfId ? "You" : w.nameOf(from), w.colourOf(from))} dropped a rope from ledge ${i === S() ? "at the top" : i}`);
          }
          if (w.isHost) {
            const ghosts = [...status].filter(([, s]) => s.st === "ghost").map(([id]) => id);
            if (ghosts.length) hostSay({ k: "back", ids: ghosts, i });
          }
          return;
        }
        case "back": {
          const i = Math.min(S(), Math.max(0, +d.i || 0));
          for (const id of Array.isArray(d.ids) ? d.ids.map(String) : []) {
            status.delete(id);
            if (id === w.selfId) {
              mode = M.Free; grip = cap = 1;
              L = Math.max(L, i - 1);
              onto(i, route.ledges[i].rope);
              w.toast("Back in! Up the rope with you");
              SFX.checkpoint();
            }
          }
          return;
        }
        case "pull": {
          if (String(d.id) !== w.selfId || (mode !== M.Hang && mode !== M.Rope && mode !== M.Free)) return;
          const i = Math.min(S(), Math.max(1, +d.i || 1)), l = route.ledges[i];
          const [s, out] = local(pl.pos.x, pl.pos.z);
          if (pl.pos.y < l.y - 4.5 || pl.pos.y > l.y - 0.3) return;
          mode = M.Tween; pt = null; rope = -1;
          const ss = Math.max(l.s0 + 0.4, Math.min(l.s1 - 0.4, +d.ps || s));
          tween({ s, y: pl.pos.y, out }, { s: ss, y: l.y, out: standOut(i, ss) }, PULL_T, () => { L = Math.max(L, i - 1); onto(i, +d.ps || s); });
          w.toast(`${w.nameOf(from)} hauls you up`);
          SFX.effort(0, 0, seed + 1);
          return;
        }
        case "cp": {
          const i = +d.i || 0;
          if (i > cp) { cp = i; SFX.jobStep(); }
          return;
        }
        case "gone": { status.delete(String(d.id)); return; }
        case "cl": { climbers = new Set(Array.isArray(d.ids) ? d.ids.map(String) : []); enrolled = true; return; }
        case "fail": {
          fails++;
          const out = d.why === "lives";
          w.feed(out ? "Out of lives. Back to the bottom" : "Everyone's down. Back to the bottom");
          SFX.lifeLost();
          missionCall({ text: out ? "Out of lives" : "Everyone's down", sub: `Back to the bottom: the whole team starts again · ${most} lives for the next go`, went: "badly" });
          lives = most;
          reset();
          return;
        }
        case "won": {
          if (job.done) return;
          won = true;
          job.done = { won: true, title: "On top of the crag!", card: { stats: [{ k: "Lives left", v: `${lives} of ${most}` }] }, text: "The whole team stood on top of the crag together", x: ex, z: ez, wear: lives === most ? ["rope"] : [] };
          release();
          return;
        }
      }
    },
    progress: () => ({ n: route.n, lv: lives, mx: most, cp, fails, cl: [...climbers], ropes: [...ropes], st: [...status].map(([id, s]) => [id, s.st, Math.round(s.left), s.by]) }),
    restore(p) {
      if (!p || typeof p !== "object") return;
      if (+p.n && +p.n !== route.n) { route = routeFor(room, seed, Math.max(1, Math.min(8, Math.floor(+p.n)))); build(); }
      fixed = true;
      cp = +p.cp || 0; fails = +p.fails || 0;
      if (+p.mx > 0) { most = Math.floor(+p.mx); lives = Math.max(0, Math.min(most, Math.floor(+p.lv) || 0)); }
      if (Array.isArray(p.cl)) { climbers = new Set(p.cl.map(String)); enrolled = true; }
      ropes.clear();
      for (const i of Array.isArray(p.ropes) ? p.ropes : []) if (+i >= 1 && +i <= S()) ropes.add(+i);
      drawRopes();
      status.clear();
      for (const e of Array.isArray(p.st) ? p.st : []) if (Array.isArray(e) && (e[1] === "ko" || e[1] === "ghost")) status.set(String(e[0]), { st: e[1], left: +e[2] || 0, by: String(e[3] ?? "") });
      const me = status.get(w.selfId);
      if (me?.st === "ghost") mode = M.Ghost;
      else if (me?.st === "ko") mode = me.by ? M.Carried : M.Out;
      if (me?.by) carriedBy = me.by;
    },
    aloft: () => meIn(),
    perch(dt, move) {
      const pl = body();
      if (!pl || !cling(dt, move)) return null;
      pl.forgetJump();
      return { x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, bare: true };
    },
    use() {
      const act = action();
      if (!act) return false;
      act.go();
      return true;
    },
    hint() { return action()?.say ?? hang(); },
    card() {
      const mine = status.get(w.selfId);
      const line = mine?.st === "ko" ? `Out cold: ${Math.ceil(mine.left)}s for a mate to carry you up`
        : mine?.st === "ghost" ? "A ghost: wait for a rope from the next ledge"
          : carrying ? `Carry ${w.nameOf(carrying)} up to ${cp ? `ledge ${cp}` : "the foot"}`
            : !meIn() ? `Go to ${f.name}: {use} at its foot to go up` : L >= S() ? "Wait at the top for everyone" : "Get everyone to the top together";
      return {
        line: `${hearts(lives, most)} ${line}`, sub: [`Climbers: ${climbers.size}`, statusLine()].filter(Boolean).join(" · "),
        progress: `Ledge ${cp} / ${S()}`, bar: cp / Math.max(1, S()),
        stage: { key: `cp${cp}:${fails}`, title: cp ? (cp === S() ? "The top!" : `Ledge ${cp}`) : fails ? "Back to the bottom" : "The Climb", sub: cp ? "The team's got this far" : undefined, colour: COLOUR },
      };
    },
    end() {
      const up = meIn();
      release();
      if (up) toStreet();
      const i = map.floors.indexOf(floor); if (i >= 0) map.floors.splice(i, 1);
      const k = map.pushers.indexOf(pusher); if (k >= 0) map.pushers.splice(k, 1);
      w.scene.remove(group);
      for (const d of disposables) d.dispose();
      w.mark("@challenge", null);
      for (const id of posed.keys()) w.pose?.(id, 0, "");
      missionAux("grip", null);
      missionAux("strain", null);
    },
  };

  /** Off the face and back to yourself, at the end. */
  function release() {
    const pl = body();
    if (pl && mode !== M.Free) { pl.prone = 0; pl.onGround = false; }
    mode = M.Free; pt = null; carrying = ""; carriedBy = ""; anchor = -1;
  }

  /** What use does here, and what to say about it. */
  function action(): { say: string; go: () => void } | null {
    const pl = body();
    if (!pl || job.done) return null;
    if (mode === M.Out || mode === M.Carried || mode === M.Ghost || mode === M.Tween) return null;
    const me = w.me(), E = "<b>{use}</b>";
    if (mode === M.Bridge) {
      const g = gapAt();
      return { say: `${E} Come back off the gap · ${mateAcross() ? "a mate's across: reach their way to follow" : "hold on while the others climb over you"}`, go: () => { if (g) offBridge(g.a, route.gap![0]); } };
    }
    if (mode === M.Hang && route.gap && pt?.i === route.gap[0] && team() && !bridged()) {
      return { say: `${E} Stretch across the gap, a bridge for the others to climb over`, go: startBridge };
    }
    if (mode === M.Anchor) {
      const on = onRope(anchor).map((id) => esc(w.nameOf(id)));
      return { say: `${E} Let go of the rope · ${on.length ? `holding ${on.join(" and ")}: don't let go yet` : "nobody on it yet"}`, go: () => stopAnchor() };
    }
    if (carrying) return { say: `${E} Put ${esc(w.nameOf(carrying))} down`, go: () => { w.send("qe", { k: "put", s: seed, id: carrying }); if (w.isHost) job.event!({ k: "put", id: carrying }, w.selfId); } };
    if (!inRoom(me.x, me.y, me.z)) {
      if (!me.alive || footDist(f, me.x, me.z) > UP) return null;
      return { say: `${E} Up to the crag`, go: toFoot };
    }
    const on = mode === M.Free ? ledgeAt(me.x, me.y, me.z, pl.onGround) : -1;
    // a mate out cold beside you
    for (const p of w.players()) {
      const s = status.get(p.id);
      if (p.id === w.selfId || s?.st !== "ko" || s.by || Math.hypot(p.x - me.x, p.z - me.z) > 2 || Math.abs(p.y - me.y) > 1.6 || mode !== M.Free) continue;
      const r = reports.get(p.id);
      if (r && r.on >= 0 && r.on >= cp) return { say: `${E} Help ${esc(p.name)} up`, go: () => { const d = { k: "help", s: seed, id: p.id }; w.send("qe", d); if (w.isHost) job.event!(d, w.selfId); } };
      return { say: `${E} Pick ${esc(p.name)} up`, go: () => { const d = { k: "pick", s: seed, id: p.id }; w.send("qe", d); if (w.isHost) job.event!(d, w.selfId); } };
    }
    if (on === 0) {
      const [s, out] = local(me.x, me.z);
      if (Math.hypot(s - STILE, out - STILE_OUT) < 2.5) return { say: `${E} Take the way down, back to the street`, go: toStreet };
    }
    if (on >= 1) {
      const l = route.ledges[on], [s, out] = local(me.x, me.z), lip = lipOut(on, s);
      // a mate below to haul up
      if (out > lip - 1.2) {
        for (const p of w.players()) {
          if (p.id === w.selfId || status.has(p.id)) continue;
          const [ps, po] = local(p.x, p.z);
          if (p.y < l.y - 4.5 || p.y > l.y - 0.3 || Math.abs(ps - s) > 1.8 || po < lip - 2 || po > lip + 3) continue;
          if (ps < l.s0 - 0.5 || ps > l.s1 + 0.5) continue;
          return { say: `${E} Pull ${esc(p.name)} up`, go: () => { grip = Math.max(0, grip - 0.12); const d = { k: "pull", s: seed, id: p.id, i: on, ps: s }; w.send("qe", d); SFX.effort(0, 0, seed + 2); } };
        }
      }
      // the rope coiled on this ledge
      const ghosts = [...status.values()].some((x) => x.st === "ghost");
      const drop = () => { const d = { k: "rope", s: seed, i: on }; w.send("qe", d); job.event!(d, w.selfId); };
      if (Math.abs(s - l.rope) < 1.6 && (!ropes.has(on) || (ghosts && on >= cp))) {
        if (!ropes.has(on) && team()) return { say: `${E} Drop a rope and hold it for the others`, go: () => { drop(); startAnchor(on); } };
        return { say: ropes.has(on) ? `${E} Drop the rope again, for the ghosts` : `${E} Drop a rope for the others`, go: drop };
      }
      if (Math.abs(s - l.rope) < 1.6 && ropes.has(on) && !anchored(on)) return { say: `${E} Hold the rope, so the others can climb it`, go: () => startAnchor(on) };
    }
    if (mode === M.Free && grip >= 0.08) {
      const [s, out] = local(me.x, me.z);
      if (inReach(s, out, me.y, pl.onGround)) return { say: `${E} Grab the hold`, go: () => { wantGrab = true; } };
    }
    return null;
  }

  /** The prompt on the face, or at the foot of a gap. */
  function hang(): string {
    const pl = body();
    if (!pl) return "";
    if (mode === M.Hang) return `${pt && pt.i >= 0 && route.holds[pt.i]?.rest ? "A jug: hang here to get your grip back · " : ""}${strip("climb", ["climb.reach", "climb.lunge", "climb.letgo"])}`;
    if (mode === M.Rope) return strip("climb", ["climb.rope", "climb.letgo"]);
    if (mode === M.Anchor) return strip("climb", ["climb.letgo"]);
    if (mode === M.Ghost) return "You're a ghost: fly about and watch";
    if (mode !== M.Free || !pl.onGround) return "";
    const me = w.me(), k = ledgeAt(me.x, me.y, me.z, true);
    if (k < 0 || k >= S()) return "";
    const [s] = local(me.x, me.z), next = route.holds.find((h) => h.boost && h.y > route.ledges[k].y && h.y < route.ledges[k].y + STACK_HOLD + 0.1);
    if (next && Math.abs(next.s - s) < 2.5 && !ropes.has(k + 1)) {
      return next.two ? "Out of reach even off one mate: one crouches ({crouch}), the next stands on their shoulders and crouches too, and you climb up on top"
        : "Out of reach: a mate crouches ({crouch}) and you stand on their shoulders";
    }
    return "";
  }

  // ---- the strain on the rope you're holding: one bar a climber ----
  function strainBar() {
    const load = mode === M.Anchor ? onRope(anchor).length : -1;
    if (load < 0) { missionAux("strain", null); return; }
    const pips = Array.from({ length: Math.max(3, load) }, (_v, i) => `<i style="display:inline-block;width:18px;height:8px;margin:0 2px;border:1px solid rgba(255,255,255,.6);background:${i < load ? (load > 1 ? "#ff6a4a" : "#ffb347") : "transparent"}"></i>`).join("");
    missionAux("strain", `<div style="font-size:12px;text-align:center">Rope ${pips}</div>`);
  }

  // ---- the grip meter ----
  // a thin bar in the shared slot under the crosshair (missionscreens.ts): written once, then only its fills move
  function gripBar(pl: Player | undefined) {
    const show = !!pl && (mode === M.Hang || mode === M.Rope || mode === M.Anchor || mode === M.Bridge || grip < cap - 0.02 || cap < 0.99) && inRoom(pl.pos.x, pl.pos.y, pl.pos.z);
    let row = missionAuxRow("grip");
    if (!show) { if (row && !row.hidden) row.hidden = true; return; }
    if (!row) {
      missionAux("grip", `<div class="aux-meter thin" style="border-color:rgba(255,255,255,.5);background:rgba(0,0,0,.45)"><i style="background:#e9e1cf"></i><i style="left:auto;right:0;background:rgba(160,40,30,.7)"></i></div>`);
      row = missionAuxRow("grip")!;
    }
    if (row.hidden) row.hidden = false;
    const bar = row.children[0];
    const fill = bar.children[0] as HTMLElement, hurt = bar.children[1] as HTMLElement;
    fill.style.width = `${Math.max(0, grip) * 100}%`;
    fill.style.background = grip < 0.25 ? (Math.floor(performance.now() / 150) % 2 ? "#ff6a4a" : "#ffd0a0") : "#e9e1cf";
    hurt.style.width = `${(1 - cap) * 100}%`;
  }

  // everyone who entered goes up together
  hook();
  if (w.me().alive && cast.includes(w.selfId)) toFoot();
  // for tools/climb_team_probe.mjs and tools/climb_gates_probe.mjs
  Object.assign(job, { probe: { face: { ...room, base: room.y0, crag: true }, entry: f, route: () => route, mode: () => mode, grip: () => grip, cap: () => cap, L: () => L, cp: () => cp, status: () => [...status], lives: () => lives, spare: () => { lives = most = 99; }, ropes: () => [...ropes], carrying: () => carrying, climbers: () => [...climbers], hurry: () => { for (const x of status.values()) x.left = Math.min(x.left, 0.5); }, hang: (i: number) => { const h = route.holds[i]; grabbed({ s: h.s, y: h.y, i, lip: -1 }, 0); }, pt: () => pt, anchor: () => anchor, across: () => mateAcross(), held: () => [...heldRopes()], P, local, rock } });
  return job;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function inRing(r: number[][], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside;
  }
  return inside;
}
