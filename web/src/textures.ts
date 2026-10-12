// Procedural canvas textures, so the game ships no image files.
import * as THREE from "three";

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")!];
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Bath stone ashlar. Kept near white so vertex colours can tint each building. */
function stone(g: CanvasRenderingContext2D, w: number, h: number, r: () => number) {
  g.fillStyle = "#f2ead8";
  g.fillRect(0, 0, w, h);
  const course = h / 8;
  for (let row = 0; row < 8; row++) {
    const y = row * course, off = (row % 2) * 0.5;
    let x = -off * 64;
    while (x < w) {
      const bw = 48 + r() * 40, l = 225 + r() * 25;
      g.fillStyle = `rgb(${l},${l - 8 - r() * 6},${l - 26 - r() * 10})`;
      g.fillRect(x + 1, y + 1, bw - 2, course - 2);
      x += bw;
    }
    g.fillStyle = "rgba(120,100,70,0.35)";
    g.fillRect(0, y, w, 1.5);
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? "90,80,60" : "255,250,235"},${0.05 + r() * 0.08})`;
    g.fillRect(r() * w, r() * h, 2, 2);
  }
}

/** Brick in stretcher bond, near white so vertex colours set red or buff. */
function brick(g: CanvasRenderingContext2D, w: number, h: number, r: () => number) {
  g.fillStyle = "#d9d4cc";
  g.fillRect(0, 0, w, h);
  const course = h / 26, bw = w / 6;
  for (let row = 0; row < 26; row++) {
    const off = (row % 2) * bw / 2;
    for (let x = -off; x < w; x += bw) {
      const l = 215 + r() * 40;
      g.fillStyle = `rgb(${l},${l - 4},${l - 8})`;
      g.fillRect(x + 1, row * course + 1, bw - 2, course - 1.5);
    }
  }
}

/** Smooth render with faint weathering. */
function render(g: CanvasRenderingContext2D, w: number, h: number, r: () => number) {
  g.fillStyle = "#f4f2ee";
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? "120,115,105" : "255,255,255"},${0.03 + r() * 0.05})`;
    g.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4);
  }
}

/** One bay of one storey (3.4 m wide, one storey tall), optionally with a sash window. */
export function wall(kind: "stone" | "brick" | "render", withWindow: boolean): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(kind === "stone" ? 7 : kind === "brick" ? 17 : 27);
  if (kind === "stone") stone(g, 256, 256, r); else if (kind === "brick") brick(g, 256, 256, r); else render(g, 256, 256, r);
  if (withWindow) sash(g, kind);
  return tex(c);
}

/** A rusticated ground floor: ashlar cut with deep horizontal channels, with a sash window. */
export function rusticated(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  stone(g, 256, 256, rng(11));
  for (let y = 0; y < 256; y += 32) {
    g.fillStyle = "rgba(70,55,35,0.55)"; g.fillRect(0, y, 256, 4);
    g.fillStyle = "rgba(255,248,230,0.35)"; g.fillRect(0, y + 4, 256, 2);
  }
  sash(g, "stone");
  return tex(c);
}

/** A Doric frieze: triglyphs (grooved blocks) between plain metopes. u covers one bay. */
export function frieze(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64);
  stone(g, 256, 64, rng(13));
  for (const x of [0, 128]) {
    g.fillStyle = "rgba(90,70,45,0.18)"; g.fillRect(x - 18, 0, 36, 64);
    g.fillStyle = "rgba(70,55,35,0.5)";
    for (const dx of [-10, 6]) g.fillRect(x + dx, 4, 4, 56);
  }
  g.fillStyle = "rgba(255,248,230,0.4)";
  g.beginPath(); g.arc(64, 32, 14, 0, Math.PI * 2); g.arc(192, 32, 14, 0, Math.PI * 2); g.fill();   // emblems in the metopes
  return tex(c);
}

/** A Georgian sash window with lintel and sill, in the middle of a bay texture. */
function sash(g: CanvasRenderingContext2D, kind: "stone" | "brick" | "render") {
  const wx = 82, wy = 58, ww = 92, wh = 128;
  g.fillStyle = kind === "brick" ? "#b9b2a6" : "#d9cdb0"; g.fillRect(wx - 8, wy - 12, ww + 16, 12);   // lintel
  g.fillStyle = "#e6e0d2"; g.fillRect(wx - 4, wy - 2, ww + 8, wh + 4);
  const glass = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
  glass.addColorStop(0, "#3d4c5a"); glass.addColorStop(0.55, "#22303c"); glass.addColorStop(1, "#4d6070");
  g.fillStyle = glass; g.fillRect(wx, wy, ww, wh);
  g.fillStyle = "#ece8de";
  g.fillRect(wx, wy + wh / 2 - 3, ww, 6);
  g.fillRect(wx + ww / 2 - 2, wy, 4, wh);
  if (kind === "stone") for (const f of [0.25, 0.75]) g.fillRect(wx, wy + wh * f - 1.5, ww, 3);   // Georgian glazing bars
  g.fillStyle = kind === "brick" ? "#c4bdb1" : "#d4c7a8"; g.fillRect(wx - 10, wy + wh + 2, ww + 20, 9);   // sill
}

/** Roof tiles in rows, near white for tinting. u covers 2 m, v covers 2 m. */
export function roofTiles(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(3);
  g.fillStyle = "#c9c9c9"; g.fillRect(0, 0, 256, 256);
  const rows = 10, rh = 256 / rows;
  for (let row = 0; row < rows; row++) {
    const off = (row % 2) * 13;
    for (let x = -off; x < 256; x += 26) {
      const l = 200 + r() * 45;
      g.fillStyle = `rgb(${l},${l},${l})`;
      g.fillRect(x + 1, row * rh, 24, rh - 2);
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(x + 1, row * rh + rh - 4, 24, 2);
    }
  }
  return tex(c);
}

/** Speckled detail multiplied over the ground colours. */
export function groundDetail(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(5);
  g.fillStyle = "#d8d8d8"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const l = 150 + r() * 105;
    g.fillStyle = `rgba(${l},${l},${l},0.7)`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 3);
  }
  return tex(c);
}

/** Asphalt with faint aggregate. */
export function asphalt(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(9);
  g.fillStyle = "#e0e0e0"; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 3000; i++) {
    const l = 170 + r() * 85;
    g.fillStyle = `rgb(${l},${l},${l})`;
    g.fillRect(r() * 128, r() * 128, 1, 1);
  }
  return tex(c);
}

export function bark(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 128);
  const r = rng(13);
  g.fillStyle = "#cfc4b4"; g.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(60,45,30,${0.2 + r() * 0.3})`;
    g.fillRect(r() * 64, 0, 1 + r() * 3, 128);
  }
  return tex(c);
}

/** Label sprite texture for a player's name. */
export function nameLabel(text: string, colour: string): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64);
  g.font = "600 30px system-ui, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  const w = Math.min(250, g.measureText(text).width + 28);
  g.fillStyle = "rgba(10,14,18,0.6)";
  g.beginPath(); g.roundRect(128 - w / 2, 10, w, 44, 12); g.fill();
  g.fillStyle = colour;
  g.fillText(text, 128, 33);
  return tex(c);
}

/** Close-board fence: vertical boards with a rail line. u covers 2 m, v covers 2 m. */
export function boards(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(19);
  for (let x = 0; x < 128; x += 8) {
    const l = 200 + r() * 50;
    g.fillStyle = `rgb(${l},${l - 6},${l - 14})`;
    g.fillRect(x, 0, 8, 128);
    g.fillStyle = "rgba(60,40,20,0.35)";
    g.fillRect(x + 7, 0, 1, 128);
  }
  g.fillStyle = "rgba(60,40,20,0.25)";
  g.fillRect(0, 20, 128, 3);
  return tex(c);
}

/** Leafy hedge surface. */
export function leaves(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(23);
  g.fillStyle = "#7d8f6a"; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2600; i++) {
    const l = 120 + r() * 135;
    g.fillStyle = `rgba(${l * 0.8},${l},${l * 0.65},0.8)`;
    g.beginPath(); g.arc(r() * 128, r() * 128, 1 + r() * 2.5, 0, Math.PI * 2); g.fill();
  }
  return tex(c);
}

/** Iron railings: bars with transparent gaps (used with alphaTest). u covers 2 m, v covers 2 m. */
export function railings(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = "#e8e8e8";
  // v runs from 0.4 m below ground (bottom of the canvas) upwards, 64 px per metre
  const y = (m: number) => 128 - (m + 0.4) * 64;
  for (let x = 2; x < 128; x += 8) g.fillRect(x, y(0.95), 3, 128 - y(0.95));   // bars up to 0.95 m
  g.fillRect(0, y(0.85), 128, 4); g.fillRect(0, y(0.15), 128, 4);                 // rails
  for (let x = 2; x < 128; x += 8) { g.beginPath(); g.moveTo(x - 1, y(0.95)); g.lineTo(x + 1.5, y(1.02)); g.lineTo(x + 4, y(0.95)); g.fill(); }  // spear tops
  return tex(c);
}

/**
 * Blood splats, four to a 2x2 atlas: a pool with spatter round it, two spattered splashes and
 * a small drip. Red on transparent.
 */
export function bloodSplats(): THREE.CanvasTexture {
  const S = 256, T = S / 2;
  const [c, g] = canvas(S, S);
  const r = rng(29);
  const blob = (x: number, y: number, rad: number, col: string) => {
    g.fillStyle = col;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  };
  for (let tile = 0; tile < 4; tile++) {
    const ox = (tile % 2) * T, oy = Math.floor(tile / 2) * T, cx = ox + T / 2, cy = oy + T / 2;
    g.save();
    g.beginPath(); g.rect(ox + 1, oy + 1, T - 2, T - 2); g.clip();
    const main = tile === 0 ? 30 : tile === 3 ? 16 : 20;
    // the body of the splat: overlapping lumps
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, d = r() * main * 0.55;
      blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, main * (0.45 + r() * 0.4), "rgba(112, 6, 8, 0.92)");
    }
    // darker, wetter middle
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, main);
    grad.addColorStop(0, "rgba(70, 0, 2, 0.75)");
    grad.addColorStop(1, "rgba(70, 0, 2, 0)");
    g.fillStyle = grad;
    g.fillRect(ox, oy, T, T);
    // spatter flung outwards, mostly one way on the splashes
    const drops = tile === 3 ? 6 : 26;
    for (let i = 0; i < drops; i++) {
      const a = tile === 1 || tile === 2 ? -Math.PI / 2 + (r() - 0.5) * 1.6 : r() * Math.PI * 2;
      const d = main * (0.9 + r() * 1.5), rad = 1 + r() * 4.5 * (1 - d / (main * 2.6));
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      blob(x, y, Math.max(0.8, rad), "rgba(118, 8, 10, 0.95)");
      if (r() < 0.35) {   // a streak back towards the middle
        g.strokeStyle = "rgba(118, 8, 10, 0.8)"; g.lineWidth = Math.max(0.8, rad * 0.8);
        g.beginPath(); g.moveTo(x, y); g.lineTo(cx + Math.cos(a) * main * 0.7, cy + Math.sin(a) * main * 0.7); g.stroke();
      }
    }
    g.restore();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/**
 * Bloody shoe prints, four to a 2x2 atlas: left, right, then a smudged left and right.
 * Toes point up the texture.
 */
export function shoePrints(): THREE.CanvasTexture {
  const S = 256, T = S / 2;
  const [c, g] = canvas(S, S);
  const r = rng(51);
  for (let tile = 0; tile < 4; tile++) {
    const ox = (tile % 2) * T, oy = Math.floor(tile / 2) * T, cx = ox + T / 2, cy = oy + T / 2;
    const side = tile % 2 === 0 ? -1 : 1, smudge = tile >= 2;
    g.save();
    g.beginPath(); g.rect(ox, oy, T, T); g.clip();
    g.translate(cx, cy);
    g.fillStyle = "rgba(105, 6, 8, 0.95)";
    // forefoot, bulging to the big-toe side, then the heel
    g.beginPath(); g.ellipse(side * 3, -22, 19, 30, side * 0.08, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(side * -1, 34, 15, 19, 0, 0, Math.PI * 2); g.fill();
    // tread: cut stripes out of the sole
    g.globalCompositeOperation = "destination-out";
    g.strokeStyle = "rgba(0,0,0,0.85)"; g.lineWidth = 2.5;
    for (let y = -52; y < 56; y += 7) { g.beginPath(); g.moveTo(-22, y); g.lineTo(22, y + 3); g.stroke(); }
    // patchy where the shoe was drying out
    for (let i = 0; i < (smudge ? 70 : 30); i++) {
      g.fillStyle = `rgba(0,0,0,${0.4 + r() * 0.6})`;
      g.beginPath(); g.arc((r() - 0.5) * 44, (r() - 0.5) * 112, 1.5 + r() * (smudge ? 7 : 4), 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
