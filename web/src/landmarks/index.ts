// Hand-made landmarks, as plugins. A map's landmark pack (tools/landmarks/<map>.py) places them,
// each as [kind, x, y, ground, angle, ...more]; this draws each kind with its builder below.
// A builder makes the landmark around its own origin, its front facing +z; it is then stood at
// x, y on the ground and turned by angle. A new kind for another area is a new file here and a
// line in KINDS.
//
// Set pieces (setpieces.ts: the Abbey, Pulteney Bridge, the Roman Baths, the terraced streets,
// Grand Parade, the Empire Hotel, the Holburne Museum, Sham Castle, Prior Park, Kingswood School, the Bell Inn, Bath Spa station and the Dundas Aqueduct) are placed by
// the game itself as each square loads, not by the pack, as [kind, x, y, height, angle, own,
// ...args]: own is 1 in the square that draws it, 0 in a square next to it, which only makes it solid there.
// Their solid shape is taken from their own models (landmarks/shape.ts; map.ts asks landmarkShape).
import * as THREE from "three";
import type { GameMap } from "../map";
import { spire } from "./spire";
import { portico } from "./portico";
import { bridge } from "./bridge";
import { oak } from "./oak";
import { twerton } from "./twerton";
import { abbey } from "./abbey";
import { pulteney } from "./pulteney";
import { baths } from "./baths";
import { terraces } from "./terraces";
import { colonnade, empire } from "./grandparade";
import { shamCastle } from "./shamcastle";
import { holburne } from "./holburne";
import { priorPark, priorParkWings } from "./priorpark";
import { kingswood } from "./kingswood";
import { bradfordStation } from "./bradford";
import { grenville } from "./grenville";
import { bell } from "./bell";
import { bathSpa } from "./bathspa";
import { dundas } from "./dundas";
import { type Shape, shapeOf } from "./shape";
import { mergeStatic } from "./kit";

export type Builder = (args: (number | string)[]) => THREE.Object3D;

const KINDS: Record<string, Builder> = { spire, portico, bridge, oak, twerton, abbey, pulteney, baths, terraces, holburne, colonnade, empire, sham: shamCastle, priorpark: priorPark, priorwings: priorParkWings, kingswood, bell, grenville, bathspa: bathSpa, boastation: bradfordStation, dundas };
/** The set pieces' kinds (setpieces.ts). */
const SET_PIECE_KINDS = new Set(["abbey", "pulteney", "baths", "terraces", "holburne", "colonnade", "empire", "sham", "priorpark", "priorwings", "kingswood", "bell", "grenville", "bathspa", "boastation", "dundas"]);

const shapes = new Map<string, Shape>();
// a set piece's model built for its shape, kept for the square that draws it so it isn't built twice
const models = new Map<string, THREE.Object3D>();
const keyOf = (kind: string, args: (number | string)[]) => `${kind}|${JSON.stringify(args)}`;

/** A set piece's solid shape, in its own frame, from its landmark entry's args (after the angle),
 *  taken from its model the first time it's asked for (a job that yields between slices) and
 *  shared by every square it reaches; or null for a landmark that isn't a set piece. */
export function* landmarkShape(kind: string, rest: (number | string)[]): Generator<void, Shape | null> {
  if (!SET_PIECE_KINDS.has(kind)) return null;
  const args = rest.slice(1), k = keyOf(kind, args);
  let sh = shapes.get(k);
  if (!sh) {
    const t0 = performance.now();
    const obj = KINDS[kind](args);
    yield;
    const t1 = performance.now();
    sh = yield* shapeOf(obj);
    // for the spike probe: building a set piece's model, and working out its shape, can each be a
    // whole frame on their own (the Abbey's 91 parts), which is a stutter as a square goes up
    const L = (globalThis as any).__shapeTimes as [number, number, string][] | undefined;
    if (L) L.push([+(t1 - t0).toFixed(1), +(performance.now() - t1).toFixed(1), kind]);
    shapes.set(k, sh);
    models.set(k, obj);
  }
  return sh;
}

/** A landmark's model as the game draws it, from its entry's args after the angle (a set piece's
 *  start with its own flag), or null for a kind with no builder: for the what's what page. */
export function landmarkModel(kind: string, rest: (number | string)[]): THREE.Object3D | null {
  const build = KINDS[kind];
  if (!build) return null;
  const obj = build(SET_PIECE_KINDS.has(kind) ? rest.slice(1) : rest);
  mergeStatic(obj);
  return obj;
}

const lampsOf = new WeakMap<GameMap, number[]>();
/** Where the lamps on a map's landmarks hang (scene x, y, z, one after another), so world.ts can
 *  light the ground round them after dark as it does the street lamps'. A builder lists its own,
 *  in its own frame, in its model's userData.lamps. */
export const landmarkLamps = (map: GameMap): number[] => lampsOf.get(map) ?? [];

/** Build the map's landmarks (or the list given: the wider map's) into the scene. */
export function buildLandmarks(map: GameMap, scene: THREE.Object3D, list = map.d.lm ?? []) {
  for (const [kind, x, y, z, ang, ...rest] of list) {
    const build = KINDS[kind as string];
    if (!build) { console.warn(`no builder for landmark ${kind}`); continue; }
    let args = rest;
    if (SET_PIECE_KINDS.has(kind as string)) { if (!+rest[0]) continue; args = rest.slice(1); }
    const k = keyOf(kind as string, args), made = models.get(k);
    models.delete(k);
    const obj = made ?? build(args);
    mergeStatic(obj);
    obj.position.set(x as number, (z as number) - map.z0, -(y as number));
    obj.rotation.y = ang as number;
    const lamps = obj.userData.lamps as number[] | undefined;
    if (lamps?.length) {
      obj.updateMatrix();
      const v = new THREE.Vector3(), out = lampsOf.get(map) ?? lampsOf.set(map, []).get(map)!;
      for (let i = 0; i < lamps.length; i += 3) {
        v.set(lamps[i], lamps[i + 1], lamps[i + 2]).applyMatrix4(obj.matrix);
        // (a square built again after it was let go mustn't list its lamps twice)
        let had = false;
        for (let j = 0; j < out.length && !had; j += 3) had = out[j] === v.x && out[j + 1] === v.y && out[j + 2] === v.z;
        if (!had) out.push(v.x, v.y, v.z);
      }
    }
    delete obj.userData.lamps;
    obj.traverse((o) => { o.castShadow = o.receiveShadow = true; });
    scene.add(obj);
  }
}
