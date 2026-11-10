// Stunts: free play on the rides, with nothing to take on. Speed traps stand at the foot of the
// steepest streets in Bath (one to a street, picked from the roads by how steeply they drop), each a
// yellow box on a pole: go past one, however you're moving, and it clocks you, against your best there. And a manual
// down Milsom Street is timed, against your longest there. (Big air, grinds and combos are scored
// by the rides themselves, in ridetricks.ts.) The traps are on the big map, as speed cameras, and on
// the minimap when you're near one (within a walk, on its rim pointing the way).
//
// Who decides what: all your own. Where the traps are comes from the map everyone has, and your
// bests are kept on your machine; nothing goes over the network.
import * as THREE from "three";
import * as SFX from "./audio";
import type { JobSpot } from "./minimap";
import { note } from "./daily";
import { earn } from "./wardrobe";
import { type QuestWorld, registerFree } from "./quests";
import { roadHalf, PAVE, PATHS, type Road } from "./map";

const COLOUR = "#f5c400";
const KEY = "cd-stunt-";
const TRAPS = 16;          // the most speed traps
const APART = 350;         // metres between them, at least
const STEEP = 0.08;        // the least a street's drop can be (8 in 100) to have one
const BUILD = 160;         // built within this far, and taken down past BUILD + 40
const CLEAR = 10;          // metres a camera stands from any junction on its road
const MANUAL = 1;          // seconds on a manual down Milsom Street that count
const STREET = "Milsom Street";

/** ux, uz: the way its road runs, in the scene. reach: how far from the pole the camera sees, to the far kerb and a bit. */
interface Trap { name: string; x: number; z: number; ux: number; uz: number; reach: number; view?: THREE.Group; cool: number }

const OK = new Set(["residential", "unclassified", "tertiary", "secondary", "primary", "living_street"]);

/** The height of the ground, the same whatever's loaded. */
function groundOf(w: QuestWorld, x: number, z: number) {
  const wide = w.map.wide;
  return wide && !wide.inCore(x, -z) ? wide.ground(x, z) : w.map.ground(x, z);
}

/** The foot of the steepest stretch (80 to 200 m) of each steep named street, best first, spread out. */
function findTraps(w: QuestWorld): Trap[] {
  const found: { name: string; x: number; z: number; ux: number; uz: number; reach: number; g: number }[] = [];
  const roads = [...w.map.d.rd, ...w.map.wide?.rd ?? []];
  const ends = roads.filter((r) => !PATHS.has(r.c) && r.p.length > 1).flatMap((r) => [r.p[0], r.p[r.p.length - 1]]);
  for (const r of roads) {
    if (!r.n || !OK.has(r.c) || r.p.length < 2) continue;
    const pts = r.p.map((q) => [q[0], -q[1]]);
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    if (len < 80) continue;
    const hs = pts.map(([x, z]) => groundOf(w, x, z));
    let best: { g: number; at: number } | null = null;
    for (let i = 0; i < pts.length; i++) {
      let run = 0;
      for (let j = i + 1; j < pts.length; j++) {
        run += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
        if (run < 80) continue;
        if (run > 200) break;
        const g = Math.abs(hs[j] - hs[i]) / run;
        if (!best || g > best.g) best = { g, at: hs[j] < hs[i] ? j : i };
        break;
      }
    }
    if (best && best.g >= STEEP) found.push({ name: r.n, ...roadside(r, best.at, ends), g: best.g });
  }
  found.sort((a, b) => b.g - a.g || a.x - b.x || a.z - b.z);
  const out: Trap[] = [];
  for (const f of found) {
    if (out.length >= TRAPS) break;
    if (out.some((o) => o.name === f.name || Math.hypot(o.x - f.x, o.z - f.z) < APART)) continue;
    if (w.map.fieldEdgeBase(f.x, f.z) < 60) continue;
    out.push({ name: f.name, x: f.x, z: f.z, ux: f.ux, uz: f.uz, reach: f.reach, cool: 0 });
  }
  return out;
}

/** Where a camera at point i of road r stands: at the kerb on its wider pavement, slid along the
 *  road until it's CLEAR of every junction on it (the road's own ends and any road ending on its
 *  line), so it's never out in the carriageway or in a side road's mouth. `ends` are the ends of
 *  every road, as [x, y] in data metres. */
function roadside(r: Road, i: number, ends: number[][]): { x: number; z: number; ux: number; uz: number; reach: number } {
  const p = r.p, n = p.length, at: number[] = [0];
  for (let k = 1; k < n; k++) at.push(at[k - 1] + Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]));
  const len = at[n - 1];
  const point = (s: number) => {
    let k = 1;
    while (k < n - 1 && at[k] < s) k++;
    const l = at[k] - at[k - 1] || 1, f = Math.min(1, Math.max(0, (s - at[k - 1]) / l));
    return { x: p[k - 1][0] + (p[k][0] - p[k - 1][0]) * f, y: p[k - 1][1] + (p[k][1] - p[k - 1][1]) * f,
      ux: (p[k][0] - p[k - 1][0]) / l, uy: (p[k][1] - p[k - 1][1]) / l };
  };
  const near = ends.filter((e) => p.some((q) => Math.hypot(q[0] - e[0], q[1] - e[1]) < len + CLEAR));
  const clear = (s: number) => { const q = point(s); return near.every((e) => Math.hypot(e[0] - q.x, e[1] - q.y) >= CLEAR); };
  let s = at[i];
  for (let step = 0; step <= 40; step++) {
    const t = at[i] + (step % 2 ? 1 : -1) * Math.ceil(step / 2) * 2;
    if (t >= 0 && t <= len && clear(t)) { s = t; break; }
  }
  const q = point(s);
  const [left, right] = r.pv ?? [PAVE, PAVE];
  const side = left >= right ? 1 : -1, pave = Math.max(left, right);
  const half = roadHalf(r.c, r.w), off = half + (pave > 0.6 ? 0.4 : 0.6);
  return { x: q.x - q.uy * off * side, z: -(q.y + q.ux * off * side), ux: q.ux, uz: -q.uy,
    reach: off + half + Math.min(left, right) + 2 };
}

/** A speed camera: a yellow box on a grey pole. */
let parts: { pole: THREE.BufferGeometry; box: THREE.BufferGeometry; grey: THREE.Material; yellow: THREE.Material } | null = null;
function trapView(): THREE.Group {
  parts ??= {
    pole: new THREE.CylinderGeometry(0.06, 0.06, 3, 6), box: new THREE.BoxGeometry(0.45, 0.6, 0.5),
    grey: new THREE.MeshLambertMaterial({ color: "#8a8d93" }), yellow: new THREE.MeshLambertMaterial({ color: COLOUR }),
  };
  const g = new THREE.Group();
  const pole = new THREE.Mesh(parts.pole, parts.grey); pole.position.y = 1.5;
  const box = new THREE.Mesh(parts.box, parts.yellow); box.position.y = 3.1; box.castShadow = true;
  g.add(pole, box);
  return g;
}

function best(key: string): number { try { return Number(localStorage.getItem(KEY + key)) || 0; } catch { return 0; } }
function keep(key: string, v: number) { try { localStorage.setItem(KEY + key, String(v)); } catch { /* full */ } }

let traps: Trap[] | null = null;

/** Every camera is picked from the whole map, so everyone has the same set; one only works where the zones have opened. */
const open = (w: QuestWorld, t: Trap) => w.map.fieldEdge(t.x, t.z) > 0;
let last: { x: number; y: number; z: number } | null = null;
let speed = 0, manual = 0, along: number[][] | null = null;

/** Milsom Street's stretches, as [ax, az, bx, bz] in scene coordinates. */
function streetOf(w: QuestWorld): number[][] {
  const out: number[][] = [];
  for (const r of [...w.map.d.rd, ...w.map.wide?.rd ?? []]) {
    if (r.n !== STREET) continue;
    for (let k = 1; k < r.p.length; k++) out.push([r.p[k - 1][0], -r.p[k - 1][1], r.p[k][0], -r.p[k][1]]);
  }
  return out;
}

registerFree({
  update(dt, w) {
    if (dt <= 0) return;
    traps ??= findTraps(w);
    const me = w.me();
    // build the traps round you, and take down the ones you've left
    for (const t of traps) {
      const d = Math.hypot(t.x - me.x, t.z - me.z);
      if (!open(w, t)) { if (t.view) { w.scene.remove(t.view); t.view = undefined; } continue; }
      if (!t.view && d < BUILD) { t.view = trapView(); t.view.position.set(t.x, w.map.ground(t.x, t.z), t.z); w.scene.add(t.view); }
      else if (t.view && d > BUILD + 40) { w.scene.remove(t.view); t.view = undefined; }
      t.cool = Math.max(0, t.cool - dt);
    }
    const was = last;
    last = { x: me.x, y: me.y, z: me.z };
    if (!was || !me.alive) { speed = 0; manual = 0; return; }
    const moved = Math.hypot(me.x - was.x, me.z - was.z);
    if (moved > 30) { speed = 0; return; }   // moved to a start line, or respawned
    speed += (moved / dt - speed) * Math.min(1, dt * 6);
    // past a speed trap, on anything and anywhere across its road: clocked
    for (const t of traps) {
      if (t.cool > 0 || speed < 3 || !open(w, t) || Math.hypot(t.x - me.x, t.z - me.z) > t.reach + moved) continue;
      if (!crosses(t, was.x, was.z, me.x, me.z)) continue;
      t.cool = 6;
      // in mph, like the car's speedo; bests kept from when traps read km/h are carried over
      const mph = Math.round(speed * 2.237), b = best("trapmph-" + t.name) || Math.round(best("trap-" + t.name) / 1.609);
      note("trap", mph);
      if (mph >= 40) earn("dazzle");
      if (mph > b) keep("trapmph-" + t.name, mph);
      w.toast(`Speed trap, ${t.name}: ${mph} mph${mph > b ? (b ? `, a best (was ${b})` : "") : ` (best ${b})`}`);
      if (mph > b) SFX.pip(true); else SFX.tick();
    }
    // a manual down Milsom Street: timed while you're on it and on the street
    along ??= streetOf(w);
    const on = w.manual() > 0 && along.some((a) => segDist(me.x, me.z, a[0], a[1], a[2], a[3]) < 9);
    if (on) manual += dt;
    else if (manual > 0) {
      if (manual >= MANUAL) {
        const s = Math.round(manual * 10) / 10, b = best("manual-milsom");
        if (s > b) keep("manual-milsom", s);
        w.toast(`Manual down ${STREET}: ${s.toFixed(1)} s${s > b ? (b ? `, your longest (was ${b.toFixed(1)})` : "") : ` (longest ${b.toFixed(1)})`}`);
        if (s > b) SFX.pip(true);
      }
      manual = 0;
    }
  },
  spots(): JobSpot[] {
    return (traps ?? []).map((t) => ({ x: t.x, z: t.z, colour: COLOUR, glyph: "S", trap: true, layer: "traps", label: `Speed trap, ${t.name}` }));
  },
  dispose(w) {
    for (const t of traps ?? []) if (t.view) { w.scene.remove(t.view); t.view = undefined; }
    last = null;
  },
});

/** Whether the step from a to b crosses the line across the road at trap t, within its reach. */
function crosses(t: Trap, ax: number, az: number, bx: number, bz: number) {
  const sa = (ax - t.x) * t.ux + (az - t.z) * t.uz, sb = (bx - t.x) * t.ux + (bz - t.z) * t.uz;
  if (sa === sb || (sa > 0) === (sb > 0)) return false;
  const f = sa / (sa - sb), cx = ax + (bx - ax) * f - t.x, cz = az + (bz - az) * f - t.z;
  return Math.abs(cx * -t.uz + cz * t.ux) <= t.reach;
}

/** How far (px, pz) is from the stretch a to b. */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
  const u = l > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l)) : 0;
  return Math.hypot(px - ax - dx * u, pz - az - dz * u);
}
