// Builds the three.js scene from the map: terrain, roads, buildings, walls, trees, water and sky.
import * as THREE from "three";
import { BARRIER_HEIGHT, GameMap, Line, PATHS } from "./map";
import { cross, dot, facing, facingTri, Geo, hash, norm, sub } from "./geo";
import { buildLandmarks } from "./landmarks";
import * as TX from "./textures";
import { buildFurniture, buildShops } from "./furniture";
import { Culler } from "./cull";

const CHUNK = 320;

export interface World {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  update(px: number, py: number, pz: number, dt?: number): void;
  /** Height of the drawn surface (terrain, road, pavement or path) at scene (x, z), for things laid flat on it. */
  surface(x: number, z: number): number;
  /** Free the GPU memory behind the scene, when switching to another map. */
  dispose(): void;
}

export function buildWorld(map: GameMap): World {
  const D = map.d, T = D.t, Z0 = map.z0;
  const scene = new THREE.Scene();
  const culler = new Culler();
  const fogCol = new THREE.Color("#c9d6df");
  scene.background = fogCol;
  scene.fog = new THREE.Fog(fogCol, 60, 480);

  // ---- light ------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight("#cfe0f0", "#6b6a4a", 1.4));
  const sun = new THREE.DirectionalLight("#fff0d8", 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const SUN_DIR = new THREE.Vector3(-0.55, 0.62, 0.56).normalize(); // afternoon sun from the south-west

  // ---- sky dome -----------------------------------------------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(500, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color("#6f9fd0") }, bottom: { value: fogCol } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      // sky gradient with soft fair-weather clouds (value-noise fbm projected onto a cloud layer)
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vP;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 5; k++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
        void main(){
          float h = clamp(vP.y * 2.2, 0.0, 1.0);
          vec3 col = mix(bottom, top, pow(h, 0.7));
          if (vP.y > 0.02) {
            vec2 uv = vP.xz / (vP.y + 0.12) * 1.6;
            float c = smoothstep(0.52, 0.78, fbm(uv + vec2(3.1, 7.7)));
            float fade = smoothstep(0.02, 0.25, vP.y);
            col = mix(col, vec3(0.97, 0.97, 0.98), c * 0.85 * fade);
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  // ---- terrain --------------------------------------------------------------------
  const GROUND = [
    new THREE.Color("#6e7f4c"), // garden and verge grass
    new THREE.Color("#678a45"), // sports pitch
    new THREE.Color("#5a5638"), // woodland floor
    new THREE.Color("#8e9160"), // farmland and meadow
    new THREE.Color("#687a55"), // cemetery
    new THREE.Color("#8f8b82"), // hard standing
    new THREE.Color("#6a5a3c"), // flowerbeds
    new THREE.Color("#7d7350"), // playgrounds: worn grass, bark and sand
  ];
  const earth = new THREE.Color("#7a6a4c");
  const RW: Record<string, number> = { primary: 8.5, secondary: 8, tertiary: 7, residential: 6, unclassified: 5.5, living_street: 5, service: 3.5, unknown: 4, pedestrian: 4, footway: 1.6, steps: 1.8, cycleway: 2, path: 1.4, track: 2.8, bridleway: 2 };
  const KERBED = new Set(["primary", "secondary", "tertiary", "residential", "unclassified"]);
  const PAVE = 1.7;   // pavement width each side of a kerbed street
  // Drawn terrain sits a little lower under streets and paths, so hillsides never poke through
  // them. The player still walks on the true ground height.
  const sink = new Float32Array(T.nx * T.ny);
  for (const r of D.rd) {
    const path = PATHS.has(r.c);
    const reach = (RW[r.c] ?? 4) / 2 + (path ? 0.9 : KERBED.has(r.c) ? PAVE + 0.8 : 0.8), depth = path ? 0.12 : 0.3;
    for (let k = 0; k < r.p.length - 1; k++) {
      const [ax, ay] = r.p[k], [bx, by] = r.p[k + 1], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - T.x0) / T.dx)), i1 = Math.min(T.nx - 1, Math.ceil((Math.max(ax, bx) + reach - T.x0) / T.dx));
      const j0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - T.y0) / T.dy)), j1 = Math.min(T.ny - 1, Math.ceil((Math.max(ay, by) + reach - T.y0) / T.dy));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = T.x0 + i * T.dx, y = T.y0 + j * T.dy;
        const t = Math.min(1, Math.max(0, ((x - ax) * vx + (y - ay) * vy) / l2));
        if (Math.hypot(x - ax - vx * t, y - ay - vy * t) < reach) { const v = j * T.nx + i; sink[v] = Math.max(sink[v], depth); }
      }
    }
  }
  const tPos = new Float32Array(T.nx * T.ny * 3), tCol = new Float32Array(T.nx * T.ny * 3), tUv = new Float32Array(T.nx * T.ny * 2);
  const hAt = (i: number, j: number) => T.h[Math.min(T.ny - 1, Math.max(0, j)) * T.nx + Math.min(T.nx - 1, Math.max(0, i))] / 10;
  const c = new THREE.Color();
  for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) {
    const v = j * T.nx + i, x = T.x0 + i * T.dx, z = -(T.y0 + j * T.dy);
    tPos.set([x, hAt(i, j) - sink[v], z], v * 3);
    tUv.set([x / 7, z / 7], v * 2);
    const slope = Math.hypot(hAt(i + 1, j) - hAt(i - 1, j), hAt(i, j + 1) - hAt(i, j - 1)) / (2 * T.dx);
    c.copy(GROUND[+T.k[v]] ?? GROUND[0]);
    c.lerp(earth, Math.min(0.75, Math.max(0, (slope - 0.45) * 1.4)));
    const n = 0.9 + hash(v) * 0.16;
    tCol.set([c.r * n, c.g * n, c.b * n], v * 3);
  }
  const tIdx: number[] = [];
  for (let j = 0; j < T.ny - 1; j++) for (let i = 0; i < T.nx - 1; i++) {
    const a = j * T.nx + i, b = a + 1, cc = a + T.nx, d = cc + 1;
    tIdx.push(a, b, cc, b, d, cc);
  }
  const terrGeo = new THREE.BufferGeometry();
  terrGeo.setAttribute("position", new THREE.BufferAttribute(tPos, 3));
  terrGeo.setAttribute("color", new THREE.BufferAttribute(tCol, 3));
  terrGeo.setAttribute("uv", new THREE.BufferAttribute(tUv, 2));
  terrGeo.setIndex(tIdx);
  terrGeo.computeVertexNormals();
  const groundTex = TX.groundDetail();
  const terrMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: groundTex });
  // Draw the ground as tiles that share one set of vertices, so tiles behind the camera or
  // past the far plane are skipped.
  const TILE = 48;   // grid cells per tile side
  for (let tj = 0; tj < T.ny - 1; tj += TILE) for (let ti = 0; ti < T.nx - 1; ti += TILE) {
    const idx: number[] = [];
    let lo = Infinity, hi = -Infinity;
    for (let j = tj; j < Math.min(T.ny - 1, tj + TILE); j++) for (let i = ti; i < Math.min(T.nx - 1, ti + TILE); i++) {
      const a = j * T.nx + i, b = a + 1, cc = a + T.nx, d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
      lo = Math.min(lo, tPos[a * 3 + 1]); hi = Math.max(hi, tPos[a * 3 + 1]);
    }
    const g = new THREE.BufferGeometry();
    for (const name of ["position", "color", "uv", "normal"]) g.setAttribute(name, terrGeo.getAttribute(name));
    g.setIndex(idx);
    const i1 = Math.min(T.nx - 1, ti + TILE), j1 = Math.min(T.ny - 1, tj + TILE);
    const cx = T.x0 + (ti + i1) / 2 * T.dx, cz = -(T.y0 + (tj + j1) / 2 * T.dy);
    const half = Math.hypot((i1 - ti) * T.dx, (j1 - tj) * T.dy, hi - lo) / 2;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, (lo + hi) / 2, cz), half);
    const tile = new THREE.Mesh(g, terrMat);
    tile.receiveShadow = true;
    scene.add(tile);
  }

  // ground beyond the map edge, so the world doesn't end in a cliff: a sheet around the map (not
  // under it, or it would cover low ground seen from above), about as high as the land at the edge
  const edgeH: number[] = [];
  for (let i = 0; i < T.nx; i++) edgeH.push(hAt(i, 0), hAt(i, T.ny - 1));
  for (let j = 0; j < T.ny; j++) edgeH.push(hAt(0, j), hAt(T.nx - 1, j));
  edgeH.sort((p, q) => p - q);
  const x1 = T.x0 + (T.nx - 1) * T.dx, y1 = T.y0 + (T.ny - 1) * T.dy;
  const sheet = new THREE.Shape([[-1500, -1500], [1500, -1500], [1500, 1500], [-1500, 1500]].map(([x, y]) => new THREE.Vector2(x, y)));
  sheet.holes.push(new THREE.Path([[T.x0, T.y0], [T.x0, y1], [x1, y1], [x1, T.y0]].map(([x, y]) => new THREE.Vector2(x, y))));
  const outer = new THREE.Mesh(new THREE.ShapeGeometry(sheet).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#66774a" }));
  outer.position.y = Math.min(60, edgeH[edgeH.length >> 1]);
  scene.add(outer);
  const skirt: number[] = [];
  const edgeLine = (pts: [number, number][]) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [i, j] = pts[k], [i2, j2] = pts[k + 1];
      const ax = T.x0 + i * T.dx, az = -(T.y0 + j * T.dy), bx = T.x0 + i2 * T.dx, bz = -(T.y0 + j2 * T.dy);
      skirt.push(ax, hAt(i, j), az, bx, hAt(i2, j2), bz, bx, 0, bz, ax, hAt(i, j), az, bx, 0, bz, ax, 0, az);
    }
  };
  const rng = (n: number) => [...Array(n).keys()];
  edgeLine(rng(T.nx).map((i) => [i, 0])); edgeLine(rng(T.nx).map((i) => [i, T.ny - 1]));
  edgeLine(rng(T.ny).map((j) => [0, j])); edgeLine(rng(T.ny).map((j) => [T.nx - 1, j]));
  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute("position", new THREE.Float32BufferAttribute(skirt, 3));
  skirtGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(skirtGeo, new THREE.MeshLambertMaterial({ color: "#5d6b3f", side: THREE.DoubleSide })));

  // ---- ribbons draped on the terrain -------------------------------------------------
  const ribbon = (lines: { p: number[][] }[], width: (l: any) => number, lift: number) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (const L of lines) {
      const p = L.p, w = width(L) / 2, n = p.length, base = pos.length / 3;
      if (n < 2) continue;
      const seg: number[][] = [];
      for (let i = 0; i < n - 1; i++) {
        const dx = p[i + 1][0] - p[i][0], dy = p[i + 1][1] - p[i][1], l = Math.hypot(dx, dy) || 1;
        seg.push([-dy / l, dx / l, l]);
      }
      let along = 0;
      for (let i = 0; i < n; i++) {
        const a = seg[Math.max(0, i - 1)], b = seg[Math.min(seg.length - 1, i)];
        let nx = a[0] + b[0], ny = a[1] + b[1];
        const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        const s = w / Math.max(0.5, nx * b[0] + ny * b[1]);
        const lx = p[i][0] + nx * s, ly = p[i][1] + ny * s, rx = p[i][0] - nx * s, ry = p[i][1] - ny * s;
        pos.push(lx, map.ground(lx, -ly) + lift, -ly, rx, map.ground(rx, -ry) + lift, -ry);
        uv.push(0, along / 4, w / 2, along / 4);
        if (i < n - 1) { const k = base + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); along += seg[i][2]; }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  // Raised strips along lines, with vertical edges down into the ground: roads with kerbs,
  // pavements and paths. bands are [from, to] offsets across the line (left is positive).
  // skip(x, y) leaves gaps, e.g. where a pavement would cross another street.
  const strips = (lines: { p: number[][] }[], bands: (l: any) => [number, number][], lift: number,
    skip?: (l: any, x: number, y: number) => boolean, edges = true) => {
    const g = new Geo(), white = [1, 1, 1];
    for (const L of lines) {
      // resample every 2 m so the strip follows the ground closely
      const p: number[][] = [];
      for (let i = 0; i < L.p.length - 1; i++) {
        const [ax, ay] = L.p[i], [bx, by] = L.p[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
        for (let s = 0; s < n; s++) p.push([ax + (bx - ax) * s / n, ay + (by - ay) * s / n]);
      }
      p.push(L.p[L.p.length - 1]);
      if (p.length < 2) continue;
      const nrm: number[][] = [], along: number[] = [0];
      for (let i = 0; i < p.length; i++) {
        const a = Math.max(0, i - 1), b = Math.min(p.length - 1, i + 1);
        const dx = p[b][0] - p[a][0], dy = p[b][1] - p[a][1], l = Math.hypot(dx, dy) || 1;
        nrm.push([-dy / l, dx / l]);
        if (i) along.push(along[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
      }
      for (const [o1, o2] of bands(L)) {
        const at = (i: number, o: number) => {
          const x = p[i][0] + nrm[i][0] * o, y = p[i][1] + nrm[i][1] * o, top = map.ground(x, -y) + lift;
          return { x, y, top, foot: top - lift - 0.35 };
        };
        for (let i = 0; i < p.length - 1; i++) {
          const a1 = at(i, o1), a2 = at(i, o2), b1 = at(i + 1, o1), b2 = at(i + 1, o2);
          if (skip && (skip(L, (a1.x + a2.x) / 2, (a1.y + a2.y) / 2) || skip(L, (b1.x + b2.x) / 2, (b1.y + b2.y) / 2))) continue;
          const u0 = along[i] / 4, u1 = along[i + 1] / 4;
          facing(g, [a1.x, a1.top, -a1.y], [b1.x, b1.top, -b1.y], [b2.x, b2.top, -b2.y], [a2.x, a2.top, -a2.y], [0, 1, 0],
            [o1 / 4, u0], [o1 / 4, u1], [o2 / 4, u1], [o2 / 4, u0], white);
          // kerb faces on both edges
          if (edges) for (const [e, side] of [[o1, -1], [o2, 1]] as const) {
            const ea = at(i, e), eb = at(i + 1, e), n = nrm[i];
            const out = [n[0] * side, 0, -n[1] * side];
            facing(g, [ea.x, ea.foot, -ea.y], [eb.x, eb.foot, -eb.y], [eb.x, eb.top, -eb.y], [ea.x, ea.top, -ea.y], out,
              [u0, 0], [u1, 0], [u1, 0.1], [u0, 0.1], white);
          }
        }
      }
    }
    return g.build();
  };
  const flatMat = (color: string, off: number, map?: THREE.Texture) =>
    new THREE.MeshLambertMaterial({ color, map, polygonOffset: true, polygonOffsetFactor: -off, polygonOffsetUnits: -off * 2 });
  const asphalt = TX.asphalt();
  const vehicle = D.rd.filter((r) => !PATHS.has(r.c));
  const kerbed = vehicle.filter((r) => KERBED.has(r.c));
  const addFlat = (g: THREE.BufferGeometry | null, m: THREE.Material) => {
    if (!g) return;
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; scene.add(mesh);
  };
  // street centrelines in a grid, so pavements can stop where they meet another street
  const streetCells = new Map<string, { r: unknown; a: number[]; b: number[]; w: number }[]>();
  for (const r of vehicle) for (let k = 0; k < r.p.length - 1; k++) {
    const a = r.p[k], b = r.p[k + 1], w = (RW[r.c] ?? 4) / 2;
    for (const [x, y] of [a, b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]]) {
      const key = `${Math.floor(x / 10)},${Math.floor(y / 10)}`;
      (streetCells.get(key) ?? streetCells.set(key, []).get(key)!).push({ r, a, b, w });
    }
  }
  const onOtherStreet = (own: unknown, x: number, y: number) => {
    const cx = Math.floor(x / 10), cy = Math.floor(y / 10);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) {
      for (const s of streetCells.get(`${i},${j}`) ?? []) {
        if (s.r === own) continue;
        const vx = s.b[0] - s.a[0], vy = s.b[1] - s.a[1], l2 = vx * vx + vy * vy || 1;
        const t = Math.min(1, Math.max(0, ((x - s.a[0]) * vx + (y - s.a[1]) * vy) / l2));
        if (Math.hypot(x - s.a[0] - vx * t, y - s.a[1] - vy * t) < s.w + 0.4) return true;
      }
    }
    return false;
  };
  const half = (r: { c: string }) => (RW[r.c] ?? 4) / 2;
  addFlat(strips(D.rd.filter((r) => PATHS.has(r.c)), (r) => [[-half(r), half(r)]], 0.1), flatMat("#a59577", 1, groundTex));
  addFlat(strips(vehicle.filter((r) => r.c === "service" || r.c === "unknown"), (r) => [[-half(r), half(r)]], 0.05, undefined, false), flatMat("#55575b", 2, asphalt));
  // carriageways have no edge faces: they'd show as lines across junctions, and the pavement kerbs cover them
  addFlat(strips(kerbed, (r) => [[-half(r), half(r)]], 0.07, undefined, false), flatMat("#4f5155", 3, asphalt));
  addFlat(strips(kerbed, (r) => [[half(r), half(r) + PAVE], [-half(r) - PAVE, -half(r)]], 0.2, onOtherStreet), flatMat("#a29f97", 2, asphalt));
  addFlat(ribbon(D.wl, () => 1.6, 0.05), flatMat("#4c7b94", 2));
  // garden paths (paving slabs) and driveways (tarmac or gravel)
  const seg = (s: number[]) => ({ p: [[s[0], s[1], 0], [s[2], s[3], 0]] });
  addFlat(strips((D.fp ?? []).map(seg), () => [[-0.55, 0.55]], 0.06), flatMat("#b3aa98", 2, TX.wall("stone", false)));
  addFlat(strips((D.dv ?? []).map(seg), () => [[-1.5, 1.5]], 0.05, undefined, false), flatMat("#8d8a84", 2, asphalt));

  // ponds and the lake
  for (const w of D.wp) {
    const shape = new THREE.Shape(w.r[0].map(([x, y]) => new THREE.Vector2(x, y)));
    for (const hole of w.r.slice(1)) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
    const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: "#46718a", polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    m.position.y = w.z - Z0;
    scene.add(m);
  }

  // ---- buildings, merged into chunks -------------------------------------------------
  // Each chunk keeps one geometry per surface: walls by material (with or without windows),
  // and roofs. Vertex colours tint each building.
  type Surf = "s" | "k" | "y" | "r";
  const chunks = new Map<string, Map<string, Geo>>();
  const geoFor = (x: number, y: number, key: string) => {
    const k = `${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`;
    let c = chunks.get(k);
    if (!c) chunks.set(k, (c = new Map()));
    let g = c.get(key);
    if (!g) c.set(key, (g = new Geo()));
    return g;
  };
  const WALL_TINTS: Record<Surf, number[][]> = {
    s: [[0.96, 0.86, 0.66], [0.93, 0.82, 0.6], [0.9, 0.84, 0.72], [0.98, 0.9, 0.74], [0.88, 0.8, 0.66]],   // Bath stone
    k: [[0.74, 0.44, 0.33], [0.68, 0.4, 0.31], [0.78, 0.5, 0.38], [0.64, 0.42, 0.34]],                   // red brick
    y: [[0.9, 0.77, 0.55], [0.86, 0.72, 0.5], [0.92, 0.8, 0.6]],                                        // buff brick
    r: [[0.96, 0.95, 0.91], [0.93, 0.91, 0.85], [0.97, 0.93, 0.83], [0.9, 0.9, 0.88]],                  // render
  };
  const ROOF_TINTS: Record<string, number[][]> = {
    s: [[0.34, 0.36, 0.41], [0.3, 0.32, 0.37], [0.38, 0.39, 0.43]],   // slate
    p: [[0.7, 0.4, 0.26], [0.64, 0.36, 0.24], [0.74, 0.46, 0.3]],     // clay pantiles
    c: [[0.48, 0.38, 0.32], [0.42, 0.35, 0.31], [0.52, 0.45, 0.4]],   // concrete tiles
    g: [[0.42, 0.43, 0.46], [0.36, 0.37, 0.4]],                       // modern grey tiles
  };
  const pick = <T,>(a: T[], r: number) => a[Math.floor(r * a.length) % a.length];
  const POT = [0.62, 0.34, 0.24];
  /** Box from (x, y) footprint centre, half-sizes along u and across, from y0 to y1. */
  const boxAt = (g: Geo, x: number, y: number, u: number[], hu: number, hv: number, y0: number, y1: number, col: number[]) => {
    const v = [-u[1], u[0]];
    const C = (su: number, sv: number, h: number) => [x + u[0] * su + v[0] * sv, h, -(y + u[1] * su + v[1] * sv)];
    const corners: [number, number][] = [[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]];
    for (let k = 0; k < 4; k++) {
      const [a1, b1] = corners[k], [a2, b2] = corners[(k + 1) % 4];
      const mx = (a1 + a2) / 2, my = (b1 + b2) / 2;
      const out = [u[0] * mx + v[0] * my, 0, -(u[1] * mx + v[1] * my)];
      facing(g, C(a1, b1, y0), C(a2, b2, y0), C(a2, b2, y1), C(a1, b1, y1), out, [0, 0], [1, 0], [1, 1], [0, 1], col);
    }
    facing(g, C(-hu, -hv, y1), C(hu, -hv, y1), C(hu, hv, y1), C(-hu, hv, y1), [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1], col);
  };
  /** Triangle with its true normal, turned to face along `hint`. */
  const triAuto = (g: Geo, a: number[], b: number[], c: number[], hint: number[], ua: number[], ub: number[], uc: number[], col: number[]) => {
    let n = norm(cross(sub(b, a), sub(c, a)));
    if (dot(n, hint) < 0) n = n.map((k) => -k);
    facingTri(g, a, b, c, n, ua, ub, uc, col);
  };

  D.bl.forEach((b, bi) => {
    const outerRing = b.r[0];
    let cx = 0, cy = 0;
    for (const [x, y] of outerRing) { cx += x; cy += y; }
    cx /= outerRing.length; cy /= outerRing.length;
    const surf = ((b.m as Surf) in WALL_TINTS ? b.m : "s") as Surf;
    const walls = geoFor(cx, cy, surf + (b.w ? "w" : "p"));
    const plain = geoFor(cx, cy, surf + "p");
    const roofs = geoFor(cx, cy, "roof");
    const ground = b.g - Z0, eave = ground + b.h, base = ground - 0.6;
    const wallCol = pick(WALL_TINTS[surf], hash(bi * 3 + 1));
    const roofCol = pick(ROOF_TINTS[b.rc ?? "s"] ?? ROOF_TINTS.s, hash(bi * 5 + 2));

    b.r.forEach((ring, ri) => {
      let area = 0;
      for (let i = 0; i < ring.length; i++) { const a = ring[i], q = ring[(i + 1) % ring.length]; area += a[0] * q[1] - q[0] * a[1]; }
      const sign = (area > 0 ? 1 : -1) * (ri === 0 ? 1 : -1);
      let along = hash(bi + 3) * 3.4;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], q = ring[(i + 1) % ring.length];
        const ex = q[0] - a[0], ey = q[1] - a[1], len = Math.hypot(ex, ey);
        if (len < 0.05) continue;
        if (ri === 0 && b.fe?.includes(i)) { along += len; continue; }   // a landmark's facade stands here
        const out = [sign * ey / len, 0, sign * ex / len]; // (x, north) normal (ey, -ex) -> scene (x, -north)
        const u0 = along / 3.4, u1 = (along + len) / 3.4;
        // windows sit at the same height on every storey: storeys are eaves / round(eaves / 3)
        const storey = b.h / (b.st ?? Math.max(1, Math.round(b.h / 2.9)));
        const v0 = (base - ground) / storey, v1 = b.h / storey;
        facing(walls, [a[0], base, -a[1]], [q[0], base, -q[1]], [q[0], eave, -q[1]], [a[0], eave, -a[1]], out,
          [u0, v0], [u1, v0], [u1, v1], [u0, v1], wallCol);
        if (b.pp && ri === 0) {
          // a parapet: the wall carries on past the eaves, seen from both sides
          const top = eave + b.pp, vp = (b.h + b.pp) / storey, back = out.map((k) => -k);
          facing(plain, [a[0], eave, -a[1]], [q[0], eave, -q[1]], [q[0], top, -q[1]], [a[0], top, -a[1]], out, [u0, v1], [u1, v1], [u1, vp], [u0, vp], wallCol);
          facing(plain, [a[0], eave, -a[1]], [q[0], eave, -q[1]], [q[0], top, -q[1]], [a[0], top, -a[1]], back, [u0, v1], [u1, v1], [u1, vp], [u0, vp], wallCol);
        }
        along += len;
      }
    });

    if (b.rr && b.rp) {
      // pitched roof over a rectangle whose first edge (q0 -> q1) runs along the ridge
      const q = b.rr;
      const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], L = Math.hypot(ux, uy) || 1;
      const vx = q[3][0] - q[0][0], vy = q[3][1] - q[0][1], Wd = Math.hypot(vx, vy) || 1;
      const mx = (q[0][0] + q[2][0]) / 2, my = (q[0][1] + q[2][1]) / 2;
      const u = [ux / L, uy / L], v = [vx / Wd, vy / Wd];
      const attached = b.c === "terrace" || b.c === "semi";
      // overhang at the sides and at the ends; behind a parapet the roof stops short of the walls
      const OHs = b.pp ? -0.3 : 0.3, OHe = b.pp ? -0.3 : attached ? 0 : 0.3;
      const [hip0, hip1] = b.hp ?? [0, 0];
      const hl0 = L / 2 + (hip0 ? OHs : OHe), hl1 = L / 2 + (hip1 ? OHs : OHe), hw = Wd / 2 + OHs;
      const ridge = eave + b.rp, drop = (OHs * b.rp) / (Wd / 2);
      const P = (su: number, sv: number, h: number) => [mx + u[0] * su + v[0] * sv, h, -(my + u[1] * su + v[1] * sv)];
      // a hipped end pulls the ridge in by the half-width, so the hip slopes like the sides
      let ra = -hl0 + (hip0 ? hw : 0), rb = hl1 - (hip1 ? hw : 0);
      if (ra > rb) ra = rb = (ra + rb) / 2;
      const rA = P(ra, 0, ridge), rB = P(rb, 0, ridge);
      const slopeW = Math.hypot(hw, b.rp);
      for (const side of [-1, 1]) {
        const e0 = P(-hl0, side * hw, eave - drop), e1 = P(hl1, side * hw, eave - drop);
        const n = norm([v[0] * side * b.rp, hw, -(v[1] * side * b.rp)]);
        facing(roofs, e0, e1, rB, rA, n, [0, 0], [L / 2, 0], [(rb + hl0) / 2, slopeW / 2], [(ra + hl0) / 2, slopeW / 2], roofCol);
      }
      for (const [end, hip, hl, r] of [[-1, hip0, hl0, rA], [1, hip1, hl1, rB]] as const) {
        const hint = [u[0] * end, 0.5, -u[1] * end];
        if (hip) {
          const c0 = P(end * hl, -hw, eave - drop), c1 = P(end * hl, hw, eave - drop);
          triAuto(roofs, c0, c1, r as number[], hint, [0, 0], [Wd / 2, 0], [Wd / 4, slopeW / 2], roofCol);
        } else {
          // gable end: a wall triangle over the end wall
          const g0 = P(end * L / 2, -Wd / 2, eave), g1 = P(end * L / 2, Wd / 2, eave), top = P(end * L / 2, 0, ridge);
          const storey = b.h / (b.st ?? Math.max(1, Math.round(b.h / 2.9)));
          facingTri(plain, g0, g1, top, [u[0] * end, 0, -u[1] * end], [0, b.h / storey], [Wd / 3.4, b.h / storey], [Wd / 6.8, (b.h + b.rp) / storey], wallCol);
        }
      }
      // chimney stacks on the ridge, each with two pots
      for (const [x, y] of b.ch ?? []) {
        const s = (x - mx) * u[0] + (y - my) * u[1];
        const top = ridge + 0.95;
        // stacks off the ridge (on a hip) start lower so they still meet the roof
        const along = Math.min(1, Math.max(0, (s < ra ? (s + hl0) / Math.max(0.1, ra + hl0) : s > rb ? (hl1 - s) / Math.max(0.1, hl1 - rb) : 1)));
        boxAt(plain, x, y, u, 0.3, 0.55, eave + b.rp * along * 0.5, top, wallCol);
        for (const off of [-0.22, 0.22]) boxAt(roofs, x + v[0] * off, y + v[1] * off, u, 0.1, 0.1, top, top + 0.38, POT);
        // a TV aerial lashed to about a third of the stacks
        if (hash(Math.round(x * 17 + y * 29)) < 0.35) {
          const AER = [0.22, 0.23, 0.24];
          boxAt(roofs, x, y, u, 0.025, 0.025, top + 0.38, top + 2.1, AER);
          for (const hh of [1.6, 1.9]) boxAt(roofs, x, y, u, 0.55, 0.02, top + hh, top + hh + 0.04, AER);
        }
      }
    } else {
      // flat roof with a little parapet colour
      const contour = outerRing.map(([x, y]) => new THREE.Vector2(x, y));
      const holes = b.r.slice(1).map((h) => h.map(([x, y]) => new THREE.Vector2(x, y)));
      const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
      const all = [...contour, ...holes.flat()];
      const fc = [0.42, 0.42, 0.43];
      for (const [i, j, k] of tris) {
        const A = all[i], B = all[j], C = all[k];
        facingTri(roofs, [A.x, eave, -A.y], [B.x, eave, -B.y], [C.x, eave, -C.y], [0, 1, 0], [A.x / 2, A.y / 2], [B.x / 2, B.y / 2], [C.x / 2, C.y / 2], fc);
      }
    }
  });
  const wallMats: Record<string, THREE.Material> = {};
  for (const sfc of ["s", "k", "y", "r"] as Surf[]) {
    const kind = sfc === "s" ? "stone" : sfc === "r" ? "render" : "brick";
    wallMats[sfc + "w"] = new THREE.MeshLambertMaterial({ map: TX.wall(kind, true), vertexColors: true });
    wallMats[sfc + "p"] = new THREE.MeshLambertMaterial({ map: TX.wall(kind, false), vertexColors: true });
  }
  wallMats.roof = new THREE.MeshLambertMaterial({ map: TX.roofTiles(), vertexColors: true, side: THREE.DoubleSide });  // undersides of the eaves show from the street
  for (const c of chunks.values()) {
    for (const [key, geo] of c) {
      const g = geo.build();
      if (!g) continue;
      const m = new THREE.Mesh(g, wallMats[key]);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }
  }
  buildLandmarks(map, scene);

  // ---- walls, fences and hedges -------------------------------------------------------------
  // material, thickness and colour of each kind of wall, fence and hedge
  type BarMat = "stone" | "brick" | "leaf" | "wood" | "iron";
  // foot: how far below the line's ground the face goes (a ha-ha's drops into its ditch)
  const BAR: Record<string, { mat: BarMat; t: number; col: number[]; foot?: number }> = {
    wall: { mat: "stone", t: 0.45, col: [0.86, 0.78, 0.6] }, retaining_wall: { mat: "stone", t: 0.5, col: [0.8, 0.73, 0.57] },
    stone_wall: { mat: "stone", t: 0.45, col: [0.84, 0.76, 0.58] }, garden_wall: { mat: "stone", t: 0.35, col: [0.9, 0.82, 0.64] },
    brick_wall: { mat: "brick", t: 0.3, col: [0.7, 0.42, 0.32] }, brick_wall_low: { mat: "brick", t: 0.3, col: [0.72, 0.45, 0.34] },
    fence: { mat: "wood", t: 0.08, col: [0.55, 0.42, 0.3] },
    hedge: { mat: "leaf", t: 0.9, col: [0.42, 0.58, 0.3] }, hedge_low: { mat: "leaf", t: 0.7, col: [0.46, 0.62, 0.32] },
    railing: { mat: "iron", t: 0.05, col: [0.16, 0.17, 0.18] },
    haha: { mat: "stone", t: 0.5, col: [0.84, 0.76, 0.58], foot: 2.3 },
  };
  const barGeos = new Map<string, Geo>();
  const barGeo = (x: number, y: number, mat: BarMat) => {
    const k = `${mat}:${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`;
    let g = barGeos.get(k);
    if (!g) barGeos.set(k, (g = new Geo()));
    return g;
  };
  const barrierRun = (l: Line) => {
    const spec = BAR[l.c] ?? BAR.wall, hh = BARRIER_HEIGHT[l.c] ?? 1.5, t = spec.t / 2;
    const g = barGeo(l.p[0][0], l.p[0][1], spec.mat);
    const tint = hash(Math.round(l.p[0][0] * 7 + l.p[0][1] * 13)) * 0.12 + 0.94;
    const col = spec.col.map((c) => c * tint);
    let along = 0;
    for (let i = 0; i < l.p.length - 1; i++) {
      const a = l.p[i], q = l.p[i + 1];
      const ex = q[0] - a[0], ey = q[1] - a[1], len = Math.hypot(ex, ey);
      if (len < 0.05) continue;
      const nx = ey / len * t, ny = -ex / len * t;
      const ga = a[2] - Z0, gq = q[2] - Z0;
      const c4 = [[a[0] + nx, a[1] + ny, ga], [q[0] + nx, q[1] + ny, gq], [q[0] - nx, q[1] - ny, gq], [a[0] - nx, a[1] - ny, ga]];
      const P = (k: number, top: boolean) => [c4[k][0], top ? c4[k][2] + hh : c4[k][2] - (spec.foot ?? 0.4), -c4[k][1]];
      const u0 = along / 2, u1 = (along + len) / 2, vt = (hh + (spec.foot ?? 0.4)) / 2;
      facing(g, P(0, false), P(1, false), P(1, true), P(0, true), [nx, 0, -ny], [u0, 0], [u1, 0], [u1, vt], [u0, vt], col);
      facing(g, P(3, false), P(2, false), P(2, true), P(3, true), [-nx, 0, ny], [u0, 0], [u1, 0], [u1, vt], [u0, vt], col);
      if (spec.mat !== "iron") {
        // stone and brick walls get a slightly darker coping along the top
        const top = spec.mat === "stone" || spec.mat === "brick" ? col.map((c) => c * 0.85) : col;
        facing(g, P(0, true), P(1, true), P(2, true), P(3, true), [0, 1, 0], [u0, 0], [u1, 0], [u1, t], [u0, t], top);
      }
      along += len;
    }
  };
  D.br.forEach(barrierRun);

  // garden gates: pillars either side, and a gate standing a little open
  for (const gt of D.gt ?? []) {
    const [x0, y0, x1, y1, z, style] = gt as [number, number, number, number, number, string];
    const spec = BAR[style] ?? BAR.garden_wall, hh = BARRIER_HEIGHT[style] ?? 1;
    const ux = x1 - x0, uy = y1 - y0, w = Math.hypot(ux, uy) || 1, u = [ux / w, uy / w];
    const ground = z - Z0;
    if (spec.mat === "stone" || spec.mat === "brick") {
      for (const [px, py] of [[x0, y0], [x1, y1]]) boxAt(barGeo(px, py, spec.mat), px, py, u, 0.2, 0.2, ground - 0.3, ground + hh + 0.22, spec.col.map((c) => c * 0.95));
    }
    // the gate itself, hinged at the first post and swung 35 degrees into the garden
    const ang = Math.atan2(u[1], u[0]) - 0.6;
    const gu = [Math.cos(ang), Math.sin(ang)], gl = Math.min(1.0, w - 0.1);
    const cx = x0 + gu[0] * gl / 2, cy = y0 + gu[1] * gl / 2;
    const iron = spec.mat === "iron" || hash(Math.round(x0 * 31)) < 0.4;
    boxAt(barGeo(cx, cy, iron ? "iron" : "wood"), cx, cy, gu, gl / 2, 0.025, ground + 0.08, ground + Math.min(1.0, hh + 0.05),
      iron ? [0.16, 0.17, 0.18] : [0.5, 0.38, 0.26]);
  }
  const barMats: Record<BarMat, THREE.Material> = {
    stone: new THREE.MeshLambertMaterial({ map: TX.wall("stone", false), vertexColors: true }),
    brick: new THREE.MeshLambertMaterial({ map: TX.wall("brick", false), vertexColors: true }),
    leaf: new THREE.MeshLambertMaterial({ map: TX.leaves(), vertexColors: true }),
    wood: new THREE.MeshLambertMaterial({ map: TX.boards(), vertexColors: true, side: THREE.DoubleSide }),
    iron: new THREE.MeshLambertMaterial({ map: TX.railings(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
  };
  for (const [k, geo] of barGeos) {
    const g = geo.build();
    if (!g) continue;
    const m = new THREE.Mesh(g, barMats[k.split(":")[0] as BarMat]);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    culler.add(m, 230);
  }

  // ---- trees: instanced, in chunks so each chunk can be culled --------------------------------
  // low-poly on purpose: there are tens of thousands of these
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 5, 1, true).translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 0);
  const coneGeo = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: "#6b5340", map: TX.bark() });
  const leafMat = new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true });
  const treeChunks = new Map<string, number[][]>();
  for (const t of D.tr) {
    const k = `${Math.floor(t[0] / 160)},${Math.floor(t[1] / 160)}`;
    (treeChunks.get(k) ?? treeChunks.set(k, []).get(k)!).push(t);
  }
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  const LEAF = ["#4d6b2c", "#58772f", "#3f5f2a", "#647f35", "#4a6630", "#6b7b2f"].map((h) => new THREE.Color(h));
  let ti = 0;
  for (const list of treeChunks.values()) {
    // a fifth value marks a tree inside a wood (1: trunk only, the wood canopy is drawn as one
    // surface) or one that's always broadleaf (2: the Circus planes)
    const cones = list.filter((t, i) => t[4] === undefined && hash(ti + i * 31) < 0.08);
    const rounds = list.filter((t, i) => t[4] !== 1 && !(t[4] === undefined && hash(ti + i * 31) < 0.08));
    ti += list.length;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
    const crowns = new THREE.InstancedMesh(crownGeo, leafMat, rounds.length);
    const conesM = new THREE.InstancedMesh(coneGeo, leafMat, Math.max(1, cones.length));
    conesM.count = cones.length;
    list.forEach(([x, y, z, s], i) => {
      const h = (cones.includes(list[i]) ? 2.2 : 3.4) * s;
      mtx.compose(ps.set(x, z - Z0 - 0.2, -y), q.identity(), sc.set(s, h, s));
      trunks.setMatrixAt(i, mtx);
    });
    rounds.forEach(([x, y, z, s], i) => {
      const r = hash(i + x * 7);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r * 6.28);
      mtx.compose(ps.set(x, z - Z0 + 4.6 * s, -y), q, sc.set(2.7 * s * (0.85 + r * 0.3), 2.9 * s, 2.7 * s * (1.15 - r * 0.3)));
      crowns.setMatrixAt(i, mtx);
      crowns.setColorAt(i, LEAF[Math.floor(r * LEAF.length)]);
    });
    cones.forEach(([x, y, z, s], i) => {
      mtx.compose(ps.set(x, z - Z0 + 1.4 * s, -y), q.identity(), sc.set(2.1 * s, 8 * s, 2.1 * s));
      conesM.setMatrixAt(i, mtx);
      conesM.setColorAt(i, new THREE.Color("#2f4a2a"));
    });
    for (const m of [trunks, crowns, conesM]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.computeBoundingSphere();
      scene.add(m);
      culler.add(m, 300);
    }
  }

  // ---- wood canopy: one leafy surface over the woods, with the trunks below ---------------
  if (D.cn) {
    const C = D.cn, raw = atob(C.h), H = new Uint8Array(raw.length);
    for (let k = 0; k < raw.length; k++) H[k] = raw.charCodeAt(k);
    const hAtC = (i: number, j: number) => (i < 0 || j < 0 || i >= C.nx || j >= C.ny ? 0 : H[j * C.nx + i]);
    // corner heights: the average of the canopy cells around each corner (edges taper down)
    const corner = (i: number, j: number) => {
      let s = 0, n = 0;
      for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) { const v = hAtC(a, b); if (v) { s += v; n++; } }
      return n ? (s / n) * (0.55 + 0.45 * n / 4) : 0;
    };
    const geos = new Map<string, Geo>();
    const LEAVES = [[0.36, 0.5, 0.24], [0.32, 0.46, 0.22], [0.4, 0.53, 0.26], [0.34, 0.44, 0.2]];
    for (let j = 0; j < C.ny; j++) for (let i = 0; i < C.nx; i++) {
      const h = hAtC(i, j);
      if (!h) continue;
      const x0 = C.x0 + (i - 0.5) * C.step, x1 = x0 + C.step, y0 = C.y0 + (j - 0.5) * C.step, y1 = y0 + C.step;
      const key = `${Math.floor(x0 / 160)},${Math.floor(y0 / 160)}`;
      let g = geos.get(key);
      if (!g) geos.set(key, (g = new Geo()));
      const col = LEAVES[Math.floor(hash(i * 7919 + j) * LEAVES.length)];
      const lump = (a: number, b: number) => (hash(a * 31337 + b * 17) - 0.5) * 1.6;
      const P = (x: number, y: number, a: number, b: number, under: boolean) => {
        const hc = Math.max(1.5, corner(a, b));
        return [x, map.ground(x, -y) + (under ? hc * 0.5 : hc + lump(a, b)), -y];
      };
      const t = [P(x0, y0, i, j, false), P(x1, y0, i + 1, j, false), P(x1, y1, i + 1, j + 1, false), P(x0, y1, i, j + 1, false)];
      const b = [P(x0, y0, i, j, true), P(x1, y0, i + 1, j, true), P(x1, y1, i + 1, j + 1, true), P(x0, y1, i, j + 1, true)];
      const uv = [[x0 / 4, y0 / 4], [x1 / 4, y0 / 4], [x1 / 4, y1 / 4], [x0 / 4, y1 / 4]];
      facing(g, t[0], t[1], t[2], t[3], [0, 1, 0], uv[0], uv[1], uv[2], uv[3], col);
      facing(g, b[0], b[1], b[2], b[3], [0, -1, 0], uv[0], uv[1], uv[2], uv[3], col.map((c) => c * 0.7));
      // sides where the wood ends
      const sides: [number, number, number, number, number[]][] = [[0, 1, i, j - 1, [0, 0, 1]], [1, 2, i + 1, j, [1, 0, 0]], [2, 3, i, j + 1, [0, 0, -1]], [3, 0, i - 1, j, [-1, 0, 0]]];
      for (const [p, q, ni, nj, out] of sides) {
        if (hAtC(ni, nj)) continue;
        facing(g, b[p], b[q], t[q], t[p], out, [0, 0], [1, 0], [1, 1], [0, 1], col.map((c) => c * 0.85));
      }
    }
    const canopyMat = new THREE.MeshLambertMaterial({ map: TX.leaves(), vertexColors: true });
    for (const g of geos.values()) {
      const built = g.build();
      if (!built) continue;
      const m = new THREE.Mesh(built, canopyMat);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      culler.add(m, 380);
    }
  }

  // ---- front doors, garden shrubs ---------------------------------------------------------
  {
    const DOOR = ["#1f3b2d", "#24324a", "#6b1f24", "#2b2b2b", "#e8e4d8", "#3f6a73", "#5c4a3a", "#7c8a6a"].map((c) => new THREE.Color(c));
    const doors = D.dr ?? [];
    const frameGeo = new THREE.BoxGeometry(1.25, 2.45, 0.06).translate(0, 1.22, 0.03);
    const doorGeo = new THREE.BoxGeometry(0.95, 2.05, 0.08).translate(0, 1.02, 0.05);
    const fanGeo = new THREE.BoxGeometry(0.95, 0.28, 0.07).translate(0, 2.24, 0.05);
    const byChunk = new Map<string, number[][]>();
    for (const d of doors) { const k = `${Math.floor(d[0] / 250)},${Math.floor(d[1] / 250)}`; (byChunk.get(k) ?? byChunk.set(k, []).get(k)!).push(d); }
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pp = new THREE.Vector3();
    const frameMat = new THREE.MeshLambertMaterial({ color: "#ece6d6" }), fanMat = new THREE.MeshLambertMaterial({ color: "#2a3640" });
    const doorMat = new THREE.MeshLambertMaterial({ color: "#ffffff" });
    for (const list of byChunk.values()) {
      const meshes = [new THREE.InstancedMesh(frameGeo, frameMat, list.length), new THREE.InstancedMesh(doorGeo, doorMat, list.length), new THREE.InstancedMesh(fanGeo, fanMat, list.length)];
      list.forEach((d, k) => {
        qq.setFromAxisAngle(up, d[3]);
        m4.compose(pp.set(d[0], d[2] - Z0, -d[1]), qq, one);
        for (const m of meshes) m.setMatrixAt(k, m4);
        meshes[1].setColorAt(k, DOOR[d[4] % DOOR.length]);
      });
      for (const m of meshes) { m.computeBoundingSphere(); scene.add(m); culler.add(m, 150); }
    }
    // porch canopies over about half the front doors
    const hoodGeo = new THREE.BoxGeometry(1.6, 0.1, 0.8).rotateX(0.22).translate(0, 2.62, 0.42);
    const hoodMat = new THREE.MeshLambertMaterial({ color: "#5a5d62" });
    const hooded = doors.filter((d) => hash(Math.round(d[0] * 11 + d[1] * 3)) < 0.5);
    if (hooded.length) {
      const hm = new THREE.InstancedMesh(hoodGeo, hoodMat, hooded.length);
      hooded.forEach((d, k) => { qq.setFromAxisAngle(up, d[3]); m4.compose(pp.set(d[0], d[2] - Z0, -d[1]), qq, one); hm.setMatrixAt(k, m4); });
      hm.castShadow = true; hm.computeBoundingSphere(); scene.add(hm); culler.add(hm, 150);
    }
    // bay windows, with a small hipped roof on top
    const BAY_TEX: Record<string, "stone" | "brick" | "render"> = { s: "stone", b: "brick", r: "render" };
    const BAY_TINT: Record<string, string> = { s: "#f1dfb6", b: "#b9765c", r: "#f2efe7" };
    const bayRoofMat = new THREE.MeshLambertMaterial({ color: "#4a4e55" });
    for (const storeys of [1, 2]) for (const mcode of ["s", "b", "r"]) {
      const list = (D.by ?? []).filter((b) => b[4] === storeys && b[5] === mcode);
      if (!list.length) continue;
      const hgt = 2.75 * storeys;
      const geo = new THREE.BoxGeometry(2.4, hgt + 0.3, 0.9).translate(0, (hgt + 0.3) / 2 - 0.3, 0);
      const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * storeys);
      const mat = new THREE.MeshLambertMaterial({ map: TX.wall(BAY_TEX[mcode], true), color: BAY_TINT[mcode] });
      const roofGeo = new THREE.ConeGeometry(1.0, 0.7, 4, 1).rotateY(Math.PI / 4).scale(1.75, 1, 0.75).translate(0, hgt + 0.35, 0);
      const bm = new THREE.InstancedMesh(geo, mat, list.length), rm = new THREE.InstancedMesh(roofGeo, bayRoofMat, list.length);
      list.forEach((b, k) => {
        const w = (b[6] as number) / 2.4;
        qq.setFromAxisAngle(up, b[3] as number);
        m4.compose(pp.set(b[0] as number, (b[2] as number) - Z0, -(b[1] as number)), qq, new THREE.Vector3(w, 1, 1));
        bm.setMatrixAt(k, m4); rm.setMatrixAt(k, m4);
      });
      for (const m of [bm, rm]) { m.castShadow = m.receiveShadow = true; m.computeBoundingSphere(); scene.add(m); culler.add(m, 170); }
    }

    const shrubGeo = new THREE.IcosahedronGeometry(1, 0);
    const shrubMat = new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true });
    const SHRUB = ["#4f6b33", "#5d7a3a", "#466230", "#6b7d3d", "#557540"].map((c) => new THREE.Color(c));
    const sChunks = new Map<string, number[][]>();
    for (const s of D.sb ?? []) { const k = `${Math.floor(s[0] / 160)},${Math.floor(s[1] / 160)}`; (sChunks.get(k) ?? sChunks.set(k, []).get(k)!).push(s); }
    for (const list of sChunks.values()) {
      const m = new THREE.InstancedMesh(shrubGeo, shrubMat, list.length);
      list.forEach(([x, y, z, h], k) => {
        const r = hash(Math.round(x * 13 + y * 7));
        qq.setFromAxisAngle(up, r * 6.28);
        m4.compose(pp.set(x, z - Z0 + h * 0.38, -y), qq, new THREE.Vector3(h * (0.55 + r * 0.2), h * 0.45, h * (0.65 - r * 0.15)));
        m.setMatrixAt(k, m4);
        m.setColorAt(k, SHRUB[Math.floor(r * SHRUB.length)]);
      });
      m.castShadow = true; m.receiveShadow = true;
      m.computeBoundingSphere();
      scene.add(m);
      culler.add(m, 180);
    }
  }

  // ---- Prior Park mansion's north portico: six giant Corinthian columns and a pediment --------
  for (const [kind, x, y, z, ang, width, height] of D.lm ?? []) {
    if (kind !== "portico") continue;
    const w = width as number, h = height as number;
    const stoneP = new THREE.MeshLambertMaterial({ color: "#e0cfa6" });
    const grp = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, px: number, py: number, pz: number) => { const m = new THREE.Mesh(geo, stoneP); m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; grp.add(m); };
    add(new THREE.BoxGeometry(w + 2, 1.6, 6), 0, 0.8, 3);                                // podium and steps
    for (let k = 0; k < 6; k++) add(new THREE.CylinderGeometry(0.45, 0.5, h - 2.4, 12), -w / 2 + 0.8 + k * (w - 1.6) / 5, 1.6 + (h - 2.4) / 2, 4.8);
    add(new THREE.BoxGeometry(w + 0.6, 1.3, 5.2), 0, h - 0.15, 3.1);                     // entablature
    const ped = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.3, 0), new THREE.Vector2(w / 2 + 0.3, 0), new THREE.Vector2(0, 2.9)]);
    const pg = new THREE.ExtrudeGeometry(ped, { depth: 5.2, bevelEnabled: false });
    const pm = new THREE.Mesh(pg, stoneP); pm.position.set(0, h + 0.5, 0.5); pm.castShadow = true; grp.add(pm);
    grp.position.set(x as number, (z as number) - Z0, -(y as number));
    grp.rotation.y = ang as number;
    scene.add(grp);
  }

  // ---- the Palladian Bridge, Prior Park (1755) ---------------------------------------------
  for (const [kind, x, y, z, ang] of D.lm ?? []) {
    if (kind !== "bridge") continue;
    const stoneB = new THREE.MeshLambertMaterial({ color: "#dccba3" }), shade = new THREE.MeshLambertMaterial({ color: "#5d5546" });
    const slate = new THREE.MeshLambertMaterial({ color: "#4a4e55" });
    const grp = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; grp.add(m); };
    add(new THREE.BoxGeometry(18, 3.2, 6.4), stoneB, 0, 0.6, 0);                         // the arched base
    for (const ax of [-5, 0, 5]) add(new THREE.BoxGeometry(3.4, 2.2, 6.5), shade, ax, -0.2, 0);   // three arches
    add(new THREE.BoxGeometry(18.4, 0.35, 6.8), stoneB, 0, 2.35, 0);                   // deck
    for (const ex of [-7.4, 7.4]) add(new THREE.BoxGeometry(3.2, 5.2, 6.4), stoneB, ex, 5.0, 0);   // end pavilions
    for (const cx of [-4.4, -1.5, 1.5, 4.4]) for (const cz of [-2.9, 2.9]) add(new THREE.CylinderGeometry(0.28, 0.32, 4.4, 10), stoneB, cx, 4.7, cz);   // Ionic columns
    add(new THREE.BoxGeometry(12, 0.6, 6.6), stoneB, 0, 7.15, 0);                      // entablature
    const roof = new THREE.CylinderGeometry(0.01, 4.4, 2.2, 4, 1).rotateY(Math.PI / 4).scale(2.9, 1, 1.05);
    add(roof, slate, 0, 8.55, 0);
    for (const ex of [-7.4, 7.4]) add(new THREE.CylinderGeometry(0.01, 2.7, 1.8, 4, 1).rotateY(Math.PI / 4), slate, ex, 8.5, 0);
    grp.position.set(x as number, (z as number) - Z0, -(y as number));
    grp.rotation.y = ang as number;
    scene.add(grp);
  }

  buildFurniture(map, scene, culler);
  buildShops(map, scene, culler);

  // ---- the force field: a shimmering wall around the play area ------------------------------
  const fieldMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { time: { value: 0 }, player: { value: new THREE.Vector3() } },
    vertexShader: `varying vec3 vW; varying vec2 vUv;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float time; uniform vec3 player; varying vec3 vW; varying vec2 vUv;
      void main(){
        float a = vUv.x * 1600.0, h = vW.y;
        vec2 g = vec2(a, h * 1.15 - a * 0.5);
        vec2 f = abs(fract(g / 4.0) - 0.5);
        float hex = smoothstep(0.42, 0.5, max(f.x, f.y));
        float scan = 0.5 + 0.5 * sin(h * 0.35 - time * 2.2);
        float near = 1.0 - smoothstep(10.0, 140.0, distance(vW.xz, player.xz));
        float fade = 1.0 - smoothstep(0.0, 1.0, vUv.y);
        float alpha = (0.07 + hex * 0.35 + scan * 0.06) * (0.35 + near * 0.9) * fade;
        gl_FragColor = vec4(vec3(0.35, 0.75, 1.0) * alpha, alpha);
      }`,
  });
  const fieldMesh = new THREE.Mesh(new THREE.CylinderGeometry(map.field, map.field, 260, 256, 1, true), fieldMat);
  fieldMesh.position.y = 100;
  fieldMesh.renderOrder = 5;
  scene.add(fieldMesh);
  const clock = new THREE.Clock();

  // Where the drawn surface sits: the sunken terrain, or a street, pavement or path on top of it.
  const surfCells = new Map<number, { a: number[]; b: number[]; half: number; lift: number; pave: boolean }[]>();
  const surfKey = (x: number, y: number) => (Math.floor(x / 10) + 1000) * 4000 + Math.floor(y / 10) + 1000;
  for (const r of D.rd) {
    const path = PATHS.has(r.c), kerbed = KERBED.has(r.c);
    if (!path && !kerbed && r.c !== "service" && r.c !== "unknown") continue;   // not drawn as a strip
    const half = (RW[r.c] ?? 4) / 2, lift = path ? 0.1 : kerbed ? 0.07 : 0.05, reach = half + (kerbed ? PAVE : 0);
    for (let k = 0; k < r.p.length - 1; k++) {
      const a = r.p[k], b = r.p[k + 1], seg = { a, b, half, lift, pave: kerbed };
      const keys = new Set<number>();
      for (let i = Math.floor((Math.min(a[0], b[0]) - reach) / 10); i <= Math.floor((Math.max(a[0], b[0]) + reach) / 10); i++)
        for (let j = Math.floor((Math.min(a[1], b[1]) - reach) / 10); j <= Math.floor((Math.max(a[1], b[1]) + reach) / 10); j++)
          keys.add(surfKey(i * 10, j * 10));
      for (const key of keys) (surfCells.get(key) ?? surfCells.set(key, []).get(key)!).push(seg);
    }
  }
  const drawnGround = (x: number, z: number) => {
    const fi = (x - T.x0) / T.dx, fj = (-z - T.y0) / T.dy;
    const i = Math.min(T.nx - 2, Math.max(0, Math.floor(fi))), j = Math.min(T.ny - 2, Math.max(0, Math.floor(fj)));
    const u = Math.min(1, Math.max(0, fi - i)), v = Math.min(1, Math.max(0, fj - j));
    const h = (k: number) => tPos[k * 3 + 1], n = T.nx, a = j * n + i;
    if (u + v <= 1) return h(a) + (h(a + 1) - h(a)) * u + (h(a + n) - h(a)) * v;
    return h(a + n + 1) + (h(a + n) - h(a + n + 1)) * (1 - u) + (h(a + 1) - h(a + n + 1)) * (1 - v);
  };
  const surface = (x: number, z: number) => {
    const y = -z;
    let road = 0, pave = false, path = 0;
    for (const s of surfCells.get(surfKey(x, y)) ?? []) {
      const vx = s.b[0] - s.a[0], vy = s.b[1] - s.a[1], l2 = vx * vx + vy * vy || 1;
      const t = Math.min(1, Math.max(0, ((x - s.a[0]) * vx + (y - s.a[1]) * vy) / l2));
      const d = Math.hypot(x - s.a[0] - vx * t, y - s.a[1] - vy * t);
      if (d < s.half) { if (s.lift === 0.1) path = 0.1; else road = Math.max(road, s.lift); }
      else if (s.pave && d < s.half + PAVE) pave = true;
    }
    // carriageways win over pavements: the pavement stops where it would cross another street
    const lift = road || (pave ? 0.2 : path);
    return lift ? map.ground(x, z) + lift : drawnGround(x, z);
  };

  return {
    scene, sun, surface,
    update(px: number, py: number, pz: number, dt = 0.016) {
      culler.update(px, pz, dt);
      fieldMat.uniforms.time.value = clock.getElapsedTime();
      fieldMat.uniforms.player.value.set(px, py, pz);
      sky.position.set(px, py, pz);
      // keep the shadow camera on the player, snapped to texels so shadows don't shimmer
      const snap = 140 / 2048;
      const cx = Math.round(px / snap) * snap, cz = Math.round(pz / snap) * snap;
      sun.target.position.set(cx, py, cz);
      sun.position.set(cx + SUN_DIR.x * 200, py + SUN_DIR.y * 200, cz + SUN_DIR.z * 200);
    },
    dispose() {
      const textures = new Set<THREE.Texture>();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        if (o instanceof THREE.InstancedMesh) o.dispose();
        for (const mat of m.material ? ([] as THREE.Material[]).concat(m.material) : []) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) textures.add(v);
          if (mat instanceof THREE.ShaderMaterial) for (const u of Object.values(mat.uniforms)) if (u.value instanceof THREE.Texture) textures.add(u.value);
          mat.dispose();
        }
      });
      textures.forEach((t) => t.dispose());
      sun.dispose();
    },
  };
}
