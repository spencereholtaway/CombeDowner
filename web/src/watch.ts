// The watch on your wrist, bottom left of the screen: a black square digital watch in the style of
// a G-Shock, its grey-green LCD showing the game's time of day (daylight.ts: the same for everyone,
// a whole day every 24 minutes), the day of the week and the date. The colon blinks every real
// second, and after dark the backlight glows blue-green so you can still read it. On a touch screen
// the watch makes way and the time shows as figures in the health strip.
//
// Who decides what: nobody. The time comes from the shared clock, so everyone's watch agrees.
// The face is drawn on a canvas in code, segment by segment, and only redrawn when what it shows
// changes.
import { nightNow, timeOfDay, watchDay } from "./daylight";

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
/** Which of the seven segments (a top, b top right, c bottom right, d bottom, e bottom left,
 *  f top left, g middle) each figure lights. */
const SEGS = [0b1111110, 0b0110000, 0b1101101, 0b1111001, 0b0110011, 0b1011011, 0b1011111, 0b1110000, 0b1111111, 0b1111011];
/** The LCD's size on screen, in CSS pixels. */
const W = 112, H = 58;

/** The calendar date on the watch: one game day per 24 minutes, the same for everyone. */
function gameDate(): Date {
  return new Date(watchDay() * 86400000);
}

/** One segment: a long hexagon from (x0, y0) to (x1, y1), t thick. */
function bar(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, t: number) {
  const h = t / 2;
  c.beginPath();
  if (y0 === y1) {
    c.moveTo(x0, y0); c.lineTo(x0 + h, y0 - h); c.lineTo(x1 - h, y0 - h); c.lineTo(x1, y0); c.lineTo(x1 - h, y0 + h); c.lineTo(x0 + h, y0 + h);
  } else {
    c.moveTo(x0, y0); c.lineTo(x0 + h, y0 + h); c.lineTo(x0 + h, y1 - h); c.lineTo(x0, y1); c.lineTo(x0 - h, y1 - h); c.lineTo(x0 - h, y0 + h);
  }
  c.closePath();
  c.fill();
}

/** A seven-segment figure, w by h with its top left at (x, y): the unlit segments faintly, as on a
 *  real LCD, then the lit ones dark. n < 0 shows it blank. */
function figure(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, n: number, ink: string, ghost: string) {
  const t = Math.max(1.6, w * 0.2), g = t * 0.28, m = y + h / 2;
  const segs: [number, number, number, number][] = [
    [x + t / 2 + g, y + t / 2, x + w - t / 2 - g, y + t / 2],          // a
    [x + w - t / 2, y + t / 2 + g, x + w - t / 2, m - g],                // b
    [x + w - t / 2, m + g, x + w - t / 2, y + h - t / 2 - g],            // c
    [x + t / 2 + g, y + h - t / 2, x + w - t / 2 - g, y + h - t / 2],  // d
    [x + t / 2, m + g, x + t / 2, y + h - t / 2 - g],                    // e
    [x + t / 2, y + t / 2 + g, x + t / 2, m - g],                        // f
    [x + t / 2 + g, m, x + w - t / 2 - g, m],                            // g
  ];
  const lit = n >= 0 ? SEGS[n % 10] : 0;
  segs.forEach((s, i) => {
    c.fillStyle = lit & (64 >> i) ? ink : ghost;
    bar(c, s[0], s[1], s[2], s[3], t);
  });
}

export class Watch {
  private c: CanvasRenderingContext2D | null;
  private shown = "";
  private told = "";

  constructor(private canvas: HTMLCanvasElement) {
    this.c = canvas.getContext("2d");
  }

  /** Called each frame; redraws only when the minute, the colon or the light changes. */
  update() {
    const c = this.c;
    if (!c) return;
    const mins = Math.floor(timeOfDay() * 24 * 60), date = gameDate();
    const colon = Date.now() % 1000 < 500, light = nightNow() > 0.5;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    // a touch screen has no room for the watch, so the health strip shows the time in figures instead
    const told = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    if (told !== this.told) { this.told = told; const t = document.getElementById("hptime"); if (t) t.textContent = told; }
    const key = `${mins} ${date.getUTCDate()} ${colon} ${light} ${dpr}`;
    if (key === this.shown && this.canvas.width === Math.round(W * dpr)) return;
    this.shown = key;
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.canvas.closest("#watch")?.classList.toggle("lit", light);

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the glass: grey-green by day, the Illuminator's blue-green glow after dark
    const bg = c.createLinearGradient(0, 0, 0, H);
    if (light) { bg.addColorStop(0, "#9ff0e2"); bg.addColorStop(1, "#4fc2b4"); }
    else { bg.addColorStop(0, "#b7c2a6"); bg.addColorStop(1, "#8e9a80"); }
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    const ink = light ? "#0f2a2a" : "#1b2016", ghost = light ? "rgba(15, 42, 42, 0.08)" : "rgba(27, 32, 22, 0.07)";

    // the top row: day of the week, then month and date
    c.setTransform(dpr, 0, -0.1 * dpr, dpr, 0, 0); // the figures lean forward a little, like the real thing
    c.fillStyle = ink;
    c.font = "15px VT323, ui-monospace, Menlo, monospace";
    c.textBaseline = "top";
    c.fillText(DAYS[date.getUTCDay()], 7, 3);
    const month = date.getUTCMonth() + 1, day = date.getUTCDate();
    const fw = 6, fh = 11, top = 5;
    figure(c, 56, top, fw, fh, month >= 10 ? 1 : -1, ink, ghost);
    figure(c, 64, top, fw, fh, month % 10, ink, ghost);
    c.fillStyle = ink; c.fillRect(73, top + fh / 2 - 0.8, 4, 1.6);
    figure(c, 80, top, fw, fh, Math.floor(day / 10), ink, ghost);
    figure(c, 88, top, fw, fh, day % 10, ink, ghost);
    // a thin rule under the top row, printed on the glass
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = light ? "rgba(15, 42, 42, 0.35)" : "rgba(27, 32, 22, 0.35)";
    c.fillRect(4, 20, W - 8, 1);

    // the time, big: hours and minutes with the colon between, and 24H beside it
    c.setTransform(dpr, 0, -0.1 * dpr, dpr, 0, 0);
    const h = Math.floor(mins / 60), m = mins % 60, bw = 15, bh = 28, by = 25;
    figure(c, 10, by, bw, bh, h >= 10 ? Math.floor(h / 10) : -1, ink, ghost);
    figure(c, 29, by, bw, bh, h % 10, ink, ghost);
    c.fillStyle = colon ? ink : ghost;
    c.fillRect(48.5, by + 7, 3, 3); c.fillRect(48.5, by + bh - 10, 3, 3);
    figure(c, 55, by, bw, bh, Math.floor(m / 10), ink, ghost);
    figure(c, 74, by, bw, bh, m % 10, ink, ghost);
    c.fillStyle = ink;
    c.font = "11px VT323, ui-monospace, Menlo, monospace";
    c.fillText("24H", 96, by + bh - 9);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
}
