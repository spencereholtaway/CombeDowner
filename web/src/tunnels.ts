// Tunnels you can walk through (tools/tunnels.py): a tube along each tunnel's floor, as wide as the
// road or path going in (boreHalf) and as high as what goes through it needs (boreCrown), with its
// pavements carried through where it has them, lit by lamps along the top, with a headwall round
// the openings at each portal. A tunnel cars drive through is a modern concrete box: square
// openings under a flat lintel, a pier between bores side by side, concrete wing walls. A railway's,
// a canal's or a path's (often an old railway's) is Victorian: a brick arch in a Bath stone face. The ground over
// a tunnel is the hill's, whole; the terrain inside the tube's mouth is hidden (world.ts asks
// mouths() where), so you can see in from the cutting, and further in the hill is over your head.
// The two bores of a dual carriageway coming out side by side share one headwall, square to them.
// Where the hill beside the cutting stands high, a wing wall holds it up, and the ground between
// the wing walls is dug to the floor (world.ts, from cuttings()). A tunnel cut at its square's edge,
// deep under the hill, has no portal there. A path's low arch just under a street has a face only
// up to the street, and no wing walls or dug cutting: the map lays the steps or ramp down to it. A
// lane that comes out of a building's passage has no headwall there: the building's wall is its face.
//
// ?portal=a or ?portal=b in the address draws tunnels the other way, to compare by eye (portalStyle).
//
// The light inside is painted on: each vertex is as bright as its nearest lamp makes it, so it
// costs nothing at run time, and the tube ignores the sun. world.ts turns the fog dark while
// you're in one. Nothing here goes over the network: every player draws the same from the map.
import * as THREE from "three";
import { GameMap, TUNNEL, Tunnel, boreCrown, boreHalf, carriesTraffic, floorLift } from "./map";
import * as TX from "./textures";

const LAMP = 14;         // metres between lamps
const STEP = 1.5;        // metres between rings of the tube
const CHUNK = 60;        // rings per mesh, so the far parts are skipped when out of view
const FACE_DEPTH = 1.0;  // how thick the portal's stone face is
/** How far into the tube the terrain is hidden, from each portal. */
const MOUTH = 40;
/** How far the opening in a face stands clear of the lining all round: flush, the two fought to be
 *  drawn, and the face's reveal showed through the brick in stripes. */
const HOLE = 0.04;
/** a: Bath stone, arched; b: a concrete box. */
export type PortalStyle = "a" | "b";

/** The tube's cross-section from one wall's foot over the top to the other's, [across, up], for a
 *  bore `half` wide each side and `crown` high, grown by e all round: an arch, or a box. The arch
 *  springs no lower than leaves its rise under half the height, so a low wide bore is a flattish
 *  arch on short walls rather than a semicircle on none. */
function profile(box: boolean, half: number, crown: number, e = 0): number[][] {
  const H = half + e, wall = archSpring(half, crown);
  if (box) {
    const out = [[H, 0], [H, wall * 0.5], [H, wall]], top = crown + e;
    for (let k = 0; k <= 10; k++) out.push([H - (2 * H * k) / 10, top]);
    out.push([-H, wall], [-H, wall * 0.5], [-H, 0]);
    return out;
  }
  const b = crown + e - wall, out = [[H, 0], [H, wall * 0.5]];
  for (let k = 0; k <= 10; k++) { const t = (k / 10) * Math.PI; out.push([H * Math.cos(t), wall + b * Math.sin(t)]); }
  out.push([-H, wall * 0.5], [-H, 0]);
  return out;
}

/** Where an arched bore's walls stop and its arch begins, above the floor. */
export function archSpring(half: number, crown: number) { return crown - Math.min(half, crown * 0.45); }

/** How high the bore's lining is over the floor at `across` from its middle: the arch, or a box's flat top. */
export function boreHeight(box: boolean, half: number, crown: number, across: number) {
  if (box) return crown;
  const spring = archSpring(half, crown), u = Math.min(1, Math.abs(across) / half);
  return spring + (crown - spring) * Math.sqrt(1 - u * u);
}

/** Points every STEP metres along a tunnel's floor (data coords [x, y, z]), with distance along, the
 *  sideways unit normal, half the bore's width and the pavement each side. */
function resample(t: Tunnel) {
  const p = t.p, pv = (i: number) => t.pv?.[i] ?? 0;
  const pts: { x: number; y: number; z: number; s: number; nx: number; ny: number; h: number; pv: number }[] = [];
  let s = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(l / STEP));
    const h0 = boreHalf(t, i), h1 = boreHalf(t, i + 1);
    for (let k = 0; k < n; k++) {
      const f = k / n;
      pts.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, z: a[2] + (b[2] - a[2]) * f, s: s + l * f, nx: 0, ny: 0,
        h: h0 + (h1 - h0) * f, pv: pv(i) + (pv(i + 1) - pv(i)) * f });
    }
    s += l;
  }
  const e = p[p.length - 1];
  pts.push({ x: e[0], y: e[1], z: e[2], s, nx: 0, ny: 0, h: boreHalf(t, p.length - 1), pv: pv(p.length - 1) });
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    pts[i].nx = -(b.y - a.y) / l; pts[i].ny = (b.x - a.x) / l;
  }
  return pts;
}

/** Light from the lamps at distance s along and height h above the floor, across o from the middle. */
function light(s: number, h: number, o: number, len: number, crown: number) {
  const n = Math.max(1, Math.round(len / LAMP)), gap = len / n;
  const k = Math.round((s - gap / 2) / gap), along = s - (k * gap + gap / 2);
  const d2 = along * along + (crown - 0.2 - h) ** 2 + o * o;
  return 0.035 + 0.9 * Math.exp(-d2 / 10);
}

/** Metres apart that two bores' portals share one headwall (read when called: map.ts imports this module). */
const sideBySide = (a: Portal, b: Portal) => a.h + b.h + 2 * TUNNEL.past + 4;

/** h: half the bore's width there. */
interface Portal { t: Tunnel; end: 0 | 1; x: number; y: number; z: number; dx: number; dy: number; h: number }
type Bounds = number[] | undefined;

/** A tunnel crossing into the next square is cut at the square's edge, deep under the hill: that end
 *  is no portal. b: the square's [west, south, east, north]. */
function onSeam(x: number, y: number, b: Bounds) {
  return !!b && Math.min(Math.abs(x - b[0]), Math.abs(y - b[1]), Math.abs(x - b[2]), Math.abs(y - b[3])) < 0.5;
}

/** Every portal, each with the tunnel it opens and which end. An end coming out of a building's wall
 *  has none: the building is its face. */
function allPortals(tn: Tunnel[], b: Bounds): Portal[] {
  const out: Portal[] = [];
  for (const t of tn) if (t.p.length > 1) portals(t).forEach((m, e) => { if (!onSeam(m.x, m.y, b) && !t.bw?.[e]) out.push({ t, end: e as 0 | 1, ...m }); });
  return out;
}

/** The portals that open side by side, facing the same way, in groups (a lone portal is a group of one). */
function headwalls(tn: Tunnel[], b: Bounds): Portal[][] {
  const ps = allPortals(tn, b), group = ps.map((_, i) => i);
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i])));
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j];
    if (a.t === b.t || a.dx * b.dx + a.dy * b.dy < 0.9) continue;
    const ox = b.x - a.x, oy = b.y - a.y;
    if (Math.hypot(ox, oy) < sideBySide(a, b) && Math.abs(ox * a.dx + oy * a.dy) < 8) group[root(j)] = root(i);
  }
  const out = new Map<number, Portal[]>();
  ps.forEach((p, i) => { const r = root(i); if (!out.has(r)) out.set(r, []); out.get(r)!.push(p); });
  return [...out.values()];
}

/** Bores coming out side by side are run out to the same line, square to them, so one headwall
 *  closes both: each one that stops short is carried on, level, to the outermost. Run before
 *  anything reads the tunnels; running it again changes nothing. */
export function alignPortals(tn: Tunnel[], b?: Bounds) {
  for (const g of headwalls(tn, b)) {
    if (g.length < 2) continue;
    let nx = 0, ny = 0;
    for (const m of g) { nx += m.dx; ny += m.dy; }
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const out = Math.min(...g.map((m) => m.x * nx + m.y * ny));
    for (const m of g) {
      const by = (m.x * nx + m.y * ny - out) / Math.max(0.5, m.dx * nx + m.dy * ny);
      if (by < 0.05) continue;
      const q = [m.x - m.dx * by, m.y - m.dy * by, m.z], t = m.t;
      // (the bore's width carried out with it)
      if (m.end === 0) { t.p.unshift(q); t.hw?.unshift(t.hw[0]); t.pv?.unshift(t.pv[0]); }
      else { t.p.push(q); t.hw?.push(t.hw[t.hw.length - 1]); t.pv?.push(t.pv[t.pv.length - 1]); }
    }
  }
}

/** The solid parts of each headwall, for collision, as [x0, y0, x1, y1, top] (data coords): out
 *  past the outer bores, and the piers between bores side by side. A face reaching TUNNEL.past
 *  past each bore's own sides would stand across the mouth of the bore beside it. */
export function portalFaces(tn: Tunnel[], b?: Bounds): number[][] {
  const out: number[][] = [];
  for (const g of headwalls(tn, b)) {
    let dx = 0, dy = 0;
    for (const m of g) { dx += m.dx; dy += m.dy; }
    const l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, o = g[0], at0 = o.x * nx + o.y * ny;
    const open = g.map((m) => { const s = m.x * nx + m.y * ny - at0; return [s - m.h, s + m.h]; }).sort((p, q) => p[0] - q[0]);
    const crown = Math.max(...g.map((m) => boreCrown(m.t)));
    // (a low arch's face stops under the street over it, which is walked on)
    const top = Math.max(...g.map((m) => m.z + boreCrown(m.t))) + (crown < LOW_ARCH ? 0.2 : 1.5);
    const solid = [[open[0][0] - TUNNEL.past, open[0][0]]];
    let reach = open[0][1];
    for (const [s0, s1] of open.slice(1)) { if (s0 > reach) solid.push([reach, s0]); reach = Math.max(reach, s1); }
    solid.push([reach, reach + TUNNEL.past]);
    for (const [s0, s1] of solid) out.push([o.x + nx * s0, o.y + ny * s0, o.x + nx * s1, o.y + ny * s1, top]);
  }
  return out;
}

/** Where each portal is and which way the tunnel goes in from it, data coords. */
function portals(t: Tunnel) {
  const p = t.p, out: { x: number; y: number; z: number; dx: number; dy: number; h: number }[] = [];
  for (const [a, b, h] of [[p[0], p[1], boreHalf(t, 0)], [p[p.length - 1], p[p.length - 2], boreHalf(t, p.length - 1)]] as const) {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    out.push({ x: a[0], y: a[1], z: a[2], dx: (b[0] - a[0]) / l, dy: (b[1] - a[1]) / l, h });
  }
  return out;
}

/** The style each tunnel's portals are drawn in: concrete where cars go through, Bath stone
 *  otherwise. The address can ask for the other, to compare by eye: ?portal=b,east,north draws the
 *  tunnel nearest that spot (and the other bores of its name close by) in style b, and ?portal=b
 *  alone draws every tunnel so. */
const styled = new WeakMap<Tunnel[], Map<Tunnel, PortalStyle>>();
export function portalStyle(tn: Tunnel[], t: Tunnel): PortalStyle {
  let got = styled.get(tn);
  if (!got) {
    styled.set(tn, got = new Map());
    const q = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("portal");
    const [s, ex, ny] = (q ?? "").split(",");
    if (s === "a" || s === "b") {
      const at = ex !== undefined && ny !== undefined ? [+ex, +ny] : null;
      const near = (u: Tunnel) => at ? Math.min(...u.p.map((p) => Math.hypot(p[0] - at[0], p[1] - at[1]))) : 0;
      const best = tn.reduce<Tunnel | null>((b, u) => (!b || near(u) < near(b) ? u : b), null);
      for (const u of tn) if (best && u.n === best.n && near(u) < 300) got.set(u, s);
    }
  }
  return got.get(t) ?? (carriesTraffic(t) ? "b" : "a");
}

/** Metres over a mouth's floor that the terrain shader (world.ts) still draws the ground. Inside the
 *  tube its mouths are given from that much under the floor's line, or the ground's coarse grid,
 *  sloping up through the floor, showed across it in dark slivers. */
const KEPT = 0.1;
/** Metres in front of a mouth's start that the terrain shader begins to hide the ground. */
const LIP = 0.3;

/** The tube's mouths, for the terrain shader: (x, z, into x, into z) and (floor, top, half width, depth), scene coords. */
export function mouths(map: GameMap): { a: THREE.Vector4[]; b: THREE.Vector4[] } {
  const a: THREE.Vector4[] = [], b: THREE.Vector4[] = [];
  alignPortals(map.d.tn ?? [], map.d.b);
  // (piece by piece along the tube, which bends: a straight cut from the portal left the hillside
  // standing in the tube a few metres round a bend; and no further than its far portal; each piece
  // to the top of its higher end, as the floor climbs along it, or a sliver of hill shows in the crown)
  for (const t of map.d.tn ?? []) for (const back of [false, true]) {
    const p = back ? [...t.p].reverse() : t.p, half = (i: number) => boreHalf(t, back ? p.length - 1 - i : i);
    if (p.length < 2 || onSeam(p[0][0], p[0][1], map.d.b)) continue;
    for (let i = 0, s = 0; i < p.length - 1 && s < MOUTH; i++) {
      const l = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
      if (l < 1e-3) continue;
      const dx = (p[i + 1][0] - p[i][0]) / l, dy = (p[i + 1][1] - p[i][1]) / l;
      const lo = Math.min(p[i][2], p[i + 1][2]) - map.z0, roof = boreCrown(t) + Math.abs(p[i + 1][2] - p[i][2]) + 0.05, h = Math.max(half(i), half(i + 1));
      // (just outside the portal there's no floor, and the ground at its level stays to meet the way
      // laid up to it, or the sky showed under that way's edge)
      if (i === 0) {
        a.push(new THREE.Vector4(p[i][0], -p[i][1], dx, -dy));
        b.push(new THREE.Vector4(lo, roof, h, 0.3));
      }
      a.push(new THREE.Vector4(p[i][0] + dx * LIP, -(p[i][1] + dy * LIP), dx, -dy));
      b.push(new THREE.Vector4(lo - KEPT, roof + KEPT, h, i < p.length - 2 ? l : l - LIP));
      s += l;
    }
  }
  // and none of the hill's slope standing in the cutting in front of a headwall, out to the end of
  // its floor, where the apron is the ground (the ground's grid is too coarse to rise straight up the
  // wall); but the ground at about the floor's level stays, where a way crosses in front at grade:
  // the sheet meets that way's edges there, and cut away it left a hole down past the apron's side
  for (const w of walls(map)) {
    const c = (w.left + w.right) / 2, o = w.reach - 0.3, x = w.cx + w.nx * c - w.dx * o, y = w.cy + w.ny * c - w.dy * o;
    a.push(new THREE.Vector4(x, -y, w.dx, -w.dy));
    b.push(new THREE.Vector4(w.z - map.z0 + AT_GRADE, 60, (w.right - w.left) / 2, o + 0.3));
  }
  return { a, b };
}

let brickTex: THREE.Texture | null = null, groundTex: THREE.Texture | null = null;
const STONE = "#cdbb93", CONCRETE = "#b4b1a9", GRASS = "#6e7f4c";

/** The ground's own colour at data (x, y), as the terrain is drawn there. */
export type Tint = (x: number, y: number) => THREE.Color;

/** Triangles gathered for one mesh, in scene coords, with the ground's texture laid on them from
 *  above, coloured as the ground under them is (tint) so the cutting's floor doesn't show as a
 *  patch of other grass where it and the ground meet. */
class Sheet {
  pos: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  constructor(private tint?: Tint) {}
  quad(a: number[], b: number[], c: number[], d: number[]) {
    const k = this.pos.length / 3;
    for (const q of [a, b, c, d]) {
      this.pos.push(q[0], q[1], q[2]); this.uv.push(q[0] / 7, q[2] / 7 + q[1] / 7);
      if (this.tint) { const t = this.tint(q[0], -q[2]); this.col.push(t.r, t.g, t.b); }
    }
    this.idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  mesh(mat: THREE.Material) {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col.length) g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    return m;
  }
}

/** drawn: the ground's height as it's drawn at data (x, y), scene Y, so what's laid round a portal
 *  meets it with no gap. */
export function buildTunnels(map: GameMap, scene: THREE.Object3D, drawn: (x: number, y: number) => number = (x, y) => map.trueGround(x, -y), tint?: Tint) {
  const tunnels = map.d.tn ?? [];
  if (!tunnels.length) return;
  alignPortals(tunnels, map.d.b);
  const Z0 = map.z0;
  brickTex ??= Object.assign(TX.wall("brick", false), { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
  groundTex ??= TX.groundDetail();
  // (the lining is seen from inside; from outside, where the hill over it is thinner than the tube
  // is tall, it's the grass of a bank, not brick lying on the hill)
  const tubeMat = new THREE.MeshBasicMaterial({ map: brickTex, vertexColors: true, side: THREE.FrontSide });
  const boxMat = new THREE.MeshBasicMaterial({ color: CONCRETE, vertexColors: true, side: THREE.FrontSide });
  const skinMat = new THREE.MeshLambertMaterial({ color: GRASS, map: groundTex, side: THREE.BackSide });
  const floorMat = new THREE.MeshBasicMaterial({ map: TX.asphalt(), vertexColors: true, side: THREE.DoubleSide });
  const lampGeo = new THREE.BoxGeometry(0.5, 0.12, 0.3);
  const lampMat = new THREE.MeshBasicMaterial({ color: "#ffe2a0" });

  for (const t of tunnels) {
    const box = portalStyle(tunnels, t) === "b", crown = boreCrown(t);
    const pts = resample(t), len = pts[pts.length - 1].s;
    const P = profile(box, TUNNEL.half, crown).length;
    for (let c0 = 0; c0 < pts.length - 1; c0 += CHUNK) {
      const ring = pts.slice(c0, Math.min(pts.length, c0 + CHUNK + 1));
      const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
      const fpos: number[] = [], fuv: number[] = [], fcol: number[] = [], fidx: number[] = [];
      for (const q of ring) {
        const prof = profile(box, q.h, crown);
        let round = 0;
        prof.forEach(([o, h], k) => {
          if (k) round += Math.hypot(o - prof[k - 1][0], h - prof[k - 1][1]);
          pos.push(q.x + q.nx * o, q.z - Z0 + h, -(q.y + q.ny * o));
          uv.push(q.s / 3.4, round / 3.4);
          const l = light(q.s, h, o, len, crown);
          col.push(l, l * 0.93, l * 0.82);
        });
        // (out of a building's wall the floor runs on under the way laid up to it, so no seam shows between them)
        const on = q === pts[0] && t.bw?.[0] ? -RUN_ON : q === pts[pts.length - 1] && t.bw?.[1] ? RUN_ON : 0;
        const fx = q.x + q.ny * on, fy = q.y - q.nx * on;
        for (const [o, h] of floorAcross(t, q)) {
          fpos.push(fx + q.nx * o, q.z - Z0 + h, -(fy + q.ny * o));
          fuv.push(o / 4, q.s / 4 + h);
          const l = light(q.s, 0, o, len, crown);
          fcol.push(l, l * 0.93, l * 0.82);
        }
      }
      const F = t.pv ? 6 : 2;
      for (let i = 0; i < ring.length - 1; i++) {
        for (let k = 0; k < P - 1; k++) { const a = i * P + k, b = a + P; idx.push(a, b, a + 1, a + 1, b, b + 1); }
        for (let k = 0; k < F - 1; k++) { const a = i * F + k, b = a + F; fidx.push(a, b, a + 1, a + 1, b, b + 1); }
      }
      for (const [p, u, c, ix, mats] of [[pos, uv, col, idx, [box ? boxMat : tubeMat, skinMat]], [fpos, fuv, fcol, fidx, [floorMat]]] as const) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(p as number[], 3));
        g.setAttribute("uv", new THREE.Float32BufferAttribute(u as number[], 2));
        g.setAttribute("color", new THREE.Float32BufferAttribute(c as number[], 3));
        g.setIndex(ix as number[]);
        g.computeVertexNormals();
        for (const m of mats) scene.add(new THREE.Mesh(g, m as THREE.Material));
      }
    }
    // lamps along the crown
    const n = Math.max(1, Math.round(len / LAMP)), gap = len / n;
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, n), m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let k = 0, j = 0; k < n; k++) {
      const s = k * gap + gap / 2;
      while (j < pts.length - 2 && pts[j + 1].s < s) j++;
      const a = pts[j], b = pts[j + 1], f = (s - a.s) / ((b.s - a.s) || 1);
      const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, z = a.z + (b.z - a.z) * f;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(a.ny, a.nx));
      lamps.setMatrixAt(k, m.compose(new THREE.Vector3(x, z - Z0 + crown - 0.12, -y), q, new THREE.Vector3(1, 1, 1)));
    }
    lamps.computeBoundingSphere();
    scene.add(lamps);
  }
  const mat = (color: string, map?: THREE.Texture) => new THREE.MeshLambertMaterial({ color, map: map ?? null, side: THREE.DoubleSide });
  const stone = mat(STONE), concrete = mat(CONCRETE);
  const apronGrass = tint ? new THREE.MeshLambertMaterial({ vertexColors: true, map: groundTex, side: THREE.DoubleSide }) : mat("#647347");
  for (const w of walls(map)) buildPortal(w, scene, Z0, drawn, { stone, concrete, apronGrass }, tint);
}

const RUN_ON = 0.3;      // metres the floor runs on past a mouth in a building's wall
const KERB = 0.15;       // a pavement's height over the carriageway, through the tunnel as outside it

/** Across the tube's floor at one ring, [across, up] from its left wall to its right: the
 *  carriageway, and up a kerb to a pavement each side where the bore has them. */
function floorAcross(t: Tunnel, q: { h: number; pv: number }): number[][] {
  const f = floorLift(t);
  if (!t.pv) return [[q.h, f], [-q.h, f]];
  const c = Math.max(0, q.h - q.pv), k = q.pv > 0.05 ? KERB + f - 0.02 : f;
  return [[q.h, k], [c, k], [c, f], [-c, f], [-c, k], [-q.h, k]];
}

interface Mats { stone: THREE.Material; concrete: THREE.Material; apronGrass: THREE.Material }

/** One headwall's portal in its style: the face, what lines the cutting in front, and the cutting's floor. */
function buildPortal(w: Headwall, scene: THREE.Object3D, Z0: number, drawn: (x: number, y: number) => number, M: Mats, tint?: Tint) {
  const { g, dx, dy, nx, ny, cx, cy, z, at, mid, left, right, top, style } = w;
  const box = style === "b";
  /** scene coords of the spot s across (to the tunnel's left), out metres out from the face, at data height h */
  const P = (s: number, out: number, h: number) => [cx + nx * s - dx * out, h - Z0, -(cy + ny * s - dy * out)];
  const ground = (s: number, out: number) => drawn(cx + nx * s - dx * out, cy + ny * s - dy * out) + Z0;
  const add = (m: THREE.Mesh | null) => { if (m) { m.castShadow = true; scene.add(m); } };
  // the face's own frame: local +z goes into the tunnel, local +x is the tunnel's left, matching the profile
  const place = (o: THREE.Object3D) => { o.position.set(cx, z - Z0, -cy); o.rotation.y = Math.atan2(dx, -dy); return o; };
  // (a bore climbing, or slanting, through the face's thickness needs its opening that much bigger,
  // or the back edge of the opening shows inside the lining)
  const opening = (e: number, foot = -0.5) => g.map((m, k) => {
    const off = at[k] - mid, lift = m.z - z, p = m.end === 0 ? m.t.p : [...m.t.p].reverse();
    let rise = 0;
    for (let i = 1, s = 0; i < p.length && s < FACE_DEPTH + 0.5; i++) {
      s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      rise = Math.max(rise, ((p[i][2] - m.z) * Math.min(1, (FACE_DEPTH + 0.1) / (s || 1))));
    }
    const skew = Math.abs(m.dx * dy - m.dy * dx) * FACE_DEPTH;
    return new THREE.Path(profile(box, m.h, boreCrown(m.t), e + skew).map(([u, h]) => new THREE.Vector2(off + u, lift + (h === 0 ? foot : h + rise))));
  });
  const slabMesh = (outline: number[][], holes: THREE.Path[], depth: number, m: THREE.Material, from = 0) => {
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    shape.holes.push(...holes);
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).translate(0, 0, from), m);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  };
  const crown = Math.max(...g.map((m) => m.z - z + boreCrown(m.t))) + HOLE;
  const sideL = Math.min(...g.map((m, k) => at[k] - m.h)) - mid - HOLE, sideR = Math.max(...g.map((m, k) => at[k] + m.h)) - mid + HOLE;

  const m = style === "a" ? M.stone : M.concrete;
  const face = place(slabMesh([[left, -1], [right, -1], [right, top], [left, top]], opening(HOLE), FACE_DEPTH, m));
  scene.add(face);
  // a coping along the top; a concrete one is a plain band, flush at the front
  const cope = style === "a" ? new THREE.BoxGeometry(right - left + 0.4, 0.35, FACE_DEPTH + 0.3) : new THREE.BoxGeometry(right - left, 0.25, FACE_DEPTH + 0.15);
  const cm = new THREE.Mesh(cope, m);
  cm.position.set((left + right) / 2, top + (style === "a" ? 0.17 : 0.12), FACE_DEPTH / 2 + (style === "a" ? 0 : -0.07));
  face.add(cm);
  // a concrete box's openings share one flat lintel beam, a little proud of the face
  if (style === "b") {
    const lb = new THREE.Mesh(new THREE.BoxGeometry(sideR - sideL + 0.8, 0.6, 0.2), M.concrete);
    lb.position.set((sideL + sideR) / 2, crown + 0.3, -0.1);
    face.add(lb);
  }

  // what lines the cutting's sides
  for (const [end, side, r] of [[left, -1, w.wings[0]], [right, 1, w.wings[1]]] as const) {
    if (r.length < 2) continue;
    const tp = r.map(([o, h]) => new THREE.Vector2(o, h - z));
    const pts = [new THREE.Vector2(0, -1), ...tp, new THREE.Vector2(r[r.length - 1][0], -1)];
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: WING_THICK, bevelEnabled: false });
    // a coping along its top, a little proud of the wall each side, as the headwall has (a concrete one flush)
    const proud = style === "a" ? 0.15 : 0;
    const cap = new THREE.ExtrudeGeometry(new THREE.Shape([...tp.map((q) => new THREE.Vector2(q.x, q.y + (style === "a" ? COPING : 0.2))), ...[...tp].reverse()]),
      { depth: WING_THICK + 2 * proud, bevelEnabled: false }).translate(0, 0, -proud);
    // local x out of the tunnel along the cutting, y up, z across to the tunnel's left
    const s0 = side < 0 ? end - WING_THICK : end;
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(-dx, 0, dy), new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, -ny))
      .setPosition(cx + nx * s0, z - Z0, -(cy + ny * s0));
    for (const gg of [geo, cap]) {
      gg.applyMatrix4(basis);
      const wing = new THREE.Mesh(gg, m);
      wing.castShadow = wing.receiveShadow = true;
      scene.add(wing);
    }
  }

  // the cutting's floor in front of the face, just under the road on it, and where the ground beside
  // or beyond it stands higher than the floor, a bank face up to it, so there's no gap to see through
  const floor = new Sheet(tint), cols = Math.max(1, Math.ceil(right - left)), rows = Math.max(1, Math.ceil(w.reach));
  const fh: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const o = (w.reach * r) / rows;
    // (never under the dug ground it lies on, or that shows through it in patches)
    fh.push(Math.min(z - 0.03, ground((left + right) / 2, o) + 0.02));
  }
  for (let r = 0; r < rows; r++) {
    const o0 = (w.reach * r) / rows, o1 = (w.reach * (r + 1)) / rows;
    for (let c = 0; c < cols; c++) {
      const s0 = left + ((right - left) * c) / cols, s1 = left + ((right - left) * (c + 1)) / cols;
      floor.quad(P(s0, o0, fh[r]), P(s1, o0, fh[r]), P(s1, o1, fh[r + 1]), P(s0, o1, fh[r + 1]));
    }
  }
  // (the ground just past the end, as the floor's own height runs up to it)
  const bank = new Sheet(tint), up = (s: number, o: number, h: number) => Math.max(h, ground(s, o >= w.reach ? o + 0.02 : o));
  for (let c = 0; c < cols; c++) {
    const s0 = left + ((right - left) * c) / cols, s1 = left + ((right - left) * (c + 1)) / cols, o = w.reach, h = fh[rows];
    bank.quad(P(s0, o, h), P(s1, o, h), P(s1, o, up(s1, o, h)), P(s0, o, up(s0, o, h)));
  }
  // (each side's from behind the face's front and down past the floor's edge: stopping flush with
  // them left a slit at the corner that the sky showed through as a pale line)
  for (const s of [left - 0.05, right + 0.05]) for (let r = -1; r < rows; r++) {
    const o0 = r < 0 ? -FACE_DEPTH : (w.reach * r) / rows, o1 = (w.reach * (r + 1)) / rows, f0 = fh[Math.max(0, r)];
    bank.quad(P(s, o0, f0 - 0.3), P(s, o1, fh[r + 1] - 0.3), P(s, o1, up(s, o1, fh[r + 1])), P(s, o0, up(s, o0, f0)));
  }
  add(floor.mesh(M.apronGrass));
  add(bank.mesh(M.apronGrass));
}

const WING = 12;         // metres out along the cutting a wing wall may run
const WING_THICK = 0.6;
const COPING = 0.3;
/** The least a cutting is dug out in front of its face: over a grid square of the ground, which
 *  is made up behind the headwall, or a ramp of it came down from there onto the floor in front. */
const REACH = 6;
/** A bore lower than this, floor to crown, is a path's low arch just under a street: its face comes
 *  up only to the street, with no wing walls, as the steps down to it are laid by the map. */
export const LOW_ARCH = 2.0;
const MIN_PAST = 1.8;    // metres of face each side of the openings however low the hill beside, so it reads as a headwall, not a pair of jambs
const HIGH = 1.0;        // metres over the floor the hill beside the cutting must stand to want a wall
/** Metres over the floor in front of a headwall that the ground is still drawn: a way crossing there at grade. */
const AT_GRADE = HIGH + 0.5;
const BANK = 6;          // metres back from a wing wall that a steep bank behind it counts
const RAKE = 1.0;        // the fall over each metre of the raked end of a wall holding a steep bank
export const REPOSE = 0.7;      // the slope a grassed bank lies at by itself: anything steeper is held up by a wall

interface Headwall {
  g: Portal[]; dx: number; dy: number; nx: number; ny: number; cx: number; cy: number; z: number;
  at: number[]; mid: number; left: number; right: number; top: number;
  /** floor to the top of the highest of its bores */
  crown: number;
  /** each side's wing wall, left then right: [metres out from the face, top's height (data)] */
  wings: [number[][], number[][]];
  /** whether each side's wall holds a steep bank standing back from it, with a dug strip between */
  steep: [boolean, boolean];
  /** how far out in front of the face the cutting is dug to the floor */
  reach: number;
  style: PortalStyle;
}

/** Each headwall's place and size: across the arches of its portals, but only as far each way as
 *  the hill stands over them (a wall reaching out over low ground beside the cutting is a bare panel),
 *  and up to above the hill over them; and the wing walls along the cutting in front, as far out as
 *  the hill beside it stands over the road. Ground is the survey's (trueGround), not as drawn. */
function walls(map: GameMap): Headwall[] {
  const out: Headwall[] = [], Z0 = map.z0, ground = (x: number, y: number) => map.trueGround(x, -y) + Z0, tn = map.d.tn ?? [];
  for (const g of headwalls(tn, map.d.b)) {
    let dx = 0, dy = 0;
    for (const m of g) { dx += m.dx; dy += m.dy; }
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const nx = -dy, ny = dx, F = TUNNEL.past;
    const at = g.map((m) => m.x * nx + m.y * ny), mid = (Math.min(...at) + Math.max(...at)) / 2;
    const o = g[0], cx = o.x + nx * (mid - at[0]), cy = o.y + ny * (mid - at[0]), z = Math.min(...g.map((m) => m.z));
    const crown = Math.max(...g.map((m) => boreCrown(m.t)));
    const behind = (s: number) => ground(cx + nx * s + dx * (FACE_DEPTH + 1), cy + ny * s + dy * (FACE_DEPTH + 1)) - z;
    const sideL = Math.min(...g.map((m, k) => at[k] - m.h)) - mid, sideR = Math.max(...g.map((m, k) => at[k] + m.h)) - mid;
    let left = sideL - F, right = sideR + F;
    const leftMost = sideL - MIN_PAST, rightMost = sideR + MIN_PAST;
    while (left < leftMost && behind(left) < crown * 0.6) left = Math.min(leftMost, left + 0.5);
    while (right > rightMost && behind(right) < crown * 0.6) right = Math.max(rightMost, right - 0.5);
    let top = Math.max(...g.map((m) => m.z + boreCrown(m.t))) - z + 1.2;
    for (let s = left; s <= right; s += 1) for (const d of [0, FACE_DEPTH]) top = Math.max(top, ground(cx + nx * s + dx * d, cy + ny * s + dy * d) - z + 0.4);
    top = Math.min(top, 16);
    // The wall's top runs in straight slopes over the bank it holds, never below it: the survey's
    // every metre gave a lumpy top, a step for each bump in the bank.
    const bank = (s: number, side: number, k: number, o: number) => ground(cx + nx * (s + side * o) - dx * k, cy + ny * (s + side * o) - dy * k) - z;
    // (where the cutting is dug so wide that there's no bank just off the face, but one rises steeply
    // beyond, the wall holds that: what stands over a slope the bank could lie at, within BANK)
    const held = (s: number, side: number, k: number, steep: boolean) => {
      let h = bank(s, side, k, 1.5);
      if (steep) for (let o = 2.5; o <= 1.5 + BANK; o += 1) h = Math.max(h, bank(s, side, k, o) - (o - 1.5) * REPOSE);
      return h;
    };
    const wing = (s: number, side: number) => {
      const run: number[][] = [], steep = bank(s, side, 0, 1.5) < HIGH;
      let low = false;
      for (let k = 0; k <= WING && !low; k++) {
        const h = held(s, side, k, steep);
        low = h < HIGH;
        if (low && !steep) { if (run.length) run.push([k, HIGH * 0.5]); }
        else if (!low) run.push([k, Math.min(top, Math.max(HIGH, h + 0.3))]);
      }
      // (one holding up a steep bank is raked down at its end to the cutting's side, as the bank
      // would lie, not left a tall square end)
      if (steep && run.length) { const [k, h] = run[run.length - 1]; run.push([k + (h - HIGH * 0.5) / RAKE, HIGH * 0.5]); }
      // (one still holding up a high bank where it may run no further comes down into the side of the
      // cutting there, not to a tall square end standing out over it)
      else if (!low && run.length) {
        const k = WING + 3, x = cx + nx * s - dx * k, y = cy + ny * s - dy * k;
        run.push([k, Math.max(HIGH * 0.5, Math.min(run[run.length - 1][1], ground(x, y) - z))]);
      }
      return upperHull(run).map(([k, h]) => [k, z + h]);
    };
    const wings: [number[][], number[][]] = [wing(left, -1), wing(right, 1)];
    const steep: [boolean, boolean] = [bank(left, -1, 0, 1.5) < HIGH, bank(right, 1, 0, 1.5) < HIGH];
    const reach = Math.max(REACH, ...wings.map((w) => (w.length ? w[w.length - 1][0] : 0)));
    if (crown < LOW_ARCH) {
      // (its coping just under the street's top, which runs on over it: a wall up to the arch's usual
      // height stood across the pavement and out into the road)
      let street = crown;
      for (let s = sideL - F; s <= sideR + F; s += 1) street = Math.max(street, behind(s));
      out.push({ g, dx, dy, nx, ny, cx, cy, z, at, mid, left: sideL - F, right: sideR + F, top: street - COPING - 0.15,
        wings: [[], []], steep: [false, false], reach: 0, style: portalStyle(tn, g[0].t), crown });
      continue;
    }
    out.push({ g, dx, dy, nx, ny, cx, cy, z, at, mid, left, right, top, wings, steep, reach, style: portalStyle(tn, g[0].t), crown });
  }
  return out;
}

/** The cuttings in front of the headwalls, for the ground (world.ts): dug down to the floor between
 *  the wing walls, out as far as they run, so no slope of hillside stands in front of the arches.
 *  wings: each side's wing wall, left then right, as [metres out from the face, top's height (data)],
 *  and steep, whether it holds a steep bank standing back from it. */
export interface Cutting {
  cx: number; cy: number; dx: number; dy: number; left: number; right: number; reach: number;
  floor: number; top: number; crown: number; wings: [number[][], number[][]]; steep: [boolean, boolean];
}
export function cuttings(map: GameMap): Cutting[] {
  return walls(map).map((w) => ({ cx: w.cx, cy: w.cy, dx: w.dx, dy: w.dy, left: w.left, right: w.right, reach: w.reach, floor: w.z, top: w.z + w.top, crown: w.crown, wings: w.wings, steep: w.steep }));
}

/** A wing wall's top (data height) where it is k metres out from the face, or -Infinity past its ends. */
export function wingTop(wing: number[][], k: number): number {
  if (wing.length < 2 || k < wing[0][0] || k > wing[wing.length - 1][0]) return -Infinity;
  let i = 0;
  while (i < wing.length - 2 && wing[i + 1][0] < k) i++;
  const [k0, h0] = wing[i], [k1, h1] = wing[i + 1];
  return h0 + ((h1 - h0) * (k - k0)) / ((k1 - k0) || 1);
}

/** Whether data (x, y) is on or over a portal: its headwall and wing walls with a margin round
 *  them, the hill just behind the face, and the way out in front as far as a railway's cutting
 *  runs. The woods' canopy is laid over the ground under it, so over a deep cutting it came down
 *  the sides in sheets, filling it in front of the arch, and over the dug floor just inside the
 *  bore it hung in the tube. */
export function aroundPortals(map: GameMap): (x: number, y: number) => boolean {
  const ws = walls(map), M = 4, APPROACH = 40, BEHIND = 10;
  return (x, y) => ws.some((w) => {
    const rx = x - w.cx, ry = y - w.cy, out = -(rx * w.dx + ry * w.dy), s = rx * w.nx + ry * w.ny;
    return s > w.left - M && s < w.right + M && out > -BEHIND && out < Math.max(w.reach + M, APPROACH);
  });
}

/** Whether data (x, y) is on a cutting's banks, out to either side of a portal: wood there over
 *  ground steeper than a bank lies at by itself is over the cutting's side, and is left off. */
export function portalBanks(map: GameMap): (x: number, y: number) => boolean {
  const ws = walls(map), SIDE = 30, APPROACH = 40, BEHIND = 10;
  return (x, y) => ws.some((w) => {
    const rx = x - w.cx, ry = y - w.cy, out = -(rx * w.dx + ry * w.dy), s = rx * w.nx + ry * w.ny;
    return s > w.left - SIDE && s < w.right + SIDE && out > -BEHIND && out < Math.max(w.reach + SIDE, APPROACH);
  });
}

/** The upper hull of points in order along x: straight runs over them, never below one. */
function upperHull(pts: number[][]): number[][] {
  const out: number[][] = [];
  for (const p of pts) {
    while (out.length >= 2) {
      const a = out[out.length - 2], b = out[out.length - 1];
      if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0) out.pop(); else break;
    }
    out.push(p);
  }
  return out;
}

/** The height (scene Y) of the arch's crown over (x, y) (data) where that is inside a bore, else
 *  -Infinity: a stone face down from a lane over the roof, or along a headwall's foot, stops there
 *  rather than hanging down inside the tube. */
export function boreRoof(map: GameMap): (x: number, y: number) => number {
  const tn = map.d.tn ?? [];
  alignPortals(tn, map.d.b);
  return (x, y) => {
    let top = -Infinity;
    for (const t of tn) for (let i = 0; i + 1 < t.p.length; i++) {
      const a = t.p[i], b = t.p[i + 1], vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
      const reach = Math.max(boreHalf(t, i), boreHalf(t, i + 1)) + 0.3;
      if (l2 < 1e-6) continue;
      const f = ((x - a[0]) * vx + (y - a[1]) * vy) / l2;
      if (f < 0 || f > 1 || Math.abs((x - a[0]) * vy - (y - a[1]) * vx) / Math.sqrt(l2) > reach) continue;
      top = Math.max(top, a[2] + (b[2] - a[2]) * f + boreCrown(t) - map.z0);
    }
    return top;
  };
}
