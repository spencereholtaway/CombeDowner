// Grass: tufts of blades on the lawns, verges, pitches and meadows around the player, swaying in
// the wind and shrinking into the ground towards the edge of a circle that follows the player.
// The ground is split into cells; cells that come into range are filled, cells left behind are
// reused. A coarse mask keeps grass off buildings, roads, paths, driveways and water.
import * as THREE from "three";
import { boreHalf, type MapData } from "./map";

function hash2(i: number, j: number, k: number) {
  let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(j + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(k + 0x1b873593, 0x27d4eb2f);
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** A tuft of bent, tapering blades (and a flower head, shown only on flowering tufts). */
function tuftGeo() {
  const pos: number[] = [], col: number[] = [], head: number[] = [];
  const BLADES = 6;
  for (let b = 0; b < BLADES; b++) {
    const a = (b / BLADES) * Math.PI * 2 + hash2(b, 1, 2) * 0.8, d = 0.03 + hash2(b, 3, 4) * 0.13;
    const bx = Math.cos(a) * d, bz = Math.sin(a) * d;
    const h = 0.6 + hash2(b, 5, 6) * 0.45, w = 0.03 + hash2(b, 7, 8) * 0.02, lean = 0.06 + hash2(b, 9, 10) * 0.18;
    const fa = a + (hash2(b, 11, 12) - 0.5) * 2;   // the way the blade faces
    const px = -Math.sin(fa) * w, pz = Math.cos(fa) * w;
    const lx = Math.cos(a) * lean, lz = Math.sin(a) * lean;
    // root, middle and tip, the blade bending further out as it rises
    const P = (t: number, side: number) => [bx + lx * t * t + px * side * (1 - t), h * t, bz + lz * t * t + pz * side * (1 - t)];
    const r0l = P(0, -1), r0r = P(0, 1), m1l = P(0.55, -1), m1r = P(0.55, 1), tip = P(1, 0);
    const shadeR = 0.68, shadeM = 0.9, shadeT = 1.15;
    pos.push(...r0l, ...r0r, ...m1r, ...r0l, ...m1r, ...m1l, ...m1l, ...m1r, ...tip);
    col.push(shadeR, shadeR, shadeR, shadeR, shadeR, shadeR, shadeM, shadeM, shadeM,
      shadeR, shadeR, shadeR, shadeM, shadeM, shadeM, shadeM, shadeM, shadeM,
      shadeM, shadeM, shadeM, shadeM, shadeM, shadeM, shadeT, shadeT, shadeT);
    for (let k = 0; k < 9; k++) head.push(0);
  }
  // flower head: a little pyramid on a stalk-height point above the blades
  const fy = 0.95, fr = 0.06;
  const top = [0.02, fy + 0.04, 0], ring = [0, 1, 2, 3].map((k) => [0.02 + Math.cos(k * Math.PI / 2) * fr, fy, Math.sin(k * Math.PI / 2) * fr]);
  for (let k = 0; k < 4; k++) {
    pos.push(...ring[k], ...ring[(k + 1) % 4], ...top);
    for (let v = 0; v < 3; v++) { col.push(1, 1, 1); head.push(1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  // lit like the ground it grows from, so the lawn and the blades match
  g.setAttribute("normal", new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute("aHead", new THREE.Float32BufferAttribute(head, 1));
  return g;
}

export interface Grass {
  update(px: number, pz: number): void;
}

function markTri(mask: Uint8Array, W: number, H: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (area === 0) return;
  if (area < 0) { const tx = bx, ty = by; bx = cx; by = cy; cx = tx; cy = ty; }
  const lab = Math.hypot(bx - ax, by - ay), lbc = Math.hypot(cx - bx, cy - by), lca = Math.hypot(ax - cx, ay - cy), M = 0.23;
  const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - M - 0.5)), i1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx) + M - 0.5));
  const j0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - M - 0.5)), j1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy) + M - 0.5));
  for (let j = j0; j <= j1; j++) {
    const py = j + 0.5;
    for (let i = i0; i <= i1; i++) {
      const px = i + 0.5;
      if ((bx - ax) * (py - ay) - (by - ay) * (px - ax) >= -M * lab && (cx - bx) * (py - by) - (cy - by) * (px - bx) >= -M * lbc && (ax - cx) * (py - cy) - (ay - cy) * (px - cx) >= -M * lca) mask[j * W + i] = 1;
    }
  }
}

/**
 * Grass for the map. groundAt gives the drawn ground height at scene (x, z); kinds are the
 * ground colours by kind (the terrain's palette), so tufts match the ground they stand on.
 * Built a step at a time (yields between), so a square of Bath loading in doesn't stall the game.
 */
export function* buildGrass(scene: THREE.Object3D, D: MapData, groundAt: (x: number, z: number) => number, kinds: THREE.Color[],
  time: { value: number }, roadWidth: (r: { c: string; w?: number }) => number, paths: Set<string>, kerbed: Set<string>, pavement: number,
  rail: number[][][] = []): Generator<void, Grass> {
  const T = D.t;
  const touch = navigator.maxTouchPoints > 1;
  const RADIUS = touch ? 26 : 42, CELL = 8, STEP = touch ? 0.62 : 0.5;   // STEP: spacing between tufts

  // ---- where grass may grow: a 1 m mask over the map, drawn with canvas paths ----------------
  const W = Math.ceil((T.nx - 1) * T.dx) + 1, H = Math.ceil((T.ny - 1) * T.dy) + 1;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  g.fillStyle = g.strokeStyle = "#fff";
  g.lineCap = g.lineJoin = "round";
  const X = (x: number) => x - T.x0, Y = (y: number) => y - T.y0;
  const fillRings = (rings: number[][][]) => {
    g.beginPath();
    for (const ring of rings) ring.forEach(([x, y], k) => (k ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
    g.fill("evenodd");
  };
  for (let k = 0; k < D.bl.length; k++) { fillRings(D.bl[k].r); if (k % 500 === 499) yield; }
  for (const w of D.wp) fillRings(w.r);
  for (const r of D.sp ?? []) fillRings([r]);         // nor under a set piece (landmarks/setpieces.ts)
  yield;
  const line = (p: number[][], width: number) => {
    g.lineWidth = width;
    g.beginPath();
    p.forEach(([x, y], k) => (k ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
    g.stroke();
  };
  let rdk = 0;
  for (const r of D.rd) { line(r.p, roadWidth(r) + (kerbed.has(r.c) ? 2 * Math.max(...(r.pv ?? [pavement])) + 0.6 : paths.has(r.c) ? 0.5 : 0.8)); if (++rdk % 300 === 299) yield; }
  for (const w of D.wl) line(w.p, 2.2);
  // nor through the top of the railway's ballast where the line runs on the ground (railway.ts):
  // its shoulders and bank grow grass like the ground beside them
  for (const p of rail) {
    let run: number[][] = [];
    for (let k = 0; k <= p.length; k++) {
      const q = p[k];
      if (q && q[3] !== 1 && q[3] !== 2) { run.push(q); continue; }
      if (run.length > 1) line(run, 3.4);
      run = q ? [q] : [];
    }
  }
  // none in a tunnel's mouth, where the ground is hidden (tunnels.ts)
  for (const t of D.tn ?? []) for (const [end, k] of [[t.p.slice(0, 6), 0], [t.p.slice(-6), t.p.length - 1]] as const) line(end, 2 * boreHalf(t, k) + 1);
  // nor on a square's street and path faces, kerbs and all: their outlines here, their insides below
  const faced = !!D.sf && (typeof location === "undefined" || new URLSearchParams(location.search).get("roads") !== "strips");
  if (faced) { const V = D.sf!.v; for (const e of D.sf!.e) line(Array.from(e.i, (i) => [V[3 * i], V[3 * i + 1]]), 0.8); }
  for (const s of D.fp ?? []) line([[s[0], s[1]], [s[2], s[3]]], 1.5);
  for (const s of D.dv ?? []) line([[s[0], s[1]], [s[2], s[3]]], 3.4);
  // cricket wickets are worn bare
  for (const p of D.pi ?? []) if (p[0] === "c") {
    const ux = Math.cos(p[3]) * 11, uy = Math.sin(p[3]) * 11;
    line([[p[1] - ux, p[2] - uy], [p[1] + ux, p[2] + uy]], 3);
  }
  yield;
  const px = g.getImageData(0, 0, W, H).data;
  const blocked = new Uint8Array(W * H);
  for (let k = 0; k < blocked.length; k++) { blocked[k] = px[k * 4] > 60 ? 1 : 0; if (k % 200000 === 199999) yield; }
  cv.width = cv.height = 1;   // let the browser free the big canvas
  yield;
  // The faces' triangles are marked straight into the mask: tens of thousands of them filled on the
  // canvas took longer than all the rest of the grass. A pixel counts as covered when its middle is
  // within a quarter of a metre of the triangle, about where the canvas's blend crossed the threshold.
  if (faced) {
    const V = D.sf!.v;
    let n = 0;
    for (const I of [D.sf!.road, D.sf!.service, D.sf!.pave, D.sf!.path, D.sf!.front, D.sf!.drive]) if (I) for (let k = 0; k + 2 < I.length; k += 3) {
      markTri(blocked, W, H, X(V[3 * I[k]]), Y(V[3 * I[k] + 1]), X(V[3 * I[k + 1]]), Y(V[3 * I[k + 1] + 1]), X(V[3 * I[k + 2]]), Y(V[3 * I[k + 2] + 1]));
      if (++n % 3000 === 0) yield;
    }
    yield;
  }
  const free = (x: number, y: number) => {
    const i = Math.round(X(x)), j = Math.round(Y(y));
    return i >= 0 && j >= 0 && i < W && j < H && !blocked[j * W + i];
  };

  // ---- the tufts --------------------------------------------------------------------------
  // per kind of ground: chance of a tuft, height in metres, and flowers (meadows)
  const KIND: Record<number, { p: number; h: number; flowers: number }> = {
    0: { p: 0.8, h: 0.24, flowers: 0.02 },   // gardens and verges
    1: { p: 0.95, h: 0.13, flowers: 0 },     // sports pitches: mown
    2: { p: 0.22, h: 0.3, flowers: 0 },      // woodland floor: sparse
    3: { p: 1, h: 0.42, flowers: 0.1 },      // farmland and meadow: long, with buttercups and daisies
    4: { p: 0.75, h: 0.22, flowers: 0.03 },  // cemetery
    7: { p: 0.3, h: 0.16, flowers: 0 },      // playgrounds
  };
  const base = tuftGeo();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const uPlayer = { value: new THREE.Vector3() };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uPlayer = uPlayer;
    shader.vertexShader = `uniform float uTime; uniform vec3 uPlayer; attribute float aHead; attribute float aFlower;\n` + shader.vertexShader
      .replace("#include <color_vertex>", `#include <color_vertex>
        if (aHead > 0.5) vColor = aFlower > 1.5 ? vec3(1.0, 1.0, 0.95) : vec3(1.0, 0.82, 0.12);`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec3 iPos = instanceMatrix[3].xyz;
        // shrink into the ground towards the edge of the circle, so there's no hard border
        float fade = 1.0 - smoothstep(${(RADIUS * 0.6).toFixed(1)}, ${(RADIUS - 2).toFixed(1)}, distance(iPos.xz, uPlayer.xz));
        transformed.y *= fade;
        // flower heads only on flowering tufts
        transformed *= 1.0 - aHead * step(aFlower, 0.5);
        float bend = position.y * position.y;
        float ph = uTime * 1.7 + iPos.x * 0.35 + iPos.z * 0.27;
        transformed.x += bend * (0.12 * sin(ph) + 0.05 * sin(ph * 2.9 + iPos.z));
        transformed.z += bend * (0.08 * cos(ph * 0.7) + 0.04 * sin(ph * 3.3 + iPos.x));`);
  };

  const CAP = Math.ceil((CELL / STEP) ** 2);
  interface Cell { i: number; j: number; mesh: THREE.InstancedMesh; flower: THREE.InstancedBufferAttribute }
  const cells = new Map<number, Cell>();
  const spare: Cell[] = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const colour = new THREE.Color();
  const key = (i: number, j: number) => (i + 10000) * 20000 + (j + 10000);

  const fill = (cell: Cell) => {
    const { i, j, mesh, flower } = cell;
    const n = Math.round(CELL / STEP);
    let count = 0;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const r1 = hash2(i * n + a, j * n + b, 1), r2 = hash2(i * n + a, j * n + b, 2), r3 = hash2(i * n + a, j * n + b, 3);
      const x = i * CELL + (a + r1) * STEP, z = j * CELL + (b + r2) * STEP, y = -z;
      // terrain kind at the nearest ground vertex
      const ti = Math.round((x - T.x0) / T.dx), tj = Math.round((y - T.y0) / T.dy);
      if (ti < 0 || tj < 0 || ti >= T.nx || tj >= T.ny) continue;
      const k = +T.k[tj * T.nx + ti], spec = KIND[k];
      if (!spec) continue;
      // patchy: thick in places, thin in others
      const patch = 0.55 + 0.45 * Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * Math.sin(z * 0.13 + x * 0.05);
      if (r3 > spec.p * patch + 0.12 || !free(x, y)) continue;
      const h = spec.h * (0.6 + 0.8 * hash2(i * n + a, j * n + b, 4)) * (0.75 + 0.5 * patch);
      const wd = 0.8 + hash2(i * n + a, j * n + b, 5) * 0.7;
      q.setFromAxisAngle(up, r1 * 6.28);
      m4.compose(ps.set(x, groundAt(x, z) - 0.02, z), q, sc.set(wd, h, wd));
      mesh.setMatrixAt(count, m4);
      const tint = 0.95 + 0.3 * hash2(i * n + a, j * n + b, 6);
      colour.copy(kinds[k] ?? kinds[0]).multiplyScalar(tint * 1.05);
      colour.g *= 1.04 + 0.08 * patch;
      mesh.setColorAt(count, colour);
      const fl = hash2(i * n + a, j * n + b, 7);
      flower.setX(count, fl < spec.flowers ? (fl < spec.flowers * 0.45 ? 2 : 1) : 0);
      count++;
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    flower.needsUpdate = true;
    mesh.computeBoundingSphere();
  };

  const make = (i: number, j: number): Cell => {
    const reuse = spare.pop();
    if (reuse) { reuse.i = i; reuse.j = j; reuse.mesh.visible = true; return reuse; }
    const geo = new THREE.BufferGeometry();
    for (const name of ["position", "color", "normal", "aHead"]) geo.setAttribute(name, base.getAttribute(name));
    const flower = new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1);
    geo.setAttribute("aFlower", flower);
    const mesh = new THREE.InstancedMesh(geo, mat, CAP);
    mesh.setColorAt(0, colour.set(1, 1, 1));
    mesh.receiveShadow = true;
    scene.add(mesh);
    return { i, j, mesh, flower };
  };

  let ci = NaN, cj = NaN;
  return {
    update(px, pz) {
      uPlayer.value.set(px, 0, pz);
      const i0 = Math.floor(px / CELL), j0 = Math.floor(pz / CELL);
      if (i0 === ci && j0 === cj) return;
      ci = i0; cj = j0;
      const reach = Math.ceil(RADIUS / CELL);
      // only over this map's own ground: each square of Bath grows its own
      const ours = (i: number, j: number) => (i + 1) * CELL > T.x0 && i * CELL < T.x0 + W && -j * CELL > T.y0 && -(j + 1) * CELL < T.y0 + H;
      const near = (i: number, j: number) => {
        if (!ours(i, j)) return false;
        // distance from the player's cell centre to the nearest point of cell (i, j)
        const cx = (i0 + 0.5) * CELL, cz = (j0 + 0.5) * CELL;
        const dx = Math.max(i * CELL - cx, 0, cx - (i + 1) * CELL), dz = Math.max(j * CELL - cz, 0, cz - (j + 1) * CELL);
        return Math.hypot(dx, dz) < RADIUS;
      };
      for (const [k, c] of cells) if (!near(c.i, c.j)) { cells.delete(k); c.mesh.visible = false; spare.push(c); }
      for (let i = i0 - reach - 1; i <= i0 + reach + 1; i++) for (let j = j0 - reach - 1; j <= j0 + reach + 1; j++) {
        if (!near(i, j) || cells.has(key(i, j))) continue;
        const c = make(i, j);
        fill(c);
        cells.set(key(i, j), c);
      }
    },
  };
}
