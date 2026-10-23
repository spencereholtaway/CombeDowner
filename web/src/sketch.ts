// A sketch map: a rough inked drawing of a patch of town, as if someone had drawn it from memory on
// the back of an envelope, for the treasure trail's sketch leg (trail.ts). It's drawn from the same
// layers as the big map (minimap.ts): streets as wobbly ink lines (paths dashed), buildings as
// hatched blocks, water as a wash, a few trees as little clouds and a cross on any church, on
// paper with a coffee ring, and a red X where the tin is. No names. On hard trails there's no north
// arrow, and the sketch may be drawn turned round.
//
// It reads only the detailed village and the city-wide map, which every player has whole, so the
// same seed draws the same sketch on every machine, wherever they are.
//
// Who decides what: nobody; it's drawn from the trail's seed.
import { type Building, type GameMap, PATHS } from "./map";
import { rng } from "./quests";

const SIZE = 512;

export interface SketchAsk {
  cx: number; cz: number;       // the middle of the patch (scene x, z)
  span: number;                 // metres across
  x: number; z: number;         // the X
  turn: number;                 // quarter turns clockwise
  north: boolean;               // draw a north arrow
  seed: number;
}

export function drawSketch(map: GameMap, o: SketchAsk): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const g = c.getContext("2d")!, r = rng(o.seed);
  const k = (SIZE / o.span) * 0.95, a = (o.turn % 4) * (Math.PI / 2), ca = Math.cos(a), sa = Math.sin(a);
  const ph = r() * 100;
  // a slow seeded wobble, so a line drawn twice wobbles the same way
  const wob = (u: number, v: number) => [Math.sin(u * 0.045 + ph) * 2.2 + Math.sin(v * 0.11 + ph * 2) * 0.9, Math.cos(v * 0.05 + ph * 1.7) * 2.2 + Math.cos(u * 0.13 + ph) * 0.9];
  /** Scene (x, z) to the paper, turned and wobbled. */
  const P = (x: number, z: number): [number, number] => {
    const u = (x - o.cx) * k, v = (z - o.cz) * k, ru = u * ca - v * sa, rv = u * sa + v * ca;
    const [du, dv] = wob(ru, rv);
    return [SIZE / 2 + ru + du, SIZE / 2 + rv + dv];
  };
  const reach = o.span * 0.75, near = (x: number, z: number) => Math.abs(x - o.cx) < reach && Math.abs(z - o.cz) < reach;

  // the paper
  g.fillStyle = "#eadcb6"; g.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(90,60,20,${0.03 + r() * 0.06})`;
    g.fillRect(r() * SIZE, r() * SIZE, 1 + r() * 2, 1 + r() * 2);
  }
  const edge = g.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.3, SIZE / 2, SIZE / 2, SIZE * 0.72);
  edge.addColorStop(0, "rgba(120,80,30,0)"); edge.addColorStop(1, "rgba(120,80,30,0.45)");
  g.fillStyle = edge; g.fillRect(0, 0, SIZE, SIZE);

  /** A line through scene points, broken into short wobbly steps. */
  const ink = (pts: number[][]) => {
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = pts[i][0], z = -pts[i][1];
      if (i === 0) { g.moveTo(...P(x, z)); continue; }
      const px = pts[i - 1][0], pz = -pts[i - 1][1], steps = Math.max(1, Math.ceil(Math.hypot(x - px, z - pz) * k / 8));
      for (let s = 1; s <= steps; s++) g.lineTo(...P(px + (x - px) * s / steps, pz + (z - pz) * s / steps));
    }
  };
  const ring = (pts: number[][]) => { ink(pts); g.closePath(); };

  // water, as a pale wash
  g.fillStyle = "rgba(70,110,140,0.35)"; g.strokeStyle = "rgba(40,70,100,0.7)"; g.lineWidth = 1.2;
  for (const w of [...map.d.wp, ...map.wide?.wp ?? []]) {
    if (!w.r[0].some((q) => near(q[0], -q[1]))) continue;
    ring(w.r[0]); g.fill(); g.stroke();
  }
  // streets and paths
  g.lineCap = g.lineJoin = "round"; g.strokeStyle = "#3a2a18";
  for (const rd of [...map.d.rd, ...map.wide?.rd ?? []]) {
    if (!rd.p.some((q) => near(q[0], -q[1]))) continue;
    const path = PATHS.has(rd.c);
    g.setLineDash(path ? [4, 5] : []);
    g.lineWidth = path ? 1.2 : rd.c === "primary" || rd.c === "secondary" ? 4.5 : rd.c === "service" ? 1.8 : 3;
    ink(rd.p); g.stroke();
  }
  g.setLineDash([]);
  // buildings: hatched blocks, and a cross on a church
  const blocks: Building[] = [...map.d.bl.filter((b) => near(b.r[0][0][0], -b.r[0][0][1])), ...map.wide?.buildingsNear(o.cx, -o.cz, reach) ?? []];
  for (const b of blocks) {
    ring(b.r[0]);
    g.save(); g.clip();
    g.strokeStyle = "rgba(58,42,24,0.55)"; g.lineWidth = 1;
    const [bx, by] = P(b.r[0][0][0], -b.r[0][0][1]);
    g.beginPath();
    for (let d = -60; d <= 60; d += 5) { g.moveTo(bx + d - 60, by - 60); g.lineTo(bx + d + 60, by + 60); }
    g.stroke(); g.restore();
    g.strokeStyle = "#3a2a18"; g.lineWidth = 1.3; ring(b.r[0]); g.stroke();
    if (/church|chapel|abbey|cathedral/i.test(b.n)) {
      let x = 0, y = 0;
      for (const q of b.r[0]) { x += q[0]; y += q[1]; }
      const [cx, cy] = P(x / b.r[0].length, -y / b.r[0].length);
      g.fillStyle = "#eadcb6"; g.fillRect(cx - 7, cy - 10, 14, 20);
      g.strokeStyle = "#3a2a18"; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(cx, cy - 9); g.lineTo(cx, cy + 9); g.moveTo(cx - 6, cy - 3); g.lineTo(cx + 6, cy - 3); g.stroke();
    }
  }
  // a few trees, as little clouds
  const trees: number[][] = map.d.tr.filter((t) => near(t[0], -t[1]));
  if (map.wide) for (const i of map.wide.treesNear(o.cx, -o.cz, reach)) trees.push([map.wide.tr[i * 3], map.wide.tr[i * 3 + 1]]);
  g.strokeStyle = "#4a5a2a"; g.lineWidth = 1.2;
  for (let i = 0; i < trees.length; i += Math.max(1, Math.floor(trees.length / 40))) {
    const [tx, ty] = P(trees[i][0], -trees[i][1]);
    g.beginPath();
    for (let j = 0; j < 5; j++) { const t = (j / 5) * Math.PI * 2; g.moveTo(tx + Math.cos(t) * 4 + 3, ty + Math.sin(t) * 4); g.arc(tx + Math.cos(t) * 4, ty + Math.sin(t) * 4, 3, 0, Math.PI * 2); }
    g.stroke();
  }
  // a coffee ring, where someone put their mug down on it
  const mx = SIZE * (0.2 + r() * 0.6), my = SIZE * (0.2 + r() * 0.6), mr = 40 + r() * 20;
  g.strokeStyle = "rgba(110,70,30,0.28)"; g.lineWidth = 5;
  g.beginPath(); g.arc(mx, my, mr, r() * 6, r() * 6 + Math.PI * 1.7); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(mx + 2, my - 1, mr - 4, 0, Math.PI * 2); g.stroke();
  // X marks the spot
  const [xx, xy] = P(o.x, o.z);
  g.strokeStyle = "#b3261e"; g.lineWidth = 5; g.lineCap = "round";
  g.beginPath(); g.moveTo(xx - 11, xy - 11); g.lineTo(xx + 11, xy + 11); g.moveTo(xx + 11, xy - 11); g.lineTo(xx - 11, xy + 11); g.stroke();
  if (o.north) {
    // north, turned with the drawing
    const nx = SIZE - 44, ny = 50, ux = Math.sin(a), uy = -Math.cos(a);
    g.strokeStyle = g.fillStyle = "#3a2a18"; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(nx - ux * 22, ny - uy * 22); g.lineTo(nx + ux * 22, ny + uy * 22); g.stroke();
    g.beginPath(); g.moveTo(nx + ux * 26, ny + uy * 26); g.lineTo(nx + ux * 12 - uy * 7, ny + uy * 12 + ux * 7); g.lineTo(nx + ux * 12 + uy * 7, ny + uy * 12 - ux * 7); g.fill();
    g.font = "700 20px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("N", nx + ux * 38, ny + uy * 38);
  }
  return c;
}
