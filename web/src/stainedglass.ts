// Stained glass, drawn on canvases: cats as angels in leaded glass, haloed and winged with their paws
// together, in the jewel colours of a Victorian church window, the cats in the coats the street cats
// wear (cats.ts). paintLight fills one light of a window with a picture, so every stained glass in
// the game comes from it.
//
// churchGlass is the map's churches' glass (world.ts draws it into the walls of every building the
// map says is a church): a few different lancets side by side and a rose window, in one texture.
// It is the same for everyone and decides nothing over the network.
import * as THREE from "three";
import * as TX from "./textures";
import { COATS } from "./catcoats";

const LEAD = "#1b1712";
const GROUNDS = ["#1f3fa8", "#b3122a", "#1f7a3a", "#5a2a9a", "#1d5f8a"];
const ROBES = ["#b3122a", "#1f7a3a", "#5a2a9a", "#1f3fa8", "#c2591a", "#e8e2d0"];
const WINGS = ["#f2eee2", "#f0c84a", "#bcd8f0", "#f2eee2"];
const GOLD = "#f2c53a";
/** Tabby, plain, tuxedo and Siamese: the coats that read best in glass. */
const CAT_COATS = [...COATS[0], ...COATS[1], ...COATS[2], ...COATS[3]];

/**
 * One light of a window, filling the rectangle x, y, w, h (the caller clips it to the opening): a
 * border of coloured glass, a cat angel in the middle and a little picture under it (a fish, a ball
 * of wool or a mouse), a paw print up in the head, all leaded. Pictures differ by seed.
 */
export function paintLight(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number) {
  let mix = Math.imul(seed + 1, 0x9e3779b1); mix ^= mix >>> 15; mix = Math.imul(mix, 0x85ebca6b); mix ^= mix >>> 13;
  const r = TX.rng(mix), pick = <T,>(a: T[]) => a[Math.floor(r() * a.length) % a.length];
  const ground = GROUNDS[seed % GROUNDS.length], robe = pick(ROBES.filter((c) => c !== ground)), wing = pick(WINGS);
  const [coat, mark] = pick(CAT_COATS), tux = COATS[2].some((c) => c[0] === coat && c[1] === mark);
  const lead = Math.max(1.5, w * 0.035);
  g.save();
  g.translate(x, y);
  g.lineJoin = "round"; g.lineCap = "round";
  const edge = (fill: string, width = lead) => { g.fillStyle = fill; g.fill(); g.lineWidth = width; g.strokeStyle = LEAD; g.stroke(); };

  // the border: squares of ruby and gold round a field of the ground colour
  const b = w * 0.1;
  for (let k = 0, yy = 0; yy < h; k++, yy += b * 1.6) {
    for (const xx of [0, w - b]) { g.beginPath(); g.rect(xx, yy, b, b * 1.6); edge(k % 2 ? GOLD : ground === "#b3122a" ? "#1f3fa8" : "#b3122a"); }
  }
  g.beginPath(); g.rect(b, 0, w - 2 * b, h); edge(ground);
  // quarries: diamond leading across the ground, faint so the picture stands out
  g.save(); g.beginPath(); g.rect(b, 0, w - 2 * b, h); g.clip();
  g.lineWidth = lead * 0.5; g.strokeStyle = "rgba(20,16,12,0.55)";
  const q = w * 0.22;
  for (let d = -h; d < h + w; d += q) { g.beginPath(); g.moveTo(d, 0); g.lineTo(d + h, h); g.moveTo(d, h); g.lineTo(d + h, 0); g.stroke(); }
  g.restore();

  const cx = w / 2;
  // a paw print in the head of the light
  const py = h * 0.12, pr = w * 0.1;
  g.beginPath(); g.ellipse(cx, py + pr * 0.4, pr, pr * 0.8, 0, 0, Math.PI * 2); edge("#f2a6b8");
  for (const [dx, dy] of [[-1.1, -0.7], [-0.4, -1.3], [0.4, -1.3], [1.1, -0.7]]) {
    g.beginPath(); g.arc(cx + dx * pr, py + dy * pr, pr * 0.38, 0, Math.PI * 2); edge("#f2a6b8", lead * 0.8);
  }
  // a saddle bar across, top and bottom of the main panel
  const top = h * 0.24, bottom = h * 0.8;
  g.lineWidth = lead * 1.4; g.strokeStyle = LEAD;
  for (const yy of [top, bottom]) { g.beginPath(); g.moveTo(b, yy); g.lineTo(w - b, yy); g.stroke(); }

  // the angel: wings behind, a halo, the robe, the head with its ears, paws together at the chest
  const ph = bottom - top, hr = w * 0.2, hy = top + ph * 0.27;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * w * 0.06, hy + hr * 1.3);
    g.bezierCurveTo(cx + s * w * 0.3, hy - hr * 1.6, cx + s * w * 0.5, hy - hr * 0.6, cx + s * w * 0.38, hy + ph * 0.18);
    g.bezierCurveTo(cx + s * w * 0.34, hy + ph * 0.36, cx + s * w * 0.2, hy + ph * 0.42, cx + s * w * 0.08, hy + ph * 0.3);
    g.closePath(); edge(wing);
    g.lineWidth = lead * 0.7;
    for (const f of [0.35, 0.65]) {
      g.beginPath(); g.moveTo(cx + s * w * 0.1, hy + hr * 1.6 + ph * 0.1 * f);
      g.lineTo(cx + s * w * (0.2 + 0.18 * f), hy + ph * (0.1 + 0.25 * f)); g.stroke();
    }
  }
  g.beginPath(); g.arc(cx, hy - hr * 0.25, hr * 1.5, 0, Math.PI * 2); edge(GOLD);
  g.beginPath(); g.arc(cx, hy - hr * 0.25, hr * 1.2, 0, Math.PI * 2); g.lineWidth = lead * 0.6; g.stroke();
  // the robe, and the tail curling out from under it
  const rb = bottom - ph * 0.05;
  g.beginPath();
  g.moveTo(cx + w * 0.3, rb); g.quadraticCurveTo(cx + w * 0.42, rb + ph * 0.04, cx + w * 0.4, rb - ph * 0.12);
  g.lineWidth = w * 0.09; g.strokeStyle = LEAD; g.stroke(); g.lineWidth = w * 0.09 - lead * 1.6; g.strokeStyle = coat; g.stroke();
  g.beginPath();
  g.moveTo(cx - w * 0.13, hy + hr * 0.9); g.lineTo(cx + w * 0.13, hy + hr * 0.9);
  g.quadraticCurveTo(cx + w * 0.2, rb - ph * 0.3, cx + w * 0.28, rb);
  g.lineTo(cx - w * 0.28, rb);
  g.quadraticCurveTo(cx - w * 0.2, rb - ph * 0.3, cx - w * 0.13, hy + hr * 0.9);
  edge(robe);
  g.lineWidth = lead * 0.7;
  for (const f of [-0.1, 0.1]) { g.beginPath(); g.moveTo(cx + f * w * 0.6, hy + hr * 3); g.lineTo(cx + f * w * 1.6, rb); g.stroke(); }
  // the paws, held up together
  for (const s of [-1, 1]) {
    g.beginPath(); g.ellipse(cx + s * hr * 0.32, hy + hr * 2.3, hr * 0.34, hr * 0.62, s * 0.25, 0, Math.PI * 2); edge(tux ? "#f4f3ef" : coat, lead * 0.8);
  }
  // ears, then the head over them
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * hr * 0.25, hy - hr * 0.8); g.lineTo(cx + s * hr * 0.95, hy - hr * 1.45); g.lineTo(cx + s * hr * 0.95, hy - hr * 0.2);
    g.closePath(); edge(coat === mark ? coat : mark);
    g.beginPath();
    g.moveTo(cx + s * hr * 0.45, hy - hr * 0.7); g.lineTo(cx + s * hr * 0.85, hy - hr * 1.1); g.lineTo(cx + s * hr * 0.85, hy - hr * 0.45);
    g.closePath(); g.fillStyle = "#f2a6b8"; g.fill();
  }
  g.beginPath(); g.ellipse(cx, hy, hr, hr * 0.92, 0, 0, Math.PI * 2); edge(coat);
  if (tux) { g.beginPath(); g.ellipse(cx, hy + hr * 0.45, hr * 0.55, hr * 0.42, 0, 0, Math.PI * 2); g.fillStyle = "#f4f3ef"; g.fill(); }
  else if (coat !== mark) {
    // tabby stripes on the brow, or a Siamese's dark mask
    g.fillStyle = mark;
    if (COATS[3].some((c) => c[0] === coat)) { g.beginPath(); g.ellipse(cx, hy + hr * 0.3, hr * 0.5, hr * 0.5, 0, 0, Math.PI * 2); g.fill(); }
    else for (const dx of [-0.3, 0, 0.3]) g.fillRect(cx + dx * hr - hr * 0.07, hy - hr * 0.85, hr * 0.14, hr * 0.45);
  }
  const eye = pick(["#7ad04a", "#f0b020", "#4ab0e8"]);
  for (const s of [-1, 1]) {
    g.beginPath(); g.ellipse(cx + s * hr * 0.4, hy - hr * 0.05, hr * 0.24, hr * 0.2, 0, 0, Math.PI * 2); edge(eye, lead * 0.7);
    g.fillStyle = LEAD; g.fillRect(cx + s * hr * 0.4 - hr * 0.05, hy - hr * 0.22, hr * 0.1, hr * 0.34);
  }
  g.beginPath(); g.moveTo(cx - hr * 0.14, hy + hr * 0.28); g.lineTo(cx + hr * 0.14, hy + hr * 0.28); g.lineTo(cx, hy + hr * 0.45); g.closePath();
  g.fillStyle = "#e87a90"; g.fill();
  g.beginPath(); g.ellipse(cx, hy, hr, hr * 0.92, 0, 0, Math.PI * 2); g.lineWidth = lead; g.strokeStyle = LEAD; g.stroke();

  // under the angel, on its own panel: a fish, a ball of wool or a mouse
  const by = (bottom + h) / 2, s = w * 0.2, what = Math.floor(r() * 3);
  g.beginPath(); g.rect(b, bottom, w - 2 * b, h - bottom); edge(what === 0 ? "#1d5f8a" : "#1f7a3a");
  if (what === 0) {
    g.beginPath(); g.ellipse(cx - s * 0.2, by, s, s * 0.5, 0, 0, Math.PI * 2); edge("#e8823a");
    g.beginPath(); g.moveTo(cx + s * 0.7, by); g.lineTo(cx + s * 1.4, by - s * 0.5); g.lineTo(cx + s * 1.4, by + s * 0.5); g.closePath(); edge("#e8823a");
    g.fillStyle = LEAD; g.fillRect(cx - s * 0.8, by - s * 0.15, s * 0.16, s * 0.16);
  } else if (what === 1) {
    g.beginPath(); g.arc(cx, by, s * 0.8, 0, Math.PI * 2); edge("#d0283a");
    g.lineWidth = lead * 0.7;
    for (const a of [-0.5, 0, 0.5]) { g.beginPath(); g.arc(cx + a * s, by, s * 0.8, -1.1, 1.1); g.stroke(); }
  } else {
    g.beginPath(); g.ellipse(cx, by, s * 0.9, s * 0.5, 0, 0, Math.PI * 2); edge("#9aa0a8");
    g.beginPath(); g.arc(cx - s * 0.6, by - s * 0.5, s * 0.3, 0, Math.PI * 2); edge("#f2a6b8", lead * 0.7);
    g.beginPath(); g.moveTo(cx + s * 0.85, by); g.quadraticCurveTo(cx + s * 1.5, by - s * 0.6, cx + s * 1.2, by + s * 0.4);
    g.lineWidth = lead; g.stroke();
  }
  g.restore();
}

/** A rose window filling a circle: a cat's face in the middle and a ring of cats' heads round it. */
function paintRose(g: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
  const lead = Math.max(1.5, R * 0.035), N = 8;
  const edge = (fill: string, width = lead) => { g.fillStyle = fill; g.fill(); g.lineWidth = width; g.strokeStyle = LEAD; g.stroke(); };
  g.lineJoin = "round";
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); edge("#1f3fa8");
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, a0, a1); g.closePath(); edge(k % 2 ? "#b3122a" : "#1f3fa8");
  }
  // a cat's head in each petal, gold on the glass
  for (let k = 0; k < N; k++) {
    const a = ((k + 0.5) / N) * Math.PI * 2, hx = cx + Math.cos(a) * R * 0.7, hy = cy + Math.sin(a) * R * 0.7, hr = R * 0.14;
    const [coat] = CAT_COATS[(k * 3) % CAT_COATS.length];
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(hx + s * hr * 0.2, hy - hr * 0.7); g.lineTo(hx + s * hr * 0.95, hy - hr * 1.45); g.lineTo(hx + s * hr * 0.95, hy - hr * 0.1); g.closePath(); edge(coat, lead * 0.8);
    }
    g.beginPath(); g.arc(hx, hy, hr, 0, Math.PI * 2); edge(coat, lead * 0.8);
  }
  // the middle: a haloed cat's face
  const hr = R * 0.3;
  g.beginPath(); g.arc(cx, cy, R * 0.45, 0, Math.PI * 2); edge(GOLD);
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(cx + s * hr * 0.25, cy - hr * 0.8); g.lineTo(cx + s * hr * 0.95, cy - hr * 1.4); g.lineTo(cx + s * hr * 0.95, cy - hr * 0.2); g.closePath(); edge("#d98a3c");
  }
  g.beginPath(); g.arc(cx, cy, hr, 0, Math.PI * 2); edge("#d98a3c");
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * hr * 0.4, cy - hr * 0.05, hr * 0.24, hr * 0.2, 0, 0, Math.PI * 2); edge("#7ad04a", lead * 0.7); }
  g.beginPath(); g.moveTo(cx - hr * 0.14, cy + hr * 0.3); g.lineTo(cx + hr * 0.14, cy + hr * 0.3); g.lineTo(cx, cy + hr * 0.48); g.closePath(); g.fillStyle = "#e87a90"; g.fill();
}

/** How many different lancets churchGlass has; the rose is the slot after them. */
export const LANCETS = 4;

let atlas: THREE.DataTexture | null = null;
/**
 * The churches' windows, one slot each across the texture: LANCETS tall pointed lancets in their
 * stone surrounds, the glass from a tenth to nine tenths of the slot's height and a little over a
 * quarter of its width (world.ts maps a slot to one bay of wall and the band its row of windows sits
 * in), then a rose window filling its slot. Alpha says what each texel is: 0 the wall round the window, a half the dressed
 * stone of its surround (tinted like the wall), whole the glass (in its own colours, lit after dark).
 */
export function churchGlass(): THREE.DataTexture {
  if (atlas) return atlas;
  const SW = 512, SH = 512, slots = LANCETS + 1, [c, g] = TX.canvas(SW * slots, SH);
  const STONE = "rgba(240,232,214,0.5)";
  for (let k = 0; k < LANCETS; k++) {
    const x0 = k * SW + SW * 0.36, x1 = k * SW + SW * 0.64, w = x1 - x0, foot = SH * 0.9, apex = SH * 0.1, spring = apex + w * 0.9;
    const arch = (i: number) => {
      g.beginPath();
      g.moveTo(x0 - i, foot); g.lineTo(x0 - i, spring);
      g.quadraticCurveTo(x0 - i, apex + (spring - apex) * 0.25 - i * 0.5, (x0 + x1) / 2, apex - i);
      g.quadraticCurveTo(x1 + i, apex + (spring - apex) * 0.25 - i * 0.5, x1 + i, spring);
      g.lineTo(x1 + i, foot); g.closePath();
    };
    g.fillStyle = STONE;
    arch(12); g.fill();
    g.fillRect(x0 - 22, foot, w + 44, 14);   // the sill
    g.save(); arch(0); g.clip(); g.clearRect(k * SW, 0, SW, SH);
    paintLight(g, x0, apex, w, foot - apex, k + 1);
    g.restore();
  }
  g.save();
  g.translate(LANCETS * SW + SW / 2, SH / 2);
  g.fillStyle = STONE; g.beginPath(); g.arc(0, 0, SW * 0.5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(0, 0, SW * 0.44, 0, Math.PI * 2); g.clip(); g.clearRect(-SW, -SH, 2 * SW, 2 * SH);
  paintRose(g, 0, 0, SW * 0.44);
  g.restore();
  atlas = shrink(c, (SW / 2) * slots, SH / 2);
  return atlas;
}

/** The drawing at w x h, its colours on a small palette like TX.pixelTex, its alpha in three steps,
 *  and the wall's texels given the surround's colour so the window's edges don't darken far off. */
function shrink(src: HTMLCanvasElement, w: number, h: number): THREE.DataTexture {
  const [, g] = TX.canvas(w, h);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, out = new Uint8Array(w * h * 4), r = TX.rng(53), step = 255 / 28;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, o = ((h - 1 - y) * w + x) * 4, a = d[i + 3];
    if (a < 64) { out.set([240, 232, 214, 0], o); continue; }
    const n = (r() - 0.5) * step * 0.9;
    for (let ch = 0; ch < 3; ch++) out[o + ch] = Math.min(255, Math.max(0, Math.round((d[i + ch] + n) / step) * step));
    out[o + 3] = a < 192 ? 128 : 255;
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}
