// The way into the mines (mines.html): the front door of 1 The Firs, under a neon sign, with a
// beacon of light outside it (beacon.ts) and a point-of-interest marker on the maps.
//
// The house is placed by its UPRN (OS Open UPRN 10001123863). It has no energy certificate, but the
// certificates for 2, 7, 9, 10 and up place the rest of the street, numbered in a row westward from
// Hadfield Place, and number 1's UPRN sits just east of number 2's. The door is looked for again as
// each square of Bath loads, so it turns up once the square it's in is there.
import * as THREE from "three";
import type { GameMap } from "./map";
import { neonSign } from "./neon";
import { beacon } from "./beacon";
import type { Spot } from "./minimap";

const NUMBER_ONE = [-152.2, -210.9];  // map data x, y of the UPRN; the nearest door is its front door
const MAP = "combe-down";              // the coordinates are Bath's: another map's door there is someone else's
export const TOUR_REACH = 2.2;

export class MineTour {
  /** The door, in scene coordinates, and the way it faces (NaN until the square it's in has loaded). */
  x = NaN; y = NaN; z = NaN;
  /** The way out of the door, into the street. */
  private nx = 0; private nz = 1;
  private sign: ReturnType<typeof neonSign> | null = null;
  private beacon: ReturnType<typeof beacon> | null = null;
  private seen = -1;

  constructor(private map: GameMap, private scene: THREE.Scene) { this.find(); }

  /** Look for the door in the map and every square of Bath loaded: true once it's found. */
  private find(): boolean {
    if (Number.isFinite(this.x) || this.map.d.id !== MAP) return false;
    if (this.seen === this.map.tilesVersion) return false;
    this.seen = this.map.tilesVersion;
    let best: number[] | undefined, bd = Infinity, at: GameMap = this.map;
    for (const m of this.map.areas()) for (const d of m.d.dr ?? []) {
      const dd = Math.hypot(d[0] - NUMBER_ONE[0], d[1] - NUMBER_ONE[1]);
      if (dd < bd) { bd = dd; best = d; at = m; }
    }
    if (!best || bd > 40) return false;
    const a = best[3], z0 = at.z0;
    const nx = Math.sin(a), nz = Math.cos(a);   // doors face their local +z (world.ts)
    this.nx = nx; this.nz = nz;
    this.x = best[0] + nx * 0.6; this.z = -best[1] + nz * 0.6; this.y = best[2] - z0;
    this.sign = neonSign("Mine tours here!", "#ff3fae");
    // over the door, clear of the porch canopy, just off the wall
    this.sign.group.position.set(best[0] + nx * 0.12, best[2] - z0 + 2.9, -best[1] + nz * 0.12);
    this.sign.group.rotation.y = a;
    this.scene.add(this.sign.group);
    // a ring on the step and a point-of-interest marker over the sign, the same for every minigame
    this.beacon = beacon();
    this.beacon.group.position.set(this.x + nx * 0.5, this.y, this.z + nz * 0.5);
    this.scene.add(this.beacon.group);
    return true;
  }

  /** Where it goes on the maps, if this map has it. */
  spot(): Spot | undefined {
    return Number.isFinite(this.x) ? { x: this.x, z: this.z } : undefined;
  }

  /** Animate the sign, and look for the door if its square's only just loaded: true when it's found. */
  update(t: number): boolean { const found = this.find(); this.sign?.update(t); this.beacon?.update(t); return found; }

  /** Where you come out after climbing back up from the mines: on the path, facing the street. */
  outside(): { x: number; z: number; yaw: number } | undefined {
    if (!Number.isFinite(this.x)) return undefined;
    return { x: this.x + this.nx * 3.2, z: this.z + this.nz * 3.2, yaw: Math.atan2(-this.nx, -this.nz) };
  }

  /** Close enough to the door to go in. */
  near(x: number, z: number, y: number) {
    return Math.hypot(x - this.x, z - this.z) < TOUR_REACH && Math.abs(y - this.y) < 2;
  }
}
