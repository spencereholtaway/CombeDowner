// Landmarks built from their real facades (see tools/landmarks.py): the Royal Crescent and the
// Circus. Each front is a run of points along the street side of its houses; the facade drawn
// here stands in for those houses' front walls, which the world leaves out.
//
// Heights are metres above the facade's base level (the landmark's `z`):
// - Royal Crescent: a rusticated ground floor to 4.4 m, a string course, then giant Ionic columns
//   through the two floors above (114 in all), an entablature and cornice to 14 m, and a
//   balustrade on top.
// - The Circus: three storeys of 4.2 m, each with paired columns (Doric, Ionic, Corinthian) under
//   an entablature, a parapet, and stone acorns over each pair.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { facing, Geo } from "./geo";
import type { Facade, GameMap } from "./map";
import * as TX from "./textures";

const STONE = new THREE.Color("#ecd8ae");   // Bath stone in the sun
const WHITE = [1, 1, 1];

/** A front: its points in scene coordinates, the outward normal of each segment, and lengths along. */
interface Front { x: number[]; z: number[]; ground: number[]; nx: number[]; nz: number[]; s: number[]; len: number }

function front(p: number[][], side: number, z0: number): Front {
  const f: Front = { x: [], z: [], ground: [], nx: [], nz: [], s: [0], len: 0 };
  for (const [x, y, g] of p) { f.x.push(x); f.z.push(-y); f.ground.push(g - z0); }
  for (let i = 0; i < p.length - 1; i++) {
    const dx = f.x[i + 1] - f.x[i], dz = f.z[i + 1] - f.z[i], l = Math.hypot(dx, dz) || 1;
    // left of the run in data coordinates (x east, y north) is (-dy, dx); in the scene z = -y
    f.nx.push((-side * dz) / l); f.nz.push((-side * dx) / l);
    f.len += l;
    f.s.push(f.len);
  }
  return f;
}

/** Point, outward normal and tangent at distance s along a front. */
function at(f: Front, s: number) {
  let i = 0;
  while (i < f.s.length - 2 && f.s[i + 1] < s) i++;
  const t = (s - f.s[i]) / ((f.s[i + 1] - f.s[i]) || 1);
  return {
    x: f.x[i] + (f.x[i + 1] - f.x[i]) * t, z: f.z[i] + (f.z[i + 1] - f.z[i]) * t,
    nx: f.nx[i], nz: f.nz[i], tx: f.nz[i] * -1, tz: f.nx[i],
  };
}

/** Offset of vertex i, so faces at an offset meet cleanly at the corners (mitred). */
function offsetAt(f: Front, i: number, off: number): [number, number] {
  const a = Math.max(0, i - 1), b = Math.min(f.nx.length - 1, i);
  let nx = f.nx[a] + f.nx[b], nz = f.nz[a] + f.nz[b];
  const l = Math.hypot(nx, nz) || 1;
  nx /= l; nz /= l;
  const k = off / Math.max(0.5, nx * f.nx[b] + nz * f.nz[b]);
  return [f.x[i] + nx * k, f.z[i] + nz * k];
}

/** A vertical face `off` in front of the wall, from y0 to y1 (numbers, or per point). u counts bays. */
function face(g: Geo, f: Front, off: number, y0: number | ((i: number) => number), y1: number, bay: number, v0: number, storey: number) {
  const Y0 = typeof y0 === "number" ? () => y0 : y0;
  for (let i = 0; i < f.x.length - 1; i++) {
    const [ax, az] = offsetAt(f, i, off), [bx, bz] = offsetAt(f, i + 1, off);
    const ua = f.s[i] / bay, ub = f.s[i + 1] / bay;
    const ya = Y0(i), yb = Y0(i + 1);
    facing(g, [ax, ya, az], [bx, yb, bz], [bx, y1, bz], [ax, y1, az], [f.nx[i], 0, f.nz[i]],
      [ua, v0 + (ya - y1) / storey + 1], [ub, v0 + (yb - y1) / storey + 1], [ub, v0 + 1], [ua, v0 + 1], WHITE);
  }
}

/** A solid ledge (string course, cornice, rail) standing out `off` from the wall, from y0 to y1. */
function ledge(g: Geo, f: Front, off: number, y0: number, y1: number) {
  face(g, f, off, y0, y1, 4, 0, y1 - y0);
  for (let i = 0; i < f.x.length - 1; i++) {
    const [ax, az] = offsetAt(f, i, off), [bx, bz] = offsetAt(f, i + 1, off);
    const [cx, cz] = offsetAt(f, i + 1, 0), [dx, dz] = offsetAt(f, i, 0);
    const uv = [0, 0];
    facing(g, [dx, y1, dz], [cx, y1, cz], [bx, y1, bz], [ax, y1, az], [0, 1, 0], uv, uv, uv, uv, WHITE);
    facing(g, [dx, y0, dz], [cx, y0, cz], [bx, y0, bz], [ax, y0, az], [0, -1, 0], uv, uv, uv, uv, WHITE);
  }
}

// ---- columns ----------------------------------------------------------------------------------
type Order = "doric" | "ionic" | "corinthian";

/** One column of height h and radius r, standing on y = 0, capital wide along x (the facade). */
function column(order: Order, h: number, r: number): THREE.BufferGeometry {
  const base = 0.12 * h, cap = order === "doric" ? 0.09 * h : order === "ionic" ? 0.1 * h : 0.16 * h;
  const parts: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(r * 1.3, r * 1.38, base, 12).translate(0, base / 2, 0),
    new THREE.CylinderGeometry(r * 0.9, r, h - base - cap, 12).translate(0, base + (h - base - cap) / 2, 0),
  ];
  if (order === "doric") {
    parts.push(new THREE.CylinderGeometry(r * 1.25, r * 0.92, cap * 0.5, 12).translate(0, h - cap * 0.75, 0));
    parts.push(new THREE.BoxGeometry(r * 2.7, cap * 0.5, r * 2.7).translate(0, h - cap * 0.25, 0));
  } else if (order === "ionic") {
    // the scrolls (volutes) make the capital broad along the facade and shallow
    parts.push(new THREE.BoxGeometry(r * 3.2, cap * 0.6, r * 1.9).translate(0, h - cap * 0.5, 0));
    for (const sx of [-1, 1]) parts.push(new THREE.CylinderGeometry(cap * 0.42, cap * 0.42, r * 1.9, 10).rotateX(Math.PI / 2).translate(sx * r * 1.45, h - cap * 0.55, 0));
    parts.push(new THREE.BoxGeometry(r * 2.9, cap * 0.25, r * 2.9).translate(0, h - cap * 0.12, 0));
  } else {
    // a bell of acanthus leaves under a thin abacus
    parts.push(new THREE.CylinderGeometry(r * 1.55, r * 0.92, cap * 0.85, 12).translate(0, h - cap * 0.575, 0));
    parts.push(new THREE.BoxGeometry(r * 3.2, cap * 0.15, r * 3.2).translate(0, h - cap * 0.075, 0));
  }
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}

/** Stone acorn on a little pedestal, as along the Circus parapet. */
function acorn(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    new THREE.BoxGeometry(0.5, 0.3, 0.5).translate(0, 0.15, 0),
    new THREE.CylinderGeometry(0.28, 0.2, 0.22, 10).translate(0, 0.41, 0),
    new THREE.SphereGeometry(0.27, 10, 8).scale(1, 1.45, 1).translate(0, 0.72, 0),
  ];
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}

/** Instances of a geometry along fronts: each item is (front, distance along, height, outward offset). */
function place(scene: THREE.Scene, geo: THREE.BufferGeometry, mat: THREE.Material, items: [Front, number, number, number][]) {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  items.forEach(([f, s, y, off], i) => {
    const p = at(f, s);
    q.setFromAxisAngle(up, Math.atan2(-p.tz, p.tx));   // local x along the facade
    m.compose(new THREE.Vector3(p.x + p.nx * off, y, p.z + p.nz * off), q, one);
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);
}

// ---- the landmarks ----------------------------------------------------------------------------
export function buildLandmarks(map: GameMap, scene: THREE.Scene) {
  const list = map.d.fc ?? [];
  if (!list.length) return;
  const mats = {
    rustic: new THREE.MeshLambertMaterial({ map: TX.rusticated(), color: STONE }),
    window: new THREE.MeshLambertMaterial({ map: TX.wall("stone", true), color: STONE }),
    plain: new THREE.MeshLambertMaterial({ map: TX.wall("stone", false), color: STONE }),
    frieze: new THREE.MeshLambertMaterial({ map: TX.frieze(), color: STONE }),
    carved: new THREE.MeshLambertMaterial({ color: STONE }),
  };
  const geos: Record<keyof typeof mats, Geo> = { rustic: new Geo(), window: new Geo(), plain: new Geo(), frieze: new Geo(), carved: new Geo() };
  for (const lm of list) (lm.k === "crescent" ? crescent : circus)(lm, map, scene, geos);
  for (const k of Object.keys(geos) as (keyof typeof mats)[]) {
    const g = geos[k].build();
    if (!g) continue;
    const mesh = new THREE.Mesh(g, mats[k]);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

type Geos = Record<"rustic" | "window" | "plain" | "frieze" | "carved", Geo>;
const tucked = (f: Front) => (i: number) => f.ground[i] - 0.6;   // the facade's foot, just below ground

function crescent(lm: Facade, map: GameMap, scene: THREE.Scene, G: Geos) {
  const B = lm.z - map.z0;
  const fronts = lm.f.map((r) => front(r.p, r.s, map.z0));
  const total = fronts.reduce((a, f) => a + f.len, 0);
  const COLUMNS = 114, colH = 7.7, r = 0.36;
  const ionic = column("ionic", colH, r), cols: [Front, number, number, number][] = [], posts: [Front, number, number, number][] = [];
  const balusters: [Front, number, number, number][] = [];
  for (const f of fronts) {
    const n = Math.max(2, Math.round((COLUMNS * f.len) / total)), bay = f.len / (n - 1);
    face(G.rustic, f, 0, tucked(f), B + 4.4, bay, 0, 4.4);                 // rusticated ground floor
    ledge(G.carved, f, 0.22, B + 4.4, B + 4.75);                          // string course
    face(G.window, f, 0, B + 4.75, B + 8.9, bay, 0, 4.15);                // first floor: the tall windows
    face(G.window, f, 0, B + 8.9, B + 12.45, bay, 0, 3.55);               // second floor
    ledge(G.plain, f, 0.3, B + 12.45, B + 13.45);                         // architrave and frieze
    ledge(G.carved, f, 0.75, B + 13.45, B + 14.0);                        // cornice
    face(G.plain, f, 0, B + 14.0, B + 15.1, bay, 0, 1.1);                 // the parapet behind the balustrade
    ledge(G.carved, f, 0.12, B + 14.0, B + 14.25);                        // balustrade plinth
    ledge(G.carved, f, 0.16, B + 14.85, B + 15.1);                        // rail
    for (let k = 0; k < n; k++) {
      cols.push([f, k * bay, B + 4.75, r * 0.55]);
      posts.push([f, k * bay, B + 14.25, 0.12]);
    }
    for (let s = 0.25; s < f.len - 0.1; s += 0.32) balusters.push([f, s, B + 14.25, 0.1]);
  }
  place(scene, ionic, new THREE.MeshLambertMaterial({ color: STONE }), cols);
  place(scene, new THREE.BoxGeometry(0.62, 0.6, 0.42).translate(0, 0.3, 0), new THREE.MeshLambertMaterial({ color: STONE }), posts);
  place(scene, new THREE.CylinderGeometry(0.06, 0.09, 0.6, 6).translate(0, 0.3, 0), new THREE.MeshLambertMaterial({ color: STONE }), balusters);
}

function circus(lm: Facade, map: GameMap, scene: THREE.Scene, G: Geos) {
  const B = lm.z - map.z0, STOREY = 4.2, ENT = 0.8;
  const orders: Order[] = ["doric", "ionic", "corinthian"];
  const fronts = lm.f.map((r) => front(r.p, r.s, map.z0));
  const pairs: [Front, number, number, number][][] = [[], [], []], acorns: [Front, number, number, number][] = [];
  const r = 0.24;
  for (const f of fronts) {
    const n = Math.max(2, Math.round(f.len / 2.7)), bay = f.len / n;
    for (let k = 0; k < 3; k++) {
      const y = B + k * STOREY;
      face(G.window, f, 0, k === 0 ? tucked(f) : y, y + STOREY - ENT, bay, 0, STOREY - ENT);
      ledge(G.frieze, f, 0.3, y + STOREY - ENT, y + STOREY - 0.2);          // architrave and frieze
      ledge(G.carved, f, 0.5, y + STOREY - 0.2, y + STOREY);                // its cornice
      for (let j = 0; j <= n; j++) for (const d of [-0.42, 0.42]) {
        const s = j * bay + d;
        if (s > 0.2 && s < f.len - 0.2) pairs[k].push([f, s, y, r * 0.55]);
      }
    }
    face(G.plain, f, 0, B + 3 * STOREY, B + 3 * STOREY + 0.9, bay, 0, 3.4);   // parapet
    ledge(G.carved, f, 0.12, B + 3 * STOREY + 0.9, B + 3 * STOREY + 1.0);     // coping
    for (let j = 0; j <= n; j++) acorns.push([f, Math.min(f.len - 0.3, Math.max(0.3, j * bay)), B + 3 * STOREY + 1.0, 0]);
  }
  const mat = new THREE.MeshLambertMaterial({ color: STONE });
  orders.forEach((o, k) => place(scene, column(o, STOREY - ENT, r), mat, pairs[k]));
  place(scene, acorn(), mat, acorns);
}
