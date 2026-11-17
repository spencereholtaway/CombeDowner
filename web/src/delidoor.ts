// The way into COMBE DOWN WITH ME (deli.html): the front door of the Darling Deli, under a neon sign, with a
// beacon of light outside it (beacon.ts) and a point-of-interest marker on the maps.
//
// The deli is found by its shop sign on the map (from the shop data, see tools/shops.py), and the
// door is the one drawn in its shop window (furniture.ts), or the nearest front door if it's a pub.
// Maps without the deli simply have no way in. The door is looked for again as each square of Bath
// loads, so it turns up once the square it's in is there.
import * as THREE from "three";
import type { GameMap } from "./map";
import { neonSign } from "./neon";
import { shopDoor } from "./furniture";
import { beacon } from "./beacon";
import type { Spot } from "./minimap";

export const DELI_REACH = 2.2;

export class DeliDoor {
  /** The door, in scene coordinates (NaN until the square it's in has loaded). */
  x = NaN; y = NaN; z = NaN;
  /** The way out of the door, into the street. */
  private nx = 0; private nz = 1;
  private sign: ReturnType<typeof neonSign> | null = null;
  private beacon: ReturnType<typeof beacon> | null = null;
  private seen = -1;

  constructor(private map: GameMap, private scene: THREE.Scene) { this.find(); }

  /** Look for the deli in the map and every square of Bath loaded: true once it's found. */
  private find(): boolean {
    if (Number.isFinite(this.x)) return false;
    if (this.seen === this.map.tilesVersion) return false;
    this.seen = this.map.tilesVersion;
    const areas = this.map.areas();
    let shop: (number | string)[] | undefined;
    for (const m of areas) shop ??= (m.d.sh ?? []).find((s) => /darling deli/i.test(String(s[5])));
    if (!shop) return false;
    const sx = Number(shop[0]), sy = Number(shop[1]), own = shopDoor(shop);
    const home = areas.find((m) => m.d.sh?.includes(shop!)), inWindow = !!(own && home);
    let best: number[] | undefined, bd = Infinity, at: GameMap = this.map;
    if (own && home) { best = [own.x, own.y, own.z, own.a]; bd = 0; at = home; }
    else for (const m of areas) for (const d of m.d.dr ?? []) {
      const dd = Math.hypot(d[0] - sx, d[1] - sy);
      if (dd < bd) { bd = dd; best = d; at = m; }
    }
    if (!best || bd > 15) return false;
    const a = best[3], z0 = at.z0;
    const nx = Math.sin(a), nz = Math.cos(a);   // doors face their local +z (world.ts)
    this.nx = nx; this.nz = nz;
    this.x = best[0] + nx * 0.6; this.z = -best[1] + nz * 0.6; this.y = best[2] - z0;
    this.sign = neonSign("Combe Down With Me", "#ff6a1a");
    // over a shop's own door its fascia is in the way, so the neon goes up over the cornice, above the fascia's middle
    if (inWindow) this.sign.group.position.set(sx + nx * 0.12, best[2] - z0 + 4.0, -sy + nz * 0.12);
    else this.sign.group.position.set(best[0] + nx * 0.12, best[2] - z0 + 2.9, -best[1] + nz * 0.12);
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

  /** Where you come out after a shift: on the pavement, facing the street. */
  outside(): { x: number; z: number; yaw: number } | undefined {
    if (!Number.isFinite(this.x)) return undefined;
    return { x: this.x + this.nx * 3.2, z: this.z + this.nz * 3.2, yaw: Math.atan2(-this.nx, -this.nz) };
  }

  /** Close enough to the door to go in. */
  near(x: number, z: number, y: number) {
    return Math.hypot(x - this.x, z - this.z) < DELI_REACH && Math.abs(y - this.y) < 2;
  }
}
