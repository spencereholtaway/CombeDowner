// The full-detail squares round the detailed map (built by tools/prep_tiles.py into
// public/maps/<id>/<ti>_<tj>.json, and downloaded packed: pack.ts): the rest of Bath at the same detail as Combe Down, about a
// kilometre a side. Only the squares near the player are loaded (while a fly-over plays, those it
// will show instead: reveal.ts). Each is fetched, given a GameMap
// of its own (its ground, walls, roofs and trees, which the main map hands questions to) that is
// set up a slice at a time, and its scenery is built a few milliseconds a frame (world.ts), so the
// game never stalls as you go; squares left far behind are dropped, except those held where
// everyone starts (hold).
//
// Nothing about them goes over the network: every player loads the squares round themselves and
// collides with what they've loaded, as they move themselves; where no square is loaded, the
// simpler wider map (wide.ts) stands in. The host also loads the map (not the scenery) of the
// squares round everyone else, as it runs the traffic, naughty boys, cats and buses wherever they are.
import * as THREE from "three";
import { GameMap, tileKey, type MapData } from "./map";
import { SquareParser } from "./parsesquare";
import type { TileWorld } from "./world";
import { SQUARES, view } from "./view";
import { maskSetPieces } from "./landmarks/setpieces";
import { clearCourt } from "./bonfire";
import { clearClimb } from "./theclimb";

// Squares are built when their nearest edge is closer than view.load (just past the fog: view.ts),
// and dropped once it's further than view.drop; and no more than SQUARES of them, the nearest, with
// a few more kept once built, so walking along the edge of one doesn't build and drop it by turns.
const BUDGET = 6;        // milliseconds of setting up and building a frame
const RUSH = 24;         // and while the view's covered on arriving somewhere
const SPARE = 2;         // squares kept built past the budget
// A phone or tablet takes one square at a time: each one being read briefly takes several times its
// file's size in memory, and Chrome on Android closes the page outright when it runs short.
const ONE_AT_A_TIME = typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;
const FETCHES = ONE_AT_A_TIME ? 1 : 2;   // squares downloading at once
const RETRY = 15;        // seconds before a square that wouldn't load is tried again
const TRIES = 4;
// The host also loads the map of the squares round everyone else (their ground, walls and streets,
// not their scenery), so the traffic, naughty boys, cats and buses it runs know their way about there.
const NEAR_OTHERS = 220; // squares this close to another player
const FAR_OTHERS = 420;  // kept till they're this far from them
const MAX_OTHERS = 12;   // and no more than this many of those at once

/** For the frame-rate probe (tools/fpsprobe.mjs): when it sets globalThis.__tileStats to {}, how long
 *  each square took to set up and build, and its longest single slice. */
function stat(t: { ti: number; tj: number }, k: "made" | "setup" | "build", ms: number) {
  const S = (globalThis as any).__tileStats;
  if (!S) return;
  const e = (S[`${t.ti},${t.tj}`] ??= { made: 0, setup: 0, build: 0, setupMax: 0, buildMax: 0, slices: 0 });
  e[k] += ms; e.slices++;
  if (k !== "made") e[`${k}Max`] = Math.max(e[`${k}Max`], ms);
}

interface Tile {
  ti: number; tj: number;
  d: number; od: number;             // how far its nearest edge is from us, and from anyone else
  near?: boolean;                    // one of the squares round us to build in full
  map?: GameMap; ready?: boolean;    // ready: set up and joined to the main map
  group?: THREE.Group; world?: TileWorld; job?: Generator<void, TileWorld>;
  fetching?: boolean; failed?: boolean; gone?: boolean;
  tries?: number; failedAt?: number;
}

/** Whether a count of squares still to come (tiles.ts's pending, or arrive.ts's few close by) has
 *  stayed at nought for a few frames and a little while: the last square built is drawn and on the
 *  graphics card by then, not just finished. The screenshot tool (tools/shoot.mjs) waits on the same
 *  test, through globalThis.__calm. */
export class Calm {
  private frames = 0;
  private since = -1;
  constructor(private wantFrames: number, private wantMs: number) {}
  /** Call once a frame with the count; true once it has been nought long enough. */
  still(n: number, now = performance.now()): boolean {
    if (n > 0) { this.since = -1; this.frames = 0; return false; }
    if (this.since < 0) this.since = now;
    return ++this.frames >= this.wantFrames && now - this.since >= this.wantMs;
  }
  reset() { this.since = -1; this.frames = 0; }
}
(globalThis as any).__calm = (frames: number, ms: number) => new Calm(frames, ms);

/** A response's bytes, calling alive() as each piece of it arrives. */
async function bytesOf(r: Response, alive: () => void): Promise<Uint8Array> {
  if (!r.body) return new Uint8Array(await r.arrayBuffer());
  const reader = r.body.getReader(), parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); n += value.length;
    alive();
  }
  const all = new Uint8Array(n);
  n = 0;
  for (const p of parts) { all.set(p, n); n += p.length; }
  return all;
}

/** What last went wrong loading a square, for the note main.ts shows when loading stalls. */
export const tileTrouble = { last: "", failed: 0, missing: 0 };

export class Tiles {
  private live = new Map<number, Tile>();
  private exists: Set<number>;
  private wait = 0;
  /** Reads each square's file off the main thread (parsesquare.ts). */
  // (a worker keeps the memory of the biggest file it has read, so one left idle a while goes)
  private parser = ONE_AT_A_TIME ? new SquareParser(1, 5000) : new SquareParser(2, 30000);
  /** Squares kept loaded wherever the player goes (their maps; their scenery comes and goes as any
   *  other's): where everyone starts, so a respawn always lands on real ground. */
  private pinned = new Set<number>();
  /** While a fly-over plays (reveal.ts), the squares built in full are just those it will see,
   *  each with how long it will be seen for, so the longest seen are built first. */
  private also = new Map<number, number>();
  /** Build in bigger slices a frame, while nobody can see the frame rate (arrive.ts's cover is up). */
  rush = false;
  /** Goes up whenever a square's scenery comes or goes, so the backdrop knows to look again. */
  drawnVersion = 0;

  /** build: a square's scenery, a slice at a time, into the group given; free: let go of a group half built. */
  constructor(private core: GameMap, private scene: THREE.Scene,
    private build: (m: GameMap, into: THREE.Group) => Generator<void, TileWorld>, private free: (g: THREE.Group) => void) {
    this.exists = new Set(core.tileIndex!.tiles.map(([i, j]) => tileKey(i, j)));
  }

  /** The finished scenery of the square at scene (x, z), if it's loaded and built. */
  worldAt(x: number, z: number): TileWorld | undefined {
    const m = this.core.tileAt(x, z);
    if (!m?.d.tile) return undefined;
    return this.live.get(tileKey(m.d.tile[0], m.d.tile[1]))?.world;
  }

  /** The squares whose scenery is built and drawn, as [ti, tj]. */
  *drawn(): Generator<[number, number]> {
    for (const t of this.live.values()) if (t.world) yield [t.ti, t.tj];
  }

  /** Keep the squares within r of scene (x, z) loaded from now on, and say whether they all are yet
   *  (set up and joined to the main map, so their ground and walls are there). */
  hold(x: number, z: number, r: number): boolean {
    const I = this.core.tileIndex!, S = I.cells * I.dx, u = x - I.x0, v = -z - I.y0;
    let ready = true;
    for (let ti = Math.floor((u - r) / S); ti <= Math.floor((u + r) / S); ti++)
      for (let tj = Math.floor((v - r) / S); tj <= Math.floor((v + r) / S); tj++) {
        const k = tileKey(ti, tj), t = this.live.get(k);
        if (!this.exists.has(k)) continue;
        if (!this.pinned.has(k)) { this.pinned.add(k); this.wait = 0; }
        if (!t?.ready && !t?.failed) ready = false;
      }
    return ready;
  }

  /** How many squares within r of scene (x, z) aren't loaded and built yet (leaving out any that
   *  wouldn't load): what someone just set down there has to wait for to see the streets round them. */
  unbuiltNear(x: number, z: number, r: number): number {
    const I = this.core.tileIndex!, S = I.cells * I.dx, u = x - I.x0, v = -z - I.y0;
    let n = 0;
    for (let ti = Math.floor((u - r) / S); ti <= Math.floor((u + r) / S); ti++)
      for (let tj = Math.floor((v - r) / S); tj <= Math.floor((v + r) / S); tj++) {
        const k = tileKey(ti, tj), t = this.live.get(k);
        if (!this.exists.has(k) || t?.failed || t?.world) continue;
        if (Math.hypot(Math.max(0, ti * S - u, u - (ti + 1) * S), Math.max(0, tj * S - v, v - (tj + 1) * S)) <= r) n++;
      }
    return n;
  }

  /** Build just the squares within r of these spots (scene x, z, evenly spaced in time) in full,
   *  instead of those round us, until called again with none; then the usual reach takes over and
   *  lets go of the rest, as of any other. */
  alsoBuild(spots: { x: number; z: number }[], r: number) {
    const I = this.core.tileIndex!, S = I.cells * I.dx;
    this.also.clear();
    for (const p of spots) {
      const u = p.x - I.x0, v = -p.z - I.y0;
      for (let ti = Math.floor((u - r) / S); ti <= Math.floor((u + r) / S); ti++)
        for (let tj = Math.floor((v - r) / S); tj <= Math.floor((v + r) / S); tj++) {
          const k = tileKey(ti, tj);
          if (this.exists.has(k) && Math.hypot(Math.max(0, ti * S - u, u - (ti + 1) * S), Math.max(0, tj * S - v, v - (tj + 1) * S)) <= r) this.also.set(k, (this.also.get(k) ?? 0) + 1);
        }
    }
    this.wait = 0;
  }

  /** How many of alsoBuild's squares aren't loaded and built yet (leaving out any that wouldn't load). */
  alsoUnbuilt(): number {
    let n = 0;
    for (const k of this.also.keys()) { const t = this.live.get(k); if (!t?.failed && !t?.world) n++; }
    return n;
  }

  /** Look for the squares round us on the next update rather than at the next of its regular looks:
   *  after a jump, so the ones there start loading straight away. */
  look() { this.wait = 0; }

  /** others: where everyone else is (scene coords), for the host; leave it empty otherwise. */
  update(px: number, pz: number, dt: number, others: { x: number; z: number }[] = []) {
    const I = this.core.tileIndex!, S = I.cells * I.dx;
    const far = (ti: number, tj: number, x: number, z: number) => {
      const u = x - I.x0, v = -z - I.y0;
      return Math.hypot(Math.max(0, ti * S - u, u - (ti + 1) * S), Math.max(0, tj * S - v, v - (tj + 1) * S));
    };
    const fromOthers = (ti: number, tj: number) => others.reduce((m, o) => Math.min(m, far(ti, tj, o.x, o.z)), Infinity);
    // (a fly-over's squares the longest in view first, so a slow machine that can't wait for them
    // all is left missing only what it passes quickest)
    const first = (t: Tile) => Math.min(t.d, t.od) - (this.also.get(tileKey(t.ti, t.tj)) ?? 0) * 1e6;
    this.wait -= dt;
    if (this.wait <= 0) {
      this.wait = 0.3;
      // the nearest squares, as many as the budget allows
      const nearest = (r: number, most: number) => {
        const u = px - I.x0, v = -pz - I.y0, found: [number, number][] = [];
        for (let ti = Math.floor((u - r) / S); ti <= Math.floor((u + r) / S); ti++)
          for (let tj = Math.floor((v - r) / S); tj <= Math.floor((v + r) / S); tj++) {
            const k = tileKey(ti, tj), d = far(ti, tj, px, pz);
            if (this.exists.has(k) && d <= r) found.push([k, d]);
          }
        return new Set(found.sort((a, b) => a[1] - b[1]).slice(0, most).map(([k]) => k));
      };
      // (while a fly-over plays, no square it won't wait for starts building, to go up in front of it)
      const near = this.also.size ? new Set(this.also.keys()) : nearest(view.load, SQUARES), keep = nearest(view.drop, SQUARES + SPARE);
      for (const k of this.also.keys()) keep.add(k);
      for (const [k, t] of this.live) {
        t.d = far(t.ti, t.tj, px, pz); t.od = fromOthers(t.ti, t.tj); t.near = near.has(k);
        if (!keep.has(k) && t.od > FAR_OTHERS && !this.pinned.has(k)) { this.drop(t); this.live.delete(k); }
        else if (!keep.has(k)) this.unbuild(t);   // its scenery goes; its map stays for whoever's there
      }
      for (const k of near) if (!this.live.has(k)) {
        const ti = Math.floor(k / 1024) - 512, tj = (k % 1024) - 512;
        this.live.set(k, { ti, tj, d: far(ti, tj, px, pz), od: fromOthers(ti, tj), near: true });
      }
      const want = (x: number, z: number, r: number, cap = Infinity) => {
        const u = x - I.x0, v = -z - I.y0;
        for (let ti = Math.floor((u - r) / S); ti <= Math.floor((u + r) / S); ti++)
          for (let tj = Math.floor((v - r) / S); tj <= Math.floor((v + r) / S); tj++) {
            const k = tileKey(ti, tj);
            if (this.live.size >= cap || !this.exists.has(k) || this.live.has(k) || far(ti, tj, x, z) > r) continue;
            this.live.set(k, { ti, tj, d: far(ti, tj, px, pz), od: fromOthers(ti, tj) });
          }
      };
      for (const k of this.pinned) if (!this.live.has(k)) {
        const ti = Math.floor(k / 1024) - 512, tj = (k % 1024) - 512;
        this.live.set(k, { ti, tj, d: far(ti, tj, px, pz), od: fromOthers(ti, tj) });
      }
      const ours = keep.size;
      for (const o of others) want(o.x, o.z, NEAR_OTHERS, ours + MAX_OTHERS);
      // a square that wouldn't load (a dropped connection, or no memory to spare just then) is
      // tried again in a while; Play doesn't wait for it meanwhile (hold)
      const now = performance.now() / 1000;
      for (const t of this.live.values()) if (t.failed && (t.tries ?? 0) < TRIES && now - (t.failedAt ?? 0) > RETRY) t.failed = false;
      // start the nearest downloads first
      const waiting = [...this.live.values()].filter((t) => !t.map && !t.fetching && !t.failed).sort((a, b) => first(a) - first(b));
      let busy = [...this.live.values()].filter((t) => t.fetching).length;
      for (const t of waiting) { if (busy++ >= FETCHES) break; this.fetch(t); }
    }
    // a few milliseconds a frame, nearest first: set up each square's walls and streets, then
    // build the scenery of the ones near us straight into the scene, so it goes up to the
    // graphics card a piece at a time
    // (when the spike probe is watching, how this frame's update was spent: see tools/spikeprobe.mjs)
    const T = (globalThis as any).__tileTimes as { setup: number; build: number; worlds: number } | undefined;
    if (T) { T.setup = T.build = T.worlds = 0; }
    const t0 = performance.now(), busy = () => performance.now() - t0 >= ((globalThis as any).__budget ?? (this.rush ? RUSH : BUDGET));
    const work = [...this.live.values()].filter((t) => t.map && (!t.ready || (t.near && !t.world))).sort((a, b) => first(a) - first(b));
    for (const t of work) {
      while (!busy()) {
        if (!t.ready) {
          const setup = t.map!.setup, s0 = performance.now();
          const more = setup && !setup.next().done;
          const setupMs = performance.now() - s0;
          stat(t, "setup", setupMs);
          if (T) T.setup += setupMs;
          // a long slice says which part of the square's setup it was in (map.ts's phase)
          if (setupMs > 8) {
            const long: unknown[][] = ((globalThis as any).__longSetup ??= []);
            long.push([+setupMs.toFixed(1), t.map!.phase || "?"]);
            if (long.length > 200) long.splice(0, long.length - 200);
          }
          if (more) continue;
          t.ready = true; t.map!.setup = null;
          this.core.addTile(tileKey(t.ti, t.tj), t.map!);
          continue;
        }
        if (!t.near) break;
        if (!t.job) { t.group = new THREE.Group(); this.scene.add(t.group); t.job = this.build(t.map!, t.group); }
        const s0 = performance.now(), r = t.job.next();
        const buildMs = performance.now() - s0;
        stat(t, "build", buildMs);
        // a long slice says which part of the square's scenery it was in (after world.ts's last mark)
        if (buildMs > 30) {
          const long: unknown[][] = ((globalThis as any).__longBuild ??= []);
          long.push([+buildMs.toFixed(1), (globalThis as any).__wphase || "?"]);
          if (long.length > 200) long.splice(0, long.length - 200);
        }
        if (T) T.build += performance.now() - s0;
        if (r.done) { t.world = r.value; t.job = undefined; this.drawnVersion++; break; }
      }
      if (busy()) break;
    }
    const w0 = performance.now();
    for (const t of this.live.values()) t.world?.update(px, pz, dt);
    if (T) T.worlds += performance.now() - w0;
    (globalThis as any).__tilesPending = [...this.live.values()].filter((t) => !t.failed && t.near && (!t.map || !t.ready || !t.world)).length;
    tileTrouble.missing = [...this.live.values()].filter((t) => t.failed && t.near).length;
  }

  private fetch(t: Tile) {
    t.fetching = true;
    t.tries = (t.tries ?? 0) + 1;
    // a download that stops coming in is given up on, to be tried again, rather than holding up
    // every square behind it; a slow one that keeps coming is left to finish
    const stop = new AbortController();
    let late = 0;
    const alive = () => { clearTimeout(late); late = window.setTimeout(() => stop.abort(), 20000); };
    alive();
    // the packed square (pack.ts), or its JSON where a tool serves the map folder before packing
    const base = `${this.core.tileBase}${t.ti}_${t.tj}`;
    fetch(`${base}.pack.gz`, { signal: stop.signal })
      .then((r) => (r.status === 404 ? fetch(`${base}.json`, { signal: stop.signal }) : r))
      .then((r) => (r.ok ? bytesOf(r, alive) : Promise.reject(new Error(String(r.status)))))
      .finally(() => clearTimeout(late))
      // read it in a worker, so the reading never lands in a frame (parsesquare.ts)
      .then((bytes) => this.parser.parse(t.ti, t.tj, bytes))
      .then((parsed) => {
        if (parsed.error !== undefined) throw new Error(parsed.error);
        const d = parsed.data as MapData;
        t.fetching = false;
        if (t.gone) return;
        const s0 = performance.now();
        // the cable car's way is cleared through the squares it crosses, as through the first area
        this.core.cable?.clear(d);
        // and the set pieces hide what the map tools built where they stand (landmarks/setpieces.ts)
        maskSetPieces(d);
        // and Kingswood's bonfire court is levelled and cleared (bonfire.ts)
        clearCourt(d);
        // and the trees in front of The Climb's face are cleared, to see its holds (theclimb.ts)
        clearClimb(this.core, d);
        t.map = new GameMap(d, null, true);
        t.map.canal = this.core.canal;     // the canal's water is drawn by canal.ts, not by the square
        stat(t, "made", performance.now() - s0);
      })
      .catch((e) => {
        t.fetching = false; t.failed = true; t.failedAt = performance.now() / 1000;
        tileTrouble.failed++;
        tileTrouble.last = `square ${t.ti}, ${t.tj}: ${e?.name === "AbortError" ? "download timed out" : e?.message ?? e}`;
        console.warn(`couldn't load square ${t.ti}, ${t.tj}:`, e);
      });
  }

  /** Take down a square's scenery, finished or not. */
  private unbuild(t: Tile) {
    if (!t.world && !t.job) return;
    if (t.world) { t.world.dispose(); this.drawnVersion++; }
    else if (t.job) { t.job.return(undefined as never); if (t.group) this.free(t.group); }
    t.world = t.job = t.group = undefined;
    // the map stays for whoever's there, on its true ground: what it was handed by the scenery
    // would keep every bit of that scenery from being let go
    if (t.map) { t.map.standOnDrawn(null); t.map.onTakeCar = () => {}; }
  }

  private drop(t: Tile) {
    t.gone = true;
    if (t.ready) this.core.dropTile(tileKey(t.ti, t.tj));
    this.unbuild(t);
  }

  dispose() {
    this.parser.dispose();
    for (const t of this.live.values()) this.drop(t);
    this.live.clear();
  }
}
