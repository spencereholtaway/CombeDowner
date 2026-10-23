// Climbing Bath Abbey: always on, with nothing to take and no clock, just a hard way up from the
// churchyard to the top of the tower, where there's a pair of angel's wings (wings.ts). The way up
// is the Abbey's own (landmarks/abbey.ts, abbeyclimb.ts), for those who find it:
// - the ladder of angels on the north turret of the west front is a real ladder, off the mounting
//   stone at its foot, all the way up to the turret's crown;
// - over the roofs and along the nave's ridge to the tower;
// - up onto the ledge round the tower (jump at it from the ridge), along it and over the gap in
//   it, a running jump 27 m up;
// - and up the stones jutting from the tower's north face, a zigzag stair of jumps, to the
//   battlements.
// Fall and you land on whatever's below: a stone, the ledge, the roof, or the churchyard to start
// again. All this file does is mark the Abbey on the maps, drop a hint at its foot, and slide the
// tower's ledge and stones out of its walls just ahead of whoever is climbing, with a scrape, a
// thump and a puff of dust for each. From the churchyard none of it shows. Once someone is up on
// the roofs the first bit of ledge comes out, shimmering gold; as they go round it the rest follows
// a few metres ahead, and when they near the stones, the stones take over (the first one
// shimmering), a few at a time just above the highest climber. It all draws back in, last piece
// first, once the climbers are gone. It's solid the whole time (landmarks/shape.ts), so nobody
// climbing ever loses their footing.
//
// Who decides what: nothing is sent. Where it all is comes from the map.
import * as THREE from "three";
import { abbeyClimb } from "./abbeyclimb";
import * as SFX from "./audio";
import { CLIMB, ringDist, STONE_SLIDE } from "./landmarks/abbey";
import type { JobSpot } from "./minimap";
import { registerFree, type QuestWorld } from "./quests";

const COLOUR = "#f2cf5b";
const HINT = 25;           // metres from the north turret's foot to be told about the climb

const NEAR_TOWER = 10;     // metres from the tower's walls that someone counts as climbing it
const ON_LEDGE = 3;        // metres from the tower's walls that someone on the ledge's height is on the ledge
const AHEAD = 3;           // metres above the highest climber that stones are out
const LEDGE_AHEAD = 8;     // metres further round the ledge, past the climber, that it's out
const UP = 6, DOWN = 2.5;  // metres a second the reach rises and falls: out quickly, back in slowly
const LEDGE_DOWN = 9;      // the ledge is long, so it draws back in faster

type Spot = { order: number; at: THREE.Vector3; nx: number; nz: number };
type Layer = { mesh: THREE.Mesh | null; spots: Spot[]; was: number[]; reach: number; idle: number };
const layer = (): Layer => ({ mesh: null, spots: [], was: [], reach: 0, idle: 0 });
let told = false, toldLedge = false;
let ledgeLayer = layer(), stoneLayer = layer();
let tended: object | null = null;
let looked = 0;
let glowLedge = 0, glowStone = 0;

function findMeshes(w: QuestWorld, now: number) {
  if (now - looked < 2000) return;
  looked = now;
  w.scene.traverse((o) => {
    if (o.userData.steps) stoneLayer.mesh = o as THREE.Mesh;
    else if (o.userData.ledge) ledgeLayer.mesh = o as THREE.Mesh;
  });
}

/** Where a piece meets the tower's wall, and which way it sticks out, for its dust. */
function spotFor(ab: NonNullable<ReturnType<typeof abbeyClimb>>, a: number, b: number, c: number, d: number, y: number, order: number): Spot {
  const { tower } = CLIMB, cx = (a + b) / 2, cz = (c + d) / 2;
  const wall = ab.frame.at(Math.max(tower.x0, Math.min(tower.x1, cx)), y, Math.max(-tower.z, Math.min(tower.z, cz)));
  const o = ab.frame.at(cx, y, cz), n = Math.hypot(o.x - wall.x, o.z - wall.z) || 1;
  return { order, at: wall, nx: (o.x - wall.x) / n, nz: (o.z - wall.z) / n };
}

/** Eases a layer's reach towards what's wanted, sounds each piece as it comes out, and gives its shader the reach. */
function drive(L: Layer, want: number, down: number, dt: number, w: QuestWorld, glow: number) {
  L.reach = want > L.reach ? Math.min(want, L.reach + dt * UP) : Math.max(want, L.reach - dt * down);
  const grow = (L.mesh!.material as THREE.Material).userData.grow as { reach: { value: number }; glow: { value: number } } | undefined;
  if (!grow) return;
  grow.reach.value = L.reach;
  grow.glow.value = glow * (0.7 + 0.3 * Math.sin(performance.now() / 260));
  L.mesh!.visible = L.reach > L.idle;
  for (let i = 0; i < L.spots.length; i++) {
    const g = Math.max(0, Math.min(1, (L.reach - L.spots[i].order) / STONE_SLIDE));
    if (L.was[i] < 0.9 && g >= 0.9) arrived(w, L.spots[i]);
    L.was[i] = g;
  }
}

function tendStones(dt: number, w: QuestWorld) {
  const ab = abbeyClimb(w.map);
  if (!ab) return;
  const { tower, steps, ledge, ledgePieces, ringLen, stonesAt, roofs } = CLIMB, idle = steps[0][4] - 0.5;
  if (tended !== w.map) {
    tended = w.map; ledgeLayer = layer(); stoneLayer = layer(); stoneLayer.reach = idle; stoneLayer.idle = idle;
    stoneLayer.spots = steps.map(([a, b, c, d, top]) => spotFor(ab, a, b, c, d, top - 0.45, top));
    ledgeLayer.spots = ledgePieces.map(([a, b, c, d, order]) => spotFor(ab, a, b, c, d, ledge - 0.6, order));
    stoneLayer.was = stoneLayer.spots.map(() => 0); ledgeLayer.was = ledgeLayer.spots.map(() => 0);
  }
  if (!stoneLayer.mesh?.parent || !ledgeLayer.mesh?.parent) {
    stoneLayer.mesh = ledgeLayer.mesh = null;
    const me = w.me(), mid = ab.mid;
    if (Math.hypot(me.x - mid[0], me.z - mid[1]) < 150) findMeshes(w, performance.now());
    if (!stoneLayer.mesh || !ledgeLayer.mesh) return;
  }
  let top = -Infinity, roof = false, onLedge = false, above = false, round = -1;
  for (const p of w.players()) {
    if (!p.alive) continue;
    const [lx, ly, lz] = ab.frame.local(p.x, p.y, p.z);
    if (ly < roofs.y) continue;
    if (lx >= roofs.x0 && lx <= roofs.x1 && Math.abs(lz) <= roofs.z) roof = true;
    if (ly < ledge - 1) continue;
    const dx = Math.max(tower.x0 - lx, 0, lx - tower.x1), dz = Math.max(Math.abs(lz) - tower.z, 0), near = Math.hypot(dx, dz);
    if (near > NEAR_TOWER) continue;
    if (ly > ledge + 1.5) { above = true; top = Math.max(top, ly); continue; }
    if (near > ON_LEDGE) continue;
    onLedge = true;
    const at = ringDist(lx, lz);
    round = Math.max(round, at);
    if (at >= stonesAt - 1.5) top = Math.max(top, ly);
  }
  const wantLedge = above ? ringLen + STONE_SLIDE : onLedge ? round + STONE_SLIDE + LEDGE_AHEAD : roof ? STONE_SLIDE : 0;
  const wantStones = top === -Infinity ? idle : Math.max(idle, top + AHEAD);
  const fade = (g: number, on: boolean) => Math.max(0, Math.min(1, g + (on ? dt : -dt) * 1.5));
  glowLedge = fade(glowLedge, roof && !onLedge && !above);
  glowStone = fade(glowStone, onLedge && !above && top !== -Infinity);
  if (roof && !toldLedge && !onLedge && !above && ledgeLayer.reach >= STONE_SLIDE) {
    toldLedge = true;
    w.toast("Up on the ledge round the tower", 4);
  }
  drive(ledgeLayer, wantLedge, LEDGE_DOWN, dt, w, glowLedge);
  drive(stoneLayer, wantStones, DOWN, dt, w, glowStone);
}

function arrived(w: QuestWorld, s: { at: THREE.Vector3; nx: number; nz: number }) {
  const [d, pan] = w.hear?.(s.at.x, s.at.y, s.at.z) ?? [0, 0];
  SFX.stoneOut(d, pan);
  w.dust?.(s.at.x, s.at.y, s.at.z, s.nx, s.nz);
}

registerFree({
  update(dt, w) {
    if (dt <= 0) return;
    tendStones(dt, w);
    if (told) return;
    const ab = abbeyClimb(w.map), me = w.me();
    if (!ab || !me.alive) return;
    const foot = ab.frame.at(CLIMB.ladder.x - 1, 0, CLIMB.ladder.z), [, ly] = ab.frame.local(me.x, me.y, me.z);
    if (Math.hypot(me.x - foot.x, me.z - foot.z) < HINT && ly < 3) {
      told = true;
      w.toast("They say one of the Abbey's ladders of angels can really be climbed, and there's something at the top of the tower", 5);
    }
  },
  spots(w): JobSpot[] {
    const ab = abbeyClimb(w.map);
    if (!ab) return [];
    const at = ab.frame.at(CLIMB.ladder.x - 3, 0, 0);
    return [{ x: at.x, z: at.z, colour: COLOUR, glyph: "A", label: "Climb Bath Abbey" }];
  },
});
