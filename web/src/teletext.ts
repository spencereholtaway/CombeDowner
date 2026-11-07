// BathText '91: the menus (the main menu, pause, settings, linking a device, the wardrobe and the
// trophy cabinet) dressed as pages of a teletext service of the early nineties. Each page has the
// service's header row along the top (its page number, the service's name, and the date and time
// ticking over as they did on the telly), a title in double-height letters on a coloured band with a
// strip of block graphics under it, and its buttons coloured like the red, green, yellow and cyan
// Fastext keys. The main menu fills the screen, with the crest of Bath drawn in teletext blocks
// beside it. The look itself is in style.css (".tt"); this writes the pieces and keeps the clocks
// going.
//
// The crest is drawn here, block by block, on a small canvas (the game keeps no picture files): the
// shield, blue with the hot springs' two wavy white bars over the white of the city wall, its
// battlements standing up into the blue, St Paul's red sword down the middle, and a mural crown over it.
//
// Nothing here goes over the network.

export const SERVICE = "BathText '91";

/** Page numbers, as the service's index has them. */
export const PAGE = { menu: 100, pause: 101, settings: 200, link: 300, wardrobe: 400, trophies: 500, pub: 600, games: 700, cheats: 777, debug: 888 };

/** The header row along the top of a page: its number, the service, and the date and time (filled in by the clock). */
export function ttBar(page: number): string {
  return `<header class="ttbar"><span class="ttp">P${page}</span><span class="ttname">${SERVICE}</span><span class="ttno">${page}</span><span class="ttdate"></span><span class="ttclock"></span></header>`;
}

/** A page's title in double-height letters on its band. */
export function ttTitle(text: string, tag = "h2"): string {
  return `<${tag} class="tttitle"><span class="ttdh">${text}</span></${tag}>`;
}

// ---- the clock in every header row -------------------------------------------------------------------

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (n: number) => String(n).padStart(2, "0");

/** Bring the date and time up to date in every header row that's showing (a hidden one has no offsetParent). */
function tick() {
  const d = new Date();
  const date = `${DAYS[d.getDay()]} ${two(d.getDate())} ${MONTHS[d.getMonth()]}`;
  const time = `${two(d.getHours())}:${two(d.getMinutes())}/${two(d.getSeconds())}`;
  for (const bar of document.querySelectorAll<HTMLElement>(".ttbar")) {
    if (!bar.offsetParent) continue;
    const a = bar.querySelector(".ttdate"), b = bar.querySelector(".ttclock");
    if (a && a.textContent !== date) a.textContent = date;
    if (b) b.textContent = time;
  }
}

// ---- the crest, in blocks ----------------------------------------------------------------------------

/** Teletext's eight colours. */
const INK: Record<string, string> = { k: "#000", r: "#f00", g: "#0f0", y: "#ff0", b: "#00f", m: "#f0f", c: "#0ff", w: "#fff" };
/** The crest's size in blocks (teletext's "sixels": each character cell is two across and three down). */
const W = 36, H = 56;

/** The crest as rows of colour letters, "." for nothing. */
function crest(): string[][] {
  const g: string[][] = Array.from({ length: H }, () => Array(W).fill("."));
  const c = W / 2;
  // the mural crown: battlements along its top, a band of wall with three windows
  for (let y = 0; y <= 6; y++) for (let x = 10; x < 26; x++) {
    if (y <= 2 && Math.floor((x - 10) / 2) % 2) continue;
    g[y][x] = y >= 4 && y <= 5 && [12, 13, 17, 18, 22, 23].includes(x) ? "k" : "y";
  }
  // the shield: straight sides, then rounding in to a point
  const top = 8, side = 36, bottom = H - 1;
  const half = (y: number) => y <= side ? 14 : 14 * Math.cos(((y - side) / (bottom - side)) * Math.PI / 2);
  const inside = (x: number, y: number) => y >= top && y <= bottom && Math.abs(x + 0.5 - c) <= half(y);
  const wall = 31;   // where the battlements stand
  for (let y = top; y <= bottom; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    if (edge) { g[y][x] = "y"; continue; }
    // the city wall below, in white, its battlements standing up into the blue
    const merlon = y >= wall - 4 && Math.floor((x - 4) / 4) % 2 === 1;
    if (y >= wall || merlon) { g[y][x] = "w"; continue; }
    // the hot springs above: two wavy white bars on blue
    const v = y + (Math.sin(x * 0.75) > 0 ? 1 : 0);
    g[y][x] = (v >= 12 && v <= 14) || (v >= 19 && v <= 21) ? "w" : "b";
  }
  // St Paul's sword, over all: pommel, grip, cross guard, then the blade down to its point
  const put = (x: number, y: number, k: string) => { if (inside(x, y) && g[y][x] !== "y" || y < top) g[y][x] = k; };
  for (const x of [16, 17, 18, 19]) for (const y of [10, 11]) put(x, y, "y");
  for (let y = 12; y <= 15; y++) { put(17, y, "y"); put(18, y, "y"); }
  for (let x = 11; x <= 24; x++) for (const y of [16, 17]) put(x, y, "y");
  for (let y = 18; y <= 47; y++) { put(17, y, "r"); put(18, y, "r"); }
  put(17, 48, "r"); put(18, 48, "r"); put(17, 49, "r");
  return g;
}

/** Draw the crest, a block at a time, on a canvas (sized in the blocks' own proportions: a bit taller than wide). */
export function drawCrest(canvas: HTMLCanvasElement) {
  const bw = 6, bh = 7;
  canvas.width = W * bw; canvas.height = H * bh;
  const g = canvas.getContext("2d");
  if (!g) return;
  crest().forEach((row, y) => row.forEach((k, x) => {
    if (k === ".") return;
    g.fillStyle = INK[k];
    g.fillRect(x * bw, y * bh, bw, bh);
  }));
}

// Draw any crests the page already has (the main menu's), and keep the clocks going.
for (const c of document.querySelectorAll<HTMLCanvasElement>("canvas.ttcrest")) drawCrest(c);
tick();
setInterval(tick, 1000);
